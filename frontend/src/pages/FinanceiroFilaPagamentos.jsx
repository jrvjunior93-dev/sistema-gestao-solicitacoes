import useVisualizadorArquivo from '../hooks/useVisualizadorArquivo';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  HiOutlineArrowPath,
  HiOutlineCheckCircle,
  HiOutlineDocumentArrowUp,
  HiOutlineExclamationTriangle,
  HiOutlineFolderOpen,
  HiOutlineDocumentText,
  HiOutlineMagnifyingGlass
} from 'react-icons/hi2';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspaceState, useWorkspaceWork } from '../navigation/WorkspaceContext';
import useQueryRevision from '../navigation/useQueryRevision';
import { camposFila, revisaoFila } from '../navigation/filaWorkspaceDraft';
import {
  anexarComprovanteFilaPagamento,
  anexarComprovanteFilaPagamentoLote,
  aprovarDivergenciasFilaPagamentos,
  getContasFilaPagamentos,
  getInstrumentosFilaPagamentos,
  getComprovanteFilaPagamento,
  getFilaPagamentos,
  informarNaoPagamentoFila,
  previewComprovantesFilaPagamentos,
  registrarBaixasFilaPagamentos,
  resolverFilaPagamento,
  estornarBaixaFilaPagamento,
  vincularComprovantesFilaPagamentos
} from '../services/financeiro';
import {
  canBaixarFilaPagamentos,
  hasPermissao,
  canImportarComprovantesFilaPagamentos,
  canReportarFilaPagamentos,
  canResolverFilaPagamentos
} from '../utils/acessoProduto';
import DateInputBR from '../components/DateInputBR';
import StatusBadge from '../components/StatusBadge';
import OverlayModal from '../components/ui/OverlayModal';
import ArquivosSolicitacaoFilaModal from '../components/financeiro/ArquivosSolicitacaoFilaModal';
import DadosPagamentoFila from '../components/financeiro/DadosPagamentoFila';
import BaixaMassaFilaModal from '../components/financeiro/BaixaMassaFilaModal';
import InstrumentoPagamentoFila, { payloadInstrumentoFila, tipoInstrumentoFila } from '../components/financeiro/InstrumentoPagamentoFila';
import { ResizableTable, ResizableTh } from '../components/ResizableTable';
import { listarComprovantesFila } from '../utils/comprovantesFila';
import useRolagemModal from '../hooks/useRolagemModal';
import { RECEBIMENTOS_DP, rotuloRecebimentoDp, ehTituloDp } from '../utils/recebimentoDp';
import useColunasOperacionais, { LinhaColunasOperacionais } from '../hooks/useColunasOperacionais';
import {
  Avisos,
  BlocoConteudo,
  PageHeader,
  Pagina,
  useAvisos,
  useConfirmacao
} from '../components/padrao';

const STATUS_OPTIONS = [
  ['PENDENTE', 'Pendentes'],
  ['PENDENTE_COMPROVANTE', 'Pendentes de comprovante'],
  ['NAO_PAGO', 'Não pagos'],
  ['DIVERGENTE', 'Divergentes'],
  ['EM_EDICAO', 'Em edição pelo DP'],
  ['BAIXADO', 'Baixados'],
  ['RESOLVIDO', 'Resolvidos'],
  ['TODOS', 'Todos']
];

const STATUS_VALUES = new Set(STATUS_OPTIONS.map(([value]) => value));
const SUMMARY_FILTERS = [
  { status: 'PENDENTE', label: 'Pendentes', tone: 'info' },
  { status: 'PENDENTE_COMPROVANTE', label: 'Pendentes de comprovante', tone: 'warning' },
  { status: 'NAO_PAGO', label: 'Não pagos', tone: 'warning' },
  { status: 'DIVERGENTE', label: 'Divergentes', tone: 'danger' },
  { status: 'BAIXADO', label: 'Baixados', tone: 'success' },
  { status: 'RESOLVIDO', label: 'Resolvidos', tone: 'neutral' }
];

const RECEIPT_BATCH_SIZE = 10;
const MAX_RECEIPT_SELECTION = 500;
const MAX_RECEIPT_FILE_BYTES = 12 * 1024 * 1024;

const RECEIPT_PREVIEW_COLUMNS = [
  { key: 'arquivo', size: 'wider' },
  { key: 'leitura', size: 'wider' },
  { key: 'pagamento', size: 'standard' },
  { key: 'favorecido', size: 'wide' },
  { key: 'titulo', size: 'wider' },
  { key: 'conferencia', size: 'wider' }
];

const PAYMENT_QUEUE_COLUMNS = [
  { key: 'selecao', titulo: 'Seleção', size: 'selection', sempreVisivel: true },
  { key: 'titulo', titulo: 'Título / documento', size: 'wider', sempreVisivel: true },
  { key: 'local', titulo: 'Obra / Centro de Custo', size: 'wide' },
  { key: 'credor', titulo: 'Credor / favorecido', size: 'wide' },
  { key: 'empresa_colaborador', titulo: 'Empresa do colaborador', size: 'wide', antesDe: 'dados' },
  { key: 'recebimento_dp', titulo: 'Recebimento DP', size: 'standard', antesDe: 'dados' },
  { key: 'dados', titulo: 'Dados para pagamento', size: 'wide' },
  { key: 'vencimento', titulo: 'Vencimento', size: 'compact' },
  { key: 'saldo', titulo: 'Previsto / saldo', size: 'standard' },
  { key: 'data', titulo: 'Data da baixa', size: 'standard' },
  { key: 'conta', titulo: 'Conta pagadora', size: 'wide' },
  { key: 'instrumento', titulo: 'Forma / instrumento', size: 'wider' },
  { key: 'empresa', titulo: 'Empresa pagadora', size: 'standard' },
  { key: 'desconto', titulo: 'Desconto (R$)', size: 'compact', antesDe: 'juros' },
  { key: 'juros', titulo: 'Juros (R$)', size: 'compact' },
  { key: 'multa', titulo: 'Multa (R$)', size: 'compact' },
  { key: 'valor', titulo: 'Valor pago', size: 'standard' },
  { key: 'justificativa', titulo: 'Motivo / justificativa', size: 'wider' },
  { key: 'acoes', titulo: 'Status / ações', size: 'wider', sempreVisivel: true }
];

function splitIntoBatches(items, size = RECEIPT_BATCH_SIZE) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size));
  return batches;
}

function SummaryFilter({ item, value, active, onClick, disabled }) {
  const toneClass = {
    info: 'text-[var(--sem-info)]',
    warning: 'text-[var(--sem-warning)]',
    danger: 'text-[var(--sem-danger)]',
    success: 'text-[var(--sem-success)]',
    neutral: 'text-[var(--c-text)]'
  }[item.tone];
  return (
    <button
      type="button"
      className={`rounded-xl border bg-[var(--c-surface)] px-4 py-4 text-left transition hover:-translate-y-px hover:border-[var(--module-financeiro)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-financeiro)] ${active ? 'border-[var(--module-financeiro)] shadow-sm ring-1 ring-[var(--module-financeiro)]' : 'border-[var(--c-border)]'}`}
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
    >
      <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--c-muted)]">{item.label}</span>
      <span className={`mt-2 block text-lg font-semibold ${toneClass}`}>{Number(value || 0)}</span>
    </button>
  );
}

function hojeISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function currency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dateBR(value) {
  if (!value) return '—';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return day && month && year ? `${day}/${month}/${year}` : String(value);
}

function idempotencyKey(prefix) {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function statusKind(status) {
  if (status === 'EM_EDICAO') return 'warning';
  if (status === 'DIVERGENTE') return 'danger';
  if (status === 'NAO_PAGO') return 'warning';
  if (status === 'BAIXADO' || status === 'RESOLVIDO') return 'success';
  return 'info';
}

function beneficiaryData(titulo) {
  if (ehTituloDp(titulo) && titulo.recebimento_dp === 'DINHEIRO') return {
    nome: titulo.parceiro?.nome || 'Não informado', documento: titulo.parceiro?.cpf_cnpj || '', pagamento: 'Recebimento em dinheiro'
  };
  const beneficiary = titulo?.paymentBeneficiary;
  const instrucao = titulo?.instrucao_favorecido;
  const solicitacao = instrucao ? { ...titulo?.solicitacao,
    favorecido: { nome: instrucao.nome_favorecido, cpf_cnpj: instrucao.cpf_cnpj },
    favorecido_chave_pix: instrucao.favorecido_chave_pix, dados_pagamento: instrucao.dados_pagamento,
    boletos: (instrucao.boleto_nomes || []).map(nome => ({ nome })) } : titulo?.solicitacao || {};
  const formaPagamento = titulo?.formaPagamento || solicitacao?.formaPagamento;
  const form = [formaPagamento?.tipo, formaPagamento?.codigo, formaPagamento?.nome]
    .filter(Boolean).join(' ').toUpperCase();
  const boletoData = titulo?.linha_digitavel || titulo?.codigo_barras;
  const boletoAnexado = solicitacao?.boletos?.[0];
  const favorecidoSolicitacao = solicitacao?.favorecido;
  if (beneficiary) {
    let pagamento = 'Sem dados bancários cadastrados';
    if (form.includes('BOLETO') && boletoData) pagamento = `Boleto: ${boletoData}`;
    else if (form.includes('BOLETO') && boletoAnexado) pagamento = `Boleto anexado: ${boletoAnexado.nome}`;
    else if (beneficiary.pix_chave && beneficiary.pix_tipo_chave !== 'DADOS_BANCARIOS'
      && beneficiary.metodo_preferencial !== 'CONTA_BANCARIA') pagamento = `PIX ${beneficiary.pix_tipo_chave || ''}: ${beneficiary.pix_chave}`;
    else if (form.includes('PIX') && solicitacao.favorecido_chave_pix) pagamento = `PIX: ${solicitacao.favorecido_chave_pix}`;
    else if (beneficiary.banco_codigo || beneficiary.agencia || beneficiary.conta) {
      pagamento = `Banco ${beneficiary.banco_codigo || '—'} · Ag. ${beneficiary.agencia || '—'} · Conta ${beneficiary.conta || '—'}`;
    }
    else if (solicitacao.dados_pagamento) pagamento = solicitacao.dados_pagamento;
    return {
      nome: beneficiary.nome || favorecidoSolicitacao?.nome || titulo?.parceiro?.nome || 'Não informado',
      documento: beneficiary.cpf_cnpj || favorecidoSolicitacao?.cpf_cnpj || titulo?.parceiro?.cpf_cnpj || '',
      pagamento
    };
  }
  let pagamento = titulo?.observacoes || 'Sem instrução bancária cadastrada';
  if (form.includes('BOLETO') && boletoData) pagamento = `Boleto: ${boletoData}`;
  else if (form.includes('BOLETO') && boletoAnexado) pagamento = `Boleto anexado: ${boletoAnexado.nome}`;
  else if (form.includes('PIX') && solicitacao.favorecido_chave_pix) pagamento = `PIX: ${solicitacao.favorecido_chave_pix}`;
  else if (solicitacao.dados_pagamento) pagamento = solicitacao.dados_pagamento;
  return {
    nome: titulo?.favorecidoPagamento?.nome || favorecidoSolicitacao?.nome || titulo?.parceiro?.nome || 'Não informado',
    documento: titulo?.favorecidoPagamento?.cpf_cnpj || favorecidoSolicitacao?.cpf_cnpj || titulo?.parceiro?.cpf_cnpj || '',
    pagamento
  };
}

function valorParaInput(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : '';
}

function valorEmCentavos(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) : null;
}

