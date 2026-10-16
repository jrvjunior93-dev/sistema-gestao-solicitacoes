import { useEffect, useRef } from 'react';

// O proximo ciclo so e agendado DEPOIS da resposta. Erros reduzem a frequencia;
// foco nao ultrapassa o backoff e paginas ocultas nao fazem novas consultas.
export function iniciarPollingSeguro(consultar, { ativo = true, intervalo = 30000, imediato = true, eventos = [] } = {}) {
    if (!ativo) return undefined;
    let encerrado = false, timer, emCurso = false, repetir = false, falhas = 0, proximaTentativa = 0;
    const agendar = () => {
      clearTimeout(timer);
      if (!encerrado) timer = setTimeout(atualizar, intervalo * Math.min(8, 2 ** falhas));
    };
    async function atualizar() {
      if (encerrado) return;
      if (emCurso) { repetir = true; return; }
      if (document.hidden || Date.now() < proximaTentativa) { agendar(); return; }
      clearTimeout(timer);
      emCurso = true;
      try {
        const resultado = await consultar();
        falhas = resultado === null || resultado === false ? Math.min(3, falhas + 1) : 0;
      } catch { falhas = Math.min(3, falhas + 1); }
      finally {
        emCurso = false;
        proximaTentativa = falhas ? Date.now() + intervalo * 2 ** falhas : 0;
        const solicitado = repetir;
        repetir = false;
        if (solicitado && !falhas && !encerrado && !document.hidden) atualizar();
        else agendar();
      }
    }
    const nomes = eventos;
    window.addEventListener('focus', atualizar);
    document.addEventListener('visibilitychange', atualizar);
    nomes.forEach(nome => window.addEventListener(nome, atualizar));
    if (imediato) atualizar(); else agendar();
    return () => {
      encerrado = true; clearTimeout(timer);
      window.removeEventListener('focus', atualizar);
      document.removeEventListener('visibilitychange', atualizar);
      nomes.forEach(nome => window.removeEventListener(nome, atualizar));
    };
}

export default function usePollingSeguro(consultar, { ativo = true, intervalo = 30000, imediato = true, eventos = [] } = {}) {
  const callback = useRef(consultar);
  callback.current = consultar;
  const eventosKey = eventos.join('|');
  useEffect(() => iniciarPollingSeguro(() => callback.current(), { ativo, intervalo, imediato,
    eventos: eventosKey ? eventosKey.split('|') : [] }), [ativo, intervalo, imediato, eventosKey]);
}
