import { useEffect, useLayoutEffect, useRef } from 'react';

// Guarda a pagina e os scrollports do disparador, sem interferir nos demais modais.
export default function useRolagemModal(aberto) {
  const posicao = useRef(null);
  const quadro = useRef(null);
  const restaurar = () => {
    if (!posicao.current) return;
    for (const { elemento, top, left } of posicao.current.portas) {
      if (elemento.isConnected) elemento.scrollTo({ top, left, behavior: 'instant' });
    }
    window.scrollTo({ top: posicao.current.top, left: posicao.current.left, behavior: 'instant' });
  };
  useLayoutEffect(() => {
    if (!posicao.current) return undefined;
    restaurar();
    // Depois da trava/destrava do body e da devolucao de foco do ModalPortal.
    quadro.current = requestAnimationFrame(() => { restaurar(); quadro.current = null; });
    return () => { if (quadro.current !== null) cancelAnimationFrame(quadro.current); };
  }, [aberto]);
  useEffect(() => () => { if (quadro.current !== null) cancelAnimationFrame(quadro.current); }, []);
  return (disparador) => {
    const portas = [];
    for (let elemento = disparador?.parentElement; elemento; elemento = elemento.parentElement) {
      if (elemento.scrollHeight > elemento.clientHeight || elemento.scrollWidth > elemento.clientWidth) {
        portas.push({ elemento, top: elemento.scrollTop, left: elemento.scrollLeft });
      }
    }
    posicao.current = { top: window.scrollY, left: window.scrollX, portas };
  };
}
