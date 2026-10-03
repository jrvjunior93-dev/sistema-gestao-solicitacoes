#!/usr/bin/env node
/**
 * PROVA — A VISÃO EM QUE A PESSOA ESTÁ APARECE NA TELA.
 * ============================================================================
 *
 * A SUSPEITA S4 do revisor separado (06/09), e ela se confirmou: em
 * `solicitacoes` a 390, "nenhuma visão parece selecionada — a faixa de chips
 * rola na horizontal e o chip ativo fica fora da tela, sem pista de que há
 * rolagem — a pessoa não vê em que visão está".
 *
 * MEDIDO ANTES DO CONSERTO, com a `ListaAvancada` real e o CSS real:
 *
 *   faixa 369px · conteúdo 608px · scrollLeft 0
 *   chip ativo "Todas" em 530→608px — inteiramente fora da faixa visível
 *
 * E não era acidente de dado: a tela declara "Todas" como a ÚLTIMA das cinco
 * visões e abre com `visaoInicial="todas"`. Em todo primeiro carregamento no
 * celular, a visão ativa é a única que não se vê.
 *
 * O CONSERTO está no `lista-avancada.css` e é a REGRA BASE da própria
 * classe, com a exceção do celular removida: a faixa quebra em linhas, como
 * já fazia acima de 768px. A nota inteira, com as duas alternativas
 * descartadas e por quê, está lá.
 *
 * A MORDIDA planta a exceção de volta (`nowrap` + `overflow-x: auto`) e
 * exige que a medição reprove — se ela não reprovar com a tira horizontal de
 * volta, não está medindo nada.
 */
import fs from 'node:fs';
import { chromium } from 'playwright';
import { criarServidorDeFixture } from './servidorCamadas.mjs';

const CELULAR = { width: 390, height: 844 };
const MEDIA = { width: 1366, height: 900 };

/* A exceção que saiu do `lista-avancada.css` — a tira que rola. */
const CSS_TIRA_HORIZONTAL = `
  @media (max-width: 767px) {
    .la-visoes { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 2px; }
  }
`;

let falhas = 0;
const registrar = (ok, texto) => {
  if (!ok) falhas += 1;
  console.log(`${ok ? '  ok   ' : '  FALHA'} ${texto}`);
};

/*
  A MEDIDA: a caixa do chip ativo contra a caixa VISÍVEL da faixa. Não é
  "existe no DOM" — numa tira com `overflow-x: auto` ele existe, tem
  tamanho, e mesmo assim ninguém o vê.
*/
const medir = () => {
  const faixa = document.querySelector('.la-visoes');
  const ativa = document.querySelector('.la-visao.ativa');
  if (!faixa || !ativa) return { erro: 'a faixa de visões não está no DOM' };
  const cf = faixa.getBoundingClientRect();
  const ca = ativa.getBoundingClientRect();
  return {
    rotulo: String(ativa.innerText || '').trim(),
    faixaLargura: Math.round(cf.width),
    faixaAltura: Math.round(cf.height),
    conteudo: Math.round(faixa.scrollWidth),
    scrollLeft: Math.round(faixa.scrollLeft),
    esq: Math.round(ca.left - cf.left),
    dir: Math.round(ca.right - cf.left),
    visivel: ca.left >= cf.left - 1 && ca.right <= cf.right + 1,
    total: document.querySelectorAll('.la-visao').length
  };
};

async function abrir(navegador, servidor, busca, viewport, cssPlantado = '') {
  const contexto = await navegador.newContext({ viewport });
  const pagina = await contexto.newPage();
  const erros = [];
  pagina.on('pageerror', (e) => erros.push(e.message));
  await pagina.goto(servidor.rota(busca), { waitUntil: 'domcontentloaded' });
  await pagina.waitForSelector('.la-visao', { timeout: 15000 });
  if (cssPlantado) await pagina.addStyleTag({ content: cssPlantado });
  await pagina.waitForTimeout(400);
  return { contexto, pagina, erros };
}

