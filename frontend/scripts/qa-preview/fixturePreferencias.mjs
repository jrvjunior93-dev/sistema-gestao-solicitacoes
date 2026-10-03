/**
 * FIXTURE LOCAL DA LEVA DE PREFERÊNCIAS — a página onde os defeitos são
 * PLANTADOS para provar que P1, P2, P3 e P4 mordem.
 * ============================================================================
 *
 * O QUE ESTA FIXTURE É, E O QUE ELA NÃO É — dito antes de qualquer linha,
 * porque a diferença muda o que a prova vale.
 *
 * Ela reproduz o CONTRATO DE DOM E DE REDE das quatro capacidades: as
 * classes que os checks procuram (`.app-colunas-menu`, `.app-colunas-item`,
 * `.app-bloco-recolher`, `.app-filtros-campo`, `.resizable-table`), o
 * comportamento observável de cada uma, e as rotas de preferência
 * (`PUT/DELETE /listas/:lista/preferencias/:tipo` e a carga única
 * `GET /me/preferencias`) servidas por um servidor de memória.
 *
 * Com isso ela prova o que precisa ser provado agora: **que cada um dos
 * quatro checks REPROVA uma situação errada e APROVA a certa**. Um check que
 * nunca reprova é decorativo, e este repositório já achou sete deles numa
 * auditoria só.
 *
 * O que ela NÃO prova: que os componentes REAIS (`TabelaPadrao`,
 * `PainelFiltrosVisiveis`, `BlocoConteudo`, `useFecharAoSair`) cumprem o
 * contrato. Isso quem prova é o próprio harness contra o preview publicado —
 * e é para isso que estes quatro itens existem. A prova irmã do runner
 * (`scripts/provas/itensDoRunnerMordem.mjs`) monta os componentes reais; esta
 * não monta, e o motivo está registrado: os quatro componentes estão sendo
 * escritos AGORA, por quatro agentes em paralelo, e uma fixture presa ao
 * código em movimento provaria o estado de meia hora atrás. Quando a leva
 * assentar, o caminho certo é acrescentar estes quatro casos à fixture viva
 * que já monta os componentes de verdade — a nota fica aqui para que isso
 * não se perca como "já está provado".
 *
 * ----------------------------------------------------------------------------
 * COMO SE USA:  criarServidorDaFixture() → { rota(caso, defeito), zerar(), fechar() }
 *
 * `caso`    — qual capacidade a página desenha: 'colunas' | 'filtros' |
 *             'blocos' | 'camada'. Desenhar as quatro juntas faria um check
 *             encontrar a camada do outro e medir a coisa errada.
 * `defeito` — o que é plantado. Sem defeito, a página OBEDECE: é o controle
 *             negativo, e ele importa tanto quanto os defeitos (check que
 *             morde demais é tão inútil quanto o que não morde).
 */
import http from 'node:http';

/* =====================================================================
   O "BANCO" — memória do processo, com as mesmas rotas do servidor real.
   `zerar()` é chamado entre casos: preferência que vaza de um caso para o
   seguinte inventa resultado (a prova irmã já foi mordida por isso, com o
   localStorage de um caso mudando a tabela do próximo).
   ===================================================================== */
const banco = { listas: {} };

