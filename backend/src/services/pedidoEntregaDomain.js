'use strict';

const arredondar = (valor) => Math.round(Number(valor) * 1000) / 1000;
function hojeBrasil(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}
function dataValida(data) {
  return typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data)
    && !Number.isNaN(Date.parse(`${data}T12:00:00Z`))
    && new Date(`${data}T12:00:00Z`).toISOString().slice(0, 10) === data;
}
function adicionarDiasUteis(data, dias, feriados = []) {
  if (!dataValida(data)) throw new Error('Data invalida.');
  const atual = new Date(`${data}T12:00:00Z`);
  const ignorar = new Set(feriados);
  for (let contagem = 0; contagem < dias;) {
    atual.setUTCDate(atual.getUTCDate() + 1);
    if (![0, 6].includes(atual.getUTCDay()) && !ignorar.has(atual.toISOString().slice(0, 10))) contagem += 1;
  }
  return atual.toISOString().slice(0, 10);
}
function previsaoDaCotacao(cotacao, dataBase = hojeBrasil(), feriados = []) {
  const valor = cotacao?.prazo_entrega_dias;
  const dias = Number(valor);
  if (valor === null || valor === undefined || valor === '' || !Number.isInteger(dias) || dias < 0 || dias > 36500) return null;
  if (!dataValida(dataBase)) throw new Error('Data base inválida.');
  if (cotacao.prazo_entrega_tipo === 'DIAS_UTEIS') return adicionarDiasUteis(dataBase, dias, feriados);
  if (cotacao.prazo_entrega_tipo !== 'DIAS_CORRIDOS') return null;
  const data = new Date(`${dataBase}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

function confirmarPrevisaoFornecedor(cotacao, entrada, hoje = hojeBrasil(), feriados = []) {
  const calculada = previsaoDaCotacao(cotacao, hoje, feriados);
  const falhar = (texto) => { throw Object.assign(new Error(texto), { statusCode: 400 }); };
  if (!entrada || entrada.confirmada !== true) falhar('Confirme a previsão de entrega de cada fornecedor antes de gerar os pedidos.');
  if (entrada.data_base !== hoje) falhar('A data de geração mudou. Abra novamente a confirmação de entrega.');
  if (!dataValida(entrada.previsao) || entrada.previsao < hoje) falhar('A entrega confirmada deve ser hoje ou futura.');
  if ((entrada.previsao_calculada || null) !== calculada) falhar('O prazo da cotação ou calendário mudou. Revise novamente a previsão de entrega.');
  return { previsao: entrada.previsao, calculada, alterada: entrada.previsao !== calculada, data_base: hoje };
}
function situacaoEntrega(item, recebido, controle = {}, hoje = hojeBrasil()) {
  const previsto = arredondar(Number(item.quantidade_pedido || 0) - Number(item.quantidade_cancelada || 0));
  recebido = arredondar(recebido);
  const restante = Math.max(0, arredondar(previsto - recebido));
  const divergencia = recebido > previsto;
  const cancelado = Boolean(item.removido) && recebido === 0;
  const estado = cancelado ? 'CONCLUIDO' : controle.estado || 'OBRA';
  const informar = !cancelado && restante > 0 && estado === 'OBRA' && !!controle.previsao && controle.previsao < hoje;
  const pendenciaCompras = !cancelado && (estado === 'COMPRAS' || estado === 'DIVERGENCIA');
  return {
    ...controle, previsto, recebido, restante,
    situacao: cancelado ? 'CANCELADO' : divergencia ? 'DIVERGENCIA' : restante === 0 ? 'ENTREGUE' : recebido > 0 ? 'PARCIAL' : 'NAO_ENTREGUE',
    informar_obrigatorio: informar,
    pendencia_compras: pendenciaCompras,
    reprogramacao_vencida: estado === 'COMPRAS' && !!controle.prazo_compras && controle.prazo_compras < hoje,
    responsavel: pendenciaCompras ? 'COMPRAS' : restante > 0 ? 'OBRA' : null,
    versao: Number(controle.versao || 0)
  };
}
module.exports = { arredondar, hojeBrasil, dataValida, adicionarDiasUteis, situacaoEntrega, previsaoDaCotacao, confirmarPrevisaoFornecedor };
