import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  listarPipelines,
  obterKanban,
  alterarEtapaLead,
  criarEtapaPipelineCrm,
  atualizarEtapaPipelineCrm
} from '../../../services/crm';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  FormSecao,
  CampoForm,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../../../components/padrao';
import OverlayModal from '../../../components/ui/OverlayModal';
import StatusBadge from '../../../components/StatusBadge';

/*
  QUADRO, NÃO TABELA (rodada CRM).

  Esta tela é um quadro de colunas com arrastar-e-soltar: forçar
  `TabelaPadrao` aqui destruiria justamente a estrutura que a tela é. O que
  o padrão dá é a MOLDURA — `Pagina` (ritmo vertical), `PageHeader` (faixa
  fixa da R13) e `BlocoConteudo` (a superfície) — mais token no lugar de cor
  à mão (R25), o utilitário `.tarja--*` no lugar da barra de 4px recriada, e
  medidas da escala (R10) no lugar de px.

  R18: o quadro rola na horizontal com `overflow-x-auto` — a forma CORRETA
  (só `hidden` sequestra o sticky e mataria a faixa fixa do cabeçalho).
*/

/*
  R25 — a temperatura era pintada com paleta crua (blue/amber/red-50), que
  não tem par no tema escuro nem passa pelo piso de contraste do
  ThemeContext. Vira família semântica: a etiqueta usa o StatusBadge e o
  cartão ganha a tarja lateral de 4px do sistema (`.tarja--*`), que já
  existia como utilitário.
*/
const TEMP_MAP = {
  FRIO: { label: 'Frio', familia: 'info', tarja: 'tarja--info' },
  MORNO: { label: 'Morno', familia: 'warning', tarja: 'tarja--warning' },
  QUENTE: { label: 'Quente', familia: 'danger', tarja: 'tarja--danger' }
};

/*
  A cor da etapa é DADO do registro (gravada no banco e escolhida num
  `<input type="color">`), não cor de tela: por isso ela continua sendo um
  hexadecimal aqui e no `style` do marcador. Trocar por token gravaria a
  STRING DO TOKEN no banco. Precisa de `excecoes_cor` no manifesto quando
  esta tela entrar nele — está no relatório.
*/
const EMPTY_STAGE_FORM = {
  nome: '',
  cor: '#1d4ed8',
  sla_minutes: '',
  requires_followup: false,
  requires_loss_reason: false
};

function formatDate(val) {
  if (!val) return null;
  return new Date(val).toLocaleDateString('pt-BR');
}

