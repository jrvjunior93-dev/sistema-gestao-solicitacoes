import { useEffect, useState } from 'react';
import {
  getComercialCategoriasContrato,
  salvarComercialCategoriasContrato
} from '../services/configuracoesSistema';
import {
  Pagina,
  PageHeader,
  Avisos,
  BlocoConteudo,
  useAvisos,
  useConfirmacao
} from '../components/padrao';

const DESCRICAO = 'Selecione categorias financeiras e opcoes exibidas na forma de pagamento do contrato de venda.';

function toggleId(list, id, checked) {
  const current = new Set((list || []).map(Number));
  if (checked) {
    current.add(Number(id));
  } else {
    current.delete(Number(id));
  }
  return Array.from(current);
}

function getOptionGroup(config, key) {
  return Array.isArray(config?.opcoes_pagamento?.[key]) ? config.opcoes_pagamento[key] : [];
}

function createOptionTemplate(groupKey) {
  const base = { value: '', label: '', ativo: true };
  if (groupKey === 'reajustes') return { ...base, resumo: '' };
  if (groupKey === 'periodicidades') return { ...base, intervalMonths: '' };
  return base;
}

function updateOptionGroup(config, groupKey, updater) {
  const currentItems = getOptionGroup(config, groupKey);
  const nextItems = typeof updater === 'function' ? updater(currentItems) : updater;
  return {
    ...config,
    opcoes_pagamento: {
      ...(config.opcoes_pagamento || {}),
      [groupKey]: nextItems
    }
  };
}

function getOptionPayload(config) {
  return {
    modos: getOptionGroup(config, 'modos'),
    tipos_parcela: getOptionGroup(config, 'tipos_parcela'),
    formas_recebimento: getOptionGroup(config, 'formas_recebimento'),
    reajustes: getOptionGroup(config, 'reajustes'),
    periodicidades: getOptionGroup(config, 'periodicidades')
  };
}

function CategoriaChecklist({ title, description, categorias, selectedIds, onChange, variante = 'neutro' }) {
  const selected = new Set((selectedIds || []).map(Number));
  const allIds = (categorias || []).map((categoria) => Number(categoria.id)).filter(Number.isFinite);

  return (
    // B1: era `section.sol-surface-card` com `sol-filtros-head/-title/
    // -subtitle/-meta` — o cartão antigo das telas de solicitação. A migração
    // de ontem trocou o cabeçalho e a página pelos componentes padrão e
    // DEIXOU os cartões do corpo como estavam. Agora é `BlocoConteudo`: o
    // título vai no degrau de bloco (18px), o apoio na prop `descricao` e a
    // contagem na prop `contagem` (R5) — que é o mesmo "N selecionada(s)"
    // que o `sol-filtros-meta` mostrava.
    <BlocoConteudo
      titulo={title}
      descricao={description}
      contagem={`${selected.size} selecionada(s)`}
      variante={variante}
    >
      {(categorias || []).length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => onChange(allIds)}>
            Marcar todos
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => onChange([])}>
            Desmarcar todos
          </button>
        </div>
      )}

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {(categorias || []).map((categoria) => (
          <label
            key={categoria.id}
            className="flex items-start gap-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3 text-sm text-[var(--c-text)]"
          >
            <input
              type="checkbox"
              className="mt-1"
              checked={selected.has(Number(categoria.id))}
              onChange={(event) => onChange(toggleId(selectedIds, categoria.id, event.target.checked))}
            />
            <span>
              <span className="block font-semibold">{categoria.nome}</span>
              <span className="block text-xs text-[var(--c-muted)]">{categoria.tipo}</span>
            </span>
          </label>
        ))}
      </div>

      {(categorias || []).length === 0 && (
        <div className="app-empty-card">Nenhuma categoria financeira compatível encontrada.</div>
      )}
    </BlocoConteudo>
  );
}

function CategoriaSelect({ title, description, categorias, value, onChange }) {
  const selected = Number(value || 0);

  return (
    // B1: mesmo caso do CategoriaChecklist — cartão legado virou bloco padrão.
    <BlocoConteudo titulo={title} descricao={description}>
      {/* R12: seletor de CONTEXTO/formulário (qual categoria recebe a
          comissão), não filtro de lista — continua sendo select. */}
      <label className="sol-filter-field">
        <span className="sol-filter-label">Categoria financeira</span>
        <select
          className="input w-full"
          value={selected ? String(selected) : ''}
          onChange={(event) => onChange(event.target.value ? Number(event.target.value) : '')}
        >
          <option value="">Selecione uma categoria para comissão</option>
          {(categorias || []).map((categoria) => (
            <option key={categoria.id} value={Number(categoria.id)}>
              {categoria.nome}{categoria.tipo ? ` - ${categoria.tipo}` : ''}
            </option>
          ))}
        </select>
      </label>

      {(categorias || []).length === 0 && (
        <div className="app-empty-card mt-4">Nenhuma categoria financeira compatível encontrada.</div>
      )}
    </BlocoConteudo>
  );
}

