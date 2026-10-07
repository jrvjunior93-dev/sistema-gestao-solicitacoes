'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { analyze, normalize, governanceRoot, stats, date, weekdayHours } = require('./auditoriaTemposSolicitacoes/engine');
const { projection, buildSchema, extract, SPECS } = require('./auditoriaTemposSolicitacoes/extracao');
const { main, csv, html, args, outputDirectory, sqlDate, saveExtraction } = require('./auditarTemposSolicitacoes');
const options = { since: '2026-09-01T00:00:00-03:00', until: '2026-09-10T00:00:00-03:00', dbOffset: '+00:00' };
function fixture() {
  return {
    solicitacoes: [{ id: 1, codigo: 'SOL-1', tipo_solicitacao_id: 1, obra_id: 8, createdAt: '2026-09-01T12:00:00Z', updatedAt: '2026-09-04T12:00:00Z', area_responsavel: 'FINANCEIRO', status_global: 'ENVIADO PARA PAGAMENTO' }],
    setores: [{ id: 1, codigo: 'OBRA', nome: 'Obra' }, { id: 2, codigo: 'GEO', nome: 'Gerência de Processos' }, { id: 3, codigo: 'FINANCEIRO', nome: 'Financeiro' }],
    users: [{ id: 10, nome: 'Pessoa A' }, { id: 20, nome: 'Pessoa B' }, { id: 30, nome: 'Pessoa C' }], tipos: [{ id: 1, nome: 'Teste' }],
    historicos: [
      { id: 1, solicitacao_id: 1, acao: 'SOLICITACAO_CRIADA', setor: 'OBRA', usuario_responsavel_id: 10, createdAt: '2026-09-01T12:00:00Z' },
      { id: 2, solicitacao_id: 1, acao: 'ENVIADA_SETOR', setor: 'GEO', usuario_responsavel_id: 10, observacao: 'De OBRA para GEO', createdAt: '2026-09-01T13:00:00Z' },
      { id: 3, solicitacao_id: 1, acao: 'RESPONSAVEL_ATRIBUIDO', setor: 'GEO', usuario_responsavel_id: 30, metadata: JSON.stringify({ ator_id: 20, responsavel_id: 30 }), createdAt: '2026-09-01T15:00:00Z' },
      { id: 4, solicitacao_id: 1, acao: 'COMENTARIO', setor: '2', usuario_responsavel_id: 30, createdAt: '2026-09-01T16:00:00Z' },
      { id: 5, solicitacao_id: 1, acao: 'VALOR_ATUALIZADO', setor: 'GEO', usuario_responsavel_id: 30, createdAt: '2026-09-01T18:00:00Z' },
      { id: 6, solicitacao_id: 1, acao: 'ENVIADA_SETOR', setor: 'FINANCEIRO', usuario_responsavel_id: 30, metadata: JSON.stringify({ setor_origem: 'GEO', setor_destino: 'FINANCEIRO' }), createdAt: '2026-09-02T12:00:00Z' }
    ],
    operacionais: [{ id: 1, recurso_tipo: 'solicitacoes.:id', recurso_id: '1', rota_padrao: '/solicitacoes/:id', ocorrido_em: '2026-09-01T14:00:00Z', usuario_id: 20, setor_id: 2, categoria: 'NAVEGACAO', resultado: 'SUCCESS', tipo_evento: 'PAGE_VIEW' }]
  };
}
let count = 0;
function test(name, run) { run(); count++; console.log(`OK ${name}`); }
test('flags MySQL textuais preservam acoes humanas e distinguem automacao', () => {
  const f = fixture();
  for (const h of f.historicos) h.automatica = '0';
  f.historicos[3].metadata = { automatico: 'false', automacao: '0', retorno_automatico_baixa: '0' };
  assert.equal(analyze(f, options).passagens.find(p => p.setor === 'GEO').primeira_interacao_h, 2);
  f.historicos[3].automatica = '1';
  let r = analyze(f, options);
  assert.equal(r.eventos.find(e => e.key === 'historicos:4').automatica, true);
  assert.equal(r.eventos.find(e => e.key === 'historicos:5').automatica, false);
  f.historicos[4].acao = 'ENVIO_AUTOMATICO_SETOR';
  r = analyze(f, options);
  assert.equal(r.eventos.find(e => e.key === 'historicos:5').automatica, true);
});
test('codigo de setor nao e substituido por nome de outro setor', () => {
  const f = fixture();
  f.setores.push({id: 4, codigo: 'COMPRAS', nome: 'COMPRAS SUL'}, {id: 19, codigo: 'COMPRAS-1', nome: 'COMPRAS'});
  f.historicos[3].setor = 'COMPRAS'; f.historicos[4].setor = '19';
  const r = analyze(f, options);
  assert.equal(r.eventos.find(e => e.key === 'historicos:4').setor_ator, 'COMPRAS');
  assert.equal(r.eventos.find(e => e.key === 'historicos:5').setor_ator, 'COMPRAS_1');
});
test('status terminal e reabertura de recursos filhos nao encerram nem reabrem a raiz', () => {
  const f = fixture();
  f.historicos.push({id: 7, solicitacao_id: 1, acao: 'COTACAO_ENCERRADA_SEM_PEDIDO', status_novo: 'ENCERRADO', setor: 'FINANCEIRO', createdAt: '2026-09-03T12:00:00Z'});
  assert.equal(analyze(f, options).passagens.at(-1).censurada_direita, true);
  f.historicos[6].acao = 'SOLICITACAO_CANCELADA_POR_COMPRA'; f.historicos[6].status_novo = 'CANCELADA';
  f.historicos.push({id: 8, solicitacao_id: 1, acao: 'PEDIDO_COMPRA_REABERTO', status_novo: 'ABERTO', setor: 'FINANCEIRO', createdAt: '2026-09-04T12:00:00Z'});
  assert.equal(analyze(f, options).passagens.at(-1).censurada_direita, false);
});
test('revisao GEO com destino explicito abre passagem em Compras', () => {
  const f = fixture();
  f.historicos[5].acao = 'SOLICITACAO_COMPRA_ENCAMINHADA_COMPRAS';
  f.historicos[5].metadata = {area_anterior: 'GEO', area_nova: 'COMPRAS-1'};
  f.solicitacoes[0].area_responsavel = 'COMPRAS-1';
  assert.equal(analyze(f, options).passagens.at(-1).setor, 'COMPRAS_1');
});
test('primeira leitura distinta da primeira alteracao e envio pertence ao remetente', () => {
  const r = analyze(fixture(), options), geo = r.passagens.find((p) => p.setor === 'GEO');
  assert.equal(geo.primeira_leitura_h, 1); assert.equal(geo.primeira_interacao_h, 2); assert.equal(geo.permanencia_h, 23);
  const fin = r.passagens.find((p) => p.setor === 'FINANCEIRO');
  assert.equal(fin.primeira_interacao_h, null); assert.equal(fin.permanencia_h, null); assert.equal(fin.censurada_direita, true);
  assert.equal(r.resumo_setor.find((s) => s.setor === 'FINANCEIRO').primeira_interacao_h_amostras, 0);
});
test('ator da atribuicao e destinatario nao sao confundidos', () => {
  const r = analyze(fixture(), options), people = r.usuarios_passagens.filter((p) => p.setor_passagem === 'GEO');
  assert.equal(people.find((p) => p.usuario_id === '20').entrada_ate_primeira_h, 2);
  assert.equal(people.find((p) => p.usuario_id === '30').entrada_ate_primeira_h, 3);
  assert.equal(people.find((p) => p.usuario_id === '30').atribuicao_ate_acao_h, 1);
});
test('intervalos do mesmo usuario dentro da mesma passagem', () => {
  const r = analyze(fixture(), options);
  assert.deepEqual(r.intervalos.filter((i) => i.usuario_id === '30').map((i) => i.horas), [2, 18]);
});
test('atribuido sem ator e sem resposta nao vira autor', () => {
  const f = fixture(); f.historicos[2].metadata = null; f.historicos[2].usuario_responsavel_id = 99;
  const r = analyze(f, options), p = r.usuarios_passagens.find((p) => p.usuario_id === '99');
  assert.equal(p.interacoes, 0); assert.equal(p.atribuicao_sem_acao, true);
  assert.ok(r.qualidade.some((q) => q.problema === 'ATRIBUICAO_SEM_ATOR'));
});
test('devolucao cria nova passagem sem misturar primeira resposta', () => {
  const f = fixture(); f.historicos.push({ id: 7, solicitacao_id: 1, acao: 'ENVIADA_SETOR', setor: 'GEO', usuario_responsavel_id: 10, observacao: 'De FINANCEIRO para GEO', createdAt: '2026-09-03T12:00:00Z' });
  f.solicitacoes[0].area_responsavel = 'GEO';
  const r = analyze(f, options);
  assert.equal(r.passagens.filter((p) => p.setor === 'GEO').length, 2);
  assert.equal(r.passagens.filter((p) => p.setor === 'GEO')[1].primeira_interacao_h, null);
  assert.equal(r.fluxos[0].retornos, 1);
});
test('automacao com usuario causal nao e interacao do recebedor', () => {
  const f = fixture(); f.historicos.push({ id: 7, solicitacao_id: 1, acao: 'ENVIADA_SETOR', setor: 'OBRA', usuario_responsavel_id: 20, metadata: JSON.stringify({ setor_origem: 'FINANCEIRO', setor_destino: 'OBRA', retorno_automatico_baixa: true }), createdAt: '2026-09-03T12:00:00Z' });
  const r = analyze(f, options), e = r.eventos.find((e) => e.key === 'historicos:7');
  assert.equal(e.automatica, true);
  assert.equal(r.passagens.find((p) => p.setor === 'FINANCEIRO').primeira_interacao_h, null);
});
test('PAGA nao equivale a finalizada', () => {
  const f = fixture(); f.historicos.push({ id: 7, solicitacao_id: 1, acao: 'STATUS_ALTERADO', status_novo: 'PAGA', setor: 'FINANCEIRO', createdAt: '2026-09-03T12:00:00Z' });
  assert.equal(analyze(f, options).passagens.at(-1).censurada_direita, true);
});
test('finalizacao explicita interrompe envelhecimento', () => {
  const f = fixture(); f.historicos.push({ id: 7, solicitacao_id: 1, acao: 'STATUS_ALTERADO', status_novo: 'FINALIZADA', setor: 'FINANCEIRO', createdAt: '2026-09-03T12:00:00Z' });
  const p = analyze(f, options).passagens.at(-1);
  assert.equal(p.permanencia_h, 24); assert.equal(p.censurada_direita, false);
});
test('backlog anterior ao inicio preserva entrada e historico', () => {
  const r = analyze(fixture(), { ...options, since: '2026-09-05T00:00:00Z' });
  assert.equal(r.passagens.length, 1); assert.equal(r.passagens[0].inicio_anterior_periodo, true);
  assert.equal(r.passagens[0].entrada, '2026-09-02T12:00:00.000Z');
});
test('fim exclusivo rejeita eventos no corte', () => {
  const f = fixture(); f.historicos.push({ id: 99, solicitacao_id: 1, acao: 'COMENTARIO', setor: 'FINANCEIRO', usuario_responsavel_id: 10, createdAt: options.until });
  assert.ok(!analyze(f, options).eventos.some((e) => e.key === 'historicos:99'));
});
test('entrada ausente nao e inventada pelo setor atual', () => {
  const f = fixture(); f.historicos = [f.historicos[0]];
  const p = analyze(f, options).passagens[0];
  assert.equal(p.setor, null); assert.equal(p.confiavel_para_resumo, false);
});
test('espelho HTTP conserva evidencia sem contar comentario duas vezes', () => {
  const f = fixture(); f.operacionais.push({ id: 2, recurso_id: '1', recurso_tipo: 'solicitacoes.:id.comentarios', rota_padrao: '/solicitacoes/:id/comentarios', ocorrido_em: '2026-09-01T16:00:01Z', usuario_id: 30, setor_id: 2, categoria: 'OPERACAO', resultado: 'SUCCESS', tipo_evento: 'COMMENT' });
  const r = analyze(f, options);
  assert.equal(r.eventos.find((e) => e.key === 'governanca:2').replica_de, 'historicos:4');
  assert.equal(r.usuarios_passagens.find((p) => p.usuario_id === '30' && p.setor_passagem === 'GEO').interacoes, 3);
});
test('recurso com ID de filho nao e confundido com solicitacao', () => {
  const maps = { solicitacoes: new Map([['1', '1']]) };
  assert.equal(governanceRoot({ recurso_tipo: 'solicitacoes', recurso_id: '1', rota_padrao: '/solicitacoes/:id/comentarios/:id' }, maps), null);
});
test('falha nao conta como resposta bem sucedida', () => {
  const f = fixture(); f.operacionais.push({ id: 3, recurso_id: '1', recurso_tipo: 'solicitacoes', rota_padrao: '/solicitacoes/:id/status', ocorrido_em: '2026-09-02T13:00:00Z', usuario_id: 20, setor_id: 3, categoria: 'SEGURANCA', resultado: 'FAILED', tipo_evento: 'STATUS_CHANGE' });
  const p = analyze(f, options).passagens.at(-1); assert.equal(p.falhas, 1); assert.equal(p.primeira_interacao_h, null);
});
test('fuso explicito e calendario de fim de semana com feriado', () => {
  assert.equal(date('2026-09-01 09:00:00', '-03:00'), date('2026-09-01T12:00:00Z'));
  const a = date('2026-09-04T12:00:00-03:00'), b = date('2026-09-07T12:00:00-03:00');
  assert.equal(weekdayHours(a, b), 24); assert.equal(weekdayHours(a, b, new Set(['2026-09-07'])), 12);
  assert.equal(sqlDate(date('2026-09-01T12:00:00Z'), '-03:00'), '2026-09-01 09:00:00.000');
});
test('percentis nao confundem nulos com zero', () => {
  assert.deepEqual(stats([null, undefined]).amostras, 0); assert.equal(stats([0, 1, 5, 100]).p90_h, 100);
});
test('CSV neutraliza formulas e HTML escapa texto', () => {
  assert.ok(csv([{ nome: '=IMPORTDATA("url")' }]).includes("'=IMPORTDATA"));
  const r = analyze(fixture(), options); r.resumo_setor[0].setor = '<script>alert(1)</script>';
  assert.ok(!html(r).includes('<script>'));
});
test('projecao nao extrai valores sensiveis nem comentarios', () => {
  const schema = buildSchema(Object.entries(SPECS).flatMap(([t, cs]) => [...cs, 'metadata', 'observacao', 'descricao'].map((c) => ({ TABLE_NAME: t, COLUMN_NAME: c }))));
  const sql = projection(schema, 'historicos', []);
  assert.ok(sql.includes("= 'ENVIADA_SETOR' THEN")); assert.ok(!sql.includes("'ator_nome'"));
  assert.ok(!sql.includes('SELECT *')); assert.ok(!projection(schema, 'users', []).includes('password'));
});
test('CLI sem alvo nao pode autorizar escrita ou sobrescrever repositorio', () => {
  assert.throws(() => args(['--apply']), /desconhecido/);
  assert.throws(() => outputDirectory('..'), /repositorio/);
  assert.throws(() => outputDirectory('backend'), /existe/);
});
test('criacao de compra usa destino, nao lotacao ficticia do criador', () => {
  const f = fixture(); f.historicos = [{ ...f.historicos[0], acao: 'CRIADA', setor: 'GEO' }];
  const r = analyze(f, options); assert.equal(r.passagens[0].setor, 'GEO'); assert.equal(r.passagens[0].primeira_interacao_h, null);
});
test('criacao auditada recupera destino sem supor fluxo atual', () => {
  const f = fixture(); f.historicos = [f.historicos[0], { id: 20, solicitacao_id: 1, acao: 'COMENTARIO', setor: 'GEO', usuario_responsavel_id: 20, createdAt: '2026-09-01T16:00:00Z' }];
  f.solicitacoes[0].area_responsavel = 'GEO';
  f.criacoes_auditadas = [{ id: 40, recurso_id: 1, recurso_tipo: 'SOLICITACAO', tipo_evento: 'SOLICITACAO_CREATED', status: 'SUCCESS', usuario_id: 10, metadata: JSON.stringify({ area_responsavel: 'GEO' }), createdAt: '2026-09-01T12:00:01Z' }];
  const p = analyze(f, options).passagens[0];
  assert.equal(p.setor, 'GEO'); assert.equal(p.primeira_interacao_h, 4); assert.equal(p.confiavel_para_resumo, true);
});
test('sobreposicao respeita fim da passagem exclusivo', () => {
  const r = analyze(fixture(), { ...options, since: '2026-09-02T12:00:00Z' });
  assert.equal(r.passagens.length, 1); assert.equal(r.passagens[0].setor, 'FINANCEIRO');
});
test('origem divergente exclui resumo estrito', () => {
  const f = fixture(); f.historicos[5].metadata = JSON.stringify({ setor_origem: 'COMPRAS', setor_destino: 'FINANCEIRO' });
  const p = analyze(f, options).passagens.find((p) => p.setor === 'GEO');
  assert.equal(p.confiavel_para_resumo, false); assert.match(p.alertas, /LACUNA/);
});
test('acao interna ligada a fornecedor nao vira resposta externa', () => {
  const f = fixture(); f.compras = [{ id: 44, solicitacao_principal_id: 1 }];
  f.compras_logs = [{ id: 7, solicitacao_compra_id: 44, usuario_id: 30, fornecedor_compra_id: 55, tipo_acao: 'ENVIO_COTACAO', createdAt: '2026-09-01T17:00:00Z' }];
  const r = analyze(f, options), e = r.eventos.find((e) => e.key === 'compras_logs:7');
  assert.equal(e.origem, 'COMPRA'); assert.equal(e.automatica, false); assert.equal(e.setor_ator, null);
  assert.equal(r.usuarios_passagens.find((p) => p.usuario_id === '30' && p.setor_passagem === 'GEO').interacoes, 4);
});
test('evento anterior a abertura e setor divergente geram ressalva', () => {
  const f = fixture(); f.historicos[1].createdAt = '2026-08-31T12:00:00Z';
  assert.ok(analyze(f, options).qualidade.some((q) => q.problema === 'EVENTO_ANTERIOR_ABERTURA'));
});
function serverFixture() {
  const f = JSON.parse(JSON.stringify(fixture()).replace(/(\d\d:\d\d:\d\d)Z/g, '$1'));
  f.corte_servidor = '2026-09-10 03:00:00.000';
  return f;
}
test('historico completo inclui antiga encerrada e ultima aberta sem corte por ano', () => {
  const f = serverFixture();
  f.solicitacoes.push({ id: 2, codigo: 'ANTIGA', createdAt: '2018-01-01 10:00:00', area_responsavel: 'OBRA', status_global: 'FINALIZADA' });
  f.historicos.push({ id: 90, solicitacao_id: 2, acao: 'CRIADA', setor: 'OBRA', createdAt: '2018-01-01 10:00:00' },
    { id: 91, solicitacao_id: 2, acao: 'STATUS_ALTERADO', setor: 'OBRA', status_novo: 'FINALIZADA', createdAt: '2018-01-02 10:00:00' });
  const r = analyze(f, { fullHistory: true, dbOffset: 'servidor' });
  assert.equal(r.manifesto.solicitacoes_no_relatorio, 2);
  assert.equal(r.manifesto.inicio_inclusivo, '2018-01-01T10:00:00.000');
  assert.equal(r.passagens.find((p) => p.codigo === 'ANTIGA').permanencia_h, 24);
  assert.equal(r.passagens.find((p) => p.setor === 'FINANCEIRO').censurada_direita, true);
  f.historicos.at(-1).createdAt = '2018-01-01 10:00:00';
  const simultaneous = analyze(f, { fullHistory: true, dbOffset: 'servidor' });
  assert.equal(simultaneous.manifesto.solicitacoes_no_relatorio, 2);
  assert.equal(simultaneous.passagens.find((p) => p.codigo === 'ANTIGA').permanencia_h, 0);
});
test('horario do servidor preserva diferencas e nao inventa UTC ou dias uteis', () => {
  const r = analyze(serverFixture(), { fullHistory: true, dbOffset: 'servidor' });
  const reference = analyze(fixture(), options);
  assert.deepEqual(r.passagens.map((p) => [p.primeira_interacao_h, p.idade_observada_h]), reference.passagens.map((p) => [p.primeira_interacao_h, p.idade_observada_h]));
  assert.ok(r.passagens.every((p) => p.horas_calendario_sem_fds === null && !p.entrada.endsWith('Z')));
  assert.equal(r.manifesto.escopo, 'HISTORICO_COMPLETO');
  assert.match(html(r), /horarios do servidor, sem conversao/);
  assert.ok(!html(r).includes('timestamps em UTC'));
});
test('corte vem da extracao, nao da ultima interacao ou do relogio local', () => {
  const f = serverFixture();
  const r = analyze(f, { fullHistory: true, dbOffset: 'servidor' });
  assert.equal(r.manifesto.fim_exclusivo, '2026-09-10T03:00:00.000');
  assert.equal(r.passagens.at(-1).idade_observada_h, 183);
  delete f.corte_servidor;
  assert.throws(() => analyze(f, { fullHistory: true, dbOffset: 'servidor' }), /corte_servidor/);
});
test('datas locais invalidas e mistura de fuso nao sao interpretadas silenciosamente', () => {
  assert.equal(date('2026-02-30 12:00:00', 'servidor'), null);
  assert.equal(date('2026-09-01T12:00:00Z', 'servidor'), null);
  const f = serverFixture(); f.solicitacoes[0].createdAt = null;
  assert.ok(analyze(f, { fullHistory: true, dbOffset: 'servidor' }).qualidade.some((q) => q.problema === 'ABERTURA_SEM_DATA_VALIDA'));
  assert.equal(analyze({ solicitacoes: [], historicos: [], corte_servidor: f.corte_servidor }, { fullHistory: true, dbOffset: 'servidor' }).manifesto.solicitacoes_lidas, 0);
});
async function asyncChecks() {
  await assert.rejects(() => main(['--entrada=ignorado.json', '--somente-extrair', '--historico-completo', '--fuso-banco=servidor']), /exige --consultar-banco/);
  await assert.rejects(() => main(['--consultar-banco', '--somente-extrair=false', '--historico-completo']), /sem valor/);
  count++; console.log('OK exportacao de dados exige modo explicito e universo completo');

  const qaRoot = path.resolve(__dirname, '../../outputs');
  fs.mkdirSync(qaRoot, { recursive: true });
  const qa = fs.mkdtempSync(path.join(qaRoot, 'auditoria-extracao-qa-'));
  const extractedDir = path.join(qa, 'extracao'), analyzedDir = path.join(qa, 'analise');
  const data = serverFixture(); data.sintetico = true;
  const extraction = { avisos: [{ tabela: 'anexos', problema: 'FONTE_OPCIONAL_INDISPONIVEL' }], relogio_banco: { corte_servidor: data.corte_servidor, fuso_sessao: 'SYSTEM' } };
  saveExtraction(data, { extracao: extraction }, extractedDir, [{ sql: 'SELECT id FROM solicitacoes', parametros: [] }]);
  const input = path.join(extractedDir, 'historico.json');
  const exported = JSON.parse(fs.readFileSync(input, 'utf8'));
  assert.equal(exported.solicitacoes.length, data.solicitacoes.length);
  assert.equal(exported.historicos.length, data.historicos.length);
  assert.equal(exported.corte_servidor, data.corte_servidor);
  assert.equal(exported.manifesto_extracao.formato, 'FLUXY_TEMPOS_V1');
  assert.equal(exported.manifesto_extracao.demonstracao_sintetica, true);
  assert.ok(!fs.existsSync(path.join(extractedDir, 'relatorio.json')));
  for (const line of fs.readFileSync(path.join(extractedDir, 'SHA256SUMS.txt'), 'utf8').trim().split('\n')) {
    const [hash, name] = line.split('  ');
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(extractedDir, name))).digest('hex'), hash);
  }
  assert.ok(fs.existsSync(path.join(extractedDir, 'CONCLUIDO.txt')));
  assert.throws(() => saveExtraction(data, {}, extractedDir, []), /EEXIST/);
  count++; console.log('OK extracao exporta historico integral, corte, manifesto e hashes sem sobrescrever');

  await main([`--entrada=${input}`, '--historico-completo', '--fuso-banco=servidor', `--saida=${analyzedDir}`]);
  const report = JSON.parse(fs.readFileSync(path.join(analyzedDir, 'relatorio.json'), 'utf8'));
  assert.deepEqual(report.manifesto.extracao, extraction);
  assert.equal(report.manifesto.manifesto_extracao_original.formato, 'FLUXY_TEMPOS_V1');
  assert.equal(report.manifesto.demonstracao_sintetica, true);
  assert.equal(report.passagens.find(p => p.setor === 'GEO').permanencia_h, 23);
  count++; console.log('OK arquivo exportado retorna para analise offline preservando fontes e tempos');

  for (const filter of ['--de=2026-09-01', '--ate=2026-10-01', '--ids=1', '--feriados=feriados.json']) {
    await assert.rejects(() => main(['--entrada=inexistente.json', '--historico-completo', '--fuso-banco=servidor', filter]), /nao aceita recortes/);
  }
  count++; console.log('OK CLI impede recorte silencioso do historico completo');
  let queryCount = 0;
  const allColumns = Object.entries(SPECS).flatMap(([t, cs]) => cs.map((c) => ({ TABLE_NAME: t, COLUMN_NAME: c, DATA_TYPE: 'varchar' })));
  const fake = { execute: async ({ sql }) => {
    queryCount++; assert.match(sql, /^SELECT /); assert.ok(!/FOR UPDATE|INSERT |DELETE |UPDATE |CREATE |DROP /i.test(sql));
    if (sql.includes('information_schema.COLUMNS')) return [allColumns];
    if (sql.includes('information_schema.TABLES')) return [Object.keys(SPECS).map((t) => ({ TABLE_NAME: t, ENGINE: 'InnoDB' }))];
    return [[]];
  } };
  const result = await extract(fake, { maxRows: 5000, maxRequests: 100, cutoffSql: '2026-10-01', sinceSql: '2026-09-01' });
  assert.equal(result.data.solicitacoes.length, 0); assert.ok(queryCount >= 6); count++;
  console.log('OK extrator em driver simulado envia somente SELECT');
  const notTransactional = { execute: async ({ sql }) => sql.includes('COLUMNS') ? [allColumns] : [[{ TABLE_NAME: 'historicos', ENGINE: 'MyISAM' }]] };
  await assert.rejects(() => extract(notTransactional, { maxRows: 5000 }), /nao transacional/); count++;
  const completeQueries = [];
  const fullFake = { execute: async (query, params) => {
    completeQueries.push({ sql: query.sql, params });
    if (query.sql.includes('CURRENT_TIMESTAMP')) return [[{ corte_servidor: '2026-10-01 15:12:23.456', fuso_sessao: 'SYSTEM', fuso_sistema: 'UTC' }]];
    return fake.execute(query, params);
  } };
  const complete = await extract(fullFake, { maxRows: 5000, maxRequests: 100, fullHistory: true });
  assert.equal(complete.data.corte_servidor, '2026-10-01 15:12:23.456');
  assert.equal(complete.manifest.relogio_banco.fuso_sessao, 'SYSTEM');
  const rootQuery = completeQueries.find((q) => q.sql.includes('FROM `solicitacoes`'));
  assert.ok(rootQuery.params.includes(complete.data.corte_servidor));
  assert.ok(!rootQuery.sql.includes('`createdAt` >='));
  assert.ok(rootQuery.sql.includes('`createdAt` IS NULL'));
  assert.ok(completeQueries.every((q) => q.sql.startsWith('SELECT ')));
  count++; console.log('OK extrator completo usa corte do servidor e conserva fuso da sessao');
  console.log(`Auditoria de tempos: ${count} cenarios aprovados; nenhum banco acessado.`);
}
if (require.main === module) asyncChecks().catch((e) => { console.error(e); process.exitCode = 1; });
module.exports = { fixture };
