// =====================================================================
// BUSCA UNIVERSAL (Ctrl+K)
// ---------------------------------------------------------------------
// GET /busca?q= — resultados AGRUPADOS por tipo, prontos para o
// CommandPalette. Regras inegociáveis:
//   - Grupo sem permissão NEM É CONSULTADO; módulo desabilitado idem.
//   - Cada grupo reusa LITERALMENTE a regra de visibilidade da tela
//     correspondente (nenhuma regra nova nasce aqui):
//       solicitações → montarEscopoVisibilidadeLista + regra mista
//       contratos    → canAccessContratos + escopo de obras do index
//       títulos      → canAccessFinanceiro + getFinanceiroObraScopeIds
//       obras        → escopo de obras do usuário (getUserObraScopeIds)
//       parceiros    → permissão da tela Cadastro de Pessoas
//       colaboradores→ canViewRhDpColaboradores
//       usuários     → canManageUsers
//   - TODA consulta tem LIMIT (LIMITE_GRUPO + 1, para saber se há mais);
//     nunca se varre tabela sem limite.
//   - Mínimo de 2 caracteres; campos de texto longos exigem 3.
//   - Caixa/acento-insensível pela collation utf8mb4 *_ci do banco.
// =====================================================================
const db = require('../models');
const {
  Solicitacao,
  Obra,
  Contrato,
  TituloFinanceiro,
  Parceiro,
  RhColaborador,
  User,
  Sequelize
} = db;
const { Op } = Sequelize;
const {
  canAccessContratos,
  canAccessContratosGlobal,
  shouldRestrictContratosToObras,
  canAccessFinanceiro,
  getFinanceiroObraScopeIds,
  getUserObraScopeIds,
  getRhDpObraScopeIds,
  canViewRhDpColaboradores,
  canManageUsers,
  canManageConfiguracoesArea,
  isBusinessAdmin,
  isSuperadmin
} = require('../services/authorizationService');
const { isModuleEnabled } = require('../services/moduleConfigService');
const SolicitacaoController = require('./SolicitacaoController');

// =====================================================================
// FLAG DO GRUPO SOLICITAÇÕES — LIGA JUNTO COM O PACOTE B3.
// O grupo Solicitações (e o de Arquivadas/Canceladas) reusa
// montarEscopoVisibilidadeLista + filtrarRegraMistaPorTipo, funções que
// só passam a existir no rework do SolicitacaoController (pacote B3 de
// docs/PROPOSTA-BACKEND.md). Recriar a regra aqui é proibido — duplicar
// regra de visibilidade foi a origem do bug "61 aprovações".
// Ligada em 02/09 junto com o B3 (funções exportadas pelo SolicitacaoController). Alinhamento registrado em
// docs/MIGRACAO-PARA-OFICIAL.md (seção do plano de ondas).
// =====================================================================
const GRUPO_SOLICITACOES_DISPONIVEL = true;

const LIMITE_GRUPO = 5;
const MIN_CARACTERES = 2;
// Texto usa o MESMO mínimo da lista (2): qualquer divergência entre
// busca e lista é bug — regra da casa desde o diagnóstico do Ctrl+K.
const MIN_CARACTERES_TEXTO = 2;

function pareceCodigo(q) {
  return /\d/.test(q) || /^[a-z]{2,4}-/i.test(q);
}

function cortar(texto, tamanho = 90) {
  const bruto = String(texto || '').trim();
  return bruto.length > tamanho ? `${bruto.slice(0, tamanho - 1)}…` : bruto;
}

// Casamento flexível de código — MESMO util da busca única das listas
// (?q=), para busca e lista acharem o mesmo conjunto.
const { condicoesCodigoFlexivel } = require('../utils/buscaFlexivel');

// Monta o OR de busca: campos de código sempre entram (flexíveis); os
// de texto só com MIN_CARACTERES_TEXTO+.
function condicoesTermo(q, { codigos = [], textos = [] }) {
  const clausulas = condicoesCodigoFlexivel(codigos, q);
  if (q.length >= MIN_CARACTERES_TEXTO) {
    for (const campo of textos) {
      clausulas.push({ [campo]: { [Op.like]: `%${q}%` } });
    }
  }
  return clausulas;
}

