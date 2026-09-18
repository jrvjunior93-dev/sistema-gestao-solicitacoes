import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Filtros from './Filtros';
import { API_URL, authHeaders } from '../../services/api';
import { getSetores } from '../../services/setores';
import { getTiposSolicitacao } from '../../services/tiposSolicitacao';
import { getSetorPermissoes } from '../../services/setorPermissoes';
import { getStatusSetor } from '../../services/statusSetor';
import { useAuth } from '../../contexts/AuthContext';
import { useLiveUpdateSubscription } from '../../contexts/LiveUpdatesContext';
import { parseDateSmart } from '../../utils/dateLocal';
import { solicitacaoEstaNoSetorDoUsuario, userHasSetorCapability } from '../../utils/setor';
import { hasEnabledModule } from '../../utils/acessoProduto';
import ListaAvancada from '../../components/lista-avancada/ListaAvancada';
import StatusBadge from '../../components/StatusBadge';
import OverlayModal from '../../components/ui/OverlayModal';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  TabelaPadrao,
  CelulaDupla,
  FormSecao,
  CampoForm,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../../components/padrao';
import {
  formatarMaiusculas,
  formatarDescricao,
  vencimentoHumano,
  urgenciaVencimento
} from '../../utils/formatarTexto';
import {
  arquivarSolicitacoesEmMassa,
  desarquivarSolicitacao,
  enviarSolicitacoesParaSetorEmMassa,
  getSolicitacaoResumoLista,
  getContadoresSolicitacoes,
  getObrasVisiveisSolicitacoes,
  getStatusVisiveisSolicitacoes
} from '../../services/solicitacoes';
import {
  getTitulosPrioridadePorSolicitacoes,
  listarLotesPrioridadeDiretoria,
  solicitarUrgenciaPrioridadeDiretoria
} from '../../services/prioridadesDiretoria';