function tipoDivergenciaPagamento(row, draft = {}) {
  const valorPago = valorEmCentavos(draft.valor_pago);
  const saldo = valorEmCentavos(row?.titulo?.valor_saldo);
  const juros = valorEmCentavos(draft.juros || 0);
  const multa = valorEmCentavos(draft.multa || 0);
  if (!valorPago || saldo === null || juros === null || multa === null) return '';
  const principal = valorPago - juros - multa + (valorEmCentavos(draft.desconto || 0) || 0);
  if (principal < saldo) return 'PARCIAL';
  if (principal > saldo) return 'ACIMA_SALDO';
  return '';
}

function totalPrevistoFila(row, draft = {}) {
  const base = ['PENDENTE', 'NAO_PAGO', 'DIVERGENTE'].includes(row.status) && !Number(row.movimento_financeiro_id)
    ? row.titulo?.valor_saldo : row.valor_previsto;
  return ((valorEmCentavos(base) || 0) + (valorEmCentavos(draft.juros || 0) || 0)
    + (valorEmCentavos(draft.multa || 0) || 0) - (valorEmCentavos(draft.desconto || 0) || 0)) / 100;
}

function mensagemJustificativaDivergencia(tipo) {
  if (tipo === 'PARCIAL') return 'Justifique por que o pagamento será parcial.';
  if (tipo === 'ACIMA_SALDO') return 'Justifique por que o pagamento será maior que o saldo.';
  if (tipo === 'DIFERENTE_PREVISTO') return 'Justifique a diferença em relação ao valor previsto.';
  return 'Opcional quando o valor pago corresponde ao saldo + juros + multa − desconto.';
}

function orientarErroRegistroBaixa(error) {
  const mensagem = String(error?.message || error || '').trim()
    || 'O sistema não conseguiu concluir o registro da baixa.';
  const normalizada = mensagem.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  if (normalizada.includes('data da baixa')) {
    return { mensagem, correcao: 'Preencha uma data válida na coluna Data da baixa e tente novamente.', campo: 'data_baixa' };
  }
  if (normalizada.includes('justificativa')) {
    return { mensagem, correcao: 'Preencha a justificativa na linha do título. Ela é obrigatória quando o valor pago é diferente do saldo ou do valor previsto.', campo: 'motivo' };
  }
  if (normalizada.includes('conta pagadora') && normalizada.includes('empresa do titulo')) {
    return { mensagem, correcao: 'Selecione outra conta pagadora ativa e tente novamente. A empresa será identificada automaticamente pela conta.', campo: 'conta_bancaria_id' };
  }
  if (normalizada.includes('conta pagadora')) {
    return { mensagem, correcao: 'Selecione uma conta pagadora ativa e vinculada a uma empresa. Se não houver opção válida, solicite a correção do cadastro bancário.', campo: 'conta_bancaria_id' };
  }
  if (normalizada.includes('valor') || normalizada.includes('saldo')) {
    return { mensagem, correcao: 'Confira o Valor pago informado. Para valor parcial ou acima do saldo, informe também a justificativa da divergência.', campo: 'valor_pago' };
  }
  if (normalizada.includes('nao esta mais pendente') || normalizada.includes('nao esta mais disponivel')) {
    return { mensagem, correcao: 'Clique em Atualizar para carregar a situação atual do título antes de tentar novamente.' };
  }
  if (normalizada.includes('permiss')) {
    return { mensagem, correcao: 'Solicite a um administrador a permissão de registrar baixas na Fila de Pagamentos.' };
  }

  return {
    mensagem,
    correcao: 'Confira a data, a conta pagadora, o valor e a justificativa da linha. Se os dados estiverem corretos, atualize a fila e tente novamente.'
  };
}

function ErroRegistroBaixaModal({ erro, onFechar }) {
  if (!erro) return null;
  return (
    <OverlayModal
      rotulo="Não foi possível registrar a baixa"
      largura="var(--modal-max-w-sm, 520px)"
      onFechar={onFechar}
    >
      <div className="p-6">
        <div className="flex items-start gap-3">
          <HiOutlineExclamationTriangle
            className="mt-1 h-6 w-6 shrink-0 text-[var(--sem-danger)]"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[var(--c-text)]">Não foi possível registrar a baixa</h2>
            <p className="mt-1 text-sm text-[var(--c-muted)]">O botão foi acionado, mas o registro não foi concluído.</p>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--c-muted)]">O que aconteceu</p>
            <p className="mt-1 text-sm leading-6 text-[var(--c-text)]">{erro.mensagem}</p>
          </div>
          <div className="rounded-lg bg-[var(--sem-warning-bg)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sem-warning)]">Como corrigir</p>
            <p className="mt-1 text-sm leading-6 text-[var(--c-text)]">{erro.correcao}</p>
          </div>
          {erro.lote ? (
            <p className="text-xs text-[var(--c-muted)]">Nenhuma baixa deste lote foi registrada.</p>
          ) : null}
        </div>

        <div className="mt-6 flex justify-end">
          <button type="button" className="btn btn-primary" onClick={onFechar} autoFocus>
            Voltar e corrigir
          </button>
        </div>
      </div>
    </OverlayModal>
  );
}

function bancoLabel(value) {
  return ({ BANCO_DO_BRASIL: 'Banco do Brasil', BANESTES: 'Banestes', CAIXA: 'CAIXA', SICREDI: 'Sicredi' })[value] || 'Banco não identificado';
}

