const {
  atualizarCobrancaTitulo,
  atualizarTitulo,
  baixarTitulo,
  baixarTitulosParceladosEmMassa,
  baixarTituloPorConciliacoes,
  carregarTituloPorId,
  criarTituloManual,
  criarTituloPorSolicitacao,
  estornarMovimentoTitulo,
  excluirTitulosEmMassa,
  importarCodigosBarrasTitulos,
  listarAuditoriaTitulo,
  listarBaixasRealizadas,
  listarChequesTerceirosDisponiveis,
  listarTitulos,
  listarTitulosPorSolicitacao
} = require('../services/tituloFinanceiroService');
const { gerarRelatorioTitulosFinanceirosPdf } = require('../services/tituloFinanceiroRelatorioPdfService');
const { validateFinanceTituloRelatorioBody } = require('../validators/financialValidators');
const { userHasAreaPermission } = require('../services/authorizationService');
const { responderErroController } = require('../utils/controllerError');

const PERMISSAO_PAGAMENTOS_BANCARIOS = 'financeiro.titulos.pagamentos_bancarios.visualizar';
const PERMISSAO_MOVIMENTOS_FINANCEIROS = 'financeiro.titulos.movimentos.visualizar';
const PERMISSAO_AUDITORIA_FINANCEIRA = 'financeiro.titulos.auditoria.visualizar';
const PAYMENT_INTENT_INACTIVE_STATUSES = ['CANCELADO', 'REJEITADO', 'REJEITADO_BANCO', 'FALHA_INTEGRACAO'];

function responderErro(res, error, fallbackMessage) {
  return responderErroController(res, error, fallbackMessage);
}

function toPlainObject(instance) {
  if (!instance) return instance;
  if (typeof instance.toJSON === 'function') {
    return instance.toJSON();
  }
  return { ...instance };
}

function countMovimentosAtivos(movimentos) {
  return Array.isArray(movimentos)
    ? movimentos.filter((item) => String(item?.status || '').trim().toUpperCase() === 'ATIVO').length
    : 0;
}

function countPagamentosAtivos(paymentIntents) {
  return Array.isArray(paymentIntents)
    ? paymentIntents.filter((intent) => {
        const status = String(intent?.status || '').trim().toUpperCase();
        return !PAYMENT_INTENT_INACTIVE_STATUSES.includes(status);
      }).length
    : 0;
}

async function filtrarDetalheTituloPorPermissoes(req, titulo) {
  const payload = toPlainObject(titulo);
  const movimentos = Array.isArray(payload?.movimentos) ? payload.movimentos : [];
  const paymentIntents = Array.isArray(payload?.paymentIntents) ? payload.paymentIntents : [];

  const [
    podeVerPagamentosBancarios,
    podeVerMovimentosFinanceiros,
    podeVerAuditoriaFinanceira
  ] = await Promise.all([
    userHasAreaPermission(req.user, [PERMISSAO_PAGAMENTOS_BANCARIOS]),
    userHasAreaPermission(req.user, [PERMISSAO_MOVIMENTOS_FINANCEIROS]),
    userHasAreaPermission(req.user, [PERMISSAO_AUDITORIA_FINANCEIRA])
  ]);

  payload.movimentos_ativos_count = countMovimentosAtivos(movimentos);
  payload.payment_intents_ativos_count = countPagamentosAtivos(paymentIntents);
  payload.permissoes_detalhe = {
    pagamentos_bancarios: podeVerPagamentosBancarios,
    movimentos_financeiros: podeVerMovimentosFinanceiros,
    auditoria_financeira: podeVerAuditoriaFinanceira
  };

  if (!podeVerPagamentosBancarios) {
    delete payload.paymentIntents;
  }
  if (!podeVerMovimentosFinanceiros) {
    delete payload.movimentos;
  }

  return payload;
}

