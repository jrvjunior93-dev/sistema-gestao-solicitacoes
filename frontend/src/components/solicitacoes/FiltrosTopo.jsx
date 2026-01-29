export default function FiltrosTopo({ obraSelecionada, setObraSelecionada }) {
  return (
    <div className="flex gap-6 mb-6">

      <div>
        <label className="text-sm">Visão</label>
        <select className="border p-2 rounded w-48">
          <option>Minha Área</option>
          <option>Todas</option>
          <option>Minhas Solicitações</option>
        </select>
      </div>

      <div>
        <label className="text-sm">Obra</label>
        <select
          className="border p-2 rounded w-48"
          value={obraSelecionada}
          onChange={e => setObraSelecionada(e.target.value)}
        >
          <option value="TODAS">Todas</option>
        </select>
      </div>

    </div>
  );
}
