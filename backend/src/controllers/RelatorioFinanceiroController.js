const {
  gerarDiagnosticoDre,
  gerarDreComparativoEmpresas,
  gerarDreComparativoMensal,
  gerarDreGerencial,
  gerarPainelExecutivoGrupo,
  gerarRelatorioEndividamento,
  gerarRelatorioConciliacaoContas,
  gerarRelatorioFluxoConsolidado,
  gerarRelatorioIntercompany,
  gerarRelatorioAnalitico,
  gerarRelatorioFinanceiroObras,
  gerarRelatorioFluxoCaixa,
  gerarRelatorioMovimentacaoContas
} = require('../services/relatorioFinanceiroService');
const { responderErroController } = require('../utils/controllerError');
const { gerarFinanceiroObrasPdf } = require('../services/financeiroObrasRelatorioPdfService');

function responderErro(res, error, fallbackMessage) {
  return responderErroController(res, error, fallbackMessage);
}

module.exports = {
  async grupoConsolidado(req, res) {
    try {
      const relatorio = await gerarPainelExecutivoGrupo(req, req.query || {});
      return res.json(relatorio);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao gerar painel executivo do grupo');
    }
  },

  async fluxoCaixa(req, res) {
    try {
      const relatorio = await gerarRelatorioFluxoCaixa(req, req.query || {});
      return res.json(relatorio);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao gerar relatorio de fluxo de caixa');
    }
  },

  async fluxoConsolidado(req, res) {
    try {
      const relatorio = await gerarRelatorioFluxoConsolidado(req, req.query || {});
      return res.json(relatorio);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao gerar fluxo de caixa consolidado');
    }
  },

  async analitico(req, res) {
    try {
      const relatorio = await gerarRelatorioAnalitico(req, req.query || {});
      return res.json(relatorio);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao gerar relatorio analitico financeiro');
    }
  },

  async financeiroObras(req, res) {
    try {
      const relatorio = await gerarRelatorioFinanceiroObras(req, req.query || {});
      return res.json(relatorio);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao gerar relatorio financeiro de obras');
    }
  },

  async financeiroObrasPdf(req, res) {
    try {
      const relatorio = await gerarRelatorioFinanceiroObras(req, req.query || {});
      const pdf = await gerarFinanceiroObrasPdf({ relatorio, usuario: req.user });
      const dataArquivo = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="financeiro-obras-${dataArquivo}.pdf"`);
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('Content-Length', pdf.length);
      return res.send(pdf);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao gerar PDF do financeiro de obras');
    }
  },

  /** ITEM 22 (23/08): os arquivos da linha do relatorio, pelo titulo. */
  async arquivosDoTitulo(req, res) {
    try {
      const { listarArquivosDoTitulo } = require('../services/arquivosDoTituloService');
      return res.json(await listarArquivosDoTitulo(req, req.params.id));
    } catch (error) {
      return responderErro(res, error, 'Erro ao listar os arquivos do titulo');
    }
  },

  async dre(req, res) {
    try {
      const relatorio = await gerarDreGerencial(req, req.query || {});
      return res.json(relatorio);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao gerar DRE financeira');
    }
  },

  async dreComparativo(req, res) {
    try {
      const relatorio = await gerarDreComparativoMensal(req, req.query || {});
      return res.json(relatorio);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao gerar comparativo mensal da DRE');
    }
  },

  async dreComparativoEmpresas(req, res) {
    try {
      const relatorio = await gerarDreComparativoEmpresas(req, req.query || {});
      return res.json(relatorio);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao gerar comparativo da DRE por empresa');
    }
  },

  async diagnosticoDre(req, res) {
    try {
      const diagnostico = await gerarDiagnosticoDre(req);
      return res.json(diagnostico);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao gerar diagnostico da DRE');
    }
  },

  async endividamento(req, res) {
    try {
      const relatorio = await gerarRelatorioEndividamento(req, req.query || {});
      return res.json(relatorio);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao gerar relatorio de endividamento');
    }
  },

  async intercompany(req, res) {
    try {
      const relatorio = await gerarRelatorioIntercompany(req, req.query || {});
      return res.json(relatorio);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao gerar relatorio Entre Empresas');
    }
  },

  async movimentacaoContas(req, res) {
    try {
      const relatorio = await gerarRelatorioMovimentacaoContas(req, req.query || {});
      return res.json(relatorio);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao gerar relatorio de movimentacao de contas');
    }
  },

  async conciliacaoContas(req, res) {
    try {
      const relatorio = await gerarRelatorioConciliacaoContas(req, req.query || {});
      return res.json(relatorio);
    } catch (error) {
      console.error(error);
      return responderErro(res, error, 'Erro ao gerar relatorio de conciliacao bancaria');
    }
  }
};
