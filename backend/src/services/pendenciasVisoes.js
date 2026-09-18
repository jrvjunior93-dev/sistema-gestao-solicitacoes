// =====================================================================
// VISÕES NOMEADAS DAS PENDÊNCIAS DO HUB
// ---------------------------------------------------------------------
// Cada cartão de pendência de solicitações tem aqui o SEU recorte SQL,
// usado por DOIS consumidores:
//   1. o CONTADOR (DashboardPendenciasController) — COUNT sobre o
//      recorte;
//   2. a LISTA (SolicitacaoController, parâmetro ?visao=) — o mesmo
//      recorte aplicado ADITIVAMENTE sobre o escopo normal da lista.
// Número do cartão e lista aberta saem do MESMO WHERE — nada de
// reconstruir filtro no frontend com parâmetros soltos.
//
// `idsOcultos` (solicitações que o usuário arquivou) entram no recorte
// do contador; na lista o escopo padrão já as exclui — aplicar de novo
// não muda o conjunto.
// =====================================================================
const { Solicitacao, SolicitacaoVisibilidadeUsuario, Sequelize } = require('../models');

const { Op } = Sequelize;

// ⚠️ TOKENS DE SETOR: este serviço NÃO resolve tokens. Todo consumidor
// (DashboardPendenciasController, SolicitacaoController ?visao=) recebe
// `tokensSetor` do contexto de montarEscopoVisibilidadeLista — o MESMO
// resolvedor da lista, incluindo os aliases GEO↔Gerência de Processos.
// Um resolvedor próprio aqui seria a família do bug das 61 aprovações
// voltando por outra porta (decisão do porte, 02/09).

async function idsOcultosDoUsuario(usuarioId) {
  const ocultadas = await SolicitacaoVisibilidadeUsuario.findAll({
    where: { usuario_id: usuarioId, oculto: true },
    attributes: ['solicitacao_id']
  });
  return ocultadas.map((item) => item.solicitacao_id);
}

const SUBQUERY_ENVIADA_SETOR = Sequelize.literal(`(
  SELECT h.solicitacao_id FROM historicos h WHERE h.acao = 'ENVIADA_SETOR'
)`);

const SUBQUERY_CONTRATOS_AGUARDANDO = Sequelize.literal(`(
  SELECT c.solicitacao_id FROM contratos c
  WHERE c.status_contrato = 'AGUARDANDO_APROVACAO' AND c.solicitacao_id IS NOT NULL
)`);

// Fragmento reutilizado: solicitação NO fluxo de aprovação da diretoria
// e ainda sem aprovação.
const APROVACAO_PENDENTE = [
  { fluxo_aprovacao_diretoria: true },
  { aprovada_diretoria_em: null }
];

// Cada visão devolve a lista de condições (combinadas com AND) sobre a
// tabela `solicitacoes`, ou null quando o contexto não permite a visão
// (ex.: usuário sem setor) — nesse caso o conjunto é vazio.
const VISOES = {
  // Paradas no setor do usuário, EXCLUINDO as aprovações de diretoria
  // pendentes (elas têm cartão próprio — os dois não se sobrepõem).
  'paradas-no-setor': ({ tokensSetor }) => (tokensSetor.length === 0 ? null : [
    { cancelada: false },
    { [Op.or]: [
      { area_responsavel: { [Op.in]: tokensSetor } },
      ...(tokensSetor.includes('COMPRAS') || tokensSetor.includes('OBRA')
        ? [Sequelize.literal(require('./pedidoEntregaService').sqlPendenciaEntrega(tokensSetor.includes('COMPRAS') ? 'COMPRAS' : 'OBRA'))] : [])
    ] },
    {
      [Op.or]: [
        { fluxo_aprovacao_diretoria: { [Op.ne]: true } },
        { aprovada_diretoria_em: { [Op.ne]: null } }
      ]
    }
  ]),

  'aprovacoes-diretoria': ({ tokensSetor }) => (tokensSetor.length === 0 ? null : [
    { cancelada: false },
    ...APROVACAO_PENDENTE,
    { area_responsavel: { [Op.in]: tokensSetor } }
  ]),

  // Criadas pelo usuário, de volta ao setor dele após passarem por
  // outro setor (houve ENVIADA_SETOR).
  'devolucoes-recebidas': ({ usuarioId, tokensSetor }) => (tokensSetor.length === 0 ? null : [
    { cancelada: false },
    { criado_por: usuarioId },
    { area_responsavel: { [Op.in]: tokensSetor } },
    { id: { [Op.in]: SUBQUERY_ENVIADA_SETOR } }
  ]),

  // Solicitações-mãe de contratos do fluxo novo em AGUARDANDO_APROVACAO,
  // paradas no setor do usuário.
  'contratos-aguardando-aprovacao': ({ tokensSetor }) => (tokensSetor.length === 0 ? null : [
    { cancelada: false },
    { area_responsavel: { [Op.in]: tokensSetor } },
    { id: { [Op.in]: SUBQUERY_CONTRATOS_AGUARDANDO } }
  ])
};

const NOMES_VISOES = Object.keys(VISOES);

// Condições da visão para APLICAR NA LISTA (?visao=...).
// Retorna: array de condições; null = visão válida mas contexto sem
// setor (conjunto vazio); undefined = nome desconhecido.
function condicoesVisaoPendencia(nome, contexto) {
  const builder = VISOES[String(nome || '').trim().toLowerCase()];
  if (!builder) return undefined;
  return builder(contexto);
}

// COUNT do contador — o mesmo recorte, mais a exclusão das arquivadas
// do usuário (a lista as exclui pelo escopo padrão).
async function contarVisaoPendencia(nome, contexto) {
  const condicoes = condicoesVisaoPendencia(nome, contexto);
  if (!condicoes) return 0;
  const where = { [Op.and]: [...condicoes] };
  if (contexto.idsOcultos?.length > 0) {
    where[Op.and].push({ id: { [Op.notIn]: contexto.idsOcultos } });
  }
  return Solicitacao.count({ where });
}

// Linhas do recorte (para "Para resolver agora") — mesmo WHERE, com
// colunas e limite curto.
async function buscarLinhasVisaoPendencia(nome, contexto, { order, limit = 5, extraWhere = [] } = {}) {
  const condicoes = condicoesVisaoPendencia(nome, contexto);
  if (!condicoes) return [];
  const where = { [Op.and]: [...condicoes, ...extraWhere] };
  if (contexto.idsOcultos?.length > 0) {
    where[Op.and].push({ id: { [Op.notIn]: contexto.idsOcultos } });
  }
  return Solicitacao.findAll({
    where,
    attributes: ['id', 'codigo', 'descricao', 'valor', 'data_vencimento', 'createdAt'],
    include: [{ association: 'obra', attributes: ['id', 'nome'] }],
    order: order || [['createdAt', 'ASC']],
    limit
  });
}

module.exports = {
  NOMES_VISOES,
  idsOcultosDoUsuario,
  condicoesVisaoPendencia,
  contarVisaoPendencia,
  buscarLinhasVisaoPendencia
};
