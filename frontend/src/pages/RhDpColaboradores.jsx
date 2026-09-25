import { useEffect, useRef, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HiOutlineEye, HiOutlinePencilSquare, HiOutlineTicket } from 'react-icons/hi2';
import {
  Avisos,
  BarraFiltros,
  BlocoConteudo,
  CampoForm,
  CelulaDupla,
  FormSecao,
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  TabelaPadrao,
  alternarValorFiltro,
  useAvisos,
  useConfirmacao,
  useFiltrosVisiveis
} from '../components/padrao';
import OverlayModal from '../components/ui/OverlayModal';
import { useAuth } from '../contexts/AuthContext';
import { getObras } from '../services/obras';
import {
  criarRhColaborador,
  atualizarRhColaborador,
  getRhColaborador,
  getRhColaboradores,
  getRhDossieArquivoLink,
  getRhDossieColaborador,
  getRhDocumentoLink,
  getRhDocumentos,
  getRhDocumentoTipos,
  getRhEmpresasGrupo,
  getRhCategoriasFinanceiras,
  getRhTicketStatus,
  gerarLoteRhTicket,
  importarRhColaboradores,
  substituirRhDocumento,
  uploadRhDocumento
} from '../services/rhDp';
import { getSetores } from '../services/setores';
import {
  canManageRhDpColaboradores,
  canManageRhDpDocumentos,
  canGenerateRhDpTicket
} from '../utils/acessoProduto';
import ParceiroBuscaRemota from '../components/solicitacoes/ParceiroBuscaRemota';
import CategoriaFinanceiraAutocomplete from '../components/ui/CategoriaFinanceiraAutocomplete';
import { formatCurrencyInput, getCpfCnpjError, maskCpfCnpj, maskPhone, normalizeCurrencyTyping, onlyDigits } from '../utils/formatters';
import DateInputBR from '../components/DateInputBR';

function emptyForm() {
  return {
    id: null,
    empresa_grupo_id: '',
    obra_id: '',
    setor_id: '',
    nome: '',
    cpf: '',
    matricula: '',
    rg: '',
    telefone: '',
    email: '',
    cargo: '',
    tipo_vinculo: 'CLT',
    data_inicio: '',
    data_admissao: '',
    data_demissao: '',
    data_nascimento: '',
    status: 'ATIVO',
    salario_base: '',
    valor_contratual: '',
    forma_calculo_gerencial: 'MENSAL',
    valor_diaria: '',
    valor_ticket: '',
    pagamento_automatico_40_60: false,
    observacoes: '',
    pagamento: {
      favorecido_nome: '',
      favorecido_documento: '',
      banco: '',
      agencia: '',
      conta: '',
      tipo_conta: '',
      chave_pix: '',
      chave_pix_secundaria: '',
      chave_pix_variavel: '',
      observacoes: ''
    }
  };
}

function formatCpf(value) {
  const digits = String(value || '').replace(/\D+/g, '');
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  return value || '-';
}

const FILTROS_MARCADOS_INICIAIS = {
  empresa_grupo_id: new Set(),
  obra_id: new Set(),
  tipo_vinculo: new Set(),
  status: new Set()
};

const FILTROS_DOCUMENTOS_INICIAIS = {
  tipo_documento_id: new Set(),
  status: new Set(),
  validade_status: new Set(),
  incluir_historico: new Set()
};

// R12: o recorte vira MARCAÇÃO. A API do RH/DP aceita UM valor por recorte
// (`empresa_grupo_id=1`), então cada dimensão é declarada `unico: true` na
// BarraFiltros — marca redonda, marcar outro substitui — e daqui sai o
// mesmo parâmetro de sempre: o valor marcado, ou `undefined` sem marca.
// Nenhum parâmetro novo, nenhum formato novo.
function valorUnico(conjunto) {
  return conjunto && conjunto.size === 1 ? conjunto.values().next().value : undefined;
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function vencimentoTicket(competencia) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(competencia || ''))) return '';
  const data = new Date(`${competencia}-10T12:00:00Z`);
  while ([0, 6].includes(data.getUTCDay())) data.setUTCDate(data.getUTCDate() - 1);
  return data.toISOString().slice(0, 10);
}

function validadeLabel(status) {
  switch (status) {
    case 'VENCIDO':
      return 'Vencido';
    case 'A_VENCER':
      return 'A vencer';
    case 'VALIDO':
      return 'Valido';
    default:
      return 'Sem validade';
  }
}

function toFormData(data) {
  return {
    id: data?.id || null,
    empresa_grupo_id: data?.empresa_grupo_id ? String(data.empresa_grupo_id) : '',
    obra_id: data?.obra_id ? String(data.obra_id) : '',
    setor_id: data?.setor_id ? String(data.setor_id) : '',
    nome: data?.nome || '',
    cpf: maskCpfCnpj(data?.cpf),
    matricula: data?.matricula || '',
    rg: data?.rg || '',
    telefone: maskPhone(data?.telefone),
    email: data?.email || '',
    cargo: data?.cargo || '',
    tipo_vinculo: data?.tipo_vinculo || 'CLT',
    data_inicio: data?.data_inicio || data?.data_admissao || '',
    data_admissao: data?.data_admissao || data?.data_inicio || '',
    data_demissao: data?.data_demissao || '',
    data_nascimento: data?.data_nascimento || '',
    status: data?.status || 'ATIVO',
    salario_base: formatCurrencyInput(data?.salario_base),
    valor_contratual: formatCurrencyInput(data?.valor_contratual),
    forma_calculo_gerencial: data?.forma_calculo_gerencial || 'MENSAL',
    valor_diaria: formatCurrencyInput(data?.valor_diaria),
    valor_ticket: formatCurrencyInput(data?.valor_ticket),
    pagamento_automatico_40_60: Boolean(data?.pagamento_automatico_40_60),
    observacoes: data?.observacoes || '',
    pagamento: {
      favorecido_nome: data?.pagamento?.favorecido_nome || '',
      favorecido_documento: maskCpfCnpj(data?.pagamento?.favorecido_documento),
      banco: data?.pagamento?.banco || '',
      agencia: data?.pagamento?.agencia || '',
      conta: data?.pagamento?.conta || '',
      tipo_conta: data?.pagamento?.tipo_conta || '',
      chave_pix: data?.pagamento?.chave_pix || '',
      chave_pix_secundaria: data?.pagamento?.chave_pix_secundaria || '',
      chave_pix_variavel: data?.pagamento?.chave_pix_variavel || '',
      observacoes: data?.pagamento?.observacoes || ''
    }
  };
}

function buildPayload(form) {
  return {
    empresa_grupo_id: Number(form.empresa_grupo_id),
    obra_id: form.obra_id ? Number(form.obra_id) : undefined,
    setor_id: form.setor_id ? Number(form.setor_id) : undefined,
    nome: form.nome,
    cpf: onlyDigits(form.cpf),
    matricula: form.matricula || undefined,
    rg: form.rg || undefined,
    telefone: onlyDigits(form.telefone) || undefined,
    email: form.email || undefined,
    cargo: form.cargo || undefined,
    tipo_vinculo: form.tipo_vinculo,
    data_inicio: form.data_admissao || undefined,
    data_admissao: form.data_admissao || undefined,
    data_demissao: form.data_demissao || undefined,
    data_nascimento: form.data_nascimento || undefined,
    status: form.status,
    salario_base: form.salario_base === '' ? undefined : form.salario_base,
    valor_contratual: form.valor_contratual === '' ? undefined : form.valor_contratual,
    forma_calculo_gerencial: form.forma_calculo_gerencial,
    valor_diaria: form.forma_calculo_gerencial === 'DIARIA' && form.valor_diaria !== ''
      ? form.valor_diaria
      : undefined,
    valor_ticket: form.valor_ticket === '' ? undefined : form.valor_ticket,
    pagamento_automatico_40_60: form.forma_calculo_gerencial === 'MENSAL'
      ? Boolean(form.pagamento_automatico_40_60)
      : false,
    observacoes: form.observacoes || undefined,
    pagamento: {
      favorecido_nome: form.pagamento.favorecido_nome || undefined,
      favorecido_documento: onlyDigits(form.pagamento.favorecido_documento) || undefined,
      banco: form.pagamento.banco || undefined,
      agencia: form.pagamento.agencia || undefined,
      conta: form.pagamento.conta || undefined,
      tipo_conta: form.pagamento.tipo_conta || undefined,
      chave_pix: form.pagamento.chave_pix || undefined,
      chave_pix_secundaria: form.pagamento.chave_pix_secundaria || undefined,
      chave_pix_variavel: form.pagamento.chave_pix_variavel || undefined,
      observacoes: form.pagamento.observacoes || undefined
    }
  };
}

