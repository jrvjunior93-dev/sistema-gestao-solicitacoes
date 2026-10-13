const { criarLoteTicket, listarStatusTicket, vencimentoPadrao } = require('../services/rhTicketService');
const { responderErroController } = require('../utils/controllerError');
const { ValidationError } = require('../middlewares/validation');
const { RhColaborador } = require('../models');

module.exports = {
  async status(req, res) {
    try {
      const ids = String(req.query.colaborador_ids || '').split(',').filter(Boolean);
      return res.json(await listarStatusTicket({ competencia: req.query.competencia, colaboradorIds: ids }));
    } catch (error) {
      return responderErroController(res, error, 'Erro ao consultar tickets dos colaboradores');
    }
  },
  async vencimento(req, res) {
    try {
      return res.json({ data_vencimento: vencimentoPadrao(String(req.query.competencia || '')) });
    } catch (error) {
      return responderErroController(res, error, 'Erro ao calcular vencimento do ticket');
    }
  },
  async create(req, res) {
    try {
      let colaboradorIds;
      try {
        colaboradorIds = JSON.parse(req.body.colaborador_ids || '[]');
      } catch {
        throw new ValidationError('Lista de colaboradores do lote invalida.');
      }
      if (!Array.isArray(colaboradorIds)) throw new ValidationError('Lista de colaboradores do lote invalida.');
      let pagamentosPix = [];
      if (req.body.pagamentos_pix) {
        try { pagamentosPix = JSON.parse(req.body.pagamentos_pix); }
        catch { throw new ValidationError('Lista de chaves Pix do ticket invalida.'); }
        if (!Array.isArray(pagamentosPix)) throw new ValidationError('Lista de chaves Pix do ticket invalida.');
      }
      let pagamentosConta = [];
      if (req.body.pagamentos_conta) {
        try { pagamentosConta = JSON.parse(req.body.pagamentos_conta); }
        catch { throw new ValidationError('Lista de contas bancarias do ticket invalida.'); }
        if (!Array.isArray(pagamentosConta)) throw new ValidationError('Lista de contas bancarias do ticket invalida.');
      }
      // Custos e Recebiveis (29/09/2026): ticket de colaborador lotado em obra
      // travada nao e aberto. Multipart: checagem aqui, depois do multer.
      const idsValidos = colaboradorIds.map(Number).filter((id) => Number.isInteger(id) && id > 0);
      if (idsValidos.length) {
        const lotacoes = await RhColaborador.findAll({ where: { id: idsValidos }, attributes: ['obra_id'], raw: true });
        await require('../modules/custosRecebiveis/services/bloqueioObraService')
          .assertObrasSemTrava(lotacoes.map((item) => item.obra_id), 'POST /rh/tickets');
      }
      const resultado = await criarLoteTicket({ ...req.body, colaborador_ids: colaboradorIds,
        pagamentos_pix: pagamentosPix, pix_revisado: req.body.pix_revisado === 'true',
        pagamentos_conta: pagamentosConta, contas_revisadas: req.body.contas_revisadas === 'true' }, req.file, req.user);
      return res.status(201).json(resultado);
    } catch (error) {
      return responderErroController(res, error, 'Erro ao gerar lote de ticket');
    }
  }
};