// ----- Solicitações ----------------------------------------------------
// OR de busca das solicitações — o MESMO para ativas, arquivadas e
// canceladas (espelho do ?q= da listagem).
function condicoesBuscaSolicitacoes(q) {
  const like = `%${q}%`;
  const likeEscapado = db.sequelize.escape(like);
  const ou = condicoesCodigoFlexivel([
    { campo: 'codigo', sql: '`Solicitacao`.`codigo`' },
    { campo: 'numero_sienge', sql: '`Solicitacao`.`numero_sienge`' },
    { campo: 'numero_pedido', sql: '`Solicitacao`.`numero_pedido`' },
    { campo: 'codigo_contrato', sql: '`Solicitacao`.`codigo_contrato`' }
  ], q);
  if (q.length >= MIN_CARACTERES_TEXTO) {
    // Nomes físicos das tabelas via models: no servidor oficial a tabela
    // de obras é "Obras", com maiúscula (ver CONVENCAO-MIGRATIONS/f58e030).
    const tabelaObras = String(Obra.getTableName());
    const tabelaParceiros = String(Parceiro.getTableName());
    ou.push(
      { descricao: { [Op.like]: like } },
      { obra_id: { [Op.in]: Sequelize.literal(`(SELECT o.id FROM \`${tabelaObras}\` o WHERE o.nome LIKE ${likeEscapado})`) } },
      { parceiro_id: { [Op.in]: Sequelize.literal(`(SELECT p.id FROM \`${tabelaParceiros}\` p WHERE p.nome LIKE ${likeEscapado})`) } }
    );
  }
  return ou;
}

function montarItemSolicitacao(s, selo = null) {
  return {
    id: s.id,
    titulo: s.codigo || `#${s.id}`,
    subtitulo: cortar([s.obra?.nome, s.descricao].filter(Boolean).join(' · ')),
    link: `/solicitacoes/${s.id}`,
    ...(selo ? { selo } : {})
  };
}

async function grupoSolicitacoes(req, q) {
  if (!GRUPO_SOLICITACOES_DISPONIVEL) return null; // ver flag no topo (B3)
  if (!(await isModuleEnabled('SOLICITACOES')) && !isSuperadmin(req.user)) return null;
  const escopo = await SolicitacaoController.montarEscopoVisibilidadeLista(req, { listarArquivadas: false });
  if (escopo.vazio) return { itens: [], temMais: false };

  const where = { ...escopo.where };
  where[Op.and] = [...(where[Op.and] || [])];
  where[Op.and].push({ [Op.or]: condicoesBuscaSolicitacoes(q) });

  // A regra mista descarta linhas DEPOIS do SQL; uma amostra única das
  // mais recentes esconderia registros antigos visíveis (a lista mostra,
  // a busca não — BUG B do diagnóstico). Pagina em janelas até juntar os
  // exibidos, com teto rígido: nunca varre a tabela.
  const visiveis = await coletarComRegraMista(where, escopo.contexto);
  return {
    temMais: visiveis.temMais,
    itens: visiveis.itens.slice(0, LIMITE_GRUPO).map((s) => montarItemSolicitacao(s))
  };
}