function normalizarTextoComparacao(valor) {
  return String(valor || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function formatarDataParaFiltro(valor) {
  if (!valor) return '';
  const data = parseDateSmart(valor) || new Date(valor);
  if (!data || Number.isNaN(data.getTime())) return '';

  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function moeda(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '-';
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dataCurta(valor) {
  if (!valor) return '-';
  const data = parseDateSmart(valor) || new Date(valor);
  if (!data || Number.isNaN(data.getTime())) return '-';
  return data.toLocaleDateString('pt-BR');
}

const FILTER_DEBOUNCE_MS = 450;
const EXPORT_PAGE_SIZE = 200;
const STATUS_AUTOMATICOS_SOLICITACAO = [
  'TITULO_CADASTRADO',
  'PARCIALMENTE PAGO',
  'PAGA'
];

function validarDataIso(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return true;
  const match = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const ano = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  if (ano < 1900 || ano > 2200) return false;

  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano
    && data.getUTCMonth() === mes - 1
    && data.getUTCDate() === dia;
}

function obterErrosFiltrosData(filtros) {
  const erros = {};
  const campos = [
    ['data_registro', 'Informe uma data de registro valida.'],
    ['data_vencimento_inicio', 'Informe uma data inicial valida.'],
    ['data_vencimento_fim', 'Informe uma data final valida.']
  ];
  campos.forEach(([campo, mensagem]) => {
    if (!validarDataIso(filtros?.[campo])) erros[campo] = mensagem;
  });

  const inicio = String(filtros?.data_vencimento_inicio || '').trim();
  const fim = String(filtros?.data_vencimento_fim || '').trim();
  if (!erros.data_vencimento_inicio && !erros.data_vencimento_fim && inicio && fim && inicio > fim) {
    erros.data_vencimento_fim = 'A data final deve ser igual ou posterior a data inicial.';
  }
  return erros;
}

const ROTULOS_VISAO_PENDENCIA = {
  'paradas-no-setor': 'solicitações paradas no seu setor',
  'aprovacoes-diretoria': 'aprovações aguardando você',
  'devolucoes-recebidas': 'devoluções recebidas no seu setor',
  'contratos-aguardando-aprovacao': 'contratos aguardando aprovação no seu setor'
};

// ----- Agrupamentos derivados (rótulo por item + ordem dos grupos) ----
function mesDeVencimento(dataVencimento) {
  const texto = String(dataVencimento || '').slice(0, 7); // yyyy-mm
  if (!/^\d{4}-\d{2}$/.test(texto)) return '(sem vencimento)';
  return `${texto.slice(5, 7)}/${texto.slice(0, 4)}`;
}

function compararMesVencimento(a, b) {
  const chave = (rotulo) => (/^\d{2}\/\d{4}$/.test(rotulo) ? `${rotulo.slice(3)}${rotulo.slice(0, 2)}` : '999999');
  return chave(a).localeCompare(chave(b));
}

const FAIXAS_VALOR = [
  { ate: 1000, rotulo: 'até R$ 1 mil' },
  { ate: 10000, rotulo: 'R$ 1 a 10 mil' },
  { ate: 50000, rotulo: 'R$ 10 a 50 mil' },
  { ate: 200000, rotulo: 'R$ 50 a 200 mil' },
  { ate: Infinity, rotulo: 'acima de R$ 200 mil' }
];

function faixaDeValor(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0) return '(sem valor)';
  return FAIXAS_VALOR.find((faixa) => numero <= faixa.ate).rotulo;
}

function compararFaixaValor(a, b) {
  const ordem = FAIXAS_VALOR.map((faixa) => faixa.rotulo);
  const indice = (rotulo) => {
    const i = ordem.indexOf(rotulo);
    return i < 0 ? ordem.length : i;
  };
  return indice(a) - indice(b);
}

export default function Solicitacoes({ arquivadas = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  // R19: nada de caixa do navegador. Faixa de aviso dentro da página e
  // modal de confirmação do sistema — os dois vindos dos padrões.
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [setoresMap, setSetoresMap] = useState({});
  const [setoresLista, setSetoresLista] = useState([]);
  const [tiposSolicitacao, setTiposSolicitacao] = useState([]);
  const [statusOptions, setStatusOptions] = useState([]);
  const [obrasOptions, setObrasOptions] = useState([]);
  const [responsaveisOptions, setResponsaveisOptions] = useState([]);
  const [permissaoUsuario, setPermissaoUsuario] = useState(null);
  const [selecionadasIds, setSelecionadasIds] = useState([]);
  // R26 — CONSENTIMENTO. O modal do sistema NÃO congela a lista atrás dele:
  // a seleção pode mudar entre abrir o modal e clicar em "Enviar". Estes são
  // os ALVOS FIXADOS no instante em que a ação foi acionada (exatamente os
  // itens que a barra de lote contou), e é sobre eles que a ação opera.
  const [alvosLote, setAlvosLote] = useState([]);
  const [modalEnvioMassa, setModalEnvioMassa] = useState(false);
  const [modalAtribuirMassa, setModalAtribuirMassa] = useState(false);
  const [usuariosAtribuicao, setUsuariosAtribuicao] = useState([]);
  const [usuarioAtribuicaoMassa, setUsuarioAtribuicaoMassa] = useState('');
  const [setorEnvioMassa, setSetorEnvioMassa] = useState('');
  const [processandoMassa, setProcessandoMassa] = useState(false);
  const [modalPrioridadeTitulos, setModalPrioridadeTitulos] = useState(false);
  const [titulosPrioridade, setTitulosPrioridade] = useState([]);
  const [solicitacoesPrioridadeSemTitulos, setSolicitacoesPrioridadeSemTitulos] = useState([]);
  const [lotesPrioridadeAbertos, setLotesPrioridadeAbertos] = useState([]);
  const [lotePrioridadeDestino, setLotePrioridadeDestino] = useState('');
  const [titulosPrioridadeSelecionados, setTitulosPrioridadeSelecionados] = useState(new Set());
  const [filtrosStoragePronto, setFiltrosStoragePronto] = useState(false);
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [limitePorPagina, setLimitePorPagina] = useState(25);
  const [metaPaginacao, setMetaPaginacao] = useState({
    page: 1,
    limit: 25,
    total: 0,
    total_pages: 0
  });
  const solicitacoesRef = useRef([]);
  const atualizarEntregaRef = useRef(null);
  atualizarEntregaRef.current = () => carregarEmSegundoPlano();
  useEffect(() => {
    let dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const verificar = () => {
      if (document.visibilityState !== 'visible') return;
      const atual = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
      if (atual !== dia) { dia = atual; void atualizarEntregaRef.current?.(); }
    };
    const timer = setInterval(verificar, 60000);
    document.addEventListener('visibilitychange', verificar);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', verificar); };
  }, []);
  const localMutationsRef = useRef(new Map());
  const { user } = useAuth();
  const moduloContratosHabilitado = hasEnabledModule(user, 'CONTRATOS');

  // Filtro por ids vindo da faixa de pendências do Hub (?ids=1,2,3):
  // leva o usuário direto às solicitações citadas no contador.
  const [filtroIdsUrl, setFiltroIdsUrl] = useState([]);
  // Visão nomeada vinda dos cartões de pendência do Hub (?visao=...):
  // o backend aplica o MESMO recorte SQL do contador — o número do
  // cartão e esta lista sempre batem.
  const [filtroVisaoUrl, setFiltroVisaoUrl] = useState('');

  // Estado de consulta vindo da ListaAvancada (visão, filtros rápidos,
  // busca única, ordenação). A página continua dona dos DADOS.
  const listaRef = useRef(null);
  // DEGRADAÇÃO (onda 3 do porte): o rework do SolicitacaoController
  // (pacote B3 da proposta — busca única `q`, ordenação server-side,
  // visões nomeadas e /solicitacoes/contadores) ainda não existe neste
  // backend. Enquanto isso: busca e ordenação rodam no cliente sobre a
  // janela carregada, e só as visões cujos parâmetros o controller atual
  // entende ficam visíveis. Religar trocando a constante.
  const B3_DISPONIVEL = true;
  const consultaListaRef = useRef({ visao: null, filtros: {}, busca: '', ordenacao: { campo: 'createdAt', direcao: 'desc' } });
  const [versaoConsulta, setVersaoConsulta] = useState(0);
  const acumularProximaRef = useRef(false);
  // ?q= e ?obra_ids= chegam da busca universal (Ctrl+K) e das ações
  // rápidas de obra: a lista abre já filtrada. Lidos uma vez, no mount.
  const [buscaUrlInicial] = useState(() => (
    new URLSearchParams(window.location.search).get('q') || ''
  ));
  const [filtrosUrlIniciais] = useState(() => {
    const csv = String(new URLSearchParams(window.location.search).get('obra_ids') || '').trim();
    if (!csv) return null;
    return { obra: csv.split(',').map((v) => v.trim()).filter(Boolean) };
  });
  const pularDebounceRef = useRef(false);

  const [filtros, setFiltros] = useState({
    codigo: '',
    descricao: '',
    numero_sienge: '',
    obra_ids: '',
    area: '',
    tipo_solicitacao_id: '',
    status: '',
    valor_min: '',
    valor_max: '',
    data_registro: '',
    data_vencimento: '',
    data_vencimento_inicio: '',
    data_vencimento_fim: '',
    responsavel: ''
  });

  const filtrosStorageKey = useMemo(() => {
    const identificador = user?.id || user?.email || user?.nome || user?.perfil || 'anon';
    const escopo = arquivadas ? 'arquivadas' : 'ativas';
    return `solicitacoes:filtros:${escopo}:${identificador}`;
  }, [user?.id, user?.email, user?.nome, user?.perfil, arquivadas]);
  const errosFiltrosData = useMemo(() => obterErrosFiltrosData(filtros), [filtros]);
  const filtrosDataValidos = Object.keys(errosFiltrosData).length === 0;

  useEffect(() => {
    setPaginaAtual(1);
  }, [filtros, arquivadas, limitePorPagina]);

  useEffect(() => {
    solicitacoesRef.current = solicitacoes;
  }, [solicitacoes]);

  useEffect(() => {
    if (!filtrosDataValidos) {
      setLoading(false);
      return undefined;
    }
    // O debounce protege a digitação nos filtros; troca de página (rolagem
    // infinita/paginação) busca na hora — senão o cleanup cancela a busca
    // da página anterior quando a seguinte é pedida.
    const atraso = pularDebounceRef.current ? 0 : FILTER_DEBOUNCE_MS;
    pularDebounceRef.current = false;
    const timeout = setTimeout(() => {
      carregar();
    }, atraso);

    return () => clearTimeout(timeout);
  }, [filtros, arquivadas, paginaAtual, limitePorPagina, filtrosDataValidos, filtroIdsUrl, filtroVisaoUrl, versaoConsulta]);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(filtrosStorageKey);
      if (salvo) {
        const parsed = JSON.parse(salvo);
        if (parsed && typeof parsed === 'object') {
          const normalizado = { ...parsed };
          if (!normalizado.numero_sienge && normalizado.numero_solicitacao) {
            normalizado.numero_sienge = normalizado.numero_solicitacao;
          }
          delete normalizado.numero_solicitacao;
          setFiltros(prev => ({ ...prev, ...normalizado }));
        }
      }
    } catch (error) {
      console.error('Erro ao carregar filtros salvos', error);
    } finally {
      setFiltrosStoragePronto(true);
    }
  }, [filtrosStorageKey]);

  // Parâmetros de URL (links das pendências do Hub e busca global)
  // sobrepõem os filtros salvos: ?area=, ?status=, ?codigo=,
  // ?data_vencimento_inicio=, ?data_vencimento_fim= e ?ids=1,2,3.
  useEffect(() => {
    if (!filtrosStoragePronto) return;
    const params = new URLSearchParams(location.search);
    if ([...params.keys()].length === 0) return;

    const visaoParam = String(params.get('visao') || '').trim().toLowerCase();
    if (visaoParam) {
      // O recorte do cartão substitui qualquer filtro salvo: a lista
      // abre mostrando EXATAMENTE o conjunto contado.
      setFiltroVisaoUrl(visaoParam);
      setFiltros({
        codigo: '',
        descricao: '',
        numero_sienge: '',
        obra_ids: '',
        area: '',
        tipo_solicitacao_id: '',
        status: '',
        valor_min: '',
        valor_max: '',
        data_registro: '',
        data_vencimento: '',
        data_vencimento_inicio: '',
        data_vencimento_fim: '',
        responsavel: ''
      });
    } else {
      setFiltroVisaoUrl('');
    }

    const chavesSuportadas = ['area', 'status', 'codigo', 'data_vencimento_inicio', 'data_vencimento_fim'];
    const sobrescritas = {};
    for (const chave of chavesSuportadas) {
      const valor = params.get(chave);
      if (valor !== null) sobrescritas[chave] = valor;
    }
    if (!visaoParam && Object.keys(sobrescritas).length > 0) {
      setFiltros((prev) => ({ ...prev, ...sobrescritas }));
    }

    const idsParam = params.get('ids');
    if (idsParam !== null) {
      const ids = idsParam
        .split(',')
        .map((valor) => Number(valor))
        .filter((valor) => Number.isInteger(valor) && valor > 0);
      setFiltroIdsUrl(ids);
    } else {
      setFiltroIdsUrl([]);
    }
  }, [filtrosStoragePronto, location.search]);

  useEffect(() => {
    if (!filtrosStoragePronto) return;
    try {
      localStorage.setItem(filtrosStorageKey, JSON.stringify(filtros));
    } catch (error) {
      console.error('Erro ao salvar filtros', error);
    }
  }, [filtros, filtrosStorageKey, filtrosStoragePronto]);

  useEffect(() => {
    carregarSetores();
    carregarTiposSolicitacao();
    carregarPermissoes();
  }, []);

  useEffect(() => {
    carregarStatusOptions();
  }, [arquivadas, user?.id]);

  useEffect(() => {
    carregarObrasOptions();
  }, [arquivadas, user?.id]);

  useEffect(() => {
    setResponsaveisOptions(extrairOpcoesResponsaveis(solicitacoes));
  }, [solicitacoes]);

  async function carregarTiposSolicitacao() {
    try {
      const data = await getTiposSolicitacao();
      setTiposSolicitacao(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
    }
  }

  async function carregarSetores() {
    try {
      const data = await getSetores();
      const map = {};
      (Array.isArray(data) ? data : []).forEach(s => {
        if (s?.codigo) map[s.codigo] = s;
        if (s?.nome) map[s.nome] = s;
      });
      setSetoresLista(Array.isArray(data) ? data : []);
      setSetoresMap(map);
    } catch (error) {
      console.error(error);
    }
  }

  function normalizarStatus(status) {
    return String(status || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_');
  }

  function montarStatusOptions(...listas) {
    const map = new Map();

    listas.flat().forEach(item => {
      const label = typeof item === 'string' ? item : item?.label || item?.nome || item?.status_global || item?.value;
      const nome = String(label || '').trim();
      if (!nome) return;
      const key = normalizarStatus(nome);
      if (!map.has(key)) {
        map.set(key, nome);
      }
    });

    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }

  async function carregarStatusOptions() {
    let statusVisiveis = null;
    let statusCadastrados = [];

    try {
      const data = await getStatusVisiveisSolicitacoes(
        arquivadas ? { arquivadas: '1' } : {}
      );
      statusVisiveis = Array.isArray(data) ? data : [];
    } catch (error) {
      console.error(error);
    }

    try {
      const data = await getStatusSetor();
      statusCadastrados = (Array.isArray(data) ? data : [])
        .filter(item => item?.ativo)
        .map(item => item?.nome);
    } catch (error) {
      console.error(error);
    }

    const catalogo = montarStatusOptions(
      statusCadastrados,
      STATUS_AUTOMATICOS_SOLICITACAO,
      statusVisiveis || []
    );

    if (statusVisiveis === null) {
      setStatusOptions(catalogo);
      return;
    }

    const statusVisiveisSet = new Set(statusVisiveis.map(normalizarStatus));
    setStatusOptions(catalogo.filter(item => statusVisiveisSet.has(item.value)));
  }

  async function carregarPermissoes() {
    try {
      if (user?.perfil !== 'USUARIO') {
        setPermissaoUsuario(null);
        return;
      }
      const setorToken = user?.setor?.codigo || user?.setor?.nome || user?.area || user?.setor_id;
      if (!setorToken) return;
      const data = await getSetorPermissoes({ setor: setorToken });
      const item = Array.isArray(data) && data.length > 0 ? data[0] : null;
      setPermissaoUsuario(item);
    } catch (error) {
      console.error(error);
      setPermissaoUsuario(null);
    }
  }

  function extrairOpcoesObras(lista) {
    const obrasMap = new Map();

    (Array.isArray(lista) ? lista : []).forEach(item => {
      const obraId = item?.obra?.id ?? item?.obra_id;
      const obraNome = item?.obra?.nome || null;
      if (obraId && obraNome) {
        const chave = String(obraId);
        if (!obrasMap.has(chave)) {
          obrasMap.set(chave, {
            value: chave,
            label: obraNome
          });
        }
      }
    });

    return Array.from(obrasMap.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }

  function extrairOpcoesResponsaveis(lista) {
    const responsaveisMap = new Map();

    (Array.isArray(lista) ? lista : []).forEach(item => {
      const responsavel = String(item?.responsavel || '').trim();
      if (responsavel && responsavel !== '-') {
        const chaveResp = responsavel.toUpperCase();
        if (!responsaveisMap.has(chaveResp)) {
          responsaveisMap.set(chaveResp, {
            value: responsavel,
            label: responsavel
          });
        }
      }
    });

    return Array.from(responsaveisMap.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }

  async function carregarObrasOptions() {
    try {
      const params = arquivadas ? { arquivadas: '1' } : {};
      const data = await getObrasVisiveisSolicitacoes(params);
      const lista = (Array.isArray(data) ? data : []).map((obra) => ({
        value: String(obra.id),
        label: obra.nome
      }));
      setObrasOptions(lista.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')));
    } catch (error) {
      console.error(error);
      setObrasOptions([]);
    }
  }

  function obterIdsFiltro(valor) {
    return String(valor || '')
      .split(',')
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  function obterValorListaSolicitacao(item) {
    const numero = Number(item?.valor_exibicao ?? item?.saldo_pagamento ?? item?.valor);
    return Number.isFinite(numero) ? numero : null;
  }

  function solicitacaoAtendeFiltros(item) {
    if (!item) return false;

    if (filtroIdsUrl.length > 0 && !filtroIdsUrl.includes(Number(item.id))) {
      return false;
    }

    const codigo = String(item?.codigo || '');
    const descricao = String(item?.descricao || '');
    const numeroPedido = String(item?.numero_sienge || item?.numero_pedido || '');
    const obraId = String(item?.obra?.id ?? item?.obra_id ?? '');
    const tipoId = String(item?.tipo?.id ?? item?.tipo_solicitacao_id ?? '');
    const responsavel = String(item?.responsavel || '');
    const statusNormalizado = normalizarStatus(item?.status_global || '');
    const valorSolicitacao = obterValorListaSolicitacao(item);
    const dataRegistro = formatarDataParaFiltro(item?.createdAt || item?.data_criacao || item?.created_at);
    const dataVencimento = formatarDataParaFiltro(item?.data_vencimento);
    const filtrosObras = obterIdsFiltro(filtros.obra_ids);
    const filtrosTipos = obterIdsFiltro(filtros.tipo_solicitacao_id);
    const filtrosStatus = obterIdsFiltro(filtros.status).map((valor) => normalizarStatus(valor));
    const filtrosSetor = obterIdsFiltro(filtros.area).map((valor) => normalizarTextoComparacao(valor));
    const setorSolicitacao = setoresMap?.[item?.area_responsavel] || null;
    const tokensSetor = new Set(
      [
        item?.area_responsavel,
        setorSolicitacao?.codigo,
        setorSolicitacao?.nome,
        setorSolicitacao?.id
      ]
        .map((valor) => normalizarTextoComparacao(valor))
        .filter(Boolean)
    );

    if (filtros.codigo && !codigo.toLowerCase().includes(String(filtros.codigo).trim().toLowerCase())) {
      return false;
    }

    if (
      filtros.descricao &&
      !normalizarTextoComparacao(descricao).includes(normalizarTextoComparacao(filtros.descricao))
    ) {
      return false;
    }

    if (filtros.numero_sienge && !numeroPedido.toLowerCase().includes(String(filtros.numero_sienge).trim().toLowerCase())) {
      return false;
    }

    if (filtrosObras.length > 0 && !filtrosObras.includes(obraId)) {
      return false;
    }

    if (filtrosSetor.length > 0 && !filtrosSetor.some((token) => tokensSetor.has(token))) {
      return false;
    }

    if (filtrosTipos.length > 0 && !filtrosTipos.includes(tipoId)) {
      return false;
    }

    if (filtrosStatus.length > 0 && !filtrosStatus.includes(statusNormalizado)) {
      return false;
    }

    if (String(filtros.valor_min || '').trim() !== '') {
      const valorMin = Number(filtros.valor_min);
      if (!Number.isNaN(valorMin) && (valorSolicitacao === null || valorSolicitacao < valorMin)) {
        return false;
      }
    }

    if (String(filtros.valor_max || '').trim() !== '') {
      const valorMax = Number(filtros.valor_max);
      if (!Number.isNaN(valorMax) && (valorSolicitacao === null || valorSolicitacao > valorMax)) {
        return false;
      }
    }

    if (filtros.data_registro && dataRegistro !== filtros.data_registro) {
      return false;
    }

    if (filtros.data_vencimento_inicio && (!dataVencimento || dataVencimento < filtros.data_vencimento_inicio)) {
      return false;
    }

    if (filtros.data_vencimento_fim && (!dataVencimento || dataVencimento > filtros.data_vencimento_fim)) {
      return false;
    }

    if (filtros.data_vencimento && dataVencimento !== filtros.data_vencimento) {
      return false;
    }

    if (filtros.responsavel && !responsavel.toLowerCase().includes(String(filtros.responsavel).trim().toLowerCase())) {
      return false;
    }

    return true;
  }

  function registrarMutacaoLocal(id) {
    const idNumerico = Number(id);
    if (!Number.isInteger(idNumerico) || idNumerico <= 0) return;
    localMutationsRef.current.set(idNumerico, Date.now());
  }

  function eventoFoiTratadoLocalmente(payload) {
    const idNumerico = Number(payload?.record_id || 0);
    if (!Number.isInteger(idNumerico) || idNumerico <= 0) {
      return false;
    }

    const actorId = Number(payload?.actor?.id || 0);
    if (!Number.isInteger(actorId) || actorId <= 0 || actorId !== Number(user?.id || 0)) {
      return false;
    }

    const handledAt = localMutationsRef.current.get(idNumerico);
    if (!handledAt) {
      return false;
    }

    if (Date.now() - handledAt > 10 * 1000) {
      localMutationsRef.current.delete(idNumerico);
      return false;
    }

    localMutationsRef.current.delete(idNumerico);
    return true;
  }

  function atualizarMetaPaginacaoComDelta(totalDelta = 0) {
    if (!totalDelta) return;

    setMetaPaginacao((prev) => {
      const nextTotal = Math.max(0, Number(prev?.total || 0) + Number(totalDelta || 0));
      const nextLimit = Math.max(1, Number(prev?.limit || limitePorPagina || 25));
      return {
        ...prev,
        total: nextTotal,
        total_pages: nextTotal > 0 ? Math.ceil(nextTotal / nextLimit) : 0
      };
    });
  }

  function aplicarListaLocal(nextList, { totalDelta = 0 } = {}) {
    const listaNormalizada = Array.isArray(nextList) ? nextList : [];
    setSolicitacoes(listaNormalizada);
    setSelecionadasIds((prev) => prev.filter((idSelecionado) => (
      listaNormalizada.some((item) => Number(item.id) === Number(idSelecionado))
    )));
    atualizarMetaPaginacaoComDelta(totalDelta);
  }

  function removerSolicitacaoDaLista(id, { decrementarTotal = false } = {}) {
    const idNumerico = Number(id);
    if (!Number.isInteger(idNumerico) || idNumerico <= 0) {
      return;
    }

    const listaAtual = solicitacoesRef.current;
    const existeNaLista = listaAtual.some((item) => Number(item.id) === idNumerico);
    if (!existeNaLista) {
      return;
    }

    const proximaLista = listaAtual.filter((item) => Number(item.id) !== idNumerico);
    aplicarListaLocal(proximaLista, { totalDelta: decrementarTotal ? -1 : 0 });
  }

  async function atualizarSolicitacaoDaLista(id, { permitirInsercao = false } = {}) {
    const idNumerico = Number(id);
    if (!Number.isInteger(idNumerico) || idNumerico <= 0) {
      return;
    }

    const listaAtual = solicitacoesRef.current;
    const indiceAtual = listaAtual.findIndex((item) => Number(item.id) === idNumerico);

    try {
      const resumo = await getSolicitacaoResumoLista(idNumerico);
      const atendeFiltros = solicitacaoAtendeFiltros(resumo);

      if (indiceAtual >= 0) {
        if (!atendeFiltros) {
          removerSolicitacaoDaLista(idNumerico, { decrementarTotal: true });
          return;
        }

        const proximaLista = [...listaAtual];
        proximaLista[indiceAtual] = resumo;
        aplicarListaLocal(proximaLista);
        return;
      }

      if (!atendeFiltros || !permitirInsercao || arquivadas || paginaAtual !== 1) {
        return;
      }

      const proximaLista = [resumo, ...listaAtual]
        .filter((item, index, array) => (
          array.findIndex((outro) => Number(outro.id) === Number(item.id)) === index
        ));

      const listaLimitada = proximaLista.slice(0, Number(limitePorPagina || 25));

      aplicarListaLocal(listaLimitada, { totalDelta: 1 });
    } catch (error) {
      const status = Number(error?.status || 0);
      if ((status === 403 || status === 404) && indiceAtual >= 0) {
        removerSolicitacaoDaLista(idNumerico, { decrementarTotal: true });
        return;
      }

      console.error(error);
    }
  }

  async function handleAtualizarLista(mutation = null) {
    if (!mutation || typeof mutation !== 'object') {
      await carregarEmSegundoPlano();
      return;
    }

    const mutationId = Number(mutation.id || 0);
    if (Number.isInteger(mutationId) && mutationId > 0) {
      registrarMutacaoLocal(mutationId);
    }

    if (mutation.type === 'remove_item') {
      removerSolicitacaoDaLista(mutationId, {
        decrementarTotal: mutation.decrementarTotal !== false
      });
      return;
    }

    if (mutation.type === 'refresh_item') {
      await atualizarSolicitacaoDaLista(mutationId, {
        permitirInsercao: !!mutation.permitirInsercao
      });
      return;
    }

    await carregarEmSegundoPlano();
  }

  // Mapeia o estado de consulta da ListaAvancada (visão, filtros rápidos,
  // busca única e ordenação) para os parâmetros da API — SOMANDO aos
  // filtros avançados existentes, sem substituir nenhum deles.
  function aplicarConsultaListaNosParams(paramsObj) {
    const consulta = consultaListaRef.current || {};

    Object.entries(consulta.visao?.params || {}).forEach(([chave, valor]) => {
      if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
        paramsObj[chave] = String(valor);
      }
    });

    const rapidos = consulta.filtros || {};
    const somarCsv = (chave, valores) => {
      const lista = [paramsObj[chave], ...(valores || [])]
        .map((v) => String(v || '').trim())
        .filter(Boolean);
      if (lista.length > 0) paramsObj[chave] = Array.from(new Set(lista)).join(',');
    };
    somarCsv('status', rapidos.status);
    somarCsv('tipo_solicitacao_id', rapidos.tipo);
    somarCsv('obra_ids', rapidos.obra);

    // Sem o B3, `q`/`ordenar`/`direcao` seriam ignorados em silêncio pelo
    // backend — pior que não enviar: a tela fingiria filtrar. A busca e a
    // ordenação acontecem no cliente (ver itensExibidos).
    if (B3_DISPONIVEL && consulta.busca) paramsObj.q = consulta.busca;

    const MAPA_ORDENACAO = {
      data: 'createdAt',
      codigo: 'codigo',
      descricao: 'descricao',
      valor: 'valor',
      status: 'status_global',
      vencimento: 'data_vencimento',
      setor: 'area_responsavel',
      numero_sienge: 'numero_sienge'
    };
    const ordenacao = consulta.ordenacao || {};
    if (B3_DISPONIVEL && ordenacao.campo && MAPA_ORDENACAO[ordenacao.campo]) {
      paramsObj.ordenar = MAPA_ORDENACAO[ordenacao.campo];
      paramsObj.direcao = ordenacao.direcao === 'asc' ? 'asc' : 'desc';
    }
  }

  async function carregar({ silent = false } = {}) {
    if (!filtrosDataValidos) {
      if (!silent) setLoading(false);
      return;
    }

    try {
      if (!silent) {
        setLoading(true);
      }

      const acumular = acumularProximaRef.current;
      acumularProximaRef.current = false;

      const paramsObj = {};
      Object.entries(filtros).forEach(([chave, valor]) => {
        if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
          paramsObj[chave] = String(valor).trim();
        }
      });
      if (arquivadas) {
        paramsObj.arquivadas = '1';
      }
      if (filtroIdsUrl.length > 0) {
        paramsObj.ids = filtroIdsUrl.join(',');
      }
      if (filtroVisaoUrl) {
        paramsObj.visao = filtroVisaoUrl;
      }
      aplicarConsultaListaNosParams(paramsObj);

      // Recarga silenciosa com rolagem infinita em andamento: rebusca a
      // janela inteira já carregada (páginas 1..atual) numa consulta só,
      // para não truncar a lista acumulada.
      const janelaCompleta = silent && !acumular && paginaAtual > 1;
      paramsObj.page = janelaCompleta ? '1' : String(paginaAtual);
      paramsObj.limit = janelaCompleta
        ? String(paginaAtual * Number(limitePorPagina || 25))
        : String(limitePorPagina);

      const params = new URLSearchParams(paramsObj).toString();

      const res = await fetch(`${API_URL}/solicitacoes?${params}`, {
        headers: authHeaders()
      });

      if (!res.ok) {
        throw new Error('Erro ao buscar solicitações');
      }

      const data = await res.json();
      const lista = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
          ? data.items
          : [];
      if (acumular) {
        setSolicitacoes((prev) => {
          const vistos = new Set(prev.map((item) => Number(item.id)));
          return [...prev, ...lista.filter((item) => !vistos.has(Number(item.id)))];
        });
      } else {
        setSolicitacoes(lista);
      }
      setObrasOptions(prev => {
        if (prev.length > 0) return prev;
        return extrairOpcoesObras(lista);
      });
      const totalRegistros = Number(data?.meta?.total || lista.length);
      const limiteBase = Number(limitePorPagina || 25);
      setMetaPaginacao({
        page: paginaAtual,
        limit: limiteBase,
        total: totalRegistros,
        total_pages: Math.max(Math.ceil(totalRegistros / limiteBase), lista.length > 0 ? 1 : 0)
      });
      if (silent) {
        listaRef.current?.refreshContadores?.();
      }
    } catch (error) {
      console.error(error);
      if (!silent) avisar.erro('Erro ao carregar solicitações.');
    } finally {
      setLoading(false);
    }
  }

  async function carregarEmSegundoPlano() {
    if (!filtrosDataValidos) return;

    try {
      const paramsObj = {};
      Object.entries(filtros).forEach(([chave, valor]) => {
        if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
          paramsObj[chave] = String(valor).trim();
        }
      });
      if (arquivadas) {
        paramsObj.arquivadas = '1';
      }
      if (filtroIdsUrl.length > 0) {
        paramsObj.ids = filtroIdsUrl.join(',');
      }
      if (filtroVisaoUrl) {
        paramsObj.visao = filtroVisaoUrl;
      }
      aplicarConsultaListaNosParams(paramsObj);

      // Janela completa: com rolagem infinita, o refresh de fundo rebusca
      // tudo que está carregado (páginas 1..atual) para não truncar.
      const janelaCompleta = paginaAtual > 1;
      paramsObj.page = janelaCompleta ? '1' : String(paginaAtual);
      paramsObj.limit = janelaCompleta
        ? String(paginaAtual * Number(limitePorPagina || 25))
        : String(limitePorPagina);

      const params = new URLSearchParams(paramsObj).toString();
      const res = await fetch(`${API_URL}/solicitacoes?${params}`, {
        headers: authHeaders()
      });

      if (!res.ok) {
        throw new Error('Erro ao buscar solicitacoes');
      }

      const data = await res.json();
      const lista = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
          ? data.items
          : [];

      setSolicitacoes(lista);
      setObrasOptions((prev) => {
        if (prev.length > 0) return prev;
        return extrairOpcoesObras(lista);
      });
      const totalRegistros = Number(data?.meta?.total || lista.length);
      const limiteBase = Number(limitePorPagina || 25);
      setMetaPaginacao({
        page: paginaAtual,
        limit: limiteBase,
        total: totalRegistros,
        total_pages: Math.max(Math.ceil(totalRegistros / limiteBase), lista.length > 0 ? 1 : 0)
      });
    } catch (error) {
      console.error(error);
    }
  }

  const perfilUpper = String(user?.perfil || '').toUpperCase();
  const mostrarSomaValor = perfilUpper.startsWith('ADMIN') || perfilUpper === 'SUPERADMIN';
  const somaValorFiltrado = solicitacoes.reduce((total, item) => {
    const valor = Number(item?.valor || 0);
    return total + (Number.isNaN(valor) ? 0 : valor);
  }, 0);
  const totalSolicitacoes = Number(metaPaginacao?.total || 0);

  const setorTokens = [
    String(user?.setor?.codigo || '').toUpperCase(),
    String(user?.setor?.nome || '').toUpperCase(),
    String(user?.area || '').toUpperCase()
  ];
  const isSetorObra = userHasSetorCapability(user, 'eh_setor_obra');
  const isSetorFinanceiro = userHasSetorCapability(user, 'eh_setor_financeiro');
  const setorTokensNormalizados = setorTokens.map(normalizarTextoComparacao).filter(Boolean);
  const isDiretoriaObrasPublicas = setorTokensNormalizados.includes('DIR_OBRAS_PUBLICAS');
  const isDiretoriaObrasPrivadas = setorTokensNormalizados.includes('DIR_OBRAS_PRIVADAS');
  const podeSolicitarPrioridadeFinanceiro = !arquivadas && (isDiretoriaObrasPublicas || isDiretoriaObrasPrivadas);
  const classificacaoPrioridadeDiretoria = isDiretoriaObrasPublicas ? 'PUBLICA' : 'PRIVADA';
  const isSuperadmin = perfilUpper === 'SUPERADMIN';
  const podeEnviarQualquerSetor = Boolean(user?.pode_enviar_qualquer_setor);

  // Alvos de uma ação em lote: SEMPRE os itens que a barra de lote contou
  // (a ListaAvancada passa a lista selecionada para `executar`). Só cai no
  // estado quando a ação foi chamada de fora da barra.
  function idsDosAlvos(itensAlvo) {
    if (Array.isArray(itensAlvo) && itensAlvo.length > 0) {
      return itensAlvo
        .map((item) => Number(item?.id))
        .filter((id) => Number.isInteger(id) && id > 0);
    }
    return selecionadasIds.map(Number).filter((id) => Number.isInteger(id) && id > 0);
  }

  async function arquivarEmMassa(itensAlvo) {
    // R26: os IDs ficam fixados numa const ANTES do await da confirmação.
    // O modal do sistema não bloqueia a lista atrás dele — sem isto,
    // perguntar sobre 3 e arquivar 47 é possível.
    const alvos = idsDosAlvos(itensAlvo);
    if (alvos.length === 0) {
      avisar.alerta('Selecione ao menos uma solicitação.');
      return;
    }
    const { ok } = await confirmar({
      titulo: 'Arquivar solicitações',
      mensagem: `Arquivar ${alvos.length} solicitação(ões) somente para sua visualização?`,
      rotuloConfirmar: `Arquivar ${alvos.length}`
    });
    if (!ok) return;

    try {
      setProcessandoMassa(true);
      const resultado = await arquivarSolicitacoesEmMassa(alvos);
      setSelecionadasIds([]);
      listaRef.current?.clearSelecao?.();
      await carregar({ silent: true });
      if (resultado?.erros?.length > 0) {
        avisar.alerta(`Arquivamento em massa concluído. Arquivadas: ${resultado.sucesso}. Falhas: ${resultado.erros.length}.`);
      } else {
        avisar.sucesso('Solicitações arquivadas em massa com sucesso.');
      }
    } catch (error) {
      console.error(error);
      avisar.erro('Erro ao arquivar solicitações em massa.');
    } finally {
      setProcessandoMassa(false);
    }
  }

  async function desarquivarEmMassa(itensAlvo) {
    // R26: mesma fixação de alvos antes do await.
    const alvos = idsDosAlvos(itensAlvo);
    if (alvos.length === 0) {
      avisar.alerta('Selecione ao menos uma solicitação.');
      return;
    }
    const { ok } = await confirmar({
      titulo: 'Desarquivar solicitações',
      mensagem: `Desarquivar ${alvos.length} solicitação(ões) da sua lista de arquivadas?`,
      rotuloConfirmar: `Desarquivar ${alvos.length}`
    });
    if (!ok) return;

    try {
      setProcessandoMassa(true);
      let sucesso = 0;
      const erros = [];

      for (const solicitacaoId of alvos) {
        try {
          await desarquivarSolicitacao(solicitacaoId);
          sucesso += 1;
        } catch (error) {
          erros.push({ id: solicitacaoId, error });
        }
      }

      setSelecionadasIds([]);
      listaRef.current?.clearSelecao?.();
      await carregar({ silent: true });

      if (erros.length > 0) {
        avisar.alerta(`Desarquivamento em massa concluído. Desarquivadas: ${sucesso}. Falhas: ${erros.length}.`);
      } else {
        avisar.sucesso('Solicitações desarquivadas com sucesso.');
      }
    } catch (error) {
      console.error(error);
      avisar.erro('Erro ao desarquivar solicitações em massa.');
    } finally {
      setProcessandoMassa(false);
    }
  }

  function formatarDataExportacao(valor) {
    if (!valor) return '';
    const data = parseDateSmart(valor);
    if (!data || Number.isNaN(data.getTime())) return String(valor);
    return data.toLocaleDateString('pt-BR');
  }

  function formatarValorExportacao(valor) {
    const n = Number(valor);
    if (Number.isNaN(n)) return '';
    return n.toFixed(2).replace('.', ',');
  }

  function baixarSolicitacoesCsv(lista, escopo) {
    if (!Array.isArray(lista) || lista.length === 0) {
      avisar.alerta('Nenhuma solicitação encontrada para exportar.');
      return;
    }
    const linhas = [
      [
        'Código',
        'Nº pedido',
        'Obra',
        ...(moduloContratosHabilitado ? ['Contrato', 'Ref. do Contrato'] : []),
        'Descrição',
        'Tipo de Solicitação',
        'Valor',
        'Setor',
        'Responsável',
        'Status',
        'Data Registro',
        'Data Resposta/Pagamento'
      ],
      ...lista.map(item => [
        item.codigo || '',
        item.numero_pedido || '',
        item.obra?.nome || '',
        ...(moduloContratosHabilitado
          ? [
              item.contrato?.codigo || item.codigo_contrato || '',
              item.contrato?.ref_contrato || item.ref_contrato || ''
            ]
          : []),
        item.descricao || '',
        item.tipo?.nome || '',
        formatarValorExportacao(item.valor),
        item.area_responsavel || '',
        item.responsavel || '',
        item.status_global || '',
        formatarDataExportacao(item.createdAt),
        formatarDataExportacao(item.data_vencimento)
      ])
    ];

    const csv = linhas
      .map(colunas => colunas
        .map(valor => `"${String(valor ?? '').replace(/"/g, '""')}"`)
        .join(';'))
      .join('\r\n');

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dataRef = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `solicitacoes-${escopo}-${dataRef}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  async function buscarTodasSolicitacoesFiltradas() {
    const filtrosSnapshot = { ...filtros };
    const registrosPorId = new Map();
    let pagina = 1;
    let totalPaginas = 1;

    do {
      const paramsObj = {};
      Object.entries(filtrosSnapshot).forEach(([chave, valor]) => {
        if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
          paramsObj[chave] = String(valor).trim();
        }
      });
      if (arquivadas) paramsObj.arquivadas = '1';
      if (filtroVisaoUrl) paramsObj.visao = filtroVisaoUrl;
      // CONSENTIMENTO: a exportação "filtradas" precisa exportar EXATAMENTE
      // o recorte que está na tela. Sem o `ids` do Hub e sem a consulta da
      // ListaAvancada (visão, filtros rápidos, busca) ela ignorava o que a
      // pessoa vê e baixava o conjunto inteiro — 47 linhas para quem tinha
      // 3 na tela.
      if (filtroIdsUrl.length > 0) paramsObj.ids = filtroIdsUrl.join(',');
      aplicarConsultaListaNosParams(paramsObj);
      paramsObj.page = String(pagina);
      paramsObj.limit = String(EXPORT_PAGE_SIZE);

      const params = new URLSearchParams(paramsObj).toString();
      const res = await fetch(`${API_URL}/solicitacoes?${params}`, {
        headers: authHeaders()
      });
      if (!res.ok) throw new Error('Erro ao buscar solicitações para exportação');

      const data = await res.json();
      const itens = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
      itens.forEach((item) => registrosPorId.set(Number(item.id), item));
      totalPaginas = Math.max(1, Number(data?.meta?.total_pages || 1));
      pagina += 1;
    } while (pagina <= totalPaginas);

    return Array.from(registrosPorId.values());
  }

  async function exportarSolicitacoesExcel(itensAlvo) {
    if (!filtrosDataValidos) {
      avisar.alerta('Corrija as datas dos filtros antes de exportar.');
      return;
    }

    // A barra de lote entrega os itens que ela contou: o CSV sai com esses
    // mesmos registros, não com o que o estado tiver depois.
    const selecionadas = Array.isArray(itensAlvo) && itensAlvo.length > 0
      ? itensAlvo
      : solicitacoes.filter(item => selecionadasIds.includes(Number(item.id)));
    if (selecionadas.length > 0) {
      baixarSolicitacoesCsv(selecionadas, 'selecionadas');
      return;
    }

    try {
      setExportando(true);
      const filtradas = await buscarTodasSolicitacoesFiltradas();
      baixarSolicitacoesCsv(filtradas, 'filtradas');
    } catch (error) {
      console.error(error);
      avisar.erro('Erro ao exportar as solicitações filtradas.');
    } finally {
      setExportando(false);
    }
  }

  // Abre o modal FIXANDO os alvos (R26): o que a barra de lote contou é o
  // que o modal mostra e o que o envio vai atingir, mesmo que a pessoa
  // mexa na seleção da lista com o modal aberto.
  function abrirModalEnvioMassa(itensAlvo) {
    const alvos = idsDosAlvos(itensAlvo);
    if (alvos.length === 0) {
      avisar.alerta('Selecione ao menos uma solicitação.');
      return;
    }
    setAlvosLote(alvos);
    setSetorEnvioMassa('');
    setModalEnvioMassa(true);
  }

  async function confirmarEnvioMassa() {
    // Alvos fixados na abertura do modal — nunca relidos do estado da lista.
    const alvos = alvosLote;
    if (isSetorObra) {
      avisar.alerta('Setor OBRA não pode enviar solicitações para outro setor.');
      return;
    }
    if (alvos.length === 0) {
      avisar.alerta('Selecione ao menos uma solicitação.');
      return;
    }
    if (!setorEnvioMassa) {
      avisar.alerta('Selecione um setor de destino.');
      return;
    }

    try {
      setProcessandoMassa(true);
      const resultado = await enviarSolicitacoesParaSetorEmMassa({
        solicitacao_ids: alvos,
        setor_destino: setorEnvioMassa
      });
      setModalEnvioMassa(false);
      setSetorEnvioMassa('');
      setAlvosLote([]);
      setSelecionadasIds([]);
      listaRef.current?.clearSelecao?.();
      await carregar({ silent: true });
      if (resultado?.erros?.length > 0) {
        const detalhes = resultado.erros
          .slice(0, 8)
          .map(item => `#${item.id}: ${item.error || 'Erro ao enviar'}`)
          .join(' · ');
        const complemento = resultado.erros.length > 8
          ? ` … e mais ${resultado.erros.length - 8} falha(s).`
          : '';
        avisar.alerta(
          `Enviadas: ${resultado.sucesso}. Falhas: ${resultado.erros.length}. ${detalhes}${complemento}`,
          'Envio em massa concluído com pendências'
        );
      } else {
        avisar.sucesso('Solicitações enviadas em massa com sucesso.');
      }
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao enviar solicitações em massa.');
    } finally {
      setProcessandoMassa(false);
    }
  }

  async function solicitarPrioridadeFinanceiroSelecionadas(itensAlvo) {
    if (!podeSolicitarPrioridadeFinanceiro) {
      avisar.alerta('Apenas DIR_OBRAS_PUBLICAS ou DIR_OBRAS_PRIVADAS podem solicitar prioridade para o financeiro.');
      return;
    }

    // R26: os alvos são fixados AQUI, antes de qualquer await, e ficam em
    // `alvosLote` até o envio — o modal de títulos abre depois de duas
    // requisições e a seleção da lista pode ter mudado nesse meio-tempo.
    const alvos = idsDosAlvos(itensAlvo);
    if (alvos.length === 0) {
      avisar.alerta('Selecione ao menos uma solicitação.');
      return;
    }

    const selecionadas = Array.isArray(itensAlvo) && itensAlvo.length > 0
      ? itensAlvo
      : solicitacoes.filter(item => alvos.includes(Number(item.id)));
    const foraFinanceiro = selecionadas.filter(item => normalizarTextoComparacao(item.area_responsavel) !== 'FINANCEIRO');
    if (foraFinanceiro.length > 0) {
      avisar.alerta('Selecione apenas solicitações que estejam no setor FINANCEIRO para solicitar prioridade.');
      return;
    }

    try {
      setProcessandoMassa(true);
      const [resposta, lotesAbertosData] = await Promise.all([
        getTitulosPrioridadePorSolicitacoes({
          solicitacao_ids: alvos,
          classificacao_alvo: classificacaoPrioridadeDiretoria
        }),
        listarLotesPrioridadeDiretoria({ status: 'ABERTO' })
      ]);
      const titulos = Array.isArray(resposta?.items) ? resposta.items : [];
      const semTitulos = Array.isArray(resposta?.solicitacoes_sem_titulos) ? resposta.solicitacoes_sem_titulos : [];
      if (titulos.length === 0) {
        const lista = semTitulos.map(item => item.codigo || `#${item.id}`).join(', ');
        avisar.alerta(
          `Nenhuma solicitação selecionada possui título financeiro aberto elegível.${lista ? ` Solicitações sem título: ${lista}.` : ''} Cadastre os títulos financeiros e clique novamente em Prioridade financeira para recarregar.`
        );
        return;
      }
      const lotesAbertos = (Array.isArray(lotesAbertosData?.items) ? lotesAbertosData.items : [])
        .filter(lote => (
          String(lote.status || '').toUpperCase() === 'ABERTO' &&
          String(lote.tipo_lote || '').toUpperCase() === 'SOLICITACAO_DIRETORIA' &&
          String(lote.classificacao_alvo || '').toUpperCase() === String(classificacaoPrioridadeDiretoria || '').toUpperCase()
        ));
      setAlvosLote(alvos);
      setTitulosPrioridade(titulos);
      setSolicitacoesPrioridadeSemTitulos(semTitulos);
      setLotesPrioridadeAbertos(lotesAbertos);
      setLotePrioridadeDestino('');
      setTitulosPrioridadeSelecionados(new Set(titulos.map(item => String(item.id))));
      setModalPrioridadeTitulos(true);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao buscar títulos para prioridade.');
    } finally {
      setProcessandoMassa(false);
    }
  }

  function alternarTituloPrioridade(id) {
    const key = String(id);
    setTitulosPrioridadeSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function confirmarPrioridadeFinanceiroTitulos() {
    // R26: títulos E solicitações fixados ANTES do await da confirmação.
    // `solicitacao_ids` vinha do estado vivo da lista — o backend recebia um
    // conjunto de solicitações que podia não ser o que gerou estes títulos.
    const tituloIds = Array.from(titulosPrioridadeSelecionados).map(Number).filter(Boolean);
    const solicitacaoIds = alvosLote;
    const loteDestino = lotePrioridadeDestino ? Number(lotePrioridadeDestino) : undefined;
    if (tituloIds.length === 0) {
      avisar.alerta('Selecione ao menos um título para enviar à prioridade.');
      return;
    }

    const { ok } = await confirmar({
      titulo: 'Enviar para prioridade',
      mensagem: `Enviar ${tituloIds.length} título(s) para aprovação de prioridade pela Diretoria Administrativa?`,
      rotuloConfirmar: `Enviar ${tituloIds.length}`
    });
    if (!ok) return;

    try {
      setProcessandoMassa(true);
      await solicitarUrgenciaPrioridadeDiretoria({
        titulo_ids: tituloIds,
        solicitacao_ids: solicitacaoIds,
        classificacao_alvo: classificacaoPrioridadeDiretoria,
        lote_id: loteDestino
      });
      setSelecionadasIds([]);
      listaRef.current?.clearSelecao?.();
      setAlvosLote([]);
      setTitulosPrioridade([]);
      setSolicitacoesPrioridadeSemTitulos([]);
      setLotesPrioridadeAbertos([]);
      setLotePrioridadeDestino('');
      setTitulosPrioridadeSelecionados(new Set());
      setModalPrioridadeTitulos(false);
      await carregar({ silent: true });
      avisar.sucesso('Lote de prioridade enviado para aprovação da Diretoria Administrativa.');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao solicitar prioridade para o financeiro.');
    } finally {
      setProcessandoMassa(false);
    }
  }

  const selecionadaUnica = useMemo(() => {
    if (selecionadasIds.length !== 1) return null;
    const idSelecionado = Number(selecionadasIds[0]);
    return solicitacoes.find(item => Number(item.id) === idSelecionado) || null;
  }, [selecionadasIds, solicitacoes]);

  const podeAssumirUnica = useMemo(() => {
    if (!selecionadaUnica) return false;
    if (isSetorObra) return false;
    if (!isSuperadmin && !solicitacaoEstaNoSetorDoUsuario(selecionadaUnica.area_responsavel, user)) return false;
    const modo = String(permissaoUsuario?.modo_recebimento || 'TODOS_VISIVEIS').toUpperCase();
    if (modo !== 'TODOS_VISIVEIS') return false;
    const isUsuario = user?.perfil === 'USUARIO';
    return isUsuario ? (!!permissaoUsuario?.usuario_pode_assumir || isSetorFinanceiro) : true;
  }, [selecionadaUnica, isSetorObra, isSuperadmin, permissaoUsuario, user, isSetorFinanceiro]);

  const podeAtribuirMassa = useMemo(() => {
    if (selecionadasIds.length === 0) return false;
    if (isSetorObra) return false;
    const modo = String(permissaoUsuario?.modo_recebimento || 'TODOS_VISIVEIS').toUpperCase();
    if (modo !== 'TODOS_VISIVEIS') return false;
    const isUsuario = user?.perfil === 'USUARIO';
    return isUsuario ? (!!permissaoUsuario?.usuario_pode_atribuir || isSetorFinanceiro) : true;
  }, [selecionadasIds.length, isSetorObra, permissaoUsuario, user?.perfil, isSetorFinanceiro]);

  const podeEnviarMassa = useMemo(() => {
    if (selecionadasIds.length === 0 || isSetorObra) return false;
    if (isSuperadmin || podeEnviarQualquerSetor) return true;
    return selecionadasIds.every(idSelecionado => {
      const solicitacao = solicitacoes.find(item => Number(item.id) === Number(idSelecionado));
      return solicitacao && solicitacaoEstaNoSetorDoUsuario(solicitacao.area_responsavel, user);
    });
  }, [selecionadasIds, isSetorObra, isSuperadmin, podeEnviarQualquerSetor, solicitacoes, user]);

  async function assumirSelecionada(itensAlvo) {
    // R26: a solicitação alvo fica numa const antes de qualquer await —
    // nada de reler `selecionadaUnica` (derivado do estado) depois.
    const alvo = (Array.isArray(itensAlvo) && itensAlvo.length === 1)
      ? itensAlvo[0]
      : selecionadaUnica;
    if (!alvo) return;
    try {
      const res = await fetch(`${API_URL}/solicitacoes/${alvo.id}/assumir`, {
        method: 'POST',
        headers: authHeaders()
      });

      if (!res.ok) {
        let mensagem = 'Erro ao assumir solicitação';
        try {
          const data = await res.json();
          mensagem = data?.error || mensagem;
        } catch (_) {}
        avisar.erro(mensagem);
        return;
      }

      avisar.sucesso('Solicitação assumida com sucesso.');
      await handleAtualizarLista({ type: 'refresh_item', id: alvo.id });
    } catch (error) {
      console.error(error);
      avisar.erro('Erro ao assumir solicitação.');
    }
  }

  useLiveUpdateSubscription({
    enabled: true,
    filter: (payload) => String(payload?.entity || '').toUpperCase() === 'SOLICITACAO',
    onEvent: async (payload) => {
      if (eventoFoiTratadoLocalmente(payload)) {
        return;
      }

      const recordId = Number(payload?.record_id || 0);
      if (!Number.isInteger(recordId) || recordId <= 0) {
        return;
      }

      const action = String(payload?.action || '').trim().toUpperCase();
      if (action === 'DELETED') {
        removerSolicitacaoDaLista(recordId, { decrementarTotal: true });
        return;
      }

      if (action.startsWith('RETORNO_') || action === 'PURCHASE_DELIVERY_UPDATED') {
        // O pedido pendente altera a prioridade global da fila. Rebuscar a janela garante
        // que uma solicitacao que estava em outra pagina apareca imediatamente no topo e
        // que o destaque suma assim que o pedido for decidido ou cancelado.
        await carregarEmSegundoPlano();
        return;
      }

      await atualizarSolicitacaoDaLista(recordId, {
        permitirInsercao: ['CREATED', 'SENT_TO_SECTOR', 'APPROVED_DIRETORIA'].includes(action)
      });
    },
    fallbackRefresh: carregarEmSegundoPlano,
    fallbackMs: 45 * 1000
  });

  async function carregarUsuariosAtribuicao() {
    try {
      const res = await fetch(`${API_URL}/usuarios/opcoes-atribuicao`, {
        headers: authHeaders()
      });
      if (!res.ok) {
        setUsuariosAtribuicao([]);
        return;
      }

      const data = await res.json();
      const lista = Array.isArray(data) ? data : [];
      const setorUsuario = user?.setor_id ? String(user.setor_id) : '';
      const filtrados = setorUsuario
        ? lista.filter(u => String(u.setor_id) === setorUsuario)
        : lista;
      setUsuariosAtribuicao(filtrados);
    } catch (error) {
      console.error(error);
      setUsuariosAtribuicao([]);
    }
  }

  async function abrirModalAtribuirMassa(itensAlvo) {
    // R26: alvos fixados na abertura — `carregarUsuariosAtribuicao` tem
    // await e a seleção da lista pode mudar enquanto ele roda.
    const alvos = idsDosAlvos(itensAlvo);
    if (alvos.length === 0) {
      avisar.alerta('Selecione ao menos uma solicitação.');
      return;
    }
    setAlvosLote(alvos);
    setUsuarioAtribuicaoMassa('');
    await carregarUsuariosAtribuicao();
    setModalAtribuirMassa(true);
  }

  async function confirmarAtribuirMassa() {
    const alvos = alvosLote;
    const usuarioDestino = usuarioAtribuicaoMassa;
    if (!usuarioDestino) {
      avisar.alerta('Selecione um usuário.');
      return;
    }
    if (alvos.length === 0) {
      avisar.alerta('Selecione ao menos uma solicitação.');
      return;
    }

    try {
      setProcessandoMassa(true);
      let sucesso = 0;
      const erros = [];

      for (const solicitacaoId of alvos) {
        try {
          const res = await fetch(`${API_URL}/solicitacoes/${solicitacaoId}/atribuir`, {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              usuario_responsavel_id: usuarioDestino
            })
          });

          if (!res.ok) {
            let mensagem = 'Erro ao atribuir';
            try {
              const data = await res.json();
              mensagem = data?.error || mensagem;
            } catch (_) {}
            erros.push(`SOL-${solicitacaoId}: ${mensagem}`);
            continue;
          }

          sucesso += 1;
        } catch (error) {
          erros.push(`SOL-${solicitacaoId}: falha de conexão`);
        }
      }

      setModalAtribuirMassa(false);
      setAlvosLote([]);
      setSelecionadasIds([]);
      listaRef.current?.clearSelecao?.();
      await carregar();

      if (erros.length > 0) {
        avisar.alerta(
          `Sucesso: ${sucesso}. Falhas: ${erros.length}. ${erros.slice(0, 8).join(' · ')}`,
          'Atribuição em massa concluída'
        );
      } else {
        avisar.sucesso('Atribuição em massa realizada com sucesso.');
      }
    } catch (error) {
      console.error(error);
      avisar.erro('Erro ao atribuir em massa.');
    } finally {
      setProcessandoMassa(false);
    }
  }

  // ==================================================================
  // Integração com a ListaAvancada (a página segue dona dos dados)
  // ==================================================================
  function handleQueryChangeLista(consulta) {
    consultaListaRef.current = consulta;
    acumularProximaRef.current = false;
    if (paginaAtual !== 1) setPaginaAtual(1);
    setVersaoConsulta((v) => v + 1);
  }

  function handlePageRequestLista(novaPagina, { acumular = false } = {}) {
    acumularProximaRef.current = acumular;
    pularDebounceRef.current = true;
    setPaginaAtual(novaPagina);
  }

  // Busca e ordenação no CLIENTE enquanto o B3 não existe: agem sobre a
  // janela já carregada (páginas buscadas), não sobre o banco inteiro.
  // `versaoConsulta` muda a cada interação com a barra da lista, então o
  // memo relê o ref na hora certa.
  const normalizarBuscaLocal = (valor) => String(valor ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  const itensExibidos = useMemo(() => {
    if (B3_DISPONIVEL) return solicitacoes;
    const consulta = consultaListaRef.current || {};
    let lista = solicitacoes;

    const termo = normalizarBuscaLocal(consulta.busca).trim();
    if (termo) {
      lista = lista.filter((item) => normalizarBuscaLocal([
        item.codigo,
        item.descricao,
        item.obra?.nome,
        item.parceiro?.nome,
        item.favorecido?.nome,
        item.status_global,
        item.area_responsavel,
        item.numero_sienge,
        item.valor_exibicao ?? item.valor
      ].filter((campo) => campo !== null && campo !== undefined).join(' ')).includes(termo));
    }

    const ordenacao = consulta.ordenacao || {};
    const EXTRATORES = {
      data: (i) => i.createdAt || '',
      codigo: (i) => String(i.codigo || ''),
      descricao: (i) => String(i.descricao || ''),
      valor: (i) => Number(i.valor_exibicao ?? i.valor ?? 0),
      status: (i) => String(i.status_global || ''),
      vencimento: (i) => i.data_vencimento || '',
      setor: (i) => String(i.area_responsavel || ''),
      numero_sienge: (i) => String(i.numero_sienge || '')
    };
    const extrator = EXTRATORES[ordenacao.campo];
    if (extrator) {
      const direcao = ordenacao.direcao === 'asc' ? 1 : -1;
      lista = [...lista].sort((a, b) => {
        const va = extrator(a);
        const vb = extrator(b);
        if (va < vb) return -1 * direcao;
        if (va > vb) return 1 * direcao;
        return 0;
      });
    }
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [B3_DISPONIVEL, solicitacoes, versaoConsulta]);

  const filtrosAvancadosAtivos = useMemo(() => (
    Object.values(filtros).filter((valor) => String(valor ?? '').trim() !== '').length
  ), [filtros]);

  const hojeISO = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const visoesLista = useMemo(() => {
    if (arquivadas) return [];
    const isoMais = (dias) => {
      const d = new Date();
      d.setDate(d.getDate() + dias);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const setorUsuario = user?.setor?.codigo || user?.area || '';
    return [
      // "Minhas pendências" e "Fila do setor" usam parâmetros que só o B3
      // conhece (`minhas`, `sem_responsavel`); sem ele o backend as
      // ignoraria e as visões mentiriam. Ficam fora até o pacote entrar.
      ...(B3_DISPONIVEL ? [{ id: 'minhas', rotulo: 'Minhas pendências', params: { minhas: '1' } }] : []),
      // "Fila do setor" (sem responsável definido) em vez de "Do meu setor":
      // para quem é o único do setor, "do meu setor" seria idêntico a
      // "Todas" — a fila sem dono é o recorte acionável.
      ...(B3_DISPONIVEL && setorUsuario ? [{ id: 'fila_setor', rotulo: 'Fila do setor', params: { sem_responsavel: '1', area: setorUsuario } }] : []),
      { id: 'vencendo', rotulo: 'Vencendo', tom: 'warning', params: { data_vencimento_inicio: hojeISO, data_vencimento_fim: isoMais(7) } },
      { id: 'atrasadas', rotulo: 'Atrasadas', tom: 'danger', params: { data_vencimento_fim: isoMais(-1) } },
      { id: 'todas', rotulo: 'Todas', params: {} }
    ];
  }, [arquivadas, user?.setor?.codigo, user?.area, hojeISO, B3_DISPONIVEL]);

  const filtrosRapidosLista = useMemo(() => ([
    {
      id: 'status',
      rotulo: 'Status',
      opcoes: statusOptions.map((opcao) => ({ valor: String(opcao.value), rotulo: opcao.label }))
    },
    {
      id: 'tipo',
      rotulo: 'Tipo',
      opcoes: (tiposSolicitacao || []).map((tipo) => ({ valor: String(tipo.id), rotulo: tipo.nome }))
    },
    {
      id: 'obra',
      rotulo: 'Obra',
      opcoes: obrasOptions.map((opcao) => ({ valor: String(opcao.value), rotulo: opcao.label }))
    }
  ]), [statusOptions, tiposSolicitacao, obrasOptions]);

  const colunasLista = useMemo(() => {
    const todas = [
      {
        id: 'codigo',
        titulo: 'Código',
        principal: true,
        ordenavel: true,
        larguraPadrao: 130,
        render: (item) => formatarMaiusculas(item.codigo || `#${item.id}`)
      },
      {
        id: 'obra',
        titulo: 'Obra',
        larguraPadrao: 180,
        render: (item) => formatarMaiusculas(item.obra?.nome || '-')
      },
      {
        id: 'descricao',
        titulo: 'Descrição',
        ordenavel: true,
        larguraPadrao: 300,
        render: (item) => formatarDescricao(item.descricao || '') || '-'
      },
      {
        id: 'valor',
        titulo: 'Valor',
        ordenavel: true,
        larguraPadrao: 130,
        render: (item) => moeda(item.valor_exibicao ?? item.valor)
      },
      {
        id: 'status',
        titulo: 'Status',
        ordenavel: true,
        larguraPadrao: 170,
        render: (item) => (
          <StatusBadge
            status={item.status_global}
            setor={item.setor_status_atual || item.area_responsavel}
          />
        ),
        tituloCelula: (item) => item.status_global || ''
      },
      {
        id: 'vencimento',
        titulo: 'Vencimento',
        ordenavel: true,
        larguraPadrao: 130,
        render: (item) => (item.data_vencimento ? vencimentoHumano(item.data_vencimento) : '-'),
        tituloCelula: (item) => (item.data_vencimento ? dataCurta(item.data_vencimento) : '')
      },
      // ---- opcionais (seletor de colunas; escolha salva por usuário) ----
      {
        id: 'numero_sienge',
        titulo: 'Nº pedido',
        padrao: false,
        ordenavel: true,
        larguraPadrao: 110,
        render: (item) => item.numero_sienge || item.numero_pedido || '-'
      },
      ...(moduloContratosHabilitado ? [
        {
          id: 'contrato',
          titulo: 'Contrato',
          padrao: false,
          larguraPadrao: 130,
          render: (item) => item.contrato?.codigo || item.codigo_contrato || '-'
        },
        {
          id: 'ref_contrato',
          titulo: 'Ref. do contrato',
          padrao: false,
          larguraPadrao: 140,
          render: (item) => item.contrato?.ref_contrato || item.ref_contrato || '-'
        }
      ] : []),
      {
        id: 'tipo',
        titulo: 'Tipo',
        padrao: false,
        larguraPadrao: 160,
        render: (item) => item.tipo?.nome || '-'
      },
      {
        id: 'setor',
        titulo: 'Setor',
        padrao: false,
        ordenavel: true,
        larguraPadrao: 130,
        render: (item) => item.area_responsavel || '-'
      },
      {
        id: 'responsavel',
        titulo: 'Responsável',
        padrao: false,
        larguraPadrao: 150,
        render: (item) => item.responsavel || '-'
      },
      {
        id: 'data',
        titulo: 'Registro',
        padrao: false,
        ordenavel: true,
        larguraPadrao: 110,
        render: (item) => dataCurta(item.createdAt)
      }
    ];
    return todas;
  }, [moduloContratosHabilitado]);

  const renderCardSolicitacao = (item) => (
    <div className="sol-card-compacto">
      <div className="sol-card-compacto-topo">
        <span className="sol-card-compacto-codigo">
          {formatarMaiusculas(item.codigo || `#${item.id}`)}
          {item.retorno_solicitado_pendente && (
            <span
              className="sol-retorno-pendente"
              title={item.pedido_retorno_pendente?.motivo || 'Esta solicitação precisa de atenção do setor atual.'}
            >
              Retorno solicitado
            </span>
          )}
          {item.atencao_pendente && (
            <span className="sol-retorno-pendente" title={item.atencao_pendente.resumo || 'Nova interação nesta solicitação.'}>
              {item.atencao_pendente.tipo === 'ENVIO_MANUAL' ? 'Enviada ao setor' : 'Novo comentário'}
            </span>
          )}
          {item.entrega_pendente && <span className="sol-retorno-pendente" title={item.entrega_pendente.resumo}>
            Entrega: {item.entrega_pendente.vencida ? 'ação vencida' : 'pendência'}
          </span>}
        </span>
        <StatusBadge
          status={item.status_global}
          setor={item.setor_status_atual || item.area_responsavel}
        />
      </div>
      <div className="sol-card-compacto-meio">
        <span className="sol-card-compacto-obra">{formatarMaiusculas(item.obra?.nome || '-')}</span>
        <span className="sol-card-compacto-descricao" title={formatarDescricao(item.descricao || '')}>
          {formatarDescricao(item.descricao || '') || '-'}
        </span>
      </div>
      <div className="sol-card-compacto-base">
        <span className="sol-card-compacto-valor">{moeda(item.valor_exibicao ?? item.valor)}</span>
        <span className="sol-card-compacto-venc">
          {item.data_vencimento ? vencimentoHumano(item.data_vencimento) : 'Sem vencimento'}
        </span>
      </div>
    </div>
  );

  // Com 1 selecionada o rótulo fica no singular, sem número; com 2 ou
  // mais mantém a contagem ("Enviar 3 para outro setor").
  const acoesLoteLista = arquivadas
    ? [
      {
        id: 'desarquivar',
        rotulo: (n) => (n === 1 ? 'Desarquivar' : `Desarquivar ${n}`),
        desabilitada: () => processandoMassa,
        executar: (itens) => desarquivarEmMassa(itens)
      },
      {
        id: 'exportar',
        rotulo: (n) => (n === 1 ? 'Exportar' : `Exportar ${n}`),
        desabilitada: () => processandoMassa || exportando || !filtrosDataValidos,
        executar: (itens) => exportarSolicitacoesExcel(itens)
      }
    ]
    : [
      {
        id: 'assumir',
        rotulo: () => 'Assumir',
        visivel: (itens) => itens.length === 1 && podeAssumirUnica,
        desabilitada: () => processandoMassa,
        executar: (itens) => assumirSelecionada(itens)
      },
      {
        id: 'enviar',
        rotulo: (n) => (n === 1 ? 'Enviar para outro setor' : `Enviar ${n} para outro setor`),
        visivel: () => podeEnviarMassa,
        desabilitada: () => processandoMassa,
        executar: (itens) => abrirModalEnvioMassa(itens)
      },
      {
        id: 'exportar',
        rotulo: (n) => (n === 1 ? 'Exportar' : `Exportar ${n}`),
        desabilitada: () => processandoMassa || exportando || !filtrosDataValidos,
        executar: (itens) => exportarSolicitacoesExcel(itens)
      },
      {
        id: 'arquivar',
        rotulo: (n) => (n === 1 ? 'Arquivar' : `Arquivar ${n}`),
        desabilitada: () => processandoMassa,
        executar: (itens) => arquivarEmMassa(itens)
      },
      {
        id: 'atribuir',
        rotulo: (n) => (n === 1 ? 'Atribuir responsável' : `Atribuir responsável a ${n}`),
        visivel: () => podeAtribuirMassa,
        desabilitada: () => processandoMassa,
        executar: (itens) => abrirModalAtribuirMassa(itens)
      },
      ...(podeSolicitarPrioridadeFinanceiro ? [{
        id: 'prioridade',
        rotulo: (n) => (n === 1 ? 'Prioridade financeira' : `Prioridade financeira para ${n}`),
        desabilitada: () => processandoMassa,
        executar: (itens) => solicitarPrioridadeFinanceiroSelecionadas(itens)
      }] : [])
    ];

  return (
    <Pagina>
      {/* R13/R5: título, contagem e apoio na faixa fixa do topo — o h1 solto
          com escala fora da tabela de tipos saiu daqui. */}
      <PageHeader
        titulo={arquivadas ? 'Solicitações Arquivadas' : 'Solicitações'}
        contagem={loading ? null : `${totalSolicitacoes} solicitação(ões)`}
        descricao={arquivadas
          ? 'Solicitações que você tirou da sua lista ativa.'
          : 'Fila de trabalho do módulo: visões, filtros salvos, busca e ações em lote.'}
      />

      {/* R19: os avisos da tela vivem aqui, não em caixa do navegador. */}
      <Avisos avisos={avisos} aoFechar={fechar} />

      {filtroIdsUrl.length > 0 && (
        <BlocoConteudo variante="secundario">
          <div className="app-actionbar" role="status">
            <span className="fx-badge fx-badge--warning">
              Mostrando {filtroIdsUrl.length} pendência(s) vinda(s) do Início
            </span>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                setFiltroIdsUrl([]);
                navigate(location.pathname, { replace: true });
              }}
            >
              Limpar este filtro
            </button>
          </div>
        </BlocoConteudo>
      )}

      {filtroVisaoUrl && (
        <BlocoConteudo variante="secundario">
          <div className="app-actionbar" role="status">
            <span className="fx-badge fx-badge--warning">
              Mostrando: {ROTULOS_VISAO_PENDENCIA[filtroVisaoUrl] || filtroVisaoUrl} — o mesmo
              conjunto contado no cartão do Início{metaPaginacao?.total != null ? ` (${metaPaginacao.total})` : ''}
            </span>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                setFiltroVisaoUrl('');
                navigate(location.pathname, { replace: true });
              }}
            >
              Limpar este filtro
            </button>
          </div>
        </BlocoConteudo>
      )}

      {/* A lista é a pergunta central da tela: bloco primário, largura total.
          Continua na ListaAvancada — ver o relatório da rodada para o porquê
          de não virar TabelaPadrao. */}
      <BlocoConteudo variante="primario" cor="var(--c-primary)">
        <ListaAvancada
          ref={listaRef}
          id={arquivadas ? 'solicitacoes-arquivadas' : 'solicitacoes'}
          buscaInicial={buscaUrlInicial}
          filtrosIniciais={filtrosUrlIniciais}
          itens={itensExibidos}
          total={Number(metaPaginacao?.total || 0)}
          totalPaginas={Number(metaPaginacao?.total_pages || 0)}
          pagina={paginaAtual}
          carregando={loading}
          onQueryChange={handleQueryChangeLista}
          onPageRequest={handlePageRequestLista}
          fetchContadores={arquivadas || !B3_DISPONIVEL ? null : getContadoresSolicitacoes}
          visoes={visoesLista}
          visaoInicial="todas"
          filtrosRapidos={filtrosRapidosLista}
          filtrosAvancadosAtivos={filtrosAvancadosAtivos}
          filtrosAvancados={() => (
            <Filtros
              filtros={filtros}
              setFiltros={setFiltros}
              obrasOptions={obrasOptions}
              responsaveisOptions={responsaveisOptions}
              setores={setoresLista}
              tiposSolicitacao={tiposSolicitacao}
              statusOptions={statusOptions}
              mostrarFiltroResponsavel={isSetorFinanceiro}
              mostrarSomaValor={mostrarSomaValor}
              somaValorFiltrado={somaValorFiltrado}
              errosDatas={errosFiltrosData}
            />
          )}
          busca={{
            placeholder: 'Buscar por código, obra, descrição ou fornecedor…',
            // Enquanto o B3 não existe a busca roda no cliente — o usuário
            // precisa saber que ela não varre o banco inteiro.
            aviso: B3_DISPONIVEL ? '' : 'A busca considera apenas os registros já carregados na tela.'
          }}
          colunas={colunasLista}
          agrupamentos={[
            { id: 'obra', rotulo: 'obra', valor: (item) => formatarMaiusculas(item.obra?.nome || '(sem obra)') },
            { id: 'tipo', rotulo: 'tipo', valor: (item) => item.tipo?.nome || '(sem tipo)' },
            { id: 'setor', rotulo: 'setor', valor: (item) => item.area_responsavel || '(sem setor)' },
            { id: 'status', rotulo: 'status', valor: (item) => item.status_global || '(sem status)' },
            { id: 'responsavel', rotulo: 'responsável', valor: (item) => item.responsavel || '(sem responsável)' },
            { id: 'parceiro', rotulo: 'fornecedor/parceiro', valor: (item) => item.parceiro?.nome || '(sem parceiro)' },
            { id: 'vencimento_mes', rotulo: 'mês de vencimento', valor: (item) => mesDeVencimento(item.data_vencimento), ordenarGrupos: compararMesVencimento },
            { id: 'criador', rotulo: 'criador', valor: (item) => item.criador?.nome || '(sem criador)' },
            {
              id: 'apropriacao',
              rotulo: 'apropriação',
              valor: (item) => (item.apropriacao
                ? [item.apropriacao.codigo, item.apropriacao.descricao].filter(Boolean).join(' — ')
                : '(sem apropriação)')
            },
            {
              id: 'contrato',
              rotulo: 'contrato vinculado',
              valor: (item) => item.contrato?.codigo || item.codigo_contrato || '(sem contrato)'
            },
            { id: 'faixa_valor', rotulo: 'faixa de valor', valor: (item) => faixaDeValor(item.valor_exibicao ?? item.valor), ordenarGrupos: compararFaixaValor }
          ]}
          renderCard={renderCardSolicitacao}
          urgencia={(item) => (
            item.entrega_pendente ? (item.entrega_pendente.vencida ? 'retorno' : 'entrega') : item.retorno_solicitado_pendente || item.atencao_pendente
              ? 'retorno'
              : urgenciaVencimento(item.data_vencimento)
          )}
          acoesLote={acoesLoteLista}
          aoAbrirItem={(item) => navigate(`/solicitacoes/${item.id}`)}
          onSelecaoChange={(ids) => setSelecionadasIds(ids.map(Number))}
        />
      </BlocoConteudo>

      {/* R9: modal, porque a ação INTERROMPE o trabalho da lista — a tela
          não existe para atribuir nem para enviar. R27: o corpo rola e o
          rodapé com o botão de confirmar fica fixo (do OverlayModal). */}
      {modalAtribuirMassa && !arquivadas && (
        <OverlayModal
          rotulo="Atribuir responsável em massa"
          largura="var(--modal-max-w-sm, 480px)"
          onFechar={() => {
            setModalAtribuirMassa(false);
            setAlvosLote([]);
          }}
        >
          <BlocoConteudo
            titulo="Atribuir em massa"
            contagem={`${alvosLote.length} solicitação(ões)`}
            descricao="As solicitações contadas aqui são as que estavam selecionadas quando você abriu esta janela."
          >
            <FormSecao legenda="Destino" colunas={2}>
              <CampoForm label="Responsável" obrigatorio span={2}>
                <select
                  className="input w-full"
                  value={usuarioAtribuicaoMassa}
                  onChange={e => setUsuarioAtribuicaoMassa(e.target.value)}
                >
                  <option value="">Selecione um usuário</option>
                  {usuariosAtribuicao.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </CampoForm>
            </FormSecao>

            <div className="app-actionbar">
              <button
                type="button"
                className="btn btn-primary"
                onClick={confirmarAtribuirMassa}
                disabled={processandoMassa}
              >
                {processandoMassa ? 'Atribuindo…' : `Atribuir ${alvosLote.length}`}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setModalAtribuirMassa(false);
                  setAlvosLote([]);
                }}
                disabled={processandoMassa}
              >
                Cancelar
              </button>
            </div>
          </BlocoConteudo>
        </OverlayModal>
      )}

      {modalEnvioMassa && !arquivadas && (
        <OverlayModal
          rotulo="Enviar solicitações em massa"
          largura="var(--modal-max-w-sm, 480px)"
          onFechar={() => {
            setModalEnvioMassa(false);
            setSetorEnvioMassa('');
            setAlvosLote([]);
          }}
        >
          <BlocoConteudo
            titulo="Enviar solicitações em massa"
            contagem={`${alvosLote.length} solicitação(ões)`}
            descricao="As solicitações contadas aqui são as que estavam selecionadas quando você abriu esta janela."
          >
            <FormSecao legenda="Destino" colunas={2}>
              <CampoForm label="Setor de destino" obrigatorio span={2}>
                <select
                  className="input w-full"
                  value={setorEnvioMassa}
                  onChange={e => setSetorEnvioMassa(e.target.value)}
                >
                  <option value="">Selecione um setor</option>
                  {setoresLista.map(s => (
                    <option key={s.id} value={s.nome}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              </CampoForm>
            </FormSecao>

            <div className="app-actionbar">
              <button
                type="button"
                className="btn btn-primary"
                onClick={confirmarEnvioMassa}
                disabled={processandoMassa}
              >
                {processandoMassa ? 'Enviando…' : `Enviar ${alvosLote.length}`}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setModalEnvioMassa(false);
                  setSetorEnvioMassa('');
                  setAlvosLote([]);
                }}
                disabled={processandoMassa}
              >
                Cancelar
              </button>
            </div>
          </BlocoConteudo>
        </OverlayModal>
      )}

      {modalPrioridadeTitulos && (
        <OverlayModal
          rotulo="Selecionar títulos para prioridade"
          largura="var(--modal-max-w-xl, 1040px)"
          onFechar={() => setModalPrioridadeTitulos(false)}
        >
          <BlocoConteudo
            titulo="Selecionar títulos para prioridade"
            contagem={`${titulosPrioridadeSelecionados.size} de ${titulosPrioridade.length} título(s)`}
            descricao="Confirme quais títulos abertos das solicitações selecionadas devem seguir para a Diretoria Administrativa."
          >
            {solicitacoesPrioridadeSemTitulos.length > 0 && (
              <div className="app-alert" role="status">
                <span>
                  <strong>Algumas solicitações ainda não possuem título financeiro aberto.</strong>{' '}
                  Elas não serão enviadas agora. Cancele para voltar e desmarcá-las, ou cadastre o
                  título e acione Prioridade financeira novamente para recarregar. Sem título:{' '}
                  {solicitacoesPrioridadeSemTitulos
                    .map((item) => item.codigo || `#${item.id}`)
                    .join(', ')}
                </span>
              </div>
            )}

            <FormSecao legenda="Destino dos títulos" colunas={2}>
              <CampoForm label="Lote de prioridade" span={2}>
                <select
                  className="input w-full"
                  value={lotePrioridadeDestino}
                  onChange={event => setLotePrioridadeDestino(event.target.value)}
                >
                  <option value="">Criar novo lote de prioridade</option>
                  {lotesPrioridadeAbertos.map((lote) => (
                    <option key={lote.id} value={lote.id}>
                      Incluir no lote aberto #{lote.id} — {dataCurta(lote.createdAt)} — {moeda(lote.valor_utilizado)}
                    </option>
                  ))}
                </select>
              </CampoForm>
            </FormSecao>

            <p className="app-note">
              Total selecionado:{' '}
              <strong>
                {moeda(titulosPrioridade
                  .filter(item => titulosPrioridadeSelecionados.has(String(item.id)))
                  .reduce((total, item) => total + Number(item.valor_prioridade || item.valor_saldo || 0), 0))}
              </strong>
            </p>

            <TabelaPadrao
              colunas={[
                {
                  id: 'selecionar',
                  sempreVisivel: true,
                  titulo: 'Selecionar',
                  tipo: 'status',
                  render: (titulo) => (
                    <input
                      type="checkbox"
                      checked={titulosPrioridadeSelecionados.has(String(titulo.id))}
                      onChange={() => alternarTituloPrioridade(titulo.id)}
                      aria-label={`Incluir o título ${titulo.codigo || titulo.id} no lote`}
                    />
                  )
                },
                {
                  id: 'titulo',
                  titulo: 'Título',
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (titulo) => (
                    <CelulaDupla
                      principal={titulo.codigo || `#${titulo.id}`}
                      sub={titulo.parceiro?.nome || titulo.descricao || '-'}
                    />
                  )
                },
                {
                  id: 'solicitacao',
                  titulo: 'Solicitação',
                  tipo: 'texto',
                  render: (titulo) => (
                    <CelulaDupla
                      principal={titulo.solicitacao?.codigo || '-'}
                      sub={titulo.solicitacao?.descricao || ''}
                    />
                  )
                },
                {
                  id: 'obra',
                  titulo: 'Obra',
                  tipo: 'texto',
                  render: (titulo) => titulo.obra?.nome || '-'
                },
                {
                  id: 'vencimento',
                  titulo: 'Vencimento',
                  tipo: 'data',
                  render: (titulo) => dataCurta(titulo.data_vencimento)
                },
                {
                  id: 'saldo',
                  titulo: 'Saldo',
                  tipo: 'valor',
                  render: (titulo) => moeda(titulo.valor_prioridade || titulo.valor_saldo)
                }
              ]}
              itens={titulosPrioridade}
              vazio="Nenhum título aberto para as solicitações selecionadas."
              storageKey="tabela:solicitacoes:lote-prioridade"
              rotuloRolagem="Títulos para prioridade"
            />

            <div className="app-actionbar">
              <button
                type="button"
                className="btn btn-primary"
                onClick={confirmarPrioridadeFinanceiroTitulos}
                disabled={processandoMassa || titulosPrioridadeSelecionados.size === 0}
              >
                Enviar títulos selecionados
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setModalPrioridadeTitulos(false)}
                disabled={processandoMassa}
              >
                Cancelar
              </button>
            </div>
          </BlocoConteudo>
        </OverlayModal>
      )}

      {elementoConfirmacao}
    </Pagina>
  );
}
