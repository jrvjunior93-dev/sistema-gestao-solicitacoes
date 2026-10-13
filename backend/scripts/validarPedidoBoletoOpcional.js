'use strict';

// Servico real com dependencias em memoria: nao carrega modelos/banco nem envia arquivos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validateCompraPedidoPrevisoesBody } = require('../src/validators/operationalValidators');

const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const formas = [{ id: 1, nome: 'Boleto', gera_boleto: true }, { id: 2, nome: 'Pix' }, { id: 3, nome: 'Transferencia' },
  { id: 4, nome: 'Cartao credito', exige_cartao: true, gera_fatura: true },
  { id: 5, nome: 'Cartao debito', tipo: 'CARTAO_DEBITO', exige_cartao: true }];
const cartoes=[{id:10,nome:'Credito QA',tipo:'CREDITO',ativo:true}, {id:20,nome:'Debito QA',tipo:'DEBITO',ativo:true},
  {id:30,nome:'Inativo QA',tipo:'CREDITO',ativo:false}];
const tituloPayloads = [], vinculos = [], documentos = [], anexos = [], historicos = [];
const pedido = { id: 10, financeiro_fluxo_versao: 1, status: 'FECHADO_FORNECEDOR',
  obra_id: 7, valor_total_fornecedor: 100, fornecedor: { parceiro_id: 20, nome: 'Fornecedor' },
  solicitacao: { solicitacao_principal_id: 30 }, update: async () => {} };
const frete = { id: 8, parceiro_id: 21, valor_total: 25 };
const modelos = {
  CartaoFinanceiro: { findByPk: async (id, options) => {
    assert.equal(options.transaction,transaction);assert.equal(options.lock,transaction.LOCK.UPDATE);
    return cartoes.find(c=>c.id===id);
  }, findAll: async options => {
    assert.equal(options.where.ativo,true);
    assert.deepEqual(Array.from(options.attributes),['id','nome','tipo','ultimos_digitos']);
    return cartoes.filter(c=>c.ativo).map(({id,nome,tipo})=>({id,nome,tipo}));
  } },
  PedidoCompraReabertura: { findOne: async()=>null },
  Parceiro: { findOne: async ({ where }) => where.id > 0 ? { id: where.id, nome: 'Favorecido' } : null },
  PedidoCompra: { findByPk: async (_id, options) => {
    assert.equal(options.lock, transaction.LOCK.UPDATE); return pedido;
  } },
  PedidoCompraTitulo: {
    findOne: async ({ where }) => vinculos.find((v) => v.idempotency_key === where.idempotency_key),
    create: async (data, options) => { assert.equal(options.transaction, transaction); vinculos.push(data); }
  },
  PedidoCompraFrete: { findAll: async () => [frete] },
  PedidoCompraDocumentoFinanceiro: { findAll:async()=>[], findOrCreate: async ({ defaults, transaction: tx }) => {
    assert.equal(tx, transaction); documentos.push(defaults); return [defaults];
  } },
  Anexo: { findOrCreate: async ({ defaults, transaction: tx }) => {
    assert.equal(tx, transaction); anexos.push(defaults); return [defaults];
  } },
  Historico: { create: async (data) => historicos.push(data) }
};
const sandbox = { module: { exports: {} }, require(id) {
  if (id === 'sequelize') return { Op: {} };
  if (id === '../models') return modelos;
  if (id === './tituloFinanceiroService') return { criarTituloManual: async (_req, data, options) => {
    assert.equal(options.transaction, transaction);
    tituloPayloads.push(data);
    return { titulos: [{ id: tituloPayloads.length, valor_original: data.valor, data_vencimento: data.data_vencimento }] };
  } };
  if (id === './notificacoes') return {};
  if (id === './pedidoCompraTituloConfigService') return { validarCategoriaTituloPedido: async (id) => id,
    obterConfiguracaoCategoriasTituloPedido:async()=>({categorias:[],configurada:true}) };
  if (id === './formasPagamentoMedicaoService') return { listarFormasDosFluxos: async () => ({ formas }) };
  throw new Error(`Dependencia nao simulada: ${id}`);
} };
const arquivo = path.join(__dirname, '../src/services/pedidoCompraFinanceiroService.js');
vm.runInNewContext(fs.readFileSync(arquivo, 'utf8') + `
  // Apenas consultas de projecao sao substituidas na fixture.
  buscarTitulosPedido = async () => [];
  module.exports.qaResumo = obterResumoFinanceiroPedido;
  obterResumoFinanceiroPedido = async () => ({ ok: true });
  module.exports.qaPagamento = validarPagamentoNegociado;
`, sandbox, { filename: arquivo });
const service = sandbox.module.exports;
const base = { categoria_financeira_id: 1, forma_pagamento_id: 1, favorecido_pagamento_id: 20,
  parcelas: [{ valor: 100, data_vencimento: '2026-10-20' }],
  fretes: [{ frete_id: 8, forma_pagamento_id: 1, favorecido_pagamento_id: 21,
    parcelas: [{ valor: 25, data_vencimento: '2026-10-21' }] }] };

