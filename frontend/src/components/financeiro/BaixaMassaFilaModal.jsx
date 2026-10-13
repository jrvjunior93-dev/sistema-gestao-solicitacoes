import { useState } from 'react';
import OverlayModal from '../ui/OverlayModal';
import DateInputBR from '../DateInputBR';

export default function BaixaMassaFilaModal({ rows, accounts, busy, onFechar, onConfirmar }) {
  const [conta, setConta] = useState('');
  const [data, setData] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [erro, setErro] = useState('');
  async function enviar(event) {
    event.preventDefault();
    if (busy) return;
    if (!conta || !data) { setErro('Informe a conta pagadora e a data do pagamento.'); return; }
    const problem = await onConfirmar({ conta_bancaria_id: Number(conta), data_baixa: data });
    if (problem) setErro(problem);
  }
  return <OverlayModal rotulo="Baixa em massa" onFechar={busy ? undefined : onFechar} largura="680px">
    <header data-modal="cabecalho" className="flex justify-between items-center border-b border-[var(--c-border)] p-4">
      <strong>Baixa em massa · {rows.length} título(s)</strong>
      <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={onFechar}>Cancelar</button>
    </header>
    <form id="baixa-massa-fila" className="p-4 space-y-4" onSubmit={enviar}>
      <fieldset disabled={busy} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm">Conta pagadora
          <select aria-label="Conta pagadora" autoFocus required className="input w-full" value={conta} onChange={event => setConta(event.target.value)}>
            <option value="">Selecione</option>
            {accounts.filter(item => item.ativo !== false && item.empresa_id).map(item =>
              <option key={item.id} value={item.id}>{item.nome} · {item.empresa?.nome || item.empresa?.razao_social || `Empresa #${item.empresa_id}`}</option>)}
          </select>
        </label>
        <label className="text-sm">Data do pagamento
          <DateInputBR aria-label="Data do pagamento" required value={data} onChange={event => setData(event.target.value)} className="input w-full" />
        </label>
      </fieldset>
      <p className="text-xs text-[var(--c-muted)]">A conta e a data serão aplicadas aos títulos selecionados. Valores, formas de pagamento, descontos, juros e multas permanecem os conferidos na fila. Cartões devem estar vinculados à conta escolhida.</p>
      {rows.length > 200 && <p role="alert" className="text-sm text-[var(--sem-danger)]">Selecione no máximo 200 títulos por baixa em massa.</p>}
      <details><summary className="cursor-pointer text-sm">Conferir títulos selecionados</summary>
        <ul className="mt-2 text-sm space-y-1">{rows.map(row => <li key={row.id}>{row.titulo?.codigo || row.id} · {row.titulo?.descricao || ''}</li>)}</ul>
      </details>
      {erro && <p role="alert" className="text-sm text-[var(--sem-danger)]">{erro}</p>}
    </form>
    <footer data-modal="rodape" className="flex justify-end gap-2 border-t border-[var(--c-border)] p-4">
      <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={onFechar}>Cancelar</button>
      <button type="submit" form="baixa-massa-fila" className="btn btn-primary btn-sm" disabled={busy || rows.length > 200}>{busy ? 'Processando...' : 'Conferir e registrar baixas'}</button>
    </footer>
  </OverlayModal>;
}
