import DateInputBR from '../components/DateInputBR';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Avisos,
  BlocoConteudo,
  CampoForm,
  FormSecao,
  Pagina,
  PageHeader,
  useAvisos,
  useConfirmacao
} from '../components/padrao';
import { getMinhasObras } from '../services/obras';
import { getTiposSolicitacaoDisponiveis } from '../services/tiposSolicitacao';
import { createSolicitacao, getApropriacaoPadraoSolicitacao, getSaldoDespesaEventual, solicitarRetornoSolicitacao } from '../services/solicitacoes';
import { uploadArquivos } from '../services/uploads';
import { getTiposSubContrato } from '../services/tiposSubContrato';
import { getContratos, criarContratoFluxoNovo, getFormasPagamentoFluxos, getLimiteJuridico, uploadContratoAnexos, uploadNegociacaoContrato, uploadDocumentacaoJuridicaContrato } from '../services/contratos';
import BlocoContratoFluxoNovo, { LIMITE_DETALHES_CONTRATO, MAXIMO_PARCELAS_CONTRATO } from '../components/contratos/BlocoContratoFluxoNovo';
import ModalConferenciaCredores from '../components/contratos/ModalConferenciaCredores';
import BlocoMedicaoContrato from '../components/contratos/BlocoMedicaoContrato';
import ModalAditivoContrato from '../components/contratos/ModalAditivoContrato';
import { buscarParceiros, criarCredorNovaSolicitacao } from '../services/parceiros';
import { listarApropriacoes } from '../services/apropriacoes';
import { getAutomacaoDestinoNovaSolicitacao, getCamposNovaSolicitacao } from '../services/configuracoesSistema';
import { useAuth } from '../contexts/AuthContext';
import { useFecharAoSair } from '../hooks/useFecharAoSair';
import { HiOutlineArrowUturnLeft, HiOutlineClock, HiOutlineMagnifyingGlass, HiPaperClip } from 'react-icons/hi2';
import ApropriacaoAutocomplete from '../components/ui/ApropriacaoAutocomplete';
import OverlayModal from '../components/ui/OverlayModal';
import ParceiroBuscaRemota from '../components/solicitacoes/ParceiroBuscaRemota';
import CadastroRapidoFavorecidoButton from '../components/solicitacoes/CadastroRapidoFavorecidoButton';
import RateioApropriacoesContrato, { numeroDoCampo } from '../components/contratos/RateioApropriacoesContrato';
import PendingAttachmentsList from '../components/attachments/PendingAttachmentsList';
import RecargaCartaoFields from '../components/recarga-cartao/RecargaCartaoFields';
import { hasEnabledModule } from '../utils/acessoProduto';
import {
  applyTipoSolicitacaoModuleAvailability,
  getTipoSolicitacaoBehavior,
  normalizeTipoToken,
  obterRotuloDataSolicitacao
} from '../utils/tipoSolicitacao';
import { obterOpcoesNovaSolicitacaoFrontend, resolverCamposNovaSolicitacaoFrontend } from '../utils/novaSolicitacaoCampos';
import {
  normalizarConfigAutomacaoDestinoNovaSolicitacao,
  obterRegraAutomacaoDestinoNovaSolicitacao
} from '../utils/novaSolicitacaoAutomacaoDestino';
import { getCpfCnpjError, getPixDocumentError, maskCep, maskCpfCnpj, maskPhone, onlyDigits } from '../utils/formatters';
import {
  UPLOAD_DOCUMENT_ACCEPT,
  UPLOAD_MAX_FILE_SIZE_MB_PADRAO,
  arquivoDocumentoPermitido,
  concatenarAnexosPendentes,
  extrairFilesAnexosPendentes,
  montarMensagemArquivosAcimaDoLimite,
  montarMensagemTiposArquivoNaoPermitidos
} from '../utils/pendingAttachments';
import {
  chavePixPreferencial,
  formaPagamentoEhBoleto,
  formaPagamentoEhPix,
  formaPagamentoPermitidaDespesaEventual
} from '../utils/formaPagamento';

function normalizarBusca(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function isTipoCompraDireta(tipo) {
  const token = normalizarBusca(tipo?.codigo_interno || tipo?.nome).replace(/[^A-Z0-9]+/g, '_');
  return token === 'COMPRA_DIRETA';
}

function isTipoRecargaCartao(tipo, comportamento = {}) {
  if (comportamento?.usa_fluxo_recarga_cartao === true) return true;
  const token = normalizarBusca(tipo?.codigo_interno || tipo?.nome).replace(/[^A-Z0-9]+/g, '_');
  return token === 'RECARGA_DE_CARTAO';
}

function formatarLocalidadeObra(obra) {
  if (!obra) return 'Localidade nao informada';
  return [obra.cidade, obra.estado].filter(Boolean).join(' / ') || 'Localidade nao informada';
}

function formatarRotuloBuscaObra(obra) {
  if (!obra) return '';
  const codigo = String(obra.codigo || '').trim();
  const nome = String(obra.nome || '').trim();
  if (codigo && nome) return `${codigo} - ${nome}`;
  return codigo || nome;
}

function formatarCredor(credor) {
  if (!credor) return '';
  const nome = String(credor.nome || '').trim();
  const documento = String(credor.cpf_cnpj || '').trim();
  if (nome && documento) return `${nome} - ${documento}`;
  return nome || documento || `Credor ${credor.id}`;
}

function isCadastroObra(obra) {
  return String(obra?.tipo_centro_custo || 'OBRA').trim().toUpperCase() === 'OBRA';
}

function getTipoCentroCustoLabel(obra) {
  return isCadastroObra(obra) ? 'Obra' : 'Centro de custo';
}

const PIX_TIPOS_CHAVE = [
  { value: 'CPF', label: 'CPF' },
  { value: 'CNPJ', label: 'CNPJ' },
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'TELEFONE', label: 'Telefone' },
  { value: 'ALEATORIA', label: 'Aleatoria' }
];

function criarNovoParceiroPadrao() {
  return {
    cpf_cnpj: '',
    nome: '',
    telefone: '',
    email: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cep: '',
    municipio: '',
    estado: '',
    pix_chave_fixa_1_tipo: 'CPF',
    pix_chave_fixa_1: '',
    pix_chave_fixa_2_tipo: 'CNPJ',
    pix_chave_fixa_2: '',
    pix_chave_variavel_tipo: 'ALEATORIA',
    pix_chave_variavel: '',
    cliente: false,
    fornecedor: true,
    corretor: false,
    categoria_ids: []
  };
}