function ComprovantesPdfModal({ onFechar, onVinculados, onParcial }) {
  // Somente arquivos locais e escolhas manuais sobrevivem a troca de aba.
  // A previa autorizada nunca e restaurada nem relida automaticamente.
  const [files, setFiles] = useWorkspaceState('fila:pdfFiles', []);
  const [manualLinks, setManualLinks] = useWorkspaceState('fila:pdfLinks', {});
  const [preview, setPreview] = useState(null);
  const [links, setLinks] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useWorkspaceWork(files.length > 0, busy, 'fila:pdfWork');

  function cancelar() {
    if (lock.current) return;
    setFiles([]); setManualLinks({});
    onFechar();
  }

  async function readFiles() {
    if (lock.current) return;
    if (!files.length) {
      setError('Selecione ao menos um comprovante PDF.');
      return;
    }
    if (files.length > MAX_RECEIPT_SELECTION) {
      setError(`Selecione no máximo ${MAX_RECEIPT_SELECTION} comprovantes por importação.`);
      return;
    }
    const invalidFile = files.find((file) => !String(file.name || '').toLowerCase().endsWith('.pdf'));
    if (invalidFile) {
      setError(`O arquivo ${invalidFile.name || 'selecionado'} não é um PDF.`);
      return;
    }
    const oversizedFile = files.find((file) => Number(file.size || 0) > MAX_RECEIPT_FILE_BYTES);
    if (oversizedFile) {
      setError(`O arquivo ${oversizedFile.name} excede o limite de 12 MB.`);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    setPreview(null);
    try {
      const batches = splitIntoBatches(files);
      const allFiles = [];
      const titleOptions = new Map();
      let fileOffset = 0;
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const batch = batches[batchIndex];
        setProgress(`Lendo lote ${batchIndex + 1} de ${batches.length} · ${Math.min(fileOffset + batch.length, files.length)} de ${files.length} arquivos`);
        const result = await previewComprovantesFilaPagamentos(batch);
        if (!mounted.current) return;
        (result?.arquivos || []).forEach((item, itemIndex) => allFiles.push({
          ...item,
          _file_index: fileOffset + itemIndex
        }));
        (result?.titulos_pendentes || []).forEach((item) => titleOptions.set(Number(item.fila_id), item));
        fileOffset += batch.length;
      }
      const seenHashes = new Set();
      const repeated = allFiles.find((item) => {
        if (seenHashes.has(item.arquivo_hash)) return true;
        seenHashes.add(item.arquivo_hash);
        return false;
      });
      if (repeated) throw new Error(`O arquivo ${repeated.arquivo_nome} está repetido na seleção.`);

      const initialLinks = {};
      const validManualLinks = {};
      let invalidated = 0;
      allFiles.forEach((item) => {
        const suggestedId = Number(item.fila_sugerida_id);
        const eligible = (id) => titleOptions.has(Number(id)) && !item.duplicado;
        if (Object.prototype.hasOwnProperty.call(manualLinks, item.arquivo_hash)) {
          const ownId = manualLinks[item.arquivo_hash];
          const value = eligible(ownId) ? ownId : '';
          if (Number(ownId) && !value) invalidated += 1;
          initialLinks[item.arquivo_hash] = value;
          validManualLinks[item.arquivo_hash] = value;
        } else {
          initialLinks[item.arquivo_hash] = eligible(suggestedId) ? suggestedId : '';
        }
      });
      setPreview({ arquivos: allFiles, titulos_pendentes: [...titleOptions.values()] });
      setLinks(initialLinks);
      setManualLinks(validManualLinks);
      if (invalidated) setError(`${invalidated} vínculo(s) não estão mais disponíveis. Confira os títulos atuais antes de vincular.`);
    } catch (readError) {
      if (!mounted.current) return;
      setError(readError?.message || 'Não foi possível ler os comprovantes.');
    } finally {
      lock.current = false;
      if (mounted.current) { setProgress(''); setBusy(false); }
    }
  }

  async function linkFiles() {
    if (lock.current || !preview) return;
    const eligible = new Set(preview.titulos_pendentes.map((item) => Number(item.fila_id)));
    const selectedItems = (preview?.arquivos || [])
      .filter((item) => !item.duplicado && eligible.has(Number(links[item.arquivo_hash])))
      .map((item) => ({
        file: files[item._file_index],
        mapping: { arquivo_hash: item.arquivo_hash, fila_id: Number(links[item.arquivo_hash]) }
      }));
    if (!selectedItems.length) {
      setError('Escolha ao menos um título para vincular.');
      return;
    }
    if (selectedItems.some((item) => !item.file)) {
      setError('A seleção de arquivos mudou. Leia os comprovantes novamente.');
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    let linkedCount = 0;
    try {
      const batches = splitIntoBatches(selectedItems);
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const batch = batches[batchIndex];
        setProgress(`Vinculando lote ${batchIndex + 1} de ${batches.length} · ${linkedCount} de ${selectedItems.length} concluídos`);
        const result = await vincularComprovantesFilaPagamentos(
          batch.map((item) => item.file),
          batch.map((item) => item.mapping)
        );
        if (!mounted.current) return;
        linkedCount += Number(result?.quantidade || batch.length);
        // Retirar lotes concluidos evita reenviar comprovantes apos falha parcial.
        const completedFiles = new Set(batch.map((item) => item.file));
        const completedHashes = new Set(batch.map((item) => item.mapping.arquivo_hash));
        setFiles((current) => current.filter((file) => !completedFiles.has(file)));
        setManualLinks((current) => Object.fromEntries(Object.entries(current)
          .filter(([hash]) => !completedHashes.has(hash))));
      }
      setPreview(null); setLinks({});
      await onVinculados(linkedCount);
    } catch (linkError) {
      if (!mounted.current) return;
      // Resultado incerto ou parcial exige nova consulta explicita de duplicidade.
      setPreview(null); setLinks({});
      if (linkedCount > 0) {
        await onParcial?.(linkedCount);
        setError(`${linkedCount} comprovante(s) foram vinculados antes da falha. Atualize e reabra a importação para continuar. ${linkError?.message || ''}`.trim());
      } else {
        setError(linkError?.message || 'Não foi possível vincular os comprovantes.');
      }
    } finally {
      lock.current = false;
      if (mounted.current) { setProgress(''); setBusy(false); }
    }
  }

  const options = preview?.titulos_pendentes || [];
  const selectedCount = (preview?.arquivos || []).filter((item) => !item.duplicado
    && options.some((option) => Number(option.fila_id) === Number(links[item.arquivo_hash]))).length;

  return (
    <OverlayModal rotulo="Importar comprovantes PDF" largura="var(--modal-max-w-xl, 1420px)" onFechar={busy ? undefined : cancelar}>
      <div className="flex max-h-[calc(100dvh-8rem)] min-h-96 flex-col">
        <div className="border-b border-[var(--c-border)] p-4">
          <h2 className="text-lg font-semibold text-[var(--c-text)]">Importar comprovantes para a fila</h2>
          <p className="mt-1 text-sm text-[var(--c-muted)]">
            Envie PDFs do Banco do Brasil, CAIXA ou Sicredi. O sistema lê os dados e sugere o título; confira antes de vincular. A baixa não é executada nesta etapa.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="rounded-xl border border-dashed border-[var(--c-border)] bg-[var(--ui-surface-2)] p-4">
            <label className="block text-sm font-semibold text-[var(--c-text)]" htmlFor="fila-comprovantes-pdf">Comprovantes PDF</label>
            <input
              id="fila-comprovantes-pdf"
              className="input mt-2 w-full"
              type="file"
              accept="application/pdf,.pdf"
              multiple
              disabled={busy}
              onChange={(event) => {
                const nextFiles = Array.from(event.target.files || []);
                setFiles(nextFiles);
                setPreview(null);
                setLinks({});
                setManualLinks({});
                setError('');
              }}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-[var(--c-muted)]">Selecione até 500 PDFs. O sistema processa blocos seguros de 10 arquivos automaticamente; limite de 12 MB por PDF. Use um pagamento por arquivo.</span>
              <button className="btn btn-outline" type="button" onClick={readFiles} disabled={busy || !files.length}>
                {busy && !preview ? (progress || 'Lendo PDFs...') : Object.keys(manualLinks).length ? 'Revalidar comprovantes' : 'Ler comprovantes'}
              </button>
            </div>
            {files.length ? <div className="mt-2 text-xs font-medium text-[var(--c-text)]">
              {files.length} arquivo(s) selecionado(s)
              <ul className="mt-1 max-h-24 overflow-auto">{files.map((file, index) => <li key={index}>{file.name}</li>)}</ul>
            </div> : null}
          </div>

          {error ? (
            <div className="mt-4 rounded-lg bg-[var(--sem-danger-bg)] px-4 py-3 text-sm text-[var(--sem-danger)]" role="alert">{error}</div>
          ) : null}

          {preview?.arquivos?.length ? (
            <div className="mt-4 min-w-0 rounded-xl border border-[var(--c-border)]">
              <ResizableTable columns={RECEIPT_PREVIEW_COLUMNS} storageKey="fila-pagamentos-comprovantes-preview" className="w-full border-collapse text-sm" scrollLabel="Prévia dos comprovantes da fila">
                <thead className="bg-[var(--ui-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--c-muted)]">
                  <tr>
                    <ResizableTh columnKey="arquivo" className="px-3 py-3">Arquivo</ResizableTh>
                    <ResizableTh columnKey="leitura" className="px-3 py-3">Leitura</ResizableTh>
                    <ResizableTh columnKey="pagamento" className="px-3 py-3">Pagamento</ResizableTh>
                    <ResizableTh columnKey="favorecido" className="px-3 py-3">Favorecido</ResizableTh>
                    <ResizableTh columnKey="titulo" className="px-3 py-3">Título da fila</ResizableTh>
                    <ResizableTh columnKey="conferencia" className="px-3 py-3">Conferência</ResizableTh>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--c-border)] bg-[var(--c-surface)]">
                  {preview.arquivos.map((item) => {
                    const suggested = item.candidatos?.find((candidate) => Number(candidate.fila_id) === Number(item.fila_sugerida_id));
                    return (
                      <tr key={item.arquivo_hash} className={item.duplicado ? 'bg-[var(--sem-warning-bg)]' : ''}>
                        <td className="max-w-56 px-3 py-3 align-top">
                          <div className="break-words font-medium">{item.arquivo_nome}</div>
                          <div className="mt-1 text-xs text-[var(--c-muted)]">{item.arquivo_hash.slice(0, 12)}…</div>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="font-medium">{bancoLabel(item.dados?.banco)} · {item.dados?.tipo || 'Não identificado'}</div>
                          <div className="mt-1 text-xs text-[var(--c-muted)]">{item.dados?.referencia_solicitacao || item.dados?.identificador_transacao || 'Sem referência operacional'}</div>
                          {item.conta_sugerida ? <div className="mt-1 text-xs text-[var(--sem-success)]">Conta: {item.conta_sugerida.nome}</div> : null}
                        </td>
                        <td className="px-3 py-3 align-top whitespace-nowrap">
                          <div className="font-semibold">{currency(item.dados?.valor)}</div>
                          <div className="text-xs text-[var(--c-muted)]">{dateBR(item.dados?.data_pagamento)}</div>
                        </td>
                        <td className="max-w-60 px-3 py-3 align-top">
                          <div>{item.dados?.favorecido_nome || 'Não identificado'}</div>
                          <div className="text-xs text-[var(--c-muted)]">{item.dados?.favorecido_documento || 'Sem documento'}</div>
                        </td>
                        <td className="px-3 py-3 align-top">
                          {item.duplicado ? (
                            <div className="text-sm font-semibold text-[var(--sem-warning)]">Já vinculado a {item.duplicado.titulo_codigo || `item #${item.duplicado.fila_id}`}</div>
                          ) : (
                            <select
                              className="input input-sm min-w-0 w-full"
                              value={links[item.arquivo_hash] || ''}
                              onChange={(event) => {
                                const value = event.target.value;
                                setLinks((current) => ({ ...current, [item.arquivo_hash]: value }));
                                setManualLinks((current) => ({ ...current, [item.arquivo_hash]: value }));
                              }}
                              disabled={busy}
                              aria-label={`Título para ${item.arquivo_nome}`}
                            >
                              <option value="">Selecione para revisar</option>
                              {options.map((option) => (
                                <option key={option.fila_id} value={option.fila_id}>
                                  {option.titulo_codigo || `#${option.titulo_id}`} · {option.pagamento_registrado ? `Pago ${currency(option.valor_pago)}` : `Saldo ${currency(option.valor_saldo)}`} · {option.favorecido || 'Sem favorecido'}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="max-w-64 px-3 py-3 align-top text-xs">
                          {item.duplicado ? 'Este mesmo arquivo não será importado novamente.' : suggested ? (
                            <>
                              <div className="font-semibold text-[var(--sem-success)]">Sugestão segura</div>
                              <div className="mt-1 text-[var(--c-muted)]">{suggested.motivos.join(' · ')}</div>
                            </>
                          ) : item.dados?.texto_reconhecido ? (
                            <>
                              <div className="font-semibold text-[var(--sem-warning)]">Revisão manual</div>
                              <div className="mt-1 text-[var(--c-muted)]">Não houve correspondência única com confiança suficiente.</div>
                            </>
                          ) : (
                            <div className="font-semibold text-[var(--sem-danger)]">Modelo ainda não reconhecido</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </ResizableTable>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--c-border)] p-4">
          <span className="text-xs text-[var(--c-muted)]">{preview ? `${selectedCount} comprovante(s) pronto(s) para vincular` : 'Nenhum comprovante lido'}</span>
          <div className="flex gap-2">
            <button className="btn btn-outline" type="button" onClick={cancelar} disabled={busy}>Cancelar</button>
            <button className="btn btn-primary" type="button" onClick={linkFiles} disabled={busy || !preview || selectedCount === 0}>
              {busy && preview ? (progress || 'Vinculando...') : 'Vincular comprovantes'}
            </button>
          </div>
        </div>
      </div>
    </OverlayModal>
  );
}

export default function FinanceiroFilaPagamentos() {
  const { abrirPreview, modalPreview } = useVisualizadorArquivo();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { avisos, avisar, fechar: fecharAviso, limpar: limparAvisos } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const initialStatus = STATUS_VALUES.has(String(searchParams.get('status') || '').toUpperCase())
    ? String(searchParams.get('status')).toUpperCase()
    : 'PENDENTE';
  const initialSearch = String(searchParams.get('q') || '');
  const [status, setStatus] = useWorkspaceState('fila:status', initialStatus);
  const [search, setSearch] = useWorkspaceState('fila:busca', initialSearch);
  const [appliedSearch, setAppliedSearch] = useWorkspaceState('fila:buscaAplicada', initialSearch);
  const [filtros, setFiltros] = useWorkspaceState('fila:filtrosTitulos', Object.fromEntries(
    ['origem', 'empresa_id', 'credor_id', 'recebimento_dp'].map(key => [key, searchParams.get(key) || ''])));
  const [opcoesFiltros, setOpcoesFiltros] = useState({ empresas: [], credores: [] });
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [accounts, setAccounts] = useState([]);
  const [instrumentos, setInstrumentos] = useState({ formas: [], cartoes: [], cheques: [] });
  const settleLockRef = useRef(false);
  const [drafts, setDrafts] = useState({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const [edicoesFila, setEdicoesFila] = useWorkspaceState('fila:edicoes', {});
  const edicoesFilaRef = useRef(edicoesFila);
  edicoesFilaRef.current = edicoesFila;
  const consultaFila = useQueryRevision(`${status}|${appliedSearch}|${JSON.stringify(filtros)}`);
  const [selected, setSelected] = useWorkspaceState('fila:selecionados', []);
  const [loading, setLoading] = useState(true);
  const [actionKey, setActionKey] = useState('');
  const [reasonOpenId, setReasonOpenId] = useWorkspaceState('fila:motivoId', null);
  const [erroBaixa, setErroBaixa] = useState(null);
  const [baixaMassa, setBaixaMassa] = useState(null);
  const [comprovantesOpen, setComprovantesOpen] = useWorkspaceState('fila:pdfOpen', false);
  const [comprovanteLote, setComprovanteLote] = useState(null);
  const [filaAutorizada, setFilaAutorizada] = useState(false);
  const [solicitacaoArquivos, setSolicitacaoArquivos] = useState(null);
  const guardarRolagemArquivos = useRolagemModal(Boolean(solicitacaoArquivos));
  const colunasConfiguradas = useColunasOperacionais(PAYMENT_QUEUE_COLUMNS, 'financeiro-fila-pagamentos');
  useWorkspaceWork(Boolean(Object.keys(edicoesFila).length || selected.length), Boolean(actionKey));

  const canSettle = canBaixarFilaPagamentos(user);
  const canOpenTitle = hasPermissao(user, 'financeiro.titulos.visualizar');
  const canReport = canReportarFilaPagamentos(user);
  const canResolve = canResolverFilaPagamentos(user);
  const canImportReceipts = canImportarComprovantesFilaPagamentos(user);

  function applyFilters(nextStatus = status, nextSearch = appliedSearch, nextFiltros = filtros) {
    setStatus(nextStatus);
    setAppliedSearch(nextSearch);
    setSelected([]);
    setFiltros(nextFiltros);
    const nextParams = new URLSearchParams();
    if (nextStatus !== 'PENDENTE') nextParams.set('status', nextStatus);
    if (nextSearch) nextParams.set('q', nextSearch);
    Object.entries(nextFiltros).forEach(([key, value]) => { if (value) nextParams.set(key, value); });
    setSearchParams(nextParams, { replace: true });
  }

  const load = useCallback(async () => {
    const token = consultaFila.begin();
    setLoading(true);
    try {
      const [queueResult, accountResult, instrumentResult] = await Promise.all([
        getFilaPagamentos({ status, q: appliedSearch || undefined,
          ...Object.fromEntries(Object.entries(filtros).filter(([, value]) => value)) }),
        getContasFilaPagamentos(),
        canSettle ? getInstrumentosFilaPagamentos() : Promise.resolve({ formas: [], cartoes: [], cheques: [] })
      ]);
      if (!consultaFila.isCurrent(token)) return;
      setFilaAutorizada(true);
      const nextRows = queueResult?.data || [];
      setRows(nextRows);
      setOpcoesFiltros(queueResult?.filtros || { empresas: [], credores: [] });
      setSummary(queueResult?.resumo || {});
      setAccounts(Array.isArray(accountResult) ? accountResult : accountResult?.data || []);
      setInstrumentos(instrumentResult);
      setSelected((current) => current.filter((id) => nextRows.some((row) => Number(row.id) === Number(id)
        && !row.somente_consulta && ((row.status === 'PENDENTE' && !row.movimento_financeiro_id) || row.status === 'DIVERGENTE' || row.pendente_comprovante))));
      setDrafts((current) => {
        const next = { ...current };
        nextRows.forEach((row) => {
          if (!next[row.id] || next[row.id]._status_referencia !== row.status) {
            next[row.id] = {
              data_baixa: row.data_baixa || hojeISO(),
              conta_bancaria_id: row.conta_bancaria_id || '',
              valor_pago: valorParaInput(row.valor_informado || totalPrevistoFila(row, row)),
              motivo: row.motivo || '',
              forma_pagamento_id: row.titulo?.forma_pagamento_id || '',
              juros: valorParaInput(row.juros || 0),
              multa: valorParaInput(row.multa || 0),
              desconto: valorParaInput(row.instrumento_pagamento_json?.desconto || 0),
              _saldo_referencia: Number(row.titulo?.valor_saldo || 0),
              _juros_referencia: Number(row.juros || 0),
              _multa_referencia: Number(row.multa || 0),
              _status_referencia: row.status,
              ...(row.instrumento_pagamento_json || {})
            };
          } else if (next[row.id]._saldo_referencia !== Number(row.titulo?.valor_saldo || 0)
            || next[row.id]._juros_referencia !== Number(row.juros || 0)
            || next[row.id]._multa_referencia !== Number(row.multa || 0)) {
            const draft = next[row.id];
            const anterior = totalPrevistoFila({ ...row, titulo: { ...row.titulo, valor_saldo: draft._saldo_referencia } }, draft);
            const atualizado = { ...draft,
              juros: row.status !== 'PENDENTE' || valorEmCentavos(draft.juros) === valorEmCentavos(draft._juros_referencia)
                ? valorParaInput(row.juros) : draft.juros,
              multa: row.status !== 'PENDENTE' || valorEmCentavos(draft.multa) === valorEmCentavos(draft._multa_referencia)
                ? valorParaInput(row.multa) : draft.multa };
            next[row.id] = { ...atualizado, _saldo_referencia: Number(row.titulo?.valor_saldo || 0),
              _juros_referencia: Number(row.juros || 0), _multa_referencia: Number(row.multa || 0),
              valor_pago: row.status === 'PENDENTE' && valorEmCentavos(draft.valor_pago) === valorEmCentavos(anterior)
                ? valorParaInput(totalPrevistoFila(row, atualizado)) : draft.valor_pago };
          }
          const propria = edicoesFilaRef.current[row.id];
          if (propria) next[row.id] = { ...next[row.id], ...propria.campos };
        });
        return next;
      });
    } catch (error) {
      if (!consultaFila.isCurrent(token)) return;
      setFilaAutorizada(false);
      setRows([]); setAccounts([]); setSummary({}); setSelected([]);
      setOpcoesFiltros({ empresas: [], credores: [] });
      setInstrumentos({ formas: [], cartoes: [], cheques: [] }); setDrafts({});
      avisar.erro(error?.message || 'Erro ao carregar a fila de pagamentos.');
    } finally {
      if (consultaFila.isCurrent(token)) setLoading(false);
    }
  }, [status, appliedSearch, filtros, avisar, canSettle]);

  useEffect(() => { load(); }, [load]);

  function updateDraft(id, patch) {
      const previous = draftsRef.current[id] || {};
      const next = { ...previous, ...patch };
      const ownFields = camposFila(patch);
      const row = rows.find(item => Number(item.id) === Number(id));
      if (row && ('juros' in patch || 'multa' in patch || 'desconto' in patch)
        && valorEmCentavos(previous.valor_pago) === valorEmCentavos(totalPrevistoFila(row, previous))) {
        next.valor_pago = valorParaInput(totalPrevistoFila(row, next));
        ownFields.valor_pago = next.valor_pago;
      }
      if (!row) return;
      draftsRef.current = { ...draftsRef.current, [id]: next };
      setDrafts(current => ({ ...current, [id]: next }));
      setEdicoesFila(current => ({ ...current, [id]: {
        revisao: current[id]?.revisao || revisaoFila(row),
        campos: { ...current[id]?.campos, ...ownFields }
      } }));
  }

  function limparEdicoes(ids) {
    const removidos = new Set(ids.map(String));
    edicoesFilaRef.current = Object.fromEntries(Object.entries(edicoesFilaRef.current)
      .filter(([id]) => !removidos.has(id)));
    setEdicoesFila(edicoesFilaRef.current);
    draftsRef.current = Object.fromEntries(Object.entries(draftsRef.current)
      .filter(([id]) => !removidos.has(id)));
    setDrafts(draftsRef.current);
  }

  function compatibleAccounts(row) {
    const card = instrumentos.cartoes.find(item => Number(item.id) === Number(drafts[row.id]?.cartao_id));
    return accounts.filter((account) => account.ativo !== false && account.empresa_id &&
      (!card || Number(account.id) === Number(card.conta_bancaria_id)));
  }

  function selectedAccount(row) {
    const id = Number(drafts[row.id]?.conta_bancaria_id || 0);
    return accounts.find((account) => Number(account.id) === id) || null;
  }

  function validateRows(targetRows, dados = drafts, instrumentosLote = null) {
    const somenteCarteira = instrumentosLote?.tipo === 'CHEQUE' && instrumentosLote.componentes.length > 0 && instrumentosLote.componentes.every(item => item.usar_cheque_terceiro === true);
    if (instrumentosLote && instrumentosLote.componentes.reduce((sum, item) => sum + valorEmCentavos(item.valor_pago), 0)
      !== targetRows.reduce((sum, row) => sum + valorEmCentavos(dados[row.id]?.valor_pago), 0)) return {
        mensagem: 'O total do lote mudou.', correcao: 'Confira novamente os instrumentos compartilhados e seus valores.', filaId: targetRows[0]?.id };
    for (const row of targetRows) {
      if (edicoesFila[row.id] && edicoesFila[row.id].revisao !== revisaoFila(row)) {
        return { mensagem: 'O saldo ou status mudou desde a edição.',
          correcao: 'Descarte o rascunho conflitante e confira os dados atuais antes de baixar.', filaId: row.id };
      }
      const draft = dados[row.id] || {};
      const forma = instrumentos.formas.find(item => Number(item.id) === Number(draft.forma_pagamento_id));
      if (!forma) return { mensagem: 'Selecione uma forma de pagamento ativa.', correcao: 'Informe a forma efetivamente utilizada na linha.', filaId: row.id, campo: 'forma_pagamento_id' };
      const tipo = tipoInstrumentoFila(forma);
      if (!instrumentosLote && tipo === 'CARTAO' && !draft.cartao_id && !draft.parcelas_cartao?.length) return { mensagem: 'Informe o cartão utilizado.', correcao: 'Selecione o cartão na linha; a conta vinculada será preenchida.', filaId: row.id, campo: 'forma_pagamento_id' };
      if (!instrumentosLote && tipo === 'CARTAO' && draft.parcelas_cartao?.length && (draft.parcelas_cartao.some(item =>
        !(Number(item.valor_pago) > 0) || !instrumentos.cartoes.some(card => Number(card.id) === Number(item.cartao_id)))
        || draft.parcelas_cartao.reduce((sum, item) => sum + valorEmCentavos(item.valor_pago), 0) !== valorEmCentavos(draft.valor_pago))) return {
        mensagem: 'Confira os cartões e seus valores.', correcao: 'A soma das partes deve ser igual ao valor pago do título.', filaId: row.id, campo: 'forma_pagamento_id' };
      if (!instrumentosLote && tipo === 'CHEQUE' && !draft.parcelas_cheque?.length && (draft.usar_cheque_terceiro ? !draft.cheque_terceiro_id : (!draft.cheque_numero || !draft.cheque_emitente))) {
        return { mensagem: 'Informe o cheque usado no pagamento.', correcao: 'Selecione um cheque da carteira ou preencha número e emitente do cheque próprio.', filaId: row.id, campo: 'forma_pagamento_id' };
      }
      if (!instrumentosLote && tipo === 'CHEQUE' && draft.parcelas_cheque?.length && (draft.parcelas_cheque.some(item =>
        !(Number(item.valor_pago) > 0) || (item.usar_cheque_terceiro ? !item.cheque_terceiro_id : !item.cheque_numero || !item.cheque_emitente))
        || draft.parcelas_cheque.reduce((sum, item) => sum + valorEmCentavos(item.valor_pago), 0) !== valorEmCentavos(draft.valor_pago))) {
        return { mensagem: 'Confira os cheques e seus valores.', correcao: 'A soma dos cheques deve ser igual ao valor pago do título.', filaId: row.id, campo: 'forma_pagamento_id' };
      }
      if (!draft.data_baixa) return { mensagem: `A data da baixa do título ${row.titulo?.codigo || row.id} não foi informada.`, correcao: 'Preencha uma data válida na coluna Data da baixa.', filaId: row.id, campo: 'data_baixa' };
      if (!somenteCarteira && !Number(draft.conta_bancaria_id)) return { mensagem: `A conta pagadora do título ${row.titulo?.codigo || row.id} não foi selecionada.`, correcao: 'Selecione uma conta na coluna Conta pagadora.', filaId: row.id, campo: 'conta_bancaria_id' };
      if (!(Number(draft.valor_pago) > 0)) return { mensagem: `O valor pago do título ${row.titulo?.codigo || row.id} é inválido.`, correcao: 'Informe um valor maior que zero na coluna Valor pago.', filaId: row.id, campo: 'valor_pago' };
      for (const campo of ['desconto', 'juros', 'multa']) {
        if (!Number.isFinite(Number(draft[campo] || 0)) || Number(draft[campo] || 0) < 0) {
          return { mensagem: `${campo === 'desconto' ? 'Desconto' : campo === 'juros' ? 'Juros' : 'Multa'} inválidos.`, correcao: 'Informe um valor em reais maior ou igual a zero.', filaId: row.id, campo };
        }
      }
      if (valorEmCentavos(draft.valor_pago) + valorEmCentavos(draft.desconto || 0) <= (valorEmCentavos(draft.juros || 0) + valorEmCentavos(draft.multa || 0))) {
        return { mensagem: 'O valor pago mais o desconto deve superar juros e multa.', correcao: 'Confira o total pago, o desconto e os encargos em reais.', filaId: row.id, campo: 'valor_pago' };
      }
      const tipoDivergencia = tipoDivergenciaPagamento(row, draft);
      if (instrumentosLote && tipoDivergencia === 'ACIMA_SALDO') return {
        mensagem: 'Um pagamento compartilhado está acima do saldo.', correcao: 'Ajuste o título antes de usar instrumentos compartilhados.', filaId: row.id, campo: 'valor_pago' };
      if (tipoDivergencia && !String(draft.motivo || '').trim()) {
        return { mensagem: `O valor do título ${row.titulo?.codigo || row.id} é divergente e está sem justificativa.`, correcao: mensagemJustificativaDivergencia(tipoDivergencia), filaId: row.id, campo: 'motivo' };
      }
    }
    return null;
  }

  async function anexarComprovante(row, arquivos) {
    if (!canSettle || !arquivos?.length) return;
    return executarOperacao(() => performAnexarComprovante(row, arquivos));
  }

  async function performAnexarComprovante(row, arquivos) {
    if (!arquivos?.length || actionKey) return;
    setActionKey(`comprovante-${row.id}`);
    let enviados = 0;
    try {
      for (const arquivo of arquivos) {
        await anexarComprovanteFilaPagamento(row.id, arquivo);
        enviados += 1;
      }
      avisar.sucesso(`${enviados} comprovante(s) vinculado(s) ao título ${row.titulo?.codigo || row.id}.`);
    } catch (error) {
      avisar.erro(`${enviados ? `${enviados} arquivo(s) vinculado(s). ` : ''}${error?.message || 'Não foi possível anexar o comprovante.'}`);
    } finally {
      if (enviados) await load();
      setActionKey('');
    }
  }

  async function abrirComprovante(filaId, comprovanteId, nome) {
    try {
      await abrirPreview(() => getComprovanteFilaPagamento(filaId, comprovanteId), { nome: nome || 'Comprovante.pdf', mime: 'application/pdf' });
    } catch (error) {
      avisar.erro(error?.message || 'Não foi possível abrir o comprovante.');
    }
  }

  async function anexarMesmoComprovante() {
    if (!canSettle || !filaAutorizada || !comprovanteLote?.arquivo) return;
    await executarOperacao(async () => {
      const { ids, arquivo } = comprovanteLote;
      if (!ids.length || ids.length > 100) { avisar.erro('Selecione de 1 a 100 títulos por operação.'); return; }
      const elegiveis = rows.filter(r => ids.includes(Number(r.id)) && !r.somente_consulta
        && ((r.status === 'PENDENTE' && !r.movimento_financeiro_id) || r.pendente_comprovante));
      if (elegiveis.length !== ids.length) { avisar.erro('A seleção mudou. Feche e confira os títulos atuais.'); return; }
      setActionKey('comprovante-lote');
      try {
        const result = await anexarComprovanteFilaPagamentoLote(ids, arquivo);
        avisar.sucesso(`${result.quantidade} título(s) com comprovante vinculado. Nenhuma baixa foi registrada.`);
        setComprovanteLote(null); setSelected([]);
        await load();
      } catch (error) { avisar.erro(error.message || 'Não foi possível anexar o comprovante. Tente novamente com a mesma seleção.'); }
      finally { setActionKey(''); }
    });
  }

  function fecharErroRegistroBaixa() {
    const alvo = erroBaixa?.filaId && erroBaixa?.campo
      ? `[data-fila-id="${erroBaixa.filaId}"][data-fila-campo="${erroBaixa.campo}"]`
      : '';
    setErroBaixa(null);
    const colunaErro = { conta_bancaria_id: 'conta', valor_pago: 'valor', motivo: 'justificativa',
      data_baixa: 'data', desconto: 'desconto', juros: 'juros', multa: 'multa', forma_pagamento_id: 'instrumento',
      cartao_id: 'instrumento', cheque_terceiro_id: 'instrumento', numero_cheque: 'instrumento' }[erroBaixa?.campo];
    if (colunaErro) colunasConfiguradas.mostrar(colunaErro);
    const filaId = erroBaixa?.filaId;
    if (alvo) requestAnimationFrame(() => (document.querySelector(alvo) ||
      document.querySelector(`[data-fila-linha="${filaId}"] [data-coluna="${colunaErro}"] select`))?.focus());
  }

  async function executarOperacao(callback) {
    if (settleLockRef.current || actionKey) return;
    settleLockRef.current = true;
    setActionKey('conferencia');
    try { await callback(); }
    finally { settleLockRef.current = false; setActionKey(''); }
  }

  async function settle(targetRows) {
    if (!targetRows.length || !canSettle) return;
    return executarOperacao(() => performSettle(targetRows));
  }

  async function performSettle(targetRows, dados = draftsRef.current, instrumentosLote = null) {
    const problem = validateRows(targetRows, dados, instrumentosLote);
    if (problem) {
      setBaixaMassa(null);
      setErroBaixa({ ...problem, lote: targetRows.length > 1 });
      return;
    }
    const total = targetRows.reduce((sum, row) => sum + Number(dados[row.id]?.valor_pago || 0), 0);
    const { ok } = await confirmar({
      titulo: targetRows.length === 1 ? 'Registrar baixa deste título?' : 'Registrar baixas selecionadas?',
      mensagem: `${targetRows.length} título(s), total informado ${currency(total)}. ${instrumentosLote ? 'Conjunto único de instrumentos rateado entre os títulos; o estorno será do grupo completo. ' : ''}O comprovante pode ser anexado depois; a baixa sem PDF será listada em Pendentes de comprovante. Valores divergentes exigem justificativa: pagamentos parciais registram a baixa parcial e valores acima do saldo aguardam autorização.`,
      rotuloConfirmar: targetRows.length === 1 ? 'Registrar baixa' : 'Registrar baixas',
      destrutiva: false
    });
    if (!ok) return;

    const key = idempotencyKey('fila-baixa');
    setActionKey(`settle-${key}`);
    try {
      const result = await registrarBaixasFilaPagamentos(targetRows.map((row) => ({
        fila_id: row.id,
        ...(instrumentosLote ? { forma_pagamento_id: instrumentosLote.forma_pagamento_id } : payloadInstrumentoFila(dados[row.id], instrumentos.formas)),
        data_baixa: dados[row.id].data_baixa,
        conta_bancaria_id: Number(dados[row.id].conta_bancaria_id) || undefined,
        valor_pago: Number(dados[row.id].valor_pago),
        desconto: Number(dados[row.id].desconto || 0),
        juros: Number(dados[row.id].juros || 0),
        multa: Number(dados[row.id].multa || 0),
        motivo: String(dados[row.id].motivo || '').trim() || undefined
      })), key, instrumentosLote);
      avisar.sucesso(`${result?.baixados || 0} baixa(s) registrada(s). ${result?.divergentes || 0} divergência(s) sinalizada(s).`);
      if (result?.pendentes_comprovante) avisar.alerta(`${result.pendentes_comprovante} pagamento(s) pendente(s) de comprovante. Anexe os PDFs pelo card Pendentes de comprovante.`);
      setSelected([]);
      limparEdicoes(targetRows.map(row => row.id));
      setBaixaMassa(null);
      await load();
    } catch (error) {
      const detalhe = orientarErroRegistroBaixa(error);
      setBaixaMassa(null);
      const linhaRelacionada = targetRows.find((row) => {
        const codigo = String(row.titulo?.codigo || '').trim();
        return codigo && detalhe.mensagem.includes(codigo);
      }) || (targetRows.length === 1 ? targetRows[0] : null);
      setErroBaixa({ ...detalhe, filaId: linhaRelacionada?.id, lote: targetRows.length > 1 });
    } finally {
      setActionKey('');
    }
  }

  async function approveDivergences(targetRows) {
    if (!canResolve || !targetRows.length) return;
    return executarOperacao(() => performApproveDivergences(targetRows));
  }

  async function performApproveDivergences(targetRows) {
    if (targetRows.length === 0) return;
    const total = targetRows.reduce((sum, row) => sum + Number(row.valor_informado || 0), 0);
    const { ok, texto } = await confirmar({
      titulo: targetRows.length === 1 ? 'Autorizar baixa divergente?' : 'Autorizar baixas divergentes?',
      mensagem: `${targetRows.length} título(s), total informado ${currency(total)}. A autorização registra as baixas ainda pendentes e conclui as divergências já processadas.`,
      rotuloConfirmar: targetRows.length === 1 ? 'Autorizar baixa' : 'Autorizar selecionados',
      destrutiva: false,
      campo: { rotulo: 'Justificativa da aprovação', obrigatorio: true, multilinha: true }
    });
    if (!ok) return;

    const key = idempotencyKey('fila-aprovar-divergencia');
    setActionKey(`approve-${key}`);
    try {
      const result = await aprovarDivergenciasFilaPagamentos(
        targetRows.map((row) => Number(row.id)),
        String(texto || '').trim(),
        key
      );
      avisar.sucesso(`${result?.quantidade || 0} divergência(s) aprovada(s). ${result?.baixas_registradas || 0} baixa(s) registrada(s) agora.`);
      setSelected([]);
      limparEdicoes(targetRows.map(row => row.id));
      await load();
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao aprovar as divergências. Nenhum item do lote foi alterado.');
    } finally {
      setActionKey('');
    }
  }

  async function reportNotPaid(row) {
    if (!canReport) return;
    return executarOperacao(() => performReportNotPaid(row));
  }

  async function performReportNotPaid(row) {
    const reason = String(drafts[row.id]?.motivo || '').trim();
    if (!reason) {
      avisar.alerta(`Informe o motivo de não pagamento do título ${row.titulo?.codigo || row.id}.`);
      setReasonOpenId(row.id);
      return;
    }
    setActionKey(`not-paid-${row.id}`);
    try {
      await informarNaoPagamentoFila(row.id, reason);
      avisar.sucesso('Título mantido em aberto e sinalizado como não pago.');
      setReasonOpenId(null);
      limparEdicoes([row.id]);
      await load();
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao informar o não pagamento.');
    } finally {
      setActionKey('');
    }
  }

  async function resolve(row, action) {
    if (!canResolve) return;
    return executarOperacao(() => performResolve(row, action));
  }

  async function estornar(row) {
    if (!hasPermissao(user, 'financeiro.titulos.estornar') || row.somente_consulta) return;
    await executarOperacao(async () => {
      const grupo = row.instrumento_pagamento_json?.liquidacao_id;
      const { ok, texto } = await confirmar({ titulo: grupo ? 'Estornar o grupo completo de pagamento?' : `Estornar baixa de ${row.titulo?.codigo || row.id}?`,
        mensagem: `${grupo ? 'Este pagamento compartilha instrumentos: TODOS os títulos do grupo serão estornados juntos, não apenas esta linha. ' : ''}Os movimentos serão estornados, cheques de terceiros voltarão à carteira e os saldos retornarão à fila. O histórico e os comprovantes anteriores serão preservados. Faturas já processadas impedem o estorno.`,
        rotuloConfirmar: 'Estornar e devolver para fila', destrutiva: true,
        campo: { rotulo: 'Motivo do estorno', obrigatorio: true, multilinha: true } });
      if (!ok) return;
      try {
        await estornarBaixaFilaPagamento(row.id, String(texto || '').trim(), idempotencyKey('fila-estorno'));
        avisar.sucesso(grupo ? 'Grupo completo estornado. Saldos devolvidos para a fila de pagamentos.' : 'Baixa estornada. Saldo devolvido para a fila de pagamentos.');
        limparEdicoes([row.id]); setSelected([]); await load();
      } catch (error) { avisar.erro(error?.message || 'Não foi possível estornar a baixa. Nenhum movimento foi alterado.'); }
    });
  }

  async function performResolve(row, action) {
    const reabrir = action === 'REABRIR';
    const { ok, texto } = await confirmar({
      titulo: reabrir ? 'Devolver título para pagamento?' : 'Encerrar esta pendência?',
      mensagem: reabrir
        ? 'O saldo atual do título volta para a fila operacional.'
        : 'A pendência deixa de aparecer como ativa. O saldo financeiro do título não será alterado.',
      rotuloConfirmar: reabrir ? 'Devolver para fila' : 'Encerrar pendência',
      campo: reabrir ? undefined : { rotulo: 'Observação', obrigatorio: false, multilinha: true }
    });
    if (!ok) return;
    setActionKey(`resolve-${row.id}`);
    try {
      await resolverFilaPagamento(row.id, action, reabrir ? '' : String(texto || '').trim());
      avisar.sucesso(reabrir ? 'Título devolvido para pagamento.' : 'Pendência encerrada.');
      limparEdicoes([row.id]);
      await load();
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao resolver a pendência.');
    } finally {
      setActionKey('');
    }
  }

  const pendingRows = useMemo(() => rows.filter((row) => row.status === 'PENDENTE' && !row.somente_consulta
    && Number(row.id) > 0 && !Number(row.movimento_financeiro_id)), [rows]);
  const divergentRows = useMemo(() => rows.filter((row) => row.status === 'DIVERGENTE'), [rows]);
  const receiptRows = useMemo(() => rows.filter(row => !row.somente_consulta && Number(row.id) > 0
    && ((row.status === 'PENDENTE' && !row.movimento_financeiro_id) || row.pendente_comprovante)), [rows]);
  const selectableRows = status === 'DIVERGENTE' && canResolve
    ? divergentRows
    : (['PENDENTE', 'PENDENTE_COMPROVANTE', 'TODOS'].includes(status) && canSettle ? receiptRows : []);
  const selectedRows = useMemo(
    () => selectableRows.filter((row) => selected.includes(Number(row.id))),
    [selectableRows, selected]
  );
  const approvingDivergences = status === 'DIVERGENTE';
  const selectedPayments = selectedRows.filter(row => pendingRows.some(r => Number(r.id) === Number(row.id)));
  const selectedReceipts = selectedRows.filter(row => receiptRows.some(r => Number(r.id) === Number(row.id)));
  const hasReceiptSelection = canSettle && ['PENDENTE', 'PENDENTE_COMPROVANTE', 'TODOS'].includes(status);
  const hasBulkAction = status === 'DIVERGENTE' ? canResolve : (['PENDENTE', 'TODOS'].includes(status) && canSettle);
  const showReasonColumn = ['DIVERGENTE', 'PENDENTE', 'NAO_PAGO', 'EM_EDICAO', 'TODOS', 'RESOLVIDO'].includes(status);
  const busy = Boolean(actionKey);
  const colunasOriginais = PAYMENT_QUEUE_COLUMNS.filter(column => showReasonColumn || column.key !== 'justificativa');
  const colunasVisiveis = colunasConfiguradas.disponiveis(colunasOriginais);

  return (
    <Pagina>
      {rows.some(row => edicoesFila[row.id] && edicoesFila[row.id].revisao !== revisaoFila(row)) &&
        <div className="app-empty-card" role="alert">
          Saldo ou status alterado. Os campos digitados foram preservados; confira os dados atuais antes da baixa.
          <button type="button" className="btn btn-outline btn-sm" disabled={Boolean(actionKey)} onClick={async () => {
            const { ok } = await confirmar({ titulo: 'Descartar rascunhos conflitantes',
              mensagem: 'Descartar somente os campos dos títulos que mudaram?', rotuloConfirmar: 'Descartar', destrutiva: true });
            if (!ok) return;
            const ids = rows.filter(row => edicoesFila[row.id] && edicoesFila[row.id].revisao !== revisaoFila(row)).map(row => String(row.id));
            limparEdicoes(ids);
            await load();
          }}>Descartar rascunhos conflitantes</button>
        </div>}
      <PageHeader
        titulo="Fila de Pagamentos"
        contagem={`${rows.length} título(s) à vista`}
        descricao="Confira os dados bancários e registre as baixas diretamente na tabela."
        acaoPrincipal={hasBulkAction ? {
          rotulo: busy
            ? 'Processando...'
            : `${approvingDivergences ? 'Autorizar selecionados' : 'Baixa em massa'}${(approvingDivergences ? selectedRows : selectedPayments).length ? ` (${(approvingDivergences ? selectedRows : selectedPayments).length})` : ''}`,
          onClick: () => approvingDivergences ? approveDivergences(selectedRows) : setBaixaMassa({
            ids: selectedPayments.map(row => row.id), revisoes: selectedPayments.map(revisaoFila) }),
          desabilitada: loading || busy || (approvingDivergences ? selectedRows : selectedPayments).length === 0,
          icone: <HiOutlineCheckCircle aria-hidden="true" />
        } : undefined}
        secundarias={[
          ...(hasReceiptSelection ? [{
            rotulo: `Anexar mesmo comprovante${selectedReceipts.length ? ` (${selectedReceipts.length})` : ''}`,
            onClick: () => setComprovanteLote({ ids: selectedReceipts.map(r => Number(r.id)), arquivo: null }),
            desabilitada: loading || busy || !filaAutorizada || !selectedReceipts.length || selectedReceipts.length > 100,
            icone: <HiOutlineDocumentArrowUp aria-hidden="true" />
          }] : []),
          ...(canImportReceipts ? [{
            rotulo: 'Importar comprovantes',
            onClick: () => setComprovantesOpen(true),
            desabilitada: loading || busy,
            icone: <HiOutlineDocumentArrowUp aria-hidden="true" />
          }] : []),
          {
            rotulo: 'Atualizar',
            onClick: () => { limparAvisos(); load(); },
            desabilitada: loading || busy,
            icone: <HiOutlineArrowPath aria-hidden="true" />
          }
        ]}
      />

      <Avisos avisos={avisos} aoFechar={fecharAviso} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Filtros rápidos da fila">
        {SUMMARY_FILTERS.map((item) => (
          <SummaryFilter
            key={item.status}
            item={item}
            value={summary[item.status]}
            active={status === item.status}
            onClick={() => applyFilters(item.status, appliedSearch)}
            disabled={busy}
          />
        ))}
      </div>
      {status === 'PENDENTE_COMPROVANTE' && <p className="text-sm text-[var(--c-muted)]" role="status">
        Estes pagamentos já têm baixa registrada. Anexe os comprovantes na linha ou importe os PDFs; não é necessário registrar outra baixa.
      </p>}

      <BlocoConteudo
        titulo={status === 'PENDENTE_COMPROVANTE' ? 'Pagamentos pendentes de comprovante' : 'Pagamentos preparados'}
        variante="primario"
        cor="var(--module-financeiro)"
        descricao="Empresa do título é a empresa do colaborador no DP. Empresa pagadora vem da conta, cartão ou carteira usados na baixa."
        controles={(
          <div className="flex flex-wrap items-end gap-2">
            {colunasConfiguradas.painel}
            <label className="text-sm">
              <span className="sr-only">Status</span>
              <select className="input input-sm" value={status} onChange={(event) => applyFilters(event.target.value, appliedSearch)} disabled={busy}>
                {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <form
              className="app-busca flex min-w-0 items-center gap-2"
              onSubmit={(event) => { event.preventDefault(); applyFilters(status, search.trim()); }}
            >
              <input
                className="input input-sm min-w-0 flex-1"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Título, credor, obra ou centro de custo"
              />
              <button className="btn btn-outline btn-sm" type="submit" title="Pesquisar">
                <HiOutlineMagnifyingGlass className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
          </div>
        )}
      >
        <div className="mb-3 flex flex-wrap items-end gap-2" aria-label="Filtros dos títulos da fila">
          <label className="min-w-40 text-xs">Origem
            <select aria-label="Origem dos títulos" className="input input-sm w-full" value={filtros.origem} disabled={busy}
              onChange={e => applyFilters(status, appliedSearch, { ...filtros, origem: e.target.value })}>
              <option value="">Todas</option><option value="RH_DP">RH/DP</option><option value="OUTROS">Outras origens</option>
            </select></label>
          <label className="min-w-40 max-w-full text-xs">Empresa do título / colaborador
            <select aria-label="Empresa do título / colaborador" className="input input-sm w-full max-w-72" value={filtros.empresa_id} disabled={busy}
              onChange={e => applyFilters(status, appliedSearch, { ...filtros, empresa_id: e.target.value })}>
              <option value="">Todas</option>{opcoesFiltros.empresas.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
              {filtros.empresa_id && !opcoesFiltros.empresas.some(o => String(o.id) === String(filtros.empresa_id)) && <option value={filtros.empresa_id}>Empresa #{filtros.empresa_id} · sem títulos nesta situação</option>}
            </select></label>
          <label className="min-w-40 max-w-full text-xs">Credor
            <select aria-label="Credor" className="input input-sm w-full max-w-72" value={filtros.credor_id} disabled={busy}
              onChange={e => applyFilters(status, appliedSearch, { ...filtros, credor_id: e.target.value })}>
              <option value="">Todos</option>{opcoesFiltros.credores.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
              {filtros.credor_id && !opcoesFiltros.credores.some(o => String(o.id) === String(filtros.credor_id)) && <option value={filtros.credor_id}>Credor #{filtros.credor_id} · sem títulos nesta situação</option>}
            </select></label>
          <label className="min-w-40 text-xs">Recebimento DP
            <select aria-label="Recebimento DP" className="input input-sm w-full" value={filtros.recebimento_dp} disabled={busy}
              onChange={e => applyFilters(status, appliedSearch, { ...filtros, recebimento_dp: e.target.value })}>
              <option value="">Todos</option>{RECEBIMENTOS_DP.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
          <button type="button" className="btn btn-outline btn-sm" disabled={busy || !Object.values(filtros).some(Boolean)}
            onClick={() => applyFilters(status, appliedSearch, { origem: '', empresa_id: '', credor_id: '', recebimento_dp: '' })}>Limpar filtros dos títulos</button>
        </div>
        {rows.length >= 500 && <p role="status" className="mb-2 text-xs text-[var(--c-muted)]">A fila exibe até 500 títulos por consulta. Refine os filtros para localizar os demais; o relatório do DP lista todos os envios do recorte.</p>}
        {(hasBulkAction || hasReceiptSelection) && <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" aria-label="Selecionar todos os elegíveis desta lista"
              ref={(elemento) => { if (elemento) elemento.indeterminate = selectedRows.length > 0 && selectedRows.length < selectableRows.length; }}
              checked={selectableRows.length > 0 && selectedRows.length === selectableRows.length}
              disabled={loading || busy || !selectableRows.length}
              onChange={(event) => setSelected(event.target.checked ? selectableRows.map((row) => Number(row.id)) : [])} />
            {approvingDivergences ? 'Todas as divergências desta lista' : 'Todos os elegíveis desta lista'}
          </label>
          <span className="text-[var(--c-muted)]" role="status">{selectedRows.length} selecionado(s) · {currency(selectedRows.reduce((total, row) => total + Number(drafts[row.id]?.valor_pago || 0), 0))}</span>
        </div>}
        <div className="min-w-0 rounded-xl border border-[var(--c-border)]">
          <ResizableTable
            columns={colunasVisiveis}
            storageKey="financeiro-fila-pagamentos"
            className="w-full border-collapse text-sm"
            scrollLabel="Tabela da fila de pagamentos"
          >
            <thead className="bg-[var(--ui-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--c-muted)]">
              <LinhaColunasOperacionais cabecalho originais={colunasOriginais} visiveis={colunasVisiveis} configuracao={colunasConfiguradas}>
                <ResizableTh columnKey="selecao" className="px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label={approvingDivergences ? 'Selecionar todas as divergências' : 'Selecionar todos os títulos pendentes'}
                    checked={selectableRows.length > 0 && selectedRows.length === selectableRows.length}
                    onChange={(event) => setSelected(event.target.checked ? selectableRows.map((row) => Number(row.id)) : [])}
                    disabled={selectableRows.length === 0 || loading || busy}
                  />
                </ResizableTh>
                <ResizableTh columnKey="titulo" className="px-3 py-3">Título / documento</ResizableTh>
                <ResizableTh columnKey="local" className="px-3 py-3">Obra / Centro de Custo</ResizableTh>
                <ResizableTh columnKey="credor" className="px-3 py-3">Credor / favorecido</ResizableTh>
                <ResizableTh columnKey="empresa_colaborador" className="px-3 py-3">Empresa do colaborador</ResizableTh>
                <ResizableTh columnKey="recebimento_dp" className="px-3 py-3">Recebimento DP</ResizableTh>
                <ResizableTh columnKey="dados" className="px-3 py-3">Dados para pagamento</ResizableTh>
                <ResizableTh columnKey="vencimento" className="px-3 py-3">Vencimento</ResizableTh>
                <ResizableTh columnKey="saldo" className="px-3 py-3 text-right">Previsto / saldo</ResizableTh>
                <ResizableTh columnKey="data" className="px-3 py-3">Data da baixa</ResizableTh>
                <ResizableTh columnKey="conta" className="px-3 py-3">Conta pagadora</ResizableTh>
                <ResizableTh columnKey="instrumento" className="px-3 py-3">Forma / instrumento</ResizableTh>
                <ResizableTh columnKey="empresa" className="px-3 py-3">Empresa pagadora</ResizableTh>
                <ResizableTh columnKey="desconto" className="px-3 py-3 text-right">Desconto (R$)</ResizableTh>
                <ResizableTh columnKey="juros" className="px-3 py-3 text-right">Juros (R$)</ResizableTh>
                <ResizableTh columnKey="multa" className="px-3 py-3 text-right">Multa (R$)</ResizableTh>
                <ResizableTh columnKey="valor" className="px-3 py-3">Valor pago</ResizableTh>
                {showReasonColumn ? <ResizableTh columnKey="justificativa" className="px-3 py-3">Motivo / justificativa</ResizableTh> : null}
                <ResizableTh columnKey="acoes" className="px-3 py-3">Status / ações</ResizableTh>
              </LinhaColunasOperacionais>
            </thead>
            <tbody className="divide-y divide-[var(--c-border)] bg-[var(--c-surface)]">
              {loading ? (
                <tr><td colSpan={colunasVisiveis.length} className="px-4 py-8 text-center text-[var(--c-muted)]">Carregando pagamentos...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={colunasVisiveis.length} className="px-4 py-8 text-center text-[var(--c-muted)]">Nenhum título encontrado neste recorte.</td></tr>
              ) : rows.map((row) => {
                const title = row.titulo || {};
                const solicitacaoId = Number(title.solicitacao_id || title.solicitacao?.id);
                const solicitacaoVinculada = solicitacaoId > 0
                  ? {
                      id: solicitacaoId,
                      codigo: title.solicitacao?.codigo || `#${solicitacaoId}`,
                      temBoleto: Boolean(title.solicitacao?.boletos?.length)
                    }
                  : null;
                const beneficiary = beneficiaryData(title);
                const account = selectedAccount(row);
                const editable = row.status === 'PENDENTE' && canSettle;
                const selectable = selectableRows.some((item) => Number(item.id) === Number(row.id));
                const accountOptions = compatibleAccounts(row);
                const reasonVisible = reasonOpenId === row.id;
                const tipoDivergencia = editable ? tipoDivergenciaPagamento(row, drafts[row.id]) : '';
                const comprovantes = listarComprovantesFila(row);
                const podeAnexarMais = !row.somente_consulta && canSettle && (['PENDENTE', 'DIVERGENTE'].includes(row.status) ||
                  (['BAIXADO', 'RESOLVIDO'].includes(row.status) && (Number(row.movimento_financeiro_id) > 0 || Boolean(row.comprovante_hash))));
                return (
                  <LinhaColunasOperacionais key={row.id} originais={colunasOriginais} visiveis={colunasVisiveis}
                    data-fila-linha={row.id}
                    className={row.status === 'DIVERGENTE' ? 'bg-[var(--sem-danger-bg)]' : ['NAO_PAGO', 'EM_EDICAO'].includes(row.status) ? 'bg-[var(--sem-warning-bg)]' : ''}>
                    <td className="px-3 py-3 align-top">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${title.codigo || row.id}`}
                        checked={selectable && selected.includes(Number(row.id))}
                        onChange={(event) => setSelected((current) => event.target.checked
                          ? [...new Set([...current, Number(row.id)])]
                          : current.filter((id) => id !== Number(row.id)))}
                        disabled={!selectable || loading || busy}
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      {canOpenTitle ? (
                        <Link className="font-semibold text-[var(--module-financeiro)] hover:underline" to={`/financeiro/titulos/${title.id}`}>{title.codigo || `#${title.id}`}</Link>
                      ) : (
                        <span className="font-semibold text-[var(--c-text)]">{title.codigo || `#${title.id}`}</span>
                      )}
                      <div className="mt-1 max-w-56 truncate" title={title.descricao}>{title.descricao || 'Sem descrição'}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label={`Ações e comprovantes de ${title.codigo || row.id}`}>
                      {solicitacaoVinculada ? (
                        <>
                          <Link className="btn btn-outline btn-sm btn-icon-only" to={`/solicitacoes/${solicitacaoVinculada.id}`}
                            title={`Abrir solicitação ${solicitacaoVinculada.codigo}`} aria-label={`Abrir solicitação ${solicitacaoVinculada.codigo}`}>
                            <HiOutlineDocumentText className="h-4 w-4" aria-hidden="true" />
                          </Link>
                          <button type="button" className="btn btn-outline btn-sm btn-icon-only" onClick={(event) => {
                            guardarRolagemArquivos(event.currentTarget);
                            setSolicitacaoArquivos(solicitacaoVinculada);
                          }}
                            title={`Abrir ${solicitacaoVinculada.temBoleto ? 'boleto e arquivos' : 'arquivos'} de ${solicitacaoVinculada.codigo}`}
                            aria-label={`Abrir arquivos de ${solicitacaoVinculada.codigo}`}>
                            <HiOutlineFolderOpen className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </>
                      ) : null}
                      {comprovantes.length ? (
                        <div className="flex flex-wrap items-center gap-1" role="group" aria-label={`Comprovantes de ${title.codigo || row.id}`}>
                          {comprovantes.map((comprovante) => (
                            <button key={`${comprovante.filaId}-${comprovante.id || 'legado'}`}
                              type="button" className="btn btn-outline btn-sm btn-icon-only"
                              title={comprovante.nome}
                              aria-label={`Abrir comprovante ${comprovante.nome}`}
                              onClick={() => abrirComprovante(comprovante.filaId, comprovante.id, comprovante.nome)}>
                              <HiOutlineDocumentText className="h-4 w-4" aria-hidden="true" />
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {podeAnexarMais ? (
                        <label className="btn btn-outline btn-sm btn-icon-only inline-flex cursor-pointer focus-within:ring-2 focus-within:ring-[var(--module-financeiro)]"
                          title={comprovantes.length ? 'Adicionar comprovantes PDF' : 'Anexar comprovantes PDF'}
                          data-fila-id={row.id} data-fila-campo="comprovante">
                          <HiOutlineDocumentArrowUp className="h-4 w-4" aria-hidden="true" />
                          <input
                            className="sr-only"
                            type="file"
                            accept="application/pdf,.pdf"
                            multiple
                            disabled={busy}
                            aria-label={`Comprovantes de pagamento de ${title.codigo || row.id}`}
                            onChange={(event) => {
                              const arquivos = Array.from(event.target.files || []);
                              event.target.value = '';
                              anexarComprovante(row, arquivos);
                            }}
                          />
                        </label>
                      ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-60 font-medium" title={title.obra?.nome}>{[title.obra?.codigo, title.obra?.nome].filter(Boolean).join(' · ') || 'Não informado'}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-60 font-medium" title={beneficiary.nome}>{beneficiary.nome}</div>
                      <div className="text-xs text-[var(--c-muted)]">{beneficiary.documento || 'Documento não informado'}</div>
                    </td>
                    <td className="px-3 py-3 align-top">{ehTituloDp(title) ? title.empresa?.nome || 'Não informada no título' : '—'}</td>
                    <td className="px-3 py-3 align-top">{ehTituloDp(title) ? rotuloRecebimentoDp(title.recebimento_dp) : '—'}</td>
                    <td className="px-3 py-3 align-top">
                      <DadosPagamentoFila texto={beneficiary.pagamento} titulo={title.codigo || `#${row.id}`} favorecido={beneficiary.nome} />
                      {title.observacoes?.includes('\nReembolsos de vale:\n') && <details className="mt-2 max-w-64 text-xs">
                        <summary className="cursor-pointer">Ver colaboradores do reembolso</summary>
                        <div className="mt-1 whitespace-pre-wrap">{title.observacoes.split('\nReembolsos de vale:\n')[1]}</div>
                      </details>}
                    </td>
                    <td className="px-3 py-3 align-top whitespace-nowrap">{dateBR(title.data_vencimento || row.data_vencimento_prevista)}</td>
                    <td className="px-3 py-3 align-top text-right whitespace-nowrap">
                      <div>{currency(totalPrevistoFila(row, drafts[row.id]))}</div>
                      <div className="text-xs font-semibold text-[var(--c-muted)]">Saldo {currency(title.valor_saldo)}</div>
                      <div className="text-xs text-[var(--c-muted)]">Previsto com encargos e desconto</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <DateInputBR
                        className="input input-sm min-w-0 w-full"
                        data-fila-id={row.id}
                        data-fila-campo="data_baixa"
                        value={drafts[row.id]?.data_baixa || row.data_baixa || ''}
                        onChange={(event) => updateDraft(row.id, { data_baixa: event.target.value })}
                        disabled={!editable || busy}
                        aria-label={`Data da baixa de ${title.codigo || row.id}`}
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <select
                        className="input input-sm min-w-0 w-full"
                        data-fila-id={row.id}
                        data-fila-campo="conta_bancaria_id"
                        value={drafts[row.id]?.conta_bancaria_id ?? row.conta_bancaria_id ?? ''}
                        onChange={(event) => updateDraft(row.id, { conta_bancaria_id: event.target.value })}
                        disabled={!editable || busy}
                        aria-label={`Conta pagadora de ${title.codigo || row.id}`}
                      >
                        <option value="">Selecione</option>
                        {accountOptions.map((item) => (
                          <option key={item.id} value={item.id}>{item.nome} · {item.banco || 'Banco'} {item.conta || ''}</option>
                        ))}
                      </select>
                      {editable && accountOptions.length === 0 ? <div className="mt-1 text-xs text-[var(--sem-danger)]">Nenhuma conta bancária ativa com empresa vinculada.</div> : null}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <InstrumentoPagamentoFila row={row} draft={drafts[row.id]} instrumentos={instrumentos}
                        conta={account} disabled={!editable || busy} podeCadastrarCheque={hasPermissao(user, 'financeiro.cheques.cadastrar') && hasPermissao(user, 'financeiro.cheques.visualizar')}
                        onChange={patch => updateDraft(row.id, patch)} />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-48 text-xs font-medium">{row.instrumento_pagamento_json?.instrumentos?.some(item => item.usar_cheque_terceiro)
                        ? `Lote · empresas ${[...new Set(row.instrumento_pagamento_json.instrumentos.map(item => item.empresa_id))].map(id =>
                          accounts.find(item => Number(item.empresa_id) === Number(id))?.empresa?.nome ||
                          instrumentos.cheques.find(item => Number(item.empresa_id) === Number(id))?.empresa?.nome || `#${id}`).join(', ')}`
                        : account?.empresa?.nome || account?.empresa?.razao_social || title.empresa?.nome || 'Definida pela conta'}</div>
                    </td>
                    {['desconto', 'juros', 'multa'].map(campo => (
                      <td key={campo} className="px-3 py-3 align-top">
                            <input className="input input-sm input-moeda min-w-0 w-full text-right" style={{ minWidth: 0 }}
                              type="number" min="0" step="0.01" data-fila-id={row.id} data-fila-campo={campo}
                              value={drafts[row.id]?.[campo] ?? row[campo] ?? '0.00'}
                              onChange={event => updateDraft(row.id, { [campo]: event.target.value })}
                              disabled={!editable || busy}
                              aria-label={`${campo === 'desconto' ? 'Desconto' : campo === 'juros' ? 'Juros' : 'Multa'} de ${title.codigo || row.id}`} />
                      </td>
                    ))}
                    <td className="px-3 py-3 align-top">
                      <input
                        className="input input-sm input-moeda min-w-0 w-full text-right"
                        style={{ minWidth: 0 }}
                        data-fila-id={row.id}
                        data-fila-campo="valor_pago"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={drafts[row.id]?.valor_pago ?? valorParaInput(row.valor_informado || title.valor_saldo)}
                        onChange={(event) => updateDraft(row.id, { valor_pago: event.target.value })}
                        disabled={!editable || busy}
                        aria-label={`Valor pago de ${title.codigo || row.id}`}
                      />
                    </td>
                    {showReasonColumn ? (
                      <td className="px-3 py-3 align-top">
                        {editable ? (
                          <div className="min-w-0 w-full">
                            <textarea
                              className={`input min-h-20 w-full ${tipoDivergencia && !String(drafts[row.id]?.motivo || '').trim() ? 'border-[var(--sem-danger)]' : ''}`}
                              data-fila-id={row.id}
                              data-fila-campo="motivo"
                              value={drafts[row.id]?.motivo || ''}
                              onChange={(event) => updateDraft(row.id, { motivo: event.target.value })}
                              placeholder={tipoDivergencia ? 'Justificativa obrigatória' : 'Observação opcional'}
                              required={Boolean(tipoDivergencia)}
                              aria-label={`Justificativa do pagamento de ${title.codigo || row.id}`}
                              disabled={busy}
                            />
                            <div className={`mt-1 text-xs ${tipoDivergencia ? 'font-semibold text-[var(--sem-danger)]' : 'text-[var(--c-muted)]'}`}>
                              {mensagemJustificativaDivergencia(tipoDivergencia)}
                            </div>
                          </div>
                        ) : (
                          <div className="max-w-80 whitespace-pre-wrap text-xs text-[var(--c-text)]" title={row.motivo || ''}>
                            {row.motivo || 'Sem justificativa informada.'}
                          </div>
                        )}
                      </td>
                    ) : null}
                    <td className="px-3 py-3 align-top">
                      <StatusBadge status={row.status === 'EM_EDICAO' ? 'Em edição pelo DP' : String(row.status || '').replace('_', ' ')} kind={statusKind(row.status)} />
                      {row.status === 'EM_EDICAO' && <div className="mt-1 text-xs font-semibold text-[var(--sem-warning)]">Baixa bloqueada até o reenvio pelo DP</div>}
                      {row.pendente_comprovante && <div className="mt-1 text-xs font-semibold text-[var(--sem-warning)]">Pagamento registrado · pendente de comprovante</div>}
                      {row.somente_consulta && <div className="mt-1 text-xs text-[var(--sem-danger)]">Rejeitado pelo proprietário · somente consulta</div>}
                      {!showReasonColumn && row.motivo ? <div className="mt-2 max-w-64 text-xs text-[var(--c-muted)]" title={row.motivo}>{row.motivo}</div> : null}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {editable && canSettle ? (
                          <button className="btn btn-primary btn-sm" type="button" onClick={() => settle([row])} disabled={busy}>Registrar baixa</button>
                        ) : null}
                        {['BAIXADO', 'RESOLVIDO'].includes(row.status) && !row.instrumento_pagamento_json?.estorno && hasPermissao(user, 'financeiro.titulos.estornar') && !row.somente_consulta && row.movimento_financeiro_id ? (
                          <button className="btn btn-outline btn-sm" type="button" disabled={busy} onClick={() => estornar(row)}>Estornar baixa</button>
                        ) : null}
                        {row.status === 'PENDENTE' && canReport ? (
                          <button className="btn btn-outline btn-sm" type="button" onClick={() => setReasonOpenId(reasonVisible ? null : row.id)} disabled={busy}>Não pago</button>
                        ) : null}
                        {row.status === 'DIVERGENTE' && canResolve ? (
                          <button className="btn btn-primary btn-sm" type="button" onClick={() => approveDivergences([row])} disabled={busy}>Autorizar baixa</button>
                        ) : null}
                        {!row.somente_consulta && ['NAO_PAGO', 'DIVERGENTE'].includes(row.status) && canResolve ? (
                          <>
                            {Number(title.valor_saldo || 0) > 0 ? <button className="btn btn-outline btn-sm" type="button" onClick={() => resolve(row, 'REABRIR')} disabled={busy}>Devolver para fila</button> : null}
                            <button className="btn btn-outline btn-sm" type="button" onClick={() => resolve(row, 'ENCERRAR')} disabled={busy}>Encerrar</button>
                          </>
                        ) : null}
                      </div>
                      {reasonVisible ? (
                        <div className="mt-2 min-w-0 w-full">
                          <textarea
                            className="input min-h-20 w-full"
                            value={drafts[row.id]?.motivo || ''}
                            onChange={(event) => updateDraft(row.id, { motivo: event.target.value })}
                            placeholder="Motivo do não pagamento"
                            disabled={busy}
                          />
                          <button className="btn btn-outline btn-sm mt-1" type="button" onClick={() => reportNotPaid(row)} disabled={busy}>Confirmar não pagamento</button>
                        </div>
                      ) : null}
                    </td>
                  </LinhaColunasOperacionais>
                );
              })}
            </tbody>
          </ResizableTable>
        </div>
        <p className="mt-3 text-xs text-[var(--c-muted)]">
          O processamento em massa é atômico: se uma linha falhar na validação, nenhuma baixa do lote é gravada.
        </p>
      </BlocoConteudo>
      <ErroRegistroBaixaModal erro={erroBaixa} onFechar={fecharErroRegistroBaixa} />
      {baixaMassa && <BaixaMassaFilaModal rows={rows.filter(row => baixaMassa.ids.includes(row.id))}
        accounts={accounts} drafts={drafts} instrumentos={instrumentos}
        podeCadastrarCheque={hasPermissao(user, 'financeiro.cheques.cadastrar') && hasPermissao(user, 'financeiro.cheques.visualizar')}
        busy={Boolean(actionKey)} onFechar={() => setBaixaMassa(null)}
        onConfirmar={async patch => {
          const atuais = baixaMassa.ids.map(id => rows.find(row => row.id === id));
          if (!canSettle || !filaAutorizada || atuais.some((row, i) => !row || row.status !== 'PENDENTE'
            || row.somente_consulta || revisaoFila(row) !== baixaMassa.revisoes[i])) return 'A seleção mudou. Feche o modal, atualize e confira a fila.';
          const dados = Object.fromEntries(atuais.map(row => [row.id, { ...draftsRef.current[row.id],
            ...patch.pagamentos[row.id], conta_bancaria_id: patch.conta_bancaria_id, data_baixa: patch.data_baixa }]));
          if (atuais.some(row => { const card = instrumentos.cartoes.find(item => Number(item.id) === Number(dados[row.id]?.cartao_id));
            return card && Number(card.conta_bancaria_id) !== patch.conta_bancaria_id; })) return 'Há cartão vinculado a outra conta. Separe os títulos por conta pagadora.';
          const problema = validateRows(atuais, dados, patch.instrumentos_lote);
          if (problema) return `${atuais.find(row => row.id === problema.filaId)?.titulo?.codigo || ''}: ${problema.mensagem} ${problema.correcao}`;
          atuais.forEach(row => updateDraft(row.id, { ...patch.pagamentos[row.id],
            conta_bancaria_id: patch.conta_bancaria_id, data_baixa: patch.data_baixa }));
          await executarOperacao(() => performSettle(atuais, dados, patch.instrumentos_lote));
          return null;
        }} />}
      {comprovanteLote && canSettle && filaAutorizada && <OverlayModal rotulo="Anexar mesmo comprovante" largura="660px" onFechar={busy ? undefined : () => setComprovanteLote(null)}>
        <div className="p-4 space-y-4">
          <h2 className="app-bloco-titulo">Anexar mesmo comprovante · {comprovanteLote.ids.length} título(s)</h2>
          <p className="app-note">O PDF será anexado a todos os selecionados. Não altera valores, contas, datas ou pagamentos e não registra baixa. Um arquivo já vinculado ao mesmo título não será duplicado.</p>
          <details><summary>Conferir títulos selecionados</summary><ul>{rows.filter(r => comprovanteLote.ids.includes(Number(r.id))).map(r => <li key={r.id}>{r.titulo?.codigo || r.id} · {r.titulo?.descricao}</li>)}</ul></details>
          <label className="block text-sm">Comprovante PDF (até 12 MB)
            <input aria-label="Comprovante compartilhado PDF" type="file" accept="application/pdf,.pdf" disabled={busy}
              onChange={e => { const arquivo = e.target.files?.[0];
                if (arquivo && (arquivo.size > 12 * 1024 * 1024 || !arquivo.name.toLowerCase().endsWith('.pdf'))) {
                  avisar.erro('Selecione um PDF de até 12 MB.'); e.target.value = ''; setComprovanteLote(v => ({ ...v, arquivo: null })); return;
                }
                setComprovanteLote(v => ({ ...v, arquivo: arquivo || null }));
              }} />
          </label>
          {busy && <p role="status">Anexando comprovante aos títulos…</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn btn-outline btn-sm" type="button" disabled={busy} onClick={() => setComprovanteLote(null)}>Voltar</button>
            <button className="btn btn-primary btn-sm" type="button" disabled={busy || !comprovanteLote.arquivo} onClick={anexarMesmoComprovante}>Anexar aos {comprovanteLote.ids.length} selecionados</button>
          </div>
        </div>
      </OverlayModal>}
      {comprovantesOpen && canImportReceipts && filaAutorizada ? (
        <ComprovantesPdfModal
          onFechar={() => setComprovantesOpen(false)}
          onVinculados={async (quantidade) => {
            setComprovantesOpen(false);
            setDrafts({});
            avisar.sucesso(`${quantidade} comprovante(s) vinculado(s). Pagamentos já baixados permanecem inalterados; para os ainda pendentes, confira os dados antes da baixa.`);
            await load();
          }}
          onParcial={async (quantidade) => {
            setDrafts({});
            avisar.alerta(`${quantidade} comprovante(s) foram vinculados. A fila foi atualizada; revise a mensagem da importação para continuar.`);
            await load();
          }}
        />
      ) : null}
      {solicitacaoArquivos ? (
        <ArquivosSolicitacaoFilaModal
          key={solicitacaoArquivos.id}
          solicitacao={solicitacaoArquivos}
          onFechar={() => setSolicitacaoArquivos(null)}
        />
      ) : null}
      {elementoConfirmacao}
      {modalPreview}
    </Pagina>
  );
}
