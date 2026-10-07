import { CampoForm, FormSecao } from '../padrao/FormSecao';
import { maskCpfCnpj } from '../../utils/formatters';
import { parceiroEhEmpresa } from '../../utils/dadosEmpresaParceiro';

export default function DadosEmpresaParceiro({ form, onChange, obrigatorio = true, mostrarRepresentante = true, disabled = false }) {
  if (!parceiroEhEmpresa(form)) return null;

  return (
    <FormSecao legenda={mostrarRepresentante ? 'Dados da empresa e representante legal' : 'Dados da empresa'} colunas={2}>
      <CampoForm label="Nome fantasia" obrigatorio={obrigatorio}>
        <input className="input input-sm" name="nome_fantasia"
          value={form.nome_fantasia || ''} required={obrigatorio} disabled={disabled}
          onChange={event => onChange('nome_fantasia', event.target.value)} />
      </CampoForm>
      {mostrarRepresentante && (
        <>
          <CampoForm label="Nome do representante legal">
            <input className="input input-sm" name="representante_nome"
              value={form.representante_nome || ''} disabled={disabled}
              onChange={event => onChange('representante_nome', event.target.value)} />
          </CampoForm>
          <CampoForm label="CPF do representante legal">
            <input className="input input-sm" name="representante_cpf" inputMode="numeric" maxLength={14}
              value={form.representante_cpf || ''} disabled={disabled}
              onChange={event => onChange('representante_cpf', maskCpfCnpj(event.target.value))} />
          </CampoForm>
          <CampoForm label="Cargo do representante legal">
            <input className="input input-sm" name="representante_cargo"
              value={form.representante_cargo || ''} disabled={disabled}
              onChange={event => onChange('representante_cargo', event.target.value)} />
          </CampoForm>
        </>
      )}
    </FormSecao>
  );
}
