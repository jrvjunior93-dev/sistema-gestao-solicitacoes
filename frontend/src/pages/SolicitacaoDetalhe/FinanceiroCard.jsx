import DateInputBR from '../../components/DateInputBR';
import { useEffect, useMemo, useRef, useState } from 'react';
import OverlayModal from '../../components/ui/OverlayModal';
import StatusBadge from '../../components/StatusBadge';
import {
  Avisos,
  BlocoConteudo,
  CampoForm,
  FormSecao,
  StatGrid,
  StatTile,
  TabelaPadrao,
  useAvisos
} from '../../components/padrao';
import PrevisoesContrato from './PrevisoesContrato';
import ModalMedicao from './ModalMedicao';
import { Link } from 'react-router-dom';
import { buscarParceiroPorId, buscarParceiros } from '../../services/parceiros';
import { cadastrarCredorSolicitacao, updateCredorSolicitacao } from '../../services/solicitacoes';
import { getEmpresasGrupo } from '../../services/empresasGrupo';
import { getObras } from '../../services/obras';
import { formatCurrencyInput, getCpfCnpjError, getPixDocumentError, maskCpfCnpj, normalizeCurrencyTyping } from '../../utils/formatters';
import {
  categoriaFinanceiraMatchesAutocomplete,
  categoriaFinanceiraMatchesSearch
} from '../../utils/categoriaFinanceira';
import CategoriaFinanceiraAutocomplete from '../../components/ui/CategoriaFinanceiraAutocomplete';
import { useAuth } from '../../contexts/AuthContext';
import { useFecharAoSair } from '../../hooks/useFecharAoSair';
import { canManagePaymentBeneficiaries } from '../../utils/acessoProduto';
import {
  atualizarPaymentBeneficiary,
  criarPaymentBeneficiary,
  gerarContaPorSolicitacao,
  getCartoesFinanceiros,
  getCategoriasFinanceiras,
  getFormasPagamentoFinanceiras,
  getPaymentBeneficiaries,
  getTitulosFinanceirosPorSolicitacao
} from '../../services/financeiro';

const PIX_TIPOS_CHAVE = ['CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA'];

const TIPOS_INTERCOMPANY = [
  ['APORTE', 'Aporte'],
  ['EMPRESTIMO', 'Emprestimo'],
  ['REEMBOLSO', 'Reembolso'],
  ['RATEIO', 'Rateio'],
  ['COBERTURA_CAIXA', 'Cobertura de caixa'],
  ['FOLHA', 'Folha'],
  ['ADMINISTRATIVO', 'Administrativo'],
  ['IMPOSTO', 'Imposto'],
  ['TRANSFERENCIA_OPERACIONAL', 'Transferencia operacional']
];

function formatCurrency(value) {
  const number = Number(value || 0);
  return number.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function normalizeCodigoBancoInput(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 8);
}

