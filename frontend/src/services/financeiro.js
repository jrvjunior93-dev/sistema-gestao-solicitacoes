import { API_URL, authHeaders } from './api';
import { mensagemDeErro } from './erroDeResposta';

/* A escolha da mensagem é do `erroDeResposta` — uma regra, um arquivo.
   Aqui ficava a mesma dança de try/JSON.parse/SyntaxError repetida em 30
   serviços, e o `text ||` do final era o que despejava HTML de servidor na
   tela (achado A2). */
async function parseJson(response, fallbackMessage) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(mensagemDeErro(text, fallbackMessage, response.status));
  }

  return text ? JSON.parse(text) : null;
}

export async function getTitulosFinanceiros(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query ? `${API_URL}/financeiro/titulos?${query}` : `${API_URL}/financeiro/titulos`;

  const response = await fetch(url, {
    headers: authHeaders(),
    cache: 'no-store'
  });

  return parseJson(response, 'Erro ao buscar titulos financeiros');
}

function buildFilaPagamentosQuery(params = {}) {
  return new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
}

export async function getFilaPagamentos(params = {}) {
  const query = buildFilaPagamentosQuery(params);
  const response = await fetch(`${API_URL}/financeiro/fila-pagamentos${query ? `?${query}` : ''}`, {
    headers: authHeaders(),
    cache: 'no-store'
  });
  return parseJson(response, 'Erro ao carregar a fila de pagamentos');
}

export async function getContasFilaPagamentos() {
  const response = await fetch(`${API_URL}/financeiro/fila-pagamentos/contas`, {
    headers: authHeaders(),
    cache: 'no-store'
  });
  return parseJson(response, 'Erro ao carregar as contas pagadoras');
}

export async function enviarTitulosFilaPagamentos(tituloIds, idempotencyKey) {
  const response = await fetch(`${API_URL}/financeiro/fila-pagamentos`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ titulo_ids: tituloIds, idempotency_key: idempotencyKey })
  });
  return parseJson(response, 'Erro ao enviar os titulos para pagamento');
}

