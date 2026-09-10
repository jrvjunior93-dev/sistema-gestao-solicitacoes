import DateInputBR from '../../../components/DateInputBR';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  baixarModeloItensSolicitacaoCompra,
  baixarModeloItensCompraDireta,
  importarItensSolicitacaoCompra,
  importarItensCompraDireta,
  listarFormasPagamentoCompraDireta,
  listarInsumos,
  listarUnidades,
  obterUrlAssinadaCompra,
  uploadAnexoTemporarioCompra
} from '../../../services/compras';
import { buscarParceiros, criarCredorCompraDireta } from '../../../services/parceiros';
import { listarApropriacoes } from '../../../services/apropriacoes';
import { getMinhasObras } from '../../../services/obras';
import {
  Avisos,
  BlocoConteudo,
  CampoForm,
  FormSecao,
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  TabelaPadrao,
  useAvisos,
  useConfirmacao
} from '../../../components/padrao';
import OverlayModal from '../../../components/ui/OverlayModal';
import ApropriacaoAutocomplete from '../../../components/ui/ApropriacaoAutocomplete';
import { useAuth } from '../../../contexts/AuthContext';
import { useFecharAoSair } from '../../../hooks/useFecharAoSair';
import { getCpfCnpjError, maskCpfCnpj, onlyDigits } from '../../../utils/formatters';
import CompraPreviewModal from '../components/CompraPreviewModal';
import { criarPreviewCompra } from '../utils/preview';
import {
  aplicarApropriacaoUnica,
  calcularResumoRateios,
  criarRateioBase,
  formatarQuantidade,
  montarLinhasResumoApropriacao,
  normalizarRateiosEntrada,
  parseQuantidade,
  sincronizarItemComRateios,
  validarRateiosItem
} from '../utils/apropriacoes';
import {
  buildComprasDraftKey,
  readComprasDraft,
  removeComprasDraft,
  writeComprasDraft
} from '../utils/comprasDraftStorage';
const ITEM_ATTACHMENT_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.png,.jpg,.jpeg,.html,.rar';
const HEADER_ATTACHMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.xml';

// A linha de erro de campo (.form-error) também dentro da célula da tabela:
// a grade de itens não pode usar `CampoForm` (o controle já vive no `render`
// da coluna), mas a mensagem tem de aparecer NO MESMO lugar do resto.
function ErroCampo({ mensagem }) {
  if (!mensagem) return null;
  return <span className="form-error" role="alert">{mensagem}</span>;
}

