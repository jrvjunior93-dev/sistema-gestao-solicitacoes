import { useEffect, useState } from 'react';
import { getTimeoutInatividade, salvarTimeoutInatividade } from '../services/configuracoesSistema';

export default function TimeoutInatividade() {
  const [minutos, setMinutos] = useState(20);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    try {
      setLoading(true);
      const data = await getTimeoutInatividade();
      const valor = Number(data?.minutos);
      if (!Number.isNaN(valor) && valor > 0) {
        setMinutos(valor);
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao carregar configuracao de inatividade');
    } finally {
      setLoading(false);
    }
  }

  async function salvar(e) {
    e.preventDefault();
    try {
      setSalvando(true);
      const valor = Number(minutos);
      if (Number.isNaN(valor) || valor < 1 || valor > 480) {
        alert('Informe um tempo entre 1 e 480 minutos.');
        return;
      }

      await salvarTimeoutInatividade({ minutos: valor });
      localStorage.setItem('timeout_inatividade_minutos', String(Math.floor(valor)));
      alert('Tempo de inatividade salvo com sucesso.');
    } catch (error) {
      console.error(error);
      alert(error?.message || 'Erro ao salvar configuracao');
    } finally {
      setSalvando(false);
    }
  }

  if (loading) {
    return <p>Carregando...</p>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tempo de Inatividade</h1>
        <p className="text-sm text-gray-600">
          Define em quantos minutos sem interação o sistema fará logout automático.
        </p>
      </div>

      <form onSubmit={salvar} className="bg-white p-6 rounded-xl shadow space-y-4">
        <label className="grid gap-1 text-sm">
          Tempo (minutos)
          <input
            type="number"
            min="1"
            max="480"
            step="1"
            className="input max-w-xs"
            value={minutos}
            onChange={e => setMinutos(e.target.value)}
          />
        </label>

        <p className="text-xs text-gray-500">
          Sugestão: `20` minutos. Valor máximo permitido: `480` minutos (8 horas).
        </p>

        <button type="submit" className="btn btn-primary" disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </form>
    </div>
  );
}