function servirBanco(req, res, url) {
  const carga = /\/api\/me\/preferencias$/.test(url.pathname);
  const porTipo = /^\/api\/listas\/([^/]+)\/preferencias\/([a-z]+)$/.exec(url.pathname);

  if (carga && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ listas: banco.listas, total: Object.keys(banco.listas).length }));
    return true;
  }
  if (porTipo) {
    const [, lista, tipo] = porTipo;
    if (req.method === 'PUT') {
      let corpo = '';
      req.on('data', (p) => { corpo += p; });
      req.on('end', () => {
        try {
          const json = JSON.parse(corpo || '{}');
          banco.listas[lista] = { ...(banco.listas[lista] || {}), [tipo]: json.preferencias };
        } catch { /* corpo inválido: o servidor real recusaria; aqui não importa */ }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
      return true;
    }
    if (req.method === 'DELETE') {
      if (banco.listas[lista]) delete banco.listas[lista][tipo];
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return true;
    }
  }
  return false;
}

/* =====================================================================
   O ESTILO — o mínimo para que as camadas tenham CAIXA e sejam PINTADAS.
   Sem isto, `mirarAlvo` acharia menu de área zero em toda parte e a prova
   mediria o próprio CSS ausente.
   ===================================================================== */
const CSS = `
  body { margin: 0; font: 14px system-ui, sans-serif; background: #eef1f5; color: #12203a; }
  .app-page-header { position: sticky; top: 0; background: #fff; padding: 16px 24px;
                     border-bottom: 1px solid #d8dee8; }
  .layout-main { padding: 24px; }
  .app-bloco { background: #fff; border-radius: 12px; margin-bottom: 16px; padding: 4px 16px 16px; }
  /* A ANATOMIA REAL DO CABECALHO RECOLHIVEL, e nao um botao com o titulo
     dentro. O defeito de 06/09 que reprovou 23 telas vivia justamente no que
     esta fixture nao desenhava: a faixa de acoes (flex: 1 1 auto) ocupa do
     fim do titulo ate a borda direita — 87% do botao, medido — e leva a seta
     dentro dela. Sem essas duas regras o defeito p3CliqueEngolido nao teria
     onde acontecer, e o check continuaria provado contra uma anatomia que a
     tela nao tem. */
  .app-bloco-recolher { display: flex; align-items: center; justify-content: space-between;
                        gap: 10px; width: 100%; text-align: left; background: none;
                        border: 0; padding: 12px 0; cursor: pointer; }
  .app-bloco-titulo { font-size: 18px; margin: 0; }
  .app-bloco-acoes { display: flex; align-items: center; justify-content: flex-end;
                     gap: 8px; flex: 1 1 auto; min-width: 0; }
  .app-bloco-recolher-seta { flex-shrink: 0; width: 16px; height: 16px;
                             border-left: 2px solid #6b7a90; border-bottom: 2px solid #6b7a90;
                             transform: rotate(-45deg); }
  .app-bloco--recolhido .app-bloco-corpo { display: none; }
  .app-filtros { background: #fff; border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; }
  .app-filtros-campos { display: flex; gap: 12px; flex-wrap: wrap; }
  .app-filtros-campo { display: flex; flex-direction: column; gap: 4px; }
  .app-filtros-campo input { padding: 6px 8px; border: 1px solid #c6cfdd; border-radius: 6px; }
  .la-filtros-linha { display: flex; gap: 8px; align-items: center; margin-top: 12px; }
  .app-table-shell { background: #fff; border-radius: 12px; padding: 8px; overflow-x: auto; }
  table.resizable-table { border-collapse: collapse; width: 100%; }
  .resizable-table th, .resizable-table td { padding: 8px 12px; border-bottom: 1px solid #e6eaf1;
                                             text-align: left; white-space: nowrap; }
  .app-mais-wrap { position: relative; display: inline-block; }
  /* left:0, e nao right:0 — o abridor da fixture fica na borda esquerda, e
     ancorar o menu a direita dele o jogava para x NEGATIVO, fora da janela.
     A mira do harness leu isso, com razao, como "nao coube na janela" e
     devolveu SEM DADO em sete casos: a fixture estava plantando um defeito
     que eu nao pedi e escondendo os que eu pedi. (Nada de crase aqui: este
     bloco vive DENTRO de um template literal.) */
  .app-mais-menu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 90;
                   background: #fff; border: 1px solid #d8dee8; border-radius: 10px;
                   box-shadow: 0 12px 32px rgba(18,32,58,.18); padding: 6px; min-width: 260px; }
  .app-colunas-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; }
  .app-colunas-rotulo { display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .app-mais-item { display: block; width: 100%; text-align: left; background: none; border: 0;
                   padding: 8px; cursor: pointer; border-top: 1px solid #e6eaf1; }
  .btn { border: 1px solid #c6cfdd; background: #fff; border-radius: 8px; padding: 6px 12px;
         cursor: pointer; }
  .prova-tampa { position: fixed; z-index: 200; background: rgba(255,0,0,.05); }
  .prova-vazio { height: 700px; }
`;

/* =====================================================================
   A PÁGINA — vanilla, um script só, parametrizado por CASO e DEFEITO.
   ===================================================================== */
function html(caso, defeito) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fixture da leva de preferências</title>
<style>${CSS}</style>
</head><body>
<div class="app-pagina">
  <div class="app-page-header"><h1>Fixture — ${caso}</h1><p>defeito plantado: ${defeito || 'nenhum (controle negativo)'}</p></div>
  <div class="layout-main" id="raiz"></div>
  <div class="prova-vazio"></div>
</div>
<script>
const CASO = ${JSON.stringify(caso)};
const D = ${JSON.stringify(defeito || '')};
const LISTA = 'prova';
const raiz = document.getElementById('raiz');

/* ---- o cliente das rotas de preferência ---------------------------- */
async function carga() {
  if (D === 'p1SoLocalStorage') return null; // não fala com o servidor: é o defeito
  const r = await fetch('/api/me/preferencias');
  return r.json();
}
function gravar(tipo, preferencias) {
  if (D === 'p1SoLocalStorage') {
    localStorage.setItem('prova:' + tipo, JSON.stringify(preferencias));
    return Promise.resolve();
  }
  if (D === 'p3NaoGrava') return Promise.resolve(); // recolhe e não grava
  return fetch('/api/listas/' + LISTA + '/preferencias/' + tipo, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ preferencias })
  });
}
function resetar(tipo) {
  if (D === 'p1SoLocalStorage') { localStorage.removeItem('prova:' + tipo); return Promise.resolve(); }
  return fetch('/api/listas/' + LISTA + '/preferencias/' + tipo, { method: 'DELETE' });
}
function lido(dados, tipo) {
  if (D === 'p1SoLocalStorage') {
    try { return JSON.parse(localStorage.getItem('prova:' + tipo) || 'null'); } catch { return null; }
  }
  return dados && dados.listas && dados.listas[LISTA] ? dados.listas[LISTA][tipo] : null;
}

