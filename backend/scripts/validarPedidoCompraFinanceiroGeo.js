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
assert(component.includes('Quantidade de parcelas'), 'A tela precisa permitir definir a quantidade de parcelas na criacao dos titulos.');
assert(component.includes('gerarParcelas'), 'A tela precisa distribuir automaticamente valores e vencimentos das parcelas.');
assert(component.includes('Pagamento do frete'), 'Frete de terceiro precisa receber configuracao e titulo separados.');
assert(component.includes('Favorecido'), 'Compra e frete precisam identificar quem recebera o pagamento.');
assert(component.includes('Chave PIX'), 'Pagamento PIX precisa solicitar a chave negociada.');
assert(component.includes('Boletos'), 'Pagamento por boleto precisa aceitar mais de um arquivo.');
assert(component.includes('Editar parcelas'), 'A tela precisa permitir editar previsoes ainda nao liberadas.');
assert(component.includes('Forma de comprovação da compra'), 'A tela precisa identificar a evidencia opcional pelo objetivo da compra.');
assert(!component.includes('Registrar confirmação'), 'A comprovacao nao pode ter uma acao separada da criacao dos titulos.');
assert(component.indexOf('Forma de comprovação da compra') < component.lastIndexOf("'Criar títulos'"), 'Criar titulos precisa ser a acao final depois da comprovacao opcional.');
assert(service.includes('payload?.comprovacao'), 'A mesma transacao dos titulos precisa aceitar a comprovacao opcional.');
assert(validatorsSource.includes("'boletos', 'fretes'"), 'O contrato da criacao precisa aceitar boletos e fretes separados.');
assert(!service.includes('antes de liberar o pagamento'), 'A comprovacao da compra nao pode bloquear a liberacao dos titulos.');

const payloadSemComprovacao = validateCompraPedidoPrevisoesBody({
  categoria_financeira_id: 1,
  forma_pagamento_id: 2,
  favorecido_pagamento_id: 3,
  parcelas: [{ valor: 100, data_vencimento: '2026-09-21' }]
});
assert.strictEqual(payloadSemComprovacao.comprovacao, null, 'Criar titulos sem comprovacao precisa continuar valido.');
const payloadComComprovacao = validateCompraPedidoPrevisoesBody({
  categoria_financeira_id: 1,
  forma_pagamento_id: 2,
  favorecido_pagamento_id: 3,
  parcelas: [{ valor: 100, data_vencimento: '2026-09-21' }],
  comprovacao: { tipo: 'NOTA_FISCAL', numero_documento: 'NF-123' }
});
assert.strictEqual(payloadComComprovacao.comprovacao.numero_documento, 'NF-123', 'A comprovacao opcional precisa viajar no mesmo payload dos titulos.');

const payloadComFrete = validateCompraPedidoPrevisoesBody({
  categoria_financeira_id: 1,
  forma_pagamento_id: 2,
  favorecido_pagamento_id: 3,
  chave_pix: 'compras@empresa.com.br',
  parcelas: [
    { valor: 50, data_vencimento: '2026-09-21' },
    { valor: 50, data_vencimento: '2026-10-21' }
  ],
  fretes: [{
    frete_id: 8,
    forma_pagamento_id: 4,
    favorecido_pagamento_id: 9,
    boletos: [{ arquivo_url: 'https://arquivos/boleto.pdf', arquivo_nome: 'boleto.pdf' }],
    parcelas: [{ valor: 25, data_vencimento: '2026-09-25' }]
  }]
});
assert.strictEqual(payloadComFrete.fretes[0].frete_id, 8, 'O frete precisa viajar identificado no mesmo payload atomico.');
assert.strictEqual(payloadComFrete.fretes[0].boletos.length, 1, 'Os boletos do frete precisam ser preservados pelo contrato HTTP.');

console.log('Fluxo Compras -> GEO autoriza -> fila Financeiro -> baixa Obra validado com sucesso.');
