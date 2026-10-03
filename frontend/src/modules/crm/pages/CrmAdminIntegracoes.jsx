import { useEffect, useState } from 'react';
import {
  atualizarIntegracoesCrm,
  listarEventosGoogleCrm,
  listarEventosMetaCrm,
  obterIntegracoesCrm,
  reprocessarEventoGoogleCrm,
  reprocessarEventoMetaCrm
} from '../../../services/crm';
import { API_ORIGIN } from '../../../services/api';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  TabelaPadrao,
  CelulaDupla,
  FormSecao,
  CampoForm,
  Avisos,
  useAvisos
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';

const API_BASE_URL = API_ORIGIN || window.location.origin;

function fmtDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

/*
  R25 — a StatusPill desta tela era uma escada de paleta CRUA do Tailwind:
  emerald-100/emerald-700, blue-100/blue-700, red-100/red-700,
  amber-100/amber-700 e slate-100/slate-600. Paleta crua não tem par no
  tema escuro e não passa pelo piso de contraste do ThemeContext (R24).

  O mapa abaixo preserva as CINCO distinções que a escada fazia — e é
  explícito de propósito: a classificação automática do StatusBadge leria
  PROCESSED, PROCESSING, DUPLICATE e IGNORED todos como 'info'
  (só ERROR cairia certo), colapsando em uma cor quatro desfechos que
  significam coisas diferentes para quem depura um webhook.
*/
const FAMILIA_PROCESSAMENTO = {
  PROCESSED: 'success',
  PROCESSING: 'info',
  ERROR: 'danger',
  DUPLICATE: 'warning',
  IGNORED: 'neutral'
};

function StatusProcessamento({ status }) {
  if (!status) return <span className="text-muted">-</span>;
  return <StatusBadge status={status} kind={FAMILIA_PROCESSAMENTO[status] || 'info'} />;
}

