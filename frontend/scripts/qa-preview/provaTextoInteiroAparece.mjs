#!/usr/bin/env node
/**
 * PROVA — TEXTO QUE NÃO CABE QUEBRA EM LINHAS; ELE NÃO SOME.
 * ============================================================================
 *
 * UMA REGRA, DOIS LUGARES — e é por isso que são uma prova só. Os dois
 * achados do revisor separado (A6 e A9) são o mesmo defeito com dois nomes:
 * texto que não cabe some da tela sem aviso, e a saída que existiria para
 * recuperá-lo não funciona onde a pessoa está.
 *
 *   A6 — TRILHA DE NAVEGAÇÃO. `.fx-breadcrumb` era `overflow-x: auto` com
 *        `scrollbar-width: none`, numa caixa que ficava com a SOBRA da
 *        fileira. Corta no meio da palavra, sem reticência e sem barra.
 *   A9 — APOIO DA FAIXA. `.app-page-lead` era `white-space: nowrap` +
 *        `text-overflow: ellipsis` + `title`. Corta com reticências, e o
 *        texto inteiro só existe no tooltip.
 *
 * E AS DUAS SAÍDAS FALHAM EM PONTAS OPOSTAS, que é a parte que não estava
 * escrita em lugar nenhum:
 *   - o TOOLTIP não abre no toque (não há hover) — foi por isso que o irmão
 *     `.app-bloco-lead` ganhou a quebra no celular em 06/09;
 *   - a ROLAGEM HORIZONTAL não existe no ponteiro (roda de mouse não rola em
 *     X) e, escondida a barra, também não se anuncia no toque — foi por isso
 *     que a faixa de visões perdeu a tira horizontal dela em 06/09.
 * Ou seja: a trilha não tinha saída em NENHUMA das duas larguras. Não são
 * três comportamentos; é um mecanismo só, e o lugar do corte depende apenas
 * do comprimento dos rótulos.
 *
 * ----------------------------------------------------------------------------
 * O QUE ESTA PROVA MEDE — caixa por caixa, contra a caixa VISÍVEL.
 *
 * Para a trilha: cada degrau (`a` e `.fx-breadcrumb-current`) é intersectado
 * com a caixa de TODO ancestral que corta e com a janela. Exige-se 100% do
 * degrau visível. Não é "existe no DOM": num contêiner com `overflow-x:
 * auto` o degrau existe, tem tamanho, e ninguém o vê.
 *
 * Para o apoio: mede-se `scrollWidth` contra `clientWidth` do próprio
 * parágrafo, e a altura contra a de uma linha. Truncar com reticências não
 * muda o `scrollWidth` — é exatamente assim que se pega o clamp de uma linha
 * mesmo quando a faixa tem espaço vertical de sobra (o caso de
 * `solicitacoes-rel-op`, onde a linha está SOZINHA e ainda assim cortava).
 *
 * As duas medidas rodam nas cinco larguras do harness da barra: 390 (onde o
 * cliente fotografou), 768 e 1024 (as fronteiras do shell), 1366 (o
 * notebook) e 1920 (o monitor).
 *
 * ----------------------------------------------------------------------------
 * AS MORDIDAS — uma por achado, cada uma plantando a folha exata de antes.
 *   `?d=trilhaQueRola`     devolve a trilha para dentro da navegação com
 *                          `overflow-x: auto`;
 *   `?d=nowrapNoCelular`   devolve `white-space: nowrap` ao apoio da faixa
 *                          abaixo de 768px.
 * As duas EXIGEM reprovação nas larguras em que o defeito foi medido. Uma
 * mordida que não morde é um verde que não mede nada.
 *
 * Rode com `npm run provas` ou `node scripts/qa-preview/provaTextoInteiroAparece.mjs`.
 */
import fs from 'node:fs';
import { chromium } from 'playwright';
import { criarServidorDeApoioDaFaixa, criarServidorDeBarraDoTopo } from './servidorCamadas.mjs';

const LARGURAS = [
  { rotulo: '1920', width: 1920, height: 1080 },
  { rotulo: '1366', width: 1366, height: 900 },
  { rotulo: '1024', width: 1024, height: 820 },
  { rotulo: '768', width: 768, height: 900 },
  { rotulo: '390', width: 390, height: 844 }
];