async function main() {
  const servidor = await criarServidorDeFixture({
    entrada: 'fixtureVisoes.jsx',
    cssExtra: 'body { margin: 0; }',
    caminho: 'visoes'
  });
  /* SEM PROXY: só fala com 127.0.0.1. */
  const navegador = await chromium.launch({
    executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
    args: ['--no-proxy-server']
  });

  try {
    /* ---------------------------------------------------------------- 1 --
       A VISÃO ATIVA APARECE — na largura do relato, e com a visão que a
       tela abre por padrão (a ÚLTIMA das cinco). */
    console.log('\n— 1. a visão ativa aparece @390 —');
    {
      const { contexto, pagina, erros } = await abrir(navegador, servidor, '', CELULAR);
      const m = await pagina.evaluate(medir);
      registrar(!m.erro, `a faixa montou :: ${m.erro || `${m.total} visões`}`);
      if (!m.erro) {
        registrar(m.visivel,
          `o chip ativo ("${m.rotulo}") está dentro da faixa :: ${m.esq}→${m.dir}px numa faixa de`
          + ` ${m.faixaLargura}px (conteúdo ${m.conteudo}px, ${m.faixaAltura}px de altura)`
          + (m.visivel ? '' : ' — FORA DA TELA, e sem pista de que há rolagem'));
        registrar(m.conteudo <= m.faixaLargura + 1,
          `e nada fica escondido atrás de rolagem horizontal :: conteúdo ${m.conteudo}px em ${m.faixaLargura}px`);
      }
      registrar(erros.length === 0, `nenhum erro de JavaScript${erros.length ? `: ${erros[0]}` : ''}`);
      await contexto.close();
    }

    /* ---------------------------------------------------------------- 2 --
       CADA UMA DAS CINCO, e não só a padrão: se a faixa quebra em linhas,
       nenhuma posição pode esconder o chip. */
    console.log('\n— 2. as cinco visões, uma a uma @390 —');
    for (const id of ['minhas', 'fila_setor', 'vencendo', 'atrasadas', 'todas']) {
      const { contexto, pagina } = await abrir(navegador, servidor, `?visao=${id}`, CELULAR);
      const m = await pagina.evaluate(medir);
      registrar(m.visivel, `visão "${id}" ativa :: chip "${m.rotulo}" em ${m.esq}→${m.dir}px`
        + (m.visivel ? ' — visível' : ' — FORA DA TELA'));
      await contexto.close();
    }

    /* ---------------------------------------------------------------- 3 --
       NÃO-REGRESSÃO NA TELA LARGA: acima de 768px nada muda. */
    console.log('\n— 3. não-regressão @1366 —');
    {
      const { contexto, pagina } = await abrir(navegador, servidor, '', MEDIA);
      const m = await pagina.evaluate(medir);
      registrar(m.visivel && m.faixaAltura <= 60,
        `a faixa segue numa linha só na tela larga :: ${m.faixaAltura}px de altura, chip ativo visível`);
      await contexto.close();
    }

    /* ---------------------------------------------------------------- 4 --
       MORDIDA: a tira horizontal de volta. A medição TEM de acusar. */
    console.log('\n— 4. mordida: a tira que rola de volta —');
    {
      const { contexto, pagina } = await abrir(navegador, servidor, '', CELULAR, CSS_TIRA_HORIZONTAL);
      const m = await pagina.evaluate(medir);
      const acusou = !m.visivel;
      registrar(acusou,
        `com \`nowrap; overflow-x: auto\`, o chip ativo ("${m.rotulo}") volta para ${m.esq}→${m.dir}px`
        + ` numa faixa de ${m.faixaLargura}px (conteúdo ${m.conteudo}px)`
        + (acusou ? ' · a medição ACUSA, como tem de acusar'
          : ' · NÃO ACUSOU, e devia: esta prova não está medindo nada'));
      await contexto.close();
    }
  } finally {
    await navegador.close();
    servidor.fechar();
  }

  console.log(`\n[provas] a visão ativa aparece na tela: ${falhas === 0 ? 'ok' : `${falhas} medida(s) reprovada(s)`}`);
  if (falhas) process.exitCode = 1;
}

await main();
