'use strict';
// Inventario independente do deploy. Executavel por stdin; nao importa a app,
// nao grava arquivos, nao executa migrations, scripts, npm ou restart.
const fs = require('node:fs'), cp = require('node:child_process'), crypto = require('node:crypto');
const BACKEND = '/home/ubuntu/sistema-gestao-solicitacoes-main/backend';
const TARGET = 'fluxy-fiscal-prod', REGION = 'us-east-2', ACCOUNT = '992500432025';
const DAEMON = '/opt/fluxy-node24-pm2/node-v24.22.1-linux-x64/bin/node';
const NODE = '/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node';
const hash = v => crypto.createHash('sha256').update(v).digest('hex');
function check(ok, code) { if (!ok) throw Error(code); }
function run(bin, args, options = {}) {
  const r = cp.spawnSync(bin, args, { encoding: 'utf8', timeout: 15000, maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'], ...options });
  check(!r.error && r.status === 0, 'LEITURA_LOCAL_FALHOU'); return r.stdout;
}
function environment(pid) {
  return Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').filter(Boolean)
    .map(s => { const i = s.indexOf('='); check(i > 0, 'AMBIENTE_INVALIDO'); return [s.slice(0, i), s.slice(i + 1)]; }));
}
function snapshot() {
  const pid = Number(fs.readFileSync('/home/ubuntu/.pm2/pm2.pid', 'utf8').trim());
  check(Number.isSafeInteger(pid) && pid > 1 && fs.readlinkSync(`/proc/${pid}/exe`) === DAEMON, 'DAEMON_NAO_CONFERIDO');
  const raw = run(DAEMON, ['/usr/lib/node_modules/pm2/bin/pm2', 'jlist'], {
    env: { HOME: '/home/ubuntu', PM2_HOME: '/home/ubuntu/.pm2', PATH: '/usr/bin:/bin', LANG: 'C' }
  });
  const list = JSON.parse(raw), expected = {
    'backend-solicitacoes': [BACKEND, NODE],
    'backend-dev': ['/home/ubuntu/sistema-gestao-solicitacoes-dev/backend', '/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node'],
    'fluxy-experience-api': ['/home/ubuntu/fluxy-experience/api', '/home/ubuntu/fluxy-node24-experience/node-v24.22.1-linux-x64/bin/node']
  };
  check(list.length === 3, 'LISTA_PM2_FORA_DO_INVENTARIO');
  const apps = Object.entries(expected).map(([name, [cwd, node]]) => {
    const a = list.filter(p => p.name === name); check(a.length === 1, 'PROCESSO_NAO_UNICO');
    const p = a[0], e = p.pm2_env;
    check(e.status === 'online' && e.pm_cwd === cwd && e.exec_interpreter === node
      && Number.isSafeInteger(p.pid) && p.pid > 1 && fs.readlinkSync(`/proc/${p.pid}/exe`) === node
      && fs.readlinkSync(`/proc/${p.pid}/cwd`) === cwd, 'PROCESSO_OU_NODE_DIFERENTE');
    check(run(node, ['--version']).trim() === 'v24.22.1', 'VERSAO_DIFERENTE');
    const stat = fs.readFileSync(`/proc/${p.pid}/stat`, 'utf8').replace(/^.*\) /, '').split(' ');
    return { name, pid: p.pid, start: stat[19], node, env: hash(fs.readFileSync(`/proc/${p.pid}/environ`)),
      envFile: hash(fs.readFileSync(`${cwd}/.env`)), restarts: e.restart_time };
  });
  const files = ['/home/ubuntu/.pm2/dump.pm2', '/home/ubuntu/.pm2/dump.pm2.bak', '/usr/bin/node',
    '/etc/systemd/system/pm2-ubuntu.service', DAEMON, ...apps.map(a => a.node)];
  const persisted = files.map(f => { const s = fs.statSync(f); return [f, hash(fs.readFileSync(f)), s.mode, s.uid]; });
  check(Number(fs.readFileSync('/home/ubuntu/.pm2/pm2.pid', 'utf8').trim()) === pid, 'DAEMON_MUDOU');
  return { pid, apps, persisted };
}

