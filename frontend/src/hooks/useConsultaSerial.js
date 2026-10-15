import { useCallback, useLayoutEffect, useRef } from 'react';

// Compartilha uma consulta igual em andamento. Mudancas de filtro aguardam a
// anterior e usam o callback mais recente; nao disparam mais carga em paralelo.
export default function useConsultaSerial(callback, identidade = '') {
  const atual = useRef({ callback, identidade });
  useLayoutEffect(() => { atual.current = { callback, identidade }; }, [callback, identidade]);
  const pendente = useRef(null);
  const montado = useRef(true);
  useLayoutEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);
  const executar = useCallback((...args) => {
    if (!montado.current) return Promise.resolve(null);
    const { callback: fn, identidade: chave } = atual.current;
    const key = String(chave) + JSON.stringify(args);
    if (pendente.current) {
      if (pendente.current.key === key) return pendente.current.promise;
      return pendente.current.promise.catch(() => {}).then(() => executar(...args));
    }
    const registro = { key };
    registro.promise = Promise.resolve().then(() => fn(...args)).finally(() => {
      if (pendente.current === registro) pendente.current = null;
    });
    pendente.current = registro;
    return registro.promise;
  }, []);
  return executar;
}