// ----- Arquivadas e canceladas -------------------------------------------
// Fora do fluxo ativo, mas encontráveis: quem busca um código quer achar
// o registro esteja onde estiver. Grupo PRÓPRIO, sempre em último, com
// selo por item ("arquivada"/"cancelada") — nunca misturado às ativas.
// Só entra quando o termo tem cara de código OU quando nenhum grupo
// ativo retornou resultado. Escopos: arquivadas usam o MESMO escopo da
// tela Arquivadas (montarEscopoVisibilidadeLista com listarArquivadas);
// canceladas usam o MESMO escopo da lista ativa trocando apenas o estado
// (cancelada = true) — só encontra quem veria a solicitação ativa.
async function grupoArquivadasCanceladas(req, q) {
  if (!GRUPO_SOLICITACOES_DISPONIVEL) return null; // ver flag no topo (B3)
  if (!(await isModuleEnabled('SOLICITACOES')) && !isSuperadmin(req.user)) return null;
  const itens = [];

  const escopoArq = await SolicitacaoController.montarEscopoVisibilidadeLista(req, { listarArquivadas: true });
  if (!escopoArq.vazio) {
    const whereArq = { ...escopoArq.where };
    whereArq[Op.and] = [...(whereArq[Op.and] || []), { [Op.or]: condicoesBuscaSolicitacoes(q) }];
    const arquivadas = await coletarComRegraMista(whereArq, escopoArq.contexto);
    itens.push(...arquivadas.itens.slice(0, LIMITE_GRUPO).map((s) => montarItemSolicitacao(s, 'arquivada')));
  }

  const escopoAtivo = await SolicitacaoController.montarEscopoVisibilidadeLista(req, { listarArquivadas: false });
  if (!escopoAtivo.vazio) {
    const whereCanc = { ...escopoAtivo.where, cancelada: true };
    whereCanc[Op.and] = [...(whereCanc[Op.and] || []), { [Op.or]: condicoesBuscaSolicitacoes(q) }];
    const canceladas = await coletarComRegraMista(whereCanc, escopoAtivo.contexto);
    itens.push(...canceladas.itens.slice(0, LIMITE_GRUPO).map((s) => montarItemSolicitacao(s, 'cancelada')));
  }

  if (itens.length === 0) return null;
  return {
    tipo: 'arquivadas',
    rotulo: 'Arquivadas e canceladas',
    comCodigo: true,
    itens: itens.slice(0, LIMITE_GRUPO),
    verTodos: null
  };
}

const JANELA_SOLICITACOES = 30;
const TETO_LINHAS_SOLICITACOES = 120;

async function coletarComRegraMista(where, contexto) {
  const aprovadas = [];
  let offset = 0;
  let sqlTemMais = false;
  while (aprovadas.length <= LIMITE_GRUPO && offset < TETO_LINHAS_SOLICITACOES) {
    const linhas = await Solicitacao.findAll({
      where,
      include: [{ model: Obra, as: 'obra', attributes: ['id', 'nome'] }],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: JANELA_SOLICITACOES,
      offset
    });
    const visiveis = await SolicitacaoController.filtrarRegraMistaPorTipo(linhas, contexto);
    aprovadas.push(...visiveis);
    sqlTemMais = linhas.length === JANELA_SOLICITACOES;
    if (!sqlTemMais) break;
    offset += JANELA_SOLICITACOES;
  }
  return { itens: aprovadas, temMais: aprovadas.length > LIMITE_GRUPO || sqlTemMais };
}

// ----- Obras -----------------------------------------------------------
async function grupoObras(req, q) {
  // Mesmo escopo de obras que governa contratos e financeiro: com o
  // Ctrl+K a exposição prática é maior que a da tela — quem tem escopo
  // global continua vendo tudo (null = sem restrição).
  const escopoObras = await getUserObraScopeIds(req.user);
  if (Array.isArray(escopoObras) && escopoObras.length === 0) return { itens: [], temMais: false };

  const where = {
    [Op.or]: condicoesTermo(q, {
      codigos: [{ campo: 'codigo', sql: '`Obra`.`codigo`' }],
      textos: ['nome']
    })
  };
  if (q.length < MIN_CARACTERES_TEXTO) {
    // termo curto: também prefixo do nome (barato e útil)
    where[Op.or].push({ nome: { [Op.like]: `${q}%` } });
  }
  if (Array.isArray(escopoObras)) where.id = { [Op.in]: escopoObras };

  const linhas = await Obra.findAll({
    where,
    attributes: ['id', 'nome', 'codigo'],
    order: [['nome', 'ASC']],
    limit: LIMITE_GRUPO + 1
  });
  return {
    temMais: linhas.length > LIMITE_GRUPO,
    itens: linhas.slice(0, LIMITE_GRUPO).map((o) => ({
      id: o.id,
      titulo: o.nome,
      subtitulo: o.codigo ? `Obra ${o.codigo}` : 'Obra',
      // O clique abre O REGISTRO (gestão da obra); quem não tem acesso à
      // gestão é redirecionado pela rota para a lista, como hoje.
      link: `/obras/${o.id}`,
      acoes: [
        { rotulo: 'ver solicitações', link: `/solicitacoes?obra_ids=${o.id}` },
        { rotulo: 'ver contratos', link: `/gestao-contratos?obra_id=${o.id}` }
      ]
    }))
  };
}

