export default function Filtros({ filtros, setFiltros }) {

  function handleChange(e) {
    setFiltros(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  }

  return (
    <div className="bg-white p-4 rounded-xl shadow mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">

      <input
        name="codigo_contrato"
        placeholder="Contrato"
        className="input"
        onChange={handleChange}
      />

      <select name="status" onChange={handleChange} className="input">
        <option value="">Status</option>
        <option value="PENDENTE">Pendente</option>
        <option value="EM_ANALISE">Em análise</option>
        <option value="APROVADA">Aprovada</option>
        <option value="CONCLUIDA">Concluída</option>
      </select>

      <input
        name="area"
        placeholder="Área"
        className="input"
        onChange={handleChange}
      />

      <input
        name="obra_id"
        placeholder="Obra ID"
        className="input"
        onChange={handleChange}
      />

    </div>
  );
}
