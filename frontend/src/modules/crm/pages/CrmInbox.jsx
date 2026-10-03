import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  atualizarConversaCrm,
  criarConversaCrm,
  criarTemplateMensagemCrm,
  listarConversasCrm,
  listarTemplatesMensagemCrm,
  marcarConversaLidaCrm,
  obterConversaCrm,
  registrarMensagemCrm
} from '../../../services/crm';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  BarraFiltros,
  alternarValorFiltro,
  FormSecao,
  CampoForm,
  Avisos,
  useAvisos,
  useConfirmacao,
  useFiltrosVisiveis
} from '../../../components/padrao';
import OverlayModal from '../../../components/ui/OverlayModal';
import StatusBadge from '../../../components/StatusBadge';

const STATUS_LABEL = {
  OPEN: 'Aberta',
  PENDING: 'Pendente',
  RESOLVED: 'Resolvida',
  ARCHIVED: 'Arquivada'
};

/*
  R25 — a antiga statusClass() pintava emerald/amber/blue à mão (paleta crua
  sem par no tema escuro e sem o piso de contraste do ThemeContext). O
  estado vira FAMÍLIA SEMÂNTICA do StatusBadge. O mapa é explícito porque a
  classificação automática leria "Aberta" como `warning` (o padrão dela para
  EM_ABERTO) e jogaria Resolvida em `info` — aqui aberta é o estado saudável
  do atendimento e resolvida é a conclusão.
*/
const STATUS_FAMILIA = {
  OPEN: 'success',
  PENDING: 'warning',
  RESOLVED: 'info',
  ARCHIVED: 'neutral'
};

const CHANNEL_LABEL = {
  WHATSAPP: 'WhatsApp',
  PHONE: 'Telefone',
  EMAIL: 'E-mail',
  FORM: 'Formulario',
  CHAT: 'Chat',
  OTHER: 'Outro'
};

const PRIORITY_LABEL = {
  LOW: 'Baixa',
  MEDIUM: 'Media',
  HIGH: 'Alta'
};

const FILTROS_VAZIOS = {
  status: new Set(),
  channel_type: new Set(),
  unread_only: new Set()
};

function fmtDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

function initials(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || '?') + (parts[1]?.[0] || '');
}

function rotuloStatus(status) {
  return STATUS_LABEL[status] || status || '-';
}

/*
  R12 — o recorte da inbox virou marcação, mas `GET /crm/conversations`
  aceita UM valor por parâmetro (`status=OPEN`). Marcar dois mandaria um
  parâmetro que o backend ignora — capacidade aparente sem efeito. Por isso
  as dimensões são `unico: true`: a marca é redonda, marcar outra substitui,
  e a etiqueta afirma o que está filtrando de verdade.
*/
function primeiroValor(conjunto) {
  if (!conjunto || conjunto.size === 0) return '';
  return [...conjunto][0];
}

const emptyNewConversation = {
  contact_name: '',
  contact_phone: '',
  contact_email: '',
  subject: '',
  channel_type: 'WHATSAPP',
  priority: 'MEDIUM',
  initial_message: ''
};

const emptyTemplate = {
  nome: '',
  channel_type: 'WHATSAPP',
  categoria: '',
  content: ''
};

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
  { id: 'busca', rotulo: 'Busca', obrigatorio: true },
  { id: 'status', rotulo: 'Status' },
  { id: 'channel_type', rotulo: 'Canal' },
  { id: 'unread_only', rotulo: 'Leitura' }
];

