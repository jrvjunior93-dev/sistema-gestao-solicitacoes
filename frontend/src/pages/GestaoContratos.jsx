import { useEffect, useMemo, useState } from 'react';
import {
  HiArrowDownTray,
  HiArrowUpTray,
  HiCheck,
  HiEye,
  HiPaperClip,
  HiPencilSquare,
  HiTrash,
  HiXMark
} from 'react-icons/hi2';
import { useAuth } from '../contexts/AuthContext';
import PendingAttachmentsList from '../components/attachments/PendingAttachmentsList';
import { canAccessContratos, canManageContratos } from '../utils/acessoProduto';
import {
  UPLOAD_MAX_FILE_SIZE_MB_PADRAO,
  concatenarAnexosPendentes,
  extrairFilesAnexosPendentes,
  montarMensagemArquivosAcimaDoLimite
} from '../utils/pendingAttachments';
import { API_URL, authHeaders, fileUrl } from '../services/api';
import { getMinhasObras, getObras } from '../services/obras';
import {
  atualizarContrato,
  criarContrato,
  excluirContrato,
  exportarContratosCsv,
  getContratoAnexos,
  getContratos,
  getContratosResumo,
  importarApropriacoesContratos,
  uploadContratoAnexos
} from '../services/contratos';
import { listarApropriacoes } from '../services/apropriacoes';
import { buscarParceiros } from '../services/parceiros';
import { ResizableTable, ResizableTh } from '../components/ResizableTable';
import ApropriacaoAutocomplete from '../components/ui/ApropriacaoAutocomplete';

const CONTRATOS_TABLE_COLUMNS = [
  { key: 'selecionar', width: 56, minWidth: 48 },
  { key: 'contrato', width: 150, minWidth: 120 },
  { key: 'obra', width: 220, minWidth: 170 },
  { key: 'ref_contrato', width: 210, minWidth: 155 },
  { key: 'descricao', width: 260, minWidth: 170 },
  { key: 'credores', width: 235, minWidth: 160 },
  { key: 'apropriacao', width: 310, minWidth: 210 },
  { key: 'solicitado', width: 170, minWidth: 145 },
  { key: 'pago', width: 145, minWidth: 125 },
  { key: 'a_pagar', width: 165, minWidth: 140 },
  { key: 'ajuste_solicitado', width: 175, minWidth: 145 },
  { key: 'ajuste_pago', width: 150, minWidth: 130 },
  { key: 'qtd_solicitacoes', width: 128, minWidth: 112 }
];

const CONTRATOS_SORT_LABELS = {
  contrato: 'Contrato',
  solicitado: 'Solicitado',
  pago: 'Pago',
  a_pagar: 'A pagar',
  ajuste_solicitado: 'Ajuste Solicitado',
  ajuste_pago: 'Ajuste Pago'
};

