export default function ModalAlterarStatus({
  aberto,
  onClose,
  onSalvar
}) {

  if (!aberto) return null;

  const status = [
    'EM_ANALISE',
    'AGUARDANDO_AJUSTE',
    'APROVADA',
    'REJEITADA',
    'CONCLUIDA'
  ];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">

      <div className="bg-white p-6 rounded-xl w-full max-w-sm">

        <h2 className="font-semibold mb-4">
          Alterar Status
        </h2>

        <div className="space-y-2">
          {status.map(s => (
            <button
              key={s}
              onClick={() => onSalvar(s)}
              className="w-full p-2 rounded border hover:bg-gray-100"
            >
              {s}
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="mt-4 text-sm text-gray-500"
        >
          Cancelar
        </button>

      </div>

    </div>
  );
}