/*
  AS ROTAS DA TRILHA. Escolhidas pelo COMPRIMENTO do caminho, que é a única
  coisa que decide onde o corte cai: as quatro primeiras foram medidas entre
  as mais compridas do sistema (conteúdo de 398 a 474px), as duas seguintes
  são as que o revisor fotografou com o separador solto, e `/` é o piso —
  uma trilha de um degrau só, que NÃO pode virar duas linhas.
*/
const ROTAS = [
  { rota: '/configuracoes-visibilidade-ui', nota: 'caminho de 474px, o mais largo do sistema' },
  { rota: '/usuarios-permissoes-rh-dp', nota: 'caminho de 465px' },
  { rota: '/obra-tipo-apropriacao', nota: 'caminho de 421px' },
  { rota: '/setores-visiveis-usuario', nota: 'caminho de 414px' },
  { rota: '/usuarios', nota: '255px — separador solto no relato do revisor' },
  { rota: '/obras', nota: '236px — separador solto no relato do revisor' },
  { rota: '/pedidos-compra', nota: '319px — escopo de Compras' },
  { rota: '/', nota: 'piso: um degrau só, 53px' }
];

/* AS TELAS DO APOIO — os literais das telas que o revisor nomeou. */
const TELAS_APOIO = [
  'solicitacoes',
  'financeiro-titulos',
  'solicitacoes-rel-op',
  'compras-rel-economia'
];

let falhas = 0;
const registrar = (ok, texto) => {
  if (!ok) falhas += 1;
  console.log(`${ok ? '  ok   ' : '  FALHA'} ${texto}`);
};

/* --------------------------------------------------------------- trilha -- */
const medirTrilha = () => {
  const barra = document.querySelector('.fx-topbar');
  if (!barra) return { erro: 'a barra do topo não entrou no DOM' };
  /*
    A TRILHA VISÍVEL. Desde 07/09 existem duas na barra — a de dentro da
    navegação (≥1024px) e a de fileira própria (<1024px) — e a cada largura
    uma delas é `display: none`. Medir a primeira do DOM mediria a oculta.
  */
  const trilha = [...barra.querySelectorAll('.fx-breadcrumb')]
    .find((el) => getComputedStyle(el).display !== 'none');
  if (!trilha) return { erro: 'nenhuma trilha visível na barra' };

  /* A caixa depois de todo ancestral que corta, e depois da janela. */
  const visivel = (el) => {
    const r = el.getBoundingClientRect();
    let l = r.left; let t = r.top; let d = r.right; let b = r.bottom;
    let pai = el.parentElement;
    while (pai) {
      const s = getComputedStyle(pai);
      const p = pai.getBoundingClientRect();
      if (s.overflowX !== 'visible') { l = Math.max(l, p.left); d = Math.min(d, p.right); }
      if (s.overflowY !== 'visible') { t = Math.max(t, p.top); b = Math.min(b, p.bottom); }
      pai = pai.parentElement;
    }
    l = Math.max(l, 0); t = Math.max(t, 0);
    d = Math.min(d, window.innerWidth); b = Math.min(b, window.innerHeight);
    return {
      w: Math.max(0, d - l),
      h: Math.max(0, b - t),
      w0: r.width,
      h0: r.height
    };
  };

  const degraus = [...trilha.querySelectorAll('a, .fx-breadcrumb-current')].map((el) => {
    const v = visivel(el);
    return {
      texto: el.textContent.trim(),
      largura: Math.round(v.w0),
      naTela: Math.round(v.w),
      /* Área, não só largura: um degrau que rolou para fora na vertical
         também sumiu. */
      fracao: (v.w0 * v.h0) > 0 ? (v.w * v.h) / (v.w0 * v.h0) : 1
    };
  });

  return {
    linhas: Math.max(1, Math.round(trilha.getBoundingClientRect().height / 36)),
    altura: Math.round(trilha.getBoundingClientRect().height),
    barra: Math.round(barra.getBoundingClientRect().height),
    caminho: trilha.textContent.trim().replace(/\s+/g, ' '),
    degraus
  };
};