module.exports = {
  async index(req, res) {
    try {
      const titulos = await listarTitulos(req, req.query || {});
      return res.json(titulos);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao listar titulos financeiros');
    }
  },

  async relatorioPdf(req, res) {
    try {
      const tituloIds = req.method === 'POST'
        ? validateFinanceTituloRelatorioBody(req.body).titulo_ids
        : null;
      const resultado = await listarTitulos(req, {
        ...(req.query || {}),
        paginated: true,
        page: 1,
        limit: 'all'
      }, { tituloIds });
      const titulos = Array.isArray(resultado) ? resultado : (resultado?.data || []);
      const idsDisponiveis = new Set(titulos.map(titulo => Number(titulo.id)));
      if (tituloIds && (titulos.length !== tituloIds.length ||
        tituloIds.some(id => !idsDisponiveis.has(id)))) {
        const error = new Error('Alguns titulos selecionados nao estao disponiveis nos filtros e no seu acesso atual. Atualize a consulta e selecione novamente.');
        error.statusCode = 409;
        throw error;
      }
      const pdf = await gerarRelatorioTitulosFinanceirosPdf({
        titulos,
        filtros: req.query || {},
        usuario: req.user
      });
      const dataArquivo = new Date().toISOString().slice(0, 10);
      const naturezaArquivo = String(req.query?.tipo || '').toUpperCase() === 'RECEBER'
        ? 'contas-a-receber'
        : 'contas-a-pagar';

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="relatorio-${naturezaArquivo}-${dataArquivo}.pdf"`);
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('Content-Length', pdf.length);
      return res.send(pdf);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao gerar relatorio de titulos financeiros');
    }
  },

  async show(req, res) {
    try {
      const titulo = await carregarTituloPorId(req, req.params.id, { includeMovimentos: true });
      const payload = await filtrarDetalheTituloPorPermissoes(req, titulo);
      return res.json(payload);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao buscar titulo financeiro');
    }
  },

  async auditoria(req, res) {
    try {
      const podeVerAuditoriaFinanceira = await userHasAreaPermission(req.user, [PERMISSAO_AUDITORIA_FINANCEIRA]);
      if (!podeVerAuditoriaFinanceira) {
        return res.status(403).json({ error: 'Acesso negado a auditoria financeira do titulo' });
      }
      const auditoria = await listarAuditoriaTitulo(req, req.params.id);
      return res.json(auditoria);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao buscar auditoria do titulo financeiro');
    }
  },

  async baixas(req, res) {
    try {
      const baixas = await listarBaixasRealizadas(req, req.query || {});
      return res.json(baixas);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao listar baixas financeiras');
    }
  },

  async chequesTerceirosDisponiveis(req, res) {
    try {
      const cheques = await listarChequesTerceirosDisponiveis(req, req.query || {});
      return res.json(cheques);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao listar cheques de terceiros disponiveis');
    }
  },

  async listarPorSolicitacao(req, res) {
    try {
      const titulos = await listarTitulosPorSolicitacao(req, req.params.id);
      return res.json(titulos);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao listar titulos da solicitacao');
    }
  },

  async criarPorSolicitacao(req, res) {
    try {
      const titulo = await criarTituloPorSolicitacao(req, req.params.id, req.body || {});
      res.locals.tituloFinanceiroId = titulo.id;
      return res.status(201).json(titulo);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao gerar titulo financeiro');
    }
  },

  async create(req, res) {
    try {
      const titulo = await criarTituloManual(req, req.body || {});
      res.locals.tituloFinanceiroId = titulo.id;
      return res.status(201).json(titulo);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao criar titulo financeiro manual');
    }
  },

  async importarCodigosBarras(req, res) {
    try {
      const resultado = await importarCodigosBarrasTitulos(req, req.body || {});
      return res.json(resultado);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao importar codigos de barras dos titulos');
    }
  },

  async excluirEmMassa(req, res) {
    try {
      const resultado = await excluirTitulosEmMassa(req, req.body || {});
      return res.json(resultado);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao excluir titulos financeiros');
    }
  },

  async update(req, res) {
    try {
      const titulo = await atualizarTitulo(req, req.params.id, req.body || {});
      return res.json(titulo);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao editar titulo financeiro');
    }
  },

  async atualizarCobranca(req, res) {
    try {
      const titulo = await atualizarCobrancaTitulo(req, req.params.id, req.body || {});
      return res.json(titulo);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao atualizar dados de cobranca do titulo');
    }
  },

  async baixar(req, res) {
    try {
      const titulo = await baixarTitulo(req, req.params.id, req.body || {});
      return res.json(titulo);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao registrar baixa financeira');
    }
  },

  async baixarParcelado(req, res) {
    try {
      const resultado = await baixarTitulosParceladosEmMassa(req, req.body || {});
      return res.json(resultado);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao registrar baixa parcelada em massa');
    }
  },

  async baixarPorConciliacoes(req, res) {
    try {
      const titulo = await baixarTituloPorConciliacoes(req, req.params.id, req.body || {});
      return res.json(titulo);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao registrar baixa por conciliacao bancaria');
    }
  },

  async estornarMovimento(req, res) {
    try {
      const titulo = await estornarMovimentoTitulo(
        req,
        req.params.id,
        req.params.movimentoId,
        req.body || {}
      );
      return res.json(titulo);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao estornar baixa financeira');
    }
  }
};
