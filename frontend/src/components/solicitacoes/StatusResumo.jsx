export default function StatusResumo() {
  return (
    <div className="flex gap-4 mb-6">

      <StatusCard titulo="PENDENTE" quantidade={0} />
      <StatusCard titulo="EM_ANALISE" quantidade={0} />
      <StatusCard titulo="APROVADA" quantidade={0} />
      <StatusCard titulo="CONCLUIDA" quantidade={0} />

    </div>
  );
}

function StatusCard({ titulo, quantidade }) {
  return (
    <div className="border rounded p-4 min-w-[140px]">

      <p className="text-sm text-gray-500">
        {titulo}
      </p>

      <p className="text-2xl font-bold">
        {quantidade}
      </p>

    </div>
  );
}
