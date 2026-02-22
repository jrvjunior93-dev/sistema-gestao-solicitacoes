import { useEffect, useMemo, useState } from 'react';
import { getSetores } from '../services/setores';
import { getTiposSolicitacao } from '../services/tiposSolicitacao';
import {
  getTiposSolicitacaoPorSetor,
  salvarTiposSolicitacaoPorSetor
} from '../services/configuracoesSistema';

const MODOS = [
  { value: 'ADMIN_PRIMEIRO', label: 'Admin primeiro' },
  { value: 'TODOS_VISIVEIS', label: 'Todos os usuários' }
];

function normalizarSetorKey(setor) {
  return String(setor?.codigo || setor?.nome || setor?.id || '')
    .trim()
    .toUpperCase();
}

export default function TiposSolicitacaoPorSetor() {
  const [setores, setSetores] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [regras, setRegras] = useState({});
  const [setorSelecionado, setSetorSelecionado] = useState('');
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    try {
      setLoading(true);
      const [setoresData, tiposData, cfg] = await Promise.all([
        getSetores(),
        getTiposSolicitacao(),
        getTiposSolicitacaoPorSetor()
      ]);

      const listaSetores = Array.isArray(setoresData) ? setoresData : [];
      setSetores(listaSetores);
      setTipos(Array.isArray(tiposData) ? tiposData : []);
      setRegras(cfg?.regras && typeof cfg.regras === 'object' ? cfg.regras : {});

      if (!setorSelecionado && listaSetores.length > 0) {
        setSetorSelecionado(normalizarSetorKey(listaSetores[0]));
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao carregar configurações de tipos por setor.');
    } finally {
      setLoading(false);
    }
  }

  const regraAtual = useMemo(() => {
    const regra = regras?.[setorSelecionado];
    if (!regra || typeof regra !== 'object') {
      return { tipos: [], modos: {} };
    }
    return {
      tipos: Array.isArray(regra.tipos) ? regra.tipos.map(Number).filter(Number.isFinite) : [],
      modos: regra.modos && typeof regra.modos === 'object' ? regra.modos : {}
    };
  }, [regras, setorSelecionado]);

  function atualizarRegraLocal(updater) {
    setRegras(prev => {
      const atual = prev?.[setorSelecionado] || { tipos: [], modos: {} };
      const proxima = updater({
        tipos: Array.isArray(atual.tipos) ? [...atual.tipos] : [],
        modos: atual.modos && typeof atual.modos === 'object' ? { ...atual.modos } : {}
      });
      return {
        ...prev,
        [setorSelecionado]: proxima
      };
    });
  }

  function toggleTipo(tipoId) {
    const id = Number(tipoId);
    atualizarRegraLocal(regra => {
      const set = new Set((regra.tipos || []).map(Number));
      if (set.has(id)) {
        set.delete(id);
      } else {
        set.add(id);
      }
      const tiposOrdenados = Array.from(set).sort((a, b) => a - b);
      const modos = { ...(regra.modos || {}) };
      if (!set.has(id)) {
        delete modos[String(id)];
      } else if (!modos[String(id)]) {
        modos[String(id)] = 'TODOS_VISIVEIS';
      }
      return { tipos: tiposOrdenados, modos };
    });
  }

  function alterarModoTipo(tipoId, modo) {
    const id = Number(tipoId);
    atualizarRegraLocal(regra => ({
      tipos: Array.isArray(regra.tipos) ? regra.tipos : [],
      modos: {
        ...(regra.modos || {}),
        [String(id)]: modo === 'ADMIN_PRIMEIRO' ? 'ADMIN_PRIMEIRO' : 'TODOS_VISIVEIS'
      }
    }));
  }

  async function salvar() {
    try {
      setSalvando(true);
      await salvarTiposSolicitacaoPorSetor({ regras });
      alert('Configuração salva.');
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar configuração.');
    } finally {
      setSalvando(false);
    }
  }

  if (loading) return <p>Carregando configurações...</p>;

  const tiposSelecionados = new Set((regraAtual.tipos || []).map(Number));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Tipos de Solicitação por Setor</h1>

      <div className="bg-white p-6 rounded-xl shadow space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <label className="grid gap-1 text-sm">
            Setor
            <select
              className="input"
              value={setorSelecionado}
              onChange={e => setSetorSelecionado(e.target.value)}
            >
              {setores.map(setor => {
                const key = normalizarSetorKey(setor);
                return (
                  <option key={setor.id} value={key}>
                    {setor.nome || setor.codigo || key}
                  </option>
                );
              })}
            </select>
          </label>

          <div className="text-sm text-gray-600 md:col-span-2">
            Se nenhum tipo for marcado para o setor, o sistema mantém o comportamento atual (todos os tipos disponíveis).
          </div>
        </div>

        <div className="border rounded-lg divide-y">
          {tipos.map(tipo => {
            const selecionado = tiposSelecionados.has(Number(tipo.id));
            return (
              <div key={tipo.id} className="p-3 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                <label className="flex items-center gap-2 md:min-w-[320px]">
                  <input
                    type="checkbox"
                    checked={selecionado}
                    onChange={() => toggleTipo(tipo.id)}
                  />
                  <span>{tipo.nome}</span>
                </label>

                <div className="md:flex-1">
                  {selecionado ? (
                    <label className="grid gap-1 text-sm md:max-w-sm">
                      Recebimento deste tipo
                      <select
                        className="input"
                        value={regraAtual.modos?.[String(tipo.id)] || 'TODOS_VISIVEIS'}
                        onChange={e => alterarModoTipo(tipo.id, e.target.value)}
                      >
                        {MODOS.map(modo => (
                          <option key={modo.value} value={modo.value}>
                            {modo.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <span className="text-sm text-gray-400">
                      Tipo não habilitado para este setor
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end">
          <button className="btn btn-primary" type="button" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar configuração'}
          </button>
        </div>
      </div>
    </div>
  );
}