// ----- Contratos -------------------------------------------------------
async function grupoContratos(req, q) {
  if (!(await isModuleEnabled('CONTRATOS')) && !isSuperadmin(req.user)) return null;
  if (!(await canAccessContratos(req.user))) return null;

  const restringirPorObra = await shouldRestrictContratosToObras(req.user);
  const acessoGlobal = !restringirPorObra && (await canAccessContratosGlobal(req.user));
  const obrasPermitidas = isSuperadmin(req.user) ? null : await getUserObraScopeIds(req.user);

  const where = {
    ativo: true,
    [Op.or]: condicoesTermo(q, {
      codigos: [
        { campo: 'codigo', sql: '`Contrato`.`codigo`' },
        { campo: 'ref_contrato', sql: '`Contrato`.`ref_contrato`' }
      ],
      textos: ['objeto', 'descricao']
    })
  };
  if (!acessoGlobal && obrasPermitidas && obrasPermitidas.length > 0) {
    where.obra_id = { [Op.in]: obrasPermitidas };
  } else if (!acessoGlobal && obrasPermitidas !== null) {
    return { itens: [], temMais: false };
  }

  const linhas = await Contrato.findAll({
    where,
    attributes: ['id', 'codigo', 'ref_contrato', 'objeto', 'descricao'],
    include: [{ model: Obra, as: 'obra', attributes: ['id', 'nome'] }],
    order: [['createdAt', 'DESC']],
    limit: LIMITE_GRUPO + 1
  });
  return {
    temMais: linhas.length > LIMITE_GRUPO,
    itens: linhas.slice(0, LIMITE_GRUPO).map((c) => ({
      id: c.id,
      titulo: c.ref_contrato || c.codigo || `#${c.id}`,
      subtitulo: cortar([c.obra?.nome, c.objeto || c.descricao].filter(Boolean).join(' · ')),
      link: `/gestao-contratos?q=${encodeURIComponent(c.ref_contrato || c.codigo || '')}`
    }))
  };
}

// ----- Títulos financeiros ----------------------------------------------
async function grupoTitulos(req, q) {
  if (!(await isModuleEnabled('FINANCEIRO')) && !isSuperadmin(req.user)) return null;
  if (!(await canAccessFinanceiro(req.user))) return null;

  const obraIds = isSuperadmin(req.user) ? null : await getFinanceiroObraScopeIds(req.user);
  if (Array.isArray(obraIds) && obraIds.length === 0) return { itens: [], temMais: false };

  const like = `%${q}%`;
  const likeEscapado = db.sequelize.escape(like);
  const ou = condicoesTermo(q, {
    codigos: [
      { campo: 'codigo', sql: '`TituloFinanceiro`.`codigo`' },
      { campo: 'numero_documento', sql: '`TituloFinanceiro`.`numero_documento`' }
    ],
    textos: ['descricao']
  });
  if (q.length >= MIN_CARACTERES_TEXTO) {
    ou.push({ parceiro_id: { [Op.in]: Sequelize.literal(`(SELECT p.id FROM \`${String(Parceiro.getTableName())}\` p WHERE p.nome LIKE ${likeEscapado})`) } });
  }
  const where = { [Op.or]: ou };
  if (obraIds) where.obra_id = { [Op.in]: obraIds };

  const linhas = await TituloFinanceiro.findAll({
    where,
    attributes: ['id', 'codigo', 'descricao', 'tipo', 'valor_liquido', 'data_vencimento'],
    include: [{ model: Parceiro, as: 'parceiro', attributes: ['id', 'nome'] }],
    order: [['data_vencimento', 'DESC']],
    limit: LIMITE_GRUPO + 1
  });
  return {
    temMais: linhas.length > LIMITE_GRUPO,
    itens: linhas.slice(0, LIMITE_GRUPO).map((t) => {
      const lista = t.tipo === 'RECEBER' ? '/financeiro/contas-a-receber' : '/financeiro/contas-a-pagar';
      return {
        id: t.id,
        titulo: t.codigo || `Título #${t.id}`,
        subtitulo: cortar([
          t.tipo === 'RECEBER' ? 'A receber' : 'A pagar',
          t.parceiro?.nome,
          t.descricao
        ].filter(Boolean).join(' · ')),
        link: `${lista}?q=${encodeURIComponent(t.codigo || String(t.id))}`
      };
    })
  };
}