/* ---- utilidades de montagem ---------------------------------------- */
function el(tag, classe, texto) {
  const n = document.createElement(tag);
  if (classe) n.className = classe;
  if (texto != null) n.textContent = texto;
  return n;
}
function cabecalhoDeColuna(titulo) {
  const th = el('th', 'resizable-th');
  const embrulho = el('span', 'app-th-alinhavel');
  embrulho.appendChild(el('span', 'app-th-botao', titulo));
  // O ícone de alinhamento é o que marca a coluna como DE CONTEÚDO — é por
  // ele que o check separa coluna declarada de coluna de controle/ações.
  embrulho.appendChild(el('span', 'app-th-alinhar', '⇔'));
  th.appendChild(embrulho);
  return th;
}

/* =====================================================================
   CASO "colunas" — P1 (e a camada preferida da P4)
   ===================================================================== */
const COLUNAS = [
  { id: 'c1', titulo: 'CÓDIGO', identidade: true },
  { id: 'c2', titulo: 'Obra' },
  { id: 'c3', titulo: 'Parceiro' },
  { id: 'c4', titulo: 'Vencimento' },
  { id: 'c5', titulo: 'Valor' }
];
const DADOS = [
  { c1: 'SOL-1001', c2: 'Rodovia ES-010', c3: 'Construtora Alfa', c4: '10/09/2026', c5: 'R$ 1.204,50' },
  { c1: 'SOL-1002', c2: 'Ponte do Rio', c3: 'Beta Materiais', c4: '11/09/2026', c5: 'R$ 98.300,00' },
  { c1: 'SOL-1003', c2: 'Terminal Norte', c3: 'Gama Serviços', c4: '12/09/2026', c5: 'R$ 12.000,00' }
];

