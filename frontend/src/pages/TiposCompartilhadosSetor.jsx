import { useEffect, useMemo, useState } from 'react';
import { getSetores } from '../services/setores';
import { getTiposSolicitacao } from '../services/tiposSolicitacao';
import {
  getTiposCompartilhadosSetor,
  salvarTiposCompartilhadosSetor
} from '../services/configuracoesSistema';
import { Pagina, PageHeader, BlocoConteudo, CampoForm, Avisos, useAvisos } from '../components/padrao';

function normalizarSetorToken(setor) {
  return String(setor?.codigo || setor?.nome || setor?.id || '').trim().toUpperCase();
}

export default function TiposCompartilhadosSetor() {
  const [setores, setSetores] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [regras, setRegras] = useState({});
  const [setorOrigem, setSetorOrigem] = useState('');
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  // R3/R19: aviso do sistema no lugar da caixa do navegador.
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    async function carregar() {
      try {
        setLoading(true);
        const [setoresData, tiposData, configuracao] = await Promise.all([
          getSetores(),
          getTiposSolicitacao(),
          getTiposCompartilhadosSetor()
        ]);
        const setoresAtivos = Array.isArray(setoresData)
          ? setoresData.filter(item => item?.ativo !== false)
          : [];
        const ordenados = setoresAtivos.sort((a, b) =>
          String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR')
        );
        setSetores(ordenados);
        setTipos(Array.isArray(tiposData) ? tiposData : []);
        setRegras(configuracao?.regras && typeof configuracao.regras === 'object' ? configuracao.regras : {});
        if (ordenados.length > 0) setSetorOrigem(normalizarSetorToken(ordenados[0]));
      } catch (error) {
        console.error(error);
        avisar.erro('Erro ao carregar configuração de tipos compartilhados.');
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, []);

  const tiposOrdenados = useMemo(() => (
    [...tipos].sort((a, b) => String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR'))
  ), [tipos]);

  const regraAtual = regras?.[setorOrigem] && typeof regras[setorOrigem] === 'object'
    ? regras[setorOrigem]
    : {};

  function alternar(tipoId, setorToken) {
    const chaveTipo = String(tipoId);
    const token = String(setorToken || '').trim().toUpperCase();

    setRegras(prev => {
      const regraOrigem = prev?.[setorOrigem] && typeof prev[setorOrigem] === 'object'
        ? { ...prev[setorOrigem] }
        : {};
      const selecionados = new Set(Array.isArray(regraOrigem[chaveTipo]) ? regraOrigem[chaveTipo] : []);

      if (selecionados.has(token)) selecionados.delete(token);
      else selecionados.add(token);

      const novaLista = Array.from(selecionados).sort((a, b) => a.localeCompare(b, 'pt-BR'));
      if (novaLista.length) regraOrigem[chaveTipo] = novaLista;
      else delete regraOrigem[chaveTipo];

      const next = { ...prev };
      if (Object.keys(regraOrigem).length) next[setorOrigem] = regraOrigem;
      else delete next[setorOrigem];
      return next;
    });
  }

  async function salvar() {
    try {
      setSalvando(true);
      await salvarTiposCompartilhadosSetor({ regras });
      avisar.sucesso('Configuração salva com sucesso.');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao salvar configuracao.');
    } finally {
      setSalvando(false);
    }
  }

  if (loading) {
    return (
      <Pagina className="max-w-6xl mx-auto">
        <p className="text-sm" style={{ color: 'var(--c-muted)' }}>Carregando configurações...</p>
      </Pagina>
    );
  }

  return (
    <Pagina className="max-w-6xl mx-auto">
      {/* C2: apoio na faixa (decisão 02/09) — contagem + descrição em uma
          linha no próprio PageHeader. */}
      <PageHeader
        titulo="Tipos Compartilhados entre Setores"
        contagem={`${tiposOrdenados.length} tipo(s)`}
        descricao="Permite que outros setores enxerguem tipos específicos sem alterar a área responsável da solicitação."
        acaoPrincipal={{
          rotulo: salvando ? 'Salvando...' : 'Salvar configuracao',
          onClick: salvar,
          desabilitada: salvando
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo
        titulo="Compartilhamento por tipo"
        variante="primario"
        cor="var(--c-primary)"
      >
        <div className="space-y-6">
          <div className="max-w-md">
            <CampoForm label="Setor de origem">
              <select className="input w-full" value={setorOrigem} onChange={event => setSetorOrigem(event.target.value)}>
                {setores.map(setor => {
                  const token = normalizarSetorToken(setor);
                  return (
                    <option key={setor.id} value={token}>
                      {setor.nome} ({token})
                    </option>
                  );
                })}
              </select>
            </CampoForm>
          </div>

          <div className="divide-y divide-[var(--c-border)] rounded-2xl border border-[var(--c-border)] overflow-hidden">
            {tiposOrdenados.map(tipo => {
              const selecionados = new Set(Array.isArray(regraAtual?.[String(tipo.id)]) ? regraAtual[String(tipo.id)] : []);

              return (
                <section key={tipo.id} className="grid grid-cols-1 gap-4 bg-[var(--ui-surface)] p-4 lg:grid-cols-[260px_1fr]">
                  <div>
                    <h3 className="font-semibold text-[var(--c-text)]">
                      {tipo.nome}
                      {selecionados.size > 0 && (
                        <span className="ml-2 text-xs font-normal text-[var(--c-muted)]">
                          {selecionados.size} setor(es)
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-[var(--c-muted)]">Marque os setores adicionais que poderao visualizar.</p>
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {setores
                      .filter(setor => normalizarSetorToken(setor) !== setorOrigem)
                      .map(setor => {
                        const token = normalizarSetorToken(setor);
                        return (
                          <label key={`${tipo.id}-${setor.id}`} className="flex items-center gap-2 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selecionados.has(token)}
                              onChange={() => alternar(tipo.id, token)}
                            />
                            <span>{setor.nome} ({token})</span>
                          </label>
                        );
                      })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </BlocoConteudo>
    </Pagina>
  );
}
