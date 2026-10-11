import { CampoForm, FormSecao } from '../padrao';
import { CAMPOS_ENDERECO, enderecoSecundario } from '../../utils/rhColaboradorContatos';

export default function RhColaboradorEnderecos({ form, setForm, disabled = false, admissao = false }) {
  function alterar(campo, valor) {
    setForm(atual => {
      const proximo = { ...atual, [campo]: valor };
      return atual.mesmo_endereco ? { ...proximo, ...enderecoSecundario(proximo, true) } : proximo;
    });
  }
  function campos(secundario = false) {
    return CAMPOS_ENDERECO.map(({ campo, label, max, obrigatorio }) => {
      const chave = secundario ? `${campo}_secundario` : campo;
      const requerido = obrigatorio && (admissao || secundario);
      return <CampoForm key={chave} label={label} obrigatorio={requerido}>
        <input className="form-control" maxLength={max} required={requerido}
          disabled={disabled} readOnly={secundario && Boolean(form.mesmo_endereco)}
          value={form[chave] || ''} onChange={e => alterar(chave, campo === 'estado'
            ? e.target.value.toUpperCase() : e.target.value)} />
      </CampoForm>;
    });
  }
  return <>
    <FormSecao legenda="Endereço" colunas={3}>{campos()}</FormSecao>
    {form.mostrarEnderecoSecundario && <FormSecao legenda="Segundo endereço" colunas={3}>
      {admissao && <label className="form-campo--linha flex items-center gap-2">
        <input type="checkbox" disabled={disabled} checked={Boolean(form.mesmo_endereco)}
          onChange={e => { const marcado = e.target.checked; setForm(atual => ({ ...atual,
            mesmo_endereco: marcado, ...(marcado ? enderecoSecundario(atual, true) : {}) })); }} />
        Usar o mesmo endereço
      </label>}
      {campos(true)}
    </FormSecao>}
    {!disabled && <button type="button" className="btn btn-outline btn-sm" onClick={() => setForm(atual => ({
      ...atual, mostrarEnderecoSecundario: !atual.mostrarEnderecoSecundario,
      ...(atual.mostrarEnderecoSecundario ? { ...enderecoSecundario(atual), mesmo_endereco: false } : {})
    }))}>{form.mostrarEnderecoSecundario ? 'Remover segundo endereço' : 'Adicionar segundo endereço'}</button>}
  </>;
}
