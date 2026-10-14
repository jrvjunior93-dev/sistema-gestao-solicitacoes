import { iniciarTreinamentoVideo, registrarTreinamentoVideo } from '../services/treinamento';

// Telemetria do player, nao prova de atencao. Pausa/buffering/aba oculta nao contam.
// A fila conserva o pacote original para retry idempotente; nunca usa identidade do payload.
export function rastrearVideo(video, conteudoId, avisarFalha, api = { iniciarTreinamentoVideo, registrarTreinamentoVideo }) {
  const sessaoId = crypto.randomUUID();
  let ativo = !video.paused, fechado = false, falhou = false, sessao = false, iniciando = false, enviando = false;
  let anterior = null, origemSalto = null, trechos = [], saltos = [], sequencia = 0, fila = [];
  const listeners = [];
  function aviso(error) { if (!falhou) { falhou = true; avisarFalha?.(error.message || 'Rastreio indisponível. A reprodução e Concluir continuam disponíveis.'); } }
  function ler() { return { posicao: video.currentTime, instante: performance.now(), velocidade: video.playbackRate }; }
  function amostrar() {
    const atual = ler();
    if (anterior && ativo && !video.seeking && document.visibilityState === 'visible') {
      const delta = atual.posicao - anterior.posicao, tempo = (atual.instante - anterior.instante) / 1000;
      // Um salto/despertar do navegador nunca vira um trecho assistido.
      if (tempo > 0 && tempo <= 2 && delta > 0 && delta <= tempo * anterior.velocidade + .25 && anterior.velocidade >= .25 && anterior.velocidade <= 4) {
        trechos.push([anterior.posicao, atual.posicao, Math.min(tempo, delta / anterior.velocidade), anterior.velocidade]);
      }
    }
    anterior = atual;
  }
  function agrupar(lista) {
    const agrupada = [];
    for (const t of lista) {
      const ultimo = agrupada.at(-1);
      if (ultimo && Math.abs(ultimo[1] - t[0]) < .001 && ultimo[3] === t[3] && ultimo[2] + t[2] <= 20) { ultimo[1] = t[1]; ultimo[2] += t[2]; }
      else agrupada.push([...t]);
    }
    return agrupada;
  }
  async function enviar() {
    if (enviando || !sessao) return;
    enviando = true;
    try {
      while (fila.length) { await api.registrarTreinamentoVideo(conteudoId, fila[0]); fila.shift(); falhou = false; }
    } catch (e) { aviso(e); }
    finally { enviando = false; }
  }
  async function iniciar() {
    if (sessao || iniciando || fechado) return;
    iniciando = true;
    try { await api.iniciarTreinamentoVideo(conteudoId, sessaoId); sessao = true; }
    catch (e) { aviso(e); }
    finally { iniciando = false; }
    if (sessao) enviar();
  }
  function flush() {
    amostrar();
    const duracao = video.duration;
    if (Number.isFinite(duracao) && duracao > 0 && (trechos.length || saltos.length)) {
      const grupo = agrupar(trechos);
      // Pacotes pequenos; memoria limitada se backend/rede ficar indisponivel.
      if (fila.length < 12) {
        fila.push({ sessao_id: sessaoId, sequencia: ++sequencia, duracao, trechos: grupo.slice(0, 40), saltos: saltos.slice(0, 20) });
      } else aviso(new Error('Rastreio interrompido por falha de conexão. Alguns trechos podem não constar no relatório.'));
      trechos = []; saltos = [];
    }
    iniciar(); enviar();
  }
  function ouvir(alvo, evento, callback) { alvo.addEventListener(evento, callback); listeners.push(() => alvo.removeEventListener(evento, callback)); }
  ouvir(video, 'playing', () => { ativo = true; anterior = ler(); iniciar(); });
  for (const evento of ['pause', 'waiting', 'ended']) ouvir(video, evento, () => { flush(); ativo = false; anterior = null; });
  ouvir(video, 'seeking', () => { origemSalto = anterior?.posicao ?? video.currentTime; ativo = false; anterior = null; });
  ouvir(video, 'seeked', () => {
    if (origemSalto !== null && Math.abs(video.currentTime - origemSalto) > 2) saltos.push([origemSalto, video.currentTime]);
    origemSalto = null; ativo = !video.paused && video.readyState >= 3; anterior = ler(); flush();
  });
  ouvir(video, 'ratechange', () => { amostrar(); anterior = ler(); });
  ouvir(document, 'visibilitychange', () => { anterior = null; flush(); anterior = null; });
  ouvir(window, 'pagehide', flush);
  const sampleTimer = setInterval(amostrar, 500), timer = setInterval(flush, 5000);
  anterior = ler(); iniciar();
  return () => { flush(); fechado = true; clearInterval(sampleTimer); clearInterval(timer); listeners.forEach(remover => remover()); };
}