// Funcao autocontida para filho com ambiente inicial da app (IPC removido).
// Dependencias podem ser injetadas pelo QA, sem acesso a AWS/RDS reais.
async function probe(options, deps) {
  const out = { outcome: 'FISCAL_S3_PRODUCAO_INVENTARIO_SOMENTE_LEITURA',
    bucket_alvo: options.bucket, regiao_alvo: options.region, chamadas_nsdocs: 0,
    gravacoes_s3: 0, alteracoes_banco: 0, reinicios: 0, liberado_para_aplicar: false, pendencias: [] };
  const fail = code => { throw Error(code); };
  const need = (ok, code) => { if (!ok) fail(code); };
  const safeCode = e => /^[A-Za-z][A-Za-z0-9_]{0,80}$/.test(e?.name || '') ? e.name : 'CONSULTA_NAO_CONCLUIDA';
  const d = deps || (() => {
    const fs = require('node:fs'), { createRequire } = require('node:module');
    const req = createRequire(options.backend + '/package.json');
    const Handler = req('@smithy/node-http-handler').NodeHttpHandler;
    return { read: f => fs.readFileSync(f, 'utf8'), isFile: f => fs.statSync(f).isFile(),
      parse: req('dotenv').parse, initial: process.env, mysql: req('mysql2/promise'),
      s3: req('@aws-sdk/client-s3'), Handler,
      async identity(credentials) {
        // nested-clients/sts instalado nao inclui GetCallerIdentityCommand.
        // Assinar somente a Query fixa oficial; sem novas dependencias/retries.
        const { SignatureV4 } = req('@smithy/signature-v4'), { Hash } = req('@smithy/hash-node');
        const { HttpRequest } = req('@smithy/protocol-http');
        const signer = new SignatureV4({ credentials, region: 'us-east-2', service: 'sts', sha256: Hash.bind(null, 'sha256') });
        const request = await signer.sign(new HttpRequest({ protocol: 'https:', hostname: 'sts.us-east-2.amazonaws.com',
          method: 'POST', path: '/', headers: { host: 'sts.us-east-2.amazonaws.com',
            'content-type': 'application/x-www-form-urlencoded; charset=utf-8' },
          body: 'Action=GetCallerIdentity&Version=2011-06-15' }));
        const handler = new Handler({ connectionTimeout: 5000, requestTimeout: 10000 });
        try {
          const { response } = await handler.handle(request, { abortSignal: AbortSignal.timeout(15000) });
          let size = 0; const chunks = [];
          for await (const chunk of response.body) { const b = Buffer.from(chunk); size += b.length; need(size <= 262144, 'STS_RESPOSTA_EXCESSIVA'); chunks.push(b); }
          need(response.statusCode === 200, 'STS_IDENTIDADE_RECUSADA');
          const xml = Buffer.concat(chunks).toString('utf8');
          return { Account: /<Account>(\d{12})<\/Account>/.exec(xml)?.[1], Arn: /<Arn>([^<]+)<\/Arn>/.exec(xml)?.[1] };
        } finally { handler.destroy(); }
      } };
  })();
  const initial = d.initial, file = d.parse(d.read(options.backend + '/.env'));
  const e = { ...file, ...initial }; // dotenv nao sobrepoe ambiente inicial.
  need(!e.NODE_OPTIONS && e.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'HOOK_OU_TLS_INSEGURO');
  const envKeys = ['DB_HOST','DB_NAME','DB_PORT','DB_USER','DB_PASSWORD','DB_PASS','DB_SSL_CA_FILE',
    'DEPLOYMENT_ENV','PORT','FISCAL_S3_BUCKET','FISCAL_S3_REGION','FISCAL_S3_PREFIX','FISCAL_ENV',
    'AWS_REGION','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN'];
  const conflicts = envKeys.filter(k => initial[k] !== undefined && file[k] !== undefined && initial[k] !== file[k]);
  out.configuracao = { conflito_arquivo_ambiente: conflicts.length > 0,
    campos_divergentes: conflicts, credencial_estatica_completa: Boolean(e.AWS_ACCESS_KEY_ID && e.AWS_SECRET_ACCESS_KEY),
    token_temporario_presente: Boolean(e.AWS_SESSION_TOKEN),
    role_fiscal_configurada: Boolean(e.FISCAL_S3_ROLE_ARN),
    modulo_fiscal_habilitado: e.FISCAL_MODULE_ENABLED === 'true',
    sefaz_habilitada: e.FISCAL_SEFAZ_ENABLED === 'true',
    flag_nsdocs_v2_habilitada: e.NSDOCS_V2_ENABLED === 'true',
    bucket_atual: /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(e.FISCAL_S3_BUCKET || '') ? e.FISCAL_S3_BUCKET : null,
    bucket_atual_e_alvo: e.FISCAL_S3_BUCKET === options.bucket,
    regiao_atual_e_alvo: (e.FISCAL_S3_REGION || e.AWS_REGION) === options.region,
    prefixo_classificacao: /^prod(?:\/|$)/.test(e.FISCAL_S3_PREFIX || e.FISCAL_ENV || 'dev') ? 'producao'
      : /^dev(?:\/|$)/.test(e.FISCAL_S3_PREFIX || e.FISCAL_ENV || 'dev') ? 'dev_ou_padrao_dev' : 'outro' };
  if (conflicts.length) out.pendencias.push('CONFIGURACAO_DIVERGENTE');
  need(e.DEPLOYMENT_ENV === 'production' && Number(e.PORT) === 8000
    && e.DB_HOST === 'gestao-solicitacoes-db.cn820k66sdx7.us-east-2.rds.amazonaws.com'
    && e.DB_NAME === 'gestao_solicitacoes' && Number(e.DB_PORT || 3306) === 3306, 'IDENTIDADE_CONFIG_PROD_DIFERENTE');
  need(String(e.DB_SSL_CA_FILE || '').startsWith('/') && d.isFile(e.DB_SSL_CA_FILE), 'CA_PROD_NAO_CONFERIDA');
  let connection;
  try {
    connection = await d.mysql.createConnection({ host: e.DB_HOST, port: Number(e.DB_PORT || 3306), user: e.DB_USER,
      password: e.DB_PASSWORD || e.DB_PASS, database: e.DB_NAME, connectTimeout: 10000, multipleStatements: false,
      ssl: { ca: d.read(e.DB_SSL_CA_FILE), rejectUnauthorized: true, verifyIdentity: true } });
    const query = async (sql, values = []) => (await connection.query({ sql, values, timeout: 10000 }))[0];
    const ids = await query('SELECT @@GLOBAL.server_uuid AS uuid, DATABASE() AS banco');
    need(ids[0]?.uuid === '5ed4b970-009f-11f1-809c-0ad0e0c90c53' && ids[0]?.banco === 'gestao_solicitacoes', 'UUID_PROD_DIFERENTE');
    const tls = await query("SHOW SESSION STATUS WHERE Variable_name IN ('Ssl_cipher','Ssl_version')");
    need(tls.some(r => r.Variable_name === 'Ssl_cipher' && r.Value)
      && tls.some(r => r.Variable_name === 'Ssl_version' && /^TLSv1\.[23]$/.test(r.Value)), 'TLS_PROD_NAO_CONFERIDO');
    await query('SET TRANSACTION READ ONLY'); await connection.beginTransaction();
    const columns = await query("SELECT TABLE_NAME AS tabela, COLUMN_NAME AS coluna FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name IN ('fiscal_dfe_documents','fiscal_dfe_events','fiscal_sync_logs','fiscal_accounting_batches','fiscal_certificates','fiscal_companies','fiscal_document_links','schema_migrations')");
    const has = (table, column) => columns.some(c => c.tabela === table && c.coluna === column);
    const refs = {
      fiscal_dfe_documents: ['xml_storage_key','pdf_storage_key','danfe_storage_key'],
      fiscal_dfe_events: ['raw_event_xml_storage_key'], fiscal_sync_logs: ['raw_request_storage_key','raw_response_storage_key'],
      fiscal_accounting_batches: ['zip_storage_key','report_storage_key'], fiscal_certificates: ['certificate_s3_key_encrypted']
    };
    out.storage_referencias = []; let total = 0;
    for (const [table, keys] of Object.entries(refs)) for (const key of keys) {
      if (!has(table, key)) { out.pendencias.push('SCHEMA_STORAGE_INCOMPLETO'); continue; }
      const rows = await query(`SELECT COUNT(*) AS total FROM \`${table}\` WHERE \`${key}\` IS NOT NULL AND LENGTH(TRIM(\`${key}\`)) > 0`);
      const count = Number(rows[0]?.total); need(Number.isSafeInteger(count) && count >= 0, 'CONTAGEM_INVALIDA');
      out.storage_referencias.push({ tabela: table, campo: key, quantidade: count }); total += count;
    }
    out.referencias_existentes = total;
    out.troca_bucket_exige_reconciliacao = total > 0 && e.FISCAL_S3_BUCKET !== options.bucket;
    if (out.troca_bucket_exige_reconciliacao) out.pendencias.push('NAO_TROCAR_BUCKET_COM_REFERENCIAS_EXISTENTES');
    if (has('fiscal_companies','empresa_id')) {
      const rows = await query("SELECT id, empresa_id, uf, ativo, modulo_fiscal_habilitado FROM fiscal_companies WHERE REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','') = ?", ['27123008000100']);
      out.cadastro_fiscal_empresa = rows; // Nenhum certificado ou segredo cadastral.
    } else out.pendencias.push('CADASTRO_FISCAL_NAO_CONFERIDO');
    out.empresas_operacionais_cnpj = await query("SELECT id, ativo FROM empresas_grupo WHERE REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','') = ?", ['27123008000100']);
    out.schema_vinculos = { purchase_link_key: has('fiscal_document_links','purchase_link_key'),
      allocated_value: has('fiscal_document_links','allocated_value') };
    const indexes = await query("SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='fiscal_document_links' AND INDEX_NAME='ux_fiscal_purchase_link' ORDER BY SEQ_IN_INDEX");
    out.schema_vinculos.indice_unico_completo = indexes.length === 2
      && indexes.every(i => Number(i.NON_UNIQUE) === 0 && i.SUB_PART == null)
      && indexes.map(i => i.COLUMN_NAME).join(',') === 'fiscal_dfe_document_id,purchase_link_key';
    if (has('schema_migrations','name')) {
      const rows = await query('SELECT name FROM schema_migrations WHERE name = ?', ['202610240002_fiscal_vinculos_pedidos.js']);
      out.schema_vinculos.migration_registrada = rows.length === 1;
    }
  } finally { if (connection) { try { await connection.rollback(); } finally { await connection.end(); } } }
  // Reproduz apenas a origem estatica do cliente fiscal atual. Nao executa
  // credential_process, perfis, IMDS, AssumeRole ou chaves novas nesta auditoria.
  if (!e.AWS_ACCESS_KEY_ID || !e.AWS_SECRET_ACCESS_KEY || e.AWS_SESSION_TOKEN || e.FISCAL_S3_ROLE_ARN) {
    out.pendencias.push('ORIGEM_CREDENCIAL_EXIGE_CONFERENCIA_ESPECIFICA'); return out;
  }
  const credentials = { accessKeyId: e.AWS_ACCESS_KEY_ID, secretAccessKey: e.AWS_SECRET_ACCESS_KEY };
  const config = { region: options.region, credentials, maxAttempts: 1,
    requestHandler: new d.Handler({ connectionTimeout: 5000, requestTimeout: 10000 }) };
  try {
    const identity = await d.identity(credentials);
    need(identity.Account === options.account && /^arn:aws:(?:iam|sts)::\d{12}:(?:user|role|assumed-role)\/[A-Za-z0-9+=,.@_\/-]+$/.test(identity.Arn || ''), 'IDENTIDADE_AWS_DIFERENTE');
    out.aws = { conta: identity.Account, arn: identity.Arn };
  } catch (err) { out.pendencias.push('IDENTIDADE_AWS_NAO_CONFERIDA'); out.aws = { erro: safeCode(err) }; return out; }
  const client = new d.s3.S3Client({ ...config, endpoint: 'https://s3.us-east-2.amazonaws.com' });
  const input = { Bucket: options.bucket, ExpectedBucketOwner: options.account };
  const definitions = [
    ['regiao', 'GetBucketLocationCommand', r => ({ confere: (r.LocationConstraint || 'us-east-1') === options.region })],
    ['acesso_publico', 'GetPublicAccessBlockCommand', r => ({ bloqueio_integral: ['BlockPublicAcls','IgnorePublicAcls','BlockPublicPolicy','RestrictPublicBuckets'].every(k => r.PublicAccessBlockConfiguration?.[k] === true) })],
    ['politica_publica', 'GetBucketPolicyStatusCommand', r => ({ publica: r.PolicyStatus?.IsPublic, verificada: typeof r.PolicyStatus?.IsPublic === 'boolean' })],
    ['propriedade', 'GetBucketOwnershipControlsCommand', r => ({ acls_desabilitadas: r.OwnershipControls?.Rules?.some(v => v.ObjectOwnership === 'BucketOwnerEnforced') === true })],
    ['versionamento', 'GetBucketVersioningCommand', r => ({ ativo: r.Status === 'Enabled' })],
    ['criptografia', 'GetBucketEncryptionCommand', r => ({ algoritmos: r.ServerSideEncryptionConfiguration?.Rules?.map(v => v.ApplyServerSideEncryptionByDefault?.SSEAlgorithm).filter(Boolean) || [] })],
    ['transporte', 'GetBucketPolicyCommand', r => {
      const policy = JSON.parse(r.Policy), list = v => Array.isArray(v) ? v : [v];
      const standardDeny = list(policy.Statement).some(s => s?.Effect === 'Deny'
        && (s.Principal === '*' || s.Principal?.AWS === '*') && list(s.Action).includes('s3:*')
        && [false,'false'].includes(s.Condition?.Bool?.['aws:SecureTransport'])
        && Object.keys(s.Condition).length === 1 && Object.keys(s.Condition.Bool).length === 1
        && ['arn:aws:s3:::' + options.bucket, 'arn:aws:s3:::' + options.bucket + '/*'].every(v => list(s.Resource).includes(v)));
      return { deny_http_padrao_reconhecido: standardDeny }; // Nao exibir politica bruta.
    }]
  ];
  out.bucket = {};
  try {
    for (const [name, command, summarize] of definitions) {
      try { out.bucket[name] = { lido: true, ...summarize(await client.send(new d.s3[command](input))) }; }
      catch (err) { out.bucket[name] = { lido: false, erro: safeCode(err) }; out.pendencias.push('BUCKET_' + name.toUpperCase() + '_NAO_CONFERIDO'); }
    }
  } finally { client.destroy(); }
  const b = out.bucket;
  if (!b.regiao?.confere || !b.acesso_publico?.bloqueio_integral || b.politica_publica?.publica !== false
    || !b.propriedade?.acls_desabilitadas || !b.versionamento?.ativo
    || !b.criptografia?.algoritmos?.length || !b.transporte?.deny_http_padrao_reconhecido) {
    out.pendencias.push('PROTECOES_BUCKET_EXIGEM_CONFERENCIA');
  }
  // Acesso negado nao equivale a bucket seguro. Mesmo leituras aprovadas nao
  // comprovam Put/Get de objetos ou autorizam troca de storage/migration/deploy.
  out.permissoes_objetos_testadas = false;
  out.pendencias = [...new Set(out.pendencias)];
  return out;
}
async function main() {
  check(process.platform === 'linux' && process.arch === 'x64' && process.getuid() === 1000
    && process.version === 'v24.22.1' && fs.realpathSync(process.execPath) === NODE
    && fs.realpathSync(process.cwd()) === BACKEND, 'EXIGE_USUARIO_UBUNTU_NODE_CWD_PROD');
  console.log('CONFERENCIA_FISCAL_S3_PRODUCAO_INICIADA_SOMENTE_LEITURA');
  const before = snapshot(), prod = before.apps.find(a => a.name === 'backend-solicitacoes');
  const env = environment(prod.pid);
  check(!env.NODE_OPTIONS && env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'AMBIENTE_NODE_NAO_CONFERIDO');
  for (const k of ['NODE_CHANNEL_FD','NODE_CHANNEL_SERIALIZATION_MODE','NODE_UNIQUE_ID']) delete env[k];
  const options = { backend: BACKEND, bucket: TARGET, region: REGION, account: ACCOUNT };
  const code = `(${probe.toString()})(${JSON.stringify(options)}).then(r=>console.log('FISCAL_RESULT:'+JSON.stringify(r))).catch(()=>{console.error('CONFERENCIA_PRIVADA_FALHOU_SEM_EXIBIR_SEGREDOS');process.exitCode=1;});`;
  let result, error;
  try {
    const output = run(NODE, ['-e', code], { cwd: BACKEND, env, timeout: 180000 });
    const lines = output.split(/\r?\n/).filter(l => l.startsWith('FISCAL_RESULT:'));
    check(lines.length === 1, 'RESULTADO_NAO_CONFERIDO'); result = JSON.parse(lines[0].slice(14));
  } catch (e) { error = e; }
  const after = snapshot();
  check(JSON.stringify(before) === JSON.stringify(after), 'ESTADO_MUDOU_DURANTE_CONFERENCIA');
  if (error) throw error;
  result.processos_nodes_ambientes_daemon_dumps_preservados = true;
  console.log(JSON.stringify(result, null, 2));
  console.log('CONFERENCIA_CONCLUIDA_SEM_ESCRITAS_OU_REINICIOS. NAO_LIBERA_DEPLOY_OU_TROCA_DE_BUCKET.');
}
if (require.main === module || process.argv[1] === '-') main().catch(() => {
  console.error('CONFERENCIA_FISCAL_S3_INTERROMPIDA_SEM_EXIBIR_SEGREDOS. Nao contorne protecoes.'); process.exitCode = 1;
});
module.exports = { probe, TARGET, REGION, ACCOUNT, BACKEND };
