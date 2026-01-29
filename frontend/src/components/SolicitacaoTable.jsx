import StatusBadge from "./StatusBadge";

export default function SolicitacaoTable({ solicitacoes }) {
  return (
    <table className="w-full border-collapse">

      <thead className="bg-gray-100">
        <tr>
          <th className="p-2 text-left">Código</th>
          <th>Obra</th>
          <th>Status</th>
          <th>Área</th>
        </tr>
      </thead>

      <tbody>
        {solicitacoes.map(s => (
          <tr key={s.id} className="border-t">
            <td className="p-2">{s.codigo}</td>
            <td>{s.Obra?.nome}</td>
            <td><StatusBadge status={s.status_global} /></td>
            <td>{s.area_responsavel}</td>
          </tr>
        ))}
      </tbody>

    </table>
  );
}
