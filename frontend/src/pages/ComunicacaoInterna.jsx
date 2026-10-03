import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  HiOutlineArchiveBox,
  HiOutlineArrowUturnLeft,
  HiOutlineCheckCircle,
  HiOutlineUserPlus,
  HiOutlineChatBubbleLeftRight,
  HiOutlineChevronLeft,
  HiOutlineInformationCircle,
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineXMark,
  HiPaperClip
} from 'react-icons/hi2';
import { useAuth } from '../contexts/AuthContext';
import { usePosicaoFlutuante } from '../hooks/usePosicaoFlutuante';
import { canSendComunicacao } from '../utils/acessoProduto';
import { API_URL, authHeaders, fileUrl } from '../services/api';
import { getSetores } from '../services/setores';
import {
  arquivarConversasEmMassa,
  criarConversa,
  criarConversaEmMassa,
  deletarMensagemConversa,
  desarquivarConversasEmMassa,
  editarMensagemConversa,
  enviarMensagemConversa,
  getConversa,
  getDestinatariosConversa,
  getMensagens,
  listarConversas,
  marcarLida,
  /*
    PORTADAS DA ConversaDetalhe (decisao do cliente, 04/09).

    As tres existiam ponta a ponta — servico no frontend e rota no backend —
    e NENHUMA tela alcancavel as oferecia. O sistema sabia concluir, reabrir
    e adicionar participantes; ninguem conseguia fazer.
  */
  adicionarParticipantesConversa,
  concluirConversa,
  reabrirConversa
} from '../services/conversasInternas';
import PendingAttachmentsList from '../components/attachments/PendingAttachmentsList';
import {
  UPLOAD_MAX_FILE_SIZE_MB_PADRAO,
  concatenarAnexosPendentes,
  extrairFilesAnexosPendentes,
  montarMensagemArquivosAcimaDoLimite
} from '../utils/pendingAttachments';
import {
  Avisos,
  BarraFiltros,
  PageHeader,
  Pagina,
  alternarValorFiltro,
  useAvisos,
  useConfirmacao
} from '../components/padrao';
import OverlayModal from '../components/ui/OverlayModal';
import useFecharAoSair from '../hooks/useFecharAoSair';

const LIST_POLL_INTERVAL_MS = 15000;
const ACTIVE_CHAT_POLL_INTERVAL_MS = 5000;

// Respiro abaixo dos painéis quando eles ocupam a altura útil da janela.
// É o degrau --esp-4 (16px) da escala, em número porque a conta é feita em
// JS (a mesma classe de medida que o Pagina faz para a topbar real).
const RESPIRO_INFERIOR = 16;
// Piso de altura dos painéis: abaixo disso a conversa deixa de ser legível
// e vale mais rolar a página (R10: vence a LEITURA, não a densidade).
const ALTURA_MINIMA_PAINEIS = 360;

// Recorte da lista (R12): situação é ENUMERÁVEL e de valor ÚNICO — o
// serviço aceita `arquivadas` ligado ou desligado, nunca os dois. Daí
// `unico: true` na dimensão: marcar um valor substitui o outro, e a
// etiqueta reflete o que está filtrando de verdade.
const DIMENSAO_SITUACAO = {
  id: 'situacao',
  rotulo: 'Situação',
  unico: true,
  opcoes: [
    { valor: 'ATIVAS', rotulo: 'Ativas' },
    { valor: 'ARQUIVADAS', rotulo: 'Arquivadas' }
  ]
};

/*
  Superfície dos dois painéis. Ela era uma CÓPIA à mão do `.app-bloco`
  (fundo, borda, raio e sombra, token por token) — e a B1 reprovou a tela
  com "nenhum bloco na tela", corretamente: o que existia era um bloco no
  visual e nada no DOM, então nenhum check conseguia enxergá-lo. É a mesma
  família do defeito de 02/09, código certo sem o elemento no DOM.

  Agora o painel É `.app-bloco`, e o inline se resume ao que o bloco não
  tem: padding zero (a lista e o chat rolam coladas na borda) e `clip`.
  R18: `clip`, NUNCA `hidden` — `hidden` cria scrollport e mata sticky em
  silêncio.
*/
// `p-0` como CLASSE, não medida em style: o degrau 0 é da escala, e a R10
// quer o ritmo vindo de classe/componente.
const CLASSE_PAINEL = 'app-bloco p-0';
/*
  B2 — um primário por tela, e aqui é o painel da CONVERSA.

  A lista da esquerda é como se chega; a conversa é onde o trabalho
  acontece — ler, responder, anexar. A barra de cor no painel direito
  responde "o que esta tela é para fazer", que é a pergunta da B2. Marcar
  a lista faria o olho parar no índice em vez do conteúdo.
*/
const CLASSE_PAINEL_PRIMARIO = 'app-bloco app-bloco--primario p-0';
const ESTILO_PAINEL = {
  overflow: 'clip'
};

const ESTILO_TRUNCADO = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

const ESTILO_ITEM_MENU = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--esp-2)',
  width: '100%',
  minHeight: 'var(--alvo-clique)',
  paddingBlock: 'var(--esp-2)',
  paddingInline: 'var(--esp-3)',
  fontSize: 'var(--fonte-corpo)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left'
};