async function montarColunas() {
  const dados = await carga();
  const salvo = lido(dados, 'colunas');
  let ocultas = new Set((salvo && salvo.ocultas) || []);
  if (D === 'p1NaoPersiste') ocultas = new Set(); // grava e não lê

  const barra = el('div', 'app-mais-wrap app-colunas-wrap');
  const shell = el('div', 'app-table-shell app-tabela');
  const tabela = el('table', 'resizable-table');
  const thead = el('thead'); const tr = el('tr');
  const tbody = el('tbody');

  function desenharTabela() {
    tr.innerHTML = '';
    tbody.innerHTML = '';
    const mostradas = COLUNAS.filter((c) => !ocultas.has(c.id));
    mostradas.forEach((c) => tr.appendChild(cabecalhoDeColuna(c.titulo)));
    const semLinha = D === 'p1SemLinha';
    if (!semLinha) {
      DADOS.forEach((linha) => {
        const l = el('tr');
        /* O DEFEITO: as CÉLULAS não acompanham o cabeçalho. É o caso que
           desalinha a linha inteira e que um check de "sumiu do cabeçalho"
           deixaria passar. */
        const colunasDaLinha = D === 'p1SoCabecalho' ? COLUNAS : mostradas;
        colunasDaLinha.forEach((c) => l.appendChild(el('td', c.identidade ? 'celula-identidade' : '', linha[c.id])));
        tbody.appendChild(l);
      });
    }
  }

  const semPainel = D === 'p1SemPainel';
  const duasColunas = D === 'p1DuasColunas';
  const travadas = D === 'p1ColunasTravadas';
  if (duasColunas) { COLUNAS.length = 2; }

  /*
    A CASCA PRECISA DIZER O QUE A P1 LÊ (06/09).

    A "TabelaPadrao" passou a publicar "data-colunas-declaradas" e
    "data-colunas-ocultaveis" para que a P1 MEÇA quantas colunas são
    travadas, em vez de deduzir. Esta fixture foi escrita antes disso e não
    publicava nada — resultado: o caso "p1SemPainel" deixou de cair no ramo
    "não oferece o painel" e passou a cair no ramo "o preview serve build
    velho". A prova continuava REPROVANDO, mas pelo motivo errado, o que é
    quase pior: mordida que acusa outra coisa não prova o que diz provar.

    "p1ColunasTravadas" é o caso da Setores, que motivou o atributo: quatro
    colunas declaradas e só uma ocultável, porque as outras são a de
    identidade e duas "sempreVisivel" (os campos do formulário de edição na
    linha). Ali a ausência do painel é a decisão CERTA do componente, e a
    P1 tem de devolver N/A — não FALHOU.
  */
  const declaradas = COLUNAS.length;
  const ocultaveis = travadas ? 1 : Math.max(0, declaradas - 1);
  shell.setAttribute('data-colunas-declaradas', String(declaradas));
  shell.setAttribute('data-colunas-ocultaveis', String(ocultaveis));
  shell.setAttribute('data-painel-colunas', (semPainel || duasColunas || travadas) ? 'nao' : 'sim');

  if (!semPainel && !duasColunas && !travadas) {
    const botao = el('button', 'btn btn-outline btn-sm', 'Colunas');
    botao.type = 'button';
    botao.setAttribute('aria-haspopup', 'menu');
    let aberto = false;
    let menu = null;
    const fechar = () => { if (menu) menu.remove(); menu = null; aberto = false; botao.setAttribute('aria-expanded', 'false'); };
    const abrir = () => {
      menu = el('span', 'app-mais-menu app-colunas-menu');
      menu.setAttribute('role', 'menu');
      COLUNAS.forEach((c) => {
        const item = el('span', 'app-colunas-item');
        const rotulo = el('label', 'app-colunas-rotulo');
        const caixa = document.createElement('input');
        caixa.type = 'checkbox';
        caixa.checked = !ocultas.has(c.id);
        // A coluna de identidade é travada — é ela que o item P1 tem de
        // recusar como alvo.
        caixa.disabled = Boolean(c.identidade);
        caixa.addEventListener('change', () => {
          if (D === 'p1NaoEsconde') { caixa.checked = !caixa.checked; return; } // marca e não faz nada
          if (caixa.checked) ocultas.delete(c.id); else ocultas.add(c.id);
          desenharTabela();
          gravar('colunas', { visiveis: COLUNAS.filter((x) => !ocultas.has(x.id)).map((x) => x.id), ocultas: [...ocultas] });
        });
        rotulo.appendChild(caixa);
        rotulo.appendChild(el('span', '', c.titulo));
        item.appendChild(rotulo);
        menu.appendChild(item);
      });
      const restaurar = el('button', 'app-mais-item', 'Restaurar padrão');
      restaurar.type = 'button';
      restaurar.addEventListener('click', () => {
        if (D === 'p1RestauraNao') return; // promete restaurar e não restaura
        ocultas = new Set();
        desenharTabela();
        resetar('colunas');
        fechar();
      });
      menu.appendChild(restaurar);
      barra.appendChild(menu);
      aberto = true;
      botao.setAttribute('aria-expanded', 'true');
      /*
        O DEFEITO DA CAPTURA DO CLIENTE, plantado como ele nasceu no
        sistema (06/09): o menu ancora a borda DIREITA no botão
        (right: 0, que e o que a classe .app-mais-menu do sistema traz)
        e tem largura minima de 260px. O abridor desta fixture fica na
        borda ESQUERDA da pagina — entao a borda esquerda do menu cai em x
        NEGATIVO e metade do painel fica fora da janela, exatamente como no
        painel "Filtros visiveis".

        Nada de coordenada inventada: o defeito e uma ancoragem legitima
        num lugar onde ela nao cabe, que e o caso real que o passo 1b tem
        de pegar. (Sem crase neste bloco: ele vive dentro de um template
        literal.)
      */
      if (D === 'p4VazaDaJanela') {
        menu.style.left = 'auto';
        menu.style.right = '0';
      }
      if (D === 'p1PainelRecortado' || D === 'p4Recortado') {
        // Caixa de layout intacta, nada dela pintado: é o defeito de 05/09
        // que o T2 antigo deixava passar, agora no painel de colunas.
        const caixa = menu.getBoundingClientRect();
        const tampa = el('div', 'prova-tampa');
        tampa.style.left = caixa.left + 'px';
        tampa.style.top = caixa.top + 'px';
        tampa.style.width = caixa.width + 'px';
        tampa.style.height = caixa.height + 'px';
        tampa.style.background = '#fff';
        document.body.appendChild(tampa);
      }
      /* O fechamento ao clicar fora / Esc — o assunto da P4. */
      if (D !== 'p4NaoFechaFora') {
        const aoApontar = (e) => {
          if (barra.contains(e.target)) return;
          document.removeEventListener('mousedown', aoApontar);
          fechar();
          if (D === 'p4NaoReabre') botao.disabled = true;
        };
        document.addEventListener('mousedown', aoApontar);
      }
      if (D !== 'p4NaoFechaEsc') {
        const aoTeclar = (e) => {
          if (e.key !== 'Escape') return;
          document.removeEventListener('keydown', aoTeclar);
          fechar();
        };
        document.addEventListener('keydown', aoTeclar);
      }
      if (D === 'p4MataSelecao') {
        /* O DEFEITO QUE NINGUEM LEMBRA: o fechamento roda no mousedown e
           o onClick da opcao nunca chega — a camada fecha e a selecao
           some. E a troca exata que o levantamento avisou nas 12 camadas
           que fecham por perda de foco com atraso de 120-150ms. */
        menu.addEventListener('mousedown', () => fechar(), true);
      }
      if (D === 'p4SelecaoMorta') {
        menu.querySelectorAll('input').forEach((i) => i.addEventListener('click', (e) => {
          e.preventDefault(); // a caixa não muda de estado
        }));
      }
    };
    botao.addEventListener('click', () => { if (aberto) fechar(); else abrir(); });
    barra.appendChild(botao);
  }

  thead.appendChild(tr);
  tabela.appendChild(thead);
  tabela.appendChild(tbody);
  shell.appendChild(tabela);
  desenharTabela();
  raiz.appendChild(barra);
  raiz.appendChild(shell);
}

