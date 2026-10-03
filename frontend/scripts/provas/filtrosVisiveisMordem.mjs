#!/usr/bin/env node
/**
 * PROVA — A LIGAÇÃO DO PAINEL "QUAIS FILTROS APARECEM" É VERIFICADA.
 *
 * Nasceu de uma medida feita na leva de 06/09, quando 48 faixas de filtro
 * foram ligadas ao `PainelFiltrosVisiveis`. Antes de relatar a leva, quebrei
 * duas telas de propósito para ver o que reprovava:
 *
 *   - hook depois de `return` condicional -> a R29 do `validarLayout` MORDEU
 *     (2 achados, saída 1). Essa já estava coberta.
 *   - `useFiltrosVisiveis('')`, com a CHAVE VAZIA -> `npm run verificar`
 *     saiu 0. NADA reprovou.
 *
 * A segunda é exatamente o defeito que o próprio `PainelFiltrosVisiveis`
 * nomeia no comentário dele: sem chave o `PreferenciasContext` não registra
 * nada, o painel se recusa a desenhar e a tela fica com um seletor que
 * ninguém vê — "capacidade que mente é pior que capacidade ausente". O build
 * compila, a tela abre, e a faixa parece ligada.
 *
 * Duas coisas ficam trancadas aqui, e as duas foram medidas:
 *
 *   1. CHAVE. Toda faixa que passa `visibilidade={x}` tem de ter um
 *      `const x = useFiltrosVisiveis(<chave não vazia>, ...)`.
 *
 *   2. NINGUÉM NASCE ESCONDIDO. `padrao: false` só existe nas TRÊS telas em
 *      que o cliente aprovou conjunto inicial reduzido (consulta de títulos,
 *      solicitações e provisionamentos). Em qualquer outra, `padrao: false`
 *      muda o que a pessoa vê sem ela ter pedido — e some sem deixar rastro,
 *      porque a tela continua funcionando.
 *
 * As duas checagens rodam sobre TEXTO, então a mordida é provada em
 * fixtures em memória: nenhum arquivo entra em `src/` para ser plantado, o
 * que evita acusar as outras provas de rebote.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(RAIZ, 'src');

/*
  As três telas com conjunto inicial reduzido APROVADO pelo cliente. A lista
  é curta de propósito: cada nome novo aqui é uma decisão de produto, não de
  código, e tem de passar por quem decide.
*/
const CONJUNTO_INICIAL_APROVADO = new Set([
  'src/pages/FinanceiroTitulos.jsx',
  'src/pages/Solicitacoes/Filtros.jsx',
  'src/modules/provisionamento-financeiro/pages/ProvisionamentosFinanceiros.jsx'
]);

/*
  Os dois arquivos que DEFINEM a capacidade: a `BarraFiltros` recebe
  `visibilidade` como PROP (não chama o hook, e não deve chamar — a tela é
  que é dona do estado), e o painel é o hook. Acusá-los seria acusar a
  definição pelo uso.
*/
const DONOS_DA_CAPACIDADE = new Set([
  'src/components/padrao/BarraFiltros.jsx',
  'src/components/padrao/PainelFiltrosVisiveis.jsx'
]);

/**
 * O objeto literal que CONTÉM o índice dado. Serve para separar filtro de
 * COLUNA: as duas famílias usam `padrao: false` com o mesmo significado, mas
 * a coluna diz `titulo:` e o filtro diz `rotulo:`. Sem esta distinção a prova
 * acusaria os seletores de coluna das telas — que são legítimos e antigos.
 */
function objetoAoRedor(codigo, indice) {
  let profundidade = 0;
  let ini = -1;
  for (let i = indice; i >= 0; i -= 1) {
    const c = codigo[i];
    if (c === '}') profundidade += 1;
    else if (c === '{') {
      if (profundidade === 0) { ini = i; break; }
      profundidade -= 1;
    }
  }
  if (ini < 0) return '';
  profundidade = 0;
  for (let i = ini; i < codigo.length; i += 1) {
    const c = codigo[i];
    if (c === '{') profundidade += 1;
    else if (c === '}') {
      profundidade -= 1;
      if (profundidade === 0) return codigo.slice(ini, i + 1);
    }
  }
  return codigo.slice(ini);
}

