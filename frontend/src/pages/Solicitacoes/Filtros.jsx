export default function Filtros({
  filtros,
  setFiltros,
  onBuscarObraDescricao,
  setores = [],
  tiposSolicitacao = [],
  statusOptions = [],
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
      area: '',
      tipo_solicitacao_id: '',
      status: '',
      valor_min: '',
      valor_max: '',
      data_registro: '',
      data_vencimento: ''
    });
  }

  return (
    <div className="bg-white p-4 rounded-xl shadow mb-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
      <div className="flex gap-2">
        <input
          name="obra_descricao"
          placeholder="Obra (descrição)"
          className="input"
          value={filtros.obra_descricao || ''}
          onChange={handleChange}
          onKeyDown={onKeyBuscar}
        />
      </div>

      <select
        name="area"
        className="input"
        value={filtros.area || ''}
        onChange={handleChange}
      >
        <option value="">Setor</option>
        {setores.map(s => (
          <option key={s.id || s.codigo || s.nome} value={s.codigo || s.nome}>
            {s.nome || s.codigo}
          </option>
        ))}
      </select>

      <select
        name="tipo_solicitacao_id"
        className="input"
        value={filtros.tipo_solicitacao_id || ''}
        onChange={handleChange}
      >
        <option value="">Tipo de Solicitação</option>
        {tiposSolicitacao.map(t => (
          <option key={t.id} value={t.id}>{t.nome}</option>
        ))}
      </select>

      <select
        name="status"
        onChange={handleChange}
        className="input"
        value={filtros.status || ''}
      >
        <option value="">Status</option>
        {statusOptions.map(item => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>

      <input
        name="valor_min"
        placeholder="Valor mínimo"
        className="input"
        value={filtros.valor_min || ''}
        onChange={handleChange}
        type="number"
        step="0.01"
        min="0"
      />

      <input
        name="valor_max"
        placeholder="Valor máximo"
        className="input"
        value={filtros.valor_max || ''}
        onChange={handleChange}
        type="number"
        step="0.01"
        min="0"
      />

      <div>
        <label className="text-sm text-gray-600 block mb-1">Data de registro</label>
        <input
          name="data_registro"
          className="input"
          value={filtros.data_registro || ''}
          onChange={handleChange}
          type="date"
        />
      </div>

      <div>
        <label className="text-sm text-gray-600 block mb-1">Data de vencimento</label>
        <input
          name="data_vencimento"
          className="input"
          value={filtros.data_vencimento || ''}
          onChange={handleChange}
          type="date"
        />
      </div>

      <div className="flex gap-2 items-end md:col-span-2 xl:col-span-2">
        <button className="btn btn-outline" type="button" onClick={onBuscarObraDescricao}>
          Buscar
        </button>
        <button className="btn btn-outline" type="button" onClick={limparFiltros}>
          Limpar
        </button>
      </div>

      {mostrarSomaValor && (
        <div className="md:col-span-2 xl:col-span-2">
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