// ----- Parceiros / fornecedores -----------------------------------------
async function grupoParceiros(req, q) {
  // Permissão da tela Cadastro de Pessoas: quem não vê a tela não
  // encontra fornecedores pela busca.
  const pode = isBusinessAdmin(req.user) || (await canManageConfiguracoesArea(req.user, 'cadastros'));
  if (!pode) return null;

  const where = {
    [Op.or]: [
      ...condicoesTermo(q, {
        codigos: [{ campo: 'cpf_cnpj', sql: '`Parceiro`.`cpf_cnpj`' }],
        textos: ['nome']
      }),
      { nome: { [Op.like]: `${q}%` } }
    ]
  };
  const linhas = await Parceiro.findAll({
    where,
    attributes: ['id', 'nome', 'cpf_cnpj'],
    order: [['nome', 'ASC']],
    limit: LIMITE_GRUPO + 1
  });
  return {
    temMais: linhas.length > LIMITE_GRUPO,
    itens: linhas.slice(0, LIMITE_GRUPO).map((p) => ({
      id: p.id,
      titulo: p.nome,
      subtitulo: p.cpf_cnpj || 'Parceiro',
      link: `/parceiros?q=${encodeURIComponent(p.nome)}`,
      acoes: [
        { rotulo: 'ver solicitações', link: `/solicitacoes?q=${encodeURIComponent(p.nome)}` },
        { rotulo: 'ver títulos', link: `/financeiro/contas-a-pagar?q=${encodeURIComponent(p.nome)}` }
      ]
    }))
  };
}

// ----- Colaboradores ------------------------------------------------------
async function grupoColaboradores(req, q) {
  if (!(await canViewRhDpColaboradores(req.user))) return null;

  const obraIds = await getRhDpObraScopeIds(req.user);
  if (Array.isArray(obraIds) && !obraIds.length) {
    return { temMais: false, itens: [] };
  }

  const where = {
    [Op.or]: [
      ...condicoesTermo(q, {
        codigos: [{ campo: 'cpf', sql: '`RhColaborador`.`cpf`' }],
        textos: ['nome']
      }),
      { nome: { [Op.like]: `${q}%` } }
    ]
  };
  if (Array.isArray(obraIds)) {
    where.obra_id = { [Op.in]: obraIds };
  }
  const linhas = await RhColaborador.findAll({
    where,
    attributes: ['id', 'nome', 'cpf'],
    order: [['nome', 'ASC']],
    limit: LIMITE_GRUPO + 1
  });
  return {
    temMais: linhas.length > LIMITE_GRUPO,
    itens: linhas.slice(0, LIMITE_GRUPO).map((c) => ({
      id: c.id,
      titulo: c.nome,
      subtitulo: c.cpf ? `Colaborador · CPF ${c.cpf}` : 'Colaborador',
      link: Array.isArray(obraIds)
        ? '/rh-dp/pessoal?aba=colaboradores'
        : `/rh-dp/colaboradores?q=${encodeURIComponent(c.nome)}`
    }))
  };
}

// ----- Usuários -----------------------------------------------------------
async function grupoUsuarios(req, q) {
  if (!(await canManageUsers(req.user))) return null;

  const where = {
    ativo: true,
    [Op.or]: [
      { nome: { [Op.like]: `${q}%` } },
      ...(q.length >= MIN_CARACTERES_TEXTO
        ? [{ nome: { [Op.like]: `%${q}%` } }, { email: { [Op.like]: `%${q}%` } }]
        : [])
    ]
  };
  const linhas = await User.findAll({
    where,
    attributes: ['id', 'nome', 'email', 'perfil'],
    order: [['nome', 'ASC']],
    limit: LIMITE_GRUPO + 1
  });
  return {
    temMais: linhas.length > LIMITE_GRUPO,
    itens: linhas.slice(0, LIMITE_GRUPO).map((u) => ({
      id: u.id,
      titulo: u.nome,
      subtitulo: `${u.email || ''}${u.perfil ? ` · ${u.perfil}` : ''}`,
      link: `/usuarios/${u.id}/editar`
    }))
  };
}

