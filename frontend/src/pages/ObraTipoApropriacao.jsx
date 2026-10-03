import { useEffect, useMemo, useState } from 'react';
import { Pagina, PageHeader, BlocoConteudo, BarraFiltros, useConfirmacao } from '../components/padrao';
import {
  getObraTipoApropriacao,
  getApropriacoesDaObra,
  salvarObraTipoApropriacao
} from '../services/configuracoesSistema';

/**
 * Mapeamento da apropriacao padrao por obra e tipo de solicitacao.
 *
 * As apropriacoes das etapas automaticas podem variar entre obras, entao o vinculo
 * precisa permanecer visivel e editavel obra a obra, inclusive para PRE_OBRA.
 */

// Nomes de obra usam acento ("GUAÇUÍ"), mas quem filtra costuma digitar sem.
function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase();
}

export default function ObraTipoApropriacao() {
  const [tipos, setTipos] = useState([]);
  const [obras, setObras] = useState([]);
  const [padroesNovaObra, setPadroesNovaObra] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [somentePendentes, setSomentePendentes] = useState(false);

  // Celula aberta para escolha: { obraId, tipoId }
  const [celulaAberta, setCelulaAberta] = useState(null);
  const [opcoes, setOpcoes] = useState([]);
  const [buscaOpcao, setBuscaOpcao] = useState('');
  const [carregandoOpcoes, setCarregandoOpcoes] = useState(false);
  const [salvandoChave, setSalvandoChave] = useState('');
  const [erro, setErro] = useState('');
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  useEffect(() => {
    async function load() {
      try {
        const data = await getObraTipoApropriacao();
        setTipos(Array.isArray(data?.tipos) ? data.tipos : []);
        setObras(Array.isArray(data?.obras) ? data.obras : []);
        setPadroesNovaObra(Array.isArray(data?.padroes_nova_obra) ? data.padroes_nova_obra : []);
      } catch (e) {
        setErro('Não foi possível carregar o mapeamento.');
      } finally {
        setCarregando(false);
      }
    }
    load();
  }, []);

  const obrasVisiveis = useMemo(() => {
    const termo = normalizar(filtro);
    return obras.filter((obra) => {
      if (termo) {
        const alvo = normalizar(`${obra.nome || ''} ${obra.codigo || ''}`);
        if (!alvo.includes(termo)) return false;
      }
      if (somentePendentes) {
        const preenchidos = tipos.filter((t) => obra.vinculos?.[String(t.id)]).length;
        if (preenchidos === tipos.length) return false;
      }
      return true;
    });
  }, [obras, filtro, somentePendentes, tipos]);

  const totalPendentes = useMemo(() => {
    return obras.reduce((acc, obra) => {
      const faltando = tipos.filter((t) => !obra.vinculos?.[String(t.id)]).length;
      return acc + faltando;
    }, 0);
  }, [obras, tipos]);

  const totalVinculos = obras.length * tipos.length;

  async function abrirSelecao(obraId, tipoId) {
    const mesmaCelula = celulaAberta?.obraId === obraId && celulaAberta?.tipoId === tipoId;
    if (mesmaCelula) {
      setCelulaAberta(null);
      return;
    }

    setCelulaAberta({ obraId, tipoId });
    setBuscaOpcao('');
    setCarregandoOpcoes(true);
    try {
      const data = await getApropriacoesDaObra(obraId);
      setOpcoes(Array.isArray(data?.apropriacoes) ? data.apropriacoes : []);
    } catch {
      setOpcoes([]);
    } finally {
      setCarregandoOpcoes(false);
    }
  }

  async function buscarOpcoes(obraId, termo) {
    setBuscaOpcao(termo);
    setCarregandoOpcoes(true);
    try {
      const data = await getApropriacoesDaObra(obraId, termo);
      setOpcoes(Array.isArray(data?.apropriacoes) ? data.apropriacoes : []);
    } catch {
      setOpcoes([]);
    } finally {
      setCarregandoOpcoes(false);
    }
  }

  async function definir(obraId, tipoId, apropriacaoId) {
    if (apropriacaoId === null) {
      const tipo = tipos.find((item) => Number(item.id) === Number(tipoId));
      const obra = obras.find((item) => Number(item.id) === Number(obraId));
      const { ok } = await confirmar({
        titulo: 'Remover vínculo de apropriação',
        mensagem: `Remover o vinculo de ${tipo?.nome || 'tipo'} da obra ${obra?.codigo || obra?.nome || obraId}? Novas solicitacoes deste tipo ficarao bloqueadas ate um novo vinculo ser definido.`,
        rotuloConfirmar: 'Remover vinculo',
        rotuloCancelar: 'Manter vinculo',
        destrutiva: true
      });
      if (!ok) return;
    }

    const chave = `${obraId}-${tipoId}`;
    setSalvandoChave(chave);
    setErro('');
    try {
      const resposta = await salvarObraTipoApropriacao({
        obra_id: obraId,
        tipo_solicitacao_id: tipoId,
        apropriacao_id: apropriacaoId
      });

      setObras((prev) => prev.map((obra) => {
        if (obra.id !== obraId) return obra;
        const vinculos = { ...(obra.vinculos || {}) };
        if (resposta?.removido) {
          delete vinculos[String(tipoId)];
        } else {
          vinculos[String(tipoId)] = resposta.vinculo;
        }
        return { ...obra, vinculos };
      }));

      setCelulaAberta(null);
    } catch (e) {
      setErro(e?.message || 'Nao foi possivel salvar o vinculo.');
    } finally {
      setSalvandoChave('');
    }
  }

  if (carregando) {
    return (
      <Pagina>
        <h1 className="page-title">Apropriação padrão por obra</h1>
        <div className="card">Carregando...</div>
      </Pagina>
    );
  }

  return (
    <Pagina>
      {/* C2: apoio na faixa (decisão 02/09) — contagem + descrição em uma
          linha no próprio PageHeader. */}
      <PageHeader
        titulo="Apropriação padrão por obra"
        contagem={totalVinculos - totalPendentes
          ? `${totalVinculos - totalPendentes} de ${totalVinculos} vinculos definidos`
          : null}
        descricao="Defina qual apropriação será preenchida automaticamente na Nova Solicitação para cada obra e tipo. Como os códigos variam entre as obras, o vínculo e informado obra a obra."
      />

      {padroesNovaObra.length > 0 && (
        <BlocoConteudo titulo="Novas obras recebem automaticamente" variante="secundario" recolhivel>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            {padroesNovaObra.map((padrao) => (
              <span key={padrao.chave || `${padrao.tipo_codigo || 'APROPRIACAO'}-${padrao.codigo}`} className="text-[var(--c-muted)]">
                <strong className="text-[var(--c-text)]">{padrao.codigo}</strong> — {padrao.descricao}
              </span>
            ))}
          </div>
        </BlocoConteudo>
      )}

      <div className="app-bloco app-bloco--primario space-y-4" style={{ '--bloco-cor': 'var(--c-primary)' }}>
        {/* F1: UMA busca, ocupando a largura da faixa (padrão BarraFiltros).
            O filtro por marcação "Somente obras com pendencia" já existia e
            segue com o mesmo estado/handler. */}
        <BarraFiltros
          busca={{
            valor: filtro,
            aoMudar: setFiltro,
            placeholder: 'Filtrar obra por nome ou código'
          }}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={somentePendentes}
            onChange={(e) => setSomentePendentes(e.target.checked)}
          />
          <span>Somente obras com pendência</span>
        </label>

        {erro && <div className="app-alert app-alert--error">{erro}</div>}

        <div style={{ overflowX: 'auto' }} data-pivo="colunas-dinamicas">
          <table className="table">
            <thead>
              <tr>
                <th style={{ minWidth: 220 }}>Obra</th>
                {tipos.map((tipo) => (
                  <th key={tipo.id} style={{ minWidth: 240 }}>
                    <div>{tipo.nome}</div>
                    {tipo.apropriacao_automatica_obra && (
                      <div className="text-xs" style={{ color: 'var(--c-muted)', fontWeight: 400 }}>
                        Etapa com apropriação automática
                      </div>
                    )}
                    <div className="text-xs" style={{ color: 'var(--c-muted)', fontWeight: 400 }}>
                      {obras.filter((obra) => !obra.vinculos?.[String(tipo.id)]).length} pendente(s)
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {obrasVisiveis.map((obra) => (
                <tr key={obra.id}>
                  <td>
                    <div className="text-sm" style={{ fontWeight: 600 }}>{obra.nome}</div>
                    <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
                      Codigo {obra.codigo || '-'}
                    </div>
                  </td>

                  {tipos.map((tipo) => {
                    const vinculo = obra.vinculos?.[String(tipo.id)];
                    const chave = `${obra.id}-${tipo.id}`;
                    const aberta = celulaAberta?.obraId === obra.id && celulaAberta?.tipoId === tipo.id;

                    return (
                      <td key={tipo.id}>
                        {vinculo ? (
                          <div className="text-sm">
                            <div style={{ fontWeight: 600 }}>{vinculo.codigo}</div>
                            <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
                              {vinculo.descricao}
                            </div>
                            {vinculo.inativa && (
                              <div className="app-alert app-alert--error mt-1" style={{ padding: '4px 8px' }}>
                                Apropriação inativa — redefina o vínculo
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
                            Não definida
                          </span>
                        )}

                        <div className="flex gap-2 mt-1">
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => abrirSelecao(obra.id, tipo.id)}
                            disabled={salvandoChave === chave}
                          >
                            {aberta ? 'Fechar' : (vinculo ? 'Alterar' : 'Definir')}
                          </button>
                          {vinculo && (
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => definir(obra.id, tipo.id, null)}
                              disabled={salvandoChave === chave}
                            >
                              Remover
                            </button>
                          )}
                        </div>

                        {aberta && (
                          <div className="card mt-2" style={{ padding: 8 }}>
                            <input
                              type="text"
                              className="input w-full"
                              placeholder="Buscar por código ou descrição"
                              value={buscaOpcao}
                              onChange={(e) => buscarOpcoes(obra.id, e.target.value)}
                            />
                            <div className="max-h-56 overflow-y-auto mt-2">
                              {carregandoOpcoes && (
                                <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
                                  Carregando...
                                </div>
                              )}
                              {!carregandoOpcoes && opcoes.length === 0 && (
                                <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
                                  Nenhuma apropriação encontrada.
                                </div>
                              )}
                              {!carregandoOpcoes && opcoes.map((ap) => (
                                <button
                                  key={ap.id}
                                  type="button"
                                  className="btn btn-outline btn-sm block w-full text-left mb-1"
                                  onClick={() => definir(obra.id, tipo.id, ap.id)}
                                >
                                  <strong>{ap.codigo}</strong> — {ap.descricao}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {obrasVisiveis.length === 0 && (
          <div className="text-sm" style={{ color: 'var(--c-muted)' }}>
            Nenhuma obra encontrada com os filtros atuais.
          </div>
        )}
      </div>

      {elementoConfirmacao}
    </Pagina>
  );
}
