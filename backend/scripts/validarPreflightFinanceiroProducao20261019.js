'use strict';
// Fronteira MySQL em memoria e simulador real, sem rede, .env ou banco.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { auditar, carregarSimulador, MIGRATION, UUID } = require('./preflightFinanceiroProducao20261019');
const raiz = path.resolve(__dirname, '../..');
const simular = carregarSimulador(file => fs.readFileSync(path.join(raiz, file), 'utf8'));
const titulo = (id, codigo, solicitacao_id, valor_original, extra = {}) => ({ id, codigo, solicitacao_id,
  tipo: 'PAGAR', parceiro_id: 77, status: 'ABERTO', origem_titulo: 'MANUAL', valor_original,
  valor_baixado: '0.00', valor_saldo: valor_original, renegociacao_id: null,
  renegociado_por_id: null, compartilhamento_id: null, deleted_at: null, ...extra });
const base = {
  solicitacoes: [{ id: 5461, codigo: 'SOL-5426' }, { id: 5454, codigo: 'SOL-5419' }],
  titulos_financeiros: [titulo(11228,'TIT-010200',5461,'7055.00'), titulo(5174,'TIT-003948',5454,'938.34'),
    titulo(5175,'TIT-003949',5454,'938.33'), titulo(5176,'TIT-003950',5454,'938.33'),
    titulo(200,'TC-200',null,'7055.00',{ compartilhamento_id: 1 }),
    titulo(300,'TN-ORIGINAL',5454,'2815.00',{ status: 'RENEGOCIADO', renegociado_por_id: 3, valor_saldo: '0.00' }),
    titulo(301,'TN-301',null,'2815.00',{ renegociacao_id: 3, valor_baixado: '938.33', valor_saldo: '1876.67' })],
  titulos_compartilhados_origens: [{ id: 1, lote_id: 1, titulo_financeiro_id: 200, solicitacao_id: 5461, valor: '7055.00' }],
  titulo_renegociacao_alocacoes: [{ id: 1, negociacao_id: 3, titulo_origem_id: 300, titulo_destino_id: 301, solicitacao_id: 5454, valor: '2815.00' }],
  movimentos_financeiros: [{ id: 400, titulo_financeiro_id: 301, tipo_movimento: 'BAIXA', status: 'ATIVO',
    valor: '938.33', valor_quitacao: '938.33', juros: 0, multa: 0, desconto: 0 }],
  pagamentos_manuais_fila: [], pagamento_autorizacao_itens: [], payment_intents: [],
  pedido_compra_titulos: [], solicitacao_compra_alocacoes: [], titulo_renegociacoes: [{ id: 3 }],
  titulos_compartilhados_lotes: [{ id: 1 }]
};

async function caso(tipo = 'ok') {
  const dados = structuredClone(base), antes = JSON.stringify(base), comandos = [], saidas = [];
  if (tipo === 'vinculo') dados.pagamentos_manuais_fila.push({ titulo_financeiro_id: 11228 });
  if (tipo === 'pago') dados.titulos_financeiros[0].valor_baixado = '1.00';
  if (tipo === 'excluido') dados.titulos_financeiros[0].deleted_at = '2026-10-19 00:00:00';
  const entrada = JSON.stringify(dados);
  const conexao = { query: async (sql, parametros = []) => {
    comandos.push(sql);
    assert(/^(SELECT|SHOW SESSION STATUS|SET SESSION MAX_EXECUTION_TIME|SET TRANSACTION|START TRANSACTION READ ONLY|ROLLBACK)\b/.test(sql));
    assert(!sql.includes(';'));
    if (sql.includes('server_uuid')) return [[{ uuid: tipo === 'uuid' ? 'dev' : UUID, banco: 'gestao_solicitacoes' }]];
    if (sql.startsWith('SHOW')) return [[{ Value: 'TLSv1.3' }, { Value: tipo === 'tls' ? '' : 'TLS_AES_256_GCM_SHA384' }]];
    if (!sql.startsWith('SELECT')) return [[]];
    if (sql.includes('schema_migrations')) return [[{ name: 'anterior.js' }]];
    const tabela = sql.match(/FROM ([a-z_]+)/)?.[1];
    assert(Object.hasOwn(dados, tabela), 'Consulta desconhecida: ' + sql);
    if (tipo === 'limite' && tabela === 'titulos_compartilhados_origens') return [Array(2001).fill(dados[tabela][0])];
    assert(Array.isArray(parametros));
    return [dados[tabela]];
  } };
  const executar = () => auditar({ conexao, arquivos: ['anterior.js', MIGRATION, ...(tipo === 'schema' ? ['estranha.js'] : [])], simular, log: message => saidas.push(message) });
  if (tipo === 'ok') {
    await executar();
    const resultado = saidas.map(s => { try { return JSON.parse(s); } catch { return null; } }).find(r => r?.propostas);
    assert.equal(resultado.propostas[0].depois_proposto.valor_saldo, '7055.00');
    assert.equal(resultado.propostas[1].depois_proposto.valor_saldo, '1876.67');
    assert.equal(resultado.movimentos_criados, 0); assert.equal(resultado.registros_excluidos, 0);
  } else await assert.rejects(executar());
  if (!['uuid','tls'].includes(tipo)) assert.equal(comandos.at(-1), 'ROLLBACK');
  else assert(!comandos.includes('START TRANSACTION READ ONLY'));
  assert.equal(JSON.stringify(base), antes); assert.equal(JSON.stringify(dados), entrada);
}
(async () => {
  for (const tipo of ['ok','uuid','tls','schema','vinculo','pago','excluido','limite']) await caso(tipo);
  assert.throws(() => carregarSimulador(() => "require('node:fs').writeFileSync('x','x')"));
  assert.throws(() => carregarSimulador(() => "require('../models')"));
  console.log('Preflight financeiro: simulador real, centavos/saldos, somente SELECT/READ ONLY, rollback, identidade/TLS/schema, vinculo/pagamento/exclusao/limite e sandbox sem models/escrita aprovados. Sem banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
