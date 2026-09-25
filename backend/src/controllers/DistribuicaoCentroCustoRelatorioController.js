'use strict';

const { Op } = require('sequelize');
const {
  Obra,
  Solicitacao,
  SolicitacaoCentroCustoDistribuicao,
  TipoSolicitacao,
  TipoSubContrato
} = require('../models');

function normalizarData(valor, fim = false) {
  const texto = String(valor || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  return new Date(`${texto}T${fim ? '23:59:59.999' : '00:00:00.000'}-03:00`);
}

module.exports = {
  async index(req, res) {
    try {
      const whereDistribuicao = {};
      const whereSolicitacao = { cancelada: { [Op.not]: true } };
      const centroCustoId = Number(req.query?.centro_custo_id);
      const obraId = Number(req.query?.obra_id);
      if (Number.isInteger(centroCustoId) && centroCustoId > 0) whereDistribuicao.centro_custo_id = centroCustoId;
      if (String(req.query?.obra_id || '').toUpperCase() === 'TODAS') {
        whereDistribuicao.abrangencia = 'TODAS';
      } else if (Number.isInteger(obraId) && obraId > 0) {
        whereDistribuicao.obra_id = obraId;
      }

      const inicio = normalizarData(req.query?.data_inicio);
      const fim = normalizarData(req.query?.data_fim, true);
      if (inicio || fim) {
        whereSolicitacao.createdAt = {};
        if (inicio) whereSolicitacao.createdAt[Op.gte] = inicio;
        if (fim) whereSolicitacao.createdAt[Op.lte] = fim;
      }

      const registros = await SolicitacaoCentroCustoDistribuicao.findAll({
        where: whereDistribuicao,
        include: [
          {
            model: Solicitacao,
            as: 'solicitacao',
            required: true,
            where: whereSolicitacao,
            attributes: ['id', 'codigo', 'descricao', 'valor', 'createdAt'],
            include: [
              { model: TipoSolicitacao, as: 'tipo', attributes: ['id', 'nome'] },
              { model: TipoSubContrato, as: 'tipoSubSolicitacao', attributes: ['id', 'nome'] }
            ]
          },
          { model: Obra, as: 'centroCusto', attributes: ['id', 'codigo', 'nome'] },
          { model: Obra, as: 'obraGerencial', required: false, attributes: ['id', 'codigo', 'nome', 'classificacao'] }
        ],
        order: [[{ model: Solicitacao, as: 'solicitacao' }, 'createdAt', 'DESC'], ['id', 'ASC']]
      });

      const linhas = registros.map((registro) => {
        const item = registro.get({ plain: true });
        return {
          id: item.id,
          abrangencia: item.abrangencia,
          criterio: item.criterio,
          percentual: Number(item.percentual || 0),
          valor_distribuido: Number(item.valor_distribuido || 0),
          centro_custo: item.centroCusto,
          obra: item.abrangencia === 'TODAS' ? null : item.obraGerencial,
          solicitacao: item.solicitacao
        };
      });

      const [centrosCusto, obras] = await Promise.all([
        Obra.findAll({
          where: { id: { [Op.in]: [...new Set(linhas.map((linha) => linha.centro_custo?.id).filter(Boolean))] } },
          attributes: ['id', 'codigo', 'nome'],
          order: [['codigo', 'ASC'], ['nome', 'ASC']]
        }),
        Obra.findAll({
          where: { id: { [Op.in]: [...new Set(linhas.map((linha) => linha.obra?.id).filter(Boolean))] } },
          attributes: ['id', 'codigo', 'nome', 'classificacao'],
          order: [['codigo', 'ASC'], ['nome', 'ASC']]
        })
      ]);

      return res.json({
        linhas,
        filtros: { centros_custo: centrosCusto, obras },
        resumo: {
          valor_total: linhas.reduce((total, linha) => total + linha.valor_distribuido, 0),
          solicitacoes: new Set(linhas.map((linha) => linha.solicitacao?.id)).size,
          centros_custo: new Set(linhas.map((linha) => linha.centro_custo?.id)).size,
          obras: new Set(linhas.filter((linha) => linha.abrangencia !== 'TODAS').map((linha) => linha.obra?.id)).size,
          registros_todas: linhas.filter((linha) => linha.abrangencia === 'TODAS').length
        }
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar o relatorio gerencial de distribuicao dos centros de custo.' });
    }
  }
};
