#!/usr/bin/env node
/**
 * PROVA — A PÁGINA CABE NUM CELULAR DE 390px, e o que não cabe TEM ROLAGEM.
 * ============================================================================
 *
 * O DEFEITO QUE ISSO FECHA, medido em 06/09 contra o preview publicado: 15
 * telas reprovavam o X3 da DoD com conteúdo desenhado FORA da janela de
 * 390px. O relatório listava seis "famílias" diferentes — o `<h1>` da faixa,
 * o ladrilho de dado, a etiqueta de status, o cabeçalho do bloco, o botão da
 * barra de ação, o bloco secundário inteiro — e todas as seis eram a MESMA
 * causa, uma só:
 *
 *     `.app-pagina { display: grid }` SEM `grid-template-columns`.
 *
 * Trilha implícita `auto` tem o tamanho do MAIOR mínimo-de-conteúdo entre os
 * filhos, e ESTICA todos os outros até lá. Um único conteúdo teimoso — um
 * título comprido, um valor de painel, um apoio com `white-space: nowrap` —
 * levava a página inteira para 468px, 618px, 1114px, 1231px.
 *
 * E o transbordo NÃO ROLAVA: `html, body, #root` e o `.layout-shell` têm
 * `overflow-x: clip` de propósito (R18 — tabela larga rola dentro do bloco em
 * vez de deslocar o documento). Com `clip`, o que passa da borda é RECORTADO
 * e some sem deixar barra de rolagem. No celular a pessoa não tinha como
 * chegar naquilo: informação que existe no código e não existe para quem usa.
 *
 * ----------------------------------------------------------------------------
 * O QUE ESTA PROVA MEDE — e por que ela não é o X3 do harness.
 *
 * O X3 (`qa-preview/checks.mjs`) mede TELA REAL no preview publicado, com
 * dado real, e é ele quem diz quantas telas passaram. Só que ele precisa de
 * deploy, de sessão e de rede: entre uma correção de CSS e a resposta dele
 * passam minutos e um push. Esta prova mede a CASCATA, aqui, em segundos: o
 * CSS REAL do sistema, os arranjos que estouraram, numa janela de 390px.
 *
 * As duas são necessárias. A cascata explica POR QUE estourava; a tela real
 * diz SE ainda estoura. Cascata certa com tela errada existe (a tela pode
 * escrever a própria largura), e é por isso que esta não substitui aquela.
 *
 * ----------------------------------------------------------------------------
 * A MORDIDA. O segundo cenário devolve ao CSS o estado ANTERIOR (trilha `auto`
 * na página + apoio de bloco em `nowrap`) e a prova EXIGE que a medição
 * REPROVE. Se ela não reprovar, esta prova não está medindo nada — e é isso
 * que o relatório precisa dizer.
 *
 * Rode com `npm run provas` ou `node scripts/provas/paginaCabeNoCelular.mjs`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LARGURA = 390;

/* NA MESMA ORDEM DE `src/main.jsx` — cascata é ordem. */
const CSS = [
  'src/index.css',
  'src/styles/design-tokens.css',
  'src/components/lista-avancada/lista-avancada.css',
  'src/styles/escala.css',
  'src/styles/componentes-padrao.css',
  'src/modules/solicitacao-compra/compras-responsive.css',
  'src/styles/responsive-system.css'
];

/*
  O DEFEITO DE VOLTA. Duas linhas, que são exatamente as duas que a correção
  de 06/09 escreveu: a trilha da página volta a ser ditada pelo conteúdo, e o
  apoio do bloco volta a recusar quebra no celular.
*/
const DEFEITO_PLANTADO = `
  .app-pagina { grid-template-columns: none; }
  .app-blocos-arranjo, .app-blocos-segmento-total { min-width: auto; }
  @media (max-width: 767px) { .app-bloco-lead { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } }
`;

