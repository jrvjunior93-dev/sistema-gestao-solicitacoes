const cores = {
  PENDENTE: 'bg-gray-400',
  EM_ANALISE: 'bg-blue-500',
  AGUARDANDO_AJUSTE: 'bg-yellow-400',
  APROVADA: 'bg-green-500',
  REJEITADA: 'bg-red-500',
  CONCLUIDA: 'bg-emerald-500'
};

export default function StatusBadge({ status }) {
  return (
    <span
      className={`text-white px-2 py-1 rounded text-xs ${cores[status] || 'bg-gray-400'}`}
    >
      {status}
    </span>
  );
}
