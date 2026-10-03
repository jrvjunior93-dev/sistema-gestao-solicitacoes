/**
 * PLANO DE RODADAS DO TESTE + DADOS PARA O CADERNO (05/09) — pedido do cliente.
 *
 * Gera, das FONTES e não de memória:
 *  - o módulo de cada tela, pela rota e pelo arquivo;
 *  - o que mudou nela nesta reforma, lido do HISTÓRICO do git (assuntos dos
 *    commits que tocaram o arquivo desde o começo da reforma, 876cbd4);
 *  - as células SEM DADO e as exceções declaradas, lidas da MATRIZ;
 *  - o que olhar, derivado do que a tela TEM (tabela, dinheiro, filtros,
 *    variantes, exceção com dono), não de texto genérico.
 *
 * A ordem das rodadas é a que o cliente pediu: Solicitações, Financeiro,
 * Compras e Cadastros primeiro; o resto depois; login/senha/raros no fim.
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { TELAS } from './qa-preview/telas.mjs';

const RAIZ = new URL('../..', import.meta.url).pathname;
const INICIO_DA_REFORMA = '876cbd4';

/* ---- Módulo de cada tela ------------------------------------------------ */
const REGRAS_DE_MODULO = [
  ['Solicitações', (t) => /^\/(solicitacoes|nova-solicitacao|solicitacoes-arquivadas|prioridades-diretoria)/.test(t.rota) || /^\/(hub|dashboard)$/.test(t.rota)],
  ['Financeiro', (t) => /^\/(financeiro|provisoes-financeiras|comprovantes|custos-recebiveis)/.test(t.rota)],
  ['Compras', (t) => /^\/(compras|solicitacoes-compra|solicitacoes-compra-direta|cotacoes|cotacao|pedidos-compra|gestao-fornecedores|gestao-insumos)/.test(t.rota)],
  ['Cadastros', (t) => /^\/(usuarios|parceiros|obras|setores|tipos-|empresas-grupo|areas-obra|obra-tipo-apropriacao|gestao-|contrato-obra-categorias)/.test(t.rota) && !/^\/usuarios-/.test(t.rota)],
  ['Contratos e Comercial', (t) => /^\/(contratos|gestao-contratos|comercial|configuracoes-comercial)/.test(t.rota)],
  ['Fiscal e Governança', (t) => /^\/(fiscal|governanca)/.test(t.rota)],
  ['RH e DP', (t) => /^\/rh-dp/.test(t.rota)],
  ['Configurações e permissões', (t) => /^\/(configuracoes|permissoes|status-setor|cores-sistema|timeout-inatividade|automacao-|areas-por-setor|nova-solicitacao-|comportamento-|solicitacoes-sla|arquivos-modelos-config|usuarios-|setores-visiveis|setores-criacao|setores-acesso|tipos-compartilhados)/.test(t.rota)],
  ['CRM', (t) => /^\/crm/.test(t.rota)],
  ['SST', (t) => /^\/sst/.test(t.rota)],
  ['Comunicação e apoio', (t) => /^\/(comunicacao-interna|treinamento|arquivos-modelos|perfil)/.test(t.rota)],
  ['Acesso', (t) => /^\/(login|recuperar-senha|definir-senha)/.test(t.rota)]
];
const ORDEM_DOS_MODULOS = [
  'Solicitações', 'Financeiro', 'Compras', 'Cadastros',
  'Contratos e Comercial', 'Fiscal e Governança', 'RH e DP',
  'Configurações e permissões', 'CRM', 'SST',
  'Comunicação e apoio', 'Acesso', 'Outras'
];
/*
  Onze telas de DETALHE não têm rota fixa: elas abrem a partir de uma lista
  (campo `resolver` no manifesto). Classificar pelo caminho do arquivo é o que
  as põe no módulo certo — a alternativa seria jogá-las todas em "Outras",
  longe da lista de onde a pessoa vai abri-las no teste.
*/
const moduloDe = (t) => {
  const alvo = { ...t, rota: t.rota || rotaDeducaoPeloArquivo(t.arquivo) };
  return (REGRAS_DE_MODULO.find(([, testa]) => testa(alvo)) || ['Outras'])[0];
};
function rotaDeducaoPeloArquivo(arquivo = '') {
  if (/modules\/crm\//.test(arquivo)) return '/crm/x';
  if (/modules\/fiscal\//.test(arquivo)) return '/fiscal/x';
  if (/modules\/provisionamento-financeiro\//.test(arquivo)) return '/provisoes-financeiras/x';
  if (/modules\/solicitacao-compra\//.test(arquivo)) return '/solicitacoes-compra/x';
  if (/SolicitacaoDetalhe/.test(arquivo)) return '/solicitacoes/x';
  if (/Financeiro/.test(arquivo)) return '/financeiro/x';
  if (/ObraGestao/.test(arquivo)) return '/obras/x';
  return '/outras/x';
}

/* ---- O que mudou NESTA TELA: lido do diff, não do assunto do commit ----- */
/*
  A primeira versão disto usou o ASSUNTO DOS COMMITS, e o resultado era
  inútil para quem vai testar: "Rodada 7 (final): o núcleo de Compras entra"
  não diz nada sobre a tela que a pessoa tem na frente. Assunto de commit em
  lote descreve a LEVA, não a tela.

  O que descreve a tela é o DIFF dela. Cada marca abaixo é uma mudança que a
  pessoa CONSEGUE VER ou testar — nada de refatoração interna, que não muda
  nada para quem usa.
*/
const MARCAS = [
  [/^\+.*TabelaPadrao/m, 'a tabela passou a ser a padrão do sistema: colunas redimensionáveis, alinhamento por coluna, ordenação e rolagem infinita'],
  [/^-.*\b(alert|confirm|prompt)\s*\(/m, 'as caixas do navegador saíram — aviso e confirmação agora acontecem dentro da tela'],
  [/^\+.*useConfirmacao|^\+.*\bconfirmar\(/m, 'ganhou confirmação própria antes de ação que não dá para desfazer'],
  [/^\+.*tipo: 'moeda'/m, 'as colunas de dinheiro passaram a ser declaradas como dinheiro (alinhamento e formato garantidos)'],
  [/^\+.*tipo: 'identidade'/m, 'a coluna que identifica o registro passou a ser declarada como tal'],
  [/^\+.*BarraFiltros/m, 'os filtros viraram a barra padrão, com etiqueta do que está filtrado à vista'],
  [/^\+.*PageHeader/m, 'o cabeçalho virou o padrão: título, contagem, descrição e ações no mesmo lugar de todas as telas'],
  [/^\+.*BlocoConteudo/m, 'o conteúdo foi organizado em blocos com título e contagem'],
  [/^\+.*EmptyState|^\+.*vazio=/m, 'passou a dizer com todas as letras quando não há registro, em vez de mostrar espaço em branco'],
  [/^-.*#[0-9a-fA-F]{6}/m, 'as cores fixas no código saíram e passaram a vir dos tokens do sistema (tema claro e escuro)'],
  [/^\+.*ListaAvancada/m, 'ganhou a lista avançada, com salvar visão e escolher colunas'],
  [/^\+.*OverlayModal|^\+.*ModalPadrao/m, 'as janelas viraram o modal padrão: o corpo rola e o botão de confirmar não sai da vista'],
  [/^\+.*StatusBadge|^\+.*EtiquetaStatus/m, 'os status viraram etiquetas com cor e texto do sistema'],
  [/^\+.*Avisos|^\+.*useAvisos/m, 'os avisos ficam na tela até você fechar, em vez de sumirem sozinhos'],
  [/^\+.*aria-|^\+.*role=/m, 'ganhou marcação de acessibilidade (leitor de tela e navegação por teclado)']
];

function mudancasPorArquivo() {
  const bruto = execSync(
    `git -C ${RAIZ} diff ${INICIO_DA_REFORMA}..HEAD -U0 -- frontend/src`,
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
  );
  const porArquivo = new Map();
  let atual = null;
  const pedacos = [];
  const fechar = () => { if (atual) porArquivo.set(atual, pedacos.join('\n')); pedacos.length = 0; };
  for (const linha of bruto.split('\n')) {
    const cab = linha.match(/^diff --git a\/frontend\/(\S+) b\//);
    if (cab) { fechar(); atual = cab[1]; continue; }
    if (atual) pedacos.push(linha);
  }
  fechar();

  const resumo = new Map();
  for (const [arq, diff] of porArquivo) {
    const nova = /^new file mode/m.test(diff);
    const itens = MARCAS.filter(([re]) => re.test(diff)).map(([, texto]) => texto);
    resumo.set(arq, {
      nova,
      linhasAdd: (diff.match(/^\+[^+]/gm) || []).length,
      linhasDel: (diff.match(/^-[^-]/gm) || []).length,
      mudancas: itens
    });
  }
  return resumo;
}

/* ---- SEM DADO e FALHOU, lidos da matriz --------------------------------- */
function lerMatriz() {
  const texto = fs.readFileSync(`${RAIZ}/docs/MATRIZ-COBERTURA.md`, 'utf8');
  const semDado = new Map();
  for (const m of texto.matchAll(/^- \*\*([a-z0-9-]+)\*\* — ([^:]+): (.+)$/gm)) {
    semDado.set(m[1], { itens: m[2].split(',').map((s) => s.trim()), motivo: m[3].trim() });
  }
  const falhou = new Map();
  for (const m of texto.matchAll(/^- \*\*([a-z0-9-]+) · ([A-Z0-9]+)\*\*: (.+)$/gm)) {
    if (!falhou.has(m[1])) falhou.set(m[1], []);
    falhou.get(m[1]).push({ item: m[2], motivo: m[3].trim() });
  }
  return { semDado, falhou };
}

/* ---- O que olhar nesta tela: derivado do que ela TEM --------------------- */
function oQueOlhar(t, fonte, semDado, falhou) {
  const pontos = [];
  const temTabela = /TabelaPadrao/.test(fonte);
  const temDinheiro = /tipo: 'moeda'|tipo: "moeda"/.test(fonte);
  const temFiltros = /BarraFiltros|ListaAvancada/.test(fonte);
  const temConfirmacao = /useConfirmacao|confirmar\(/.test(fonte);
  const temModal = /OverlayModal|ModalPadrao/.test(fonte);
  const temGrafico = /Recharts|<svg|Chart/.test(fonte);

  if (temTabela) {
    pontos.push('Arraste a borda de uma coluna, recarregue a página: a largura tem de voltar igual.');
    pontos.push('Clique no ícone ao lado do título de uma coluna e mude o alinhamento — o menu tem de abrir DENTRO da tela e a opção tem de aplicar.');
    pontos.push('Role a lista até o fim: as linhas seguintes carregam sozinhas, e o rodapé diz "N de M".');
  }
  if (temDinheiro) pontos.push('Confira os valores em dinheiro: alinhados à direita, com R$ e duas casas, e somando o que a tela diz somar.');
  if (temFiltros) pontos.push('Aplique e limpe um filtro: a etiqueta do que está filtrado aparece sem precisar abrir nada.');
  if (temConfirmacao) pontos.push('Numa ação que pede confirmação, clique CANCELAR e verifique que nada aconteceu.');
  if (temModal) pontos.push('Abra a janela e role o conteúdo: o botão de confirmar tem de continuar visível.');
  if (temGrafico) pontos.push('Confira se o gráfico bate com os números da tabela ao lado — e se ele diz quando está vazio.');
  if (t.variantes?.length) pontos.push(`Abra as ${t.variantes.length} abas desta tela (${t.variantes.join(', ')}) — cada uma é uma tela por dentro.`);
  if (t.tipo === 'form') pontos.push('Deixe um campo obrigatório em branco e tente gravar: o aviso tem de dizer QUAL campo.');
  if (t.tipo === 'detalhe') pontos.push('Confira a trilha no topo e o botão de voltar: têm de levar de volta à lista certa.');

  const sd = semDado.get(t.id);
  if (sd) pontos.push(`ATENÇÃO — a matriz não conseguiu provar ${sd.itens.join(', ')} aqui: ${sd.motivo.replace(/ — capacidade NÃO PROVADA$/, '')}. Se você tiver registro nesta tela, é o ponto mais importante de conferir.`);
  // O aviso de "corrigido e não remedido" sai UMA vez, na tarja vermelha do
  // caderno — repetir aqui só empurrava o que importa para baixo.
  if (t.naoAplica) {
    for (const [item, motivo] of Object.entries(t.naoAplica)) {
      pontos.push(`Exceção declarada (${item}): ${motivo}`);
    }
  }
  if (!pontos.length) pontos.push('Tela simples: confira o título, o espaçamento e se o conteúdo cabe sem cortar.');
  return pontos;
}

/*
  Como se chega numa tela que não tem rota fixa: o manifesto guarda o caminho
  no `resolver` (a lista de onde ela abre). Sem isso o caderno mandaria a
  pessoa a um endereço que não existe.
*/
function descreverResolver(t) {
  const bruto = String(t.resolver || '');
  const rota = bruto.match(/['\"](\/[^'\"]+)['\"]/);
  const nome = t.id.replace(/-detalhe$/, '').replace(/-/g, ' ');
  return rota
    ? `abra ${rota[1]} e clique no primeiro registro da lista`
    : `abra a lista de ${nome} e clique no primeiro registro`;
}

/* ---- Monta tudo --------------------------------------------------------- */
const mudancas = mudancasPorArquivo();
const { semDado, falhou } = lerMatriz();

const enriquecidas = TELAS.map((t) => {
  const caminho = `${RAIZ}/frontend/${t.arquivo}`;
  const fonte = fs.existsSync(caminho) ? fs.readFileSync(caminho, 'utf8') : '';
  const m = mudancas.get(t.arquivo) || { nova: false, linhasAdd: 0, linhasDel: 0, mudancas: [] };
  /*
    O nome que a PESSOA vê. O `id` do manifesto é chave de código
    (`financeiro-titulo-detalhe`) e no caderno viraria ruído. O título real
    está na própria tela, no `titulo=` do PageHeader — é o mesmo texto que
    ela vai ler no alto do navegador, então é por ele que ela reconhece
    onde está.
  */
  /*
    Só o título do CABEÇALHO DA PÁGINA. A primeira versão pegava qualquer
    `titulo=` do arquivo, e a tela de Solicitações saiu no caderno como
    "Atribuir em massa" — que é o título de um MODAL dela. Nome errado no
    caderno manda a pessoa procurar uma tela que não existe.
  */
  const blocoDoCabecalho = fonte.match(/<PageHeader[\s\S]{0,1500}?\/>/);
  const tituloNaTela = blocoDoCabecalho
    ? (blocoDoCabecalho[0].match(/titulo=["']([^"'{]{3,70})["']/) || [])[1]
    : undefined;
  return {
    ...t,
    nome: tituloNaTela || t.id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()),
    nomeVeioDaTela: Boolean(tituloNaTela),
    modulo: moduloDe(t),
    mudou: m.nova
      ? ['TELA NOVA nesta reforma — não existia antes.', ...m.mudancas]
      : (m.mudancas.length ? m.mudancas : ['Só acabamento: espaçamento, tipografia e cor vieram para o padrão do sistema.']),
    tamanhoDaMudanca: { add: m.linhasAdd, del: m.linhasDel },
    semDado: semDado.get(t.id) || null,
    falhou: falhou.get(t.id) || null,
    comoChegar: t.rota
      ? { tipo: 'rota', texto: t.rota }
      : { tipo: 'a partir de uma lista', texto: descreverResolver(t) },
    olhar: oQueOlhar(t, fonte, semDado, falhou)
  };
});

enriquecidas.sort((a, b) => {
  const ia = ORDEM_DOS_MODULOS.indexOf(a.modulo);
  const ib = ORDEM_DOS_MODULOS.indexOf(b.modulo);
  if (ia !== ib) return ia - ib;
  return (a.rota || a.arquivo).localeCompare(b.rota || b.arquivo, 'pt-BR');
});

const POR_RODADA = 10;
const rodadas = [];
for (let i = 0; i < enriquecidas.length; i += POR_RODADA) {
  const telas = enriquecidas.slice(i, i + POR_RODADA);
  const modulos = [...new Set(telas.map((t) => t.modulo))];
  rodadas.push({ numero: rodadas.length + 1, modulos, telas });
}

fs.writeFileSync('scripts/qa-preview/saida/plano-de-teste.json', JSON.stringify({ rodadas }, null, 2));
console.log(`[plano] ${enriquecidas.length} telas em ${rodadas.length} rodadas de até ${POR_RODADA}`);
for (const r of rodadas) {
  const sd = r.telas.filter((t) => t.semDado).length;
  console.log(`  Rodada ${String(r.numero).padStart(2)} — ${r.modulos.join(' + ')} — ${r.telas.length} tela(s), ${sd} com SEM DADO`);
}

/* ---- Plano em markdown, para o repositório e para a conversa ------------ */
const linhas = [
  '# Plano de rodadas do teste — reforma do frontend',
  '',
  '> **Gerado** por `frontend/scripts/gerarPlanoDeTeste.mjs` a partir do manifesto,',
  '> do diff do git e da matriz. Nunca editar à mão.',
  '',
  `- ${enriquecidas.length} telas em ${rodadas.length} rodadas de até ${POR_RODADA}`,
  '- Ordem: Solicitações, Financeiro, Compras e Cadastros primeiro; raros e acesso no fim',
  '- `*` marca a tela com célula **SEM DADO** na matriz (capacidade não provada)',
  '',
  '| # | Módulo / tema | Telas | Qtd | S/ dado |',
  '|---|---|---|---|---|'
];
for (const r of rodadas) {
  const sd = r.telas.filter((t) => t.semDado).length;
  const nomes = r.telas.map((t) => (t.semDado ? `${t.nome} *` : t.nome)).join(' · ');
  linhas.push(`| ${r.numero} | ${r.modulos.join(' + ')} | ${nomes} | ${r.telas.length} | ${sd || '—'} |`);
}
fs.writeFileSync(`${RAIZ}/docs/PLANO-DE-RODADAS.md`, linhas.join('\n') + '\n');
console.log(`[plano] docs/PLANO-DE-RODADAS.md`);
