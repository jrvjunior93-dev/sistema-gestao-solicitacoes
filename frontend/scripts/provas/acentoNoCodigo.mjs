#!/usr/bin/env node
/**
 * PROVA — ACENTO EM NOME DE CÓDIGO (06/09).
 *
 * ## O defeito que ela existe para pegar
 *
 * Numa leva de acentuação de rótulos, duas trocas caíram FORA do texto:
 *
 *   src/components/lista-avancada/ListaAvancada.jsx:327
 *     const temMais = totalPaginas > 0 ? página < totalPaginas : false;
 *   src/pages/Solicitacoes/index.jsx:156
 *     return FAIXAS_VALOR.find((faixa) => número <= faixa.ate).rotulo;
 *
 * `página` e `número` não são variável nenhuma: são ReferenceError no
 * PRIMEIRO render, e o primeiro derruba TODA tela que usa a ListaAvancada.
 * Tela branca, não defeito cosmético.
 *
 * ## Por que o portão de então não pegou — e por que ela é de AST
 *
 * Identificador acentuado é sintaxe JavaScript VÁLIDA (ECMAScript aceita
 * letras Unicode em nome). Então:
 *   - `vite build` compila e passa;
 *   - `validarLayout` olha texto e classe, não nome de símbolo;
 *   - `npm run verificar` saiu 0 com o sistema quebrado.
 * Só quem executa a tela vê. Quem achou foi outro agente, porque a fixture
 * dele se recusou a montar — ou seja, por acidente.
 *
 * E por que AST, e não `grep`: a causa foi um extrator de texto que casava
 * `>...<` para achar filho de JSX e pegou ` 0 ? pagina ` de
 * `totalPaginas > 0 ? pagina < totalPaginas`. Qualquer regra de recorte por
 * caractere erra a mesma família de novo. A árvore sabe o que é NOME e o
 * que é TEXTO; a linha não sabe.
 *
 * ## O que ela cobra
 *
 * Nenhum NOME de código no `src` pode ter acento ou cedilha:
 *   - identificador (declaração, uso, parâmetro, importação);
 *   - chave de objeto escrita como nome (`{ pagina: 1 }`);
 *   - propriedade acessada por ponto (`item.descricao`);
 *   - nome de componente/atributo em JSX.
 *
 * Texto, comentário e string ficam de fora de propósito: acentuar rótulo é
 * o certo, e uma prova que reclamasse disso brigaria com o conserto.
 *
 * MEDIDO ao nascer: 0 nomes acentuados em 391 arquivo(s) do `src` — a
 * regra vale inteira desde já, sem trinco e sem passivo herdado.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(RAIZ, 'src');

const TEM_ACENTO = (nome) => /[^\u0000-\u007F]/.test(nome);

function listar(dir, saida = []) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const caminho = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name === 'node_modules' || item.name === 'dist') continue;
      listar(caminho, saida);
      continue;
    }
    if (/\.(jsx?|mjs|tsx?)$/.test(item.name)) saida.push(caminho);
  }
  return saida;
}

/* Percorre a árvore sem dependência de plugin: os nós são objetos simples. */
function percorrer(no, visitar, pai = null, campo = null) {
  if (!no || typeof no !== 'object') return;
  if (Array.isArray(no)) {
    for (const filho of no) percorrer(filho, visitar, pai, campo);
    return;
  }
  if (typeof no.type !== 'string') return;
  visitar(no, pai, campo);
  for (const chave of Object.keys(no)) {
    if (chave === 'loc' || chave === 'leadingComments' || chave === 'trailingComments' || chave === 'innerComments') continue;
    percorrer(no[chave], visitar, no, chave);
  }
}

export function varrer(arquivos = listar(SRC)) {
  const achados = [];
  for (const arquivo of arquivos) {
    const codigo = fs.readFileSync(arquivo, 'utf8');
    let arvore;
    try {
      arvore = parse(codigo, {
        sourceType: 'module',
        allowReturnOutsideFunction: true,
        errorRecovery: true,
        plugins: ['jsx', 'classProperties', 'objectRestSpread', 'optionalChaining', 'nullishCoalescingOperator', 'dynamicImport', 'topLevelAwait']
      });
    } catch (erro) {
      achados.push({
        arquivo: path.relative(RAIZ, arquivo).split(path.sep).join('/'),
        linha: erro.loc?.line || 0,
        nome: '(não parseia)',
        onde: `arquivo não parseia: ${erro.message}`
      });
      continue;
    }
    const rel = path.relative(RAIZ, arquivo).split(path.sep).join('/');
    percorrer(arvore.program, (no, pai, campo) => {
      let nome = null;
      let onde = null;
      if (no.type === 'Identifier' || no.type === 'JSXIdentifier') {
        nome = no.name;
        /* Chave de objeto entre aspas não é nome: `{ 'descrição': 1 }` é
           StringLiteral, não passa por aqui. Chave escrita como nome, sim. */
        if (pai?.type === 'ObjectProperty' && campo === 'key' && !pai.computed) onde = 'chave de objeto';
        else if (pai?.type === 'MemberExpression' && campo === 'property' && !pai.computed) onde = 'propriedade acessada por ponto';
        else if (pai?.type === 'JSXAttribute' && campo === 'name') onde = 'atributo de JSX';
        else onde = 'identificador';
      }
      if (!nome || !TEM_ACENTO(nome)) return;
      achados.push({ arquivo: rel, linha: no.loc?.start.line || 0, nome, onde });
    });
  }
  return achados;
}

if ((process.argv[1] || '').endsWith('acentoNoCodigo.mjs')) {
  const arquivos = listar(SRC);
  const achados = varrer(arquivos);
  for (const a of achados) {
    console.error(`FALHA ${a.arquivo}:${a.linha} [ACENTO-NO-CODIGO] \`${a.nome}\` é ${a.onde} com acento — acento vale para o TEXTO que a pessoa lê, nunca para o nome. Identificador acentuado compila e só quebra em execução (ReferenceError no primeiro render); chave/propriedade acentuada não quebra nada e faz o valor sumir em silêncio.`);
  }
  console.log(`[provas] acento em nome de código: ${achados.length} achado(s) em ${arquivos.length} arquivo(s) do src`);
  process.exit(achados.length ? 1 : 0);
}
