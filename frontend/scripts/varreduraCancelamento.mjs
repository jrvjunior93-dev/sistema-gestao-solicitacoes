#!/usr/bin/env node
/**
 * VARREDURA — "onde o cancelamento não cancela".
 *
 * Pedido do cliente em 03/09, depois de o idioma `if (!confirm(...)) return;`
 * aparecer pela TERCEIRA vez. Ela NÃO migra nada: só lista, em TODO o
 * frontend (não apenas nas telas do manifesto), os pontos em que clicar
 * "Cancelar" NÃO cancela a ação.
 *
 * Duas famílias, e é importante não confundi-las:
 *
 *  A) `confirmar()` do `useConfirmacao` LIDO COMO BOOLEANO. Ele devolve
 *     `{ ok, texto }`, e objeto é SEMPRE truthy — então `if (!await
 *     confirmar(...)) return;` nunca retorna e a ação SEGUE no "Cancelar".
 *     É a R21, e já causou estorno indevido de título financeiro.
 *
 *  B) `confirm()` nativo com o retorno IGNORADO: `await confirm(...)` sem
 *     usar o valor, ou a chamada solta como expressão. A caixa aparece, o
 *     usuário clica em "Cancelar", e a ação acontece do mesmo jeito.
 *
 * O que NÃO é defeito e por isso não entra na lista: `if (!confirm(...))
 * return;` com o `confirm` NATIVO. Ali o retorno é booleano de verdade e o
 * idioma está correto — feio, porque é caixa do navegador (R19), mas o
 * cancelamento cancela. Misturar os dois casos numa lista só faria o
 * defeito real se perder no meio de setecentas linhas corretas.
 *
 * Uso: node scripts/varreduraCancelamento.mjs [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

const traverse = _traverse.default || _traverse;
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(RAIZ, 'src');
const comoJson = process.argv.includes('--json');

function arquivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return arquivos(p);
    return /\.(jsx?|tsx?)$/.test(e.name) ? [p] : [];
  });
}

/** O identificador chamado é o `confirmar` do useConfirmacao? */
function ehConfirmarDoSistema(no) {
  return no.callee?.type === 'Identifier' && no.callee.name === 'confirmar';
}

/** É o `confirm()` nativo (inclui `window.confirm`)? */
function ehConfirmNativo(no) {
  if (no.callee?.type === 'Identifier' && no.callee.name === 'confirm') return true;
  return no.callee?.type === 'MemberExpression'
    && no.callee.object?.name === 'window'
    && no.callee.property?.name === 'confirm';
}

/*
  É o `prompt()` nativo? LACUNA DA PRIMEIRA VERSÃO (03/09): a varredura
  cobria só `confirm`, e `prompt` é a MESMA classe de defeito com uma
  diferença que piora as coisas — ele devolve `null` no "Cancelar" e a
  STRING no "OK". Quem testa só `if (!valor) return;` trata cancelar e
  vazio igual (aceitável); quem NÃO testa nada segue com `null` para o
  serviço. Dezenove chamadas nunca tinham sido examinadas.
*/
function ehPromptNativo(no) {
  if (no.callee?.type === 'Identifier' && no.callee.name === 'prompt') return true;
  return no.callee?.type === 'MemberExpression'
    && no.callee.object?.name === 'window'
    && no.callee.property?.name === 'prompt';
}

/*
  FAMÍLIA D — A CONFIRMAÇÃO E A AÇÃO OPERAM SOBRE COLEÇÕES DIFERENTES.

  Classe de defeito distinta de todas as outras deste arquivo, e mais
  grave: aqui o cancelamento FUNCIONA. O usuário lê "Descartar 3
  rascunhos?", clica em Confirmar — e o sistema apaga 47, porque a
  mensagem cita `selecionados.length` e a ação percorre `todos`.

  Não é cancelamento ignorado. É o sistema MENTINDO sobre o que vai
  fazer. O usuário autoriza uma coisa e outra acontece, e ele não tem como
  saber: a confirmação apareceu, ele leu, ele consentiu.

  O que o check mede: numa função que contém uma confirmação cuja mensagem
  cita `ALGUMA_COISA.length`, a ação que vem DEPOIS do guarda tem de
  percorrer ou receber essa MESMA coleção. Se ela toca outra coleção do
  escopo e não toca a citada, reprova.

  Limite honesto e declarado: isto é análise estática de nome, não de
  valor. Ela pega o caso em que os identificadores diferem — que é o caso
  real e o que dá para provar. NÃO pega o caso em que os dois nomes são
  iguais e o CONTEÚDO diverge (a coleção foi refiltrada entre a pergunta e
  a ação). Esse fica como item de leitura obrigatória do revisor, e está
  registrado como tal na DoD.
*/
function colecoesCitadasNaMensagem(no) {
  const nomes = new Set();
  const visitar = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'MemberExpression' && n.property?.name === 'length' && n.object?.type === 'Identifier') {
      nomes.add(n.object.name);
    }
    for (const chave of Object.keys(n)) {
      const v = n[chave];
      if (Array.isArray(v)) v.forEach(visitar);
      else if (v && typeof v === 'object' && v.type) visitar(v);
    }
  };
  visitar(no);
  return nomes;
}