/* =====================================================================
   CASO "filtros" — P2
   ===================================================================== */
const FILTROS = [
  { id: 'f0', rotulo: 'Busca', obrigatorio: true },
  { id: 'f1', rotulo: 'Obra' },
  { id: 'f2', rotulo: 'Parceiro' },
  { id: 'f3', rotulo: 'Vencimento' }
];

async function montarFiltros() {
  const dados = await carga();
  const salvo = lido(dados, 'filtros');
  let ocultos = new Set((salvo && salvo.ocultas) || []);
  const valores = {};
  let residual = null;

  const faixa = el('div', 'app-filtros');
  const campos = el('div', 'app-filtros-campos');
  const linha = el('div', 'la-filtros-linha');
  const shell = el('div', 'app-table-shell app-tabela');
  const tabela = el('table', 'resizable-table');
  const thead = el('thead'); const tbody = el('tbody');
  const tr = el('tr');
  ['CÓDIGO', 'Obra', 'Parceiro'].forEach((t) => tr.appendChild(cabecalhoDeColuna(t)));
  thead.appendChild(tr);
  tabela.appendChild(thead); tabela.appendChild(tbody);
  shell.appendChild(tabela);

  function consultar() {
    /* A "consulta": a lista recortada pelos valores dos filtros VISÍVEIS —
       e, no defeito, também pelo valor de um filtro que já saiu da faixa. */
    tbody.innerHTML = '';
    const linhas = DADOS.filter((d) => FILTROS.every((f) => {
      const v = valores[f.id];
      if (!v) return true;
      const escondido = ocultos.has(f.id);
      if (escondido && D !== 'p2NaoLimpa') return true; // escondeu, limpou
      if (f.id === 'f1') return String(d.c2).toLowerCase().includes(v.toLowerCase());
      if (f.id === 'f2') return String(d.c3).toLowerCase().includes(v.toLowerCase());
      if (f.id === 'f3') return String(d.c4).includes(v);
      return String(d.c1).toLowerCase().includes(v.toLowerCase());
    }));
    linhas.forEach((d) => {
      const l = el('tr');
      [d.c1, d.c2, d.c3].forEach((t) => l.appendChild(el('td', '', t)));
      tbody.appendChild(l);
    });
  }

  function desenharCampos() {
    campos.innerHTML = '';
    if (residual) campos.appendChild(residual);
    FILTROS.filter((f) => !ocultos.has(f.id)).forEach((f) => {
      const rotulo = el('label', 'app-filtros-campo');
      rotulo.setAttribute('data-tipo', 'text');
      rotulo.appendChild(el('span', 'app-filtros-campo-rotulo', f.rotulo));
      const campo = document.createElement('input');
      campo.type = 'text';
      campo.value = valores[f.id] || '';
      campo.addEventListener('input', () => { valores[f.id] = campo.value; consultar(); });
      rotulo.appendChild(campo);
      campos.appendChild(rotulo);
    });
  }

  const semSeletor = D === 'p2SemSeletor';
  if (!semSeletor) {
    const wrap = el('span', 'app-mais-wrap');
    const botao = el('button', 'btn btn-outline btn-sm', 'Filtros visíveis');
    botao.type = 'button';
    botao.title = 'Escolher quais filtros aparecem nesta tela';
    let menu = null;
    const fechar = () => { if (menu) menu.remove(); menu = null; botao.setAttribute('aria-expanded', 'false'); };
    const abrir = () => {
      menu = el('span', 'app-mais-menu app-colunas-menu');
      menu.setAttribute('role', 'menu');
      FILTROS.forEach((f) => {
        const visivel = !ocultos.has(f.id);
        const preenchido = Boolean(valores[f.id]);
        // O DEFEITO: o filtro preenchido some da lista — quem preencheu
        // perde o caminho de escondê-lo.
        if (D === 'p2SumiuDaLista' && preenchido) return;
        const item = el('span', 'app-colunas-item');
        const rot = el('label', 'app-colunas-rotulo');
        const caixa = document.createElement('input');
        caixa.type = 'checkbox';
        caixa.checked = visivel;
        // O DEFEITO: bloquear em vez de avisar — a saída que o N53 recusou.
        caixa.disabled = Boolean(f.obrigatorio) || (D === 'p2CaixaDesabilitada' && preenchido);
        caixa.addEventListener('change', () => {
          if (caixa.checked) ocultos.delete(f.id);
          else {
            ocultos.add(f.id);
            if (D === 'p2CampoResidual') {
              /* Some da faixa, some do recorte… e continua no DOM com o
                 valor dentro. É a forma de "recortando escondido" que só um
                 check que olha o campo pega. */
              residual = el('label', 'app-filtros-campo');
              residual.style.width = '2px';
              residual.style.overflow = 'hidden';
              residual.appendChild(el('span', 'app-filtros-campo-rotulo', f.rotulo));
              const c = document.createElement('input');
              c.type = 'text'; c.value = valores[f.id] || '';
              residual.appendChild(c);
            }
            if (D !== 'p2NaoLimpa' && D !== 'p2CampoResidual') valores[f.id] = '';
            if (D === 'p2CampoResidual') valores[f.id] = '';
          }
          desenharCampos();
          consultar();
          gravar('filtros', {
            visiveis: FILTROS.filter((x) => !ocultos.has(x.id)).map((x) => x.id),
            ocultas: [...ocultos]
          });
        });
        rot.appendChild(caixa);
        rot.appendChild(el('span', '', f.rotulo + (preenchido && !f.obrigatorio ? ' — preenchido: esconder limpa e refaz a consulta' : '')));
        item.appendChild(rot);
        menu.appendChild(item);
      });
      const restaurar = el('button', 'app-mais-item', 'Restaurar padrão');
      restaurar.type = 'button';
      restaurar.addEventListener('click', () => {
        ocultos = new Set(); residual = null;
        desenharCampos(); consultar(); resetar('filtros'); fechar();
      });
      menu.appendChild(restaurar);
      wrap.appendChild(menu);
      botao.setAttribute('aria-expanded', 'true');
      const aoApontar = (e) => {
        if (wrap.contains(e.target)) return;
        document.removeEventListener('mousedown', aoApontar); fechar();
      };
      document.addEventListener('mousedown', aoApontar);
      const aoTeclar = (e) => {
        if (e.key !== 'Escape') return;
        document.removeEventListener('keydown', aoTeclar); fechar();
      };
      document.addEventListener('keydown', aoTeclar);
    };
    botao.addEventListener('click', () => { if (menu) fechar(); else abrir(); });
    wrap.appendChild(botao);
    linha.appendChild(wrap);
  }

  faixa.appendChild(campos);
  faixa.appendChild(linha);
  desenharCampos();
  consultar();
  raiz.appendChild(faixa);
  raiz.appendChild(shell);
}

