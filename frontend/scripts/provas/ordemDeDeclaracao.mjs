/**
 * ORDEM DE DECLARACAO — o defeito que derruba a tela e passa por tudo.
 *
 * NASCEU DE UM CASO REAL, e o preco explica a prova. Em
 * `RhDpJornada.jsx` o array de dependencias de um `useMemo` (linha 125)
 * lia dois `const` declarados nas linhas 150 e 151. Array de dependencia
 * e ARGUMENTO: o JavaScript o avalia ANTES de chamar o `useMemo`. Ler um
 * `const` antes da declaracao e ZONA MORTA TEMPORAL, e o erro real era
 *
 *     ReferenceError: Cannot access 'competencia' before initialization
 *
 * disparado na PRIMEIRA linha do corpo do render. A aba nunca chegou a
 * pedir dado nenhum — por isso nenhum estado de base a fazia abrir.
 *
 * POR QUE NADA PEGAVA: ordem de declaracao e SINTAXE VALIDA. O
 * `vite build` compila, o `validarLayout` aprova, o `npm run verificar`
 * sai 0. O defeito so existe em EXECUCAO, e so na tela que o carrega.
 * Foi preciso a matriz contra o preview para ver, e mesmo la ele chegou
 * disfarcado: as celulas que acusavam mediam a BARREIRA DE ERRO, nao a
 * aba.
 *
 * E o projeto NAO TEM LINTER — nenhum `.eslintrc*`, nenhuma dependencia
 * de eslint. A regra `no-use-before-define` teria pego isto na hora de
 * escrever. Enquanto nao houver, esta prova faz o papel dela para o caso
 * que custa caro: uso em POSICAO AVALIADA NO RENDER.
 *
 * O que ela olha: dentro de cada componente, um `const`/`let` usado em
 * posicao que o render avalia (argumento de chamada, array de
 * dependencia, valor de prop) ANTES da linha que o declara. Nao acusa uso
 * dentro de funcao diferida (callback, handler, efeito), que roda depois
 * e por isso e legitimo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');
const SRC = path.join(RAIZ, 'src');

const arquivos = [];
(function varrer(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const caminho = path.join(dir, item.name);
    if (item.isDirectory()) varrer(caminho);
    else if (/\.jsx?$/.test(item.name) && !item.name.startsWith('__Prova')) arquivos.push(caminho);
  }
})(SRC);

const achados = [];

/*
  ESCOPO ESTREITO, E DE PROPOSITO.

  A primeira versao desta prova olhava QUALQUER identificador usado antes
  da declaracao. Acusou 226 vezes em 391 arquivos — quase tudo legitimo
  (parametro de funcao com o mesmo nome, escopo aninhado, hoisting de
  funcao). Regra que acusa o certo ensina a ignorar regra, e o cliente
  decidiu exatamente isso hoje sobre outras duas familias de check.

  Entao ela cobre SO a forma que mordeu, e que e a que custa tela branca:
  um ARRAY DE DEPENDENCIAS de useMemo/useEffect/useCallback/useLayoutEffect
  citando um nome declarado MAIS ABAIXO no mesmo corpo de funcao.

  E essa forma, e nao outra, porque o array de dependencia e ARGUMENTO: ele
  e avaliado antes da chamada, sempre, em todo render. Nao ha caminho em
  que ele nao rode.
*/
const GANCHOS = /^(useMemo|useEffect|useCallback|useLayoutEffect|useImperativeHandle)$/;

for (const caminho of arquivos) {
  const codigo = fs.readFileSync(caminho, 'utf8');
  let arvore;
  try {
    arvore = parse(codigo, { sourceType: 'module', plugins: ['jsx'], errorRecovery: false });
  } catch { continue; }

  const visitar = (no, corpoAtual) => {
    if (!no || typeof no !== 'object') return;
    if (Array.isArray(no)) { no.forEach((f) => visitar(f, corpoAtual)); return; }
    if (!no.type) return;

    /* Guarda o corpo de funcao em que estamos: e nele que a ordem importa. */
    const ehFuncao = /FunctionExpression|ArrowFunctionExpression|FunctionDeclaration/.test(no.type);
    const proximoCorpo = ehFuncao && no.body && no.body.type === 'BlockStatement' ? no.body : corpoAtual;

    if (no.type === 'CallExpression'
        && no.callee?.type === 'Identifier'
        && GANCHOS.test(no.callee.name)
        && no.arguments?.length >= 2
        && no.arguments[1]?.type === 'ArrayExpression'
        && corpoAtual) {

      /* Nomes citados no array de dependencias. */
      const citados = [];
      for (const dep of no.arguments[1].elements || []) {
        if (dep?.type === 'Identifier') citados.push({ nome: dep.name, linha: dep.loc.start.line });
      }
      if (citados.length) {
        /* Onde cada const/let e declarado NESTE corpo, no primeiro nivel. */
        const declaradoAqui = new Map();
        for (const item of corpoAtual.body || []) {
          if (item.type !== 'VariableDeclaration') continue;
          if (item.kind !== 'const' && item.kind !== 'let') continue;
          for (const d of item.declarations || []) {
            const alvos = [];
            const colher = (padrao) => {
              if (!padrao) return;
              if (padrao.type === 'Identifier') alvos.push(padrao.name);
              else if (padrao.type === 'ArrayPattern') (padrao.elements || []).forEach(colher);
              else if (padrao.type === 'ObjectPattern') (padrao.properties || []).forEach((pr) => colher(pr.value || pr.argument));
              else if (padrao.type === 'RestElement') colher(padrao.argument);
            };
            colher(d.id);
            for (const nome of alvos) if (!declaradoAqui.has(nome)) declaradoAqui.set(nome, item.loc.start.line);
          }
        }
        for (const c of citados) {
          const linhaDecl = declaradoAqui.get(c.nome);
          if (linhaDecl && c.linha < linhaDecl) {
            const rel = path.relative(RAIZ, caminho).split(path.sep).join('/');
            achados.push(`${rel}:${c.linha} — o array de dependencias de ${no.callee.name} cita "${c.nome}", declarado na linha ${linhaDecl}. Array de dependencia e ARGUMENTO: e avaliado ANTES da chamada, e isso e ReferenceError no primeiro render`);
          }
        }
      }
    }

    for (const chave of Object.keys(no)) {
      if (chave === 'loc' || chave === 'start' || chave === 'end') continue;
      visitar(no[chave], proximoCorpo);
    }
  };

  visitar(arvore.program.body, null);
}

const unicos = [...new Set(achados)];
for (const a of unicos) console.log(`  FALHA ${a}`);
console.log(`\n[provas] ordem de declaracao: ${unicos.length} achado(s) em ${arquivos.length} arquivo(s) do src`);
process.exitCode = unicos.length ? 1 : 0;