function downloadModeloColaboradores() {
  const linhas = [
    [
      'Nome',
      'CPF',
      'Matricula',
      'Empresa_Codigo',
      'Obra_Codigo',
      'Setor_Codigo',
      'Cargo',
      'Tipo_Vinculo',
      'Data_Admissao',
      'Data_Demissao',
      'Status',
      'Salario_Base',
      'Valor_Contratual',
      'Forma_Calculo_Gerencial',
      'Valor_Diaria',
      'Pagamento_Automatico_40_60',
      'Valor_Ticket',
      'Banco',
      'Agencia',
      'Conta',
      'Tipo_Conta',
      'Favorecido_Nome',
      'Favorecido_Documento',
      'Chave_PIX',
      'Chave_PIX_Secundaria',
      'Chave_PIX_Variavel',
      'Telefone',
      'Email',
      'Observacoes'
    ],
    [
      'Colaborador Exemplo',
      '12345678909',
      'MAT-001',
      'EMP-01',
      'OBRA-01',
      'FIN',
      'Analista',
      'CLT',
      '2026-04-01',
      '',
      'ATIVO',
      '3500,00',
      '',
      'MENSAL',
      '',
      'SIM',
      '450,00',
      'Banco Exemplo',
      '1234',
      '98765-0',
      'CORRENTE',
      'Colaborador Exemplo',
      '12345678909',
      'colaborador@pix',
      '27999999999',
      '',
      '27999999999',
      'colaborador@empresa.com',
      'Importacao inicial RH/DP'
    ]
  ];

  const csv = linhas
    .map((colunas) => colunas.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');

  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'modelo-importacao-rh-colaboradores.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
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
  { id: 'busca', rotulo: 'Busca', obrigatorio: true },
  { id: 'empresa_grupo_id', rotulo: 'Empresa' },
  { id: 'obra_id', rotulo: 'Obra' },
  { id: 'tipo_vinculo', rotulo: 'Vínculo' },
  { id: 'status', rotulo: 'Status' }
];

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
const FILTROS_DOCUMENTOS_DA_TELA = [
  { id: 'busca_documentos', rotulo: 'Busca', obrigatorio: true },
  { id: 'tipo_documento_id', rotulo: 'Tipo' },
  { id: 'status', rotulo: 'Status' },
  { id: 'validade_status', rotulo: 'Validade' },
  { id: 'incluir_historico', rotulo: 'Histórico' }
];

export default function RhDpColaboradores() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const podeEditar = canManageRhDpColaboradores(user);
  const podeGerirDocumentos = canManageRhDpDocumentos(user);
  const podeGerarTicket = canGenerateRhDpTicket(user);
  // R3: aviso e confirmação do SISTEMA — nenhuma caixa do navegador.
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [colaboradores, setColaboradores] = useState([]);
  const ultimaConsultaColaboradoresRef = useRef(0);
  const [empresas, setEmpresas] = useState([]);
  const [obras, setObras] = useState([]);
  const [setores, setSetores] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [carregandoDocumentos, setCarregandoDocumentos] = useState(false);
  const [carregandoDossie, setCarregandoDossie] = useState(false);
  const [salvandoDocumento, setSalvandoDocumento] = useState(false);
  const [substituindoDocumentoId, setSubstituindoDocumentoId] = useState(null);
  const [selecionadosTicket, setSelecionadosTicket] = useState(new Set());
  const [statusTicket, setStatusTicket] = useState(new Map());
  const [modalTicketAberto, setModalTicketAberto] = useState(false);
  const [gerandoTicket, setGerandoTicket] = useState(false);
  const [categoriasTicket, setCategoriasTicket] = useState([]);
  const [ticketForm, setTicketForm] = useState(() => {
    const competencia = new Date().toISOString().slice(0, 7);
    return { competencia, parceiro: null, categoria_financeira_id: '', data_vencimento: vencimentoTicket(competencia), boleto: null, idempotency_key: crypto.randomUUID() };
  });
  const [form, setForm] = useState(emptyForm());
  // R1 da DoD: o cadastro abre em MODAL — antes o formulário nascia abaixo
  // de uma tabela de centenas de linhas e clicar em "editar" não parecia
  // fazer nada.
  const [formAberto, setFormAberto] = useState(false);
  const [tiposDocumento, setTiposDocumento] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [arquivosDossie, setArquivosDossie] = useState([]);
  const [resumoDocumentos, setResumoDocumentos] = useState(null);
  // ?q= da busca universal abre a lista já filtrada pelo nome/CPF.
  const [busca, setBusca] = useState(() => new URLSearchParams(window.location.search).get('q') || '');
  const [marcados, setMarcados] = useState(FILTROS_MARCADOS_INICIAIS);
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => (filtro.id === 'busca'
      ? busca.trim() !== ''
      : (marcados[filtro.id]?.size || 0) > 0)).map((filtro) => filtro.id),
    [busca, marcados]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:rh-dp-colaboradores:lista', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => setMarcados((atual) => ({ ...atual, [id]: new Set() }))
  });
  const [buscaDocumentos, setBuscaDocumentos] = useState('');
  const [marcadosDocumentos, setMarcadosDocumentos] = useState(FILTROS_DOCUMENTOS_INICIAIS);
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosDocumentosPreenchidos = useMemo(
    () => FILTROS_DOCUMENTOS_DA_TELA.filter((filtro) => (filtro.id === 'busca_documentos'
      ? buscaDocumentos.trim() !== ''
      : (marcadosDocumentos[filtro.id]?.size || 0) > 0)).map((filtro) => filtro.id),
    [buscaDocumentos, marcadosDocumentos]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltrosDocumentos = useFiltrosVisiveis('tabela:rh-dp-colaboradores:documentos', FILTROS_DOCUMENTOS_DA_TELA, {
    preenchidos: filtrosDocumentosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => setMarcadosDocumentos((atual) => ({ ...atual, [id]: new Set() }))
  });
  const [novoDocumento, setNovoDocumento] = useState({
    tipo_documento_id: '',
    validade: '',
    status: 'ENVIADO',
    observacoes: ''
  });
  const inputImportacaoRef = useRef(null);

  const filtroTipoDocumento = valorUnico(marcadosDocumentos.tipo_documento_id);
  const filtroStatusDocumento = valorUnico(marcadosDocumentos.status);
  const filtroValidadeDocumento = valorUnico(marcadosDocumentos.validade_status);
  const incluirHistoricoDocumentos = marcadosDocumentos.incluir_historico.has('sim');

  function syncColaboradorNaQuery(colaboradorId) {
    const next = new URLSearchParams(searchParams);
    if (colaboradorId) {
      next.set('colaborador_id', String(colaboradorId));
    } else {
      next.delete('colaborador_id');
    }
    setSearchParams(next);
  }

  useEffect(() => {
    carregarBase();
  }, []);

  // A marcação aplica sozinha (não existe mais "Aplicar filtros"); a busca
  // digitada espera 350ms para não martelar a API a cada tecla. Os
  // parâmetros enviados são exatamente os de antes.
  useEffect(() => {
    const atraso = setTimeout(() => { recarregarColaboradores(); }, 350);
    return () => clearTimeout(atraso);
  }, [busca, marcados]);

  useEffect(() => {
    if (!form.id) {
      setTiposDocumento([]);
      setDocumentos([]);
      setArquivosDossie([]);
      setResumoDocumentos(null);
      return;
    }

    carregarDocumentosColaborador(form.id).catch((error) => {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar documentos do colaborador');
    });
  }, [
    form.id,
    incluirHistoricoDocumentos,
    buscaDocumentos,
    filtroStatusDocumento,
    filtroTipoDocumento,
    filtroValidadeDocumento
  ]);

  useEffect(() => {
    if (!form.id) return;
    carregarDossieColaborador(form.id).catch((error) => {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar o dossie do colaborador');
    });
  }, [form.id]);

  async function carregarBase() {
    try {
      setCarregando(true);
      const [listaEmpresas, listaObras, listaSetores] = await Promise.all([
        getRhEmpresasGrupo({ ativo: true }),
        getObras(),
        getSetores()
      ]);

      setEmpresas(Array.isArray(listaEmpresas) ? listaEmpresas : []);
      setObras(Array.isArray(listaObras) ? listaObras : []);
      setSetores(Array.isArray(listaSetores) ? listaSetores : []);

      const colaboradorId = Number(searchParams.get('colaborador_id'));
      if (Number.isInteger(colaboradorId) && colaboradorId > 0) {
        await abrirColaborador(colaboradorId, { syncQuery: false });
      }
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar base RH/DP');
    } finally {
      setCarregando(false);
    }
  }

  async function carregarColaboradores(consultaId) {
    const data = await getRhColaboradores({
      q: busca || undefined,
      empresa_grupo_id: valorUnico(marcados.empresa_grupo_id),
      obra_id: valorUnico(marcados.obra_id),
      tipo_vinculo: valorUnico(marcados.tipo_vinculo),
      status: valorUnico(marcados.status)
    });
    if (consultaId !== ultimaConsultaColaboradoresRef.current) return;
    const lista = Array.isArray(data) ? data : [];
    setColaboradores(lista);
    const idsVisiveis = new Set(lista.map((item) => Number(item.id)));
    setSelecionadosTicket((atuais) => new Set([...atuais].filter((id) => idsVisiveis.has(Number(id)))));
    if (podeGerarTicket && lista.length) {
      const competencia = ticketForm.competencia;
      try {
        const status = await getRhTicketStatus(competencia, lista.map((item) => item.id));
        if (consultaId === ultimaConsultaColaboradoresRef.current) {
          setStatusTicket(new Map((status || []).map((item) => [Number(item.colaborador_id), item])));
        }
      } catch (error) {
        console.warn('Não foi possível carregar o status dos tickets.', error);
        if (consultaId === ultimaConsultaColaboradoresRef.current) setStatusTicket(new Map());
      }
    }
  }

  function alternarSelecionadoTicket(item) {
    if (item.status !== 'ATIVO' || !(Number(item.valor_ticket) > 0) || statusTicket.has(Number(item.id))) return;
    setSelecionadosTicket((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(Number(item.id))) proximo.delete(Number(item.id));
      else proximo.add(Number(item.id));
      return proximo;
    });
  }

  async function abrirModalTicket() {
    const itens = colaboradores.filter((item) => selecionadosTicket.has(Number(item.id)));
    if (!itens.length) {
      avisar.alerta('Selecione ao menos um colaborador com valor de ticket configurado.');
      return;
    }
    if (new Set(itens.map((item) => Number(item.empresa_grupo_id))).size > 1) {
      avisar.alerta('Selecione colaboradores da mesma empresa para gerar o boleto.');
      return;
    }
    try {
      const categorias = await getRhCategoriasFinanceiras();
      setCategoriasTicket(Array.isArray(categorias) ? categorias : []);
      setTicketForm((prev) => ({ ...prev, idempotency_key: crypto.randomUUID(), boleto: null }));
      setModalTicketAberto(true);
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao carregar categorias financeiras.');
    }
  }

  async function gerarTicket(event) {
    event.preventDefault();
    if (!ticketForm.parceiro || !ticketForm.categoria_financeira_id || !ticketForm.boleto) {
      avisar.erro('Informe fornecedor, categoria financeira e boleto.');
      return;
    }
    try {
      setGerandoTicket(true);
      const resultado = await gerarLoteRhTicket({
        competencia: ticketForm.competencia,
        parceiro_id: ticketForm.parceiro.id,
        categoria_financeira_id: ticketForm.categoria_financeira_id,
        data_vencimento: ticketForm.data_vencimento,
        colaborador_ids: [...selecionadosTicket],
        boleto: ticketForm.boleto,
        idempotency_key: ticketForm.idempotency_key
      });
      setModalTicketAberto(false);
      setSelecionadosTicket(new Set());
      await recarregarColaboradores();
      avisar.sucesso(`Lote criado na solicitação ${resultado?.solicitacao?.codigo || resultado?.solicitacao?.id}. O título ficará em previsão até a liberação do GEO.`);
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao gerar lote de ticket.');
    } finally {
      setGerandoTicket(false);
    }
  }

  async function recarregarColaboradores() {
    const consultaId = ultimaConsultaColaboradoresRef.current + 1;
    ultimaConsultaColaboradoresRef.current = consultaId;
    try {
      setCarregando(true);
      await carregarColaboradores(consultaId);
    } catch (error) {
      if (consultaId !== ultimaConsultaColaboradoresRef.current) return;
      console.error(error);
      avisar.erro(error?.message || 'Erro ao filtrar colaboradores');
    } finally {
      if (consultaId === ultimaConsultaColaboradoresRef.current) setCarregando(false);
    }
  }

  function limparFiltros() {
    setMarcados(FILTROS_MARCADOS_INICIAIS);
  }

  function limparFormulario() {
    setForm(emptyForm());
    setNovoDocumento({
      tipo_documento_id: '',
      validade: '',
      status: 'ENVIADO',
      observacoes: ''
    });
    setBuscaDocumentos('');
    setMarcadosDocumentos(FILTROS_DOCUMENTOS_INICIAIS);
    syncColaboradorNaQuery(null);
  }

  function abrirNovoColaborador() {
    limparFormulario();
    setFormAberto(true);
  }

  function fecharFormulario() {
    limparFormulario();
    setFormAberto(false);
  }

  async function abrirColaborador(id, { syncQuery = true } = {}) {
    try {
      const data = await getRhColaborador(id);
      setForm(toFormData(data));
      setFormAberto(true);
      if (syncQuery) {
        syncColaboradorNaQuery(id);
      }
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar colaborador');
    }
  }

  async function salvar(e) {
    e.preventDefault();
    if (!podeEditar) {
      return;
    }
    const cpfErro = getCpfCnpjError(form.cpf, { required: true, type: 'cpf' });
    if (cpfErro) {
      avisar.erro(cpfErro);
      return;
    }
    const favorecidoErro = getCpfCnpjError(form.pagamento?.favorecido_documento, {
      label: 'CPF do favorecido',
      type: 'cpf'
    });
    if (favorecidoErro) {
      avisar.erro(favorecidoErro);
      return;
    }

    try {
      setSalvando(true);
      const payload = buildPayload(form);
      let salvo;

      if (form.id) {
        salvo = await atualizarRhColaborador(form.id, payload);
      } else {
        salvo = await criarRhColaborador(payload);
      }

      setForm(toFormData(salvo));
      syncColaboradorNaQuery(salvo.id);
      await recarregarColaboradores();
      avisar.sucesso('Colaborador salvo.');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao salvar colaborador');
    } finally {
      setSalvando(false);
    }
  }

  async function onSelecionarArquivoImportacao(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const { ok } = await confirmar({
      titulo: 'Importar colaboradores em massa',
      mensagem: `Importar colaboradores em massa usando o arquivo "${file.name}"?`,
      rotuloConfirmar: 'Importar'
    });
    if (!ok) {
      return;
    }

    try {
      setImportando(true);
      const resultado = await importarRhColaboradores(file);
      await recarregarColaboradores();

      const importados = Number(resultado?.importados || 0);
      const ignorados = Number(resultado?.ignorados || 0);
      const erros = Array.isArray(resultado?.erros) ? resultado.erros : [];
      if (erros.length > 0) {
        const resumo = erros.slice(0, 5).map((item) => `Linha ${item.linha}: ${item.error}`).join(' · ');
        avisar.alerta(
          `Importados: ${importados}. Ignorados: ${ignorados}. Erros: ${erros.length}. ${resumo}${erros.length > 5 ? ' …' : ''}`,
          'Importacao concluida com erros'
        );
      } else {
        avisar.sucesso(`Importacao concluida. Importados: ${importados}. Ignorados: ${ignorados}.`);
      }
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao importar colaboradores RH/DP');
    } finally {
      setImportando(false);
    }
  }

  async function carregarDocumentosColaborador(colaboradorId) {
    try {
      setCarregandoDocumentos(true);
      const [listaTipos, respostaDocumentos] = await Promise.all([
        getRhDocumentoTipos({
          colaborador_id: colaboradorId,
          ativo: true
        }),
        getRhDocumentos({
          colaborador_id: colaboradorId,
          q: buscaDocumentos || undefined,
          tipo_documento_id: filtroTipoDocumento,
          status: filtroStatusDocumento,
          validade_status: filtroValidadeDocumento,
          incluir_historico: incluirHistoricoDocumentos ? true : undefined,
          limit: 50
        })
      ]);

      setTiposDocumento(Array.isArray(listaTipos) ? listaTipos : []);
      setDocumentos(Array.isArray(respostaDocumentos?.data) ? respostaDocumentos.data : []);
      setResumoDocumentos(respostaDocumentos?.meta?.resumo_colaborador || null);
    } finally {
      setCarregandoDocumentos(false);
    }
  }

  async function carregarDossieColaborador(colaboradorId) {
    try {
      setCarregandoDossie(true);
      const resposta = await getRhDossieColaborador(colaboradorId);
      setArquivosDossie(Array.isArray(resposta?.itens) ? resposta.itens : []);
    } finally {
      setCarregandoDossie(false);
    }
  }

  async function abrirDocumento(id) {
    try {
      const url = await getRhDocumentoLink(id);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao abrir documento RH/DP');
    }
  }

  async function abrirArquivoDossie(item) {
    try {
      const url = await getRhDossieArquivoLink(form.id, item);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao abrir arquivo do dossie');
    }
  }

  async function onSelecionarNovoDocumento(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !form.id) {
      return;
    }

    if (!novoDocumento.tipo_documento_id) {
      avisar.alerta('Selecione o tipo de documento antes de enviar o arquivo.');
      return;
    }

    try {
      setSalvandoDocumento(true);
      await uploadRhDocumento({
        colaborador_id: form.id,
        tipo_documento_id: novoDocumento.tipo_documento_id,
        validade: novoDocumento.validade || undefined,
        status: novoDocumento.status || undefined,
        observacoes: novoDocumento.observacoes || undefined,
        file
      });

      setNovoDocumento({
        tipo_documento_id: '',
        validade: '',
        status: 'ENVIADO',
        observacoes: ''
      });

      await carregarDocumentosColaborador(form.id);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao enviar documento RH/DP');
    } finally {
      setSalvandoDocumento(false);
    }
  }

  async function onSelecionarSubstituicao(documento, event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !form.id) {
      return;
    }

    const { ok } = await confirmar({
      titulo: 'Substituir documento',
      mensagem: `Substituir o documento "${documento.nome_original}"? A versao atual passa para o historico.`,
      rotuloConfirmar: 'Substituir',
      destrutiva: true
    });
    if (!ok) {
      return;
    }

    try {
      setSubstituindoDocumentoId(documento.id);
      await substituirRhDocumento(documento.id, {
        tipo_documento_id: documento.documento_tipo_id,
        validade: documento.validade || undefined,
        status: documento.status === 'REJEITADO' ? 'ENVIADO' : documento.status,
        observacoes: documento.observacoes || undefined,
        file
      });
      await carregarDocumentosColaborador(form.id);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao substituir documento RH/DP');
    } finally {
      setSubstituindoDocumentoId(null);
    }
  }

  // R16: UM dono para a faixa de avisos. Com o modal aberto ela vive dentro
  // dele (senão o aviso de erro do salvar ficaria atrás do fundo escuro);
  // com o modal fechado, logo abaixo do PageHeader.
  const faixaAvisos = <Avisos avisos={avisos} aoFechar={fechar} />;

  return (
    <Pagina className="rhdp-page rh-colaboradores-page">
      <PageHeader
        titulo="Colaboradores"
        contagem={carregando ? null : `${colaboradores.length} colaborador(es)`}
        descricao="Base cadastral com empresa do grupo, obra, vínculo, dados pessoais e dados de pagamento."
        acaoPrincipal={podeEditar ? { rotulo: 'Novo colaborador', onClick: abrirNovoColaborador } : undefined}
        /* Saíram do "⋯" (removido do sistema em 07/09) e viraram botões
           visíveis: três na faixa, uma linha só a 1920 e a 1366. */
        secundarias={[
          ...(podeGerarTicket ? [{
            rotulo: `Gerar lote de ticket${selecionadosTicket.size ? ` (${selecionadosTicket.size})` : ''}`,
            onClick: abrirModalTicket,
            desabilitada: !selecionadosTicket.size,
            icone: <HiOutlineTicket aria-hidden="true" />
          }] : []),
          ...(podeEditar ? [
            { rotulo: 'Baixar modelo', onClick: downloadModeloColaboradores },
            {
              rotulo: importando ? 'Importando massa...' : 'Importar massa',
              onClick: () => inputImportacaoRef.current?.click(),
              desabilitada: importando
            }
          ] : [])
        ]}
      />

      {!formAberto && faixaAvisos}

      {podeEditar && (
        <input
          ref={inputImportacaoRef}
          type="file"
          accept=".csv,.xls,.xlsx"
          className="hidden"
          onChange={onSelecionarArquivoImportacao}
          disabled={importando}
        />
      )}

      <BlocoConteudo
        titulo="Colaboradores cadastrados"
        variante="primario"
        cor="var(--c-primary)"
      >
        {/* F1/R12: uma busca larga em cima e os recortes por marcação, com
            etiqueta removível — o filtro aplica ao marcar, sem "Aplicar". */}
        <BarraFiltros
          busca={visibilidadeFiltros.ehVisivel('busca') ? {
            valor: busca,
            aoMudar: setBusca,
            placeholder: 'Buscar por nome, CPF ou matrícula'
          } : null}
          filtros={[
            {
              id: 'empresa_grupo_id',
              rotulo: 'Empresa',
              unico: true,
              opcoes: empresas.map((item) => ({ valor: String(item.id), rotulo: item.nome }))
            },
            {
              id: 'obra_id',
              rotulo: 'Obra',
              unico: true,
              opcoes: obras.map((item) => ({
                valor: String(item.id),
                rotulo: item.codigo ? `${item.codigo} - ${item.nome}` : item.nome
              }))
            },
            {
              id: 'tipo_vinculo',
              rotulo: 'Vínculo',
              unico: true,
              opcoes: [
                { valor: 'CLT', rotulo: 'CLT' },
                { valor: 'NAO_CLT', rotulo: 'Não CLT' }
              ]
            },
            {
              id: 'status',
              rotulo: 'Status',
              unico: true,
              opcoes: [
                { valor: 'ATIVO', rotulo: 'Ativo' },
                { valor: 'INATIVO', rotulo: 'Inativo' },
                { valor: 'AFASTADO', rotulo: 'Afastado' }
              ]
            }
          ].filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={marcados}
          aoAlternar={(dimensao, valor, opcoes) => setMarcados((atual) => alternarValorFiltro(atual, dimensao, valor, opcoes))}
          aoLimpar={limparFiltros}
          visibilidade={visibilidadeFiltros}
        />

        <TabelaPadrao
          colunas={[
            ...(podeGerarTicket ? [{
              id: 'selecionar_ticket',
              titulo: 'Ticket',
              tipo: 'booleano',
              render: (item) => {
                const atual = statusTicket.get(Number(item.id));
                const habilitado = item.status === 'ATIVO' && Number(item.valor_ticket) > 0 && !atual;
                return (
                  <label className="flex items-center gap-2" title={atual ? `Ticket ${atual.status.toLowerCase()}` : 'Selecionar para o lote de ticket'}>
                    <input
                      type="checkbox"
                      checked={selecionadosTicket.has(Number(item.id))}
                      disabled={!habilitado}
                      onChange={() => alternarSelecionadoTicket(item)}
                      aria-label={`Selecionar ticket de ${item.nome}`}
                    />
                    <span className="text-xs leading-tight">
                      <strong className="block">{Number(item.valor_ticket) > 0 ? formatCurrencyInput(item.valor_ticket) : 'Sem valor'}</strong>
                      <span className="app-note">{atual?.status?.replaceAll('_', ' ') || 'Não solicitado'}</span>
                    </span>
                  </label>
                );
              }
            }] : []),
            {
              id: 'nome',
              titulo: 'Nome',
              // R17: o NOME do colaborador é o que identifica o registro.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (item) => (
                <CelulaDupla principal={item.nome} sub={item.cargo || item.matricula || '-'} />
              )
            },
            {
              id: 'matricula',
              titulo: 'Matrícula',
              tipo: 'codigo',
              render: (item) => item.matricula || '-'
            },
            {
              id: 'cpf',
              titulo: 'CPF',
              tipo: 'codigo',
              render: (item) => formatCpf(item.cpf)
            },
            {
              id: 'empresa',
              titulo: 'Empresa',
              tipo: 'texto',
              render: (item) => item.empresaGrupo?.nome || '-'
            },
            {
              id: 'obra',
              titulo: 'Obra',
              tipo: 'texto',
              render: (item) => item.obra?.nome || '-'
            },
            {
              id: 'vinculo',
              titulo: 'Vínculo',
              tipo: 'badge',
              render: (item) => (item.tipo_vinculo === 'NAO_CLT' ? 'Nao CLT' : item.tipo_vinculo)
            },
            {
              id: 'status',
              titulo: 'Status',
              tipo: 'status',
              render: (item) => item.status
            }
          ]}
          itens={colaboradores}
          storageKey="tabela:rh-dp-colaboradores:lista"
          rotuloRolagem="Colaboradores"
          carregando={carregando}
          vazio="Nenhum colaborador cadastrado"
          acoesLinha={(item) => (
            <button
              type="button"
              className="app-dense-icon-action"
              onClick={() => abrirColaborador(item.id)}
              title={podeEditar ? 'Editar colaborador' : 'Ver colaborador'}
              aria-label={podeEditar ? `Editar colaborador ${item.nome}` : `Ver colaborador ${item.nome}`}
            >
              {podeEditar ? <HiOutlinePencilSquare aria-hidden="true" /> : <HiOutlineEye aria-hidden="true" />}
            </button>
          )}
          larguraAcoes={96}
        />
      </BlocoConteudo>

      {modalTicketAberto && (
        <OverlayModal
          aberto
          largura="min(760px, calc(100vw - 32px))"
          rotulo="Gerar lote de ticket"
          onFechar={() => !gerandoTicket && setModalTicketAberto(false)}
        >
          <form className="space-y-4 p-4" onSubmit={gerarTicket}>
            <div>
              <h2 className="text-lg font-semibold">Gerar lote de ticket</h2>
              <p className="app-bloco-lead">
                {selecionadosTicket.size} colaborador(es). O custo será rateado pela obra atual e o título ficará em previsão até o GEO liberar a solicitação.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <CampoForm label="Competência" obrigatorio>
                <input
                  className="form-control"
                  type="month"
                  value={ticketForm.competencia}
                  onChange={(e) => {
                    const competencia = e.target.value;
                    setTicketForm((prev) => ({ ...prev, competencia, data_vencimento: vencimentoTicket(competencia) }));
                  }}
                  required
                />
              </CampoForm>
              <CampoForm label="Vencimento" obrigatorio>
                <DateInputBR
                  className="form-control"
                  value={ticketForm.data_vencimento}
                  onChange={(e) => setTicketForm((prev) => ({ ...prev, data_vencimento: e.target.value }))}
                />
                <span className="app-note">Dia 10, antecipado automaticamente no fim de semana. Ajuste aqui quando houver feriado informado.</span>
              </CampoForm>
              <ParceiroBuscaRemota
                label="Fornecedor do ticket"
                selecionado={ticketForm.parceiro}
                onSelecionar={(parceiro) => setTicketForm((prev) => ({ ...prev, parceiro }))}
                somenteFornecedor
                obrigatorio
              />
              <CategoriaFinanceiraAutocomplete
                value={ticketForm.categoria_financeira_id}
                options={categoriasTicket}
                onChange={(categoria_financeira_id) => setTicketForm((prev) => ({ ...prev, categoria_financeira_id }))}
              />
              <CampoForm label="Boleto" obrigatorio>
                <input
                  className="form-control"
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => setTicketForm((prev) => ({ ...prev, boleto: e.target.files?.[0] || null }))}
                  required
                />
              </CampoForm>
              <div className="rounded-lg border p-3" style={{ borderColor: 'var(--c-border)' }}>
                <span className="app-note block">Valor total calculado</span>
                <strong>
                  {formatCurrencyInput(String(colaboradores
                    .filter((item) => selecionadosTicket.has(Number(item.id)))
                    .reduce((soma, item) => soma + Number(item.valor_ticket || 0), 0)))}
                </strong>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t pt-3" style={{ borderColor: 'var(--c-border)' }}>
              <button type="button" className="btn btn-outline" disabled={gerandoTicket} onClick={() => setModalTicketAberto(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={gerandoTicket}>{gerandoTicket ? 'Gerando...' : 'Gerar solicitação e título'}</button>
            </div>
          </form>
        </OverlayModal>
      )}

      {/* R1 da DoD / R9: cadastro abre em MODAL. Mesmos campos, mesma
          validação, mesmo salvar, mesmo limpar — só a moldura mudou. */}
      {formAberto && (
        <OverlayModal
          aberto
          largura="var(--modal-max-w-xl, 1120px)"
          rotulo={form.id ? 'Detalhe do colaborador' : 'Novo colaborador'}
          onFechar={fecharFormulario}
        >
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--ui-border)' }}>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--c-text)' }}>
                {form.id ? 'Detalhe do colaborador' : 'Novo colaborador'}
              </h2>
              <p className="app-note">
                Cadastro base do RH/DP com dados operacionais e forma de pagamento.
              </p>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={fecharFormulario}>
              Fechar
            </button>
          </div>

          <div className="overflow-y-auto px-4 py-3">
            {faixaAvisos}

            <form id="rh-colaborador-form" className="space-y-4" onSubmit={salvar}>
              <FormSecao legenda="Dados do colaborador" colunas={3}>
                <CampoForm label="Empresa do grupo" obrigatorio>
                  <select
                    className="form-control"
                    value={form.empresa_grupo_id}
                    onChange={(e) => setForm((prev) => ({ ...prev, empresa_grupo_id: e.target.value }))}
                    disabled={!podeEditar}
                    required
                  >
                    <option value="">Selecione</option>
                    {empresas.map((item) => (
                      <option key={item.id} value={item.id}>{item.nome}</option>
                    ))}
                  </select>
                </CampoForm>
                <CampoForm label="Obra principal">
                  <select
                    className="form-control"
                    value={form.obra_id}
                    onChange={(e) => setForm((prev) => ({ ...prev, obra_id: e.target.value }))}
                    disabled={!podeEditar}
                  >
                    <option value="">Não vinculada</option>
                    {obras.map((item) => (
                      <option key={item.id} value={item.id}>{item.codigo ? `${item.codigo} - ${item.nome}` : item.nome}</option>
                    ))}
                  </select>
                </CampoForm>

                <CampoForm label="Nome" obrigatorio>
                  <input
                    className="form-control"
                    value={form.nome}
                    onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
                    disabled={!podeEditar}
                    required
                  />
                </CampoForm>
                <CampoForm label="CPF" obrigatorio>
                  <input
                    className="form-control"
                    value={form.cpf}
                    onChange={(e) => setForm((prev) => ({ ...prev, cpf: maskCpfCnpj(e.target.value) }))}
                    disabled={!podeEditar}
                    required
                  />
                </CampoForm>

                <CampoForm label="Matrícula">
                  <input
                    className="form-control"
                    value={form.matricula}
                    onChange={(e) => setForm((prev) => ({ ...prev, matricula: e.target.value }))}
                    disabled={!podeEditar}
                  />
                </CampoForm>
                <CampoForm label="Setor">
                  <select
                    className="form-control"
                    value={form.setor_id}
                    onChange={(e) => setForm((prev) => ({ ...prev, setor_id: e.target.value }))}
                    disabled={!podeEditar}
                  >
                    <option value="">Não vinculado</option>
                    {setores.map((item) => (
                      <option key={item.id} value={item.id}>{item.codigo ? `${item.codigo} - ${item.nome}` : item.nome}</option>
                    ))}
                  </select>
                </CampoForm>

                <CampoForm label="Cargo">
                  <input
                    className="form-control"
                    value={form.cargo}
                    onChange={(e) => setForm((prev) => ({ ...prev, cargo: e.target.value }))}
                    disabled={!podeEditar}
                  />
                </CampoForm>
                <CampoForm label="Tipo de vínculo">
                  <select
                    className="form-control"
                    value={form.tipo_vinculo}
                    onChange={(e) => setForm((prev) => ({ ...prev, tipo_vinculo: e.target.value }))}
                    disabled={!podeEditar}
                  >
                    <option value="CLT">CLT</option>
                    <option value="NAO_CLT">Não CLT</option>
                  </select>
                </CampoForm>

                <CampoForm label="Status">
                  <select
                    className="form-control"
                    value={form.status}
                    onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                    disabled={!podeEditar}
                  >
                    <option value="ATIVO">Ativo</option>
                    <option value="INATIVO">Inativo</option>
                    <option value="AFASTADO">Afastado</option>
                  </select>
                </CampoForm>
                <CampoForm label="RG">
                  <input
                    className="form-control"
                    value={form.rg}
                    onChange={(e) => setForm((prev) => ({ ...prev, rg: e.target.value }))}
                    disabled={!podeEditar}
                  />
                </CampoForm>
              </FormSecao>

              <FormSecao colunas={3}>
                <CampoForm label="Data de admissão">
                  <DateInputBR
                    className="form-control"
                    value={form.data_admissao}
                    onChange={(e) => setForm((prev) => ({ ...prev, data_admissao: e.target.value, data_inicio: e.target.value }))}
                    disabled={!podeEditar}
                  />
                </CampoForm>
                <CampoForm label="Data de demissão">
                  <DateInputBR
                    className="form-control"
                    value={form.data_demissao}
                    onChange={(e) => setForm((prev) => ({ ...prev, data_demissao: e.target.value }))}
                    disabled={!podeEditar}
                  />
                </CampoForm>
                <CampoForm label="Data de nascimento">
                  <DateInputBR
                    className="form-control"
                    value={form.data_nascimento}
                    onChange={(e) => setForm((prev) => ({ ...prev, data_nascimento: e.target.value }))}
                    disabled={!podeEditar}
                  />
                </CampoForm>
              </FormSecao>

              <FormSecao legenda="Contato, contrato e calculo gerencial" colunas={2}>
                <CampoForm label="Telefone">
                  <input
                    className="form-control"
                    value={form.telefone}
                    onChange={(e) => setForm((prev) => ({ ...prev, telefone: maskPhone(e.target.value) }))}
                    disabled={!podeEditar}
                  />
                </CampoForm>
                <CampoForm label="Email">
                  <input
                    type="email"
                    className="form-control"
                    value={form.email}
                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                    disabled={!podeEditar}
                  />
                </CampoForm>

                <CampoForm label="Salário base">
                  <input
                    className="form-control"
                    inputMode="decimal"
                    value={form.salario_base}
                    onChange={(e) => setForm((prev) => ({ ...prev, salario_base: normalizeCurrencyTyping(e.target.value) }))}
                    onBlur={(e) => setForm((prev) => ({ ...prev, salario_base: formatCurrencyInput(e.target.value) }))}
                    disabled={!podeEditar}
                  />
                </CampoForm>
                <CampoForm label="Valor contratual">
                  <input
                    className="form-control"
                    inputMode="decimal"
                    value={form.valor_contratual}
                    onChange={(e) => setForm((prev) => ({ ...prev, valor_contratual: normalizeCurrencyTyping(e.target.value) }))}
                    onBlur={(e) => setForm((prev) => ({ ...prev, valor_contratual: formatCurrencyInput(e.target.value) }))}
                    disabled={!podeEditar}
                  />
                </CampoForm>
                <CampoForm label="Forma de calculo">
                  <select
                    className="form-control"
                    value={form.forma_calculo_gerencial}
                    onChange={(e) => setForm((prev) => ({
                      ...prev,
                      forma_calculo_gerencial: e.target.value,
                      pagamento_automatico_40_60: e.target.value === 'DIARIA'
                        ? false
                        : prev.pagamento_automatico_40_60
                    }))}
                    disabled={!podeEditar}
                  >
                    <option value="MENSAL">Mensal</option>
                    <option value="DIARIA">Por diaria</option>
                  </select>
                </CampoForm>
                {form.forma_calculo_gerencial === 'DIARIA' ? (
                  <CampoForm label="Valor da diaria" obrigatorio>
                    <input
                      className="form-control"
                      inputMode="decimal"
                      value={form.valor_diaria}
                      onChange={(e) => setForm((prev) => ({ ...prev, valor_diaria: normalizeCurrencyTyping(e.target.value) }))}
                      onBlur={(e) => setForm((prev) => ({ ...prev, valor_diaria: formatCurrencyInput(e.target.value) }))}
                      disabled={!podeEditar}
                      required
                    />
                  </CampoForm>
                ) : (
                  <CampoForm label="Parcelamento mensal">
                    <label className="flex items-center gap-2 min-h-10">
                      <input
                        type="checkbox"
                        checked={form.pagamento_automatico_40_60}
                        onChange={(e) => setForm((prev) => ({ ...prev, pagamento_automatico_40_60: e.target.checked }))}
                        disabled={!podeEditar}
                      />
                      40% no dia 15 e 60% no fim do mes
                    </label>
                  </CampoForm>
                )}
                <CampoForm label="Valor mensal do ticket">
                  <input
                    className="form-control"
                    inputMode="decimal"
                    value={form.valor_ticket}
                    onChange={(e) => setForm((prev) => ({ ...prev, valor_ticket: normalizeCurrencyTyping(e.target.value) }))}
                    onBlur={(e) => setForm((prev) => ({ ...prev, valor_ticket: formatCurrencyInput(e.target.value) }))}
                    disabled={!podeEditar}
                    placeholder="R$ 0,00"
                  />
                </CampoForm>
              </FormSecao>

              <FormSecao legenda="Dados de pagamento" colunas={2}>
                <CampoForm label="Favorecido">
                  <input
                    className="form-control"
                    value={form.pagamento.favorecido_nome}
                    onChange={(e) => setForm((prev) => ({ ...prev, pagamento: { ...prev.pagamento, favorecido_nome: e.target.value } }))}
                    disabled={!podeEditar}
                  />
                </CampoForm>
                <CampoForm label="CPF do favorecido">
                  <input
                    className="form-control"
                    value={form.pagamento.favorecido_documento}
                    onChange={(e) => setForm((prev) => ({ ...prev, pagamento: { ...prev.pagamento, favorecido_documento: maskCpfCnpj(e.target.value) } }))}
                    disabled={!podeEditar}
                  />
                </CampoForm>

                <CampoForm label="Banco">
                  <input
                    className="form-control"
                    value={form.pagamento.banco}
                    onChange={(e) => setForm((prev) => ({ ...prev, pagamento: { ...prev.pagamento, banco: e.target.value } }))}
                    disabled={!podeEditar}
                  />
                </CampoForm>
                <CampoForm label="Agência">
                  <input
                    className="form-control"
                    value={form.pagamento.agencia}
                    onChange={(e) => setForm((prev) => ({ ...prev, pagamento: { ...prev.pagamento, agencia: e.target.value } }))}
                    disabled={!podeEditar}
                  />
                </CampoForm>

                <CampoForm label="Conta">
                  <input
                    className="form-control"
                    value={form.pagamento.conta}
                    onChange={(e) => setForm((prev) => ({ ...prev, pagamento: { ...prev.pagamento, conta: e.target.value } }))}
                    disabled={!podeEditar}
                  />
                </CampoForm>
                <CampoForm label="Tipo de conta">
                  <select
                    className="form-control"
                    value={form.pagamento.tipo_conta}
                    onChange={(e) => setForm((prev) => ({ ...prev, pagamento: { ...prev.pagamento, tipo_conta: e.target.value } }))}
                    disabled={!podeEditar}
                  >
                    <option value="">Selecione</option>
                    <option value="CORRENTE">Conta corrente</option>
                    <option value="POUPANCA">Conta poupanca</option>
                    <option value="SALARIO">Conta salario</option>
                  </select>
                </CampoForm>

                <div className="form-grid form-grid--3 form-campo--linha">
                  <CampoForm label="Chave PIX principal">
                    <input
                      className="form-control"
                      value={form.pagamento.chave_pix}
                      onChange={(e) => setForm((prev) => ({ ...prev, pagamento: { ...prev.pagamento, chave_pix: e.target.value } }))}
                      disabled={!podeEditar}
                    />
                  </CampoForm>
                  <CampoForm label="Chave PIX fixa 2">
                    <input
                      className="form-control"
                      value={form.pagamento.chave_pix_secundaria}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, pagamento: { ...prev.pagamento, chave_pix_secundaria: e.target.value } }))
                      }
                      disabled={!podeEditar}
                    />
                  </CampoForm>
                  <CampoForm label="Chave PIX variável">
                    <input
                      className="form-control"
                      value={form.pagamento.chave_pix_variavel}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, pagamento: { ...prev.pagamento, chave_pix_variavel: e.target.value } }))
                      }
                      disabled={!podeEditar}
                    />
                  </CampoForm>
                </div>

                <p className="app-note form-campo--linha">
                  A chave principal e usada por padrão nos títulos RH/DP. Na conferência da apuração e possível trocar para uma das chaves cadastradas.
                </p>
              </FormSecao>

              <FormSecao colunas={2}>
                <CampoForm label="Observações" tipo="observacao">
                  <textarea
                    className="form-control"
                    rows={4}
                    value={form.observacoes}
                    onChange={(e) => setForm((prev) => ({ ...prev, observacoes: e.target.value }))}
                    disabled={!podeEditar}
                  />
                </CampoForm>
              </FormSecao>

              {!form.id && podeGerirDocumentos && (
                <p className="app-note">
                  Salve o colaborador primeiro para liberar o envio e a gestão dos documentos anexados.
                </p>
              )}

              {form.id && (
                <BlocoConteudo
                  titulo="Documentos do colaborador"
                  descricao="Pasta digital do colaborador com checklist por vínculo, validade e histórico de substituição."
                  variante="secundario"
                  acoes={(
                    <Link to={`/rh-dp/documentos?q=${encodeURIComponent(form.nome || '')}`} className="btn btn-outline btn-sm">
                      Painel geral de documentos
                    </Link>
                  )}
                >
                  <StatGrid colunas={4}>
                    <StatTile label="Anexados" valor={resumoDocumentos?.total_documentos_anexados || 0} />
                    <StatTile label="Válidos" valor={resumoDocumentos?.documentos_validos || 0} tom="success" />
                    <StatTile label="Vencidos" valor={resumoDocumentos?.documentos_vencidos || 0} tom="danger" />
                    <StatTile label="Obrigatórios pendentes" valor={resumoDocumentos?.obrigatorios_pendentes || 0} tom="warning" />
                  </StatGrid>

                  <BarraFiltros
                    busca={visibilidadeFiltrosDocumentos.ehVisivel('busca_documentos') ? {
                      valor: buscaDocumentos,
                      aoMudar: setBuscaDocumentos,
                      placeholder: 'Buscar por arquivo ou observação'
                    } : null}
                    filtros={[
                      {
                        id: 'tipo_documento_id',
                        rotulo: 'Tipo',
                        unico: true,
                        opcoes: tiposDocumento.map((item) => ({ valor: String(item.id), rotulo: item.nome }))
                      },
                      {
                        id: 'status',
                        rotulo: 'Status',
                        unico: true,
                        opcoes: [
                          { valor: 'ENVIADO', rotulo: 'Enviado' },
                          { valor: 'CONFERIDO', rotulo: 'Conferido' },
                          { valor: 'REJEITADO', rotulo: 'Rejeitado' },
                          { valor: 'SUBSTITUIDO', rotulo: 'Substituído' }
                        ]
                      },
                      {
                        id: 'validade_status',
                        rotulo: 'Validade',
                        unico: true,
                        opcoes: [
                          { valor: 'VALIDO', rotulo: 'Valido' },
                          { valor: 'A_VENCER', rotulo: 'A vencer' },
                          { valor: 'VENCIDO', rotulo: 'Vencido' },
                          { valor: 'SEM_VALIDADE', rotulo: 'Sem validade' }
                        ]
                      },
                      {
                        id: 'incluir_historico',
                        rotulo: 'Histórico',
                        opcoes: [{ valor: 'sim', rotulo: 'Incluir histórico' }]
                      }
                    ].filter((dim) => visibilidadeFiltrosDocumentos.ehVisivel(dim.id))}
                    ativos={marcadosDocumentos}
                    aoAlternar={(dimensao, valor, opcoes) => setMarcadosDocumentos((atual) => alternarValorFiltro(atual, dimensao, valor, opcoes))}
                    aoLimpar={() => setMarcadosDocumentos(FILTROS_DOCUMENTOS_INICIAIS)}
                    visibilidade={visibilidadeFiltrosDocumentos}
                  />

                  {podeGerirDocumentos && (
                    <FormSecao legenda="Enviar novo documento" colunas={4}>
                      <CampoForm label="Tipo de documento">
                        <select
                          className="form-control"
                          value={novoDocumento.tipo_documento_id}
                          onChange={(e) => setNovoDocumento((prev) => ({ ...prev, tipo_documento_id: e.target.value }))}
                        >
                          <option value="">Tipo de documento</option>
                          {tiposDocumento.map((item) => (
                            <option key={item.id} value={item.id}>{item.nome}</option>
                          ))}
                        </select>
                      </CampoForm>
                      <CampoForm label="Validade">
                        <DateInputBR
                          className="form-control"
                          value={novoDocumento.validade}
                          onChange={(e) => setNovoDocumento((prev) => ({ ...prev, validade: e.target.value }))}
                        />
                      </CampoForm>
                      <CampoForm label="Situação do documento">
                        <select
                          className="form-control"
                          value={novoDocumento.status}
                          onChange={(e) => setNovoDocumento((prev) => ({ ...prev, status: e.target.value }))}
                        >
                          <option value="ENVIADO">Enviado</option>
                          <option value="CONFERIDO">Conferido</option>
                          <option value="REJEITADO">Rejeitado</option>
                        </select>
                      </CampoForm>
                      {/* Não é CampoForm: o gatilho de arquivo JÁ é um
                          <label>, e label dentro de label não é HTML válido. */}
                      <div className="form-group">
                        <span className="form-label">Arquivo</span>
                        <label className={`btn btn-outline cursor-pointer ${salvandoDocumento ? 'opacity-60 pointer-events-none' : ''}`}>
                          {salvandoDocumento ? 'Enviando...' : 'Anexar arquivo'}
                          <input
                            type="file"
                            className="hidden"
                            onChange={onSelecionarNovoDocumento}
                            disabled={salvandoDocumento}
                          />
                        </label>
                      </div>
                      <CampoForm label="Observações do documento" tipo="observacao">
                        <textarea
                          className="form-control"
                          rows={3}
                          placeholder="Observações do documento"
                          value={novoDocumento.observacoes}
                          onChange={(e) => setNovoDocumento((prev) => ({ ...prev, observacoes: e.target.value }))}
                        />
                      </CampoForm>
                      <p className="app-note form-campo--linha">
                        Selecione o tipo e depois clique em <strong>Anexar arquivo</strong> para enviar o documento deste colaborador.
                      </p>
                    </FormSecao>
                  )}

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="space-y-3">
                      <h3 className="form-section-legenda">Arquivos do colaborador</h3>
                      <TabelaPadrao
                        colunas={[
                          {
                            id: 'tipo',
                            titulo: 'Tipo',
                            tipo: 'texto',
                            render: (item) => item.tipoDocumento?.nome || '-'
                          },
                          {
                            id: 'arquivo',
                            titulo: 'Arquivo',
                            // R17: o ARQUIVO é o que nomeia o documento na pasta.
                            tipo: 'identidade',
                            noCard: 'titulo',
                            render: (item) => (
                              <CelulaDupla principal={item.nome_original} sub={item.observacoes || '-'} />
                            )
                          },
                          {
                            id: 'status',
                            titulo: 'Status',
                            tipo: 'status',
                            render: (item) => (
                              <CelulaDupla principal={item.status} sub={item.ativo ? 'Atual' : 'Historico'} />
                            )
                          },
                          {
                            id: 'validade',
                            titulo: 'Validade',
                            tipo: 'data',
                            render: (item) => (
                              <CelulaDupla principal={formatDate(item.validade)} sub={validadeLabel(item.validade_status)} />
                            )
                          }
                        ]}
                        itens={documentos}
                        storageKey="tabela:rh-dp-colaboradores:documentos"
                        rotuloRolagem="Arquivos do colaborador"
                        carregando={carregandoDocumentos}
                        vazio="Nenhum documento localizado para este colaborador"
                        acoesLinha={(item) => (
                          <>
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => abrirDocumento(item.id)}>
                              Abrir
                            </button>
                            {podeGerirDocumentos && item.ativo && (
                              <label className={`btn btn-outline btn-sm cursor-pointer ${substituindoDocumentoId === item.id ? 'opacity-60 pointer-events-none' : ''}`}>
                                Substituir
                                <input
                                  type="file"
                                  className="hidden"
                                  onChange={(e) => onSelecionarSubstituicao(item, e)}
                                  disabled={substituindoDocumentoId === item.id}
                                />
                              </label>
                            )}
                          </>
                        )}
                        larguraAcoes={220}
                      />
                    </div>

                    <div className="space-y-3">
                      <h3 className="form-section-legenda">Checklist documental</h3>
                      <div className="space-y-2">
                        {(resumoDocumentos?.checklist || []).map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start justify-between gap-3 rounded-xl border p-3"
                            style={{ borderColor: 'var(--ui-border)', background: 'var(--ui-surface)' }}
                          >
                            <div>
                              <div className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>{item.nome}</div>
                              <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
                                {item.obrigatorio ? 'Obrigatorio' : 'Opcional'} · {item.exige_validade ? 'Com validade' : 'Sem validade obrigatoria'}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>{item.situacao}</div>
                              <div className="text-xs" style={{ color: 'var(--c-muted)' }}>{item.documento?.nome_original || '-'}</div>
                            </div>
                          </div>
                        ))}
                        {!resumoDocumentos?.checklist?.length && (
                          <p className="app-note">
                            Nenhum checklist aplicavel carregado para este colaborador.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div>
                      <h3 className="form-section-legenda">Dossiê: solicitações e pagamentos</h3>
                      <p className="app-note">
                        Arquivos enviados nas solicitações e comprovantes anexados na Fila de Pagamentos.
                        Documentos já validados pelo DP permanecem na tabela de arquivos oficiais acima.
                      </p>
                    </div>
                    <TabelaPadrao
                      colunas={[
                        {
                          id: 'origem',
                          titulo: 'Origem',
                          tipo: 'badge',
                          render: (item) => item.origem === 'COMPROVANTE_PAGAMENTO'
                            ? 'Pagamento'
                            : `Solicitação #${item.solicitacao_id}`
                        },
                        {
                          id: 'arquivo',
                          titulo: 'Arquivo',
                          tipo: 'identidade',
                          noCard: 'titulo',
                          render: (item) => (
                            <CelulaDupla
                              principal={item.nome || '-'}
                              sub={item.titulo_descricao || item.categoria || item.solicitacao_tipo || '-'}
                            />
                          )
                        },
                        {
                          id: 'situacao',
                          titulo: 'Situação',
                          tipo: 'status',
                          render: (item) => item.situacao || '-'
                        },
                        {
                          id: 'data',
                          titulo: 'Data',
                          tipo: 'data',
                          render: (item) => formatDate(item.data)
                        }
                      ]}
                      itens={arquivosDossie}
                      storageKey="tabela:rh-dp-colaboradores:dossie"
                      rotuloRolagem="Dossiê do colaborador"
                      carregando={carregandoDossie}
                      vazio="Nenhum arquivo de solicitação ou comprovante de pagamento vinculado."
                      acoesLinha={(item) => (
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => abrirArquivoDossie(item)}>
                          Abrir
                        </button>
                      )}
                      larguraAcoes={120}
                    />
                  </div>
                </BlocoConteudo>
              )}
            </form>
          </div>

          {podeEditar && (
            <div className="app-actionbar border-t px-4 py-3" style={{ borderColor: 'var(--ui-border)' }}>
              <button type="submit" form="rh-colaborador-form" className="btn btn-primary" disabled={salvando}>
                {form.id ? 'Salvar alteracoes' : 'Criar colaborador'}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={form.id ? fecharFormulario : limparFormulario}
                disabled={salvando}
              >
                {form.id ? 'Cancelar edicao' : 'Limpar'}
              </button>
            </div>
          )}
        </OverlayModal>
      )}

      {elementoConfirmacao}
    </Pagina>
  );
}