/* =====================================================================
   CASO "blocos" — P3
   ===================================================================== */
async function montarBlocos() {
  if (D === 'p3SemBloco') {
    const bloco = el('section', 'app-bloco');
    bloco.appendChild(el('h2', 'app-bloco-titulo', 'Resumo'));
    bloco.appendChild(el('div', 'app-bloco-corpo', 'Bloco que não recolhe.'));
    raiz.appendChild(bloco);
    return;
  }
  const dados = await carga();
  const salvo = lido(dados, 'blocos') || {};

  /*
    O SENTIDO DE VOLTA — recolher que devolve o bloco ao PADRÃO (06/09).

    Esta fixture só sabia desenhar o sentido de IDA: bloco cujo padrão é
    ABERTO, que o clique recolhe, gravando o desvio com um PUT. Só que o
    componente grava DESVIO e nunca estado, então existe um segundo sentido,
    e ele é metade das telas reais: bloco com recolhidoPadrao (padrão =
    recolhido) que está ABERTO por um desvio já salvo. Recolher ali devolve
    o bloco ao padrão, e voltar ao padrão APAGA o registro — sai um DELETE,
    não um PUT.

    Medido no preview em 06/09 (build 5fbcd89), nas quatro telas que o P3
    ainda reprovava: as quatro mandavam DELETE, as quatro estavam CERTAS, e
    quem errava era o check, que só contava PUT/POST como gravação. A
    fixture não tinha como pegar isso porque não desenhava este sentido.

    Um bloco só, e não dois, porque no sistema real cada bloco é uma LISTA
    própria: apagar o desvio apaga a entrada inteira, e é isso que vira
    DELETE. Com dois blocos na mesma lista sobraria a chave do outro e o
    caminho seria um PUT — a fixture estaria desenhando outra coisa.
  */
  if (D === 'p3VoltaAoPadrao' || D === 'p3ResetNaoLe' || D === 'p3TodosRecolhidos' || D === 'p3RestauraNao') {
    const titulo = 'Histórico';
    const chave = 'b0';
    const PADRAO_RECOLHIDO = true;

    /*
      A SEMENTE, UMA VEZ SÓ. O estado que o check encontra nas telas reais é
      "já tem desvio salvo", e é ele que precisa existir aqui antes do
      primeiro clique. A marca vive no sessionStorage porque ela tem de
      sobreviver ao page.reload() do check e NÃO pode sobreviver ao apagar:
      se a semente olhasse o banco, ela renasceria logo depois do DELETE e a
      recarga mostraria o bloco aberto de novo — a fixture plantando um
      defeito que ninguém pediu.
    */
    /*
      SEM SEMENTE nos dois casos novos: eles existem justamente para desenhar
      a tela que o item NAO conseguia medir — bloco com recolhidoPadrao e
      NENHUM desvio salvo, que nasce recolhido e nao oferece nada para
      recolher. Ali o sentido do item tem de virar sozinho para ABRIR.
    */
    const SEMEAR = D === 'p3VoltaAoPadrao' || D === 'p3ResetNaoLe';
    let jaSemeado = false;
    try { jaSemeado = sessionStorage.getItem('prova:blocos:semeado') === '1'; } catch { jaSemeado = false; }
    if (SEMEAR && !jaSemeado) {
      try { sessionStorage.setItem('prova:blocos:semeado', '1'); } catch { /* sem sessionStorage: segue sem marca */ }
      salvo[chave] = true;
      gravar('blocos', { ...salvo });
    }
    const desvio = Boolean(salvo[chave]);
    // p3ResetNaoLe: apaga o registro e NAO le o apagamento — na recarga o
    // bloco volta aberto, que é "grava e não lê" no sentido de volta.
    let recolhido = D === 'p3ResetNaoLe' ? false : (desvio ? !PADRAO_RECOLHIDO : PADRAO_RECOLHIDO);

    const bloco = el('section', 'app-bloco');
    const botao = el('button', 'app-bloco-recolher');
    botao.type = 'button';
    botao.appendChild(el('h2', 'app-bloco-titulo', titulo));
    const acoes = el('span', 'app-bloco-acoes');
    acoes.appendChild(el('span', 'app-bloco-recolher-seta'));
    botao.appendChild(acoes);
    const corpo = el('div', 'app-bloco-corpo', 'Conteúdo de ' + titulo);
    const pintar = () => {
      botao.setAttribute('aria-expanded', String(!recolhido));
      bloco.classList.toggle('app-bloco--recolhido', recolhido);
    };
    botao.addEventListener('click', () => {
      /*
        p3RestauraNao — A RESTAURACAO QUE FALHA, plantada de proposito.

        O bloco sai do padrao e NUNCA volta: medir funciona, gravar funciona,
        o F5 funciona, e o item ainda assim tem de REPROVAR — porque deixar a
        preferencia do usuario de QA mexida faz a proxima corrida comecar
        suja. Foi exatamente esse buraco que produziu, em 06/09, a reprovacao
        que se auto-alimentava e que ninguem via.
      */
      if (D === 'p3RestauraNao' && recolhido !== PADRAO_RECOLHIDO) return;
      recolhido = !recolhido;
      pintar();
      if (recolhido !== PADRAO_RECOLHIDO) {
        salvo[chave] = true;
        gravar('blocos', { ...salvo });      // desvio: PUT
      } else {
        delete salvo[chave];
        resetar('blocos');                    // de volta ao padrão: DELETE
      }
    });
    pintar();
    bloco.appendChild(botao);
    bloco.appendChild(corpo);
    raiz.appendChild(bloco);
    return;
  }

  ['Histórico', 'Auditoria'].forEach((titulo, i) => {
    const chave = 'b' + i;
    let recolhido = D === 'p3NaoLe' ? false : Boolean(salvo[chave]);
    const bloco = el('section', 'app-bloco');
    const botao = el('button', 'app-bloco-recolher');
    botao.type = 'button';
    botao.appendChild(el('h2', 'app-bloco-titulo', titulo));

    /*
      O CABEÇALHO INTEIRO, COMO A TELA O DESENHA (06/09).

      Antes daqui o botão tinha só o <h2> dentro, e por isso a fixture não
      conseguia reproduzir o defeito que a matriz achou em 23 telas: a faixa
      .app-bloco-acoes cresce (flex: 1 1 auto) do fim do título até a borda
      direita e LEVA A SETA DENTRO DELA; um stopPropagation posto nessa
      faixa mata todo clique do centro do botão para a direita — inclusive o
      clique na própria seta — e o aria-expanded fica preso em "true". O
      botão está lá, recebe o clique, e o estado não vira. (Sem crase aqui:
      este bloco vive DENTRO de um template literal.)

      É um defeito de ALCANCE do stopPropagation, não de handler ausente: o
      p3NaoRecolhe (que planta um return no handler) passa longe dele.
      Por isso a fixture desenha a faixa SEMPRE, e o defeito novo muda só
      ONDE o stopPropagation mora.
    */
    const acoes = el('span', 'app-bloco-acoes');
    const conteudoDaAcao = el('span', 'badge', 'auditoria');
    const engoleTudo = D === 'p3CliqueEngolido';
    if (engoleTudo) {
      // O DEFEITO: a faixa inteira engole — a seta e o vazio junto.
      acoes.appendChild(conteudoDaAcao);
      acoes.addEventListener('click', (e) => e.stopPropagation());
    } else {
      // O CERTO: só o conteúdo da ação engole, num invólucro sem caixa.
      const estojo = el('span', '');
      estojo.style.display = 'contents';
      estojo.addEventListener('click', (e) => e.stopPropagation());
      estojo.appendChild(conteudoDaAcao);
      acoes.appendChild(estojo);
    }
    acoes.appendChild(el('span', 'app-bloco-recolher-seta'));
    botao.appendChild(acoes);

    const corpo = el('div', 'app-bloco-corpo', 'Conteúdo de ' + titulo);
    const pintar = () => {
      botao.setAttribute('aria-expanded', String(!recolhido));
      bloco.classList.toggle('app-bloco--recolhido', recolhido);
    };
    botao.addEventListener('click', () => {
      if (D === 'p3NaoRecolhe') return; // o botão está lá e não recolhe
      recolhido = !recolhido;
      pintar();
      const proximo = { ...salvo };
      if (recolhido) proximo[chave] = true; else delete proximo[chave];
      salvo[chave] = recolhido || undefined;
      gravar('blocos', proximo);
    });
    pintar();
    bloco.appendChild(botao);
    bloco.appendChild(corpo);
    raiz.appendChild(bloco);
  });
}