function parseValorMonetario(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const cleaned = String(value).replace(/[^\d,.-]/g, '');
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function arredondarMoeda(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function formatarMoeda(value) {
  return parseValorMonetario(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatarCredor(credor) {
  if (!credor) return '';
  const nome = String(credor.nome || credor.razao_social || '').trim();
  const documento = String(credor.cpf_cnpj || '').trim();
  return [nome, documento].filter(Boolean).join(' - ') || `Credor ${credor.id}`;
}

function normalizarTexto(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function formaPagamentoEhBoleto(forma) {
  const texto = normalizarTexto(`${forma?.codigo || ''} ${forma?.nome || ''} ${forma?.tipo || ''}`);
  return Boolean(forma?.gera_boleto) || texto.includes('BOLETO');
}

function formaPagamentoEhFopag(forma) {
  return [forma?.codigo, forma?.nome]
    .map((valor) => normalizarTexto(valor).trim())
    .some((valor) => valor === 'FOPAG');
}

function formatarFormaPagamento(forma) {
  if (!forma) return '';
  return forma.nome || forma.codigo || `Forma ${forma.id}`;
}

function criarNovoCredorPadrao() {
  return {
    cpf_cnpj: '',
    nome: '',
    telefone: '',
    email: ''
  };
}

function criarItemManualFormPadrao() {
  return {
    nome_manual: '',
    unidade_id: '',
    unidade_sigla_manual: '',
    quantidade: '1',
    especificacao: ''
  };
}

function calcularValorTotalItem(item) {
  return arredondarMoeda(parseQuantidade(item?.quantidade) * parseValorMonetario(item?.valor_unitario));
}

function criarItemBase(insumo) {
  const unidadeManual = String(insumo?.unidade_manual || '').trim();
  const unidadeCadastrada = insumo?.unidade || null;
  return {
    insumo_id: insumo.id,
    insumo_nome: insumo.nome,
    unidade_id: unidadeManual ? null : (insumo.unidade_id || unidadeCadastrada?.id || null),
    unidade_sigla: unidadeManual || unidadeCadastrada?.sigla || unidadeCadastrada?.nome || '',
    unidade_sigla_manual: unidadeManual,
    quantidade: '1',
    valor_unitario: '',
    valor_total: '',
    especificacao: '',
    apropriacao_id: '',
    apropriacoes: [],
    necessario_para: '',
    link_produto: '',
    arquivo_url: '',
    arquivo_nome_original: '',
    manual: false
  };
}

function criarItemManualBase(dados, necessarioParaPadrao) {
  return sincronizarItemComRateios({
    insumo_id: null,
    insumo_nome: dados.nome_manual,
    unidade_id: dados.unidade_id || null,
    unidade_sigla: dados.unidade_sigla_manual,
    quantidade: String(dados.quantidade || '1'),
    valor_unitario: dados.valor_unitario || '',
    valor_total: dados.valor_total || '',
    especificacao: dados.especificacao || '',
    apropriacao_id: dados.apropriacoes?.[0]?.apropriacao_id || '',
    apropriacoes: Array.isArray(dados.apropriacoes) ? dados.apropriacoes : [],
    necessario_para: necessarioParaPadrao || '',
    link_produto: '',
    arquivo_url: '',
    arquivo_nome_original: '',
    manual: true,
    nome_manual: dados.nome_manual,
    unidade_sigla_manual: dados.unidade_sigla_manual
  });
}

function sincronizarQuantidadeRateioUnico(item, quantidade) {
  const rateios = normalizarRateiosEntrada(item);
  if (rateios.length !== 1) {
    return sincronizarItemComRateios({
      ...item,
      quantidade
    });
  }

  return sincronizarItemComRateios({
    ...item,
    quantidade,
    apropriacoes: [
      {
        ...rateios[0],
        quantidade_apropriada: quantidade
      }
    ]
  });
}

export default function NovaSolicitacaoCompra({ modoCompraDireta = false }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const obraIdInicial = String(searchParams.get('obra_id') || '').trim();
  const tipoSolicitacaoIdInicial = String(searchParams.get('tipo_solicitacao_id') || '').trim();
  const areaResponsavelInicial = String(searchParams.get('area_responsavel') || '').trim();
  const draftKey = buildComprasDraftKey(user?.id, modoCompraDireta ? 'compra-direta' : 'solicitacao');
  const hidratandoDraftRef = useRef(false);
  const draftCarregadoRef = useRef(false);
  const suspenderAutosaveAteRef = useRef(0);
  const importacaoItensInputRef = useRef(null);
  const importacaoEmAndamentoRef = useRef(false);
  const buscaCredorRequestRef = useRef(0);
  const buscaCredorFreteRequestRef = useRef(0);
  const campoCredorRef = useRef(null);
  const campoCredorFreteRef = useRef(null);
  const [obras, setObras] = useState([]);
  const [insumos, setInsumos] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [apropriacoes, setApropriacoes] = useState([]);
  const [obraId, setObraId] = useState('');
  const [tipoSolicitacaoIdContexto, setTipoSolicitacaoIdContexto] = useState(tipoSolicitacaoIdInicial);
  const [areaResponsavelContexto, setAreaResponsavelContexto] = useState(areaResponsavelInicial);
  const [necessarioPara, setNecessarioPara] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [dadosPagamento, setDadosPagamento] = useState('');
  const [descontoTotal, setDescontoTotal] = useState('');
  const [freteTipo, setFreteTipo] = useState('SEM_FRETE');
  const [freteValor, setFreteValor] = useState('');
  const [freteDataVencimento, setFreteDataVencimento] = useState('');
  const [freteParceiroId, setFreteParceiroId] = useState('');
  const [freteParceiroBusca, setFreteParceiroBusca] = useState('');
  const [freteDadosPagamento, setFreteDadosPagamento] = useState('');
  const [freteParceiros, setFreteParceiros] = useState([]);
  const [buscandoCredoresFrete, setBuscandoCredoresFrete] = useState(false);
  const [autocompleteFreteAberto, setAutocompleteFreteAberto] = useState(false);
  const [erroBuscaCredorFrete, setErroBuscaCredorFrete] = useState('');
  const [freteCredorAtivoIndex, setFreteCredorAtivoIndex] = useState(0);
  const [anexosCabecalho, setAnexosCabecalho] = useState([]);
  const [formasPagamento, setFormasPagamento] = useState([]);
  const [formaPagamentoIds, setFormaPagamentoIds] = useState([]);
  const [parceiroId, setParceiroId] = useState('');
  const [parceiroBusca, setParceiroBusca] = useState('');
  const [parceiros, setParceiros] = useState([]);
  const [buscandoParceiros, setBuscandoParceiros] = useState(false);
  const [autocompleteCredorAberto, setAutocompleteCredorAberto] = useState(false);
  const [credorAtivoIndex, setCredorAtivoIndex] = useState(0);
  const [erroBuscaCredor, setErroBuscaCredor] = useState('');
  const [modalCredorAberto, setModalCredorAberto] = useState(false);
  /*
    "FORMAS DE PAGAMENTO" SÓ FECHAVA CLICANDO DE NOVO NO PRÓPRIO BOTÃO
    (05/09) — mesmo defeito das "Competências dos cards" do custosRecebiveis,
    e pela mesma causa: era um `<details>` NATIVO. `<details>` não oferece
    fechar ao clicar fora e ignora `Esc`, então a lista de marcação ficava
    aberta por cima do formulário (é `absolute`, `z-dropdown`) tapando o campo
    de credor logo abaixo enquanto a pessoa preenchia o resto.

    Sem estado em React, `<details>` também não tinha onde receber o
    `useFecharAoSair`. Virou botão + estado, com o mesmo desenho — inclusive
    a seta que gira, que saiu de `group-open:` para a classe condicional,
    porque `group-open` só existe quando existe um `<details open>`.

    O ref envolve o botão E o painel: marcar uma forma é clique DENTRO, o
    hook não fecha no `mousedown` e o checkbox continua alternando. É de
    propósito que a camada não feche ao marcar — a escolha é múltipla.
  */
  const formasPagamentoRef = useRef(null);
  const [formasPagamentoAberto, setFormasPagamentoAberto] = useState(false);
  useFecharAoSair(formasPagamentoRef, formasPagamentoAberto, () => setFormasPagamentoAberto(false));
  /*
    AS DUAS LISTAS DE CREDOR FECHAM AO CLICAR FORA, NAO AO PERDER O FOCO (05/09).

    As duas (credor da compra e credor do frete) fechavam por `onBlur` com
    `setTimeout(120)` — e o atraso nao era desenho, era a corrida entre o
    fechamento por perda de foco e a escolha da opcao. O que ficava de fora:
    rolar a pagina, clicar num rotulo ou abrir o painel de "Formas de
    pagamento" (que e `absolute` e cai logo acima do campo de credor) com o
    foco preso no input NAO fechavam a lista — duas camadas empilhadas em
    cima do formulario. O `Esc` ja existia, mas so com o foco dentro do
    input; agora vale no documento inteiro, e continua no `onKeyDown` para
    quem digita.

    POR QUE A SELECAO SOBREVIVE: cada ref cobre o `div` que embrulha o input
    E a lista, entao clicar numa opcao e clique DENTRO e o hook nao fecha no
    `mousedown`. E a opcao ja escolhia no proprio `onMouseDown` com
    `preventDefault()` — que roda antes do listener do documento e ainda
    segura o foco no campo.

    Fechar aqui e so `setAutocomplete...Aberto(false)`: o texto do campo e o
    `parceiro_id` sao guardados por `selecionarCredor...`, e nada mais depende
    do fechamento.
  */
  useFecharAoSair(campoCredorRef, autocompleteCredorAberto, () => setAutocompleteCredorAberto(false));
  useFecharAoSair(campoCredorFreteRef, autocompleteFreteAberto, () => setAutocompleteFreteAberto(false));
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  /*
    VALIDAÇÃO CAMPO A CAMPO (R3 da DoD).

    Esta tela reprovava o envio com ~20 caixas do navegador, uma por campo
    ("Item 3: informe a quantidade"), longe do campo que faltava preencher.
    Trocar `alert` por `Avisos` moveria a MESMA frase para o topo da página —
    continuaria longe. O erro passa a morar NO CAMPO (`erro` do `CampoForm`,
    ou a linha `.form-error` na célula da grade), com a MESMA condição, a
    MESMA mensagem e a MESMA ordem da cadeia de `return`: nada foi afrouxado
    nem endurecido.

    Vai para `Avisos` só o que não tem campo nesta tela para receber a frase
    — resultado de operação (importou, salvou, falhou) e condição que não é
    de um campo ("Adicione ao menos um item.", "Esse insumo já foi
    adicionado.").
  */
  const [errosCampo, setErrosCampo] = useState({});
  const [errosItem, setErrosItem] = useState({});
  const [erroRateiosModal, setErroRateiosModal] = useState('');
  const [erroRateiosItemManual, setErroRateiosItemManual] = useState('');
  const [novoCredor, setNovoCredor] = useState(criarNovoCredorPadrao);
  const [salvandoCredor, setSalvandoCredor] = useState(false);
  const [buscaInsumo, setBuscaInsumo] = useState('');
  const [itens, setItens] = useState([]);
  const [uploadingArquivos, setUploadingArquivos] = useState({});
  const [uploadingAnexoCabecalho, setUploadingAnexoCabecalho] = useState(false);
  const [importandoItens, setImportandoItens] = useState(false);
  const [loading, setLoading] = useState(false);
  const [modalManualAberto, setModalManualAberto] = useState(false);
  const [modalApropriacaoIndex, setModalApropriacaoIndex] = useState(null);
  const [rateiosModal, setRateiosModal] = useState([]);
  const [previewArquivo, setPreviewArquivo] = useState(null);
  const [itemManual, setItemManual] = useState(criarItemManualFormPadrao);
  const [rateiosItemManual, setRateiosItemManual] = useState(() => [criarRateioBase('1')]);

  // O erro do campo sai assim que a pessoa mexe nele — mensagem de validação
  // que sobrevive à correção vira ruído e ensina a ignorar a próxima.
  function limparErroCampo(campo) {
    setErrosCampo((atual) => (atual[campo] ? { ...atual, [campo]: '' } : atual));
  }

  function limparErroItem(indice, campo) {
    setErrosItem((atual) => (atual[indice]?.[campo]
      ? { ...atual, [indice]: { ...atual[indice], [campo]: '' } }
      : atual));
  }

  // Uma reprovação por envio, como sempre foi: a validação é uma cadeia de
  // `return` e para no primeiro problema. O que muda é ONDE a frase aparece.
  function reprovarCampo(campo, mensagem) {
    setErrosItem({});
    setErrosCampo({ [campo]: mensagem });
  }

  function reprovarItem(indice, campo, mensagem) {
    setErrosCampo({});
    setErrosItem({ [indice]: { [campo]: mensagem } });
  }

  function erroDoItem(indice, campo) {
    return errosItem[indice]?.[campo] || '';
  }

  async function carregarObras() {
    try {
      const data = await getMinhasObras({ modo: 'CRIACAO' });
      setObras(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao carregar obras');
    }
  }

  async function carregarInsumos() {
    try {
      const data = await listarInsumos();
      setInsumos(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao carregar insumos');
    }
  }

  async function carregarUnidades() {
    try {
      const data = await listarUnidades();
      setUnidades(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setUnidades([]);
    }
  }

  async function carregarFormasPagamento() {
    try {
      const data = await listarFormasPagamentoCompraDireta();
      const lista = Array.isArray(data) ? data : [];
      const formasPermitidas = lista.filter(
        (item) => item?.ativo !== false && !formaPagamentoEhFopag(item)
      );
      const idsPermitidos = new Set(formasPermitidas.map((item) => String(item.id)));
      setFormasPagamento(formasPermitidas);
      setFormaPagamentoIds((atuais) => atuais.filter((id) => idsPermitidos.has(String(id))));
    } catch (error) {
      console.error(error);
      setFormasPagamento([]);
    }
  }

  async function carregarApropriacoes(obraSelecionada) {
    try {
      if (!obraSelecionada) {
        setApropriacoes([]);
        return;
      }

      const data = await listarApropriacoes({ obra_id: obraSelecionada });
      setApropriacoes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao carregar apropriações');
    }
  }

  /*
    CONSENTIMENTO (R21 + R26) — "Limpar rascunho" é o botão de maior perda
    desta tela: ele apaga o rascunho gravado E zera a compra inteira que está
    na tela (obra, credor, frete, anexos, formas de pagamento e TODOS os
    itens). A pergunta antiga ("Limpar todos os dados ainda nao enviados
    desta compra?") não dizia isso.

    O retorno de `confirmar` é `{ ok, texto }` — objeto é SEMPRE verdadeiro, e
    ler sem desestruturar faz o "Cancelar" prosseguir (R21). E como o modal do
    sistema NÃO congela a página (ao contrário do `confirm` do navegador), o
    alvo é fixado numa `const` ANTES do `await` (R26): a chave do rascunho e a
    contagem de itens que a pessoa leu são as que a ação usa.
  */
  async function limparRascunho() {
    const chaveAlvo = draftKey;
    const totalItensAlvo = itens.length;
    const { ok } = await confirmar({
      titulo: 'Limpar rascunho',
      mensagem: `Isto apaga o rascunho gravado e zera esta ${modoCompraDireta ? 'compra direta' : 'solicitação de compra'} inteira: obra, credor, formas de pagamento, frete, anexos e ${totalItensAlvo} item(ns) já preenchido(s). Não há como desfazer.`,
      rotuloConfirmar: 'Limpar rascunho',
      destrutiva: true
    });
    if (!ok) return;
    suspenderAutosaveAteRef.current = Date.now() + 1500;
    removeComprasDraft(chaveAlvo);
    setObraId(obraIdInicial || '');
    setNecessarioPara('');
    setObservacoes('');
    setDadosPagamento('');
    setDescontoTotal('');
    setFreteTipo('SEM_FRETE');
    setFreteValor('');
    setFreteDataVencimento('');
    setFreteParceiroId('');
    setFreteParceiroBusca('');
    setFreteDadosPagamento('');
    setFreteParceiros([]);
    setAnexosCabecalho([]);
    setFormaPagamentoIds([]);
    setParceiroId('');
    setParceiroBusca('');
    setItens([]);
    setErrosCampo({});
    setErrosItem({});
  }

  useEffect(() => {
    carregarObras();
    carregarInsumos();
    carregarUnidades();
    if (modoCompraDireta) {
      carregarFormasPagamento();
    }
  }, []);

  const itemModalAtual = modalApropriacaoIndex !== null ? itens[modalApropriacaoIndex] || null : null;
  const formasPagamentoSelecionadas = useMemo(
    () => formasPagamento.filter((forma) => formaPagamentoIds.includes(String(forma.id))),
    [formasPagamento, formaPagamentoIds]
  );
  const compraDiretaTemBoleto = useMemo(
    () => formasPagamentoSelecionadas.some((forma) => formaPagamentoEhBoleto(forma)),
    [formasPagamentoSelecionadas]
  );
  const resumoFormasPagamento = useMemo(() => {
    if (!formasPagamentoSelecionadas.length) {
      return 'Selecione uma ou mais formas';
    }

    const nomes = formasPagamentoSelecionadas.map(formatarFormaPagamento);
    return `${nomes.length} selecionada${nomes.length > 1 ? 's' : ''}: ${nomes.join(', ')}`;
  }, [formasPagamentoSelecionadas]);
  const anexosBoletoCabecalho = useMemo(
    () => anexosCabecalho.filter((anexo) => anexo?.tipo_documento === 'BOLETO'),
    [anexosCabecalho]
  );

  const resumoModalApropriacao = useMemo(() => {
    const total = parseQuantidade(itemModalAtual?.quantidade);
    const distribuido = rateiosModal.reduce(
      (acc, rateio) => acc + parseQuantidade(rateio.quantidade_apropriada),
      0
    );
    const saldo = Number((total - distribuido).toFixed(4));

    return {
      total,
      distribuido: Number(distribuido.toFixed(4)),
      saldo,
      fechado: Math.abs(saldo) <= 0.01 && total > 0
    };
  }, [itemModalAtual, rateiosModal]);

  const resumoApropriacaoItemManual = useMemo(() => calcularResumoRateios({
    quantidade: itemManual.quantidade,
    apropriacoes: rateiosItemManual
  }), [itemManual.quantidade, rateiosItemManual]);

  useEffect(() => {
    if (draftCarregadoRef.current) {
      return;
    }

    try {
      const dados = readComprasDraft(draftKey);
      if (!dados) {
        if (obraIdInicial) setObraId(obraIdInicial);
        draftCarregadoRef.current = true;
        return;
      }
      const payload = dados?.payload;
      if (!payload || !payload.obra_id) {
        if (obraIdInicial) setObraId(obraIdInicial);
        draftCarregadoRef.current = true;
        return;
      }
      if (obraIdInicial && Number(payload.obra_id) !== Number(obraIdInicial)) {
        setObraId(obraIdInicial);
        draftCarregadoRef.current = true;
        return;
      }

      hidratandoDraftRef.current = true;
      setObraId(String(payload.obra_id || ''));
      setTipoSolicitacaoIdContexto(
        String(dados?.contexto?.tipo_solicitacao_id || payload.tipo_solicitacao_id || tipoSolicitacaoIdInicial || '').trim()
      );
      setAreaResponsavelContexto(
        String(dados?.contexto?.area_responsavel || areaResponsavelInicial || '').trim()
      );
      setNecessarioPara(payload.necessario_para || '');
      setObservacoes(payload.observacoes || '');
      setDadosPagamento(payload.dados_pagamento || '');
      setDescontoTotal(payload.desconto_total ? String(payload.desconto_total) : '');
      setFreteTipo(String(payload.frete_tipo || 'SEM_FRETE').toUpperCase());
      setFreteValor(payload.frete_valor ? String(payload.frete_valor) : '');
      setFreteDataVencimento(payload.frete_data_vencimento || '');
      setFreteParceiroId(payload.frete_parceiro_id ? String(payload.frete_parceiro_id) : '');
      setFreteParceiroBusca(dados?.resumo?.frete_credor_nome || '');
      setFreteDadosPagamento(payload.frete_dados_pagamento || '');
      setAnexosCabecalho(Array.isArray(payload.anexos_cabecalho) ? payload.anexos_cabecalho : []);
      setFormaPagamentoIds(
        Array.isArray(payload.forma_pagamento_ids)
          ? payload.forma_pagamento_ids.map((item) => String(item)).filter(Boolean)
          : []
      );
      setParceiroId(payload.parceiro_id ? String(payload.parceiro_id) : '');
      if (dados?.resumo?.credor_nome) {
        setParceiroBusca(dados.resumo.credor_nome);
      }
      setItens(
        Array.isArray(payload.itens)
          ? payload.itens.map((item, index) => {
              const resumoItem = dados?.resumo?.itens?.[index];

              return sincronizarItemComRateios({
                insumo_id: item.manual ? null : item.insumo_id,
                insumo_nome: item.manual
                  ? item.nome_manual || item.insumo_nome || ''
                  : resumoItem?.insumo_nome || item.insumo_nome || '',
                unidade_id: item.manual ? null : (item.unidade_sigla_manual ? null : item.unidade_id),
                unidade_sigla: item.manual
                  ? item.unidade_sigla_manual || item.unidade_sigla || ''
                  : item.unidade_sigla_manual || item.unidade_sigla || resumoItem?.unidade_sigla || '',
                quantidade: String(item.quantidade ?? '1'),
                valor_unitario: item.valor_unitario ? String(item.valor_unitario) : '',
                valor_total: item.valor_total ? String(item.valor_total) : '',
                especificacao: item.especificacao || '',
                apropriacao_id: item.apropriacao_id ? String(item.apropriacao_id) : '',
                apropriacoes: Array.isArray(item.apropriacoes) ? item.apropriacoes : [],
                necessario_para: item.necessario_para || payload.necessario_para || '',
                link_produto: item.link_produto || '',
                arquivo_url: item.arquivo_url || '',
                arquivo_nome_original: item.arquivo_nome_original || '',
                manual: Boolean(item.manual),
                nome_manual: item.manual ? item.nome_manual || item.insumo_nome || '' : '',
                unidade_sigla_manual: item.unidade_sigla_manual
                  || (item.manual ? item.unidade_sigla || '' : '')
              });
            })
          : []
      );
    } catch (error) {
      console.error(error);
    } finally {
      draftCarregadoRef.current = true;
    }
  }, [draftKey]);

  useEffect(() => {
    if (
      !draftCarregadoRef.current
      || hidratandoDraftRef.current
      || suspenderAutosaveAteRef.current > Date.now()
    ) return undefined;
    const possuiConteudo = Boolean(
      obraId || necessarioPara || observacoes || dadosPagamento || parceiroId || freteTipo !== 'SEM_FRETE' || itens.length
    );
    if (!possuiConteudo) return undefined;

    const timer = window.setTimeout(() => {
      writeComprasDraft(draftKey, {
        payload: {
          obra_id: obraId || null,
          tipo_solicitacao_id: tipoSolicitacaoIdContexto || null,
          necessario_para: necessarioPara || null,
          observacoes: observacoes || '',
          dados_pagamento: dadosPagamento || '',
          desconto_total: descontoTotal || '',
          frete_tipo: freteTipo,
          frete_valor: freteTipo === 'SEM_FRETE' ? '' : freteValor || '',
          frete_data_vencimento: freteTipo === 'TERCEIRO' ? freteDataVencimento || null : null,
          frete_parceiro_id: freteTipo === 'TERCEIRO' ? freteParceiroId || null : null,
          frete_dados_pagamento: freteTipo === 'TERCEIRO' ? freteDadosPagamento || '' : '',
          anexos_cabecalho: anexosCabecalho,
          forma_pagamento_ids: formaPagamentoIds,
          parceiro_id: parceiroId || null,
          itens
        },
        resumo: {
          solicitante_nome: user?.nome || '',
          credor_nome: parceiroBusca || '',
          frete_credor_nome: freteParceiroBusca || '',
          itens
        },
        contexto: {
          tipo_solicitacao_id: tipoSolicitacaoIdContexto || null,
          area_responsavel: areaResponsavelContexto || ''
        }
      }, user?.id);
    }, 800);

    return () => window.clearTimeout(timer);
  }, [
    anexosCabecalho,
    areaResponsavelContexto,
    dadosPagamento,
    descontoTotal,
    draftKey,
    formaPagamentoIds,
    freteDataVencimento,
    freteDadosPagamento,
    freteParceiroBusca,
    freteParceiroId,
    freteTipo,
    freteValor,
    itens,
    necessarioPara,
    obraId,
    observacoes,
    parceiroBusca,
    parceiroId,
    tipoSolicitacaoIdContexto,
    user?.id,
    user?.nome
  ]);

  useEffect(() => {
    carregarApropriacoes(obraId);
    if (hidratandoDraftRef.current) {
      hidratandoDraftRef.current = false;
      return;
    }

    setItens((atual) =>
      atual.map((item) =>
        sincronizarItemComRateios({
          ...item,
          apropriacao_id: '',
          apropriacoes: [],
          necessario_para: item.necessario_para || necessarioPara
        })
      )
    );
  }, [obraId]);

  const insumosFiltrados = useMemo(() => {
    const termo = String(buscaInsumo || '').trim().toLowerCase();

    if (!termo) {
      return insumos;
    }

    return insumos.filter((insumo) => {
      const nome = String(insumo.nome || '').toLowerCase();
      const codigo = String(insumo.codigo || '').toLowerCase();
      const categoria = String(insumo.categoria?.nome || '').toLowerCase();
      return nome.includes(termo) || codigo.includes(termo) || categoria.includes(termo);
    });
  }, [buscaInsumo, insumos]);

  // A grade edita por POSICAO na lista; a tabela precisa de um id estavel por
  // linha, entao o indice viaja junto do item.
  const itensGrade = useMemo(
    () => itens.map((item, indice) => ({ ...item, __indice: indice })),
    [itens]
  );

  const itensPendentesApropriacao = useMemo(
    () => itens.filter((item) => !validarRateiosItem(item).ok).length,
    [itens]
  );

  const valorBrutoCompraDireta = useMemo(
    () => itens.reduce((acc, item) => acc + calcularValorTotalItem(item), 0),
    [itens]
  );

  const descontoCompraDireta = useMemo(
    () => arredondarMoeda(Math.max(0, parseValorMonetario(descontoTotal))),
    [descontoTotal]
  );

  const valorTotalCompraDireta = useMemo(
    () => arredondarMoeda(Math.max(0, valorBrutoCompraDireta - descontoCompraDireta)),
    [valorBrutoCompraDireta, descontoCompraDireta]
  );

  const freteValorNumero = useMemo(
    () => arredondarMoeda(Math.max(0, parseValorMonetario(freteValor))),
    [freteValor]
  );

  const valorTotalSolicitacaoCompraDireta = useMemo(
    () => arredondarMoeda(
      valorTotalCompraDireta + (freteTipo !== 'SEM_FRETE' ? freteValorNumero : 0)
    ),
    [freteTipo, freteValorNumero, valorTotalCompraDireta]
  );

  const parceiroSelecionado = useMemo(
    () => parceiros.find((parceiro) => String(parceiro.id) === String(parceiroId)) || null,
    [parceiroId, parceiros]
  );

  const freteCredorSelecionado = useMemo(
    () => freteParceiros.find((parceiro) => String(parceiro.id) === String(freteParceiroId)) || null,
    [freteParceiroId, freteParceiros]
  );

  useEffect(() => {
    if (!modoCompraDireta || parceiroId) {
      return undefined;
    }

    const termo = String(parceiroBusca || '').trim();
    const buscaAtual = buscaCredorRequestRef.current + 1;
    buscaCredorRequestRef.current = buscaAtual;
    setCredorAtivoIndex(0);
    setErroBuscaCredor('');

    if (termo.length < 2) {
      setParceiros([]);
      setBuscandoParceiros(false);
      return undefined;
    }

    setParceiros([]);
    setBuscandoParceiros(true);

    const timeoutId = window.setTimeout(async () => {
      try {
        const data = await buscarParceiros({ q: termo, fornecedor: 1, ativo: 1, limit: 10 });
        if (buscaCredorRequestRef.current !== buscaAtual) return;
        setParceiros(Array.isArray(data) ? data : []);
      } catch (error) {
        if (buscaCredorRequestRef.current !== buscaAtual) return;
        console.error(error);
        setParceiros([]);
        setErroBuscaCredor(error.message || 'Erro ao buscar credores.');
      } finally {
        if (buscaCredorRequestRef.current === buscaAtual) {
          setBuscandoParceiros(false);
        }
      }
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [modoCompraDireta, parceiroBusca, parceiroId]);

  useEffect(() => {
    if (!modoCompraDireta || freteTipo !== 'TERCEIRO' || freteParceiroId) {
      return undefined;
    }

    const termo = String(freteParceiroBusca || '').trim();
    const buscaAtual = buscaCredorFreteRequestRef.current + 1;
    buscaCredorFreteRequestRef.current = buscaAtual;
    setFreteCredorAtivoIndex(0);
    setErroBuscaCredorFrete('');

    if (termo.length < 2) {
      setFreteParceiros([]);
      setBuscandoCredoresFrete(false);
      return undefined;
    }

    setFreteParceiros([]);
    setBuscandoCredoresFrete(true);

    const timeoutId = window.setTimeout(async () => {
      try {
        const data = await buscarParceiros({ q: termo, fornecedor: 1, ativo: 1, limit: 10 });
        if (buscaCredorFreteRequestRef.current !== buscaAtual) return;
        setFreteParceiros(Array.isArray(data) ? data : []);
      } catch (error) {
        if (buscaCredorFreteRequestRef.current !== buscaAtual) return;
        console.error(error);
        setFreteParceiros([]);
        setErroBuscaCredorFrete(error.message || 'Erro ao buscar credores do frete.');
      } finally {
        if (buscaCredorFreteRequestRef.current === buscaAtual) {
          setBuscandoCredoresFrete(false);
        }
      }
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [freteParceiroBusca, freteParceiroId, freteTipo, modoCompraDireta]);

  function selecionarCredorCompraDireta(parceiro) {
    if (!parceiro) return;
    buscaCredorRequestRef.current += 1;
    limparErroCampo('credor');
    setParceiroId(String(parceiro.id));
    setParceiroBusca(formatarCredor(parceiro));
    setParceiros((atual) => [
      parceiro,
      ...atual.filter((item) => Number(item.id) !== Number(parceiro.id))
    ]);
    setBuscandoParceiros(false);
    setErroBuscaCredor('');
    setAutocompleteCredorAberto(false);
    setCredorAtivoIndex(0);
  }

  function tratarTecladoCredor(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setAutocompleteCredorAberto(true);
      setCredorAtivoIndex((atual) => Math.min(atual + 1, Math.max(parceiros.length - 1, 0)));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCredorAtivoIndex((atual) => Math.max(atual - 1, 0));
      return;
    }

    if (event.key === 'Enter' && autocompleteCredorAberto && parceiros.length > 0) {
      event.preventDefault();
      selecionarCredorCompraDireta(parceiros[credorAtivoIndex] || parceiros[0]);
      return;
    }

    if (event.key === 'Escape') {
      setAutocompleteCredorAberto(false);
    }
  }

  function selecionarCredorFrete(parceiro) {
    if (!parceiro) return;
    buscaCredorFreteRequestRef.current += 1;
    limparErroCampo('frete_parceiro');
    setFreteParceiroId(String(parceiro.id));
    setFreteParceiroBusca(formatarCredor(parceiro));
    setFreteParceiros((atual) => [
      parceiro,
      ...atual.filter((item) => Number(item.id) !== Number(parceiro.id))
    ]);
    setBuscandoCredoresFrete(false);
    setErroBuscaCredorFrete('');
    setAutocompleteFreteAberto(false);
    setFreteCredorAtivoIndex(0);
  }

  function tratarTecladoCredorFrete(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setAutocompleteFreteAberto(true);
      setFreteCredorAtivoIndex((atual) => Math.min(atual + 1, Math.max(freteParceiros.length - 1, 0)));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFreteCredorAtivoIndex((atual) => Math.max(atual - 1, 0));
      return;
    }

    if (event.key === 'Enter' && autocompleteFreteAberto && freteParceiros.length > 0) {
      event.preventDefault();
      selecionarCredorFrete(freteParceiros[freteCredorAtivoIndex] || freteParceiros[0]);
      return;
    }

    if (event.key === 'Escape') {
      setAutocompleteFreteAberto(false);
    }
  }

  function alterarFreteTipo(tipo) {
    setFreteTipo(tipo);
    limparErroCampo('frete_valor');
    if (tipo === 'SEM_FRETE') {
      setFreteValor('');
    }
    if (tipo !== 'TERCEIRO') {
      setFreteDataVencimento('');
      setFreteParceiroId('');
      setFreteParceiroBusca('');
      setFreteDadosPagamento('');
      setFreteParceiros([]);
      setAutocompleteFreteAberto(false);
    }
  }

  async function cadastrarCredorCompraDireta() {
    if (!novoCredor.nome.trim()) {
      reprovarCampo('credor_nome', 'Informe o nome do credor.');
      return;
    }
    const documentoErro = getCpfCnpjError(novoCredor.cpf_cnpj, {
      required: true,
      label: 'CPF/CNPJ do credor'
    });
    if (documentoErro) {
      reprovarCampo('credor_cpf_cnpj', documentoErro);
      return;
    }

    setSalvandoCredor(true);
    try {
      const parceiro = await criarCredorCompraDireta({
        ...novoCredor,
        cpf_cnpj: onlyDigits(novoCredor.cpf_cnpj),
        telefone: novoCredor.telefone.replace(/\D/g, '')
      });
      selecionarCredorCompraDireta(parceiro);
      setNovoCredor(criarNovoCredorPadrao());
      setErrosCampo({});
      setModalCredorAberto(false);
      avisar.sucesso('Credor cadastrado e selecionado nesta compra.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao cadastrar credor');
    } finally {
      setSalvandoCredor(false);
    }
  }

  async function baixarModeloItens() {
    if (!modoCompraDireta && !obraId) {
      reprovarCampo('obra_id', 'Selecione a obra antes de baixar o modelo.');
      return;
    }

    try {
      if (modoCompraDireta) {
        await baixarModeloItensCompraDireta();
      } else {
        await baixarModeloItensSolicitacaoCompra(obraId);
      }
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao baixar modelo de itens');
    }
  }

  async function handleImportarItens(file) {
    if (!file) {
      return;
    }

    if (!obraId) {
      reprovarCampo('obra_id', 'Selecione a obra antes de importar os itens.');
      return;
    }

    if (importacaoEmAndamentoRef.current) {
      return;
    }

    importacaoEmAndamentoRef.current = true;
    setImportandoItens(true);
    try {
      const data = modoCompraDireta
        ? await importarItensCompraDireta(file, obraId)
        : await importarItensSolicitacaoCompra(file, obraId, necessarioPara);
      const itensImportados = Array.isArray(data?.itens)
        ? data.itens.map((item) => sincronizarItemComRateios(item))
        : [];

      if (!itensImportados.length) {
        avisar.alerta('Nenhum item valido foi encontrado na planilha.');
        return;
      }

      if (itens.length + itensImportados.length > 300) {
        avisar.alerta(`A solicitacao ficaria com ${itens.length + itensImportados.length} itens. O limite e 300 itens.`);
        return;
      }

      if (!modoCompraDireta) {
        const idsAtuais = new Set(
          itens
            .filter((item) => !item.manual && Number(item.insumo_id) > 0)
            .map((item) => Number(item.insumo_id))
        );
        const duplicados = itensImportados.filter(
          (item) => !item.manual && idsAtuais.has(Number(item.insumo_id))
        );
        if (duplicados.length) {
          const nomes = duplicados.slice(0, 5).map((item) => item.insumo_nome).join(', ');
          avisar.alerta(`A importacao contem insumo(s) que ja estao na solicitacao: ${nomes}. Remova as duplicidades e tente novamente.`);
          return;
        }
      }

      setItens((atual) => [...atual, ...itensImportados]);
      avisar.sucesso(
        `${itensImportados.length} item(ns) importado(s) para ${modoCompraDireta ? 'a compra direta' : 'a solicitacao de compra'}. Revise os dados antes de continuar.`
      );
    } catch (error) {
      console.error(error);
      const detalhes = Array.isArray(error?.erros) ? ` ${error.erros.join(' ')}` : '';
      avisar.erro(`${error.message || 'Erro ao importar itens'}${detalhes}`);
    } finally {
      importacaoEmAndamentoRef.current = false;
      setImportandoItens(false);
    }
  }

  async function adicionarInsumo(insumo) {
    if (!obraId) {
      reprovarCampo('obra_id', 'Selecione a obra antes de adicionar itens.');
      return;
    }

    const existente = itens.find((item) => !item.manual && Number(item.insumo_id) === Number(insumo.id));
    if (existente) {
      avisar.alerta('Esse insumo já foi adicionado.');
      return;
    }

    const novoItem = { ...criarItemBase(insumo), necessario_para: necessarioPara || '' };
    setItens((atual) => [...atual, novoItem]);
    return;

    try {
      const data = null;
      if (data?.last_purchase_price != null) {
        setItens((atual) => atual.map((it) =>
          !it.manual && Number(it.insumo_id) === Number(insumo.id)
            ? { ...it, ultimo_preco: data.last_purchase_price }
            : it
        ));
      }
    } catch {
      // silencioso — campo de referência, não bloqueia o fluxo
    }
  }

  function abrirModalItemManual() {
    const formulario = criarItemManualFormPadrao();
    setItemManual(formulario);
    setRateiosItemManual([criarRateioBase(formulario.quantidade)]);
    setErroRateiosItemManual('');
    setErrosCampo((atual) => ({ ...atual, item_manual: '' }));
    setModalManualAberto(true);
  }

  function fecharModalItemManual() {
    setModalManualAberto(false);
    setErroRateiosItemManual('');
  }

  function atualizarQuantidadeItemManual(quantidade) {
    setItemManual((atual) => ({ ...atual, quantidade }));
    setErroRateiosItemManual('');
    setRateiosItemManual((atuais) => (
      atuais.length === 1
        ? [{ ...atuais[0], quantidade_apropriada: quantidade }]
        : atuais
    ));
  }

  function atualizarRateioItemManual(index, campo, valor) {
    setErroRateiosItemManual('');
    setRateiosItemManual((atuais) => atuais.map((rateio, rateioIndex) => (
      rateioIndex === index ? { ...rateio, [campo]: valor } : rateio
    )));
  }

  function adicionarRateioItemManual() {
    setErroRateiosItemManual('');
    setRateiosItemManual((atuais) => [...atuais, criarRateioBase('')]);
  }

  function removerRateioItemManual(index) {
    setErroRateiosItemManual('');
    setRateiosItemManual((atuais) => atuais.filter((_, rateioIndex) => rateioIndex !== index));
  }

  function adicionarItemManual() {
    if (!obraId) {
      /*
        A obra vive no bloco "Dados gerais", ATRÁS deste modal — não há campo
        aqui para receber a frase, então ela fica na faixa de avisos, que o
        modal hospeda enquanto está aberto.
      */
      avisar.alerta('Selecione a obra antes de adicionar item manual.');
      return;
    }

    if (!itemManual.nome_manual.trim() || !itemManual.unidade_sigla_manual.trim()) {
      reprovarCampo('item_manual', 'Informe nome e unidade do item manual.');
      return;
    }

    const itemNovo = criarItemManualBase(
      {
        ...itemManual,
        quantidade: itemManual.quantidade || '1',
        apropriacoes: rateiosItemManual
      },
      necessarioPara
    );
    const validacaoRateios = validarRateiosItem(itemNovo);
    if (!validacaoRateios.ok) {
      setErroRateiosItemManual(validacaoRateios.mensagem);
      return;
    }

    setItens((atual) => [...atual, itemNovo]);
    setItemManual(criarItemManualFormPadrao());
    setRateiosItemManual([criarRateioBase('1')]);
    setErroRateiosItemManual('');
    setErrosCampo({});
    setModalManualAberto(false);
  }

  function atualizarItem(index, campo, valor) {
    // A coluna do insumo guarda o erro na chave `insumo`, mas o campo editado
    // chama-se `insumo_nome` — sem o mapeamento a mensagem sobreviveria à
    // correção, que é exatamente o que ensina a ignorar a próxima.
    limparErroItem(index, campo === 'insumo_nome' ? 'insumo' : campo);
    setItens((atual) =>
      atual.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        const atualizado = {
          ...item,
          [campo]: valor
        };

        if (item.manual) {
          if (campo === 'insumo_nome') {
            atualizado.nome_manual = valor;
          }
          if (campo === 'unidade_sigla') {
            atualizado.unidade_sigla_manual = valor;
          }
        }

        if (campo === 'quantidade') {
          return sincronizarQuantidadeRateioUnico({
            ...atualizado,
            valor_total: modoCompraDireta ? String(calcularValorTotalItem(atualizado)) : atualizado.valor_total
          }, valor);
        }

        if (campo === 'valor_unitario') {
          return sincronizarItemComRateios({
            ...atualizado,
            valor_total: modoCompraDireta ? String(calcularValorTotalItem(atualizado)) : atualizado.valor_total
          });
        }

        return sincronizarItemComRateios(atualizado);
      })
    );
  }

  function atualizarUnidadeItem(index, valorDigitado) {
    const texto = String(valorDigitado || '');
    const itemAtual = itens[index];
    const textoNormalizado = normalizarTexto(texto).trim();
    const unidade = unidades.find((item) => (
      [item.sigla, item.nome, `${item.sigla || ''} - ${item.nome || ''}`]
        .some((valor) => normalizarTexto(valor).trim() === textoNormalizado)
    ));
    const unidadeSigla = unidade?.sigla || unidade?.nome || texto;
    limparErroItem(index, 'unidade');
    atualizarCamposItem(index, {
      unidade_id: unidade?.id || null,
      unidade_sigla: unidadeSigla,
      unidade_sigla_manual: itemAtual?.manual ? unidadeSigla : (unidade ? '' : texto)
    });
  }

  function atualizarCamposItem(index, campos) {
    setItens((atual) =>
      atual.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        return sincronizarItemComRateios({
          ...item,
          ...campos
        });
      })
    );
  }

  function abrirModalApropriacao(index) {
    const item = itens[index];
    if (!parseQuantidade(item?.quantidade)) {
      reprovarItem(index, 'quantidade', 'Informe a quantidade do item antes de distribuir a apropriacao.');
      return;
    }

    const rateiosExistentes = normalizarRateiosEntrada(item);
    setErroRateiosModal('');
    setModalApropriacaoIndex(index);
    setRateiosModal(
      rateiosExistentes.length
        ? rateiosExistentes
        : [criarRateioBase(String(item.quantidade || ''))]
    );
  }

  function fecharModalApropriacao() {
    setModalApropriacaoIndex(null);
    setRateiosModal([]);
    setErroRateiosModal('');
  }

  function atualizarRateioModal(rateioIndex, campo, valor) {
    setErroRateiosModal('');
    setRateiosModal((atual) =>
      atual.map((rateio, index) =>
        index === rateioIndex
          ? {
              ...rateio,
              [campo]: valor
            }
          : rateio
      )
    );
  }

  function adicionarRateioModal() {
    setErroRateiosModal('');
    setRateiosModal((atual) => [...atual, criarRateioBase('')]);
  }

  function removerRateioModal(rateioIndex) {
    setErroRateiosModal('');
    setRateiosModal((atual) => atual.filter((_, index) => index !== rateioIndex));
  }

  function salvarRateiosItem() {
    if (modalApropriacaoIndex === null || !itemModalAtual) {
      return;
    }

    const itemComRateios = sincronizarItemComRateios({
      ...itemModalAtual,
      apropriacoes: rateiosModal
    });
    const validacao = validarRateiosItem(itemComRateios);

    if (!validacao.ok) {
      // A frase fica NO formulário do rateio (linha .form-error junto dos
      // controles), com a mesma condição e a mesma mensagem de antes.
      setErroRateiosModal(validacao.mensagem);
      return;
    }

    atualizarCamposItem(modalApropriacaoIndex, {
      apropriacoes: rateiosModal
    });
    limparErroItem(modalApropriacaoIndex, 'apropriacao');
    fecharModalApropriacao();
  }

  function removerItem(index) {
    setItens((atual) => atual.filter((_, itemIndex) => itemIndex !== index));
    setErrosItem({});
    setUploadingArquivos((atual) => {
      const proximo = {};
      Object.entries(atual).forEach(([chave, valor]) => {
        const itemIndex = Number(chave);
        if (itemIndex === index) {
          return;
        }

        proximo[itemIndex > index ? itemIndex - 1 : itemIndex] = valor;
      });
      return proximo;
    });

    if (modalApropriacaoIndex === index) {
      fecharModalApropriacao();
    } else if (modalApropriacaoIndex !== null && modalApropriacaoIndex > index) {
      setModalApropriacaoIndex((atual) => (atual !== null ? atual - 1 : atual));
    }
  }

  /*
    Função SEM chamador na tela (nenhum botão a aciona hoje) — mantida por
    ser capacidade existente, migrada junto: a pergunta agora é a do sistema,
    com o retorno desestruturado (R21) e o alvo fixado antes do `await` (R26).
    A chamada a `setItensSelecionados([])` que existia aqui referenciava um
    estado que NÃO EXISTE neste arquivo: se algum dia esta função fosse
    ligada a um botão, ela quebraria com ReferenceError. Está no relatório.
  */
  async function limparLista() {
    const totalItensAlvo = itens.length;
    const { ok } = await confirmar({
      titulo: 'Remover todos os itens',
      mensagem: `Deseja remover todos os itens da lista atual? São ${totalItensAlvo} item(ns), com quantidades, valores e rateios já preenchidos.`,
      rotuloConfirmar: 'Remover todos',
      destrutiva: true
    });
    if (!ok) {
      return;
    }

    setItens([]);
    setErrosItem({});
    setUploadingArquivos({});
    fecharModalApropriacao();
  }

  async function handleSelecionarArquivo(index, file) {
    if (!file) {
      return;
    }

    setUploadingArquivos((atual) => ({ ...atual, [index]: true }));

    try {
      const data = await uploadAnexoTemporarioCompra(file);
      atualizarCamposItem(index, {
        arquivo_url: data?.arquivo_url || '',
        arquivo_nome_original: data?.arquivo_nome_original || file.name || ''
      });
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao enviar arquivo do item');
    } finally {
      setUploadingArquivos((atual) => {
        const proximo = { ...atual };
        delete proximo[index];
        return proximo;
      });
    }
  }

  function alternarFormaPagamento(formaId) {
    const id = String(formaId);
    limparErroCampo('forma_pagamento');
    setFormaPagamentoIds((atual) =>
      atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]
    );
  }

  async function handleSelecionarAnexoCabecalho(file, tipoDocumento = 'NOTA_FISCAL_GUIA') {
    if (!file) {
      return;
    }

    setUploadingAnexoCabecalho(true);
    try {
      const data = await uploadAnexoTemporarioCompra(file);
      if (tipoDocumento === 'BOLETO') limparErroCampo('boleto');
      setAnexosCabecalho((atual) => [
        ...atual,
        {
          arquivo_url: data?.arquivo_url || '',
          arquivo_nome_original: data?.arquivo_nome_original || file.name || '',
          tipo_documento: tipoDocumento
        }
      ]);
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao enviar anexo da compra direta');
    } finally {
      setUploadingAnexoCabecalho(false);
    }
  }

  function removerAnexoCabecalho(index) {
    setAnexosCabecalho((atual) => atual.filter((_, itemIndex) => itemIndex !== index));
  }

  function removerArquivoItem(index) {
    atualizarCamposItem(index, {
      arquivo_url: '',
      arquivo_nome_original: ''
    });
  }

  async function abrirArquivoItem(item) {
    try {
      const url = await obterUrlAssinadaCompra(item.arquivo_url);
      if (!url) {
        avisar.alerta('Arquivo não encontrado.');
        return;
      }

      setPreviewArquivo(await criarPreviewCompra({
        title: 'Arquivo do item',
        name: item.arquivo_nome_original || 'Arquivo anexado',
        url
      }));
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao abrir arquivo do item');
    }
  }

  async function handleSalvar() {
    if (!obraId) {
      reprovarCampo('obra_id', 'Selecione a obra.');
      return;
    }

    if (modoCompraDireta && !necessarioPara) {
      reprovarCampo('necessario_para', 'Informe a data de vencimento.');
      return;
    }

    if (modoCompraDireta && formaPagamentoIds.length === 0) {
      reprovarCampo('forma_pagamento', 'Selecione ao menos uma forma de pagamento.');
      return;
    }

    if (modoCompraDireta && compraDiretaTemBoleto && anexosBoletoCabecalho.length === 0) {
      reprovarCampo('boleto', 'Anexe o boleto para continuar com forma de pagamento Boleto.');
      return;
    }

    if (!itens.length) {
      // Não existe campo para receber esta frase: a lista está vazia.
      setErrosCampo({});
      setErrosItem({});
      avisar.alerta('Adicione ao menos um item.');
      return;
    }

    for (let index = 0; index < itens.length; index += 1) {
      const item = itens[index];
      if (!item.quantidade) {
        reprovarItem(index, 'quantidade', `Item ${index + 1}: informe a quantidade.`);
        return;
      }
      if (!item.unidade_id && !String(item.unidade_sigla || item.unidade_sigla_manual || '').trim()) {
        reprovarItem(index, 'unidade', `Item ${index + 1}: informe a unidade.`);
        return;
      }
      if (modoCompraDireta && parseValorMonetario(item.valor_unitario) <= 0) {
        reprovarItem(index, 'valor_unitario', `Item ${index + 1}: informe o valor unitario.`);
        return;
      }
      if (!modoCompraDireta && !item.necessario_para) {
        reprovarItem(index, 'necessario_para', `Item ${index + 1}: o prazo de entrega é obrigatório.`);
        return;
      }
      const validacaoRateios = validarRateiosItem(item);
      if (!validacaoRateios.ok) {
        reprovarItem(index, 'apropriacao', `Item ${index + 1}: ${validacaoRateios.mensagem}`);
        return;
      }
      if (item.manual) {
        if (!item.nome_manual || !item.unidade_sigla_manual) {
          reprovarItem(index, 'insumo', `Item manual ${index + 1}: informe nome e unidade.`);
          return;
        }
      } else {
        if (!item.insumo_id) {
          reprovarItem(index, 'insumo', `Item ${index + 1}: informe o insumo.`);
          return;
        }
      }
    }

    if (modoCompraDireta && descontoCompraDireta > valorBrutoCompraDireta) {
      reprovarCampo('desconto_total', 'O desconto concedido nao pode ser maior que o valor bruto dos itens.');
      return;
    }

    if (modoCompraDireta && freteTipo !== 'SEM_FRETE' && freteValorNumero <= 0) {
      reprovarCampo(
        'frete_valor',
        freteTipo === 'EMBUTIDO'
          ? 'Informe um valor maior que zero para o frete embutido.'
          : 'Informe um valor maior que zero para o frete pago a terceiro.'
      );
      return;
    }

    if (modoCompraDireta && freteTipo === 'TERCEIRO') {
      if (!freteParceiroId) {
        reprovarCampo('frete_parceiro', 'Selecione o credor responsável pelo frete.');
        return;
      }
      if (!freteDataVencimento) {
        reprovarCampo('frete_data_vencimento', 'Informe a data para pagamento do frete.');
        return;
      }
      if (!String(freteDadosPagamento || '').trim()) {
        reprovarCampo('frete_dados_pagamento', 'Informe os dados para pagamento do frete.');
        return;
      }
    }

    setErrosCampo({});
    setErrosItem({});

    try {
      setLoading(true);

      const obraSelecionada = obras.find((obra) => Number(obra.id) === Number(obraId));
      const itensNormalizados = itens.map((item) => {
        const apropriacoesItem = normalizarRateiosEntrada(item).map((rateio) => ({
          apropriacao_id: Number(rateio.apropriacao_id),
          quantidade_apropriada: Number(rateio.quantidade_apropriada)
        }));

        return {
          ...sincronizarItemComRateios(item),
          apropriacoes: apropriacoesItem,
          apropriacao_id: apropriacoesItem[0]?.apropriacao_id || null
        };
      });

      const payload = {
        obra_id: obraId,
        tipo_solicitacao_id: modoCompraDireta ? tipoSolicitacaoIdContexto || null : undefined,
        origem: modoCompraDireta ? 'COMPRA_DIRETA' : undefined,
        parceiro_id: modoCompraDireta ? parceiroId || null : undefined,
        necessario_para: necessarioPara || null,
        observacoes: observacoes || null,
        dados_pagamento: modoCompraDireta ? dadosPagamento || null : undefined,
        desconto_total: modoCompraDireta ? descontoCompraDireta : undefined,
        frete_tipo: modoCompraDireta ? freteTipo : undefined,
        frete_valor: modoCompraDireta && freteTipo !== 'SEM_FRETE' ? freteValorNumero : undefined,
        frete_data_vencimento: modoCompraDireta && freteTipo === 'TERCEIRO' ? freteDataVencimento : undefined,
        frete_parceiro_id: modoCompraDireta && freteTipo === 'TERCEIRO' ? Number(freteParceiroId) : undefined,
        frete_dados_pagamento: modoCompraDireta && freteTipo === 'TERCEIRO'
          ? String(freteDadosPagamento || '').trim()
          : undefined,
        forma_pagamento_ids: modoCompraDireta ? formaPagamentoIds.map((id) => Number(id)).filter((id) => id > 0) : undefined,
        anexos_cabecalho: modoCompraDireta ? anexosCabecalho : undefined,
        itens: itensNormalizados.map((item) => ({
          manual: Boolean(item.manual),
          insumo_id: item.manual ? null : item.insumo_id,
          unidade_id: item.manual || item.unidade_sigla_manual ? null : item.unidade_id,
          apropriacao_id: item.apropriacao_id,
          apropriacoes: item.apropriacoes,
          quantidade: Number(item.quantidade),
          valor_unitario: modoCompraDireta ? parseValorMonetario(item.valor_unitario) : undefined,
          valor_total: modoCompraDireta ? calcularValorTotalItem(item) : undefined,
          especificacao: item.especificacao || '',
          necessario_para: item.necessario_para || necessarioPara || null,
          link_produto: item.link_produto || null,
          arquivo_url: item.arquivo_url || null,
          arquivo_nome_original: item.arquivo_nome_original || null,
          nome_manual: item.manual ? item.nome_manual : null,
          unidade_sigla_manual: item.unidade_sigla_manual
            || (item.unidade_id ? null : item.unidade_sigla)
        }))
      };

      const resumo = {
        obra_nome: obraSelecionada?.nome || '',
        obra_codigo: obraSelecionada?.codigo || '',
        solicitante_nome: user?.nome || '',
        credor_nome: parceiroSelecionado ? formatarCredor(parceiroSelecionado) : parceiroBusca || '',
        formas_pagamento: modoCompraDireta
          ? formasPagamentoSelecionadas.map((forma) => ({
              id: forma.id,
              nome: formatarFormaPagamento(forma),
              codigo: forma.codigo || '',
              gera_boleto: Boolean(forma.gera_boleto)
            }))
          : [],
        valor_bruto: modoCompraDireta ? valorBrutoCompraDireta : null,
        desconto_total: modoCompraDireta ? descontoCompraDireta : null,
        valor_total_itens: modoCompraDireta ? valorTotalCompraDireta : null,
        frete_tipo: modoCompraDireta ? freteTipo : null,
        frete_valor: modoCompraDireta && freteTipo !== 'SEM_FRETE' ? freteValorNumero : 0,
        frete_credor_nome: modoCompraDireta && freteTipo === 'TERCEIRO'
          ? (freteCredorSelecionado ? formatarCredor(freteCredorSelecionado) : freteParceiroBusca || '')
          : '',
        frete_data_vencimento: modoCompraDireta && freteTipo === 'TERCEIRO' ? freteDataVencimento : null,
        frete_dados_pagamento: modoCompraDireta && freteTipo === 'TERCEIRO' ? freteDadosPagamento : '',
        valor_total: modoCompraDireta ? valorTotalSolicitacaoCompraDireta : null,
        dados_pagamento: modoCompraDireta ? dadosPagamento || '' : '',
        anexos_cabecalho: modoCompraDireta ? anexosCabecalho : [],
        itens: itensNormalizados.map((item) => ({
          ...item,
          valor_unitario: modoCompraDireta ? parseValorMonetario(item.valor_unitario) : undefined,
          valor_total: modoCompraDireta ? calcularValorTotalItem(item) : undefined,
          apropriacao_linhas: montarLinhasResumoApropriacao(item, apropriacoes)
        }))
      };

      const contexto = modoCompraDireta
        ? {
            tipo_solicitacao_id: tipoSolicitacaoIdContexto || null,
            area_responsavel: areaResponsavelContexto || ''
          }
        : undefined;

      writeComprasDraft(draftKey, { payload, resumo, contexto }, user?.id);
      navigate(modoCompraDireta ? '/solicitacoes-compra-direta/revisar' : '/solicitacoes-compra/revisar');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao preparar revisão da solicitação');
    } finally {
      setLoading(false);
    }
  }

  const modalCredorVisivel = modoCompraDireta && modalCredorAberto;
  const modalApropriacaoVisivel = modalApropriacaoIndex !== null && Boolean(itemModalAtual);

  // A faixa tem um dono so: com um modal aberto ela vive dentro dele (senao o
  // aviso ficaria atras do fundo escuro); fora deles, no topo da pagina.
  const faixaAvisos = <Avisos avisos={avisos} aoFechar={fechar} />;
  const algumModalAberto = modalCredorVisivel || modalManualAberto || modalApropriacaoVisivel;

  const estiloFreteAtivo = {
    background: 'var(--sem-info-bg)',
    borderColor: 'var(--sem-info-border)',
    color: 'var(--sem-info)'
  };

  function renderOpcaoFrete(tipo, rotulo) {
    const ativo = freteTipo === tipo;
    return (
      <button
        type="button"
        className="btn btn-outline"
        style={ativo ? estiloFreteAtivo : undefined}
        onClick={() => alterarFreteTipo(ativo ? 'SEM_FRETE' : tipo)}
        aria-pressed={ativo}
      >
        <span
          className="flex h-4 w-4 items-center justify-center rounded border"
          style={ativo
            ? { borderColor: 'var(--c-primary)', background: 'var(--c-primary)', color: 'var(--c-surface)' }
            : { borderColor: 'var(--c-border)' }}
          aria-hidden="true"
        >
          {ativo ? '✓' : ''}
        </span>
        {rotulo}
      </button>
    );
  }

  return (
    <Pagina className="page-compra-nova">
      {/* C3: tela de REGISTRO — a seta de voltar à esquerda da faixa é a
          affordance primária de retorno à listagem, nos dois modos. */}
      <PageHeader
        titulo={modoCompraDireta ? 'Compra Direta' : 'Nova Solicitação de Compra'}
        descricao={modoCompraDireta
          ? 'Informe os itens ja comprados, valores, notas fiscais e apropriacoes para abrir a solicitacao de pagamento.'
          : 'Monte os itens da compra e distribua a apropriacao por item antes de enviar.'}
        voltar={{ to: '/solicitacoes-compra', title: 'Voltar para solicitações de compra' }}
      />

      {!algumModalAberto && faixaAvisos}

      {/*
        R9 (revista em 04/09) — FORMULÁRIO INLINE. Esta tela EXISTE para
        cadastrar a compra: tirando o formulário não sobra tela nenhuma. Os
        blocos abaixo são os MESMOS grupos que a tela já tinha, na MESMA
        ordem; nada foi reagrupado e nada nasce recolhido.
      */}
      <BlocoConteudo titulo="Dados gerais" variante="primario" cor="var(--sem-info)">
        <FormSecao colunas={2}>
          <CampoForm label="Obra" obrigatorio linha erro={errosCampo.obra_id}>
            <ApropriacaoAutocomplete
              value={obraId}
              options={obras}
              onChange={(valor) => { limparErroCampo('obra_id'); setObraId(valor); }}
              placeholder="Buscar obra por código ou nome..."
              inputClassName="input w-full"
            />
          </CampoForm>

          <CampoForm label="Solicitante">
            <input className="input" value={user?.nome || ''} disabled />
          </CampoForm>

          <CampoForm
            label={modoCompraDireta ? 'Data de vencimento' : 'Necessário para'}
            obrigatorio={modoCompraDireta}
            erro={errosCampo.necessario_para}
          >
            <DateInputBR
              className="input"
              value={necessarioPara}
              onChange={(event) => { limparErroCampo('necessario_para'); setNecessarioPara(event.target.value); }}
              required={modoCompraDireta}
            />
          </CampoForm>

          {modoCompraDireta && (
            /* Não usa `CampoForm`: o menu de marcação é feito de <label>, e
               label dentro de label é HTML inválido. Mesmas classes .form-*. */
            <div className="form-group form-campo--linha">
              <span className="form-label form-label--required">Formas de pagamento</span>
              <div className="relative" ref={formasPagamentoRef}>
                <button
                  type="button"
                  className="input flex w-full cursor-pointer items-center justify-between gap-3 text-left"
                  aria-expanded={formasPagamentoAberto}
                  onClick={() => setFormasPagamentoAberto((aberto) => !aberto)}
                >
                  <span className="min-w-0 truncate">{resumoFormasPagamento}</span>
                  <svg className={`h-4 w-4 shrink-0 transition${formasPagamentoAberto ? ' rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="m7 10 5 5 5-5" />
                  </svg>
                </button>
                {formasPagamentoAberto && (
                <div className="absolute left-0 right-0 top-full z-dropdown mt-1 max-h-64 overflow-y-auto rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-1 shadow-xl">
                  {formasPagamento.map((forma) => {
                    const selecionada = formaPagamentoIds.includes(String(forma.id));
                    const boleto = formaPagamentoEhBoleto(forma);
                    return (
                      <label
                        key={forma.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--c-text)] hover:bg-[var(--ui-surface-2)]"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={selecionada}
                          onChange={() => alternarFormaPagamento(forma.id)}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">{formatarFormaPagamento(forma)}</span>
                        {boleto && <span className="shrink-0 text-xs text-[var(--sem-warning)]">Exige anexo</span>}
                      </label>
                    );
                  })}
                </div>
                )}
              </div>
              <ErroCampo mensagem={errosCampo.forma_pagamento} />
              {formasPagamento.length === 0 && (
                <div
                  className="mt-2 rounded-xl border px-3 py-2 text-sm"
                  style={{
                    borderColor: 'var(--sem-warning-border)',
                    background: 'var(--sem-warning-bg)',
                    color: 'var(--sem-warning)'
                  }}
                >
                  Nenhuma forma de pagamento ativa foi encontrada. Verifique os cadastros financeiros.
                </div>
              )}
            </div>
          )}

          {modoCompraDireta && (
            <CampoForm label="Credor" linha erro={errosCampo.credor}>
              <div className="flex flex-wrap gap-2">
                <div ref={campoCredorRef} className="relative min-w-0 flex-1 app-busca">
                  <input
                    className="input w-full"
                    value={parceiroBusca}
                    onChange={(event) => {
                      buscaCredorRequestRef.current += 1;
                      limparErroCampo('credor');
                      setParceiroBusca(event.target.value);
                      setParceiroId('');
                      setAutocompleteCredorAberto(true);
                    }}
                    onFocus={() => setAutocompleteCredorAberto(true)}
                    onKeyDown={tratarTecladoCredor}
                    placeholder="Digite nome, CPF ou CNPJ"
                    autoComplete="off"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={autocompleteCredorAberto}
                    aria-controls="compra-direta-credores-opcoes"
                  />

                  {autocompleteCredorAberto && !parceiroId && String(parceiroBusca || '').trim().length >= 2 && (
                    <div
                      id="compra-direta-credores-opcoes"
                      className="absolute left-0 right-0 top-full z-dropdown mt-1 max-h-64 overflow-y-auto rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-1 shadow-xl"
                      role="listbox"
                    >
                      {buscandoParceiros && (
                        <div className="px-3 py-2 text-sm text-[var(--c-muted)]">Buscando credores...</div>
                      )}

                      {!buscandoParceiros && erroBuscaCredor && (
                        <div className="px-3 py-2 text-sm text-[var(--sem-danger)]">{erroBuscaCredor}</div>
                      )}

                      {!buscandoParceiros && !erroBuscaCredor && parceiros.length === 0 && (
                        <div className="px-3 py-2 text-sm text-[var(--c-muted)]">Nenhum credor encontrado.</div>
                      )}

                      {!buscandoParceiros && !erroBuscaCredor && parceiros.map((parceiro, index) => (
                        <button
                          key={parceiro.id}
                          type="button"
                          className="w-full rounded-md px-3 py-2 text-left text-sm transition-colors"
                          style={index === credorAtivoIndex
                            ? { background: 'var(--c-primary)', color: 'var(--c-surface)' }
                            : { color: 'var(--c-text)' }}
                          onMouseEnter={() => setCredorAtivoIndex(index)}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            selecionarCredorCompraDireta(parceiro);
                          }}
                          role="option"
                          aria-selected={index === credorAtivoIndex}
                        >
                          <span className="block truncate font-medium">
                            {parceiro.nome || parceiro.razao_social || `Credor ${parceiro.id}`}
                          </span>
                          {parceiro.cpf_cnpj && (
                            <span className="block truncate text-xs" style={{ opacity: 0.8 }}>
                              {parceiro.cpf_cnpj}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-outline shrink-0"
                  onClick={() => setModalCredorAberto(true)}
                  title="Cadastrar novo credor"
                  aria-label="Cadastrar novo credor"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5M11 8v6m-3-3h6" />
                  </svg>
                </button>
              </div>
              {parceiroId && (
                <span className="text-sm text-[var(--sem-success)]">
                  Credor selecionado: <strong>{parceiroBusca || formatarCredor(parceiroSelecionado)}</strong>
                </span>
              )}
            </CampoForm>
          )}

          <CampoForm label="Observações da compra" tipo="observacao">
            <textarea
              className="input"
              rows={3}
              value={observacoes}
              onChange={(event) => setObservacoes(event.target.value)}
              placeholder="Informações úteis para conferência ou pagamento"
            />
          </CampoForm>

          {modoCompraDireta && (
            <CampoForm label="Dados para pagamento" tipo="observacao">
              <textarea
                className="input"
                rows={3}
                value={dadosPagamento}
                onChange={(event) => setDadosPagamento(event.target.value)}
                placeholder="Informe linha digitável, PIX, banco/agência/conta ou orientacoes para o financeiro."
              />
            </CampoForm>
          )}
        </FormSecao>
      </BlocoConteudo>

      {modoCompraDireta && (
        <BlocoConteudo
          titulo="Condições comerciais e comprovantes"
          descricao="Registre descontos, tratamento do frete e os documentos que comprovam a despesa."
        >
          <FormSecao legenda="Desconto" colunas={2}>
            <CampoForm label="Desconto concedido pelo fornecedor" erro={errosCampo.desconto_total}>
              <input
                className="input input-moeda"
                value={descontoTotal}
                onChange={(event) => { limparErroCampo('desconto_total'); setDescontoTotal(event.target.value); }}
                placeholder="R$ 0,00"
              />
            </CampoForm>
          </FormSecao>

          <FormSecao legenda="Frete" colunas={2}>
            <div className="form-group form-campo--linha">
              <span className="form-label">Tratamento do frete</span>
              <span className="form-hint">
                Informe se o frete será pago ao credor principal ou separadamente a outro credor.
              </span>
              <div className="flex flex-wrap items-center gap-2" aria-label="Tratamento do frete">
                {renderOpcaoFrete('EMBUTIDO', 'Embutido')}
                {renderOpcaoFrete('TERCEIRO', 'Pago a terceiro')}
                {freteTipo === 'TERCEIRO' && (
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold"
                    style={{ background: 'var(--sem-warning-bg)', color: 'var(--sem-warning)' }}
                  >
                    Gera título separado
                  </span>
                )}
              </div>
            </div>

            {freteTipo === 'TERCEIRO' && (
              <div
                className="form-campo--linha rounded-lg border px-3 py-2 text-xs"
                style={{
                  borderColor: 'var(--sem-warning-border)',
                  background: 'var(--sem-warning-bg)',
                  color: 'var(--sem-warning)'
                }}
              >
                O frete ficará disponível em Contas a Pagar para geração de título separado.
              </div>
            )}

            {freteTipo !== 'SEM_FRETE' && (
              <CampoForm
                label="Valor do frete"
                obrigatorio
                erro={errosCampo.frete_valor}
                hint={freteTipo === 'EMBUTIDO'
                  ? 'Será somado à compra e pago ao credor principal no mesmo título.'
                  : 'Será somado à solicitação e separado do credor principal.'}
              >
                <input
                  className="input input-moeda"
                  value={freteValor}
                  onChange={(event) => { limparErroCampo('frete_valor'); setFreteValor(event.target.value); }}
                  placeholder="R$ 0,00"
                  inputMode="decimal"
                />
              </CampoForm>
            )}

            {freteTipo === 'TERCEIRO' && (
              <>
                <CampoForm label="Credor do frete" obrigatorio linha erro={errosCampo.frete_parceiro}>
                  <div ref={campoCredorFreteRef} className="relative">
                    <input
                      className="input w-full"
                      value={freteParceiroBusca}
                      onChange={(event) => {
                        buscaCredorFreteRequestRef.current += 1;
                        limparErroCampo('frete_parceiro');
                        setFreteParceiroBusca(event.target.value);
                        setFreteParceiroId('');
                        setAutocompleteFreteAberto(true);
                      }}
                      onFocus={() => setAutocompleteFreteAberto(true)}
                      onKeyDown={tratarTecladoCredorFrete}
                      placeholder="Digite nome, CPF ou CNPJ"
                      autoComplete="off"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={autocompleteFreteAberto}
                      aria-controls="compra-direta-frete-credores-opcoes"
                    />
                    {autocompleteFreteAberto && !freteParceiroId && String(freteParceiroBusca || '').trim().length >= 2 && (
                      <div
                        id="compra-direta-frete-credores-opcoes"
                        className="absolute left-0 right-0 top-full z-dropdown mt-1 max-h-64 overflow-y-auto rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-1 shadow-xl"
                        role="listbox"
                      >
                        {buscandoCredoresFrete && <div className="px-3 py-2 text-sm text-[var(--c-muted)]">Buscando credores...</div>}
                        {!buscandoCredoresFrete && erroBuscaCredorFrete && <div className="px-3 py-2 text-sm text-[var(--sem-danger)]">{erroBuscaCredorFrete}</div>}
                        {!buscandoCredoresFrete && !erroBuscaCredorFrete && freteParceiros.length === 0 && (
                          <div className="px-3 py-2 text-sm text-[var(--c-muted)]">Nenhum credor encontrado.</div>
                        )}
                        {!buscandoCredoresFrete && !erroBuscaCredorFrete && freteParceiros.map((parceiro, index) => (
                          <button
                            key={parceiro.id}
                            type="button"
                            className="w-full rounded-md px-3 py-2 text-left text-sm transition-colors"
                            style={index === freteCredorAtivoIndex
                              ? { background: 'var(--c-primary)', color: 'var(--c-surface)' }
                              : { color: 'var(--c-text)' }}
                            onMouseEnter={() => setFreteCredorAtivoIndex(index)}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              selecionarCredorFrete(parceiro);
                            }}
                            role="option"
                            aria-selected={index === freteCredorAtivoIndex}
                          >
                            <span className="block truncate font-medium">{parceiro.nome || parceiro.razao_social || `Credor ${parceiro.id}`}</span>
                            {parceiro.cpf_cnpj && (
                              <span className="block truncate text-xs" style={{ opacity: 0.8 }}>{parceiro.cpf_cnpj}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </CampoForm>

                <CampoForm label="Data para pagamento" obrigatorio erro={errosCampo.frete_data_vencimento}>
                  <DateInputBR
                    className="input"
                    value={freteDataVencimento}
                    onChange={(event) => { limparErroCampo('frete_data_vencimento'); setFreteDataVencimento(event.target.value); }}
                  />
                </CampoForm>

                <CampoForm
                  label="Dados para pagamento do frete"
                  obrigatorio
                  tipo="observacao"
                  erro={errosCampo.frete_dados_pagamento}
                >
                  <textarea
                    className="input"
                    rows={3}
                    value={freteDadosPagamento}
                    onChange={(event) => { limparErroCampo('frete_dados_pagamento'); setFreteDadosPagamento(event.target.value); }}
                    placeholder="Informe PIX, banco/agência/conta, linha digitável ou instruções para o financeiro."
                  />
                </CampoForm>
              </>
            )}
          </FormSecao>

          {/* Comprovantes: o gatilho do seletor de arquivo JÁ é um <label>,
              então o campo usa a casca .form-group em vez do CampoForm. */}
          <FormSecao legenda="Comprovantes da Despesa" colunas={2}>
            <div className="form-group form-campo--linha">
              <span className="form-label">Nota fiscal, guia, boleto ou comprovante relacionado à compra</span>
              <div className="flex flex-wrap gap-2">
                <label className={`btn btn-outline w-fit cursor-pointer ${uploadingAnexoCabecalho ? 'pointer-events-none opacity-60' : ''}`}>
                  <input
                    type="file"
                    className="hidden"
                    accept={HEADER_ATTACHMENT_ACCEPT}
                    onChange={(event) => {
                      const [file] = Array.from(event.target.files || []);
                      void handleSelecionarAnexoCabecalho(file, 'NOTA_FISCAL_GUIA');
                      event.target.value = '';
                    }}
                  />
                  {uploadingAnexoCabecalho ? 'Enviando...' : 'Anexar arquivos'}
                </label>
                {compraDiretaTemBoleto && (
                  <label className={`btn btn-outline w-fit cursor-pointer ${uploadingAnexoCabecalho ? 'pointer-events-none opacity-60' : ''}`}>
                    <input
                      type="file"
                      className="hidden"
                      accept={HEADER_ATTACHMENT_ACCEPT}
                      onChange={(event) => {
                        const [file] = Array.from(event.target.files || []);
                        void handleSelecionarAnexoCabecalho(file, 'BOLETO');
                        event.target.value = '';
                      }}
                    />
                    {uploadingAnexoCabecalho ? 'Enviando...' : 'Anexar boleto *'}
                  </label>
                )}
              </div>
              <ErroCampo mensagem={errosCampo.boleto} />

              {anexosCabecalho.length > 0 ? (
                <div className="mt-3 grid gap-2">
                  {anexosCabecalho.map((anexo, index) => (
                    <div
                      key={`${anexo.arquivo_url}-${index}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-sm"
                    >
                      <span className="truncate">
                        {anexo.tipo_documento === 'BOLETO' ? 'Boleto: ' : ''}
                        {anexo.arquivo_nome_original || 'Anexo da compra direta'}
                      </span>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm btn-perigo-suave"
                        onClick={() => removerAnexoCabecalho(index)}
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="form-hint">Nenhum comprovante da despesa anexado.</span>
              )}
            </div>
          </FormSecao>
        </BlocoConteudo>
      )}

      <div className="compra-nova-layout">
        <BlocoConteudo
          titulo="Insumos"
          className="compra-insumos-card"
          acoes={(
            <button type="button" className="btn btn-outline btn-sm" onClick={abrirModalItemManual}>
              Item manual
            </button>
          )}
        >
          <div className="grid gap-3">
            {/* F1: UMA busca no contexto deste bloco, ocupando a faixa dele.
                Não leva `.app-busca` porque a classe tem piso de 220px e a
                coluna de insumos do `.compra-nova-layout` mede 248px com
                recuo — o piso estouraria a largura da página. */}
            <input
              className="input w-full"
              placeholder="Buscar por nome, código ou categoria"
              value={buscaInsumo}
              onChange={(event) => setBuscaInsumo(event.target.value)}
            />

            <div className="grid max-h-96 gap-2 overflow-y-auto">
              {insumosFiltrados.map((insumo) => (
                <button
                  key={insumo.id}
                  type="button"
                  className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-3 text-left transition hover:bg-[var(--ui-surface-2)]"
                  onClick={() => adicionarInsumo(insumo)}
                >
                  <div className="font-medium">{insumo.nome}</div>
                  <div className="mt-1 text-xs text-[var(--c-muted)]">
                    {insumo.categoria?.nome || 'Sem categoria'} · {insumo.unidade_manual ? (
                      <span className="font-semibold text-[var(--sem-danger)]">{insumo.unidade_manual}</span>
                    ) : (
                      insumo.unidade?.sigla || '-'
                    )}
                  </div>
                </button>
              ))}

              {insumosFiltrados.length === 0 && (
                <div className="py-6 text-center text-sm text-[var(--c-muted)]">Nenhum insumo encontrado.</div>
              )}
            </div>
          </div>
        </BlocoConteudo>

        <BlocoConteudo
          titulo="Itens da solicitação"
          className="compra-itens-card"
          contagem={`${itens.length} item(ns)`}
          descricao={itens.length > 0
            ? `${itensPendentesApropriacao} pendente(s) de rateio fechado · limite de 300 itens`
            : 'Limite de 300 itens'}
          acoes={(
            <>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={baixarModeloItens}
                disabled={!modoCompraDireta && !obraId}
                title={!modoCompraDireta && !obraId ? 'Selecione a obra para baixar o modelo' : undefined}
              >
                {modoCompraDireta ? 'Baixar modelo Excel' : 'Baixar modelo de itens'}
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => importacaoItensInputRef.current?.click()}
                disabled={importandoItens || !obraId}
                title={!obraId ? 'Selecione a obra antes de importar' : undefined}
              >
                {importandoItens
                  ? 'Importando...'
                  : (modoCompraDireta ? 'Importar Excel' : 'Importar itens em massa')}
              </button>
              <input
                ref={importacaoItensInputRef}
                type="file"
                className="hidden"
                accept=".xlsx"
                onChange={(event) => {
                  const [file] = Array.from(event.target.files || []);
                  void handleImportarItens(file);
                  event.target.value = '';
                }}
              />
            </>
          )}
        >
          {itens.length === 0 ? (
            <div className="compra-itens-empty py-8 text-center text-sm text-[var(--c-muted)]">Adicione itens a partir da lista de insumos ou crie item manual.</div>
          ) : (
            <TabelaPadrao
              /*
                GRADE DE LANÇAMENTO, NÃO LISTA DE CONSULTA (05/09).
                A maioria das colunas aqui é campo de digitação, não dado a ler.
                Oferecer "escolher colunas" numa grade assim dá ao usuário como
                esconder o campo que ele precisa preencher — e ele não descobre por
                que o lançamento parou de funcionar. A capacidade sai DAQUI, não do
                sistema: nas 246 tabelas de consulta ela continua.
              */
              colunasConfiguraveis={false}
              colunas={[
                {
                  id: 'insumo',
                  titulo: 'Insumo',
                  // R17: o INSUMO é o que nomeia o item da solicitação.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  // Entrada de dados: o controle mora no render da coluna.
                  render: (item) => (
                    <>
                      <input
                        className="input"
                        style={item.manual
                          ? { borderColor: 'var(--sem-danger-border)', color: 'var(--sem-danger)' }
                          : undefined}
                        aria-label="Nome do insumo"
                        value={item.insumo_nome}
                        disabled={!item.manual}
                        onChange={(event) => atualizarItem(item.__indice, 'insumo_nome', event.target.value)}
                      />
                      <ErroCampo mensagem={erroDoItem(item.__indice, 'insumo')} />
                    </>
                  )
                },
                {
                  id: 'unidade',
                  titulo: 'Unidade',
                  tipo: 'codigo',
                  render: (item) => (
                    <>
                      <input
                        className="input"
                        aria-label="Unidade do item"
                        list={`unidades-item-${item.__indice}`}
                        value={item.unidade_sigla || ''}
                        maxLength={50}
                        placeholder="Digite ou selecione a UN"
                        onChange={(event) => atualizarUnidadeItem(item.__indice, event.target.value)}
                      />
                      <datalist id={`unidades-item-${item.__indice}`}>
                        {unidades.map((unidade) => (
                          <option
                            key={unidade.id || unidade.sigla}
                            value={unidade.sigla || unidade.nome}
                            label={unidade.nome && unidade.sigla ? unidade.nome : undefined}
                          />
                        ))}
                      </datalist>
                      {!item.unidade_id && item.unidade_sigla ? (
                        <p className="mt-1 text-xs text-[var(--sem-warning)]">
                          UN ainda não cadastrada; será mantida neste item para tratamento pelo GEO.
                        </p>
                      ) : null}
                      <ErroCampo mensagem={erroDoItem(item.__indice, 'unidade')} />
                    </>
                  )
                },
                {
                  id: 'quantidade',
                  titulo: 'Quantidade *',
                  tipo: 'numero',
                  render: (item) => (
                    <>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        className="input"
                        aria-label="Quantidade do item"
                        value={item.quantidade}
                        onChange={(event) => atualizarItem(item.__indice, 'quantidade', event.target.value)}
                      />
                      <ErroCampo mensagem={erroDoItem(item.__indice, 'quantidade')} />
                    </>
                  )
                },
                ...(modoCompraDireta ? [
                  {
                    id: 'valor_unitario',
                    titulo: 'Valor unitário *',
                    tipo: 'valor',
                    render: (item) => (
                      <>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          className="input"
                          aria-label="Valor unitário do item"
                          value={item.valor_unitario}
                          onChange={(event) => atualizarItem(item.__indice, 'valor_unitario', event.target.value)}
                        />
                        <ErroCampo mensagem={erroDoItem(item.__indice, 'valor_unitario')} />
                      </>
                    )
                  },
                  {
                    id: 'valor_total',
                    titulo: 'Total',
                    tipo: 'valor',
                    render: (item) => <strong>{formatarMoeda(calcularValorTotalItem(item))}</strong>
                  }
                ] : [
                  {
                    id: 'especificacao',
                    titulo: 'Especificação',
                    tipo: 'texto',
                    render: (item) => (
                      <input
                        className="input"
                        aria-label="Especificação do item"
                        value={item.especificacao}
                        onChange={(event) => atualizarItem(item.__indice, 'especificacao', event.target.value)}
                      />
                    )
                  }
                ]),
                {
                  id: 'apropriacao',
                  titulo: 'Apropriação *',
                  tipo: 'texto',
                  render: (item) => {
                    const linhasApropriacao = montarLinhasResumoApropriacao(item, apropriacoes);
                    const resumoApropriacao = calcularResumoRateios(item);

                    return (
                      <>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            {linhasApropriacao.length > 0 ? (
                              <>
                                <div className="grid gap-1 text-xs text-[var(--c-text)]">
                                  {linhasApropriacao.slice(0, 2).map((linha, linhaIndex) => (
                                    <div key={`${linha}-${linhaIndex}`} className="truncate">{linha}</div>
                                  ))}
                                  {linhasApropriacao.length > 2 && (
                                    <div className="text-[var(--c-muted)]">+{linhasApropriacao.length - 2} rateio(s)</div>
                                  )}
                                </div>
                                <div
                                  className="text-xs font-semibold"
                                  style={{ color: resumoApropriacao.fechado ? 'var(--sem-success)' : 'var(--sem-warning)' }}
                                >
                                  {resumoApropriacao.fechado ? 'Fechado' : `Saldo ${formatarQuantidade(resumoApropriacao.saldo)}`}
                                </div>
                              </>
                            ) : (
                              <span className="text-xs text-[var(--c-muted)]">Nenhuma</span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm shrink-0"
                            onClick={() => abrirModalApropriacao(item.__indice)}
                          >
                            {linhasApropriacao.length > 0 ? 'Editar' : 'Apropriar'}
                          </button>
                        </div>
                        <ErroCampo mensagem={erroDoItem(item.__indice, 'apropriacao')} />
                      </>
                    );
                  }
                },
                ...(modoCompraDireta ? [] : [
                  {
                    id: 'necessario_para',
                    titulo: 'Necessário para',
                    tipo: 'data',
                    render: (item) => (
                      <>
                        <DateInputBR
                          className="input"
                          style={!item.necessario_para ? { borderColor: 'var(--sem-danger)' } : undefined}
                          aria-label="Data em que o item é necessário"
                          value={item.necessario_para}
                          onChange={(event) => atualizarItem(item.__indice, 'necessario_para', event.target.value)}
                          required
                        />
                        <ErroCampo mensagem={erroDoItem(item.__indice, 'necessario_para')} />
                      </>
                    )
                  },
                  {
                    id: 'link_produto',
                    titulo: 'Link do produto',
                    tipo: 'texto',
                    render: (item) => (
                      <input
                        type="url"
                        className="input"
                        placeholder="https://"
                        aria-label="Link do produto"
                        value={item.link_produto}
                        onChange={(event) => atualizarItem(item.__indice, 'link_produto', event.target.value)}
                      />
                    )
                  },
                  {
                    id: 'arquivo',
                    titulo: 'Arquivo do item',
                    tipo: 'texto',
                    render: (item) => (
                      <div className="flex flex-col gap-2">
                        <label className={`btn btn-outline cursor-pointer justify-center ${uploadingArquivos[item.__indice] ? 'pointer-events-none opacity-60' : ''}`}>
                          <input
                            type="file"
                            className="hidden"
                            accept={ITEM_ATTACHMENT_ACCEPT}
                            onChange={(event) => {
                              const [file] = Array.from(event.target.files || []);
                              void handleSelecionarArquivo(item.__indice, file);
                              event.target.value = '';
                            }}
                          />
                          {uploadingArquivos[item.__indice]
                            ? 'Enviando...'
                            : item.arquivo_nome_original
                              ? 'Trocar arquivo'
                              : 'Anexar arquivo'}
                        </label>
                        <div className="text-xs text-[var(--c-muted)]">
                          {item.arquivo_nome_original || 'Sem arquivo anexado'}
                        </div>
                        {item.arquivo_url && (
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => abrirArquivoItem(item)}>
                              Abrir
                            </button>
                            <button type="button" className="btn btn-outline btn-sm btn-perigo-suave" onClick={() => removerArquivoItem(item.__indice)}>
                              Remover arquivo
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  }
                ])
              ]}
              itens={itensGrade}
              getId={(item) => `${item.manual ? 'manual' : item.insumo_id}-${item.__indice}`}
              storageKey={modoCompraDireta
                ? 'tabela:nova-solicitacao-compra:itens-direta'
                : 'tabela:nova-solicitacao-compra:itens'}
              rotuloRolagem="Itens da solicitação"
              vazio="Adicione itens a partir da lista de insumos ou crie item manual."
              urgencia={(item) => (calcularResumoRateios(item).fechado ? null : 'warning')}
              acoesLinha={(item) => (
                <button type="button" className="btn btn-outline btn-sm btn-perigo-suave" onClick={() => removerItem(item.__indice)}>
                  Remover
                </button>
              )}
              larguraAcoes={140}
            />
          )}

          <div
            className="mt-4 rounded-lg border px-4 py-3 text-sm"
            style={{
              borderColor: 'var(--sem-success-border)',
              background: 'var(--sem-success-bg)',
              color: 'var(--sem-success)'
            }}
          >
            Use o botao <strong>Apropriar</strong> em cada item para dividir a quantidade entre etapas da obra. O sistema mostra total, distribuido e saldo em tempo real.
          </div>

          {/* C5: UM primário sólido, secundário em contorno, destrutiva apartada. */}
          <div className="app-actionbar mt-6">
            <button type="button" className="btn btn-outline btn-perigo-suave" onClick={limparRascunho}>
              Limpar rascunho
            </button>
            <span className="app-actionbar-apartada">
              <button type="button" className="btn btn-outline" onClick={() => navigate('/solicitacoes-compra')}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={handleSalvar} disabled={loading}>{loading ? 'Preparando...' : 'Revisar solicitação'}</button>
            </span>
          </div>
        </BlocoConteudo>
      </div>

      {/*
        R9/R27 — os três modais abaixo INTERROMPEM o trabalho principal
        (montar a compra): cadastrar um credor no meio da solicitação é o
        exemplo literal da regra. O que mudou foi a casca: era `fixed inset-0`
        à mão, com painel de altura livre e sem rolagem própria. Agora é o
        `OverlayModal` do sistema, que resolve empilhamento, trava de rolagem,
        Escape, foco e a rolagem do corpo com cabeçalho e rodapé FIXOS (R27).
      */}
      <OverlayModal
        aberto={modalManualAberto}
        rotulo="Novo item manual"
        largura="var(--modal-max-w-lg, 960px)"
        onFechar={fecharModalItemManual}
      >
        <div data-modal="cabecalho" className="app-bloco-head">
          <h2 className="app-bloco-titulo">Novo item manual</h2>
          <span className="app-bloco-acoes">
            <button type="button" className="btn btn-outline btn-sm" onClick={fecharModalItemManual}>Fechar</button>
          </span>
        </div>

        <div className="p-4">
          {modalManualAberto && faixaAvisos}
          <FormSecao colunas={2}>
            <CampoForm label="Nome" obrigatorio linha erro={errosCampo.item_manual}>
              <input
                className="input"
                value={itemManual.nome_manual}
                onChange={(event) => {
                  limparErroCampo('item_manual');
                  setItemManual((atual) => ({ ...atual, nome_manual: event.target.value }));
                }}
              />
            </CampoForm>
            <CampoForm label="Unidade" obrigatorio erro={errosCampo.item_manual}>
              <select
                className="input"
                value={itemManual.unidade_id}
                onChange={(event) => {
                  limparErroCampo('item_manual');
                  const unidade = unidades.find((item) => String(item.id) === String(event.target.value));
                  setItemManual((atual) => ({
                    ...atual,
                    unidade_id: unidade?.id ? String(unidade.id) : '',
                    unidade_sigla_manual: unidade?.sigla || unidade?.nome || ''
                  }));
                }}
              >
                <option value="">Selecione</option>
                {unidades.map((unidade) => (
                  <option key={unidade.id || unidade.sigla} value={unidade.id}>
                    {unidade.sigla || unidade.nome} {unidade.nome && unidade.sigla ? `- ${unidade.nome}` : ''}
                  </option>
                ))}
              </select>
              {!unidades.length ? (
                <span className="form-hint">Nenhuma unidade cadastrada encontrada.</span>
              ) : null}
            </CampoForm>
            <CampoForm label="Quantidade" obrigatorio>
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="input"
                value={itemManual.quantidade}
                onChange={(event) => atualizarQuantidadeItemManual(event.target.value)}
              />
            </CampoForm>
            {!modoCompraDireta && (
              <CampoForm label="Especificação" tipo="observacao">
                <textarea
                  className="input"
                  rows={4}
                  value={itemManual.especificacao}
                  onChange={(event) => setItemManual((atual) => ({ ...atual, especificacao: event.target.value }))}
                />
              </CampoForm>
            )}
          </FormSecao>

          <BlocoConteudo
            titulo="Apropriação do item"
            variante="secundario"
            descricao="Distribua toda a quantidade do item antes de adicioná-lo à solicitação."
            acoes={(
              <button type="button" className="btn btn-outline btn-sm" onClick={adicionarRateioItemManual}>
                Adicionar apropriação
              </button>
            )}
          >
            <StatGrid colunas={3}>
              <StatTile label="Total" valor={formatarQuantidade(resumoApropriacaoItemManual.total)} />
              <StatTile label="Distribuído" valor={formatarQuantidade(resumoApropriacaoItemManual.distribuido)} />
              <StatTile
                label="Saldo"
                valor={formatarQuantidade(resumoApropriacaoItemManual.saldo)}
                tom={resumoApropriacaoItemManual.fechado ? 'success' : 'warning'}
              />
            </StatGrid>

            <div className="mt-3 grid gap-3">
              {rateiosItemManual.map((rateio, index) => (
                <div
                  key={`rateio-item-manual-${index}`}
                  className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-3"
                >
                  <FormSecao colunas={3}>
                    <CampoForm label="Apropriação" span={2}>
                      <ApropriacaoAutocomplete
                        value={rateio.apropriacao_id}
                        options={apropriacoes}
                        onChange={(id) => atualizarRateioItemManual(index, 'apropriacao_id', id)}
                      />
                    </CampoForm>
                    <CampoForm label="Quantidade apropriada">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        className="input"
                        value={rateio.quantidade_apropriada}
                        onChange={(event) => atualizarRateioItemManual(index, 'quantidade_apropriada', event.target.value)}
                      />
                    </CampoForm>
                  </FormSecao>
                  <div className="app-actionbar">
                    <button
                      type="button"
                      className="btn btn-outline btn-sm btn-perigo-suave"
                      onClick={() => removerRateioItemManual(index)}
                      disabled={rateiosItemManual.length <= 1}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <ErroCampo mensagem={erroRateiosItemManual} />
          </BlocoConteudo>
        </div>

        <div data-modal="rodape" className="app-actionbar p-4">
          <span className="app-actionbar-apartada">
            <button type="button" className="btn btn-outline" onClick={fecharModalItemManual}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={adicionarItemManual}>Adicionar</button>
          </span>
        </div>
      </OverlayModal>

      <OverlayModal
        aberto={modalCredorVisivel}
        rotulo="Cadastrar Credor"
        largura="var(--modal-max-w-md, 680px)"
        onFechar={() => setModalCredorAberto(false)}
      >
        <div data-modal="cabecalho" className="app-bloco-head">
          <h2 className="app-bloco-titulo">Cadastrar Credor</h2>
          <span className="app-bloco-acoes">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setModalCredorAberto(false)}>
              Fechar
            </button>
          </span>
        </div>

        <div className="p-4">
          {modalCredorVisivel && faixaAvisos}

          <FormSecao colunas={2}>
            <CampoForm label="CPF/CNPJ" erro={errosCampo.credor_cpf_cnpj}>
              <input
                className="input"
                value={novoCredor.cpf_cnpj}
                onChange={(event) => {
                  limparErroCampo('credor_cpf_cnpj');
                  setNovoCredor((atual) => ({ ...atual, cpf_cnpj: maskCpfCnpj(event.target.value) }));
                }}
                inputMode="numeric"
                maxLength={18}
              />
            </CampoForm>
            <CampoForm label="Nome" obrigatorio erro={errosCampo.credor_nome}>
              <input
                className="input"
                value={novoCredor.nome}
                onChange={(event) => {
                  limparErroCampo('credor_nome');
                  setNovoCredor((atual) => ({ ...atual, nome: event.target.value }));
                }}
              />
            </CampoForm>
            <CampoForm label="Telefone">
              <input
                className="input"
                value={novoCredor.telefone}
                onChange={(event) => setNovoCredor((atual) => ({ ...atual, telefone: event.target.value }))}
              />
            </CampoForm>
            <CampoForm label="E-mail">
              <input
                type="email"
                className="input"
                value={novoCredor.email}
                onChange={(event) => setNovoCredor((atual) => ({ ...atual, email: event.target.value }))}
              />
            </CampoForm>
          </FormSecao>
        </div>

        <div data-modal="rodape" className="app-actionbar p-4">
          <span className="app-actionbar-apartada">
            <button type="button" className="btn btn-outline" onClick={() => setModalCredorAberto(false)}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={cadastrarCredorCompraDireta} disabled={salvandoCredor}>
              {salvandoCredor ? 'Salvando...' : 'Salvar credor'}
            </button>
          </span>
        </div>
      </OverlayModal>

      <OverlayModal
        aberto={modalApropriacaoVisivel}
        rotulo="Apropriar item"
        largura="var(--modal-max-w-lg, 860px)"
        onFechar={fecharModalApropriacao}
      >
        <div
          data-modal="cabecalho"
          className="app-bloco-head border-b border-[var(--c-border)] px-4 py-3 sm:px-6"
        >
          <div>
            <h2 className="app-bloco-titulo">Apropriar item</h2>
            {/* 05/09 — apoio de bloco agora é UMA linha com reticências; o
                `title` é a metade que torna a truncagem honesta (nome de
                insumo é longo e o texto inteiro fica no tooltip). */}
            <p
              className="app-bloco-lead"
              title={`${itemModalAtual?.insumo_nome || ''} · Quantidade total ${formatarQuantidade(itemModalAtual?.quantidade)}`}
            >
              {itemModalAtual?.insumo_nome} · Quantidade total {formatarQuantidade(itemModalAtual?.quantidade)}
            </p>
          </div>
          <span className="app-bloco-acoes">
            <button type="button" className="btn btn-outline btn-sm" onClick={fecharModalApropriacao}>Fechar</button>
          </span>
        </div>

        <div className="p-4">
          {modalApropriacaoVisivel && faixaAvisos}

          <StatGrid colunas={3}>
            <StatTile label="Total" valor={formatarQuantidade(resumoModalApropriacao.total)} />
            <StatTile label="Distribuído" valor={formatarQuantidade(resumoModalApropriacao.distribuido)} />
            <StatTile
              label="Saldo"
              valor={formatarQuantidade(resumoModalApropriacao.saldo)}
              tom={resumoModalApropriacao.fechado ? 'success' : 'warning'}
            />
          </StatGrid>

          <div className="mt-4 grid gap-3">
            {rateiosModal.map((rateio, rateioIndex) => (
              <div key={`rateio-${rateioIndex}`} className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
                <FormSecao colunas={3}>
                  <CampoForm label="Apropriação" span={2}>
                    <ApropriacaoAutocomplete
                      value={rateio.apropriacao_id}
                      options={apropriacoes}
                      onChange={(id) => atualizarRateioModal(rateioIndex, 'apropriacao_id', id)}
                    />
                  </CampoForm>

                  <CampoForm label="Quantidade apropriada">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      className="input"
                      value={rateio.quantidade_apropriada}
                      onChange={(event) => atualizarRateioModal(rateioIndex, 'quantidade_apropriada', event.target.value)}
                    />
                  </CampoForm>
                </FormSecao>
                <div className="app-actionbar">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm btn-perigo-suave"
                    onClick={() => removerRateioModal(rateioIndex)}
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>

          <ErroCampo mensagem={erroRateiosModal} />

          <div className="mt-4">
            <button type="button" className="btn btn-outline" onClick={adicionarRateioModal}>
              Adicionar apropriação
            </button>
          </div>
        </div>

        <div data-modal="rodape" className="app-actionbar border-t border-[var(--c-border)] p-4">
          <span className="app-actionbar-apartada">
            <button type="button" className="btn btn-outline" onClick={fecharModalApropriacao}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={salvarRateiosItem}>
              Salvar distribuição
            </button>
          </span>
        </div>
      </OverlayModal>

      <CompraPreviewModal preview={previewArquivo} onClose={() => setPreviewArquivo(null)} />
      {elementoConfirmacao}
    </Pagina>
  );
}
