import { useEffect, useMemo, useState } from 'react';
import { getSetores } from '../services/setores';
import {
  getAreasPorSetorOrigem,
  salvarAreasPorSetorOrigem
} from '../services/configuracoesSistema';

export default function AreasPorSetorOrigem() {
  const [setores, setSetores] = useState([]);
  const [regras, setRegras] = useState({});
  const [origemSelecionada, setOrigemSelecionada] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    async function load() {
      const [listaSetores, cfg] = await Promise.all([
        getSetores(),
        getAreasPorSetorOrigem()
      ]);

      const setoresAtivos = Array.isArray(listaSetores)
        ? listaSetores.filter(s => s?.ativo !== false)
        : [];
      setSetores(setoresAtivos);

      const regrasCarregadas = cfg?.regras && typeof cfg.regras === 'object'
        ? cfg.regras
        : {};
      setRegras(regrasCarregadas);

      const primeiroCodigo = String(setoresAtivos?.[0]?.codigo || '').toUpperCase();
      setOrigemSelecionada(primeiroCodigo);
    }
    load();
  }, []);

  const setoresOrdenados = useMemo(() => {
    return [...setores].sort((a, b) => {
      const nomeA = String(a?.nome || '').toUpperCase();
      const nomeB = String(b?.nome || '').toUpperCase();
      return nomeA.localeCompare(nomeB);
    });
  }, [setores]);

  const destinosSelecionados = useMemo(() => {
    const lista = regras[String(origemSelecionada || '').toUpperCase()] || [];
    return new Set(lista.map(item => String(item || '').toUpperCase()));
  }, [regras, origemSelecionada]);

  function alternarDestino(codigo) {
    const origem = String(origemSelecionada || '').toUpperCase();
    if (!origem) return;
    const destino = String(codigo || '').toUpperCase();

    setRegras(prev => {
      const atuais = new Set((prev[origem] || []).map(item => String(item || '').toUpperCase()));
      if (atuais.has(destino)) {
        atuais.delete(destino);
      } else {
        atuais.add(destino);
      }
      return {
        ...prev,
        [origem]: Array.from(atuais)
      };
    });
  }

  async function salvar() {
    try {
      setSalvando(true);
      await salvarAreasPorSetorOrigem({ regras });
      alert('Configuracao salva com sucesso');
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar configuracao');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Areas por setor de origem</h1>
        <p className="text-sm text-gray-600 mt-1">
          Defina quais setores cada setor pode selecionar como area responsavel na Nova Solicitacao.
        </p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow space-y-4">
        <label className="grid gap-1 text-sm md:max-w-md">
          Setor de origem
          <select
            className="input"
            value={origemSelecionada}
            onChange={e => setOrigemSelecionada(e.target.value)}
          >
            <option value="">Selecione</option>
            {setoresOrdenados.map(setor => (
              <option key={setor.id} value={String(setor.codigo || '').toUpperCase()}>
                {setor.nome} ({String(setor.codigo || '').toUpperCase()})
              </option>
            ))}
          </select>
        </label>

        {origemSelecionada && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {setoresOrdenados.map(setor => {
              const codigo = String(setor.codigo || '').toUpperCase();
              const marcado = destinosSelecionados.has(codigo);
              return (
                <label key={setor.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() => alternarDestino(codigo)}
                  />
                  <span>
                    {setor.nome} ({codigo})
                  </span>
                </label>
              );
            })}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            className="btn btn-primary"
            onClick={salvar}
            disabled={salvando}
          >
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
