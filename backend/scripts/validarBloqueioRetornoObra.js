'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  assertTituloDisponivelParaBaixa,
  ehPedidoObraParaSolicitacaoNoFinanceiro,
  tituloEstaBloqueado
} = require('../src/services/tituloBloqueioRetornoObraPolicy');

const backendRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.resolve(backendRoot, relativePath), 'utf8');

assert.equal(ehPedidoObraParaSolicitacaoNoFinanceiro({
  setor_solicitante: 'OBRA',
  setor_atual_pedido: 'FINANCEIRO'
}), true, 'OBRA pedindo retorno ao FINANCEIRO deve bloquear');
assert.equal(ehPedidoObraParaSolicitacaoNoFinanceiro({
  setor_solicitante: 'GERENCIA DE PROCESSOS',
  setor_atual_pedido: 'FINANCEIRO'
}), false, 'outros setores nao devem acionar o bloqueio da Obra');
assert.equal(ehPedidoObraParaSolicitacaoNoFinanceiro({
  setor_solicitante: 'OBRA',
  setor_atual_pedido: 'JURIDICO'
}), false, 'retorno solicitado fora do Financeiro nao deve bloquear titulos');

assert.equal(tituloEstaBloqueado({ bloqueado_retorno_obra: 1 }), true);
assert.doesNotThrow(() => assertTituloDisponivelParaBaixa({ bloqueado_retorno_obra: false }));
assert.throws(
  () => assertTituloDisponivelParaBaixa({ bloqueado_retorno_obra: true }),
  (error) => error.statusCode === 409 && error.code === 'TITULO_BLOQUEADO_RETORNO_OBRA'
);

const retornoSource = read('src/services/solicitacaoRetornoService.js');
assert(retornoSource.includes('bloquearTitulosVinculados({'), 'pedido de retorno nao gera bloqueio financeiro');
assert(retornoSource.includes('sincronizarAposEncerramentoPedido({'), 'rejeicao/cancelamento nao libera o bloqueio');

const tituloSource = read('src/services/tituloFinanceiroService.js');
assert(tituloSource.includes('assertTituloDisponivelParaBaixa(titulo);'), 'baixa manual nao consulta o bloqueio');

const paymentSource = read('src/services/paymentBatchIntegrityService.js');
assert(paymentSource.includes('assertTituloDisponivelParaBaixa(titulo);'), 'lote bancario nao consulta o bloqueio');

const modelSource = read('src/models/TituloFinanceiro.js');
assert(modelSource.includes("titulo.changed('valor_baixado')"), 'modelo nao possui defesa contra baixa por rota alternativa');

const frontendSource = read('../frontend/src/pages/FinanceiroTitulos.jsx');
assert(frontendSource.includes('Retorno solicitado pela Obra'), 'consulta financeira nao identifica titulo bloqueado');
assert(frontendSource.includes('!isTituloBloqueadoRetornoObra(titulo)'), 'consulta financeira ainda permite selecionar titulo bloqueado');

const solicitacaoControllerSource = read('src/controllers/SolicitacaoController.js');
assert(
  solicitacaoControllerSource.includes('ordenacaoRetornoPendente'),
  'lista de solicitacoes nao prioriza pedidos de retorno antes da paginacao'
);
assert(
  solicitacaoControllerSource.includes('retorno_solicitado_pendente'),
  'resumo da solicitacao nao informa o pedido de retorno pendente'
);

const retornoBarSource = read('../frontend/src/pages/SolicitacaoDetalhe/RetornoSolicitacaoBar.jsx');
const conversaSource = read('../frontend/src/pages/SolicitacaoDetalhe/Conversa.jsx');
const detalheSource = read('../frontend/src/pages/SolicitacaoDetalhe/index.jsx');
const compraEtapasSource = read('src/controllers/SolicitacaoCompraEtapasController.js');
const comentarioGeralSource = solicitacaoControllerSource.split('async adicionarComentario(req, res) {')[1]
  ?.split('async removerComentario(req, res) {')[0] || '';
assert(retornoBarSource.includes('Você pode comentar nos itens visíveis.') &&
  retornoBarSource.includes('Comentários na conversa geral, anexos, medições, aditivos e outras ações exigem o retorno'),
'aviso de retorno deve distinguir comentarios dos itens da conversa geral');
assert(detalheSource.includes('podeInteragir={podeInteragirSolicitacao}') &&
  detalheSource.includes('podeAnexar={podeInteragirSolicitacao}') &&
  conversaSource.includes('if (!podeInteragir)') &&
  comentarioGeralSource.includes('await assertPodeInteragirSolicitacao(req, solicitacao);') &&
  !comentarioGeralSource.includes('await assertPodeVisualizarSolicitacao(req, solicitacao);'),
'comentario geral deve ser bloqueado fora do setor no frontend e backend');
assert(compraEtapasSource.includes('async comentar(req, res) {\n    try {\n      const { solicitacao, compra } = await buscarContexto(req);'),
'comentarios nos itens devem continuar disponiveis em contexto de visualizacao');

const solicitacoesFrontendSource = read('../frontend/src/pages/Solicitacoes/index.jsx');
assert(
  solicitacoesFrontendSource.includes("item.retorno_solicitado_pendente || item.atencao_pendente\n              ? 'retorno'"),
  'lista de solicitacoes nao aplica o estado visual de retorno pendente'
);
assert(
  solicitacoesFrontendSource.includes("action.startsWith('RETORNO_')"),
  'eventos de retorno nao atualizam a prioridade da fila em tempo real'
);

const listaCssSource = read('../frontend/src/components/lista-avancada/lista-avancada.css');
assert(
  listaCssSource.includes('.la-linha.la-urgencia-retorno td { background: var(--sem-danger-bg); }'),
  'linha com retorno solicitado nao recebe fundo vermelho completo'
);

console.log('Validacao do bloqueio financeiro por retorno solicitado pela Obra concluida com sucesso.');
