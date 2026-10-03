import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  obterLead,
  atualizarLead,
  alterarEtapaLead,
  registrarPerdaLead,
  registrarConversaoLead,
  arquivarLead,
  listarCandidatosRedistribuicaoCrm,
  redistribuirLeadCrm,
  listarPipelines,
  listarMotivosPerda,
  listarInteracoes,
  registrarInteracao,
  listarTarefas,
  criarTarefa,
  concluirTarefa,
  cancelarTarefa
} from '../../../services/crm';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  StatGrid,
  StatTile,
  CamposComVazios,
  FormSecao,
  CampoForm,
  TabelaPadrao,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../../../components/padrao';
import OverlayModal from '../../../components/ui/OverlayModal';
import StatusBadge from '../../../components/StatusBadge';
import { useAuth } from '../../../contexts/AuthContext';
import { canRedistributeCrmLeads } from '../../../utils/acessoProduto';
import { getCpfCnpjError, maskCpfCnpj, onlyDigits } from '../../../utils/formatters';
import DateInputBR from '../../../components/DateInputBR';

/*
  R25/R2 — a cor do status vinha de paleta crua do Tailwind
  (`bg-indigo-100 text-indigo-700` e mais treze variantes), que não tem par
  definido no tema escuro nem passa pelo piso de contraste do ThemeContext.
  Agora o mapa declara só o RÓTULO e a FAMÍLIA SEMÂNTICA; quem pinta é o
  `StatusBadge` do sistema, com token e ícone (cor sozinha não comunica).
  Nenhum status deixou de existir — só a fonte da cor mudou.
*/
const LIFECYCLE_MAP = {
  NOVO:         { label: 'Novo',         kind: 'info' },
  CONTATO:      { label: 'Contato',      kind: 'info' },
  QUALIFICADO:  { label: 'Qualificado',  kind: 'info' },
  OPORTUNIDADE: { label: 'Oportunidade', kind: 'warning' },
  CONVERTIDO:   { label: 'Convertido',   kind: 'success' },
  PERDIDO:      { label: 'Perdido',      kind: 'danger' },
  ARQUIVADO:    { label: 'Arquivado',    kind: 'neutral' }
};

const TEMP_MAP = {
  FRIO:   { label: 'Frio',   emoji: '🧊', kind: 'info' },
  MORNO:  { label: 'Morno',  emoji: '🟡', kind: 'warning' },
  QUENTE: { label: 'Quente', emoji: '🔥', kind: 'danger' }
};

const TIPO_INTERACAO_LABEL = {
  NOTE: 'Observacao',
  CALL: 'Ligacao',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'E-mail',
  MEETING: 'Reuniao'
};

const TIPO_INTERACAO_EMOJI = {
  CALL: '📞',
  WHATSAPP: '💬',
  EMAIL: '📧',
  MEETING: '📅',
  NOTE: '📝'
};

const TIPO_TAREFA_LABEL = {
  CALL: 'Ligacao',
  WHATSAPP: 'WhatsApp',
  VISIT: 'Visita',
  EMAIL: 'E-mail',
  PROPOSAL: 'Proposta',
  OTHER: 'Outro'
};

const PRIORIDADE_TAREFA = {
  HIGH: { label: 'Alta', kind: 'danger' },
  MEDIUM: { label: 'Media', kind: 'warning' },
  LOW: { label: 'Baixa', kind: 'info' }
};

const STATUS_TAREFA = {
  PENDING: { label: 'Pendente', kind: 'warning' },
  DONE: { label: 'Concluída', kind: 'success' },
  CANCELLED: { label: 'Cancelada', kind: 'neutral' }
};

function fmt(val) {
  if (!val) return '—';
  return new Date(val).toLocaleString('pt-BR');
}

/*
  B4 / `CamposComVazios`: a contagem de vazios sai da PRÓPRIA lista de
  campos — quem devolve o travessão "—" no lugar do vazio faz o alternador
  contar zero e o campo aparecer preenchido com um traço. Então, para
  alimentar a lista, data ausente vira `null`, não texto.
*/
function fmtOuNulo(val) {
  if (!val) return null;
  return new Date(val).toLocaleString('pt-BR');
}

function fmtDataOuNulo(val) {
  if (!val) return null;
  return new Date(val).toLocaleDateString('pt-BR');
}

function EtapaDoLead({ etapa }) {
  if (!etapa) return null;
  return (
    <span className="inline-flex items-center gap-2">
      {/* A cor vem do DADO (etapa cadastrada pelo usuário), não é cor à mão. */}
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: etapa.cor }} />
      {etapa.nome}
    </span>
  );
}