const GRUPOS = [
  // Ordem por ESPECIFICIDADE: registros "globais" (obra, parceiro,
  // contrato, colaborador, usuário) vêm antes dos numerosos e derivados
  // (títulos, solicitações), para o grupo grande não empurrar os demais
  // para fora da tela. Exceção: termo com cara de código sobe os grupos
  // com campo código para o topo (ver index()).
  { tipo: 'obras', rotulo: 'Obras', comCodigo: false, buscar: grupoObras, verTodos: (q) => `/obras?q=${encodeURIComponent(q)}` },
  { tipo: 'parceiros', rotulo: 'Parceiros e fornecedores', comCodigo: false, buscar: grupoParceiros, verTodos: (q) => `/parceiros?q=${encodeURIComponent(q)}` },
  { tipo: 'contratos', rotulo: 'Contratos', comCodigo: true, buscar: grupoContratos, verTodos: (q) => `/gestao-contratos?q=${encodeURIComponent(q)}` },
  { tipo: 'colaboradores', rotulo: 'Colaboradores', comCodigo: false, buscar: grupoColaboradores, verTodos: (q) => `/rh-dp/colaboradores?q=${encodeURIComponent(q)}` },
  { tipo: 'usuarios', rotulo: 'Usuários', comCodigo: false, buscar: grupoUsuarios, verTodos: (q) => `/usuarios?q=${encodeURIComponent(q)}` },
  { tipo: 'titulos', rotulo: 'Títulos financeiros', comCodigo: true, buscar: grupoTitulos, verTodos: (q) => `/financeiro/contas-a-pagar?q=${encodeURIComponent(q)}` },
  { tipo: 'solicitacoes', rotulo: 'Solicitações', comCodigo: true, buscar: grupoSolicitacoes, verTodos: (q) => `/solicitacoes?q=${encodeURIComponent(q)}` }
];

module.exports = {
  async index(req, res) {
    try {
      const q = String(req.query.q || '').trim();
      if (q.length < MIN_CARACTERES) {
        return res.json({ grupos: [] });
      }

      const resultados = await Promise.all(GRUPOS.map(async (grupo) => {
        try {
          const resultado = await grupo.buscar(req, q);
          if (!resultado || resultado.itens.length === 0) return null;
          return {
            tipo: grupo.tipo,
            rotulo: grupo.rotulo,
            comCodigo: grupo.comCodigo,
            itens: resultado.itens,
            verTodos: resultado.temMais ? grupo.verTodos(q) : null
          };
        } catch (error) {
          // Um grupo com erro não derruba a busca inteira.
          console.error(`busca: grupo ${grupo.tipo} falhou`, error);
          return null;
        }
      }));

      let grupos = resultados.filter(Boolean);

      // Arquivadas e canceladas: só quando o termo tem cara de código ou
      // quando NENHUM grupo ativo achou nada — e sempre em último lugar.
      let grupoForaDoFluxo = null;
      if (pareceCodigo(q) || grupos.length === 0) {
        try {
          grupoForaDoFluxo = await grupoArquivadasCanceladas(req, q);
        } catch (error) {
          console.error('busca: grupo arquivadas falhou', error);
        }
      }

      // Termo com cara de código: grupos de registros com código sobem.
      if (pareceCodigo(q)) {
        grupos = grupos.slice().sort((a, b) => Number(b.comCodigo) - Number(a.comCodigo));
      } else if (grupos.length > 1) {
        // Solicitações são numerosas e derivadas: com outros grupos na
        // tela, exibe só 3 (o "ver todos" leva ao restante).
        grupos = grupos.map((grupo) => (
          grupo.tipo === 'solicitacoes' && grupo.itens.length > 3
            ? { ...grupo, itens: grupo.itens.slice(0, 3), verTodos: grupo.verTodos || GRUPOS.find((g) => g.tipo === 'solicitacoes').verTodos(q) }
            : grupo
        ));
      }
      if (grupoForaDoFluxo) grupos = [...grupos, grupoForaDoFluxo];
      return res.json({ grupos, pareceCodigo: pareceCodigo(q) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro na busca' });
    }
  }
};
