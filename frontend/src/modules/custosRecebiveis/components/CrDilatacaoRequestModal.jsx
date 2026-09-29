import { useEffect, useState } from 'react';
import { HiOutlineXMark } from 'react-icons/hi2';
import OverlayModal from '../../../components/ui/OverlayModal';
import { monthLabel } from '../utils/prazos';

const DIAS = [2, 3, 4, 5];

/*
  Pedido de dilatação do prazo da medição aprovada (29/09/2026): quando o
  fiscal atrasa, o engenheiro pede de 2 a 5 dias; o administrador decide.
  Pode pedir antes ou depois do vencimento; um pedido pendente por mês.
*/
export default function CrDilatacaoRequestModal({ target, onClose, onSubmit }) {
  const [dias, setDias] = useState(3);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDias(3);
    setMotivo('');
    setError('');
  }, [target]);

  function close() {
    if (saving) return;
    onClose?.();
  }

  async function submit() {
    const normalized = motivo.trim();
    if (!target || normalized.length < 10 || saving) return;
    try {
      setSaving(true);
      setError('');
      await onSubmit?.(target.obra.id, target.competencia, dias, normalized);
      onClose?.();
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível solicitar a dilatação.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <OverlayModal
      aberto={Boolean(target)}
      rotulo="Solicitar dilatação de prazo"
      largura="var(--modal-max-w-sm, 520px)"
      onFechar={close}
      fecharComEscape={!saving}
    >
      <header data-modal="cabecalho" className="cr-reopening-modal__header">
        <div>
          <h2>Solicitar dilatação de prazo</h2>
          <p>{target?.obra?.nome} · medição aprovada de {monthLabel(target?.competencia)}</p>
        </div>
        <button type="button" className="cr-icon-button" onClick={close} disabled={saving} aria-label="Fechar" title="Fechar">
          <HiOutlineXMark aria-hidden="true" />
        </button>
      </header>
      <div className="cr-reopening-modal__body">
        <div className="cr-field">
          <span>Dias adicionais</span>
          <div className="cr-dias-opcoes" role="radiogroup" aria-label="Dias adicionais">
            {DIAS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={dias === value}
                className={`btn ${dias === value ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setDias(value)}
              >
                {value} dias
              </button>
            ))}
          </div>
        </div>
        <label className="cr-field">
          <span>Motivo</span>
          <textarea
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            placeholder="Ex.: o fiscal remarcou a medição para a próxima semana."
            rows={3}
            autoFocus
          />
          <small>Mínimo de 10 caracteres.</small>
        </label>
        {error ? <div className="cr-feedback" data-tone="error">{error}</div> : null}
      </div>
      <footer data-modal="rodape" className="cr-reopening-modal__footer">
        <button type="button" className="btn btn-outline" onClick={close} disabled={saving}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={motivo.trim().length < 10 || saving}>
          {saving ? 'Enviando...' : 'Enviar pedido'}
        </button>
      </footer>
    </OverlayModal>
  );
}