function formatHora(valor) {
  if (!valor) return '';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  const hoje = new Date();
  const mesmodia =
    d.getDate() === hoje.getDate() &&
    d.getMonth() === hoje.getMonth() &&
    d.getFullYear() === hoje.getFullYear();
  if (mesmodia) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatDataHora(valor) {
  if (!valor) return '';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function normalizarUrlArquivo(url) {
  const valor = String(url || '');
  if (!valor.startsWith('http')) return valor;
  return valor.replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
}

function nomeConversa(conv, userId) {
  if (!conv) return '';
  if (conv.is_group) return conv.setor_grupo?.nome ? `Grupo: ${conv.setor_grupo.nome}` : conv.assunto;
  if (conv.criador?.id === userId) return conv.destinatario?.nome || conv.assunto;
  return conv.criador?.nome || conv.assunto;
}

function setorConversa(conv, userId) {
  if (!conv || conv.is_group) return '';
  const usuario = conv.criador?.id === userId ? conv.destinatario : conv.criador;
  return usuario?.setor?.nome || usuario?.setor?.codigo || '';
}

function timestampConversa(conv) {
  const data = new Date(conv?.last_message_at || conv?.updatedAt || conv?.createdAt || 0);
  return Number.isNaN(data.getTime()) ? 0 : data.getTime();
}


function isMensagemVista(msg, participantesLeitura, userId) {
  const msgTime = new Date(msg.createdAt).getTime();
  return participantesLeitura.some(
    (p) => p.usuario_id !== userId && p.lida_em && new Date(p.lida_em).getTime() >= msgTime
  );
}

// Os ticks herdam a cor do texto da bolha (currentColor), então funcionam
// no tema claro e no escuro sem cor escrita à mão.
function TicksMensagem({ vista }) {
  if (vista) {
    return (
      <svg width="18" height="10" viewBox="0 0 18 10" fill="none" aria-hidden="true" style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' }}>
        <path d="M1 5L4.5 8.5L10 1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 5L9.5 8.5L15 1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="18" height="10" viewBox="0 0 18 10" fill="none" aria-hidden="true" style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle', opacity: 0.55 }}>
      <path d="M1 5L4.5 8.5L11 1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AvatarConversa({ conv }) {
  const isGroup = conv?.is_group;
  const nome = conv?.assunto || '';
  const inicial = isGroup ? '#' : nome.charAt(0).toUpperCase();
  const cor = isGroup ? 'var(--c-secondary)' : 'var(--c-primary)';
  return (
    <div
      aria-hidden="true"
      style={{
        width: 'var(--esp-8)',
        height: 'var(--esp-8)',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: 'var(--fonte-corpo)',
        fontWeight: 700,
        background: `color-mix(in srgb, ${cor} 16%, var(--ui-surface))`,
        color: cor
      }}
    >
      {inicial}
    </div>
  );
}

export default function ComunicacaoInterna() {
  const { user } = useAuth();
  const userId = user?.id;
  const podeEnviarComunicacao = canSendComunicacao(user);

  // R3/R19: aviso e confirmação do sistema no lugar da caixa do navegador.
  // Dois contextos INDEPENDENTES (R16): a faixa da página e a faixa dentro
  // do modal de nova conversa — erro com o modal aberto ficaria atrás do
  // fundo escurecido se houvesse um dono só.
  const { avisos, avisar, fechar } = useAvisos();
  const { avisos: avisosModal, avisar: avisarModal, fechar: fecharAvisoModal, limpar: limparAvisosModal } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  const [conversas, setConversas] = useState([]);
  const [loadingLista, setLoadingLista] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtrosAtivos, setFiltrosAtivos] = useState({});
  /*
    A TELA IGNORAVA O `:id` DA URL (04/09).

    A rota conversas/:id sempre apontou para esta tela, e ela nunca chamou
    `useParams`. Clicar
    numa conversa navegava para /conversas/123 e abria a lista DO ZERO,
    como se nada tivesse sido pedido. Nao era tela branca: era uma tela que
    carrega e ignora o pedido, o que engana mais — o usuario ve algo
    plausivel e conclui que a conversa sumiu.

    Eu mesmo registrei isso errado antes, como "rota quebrada" (E3). A rota
    nunca esteve quebrada; quem estava surdo era a tela.
  */
  const { id: idDaUrl } = useParams();
  const navigate = useNavigate();
  const idJaAplicado = useRef(null);
  const [conversaAtiva, setConversaAtiva] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [temMais, setTemMais] = useState(false);
  const [oldestId, setOldestId] = useState(null);
  const [loadingMais, setLoadingMais] = useState(false);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [arquivos, setArquivos] = useState([]);
  const [editandoId, setEditandoId] = useState(null);
  const [textoEdicao, setTextoEdicao] = useState('');
  const [mobileModo, setMobileModo] = useState('lista');
  const [isMobile, setIsMobile] = useState(false);
  const [participantesLeitura, setParticipantesLeitura] = useState([]);
  const [menuMsgId, setMenuMsgId] = useState(null);

  /* ITEM 6 DA LEVA (06/09) — Esc fechava em 26 telas e NAO fechava aqui.
     O clique fora ja fechava, mas por outro caminho: um veu de tela cheia
     (`position: fixed; inset: 0`) logo abaixo do menu. O veu resolve o
     ponteiro e nao resolve o teclado, e era so isso que faltava.
     Mantenho o veu (ele tambem impede que o clique de fechar caia na
     mensagem debaixo — remove-lo mudaria o que a pessoa ve) e somo o
     gancho padrao do sistema, que traz o Esc. Um ref so basta: o
     `menuMsgId` garante que existe no maximo UM menu aberto na lista. */
  const menuMsgRef = useRef(null);
  useFecharAoSair(menuMsgRef, menuMsgId !== null, () => setMenuMsgId(null));
  /*
    O TERCEIRO JEITO DE POSICIONAR CAMADA SAIU DAQUI (06/09).

    O que estava escrito: `setMenuMsgOpenUpward(rect.top > 200)` no clique do
    botao, e `bottom: 100%` ou `top: 100%` conforme esse booleano. Nao era
    medicao — era um CHUTE de 200px que nao conhece a altura do menu nem a
    da janela: numa janela baixa o menu "para baixo" saia pelo rodape, e
    perto do topo o "para cima" saia pelo cabecalho. E o `right: 0` do menu
    saia pela borda esquerda nas bolhas encostadas na esquerda da conversa,
    que e o mesmo defeito do painel "Filtros visiveis".

    A regra desta casa: antes de criar qualquer coisa nova, medir de quantos
    jeitos isso ja e feito aqui. Eram DOIS (o hook e a medicao a mao do
    autocomplete de apropriacao) mais este chute; os tres viraram um.

    UM REF SO PARA O BOTAO, pelo mesmo motivo que o `menuMsgRef` e um so: o
    `menuMsgId` garante no maximo UM menu aberto na lista, e o ref e ligado
    apenas no botao da mensagem aberta.
  */
  const botaoMsgRef = useRef(null);
  const posicaoMsg = usePosicaoFlutuante(botaoMsgRef, menuMsgRef, menuMsgId !== null, {
    ancorarADireita: true
  });
  const [infoMsg, setInfoMsg] = useState(null);
  const [mensagemRespondendo, setMensagemRespondendo] = useState(null);
  const [alturaPaineis, setAlturaPaineis] = useState(null);

  // Modal nova conversa
  const [showNova, setShowNova] = useState(false);
  const [modoMassa, setModoMassa] = useState(false);
  const [assuntoNova, setAssuntoNova] = useState('');
  const [mensagemNova, setMensagemNova] = useState('');
  const [destinatarioId, setDestinatarioId] = useState('');
  const [destinatariosMassaIds, setDestinatariosMassaIds] = useState([]);
  const [setoresMassaIds, setSetoresMassaIds] = useState([]);
  const [destinatarios, setDestinatarios] = useState([]);
  const [setores, setSetores] = useState([]);
  const [arquivosNova, setArquivosNova] = useState([]);
  const [salvando, setSalvando] = useState(false);

  const chatEndRef = useRef(null);
  const mensagensContainerRef = useRef(null);
  const inputRef = useRef(null);
  const mensagensRef = useRef([]);
  const msgElemsRef = useRef({});
  const paineisRef = useRef(null);

  const mostrandoArquivadas = (filtrosAtivos.situacao || new Set()).has('ARQUIVADAS');

  const obterUrlAssinadaAnexo = useCallback(async (caminhoArquivo) => {
    if (!caminhoArquivo) return null;
    if (!String(caminhoArquivo).startsWith('http')) {
      return fileUrl(caminhoArquivo);
    }

    const caminhoNormalizado = normalizarUrlArquivo(caminhoArquivo);
    const response = await fetch(`${API_URL}/anexos/presign?url=${encodeURIComponent(caminhoNormalizado)}`, {
      headers: authHeaders()
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error || 'Erro ao gerar link seguro para o arquivo');
    }

    return data?.url || null;
  }, []);

  const abrirAnexoConversa = useCallback(async (anexo) => {
    try {
      const urlArquivo = await obterUrlAssinadaAnexo(anexo?.caminho);
      if (!urlArquivo) {
        throw new Error('Link seguro indisponivel');
      }
      window.open(urlArquivo, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao abrir arquivo');
    }
  }, [obterUrlAssinadaAnexo, avisar]);

  const adicionarArquivosConversa = useCallback((files) => {
    const { arquivos: proximoEstado, rejeitados } = concatenarAnexosPendentes(arquivos, files, {
      maxFileSizeMb: UPLOAD_MAX_FILE_SIZE_MB_PADRAO
    });
    setArquivos(proximoEstado);
    if (rejeitados.length > 0) {
      avisar.alerta(montarMensagemArquivosAcimaDoLimite(rejeitados, UPLOAD_MAX_FILE_SIZE_MB_PADRAO));
    }
  }, [arquivos, avisar]);

  const adicionarArquivosNovaConversa = useCallback((files) => {
    const { arquivos: proximoEstado, rejeitados } = concatenarAnexosPendentes(arquivosNova, files, {
      maxFileSizeMb: UPLOAD_MAX_FILE_SIZE_MB_PADRAO
    });
    setArquivosNova(proximoEstado);
    if (rejeitados.length > 0) {
      // Modal aberto: o aviso tem de nascer DENTRO dele.
      avisarModal.alerta(montarMensagemArquivosAcimaDoLimite(rejeitados, UPLOAD_MAX_FILE_SIZE_MB_PADRAO));
    }
  }, [arquivosNova, avisarModal]);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const scrollChatToTop = useCallback(() => {
    if (mensagensContainerRef.current) {
      mensagensContainerRef.current.scrollTop = 0;
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const scrollToMessage = useCallback((msgId) => {
    const el = msgElemsRef.current[Number(msgId)];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    el.style.transition = 'background-color 0.15s ease';
    el.style.backgroundColor = 'color-mix(in srgb, var(--c-primary) 18%, transparent)';
    el.style.borderRadius = 'var(--raio-2)';
    setTimeout(() => {
      el.style.backgroundColor = '';
      el.style.borderRadius = '';
    }, 1400);
  }, []);

  useEffect(() => {
    mensagensRef.current = mensagens;
  }, [mensagens]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  // A altura útil dos painéis é MEDIDA (mesma classe de medida que o Pagina
  // faz com a topbar real), nunca escrita: o cabeçalho fixo, a faixa de
  // avisos e a barra de filtros mudam de altura conforme o estado.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let raf = null;
    const medir = () => {
      raf = null;
      const el = paineisRef.current;
      if (!el) return;
      const topo = el.getBoundingClientRect().top + window.scrollY;
      const disponivel = window.innerHeight - topo - RESPIRO_INFERIOR;
      setAlturaPaineis(Math.max(ALTURA_MINIMA_PAINEIS, Math.round(disponivel)));
    };
    const agendar = () => { if (raf == null) raf = requestAnimationFrame(medir); };
    agendar();
    window.addEventListener('resize', agendar);
    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      window.removeEventListener('resize', agendar);
    };
  }, [avisos.length, isMobile, filtrosAtivos]);

  const carregarLista = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoadingLista(true);
      const params = { limit: 100 };
      if (mostrandoArquivadas) params.arquivadas = true;
      const data = await listarConversas(params);
      setConversas(data?.items || []);
    } catch {
      // silencioso
    } finally {
      if (!silent) setLoadingLista(false);
    }
  }, [mostrandoArquivadas]);

  useEffect(() => {
    carregarLista();
    const interval = setInterval(() => carregarLista(true), LIST_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [carregarLista]);



  const abrirConversa = useCallback(async (conv) => {
    /*
      O ENDERECO PASSA A DIZER QUAL CONVERSA ESTA ABERTA.

      Antes a URL ficava parada na entrada da tela qualquer que fosse a
      conversa escolhida: recarregar a pagina perdia o lugar, e mandar o link para um
      colega mandava ele para a lista. `replace` em vez de `push` para o
      botao de voltar do navegador sair da tela, e nao percorrer uma a uma
      as conversas que a pessoa abriu.
    */
    idJaAplicado.current = String(conv.id);
    navigate(`/conversas/${conv.id}`, { replace: true });
    setConversaAtiva(conv.id);
    setMensagens([]);
    setTemMais(false);
    setOldestId(null);
    setTexto('');
    setArquivos([]);
    setParticipantesLeitura([]);
    setMenuMsgId(null);
    setInfoMsg(null);
    setMensagemRespondendo(null);
    setMobileModo('chat');
    setLoadingChat(true);
    try {
      const [det, msgs] = await Promise.all([
        getConversa(conv.id),
        getMensagens(conv.id, { limit: 50 })
      ]);
      setDetalhe(det);
      setMensagens(msgs?.mensagens || []);
      setTemMais(!!msgs?.tem_mais);
      setOldestId(msgs?.oldest_id || null);
      setParticipantesLeitura(msgs?.participantes_leitura || []);
      await marcarLida(conv.id).catch(() => {});
      setConversas((prev) => prev.map((c) => c.id === conv.id ? { ...c, tem_novidade: false } : c));
    } catch {
      // erro ao carregar
    } finally {
      setLoadingChat(false);
      setTimeout(scrollChatToTop, 100);
    }
  }, [scrollChatToTop]);

  /*
    ESTE EFEITO FICA DEPOIS DO `abrirConversa` DE PROPOSITO.

    Ele o cita na lista de dependencias, e `const` nao sofre hoisting: posto
    antes, o componente estoura com "Cannot access 'abrirConversa' before
    initialization" NA EXECUCAO — com o build passando. E a mesma classe de
    defeito da R22 (hook usado sem import), e nenhum check estatico daqui a
    pega. Escrevi assim na primeira versao e so vi relendo.
  */
  /*
    ABRE A CONVERSA PEDIDA NA URL, uma vez, quando a lista chega.

    `idJaAplicado` existe para o endereco nao reabrir a conversa a cada
    recarga da lista (que roda em intervalo): sem ele, quem trocasse de
    conversa seria puxado de volta para a da URL no proximo ciclo.

    So numero: hoje `conversas/:id` nao tem rota irma com segmento estatico
    (as duas que existiam foram removidas em 04/09 por nao recortarem nada),
    mas se alguem criar uma amanha, "entrada" nao pode virar id de conversa.
  */
  useEffect(() => {
    if (!idDaUrl || !/^\d+$/.test(idDaUrl)) return;
    if (idJaAplicado.current === idDaUrl) return;
    const alvo = conversas.find((c) => String(c.id) === String(idDaUrl));
    if (!alvo) return;
    idJaAplicado.current = idDaUrl;
    abrirConversa(alvo);
  }, [idDaUrl, conversas, abrirConversa]);

  const carregarMais = useCallback(async () => {
    if (!conversaAtiva || !oldestId || loadingMais) return;
    setLoadingMais(true);
    try {
      const data = await getMensagens(conversaAtiva, { before_id: oldestId, limit: 50 });
      setMensagens((prev) => [...(data?.mensagens || []), ...prev]);
      setTemMais(!!data?.tem_mais);
      setOldestId(data?.oldest_id || null);
      if (data?.participantes_leitura) setParticipantesLeitura(data.participantes_leitura);
    } catch {
      // erro
    } finally {
      setLoadingMais(false);
    }
  }, [conversaAtiva, oldestId, loadingMais]);

  const carregarNovasMensagens = useCallback(async () => {
    if (!conversaAtiva || loadingChat) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    const ultimaMensagem = mensagensRef.current[mensagensRef.current.length - 1];
    const afterId = Number(ultimaMensagem?.id || 0);
    if (!afterId) return;

    try {
      const data = await getMensagens(conversaAtiva, { after_id: afterId, limit: 50 });
      if (data?.participantes_leitura) setParticipantesLeitura(data.participantes_leitura);
      const novas = data?.mensagens || [];
      if (!novas.length) return;

      setMensagens((prev) => {
        const existentes = new Set(prev.map((m) => Number(m.id)));
        return [...prev, ...novas.filter((m) => !existentes.has(Number(m.id)))];
      });

      const ultimaNova = novas[novas.length - 1];
      const previewAutor = Number(ultimaNova.usuario_id) === Number(userId) ? 'Voce' : (ultimaNova.autor?.nome || 'Mensagem');
      setConversas((prev) =>
        prev.map((c) => c.id === conversaAtiva
          ? {
              ...c,
              last_message_at: ultimaNova.createdAt || new Date().toISOString(),
              last_message_preview: `${previewAutor}: ${ultimaNova.mensagem || ''}`,
              tem_novidade: false
            }
          : c
        ).sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0))
      );

      await marcarLida(conversaAtiva).catch(() => {});
      setTimeout(scrollToBottom, 50);
    } catch {
      // polling silencioso para nao interromper o usuario durante digitacao
    }
  }, [conversaAtiva, loadingChat, scrollToBottom, userId]);

  useEffect(() => {
    if (!conversaAtiva) return undefined;
    const interval = setInterval(carregarNovasMensagens, ACTIVE_CHAT_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [conversaAtiva, carregarNovasMensagens]);

  const enviar = useCallback(async () => {
    if (!conversaAtiva || enviando) return;
    const msg = texto.trim();
    if (!msg && arquivos.length === 0) return;
    setEnviando(true);
    const textoEnviado = msg;
    const arquivosEnviados = arquivos;
    const citacaoAtual = mensagemRespondendo;
    setTexto('');
    setArquivos([]);
    setMensagemRespondendo(null);
    try {
      const nova = await enviarMensagemConversa(
        conversaAtiva,
        textoEnviado,
        extrairFilesAnexosPendentes(arquivosEnviados),
        citacaoAtual?.id || null
      );
      setMensagens((prev) => [...prev, {
        id: nova.id,
        conversa_id: conversaAtiva,
        usuario_id: userId,
        mensagem: nova.mensagem || textoEnviado,
        createdAt: nova.createdAt || new Date().toISOString(),
        editada_em: null,
        pode_editar: true,
        pode_deletar: true,
        citacao_id: nova.citacao_id || citacaoAtual?.id || null,
        citacao: nova.citacao || (citacaoAtual ? { id: citacaoAtual.id, mensagem: citacaoAtual.mensagem, autor: citacaoAtual.autor || null } : null),
        autor: { id: userId, nome: user?.nome },
        anexos: []
      }]);
      const agora = new Date().toISOString();
      setConversas((prev) =>
        prev.map((c) => c.id === conversaAtiva
          ? { ...c, last_message_at: agora, last_message_preview: `Você: ${textoEnviado}`, tem_novidade: false }
          : c
        ).sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0))
      );
      setTimeout(scrollToBottom, 50);
    } catch (err) {
      setTexto(textoEnviado);
      setArquivos(arquivosEnviados);
      avisar.erro(err?.message || 'Erro ao enviar mensagem');
    } finally {
      setEnviando(false);
      inputRef.current?.focus();
    }
  }, [conversaAtiva, enviando, texto, arquivos, mensagemRespondendo, userId, user, scrollToBottom, avisar]);

  const deletarMensagem = useCallback(async (msgId) => {
    // O retorno de confirmar() é OBJETO — desestruturar é obrigatório (R21):
    // lido como booleano, "Cancelar" seguiria com a exclusão.
    const { ok } = await confirmar({
      titulo: 'Excluir mensagem',
      mensagem: 'Excluir esta mensagem da conversa? Ela deixa de aparecer para todos os participantes.',
      rotuloConfirmar: 'Excluir',
      destrutiva: true
    });
    if (!ok) return;
    try {
      await deletarMensagemConversa(msgId);
      setMensagens((prev) => prev.filter((m) => m.id !== msgId));
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao excluir mensagem');
    }
  }, [confirmar, avisar]);

  const salvarEdicao = useCallback(async () => {
    if (!editandoId) return;
    const txt = textoEdicao.trim();
    if (!txt) return;
    try {
      await editarMensagemConversa(editandoId, txt);
      setMensagens((prev) => prev.map((m) => m.id === editandoId ? { ...m, mensagem: txt, editada_em: new Date().toISOString() } : m));
      setEditandoId(null);
      setTextoEdicao('');
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao editar');
    }
  }, [editandoId, textoEdicao, avisar]);

  /*
    CONCLUIR, REABRIR E ADICIONAR PARTICIPANTES — portadas em 04/09.

    ARQUIVAR NAO E CONCLUIR, e o texto tem de dizer isso a quem clica:
    arquivar TIRA DA VISTA (some da caixa, volta com um filtro); concluir
    ENCERRA O ASSUNTO (a conversa fica marcada como resolvida para todos os
    participantes). Sao coisas diferentes e por isso convivem na faixa.

    As duas mudam ESTADO da conversa para todo mundo, entao passam pelo
    modal do sistema. O `confirm()` do navegador que a tela antiga usava nao
    serve: e caixa cinza fora do tema (R19) e — pior — o retorno de
    `confirmar()` e OBJETO, entao ler como booleano faria "Cancelar"
    concluir a conversa do mesmo jeito (R21).

    Permissao: as tres rotas do backend exigem `allowComunicacaoSend`, o
    mesmo gate de `podeEnviarComunicacao`. Botao que a pessoa nao pode usar
    nao aparece — falhar depois do clique e pior que nao oferecer.
  */
  const conversaConcluida = detalhe?.status === 'CONCLUIDA';

  const handleConcluir = useCallback(async () => {
    if (!conversaAtiva) return;
    const { ok } = await confirmar({
      titulo: 'Concluir conversa',
      mensagem: 'Encerrar o assunto desta conversa? Ela fica marcada como concluída para todos os participantes. Isso e diferente de arquivar, que apenas tira a conversa da sua caixa.',
      rotuloConfirmar: 'Concluir'
    });
    if (!ok) return;
    try {
      await concluirConversa(conversaAtiva);
      const det = await getConversa(conversaAtiva);
      setDetalhe(det);
      await carregarLista(true);
      avisar.sucesso('Conversa concluída.');
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao concluir conversa');
    }
  }, [conversaAtiva, confirmar, carregarLista, avisar]);

  const handleReabrir = useCallback(async () => {
    if (!conversaAtiva) return;
    const { ok } = await confirmar({
      titulo: 'Reabrir conversa',
      mensagem: 'Reabrir esta conversa? Ela volta a constar como em andamento para todos os participantes.',
      rotuloConfirmar: 'Reabrir'
    });
    if (!ok) return;
    try {
      await reabrirConversa(conversaAtiva);
      const det = await getConversa(conversaAtiva);
      setDetalhe(det);
      await carregarLista(true);
      avisar.sucesso('Conversa reaberta.');
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao reabrir conversa');
    }
  }, [conversaAtiva, confirmar, carregarLista, avisar]);

  const [showParticipantes, setShowParticipantes] = useState(false);
  const [candidatosParticipantes, setCandidatosParticipantes] = useState([]);
  const [novosParticipantesIds, setNovosParticipantesIds] = useState([]);

  const abrirAdicionarParticipantes = useCallback(async () => {
    if (!conversaAtiva) return;
    try {
      const usuarios = await getDestinatariosConversa();
      const jaEstao = new Set((detalhe?.participantes || []).map((p) => Number(p.usuario_id)));
      setCandidatosParticipantes((Array.isArray(usuarios) ? usuarios : [])
        .filter((u) => !jaEstao.has(Number(u.id))));
      setNovosParticipantesIds([]);
      setShowParticipantes(true);
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao carregar usuarios');
    }
  }, [conversaAtiva, detalhe, avisar]);

  const confirmarAdicionarParticipantes = useCallback(async () => {
    if (novosParticipantesIds.length === 0) {
      avisar.erro('Selecione ao menos uma pessoa.');
      return;
    }
    try {
      await adicionarParticipantesConversa(conversaAtiva, novosParticipantesIds);
      setShowParticipantes(false);
      const det = await getConversa(conversaAtiva);
      setDetalhe(det);
      avisar.sucesso(`${novosParticipantesIds.length} pessoa(s) adicionada(s) a conversa.`);
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao adicionar participantes');
    }
  }, [conversaAtiva, novosParticipantesIds, avisar]);

  const handleArquivar = useCallback(async () => {
    if (!conversaAtiva) return;
    try {
      await arquivarConversasEmMassa([conversaAtiva]);
      setConversaAtiva(null);
      setDetalhe(null);
      setMensagens([]);
      setMobileModo('lista');
      await carregarLista();
      avisar.sucesso('Conversa arquivada.');
    } catch (err) { avisar.erro(err?.message || 'Erro ao arquivar a conversa'); }
  }, [conversaAtiva, carregarLista, avisar]);

  const handleDesarquivar = useCallback(async () => {
    if (!conversaAtiva) return;
    try {
      await desarquivarConversasEmMassa([conversaAtiva]);
      setConversaAtiva(null);
      setDetalhe(null);
      setMensagens([]);
      setMobileModo('lista');
      await carregarLista();
      avisar.sucesso('Conversa desarquivada.');
    } catch (err) { avisar.erro(err?.message || 'Erro ao desarquivar a conversa'); }
  }, [conversaAtiva, carregarLista, avisar]);

  const limparConversaAberta = useCallback(() => {
    setConversaAtiva(null);
    setDetalhe(null);
    setMensagens([]);
    setMobileModo('lista');
  }, []);

  const aoAlternarFiltro = useCallback((dimensao, valor, opcoes) => {
    setFiltrosAtivos((atual) => alternarValorFiltro(atual, dimensao, valor, opcoes));
    limparConversaAberta();
  }, [limparConversaAberta]);

  const limparFiltros = useCallback(() => {
    setFiltrosAtivos({});
    limparConversaAberta();
  }, [limparConversaAberta]);

  const abrirModalNova = useCallback(async () => {
    setShowNova(true);
    setModoMassa(false);
    setAssuntoNova('');
    setMensagemNova('');
    setDestinatarioId('');
    setDestinatariosMassaIds([]);
    setSetoresMassaIds([]);
    setArquivosNova([]);
    limparAvisosModal();
    try {
      const [dests, sets] = await Promise.all([getDestinatariosConversa(), getSetores()]);
      setDestinatarios(dests || []);
      setSetores(sets || []);
    } catch { /* silencioso */ }
  }, [limparAvisosModal]);

  const fecharModalNova = useCallback(() => {
    if (salvando) return;
    setShowNova(false);
    limparAvisosModal();
  }, [salvando, limparAvisosModal]);

  const salvarNovaConversa = useCallback(async (e) => {
    e?.preventDefault();
    if (!assuntoNova.trim()) { avisarModal.alerta('Informe o assunto'); return; }
    if (!mensagemNova.trim() && arquivosNova.length === 0) { avisarModal.alerta('Informe a mensagem ou anexo'); return; }
    setSalvando(true);
    try {
      if (modoMassa) {
        if (destinatariosMassaIds.length === 0 && setoresMassaIds.length === 0) {
          avisarModal.alerta('Selecione ao menos um destinatário ou setor');
          setSalvando(false);
          return;
        }
        await criarConversaEmMassa({
          assunto: assuntoNova, mensagem: mensagemNova,
          destinatarios_ids: destinatariosMassaIds,
          setores_ids: setoresMassaIds,
          files: extrairFilesAnexosPendentes(arquivosNova)
        });
        setShowNova(false);
        limparAvisosModal();
        await carregarLista();
        avisar.sucesso('Conversas criadas.');
      } else {
        if (!destinatarioId) { avisarModal.alerta('Selecione um destinatário'); setSalvando(false); return; }
        const res = await criarConversa({
          destinatario_id: destinatarioId,
          assunto: assuntoNova,
          mensagem: mensagemNova,
          files: extrairFilesAnexosPendentes(arquivosNova)
        });
        setShowNova(false);
        limparAvisosModal();
        const lista = await listarConversas({ limit: 100 });
        const items = lista?.items || [];
        setConversas(items);
        const found = items.find((c) => c.id === res?.id);
        if (found) abrirConversa(found);
      }
    } catch (err) {
      avisarModal.erro(err?.message || 'Erro ao criar conversa');
    } finally {
      setSalvando(false);
    }
  }, [assuntoNova, mensagemNova, arquivosNova, modoMassa, destinatarioId, destinatariosMassaIds, setoresMassaIds, carregarLista, abrirConversa, avisar, avisarModal, limparAvisosModal]);

  const conversasFiltradas = conversas
    .filter((c) => {
      if (!busca) return true;
      const q = busca.toLowerCase();
      return nomeConversa(c, userId).toLowerCase().includes(q) || (c.assunto || '').toLowerCase().includes(q);
    })
    .sort((a, b) => timestampConversa(b) - timestampConversa(a));

  const mostrarLista = !isMobile || mobileModo === 'lista';
  const mostrarChat = !isMobile || mobileModo === 'chat';

  // C5 — três pesos, todas visíveis: primária sólida (nova conversa) e
  // secundária em contorno (arquivar/desarquivar a conversa aberta). A tela
  // não tem ação destrutiva de PÁGINA: excluir é por mensagem, no menu da
  // própria bolha — e ação que não existe não se inventa.
  /*
    A FAIXA GANHA AS TRES PORTADAS (04/09), na ordem do uso.

    "Concluir" e "Reabrir" nunca aparecem juntas — sao os dois lados do
    mesmo estado. Nenhuma delas e destrutiva: concluir nao apaga nada, e
    reabrir desfaz. Por isso as duas ficam em contorno, ao lado de arquivar,
    e nao no vermelho suave.

    Sem permissao de envio, nenhuma aparece: as tres rotas do backend
    exigem `allowComunicacaoSend`.
  */
  const acoesDaConversa = !conversaAtiva || !podeEnviarComunicacao ? [] : [
    conversaConcluida
      ? { rotulo: 'Reabrir conversa', onClick: handleReabrir, icone: <HiOutlineArrowUturnLeft aria-hidden="true" /> }
      : { rotulo: 'Concluir conversa', onClick: handleConcluir, icone: <HiOutlineCheckCircle aria-hidden="true" /> },
    { rotulo: 'Adicionar participantes', onClick: abrirAdicionarParticipantes, icone: <HiOutlineUserPlus aria-hidden="true" /> }
  ];

  const secundarias = conversaAtiva
    ? [...acoesDaConversa, mostrandoArquivadas
      ? { rotulo: 'Desarquivar conversa', onClick: handleDesarquivar, icone: <HiOutlineArrowUturnLeft aria-hidden="true" /> }
      : { rotulo: 'Arquivar conversa', onClick: handleArquivar, icone: <HiOutlineArchiveBox aria-hidden="true" /> }]
    : [];

  return (
    <Pagina>
      <PageHeader
        titulo="Comunicação Interna"
        contagem={loadingLista ? null : `${conversasFiltradas.length} conversa(s)`}
        descricao="Mensagens entre usuários e setores da empresa."
        acaoPrincipal={podeEnviarComunicacao && !mostrandoArquivadas
          ? { rotulo: 'Nova conversa', onClick: abrirModalNova }
          : null}
        secundarias={secundarias}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BarraFiltros
        busca={{ valor: busca, aoMudar: setBusca, placeholder: 'Buscar por pessoa, setor ou assunto' }}
        filtros={[DIMENSAO_SITUACAO]}
        ativos={filtrosAtivos}
        aoAlternar={aoAlternarFiltro}
        aoLimpar={limparFiltros}
      />

      {/* Dois painéis lado a lado no desktop, um de cada vez no celular.
          Grade com trilhas minmax(0, …): é o que deixa o texto truncar sem
          medida à mão. A largura da coluna da lista é 20 degraus de 16px. */}
      <div
        ref={paineisRef}
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'calc(var(--esp-4) * 20) minmax(0, 1fr)',
          gap: 'var(--esp-4)',
          height: alturaPaineis ? `${alturaPaineis}px` : undefined
        }}
      >
        {/* === PAINEL ESQUERDO — lista === */}
        <section
          aria-label="Conversas"
          className={CLASSE_PAINEL}
          style={{
            ...ESTILO_PAINEL,
            display: mostrarLista ? 'grid' : 'none',
            gridTemplateRows: 'minmax(0, 1fr)'
          }}
        >
          <div style={{ overflowY: 'auto' }}>
            {loadingLista && (
              <p style={{ paddingBlock: 'var(--esp-8)', paddingInline: 'var(--esp-4)', textAlign: 'center', color: 'var(--c-muted)', fontSize: 'var(--fonte-corpo)' }}>
                Carregando...
              </p>
            )}
            {!loadingLista && conversasFiltradas.length === 0 && (
              <div style={{ paddingBlock: 'var(--esp-8)', paddingInline: 'var(--esp-4)', textAlign: 'center', color: 'var(--c-muted)', fontSize: 'var(--fonte-corpo)' }}>
                <p>{mostrandoArquivadas ? 'Nenhuma conversa arquivada' : 'Nenhuma conversa'}</p>
                {podeEnviarComunicacao && !mostrandoArquivadas ? (
                  <button
                    type="button"
                    onClick={abrirModalNova}
                    className="btn btn-outline"
                    style={{ marginBlockStart: 'var(--esp-3)' }}
                  >
                    Criar nova conversa
                  </button>
                ) : null}
              </div>
            )}
            {conversasFiltradas.map((conv) => {
              const ativa = conv.id === conversaAtiva;
              const nome = nomeConversa(conv, userId);
              const setor = setorConversa(conv, userId);
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => abrirConversa(conv)}
                  aria-current={ativa ? 'true' : undefined}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    display: 'grid',
                    gridTemplateColumns: 'auto minmax(0, 1fr)',
                    gap: 'var(--esp-3)',
                    alignItems: 'start',
                    paddingBlock: 'var(--esp-3)',
                    paddingInline: 'var(--esp-3)',
                    background: ativa ? 'color-mix(in srgb, var(--c-primary) 10%, transparent)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                    border: 'none',
                    borderBottom: '1px solid var(--ui-border)',
                    color: 'var(--c-text)'
                  }}
                  onMouseEnter={(e) => { if (!ativa) e.currentTarget.style.background = 'var(--ui-surface-soft)'; }}
                  onMouseLeave={(e) => { if (!ativa) e.currentTarget.style.background = 'transparent'; }}
                >
                  <AvatarConversa conv={conv} />
                  <span style={{ display: 'grid', gap: 'var(--esp-1)' }}>
                    <span style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 'var(--esp-2)' }}>
                      <span style={{ ...ESTILO_TRUNCADO, fontSize: 'var(--fonte-corpo)', fontWeight: conv.tem_novidade ? 700 : 500, color: 'var(--c-text)' }}>
                        {nome}{setor ? ` (${setor})` : ''}
                      </span>
                      <span style={{ fontSize: 'var(--fonte-detalhe)', color: 'var(--c-muted)', flexShrink: 0 }}>{formatHora(conv.last_message_at)}</span>
                    </span>
                    <span style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 'var(--esp-2)' }}>
                      <span style={{ ...ESTILO_TRUNCADO, fontSize: 'var(--fonte-detalhe)', color: 'var(--c-muted)' }}>
                        {conv.last_message_preview || conv.assunto}
                      </span>
                      {conv.tem_novidade && (
                        <span
                          title="Mensagem não lida"
                          style={{ width: 'var(--esp-2)', height: 'var(--esp-2)', borderRadius: '50%', background: 'var(--c-primary)' }}
                        />
                      )}
                    </span>
                    {conv.status === 'CONCLUIDA' && (
                      <span style={{ justifySelf: 'start', fontSize: 'var(--fonte-detalhe)', color: 'var(--c-muted)', background: 'var(--ui-surface-soft)', paddingInline: 'var(--esp-2)', borderRadius: 'var(--raio-1)' }}>
                        concluída
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* === PAINEL DIREITO — chat === */}
        <section
          aria-label="Conversa"
          className={CLASSE_PAINEL_PRIMARIO}
          style={{
            ...ESTILO_PAINEL,
            display: mostrarChat ? 'grid' : 'none',
            gridTemplateRows: conversaAtiva ? 'auto minmax(0, 1fr) auto' : 'minmax(0, 1fr)'
          }}
        >
          {!conversaAtiva ? (
            <div style={{ display: 'grid', justifyItems: 'center', alignContent: 'center', gap: 'var(--esp-3)', color: 'var(--c-muted)', paddingBlock: 'var(--esp-4)', paddingInline: 'var(--esp-4)' }}>
              <HiOutlineChatBubbleLeftRight size={40} aria-hidden="true" style={{ opacity: 0.35 }} />
              <span style={{ fontSize: 'var(--fonte-corpo)' }}>Selecione uma conversa ou crie uma nova</span>
              {!mostrandoArquivadas && podeEnviarComunicacao && (
                <button type="button" onClick={abrirModalNova} className="btn btn-outline">Nova conversa</button>
              )}
            </div>
          ) : (
            <>
              {/* Cabeçalho da conversa — contexto do painel, não da página:
                  identidade de quem está do outro lado + assunto. */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? 'auto auto minmax(0, 1fr)' : 'auto minmax(0, 1fr)',
                  alignItems: 'center',
                  gap: 'var(--esp-3)',
                  paddingBlock: 'var(--esp-2)',
                  paddingInline: 'var(--esp-4)',
                  borderBottom: '1px solid var(--ui-border)',
                  background: 'var(--ui-surface)'
                }}
              >
                {isMobile && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setMobileModo('lista')}
                    title="Voltar para a lista de conversas"
                    aria-label="Voltar para a lista de conversas"
                  >
                    <HiOutlineChevronLeft aria-hidden="true" />
                  </button>
                )}
                <AvatarConversa conv={detalhe?.conversa} />
                <div>
                  <p style={{ ...ESTILO_TRUNCADO, fontSize: 'var(--fonte-corpo)', fontWeight: 600, color: 'var(--c-text)', marginBlock: 0 }}>
                    {nomeConversa(detalhe?.conversa, userId)}
                  </p>
                  <p style={{ ...ESTILO_TRUNCADO, fontSize: 'var(--fonte-detalhe)', color: 'var(--c-muted)', marginBlock: 0 }}>
                    {detalhe?.conversa?.assunto}
                  </p>
                </div>
              </div>

              {/* Área de mensagens */}
              <div
                ref={mensagensContainerRef}
                style={{
                  overflowY: 'auto',
                  paddingBlock: 'var(--esp-3)',
                  paddingInline: 'var(--esp-4)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--esp-1)',
                  background: 'var(--ui-canvas)'
                }}
              >
                {loadingChat ? (
                  <p style={{ margin: 'auto', color: 'var(--c-muted)', fontSize: 'var(--fonte-corpo)' }}>Carregando...</p>
                ) : (
                  <>
                    {/* Spacer empurra mensagens para baixo quando há poucas */}
                    <div style={{ flex: 1 }} />
                    {temMais && (
                      <div style={{ display: 'flex', justifyContent: 'center', paddingBlock: 'var(--esp-2)' }}>
                        <button
                          type="button"
                          onClick={carregarMais}
                          disabled={loadingMais}
                          className="btn btn-outline"
                        >
                          {loadingMais ? 'Carregando...' : 'Carregar mensagens anteriores'}
                        </button>
                      </div>
                    )}
                    {menuMsgId && (
                      <div
                        aria-hidden="true"
                        style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-conteudo)' }}
                        onClick={() => setMenuMsgId(null)}
                      />
                    )}
                    {mensagens.map((msg) => {
                      const euSou = msg.usuario_id === userId;
                      const menuAberto = menuMsgId === msg.id;
                      const vista = euSou && isMensagemVista(msg, participantesLeitura, userId);
                      const corSobreBolha = euSou ? 'var(--app-inverse-color)' : 'var(--c-text)';
                      const fundoRealce = euSou
                        ? 'color-mix(in srgb, var(--app-inverse-color) 16%, transparent)'
                        : 'var(--ui-surface-soft)';
                      return (
                        <div
                          key={msg.id}
                          ref={(el) => { if (el) msgElemsRef.current[Number(msg.id)] = el; else delete msgElemsRef.current[Number(msg.id)]; }}
                          style={{ display: 'flex', justifyContent: euSou ? 'flex-end' : 'flex-start' }}
                        >
                          <div style={{ position: 'relative', maxWidth: '72%' }}>
                            {/* R15/M1: o alvo do menu é sempre visível e tem o
                                alvo mínimo de clique (32px), não um disco de 18. */}
                            <button
                              type="button"
                              title="Ações da mensagem"
                              aria-label="Ações da mensagem"
                              aria-expanded={menuAberto}
                              ref={menuAberto ? botaoMsgRef : undefined}
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuMsgId(menuAberto ? null : msg.id);
                              }}
                              style={{
                                position: 'absolute',
                                top: 0,
                                right: 0,
                                zIndex: 'var(--z-conteudo-acima)',
                                width: 'var(--alvo-clique)',
                                height: 'var(--alvo-clique)',
                                borderRadius: '50%',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: corSobreBolha,
                                opacity: 0.75,
                                lineHeight: 1
                              }}
                            >▾</button>

                            {/* Dropdown menu — direção dinâmica */}
                            {menuAberto && posicaoMsg && (
                              <div ref={menuMsgRef} style={{
                                ...posicaoMsg.estilo,
                                zIndex: 'var(--z-conteudo-topo)',
                                background: 'var(--ui-surface)',
                                border: '1px solid var(--ui-border)',
                                borderRadius: 'var(--raio-1)',
                                boxShadow: 'var(--ui-shadow-md)',
                                minWidth: 'calc(var(--esp-4) * 10)',
                                overflow: 'clip'
                              }}>
                                {podeEnviarComunicacao ? (
                                  <button
                                    type="button"
                                    onClick={() => { setMensagemRespondendo(msg); setMenuMsgId(null); inputRef.current?.focus(); }}
                                    style={{ ...ESTILO_ITEM_MENU, color: 'var(--c-text)' }}
                                  ><HiOutlineArrowUturnLeft aria-hidden="true" /> Responder</button>
                                ) : null}
                                {podeEnviarComunicacao && msg.pode_editar && (
                                  <button
                                    type="button"
                                    onClick={() => { setEditandoId(msg.id); setTextoEdicao(msg.mensagem); setMenuMsgId(null); }}
                                    style={{ ...ESTILO_ITEM_MENU, color: 'var(--c-text)' }}
                                  ><HiOutlinePencil aria-hidden="true" /> Editar</button>
                                )}
                                {podeEnviarComunicacao && msg.pode_deletar && (
                                  <button
                                    type="button"
                                    onClick={() => { deletarMensagem(msg.id); setMenuMsgId(null); }}
                                    style={{ ...ESTILO_ITEM_MENU, color: 'var(--c-danger)' }}
                                  ><HiOutlineTrash aria-hidden="true" /> Excluir</button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => { setInfoMsg(msg); setMenuMsgId(null); }}
                                  style={{ ...ESTILO_ITEM_MENU, color: 'var(--c-text)', borderTop: '1px solid var(--ui-border)' }}
                                ><HiOutlineInformationCircle aria-hidden="true" /> Informações</button>
                              </div>
                            )}

                            {/* Bolha */}
                            <div style={{
                              borderRadius: euSou
                                ? 'var(--raio-3) var(--raio-3) var(--esp-1) var(--raio-3)'
                                : 'var(--raio-3) var(--raio-3) var(--raio-3) var(--esp-1)',
                              paddingBlock: 'var(--esp-2)',
                              paddingInline: 'var(--esp-3)',
                              fontSize: 'var(--fonte-corpo)',
                              lineHeight: 'var(--lh-corpo)',
                              background: euSou ? 'var(--c-primary)' : 'var(--ui-surface)',
                              color: corSobreBolha,
                              border: euSou ? 'none' : '1px solid var(--ui-border)',
                              boxShadow: 'var(--ui-shadow-sm)'
                            }}>
                              {!euSou && (
                                <p style={{ fontSize: 'var(--fonte-detalhe)', fontWeight: 700, marginBlockEnd: 'var(--esp-1)', color: 'var(--c-primary)' }}>{msg.autor?.nome}</p>
                              )}
                              {msg.citacao && (
                                // A1: a citação leva à mensagem original, então
                                // é botão de verdade — foco e Enter/Espaço de
                                // graça, sem tabIndex à mão.
                                <button
                                  type="button"
                                  onClick={() => scrollToMessage(msg.citacao.id)}
                                  title="Ir para a mensagem citada"
                                  style={{
                                    display: 'block',
                                    width: '100%',
                                    textAlign: 'left',
                                    background: fundoRealce,
                                    border: 'none',
                                    borderInlineStart: `4px solid ${euSou ? 'var(--app-inverse-color)' : 'var(--c-primary)'}`,
                                    borderRadius: 'var(--raio-1)',
                                    paddingBlock: 'var(--esp-1)',
                                    paddingInline: 'var(--esp-2)',
                                    marginBlockEnd: 'var(--esp-2)',
                                    cursor: 'pointer',
                                    color: corSobreBolha,
                                    overflow: 'clip'
                                  }}
                                >
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--esp-2)', marginBlockEnd: 'var(--esp-1)', overflow: 'clip' }}>
                                    <span style={{ ...ESTILO_TRUNCADO, fontSize: 'var(--fonte-detalhe)', fontWeight: 700 }}>
                                      {euSou ? 'Você' : (msg.autor?.nome || 'Alguém')}
                                    </span>
                                    <span style={{ fontSize: 'var(--fonte-detalhe)', opacity: 0.7, flexShrink: 0 }}>respondeu</span>
                                    <span style={{ ...ESTILO_TRUNCADO, fontSize: 'var(--fonte-detalhe)', fontWeight: 700 }}>
                                      {msg.citacao.autor?.nome || 'Mensagem'}
                                    </span>
                                  </span>
                                  <span style={{ fontSize: 'var(--fonte-detalhe)', opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                    {msg.citacao.mensagem}
                                  </span>
                                </button>
                              )}
                              {editandoId === msg.id ? (
                                <div style={{ display: 'grid', gap: 'var(--esp-2)' }}>
                                  <textarea
                                    className="input"
                                    rows={2}
                                    aria-label="Editar mensagem"
                                    style={{ resize: 'none', color: 'var(--c-text)' }}
                                    value={textoEdicao}
                                    onChange={(e) => setTextoEdicao(e.target.value)}
                                  />
                                  <div style={{ display: 'flex', gap: 'var(--esp-2)' }}>
                                    <button type="button" onClick={salvarEdicao} className="btn btn-primary btn-sm">Salvar</button>
                                    <button type="button" onClick={() => setEditandoId(null)} className="btn btn-outline btn-sm">Cancelar</button>
                                  </div>
                                </div>
                              ) : (
                                <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBlock: 0, paddingInlineEnd: 'var(--esp-6)' }}>{msg.mensagem}</p>
                              )}
                              {msg.anexos?.length > 0 && (
                                <div style={{ marginBlockStart: 'var(--esp-2)', display: 'grid', gap: 'var(--esp-1)', justifyItems: 'start' }}>
                                  {msg.anexos.map((a) => (
                                    <button
                                      key={a.id}
                                      type="button"
                                      onClick={() => abrirAnexoConversa(a)}
                                      style={{
                                        fontSize: 'var(--fonte-detalhe)',
                                        color: corSobreBolha,
                                        textDecoration: 'underline',
                                        background: 'none',
                                        border: 'none',
                                        paddingBlock: 0,
                                        paddingInline: 0,
                                        minHeight: 'var(--alvo-clique)',
                                        textAlign: 'left',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      Anexo: {a.nome_arquivo}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--esp-1)', marginBlockStart: 'var(--esp-1)' }}>
                                <span style={{ fontSize: 'var(--fonte-detalhe)', opacity: 0.75 }}>
                                  {formatDataHora(msg.createdAt)}{msg.editada_em ? ' (editada)' : ''}
                                </span>
                                {euSou && <TicksMensagem vista={vista} />}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={chatEndRef} />
                  </>
                )}
              </div>

              {/* Composição da mensagem */}
              {podeEnviarComunicacao ? (
                <div style={{ borderTop: '1px solid var(--ui-border)', background: 'var(--ui-surface)', paddingBlock: 'var(--esp-3)', paddingInline: 'var(--esp-4)' }}>
                  {mensagemRespondendo && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto minmax(0, 1fr) auto',
                      alignItems: 'stretch',
                      marginBlockEnd: 'var(--esp-2)',
                      borderRadius: 'var(--raio-1)',
                      overflow: 'clip',
                      border: '1px solid var(--ui-border)',
                      background: 'var(--ui-surface-soft)'
                    }}>
                      <span style={{ width: 'var(--esp-1)', background: 'var(--c-primary)' }} />
                      <div style={{ paddingBlock: 'var(--esp-1)', paddingInline: 'var(--esp-3)' }}>
                        <p style={{ ...ESTILO_TRUNCADO, fontSize: 'var(--fonte-detalhe)', fontWeight: 700, color: 'var(--c-primary)', marginBlock: 0 }}>{mensagemRespondendo.autor?.nome || 'Mensagem'}</p>
                        <p style={{ fontSize: 'var(--fonte-detalhe)', color: 'var(--c-muted)', marginBlock: 0, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{mensagemRespondendo.mensagem}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMensagemRespondendo(null)}
                        className="btn btn-outline"
                        title="Cancelar resposta"
                        aria-label="Cancelar resposta"
                        style={{ border: 'none', background: 'none' }}
                      >
                        <HiOutlineXMark aria-hidden="true" />
                      </button>
                    </div>
                  )}
                  <PendingAttachmentsList
                    items={arquivos}
                    onRemove={(index) => setArquivos((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                    className="mb-2 space-y-2"
                    itemClassName="flex items-center justify-between gap-3 rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm"
                    removeButtonClassName="text-[var(--c-danger)] font-semibold px-2"
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 'var(--esp-2)', alignItems: 'end' }}>
                    <textarea
                      ref={inputRef}
                      rows={1}
                      className="input"
                      aria-label="Mensagem"
                      placeholder="Digite uma mensagem... (Enter para enviar)"
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                      style={{ resize: 'none', maxHeight: 'calc(var(--esp-8) * 4)' }}
                    />
                    <label
                      className="btn btn-outline"
                      title="Anexar arquivos"
                      style={{ cursor: 'pointer' }}
                    >
                      <HiPaperClip aria-hidden="true" />
                      <span className="sr-only">Anexar arquivos</span>
                      <input
                        type="file"
                        multiple
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          adicionarArquivosConversa(e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={enviar}
                      disabled={enviando || (!texto.trim() && arquivos.length === 0)}
                      className="btn btn-primary"
                    >
                      {enviando ? 'Enviando...' : 'Enviar'}
                    </button>
                  </div>
                </div>
              ) : (
                <p style={{ borderTop: '1px solid var(--ui-border)', paddingBlock: 'var(--esp-3)', paddingInline: 'var(--esp-4)', color: 'var(--c-muted)', fontSize: 'var(--fonte-detalhe)', marginBlock: 0 }}>
                  Somente leitura. Solicite a permissão de enviar mensagens para responder ou iniciar conversas.
                </p>
              )}
            </>
          )}
        </section>
      </div>

      {/* === MODAL informações da mensagem === */}
      {infoMsg && (
        <OverlayModal
          rotulo="Informações da mensagem"
          largura="var(--modal-max-w-sm, 480px)"
          onFechar={() => setInfoMsg(null)}
        >
          <div className="flex items-center justify-between border-b border-[var(--ui-border)] px-4 py-3">
            <h2 className="app-bloco-titulo">Informações da mensagem</h2>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setInfoMsg(null)}>Fechar</button>
          </div>
          <div className="overflow-y-auto px-4 py-3">
            <div style={{ display: 'grid', gap: 'var(--esp-3)', fontSize: 'var(--fonte-corpo)' }}>
              <div>
                <span style={{ fontSize: 'var(--fonte-detalhe)', color: 'var(--c-muted)', display: 'block' }}>Enviada por</span>
                <span style={{ fontWeight: 500, color: 'var(--c-text)' }}>{infoMsg.autor?.nome || 'Desconhecido'}</span>
              </div>
              <div>
                <span style={{ fontSize: 'var(--fonte-detalhe)', color: 'var(--c-muted)', display: 'block' }}>Enviada em</span>
                <span style={{ color: 'var(--c-text)' }}>{formatDataHora(infoMsg.createdAt)}</span>
              </div>
              {infoMsg.editada_em && (
                <div>
                  <span style={{ fontSize: 'var(--fonte-detalhe)', color: 'var(--c-muted)', display: 'block' }}>Editada em</span>
                  <span style={{ color: 'var(--c-text)' }}>{formatDataHora(infoMsg.editada_em)}</span>
                </div>
              )}
              <div>
                <span style={{ fontSize: 'var(--fonte-detalhe)', color: 'var(--c-muted)', display: 'block' }}>Visualização</span>
                {(() => {
                  const msgTime = new Date(infoMsg.createdAt).getTime();
                  const leituras = participantesLeitura.filter(
                    (p) => p.usuario_id !== infoMsg.usuario_id && p.lida_em && new Date(p.lida_em).getTime() >= msgTime
                  );
                  if (leituras.length === 0) {
                    return <span style={{ color: 'var(--c-muted)', fontStyle: 'italic' }}>Ainda não visualizada</span>;
                  }
                  return leituras.map((p) => (
                    <span key={p.usuario_id} style={{ color: 'var(--c-primary)', display: 'block' }}>✓✓ {formatDataHora(p.lida_em)}</span>
                  ));
                })()}
              </div>
            </div>
          </div>
        </OverlayModal>
      )}

      {/* === MODAL adicionar participantes (portado da ConversaDetalhe) === */}
      {showParticipantes && podeEnviarComunicacao && (
        <OverlayModal
          rotulo="Adicionar participantes"
          largura="var(--modal-max-w-sm, 480px)"
          onFechar={() => setShowParticipantes(false)}
        >
          {/* R27: cabeçalho e rodapé ficam, o corpo rola. */}
          <div data-modal="cabecalho" className="flex items-center justify-between border-b border-[var(--ui-border)] px-4 py-3">
            <h2 className="app-bloco-titulo">Adicionar participantes</h2>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowParticipantes(false)}>Fechar</button>
          </div>

          <div className="px-4 py-3">
            <p className="app-note">
              Quem entrar passa a ver o histórico desta conversa desde o começo, não só as mensagens a partir de agora.
            </p>
            {candidatosParticipantes.length === 0 ? (
              <p className="text-sm text-muted">Todos os usuários disponíveis já participam desta conversa.</p>
            ) : (
              <div className="grid gap-1">
                {candidatosParticipantes.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={novosParticipantesIds.includes(u.id)}
                      onChange={() => setNovosParticipantesIds((atual) => (atual.includes(u.id)
                        ? atual.filter((x) => x !== u.id)
                        : [...atual, u.id]))}
                    />
                    <span>{u.nome}{u.area ? ` · ${u.area}` : ''}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div data-modal="rodape" className="app-actionbar border-t border-[var(--ui-border)] px-4 py-3">
            <button
              type="button"
              className="btn btn-primary"
              onClick={confirmarAdicionarParticipantes}
              disabled={novosParticipantesIds.length === 0}
            >
              Adicionar {novosParticipantesIds.length > 0 ? `(${novosParticipantesIds.length})` : ''}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setShowParticipantes(false)}>
              Cancelar
            </button>
          </div>
        </OverlayModal>
      )}

      {/* === MODAL nova conversa === */}
      {showNova && podeEnviarComunicacao && (
        <OverlayModal
          rotulo="Nova conversa"
          largura="var(--modal-max-w-md, 640px)"
          onFechar={fecharModalNova}
        >
          <div className="flex items-center justify-between border-b border-[var(--ui-border)] px-4 py-3">
            <h2 className="app-bloco-titulo">Nova conversa</h2>
            <button type="button" className="btn btn-outline btn-sm" onClick={fecharModalNova}>Fechar</button>
          </div>

          <form onSubmit={salvarNovaConversa} className="overflow-y-auto px-4 py-3">
            {/* R3: com o modal aberto, o aviso precisa nascer DENTRO dele —
                a faixa da página ficaria atrás do fundo escurecido. */}
            <Avisos avisos={avisosModal} aoFechar={fecharAvisoModal} />

            <div style={{ display: 'grid', gap: 'var(--esp-4)' }}>
              {/* Modo — seletor de CONTEXTO do formulário (R12 não se aplica:
                  não filtra lista, escolhe o tipo de envio). */}
              <div role="group" aria-label="Tipo de envio" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--esp-2)' }}>
                <button type="button" className={`btn ${!modoMassa ? 'btn-primary' : 'btn-outline'}`} aria-pressed={!modoMassa} onClick={() => setModoMassa(false)}>
                  Individual
                </button>
                <button type="button" className={`btn ${modoMassa ? 'btn-primary' : 'btn-outline'}`} aria-pressed={modoMassa} onClick={() => setModoMassa(true)}>
                  Em massa / setor
                </button>
              </div>

              <label style={{ display: 'grid', gap: 'var(--esp-1)' }}>
                <span className="form-label">Assunto</span>
                <input
                  className="input"
                  value={assuntoNova}
                  onChange={(e) => setAssuntoNova(e.target.value)}
                  placeholder="Assunto da conversa"
                />
              </label>

              {!modoMassa && (
                <label style={{ display: 'grid', gap: 'var(--esp-1)' }}>
                  <span className="form-label">Destinatário</span>
                  <select className="input" value={destinatarioId} onChange={(e) => setDestinatarioId(e.target.value)}>
                    <option value="">Selecione...</option>
                    {destinatarios.map((d) => (
                      <option key={d.id} value={d.id}>{d.nome}{d.setor ? ` — ${d.setor.nome}` : ''}</option>
                    ))}
                  </select>
                </label>
              )}

              {modoMassa && (
                <>
                  <div style={{ display: 'grid', gap: 'var(--esp-1)' }}>
                    <span className="form-label">Usuários</span>
                    <div className="input" style={{ maxHeight: 'calc(var(--esp-8) * 4)', overflowY: 'auto', display: 'grid', gap: 'var(--esp-1)' }}>
                      {destinatarios.map((d) => (
                        <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--esp-2)', minHeight: 'var(--alvo-clique)', fontSize: 'var(--fonte-corpo)', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={destinatariosMassaIds.includes(d.id)}
                            onChange={() => setDestinatariosMassaIds((prev) => prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id])}
                          />
                          {d.nome}{d.setor ? ` — ${d.setor.nome}` : ''}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 'var(--esp-1)' }}>
                    <span className="form-label">Setores <span style={{ fontWeight: 400, color: 'var(--c-muted)' }}>(cria grupo — como WhatsApp)</span></span>
                    <div className="input" style={{ maxHeight: 'calc(var(--esp-8) * 4)', overflowY: 'auto', display: 'grid', gap: 'var(--esp-1)' }}>
                      {setores.map((s) => (
                        <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--esp-2)', minHeight: 'var(--alvo-clique)', fontSize: 'var(--fonte-corpo)', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={setoresMassaIds.includes(s.id)}
                            onChange={() => setSetoresMassaIds((prev) => prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id])}
                          />
                          {s.nome}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <label style={{ display: 'grid', gap: 'var(--esp-1)' }}>
                <span className="form-label">Mensagem</span>
                <textarea
                  className="input"
                  rows={4}
                  style={{ resize: 'vertical' }}
                  value={mensagemNova}
                  onChange={(e) => setMensagemNova(e.target.value)}
                  placeholder="Digite a mensagem..."
                />
              </label>

              <label style={{ display: 'grid', gap: 'var(--esp-1)' }}>
                <span className="form-label">Anexos (opcional)</span>
                <input
                  type="file"
                  multiple
                  style={{ fontSize: 'var(--fonte-corpo)' }}
                  onChange={(e) => {
                    adicionarArquivosNovaConversa(e.target.files);
                    e.target.value = '';
                  }}
                />
                <span style={{ fontSize: 'var(--fonte-detalhe)', color: 'var(--c-muted)' }}>
                  Limite atual: ate {UPLOAD_MAX_FILE_SIZE_MB_PADRAO} MB por arquivo.
                </span>
              </label>

              <PendingAttachmentsList
                items={arquivosNova}
                onRemove={(index) => setArquivosNova((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                className="space-y-2"
                itemClassName="flex items-center justify-between gap-3 rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm"
                removeButtonClassName="text-[var(--c-danger)] font-semibold px-2"
              />

              <div className="app-actionbar">
                <button type="button" onClick={fecharModalNova} className="btn btn-outline">Cancelar</button>
                <button type="submit" disabled={salvando} className="btn btn-primary">
                  {salvando ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </div>
          </form>
        </OverlayModal>
      )}

      {elementoConfirmacao}
    </Pagina>
  );
}
