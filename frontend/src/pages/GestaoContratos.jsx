import { useEffect, useMemo, useState } from 'react';
import {
  HiArrowDownTray,
  HiArrowUpTray,
  HiEye,
  HiPaperClip,
  HiPencilSquare,
  HiTrash,
  HiXMark
} from 'react-icons/hi2';
import { useAuth } from '../contexts/AuthContext';
import PendingAttachmentsList from '../components/attachments/PendingAttachmentsList';
import { canAccessContratos, canManageContratos, hasPermissao } from '../utils/acessoProduto';
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
  encerrarContratoFluxoNovo,
  excluirContrato,
  exportarContratosCsv,
  getContratoAnexos,
  getContratos,
  getContratosResumo,
  importarApropriacoesContratos,
  uploadContratoAnexos,
  uploadNegociacaoContrato,
  uploadDocumentacaoJuridicaContrato
} from '../services/contratos';
import { listarApropriacoes } from '../services/apropriacoes';
import { buscarParceiros } from '../services/parceiros';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  CelulaDupla,
  TabelaPadrao,
  FormSecao,
  CampoForm,
  BarraFiltros,
  alternarValorFiltro,
  Avisos,
  useAvisos,
  useConfirmacao,
  useFiltrosVisiveis
} from '../components/padrao';
import OverlayModal from '../components/ui/OverlayModal';
import ApropriacaoAutocomplete from '../components/ui/ApropriacaoAutocomplete';
import { useFecharAoSair } from '../hooks/useFecharAoSair';

const DESCRICAO_GESTAO = 'Cadastro, importacao e acompanhamento dos contratos por obra.';
const DESCRICAO_OBRA = 'Acompanhamento dos contratos vinculados as suas obras.';

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
  { id: 'codigo', rotulo: 'Busca por código', obrigatorio: true },
  { id: 'ref', rotulo: 'Ref. do Contrato' },
  { id: 'obra', rotulo: 'Obra' }
];

