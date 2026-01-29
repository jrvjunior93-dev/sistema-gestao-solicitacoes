export default function HistoricoTimeline({ historicos }) {
  return (
    <div className="space-y-4">
      {historicos.map(h => (
        <div key={h.id} className="border-l-2 pl-4">
          <p className="text-sm font-medium">{h.acao}</p>
          <p className="text-xs text-gray-500">{h.createdAt}</p>
          {h.descricao && <p>{h.descricao}</p>}
        </div>
      ))}
    </div>
  );
}