const achados = [];

for (const arquivo of arquivos(SRC)) {
  const codigo = fs.readFileSync(arquivo, 'utf8');
  if (!/confirm/.test(codigo)) continue;
  let ast;
  try {
    ast = parse(codigo, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator']
    });
  } catch (erro) {
    achados.push({
      arquivo: path.relative(RAIZ, arquivo), linha: 0, familia: 'ERRO',
      trecho: `não foi possível analisar: ${erro.message}`
    });
    continue;
  }

  traverse(ast, {
    CallExpression(caminho) {
      const no = caminho.node;
      const doSistema = ehConfirmarDoSistema(no);
      const nativo = ehConfirmNativo(no);
      const promptNativo = ehPromptNativo(no);
      if (!doSistema && !nativo && !promptNativo) return;

      // Onde o valor desta chamada é consumido: sobe pelo `await` e por
      // parênteses, que não mudam o valor.
      let pai = caminho.parentPath;
      while (pai && (pai.node.type === 'AwaitExpression' || pai.node.type === 'ParenthesizedExpression')) {
        pai = pai.parentPath;
      }
      const tipoPai = pai?.node.type;
      const linha = no.loc?.start.line || 0;
      const trecho = codigo.split('\n')[linha - 1]?.trim().slice(0, 130) || '';
      const rel = path.relative(RAIZ, arquivo);

      /* ---- Família D: confirmação e ação sobre coleções diferentes ---- */
      if (doSistema || nativo) {
        const citadas = colecoesCitadasNaMensagem(no);
        const fn = caminho.getFunctionParent();
        if (citadas.size && fn) {
          // Identificadores usados DEPOIS desta chamada, dentro da mesma
          // função — é ali que a ação acontece.
          const linhaDaPergunta = no.loc?.end.line || 0;
          const usadasDepois = new Set();
          fn.traverse({
            Identifier(ref) {
              const l = ref.node.loc?.start.line || 0;
              if (l <= linhaDaPergunta) return;
              if (ref.parentPath?.node.type === 'MemberExpression'
                && ref.parentPath.node.property === ref.node) return; // .length, .map
              usadasDepois.add(ref.node.name);
            }
          });
          /*
            SEGUE UM NÍVEL DE CHAMADA (03/09).

            A primeira versão exigia que a coleção citada aparecesse
            LITERALMENTE depois do guarda — e acusou a Cotação Pública, onde
            a confirmação cita `itens.length` e a ação chama
            `montarPayloadResposta()`, que percorre `itens` lá dentro.
            Falso positivo: a coleção é a mesma, só está a uma chamada de
            distância.

            Numa lista de defeito destrutivo, falso positivo é caro: manda
            conferir código correto e corrói a confiança no resto. Então o
            check olha também o corpo das funções do próprio arquivo que a
            ação chama.
          */
          const funcoesDoArquivo = new Map();
          traverse(ast, {
            'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression'(f) {
              const nome = f.node.id?.name
                || (f.parentPath?.node.type === 'VariableDeclarator' ? f.parentPath.node.id?.name : null);
              if (nome) funcoesDoArquivo.set(nome, f);
            }
          });
          const chamadasDepois = [...usadasDepois].filter((nome) => funcoesDoArquivo.has(nome));
          const citadaEmChamada = chamadasDepois.some((nome) => {
            let achou = false;
            funcoesDoArquivo.get(nome).traverse({
              Identifier(ref) { if (citadas.has(ref.node.name)) achou = true; }
            });
            return achou;
          });
          const citadaSegueUsada = [...citadas].some((c) => usadasDepois.has(c)) || citadaEmChamada;
          if (!citadaSegueUsada) {
            // Alguma OUTRA coleção do escopo é percorrida depois?
            const outrasColecoes = [...usadasDepois].filter((nome) => {
              if (citadas.has(nome)) return false;
              const b = fn.scope.getBinding(nome);
              if (!b) return false;
              return b.referencePaths.some((r) => {
                const m = r.parentPath?.node;
                return m?.type === 'MemberExpression'
                  && ['map', 'forEach', 'filter', 'length', 'join', 'reduce'].includes(m.property?.name);
              });
            });
            achados.push({
              arquivo: rel,
              linha,
              familia: 'D',
              problema: `a confirmação cita "${[...citadas].join(', ')}.length", e essa coleção NÃO é usada pela ação que vem depois${outrasColecoes.length ? ` — o que aparece depois é "${outrasColecoes.slice(0, 3).join(', ')}"` : ''}. O usuário autoriza um número e outro acontece`,
              trecho
            });
          }
        }
      }

      if (doSistema) {
        const reprovar = (motivo) => achados.push({
          arquivo: rel, linha, familia: 'A',
          problema: `${motivo} — o objeto { ok, texto } é sempre truthy, então "Cancelar" SEGUE COM A AÇÃO`,
          trecho
        });

        if (tipoPai === 'MemberExpression') return; // (await confirmar()).ok

        /*
          O CASO QUE ESCAPOU NA PRIMEIRA VERSÃO, e é justamente o que causou
          o estorno indevido em 03/09:

              const ok = await confirmar({ ... });
              if (!ok) return;

          Olhar só o PAI imediato via `const ok = ...` — um
          `VariableDeclarator` com identificador simples — e seguia em
          frente. O defeito não está na atribuição: está no USO da variável
          duas linhas abaixo. Um scanner que só olha o pai imediato pega as
          formas espalhafatosas (`if (!await confirmar(...))`) e deixa
          passar a discreta, que é a que aparece no código de verdade.

          Então: atribuição a identificador simples faz o scanner SEGUIR A
          LIGAÇÃO e olhar cada referência dessa variável.
        */
        if (tipoPai === 'VariableDeclarator') {
          const id = pai.node.id;
          if (id?.type === 'ObjectPattern') return; // desestruturado = correto
          if (id?.type !== 'Identifier') return;
          const ligacao = pai.scope.getBinding(id.name);
          if (!ligacao) {
            reprovar(`retorno de confirmar() guardado em "${id.name}" e o scanner não conseguiu seguir o uso`);
            return;
          }
          const usoBooleano = ligacao.referencePaths.find((ref) => {
            const p2 = ref.parentPath;
            if (!p2) return false;
            if (p2.node.type === 'MemberExpression') return false; // ok.ok / ok.texto
            return (p2.node.type === 'UnaryExpression' && p2.node.operator === '!')
              || (p2.node.type === 'IfStatement' && p2.node.test === ref.node)
              || p2.node.type === 'LogicalExpression'
              || (p2.node.type === 'ConditionalExpression' && p2.node.test === ref.node);
          });
          if (usoBooleano) {
            const linhaUso = usoBooleano.node.loc?.start.line || linha;
            achados.push({
              arquivo: rel,
              linha: linhaUso,
              familia: 'A',
              problema: `"${id.name}" recebe o retorno de confirmar() (linha ${linha}) e é lido como BOOLEANO aqui — o objeto { ok, texto } é sempre truthy, então "Cancelar" SEGUE COM A AÇÃO`,
              trecho: codigo.split('\n')[linhaUso - 1]?.trim().slice(0, 130) || trecho
            });
          }
          return;
        }

        if (
          (tipoPai === 'UnaryExpression' && pai.node.operator === '!')
          || tipoPai === 'IfStatement'
          || tipoPai === 'LogicalExpression'
          || tipoPai === 'ConditionalExpression'
        ) {
          reprovar('retorno de confirmar() lido como BOOLEANO');
        }
        return;
      }

      // Nativo: só é defeito quando o retorno NÃO é consumido.
      const consumido = tipoPai && ![
        'ExpressionStatement', 'SequenceExpression', 'BlockStatement'
      ].includes(tipoPai);
      if (!consumido) {
        achados.push({
          arquivo: rel, linha, familia: 'B',
          problema: `${promptNativo ? 'prompt()' : 'confirm()'} nativo com o retorno IGNORADO — a caixa aparece, o usuário clica em "Cancelar" e a ação acontece assim mesmo`,
          trecho
        });
        return;
      }

      /*
        `prompt()` guardado numa variável: o "Cancelar" devolve `null` e o
        "OK" vazio devolve `''`. Quem não testa a variável antes de usar
        manda `null` para o serviço — o cancelamento não cancela, vira
        gravação com valor nulo. Segue a ligação, igual à família A.
      */
      if (promptNativo && tipoPai === 'VariableDeclarator' && pai.node.id?.type === 'Identifier') {
        const id = pai.node.id;
        const ligacao = pai.scope.getBinding(id.name);
        if (!ligacao) return;
        /*
          SOBE PELA CADEIA ANTES DE DECIDIR (03/09).

          A primeira versão olhava só o pai imediato da referência — e
          acusou `if (!motivo?.trim()) return;` como não testado, porque o
          pai ali é um `OptionalMemberExpression`, não o `!`. Era falso
          positivo, e falso positivo numa lista de defeito destrutivo é
          caro: manda o leitor conferir código que está certo e corrói a
          confiança no resto da lista.

          Agora a referência sobe por acesso a membro e chamada — que não
          mudam o QUE está sendo testado — até achar (ou não) um contexto
          de teste.
        */
        const testado = ligacao.referencePaths.some((ref) => {
          let atual = ref;
          let acima = ref.parentPath;
          while (acima && [
            'MemberExpression', 'OptionalMemberExpression',
            'CallExpression', 'OptionalCallExpression',
            'AwaitExpression', 'ParenthesizedExpression', 'TSNonNullExpression'
          ].includes(acima.node.type)) {
            atual = acima;
            acima = acima.parentPath;
          }
          if (!acima) return false;
          const t = acima.node.type;
          return (t === 'UnaryExpression' && acima.node.operator === '!')
            || (t === 'IfStatement' && acima.node.test === atual.node)
            || t === 'BinaryExpression'      // === null, == null, !== ''
            || t === 'LogicalExpression'
            || t === 'ConditionalExpression';
        });
        if (!testado) {
          achados.push({
            arquivo: rel, linha, familia: 'C',
            problema: `"${id.name}" recebe o retorno de prompt() e NUNCA é testado — no "Cancelar" o valor é null e segue assim mesmo para a ação`,
            trecho
          });
        }
      }
    }
  });
}

