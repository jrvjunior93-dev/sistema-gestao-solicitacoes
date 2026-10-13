import { useRef, useState } from 'react';
import OverlayModal from '../ui/OverlayModal';
import useRolagemModal from '../../hooks/useRolagemModal';

// Consulta local: nao salva, nao consulta APIs e nao altera o rascunho da baixa.
export default function DadosPagamentoFila({ texto, titulo, favorecido }) {
  const [aberto, setAberto] = useState(false);
  const [copia, setCopia] = useState('');
  const disparador = useRef(null);
  const guardarRolagem = useRolagemModal(aberto);
  const completo = String(texto || '');
  const longo = completo.length > 120 || completo.split('\n').length > 2;

  function fechar() {
    setAberto(false);
    // autoFocus do texto ocorre antes do efeito de foco do portal.
    requestAnimationFrame(() => { if (disparador.current?.isConnected) disparador.current.focus({ preventScroll: true }); });
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(completo);
      setCopia('Dados copiados.');
    } catch {
      setCopia('Selecione o texto abaixo e copie manualmente.');
    }
  }

  return (
    <>
      <div className={`max-w-64 whitespace-pre-wrap break-all text-xs ${longo ? 'line-clamp-3' : ''}`}>{completo}</div>
      {longo && <button type="button" className="mt-1 text-xs text-[var(--module-financeiro)] underline focus-visible:outline focus-visible:outline-2"
        aria-label={`Ver dados para pagamento de ${titulo}`} onClick={event => {
          guardarRolagem(event.currentTarget);
          disparador.current = event.currentTarget;
          setCopia('');
          setAberto(true);
        }}>Ver dados completos</button>}
      {aberto && <OverlayModal rotulo={`Dados para pagamento de ${titulo}`} largura="860px"
        onFechar={fechar} fecharAoClicarFora>
        <div data-modal="cabecalho" className="flex items-start justify-between gap-3 border-b border-[var(--c-border)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Dados para pagamento · {titulo}</h2>
            <p className="mt-1 break-words text-sm text-[var(--c-muted)]">{favorecido}</p>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={fechar}>Fechar</button>
        </div>
        <div className="px-4 py-3">
          <textarea readOnly autoFocus aria-label="Dados completos para pagamento" className="input w-full resize-y text-sm"
            rows={10} style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }} value={completo} />
        </div>
        <div data-modal="rodape" className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--c-border)] px-4 py-3">
          <span role="status" className="text-xs text-[var(--c-muted)]">{copia}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={copiar}>Copiar dados</button>
        </div>
      </OverlayModal>}
    </>
  );
}
