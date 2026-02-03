export default function Filtros({
  filtros,
  setFiltros,
  onBuscarObraDescricao,
  tiposSolicitacao = []
}) {

  function handleChange(e) {
    setFiltros(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  }

  function onKeyBuscar(e) {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      onBuscarObraDescricao?.();
    }
  }

  return (
    <div className="bg-white p-4 rounded-xl shadow mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">

      <div className="flex gap-2">
        <input
          name="obra_descricao"
          placeholder="Obra (descricao)"
          className="input"
          value={filtros.obra_descricao || ''}
          onChange={handleChange}
          onKeyDown={onKeyBuscar}
        />
        <button className="btn btn-outline" type="button" onClick={onBuscarObraDescricao}>
          Buscar
        </button>
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

    </div>
  );
}