export default function CrmInbox() {
  const [busca, setBusca] = useState('');
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => (filtro.id === 'busca'
      ? busca.trim() !== ''
      : (filtros[filtro.id]?.size || 0) > 0)).map((filtro) => filtro.id),
    [busca, filtros]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:crm-inbox', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => setFiltros((atual) => ({ ...atual, [id]: new Set() }))
  });
  const [conversations, setConversations] = useState([]);
  const [total, setTotal] = useState(0);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [compose, setCompose] = useState({ content: '', direction: 'OUTBOUND' });
  const [newConversation, setNewConversation] = useState(emptyNewConversation);
  const [showNew, setShowNew] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templateForm, setTemplateForm] = useState(emptyTemplate);
  // R19/R3: a faixa de erro montada à mão (cor crua vermelha) vira o aviso
  // do sistema, com tom semântico e fechável.
  const { avisos, avisar, fechar } = useAvisos();
  // R21: `confirmar()` devolve OBJETO — o uso abaixo DESESTRUTURA.
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  const consulta = useMemo(() => ({
    q: busca,
    status: primeiroValor(filtros.status),
    channel_type: primeiroValor(filtros.channel_type),
    unread_only: primeiroValor(filtros.unread_only)
  }), [busca, filtros]);

  /*
    DEFEITO DE SIGNIFICADO CORRIGIDO (rodada CRM): `loadList` declarava
    `selectedId` como dependência só para escolher a primeira conversa
    quando nada estava selecionado. Como o efeito roda a cada IDENTIDADE
    nova do callback, clicar numa conversa recarregava a LISTA INTEIRA do
    servidor — uma requisição por clique, e a lista piscando embaixo do
    dedo. A escolha inicial agora é feita na forma funcional do setState, e
    a consulta só depende do recorte.
  */
  const loadList = useCallback(() => {
    setLoadingList(true);
    return listarConversasCrm({ page: 1, limit: 50, ...consulta })
      .then((data) => {
        setConversations(data.conversations || []);
        setTotal(data.total || 0);
        setSelectedId((atual) => atual || data.conversations?.[0]?.id || null);
      })
      .catch((err) => avisar.erro(err.message || 'Erro ao carregar conversas'))
      .finally(() => setLoadingList(false));
  }, [consulta, avisar]);

  const loadTemplates = useCallback(() => {
    listarTemplatesMensagemCrm({ ativo: true })
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => setTemplates([]));
  }, []);

  const loadDetail = useCallback((id, params = {}, options = {}) => {
    if (!id) {
      setConversation(null);
      return Promise.resolve();
    }
    if (options.appendOlder !== true) {
      setLoadingDetail(true);
    } else {
      setLoadingMoreMessages(true);
    }
    return obterConversaCrm(id, { messages_limit: 40, ...params })
      .then((data) => {
        if (options.appendOlder) {
          setConversation((current) => {
            if (!current || current.id !== data.id) return data;
            const currentMessages = Array.isArray(current.messages) ? current.messages : [];
            const olderMessages = Array.isArray(data.messages) ? data.messages : [];
            const merged = [...olderMessages, ...currentMessages];
            const seen = new Set();
            const deduped = merged.filter((item) => {
              const key = Number(item.id);
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            return {
              ...current,
              ...data,
              messages: deduped,
              messages_meta: data.messages_meta || current.messages_meta
            };
          });
          return;
        }
        setConversation(data);
      })
      .catch((err) => avisar.erro(err.message || 'Erro ao carregar conversa'))
      .finally(() => {
        if (options.appendOlder !== true) {
          setLoadingDetail(false);
        } else {
          setLoadingMoreMessages(false);
        }
      });
  }, [avisar]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadTemplates(); }, [loadTemplates]);
  useEffect(() => { loadDetail(selectedId); }, [loadDetail, selectedId]);

  const orderedMessages = useMemo(() => {
    return [...(conversation?.messages || [])].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }, [conversation]);

  // R23: marcar aplica na hora — uma requisição por recorte, longe do
  // critério de consulta cara.
  function alternarFiltro(dimensao, valor, opcoes) {
    setFiltros((atuais) => alternarValorFiltro(atuais, dimensao, valor, opcoes));
  }

  function limparFiltros() {
    setBusca('');
    setFiltros(FILTROS_VAZIOS);
  }

  async function handleCreateConversation(event) {
    event.preventDefault();
    try {
      const created = await criarConversaCrm(newConversation);
      setNewConversation(emptyNewConversation);
      setShowNew(false);
      setSelectedId(created.id);
      avisar.sucesso('Conversa criada.');
      loadList();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao criar conversa');
    }
  }

  async function handleSendMessage(event) {
    event.preventDefault();
    // R26: alvo e conteúdo fixados antes de qualquer await — a lista pode
    // recarregar (e trocar a conversa aberta) enquanto o POST está no ar.
    const alvo = conversation;
    const mensagem = { ...compose };
    if (!alvo?.id || !mensagem.content.trim()) return;
    try {
      await registrarMensagemCrm(alvo.id, mensagem);
      setCompose({ content: '', direction: 'OUTBOUND' });
      await loadDetail(alvo.id);
      loadList();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao enviar mensagem');
    }
  }

  /*
    CONSENTIMENTO (R26 + R21) — arquivar tira a conversa da fila de
    atendimento, e o alvo tem de ser o que a pessoa está vendo AGORA: o
    modal do sistema não congela a página (o `confirm` do navegador
    congelava), então a lista ao lado continua clicável enquanto a pergunta
    está aberta. `alvo` e `proximo` são fixados ANTES do await; a pergunta
    cita o nome que vai ser arquivado e a ação usa a MESMA referência.
    O `select` é controlado por `conversation.status`: cancelar devolve
    sozinho o valor anterior à tela.
  */
  async function handleStatusChange(event) {
    const alvo = conversation;
    const proximo = event.target.value;
    if (!alvo?.id || proximo === alvo.status) return;
    const nome = alvo.contact_name || alvo.lead?.nome || 'Contato sem nome';
    if (proximo === 'ARCHIVED') {
      const { ok } = await confirmar({
        titulo: 'Arquivar conversa',
        mensagem: `Arquivar a conversa com ${nome}? Ela sai da fila de atendimento e passa a aparecer apenas pelo filtro "Arquivada".`,
        rotuloConfirmar: 'Arquivar',
        destrutiva: true
      });
      if (!ok) return;
    }
    try {
      const updated = await atualizarConversaCrm(alvo.id, { status: proximo });
      setConversation(updated);
      avisar.sucesso(`Conversa com ${nome} agora está ${rotuloStatus(proximo).toLowerCase()}.`);
      loadList();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao alterar status');
    }
  }

  async function handleMarkRead() {
    const alvo = conversation;
    if (!alvo?.id) return;
    try {
      const updated = await marcarConversaLidaCrm(alvo.id);
      setConversation(updated);
      loadList();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao marcar como lida');
    }
  }

  async function handleCreateTemplate(event) {
    event.preventDefault();
    try {
      await criarTemplateMensagemCrm(templateForm);
      setTemplateForm(emptyTemplate);
      avisar.sucesso('Template salvo.');
      loadTemplates();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao criar template');
    }
  }

  function applyTemplate(event) {
    const template = templates.find((item) => String(item.id) === event.target.value);
    if (template) {
      setCompose((current) => ({ ...current, content: template.content || '' }));
    }
  }

  function handleLoadOlderMessages() {
    const alvo = conversation;
    const beforeMessageId = alvo?.messages_meta?.oldest_message_id;
    if (!alvo?.id || !beforeMessageId || loadingMoreMessages) return;
    loadDetail(
      alvo.id,
      { before_message_id: beforeMessageId, messages_limit: 40 },
      { appendOlder: true }
    );
  }

  const nomeConversa = conversation
    ? (conversation.contact_name || conversation.lead?.nome || 'Contato sem nome')
    : '';

  return (
    <Pagina>
      <PageHeader
        titulo="Inbox CRM"
        contagem={`${total} conversa${total !== 1 ? 's' : ''}`}
        descricao="Conversas comerciais unificadas por canal, lead e responsável."
        acaoPrincipal={{ rotulo: 'Nova conversa', onClick: () => setShowNew(true) }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        R18 — nenhum ancestral desta área usa `overflow: hidden`. A lista de
        conversas e a trilha de mensagens rolam com `overflow-y-auto`
        (permitido: só `hidden` sequestra o sticky), para a faixa fixa do
        cabeçalho continuar grudada na topbar durante a rolagem.
      */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4">
          <BlocoConteudo
            titulo="Conversas"
            contagem={`${total} registro${total !== 1 ? 's' : ''}`}
            descricao="Selecione uma conversa para abrir o histórico."
            acoes={(
              <button type="button" className="btn btn-outline btn-sm" onClick={loadList}>
                Atualizar
              </button>
            )}
          >
            <BarraFiltros
              busca={visibilidadeFiltros.ehVisivel('busca') ? {
                valor: busca,
                aoMudar: setBusca,
                placeholder: 'Buscar nome, telefone, assunto…'
              } : null}
              filtros={[
                {
                  id: 'status',
                  rotulo: 'Status',
                  unico: true,
                  opcoes: Object.entries(STATUS_LABEL).map(([valor, rotulo]) => ({ valor, rotulo }))
                },
                {
                  id: 'channel_type',
                  rotulo: 'Canal',
                  unico: true,
                  opcoes: Object.entries(CHANNEL_LABEL).map(([valor, rotulo]) => ({ valor, rotulo }))
                },
                {
                  id: 'unread_only',
                  rotulo: 'Leitura',
                  unico: true,
                  opcoes: [{ valor: 'true', rotulo: 'Somente não lidas' }]
                }
              ].filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
              ativos={filtros}
              aoAlternar={alternarFiltro}
              aoLimpar={limparFiltros}
              visibilidade={visibilidadeFiltros}
            />

            <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto">
              {loadingList ? (
                <p className="text-sm text-muted">Carregando conversas...</p>
              ) : conversations.length === 0 ? (
                <p className="text-sm text-muted">Nenhuma conversa encontrada.</p>
              ) : conversations.map((item) => {
                const selecionada = selectedId === item.id;
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    aria-current={selecionada ? 'true' : undefined}
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${
                      selecionada
                        ? 'border-[var(--c-primary)] bg-elevated'
                        : 'border-base hover:border-subtle'
                    }`}
                  >
                    <span className="flex items-start gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-main text-xs font-bold text-white">
                        {initials(item.contact_name || item.lead?.nome)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-main">
                            {item.contact_name || item.lead?.nome || 'Contato sem nome'}
                          </span>
                          {item.unread_count > 0 && (
                            <span className="badge badge-danger" title={`${item.unread_count} não lida(s)`}>
                              {item.unread_count}
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block truncate text-xs text-muted">
                          {item.last_message_preview || item.subject || 'Sem mensagens registradas'}
                        </span>
                        <span className="mt-2 flex flex-wrap items-center gap-2">
                          <StatusBadge
                            status={rotuloStatus(item.status)}
                            kind={STATUS_FAMILIA[item.status] || 'neutral'}
                          />
                          <span className="badge badge-muted">
                            {CHANNEL_LABEL[item.channel_type] || item.channel_type}
                          </span>
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </BlocoConteudo>
        </div>

        <div className="flex flex-col gap-4 xl:col-span-2">
          <BlocoConteudo
            variante="primario"
            cor="var(--sem-info)"
            titulo={conversation ? nomeConversa : 'Conversa'}
            descricao={conversation
              ? `${conversation.subject || 'Sem assunto'} · ${CHANNEL_LABEL[conversation.channel_type] || conversation.channel_type} · Responsavel: ${conversation.responsavel?.nome || '-'} · Lead: ${conversation.lead?.nome || '-'}`
              : 'Selecione uma conversa na lista ao lado.'}
            acoes={conversation ? (
              <span className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  status={rotuloStatus(conversation.status)}
                  kind={STATUS_FAMILIA[conversation.status] || 'neutral'}
                />
                {/*
                  Select de EDIÇÃO do registro aberto (muda o status da
                  conversa), não de filtro: o recorte da lista mora na
                  BarraFiltros ao lado (R12).
                */}
                <select
                  className="input"
                  aria-label="Status da conversa"
                  value={conversation.status || 'OPEN'}
                  onChange={handleStatusChange}
                >
                  {Object.entries(STATUS_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <button type="button" className="btn btn-outline btn-sm" onClick={handleMarkRead}>
                  Marcar lida
                </button>
              </span>
            ) : null}
          >
            {loadingDetail ? (
              <p className="text-sm text-muted">Carregando conversa...</p>
            ) : !conversation ? (
              <p className="text-sm text-muted">Selecione uma conversa para visualizar o histórico.</p>
            ) : (
              <>
                <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-2">
                  {conversation?.messages_meta?.has_more && (
                    <div className="flex justify-center">
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={handleLoadOlderMessages}
                        disabled={loadingMoreMessages}
                      >
                        {loadingMoreMessages ? 'Carregando...' : 'Carregar mensagens anteriores'}
                      </button>
                    </div>
                  )}
                  {orderedMessages.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-base p-4 text-center text-sm text-muted">
                      Nenhuma mensagem registrada.
                    </p>
                  ) : orderedMessages.map((message) => {
                    const isOutbound = message.direction === 'OUTBOUND';
                    const isInternal = message.direction === 'INTERNAL';
                    /*
                      R25 — as três famílias de mensagem eram amber/blue/base
                      cruas. Agora a distinção é a tarja de 4px do sistema
                      (utilitário `.tarja--*`, já existente): nota interna em
                      atenção, mensagem enviada em info, recebida neutra.
                    */
                    const tarja = isInternal ? 'tarja tarja--warning' : isOutbound ? 'tarja tarja--info' : '';
                    return (
                      <div key={message.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[78%] rounded-xl border border-base bg-card px-4 py-3 ${tarja}`}>
                          <div className="mb-1 flex items-center justify-between gap-4 text-xs text-muted">
                            <span>{isInternal ? 'Nota interna' : isOutbound ? (message.usuario?.nome || 'Usuario') : 'Contato'}</span>
                            <span>{fmtDate(message.createdAt)}</span>
                          </div>
                          <p className="whitespace-pre-wrap text-sm text-main">{message.content}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form onSubmit={handleSendMessage} className="mt-4 rounded-xl border border-base p-3">
                  <FormSecao colunas={2}>
                    <CampoForm label="Registro">
                      <select
                        className="input"
                        value={compose.direction}
                        onChange={(e) => setCompose((c) => ({ ...c, direction: e.target.value }))}
                      >
                        <option value="OUTBOUND">Mensagem</option>
                        <option value="INTERNAL">Nota interna</option>
                      </select>
                    </CampoForm>
                    <CampoForm label="Template">
                      <select className="input" defaultValue="" onChange={applyTemplate}>
                        <option value="">Inserir template...</option>
                        {templates.map((template) => (
                          <option key={template.id} value={template.id}>{template.nome}</option>
                        ))}
                      </select>
                    </CampoForm>
                    <CampoForm label="Conteudo" tipo="texto-longo">
                      <textarea
                        className="input"
                        rows={4}
                        placeholder="Digite a mensagem ou nota..."
                        value={compose.content}
                        onChange={(e) => setCompose((c) => ({ ...c, content: e.target.value }))}
                      />
                    </CampoForm>
                  </FormSecao>
                  <div className="mt-3 flex justify-end">
                    <button type="submit" className="btn btn-primary">Registrar</button>
                  </div>
                </form>
              </>
            )}
          </BlocoConteudo>

          <BlocoConteudo
            variante="secundario"
            titulo="Templates rápidos"
            contagem={`${templates.length} salvo${templates.length !== 1 ? 's' : ''}`}
            descricao="Modelos salvos ficam disponíveis no campo de resposta da conversa."
          >
            <form onSubmit={handleCreateTemplate}>
              <FormSecao colunas={3}>
                <CampoForm label="Nome do template">
                  <input
                    className="input"
                    placeholder="Nome do template"
                    value={templateForm.nome}
                    onChange={(e) => setTemplateForm((c) => ({ ...c, nome: e.target.value }))}
                  />
                </CampoForm>
                <CampoForm label="Canal">
                  <select
                    className="input"
                    value={templateForm.channel_type}
                    onChange={(e) => setTemplateForm((c) => ({ ...c, channel_type: e.target.value }))}
                  >
                    {Object.entries(CHANNEL_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </CampoForm>
                <CampoForm label="Categoria">
                  <input
                    className="input"
                    placeholder="Categoria"
                    value={templateForm.categoria}
                    onChange={(e) => setTemplateForm((c) => ({ ...c, categoria: e.target.value }))}
                  />
                </CampoForm>
                <CampoForm label="Conteudo do template" tipo="texto-longo">
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Conteudo do template"
                    value={templateForm.content}
                    onChange={(e) => setTemplateForm((c) => ({ ...c, content: e.target.value }))}
                  />
                </CampoForm>
              </FormSecao>
              <div className="mt-3 flex justify-end">
                <button type="submit" className="btn btn-outline">Salvar template</button>
              </div>
            </form>
          </BlocoConteudo>
        </div>
      </div>

      {/*
        R9 — MODAL É O CERTO AQUI, e o teste é o da própria regra: "se eu
        tirar o formulário, ainda sobra uma tela?". Tirando o cadastro de
        conversa manual sobram a fila de conversas e a trilha de mensagens —
        que é o trabalho pelo qual alguém abre a inbox. A conversa manual
        (atendimento ativo, contato que chegou fora do webhook) INTERROMPE
        esse trabalho e devolve a pessoa ao lugar onde estava: é o lado
        direito da tabela da R9. Inline, o formulário empurraria a fila para
        baixo justamente enquanto se triagem as conversas.
        R27: cabeçalho e rodapé marcados ficam fixos; o corpo rola sozinho.
      */}
      <OverlayModal
        aberto={showNew}
        rotulo="Nova conversa manual"
        onFechar={() => setShowNew(false)}
      >
        <div data-modal="cabecalho" className="app-bloco-head">
          <h2 className="app-bloco-titulo">Nova conversa manual</h2>
          <span className="app-bloco-acoes">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowNew(false)}>
              Fechar
            </button>
          </span>
        </div>

        <form id="form-nova-conversa" onSubmit={handleCreateConversation} className="p-4">
          <p className="text-sm text-muted">
            Use para conversas iniciadas fora dos webhooks ou para atendimento ativo.
          </p>
          <FormSecao colunas={3}>
            <CampoForm label="Nome do contato">
              <input
                className="input"
                value={newConversation.contact_name}
                onChange={(e) => setNewConversation((c) => ({ ...c, contact_name: e.target.value }))}
              />
            </CampoForm>
            <CampoForm label="Telefone">
              <input
                className="input"
                value={newConversation.contact_phone}
                onChange={(e) => setNewConversation((c) => ({ ...c, contact_phone: e.target.value }))}
              />
            </CampoForm>
            <CampoForm label="E-mail">
              <input
                className="input"
                value={newConversation.contact_email}
                onChange={(e) => setNewConversation((c) => ({ ...c, contact_email: e.target.value }))}
              />
            </CampoForm>
            <CampoForm label="Assunto" span={2}>
              <input
                className="input"
                value={newConversation.subject}
                onChange={(e) => setNewConversation((c) => ({ ...c, subject: e.target.value }))}
              />
            </CampoForm>
            <CampoForm label="Canal">
              <select
                className="input"
                value={newConversation.channel_type}
                onChange={(e) => setNewConversation((c) => ({ ...c, channel_type: e.target.value }))}
              >
                {Object.entries(CHANNEL_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </CampoForm>
            <CampoForm label="Prioridade">
              <select
                className="input"
                value={newConversation.priority}
                onChange={(e) => setNewConversation((c) => ({ ...c, priority: e.target.value }))}
              >
                {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </CampoForm>
            <CampoForm label="Mensagem inicial" hint="Opcional" tipo="texto-longo">
              <textarea
                className="input"
                rows={3}
                value={newConversation.initial_message}
                onChange={(e) => setNewConversation((c) => ({ ...c, initial_message: e.target.value }))}
              />
            </CampoForm>
          </FormSecao>
        </form>

        <div data-modal="rodape" className="app-actionbar p-4">
          <button type="button" className="btn btn-outline" onClick={() => setShowNew(false)}>
            Cancelar
          </button>
          <button type="submit" form="form-nova-conversa" className="btn btn-primary">
            Criar conversa
          </button>
        </div>
      </OverlayModal>

      {elementoConfirmacao}
    </Pagina>
  );
}
