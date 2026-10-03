import { getCpfCnpjError, maskCpfCnpj } from '../../utils/formatters';

const fields = [
  ['cheque_numero', 'Numero do cheque', true],
  ['cheque_emitente', 'Emitente / titular', true],
  ['titular_documento', 'CPF/CNPJ do titular'],
  ['cheque_banco', 'Banco'],
  ['cheque_agencia', 'Agencia'],
  ['cheque_conta', 'Conta'],
  ['data_emissao', 'Data de emissao', false, 'date'],
  ['data_vencimento', 'Data de vencimento / compensacao', false, 'date']
];

export default function ChequePagamentoFields({
  value = {},
  onChange,
  title = 'Dados do cheque usado no pagamento',
  description = 'Informe os dados impressos no cheque para manter a baixa identificada e auditavel.',
  compact = false,
  className = ''
}) {
  const update = (field, nextValue) => onChange?.(field, nextValue);

  const updateField = (field, event) => {
    const nextValue = field === 'titular_documento'
      ? maskCpfCnpj(event.target.value)
      : event.target.value;
    if (field === 'titular_documento') {
      event.target.setCustomValidity(getCpfCnpjError(nextValue, {
        label: 'CPF/CNPJ do titular do cheque'
      }));
    }
    update(field, nextValue);
  };

  return (
    <section className={`rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] ${compact ? 'p-3' : 'p-4'} ${className}`}>
      <div className="mb-3">
        <strong className="block text-sm text-[var(--c-text)]">{title}</strong>
        {description ? <span className="mt-1 block text-xs text-[var(--c-muted)]">{description}</span> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {fields.map(([field, label, required, type = 'text']) => (
          <label key={field} className="app-filter-field min-w-0">
            <span className="app-filter-label">{label}{required ? ' *' : ''}</span>
            <input
              className={`input w-full ${compact ? 'input-sm' : ''}`}
              type={type}
              value={field === 'titular_documento' ? maskCpfCnpj(value?.[field]) : (value?.[field] || '')}
              onChange={(event) => updateField(field, event)}
              inputMode={field === 'titular_documento' ? 'numeric' : undefined}
              maxLength={field === 'titular_documento' ? 18 : undefined}
              required={Boolean(required)}
              autoComplete="off"
            />
          </label>
        ))}
      </div>
    </section>
  );
}
