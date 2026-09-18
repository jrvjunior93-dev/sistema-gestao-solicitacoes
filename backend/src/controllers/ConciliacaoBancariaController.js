const {
  conciliarSugeridos,
  corrigirContaConciliacao,
  confirmarConciliacao,
  confirmarConciliacaoFatura,
  confirmarConciliacaoCreditoRotativo,
  confirmarConciliacaoEstornoBancario,
  confirmarConciliacaoEstornoTarifa,
  confirmarConciliacaoTarifa,
  confirmarConciliacaoRendimento,
  confirmarConciliacaoTransferencia,
  estornarConciliacao,
  estornarConciliacaoTransferencia,
  criarTituloEConciliar,
  ignorarConciliacao,
  importOfx,
  listarFaturasAssociacao,
  listarImportacoes,
  listarConciliacoes,
  listarMovimentosAssociacao,
  listarTarifasParaEstorno,
  removerConciliacao
} = require('../services/conciliacaoBancariaService');
const { responderErroController } = require('../utils/controllerError');

function responderErro(res, error, fallbackMessage) {
  return responderErroController(res, error, fallbackMessage);
}

module.exports = {
  async index(req, res) {
    try {
      const data = await listarConciliacoes(req, req.query || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao listar conciliacoes bancarias');
    }
  },

  async importarOfx(req, res) {
    try {
      const data = await importOfx(req, req.body || {});
      return res.status(201).json(data);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao importar arquivo OFX');
    }
  },

  async importacoes(req, res) {
    try {
      const data = await listarImportacoes(req, req.query || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao listar historico de importacoes OFX');
    }
  },

  async confirmar(req, res) {
    try {
      const data = await confirmarConciliacao(req, req.params.id, req.body || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao confirmar conciliacao bancaria');
    }
  },

  async corrigirConta(req, res) {
    try {
      const data = await corrigirContaConciliacao(req, req.params.id, req.body || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao corrigir conta da conciliacao bancaria');
    }
  },

  async criarTitulo(req, res) {
    try {
      const data = await criarTituloEConciliar(req, req.params.id, req.body || {});
      return res.status(201).json(data);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao criar titulo rapido na conciliacao bancaria');
    }
  },

  async conciliarSugeridos(req, res) {
    try {
      const data = await conciliarSugeridos(req, req.body || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao conciliar sugestoes em lote');
    }
  },

  async movimentos(req, res) {
    try {
      const data = await listarMovimentosAssociacao(req, req.params.id, req.query || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao buscar movimentos para associacao manual');
    }
  },

  async faturas(req, res) {
    try {
      const data = await listarFaturasAssociacao(req, req.params.id, req.query || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao buscar faturas para conciliacao');
    }
  },

  async confirmarFatura(req, res) {
    try {
      const data = await confirmarConciliacaoFatura(req, req.params.id, req.body || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao conciliar fatura de cartao');
    }
  },

  async confirmarTransferencia(req, res) {
    try {
      const data = await confirmarConciliacaoTransferencia(req, req.params.id, req.body || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao conciliar transferencia entre contas');
    }
  },

  async estornarTransferencia(req, res) {
    try {
      const data = await estornarConciliacaoTransferencia(req, req.params.id, req.body || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao estornar transferencia conciliada');
    }
  },

  async estornar(req, res) {
    try {
      const data = await estornarConciliacao(req, req.params.id, req.body || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao estornar conciliacao bancaria');
    }
  },

  async confirmarTarifa(req, res) {
    try {
      const data = await confirmarConciliacaoTarifa(req, req.params.id, req.body || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao conciliar tarifa bancaria');
    }
  },

  async confirmarRendimento(req, res) {
    try {
      const data = await confirmarConciliacaoRendimento(req, req.params.id, req.body || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao conciliar rendimento da conta');
    }
  },

  async tarifasEstorno(req, res) {
    try {
      const data = await listarTarifasParaEstorno(req, req.params.id);
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao localizar tarifas para estorno');
    }
  },

  async confirmarEstornoTarifa(req, res) {
    try {
      const data = await confirmarConciliacaoEstornoTarifa(req, req.params.id, req.body || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao conciliar estorno de tarifa bancaria');
    }
  },

  async confirmarEstornoBancario(req, res) {
    try {
      const data = await confirmarConciliacaoEstornoBancario(req, req.params.id, req.body || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao confirmar estorno bancario');
    }
  },

  async confirmarCreditoRotativo(req, res) {
    try {
      const data = await confirmarConciliacaoCreditoRotativo(req, req.params.id, req.body || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao conciliar credito rotativo');
    }
  },

  async ignorar(req, res) {
    try {
      const data = await ignorarConciliacao(req, req.params.id);
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao ignorar conciliacao bancaria');
    }
  },

  async remover(req, res) {
    try {
      const data = await removerConciliacao(req, req.params.id, req.body || {});
      return res.json(data);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao remover lancamento do extrato bancario');
    }
  }
};