/*
  OS TEIMOSOS. Cada bloco abaixo é um dos culpados que o X3 nomeou, com o
  texto real da tela em que ele foi medido — é o comprimento do conteúdo que
  faz a trilha crescer, então encurtar aqui seria fabricar aprovação.
*/
const HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><div class="layout-shell fluxy-app-shell"><main class="layout-main"><div class="layout-content-shell">
<div class="page solicitacoes-page app-pagina">

  <header class="app-page-header"><div class="app-page-header-row">
    <div>
      <h1 class="page-title">Risco, conformidade e automacoes em uma tela</h1>
      <p class="app-page-lead">Controle operacional de riscos, ASO, exames, EPIs, treinamentos, acidentes e documentos por empresa e obra.</p>
    </div>
    <div class="app-actionbar"><button type="button" class="btn btn-primary">Atualizar</button></div>
  </div></header>

  <div class="app-stat-grid">
    <div class="app-stat"><span class="app-stat-label">Valor total das solicitacoes no periodo</span><span class="app-stat-valor">R$ 12.345.678,90</span></div>
    <div class="app-stat app-stat--success"><span class="app-stat-label">Valor aprovado e liberado para pagamento</span><span class="app-stat-valor">R$ 98.765.432,10</span></div>
    <div class="app-stat"><span class="app-stat-label">Valor pendente de analise do setor</span><span class="app-stat-valor">R$ 44.444.444,44</span></div>
    <div class="app-stat"><span class="app-stat-label">Valor rejeitado no periodo apurado</span><span class="app-stat-valor">R$ 55.555.555,55</span></div>
  </div>

  <section class="app-bloco app-bloco--primario"><div class="app-bloco-corpo">
    <div style="display:grid;gap:12px">
      <a class="cartao-hub" href="#"><section class="app-bloco app-bloco--secundario">
        <div class="app-bloco-cabecalho"><div class="app-bloco-identidade"><div class="app-bloco-head">
          <h2 class="app-bloco-titulo">Status por Setor</h2>
          <span class="app-bloco-acoes"><span class="fx-badge fx-badge--success">Disponivel</span></span>
        </div>
        <p class="app-bloco-lead">Painel consolidado de status por setor, com contagem por etapa e o tempo medio de cada uma delas.</p>
        </div></div>
      </section></a>
    </div>
  </div></section>

  <div class="app-blocos-arranjo"><div class="app-blocos-segmento-total"><section class="app-blocos-item">
    <section class="app-bloco app-bloco--secundario">
      <div class="app-bloco-cabecalho"><div class="app-bloco-identidade"><div class="app-bloco-head">
        <h2 class="app-bloco-titulo">Empresas por caixa realizado</h2>
      </div>
      <p class="app-bloco-lead">2 de 2 - usa a empresa informada no titulo e o caixa realizado do periodo selecionado.</p>
      </div></div>
    </section>
  </section></div></div>

</div></div></main></div></body></html>`;

/*
  A MEDIDA, crua e do DOM — a MESMA regra do X3 do harness, de propósito:
  quem passa da borda direita da janela estoura, esteja o transbordo
  recortado ou não; rolagem horizontal PROJETADA (`overflow-x: auto|scroll`
  em algum ancestral) continua permitida, porque ali o conteúdo é alcançável.
*/
const MEDIR = (largura) => {
  const visivel = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const emScrollport = (el) => {
    let a = el.parentElement;
    while (a && a !== document.documentElement) {
      const ox = getComputedStyle(a).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
      a = a.parentElement;
    }
    return false;
  };
  const nome = (el) => el.tagName.toLowerCase()
    + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const fora = Array.from(document.querySelectorAll('body *')).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.right > largura + 2 && r.width > 40 && visivel(el) && !emScrollport(el);
  });
  const pagina = document.querySelector('.app-pagina');
  return {
    quantos: fora.length,
    piores: fora
      .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)
      .slice(0, 4)
      .map((el) => `${nome(el)} até ${Math.round(el.getBoundingClientRect().right)}px`),
    trilha: pagina ? getComputedStyle(pagina).gridTemplateColumns : '(sem .app-pagina)'
  };
};

let falhas = 0;
const registrar = (ok, texto) => {
  if (!ok) falhas += 1;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${texto}`);
};

const css = CSS.map((rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8')).join('\n\n');
const navegador = await chromium.launch();
try {
  const contexto = await navegador.newContext({ viewport: { width: LARGURA, height: 844 } });

  // ---- Cenário 1: o CSS como está no repositório.
  const pagina = await contexto.newPage();
  await pagina.setContent(HTML, { waitUntil: 'domcontentloaded' });
  await pagina.addStyleTag({ content: css });
  const agora = await pagina.evaluate(MEDIR, LARGURA);
  console.log(`\n  trilha da .app-pagina em ${LARGURA}px: ${agora.trilha}`);
  registrar(
    agora.quantos === 0,
    agora.quantos === 0
      ? `nada estoura os ${LARGURA}px`
      : `${agora.quantos} elemento(s) fora da janela: ${agora.piores.join(' | ')}`
  );

  // ---- Cenário 2 (MORDIDA): o defeito de volta. A medição TEM de reprovar.
  const mordida = await contexto.newPage();
  await mordida.setContent(HTML, { waitUntil: 'domcontentloaded' });
  await mordida.addStyleTag({ content: css });
  await mordida.addStyleTag({ content: DEFEITO_PLANTADO });
  const antes = await mordida.evaluate(MEDIR, LARGURA);
  console.log(`  trilha da .app-pagina com o defeito plantado: ${antes.trilha}`);
  registrar(
    antes.quantos > 0,
    antes.quantos > 0
      ? `mordida: com o defeito de volta, ${antes.quantos} elemento(s) estouram — ${antes.piores.join(' | ')}`
      : 'mordida NÃO PEGOU: com o defeito plantado a medição continuou aprovando — esta prova não está medindo nada'
  );
} finally {
  await navegador.close();
}

console.log(`\n[provas] a página cabe no celular: ${falhas === 0 ? 'ok' : `${falhas} verificação(ões) reprovada(s)`}`);
if (falhas) process.exitCode = 1;
