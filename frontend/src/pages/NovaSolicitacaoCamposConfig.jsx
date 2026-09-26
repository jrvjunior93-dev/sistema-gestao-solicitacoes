import { useEffect, useMemo, useState } from 'react';
import {
  Pagina,
  PageHeader,
  TabelaPadrao,
  Avisos,
  useAvisos
} from '../components/padrao';
import { getTiposSolicitacao } from '../services/tiposSolicitacao';
import { getTiposSubContrato } from '../services/tiposSubContrato';
import { getSetores } from '../services/setores';
import { getCamposNovaSolicitacao, getTiposSolicitacaoPorSetor, salvarCamposNovaSolicitacao } from '../services/configuracoesSistema';
import { useAuth } from '../contexts/AuthContext';
import { hasEnabledModule } from '../utils/acessoProduto';
import { applyTipoSolicitacaoModuleAvailability, getTipoSolicitacaoBehavior } from '../utils/tipoSolicitacao';
import {
  CAMPOS_NOVA_SOLICITACAO,
  OPCOES_NOVA_SOLICITACAO,
  normalizarConfigCamposNovaSolicitacao,
  normalizarAreaNovaSolicitacao,
  obterOpcoesNovaSolicitacaoFrontend,
  resolverCamposNovaSolicitacaoFrontend
} from '../utils/novaSolicitacaoCampos';

const DESCRICAO = 'Defina, por area e tipo, quais campos aparecem e quais ficam obrigatorios na abertura da solicitacao.';

function filtrarTiposPorArea(listaTipos, regrasTiposPorSetor, area, listaSetores = []) {
  const areaKey = normalizarAreaNovaSolicitacao(area);
  const tiposAtivos = Array.isArray(listaTipos)
    ? listaTipos.filter((tipo) => tipo?.ativo !== false)
    : [];
  const tiposPermitidos = Array.isArray(regrasTiposPorSetor?.[areaKey]?.tipos)
    ? regrasTiposPorSetor[areaKey].tipos.map(Number).filter(Number.isFinite)
    : [];

  if (tiposPermitidos.length === 0) {
    return tiposAtivos;
  }

  const setorSelecionado = (Array.isArray(listaSetores) ? listaSetores : []).find((setor) => (
    normalizarAreaNovaSolicitacao(setor?.codigo) === areaKey
  ));
  const tokensSetorSelecionado = [setorSelecionado?.codigo, setorSelecionado?.nome]
    .map((valor) => normalizarAreaNovaSolicitacao(valor)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]+/g, '_'));
  const areaEhGerenciaProcessos = setorSelecionado?.eh_setor_geo === true
    || Number(setorSelecionado?.eh_setor_geo) === 1
    || tokensSetorSelecionado.some((token) => ['GEO', 'GERENCIA_DE_PROCESSOS'].includes(token));
  const idsPermitidos = new Set(tiposPermitidos);

  // Tipos cujo fluxo obriga destino na Gerencia de Processos precisam continuar configuraveis
  // aqui mesmo quando a lista administrativa "Tipos por Setor" ainda nao os menciona. A Nova
  // Solicitacao ja os oferece pelo catalogo da obra; esconder nesta tela criava uma regra que o
  // usuario conseguia usar, mas nao conseguia configurar.
  return tiposAtivos.filter((tipo) => (
    idsPermitidos.has(Number(tipo.id))
    || (
      areaEhGerenciaProcessos
      && (
        getTipoSolicitacaoBehavior(tipo).somente_gerencia_processos === true
        || getTipoSolicitacaoBehavior(tipo).usa_fluxo_despesa_eventual === true
      )
    )
  ));
}

