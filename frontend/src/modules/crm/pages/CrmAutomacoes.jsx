import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ativarAutomacaoCrm,
  atualizarAutomacaoCrm,
  criarAutomacaoCrm,
  desativarAutomacaoCrm,
  executarCicloAutomacoesCrm,
  listarExecucoesAutomacaoCrm,
  listarAutomacoesCrm
} from '../../../services/crm';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  StatGrid,
  StatTile,
  TabelaPadrao,
  CelulaDupla,
  FormSecao,
  CampoForm,
  BarraFiltros,
  alternarValorFiltro,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';

const TRIGGERS = {
  LEAD_CREATED: 'Lead criado',
  NO_FIRST_CONTACT: 'Sem primeiro contato',
  NO_ACTIVITY: 'Sem atividade',
  STAGE_CHANGED: 'Mudanca de etapa',
  MESSAGE_RECEIVED: 'Mensagem recebida',
  LEAD_REFUSED: 'Lead recusado',
  DAILY_LIMIT_REACHED: 'Limite diario atingido',
  ROLLOUT_PHASE_CHANGED: 'Mudanca de fase do rollout'
};

const emptyForm = {
  nome: '',
  trigger_type: 'LEAD_CREATED',
  priority: 100,
  ativo: true,
  conditions_json: '{\n  "exemplo": true\n}',
  actions_json: '[\n  {\n    "type": "CREATE_TASK",\n    "title": "Executar acao comercial"\n  }\n]'
};

/*
  R25 — o status da EXECUÇÃO vinha numa escada de paleta crua
  (emerald-100/700, red-100/700, blue-100/700 e o cinza de sobra). Paleta
  crua não tem par no tema escuro nem passa pelo piso de contraste do
  ThemeContext (R24). O mapa preserva as distinções que a escada fazia.
*/
const FAMILIA_EXECUCAO = {
  SUCCESS: 'success',
  ERROR: 'danger',
  PROCESSING: 'info',
  SKIPPED: 'neutral'
};

function fmtJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback;
  }
}