/* ---------------------------------------------------------------- apoio -- */
const medirApoio = () => {
  const apoio = document.querySelector('.app-page-lead');
  if (!apoio) return { erro: 'o apoio da faixa não entrou no DOM' };
  const cs = getComputedStyle(apoio);
  const alturaLinha = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
  const r = apoio.getBoundingClientRect();
  return {
    /* O corte de UMA LINHA: o conteúdo pede mais largura do que a caixa tem
       e a caixa não cresceu em altura para acomodar. */
    conteudo: Math.round(apoio.scrollWidth),
    caixa: Math.round(apoio.clientWidth),
    altura: Math.round(r.height),
    linhas: Math.max(1, Math.round(r.height / alturaLinha)),
    quebra: cs.whiteSpace,
    faixa: Math.round(document.querySelector('.app-page-header').getBoundingClientRect().height),
    compacta: document.querySelector('.app-page-header').classList.contains('app-page-header--compacto'),
    texto: apoio.textContent.trim()
  };
};

async function abrir(navegador, servidor, largura, busca, seletor) {
  const contexto = await navegador.newContext({ viewport: { width: largura.width, height: largura.height } });
  const pagina = await contexto.newPage();
  await pagina.goto(servidor.rota(busca), { waitUntil: 'domcontentloaded' });
  await pagina.waitForSelector(seletor, { timeout: 10000 });
  /* A fileira de atalhos se acomoda depois do `ResizeObserver`, e a faixa
     mede a própria altura em dois estados no `useLayoutEffect`. */
  await pagina.waitForTimeout(700);
  return { contexto, pagina };
}

