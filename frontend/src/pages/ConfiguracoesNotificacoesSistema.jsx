import { useEffect, useMemo, useState } from 'react';
import {
  getNotificacoesSistema,
  salvarNotificacoesSistema
} from '../services/configuracoesSistema';
import {
  alternarValorFiltro,
  Avisos,
  BarraFiltros,
  BlocoConteudo,
  Pagina,
  PageHeader,
  useAvisos
} from '../components/padrao';

/**
 * NOTIFICAÇÕES DO SISTEMA — reforma de 04/09.
 *
 * ## O defeito que esta tela tinha, e por que ele é o mais instrutivo
 *
 * O cabeçalho já vestia `className="app-page-header"` — a classe sticky da
 * R13 — mas a tela NÃO renderizava o `Pagina`. Quem publica a variável
 * `--pos-cabecalho-fixo` (a altura REAL da topbar, medida no DOM) é só o
 * `Pagina`; sem ele o CSS caía no literal de fallback `top: 96px`, que é a
 * origem conhecida do vão transparente registrado em 02/09 — conteúdo da
 * lista rolando por trás, visível entre a base da topbar e o topo da faixa.
 * E sem o `PageHeader` não existia compactação nenhuma, porque a
 * compactação é ESTADO do componente (ele mede a rolagem), não da classe.
 *
 * **Vestir a classe certa sem o componente que a alimenta é pior do que não
 * ter faixa, porque parece resolvido**: o `grep` acha `app-page-header`, o
 * check estático acha o sticky no CSS, e nada disso é a tela. Migrar para
 * `Pagina` + `PageHeader` fecha os dois de uma vez — a posição vem do
 * primeiro, a compactação do segundo.
 */