export default function CrmLeadDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [lead, setLead] = useState(null);
  const [pipelines, setPipelines] = useState([]);
  const [motivosPerda, setMotivosPerda] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // edit state
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({});

  // modals
  const [showLoss, setShowLoss] = useState(false);
  const [lossMotivo, setLossMotivo] = useState('');
  const [lossObs, setLossObs] = useState('');
  const [showRedistribute, setShowRedistribute] = useState(false);
  const [redistributionCandidates, setRedistributionCandidates] = useState([]);
  const [redistributionForm, setRedistributionForm] = useState({ assigned_user_id: '', motivo: '' });
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [savingRedistribution, setSavingRedistribution] = useState(false);

  // interactions
  const [interactions, setInteractions] = useState([]);
  const [showAddInteraction, setShowAddInteraction] = useState(false);
  const [interactionForm, setInteractionForm] = useState({ interaction_type: 'NOTE', title: '', content: '' });
  const [savingInteraction, setSavingInteraction] = useState(false);

  // tasks
  const [tasks, setTasks] = useState([]);
  const [showAddTask, setShowAddTask] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', task_type: 'CALL', due_at: '', priority: 'MEDIUM' });
  const [savingTask, setSavingTask] = useState(false);

  useEffect(() => {
    Promise.all([
      obterLead(id),
      listarPipelines(),
      listarMotivosPerda(),
      listarInteracoes(id),
      listarTarefas({ lead_id: id, limit: 100 })
    ]).then(([l, p, m, interRes, taskRes]) => {
      setLead(l);
      setPipelines(Array.isArray(p) ? p : []);
      setMotivosPerda(Array.isArray(m) ? m : []);
      setInteractions(Array.isArray(interRes?.interactions) ? interRes.interactions : []);
      setTasks(Array.isArray(taskRes?.tasks) ? taskRes.tasks : []);
    }).catch((err) => {
      avisar.erro(err.message || 'Erro ao carregar lead');
    }).finally(() => setLoading(false));
    // `avisar` é estável (useMemo no useAvisos) — a dependência é o lead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleAddInteraction(e) {
    e.preventDefault();
    if (!interactionForm.content.trim() && !interactionForm.title.trim()) return;
    try {
      setSavingInteraction(true);
      const newInt = await registrarInteracao(id, interactionForm);
      setInteractions((prev) => [newInt, ...prev]);
      setInteractionForm({ interaction_type: 'NOTE', title: '', content: '' });
      setShowAddInteraction(false);
    } catch (err) {
      avisar.erro(err.message || 'Erro ao registrar interacao');
    } finally {
      setSavingInteraction(false);
    }
  }

  async function handleAddTask(e) {
    e.preventDefault();
    if (!taskForm.title.trim()) return;
    try {
      setSavingTask(true);
      const newTask = await criarTarefa({ ...taskForm, lead_id: Number(id) });
      setTasks((prev) => [newTask, ...prev]);
      setTaskForm({ title: '', task_type: 'CALL', due_at: '', priority: 'MEDIUM' });
      setShowAddTask(false);
    } catch (err) {
      avisar.erro(err.message || 'Erro ao criar tarefa');
    } finally {
      setSavingTask(false);
    }
  }

  async function handleCompleteTask(taskId) {
    try {
      await concluirTarefa(taskId);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: 'DONE' } : t)));
    } catch (err) {
      avisar.erro(err.message || 'Erro ao concluir tarefa');
    }
  }

  /*
    R21 + R26 — a versão anterior era `if (!confirm('Cancelar esta tarefa?'))`,
    com a caixa do navegador e sem dizer QUAL tarefa. Duas correções:
    1. `useConfirmacao` devolve `{ ok, texto }` — desestruturado, senão o
       "Cancelar" do modal seguiria com a ação (objeto é sempre truthy);
    2. a tarefa é FIXADA numa const ANTES do `await`. O modal do sistema não
       congela a página: a lista pode ser recarregada enquanto ele está
       aberto, e ler o alvo depois faria perguntar sobre uma tarefa e
       cancelar outra — consentimento válido para a ação errada.
  */
  async function handleCancelTask(task) {
    const alvo = task;
    const { ok } = await confirmar({
      titulo: 'Cancelar tarefa',
      mensagem: `Cancelar a tarefa "${alvo.title}"? Esta acao nao pode ser desfeita.`,
      rotuloConfirmar: 'Cancelar tarefa',
      rotuloCancelar: 'Manter tarefa',
      destrutiva: true
    });
    if (!ok) return;
    try {
      await cancelarTarefa(alvo.id);
      setTasks((prev) => prev.map((t) => (t.id === alvo.id ? { ...t, status: 'CANCELLED' } : t)));
    } catch (err) {
      avisar.erro(err.message || 'Erro ao cancelar tarefa');
    }
  }

  function iniciarEdicao() {
    setForm({
      nome: lead.nome || '',
      telefone: lead.telefone || '',
      email: lead.email || '',
      documento: lead.documento || '',
      cidade: lead.cidade || '',
      estado: lead.estado || '',
      empreendimento_interesse: lead.empreendimento_interesse || '',
      produto_interesse: lead.produto_interesse || '',
      faixa_valor: lead.faixa_valor || '',
      observacoes: lead.observacoes || '',
      temperatura: lead.temperatura || 'FRIO',
      score: lead.score || 0,
      proximo_followup_at: lead.proximo_followup_at ? lead.proximo_followup_at.split('T')[0] : ''
    });
    setEditando(true);
  }

  async function salvarEdicao() {
    const documentoErro = getCpfCnpjError(form.documento);
    if (documentoErro) {
      avisar.alerta(documentoErro);
      return;
    }
    try {
      setSaving(true);
      const updated = await atualizarLead(id, { ...form, documento: onlyDigits(form.documento) });
      setLead(updated);
      setEditando(false);
      avisar.sucesso('Lead atualizado.');
    } catch (err) {
      avisar.erro(err.message || 'Erro ao salvar lead');
    } finally {
      setSaving(false);
    }
  }

  async function handleChangeStage(stageId) {
    try {
      const updated = await alterarEtapaLead(id, Number(stageId));
      setLead((l) => ({ ...l, ...updated }));
    } catch (err) {
      avisar.erro(err.message || 'Erro ao alterar etapa');
    }
  }

  async function handleConversao() {
    // R26: o nome usado na pergunta é o mesmo que a ação usa depois.
    const alvo = lead;
    const { ok } = await confirmar({
      titulo: 'Registrar conversão',
      mensagem: `Registrar a conversao do lead "${alvo.nome}"?`,
      rotuloConfirmar: 'Registrar conversao'
    });
    if (!ok) return;
    try {
      const updated = await registrarConversaoLead(id);
      setLead((l) => ({ ...l, ...updated }));
      avisar.sucesso('Conversão registrada.');
    } catch (err) {
      avisar.erro(err.message || 'Erro ao registrar conversao');
    }
  }

  async function handlePerda() {
    try {
      const updated = await registrarPerdaLead(id, lossMotivo || undefined, lossObs || undefined);
      setLead((l) => ({ ...l, ...updated }));
      setShowLoss(false);
      setLossMotivo('');
      setLossObs('');
      avisar.sucesso('Perda registrada.');
    } catch (err) {
      avisar.erro(err.message || 'Erro ao registrar perda');
    }
  }

  /*
    Ação DESTRUTIVA (o lead arquivado sai da listagem de leads — o serviço
    filtra por `archived_at: null`). Confirmação em vermelho suave, com a
    irreversibilidade declarada no texto, e o alvo fixado antes do `await`.
  */
  async function handleArquivar() {
    const alvo = lead;
    const { ok } = await confirmar({
      titulo: 'Arquivar lead',
      mensagem: `Arquivar o lead "${alvo.nome}"? Ele sai da listagem de leads e esta acao nao pode ser desfeita pela tela.`,
      rotuloConfirmar: 'Arquivar',
      destrutiva: true
    });
    if (!ok) return;
    try {
      await arquivarLead(id);
      navigate('/crm/leads');
    } catch (err) {
      avisar.erro(err.message || 'Erro ao arquivar lead');
    }
  }

  async function carregarCandidatosRedistribuicao() {
    try {
      setLoadingCandidates(true);
      const data = await listarCandidatosRedistribuicaoCrm();
      setRedistributionCandidates(Array.isArray(data) ? data : []);
    } catch (err) {
      avisar.erro(err.message || 'Erro ao carregar candidatos de redistribuicao');
    } finally {
      setLoadingCandidates(false);
    }
  }

  async function abrirRedistribuicao() {
    setRedistributionForm({ assigned_user_id: '', motivo: '' });
    setShowRedistribute(true);
    if (redistributionCandidates.length === 0) {
      await carregarCandidatosRedistribuicao();
    }
  }

  async function handleRedistribuirLead() {
    try {
      setSavingRedistribution(true);
      const updated = await redistribuirLeadCrm(id, {
        assigned_user_id: redistributionForm.assigned_user_id || undefined,
        motivo: redistributionForm.motivo || undefined
      });
      setLead(updated);
      setShowRedistribute(false);
      setRedistributionForm({ assigned_user_id: '', motivo: '' });

      const interRes = await listarInteracoes(id);
      setInteractions(Array.isArray(interRes?.interactions) ? interRes.interactions : []);
      avisar.sucesso('Lead redistribuido.');
    } catch (err) {
      avisar.erro(err.message || 'Erro ao redistribuir lead');
    } finally {
      setSavingRedistribution(false);
    }
  }

  if (loading) {
    return (
      <Pagina>
        <PageHeader titulo="Lead" voltar={{ to: '/crm/leads', title: 'Voltar para leads' }} />
        <BlocoConteudo>
          <p className="app-note">Carregando...</p>
        </BlocoConteudo>
      </Pagina>
    );
  }

  if (!lead) {
    return (
      <Pagina>
        <PageHeader titulo="Lead" voltar={{ to: '/crm/leads', title: 'Voltar para leads' }} />
        <Avisos avisos={avisos} aoFechar={fechar} />
        <BlocoConteudo>
          <p className="app-note">Lead não encontrado.</p>
        </BlocoConteudo>
      </Pagina>
    );
  }

  const lifecycle = LIFECYCLE_MAP[lead.lifecycle_status] || { label: lead.lifecycle_status, kind: 'neutral' };
  const temp = TEMP_MAP[lead.temperatura] || {};
  const podeRedistribuir = canRedistributeCrmLeads(user) && lead.lifecycle_status !== 'ARQUIVADO';

  const stagesFlat = pipelines.flatMap((p) => (p.etapas || []).map((e) => ({ ...e, pipelineNome: p.nome })));
  const candidatosDisponiveis = redistributionCandidates.filter((item) => Number(item.id) !== Number(lead.assigned_user_id));

  const campoTexto = (chave, extra = {}) => (
    <input
      className="input w-full"
      value={form[chave] ?? ''}
      onChange={(e) => setForm((f) => ({ ...f, [chave]: e.target.value }))}
      {...extra}
    />
  );

  return (
    <Pagina>
      {/*
        C3/C4 (R11 revisto): tela de REGISTRO tem a seta de voltar à
        esquerda SEMPRE, e o cabeçalho identifica o registro pelo NOME.
        C5: um primário sólido (Editar/Salvar), secundárias em contorno,
        destrutiva (Arquivar) apartada e a rara (Redistribuir) no "⋯".
      */}
      {/*
        B3: o empreendimento de interesse NÃO vira apoio da faixa — ele já
        aparece como campo rotulado no bloco de dados, e a mesma informação
        duas vezes na tela é reprovação.
      */}
      <PageHeader
        titulo={lead.nome}
        /* C2: a faixa carrega o apoio que identifica O REGISTRO — quem rola a
           página e perde o corpo de vista continua sabendo de qual lead se
           trata e em que ponto do ciclo ele está. */
        contagem={lifecycle.label}
        descricao={[lead.empresa, lead.origem && `Origem: ${lead.origem}`]
          .filter(Boolean).join(' · ') || 'Lead sem empresa e sem origem registradas.'}
        voltar={{ to: '/crm/leads', title: 'Voltar para leads' }}
        acaoPrincipal={editando
          ? {
            rotulo: saving ? 'Salvando...' : 'Salvar',
            onClick: salvarEdicao,
            desabilitada: saving
          }
          : { rotulo: 'Editar', onClick: iniciarEdicao }}
        /* "Redistribuir lead" vinha do "⋯", que saiu do sistema (07/09):
           é ação sobre este lead e agora é botão visível, na mesma fila das
           outras secundárias. Cinco botões na faixa a 1920, medidos numa
           linha só. */
        secundarias={editando
          ? [{ rotulo: 'Cancelar', onClick: () => setEditando(false) }]
          : [
            lead.lifecycle_status !== 'CONVERTIDO'
              ? { rotulo: 'Marcar convertido', onClick: handleConversao }
              : null,
            !['PERDIDO', 'ARQUIVADO'].includes(lead.lifecycle_status)
              ? { rotulo: 'Registrar perda', onClick: () => setShowLoss(true) }
              : null,
            podeRedistribuir
              ? { rotulo: 'Redistribuir lead', onClick: abrirRedistribuicao }
              : null
          ].filter(Boolean)}
        destrutiva={!editando && lead.lifecycle_status !== 'ARQUIVADO'
          ? { rotulo: 'Arquivar', onClick: handleArquivar }
          : undefined}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        A pergunta central da tela: "em que ponto está este lead e o que
        fazer com ele?". Status, temperatura, etapa e o próximo follow-up
        são os quatro dados que decidem — vinham espalhados entre a faixa do
        cabeçalho (status/temperatura/etapa) e o fundo do bloco de dados
        (follow-up). Cada um continua aparecendo UMA vez (B3).
      */}
      <StatGrid colunas={4}>
        <StatTile label="Status" valor={<StatusBadge status={lifecycle.label} kind={lifecycle.kind} />} />
        <StatTile
          label="Temperatura"
          valor={temp.label ? `${temp.emoji} ${temp.label}` : null}
          vazio={!temp.label}
        />
        <StatTile
          label="Etapa do funil"
          valor={lead.etapa ? <EtapaDoLead etapa={lead.etapa} /> : null}
          vazio={!lead.etapa}
        />
        <StatTile
          label="Próximo follow-up"
          valor={fmtDataOuNulo(lead.proximo_followup_at)}
          vazio={!lead.proximo_followup_at}
        />
      </StatGrid>

      <BlocoConteudo
        titulo="Dados do lead"
        variante="primario"
        cor="var(--c-primary)"
      >
        {editando ? (
          <FormSecao legenda="Identificação e interesse" colunas={2}>
            <CampoForm label="Nome" obrigatorio span={2}>
              {campoTexto('nome', { required: true })}
            </CampoForm>
            <CampoForm label="Telefone">{campoTexto('telefone')}</CampoForm>
            <CampoForm label="E-mail">{campoTexto('email', { type: 'email' })}</CampoForm>
            <CampoForm label="CPF / CNPJ">
              <input
                className="input w-full"
                value={form.documento ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, documento: maskCpfCnpj(e.target.value) }))}
              />
            </CampoForm>
            <CampoForm label="Cidade">{campoTexto('cidade')}</CampoForm>
            <CampoForm label="Estado">{campoTexto('estado', { maxLength: 2 })}</CampoForm>
            <CampoForm label="Empreendimento de interesse">{campoTexto('empreendimento_interesse')}</CampoForm>
            <CampoForm label="Produto de interesse">{campoTexto('produto_interesse')}</CampoForm>
            <CampoForm label="Faixa de valor">{campoTexto('faixa_valor')}</CampoForm>
            {/* R12: select de FORMULÁRIO (entrada de dado do registro) — legítimo. */}
            <CampoForm label="Temperatura">
              <select
                className="input w-full"
                value={form.temperatura}
                onChange={(e) => setForm((f) => ({ ...f, temperatura: e.target.value }))}
              >
                <option value="FRIO">Frio</option>
                <option value="MORNO">Morno</option>
                <option value="QUENTE">Quente</option>
              </select>
            </CampoForm>
            <CampoForm label="Score (0-100)">
              <input
                className="input w-full"
                type="number"
                min={0}
                max={100}
                value={form.score}
                onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))}
              />
            </CampoForm>
            <CampoForm label="Próximo follow-up">
              <DateInputBR
                className="input w-full"
                value={form.proximo_followup_at || ''}
                onChange={(e) => setForm((f) => ({ ...f, proximo_followup_at: e.target.value }))}
              />
            </CampoForm>
            <CampoForm label="Observações" tipo="texto-longo" span={2}>
              <textarea
                className="input w-full"
                rows={3}
                value={form.observacoes ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
              />
            </CampoForm>
          </FormSecao>
        ) : (
          /*
            B4 — campo vazio some com contador; a contagem sai da própria
            lista abaixo (nada espelhado à mão).
            B3 — "Nome" não repete aqui: já é o título da página, como no
            molde do detalhe financeiro (o código saiu do bloco pelo mesmo
            motivo). O dado continua no sistema e no formulário de edição.
          */
          <CamposComVazios
            colunas={4}
            campos={[
              { label: 'Telefone', valor: lead.telefone },
              { label: 'E-mail', valor: lead.email },
              { label: 'Documento', valor: lead.documento },
              { label: 'Cidade / Estado', valor: [lead.cidade, lead.estado].filter(Boolean).join(' / ') },
              { label: 'Empreendimento de interesse', valor: lead.empreendimento_interesse, span: 2 },
              { label: 'Produto de interesse', valor: lead.produto_interesse, span: 2 },
              { label: 'Faixa de valor', valor: lead.faixa_valor },
              { label: 'Score', valor: Number(lead.score) > 0 ? String(lead.score) : null },
              { label: 'Observações', valor: lead.observacoes, span: 4 }
            ]}
          />
        )}
      </BlocoConteudo>

      {/*
        Seletor de CONTEXTO/entrada de dado (R12): muda o registro, não
        filtra lista — select segue legítimo. A etapa aparece como
        REFERÊNCIA no ladrilho do topo e como CAMPO EDITÁVEL aqui: mesma
        informação com papéis diferentes, que a B3 declara não ser
        duplicação.
      */}
      <BlocoConteudo titulo="Etapa do funil" variante="secundario">
        <label className="form-group">
          <span className="form-label">Mover para a etapa</span>
          <select
            className="input w-full"
            value={lead.pipeline_stage_id || ''}
            onChange={(e) => handleChangeStage(e.target.value)}
            disabled={lead.lifecycle_status === 'ARQUIVADO'}
          >
            <option value="">— Sem etapa —</option>
            {stagesFlat.map((s) => (
              <option key={s.id} value={s.id}>
                {pipelines.length > 1 ? `${s.pipelineNome} › ` : ''}{s.nome}
              </option>
            ))}
          </select>
        </label>
      </BlocoConteudo>

      <BlocoConteudo titulo="Origem" variante="secundario">
        <CamposComVazios
          colunas={4}
          campos={[
            { label: 'Tipo', valor: lead.source_type?.replace('_', ' ') },
            { label: 'Campanha', valor: lead.campaign_name || lead.source_name },
            { label: 'Adset', valor: lead.adset_name },
            { label: 'UTM Source', valor: lead.utm_source },
            { label: 'UTM Medium', valor: lead.utm_medium },
            { label: 'UTM Campaign', valor: lead.utm_campaign }
          ]}
        />
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Interações"
        contagem={`${interactions.length} registro(s)`}
        acoes={(
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setShowAddInteraction((v) => !v)}
          >
            {showAddInteraction ? 'Cancelar' : 'Registrar interacao'}
          </button>
        )}
      >
        {showAddInteraction && (
          <form onSubmit={handleAddInteraction} className="mb-4">
            <FormSecao legenda="Nova interação" colunas={2}>
              <CampoForm label="Tipo">
                <select
                  className="input w-full"
                  value={interactionForm.interaction_type}
                  onChange={(e) => setInteractionForm((f) => ({ ...f, interaction_type: e.target.value }))}
                >
                  {Object.entries(TIPO_INTERACAO_LABEL).map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>{rotulo}</option>
                  ))}
                </select>
              </CampoForm>
              <CampoForm label="Título (opcional)">
                <input
                  className="input w-full"
                  placeholder="Resumo..."
                  value={interactionForm.title}
                  onChange={(e) => setInteractionForm((f) => ({ ...f, title: e.target.value }))}
                />
              </CampoForm>
              <CampoForm label="Descrição" tipo="texto-longo" span={2}>
                <textarea
                  className="input w-full"
                  rows={3}
                  placeholder="Detalhes da interação..."
                  value={interactionForm.content}
                  onChange={(e) => setInteractionForm((f) => ({ ...f, content: e.target.value }))}
                />
              </CampoForm>
            </FormSecao>
            <div className="app-actionbar">
              <button type="submit" className="btn btn-primary" disabled={savingInteraction}>
                {savingInteraction ? 'Salvando...' : 'Salvar interacao'}
              </button>
            </div>
          </form>
        )}

        {interactions.length === 0 ? (
          <p className="app-note">Nenhuma interação registrada.</p>
        ) : (
          <div className="space-y-3">
            {interactions.map((it) => (
              <div key={it.id} className="flex items-start gap-3 text-sm border-b border-base pb-3 last:border-0">
                <span className="flex-shrink-0" aria-hidden="true">
                  {TIPO_INTERACAO_EMOJI[it.interaction_type] || TIPO_INTERACAO_EMOJI.NOTE}
                </span>
                <div className="flex-1">
                  <p className="font-medium text-main">
                    {it.title || TIPO_INTERACAO_LABEL[it.interaction_type] || it.interaction_type}
                  </p>
                  {it.content && <p className="text-sub mt-1">{it.content}</p>}
                  <p className="text-xs text-muted mt-1">
                    {fmt(it.createdAt)}
                    {it.usuario ? ` — ${it.usuario.nome}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Tarefas"
        contagem={`${tasks.length} tarefa(s)`}
        acoes={(
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setShowAddTask((v) => !v)}
          >
            {showAddTask ? 'Cancelar' : 'Nova tarefa'}
          </button>
        )}
      >
        {showAddTask && (
          <form onSubmit={handleAddTask} className="mb-4">
            <FormSecao legenda="Nova tarefa" colunas={2}>
              <CampoForm label="Título" obrigatorio span={2}>
                <input
                  className="input w-full"
                  required
                  placeholder="Ex: Ligar para o cliente"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))}
                />
              </CampoForm>
              <CampoForm label="Tipo">
                <select
                  className="input w-full"
                  value={taskForm.task_type}
                  onChange={(e) => setTaskForm((f) => ({ ...f, task_type: e.target.value }))}
                >
                  {Object.entries(TIPO_TAREFA_LABEL).map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>{rotulo}</option>
                  ))}
                </select>
              </CampoForm>
              <CampoForm label="Prioridade">
                <select
                  className="input w-full"
                  value={taskForm.priority}
                  onChange={(e) => setTaskForm((f) => ({ ...f, priority: e.target.value }))}
                >
                  <option value="HIGH">Alta</option>
                  <option value="MEDIUM">Media</option>
                  <option value="LOW">Baixa</option>
                </select>
              </CampoForm>
              <CampoForm label="Prazo">
                <input
                  className="input w-full"
                  type="datetime-local"
                  value={taskForm.due_at}
                  onChange={(e) => setTaskForm((f) => ({ ...f, due_at: e.target.value }))}
                />
              </CampoForm>
            </FormSecao>
            <div className="app-actionbar">
              <button type="submit" className="btn btn-primary" disabled={savingTask}>
                {savingTask ? 'Criando...' : 'Criar tarefa'}
              </button>
            </div>
          </form>
        )}

        {/*
          R17: tabela sem coluna de identidade DECLARA a ausência
          (`semIdentidade`). O título da tarefa é uma frase escrita pelo
          usuário ("Ligar para o cliente") — exibi-la em maiúsculas, como a
          coluna de identidade exige, deformaria o dado.
        */}
        <TabelaPadrao
          semIdentidade
          colunas={[
            {
              id: 'titulo',
              titulo: 'Tarefa',
              tipo: 'texto',
              noCard: 'titulo',
              render: (task) => (
                <span className={task.status === 'DONE' ? 'line-through text-muted' : 'text-main'}>
                  {task.title}
                </span>
              )
            },
            {
              id: 'tipo',
              titulo: 'Tipo',
              tipo: 'texto',
              render: (task) => TIPO_TAREFA_LABEL[task.task_type] || task.task_type
            },
            {
              id: 'prazo',
              titulo: 'Prazo',
              tipo: 'data',
              render: (task) => (task.due_at ? fmt(task.due_at) : '—')
            },
            {
              id: 'prioridade',
              titulo: 'Prioridade',
              tipo: 'badge',
              render: (task) => {
                const p = PRIORIDADE_TAREFA[task.priority];
                return p ? <StatusBadge status={p.label} kind={p.kind} /> : (task.priority || '—');
              }
            },
            {
              id: 'status',
              titulo: 'Status',
              tipo: 'status',
              render: (task) => {
                const s = STATUS_TAREFA[task.status] || { label: task.status, kind: 'neutral' };
                return <StatusBadge status={s.label} kind={s.kind} />;
              }
            }
          ]}
          itens={tasks}
          getId={(task) => task.id}
          storageKey="tabela:crm-lead-tarefas"
          rotuloRolagem="Tarefas do lead"
          vazio="Nenhuma tarefa criada."
          larguraAcoes={220}
          urgencia={(task) => (
            task.status === 'PENDING' && task.due_at && new Date(task.due_at) < new Date()
              ? 'danger'
              : null
          )}
          acoesLinha={(task) => (task.status === 'PENDING' ? (
            <>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => handleCompleteTask(task.id)}
              >
                Concluir
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm btn-perigo-suave"
                onClick={() => handleCancelTask(task)}
              >
                Cancelar
              </button>
            </>
          ) : null)}
        />
      </BlocoConteudo>

      <BlocoConteudo titulo="Informações do registro" variante="secundario">
        <CamposComVazios
          colunas={4}
          campos={[
            { label: 'Responsável', valor: lead.responsavel?.nome },
            { label: 'Criado por', valor: lead.criadoPor?.nome },
            { label: 'Cadastrado em', valor: fmtOuNulo(lead.createdAt) },
            { label: 'Primeiro contato', valor: fmtOuNulo(lead.primeiro_contato_at) },
            { label: 'Última interação', valor: fmtOuNulo(lead.ultima_interacao_at) },
            {
              label: 'Convertido em',
              contexto: lead.lifecycle_status === 'CONVERTIDO',
              valor: fmtOuNulo(lead.convertido_at)
            },
            {
              label: 'Motivo de perda',
              contexto: lead.lifecycle_status === 'PERDIDO',
              valor: lead.motivoPerda?.nome
            },
            {
              label: 'Obs. perda',
              contexto: lead.lifecycle_status === 'PERDIDO',
              valor: lead.motivo_perda_obs,
              span: 2
            }
          ]}
        />
      </BlocoConteudo>

      {/* Histórico: raro/auditoria — nasce recolhido, mas o título fica à vista. */}
      {Array.isArray(lead.auditLogs) && lead.auditLogs.length > 0 && (
        <BlocoConteudo
          titulo="Histórico do sistema"
          contagem={`${lead.auditLogs.length} evento(s)`}
          variante="secundario"
          recolhivel
          recolhidoPadrao
        >
          <div className="space-y-2">
            {lead.auditLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 text-sm border-b border-base pb-2 last:border-0">
                <span className="text-xs text-muted whitespace-nowrap">{fmt(log.createdAt)}</span>
                <div>
                  <span className="font-medium text-sub">{log.event_type.replace(/_/g, ' ')}</span>
                  {log.field_changed && (
                    <span className="text-muted ml-1">
                      — {log.field_changed}: {log.old_value || '—'} → {log.new_value || '—'}
                    </span>
                  )}
                  {log.usuario && (
                    <span className="text-xs text-muted ml-1">por {log.usuario.nome}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </BlocoConteudo>
      )}

      {/*
        R9 — modal, e aqui está certo: registrar perda e redistribuir
        INTERROMPEM o trabalho principal da tela (ler e trabalhar o lead) e
        devolvem a pessoa ao mesmo lugar. Não é a tela que existe para isso.
        R27 fica com o componente: o OverlayModal dá corpo rolante e mantém
        o botão de confirmar sempre visível.
      */}
      {showLoss && (
        <OverlayModal
          rotulo="Registrar perda"
          largura="var(--modal-max-w-sm)"
          onFechar={() => setShowLoss(false)}
        >
          <div className="p-6 space-y-4">
            <h2 className="app-bloco-titulo">Registrar perda</h2>
            <FormSecao colunas={2}>
              <CampoForm label="Motivo" linha>
                <select className="input w-full" value={lossMotivo} onChange={(e) => setLossMotivo(e.target.value)}>
                  <option value="">Selecione o motivo</option>
                  {motivosPerda.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </CampoForm>
              <CampoForm label="Observações" tipo="texto-longo" linha>
                <textarea
                  className="input w-full"
                  rows={3}
                  value={lossObs}
                  onChange={(e) => setLossObs(e.target.value)}
                  placeholder="Detalhes da perda..."
                />
              </CampoForm>
            </FormSecao>
            <div className="app-actionbar" data-modal="rodape">
              <button type="button" className="btn btn-outline" onClick={() => setShowLoss(false)}>
                Cancelar
              </button>
              {/* Ação de desfecho negativo: vermelho suave, nunca cor à mão. */}
              <button type="button" className="btn btn-outline btn-perigo-suave" onClick={handlePerda}>
                Confirmar perda
              </button>
            </div>
          </div>
        </OverlayModal>
      )}

      {showRedistribute && (
        <OverlayModal
          rotulo="Redistribuir lead"
          largura="var(--modal-max-w-md)"
          onFechar={() => (savingRedistribution ? undefined : setShowRedistribute(false))}
        >
          <div className="p-6 space-y-4">
            <div>
              <h2 className="app-bloco-titulo">Redistribuir lead</h2>
              <p className="app-note">
                Escolha um responsável ou deixe automático para enviar ao usuário elegível com menor backlog.
              </p>
            </div>

            <FormSecao colunas={2}>
              <CampoForm label="Novo responsável" linha>
                <select
                  className="input w-full"
                  value={redistributionForm.assigned_user_id}
                  onChange={(e) => setRedistributionForm((f) => ({ ...f, assigned_user_id: e.target.value }))}
                  disabled={loadingCandidates}
                >
                  <option value="">
                    {loadingCandidates ? 'Carregando candidatos...' : 'Automatico pelo menor backlog'}
                  </option>
                  {candidatosDisponiveis.map((usuario) => (
                    <option key={usuario.id} value={usuario.id}>
                      {usuario.nome} - {usuario.perfil} - {usuario.backlog_aberto || 0} lead(s) aberto(s)
                    </option>
                  ))}
                </select>
              </CampoForm>
              <CampoForm
                label="Motivo da redistribuicao"
                tipo="texto-longo"
                linha
                hint={`Responsavel atual: ${lead.responsavel?.nome || 'sem responsavel'}`}
              >
                <textarea
                  className="input w-full"
                  rows={3}
                  value={redistributionForm.motivo}
                  onChange={(e) => setRedistributionForm((f) => ({ ...f, motivo: e.target.value }))}
                  placeholder="Ex: SLA vencido, ausencia do responsável, ajuste manual de carteira..."
                />
              </CampoForm>
            </FormSecao>

            <div className="app-actionbar" data-modal="rodape">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setShowRedistribute(false)}
                disabled={savingRedistribution}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleRedistribuirLead}
                disabled={savingRedistribution || loadingCandidates}
              >
                {savingRedistribution ? 'Redistribuindo...' : 'Confirmar redistribuicao'}
              </button>
            </div>
          </div>
        </OverlayModal>
      )}

      {elementoConfirmacao}
    </Pagina>
  );
}