function fmtDataHora(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

// O serviço aceita UM valor por dimensão (`ativo=true`, `trigger_type=X`).
// Daí o `unico: true` nas dimensões da BarraFiltros e esta leitura: o
// conjunto marcado vira o parâmetro único que a consulta entende.
function valorUnico(conjunto) {
  const [primeiro] = Array.from(conjunto || []);
  return primeiro ?? '';
}

export default function CrmAutomacoes() {
  const [items, setItems] = useState([]);
  const [executions, setExecutions] = useState([]);
  /*
    R12 — os dois <select> ("Todos status" / "Todos gatilhos") viraram
    marcação com etiqueta removível. As duas dimensões são `unico: true`
    porque o serviço só aceita um valor em cada parâmetro: com marcação
    múltipla o usuário veria duas etiquetas e a consulta mandaria só uma —
    capacidade aparente sem efeito, a família da R15.
  */
  const [filtrosMarcados, setFiltrosMarcados] = useState({
    ativo: new Set(),
    trigger_type: new Set()
  });
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningCycle, setRunningCycle] = useState(false);
  // R22: hook usado é hook importado — o useRef está no import acima. Leva
  // o foco ao formulário, que fica ACIMA da lista; não mede nada.
  const campoNomeRef = useRef(null);
  // R19: o `error` era um <div> de paleta crua (border-red-200/bg-red-50/
  // text-red-700) montado à mão. Agora é a faixa de avisos do sistema.
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  const filters = useMemo(() => ({
    ativo: valorUnico(filtrosMarcados.ativo),
    trigger_type: valorUnico(filtrosMarcados.trigger_type)
  }), [filtrosMarcados]);

  const load = useCallback(() => {
    setLoading(true);
    return listarAutomacoesCrm(filters)
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((err) => avisar.erro(err.message || 'Erro ao carregar automacoes'))
      .finally(() => setLoading(false));
  }, [filters, avisar]);

  const loadExecutions = useCallback(() => {
    return listarExecucoesAutomacaoCrm({ limit: 20 })
      .then((data) => setExecutions(Array.isArray(data) ? data : []))
      .catch(() => setExecutions([]));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadExecutions(); }, [loadExecutions]);

  const resumo = useMemo(() => {
    const ativos = items.filter((item) => item.ativo).length;
    return { total: items.length, ativos, inativos: items.length - ativos };
  }, [items]);

  function updateForm(field) {
    return (event) => {
      const value = field === 'ativo' ? event.target.checked : event.target.value;
      setForm((current) => ({ ...current, [field]: value }));
    };
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  // O formulário fica ACIMA da lista: sem levar o foco até ele, "Editar" no
  // fim de uma lista longa não muda nada no campo de visão (R15).
  function focarFormulario() {
    campoNomeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    campoNomeRef.current?.focus({ preventScroll: true });
  }

  function novaAutomacao() {
    resetForm();
    focarFormulario();
  }

  function startEdit(item) {
    setEditingId(item.id);
    setForm({
      nome: item.nome || '',
      trigger_type: item.trigger_type || 'LEAD_CREATED',
      priority: item.priority || 100,
      ativo: Boolean(item.ativo),
      // A regra em si NÃO foi tocada: condição e ação continuam sendo o
      // JSON que o runtime lê, exatamente com o mesmo formato.
      conditions_json: fmtJson(item.conditions_json, '{}'),
      actions_json: fmtJson(item.actions_json, '[]')
    });
    focarFormulario();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        priority: Number(form.priority || 100)
      };
      if (editingId) {
        await atualizarAutomacaoCrm(editingId, payload);
      } else {
        await criarAutomacaoCrm(payload);
      }
      resetForm();
      avisar.sucesso('Automação salva.');
      load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao salvar automacao');
    } finally {
      setSaving(false);
    }
  }

  /*
    R21 + R26 — DESATIVAR uma regra tem efeito operacional real: a partir do
    clique o runtime deixa de executá-la (a tarefa não é criada, o lead não
    é redistribuido, o gestor não é notificado). Por isso:

    1. `const { ok } = await confirmar(...)` — DESESTRUTURADO. O retorno é
       `{ ok, texto }`, e objeto é sempre truthy: lido como booleano, o
       "Cancelar" DESATIVARIA a regra;
    2. a regra é fixada numa `const` ANTES do `await`, junto do estado que
       decide o sentido da ação. O modal não congela a tela: reler
       `item.ativo` depois da confirmação faria a tela perguntar sobre uma
       regra e agir sobre outra.

    Ativar não pergunta: ligar de volta o que estava desligado é a direção
    reversível da mesma chave.
  */
  async function toggleStatus(item) {
    const regra = item;
    const estavaAtiva = Boolean(regra.ativo);
    if (estavaAtiva) {
      const { ok } = await confirmar({
        titulo: 'Desativar automação',
        mensagem: `Desativar "${regra.nome}"? O runtime para de executar esta regra: os gatilhos continuam acontecendo, mas nenhuma acao dela sera disparada.`,
        rotuloConfirmar: 'Desativar',
        destrutiva: true
      });
      if (!ok) return;
    }
    try {
      if (estavaAtiva) {
        await desativarAutomacaoCrm(regra.id);
      } else {
        await ativarAutomacaoCrm(regra.id);
      }
      avisar.sucesso(estavaAtiva ? 'Automacao desativada.' : 'Automacao ativada.');
      load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao alterar status');
    }
  }

  async function handleRunCycle() {
    setRunningCycle(true);
    try {
      const result = await executarCicloAutomacoesCrm();
      if (result?.ok === false) {
        avisar.erro(result.message || 'Nao foi possivel executar o ciclo de automacoes.');
        return;
      }
      await Promise.all([
        load(),
        loadExecutions()
      ]);
    } catch (err) {
      avisar.erro(err.message || 'Erro ao executar ciclo de automacoes');
    } finally {
      setRunningCycle(false);
    }
  }

  /* R1/R17 — cada coluna declara o PAPEL; a medida é do componente. */
  const colunasRegras = [
    {
      id: 'automacao',
      titulo: 'Automação',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (item) => (
        <CelulaDupla
          principal={item.nome}
          sub={`Criado por ${item.criadoPor?.nome || '-'} · Última execução: ${fmtDataHora(item.last_run_at)}`}
        />
      )
    },
    {
      id: 'gatilho',
      titulo: 'Gatilho',
      tipo: 'texto',
      render: (item) => TRIGGERS[item.trigger_type] || item.trigger_type || '-'
    },
    {
      id: 'prioridade',
      titulo: 'Prioridade',
      tipo: 'numero',
      render: (item) => item.priority
    },
    {
      id: 'status',
      titulo: 'Status',
      tipo: 'status',
      // R25: a pílula era `bg-emerald-100 text-emerald-700` × cinza.
      render: (item) => (
        <StatusBadge status={item.ativo ? 'Ativa' : 'Inativa'} kind={item.ativo ? 'success' : 'neutral'} />
      )
    }
  ];

  const colunasExecucoes = [
    {
      id: 'quando',
      titulo: 'Quando',
      tipo: 'data',
      render: (execution) => fmtDataHora(execution.createdAt)
    },
    {
      id: 'regra',
      titulo: 'Regra',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (execution) => execution.rule?.nome || `Regra #${execution.rule_id}`
    },
    {
      id: 'lead',
      titulo: 'Lead',
      tipo: 'texto',
      render: (execution) => execution.lead?.nome || '-'
    },
    {
      id: 'trigger',
      titulo: 'Trigger',
      tipo: 'texto',
      render: (execution) => TRIGGERS[execution.trigger_type] || execution.trigger_type || '-'
    },
    {
      id: 'status',
      titulo: 'Status',
      tipo: 'status',
      render: (execution) => (
        <StatusBadge
          status={execution.status}
          kind={FAMILIA_EXECUCAO[execution.status] || 'info'}
        />
      )
    },
    {
      id: 'mensagem',
      titulo: 'Mensagem',
      tipo: 'texto',
      // T6: a mensagem do runtime trunca com o texto completo no tooltip.
      render: (execution) => (
        <span title={execution.message || undefined}>{execution.message || '-'}</span>
      )
    }
  ];

  return (
    <Pagina>
      {/* R13/R5/C1: título, contagem e apoio na faixa fixa do PageHeader. */}
      <PageHeader
        titulo="Automações CRM"
        contagem={loading ? null : `${items.length} regra(s)`}
        descricao="Regras cadastrais para padronizar resposta, SLA e follow-up comercial."
        acaoPrincipal={{
          rotulo: runningCycle ? 'Executando...' : 'Executar ciclo',
          onClick: handleRunCycle,
          desabilitada: runningCycle
        }}
        secundarias={[
          { rotulo: 'Nova automação', onClick: novaAutomacao },
          { rotulo: 'Atualizar', onClick: load, desabilitada: loading }
        ]}
      />

      {/* R16: UM dono para a faixa de avisos. */}
      <Avisos avisos={avisos} aoFechar={fechar} />

      {/* R10/R25: os três cartões eram `text-3xl` (escala fora da folha) com
          o número das ativas em `text-emerald-600` (paleta crua). O
          StatTile dá escala e tom semântico por token. */}
      <StatGrid colunas={3}>
        <StatTile label="Total configurado" valor={resumo.total} />
        <StatTile label="Ativas" valor={resumo.ativos} tom="success" />
        <StatTile label="Inativas" valor={resumo.inativos} />
      </StatGrid>

      {/*
        R9 (revista em 04/09) — FORMULÁRIO INLINE, painel ACIMA da lista.
        A tela EXISTE para cadastrar regra de automação: tirando o
        formulário sobra uma lista que ninguém abriria por si só.

        R10: o arranjo anterior era um grid `xl:grid-cols-[420px_minmax(0,1fr)]`
        — medida em pixel escrita na tela, e que espremia a lista em meia
        largura. Empilhado, cada bloco recebe a faixa inteira.

        A ESTRUTURA DA REGRA NÃO MUDOU: gatilho, prioridade, condição e ação
        continuam sendo os mesmos campos, com o mesmo formato JSON que o
        runtime lê. Só a apresentação foi reorganizada.
      */}
      <BlocoConteudo
        titulo={editingId ? 'Editar automacao' : 'Nova automacao'}
        descricao="O runtime já executa regras ativas por evento e por ciclo agendado; use esta tela para calibrar prioridade, condições e ações."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormSecao legenda="Gatilho e prioridade" colunas={2}>
            <CampoForm label="Nome" span={2}>
              <input
                ref={campoNomeRef}
                className="input w-full"
                value={form.nome}
                onChange={updateForm('nome')}
                placeholder="Ex: Criar tarefa após lead novo"
              />
            </CampoForm>
            <CampoForm label="Gatilho">
              {/* R12: select de FORMULÁRIO (entrada de dado do registro) —
                  legítimo. O recorte da LISTA é que virou marcação. */}
              <select className="input w-full" value={form.trigger_type} onChange={updateForm('trigger_type')}>
                {Object.entries(TRIGGERS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </CampoForm>
            <CampoForm label="Prioridade">
              <input className="input w-full" type="number" min="1" value={form.priority} onChange={updateForm('priority')} />
            </CampoForm>
            <CampoForm label="" linha>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.ativo} onChange={updateForm('ativo')} />
                Ativa
              </label>
            </CampoForm>
          </FormSecao>

          <FormSecao legenda="Condição e ação" colunas={2}>
            {/* R10: a altura dos textareas vinha de `min-h-[130px]` e
                `min-h-[150px]` — pixel escrito na tela. A altura mora na
                folha do sistema (textarea.input). */}
            <CampoForm label="Condições JSON" tipo="texto-longo">
              <textarea
                className="input w-full font-mono text-xs"
                value={form.conditions_json}
                onChange={updateForm('conditions_json')}
              />
            </CampoForm>
            <CampoForm
              label="Ações JSON"
              tipo="texto-longo"
              hint="Acoes suportadas: CREATE_TASK, CHANGE_STAGE, ADD_TAG, ASSIGN_USER, REDISTRIBUTE_LEAD, NOTIFY_MANAGER, NOTIFY_OWNER, CREATE_INTERNAL_NOTE e ARCHIVE_LEAD."
            >
              <textarea
                className="input w-full font-mono text-xs"
                value={form.actions_json}
                onChange={updateForm('actions_json')}
              />
            </CampoForm>
          </FormSecao>

          <div className="app-actionbar">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar automacao'}
            </button>
            {editingId ? (
              <button type="button" className="btn btn-outline" onClick={resetForm}>Cancelar edição</button>
            ) : null}
          </div>
        </form>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Regras cadastradas"
        descricao="Filtros para suporte e auditoria operacional."
        variante="primario"
        cor="var(--c-primary)"
      >
        {/* R12/R3: busca não existia aqui e os dois recortes eram select de
            escolha única. Agora é a faixa padrão, com marcação de valor
            único (o serviço só aceita um por dimensão) e etiqueta removível
            que diz o que está filtrando. */}
        <BarraFiltros
          filtros={[
            {
              id: 'ativo',
              rotulo: 'Status',
              unico: true,
              opcoes: [
                { valor: 'true', rotulo: 'Ativas' },
                { valor: 'false', rotulo: 'Inativas' }
              ]
            },
            {
              id: 'trigger_type',
              rotulo: 'Gatilho',
              unico: true,
              opcoes: Object.entries(TRIGGERS).map(([valor, rotulo]) => ({ valor, rotulo }))
            }
          ]}
          ativos={filtrosMarcados}
          aoAlternar={(dim, valor, opcoes) => setFiltrosMarcados((prev) => alternarValorFiltro(prev, dim, valor, opcoes))}
          aoLimpar={() => setFiltrosMarcados({ ativo: new Set(), trigger_type: new Set() })}
        />

        {/* A1: ação da linha em <button> focável e linha acionável por
            teclado (tabIndex + Enter/Espaço vêm do TabelaPadrao). */}
        <TabelaPadrao
          colunas={colunasRegras}
          itens={items}
          getId={(item) => item.id}
          carregando={loading}
          vazio={{
            title: 'Nenhuma automacao cadastrada',
            message: 'Cadastre a primeira regra para padronizar resposta, SLA e follow-up sem depender de lembrete.'
          }}
          storageKey="tabela:crm-automacoes:regras"
          rotuloRolagem="Regras cadastradas"
          colunasConfiguraveis
          aoClicarLinha={startEdit}
          acoesLinha={(item) => (
            <>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => startEdit(item)}>Editar</button>
              {item.ativo ? (
                // Desativar para de disparar as acoes da regra: vermelho
                // suave e APARTADO das demais.
                <span className="app-actionbar-apartada">
                  <button type="button" className="btn btn-outline btn-sm btn-perigo-suave" onClick={() => toggleStatus(item)}>
                    Desativar
                  </button>
                </span>
              ) : (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => toggleStatus(item)}>
                  Ativar
                </button>
              )}
            </>
          )}
          larguraAcoes={220}
        />
      </BlocoConteudo>

      {/* Histórico por último e em superfície rebaixada: é o log do runtime,
          contexto para homologação e auditoria — não é o que a tela existe
          para fazer. */}
      <BlocoConteudo
        titulo="Execuções recentes"
        contagem={`${executions.length} execução(oes)`}
        descricao="Log operacional do runtime para homologação e auditoria."
        variante="secundario"
        acoes={(
          <button type="button" className="btn btn-outline btn-sm" onClick={loadExecutions}>
            Atualizar log
          </button>
        )}
      >
        <TabelaPadrao
          colunas={colunasExecucoes}
          itens={executions}
          getId={(execution) => execution.id}
          vazio={{
            title: 'Nenhuma execucao registrada ate o momento',
            message: 'Assim que uma regra ativa for disparada por evento ou pelo ciclo, o resultado aparece aqui.'
          }}
          storageKey="tabela:crm-automacoes:execucoes"
          rotuloRolagem="Execucoes recentes"
          colunasConfiguraveis
        />
      </BlocoConteudo>

      {elementoConfirmacao}
    </Pagina>
  );
}