export async function registrarBaixasFilaPagamentos(itens, idempotencyKey) {
  const response = await fetch(`${API_URL}/financeiro/fila-pagamentos/baixar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ itens, idempotency_key: idempotencyKey })
  });
  return parseJson(response, 'Erro ao registrar as baixas da fila');
}

export async function informarNaoPagamentoFila(id, motivo) {
  const response = await fetch(`${API_URL}/financeiro/fila-pagamentos/${id}/resultado`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ status: 'NAO_PAGO', motivo })
  });
  return parseJson(response, 'Erro ao informar que o titulo nao foi pago');
}

export async function resolverFilaPagamento(id, acao, motivo = '') {
  const response = await fetch(`${API_URL}/financeiro/fila-pagamentos/${id}/resolver`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ acao, motivo })
  });
  return parseJson(response, 'Erro ao resolver a pendencia de pagamento');
}

export async function gerarRelatorioTitulosFinanceirosPdf(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query
    ? `${API_URL}/financeiro/titulos/relatorio.pdf?${query}`
    : `${API_URL}/financeiro/titulos/relatorio.pdf`;
  const response = await fetch(url, {
    cache: 'no-store',
    headers: authHeaders()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(mensagemDeErro(text, 'Erro ao gerar relatorio de titulos financeiros', response.status));
  }

  const disposition = response.headers.get('content-disposition') || '';
  const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
  return {
    blob: await response.blob(),
    filename: filenameMatch?.[1] || 'relatorio-contas-a-pagar.pdf'
  };
}

export async function getFretesPedidosPendentesFinanceiro(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query
    ? `${API_URL}/financeiro/fretes-pedidos/pendentes?${query}`
    : `${API_URL}/financeiro/fretes-pedidos/pendentes`;

  const response = await fetch(url, {
    cache: 'no-store',
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar fretes pendentes de pedidos');
}

export async function getBankingDashboard() {
  const response = await fetch(`${API_URL}/financeiro/bancos/dashboard`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao carregar painel bancario enterprise');
}

export async function getRelatorioMovimentacaoContas(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query
    ? `${API_URL}/financeiro/relatorios/movimentacao-contas?${query}`
    : `${API_URL}/financeiro/relatorios/movimentacao-contas`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao gerar relatorio de movimentacao de contas');
}

export async function getRelatorioConciliacaoContas(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query
    ? `${API_URL}/financeiro/relatorios/conciliacao-contas?${query}`
    : `${API_URL}/financeiro/relatorios/conciliacao-contas`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao gerar relatorio de conciliacao bancaria');
}

export async function getCnab240PagamentosSpec() {
  const response = await fetch(`${API_URL}/financeiro/bancos/cnab240-pagamentos`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao carregar contrato CNAB240 de pagamentos');
}

export async function getCaixaPagamentoConvenios() {
  const response = await fetch(`${API_URL}/financeiro/bancos/caixa-pagamentos/convenios`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar convenios Caixa de pagamentos');
}

export async function salvarCaixaPagamentoConvenio(data, id = null) {
  const response = await fetch(
    id
      ? `${API_URL}/financeiro/bancos/caixa-pagamentos/convenios/${id}`
      : `${API_URL}/financeiro/bancos/caixa-pagamentos/convenios`,
    {
      method: id ? 'PATCH' : 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    }
  );

  return parseJson(response, 'Erro ao salvar convenio Caixa de pagamentos');
}

export async function getCaixaPagamentoTitulosElegiveis(convenioId) {
  const response = await fetch(
    `${API_URL}/financeiro/bancos/caixa-pagamentos/titulos-elegiveis?convenio_id=${encodeURIComponent(convenioId || '')}`,
    { headers: authHeaders() }
  );

  return parseJson(response, 'Erro ao buscar titulos elegiveis para remessa Caixa');
}

export async function getCaixaPagamentoRemessas() {
  const response = await fetch(`${API_URL}/financeiro/bancos/caixa-pagamentos/remessas`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar remessas Caixa de pagamentos');
}

export async function gerarCaixaPagamentoRemessa(data) {
  const response = await fetch(`${API_URL}/financeiro/bancos/caixa-pagamentos/remessas`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao gerar remessa Caixa de pagamentos');
}

export function getCaixaPagamentoRemessaDownloadUrl(id) {
  return `${API_URL}/financeiro/bancos/caixa-pagamentos/remessas/${id}/download`;
}

export async function baixarCaixaPagamentoRemessa(id) {
  const response = await fetch(getCaixaPagamentoRemessaDownloadUrl(id), {
    headers: authHeaders()
  });

  if (!response.ok) {
    await parseJson(response, 'Erro ao baixar remessa Caixa de pagamentos');
  }

  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return {
    blob,
    filename: match?.[1] || `CAIXA_PAGAMENTO_REMESSA_${id}.REM`
  };
}

export async function getRelatorioFluxoCaixa(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query
    ? `${API_URL}/financeiro/relatorios/fluxo-caixa?${query}`
    : `${API_URL}/financeiro/relatorios/fluxo-caixa`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar relatorio de fluxo de caixa');
}

export async function getRelatorioGrupoConsolidado(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query
    ? `${API_URL}/financeiro/relatorios/grupo-consolidado?${query}`
    : `${API_URL}/financeiro/relatorios/grupo-consolidado`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar painel executivo do grupo');
}

export async function getRelatorioFluxoConsolidado(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query
    ? `${API_URL}/financeiro/relatorios/fluxo-consolidado?${query}`
    : `${API_URL}/financeiro/relatorios/fluxo-consolidado`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar fluxo de caixa consolidado');
}

export async function getRelatorioAnaliticoFinanceiro(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query
    ? `${API_URL}/financeiro/relatorios/analitico?${query}`
    : `${API_URL}/financeiro/relatorios/analitico`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar relatorio analitico financeiro');
}

export async function getRelatorioFinanceiroObras(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query
    ? `${API_URL}/financeiro/relatorios/financeiro-obras?${query}`
    : `${API_URL}/financeiro/relatorios/financeiro-obras`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar financeiro de obras');
}

export async function previewImportacaoCustosHistoricosObra(formData) {
  const response = await fetch(`${API_URL}/financeiro/relatorios/financeiro-obras/importacoes-historicas/preview`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });

  return parseJson(response, 'Erro ao validar importacao de custos historicos');
}

export async function confirmarImportacaoCustosHistoricosObra(payload = {}) {
  const response = await fetch(`${API_URL}/financeiro/relatorios/financeiro-obras/importacoes-historicas/confirmar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });

  return parseJson(response, 'Erro ao importar custos historicos');
}

export async function getImportacoesCustosHistoricosObra(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query
    ? `${API_URL}/financeiro/relatorios/financeiro-obras/importacoes-historicas?${query}`
    : `${API_URL}/financeiro/relatorios/financeiro-obras/importacoes-historicas`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao listar importacoes de custos historicos');
}

export async function getBaixasFinanceiras(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query ? `${API_URL}/financeiro/baixas?${query}` : `${API_URL}/financeiro/baixas`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar baixas financeiras');
}

export async function getConciliacoesBancarias(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query
    ? `${API_URL}/financeiro/conciliacoes?${query}`
    : `${API_URL}/financeiro/conciliacoes`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar conciliacoes bancarias');
}

export async function getImportacoesConciliacao(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query
    ? `${API_URL}/financeiro/conciliacoes/importacoes?${query}`
    : `${API_URL}/financeiro/conciliacoes/importacoes`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar historico de importacoes OFX');
}

export async function importarOfxConciliacao(formData) {
  const response = await fetch(`${API_URL}/financeiro/conciliacoes/importar-ofx`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });

  return parseJson(response, 'Erro ao importar arquivo OFX');
}

