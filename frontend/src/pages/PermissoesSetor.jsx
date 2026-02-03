import { useEffect, useState } from 'react';
import { getSetorPermissoes, salvarSetorPermissao } from '../services/setorPermissoes';

export default function PermissoesSetor() {
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(null);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    try {
      setLoading(true);
      const data = await getSetorPermissoes();
      setLista(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      alert('Erro ao carregar permissoes.');
    } finally {
      setLoading(false);
    }
  }

  function atualizarLocal(id, campo, valor) {
    setLista(prev =>
      prev.map(item =>
        item.setor_id === id ? { ...item, [campo]: valor } : item
      )
    );
  }

  async function salvar(item) {
    try {
      setSalvando(item.setor_id);
      await salvarSetorPermissao({
        setor_id: item.setor_id,
        usuario_pode_assumir: !!item.usuario_pode_assumir,
        usuario_pode_atribuir: !!item.usuario_pode_atribuir
      });
      alert('Permissao salva.');
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar permissao.');
    } finally {
      setSalvando(null);
    }
  }

  if (loading) return <p>Carregando permissoes...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Permissoes por Setor</h1>

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 text-left">Setor</th>
              <th className="p-3 text-center">Usuario pode assumir</th>
              <th className="p-3 text-center">Usuario pode atribuir</th>
              <th className="p-3 text-left">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(item => (
              <tr key={item.setor_id} className="border-t">
                <td className="p-3">
                  {item.nome || item.codigo || item.setor_id}
                </td>
                <td className="p-3 text-center">
                  <input
                    type="checkbox"
                    checked={!!item.usuario_pode_assumir}
                    onChange={e => atualizarLocal(item.setor_id, 'usuario_pode_assumir', e.target.checked)}
                  />
                </td>
                <td className="p-3 text-center">
                  <input
                    type="checkbox"
                    checked={!!item.usuario_pode_atribuir}
                    onChange={e => atualizarLocal(item.setor_id, 'usuario_pode_atribuir', e.target.checked)}
                  />
                </td>
                <td className="p-3">
                  <button
                    onClick={() => salvar(item)}
                    disabled={salvando === item.setor_id}
                    className="text-blue-600"
                  >
                    {salvando === item.setor_id ? 'Salvando...' : 'Salvar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
