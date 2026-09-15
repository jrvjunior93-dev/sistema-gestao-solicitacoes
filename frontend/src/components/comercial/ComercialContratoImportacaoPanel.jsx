import { useRef, useState } from 'react';
import {
  baixarModeloImportacaoContratosSienge,
  confirmarImportacaoContratosSienge,
  criarPreviewImportacaoContratosSienge
} from '../../services/comercial';

function currency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function IssueList({ title, items, tone }) {
  if (!items?.length) return null;
  const classes = tone === 'error'
    ? 'border-rose-200 bg-rose-50 text-rose-800'
    : 'border-amber-200 bg-amber-50 text-amber-800';
  return (
    <div className={`rounded-xl border p-3 ${classes}`}>
      <div className="text-sm font-semibold">{title} ({items.length})</div>
      <div className="mt-2 max-h-52 space-y-1 overflow-y-auto text-xs">
        {items.map((item, index) => (
          <div key={`${item.aba}-${item.linha}-${item.campo}-${index}`}>
            {item.aba}{item.linha ? `, linha ${item.linha}` : ''}{item.campo ? `, ${item.campo}` : ''}: {item.mensagem}
          </div>
        ))}
      </div>
    </div>
  );
}
export default function ComercialContratoImportacaoPanel({ onImported }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [acceptWarnings, setAcceptWarnings] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function handleDownload() {
    try {
      setBusy('modelo');
      setError('');
      const blob = await baixarModeloImportacaoContratosSienge();
      downloadBlob(blob, 'modelo-importacao-contratos-sienge-v1.0.xlsx');
    } catch (err) {
      setError(err?.message || 'Erro ao baixar o modelo.');
    } finally {
      setBusy('');
    }
  }

  async function handlePreview() {
    if (!file) {
      setError('Selecione a planilha XLSX preenchida.');
      return;
    }
    try {
      setBusy('preview');
      setError('');
      setAcceptWarnings(false);
      setPreview(await criarPreviewImportacaoContratosSienge(file));
    } catch (err) {
      setError(err?.message || 'Erro ao validar a planilha.');
    } finally {
      setBusy('');
    }
  }

  async function handleConfirm() {
    if (!preview?.id) return;
    try {
      setBusy('confirmar');
      setError('');
      const result = await confirmarImportacaoContratosSienge(preview.id, { aceitar_avisos: acceptWarnings });
      setPreview(result);
      await onImported?.(result);
    } catch (err) {
      setError(err?.message || 'Erro ao confirmar a importacao.');
    } finally {
      setBusy('');
    }
  }

  const hasWarnings = Number(preview?.total_avisos || 0) > 0;
  const canConfirm = preview?.status === 'VALIDADO'
    && Number(preview?.total_erros || 0) === 0
    && (!hasWarnings || acceptWarnings);

  return (
    <section className="sol-surface-card rounded-2xl p-4 md:p-5">
      <div className="sol-filtros-head">
        <div>
          <p className="sol-filtros-title">Importar extratos do Sienge</p>
          <p className="sol-filtros-subtitle">
            Valide primeiro. Nenhum contrato, cliente, unidade ou recebimento e alterado durante a previa.
          </p>
        </div>
        <button type="button" className="btn btn-outline" onClick={handleDownload} disabled={Boolean(busy)}>
          {busy === 'modelo' ? 'Gerando modelo...' : 'Baixar modelo XLSX'}
        </button>
      </div>

      {error && <div className="app-alert app-alert--error mt-3">{error}</div>}

      <div className="mt-4 grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <label className="sol-filter-field">
          <span className="sol-filter-label">Planilha preenchida</span>
          <input
            ref={fileRef}
            className="input w-full"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setPreview(null);
              setAcceptWarnings(false);
            }}
          />
        </label>
        <button type="button" className="btn btn-primary" onClick={handlePreview} disabled={Boolean(busy) || !file}>
          {busy === 'preview' ? 'Validando...' : 'Validar planilha'}
        </button>
      </div>

      {preview && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['Contratos', preview.total_contratos],
              ['Unidades', preview.total_unidades],
              ['Parcelas', preview.total_parcelas],
              ['Recebimentos', preview.total_recebimentos],
              ['Valor contratado', currency(preview.valor_contratos)],
              ['Saldo atual', currency(preview.valor_saldo)]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-[var(--c-muted)]">{label}</div>
                <div className="mt-1 text-sm font-semibold text-[var(--c-text)]">{value ?? 0}</div>
              </div>
            ))}
          </div>

          <IssueList title="Erros que bloqueiam a importacao" items={preview.erros} tone="error" />
          <IssueList title="Avisos para conferencia" items={preview.avisos} tone="warning" />

          {preview.status === 'CONFIRMADO' ? (
            <div className="app-alert app-alert--success">
              Importacao {preview.codigo} concluida. Os contratos e titulos ja estao disponiveis na carteira comercial.
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] p-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-[var(--c-text)]">Confirmacao atomica</div>
                <div className="text-xs text-[var(--c-muted)]">
                  Se qualquer contrato falhar, a importacao inteira e desfeita. Recebimentos historicos nao movimentam conta bancaria.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {hasWarnings && (
                  <label className="inline-flex items-center gap-2 text-sm text-[var(--c-text)]">
                    <input type="checkbox" checked={acceptWarnings} onChange={(event) => setAcceptWarnings(event.target.checked)} />
                    Conferi e aceito os avisos
                  </label>
                )}
                <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={Boolean(busy) || !canConfirm}>
                  {busy === 'confirmar' ? 'Importando...' : 'Confirmar importacao'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
