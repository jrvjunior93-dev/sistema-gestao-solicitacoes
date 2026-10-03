// =====================================================================
// VERIFICAÇÃO DE LINKS MORTOS E DESTINOS PERDIDOS
// ---------------------------------------------------------------------
// 1. Todo destino da fonte única de navegação precisa casar com uma
//    rota declarada no App.jsx (a aplicação não tem rota curinga: um
//    destino errado dá tela branca silenciosa).
// 2. Nenhum destino da navegação antiga (sidebar do Layout.jsx antes da
//    reforma) pode ter sido perdido.
// Uso: node scripts/validarNavegacao.mjs  (sai com código 1 se falhar)
// =====================================================================
import { createServer } from 'vite';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// --- Destinos da navegação antiga (extraídos do Layout.jsx pré-reforma) ---
const DESTINOS_ANTIGOS = [
  '/', '/solicitacoes', '/solicitacoes/relatorios', '/solicitacoes-arquivadas',
  '/prioridades-diretoria', '/nova-solicitacao', '/comunicacao-interna',
  '/arquivos-modelos', '/treinamento',
  '/solicitacoes-compra', '/solicitacoes-compra/nova', '/pedidos-compra',
  '/compras/delegacao', '/compras/relatorios', '/cotacoes', '/gestao-fornecedores',
  '/configuracoes-cotacao', '/gestao-insumos', '/gestao-unidades', '/gestao-categorias',
  '/financeiro/contas-a-receber', '/financeiro/contas-a-pagar',
  '/financeiro/cheques-terceiros', '/financeiro/baixas-compostas',
  '/financeiro/bancos', '/financeiro/financiamentos-bancarios',
  '/financeiro/pagamentos', '/financeiro/dda', '/financeiro/boletos',
  '/financeiro/faturas-cartao', '/financeiro/relatorios', '/financeiro/baixas',
  '/financeiro/conciliacao', '/financeiro/caixas', '/financeiro/cadastros',
  '/comprovantes/upload', '/comprovantes/pendentes', '/custos-recebiveis',
  '/fiscal', '/fiscal/relatorios', '/fiscal/empresas', '/fiscal/empresas#certificados',
  '/fiscal/diagnostico', '/fiscal/documentos', '/fiscal/divergencias',
  '/fiscal/exportacao-contabil', '/fiscal/logs',
  '/crm/dashboard', '/crm/relatorios', '/crm/inbox', '/crm/leads', '/crm/carteira',
  '/crm/leads/novo', '/crm/kanban', '/crm/tarefas', '/crm/automacoes',
  '/crm/admin/canais', '/crm/admin/numeros', '/crm/admin/integracoes',
  '/comercial/relatorios', '/comercial/empreendimentos', '/comercial/unidades',
  '/comercial/mapa-unidades', '/comercial/tabelas-preco', '/comercial/contratos',
  '/comercial/modelos-contrato',
  '/provisoes-financeiras/dashboard', '/provisoes-financeiras/relatorios',
  '/provisoes-financeiras', '/provisoes-financeiras/nova', '/provisoes-financeiras/categorias',
  '/rh-dp', '/rh-dp/relatorios', '/rh-dp/colaboradores', '/rh-dp/documentos',
  '/rh-dp/importacoes', '/rh-dp/apuracao', '/rh-dp/fechamentos',
  // SST modo completo
  '/sst', '/sst/relatorios/centro-operacional', '/sst/relatorios/executivo',
  '/sst/relatorios/heatmap', '/sst/observabilidade', '/sst/producao',
  '/sst/observabilidade-avancada', '/sst/timeline', '/sst/relatorios',
  '/sst/riscos', '/sst/ambientes', '/sst/exposicoes', '/sst/aso', '/sst/exames',
  '/sst/epi', '/sst/treinamentos', '/sst/acidentes', '/sst/documentos',
  '/sst/esocial', '/sst/eventos', '/sst/pendencias', '/sst/bloqueios',
  '/sst/notificacoes', '/sst/scores', '/sst/recomendacoes', '/sst/telemetria',
  '/sst/alertas_operacionais', '/sst/workflow_execucoes', '/sst/politicas_bloqueio',
  '/sst/workflows', '/sst/workflow_acoes', '/sst/rollout_planos',
  '/sst/hardening_policies', '/sst/criticidades', '/sst/configuracoes',
  // SST modo simplificado
  '/sst/pgr', '/sst/pcmso', '/sst/ltcat', '/sst/avaliacoes_quantitativas',
  '/usuarios', '/empresas-grupo', '/obras', '/gestao-apropriacoes', '/setores',
  '/tipos-solicitacao', '/parceiros', '/parceiros-categorias',
  '/contratos/relatorios', '/gestao-contratos',
  '/governanca', '/governanca/auditoria-operacional',
  '/configuracoes', '/usuarios-acesso-prioridade-diretoria',
  '/usuarios-envio-qualquer-setor', '/tipos-compartilhados-setor',
  '/automacao-status-setor', '/configuracoes-status-pedidos-compra',
  '/configuracoes-comercial-categorias', '/configuracoes-modulos',
  '/configuracoes-notificacoes-sistema', '/arquivos-modelos-config',
  '/perfil'
];

