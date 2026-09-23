import { useEffect, useState } from 'react';
import { HiOutlineXMark } from 'react-icons/hi2';
import OverlayModal from '../../../components/ui/OverlayModal';

function monthLabel(value) {
  if (!/^\d{4}-\d{2}$/.test(String(value || ''))) return 'Competência não informada';
  const [year, month] = String(value).split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export default function CrReopeningRequestModal({ target, onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setReason('');
    setError('');
  }, [target]);

  function close() {
    if (saving) return;
    onClose?.();
  }

  async function submit() {
    const normalizedReason = reason.trim();
    if (!target || normalizedReason.length < 10 || saving) return;
    try {
      setSaving(true);
      setError('');
      await onSubmit?.(target.obra.id, target.competencia, normalizedReason);
      onClose?.();
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível solicitar a reabertura.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <OverlayModal
      aberto={Boolean(target)}
      rotulo="Solicitar reabertura de competência"
      largura="var(--modal-max-w-sm, 520px)"
      onFechar={close}
      fecharComEscape={!saving}
    >
      <header data-modal="cabecalho" className="cr-reopening-modal__header">
        <div>
          <h2>Solicitar reabertura</h2>
          <p>{target?.obra?.nome} · {monthLabel(target?.competencia)}</p>
        </div>
        <button
          type="button"
          className="cr-icon-button"
          onClick={close}
          disabled={saving}
          aria-label="Fechar"
          title="Fechar"
        >
          <HiOutlineXMark aria-hidden="true" />
        </button>
      </header>
      <div className="cr-reopening-modal__body">
        <p>
          A solicitação será enviada para decisão e ficará registrada na auditoria da competência.
        </p>
        <label className="cr-field">
          <span>Motivo da reabertura</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explique qual informação precisa ser corrigida."
            rows={4}
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
        <button
          type="button"
          className="btn btn-primary"
          onClick={submit}
          disabled={reason.trim().length < 10 || saving}
        >
          {saving ? 'Enviando...' : 'Enviar solicitação'}
        </button>
      </footer>
    </OverlayModal>
  );
}
