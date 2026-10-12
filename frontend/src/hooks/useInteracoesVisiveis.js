import { useEffect } from 'react';
import { marcarInteracoesLidas } from '../services/solicitacaoInteracoes';

// So reconhece eventos que ficaram visiveis com a janela ativa e sem modal
// cobrindo o historico. IDs sao a fotografia exibida, nunca "todos ate agora".
export default function useInteracoesVisiveis(ref, solicitacaoId, ids, aberto) {
  const chave = (ids || []).join(',');
  useEffect(() => {
    const root = ref.current;
    if (!aberto || !root || !solicitacaoId || !chave || typeof IntersectionObserver === 'undefined') return;
    const pendentes = new Set(chave.split(',').map(Number));
    const visiveis = new Set();
    const lidos = new Set();
    let executando = false;
    let falhas = 0;
    let tentarApos = 0;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const id = Number(entry.target.dataset.interacaoId);
        // Comentario muito longo pode ser maior que quatro telas: exigir
        // 25% do elemento tornaria sua leitura impossivel de reconhecer.
        if (entry.isIntersecting && entry.intersectionRect.height >= Math.min(40, entry.boundingClientRect.height * 0.25)) visiveis.add(id);
        else visiveis.delete(id);
      });
    }, { threshold: [0, 0.01, 0.03, 0.05, 0.1, 0.25, 0.5, 0.75, 1] });
    root.querySelectorAll('[data-interacao-id]').forEach((node) => {
      if (pendentes.has(Number(node.dataset.interacaoId))) observer.observe(node);
    });
    const timer = setInterval(async () => {
      if (executando || Date.now() < tentarApos || document.visibilityState !== 'visible' || !document.hasFocus()
        || document.querySelector('[role="dialog"]')) return;
      const lista = [...visiveis].filter((id) => !lidos.has(id)).slice(0, 100);
      if (!lista.length) return;
      executando = true;
      try {
        await marcarInteracoesLidas(solicitacaoId, lista);
        falhas = 0; tentarApos = 0;
        lista.forEach((id) => lidos.add(id));
      } catch (error) {
        falhas++;
        tentarApos = Date.now() + Math.min(1200 * (2 ** (falhas - 1)), 30000);
        console.error('Leitura nao registrada; destaque preservado:', error);
      } finally { executando = false; }
    }, 800);
    return () => { clearInterval(timer); observer.disconnect(); };
  }, [ref, solicitacaoId, chave, aberto]);
}
