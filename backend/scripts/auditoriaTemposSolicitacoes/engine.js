'use strict';

// Motor offline. Nao importa models, configuracao, servidor ou drivers de banco.
const HOUR = 3600000;
const TERMINAIS = new Set(['FINALIZADA', 'FINALIZADO', 'CONCLUIDA', 'CONCLUIDO', 'ENCERRADA', 'ENCERRADO', 'CANCELADA', 'CANCELADO']);
const token = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
const id = (value) => value == null || value === '' ? null : String(value);
const round = (n) => n == null ? null : Math.round(n * 10000) / 10000;
const hours = (a, b) => a == null || b == null || b < a ? null : round((b - a) / HOUR);
const flag = (value) => value === true || value === 1 || ['1', 'true'].includes(String(value).trim().toLowerCase());
// Um status de pedido/cotacao/medicao nao encerra a solicitacao principal.
const rootLifecycle = (e) => !e.medicao_id && !/^(PEDIDO_|COTACAO_|SOLICITACAO_COMPRA_|PRIORIDADE_)/.test(e.acao);
function date(value, offset) {
  if (!value) return null;
  const raw = String(value).replace(' ', 'T');
  if (offset === 'servidor') {
    // Eixo numerico neutro para subtrair horarios locais. Nao afirma que sejam UTC.
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?$/.test(raw)) return null;
    const n = Date.parse(`${raw}Z`);
    return Number.isFinite(n) && new Date(n).toISOString().slice(0, 19) === raw.slice(0, 19) ? n : null;
  }
  const n = Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(raw) ? raw : `${raw}${offset}`);
  return Number.isFinite(n) ? n : null;
}
function json(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || '{}') || {}; } catch { return {}; }
}
function stats(values) {
  const xs = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const percentile = (p) => xs.length ? round(xs[Math.max(0, Math.ceil(xs.length * p) - 1)]) : null;
  return { amostras: xs.length, media_h: xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : null,
    p50_h: percentile(.5), p75_h: percentile(.75), p90_h: percentile(.9), p95_h: percentile(.95), max_h: xs.at(-1) ?? null };
}
function sectorResolver(setores) {
  const map = new Map();
  for (const s of setores || []) {
    const key = token(s.codigo || s.nome || s.id);
    if (s.nome != null && !map.has(token(s.nome))) map.set(token(s.nome), key);
  }
  // Codigo e ID tem precedencia sobre nomes: COMPRAS pode ser nome de COMPRAS-1.
  for (const s of setores || []) for (const value of [s.codigo, s.id]) {
    if (value != null) map.set(token(value), token(s.codigo || s.nome || s.id));
  }
  return (value) => {
    const key = token(value);
    if (!key || key === 'NAO_INFORMADO') return null;
    const resolved = map.get(key) || key;
    return ['GERENCIA_PROCESSOS', 'GERENCIA_DE_PROCESSOS'].includes(resolved) ? 'GEO' : resolved;
  };
}
function family(action) {
  const a = token(action);
  if (/ENVIADA_SETOR|ENCAMINHADA|ENVIO_SETOR/.test(a)) return 'ENCAMINHAMENTO';
  if (/COMENT|COMMENT/.test(a)) return 'COMENTARIO';
  if (/ANEX|UPLOAD/.test(a)) return 'ANEXO';
  if (/STATUS/.test(a)) return 'STATUS';
  if (/RESPONSAVEL|ASSIGN|DELEG/.test(a)) return 'RESPONSAVEL';
  if (/APROV|APPROVE/.test(a)) return 'APROVACAO';
  if (/CANCEL|EXCLU|DELETE/.test(a)) return 'EXCLUSAO';
  if (/CRIAD|CREATE|CADASTR/.test(a)) return 'CRIACAO';
  return a;
}
function governanceRoot(g, maps) {
  const route = String(g.rota_padrao || '').replace(/^\/api(?=\/)/, '');
  // O extrator HTTP grava o ULTIMO ID da URL. Duas ocorrencias de :id sao ambiguas.
  if ((route.match(/:id/g) || []).length > 1 || /:uuid|:token/.test(route)) return null;
  const routes = [
    [/^\/solicitacoes\/:id(?:\/|$)/, 'solicitacoes'],
    [/^\/(?:compras\/solicitacoes|solicitacoes-compra)\/:id(?:\/|$)/, 'solicitacoes-compra'],
    [/^\/(?:compras\/pedidos|pedidos-compra)\/:id(?:\/|$)/, 'pedidos-compra'],
    [/^\/financeiro\/titulos\/:id(?:\/|$)/, 'financeiro.titulos'],
    [/^\/financeiro\/fila-pagamentos\/:id(?:\/|$)/, 'fila'],
    [/^\/contratos\/:id(?:\/|$)/, 'contratos']
  ];
  const match = routes.find(([re]) => re.test(route));
  if (match) return maps[match[1]]?.get(id(g.recurso_id));
  // Criacao, navegacao ou upload com recurso explicitamente associado.
  return maps[g.recurso_tipo]?.get(id(g.recurso_id)) || null;
}
function normalize(data, options) {
  const sector = sectorResolver(data.setores);
  const events = [], problems = [];
  const rootIds = new Set(data.solicitacoes.map((r) => id(r.id)));
  const linked = (rows, field) => new Map((rows || []).map((r) => [id(r.id), id(r[field])]));
  const compras = linked(data.compras, 'solicitacao_principal_id');
  const pedidos = new Map((data.pedidos || []).map((r) => [id(r.id), compras.get(id(r.solicitacao_compra_id))]));
  const titulos = linked(data.titulos, 'solicitacao_id');
  const anexos = linked(data.anexos, 'solicitacao_id');
  const fila = new Map((data.fila || []).map((r) => [id(r.id), titulos.get(id(r.titulo_financeiro_id))]));
  const maps = { solicitacoes: new Map([...rootIds].map((v) => [v, v])), 'solicitacoes-compra': compras,
    'compras.solicitacoes': compras, 'pedidos-compra': pedidos, 'compras.pedidos': pedidos,
    'financeiro.titulos': titulos, anexos, fila, contratos: linked(data.contratos, 'solicitacao_id') };
  const add = (source, row, extras = {}) => {
    const t = date(row.createdAt, options.dbOffset);
    const sid = id(extras.solicitacao_id ?? row.solicitacao_id);
    if (!rootIds.has(sid)) return;
    if (t == null) { problems.push({ solicitacao_id: sid, fonte: source, registro_id: id(row.id), problema: 'DATA_INVALIDA' }); return; }
    if (t >= options.until) return;
    const e = { key: `${source}:${row.id}`, fonte: source, registro_id: id(row.id), solicitacao_id: sid, t,
      ator_id: null, ator_real_id: null, setor_ator: null, base_setor_ator: null, responsavel_id: null,
      acao: token(row.acao), familia: family(row.acao), categoria: 'OPERACAO', resultado: 'SUCCESS',
      automatica: false, origem: null, from: null, to: null, status: row.status_novo || null,
      replica_de: null, campos: null, medicao_id: id(row.medicao_id), ...extras };
    events.push(e);
    return e;
  };
  for (const h of data.historicos || []) {
    const m = json(h.metadata), action = token(h.acao);
    const assigned = ['RESPONSAVEL_ATRIBUIDO', 'RESPONSAVEL_REMOVIDO'].includes(action);
    // O destinatario de uma atribuicao NAO e o autor da interacao.
    const actor = id(m.ator_id ?? (assigned ? null : h.usuario_responsavel_id));
    let from = sector(m.setor_origem ?? m.area_anterior), to = sector(m.setor_destino ?? m.area_nova);
    if (action === 'ENVIADA_SETOR') {
      const match = /^De (.+?) para (.+)$/i.exec(String(h.observacao || '').trim());
      from ||= sector(match?.[1]);
      to ||= sector(match?.[2]) || sector(h.setor);
    } else if (!['SOLICITACAO_APROVADA_ENCAMINHADA', 'SOLICITACAO_COMPRA_ENCAMINHADA_COMPRAS'].includes(action)) {
      from = null; to = null; // metadata de outro evento nao cria passagem extra.
    }
    const automated = flag(h.automatica) || flag(m.retorno_automatico_baixa) || flag(m.automatico) || flag(m.automacao)
      || /AUTOMAT|SISTEMA|FILA_PAGAMENTOS/.test(token(m.origem)) || /AUTOMATIC/.test(action) || action === 'RESPONSAVEL_REMOVIDO';
    const e = add('historicos', h, { ator_id: actor, setor_ator: from || (to ? null : sector(h.setor)),
      base_setor_ator: from ? 'ORIGEM_ENCAMINHAMENTO' : (to ? null : 'CONTEXTO_HISTORICO'),
      responsavel_id: assigned ? id(m.responsavel_id ?? h.usuario_responsavel_id) : null,
      automatica: automated, origem: token(m.origem) || null, from, to,
      categoria: ['SOLICITACAO_CRIADA', 'CRIADA'].includes(action) ? 'ABERTURA' : 'OPERACAO' });
    if (e && action === 'CRIADA') { e.setor_inicial = sector(h.setor); e.setor_ator = null; e.base_setor_ator = null; }
    if (e && assigned && !actor) problems.push({ solicitacao_id: e.solicitacao_id, fonte: e.fonte, registro_id: e.registro_id, problema: 'ATRIBUICAO_SEM_ATOR' });
  }
  for (const g of data.operacionais || []) {
    const sid = governanceRoot(g, maps);
    if (!sid) {
      problems.push({ solicitacao_id: null, fonte: 'governanca', registro_id: id(g.id), problema: 'RECURSO_NAO_VINCULADO_OU_URL_AMBIGUA', recurso_tipo: g.recurso_tipo });
      continue;
    }
    const m = json(g.metadata_json);
    const e = add('governanca', { ...g, createdAt: g.ocorrido_em, acao: g.tipo_evento }, {
      solicitacao_id: sid, ator_id: id(g.usuario_id), ator_real_id: id(m.actor_id),
      setor_ator: sector(g.setor_id), base_setor_ator: 'SNAPSHOT_AUDITORIA',
      categoria: g.categoria === 'NAVEGACAO' ? 'LEITURA' : g.categoria,
      resultado: g.resultado, status: m.status_destino || null,
      // Campos tecnicos somente, nunca valores dos formularios.
      campos: [...(Array.isArray(m.campos_alterados) ? m.campos_alterados : []), ...(Array.isArray(m.campos_informados) ? m.campos_informados : [])]
        .filter((s) => /^[a-zA-Z_][a-zA-Z0-9_]{0,59}$/.test(s) && !/senha|password|token|secret|chave|pix|cpf|cnpj|conta|agencia|documento|arquivo|anexo|conteudo|body/i.test(s)).join('|'),
      origem: m.dev_user_switch ? 'TROCA_USUARIO_DEV' : 'HTTP', recurso_tipo: g.recurso_tipo,
      rota: g.rota_padrao });
    if (e && /\/enviar-setor|\/encaminh/.test(g.rota_padrao || '')) e.familia = 'ENCAMINHAMENTO';
    if (e && /presign|download|export|pdf|arquivar|favorit|notifica|visualiz/.test(g.rota_padrao || '')) e.categoria = 'AUXILIAR';
  }
  for (const a of data.anexos || []) add('anexos', { ...a, acao: 'ANEXO' }, {
    ator_id: id(a.uploaded_by), setor_ator: sector(a.area_origem), base_setor_ator: 'ORIGEM_ANEXO' });
  for (const c of data.compras_logs || []) add('compras_logs', { ...c, acao: c.tipo_acao }, {
    solicitacao_id: compras.get(id(c.solicitacao_compra_id)), ator_id: id(c.usuario_id),
    automatica: !c.usuario_id, origem: !c.usuario_id && c.fornecedor_compra_id ? 'FORNECEDOR' : 'COMPRA' });
  for (const t of data.titulos || []) add('titulos', { ...t, acao: 'TITULO_CRIADO' }, { ator_id: id(t.criado_por), categoria: 'MARCO' });
  for (const m of data.movimentos || []) add('movimentos', { ...m, acao: 'MOVIMENTO_REGISTRADO' }, {
    solicitacao_id: titulos.get(id(m.titulo_financeiro_id)), ator_id: id(m.criado_por), categoria: 'MARCO' });
  for (const c of data.criacoes_auditadas || []) {
    if (c.tipo_evento !== 'SOLICITACAO_CREATED' || c.status !== 'SUCCESS' || c.recurso_tipo !== 'SOLICITACAO') continue;
    add('criacao_auditada', { ...c, acao: c.tipo_evento }, { solicitacao_id: id(c.recurso_id), categoria: 'ABERTURA',
      ator_id: id(c.usuario_id), setor_inicial: sector(json(c.metadata).area_responsavel) });
  }
  const seen = new Set();
  const unique = events.filter((e) => {
    if (seen.has(e.key)) { problems.push({ solicitacao_id: e.solicitacao_id, problema: 'ID_FONTE_REPETIDO', registro_id: e.key }); return false; }
    seen.add(e.key); return true;
  }).sort((a, b) => a.t - b.t || (a.fonte === b.fonte ? String(a.registro_id).localeCompare(String(b.registro_id), 'en', { numeric: true }) : a.fonte.localeCompare(b.fonte)));
  // Somente pares de fontes diferentes com familia conhecida: preserva ambas as evidencias.
  const recent = new Map();
  for (const e of [...unique].sort((a, b) => (a.fonte === 'historicos' ? 0 : 1) - (b.fonte === 'historicos' ? 0 : 1) || a.t - b.t)) {
    if (e.categoria !== 'OPERACAO' || e.resultado !== 'SUCCESS' || !e.ator_id) continue;
    const key = `${e.solicitacao_id}:${e.ator_id}:${e.familia}`;
    const candidates = (recent.get(key) || []).filter((p) => Math.abs(e.t - p.t) <= 2000);
    if (['ENCAMINHAMENTO', 'COMENTARIO', 'ANEXO', 'STATUS', 'RESPONSAVEL', 'APROVACAO'].includes(e.familia)) {
      const counterpart = candidates.find((p) => p.fonte !== e.fonte && !p.replica_de && (p.status || '') === (e.status || ''));
      if (counterpart) { e.replica_de = counterpart.key; e.correlacao_espelho = 'HEURISTICA_2S'; }
    }
    recent.set(key, [...(recent.get(key) || []), e]);
  }
  return { events: unique, problems, sector };
}

