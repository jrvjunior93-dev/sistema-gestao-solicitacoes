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
import ApropriacaoAutocomplete from '../../../components/ui/ApropriacaoAutocomplete';
import { useAuth } from '../../../contexts/AuthContext';
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

function calcularValorTotalItem(item) {
  return arredondarMoeda(parseQuantidade(item?.quantidade) * parseValorMonetario(item?.valor_unitario));
}

function criarItemBase(insumo) {
  return {
    insumo_id: insumo.id,
    insumo_nome: insumo.nome,
    unidade_id: insumo.unidade_id,
    unidade_sigla: insumo.unidade_manual || insumo.unidade?.sigla || '',
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
  return {
    insumo_id: null,
    insumo_nome: dados.nome_manual,
    unidade_id: dados.unidade_id || null,
    unidade_sigla: dados.unidade_sigla_manual,
    quantidade: String(dados.quantidade || '1'),
    valor_unitario: dados.valor_unitario || '',
    valor_total: dados.valor_total || '',
    especificacao: dados.especificacao || '',
    apropriacao_id: '',
    apropriacoes: [],
    necessario_para: necessarioParaPadrao || '',
    link_produto: '',
    arquivo_url: '',
    arquivo_nome_original: '',
    manual: true,
    nome_manual: dados.nome_manual,
    unidade_sigla_manual: dados.unidade_sigla_manual
  };
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
  const [itemManual, setItemManual] = useState({
    nome_manual: '',
    unidade_id: '',
    unidade_sigla_manual: '',
    quantidade: '1',
    especificacao: ''
  });

  async function carregarObras() {
    try {
      const data = await getMinhasObras({ modo: 'CRIACAO' });
      setObras(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao carregar obras');
    }
  }

  async function carregarInsumos() {
    try {
      const data = await listarInsumos();
      setInsumos(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao carregar insumos');
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
      alert(error.message || 'Erro ao carregar apropriações');
    }
  }

  function limparRascunho() {
    if (!window.confirm('Limpar todos os dados ainda nao enviados desta compra?')) return;
    suspenderAutosaveAteRef.current = Date.now() + 1500;
    removeComprasDraft(draftKey);
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
                unidade_id: item.manual ? null : item.unidade_id,
                unidade_sigla: item.manual
                  ? item.unidade_sigla_manual || item.unidade_sigla || ''
                  : resumoItem?.unidade_sigla || '',
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
                unidade_sigla_manual: item.manual
                  ? item.unidade_sigla_manual || item.unidade_sigla || ''
                  : ''
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
      valorTotalCompraDireta + (freteTipo === 'TERCEIRO' ? freteValorNumero : 0)
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
      alert('Informe o nome do credor.');
      return;
    }

    setSalvandoCredor(true);
    try {
      const parceiro = await criarCredorCompraDireta({
        ...novoCredor,
        cpf_cnpj: novoCredor.cpf_cnpj.replace(/\D/g, ''),
        telefone: novoCredor.telefone.replace(/\D/g, '')
      });
      selecionarCredorCompraDireta(parceiro);
      setNovoCredor(criarNovoCredorPadrao());
      setModalCredorAberto(false);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao cadastrar credor');
    } finally {
      setSalvandoCredor(false);
    }
  }

  async function baixarModeloItens() {
    if (!modoCompraDireta && !obraId) {
      alert('Selecione a obra antes de baixar o modelo.');
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
      alert(error.message || 'Erro ao baixar modelo de itens');
    }
  }

  async function handleImportarItens(file) {
    if (!file) {
      return;
    }

    if (!obraId) {
      alert('Selecione a obra antes de importar os itens.');
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
        alert('Nenhum item valido foi encontrado na planilha.');
        return;
      }

      if (itens.length + itensImportados.length > 300) {
        alert(`A solicitacao ficaria com ${itens.length + itensImportados.length} itens. O limite e 300 itens.`);
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
          alert(`A importacao contem insumo(s) que ja estao na solicitacao: ${nomes}. Remova as duplicidades e tente novamente.`);
          return;
        }
      }

      setItens((atual) => [...atual, ...itensImportados]);
      alert(
        `${itensImportados.length} item(ns) importado(s) para ${modoCompraDireta ? 'a compra direta' : 'a solicitacao de compra'}. Revise os dados antes de continuar.`
      );
    } catch (error) {
      console.error(error);
      const detalhes = Array.isArray(error?.erros) ? `\n${error.erros.join('\n')}` : '';
      alert(`${error.message || 'Erro ao importar itens'}${detalhes}`);
    } finally {
      importacaoEmAndamentoRef.current = false;
      setImportandoItens(false);
    }
  }

  async function adicionarInsumo(insumo) {
    if (!obraId) {
      alert('Selecione a obra antes de adicionar itens.');
      return;
    }

    const existente = itens.find((item) => !item.manual && Number(item.insumo_id) === Number(insumo.id));
    if (existente) {
      alert('Esse insumo já foi adicionado.');
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

  function adicionarItemManual() {
    if (!obraId) {
      alert('Selecione a obra antes de adicionar item manual.');
      return;
    }

    if (!itemManual.nome_manual.trim() || !itemManual.unidade_sigla_manual.trim()) {
      alert('Informe nome e unidade do item manual.');
      return;
    }

    setItens((atual) => [
      ...atual,
      criarItemManualBase(
        {
          ...itemManual,
          quantidade: itemManual.quantidade || '1'
        },
        necessarioPara
      )
    ]);
    setItemManual({ nome_manual: '', unidade_id: '', unidade_sigla_manual: '', quantidade: '1', especificacao: '' });
    setModalManualAberto(false);
  }

  function atualizarItem(index, campo, valor) {
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

  function atualizarUnidadeItem(index, unidadeIdSelecionada) {
    const unidade = unidades.find((item) => String(item.id) === String(unidadeIdSelecionada));
    atualizarCamposItem(index, {
      unidade_id: unidade?.id || null,
      unidade_sigla: unidade?.sigla || unidade?.nome || '',
      unidade_sigla_manual: unidade?.sigla || unidade?.nome || ''
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
      alert('Informe a quantidade do item antes de distribuir a apropriacao.');
      return;
    }

    const rateiosExistentes = normalizarRateiosEntrada(item);
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
  }

  function atualizarRateioModal(rateioIndex, campo, valor) {
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
    setRateiosModal((atual) => [...atual, criarRateioBase('')]);
  }

  function removerRateioModal(rateioIndex) {
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
      alert(validacao.mensagem);
      return;
    }

    atualizarCamposItem(modalApropriacaoIndex, {
      apropriacoes: rateiosModal
    });
    fecharModalApropriacao();
  }

  function removerItem(index) {
    setItens((atual) => atual.filter((_, itemIndex) => itemIndex !== index));
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

  function limparLista() {
    if (!window.confirm('Deseja remover todos os itens da lista atual?')) {
      return;
    }

    setItens([]);
    setItensSelecionados([]);
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
      alert(error.message || 'Erro ao enviar arquivo do item');
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
      alert(error.message || 'Erro ao enviar anexo da compra direta');
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
        alert('Arquivo nao encontrado.');
        return;
      }

      setPreviewArquivo(await criarPreviewCompra({
        title: 'Arquivo do item',
        name: item.arquivo_nome_original || 'Arquivo anexado',
        url
      }));
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao abrir arquivo do item');
    }
  }

  async function handleSalvar() {
    if (!obraId) {
      alert('Selecione a obra.');
      return;
    }

    if (modoCompraDireta && !necessarioPara) {
      alert('Informe a data de vencimento.');
      return;
    }

    if (modoCompraDireta && formaPagamentoIds.length === 0) {
      alert('Selecione ao menos uma forma de pagamento.');
      return;
    }

    if (modoCompraDireta && compraDiretaTemBoleto && anexosBoletoCabecalho.length === 0) {
      alert('Anexe o boleto para continuar com forma de pagamento Boleto.');
      return;
    }

    if (!itens.length) {
      alert('Adicione ao menos um item.');
      return;
    }

    for (let index = 0; index < itens.length; index += 1) {
      const item = itens[index];
      if (!item.quantidade) {
        alert(`Item ${index + 1}: informe a quantidade.`);
        return;
      }
      if (modoCompraDireta && parseValorMonetario(item.valor_unitario) <= 0) {
        alert(`Item ${index + 1}: informe o valor unitario.`);
        return;
      }
      if (!modoCompraDireta && !item.necessario_para) {
        alert(`Item ${index + 1}: o prazo de entrega é obrigatório.`);
        return;
      }
      const validacaoRateios = validarRateiosItem(item);
      if (!validacaoRateios.ok) {
        alert(`Item ${index + 1}: ${validacaoRateios.mensagem}`);
        return;
      }
      if (item.manual) {
        if (!item.nome_manual || !item.unidade_sigla_manual) {
          alert(`Item manual ${index + 1}: informe nome e unidade.`);
          return;
        }
      } else {
        if (!item.insumo_id) {
          alert(`Item ${index + 1}: informe o insumo.`);
          return;
        }
      }
    }

    if (modoCompraDireta && descontoCompraDireta > valorBrutoCompraDireta) {
      alert('O desconto concedido nao pode ser maior que o valor bruto dos itens.');
      return;
    }

    if (modoCompraDireta && freteTipo !== 'SEM_FRETE' && freteValorNumero <= 0) {
      alert(
        freteTipo === 'EMBUTIDO'
          ? 'Informe um valor maior que zero para o frete embutido.'
          : 'Informe um valor maior que zero para o frete pago a terceiro.'
      );
      return;
    }

    if (modoCompraDireta && freteTipo === 'TERCEIRO') {
      if (!freteParceiroId) {
        alert('Selecione o credor responsável pelo frete.');
        return;
      }
      if (!freteDataVencimento) {
        alert('Informe a data para pagamento do frete.');
        return;
      }
      if (!String(freteDadosPagamento || '').trim()) {
        alert('Informe os dados para pagamento do frete.');
        return;
      }
    }

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
          unidade_id: item.manual ? null : item.unidade_id,
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
          unidade_sigla_manual: item.manual ? item.unidade_sigla_manual : (item.unidade_id ? null : item.unidade_sigla)
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
      alert(error.message || 'Erro ao preparar revisão da solicitação');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page solicitacoes-page page-compra-nova">
      <div>
        <h1 className="page-title">{modoCompraDireta ? 'Compra Direta' : 'Nova Solicitação de Compra'}</h1>
        <p className="page-subtitle">
          {modoCompraDireta
            ? 'Informe os itens ja comprados, valores, notas fiscais e apropriacoes para abrir a solicitacao de pagamento.'
            : 'Monte os itens da compra e distribua a apropriacao por item antes de enviar.'}
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">Dados gerais</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="grid gap-2 xl:col-span-2">
            <label className="text-sm font-medium">Obra *</label>
            <ApropriacaoAutocomplete
              value={obraId}
              options={obras}
              onChange={setObraId}
              placeholder="Buscar obra por código ou nome..."
              inputClassName="input w-full"
              mostrarConsultaCompleta={false}
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Solicitante</label>
            <input className="input" value={user?.nome || ''} disabled />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">{modoCompraDireta ? 'Data de vencimento *' : 'Necessário para'}</label>
            <input
              type="date"
              className="input"
              value={necessarioPara}
              onChange={(event) => setNecessarioPara(event.target.value)}
              required={modoCompraDireta}
            />
          </div>

          {modoCompraDireta && (
            <div className="grid gap-2 md:col-span-2">
              <label className="text-sm font-medium">Formas de pagamento *</label>
              <details className="group relative">
                <summary className="input flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 truncate">{resumoFormasPagamento}</span>
                  <svg className="h-4 w-4 shrink-0 transition group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="m7 10 5 5 5-5" />
                  </svg>
                </summary>
                <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[110] max-h-64 overflow-y-auto rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-1.5 shadow-xl">
                  {formasPagamento.map((forma) => {
                    const selecionada = formaPagamentoIds.includes(String(forma.id));
                    const boleto = formaPagamentoEhBoleto(forma);
                    return (
                      <label
                        key={forma.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--c-text)] hover:bg-[var(--c-surface-hover)]"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={selecionada}
                          onChange={() => alternarFormaPagamento(forma.id)}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">{formatarFormaPagamento(forma)}</span>
                        {boleto && <span className="shrink-0 text-xs text-amber-700">Exige anexo</span>}
                      </label>
                    );
                  })}
                </div>
              </details>
              {formasPagamento.length === 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Nenhuma forma de pagamento ativa foi encontrada. Verifique os cadastros financeiros.
                </div>
              )}
            </div>
          )}

          {modoCompraDireta && (
            <div className="grid gap-2 md:col-span-2">
              <label className="text-sm font-medium">Credor</label>
              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-[260px] flex-1">
                  <input
                    className="input w-full"
                    value={parceiroBusca}
                    onChange={(event) => {
                      buscaCredorRequestRef.current += 1;
                      setParceiroBusca(event.target.value);
                      setParceiroId('');
                      setAutocompleteCredorAberto(true);
                    }}
                    onFocus={() => setAutocompleteCredorAberto(true)}
                    onBlur={() => window.setTimeout(() => setAutocompleteCredorAberto(false), 120)}
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
                      className="absolute left-0 right-0 top-[calc(100%+6px)] z-[90] max-h-64 overflow-y-auto rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-1 shadow-xl"
                      role="listbox"
                    >
                      {buscandoParceiros && (
                        <div className="px-3 py-2 text-sm text-[var(--c-muted)]">Buscando credores...</div>
                      )}

                      {!buscandoParceiros && erroBuscaCredor && (
                        <div className="px-3 py-2 text-sm text-red-600">{erroBuscaCredor}</div>
                      )}

                      {!buscandoParceiros && !erroBuscaCredor && parceiros.length === 0 && (
                        <div className="px-3 py-2 text-sm text-[var(--c-muted)]">Nenhum credor encontrado.</div>
                      )}

                      {!buscandoParceiros && !erroBuscaCredor && parceiros.map((parceiro, index) => (
                        <button
                          key={parceiro.id}
                          type="button"
                          className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                            index === credorAtivoIndex
                              ? 'bg-[var(--c-primary)] text-white'
                              : 'text-[var(--c-text)] hover:bg-[var(--c-surface-hover)]'
                          }`}
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
                            <span className={`block truncate text-xs ${index === credorAtivoIndex ? 'text-white/80' : 'text-[var(--c-muted)]'}`}>
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
                  className="btn btn-outline h-[42px] w-[42px] shrink-0 px-0"
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
                <div className="text-sm text-emerald-700">
                  Credor selecionado: <strong>{parceiroBusca || formatarCredor(parceiroSelecionado)}</strong>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-2 md:col-span-2">
            <label className="text-sm font-medium">Observações da compra</label>
            <textarea className="input min-h-[76px]" value={observacoes} onChange={(event) => setObservacoes(event.target.value)} placeholder="Informações úteis para conferência ou pagamento" />
          </div>
          {modoCompraDireta && (
            <div className="grid gap-2 md:col-span-2">
              <label className="text-sm font-medium">Dados para pagamento</label>
              <textarea
                className="input min-h-[76px]"
                value={dadosPagamento}
                onChange={(event) => setDadosPagamento(event.target.value)}
                placeholder="Informe linha digitavel, PIX, banco/agencia/conta ou orientacoes para o financeiro."
              />
            </div>
          )}
        </div>
      </div>

      {modoCompraDireta && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="font-semibold">Condições comerciais e comprovantes</h2>
              <p className="mt-1 text-sm text-[var(--c-muted)]">
                Registre descontos, tratamento do frete e os documentos que comprovam a despesa.
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(220px,0.35fr)_minmax(0,1.65fr)]">
            <div>
              <label className="text-sm font-semibold text-[var(--c-fg)]">Desconto concedido pelo fornecedor</label>
              <input
                className="input mt-1"
                value={descontoTotal}
                onChange={(event) => setDescontoTotal(event.target.value)}
                placeholder="R$ 0,00"
              />
            </div>

            <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--c-text)]">Frete</h3>
                  <p className="mt-1 text-xs text-[var(--c-muted)]">
                    Informe se o frete já compõe os itens ou se será pago separadamente a outro credor.
                  </p>
                </div>
                {freteTipo === 'TERCEIRO' && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                    Gera título separado
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2" aria-label="Tratamento do frete">
                <button
                  type="button"
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${freteTipo === 'EMBUTIDO' ? 'border-blue-400 bg-blue-50 text-blue-900' : 'border-[var(--c-border)] text-[var(--c-text)] hover:bg-[var(--c-surface-hover)]'}`}
                  onClick={() => alterarFreteTipo(freteTipo === 'EMBUTIDO' ? 'SEM_FRETE' : 'EMBUTIDO')}
                  aria-pressed={freteTipo === 'EMBUTIDO'}
                >
                  <span className={`flex h-4 w-4 items-center justify-center rounded border ${freteTipo === 'EMBUTIDO' ? 'border-blue-600 bg-blue-600 text-white' : 'border-[var(--c-border)]'}`}>
                    {freteTipo === 'EMBUTIDO' ? '✓' : ''}
                  </span>
                  Embutido
                </button>
                <button
                  type="button"
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${freteTipo === 'TERCEIRO' ? 'border-blue-400 bg-blue-50 text-blue-900' : 'border-[var(--c-border)] text-[var(--c-text)] hover:bg-[var(--c-surface-hover)]'}`}
                  onClick={() => alterarFreteTipo(freteTipo === 'TERCEIRO' ? 'SEM_FRETE' : 'TERCEIRO')}
                  aria-pressed={freteTipo === 'TERCEIRO'}
                >
                  <span className={`flex h-4 w-4 items-center justify-center rounded border ${freteTipo === 'TERCEIRO' ? 'border-blue-600 bg-blue-600 text-white' : 'border-[var(--c-border)]'}`}>
                    {freteTipo === 'TERCEIRO' ? '✓' : ''}
                  </span>
                  Pago a terceiro
                </button>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {freteTipo === 'TERCEIRO' && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 md:col-span-2 xl:col-span-4">
                    O frete ficará disponível em Contas a Pagar para geração de título separado.
                  </div>
                )}

                {freteTipo !== 'SEM_FRETE' && (
                  <div className="grid gap-1.5">
                    <label className="text-sm font-medium">Valor do frete *</label>
                    <input
                      className="input"
                      value={freteValor}
                      onChange={(event) => setFreteValor(event.target.value)}
                      placeholder="R$ 0,00"
                      inputMode="decimal"
                    />
                    <span className="text-xs text-[var(--c-muted)]">
                      {freteTipo === 'EMBUTIDO'
                        ? 'Valor informativo: não será somado novamente nem gerará título.'
                        : 'Será somado à solicitação e separado do credor principal.'}
                    </span>
                  </div>
                )}

                {freteTipo === 'TERCEIRO' && (
                  <>
                    <div className="relative grid gap-1.5 md:col-span-2">
                      <label className="text-sm font-medium">Credor do frete *</label>
                      <input
                        className="input w-full"
                        value={freteParceiroBusca}
                        onChange={(event) => {
                          buscaCredorFreteRequestRef.current += 1;
                          setFreteParceiroBusca(event.target.value);
                          setFreteParceiroId('');
                          setAutocompleteFreteAberto(true);
                        }}
                        onFocus={() => setAutocompleteFreteAberto(true)}
                        onBlur={() => window.setTimeout(() => setAutocompleteFreteAberto(false), 120)}
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
                          className="absolute left-0 right-0 top-full z-[100] mt-1 max-h-64 overflow-y-auto rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-1 shadow-xl"
                          role="listbox"
                        >
                          {buscandoCredoresFrete && <div className="px-3 py-2 text-sm text-[var(--c-muted)]">Buscando credores...</div>}
                          {!buscandoCredoresFrete && erroBuscaCredorFrete && <div className="px-3 py-2 text-sm text-red-600">{erroBuscaCredorFrete}</div>}
                          {!buscandoCredoresFrete && !erroBuscaCredorFrete && freteParceiros.length === 0 && (
                            <div className="px-3 py-2 text-sm text-[var(--c-muted)]">Nenhum credor encontrado.</div>
                          )}
                          {!buscandoCredoresFrete && !erroBuscaCredorFrete && freteParceiros.map((parceiro, index) => (
                            <button
                              key={parceiro.id}
                              type="button"
                              className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${index === freteCredorAtivoIndex ? 'bg-[var(--c-primary)] text-white' : 'text-[var(--c-text)] hover:bg-[var(--c-surface-hover)]'}`}
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
                                <span className={`block truncate text-xs ${index === freteCredorAtivoIndex ? 'text-white/80' : 'text-[var(--c-muted)]'}`}>{parceiro.cpf_cnpj}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid gap-1.5">
                      <label className="text-sm font-medium">Data para pagamento *</label>
                      <input type="date" className="input" value={freteDataVencimento} onChange={(event) => setFreteDataVencimento(event.target.value)} />
                    </div>

                    <div className="grid gap-1.5 md:col-span-2 xl:col-span-4">
                      <label className="text-sm font-medium">Dados para pagamento do frete *</label>
                      <textarea
                        className="input min-h-[80px]"
                        value={freteDadosPagamento}
                        onChange={(event) => setFreteDadosPagamento(event.target.value)}
                        placeholder="Informe PIX, banco/agência/conta, linha digitável ou instruções para o financeiro."
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--c-border)] pt-4">
              <div>
                <div className="text-sm font-semibold text-[var(--c-text)]">Comprovantes da Despesa</div>
                <div className="mt-0.5 text-xs text-[var(--c-muted)]">Nota fiscal, guia, boleto ou comprovante relacionado à compra.</div>
              </div>
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
            </div>

            {anexosCabecalho.length > 0 ? (
              <div className="grid gap-2">
                {anexosCabecalho.map((anexo, index) => (
                  <div
                    key={`${anexo.arquivo_url}-${index}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-sm"
                  >
                    <span className="truncate">
                      {anexo.tipo_documento === 'BOLETO' ? 'Boleto: ' : ''}
                      {anexo.arquivo_nome_original || 'Anexo da compra direta'}
                    </span>
                    <button type="button" className="text-red-600 hover:underline" onClick={() => removerAnexoCabecalho(index)}>
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-[var(--c-muted)]">Nenhum comprovante da despesa anexado.</div>
            )}
          </div>
        </div>
      )}

      <div className="compra-nova-layout">
        <div className="card compra-insumos-card">
          <div className="card-header flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Insumos</h2>
            <button type="button" className="btn btn-outline" onClick={() => setModalManualAberto(true)}>
              Item manual
            </button>
          </div>

          <div className="grid gap-3">
            <input className="input" placeholder="Buscar por nome, código ou categoria" value={buscaInsumo} onChange={(event) => setBuscaInsumo(event.target.value)} />

            <div className="grid max-h-[520px] gap-2 overflow-y-auto">
              {insumosFiltrados.map((insumo) => (
                <button
                  key={insumo.id}
                  type="button"
                  className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-3 text-left transition hover:bg-[var(--c-surface-hover)]"
                  onClick={() => adicionarInsumo(insumo)}
                >
                  <div className="font-medium">{insumo.nome}</div>
                  <div className="mt-1 text-xs text-[var(--c-muted)]">
                    {insumo.categoria?.nome || 'Sem categoria'} · {insumo.unidade_manual ? (
                      <span className="text-red-600 dark:text-red-400 font-semibold">{insumo.unidade_manual}</span>
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
        </div>

        <div className="card compra-itens-card">
          <div className="card-header flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Itens da solicitação</h2>
            <div className="flex flex-wrap items-center justify-end gap-2 text-sm text-[var(--c-muted)]">
              <>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={baixarModeloItens}
                  disabled={!modoCompraDireta && !obraId}
                  title={!modoCompraDireta && !obraId ? 'Selecione a obra para baixar o modelo' : undefined}
                >
                  {modoCompraDireta ? 'Baixar modelo Excel' : 'Baixar modelo de itens'}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
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
                <span className="rounded-full border border-[var(--c-border)] px-3 py-1 text-xs">
                  Limite 300 itens
                </span>
              </>
              <span>{itens.length} item(ns)</span>
              {itens.length > 0 && <span>{itensPendentesApropriacao} pendente(s) de rateio fechado</span>}
            </div>
          </div>

          {itens.length === 0 ? (
            <div className="compra-itens-empty py-8 text-center text-sm text-[var(--c-muted)]">Adicione itens a partir da lista de insumos ou crie item manual.</div>
          ) : (
            <div className="compras-responsive-table compra-itens-table-wrap">
              <table className="table compra-itens-table">
                <thead>
                  <tr>
                    <th>Insumo</th>
                    <th>Unidade</th>
                    <th>Quantidade *</th>
                    {modoCompraDireta && <th>Valor unitário *</th>}
                    {modoCompraDireta && <th>Total</th>}
                    {!modoCompraDireta && <th>Especificação</th>}
                    <th>Apropriação *</th>
                    {!modoCompraDireta && <th>Necessário para</th>}
                    {!modoCompraDireta && <th>Link do produto</th>}
                    {!modoCompraDireta && <th>Arquivo do item</th>}
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((item, index) => (
                    <tr key={`${item.manual ? 'manual' : item.insumo_id}-${index}`}>
                      <td>
                        <input
                          className={`input min-w-[240px] ${item.manual ? 'border-red-300 text-red-700' : ''}`}
                          value={item.insumo_nome}
                          disabled={!item.manual}
                          onChange={(event) => atualizarItem(index, 'insumo_nome', event.target.value)}
                        />
                        {false && (
                          <p className="mt-1 text-[11px] text-[var(--c-muted)]">
                            Últ. compra: <span className="font-semibold text-emerald-700">R$ {Number(item.ultimo_preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          </p>
                        )}
                      </td>
                      <td>
                        <select
                          className="input min-w-[110px]"
                          value={item.unidade_id ? String(item.unidade_id) : ''}
                          onChange={(event) => atualizarUnidadeItem(index, event.target.value)}
                        >
                          <option value="">Selecione</option>
                          {unidades.map((unidade) => (
                            <option key={unidade.id || unidade.sigla} value={unidade.id}>
                              {unidade.sigla || unidade.nome}{unidade.nome && unidade.sigla ? ` - ${unidade.nome}` : ''}
                            </option>
                          ))}
                        </select>
                        {!item.unidade_id && item.unidade_sigla ? (
                          <p className="mt-1 text-[11px] text-[var(--c-muted)]">Atual: {item.unidade_sigla}</p>
                        ) : null}
                      </td>
                      <td><input type="number" min="0.01" step="0.01" className="input min-w-[110px]" value={item.quantidade} onChange={(event) => atualizarItem(index, 'quantidade', event.target.value)} /></td>
                      {modoCompraDireta && (
                        <td>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            className="input min-w-[140px]"
                            value={item.valor_unitario}
                            onChange={(event) => atualizarItem(index, 'valor_unitario', event.target.value)}
                          />
                        </td>
                      )}
                      {modoCompraDireta && (
                        <td>
                          <div className="min-w-[130px] rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-sm font-semibold">
                            {formatarMoeda(calcularValorTotalItem(item))}
                          </div>
                        </td>
                      )}
                      {!modoCompraDireta && (
                        <td><input className="input min-w-[260px]" value={item.especificacao} onChange={(event) => atualizarItem(index, 'especificacao', event.target.value)} /></td>
                      )}
                      <td>
                        {(() => {
                          const linhasApropriacao = montarLinhasResumoApropriacao(item, apropriacoes);
                          const resumoApropriacao = calcularResumoRateios(item);

                          return (
                            <div className="flex min-w-[200px] items-center gap-2">
                              <div className="flex-1 min-w-0">
                                {linhasApropriacao.length > 0 ? (
                                  <>
                                    <div className="grid gap-0.5 text-xs text-[var(--c-text)]">
                                      {linhasApropriacao.slice(0, 2).map((linha, linhaIndex) => (
                                        <div key={`${linha}-${linhaIndex}`} className="truncate">{linha}</div>
                                      ))}
                                      {linhasApropriacao.length > 2 && (
                                        <div className="text-[var(--c-muted)]">+{linhasApropriacao.length - 2} rateio(s)</div>
                                      )}
                                    </div>
                                    <div className={`text-[11px] font-semibold ${resumoApropriacao.fechado ? 'text-emerald-700' : 'text-amber-700'}`}>
                                      {resumoApropriacao.fechado ? 'Fechado' : `Saldo ${formatarQuantidade(resumoApropriacao.saldo)}`}
                                    </div>
                                  </>
                                ) : (
                                  <span className="text-xs text-[var(--c-muted)]">Nenhuma</span>
                                )}
                              </div>
                              <button type="button" className="btn btn-outline text-xs px-2 py-1 shrink-0" onClick={() => abrirModalApropriacao(index)}>
                                {linhasApropriacao.length > 0 ? 'Editar' : 'Apropriar'}
                              </button>
                            </div>
                          );
                        })()}
                      </td>
                      {!modoCompraDireta && <td><input type="date" className={`input min-w-[170px] ${!item.necessario_para ? 'border-red-400' : ''}`} value={item.necessario_para} onChange={(event) => atualizarItem(index, 'necessario_para', event.target.value)} required /></td>}
                      {!modoCompraDireta && (
                        <td>
                          <input
                            type="url"
                            className="input min-w-[260px]"
                            placeholder="https://"
                            value={item.link_produto}
                            onChange={(event) => atualizarItem(index, 'link_produto', event.target.value)}
                          />
                        </td>
                      )}
                      {!modoCompraDireta && (
                        <td>
                          <div className="flex min-w-[260px] flex-col gap-2">
                            <label className={`btn btn-outline cursor-pointer justify-center ${uploadingArquivos[index] ? 'pointer-events-none opacity-60' : ''}`}>
                              <input
                                type="file"
                                className="hidden"
                                accept={ITEM_ATTACHMENT_ACCEPT}
                                onChange={(event) => {
                                  const [file] = Array.from(event.target.files || []);
                                  void handleSelecionarArquivo(index, file);
                                  event.target.value = '';
                                }}
                              />
                              {uploadingArquivos[index]
                                ? 'Enviando...'
                                : item.arquivo_nome_original
                                  ? 'Trocar arquivo'
                                  : 'Anexar arquivo'}
                            </label>
                            <div className="text-xs text-[var(--c-muted)]">
                              {item.arquivo_nome_original || 'Sem arquivo anexado'}
                            </div>
                            {item.arquivo_url && (
                              <div className="flex flex-wrap gap-2 text-xs">
                                <button type="button" className="text-blue-600 hover:underline" onClick={() => abrirArquivoItem(item)}>
                                  Abrir
                                </button>
                                <button type="button" className="text-red-600 hover:underline" onClick={() => removerArquivoItem(index)}>
                                  Remover arquivo
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                      <td><button type="button" className="btn btn-danger min-w-[110px] justify-center" onClick={() => removerItem(index)}>Remover</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Use o botao <strong>Apropriar</strong> em cada item para dividir a quantidade entre etapas da obra. O sistema mostra total, distribuido e saldo em tempo real.
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button type="button" className="btn btn-outline" onClick={limparRascunho}>Limpar rascunho</button>
            <button type="button" className="btn btn-outline" onClick={() => navigate('/solicitacoes-compra')}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={handleSalvar} disabled={loading}>{loading ? 'Preparando...' : 'Revisar solicitação'}</button>
          </div>
        </div>
      </div>

      {modalManualAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-lg">
            <div className="card-header flex items-center justify-between gap-3">
              <h2 className="font-semibold">Novo item manual</h2>
              <button type="button" className="btn btn-outline" onClick={() => setModalManualAberto(false)}>Fechar</button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2 md:col-span-2">
                <label className="text-sm font-medium">Nome *</label>
                <input className="input" value={itemManual.nome_manual} onChange={(event) => setItemManual((atual) => ({ ...atual, nome_manual: event.target.value }))} />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Unidade *</label>
                <select
                  className="input"
                  value={itemManual.unidade_id}
                  onChange={(event) => {
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
                  <span className="text-xs text-[var(--c-muted)]">Nenhuma unidade cadastrada encontrada.</span>
                ) : null}
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Quantidade *</label>
                <input type="number" min="0.01" step="0.01" className="input" value={itemManual.quantidade} onChange={(event) => setItemManual((atual) => ({ ...atual, quantidade: event.target.value }))} />
              </div>
              {!modoCompraDireta && (
                <div className="grid gap-2 md:col-span-2">
                  <label className="text-sm font-medium">Especificação</label>
                  <textarea className="input min-h-[96px]" value={itemManual.especificacao} onChange={(event) => setItemManual((atual) => ({ ...atual, especificacao: event.target.value }))} />
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn btn-outline" onClick={() => setModalManualAberto(false)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={adicionarItemManual}>Adicionar</button>
            </div>
          </div>
        </div>
      )}

      {modoCompraDireta && modalCredorAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="card w-full max-w-xl">
            <div className="card-header flex items-center justify-between gap-3">
              <h2 className="font-semibold">Cadastrar Credor</h2>
              <button type="button" className="btn btn-outline" onClick={() => setModalCredorAberto(false)}>
                Fechar
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-2 text-sm">
                CPF/CNPJ
                <input
                  className="input"
                  value={novoCredor.cpf_cnpj}
                  onChange={(event) => setNovoCredor((atual) => ({ ...atual, cpf_cnpj: event.target.value }))}
                />
              </label>
              <label className="grid gap-2 text-sm">
                Nome *
                <input
                  className="input"
                  value={novoCredor.nome}
                  onChange={(event) => setNovoCredor((atual) => ({ ...atual, nome: event.target.value }))}
                />
              </label>
              <label className="grid gap-2 text-sm">
                Telefone
                <input
                  className="input"
                  value={novoCredor.telefone}
                  onChange={(event) => setNovoCredor((atual) => ({ ...atual, telefone: event.target.value }))}
                />
              </label>
              <label className="grid gap-2 text-sm">
                E-mail
                <input
                  type="email"
                  className="input"
                  value={novoCredor.email}
                  onChange={(event) => setNovoCredor((atual) => ({ ...atual, email: event.target.value }))}
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn btn-outline" onClick={() => setModalCredorAberto(false)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={cadastrarCredorCompraDireta} disabled={salvandoCredor}>
                {salvandoCredor ? 'Salvando...' : 'Salvar credor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalApropriacaoIndex !== null && itemModalAtual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="card compras-apropriacao-modal flex max-h-[94vh] w-full flex-col overflow-y-auto">
            <div className="card-header flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Apropriar item</h2>
                <p className="text-sm text-[var(--c-muted)]">
                  {itemModalAtual.insumo_nome} · Quantidade total {formatarQuantidade(itemModalAtual.quantidade)}
                </p>
              </div>
              <button type="button" className="btn btn-outline" onClick={fecharModalApropriacao}>Fechar</button>
            </div>

            <div className="flex flex-1 flex-col gap-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.14em] text-[var(--c-muted)]">Total</div>
                  <div className="mt-2 text-xl font-semibold">{formatarQuantidade(resumoModalApropriacao.total)}</div>
                </div>
                <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.14em] text-[var(--c-muted)]">Distribuído</div>
                  <div className="mt-2 text-xl font-semibold">{formatarQuantidade(resumoModalApropriacao.distribuido)}</div>
                </div>
                <div className={`rounded-xl border px-4 py-3 ${resumoModalApropriacao.fechado ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                  <div className="text-xs uppercase tracking-[0.14em]">Saldo</div>
                  <div className="mt-2 text-xl font-semibold">{formatarQuantidade(resumoModalApropriacao.saldo)}</div>
                </div>
              </div>

              <div className="grid gap-3">
                {rateiosModal.map((rateio, rateioIndex) => (
                  <div key={`rateio-${rateioIndex}`} className="grid gap-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4 md:grid-cols-[minmax(0,1fr)_170px_96px]">
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">Apropriação</label>
                      <ApropriacaoAutocomplete
                        value={rateio.apropriacao_id}
                        options={apropriacoes}
                        onChange={(id) => atualizarRateioModal(rateioIndex, 'apropriacao_id', id)}
                      />
                    </div>

                    <div className="grid gap-2">
                      <label className="text-sm font-medium">Quantidade apropriada</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        className="input"
                        value={rateio.quantidade_apropriada}
                        onChange={(event) => atualizarRateioModal(rateioIndex, 'quantidade_apropriada', event.target.value)}
                      />
                    </div>

                    <div className="grid gap-2">
                      <label className="text-sm font-medium">Ação</label>
                      <button type="button" className="btn btn-outline justify-center" onClick={() => removerRateioModal(rateioIndex)}>
                        Remover
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-auto flex flex-wrap justify-between gap-2 pt-4">
                <button type="button" className="btn btn-outline" onClick={adicionarRateioModal}>
                  Adicionar apropriação
                </button>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-outline" onClick={fecharModalApropriacao}>
                    Cancelar
                  </button>
                  <button type="button" className="btn btn-primary" onClick={salvarRateiosItem}>
                    Salvar distribuição
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <CompraPreviewModal preview={previewArquivo} onClose={() => setPreviewArquivo(null)} />
    </div>
  );
}