export default function ConfiguracoesNotificacoesSistema() {
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busca, setBusca] = useState('');
  /*
    R12/F2/F3: o filtro de módulo era uma fileira de botões de escolha única
    sobre um estado ESCALAR (`moduloAtivo`, com o sentinela 'TODOS'). Sem
    marcação múltipla e sem etiqueta removível, o recorte ativo só existia
    como a cor de um botão. Agora é um conjunto: vazio = todos os módulos,
    e cada valor marcado vira etiqueta removível na faixa.
  */
  const [modulosMarcados, setModulosMarcados] = useState(new Set());
  // R3/R19: as três caixas do navegador (carregar, salvar com sucesso,
  // salvar com erro) viraram avisos do sistema.
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const data = await getNotificacoesSistema();
        if (!active) return;
        setGrupos(Array.isArray(data?.grupos) ? data.grupos : []);
      } catch (error) {
        console.error(error);
        if (active) {
          avisar.erro(error.message || 'Erro ao carregar notificacoes do sistema');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [avisar]);

  const resumo = useMemo(() => {
    const eventos = grupos.flatMap((grupo) => grupo.eventos || []);
    return {
      total: eventos.length,
      ativos: eventos.filter((evento) => evento.ativo !== false).length
    };
  }, [grupos]);

  const opcoesDeModulo = useMemo(
    () => grupos.map((grupo) => ({
      valor: grupo.modulo,
      rotulo: grupo.modulo_label || grupo.modulo
    })),
    [grupos]
  );

  /*
    CONSENTIMENTO: o cartao itera `gruposFiltrados`, cujos `eventos` ja
    passaram pela busca — contar sobre ele so descreve o que esta na tela.
    Os botoes do cartao, porem, agem sobre o modulo INTEIRO. Este mapa guarda
    a lista completa por modulo para que o cartao possa exibir os dois
    numeros e nao deixar ninguem confundir o recorte com o alcance.
  */
  const eventosPorModulo = useMemo(() => {
    const mapa = new Map();
    grupos.forEach((grupo) => mapa.set(grupo.modulo, grupo.eventos || []));
    return mapa;
  }, [grupos]);

  const gruposFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return grupos
      // Conjunto vazio = sem recorte. É a leitura do BarraFiltros em toda
      // tela: "Limpar tudo" devolve a lista inteira sem opção "Todos".
      .filter((grupo) => modulosMarcados.size === 0 || modulosMarcados.has(String(grupo.modulo)))
      .map((grupo) => {
        const eventos = (grupo.eventos || []).filter((evento) => {
          if (!termo) return true;
          return [
            evento.chave,
            evento.nome,
            evento.descricao,
            grupo.modulo_label,
            grupo.modulo
          ].some((valor) => String(valor || '').toLowerCase().includes(termo));
        });
        return { ...grupo, eventos };
      })
      .filter((grupo) => grupo.eventos.length > 0);
  }, [busca, grupos, modulosMarcados]);

  function atualizarEvento(chave, ativo) {
    setGrupos((current) =>
      current.map((grupo) => ({
        ...grupo,
        eventos: (grupo.eventos || []).map((evento) =>
          evento.chave === chave ? { ...evento, ativo } : evento
        )
      }))
    );
  }

  /*
    CONSENTIMENTO (rodada 2): esta funcao percorre `grupos` — a lista
    COMPLETA — e escreve em TODOS os eventos do modulo, inclusive nos que a
    busca escondeu. O nome antigo era `marcarGrupo`, e "grupo" na tela e o
    cartao, que com busca ativa mostra so um pedaco. Nome e alcance agora
    coincidem, como em `ContratoObraCategorias.marcarVisiveis`: quem le a
    chamada ve o que ela alcanca.

    Deliberadamente NAO reduzimos o alcance para o filtrado. Isso mudaria o
    que a acao faz, e alterar comportamento percebido nao esta autorizado
    nesta correcao; o defeito era a tela MENTIR sobre o alcance, e e a
    mentira que se conserta (rotulos e numeros abaixo).
  */
  function marcarModuloInteiro(modulo, ativo) {
    setGrupos((current) =>
      current.map((grupo) =>
        grupo.modulo === modulo
          ? {
              ...grupo,
              eventos: (grupo.eventos || []).map((evento) => ({ ...evento, ativo }))
            }
          : grupo
      )
    );
  }

  async function handleSalvar() {
    try {
      setSaving(true);
      const eventos = {};
      for (const grupo of grupos) {
        for (const evento of grupo.eventos || []) {
          eventos[evento.chave] = { ativo: evento.ativo !== false };
        }
      }
      const data = await salvarNotificacoesSistema({ eventos });
      setGrupos(Array.isArray(data?.grupos) ? data.grupos : grupos);
      avisar.sucesso('Notificações do sistema atualizadas com sucesso.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao salvar notificacoes do sistema');
    } finally {
      setSaving(false);
    }
  }

  /*
    R5/C2: o apoio da TELA mora na faixa fixa, nas props do PageHeader. O
    `page-subtitle` solto virou `descricao`, e o "N/M ativos" — que era um
    <span> com pílula própria na barra de AÇÕES — virou a prop `contagem`,
    que rende em <strong> ancorado ao título. Contagem não é ação: estava no
    lugar de um botão, disputando espaço com o "Salvar notificações".
  */
  const cabecalho = (
    <PageHeader
      titulo="Notificações do Sistema"
      contagem={loading ? null : `${resumo.ativos}/${resumo.total} ativos`}
      descricao="Defina quais eventos podem gerar avisos no sino. A regra vale para todos os usuários da instalacao."
      acaoPrincipal={{
        rotulo: saving ? 'Salvando...' : 'Salvar notificacoes',
        onClick: handleSalvar,
        desabilitada: saving || loading
      }}
    />
  );

  if (loading) {
    return (
      <Pagina>
        {cabecalho}
        <Avisos avisos={avisos} aoFechar={fechar} />
        <div className="app-empty-card">Carregando notificações do sistema...</div>
      </Pagina>
    );
  }

  return (
    <Pagina>
      {cabecalho}

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo titulo="Controle operacional dos avisos" variante="secundario">
        {/* R25: a caixa azul usava paleta crua (border-sky-200 / bg-sky-50 /
            text-sky-900), que não tem par no tema escuro nem passa pelo piso
            de contraste do ThemeContext. O tom informativo do sistema são os
            tokens --sem-info-*. */}
        <p className="rounded-xl border border-[var(--sem-info-border)] bg-[var(--sem-info-bg)] p-4 text-sm text-[var(--sem-info)]">
          Desativar um evento impede novas notificações desse tipo. Notificações antigas continuam registradas para
          auditoria e rastreabilidade.
        </p>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Eventos do sino"
        variante="primario"
        cor="var(--c-primary)"
      >
        {/* R16: a busca é do BarraFiltros. O <input className="input"> que
            existia aqui SAI no mesmo movimento — duas caixas de busca no
            mesmo contexto é o defeito que a F1 reprova. */}
        <BarraFiltros
          busca={{
            valor: busca,
            aoMudar: setBusca,
            placeholder: 'Digite módulo, evento ou descrição'
          }}
          filtros={[{
            id: 'modulo',
            rotulo: 'Módulo',
            opcoes: opcoesDeModulo
          }]}
          ativos={{ modulo: modulosMarcados }}
          aoAlternar={(dim, valor, opcoes) => setModulosMarcados(
            (atual) => alternarValorFiltro({ [dim]: atual }, dim, valor, opcoes)[dim]
          )}
          aoLimpar={() => setModulosMarcados(new Set())}
        />

        {gruposFiltrados.length === 0 ? (
          <div className="app-empty-card">
            Nenhum evento encontrado para os filtros informados.
          </div>
        ) : null}

        <div className="grid gap-4">
          {gruposFiltrados.map((grupo) => {
            // O que esta VISIVEL neste cartao (ja recortado pela busca).
            const eventosVisiveis = grupo.eventos || [];
            const ativosVisiveis = eventosVisiveis.filter((evento) => evento.ativo !== false).length;
            const totalVisivel = eventosVisiveis.length;
            // O que os BOTOES alcancam: o modulo inteiro, filtro ou nao.
            const eventosModulo = eventosPorModulo.get(grupo.modulo) || [];
            const ativosModulo = eventosModulo.filter((evento) => evento.ativo !== false).length;
            const totalModulo = eventosModulo.length;
            // Busca escondeu parte do modulo: os dois numeros divergem e
            // precisam aparecer JUNTOS. Sem recorte eles sao o mesmo numero,
            // e repetir viraria ruido.
            const buscaEncolheu = totalVisivel !== totalModulo;

            return (
              <article
                key={grupo.modulo}
                className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4"
              >
                <div className="flex flex-col gap-3 border-b border-[var(--c-border)] pb-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--c-muted)]">
                      {grupo.modulo}
                    </p>
                    <h3 className="text-lg font-semibold text-[var(--c-text)]">{grupo.modulo_label || grupo.modulo}</h3>
                    {/*
                      CONSENTIMENTO — a redacao. Antes se lia so
                      "{ativos}/{total} evento(s) ativo(s)" contado sobre o
                      FILTRADO, ao lado de um botao "Desativar todos" que
                      apagava o modulo inteiro: com busca ativa a tela dizia
                      "2/2" e o clique desligava 47. E o "pergunta sobre 3,
                      apaga 47".

                      Sem recorte, um numero so: os dois sao iguais.
                      Com recorte, os DOIS numeros, nesta ordem — primeiro o
                      que a pessoa esta vendo (o de cima descreve a lista
                      abaixo), depois o do modulo, colado a frase que diz que
                      e sobre ele que os botoes agem. Assim o alcance esta
                      escrito no mesmo lugar em que o numero maior aparece, e
                      nao ha como ler um e supor o outro.
                    */}
                    {buscaEncolheu ? (
                      <>
                        <p className="text-sm text-[var(--c-muted)]">
                          Exibidos pela busca: {ativosVisiveis}/{totalVisivel} evento(s) ativo(s)
                        </p>
                        <p className="text-sm font-semibold text-[var(--c-text)]">
                          Modulo inteiro: {ativosModulo}/{totalModulo} evento(s) ativo(s) — e sobre esse total que os botoes ao lado agem.
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-[var(--c-muted)]">{ativosModulo}/{totalModulo} evento(s) ativo(s)</p>
                    )}
                  </div>
                  <div className="app-actionbar">
                    {/*
                      "todos" era ambiguo justamente porque o cartao mostrava
                      um subconjunto: "todos" os que vejo, ou todos os que
                      existem? O rotulo agora nomeia a colecao percorrida pela
                      funcao — o modulo inteiro —, como em
                      `ContratoObraCategorias` ("Marcar visiveis" para uma
                      funcao que percorre os visiveis). O contador do modulo
                      logo ao lado diz de quantos se trata.
                    */}
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => marcarModuloInteiro(grupo.modulo, true)}
                    >
                      Ativar modulo inteiro ({totalModulo})
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => marcarModuloInteiro(grupo.modulo, false)}
                    >
                      Desativar modulo inteiro ({totalModulo})
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {(grupo.eventos || []).map((evento) => (
                    <label
                      key={evento.chave}
                      className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] p-4"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[var(--c-text)]">{evento.nome}</div>
                        <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--c-muted)]">
                          {evento.chave}
                        </div>
                        <p className="mt-2 text-sm text-[var(--c-muted)]">{evento.descricao}</p>
                      </div>
                      {/* M2/R10: o `h-5 w-5` era medida à mão fora da escala.
                          O alvo de clique aqui é a etiqueta inteira (M1), não
                          a caixinha — então ela não precisa de dimensão
                          própria. */}
                      <input
                        type="checkbox"
                        className="mt-1 shrink-0"
                        checked={evento.ativo !== false}
                        onChange={(event) => atualizarEvento(evento.chave, event.target.checked)}
                      />
                    </label>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </BlocoConteudo>
    </Pagina>
  );
}
