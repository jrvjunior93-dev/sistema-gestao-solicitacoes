import { useEffect, useState } from 'react';
import { getSetorPermissoes, salvarSetorPermissao } from '../services/setorPermissoes';

const MODOS = [
  { value: 'ADMIN_PRIMEIRO', label: 'Admin primeiro (admin atribui)' },
  { value: 'TODOS_VISIVEIS', label: 'Todos visiveis (usuarios podem assumir/atribuir)' }
];

export default function ComportamentoRecebimentoSetor() {
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
      alert('Erro ao carregar configuracoes de recebimento.');
    } finally {
      setLoading(false);
    }
  }

  function atualizarLocal(setorId, modo) {
    setLista(prev =>
      prev.map(item =>
        item.setor_id === setorId ? { ...item, modo_recebimento: modo } : item
      )
    );
  }

  async function salvar(item) {
    try {
      setSalvando(item.setor_id);
      await salvarSetorPermissao({
        setor_id: item.setor_id,
        usuario_pode_assumir: !!item.usuario_pode_assumir,
        usuario_pode_atribuir: !!item.usuario_pode_atribuir,
        modo_recebimento: item.modo_recebimento || 'TODOS_VISIVEIS'
      });
      alert('Comportamento salvo.');
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar comportamento.');
    } finally {
      setSalvando(null);
    }
  }

  if (loading) return <p>Carregando configuracoes...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Comportamento de Recebimento por Setor</h1>

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 text-left">Setor</th>
              <th className="p-3 text-left">Comportamento no recebimento</th>
              <th className="p-3 text-left">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(item => (
              <tr key={item.setor_id} className="border-t">
                <td className="p-3">{item.nome || item.codigo || item.setor_id}</td>
                <td className="p-3">
                  <select
                    className="input"
                    value={item.modo_recebimento || 'TODOS_VISIVEIS'}
                    onChange={e => atualizarLocal(item.setor_id, e.target.value)}
                  >
                    {MODOS.map(modo => (
                      <option key={modo.value} value={modo.value}>
                        {modo.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-3">
                  <button
                    className="text-blue-600"
                    onClick={() => salvar(item)}
                    disabled={salvando === item.setor_id}
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