export default function GestaoContratos() {
  const { user } = useAuth();
  const [contratos, setContratos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [obras, setObras] = useState([]);
  const [filtros, setFiltros] = useState({
    obra_id: '',
    codigo: '',
    ref: ''
  });
  const [form, setForm] = useState({
    obra_id: '',
    codigo: '',
    ref_contrato: '',
    itens_apropriacao: '',
    descricao: '',
    valor_total: ''
  });
  const [valorDisplay, setValorDisplay] = useState('');
  const [files, setFiles] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [salvandoEdicaoId, setSalvandoEdicaoId] = useState(null);
  const [contratoSelecionadoId, setContratoSelecionadoId] = useState(null);
  const [formEdicao, setFormEdicao] = useState({
    obra_id: '',
    codigo: '',
    ref_contrato: '',
    descricao: '',
    itens_apropriacao: '',
    valor_total: '',
    ajuste_solicitado: '',
    ajuste_pago: ''
  });
  const [modalAnexos, setModalAnexos] = useState(null);
  const [anexos, setAnexos] = useState([]);
  const [uploadAnexos, setUploadAnexos] = useState([]);
  const [importandoContratos, setImportandoContratos] = useState(false);
  const [apropriacoesDisponiveis, setApropriacoesDisponiveis] = useState([]);
  const [apropriacoesContrato, setApropriacoesContrato] = useState([]);
  const [apropriacoesEdicaoDisponiveis, setApropriacoesEdicaoDisponiveis] = useState([]);
  const [apropriacoesEdicao, setApropriacoesEdicao] = useState([]);
  const [credoresContrato, setCredoresContrato] = useState([]);
  const [credoresEdicao, setCredoresEdicao] = useState([]);
  const [buscaCredor, setBuscaCredor] = useState('');
  const [resultadosCredor, setResultadosCredor] = useState([]);
  const [buscaCredorEdicao, setBuscaCredorEdicao] = useState('');
  const [resultadosCredorEdicao, setResultadosCredorEdicao] = useState([]);
  const [ordenacaoContratos, setOrdenacaoContratos] = useState({
    key: 'contrato',
    direction: 'asc'
  });

  const setorTokens = [
    String(user?.setor?.nome || '').toUpperCase(),
    String(user?.setor?.codigo || '').toUpperCase(),
    String(user?.area || '').toUpperCase()
  ];
  const isSetorObra = setorTokens.includes('OBRA');
  const podeAcessar = canAccessContratos(user);
  const podeGerenciarContratos = canManageContratos(user);
  const contratoSelecionado = contratos.find(item => String(item.id) === String(contratoSelecionadoId)) || null;
  const contratoEmEdicao = contratos.find(item => String(item.id) === String(editandoId)) || null;
  const contratosTableColumns = useMemo(() => CONTRATOS_TABLE_COLUMNS, []);
  const contratosOrdenados = useMemo(() => {
    const lista = Array.isArray(contratos) ? [...contratos] : [];
    const { key, direction } = ordenacaoContratos;
    const multiplicador = direction === 'desc' ? -1 : 1;

    function valorOrdenacao(contrato) {
      switch (key) {
        case 'solicitado':
          return Number(contrato?.total_solicitado || 0);
        case 'pago':
          return Number(contrato?.total_pago || 0);
        case 'a_pagar':
          return Number(contrato?.total_a_pagar || 0);
        case 'ajuste_solicitado':
          return Number(contrato?.ajuste_solicitado || 0);
        case 'ajuste_pago':
          return Number(contrato?.ajuste_pago || 0);
        case 'contrato':
        default:
          return String(contrato?.codigo || '');
      }
    }

    return lista.sort((a, b) => {
      const valorA = valorOrdenacao(a);
      const valorB = valorOrdenacao(b);
      if (typeof valorA === 'number' && typeof valorB === 'number') {
        return (valorA - valorB) * multiplicador;
      }
      const comparacao = String(valorA).localeCompare(String(valorB), 'pt-BR', {
        numeric: true,
        sensitivity: 'base'
      });
      return comparacao * multiplicador;
    });
  }, [contratos, ordenacaoContratos]);

  useEffect(() => {
    if (podeAcessar) {
      carregar();
      carregarCombos();
    } else {
      setLoading(false);
    }
  }, [podeAcessar, isSetorObra]);

  async function carregar(overrideFiltros) {
    try {
      setLoading(true);
      const data = await getContratosResumo(overrideFiltros ?? filtros);
      setContratos(Array.isArray(data) ? data : []);
      if (contratoSelecionadoId && !data?.some?.(item => String(item.id) === String(contratoSelecionadoId))) {
        setContratoSelecionadoId(null);
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao carregar contratos');
    } finally {
      setLoading(false);
    }
  }

  async function carregarCombos() {
    try {
      const [obrasData] = await Promise.all([
        isSetorObra ? getMinhasObras() : getObras()
      ]);
      const lista = Array.isArray(obrasData) ? obrasData : [];
      const ordenadas = [...lista].sort((a, b) => {
        const codigoA = String(a?.codigo ?? '');
        const codigoB = String(b?.codigo ?? '');
        const numA = Number.parseInt(codigoA.replace(/\D/g, ''), 10);
        const numB = Number.parseInt(codigoB.replace(/\D/g, ''), 10);
        const temNumA = Number.isFinite(numA);
        const temNumB = Number.isFinite(numB);
        if (temNumA && temNumB && numA !== numB) {
          return numA - numB;
        }
        if (temNumA !== temNumB) {
          return temNumA ? -1 : 1;
        }
        const nomeA = String(a?.nome ?? '');
        const nomeB = String(b?.nome ?? '');
        return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
      });
      setObras(ordenadas);
    } catch (error) {
      console.error(error);
    }
  }

  async function carregarApropriacoesObra(obraId, setter) {
    if (!obraId) {
      setter([]);
      return;
    }
    try {
      const data = await listarApropriacoes({ obra_id: obraId });
      setter(Array.isArray(data) ? data.filter(item => item?.ativo !== false) : []);
    } catch (error) {
      console.error(error);
      setter([]);
    }
  }

  function criarLinhaApropriacao() {
    return {
      apropriacao_id: '',
      percentual: '',
      quantidade: '',
      observacao: ''
    };
  }

  function alterarLinhaApropriacao(index, campo, valor, setter) {
    setter(prev => prev.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [campo]: valor } : item
    )));
  }

  function adicionarLinhaApropriacao(setter) {
    setter(prev => [...prev, criarLinhaApropriacao()]);
  }

  function removerLinhaApropriacao(index, setter) {
    setter(prev => prev.filter((_, itemIndex) => itemIndex !== index));
  }

  function montarApropriacoesPayload(lista) {
    const vistos = new Set();
    return (Array.isArray(lista) ? lista : [])
      .map(item => ({
        apropriacao_id: Number(item.apropriacao_id),
        percentual: String(item.percentual || '').trim() || null,
        quantidade: String(item.quantidade || '').trim() || null,
        observacao: String(item.observacao || '').trim() || null
      }))
      .filter((item) => {
        if (!item.apropriacao_id || vistos.has(item.apropriacao_id)) return false;
        vistos.add(item.apropriacao_id);
        return true;
      });
  }

  function normalizarApropriacoesContrato(contrato) {
    return (Array.isArray(contrato?.apropriacoes) ? contrato.apropriacoes : []).map(item => ({
      apropriacao_id: String(item.apropriacao_id || item.apropriacao?.id || ''),
      percentual: item.percentual !== null && item.percentual !== undefined ? String(item.percentual) : '',
      quantidade: item.quantidade !== null && item.quantidade !== undefined ? String(item.quantidade) : '',
      observacao: item.observacao || ''
    }));
  }

  function resumoApropriacoesContrato(contrato) {
    const lista = Array.isArray(contrato?.apropriacoes) ? contrato.apropriacoes : [];
    if (lista.length === 0) return contrato?.itens_apropriacao || '-';
    return lista.map((item) => {
      const codigo = item.apropriacao?.codigo || item.apropriacao_id;
      const descricao = item.apropriacao?.descricao ? ` - ${item.apropriacao.descricao}` : '';
      const percentual = item.percentual !== null && item.percentual !== undefined
        ? ` (${Number(item.percentual).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%)`
        : '';
      const quantidade = item.quantidade !== null && item.quantidade !== undefined
        ? ` qtd ${Number(item.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}`
        : '';
      return `${codigo}${descricao}${percentual}${quantidade}`;
    }).join('; ');
  }

  function normalizarCredoresContrato(contrato) {
    return (Array.isArray(contrato?.credores) ? contrato.credores : []).map(item => ({
      parceiro_id: String(item.id || ''),
      nome: item.nome || '',
      cpf_cnpj: item.cpf_cnpj || '',
      observacao: item.ContratoCredor?.observacao || item.contrato_credor?.observacao || ''
    }));
  }

  function montarCredoresPayload(lista) {
    const vistos = new Set();
    return (Array.isArray(lista) ? lista : [])
      .map(item => ({
        parceiro_id: Number(item.parceiro_id || item.id),
        observacao: String(item.observacao || '').trim() || null
      }))
      .filter((item) => {
        if (!item.parceiro_id || vistos.has(item.parceiro_id)) return false;
        vistos.add(item.parceiro_id);
        return true;
      });
  }

  function resumoCredoresContrato(contrato) {
    const lista = Array.isArray(contrato?.credores) ? contrato.credores : [];
    if (lista.length === 0) return '-';
    return lista.map(item => item.nome || item.cpf_cnpj || `Credor ${item.id}`).join('; ');
  }

  async function pesquisarCredoresContrato(termo, setter) {
    const busca = String(termo || '').trim();
    if (busca.length < 2) {
      setter([]);
      return;
    }
    try {
      const data = await buscarParceiros({ q: busca, fornecedor: 1, ativo: 1, limit: 8 });
      setter(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setter([]);
    }
  }

  function adicionarCredorContrato(credor, listaSetter, resultadosSetter, buscaSetter) {
    if (!credor?.id) return;
    listaSetter(prev => {
      if (prev.some(item => String(item.parceiro_id) === String(credor.id))) return prev;
      return [
        ...prev,
        {
          parceiro_id: String(credor.id),
          nome: credor.nome || '',
          cpf_cnpj: credor.cpf_cnpj || '',
          observacao: ''
        }
      ];
    });
    resultadosSetter([]);
    buscaSetter('');
  }

  function removerCredorContrato(parceiroId, listaSetter) {
    listaSetter(prev => prev.filter(item => String(item.parceiro_id) !== String(parceiroId)));
  }

  function alterarObservacaoCredor(parceiroId, valor, listaSetter) {
    listaSetter(prev => prev.map(item => (
      String(item.parceiro_id) === String(parceiroId)
        ? { ...item, observacao: valor }
        : item
    )));
  }

  function renderCredoresEditor({
    lista,
    setter,
    busca,
    setBusca,
    resultados,
    setResultados
  }) {
    return (
      <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3 space-y-3">
        <div>
          <p className="text-sm font-semibold text-[var(--c-text)]">Credores vinculados ao contrato</p>
          <p className="text-xs text-[var(--c-muted)]">
            A Nova Solicitacao listara somente estes credores quando o contrato for selecionado.
          </p>
        </div>

        <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_auto]">
          <input
            className="input input-sm"
            value={busca}
            onChange={(e) => {
              const valor = e.target.value;
              setBusca(valor);
              pesquisarCredoresContrato(valor, setResultados);
            }}
            placeholder="Buscar credor por nome ou CPF/CNPJ"
          />
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => pesquisarCredoresContrato(busca, setResultados)}
          >
            Buscar
          </button>
        </div>

        {resultados.length > 0 && (
          <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] p-2 max-h-44 overflow-auto">
            {resultados.map(credor => (
              <button
                type="button"
                key={credor.id}
                className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-[var(--c-surface-alt)]"
                onClick={() => adicionarCredorContrato(credor, setter, setResultados, setBusca)}
              >
                <span className="font-semibold">{credor.nome}</span>
                {credor.cpf_cnpj && <span className="text-[var(--c-muted)]"> - {credor.cpf_cnpj}</span>}
              </button>
            ))}
          </div>
        )}

        {lista.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--c-border)] px-3 py-2 text-xs text-[var(--c-muted)]">
            Nenhum credor vinculado ainda.
          </p>
        ) : (
          <div className="space-y-2">
            {lista.map(credor => (
              <div key={credor.parceiro_id} className="grid gap-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] p-2 md:grid-cols-[minmax(220px,1fr)_minmax(180px,1fr)_auto]">
                <div className="text-sm">
                  <p className="font-semibold text-[var(--c-text)]">{credor.nome || `Credor ${credor.parceiro_id}`}</p>
                  <p className="text-xs text-[var(--c-muted)]">{credor.cpf_cnpj || 'Documento nao informado'}</p>
                </div>
                <input
                  className="input input-sm"
                  value={credor.observacao || ''}
                  onChange={e => alterarObservacaoCredor(credor.parceiro_id, e.target.value, setter)}
                  placeholder="Observacao interna"
                />
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => removerCredorContrato(credor.parceiro_id, setter)}
                >
                  Remover
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderApropriacoesEditor({ lista, disponiveis, setter }) {
    return (
      <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--c-text)]">Apropriacoes do contrato</p>
            <p className="text-xs text-[var(--c-muted)]">Use uma linha por item que podera ser rateado na solicitacao.</p>
          </div>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => adicionarLinhaApropriacao(setter)}
          >
            Adicionar
          </button>
        </div>

        {disponiveis.length === 0 && (
          <p className="text-xs text-[var(--c-muted)]">
            Selecione uma obra com apropriacoes cadastradas para habilitar a lista.
          </p>
        )}

        {lista.map((item, index) => (
          <div key={`${index}-${item.apropriacao_id || 'nova'}`} className="grid gap-2 lg:grid-cols-[minmax(220px,1.5fr)_100px_100px_minmax(160px,1fr)_auto]">
            <ApropriacaoAutocomplete
              value={item.apropriacao_id}
              options={disponiveis}
              onChange={(id) => alterarLinhaApropriacao(index, 'apropriacao_id', id, setter)}
              inputClassName="input input-sm w-full"
              placeholder="Apropriação"
            />
            <input
              className="input input-sm"
              value={item.percentual}
              onChange={e => alterarLinhaApropriacao(index, 'percentual', e.target.value, setter)}
              placeholder="%"
            />
            <input
              className="input input-sm"
              value={item.quantidade}
              onChange={e => alterarLinhaApropriacao(index, 'quantidade', e.target.value, setter)}
              placeholder="Qtd."
            />
            <input
              className="input input-sm"
              value={item.observacao}
              onChange={e => alterarLinhaApropriacao(index, 'observacao', e.target.value, setter)}
              placeholder="Observacao"
            />
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => removerLinhaApropriacao(index, setter)}
            >
              Remover
            </button>
          </div>
        ))}
      </div>
    );
  }

  function onChangeForm(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  useEffect(() => {
    carregarApropriacoesObra(form.obra_id, setApropriacoesDisponiveis);
    setApropriacoesContrato([]);
  }, [form.obra_id]);

  useEffect(() => {
    carregarApropriacoesObra(formEdicao.obra_id, setApropriacoesEdicaoDisponiveis);
  }, [formEdicao.obra_id]);

  function onChangeFiltro(e) {
    const { name, value } = e.target;
    setFiltros(prev => ({ ...prev, [name]: value }));
  }

  async function aplicarFiltros(e) {
    e?.preventDefault();
    await carregar();
  }

  async function limparFiltros() {
    const limpo = { obra_id: '', codigo: '', ref: '' };
    setFiltros(limpo);
    await carregar(limpo);
  }

  function parseMoeda(valor) {
    if (!valor) return 0;
    const limpo = String(valor)
      .replace(/[^\d,.-]/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    const numero = Number(limpo);
    return Number.isNaN(numero) ? 0 : numero;
  }

  function formatMoeda(valor) {
    const numero = Number(valor || 0);
    return numero.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  function alternarOrdenacaoContratos(key) {
    setOrdenacaoContratos((atual) => {
      if (atual.key !== key) {
        return { key, direction: key === 'contrato' ? 'asc' : 'desc' };
      }
      return {
        key,
        direction: atual.direction === 'asc' ? 'desc' : 'asc'
      };
    });
  }

  function renderSortableHeader(columnKey, children, className = 'text-left p-3') {
    const ativo = ordenacaoContratos.key === columnKey;
    const direction = ativo ? ordenacaoContratos.direction : null;
    const label = CONTRATOS_SORT_LABELS[columnKey] || children;

    return (
      <ResizableTh columnKey={columnKey} className={className}>
        <button
          type="button"
          className={`contratos-sort-button ${ativo ? 'is-active' : ''}`}
          onClick={() => alternarOrdenacaoContratos(columnKey)}
          aria-label={`Ordenar por ${label}`}
          aria-pressed={ativo}
        >
          <span>{children}</span>
          <span className="contratos-sort-indicator" aria-hidden="true">
            {ativo ? (direction === 'asc' ? '↑' : '↓') : '↕'}
          </span>
        </button>
      </ResizableTh>
    );
  }

  async function handleCriarContrato(e) {
    e.preventDefault();
    if (salvando) return;

    try {
      setSalvando(true);

      const payload = {
        obra_id: Number(form.obra_id),
        codigo: String(form.codigo || '').trim(),
        ref_contrato: String(form.ref_contrato || '').trim(),
        itens_apropriacao: String(form.itens_apropriacao || '').trim() || null,
        descricao: String(form.descricao || '').trim() || null,
        valor_total: valorDisplay ? parseMoeda(valorDisplay) : null,
        tipo_macro_id: null,
        tipo_sub_id: null,
        apropriacoes: montarApropriacoesPayload(apropriacoesContrato),
        credores: montarCredoresPayload(credoresContrato)
      };

      if (!payload.obra_id || !payload.codigo) {
        alert('Obra e codigo sao obrigatorios.');
        return;
      }

      const contrato = await criarContrato(payload);

      if (files.length > 0) {
        await uploadContratoAnexos(contrato.id, extrairFilesAnexosPendentes(files));
      }

      setForm({
        obra_id: '',
        codigo: '',
        ref_contrato: '',
        itens_apropriacao: '',
        descricao: '',
        valor_total: ''
      });
      setValorDisplay('');
      setFiles([]);
      setApropriacoesContrato([]);
      setCredoresContrato([]);
      setBuscaCredor('');
      setResultadosCredor([]);
      await carregar();
      alert('Contrato criado com sucesso.');
    } catch (error) {
      console.error(error);
      alert(error?.message || 'Erro ao criar contrato.');
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(contrato) {
    setEditandoId(contrato.id);
    setFormEdicao({
      obra_id: contrato.obra_id ? String(contrato.obra_id) : '',
      codigo: String(contrato.codigo || ''),
      ref_contrato: String(contrato.ref_contrato || ''),
      descricao: String(contrato.descricao || ''),
      itens_apropriacao: String(contrato.itens_apropriacao || ''),
      valor_total: contrato.valor_total !== null && contrato.valor_total !== undefined
        ? String(contrato.valor_total)
        : '',
      ajuste_solicitado: contrato.ajuste_solicitado !== null && contrato.ajuste_solicitado !== undefined
        ? String(contrato.ajuste_solicitado)
        : '0',
      ajuste_pago: contrato.ajuste_pago !== null && contrato.ajuste_pago !== undefined
        ? String(contrato.ajuste_pago)
        : '0'
    });
    setApropriacoesEdicao(normalizarApropriacoesContrato(contrato));
    setCredoresEdicao(normalizarCredoresContrato(contrato));
    setBuscaCredorEdicao('');
    setResultadosCredorEdicao([]);
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setSalvandoEdicaoId(null);
    setFormEdicao({
      obra_id: '',
      codigo: '',
      ref_contrato: '',
      descricao: '',
      itens_apropriacao: '',
      valor_total: '',
      ajuste_solicitado: '',
      ajuste_pago: ''
    });
    setApropriacoesEdicao([]);
    setCredoresEdicao([]);
    setBuscaCredorEdicao('');
    setResultadosCredorEdicao([]);
  }

  function onChangeEdicao(e) {
    const { name, value } = e.target;
    setFormEdicao(prev => ({ ...prev, [name]: value }));
  }

  async function salvarEdicao(contrato) {
    if (!podeGerenciarContratos) {
      alert('Seu usuario nao tem permissao para editar contratos.');
      return;
    }
    if (salvandoEdicaoId) return;

    const valorTotalEdicao = String(formEdicao.valor_total || '').trim();
    const ajusteSolicitadoEdicao = String(formEdicao.ajuste_solicitado || '').trim();
    const ajustePagoEdicao = String(formEdicao.ajuste_pago || '').trim();
    const valorTotalNumerico = valorTotalEdicao === ''
      ? null
      : Number(valorTotalEdicao.replace(',', '.'));
    const ajusteSolicitadoNumerico = ajusteSolicitadoEdicao === ''
      ? 0
      : Number(ajusteSolicitadoEdicao.replace(',', '.'));
    const ajustePagoNumerico = ajustePagoEdicao === ''
      ? 0
      : Number(ajustePagoEdicao.replace(',', '.'));

    if (
      (valorTotalEdicao !== '' && Number.isNaN(valorTotalNumerico)) ||
      Number.isNaN(ajusteSolicitadoNumerico) ||
      Number.isNaN(ajustePagoNumerico)
    ) {
      alert('Valor inválido.');
      return;
    }

    const payload = {
      obra_id: formEdicao.obra_id ? Number(formEdicao.obra_id) : null,
      codigo: String(formEdicao.codigo || '').trim(),
      ref_contrato: String(formEdicao.ref_contrato || '').trim(),
      descricao: String(formEdicao.descricao || '').trim() || null,
      itens_apropriacao: String(formEdicao.itens_apropriacao || '').trim() || null,
      valor_total: valorTotalNumerico,
      ajuste_solicitado: ajusteSolicitadoNumerico,
      ajuste_pago: ajustePagoNumerico,
      apropriacoes: montarApropriacoesPayload(apropriacoesEdicao),
      credores: montarCredoresPayload(credoresEdicao)
    };

    if (!payload.obra_id || !payload.codigo || !payload.ref_contrato) {
      alert('Obra, código e Ref. do Contrato são obrigatórios.');
      return;
    }

    try {
      setSalvandoEdicaoId(contrato.id);
      await atualizarContrato(contrato.id, payload);
      await carregar();
      cancelarEdicao();
      setContratoSelecionadoId(contrato.id);
      alert('Contrato atualizado com sucesso.');
    } catch (error) {
      console.error(error);
      alert(error?.message || 'Erro ao atualizar contrato.');
    } finally {
      setSalvandoEdicaoId(null);
    }
  }

  async function excluirContratoItem(contrato) {
    if (!confirm(`Excluir o contrato ${contrato.codigo}?`)) return;
    try {
      await excluirContrato(contrato.id);
      setContratos((current) => current.filter((item) => String(item.id) !== String(contrato.id)));
      setContratoSelecionadoId(null);
      await carregar();
      alert('Contrato excluído com sucesso.');
    } catch (error) {
      console.error(error);
      alert(error?.message || 'Erro ao excluir contrato.');
    }
  }

  async function abrirAnexos(contrato) {
    try {
      setModalAnexos(contrato);
      const data = await getContratoAnexos(contrato.id);
      setAnexos(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      alert('Erro ao carregar anexos.');
    }
  }

  async function enviarAnexos() {
    if (!modalAnexos || uploadAnexos.length === 0) return;
    try {
      await uploadContratoAnexos(modalAnexos.id, extrairFilesAnexosPendentes(uploadAnexos));
      const data = await getContratoAnexos(modalAnexos.id);
      setAnexos(Array.isArray(data) ? data : []);
      setUploadAnexos([]);
    } catch (error) {
      console.error(error);
      alert('Erro ao enviar anexos.');
    }
  }

  function baixarModeloImportacaoContratos() {
    const linhas = [
      [
        'Contrato',
        'Codigo Obra',
        'Apropriacao Codigo',
        'Apropriacao Percentual',
        'Apropriacao Quantidade',
        'Apropriacao Observacao'
      ],
      ['CT/PE001-7', '7', '001', '60', '', 'Linha 1'],
      ['CT/PE001-7', '7', '002', '40', '', 'Linha 2']
    ];

    const csv = linhas
      .map(colunas => colunas.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo-importacao-apropriacoes-contratos.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  async function onSelecionarArquivoImportacao(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!String(file.name || '').toLowerCase().endsWith('.csv')) {
      alert('Utilize o arquivo modelo em CSV para importar as apropriações dos contratos.');
      return;
    }

    if (!confirm(`Importar apropriações usando o arquivo "${file.name}"?\n\nEsta rotina altera somente os vínculos de apropriação dos contratos encontrados na planilha. Valores solicitados, pagos, ajustes, saldo, credores e descrições não serão alterados.`)) {
      return;
    }

    const substituir = confirm('Deseja substituir as apropriações atuais dos contratos presentes na planilha?\n\nOK = substituir as apropriações atuais desses contratos.\nCancelar = apenas adicionar/atualizar as apropriações da planilha.');
    if (substituir && !confirm('Confirme a substituição das apropriações atuais dos contratos listados no arquivo. Os valores financeiros dos contratos serão preservados.')) {
      return;
    }

    try {
      setImportandoContratos(true);
      const resultado = await importarApropriacoesContratos(file, { substituir });
      await carregar();

      const contratosAfetados = Number(resultado?.contratos_afetados || 0);
      const apropriacoesVinculadas = Number(resultado?.apropriacoes_vinculadas || 0);
      const ignorados = Number(resultado?.ignorados || 0);
      const erros = Array.isArray(resultado?.erros) ? resultado.erros : [];

      if (erros.length > 0) {
        const resumoErros = erros
          .slice(0, 5)
          .map(item => `Linha ${item.linha}: ${item.error}`)
          .join('\n');
        alert(`Contratos afetados: ${contratosAfetados}. Apropriações vinculadas: ${apropriacoesVinculadas}. Ignorados: ${ignorados}. Erros: ${erros.length}.\n${resumoErros}${erros.length > 5 ? '\n...' : ''}`);
      } else {
        alert(`Importação concluída. Contratos afetados: ${contratosAfetados}. Apropriações vinculadas: ${apropriacoesVinculadas}. Ignorados: ${ignorados}.`);
      }
    } catch (error) {
      console.error(error);
      const erros = Array.isArray(error?.details?.erros) ? error.details.erros : [];
      if (erros.length > 0) {
        const resumoErros = erros
          .slice(0, 8)
          .map(item => `Linha ${item.linha}: ${item.error}`)
          .join('\n');
        alert(`${error?.message || 'Erro ao importar apropriações dos contratos.'}\n${resumoErros}${erros.length > 8 ? '\n...' : ''}`);
      } else {
        alert(error?.message || 'Erro ao importar apropriações dos contratos.');
      }
    } finally {
      setImportandoContratos(false);
    }
  }

  async function handleExportarContratos() {
    try {
      await exportarContratosCsv(filtros);
    } catch (error) {
      console.error(error);
      alert(error?.message || 'Erro ao exportar contratos.');
    }
  }

  function removerArquivoNovoContrato(index) {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }

  function removerArquivoModal(index) {
    setUploadAnexos(prev => prev.filter((_, i) => i !== index));
  }

  function adicionarArquivosNovoContrato(fileList) {
    const { arquivos: proximoEstado, rejeitados } = concatenarAnexosPendentes(files, fileList, {
      maxFileSizeMb: UPLOAD_MAX_FILE_SIZE_MB_PADRAO
    });
    setFiles(proximoEstado);
    if (rejeitados.length > 0) {
      alert(montarMensagemArquivosAcimaDoLimite(rejeitados, UPLOAD_MAX_FILE_SIZE_MB_PADRAO));
    }
  }

  function adicionarArquivosModal(fileList) {
    const { arquivos: proximoEstado, rejeitados } = concatenarAnexosPendentes(uploadAnexos, fileList, {
      maxFileSizeMb: UPLOAD_MAX_FILE_SIZE_MB_PADRAO
    });
    setUploadAnexos(proximoEstado);
    if (rejeitados.length > 0) {
      alert(montarMensagemArquivosAcimaDoLimite(rejeitados, UPLOAD_MAX_FILE_SIZE_MB_PADRAO));
    }
  }

  async function obterUrlAssinada(caminhoArquivo) {
    if (!caminhoArquivo) return null;
    if (!String(caminhoArquivo).startsWith('http')) {
      return fileUrl(caminhoArquivo);
    }

    try {
      const res = await fetch(
        `${API_URL}/anexos/presign?url=${encodeURIComponent(caminhoArquivo)}`,
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error('Falha ao assinar URL');
      const data = await res.json();
      return data?.url || caminhoArquivo;
    } catch (error) {
      console.error(error);
      return caminhoArquivo;
    }
  }

  async function visualizarAnexoContrato(caminhoArquivo) {
    try {
      const urlArquivo = await obterUrlAssinada(caminhoArquivo);
      if (!urlArquivo) {
        alert('Arquivo inválido.');
        return;
      }
      window.open(urlArquivo, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error(error);
      alert('Erro ao visualizar anexo.');
    }
  }

  async function baixarAnexoContrato(caminhoArquivo, nomeArquivo) {
    try {
      const urlArquivo = await obterUrlAssinada(caminhoArquivo);
      if (!urlArquivo) {
        alert('Arquivo inválido.');
        return;
      }

      const response = await fetch(urlArquivo);
      if (!response.ok) {
        throw new Error('Falha ao baixar arquivo');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = nomeArquivo || 'anexo';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert('Erro ao baixar anexo.');
    }
  }

  function renderFiltros() {
    return (
      <form
        onSubmit={aplicarFiltros}
        className="sol-surface-card solicitacoes-filtros app-filters-card rounded-xl p-4 md:p-5"
      >
        <div className="sol-filtros-head">
          <div>
            <p className="sol-filtros-title">Filtros</p>
            <p className="sol-filtros-subtitle">
              Refine por obra, codigo e referencia para localizar contratos mais rapido.
            </p>
          </div>
        </div>

        <div className="sol-filtros-grid">
        <label className="sol-filter-field">
          <span className="sol-filter-label">Obra</span>
          <select
            name="obra_id"
            value={filtros.obra_id}
            onChange={onChangeFiltro}
            className="input w-full"
          >
            <option value="">Todas</option>
            {obras.map(obra => (
              <option key={obra.id} value={obra.id}>
                {obra.codigo} - {obra.nome}
              </option>
            ))}
          </select>
        </label>

        <label className="sol-filter-field">
          Código do contrato
          <input
            name="codigo"
            value={filtros.codigo}
            onChange={onChangeFiltro}
            className="input w-full"
            placeholder="Ex: CTR-001"
          />
        </label>

        <label className="sol-filter-field">
          <span className="sol-filter-label">Ref. do Contrato</span>
          <input
            name="ref"
            value={filtros.ref}
            onChange={onChangeFiltro}
            className="input w-full"
            placeholder="Buscar por referencia"
          />
        </label>

        <div className="flex flex-wrap items-end gap-2">
          <button type="submit" className="btn btn-outline">
            Buscar
          </button>
          <button type="button" className="btn btn-outline" onClick={limparFiltros}>
            Limpar
          </button>
        </div>
        </div>
      </form>
    );
  }

  if (loading) return <p>Carregando contratos...</p>;

  if (!podeAcessar) {
    return (
      <p className="text-gray-600">
        Acesso restrito. Solicite ao administrador do sistema.
      </p>
    );
  }

  if (isSetorObra) {
    return (
      <div className="page solicitacoes-page contratos-page">
        <h1 className="text-2xl font-semibold">Gestão de Contratos</h1>
        <p className="page-subtitle">Acompanhamento dos contratos vinculados as suas obras.</p>

        {renderFiltros()}

        <div className="card sol-surface-card app-table-shell">
          <div className="table-wrapper">
          <table className="table min-w-[900px]">
            <thead>
              <tr>
                <th className="text-left p-3">Contrato</th>
                <th className="text-left p-3">Obra</th>
                <th className="text-left p-3">Ref. do Contrato</th>
                <th className="text-left p-3">Descrição</th>
                <th className="text-left p-3">Itens de Apropriação</th>
                <th className="text-right p-3">Solicitado</th>
                <th className="text-right p-3">Pago</th>
                <th className="text-right p-3">A pagar</th>
              </tr>
            </thead>
            <tbody>
              {contratosOrdenados.length === 0 && (
                <tr>
                  <td colSpan="8" className="p-4 text-center text-gray-500">
                    Nenhum contrato encontrado.
                  </td>
                </tr>
              )}
              {contratos.map(c => (
                <tr key={c.id} className="border-t">
                  <td className="p-3 font-medium">{c.codigo}</td>
                  <td className="p-3">{c.obra?.nome || '-'}</td>
                  <td className="p-3">{c.ref_contrato || '-'}</td>
                  <td className="p-3">{c.descricao || '-'}</td>
                  <td className="p-3">{resumoApropriacoesContrato(c)}</td>
                  <td className="p-3 text-right">
                    {Number(c.total_solicitado || 0).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL'
                    })}
                  </td>
                  <td className="p-3 text-right">
                    {Number(c.total_pago || 0).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL'
                    })}
                  </td>
                  <td className="p-3 text-right">
                    {Number(c.total_a_pagar || 0).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL'
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    );
  }

  return (
    <div className="page solicitacoes-page contratos-page">
      <h1 className="page-title">Gestão de Contratos</h1>
      <p className="page-subtitle">Cadastro, importacao e acompanhamento dos contratos por obra.</p>

      {user?.perfil === 'SUPERADMIN' && (
        <div className="sol-surface-card rounded-xl p-3 md:p-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-outline px-3"
            onClick={baixarModeloImportacaoContratos}
            title="Baixar modelo de apropriacoes dos contratos"
            aria-label="Baixar modelo de apropriacoes dos contratos"
          >
            <HiArrowDownTray className="w-4 h-4" />
            Modelo apropriacoes
          </button>

          <button
            type="button"
            className="btn btn-outline px-3"
            onClick={handleExportarContratos}
            title="Exportar contratos e apropriacoes (.csv)"
            aria-label="Exportar contratos e apropriacoes"
          >
            Exportar CSV
          </button>

          <label
            className={`btn btn-outline px-3 cursor-pointer ${importandoContratos ? 'opacity-60 pointer-events-none' : ''}`}
            title="Importar apenas apropriacoes dos contratos (.csv)"
            aria-label="Importar apenas apropriacoes dos contratos"
          >
            <HiArrowUpTray className="w-4 h-4" />
            Importar apropriacoes
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={onSelecionarArquivoImportacao}
              disabled={importandoContratos}
            />
          </label>

          <span className="app-note">
            Importacao segura: altera somente os vinculos de apropriacao dos contratos listados.
          </span>
        </div>
      )}

      <form
        onSubmit={handleCriarContrato}
        className="card sol-surface-card rounded-xl p-4 md:p-5 space-y-5"
      >
        <div className="sol-filtros-head">
          <div>
            <p className="sol-filtros-title">Novo contrato</p>
            <p className="sol-filtros-subtitle">
              Cadastre contrato, valor e documentos vinculados a obra correta.
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.8fr)_minmax(220px,1fr)_minmax(220px,1fr)_minmax(220px,1fr)]">
          <div>
            <label className="grid gap-1 text-sm">Obra</label>
            <select
              name="obra_id"
              value={form.obra_id}
              onChange={onChangeForm}
              className="input w-full"
            >
              <option value="">Selecione</option>
              {obras.map(obra => (
                <option key={obra.id} value={obra.id}>
                  {obra.codigo} - {obra.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="grid gap-1 text-sm">Código</label>
            <input
              name="codigo"
              value={form.codigo}
              onChange={onChangeForm}
              className="input w-full"
              placeholder="Ex: CTR-001"
            />
          </div>

          <div>
            <label className="grid gap-1 text-sm">Ref. do Contrato</label>
            <input
              name="ref_contrato"
              value={form.ref_contrato}
              onChange={onChangeForm}
              className="input w-full"
            />
          </div>

          <div>
            <label className="grid gap-1 text-sm">Valor</label>
            <input
              name="valor_total"
              value={valorDisplay}
              onChange={e => setValorDisplay(e.target.value)}
              onBlur={() => {
                const numero = parseMoeda(valorDisplay);
                setValorDisplay(numero ? formatMoeda(numero) : '');
              }}
              className="input w-full"
            />
          </div>

        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          <div>
          <label className="grid gap-1 text-sm">Descrição</label>
          <textarea
            name="descricao"
            value={form.descricao}
            onChange={onChangeForm}
            className="input w-full"
            rows="3"
          />
          </div>

          <div>
          <label className="grid gap-1 text-sm">Itens de Apropriação</label>
          <textarea
            name="itens_apropriacao"
            value={form.itens_apropriacao}
            onChange={onChangeForm}
            className="input w-full"
            rows="3"
            placeholder="Descreva os itens de apropriação do contrato"
          />
          </div>

        </div>

        {renderApropriacoesEditor({
          lista: apropriacoesContrato,
          disponiveis: apropriacoesDisponiveis,
          setter: setApropriacoesContrato
        })}

        {renderCredoresEditor({
          lista: credoresContrato,
          setter: setCredoresContrato,
          busca: buscaCredor,
          setBusca: setBuscaCredor,
          resultados: resultadosCredor,
          setResultados: setResultadosCredor
        })}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div>
          <label className="grid gap-1 text-sm">Anexos do contrato</label>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <label className="btn btn-outline inline-flex items-center gap-2 cursor-pointer">
              <HiPaperClip className="w-4 h-4" />
              <span>Anexar arquivos</span>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={e => {
                  adicionarArquivosNovoContrato(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
            <span className="app-note">
              {files.length > 0
                ? `${files.length} arquivo(s) selecionado(s)`
                : 'Nenhum arquivo selecionado'}
            </span>
          </div>
          <PendingAttachmentsList
            items={files}
            onRemove={(index) => removerArquivoNovoContrato(index)}
            className="mt-2 space-y-1"
            itemClassName="flex items-center justify-between gap-3 text-sm bg-[var(--c-surface)] border border-[var(--c-border)] rounded px-2 py-1"
            removeButtonClassName="text-blue-600 font-semibold px-2"
          />
          </div>

          <div className="flex justify-start xl:justify-end">
            <button
              type="submit"
              disabled={salvando}
              className="btn btn-primary w-full md:w-auto md:px-5"
            >
              {salvando ? 'Salvando...' : 'Criar contrato'}
            </button>
          </div>
        </div>
      </form>

      {renderFiltros()}

      <div className="card sol-surface-card app-table-shell contratos-table-card">
        <div className="table-wrapper contratos-table-wrapper">
          <ResizableTable
            className="table contratos-data-table"
            columns={contratosTableColumns}
            storageKey="fluxy.contratos.gestao.columnWidths"
          >
            <thead>
              <tr>
                <ResizableTh columnKey="selecionar" className="text-left p-3 contratos-select-col">Sel.</ResizableTh>
                {renderSortableHeader('contrato', 'Contrato')}
                <ResizableTh columnKey="obra" className="text-left p-3">Obra</ResizableTh>
                <ResizableTh columnKey="ref_contrato" className="text-left p-3">Ref. do Contrato</ResizableTh>
                <ResizableTh columnKey="descricao" className="text-left p-3">Descrição</ResizableTh>
                <ResizableTh columnKey="credores" className="text-left p-3">Credores</ResizableTh>
                <ResizableTh columnKey="apropriacao" className="text-left p-3">Itens de Apropriação</ResizableTh>
                {renderSortableHeader('solicitado', 'Solicitado', 'text-right p-3')}
                {renderSortableHeader('pago', 'Pago', 'text-right p-3')}
                {renderSortableHeader('a_pagar', 'A pagar', 'text-right p-3')}
                {renderSortableHeader('ajuste_solicitado', 'Ajuste Solicitado', 'text-right p-3')}
                {renderSortableHeader('ajuste_pago', 'Ajuste Pago', 'text-right p-3')}
                <ResizableTh columnKey="qtd_solicitacoes" className="text-right p-3">Qtd. Solicitações</ResizableTh>
              </tr>
            </thead>
            <tbody>
              {contratos.length === 0 && (
                <tr>
                  <td colSpan={contratosTableColumns.length} className="p-4 text-center text-gray-500">
                    Nenhum contrato encontrado.
                  </td>
                </tr>
              )}
              {contratosOrdenados.map(c => {
                const selecionado = String(contratoSelecionadoId) === String(c.id);
                return (
                  <tr
                    key={c.id}
                    className={`border-t contratos-row contratos-selectable-row ${selecionado ? 'is-selected' : ''}`}
                    onClick={() => setContratoSelecionadoId(prev => (String(prev) === String(c.id) ? null : c.id))}
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setContratoSelecionadoId(prev => (String(prev) === String(c.id) ? null : c.id));
                      }
                    }}
                    aria-selected={selecionado}
                  >
                    <td className="p-3 contratos-select-cell" data-label="Selecionar">
                      <span className="contratos-row-check" aria-hidden="true">
                        {selecionado && <HiCheck />}
                      </span>
                    </td>
                    <td className="p-3 font-medium contratos-primary-cell" data-label="Contrato">{c.codigo}</td>
                    <td className="p-3" data-label="Obra">{c.obra?.nome || '-'}</td>
                    <td className="p-3" data-label="Ref. do Contrato">{c.ref_contrato || '-'}</td>
                    <td className="p-3 contratos-description-cell" data-label="Descrição">{c.descricao || '-'}</td>
                    <td className="p-3 contratos-text-cell" data-label="Credores">{resumoCredoresContrato(c)}</td>
                    <td className="p-3 contratos-text-cell" data-label="Itens de Apropriação">{resumoApropriacoesContrato(c)}</td>
                    <td className="p-3 text-right" data-label="Solicitado">
                      {Number(c.total_solicitado || 0).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL'
                      })}
                    </td>
                    <td className="p-3 text-right" data-label="Pago">
                      {Number(c.total_pago || 0).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL'
                      })}
                    </td>
                    <td className="p-3 text-right" data-label="A pagar">
                      {Number(c.total_a_pagar || 0).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL'
                      })}
                    </td>
                    <td className="p-3 text-right" data-label="Ajuste Solicitado">
                      {Number(c.ajuste_solicitado || 0).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL'
                      })}
                    </td>
                    <td className="p-3 text-right" data-label="Ajuste Pago">
                      {Number(c.ajuste_pago || 0).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL'
                      })}
                    </td>
                    <td className="p-3 text-right" data-label="Qtd. Solicitações">{c.total_solicitacoes || 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </ResizableTable>
        </div>
      </div>

      {contratoSelecionado && (
        <div className="contratos-selection-toolbar fixed left-1/2 -translate-x-1/2 bottom-4 z-40">
          <span className="contratos-selection-toolbar__title">
            {contratoSelecionado.codigo}
          </span>
          <button
            type="button"
            className="btn btn-outline !min-h-0 h-9 px-3 inline-flex items-center gap-2"
            onClick={() => abrirAnexos(contratoSelecionado)}
          >
            <HiEye className="w-4 h-4" />
            <span>Anexos</span>
          </button>
          {podeGerenciarContratos && (
            <>
              <button
                type="button"
                className="btn btn-primary !min-h-0 h-9 px-3 inline-flex items-center gap-2"
                onClick={() => iniciarEdicao(contratoSelecionado)}
              >
                <HiPencilSquare className="w-4 h-4" />
                <span>Editar</span>
              </button>
              <button
                type="button"
                className="btn btn-outline !min-h-0 h-9 px-3 inline-flex items-center gap-2"
                onClick={() => excluirContratoItem(contratoSelecionado)}
              >
                <HiTrash className="w-4 h-4" />
                <span>Excluir</span>
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-outline !min-h-0 h-9 px-3 inline-flex items-center gap-2"
            onClick={() => setContratoSelecionadoId(null)}
          >
            <HiXMark className="w-4 h-4" />
            <span>Limpar</span>
          </button>
        </div>
      )}

      {contratoEmEdicao && (
        <div className="contratos-edit-modal fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="contratos-edit-modal__panel card w-full overflow-hidden">
            <div className="contratos-edit-modal__header">
              <div>
                <p className="sol-filtros-title">Editar contrato {contratoEmEdicao.codigo}</p>
                <p className="sol-filtros-subtitle">
                  Atualize dados gerais, apropriações e credores vinculados ao contrato.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-outline"
                onClick={cancelarEdicao}
                disabled={salvandoEdicaoId === contratoEmEdicao.id}
              >
                Fechar
              </button>
            </div>

            <div className="contratos-edit-modal__body">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(180px,0.8fr)_minmax(220px,1fr)]">
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Obra</span>
                  <select
                    name="obra_id"
                    value={formEdicao.obra_id}
                    onChange={onChangeEdicao}
                    className="input w-full"
                  >
                    <option value="">Selecione</option>
                    {obras.map(obra => (
                      <option key={obra.id} value={obra.id}>
                        {obra.codigo} - {obra.nome}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="sol-filter-field">
                  <span className="sol-filter-label">Código</span>
                  <input
                    name="codigo"
                    value={formEdicao.codigo}
                    onChange={onChangeEdicao}
                    className="input w-full"
                  />
                </label>

                <label className="sol-filter-field">
                  <span className="sol-filter-label">Ref. do Contrato</span>
                  <input
                    name="ref_contrato"
                    value={formEdicao.ref_contrato}
                    onChange={onChangeEdicao}
                    className="input w-full"
                  />
                </label>

                <label className="sol-filter-field md:col-span-2">
                  <span className="sol-filter-label">Descrição</span>
                  <textarea
                    name="descricao"
                    value={formEdicao.descricao}
                    onChange={onChangeEdicao}
                    className="input w-full"
                    rows="3"
                  />
                </label>

                <label className="sol-filter-field">
                  <span className="sol-filter-label">Valor contratado</span>
                  <input
                    type="number"
                    step="0.01"
                    name="valor_total"
                    value={formEdicao.valor_total}
                    onChange={onChangeEdicao}
                    className="input w-full"
                  />
                </label>

                <label className="sol-filter-field">
                  <span className="sol-filter-label">Ajuste solicitado</span>
                  <input
                    type="number"
                    step="0.01"
                    name="ajuste_solicitado"
                    value={formEdicao.ajuste_solicitado}
                    onChange={onChangeEdicao}
                    className="input w-full"
                  />
                </label>

                <label className="sol-filter-field">
                  <span className="sol-filter-label">Ajuste pago</span>
                  <input
                    type="number"
                    step="0.01"
                    name="ajuste_pago"
                    value={formEdicao.ajuste_pago}
                    onChange={onChangeEdicao}
                    className="input w-full"
                  />
                </label>

                <label className="sol-filter-field md:col-span-2 xl:col-span-3">
                  <span className="sol-filter-label">Itens de Apropriação</span>
                  <textarea
                    name="itens_apropriacao"
                    value={formEdicao.itens_apropriacao}
                    onChange={onChangeEdicao}
                    className="input w-full"
                    rows="2"
                  />
                </label>
              </div>

              {renderApropriacoesEditor({
                lista: apropriacoesEdicao,
                disponiveis: apropriacoesEdicaoDisponiveis,
                setter: setApropriacoesEdicao
              })}

              {renderCredoresEditor({
                lista: credoresEdicao,
                setter: setCredoresEdicao,
                busca: buscaCredorEdicao,
                setBusca: setBuscaCredorEdicao,
                resultados: resultadosCredorEdicao,
                setResultados: setResultadosCredorEdicao
              })}
            </div>

            <div className="contratos-edit-modal__footer">
              <button
                type="button"
                className="btn btn-outline"
                onClick={cancelarEdicao}
                disabled={salvandoEdicaoId === contratoEmEdicao.id}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => salvarEdicao(contratoEmEdicao)}
                disabled={salvandoEdicaoId === contratoEmEdicao.id}
              >
                {salvandoEdicaoId === contratoEmEdicao.id ? 'Salvando...' : 'Salvar contrato'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalAnexos && (
        <div className="contratos-anexos-modal fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4 py-6">
          <div className="contratos-anexos-modal__panel card w-full space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">
                Anexos do contrato {modalAnexos.codigo}
              </h2>
              <button onClick={() => setModalAnexos(null)}>Fechar</button>
            </div>

            <div className="contratos-anexos-modal__list space-y-2">
              {anexos.length === 0 && (
                <p className="text-sm text-gray-500">
                  Nenhum anexo encontrado.
                </p>
              )}
              {anexos.map(anexo => (
                <div
                  key={anexo.id}
                  className="flex items-center justify-between gap-3 text-sm border rounded px-3 py-2"
                >
                  <span className="truncate flex-1" title={anexo.nome_original}>
                    {anexo.nome_original}
                  </span>
                  <div className="flex items-center gap-3 whitespace-nowrap">
                    <a
                      href="#"
                      onClick={async e => {
                        e.preventDefault();
                        await visualizarAnexoContrato(anexo.caminho_arquivo);
                      }}
                      className="text-blue-600 hover:underline"
                    >
                      Visualizar
                    </a>
                    <button
                      type="button"
                      onClick={() => baixarAnexoContrato(anexo.caminho_arquivo, anexo.nome_original)}
                      className="text-blue-600 hover:underline"
                    >
                      Baixar
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="text-sm text-gray-600">Enviar novos anexos</label>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <label className="btn btn-outline inline-flex items-center gap-2 cursor-pointer">
                  <HiPaperClip className="w-4 h-4" />
                  <span>Anexar arquivos</span>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={e => {
                      adicionarArquivosModal(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
                <span className="text-xs text-[var(--c-muted)]">
                  {uploadAnexos.length > 0
                    ? `${uploadAnexos.length} arquivo(s) selecionado(s)`
                    : 'Nenhum arquivo selecionado'}
                </span>
              </div>
              <PendingAttachmentsList
                items={uploadAnexos}
                onRemove={(index) => removerArquivoModal(index)}
                className="mt-2 space-y-1"
                itemClassName="flex items-center justify-between gap-3 text-sm bg-[var(--c-surface)] border border-[var(--c-border)] rounded px-2 py-1"
                removeButtonClassName="text-blue-600 font-semibold px-2"
              />
            </div>

            <div className="contratos-anexos-modal__footer">
              <button
                onClick={enviarAnexos}
                className="btn btn-primary"
              >
                Enviar anexos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
