import { useEffect, useRef } from 'react';

/**
 * PÁGINA PADRÃO — o ritmo vertical da tela mora aqui, não na tela.
 * A tela declara os blocos na ordem; o vão entre eles (um degrau da escala,
 * styles/escala.css) e o tamanho do título são decisão deste componente.
 * Nada de space-y nem gap à mão na raiz das telas reformadas.
 *
 * R13 (02/09): publica --pos-cabecalho-fixo (altura real da topbar + vão)
 * para o cabeçalho fixo da tela grudar logo abaixo da topbar na rolagem —
 * vale para o PageHeader e para cabeçalhos custom com .app-page-header.
 */
export default function Pagina({ className = '', children, ...props }) {
  const ref = useRef(null);

  useEffect(() => {
    // A faixa gruda ENCOSTADA na topbar: top = base REAL da topbar, sem
    // folga — folga aqui virava um vão transparente com o conteúdo da
    // lista rolando por trás (defeito de 02/09). O respiro visual do
    // estado normal pertence à margem do conteúdo, não ao espaço entre
    // as duas barras fixas.
    let raf = null;
    const medir = () => {
      raf = null;
      // A topbar REAL do shell é .fx-topbar (.topbar-shell era um seletor
      // morto — medir elemento inexistente caía no fallback de 96px e
      // criava o vão transparente; defeito de 02/09).
      const topbar = document.querySelector('.fx-topbar, .topbar-shell');
      if (!topbar || !ref.current) return;
      const base = topbar.getBoundingClientRect().bottom;
      ref.current.style.setProperty('--pos-cabecalho-fixo', `${Math.round(base)}px`);
    };
    const agendar = () => { if (raf == null) raf = requestAnimationFrame(medir); };
    medir();
    window.addEventListener('resize', agendar);
    window.addEventListener('scroll', agendar, { passive: true });
    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      window.removeEventListener('resize', agendar);
      window.removeEventListener('scroll', agendar);
    };
  }, []);

  const classes = ['page', 'solicitacoes-page', 'app-pagina', className]
    .filter(Boolean).join(' ');
  return (
    <div ref={ref} className={classes} {...props}>
      {children}
    </div>
  );
}
