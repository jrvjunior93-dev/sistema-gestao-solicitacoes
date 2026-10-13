import { CampoForm } from '../padrao';
import { formatCurrencyInput } from '../../utils/formatters';
import { PIX_TEXTO_MAX } from '../../utils/pix';

// Revisao local do lote: nao salva nem altera o cadastro dos colaboradores.
export default function RhTicketPagamentoCampos({ form, colaboradores, onChange, disabled }) {
  const pix = form.forma_pagamento === 'PIX';
  function alterarChave(id, chave_pix) {
    onChange({ ...form, pix_revisado: false, pagamentos_pix: form.pagamentos_pix.map(p =>
      Number(p.colaborador_id) === Number(id) ? { ...p, chave_pix } : p) });
  }
  return <div className="min-w-0 space-y-3">
    <CampoForm label="Forma de pagamento do ticket" obrigatorio>
      <select className="form-control" aria-label="Forma de pagamento do ticket" disabled={disabled}
        value={form.forma_pagamento} onChange={e => onChange({ ...form, forma_pagamento: e.target.value, boleto: null, pix_revisado: false })}>
        <option value="BOLETO">Boleto</option><option value="PIX">Pix por colaborador</option>
      </select>
    </CampoForm>
    {!pix ? <CampoForm label="Boleto do ticket" obrigatorio>
      <input type="file" className="form-control" aria-label="Boleto do ticket" accept=".pdf,image/*" required disabled={disabled}
        onChange={e => onChange({ ...form, boleto: e.target.files?.[0] || null })} />
      <span className="app-note">O boleto será anexado à solicitação e poderá ser consultado na fila de pagamentos.</span>
    </CampoForm> : <>
      <p className="app-note">Um título por colaborador. Confira o favorecido e a chave Pix; alterações valem somente para este lote.</p>
      <div className="max-w-full overflow-x-auto rounded border" role="region" aria-label="Revisão de chaves Pix" tabIndex={0} style={{ borderColor: 'var(--c-border)' }}>
        <table className="min-w-[560px] w-full text-sm">
          <thead><tr className="text-left"><th className="p-2">Colaborador / favorecido</th><th className="p-2">Valor</th><th className="p-2">Chave Pix / Copia e Cola</th></tr></thead>
          <tbody>{colaboradores.map(c => <tr key={c.id} className="border-t" style={{ borderColor: 'var(--c-border)' }}>
            <td className="p-2"><strong>{c.nome}</strong><span className="app-note block">{c.pagamento?.favorecido_nome || c.nome}</span>
              <span className="app-note block">{c.pagamento?.favorecido_documento || c.cpf}</span></td>
            <td className="p-2 whitespace-nowrap">{formatCurrencyInput(String(c.valor_ticket || 0))}</td>
            <td className="p-2"><textarea className="form-control min-w-[180px]" rows={2} maxLength={PIX_TEXTO_MAX} required disabled={disabled}
              aria-label={`Chave Pix de ${c.nome}`} value={form.pagamentos_pix.find(p => Number(p.colaborador_id) === Number(c.id))?.chave_pix || ''}
              onChange={e => alterarChave(c.id, e.target.value)} /></td>
          </tr>)}</tbody>
        </table>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" required disabled={disabled} checked={form.pix_revisado}
        onChange={e => onChange({ ...form, pix_revisado: e.target.checked })} />Conferi os favorecidos e as chaves Pix deste lote</label>
    </>}
  </div>;
}