async function main() {
  const servidorBarra = await criarServidorDeBarraDoTopo();
  const servidorApoio = await criarServidorDeApoioDaFaixa();
  /* SEM PROXY: estas fixtures só falam com 127.0.0.1. */
  const navegador = await chromium.launch({
    executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
    args: ['--no-proxy-server']
  });

  try {
    /* =============================================== A6 — a trilha ======= */
    console.log('\n=== A6 — a trilha mostra o caminho inteiro ===');
    for (const largura of LARGURAS) {
      console.log(`\n— ${largura.width}×${largura.height} —`);
      for (const { rota, nota } of ROTAS) {
        const { contexto, pagina } = await abrir(
          navegador, servidorBarra, largura, `?rota=${encodeURIComponent(rota)}`, '.fx-topbar'
        );
        const m = await pagina.evaluate(medirTrilha);
        await pagina.close(); await contexto.close();
        if (m.erro) { registrar(false, `${rota} :: ${m.erro}`); continue; }
        const sumidos = m.degraus.filter((d) => d.fracao < 0.995);
        registrar(sumidos.length === 0,
          `${rota} :: "${m.caminho}" — ${m.degraus.length} degrau(s) em ${m.linhas} linha(s),`
          + ` barra de ${m.barra}px [${nota}]`
          + (sumidos.length
            ? ` — ${sumidos.length} degrau(s) CORTADO(S): `
              + sumidos.map((d) => `"${d.texto}" ${d.naTela}px de ${d.largura}px`).join(' | ')
            : ' — nenhum degrau cortado'));
      }
    }

    /* --------------------------------------------------------- mordida -- */
    /*
      A MORDIDA DA TRILHA só existe onde a trilha NÃO CABIA. A 1920px ela
      cabia antes e cabe agora — cobrar mordida ali seria exigir que a
      medição acusasse uma tela sã.
    */
    console.log('\n— mordida A6: a trilha com rolagem escondida tem de REPROVAR (≤1366) —');
    const COM_DEFEITO = LARGURAS.filter((l) => l.width <= 1366);
    let mordeu = 0;
    for (const largura of COM_DEFEITO) {
      const { contexto, pagina } = await abrir(
        navegador, servidorBarra, largura,
        `?rota=${encodeURIComponent(ROTAS[0].rota)}&d=trilhaQueRola`, '.fx-topbar'
      );
      const m = await pagina.evaluate(medirTrilha);
      await pagina.close(); await contexto.close();
      const sumidos = m.erro ? [] : m.degraus.filter((d) => d.fracao < 0.995);
      const reprovou = !m.erro && sumidos.length > 0;
      if (reprovou) mordeu += 1;
      registrar(reprovou, `@${largura.rotulo} ${ROTAS[0].rota} com \`overflow-x: auto\` de volta :: `
        + (m.erro || `${sumidos.length} degrau(s) cortado(s)`
          + (sumidos.length ? `: ${sumidos.map((d) => `"${d.texto}" ${d.naTela}px de ${d.largura}px`).join(' | ')}` : ''))
        + (reprovou ? '' : ' — NÃO reprovou, e devia: esta medição não está medindo'));
    }
    registrar(mordeu === COM_DEFEITO.length,
      `a medição morde a trilha rolante em ${mordeu} de ${COM_DEFEITO.length} largura(s) em que o defeito foi medido`);

    /* =============================================== A9 — o apoio ======== */
    console.log('\n=== A9 — o apoio da faixa mostra o texto inteiro no celular ===');
    for (const largura of LARGURAS) {
      console.log(`\n— ${largura.width}×${largura.height} —`);
      for (const tela of TELAS_APOIO) {
        const { contexto, pagina } = await abrir(
          navegador, servidorApoio, largura, `?tela=${tela}`, '.app-page-lead'
        );
        const m = await pagina.evaluate(medirApoio);
        await pagina.close(); await contexto.close();
        if (m.erro) { registrar(false, `${tela} :: ${m.erro}`); continue; }
        /*
          O CRITÉRIO MUDA COM A LARGURA, e a fronteira é a mesma da folha —
          e do irmão `.app-bloco-lead`: abaixo de 768px não há hover, então
          o `title` não abre e truncar é esconder. De 768 para cima o
          tooltip funciona e a linha única com reticências é o desenho.
        */
        const cortado = m.conteudo > m.caixa + 1;
        const ok = largura.width <= 767 ? !cortado : true;
        registrar(ok, `${tela} :: apoio de ${m.conteudo}px numa caixa de ${m.caixa}px,`
          + ` ${m.linhas} linha(s) (${m.altura}px), faixa de ${m.faixa}px, white-space: ${m.quebra}`
          + (largura.width <= 767
            ? (cortado
              ? ` — CORTADO: ${m.conteudo - m.caixa}px de texto fora da tela, e no toque não há tooltip`
              : ' — texto inteiro na tela')
            : (cortado ? ' — trunca com reticências, e aqui o tooltip alcança' : ' — cabe em uma linha')));
      }
    }

    /* --------------------------------------------------------- mordida -- */
    console.log('\n— mordida A9: o apoio em `nowrap` no celular tem de REPROVAR (≤767) —');
    const CELULAR = LARGURAS.filter((l) => l.width <= 767);
    let mordeu2 = 0;
    for (const largura of CELULAR) {
      for (const tela of TELAS_APOIO) {
        const { contexto, pagina } = await abrir(
          navegador, servidorApoio, largura, `?tela=${tela}&d=nowrapNoCelular`, '.app-page-lead'
        );
        const m = await pagina.evaluate(medirApoio);
        await pagina.close(); await contexto.close();
        const reprovou = !m.erro && m.conteudo > m.caixa + 1;
        if (reprovou) mordeu2 += 1;
        registrar(reprovou, `@${largura.rotulo} ${tela} com \`white-space: nowrap\` de volta :: `
          + (m.erro || `apoio de ${m.conteudo}px numa caixa de ${m.caixa}px`)
          + (reprovou ? ` — ${m.conteudo - m.caixa}px de texto fora` : ' — NÃO reprovou, e devia'));
      }
    }
    const esperadas = CELULAR.length * TELAS_APOIO.length;
    registrar(mordeu2 === esperadas,
      `a medição morde o apoio em nowrap em ${mordeu2} de ${esperadas} medida(s) de celular`);
  } finally {
    await navegador.close();
    servidorBarra.fechar();
    servidorApoio.fechar();
  }

  console.log(`\n[provas] texto que não cabe quebra em linhas: ${falhas === 0 ? 'ok' : `${falhas} medida(s) reprovada(s)`}`);
  /* `exitCode`, nunca `exit()`: a saída vai para pipe e `exit()` trunca com
     bytes na fila. */
  if (falhas) process.exitCode = 1;
}

await main();
