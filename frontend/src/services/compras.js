import { API_URL, authHeaders, fileUrl } from './api';
import {
  atualizarApropriacao as atualizarApropriacaoCompartilhada,
  criarApropriacao as criarApropriacaoCompartilhada,
  deletarApropriacao as deletarApropriacaoCompartilhada,
  listarApropriacoes as listarApropriacoesCompartilhadas
} from './apropriacoes';
import { mensagemDeErro } from './erroDeResposta';

function handleJsonResponse(response, fallbackMessage) {
  return response.text().then((text) => {
    if (!response.ok) {
      let parsed = null;

      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        /* Corpo que não é JSON: quem decide o que mostrar é o
           `erroDeResposta`. Aqui o texto cru virava a mensagem. */
      }

      const error = new Error(mensagemDeErro(text, fallbackMessage, response.status));
      error.status = response.status;
      error.code = parsed?.code;
      error.details = parsed?.details;
      if (parsed?.erros) {
        error.erros = parsed.erros;
      }
      throw error;
    }

    return text ? JSON.parse(text) : null;
  });
}

async function downloadResponse(response, fallbackName, fallbackMessage) {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(mensagemDeErro(text, fallbackMessage, response.status));
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get('Content-Disposition') || '';
  const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  const filename = filenameMatch?.[1] || fallbackName;
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function buildQueryString(params = {}) {
  const search = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    search.set(key, String(value));
  });

  return search.toString();
}