/* =====================================================================
   CASO "camada" — P4 numa camada SEM opção de marcação (só ações)
   ===================================================================== */
function montarCamada() {
  const wrap = el('span', 'app-mais-wrap');
  const botao = el('button', 'btn', '⋯');
  botao.type = 'button';
  botao.setAttribute('aria-haspopup', 'menu');
  let menu = null;
  const fechar = () => { if (menu) menu.remove(); menu = null; };
  botao.addEventListener('click', () => {
    if (menu) { fechar(); return; }
    menu = el('span', 'app-mais-menu');
    menu.setAttribute('role', 'menu');
    ['Exportar', 'Duplicar', 'Excluir'].forEach((t) => {
      const item = el('button', 'app-mais-item', t);
      item.type = 'button';
      menu.appendChild(item);
    });
    wrap.appendChild(menu);
    const aoApontar = (e) => {
      if (wrap.contains(e.target)) return;
      document.removeEventListener('mousedown', aoApontar); fechar();
    };
    document.addEventListener('mousedown', aoApontar);
    const aoTeclar = (e) => {
      if (e.key !== 'Escape') return;
      document.removeEventListener('keydown', aoTeclar); fechar();
    };
    document.addEventListener('keydown', aoTeclar);
  });
  wrap.appendChild(botao);
  raiz.appendChild(wrap);
}

if (CASO === 'colunas') montarColunas();
else if (CASO === 'filtros') montarFiltros();
else if (CASO === 'blocos') montarBlocos();
else montarCamada();
</script>
</body></html>`;
}

export async function criarServidorDaFixture() {
  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (servirBanco(req, res, url)) return;
    const caso = url.searchParams.get('caso') || 'colunas';
    const defeito = url.searchParams.get('d') || '';
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html(caso, defeito));
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  const porta = servidor.address().port;
  return {
    porta,
    rota: (caso, defeito) => `http://127.0.0.1:${porta}/prova?caso=${caso}&d=${defeito || ''}`,
    zerar: () => { banco.listas = {}; },
    fechar: () => servidor.close()
  };
}