async function validarCuradoriaEFaturasReais() {
  const formasModule={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/services/formasPagamentoMedicaoService.js'),'utf8'),{
    module:formasModule,require(id){
      assert.equal(id,'../models');return {
        ConfiguracaoSistema:{findOne:async()=>({valor:JSON.stringify({formas:[4,5]})})},
        FormaPagamentoFinanceira:{findAll:async options=>{
          assert.equal(options.where.ativo,true);assert(options.attributes.includes('gera_fatura'));return formas;
        }}};
    }
  });
  const curadas=await formasModule.exports.listarFormasDosFluxos();
  assert.deepEqual(Array.from(curadas.formas,f=>f.id),[4,5]);
  assert.equal(curadas.formas[0].gera_fatura,true);assert.equal(curadas.formas[1].gera_fatura,false);

  // Obter/vincular/recalcular faturas reais, somente as fronteiras ORM em memoria.
  const faturas=[],titulos=[];
  const faturaModel={exports:{}};
  const modeloFatura={
    CartaoFinanceiro:{findByPk:async()=>({id:10,tipo:'CREDITO',ativo:true,dia_fechamento:10,dia_vencimento:20})},
    FaturaCartaoFinanceiro:{findOrCreate:async({where,defaults,transaction:tx})=>{
      assert.equal(tx,transaction);let f=faturas.find(f=>f.competencia===where.competencia);
      if(!f){f={id:faturas.length+1,...where,...defaults};faturas.push(f);}return[f];
    },update:async(data,{where})=>Object.assign(faturas.find(f=>f.id===where.id),data)},
    FaturaCartaoTitulo:{findOrCreate:async()=>[]},
    TituloFinanceiro:{findAll:async({where})=>titulos.filter(t=>t.fatura_cartao_id===where.fatura_cartao_id)},
    MovimentoFinanceiro:{findAll:async()=>[]}
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/services/faturaCartaoFinanceiroService.js'),'utf8'),{
    module:faturaModel,require(id){
      if(id==='../models')return modeloFatura;
      if(id==='../constants/intercompany')return require('../src/constants/intercompany');
      return {};
    }
  });
  for(const offset of[0,1]){
    const {fatura}=await faturaModel.exports.obterOuCriarFaturaCartao({cartaoId:10,dataCompra:'2026-10-12',parcelaOffset:offset,transaction});
    const titulo={id:offset+1,valor_original:50,async update(data){Object.assign(this,data);}};titulos.push(titulo);
    await faturaModel.exports.vincularTituloAFatura({titulo,fatura,transaction});
    assert.equal(titulo.data_vencimento,offset?'2026-12-20':'2026-11-20');
    assert.equal(titulo.cartao_id,10);assert.equal(fatura.valor_total,50);
  }
  assert.equal(faturas.length,2);assert.equal(faturas.reduce((s,f)=>s+f.valor_total,0),100);
}