// Integral em dias de semana de 24h; NAO e jornada e NAO desconta feriado presumido.
function weekdayHours(start, end, holidays = new Set()) {
  if (start == null || end == null || end < start) return null;
  let sum = 0, cursor = start;
  while (cursor < end) {
    const local = new Date(cursor - 3 * HOUR); // calendario operacional America/Sao_Paulo, 2020+
    const day = local.toISOString().slice(0, 10), dow = local.getUTCDay();
    const next = Date.parse(`${day}T00:00:00-03:00`) + 24 * HOUR;
    const stop = Math.min(end, next);
    if (dow !== 0 && dow !== 6 && !holidays.has(day)) sum += stop - cursor;
    cursor = stop;
  }
  return round(sum / HOUR);
}
function analyze(data, inputOptions) {
  const options = { dbOffset: '+00:00', holidays: [], ...inputOptions };
  const serverClock = options.dbOffset === 'servidor';
  const iso = (value) => value == null ? null : (serverClock ? new Date(value).toISOString().slice(0, -1) : new Date(value).toISOString());
  if (options.fullHistory) {
    if (!serverClock) throw new Error('Historico completo usa --fuso-banco=servidor.');
    options.until = data.corte_servidor;
    if (date(options.until, 'servidor') == null) throw new Error('Historico completo exige corte_servidor valido, sem sufixo de fuso, no JSON extraido.');
    options.since = null;
    for (const s of data.solicitacoes) {
      const t = date(s.createdAt, 'servidor');
      if (t != null && (options.since == null || t < date(options.since, 'servidor'))) options.since = s.createdAt;
    }
    if (options.since == null) options.since = iso(date(options.until, 'servidor') - 1);
  }
  options.since = date(options.since, serverClock ? 'servidor' : '-03:00');
  options.until = date(options.until, serverClock ? 'servidor' : '-03:00');
  if (options.since == null || options.until == null || options.until <= options.since) throw new Error('Intervalo invalido; use inicio inclusivo e fim exclusivo com fuso.');
  const { events, problems, sector } = normalize(data, options);
  const groups = new Map();
  for (const e of events) { if (!groups.has(e.solicitacao_id)) groups.set(e.solicitacao_id, []); groups.get(e.solicitacao_id).push(e); }
  const users = new Map((data.users || []).map((u) => [id(u.id), u.nome]));
  const types = new Map((data.tipos || []).map((t) => [id(t.id), t.nome || t.descricao]));
  const initialStatusByRequest = new Map();
  for (const a of data.status_area || []) {
    const key = id(a.solicitacao_id), t = date(a.createdAt, options.dbOffset);
    if (t != null && (!initialStatusByRequest.has(key) || initialStatusByRequest.get(key).t > t)) initialStatusByRequest.set(key, { ...a, t });
  }
  const passages = [], intervals = [], people = [], flows = [], statusSpans = [];
  const holidays = new Set(options.holidays);
  const isHuman = (e) => e.ator_id && !e.automatica && e.resultado === 'SUCCESS' && !e.replica_de
    && e.categoria === 'OPERACAO' && e.origem !== 'TROCA_USUARIO_DEV' && e.origem !== 'FORNECEDOR';
  for (const s of data.solicitacoes) {
    const sid = id(s.id), created = date(s.createdAt, options.dbOffset);
    if (created == null) { problems.push({ solicitacao_id: sid, problema: 'ABERTURA_SEM_DATA_VALIDA' }); continue; }
    if (created >= options.until) continue;
    const es = groups.get(sid) || [];
    for (const e of es) if (e.t < created) problems.push({ solicitacao_id: sid, problema: 'EVENTO_ANTERIOR_ABERTURA', registro_id: e.key });
    const transitions = es.filter((e) => e.fonte === 'historicos' && e.to);
    const sa = initialStatusByRequest.get(sid);
    const initialStatus = sa && sa.t >= created && sa.t <= created + 60000 ? sa : null;
    const creation = es.find((e) => e.acao === 'CRIADA' && e.t >= created && e.t <= created + 60000);
    const auditedCreation = es.find((e) => e.fonte === 'criacao_auditada' && e.setor_inicial && e.t >= created && e.t <= created + 60000);
    const initial = auditedCreation?.setor_inicial || (initialStatus ? sector(initialStatus.setor) : creation?.setor_inicial || transitions[0]?.from || null);
    const confidence = auditedCreation ? 'CRIACAO_DESTINO_AUDITADO' : initialStatus ? 'STATUS_AREA_INICIAL' : creation ? 'HISTORICO_CRIACAO_DESTINO' : (initial ? 'INFERIDA_ORIGEM_PRIMEIRO_ENVIO' : 'ENTRADA_DESCONHECIDA');
    let p, seq = 0;
    const ps = [];
    const open = (t, sec, basis, source) => {
      p = { solicitacao_id: sid, codigo: s.codigo, tipo_id: id(s.tipo_solicitacao_id), tipo: types.get(id(s.tipo_solicitacao_id)) || null,
        obra_id: id(s.obra_id), sequencia: ++seq, setor: sec, start: t, end: null, base_entrada: basis,
        evento_entrada: source, evento_saida: null, situacao: 'ABERTA_NO_CORTE', alertas: [] };
      ps.push(p);
    };
    open(created, initial, confidence, null);
    const boundaries = es.filter((e) => e.fonte === 'historicos' && (e.to || (rootLifecycle(e) && (TERMINAIS.has(token(e.status)) || /REABERT/.test(e.acao)))));
    for (const e of boundaries) {
      if (e.t < created) { problems.push({ solicitacao_id: sid, problema: 'EVENTO_ANTERIOR_ABERTURA', registro_id: e.key }); continue; }
      if (e.to) {
        if (!p) open(e.t, e.to, 'ENVIO_EXPLICITO', e.key);
        else if (p.setor === e.to) {
          if (e.from && e.from !== p.setor) p.alertas.push('ORIGEM_DIVERGENTE_ENVIO_REPETIDO');
        } else {
          if (e.from && p.setor && e.from !== p.setor) p.alertas.push('LACUNA_ENTRE_SETORES');
          p.end = e.t; p.situacao = 'ENCAMINHADA'; p.evento_saida = e.key;
          open(e.t, e.to, 'ENVIO_EXPLICITO', e.key);
        }
      }
      if (p && rootLifecycle(e) && TERMINAIS.has(token(e.status))) {
        p.end = e.t; p.situacao = 'ENCERRADA_STATUS_EXPLICITO'; p.evento_saida = e.key; p = null;
      } else if (!p && rootLifecycle(e) && /REABERT/.test(e.acao)) open(e.t, e.setor_ator, 'REABERTURA_CONTEXTO', e.key);
    }
    if (p && date(s.updatedAt, options.dbOffset) != null && date(s.updatedAt, options.dbOffset) < options.until) {
      if (sector(s.area_responsavel) !== p.setor) p.alertas.push('SETOR_ATUAL_DIVERGE_TRILHA');
      if (Number(s.cancelada) || TERMINAIS.has(token(s.status_global))) p.alertas.push('ENCERRAMENTO_SEM_DATA_HISTORICA');
    }
    if (!p && ps.length) {
      const ended = ps.at(-1).end;
      if (es.some((e) => e.t > ended && isHuman(e))) problems.push({ solicitacao_id: sid, problema: 'ATIVIDADE_APOS_ENCERRAMENTO_SEM_REABERTURA' });
      if (date(s.updatedAt, options.dbOffset) != null && date(s.updatedAt, options.dbOffset) < options.until && !Number(s.cancelada) && !TERMINAIS.has(token(s.status_global))) problems.push({ solicitacao_id: sid, problema: 'STATUS_ATUAL_ABERTO_SEM_REABERTURA' });
    }
    // Efeitos de encaminhamento com o mesmo ator nao sao resposta do recebedor.
    for (const e of es) {
      if (e.fonte === 'historicos' && e.acao === 'STATUS_ALTERADO' && transitions.some((t) => t.ator_id === e.ator_id && t.to === e.setor_ator && Math.abs(t.t - e.t) <= 2000)) {
        e.automatica = true; e.origem = 'EFEITO_ENCAMINHAMENTO';
      }
    }
    const belongs = (e, pass) => {
      if (e.key === pass.evento_entrada) return false;
      if (e.key === pass.evento_saida) return true;
      if (e.from && e.to) return false;
      return e.t >= pass.start && e.t < (pass.end ?? options.until);
    };
    for (const pass of ps) {
      if ((!options.fullHistory && pass.end != null && pass.end <= options.since) || pass.start >= options.until) continue;
      const local = es.filter((e) => belongs(e, pass));
      const human = local.filter(isHuman);
      const own = human.filter((e) => e.setor_ator && e.setor_ator === pass.setor);
      const reads = local.filter((e) => e.categoria === 'LEITURA' && e.resultado === 'SUCCESS' && e.setor_ator === pass.setor);
      const hasTies = local.some((e) => e.t === pass.start && e.key !== pass.evento_entrada);
      if (hasTies && pass.base_entrada === 'ENVIO_EXPLICITO') pass.alertas.push('EVENTOS_SIMULTANEOS_ENTRADA');
      const first = own[0], last = own.at(-1), end = pass.end ?? options.until;
      const row = { ...pass, entrada: iso(pass.start), saida: iso(pass.end), observado_ate: iso(end),
        inicio_anterior_periodo: pass.start < options.since, censurada_direita: pass.end == null,
        primeira_leitura: iso(reads[0]?.t), primeira_interacao_setor: iso(first?.t), ultima_interacao_setor: iso(last?.t),
        primeiro_usuario_id: first?.ator_id || null, primeiro_usuario_nome: users.get(first?.ator_id) || null,
        primeira_interacao_h: hours(pass.start, first?.t), primeira_leitura_h: hours(pass.start, reads[0]?.t),
        permanencia_h: pass.end == null ? null : hours(pass.start, pass.end), idade_observada_h: hours(pass.start, end),
        espera_sem_interacao_h: first ? null : hours(pass.start, end),
        primeira_ate_ultima_h: hours(first?.t, last?.t), ultima_ate_saida_h: hours(last?.t, pass.end),
        horas_calendario_sem_fds: serverClock ? null : weekdayHours(pass.start, end, holidays),
        interacoes_setor: own.length, interacoes_outros_setores: human.filter((e) => e.setor_ator && e.setor_ator !== pass.setor).length,
        interacoes_setor_desconhecido: human.filter((e) => !e.setor_ator).length,
        usuarios_distintos: new Set(human.map((e) => e.ator_id)).size,
        automatismos: local.filter((e) => e.automatica).length, falhas: local.filter((e) => e.resultado !== 'SUCCESS').length,
        confiavel_para_resumo: ['ENVIO_EXPLICITO', 'CRIACAO_DESTINO_AUDITADO', 'HISTORICO_CRIACAO_DESTINO'].includes(pass.base_entrada) && pass.alertas.length === 0,
        alertas: [...new Set(pass.alertas)].join('|') };
      delete row.start; delete row.end;
      passages.push(row);
      const addInterval = (a, b, scope) => intervals.push({ solicitacao_id: sid, passagem: pass.sequencia, setor: pass.setor,
        escopo: scope, usuario_id: scope === 'USUARIO' ? a.ator_id : null, evento_anterior: a.key, evento_seguinte: b.key,
        inicio: iso(a.t), fim: iso(b.t), horas: hours(a.t, b.t), mesmo_instante: a.t === b.t });
      for (let i = 1; i < own.length; i++) addInterval(own[i - 1], own[i], 'SETOR');
      const involved = new Set([...human.map((e) => e.ator_id), ...local.map((e) => e.responsavel_id).filter(Boolean)]);
      for (const uid of involved) {
        const ue = human.filter((e) => e.ator_id === uid);
        for (let i = 1; i < ue.length; i++) addInterval(ue[i - 1], ue[i], 'USUARIO');
        const assignment = local.find((e) => e.responsavel_id === uid || (e.acao === 'RESPONSAVEL_ASSUMIU' && e.ator_id === uid));
        const afterAssignment = assignment ? ue.find((e) => e.t >= assignment.t && e.key !== assignment.key && e.familia !== 'RESPONSAVEL') : null;
        people.push({ solicitacao_id: sid, passagem: pass.sequencia, setor_passagem: pass.setor, usuario_id: uid,
          usuario_nome: users.get(uid) || null, setores_observados: [...new Set(ue.map((e) => e.setor_ator).filter(Boolean))].join('|'),
          interacoes: ue.length, primeira: iso(ue[0]?.t), ultima: iso(ue.at(-1)?.t),
          entrada_ate_primeira_h: hours(pass.start, ue[0]?.t), janela_entre_acoes_h: hours(ue[0]?.t, ue.at(-1)?.t),
          ultima_ate_saida_h: hours(ue.at(-1)?.t, pass.end), atribuido_em: iso(assignment?.t),
          atribuicao_sem_acao: Boolean(assignment && !afterAssignment),
          atribuicao_ate_acao_h: hours(assignment?.t, afterAssignment?.t),
          base_entrada: pass.base_entrada, confiavel_para_resumo: row.confiavel_para_resumo });
      }
      // Status nao implica deslocamento. Mantem esperas/aprovacoes auditaveis dentro do setor.
      const ss = es.filter((e) => e.fonte === 'historicos' && e.status && e.t >= pass.start && e.t < end);
      for (let i = 0; i < ss.length; i++) statusSpans.push({ solicitacao_id: sid, passagem: pass.sequencia, setor: pass.setor,
        status: ss[i].status, evento_inicio: ss[i].key, inicio: iso(ss[i].t), fim_observado: iso(ss[i + 1]?.t ?? end),
        horas: hours(ss[i].t, ss[i + 1]?.t ?? end), censurado: !ss[i + 1] && pass.end == null,
        possivel_espera_aprovacao: /AGUARD.*APROV|DIRETORIA|AGUARD.*LIBER/.test(token(ss[i].status)) });
    }
    const observedRoute = ps.map((p) => p.setor || 'DESCONHECIDO');
    const origin = es.find((e) => e.categoria === 'ABERTURA')?.setor_ator || null;
    const routeWithOrigin = origin && origin !== observedRoute[0] ? [origin, ...observedRoute] : observedRoute;
    const reference = routeWithOrigin.slice(0, routeWithOrigin.indexOf('FINANCEIRO') + 1).join(' > ');
    flows.push({ solicitacao_id: sid, codigo: s.codigo, tipo_id: id(s.tipo_solicitacao_id), obra_id: id(s.obra_id),
      criado_em: iso(created), setor_solicitante_historico: origin, fluxo: routeWithOrigin.join(' > '),
      fluxo_referencia: ['OBRA > GEO > FINANCEIRO', 'OBRA > COMPRAS > FINANCEIRO', 'OBRA > GEO > COMPRAS > FINANCEIRO'].includes(reference) ? reference : 'OUTRO_OU_INCOMPLETO',
      passagens: ps.length, retornos: ps.filter((p, i) => p.setor && ps.slice(0, i).some((prev) => prev.setor === p.setor)).length,
      base_entrada_inicial: confidence, status_atual_snapshot: s.status_global, snapshot_atualizado_em: s.updatedAt,
      abertura_ate_primeiro_financeiro_h: hours(created, ps.find((p) => p.setor === 'FINANCEIRO')?.start),
      eventos: es.length, eventos_sem_setor: es.filter((e) => !e.setor_ator).length });
  }
  const summarize = (rows, keys, metrics) => {
    const map = new Map();
    for (const row of rows) {
      const key = JSON.stringify(keys.map((k) => row[k] ?? null));
      if (!map.has(key)) map.set(key, []); map.get(key).push(row);
    }
    return [...map.values()].map((rs) => {
      const out = Object.fromEntries(keys.map((key) => [key, rs[0][key] ?? null]));
      out.registros = rs.length;
      out.solicitacoes_distintas = new Set(rs.map((r) => r.solicitacao_id)).size;
      out.censuradas = rs.filter((r) => r.censurada_direita).length;
      if (Object.hasOwn(rs[0], 'primeira_interacao_h')) out.sem_primeira_interacao = rs.filter((r) => r.primeira_interacao_h == null).length;
      for (const metric of metrics) for (const [key, val] of Object.entries(stats(rs.map((r) => r[metric])))) out[`${metric}_${key}`] = val;
      return out;
    });
  };
  const relevant = new Set(passages.map((p) => p.solicitacao_id));
  return {
    manifesto: { versao: 2, inicio_inclusivo: iso(options.since), fim_exclusivo: iso(options.until), fuso_datas_banco: options.dbOffset,
      escopo: options.fullHistory ? 'HISTORICO_COMPLETO' : 'PERIODO',
      referencia_horarios: serverClock ? 'HORARIO_SERVIDOR_SEM_CONVERSAO' : 'UTC',
      calendario: serverClock ? 'DESATIVADO; somente diferencas de horarios registrados no servidor' : 'America/Sao_Paulo UTC-03 (2020+); integral de 24h em seg-sex; nao e jornada nem SLA homologado',
      feriados_informados: options.holidays.length, solicitacoes_lidas: data.solicitacoes.length, solicitacoes_no_relatorio: relevant.size,
      possiveis_espelhos: events.filter((e) => e.replica_de).length,
      passagens: passages.length, passagens_base_estrita: passages.filter((p) => p.confiavel_para_resumo).length,
      ressalvas: [...(serverClock ? ['Horarios preservados sem conversao de fuso; duracoes aproximadas pressupõem a mesma referencia em todas as fontes. Mudancas historicas de fuso/relogio ou mistura de DATETIME/TIMESTAMP precisam ser verificadas. Dias uteis nao calculados.'] : []),
        'Tempo entre eventos nao e tempo de trabalho.', 'Sem eventos nao significa ausencia de trabalho.',
        'Historicos/contexto de anexo nao comprovam lotacao historica; snapshot da auditoria e mais forte.',
        'Datas de negocio/pagamento retroativo nao sao usadas como horario da interacao.',
        'PAGA/PARCIALMENTE PAGO nao encerram automaticamente uma solicitacao.',
        'Dados atuais de tipo/obra/usuario sao rotulos; nao reconstituem seus cadastros passados.',
        'Entrada inicial inferida e passagens com lacunas ficam fora do resumo estrito.',
        'Mudancas de etapa sem evento explicito nao podem ser reconstruidas.',
        'POP e referencia proposta; nenhum bloqueio ou prazo e aplicado por esta auditoria.'] },
    passagens: passages, usuarios_passagens: people, intervalos: intervals, etapas_status: statusSpans,
    fluxos: flows.filter((r) => relevant.has(r.solicitacao_id)),
    resumo_setor: summarize(passages, ['setor', 'confiavel_para_resumo'], ['primeira_interacao_h', 'permanencia_h', 'idade_observada_h']),
    resumo_setor_tipo: summarize(passages, ['setor', 'tipo_id', 'confiavel_para_resumo'], ['primeira_interacao_h', 'permanencia_h']),
    resumo_usuario: summarize(people, ['usuario_id', 'usuario_nome', 'setor_passagem', 'confiavel_para_resumo'], ['entrada_ate_primeira_h', 'janela_entre_acoes_h', 'atribuicao_ate_acao_h']),
    resumo_intervalos: summarize(intervals, ['escopo', 'setor', 'usuario_id'], ['horas']),
    resumo_fluxos: summarize(flows.filter((r) => relevant.has(r.solicitacao_id)), ['fluxo_referencia'], ['abertura_ate_primeiro_financeiro_h']),
    atividade_no_periodo: summarize(events.filter((e) => relevant.has(e.solicitacao_id) && e.t >= options.since && isHuman(e)), ['ator_id', 'setor_ator', 'familia'], []),
    catalogo_eventos: summarize(events.filter((e) => relevant.has(e.solicitacao_id)), ['fonte', 'acao', 'categoria', 'resultado', 'automatica'], []),
    pendencias: passages.filter((p) => p.censurada_direita).sort((a, b) => b.idade_observada_h - a.idade_observada_h),
    qualidade: [...problems, ...passages.filter((p) => p.alertas || !p.setor).map((p) => ({ solicitacao_id: p.solicitacao_id, passagem: p.sequencia, problema: p.alertas || 'SETOR_DESCONHECIDO' }))],
    eventos: events.filter((e) => relevant.has(e.solicitacao_id)).map(({ t, from, to, rota, ...e }) => ({ ...e, ocorrido_em: iso(t), dentro_periodo: t >= options.since, setor_origem: from, setor_destino: to,
      usuario_nome: users.get(e.ator_id) || null }))
  };
}
module.exports = { analyze, normalize, governanceRoot, stats, date, hours, weekdayHours, token };