function criarChaveIdempotenciaSolicitacao() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sol-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export default function NovaSolicitacao() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const moduloContratosHabilitado = hasEnabledModule(user, 'CONTRATOS');
  const moduloApropriacoesHabilitado = hasEnabledModule(user, 'OBRAS');
  const [obras, setObras] = useState([]);
  const [obraBusca, setObraBusca] = useState('');
  const [obraBuscaAtiva, setObraBuscaAtiva] = useState(false);
  const [tipos, setTipos] = useState([]);
  const [catalogoDestino, setCatalogoDestino] = useState({ status: 'idle', contexto: null, destino: null, erro: '' });
  const [camposNovaSolicitacaoConfig, setCamposNovaSolicitacaoConfig] = useState({ regras: {} });
  const [automacaoDestinoConfig, setAutomacaoDestinoConfig] = useState({ destinos_disponiveis: [], regras: {} });
  const [tiposSub, setTiposSub] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [contratosRef, setContratosRef] = useState([]);
  const [apropriacoes, setApropriacoes] = useState([]);
  const [apropriacaoAutomatica, setApropriacaoAutomatica] = useState({
    status: 'idle',
    apropriacao: null,
    erro: ''
  });
  const [apropriacoesContratoRateio, setApropriacoesContratoRateio] = useState([]);
  const [refContratoBusca, setRefContratoBusca] = useState('');
  const [refResultados, setRefResultados] = useState([]);
  const [parceiroBusca, setParceiroBusca] = useState('');
  const [parceiroResultados, setParceiroResultados] = useState([]);
  const [parceiroSelecionado, setParceiroSelecionado] = useState(null);
  const [favorecidoSelecionado, setFavorecidoSelecionado] = useState(null);
  const [usarCredorComoFavorecido, setUsarCredorComoFavorecido] = useState(false);
  const [formasPagamentoSolicitacao, setFormasPagamentoSolicitacao] = useState([]);
  const [erroFormasPagamento, setErroFormasPagamento] = useState('');
  const [parceiroBuscando, setParceiroBuscando] = useState(false);
  const [parceiroBuscaExecutada, setParceiroBuscaExecutada] = useState(false);
  const [modalParceiroAberto, setModalParceiroAberto] = useState(false);
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  /*
    VALIDAÇÃO CAMPO A CAMPO (R3 da DoD, item 5 do contrato desta rodada).

    As 60+ validações do envio diziam o que faltava numa caixa do navegador,
    longe do campo que faltava preencher. Trocar `alert` por `Avisos` moveria
    a mesma frase para o topo da página — continuaria longe. O erro passa a
    morar NO CAMPO (`erro` do `CampoForm`), com a MESMA condição e a MESMA
    mensagem de antes: nada foi afrouxado nem endurecido.

    Fica em `Avisos` só o que não tem campo nesta tela para receber a
    mensagem — condição de contexto (contrato em outro setor, saldo ainda
    calculando) e campo que pertence a um componente compartilhado
    (BlocoContratoFluxoNovo, BlocoMedicaoContrato, RecargaCartaoFields,
    RateioApropriacoesContrato), que não tem entrada de erro.
  */
  const [errosCampo, setErrosCampo] = useState({});
  const [modalCredoresContratoAberto, setModalCredoresContratoAberto] = useState(false);
  const [credorContratoSugestoesAbertas, setCredorContratoSugestoesAbertas] = useState(false);
  const [credorContratoModalBusca, setCredorContratoModalBusca] = useState('');
  const [categoriasParceiro, setCategoriasParceiro] = useState([]);
  const [novoParceiro, setNovoParceiro] = useState(criarNovoParceiroPadrao);
  const [arquivos, setArquivos] = useState([]);
  const [boletoArquivos, setBoletoArquivos] = useState([]);
  const [despesaEventualSaldo, setDespesaEventualSaldo] = useState({ status: 'idle', dados: null, erro: '' });
  const [despesaEventualDeclaracoes, setDespesaEventualDeclaracoes] = useState({
    despesa_pontual_nao_recorrente: false,
    sem_vinculo_contratual: false,
    nao_fracionada: false
  });
  const [cartaoRecargaId, setCartaoRecargaId] = useState('');
  const [recargaCartaoContexto, setRecargaCartaoContexto] = useState(null);
  const [criandoSolicitacao, setCriandoSolicitacao] = useState(false);
  const [valorTexto, setValorTexto] = useState('');
  const [contratoNovoDados, setContratoNovoDados] = useState(null);
  // Rateio da apropriacao do CONTRATO (19/08): varias apropriacoes, por % ou por R$.
  // Comeca com uma linha vazia — o caso de uma apropriacao so continua sendo o normal.
  const [rateioContrato, setRateioContrato] = useState([{ apropriacao_id: '', percentual: '100', valor: '' }]);
  const [medicaoContratoDados, setMedicaoContratoDados] = useState(null);
  const [retornoContrato, setRetornoContrato] = useState({
    aberto: false,
    motivo: '',
    processando: false,
    erro: ''
  });
  // PI-15: o aditivo virou uma ACAO sobre o contrato, pedida por um modal na tela de medicao.
  // Nao e mais um subtipo da Nova Solicitacao, e nao participa do envio deste formulario.
  const [modalAditivoAberto, setModalAditivoAberto] = useState(false);
  const anexosRef = useRef(null);
  const boletoRef = useRef(null);
  const campoObraRef = useRef(null);
  const campoCredorContratoRef = useRef(null);
  const automacaoDestinoExecutadaRef = useRef('');
  const criandoSolicitacaoRef = useRef(false);

  /*
    AS DUAS CAMADAS DE SUGESTAO FECHAM AO CLICAR FORA (05/09).

    Sao duas nesta tela: as sugestoes de OBRA/CENTRO DE CUSTO e a lista de
    CREDORES DO CONTRATO. As duas fechavam por perda de foco com
    `setTimeout` (120ms na do credor, 120ms na da obra, esta ultima com um
    `obraBuscaBlurTimeoutRef` para o foco de volta cancelar o fechamento
    agendado). O atraso nao era desenho: as opcoes escolhem no `onClick`, que
    so dispara no `mouseup`, e sem a espera o fechamento por foco derrubava a
    linha antes do clique terminar.

    O que o mecanismo antigo nao cobria: rolar a pagina, clicar num rotulo ou
    abrir outro painel com o foco preso no campo — a camada ficava aberta por
    cima do formulario, que aqui e longo e cheio de blocos. Na obra nem `Esc`
    havia.

    Agora quem fecha e o `useFecharAoSair`: `mousedown`/`touchstart` fora e
    `Escape` no documento inteiro (na lista do credor o `Esc` do `onKeyDown`
    continua, para quem esta digitando).

    POR QUE A SELECAO SOBREVIVE: cada ref cobre o `div` que embrulha o input
    E a lista de sugestoes, entao o `mousedown` sobre uma opcao e DENTRO — o
    hook nao fecha, a linha continua montada ate o `mouseup` e o `onClick`
    (`selecionarObra` / `selecionarParceiro`) roda. As opcoes ja tinham
    `onMouseDown={e => e.preventDefault()}`, que segura o foco no input.

    Fechar e so desligar a camada: `selecionarObra` e `selecionarParceiro`
    e que gravam o valor e o texto do campo, e nao dependem do fechamento.
  */
  useFecharAoSair(campoObraRef, obraBuscaAtiva, () => setObraBuscaAtiva(false));
  useFecharAoSair(
    campoCredorContratoRef,
    credorContratoSugestoesAbertas,
    () => setCredorContratoSugestoesAbertas(false)
  );

  const [form, setForm] = useState({
    obra_id: '',
    parceiro_id: '',
    apropriacao_id: '',
    tipo_solicitacao_id: '',
    tipo_sub_id: '',
    contrato_id: '',
    codigo_contrato: '',
    area_responsavel: '',
    descricao: '',
    justificativa: '',
    favorecido_id: '',
    forma_pagamento_id: '',
    favorecido_chave_pix: '',
    itens_apropriacao: '',
    ref_contrato_abertura: '',
    valor: '',
    data_vencimento: '',
    data_demissao: '',
    data_inicio_medicao: '',
    data_fim_medicao: ''
  });

  const obraSelecionada = useMemo(
    () => obras.find((obra) => String(obra.id) === String(form.obra_id)) || null,
    [obras, form.obra_id]
  );
  const obraSelecionadaEhObra = isCadastroObra(obraSelecionada);

  useEffect(() => {
    async function load() {
      setObras(await getMinhasObras({ modo: 'CRIACAO', escopo: 'TODOS' }));
      try {
        const [cfgCamposNovaSolicitacao, cfgAutomacaoDestino] = await Promise.all([
          getCamposNovaSolicitacao(),
          getAutomacaoDestinoNovaSolicitacao()
        ]);
        setCamposNovaSolicitacaoConfig({
          regras: cfgCamposNovaSolicitacao?.regras && typeof cfgCamposNovaSolicitacao.regras === 'object'
            ? cfgCamposNovaSolicitacao.regras
            : {}
        });
        setAutomacaoDestinoConfig(normalizarConfigAutomacaoDestinoNovaSolicitacao(cfgAutomacaoDestino));
      } catch (error) {
        console.error(error);
        setCamposNovaSolicitacaoConfig({ regras: {} });
        setAutomacaoDestinoConfig({ destinos_disponiveis: [], regras: {} });
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!form.obra_id) {
      setTipos([]);
      setCatalogoDestino({ status: 'idle', contexto: null, destino: null, erro: '' });
      setForm((atual) => ({
        ...atual,
        area_responsavel: '',
        tipo_solicitacao_id: '',
        tipo_sub_id: ''
      }));
      return undefined;
    }

    let cancelado = false;
    setCatalogoDestino({ status: 'loading', contexto: null, destino: null, erro: '' });
    getTiposSolicitacaoDisponiveis(form.obra_id)
      .then((data) => {
        if (cancelado) return;
        const tiposDisponiveis = Array.isArray(data?.tipos) ? data.tipos : [];
        const idsDisponiveis = new Set(tiposDisponiveis.map((tipo) => String(tipo.id)));
        setTipos(tiposDisponiveis);
        setCatalogoDestino({
          status: 'success',
          contexto: data?.contexto || null,
          destino: data?.destino_inicial || null,
          erro: ''
        });
        setForm((atual) => ({
          ...atual,
          area_responsavel: data?.destino_inicial?.codigo || '',
          tipo_solicitacao_id: idsDisponiveis.has(String(atual.tipo_solicitacao_id))
            ? atual.tipo_solicitacao_id
            : '',
          tipo_sub_id: idsDisponiveis.has(String(atual.tipo_solicitacao_id))
            ? atual.tipo_sub_id
            : ''
        }));
      })
      .catch((error) => {
        if (cancelado) return;
        setTipos([]);
        setCatalogoDestino({
          status: 'error',
          contexto: null,
          destino: null,
          erro: error?.message || 'Não foi possível carregar os tipos disponíveis.'
        });
        setForm((atual) => ({
          ...atual,
          area_responsavel: '',
          tipo_solicitacao_id: '',
          tipo_sub_id: ''
        }));
      });

    return () => { cancelado = true; };
  }, [form.obra_id]);

  useEffect(() => {
    if (!form.tipo_solicitacao_id) {
      setTiposSub([]);
      setForm(prev => ({ ...prev, tipo_sub_id: '' }));
      return undefined;
    }

    let cancelado = false;
    async function loadSub() {
      const data = await getTiposSubContrato({
        tipo_macro_id: form.tipo_solicitacao_id
      });
      if (cancelado) return;
      setTiposSub(Array.isArray(data) ? data.filter(item => item?.ativo !== false) : []);
    }

    loadSub();
    return () => {
      cancelado = true;
    };
  }, [form.tipo_solicitacao_id]);

  useEffect(() => {
    if (!form.obra_id) {
      setContratos([]);
      setForm(prev => ({ ...prev, contrato_id: '', ref_contrato_abertura: '' }));
      setContratosRef([]);
      setApropriacoes([]);
      setApropriacoesContratoRateio([]);
      setForm(prev => ({ ...prev, apropriacao_id: '', itens_apropriacao: '' }));
      return;
    }

    if (!obraSelecionadaEhObra) {
      setContratos([]);
      setContratosRef([]);
      setApropriacoes([]);
      setRefContratoBusca('');
      setRefResultados([]);
      setApropriacoesContratoRateio([]);
      setForm(prev => ({
        ...prev,
        contrato_id: '',
        codigo_contrato: '',
        apropriacao_id: '',
        itens_apropriacao: ''
      }));
      return;
    }

    async function loadDependenciasObra() {
      const tarefas = [
        moduloContratosHabilitado
          ? getContratos({ obra_id: form.obra_id, modo: 'CRIACAO' })
          : Promise.resolve([]),
        moduloApropriacoesHabilitado
          ? listarApropriacoes({ obra_id: form.obra_id })
          : Promise.resolve([])
      ];

      const [contratosResult, apropriacoesResult] = await Promise.allSettled(tarefas);

      if (contratosResult.status === 'fulfilled') {
        setContratos(Array.isArray(contratosResult.value) ? contratosResult.value : []);
      } else {
        console.error(contratosResult.reason);
        setContratos([]);
      }

      if (apropriacoesResult.status === 'fulfilled') {
        setApropriacoes(Array.isArray(apropriacoesResult.value) ? apropriacoesResult.value : []);
      } else {
        console.error(apropriacoesResult.reason);
        setApropriacoes([]);
      }

      setContratosRef([]);
    }

    loadDependenciasObra();
  }, [form.obra_id, obraSelecionadaEhObra, moduloContratosHabilitado, moduloApropriacoesHabilitado]);

  // O erro do campo sai assim que a pessoa mexe nele — mensagem de validação
  // que sobrevive à correção vira ruído e ensina a ignorar a próxima.
  function limparErroCampo(campo) {
    setErrosCampo((atual) => (atual[campo] ? { ...atual, [campo]: '' } : atual));
  }

  // Uma reprovação por envio, como sempre foi: a validação é uma cadeia de
  // `return` e para no primeiro problema. O que muda é ONDE a frase aparece.
  function reprovarCampo(campo, mensagem) {
    setErrosCampo({ [campo]: mensagem });
  }

  /*
    MENSAGEM QUE PRECEDE UMA SAÍDA DA TELA.

    A faixa de avisos morre junto com a tela: `avisar.erro(...)` seguido de
    `navigate(...)` mostra a mensagem por um quadro e some. Estes casos —
    "o contrato foi criado MAS o anexo não subiu" — são exatamente os que a
    pessoa precisa ler, porque instruem uma correção na outra tela.

    A caixa do navegador dava isso de graça, bloqueando. O equivalente do
    sistema é o modal: ele espera a leitura e a navegação acontece depois.
    Os dois botões significam a mesma coisa (ciente) — não há consentimento
    em jogo aqui, só leitura, então o retorno não é lido.
  */
  async function avisarAntesDeSair(titulo, mensagem) {
    await confirmar({ titulo, mensagem, rotuloConfirmar: 'Entendi', rotuloCancelar: 'Fechar' });
  }

  function handleChange(e) {
    const { name, value } = e.target;
    limparErroCampo(name);
    if (name === 'tipo_solicitacao_id') {
      // Um subtipo pertence ao tipo anterior. Limpar no mesmo evento evita que a regra
      // `tipo:subtipo` antiga continue controlando os campos enquanto a nova lista carrega.
      setTiposSub([]);
      setForm((atual) => ({
        ...atual,
        tipo_solicitacao_id: value,
        tipo_sub_id: ''
      }));
      return;
    }
    setForm((atual) => ({ ...atual, [name]: value }));
  }

  function normalizarDocumento(valor) {
    return onlyDigits(valor);
  }

  function selecionarParceiro(parceiro) {
    setParceiroSelecionado(parceiro);
    setForm(prev => ({ ...prev, parceiro_id: String(parceiro.id) }));
    setParceiroBusca(parceiro.nome || parceiro.cpf_cnpj || '');
    setParceiroResultados([]);
    setParceiroBuscaExecutada(false);
    setCredorContratoSugestoesAbertas(false);
    setModalCredoresContratoAberto(false);
  }

  function limparParceiroSelecionado() {
    if (usarCredorComoFavorecido) {
      setUsarCredorComoFavorecido(false);
      setFavorecidoSelecionado(null);
      setForm(prev => ({ ...prev, parceiro_id: '', favorecido_id: '', favorecido_chave_pix: '' }));
    } else {
      setForm(prev => ({ ...prev, parceiro_id: '' }));
    }
    setParceiroSelecionado(null);
    setParceiroBusca('');
    setParceiroResultados([]);
    setParceiroBuscaExecutada(false);
    setCredorContratoSugestoesAbertas(false);
  }

  async function buscarParceirosRelacionados({ automatico = false } = {}) {
    try {
      const termo = parceiroBusca.trim();
      if (!termo) return;
      setParceiroBuscando(true);
      setParceiroBuscaExecutada(true);
      const data = await buscarParceiros({ q: termo, fornecedor: 1, ativo: 1, limit: 20 });
      const lista = Array.isArray(data) ? data : [];
      setParceiroResultados(lista);

      // So auto-seleciona no clique do botao. Na busca AO DIGITAR isso seria hostil: a pessoa
      // digita "JOAO", cai em um resultado unico e o campo se fecha sozinho antes de ela terminar
      // de escrever o nome inteiro.
      if (!automatico && lista.length === 1) {
        selecionarParceiro(lista[0]);
      }
    } catch (error) {
      console.error(error);
      // Busca automatica nao interrompe a digitacao com alerta: quem esta escrevendo nao pediu
      // esta busca, e um popup a cada tecla seria pior que o erro.
      if (!automatico) avisar.erro(error.message || 'Erro ao buscar credores');
    } finally {
      setParceiroBuscando(false);
    }
  }


  async function salvarNovoParceiro() {
    try {
      // O backend recusa igual (PI-20). Barrar aqui evita a viagem so para receber o 400, e a
      // mensagem lista o que falta em vez de dizer apenas "cadastro incompleto".
      const faltando = [
        ['nome', 'Nome'], ['cpf_cnpj', 'CPF/CNPJ'], ['endereco', 'Logradouro'], ['numero', 'Numero'],
        ['bairro', 'Bairro'], ['cep', 'CEP'], ['municipio', 'Municipio'], ['estado', 'UF']
      ].filter(([campo]) => !String(novoParceiro[campo] || '').trim()).map(([, rotulo]) => rotulo);

      if (faltando.length > 0) {
        avisar.alerta(`Complete o cadastro do credor. Falta: ${faltando.join(', ')}.`);
        return;
      }
      const documentoErro = getCpfCnpjError(novoParceiro.cpf_cnpj, { required: true });
      if (documentoErro) {
        avisar.alerta(documentoErro);
        return;
      }
      const pixErro = [
        ['pix_chave_fixa_1_tipo', 'pix_chave_fixa_1', 'Chave PIX fixa 1'],
        ['pix_chave_fixa_2_tipo', 'pix_chave_fixa_2', 'Chave PIX fixa 2'],
        ['pix_chave_variavel_tipo', 'pix_chave_variavel', 'Chave PIX variavel']
      ].map(([tipo, chave, label]) => getPixDocumentError(novoParceiro[chave], novoParceiro[tipo], label)).find(Boolean);
      if (pixErro) {
        avisar.alerta(pixErro);
        return;
      }

      const payload = {
        ...novoParceiro,
        cpf_cnpj: normalizarDocumento(novoParceiro.cpf_cnpj),
        telefone: onlyDigits(novoParceiro.telefone),
        cep: onlyDigits(novoParceiro.cep)
      };

      const parceiro = await criarCredorNovaSolicitacao({
        ...payload,
        tipo_solicitacao_id: form.tipo_solicitacao_id,
        area_responsavel: form.area_responsavel,
        contrato_id: permitirCredorAvulsoComContrato ? null : (form.contrato_id || null)
      });
      selecionarParceiro(parceiro);
      setNovoParceiro(criarNovoParceiroPadrao());
      setModalParceiroAberto(false);
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao cadastrar credor');
    }
  }

  function limparSelecaoObraERegras() {
    setTipos([]);
    setCatalogoDestino({ status: 'idle', contexto: null, destino: null, erro: '' });
    setForm(prev => ({
      ...prev,
      obra_id: '',
      area_responsavel: '',
      apropriacao_id: '',
      tipo_solicitacao_id: '',
      tipo_sub_id: '',
      contrato_id: '',
      codigo_contrato: '',
      parceiro_id: '',
      favorecido_id: '',
      forma_pagamento_id: '',
      favorecido_chave_pix: '',
      justificativa: ''
    }));
    setContratos([]);
    setApropriacoes([]);
    setContratosRef([]);
    setRefContratoBusca('');
    setRefResultados([]);
    setApropriacoesContratoRateio([]);
    limparParceiroSelecionado();
    setFavorecidoSelecionado(null);
    setUsarCredorComoFavorecido(false);
    setBoletoArquivos([]);
    if (boletoRef.current) boletoRef.current.value = '';
  }

  /*
    R21/R26 — LIMPAR A OBRA APAGA A SOLICITAÇÃO INTEIRA.

    `limparSelecaoObraERegras` zera obra, setor, tipo, subtipo, contrato,
    credor, favorecido, forma de pagamento, justificativa e o boleto anexado:
    é o botão de maior perda desta tela, e não perguntava nada. Como a
    confirmação do sistema NÃO congela a página (ao contrário do `confirm` do
    navegador), o alvo é fixado numa `const` ANTES do `await` e a mensagem
    nomeia a obra que a pessoa está vendo — não a que estiver selecionada
    quando ela responder.

    A limpeza AUTOMÁTICA (quando o texto digitado deixa de bater com a obra
    escolhida, em `handleChangeBuscaObra`) continua sem pergunta: ali quem
    está desfazendo a escolha é a própria digitação.
  */
  async function limparBuscaObra() {
    const obraAlvo = obraSelecionada;
    const rotuloAlvo = formatarRotuloBuscaObra(obraAlvo) || 'a obra/centro de custo selecionada';
    const { ok } = await confirmar({
      titulo: 'Limpar a solicitação',
      mensagem: `Limpar ${rotuloAlvo} apaga também setor, tipo, contrato, credor, favorecido, forma de pagamento e justificativa já preenchidos aqui.`,
      rotuloConfirmar: 'Limpar',
      destrutiva: true
    });
    if (!ok) return;
    limparSelecaoObraERegras();
    setObraBusca('');
    setObraBuscaAtiva(false);
  }

  const tipoSelecionado = tipos.find(t => String(t.id) === String(form.tipo_solicitacao_id));
  const comportamentoTipo = useMemo(() => {
    const comportamentoBase = getTipoSolicitacaoBehavior(tipoSelecionado);
    return applyTipoSolicitacaoModuleAvailability(comportamentoBase, {
      contratos: moduloContratosHabilitado,
      apropriacoes: moduloApropriacoesHabilitado
    });
  }, [tipoSelecionado, moduloContratosHabilitado, moduloApropriacoesHabilitado]);
  // Derivado do comportamento, nao do nome/id: qualquer tipo configurado como medicao recebe as
  // mesmas exigencias de documento e pagamento condicional.
  const tipoEhDeMedicao = Boolean(
    comportamentoTipo.mostrar_periodo_medicao || comportamentoTipo.exige_periodo_medicao
  );
  const camposNovaSolicitacao = useMemo(() => (
    resolverCamposNovaSolicitacaoFrontend(
      comportamentoTipo,
      camposNovaSolicitacaoConfig,
      form.tipo_solicitacao_id,
      {
        apropriacoesDisponiveis: moduloApropriacoesHabilitado,
        areaResponsavel: form.area_responsavel,
        // Regra do subtipo tem precedencia sobre a do tipo (escopo de contratos 3.1-3.3).
        tipoSubId: form.tipo_sub_id
      }
    )
    // `form.tipo_sub_id` entra aqui porque e lido dentro do memo: sem ele, trocar o subtipo nao
    // re-resolve os campos e a regra `tipo:subtipo` inteira nao tem efeito na tela (o motor, a
    // tela de configuracao e o backend ja resolviam certo — so esta lista estava incompleta).
  ), [comportamentoTipo, camposNovaSolicitacaoConfig, form.tipo_solicitacao_id, form.area_responsavel, form.tipo_sub_id, moduloApropriacoesHabilitado]);
  const tipoConfiguradoComoDespesaEventual = Boolean(comportamentoTipo.usa_fluxo_despesa_eventual);
  const tipoConfiguradoComoRecargaCartao = isTipoRecargaCartao(tipoSelecionado, comportamentoTipo);
  const tipoEhAdmLocalObra = normalizeTipoToken(
    tipoSelecionado?.codigo_interno || tipoSelecionado?.nome
  ) === 'ADM_LOCAL_DE_OBRA';
  const tipoSolicitacaoEscolhido = Boolean(form.tipo_solicitacao_id);
  const camposFixosDespesaEventual = new Set([
    'valor',
    'credor',
    'favorecido',
    'forma_pagamento',
    'apropriacao_principal',
    'subtipo',
    'justificativa',
    'anexos',
    'data_vencimento'
  ]);
  const camposFixosRecargaCartao = new Set(['valor', 'data_vencimento']);
  const campoVisivel = (campo) => {
    // Antes de o tipo ser escolhido, nenhum campo funcional deve herdar o comportamento
    // generico. A obra, o setor e o proprio tipo continuam fixos no topo; o restante entra
    // somente depois que a regra do tipo (e, quando houver, do subtipo) puder ser resolvida.
    if (!tipoSolicitacaoEscolhido) return false;
    if (tipoConfiguradoComoRecargaCartao) return camposFixosRecargaCartao.has(campo);
    return (tipoConfiguradoComoDespesaEventual && camposFixosDespesaEventual.has(campo))
      || camposNovaSolicitacao?.[campo]?.visivel !== false;
  };
  const campoObrigatorio = (campo) => {
    if (!tipoSolicitacaoEscolhido) return false;
    if (tipoConfiguradoComoRecargaCartao) return camposFixosRecargaCartao.has(campo);
    return (tipoConfiguradoComoDespesaEventual && camposFixosDespesaEventual.has(campo))
      || Boolean(camposNovaSolicitacao?.[campo]?.obrigatorio);
  };
  const opcoesNovaSolicitacao = useMemo(() => (
    obterOpcoesNovaSolicitacaoFrontend(
      camposNovaSolicitacaoConfig,
      form.tipo_solicitacao_id,
      form.area_responsavel
    )
  ), [camposNovaSolicitacaoConfig, form.tipo_solicitacao_id, form.area_responsavel]);
  // Campo que nao aparece nao pode ser exigido — a guarda usa `exibirCampoSubtipo`, definido logo
  // abaixo, e por isso a exigencia e resolvida junto dele.
  const subtipoObrigatorio = campoObrigatorio('subtipo');
  const medicaoObrigatoria = campoObrigatorio('periodo_medicao');
  const solicitacaoCompra = !comportamentoTipo.mostrar_apropriacao_principal && !comportamentoTipo.mostrar_valor;
  // Fluxo novo de contratos (D38): a flag vem do JSON comportamento do tipo, mesmo estilo
  // da derivacao acima — nunca por nome de tipo.
  const usaFluxoContratoNovo = Boolean(comportamentoTipo.usa_fluxo_contrato_novo);
  const usaFluxoDespesaEventual = tipoConfiguradoComoDespesaEventual;
  const usaFluxoRecargaCartao = tipoConfiguradoComoRecargaCartao;
  const usaApropriacaoAutomaticaObra = Boolean(comportamentoTipo.usa_apropriacao_automatica_obra);
  const rotuloDataSolicitacao = obterRotuloDataSolicitacao(comportamentoTipo, {
    recargaCartao: usaFluxoRecargaCartao
  });
  const rotuloContratoVinculado = 'Ref. do Contrato';
  const placeholderContratoVinculado = 'Buscar por referência do contrato';

  useEffect(() => {
    if (!usaApropriacaoAutomaticaObra || !form.obra_id || !form.tipo_solicitacao_id) {
      setApropriacaoAutomatica({ status: 'idle', apropriacao: null, erro: '' });
      return undefined;
    }

    let cancelado = false;
    setApropriacaoAutomatica({ status: 'loading', apropriacao: null, erro: '' });
    getApropriacaoPadraoSolicitacao({
      obra_id: form.obra_id,
      tipo_solicitacao_id: form.tipo_solicitacao_id
    })
      .then((data) => {
        if (cancelado) return;
        setApropriacaoAutomatica({
          status: data?.apropriacao ? 'success' : 'error',
          apropriacao: data?.apropriacao || null,
          erro: data?.apropriacao ? '' : 'A apropriacao automatica nao esta configurada para esta obra.'
        });
      })
      .catch((error) => {
        if (cancelado) return;
        setApropriacaoAutomatica({
          status: 'error',
          apropriacao: null,
          erro: error?.message || 'Nao foi possivel conferir a apropriacao automatica.'
        });
      });

    return () => {
      cancelado = true;
    };
  }, [usaApropriacaoAutomaticaObra, form.obra_id, form.tipo_solicitacao_id]);

  useEffect(() => {
    if (!usaFluxoDespesaEventual || !form.obra_id) {
      setDespesaEventualSaldo({ status: 'idle', dados: null, erro: '' });
      return undefined;
    }

    let cancelado = false;
    setDespesaEventualSaldo({ status: 'loading', dados: null, erro: '' });
    getSaldoDespesaEventual(form.obra_id)
      .then((dados) => {
        if (!cancelado) setDespesaEventualSaldo({ status: 'success', dados, erro: '' });
      })
      .catch((error) => {
        if (!cancelado) {
          setDespesaEventualSaldo({
            status: 'error',
            dados: null,
            erro: error?.message || 'Nao foi possivel calcular o saldo da obra.'
          });
        }
      });

    return () => { cancelado = true; };
  }, [usaFluxoDespesaEventual, form.obra_id]);

  useEffect(() => {
    if (usaFluxoDespesaEventual) return;
    setDespesaEventualDeclaracoes({
      despesa_pontual_nao_recorrente: false,
      sem_vinculo_contratual: false,
      nao_fracionada: false
    });
  }, [usaFluxoDespesaEventual]);

  useEffect(() => {
    if (usaFluxoRecargaCartao) return;
    setCartaoRecargaId('');
    setRecargaCartaoContexto(null);
  }, [usaFluxoRecargaCartao]);

  function limparCamposNovaRecargaAposReenvio() {
    setCartaoRecargaId('');
    setRecargaCartaoContexto(null);
    setValorTexto('');
    setForm((atual) => ({ ...atual, valor: '', data_vencimento: '' }));
  }

  // O limite vem da configuracao (`CONTRATO_LIMITE_JURIDICO`). A constante da tela ficou apenas
  // como fallback: com o numero fixo aqui, mudar o limite pela tela de configuracao fazia a tela
  // cobrar num corte e o backend rotear noutro.
  const [limiteJuridico, setLimiteJuridico] = useState(LIMITE_DETALHES_CONTRATO);
  // Conferencia do cadastro dos contratados, exigida acima do limite (20/08).
  const [modalCredoresAberto, setModalCredoresAberto] = useState(false);
  const [credoresParaConferir, setCredoresParaConferir] = useState([]);

  useEffect(() => {
    if (!usaFluxoContratoNovo) return undefined;
    let cancelado = false;
    getLimiteJuridico()
      .then((r) => { if (!cancelado && Number(r?.limite) > 0) setLimiteJuridico(Number(r.limite)); })
      // Falha aqui mantem o fallback: e melhor cobrar no corte antigo do que nao cobrar.
      .catch(() => {});
    return () => { cancelado = true; };
  }, [usaFluxoContratoNovo]);
  const exigeApropriacaoPrincipal =
    Boolean(form.tipo_solicitacao_id) &&
    obraSelecionadaEhObra &&
    campoObrigatorio('apropriacao_principal');
  const tipoSemValor = !campoVisivel('valor');
  const exibirCamposContrato = obraSelecionadaEhObra && campoVisivel('contrato');
  const exibirCampoApropriacao = obraSelecionadaEhObra && moduloApropriacoesHabilitado && campoVisivel('apropriacao_principal');
  const camposContratoObrigatorios = campoObrigatorio('contrato');
  // O SUBTIPO SAI DO CONTRATO (item 1 do lote de 23/08). Pelo tipo CONTRATO so existe a abertura,
  // entao o subtipo nao separava nada — e o gatilho do fluxo novo sempre foi do TIPO
  // (`usa_fluxo_contrato_novo`), nunca do subtipo. Nos demais tipos ele continua como sempre.
  //
  // Consequencia registrada no plano: a configuracao de "campos por subtipo" (PI-13) deixa de valer
  // para CONTRATO — passa a valer a do tipo. As solicitacoes antigas guardam o subtipo e seguem
  // legiveis; nada e apagado.
  const exibirCampoSubtipo = campoVisivel('subtipo') && !usaFluxoContratoNovo;
  const exibirCampoCredor = campoVisivel('credor');

  // Busca do credor AO DIGITAR (pedido do cliente, 19/08), sem minimo de caracteres: procura desde
  // a primeira letra. O atraso existe para nao disparar uma consulta por tecla — e cancelado a
  // cada digito novo, entao so a ultima palavra digitada vira consulta.
  useEffect(() => {
    if (!exibirCampoCredor) return undefined;
    const termo = parceiroBusca.trim();
    if (!termo || parceiroSelecionado) return undefined;
    const id = window.setTimeout(() => { void buscarParceirosRelacionados({ automatico: true }); }, 350);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parceiroBusca, parceiroSelecionado, exibirCampoCredor]);

  const exibirCadastroCredor = campoVisivel('cadastro_credor');
  const permitirVinculoCredor = exibirCampoCredor || exibirCadastroCredor;
  const permitirCredorAvulsoComContrato = opcoesNovaSolicitacao.permitir_credor_avulso_com_contrato === true;
  const restringirCredorAoContrato = exibirCamposContrato && !permitirCredorAvulsoComContrato;
  // Esta e a data operacional da SOLICITACAO (resposta/pagamento), inclusive no fluxo novo de
  // contratos. Os vencimentos do cronograma continuam independentes e ficam em cada parcela.
  const exibirDataVencimento = campoVisivel('data_vencimento');
  // Campo invisivel nao pode ser exigido: sem esta guarda o submit ficaria travado por um
  // campo que o usuario nao tem como preencher (a validacao roda antes do fluxo do contrato).
  const dataVencimentoObrigatoria = exibirDataVencimento && campoObrigatorio('data_vencimento');
  const exibirDataDemissao = campoVisivel('data_demissao');
  const dataDemissaoObrigatoria = campoObrigatorio('data_demissao');
  const exibirPeriodoMedicao = campoVisivel('periodo_medicao');
  const exibirRefContratoAbertura = campoVisivel('ref_contrato_abertura');
  const exibirItensApropriacao = obraSelecionadaEhObra && campoVisivel('itens_apropriacao');
  const refContratoAberturaObrigatoria = campoObrigatorio('ref_contrato_abertura');
  const itensApropriacaoObrigatorio = campoObrigatorio('itens_apropriacao');
  const apropriacoesContratoObrigatorias =
    Boolean(form.tipo_solicitacao_id) &&
    obraSelecionadaEhObra &&
    exibirCamposContrato &&
    Boolean(form.contrato_id) &&
    (Boolean(comportamentoTipo.exige_apropriacoes_contrato) || campoObrigatorio('apropriacoes_contrato'));
  const exibirDescricao = campoVisivel('descricao');
  const descricaoObrigatoria = campoObrigatorio('descricao');
  const exibirJustificativa = campoVisivel('justificativa') && !usaFluxoContratoNovo;
  const justificativaObrigatoria = exibirJustificativa && campoObrigatorio('justificativa');
  const exibirFormaPagamento = campoVisivel('forma_pagamento') && !usaFluxoContratoNovo;
  // A forma vem primeiro. Depois de selecionada, o favorecido aparece para qualquer pagamento;
  // PIX acrescenta a chave e Boleto acrescenta o anexo especifico.
  const exibirFavorecido = (campoVisivel('favorecido') || exibirFormaPagamento) && !usaFluxoContratoNovo;
  const formaPagamentoObrigatoria = exibirFormaPagamento && campoObrigatorio('forma_pagamento');
  // Em medicao o anexo e regra do fluxo, mesmo que a configuracao visual antiga tenha ocultado o
  // campo: campo invisivel e obrigatorio seria uma tela impossivel de concluir.
  const exibirAnexosConfigurados = campoVisivel('anexos') || tipoEhDeMedicao;
  const formasPagamentoDisponiveis = useMemo(
    () => usaFluxoDespesaEventual
      ? formasPagamentoSolicitacao.filter(formaPagamentoPermitidaDespesaEventual)
      : formasPagamentoSolicitacao,
    [formasPagamentoSolicitacao, usaFluxoDespesaEventual]
  );
  const formaPagamentoSelecionada = useMemo(
    () => formasPagamentoDisponiveis.find((forma) => String(forma.id) === String(form.forma_pagamento_id)) || null,
    [formasPagamentoDisponiveis, form.forma_pagamento_id]
  );
  const pagamentoViaPix = formaPagamentoEhPix(formaPagamentoSelecionada);
  const pagamentoViaBoleto = formaPagamentoEhBoleto(formaPagamentoSelecionada);
  // ADM Local de Obra usa o boleto como documento suficiente. Nas demais formas, o comprovante
  // complementar aparece somente depois da escolha da forma e passa a ser obrigatorio. A regra
  // fica derivada do codigo interno do tipo, sem depender do nome que o administrador exibe.
  const exibirAnexosAdmLocal = tipoEhAdmLocalObra
    && Boolean(formaPagamentoSelecionada)
    && !pagamentoViaBoleto;
  const exibirAnexos = tipoEhAdmLocalObra
    ? exibirAnexosAdmLocal
    : exibirAnexosConfigurados;
  const anexosObrigatorios = tipoEhAdmLocalObra
    ? exibirAnexosAdmLocal
    : (tipoEhDeMedicao || campoObrigatorio('anexos'));
  const exibirFavorecidoPagamento = exibirFavorecido && Boolean(formaPagamentoSelecionada);
  // Se existe uma forma de pagamento escolhida, precisa existir quem recebera. A configuracao
  // pode controlar a presenca do bloco, mas nao pode tornar anonima uma solicitacao de pagamento.
  const favorecidoObrigatorio = exibirFavorecidoPagamento;

  useEffect(() => {
    if (!form.forma_pagamento_id || formasPagamentoSolicitacao.length === 0) return;
    const formaContinuaDisponivel = formasPagamentoDisponiveis.some(
      (forma) => String(forma.id) === String(form.forma_pagamento_id)
    );
    if (formaContinuaDisponivel) return;
    setForm((prev) => ({
      ...prev,
      forma_pagamento_id: '',
      favorecido_chave_pix: ''
    }));
    setBoletoArquivos([]);
  }, [form.forma_pagamento_id, formasPagamentoDisponiveis, formasPagamentoSolicitacao.length]);

  useEffect(() => {
    if (!exibirFormaPagamento) {
      setForm((prev) => ({ ...prev, forma_pagamento_id: '', favorecido_chave_pix: '' }));
      setFormasPagamentoSolicitacao([]);
      setErroFormasPagamento('');
      setBoletoArquivos([]);
      return undefined;
    }

    let cancelado = false;
    setErroFormasPagamento('');
    getFormasPagamentoFluxos()
      .then((resposta) => {
        if (cancelado) return;
        setFormasPagamentoSolicitacao(Array.isArray(resposta?.formas) ? resposta.formas : []);
      })
      .catch((error) => {
        if (cancelado) return;
        setFormasPagamentoSolicitacao([]);
        setErroFormasPagamento(error?.message || 'Nao foi possivel carregar as formas de pagamento.');
      });

    return () => { cancelado = true; };
  }, [exibirFormaPagamento]);

  useEffect(() => {
    if (!exibirFavorecidoPagamento) {
      setFavorecidoSelecionado(null);
      setUsarCredorComoFavorecido(false);
      setForm((prev) => ({ ...prev, favorecido_id: '', favorecido_chave_pix: '' }));
    }
    if (!exibirJustificativa) {
      setForm((prev) => ({ ...prev, justificativa: '' }));
    }
  }, [exibirFavorecidoPagamento, exibirJustificativa]);

  useEffect(() => {
    if (!exibirFavorecidoPagamento || !usarCredorComoFavorecido) return;
    setFavorecidoSelecionado(parceiroSelecionado || null);
    setForm((prev) => ({
      ...prev,
      favorecido_id: parceiroSelecionado?.id ? String(parceiroSelecionado.id) : '',
      favorecido_chave_pix: pagamentoViaPix ? chavePixPreferencial(parceiroSelecionado) : ''
    }));
  }, [exibirFavorecidoPagamento, pagamentoViaPix, parceiroSelecionado, usarCredorComoFavorecido]);

  useEffect(() => {
    if (pagamentoViaBoleto) return;
    setBoletoArquivos([]);
    if (boletoRef.current) boletoRef.current.value = '';
  }, [pagamentoViaBoleto]);

  useEffect(() => {
    if (!exibirCamposContrato) {
      setForm(prev => ({
        ...prev,
        contrato_id: '',
        codigo_contrato: '',
        ref_contrato_abertura: ''
      }));
      setRefContratoBusca('');
      setRefResultados([]);
      setApropriacoesContratoRateio([]);
      setContratosRef([]);
    }
    if (!exibirCampoSubtipo) {
      setForm(prev => ({ ...prev, tipo_sub_id: '' }));
    }
    if (tipoSemValor) {
      setForm(prev => ({ ...prev, valor: '' }));
      setValorTexto('');
    }
    if (!exibirCampoApropriacao) {
      setForm(prev => ({ ...prev, apropriacao_id: '' }));
    }
    if (!permitirVinculoCredor) {
      limparParceiroSelecionado();
    }
    if (!exibirDataVencimento) {
      setForm(prev => ({ ...prev, data_vencimento: '' }));
    }
    if (!exibirDataDemissao) {
      setForm(prev => ({ ...prev, data_demissao: '' }));
    }
    if (!exibirPeriodoMedicao) {
      setForm(prev => ({ ...prev, data_inicio_medicao: '', data_fim_medicao: '' }));
    }
    if (!exibirRefContratoAbertura) {
      setForm(prev => ({ ...prev, ref_contrato_abertura: '' }));
    }
    if (!exibirItensApropriacao) {
      setForm(prev => ({ ...prev, itens_apropriacao: '' }));
    }
    if (!exibirAnexos) {
      setArquivos([]);
      if (anexosRef.current) {
        anexosRef.current.value = '';
      }
    }
  }, [
    exibirCamposContrato,
    exibirCampoSubtipo,
    tipoSemValor,
    exibirCampoApropriacao,
    exigeApropriacaoPrincipal,
    permitirVinculoCredor,
    exibirDataVencimento,
    exibirDataDemissao,
    exibirPeriodoMedicao,
    exibirRefContratoAbertura,
    exibirItensApropriacao,
    exibirAnexos
  ]);

  function formatarMoeda(valor) {
    if (Number.isNaN(valor)) return '';
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function atualizarValor(raw) {
    const numeros = raw.replace(/\D/g, '');
    const valor = numeros ? Number(numeros) / 100 : 0;
    setValorTexto(numeros ? formatarMoeda(valor) : '');
    setForm(prev => ({ ...prev, valor: valor || '' }));
  }

  function parseDecimalRateio(valor) {
    if (valor === null || valor === undefined) return null;
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
    const texto = String(valor).trim();
    if (!texto) return null;
    const limpo = texto.replace(/[^\d,.-]/g, '');
    const normalizado = limpo.includes(',')
      ? limpo.replace(/\./g, '').replace(',', '.')
      : limpo;
    const numero = Number(normalizado);
    return Number.isFinite(numero) ? numero : null;
  }

  function arredondarCentavos(valor) {
    return Math.round((Number(valor) || 0) * 100) / 100;
  }

  function atualizarValorRateioContrato(index, raw) {
    const numeros = String(raw || '').replace(/\D/g, '');
    const valor = numeros ? Number(numeros) / 100 : 0;
    alterarApropriacaoContratoRateio(index, 'valor_rateio', numeros ? formatarMoeda(valor) : '');
  }

  function normalizarApropriacoesContratoParaRateio(contrato) {
    return (Array.isArray(contrato?.apropriacoes) ? contrato.apropriacoes : []).map((item) => ({
      apropriacao_id: String(item.apropriacao_id || item.apropriacao?.id || ''),
      codigo: item.apropriacao?.codigo || '',
      descricao: item.apropriacao?.descricao || '',
      percentual: item.percentual !== null && item.percentual !== undefined ? String(item.percentual) : '',
      valor_rateio: '',
      observacao: item.observacao || '',
      selecionado: false
    })).filter(item => item.apropriacao_id);
  }

  function getCredoresContrato(contrato) {
    return (Array.isArray(contrato?.credores) ? contrato.credores : [])
      .filter(credor => credor?.ativo !== false && (credor?.fornecedor !== false || credor?.corretor === true));
  }

  function aplicarContratoSelecionado(contrato) {
    setRetornoContrato({ aberto: false, motivo: '', processando: false, erro: '' });
    setMedicaoContratoDados(null);
    if (!contrato) {
      setForm(prev => ({
        ...prev,
        contrato_id: '',
        codigo_contrato: '',
        parceiro_id: ''
      }));
      setRefContratoBusca('');
      setApropriacoesContratoRateio([]);
      limparParceiroSelecionado();
      return;
    }

    const credores = getCredoresContrato(contrato);
    setForm(prev => ({
      ...prev,
      contrato_id: String(contrato.id),
      codigo_contrato: contrato.codigo || '',
      parceiro_id: permitirCredorAvulsoComContrato ? prev.parceiro_id : (credores.length === 1 ? String(credores[0].id) : '')
    }));
    // Contrato do fluxo novo nasce sem `ref_contrato` — a referencia dele e o proprio codigo
    // (CT-0001). Sem este fallback o campo obrigatorio ficava vazio e travava o submit da
    // medicao, mesmo com o contrato escolhido na lista.
    setRefContratoBusca(contrato.ref_contrato || contrato.codigo || '');
    setRefResultados([]);
    setApropriacoesContratoRateio(normalizarApropriacoesContratoParaRateio(contrato));
    if (permitirCredorAvulsoComContrato) {
      setParceiroResultados([]);
      setParceiroBuscaExecutada(false);
      return;
    }
    if (credores.length === 1) {
      setParceiroSelecionado(credores[0]);
      setParceiroBusca(credores[0].nome || credores[0].cpf_cnpj || '');
    } else {
      setParceiroSelecionado(null);
      setParceiroBusca('');
    }
    setParceiroResultados([]);
    setParceiroBuscaExecutada(false);
  }

  function atualizarContextoContrato(contratoId, contextoInteracao) {
    const atualizarLista = (lista) => (Array.isArray(lista) ? lista.map((item) => (
      String(item.id) === String(contratoId)
        ? {
          ...item,
          disponivel_medicao: contextoInteracao?.pode_interagir === true,
          contexto_interacao: contextoInteracao
        }
        : item
    )) : []);
    setContratos(atualizarLista);
    setContratosRef(atualizarLista);
  }

  async function solicitarRetornoDoContrato() {
    const motivo = String(retornoContrato.motivo || '').trim();
    const solicitacaoId = Number(contratoSelecionado?.solicitacao_id);
    if (!solicitacaoId || !motivo || retornoContrato.processando) return;

    setRetornoContrato((atual) => ({ ...atual, processando: true, erro: '' }));
    try {
      const resultado = await solicitarRetornoSolicitacao(solicitacaoId, motivo);
      const contextoAtual = contratoSelecionado?.contexto_interacao || {};
      const contextoAtualizado = {
        ...contextoAtual,
        pode_solicitar_retorno: false,
        pedido_retorno_pendente: resultado?.pedido || null
      };
      atualizarContextoContrato(contratoSelecionado.id, contextoAtualizado);
      setRetornoContrato({ aberto: false, motivo: '', processando: false, erro: '' });
    } catch (error) {
      setRetornoContrato((atual) => ({
        ...atual,
        processando: false,
        erro: error?.message || 'Nao foi possivel solicitar o retorno da solicitacao.'
      }));
    }
  }

  function alternarApropriacaoContratoRateio(index, checked) {
    setApropriacoesContratoRateio(prev => prev.map((item, itemIndex) => (
      itemIndex === index ? { ...item, selecionado: checked } : item
    )));
  }

  function alterarApropriacaoContratoRateio(index, campo, valor) {
    setApropriacoesContratoRateio(prev => prev.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [campo]: valor } : item
    )));
  }

  const apropriacoesRateioSelecionadas = useMemo(() => (
    apropriacoesContratoRateio.filter(item => item.selecionado && item.apropriacao_id)
  ), [apropriacoesContratoRateio]);

  async function buscarRefContrato() {
    try {
      if (!form.obra_id) {
        reprovarCampo('ref_contrato', `Selecione uma obra antes de buscar ${tipoEhDeMedicao ? 'o título do contrato' : 'a ref. do contrato'}.`);
        setRefResultados([]);
        setContratosRef([]);
        return;
      }

      const termo = refContratoBusca.trim();
      if (!termo) return;
      const listaBase = Array.isArray(contratos) ? contratos : [];
      const termoNormalizado = termo
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();
      const lista = listaBase.filter(item => {
        const ref = String(item?.ref_contrato || '');
        const refNormalizada = ref
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase();
        return refNormalizada.includes(termoNormalizado);
      });

      if (lista.length === 0) {
        reprovarCampo('ref_contrato', 'Nenhuma referencia encontrada');
        setRefResultados([]);
        setContratosRef([]);
        return;
      }
      setRefResultados(lista);
      setContratosRef(lista);
      if (lista.length === 1) {
        selecionarContratoRef(lista[0]);
      }
    } catch (error) {
      console.error(error);
      avisar.erro('Erro ao buscar referência de contrato');
    }
  }

  function selecionarContratoRef(contrato) {
    aplicarContratoSelecionado(contrato);
  }

  function limparRefContrato() {
    setRefContratoBusca('');
    setRefResultados([]);
    setContratosRef([]);
    setForm(prev => ({ ...prev, contrato_id: '', codigo_contrato: '', parceiro_id: '' }));
    setApropriacoesContratoRateio([]);
    limparParceiroSelecionado();
  }

  /*
    R26 — o arquivo é fixado numa `const` ANTES do `await` e a remoção é feita
    PELA REFERÊNCIA, não pelo índice: com o modal aberto a lista continua
    clicável, e um anexo adicionado nesse meio-tempo deslocaria o índice —
    a pessoa confirmaria a remoção de um arquivo e o sistema removeria outro.
  */
  async function removerArquivo(index) {
    const arquivoAlvo = arquivos[index];
    if (!arquivoAlvo) return;
    const { ok } = await confirmar({
      titulo: 'Remover anexo',
      mensagem: `Remover "${arquivoAlvo.nome || 'este arquivo'}" da lista de anexos desta solicitação?`,
      rotuloConfirmar: 'Remover',
      destrutiva: true
    });
    if (!ok) return;
    setArquivos((prev) => prev.filter((item) => item !== arquivoAlvo));
    limparErroCampo('anexos');
  }

  // Mesma classe de ação (remover item já anexado), mesmo cuidado da R26:
  // o boleto é UM só, mas a referência é fixada antes da pergunta.
  async function removerArquivoBoleto() {
    const boletoAlvo = boletoArquivos[0];
    if (!boletoAlvo) return;
    const { ok } = await confirmar({
      titulo: 'Remover boleto',
      mensagem: `Remover "${boletoAlvo.nome || 'o boleto'}" desta solicitação?`,
      rotuloConfirmar: 'Remover',
      destrutiva: true
    });
    if (!ok) return;
    setBoletoArquivos((prev) => prev.filter((item) => item !== boletoAlvo));
    if (boletoRef.current) boletoRef.current.value = '';
    limparErroCampo('boleto');
  }

  function adicionarArquivos(files) {
    const lista = Array.from(files || []).filter(Boolean);
    const tiposInvalidos = lista.filter((file) => !arquivoDocumentoPermitido(file));
    const tiposValidos = lista.filter((file) => arquivoDocumentoPermitido(file));
    const { arquivos: proximoEstado, rejeitados } = concatenarAnexosPendentes(arquivos, tiposValidos, {
      maxFileSizeMb: UPLOAD_MAX_FILE_SIZE_MB_PADRAO
    });
    setArquivos(proximoEstado);
    if (tiposInvalidos.length > 0) {
      avisar.alerta(montarMensagemTiposArquivoNaoPermitidos(tiposInvalidos));
    }
    if (rejeitados.length > 0) {
      avisar.alerta(montarMensagemArquivosAcimaDoLimite(rejeitados, UPLOAD_MAX_FILE_SIZE_MB_PADRAO));
    }
  }

  function selecionarArquivoBoleto(files) {
    const lista = Array.from(files || []).filter(Boolean);
    const { arquivos: aceitos, rejeitados } = concatenarAnexosPendentes([], lista.slice(0, 1), {
      maxFileSizeMb: UPLOAD_MAX_FILE_SIZE_MB_PADRAO
    });
    setBoletoArquivos(aceitos);
    if (lista.length > 1) {
      avisar.alerta('Selecione somente um arquivo de boleto.');
    }
    if (rejeitados.length > 0) {
      avisar.alerta(montarMensagemArquivosAcimaDoLimite(rejeitados, UPLOAD_MAX_FILE_SIZE_MB_PADRAO));
    }
  }

  function selecionarObra(obra) {
    setForm(prev => ({
      ...prev,
      obra_id: String(obra.id),
      contrato_id: '',
      codigo_contrato: '',
      parceiro_id: '',
      apropriacao_id: '',
      itens_apropriacao: ''
    }));
    setObraBusca(formatarRotuloBuscaObra(obra));
    setObraBuscaAtiva(false);
    limparParceiroSelecionado();
  }

  const obrasFiltradas = useMemo(() => {
    const termo = normalizarBusca(obraBusca);
    if (!termo) return [];

    return obras
      .filter((obra) => {
        const codigo = normalizarBusca(obra.codigo);
        const nome = normalizarBusca(obra.nome);
        const cidade = normalizarBusca(formatarLocalidadeObra(obra));
        return codigo.includes(termo) || nome.includes(termo) || cidade.includes(termo);
      })
      .slice(0, 8);
  }, [obras, obraBusca]);

  const mostrarSugestoesObra = useMemo(() => {
    const termo = normalizarBusca(obraBusca);
    if (!obraBuscaAtiva || !termo) return false;
    if (!obraSelecionada) return true;
    return termo !== normalizarBusca(formatarRotuloBuscaObra(obraSelecionada));
  }, [obraBusca, obraBuscaAtiva, obraSelecionada]);

  function handleChangeBuscaObra(valor) {
    setObraBusca(valor);
    setObraBuscaAtiva(true);

    if (!obraSelecionada) return;

    const termoSelecionado = normalizarBusca(formatarRotuloBuscaObra(obraSelecionada));
    if (normalizarBusca(valor) !== termoSelecionado) {
      limparSelecaoObraERegras();
    }
  }

  function handleFocusBuscaObra() {
    setObraBuscaAtiva(true);
  }

  function handleKeyDownBuscaObra(event) {
    if (event.key !== 'Enter') return;
    if (obrasFiltradas.length !== 1) return;
    event.preventDefault();
    selecionarObra(obrasFiltradas[0]);
  }

  /**
   * `confirmadoNaConferencia` fecha o ciclo do modal de credores: o mesmo submit roda duas vezes
   * acima do limite — a primeira abre a conferencia e para, a segunda (disparada pelo botao do
   * modal) cria. Sem o parametro, seria preciso duplicar toda a validacao num segundo caminho.
   */
  async function handleSubmit(e, { confirmadoNaConferencia = false } = {}) {
    e?.preventDefault?.();

    // Cada envio recomeça a conversa: o erro que sobrou do envio anterior não
    // pode ficar colado num campo que já foi corrigido.
    setErrosCampo({});

    if (!form.obra_id) {
      reprovarCampo('obra_id', 'Selecione uma obra/centro de custo');
      return;
    }

    // Condição de CONTEXTO, não de campo: o contrato está noutro setor. Já
    // aparece na faixa do bloco do contrato; aqui vai para Avisos porque não
    // há campo desta tela para receber a frase.
    if (tipoEhDeMedicao && contratoSelecionadoMedicaoBloqueada) {
      avisar.alerta(
        `A solicitacao deste contrato esta no setor ${contratoSelecionado?.contexto_interacao?.setor_atual || 'responsavel atual'}. `
        + 'Solicite o retorno antes de registrar a medicao.'
      );
      return;
    }

    // Campo do RecargaCartaoFields (componente compartilhado, sem entrada de erro).
    if (usaFluxoRecargaCartao && !cartaoRecargaId) {
      avisar.alerta('Selecione o cartão que receberá a recarga.');
      return;
    }
    if (usaFluxoRecargaCartao && recargaCartaoContexto?.bloqueado) {
      avisar.alerta(recargaCartaoContexto.motivo_bloqueio || 'Conclua a recarga anterior antes de solicitar uma nova.');
      return;
    }

    // Apropriação automática da obra: não há campo na tela (ela é resolvida
    // pelo servidor a partir da obra + tipo).
    if (usaApropriacaoAutomaticaObra && apropriacaoAutomatica.status === 'loading') {
      avisar.alerta('Aguarde a conferência da apropriação automática da obra.');
      return;
    }
    if (usaApropriacaoAutomaticaObra && !apropriacaoAutomatica.apropriacao) {
      avisar.alerta(apropriacaoAutomatica.erro || 'Configure a apropriacao padrao desta obra antes de criar a solicitacao.');
      return;
    }

    // No fluxo novo de contrato a apropriacao virou RATEIO (19/08): quem cumpre a exigencia sao as
    // linhas do rateio, nao o campo unico — que nem e exibido nesse caminho. Validar o campo unico
    // aqui barrava o contrato mesmo com o rateio preenchido.
    const temApropriacao = usaFluxoContratoNovo
      ? rateioContrato.some((l) => l.apropriacao_id)
      : Boolean(form.apropriacao_id);
    if (exigeApropriacaoPrincipal && !temApropriacao) {
      reprovarCampo('apropriacao', usaFluxoContratoNovo
        ? 'Informe ao menos uma apropriacao no rateio do contrato.'
        : 'Selecione a apropriação principal da solicitação.');
      return;
    }

    if (subtipoObrigatorio && exibirCampoSubtipo && !form.tipo_sub_id) {
      reprovarCampo('tipo_sub_id', 'Para continuar, selecione o subtipo.');
      return;
    }
    if (valorObrigatorio && (form.valor === '' || form.valor === null || form.valor === undefined)) {
      reprovarCampo('valor', 'Informe o valor da solicitação.');
      return;
    }
    if (medicaoObrigatoria && (!form.data_inicio_medicao || !form.data_fim_medicao)) {
      // O par de datas mora nesta tela no fluxo antigo e dentro do
      // BlocoMedicaoContrato no fluxo novo — lá não há entrada de erro.
      const mensagemPeriodo = 'Para Medicao, informe data inicial e data final.';
      if (exibirPeriodoMedicaoSolto) reprovarCampo('periodo_medicao', mensagemPeriodo);
      else avisar.alerta(mensagemPeriodo);
      return;
    }
    if (dataVencimentoExigida && !form.data_vencimento) {
      reprovarCampo('data_vencimento', `Informe a ${rotuloDataSolicitacao.toLocaleLowerCase('pt-BR')}.`);
      return;
    }
    if (dataDemissaoObrigatoria && !form.data_demissao) {
      reprovarCampo('data_demissao', 'Informe a data de demissao.');
      return;
    }
    if (camposContratoObrigatorios && !form.contrato_id) {
      reprovarCampo('contrato_id', 'Selecione um contrato.');
      return;
    }
    if (camposContratoObrigatorios && !tipoEhDeMedicao && !refContratoBusca.trim()) {
      reprovarCampo('ref_contrato', 'Informe a ref. do contrato.');
      return;
    }
    if (itensApropriacaoObrigatorio && !form.itens_apropriacao && apropriacoesRateioSelecionadas.length === 0) {
      reprovarCampo('itens_apropriacao', 'Para Abertura de Contrato, informe os itens de apropriacao ou selecione as apropriacoes do contrato.');
      return;
    }
    if (apropriacoesContratoExigidas && apropriacoesRateioSelecionadas.length === 0) {
      reprovarCampo('apropriacoes_contrato', 'Selecione ao menos uma apropriacao do contrato para esta solicitacao.');
      return;
    }
    if (refContratoAberturaObrigatoria && !form.ref_contrato_abertura) {
      reprovarCampo('ref_contrato_abertura', 'Para Abertura de Contrato, informe a ref do contrato.');
      return;
    }
    if (campoObrigatorio('credor') && !form.parceiro_id) {
      reprovarCampo('credor', 'Selecione o credor da solicitação.');
      return;
    }
    if (formaPagamentoObrigatoria && !form.forma_pagamento_id) {
      reprovarCampo('forma_pagamento_id', 'Selecione a forma de pagamento.');
      return;
    }
    if (favorecidoObrigatorio && !form.favorecido_id) {
      reprovarCampo('favorecido', 'Selecione o favorecido do pagamento.');
      return;
    }
    if (pagamentoViaPix && !String(form.favorecido_chave_pix || '').trim()) {
      reprovarCampo('favorecido_chave_pix', 'Informe a chave PIX do favorecido.');
      return;
    }
    if (pagamentoViaBoleto && boletoArquivos.length === 0) {
      reprovarCampo('boleto', 'Anexe o boleto para usar esta forma de pagamento.');
      return;
    }
    if (justificativaObrigatoria && !form.justificativa.trim()) {
      reprovarCampo('justificativa', 'Informe a justificativa da solicitação.');
      return;
    }

    if (exibirCampoDataVencimento && form.data_vencimento && String(form.data_vencimento) < String(hojeInput)) {
      reprovarCampo('data_vencimento', `${rotuloDataSolicitacao} não pode ser menor que a data atual.`);
      return;
    }

    // Medicao de contrato do fluxo novo: sem parcela marcada nao ha o que medir, e o saldo
    // e conferido aqui so para avisar antes de enviar — quem decide e o backend.
    if (usaMedicaoFluxoNovo) {
      // Estes campos vivem dentro do BlocoMedicaoContrato (componente
      // compartilhado, sem entrada de erro): a mensagem fica em Avisos.
      if (!(medicaoContratoDados?.itens || []).length) {
        avisar.alerta('Selecione ao menos uma parcela do contrato para medir.');
        return;
      }
      if (medicaoContratoDados?.excedeSaldo) {
        avisar.alerta('O total selecionado passa do saldo do contrato.');
        return;
      }
      // Os dados de pagamento sao cobrados aqui tambem para a pessoa nao descobrir depois de montar
      // a medicao inteira. Quem recusa de verdade e o servidor.
      const pgto = medicaoContratoDados?.pagamento || {};
      if (!pgto.forma_pagamento_id) { avisar.alerta('Informe a forma de pagamento da medição.'); return; }
      if (!pgto.favorecido_id) { avisar.alerta('Informe o favorecido desta medição.'); return; }
      if (pgto.via_pix && !String(pgto.favorecido_chave_pix || '').trim()) {
        avisar.alerta('Informe a chave PIX do favorecido.'); return;
      }
      if (pgto.via_boleto && !String(pgto.boleto_anexo_nome || '').trim()) {
        avisar.alerta('Anexe o boleto desta medição.'); return;
      }
      if (!pgto.via_pix && !pgto.via_boleto && !String(pgto.favorecido_contato || '').trim()) {
        avisar.alerta('Informe os dados para pagamento desta medição.'); return;
      }
      if (!pgto.dados_confirmados) {
        avisar.alerta('Confirme que os dados de pagamento estão corretos antes de enviar a medição.'); return;
      }
    }

    // Vale para medicao nova e legada. No fluxo novo o boleto pode ser o proprio documento
    // obrigatorio; nas demais formas, ao menos um arquivo deve estar no campo unico de anexos.
    const anexosPendentesMedicao = [...arquivos, ...boletoArquivos];
    if (tipoEhDeMedicao && anexosPendentesMedicao.length === 0) {
      reprovarCampo('anexos', 'Anexe ao menos um arquivo para enviar a solicitacao de medicao.');
      return;
    }
    if (!tipoEhDeMedicao && anexosObrigatorios && arquivos.length === 0) {
      reprovarCampo(
        'anexos',
        tipoEhAdmLocalObra
          ? 'Anexe ao menos um comprovante para esta forma de pagamento.'
          : 'Anexe ao menos um comprovante da despesa.'
      );
      return;
    }

    if (usaFluxoDespesaEventual) {
      // Estado do cálculo do saldo: não é campo, é condição da obra.
      if (despesaEventualSaldo.status !== 'success' || !despesaEventualSaldo.dados) {
        avisar.alerta(despesaEventualSaldo.erro || 'Aguarde o cálculo do saldo de Despesa Eventual da obra.');
        return;
      }
      const valorDespesa = Number(form.valor || 0);
      if (valorDespesa > Number(despesaEventualSaldo.dados.limite_solicitacao || 0)) {
        reprovarCampo('valor', 'O valor informado ultrapassa o limite por solicitação.');
        return;
      }
      if (valorDespesa > Number(despesaEventualSaldo.dados.saldo_obra || 0)) {
        reprovarCampo('valor', 'O valor informado ultrapassa o saldo de Despesa Eventual desta obra.');
        return;
      }
      if (Object.values(despesaEventualDeclaracoes).some((confirmado) => confirmado !== true)) {
        reprovarCampo('despesa_declaracoes', 'Confirme todas as declarações obrigatórias da Despesa Eventual.');
        return;
      }
    }

    if (descricaoExigida && !form.descricao.trim()) {
      reprovarCampo('descricao', 'Informe o título da solicitação.');
      return;
    }

    // Na medicao do fluxo novo o bloco de rateio nem aparece; a guarda existe para o caso de uma
    // selecao ter ficado no estado de antes da troca de contrato.
    if (!usaMedicaoFluxoNovo && apropriacoesRateioSelecionadas.length > 0) {
      const valorTotalSolicitacao = arredondarCentavos(parseDecimalRateio(form.valor));
      if (!valorTotalSolicitacao || valorTotalSolicitacao <= 0) {
        reprovarCampo('valor', 'Informe o valor total da solicitacao para validar o rateio das apropriacoes.');
        return;
      }

      const comPercentual = apropriacoesRateioSelecionadas.filter(item => parseDecimalRateio(item.percentual) !== null);
      const comValor = apropriacoesRateioSelecionadas.filter(item => parseDecimalRateio(item.valor_rateio) !== null);
      const possuiDoisCriterios = apropriacoesRateioSelecionadas.some(item => (
        parseDecimalRateio(item.percentual) !== null &&
        parseDecimalRateio(item.valor_rateio) !== null
      ));

      if (possuiDoisCriterios) {
        reprovarCampo('apropriacoes_contrato', 'Informe o rateio usando apenas percentual ou apenas valor em R$ por apropriacao.');
        return;
      }

      if (comPercentual.length === apropriacoesRateioSelecionadas.length) {
        const totalPercentual = comPercentual.reduce((acc, item) => acc + Number(parseDecimalRateio(item.percentual) || 0), 0);
        if (comPercentual.some(item => Number(parseDecimalRateio(item.percentual) || 0) <= 0) || Math.abs(totalPercentual - 100) > 0.0001) {
          reprovarCampo('apropriacoes_contrato', 'A soma dos percentuais do rateio deve ser exatamente 100%.');
          return;
        }
      } else if (comValor.length === apropriacoesRateioSelecionadas.length) {
        const totalValorRateio = arredondarCentavos(comValor.reduce((acc, item) => acc + Number(parseDecimalRateio(item.valor_rateio) || 0), 0));
        if (comValor.some(item => Number(parseDecimalRateio(item.valor_rateio) || 0) <= 0) || totalValorRateio !== valorTotalSolicitacao) {
          reprovarCampo('apropriacoes_contrato', 'A soma dos valores em R$ do rateio deve ser igual ao valor total da solicitacao.');
          return;
        }
      } else {
        reprovarCampo('apropriacoes_contrato', 'Todas as apropriacoes selecionadas devem usar o mesmo criterio de rateio: percentual ou valor em R$.');
        return;
      }
    }

    if (criandoSolicitacaoRef.current) {
      return;
    }
    // Fluxo novo de contratos (D38): cria o CONTRATO pelo endpoint auditado em vez da
    // solicitacao padrao. Obra, credor, valor, descricao e apropriacao principal vem do
    // formulario; o bloco fornece categoria, condicao, parcelas e detalhes.
    if (usaFluxoContratoNovo) {
      const d = contratoNovoDados || {};
      if (!form.parceiro_id) { reprovarCampo('credor', 'Selecione o credor do contrato.'); return; }
      const camposObrigatoriosContrato = [
        ['contrato_objeto', d.objeto, 'Informe o objeto do contrato.'],
        ['contrato_justificativa', d.justificativa, 'Informe a justificativa da contratacao.'],
        ['contrato_responsavel', d.responsavel_id, 'Selecione o responsavel pela contratacao.'],
        ['contrato_vigencia_inicio', d.vigencia_inicio, 'Informe a vigencia inicial do contrato.'],
        ['contrato_vigencia_fim', d.vigencia_fim, 'Informe a vigencia final do contrato.']
      ];
      const campoContratoPendente = camposObrigatoriosContrato.find(
        ([campoId, valor]) => campoObrigatorio(campoId) && !String(valor || '').trim()
      );
      // Os campos abaixo pertencem ao BlocoContratoFluxoNovo (compartilhado):
      // sem entrada de erro por campo, a mensagem vai para a faixa de avisos.
      if (campoContratoPendente) { avisar.alerta(campoContratoPendente[2]); return; }
      // O rateio precisa fechar ANTES de enviar: o backend recusaria, mas a pessoa perderia o
      // formulario inteiro para descobrir um erro de digitacao.
      const linhasRateio = rateioContrato.filter((l) => l.apropriacao_id);
      if (linhasRateio.length === 0) { reprovarCampo('apropriacao', 'Informe ao menos uma apropriacao para o contrato.'); return; }
      // As duas colunas (% e R$) ficam em sincronia na tela, entao basta conferir uma. O
      // percentual e a que vale, porque e ele que vai gravado.
      const somaPercentual = linhasRateio.reduce((acc, l) => acc + (numeroDoCampo(l.percentual) || 0), 0);
      if (Math.abs(somaPercentual - 100) >= 0.001) {
        reprovarCampo('apropriacao', 'O rateio da apropriacao deve fechar 100% (ou o valor total do contrato).');
        return;
      }
      if (!d.qtde_parcelas || !d.primeiro_vencimento) { avisar.alerta('Informe a quantidade de parcelas e o 1o vencimento.'); return; }
      const qtde = Number(d.qtde_parcelas);
      if (!Number.isInteger(qtde) || qtde < 1 || qtde > MAXIMO_PARCELAS_CONTRATO) {
        avisar.alerta(`A quantidade de parcelas deve ser um numero inteiro de 1 a ${MAXIMO_PARCELAS_CONTRATO}.`); return;
      }
      // Continua valendo para a CONFERENCIA de cadastro logo abaixo, que so acontece acima do
      // limite — a negociacao e que deixou de olhar o valor.
      const acimaDoLimite = Number(form.valor) > limiteJuridico;

      // A negociacao detalhada agora e documento e vale para TODO contrato (item 7, 23/08). O
      // backend cobra de novo na aprovacao — este aviso existe para a pessoa nao descobrir depois
      // de o contrato ja estar criado.
      if (!d.negociacao_arquivo) {
        avisar.alerta('Anexe o documento da negociação detalhada: ele e obrigatório em todo contrato.'); return;
      }
      if (acimaDoLimite) {
        const documentosObrigatorios = [
          ['Cartao CNPJ', d.cartao_cnpj_arquivo],
          ['Ato constitutivo', d.ato_constitutivo_arquivo],
          ['Documentos do representante legal', d.documentos_representante_legal_arquivo]
        ];
        const documentosFaltantes = documentosObrigatorios.filter(([, arquivo]) => !arquivo).map(([nome]) => nome);
        if (documentosFaltantes.length > 0) {
          avisar.alerta(`Anexe a documentacao juridica obrigatoria: ${documentosFaltantes.join(', ')}.`); return;
        }

        const qualificacao = d.representante_legal_qualificacao || {};
        const camposQualificacao = [
          ['nome completo', qualificacao.nome],
          ['CPF', qualificacao.cpf],
          ['RG', qualificacao.rg],
          ['cargo ou funcao', qualificacao.cargo],
          ['nacionalidade', qualificacao.nacionalidade],
          ['estado civil', qualificacao.estado_civil],
          ['profissao', qualificacao.profissao]
        ];
        const qualificacaoFaltante = camposQualificacao
          .filter(([, valor]) => !String(valor || '').trim())
          .map(([nome]) => nome);
        if (qualificacaoFaltante.length > 0) {
          avisar.alerta(`Complete a qualificacao do representante legal: ${qualificacaoFaltante.join(', ')}.`); return;
        }
        const cpfRepresentanteErro = getCpfCnpjError(qualificacao.cpf, {
          required: true,
          type: 'cpf',
          label: 'CPF do representante legal'
        });
        if (cpfRepresentanteErro) {
          avisar.alerta(cpfRepresentanteErro); return;
        }
        if (qualificacao.estado_civil === 'CASADO') {
          const conjuge = qualificacao.conjuge || {};
          const camposConjuge = [
            ['nome completo', conjuge.nome],
            ['CPF', conjuge.cpf],
            ['RG', conjuge.rg],
            ['nacionalidade', conjuge.nacionalidade],
            ['profissao', conjuge.profissao],
            ['regime de bens', conjuge.regime_bens]
          ];
          const dadosConjugeFaltantes = camposConjuge
            .filter(([, valor]) => !String(valor || '').trim())
            .map(([nome]) => nome);
          if (dadosConjugeFaltantes.length > 0) {
            avisar.alerta(`Complete os dados do conjuge: ${dadosConjugeFaltantes.join(', ')}.`); return;
          }
          const cpfConjugeErro = getCpfCnpjError(conjuge.cpf, {
            required: true,
            type: 'cpf',
            label: 'CPF do cônjuge'
          });
          if (cpfConjugeErro) {
            avisar.alerta(cpfConjugeErro); return;
          }
        }
      }
      // Portao do valor minimo por parcela: a previa deixa digitar livremente (senao nao da
      // para escrever "0,50"), entao a cobranca acontece aqui, antes de enviar.
      const parcelaInvalida = (d.parcelas || []).find((pc) => !(Number(pc.valor) > 0));
      if (parcelaInvalida) {
        avisar.alerta(`A parcela ${parcelaInvalida.numero} deve ser de no minimo R$ 0,01.`); return;
      }

      // Acima do limite o contrato vai ao Juridico, que monta a minuta a partir do cadastro do
      // contratado — e 98% dos fornecedores estao sem endereco completo. A conferencia acontece
      // aqui, com a chance de corrigir, e nao la na frente com a minuta parada.
      if (acimaDoLimite && !confirmadoNaConferencia) {
        // `d.parceiros` e a lista de ids dos contratados que o bloco emite. Favorecido nao entra
        // nesta conferencia porque sera escolhido na medicao, quando o pagamento for solicitado.
        const ids = [Number(form.parceiro_id), ...(d.parceiros || []).map(Number)]
          .filter((n) => Number.isInteger(n) && n > 0);
        setCredoresParaConferir([...new Set(ids)]);
        setModalCredoresAberto(true);
        return;
      }

      criandoSolicitacaoRef.current = true;
      setCriandoSolicitacao(true);
      // A mesma chave do fluxo padrao: o ref acima so protege o duplo clique nesta aba;
      // retry de rede sem chave duplicaria o contrato (M3 da auditoria).
      const idempotencyKeyContrato = criarChaveIdempotenciaSolicitacao();
      try {
        const apropriacoesDoContrato = rateioContrato
          .filter((l) => l.apropriacao_id)
          .map((l) => ({
            apropriacao_id: Number(l.apropriacao_id),
            percentual: Number((numeroDoCampo(l.percentual) || 0).toFixed(4))
          }));

        const r = await criarContratoFluxoNovo({
          obra_id: Number(form.obra_id),
          parceiro_id: Number(form.parceiro_id),
          // Contratados (o do formulario + os do bloco). Os dados do pagamento pertencem a
          // medicao e nao sao antecipados na abertura do contrato.
          parceiros: (d.parceiros || []).map(Number).filter(Boolean),
          descricao: exibirDescricao ? form.descricao : null,
          // O titulo e a referencia do contrato: e o texto que a Medicao pesquisa depois.
          ref_contrato: exibirDescricao ? form.descricao : null,
          valor_total: form.valor,
          qtde_parcelas: Number(d.qtde_parcelas),
          primeiro_vencimento: d.primeiro_vencimento,
          // Data operacional exibida na lista de solicitacoes. Nao se confunde com os
          // vencimentos individuais do cronograma de parcelas do contrato.
          data_vencimento: exibirDataVencimento ? (form.data_vencimento || null) : null,
          // PI-16: a categoria financeira NAO vai mais daqui. Quem abre o contrato e o usuario da
          // obra, que nao conhece o plano financeiro da empresa — ela passou a ser informada por
          // quem APROVA, no detalhe da solicitacao, e a aprovacao e barrada sem ela.
          detalhes_contratacao: d.detalhes_contratacao,
          representante_legal_qualificacao: acimaDoLimite ? d.representante_legal_qualificacao : null,
          // Campos do escopo 3.1/3.2 — as colunas ja existiam; faltava o caminho da tela.
          objeto: campoVisivel('contrato_objeto') ? (d.objeto || null) : null,
          justificativa: campoVisivel('contrato_justificativa') ? (d.justificativa || null) : null,
          responsavel_id: campoVisivel('contrato_responsavel') && d.responsavel_id ? Number(d.responsavel_id) : null,
          vigencia_inicio: campoVisivel('contrato_vigencia_inicio') ? (d.vigencia_inicio || null) : null,
          vigencia_fim: campoVisivel('contrato_vigencia_fim') ? (d.vigencia_fim || null) : null,
          // D38-a: o fluxo deriva do subtipo por id vinculado — persiste o vinculo
          tipo_macro_id: Number(form.tipo_solicitacao_id),
          tipo_sub_id: form.tipo_sub_id ? Number(form.tipo_sub_id) : null,
          // Rateio da apropriacao (19/08): N apropriacoes, por % ou por R$.
          //
          // Vai como PERCENTUAL mesmo quando a pessoa digita R$: um rateio em reais e uma
          // proporcao do total, e e proporcionalmente que cada PARCELA precisa ser dividida.
          // A aritmetica fina fica no backend (`montarRateios`), que divide em centavos com a
          // sobra na ultima — aqui nao se recalcula nada disso.
          apropriacoes: apropriacoesDoContrato,
          parcelas: (d.parcelas || []).map((pc) => ({ numero: pc.numero, valor: pc.valor, vencimento: pc.vencimento }))
        }, { idempotencyKey: idempotencyKeyContrato });

        // Anexos vao para o CONTRATO criado (endpoint auditado), espelhando o fluxo
        // padrao: se o upload falhar, o usuario e avisado — nunca descartado em silencio
        // (A1 da auditoria: o arquivo sumia sem requisicao, sem registro e sem aviso).
        const idContrato = r?.contrato?.id;

        // A negociacao detalhada sobe ANTES dos anexos avulsos: sem ela o contrato nao pode ser
        // aprovado, entao falhar aqui e um problema maior do que falhar num anexo qualquer.
        if (d.negociacao_arquivo && idContrato) {
          try {
            await uploadNegociacaoContrato(idContrato, d.negociacao_arquivo);
          } catch (erroNegociacao) {
            console.error(erroNegociacao);
            await avisarAntesDeSair(
              'Contrato criado sem a negociacao detalhada',
              `O contrato ${r?.contrato?.codigo || idContrato} foi criado, mas a negociacao detalhada NAO foi enviada (${erroNegociacao.message}). Sem ela o contrato nao pode ser aprovado: abra o contrato e envie o documento.`
            );
            navigate('/gestao-contratos', { replace: true });
            return;
          }
        }

        if (acimaDoLimite && idContrato) {
          try {
            await Promise.all([
              uploadDocumentacaoJuridicaContrato(idContrato, 'cartao-cnpj', d.cartao_cnpj_arquivo),
              uploadDocumentacaoJuridicaContrato(idContrato, 'ato-constitutivo', d.ato_constitutivo_arquivo),
              uploadDocumentacaoJuridicaContrato(idContrato, 'representante-legal', d.documentos_representante_legal_arquivo)
            ]);
          } catch (erroDocumentacao) {
            console.error(erroDocumentacao);
            await avisarAntesDeSair(
              'Contrato criado sem a documentacao juridica completa',
              `O contrato ${r?.contrato?.codigo || idContrato} foi criado, mas a documentacao juridica nao foi enviada por completo (${erroDocumentacao.message}). O contrato permanecera bloqueado para aprovacao ate o dossie ser completado.`
            );
            navigate('/gestao-contratos', { replace: true });
            return;
          }
        }

        if (exibirAnexos && arquivos.length > 0 && idContrato) {
          try {
            await uploadContratoAnexos(idContrato, extrairFilesAnexosPendentes(arquivos));
          } catch (uploadError) {
            console.error(uploadError);
            await avisarAntesDeSair(
              'Contrato criado sem os anexos',
              `O contrato ${r?.contrato?.codigo || idContrato} foi criado, mas os anexos nao foram enviados. Abra o contrato em Gestao de Contratos e envie os anexos novamente.`
            );
            navigate('/gestao-contratos', { replace: true });
            return;
          }
        }

        await avisarAntesDeSair(
          'Contrato criado',
          `Contrato ${r?.contrato?.codigo || ''} criado — aguardando aprovacao.`
        );
        // O contrato do fluxo novo nao aparece na lista de solicitacoes: mandar para la
        // deixava a instrucao de "abra o contrato" sem alvo (N5).
        navigate('/gestao-contratos', { replace: true });
      } catch (error) {
        avisar.erro(error?.message || 'Erro ao criar contrato.');
      } finally {
        criandoSolicitacaoRef.current = false;
        setCriandoSolicitacao(false);
      }
      return;
    }

    criandoSolicitacaoRef.current = true;
    setCriandoSolicitacao(true);
    const idempotencyKey = criarChaveIdempotenciaSolicitacao();

    const payload = {
      ...form,
      // O destino inicial e uma regra do backend (GEO/PENDENTE), nunca um dado controlado pela tela.
      area_responsavel: undefined,
      parceiro_id: permitirVinculoCredor ? (form.parceiro_id || null) : null,
      favorecido_id: exibirFavorecidoPagamento ? (form.favorecido_id || null) : null,
      forma_pagamento_id: exibirFormaPagamento ? (form.forma_pagamento_id || null) : null,
      favorecido_chave_pix: pagamentoViaPix
        ? String(form.favorecido_chave_pix || '').trim()
        : null,
      boleto_anexo_nome: pagamentoViaBoleto ? (boletoArquivos[0]?.nome || null) : null,
      despesa_eventual_declaracoes: usaFluxoDespesaEventual ? despesaEventualDeclaracoes : undefined,
      cartao_recarga_id: usaFluxoRecargaCartao ? Number(cartaoRecargaId) : undefined,
      justificativa: exibirJustificativa ? form.justificativa : null,
      apropriacao_id: exibirCampoApropriacao ? (form.apropriacao_id || null) : null,
      contrato_id: exibirCamposContrato ? (form.contrato_id || null) : null,
      tipo_sub_id: exibirCampoSubtipo ? (form.tipo_sub_id || null) : null,
      tipo_macro_id: form.tipo_solicitacao_id || null,
      data_vencimento: exibirDataVencimento ? (form.data_vencimento || null) : null,
      data_demissao: exibirDataDemissao ? (form.data_demissao || null) : null,
      data_inicio_medicao: exibirPeriodoMedicao ? (form.data_inicio_medicao || null) : null,
      data_fim_medicao: exibirPeriodoMedicao ? (form.data_fim_medicao || null) : null,
      itens_apropriacao: exibirItensApropriacao ? (form.itens_apropriacao || null) : null,
      ref_contrato_abertura: exibirRefContratoAbertura ? (form.ref_contrato_abertura || null) : null,
      descricao: exibirDescricao ? form.descricao : '',
      // Parcelas consumidas pela medicao (wireframe 2). O backend valida antes de gravar a
      // solicitacao e aplica na sequencia.
      medicao_parcelas: usaMedicaoFluxoNovo ? (medicaoContratoDados?.itens || []) : undefined,
      // Dados de pagamento DA MEDICAO (itens 5 e 9, 23/08): favorecido, chave PIX, forma, contato e
      // o aceite. O backend recusa a medicao sem eles.
      medicao_pagamento: usaMedicaoFluxoNovo ? (medicaoContratoDados?.pagamento || {}) : undefined,
      // O endpoint historico recebe JSON e o upload ocorre logo depois. A API valida que havia
      // arquivo selecionado; na aprovacao, o backend confere o anexo efetivamente gravado.
      anexos_pendentes_nomes: tipoEhDeMedicao
        ? anexosPendentesMedicao.map((arquivo) => arquivo.nome).filter(Boolean)
        : (arquivos.length > 0 ? arquivos.map((arquivo) => arquivo.nome).filter(Boolean) : undefined),
      apropriacoes_rateio: exibirCamposContrato
        ? apropriacoesRateioSelecionadas.map(item => ({
            apropriacao_id: item.apropriacao_id,
            percentual: String(item.percentual || '').trim() || null,
            valor_rateio: String(item.valor_rateio || '').trim() || null,
            observacao: String(item.observacao || '').trim() || null
          }))
        : []
    };

    try {
      const solicitacao = await createSolicitacao(payload, { idempotencyKey });

      if (!solicitacao?.id) {
        throw new Error('Solicitacao criada, mas a API nao retornou o identificador para abrir o detalhe.');
      }
      const medicaoIdCriada = Number(solicitacao?.medicao?.id || 0) || null;

      if (pagamentoViaBoleto && boletoArquivos.length > 0) {
        try {
          await uploadArquivos({
            files: extrairFilesAnexosPendentes(boletoArquivos),
            solicitacao_id: solicitacao.id,
            medicao_id: medicaoIdCriada,
            tipo: 'BOLETO',
            criacao_upload_token: solicitacao.criacao_upload_token || null
          });
        } catch (uploadError) {
          console.error(uploadError);
          await avisarAntesDeSair(
            'Solicitacao criada sem o boleto',
            `A solicitacao ${solicitacao.codigo || solicitacao.id} foi criada, mas o boleto nao foi enviado. Abra a solicitacao e anexe o boleto novamente.`
          );
          navigate(`/solicitacoes/${solicitacao.id}`, { replace: true });
          return;
        }
      }

      if (exibirAnexos && arquivos.length > 0) {
        try {
          await uploadArquivos({
            files: extrairFilesAnexosPendentes(arquivos),
            solicitacao_id: solicitacao.id,
            medicao_id: medicaoIdCriada,
            tipo: 'SOLICITACAO',
            criacao_upload_token: solicitacao.criacao_upload_token || null
          });
        } catch (uploadError) {
          console.error(uploadError);
          await avisarAntesDeSair(
            'Solicitacao criada sem os anexos',
            `A solicitacao ${solicitacao.codigo || solicitacao.id} foi criada, mas os anexos nao foram enviados. Abra a solicitacao e envie os anexos novamente.`
          );
          navigate(`/solicitacoes/${solicitacao.id}`, { replace: true });
          return;
        }
      }

      navigate(`/solicitacoes/${solicitacao.id}`, { replace: true });
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao criar solicitação');
    } finally {
      criandoSolicitacaoRef.current = false;
      setCriandoSolicitacao(false);
    }
  }

  const contratosDisponiveis = contratosRef.length > 0 ? contratosRef : contratos;
  const contratosAutocomplete = useMemo(() => contratosDisponiveis.map((contrato) => ({
    ...contrato,
    descricao: [
      contrato.ref_contrato || contrato.titulo || 'Sem título informado',
      contrato.disponivel_medicao === false ? 'retorno necessário' : ''
    ].filter(Boolean).join(' — ')
  })), [contratosDisponiveis]);
  const contratoSelecionado = useMemo(() => {
    if (!form.contrato_id) return null;
    return [...contratosDisponiveis, ...contratos, ...contratosRef]
      .find(item => String(item.id) === String(form.contrato_id)) || null;
  }, [form.contrato_id, contratosDisponiveis, contratos, contratosRef]);

  // MD-2/MD-3: a bifurcacao da medicao le o marcador do CONTRATO escolhido. Contrato sem
  // marcador (os 335 existentes) cai na trilha antiga, que nao muda em nada.
  const contratoSelecionadoEhFluxoNovo = Boolean(contratoSelecionado?.fluxo_novo);
  const contratoSelecionadoMedicaoBloqueada = Boolean(
    contratoSelecionadoEhFluxoNovo
    && contratoSelecionado?.disponivel_medicao === false
  );
  const usaMedicaoFluxoNovo = exibirCamposContrato && Boolean(form.contrato_id) && contratoSelecionadoEhFluxoNovo;

  // MEDICAO DO FLUXO NOVO NAO TEM VALOR, TITULO NEM VENCIMENTO PROPRIOS (pedido do cliente, 20/08).
  //
  // Ela nao cria solicitacao: o backend intercepta e a transforma num evento da solicitacao unica
  // do contrato (PI-16). O valor vem da soma das parcelas marcadas e o vencimento vem de cada
  // parcela — os tres campos eram preenchidos, validados e descartados.
  //
  // O periodo (data inicial/final) CONTINUA valendo, mas sobe para o topo do card da medicao, ao
  // lado da tabela que ele data. O estado segue sendo o mesmo (`form.data_inicio_medicao` /
  // `data_fim_medicao`): dar estado proprio ao card faria a validacao conferir um valor e o envio
  // mandar outro.
  //
  // Contrato LEGADO nao entra em nada disto — a medicao dele cria solicitacao propria.
  const exibirValor = !tipoSemValor && !usaMedicaoFluxoNovo;
  const valorObrigatorio = exibirValor && !tipoSemValor;
  const exibirCampoDescricao = exibirDescricao && !usaMedicaoFluxoNovo;
  const descricaoExigida = descricaoObrigatoria && !usaMedicaoFluxoNovo;
  const exibirCampoDataVencimento = exibirDataVencimento && !usaMedicaoFluxoNovo;
  const dataVencimentoExigida = dataVencimentoObrigatoria && !usaMedicaoFluxoNovo;
  // Fora do fluxo novo o par continua onde sempre esteve: o card nao existe para recebe-lo.
  const exibirPeriodoMedicaoSolto = exibirPeriodoMedicao && !usaMedicaoFluxoNovo;
  // Campo que nao aparece nao pode ser exigido: o bloco de rateio some na medicao do fluxo novo, e
  // sem esta linha o envio ficaria travado por uma selecao que a pessoa nao tem como fazer.
  const apropriacoesContratoExigidas = apropriacoesContratoObrigatorias && !usaMedicaoFluxoNovo;
  // PI-15: o termo aditivo e pedido por um botao AQUI, na tela de medicao, e vale para contrato
  // do fluxo ANTIGO e do NOVO — por isso a condicao NAO olha `fluxo_novo`.
  //
  // "Estar na medicao" foi derivado acima do COMPORTAMENTO do tipo (mostra/exige periodo),
  // nunca do nome nem do id: a mesma regra tambem forca o campo unico de anexos a aparecer.
  const podeSolicitarAditivo = tipoEhDeMedicao
    && exibirCamposContrato
    && Boolean(form.contrato_id)
    && !contratoSelecionadoMedicaoBloqueada;
  const credoresContratoSelecionado = useMemo(
    () => getCredoresContrato(contratoSelecionado),
    [contratoSelecionado]
  );
  const credoresContratoDisponiveis = useMemo(() => (
    parceiroSelecionado && !credoresContratoSelecionado.some(credor => String(credor.id) === String(parceiroSelecionado.id))
      ? [...credoresContratoSelecionado, parceiroSelecionado]
      : credoresContratoSelecionado
  ), [credoresContratoSelecionado, parceiroSelecionado]);
  const credoresContratoModalFiltrados = useMemo(() => {
    const termo = normalizarBusca(credorContratoModalBusca);
    return credoresContratoDisponiveis.filter((credor) => {
      if (!termo) return true;
      return normalizarBusca(`${credor.nome || ''} ${credor.cpf_cnpj || ''}`).includes(termo);
    });
  }, [credoresContratoDisponiveis, credorContratoModalBusca]);

  /*
    CAMPO CREDOR — três formas do MESMO campo (só cadastro, preso ao contrato,
    busca livre), agora dentro do `CampoForm`: rótulo, hint e erro saem das
    classes `.form-*` do sistema em vez de spans soltos com cor crua.
  */
  function renderCampoCredor() {
    if (!permitirVinculoCredor) return null;

    if (!exibirCampoCredor && exibirCadastroCredor) {
      return (
        <CampoForm label="Credor" erro={errosCampo.credor}>
          {parceiroSelecionado ? (
            <div className="flex flex-wrap items-center gap-2 rounded border border-[var(--c-border)] bg-[var(--c-surface)] p-3 text-sm">
              <span className="min-w-0 flex-1">
                {parceiroSelecionado.nome}
                {parceiroSelecionado.cpf_cnpj ? ` - ${parceiroSelecionado.cpf_cnpj}` : ''}
              </span>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={limparParceiroSelecionado}
              >
                Limpar
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-outline btn-sm w-fit"
              onClick={() => setModalParceiroAberto(true)}
            >
              Cadastrar novo credor
            </button>
          )}
        </CampoForm>
      );
    }

    const credoresContratoCampo = credoresContratoDisponiveis;
    const termoCredorContrato = normalizarBusca(parceiroBusca);
    const credoresContratoFiltrados = credoresContratoCampo.filter((credor) => {
      if (!termoCredorContrato) return true;
      return normalizarBusca(`${credor.nome || ''} ${credor.cpf_cnpj || ''}`).includes(termoCredorContrato);
    });
    const credoresContratoSugestoes = credoresContratoFiltrados.slice(0, 8);
    const inputCredorContratoDesabilitado = !form.contrato_id && credoresContratoCampo.length === 0;

    const hintCredor = restringirCredorAoContrato
      ? (exibirCadastroCredor
        ? 'O credor e carregado a partir do contrato. Se necessario, cadastre um novo credor para vincular nesta solicitacao.'
        : 'O credor e carregado a partir do contrato. Para pagar um credor diferente, solicite ao setor de Gerencia de Processo o cadastro ou vinculo no contrato.')
      : (exibirCamposContrato && permitirCredorAvulsoComContrato
        ? 'Credor livre para este tipo de solicitacao; o contrato permanece vinculado para referencia e apropriacao.'
        : undefined);

    return (
      <CampoForm
        label="Credor"
        obrigatorio={campoObrigatorio('credor')}
        hint={hintCredor}
        erro={errosCampo.credor}
      >
        {restringirCredorAoContrato ? (
          <>
            <div ref={campoCredorContratoRef} className="relative">
              <div className="flex gap-2 nova-solicitacao-inline-actions">
                <input
                  className="input input-sm min-w-0 flex-1"
                  placeholder={!form.contrato_id
                    ? 'Selecione o contrato primeiro'
                    : credoresContratoCampo.length === 0
                      ? 'Contrato sem credor vinculado'
                      : 'Pesquisar credor vinculado ao contrato'}
                  value={parceiroBusca}
                  disabled={inputCredorContratoDesabilitado}
                  aria-label="Pesquisar credor"
                  onFocus={() => setCredorContratoSugestoesAbertas(true)}
                  onChange={(e) => {
                    setParceiroBusca(e.target.value);
                    setParceiroBuscaExecutada(false);
                    limparErroCampo('credor');
                    if (parceiroSelecionado) {
                      setParceiroSelecionado(null);
                      setForm(prev => ({ ...prev, parceiro_id: '' }));
                    }
                    setCredorContratoSugestoesAbertas(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && credoresContratoSugestoes.length === 1) {
                      event.preventDefault();
                      selecionarParceiro(credoresContratoSugestoes[0]);
                    }
                    if (event.key === 'Escape') {
                      setCredorContratoSugestoesAbertas(false);
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-outline btn-sm shrink-0 px-3"
                  title="Listar credores do contrato"
                  aria-label="Listar credores do contrato"
                  onClick={() => {
                    // O botao mora DENTRO do ref do campo (para o hook nao
                    // fechar a lista quando ele recebe o clique), entao e ele
                    // que fecha a camada — senao as sugestoes ficariam abertas
                    // atras do modal que acabou de abrir (05/09).
                    setCredorContratoSugestoesAbertas(false);
                    setCredorContratoModalBusca(parceiroBusca);
                    setModalCredoresContratoAberto(true);
                  }}
                  disabled={credoresContratoCampo.length === 0}
                >
                  <HiOutlineMagnifyingGlass className="h-4 w-4" />
                </button>
                {form.parceiro_id && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm shrink-0"
                    onClick={limparParceiroSelecionado}
                  >
                    Limpar
                  </button>
                )}
              </div>

              {credorContratoSugestoesAbertas && !parceiroSelecionado && !inputCredorContratoDesabilitado && (
                <div className="nova-solicitacao-results-list absolute left-0 right-0 z-dropdown mt-1 max-h-48 overflow-auto rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-1 shadow-lg">
                  {credoresContratoSugestoes.length > 0 ? (
                    credoresContratoSugestoes.map((credor) => (
                      <button
                        key={credor.id}
                        type="button"
                        className="nova-solicitacao-result-item block w-full rounded px-3 py-2 text-left text-sm hover:bg-[var(--ui-surface-2)]"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selecionarParceiro(credor)}
                      >
                        <span className="block font-medium text-[var(--c-text)]">{formatarCredor(credor)}</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs text-muted">
                      Nenhum Contratado vinculado ao contrato corresponde a busca.
                    </div>
                  )}
                </div>
              )}
            </div>
            {exibirCadastroCredor && (
              <button
                type="button"
                className="btn btn-outline btn-sm mt-2 w-fit"
                onClick={() => setModalParceiroAberto(true)}
              >
                Cadastrar novo credor
              </button>
            )}
          </>
        ) : (
          <>
            <div className="flex gap-2 nova-solicitacao-inline-actions">
              <input
                className="input input-sm"
                placeholder="Buscar credor por nome ou CPF/CNPJ"
                value={parceiroBusca}
                onChange={e => {
                  setParceiroBusca(e.target.value);
                  setParceiroBuscaExecutada(false);
                  setParceiroResultados([]);
                  limparErroCampo('credor');
                  if (parceiroSelecionado) {
                    setParceiroSelecionado(null);
                    setForm(prev => ({ ...prev, parceiro_id: '' }));
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => buscarParceirosRelacionados()}
                disabled={parceiroBuscando}
              >
                {parceiroBuscando ? 'Buscando...' : 'Buscar'}
              </button>
              {form.parceiro_id && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={limparParceiroSelecionado}
                >
                  Limpar
                </button>
              )}
            </div>

            {parceiroResultados.length > 1 && !parceiroSelecionado && (
              <div className="nova-solicitacao-results-list mt-2 max-h-40 overflow-auto rounded border p-2">
                {parceiroResultados.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selecionarParceiro(item)}
                    className="nova-solicitacao-result-item block w-full rounded p-2 text-left text-sm hover:bg-[var(--ui-surface-2)]"
                  >
                    {item.nome} - {item.cpf_cnpj}
                  </button>
                ))}
              </div>
            )}

            {parceiroBuscaExecutada && parceiroBusca.trim() && parceiroResultados.length === 0 && !parceiroBuscando && !parceiroSelecionado && (
              <div className="mt-2 flex flex-col gap-2 rounded border border-[var(--c-border)] bg-[var(--c-surface)] p-3 text-xs text-muted">
                <span>
                  Nenhum credor encontrado.
                </span>
                {exibirCadastroCredor ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm w-fit"
                    onClick={() => setModalParceiroAberto(true)}
                  >
                    Cadastrar credor
                  </button>
                ) : (
                  <span>Solicite ao setor de Gerência de Processo o cadastro do credor.</span>
                )}
              </div>
            )}

            {exibirCadastroCredor && !parceiroSelecionado && !parceiroBuscaExecutada && (
              <button
                type="button"
                className="btn btn-outline btn-sm mt-2 w-fit"
                onClick={() => setModalParceiroAberto(true)}
              >
                Cadastrar novo credor
              </button>
            )}
          </>
        )}
      </CampoForm>
    );
  }
  const hoje = new Date();
  const hojeInput = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  const saldoDespesaDados = despesaEventualSaldo.dados;
  const valorDespesaAtual = Number(form.valor || 0);
  const saldoDespesaAposSolicitacao = saldoDespesaDados
    ? Math.max(0, Number(saldoDespesaDados.saldo_obra || 0) - valorDespesaAtual)
    : 0;
  const despesaExcedeLimite = Boolean(
    saldoDespesaDados && (
      valorDespesaAtual > Number(saldoDespesaDados.limite_solicitacao || 0) ||
      valorDespesaAtual > Number(saldoDespesaDados.saldo_obra || 0)
    )
  );
  const tiposDisponiveis = useMemo(() => (
    Array.isArray(tipos)
      ? tipos.filter((tipo) => tipo?.ativo !== false && tipo?.comportamento?.somente_sistema !== true)
      : []
  ), [tipos]);

  useEffect(() => {
    if (!form.area_responsavel) {
      if (form.tipo_solicitacao_id) {
        setForm(prev => ({ ...prev, tipo_solicitacao_id: '', tipo_sub_id: '' }));
      }
      return;
    }
    if (!form.tipo_solicitacao_id) return;
    const existe = tiposDisponiveis.some(
      tipo => String(tipo.id) === String(form.tipo_solicitacao_id)
    );
    if (!existe) {
      setForm(prev => ({ ...prev, tipo_solicitacao_id: '', tipo_sub_id: '' }));
    }
  }, [form.area_responsavel, form.tipo_solicitacao_id, tiposDisponiveis]);

  useEffect(() => {
    if (!form.obra_id || !form.area_responsavel || !form.tipo_solicitacao_id) return;

    const tipoSelecionadoRedirecionamento = tipos.find(
      tipo => String(tipo.id) === String(form.tipo_solicitacao_id)
    );
    if (isTipoCompraDireta(tipoSelecionadoRedirecionamento)) {
      const params = new URLSearchParams();
      params.set('obra_id', String(form.obra_id));
      params.set('tipo_solicitacao_id', String(form.tipo_solicitacao_id));
      params.set('area_responsavel', String(form.area_responsavel));
      params.set('origem', 'nova-solicitacao');
      navigate(`/solicitacoes-compra-direta/nova?${params.toString()}`);
      return;
    }

    const regra = obterRegraAutomacaoDestinoNovaSolicitacao(
      automacaoDestinoConfig,
      form.area_responsavel,
      form.tipo_solicitacao_id
    );
    if (!regra) return;

    const chaveExecucao = `${form.obra_id}:${form.area_responsavel}:${form.tipo_solicitacao_id}:${regra.destino}`;
    if (automacaoDestinoExecutadaRef.current === chaveExecucao) return;
    automacaoDestinoExecutadaRef.current = chaveExecucao;

    const params = new URLSearchParams();
    if (regra.preservar_obra !== false) {
      params.set('obra_id', String(form.obra_id));
    }
    params.set('origem', 'nova-solicitacao');

    navigate(`${regra.rota}?${params.toString()}`);
  }, [
    automacaoDestinoConfig,
    form.area_responsavel,
    form.obra_id,
    form.tipo_solicitacao_id,
    navigate,
    tipos
  ]);

  // A faixa tem um dono so: com o modal de credor aberto ela vive dentro dele
  // (senao o aviso ficaria atras do fundo escuro); fora dele, no topo da pagina.
  const faixaAvisos = <Avisos avisos={avisos} aoFechar={fechar} />;

  /*
    APOIO DA FAIXA (R5/C2) — diálogo com o TIPO, não texto fixo.

    O apoio antigo ("Preencha os dados essenciais da solicitação com um fluxo
    mais direto e operacional.") ocupava a linha inteira sem dizer nada que a
    pessoa já não soubesse ao abrir a tela. O que muda — e o que ela precisa
    ler — é O QUE ela está preenchendo, e isso vem do tipo escolhido.

    O que o tipo diz de si: o objeto de GET /tipos-solicitacao tem `nome`,
    `codigo_interno` e `comportamento`. Não há campo de descrição em prosa, e
    `codigo_interno` é token de máquina (UPPER_SNAKE derivado do próprio nome,
    normalizeTipoSolicitacaoCodigo) — mostrá-lo seria ruído. Sobra o `nome`, e
    é ele que vai para a faixa.

    Sem tipo ainda, a faixa não repete "preencha os campos": ela aponta o
    PRÓXIMO passo real da tela, que é encadeado (obra habilita o setor, setor
    habilita o tipo, tipo carrega os campos) — as mesmas dependências que os
    selects já impõem com `disabled`.
  */
  const apoioDoCabecalho = (() => {
    const nomeDoTipo = String(tipoSelecionado?.nome || '').trim();
    if (nomeDoTipo) return nomeDoTipo;
    if (!form.obra_id) return 'Comece pela obra ou centro de custo — ela define os tipos disponíveis.';
    if (catalogoDestino.status === 'loading') return 'Carregando os tipos disponíveis para o destino selecionado.';
    if (catalogoDestino.status === 'error') return catalogoDestino.erro;
    return 'Escolha o tipo de solicitação — é ele que define quais campos você vai preencher.';
  })();

  return (
    <Pagina className="solicitacao-nova-page max-w-6xl mx-auto">
      {/* C3: tela de REGISTRO — a seta de voltar à esquerda da faixa é a
          affordance primária de retorno à listagem. */}
      <PageHeader
        titulo="Nova Solicitação"
        descricao={apoioDoCabecalho}
        voltar={{ to: '/solicitacoes', title: 'Voltar para solicitações' }}
      />

      {!(exibirCadastroCredor && modalParceiroAberto) && faixaAvisos}

      <form onSubmit={handleSubmit} className="nova-solicitacao-form-padrao space-y-4">
        {/*
          R9 (revista em 04/09) — FORMULÁRIO INLINE. Esta tela EXISTE para
          abrir a solicitação: tirando o formulário não sobra tela nenhuma.
          Modal aqui seria atrito puro. Os blocos abaixo são os MESMOS grupos
          que a tela já tinha, na MESMA ordem — cada um ganhou superfície
          própria (B5) em vez de viver dentro de um card único; nada foi
          reagrupado, nada nasce recolhido.
        */}

        <BlocoConteudo
          titulo="Dados da solicitação"
          variante="primario"
          cor="var(--sem-info)"
          descricao="A obra ou centro de custo define os tipos disponíveis. Toda nova solicitação entra em GEO com status PENDENTE."
        >
          <FormSecao legenda="Origem" colunas={2}>
            <CampoForm
              label="Obra/Centro de Custo"
              obrigatorio
              linha
              erro={errosCampo.obra_id}
              hint={`Digite parte do nome ou do código para filtrar obras e centros de custo enquanto você preenche.${obrasFiltradas.length === 1 && mostrarSugestoesObra ? ' Pressione Enter para selecionar o único resultado.' : ''}`}
            >
              <div ref={campoObraRef} className="relative nova-solicitacao-obra-field">
                <input
                  className="input input-sm nova-solicitacao-obra-input"
                  placeholder="Digite o código ou nome da obra/centro de custo"
                  value={obraBusca}
                  onChange={e => handleChangeBuscaObra(e.target.value)}
                  onFocus={handleFocusBuscaObra}
                  onKeyDown={handleKeyDownBuscaObra}
                />

                {obraSelecionada && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm nova-solicitacao-obra-clear"
                    onMouseDown={e => e.preventDefault()}
                    onClick={limparBuscaObra}
                  >
                    Limpar
                  </button>
                )}

                {mostrarSugestoesObra && (
                  <div className="nova-solicitacao-results-list nova-solicitacao-obra-results absolute left-0 right-0 top-full mt-2 max-h-72 overflow-auto rounded border p-2">
                    {obrasFiltradas.map((obra) => (
                      <button
                        key={obra.id}
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => selecionarObra(obra)}
                        className="nova-solicitacao-result-item nova-solicitacao-obra-result block w-full rounded text-left"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold text-[var(--c-text)]">{obra.nome || 'Obra sem nome'}</div>
                            <div className="text-xs text-[var(--c-muted)]">{formatarLocalidadeObra(obra)}</div>
                          </div>
                          <span className="nova-solicitacao-obra-badge">
                            {getTipoCentroCustoLabel(obra)} - {obra.codigo || 'Sem código'}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Segunda linha de apoio: convive com o hint do campo, como na
                  tela antiga (as duas apareciam juntas). */}
              {mostrarSugestoesObra && obrasFiltradas.length === 0 && (
                <span className="form-hint">Nenhuma obra/centro de custo encontrada com esse termo.</span>
              )}
            </CampoForm>

            <CampoForm label="Tipo de Solicitação" obrigatorio>
              <select
                name="tipo_solicitacao_id"
                onChange={handleChange}
                className="input input-sm"
                required
                value={form.tipo_solicitacao_id}
                disabled={!form.obra_id || catalogoDestino.status !== 'success'}
              >
                <option value="">
                  {!form.obra_id
                    ? 'Selecione a obra/centro de custo primeiro'
                    : catalogoDestino.status === 'loading'
                      ? 'Carregando tipos...'
                      : tiposDisponiveis.length === 0
                        ? 'Nenhum tipo disponível'
                        : 'Selecione'}
                </option>
                {tiposDisponiveis.map(t => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
            </CampoForm>

            {catalogoDestino.status === 'error' && (
              <p className="form-campo--linha form-hint text-[var(--c-danger)]">{catalogoDestino.erro}</p>
            )}

            {catalogoDestino.status === 'success' && tiposDisponiveis.length === 0 && (
              <p className="form-campo--linha form-hint">
                Nenhum tipo foi configurado para este Centro de Custo. Solicite a configuração antes de abrir a solicitação.
              </p>
            )}

            {form.area_responsavel && tiposDisponiveis.length > 0 && !tipoSolicitacaoEscolhido && (
              <p className="form-campo--linha form-hint">
                Selecione o tipo de solicitação para carregar somente os campos necessários.
              </p>
            )}
          </FormSecao>

          {/* Campos da recarga de cartão: componente próprio, largura inteira. */}
          <RecargaCartaoFields
            ativo={usaFluxoRecargaCartao}
            value={cartaoRecargaId}
            onChange={setCartaoRecargaId}
            onContextChange={setRecargaCartaoContexto}
            onSolicitacaoAnteriorEnviada={limparCamposNovaRecargaAposReenvio}
          />

          {!tipoEhDeMedicao && (exibirCamposContrato || exibirCampoSubtipo || exibirCampoCredor
            || exibirFormaPagamento || exibirFavorecidoPagamento) && (
            <FormSecao legenda="Vínculo e pagamento" colunas={2}>
              {exibirCamposContrato && (
                <CampoForm
                  label={rotuloContratoVinculado}
                  obrigatorio={camposContratoObrigatorios}
                  linha
                  erro={errosCampo.ref_contrato}
                  hint={!form.obra_id ? 'Selecione a obra para habilitar a busca de referências de contrato.' : undefined}
                >
                  <div className="flex gap-2 nova-solicitacao-inline-actions">
                    <input
                      className="input input-sm"
                      placeholder={placeholderContratoVinculado}
                      value={refContratoBusca}
                      onChange={e => { setRefContratoBusca(e.target.value); limparErroCampo('ref_contrato'); }}
                      required={camposContratoObrigatorios}
                      disabled={!form.obra_id}
                    />
                    <button type="button" className="btn btn-outline btn-sm" onClick={buscarRefContrato}>
                      Buscar
                    </button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={limparRefContrato}>
                      Limpar
                    </button>
                  </div>
                  {refResultados.length > 1 && (
                    <div className="nova-solicitacao-results-list mt-2 max-h-40 overflow-auto rounded border p-2">
                      {refResultados.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => selecionarContratoRef(item)}
                          className="nova-solicitacao-result-item block w-full rounded p-2 text-left text-sm hover:bg-[var(--ui-surface-2)]"
                        >
                          {item.codigo} - {item.ref_contrato || '-'}
                        </button>
                      ))}
                    </div>
                  )}
                </CampoForm>
              )}

              {/* Ordem pedida pelo cliente (19/08): Subtipo e Credor lado a lado; a Apropriacao
                  desce para a faixa inteira, porque agora ela rateia o contrato entre varias. */}
              {exibirCampoSubtipo && (
                <CampoForm
                  label="Subtipo"
                  obrigatorio={subtipoObrigatorio}
                  erro={errosCampo.tipo_sub_id}
                  hint={subtipoObrigatorio ? 'Obrigatório para este tipo de solicitação.' : undefined}
                >
                  <select
                    name="tipo_sub_id"
                    onChange={handleChange}
                    className="input input-sm"
                    required={subtipoObrigatorio}
                    disabled={!form.tipo_solicitacao_id}
                    value={form.tipo_sub_id}
                  >
                    <option value="">Selecione</option>
                    {tiposSub.map(t => (
                      <option key={t.id} value={t.id}>{t.nome}</option>
                    ))}
                  </select>
                </CampoForm>
              )}

              {exibirCampoCredor && renderCampoCredor()}

              {/* Padrao dos fluxos de pagamento: primeiro a forma; somente depois aparecem os dados
                  que ela realmente exige. Assim boleto nunca pede PIX e PIX nunca pede boleto. */}
              {exibirFormaPagamento && (
                <CampoForm
                  label="Forma de pagamento"
                  obrigatorio={formaPagamentoObrigatoria}
                  erro={errosCampo.forma_pagamento_id || erroFormasPagamento || undefined}
                  hint={!erroFormasPagamento && formasPagamentoDisponiveis.length === 0
                    ? 'Nenhuma forma de pagamento compatível está ativa e liberada.'
                    : undefined}
                >
                  <select
                    className="input input-sm"
                    name="forma_pagamento_id"
                    value={form.forma_pagamento_id}
                    required={formaPagamentoObrigatoria}
                    onChange={(event) => {
                      const formaId = event.target.value;
                      const forma = formasPagamentoDisponiveis
                        .find((item) => String(item.id) === String(formaId)) || null;
                      limparErroCampo('forma_pagamento_id');
                      setForm((prev) => ({
                        ...prev,
                        forma_pagamento_id: formaId,
                        favorecido_chave_pix: formaPagamentoEhPix(forma)
                          ? chavePixPreferencial(favorecidoSelecionado)
                          : ''
                      }));
                    }}
                  >
                    <option value="">Selecione</option>
                    {formasPagamentoDisponiveis.map((forma) => (
                      <option key={forma.id} value={forma.id}>{forma.nome}</option>
                    ))}
                  </select>
                </CampoForm>
              )}

              {exibirFavorecidoPagamento && exibirCampoCredor && (
                <label className="form-campo--linha flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={usarCredorComoFavorecido}
                    disabled={!parceiroSelecionado}
                    onChange={(event) => {
                      const marcado = event.target.checked;
                      setUsarCredorComoFavorecido(marcado);
                      limparErroCampo('favorecido');
                      if (marcado) {
                        setFavorecidoSelecionado(parceiroSelecionado);
                        setForm((prev) => ({
                          ...prev,
                          favorecido_id: parceiroSelecionado?.id ? String(parceiroSelecionado.id) : '',
                          favorecido_chave_pix: pagamentoViaPix ? chavePixPreferencial(parceiroSelecionado) : ''
                        }));
                      } else {
                        setFavorecidoSelecionado(null);
                        setForm((prev) => ({ ...prev, favorecido_id: '', favorecido_chave_pix: '' }));
                      }
                    }}
                  />
                  <span>Usar o credor como favorecido do pagamento</span>
                </label>
              )}

              {exibirFavorecidoPagamento && !usarCredorComoFavorecido && (
                /* O ParceiroBuscaRemota traz o próprio rótulo e o próprio
                   input; envolvê-lo num CampoForm criaria um <label> dentro
                   de outro. Fica a casca `.form-group` do sistema, com a
                   mesma linha de erro (.form-error) dos demais campos. */
                <div className="form-group">
                  <ParceiroBuscaRemota
                    label="Favorecido do pagamento"
                    selecionado={favorecidoSelecionado}
                    obrigatorio={favorecidoObrigatorio}
                    placeholder="Buscar por nome, telefone, CPF/CNPJ ou PIX"
                    onSelecionar={(parceiro) => {
                      limparErroCampo('favorecido');
                      setFavorecidoSelecionado(parceiro);
                      setForm((prev) => ({
                        ...prev,
                        favorecido_id: parceiro ? String(parceiro.id) : '',
                        favorecido_chave_pix: pagamentoViaPix ? chavePixPreferencial(parceiro) : ''
                      }));
                    }}
                  />
                  <CadastroRapidoFavorecidoButton
                    tipoSolicitacaoId={form.tipo_solicitacao_id}
                    tipoSubId={form.tipo_sub_id}
                    areaResponsavel={form.area_responsavel}
                    onCadastrado={(parceiro) => {
                      limparErroCampo('favorecido');
                      setFavorecidoSelecionado(parceiro);
                      setForm((prev) => ({
                        ...prev,
                        favorecido_id: String(parceiro.id),
                        favorecido_chave_pix: pagamentoViaPix
                          ? (parceiro.chave_pix_selecionada || chavePixPreferencial(parceiro))
                          : ''
                      }));
                    }}
                  />
                  {errosCampo.favorecido ? <span className="form-error">{errosCampo.favorecido}</span> : null}
                </div>
              )}

              {exibirFormaPagamento && pagamentoViaPix && (
                <CampoForm
                  label="Chave PIX do favorecido"
                  obrigatorio
                  erro={errosCampo.favorecido_chave_pix}
                  hint="Sugerida pelas chaves 1, 2 e 3 do cadastro, nesta ordem. O valor pode ser alterado."
                >
                  <input
                    className="input input-sm"
                    name="favorecido_chave_pix"
                    value={form.favorecido_chave_pix}
                    required
                    onChange={handleChange}
                    placeholder="Informe ou altere a chave PIX"
                  />
                </CampoForm>
              )}

              {/* Campo de ARQUIVO não usa `CampoForm`: o gatilho do seletor já é
                  um <label>, e label dentro de label é HTML inválido (o clique
                  dispara duas vezes). Mesmas classes `.form-*` do sistema —
                  rótulo, obrigatoriedade e linha de erro idênticos. */}
              {exibirFormaPagamento && pagamentoViaBoleto && (
                <div className="form-group">
                  <span className="form-label form-label--required">Boleto</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="btn btn-outline btn-sm inline-flex cursor-pointer items-center gap-2">
                      <HiPaperClip className="h-4 w-4" />
                      <span>Selecionar boleto</span>
                      <input
                        ref={boletoRef}
                        type="file"
                        className="hidden"
                        accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                        onChange={(event) => {
                          selecionarArquivoBoleto(event.target.files);
                          event.target.value = '';
                        }}
                      />
                    </label>
                    <span className="text-xs text-[var(--c-muted)]">
                      {boletoArquivos[0]?.nome || 'Nenhum boleto selecionado'}
                    </span>
                    {boletoArquivos.length > 0 && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={removerArquivoBoleto}
                      >
                        Remover
                      </button>
                    )}
                  </div>
                  {errosCampo.boleto ? <span className="form-error">{errosCampo.boleto}</span> : null}
                </div>
              )}
            </FormSecao>
          )}
        </BlocoConteudo>

        {exibirCamposContrato && (
          <BlocoConteudo
            titulo="Contrato"
            descricao={tipoEhDeMedicao
              ? 'Contrato e credor vinculados à medição, com a divisão entre as apropriações contratuais.'
              : 'Contrato ao qual esta solicitação se vincula e a divisão dela entre as apropriações do contrato.'}
          >
            <FormSecao colunas={2}>
              <CampoForm
                label="Contrato"
                obrigatorio={camposContratoObrigatorios}
                erro={errosCampo.contrato_id}
              >
                <ApropriacaoAutocomplete
                  value={form.contrato_id}
                  options={contratosAutocomplete}
                  onChange={(contratoId) => {
                    const contrato = contratosDisponiveis.find(c => String(c.id) === String(contratoId));
                    limparErroCampo('contrato_id');
                    limparErroCampo('ref_contrato');
                    aplicarContratoSelecionado(contrato || null);
                    if (!contratoId) {
                      setContratosRef([]);
                    }
                  }}
                  disabled={!form.obra_id && contratosDisponiveis.length === 0}
                  required={camposContratoObrigatorios}
                  placeholder="Digite o código ou o título do contrato"
                  disabledPlaceholder={!form.obra_id
                    ? 'Selecione a obra primeiro'
                    : 'Nenhum contrato disponível'}
                  emptyText="Nenhum contrato encontrado"
                  inputClassName="input input-sm w-full"
                />
              </CampoForm>

              {tipoEhDeMedicao && exibirCampoCredor && renderCampoCredor()}
            </FormSecao>

            {tipoEhDeMedicao && contratoSelecionadoMedicaoBloqueada && (
              /* CONDIÇÃO derivada do conteúdo, não evento: fecha e o problema
                 continua. Por isso segue como faixa fixa no fluxo (e não em
                 `Avisos`), agora com os tokens semânticos de alerta no lugar
                 da paleta crua âmbar (R25). */
              <section
                className="tarja tarja--warning mt-4 rounded-lg border px-4 py-3 text-sm"
                style={{
                  borderColor: 'var(--sem-warning-border)',
                  background: 'var(--sem-warning-bg)',
                  color: 'var(--c-text)'
                }}
                aria-label="Medição aguardando retorno da solicitação"
                data-testid="contrato-medicao-fora-setor"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <HiOutlineArrowUturnLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <div>
                      <p className="font-semibold">
                        Contrato visivel · medicao temporariamente bloqueada
                      </p>
                      <p className="text-xs leading-5 text-[var(--c-muted)]">
                        A solicitacao {contratoSelecionado?.solicitacaoContrato?.codigo || contratoSelecionado?.codigo || ''}
                        {' '}esta no setor {contratoSelecionado?.contexto_interacao?.setor_atual || 'responsavel atual'}.
                        Ela precisa voltar para {contratoSelecionado?.contexto_interacao?.setor_usuario || 'seu setor'} antes de registrar a medicao.
                      </p>
                    </div>
                  </div>

                  {contratoSelecionado?.contexto_interacao?.pedido_retorno_pendente ? (
                    <span
                      className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold"
                      style={{ borderColor: 'var(--sem-warning-border)' }}
                    >
                      <HiOutlineClock className="h-4 w-4" /> Retorno solicitado
                    </span>
                  ) : contratoSelecionado?.contexto_interacao?.pode_solicitar_retorno ? (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setRetornoContrato((atual) => ({ ...atual, aberto: !atual.aberto, erro: '' }))}
                    >
                      Solicitar retorno
                    </button>
                  ) : null}
                </div>

                {contratoSelecionado?.contexto_interacao?.pedido_retorno_pendente && (
                  <p className="mt-2 border-t pt-2 text-xs" style={{ borderColor: 'var(--sem-warning-border)' }}>
                    <span className="font-semibold">Motivo enviado:</span>{' '}
                    {contratoSelecionado.contexto_interacao.pedido_retorno_pendente.motivo}
                  </p>
                )}

                {!contratoSelecionado?.contexto_interacao?.pedido_retorno_pendente
                  && !contratoSelecionado?.contexto_interacao?.pode_solicitar_retorno && (
                  <p className="mt-2 border-t pt-2 text-xs" style={{ borderColor: 'var(--sem-warning-border)' }}>
                    Seu usuário pode visualizar o contrato, mas não possui permissão para solicitar o retorno.
                  </p>
                )}

                {retornoContrato.aberto
                  && !contratoSelecionado?.contexto_interacao?.pedido_retorno_pendente && (
                  <div className="mt-3 grid gap-2 border-t pt-3" style={{ borderColor: 'var(--sem-warning-border)' }}>
                    <label className="form-group min-w-0">
                      <span className="form-label form-label--required">Por que precisa do retorno?</span>
                      <textarea
                        className="input w-full resize-y nova-solicitacao-textarea"
                        value={retornoContrato.motivo}
                        onChange={(event) => setRetornoContrato((atual) => ({
                          ...atual,
                          motivo: event.target.value,
                          erro: ''
                        }))}
                        placeholder="Ex.: preciso registrar a medição deste período e anexar os documentos."
                        maxLength={2000}
                        autoFocus
                      />
                    </label>
                    <div className="app-actionbar">
                      <button type="button" className="btn btn-primary btn-sm"
                        onClick={solicitarRetornoDoContrato}
                        disabled={retornoContrato.processando || !retornoContrato.motivo.trim()}>
                        {retornoContrato.processando ? 'Enviando...' : 'Enviar pedido'}
                      </button>
                      <button type="button" className="btn btn-outline btn-sm"
                        onClick={() => setRetornoContrato({ aberto: false, motivo: '', processando: false, erro: '' })}
                        disabled={retornoContrato.processando}>
                        Fechar
                      </button>
                    </div>
                  </div>
                )}

                {retornoContrato.erro && (
                  <p className="form-error mt-2" role="alert">
                    {retornoContrato.erro}
                  </p>
                )}
              </section>
            )}

            {/* O rateio de apropriacao tambem nao e da MEDICAO do fluxo novo.
                Ela nao cria solicitacao (PI-16): o que o backend recebe aqui e descartado junto com
                valor, descricao e vencimento. E os titulos ja nasceram com o rateio do CONTRATO, na
                aprovacao — este bloco pediria de novo, com base num Valor que nao existe mais, uma
                divisao que ja esta feita. Ele so ficou de pe ate agora porque o campo Valor
                existia. */}
            {form.contrato_id && !usaMedicaoFluxoNovo && (
              <div className="mt-4 space-y-2 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[var(--c-text)]">
                      Apropriações do contrato
                      {apropriacoesContratoObrigatorias ? <span className="text-[var(--c-danger)]"> *</span> : null}
                    </p>
                    <p className="text-xs text-[var(--c-muted)]">
                      {apropriacoesContratoObrigatorias
                        ? 'Obrigatorio para este tipo. Marque os itens que receberao esta solicitacao e informe o rateio por percentual ou valor em R$.'
                        : 'Marque os itens que receberao esta solicitacao e informe o rateio por percentual ou valor em R$.'}
                    </p>
                  </div>
                  <span className="rounded-full bg-[var(--ui-surface-2)] px-2 py-1 text-xs font-semibold text-[var(--c-muted)]">
                    {apropriacoesRateioSelecionadas.length}/{apropriacoesContratoRateio.length} selecionada(s)
                  </span>
                </div>

                {apropriacoesContratoRateio.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-[var(--c-border)] px-3 py-2 text-xs text-[var(--c-muted)]">
                    Este contrato ainda não possui apropriações estruturadas cadastradas.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {apropriacoesContratoRateio.map((item, index) => (
                      <div
                        key={`${item.apropriacao_id}-${index}`}
                        className="grid gap-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] p-2 md:grid-cols-3"
                      >
                        <label className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={Boolean(item.selecionado)}
                            onChange={e => {
                              limparErroCampo('apropriacoes_contrato');
                              alternarApropriacaoContratoRateio(index, e.target.checked);
                            }}
                          />
                          <span>
                            <span className="font-semibold text-[var(--c-text)]">
                              {item.codigo || item.apropriacao_id}
                            </span>
                            {item.descricao && (
                              <span className="text-[var(--c-muted)]"> - {item.descricao}</span>
                            )}
                          </span>
                        </label>
                        <input
                          className="input input-sm"
                          value={item.percentual}
                          onChange={e => {
                            limparErroCampo('apropriacoes_contrato');
                            alterarApropriacaoContratoRateio(index, 'percentual', e.target.value);
                          }}
                          placeholder="%"
                          aria-label={`Percentual da apropriação ${item.codigo || item.apropriacao_id}`}
                          disabled={!item.selecionado}
                        />
                        <input
                          className="input input-sm"
                          value={item.valor_rateio}
                          onChange={e => {
                            limparErroCampo('apropriacoes_contrato');
                            atualizarValorRateioContrato(index, e.target.value);
                          }}
                          placeholder="Valor R$"
                          aria-label={`Valor em reais da apropriação ${item.codigo || item.apropriacao_id}`}
                          disabled={!item.selecionado}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {errosCampo.apropriacoes_contrato ? (
                  <p className="form-error" role="alert">{errosCampo.apropriacoes_contrato}</p>
                ) : null}
              </div>
            )}
          </BlocoConteudo>
        )}

        {usaMedicaoFluxoNovo && !contratoSelecionadoMedicaoBloqueada && (
          <BlocoMedicaoContrato
            contratoId={Number(form.contrato_id)}
            tipoSolicitacaoId={form.tipo_solicitacao_id}
            tipoSubId={form.tipo_sub_id}
            areaResponsavel={form.area_responsavel}
            onChange={setMedicaoContratoDados}
            periodo={{ inicio: form.data_inicio_medicao, fim: form.data_fim_medicao }}
            periodoObrigatorio={medicaoObrigatoria}
            onPeriodoChange={handleChange}
            boletoArquivo={boletoArquivos[0] || null}
            onSelecionarBoleto={selecionarArquivoBoleto}
            /* Este `onRemoverBoleto` tambem e disparado AUTOMATICAMENTE pelo bloco
               quando a forma de pagamento deixa de ser boleto — por isso ele nao
               pergunta nada: confirmacao aqui perguntaria por uma limpeza que a
               pessoa nao pediu. A remocao pelo botao da tela (acima) confirma. */
            onRemoverBoleto={() => setBoletoArquivos([])}
          />
        )}

        {/* PI-15: acao separada da medicao. Nao envia nem valida o formulario em curso — o modal
            fecha e a medicao continua exatamente como estava. Serve contrato legado e do fluxo
            novo, por isso nao ha condicao de `fluxo_novo` aqui. */}
        {podeSolicitarAditivo && (
          <BlocoConteudo
            titulo="Termo aditivo"
            descricao="Acrescenta valor ao contrato selecionado, com limite de 25% do valor original. Entra como pendente e não interfere nesta medição."
          >
            <div className="app-actionbar">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                data-testid="botao-solicitar-aditivo"
                onClick={() => setModalAditivoAberto(true)}
              >
                Solicitar termo aditivo
              </button>
            </div>
          </BlocoConteudo>
        )}

        {/* O valor permanece antes da apropriacao para preservar a sequencia do preenchimento e
            permitir que o rateio use um total ja informado. */}
        {(exibirValor || usaFluxoDespesaEventual || exibirCampoApropriacao) && (
          <BlocoConteudo titulo="Valor">
            <FormSecao colunas={2}>
              {exibirValor && (
                <CampoForm
                  label="Valor"
                  obrigatorio={valorObrigatorio && campoObrigatorio('valor')}
                  erro={errosCampo.valor}
                >
                  {/* R6: campo de dinheiro dimensionado pelo pior caso —
                      `.input-moeda` garante 180px, alinhamento à direita e
                      tabular-nums. */}
                  <input
                    name="valor"
                    type="text"
                    className="input input-sm input-moeda"
                    value={valorTexto}
                    onChange={e => { limparErroCampo('valor'); atualizarValor(e.target.value); }}
                    placeholder="R$ 0,00"
                    required={valorObrigatorio && campoObrigatorio('valor')}
                  />
                </CampoForm>
              )}

              {usaFluxoDespesaEventual && (
                <div
                  className="form-campo--linha rounded-lg border px-3 py-2 text-sm"
                  style={despesaExcedeLimite
                    ? {
                      borderColor: 'var(--sem-danger-border)',
                      background: 'var(--sem-danger-bg)',
                      color: 'var(--sem-danger)'
                    }
                    : {
                      borderColor: 'var(--c-border)',
                      background: 'var(--c-bg)',
                      color: 'var(--c-text)'
                    }}
                  aria-live="polite"
                >
                  {despesaEventualSaldo.status === 'loading' && 'Calculando o saldo da obra...'}
                  {despesaEventualSaldo.status === 'error' && despesaEventualSaldo.erro}
                  {despesaEventualSaldo.status === 'success' && saldoDespesaDados && (
                    <div className="flex flex-wrap gap-x-6 gap-y-1">
                      <span><strong>Limite por solicitação:</strong> {formatarMoeda(Number(saldoDespesaDados.limite_solicitacao || 0))}</span>
                      <span><strong>Comprometido na obra:</strong> {formatarMoeda(Number(saldoDespesaDados.comprometido_obra || 0))}</span>
                      <span><strong>Saldo disponível na obra:</strong> {formatarMoeda(Number(saldoDespesaDados.saldo_obra || 0))}</span>
                      <span><strong>Saldo após esta solicitação:</strong> {formatarMoeda(saldoDespesaAposSolicitacao)}</span>
                    </div>
                  )}
                </div>
              )}

              {exibirCampoApropriacao && (
                <CampoForm
                  label="Apropriação da Solicitação na Obra"
                  obrigatorio={exigeApropriacaoPrincipal}
                  linha
                  erro={errosCampo.apropriacao}
                  hint={exigeApropriacaoPrincipal
                    ? 'Campo obrigatorio conforme configuracao da nova solicitacao.'
                    : 'Campo opcional. Use quando a solicitacao precisar nascer vinculada a uma apropriacao da obra.'}
                >
                  {/* No fluxo novo de contrato a apropriacao deixou de ser UMA: o cliente pediu ratear o
                      valor do contrato entre varias, por % ou por R$ (19/08). No fluxo padrao continua
                      sendo uma so — nada muda para as 665 solicitacoes historicas. */}
                  {usaFluxoContratoNovo ? (
                    <RateioApropriacoesContrato
                      linhas={rateioContrato}
                      apropriacoes={apropriacoes}
                      valorTotal={form.valor}
                      onChange={(linhas) => { limparErroCampo('apropriacao'); setRateioContrato(linhas); }}
                      desabilitado={!form.obra_id}
                    />
                  ) : (
                    <ApropriacaoAutocomplete
                      value={form.apropriacao_id}
                      options={apropriacoes}
                      onChange={(id) => { limparErroCampo('apropriacao'); setForm({ ...form, apropriacao_id: id }); }}
                      disabled={!form.obra_id}
                      required={exigeApropriacaoPrincipal}
                      inputClassName="input input-sm w-full"
                      disabledPlaceholder="Selecione a obra primeiro"
                    />
                  )}
                  {form.obra_id && apropriacoes.length === 0 && (
                    <span className="form-hint">Nenhuma apropriação ativa encontrada para esta obra.</span>
                  )}
                </CampoForm>
              )}
            </FormSecao>
          </BlocoConteudo>
        )}

        {(exibirCampoDescricao || exibirJustificativa || usaFluxoDespesaEventual
          || exibirCampoDataVencimento || exibirDataDemissao) && (
          <BlocoConteudo
            titulo="Identificação e prazos"
            descricao="O que a solicitação diz de si e as datas que ela precisa cumprir."
          >
            <FormSecao colunas={2}>
              {/* Titulo do contrato ABAIXO do Valor (ordem pedida em 19/08), e nao ao lado: ocupa a
                  faixa inteira para cair na linha de baixo. Antes ele ficava depois do bloco do
                  contrato, longe do valor que ele identifica. */}
              {exibirCampoDescricao && (
                <CampoForm
                  label={usaFluxoContratoNovo ? 'Título do contrato' : 'Título da solicitação'}
                  obrigatorio={descricaoExigida}
                  tipo="texto-longo"
                  erro={errosCampo.descricao}
                >
                  <textarea
                    name="descricao"
                    onChange={e => {
                      limparErroCampo('descricao');
                      setForm(prev => ({
                        ...prev,
                        descricao: e.target.value.slice(0, 50)
                      }));
                    }}
                    maxLength={50}
                    className="input input-sm nova-solicitacao-textarea text-[var(--c-text)] placeholder:text-[var(--c-muted)]"
                    required={descricaoExigida}
                    value={form.descricao}
                  />
                </CampoForm>
              )}

              {exibirJustificativa && (
                <CampoForm
                  label="Justificativa"
                  obrigatorio={justificativaObrigatoria}
                  tipo="texto-longo"
                  erro={errosCampo.justificativa}
                >
                  <textarea
                    name="justificativa"
                    onChange={handleChange}
                    className="input input-sm nova-solicitacao-textarea text-[var(--c-text)] placeholder:text-[var(--c-muted)]"
                    required={justificativaObrigatoria}
                    value={form.justificativa}
                    rows={3}
                    placeholder="Explique a necessidade desta solicitação"
                  />
                </CampoForm>
              )}

              {usaFluxoDespesaEventual && (
                <fieldset className="form-campo--linha grid gap-2 rounded-lg border border-[var(--c-border)] p-3">
                  <legend className="px-1 text-sm font-semibold text-[var(--c-text)]">Declarações obrigatórias</legend>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={despesaEventualDeclaracoes.despesa_pontual_nao_recorrente}
                      onChange={(event) => {
                        limparErroCampo('despesa_declaracoes');
                        setDespesaEventualDeclaracoes((atual) => ({
                          ...atual,
                          despesa_pontual_nao_recorrente: event.target.checked
                        }));
                      }}
                    />
                    <span>Confirmo que esta e uma despesa pontual, esporadica e não recorrente.</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={despesaEventualDeclaracoes.sem_vinculo_contratual}
                      onChange={(event) => {
                        limparErroCampo('despesa_declaracoes');
                        setDespesaEventualDeclaracoes((atual) => ({
                          ...atual,
                          sem_vinculo_contratual: event.target.checked
                        }));
                      }}
                    />
                    <span>Confirmo que a despesa não caracteriza vínculo ou necessidade de contrato.</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={despesaEventualDeclaracoes.nao_fracionada}
                      onChange={(event) => {
                        limparErroCampo('despesa_declaracoes');
                        setDespesaEventualDeclaracoes((atual) => ({
                          ...atual,
                          nao_fracionada: event.target.checked
                        }));
                      }}
                    />
                    <span>Confirmo que a despesa não foi fracionada para se enquadrar no limite.</span>
                  </label>
                  {errosCampo.despesa_declaracoes ? (
                    <p className="form-error" role="alert">{errosCampo.despesa_declaracoes}</p>
                  ) : null}
                </fieldset>
              )}

              {exibirCampoDataVencimento && (
                <CampoForm
                  label={rotuloDataSolicitacao}
                  obrigatorio={dataVencimentoExigida}
                  erro={errosCampo.data_vencimento}
                >
                  <DateInputBR
                    name="data_vencimento"
                    onChange={handleChange}
                    className="input input-sm"
                    value={form.data_vencimento}
                    min={hojeInput}
                    required={dataVencimentoExigida}
                  />
                </CampoForm>
              )}

              {exibirDataDemissao && (
                <CampoForm
                  label="Data de demissão"
                  obrigatorio={dataDemissaoObrigatoria}
                  erro={errosCampo.data_demissao}
                >
                  <DateInputBR
                    name="data_demissao"
                    onChange={handleChange}
                    className="input input-sm"
                    value={form.data_demissao}
                    required={dataDemissaoObrigatoria}
                  />
                </CampoForm>
              )}
            </FormSecao>
          </BlocoConteudo>
        )}

        {/* Blocos de contrato ficam FORA do grid de duas colunas: dentro dele o bloco ocupava
            uma coluna so, espremido, com metade da tela vazia ao lado. */}
        {usaFluxoContratoNovo && (
          <BlocoContratoFluxoNovo
            obraId={form.obra_id}
            valorTotal={form.valor}
            contratadoPrincipal={parceiroSelecionado}
            limiteJuridico={limiteJuridico}
            camposConfigurados={camposNovaSolicitacao}
            onChange={setContratoNovoDados}
          />
        )}

        {(exibirPeriodoMedicaoSolto || exibirRefContratoAbertura || exibirItensApropriacao) && (
          <BlocoConteudo
            titulo="Medição e apropriação do contrato"
            descricao="Período medido, referência do contrato de abertura e os itens que serão apropriados."
          >
            <FormSecao colunas={2}>
              {exibirPeriodoMedicaoSolto && (
                <>
                  <CampoForm
                    label="Data inicial (Medição)"
                    obrigatorio={medicaoObrigatoria}
                    erro={errosCampo.periodo_medicao}
                  >
                    <DateInputBR
                      name="data_inicio_medicao"
                      onChange={(event) => { limparErroCampo('periodo_medicao'); handleChange(event); }}
                      className="input input-sm"
                      value={form.data_inicio_medicao}
                      required={medicaoObrigatoria}
                    />
                  </CampoForm>
                  <CampoForm label="Data final (Medição)" obrigatorio={medicaoObrigatoria}>
                    <DateInputBR
                      name="data_fim_medicao"
                      onChange={(event) => { limparErroCampo('periodo_medicao'); handleChange(event); }}
                      className="input input-sm"
                      value={form.data_fim_medicao}
                      required={medicaoObrigatoria}
                    />
                  </CampoForm>
                </>
              )}

              {exibirRefContratoAbertura && (
                <CampoForm
                  label="Ref. do Contrato"
                  obrigatorio={refContratoAberturaObrigatoria}
                  erro={errosCampo.ref_contrato_abertura}
                >
                  <input
                    name="ref_contrato_abertura"
                    onChange={handleChange}
                    className="input input-sm"
                    required={refContratoAberturaObrigatoria}
                    value={form.ref_contrato_abertura}
                    placeholder="Informe a ref do contrato"
                  />
                </CampoForm>
              )}

              {exibirItensApropriacao && (
                <CampoForm
                  label="Itens de Apropriação"
                  obrigatorio={itensApropriacaoObrigatorio}
                  tipo="texto-longo"
                  erro={errosCampo.itens_apropriacao}
                >
                  <textarea
                    name="itens_apropriacao"
                    onChange={handleChange}
                    className="input input-sm nova-solicitacao-textarea text-[var(--c-text)] placeholder:text-[var(--c-muted)]"
                    required={itensApropriacaoObrigatorio}
                    value={form.itens_apropriacao}
                    placeholder="Descreva os itens de apropriação"
                  />
                </CampoForm>
              )}
            </FormSecao>
          </BlocoConteudo>
        )}

        {tipoSolicitacaoEscolhido && (
          <BlocoConteudo titulo={exibirAnexos ? 'Anexos e envio' : 'Envio'}>
            {exibirAnexos && !(tipoEhDeMedicao && (pagamentoViaBoleto || medicaoContratoDados?.pagamento?.via_boleto)) && (
              /* Mesmo motivo do boleto: o gatilho do seletor de arquivo é um
                 <label>, então este campo usa as classes `.form-*` direto em
                 vez do `CampoForm` (que também é um <label>). A tela ANTIGA
                 tinha exatamente esse aninhamento aqui. */
              <div className="form-group nova-solicitacao-anexos">
                <span className={`form-label${(tipoEhDeMedicao || usaFluxoDespesaEventual || anexosObrigatorios) ? ' form-label--required' : ''}`}>
                  {tipoEhDeMedicao
                    ? 'Anexo da medição'
                    : (usaFluxoDespesaEventual
                      ? 'Comprovante da despesa'
                      : (tipoEhAdmLocalObra ? 'Anexo/comprovante' : 'Anexos'))}
                </span>
                <div className="flex flex-wrap items-center gap-2 nova-solicitacao-inline-actions">
                  <label className="btn btn-outline btn-sm inline-flex cursor-pointer items-center gap-2">
                    <HiPaperClip className="h-4 w-4" />
                    <span>Anexar arquivos</span>
                    <input
                      type="file"
                      multiple
                      accept={UPLOAD_DOCUMENT_ACCEPT}
                      ref={anexosRef}
                      className="hidden"
                      onChange={e => {
                        limparErroCampo('anexos');
                        adicionarArquivos(e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <span className="text-xs text-[var(--c-muted)]">
                    {arquivos.length > 0
                      ? `${arquivos.length} arquivo(s) selecionado(s)`
                      : 'Nenhum arquivo selecionado'}
                  </span>
                </div>
                <PendingAttachmentsList
                  items={arquivos}
                  onRemove={(index) => removerArquivo(index)}
                  className="mt-2 space-y-1"
                  itemClassName="nova-solicitacao-file-item flex items-center justify-between gap-3 text-sm bg-[var(--c-surface)] border border-[var(--c-border)] rounded px-2 py-1"
                  removeButtonClassName="px-2 font-semibold text-[var(--c-primary)]"
                />
                {errosCampo.anexos ? <span className="form-error">{errosCampo.anexos}</span> : null}
              </div>
            )}

            <div className="app-actionbar">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={
                  criandoSolicitacao ||
                  (tipoEhDeMedicao && contratoSelecionadoMedicaoBloqueada) ||
                  (usaFluxoRecargaCartao && (!cartaoRecargaId || recargaCartaoContexto?.bloqueado)) ||
                  (usaApropriacaoAutomaticaObra && apropriacaoAutomatica.status === 'loading') ||
                  (usaFluxoDespesaEventual && despesaEventualSaldo.status === 'loading')
                }
              >
                {criandoSolicitacao ? 'Criando...' : 'Criar Solicitação'}
              </button>
            </div>
          </BlocoConteudo>
        )}
      </form>

      {/*
        R9/R27 — este modal INTERROMPE outro trabalho (escolher o credor no
        meio da solicitação), então modal é o lugar certo; o que mudou foi a
        casca: era `fixed inset-0` à mão, com painel de altura livre e sem
        rolagem própria. Agora é o `OverlayModal` do sistema, que resolve
        empilhamento, trava de rolagem, Escape, foco e a rolagem do corpo com
        cabeçalho e rodapé fixos (R27).
      */}
      <OverlayModal
        aberto={modalCredoresContratoAberto}
        rotulo="Credores do contrato"
        largura="var(--modal-max-w-md, 680px)"
        onFechar={() => setModalCredoresContratoAberto(false)}
      >
        <div data-modal="cabecalho" className="app-bloco-head">
          <h2 className="app-bloco-titulo">Credores do contrato</h2>
          <span className="app-bloco-acoes">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setModalCredoresContratoAberto(false)}
            >
              Fechar
            </button>
          </span>
        </div>

        <div className="p-4">
          <p className="text-sm text-muted">
            Selecione um dos credores vinculados ao contrato informado.
          </p>

          {/* R3/F1: UMA busca no contexto do modal, ocupando a faixa (.app-busca). */}
          <div className="mt-3 flex items-center gap-2">
            <HiOutlineMagnifyingGlass className="h-4 w-4 shrink-0 text-[var(--c-muted)]" aria-hidden="true" />
            <input
              className="input input-sm app-busca"
              placeholder="Pesquisar por nome ou CPF/CNPJ"
              value={credorContratoModalBusca}
              onChange={(event) => setCredorContratoModalBusca(event.target.value)}
              autoFocus
            />
          </div>

          <div className="mt-3 rounded-lg border border-[var(--c-border)]">
          {credoresContratoModalFiltrados.length === 0 ? (
            <div className="p-4 text-sm text-[var(--c-muted)]">
              Nenhum credor disponível para a busca informada.
            </div>
          ) : (
            credoresContratoModalFiltrados.map((credor) => {
              const selecionado = String(form.parceiro_id) === String(credor.id);
              return (
                <button
                  key={credor.id}
                  type="button"
                  className="block w-full border-b border-[var(--c-border)] px-4 py-3 text-left text-sm last:border-b-0 hover:bg-[var(--ui-surface-2)]"
                  style={{ background: selecionado ? 'var(--sem-info-bg)' : 'var(--c-surface)' }}
                  onClick={() => selecionarParceiro(credor)}
                >
                  <span className="block font-semibold text-[var(--c-text)]">{formatarCredor(credor)}</span>
                </button>
              );
            })
          )}
          </div>
        </div>
      </OverlayModal>

      {/*
        R9 — cadastrar credor INTERROMPE o trabalho principal (abrir a
        solicitação): é o exemplo escrito na própria regra de quando o modal
        protege em vez de atrapalhar. Fica em modal, agora no `OverlayModal`
        do sistema (R27: corpo rola, cabeçalho e rodapé ficam).
      */}
      <OverlayModal
        aberto={exibirCadastroCredor && modalParceiroAberto}
        rotulo="Cadastrar Credor"
        onFechar={() => setModalParceiroAberto(false)}
      >
        <div data-modal="cabecalho" className="app-bloco-head">
          <h2 className="app-bloco-titulo">Cadastrar Credor</h2>
          <span className="app-bloco-acoes">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setModalParceiroAberto(false)}
            >
              Fechar
            </button>
          </span>
        </div>

        <div className="p-4">
          {/* A faixa de avisos tem UM dono por contexto (R16): com o modal
              aberto ela vive AQUI — no topo da página ficaria atrás do fundo
              escurecido. */}
          {faixaAvisos}
          <p className="text-sm text-muted">
            Informe os dados principais para vincular o credor a esta solicitação.
          </p>

          <FormSecao legenda="Identificação" colunas={2}>
            <CampoForm label="CPF/CNPJ" obrigatorio>
              <input
                className="input input-sm"
                value={novoParceiro.cpf_cnpj}
                onChange={e => setNovoParceiro(prev => ({ ...prev, cpf_cnpj: maskCpfCnpj(e.target.value) }))}
              />
            </CampoForm>
            <CampoForm label="Nome" obrigatorio>
              <input
                className="input input-sm"
                value={novoParceiro.nome}
                onChange={e => setNovoParceiro(prev => ({ ...prev, nome: e.target.value }))}
              />
            </CampoForm>
            <CampoForm label="Telefone" obrigatorio>
              <input
                className="input input-sm"
                value={novoParceiro.telefone}
                onChange={e => setNovoParceiro(prev => ({ ...prev, telefone: maskPhone(e.target.value) }))}
              />
            </CampoForm>
            <CampoForm label="E-mail">
              <input
                className="input input-sm"
                value={novoParceiro.email}
                onChange={e => setNovoParceiro(prev => ({ ...prev, email: e.target.value }))}
              />
            </CampoForm>
          </FormSecao>

          {/* Endereco obrigatorio no cadastro (PI-20).
              Estes campos ja existiam no estado do formulario, mas nao eram renderizados — e e
              por isso que 2.428 dos 2.454 fornecedores ativos estao sem endereco. Exigir aqui
              evita que o contrato acima do limite pare na conferencia depois. */}
          <BlocoConteudo
            variante="secundario"
            titulo="Endereço do credor"
            descricao="Obrigatório: contrato acima do limite vai ao Jurídico, e a minuta precisa identificar e localizar a parte."
          >
            <FormSecao colunas={3}>
              <CampoForm label="Logradouro" obrigatorio span={2}>
                <input className="input input-sm" name="novo_credor_endereco"
                  value={novoParceiro.endereco}
                  onChange={e => setNovoParceiro(prev => ({ ...prev, endereco: e.target.value }))} />
              </CampoForm>
              <CampoForm label="Número" obrigatorio>
                <input className="input input-sm" name="novo_credor_numero"
                  value={novoParceiro.numero}
                  onChange={e => setNovoParceiro(prev => ({ ...prev, numero: e.target.value }))} />
              </CampoForm>
              <CampoForm label="Complemento">
                <input className="input input-sm" name="novo_credor_complemento"
                  value={novoParceiro.complemento || ''}
                  onChange={e => setNovoParceiro(prev => ({ ...prev, complemento: e.target.value }))} />
              </CampoForm>
              <CampoForm label="Bairro" obrigatorio span={2}>
                <input className="input input-sm" name="novo_credor_bairro"
                  value={novoParceiro.bairro}
                  onChange={e => setNovoParceiro(prev => ({ ...prev, bairro: e.target.value }))} />
              </CampoForm>
              <CampoForm label="CEP" obrigatorio>
                <input className="input input-sm" name="novo_credor_cep"
                  value={novoParceiro.cep}
                  onChange={e => setNovoParceiro(prev => ({ ...prev, cep: e.target.value }))} />
              </CampoForm>
              <CampoForm label="Municipio" obrigatorio span={2}>
                <input className="input input-sm" name="novo_credor_municipio"
                  value={novoParceiro.municipio}
                  onChange={e => setNovoParceiro(prev => ({ ...prev, municipio: e.target.value }))} />
              </CampoForm>
              <CampoForm label="UF" obrigatorio>
                <input className="input input-sm" name="novo_credor_estado" maxLength={2}
                  value={novoParceiro.estado}
                  onChange={e => setNovoParceiro(prev => ({ ...prev, estado: e.target.value }))} />
              </CampoForm>
            </FormSecao>
          </BlocoConteudo>

          <BlocoConteudo
            variante="secundario"
            titulo="Chaves PIX opcionais"
            descricao="Cadastre até duas chaves fixas e uma chave variável para uso financeiro."
          >
            <FormSecao colunas={2}>
              <CampoForm label="Chave PIX fixa 1 — tipo">
                <select
                  className="input input-sm"
                  value={novoParceiro.pix_chave_fixa_1_tipo}
                  onChange={e => setNovoParceiro(prev => ({ ...prev, pix_chave_fixa_1_tipo: e.target.value }))}
                >
                  {PIX_TIPOS_CHAVE.map((tipo) => (
                    <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
                  ))}
                </select>
              </CampoForm>
              <CampoForm label="Chave PIX fixa 1">
                <input
                  className="input input-sm"
                  value={novoParceiro.pix_chave_fixa_1}
                  onChange={e => setNovoParceiro(prev => ({ ...prev, pix_chave_fixa_1: e.target.value }))}
                  placeholder="Informe a chave"
                />
              </CampoForm>

              <CampoForm label="Chave PIX fixa 2 — tipo">
                <select
                  className="input input-sm"
                  value={novoParceiro.pix_chave_fixa_2_tipo}
                  onChange={e => setNovoParceiro(prev => ({ ...prev, pix_chave_fixa_2_tipo: e.target.value }))}
                >
                  {PIX_TIPOS_CHAVE.map((tipo) => (
                    <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
                  ))}
                </select>
              </CampoForm>
              <CampoForm label="Chave PIX fixa 2">
                <input
                  className="input input-sm"
                  value={novoParceiro.pix_chave_fixa_2}
                  onChange={e => setNovoParceiro(prev => ({ ...prev, pix_chave_fixa_2: e.target.value }))}
                  placeholder="Informe a chave"
                />
              </CampoForm>

              <CampoForm label="Chave PIX variável — tipo">
                <select
                  className="input input-sm"
                  value={novoParceiro.pix_chave_variavel_tipo}
                  onChange={e => setNovoParceiro(prev => ({ ...prev, pix_chave_variavel_tipo: e.target.value }))}
                >
                  {PIX_TIPOS_CHAVE.map((tipo) => (
                    <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
                  ))}
                </select>
              </CampoForm>
              <CampoForm label="Chave PIX variável">
                <input
                  className="input input-sm"
                  value={novoParceiro.pix_chave_variavel}
                  onChange={e => setNovoParceiro(prev => ({ ...prev, pix_chave_variavel: e.target.value }))}
                  placeholder="Informe a chave"
                />
              </CampoForm>
            </FormSecao>
          </BlocoConteudo>

          {/*
            ACHADO REGISTRADO, NADA REMOVIDO (B3 / disciplina de regras 2):
            os seis campos abaixo gravam EXATAMENTE as mesmas chaves do
            endereço obrigatório acima (endereco, numero, bairro, cep,
            municipio, estado) — mesmo dado, mesmo papel, duas entradas, e com
            tratamento DIFERENTE (aqui o CEP passa por `maskCep` e a UF é
            forçada para maiúsculas; lá em cima, não). Remover é decisão do
            cliente, então ficam; o defeito vai no relatório.
          */}
          <FormSecao legenda="Endereço (segunda entrada, já existente na tela)" colunas={2}>
            <CampoForm label="Endereço">
              <input
                className="input input-sm"
                value={novoParceiro.endereco}
                onChange={e => setNovoParceiro(prev => ({ ...prev, endereco: e.target.value }))}
              />
            </CampoForm>
            <CampoForm label="Número">
              <input
                className="input input-sm"
                value={novoParceiro.numero}
                onChange={e => setNovoParceiro(prev => ({ ...prev, numero: e.target.value }))}
              />
            </CampoForm>
            <CampoForm label="Bairro">
              <input
                className="input input-sm"
                value={novoParceiro.bairro}
                onChange={e => setNovoParceiro(prev => ({ ...prev, bairro: e.target.value }))}
              />
            </CampoForm>
            <CampoForm label="CEP">
              <input
                className="input input-sm"
                value={novoParceiro.cep}
                onChange={e => setNovoParceiro(prev => ({ ...prev, cep: maskCep(e.target.value) }))}
              />
            </CampoForm>
            <CampoForm label="Municipio">
              <input
                className="input input-sm"
                value={novoParceiro.municipio}
                onChange={e => setNovoParceiro(prev => ({ ...prev, municipio: e.target.value }))}
              />
            </CampoForm>
            <CampoForm label="Estado">
              <input
                className="input input-sm"
                maxLength={2}
                value={novoParceiro.estado}
                onChange={e => setNovoParceiro(prev => ({ ...prev, estado: e.target.value.toUpperCase() }))}
              />
            </CampoForm>
          </FormSecao>

          <div className="grid gap-2">
            <div className="text-sm font-medium">Categorias da pessoa</div>
            {categoriasParceiro.length === 0 ? (
              <div className="text-sm text-muted">Nenhuma categoria cadastrada.</div>
            ) : (
              <div className="grid max-h-48 gap-2 overflow-y-auto rounded-lg border border-[var(--c-border)] p-3 md:grid-cols-2">
                {categoriasParceiro.map((categoria) => (
                  <label key={categoria.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={novoParceiro.categoria_ids.includes(categoria.id)}
                      onChange={(event) => {
                        setNovoParceiro((prev) => {
                          const atual = new Set(prev.categoria_ids || []);
                          if (event.target.checked) {
                            atual.add(categoria.id);
                          } else {
                            atual.delete(categoria.id);
                          }
                          return { ...prev, categoria_ids: Array.from(atual) };
                        });
                      }}
                    />
                    <span>{categoria.nome}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div
          data-modal="rodape"
          className="app-actionbar border-t border-[var(--c-border)] p-4"
          style={{ background: 'var(--c-surface)' }}
        >
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={salvarNovoParceiro}
          >
            Salvar credor
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setModalParceiroAberto(false)}
          >
            Cancelar
          </button>
        </div>
      </OverlayModal>

      {/* Modal do termo aditivo (PI-15). Fica fora do <form> de proposito: o envio dele e proprio
          e nao pode disparar o submit da medicao. */}
      <ModalAditivoContrato
        aberto={modalAditivoAberto}
        contratoId={form.contrato_id ? Number(form.contrato_id) : null}
        areaResponsavel={form.area_responsavel}
        contratoRotulo={contratoSelecionado
          ? `${contratoSelecionado.codigo || ''} ${contratoSelecionado.ref_contrato || contratoSelecionado.descricao || ''}`.trim()
          : ''}
        onFechar={() => setModalAditivoAberto(false)}
        onSolicitado={(r) => {
          avisar.sucesso(`Termo aditivo de R$ ${Number(r?.aditivo?.valor || 0).toFixed(2)} solicitado — aguardando aprovacao.`);
        }}
      />

      <ModalConferenciaCredores
        aberto={modalCredoresAberto}
        parceiroIds={credoresParaConferir}
        criando={criandoSolicitacao}
        onFechar={() => setModalCredoresAberto(false)}
        onConfirmar={() => {
          setModalCredoresAberto(false);
          void handleSubmit(null, { confirmadoNaConferencia: true });
        }}
      />

      {/* R21 — modal de confirmação do sistema (limpar a solicitação, remover
          anexo, ciência antes de sair da tela). */}
      {elementoConfirmacao}
    </Pagina>
  );
}