function LeadCard({ lead, onOpenActions, onDragStart }) {
  const temp = TEMP_MAP[lead.temperatura] || TEMP_MAP.FRIO;

  return (
    <div
      className={`tarja ${temp.tarja} rounded-xl border border-base bg-card p-3 text-sm transition-colors hover:border-subtle cursor-grab active:cursor-grabbing`}
      draggable
      onDragStart={(event) => onDragStart(event, lead)}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/crm/leads/${lead.id}`}
          className="font-medium leading-tight text-[var(--c-primary)] hover:underline"
        >
          {lead.nome}
        </Link>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpenActions(lead);
          }}
        >
          Ações
        </button>
      </div>

      {lead.empreendimento_interesse && (
        <p className="mt-2 truncate text-xs text-muted">{lead.empreendimento_interesse}</p>
      )}

      {lead.telefone && (
        <p className="mt-1 text-xs text-sub">{lead.telefone}</p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="truncate text-xs text-muted">{lead.responsavel?.nome || 'Sem responsavel'}</span>
        <StatusBadge status={temp.label} kind={temp.familia} />
      </div>

      {lead.proximo_followup_at && (
        <p className="mt-2 text-xs text-[var(--sem-warning)]">
          Follow-up: {formatDate(lead.proximo_followup_at)}
        </p>
      )}
    </div>
  );
}

/*
  R9 — as duas caixas desta tela são MODAL por direito: a tela existe para
  trabalhar o funil (arrastar leads entre etapas), e tanto configurar uma
  etapa quanto agir sobre um lead INTERROMPEM esse trabalho e devolvem a
  pessoa ao quadro. Tirando os dois formulários ainda sobra a tela inteira.
  R27: o corpo rola; cabeçalho e rodapé marcados ficam fixos.
*/
function StageModal({ mode, form, saving, onChange, onClose, onSubmit }) {
  const title = mode === 'create' ? 'Nova etapa do Kanban' : 'Editar etapa do Kanban';

  return (
    <OverlayModal aberto rotulo={title} onFechar={onClose}>
      <div data-modal="cabecalho" className="app-bloco-head">
        <h2 className="app-bloco-titulo">{title}</h2>
        <span className="app-bloco-acoes">
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Fechar</button>
        </span>
      </div>

      <form id="form-etapa-kanban" className="p-4" onSubmit={onSubmit}>
        <p className="text-sm text-muted">Organize as etapas exibidas no funil comercial.</p>
        <FormSecao colunas={2}>
          <CampoForm label="Nome da etapa" obrigatorio span={2}>
            <input
              className="input"
              value={form.nome}
              onChange={(event) => onChange({ ...form, nome: event.target.value })}
              placeholder="Ex: Em negociação"
              required
            />
          </CampoForm>

          <CampoForm label="Cor" hint="Cor do marcador da etapa no quadro">
            <input
              className="input"
              type="color"
              value={form.cor}
              onChange={(event) => onChange({ ...form, cor: event.target.value })}
            />
          </CampoForm>

          <CampoForm label="SLA em minutos" hint="Opcional">
            <input
              className="input"
              type="number"
              min="0"
              value={form.sla_minutes}
              onChange={(event) => onChange({ ...form, sla_minutes: event.target.value })}
              placeholder="Opcional"
            />
          </CampoForm>

          <CampoForm
            label="Exigir follow-up"
            hint="Use quando esta etapa precisar de proximo contato agendado."
          >
            <label className="flex items-center gap-2 text-sm text-main">
              <input
                type="checkbox"
                checked={form.requires_followup}
                onChange={(event) => onChange({ ...form, requires_followup: event.target.checked })}
              />
              Exigir follow-up nesta etapa
            </label>
          </CampoForm>

          <CampoForm
            label="Exigir motivo de perda"
            hint="Use para etapas que exigem justificativa comercial."
          >
            <label className="flex items-center gap-2 text-sm text-main">
              <input
                type="checkbox"
                checked={form.requires_loss_reason}
                onChange={(event) => onChange({ ...form, requires_loss_reason: event.target.checked })}
              />
              Exigir motivo de perda nesta etapa
            </label>
          </CampoForm>
        </FormSecao>
      </form>

      <div data-modal="rodape" className="app-actionbar p-4">
        <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
          Cancelar
        </button>
        <button type="submit" form="form-etapa-kanban" className="btn btn-primary" disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar etapa'}
        </button>
      </div>
    </OverlayModal>
  );
}

function LeadActionsModal({ lead, stages, moving, onClose, onView, onMove }) {
  if (!lead) return null;

  return (
    <OverlayModal aberto rotulo={`Ações do lead ${lead.nome}`} onFechar={onClose}>
      <div data-modal="cabecalho" className="app-bloco-head">
        <h2 className="app-bloco-titulo">{lead.nome}</h2>
        <span className="app-bloco-acoes">
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Fechar</button>
        </span>
      </div>

      <div className="p-4">
        <p className="text-sm text-muted">Ações rápidas do lead no Kanban.</p>

        <div className="mt-3 flex flex-col gap-3">
          <button type="button" className="btn btn-primary" onClick={onView}>
            Abrir detalhes do lead
          </button>

          <div className="rounded-xl border border-base p-3">
            <p className="mb-2 text-sm font-medium text-main">Mover para etapa</p>
            <div className="flex flex-col gap-2">
              {stages.map((stage) => {
                const isCurrent = Number(stage.id) === Number(lead.pipeline_stage_id);
                return (
                  <button
                    key={stage.id}
                    type="button"
                    className="btn btn-outline justify-start"
                    disabled={isCurrent || moving}
                    title={isCurrent ? 'O lead ja esta nesta etapa' : `Mover para ${stage.nome}`}
                    onClick={() => onMove(stage)}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: stage.cor }}
                        aria-hidden="true"
                      />
                      {stage.nome}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </OverlayModal>
  );
}

export default function CrmKanban() {
  const navigate = useNavigate();
  const [pipelines, setPipelines] = useState([]);
  const [pipelineId, setPipelineId] = useState(null);
  const [kanban, setKanban] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingStage, setSavingStage] = useState(false);
  const [movingLead, setMovingLead] = useState(false);
  const [draggedLead, setDraggedLead] = useState(null);
  const [dropStageId, setDropStageId] = useState(null);
  const [stageModal, setStageModal] = useState(null);
  const [stageForm, setStageForm] = useState(EMPTY_STAGE_FORM);
  const [leadActions, setLeadActions] = useState(null);
  // R19/R3: as quatro chamadas de alert() do navegador viram a faixa de
  // aviso do sistema (tom semântico, dentro da página, fechável).
  const { avisos, avisar, fechar } = useAvisos();
  // R21: `confirmar()` devolve OBJETO — o uso abaixo DESESTRUTURA.
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  useEffect(() => {
    carregarPipelines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pipelineId) return;
    carregarKanban();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineId]);

  async function carregarPipelines() {
    try {
      const data = await listarPipelines();
      const list = Array.isArray(data) ? data : [];
      setPipelines(list);
      const selectedStillExists = list.some((pipeline) => Number(pipeline.id) === Number(pipelineId));
      if (!pipelineId || !selectedStillExists) {
        const def = list.find((p) => p.is_default) || list[0];
        if (def) setPipelineId(def.id);
      }
    } catch (err) {
      console.error(err);
      avisar.erro(err.message || 'Erro ao listar pipelines');
    }
  }

  async function carregarKanban() {
    try {
      setLoading(true);
      const data = await obterKanban(pipelineId);
      setKanban(data);
    } catch (err) {
      console.error(err);
      avisar.erro(err.message || 'Erro ao carregar kanban');
    } finally {
      setLoading(false);
    }
  }

  function abrirNovaEtapa() {
    setStageForm(EMPTY_STAGE_FORM);
    setStageModal({ mode: 'create' });
  }

  function abrirEdicaoEtapa(etapa) {
    setStageForm({
      nome: etapa.nome || '',
      cor: etapa.cor || EMPTY_STAGE_FORM.cor,
      sla_minutes: etapa.sla_minutes ?? '',
      requires_followup: Boolean(etapa.requires_followup),
      requires_loss_reason: Boolean(etapa.requires_loss_reason)
    });
    setStageModal({ mode: 'edit', etapa });
  }

  async function salvarEtapa(event) {
    event.preventDefault();
    // R26: o modo e a etapa alvo são fixados ANTES do await — o quadro
    // continua clicável enquanto o POST/PATCH está no ar.
    const pedido = stageModal;
    const payload = {
      ...stageForm,
      sla_minutes: stageForm.sla_minutes === '' ? null : Number(stageForm.sla_minutes)
    };
    try {
      setSavingStage(true);

      if (pedido?.mode === 'edit') {
        await atualizarEtapaPipelineCrm(pedido.etapa.id, payload);
      } else {
        await criarEtapaPipelineCrm(pipelineId, payload);
      }

      setStageModal(null);
      avisar.sucesso(pedido?.mode === 'edit' ? 'Etapa atualizada.' : 'Etapa criada.');
      await carregarPipelines();
      await carregarKanban();
    } catch (err) {
      console.error(err);
      avisar.erro(err.message || 'Erro ao salvar etapa');
    } finally {
      setSavingStage(false);
    }
  }

  function onDragStart(event, lead) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(lead.id));
    setDraggedLead(lead);
  }

  /*
    CONSENTIMENTO (R21 + R26) — mover o lead troca a etapa do funil, dispara
    o SLA da etapa nova e é o registro que a equipe comercial lê depois.

    O alvo (lead E etapa) é fixado em `const` ANTES do `await confirmar`: o
    modal do sistema NÃO congela a página, e este é um QUADRO que recarrega
    inteiro a cada operação — ler `draggedLead`/`leadActions` DEPOIS da
    confirmação faria a tela perguntar sobre um lead e mover outro, com a
    trilha registrando um consentimento válido para a ação errada.
  */
  async function moverLeadParaEtapa(lead, etapa) {
    const alvoLead = lead;
    const alvoEtapa = etapa;
    if (!alvoLead?.id || !alvoEtapa?.id) return;

    /*
      SEM CONFIRMAÇÃO AQUI, DE PROPÓSITO (05/09).

      Arrastar é o gesto PRINCIPAL do quadro e é reversível pelo gesto
      inverso: errou a coluna, arrasta de volta. Confirmação existe para o
      que não se desfaz — pôr um modal a cada arrasto transformaria um gesto
      em três cliques e faria a pessoa clicar "Sim" no automático, que é o
      contrário de consentir.

      O que FICA é a outra metade da R26: o alvo fixado em `const` antes de
      qualquer `await`. Essa parte não era zelo, era conserto — o `onDrop`
      movia o lead do `dataTransfer` e conferia a etapa do `draggedLead`.
    */
    try {
      setMovingLead(true);
      await alterarEtapaLead(alvoLead.id, alvoEtapa.id);
      setLeadActions(null);
      avisar.sucesso(`${alvoLead.nome} movido para "${alvoEtapa.nome}".`);
      await carregarKanban();
    } catch (err) {
      console.error(err);
      avisar.erro(err.message || 'Erro ao mover lead');
    } finally {
      setMovingLead(false);
      setDraggedLead(null);
      setDropStageId(null);
    }
  }

  /*
    O arrastar-e-soltar é o mesmo de antes (dataTransfer com o id, realce da
    coluna alvo, nada acontece ao soltar na própria etapa). Uma diferença de
    SIGNIFICADO foi corrigida: a versão anterior movia o id vindo do
    `dataTransfer` mas comparava a etapa atual de `draggedLead` — se os dois
    divergissem, ela moveria um lead cuja etapa nunca foi conferida. Agora
    os dois têm de ser o MESMO lead.
  */
  async function onDropLead(event, etapa) {
    event.preventDefault();
    const alvoEtapa = etapa;
    const idArrastado = Number(event.dataTransfer.getData('text/plain') || draggedLead?.id);
    const alvoLead = draggedLead && Number(draggedLead.id) === idArrastado ? draggedLead : null;
    setDropStageId(null);
    if (!alvoLead) {
      setDraggedLead(null);
      return;
    }
    if (Number(alvoLead.pipeline_stage_id) === Number(alvoEtapa.id)) {
      setDraggedLead(null);
      return;
    }
    await moverLeadParaEtapa(alvoLead, alvoEtapa);
  }

  const colunas = kanban?.colunas || [];
  const etapas = colunas.map((coluna) => coluna.etapa);
  const totalLeads = colunas.reduce((s, c) => s + (c.leads?.length || 0), 0);

  return (
    <Pagina>
      <PageHeader
        titulo="Kanban CRM"
        contagem={`${totalLeads} lead${totalLeads !== 1 ? 's' : ''} no funil`}
        descricao={kanban?.pipeline ? kanban.pipeline.nome : 'Funil comercial'}
        acaoPrincipal={{ rotulo: '+ Novo Lead', to: '/crm/leads/novo' }}
        /* "Lista" saiu daqui (C6/R11): caminho para OUTRA tela não mora na
           faixa de ações — menu e Ctrl+K resolvem, e `crm-leads` já é destino
           do navigationConfig, então ninguém fica sem porta. Ação é o que age
           SOBRE esta tela. */
        secundarias={[
          { rotulo: 'Nova etapa', onClick: abrirNovaEtapa, desabilitada: !pipelineId }
        ]}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo
        variante="primario"
        cor="var(--sem-info)"
        titulo={kanban?.pipeline?.nome || 'Funil'}
        contagem={`${colunas.length} etapa${colunas.length !== 1 ? 's' : ''}`}
        descricao="Arraste o cartão para mudar a etapa do lead; a mudança pede confirmação."
        acoes={pipelines.length > 1 ? (
          /*
            R12 — este `select` NÃO é filtro: é o seletor de CONTEXTO do
            quadro (qual funil está aberto), e a etapa nova nasce dentro do
            funil escolhido. A própria R12 declara o seletor de contexto
            legítimo; o que ela proíbe é recortar lista com lista suspensa.
          */
          <label className="flex items-center gap-2 text-sm text-muted">
            <span>Funil</span>
            <select
              className="input"
              aria-label="Funil exibido no quadro"
              value={pipelineId || ''}
              onChange={(e) => setPipelineId(Number(e.target.value))}
            >
              {pipelines.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
        ) : null}
      >
        {loading ? (
          <p className="text-sm text-muted">Carregando...</p>
        ) : colunas.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma etapa configurada.</p>
        ) : (
          <div className="flex items-start gap-3 overflow-x-auto pb-3">
            {colunas.map(({ etapa, leads }) => {
              const isDropTarget = Number(dropStageId) === Number(etapa.id);
              return (
                <div
                  key={etapa.id}
                  className="app-painel-lateral flex shrink-0 flex-col rounded-xl border border-base bg-card"
                  style={isDropTarget ? { borderColor: 'var(--c-primary)' } : undefined}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDropStageId(etapa.id);
                  }}
                  onDragLeave={() => setDropStageId(null)}
                  onDrop={(event) => onDropLead(event, etapa)}
                >
                  <div className="flex items-start justify-between gap-2 border-b border-base p-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 shrink-0 rounded-full"
                        style={{ background: etapa.cor }}
                        aria-hidden="true"
                      />
                      <span className="truncate text-sm font-semibold text-main">{etapa.nome}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="badge badge-muted">{leads.length}</span>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => abrirEdicaoEtapa(etapa)}
                        title="Editar etapa"
                        aria-label={`Editar etapa ${etapa.nome}`}
                      >
                        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                          <path d="M4.5 14.9 5.1 12l7.7-7.7a1.5 1.5 0 0 1 2.1 0l.8.8a1.5 1.5 0 0 1 0 2.1L8 14.9l-2.9.6a.5.5 0 0 1-.6-.6Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="m11.8 5.3 2.9 2.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col gap-2 p-2">
                    {leads.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        onDragStart={onDragStart}
                        onOpenActions={setLeadActions}
                      />
                    ))}
                    {leads.length === 0 && (
                      <p className="rounded-xl border border-dashed border-base p-4 text-center text-xs text-muted">
                        Arraste um lead para este quadro.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </BlocoConteudo>

      {stageModal && (
        <StageModal
          mode={stageModal.mode}
          form={stageForm}
          saving={savingStage}
          onChange={setStageForm}
          onClose={() => setStageModal(null)}
          onSubmit={salvarEtapa}
        />
      )}

      <LeadActionsModal
        lead={leadActions}
        stages={etapas}
        moving={movingLead}
        onClose={() => setLeadActions(null)}
        onView={() => {
          const id = leadActions?.id;
          setLeadActions(null);
          if (id) navigate(`/crm/leads/${id}`);
        }}
        // R26: o lead é fixado AQUI, no clique, e viaja como argumento até a
        // ação — nada é relido do estado depois da confirmação.
        onMove={(stage) => {
          const alvoLead = leadActions;
          if (alvoLead) moverLeadParaEtapa(alvoLead, stage);
        }}
      />

      {elementoConfirmacao}
    </Pagina>
  );
}
