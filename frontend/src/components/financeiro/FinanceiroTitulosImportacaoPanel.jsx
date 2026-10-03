import { useMemo, useRef, useState } from 'react';
import {
  HiOutlineArrowUpTray,
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlineXMark
} from 'react-icons/hi2';
import {
  confirmarImportacaoTitulosPagar,
  criarPreviewImportacaoTitulosPagar
} from '../../services/financeiro';

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function IssueList({ title, items, tone }) {
  if (!items?.length) return null;
  const warning = tone === 'warning';
  return (
    <div className={`border-l-2 pl-3 ${warning ? 'border-amber-400' : 'border-red-500'}`}>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--c-text)]">
        <HiOutlineExclamationTriangle className={`h-4 w-4 ${warning ? 'text-amber-600' : 'text-red-600'}`} />
        {title} ({items.length})
      </div>
      <div className="max-h-52 space-y-1 overflow-auto pr-2 text-xs text-[var(--c-muted)]">
        {items.slice(0, 100).map((item, index) => (
          <p key={`${item.aba}-${item.linha}-${item.coluna}-${index}`}>
            <strong className="text-[var(--c-text)]">{item.aba} · linha {item.linha || '-'}</strong>
            {item.coluna ? ` · ${item.coluna}` : ''}: {item.mensagem}
          </p>
        ))}
        {items.length > 100 && <p>Exibindo os primeiros 100 apontamentos.</p>}
      </div>
    </div>
  );
}

export default function FinanceiroTitulosImportacaoPanel({ onClose, onConfirmed }) {
  const inputRef = useRef(null);
  const idempotencyKeyRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [acceptWarnings, setAcceptWarnings] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const canConfirm = useMemo(() => (
    preview
    && Number(preview.total_erros || 0) === 0
    && (!Number(preview.total_avisos || 0) || acceptWarnings)
    && preview.status === 'VALIDADO'
  ), [acceptWarnings, preview]);

  async function handlePreview() {
    if (!file || loadingPreview) return;
    setLoadingPreview(true);
    setError('');
    setSuccess('');
    setPreview(null);
    idempotencyKeyRef.current = null;
    setAcceptWarnings(false);
    try {
      const result = await criarPreviewImportacaoTitulosPagar(file);
      idempotencyKeyRef.current = crypto.randomUUID();
      setPreview(result);
    } catch (err) {
      setError(err?.message || 'Nao foi possivel validar a planilha.');
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleConfirm() {
    if (!canConfirm || confirming) return;
    setConfirming(true);
    setError('');
    try {
      const result = await confirmarImportacaoTitulosPagar(preview.id, {
        aceitarAvisos: acceptWarnings,
        idempotencyKey: idempotencyKeyRef.current || crypto.randomUUID()
      });
      setPreview(result);
      setSuccess(`${result.total_titulos_gerados || 0} titulo(s) criado(s) com sucesso.`);
      onConfirmed?.(result);
    } catch (err) {
      setError(err?.message || 'Nao foi possivel confirmar a importacao.');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <section className="card sol-surface-card mb-4 overflow-hidden" aria-label="Importação de contas a pagar">
      <div className="flex flex-col gap-3 border-b border-[var(--c-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--c-text)]">Importar contas a pagar</h2>
          <p className="text-xs text-[var(--c-muted)]">Envie o modelo preenchido. Nenhuma baixa e criada nesta etapa.</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm self-start" onClick={onClose} disabled={loadingPreview || confirming}>
          <HiOutlineXMark className="h-4 w-4" /> Fechar
        </button>
      </div>

      <div className="grid gap-5 px-4 py-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]">
        <div className="space-y-3">
          <button
            type="button"
            className="flex w-full items-center justify-between border border-dashed border-[var(--c-border)] bg-[var(--c-bg)] px-4 py-4 text-left transition-colors hover:border-[var(--c-primary)]"
            onClick={() => inputRef.current?.click()}
            disabled={loadingPreview || confirming}
          >
            <span>
              <span className="block text-sm font-semibold text-[var(--c-text)]">{file?.name || 'Selecionar planilha .xlsx'}</span>
              <span className="mt-1 block text-xs text-[var(--c-muted)]">Até 500 títulos por arquivo.</span>
            </span>
            <HiOutlineArrowUpTray className="h-5 w-5 text-[var(--c-primary)]" />
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setPreview(null);
              idempotencyKeyRef.current = null;
              setSuccess('');
              setError('');
            }}
          />
          <button type="button" className="btn btn-primary btn-sm w-full" onClick={handlePreview} disabled={!file || loadingPreview || confirming}>
            {loadingPreview ? 'Validando planilha...' : 'Gerar preview'}
          </button>
          {preview && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--c-border)] pt-3 text-xs">
              <div><dt className="text-[var(--c-muted)]">Importação</dt><dd className="font-semibold text-[var(--c-text)]">{preview.codigo}</dd></div>
              <div><dt className="text-[var(--c-muted)]">Títulos logicos</dt><dd className="font-semibold text-[var(--c-text)]">{preview.total_titulos_logicos}</dd></div>
              <div><dt className="text-[var(--c-muted)]">Títulos gerados</dt><dd className="font-semibold text-[var(--c-text)]">{preview.total_titulos_gerados}</dd></div>
              <div><dt className="text-[var(--c-muted)]">Valor líquido</dt><dd className="font-semibold text-[var(--c-text)]">{formatCurrency(preview.valor_liquido)}</dd></div>
            </dl>
          )}
        </div>

        <div className="min-h-44 border-l-0 border-[var(--c-border)] lg:border-l lg:pl-5">
          {!preview && !error && (
            <div className="flex h-full min-h-40 items-center text-sm text-[var(--c-muted)]">
              O preview mostrara erros por aba e linha antes de qualquer gravacao financeira.
            </div>
          )}
          {error && <div className="alert alert-error mb-3">{error}</div>}
          {success && (
            <div className="mb-3 flex items-center gap-2 border-l-2 border-emerald-500 pl-3 text-sm font-semibold text-emerald-700">
              <HiOutlineCheckCircle className="h-5 w-5" /> {success}
            </div>
          )}
          {preview && preview.status !== 'CONFIRMADO' && (
            <div className="space-y-4">
              <IssueList title="Erros que bloqueiam a importação" items={preview.erros} tone="error" />
              <IssueList title="Avisos para revisão" items={preview.avisos} tone="warning" />
              {!preview.erros?.length && !preview.avisos?.length && (
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                  <HiOutlineCheckCircle className="h-5 w-5" /> Planilha pronta para confirmacao.
                </div>
              )}
              {Number(preview.total_avisos || 0) > 0 && (
                <label className="flex items-start gap-2 text-xs text-[var(--c-text)]">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--c-primary)]" checked={acceptWarnings} onChange={(event) => setAcceptWarnings(event.target.checked)} />
                  Revisei os avisos de duplicidade e/ou pendências cadastrais e confirmo a importação.
                </label>
              )}
              <div className="flex justify-end border-t border-[var(--c-border)] pt-3">
                <button type="button" className="btn btn-primary btn-sm" onClick={handleConfirm} disabled={!canConfirm || confirming}>
                  {confirming ? 'Confirmando...' : 'Confirmar importacao'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
