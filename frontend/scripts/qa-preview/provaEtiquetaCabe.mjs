#!/usr/bin/env node
/**
 * PROVA — A ETIQUETA DE STATUS E O LADRILHO DE DADO NÃO MENTEM.
 * ============================================================================
 *
 * OS TRÊS ACHADOS QUE ISSO FECHA (revisor separado, 06/09 —
 * `docs/ACHADOS-DO-REVISOR-SEPARADO.md`):
 *
 *   A5, e ele o pôs em primeiro lugar: em `pedidos-compra`, a 1920 e a 1366,
 *   TODO pedido lia "Fechado com". O status é "Fechado com o fornecedor". A
 *   pílula fecha normalmente no ponto do corte — não há reticência, não há
 *   borda cortada, não há sinal NENHUM. "Mente sem avisar" foi a frase dele,
 *   e é a razão de este ser o pior da lista: texto ilegível a pessoa
 *   percebe; texto que PARECE completo e não é, não.
 *
 *   A8: a mesma pílula, em `solicitacao-compra-detalhe` a 390, dentro do
 *   ladrilho STATUS: "LIBERADO PARA C".
 *
 *   A12: em `perfil` a 390, o e-mail partido no meio do token —
 *   "qa.visual@fluxy.loc" / "al".
 *
 * ----------------------------------------------------------------------------
 * O QUE ESTA PROVA MEDE, e por que ela não é o X3 nem a
 * `provas/larguraDeColuna.mjs`.
 *
 * A `larguraDeColuna` é ARITMÉTICA da preferência do usuário. O X3 mede a
 * página inteira cabendo em 390. Nenhuma das duas olha DENTRO da célula: as
 * duas passavam verdes enquanto metade do vocabulário de status do sistema
 * era recortada. Esta mede o texto contra a caixa que o contém — pílula por
 * pílula, ladrilho por ladrilho, com o componente e o CSS reais.
 *
 * ----------------------------------------------------------------------------
 * O NÚMERO QUE ELA PRODUZIU, e que virou a correção (passo 1):
 *
 *   corpo de status do sistema: 95 rótulos, colhidos do front e do backend
 *   coluna anterior (132px):    comportava a MEDIANA do corpo
 *   → metade dos status do sistema era recortada, nas 146 colunas
 *     `tipo: 'status'` que existem hoje. Não era defeito de uma tela.
 *
 * A largura passou a 221px = a pílula de "Fechado com o fornecedor" (195px,
 * o rótulo mais largo que o sistema INSTALA) + 26px de recuo da célula. Os
 * seis rótulos do corpo que passam disso — e o nome de status que o
 * administrador pode cadastrar, que não tem teto — são cobertos pela pílula,
 * que passou a QUEBRAR EM LINHAS em vez de cortar.
 *
 * ----------------------------------------------------------------------------
 * AS DUAS MORDIDAS, as duas por CSS plantado na página (o defeito é de
 * cascata, então é em cascata que ele se planta de volta):
 *
 *   1. `white-space: nowrap; overflow: clip` na pílula + a coluna de volta a
 *      132px pela query. É o app de antes de 06/09. A medição TEM de acusar
 *      pílula cortada; se não acusar, ela não está medindo nada.
 *   2. `overflow-wrap: anywhere` no valor do ladrilho — o CSS de antes. Ele
 *      quebra em qualquer letra ANTES de usar os `<wbr>` que o `StatTile`
 *      põe nos separadores, e a medição TEM de acusar quebra no meio do
 *      token.
 *
 * Rode com `npm run provas` ou
 * `node scripts/qa-preview/provaEtiquetaCabe.mjs`.
 */
import fs from 'node:fs';
import { chromium } from 'playwright';
import { criarServidorDeFixture } from './servidorCamadas.mjs';

const LARGA = { width: 1920, height: 1080 };
const MEDIA = { width: 1366, height: 900 };
const CELULAR = { width: 390, height: 844 };

const CSS_FIXTURE = `
  body { margin: 0; }
  .prova-vocabulario { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
`;

/* MORDIDA 1 — a pílula de antes: uma linha só, recorte mudo. */
const CSS_PILULA_ANTIGA = '.fx-badge { white-space: nowrap; overflow: clip; }';

