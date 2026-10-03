const {
  confirmarBaixaComposta,
  confirmarImportacao,
  criarChequeSaldoInicial,
  estornarBaixaComposta,
  gerarModeloCheques,
  listarBaixasCompostas,
  listarCheques,
  movimentarCheque,
  obterBaixaComposta,
  obterCheque,
  previewBaixaComposta,
  previewImportacao
} = require('../services/chequeTerceiroService');
const { criarParceiro } = require('../services/parceiroService');
const { responderErroController } = require('../utils/controllerError');
const { userHasAreaPermission } = require('../services/authorizationService');

function erro(res, error, fallback) {
  console.error(error);
  return responderErroController(res, error, fallback);
}

module.exports = {
  async index(req, res) {
    try { return res.json(await listarCheques(req, req.query || {})); }
    catch (error) { return erro(res, error, 'Erro ao listar carteira de cheques'); }
  },
  async show(req, res) {
    try { return res.json(await obterCheque(req.params.id)); }
    catch (error) { return erro(res, error, 'Erro ao consultar cheque'); }
  },
  async create(req, res) {
    try {
      if (!Number.isInteger(Number(req.body?.titular_parceiro_id)) || Number(req.body?.titular_parceiro_id) <= 0) {
        const error = new Error('Selecione o titular na pesquisa de pessoas cadastradas.');
        error.status = 400;
        throw error;
      }
      return res.status(201).json(await criarChequeSaldoInicial(req, req.body || {}));
    }
    catch (error) { return erro(res, error, 'Erro ao cadastrar cheque'); }
  },
  async criarCliente(req, res) {
    try {
      const pessoa = await criarParceiro({
        ...(req.body || {}),
        cliente: true,
        fornecedor: false,
        corretor: false,
        testemunha: false,
        ativo: true
      });
      return res.status(201).json(pessoa);
    } catch (error) {
      return erro(res, error, 'Erro ao cadastrar cliente');
    }
  },
  async movimentar(req, res) {
    try {
      const acao = String(req.body?.acao || '').trim().toUpperCase();
      const permissionByAction = {
        DEPOSITAR: 'financeiro.cheques.depositar',
        DEVOLVER: 'financeiro.cheques.devolver',
        CANCELAR: 'financeiro.cheques.cancelar',
        TRANSFERIR: 'financeiro.cheques.transferir'
      };
      const permission = permissionByAction[acao];
      if (!permission || !(await userHasAreaPermission(req.user, [permission]))) {
        const error = new Error('Acesso negado para esta movimentacao de cheque');
        error.status = 403;
        throw error;
      }
      const idempotencyKey = String(req.get('Idempotency-Key') || '').trim();
      return res.json(await movimentarCheque(req, req.params.id, req.body || {}, idempotencyKey));
    }
    catch (error) { return erro(res, error, 'Erro ao movimentar cheque'); }
  },
  async modelo(req, res) {
    try {
      const buffer = await gerarModeloCheques();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="modelo-carteira-cheques-terceiros.xlsx"');
      return res.send(Buffer.from(buffer));
    } catch (error) { return erro(res, error, 'Erro ao gerar modelo de cheques'); }
  },
  async importPreview(req, res) {
    try { return res.json(await previewImportacao(req.file?.buffer)); }
    catch (error) { return erro(res, error, 'Erro ao validar planilha de cheques'); }
  },
  async importConfirm(req, res) {
    try {
      const key = String(req.get('Idempotency-Key') || '').trim();
      return res.status(201).json(await confirmarImportacao(req, req.body || {}, key));
    } catch (error) { return erro(res, error, 'Erro ao importar cheques'); }
  },
  async baixaPreview(req, res) {
    try { return res.json(await previewBaixaComposta(req.body || {})); }
    catch (error) { return erro(res, error, 'Erro ao validar baixa composta'); }
  },
  async baixaConfirm(req, res) {
    try {
      const key = String(req.get('Idempotency-Key') || '').trim();
      return res.status(201).json(await confirmarBaixaComposta(req, req.body || {}, key));
    } catch (error) { return erro(res, error, 'Erro ao confirmar baixa composta'); }
  },
  async baixas(req, res) {
    try { return res.json(await listarBaixasCompostas(req.query || {})); }
    catch (error) { return erro(res, error, 'Erro ao listar baixas compostas'); }
  },
  async baixaShow(req, res) {
    try { return res.json(await obterBaixaComposta(req.params.id)); }
    catch (error) { return erro(res, error, 'Erro ao consultar baixa composta'); }
  },
  async baixaEstornar(req, res) {
    try { return res.json(await estornarBaixaComposta(req, req.params.id, req.body || {})); }
    catch (error) { return erro(res, error, 'Erro ao estornar baixa composta'); }
  }
};
