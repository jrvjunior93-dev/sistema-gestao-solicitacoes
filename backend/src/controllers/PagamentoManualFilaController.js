const {
  anexarComprovanteFila,
  anexarComprovanteFilaLote,
  aprovarDivergenciasFila,
  enfileirarTitulos,
  informarNaoPagamento,
  listarContasPagadorasFila,
  listarInstrumentosFila,
  listarFilaPagamentos,
  obterComprovanteFila,
  obterComprovanteAdicionalFila,
  registrarBaixasFila,
  estornarBaixaFila,
  resolverItemFila
} = require('../services/pagamentoManualFilaService');
const {
  linkReceipts,
  previewReceipts
} = require('../services/pagamentoComprovantePdfService');
const { responderErroController } = require('../utils/controllerError');
const { listarArquivosSolicitacaoPelaFila } = require('../services/solicitacaoFilaPagamentoAcessoService');

function responderErro(res, error, fallback) {
  return responderErroController(res, error, fallback);
}

module.exports = {
  async boletoPedido(req, res) {
    try {
      const result = await require('../services/pagamentoFilaBoletosPedidosService').abrirBoletoPedido(req, req.params.id, req.params.documentoId);
      res.setHeader('Cache-Control', 'no-store');
      return res.json(result);
    } catch (error) { return responderErro(res, error, 'Erro ao abrir boleto do pedido'); }
  },
  async sugestoes(req, res) {
    try { return res.json(await require('../services/pagamentoFilaAutocompleteService').listarSugestoesFila(req, req.query)); }
    catch (error) { return responderErro(res, error, 'Erro ao consultar sugestoes da fila'); }
  },
  async compostaPreview(req, res) {
    try { return res.json(await require('../services/filaBaixaCompostaService').previewFilaBaixaComposta(req, req.body)); }
    catch (error) { return responderErro(res, error, 'Erro ao validar fontes da fila'); }
  },
  async compostaConfirmar(req, res) {
    try {
      return res.json(await require('../services/filaBaixaCompostaService').confirmarFilaBaixaComposta(req, req.body,
        String(req.get('Idempotency-Key') || '').trim()));
    } catch (error) { return responderErro(res, error, 'Erro ao registrar baixa composta na fila'); }
  },
  async anexarComprovanteLote(req, res) {
    try {
      let ids;
      try { ids = typeof req.body?.fila_ids === 'string' ? JSON.parse(req.body.fila_ids) : req.body?.fila_ids; }
      catch { return res.status(400).json({ message: 'Selecao de titulos invalida.' }); }
      const result = await anexarComprovanteFilaLote(req, ids, req.file);
      return res.json({ quantidade: result.quantidade, criados: result.criados, ja_vinculados: result.ja_vinculados,
        itens: result.itens.map(i => ({ id: i.id, comprovante_nome: i.comprovante_nome })) });
    } catch (error) { return responderErro(res, error, 'Erro ao anexar comprovante aos selecionados'); }
  },
  async estornar(req, res) {
    try { return res.json(await estornarBaixaFila(req, req.params.id, req.body)); }
    catch (error) { return responderErro(res, error, 'Erro ao estornar baixa da fila'); }
  },
  async instrumentos(req, res) {
    try { return res.json(await listarInstrumentosFila(req)); }
    catch (error) { return responderErro(res, error, 'Erro ao carregar instrumentos de pagamento'); }
  },
  async index(req, res) {
    try {
      return res.json(await listarFilaPagamentos(req, req.query || {}));
    } catch (error) {
      return responderErro(res, error, 'Erro ao carregar fila de pagamentos');
    }
  },

  async contas(req, res) {
    try {
      return res.json(await listarContasPagadorasFila(req));
    } catch (error) {
      return responderErro(res, error, 'Erro ao carregar contas pagadoras');
    }
  },

  async anexarComprovante(req, res) {
    try {
      const item = await anexarComprovanteFila(req, req.params.id, req.file);
      return res.json({ id: item.id, comprovante_nome: item.comprovante_nome });
    } catch (error) {
      return responderErro(res, error, 'Erro ao anexar comprovante');
    }
  },

  async comprovante(req, res) {
    try {
      return res.json(await obterComprovanteFila(req, req.params.id));
    } catch (error) {
      return responderErro(res, error, 'Erro ao abrir comprovante');
    }
  },

  async comprovanteAdicional(req, res) {
    try {
      return res.json(await obterComprovanteAdicionalFila(req, req.params.id, req.params.comprovanteId));
    } catch (error) {
      return responderErro(res, error, 'Erro ao abrir comprovante');
    }
  },

  async arquivosSolicitacao(req, res) {
    try {
      return res.json(await listarArquivosSolicitacaoPelaFila(req.user, req.params.id));
    } catch (error) {
      return responderErro(res, error, 'Erro ao carregar arquivos da solicitacao');
    }
  },

  async previewComprovantes(req, res) {
    try {
      return res.json(await previewReceipts(req.files || []));
    } catch (error) {
      return responderErro(res, error, 'Erro ao ler comprovantes PDF');
    }
  },

  async vincularComprovantes(req, res) {
    try {
      return res.json(await linkReceipts(req, req.files || [], req.body?.vinculos));
    } catch (error) {
      return responderErro(res, error, 'Erro ao vincular comprovantes PDF');
    }
  },

  async create(req, res) {
    try {
      return res.status(201).json(await enfileirarTitulos(req, req.body || {}));
    } catch (error) {
      return responderErro(res, error, 'Erro ao enviar titulos para pagamento');
    }
  },

  async baixar(req, res) {
    try {
      return res.json(await registrarBaixasFila(req, req.body || {}));
    } catch (error) {
      return responderErro(res, error, 'Erro ao registrar baixas da fila');
    }
  },

  async aprovarDivergencias(req, res) {
    try {
      return res.json(await aprovarDivergenciasFila(req, req.body || {}));
    } catch (error) {
      return responderErro(res, error, 'Erro ao aprovar divergencias de pagamento');
    }
  },

  async resultado(req, res) {
    try {
      return res.json(await informarNaoPagamento(req, req.params.id, req.body || {}));
    } catch (error) {
      return responderErro(res, error, 'Erro ao registrar resultado do pagamento');
    }
  },

  async resolver(req, res) {
    try {
      return res.json(await resolverItemFila(req, req.params.id, req.body || {}));
    } catch (error) {
      return responderErro(res, error, 'Erro ao resolver pendencia de pagamento');
    }
  }
};