/*
  MORDIDA 2 — E POR QUE ELA NÃO É SÓ CSS.

  A primeira versão desta mordida plantava `overflow-wrap: anywhere` de volta
  no valor do ladrilho e esperava a quebra no meio do token. NÃO ACUSOU — e a
  medição estava certa: com os `<wbr>` do `StatTile` no lugar, `anywhere` e
  `break-word` fazem a MESMA coisa, porque os dois só entram em ação quando
  não há oportunidade de quebra legal, e agora há.

  Isso é informação, não estorvo: quem consertou A12 foram os pontos de
  quebra do componente, e o CSS mudou junto por higiene. Então é o
  COMPONENTE que a mordida tem de desfazer — `comPontosDeQuebra(valor)`
  volta a ser `valor`, que é exatamente o código de antes —, com o CSS
  antigo plantado por cima para reproduzir o estado inteiro.

  O arquivo fica trocado só enquanto o esbuild lê o pacote (a
  `criarServidorDeFixture` empacota de forma síncrona e serve o texto de
  memória depois). Restaurar vai no `finally` E num `process.on('exit')`:
  prova que deixa `src/` plantado é pior que prova nenhuma.
*/
const CSS_VALOR_ANTIGO = '.app-stat-valor { overflow-wrap: anywhere; }';
const COMPONENTE_LADRILHO = new URL('../../src/components/padrao/StatGrid.jsx', import.meta.url);
const COM_PONTOS_DE_QUEBRA = "{vazio ? '—' : comPontosDeQuebra(valor)}";
const SEM_PONTOS_DE_QUEBRA = "{vazio ? '—' : valor}";

async function servidorSemPontosDeQuebra() {
  const original = fs.readFileSync(COMPONENTE_LADRILHO, 'utf8');
  if (!original.includes(COM_PONTOS_DE_QUEBRA)) {
    throw new Error('a mordida não achou os pontos de quebra em StatGrid.jsx — '
      + 'o conserto mudou de forma e esta mordida precisa ser reescrita, não removida');
  }
  const restaurar = () => {
    try {
      if (fs.readFileSync(COMPONENTE_LADRILHO, 'utf8') !== original) {
        fs.writeFileSync(COMPONENTE_LADRILHO, original);
      }
    } catch (_) { /* nada a fazer no caminho de saída */ }
  };
  process.on('exit', restaurar);
  try {
    fs.writeFileSync(COMPONENTE_LADRILHO, original.replace(COM_PONTOS_DE_QUEBRA, SEM_PONTOS_DE_QUEBRA));
    return await criarServidorDeFixture({
      entrada: 'fixtureEtiquetas.jsx',
      cssExtra: CSS_FIXTURE,
      caminho: 'etiquetas-mordida'
    });
  } finally {
    restaurar();
  }
}

let falhas = 0;
const registrar = (ok, texto) => {
  if (!ok) falhas += 1;
  console.log(`${ok ? '  ok   ' : '  FALHA'} ${texto}`);
};

/*
  A MEDIDA DA PÍLULA. `scrollWidth > clientWidth` é o corte: o texto que a
  pílula desenharia é mais largo que a pílula. Não depende de ler o texto na
  tela nem de comparar strings — é a caixa contra o conteúdo dela.
*/
const medirTabela = () => {
  const rolagem = document.querySelector('.resizable-table-scroll');
  const ths = Array.from(document.querySelectorAll('.resizable-table thead th'));
  if (!rolagem || !ths.length) return { erro: 'a tabela não está no DOM' };
  const conteiner = Math.round(rolagem.clientWidth);
  const pilulas = Array.from(document.querySelectorAll('tbody .fx-badge')).map((b) => ({
    texto: String(b.innerText || '').trim(),
    cli: Math.round(b.clientWidth),
    scr: Math.round(b.scrollWidth),
    cortada: b.scrollWidth > b.clientWidth + 1
  }));
  return {
    conteiner,
    colunas: ths.map((th) => ({
      rotulo: String(th.innerText || '').trim().split('\n')[0],
      px: Math.round(th.getBoundingClientRect().width),
      pct: +((th.getBoundingClientRect().width / conteiner) * 100).toFixed(1)
    })),
    pilulas,
    cortadas: pilulas.filter((p) => p.cortada)
  };
};

