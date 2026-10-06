'use strict';

const CHAVE = 'PRAZOS_OPERACIONAIS_CONFIG';
const FUTURAS = [
  ['DOCUMENTO_SOLICITADO', 'Responder pedido explícito de documento', 'Documento ausente impede análise ou criação de título.'],
  ['CORRECAO_DEVOLVIDA', 'Corrigir informações devolvidas à Obra', 'Dados incorretos impedem a continuidade administrativa.'],
  ['RETORNO_TEMPORARIO', 'Devolver solicitação após retorno aprovado', 'A solicitação permanece fora do setor que precisa dar continuidade.'],
  ['PRESTACAO_RECARGA', 'Prestar contas de recarga', 'Comprovantes ausentes impedem conferir a utilização do recurso.'],
  ['PLANEJAMENTO_MEDICAO', 'Atualizar planejamento ou medição', 'Informação ausente atrasa custos e recebíveis; preservar os controles existentes.']
].map(([tipo, nome, impacto]) => ({ tipo, nome, impacto, disponivel: false }));
const PADRAO = Object.freeze({ ativo: false, modo: 'OBSERVAR', iniciar_em: '', unidade: 'DIAS',
  calendario: 'CORRIDOS', prazo: 1, tolerancia: 0, aviso: 1, hora_referencia: '18:00',
  expediente_inicio: '08:00', expediente_fim: '18:00', revisao: 0 });
function erro(mensagem, statusCode = 400) { throw Object.assign(new Error(mensagem), { statusCode }); }
function dataValida(data) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(data)) && !Number.isNaN(Date.parse(`${data}T00:00:00Z`))
    && new Date(`${data}T00:00:00Z`).toISOString().slice(0, 10) === data;
}
function validar(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) erro('Configuração de prazos inválida.');
  const c = { ...PADRAO, ...config };
  if (typeof c.ativo !== 'boolean' || !['OBSERVAR', 'BLOQUEAR'].includes(c.modo)
      || !['HORAS', 'DIAS'].includes(c.unidade) || !['CORRIDOS', 'UTEIS'].includes(c.calendario)) erro('Modo ou unidade de prazo inválido.');
  for (const campo of ['prazo', 'tolerancia', 'aviso']) {
    if (!Number.isInteger(c[campo]) || c[campo] < (campo === 'prazo' ? 1 : 0) || c[campo] > 720) erro(`${campo}: informe um número inteiro entre ${campo === 'prazo' ? 1 : 0} e 720.`);
  }
  for (const campo of ['hora_referencia', 'expediente_inicio', 'expediente_fim']) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(c[campo])) erro('Informe os horários no formato HH:MM.');
  }
  if (c.expediente_inicio >= c.expediente_fim) erro('O fim do expediente deve ser posterior ao início.');
  if ((c.ativo || c.iniciar_em) && !dataValida(c.iniciar_em)) erro('Informe a data de início da cobrança.');
  return Object.fromEntries(Object.keys(PADRAO).map((k) => [k, c[k]]));
}
function diaBrasil(data = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(data); }
function local(data, hora) {
  // Converte hora civil de São Paulo sem depender do TZ da EC2/processo.
  const alvo = Date.parse(`${data}T${hora}:00Z`);
  let utc = alvo;
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium', hourCycle: 'h23' });
  for (let i = 0; i < 3; i++) utc += alvo - Date.parse(`${fmt.format(new Date(utc)).replace(' ', 'T')}Z`);
  return new Date(utc);
}
function proximoDia(data) { return new Date(Date.parse(`${data}T12:00:00Z`) + 86400000).toISOString().slice(0, 10); }
function util(data, feriados) { const d = new Date(`${data}T12:00:00Z`).getUTCDay(); return d !== 0 && d !== 6 && !feriados.includes(data); }
function adicionar(inicio, quantidade, regra, feriados = []) {
  if (!quantidade) return new Date(inicio);
  if (regra.calendario === 'CORRIDOS') return new Date(+inicio + quantidade * (regra.unidade === 'DIAS' ? 86400000 : 3600000));
  if (regra.unidade === 'DIAS') {
    let dia = diaBrasil(inicio), faltam = quantidade;
    while (faltam) { dia = proximoDia(dia); if (util(dia, feriados)) faltam--; }
    const hora = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(inicio);
    return local(dia, hora);
  }
  let agora = new Date(inicio), faltam = quantidade * 3600000;
  while (faltam > 0) {
    const dia = diaBrasil(agora), abertura = local(dia, regra.expediente_inicio), fechamento = local(dia, regra.expediente_fim);
    if (!util(dia, feriados) || agora >= fechamento) { agora = local(proximoDia(dia), regra.expediente_inicio); continue; }
    if (agora < abertura) agora = abertura;
    const usar = Math.min(faltam, +fechamento - +agora);
    agora = new Date(+agora + usar); faltam -= usar;
  }
  return agora;
}
function calcular(previsao, regra, feriados, agora = new Date()) {
  if (!dataValida(previsao)) erro('Previsão de entrega inválida.');
  const inicio = new Date(Math.max(+local(previsao, regra.hora_referencia), +agora));
  const prazo = adicionar(inicio, regra.prazo, regra, feriados);
  return { inicio_em: inicio, prazo_em: prazo, limite_em: adicionar(prazo, regra.tolerancia, regra, feriados) };
}
function resumir(linhas, regra, agora = new Date()) {
  if (!regra.ativo || !linhas.length) return null;
  const ordenadas = [...linhas].sort((a, b) => +new Date(a.limite_em) - +new Date(b.limite_em));
  const primeira = ordenadas[0];
  const vencidas = ordenadas.filter((o) => +new Date(o.limite_em) <= +agora).length;
  const snapshot = typeof primeira.regra_snapshot === 'string' ? JSON.parse(primeira.regra_snapshot) : primeira.regra_snapshot;
  return { quantidade: linhas.length, vencidas, limite_em: new Date(primeira.limite_em).toISOString(),
    prazo_em: new Date(primeira.prazo_em).toISOString(), servidor_agora: agora.toISOString(),
    solicitacao_id: primeira.solicitacao_id, pedido_id: primeira.pedido_id,
    aviso_ms: (snapshot?.aviso || 0) * (snapshot?.unidade === 'HORAS' ? 3600000 : 86400000),
    modo: regra.modo, tipo: 'ENTREGA_OBRA' };
}
module.exports = { CHAVE, PADRAO, FUTURAS, validar, dataValida, diaBrasil, local, adicionar, calcular, resumir };
