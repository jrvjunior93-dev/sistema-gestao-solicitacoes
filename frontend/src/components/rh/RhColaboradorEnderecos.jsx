import { CampoForm, FormSecao } from '../padrao';
import { CAMPOS_ENDERECO, enderecoSecundario, temEnderecoSecundario } from '../../utils/rhColaboradorContatos';

export default function RhColaboradorEnderecos({ form, setForm, disabled = false,
  admissao = false, permitirMesmoEndereco = false }) {
  const copiando = permitirMesmoEndereco && Boolean(form.mesmo_endereco);
  function alterar(campo, valor) {
    setForm(atual => {
      const proximo = { ...atual, [campo]: valor };
      return permitirMesmoEndereco && atual.mesmo_endereco
        ? { ...proximo, ...enderecoSecundario(proximo, true) } : proximo;
    });
  }
  function campos(secundario = false) {
    return CAMPOS_ENDERECO.map(({ campo, label, max, obrigatorio }) => {
      const chave = secundario ? `${campo}_secundario` : campo;
      const requerido = obrigatorio && (secundario ? temEnderecoSecundario(form) : admissao);
      return <CampoForm key={chave} label={label} obrigatorio={requerido}>
        <input className="form-control" maxLength={max} required={requerido}
          disabled={disabled} readOnly={secundario && copiando}
          value={form[chave] || ''} onChange={e => alterar(chave, campo === 'estado'
            ? e.target.value.toUpperCase() : e.target.value)} />
      </CampoForm>;
    });
  }
  return <>
    <FormSecao legenda="Endereço" colunas={3}>{campos()}</FormSecao>
    <FormSecao legenda="Segundo endereço" colunas={3}>
      {permitirMesmoEndereco && <label className="form-campo--linha flex items-center gap-2">
        <input type="checkbox" disabled={disabled} checked={copiando}
          onChange={e => { const marcado = e.target.checked; setForm(atual => ({ ...atual,
            mesmo_endereco: marcado, ...(marcado ? enderecoSecundario(atual, true) : {}) })); }} />
        Usar o mesmo endereço
      </label>}
      {campos(true)}
    </FormSecao>
  </>;
}
