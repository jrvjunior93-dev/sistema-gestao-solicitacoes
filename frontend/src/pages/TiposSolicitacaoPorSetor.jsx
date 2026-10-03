import { useEffect, useMemo, useState } from 'react';
import { getSetores } from '../services/setores';
import { getTiposSolicitacao } from '../services/tiposSolicitacao';
import {
  getTiposSolicitacaoPorSetor,
  salvarTiposSolicitacaoPorSetor
} from '../services/configuracoesSistema';
import { Pagina, PageHeader, BlocoConteudo, CampoForm, Avisos, useAvisos } from '../components/padrao';

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
  // R3/R19: aviso do sistema no lugar da caixa do navegador.
  const { avisos, avisar, fechar } = useAvisos();

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
      avisar.erro('Erro ao carregar configurações de tipos por setor.');
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
      avisar.sucesso('Configuração salva.');
    } catch (error) {
      console.error(error);
      avisar.erro('Erro ao salvar configuração.');
    } finally {
      setSalvando(false);
    }
  }

  if (loading) {
    return (
      <Pagina>
        <p className="text-sm" style={{ color: 'var(--c-muted)' }}>Carregando configurações...</p>
      </Pagina>
    );
  }

  const tiposSelecionados = new Set((regraAtual.tipos || []).map(Number));

  return (
    <Pagina>
      {/* C2: apoio na faixa (decisão 02/09) — contagem + descrição em uma
          linha no próprio PageHeader. */}
      <PageHeader
        titulo="Tipos de Solicitação por Setor"
        contagem={`${tiposSelecionados.size} de ${tipos.length}`}
        descricao="Defina quais tipos ficam habilitados para cada setor e como cada tipo é recebido."
        acaoPrincipal={{
          rotulo: salvando ? 'Salvando...' : 'Salvar configuração',
          onClick: salvar,
          desabilitada: salvando
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo
        titulo="Tipos habilitados"
        variante="primario"
        cor="var(--c-primary)"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-3">
            <CampoForm label="Setor">
              <select
                className="input w-full"
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
            </CampoForm>

            <p className="app-note md:col-span-2">
              Se nenhum tipo for marcado para o setor, o sistema mantém o comportamento atual (todos os tipos disponíveis).
            </p>
          </div>

          <div className="divide-y divide-[var(--c-border)] rounded-xl border border-[var(--c-border)]">
            {tipos.map(tipo => {
              const selecionado = tiposSelecionados.has(Number(tipo.id));
              return (
                <div key={tipo.id} className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:gap-4">
                  <label className="flex items-center gap-2 app-painel-lateral">
                    <input
                      type="checkbox"
                      checked={selecionado}
                      onChange={() => toggleTipo(tipo.id)}
                    />
                    <span>{tipo.nome}</span>
                  </label>

                  <div className="md:flex-1">
                    {selecionado ? (
                      <div className="md:max-w-sm">
                        <CampoForm label="Recebimento deste tipo">
                          <select
                            className="input w-full"
                            value={regraAtual.modos?.[String(tipo.id)] || 'TODOS_VISIVEIS'}
                            onChange={e => alterarModoTipo(tipo.id, e.target.value)}
                          >
                            {MODOS.map(modo => (
                              <option key={modo.value} value={modo.value}>
                                {modo.label}
                              </option>
                            ))}
                          </select>
                        </CampoForm>
                      </div>
                    ) : (
                      <span className="text-sm" style={{ color: 'var(--c-muted)' }}>
                        Tipo não habilitado para este setor
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </BlocoConteudo>
    </Pagina>
  );
}
