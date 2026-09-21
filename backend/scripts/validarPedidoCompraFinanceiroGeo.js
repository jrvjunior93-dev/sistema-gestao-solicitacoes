const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  STATUS_FLUXO,
  derivarStatusFinanceiro
} = require('../src/services/pedidoCompraFinanceiroService');
const {
  validateCompraPedidoPrevisoesBody
} = require('../src/validators/operationalValidators');

function titulo(status) {
  return { titulo: { id: Math.random(), status } };
}

assert.strictEqual(
  derivarStatusFinanceiro({ status: 'FECHADO_FORNECEDOR', financeiro_fluxo_versao: null }, []),
  STATUS_FLUXO.LEGADO_PENDENTE_REVISAO,
  'Pedido fechado legado precisa aguardar revisao explicita.'
);
assert.strictEqual(
  derivarStatusFinanceiro({ status: 'FECHADO_FORNECEDOR', financeiro_fluxo_versao: 1 }, [titulo('PREVISAO')]),
  STATUS_FLUXO.PREVISAO_CRIADA,
  'Previsao nao pode ser tratada como titulo liberado.'
);
assert.strictEqual(
  derivarStatusFinanceiro({ status: 'FECHADO_FORNECEDOR', financeiro_fluxo_versao: 1 }, [titulo('PREVISAO'), titulo('ABERTO')]),
  STATUS_FLUXO.PARCIALMENTE_LIBERADO,
  'Mistura de previsao e titulo aberto precisa permanecer parcial.'
);
assert.strictEqual(
  derivarStatusFinanceiro({ status: 'FECHADO_FORNECEDOR', financeiro_fluxo_versao: 1 }, [titulo('QUITADO')]),
  STATUS_FLUXO.CONCLUIDO,
  'Todos os titulos quitados encerram o financeiro do pedido.'
);

const migration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '202609070050_pedido_compra_gestao_financeira_geo.js'),
  'utf8'
);
const service = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'services', 'pedidoCompraFinanceiroService.js'),
  'utf8'
);
const routes = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'routes.js'),
  'utf8'
);
const component = fs.readFileSync(
  path.join(__dirname, '..', '..', 'frontend', 'src', 'modules', 'solicitacao-compra', 'components', 'PedidoCompraFinanceiro.jsx'),
  'utf8'
);
const fila = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'services', 'pagamentoManualFilaService.js'),
  'utf8'
);
const statusSolicitacao = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'services', 'solicitacaoFinanceiroStatusService.js'),
  'utf8'
);
const medicao = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'services', 'medicaoContratoService.js'),
  'utf8'
);
const configCategorias = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'services', 'pedidoCompraTituloConfigService.js'),
  'utf8'
);
const validatorsSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'validators', 'operationalValidators.js'),
  'utf8'
);
assert(!/\b(?:bulkInsert|bulkUpdate|INSERT\s+INTO|UPDATE\s+pedido_compras)\b/i.test(migration), 'A migration nao pode escrever dados funcionais.');
assert(migration.includes("createTable('pedido_compra_titulos'"), 'A migration precisa criar o vinculo explicito entre pedido e titulo.');
assert(migration.includes("createTable('pedido_compra_reaberturas'"), 'A migration precisa preservar as decisoes de reabertura.');
assert(service.includes('async function reparcelarPrevisoesPedido'), 'O servico precisa permitir reparticionar previsoes ainda nao liberadas.');
assert(service.includes("acao: 'PEDIDO_COMPRA_PREVISOES_REPARCELADAS'"), 'O reparticionamento precisa gerar historico auditavel.');
assert(service.includes("normalize(item.titulo?.status) !== 'PREVISAO'"), 'O backend precisa impedir alteracao depois da liberacao financeira.');
assert(routes.includes("/compras/pedidos/:id/financeiro/previsoes/reparcelar"), 'A rota protegida de reparticionamento precisa estar registrada.');
assert(service.includes("status: 'ABERTO'"), 'Compras precisa criar o titulo ja aberto para a autorizacao posterior no Contas a Pagar.');
assert(service.includes('validarCategoriaTituloPedido'), 'A categoria escolhida por Compras precisa respeitar a configuracao administrativa.');
assert(configCategorias.includes('categoria_padrao_id'), 'A configuracao precisa definir a categoria padrao do titulo do pedido.');
assert(fila.includes('encaminharSolicitacaoParaFinanceiroAoEnfileirar'), 'Somente a entrada na fila deve assumir a solicitacao no Financeiro.');
assert(statusSolicitacao.includes('devolverAoSetorObraAposBaixa'), 'A baixa precisa devolver a solicitacao para Obra.');
assert(!medicao.includes("solicitacao.update({ area_responsavel: SETOR_FINANCEIRO }"), 'A aprovacao da medicao nao pode antecipar o envio ao Financeiro.');
assert(component.includes('Adicionar parcela'), 'A tela precisa permitir adicionar parcelas na criacao dos titulos.');
assert(component.includes('Editar parcelas'), 'A tela precisa permitir editar previsoes ainda nao liberadas.');
assert(component.includes('Forma de comprovação da compra'), 'A tela precisa identificar a evidencia opcional pelo objetivo da compra.');
assert(!component.includes('Registrar confirmação'), 'A comprovacao nao pode ter uma acao separada da criacao dos titulos.');
assert(component.indexOf('Forma de comprovação da compra') < component.lastIndexOf("'Criar títulos'"), 'Criar titulos precisa ser a acao final depois da comprovacao opcional.');
assert(service.includes('payload?.comprovacao'), 'A mesma transacao dos titulos precisa aceitar a comprovacao opcional.');
assert(validatorsSource.includes("'parcelas', 'comprovacao'"), 'O contrato da criacao precisa aceitar a comprovacao opcional.');
assert(!service.includes('antes de liberar o pagamento'), 'A comprovacao da compra nao pode bloquear a liberacao dos titulos.');

const payloadSemComprovacao = validateCompraPedidoPrevisoesBody({
  categoria_financeira_id: 1,
  parcelas: [{ valor: 100, data_vencimento: '2026-09-21' }]
});
assert.strictEqual(payloadSemComprovacao.comprovacao, null, 'Criar titulos sem comprovacao precisa continuar valido.');
const payloadComComprovacao = validateCompraPedidoPrevisoesBody({
  categoria_financeira_id: 1,
  parcelas: [{ valor: 100, data_vencimento: '2026-09-21' }],
  comprovacao: { tipo: 'NOTA_FISCAL', numero_documento: 'NF-123' }
});
assert.strictEqual(payloadComComprovacao.comprovacao.numero_documento, 'NF-123', 'A comprovacao opcional precisa viajar no mesmo payload dos titulos.');

console.log('Fluxo Compras -> GEO autoriza -> fila Financeiro -> baixa Obra validado com sucesso.');