(async () => {
  await validarCuradoriaEFaturasReais();
  const resumo=await service.qaResumo(pedido,{incluirDetalhes:true,transaction});
  assert.deepEqual(Array.from(resumo.opcoes.cartoes,c=>c.id),[10,20]);
  assert(!('conta_bancaria_id' in resumo.opcoes.cartoes[0]),'Somente identificacao operacional, nao cadastro financeiro');
  const resumoLeve=await service.qaResumo(pedido,{incluirDetalhes:false,transaction});
  assert(!resumoLeve.opcoes,'Lista/resumo leve nao carrega novos instrumentos');
  const criar = async (payload, chave) => service.criarPrevisoesPedido({ req: { user: { id: 4 } },
    pedidoId: 10, payload: validateCompraPedidoPrevisoesBody(payload), idempotencyKey: chave, transaction });
  await criar(base, 'sem-boleto');
  assert.equal(tituloPayloads.length, 2, 'Compra e frete geram titulos mesmo sem boleto');
  assert.equal(tituloPayloads[0].valor, 100);
  assert.equal(tituloPayloads[1].valor, 25);
  assert.ok(tituloPayloads.every((t) => t.status === 'ABERTO' && t.forma_pagamento_id === 1));
  assert.equal(vinculos.length, 2);
  assert.equal(historicos.length, 1);
  assert.equal(documentos.length, 0);
  assert.equal(anexos.length, 0, 'Nao cria anexo ficticio');
  await criar(base, 'sem-boleto');
  assert.equal(tituloPayloads.length, 2, 'Retry com mesma chave nao duplica titulos');
  assert.equal(historicos.length, 1);

  const boletos = [1, 2].map((n) => ({ arquivo_url: `https://arquivos.test/boleto${n}.pdf`, arquivo_nome: `boleto${n}.pdf` }));
  await criar({ ...base, boletos, fretes: [{ ...base.fretes[0], boletos: [boletos[0]] }] }, 'com-boleto');
  assert.equal(documentos.length, 3, 'Preserva multiplos boletos da compra e o do frete');
  assert.equal(anexos.length, 3);
  assert.equal(documentos[0].tipo, 'BOLETO_COMPRA');
  assert.equal(documentos[2].tipo, 'BOLETO_FRETE');
  assert.equal(anexos[0].solicitacao_id, 30);
  await assert.rejects(criar(base, ''), /idempotencia obrigatoria/);
  await assert.rejects(criar({ ...base, parcelas: [{ valor: 99, data_vencimento: '2026-10-20' }] }, 'soma'), /soma das parcelas/);
  const validar = (data) => service.qaPagamento({ favorecido_pagamento_id: 20, ...data }, 'a compra', formas, transaction);
  await assert.rejects(validar({ forma_pagamento_id: 999 }), /ativa e habilitada/);
  await assert.rejects(validar({ forma_pagamento_id: 1, favorecido_pagamento_id: 0 }), /favorecido/);
  await assert.rejects(validar({ forma_pagamento_id: 2 }), /chave PIX/);
  await assert.rejects(validar({ forma_pagamento_id: 3 }), /dados para pagamento/);
  assert.equal((await validar({ forma_pagamento_id: 2, chave_pix: 'compras@pix' })).chavePix, 'compras@pix');
  assert.equal((await validar({ forma_pagamento_id: 3, dados_pagamento: 'Conta 123' })).dadosPagamento, 'Conta 123');
  assert.throws(() => validateCompraPedidoPrevisoesBody({ ...base, boletos: [{}] }), /URL/);
  assert.throws(() => validateCompraPedidoPrevisoesBody({ ...base, parcelas: [{ valor: 100 }] }), /Vencimento/);
  for(const [forma,cartao] of [[4,10],[5,20]]){
    await criar({...base,forma_pagamento_id:forma,cartao_id:cartao,data_compra:'2026-10-12',
      fretes:[{...base.fretes[0],forma_pagamento_id:forma,cartao_id:cartao,data_compra:'2026-10-13'}]},'cartao-'+forma);
    assert.equal(tituloPayloads.at(-2).cartao_id,cartao);assert.equal(tituloPayloads.at(-2).data_compra,'2026-10-12');
    assert.equal(tituloPayloads.at(-1).cartao_id,cartao);assert.equal(tituloPayloads.at(-1).data_compra,'2026-10-13');
    assert.equal(tituloPayloads.at(-2).status,'ABERTO','Servico canonico recebe compra operacional e gera fatura/baixa');
  }
  for(const data of [{forma_pagamento_id:4}, {forma_pagamento_id:4,cartao_id:30},
    {forma_pagamento_id:4,cartao_id:20}, {forma_pagamento_id:5,cartao_id:10},
    {forma_pagamento_id:4,cartao_id:10,data_compra:'2026-02-30'}, {forma_pagamento_id:4,cartao_id:10,data_compra:'invalida'},
    {forma_pagamento_id:1,cartao_id:10}])await assert.rejects(validar(data), /cartao|data de compra/);
  assert.throws(()=>validateCompraPedidoPrevisoesBody({...base,cartao_id:-1}),/Cartao/);
  assert.throws(()=>validateCompraPedidoPrevisoesBody({...base,data_compra:'2026-02-30'}),/Data/);
  console.log('Boleto opcional: criacao compra/frete, anexos, auditoria, retry e validacoes preservadas. Sem banco real.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