// Linha sem NADA digitado: nao ha o que proteger. Decisao registrada na tela
// irma (AutomacaoStatusSetor): confirmacao protege o que a pessoa escreveu, e
// perguntar sobre o vazio e so atrito. `ativo` entra no teste porque
// desmarcar a caixa tambem e um ato da pessoa sobre aquela linha — a linha em
// branco e a que saiu do "Adicionar opcao" e ficou intocada.
function opcaoEmBranco(item) {
  if (!item) return true;
  const preenchido = [item.value, item.label, item.resumo, item.intervalMonths]
    .some((valor) => String(valor ?? '').trim() !== '');
  return !preenchido && item.ativo !== false;
}

function OpcoesCrud({ title, description, groupKey, itens, onChange }) {
  const showResumo = groupKey === 'reajustes';
  const showInterval = groupKey === 'periodicidades';
  const ativos = (itens || []).filter((item) => item.ativo !== false).length;
  // CONSENTIMENTO: "Excluir" apagava a linha inteira (codigo, nome, resumo,
  // intervalo) num clique, e nao ha desfazer — a opcao so volta se for
  // digitada de novo. Mesmo tratamento da tela irma AutomacaoStatusSetor.
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  function updateItem(index, patch) {
    onChange((itens || []).map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...patch } : item
    )));
  }

  function addItem() {
    onChange([...(itens || []), createOptionTemplate(groupKey)]);
  }

  // Nomeia a linha como a pessoa a ve: nome exibido, senao codigo, senao a
  // posicao. Indice cru ("item 3") nao identifica nada para ela.
  function descreverOpcao(item, index) {
    const nome = String(item?.label || '').trim();
    const codigo = String(item?.value || '').trim();
    if (nome && codigo) return `"${nome}" (${codigo})`;
    if (nome) return `"${nome}"`;
    if (codigo) return `"${codigo}"`;
    return `a opcao ${index + 1}`;
  }

  async function removeItem(index) {
    // R26: o alvo sai numa const ANTES do await. O modal do sistema nao
    // bloqueia a tela — reler a lista pelo indice depois da confirmacao faria
    // perguntar por uma linha e apagar outra se algo tivesse mudado no meio.
    const alvo = (itens || [])[index];
    if (!alvo) return;

    if (!opcaoEmBranco(alvo)) {
      const { ok } = await confirmar({
        titulo: `Excluir ${title.toLowerCase()}`,
        mensagem: `Excluir ${descreverOpcao(alvo, index)}? Esta acao nao pode ser desfeita: a opcao sai da lista e, para recupera-la, sera preciso cadastra-la de novo.`,
        rotuloConfirmar: 'Excluir',
        destrutiva: true
      });
      if (!ok) return;
    }

    // Remove pela IDENTIDADE do alvo, sobre a lista viva (o onChange do pai
    // aceita atualizador — vide updateOptionGroup). Pelo indice, uma edicao
    // feita em outra linha enquanto o modal estava aberto seria descartada
    // junto. Se o alvo ja nao estiver la, a lista fica como esta.
    onChange((atuais) => (atuais || []).filter((item) => item !== alvo));
  }

  function markAll(ativo) {
    onChange((itens || []).map((item) => ({ ...item, ativo })));
  }

  return (
    // B1: mesmo caso das duas de cima — o cartão legado (`sol-surface-card`)
    // não é bloco para o harness nem para o sistema. Vira `BlocoConteudo`, e
    // o "N ativa(s)" do `sol-filtros-meta` vira a prop `contagem` (R5).
    <BlocoConteudo titulo={title} descricao={description} contagem={`${ativos} ativa(s)`}>
      {(itens || []).length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => markAll(true)}>
            Marcar todos
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => markAll(false)}>
            Desmarcar todos
          </button>
        </div>
      )}

      <div className="space-y-3">
        {(itens || []).map((item, index) => (
          <div
            key={`${groupKey}-${index}`}
            className="grid gap-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3 text-sm text-[var(--c-text)] md:grid-cols-[auto_minmax(110px,0.75fr)_minmax(160px,1fr)_auto]"
          >
            <label className="flex items-center gap-2 font-semibold text-[var(--c-text)]">
              <input
                type="checkbox"
                checked={item.ativo !== false}
                onChange={(event) => updateItem(index, { ativo: event.target.checked })}
              />
              Ativo
            </label>
            <label className="sol-filter-field">
              <span className="sol-filter-label">Código</span>
              <input
                className="input w-full uppercase"
                value={item.value || ''}
                onChange={(event) => updateItem(index, { value: event.target.value })}
                placeholder="Ex.: MENSAL"
              />
            </label>
            <label className="sol-filter-field">
              <span className="sol-filter-label">Nome exibido</span>
              <input
                className="input w-full"
                value={item.label || ''}
                onChange={(event) => updateItem(index, { label: event.target.value })}
                placeholder="Ex.: Mensal"
              />
            </label>
            <div className="flex items-end">
              <button type="button" className="btn btn-outline btn-perigo-suave w-full" onClick={() => removeItem(index)}>
                Excluir
              </button>
            </div>

            {(showResumo || showInterval) && (
              <div className="md:col-start-2 md:col-span-2">
                {showResumo && (
                  <label className="sol-filter-field">
                    <span className="sol-filter-label">Resumo no contrato</span>
                    <input
                      className="input w-full uppercase"
                      value={item.resumo || ''}
                      onChange={(event) => updateItem(index, { resumo: event.target.value })}
                      placeholder="F ou R"
                    />
                  </label>
                )}
                {showInterval && (
                  <label className="sol-filter-field">
                    <span className="sol-filter-label">Intervalo em meses</span>
                    <input
                      className="input w-full"
                      type="number"
                      min="0"
                      value={item.intervalMonths ?? ''}
                      onChange={(event) => updateItem(index, { intervalMonths: event.target.value })}
                      placeholder="Ex.: 1"
                    />
                  </label>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4">
        <button type="button" className="btn btn-outline" onClick={addItem}>
          Adicionar opção
        </button>
      </div>

      {(itens || []).length === 0 && (
        <div className="app-empty-card mt-4">Nenhuma opção cadastrada.</div>
      )}

      {/* Cada bloco tem a sua confirmacao; o OverlayModal sai por portal, e so
          uma fica aberta por vez porque so um botao e clicado por vez. */}
      {elementoConfirmacao}
    </BlocoConteudo>
  );
}

export default function ConfiguracoesComercialCategorias() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // R3: o erro era um <div className="app-alert app-alert--error"> montado à
  // mão e o sucesso era um alert() do navegador. Os dois passam a ser aviso
  // do sistema — mesmo tom semântico, mensurável pelo harness, fechável.
  const { avisos, avisar, fechar } = useAvisos();
  const [config, setConfig] = useState({
    contrato_venda_categoria_ids: [],
    comissao_categoria_id: '',
    categorias_contrato: [],
    categorias_comissao: [],
    opcoes_pagamento: {}
  });

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const data = await getComercialCategoriasContrato();
        if (!active) return;
        const nextConfig = data || {};
        setConfig({
          contrato_venda_categoria_ids: Array.isArray(nextConfig.contrato_venda_categoria_ids)
            ? nextConfig.contrato_venda_categoria_ids
            : [],
          comissao_categoria_id: nextConfig.comissao_categoria_id || '',
          categorias_contrato: nextConfig.categorias_contrato || [],
          categorias_comissao: nextConfig.categorias_comissao || [],
          opcoes_pagamento: nextConfig.opcoes_pagamento || {}
        });
      } catch (err) {
        if (active) avisar.erro(err?.message || 'Erro ao carregar configuracao comercial');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  async function handleSave() {
    try {
      setSaving(true);
      const data = await salvarComercialCategoriasContrato({
        contrato_venda_categoria_ids: config.contrato_venda_categoria_ids,
        comissao_categoria_id: config.comissao_categoria_id,
        opcoes_pagamento: getOptionPayload(config)
      });
      if (data) {
        setConfig((current) => ({
          ...current,
          contrato_venda_categoria_ids: Array.isArray(data.contrato_venda_categoria_ids)
            ? data.contrato_venda_categoria_ids
            : current.contrato_venda_categoria_ids,
          comissao_categoria_id: data.comissao_categoria_id || ''
        }));
      }
      avisar.sucesso('Categorias comerciais atualizadas com sucesso.');
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao salvar configuracao comercial');
    } finally {
      setSaving(false);
    }
  }

  // B5: no carregamento o texto tambem precisa de moldura. Antes era uma
  // frase solta dentro do Pagina — sem cabecalho e sem a faixa de avisos, de
  // modo que um erro de carga (o unico aviso que pode chegar aqui) nao teria
  // onde aparecer enquanto `loading` fosse verdadeiro. Mesmo arranjo da tela
  // irma AutomacaoStatusSetor: Pagina + PageHeader + Avisos + BlocoConteudo.
  if (loading) {
    return (
      <Pagina>
        <PageHeader titulo="Categorias comerciais" descricao={DESCRICAO} />
        <Avisos avisos={avisos} aoFechar={fechar} />
        <BlocoConteudo titulo="Opções do contrato de venda" variante="primario" cor="var(--c-primary)">
          <p className="app-note">Carregando categorias comerciais...</p>
        </BlocoConteudo>
      </Pagina>
    );
  }

  return (
    // C1: a tela usava .app-page-header SEM o Pagina. Essa classe é sticky em
    // --pos-cabecalho-fixo, e quem mede a topbar e publica essa variável é só
    // o Pagina — sem ele a faixa grudava no fallback de 96px, que é a origem
    // do vão transparente. C2/R10: o título vem do PageHeader (22px), não de
    // um text-xl escrito aqui; M2/R10: o ritmo vertical é do Pagina.
    <Pagina>
      <PageHeader
        titulo="Categorias comerciais"
        descricao={DESCRICAO}
        acaoPrincipal={{
          rotulo: saving ? 'Salvando...' : 'Salvar configuracao',
          onClick: handleSave,
          desabilitada: saving
        }}
      />
      {/* C6/R11 (decisão do cliente, 04/09): o "Abrir cadastros financeiros"
          saiu da barra de ações — ela é para ações SOBRE ESTA TELA, e caminho
          para outra tela mora no hub/breadcrumb/Ctrl+K. O destino já tem porta
          no menu (navigationConfig, item fin-cadastros), então remover não
          cria porta ausente; e o bloco "Origem das configuracoes" abaixo
          continua dizendo, em texto, que o cadastro é no Financeiro. */}

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/* B5/B1: o texto de contexto continua com superfície própria — só que
          agora a superfície é a do sistema. `secundario` porque ele recua:
          explica de onde vêm os dados, não é o trabalho da tela. */}
      <BlocoConteudo
        titulo="Origem das configurações"
        descricao="Cadastre e mantenha as categorias no Financeiro. Aqui o Comercial escolhe quais categorias e quais opções aparecem no contrato."
        variante="secundario"
      />

      {/* B2: ESTE é o bloco principal da tela carregada — é ele que responde
          a pergunta que traz alguém aqui ("quais categorias aparecem no
          contrato de venda?"). O ramo de carregamento já marcava um primário;
          o ramo carregado ficou sem nenhum quando os cartões legados não
          eram blocos. UM por tela: os demais seguem neutros/secundários. */}
      <CategoriaChecklist
        title="Contrato de venda"
        description="Categorias de contas a receber exibidas no campo Categoria financeira."
        categorias={config.categorias_contrato || []}
        selectedIds={config.contrato_venda_categoria_ids || []}
        onChange={(ids) => setConfig((current) => ({ ...current, contrato_venda_categoria_ids: ids }))}
        variante="primario"
      />

      <CategoriaSelect
        title="Comissão (global)"
        description="Categoria única usada em todos os contratos com corretor. Não é exibida na tela de contratos."
        categorias={config.categorias_comissao || []}
        value={config.comissao_categoria_id || ''}
        onChange={(value) => setConfig((current) => ({ ...current, comissao_categoria_id: value }))}
      />

      <section className="grid gap-4 xl:grid-cols-2">
        <OpcoesCrud
          title="Modo"
          description="Controla os modos disponiveis para compor a forma de pagamento."
          groupKey="modos"
          itens={config.opcoes_pagamento?.modos || []}
          onChange={(values) => setConfig((current) => updateOptionGroup(current, 'modos', values))}
        />

        <OpcoesCrud
          title="Tipo da parcela"
          description="Define os tipos de parcelas que podem ser usados nos blocos e linhas manuais."
          groupKey="tipos_parcela"
          itens={config.opcoes_pagamento?.tipos_parcela || []}
          onChange={(values) => setConfig((current) => updateOptionGroup(current, 'tipos_parcela', values))}
        />

        <OpcoesCrud
          title="Forma prevista"
          description="Define as formas de recebimento previstas exibidas no contrato."
          groupKey="formas_recebimento"
          itens={config.opcoes_pagamento?.formas_recebimento || []}
          onChange={(values) => setConfig((current) => updateOptionGroup(current, 'formas_recebimento', values))}
        />

        <OpcoesCrud
          title="Reajuste"
          description="Define se as parcelas podem ser fixas, reajustaveis ou ambas."
          groupKey="reajustes"
          itens={config.opcoes_pagamento?.reajustes || []}
          onChange={(values) => setConfig((current) => updateOptionGroup(current, 'reajustes', values))}
        />

        <OpcoesCrud
          title="Periodicidade"
          description="Define as periodicidades que aparecem nas parcelas periodicas."
          groupKey="periodicidades"
          itens={config.opcoes_pagamento?.periodicidades || []}
          onChange={(values) => setConfig((current) => updateOptionGroup(current, 'periodicidades', values))}
        />
      </section>
    </Pagina>
  );
}