function VinculosEvento({ event }) {
  const lead = event.processedLead;
  const conversation = event.processedConversation;
  const message = event.processedMessage;

  if (!lead && !conversation && !message) {
    return <span className="text-xs text-muted">Sem vínculo ainda</span>;
  }

  return (
    <div className="text-xs">
      {lead ? <div className="text-main">Lead #{lead.id} · {lead.nome || '-'}</div> : null}
      {conversation ? <div className="text-sub">Conversa #{conversation.id} · {conversation.channel_type} · {conversation.status}</div> : null}
      {message ? <div className="text-muted">Mensagem #{message.id} · {message.message_type}</div> : null}
    </div>
  );
}

/*
  R1/R17 — as colunas do log de eventos declaram o PAPEL (`tipo`); medida e
  alinhamento são do componente. As duas tabelas (Meta e Google) leem o
  MESMO formato de evento, então compartilham a declaração: dois markups
  para o mesmo dado é o defeito que a TabelaPadrao existe para fechar.
*/
const COLUNAS_EVENTO = [
  {
    id: 'evento',
    titulo: 'Evento',
    tipo: 'identidade',
    noCard: 'titulo',
    render: (event) => (
      <CelulaDupla
        principal={event.external_event_id || `#${event.id}`}
        sub={event.event_type || null}
      />
    )
  },
  {
    id: 'campanha',
    titulo: 'Campanha',
    tipo: 'texto',
    render: (event) => (
      <CelulaDupla
        principal={event.campaign_name || '-'}
        sub={event.adset_name || event.ad_group_name || event.asset_name || null}
      />
    )
  },
  {
    id: 'status',
    titulo: 'Status',
    tipo: 'status',
    render: (event) => <StatusProcessamento status={event.processing_status} />
  },
  {
    id: 'vinculos',
    titulo: 'Vínculos',
    tipo: 'texto',
    render: (event) => <VinculosEvento event={event} />
  },
  {
    id: 'recebido_em',
    titulo: 'Recebido em',
    tipo: 'data',
    render: (event) => fmtDate(event.received_at)
  },
  {
    id: 'erro',
    titulo: 'Erro',
    tipo: 'texto',
    // T6: o texto completo do erro vai no tooltip — truncar sem tooltip
    // esconderia justamente a informação que faz reprocessar valer a pena.
    render: (event) => (
      <span title={event.error_message || undefined}>{event.error_message || '-'}</span>
    )
  }
];

function EventosTabela({ titulo, descricao, events, loading, onReprocess, storageKey }) {
  return (
    <BlocoConteudo
      titulo={titulo}
      contagem={loading ? null : `${(events || []).length} evento(s)`}
      descricao={descricao}
      variante="secundario"
    >
      <TabelaPadrao
        colunas={COLUNAS_EVENTO}
        itens={events || []}
        getId={(event) => event.id}
        carregando={loading}
        vazio={{
          title: 'Nenhum evento registrado',
          message: 'Assim que o webhook receber o primeiro evento, ele aparece aqui com o resultado do processamento.'
        }}
        storageKey={storageKey}
        rotuloRolagem={titulo}
        colunasConfiguraveis
        acoesLinha={(event) => (event.processing_status === 'ERROR' ? (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => onReprocess(event.id)}>
            Reprocessar
          </button>
        ) : null)}
        larguraAcoes={180}
      />
    </BlocoConteudo>
  );
}

export default function CrmAdminIntegracoes() {
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({
    meta_verify_token: '',
    meta_webhook_secret: '',
    meta_page_access_token: '',
    meta_graph_api_version: 'v20.0',
    meta_page_id: '',
    google_webhook_secret: ''
  });
  const [metaEvents, setMetaEvents] = useState([]);
  const [googleEvents, setGoogleEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { avisos, avisar, fechar } = useAvisos();

  async function load() {
    setLoading(true);
    try {
      const [cfg, meta, google] = await Promise.all([
        obterIntegracoesCrm(),
        listarEventosMetaCrm({ limit: 20 }),
        listarEventosGoogleCrm({ limit: 20 })
      ]);
      setConfig(cfg);
      setForm((prev) => ({
        ...prev,
        meta_verify_token: cfg?.meta?.verify_token || '',
        meta_graph_api_version: cfg?.meta?.graph_api_version || 'v20.0',
        meta_page_id: cfg?.meta?.page_id || ''
      }));
      setMetaEvents(meta?.events || []);
      setGoogleEvents(google?.events || []);
    } catch (err) {
      // R19: `alert` do navegador some sem rastro e ignora tema e tokens.
      avisar.erro(err.message || 'Erro ao carregar integracoes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function updateField(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = { meta_verify_token: form.meta_verify_token };
      if (form.meta_webhook_secret.trim()) payload.meta_webhook_secret = form.meta_webhook_secret.trim();
      if (form.meta_page_access_token.trim()) payload.meta_page_access_token = form.meta_page_access_token.trim();
      payload.meta_graph_api_version = form.meta_graph_api_version || 'v20.0';
      payload.meta_page_id = form.meta_page_id || '';
      if (form.google_webhook_secret.trim()) payload.google_webhook_secret = form.google_webhook_secret.trim();
      const updated = await atualizarIntegracoesCrm(payload);
      setConfig(updated);
      setForm((prev) => ({ ...prev, meta_webhook_secret: '', meta_page_access_token: '', google_webhook_secret: '' }));
      avisar.sucesso('Configurações salvas.');
    } catch (err) {
      avisar.erro(err.message || 'Erro ao salvar integracoes');
    } finally {
      setSaving(false);
    }
  }

  async function reprocessMeta(id) {
    try {
      await reprocessarEventoMetaCrm(id);
      avisar.sucesso('Evento Meta enviado para reprocessamento.');
      await load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao reprocessar evento Meta');
    }
  }

  async function reprocessGoogle(id) {
    try {
      await reprocessarEventoGoogleCrm(id);
      avisar.sucesso('Evento Google enviado para reprocessamento.');
      await load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao reprocessar evento Google');
    }
  }

  const metaWebhookUrl = `${API_BASE_URL}${config?.meta?.webhook_path || '/api/crm/webhooks/meta'}`;
  const googleWebhookUrl = `${API_BASE_URL}${config?.google?.webhook_path || '/api/crm/webhooks/google'}`;

  return (
    <Pagina>
      {/* R13/R5/C1: o apoio saiu do `page-subtitle` solto e foi para a faixa
          fixa do PageHeader, que compacta na rolagem em vez de sumir. */}
      <PageHeader
        titulo="Integrações CRM"
        /* C2: o apoio da faixa diz QUANTAS integracoes estao de pe — o numero
           que a pessoa vem conferir, sem depender de achar o bloco certo. */
        contagem={`${[config?.meta_configurado, config?.google_configurado].filter(Boolean).length} de 2 configuradas`}
        descricao="Webhooks e processamento base para Meta Ads e Google Ads."
        secundarias={[{ rotulo: 'Atualizar', onClick: load, desabilitada: loading }]}
      />

      {/* R16: UM dono para a faixa de avisos. */}
      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        R9 (revista em 04/09) — FORMULÁRIO INLINE. Esta tela EXISTE para
        configurar a integração: tirando o formulário sobra um log de
        eventos que ninguém abriria por si só. Era inline antes e continua —
        nada de OverlayModal aqui.

        É o bloco PRIMÁRIO da tela (um só): é o que responde a pergunta
        central ("a integração está configurada?"); o log de eventos é
        contexto e vem depois, em superfície rebaixada.
      */}
      <BlocoConteudo
        titulo="Credenciais e webhooks"
        descricao="Os segredos já gravados não são exibidos: o campo mostra apenas se existe um configurado. Preencha somente para trocar."
        variante="primario"
        cor="var(--c-primary)"
      >
        <form onSubmit={submit} className="space-y-4">
          <FormSecao legenda="Meta Ads" colunas={2}>
            <CampoForm
              label="URL do webhook"
              span={2}
              hint="Use esta URL no app Meta para verificacao e recebimento dos eventos."
            >
              <input className="input w-full font-mono text-xs" value={metaWebhookUrl} readOnly />
            </CampoForm>
            <CampoForm label="Verify token" span={2}>
              <input className="input w-full" value={form.meta_verify_token} onChange={updateField('meta_verify_token')} />
            </CampoForm>
            <CampoForm label="Webhook secret">
              <input
                type="password"
                className="input w-full"
                value={form.meta_webhook_secret}
                onChange={updateField('meta_webhook_secret')}
                placeholder={config?.meta?.webhook_secret_configurado ? 'Configurado. Preencha para trocar.' : 'Nao configurado'}
              />
            </CampoForm>
            <CampoForm label="Page Access Token">
              <input
                type="password"
                className="input w-full"
                value={form.meta_page_access_token}
                onChange={updateField('meta_page_access_token')}
                placeholder={config?.meta?.page_access_token_configurado ? 'Configurado. Preencha para trocar.' : 'Nao configurado'}
              />
            </CampoForm>
            <CampoForm label="Graph API">
              <input className="input w-full" value={form.meta_graph_api_version} onChange={updateField('meta_graph_api_version')} placeholder="v20.0" />
            </CampoForm>
            <CampoForm label="Page ID">
              <input className="input w-full" value={form.meta_page_id} onChange={updateField('meta_page_id')} placeholder="Opcional" />
            </CampoForm>
          </FormSecao>

          <FormSecao legenda="Google Ads" colunas={2}>
            <CampoForm
              label="URL do webhook"
              span={2}
              hint="Endpoint base para eventos de chamada, tracking e origem Google."
            >
              <input className="input w-full font-mono text-xs" value={googleWebhookUrl} readOnly />
            </CampoForm>
            <CampoForm label="Webhook secret" span={2}>
              <input
                type="password"
                className="input w-full"
                value={form.google_webhook_secret}
                onChange={updateField('google_webhook_secret')}
                placeholder={config?.google?.webhook_secret_configurado ? 'Configurado. Preencha para trocar.' : 'Nao configurado'}
              />
            </CampoForm>
          </FormSecao>

          <div className="app-actionbar">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar configuracoes'}
            </button>
          </div>
        </form>
      </BlocoConteudo>

      {/*
        Os dois logs vinham lado a lado num grid de duas colunas: seis
        colunas de tabela espremidas em meia tela. Largura é decisão —
        bloco de apoio ocupa a faixa inteira, empilhado, e cada tabela
        recebe a largura de que precisa.
      */}
      <EventosTabela
        titulo="Eventos Meta"
        descricao="Últimos eventos recebidos e processados pelo CRM."
        events={metaEvents}
        loading={loading}
        onReprocess={reprocessMeta}
        storageKey="tabela:crm-admin-integracoes:eventos-meta"
      />
      <EventosTabela
        titulo="Eventos Google"
        descricao="Últimos eventos recebidos e processados pelo CRM."
        events={googleEvents}
        loading={loading}
        onReprocess={reprocessGoogle}
        storageKey="tabela:crm-admin-integracoes:eventos-google"
      />
    </Pagina>
  );
}