export async function listarUnidades() {
  const response = await fetch(`${API_URL}/compras/unidades`, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar unidades');
}

export async function criarUnidade(data) {
  const response = await fetch(`${API_URL}/compras/unidades`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao criar unidade');
}

export async function atualizarUnidade(id, data) {
  const response = await fetch(`${API_URL}/compras/unidades/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao atualizar unidade');
}

export async function deletarUnidade(id) {
  const response = await fetch(`${API_URL}/compras/unidades/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao deletar unidade');
}

export async function listarCategorias() {
  const response = await fetch(`${API_URL}/compras/categorias`, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar categorias');
}

export async function criarCategoria(data) {
  const response = await fetch(`${API_URL}/compras/categorias`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao criar categoria');
}

export async function atualizarCategoria(id, data) {
  const response = await fetch(`${API_URL}/compras/categorias/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao atualizar categoria');
}

export async function deletarCategoria(id) {
  const response = await fetch(`${API_URL}/compras/categorias/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao deletar categoria');
}

export async function listarInsumos(params = {}, { signal } = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query
    ? `${API_URL}/compras/insumos?${query}`
    : `${API_URL}/compras/insumos`;

  const response = await fetch(url, {
    headers: authHeaders(),
    signal
  });
  return handleJsonResponse(response, 'Erro ao buscar insumos');
}

export async function criarInsumo(data) {
  const response = await fetch(`${API_URL}/compras/insumos`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao criar insumo');
}

export async function getUltimoPrecoInsumo(id) {
  const response = await fetch(`${API_URL}/compras/insumos/${id}/ultimo-preco`, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar ultimo preco do insumo');
}

export async function atualizarInsumo(id, data) {
  const response = await fetch(`${API_URL}/compras/insumos/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao atualizar insumo');
}

export async function deletarInsumo(id) {
  const response = await fetch(`${API_URL}/compras/insumos/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao deletar insumo');
}

export async function importarInsumosEmMassa(data) {
  const response = await fetch(`${API_URL}/compras/insumos/importar-massa`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao importar insumos em massa');
}

export async function listarApropriacoes(params = {}) {
  return listarApropriacoesCompartilhadas(params);
}

export async function criarApropriacao(data) {
  return criarApropriacaoCompartilhada(data);
}

export async function atualizarApropriacao(id, data) {
  return atualizarApropriacaoCompartilhada(id, data);
}

export async function deletarApropriacao(id) {
  return deletarApropriacaoCompartilhada(id);
}

export async function listarFornecedoresCompra(params = {}, { signal } = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query
    ? `${API_URL}/compras/fornecedores?${query}`
    : `${API_URL}/compras/fornecedores`;

  const response = await fetch(url, {
    headers: authHeaders(),
    signal
  });
  return handleJsonResponse(response, 'Erro ao buscar fornecedores');
}

export async function criarFornecedorCompra(data) {
  const response = await fetch(`${API_URL}/compras/fornecedores`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao criar fornecedor');
}

export async function listarSolicitacoesCompra(params = {}, { signal } = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query
    ? `${API_URL}/compras/solicitacoes?${query}`
    : `${API_URL}/compras/solicitacoes`;

  const response = await fetch(url, {
    headers: authHeaders(),
    signal
  });
  return handleJsonResponse(response, 'Erro ao buscar solicitacoes de compra');
}

export async function obterSolicitacaoCompra(id) {
  const response = await fetch(`${API_URL}/compras/solicitacoes/${id}`, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar solicitacao de compra');
}

export async function obterCompraDiretaPorSolicitacao(solicitacaoId) {
  const response = await fetch(`${API_URL}/compras/solicitacoes-diretas/por-solicitacao/${solicitacaoId}`, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar compra direta vinculada');
}

export async function obterSolicitacaoCompraPorSolicitacao(solicitacaoId) {
  const response = await fetch(`${API_URL}/compras/solicitacoes/por-solicitacao/${solicitacaoId}`, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar itens vinculados a solicitacao');
}

export async function obterEtapasCompraSolicitacao(solicitacaoId) {
  const response = await fetch(`${API_URL}/solicitacoes/${solicitacaoId}/compra-etapas`, { headers: authHeaders() });
  return handleJsonResponse(response, 'Erro ao carregar etapas da compra');
}

export async function registrarEntregaPedido(solicitacaoId, pedidoId, data) {
  const response = await fetch(`${API_URL}/solicitacoes/${solicitacaoId}/pedidos-compra/${pedidoId}/entregas`, {
    method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao atualizar acompanhamento da entrega');
}

export async function decidirItemCompraSolicitacao(solicitacaoId, tipo, itemId, data) {
  const response = await fetch(`${API_URL}/solicitacoes/${solicitacaoId}/compra-itens/${tipo}/${itemId}/decisao`, {
    method: 'PATCH', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao decidir item da compra');
}

export async function comentarEtapaCompraSolicitacao(solicitacaoId, data) {
  const response = await fetch(`${API_URL}/solicitacoes/${solicitacaoId}/compra-etapas/comentarios`, {
    method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao comentar etapa da compra');
}

export async function marcarComentariosEtapaCompraComoLidos(solicitacaoId, data) {
  const response = await fetch(`${API_URL}/solicitacoes/${solicitacaoId}/compra-etapas/comentarios/leitura`, {
    method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao registrar leitura dos comentários');
}

export async function receberItemCompraSolicitacao(solicitacaoId, pedidoId, itemId, data) {
  const response = await fetch(`${API_URL}/solicitacoes/${solicitacaoId}/pedidos-compra/${pedidoId}/itens/${itemId}/recebimentos`, {
    method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao registrar entrega do item');
}

export async function inativarSolicitacaoCompra(id) {
  const response = await fetch(`${API_URL}/compras/solicitacoes/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao inativar solicitacao de compra');
}

export async function cancelarSolicitacaoCompra(id, data = {}) {
  const response = await fetch(`${API_URL}/compras/solicitacoes/${id}/cancelar`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao cancelar solicitacao de compra');
}

export async function inativarSolicitacoesCompra(ids = []) {
  const response = await fetch(`${API_URL}/compras/solicitacoes/inativar-massa`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ solicitacao_ids: ids })
  });
  return handleJsonResponse(response, 'Erro ao inativar solicitacoes de compra');
}

export async function encaminharSolicitacaoCompraParaCompras(id) {
  const response = await fetch(`${API_URL}/compras/solicitacoes/${id}/encaminhar-compras`, {
    method: 'PATCH',
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao enviar solicitacao de compra para Compras');
}

export async function aprovarItensCompraSolicitacaoEmLote(solicitacaoId, itens) {
  const response = await fetch(`${API_URL}/solicitacoes/${solicitacaoId}/compra-itens/aprovacao-lote`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ itens })
  });
  return handleJsonResponse(response, 'Erro ao aprovar os itens selecionados');
}

export async function encaminharSolicitacoesCompraParaCompras(ids = []) {
  const response = await fetch(`${API_URL}/compras/solicitacoes/encaminhar-compras-massa`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ solicitacao_ids: ids })
  });
  return handleJsonResponse(response, 'Erro ao enviar solicitacoes de compra para Compras');
}

export async function criarSolicitacaoCompra(data) {
  const response = await fetch(`${API_URL}/compras/solicitacoes`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao criar solicitacao de compra');
}

export async function criarSolicitacaoCompraDireta(data) {
  const response = await fetch(`${API_URL}/compras/solicitacoes-diretas`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao criar compra direta');
}

export async function baixarModeloItensSolicitacaoCompra(obraId) {
  const params = new URLSearchParams();
  if (obraId) {
    params.set('obra_id', obraId);
  }
  const response = await fetch(`${API_URL}/compras/solicitacoes/modelo-itens-xlsx?${params.toString()}`, {
    headers: authHeaders()
  });
  return downloadResponse(response, 'modelo-itens-solicitacao-compra.xlsx', 'Erro ao baixar modelo de itens');
}

export async function importarItensSolicitacaoCompra(file, obraId, necessarioPara = '') {
  const formData = new FormData();
  formData.append('file', file);
  if (obraId) {
    formData.append('obra_id', obraId);
  }
  if (necessarioPara) {
    formData.append('necessario_para', necessarioPara);
  }

  const response = await fetch(`${API_URL}/compras/solicitacoes/importar-itens-xlsx`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });
  return handleJsonResponse(response, 'Erro ao importar itens da solicitacao de compra');
}

export async function listarFormasPagamentoCompraDireta() {
  const response = await fetch(`${API_URL}/compras/formas-pagamento-ativas`, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar formas de pagamento da compra direta');
}

export async function baixarModeloItensCompraDireta() {
  const response = await fetch(`${API_URL}/compras/solicitacoes-diretas/modelo-itens-xlsx`, {
    headers: authHeaders()
  });
  return downloadResponse(response, 'modelo-itens-compra-direta.xlsx', 'Erro ao baixar modelo de itens');
}

export async function importarItensCompraDireta(file, obraId) {
  const formData = new FormData();
  formData.append('file', file);
  if (obraId) {
    formData.append('obra_id', obraId);
  }

  const response = await fetch(`${API_URL}/compras/solicitacoes-diretas/importar-itens-xlsx`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });
  return handleJsonResponse(response, 'Erro ao importar itens da compra direta');
}

export async function delegarSolicitacaoCompra(id, data = {}) {
  const response = await fetch(`${API_URL}/compras/solicitacoes/${id}/delegar`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao delegar solicitacao de compra');
}

export async function listarUsuariosDelegacaoCompras() {
  const response = await fetch(`${API_URL}/compras/delegacao/usuarios`, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao carregar usuarios para delegacao de compras');
}

export async function comentarSolicitacaoCompra(id, data = {}) {
  const response = await fetch(`${API_URL}/compras/solicitacoes/${id}/comentarios`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao registrar comentario na cotacao');
}

export async function recusarSolicitacaoCompra(id, data = {}) {
  const response = await fetch(`${API_URL}/compras/solicitacoes/${id}/recusar`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao recusar solicitacao de compra');
}

export async function enviarSolicitacaoCompraParaFornecedores(id, data) {
  const response = await fetch(`${API_URL}/compras/solicitacoes/${id}/enviar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao enviar cotacao para fornecedores');
}

export async function cancelarCotacaoSolicitacaoCompra(id, data) {
  const response = await fetch(`${API_URL}/compras/solicitacoes/${id}/cotacao/cancelar`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao cancelar cotacao');
}

export async function salvarRespostaInternaCotacao(solicitacaoId, cotacaoId, data) {
  const response = await fetch(
    `${API_URL}/compras/solicitacoes/${solicitacaoId}/cotacoes/${cotacaoId}/resposta-interna`,
    {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    }
  );
  return handleJsonResponse(response, 'Erro ao editar resposta da cotacao');
}

export async function uploadArquivosRespostaInternaCotacao(solicitacaoId, cotacaoId, files) {
  const formData = new FormData();
  Array.from(files || []).forEach((file) => formData.append('files', file));
  const response = await fetch(
    `${API_URL}/compras/solicitacoes/${solicitacaoId}/cotacoes/${cotacaoId}/arquivos-resposta`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: formData
    }
  );
  return handleJsonResponse(response, 'Erro ao anexar arquivos na resposta da cotacao');
}

export async function obterComparativoSolicitacaoCompra(id) {
  const response = await fetch(`${API_URL}/compras/solicitacoes/${id}/comparativo`, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar comparativo da solicitacao');
}

export async function obterWorkspaceCotacaoSolicitacaoCompra(id, { signal } = {}) {
  const response = await fetch(`${API_URL}/compras/solicitacoes/${id}/workspace-cotacao`, {
    headers: authHeaders(),
    signal
  });
  return handleJsonResponse(response, 'Erro ao carregar workspace da cotacao');
}

export async function encerrarSolicitacaoCompra(id, data, { idempotencyKey = null } = {}) {
  const response = await fetch(`${API_URL}/compras/solicitacoes/${id}/encerrar`, {
    method: 'PATCH',
    headers: authHeaders({
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
    }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao encerrar solicitacao de compra');
}

export async function encerrarSolicitacaoCompraSemPedido(id, data, { idempotencyKey = null } = {}) {
  const response = await fetch(`${API_URL}/compras/solicitacoes/${id}/encerrar-sem-pedido`, {
    method: 'PATCH',
    headers: authHeaders({
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
    }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao encerrar cotacao sem gerar pedido');
}

export async function listarPedidosCompra(params = {}, { signal } = {}) {
  const query = buildQueryString(params);
  const url = query
    ? `${API_URL}/compras/pedidos?${query}`
    : `${API_URL}/compras/pedidos`;

  const response = await fetch(url, {
    headers: authHeaders(),
    signal
  });
  return handleJsonResponse(response, 'Erro ao buscar pedidos de compra');
}

export async function obterPedidoCompra(id) {
  const response = await fetch(`${API_URL}/compras/pedidos/${id}`, {
    cache: 'no-store',
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar pedido de compra');
}

export async function listarAuditoriaItensPedidoCompra(params = {}) {
  const query = buildQueryString(params);
  const url = query
    ? `${API_URL}/compras/relatorios/auditoria-itens-pedido?${query}`
    : `${API_URL}/compras/relatorios/auditoria-itens-pedido`;

  const response = await fetch(url, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar auditoria dos itens do pedido');
}

export async function obterRelatorioFornecedoresCompras(params = {}) {
  const query = buildQueryString(params);
  const url = query
    ? `${API_URL}/compras/relatorios/fornecedores?${query}`
    : `${API_URL}/compras/relatorios/fornecedores`;

  const response = await fetch(url, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar relatorio de fornecedores de compras');
}

export async function obterRelatorioEconomiaCotacoes(params = {}) {
  const query = buildQueryString(params);
  const url = query
    ? `${API_URL}/compras/relatorios/economia-cotacoes?${query}`
    : `${API_URL}/compras/relatorios/economia-cotacoes`;

  const response = await fetch(url, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar relatorio de economia em cotacoes');
}

export async function obterRelatorioCicloCompras(params = {}) {
  const query = buildQueryString(params);
  const url = query
    ? `${API_URL}/compras/relatorios/ciclo?${query}`
    : `${API_URL}/compras/relatorios/ciclo`;

  const response = await fetch(url, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar relatorio de ciclo de compras');
}

export async function obterRelatorioDemandaPedidosCompras(params = {}) {
  const query = buildQueryString(params);
  const url = query
    ? `${API_URL}/compras/relatorios/demanda-pedidos?${query}`
    : `${API_URL}/compras/relatorios/demanda-pedidos`;

  const response = await fetch(url, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar relatorio de demanda e pedidos de compras');
}

export async function obterRelatorioCategoriasInsumosCompras(params = {}) {
  const query = buildQueryString(params);
  const url = query
    ? `${API_URL}/compras/relatorios/categorias-insumos?${query}`
    : `${API_URL}/compras/relatorios/categorias-insumos`;

  const response = await fetch(url, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar relatorio de compras por categoria e insumo');
}

export async function obterRelatorioComprasPorFornecedor(params = {}) {
  const query = buildQueryString(params);
  const url = query
    ? `${API_URL}/compras/relatorios/compras-fornecedor?${query}`
    : `${API_URL}/compras/relatorios/compras-fornecedor`;

  const response = await fetch(url, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar relatorio de compras por fornecedor');
}

export async function obterRelatorioComprasDiretas(params = {}) {
  const query = buildQueryString(params);
  const url = query
    ? `${API_URL}/compras/relatorios/compras-diretas?${query}`
    : `${API_URL}/compras/relatorios/compras-diretas`;

  const response = await fetch(url, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar relatorio de compras diretas');
}

export async function obterRelatorioPrecosInsumosFornecedores(params = {}) {
  const query = buildQueryString(params);
  const url = query
    ? `${API_URL}/compras/relatorios/precos-insumos?${query}`
    : `${API_URL}/compras/relatorios/precos-insumos`;

  const response = await fetch(url, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar relatorio de precos por insumo e fornecedor');
}

export async function obterRelatorioEvolucaoCompras(params = {}) {
  const query = buildQueryString(params);
  const url = query
    ? `${API_URL}/compras/relatorios/evolucao?${query}`
    : `${API_URL}/compras/relatorios/evolucao`;

  const response = await fetch(url, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar relatorio de evolucao mensal de compras');
}

export async function obterRelatorioPendenciasCotacoesCompras(params = {}) {
  const query = buildQueryString(params);
  const url = query
    ? `${API_URL}/compras/relatorios/pendencias-cotacoes?${query}`
    : `${API_URL}/compras/relatorios/pendencias-cotacoes`;

  const response = await fetch(url, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar relatorio de pendencias de cotacoes');
}

export async function atualizarStatusPedidoCompra(id, data) {
  const response = await fetch(`${API_URL}/compras/pedidos/${id}/status`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao atualizar status do pedido');
}

export async function reabrirPedidoCompraParaCotacao(id, data) {
  const response = await fetch(`${API_URL}/compras/pedidos/${id}/reabrir-cotacao`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao reabrir pedido para cotacao');
}

function pedidoFinanceiroIdempotencyKey(prefix, pedidoId) {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${pedidoId}:${random}`;
}

export async function adotarFinanceiroPedidoCompra(id) {
  const response = await fetch(`${API_URL}/compras/pedidos/${id}/financeiro/adotar-legado`, {
    method: 'POST',
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao iniciar a gestao financeira do pedido');
}

export async function criarPrevisoesPedidoCompra(id, data) {
  const response = await fetch(`${API_URL}/compras/pedidos/${id}/financeiro/previsoes`, {
    method: 'POST',
    headers: authHeaders({
      'Content-Type': 'application/json',
      'Idempotency-Key': pedidoFinanceiroIdempotencyKey('previsao', id)
    }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao criar as previsoes do pedido');
}

export async function reparcelarPrevisoesPedidoCompra(id, data) {
  const response = await fetch(`${API_URL}/compras/pedidos/${id}/financeiro/previsoes/reparcelar`, {
    method: 'POST',
    headers: authHeaders({
      'Content-Type': 'application/json',
      'Idempotency-Key': pedidoFinanceiroIdempotencyKey('reparcelamento', id)
    }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao alterar as parcelas das previsoes do pedido');
}

export async function liberarTitulosPedidoCompra(id, data) {
  const response = await fetch(`${API_URL}/compras/pedidos/${id}/financeiro/liberar`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao liberar os titulos do pedido');
}

export async function solicitarReaberturaPedidoCompra(id, data) {
  const response = await fetch(`${API_URL}/compras/pedidos/${id}/reaberturas`, {
    method: 'POST',
    headers: authHeaders({
      'Content-Type': 'application/json',
      'Idempotency-Key': pedidoFinanceiroIdempotencyKey('reabertura', id)
    }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao solicitar a reabertura do pedido');
}

export async function decidirReaberturaPedidoCompra(id, reaberturaId, data) {
  const response = await fetch(`${API_URL}/compras/pedidos/${id}/reaberturas/${reaberturaId}/decisao`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao decidir a reabertura do pedido');
}

export async function atualizarStatusPedidosCompraEmLote(data) {
  const response = await fetch(`${API_URL}/compras/pedidos/status-lote`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao atualizar pedidos em lote');
}

export async function atualizarQuantidadeItemSolicitacaoCompra(id, itemId, data) {
  const response = await fetch(`${API_URL}/compras/solicitacoes/${id}/itens/${itemId}/quantidade`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao atualizar quantidade do item da solicitacao de compra');
}

export async function cadastrarUnidadeItemSolicitacaoCompra(id, itemId) {
  const response = await fetch(`${API_URL}/compras/solicitacoes/${id}/itens/${itemId}/cadastrar-unidade`, {
    method: 'POST',
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao cadastrar a unidade informada no item');
}

export async function atualizarApropriacoesItemSolicitacaoCompra(id, itemId, data) {
  const response = await fetch(`${API_URL}/compras/solicitacoes/${id}/itens/${itemId}/apropriacoes`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao atualizar apropriacoes do item da solicitacao de compra');
}

export async function catalogarItemManualSolicitacaoCompra(id, itemId, data) {
  const response = await fetch(`${API_URL}/compras/solicitacoes/${id}/itens-manuais/${itemId}/catalogar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao catalogar item manual');
}

export async function cancelarPedidoCompra(id, data = {}) {
  const response = await fetch(`${API_URL}/compras/pedidos/${id}/cancelar`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao cancelar pedido de compra');
}

export async function cancelarItensPedidoCompra(id, data = {}) {
  const response = await fetch(`${API_URL}/compras/pedidos/${id}/itens-cancelar`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao cancelar itens do pedido');
}

export async function remanejarItemPedidoCompra(id, itemId, data = {}) {
  const response = await fetch(`${API_URL}/compras/pedidos/${id}/itens/${itemId}/remanejar`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao remanejar item do pedido');
}

export async function comentarPedidoCompra(id, data = {}) {
  const response = await fetch(`${API_URL}/compras/pedidos/${id}/comentarios`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao registrar comentario no pedido');
}

export async function anexarEspelhoPedidoCompra(id, data = {}) {
  const response = await fetch(`${API_URL}/compras/pedidos/${id}/espelho`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao anexar espelho do fornecedor');
}

export async function registrarFretePedidoCompra(id, data = {}) {
  const idempotencyKey = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const response = await fetch(`${API_URL}/compras/pedidos/${id}/fretes`, {
    method: 'POST',
    headers: authHeaders({
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao registrar frete do pedido');
}

export async function atualizarFretePedidoCompra(id, freteId, data = {}) {
  const response = await fetch(`${API_URL}/compras/pedidos/${id}/fretes/${freteId}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao atualizar frete do pedido');
}

export async function cancelarFretePedidoCompra(id, freteId, data = {}) {
  const response = await fetch(`${API_URL}/compras/pedidos/${id}/fretes/${freteId}/cancelar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao cancelar frete do pedido');
}

export async function criarPedidoCompraDaSolicitacao(id, data) {
  const response = await fetch(`${API_URL}/compras/solicitacoes/${id}/pedidos`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao criar pedido de compra');
}

export async function adicionarItemPedidoCompra(id, data) {
  const response = await fetch(`${API_URL}/compras/pedidos/${id}/itens`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao adicionar item ao pedido');
}

export async function atualizarItemPedidoCompra(id, itemId, data) {
  const response = await fetch(`${API_URL}/compras/pedidos/${id}/itens/${itemId}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao atualizar item do pedido');
}

export async function removerItemPedidoCompra(id, itemId) {
  const response = await fetch(`${API_URL}/compras/pedidos/${id}/itens/${itemId}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao remover item do pedido');
}

export async function baixarPdfPedidoCompra(id) {
  const response = await fetch(`${API_URL}/compras/pedidos/${id}/pdf`, {
    headers: authHeaders()
  });

  if (!response.ok) {
    throw new Error('Erro ao gerar PDF do pedido');
  }

  return response.blob();
}

export async function uploadAnexoTemporarioCompra(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}/compras/anexos-temporarios`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });

  return handleJsonResponse(response, 'Erro ao enviar arquivo do item');
}

export async function obterUrlAssinadaCompra(caminhoArquivo) {
  if (!caminhoArquivo) {
    return null;
  }

  if (!String(caminhoArquivo).startsWith('http')) {
    return fileUrl(caminhoArquivo);
  }

  const response = await fetch(
    `${API_URL}/anexos/presign?url=${encodeURIComponent(caminhoArquivo)}`,
    { headers: authHeaders() }
  );

  return handleJsonResponse(response, 'Erro ao obter link do arquivo').then((data) => data?.url || caminhoArquivo);
}

export async function baixarPdfSolicitacaoCompra(id) {
  const response = await fetch(`${API_URL}/compras/solicitacoes/${id}/pdf`, {
    headers: authHeaders()
  });

  if (!response.ok) {
    throw new Error('Erro ao gerar PDF');
  }

  return response.blob();
}

export async function listarCotacoes(params = {}, { signal } = {}) {
  const query = buildQueryString(params);
  const url = query ? `${API_URL}/compras/cotacoes?${query}` : `${API_URL}/compras/cotacoes`;
  const response = await fetch(url, { headers: authHeaders(), signal });
  return handleJsonResponse(response, 'Erro ao buscar cotacoes');
}

export async function obterCotacaoPublica(token) {
  const response = await fetch(`${API_URL}/cotacoes/${token}`);
  return handleJsonResponse(response, 'Erro ao buscar cotacao');
}

export async function responderCotacaoPublica(token, data) {
  const response = await fetch(`${API_URL}/cotacoes/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao enviar resposta da cotacao');
}

export async function salvarRascunhoCotacaoPublica(token, data) {
  const response = await fetch(`${API_URL}/cotacoes/${token}/rascunho`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao salvar rascunho da cotacao');
}

export async function reabrirCotacaoCompra(id, data = {}) {
  const response = await fetch(`${API_URL}/compras/cotacoes/${id}/reabrir`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao reabrir cotacao');
}

export async function uploadArquivosCotacaoPublica(token, files) {
  const formData = new FormData();
  formData.append('token', token);
  Array.from(files || []).forEach((file) => formData.append('files', file));

  const response = await fetch(`${API_URL}/cotacoes/upload`, {
    method: 'POST',
    body: formData
  });
  return handleJsonResponse(response, 'Erro ao enviar arquivo da cotacao');
}

export async function uploadPlanilhaCotacaoPublica(token, file) {
  return uploadArquivosCotacaoPublica(token, file ? [file] : []);
}

export function obterUrlPdfCotacaoPublica(token) {
  return `${API_URL}/cotacoes/${encodeURIComponent(token)}/pdf`;
}

export async function baixarModeloCotacaoPublica(token) {
  const response = await fetch(`${API_URL}/cotacoes/${token}/modelo`);
  if (!response.ok) {
    throw new Error('Erro ao baixar modelo da cotacao');
  }
  return response.blob();
}

export async function baixarModeloCotacaoPublicaXlsx(token) {
  const response = await fetch(`${API_URL}/cotacoes/${token}/modelo-xlsx`);
  if (!response.ok) {
    throw new Error('Erro ao baixar modelo Excel da cotacao');
  }
  return response.blob();
}

export async function obterConfigCotacoes() {
  const response = await fetch(`${API_URL}/configuracoes/cotacoes`, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar configuracoes de cotacoes');
}

export async function salvarConfigCotacoes(data) {
  const response = await fetch(`${API_URL}/configuracoes/cotacoes`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao salvar configuracoes de cotacoes');
}

export async function obterFornecedorCompra(id) {
  const response = await fetch(`${API_URL}/compras/fornecedores/${id}`, {
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao buscar fornecedor');
}

export async function atualizarFornecedorCompra(id, data) {
  const response = await fetch(`${API_URL}/compras/fornecedores/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return handleJsonResponse(response, 'Erro ao atualizar fornecedor');
}

export async function desativarFornecedorCompra(id) {
  const response = await fetch(`${API_URL}/compras/fornecedores/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return handleJsonResponse(response, 'Erro ao desativar fornecedor');
}