function limparDescricaoTituloCompra(value) {
  const texto = String(value || '').trim();
  if (!texto) return texto;
  if (normalizeSearchText(texto).includes('solicitacao de compra')) {
    return texto
      .replace(/\s+(Itens|Items):[\s\S]*$/i, '')
      .replace(/\s+-\s*$/g, '')
      .trim() || 'Solicitacao de compra';
  }
  if (!/solicita[cç][aã]o de compra/i.test(texto)) return texto;
  return texto
    .replace(/\s+(Itens|Items):[\s\S]*$/i, '')
    .replace(/\s+-\s*$/g, '')
    .trim() || 'Solicitacao de compra';
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getParceiroRoleLabel(tipo) {
  return String(tipo || '').trim().toUpperCase() === 'RECEBER' ? 'cliente' : 'credor';
}

function getParceiroRoleTitle(tipo) {
  const label = getParceiroRoleLabel(tipo);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function parceiroCompativelComTipo(parceiro, tipo) {
  if (!parceiro) return false;
  if (String(tipo || '').trim().toUpperCase() === 'RECEBER') {
    return parceiro.cliente !== false;
  }
  return parceiro.fornecedor !== false || parceiro.corretor === true;
}

function buildParceiroSearchParams(search, tipo, limit = 8) {
  const params = { ativo: 1, q: search, limit };
  if (String(tipo || '').trim().toUpperCase() === 'RECEBER') {
    params.cliente = 1;
  }
  return params;
}

function getParceiroPixOptions(parceiro) {
  if (!parceiro) return [];
  return [
    {
      id: 'pix_chave_fixa_1',
      label: 'Chave fixa 1',
      tipo: parceiro.pix_chave_fixa_1_tipo,
      chave: parceiro.pix_chave_fixa_1
    },
    {
      id: 'pix_chave_fixa_2',
      label: 'Chave fixa 2',
      tipo: parceiro.pix_chave_fixa_2_tipo,
      chave: parceiro.pix_chave_fixa_2
    },
    {
      id: 'pix_chave_variavel',
      label: 'Chave variável',
      tipo: parceiro.pix_chave_variavel_tipo,
      chave: parceiro.pix_chave_variavel
    }
  ].filter((item) => item.tipo && item.chave);
}

function getParceiroPixPrincipal(parceiro) {
  return getParceiroPixOptions(parceiro)[0] || null;
}

function createPaymentDraft() {
  return {
    preparar_pagamento_pix: false,
    usar_credor_como_favorecido: false,
    payment_beneficiary_id: '',
    nome: '',
    cpf_cnpj: '',
    pix_tipo_chave: 'CNPJ',
    pix_chave: ''
  };
}

function currencyToNumber(value) {
  if (value == null || value === '') return 0;
  const raw = String(value).trim().replace(/[R$\s]/gi, '');
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function isCategoriaCompativel(categoria, tipoTitulo) {
  if (!categoria || categoria.ativo === false) {
    return false;
  }

  const tipoCategoria = String(categoria.tipo || '').trim().toUpperCase();
  const tipo = String(tipoTitulo || '').trim().toUpperCase();

  return !tipoCategoria || tipoCategoria === 'AMBOS' || tipoCategoria === tipo;
}

function getTipoCartaoPorForma(forma) {
  const value = `${forma?.tipo || ''} ${forma?.codigo || ''}`.toUpperCase();
  if (value.includes('DEBITO')) return 'DEBITO';
  if (value.includes('CREDITO')) return 'CREDITO';
  return null;
}

function cartaoCompativelComForma(cartao, forma) {
  const tipoEsperado = getTipoCartaoPorForma(forma);
  if (!tipoEsperado) return true;
  return String(cartao?.tipo || 'CREDITO').trim().toUpperCase() === tipoEsperado;
}

function labelTipoCartao(value) {
  return String(value || 'CREDITO').trim().toUpperCase() === 'DEBITO' ? 'debito' : 'credito';
}

function isFormaCartao(forma) {
  const value = `${forma?.tipo || ''} ${forma?.codigo || ''}`.toUpperCase();
  return Boolean(forma?.exige_cartao) || value.includes('CARTAO');
}

function isFormaBoleto(forma) {
  const value = `${forma?.tipo || ''} ${forma?.codigo || ''} ${forma?.nome || ''}`.toUpperCase();
  return value.includes('BOLETO');
}

function isFormaOutros(forma) {
  const value = `${forma?.tipo || ''} ${forma?.codigo || ''} ${forma?.nome || ''}`.toUpperCase();
  return value.includes('OUTROS') || value.includes('OUTRO');
}

function isFormaCheque(forma) {
  const value = `${forma?.tipo || ''} ${forma?.codigo || ''} ${forma?.nome || ''}`.toUpperCase();
  return value.includes('CHEQUE');
}

function isFormaPix(forma) {
  const value = `${forma?.tipo || ''} ${forma?.codigo || ''} ${forma?.nome || ''}`.toUpperCase();
  return value.includes('PIX');
}

function formaPermiteParcelamentoOperacional(forma) {
  return Boolean(forma?.permite_parcelamento) || isFormaPix(forma) || isFormaOutros(forma);
}

function formaUsaParcelasDetalhadas(forma) {
  return Boolean(forma) && (isFormaBoleto(forma) || isFormaCheque(forma) || isFormaPix(forma) || isFormaOutros(forma));
}

function getLabelParcelaForma(forma) {
  if (isFormaCheque(forma)) return 'cheque';
  if (isFormaPix(forma)) return 'PIX';
  if (isFormaOutros(forma)) return 'guia de pagamento';
  return 'boleto';
}

function formaAceitaDadosBoletoOuGuia(forma) {
  return isFormaBoleto(forma) || isFormaOutros(forma);
}

function resolveFormaCobrancaPagamento(forma) {
  if (isFormaOutros(forma)) return 'OUTROS';
  if (isFormaBoleto(forma)) return 'BOLETO';
  return undefined;
}

function resolveFormaCobrancaPagamentos(pagamentos = [], getFormaPagamento) {
  const formaComCobranca = pagamentos
    .map((pagamento) => getFormaPagamento(pagamento?.forma_pagamento_id))
    .find((forma) => formaAceitaDadosBoletoOuGuia(forma));
  return resolveFormaCobrancaPagamento(formaComCobranca);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addMonths(dateString, amount) {
  const date = new Date(`${dateString || today()}T00:00:00`);
  if (Number.isNaN(date.getTime())) return today();
  const day = date.getDate();
  date.setMonth(date.getMonth() + Number(amount || 0), 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

function distribuirParcelasFormatadas(valorTotal, quantidade) {
  const totalCentavos = Math.round(currencyToNumber(valorTotal) * 100);
  if (!totalCentavos || !quantidade) return [];
  const base = Math.floor(totalCentavos / quantidade);
  let resto = totalCentavos - (base * quantidade);
  return Array.from({ length: quantidade }, () => {
    const centavos = base + (resto > 0 ? 1 : 0);
    if (resto > 0) resto -= 1;
    return formatCurrencyInput(centavos / 100);
  });
}

function buildParcelasDetalhadas(
  parcelasAtuais = [],
  quantidade = 1,
  dataBase = today(),
  valorTotal = '',
  { redistribuirValores = false } = {}
) {
  const valoresSugeridos = distribuirParcelasFormatadas(valorTotal, quantidade);
  return Array.from({ length: quantidade }, (_, index) => ({
    valor: redistribuirValores ? (valoresSugeridos[index] || '') : (parcelasAtuais[index]?.valor || valoresSugeridos[index] || ''),
    data_vencimento: parcelasAtuais[index]?.data_vencimento || addMonths(dataBase || today(), index),
    numero_documento: parcelasAtuais[index]?.numero_documento || '',
    banco_cobranca: parcelasAtuais[index]?.banco_cobranca || '',
    linha_digitavel: parcelasAtuais[index]?.linha_digitavel || '',
    codigo_barras: parcelasAtuais[index]?.codigo_barras || '',
    observacoes: parcelasAtuais[index]?.observacoes || '',
    cheque_numero: parcelasAtuais[index]?.cheque_numero || '',
    cheque_banco: parcelasAtuais[index]?.cheque_banco || '',
    cheque_agencia: parcelasAtuais[index]?.cheque_agencia || '',
    cheque_conta: parcelasAtuais[index]?.cheque_conta || '',
    cheque_emitente: parcelasAtuais[index]?.cheque_emitente || ''
  }));
}

function getFreteTerceiroCompraDireta(solicitacao) {
  const compraDireta = solicitacao?.compra_direta;
  if (String(compraDireta?.frete_tipo || '').toUpperCase() !== 'TERCEIRO') return null;
  if (!compraDireta?.freteCredor?.id || Number(compraDireta?.frete_valor || 0) <= 0) return null;
  return compraDireta;
}

function createPagamento(solicitacao, valor = '', categoriaFinanceiraId = '', options = {}) {
  const parceiro = options.parceiro || solicitacao?.parceiro || null;
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    parceiro_id: parceiro?.id ? String(parceiro.id) : '',
    parceiro_nome: parceiro?.nome || '',
    categoria_financeira_id: categoriaFinanceiraId ? String(categoriaFinanceiraId) : '',
    valor,
    data_vencimento: options.data_vencimento || solicitacao?.data_vencimento || today(),
    observacoes: options.observacoes || '',
    competencia_data: '',
    forma_pagamento_id: options.forma_pagamento_id || (solicitacao?.forma_pagamento_id ? String(solicitacao.forma_pagamento_id) : ''),
    cartao_id: '',
    quantidade_parcelas: '1',
    data_compra: today(),
    parcelas: []
  };
}

function createRateio(valor = '') {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    obra_id: '',
    tipo_rateio: 'PERCENTUAL',
    percentual: '',
    valor_rateio: valor,
    observacoes: ''
  };
}

function buildDefaultForm(solicitacao) {
  const valorSolicitacao = solicitacao?.valor ? formatCurrencyInput(solicitacao.valor) : '';
  const freteTerceiro = getFreteTerceiroCompraDireta(solicitacao);
  const valorItens = freteTerceiro
    ? formatCurrencyInput(solicitacao?.compra_direta?.valor_fechado || 0)
    : valorSolicitacao;
  const pagamentos = freteTerceiro
    ? [
        createPagamento(solicitacao, valorItens),
        createPagamento(solicitacao, formatCurrencyInput(freteTerceiro.frete_valor), '', {
          parceiro: freteTerceiro.freteCredor,
          data_vencimento: freteTerceiro.frete_data_vencimento,
          observacoes: `Frete pago a terceiro. Dados para pagamento: ${freteTerceiro.frete_dados_pagamento || '-'}`
        })
      ]
    : [createPagamento(solicitacao, valorSolicitacao)];
  return {
    tipo: 'PAGAR',
    status: 'ABERTO',
    empresa_id: solicitacao?.obra?.empresa_grupo_id ? String(solicitacao.obra.empresa_grupo_id) : '',
    parceiro_id: solicitacao?.parceiro?.id ? String(solicitacao.parceiro.id) : '',
    categoria_financeira_id: '',
    valor: valorSolicitacao,
    data_vencimento: solicitacao?.data_vencimento || today(),
    forma_pagamento_id: '',
    cartao_id: '',
    quantidade_parcelas: '1',
    data_compra: today(),
    banco_cobranca: '',
    linha_digitavel: '',
    codigo_barras: '',
    desconto_financeiro: '',
    considera_dre: true,
    intercompany: false,
    empresa_origem_id: '',
    empresa_destino_id: '',
    tipo_intercompany: '',
    motivo_intercompany: '',
    intercompany_group_id: '',
    elimina_consolidado: true,
    transferencia_interna: true,
    parcelas: [],
    rateios: [],
    pagamentos
  };
}

function criarCredorFormPadrao() {
  return {
    nome: '',
    cpf_cnpj: '',
    telefone: '',
    email: '',
    // PJ exige nome fantasia e representante legal (23/08). Em pessoa fisica nao se aplica: nome
    // fantasia de pessoa nao existe, e quem assina e ela mesma.
    nome_fantasia: '',
    representante_nome: '',
    representante_cpf: '',
    representante_cargo: ''
  };
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

/*
  R2/R25 — a familia semantica do StatusBadge substitui as classes de paleta
  crua que estavam aqui, PRESERVANDO o mapeamento anterior tom a tom (sky =
  info, emerald = success, amber = warning, rose = danger, slate = neutral).
  Passar `kind` explicito em vez de deixar o badge adivinhar pelo texto e
  deliberado: a heuristica generica classifica CANCELADO como neutro e
  PREVISAO como atencao, o que MUDARIA a cor que o usuario ve hoje.
*/
function familiaSituacao(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'PREVISAO') return 'info';
  if (normalized === 'LIBERADA' || normalized === 'QUITADO') return 'success';
  if (normalized === 'PARCIAL') return 'warning';
  if (normalized === 'CANCELADO' || normalized === 'ESTORNADO') return 'danger';
  return 'neutral';
}

function rotuloSituacao(status) {
  const normalized = String(status || '').toUpperCase();
  return {
    PREVISAO: 'Previsão',
    ABERTO: 'Aberto',
    LIBERADA: 'Liberada',
    PARCIAL: 'Parcial',
    QUITADO: 'Quitado',
    CANCELADO: 'Cancelado',
    ESTORNADO: 'Estornado'
  }[normalized] || status || '-';
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function ParceiroPagamentoField({ pagamento, pagamentoIndex, tipo, onSelect }) {
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  /*
    A LISTA DE PARCEIROS DO PAGAMENTO NÃO FECHAVA DE JEITO NENHUM (05/09).

    Não havia estado de aberta: a camada existia sempre que `options`
    tivesse itens, e essa lista só era esvaziada ao ESCOLHER um parceiro
    ou ao apagar a busca abaixo de dois caracteres. Como é `absolute
    z-dropdown` e este campo se repete por pagamento, a lista de um pagamento
    cobria o pagamento seguinte. Clicar fora não fazia nada; `Esc` não
    fazia nada.

    Agora existe `listaAberta`: digitar ou focar o campo abre, clicar
    fora e `Esc` fecham, sem perder o termo buscado.

    A seleção continua funcionando: o ref envolve o campo E a lista
    (clique na opção é DENTRO, o hook não fecha no `mousedown`), e a
    opção ganhou `onMouseDown` com `preventDefault` para o foco não sair
    do campo antes do `onClick`.
  */
  const campoRef = useRef(null);
  const [listaAberta, setListaAberta] = useState(false);
  useFecharAoSair(campoRef, listaAberta, () => setListaAberta(false));
  const roleLabel = getParceiroRoleLabel(tipo);
  const roleTitle = getParceiroRoleTitle(tipo);

  useEffect(() => {
    if (!search || search.trim().length < 2) {
      setOptions([]);
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      buscarParceiros(buildParceiroSearchParams(search, tipo, 6))
        .then((data) => {
          if (!active) return;
          const lista = Array.isArray(data) ? data : [];
          setOptions(lista.filter((partner) => parceiroCompativelComTipo(partner, tipo)));
        })
        .catch(() => {
          if (!active) return;
          setOptions([]);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, tipo]);

  return (
    <div className="relative text-sm" ref={campoRef}>
      <span className="mb-1 block text-[var(--c-muted)]">{roleTitle} deste titulo</span>
      <input
        className="input w-full"
        type="text"
        placeholder={pagamento?.parceiro_nome || `Buscar ${roleLabel} por nome ou CPF/CNPJ`}
        value={search}
        onFocus={() => setListaAberta(true)}
        onChange={(event) => {
          setListaAberta(true);
          setSearch(event.target.value);
        }}
      />
      {pagamento?.parceiro_nome && (
        <div className="mt-1 text-xs text-[var(--c-muted)]">
          Selecionado: {pagamento.parceiro_nome}
        </div>
      )}
      {loading && (
        <div className="mt-1 text-xs text-[var(--c-muted)]">Buscando parceiros...</div>
      )}
      {listaAberta && options.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-dropdown mt-2 max-h-52 overflow-y-auto rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-2 shadow-lg">
          {options.map((partner) => (
            <button
              key={partner.id}
              type="button"
              className="w-full rounded-xl border border-[var(--c-border)] px-3 py-2 text-left text-sm hover:bg-[var(--c-bg)]"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(pagamentoIndex, partner);
                setSearch('');
                setOptions([]);
              }}
            >
              <div className="font-medium text-[var(--c-text)]">{partner.nome}</div>
              <div className="text-xs text-[var(--c-muted)]">
                {partner.cpf_cnpj || '-'} {partner.telefone ? `- ${partner.telefone}` : ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function getEmpresaNome(empresas, empresaId) {
  return empresas.find((empresa) => String(empresa.id) === String(empresaId))?.nome || '';
}

function getEmpresaObraId(obra) {
  return obra?.empresa_grupo_id ? String(obra.empresa_grupo_id) : '';
}

function empresaIntercompanySelecionavel(empresa) {
  return empresa?.ativo !== false && String(empresa?.tipo_empresa || 'OPERACIONAL').toUpperCase() !== 'HOLDING';
}

function getCategoriaDreResumo(categoria) {
  if (!categoria) return 'Sem categoria financeira';
  if (categoria.considera_dre === false) return 'Categoria fora da DRE';
  const grupo = categoria.dre_grupo || 'Grupo DRE nao classificado';
  const subgrupo = categoria.dre_subgrupo ? ` / ${categoria.dre_subgrupo}` : '';
  return `${grupo}${subgrupo}`;
}

function isCategoriaClassificadaParaDre(categoria) {
  return Boolean(categoria && categoria.considera_dre !== false && String(categoria.dre_grupo || '').trim());
}

function ImpactoGerencialPreview({ form, categoria, empresasGrupo, totalPagamentos }) {
  const valorTitulo = roundCurrency(currencyToNumber(form.valor));
  const valorCaixa = roundCurrency(totalPagamentos || valorTitulo);
  const categoriaSelecionada = Boolean(categoria);
  const categoriaEntraDre = isCategoriaClassificadaParaDre(categoria);
  const dreAtiva = form.considera_dre !== false && categoriaEntraDre;
  const origem = getEmpresaNome(empresasGrupo, form.empresa_origem_id);
  const destino = getEmpresaNome(empresasGrupo, form.empresa_destino_id);

  const dreTexto = !form.considera_dre
    ? 'Nao entra na DRE'
      : !categoriaSelecionada
        ? 'Pendente de categoria'
      : categoria?.considera_dre === false
        ? 'Categoria fora da DRE'
        : !String(categoria?.dre_grupo || '').trim()
          ? 'Categoria sem grupo DRE'
          : 'Entra na DRE gerencial';

  const consolidadoTexto = form.intercompany
    ? form.elimina_consolidado
      ? 'Elimina no consolidado'
      : 'Mantem no consolidado'
    : 'Movimento externo';

  const caixaTexto = valorCaixa > 0
    ? `${form.tipo === 'RECEBER' ? 'Entrada' : 'Saida'} prevista de ${formatCurrency(valorCaixa)}`
    : 'Valor ainda nao informado';

  return (
    <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-bg)] p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-[var(--c-text)]">Impacto gerencial antes de salvar</div>
          <div className="text-xs text-[var(--c-muted)]">Confira DRE, caixa e consolidado deste título.</div>
        </div>
        {form.intercompany && (
          <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: 'var(--sem-warning-bg)', color: 'var(--sem-warning)' }}>
            Entre Empresas
          </span>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div
          className="rounded-xl border px-3 py-2"
          style={dreAtiva
            ? { borderColor: 'var(--sem-success-border)', background: 'var(--sem-success-bg)', color: 'var(--sem-success)' }
            : { borderColor: 'var(--sem-warning-border)', background: 'var(--sem-warning-bg)', color: 'var(--sem-warning)' }}
        >
          <div className="text-xs font-semibold uppercase tracking-[0.16em]">DRE</div>
          <div className="mt-1 text-sm font-semibold">{dreTexto}</div>
          <div className="mt-1 text-xs opacity-80">{getCategoriaDreResumo(categoria)}</div>
        </div>
        <div
          className="rounded-xl border px-3 py-2"
          style={{ borderColor: 'var(--sem-info-border)', background: 'var(--sem-info-bg)', color: 'var(--sem-info)' }}
        >
          <div className="text-xs font-semibold uppercase tracking-[0.16em]">Caixa</div>
          <div className="mt-1 text-sm font-semibold">{caixaTexto}</div>
          <div className="mt-1 text-xs opacity-80">Vai para o fluxo previsto até a baixa.</div>
        </div>
        <div
          className="rounded-xl border px-3 py-2"
          style={form.intercompany
            ? { borderColor: 'var(--sem-info-border)', background: 'var(--sem-info-bg)', color: 'var(--sem-info)' }
            : { borderColor: 'var(--c-border)', background: 'var(--c-bg)', color: 'var(--c-text)' }}
        >
          <div className="text-xs font-semibold uppercase tracking-[0.16em]">Consolidado</div>
          <div className="mt-1 text-sm font-semibold">{consolidadoTexto}</div>
          <div className="mt-1 text-xs opacity-80">
            {form.intercompany
              ? `${origem || 'Origem nao informada'} -> ${destino || 'Destino nao informado'}`
              : 'Nao ha eliminacao entre empresas.'}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FinanceiroCard({
  solicitacao,
  onTituloCriado,
  onSolicitacaoAtualizada,
  podeAcessarModuloFinanceiro = false,
  podeVisualizarTitulos = false,
  somenteLeitura = false
}) {
  const { user } = useAuth();
  const podeExecutarAcoesFinanceiras = podeAcessarModuloFinanceiro && !somenteLeitura;
  const podeGerenciarDadosPagamento = canManagePaymentBeneficiaries(user);
  const freteTerceiroObrigatorio = Boolean(getFreteTerceiroCompraDireta(solicitacao));
  // Medicao escolhida pelo botao da linha do titulo — abre os anexos, os comentarios e a edicao
  // de valor/vencimento dela (PI-16 e pedido do cliente, 20/08).
  const [medicaoAberta, setMedicaoAberta] = useState(null);
  // As parcelas que a tabela de previsoes carregou. O modal usa as MESMAS, em vez de buscar de
  // novo: duas leituras da mesma coisa acabam discordando logo depois de uma edicao.
  const [dadosContrato, setDadosContrato] = useState(null);
  // Recarrega a tabela depois que a medicao e alterada — o valor mudou nela E nas ultimas parcelas.
  const [recarregarParcelas, setRecarregarParcelas] = useState(0);
  const [titulos, setTitulos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /*
    R19/R28 — o `erro` de string solta e os tres `alert()` do navegador viraram
    UM canal so: `useAvisos`. Erro e sucesso passam pela mesma faixa semantica
    do sistema, dentro da pagina, fechavel — e o sucesso agora FICA (R28), em
    vez de sumir junto com o modal que fechava no mesmo gesto.
  */
  const { avisos, avisar, fechar: fecharAviso, limpar: limparAvisos } = useAvisos();
  const [modalOpen, setModalOpen] = useState(false);
  const [cadastroCredorModalOpen, setCadastroCredorModalOpen] = useState(false);
  const [cadastroCredorSaving, setCadastroCredorSaving] = useState(false);
  const [cadastroCredorForm, setCadastroCredorForm] = useState(() => criarCredorFormPadrao());
  const [credorModalOpen, setCredorModalOpen] = useState(false);
  const [credorSaving, setCredorSaving] = useState(false);
  const [credorSearch, setCredorSearch] = useState('');
  const [credorOptions, setCredorOptions] = useState([]);
  const [credorSearching, setCredorSearching] = useState(false);
  const [credorSelecionado, setCredorSelecionado] = useState(solicitacao?.parceiro || null);
  const [parceiroFinanceiro, setParceiroFinanceiro] = useState(solicitacao?.parceiro || null);
  const [form, setForm] = useState(() => buildDefaultForm(solicitacao));
  const [selectedPartner, setSelectedPartner] = useState(solicitacao?.parceiro || null);
  const [partnerSearch, setPartnerSearch] = useState('');
  const [partnerOptions, setPartnerOptions] = useState([]);
  const [searchingPartners, setSearchingPartners] = useState(false);
  const [categorias, setCategorias] = useState([]);
  const [loadingCategorias, setLoadingCategorias] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categoriaModalOpen, setCategoriaModalOpen] = useState(false);
  const [categoriaSearch, setCategoriaSearch] = useState('');
  /*
    AS DUAS CAMADAS DA CATEGORIA FINANCEIRA NÃO FECHAVAM DE JEITO NENHUM
    (05/09) — a lista de sugestões e o aviso "Nenhuma categoria
    encontrada", que é flutuante do mesmo jeito (`absolute`, mesma
    âncora) e por isso conta como camada, não como texto de apoio.

    Nenhuma das duas tinha estado de aberta: apareciam por texto digitado
    e sumiam só ao ESCOLHER uma categoria ou apagar a busca. Ficavam
    sobre a "Competência DRE" logo abaixo. Clicar fora não fazia nada;
    `Esc` não fazia nada.

    Um estado só governa as duas, porque as duas são a MESMA camada em
    dois estados (com resultado e sem): abrir uma e deixar a outra
    presa seria trocar metade do defeito.

    A seleção continua funcionando: o ref envolve o campo E as duas
    camadas (clique na opção é DENTRO, o hook não fecha no `mousedown`),
    e a opção ganhou `onMouseDown` com `preventDefault` para o foco não
    sair do campo antes do `onClick`.
  */
  const listaCategoriasRef = useRef(null);
  const [listaCategoriasAberta, setListaCategoriasAberta] = useState(false);
  useFecharAoSair(listaCategoriasRef, listaCategoriasAberta, () => setListaCategoriasAberta(false));
  const [formasPagamento, setFormasPagamento] = useState([]);
  const [cartoes, setCartoes] = useState([]);
  const [empresasGrupo, setEmpresasGrupo] = useState([]);
  const [obras, setObras] = useState([]);
  const [loadingObras, setLoadingObras] = useState(false);
  const [loadingPagamento, setLoadingPagamento] = useState(false);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [loadingBeneficiaries, setLoadingBeneficiaries] = useState(false);
  const [paymentDraft, setPaymentDraft] = useState(createPaymentDraft);
  const [geracaoMultiplaTitulos, setGeracaoMultiplaTitulos] = useState(
    () => Boolean(getFreteTerceiroCompraDireta(solicitacao))
  );
  const parceiroPagamentoId = selectedPartner?.id || form.parceiro_id || null;
  // A tabela de parcelas e a fonte unica do fluxo novo. Solicitacoes comuns e contratos legados
  // continuam usando a relacao generica de titulos abaixo.
  const situacaoPorTitulo = useMemo(() => new Map(
    (dadosContrato?.parcelas || [])
      .filter((parcela) => parcela.titulo_financeiro_id)
      .map((parcela) => [String(parcela.titulo_financeiro_id), parcela.situacao || parcela.status])
  ), [dadosContrato?.parcelas]);
  const usaTabelaParcelasFluxoNovo = Boolean(
    dadosContrato?.contrato?.fluxo_novo
      && String(dadosContrato.contrato.solicitacao_id) === String(solicitacao?.id)
  );
  // Enquanto a rota identifica se o contrato e novo ou legado, nao renderiza a lista generica:
  // isso evita o piscar das mesmas parcelas em dois formatos antes da resposta chegar.
  const classificandoContrato = Boolean(solicitacao?.contrato_id) && dadosContrato === null;
  const exibirTitulosDetalhados = podeVisualizarTitulos
    && !usaTabelaParcelasFluxoNovo
    && !classificandoContrato;
  const tipoSolicitacao = normalizeSearchText(
    solicitacao?.tipo?.nome
      || solicitacao?.tipo_nome
      || solicitacao?.tipo_solicitacao
      || solicitacao?.descricao_tipo
  );
  const usaTituloAutomaticoRecarga = tipoSolicitacao.includes('recarga de cartao');
  const geracaoManualDesabilitada = usaTabelaParcelasFluxoNovo
    || usaTituloAutomaticoRecarga
    || classificandoContrato;
  const motivoGeracaoManualDesabilitada = usaTituloAutomaticoRecarga
    ? 'A conta da Recarga de Cartao e criada automaticamente pela solicitacao.'
    : 'Os titulos do contrato do fluxo novo sao criados automaticamente pelo cronograma.';

  function resetModalState(baseSolicitacao = solicitacao) {
    setForm(buildDefaultForm(baseSolicitacao));
    setGeracaoMultiplaTitulos(Boolean(getFreteTerceiroCompraDireta(baseSolicitacao)));
    setSelectedPartner(baseSolicitacao?.parceiro || null);
    setSelectedCategory(null);
    setPartnerSearch('');
    setPartnerOptions([]);
    setCategoriaSearch('');
    setCategoriaModalOpen(false);
    setBeneficiaries([]);
    setLoadingBeneficiaries(false);
    setPaymentDraft(createPaymentDraft());
  }

  useEffect(() => {
    resetModalState(solicitacao);
    setCredorSelecionado(solicitacao?.parceiro || null);
    setParceiroFinanceiro(solicitacao?.parceiro || null);
    setCredorSearch('');
    setCredorOptions([]);
  }, [solicitacao]);

  useEffect(() => {
    const parceiroId = solicitacao?.parceiro?.id;
    if (!parceiroId) {
      setParceiroFinanceiro(null);
      return undefined;
    }
    // A leitura da Obra usa somente o parceiro ja entregue pela solicitacao. A busca financeira
    // completa inclui chaves PIX e outros dados operacionais que nao fazem parte deste resumo.
    if (somenteLeitura) {
      setParceiroFinanceiro(solicitacao?.parceiro || null);
      return undefined;
    }

    let active = true;
    buscarParceiroPorId(parceiroId)
      .then((parceiro) => {
        if (active) setParceiroFinanceiro(parceiro || solicitacao.parceiro);
      })
      .catch(() => {
        if (active) setParceiroFinanceiro(solicitacao.parceiro);
      });

    return () => {
      active = false;
    };
  }, [solicitacao?.parceiro?.id, somenteLeitura]);

  async function carregarTitulos() {
    if (!podeVisualizarTitulos) {
      setTitulos([]);
      limparAvisos();
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      limparAvisos();
      const data = await getTitulosFinanceirosPorSolicitacao(solicitacao.id);
      setTitulos(Array.isArray(data) ? data : []);
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao carregar titulos da solicitacao');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarTitulos();
  }, [solicitacao.id, podeVisualizarTitulos]);

  useEffect(() => {
    if (!modalOpen) return undefined;
    if (!partnerSearch || partnerSearch.trim().length < 2) {
      setSearchingPartners(false);
      setPartnerOptions([]);
      return undefined;
    }

    let active = true;
    setSearchingPartners(true);

    const timer = setTimeout(() => {
      buscarParceiros(buildParceiroSearchParams(partnerSearch, form.tipo, 8))
        .then((data) => {
          if (!active) return;
          const lista = Array.isArray(data) ? data : [];
          setPartnerOptions(lista.filter((partner) => parceiroCompativelComTipo(partner, form.tipo)));
        })
        .catch(() => {
          if (!active) return;
          setPartnerOptions([]);
        })
        .finally(() => {
          if (active) setSearchingPartners(false);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [modalOpen, partnerSearch, form.tipo]);

  useEffect(() => {
    if (!credorModalOpen) return undefined;
    if (!credorSearch || credorSearch.trim().length < 2) {
      setCredorSearching(false);
      setCredorOptions([]);
      return undefined;
    }

    let active = true;
    setCredorSearching(true);

    const timer = setTimeout(() => {
      buscarParceiros({ q: credorSearch, fornecedor: 1, ativo: 1, limit: 8 })
        .then((data) => {
          if (!active) return;
          setCredorOptions(Array.isArray(data) ? data : []);
        })
        .catch(() => {
          if (!active) return;
          setCredorOptions([]);
        })
        .finally(() => {
          if (active) setCredorSearching(false);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [credorModalOpen, credorSearch]);

  useEffect(() => {
    if (!modalOpen || !selectedPartner || parceiroCompativelComTipo(selectedPartner, form.tipo)) {
      return;
    }

    setSelectedPartner(null);
    setForm((current) => ({
      ...current,
      parceiro_id: '',
      pagamentos: (current.pagamentos || []).map((pagamento) => ({
        ...pagamento,
        parceiro_id: '',
        parceiro_nome: '',
        parceiro_busca: ''
      }))
    }));
  }, [modalOpen, selectedPartner, form.tipo]);

  useEffect(() => {
    if (!modalOpen || form.tipo !== 'PAGAR' || !parceiroPagamentoId || !podeGerenciarDadosPagamento) {
      setBeneficiaries([]);
      setLoadingBeneficiaries(false);
      setPaymentDraft(createPaymentDraft());
      return undefined;
    }

    let active = true;
    setLoadingBeneficiaries(true);

    Promise.all([
      buscarParceiroPorId(parceiroPagamentoId).catch(() => selectedPartner || null),
      getPaymentBeneficiaries({ parceiro_id: parceiroPagamentoId }).catch(() => [])
    ])
      .then(([parceiroCompleto, data]) => {
        if (!active) return;
        const lista = Array.isArray(data) ? data : [];
        const beneficiary = lista.find((item) => item.ativo !== false && item.pix_chave) || lista[0] || null;
        const pix = getParceiroPixPrincipal(parceiroCompleto);
        const possuiDadosPix = Boolean(beneficiary?.pix_chave || pix?.chave);

        setBeneficiaries(lista);
        if (parceiroCompleto?.id) {
          setSelectedPartner(parceiroCompleto);
        }
        setPaymentDraft({
          preparar_pagamento_pix: possuiDadosPix,
          usar_credor_como_favorecido: !beneficiary && Boolean(pix?.chave),
          payment_beneficiary_id: beneficiary?.id ? String(beneficiary.id) : '',
          nome: beneficiary?.nome || parceiroCompleto?.nome || '',
          cpf_cnpj: beneficiary?.cpf_cnpj || parceiroCompleto?.cpf_cnpj || '',
          pix_tipo_chave: beneficiary?.pix_tipo_chave || pix?.tipo || 'CNPJ',
          pix_chave: beneficiary?.pix_chave || pix?.chave || ''
        });
      })
      .finally(() => {
        if (active) setLoadingBeneficiaries(false);
      });

    return () => {
      active = false;
    };
  }, [modalOpen, form.tipo, parceiroPagamentoId, podeGerenciarDadosPagamento]);

  useEffect(() => {
    if (!modalOpen) return undefined;

    let active = true;
    setLoadingCategorias(true);

    getCategoriasFinanceiras()
      .then((data) => {
        if (!active) return;
        setCategorias(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        if (!active) return;
        setCategorias([]);
        avisar.erro(error?.message || 'Erro ao carregar categorias financeiras');
      })
      .finally(() => {
        if (active) setLoadingCategorias(false);
      });

    return () => {
      active = false;
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return undefined;

    let active = true;
    setLoadingObras(true);
    getObras()
      .then((data) => {
        if (active) setObras(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (active) setObras([]);
      })
      .finally(() => {
        if (active) setLoadingObras(false);
      });

    return () => {
      active = false;
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return undefined;

    let active = true;
    getEmpresasGrupo({ ativo: true })
      .then((data) => {
        if (active) setEmpresasGrupo(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (active) setEmpresasGrupo([]);
      });

    return () => {
      active = false;
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return undefined;

    let active = true;
    setLoadingPagamento(true);

    Promise.all([
      getFormasPagamentoFinanceiras(),
      getCartoesFinanceiros()
    ])
      .then(([formasData, cartoesData]) => {
        if (!active) return;
        setFormasPagamento(Array.isArray(formasData) ? formasData : []);
        setCartoes(Array.isArray(cartoesData) ? cartoesData : []);
      })
      .catch((error) => {
        if (!active) return;
        setFormasPagamento([]);
        setCartoes([]);
        avisar.erro(error?.message || 'Erro ao carregar formas de pagamento');
      })
      .finally(() => {
        if (active) setLoadingPagamento(false);
      });

    return () => {
      active = false;
    };
  }, [modalOpen]);

  useEffect(() => {
    if (selectedCategory && !isCategoriaCompativel(selectedCategory, form.tipo)) {
      setSelectedCategory(null);
      setForm((current) => ({
        ...current,
        categoria_financeira_id: '',
        pagamentos: (current.pagamentos || []).map((pagamento) => ({
          ...pagamento,
          categoria_financeira_id: ''
        }))
      }));
      setCategoriaSearch('');
    }
  }, [form.tipo, selectedCategory]);

  const totalTitulos = useMemo(() => {
    return titulos.reduce((acc, item) => acc + Number(item.valor_original || 0), 0);
  }, [titulos]);

  const categoriasCompativeis = useMemo(() => {
    return categorias.filter((categoria) => isCategoriaCompativel(categoria, form.tipo));
  }, [categorias, form.tipo]);

  const categoriasFiltradas = useMemo(() => {
    return categoriasCompativeis.filter((categoria) => {
      if (!categoriaSearch.trim()) {
        return true;
      }

      return categoriaFinanceiraMatchesAutocomplete(categoria, categoriaSearch);
    });
  }, [categoriaSearch, categoriasCompativeis]);

  const parceiroPixOptions = useMemo(
    () => getParceiroPixOptions(selectedPartner),
    [selectedPartner]
  );
  const parceiroFinanceiroPix = useMemo(
    () => getParceiroPixPrincipal(parceiroFinanceiro),
    [parceiroFinanceiro]
  );

  function getFormaPagamento(formaPagamentoId) {
    return formasPagamento.find((item) => String(item.id) === String(formaPagamentoId)) || null;
  }

  function getQuantidadeParcelas(pagamento) {
    return Math.max(Number(pagamento?.quantidade_parcelas || 1), 1);
  }

  function pagamentoUsaParcelasDetalhadas(pagamento) {
    const forma = getFormaPagamento(pagamento?.forma_pagamento_id);
    return formaUsaParcelasDetalhadas(forma);
  }

  function getValorPagamento(pagamento) {
    if (pagamentoUsaParcelasDetalhadas(pagamento)) {
      return roundCurrency((pagamento.parcelas || []).reduce((acc, parcela) => acc + currencyToNumber(parcela.valor), 0));
    }
    return roundCurrency(currencyToNumber(pagamento?.valor));
  }

  const totalPagamentos = useMemo(() => {
    return roundCurrency((form.pagamentos || []).reduce((acc, pagamento) => acc + getValorPagamento(pagamento), 0));
  }, [form.pagamentos, formasPagamento]);

  const valorSolicitacao = useMemo(() => roundCurrency(currencyToNumber(form.valor)), [form.valor]);
  const descontoFinanceiro = useMemo(() => roundCurrency(currencyToNumber(form.desconto_financeiro)), [form.desconto_financeiro]);
  const valorLiquidoPrevisto = useMemo(() => roundCurrency(valorSolicitacao - descontoFinanceiro), [valorSolicitacao, descontoFinanceiro]);
  const diferencaPagamentos = useMemo(() => roundCurrency(valorSolicitacao - totalPagamentos), [valorSolicitacao, totalPagamentos]);
  const totalBateComSolicitacao = Math.abs(diferencaPagamentos) <= 0.009;
  const totalRateioValor = useMemo(() => {
    return roundCurrency((form.rateios || []).reduce((acc, rateio) => {
      if (rateio.tipo_rateio === 'VALOR') return acc + currencyToNumber(rateio.valor_rateio);
      return acc + (valorSolicitacao * currencyToNumber(rateio.percentual) / 100);
    }, 0));
  }, [form.rateios, valorSolicitacao]);
  const totalRateioPercentual = useMemo(() => {
    return roundCurrency((form.rateios || []).reduce((acc, rateio) => {
      if (rateio.tipo_rateio === 'PERCENTUAL') return acc + currencyToNumber(rateio.percentual);
      return acc + (valorSolicitacao > 0 ? (currencyToNumber(rateio.valor_rateio) / valorSolicitacao) * 100 : 0);
    }, 0));
  }, [form.rateios, valorSolicitacao]);
  const totalRateioValido = (form.rateios || []).length === 0
    || (Math.abs(totalRateioValor - valorSolicitacao) <= 0.02 && Math.abs(totalRateioPercentual - 100) <= 0.02);
  const parceiroRoleLabel = getParceiroRoleLabel(form.tipo);
  const parceiroRoleTitle = getParceiroRoleTitle(form.tipo);

  const categoriasAutocomplete = useMemo(() => {
    if (!categoriaSearch.trim() || selectedCategory) {
      return [];
    }

    return categoriasFiltradas;
  }, [categoriaSearch, categoriasFiltradas, selectedCategory]);

  function selecionarCategoria(categoria) {
    const categoriaId = categoria?.id ? String(categoria.id) : '';
    setSelectedCategory(categoria);
    setCategoriaSearch(categoria?.nome || '');
    setForm((current) => ({
      ...current,
      categoria_financeira_id: categoriaId,
      pagamentos: (current.pagamentos || []).map((pagamento) => ({
        ...pagamento,
        categoria_financeira_id: categoriaId
      }))
    }));
    setCategoriaModalOpen(false);
  }

  function limparCategoria() {
    setSelectedCategory(null);
    setCategoriaSearch('');
    setForm((current) => ({
      ...current,
      categoria_financeira_id: '',
      pagamentos: (current.pagamentos || []).map((pagamento) => ({
        ...pagamento,
        categoria_financeira_id: ''
      }))
    }));
  }

  function updatePagamento(index, changes) {
    setForm((current) => {
      const pagamentos = [...(current.pagamentos || [])];
      pagamentos[index] = {
        ...pagamentos[index],
        ...changes
      };
      return { ...current, pagamentos };
    });
  }

  function selecionarParceiroPagamento(index, partner) {
    updatePagamento(index, {
      parceiro_id: partner?.id ? String(partner.id) : '',
      parceiro_nome: partner?.nome || ''
    });
  }

  function aplicarCredorPadraoNosPagamentos(partner) {
    setForm((current) => ({
      ...current,
      parceiro_id: partner?.id ? String(partner.id) : '',
      pagamentos: (current.pagamentos || []).map((pagamento) => ({
        ...pagamento,
        parceiro_id: partner?.id ? String(partner.id) : pagamento.parceiro_id,
        parceiro_nome: partner?.nome || pagamento.parceiro_nome
      }))
    }));
  }

  function preencherFavorecidoComParceiro(partner) {
    const pix = getParceiroPixPrincipal(partner);
    setPaymentDraft((current) => ({
      ...current,
      usar_credor_como_favorecido: true,
      payment_beneficiary_id: '',
      nome: partner?.nome || '',
      cpf_cnpj: partner?.cpf_cnpj || '',
      pix_tipo_chave: pix?.tipo || current.pix_tipo_chave || 'CNPJ',
      pix_chave: pix?.chave || ''
    }));
  }

  function updateFormaPagamento(index, formaPagamentoId) {
    setForm((current) => {
      const pagamentos = [...(current.pagamentos || [])];
      const pagamento = pagamentos[index] || createPagamento(solicitacao);
      const forma = formasPagamento.find((item) => String(item.id) === String(formaPagamentoId));
      const cartaoAtual = cartoes.find((item) => String(item.id) === String(pagamento.cartao_id));
      const manterCartao = forma?.exige_cartao && cartaoAtual && cartaoCompativelComForma(cartaoAtual, forma);
      const quantidade = formaPermiteParcelamentoOperacional(forma) ? getQuantidadeParcelas(pagamento) : 1;
      const usaParcelas = formaUsaParcelasDetalhadas(forma);
      pagamentos[index] = {
        ...pagamento,
        forma_pagamento_id: formaPagamentoId,
        cartao_id: manterCartao ? pagamento.cartao_id : '',
        quantidade_parcelas: String(quantidade),
        data_compra: forma?.exige_cartao ? (pagamento.data_compra || today()) : pagamento.data_compra,
        parcelas: usaParcelas
          ? buildParcelasDetalhadas(pagamento.parcelas, quantidade, pagamento.data_vencimento || today(), pagamento.valor)
          : []
      };
      return { ...current, pagamentos };
    });
  }

  function updateQuantidadeParcelas(index, value) {
    const quantidade = Math.max(Number(value || 1), 1);
    setForm((current) => {
      const pagamentos = [...(current.pagamentos || [])];
      const pagamento = pagamentos[index] || createPagamento(solicitacao);
      pagamentos[index] = {
        ...pagamento,
        quantidade_parcelas: value,
        parcelas: pagamentoUsaParcelasDetalhadas(pagamento)
          ? buildParcelasDetalhadas(
              pagamento.parcelas,
              quantidade,
              pagamento.data_vencimento || today(),
              pagamento.valor,
              { redistribuirValores: true }
            )
          : pagamento.parcelas
      };
      return { ...current, pagamentos };
    });
  }

  function updateValorPagamento(index, value) {
    setForm((current) => {
      const pagamentos = [...(current.pagamentos || [])];
      const pagamento = pagamentos[index] || createPagamento(solicitacao);
      const quantidade = getQuantidadeParcelas(pagamento);
      pagamentos[index] = {
        ...pagamento,
        valor: value,
        parcelas: pagamentoUsaParcelasDetalhadas(pagamento)
          ? buildParcelasDetalhadas(pagamento.parcelas, quantidade, pagamento.data_vencimento || today(), value)
          : pagamento.parcelas
      };
      return { ...current, pagamentos };
    });
  }

  function updateParcela(pagamentoIndex, parcelaIndex, field, value) {
    setForm((current) => {
      const pagamentos = [...(current.pagamentos || [])];
      const pagamento = pagamentos[pagamentoIndex] || createPagamento(solicitacao);
      const quantidade = getQuantidadeParcelas(pagamento);
      const parcelas = buildParcelasDetalhadas(pagamento.parcelas, quantidade, pagamento.data_vencimento || today(), pagamento.valor);
      parcelas[parcelaIndex] = {
        ...parcelas[parcelaIndex],
        [field]: value
      };
      pagamentos[pagamentoIndex] = {
        ...pagamento,
        parcelas,
        valor: field === 'valor'
          ? formatCurrencyInput(parcelas.reduce((acc, parcela) => acc + currencyToNumber(parcela.valor), 0))
          : pagamento.valor
      };
      return { ...current, pagamentos };
    });
  }

  function adicionarPagamento() {
    setForm((current) => ({
      ...current,
      pagamentos: [
        ...(current.pagamentos || []),
        createPagamento(
          { ...solicitacao, parceiro: selectedPartner || solicitacao?.parceiro },
          '',
          current.categoria_financeira_id
        )
      ]
    }));
  }

  function toggleGeracaoMultiplaTitulos(checked) {
    if (!checked && freteTerceiroObrigatorio) {
      return;
    }
    setGeracaoMultiplaTitulos(checked);
    if (!checked) {
      setForm((current) => {
        const primeiroPagamento = current.pagamentos?.[0] || createPagamento(solicitacao, current.valor);
        return {
          ...current,
          pagamentos: [
            {
              ...primeiroPagamento,
              categoria_financeira_id: primeiroPagamento.categoria_financeira_id || current.categoria_financeira_id,
              valor: primeiroPagamento.valor || current.valor,
              parcelas: Array.isArray(primeiroPagamento.parcelas) ? primeiroPagamento.parcelas : []
            }
          ]
        };
      });
    }
  }

  function removerPagamento(index) {
    setForm((current) => {
      const pagamentos = (current.pagamentos || []).filter((_, itemIndex) => itemIndex !== index);
      return {
        ...current,
        pagamentos: pagamentos.length
          ? pagamentos
          : [createPagamento(solicitacao, current.valor, current.categoria_financeira_id)]
      };
    });
  }

  function adicionarRateio() {
    setForm((current) => ({
      ...current,
      rateios: [...(current.rateios || []), createRateio()]
    }));
  }

  function updateRateio(index, field, value) {
    setForm((current) => {
      const rateios = [...(current.rateios || [])];
      const rateio = rateios[index] || createRateio();
      rateios[index] = {
        ...rateio,
        [field]: value
      };
      return { ...current, rateios };
    });
  }

  function removerRateio(index) {
    setForm((current) => ({
      ...current,
      rateios: (current.rateios || []).filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  function validarGeracaoConta() {
    if (!form.empresa_id) {
      return 'A obra/centro de custo da solicitacao nao possui empresa vinculada.';
    }

    if (!geracaoMultiplaTitulos && !selectedPartner?.id && !form.parceiro_id) {
      return `Selecione o ${parceiroRoleLabel} antes de gerar a conta.`;
    }

    if (!form.categoria_financeira_id) {
      return 'Selecione a categoria financeira do titulo.';
    }

    if (!form.competencia_data) {
      return 'Informe a competencia DRE real do titulo.';
    }

    if (form.tipo === 'PAGAR' && podeGerenciarDadosPagamento && paymentDraft.preparar_pagamento_pix) {
      if (!parceiroPagamentoId) {
        return 'Selecione o credor antes de informar os dados para pagamento.';
      }
      if (!paymentDraft.nome || !paymentDraft.cpf_cnpj || !paymentDraft.pix_tipo_chave || !paymentDraft.pix_chave) {
        return 'Preencha os dados PIX do favorecido para pagamento em massa.';
      }
      const documentoErro = getCpfCnpjError(paymentDraft.cpf_cnpj, {
        required: true,
        label: 'CPF/CNPJ do favorecido'
      });
      if (documentoErro) return documentoErro;
      const pixErro = getPixDocumentError(paymentDraft.pix_chave, paymentDraft.pix_tipo_chave);
      if (pixErro) return pixErro;
    }

    if (valorSolicitacao <= 0) {
      return 'A solicitacao precisa ter valor informado para gerar a conta.';
    }

    if (descontoFinanceiro < 0) {
      return 'O desconto concedido nao pode ser negativo.';
    }

    if (descontoFinanceiro > valorSolicitacao) {
      return 'O desconto concedido nao pode ser maior que o valor da solicitacao.';
    }

    if (valorLiquidoPrevisto <= 0) {
      return 'O valor liquido do titulo precisa ser maior que zero.';
    }

    const pagamentos = Array.isArray(form.pagamentos) ? form.pagamentos : [];
    if (pagamentos.length === 0) {
      return 'Informe pelo menos uma forma de pagamento.';
    }

    for (const [pagamentoIndex, pagamento] of pagamentos.entries()) {
      const forma = getFormaPagamento(pagamento.forma_pagamento_id);
      const usaDetalhe = formaUsaParcelasDetalhadas(forma);
      const usaCartao = isFormaCartao(forma);
      const valorPagamento = getValorPagamento(pagamento);
      const labelForma = `forma de pagamento ${pagamentoIndex + 1}`;

      if (!pagamento.forma_pagamento_id) {
        return `Selecione a ${labelForma}.`;
      }

      if (geracaoMultiplaTitulos && !pagamento.parceiro_id) {
        return `Selecione o ${parceiroRoleLabel} do titulo ${pagamentoIndex + 1}.`;
      }

      if (geracaoMultiplaTitulos && !(pagamento.categoria_financeira_id || form.categoria_financeira_id)) {
        return `Selecione a categoria financeira do titulo ${pagamentoIndex + 1}.`;
      }

      if (valorPagamento <= 0) {
        return `Informe o valor da ${labelForma}.`;
      }

      if (usaDetalhe) {
        const quantidade = getQuantidadeParcelas(pagamento);
        const parcelas = Array.isArray(pagamento.parcelas) ? pagamento.parcelas : [];
        if (parcelas.length !== quantidade) {
          return `Confira a quantidade de parcelas da ${labelForma}.`;
        }

        for (const [parcelaIndex, parcela] of parcelas.entries()) {
          const labelParcela = `parcela ${parcelaIndex + 1} da ${labelForma}`;
          if (currencyToNumber(parcela.valor) <= 0) {
            return `Informe o valor da ${labelParcela}.`;
          }
          if (!parcela.data_vencimento) {
            return `Informe o vencimento da ${labelParcela}.`;
          }
        }
      } else if (!usaCartao && !pagamento.data_vencimento) {
        return `Informe o vencimento da ${labelForma}.`;
      }
    }

    if (!totalBateComSolicitacao) {
      const direcao = diferencaPagamentos > 0 ? 'faltam' : 'sobram';
      return `A soma das formas de pagamento precisa ser igual ao valor da solicitacao. Valor da solicitacao: ${formatCurrency(valorSolicitacao)}. Total informado: ${formatCurrency(totalPagamentos)}. Ainda ${direcao} ${formatCurrency(Math.abs(diferencaPagamentos))}.`;
    }

    const rateios = Array.isArray(form.rateios) ? form.rateios : [];
    if (rateios.length > 0) {
      for (const [rateioIndex, rateio] of rateios.entries()) {
        if (!rateio.obra_id) {
          return `Selecione a obra/centro de custo do rateio ${rateioIndex + 1}.`;
        }
        if (rateio.tipo_rateio === 'VALOR' && currencyToNumber(rateio.valor_rateio) <= 0) {
          return `Informe o valor do rateio ${rateioIndex + 1}.`;
        }
        if (rateio.tipo_rateio === 'PERCENTUAL' && currencyToNumber(rateio.percentual) <= 0) {
          return `Informe o percentual do rateio ${rateioIndex + 1}.`;
        }
      }

      if (!totalRateioValido) {
        return `O rateio precisa fechar 100% ou ${formatCurrency(valorSolicitacao)}. Total atual: ${formatCurrency(totalRateioValor)} (${totalRateioPercentual.toFixed(2)}%).`;
      }
    }

    if (form.intercompany) {
      if (!form.empresa_origem_id) return 'Informe a empresa origem da movimentacao entre empresas.';
      if (!form.empresa_destino_id) return 'Informe a empresa destino da movimentacao entre empresas.';
      if (String(form.empresa_origem_id) === String(form.empresa_destino_id)) {
        return 'Empresa origem e destino nao podem ser iguais na movimentacao entre empresas.';
      }
      if (!form.tipo_intercompany) return 'Informe o tipo.';
    }

    return '';
  }

  async function salvarDadosPagamentoCredor() {
    if (form.tipo !== 'PAGAR' || !podeGerenciarDadosPagamento || !paymentDraft.preparar_pagamento_pix) return null;

    const beneficiaryPayload = {
      parceiro_id: Number(parceiroPagamentoId),
      nome: paymentDraft.nome,
      cpf_cnpj: onlyDigits(paymentDraft.cpf_cnpj),
      metodo_preferencial: 'PIX_CHAVE',
      pix_tipo_chave: paymentDraft.pix_tipo_chave,
      pix_chave: paymentDraft.pix_chave,
      ativo: true
    };

    const beneficiary = paymentDraft.payment_beneficiary_id
      ? await atualizarPaymentBeneficiary(paymentDraft.payment_beneficiary_id, beneficiaryPayload)
      : await criarPaymentBeneficiary(beneficiaryPayload);

    if (beneficiary?.id) {
      setPaymentDraft((current) => ({
        ...current,
        payment_beneficiary_id: String(beneficiary.id)
      }));
      setBeneficiaries((current) => {
        const restantes = current.filter((item) => String(item.id) !== String(beneficiary.id));
        return [beneficiary, ...restantes];
      });
    }

    return beneficiary;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const erroValidacao = validarGeracaoConta();
    if (erroValidacao) {
      avisar.erro(erroValidacao);
      return;
    }

    try {
      setSaving(true);
      limparAvisos();
      const impostosPayload = descontoFinanceiro > 0
        ? [{
            tipo_imposto: 'DESCONTO',
            descricao: 'Desconto concedido',
            natureza: 'RETENCAO',
            base_calculo: form.valor,
            valor: form.desconto_financeiro,
            observacoes: 'Desconto informado na geracao de conta da solicitacao.'
          }]
        : [];

      await salvarDadosPagamentoCredor();

      await gerarContaPorSolicitacao(solicitacao.id, {
        tipo: form.tipo,
        empresa_id: Number(form.empresa_id),
        status: form.status || 'ABERTO',
        parceiro_id: selectedPartner?.id || form.parceiro_id,
        categoria_financeira_id: form.categoria_financeira_id || undefined,
        competencia_data: form.competencia_data || undefined,
        forma_cobranca: form.tipo === 'PAGAR'
          ? (form.forma_cobranca || resolveFormaCobrancaPagamentos(form.pagamentos, getFormaPagamento))
          : form.forma_cobranca || undefined,
        banco_cobranca: form.banco_cobranca || undefined,
        linha_digitavel: form.linha_digitavel || undefined,
        codigo_barras: form.codigo_barras || undefined,
        valor: form.valor,
        valor_bruto: form.valor,
        valor_liquido: formatCurrencyInput(valorLiquidoPrevisto),
        impostos: impostosPayload,
        considera_dre: isCategoriaClassificadaParaDre(selectedCategory),
        intercompany: Boolean(form.intercompany),
        empresa_contraparte_id: form.intercompany
          ? Number(form.tipo === 'PAGAR' ? form.empresa_origem_id : form.empresa_destino_id) || undefined
          : undefined,
        empresa_origem_id: form.intercompany && form.empresa_origem_id ? Number(form.empresa_origem_id) : undefined,
        empresa_destino_id: form.intercompany && form.empresa_destino_id ? Number(form.empresa_destino_id) : undefined,
        tipo_intercompany: form.intercompany ? form.tipo_intercompany || undefined : undefined,
        motivo_intercompany: form.intercompany ? form.motivo_intercompany || undefined : undefined,
        intercompany_group_id: form.intercompany ? form.intercompany_group_id || undefined : undefined,
        elimina_consolidado: form.intercompany ? Boolean(form.elimina_consolidado) : false,
        transferencia_interna: form.intercompany ? Boolean(form.transferencia_interna) : false,
        tipo_rateio: form.rateios?.[0]?.tipo_rateio || undefined,
        rateios: (form.rateios || []).map((rateio) => ({
          obra_id: rateio.obra_id ? Number(rateio.obra_id) : undefined,
          tipo_rateio: rateio.tipo_rateio || 'PERCENTUAL',
          percentual: rateio.tipo_rateio === 'PERCENTUAL' ? rateio.percentual : undefined,
          valor_rateio: rateio.tipo_rateio === 'VALOR' ? rateio.valor_rateio : undefined,
          observacoes: rateio.observacoes || undefined
        })),
        pagamentos: (form.pagamentos || []).map((pagamento) => {
          const forma = getFormaPagamento(pagamento.forma_pagamento_id);
          const usaDetalhe = formaUsaParcelasDetalhadas(forma);
          return {
            parceiro_id: geracaoMultiplaTitulos ? pagamento.parceiro_id || undefined : undefined,
            categoria_financeira_id: pagamento.categoria_financeira_id || form.categoria_financeira_id || undefined,
            valor: usaDetalhe ? undefined : pagamento.valor,
            forma_pagamento_id: pagamento.forma_pagamento_id || undefined,
            cartao_id: pagamento.cartao_id || undefined,
            quantidade_parcelas: pagamento.quantidade_parcelas || undefined,
            data_compra: isFormaCartao(forma) ? pagamento.data_compra : undefined,
            data_vencimento: !isFormaCartao(forma) && !usaDetalhe ? pagamento.data_vencimento : undefined,
            observacoes: pagamento.observacoes || undefined,
            parcelas: usaDetalhe ? pagamento.parcelas : undefined
          };
        })
      });

      setModalOpen(false);
      resetModalState(solicitacao);
      await carregarTitulos();
      if (typeof onTituloCriado === 'function') {
        await onTituloCriado();
      }
      avisar.sucesso('Conta gerada com sucesso.');
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao criar título');
    } finally {
      setSaving(false);
    }
  }

  async function handleSalvarCredor() {
    try {
      setCredorSaving(true);
      limparAvisos();
      await updateCredorSolicitacao(solicitacao.id, credorSelecionado?.id || null);
      setCredorModalOpen(false);
      setCredorSearch('');
      setCredorOptions([]);
      if (typeof onSolicitacaoAtualizada === 'function') {
        await onSolicitacaoAtualizada();
      }
      avisar.sucesso('Credor atualizado com sucesso.');
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao atualizar credor');
    } finally {
      setCredorSaving(false);
    }
  }

  function handleCadastroCredorChange(event) {
    const { name, value } = event.target;
    setCadastroCredorForm((current) => ({
      ...current,
      [name]: ['cpf_cnpj', 'representante_cpf'].includes(name) ? maskCpfCnpj(value) : value
    }));
  }

  function fecharModalGerarConta() {
    limparAvisos();
    setModalOpen(false);
    resetModalState(solicitacao);
  }

  // Fechar sem salvar devolve o credor que a solicitacao TEM hoje — a escolha
  // dentro do modal e rascunho ate "Salvar credor".
  function fecharCredorModal() {
    setCredorModalOpen(false);
    setCredorSearch('');
    setCredorOptions([]);
    setCredorSelecionado(solicitacao?.parceiro || null);
  }

  function fecharCadastroCredorModal() {
    setCadastroCredorModalOpen(false);
    setCadastroCredorSaving(false);
    setCadastroCredorForm(criarCredorFormPadrao());
  }

  async function handleCadastrarCredor() {
    const documentoErro = getCpfCnpjError(cadastroCredorForm.cpf_cnpj, {
      required: true,
      label: 'CPF/CNPJ do credor'
    });
    if (documentoErro) {
      avisar.erro(documentoErro);
      return;
    }
    if (onlyDigits(cadastroCredorForm.cpf_cnpj).length === 14) {
      const representanteErro = getCpfCnpjError(cadastroCredorForm.representante_cpf, {
        required: true,
        type: 'cpf',
        label: 'CPF do representante legal'
      });
      if (representanteErro) {
        avisar.erro(representanteErro);
        return;
      }
    }
    try {
      setCadastroCredorSaving(true);
      limparAvisos();
      await cadastrarCredorSolicitacao(solicitacao.id, {
        nome: cadastroCredorForm.nome,
        cpf_cnpj: onlyDigits(cadastroCredorForm.cpf_cnpj),
        telefone: onlyDigits(cadastroCredorForm.telefone),
        email: cadastroCredorForm.email,
        // Vao vazios quando o documento e de pessoa fisica — o backend so os exige na PJ.
        nome_fantasia: cadastroCredorForm.nome_fantasia,
        representante_nome: cadastroCredorForm.representante_nome,
        representante_cpf: onlyDigits(cadastroCredorForm.representante_cpf),
        representante_cargo: cadastroCredorForm.representante_cargo
      });
      fecharCadastroCredorModal();
      if (typeof onSolicitacaoAtualizada === 'function') {
        await onSolicitacaoAtualizada();
      }
      avisar.sucesso('Credor cadastrado e vinculado com sucesso.');
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao cadastrar credor');
    } finally {
      setCadastroCredorSaving(false);
    }
  }

  // Um modal por vez: a faixa de avisos mora no modal aberto (erro ao lado do
  // campo que o causou) e volta para o bloco quando nao ha nenhum — e assim a
  // confirmacao de "conta gerada" fica visivel depois que o modal fecha (R28).
  const algumModalAberto = modalOpen || credorModalOpen || cadastroCredorModalOpen;

  /*
    R17 — toda coluna declara o que ELA E; a medida e o alinhamento vem do
    tipo, nunca da tela. `saldo` e `tipo: 'valor'`: 190px, a direita e
    tabular, dimensionada para R$ 9.999.999.999,99 sem truncar (T7).
  */
  const colunasTitulos = [
    {
      id: 'titulo',
      titulo: 'Título',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (titulo) => {
        const nome = limparDescricaoTituloCompra(titulo.descricao) || `${titulo.tipo} #${titulo.id}`;
        return podeExecutarAcoesFinanceiras ? (
          // Link para o REGISTRO RELACIONADO fica no corpo, junto do dado que
          // o origina — e e ele que da o caminho por TECLADO da linha (A1).
          <Link className="font-medium" to={`/financeiro/titulos/${titulo.id}`} title={nome}>
            {nome}
          </Link>
        ) : (
          <span className="font-medium" title={nome}>{nome}</span>
        );
      }
    },
    {
      id: 'parceiro',
      titulo: 'Parceiro',
      tipo: 'texto',
      render: (titulo) => titulo.parceiro?.nome || '-'
    },
    {
      id: 'vencimento',
      titulo: 'Vencimento',
      tipo: 'data',
      render: (titulo) => formatDate(titulo.data_vencimento)
    },
    {
      id: 'situacao',
      titulo: 'Situação',
      tipo: 'status',
      render: (titulo) => {
        const situacao = situacaoPorTitulo.get(String(titulo.id)) || titulo.status;
        return (
          <span data-testid={`situacao-titulo-${titulo.id}`}>
            <StatusBadge status={rotuloSituacao(situacao)} kind={familiaSituacao(situacao)} />
          </span>
        );
      }
    },
    {
      id: 'saldo',
      titulo: 'Saldo',
      tipo: 'valor',
      render: (titulo) => formatCurrency(titulo.valor_saldo)
    }
  ];

  return (
    <>
      <ModalMedicao
        medicao={medicaoAberta}
        historicos={solicitacao?.historicos || []}
        parcelas={dadosContrato?.parcelas || []}
        solicitacaoId={solicitacao?.id}
        podeEditar={!somenteLeitura && dadosContrato?.contrato?.permissoes?.editar_medicao === true}
        podeAprovar={!somenteLeitura && dadosContrato?.contrato?.permissoes?.aprovar === true}
        podeAnexar={somenteLeitura}
        onFechar={() => setMedicaoAberta(null)}
        onSalvo={() => setRecarregarParcelas((n) => n + 1)}
      />
      {/*
        B2 — bloco SECUNDARIO, como os demais blocos do detalhe da solicitacao.
        O primario desta tela e a identificacao do registro (Header/InfoCard);
        este card e um dos blocos de trabalho, e dois primarios na mesma tela
        seriam defeito.
      */}
      <BlocoConteudo
        titulo="Financeiro"
        variante="secundario"
        descricao={podeExecutarAcoesFinanceiras
          ? 'Gere contas a pagar ou receber sem sair do fluxo da solicitacao.'
          : 'Acompanhe titulos, parcelas, medicoes e pagamentos desta solicitacao.'}
        acoes={podeExecutarAcoesFinanceiras ? (
          <span className="app-actionbar">
            {/*
              "Ver titulos" SAIU (05/09, apontado pela matriz na C6).

              Ele levava a LISTA do modulo, nao ao registro relacionado — e a
              regra "onde a navegacao mora" (04/09) e explicita: lista de
              modulo mora no hub, registro relacionado mora no corpo. O link
              para o registro continua onde deve, na coluna de identidade da
              tabela logo abaixo.

              Nao e remocao de capacidade sem palavra: e a mesma regra ja
              aplicada nesta leva ao Kanban, as Tarefas, ao Fiscal e aos dez
              relatorios de Compras. Manter so aqui seria a tela falar um
              idioma diferente do resto do sistema.
            */}
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                limparAvisos();
                setCadastroCredorForm(criarCredorFormPadrao());
                setCadastroCredorModalOpen(true);
              }}
            >
              Cadastrar credor
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                limparAvisos();
                setCredorSelecionado(solicitacao?.parceiro || null);
                setCredorSearch('');
                setCredorOptions([]);
                setCredorModalOpen(true);
              }}
            >
              Editar credor
            </button>
            <span title={geracaoManualDesabilitada ? motivoGeracaoManualDesabilitada : undefined}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={geracaoManualDesabilitada}
                aria-label={geracaoManualDesabilitada
                  ? `Criar Título desabilitado. ${motivoGeracaoManualDesabilitada}`
                  : 'Criar Título'}
                onClick={() => {
                  limparAvisos();
                  resetModalState(solicitacao);
                  setModalOpen(true);
                }}
              >
                Criar Título
              </button>
            </span>
          </span>
        ) : null}
      >
        {!algumModalAberto && <Avisos avisos={avisos} aoFechar={fecharAviso} />}

        {/* PI-16: as previsoes de parcela do contrato, aqui no card do Financeiro — pedido do
            cliente. Antes da aprovacao nao existe titulo nenhum, entao esta e a unica leitura do
            que esta por vir; depois dela, a mesma tabela mostra o titulo e a medicao de cada
            parcela. O componente se esconde sozinho quando a solicitacao nao e a dona do
            contrato. */}
        <PrevisoesContrato
          contratoId={solicitacao?.contrato_id || null}
          solicitacaoId={solicitacao?.id}
          atualizarEm={recarregarParcelas}
          onDados={setDadosContrato}
          onAbrirMedicao={setMedicaoAberta}
          somenteLeitura={somenteLeitura}
          permitirAbrirMedicaoSomenteLeitura={somenteLeitura}
        />

        {exibirTitulosDetalhados && (
          <StatGrid colunas={4}>
            <StatTile label="Títulos" valor={titulos.length} />
            {/*
              DEFEITO DE SIGNIFICADO, corrigido no ROTULO e nao no calculo
              (o calculo nao e meu para mudar): o ladrilho soma
              `valor_original` de cada titulo, e a coluna da tabela mostra
              `valor_saldo`. Sao duas grandezas diferentes, e o rotulo "Total"
              deixava o leitor tentar fechar uma com a outra. Agora cada um
              diz o que e. Relatado ao responsavel.
            */}
            <StatTile
              label="Total original"
              valor={formatCurrency(totalTitulos)}
              sub="Soma do valor original dos títulos (a coluna Saldo mostra o que resta)"
            />
            <StatTile
              label="Parceiro"
              valor={parceiroFinanceiro?.nome || 'Nao vinculado'}
              sub={podeExecutarAcoesFinanceiras && parceiroFinanceiroPix
                ? `PIX: ${parceiroFinanceiroPix.tipo} - ${parceiroFinanceiroPix.chave}`
                : undefined}
              title={podeExecutarAcoesFinanceiras ? (parceiroFinanceiroPix?.chave || undefined) : undefined}
            />
            <StatTile
              label="Valor sugerido"
              valor={solicitacao.valor ? formatCurrency(solicitacao.valor) : 'Nao informado'}
            />
          </StatGrid>
        )}

        {exibirTitulosDetalhados && (
          <TabelaPadrao
            colunas={colunasTitulos}
            itens={titulos}
            getId={(titulo) => titulo.id}
            carregando={loading}
            storageKey="tabela:solicitacao-detalhe:titulos-financeiros"
            vazio="Nenhum título financeiro foi gerado para esta solicitação."
            rotuloRolagem="Titulos financeiros da solicitacao"
          />
        )}
      </BlocoConteudo>

      {/*
        R9 — cadastrar um credor INTERROMPE o trabalho principal (o detalhe da
        solicitacao), entao e modal mesmo. R27 — a casca agora e o
        `OverlayModal`: o corpo rola, cabecalho e rodape ficam, e o botao
        "Cadastrar e vincular" nao some quando o formulario cresce (ele cresce:
        CNPJ acrescenta quatro campos).
      */}
      {cadastroCredorModalOpen && (
        /*
          Sem `onFechar` DE PROPOSITO: o `OverlayModal` so liga o Escape quando
          recebe um, e este painel guarda um formulario digitado. Fechar por
          tecla acidental descartaria o cadastro. O caminho de saida sao os
          botoes "Fechar"/"Cancelar" — que e exatamente o que a versao anterior
          (feita a mao, sem tratador de teclado) fazia.
        */
        <OverlayModal
          rotulo="Cadastrar credor"
          largura="var(--modal-max-w-md, 640px)"
        >
          <div data-modal="cabecalho" className="flex items-start justify-between gap-3 border-b border-[var(--c-border)] p-4">
            <div>
              <h3 className="text-lg font-semibold text-[var(--c-text)]">Cadastrar credor</h3>
              <p className="text-sm text-[var(--c-muted)]">
                Cadastre uma pessoa como credor ativo e vincule a esta solicitação.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-outline"
              onClick={fecharCadastroCredorModal}
              disabled={cadastroCredorSaving}
            >
              Fechar
            </button>
          </div>

          <div className="p-4">
            <Avisos avisos={avisos} aoFechar={fecharAviso} />

            <FormSecao colunas={2}>
              <CampoForm label="Nome do credor">
                <input
                  className="input"
                  name="nome"
                  value={cadastroCredorForm.nome}
                  onChange={handleCadastroCredorChange}
                  placeholder="Ex.: Fornecedor ABC"
                  disabled={cadastroCredorSaving}
                />
              </CampoForm>

              <CampoForm label="CPF/CNPJ">
                <input
                  className="input"
                  name="cpf_cnpj"
                  value={cadastroCredorForm.cpf_cnpj}
                  onChange={handleCadastroCredorChange}
                  placeholder="CPF ou CNPJ do credor"
                  disabled={cadastroCredorSaving}
                />
              </CampoForm>

              <CampoForm label="Telefone">
                <input
                  className="input"
                  name="telefone"
                  value={cadastroCredorForm.telefone}
                  onChange={handleCadastroCredorChange}
                  placeholder="(00) 00000-0000"
                  disabled={cadastroCredorSaving}
                />
              </CampoForm>

              <CampoForm label="Email">
                <input
                  className="input"
                  name="email"
                  type="email"
                  value={cadastroCredorForm.email}
                  onChange={handleCadastroCredorChange}
                  placeholder="email@fornecedor.com"
                  disabled={cadastroCredorSaving}
                />
              </CampoForm>
            </FormSecao>

            {/* Aparecem e somem conforme o DOCUMENTO digitado: 14 digitos e CNPJ. Mostrar sempre
                faria o formulario pedir nome fantasia de pessoa fisica, que nao existe. */}
            {onlyDigits(cadastroCredorForm.cpf_cnpj).length === 14 && (
              <FormSecao legenda="Representante legal" colunas={2}>
                <CampoForm label="Nome fantasia" obrigatorio linha>
                  <input
                    className="input"
                    name="nome_fantasia"
                    value={cadastroCredorForm.nome_fantasia}
                    onChange={handleCadastroCredorChange}
                    placeholder="Como a empresa e conhecida"
                    disabled={cadastroCredorSaving}
                  />
                </CampoForm>

                <CampoForm label="Nome" obrigatorio>
                  <input
                    className="input"
                    name="representante_nome"
                    value={cadastroCredorForm.representante_nome}
                    onChange={handleCadastroCredorChange}
                    placeholder="Quem assina pela empresa"
                    disabled={cadastroCredorSaving}
                  />
                </CampoForm>
                <CampoForm label="CPF" obrigatorio>
                  <input
                    className="input"
                    name="representante_cpf"
                    value={cadastroCredorForm.representante_cpf}
                    onChange={handleCadastroCredorChange}
                    placeholder="Somente números"
                    disabled={cadastroCredorSaving}
                  />
                </CampoForm>
                <CampoForm label="Cargo">
                  <input
                    className="input"
                    name="representante_cargo"
                    value={cadastroCredorForm.representante_cargo}
                    onChange={handleCadastroCredorChange}
                    placeholder="Sócio, diretor, procurador"
                    disabled={cadastroCredorSaving}
                  />
                </CampoForm>
              </FormSecao>
            )}
          </div>

          <div data-modal="rodape" className="app-actionbar border-t border-[var(--c-border)] p-4">
            <button
              type="button"
              className="btn btn-outline"
              onClick={fecharCadastroCredorModal}
              disabled={cadastroCredorSaving}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCadastrarCredor}
              disabled={cadastroCredorSaving}
            >
              {cadastroCredorSaving ? 'Cadastrando...' : 'Cadastrar e vincular'}
            </button>
          </div>
        </OverlayModal>
      )}

      {/* R9/R27 — trocar o credor interrompe a leitura da solicitacao: modal.
          A casca vira `OverlayModal` para o rodape ("Salvar credor") nao sair
          do campo de visao quando a busca devolve muitos resultados. */}
      {credorModalOpen && (
        <OverlayModal
          rotulo="Editar credor da solicitação"
          largura="var(--modal-max-w-md, 640px)"
          onFechar={credorSaving ? undefined : fecharCredorModal}
        >
          <div data-modal="cabecalho" className="flex items-start justify-between gap-3 border-b border-[var(--c-border)] p-4">
            <div>
              <h3 className="text-lg font-semibold text-[var(--c-text)]">Editar credor da solicitação</h3>
              <p className="text-sm text-[var(--c-muted)]">
                Atualize o credor vinculado ao pagamento desta solicitação.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-outline"
              onClick={fecharCredorModal}
              disabled={credorSaving}
            >
              Fechar
            </button>
          </div>

          <div className="space-y-4 p-4">
            <Avisos avisos={avisos} aoFechar={fecharAviso} />

            <div className="rounded-xl bg-[var(--c-bg)] px-3 py-2 text-sm">
              <span className="block text-xs uppercase tracking-[0.18em] text-[var(--c-muted)]">Credor atual</span>
              <strong className="mt-1 block text-[var(--c-text)]">
                {credorSelecionado?.nome || 'Nenhum credor vinculado'}
              </strong>
              {credorSelecionado?.cpf_cnpj && (
                <span className="text-xs text-[var(--c-muted)]">{credorSelecionado.cpf_cnpj}</span>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm text-[var(--c-muted)]" htmlFor="solicitacao-credor-busca">
                Buscar credor
              </label>
              <div className="flex">
                <input
                  id="solicitacao-credor-busca"
                  className="input app-busca"
                  type="text"
                  value={credorSearch}
                  onChange={(event) => setCredorSearch(event.target.value)}
                  placeholder="Digite nome ou CPF/CNPJ do credor"
                  disabled={credorSaving}
                />
              </div>

              {credorSearching && (
                <div className="text-xs text-[var(--c-muted)]">Buscando credores...</div>
              )}

              {credorOptions.length > 0 && (
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-2xl border border-[var(--c-border)] p-2">
                  {credorOptions.map((credor) => (
                    <button
                      key={credor.id}
                      type="button"
                      className="w-full rounded-xl border border-[var(--c-border)] px-3 py-2 text-left text-sm hover:bg-[var(--c-bg)]"
                      onClick={() => {
                        setCredorSelecionado(credor);
                        setCredorSearch('');
                        setCredorOptions([]);
                      }}
                      disabled={credorSaving}
                    >
                      <div className="font-medium text-[var(--c-text)]">{credor.nome}</div>
                      <div className="text-xs text-[var(--c-muted)]">{credor.cpf_cnpj || 'Documento nao informado'}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div data-modal="rodape" className="app-actionbar border-t border-[var(--c-border)] p-4">
            <button
              type="button"
              className="btn btn-outline btn-perigo-suave"
              onClick={() => setCredorSelecionado(null)}
              disabled={credorSaving || !credorSelecionado}
            >
              Remover vínculo
            </button>
            <button
              type="button"
              className="btn btn-primary app-actionbar-apartada"
              onClick={handleSalvarCredor}
              disabled={credorSaving}
            >
              {credorSaving ? 'Salvando...' : 'Salvar credor'}
            </button>
          </div>
        </OverlayModal>
      )}

      {modalOpen && (
        /*
          Idem: nada de Escape aqui. Este e o formulario mais longo da tela
          (rateios, N titulos, N parcelas) — perder tudo por uma tecla seria
          pior que o defeito que a migracao veio consertar.
        */
        <OverlayModal
          rotulo="Criar Título"
          largura="var(--modal-max-w-lg, 860px)"
        >
          {/*
            R27 — o cabecalho e o rodape saem do corpo rolante. Este e o modal
            mais alto do sistema (rateios + N titulos + N parcelas cada): sem a
            marcacao, era exatamente aqui que o botao "Confirmar" ficava fora
            do painel, cortado em silencio.
          */}
          <div data-modal="cabecalho" className="flex items-start justify-between gap-3 border-b border-[var(--c-border)] p-4">
            <div>
              <h3 className="text-lg font-semibold text-[var(--c-text)]">Criar Título</h3>
              <p className="text-sm text-[var(--c-muted)]">
                O sistema sugere os dados da solicitação. Você confirma e cria o título.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-outline"
              onClick={fecharModalGerarConta}
              disabled={saving}
            >
              Fechar
            </button>
          </div>

          <div className="space-y-4 p-4">
            <Avisos avisos={avisos} aoFechar={fecharAviso} />

            <form id="form-gerar-conta" className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-[var(--c-muted)]">Tipo</span>
                  <select
                    className="input w-full"
                    value={form.tipo}
                    onChange={(event) => setForm((current) => ({ ...current, tipo: event.target.value }))}
                  >
                    <option value="PAGAR">Pagar</option>
                    <option value="RECEBER">Receber</option>
                  </select>
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-[var(--c-muted)]">Status inicial</span>
                  <select
                    className="input w-full"
                    value={form.status}
                    onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                  >
                    <option value="ABERTO">Aberto</option>
                    <option value="PREVISAO">Previsão</option>
                  </select>
                  <span className="mt-1 block text-xs text-[var(--c-muted)]">
                    Previsão entra nos relatórios, mas não permite baixa até virar aberto.
                  </span>
                </label>

                <div className="space-y-2 text-sm">
                  <span className="block text-[var(--c-muted)]">{parceiroRoleTitle}</span>
                  <input
                    className="input w-full"
                    type="text"
                    placeholder={selectedPartner?.nome || `Buscar ${parceiroRoleLabel} por nome ou CPF/CNPJ`}
                    value={partnerSearch}
                    onChange={(event) => setPartnerSearch(event.target.value)}
                  />

                  {searchingPartners && (
                    <div className="text-xs text-[var(--c-muted)]">Buscando parceiros...</div>
                  )}

                  {partnerOptions.length > 0 && (
                    <div className="max-h-48 space-y-2 overflow-y-auto rounded-2xl border border-[var(--c-border)] p-2">
                      {partnerOptions.map((partner) => (
                        <button
                          key={partner.id}
                          type="button"
                          className="w-full rounded-xl border border-[var(--c-border)] px-3 py-2 text-left text-sm hover:bg-[var(--c-bg)]"
                          onClick={() => {
                            setSelectedPartner(partner);
                            aplicarCredorPadraoNosPagamentos(partner);
                            setPartnerSearch('');
                            setPartnerOptions([]);
                          }}
                        >
                          <div className="font-medium text-[var(--c-text)]">{partner.nome}</div>
                          <div className="text-xs text-[var(--c-muted)]">{partner.cpf_cnpj || '-'} {partner.telefone ? `- ${partner.telefone}` : ''}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {/*
                  R6 — TODO campo de dinheiro desta tela (editavel ou so de
                  leitura) leva `.input-moeda`: minimo de 180px, alinhado a
                  direita e tabular, dimensionado para R$ 9.999.999.999,99. A
                  celula "Obra" e texto e continua alinhada a esquerda.
                */}
                <div className="text-sm">
                  <span className="mb-1 block text-[var(--c-muted)]">Valor</span>
                  <div className="input input-moeda flex items-center justify-end bg-[var(--c-bg)] text-[var(--c-text)]">
                    {form.valor || 'R$ 0,00'}
                  </div>
                </div>
                <div className="text-sm">
                  <span className="mb-1 block text-[var(--c-muted)]">Obra</span>
                  <div className="input flex items-center bg-[var(--c-bg)] text-[var(--c-text)]">
                    {solicitacao.obra?.nome || '-'}
                  </div>
                </div>
                <label className="text-sm">
                  <span className="mb-1 block text-[var(--c-muted)]">Desconto concedido</span>
                  <input
                    className="input input-moeda w-full"
                    placeholder="R$ 0,00"
                    value={form.desconto_financeiro}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      desconto_financeiro: normalizeCurrencyTyping(event.target.value)
                    }))}
                    onBlur={(event) => setForm((current) => ({
                      ...current,
                      desconto_financeiro: formatCurrencyInput(event.target.value)
                    }))}
                  />
                  <span className="app-note mt-2">Opcional. Reduz o valor líquido do título.</span>
                </label>
                <div className="text-sm">
                  <span className="mb-1 block text-[var(--c-muted)]">Valor líquido previsto</span>
                  <div className="input input-moeda flex items-center justify-end bg-[var(--c-bg)] text-[var(--c-text)]">
                    {formatCurrency(valorLiquidoPrevisto)}
                  </div>
                </div>
                <div className="text-sm">
                  <span className="mb-1 block text-[var(--c-muted)]">Total das formas</span>
                  <div
                    className="input input-moeda flex items-center justify-end"
                    style={totalBateComSolicitacao
                      ? { background: 'var(--sem-success-bg)', color: 'var(--sem-success)' }
                      : { background: 'var(--sem-warning-bg)', color: 'var(--sem-warning)' }}
                  >
                    {formatCurrency(totalPagamentos)}
                    {!totalBateComSolicitacao && ` (${diferencaPagamentos > 0 ? 'faltam' : 'sobram'} ${formatCurrency(Math.abs(diferencaPagamentos))})`}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <span className="block text-sm text-[var(--c-muted)]">Categoria financeira</span>
                <div className="relative" ref={listaCategoriasRef}>
                  <div className="flex gap-2">
                    <input
                      className="input w-full"
                      type="text"
                      placeholder="Digite para buscar a categoria"
                      value={categoriaSearch}
                      onFocus={() => setListaCategoriasAberta(true)}
                      onChange={(event) => {
                        setListaCategoriasAberta(true);
                        setCategoriaSearch(event.target.value);
                        if (selectedCategory) {
                          setSelectedCategory(null);
                          setForm((current) => ({
                            ...current,
                            categoria_financeira_id: '',
                            pagamentos: (current.pagamentos || []).map((pagamento) => ({
                              ...pagamento,
                              categoria_financeira_id: ''
                            }))
                          }));
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-outline shrink-0"
                      title="Pesquisar categorias"
                      aria-label="Pesquisar categorias financeiras"
                      onClick={() => setCategoriaModalOpen(true)}
                    >
                      <SearchIcon />
                    </button>
                    {selectedCategory && (
                      <button
                        type="button"
                        className="btn btn-outline shrink-0"
                        onClick={limparCategoria}
                      >
                        Limpar
                      </button>
                    )}
                  </div>

                  {listaCategoriasAberta && categoriasAutocomplete.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-dropdown mt-2 max-h-56 overflow-y-auto rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-2 shadow-lg">
                      {categoriasAutocomplete.map((categoria) => (
                        <button
                          key={categoria.id}
                          type="button"
                          className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--c-bg)]"
                          onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selecionarCategoria(categoria)}
                      >
                        <span className="block font-medium text-[var(--c-text)]">{categoria.nome}</span>
                        <span className="block text-xs text-[var(--c-muted)]">
                            {categoria.tipo} - {getCategoriaDreResumo(categoria)}
                          </span>
                      </button>
                    ))}
                    </div>
                  )}

                  {listaCategoriasAberta && categoriaSearch.trim() && !selectedCategory && !loadingCategorias && categoriasAutocomplete.length === 0 && (
                    <div className="absolute left-0 right-0 top-full z-dropdown mt-2 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-3 text-sm text-[var(--c-muted)] shadow-lg">
                      Nenhuma categoria encontrada. Use a lupa para pesquisar com mais detalhes.
                    </div>
                  )}
                </div>
                <div className="text-xs text-[var(--c-muted)]">
                  {selectedCategory
                    ? `${selectedCategory.tipo} - ${getCategoriaDreResumo(selectedCategory)}`
                    : loadingCategorias
                      ? 'Carregando categorias financeiras...'
                      : 'A categoria financeira define automaticamente se o titulo entra na DRE.'}
                </div>
              </div>

              {/*
                Estes campos usavam `app-filter-field`/`app-filter-label`, que
                sao a faixa de FILTRO do sistema — e eles nao filtram nada:
                escrevem o titulo. Alem de dizer a coisa errada no DOM, a marca
                estrutural da R12 le a faixa de filtro como filtro. Viraram
                `CampoForm`, que e o que eles sao.
              */}
              <FormSecao colunas={1}>
                <CampoForm
                  label="Competência DRE"
                  obrigatorio={isCategoriaClassificadaParaDre(selectedCategory)}
                  hint={isCategoriaClassificadaParaDre(selectedCategory)
                    ? 'Obrigatoria para DRE. Informe o periodo economico real.'
                    : 'Opcional quando o titulo nao entra na DRE.'}
                  linha
                >
                  <DateInputBR
                    className="input"
                    value={form.competencia_data}
                    onChange={(event) => setForm((current) => ({ ...current, competencia_data: event.target.value }))}
                    required={isCategoriaClassificadaParaDre(selectedCategory)}
                  />
                </CampoForm>
              </FormSecao>

              {form.tipo === 'PAGAR' && podeGerenciarDadosPagamento && (
                <div
                  className="rounded-2xl border p-3"
                  style={{ borderColor: 'var(--sem-info-border)', background: 'var(--sem-info-bg)' }}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-[var(--c-text)]">Dados para pagamento do credor</div>
                      <div className="text-xs text-[var(--c-muted)]">
                        Deixe o favorecido pronto para lotes PIX por chave.
                      </div>
                    </div>
                    <label className="flex shrink-0 items-center gap-2 text-sm font-medium text-[var(--c-text)]">
                      <input
                        type="checkbox"
                        checked={paymentDraft.preparar_pagamento_pix}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          const pix = getParceiroPixPrincipal(selectedPartner);
                          setPaymentDraft((current) => ({
                            ...current,
                            preparar_pagamento_pix: checked,
                            ...(checked && !current.pix_chave
                              ? {
                                  usar_credor_como_favorecido: Boolean(pix?.chave),
                                  nome: selectedPartner?.nome || current.nome,
                                  cpf_cnpj: selectedPartner?.cpf_cnpj || current.cpf_cnpj,
                                  pix_tipo_chave: pix?.tipo || current.pix_tipo_chave,
                                  pix_chave: pix?.chave || current.pix_chave
                                }
                              : {})
                          }));
                        }}
                      />
                      Preparar PIX
                    </label>
                  </div>

                  {paymentDraft.preparar_pagamento_pix && (
                    <FormSecao colunas={2}>
                      {loadingBeneficiaries && (
                        <div className="app-note form-campo--linha">Carregando dados bancários do credor...</div>
                      )}

                      <CampoForm label="Favorecido bancário vinculado">
                        <select
                          className="input"
                          value={paymentDraft.payment_beneficiary_id}
                          disabled={loadingBeneficiaries}
                          onChange={(event) => {
                            const beneficiary = beneficiaries.find((item) => String(item.id) === String(event.target.value));
                            setPaymentDraft((current) => ({
                              ...current,
                              usar_credor_como_favorecido: false,
                              payment_beneficiary_id: event.target.value,
                              nome: beneficiary?.nome || selectedPartner?.nome || current.nome,
                              cpf_cnpj: beneficiary?.cpf_cnpj || selectedPartner?.cpf_cnpj || current.cpf_cnpj,
                              pix_tipo_chave: beneficiary?.pix_tipo_chave || current.pix_tipo_chave,
                              pix_chave: beneficiary?.pix_chave || current.pix_chave
                            }));
                          }}
                        >
                          <option value="">Novo favorecido</option>
                          {beneficiaries.map((beneficiary) => (
                            <option key={beneficiary.id} value={beneficiary.id}>
                              {beneficiary.nome} - {beneficiary.pix_chave || 'sem PIX'}
                            </option>
                          ))}
                        </select>
                      </CampoForm>

                      <label
                        className="form-group flex items-start gap-2 rounded-xl border px-3 py-2 text-sm text-[var(--c-text)]"
                        style={{ borderColor: 'var(--sem-info-border)', background: 'var(--c-surface)' }}
                      >
                        <input
                          type="checkbox"
                          checked={paymentDraft.usar_credor_como_favorecido}
                          disabled={!selectedPartner}
                          onChange={(event) => {
                            if (event.target.checked) {
                              preencherFavorecidoComParceiro(selectedPartner);
                            } else {
                              setPaymentDraft((current) => ({ ...current, usar_credor_como_favorecido: false }));
                            }
                          }}
                        />
                        <span>
                          Usar o próprio credor como favorecido
                          <span className="mt-1 block text-xs text-[var(--c-muted)]">
                            Nome, documento e chave PIX vêm do Cadastro de Pessoas.
                          </span>
                        </span>
                      </label>

                      {paymentDraft.usar_credor_como_favorecido && parceiroPixOptions.length > 1 && (
                        <CampoForm label="Chave PIX cadastrada no credor" linha>
                          <select
                            className="input"
                            value={`${paymentDraft.pix_tipo_chave}:${paymentDraft.pix_chave}`}
                            onChange={(event) => {
                              const pix = parceiroPixOptions.find((item) => `${item.tipo}:${item.chave}` === event.target.value);
                              if (!pix) return;
                              setPaymentDraft((current) => ({
                                ...current,
                                pix_tipo_chave: pix.tipo,
                                pix_chave: pix.chave
                              }));
                            }}
                          >
                            {parceiroPixOptions.map((pix) => (
                              <option key={pix.id} value={`${pix.tipo}:${pix.chave}`}>
                                {pix.label} - {pix.tipo} {pix.chave}
                              </option>
                            ))}
                          </select>
                        </CampoForm>
                      )}

                      <CampoForm label="Nome do favorecido" obrigatorio>
                        <input
                          className="input"
                          value={paymentDraft.nome}
                          onChange={(event) => setPaymentDraft((current) => ({ ...current, nome: event.target.value }))}
                          required
                        />
                      </CampoForm>
                      <CampoForm label="CPF/CNPJ" obrigatorio>
                        <input
                          className="input"
                          value={maskCpfCnpj(paymentDraft.cpf_cnpj)}
                          onChange={(event) => setPaymentDraft((current) => ({ ...current, cpf_cnpj: maskCpfCnpj(event.target.value) }))}
                          inputMode="numeric"
                          maxLength={18}
                          required
                        />
                      </CampoForm>
                      <CampoForm label="Tipo da chave PIX">
                        <select
                          className="input"
                          value={paymentDraft.pix_tipo_chave}
                          onChange={(event) => setPaymentDraft((current) => ({ ...current, pix_tipo_chave: event.target.value }))}
                        >
                          {PIX_TIPOS_CHAVE.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
                        </select>
                      </CampoForm>
                      <CampoForm label="Chave PIX" obrigatorio>
                        <input
                          className="input"
                          value={paymentDraft.pix_chave}
                          onChange={(event) => setPaymentDraft((current) => ({ ...current, pix_chave: event.target.value }))}
                          required
                        />
                      </CampoForm>
                    </FormSecao>
                  )}
                </div>
              )}

              <div className="space-y-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-bg)] p-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-[var(--c-text)]">Rateio por obra/centro de custo</div>
                    <div className="text-xs text-[var(--c-muted)]">
                      Opcional. Use quando o título precisa compor mais de uma obra nos relatórios financeiros.
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="valor-tabular rounded-full px-3 py-1 text-xs font-semibold"
                      style={totalRateioValido
                        ? { background: 'var(--sem-success-bg)', color: 'var(--sem-success)' }
                        : { background: 'var(--sem-warning-bg)', color: 'var(--sem-warning)' }}
                    >
                      {(form.rateios || []).length === 0
                        ? 'Sem rateio'
                        : `${formatCurrency(totalRateioValor)} - ${totalRateioPercentual.toFixed(2)}%`}
                    </span>
                    <button type="button" className="btn btn-outline" onClick={adicionarRateio}>
                      Adicionar rateio
                    </button>
                  </div>
                </div>

                {(form.rateios || []).length > 0 && (
                  <div className="space-y-3">
                    {(form.rateios || []).map((rateio, rateioIndex) => (
                      <div key={rateio.id || rateioIndex} className="grid gap-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3 md:grid-cols-2 xl:grid-cols-12">
                        <label className="text-sm xl:col-span-4">
                          <span className="mb-1 block text-[var(--c-muted)]">Obra/centro de custo</span>
                          <select
                            className="input w-full"
                            value={rateio.obra_id}
                            onChange={(event) => updateRateio(rateioIndex, 'obra_id', event.target.value)}
                          >
                            <option value="">{loadingObras ? 'Carregando...' : 'Selecione'}</option>
                            {obras.map((obra) => (
                              <option key={obra.id} value={obra.id}>
                                {obra.codigo ? `${obra.codigo} - ${obra.nome}` : obra.nome}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-sm xl:col-span-2">
                          <span className="mb-1 block text-[var(--c-muted)]">Tipo</span>
                          <select
                            className="input w-full"
                            value={rateio.tipo_rateio}
                            onChange={(event) => updateRateio(rateioIndex, 'tipo_rateio', event.target.value)}
                          >
                            <option value="PERCENTUAL">Percentual</option>
                            <option value="VALOR">Valor</option>
                          </select>
                        </label>
                        {rateio.tipo_rateio === 'VALOR' ? (
                          <label className="text-sm xl:col-span-2">
                            <span className="mb-1 block text-[var(--c-muted)]">Valor</span>
                            <input
                              className="input input-moeda w-full"
                              placeholder="R$ 0,00"
                              value={rateio.valor_rateio}
                              onChange={(event) => updateRateio(rateioIndex, 'valor_rateio', normalizeCurrencyTyping(event.target.value))}
                              onBlur={(event) => updateRateio(rateioIndex, 'valor_rateio', formatCurrencyInput(event.target.value))}
                            />
                          </label>
                        ) : (
                          <label className="text-sm xl:col-span-2">
                            <span className="mb-1 block text-[var(--c-muted)]">Percentual</span>
                            <input
                              className="input w-full"
                              inputMode="decimal"
                              placeholder="0,00"
                              value={rateio.percentual}
                              onChange={(event) => updateRateio(rateioIndex, 'percentual', event.target.value)}
                            />
                          </label>
                        )}
                        <label className="text-sm xl:col-span-3">
                          <span className="mb-1 block text-[var(--c-muted)]">Observações</span>
                          <input
                            className="input w-full"
                            placeholder="Opcional"
                            value={rateio.observacoes}
                            onChange={(event) => updateRateio(rateioIndex, 'observacoes', event.target.value)}
                          />
                        </label>
                        <div className="flex items-end xl:col-span-1">
                          <button type="button" className="btn btn-outline w-full" onClick={() => removerRateio(rateioIndex)}>
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="financeiro-formas-pagamento space-y-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-bg)] p-3">
                <label className="flex items-center gap-2 text-sm text-[var(--c-text)]">
                  <input
                    type="checkbox"
                    checked={Boolean(form.intercompany)}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      intercompany: event.target.checked,
                      empresa_origem_id: event.target.checked ? current.empresa_origem_id : '',
                      empresa_destino_id: event.target.checked ? current.empresa_destino_id : '',
                      tipo_intercompany: event.target.checked ? current.tipo_intercompany : '',
                      motivo_intercompany: event.target.checked ? current.motivo_intercompany : '',
                      intercompany_group_id: event.target.checked ? current.intercompany_group_id : ''
                    }))}
                  />
                  Movimentação entre empresas do grupo
                </label>
                <div className="text-xs text-[var(--c-muted)]">
                  Use esta configuração manual para pagamentos sem cartão. Em pagamentos com cartão, o sistema usa automaticamente a empresa da conta vinculada ao cartão em cada título.
                </div>
                {form.intercompany && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <select
                      className="input w-full"
                      value={form.empresa_origem_id}
                      onChange={(event) => setForm((current) => ({
                        ...current,
                        empresa_origem_id: event.target.value,
                        empresa_destino_id: String(current.empresa_destino_id) === String(event.target.value)
                          ? ''
                          : current.empresa_destino_id
                      }))}
                    >
                      <option value="">Empresa origem</option>
                      {empresasGrupo
                        .filter(empresaIntercompanySelecionavel)
                        .map((empresa) => (
                          <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>
                        ))}
                    </select>
                    <select
                      className="input w-full"
                      value={form.empresa_destino_id}
                      onChange={(event) => setForm((current) => ({ ...current, empresa_destino_id: event.target.value }))}
                    >
                      <option value="">Empresa destino</option>
                      {empresasGrupo
                        .filter((empresa) => (
                          empresaIntercompanySelecionavel(empresa)
                          && String(empresa.id) !== String(form.empresa_origem_id)
                        ))
                        .map((empresa) => (
                          <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>
                        ))}
                    </select>
                    <select
                      className="input w-full"
                      value={form.tipo_intercompany}
                      onChange={(event) => setForm((current) => ({ ...current, tipo_intercompany: event.target.value }))}
                    >
                      <option value="">Tipo</option>
                      {TIPOS_INTERCOMPANY.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <input
                      className="input w-full"
                      value={form.motivo_intercompany}
                      onChange={(event) => setForm((current) => ({ ...current, motivo_intercompany: event.target.value }))}
                      placeholder="Motivo"
                    />
                  </div>
                )}
              </div>

              <div className="financeiro-formas-pagamento space-y-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-bg)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[var(--c-text)]">Títulos e formas de pagamento</div>
                    <div className="text-xs text-[var(--c-muted)]">
                      {geracaoMultiplaTitulos
                        ? 'Crie titulos separados com vencimento, forma e valor proprios ate fechar o valor da solicitacao.'
                        : 'Informe o titulo unico desta solicitacao. Marque a opcao abaixo para gerar multiplos titulos.'}
                    </div>
                    <label className="mt-3 flex items-center gap-2 text-sm font-medium text-[var(--c-text)]">
                      <input
                        type="checkbox"
                        checked={geracaoMultiplaTitulos}
                        disabled={freteTerceiroObrigatorio}
                        onChange={(event) => toggleGeracaoMultiplaTitulos(event.target.checked)}
                      />
                      Gerar múltiplos títulos
                    </label>
                    {freteTerceiroObrigatorio ? (
                      <div className="mt-1 text-xs" style={{ color: 'var(--sem-warning)' }}>
                        Obrigatório para separar a compra do frete pago ao terceiro.
                      </div>
                    ) : null}
                  </div>
                  {geracaoMultiplaTitulos ? (
                    <button type="button" className="btn btn-outline shrink-0" onClick={adicionarPagamento}>
                      Adicionar título
                    </button>
                  ) : null}
                </div>

                {(form.pagamentos || []).map((pagamento, pagamentoIndex) => {
                  const forma = getFormaPagamento(pagamento.forma_pagamento_id);
                  const quantidade = getQuantidadeParcelas(pagamento);
                  const usaDetalhe = formaUsaParcelasDetalhadas(forma);
                  const usaCartao = isFormaCartao(forma);
                  const cartoesFiltrados = cartoes.filter((item) => item.ativo !== false && cartaoCompativelComForma(item, forma));
                  const cartaoSelecionado = cartoesFiltrados.find((item) => String(item.id) === String(pagamento.cartao_id));
                  const empresaContaCartao = cartaoSelecionado?.contaBancaria?.empresa;
                  const empresaTitulo = empresasGrupo.find((item) => String(item.id) === String(form.empresa_id));
                  const cartaoEntreEmpresas = Boolean(
                    empresaContaCartao?.id
                    && empresaTitulo?.id
                    && String(empresaContaCartao.id) !== String(empresaTitulo.id)
                  );

                  return (
                    <div key={pagamento.id || pagamentoIndex} className="financeiro-forma-pagamento-item space-y-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--c-muted)]">
                          {geracaoMultiplaTitulos ? `Titulo ${pagamentoIndex + 1}` : 'Titulo unico'}
                        </div>
                        {/* R2 — era um <button> sem classe .btn: alvo de clique abaixo do
                            minimo de 32px. Agora e botao de verdade, em vermelho suave
                            (destrutivo visivel). */}
                        {geracaoMultiplaTitulos && (form.pagamentos || []).length > 1 && (
                          <button type="button" className="btn btn-outline btn-perigo-suave" onClick={() => removerPagamento(pagamentoIndex)}>
                            Remover
                          </button>
                        )}
                      </div>

                      {geracaoMultiplaTitulos && (
                        <ParceiroPagamentoField
                          pagamento={pagamento}
                          pagamentoIndex={pagamentoIndex}
                          tipo={form.tipo}
                          onSelect={selecionarParceiroPagamento}
                        />
                      )}

                      {geracaoMultiplaTitulos && (
                        <CategoriaFinanceiraAutocomplete
                          label="Categoria financeira deste título"
                          value={pagamento.categoria_financeira_id || form.categoria_financeira_id || ''}
                          options={categoriasCompativeis}
                          onChange={(categoriaId) => updatePagamento(pagamentoIndex, {
                            categoria_financeira_id: categoriaId
                          })}
                          helperText="A categoria deste titulo sera aplicada a todas as parcelas geradas nele."
                        />
                      )}

                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="text-sm">
                          <span className="mb-1 block text-[var(--c-muted)]">Forma de pagamento</span>
                          <select
                            className="input w-full"
                            value={pagamento.forma_pagamento_id}
                            onChange={(event) => updateFormaPagamento(pagamentoIndex, event.target.value)}
                            disabled={loadingPagamento}
                          >
                            <option value="">{loadingPagamento ? 'Carregando...' : 'Nao informar'}</option>
                            {formasPagamento.filter((item) => item.ativo !== false).map((item) => (
                              <option key={item.id} value={item.id}>{item.nome}</option>
                            ))}
                          </select>
                        </label>

                        <div className="text-sm">
                          <span className="mb-1 block text-[var(--c-muted)]">Valor desta forma</span>
                          {usaDetalhe ? (
                            <div className="financeiro-forma-pagamento-readonly input input-moeda flex items-center justify-end bg-[var(--c-bg)] text-[var(--c-text)]">
                              {pagamento.valor || 'R$ 0,00'}
                            </div>
                          ) : (
                            <input
                              className="input input-moeda w-full"
                              type="text"
                              inputMode="decimal"
                              placeholder="R$ 0,00"
                              value={pagamento.valor}
                              onChange={(event) => updateValorPagamento(pagamentoIndex, normalizeCurrencyTyping(event.target.value))}
                              onBlur={(event) => updateValorPagamento(pagamentoIndex, formatCurrencyInput(event.target.value))}
                            />
                          )}
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        {formaPermiteParcelamentoOperacional(forma) ? (
                          <label className="text-sm">
                            <span className="mb-1 block text-[var(--c-muted)]">Parcelas</span>
                            <input
                              className="input w-full"
                              type="number"
                              min="1"
                              max="120"
                              value={pagamento.quantidade_parcelas}
                              onChange={(event) => updateQuantidadeParcelas(pagamentoIndex, event.target.value)}
                            />
                          </label>
                        ) : (
                          <div className="text-sm">
                            <span className="mb-1 block text-[var(--c-muted)]">Parcelas</span>
                            <div className="financeiro-forma-pagamento-readonly input flex items-center bg-[var(--c-bg)] text-[var(--c-muted)]">1 parcela</div>
                          </div>
                        )}

                        {usaCartao ? (
                          <label className="text-sm">
                            <span className="mb-1 block text-[var(--c-muted)]">Data da compra</span>
                            <DateInputBR
                              className="input w-full"
                              value={pagamento.data_compra}
                              onChange={(event) => updatePagamento(pagamentoIndex, { data_compra: event.target.value })}
                            />
                          </label>
                        ) : usaDetalhe ? (
                          <div className="text-sm">
                            <span className="mb-1 block text-[var(--c-muted)]">Vencimento</span>
                            <div className="financeiro-forma-pagamento-readonly input flex items-center bg-[var(--c-bg)] text-[var(--c-muted)]">Definido nas parcelas</div>
                          </div>
                        ) : (
                          <label className="text-sm">
                            <span className="mb-1 block text-[var(--c-muted)]">Vencimento</span>
                            <DateInputBR
                              className="input w-full"
                              value={pagamento.data_vencimento}
                              onChange={(event) => updatePagamento(pagamentoIndex, { data_vencimento: event.target.value })}
                              required
                            />
                          </label>
                        )}
                      </div>

                      {forma?.exige_cartao && (
                        <div className="space-y-2">
                          <label className="text-sm">
                            <span className="mb-1 block text-[var(--c-muted)]">Cartão utilizado</span>
                            <select
                              className="input w-full"
                              value={pagamento.cartao_id || ''}
                              onChange={(event) => updatePagamento(pagamentoIndex, { cartao_id: event.target.value })}
                            >
                              <option value="">Selecione o cartão</option>
                              {cartoesFiltrados.map((cartao) => {
                                const empresaCartao = cartao?.contaBancaria?.empresa?.nome;
                                return (
                                  <option key={cartao.id} value={cartao.id}>
                                    {cartao.nome} {cartao.ultimos_digitos ? `- final ${cartao.ultimos_digitos}` : ''} ({labelTipoCartao(cartao.tipo)}){empresaCartao ? ` - ${empresaCartao}` : ''}
                                  </option>
                                );
                              })}
                            </select>
                            <span className="mt-1 block text-xs text-[var(--c-muted)]">
                              A conta vinculada ao cartão define a empresa que realizou o pagamento.
                            </span>
                          </label>

                          {cartaoSelecionado && (
                            <div
                              className="rounded-xl border px-3 py-2 text-xs"
                              style={cartaoEntreEmpresas
                                ? { borderColor: 'var(--sem-warning-border)', background: 'var(--sem-warning-bg)', color: 'var(--sem-warning)' }
                                : { borderColor: 'var(--sem-success-border)', background: 'var(--sem-success-bg)', color: 'var(--sem-success)' }}
                            >
                              {cartaoEntreEmpresas
                                ? `Entre empresas automatico: ${empresaContaCartao?.nome || 'empresa do cartao'} paga titulo de ${empresaTitulo?.nome || 'empresa da obra'}. O titulo e a classificacao gerencial permanecem na empresa da obra.`
                                : `Pagamento na mesma empresa do titulo: ${empresaTitulo?.nome || empresaContaCartao?.nome || 'empresa da obra'}.`}
                            </div>
                          )}
                        </div>
                      )}

                      {usaDetalhe && (
                        <div className="space-y-3">
                          <div className="text-xs text-[var(--c-muted)]">
                            Informe vencimento e valor de cada {getLabelParcelaForma(forma)}.
                          </div>
                          {(pagamento.parcelas || []).map((parcela, parcelaIndex) => (
                            <div key={parcelaIndex} className="financeiro-forma-pagamento-parcela rounded-2xl border border-[var(--c-border)] bg-[var(--c-bg)] p-3">
                              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--c-muted)]">
                                Parcela {parcelaIndex + 1}/{quantidade}
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                <label className="text-sm">
                                  <span className="mb-1 block text-[var(--c-muted)]">Valor</span>
                                  <input
                                    className="input input-moeda w-full"
                                    type="text"
                                    inputMode="decimal"
                                    value={parcela.valor || ''}
                                    onChange={(event) => updateParcela(pagamentoIndex, parcelaIndex, 'valor', normalizeCurrencyTyping(event.target.value))}
                                    onBlur={(event) => updateParcela(pagamentoIndex, parcelaIndex, 'valor', formatCurrencyInput(event.target.value))}
                                    required
                                  />
                                </label>
                                <label className="text-sm">
                                  <span className="mb-1 block text-[var(--c-muted)]">Vencimento</span>
                                  <DateInputBR
                                    className="input w-full"
                                    value={parcela.data_vencimento || ''}
                                    onChange={(event) => updateParcela(pagamentoIndex, parcelaIndex, 'data_vencimento', event.target.value)}
                                    required
                                  />
                                </label>

                                {formaAceitaDadosBoletoOuGuia(forma) && (
                                  <>
                                    <label className="text-sm md:col-span-2">
                                      <span className="mb-1 block text-[var(--c-muted)]">Documento ou referência</span>
                                      <input
                                        className="input w-full"
                                        value={parcela.numero_documento || ''}
                                        onChange={(event) => updateParcela(pagamentoIndex, parcelaIndex, 'numero_documento', event.target.value)}
                                        placeholder={isFormaOutros(forma) ? 'Referencia da guia ou pagamento' : 'Nosso numero ou referencia'}
                                      />
                                    </label>
                                    <label className="text-sm">
                                      <span className="mb-1 block text-[var(--c-muted)]">Código do banco</span>
                                      <input
                                        className="input w-full"
                                        inputMode="numeric"
                                        maxLength={8}
                                        pattern="[0-9]*"
                                        value={parcela.banco_cobranca || ''}
                                        onChange={(event) => updateParcela(pagamentoIndex, parcelaIndex, 'banco_cobranca', normalizeCodigoBancoInput(event.target.value))}
                                        placeholder="Ex.: 001, 104, 237"
                                      />
                                    </label>
                                    <label className="text-sm">
                                      <span className="mb-1 block text-[var(--c-muted)]">Linha digitável</span>
                                      <input
                                        className="input w-full"
                                        value={parcela.linha_digitavel || ''}
                                        onChange={(event) => updateParcela(pagamentoIndex, parcelaIndex, 'linha_digitavel', event.target.value)}
                                        placeholder="Linha digitável, se houver"
                                      />
                                    </label>
                                    <label className="text-sm md:col-span-2">
                                      <span className="mb-1 block text-[var(--c-muted)]">Código de barras</span>
                                      <input
                                        className="input w-full"
                                        value={parcela.codigo_barras || ''}
                                        onChange={(event) => updateParcela(pagamentoIndex, parcelaIndex, 'codigo_barras', event.target.value)}
                                        placeholder="Código de barras, se houver"
                                      />
                                    </label>
                                  </>
                                )}

                                {isFormaCheque(forma) && (
                                  <div
                                    className="rounded-xl border px-3 py-2 text-xs md:col-span-2"
                                    style={{ borderColor: 'var(--sem-warning-border)', background: 'var(--sem-warning-bg)', color: 'var(--sem-warning)' }}
                                  >
                                    Os dados do cheque serão informados na baixa, quando o instrumento real for definido.
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

            </form>
          </div>

          {/*
            O rodape sai do <form> para poder ficar FIXO no painel (R27); o
            botao continua submetendo o MESMO formulario pelo atributo `form`,
            entao nem o handler nem a validacao nativa dos campos mudam.
          */}
          <div data-modal="rodape" className="app-actionbar border-t border-[var(--c-border)] p-4">
            <button
              type="button"
              className="btn btn-outline app-actionbar-apartada"
              onClick={fecharModalGerarConta}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="form-gerar-conta"
              className="btn btn-primary"
              disabled={saving || loadingBeneficiaries}
            >
              {saving ? 'Gerando...' : loadingBeneficiaries ? 'Carregando credor...' : 'Confirmar'}
            </button>
          </div>
        </OverlayModal>
      )}

      {/*
        Modal de escolha DENTRO do modal de gerar conta: o `ModalPortal`
        empilha por ordem de montagem, entao este fica por cima e o Escape
        fecha so ele. O `fixed inset-0` com camada a mao ficava fora dessa
        pilha — e o `overflow-hidden` do painel matava o sticky de qualquer
        coisa dentro (R18).
      */}
      {modalOpen && categoriaModalOpen && (
        <OverlayModal
          rotulo="Selecionar categoria financeira"
          largura="var(--modal-max-w-xl, 1120px)"
          onFechar={() => setCategoriaModalOpen(false)}
        >
          <div data-modal="cabecalho" className="flex items-start justify-between gap-3 border-b border-[var(--c-border)] p-4">
            <div>
              <h3 className="text-lg font-semibold text-[var(--c-text)]">Selecionar categoria financeira</h3>
              <p className="text-xs text-[var(--c-muted)]">
                Pesquise pelo nome e escolha uma categoria compatível com o tipo do título.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setCategoriaModalOpen(false)}
            >
              Fechar
            </button>
          </div>

          <div className="flex flex-col gap-3 p-4">
            {/* R3 — a busca usa `.app-busca` (cresce ate 480px, minimo 220).
                Ela declara `flex: 1`, entao PRECISA de um pai em linha: solta
                num flex-column ela esticaria na VERTICAL. */}
            <div className="flex">
              <input
                className="input app-busca"
                type="text"
                placeholder="Buscar categoria por ID, nome ou descrição"
                value={categoriaSearch}
                onChange={(event) => setCategoriaSearch(event.target.value)}
              />
            </div>

            <div className="text-xs text-[var(--c-muted)]">
              {loadingCategorias
                ? 'Carregando categorias financeiras...'
                : `${categoriasFiltradas.length} categoria(s) disponivel(is) para ${String(form.tipo || '').toLowerCase()}.`}
            </div>

            <div className="space-y-2 overscroll-contain rounded-2xl border border-[var(--c-border)] p-2">
              {loadingCategorias ? (
                <div className="px-3 py-4 text-sm text-[var(--c-muted)]">
                  Buscando categorias...
                </div>
              ) : categoriasFiltradas.length === 0 ? (
                <div className="px-3 py-4 text-sm text-[var(--c-muted)]">
                  Nenhuma categoria encontrada para esse filtro.
                </div>
              ) : categoriasFiltradas.map((categoria) => (
                <button
                  key={categoria.id}
                  type="button"
                  className="w-full rounded-2xl border px-3 py-2 text-left text-sm transition"
                  style={selectedCategory?.id === categoria.id
                    ? { borderColor: 'var(--c-primary)', background: 'var(--sem-info-bg)' }
                    : { borderColor: 'var(--c-border)' }}
                  onClick={() => selecionarCategoria(categoria)}
                >
                  <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="font-medium text-[var(--c-text)]">{categoria.nome}</div>
                      <div className="text-xs text-[var(--c-muted)]">
                        {categoria.tipo} - {categoria.descricao || 'Sem descricao complementar'}
                      </div>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--c-muted)]">
                      #{categoria.id}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </OverlayModal>
      )}
    </>
  );
}
