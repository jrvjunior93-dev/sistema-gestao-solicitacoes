import DateInputBR from '../components/DateInputBR';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Avisos,
  BarraFiltros,
  BlocoConteudo,
  CampoForm,
  CelulaDupla,
  FormSecao,
  PageHeader,
  Pagina,
  TabelaPadrao,
  alternarValorFiltro,
  useAvisos,
  useFiltrosVisiveis
} from '../components/padrao';
import StatusBadge from '../components/StatusBadge';
import {
  ativarTabelaPrecoComercial,
  atualizarTabelaPrecoComercial,
  criarTabelaPrecoComercial,
  getEmpreendimentosComerciais,
  getTabelasPrecoComerciais,
  getUnidadesComerciais
} from '../services/comercial';

const DESCRICAO = 'Estruture e ative tabelas comerciais por empreendimento sem depender de ajuste manual unidade por unidade.';

const STATUS_TABELA = ['RASCUNHO', 'ATIVA', 'ARQUIVADA'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  const iso = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return value || '-';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function toNumber(value) {
  if (value == null || String(value).trim() === '') return 0;
  const raw = String(value).trim().replace(/[R$\s]/gi, '');
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatCurrencyInput(value) {
  if (value == null || String(value).trim() === '') return '';
  const numeric = toNumber(value);
  return numeric > 0 ? formatCurrency(numeric) : '';
}

function defaultItem(unidade = null) {
  return {
    unidade_comercial_id: unidade?.id ? String(unidade.id) : '',
    valor_tabela: unidade?.valor_tabela ? formatCurrencyInput(unidade.valor_tabela) : '',
    valor_minimo: '',
    observacoes: ''
  };
}

function defaultForm() {
  return {
    id: null,
    empreendimento_id: '',
    codigo: '',
    nome: '',
    status: 'RASCUNHO',
    vigencia_inicio: today(),
    vigencia_fim: '',
    observacoes: '',
    itens: []
  };
}

function pickForm(item = {}) {
  return {
    id: item.id || null,
    empreendimento_id: item.empreendimento_id ? String(item.empreendimento_id) : '',
    codigo: item.codigo || '',
    nome: item.nome || '',
    status: item.status || 'RASCUNHO',
    vigencia_inicio: item.vigencia_inicio || today(),
    vigencia_fim: item.vigencia_fim || '',
    observacoes: item.observacoes || '',
    itens: Array.isArray(item.itens)
      ? item.itens.map((registro) => ({
          unidade_comercial_id: registro.unidade_comercial_id ? String(registro.unidade_comercial_id) : '',
          valor_tabela: formatCurrencyInput(registro.valor_tabela),
          valor_minimo: formatCurrencyInput(registro.valor_minimo),
          observacoes: registro.observacoes || ''
        }))
      : []
  };
}

/*
  QUAIS FILTROS APARECEM (N53) — a declaração desta tela para o painel
  único de `PainelFiltrosVisiveis`, no molde do painel "Colunas" da
  TabelaPadrao.

  NENHUM `padrao: false`: todos os filtros continuam VISÍVEIS na primeira
  abertura. Só três telas têm conjunto inicial reduzido, e é o que o
  cliente aprovou nelas — aqui o seletor apenas passa a EXISTIR, para quem
  quiser mexer. Esconder por padrão mudaria o que a pessoa vê sem ela ter
  pedido.

  `obrigatorio` na busca livre: é o único caminho para achar um registro
  pelo que a pessoa lembra dele. Mesma família da coluna de identidade
  travada da TabelaPadrao — aparece na lista, marcada e sem desmarcar.
*/
const FILTROS_DA_TELA = [
  { id: 'q', rotulo: 'Busca', obrigatorio: true },
  { id: 'empreendimento', rotulo: 'Empreendimento' },
  { id: 'status', rotulo: 'Status' }
];

export default function ComercialTabelasPreco() {
  const [form, setForm] = useState(defaultForm());
  const [empreendimentos, setEmpreendimentos] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [tabelas, setTabelas] = useState([]);
  // R12: o recorte da lista é um CONJUNTO por dimensão (vazio = todas), e
  // não a escolha única de um select.
  const [filtros, setFiltros] = useState({ q: '', empreendimento: new Set(), status: new Set() });
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => {
      const valor = filtros[filtro.id];
      return valor instanceof Set ? valor.size > 0 : String(valor ?? '').trim() !== '';
    }).map((filtro) => filtro.id),
    [filtros]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:comercial-tabelas-preco', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => {
      setFiltros((atual) => ({ ...atual, [id]: atual[id] instanceof Set ? new Set() : '' }));
    }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // R3/R19: erro de carga e de gravação viram faixa do sistema (Avisos), que
  // tem superfície própria e existe também durante o carregamento (B5).
  const { avisos, avisar, fechar } = useAvisos();
  // R22: hook usado é hook importado. A referência serve à ação da faixa
  // fixa (levar o foco ao formulário), não a medida nenhuma.
  const campoNomeRef = useRef(null);

  async function carregar() {
    try {
      setLoading(true);
      const [empreData, unidadesData, tabelasData] = await Promise.all([
        getEmpreendimentosComerciais({ ativo: 1 }),
        getUnidadesComerciais({ ativo: 1 }),
        getTabelasPrecoComerciais()
      ]);
      setEmpreendimentos(Array.isArray(empreData) ? empreData : []);
      setUnidades(Array.isArray(unidadesData) ? unidadesData : []);
      setTabelas(Array.isArray(tabelasData) ? tabelasData : []);
    } catch (err) {
      console.error(err);
      avisar.erro(err?.message || 'Erro ao carregar tabelas de preco');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const unidadesDoEmpreendimento = useMemo(
    () => unidades.filter((item) => String(item.empreendimento_id) === String(form.empreendimento_id)),
    [form.empreendimento_id, unidades]
  );

  const tabelasFiltradas = useMemo(() => {
    const busca = filtros.q.trim().toLowerCase();
    return tabelas.filter((item) => {
      if (filtros.empreendimento.size && !filtros.empreendimento.has(String(item.empreendimento_id))) return false;
      if (filtros.status.size && !filtros.status.has(String(item.status || '').toUpperCase())) return false;
      if (!busca) return true;
      const alvo = [item.nome, item.codigo, item.empreendimento?.nome]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return alvo.includes(busca);
    });
  }, [filtros, tabelas]);

  const unidadesJaSelecionadas = useMemo(
    () => new Set((form.itens || []).map((item) => String(item.unidade_comercial_id))),
    [form.itens]
  );

  function adicionarUnidade(unidade) {
    if (!unidade?.id || unidadesJaSelecionadas.has(String(unidade.id))) return;
    setForm((current) => ({
      ...current,
      itens: [...current.itens, defaultItem(unidade)]
    }));
  }

  function atualizarItem(index, field, value) {
    setForm((current) => {
      const itens = [...current.itens];
      itens[index] = {
        ...itens[index],
        [field]: value
      };
      return {
        ...current,
        itens
      };
    });
  }

  function removerItem(index) {
    setForm((current) => ({
      ...current,
      itens: current.itens.filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  // A ação da faixa fixa não abre nada: o formulário já está na tela (R9).
  // Ela limpa o rascunho e LEVA O FOCO até ele — o que serve para quem está
  // no fim de uma lista longa (R13: a ação principal a um clique).
  function irParaCadastro() {
    setForm(defaultForm());
    campoNomeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    campoNomeRef.current?.focus({ preventScroll: true });
  }

  function editarTabela(item) {
    setForm(pickForm(item));
    campoNomeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      setSaving(true);

      const payload = {
        empreendimento_id: Number(form.empreendimento_id),
        codigo: form.codigo || undefined,
        nome: form.nome,
        status: form.status,
        vigencia_inicio: form.vigencia_inicio || undefined,
        vigencia_fim: form.vigencia_fim || undefined,
        observacoes: form.observacoes || undefined,
        itens: form.itens.map((item) => ({
          unidade_comercial_id: Number(item.unidade_comercial_id),
          valor_tabela: item.valor_tabela,
          valor_minimo: item.valor_minimo || undefined,
          observacoes: item.observacoes || undefined
        }))
      };

      if (form.id) {
        await atualizarTabelaPrecoComercial(form.id, payload);
      } else {
        await criarTabelaPrecoComercial(payload);
      }

      setForm(defaultForm());
      avisar.sucesso(form.id ? 'Tabela de preco salva.' : 'Tabela de preco criada.');
      await carregar();
    } catch (err) {
      console.error(err);
      avisar.erro(err?.message || 'Erro ao salvar tabela de preco');
    } finally {
      setSaving(false);
    }
  }

  async function ativarTabela(id) {
    try {
      await ativarTabelaPrecoComercial(id);
      avisar.sucesso('Tabela ativada.');
      await carregar();
    } catch (err) {
      console.error(err);
      avisar.erro(err?.message || 'Erro ao ativar tabela');
    }
  }

  /*
    R1/R17 — a listagem virou TabelaPadrao.

    Os cards à mão repetiam os mesmos seis dados por registro (nome, status,
    empreendimento, código, vigência e quantidade de itens) em posições
    fixas: é lista tabular desenhada como card. Na tabela cada coluna declara
    o `tipo` e a medida vem do componente (R1/R10) — nada de 180px escrito na
    tela —, a coluna de quantidade ganha `tabular-nums`, o nome trunca com
    tooltip (T6) e no celular o MESMO markup vira card (X1).
  */
  const colunas = [
    {
      id: 'tabela',
      titulo: 'Tabela',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (item) => (
        <CelulaDupla
          principal={item.nome || 'Sem nome'}
          sub={item.codigo ? `Cód. ${item.codigo}` : null}
        />
      )
    },
    {
      id: 'empreendimento',
      titulo: 'Empreendimento',
      tipo: 'texto',
      // A sobra da linha vai para a coluna de identidade (R1).
      flex: false,
      render: (item) => item.empreendimento?.nome || '-'
    },
    {
      id: 'vigencia',
      titulo: 'Vigência',
      tipo: 'texto',
      flex: false,
      render: (item) => (
        <CelulaDupla
          principal={`Inicio: ${formatDate(item.vigencia_inicio)}`}
          sub={`Fim: ${item.vigencia_fim ? formatDate(item.vigencia_fim) : 'sem prazo'}`}
        />
      )
    },
    {
      id: 'itens',
      titulo: 'Itens',
      tipo: 'numero',
      render: (item) => item.itens?.length || 0
    },
    {
      id: 'status',
      titulo: 'Status',
      tipo: 'status',
      // R25: as seis classes de paleta crua do statusClass() saíram — o tom
      // é o do sistema, com ícone junto da cor (StatusBadge).
      render: (item) => <StatusBadge status={item.status} />
    }
  ];

  /*
    B5 — no carregamento a tela também tem cabeçalho e superfície.

    Antes o estado de carga devolvia um card solto sobre o canvas: sem faixa
    fixa, sem título e sem lugar onde um erro de carga pudesse aparecer. A
    `contagem` fica NULA de propósito: passar `0` afirmaria "0 tabelas", e a
    tela ainda não sabe quantas são.
  */
  if (loading) {
    return (
      <Pagina>
        <PageHeader titulo="Tabelas de preço" descricao={DESCRICAO} />
        <Avisos avisos={avisos} aoFechar={fechar} />
        <BlocoConteudo titulo="Tabelas cadastradas" variante="primario" cor="var(--module-comercial)">
          <p className="app-note">Carregando tabelas de preço...</p>
        </BlocoConteudo>
      </Pagina>
    );
  }

  return (
    <Pagina>
      {/* C1/C2/R5/R13: título, contagem e apoio na faixa fixa do topo, com
          superfície própria — o <p class="page-subtitle"> solto sobre o
          canvas saiu. O ritmo vertical da raiz é do Pagina (R10). */}
      <PageHeader
        titulo="Tabelas de preço"
        contagem={`${tabelasFiltradas.length} de ${tabelas.length} tabela(s)`}
        descricao={DESCRICAO}
        acaoPrincipal={{ rotulo: 'Nova tabela', onClick: irParaCadastro }}
      />

      {/* R16: UM dono para a faixa de avisos — logo abaixo do cabeçalho. */}
      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        R9 (revista em 04/09) — FORMULÁRIO INLINE, E NÃO EM MODAL.

        Esta tela existe PARA montar tabela de preço: tire o formulário e o
        que sobra é uma lista que ninguém abriria por si só. Modal fica
        reservado ao cadastro que INTERROMPE outro trabalho.

        ARRANJO — empilhado, e não em duas colunas. O par
        `grid-cols-[520px_minmax(0,1fr)]` escrevia a medida na tela (R10) e,
        de quebra, espremia as duas metades: o editor de itens tem três
        campos por unidade (dois deles de dinheiro, com piso de 180px pela
        R6) e a lista tem cinco colunas. Em largura inteira os dois cabem sem
        apertar — R10: quando "cabe mais" briga com "lê-se melhor", vence a
        leitura.
      */}
      <BlocoConteudo titulo={form.id ? 'Editar tabela de preco' : 'Nova tabela de preco'}>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <p className="app-note">A tabela ativa pode atualizar o valor de tabela das unidades automaticamente.</p>

          {/* R12: estes selects são ENTRADA DE DADO da tabela que se está
              cadastrando, não recorte de lista — select de formulário segue
              legítimo. */}
          <FormSecao legenda="Identificação" colunas={2}>
            <CampoForm label="Nome" obrigatorio>
              <input
                ref={campoNomeRef}
                className="input w-full"
                value={form.nome}
                onChange={(e) => setForm((current) => ({ ...current, nome: e.target.value }))}
                required
              />
            </CampoForm>
            <CampoForm label="Código">
              <input
                className="input w-full"
                value={form.codigo}
                onChange={(e) => setForm((current) => ({ ...current, codigo: e.target.value }))}
              />
            </CampoForm>
            <CampoForm label="Empreendimento" obrigatorio hint="Trocar o empreendimento limpa os itens já escolhidos.">
              <select
                className="input w-full"
                value={form.empreendimento_id}
                onChange={(e) => setForm((current) => ({ ...current, empreendimento_id: e.target.value, itens: [] }))}
                required
              >
                <option value="">Selecione</option>
                {empreendimentos.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
              </select>
            </CampoForm>
            <CampoForm label="Status">
              <select
                className="input w-full"
                value={form.status}
                onChange={(e) => setForm((current) => ({ ...current, status: e.target.value }))}
              >
                {STATUS_TABELA.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </CampoForm>
          </FormSecao>

          <FormSecao legenda="Vigência" colunas={2}>
            <CampoForm label="Vigência inicial">
              <DateInputBR
                className="input w-full"
                value={form.vigencia_inicio}
                onChange={(e) => setForm((current) => ({ ...current, vigencia_inicio: e.target.value }))}
              />
            </CampoForm>
            <CampoForm label="Vigência final" hint="Em branco = sem prazo de fim.">
              <DateInputBR
                className="input w-full"
                value={form.vigencia_fim}
                onChange={(e) => setForm((current) => ({ ...current, vigencia_fim: e.target.value }))}
              />
            </CampoForm>
            <CampoForm label="Observações" tipo="observacao">
              <textarea
                className="input w-full"
                rows={3}
                value={form.observacoes}
                onChange={(e) => setForm((current) => ({ ...current, observacoes: e.target.value }))}
              />
            </CampoForm>
          </FormSecao>

          {/*
            Itens da tabela — R6/R10.

            A linha de item era um grid com as larguras escritas na tela
            (`160px_180px_180px_...`) e os dois campos de dinheiro com
            `input w-full`, sem `.input-moeda`. Agora cada unidade é uma
            seção de formulário: a distribuição vem do `form-grid` e os dois
            campos de dinheiro carregam `.input-moeda` (piso de 180px,
            alinhado à direita, `tabular-nums`). O código da unidade, que
            antes ficava num campo desabilitado só para ser lido, é a legenda
            da seção — o dado continua à vista, sem um controle que não faz
            nada.
          */}
          <div className="space-y-4 rounded-2xl border border-[var(--c-border)] bg-[var(--c-bg)] p-4">
            <div>
              <p className="text-sm font-semibold text-[var(--c-text)]">Itens da tabela</p>
              <p className="text-xs text-[var(--c-muted)]">
                Selecione as unidades e defina os valores comerciais dessa tabela.
              </p>
            </div>

            {form.empreendimento_id ? (
              <div className="flex flex-wrap gap-2">
                {unidadesDoEmpreendimento
                  .filter((item) => !unidadesJaSelecionadas.has(String(item.id)))
                  .map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => adicionarUnidade(item)}
                    >
                      + {item.codigo}
                    </button>
                  ))}
              </div>
            ) : (
              <p className="app-note">Selecione um empreendimento para adicionar unidades.</p>
            )}

            {(form.itens || []).length > 0 && (
              <div className="space-y-3">
                {form.itens.map((item, index) => {
                  const unidade = unidadesDoEmpreendimento.find(
                    (registro) => String(registro.id) === String(item.unidade_comercial_id)
                  );
                  return (
                    <div
                      key={`${item.unidade_comercial_id}-${index}`}
                      className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3"
                    >
                      <FormSecao legenda={`Unidade ${unidade?.codigo || item.unidade_comercial_id}`} colunas={3}>
                        <CampoForm label="Valor tabela">
                          <input
                            className="input input-moeda w-full"
                            inputMode="decimal"
                            value={item.valor_tabela}
                            onChange={(e) => atualizarItem(index, 'valor_tabela', e.target.value)}
                            onBlur={(e) => atualizarItem(index, 'valor_tabela', formatCurrencyInput(e.target.value))}
                            placeholder="R$ 0,00"
                          />
                        </CampoForm>
                        <CampoForm label="Valor mínimo">
                          <input
                            className="input input-moeda w-full"
                            inputMode="decimal"
                            value={item.valor_minimo}
                            onChange={(e) => atualizarItem(index, 'valor_minimo', e.target.value)}
                            onBlur={(e) => atualizarItem(index, 'valor_minimo', formatCurrencyInput(e.target.value))}
                            placeholder="R$ 0,00"
                          />
                        </CampoForm>
                        <CampoForm label="Observações">
                          <input
                            className="input w-full"
                            value={item.observacoes}
                            onChange={(e) => atualizarItem(index, 'observacoes', e.target.value)}
                          />
                        </CampoForm>
                      </FormSecao>

                      <div className="app-actionbar">
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => removerItem(index)}
                        >
                          Remover unidade
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="app-actionbar">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : form.id ? 'Salvar tabela' : 'Criar tabela'}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setForm(defaultForm())}>
              Limpar
            </button>
          </div>
        </form>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Tabelas cadastradas"
        descricao="Ative a tabela vigente e mantenha o histórico comercial por empreendimento."
        variante="primario"
        cor="var(--module-comercial)"
      >
        {/* R12/R3: busca larga em cima + filtros por marcação com etiquetas
            removíveis — o <select> "Empreendimento" de recorte saiu. O
            filtro aplica ao marcar (R23: recorte local, sem consulta cara). */}
        <BarraFiltros
          busca={visibilidadeFiltros.ehVisivel('q') ? {
            valor: filtros.q,
            aoMudar: (valor) => setFiltros((prev) => ({ ...prev, q: valor })),
            placeholder: 'Buscar por nome, código ou empreendimento'
          } : null}
          filtros={[
            {
              id: 'empreendimento',
              rotulo: 'Empreendimento',
              opcoes: empreendimentos.map((item) => ({ valor: String(item.id), rotulo: item.nome }))
            },
            {
              id: 'status',
              rotulo: 'Status',
              opcoes: STATUS_TABELA.map((item) => ({ valor: item, rotulo: item }))
            }
          ].filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={{ empreendimento: filtros.empreendimento, status: filtros.status }}
          aoAlternar={(dim, valor, opcoes) => setFiltros((prev) => ({
            ...alternarValorFiltro(prev, dim, valor, opcoes),
            q: prev.q
          }))}
          aoLimpar={() => setFiltros((prev) => ({ ...prev, empreendimento: new Set(), status: new Set() }))}
          visibilidade={visibilidadeFiltros}
        />

        <TabelaPadrao
          colunas={colunas}
          itens={tabelasFiltradas}
          storageKey="tabela:comercial-tabelas-preco"
          rotuloRolagem="Tabelas de preco"
          larguraAcoes={200}
          vazio={{
            title: 'Nenhuma tabela de preco cadastrada',
            message: 'Monte a primeira tabela acima para o empreendimento passar a ter valor de tabela e valor minimo por unidade.'
          }}
          acoesLinha={(item) => (
            <>
              {item.status !== 'ATIVA' && (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => ativarTabela(item.id)}>
                  Ativar
                </button>
              )}{' '}
              <button type="button" className="btn btn-outline btn-sm" onClick={() => editarTabela(item)}>
                Editar
              </button>
            </>
          )}
        />
      </BlocoConteudo>
    </Pagina>
  );
}