export default function GestaoContratos() {
  const { user } = useAuth();
  const [contratos, setContratos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [obras, setObras] = useState([]);
  // ?obra_id= / ?codigo= / ?ref= / ?q= chegam da busca universal (Ctrl+K)
  // e das ações rápidas de obra: a lista abre já filtrada. Um ?q= com
  // dígitos vira filtro de código; sem dígitos, de referência.
  // R12: obra e recorte ENUMERAVEL — vira MARCACAO (conjunto), nao select de
  // escolha unica. O servico so aceita um obra_id, entao a dimensao e `unico`
  // (marca redonda, marcar outra substitui) — sem isso a tela mostraria duas
  // etiquetas e mandaria filtro nenhum.
  const [filtros, setFiltros] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const q = String(params.get('q') || '').trim();
    const obraInicial = String(params.get('obra_id') || '').trim();
    return {
      obra: new Set(obraInicial ? [obraInicial] : []),
      codigo: params.get('codigo') || (q && /\d/.test(q) ? q : ''),
      ref: params.get('ref') || (q && !/\d/.test(q) ? q : '')
    };
  });
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => {
      const valor = filtros[filtro.id];
      return valor instanceof Set ? valor.size > 0 : String(valor ?? '').trim() !== '';
    }).map((filtro) => filtro.id),
    [filtros]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.

    A chave é a da TELA, sem variante: esta faixa é UMA e governa as DUAS
    visões (`:setor-obra` e `:principal`), que são a mesma lista vista por
    perfis diferentes. Uma chave por tabela daria dois nomes ao mesmo
    seletor, e a escolha da pessoa dependeria do perfil com que ela abriu.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:gestao-contratos', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => {
      setFiltros((atual) => ({ ...atual, [id]: atual[id] instanceof Set ? new Set() : '' }));
    }
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
  const [negociacaoEdicaoArquivo, setNegociacaoEdicaoArquivo] = useState(null);
  const [documentacaoJuridicaEdicao, setDocumentacaoJuridicaEdicao] = useState({
    'cartao-cnpj': null,
    'ato-constitutivo': null,
    'representante-legal': null
  });
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
  /*
    SÓ O ESC (06/09, decisão do cliente — D5).

    Esta lista é de resultado EM FLUXO: não cobre nada, empurra o
    formulário para baixo. Por isso ela NÃO recebe o fechamento por clique
    fora que as 35 camadas do sistema receberam. Medido o preço de
    converter por inteiro: clicar em outro campo do MESMO formulário
    passaria a sumir com a lista — e aqui ela é o ÚNICO caminho para vincular um credor ao contrato,
    então fechá-la por engano custa o vínculo.

    Palavras do cliente: "o Esc dá saída sem esse risco".
  */
  useFecharAoSair(
    null,
    resultadosCredor.length > 0 || resultadosCredorEdicao.length > 0,
    () => { setResultadosCredor([]); setResultadosCredorEdicao([]); },
    { apenasEsc: true }
  );
  /*
    R3/R19 — as 38 caixas do navegador desta tela (33 alert, 4 confirm e 1
    prompt) saem juntas: aviso vira faixa do sistema (`useAvisos`) e
    confirmacao vira o modal do sistema (`useConfirmacao`). A caixa do Chrome
    ignora tema e tokens, bloqueia a pagina, nao existe no DOM para o harness
    medir e some sem rastro.
  */
  const { avisos, avisar, fechar } = useAvisos();
  /*
    R26 — trocar a caixa do navegador pelo modal do sistema MUDA O MODELO DE
    CONCORRENCIA da acao: o `confirm` bloqueava a pagina, o modal nao. Com a
    tela clicavel por tras, reler o estado depois do `await` faria a tela
    perguntar sobre o contrato A e agir sobre o contrato B — consentimento
    valido registrado para a acao errada. Por isso toda acao confirmada aqui
    fixa o alvo numa `const` ANTES do `await` e opera sobre ela.
  */
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  /*
    R9 (revista em 04/09) — o cadastro de contrato abre em MODAL. O teste da
    regra: tirando o formulario, sobra tela? Sobra, e muita: barra de
    importacao/exportacao, faixa de filtros, tabela de 12 colunas com ordenacao
    e selecao, barra de acoes do contrato selecionado, modal de edicao e modal
    de anexos. A prova mais forte esta no proprio arquivo: para quem e do setor
    OBRA esta tela renderiza SEM formulario nenhum (ramo `isSetorObra`) e
    continua sendo uma tela inteira. Ou seja, a tela existe para ACOMPANHAR
    contratos por obra; cadastrar um contrato novo INTERROMPE esse trabalho —
    e o modal protege o que estava sendo feito e devolve a pessoa ao lugar.
    Fica simetrico com a edicao, que ja era modal.
  */
  const [novoContratoAberto, setNovoContratoAberto] = useState(false);

  const setorTokens = [
    String(user?.setor?.nome || '').toUpperCase(),
    String(user?.setor?.codigo || '').toUpperCase(),
    String(user?.area || '').toUpperCase()
  ];
  const isSetorObra = setorTokens.includes('OBRA');
  const podeAcessar = canAccessContratos(user);
  const podeGerenciarContratos = canManageContratos(user);
  const podeEncerrarContratos = hasPermissao(user, 'contratos.geral.encerrar');
  const contratoSelecionado = contratos.find(item => String(item.id) === String(contratoSelecionadoId)) || null;
  const contratoEmEdicao = contratos.find(item => String(item.id) === String(editandoId)) || null;
  // ORDEM INICIAL da lista: código A→Z. Do primeiro clique num título em
  // diante quem ordena é a TabelaPadrao (asc → desc → volta a esta ordem),
  // com os MESMOS campos de antes: contrato, solicitado, pago, a pagar,
  // ajuste solicitado e ajuste pago.
  const contratosOrdenados = useMemo(() => {
    const lista = Array.isArray(contratos) ? [...contratos] : [];
    return lista.sort((a, b) => String(a?.codigo || '').localeCompare(
      String(b?.codigo || ''),
      'pt-BR',
      { numeric: true, sensitivity: 'base' }
    ));
  }, [contratos]);

  // O recorte que o servico entende: obra_id unico, codigo e referencia.
  const recorte = useMemo(() => ({
    obra_id: filtros.obra.size ? filtros.obra.values().next().value : '',
    codigo: filtros.codigo,
    ref: filtros.ref
  }), [filtros]);

  useEffect(() => {
    if (!podeAcessar) {
      setLoading(false);
      return;
    }
    carregarCombos();
  }, [podeAcessar, isSetorObra]);

  /*
    R23 — o filtro APLICA AO MARCAR, sem botao "Buscar". Sao TRES dimensoes
    (obra, codigo e referencia), abaixo do criterio de consulta cara da regra
    (4+ dimensoes combinadas ou mais de 2s de resposta): uma requisicao so por
    recorte. Sem isso a etiqueta na faixa apareceria antes de a lista mudar, e
    etiqueta que aparece antes da lista mente (F3).
    A busca digitada espera 350ms — a espera de digitacao e da propria regra.
  */
  useEffect(() => {
    if (!podeAcessar) return undefined;
    const atraso = setTimeout(() => { carregar(recorte); }, 350);
    return () => clearTimeout(atraso);
  }, [recorte, podeAcessar]);

  async function carregar(overrideFiltros) {
    try {
      setLoading(true);
      const data = await getContratosResumo(overrideFiltros ?? recorte);
      setContratos(Array.isArray(data) ? data : []);
      if (contratoSelecionadoId && !data?.some?.(item => String(item.id) === String(contratoSelecionadoId))) {
        setContratoSelecionadoId(null);
      }
    } catch (error) {
      console.error(error);
      avisar.erro('Erro ao carregar contratos.');
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

  function contratoPossuiAlteracoesCadastrais(contrato, payload) {
    const ordenarPorId = (lista, campo) => [...lista].sort((a, b) => Number(a[campo]) - Number(b[campo]));
    const atual = {
      obra_id: contrato?.obra_id ? Number(contrato.obra_id) : null,
      codigo: String(contrato?.codigo || '').trim(),
      ref_contrato: String(contrato?.ref_contrato || '').trim(),
      descricao: String(contrato?.descricao || '').trim() || null,
      itens_apropriacao: String(contrato?.itens_apropriacao || '').trim() || null,
      valor_total: contrato?.valor_total === null || contrato?.valor_total === undefined
        ? null
        : Number(contrato.valor_total),
      ajuste_solicitado: Number(contrato?.ajuste_solicitado || 0),
      ajuste_pago: Number(contrato?.ajuste_pago || 0),
      apropriacoes: ordenarPorId(
        montarApropriacoesPayload(normalizarApropriacoesContrato(contrato)),
        'apropriacao_id'
      ),
      credores: ordenarPorId(
        montarCredoresPayload(normalizarCredoresContrato(contrato)),
        'parceiro_id'
      )
    };
    const informado = {
      ...payload,
      apropriacoes: ordenarPorId(payload.apropriacoes || [], 'apropriacao_id'),
      credores: ordenarPorId(payload.credores || [], 'parceiro_id')
    };

    return JSON.stringify(atual) !== JSON.stringify(informado);
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
            A Nova Solicitação listara somente estes credores quando o contrato for selecionado.
          </p>
        </div>

        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
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
                className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-[var(--ui-surface-soft)]"
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
              <div key={credor.parceiro_id} className="grid gap-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] p-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <div className="text-sm">
                  <p className="font-semibold text-[var(--c-text)]">{credor.nome || `Credor ${credor.parceiro_id}`}</p>
                  <p className="text-xs text-[var(--c-muted)]">{credor.cpf_cnpj || 'Documento nao informado'}</p>
                </div>
                <input
                  className="input input-sm"
                  value={credor.observacao || ''}
                  onChange={e => alterarObservacaoCredor(credor.parceiro_id, e.target.value, setter)}
                  placeholder="Observação interna"
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
            <p className="text-sm font-semibold text-[var(--c-text)]">Apropriações do contrato</p>
            <p className="text-xs text-[var(--c-muted)]">Use uma linha por item que podera ser rateado na solicitação.</p>
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
            Selecione uma obra com apropriações cadastradas para habilitar a lista.
          </p>
        )}

        {lista.map((item, index) => (
          <div key={`${index}-${item.apropriacao_id || 'nova'}`} className="grid gap-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.5fr)_minmax(0,0.5fr)_minmax(0,1fr)_auto]">
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
              placeholder="Observação"
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

  // R23: nao existe "aplicar" — mexer no recorte ja dispara a consulta pelo
  // efeito acima. Limpar so zera o estado; quem recarrega e o mesmo efeito.
  function limparFiltros() {
    setFiltros({ obra: new Set(), codigo: '', ref: '' });
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
        avisar.alerta('Informe a obra e o código do contrato.');
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
      setNovoContratoAberto(false);
      await carregar();
      avisar.sucesso('Contrato criado com sucesso.');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao criar contrato.');
    } finally {
      setSalvando(false);
    }
  }

  function abrirNovoContrato() {
    setNovoContratoAberto(true);
  }

  // Fechar NAO descarta o que foi digitado: na versao inline os campos
  // ficavam preenchidos ate o envio, e perder o formulario num clique errado
  // seria capacidade a menos. O `handleCriarContrato` e quem limpa, depois de
  // gravar.
  function fecharNovoContrato() {
    setNovoContratoAberto(false);
  }

  function iniciarEdicao(contrato) {
    setEditandoId(contrato.id);
    setNegociacaoEdicaoArquivo(null);
    setDocumentacaoJuridicaEdicao({
      'cartao-cnpj': null,
      'ato-constitutivo': null,
      'representante-legal': null
    });
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
    setNegociacaoEdicaoArquivo(null);
    setDocumentacaoJuridicaEdicao({
      'cartao-cnpj': null,
      'ato-constitutivo': null,
      'representante-legal': null
    });
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

  function selecionarNegociacaoEdicao(event) {
    const arquivo = event.target.files?.[0] || null;
    event.target.value = '';
    if (!arquivo) return;

    const nome = String(arquivo.name || '').toLowerCase();
    if (!nome.endsWith('.docx') && !nome.endsWith('.pdf')) {
      avisar.alerta('Selecione a negociação detalhada em formato .docx ou .pdf.');
      return;
    }

    setNegociacaoEdicaoArquivo(arquivo);
  }

  function selecionarDocumentoJuridicoEdicao(tipo, event) {
    const arquivo = event.target.files?.[0] || null;
    event.target.value = '';
    if (!arquivo) return;
    if (!/\.(pdf|docx|png|jpe?g)$/i.test(String(arquivo.name || ''))) {
      avisar.alerta('Selecione o documento em PDF, DOCX, JPG ou PNG.');
      return;
    }
    setDocumentacaoJuridicaEdicao((atual) => ({ ...atual, [tipo]: arquivo }));
  }

  async function salvarEdicao(contrato) {
    if (!podeGerenciarContratos) {
      avisar.erro('Seu usuário não tem permissão para editar contratos.');
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
      avisar.alerta('Valor inválido.');
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
      avisar.alerta('Obra, código e Ref. do Contrato são obrigatórios.');
      return;
    }

    const possuiAlteracoesCadastrais = contratoPossuiAlteracoesCadastrais(contrato, payload);
    const documentosJuridicosSelecionados = Object.entries(documentacaoJuridicaEdicao)
      .filter(([, arquivo]) => Boolean(arquivo));
    if (!possuiAlteracoesCadastrais && !negociacaoEdicaoArquivo && documentosJuridicosSelecionados.length === 0) {
      avisar.alerta('Nenhuma alteração para salvar.');
      return;
    }

    let negociacaoAtualizada = false;
    let documentacaoJuridicaAtualizada = false;
    let dadosContratoAtualizados = false;
    try {
      setSalvandoEdicaoId(contrato.id);

      if (negociacaoEdicaoArquivo) {
        await uploadNegociacaoContrato(contrato.id, negociacaoEdicaoArquivo);
        negociacaoAtualizada = true;
        setNegociacaoEdicaoArquivo(null);
      }

      if (documentosJuridicosSelecionados.length > 0) {
        await Promise.all(documentosJuridicosSelecionados.map(([tipo, arquivo]) =>
          uploadDocumentacaoJuridicaContrato(contrato.id, tipo, arquivo)));
        documentacaoJuridicaAtualizada = true;
        setDocumentacaoJuridicaEdicao({
          'cartao-cnpj': null,
          'ato-constitutivo': null,
          'representante-legal': null
        });
      }

      if (possuiAlteracoesCadastrais) {
        await atualizarContrato(contrato.id, payload);
        dadosContratoAtualizados = true;
      }

      await carregar();
      cancelarEdicao();
      setContratoSelecionadoId(contrato.id);
      const partesAtualizadas = [
        dadosContratoAtualizados ? 'dados do contrato' : null,
        negociacaoAtualizada ? 'negociação detalhada' : null,
        documentacaoJuridicaAtualizada ? 'documentação jurídica' : null
      ].filter(Boolean);
      avisar.sucesso(`${partesAtualizadas.join(', ')} atualizada(s) com sucesso.`);
    } catch (error) {
      console.error(error);
      if (negociacaoAtualizada && possuiAlteracoesCadastrais && !dadosContratoAtualizados) {
        // Sucesso PARCIAL nao e sucesso: o tom semantico acompanha o que de
        // fato aconteceu (parte gravou, parte nao).
        avisar.alerta(`A negociação detalhada foi enviada, mas os outros dados do contrato não foram atualizados: ${error?.message || 'erro ao atualizar contrato'}. O modal permanecerá aberto para tentar novamente.`);
      } else if (negociacaoAtualizada || documentacaoJuridicaAtualizada || dadosContratoAtualizados) {
        avisar.alerta(`As alterações foram salvas, mas não foi possível recarregar a listagem: ${error?.message || 'erro ao recarregar contratos'}.`);
      } else {
        avisar.erro(error?.message || ((negociacaoEdicaoArquivo || documentosJuridicosSelecionados.length > 0)
          ? 'Erro ao enviar os documentos do contrato.'
          : 'Erro ao atualizar contrato.'));
      }
    } finally {
      setSalvandoEdicaoId(null);
    }
  }

  // Quebra de contrato (PI-6): zera o saldo e exclui os titulos em aberto. So aparece para
  // contrato do fluxo novo ja ativo — nos demais nao ha saldo comprometido para encerrar.
  async function encerrarContratoItem(contrato) {
    /*
      R26 — ALVO FIXADO ANTES DO `await`. O contrato chega por parametro, preso
      no clique da barra de selecao; a const abaixo deixa isso explicito e
      fecha a porta para alguem voltar a ler `contratoSelecionado` depois da
      confirmacao. O modal do sistema NAO bloqueia a tela: com ele aberto, um
      clique noutra linha da tabela trocaria o alvo em silencio e a auditoria
      guardaria um consentimento valido para a acao errada.
    */
    const alvo = contrato;
    /*
      R19 — o `window.prompt` que pedia o motivo virou o `campo` do
      useConfirmacao: pergunta e justificativa num passo so, dentro do modal
      do sistema. `obrigatorio` mantem o botao desabilitado ate ter texto, que
      era o papel do alert "Informe o motivo do encerramento".
      CONSENTIMENTO — a mensagem declara a irreversibilidade E identifica o
      contrato pelo codigo, que e como a pessoa o ve na tabela.
    */
    const { ok, texto } = await confirmar({
      titulo: 'Encerrar contrato',
      mensagem: `Encerrar o contrato ${alvo.codigo}? Esta acao nao pode ser desfeita: o saldo restante e zerado e os titulos em aberto do contrato sao excluidos.`,
      rotuloConfirmar: 'Encerrar contrato',
      destrutiva: true,
      campo: { rotulo: 'Motivo do encerramento', obrigatorio: true, multilinha: true }
    });
    // R21 — retorno DESESTRUTURADO. `const ok = await confirmar(...)` compila,
    // roda e faz o "Cancelar" SEGUIR COM A ACAO: objeto e sempre truthy.
    if (!ok) return;
    const motivo = String(texto || '').trim();
    if (!motivo) return;
    try {
      const r = await encerrarContratoFluxoNovo(alvo.id, motivo);
      const ajustados = (r.titulos_ajustados_ao_valor_pago || []).length;
      avisar.sucesso([
        `Contrato ${alvo.codigo} encerrado.`,
        `Saldo zerado: ${formatMoeda(r.saldo_zerado || 0)}.`,
        `Titulos excluidos: ${(r.titulos_excluidos || []).length}.`,
        ajustados ? `Titulos parcialmente pagos fechados pelo valor pago: ${ajustados}.` : null
      ].filter(Boolean).join(' '));
      setContratoSelecionadoId(null);
      await carregar();
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao encerrar contrato.');
    }
  }

  async function excluirContratoItem(contrato) {
    // R26 — alvo fixado ANTES do await, pelo mesmo motivo do encerramento.
    const alvo = contrato;
    /*
      CONSENTIMENTO — o texto antigo era "Excluir o contrato X?" e nao dizia
      que a exclusao e definitiva. Confirmacao destrutiva declara a
      irreversibilidade no proprio texto e identifica QUAL registro: aqui o
      codigo do contrato e a obra, que sao os dois campos pelos quais a pessoa
      reconhece a linha na tabela.
    */
    const { ok } = await confirmar({
      titulo: 'Excluir contrato',
      mensagem: `Excluir o contrato ${alvo.codigo}${alvo.obra?.nome ? ` da obra ${alvo.obra.nome}` : ''}? Esta acao nao pode ser desfeita: o contrato e seus vinculos saem do sistema e nao ha como recupera-los.`,
      rotuloConfirmar: 'Excluir contrato',
      destrutiva: true
    });
    // R21 — desestruturado; ler o objeto como booleano faria o "Cancelar"
    // excluir o contrato.
    if (!ok) return;
    try {
      await excluirContrato(alvo.id);
      setContratos((current) => current.filter((item) => String(item.id) !== String(alvo.id)));
      setContratoSelecionadoId(null);
      await carregar();
      avisar.sucesso('Contrato excluído com sucesso.');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao excluir contrato.');
    }
  }

  async function abrirAnexos(contrato) {
    try {
      setModalAnexos(contrato);
      const data = await getContratoAnexos(contrato.id);
      setAnexos(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      avisar.erro('Erro ao carregar anexos.');
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
      avisar.erro('Erro ao enviar anexos.');
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
      avisar.alerta('Utilize o arquivo modelo em CSV para importar as apropriações dos contratos.');
      return;
    }

    /*
      R26 — o alvo das tres confirmacoes e o ARQUIVO, e ele ja esta fixado na
      const `file` acima: lido de forma sincrona do evento (o input inclusive
      ja teve o `value` limpo na primeira linha), nunca relido do DOM depois
      do `await`. Trocar o arquivo no seletor com o modal aberto nao muda o
      que sera importado.
    */
    const { ok: okImportar } = await confirmar({
      titulo: 'Importar apropriações',
      mensagem: `Importar as apropriações do arquivo "${file.name}"? Esta rotina altera somente os vinculos de apropriacao dos contratos encontrados na planilha; valores solicitados, pagos, ajustes, saldo, credores e descricoes nao sao alterados.`,
      rotuloConfirmar: 'Continuar'
    });
    // R21 — desestruturado nas TRES confirmacoes desta funcao.
    if (!okImportar) return;

    /*
      Escolha de MODO, nao cancelamento. No `confirm` do navegador esta
      pergunta era "OK = substituir / Cancelar = apenas adicionar" — um botao
      chamado "Cancelar" que NAO cancelava, e seguia com a importacao. Aqui os
      dois rotulos dizem o que fazem, e a mensagem diz o que acontece se a
      caixa for fechada — o modal do sistema tem saidas que o `confirm` nao
      tinha (Escape e clique no fundo), e nenhuma delas pode levar a uma acao
      que a pessoa nao escolheu. Fechar cai no modo ADITIVO, que nao apaga
      nada; a importacao em si ja foi consentida no passo anterior.
    */
    const { ok: substituir } = await confirmar({
      titulo: 'Modo da importação',
      mensagem: `Como aplicar as apropriações do arquivo "${file.name}" aos contratos listados nele? "Substituir" troca os vinculos de apropriacao atuais desses contratos; "Apenas adicionar/atualizar" mantem os atuais e so acrescenta o que esta na planilha. Fechar esta caixa segue pelo modo "apenas adicionar/atualizar".`,
      rotuloConfirmar: 'Substituir as apropriações atuais',
      rotuloCancelar: 'Apenas adicionar/atualizar'
    });

    if (substituir) {
      // CONSENTIMENTO — a confirmacao destrutiva declara a irreversibilidade e
      // identifica o alvo (o arquivo cujos contratos serao trocados).
      const { ok: okSubstituir } = await confirmar({
        titulo: 'Confirmar substituição',
        mensagem: `Substituir as apropriações atuais dos contratos listados em "${file.name}"? Esta acao nao pode ser desfeita: os vinculos de apropriacao atuais desses contratos sao trocados pelos da planilha. Os valores financeiros dos contratos sao preservados.`,
        rotuloConfirmar: 'Substituir',
        destrutiva: true
      });
      if (!okSubstituir) return;
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
        // A faixa do sistema e texto corrido: o resumo junta com separador
        // visivel em vez de quebra de linha, que a caixa do navegador exibia.
        const resumoErros = erros
          .slice(0, 5)
          .map(item => `Linha ${item.linha}: ${item.error}`)
          .join(' · ');
        avisar.alerta(`Contratos afetados: ${contratosAfetados}. Apropriações vinculadas: ${apropriacoesVinculadas}. Ignorados: ${ignorados}. Erros: ${erros.length}. ${resumoErros}${erros.length > 5 ? ' ...' : ''}`);
      } else {
        avisar.sucesso(`Importação concluída. Contratos afetados: ${contratosAfetados}. Apropriações vinculadas: ${apropriacoesVinculadas}. Ignorados: ${ignorados}.`);
      }
    } catch (error) {
      console.error(error);
      const erros = Array.isArray(error?.details?.erros) ? error.details.erros : [];
      if (erros.length > 0) {
        const resumoErros = erros
          .slice(0, 8)
          .map(item => `Linha ${item.linha}: ${item.error}`)
          .join(' · ');
        avisar.erro(`${error?.message || 'Erro ao importar apropriações dos contratos.'} ${resumoErros}${erros.length > 8 ? ' ...' : ''}`);
      } else {
        avisar.erro(error?.message || 'Erro ao importar apropriações dos contratos.');
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
      avisar.erro(error?.message || 'Erro ao exportar contratos.');
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
      avisar.alerta(montarMensagemArquivosAcimaDoLimite(rejeitados, UPLOAD_MAX_FILE_SIZE_MB_PADRAO));
    }
  }

  function adicionarArquivosModal(fileList) {
    const { arquivos: proximoEstado, rejeitados } = concatenarAnexosPendentes(uploadAnexos, fileList, {
      maxFileSizeMb: UPLOAD_MAX_FILE_SIZE_MB_PADRAO
    });
    setUploadAnexos(proximoEstado);
    if (rejeitados.length > 0) {
      avisar.alerta(montarMensagemArquivosAcimaDoLimite(rejeitados, UPLOAD_MAX_FILE_SIZE_MB_PADRAO));
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
        avisar.erro('Arquivo inválido.');
        return;
      }
      window.open(urlArquivo, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error(error);
      avisar.erro('Erro ao visualizar anexo.');
    }
  }

  async function baixarAnexoContrato(caminhoArquivo, nomeArquivo) {
    try {
      const urlArquivo = await obterUrlAssinada(caminhoArquivo);
      if (!urlArquivo) {
        avisar.erro('Arquivo inválido.');
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
      avisar.erro('Erro ao baixar anexo.');
    }
  }

  /*
    R12/R23 — a faixa de filtros vira a BarraFiltros do sistema: busca larga em
    cima e, abaixo, o recorte por MARCACAO com etiquetas removiveis. O que
    mudou de forma, e por que:

    - OBRA era um <select> de escolha unica (o defeito que a R12 nomeia: com
      select o estado do filtro so e visivel abrindo a lista). Vira marcacao
      com etiqueta na faixa. Como o servico aceita um `obra_id` so, a dimensao
      e `unico`.
    - CODIGO ocupa a busca unica da faixa (F1: uma busca por contexto) — e a
      coluna de identidade da tabela, entao e por ele que se procura.
    - REFERENCIA fica em `campos`, o espaco declarado da BarraFiltros para o
      recorte que NAO e enumeravel: nao existe lista fechada de referencias de
      contrato para marcar. Nao e porta dos fundos — o recorte enumeravel
      (obra) esta em `filtros`, com marcacao.
    - O botao "Buscar" SAI: com 3 dimensoes a tela esta abaixo do criterio de
      consulta cara da R23, entao o recorte aplica ao marcar/digitar.
  */
  function renderFiltros() {
    return (
      <BarraFiltros
        busca={visibilidadeFiltros.ehVisivel('codigo') ? {
          valor: filtros.codigo,
          aoMudar: (valor) => setFiltros((prev) => ({ ...prev, codigo: valor })),
          placeholder: 'Buscar pelo código do contrato'
        } : null}
        campos={[{
          id: 'ref',
          rotulo: 'Ref. do Contrato',
          tipo: 'text',
          valor: filtros.ref,
          aoMudar: (valor) => setFiltros((prev) => ({ ...prev, ref: valor }))
        }].filter((campo) => visibilidadeFiltros.ehVisivel(campo.id))}
        filtros={[{
          id: 'obra',
          rotulo: 'Obra',
          unico: true,
          opcoes: obras.map((obra) => ({
            valor: String(obra.id),
            rotulo: `${obra.codigo} - ${obra.nome}`
          }))
        }].filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
        ativos={{ obra: filtros.obra }}
        aoAlternar={(dimensao, valor, opcoes) => setFiltros((prev) => ({
          ...alternarValorFiltro(prev, dimensao, valor, opcoes),
          codigo: prev.codigo,
          ref: prev.ref
        }))}
        aoLimpar={limparFiltros}
        visibilidade={visibilidadeFiltros}
      />
    );
  }

  // B5 — o "Acesso restrito" era um paragrafo solto ocupando a tela inteira,
  // sem cabecalho e sem superficie. Agora tem faixa fixa e bloco, como
  // qualquer outro estado da tela.
  if (!podeAcessar) {
    return (
      <Pagina>
        <PageHeader titulo="Gestão de Contratos" descricao={DESCRICAO_GESTAO} />
        <BlocoConteudo titulo="Acesso restrito" variante="primario" cor="var(--c-primary)">
          <p className="app-note">
            Você não tem acesso aos contratos. Solicite ao administrador do sistema.
          </p>
        </BlocoConteudo>
      </Pagina>
    );
  }

  /*
    O `if (loading) return <p>Carregando contratos...</p>` saiu: com o filtro
    aplicando ao digitar (R23), ele trocaria a tela inteira — faixa fixa,
    filtros e tudo — por uma frase a cada tecla, e o campo perderia o foco.
    Quem informa o carregamento agora e a propria TabelaPadrao (`carregando`),
    no lugar onde o dado vai aparecer.
  */

  if (isSetorObra) {
    return (
      <Pagina>
        {/* R13/C1 + R5 — o h1 solto e o p.page-subtitle sobre o canvas viram a
            FAIXA FIXA do topo: com 12 colunas de contrato para rolar, o titulo
            e o apoio ficavam para tras da primeira tela. A contagem entra na
            prop `contagem`, nao embutida no texto. */}
        <PageHeader
          titulo="Gestão de Contratos"
          contagem={loading ? null : `${contratos.length} contrato(s)`}
          descricao={DESCRICAO_OBRA}
        />

        <Avisos avisos={avisos} aoFechar={fechar} />

        <BlocoConteudo titulo="Contratos das suas obras" variante="primario" cor="var(--c-primary)">
          {renderFiltros()}

          <TabelaPadrao
            colunas={[
              {
                id: 'contrato',
                titulo: 'Contrato',
                // R17: o codigo do contrato nomeia o registro desta lista.
                tipo: 'identidade',
                noCard: 'titulo',
                /*
                  T6 — mesmo remendo da ContratosRelatorioOperacional (hoje):
                  a coluna de identidade nasce em 180px e cede ao piso de
                  160px com sete colunas nesta tabela; "CT-MTJLBFMT4DL0-0..."
                  e formato real de codigo, mais largo que o piso. Sem
                  `title` em nenhum ANCESTRAL o `td` recorta com
                  `overflow: hidden` e a T6 reprova. A CelulaDupla trunca no
                  span e leva o texto completo no `title` do wrapper.
                */
                render: c => <CelulaDupla principal={c.codigo} />
              },
              /*
                As tres colunas de texto livre abaixo (obra, referencia e
                descricao) correm o mesmo risco: `tipo: 'texto'` tambem
                nasce em 180px e cede ao mesmo piso de 160px, e sao valores
                cadastrados sem teto de tamanho.
              */
              { id: 'obra', titulo: 'Obra', tipo: 'texto', render: c => <CelulaDupla principal={c.obra?.nome || '-'} /> },
              { id: 'ref_contrato', titulo: 'Ref. do Contrato', tipo: 'texto', render: c => <CelulaDupla principal={c.ref_contrato || '-'} /> },
              { id: 'descricao', titulo: 'Descrição', tipo: 'texto', render: c => <CelulaDupla principal={c.descricao || '-'} /> },
              {
                id: 'apropriacao',
                titulo: 'Itens de Apropriação',
                tipo: 'texto',
                // T6: `resumoApropriacoesContrato` concatena varios itens com
                // "; " — o pior caso e mais longo ainda que uma unica razao
                // social, mesmo tratamento.
                render: c => <CelulaDupla principal={resumoApropriacoesContrato(c)} />
              },
            {
              id: 'total_solicitado',
              titulo: 'Solicitado',
              tipo: 'valor',
              render: c => Number(c.total_solicitado || 0).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL'
              })
            },
            {
              id: 'total_pago',
              titulo: 'Pago',
              tipo: 'valor',
              render: c => Number(c.total_pago || 0).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL'
              })
            },
            {
              id: 'total_a_pagar',
              titulo: 'A pagar',
              tipo: 'valor',
              render: c => Number(c.total_a_pagar || 0).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL'
              })
            }
            ]}
            itens={contratos}
            getId={c => c.id}
            carregando={loading}
            storageKey="tabela:gestao-contratos:setor-obra"
            rotuloRolagem="Contratos das suas obras"
            vazio="Nenhum contrato encontrado."
          />
        </BlocoConteudo>
      </Pagina>
    );
  }

  /*
    R16 — UM dono para a faixa de avisos. Com um modal aberto ela vive DENTRO
    dele: o erro do salvar acontece com o modal na frente e, na pagina, ficaria
    atras do fundo escuro — dito e nao visto. Sem modal, logo abaixo da faixa
    fixa. Nunca as duas ao mesmo tempo.
  */
  const faixaAvisos = <Avisos avisos={avisos} aoFechar={fechar} />;
  const modalNoTopo = novoContratoAberto
    ? 'novo'
    : (contratoEmEdicao ? 'edicao' : (modalAnexos ? 'anexos' : null));

  return (
    <Pagina>
      {/* R13/C1 + R5 — o h1 e o p.page-subtitle soltos viram a FAIXA FIXA do
          topo, com superficie propria. Com 12 colunas de contrato para rolar,
          era exatamente o cabecalho e as acoes que sumiam da vista.
          C5: "Novo contrato" e a acao principal, sempre a um clique. */}
      <PageHeader
        titulo="Gestão de Contratos"
        contagem={loading ? null : `${contratos.length} contrato(s)`}
        descricao={DESCRICAO_GESTAO}
        acaoPrincipal={{ rotulo: 'Novo contrato', onClick: abrirNovoContrato }}
      />

      {!modalNoTopo && faixaAvisos}

      {user?.perfil === 'SUPERADMIN' && (
        /* B2 — o bloco primario da tela e a lista; a importacao e secundaria.
           O texto de apoio ("importacao segura...") passa a ser a `descricao`
           do bloco, ancorada ao titulo a que se refere. */
        <BlocoConteudo
          titulo="Importação de apropriações"
          variante="secundario"
          descricao="Importação segura: altera somente os vínculos de apropriação dos contratos listados."
        >
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-outline px-3"
              onClick={baixarModeloImportacaoContratos}
              title="Baixar modelo de apropriações dos contratos"
              aria-label="Baixar modelo de apropriações dos contratos"
            >
              <HiArrowDownTray className="w-4 h-4" />
              Modelo apropriações
            </button>

            <button
              type="button"
              className="btn btn-outline px-3"
              onClick={handleExportarContratos}
              title="Exportar contratos e apropriações (.csv)"
              aria-label="Exportar contratos e apropriações"
            >
              Exportar CSV
            </button>

            <label
              className={`btn btn-outline px-3 cursor-pointer ${importandoContratos ? 'opacity-60 pointer-events-none' : ''}`}
              title="Importar apenas apropriações dos contratos (.csv)"
              aria-label="Importar apenas apropriações dos contratos"
            >
              <HiArrowUpTray className="w-4 h-4" />
              Importar apropriações
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={onSelecionarArquivoImportacao}
                disabled={importandoContratos}
              />
            </label>
          </div>
        </BlocoConteudo>
      )}

      {/* R9 — o cadastro sai de dentro da tela e vira modal (o raciocinio
          esta na declaracao de `novoContratoAberto`). Mesmos handlers, mesmo
          payload, mesmos campos: so a moldura mudou.
          R27 — cabecalho e rodape marcados ficam FIXOS e o miolo rola: o botao
          "Criar contrato" nao sai da vista por mais alto que o formulario
          fique (apropriacoes e credores crescem por linha). */}
      {novoContratoAberto && (
        <OverlayModal
          aberto
          rotulo="Novo contrato"
          onFechar={fecharNovoContrato}
        >
          <div data-modal="cabecalho" className="app-bloco-head p-4">
            <h2 className="app-bloco-titulo">Novo contrato</h2>
            <span className="app-bloco-acoes">
              <button type="button" className="btn btn-outline btn-sm" onClick={fecharNovoContrato}>
                Fechar
              </button>
            </span>
          </div>

          <div className="p-4 space-y-4">
            {modalNoTopo === 'novo' && faixaAvisos}
            <p className="app-note">
              Cadastre contrato, valor e documentos vinculados a obra correta.
            </p>

            <form id="form-novo-contrato" onSubmit={handleCriarContrato} className="space-y-4">
              <FormSecao legenda="Dados do contrato" colunas={2}>
                <CampoForm label="Obra" obrigatorio>
                  {/* Entrada de dado do cadastro: select de FORMULARIO segue
                      legitimo (R12 vale para recorte de lista). */}
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
                </CampoForm>

                <CampoForm label="Código" obrigatorio>
                  <input
                    name="codigo"
                    value={form.codigo}
                    onChange={onChangeForm}
                    className="input w-full"
                    placeholder="Ex: CTR-001"
                  />
                </CampoForm>

                <CampoForm label="Ref. do Contrato">
                  <input
                    name="ref_contrato"
                    value={form.ref_contrato}
                    onChange={onChangeForm}
                    className="input w-full"
                  />
                </CampoForm>

                {/* R6 — campo de dinheiro usa .input-moeda: piso de 180px (cabe
                    R$ 9.999.999.999,99), alinhado a direita e tabular-nums. O
                    arquivo inteiro nao usava a classe uma vez sequer. */}
                <CampoForm label="Valor">
                  <input
                    name="valor_total"
                    value={valorDisplay}
                    inputMode="decimal"
                    onChange={e => setValorDisplay(e.target.value)}
                    onBlur={() => {
                      const numero = parseMoeda(valorDisplay);
                      setValorDisplay(numero ? formatMoeda(numero) : '');
                    }}
                    className="input input-moeda w-full"
                  />
                </CampoForm>

                <CampoForm label="Descrição" tipo="texto-longo">
                  <textarea
                    name="descricao"
                    value={form.descricao}
                    onChange={onChangeForm}
                    className="input w-full"
                    rows="3"
                  />
                </CampoForm>

                <CampoForm label="Itens de Apropriação" tipo="texto-longo">
                  <textarea
                    name="itens_apropriacao"
                    value={form.itens_apropriacao}
                    onChange={onChangeForm}
                    className="input w-full"
                    rows="3"
                    placeholder="Descreva os itens de apropriação do contrato"
                  />
                </CampoForm>
              </FormSecao>

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

              <div>
                <span className="form-label">Anexos do contrato</span>
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
                {/* R2/R25 — o "Remover" de cada anexo era texto azul cru sem
                    alvo de clique; vira botao do sistema. */}
                <PendingAttachmentsList
                  items={files}
                  onRemove={(index) => removerArquivoNovoContrato(index)}
                  className="mt-2 space-y-1"
                  itemClassName="flex items-center justify-between gap-3 text-sm bg-[var(--c-surface)] border border-[var(--c-border)] rounded px-2 py-1"
                  removeButtonClassName="btn btn-outline btn-sm"
                />
              </div>
            </form>
          </div>

          <div data-modal="rodape" className="app-actionbar p-4">
            <button
              type="submit"
              form="form-novo-contrato"
              disabled={salvando}
              className="btn btn-primary"
            >
              {salvando ? 'Salvando...' : 'Criar contrato'}
            </button>
            <button type="button" className="btn btn-outline" onClick={fecharNovoContrato}>
              Cancelar
            </button>
          </div>
        </OverlayModal>
      )}

      {/* R18 — a `.contratos-table-card` declara `overflow: hidden` no
          index.css e era ancestral do contedor de rolagem da tabela: sticky
          dentro dela (coluna fixa, cabecalho grudado) para de funcionar em
          silencio. A classe sai; quem da a superficie agora e o BlocoConteudo,
          e o `.app-table-shell` interno recorta com `overflow: clip`, que nao
          cria scrollport. Nenhuma linha de CSS foi tocada. A propria
          TabelaPadrao ja monta o `.app-table-shell` (que recorta com
          `overflow: clip`), entao nao ha involucro extra a escrever. */}
      <BlocoConteudo titulo="Contratos" variante="primario" cor="var(--c-primary)">
        {renderFiltros()}

        <TabelaPadrao
          colunas={[
            {
            id: 'contrato',
            titulo: 'Contrato',
            // R17: o codigo do contrato nomeia o registro desta lista.
            tipo: 'identidade',
            noCard: 'titulo',
            ordenavel: true,
            valorOrdenacao: c => String(c.codigo || ''),
            /*
              T6 — a coluna de identidade nasce em 180px e cede ao piso de
              160px com doze colunas nesta tabela (a que reprovou a matriz:
              "CT-MTJLBFMT4DL0-0..."). Sem `title` em nenhum ANCESTRAL o `td`
              recorta com `overflow: hidden`. A CelulaDupla trunca no span e
              leva o texto completo no `title` do wrapper.
            */
            render: c => <CelulaDupla principal={c.codigo} />
            },
            /*
              As cinco colunas de texto livre abaixo (obra, referencia,
              descricao, credores e apropriacoes) correm o mesmo risco:
              `tipo: 'texto'` tambem nasce em 180px e cede ao mesmo piso de
              160px, e sao valores cadastrados sem teto de tamanho —
              credores e apropriacoes ainda concatenam VARIOS itens com
              "; ", o que so aumenta o pior caso.
            */
            { id: 'obra', titulo: 'Obra', tipo: 'texto', render: c => <CelulaDupla principal={c.obra?.nome || '-'} /> },
            { id: 'ref_contrato', titulo: 'Ref. do Contrato', tipo: 'texto', render: c => <CelulaDupla principal={c.ref_contrato || '-'} /> },
            { id: 'descricao', titulo: 'Descrição', tipo: 'texto', render: c => <CelulaDupla principal={c.descricao || '-'} /> },
            { id: 'credores', titulo: 'Credores', tipo: 'texto', render: c => <CelulaDupla principal={resumoCredoresContrato(c)} /> },
            { id: 'apropriacao', titulo: 'Itens de Apropriação', tipo: 'texto', render: c => <CelulaDupla principal={resumoApropriacoesContrato(c)} /> },
            {
              id: 'solicitado',
              titulo: 'Solicitado',
              tipo: 'valor',
              ordenavel: true,
              valorOrdenacao: c => Number(c.total_solicitado || 0),
              render: c => Number(c.total_solicitado || 0).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL'
              })
            },
            {
              id: 'pago',
              titulo: 'Pago',
              tipo: 'valor',
              ordenavel: true,
              valorOrdenacao: c => Number(c.total_pago || 0),
              render: c => Number(c.total_pago || 0).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL'
              })
            },
            {
              id: 'a_pagar',
              titulo: 'A pagar',
              tipo: 'valor',
              ordenavel: true,
              valorOrdenacao: c => Number(c.total_a_pagar || 0),
              render: c => Number(c.total_a_pagar || 0).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL'
              })
            },
            {
              id: 'ajuste_solicitado',
              titulo: 'Ajuste Solicitado',
              tipo: 'valor',
              ordenavel: true,
              valorOrdenacao: c => Number(c.ajuste_solicitado || 0),
              render: c => Number(c.ajuste_solicitado || 0).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL'
              })
            },
            {
              id: 'ajuste_pago',
              titulo: 'Ajuste Pago',
              tipo: 'valor',
              ordenavel: true,
              valorOrdenacao: c => Number(c.ajuste_pago || 0),
              render: c => Number(c.ajuste_pago || 0).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL'
              })
            },
            {
              id: 'qtd_solicitacoes',
              titulo: 'Qtd. Solicitações',
              tipo: 'numero',
              render: c => c.total_solicitacoes || 0
            }
          ]}
          itens={contratosOrdenados}
          getId={c => c.id}
          carregando={loading}
          storageKey="tabela:gestao-contratos:principal"
          rotuloRolagem="Contratos"
          vazio="Nenhum contrato encontrado."
          aoClicarLinha={c => setContratoSelecionadoId(prev => (String(prev) === String(c.id) ? null : c.id))}
          selecao={{
            // Seleção de UM contrato (`unica`): é ela que abre a barra de
            // ações do rodapé. Sem a marca, o componente ofereceria
            // "selecionar todos" — que aqui não significa nada.
            unica: true,
            selecionados: contratoSelecionadoId === null ? [] : [contratoSelecionadoId],
            aoAlternar: id => setContratoSelecionadoId(prev => (String(prev) === String(id) ? null : id)),
            aoAlternarTodos: () => setContratoSelecionadoId(null)
          }}
          linhaSelecionada={contrato => String(contrato.id) === String(contratoSelecionadoId)}
        />
      </BlocoConteudo>

      {contratoSelecionado && (
        <div className="contratos-selection-toolbar fixed left-1/2 -translate-x-1/2 bottom-4 z-faixa-presa-acima">
          <span className="contratos-selection-toolbar__title">
            {contratoSelecionado.codigo}
          </span>
          {/* R2 — os cinco botoes desta barra traziam `!min-h-0 h-9`, que
              anula com !important o piso do `.btn` (32px no desktop, 44px no
              toque) e os deixava com 36px. Os overrides saem; a altura volta a
              ser a do sistema. */}
          <button
            type="button"
            className="btn btn-outline px-3 inline-flex items-center gap-2"
            onClick={() => abrirAnexos(contratoSelecionado)}
          >
            <HiEye className="w-4 h-4" />
            <span>Anexos</span>
          </button>
          {podeGerenciarContratos && (
            <button
              type="button"
              className="btn btn-primary px-3 inline-flex items-center gap-2"
              onClick={() => iniciarEdicao(contratoSelecionado)}
            >
              <HiPencilSquare className="w-4 h-4" />
              <span>Editar</span>
            </button>
          )}
          {podeEncerrarContratos && contratoSelecionado?.fluxo_novo
            && contratoSelecionado?.status_contrato === 'ATIVO' && (
            <button
              type="button"
              className="btn btn-outline px-3 inline-flex items-center gap-2"
              onClick={() => encerrarContratoItem(contratoSelecionado)}
              title="Zera o saldo restante e exclui os títulos em aberto"
            >
              <HiXMark className="w-4 h-4" />
              <span>Encerrar contrato</span>
            </button>
          )}
          {podeGerenciarContratos && (
            <button
              type="button"
              className="btn btn-outline px-3 inline-flex items-center gap-2"
              onClick={() => excluirContratoItem(contratoSelecionado)}
            >
              <HiTrash className="w-4 h-4" />
              <span>Excluir</span>
            </button>
          )}
          <button
            type="button"
            className="btn btn-outline px-3 inline-flex items-center gap-2"
            onClick={() => setContratoSelecionadoId(null)}
          >
            <HiXMark className="w-4 h-4" />
            <span>Limpar</span>
          </button>
        </div>
      )}

      {contratoEmEdicao && (
        <div className="contratos-edit-modal fixed inset-0 z-modal flex items-center justify-center bg-black/45 px-4 py-6">
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
              {modalNoTopo === 'edicao' && faixaAvisos}
              {/* R10 — a trilha tinha px escrito na tela (180px/220px). As
                  proporcoes ficam, as medidas saem. */}
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)]">
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

                {/* R6 — os tres campos abaixo sao dinheiro: `.input-moeda` da
                    o piso de 180px (cabe R$ 9.999.999.999,99), o alinhamento a
                    direita e o tabular-nums. */}
                <label className="sol-filter-field">
                  <span className="sol-filter-label">Valor contratado</span>
                  <input
                    type="number"
                    step="0.01"
                    name="valor_total"
                    value={formEdicao.valor_total}
                    onChange={onChangeEdicao}
                    className="input input-moeda w-full"
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
                    className="input input-moeda w-full"
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
                    className="input input-moeda w-full"
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

                <div className="sol-filter-field md:col-span-2 xl:col-span-3">
                  <span className="sol-filter-label">Negociação detalhada</span>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <label
                      className="btn btn-outline btn-sm inline-flex cursor-pointer items-center gap-2"
                      title="Anexar negociação detalhada em .docx ou .pdf"
                    >
                      <HiPaperClip className="h-4 w-4" aria-hidden="true" />
                      <span>{negociacaoEdicaoArquivo ? 'Trocar documento' : 'Anexar documento'}</span>
                      <input
                        type="file"
                        name="negociacao_detalhada_edicao"
                        accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="hidden"
                        onChange={selecionarNegociacaoEdicao}
                        disabled={salvandoEdicaoId === contratoEmEdicao.id}
                      />
                    </label>

                    {negociacaoEdicaoArquivo ? (
                      <>
                        <span className="max-w-full truncate text-xs text-[var(--c-text)]" title={negociacaoEdicaoArquivo.name} data-testid="negociacao-edicao-nome">
                          {negociacaoEdicaoArquivo.name}
                        </span>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => setNegociacaoEdicaoArquivo(null)}
                          disabled={salvandoEdicaoId === contratoEmEdicao.id}
                          aria-label="Remover negociação detalhada selecionada"
                          title="Remover documento selecionado"
                        >
                          <HiTrash className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-[var(--c-muted)]">Nenhum novo documento selecionado</span>
                    )}
                  </div>
                  <span className="mt-1 text-xs text-[var(--c-muted)]">
                    Aceita .docx ou .pdf. Se já existir uma negociação, o novo documento substituirá o atual.
                  </span>
                </div>

                {contratoEmEdicao.representante_legal_qualificacao && (
                  <div className="sol-filter-field md:col-span-2 xl:col-span-3">
                    <span className="sol-filter-label">Documentação jurídica obrigatória</span>
                    <p className="mt-1 text-xs text-[var(--c-muted)]">
                      Use estes campos para completar ou substituir os documentos exigidos antes da aprovação.
                    </p>
                    <div className="mt-2 overflow-hidden rounded-lg border border-[var(--c-border)]">
                      {[
                        ['cartao-cnpj', 'Cartão CNPJ'],
                        ['ato-constitutivo', 'Ato constitutivo'],
                        ['representante-legal', 'Documentos do representante legal']
                      ].map(([tipo, rotulo]) => {
                        const arquivo = documentacaoJuridicaEdicao[tipo];
                        return (
                          <div key={tipo} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--c-border)] px-3 py-2 last:border-b-0">
                            <div className="min-w-0">
                              <div className="text-sm font-medium">{rotulo}</div>
                              <div className="max-w-full truncate text-xs text-[var(--c-muted)]" title={arquivo?.name || ''}>
                                {arquivo?.name || 'Nenhum novo arquivo selecionado'}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="btn btn-outline btn-sm inline-flex cursor-pointer items-center gap-2">
                                <HiPaperClip className="h-4 w-4" aria-hidden="true" />
                                <span>{arquivo ? 'Trocar' : 'Selecionar'}</span>
                                <input type="file" className="hidden"
                                  accept=".pdf,.docx,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                  onChange={(event) => selecionarDocumentoJuridicoEdicao(tipo, event)}
                                  disabled={salvandoEdicaoId === contratoEmEdicao.id} />
                              </label>
                              {arquivo && (
                                <button type="button" className="btn btn-outline btn-sm"
                                  onClick={() => setDocumentacaoJuridicaEdicao((atual) => ({ ...atual, [tipo]: null }))}
                                  disabled={salvandoEdicaoId === contratoEmEdicao.id}
                                  aria-label={`Remover ${rotulo} selecionado`}>
                                  <HiTrash className="h-4 w-4" aria-hidden="true" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
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

      {/* R27 — este modal era feito a mao: painel com teto de altura,
          `overflow: hidden` e NENHUM corpo rolante proprio. Com muitos anexos
          o que saia da vista era justamente o RODAPE, isto e, o botao "Enviar
          anexos" — modal que esconde o botao de acao parece funcional e nao e.
          Migrado para o OverlayModal, onde a estrutura ja resolve: os filhos
          marcados com data-modal="cabecalho"/"rodape" ficam fixos e o miolo
          rola entre eles. */}
      {modalAnexos && (
        <OverlayModal
          aberto
          rotulo={`Anexos do contrato ${modalAnexos.codigo}`}
          largura="var(--modal-max-w-sm)"
          onFechar={() => setModalAnexos(null)}
        >
          <div data-modal="cabecalho" className="app-bloco-head p-4">
            <h2 className="app-bloco-titulo">
              Anexos do contrato {modalAnexos.codigo}
            </h2>
            <span className="app-bloco-acoes">
              {/* R2 — era um <button> sem className nenhuma: sem alvo minimo,
                  sem contorno, sem tema. */}
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setModalAnexos(null)}>
                Fechar
              </button>
            </span>
          </div>

          <div className="p-4 space-y-4">
            {modalNoTopo === 'anexos' && faixaAvisos}

            <div className="space-y-2">
              {anexos.length === 0 && (
                <p className="app-note">
                  Nenhum anexo encontrado.
                </p>
              )}
              {anexos.map(anexo => (
                <div
                  key={anexo.id}
                  className="flex items-center justify-between gap-3 text-sm border border-[var(--c-border)] rounded px-3 py-2"
                >
                  <span className="truncate flex-1" title={anexo.nome_original}>
                    {anexo.nome_original}
                  </span>
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    {/* R2/R25 — "Visualizar" era <a href="#"> com
                        preventDefault (link que nao navega, sem alvo de clique)
                        e "Baixar" um <button> sem `.btn`; os dois em azul cru.
                        Sao duas ACOES: viram botoes do sistema. */}
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => visualizarAnexoContrato(anexo.caminho_arquivo)}
                    >
                      Visualizar
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => baixarAnexoContrato(anexo.caminho_arquivo, anexo.nome_original)}
                    >
                      Baixar
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <span className="form-label">Enviar novos anexos</span>
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
                <span className="app-note">
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
                removeButtonClassName="btn btn-outline btn-sm"
              />
            </div>
          </div>

          <div data-modal="rodape" className="app-actionbar p-4">
            <button
              type="button"
              onClick={enviarAnexos}
              disabled={uploadAnexos.length === 0}
              className="btn btn-primary"
            >
              Enviar anexos
            </button>
          </div>
        </OverlayModal>
      )}

      {elementoConfirmacao}
    </Pagina>
  );
}
