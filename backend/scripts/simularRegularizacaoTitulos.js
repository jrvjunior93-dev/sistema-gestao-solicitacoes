'use strict';
// Somente arquivos locais. Não importa models, env, rede ou driver SQL.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { alocarBaixas } = require('../src/services/tituloRenegociacaoBaixas');
const { conferirReferencia } = require('../src/services/tituloRegularizacaoDomain');
const cents = v => Math.round(Number(v || 0) * 100);
const valor = c => (c / 100).toFixed(2);
const hash = v => crypto.createHash('sha256').update(v).digest('hex');
const planos = [
  { codigo: 'SOL-5426', solicitacao_id: 5461, titulos: [11228], substituicao: { tipo: 'LOTE_COMPARTILHADO', id: 1 }, saldo_esperado: '7055.00' },
  { codigo: 'SOL-5419', solicitacao_id: 5454, titulos: [5174, 5175, 5176], substituicao: { tipo: 'NEGOCIACAO', id: 3 }, saldo_esperado: '1876.67' }
];
function projetar(data, s) {
  const parcelas = new Map();
  for (const t of data.titulos_financeiros.filter(t => t.renegociacao_id || t.compartilhamento_id)) {
    const compartilhado = Boolean(t.compartilhamento_id);
    const linhas = data[compartilhado ? 'titulos_compartilhados_origens' : 'titulo_renegociacao_alocacoes']
      .filter(a => Number(a[compartilhado ? 'titulo_financeiro_id' : 'titulo_destino_id']) === t.id);
    if (!linhas.length) throw Error('Parcela sem participações.');
    const baixas = alocarBaixas(linhas, data.movimentos_financeiros.filter(m => m.titulo_financeiro_id === t.id && m.tipo_movimento === 'BAIXA'), t.valor_baixado);
    linhas.forEach((a, i) => {
      if (Number(a.solicitacao_id) !== s.id) return;
      if (!compartilhado) {
        const original = data.titulos_financeiros.find(t => t.id === Number(a.titulo_origem_id));
        if (!original || Number(original.renegociado_por_id) !== Number(t.renegociacao_id)) throw Error('Cadeia de negociação divergente.');
      }
      const key = compartilhado ? `TC:${t.id}` : `TN:${a.titulo_origem_id}`;
      const atual = parcelas.get(key) || { id: compartilhado ? t.id : a.titulo_origem_id,
        status: 'ABERTO', valor_original: 0, valor_baixado: 0, valor_saldo: 0 };
      atual.valor_original += cents(a.valor); atual.valor_baixado += cents(baixas.pago[i]); atual.valor_saldo += cents(baixas.saldo[i]);
      parcelas.set(key, atual);
    });
  }
  const diretos = data.titulos_financeiros.filter(t => t.solicitacao_id === s.id && !t.renegociado_por_id
    && !['CANCELADO', 'ESTORNADO'].includes(t.status)).map(t => ({ id: t.id, valor_original: cents(t.valor_original), valor_baixado: cents(t.valor_baixado), valor_saldo: cents(t.valor_saldo) }));
  const linhas = [...diretos, ...parcelas.values()];
  return Object.fromEntries(['valor_original', 'valor_baixado', 'valor_saldo'].map(c => [c, valor(linhas.reduce((n, t) => n + t[c], 0))]));
}
async function simular(data) {
  const fonte = JSON.stringify(data), copia = structuredClone(data), resultados = [];
  const tx = { LOCK: { UPDATE: 'UPDATE' } };
  const db = { TituloFinanceiro: { findByPk: async id => copia.titulos_financeiros.find(t => t.id === id) } };
  for (const [model, tabela] of [['TituloCompartilhadoOrigem', 'titulos_compartilhados_origens'], ['TituloRenegociacaoAlocacao', 'titulo_renegociacao_alocacoes']]) {
    db[model] = { findAll: async ({ where }) => copia[tabela].filter(a => Object.entries(where).every(([k, v]) => Number(a[k]) === v)) };
  }
  for (const plano of planos) {
    const s = copia.solicitacoes.find(s => s.id === plano.solicitacao_id && s.codigo === plano.codigo);
    assert(s, 'Código e PK da solicitação precisam coincidir.');
    const antes = projetar(copia, s), alteracoes = [];
    for (const id of plano.titulos) {
      const t = copia.titulos_financeiros.find(t => t.id === id && t.solicitacao_id === s.id);
      assert(t && t.status === 'ABERTO' && cents(t.valor_baixado) === 0 && cents(t.valor_saldo) > 0, 'Título antigo mudou ou já foi regularizado.');
      assert(!t.renegociacao_id && !t.renegociado_por_id && !t.compartilhamento_id, 'Não cancelar título especializado.');
      assert(['MANUAL', 'SOLICITACAO', 'BAIXA_MASSA_PARCELADA'].includes(t.origem_titulo));
      for (const nome of ['movimentos_financeiros', 'pagamentos_manuais_fila', 'pagamento_autorizacao_itens', 'payment_intents',
        'pedido_compra_titulos', 'solicitacao_compra_alocacoes']) {
        assert(!copia[nome].some(r => Number(r.titulo_financeiro_id) === id), `Vínculo ${nome} exige análise adicional.`);
      }
      await conferirReferencia(db, t, plano.substituicao, tx);
      alteracoes.push({ titulo_id: id, codigo: t.codigo, antes: structuredClone(t), depois_proposto: {
        status: 'CANCELADO', valor_saldo: '0.00', substituicao: plano.substituicao,
        motivo: `Regularização por sobreposição com ${plano.substituicao.tipo} #${plano.substituicao.id}; identidade comercial deve ser conferida antes de executar.`
      } });
      t.status = 'CANCELADO'; t.valor_saldo = '0.00'; // Exclusivamente na cópia em memória.
    }
    const depois = projetar(copia, s);
    assert.equal(depois.valor_saldo, plano.saldo_esperado);
    resultados.push({ ...plano, antes, depois, alteracoes, reducao_saldo: valor(cents(antes.valor_saldo) - cents(depois.valor_saldo)) });
  }
  assert.equal(JSON.stringify(data), fonte, 'Fonte não pode ser modificada.');
  const alterados = new Set(planos.flatMap(p => p.titulos));
  for (const original of data.titulos_financeiros) {
    const depois = copia.titulos_financeiros.find(t => t.id === original.id);
    assert.equal(JSON.stringify(depois), JSON.stringify(alterados.has(original.id)
      ? { ...original, status: 'CANCELADO', valor_saldo: '0.00' } : original), 'Outros títulos e campos originais devem permanecer intactos.');
  }
  for (const nome of ['movimentos_financeiros', 'titulo_renegociacoes', 'titulo_renegociacao_alocacoes', 'titulos_compartilhados_lotes', 'titulos_compartilhados_origens', 'pedido_compra_titulos']) {
    assert.equal(JSON.stringify(copia[nome]), JSON.stringify(data[nome]), `Preservação de ${nome}`);
  }
  assert.equal(resultados.reduce((n, r) => n + cents(r.reducao_saldo), 0), 987000);
  return { modo: 'SIMULACAO_OFFLINE_SEM_EXECUCAO', fonte_hash: hash(fonte), resultados,
    movimentos_criados: 0, registros_excluidos: 0, banco_acessado: false,
    pendencias: ['Confirmar notas, pedidos e identidade comercial das obrigações.',
      'O snapshot não contém todos os vínculos bloqueadores do cancelamento. A operação real deve revalidar integralmente permissões, versão, fila, banco, contratos, cobrança e integrações.',
      'Nenhum comando de escrita foi gerado. A aprovação de implementação não autoriza executar esta regularização.'] };
}
async function main(args) {
  if (args.length !== 4 || args[0] !== '--extracao' || args[2] !== '--saida') throw Error('Uso: node backend/scripts/simularRegularizacaoTitulos.js --extracao DIRETORIO_EXTRAIDO --saida NOVO_DIRETORIO');
  const origem = path.resolve(args[1]), destino = path.resolve(args[3]);
  const nomes = ['solicitacoes', 'titulos_financeiros', 'titulos_compartilhados_origens', 'titulos_compartilhados_lotes', 'titulo_renegociacoes', 'titulo_renegociacao_alocacoes',
    'movimentos_financeiros', 'pagamentos_manuais_fila', 'pagamento_autorizacao_itens', 'payment_intents', 'pedido_compra_titulos', 'solicitacao_compra_alocacoes'];
  const arquivos = nomes.map(n => path.join(origem, n + '.json'));
  const hashes = arquivos.map(f => hash(fs.readFileSync(f)));
  const data = Object.fromEntries(nomes.map((n, i) => [n, JSON.parse(fs.readFileSync(arquivos[i], 'utf8'))]));
  const resultado = await simular(data);
  arquivos.forEach((f, i) => assert.equal(hash(fs.readFileSync(f)), hashes[i]));
  fs.mkdirSync(destino); // Sem sobrescrever saída anterior.
  fs.writeFileSync(path.join(destino, 'simulacao.json'), JSON.stringify(resultado, null, 2));
  const moeda = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const linhas = resultado.resultados.map(r => `<tr><td>${r.codigo}</td><td>${r.alteracoes.map(a => a.codigo).join(', ')}</td><td>${r.substituicao.tipo} #${r.substituicao.id}</td><td>${moeda(r.antes.valor_saldo)}</td><td>${moeda(r.depois.valor_saldo)}</td><td>${moeda(r.reducao_saldo)}</td></tr>`).join('');
  fs.writeFileSync(path.join(destino, 'Simulacao-regularizacao.html'), `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Simulação de regularização</title><style>body{font:15px/1.6 Segoe UI;color:#17263c;max-width:1200px;margin:35px auto;padding:15px}table{border-collapse:collapse;width:100%}td,th{padding:12px;border:1px solid #d1dbe6;text-align:left}th{background:#eaf0f7}</style><h1>Simulação — regularização de duas solicitações</h1><p><b>Nenhuma alteração foi executada.</b> O cenário encerra os títulos antigos por cancelamento auditado com referência ao substituto, condicionado à conferência comercial.</p><table><tr><th>Solicitação</th><th>Títulos antigos preservados</th><th>Referência proposta</th><th>Saldo antes</th><th>Saldo depois</th><th>Redução</th></tr>${linhas}</table><p>Redução proposta: <b>R$ 9.870,00</b>. Zero pagamentos criados. Zero exclusões. Negociações, parcelas, baixas e participações compartilhadas integralmente preservadas.</p><p>Os dois cards passariam a valor vigente de R$ 7.055,00 e R$ 2.815,00, respectivamente. Na SOL-5419, R$ 938,33 já liquidados e R$ 1.876,67 restantes.</p><h2>Antes de executar futuramente</h2><ul>${resultado.pendencias.map(p => `<li>${p}</li>`).join('')}</ul><p><a href="simulacao.json">Memória de cálculo e alterações propostas</a></p></html>`);
  console.log(`Simulação concluída sem banco: ${destino}`);
}
module.exports = { simular, projetar };
if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exitCode = 1; });