/*
  A MEDIDA DO LADRILHO — e a única forma honesta de perguntar "quebrou no
  meio do token?".

  O `StatTile` parte o token em pedaços separados por `<wbr>`, e cada pedaço
  é um NÓ DE TEXTO próprio. Se um nó de texto ocupa DUAS alturas diferentes,
  a quebra caiu DENTRO dele — isto é, no meio do token, e não no separador.
  Comparar strings não serviria: o texto renderizado é o mesmo nos dois
  casos, o que muda é onde a linha virou.
*/
const medirLadrilhos = () => {
  const ladrilhos = Array.from(document.querySelectorAll('.app-stat'));
  if (!ladrilhos.length) return { erro: 'nenhum ladrilho no DOM' };
  return {
    ladrilhos: ladrilhos.map((t) => {
      const rotulo = String(t.querySelector('.app-stat-label')?.innerText || '').trim();
      const val = t.querySelector('.app-stat-valor');
      const pilula = t.querySelector('.fx-badge');
      const alturaLinha = parseFloat(getComputedStyle(val).lineHeight) || 21;
      /* SÓ NÓ QUE É TOKEN. Um nó com espaço (uma frase — o nome de uma
         obra, o nome de uma pessoa) ocupar duas linhas é quebra entre
         PALAVRAS, que é o comportamento certo e o que a folha quer. O que
         esta prova procura é a quebra DENTRO de um pedaço sem espaço: aí a
         linha virou no meio de um endereço, de um código, de uma chave.
         A definição de token é a do sistema (`utils/token.js`). */
      const andarilho = document.createTreeWalker(val, NodeFilter.SHOW_TEXT);
      let quebraNoMeio = false;
      for (let no = andarilho.nextNode(); no; no = andarilho.nextNode()) {
        const conteudo = String(no.textContent || '').trim();
        if (!conteudo || /\s/.test(conteudo)) continue;
        const faixa = document.createRange();
        faixa.selectNodeContents(no);
        const topos = new Set(Array.from(faixa.getClientRects()).map((r) => Math.round(r.top)));
        if (topos.size > 1) quebraNoMeio = true;
      }
      return {
        rotulo,
        texto: String(val.innerText || '').trim().replace(/\n/g, ' / '),
        larguraLadrilho: Math.round(t.getBoundingClientRect().width),
        larguraValor: Math.round(val.clientWidth),
        linhas: Math.round(val.getBoundingClientRect().height / alturaLinha),
        quebraNoMeio,
        pilula: pilula
          ? { cli: Math.round(pilula.clientWidth), scr: Math.round(pilula.scrollWidth),
              cortada: pilula.scrollWidth > pilula.clientWidth + 1 }
          : null
      };
    })
  };
};

async function abrir(navegador, servidor, busca, viewport, espera, cssPlantado = '') {
  const contexto = await navegador.newContext({ viewport });
  const pagina = await contexto.newPage();
  const erros = [];
  pagina.on('pageerror', (e) => erros.push(e.message));
  await pagina.goto(servidor.rota(busca), { waitUntil: 'domcontentloaded' });
  await pagina.waitForSelector(espera, { timeout: 15000 });
  if (cssPlantado) await pagina.addStyleTag({ content: cssPlantado });
  await pagina.waitForTimeout(400);
  return { contexto, pagina, erros };
}