export async function confirmarConciliacaoBancaria(id, data) {
  const response = await fetch(`${API_URL}/financeiro/conciliacoes/${id}/confirmar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao confirmar conciliacao bancaria');
}

export async function corrigirContaConciliacaoBancaria(id, data) {
  const response = await fetch(`${API_URL}/financeiro/conciliacoes/${id}/conta`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao corrigir conta da conciliacao bancaria');
}

export async function getFaturasAssociacaoConciliacao(id, params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query
    ? `${API_URL}/financeiro/conciliacoes/${id}/faturas-cartao?${query}`
    : `${API_URL}/financeiro/conciliacoes/${id}/faturas-cartao`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar faturas para conciliacao');
}

export async function confirmarConciliacaoFaturaCartao(id, data) {
  const response = await fetch(`${API_URL}/financeiro/conciliacoes/${id}/confirmar-fatura`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao conciliar fatura de cartao');
}

export async function confirmarConciliacaoTransferencia(id, data) {
  const response = await fetch(`${API_URL}/financeiro/conciliacoes/${id}/confirmar-transferencia`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao conciliar transferencia entre contas');
}

export async function estornarConciliacaoTransferencia(id, data) {
  const response = await fetch(`${API_URL}/financeiro/conciliacoes/${id}/estornar-transferencia`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao estornar transferencia conciliada');
}

export async function estornarConciliacaoBancaria(id, data) {
  const response = await fetch(`${API_URL}/financeiro/conciliacoes/${id}/estornar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao estornar conciliacao bancaria');
}

export async function confirmarConciliacaoTarifaBancaria(id, data) {
  const response = await fetch(`${API_URL}/financeiro/conciliacoes/${id}/confirmar-tarifa`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao conciliar tarifa bancaria');
}

export async function getTarifasEstornoConciliacao(id) {
  const response = await fetch(`${API_URL}/financeiro/conciliacoes/${id}/tarifas-estorno`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao localizar tarifas para estorno');
}

export async function confirmarConciliacaoEstornoTarifa(id, data) {
  const response = await fetch(`${API_URL}/financeiro/conciliacoes/${id}/confirmar-estorno-tarifa`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao conciliar estorno de tarifa bancaria');
}

export async function confirmarConciliacaoEstornoBancario(id, data) {
  const response = await fetch(`${API_URL}/financeiro/conciliacoes/${id}/confirmar-estorno-bancario`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao confirmar estorno bancario');
}

export async function confirmarConciliacaoCreditoRotativo(id, data = {}) {
  const response = await fetch(`${API_URL}/financeiro/conciliacoes/${id}/confirmar-credito-rotativo`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao conciliar credito rotativo');
}

export async function criarTituloConciliacaoBancaria(id, data) {
  const response = await fetch(`${API_URL}/financeiro/conciliacoes/${id}/criar-titulo`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao criar titulo rapido na conciliacao bancaria');
}

export async function conciliarSugestoesBancarias(data = {}) {
  const response = await fetch(`${API_URL}/financeiro/conciliacoes/conciliar-sugeridos`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao conciliar sugestoes em lote');
}

export async function ignorarConciliacaoBancaria(id) {
  const response = await fetch(`${API_URL}/financeiro/conciliacoes/${id}/ignorar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({})
  });

  return parseJson(response, 'Erro ao ignorar conciliacao bancaria');
}

export async function removerConciliacaoBancaria(id, data = {}) {
  const response = await fetch(`${API_URL}/financeiro/conciliacoes/${id}/remover`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao remover lancamento do extrato bancario');
}

export async function getCaixasFinanceiros(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query ? `${API_URL}/financeiro/caixas?${query}` : `${API_URL}/financeiro/caixas`;

  const response = await fetch(url, {
    headers: authHeaders(),
    cache: 'no-store'
  });

  return parseJson(response, 'Erro ao buscar caixas financeiros');
}

export async function getCaixaFinanceiro(id) {
  const response = await fetch(`${API_URL}/financeiro/caixas/${id}`, {
    headers: authHeaders(),
    cache: 'no-store'
  });

  return parseJson(response, 'Erro ao buscar caixa financeiro');
}

export async function abrirCaixaFinanceiro(data) {
  const response = await fetch(`${API_URL}/financeiro/caixas/abrir`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao abrir caixa financeiro');
}

export async function confirmarConciliacaoDiaCaixa(data) {
  const response = await fetch(`${API_URL}/financeiro/caixas/confirmar-conciliacao-dia`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao confirmar conciliacao do dia');
}

export async function fecharCaixaFinanceiro(id, data) {
  const response = await fetch(`${API_URL}/financeiro/caixas/${id}/fechar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao fechar caixa financeiro');
}

export async function registrarMovimentoCaixaFinanceiro(id, data) {
  const response = await fetch(`${API_URL}/financeiro/caixas/${id}/movimentos`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao registrar movimento de caixa');
}

export async function estornarMovimentoCaixaFinanceiro(id, movimentoId, data) {
  const response = await fetch(`${API_URL}/financeiro/caixas/${id}/movimentos/${movimentoId}/estornar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao estornar movimento de caixa');
}

export async function getTransferenciasFinanceiras(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query ? `${API_URL}/financeiro/transferencias?${query}` : `${API_URL}/financeiro/transferencias`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar transferencias financeiras');
}

export async function criarTransferenciaFinanceira(data) {
  const response = await fetch(`${API_URL}/financeiro/transferencias`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao registrar transferencia financeira');
}

export async function cancelarTransferenciaFinanceira(id, data = {}) {
  const response = await fetch(`${API_URL}/financeiro/transferencias/${id}/cancelar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao cancelar transferencia financeira');
}

export async function getMovimentosAssociacaoConciliacao(id, params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query
    ? `${API_URL}/financeiro/conciliacoes/${id}/movimentos?${query}`
    : `${API_URL}/financeiro/conciliacoes/${id}/movimentos`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar movimentos para associacao manual');
}

export async function getTituloFinanceiroById(id) {
  const response = await fetch(`${API_URL}/financeiro/titulos/${id}`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar titulo financeiro');
}

export async function criarTituloFinanceiro(data) {
  const response = await fetch(`${API_URL}/financeiro/titulos`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao criar titulo financeiro');
}

export async function exportarModeloImportacaoTitulosPagar() {
  const response = await fetch(`${API_URL}/financeiro/titulos/importacoes/modelo`, {
    headers: authHeaders()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(mensagemDeErro(text, 'Erro ao exportar modelo de contas a pagar', response.status));
  }

  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return { blob, filename: match?.[1] || 'modelo-importacao-contas-a-pagar.xlsx' };
}

export async function criarPreviewImportacaoTitulosPagar(file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${API_URL}/financeiro/titulos/importacoes/preview`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });
  return parseJson(response, 'Erro ao validar planilha de contas a pagar');
}

export async function getImportacaoTitulosPagar(id) {
  const response = await fetch(`${API_URL}/financeiro/titulos/importacoes/${id}`, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao consultar importacao de contas a pagar');
}

export async function confirmarImportacaoTitulosPagar(id, { aceitarAvisos = false, idempotencyKey } = {}) {
  const response = await fetch(`${API_URL}/financeiro/titulos/importacoes/${id}/confirmar`, {
    method: 'POST',
    headers: authHeaders({
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey || crypto.randomUUID()
    }),
    body: JSON.stringify({ aceitar_avisos: aceitarAvisos })
  });
  return parseJson(response, 'Erro ao confirmar importacao de contas a pagar');
}

export async function atualizarTituloFinanceiro(id, data) {
  const response = await fetch(`${API_URL}/financeiro/titulos/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao editar titulo financeiro');
}

export async function importarCodigosBarrasTitulos(data) {
  const response = await fetch(`${API_URL}/financeiro/titulos/importar-codigos-barras`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao importar codigos de barras dos titulos');
}

export async function excluirTitulosFinanceirosEmMassa(data) {
  const response = await fetch(`${API_URL}/financeiro/titulos/excluir-em-massa`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao excluir titulos financeiros');
}

export async function atualizarCobrancaTituloFinanceiro(id, data) {
  const response = await fetch(`${API_URL}/financeiro/titulos/${id}/cobranca`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao atualizar dados de cobranca do titulo');
}

export async function getBoletosConfig() {
  const response = await fetch(`${API_URL}/boletos/config`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar configuracao de boletos');
}

export async function getTitulosParaBoleto(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query ? `${API_URL}/boletos/titulos?${query}` : `${API_URL}/boletos/titulos`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar titulos para boleto');
}

export async function getBoletoTitulo(id) {
  const response = await fetch(`${API_URL}/boletos/titulos/${id}`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar boleto do titulo');
}

export async function gerarBoletoTitulo(id) {
  const response = await fetch(`${API_URL}/boletos/titulos/${id}/gerar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({})
  });

  return parseJson(response, 'Erro ao gerar boleto do titulo');
}

export async function gerarAmostraBoletoTitulo(id) {
  const response = await fetch(`${API_URL}/boletos/titulos/${id}/amostra`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({})
  });

  return parseJson(response, 'Erro ao gerar amostra de boleto');
}

export async function baixarPdfBoletoTitulo(id, { amostra = false } = {}) {
  const query = amostra ? '?amostra=1' : '';
  const response = await fetch(`${API_URL}/boletos/titulos/${id}/pdf${query}`, {
    headers: authHeaders()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(mensagemDeErro(text, 'Erro ao baixar PDF do boleto', response.status));
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
  return {
    blob,
    filename: filenameMatch?.[1] || `boleto-${id}${amostra ? '-amostra' : ''}.pdf`
  };
}

export async function getBoletoCaixaConvenios(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query ? `${API_URL}/boletos/caixa/convenios?${query}` : `${API_URL}/boletos/caixa/convenios`;
  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar convenios Caixa');
}

export async function getBoletoCaixaRemessas(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query ? `${API_URL}/boletos/caixa/remessas?${query}` : `${API_URL}/boletos/caixa/remessas`;
  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar remessas Caixa');
}

export async function gerarBoletoCaixaRemessa({ convenioId, tituloIds = [], boletoIds = [] }) {
  const response = await fetch(`${API_URL}/boletos/caixa/remessas?download=1`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      convenio_id: convenioId,
      titulo_ids: tituloIds,
      boleto_ids: boletoIds
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(mensagemDeErro(text, 'Erro ao gerar remessa Caixa', response.status));
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
  return {
    blob,
    filename: filenameMatch?.[1] || 'remessa-caixa.rem',
    remessaId: response.headers.get('x-remessa-id'),
    hash: response.headers.get('x-remessa-hash')
  };
}

export async function baixarBoletoCaixaRemessa(id) {
  const response = await fetch(`${API_URL}/boletos/caixa/remessas/${id}/download`, {
    headers: authHeaders()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(mensagemDeErro(text, 'Erro ao baixar remessa Caixa', response.status));
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
  return {
    blob,
    filename: filenameMatch?.[1] || `remessa-caixa-${id}.rem`,
    hash: response.headers.get('x-remessa-hash'),
    hashConfere: response.headers.get('x-remessa-hash-confere') === 'true'
  };
}

export async function baixarBoletoCaixaHomologacaoCsv(id) {
  const response = await fetch(`${API_URL}/boletos/caixa/remessas/${id}/homologacao?format=csv`, {
    headers: authHeaders()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(mensagemDeErro(text, 'Erro ao baixar relatorio de homologacao Caixa', response.status));
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
  return {
    blob,
    filename: filenameMatch?.[1] || `homologacao-caixa-remessa-${id}.csv`
  };
}

export async function baixarBoletoCaixaHomologacaoPacote(id) {
  const response = await fetch(`${API_URL}/boletos/caixa/remessas/${id}/homologacao-pacote`, {
    headers: authHeaders()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(mensagemDeErro(text, 'Erro ao baixar pacote de homologacao Caixa', response.status));
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
  return {
    blob,
    filename: filenameMatch?.[1] || `homologacao-caixa-remessa-${id}.zip`,
    hashConfere: response.headers.get('x-remessa-hash-confere') === 'true'
  };
}

export async function getBoletoCaixaRetornos(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query ? `${API_URL}/boletos/caixa/retornos?${query}` : `${API_URL}/boletos/caixa/retornos`;
  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar retornos Caixa');
}

export async function importarBoletoCaixaRetorno({ convenioId, file }) {
  const formData = new FormData();
  formData.append('convenio_id', convenioId);
  formData.append('file', file);

  const response = await fetch(`${API_URL}/boletos/caixa/retornos`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });

  return parseJson(response, 'Erro ao importar retorno Caixa');
}

export async function getTituloFinanceiroAuditoria(id) {
  const response = await fetch(`${API_URL}/financeiro/titulos/${id}/auditoria`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar auditoria do titulo financeiro');
}

export async function getTitulosFinanceirosPorSolicitacao(solicitacaoId) {
  const response = await fetch(`${API_URL}/solicitacoes/${solicitacaoId}/titulos-financeiros`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar titulos financeiros da solicitacao');
}

export async function gerarContaPorSolicitacao(solicitacaoId, data) {
  const response = await fetch(`${API_URL}/solicitacoes/${solicitacaoId}/gerar-conta`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao gerar conta pela solicitacao');
}

export async function baixarTituloFinanceiro(id, data) {
  const response = await fetch(`${API_URL}/financeiro/titulos/${id}/baixas`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao registrar baixa financeira');
}

export async function baixarTitulosFinanceirosEmMassaParcelado(data) {
  const response = await fetch(`${API_URL}/financeiro/titulos/baixas/parceladas`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao registrar baixa parcelada em massa');
}

export async function getChequesTerceirosDisponiveis(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value);
    }
  });

  const suffix = query.toString();
  const response = await fetch(
    `${API_URL}/financeiro/cheques-terceiros/disponiveis${suffix ? `?${suffix}` : ''}`,
    { headers: authHeaders() }
  );

  return parseJson(response, 'Erro ao buscar cheques de terceiros disponiveis');
}

export async function getChequesTerceiros(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const response = await fetch(
    `${API_URL}/financeiro/cheques-terceiros${query ? `?${query}` : ''}`,
    { headers: authHeaders() }
  );
  return parseJson(response, 'Erro ao buscar carteira de cheques');
}

export async function getChequeTerceiro(id) {
  const response = await fetch(`${API_URL}/financeiro/cheques-terceiros/${id}`, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao buscar cheque de terceiro');
}

export async function criarChequeTerceiro(data) {
  const response = await fetch(`${API_URL}/financeiro/cheques-terceiros`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao cadastrar cheque de terceiro');
}

export async function criarClienteChequeTerceiro(data) {
  const response = await fetch(`${API_URL}/financeiro/cheques-terceiros/clientes`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao cadastrar cliente');
}

export async function movimentarChequeTerceiro(id, data) {
  const response = await fetch(`${API_URL}/financeiro/cheques-terceiros/${id}/movimentar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao movimentar cheque de terceiro');
}

export async function baixarModeloChequesTerceiros() {
  const response = await fetch(`${API_URL}/financeiro/cheques-terceiros/modelo.xlsx`, {
    headers: authHeaders()
  });
  if (!response.ok) await parseJson(response, 'Erro ao baixar modelo de cheques');
  return response.blob();
}

export async function previewImportacaoChequesTerceiros(file) {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${API_URL}/financeiro/cheques-terceiros/importacoes/preview`, {
    method: 'POST',
    headers: authHeaders(),
    body: form
  });
  return parseJson(response, 'Erro ao validar planilha de cheques');
}

export async function confirmarImportacaoChequesTerceiros(data, idempotencyKey) {
  const response = await fetch(`${API_URL}/financeiro/cheques-terceiros/importacoes/confirmar`, {
    method: 'POST',
    headers: authHeaders({
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao confirmar importacao de cheques');
}

export async function previewBaixaFinanceiraComposta(data) {
  const response = await fetch(`${API_URL}/financeiro/baixas-compostas/preview`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao validar baixa com multiplas fontes');
}

export async function confirmarBaixaFinanceiraComposta(data, idempotencyKey) {
  const response = await fetch(`${API_URL}/financeiro/baixas-compostas/confirmar`, {
    method: 'POST',
    headers: authHeaders({
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    }),
    body: JSON.stringify(data)
  });
  return parseJson(response, 'Erro ao confirmar baixa com multiplas fontes');
}

export async function getBaixasFinanceirasCompostas(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const response = await fetch(
    `${API_URL}/financeiro/baixas-compostas${query ? `?${query}` : ''}`,
    { headers: authHeaders() }
  );
  return parseJson(response, 'Erro ao buscar baixas com multiplas fontes');
}

export async function getBaixaFinanceiraComposta(id) {
  const response = await fetch(`${API_URL}/financeiro/baixas-compostas/${id}`, {
    headers: authHeaders()
  });
  return parseJson(response, 'Erro ao consultar baixa com multiplas fontes');
}

export async function estornarBaixaFinanceiraComposta(id, motivo) {
  const response = await fetch(`${API_URL}/financeiro/baixas-compostas/${id}/estornar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ motivo })
  });
  return parseJson(response, 'Erro ao estornar baixa composta');
}

export async function baixarTituloPorConciliacoes(id, data) {
  const response = await fetch(`${API_URL}/financeiro/titulos/${id}/baixas/conciliacoes`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao baixar titulo por conciliacoes bancarias');
}

export async function estornarMovimentoFinanceiro(tituloId, movimentoId, data = {}) {
  const response = await fetch(`${API_URL}/financeiro/titulos/${tituloId}/movimentos/${movimentoId}/estornar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao estornar baixa financeira');
}

export async function getContasBancarias() {
  const response = await fetch(`${API_URL}/financeiro/contas-bancarias`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar contas bancarias');
}

export async function getFormasPagamentoFinanceiras() {
  const response = await fetch(`${API_URL}/financeiro/formas-pagamento`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar formas de pagamento');
}

export async function getTarifasBancariasAtalhos() {
  const response = await fetch(`${API_URL}/financeiro/tarifas-bancarias-atalhos`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar atalhos de tarifas bancarias');
}

export async function atualizarTarifasBancariasAtalhos(data) {
  const response = await fetch(`${API_URL}/financeiro/tarifas-bancarias-atalhos`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao salvar atalhos de tarifas bancarias');
}

export async function criarFormaPagamentoFinanceira(data) {
  const response = await fetch(`${API_URL}/financeiro/formas-pagamento`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao criar forma de pagamento');
}

export async function atualizarFormaPagamentoFinanceira(id, data) {
  const response = await fetch(`${API_URL}/financeiro/formas-pagamento/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao atualizar forma de pagamento');
}

export async function getCartoesFinanceiros() {
  const response = await fetch(`${API_URL}/financeiro/cartoes`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar cartoes financeiros');
}

export async function criarCartaoFinanceiro(data) {
  const response = await fetch(`${API_URL}/financeiro/cartoes`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao criar cartao financeiro');
}

export async function atualizarCartaoFinanceiro(id, data) {
  const response = await fetch(`${API_URL}/financeiro/cartoes/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao atualizar cartao financeiro');
}

export async function getFaturasCartaoFinanceiro(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query ? `${API_URL}/financeiro/faturas-cartao?${query}` : `${API_URL}/financeiro/faturas-cartao`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar faturas de cartao');
}

export async function getFaturaCartaoFinanceiro(id) {
  const response = await fetch(`${API_URL}/financeiro/faturas-cartao/${id}`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar fatura de cartao');
}

export async function baixarFaturaCartaoFinanceiro(id, data) {
  const response = await fetch(`${API_URL}/financeiro/faturas-cartao/${id}/baixar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao baixar fatura de cartao');
}

export async function criarContaBancaria(data) {
  const response = await fetch(`${API_URL}/financeiro/contas-bancarias`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao criar conta bancaria');
}

export async function atualizarContaBancaria(id, data) {
  const response = await fetch(`${API_URL}/financeiro/contas-bancarias/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao atualizar conta bancaria');
}

export async function getCategoriasFinanceiras() {
  const response = await fetch(`${API_URL}/financeiro/categorias`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar categorias financeiras');
}

export async function criarCategoriaFinanceira(data) {
  const response = await fetch(`${API_URL}/financeiro/categorias`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao criar categoria financeira');
}

export async function atualizarCategoriaFinanceira(id, data) {
  const response = await fetch(`${API_URL}/financeiro/categorias/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao atualizar categoria financeira');
}

export async function getResultadoObras() {
  const response = await fetch(`${API_URL}/financeiro/relatorios/resultado-obras`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar resultado de obras');
}

export async function getResultadoCentrosCusto() {
  const response = await fetch(`${API_URL}/financeiro/relatorios/centros-custo`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar resultado de centros de custo');
}

export async function getDreFinanceira(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query ? `${API_URL}/financeiro/relatorios/dre?${query}` : `${API_URL}/financeiro/relatorios/dre`;
  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar DRE financeira');
}

export async function getDreComparativoFinanceiro(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query
    ? `${API_URL}/financeiro/relatorios/dre/comparativo?${query}`
    : `${API_URL}/financeiro/relatorios/dre/comparativo`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar comparativo mensal da DRE');
}

export async function getDreComparativoEmpresasFinanceiro(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query
    ? `${API_URL}/financeiro/relatorios/dre/empresas?${query}`
    : `${API_URL}/financeiro/relatorios/dre/empresas`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar comparativo da DRE por empresa');
}

export async function getDiagnosticoDreFinanceira() {
  const response = await fetch(`${API_URL}/financeiro/relatorios/dre/diagnostico`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar diagnostico da DRE');
}

export async function getRelatorioIntercompanyFinanceiro(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query
    ? `${API_URL}/financeiro/relatorios/intercompany?${query}`
    : `${API_URL}/financeiro/relatorios/intercompany`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar relatorio intercompany');
}

export async function getRelatorioEndividamentoFinanceiro(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query
    ? `${API_URL}/financeiro/relatorios/endividamento?${query}`
    : `${API_URL}/financeiro/relatorios/endividamento`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar relatorio de endividamento');
}

export async function getFinanciamentosBancarios(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query
    ? `${API_URL}/financeiro/financiamentos-bancarios?${query}`
    : `${API_URL}/financeiro/financiamentos-bancarios`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar financiamentos bancarios');
}

export async function getFinanciamentoBancario(id) {
  const response = await fetch(`${API_URL}/financeiro/financiamentos-bancarios/${id}`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar financiamento bancario');
}

export async function criarFinanciamentoBancario(data) {
  const response = await fetch(`${API_URL}/financeiro/financiamentos-bancarios`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao cadastrar financiamento bancario');
}

export async function gerarTitulosFinanciamentoBancario(id) {
  const response = await fetch(`${API_URL}/financeiro/financiamentos-bancarios/${id}/gerar-titulos`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({})
  });

  return parseJson(response, 'Erro ao gerar titulos do financiamento bancario');
}

export async function atualizarParcelaFinanciamentoBancario(id, data) {
  const response = await fetch(`${API_URL}/financeiro/financiamentos-bancarios/parcelas/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao atualizar parcela do financiamento bancario');
}

export async function getPaymentBeneficiaries(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query ? `${API_URL}/financeiro/favorecidos?${query}` : `${API_URL}/financeiro/favorecidos`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar favorecidos bancarios');
}

export async function criarPaymentBeneficiary(data) {
  const response = await fetch(`${API_URL}/financeiro/favorecidos`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao criar favorecido bancario');
}

export async function atualizarPaymentBeneficiary(id, data) {
  const response = await fetch(`${API_URL}/financeiro/favorecidos/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao atualizar favorecido bancario');
}

export async function getPaymentBeneficiaryAudit(id) {
  const response = await fetch(`${API_URL}/financeiro/favorecidos/${id}/auditoria`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar auditoria do favorecido');
}

export async function getPaymentEligibleTitulos(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query
    ? `${API_URL}/financeiro/pagamentos/titulos-elegiveis?${query}`
    : `${API_URL}/financeiro/pagamentos/titulos-elegiveis`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar titulos elegiveis para pagamento');
}

export async function getPaymentProviders() {
  const response = await fetch(`${API_URL}/financeiro/pagamentos/providers`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar providers de pagamento');
}

export async function getPaymentAccounts() {
  const response = await fetch(`${API_URL}/financeiro/pagamentos/accounts`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar contas pagadoras');
}

export async function criarPaymentAccount(data) {
  const response = await fetch(`${API_URL}/financeiro/pagamentos/accounts`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao criar conta pagadora');
}

export async function atualizarPaymentAccount(id, data) {
  const response = await fetch(`${API_URL}/financeiro/pagamentos/accounts/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao atualizar conta pagadora');
}

export async function criarPaymentBatch(data) {
  const response = await fetch(`${API_URL}/financeiro/pagamentos/lotes`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao criar lote de pagamento');
}

export async function getPaymentBatches(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query ? `${API_URL}/financeiro/pagamentos/lotes?${query}` : `${API_URL}/financeiro/pagamentos/lotes`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar lotes de pagamento');
}

export async function getPaymentBatch(id) {
  const response = await fetch(`${API_URL}/financeiro/pagamentos/lotes/${id}`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar lote de pagamento');
}

export async function submeterPaymentBatch(id) {
  const response = await fetch(`${API_URL}/financeiro/pagamentos/lotes/${id}/submeter-aprovacao`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({})
  });

  return parseJson(response, 'Erro ao submeter lote para aprovacao');
}

export async function aprovarPaymentBatch(id, data) {
  const response = await fetch(`${API_URL}/financeiro/pagamentos/lotes/${id}/aprovar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao aprovar lote de pagamento');
}

export async function rejeitarPaymentBatch(id, data = {}) {
  const response = await fetch(`${API_URL}/financeiro/pagamentos/lotes/${id}/rejeitar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao rejeitar lote de pagamento');
}

export async function cancelarPaymentBatch(id, data = {}) {
  const response = await fetch(`${API_URL}/financeiro/pagamentos/lotes/${id}/cancelar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao cancelar lote de pagamento');
}

export async function enviarPaymentBatchBanco(id, data) {
  const response = await fetch(`${API_URL}/financeiro/pagamentos/lotes/${id}/enviar-banco`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao enviar lote ao banco');
}

export async function enviarPaymentBatchBbSandbox(id, data) {
  const response = await fetch(`${API_URL}/financeiro/pagamentos/lotes/${id}/enviar-bb`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao enviar lote ao Banco do Brasil');
}

export async function sincronizarPaymentBatchStatusBb(id) {
  const response = await fetch(`${API_URL}/financeiro/pagamentos/lotes/${id}/sincronizar-status-bb`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({})
  });

  return parseJson(response, 'Erro ao sincronizar status BB');
}

export async function getPaymentBatchBbTransactions(id) {
  const response = await fetch(`${API_URL}/financeiro/pagamentos/lotes/${id}/transacoes-bb`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar transacoes BB');
}

export async function gerarComprovantePaymentBatchItem(batchId, itemId) {
  const response = await fetch(`${API_URL}/financeiro/pagamentos/lotes/${batchId}/itens/${itemId}/comprovante`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({})
  });

  return parseJson(response, 'Erro ao gerar comprovante de pagamento');
}

export async function getPaymentEvents(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  const url = query ? `${API_URL}/financeiro/pagamentos/eventos?${query}` : `${API_URL}/financeiro/pagamentos/eventos`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar eventos tecnicos de pagamento');
}

export async function getBbPaymentsHealth() {
  const response = await fetch(`${API_URL}/financeiro/pagamentos/bb/health`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao verificar configuracao BB');
}

export async function reprocessarPaymentBatch(id, data = {}) {
  const response = await fetch(`${API_URL}/financeiro/pagamentos/lotes/${id}/reprocessar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao reprocessar lote de pagamento');
}

export async function getPaymentsAwaitingBaixa() {
  const response = await fetch(`${API_URL}/financeiro/pagamentos/aguardando-baixa`, {
    headers: authHeaders()
  });

  return parseJson(response, 'Erro ao buscar pagamentos aguardando baixa');
}

export async function confirmarBaixaPaymentIntent(id, data = {}) {
  const response = await fetch(`${API_URL}/financeiro/pagamentos/intents/${id}/confirmar-baixa`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });

  return parseJson(response, 'Erro ao confirmar baixa do pagamento');
}

function buildDdaQuery(params = {}) {
  return new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
}

async function ddaRequest(path, options = {}, fallbackMessage = 'Erro ao consultar DDA') {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    cache: 'no-store',
    headers: authHeaders({
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    })
  });
  return parseJson(response, fallbackMessage);
}

export function getFinanceiroDdaResumo(params = {}) {
  const query = buildDdaQuery(params);
  return ddaRequest(`/financeiro/dda/resumo${query ? `?${query}` : ''}`, {}, 'Erro ao carregar resumo DDA');
}

export function getFinanceiroDdaBoletos(params = {}) {
  const query = buildDdaQuery(params);
  return ddaRequest(`/financeiro/dda/boletos${query ? `?${query}` : ''}`, {}, 'Erro ao listar documentos DDA');
}

export function getFinanceiroDdaBoleto(id) {
  return ddaRequest(`/financeiro/dda/boletos/${id}`, {}, 'Erro ao consultar documento DDA');
}

export function getFinanceiroDdaCandidatos(id) {
  return ddaRequest(`/financeiro/dda/boletos/${id}/candidatos`, {}, 'Erro ao buscar titulos candidatos');
}

export function getFinanceiroDdaSincronizacoes(params = {}) {
  const query = buildDdaQuery(params);
  return ddaRequest(`/financeiro/dda/sincronizacoes${query ? `?${query}` : ''}`, {}, 'Erro ao consultar sincronizacoes DDA');
}

export function sincronizarFinanceiroDda(data = {}) {
  return ddaRequest('/financeiro/dda/sincronizar', {
    method: 'POST',
    body: JSON.stringify(data)
  }, 'Erro ao sincronizar DDA');
}

export function reprocessarFinanceiroDdaMatch(id) {
  return ddaRequest(`/financeiro/dda/boletos/${id}/reprocessar-match`, {
    method: 'POST',
    body: JSON.stringify({})
  }, 'Erro ao reprocessar correspondencia DDA');
}

export function vincularFinanceiroDda(id, tituloId) {
  return ddaRequest(`/financeiro/dda/boletos/${id}/vincular`, {
    method: 'POST',
    body: JSON.stringify({ titulo_id: Number(tituloId) })
  }, 'Erro ao vincular documento DDA');
}

export function confirmarFinanceiroDdaSugestao(id) {
  return ddaRequest(`/financeiro/dda/boletos/${id}/confirmar-sugestao`, {
    method: 'POST',
    body: JSON.stringify({})
  }, 'Erro ao confirmar sugestao DDA');
}

export function ignorarFinanceiroDda(id, motivo) {
  return ddaRequest(`/financeiro/dda/boletos/${id}/ignorar`, {
    method: 'POST',
    body: JSON.stringify({ motivo })
  }, 'Erro ao ignorar documento DDA');
}

/**
 * Os arquivos de uma linha do relatorio Financeiro de Obras (item 22, 23/08).
 *
 * Recebe o TITULO, e nao a solicitacao: a rota e estreita de proposito, para nao virar um caminho
 * lateral para ler anexo de qualquer solicitacao. E cobra a permissao do RELATORIO — quem le o
 * relatorio pode nao ter acesso ao modulo de solicitacoes.
 */
export async function getArquivosDoTitulo(tituloId) {
  const res = await fetch(
    `${API_URL}/financeiro/relatorios/financeiro-obras/titulos/${tituloId}/arquivos`,
    { headers: authHeaders() }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Erro ao buscar os arquivos do titulo');
  return json;
}