export default function NovaSolicitacaoCamposConfig() {
  const { user } = useAuth();
  const moduloContratosHabilitado = hasEnabledModule(user, 'CONTRATOS');
  const moduloApropriacoesHabilitado = hasEnabledModule(user, 'OBRAS');
  const [setores, setSetores] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [tiposPorSetorConfig, setTiposPorSetorConfig] = useState({});
  const [areaSelecionada, setAreaSelecionada] = useState('');
  const [tipoSelecionadoId, setTipoSelecionadoId] = useState('');
  // Escopo de contratos 3.1-3.3: os subtipos do mesmo tipo pedem campos diferentes. A regra do
  // subtipo grava sob `tipo:subtipo` e tem precedencia; sem subtipo escolhido, edita-se o tipo,
  // que segue valendo como padrao para os subtipos sem regra propria.
  const [subtipos, setSubtipos] = useState([]);
  const [subtipoSelecionadoId, setSubtipoSelecionadoId] = useState('');
  const [regras, setRegras] = useState({});
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  // R3/R19: as tres caixas do navegador (carregar, salvar com sucesso,
  // salvar com erro) viraram aviso do sistema — a do Chrome ignora tema,
  // tipografia e tokens, bloqueia a pagina, nao existe no DOM para o
  // harness medir e some sem deixar rastro.
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    async function load() {
      try {
        const [setoresData, tiposData, tiposPorSetorData, configData] = await Promise.all([
          getSetores(),
          getTiposSolicitacao(),
          getTiposSolicitacaoPorSetor(),
          getCamposNovaSolicitacao()
        ]);
        const listaSetores = Array.isArray(setoresData) ? setoresData : [];
        const listaTipos = Array.isArray(tiposData) ? tiposData.filter((tipo) => tipo?.ativo !== false) : [];
        const regrasTiposPorSetor = tiposPorSetorData?.regras && typeof tiposPorSetorData.regras === 'object'
          ? tiposPorSetorData.regras
          : {};
        const primeiraArea = listaSetores.find((setor) => setor?.codigo)?.codigo || '';
        const tiposPrimeiraArea = filtrarTiposPorArea(
          listaTipos,
          regrasTiposPorSetor,
          primeiraArea,
          listaSetores
        );
        setSetores(listaSetores);
        setTipos(listaTipos);
        setTiposPorSetorConfig(regrasTiposPorSetor);
        setAreaSelecionada(primeiraArea);
        setTipoSelecionadoId(tiposPrimeiraArea[0]?.id ? String(tiposPrimeiraArea[0].id) : '');
        setRegras(normalizarConfigCamposNovaSolicitacao(configData).regras);
      } catch (error) {
        console.error(error);
        avisar.erro(error.message || 'Erro ao carregar configuracao dos campos');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const tiposDaArea = useMemo(
    () => filtrarTiposPorArea(tipos, tiposPorSetorConfig, areaSelecionada, setores),
    [tipos, tiposPorSetorConfig, areaSelecionada, setores]
  );

  useEffect(() => {
    if (!areaSelecionada) return;
    if (tiposDaArea.some((tipo) => String(tipo.id) === String(tipoSelecionadoId))) return;
    setTipoSelecionadoId(tiposDaArea[0]?.id ? String(tiposDaArea[0].id) : '');
  }, [areaSelecionada, tipoSelecionadoId, tiposDaArea]);

  const tipoSelecionado = useMemo(
    () => tiposDaArea.find((tipo) => String(tipo.id) === String(tipoSelecionadoId)) || null,
    [tiposDaArea, tipoSelecionadoId]
  );

  const comportamentoTipo = useMemo(() => {
    const comportamentoBase = getTipoSolicitacaoBehavior(tipoSelecionado);
    return applyTipoSolicitacaoModuleAvailability(comportamentoBase, {
      contratos: moduloContratosHabilitado,
      apropriacoes: moduloApropriacoesHabilitado
    });
  }, [tipoSelecionado, moduloContratosHabilitado, moduloApropriacoesHabilitado]);
  const camposControladosPelaApropriacaoAutomatica = useMemo(
    () => new Set(
      comportamentoTipo.usa_apropriacao_automatica_obra
        ? ['contrato', 'apropriacao_principal', 'apropriacoes_contrato']
        : []
    ),
    [comportamentoTipo.usa_apropriacao_automatica_obra]
  );
  const camposDisponiveis = useMemo(
    () => CAMPOS_NOVA_SOLICITACAO.filter(
      (campo) => (
        (!campo.somenteFluxoContratoNovo || comportamentoTipo.usa_fluxo_contrato_novo) &&
        (!campo.excetoFluxoContratoNovo || !comportamentoTipo.usa_fluxo_contrato_novo)
      )
    ),
    [comportamentoTipo.usa_fluxo_contrato_novo]
  );

  // Carrega os subtipos do tipo escolhido; trocar de tipo zera a selecao de subtipo.
  useEffect(() => {
    setSubtipoSelecionadoId('');
    if (!tipoSelecionadoId) { setSubtipos([]); return; }
    let cancelado = false;
    getTiposSubContrato({ tipo_macro_id: tipoSelecionadoId })
      // So subtipo ATIVO, como faz a Nova Solicitacao. O endpoint devolve os inativos tambem, e
      // sem este filtro daria para configurar campos de um subtipo que ninguem consegue escolher
      // — configuracao que nunca teria efeito, e que o proximo leitor acharia que tem.
      .then((lista) => {
        if (cancelado) return;
        setSubtipos(Array.isArray(lista) ? lista.filter((item) => item?.ativo !== false) : []);
      })
      // A falha aqui NAO pode ser silenciosa: sem aviso, o endpoint fora do ar
      // fica indistinguivel de "este tipo nao tem subtipo" — e quem edita passa
      // a gravar a regra do TIPO achando que o subtipo nao existe. A lista volta
      // a vazio de proposito (subtipo de outro tipo na tela seria pior), mas
      // agora dizendo por que.
      .catch((error) => {
        if (cancelado) return;
        setSubtipos([]);
        console.error(error);
        avisar.erro(error?.message || 'Erro ao carregar os subtipos deste tipo de solicitacao');
      });
    return () => { cancelado = true; };
  }, [tipoSelecionadoId, avisar]);

  // A chave que esta sendo editada: o subtipo quando escolhido, senao o tipo.
  const chaveRegraSelecionada = subtipoSelecionadoId
    ? `${tipoSelecionadoId}:${subtipoSelecionadoId}`
    : String(tipoSelecionadoId || '');

  const camposResolvidos = useMemo(() => (
    resolverCamposNovaSolicitacaoFrontend(
      comportamentoTipo,
      { regras },
      tipoSelecionadoId,
      {
        apropriacoesDisponiveis: moduloApropriacoesHabilitado,
        areaResponsavel: areaSelecionada,
        tipoSubId: subtipoSelecionadoId
      }
    )
  ), [comportamentoTipo, regras, tipoSelecionadoId, subtipoSelecionadoId, areaSelecionada, moduloApropriacoesHabilitado]);
  const opcoesTipo = useMemo(() => (
    obterOpcoesNovaSolicitacaoFrontend({ regras }, tipoSelecionadoId, areaSelecionada)
  ), [regras, tipoSelecionadoId, areaSelecionada]);

  function atualizarCampo(campoId, patch) {
    const definicao = CAMPOS_NOVA_SOLICITACAO.find((campo) => campo.id === campoId);
    if (definicao?.fixo || camposControladosPelaApropriacaoAutomatica.has(campoId) || !chaveRegraSelecionada || !areaSelecionada) return;
    const areaKey = normalizarAreaNovaSolicitacao(areaSelecionada);

    setRegras((prev) => {
      const atualTiposArea = prev[areaKey]?.tipos || {};
      const atualRegraTipo = atualTiposArea[chaveRegraSelecionada] || {};
      const atualTipo = atualRegraTipo.campos || {};
      const atualCampo = atualTipo[campoId] || {
        visivel: camposResolvidos[campoId]?.visivel_padrao ?? true,
        obrigatorio: camposResolvidos[campoId]?.obrigatorio_padrao ?? false
      };
      const proximoCampo = {
        ...atualCampo,
        ...patch
      };

      if (proximoCampo.visivel === false) {
        proximoCampo.obrigatorio = false;
      }

      return {
        ...prev,
        [areaKey]: {
          tipos: {
            ...atualTiposArea,
            [chaveRegraSelecionada]: {
              opcoes: atualRegraTipo.opcoes || {},
              campos: {
                ...atualTipo,
                [campoId]: proximoCampo
              }
            }
          }
        }
      };
    });
  }

  function atualizarOpcao(opcaoId, valor) {
    if (!chaveRegraSelecionada || !areaSelecionada) return;
    const areaKey = normalizarAreaNovaSolicitacao(areaSelecionada);

    setRegras((prev) => {
      const atualTiposArea = prev[areaKey]?.tipos || {};
      const atualTipo = atualTiposArea[chaveRegraSelecionada] || {};

      return {
        ...prev,
        [areaKey]: {
          tipos: {
            ...atualTiposArea,
            [chaveRegraSelecionada]: {
              campos: atualTipo.campos || {},
              opcoes: {
                ...(atualTipo.opcoes || {}),
                [opcaoId]: Boolean(valor)
              }
            }
          }
        }
      };
    });
  }

  function restaurarPadraoTipo() {
    if (!tipoSelecionadoId || !areaSelecionada) return;
    const areaKey = normalizarAreaNovaSolicitacao(areaSelecionada);
    setRegras((prev) => {
      const next = { ...prev };
      const tiposArea = { ...(next[areaKey]?.tipos || {}) };
      delete tiposArea[String(tipoSelecionadoId)];
      next[areaKey] = { tipos: tiposArea };
      return next;
    });
  }

  async function salvar() {
    try {
      setSalvando(true);
      const data = await salvarCamposNovaSolicitacao({ regras });
      setRegras(normalizarConfigCamposNovaSolicitacao(data).regras);
      avisar.sucesso('Configuração salva com sucesso.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao salvar configuracao.');
    } finally {
      setSalvando(false);
    }
  }

  // B5: o carregamento acontece DENTRO da moldura padrao. Antes era uma
  // frase crua sobre o canvas: sem faixa fixa, sem titulo e — o que pesa —
  // sem `Avisos`, entao uma falha no carregamento nao tinha para onde ir.
  //
  // A contagem fica de fora enquanto carrega, como na PermissoesSetor: a
  // tela ainda nao sabe qual area e qual tipo estao selecionados, e os
  // campos disponiveis dependem do comportamento do tipo — qualquer numero
  // aqui (0 ou o total do catalogo) seria uma afirmacao que nao se apurou.
  if (loading) {
    return (
      <Pagina>
        <PageHeader titulo="Campos da Nova Solicitação" descricao={DESCRICAO} />
        <Avisos avisos={avisos} aoFechar={fechar} />
        <div className="app-empty-card">Carregando configuração dos campos...</div>
      </Pagina>
    );
  }

  return (
    // M2/R10: o ritmo vertical (16px entre blocos) vem do `Pagina`, nao de
    // `space-y-5 md:space-y-6` na raiz — 20/24px nao existem na escala.
    <Pagina>
      {/* C1/R13: o `.config-page-header` NAO e sticky — nesta tela, com a
          lista de campos inteira abaixo, rolar levava o titulo e o botao
          "Salvar configuracao" para fora da tela. A faixa fixa do sistema
          (`.app-page-header`) gruda encostada na topbar e compacta sem
          sumir, entao a acao principal fica sempre a um clique. */}
      <PageHeader
        titulo="Campos da Nova Solicitação"
        contagem={`${camposDisponiveis.length} campo(s)`}
        descricao={DESCRICAO}
        acaoPrincipal={{
          rotulo: salvando ? 'Salvando...' : 'Salvar configuracao',
          onClick: salvar,
          desabilitada: salvando
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <section className="config-summary-card">
        <div>
          <p className="config-summary-kicker">Regra por área e tipo</p>
          <h2 className="config-summary-title">O formulário muda conforme a área e o tipo selecionados</h2>
          <p className="config-summary-copy">
            Obra e área responsável continuam fixas para preservar o fluxo operacional. Os demais campos podem ser exibidos, ocultados ou exigidos por tipo.
          </p>
        </div>
      </section>

      {/* M2/R10: `gap-5` (20px) e `lg:grid-cols-[320px_1fr]` (medida em px
          escrita na tela) sairam — o vao vem de um degrau da escala e a
          proporcao do painel (1/4 para o seletor, 3/4 para o conteudo), de
          trilhas de grade: mesma leitura, sem medida escrita na tela. */}
      <div className="grid gap-4 lg:grid-cols-4">
        <section className="card space-y-3">
          <label className="grid gap-2 text-sm">
            Área responsável
            <select
              className="input input-sm"
              value={areaSelecionada}
              onChange={(event) => setAreaSelecionada(event.target.value)}
            >
              {setores.map((setor) => (
                <option key={setor.id} value={setor.codigo}>{setor.nome}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm">
            Tipo de solicitação
            <select
              className="input input-sm"
              value={tipoSelecionadoId}
              onChange={(event) => setTipoSelecionadoId(event.target.value)}
              disabled={!areaSelecionada || tiposDaArea.length === 0}
            >
              {tiposDaArea.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>{tipo.nome}</option>
              ))}
            </select>
          </label>
          {subtipos.length > 0 && (
            <label className="grid gap-2 text-sm">
              Subtipo
              <select
                className="input input-sm"
                value={subtipoSelecionadoId}
                onChange={(event) => setSubtipoSelecionadoId(event.target.value)}
              >
                {/* Vazio = editar o tipo, que vale como padrao para os subtipos sem regra propria. */}
                <option value="">Todos (regra do tipo)</option>
                {subtipos.map((sub) => (
                  <option key={sub.id} value={sub.id}>{sub.nome}</option>
                ))}
              </select>
              <span className="text-xs text-[var(--c-muted)]">
                {subtipoSelecionadoId
                  ? 'Editando a regra deste subtipo. Ela tem precedencia sobre a do tipo.'
                  : 'Editando a regra do tipo. Vale para os subtipos que nao tiverem regra propria.'}
              </span>
            </label>
          )}
          {tiposDaArea.length === 0 && (
            <p className="text-xs text-[var(--c-muted)]">
              Nenhum tipo ativo encontrado para esta área.
            </p>
          )}
          <button
            type="button"
            className="btn btn-outline btn-sm w-full"
            onClick={restaurarPadraoTipo}
            disabled={!areaSelecionada || !tipoSelecionadoId}
          >
            Restaurar padrão deste tipo
          </button>
        </section>

        {/*
          R18 — `overflow: clip`, NUNCA `overflow: hidden`, nesta secao.

          Ela envolve a TabelaPadrao, ou seja, e ancestral do
          `.resizable-table-scroll`. Com `hidden` num eixo o navegador
          computa o OUTRO eixo para `auto`: a secao vira scrollport e todo
          `position: sticky` de dentro passa a grudar NELA em vez do
          contexto pretendido — morrem o cabecalho grudado da tabela e a
          coluna fixa, em silencio (sem erro no console, sem falhar o
          build, sem aparecer em teste). E o mecanismo que deixou nove
          telas de detalhe com a faixa do topo quebrada desde que existem.
          `clip` recorta igual e NAO cria scrollport.
        */}
        <section className="card overflow-clip lg:col-span-3">
          <div className="border-b border-[var(--c-border)] px-4 py-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-[var(--c-text)]">Regras operacionais deste tipo</h3>
              <p className="mt-1 text-xs text-[var(--c-muted)]">
                Ajustes que mudam a validação do fluxo sem alterar a visibilidade dos campos.
              </p>
            </div>
            <div className="grid gap-3">
              {OPCOES_NOVA_SOLICITACAO.map((opcao) => (
                <label
                  key={opcao.id}
                  className="flex items-start gap-3 rounded-lg border border-[var(--c-border)] bg-[var(--ui-surface-2)] px-3 py-3"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={Boolean(opcoesTipo[opcao.id])}
                    disabled={!areaSelecionada || !tipoSelecionadoId}
                    onChange={(event) => atualizarOpcao(opcao.id, event.target.checked)}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[var(--c-text)]">{opcao.label}</span>
                    <span className="mt-1 block text-xs text-[var(--c-muted)]">{opcao.descricao}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <TabelaPadrao
            colunas={[
              {
                id: 'campo',
                titulo: 'Campo',
                // R17: o campo configurado é o registro desta lista.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (campo) => {
                  const controladoAutomaticamente = camposControladosPelaApropriacaoAutomatica.has(campo.id);
                  const labelCampo = campo.id === 'descricao' && comportamentoTipo.usa_fluxo_contrato_novo
                    ? 'Titulo do contrato'
                    : campo.label;
                  return (
                    <div>
                      <div className="font-semibold text-[var(--c-text)]">{labelCampo}</div>
                      <div className="mt-1 text-xs text-[var(--c-muted)]">{campo.descricao}</div>
                      {campo.somenteFluxoContratoNovo && (
                        <span className="mt-2 inline-flex rounded-full border border-[var(--c-border)] px-2 py-1 text-xs text-[var(--c-muted)]">
                          Campo do novo fluxo de contrato
                        </span>
                      )}
                      {campo.fixo && (
                        <span className="mt-2 inline-flex rounded-full border border-[var(--c-border)] px-2 py-1 text-xs text-[var(--c-muted)]">
                          Campo estrutural
                        </span>
                      )}
                      {controladoAutomaticamente && (
                        <span className="mt-2 inline-flex rounded-full border border-[var(--c-border)] px-2 py-1 text-xs text-[var(--c-muted)]">
                          Controlado pela apropriação automática
                        </span>
                      )}
                    </div>
                  );
                }
              },
              {
                id: 'visivel',
                sempreVisivel: true,
                titulo: 'Aparece',
                tipo: 'status',
                render: (campo) => {
                  const resolvido = camposResolvidos[campo.id] || {};
                  const controladoAutomaticamente = camposControladosPelaApropriacaoAutomatica.has(campo.id);
                  return (
                    <input
                      type="checkbox"
                      checked={Boolean(resolvido.visivel)}
                      disabled={campo.fixo || controladoAutomaticamente}
                      onChange={(event) => atualizarCampo(campo.id, { visivel: event.target.checked })}
                    />
                  );
                }
              },
              {
                id: 'obrigatorio',
                sempreVisivel: true,
                titulo: 'Obrigatório',
                tipo: 'status',
                render: (campo) => {
                  const resolvido = camposResolvidos[campo.id] || {};
                  const controladoAutomaticamente = camposControladosPelaApropriacaoAutomatica.has(campo.id);
                  return (
                    <input
                      type="checkbox"
                      checked={Boolean(resolvido.obrigatorio)}
                      disabled={campo.fixo || controladoAutomaticamente || campo.permiteObrigatorio === false || !resolvido.visivel}
                      onChange={(event) => atualizarCampo(campo.id, { obrigatorio: event.target.checked })}
                    />
                  );
                }
              },
              {
                id: 'padrao',
                titulo: 'Padrão atual',
                tipo: 'texto',
                render: (campo) => {
                  const resolvido = camposResolvidos[campo.id] || {};
                  return (
                    <span className="text-xs text-[var(--c-muted)]">
                      {resolvido.visivel_padrao ? 'Visivel' : 'Oculto'} / {resolvido.obrigatorio_padrao ? 'Obrigatorio' : 'Opcional'}
                    </span>
                  );
                }
              }
            ]}
            itens={camposDisponiveis}
            getId={(campo) => campo.id}
            storageKey="tabela:nova-solicitacao-campos-config"
            rotuloRolagem="Campos da nova solicitacao"
            vazio="Nenhum campo disponível para este tipo."
          />
        </section>
      </div>
    </Pagina>
  );
}
