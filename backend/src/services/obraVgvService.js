const { Op } = require('sequelize');
const { Empreendimento, UnidadeComercial } = require('../models');

function valorPositivo(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function obterVgvEfetivoPorObras(obras = []) {
  const resultado = new Map();
  const obrasSemVgv = [];

  for (const obra of obras) {
    if (String(obra.classificacao || '').trim().toUpperCase() !== 'PRIVADA') continue;
    const obraId = Number(obra.id);
    const cadastrado = valorPositivo(obra.vgv);
    resultado.set(obraId, {
      valor: cadastrado,
      origem: cadastrado > 0 ? 'CADASTRO' : 'SEM_UNIDADES',
      unidades_total: 0,
      unidades_sem_valor: 0
    });
    if (!cadastrado) obrasSemVgv.push(obraId);
  }

  if (!obrasSemVgv.length) return resultado;

  const unidades = await UnidadeComercial.findAll({
    attributes: ['id', 'valor_base_venda'],
    where: { ativo: true, excluido_em: null },
    include: [{
      model: Empreendimento,
      as: 'empreendimento',
      attributes: ['obra_id'],
      where: { obra_id: { [Op.in]: obrasSemVgv }, ativo: true },
      required: true
    }]
  });

  const centavosPorObra = new Map();
  for (const unidadeInstance of unidades) {
    const unidade = typeof unidadeInstance.toJSON === 'function'
      ? unidadeInstance.toJSON()
      : unidadeInstance;
    const obraId = Number(unidade.empreendimento?.obra_id);
    const info = resultado.get(obraId);
    if (!info || info.origem === 'CADASTRO') continue;

    info.unidades_total += 1;
    const baseVenda = valorPositivo(unidade.valor_base_venda);
    if (!baseVenda) {
      info.unidades_sem_valor += 1;
      continue;
    }
    centavosPorObra.set(obraId, (centavosPorObra.get(obraId) || 0) + Math.round(baseVenda * 100));
  }

  for (const obraId of obrasSemVgv) {
    const info = resultado.get(obraId);
    if (info.unidades_sem_valor) {
      info.origem = 'UNIDADES_INCOMPLETAS';
    } else if (info.unidades_total && centavosPorObra.get(obraId)) {
      info.valor = centavosPorObra.get(obraId) / 100;
      info.origem = 'UNIDADES';
    }
  }

  return resultado;
}

module.exports = { obterVgvEfetivoPorObras };