achados.sort((a, b) => a.arquivo.localeCompare(b.arquivo) || a.linha - b.linha);

if (comoJson) {
  console.log(JSON.stringify(achados, null, 2));
} else if (!achados.length) {
  console.log('[cancelamento] nenhum ponto em que o "Cancelar" deixa de cancelar.');
} else {
  const porFamilia = { A: [], B: [], C: [], D: [], ERRO: [] };
  achados.forEach((a) => porFamilia[a.familia].push(a));
  const rotulo = {
    A: 'A — confirmar() do sistema lido como booleano (R21)',
    B: 'B — confirm()/prompt() nativo com retorno ignorado',
    C: 'C — prompt() guardado e nunca testado (null segue para a ação)',
    D: 'D — a confirmação pergunta sobre uma coleção e a ação percorre outra',
    ERRO: 'ERRO — arquivo não analisado'
  };
  for (const familia of ['D', 'A', 'B', 'C', 'ERRO']) {
    const lista = porFamilia[familia];
    if (!lista.length) continue;
    console.log(`\n## ${rotulo[familia]} — ${lista.length} ocorrência(s)\n`);
    lista.forEach((a) => {
      console.log(`- ${a.arquivo}:${a.linha}`);
      console.log(`    ${a.problema || a.trecho}`);
      if (a.problema) console.log(`    ${a.trecho}`);
    });
  }
  console.log(`\n[cancelamento] ${achados.length} ponto(s) em que o "Cancelar" NÃO cancela.`);
}

/*
  CHECK BLOQUEANTE, SEM TRINCO (decisão do cliente, 03/09).

  Os outros passivos herdados (R19, fonte única) são trincos: congelam o
  que existe e proíbem crescer, porque ali o defeito é ESTILO — uma caixa
  do navegador é feia, um índice à mão é frágil, e nenhum dos dois faz o
  sistema mentir.

  Aqui é diferente, e por isso não há trinco: o defeito é o código fazer o
  OPOSTO do que promete. A tela pergunta "tem certeza?", a pessoa responde
  "não", e a ação acontece. Não existe número aceitável disso; qualquer
  ocorrência, em arquivo novo ou antigo, reprova.
*/
if (achados.length) process.exitCode = 1;
