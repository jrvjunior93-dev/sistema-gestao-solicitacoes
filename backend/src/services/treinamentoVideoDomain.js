const crypto = require('node:crypto');
function erro(message, statusCode = 400) { return Object.assign(new Error(message), { statusCode }); }
function versaoVideo(item) {
  return crypto.createHash('sha256').update(String(item.video_s3_key || item.video_url || '')).digest('hex');
}
function unirTrechos(trechos) {
  const result = [];
  for (const [inicio, fim] of trechos.slice().sort((a, b) => a[0] - b[0])) {
    const ultimo = result[result.length - 1];
    if (ultimo && inicio <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], fim);
    else result.push([inicio, fim]);
  }
  return result;
}
function normalizarPacote(body, duracaoAtual, janela) {
  const sequencia = Number(body?.sequencia), duracao = Number(body?.duracao);
  if (!Number.isSafeInteger(sequencia) || sequencia < 1 || !Number.isFinite(duracao) || duracao <= 0 || duracao > 86400
    || (duracaoAtual && Math.abs(duracaoAtual - duracao) > 1)) throw erro('Duracao ou sequencia de rastreio invalida.');
  if (!Array.isArray(body.trechos) || body.trechos.length > 40 || !Array.isArray(body.saltos) || body.saltos.length > 20) throw erro('Pacote de rastreio excedeu o limite.');
  const numero = value => typeof value === 'number' && Number.isFinite(value);
  let segundos = 0;
  const trechos = body.trechos.map(t => {
    if (!Array.isArray(t) || t.length !== 4) throw erro('Trecho invalido.');
    const [inicio, fim, tempo, velocidade] = t;
    if (![inicio, fim, tempo, velocidade].every(numero) || inicio < 0 || fim > duracao + .1 || fim <= inicio
      || tempo <= 0 || tempo > 30 || velocidade < .25 || velocidade > 4 || fim - inicio > tempo * velocidade + .25) throw erro('Trecho de reproducao invalido.');
    segundos += tempo;
    return [inicio, Math.min(duracao, fim)];
  });
  if (segundos > Math.min(30, janela + 2)) throw erro('Tempo de reproducao excedeu a janela da sessao.');
  const saltos = body.saltos.map(t => {
    if (!Array.isArray(t) || t.length !== 2 || !t.every(numero) || t.some(n => n < 0 || n > duracao + .1)) throw erro('Salto invalido.');
    return t;
  });
  return { sequencia, duracao, segundos, trechos, saltos,
    pulou_final: saltos.some(([de, para]) => para - de > 2 && para >= duracao * .95),
    hash: crypto.createHash('sha256').update(JSON.stringify({ sequencia, duracao, trechos: body.trechos, saltos })).digest('hex') };
}
module.exports = { erro, versaoVideo, unirTrechos, normalizarPacote };
