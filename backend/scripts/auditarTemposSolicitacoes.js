'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { analyze, date } = require('./auditoriaTemposSolicitacoes/engine');
const { extract } = require('./auditoriaTemposSolicitacoes/extracao');
const ROOT = path.resolve(__dirname, '../..');
const HELP = `Auditoria offline ou conexao direta SOMENTE LEITURA. Nao executa SSH ou controla servicos.

Uso offline:
  node scripts/auditarTemposSolicitacoes.js --entrada=historico.json --historico-completo --fuso-banco=servidor
  O JSON completo precisa incluir corte_servidor (horario do banco na extracao).

Recorte opcional:
  node scripts/auditarTemposSolicitacoes.js --entrada=recorte.json --de=2026-09-01 --ate=2026-10-01 --fuso-banco=+00:00

Extracao posterior (somente com alvo explicitamente autorizado):
  node scripts/auditarTemposSolicitacoes.js --consultar-banco --confirmar-banco=NOME --historico-completo --fuso-banco=servidor --somente-extrair
  Gera historico.json para enviar e analisar offline; nao executa analise no servidor.
  Sem --somente-extrair, gera o relatorio diretamente.

Historico completo: todas as solicitacoes e sua trilha disponivel ate o inicio da
extracao. Usa o relogio do banco, sem mudar o fuso da sessao nem converter horarios.
Sem --de, --ate, --ids ou calendario de dias uteis nesse modo.

No recorte opcional: inicio inclusivo e fim exclusivo, calendario America/Sao_Paulo. --ate e meia-noite
do dia seguinte ao ultimo dia desejado. Nunca recorta o historico anterior a --de.
--fuso-banco deve refletir o armazenamento real dos DATETIME; nao presumir UTC.

Opcionais:
  --ids=1,2,3                  Apenas IDs autorizados (padrao: todos anteriores ao corte).
  --feriados=arquivo.json      Array de datas YYYY-MM-DD; calendario informado, nao presumido.
  --max-solicitacoes=20000     Aborta se ultrapassar, nunca trunca silenciosamente.
  --max-linhas=500000          Limite total de leitura e memoria.
  --saida=outputs/auditoria   Diretorio NOVO dentro deste repositorio.

Conexao: AUDIT_DB_HOST, AUDIT_DB_NAME, AUDIT_DB_USER, AUDIT_DB_PASSWORD,
AUDIT_DB_PORT (3306), AUDIT_DB_CA_FILE (opcional; CA para TLS validado).
Nao carrega .env, nao salva conexao/senha, nao imprime enderecos. TLS obrigatorio.
Use usuario SELECT-only. Preferir replica/copia autorizada, fora de horario de pico.
Comandos enviados: SET de sessao, START TRANSACTION READ ONLY, SELECT e ROLLBACK.
Sem argumento de execucao, nenhuma conexao e aberta. --help e sempre offline.
`;
function args(argv) {
  const out = {};
  const allowed = new Set(['entrada', 'de', 'ate', 'fuso-banco', 'historico-completo', 'somente-extrair', 'consultar-banco', 'confirmar-banco', 'ids', 'feriados', 'max-solicitacoes', 'max-linhas', 'saida', 'help']);
  for (const arg of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (!m || !allowed.has(m[1]) || Object.hasOwn(out, m[1])) throw new Error('Argumento desconhecido ou repetido. Consulte --help.');
    out[m[1]] = m[2] ?? true;
  }
  return out;
}
function csv(rows) {
  if (!rows.length) return '\ufeffsem_registros\r\n';
  const columns = [...new Set(rows.flatMap(Object.keys))];
  const cell = (v) => {
    let s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[\s]*[=+@-]/.test(s)) s = `'${s}`; // evita formula ao abrir exportacao no Excel
    return `"${s.replaceAll('"', '""')}"`;
  };
  return '\ufeff' + [columns.map(cell).join(';'), ...rows.map((r) => columns.map((k) => cell(r[k])).join(';'))].join('\r\n') + '\r\n';
}
const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function html(report) {
  const table = (rows, keys) => rows.length ? `<div class="scroll"><table><thead><tr>${keys.map((k) => `<th>${escapeHtml(k)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${keys.map((k) => `<td>${escapeHtml(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p>Sem amostras neste recorte.</p>';
  const m = report.manifesto;
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Auditoria de tempos das solicitacoes</title>
<style>body{font:14px system-ui;max-width:1300px;margin:32px auto;padding:0 24px;color:#17212e}h1{font-size:25px}h2{font-size:19px;margin-top:32px}table{border-collapse:collapse;width:100%;font-size:12px}td,th{padding:7px;border:1px solid #d8dde4;text-align:left}th{background:#edf0f3}.scroll{overflow:auto}li{margin:8px 0}code{background:#f1f3f5;padding:2px 4px}</style>
<h1>Auditoria de tempos das solicitacoes</h1>
${m.demonstracao_sintetica ? '<p><strong>DEMONSTRACAO COM DADOS SINTETICOS. Nao representa o banco ou desempenho de usuarios reais.</strong></p>' : ''}
<p>Intervalo: ${escapeHtml(m.inicio_inclusivo)} ate ${escapeHtml(m.fim_exclusivo)} (fim exclusivo; ${m.referencia_horarios === 'HORARIO_SERVIDOR_SEM_CONVERSAO' ? 'horarios do servidor, sem conversao' : 'timestamps em UTC'}).
${m.solicitacoes_no_relatorio} solicitacoes, ${m.passagens} passagens, ${m.passagens_base_estrita} passagens na base estrita.</p>
<p>As duracoes sao horas corridas entre evidencias. Nao representam horas trabalhadas ou avaliacao individual de produtividade.
Sem primeira interacao observada e diferente de uma resposta em zero horas. Passagens abertas sao censuradas, nao concluidas.</p>
<h2>Qualidade e cobertura</h2><ul>${m.ressalvas.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
<p>${report.qualidade.length} apontamentos em <code>qualidade.csv</code>. Confira tambem <code>manifesto.json</code> antes de comparar setores ou usuarios.</p>
<h2>Tempos por setor</h2>${table(report.resumo_setor, ['setor', 'confiavel_para_resumo', 'registros', 'censuradas', 'sem_primeira_interacao', 'primeira_interacao_h_amostras', 'primeira_interacao_h_p50_h', 'primeira_interacao_h_p90_h', 'permanencia_h_amostras', 'permanencia_h_p50_h', 'permanencia_h_p90_h'])}
<h2>Passagens ainda abertas</h2><p>Primeiras 100 por idade observada; lista completa em pendencias.csv. Idade nao significa prazo vencido.</p>${table(report.pendencias.slice(0, 100), ['codigo', 'setor', 'entrada', 'idade_observada_h', 'primeira_interacao_setor', 'espera_sem_interacao_h', 'alertas'])}
<h2>Arquivos para investigacao</h2><ul>${Object.keys(report).filter((k) => Array.isArray(report[k])).map((k) => `<li><a href="${k}.csv">${k}.csv</a> (${report[k].length} registros)</li>`).join('')}</ul>
<p>O POP de prazos foi catalogado como referencia. Nenhum prazo foi aplicado retroativamente; etapa sem prazo, aprovacao, retorno e feriados exigem definicao antes do futuro contador.</p>
</html>`;
}
function outputDirectory(value) {
  const dir = path.resolve(ROOT, value || `outputs/auditoria-tempos-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const relative = path.relative(ROOT, dir);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Saida deve ser um novo diretorio dentro do repositorio.');
  if (fs.existsSync(dir)) throw new Error('Diretorio de saida ja existe; nao sobrescrever auditoria anterior.');
  let parent = path.dirname(dir);
  while (!fs.existsSync(parent)) parent = path.dirname(parent);
  const realParent = fs.realpathSync(parent);
  const relParent = path.relative(fs.realpathSync(ROOT), realParent);
  if (relParent.startsWith('..') || path.isAbsolute(relParent)) throw new Error('Saida via link fora do repositorio recusada.');
  return dir;
}
function save(report, dir, queries) {
  fs.mkdirSync(dir, { recursive: true });
  // Entrega atomica logica: CONCLUIDO so aparece depois de todos os arquivos.
  for (const [key, value] of Object.entries(report)) {
    if (Array.isArray(value)) fs.writeFileSync(path.join(dir, `${key}.csv`), csv(value), 'utf8');
  }
  fs.writeFileSync(path.join(dir, 'manifesto.json'), JSON.stringify(report.manifesto, null, 2));
  fs.writeFileSync(path.join(dir, 'relatorio.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(dir, 'relatorio.html'), html(report));
  if (queries) fs.writeFileSync(path.join(dir, 'consultas.json'), JSON.stringify(queries, null, 2));
  const hashes = fs.readdirSync(dir).sort().map((name) => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex')}  ${name}`).join('\n');
  fs.writeFileSync(path.join(dir, 'SHA256SUMS.txt'), hashes + '\n');
  fs.writeFileSync(path.join(dir, 'CONCLUIDO.txt'), 'Extracao e analise concluidas. Confira manifesto e qualidade antes de interpretar.\n');
}
function codeHashes() {
  return Object.fromEntries([__filename, path.join(__dirname, 'auditoriaTemposSolicitacoes/engine.js'), path.join(__dirname, 'auditoriaTemposSolicitacoes/extracao.js')]
    .map((file) => [path.basename(file), crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
}
function saveExtraction(data, manifest, dir, queries) {
  if (date(data.corte_servidor, 'servidor') == null) throw new Error('Extracao completa exige horario de corte valido do servidor.');
  if (!Array.isArray(data.solicitacoes) || !Array.isArray(data.historicos)) throw new Error('Extracao precisa conter solicitacoes e historicos.');
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.mkdirSync(dir, { mode: 0o700 }); // falha se ja existir; nunca sobrescreve uma extracao
  const write = (name, value) => fs.writeFileSync(path.join(dir, name), value, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  const fullManifest = { formato: 'FLUXY_TEMPOS_V1', escopo: 'HISTORICO_COMPLETO',
    referencia_horarios: 'HORARIO_SERVIDOR_SEM_CONVERSAO', corte_servidor: data.corte_servidor,
    gerado_em: new Date().toISOString(), demonstracao_sintetica: data.sintetico === true,
    codigo_sha256: codeHashes(), ...manifest };
  write('historico.json', JSON.stringify({ ...data, manifesto_extracao: fullManifest }));
  write('manifesto.json', JSON.stringify(fullManifest, null, 2));
  write('consultas.json', JSON.stringify(queries || [], null, 2));
  const hashes = ['historico.json', 'manifesto.json', 'consultas.json'].map((name) =>
    `${crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex')}  ${name}`);
  write('SHA256SUMS.txt', hashes.join('\n') + '\n');
  write('CONCLUIDO.txt', 'Extracao concluida. Analise offline ainda nao executada. Enviar somente este diretorio.\n');
}
function sqlDate(instant, offset) {
  const sign = offset[0] === '-' ? -1 : 1;
  const minutes = sign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6)));
  return new Date(instant + minutes * 60000).toISOString().slice(0, 23).replace('T', ' ');
}
async function main(argv = process.argv.slice(2)) {
  const a = args(argv);
  if (a.help || !argv.length) { console.log(HELP); return; }
  if (Boolean(a.entrada) === Boolean(a['consultar-banco'])) throw new Error('Escolha apenas --entrada ou --consultar-banco.');
  const fullHistory = a['historico-completo'] === true;
  if (a['historico-completo'] != null && !fullHistory) throw new Error('Use --historico-completo sem valor.');
  const onlyExtract = a['somente-extrair'] === true;
  if (a['somente-extrair'] != null && !onlyExtract) throw new Error('Use --somente-extrair sem valor.');
  if (onlyExtract && (!a['consultar-banco'] || !fullHistory)) throw new Error('--somente-extrair exige --consultar-banco e --historico-completo.');
  const dbOffset = a['fuso-banco'];
  let since, until;
  if (fullHistory) {
    if (['de', 'ate', 'ids', 'feriados'].some((k) => Object.hasOwn(a, k))) throw new Error('Historico completo nao aceita recortes de data, IDs ou calendario.');
    if (dbOffset !== 'servidor') throw new Error('Historico completo usa --fuso-banco=servidor.');
  } else {
    for (const key of ['de', 'ate']) if (typeof a[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(a[key]) || new Date(`${a[key]}T00:00:00Z`).toISOString().slice(0, 10) !== a[key]) throw new Error('Datas validas obrigatorias: --de e --ate em YYYY-MM-DD.');
    if (a.de < '2020-01-01') throw new Error('Calendario UTC-03 validado para 2020 em diante. Periodos anteriores exigem tratar horario de verao.');
    if (!['+00:00', '-03:00'].includes(dbOffset)) throw new Error('Confirme --fuso-banco=+00:00 ou -03:00; nenhum fuso e presumido.');
    since = `${a.de}T00:00:00-03:00`; until = `${a.ate}T00:00:00-03:00`;
    if (date(until) <= date(since) || date(until) > Date.now()) throw new Error('Fim deve ser posterior ao inicio e nao pode estar no futuro.');
  }
  const maxRequests = Number(a['max-solicitacoes'] || 20000), maxRows = Number(a['max-linhas'] || 500000);
  if (![maxRequests, maxRows].every((v) => Number.isSafeInteger(v) && v > 0 && v <= 5000000)) throw new Error('Limites invalidos.');
  const requestIds = a.ids ? String(a.ids).split(',') : null;
  if (requestIds && (requestIds.length > 1000 || !requestIds.every((v) => /^\d{1,18}$/.test(v)))) throw new Error('Lista --ids invalida (maximo 1000).');
  const holidays = a.feriados ? JSON.parse(fs.readFileSync(path.resolve(a.feriados), 'utf8')) : [];
  if (!Array.isArray(holidays) || holidays.some((v) => !/^\d{4}-\d{2}-\d{2}$/.test(v))) throw new Error('Feriados devem ser um array JSON de datas.');
  const dir = outputDirectory(a.saida);
  let data, extraction = null, sqlLog = null;
  if (a.entrada) {
    data = JSON.parse(fs.readFileSync(path.resolve(a.entrada), 'utf8'));
    if (!Array.isArray(data.solicitacoes) || !Array.isArray(data.historicos)) throw new Error('Entrada precisa conter solicitacoes e historicos.');
    extraction = data.manifesto_extracao?.extracao || null;
    if (requestIds) data.solicitacoes = data.solicitacoes.filter((r) => requestIds.includes(String(r.id)));
  } else {
    const env = process.env;
    if (!['AUDIT_DB_HOST', 'AUDIT_DB_NAME', 'AUDIT_DB_USER', 'AUDIT_DB_PASSWORD'].every((k) => env[k])) throw new Error('Configure as variaveis AUDIT_DB_* apenas na sessao autorizada.');
    if (a['confirmar-banco'] !== env.AUDIT_DB_NAME) throw new Error('Nome confirmado difere do banco configurado.');
    const mysql = require('mysql2/promise');
    let connection;
    try {
      connection = await mysql.createConnection({ host: env.AUDIT_DB_HOST, database: env.AUDIT_DB_NAME,
        user: env.AUDIT_DB_USER, password: env.AUDIT_DB_PASSWORD, port: Number(env.AUDIT_DB_PORT || 3306),
        ssl: { rejectUnauthorized: true, ...(env.AUDIT_DB_CA_FILE ? { ca: fs.readFileSync(env.AUDIT_DB_CA_FILE) } : {}) },
        connectTimeout: 10000, multipleStatements: false, supportBigNumbers: true, bigNumberStrings: true, dateStrings: true });
      await connection.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await connection.query('SET SESSION MAX_EXECUTION_TIME = 30000');
      if (!fullHistory) await connection.query('SET SESSION time_zone = ?', [dbOffset]);
      await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
      const result = await extract(connection, { maxRequests, maxRows, requestIds, fullHistory,
        ...(!fullHistory ? { sinceSql: sqlDate(date(since), dbOffset), cutoffSql: sqlDate(date(until), dbOffset) } : {}),
        progress: (count) => console.log(`Lidas ${count} solicitacoes em snapshot somente leitura.`) });
      data = result.data; extraction = result.manifest; sqlLog = result.sqlLog;
    } catch (error) {
      // Erros do driver podem conter endpoint, usuario ou SQL: nao reproduzir mensagem bruta.
      if (error.code || error.sql) throw new Error(`Falha de banco (${String(error.code || 'CONSULTA').replace(/[^A-Z0-9_]/g, '')}); nenhuma escrita foi solicitada. Verifique conexao/schema/permissoes com o administrador.`);
      throw error;
    } finally {
      if (connection) {
        try { await connection.query('ROLLBACK'); } catch { throw new Error('Falha ao encerrar snapshot somente leitura; nenhuma escrita foi solicitada.'); }
        finally { try { await connection.end(); } catch { /* nao imprimir endpoint/credenciais em erro do driver */ } }
      }
    }
  }
  if (data.solicitacoes.length > maxRequests || Object.values(data).filter(Array.isArray).reduce((sum, rows) => sum + rows.length, 0) > maxRows) throw new Error('Limite de dados excedido; aumente explicitamente ou delimite o escopo.');
  if (onlyExtract) {
    saveExtraction(data, { extracao: extraction, limites: { maxRequests, maxRows } }, dir, sqlLog);
    console.log(`Extracao concluida: ${path.relative(ROOT, dir)}. Envie historico.json, manifesto, consultas e arquivos de integridade para analise offline.`);
    return;
  }
  const report = analyze(data, { since, until, dbOffset, holidays, fullHistory });
  report.manifesto.extracao = extraction;
  report.manifesto.manifesto_extracao_original = data.manifesto_extracao || null;
  report.manifesto.origem_dados = a.entrada ? 'ARQUIVO_OFFLINE' : 'CONEXAO_DIRETA_READ_ONLY';
  report.manifesto.demonstracao_sintetica = data.sintetico === true;
  report.manifesto.gerado_em = new Date().toISOString();
  report.manifesto.filtro_ids = requestIds;
  report.manifesto.limites = { maxRequests, maxRows };
  report.manifesto.feriados = holidays;
  report.manifesto.codigo_sha256 = codeHashes();
  save(report, dir, sqlLog);
  console.log(`Auditoria concluida: ${path.relative(ROOT, dir)}. Consulte relatorio.html e qualidade.csv.`);
}
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { main, args, csv, html, outputDirectory, sqlDate, save, saveExtraction };
