export default function Filtros({
  filtros,
  setFiltros,
  onBuscarObraDescricao,
  tiposSolicitacao = [],
  mostrarSomaValor = false,
  somaValorFiltrado = 0
}) {

  function handleChange(e) {
    const { name, value } = e.target;
    setFiltros(prev => ({
      ...prev,
      [name]: value,
      ...(name === 'obra_descricao' ? { obra_ids: '' } : {})
    }));
  }

  function onKeyBuscar(e) {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      onBuscarObraDescricao?.();
    }
  }

  function limparFiltros() {
    setFiltros({
      obra_descricao: '',
      obra_ids: '',
      tipo_solicitacao_id: '',
      status: '',
      codigo_contrato: '',
      valor_min: ''
    });
  }

  return (
    <div className="bg-white p-4 rounded-xl shadow mb-6 grid grid-cols-1 md:grid-cols-6 gap-4">

      <div className="flex gap-2">
        <input
          name="obra_descricao"
          placeholder="Obra (descricao)"
          className="input"
          value={filtros.obra_descricao || ''}
          onChange={handleChange}
          onKeyDown={onKeyBuscar}
        />
      </div>

      <select
        name="tipo_solicitacao_id"
        className="input"
        value={filtros.tipo_solicitacao_id || ''}
        onChange={handleChange}
      >
        <option value="">Tipo de Solicitacao</option>
        {tiposSolicitacao.map(t => (
          <option key={t.id} value={t.id}>{t.nome}</option>
        ))}
      </select>

      <select name="status" onChange={handleChange} className="input" value={filtros.status || ''}>
        <option value="">Status</option>
        <option value="PENDENTE">Pendente</option>
        <option value="EM_ANALISE">Em analise</option>
        <option value="APROVADA">Aprovada</option>
        <option value="CONCLUIDA">Concluida</option>
      </select>

      <input
        name="codigo_contrato"
        placeholder="Contrato"
        className="input"
        value={filtros.codigo_contrato || ''}
        onChange={handleChange}
      />

      <input
        name="valor_min"
        placeholder="Valor minimo"
        className="input"
        value={filtros.valor_min || ''}
        onChange={handleChange}
        type="number"
        step="0.01"
        min="0"
      />

      <div className="flex gap-2">
        <button className="btn btn-outline" type="button" onClick={onBuscarObraDescricao}>
          Buscar
        </button>
        <button className="btn btn-outline" type="button" onClick={limparFiltros}>
          Limpar
        </button>
      </div>

      {mostrarSomaValor && (
        <div className="md:col-span-2">
          <label className="text-sm text-gray-600">Soma do valor filtrado</label>
          <input
            className="input mt-1"
            value={Number(somaValorFiltrado || 0).toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL'
            })}
            readOnly
          />
        </div>
      )}

    </div>
  );
}