async function main() {
  const servidor = await criarServidorDeFixture({
    entrada: 'fixtureEtiquetas.jsx',
    cssExtra: CSS_FIXTURE,
    caminho: 'etiquetas'
  });
  /* SEM PROXY: só fala com 127.0.0.1, e o Chromium herda `http_proxy` do
     ambiente se ninguém disser o contrário. */
  const navegador = await chromium.launch({
    executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
    args: ['--no-proxy-server']
  });

  try {
    /* ---------------------------------------------------------------- 1 --
       A LISTA DE PEDIDOS DE COMPRA, nas duas larguras do achado. Nenhuma
       pílula pode estar cortada — e a largura proporcional de cada coluna
       sai escrita, que é o que o cliente pediu para ver medido. */
    for (const viewport of [LARGA, MEDIA]) {
      console.log(`\n— 1. pedidos de compra @${viewport.width} —`);
      const { contexto, pagina, erros } = await abrir(
        navegador, servidor, '?caso=tabela', viewport, '.resizable-table thead th'
      );
      const m = await pagina.evaluate(medirTabela);
      registrar(!m.erro, `a tabela montou :: ${m.erro || `contêiner ${m.conteiner}px`}`);
      if (!m.erro) {
        console.log(`         colunas: ${m.colunas.map((c) => `${c.rotulo} ${c.px}px (${c.pct}%)`).join(' · ')}`);
        registrar(m.cortadas.length === 0,
          `nenhuma etiqueta de status recortada :: ${m.cortadas.length
            ? `${m.cortadas.length} de ${m.pilulas.length} — ${m.cortadas.map((p) => `"${p.texto}" pede ${p.scr}px e tem ${p.cli}px`).join('; ')}`
            : `${m.pilulas.length} pílulas, todas inteiras (a mais larga: "${m.pilulas.reduce((a, b) => (b.scr > a.scr ? b : a)).texto}")`}`);
        const status = m.colunas.find((c) => c.rotulo === 'STATUS');
        registrar(Boolean(status), `a coluna STATUS existe (nenhuma coluna foi tirada) :: ${status ? `${status.px}px, ${status.pct}% do contêiner` : 'SUMIU'}`);
      }
      registrar(erros.length === 0, `nenhum erro de JavaScript${erros.length ? `: ${erros[0]}` : ''}`);
      await contexto.close();
    }

    /* ---------------------------------------------------------------- 2 --
       OS LADRILHOS A 390: o cartão STATUS do detalhe da compra (A8) e o
       e-mail do perfil (A12), na mesma janela do relato. */
    console.log('\n— 2. ladrilhos de dado @390 (detalhe da compra e perfil) —');
    {
      const { contexto, pagina, erros } = await abrir(
        navegador, servidor, '?caso=ladrilho', CELULAR, '.app-stat'
      );
      const m = await pagina.evaluate(medirLadrilhos);
      registrar(!m.erro, `os ladrilhos montaram :: ${m.erro || `${m.ladrilhos.length} ladrilhos`}`);
      if (!m.erro) {
        const comPilula = m.ladrilhos.filter((t) => t.pilula);
        const cortadas = comPilula.filter((t) => t.pilula.cortada);
        registrar(cortadas.length === 0,
          `a etiqueta do cartão STATUS cabe inteira :: ${cortadas.length
            ? cortadas.map((t) => `"${t.texto}" pede ${t.pilula.scr}px e tem ${t.pilula.cli}px`).join('; ')
            : comPilula.map((t) => `"${t.texto}" em ${t.linhas} linha(s), ${t.pilula.cli}px`).join('; ')}`);
        const quebrados = m.ladrilhos.filter((t) => t.quebraNoMeio);
        registrar(quebrados.length === 0,
          `nenhum token quebrado no meio :: ${quebrados.length
            ? quebrados.map((t) => `[${t.rotulo}] "${t.texto}"`).join('; ')
            : `${m.ladrilhos.length} ladrilhos conferidos, valor com ${m.ladrilhos[0].larguraValor}px de largura`}`);
      }
      registrar(erros.length === 0, `nenhum erro de JavaScript${erros.length ? `: ${erros[0]}` : ''}`);
      await contexto.close();
    }

    /* ---------------------------------------------------------------- 3 --
       MORDIDA 1: a pílula de antes (uma linha, recorte mudo) e a coluna de
       132px de volta. A medição TEM de acusar. */
    console.log('\n— 3. mordida: a pílula de uma linha e a coluna de 132px de volta —');
    {
      const { contexto, pagina } = await abrir(
        navegador, servidor, '?caso=tabela&larguraStatus=132', LARGA,
        '.resizable-table thead th', CSS_PILULA_ANTIGA
      );
      const m = await pagina.evaluate(medirTabela);
      const acusou = m.cortadas.length > 0;
      registrar(acusou,
        `com o CSS de antes, ${m.cortadas.length} de ${m.pilulas.length} pílulas recortadas`
        + (acusou
          ? ` (ex.: "${m.cortadas[0].texto}" pede ${m.cortadas[0].scr}px e tem ${m.cortadas[0].cli}px) · a medição ACUSA, como tem de acusar`
          : ' · NÃO ACUSOU, e devia: esta prova não está medindo nada'));
      await contexto.close();
    }

    /* ---------------------------------------------------------------- 4 --
       MORDIDA 2: o valor do ladrilho quebrando em qualquer letra. */
    console.log('\n— 4. mordida: o ladrilho sem pontos de quebra, como era antes —');
    const plantado = await servidorSemPontosDeQuebra();
    try {
      const { contexto, pagina } = await abrir(
        navegador, plantado, '?caso=ladrilho', CELULAR, '.app-stat', CSS_VALOR_ANTIGO
      );
      const m = await pagina.evaluate(medirLadrilhos);
      const quebrados = m.ladrilhos.filter((t) => t.quebraNoMeio);
      const acusou = quebrados.length > 0;
      registrar(acusou,
        `com \`overflow-wrap: anywhere\`, ${quebrados.length} valor(es) quebram no meio do token`
        + (acusou
          ? ` (${quebrados.map((t) => `[${t.rotulo}] "${t.texto}"`).join('; ')}) · a medição ACUSA, como tem de acusar`
          : ' · NÃO ACUSOU, e devia: a medida de quebra não está medindo nada'));
      await contexto.close();
    } finally {
      plantado.fechar();
    }
  } finally {
    await navegador.close();
    servidor.fechar();
  }

  console.log(`\n[provas] a etiqueta e o ladrilho não mentem: ${falhas === 0 ? 'ok' : `${falhas} medida(s) reprovada(s)`}`);
  /* `exitCode`, nunca `exit()`: a saída vai para pipe e `exit()` trunca com
     bytes na fila. */
  if (falhas) process.exitCode = 1;
}

await main();