const semComentarios = (codigo) => codigo
  .replace(/\/\*[\s\S]*?\*\//g, (t) => t.replace(/[^\n]/g, ' '))
  .replace(/\/\/[^\n]*/g, (t) => t.replace(/[^\n]/g, ' '));

/**
 * Devolve as falhas de UM arquivo. Recebe texto para que a mordida possa ser
 * provada sem escrever nada em disco.
 */
export function falhasDe(rel, bruto) {
  const codigo = semComentarios(bruto);
  const falhas = [];

  if (DONOS_DA_CAPACIDADE.has(rel)) return falhas;

  // 1) Toda `visibilidade={x}` precisa de um `x` vindo do hook, com chave.
  for (const uso of codigo.matchAll(/visibilidade=\{([A-Za-z_$][\w$]*)\}/g)) {
    const nome = uso[1];
    const decl = new RegExp(`const\\s+${nome}\\s*=\\s*useFiltrosVisiveis\\(\\s*([^,]*),`).exec(codigo);
    if (!decl) {
      falhas.push(`${rel} passa visibilidade={${nome}} e não há `
        + `\`const ${nome} = useFiltrosVisiveis(...)\` nesta tela — o painel não desenha e a `
        + 'faixa fica com um seletor que ninguém vê.');
      continue;
    }
    const chave = decl[1].trim();
    if (chave === '' || chave === "''" || chave === '""' || chave === '``' || chave === 'null' || chave === 'undefined') {
      falhas.push(`${rel} chama useFiltrosVisiveis com CHAVE VAZIA — sem chave o `
        + 'PreferenciasContext não grava nada, o painel se recusa a desenhar e a escolha morre '
        + 'na recarga. Use a mesma identidade de lista da TabelaPadrao desta tela.');
    }
  }

  // 2) Ninguém nasce escondido fora das três telas aprovadas.
  if (!CONJUNTO_INICIAL_APROVADO.has(rel)) {
    for (const m of codigo.matchAll(/padrao:\s*false/g)) {
      const objeto = objetoAoRedor(codigo, m.index);
      // Coluna de tabela diz `titulo:`; filtro diz `rotulo:`. Só o segundo
      // é assunto desta prova — o seletor de COLUNAS pode nascer reduzido.
      if (!/\brotulo\s*:/.test(objeto) || /\btitulo\s*:/.test(objeto)) continue;
      falhas.push(`${rel} declara \`padrao: false\` num filtro — a tela abriria com filtro `
        + 'ESCONDIDO, mudando o que a pessoa vê sem ela ter pedido. Conjunto inicial reduzido só '
        + 'nas três telas em que o cliente aprovou um.');
    }
  }

  return falhas;
}

const arquivos = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return arquivos(p);
  return /\.jsx$/.test(e.name) ? [p] : [];
});

/* ------------------------------------------------------------------ */
/* A MORDIDA: a checagem tem de ACUSAR o defeito e LIBERAR o correto.  */
/* ------------------------------------------------------------------ */
const CORRETO = `
const FILTROS_DA_TELA = [
  { id: 'busca', rotulo: 'Busca', obrigatorio: true },
  { id: 'obra_id', rotulo: 'Obra' },
  { id: 'status', rotulo: 'Status' }
];
export default function Tela() {
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:tela-exemplo', FILTROS_DA_TELA, {});
  return <BarraFiltros filtros={dimensoes} visibilidade={visibilidadeFiltros} />;
}
`;

const plantados = [
  ['chave vazia', CORRETO.replace("'tabela:tela-exemplo'", "''"), /CHAVE VAZIA/],
  ['sem o hook na tela', CORRETO.replace(/const visibilidadeFiltros[^\n]*\n/, ''), /não há/],
  ['filtro nascendo escondido', CORRETO.replace("rotulo: 'Status' }", "rotulo: 'Status', padrao: false }"), /padrao: false/]
];

let falhasDaProva = 0;
const conferir = (nome, bate, detalhe) => {
  if (!bate) falhasDaProva += 1;
  console.log(`${bate ? '  ok  ' : ' FALHA'} ${nome}${detalhe ? ` :: ${detalhe}` : ''}`);
};

for (const [nome, fixture, esperado] of plantados) {
  const achados = falhasDe('src/pages/__fixture.jsx', fixture);
  conferir(`morde: ${nome}`, achados.some((f) => esperado.test(f)), achados[0] || 'NADA REPROVOU');
}
conferir('NEGATIVO: a ligação correta NÃO é acusada',
  falhasDe('src/pages/__fixture.jsx', CORRETO).length === 0,
  falhasDe('src/pages/__fixture.jsx', CORRETO)[0] || '');
conferir('NEGATIVO: `padrao: false` nas três telas aprovadas NÃO é acusado',
  falhasDe('src/pages/Solicitacoes/Filtros.jsx', CORRETO.replace("rotulo: 'Status' }", "rotulo: 'Status', padrao: false }")).length === 0);

/* ------------------------------------------------------------------ */
/* E agora o repositório de verdade.                                   */
/* ------------------------------------------------------------------ */
const reprovas = [];
let ligadas = 0;
for (const arquivo of arquivos(SRC)) {
  const rel = path.relative(RAIZ, arquivo).replace(/\\/g, '/');
  const bruto = fs.readFileSync(arquivo, 'utf8');
  if (!DONOS_DA_CAPACIDADE.has(rel)) {
    ligadas += [...semComentarios(bruto).matchAll(/visibilidade=\{/g)].length;
  }
  reprovas.push(...falhasDe(rel, bruto));
}

for (const r of reprovas) console.log(`  REPROVA ${r}`);
console.log(`\n[provas] filtros visíveis: ${ligadas} faixa(s) ligada(s) ao painel, `
  + `${reprovas.length} reprova(s), ${plantados.length} defeito(s) plantado(s), 2 controle(s) negativo(s)`);
process.exit(falhasDaProva || reprovas.length ? 1 : 0);
