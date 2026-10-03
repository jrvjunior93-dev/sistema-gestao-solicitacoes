'use strict';

// Os vínculos de contrato/pedido continuam apontando para o título original.
// Esta projeção SOMENTE DE LEITURA resolve a obrigação atual pelas alocações do
// acordo. Não registra baixas, não reescreve o título original e não move caixa.
const { Op } = require('sequelize');
const db = require('../models');
const { centavos, dinheiro } = require('./tituloRenegociacaoDomain');
const plain = value => value?.toJSON ? value.toJSON() : value;

async function projetarOrigens(titulos, { transaction } = {}) {
  const ids = [...new Set(titulos.filter(t => t?.renegociado_por_id || t?.status === 'RENEGOCIADO')
    .map(t => Number(t.id)).filter(Boolean))];
  if (!ids.length) return titulos;
  const originais = await db.TituloFinanceiro.findAll({
    where: { id: { [Op.in]: ids }, renegociado_por_id: { [Op.ne]: null } },
    transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {})
  });
  if (!originais.length) return titulos;
  const origens = new Map(originais.map(t => [Number(t.id), plain(t)]));
  const alvos = await db.TituloRenegociacaoAlocacao.findAll({
    where: { titulo_origem_id: { [Op.in]: [...origens.keys()] } }, transaction, raw: true
  });
  const destinos = await db.TituloFinanceiro.findAll({
    where: { id: { [Op.in]: [...new Set(alvos.map(a => a.titulo_destino_id))] } }, transaction,
    order: [['id', 'ASC']], ...(transaction ? { lock: transaction.LOCK.UPDATE } : {})
  });
  // Buscar TODAS as alocações de cada parcela, não apenas a origem consultada:
  // caso contrário dois contratos receberiam o valor integral da mesma baixa.
  const mapaAlocacoes = await require('./tituloRenegociacaoLeitura').mapaAlocacoes(destinos.map(plain), transaction);
  const resumo = new Map();
  for (const titulo of destinos) {
    const linhas = mapaAlocacoes.get(titulo.id);
    const pago = linhas.baixas.pago.map(p => centavos(p.toFixed(2)));
    linhas.forEach((a, i) => {
      const id = Number(a.titulo_origem_id);
      if (!origens.has(id)) return;
      const atual = resumo.get(id) || { total: 0, pago: 0, parcelas: [] };
      const valor = centavos(a.valor);
      atual.total += valor;
      atual.pago += pago[i];
      atual.parcelas.push({ id: titulo.id, codigo: titulo.codigo, vencimento: titulo.data_vencimento,
        valor: dinheiro(valor), valor_baixado: dinheiro(pago[i]), valor_saldo: dinheiro(valor - pago[i]),
        obra_id: a.obra_id, apropriacao_id: a.apropriacao_id });
      resumo.set(id, atual);
    });
  }
  return titulos.map(t => {
    const original = origens.get(Number(t.id));
    if (!original) return t;
    const atual = resumo.get(Number(t.id));
    if (!atual) throw new Error(`Negociação do título ${t.id} sem parcelas vinculadas.`);
    const anterior = centavos(original.valor_baixado);
    const saldo = atual.total - atual.pago;
    const pendentes = atual.parcelas.filter(p => centavos(p.valor_saldo) > 0);
    const vencimento = pendentes.map(p => p.vencimento).sort()[0] || original.data_vencimento;
    return { ...plain(t), renegociado_por_id: original.renegociado_por_id,
      status_original: original.status, valor_original_antes_negociacao: original.valor_original,
      status: saldo === 0 ? 'QUITADO' : anterior + atual.pago > 0 ? 'PARCIAL' : 'ABERTO',
      valor_original: dinheiro(anterior + atual.total), valor_baixado: dinheiro(anterior + atual.pago),
      valor_saldo: dinheiro(saldo), data_vencimento: vencimento,
      renegociacao_titulos: atual.parcelas };
  });
}

async function projetarAssociacoes(registros, alias, options = {}) {
  const titulos = registros.map(r => r[alias]).filter(Boolean);
  const projetados = await projetarOrigens(titulos, options);
  const mapa = new Map(projetados.map(t => [Number(t.id), t]));
  for (const registro of registros) {
    const atual = registro[alias];
    const projetado = mapa.get(Number(atual?.id));
    if (!projetado || projetado === atual) continue;
    // Uma cópia impede que o Sequelize tente persistir os valores da projeção.
    const copia = atual?.constructor?.build ? atual.constructor.build(projetado, { isNewRecord: false, raw: true }) : projetado;
    if (registro.setDataValue) registro.setDataValue(alias, copia);
    else registro[alias] = copia;
  }
  return registros;
}

module.exports = { projetarOrigens, projetarAssociacoes };
