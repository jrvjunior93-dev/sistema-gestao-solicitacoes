const { Obra, TituloFinanceiro, TituloFinanceiroRateio, ObraCustoHistorico } = require('../models');
const { Op, fn, col, literal } = require('sequelize');
const { TIPO_CENTRO_CUSTO_OBRA } = require('../constants/centroCusto');
const { obterVgvEfetivoPorObras } = require('../services/obraVgvService');

module.exports = {
  async index(req, res) {
    try {
      const obras = await Obra.findAll({
        where: { ativo: true, tipo_centro_custo: TIPO_CENTRO_CUSTO_OBRA },
        order: [['nome', 'ASC']]
      });

      const obraIds = obras.map(o => o.id);

      if (obraIds.length === 0) {
        return res.json([]);
      }

      const vgvPorObra = await obterVgvEfetivoPorObras(obras);

      // Aggregate titulos por obra_id e tipo
      const agregados = await TituloFinanceiro.findAll({
        attributes: [
          'obra_id',
          'tipo',
          [fn('SUM', col('valor_original')), 'total_valor_original'],
          [fn('SUM', col('valor_baixado')), 'total_valor_baixado'],
          [fn('SUM', col('valor_saldo')), 'total_valor_saldo'],
          [fn('COUNT', col('id')), 'quantidade']
        ],
        where: {
          obra_id: { [Op.in]: obraIds },
          status: { [Op.notIn]: ['CANCELADO', 'ESTORNADO'] }
        },
        group: ['obra_id', 'tipo'],
        raw: true
      });

      // Recargas de cartao so recebem obra depois da prestacao de contas validada. O titulo
      // continua unico para conciliacao bancaria; os custos das obras vivem no rateio.
      const rateiosRecarga = await TituloFinanceiroRateio.findAll({
        where: { obra_id: { [Op.in]: obraIds } },
        include: [{
          model: TituloFinanceiro,
          as: 'tituloFinanceiro',
          required: true,
          where: {
            origem_titulo: 'RECARGA_CARTAO',
            considera_dre: true,
            status: { [Op.notIn]: ['CANCELADO', 'ESTORNADO'] }
          },
          attributes: ['id', 'tipo', 'valor_original', 'valor_baixado', 'valor_saldo']
        }]
      });

      // O legado ja foi pago/recebido no sistema de origem. Nao representa
      // titulo ou movimento bancario do Fluxy e deve ser contabilizado uma vez so.
      const historicos = await ObraCustoHistorico.findAll({
        attributes: [
          'obra_id',
          'tipo',
          [fn('SUM', col('valor')), 'valor_total'],
          [fn('COUNT', col('id')), 'quantidade']
        ],
        where: { obra_id: { [Op.in]: obraIds }, ativo: true },
        group: ['obra_id', 'tipo'],
        raw: true
      });

      // Map agregados por obra_id
      const mapAgregados = {};
      for (const row of agregados) {
        const oId = row.obra_id;
        if (!mapAgregados[oId]) mapAgregados[oId] = {};
        mapAgregados[oId][row.tipo] = {
          total_valor_original: Number(row.total_valor_original || 0),
          total_valor_baixado: Number(row.total_valor_baixado || 0),
          total_valor_saldo: Number(row.total_valor_saldo || 0),
          quantidade: Number(row.quantidade || 0)
        };
      }
      for (const rateio of rateiosRecarga) {
        const obraId = Number(rateio.obra_id);
        const titulo = rateio.tituloFinanceiro;
        const tipo = String(titulo?.tipo || 'PAGAR').toUpperCase();
        const valorRateio = Number(rateio.valor_rateio || 0);
        const valorOriginalTitulo = Number(titulo?.valor_original || 0);
        const proporcaoBaixada = valorOriginalTitulo > 0
          ? Math.min(Number(titulo?.valor_baixado || 0) / valorOriginalTitulo, 1)
          : 0;
        const atual = mapAgregados[obraId]?.[tipo] || {
          total_valor_original: 0,
          total_valor_baixado: 0,
          total_valor_saldo: 0,
          quantidade: 0
        };
        if (!mapAgregados[obraId]) mapAgregados[obraId] = {};
        mapAgregados[obraId][tipo] = {
          total_valor_original: atual.total_valor_original + valorRateio,
          total_valor_baixado: atual.total_valor_baixado + (valorRateio * proporcaoBaixada),
          total_valor_saldo: atual.total_valor_saldo + (valorRateio * (1 - proporcaoBaixada)),
          quantidade: atual.quantidade + 1
        };
      }

      const mapHistoricos = {};
      for (const row of historicos) {
        const obraId = Number(row.obra_id);
        const tipo = String(row.tipo || '').toUpperCase();
        const valor = Number(row.valor_total || 0);
        const quantidade = Number(row.quantidade || 0);
        if (!obraIds.includes(obraId) || !['PAGAR', 'RECEBER'].includes(tipo) || !Number.isFinite(valor) || valor <= 0) continue;
        const atual = mapAgregados[obraId]?.[tipo] || {
          total_valor_original: 0,
          total_valor_baixado: 0,
          total_valor_saldo: 0,
          quantidade: 0
        };
        if (!mapAgregados[obraId]) mapAgregados[obraId] = {};
        mapAgregados[obraId][tipo] = {
          ...atual,
          total_valor_original: atual.total_valor_original + valor,
          total_valor_baixado: atual.total_valor_baixado + valor,
          quantidade: atual.quantidade + quantidade
        };
        if (!mapHistoricos[obraId]) mapHistoricos[obraId] = {};
        mapHistoricos[obraId][tipo] = { valor, quantidade };
      }

      const resultado = obras.map(obra => {
        const pagar = mapAgregados[obra.id]?.PAGAR || { total_valor_original: 0, total_valor_baixado: 0, total_valor_saldo: 0, quantidade: 0 };
        const receber = mapAgregados[obra.id]?.RECEBER || { total_valor_original: 0, total_valor_baixado: 0, total_valor_saldo: 0, quantidade: 0 };

        const classificacao = String(obra.classificacao || '').trim().toUpperCase();
        const margem = Number(obra.margem_custo_esperada || 0);
        const vgvInfo = vgvPorObra.get(Number(obra.id));

        let valorReferencia = 0;
        if (classificacao === 'PRIVADA') {
          valorReferencia = vgvInfo?.valor || 0;
        } else if (classificacao === 'PUBLICA') {
          valorReferencia = Number(obra.planilha_geral || 0);
        }

        // Orçamento = valorReferencia - custo esperado = valorReferencia * (1 - margem/100)
        const orcamento = (valorReferencia > 0 && margem > 0) ? valorReferencia * (1 - margem / 100) : null;
        const faltaReceber = valorReferencia > 0
          ? valorReferencia - receber.total_valor_baixado
          : receber.total_valor_saldo;
        const lucroPrejuizo = receber.total_valor_baixado - pagar.total_valor_baixado;

        return {
          id: obra.id,
          codigo: obra.codigo,
          nome: obra.nome,
          cidade: obra.cidade,
          classificacao: obra.classificacao,
          vgv: obra.vgv != null ? Number(obra.vgv) : null,
          vgv_efetivo: vgvInfo?.valor ?? null,
          vgv_origem: vgvInfo?.origem ?? null,
          vgv_unidades_total: vgvInfo?.unidades_total ?? 0,
          vgv_unidades_sem_valor: vgvInfo?.unidades_sem_valor ?? 0,
          planilha_geral: obra.planilha_geral != null ? Number(obra.planilha_geral) : null,
          margem_custo_esperada: obra.margem_custo_esperada != null ? Number(obra.margem_custo_esperada) : null,
          orcamento,
          valor_referencia_resultado: valorReferencia || null,
          falta_receber: faltaReceber,
          lucro_prejuizo: lucroPrejuizo,
          pagar: {
            total: pagar.total_valor_original,
            executado: pagar.total_valor_baixado,
            saldo: pagar.total_valor_saldo,
            quantidade: pagar.quantidade,
            historico: mapHistoricos[obra.id]?.PAGAR || { valor: 0, quantidade: 0 }
          },
          receber: {
            total: receber.total_valor_original,
            recebido: receber.total_valor_baixado,
            saldo: receber.total_valor_saldo,
            quantidade: receber.quantidade,
            historico: mapHistoricos[obra.id]?.RECEBER || { valor: 0, quantidade: 0 }
          }
        };
      });

      return res.json(resultado);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar resultado de obras' });
    }
  }
};
