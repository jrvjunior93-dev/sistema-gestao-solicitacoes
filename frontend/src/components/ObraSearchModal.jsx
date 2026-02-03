export default function ObraSearchModal({
  aberto,
  obras,
  onClose,
  onSelect
}) {
  if (!aberto) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-xl w-full max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Obras encontradas</h2>
          <button className="text-sm text-gray-500" onClick={onClose}>
            Fechar
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Nome</th>
                <th>Cidade</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {(obras || []).map(o => (
                <tr key={o.id}>
                  <td>{o.codigo || '-'}</td>
                  <td>{o.nome}</td>
                  <td>{o.cidade || '-'}</td>
                  <td>
                    <button className="btn btn-outline" onClick={() => onSelect(o)}>
                      Selecionar
                    </button>
                  </td>
                </tr>
              ))}
              {(obras || []).length === 0 && (
                <tr>
                  <td colSpan="4" align="center">Nenhuma obra encontrada</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
