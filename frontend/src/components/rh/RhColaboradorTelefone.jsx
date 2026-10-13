import { useId, useState } from 'react';
import { CampoForm } from '../padrao';
import { maskPhone } from '../../utils/formatters';
import { erroTelefoneSecundario, telefoneComparavel } from '../../utils/rhColaboradorContatos';

export default function RhColaboradorTelefone({ form, setForm, secundario = false,
  disabled = false, required = false, mascarar = false }) {
  const [visitado, setVisitado] = useState(false);
  const erroId = useId();
  const campo = secundario ? 'telefone_secundario' : 'telefone';
  const erro = secundario && visitado ? erroTelefoneSecundario(form) : '';
  return <CampoForm label={secundario ? 'Segundo telefone' : 'Telefone'} obrigatorio={required}>
    <input className="form-control" type="tel" maxLength={30} value={form[campo] || ''}
      aria-label={secundario ? 'Segundo telefone' : 'Telefone'}
      disabled={disabled} required={required} aria-invalid={Boolean(erro)} aria-describedby={erro ? erroId : undefined}
      onBlur={() => setVisitado(true)}
      onChange={e => { const valor = mascarar ? maskPhone(telefoneComparavel(e.target.value)) : e.target.value;
        setForm(atual => ({ ...atual, [campo]: valor })); }} />
    {erro && <span className="form-error" id={erroId}>{erro}</span>}
  </CampoForm>;
}
