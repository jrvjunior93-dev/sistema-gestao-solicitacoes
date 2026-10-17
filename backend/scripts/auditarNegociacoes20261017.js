'use strict';
// Operador somente. Este arquivo nao e importado pelo servidor e nao executa
// reparo, UPDATE, DELETE, migration ou reinicio. Recorte dos prints do usuario.
const NEGOCIACOES = [3, 4, 5];
const json = value => typeof value === 'string' ? JSON.parse(value) : value;
function resumir(titulos, negociacoes) {
  const origens = new Map(), destinos = new Map();
  for (const n of negociacoes) {
    for (const t of json(n.snapshot) || []) origens.set(Number(t.id), Number(n.id));
    for (const t of json(n.resultado)?.titulos || []) destinos.set(Number(t.id), Number(n.id));
  }
  return titulos.map(t => ({ id: t.id, codigo: t.codigo, solicitacao: t.solicitacao_codigo,
    pedido: t.pedidos, status: t.status, valor: t.valor_original, pago: t.valor_baixado, saldo: t.valor_saldo,
    negociacao_origem: origens.get(Number(t.id)) || t.renegociado_por_id || null,
    negociacao_parcela: destinos.get(Number(t.id)) || t.renegociacao_id || null,
    excluido: Boolean(t.deleted_at), movimentos_ativos: Number(t.movimentos_ativos || 0),
    conferencia: origens.has(Number(t.id))
      ? (t.status !== 'RENEGOCIADO' || Number(t.valor_saldo) !== 0 || Number(t.renegociado_por_id) !== origens.get(Number(t.id)) ? 'ORIGEM_DIVERGENTE: investigar' : 'Origem substituida, preservar historico')
      : destinos.has(Number(t.id)) ? 'Parcela do acordo, preservar pagamento'
      : 'Fora destes acordos: conferir se representa a mesma compra, sem excluir automaticamente'
  }));
}
async function executar({ db, env, log = console.log, table = console.table }) {
  const ambientes = {
    production: ['gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com', '5ed4b970-009f-11f1-809c-0ad0e0c90c53'],
    development: ['fluxy-staging.cn820k66sdx7.us-east-2.rds.amazonaws.com', '60f043e9-4025-11f1-9a61-06d8a063012d']
  };
  const esperado = ambientes[env.deploymentEnvironment];
  if (!esperado || env.dbHost !== esperado[0] || env.dbName !== 'gestao_solicitacoes') throw Error('AMBIENTE_DIFERENTE');
  const [id] = await db.query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
  if (id[0]?.uuid !== esperado[1] || id[0]?.banco !== 'gestao_solicitacoes') throw Error('BANCO_DIFERENTE');
  const [negociacoes] = await db.query('SELECT /*+ MAX_EXECUTION_TIME(10000) */ id, snapshot, resultado, principal, juros, multa FROM titulo_renegociacoes WHERE id IN (:negociacoes) ORDER BY id', { replacements: { negociacoes: NEGOCIACOES } });
  const ids = [...new Set(negociacoes.flatMap(n => [...(json(n.snapshot) || []).map(t => Number(t.id)), ...(json(n.resultado)?.titulos || []).map(t => Number(t.id))]))];
  const [titulos] = await db.query(`SELECT /*+ MAX_EXECUTION_TIME(10000) */ t.id,t.codigo,t.status,t.valor_original,t.valor_baixado,t.valor_saldo,
    t.renegociacao_id,t.renegociado_por_id,t.deleted_at,s.codigo solicitacao_codigo,
    (SELECT GROUP_CONCAT(DISTINCT p.pedido_compra_id ORDER BY p.pedido_compra_id) FROM pedido_compra_titulos p WHERE p.titulo_financeiro_id=t.id) pedidos,
    (SELECT COUNT(*) FROM movimentos_financeiros m WHERE m.titulo_financeiro_id=t.id AND m.status='ATIVO') movimentos_ativos
    FROM titulos_financeiros t LEFT JOIN solicitacoes s ON s.id=t.solicitacao_id
    WHERE t.id IN (:ids) OR s.codigo=:solicitacao OR EXISTS
      (SELECT 1 FROM pedido_compra_titulos p WHERE p.titulo_financeiro_id=t.id AND p.pedido_compra_id=:pedido)
    ORDER BY t.id`, { replacements: { ids: ids.length ? ids : [0], solicitacao: 'SOL-5419', pedido: 139 } });
  table(negociacoes.map(n => ({ negociacao: n.id, principal: n.principal, juros: n.juros, multa: n.multa,
    origens: (json(n.snapshot) || []).map(t => t.codigo || t.id).join(', '),
    parcelas: (json(n.resultado)?.titulos || []).map(t => t.codigo || t.id).join(', ') })));
  table(resumir(titulos, negociacoes));
  log('Somente leitura. Nenhum registro, configuracao, migration ou processo alterado. Titulos fora dos acordos nao sao prova automatica de duplicidade.');
}
if (require.main === module) {
  if (process.argv[2] !== '--verificar') { console.error('Use --verificar. Este script nao tem modo de reparo.'); process.exitCode = 1; }
  else {
    const db = require('../src/database'), { env } = require('../src/config/env');
    executar({ db, env }).catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.close());
  }
}
module.exports = { resumir, executar };
