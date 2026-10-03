import { useEffect, useMemo, useState } from 'react';
import {
  getVisibilidadeUi,
  salvarVisibilidadeUi
} from '../services/configuracoesSistema';
import { resetUiVisibilityCache } from '../hooks/useUiVisibility';
import { Avisos, BlocoConteudo, Pagina, PageHeader, useAvisos } from '../components/padrao';

/**
 * VISIBILIDADE DE DASHBOARDS E TABELAS — reforma de 04/09.
 *
 * O cabeçalho vivia num `.app-toolbar-card`, que é só flex/gap: não gruda,
 * não compacta, não tem posição própria. Numa tela LONGA por construção —
 * ela lista todos os componentes configuráveis do sistema — o "Salvar
 * visibilidade" sumia na primeira rolagem e só voltava subindo a página
 * inteira. Com `Pagina` + `PageHeader` a ação principal está sempre a um
 * clique (C1/R13).
 */

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function typeLabel(type) {
  const normalized = String(type || '').toLowerCase();
  if (normalized === 'table') return 'Tabela';
  if (normalized === 'dashboard') return 'Dashboard';
  return 'Card';
}

function ComponentToggle({ component, checked, onChange }) {
  return (
    <label
      /*
        R25: as duas faces desta etiqueta eram paleta crua — emerald para a
        marcada, slate para a desmarcada, com `text-slate-500` (#64748b =
        4,34:1) no texto da desmarcada, abaixo do mínimo AA de 4,5:1. É o
        caso que a própria R25 nomeia. Os tokens semânticos acompanham o
        tema escuro e passam pelo piso de contraste do ThemeContext (R24).
      */
      className={`flex cursor-pointer items-start justify-between gap-4 rounded-xl border px-3 py-3 transition-colors ${
        checked
          ? 'border-[var(--sem-success-border)] bg-[var(--sem-success-bg)]'
          : 'border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-muted)]'
      }`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[var(--c-text)]">{component.label}</span>
        {/* M2/R10: era `text-[10px]` com `py-0.5` — nada abaixo de 12px em
            conteúdo, e nenhum espaçamento fora dos degraus. A pílula do
            sistema (.fx-badge) já traz tamanho, respiro e cor de token. */}
        <span className="fx-badge mt-1">{typeLabel(component.type)}</span>
        <span className="mt-1 block font-mono text-xs text-[var(--c-muted)]">{component.key}</span>
      </span>
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={onChange}
      />
    </label>
  );
}

export default function ConfiguracoesVisibilidadeUi() {
  const [registry, setRegistry] = useState([]);
  const [hidden, setHidden] = useState([]);
  const [filtro, setFiltro] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // R3/R19: as três caixas do navegador (carregar, salvar, erro ao salvar)
  // viraram avisos do sistema — com tom semântico e sucesso que some sozinho.
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    let active = true;
    setLoading(true);
    getVisibilidadeUi()
      .then((data) => {
        if (!active) return;
        setRegistry(Array.isArray(data?.registry) ? data.registry : []);
        setHidden(Array.isArray(data?.hidden) ? data.hidden.map(normalizeKey) : []);
      })
      .catch((err) => {
        // O ramo de erro era o único que não conferia `active` — avisar
        // depois da desmontagem é atualizar estado de componente morto.
        if (!active) return;
        avisar.erro(err?.message || 'Erro ao carregar configuracao de visibilidade');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [avisar]);

  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
  const allKeys = useMemo(() => registry.flatMap((group) =>
    (group.pages || []).flatMap((page) =>
      (page.components || []).map((component) => normalizeKey(component.key))
    )
  ), [registry]);

  const visibleCount = allKeys.filter((key) => !hiddenSet.has(key)).length;
  const hiddenCount = allKeys.length - visibleCount;

  // RECORTE do cartão que antes repetia o total (ver o comentário C2 × B3 na
  // faixa, abaixo): em quantos módulos a ocultação está em vigor. Sai do
  // mesmo registry já carregado — não é número novo, é corte novo do mesmo
  // dado, e é o único dos três que a faixa não tem como responder.
  const modulosComOculto = useMemo(() => registry.filter((group) =>
    (group.pages || []).some((page) =>
      (page.components || []).some((component) => hiddenSet.has(normalizeKey(component.key)))
    )
  ).length, [registry, hiddenSet]);

  const filtroNormalizado = filtro.trim().toLowerCase();

  const filteredRegistry = useMemo(() => {
    if (!filtroNormalizado) return registry;

    return registry
      .map((group) => ({
        ...group,
        pages: (group.pages || [])
          .map((page) => ({
            ...page,
            components: (page.components || []).filter((component) => {
              const haystack = [
                group.label,
                group.module,
                page.label,
                page.path,
                component.label,
                component.key,
                component.type
              ].map((item) => String(item || '').toLowerCase()).join(' ');
              return haystack.includes(filtroNormalizado);
            })
          }))
          .filter((page) => page.components.length)
      }))
      .filter((group) => group.pages.length);
  }, [filtroNormalizado, registry]);

  function toggleKey(key) {
    const normalized = normalizeKey(key);
    setHidden((current) => (
      current.includes(normalized)
        ? current.filter((item) => item !== normalized)
        : [...current, normalized]
    ));
  }

  function setPageVisibility(page, visible) {
    const pageKeys = (page.components || []).map((component) => normalizeKey(component.key));
    setHidden((current) => {
      const currentSet = new Set(current);
      pageKeys.forEach((key) => {
        if (visible) currentSet.delete(key);
        else currentSet.add(key);
      });
      return Array.from(currentSet);
    });
  }

  async function salvar() {
    try {
      setSaving(true);
      const data = await salvarVisibilidadeUi({ hidden });
      setHidden(Array.isArray(data?.hidden) ? data.hidden.map(normalizeKey) : []);
      resetUiVisibilityCache();
      avisar.sucesso('Visibilidade salva com sucesso.');
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao salvar visibilidade');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Pagina>
      {/*
        C2 × B3 — DECISÃO DO RESPONSÁVEL DE 05/09, registrada em
        `docs/DEFINICAO-DE-PRONTO.md`, seção "QUANDO C2 E B3 APONTAM PARA
        LADOS OPOSTOS (05/09)". NÃO desfaça isto sem ler a seção.

        A versão anterior desta tela omitia a contagem da faixa de propósito,
        alegando B3: três cartões de resumo já mostravam os números. A matriz
        reprovou (`config-visibilidade-ui · C2`, "contagem ausente no apoio"),
        e o conflito entre as duas regras foi desempatado assim:

        > A FAIXA FICA COM O TOTAL. OS BLOCOS FICAM COM OS RECORTES.

        O motivo: a faixa acompanha a pessoa ao rolar, e esta tela é longa por
        construção — o total precisa estar onde se decide, não num bloco que
        ficou 2000px acima. E o teste que evita voltar a discutir a cada tela:
        a distinção é o que cada número RESPONDE, não onde ele está.

          faixa → "quanto existe no total"      → allKeys.length componente(s)
          bloco → "quanto existe NESTE recorte" → visíveis / ocultos / módulos

        Total repetido é B3; total ausente da faixa é C2. Dois números
        DIFERENTES, cada um respondendo à sua pergunta, é informação — e é o
        mesmo dado com papéis diferentes que a própria B3 já ressalva.

        Por isso o cartão "Componentes mapeados" saiu do jeito que estava: ele
        mostrava `allKeys.length`, exatamente o número que agora vive na
        faixa. Não foi removido — trocou de conteúdo pelo recorte que só ele
        sabe (módulos com bloco oculto), como manda a seção.

        Carregamento: `contagem` é NULA enquanto carrega, nunca `0` — `0`
        afirmaria "nenhum componente mapeado", que é o oposto do que a tela
        sabe nesse instante. Mesmo padrão de `src/pages/PermissoesSetor.jsx`.
      */}
      <PageHeader
        titulo="Visibilidade de Dashboards e Tabelas"
        contagem={loading ? null : `${allKeys.length} componente(s)`}
        descricao="Controle quais blocos aparecem nas telas sem alterar a permissão de acesso dos usuários."
        acaoPrincipal={{
          rotulo: saving ? 'Salvando...' : 'Salvar visibilidade',
          onClick: salvar,
          desabilitada: saving || loading
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        Os três RECORTES (05/09). Nenhum deles repete o total da faixa:

          Visiveis  → quantos, dos mapeados, aparecem hoje
          Ocultos   → quantos estao suprimidos hoje
          Modulos   → em quantos modulos a ocultacao esta em vigor

        O terceiro é o antigo "Componentes mapeados", que era o total da faixa
        e nada mais. Ele tinha recorte próprio para mostrar, então mudou de
        conteúdo em vez de sair.

        Um recorte que a tela NÃO tem: "visíveis só para certo perfil". O
        registry (`backend/src/constants/uiVisibilityRegistry.js`) não carrega
        perfil nenhum — e o próprio texto de governança abaixo diz que esta
        configuração não concede acesso. Número que a tela não tem não vira
        cartão.

        Enquanto carrega, os três mostram "—" pelo mesmo motivo da faixa: `0`
        seria uma afirmação sobre dado que ainda não chegou.
      */}
      <section className="grid gap-3 md:grid-cols-3">
        <div className="app-summary-card">
          <span className="app-summary-label">Visíveis</span>
          <strong className="app-summary-value text-[var(--sem-success)]">{loading ? '—' : visibleCount}</strong>
          <span className="app-summary-subvalue">Aparecem para quem já tem permissão no módulo</span>
        </div>
        <div className="app-summary-card">
          <span className="app-summary-label">Ocultos</span>
          <strong className="app-summary-value text-[var(--sem-warning)]">{loading ? '—' : hiddenCount}</strong>
          <span className="app-summary-subvalue">Não aparecem nas telas configuradas</span>
        </div>
        <div className="app-summary-card">
          <span className="app-summary-label">Módulos com bloco oculto</span>
          <strong className="app-summary-value">{loading ? '—' : modulosComOculto}</strong>
          <span className="app-summary-subvalue">
            {loading ? 'Carregando modulos...' : `de ${registry.length} modulo(s) mapeado(s)`}
          </span>
        </div>
      </section>

      <BlocoConteudo titulo="Governança" variante="secundario">
        {/* R25: era border-sky-200 / bg-sky-50 / text-sky-800 — paleta crua
            sem par no tema escuro. Tom informativo = tokens --sem-info-*. */}
        <p className="rounded-xl border border-[var(--sem-info-border)] bg-[var(--sem-info-bg)] p-4 text-sm text-[var(--sem-info)]">
          Esta configuração não concede acesso. Primeiro o usuário precisa ter permissão de módulo/área.
          Depois disso, estes controles definem quais blocos ficam visiveis na experiencia.
        </p>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Componentes configuraveis"
        variante="primario"
        cor="var(--c-primary)"
      >
        {/*
          R3: o campo era `input input-sm w-full md:max-w-md` — largura
          escrita na tela. `.app-busca` é classe de LARGURA (cresce até 480px
          e nunca fica pequena com vazio ao lado), e vale AQUI porque este é
          o campo de busca de verdade da tela: filtra a listagem inteira. Não
          é classe de papel — pôr `.app-busca` num campo que não busca é o
          engano que já quebrou duas telas deste projeto.
        */}
        <div className="flex flex-wrap gap-3">
          <input
            className="input app-busca"
            placeholder="Filtrar por módulo, página, tabela ou chave..."
            aria-label="Filtrar por módulo, página, tabela ou chave"
            value={filtro}
            onChange={(event) => setFiltro(event.target.value)}
          />
        </div>

        {loading ? (
          <div className="app-empty-card">Carregando componentes configuraveis...</div>
        ) : (
          <div className="space-y-4">
            {filteredRegistry.map((group) => (
              <section
                key={group.module}
                className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)]"
              >
                <div className="border-b border-[var(--c-border)] px-4 py-3">
                  {/* M2/R10: `text-[10px]` era medida fora da escala e abaixo
                      do piso de 12px em conteúdo — text-xs é o degrau de
                      detalhe. */}
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--c-muted)]">
                    {group.module}
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-[var(--c-text)]">{group.label}</h3>
                  {group.description ? (
                    <p className="mt-1 text-sm text-[var(--c-muted)]">{group.description}</p>
                  ) : null}
                </div>

                <div className="divide-y divide-[var(--c-border)]">
                  {(group.pages || []).map((page) => {
                    const pageKeys = (page.components || []).map((component) => normalizeKey(component.key));
                    const visiblePageCount = pageKeys.filter((key) => !hiddenSet.has(key)).length;

                    return (
                      <div key={page.key} className="px-4 py-4">
                        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <h4 className="text-sm font-bold text-[var(--c-text)]">{page.label}</h4>
                            <p className="font-mono text-xs text-[var(--c-muted)]">{page.path}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {/* R25/M2: era `bg-slate-100 text-slate-600` com
                                `px-2.5` e `text-[11px]`. A pílula do sistema
                                resolve cor, tamanho e respiro de uma vez. */}
                            <span className="fx-badge">
                              {visiblePageCount}/{pageKeys.length} visiveis
                            </span>
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => setPageVisibility(page, true)}>
                              Exibir página
                            </button>
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => setPageVisibility(page, false)}>
                              Ocultar página
                            </button>
                          </div>
                        </div>

                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {(page.components || []).map((component) => {
                            const key = normalizeKey(component.key);
                            return (
                              <ComponentToggle
                                key={component.key}
                                component={component}
                                checked={!hiddenSet.has(key)}
                                onChange={() => toggleKey(component.key)}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </BlocoConteudo>
    </Pagina>
  );
}