function extrairRotasDoApp() {
  const src = readFileSync(path.join(raiz, 'src/App.jsx'), 'utf8');
  const rotas = new Set();
  for (const match of src.matchAll(/path="([^"]+)"/g)) {
    const p = match[1];
    rotas.add(p.startsWith('/') ? p : `/${p}`);
  }
  // rota index de "/"
  if (src.includes('<Route index')) rotas.add('/');
  return [...rotas];
}

/**
 * Destinos que continuam ALCANÇÁVEIS por redirecionamento (02/09).
 *
 * Quando uma tela sai do menu por decisão do cliente, o destino antigo não
 * some: vira `<Route path="X" element={<Navigate to="Y" replace />} />`, para
 * que favorito, link salvo e atalho continuem chegando. Isso NÃO é destino
 * perdido — é destino preservado por outro caminho, e o check precisa saber
 * ler a diferença.
 *
 * Leitura automática do próprio App.jsx, de propósito: lista de exceção
 * escrita à mão envelhece e vira mentira. Aqui, se o redirecionamento for
 * apagado um dia, o destino volta a acusar perda no mesmo instante.
 */
function extrairRedirecionamentos() {
  const src = readFileSync(path.join(raiz, 'src/App.jsx'), 'utf8');
  const mapa = new Map();
  const padrao = /path="([^"]+)"\s+element=\{<Navigate\s+to="([^"]+)"/g;
  for (const match of src.matchAll(padrao)) {
    const de = match[1].startsWith('/') ? match[1] : `/${match[1]}`;
    mapa.set(de, match[2]);
  }

  /*
    SEGUNDA FORMA DE REDIRECIONAR (05/09) — e o check conhecia uma so.

    O padrao acima acha `element={<Navigate to="...">}` escrito direto na
    rota. Mas neste repositorio a outra metade dos redirecionamentos mora
    num COMPONENTE DE GUARDA: `<Route path="sst" element={<SstDashboardRoute>
    <SstDashboard /></SstDashboardRoute>} />`, e e o guarda que faz o
    `<Navigate>`.

    Isso apareceu quando o modo simplificado do SST tirou 12 telas do
    catalogo de destinos: o check acusou 30 "destinos perdidos" e mandou
    declarar o redirecionamento — que ja existia, escrito da outra forma.
    Check que manda fazer o que ja esta feito nao protege: ensina a ignorar.

    O criterio para aceitar e o mesmo da varredura de alcance: guarda que
    redireciona por CONSTANTE (configuracao) redireciona para todo mundo, e
    portanto preserva o destino de verdade. Guarda que redireciona por
    PERMISSAO nao entra — ali a tela existe e abre para quem pode.
  */
  const guardas = new Map();
  for (const m of src.matchAll(/function\s+(\w+)\s*\(\s*\{[^}]*\}\s*\)\s*\{/g)) {
    let i = m.index + m[0].length;
    let profundidade = 1;
    while (i < src.length && profundidade > 0) {
      if (src[i] === '{') profundidade += 1;
      else if (src[i] === '}') profundidade -= 1;
      i += 1;
    }
    const corpo = src.slice(m.index, i);
    const porConstante = corpo.match(/if\s*\(\s*[A-Z][A-Z0-9_]{2,}\s*\)\s*\{?\s*return\s*<Navigate\s+to=\{?([^}\n]+)/);
    if (porConstante) guardas.set(m[1], porConstante[1].trim().replace(/["'>\s]+$/, ''));
  }
  for (const m of src.matchAll(/path="([^"]+)"[^\n]*/g)) {
    if (/<Navigate/.test(m[0])) continue;
    for (const c of m[0].matchAll(/<(\w+)/g)) {
      if (!guardas.has(c[1])) continue;
      const de = m[1].startsWith('/') ? m[1] : `/${m[1]}`;
      if (!mapa.has(de)) mapa.set(de, `${guardas.get(c[1])} (via ${c[1]})`);
      break;
    }
  }
  /*
    TERCEIRA FORMA: a PROPRIA TELA redireciona (05/09).

    Depois de ensinar a guarda, sobraram 19 — todos `/sst/<recurso>`, que
    caem na rota curinga `sst/:resource`. Quem redireciona ali nao e guarda
    nenhuma: e a SstCrudPage, com
    `if (!isSstResourceVisible(resource)) return <Navigate to="/sst" />`.

    Mesmo criterio das outras duas: a condicao vem de um helper de
    `constants/` (configuracao, igual para todo mundo), nao de `user`. Uma
    rota curinga cujo componente redireciona por configuracao preserva
    TODOS os destinos que caem nela.
  */
  const rotasCuringa = [];
  for (const m of src.matchAll(/path="([^"]+:[^"]*)"[^\n]*/g)) {
    for (const c of m[0].matchAll(/<(\w+)/g)) {
      const imp = src.match(new RegExp(`(?:const|let)\\s+${c[1]}\\s*=\\s*(?:React\\.)?lazy\\(\\s*\\(\\)\\s*=>\\s*import\\(\\s*'([^']+)'`));
      if (!imp) continue;
      let arq = imp[1].replace('./', 'src/');
      if (!arq.endsWith('.jsx')) arq += '.jsx';
      const completo = path.join(raiz, arq);
      if (!existsSync(completo)) continue;
      const codigo = readFileSync(completo, 'utf8');
      const deConstantes = new Set();
      for (const i2 of codigo.matchAll(/import\s*\{([^}]+)\}\s*from\s*'[^']*constants[^']*'/g)) {
        i2[1].split(',').forEach((n) => deConstantes.add(n.trim().split(/\s+as\s+/).pop()));
      }
      if (!deConstantes.size) continue;
      for (const cond of codigo.matchAll(/if\s*\((.{1,160}?)\)\s*\{?\s*return\s*<Navigate\s+to=\{?([^}\n]+)/g)) {
        if (/\buser\b|\bperfil\b|\bpermiss/i.test(cond[1])) continue;
        if (![...deConstantes].some((n) => new RegExp(`\\b${n}\\b`).test(cond[1]))) continue;
        const prefixo = (m[1].startsWith('/') ? m[1] : `/${m[1]}`).split('/:')[0];
        rotasCuringa.push({ prefixo, destino: `${cond[2].trim().replace(/["'>\s]+$/, '')} (via ${c[1]})` });
        break;
      }
      break;
    }
  }
  mapa.curingas = rotasCuringa;
  return mapa;
}

function rotaCasa(destino, rota) {
  const d = destino.split('#')[0].split('?')[0];
  if (d === rota) return true;
  const segD = d.split('/').filter(Boolean);
  const segR = rota.split('/').filter(Boolean);
  if (segD.length !== segR.length) return false;
  return segR.every((seg, i) => seg.startsWith(':') || seg === segD[i]);
}

const rotas = extrairRotasDoApp();

const server = await createServer({
  root: raiz,
  logLevel: 'error',
  server: { middlewareMode: true }
});

try {
  const nav = await server.ssrLoadModule('/src/navigation/navigationConfig.jsx');
  const destinos = nav.getAllDestinations();

  let falhas = 0;

  console.log(`Rotas declaradas no App.jsx: ${rotas.length}`);
  console.log(`Destinos na fonte de navegação: ${destinos.length}`);

  // 1) Nenhum link morto na fonte de navegação
  for (const destino of destinos) {
    const ok = rotas.some((rota) => rotaCasa(destino.to, rota));
    if (!ok) {
      falhas += 1;
      console.error(`LINK MORTO: ${destino.moduleId}/${destino.id} → ${destino.to}`);
    }
  }

  // 2) Nenhum destino da navegação antiga foi perdido
  const alvos = new Set(destinos.map((d) => d.to.split('#')[0].split('?')[0]));
  alvos.add('/'); // hub principal substitui a raiz
  alvos.add('/dashboard'); // dashboard executivo movido de / para /dashboard
  const redirecionamentos = extrairRedirecionamentos();
  for (const antigo of DESTINOS_ANTIGOS) {
    const chave = antigo.split('#')[0];
    const coberto = antigo === '/'
      ? alvos.has('/dashboard')
      : alvos.has(chave) || destinos.some((d) => d.to === antigo)
        || (redirecionamentos.curingas || []).some((c) => chave.startsWith(`${c.prefixo}/`));
    if (coberto) continue;
    // Saiu do menu, mas o App.jsx redireciona: destino preservado.
    if (redirecionamentos.has(chave)) {
      console.log(`  destino fora do menu, preservado por redirecionamento: ${chave} → ${redirecionamentos.get(chave)}`);
      continue;
    }
    falhas += 1;
    console.error(`DESTINO PERDIDO da navegação antiga: ${antigo} — se a saída do menu foi intencional, declare o redirecionamento em App.jsx (<Navigate to=...>) para não quebrar favorito e link salvo.`);
  }

  // 3) Catálogo de blocos: o backend valida a config do admin contra uma
  //    CÓPIA do catálogo do frontend (BLOCOS_POR_TELA no
  //    DetalheLayoutController). Se alguém criar/remover um bloco num
  //    lado e esquecer o outro, a tela de admin passa a oferecer card
  //    inexistente ou a recusar card válido — este check falha ANTES.
  const blocosDetalheMod = await server.ssrLoadModule('/src/pages/SolicitacaoDetalhe/blocosDetalhe.js');
  const blocosHomeMod = await server.ssrLoadModule('/src/navigation/blocosHome.js');
  const catalogosFrontend = {
    'detalhe-solicitacao': blocosDetalheMod.BLOCOS_DETALHE.map((b) => b.id),
    home: blocosHomeMod.BLOCOS_HOME.map((b) => b.id)
  };
  const controllerPath = path.join(raiz, '../backend/src/controllers/DetalheLayoutController.js');
  const controllerSrc = readFileSync(controllerPath, 'utf8');
  const extrairSetBackend = (tela) => {
    const marcador = tela === 'home' ? /home:\s*new Set\(\[([^\]]*)\]\)/ : /'detalhe-solicitacao':\s*new Set\(\[([^\]]*)\]\)/;
    const m = controllerSrc.match(marcador);
    if (!m) return null;
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  };
  for (const [tela, idsFrontend] of Object.entries(catalogosFrontend)) {
    const idsBackend = extrairSetBackend(tela);
    if (!idsBackend) {
      falhas += 1;
      console.error(`CATÁLOGO DE BLOCOS: não achei o Set da tela '${tela}' em ${controllerPath}`);
      continue;
    }
    const front = new Set(idsFrontend);
    const back = new Set(idsBackend);
    for (const id of front) {
      if (!back.has(id)) {
        falhas += 1;
        console.error(`CATÁLOGO DE BLOCOS divergente ('${tela}'): '${id}' existe no frontend e falta no DetalheLayoutController`);
      }
    }
    for (const id of back) {
      if (!front.has(id)) {
        falhas += 1;
        console.error(`CATÁLOGO DE BLOCOS divergente ('${tela}'): '${id}' existe no DetalheLayoutController e não no frontend`);
      }
    }
  }

  /* ==================================================================
     CARD OU LINK DE MÓDULO QUE NÃO VEM DA FONTE ÚNICA (03/09)

     Achado da leva das telas compartilhadas: existem telas que montam
     LISTAS DE DESTINO à mão — cartão de módulo, hub de configuração —
     sem passar pelo `navigationConfig`. Consequências reais, já medidas:

       - o título ficava fora da D7 porque ninguém sabia que aquela lista
         existia;
       - a permissão era reavaliada por conta própria, com regra própria;
       - destino renomeado na fonte única continuava velho ali, e ninguém
         via até alguém clicar.

     O problema não são os arquivos de hoje: é o PRÓXIMO que alguém
     escrever. Por isso o check é TRINCO — congela o passivo conhecido, na
     data, e reprova arquivo NOVO ou contagem que SOBE. Cada leva que
     passar por um deles zera o seu.

     Sinal usado: arquivo FORA de `src/navigation/` que lista TRÊS ou mais
     destinos absolutos distintos e NÃO importa a fonte única. Três porque
     uma tela de detalhe legitimamente aponta para uma ou duas rotas
     vizinhas; três ou mais já é um índice, e índice é papel da fonte
     única.
     ================================================================== */
  {
    const trincoPath = path.join(raiz, 'scripts', 'trinco-navegacao.json');
    const trinco = JSON.parse(readFileSync(trincoPath, 'utf8'));
    const arquivosFront = [];
    const varrer = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { varrer(p); continue; }
        if (/\.jsx?$/.test(e.name)) arquivosFront.push(p);
      }
    };
    varrer(path.join(raiz, 'src'));

    const atual = {};
    for (const arquivo of arquivosFront) {
      const rel = path.relative(raiz, arquivo).replace(/\\/g, '/');
      if (rel.startsWith('src/navigation/')) continue;
      // O roteador e os guardas de rota NÃO são índices de navegação: o
      // App.jsx existe para declarar todas as rotas, e um guarda existe
      // para mandar o usuário embora. Contá-los faria o check gritar sobre
      // a infraestrutura e não sobre o que a regra quer proteger.
      if (rel === 'src/App.jsx' || /Route\.jsx$/.test(rel)) continue;
      let codigo = readFileSync(arquivo, 'utf8');
      if (/navigationConfig/.test(codigo)) continue;
      // `<Navigate to="/">` é REDIRECIONAMENTO, não link oferecido ao
      // usuário — sai da conta antes de medir.
      codigo = codigo.replace(/<Navigate\b[^>]*>/g, '');
      const destinos = new Set(
        [...codigo.matchAll(/(?:\bto=\{?["'`]|\bto:\s*["'`])(\/[^"'`\s{}]*)/g)].map((m) => m[1])
      );
      if (destinos.size >= 3) atual[rel] = destinos.size;
    }

    // `--gravar-trinco` congela o passivo ATUAL. Existe para o dia em que
    // a regra nasce e para a leva que zera um arquivo — nunca para calar o
    // check depois de alguém acrescentar destino à mão.
    if (process.argv.includes('--gravar-trinco')) {
      const ordenado = Object.fromEntries(Object.entries(atual).sort(([a], [b]) => a.localeCompare(b)));
      writeFileSync(trincoPath, `${JSON.stringify({ ...trinco, arquivos: ordenado }, null, 2)}\n`);
      console.log(`[fonte única] trinco gravado: ${Object.keys(ordenado).length} arquivo(s), ${Object.values(ordenado).reduce((a, b) => a + b, 0)} destinos à mão.`);
    }

    const congelado = trinco.arquivos || {};
    for (const [arquivo, quantos] of Object.entries(atual)) {
      const antes = congelado[arquivo];
      if (antes === undefined) {
        falhas += 1;
        console.error(`FONTE ÚNICA: ${arquivo} monta ${quantos} destinos à mão e não importa o navigationConfig. Índice de destinos é papel da fonte única — card e link de módulo saem de lá, senão a próxima renomeação não chega aqui.`);
      } else if (quantos > antes) {
        falhas += 1;
        console.error(`FONTE ÚNICA: ${arquivo} subiu de ${antes} para ${quantos} destinos à mão. O trinco só desce: mova os novos para o navigationConfig.`);
      }
    }
    for (const [arquivo, antes] of Object.entries(congelado)) {
      const agora = atual[arquivo];
      if (agora === undefined) {
        console.log(`AVISO FONTE ÚNICA: ${arquivo} zerou os destinos à mão — remova a linha de scripts/trinco-navegacao.json.`);
      } else if (agora < antes) {
        console.log(`AVISO FONTE ÚNICA: ${arquivo} caiu de ${antes} para ${agora} destinos à mão — atualize scripts/trinco-navegacao.json.`);
      }
    }
  }

  if (falhas > 0) {
    console.error(`\nFALHOU: ${falhas} problema(s).`);
    process.exitCode = 1;
  } else {
    console.log('\nOK: nenhum link morto; nenhum destino da navegação antiga foi perdido; catálogos de blocos front↔back idênticos.');
  }
} finally {
  await server.close();
}
