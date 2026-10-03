import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  HiOutlineArrowPath,
  HiOutlineCheckCircle,
  HiOutlineDocumentArrowUp,
  HiOutlineExclamationTriangle,
  HiOutlineMagnifyingGlass
} from 'react-icons/hi2';
import { useAuth } from '../contexts/AuthContext';
import {
  anexarComprovanteFilaPagamento,
  aprovarDivergenciasFilaPagamentos,
  getContasFilaPagamentos,
  getComprovanteFilaPagamento,
  getFilaPagamentos,
  informarNaoPagamentoFila,
  previewComprovantesFilaPagamentos,
  registrarBaixasFilaPagamentos,
  resolverFilaPagamento,
  vincularComprovantesFilaPagamentos
} from '../services/financeiro';
import {
  canBaixarFilaPagamentos,
  canAccessFinanceiro,
  canImportarComprovantesFilaPagamentos,
  canReportarFilaPagamentos,
  canResolverFilaPagamentos
} from '../utils/acessoProduto';
import DateInputBR from '../components/DateInputBR';
import StatusBadge from '../components/StatusBadge';
import OverlayModal from '../components/ui/OverlayModal';
import ArquivosSolicitacaoFilaModal from '../components/financeiro/ArquivosSolicitacaoFilaModal';
import { ResizableTable, ResizableTh } from '../components/ResizableTable';
import { listarComprovantesFila } from '../utils/comprovantesFila';
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
  ['NAO_PAGO', 'Não pagos'],
  ['DIVERGENTE', 'Divergentes'],
  ['BAIXADO', 'Baixados'],
  ['RESOLVIDO', 'Resolvidos'],
  ['TODOS', 'Todos']
];

const STATUS_VALUES = new Set(STATUS_OPTIONS.map(([value]) => value));
const SUMMARY_FILTERS = [
  { status: 'PENDENTE', label: 'Pendentes', tone: 'info' },
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
  { key: 'selecao', size: 'selection' },
  { key: 'titulo', size: 'wider' },
  { key: 'credor', size: 'wide' },
  { key: 'dados', size: 'wide' },
  { key: 'vencimento', size: 'compact' },
  { key: 'saldo', size: 'standard' },
  { key: 'data', size: 'standard' },
  { key: 'conta', size: 'wide' },
  { key: 'empresa', size: 'standard' },
  { key: 'valor', size: 'standard' },
  { key: 'justificativa', size: 'wider' },
  { key: 'acoes', size: 'wider' }
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
  if (status === 'DIVERGENTE') return 'danger';
  if (status === 'NAO_PAGO') return 'warning';
  if (status === 'BAIXADO' || status === 'RESOLVIDO') return 'success';
  return 'info';
}

function beneficiaryData(titulo) {
  const beneficiary = titulo?.paymentBeneficiary;
  const solicitacao = titulo?.solicitacao || {};
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
    else if (beneficiary.pix_chave) pagamento = `PIX ${beneficiary.pix_tipo_chave || ''}: ${beneficiary.pix_chave}`;
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
  const previsto = valorEmCentavos(row?.valor_previsto);
  if (!valorPago || saldo === null || previsto === null) return '';
  if (valorPago < saldo) return 'PARCIAL';
  if (valorPago > saldo) return 'ACIMA_SALDO';
  if (valorPago !== previsto) return 'DIFERENTE_PREVISTO';
  return '';
}

function mensagemJustificativaDivergencia(tipo) {
  if (tipo === 'PARCIAL') return 'Justifique por que o pagamento será parcial.';
  if (tipo === 'ACIMA_SALDO') return 'Justifique por que o pagamento será maior que o saldo.';
  if (tipo === 'DIFERENTE_PREVISTO') return 'Justifique a diferença em relação ao valor previsto.';
  return 'Opcional quando o valor pago corresponde ao saldo e ao previsto.';
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
  const [files, setFiles] = useState([]);
  const [preview, setPreview] = useState(null);
  const [links, setLinks] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  async function readFiles() {
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
      allFiles.forEach((item) => {
        const suggestedId = Number(item.fila_sugerida_id);
        const canUseSuggestion = !item.duplicado && suggestedId > 0;
        initialLinks[item.arquivo_hash] = canUseSuggestion ? suggestedId : '';
      });
      setPreview({ arquivos: allFiles, titulos_pendentes: [...titleOptions.values()] });
      setLinks(initialLinks);
    } catch (readError) {
      setError(readError?.message || 'Não foi possível ler os comprovantes.');
    } finally {
      setProgress('');
      setBusy(false);
    }
  }

  async function linkFiles() {
    const selectedItems = (preview?.arquivos || [])
      .filter((item) => !item.duplicado && Number(links[item.arquivo_hash]))
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
        linkedCount += Number(result?.quantidade || batch.length);
      }
      await onVinculados(linkedCount);
    } catch (linkError) {
      if (linkedCount > 0) {
        await onParcial?.(linkedCount);
        setError(`${linkedCount} comprovante(s) foram vinculados antes da falha. Atualize e reabra a importação para continuar. ${linkError?.message || ''}`.trim());
      } else {
        setError(linkError?.message || 'Não foi possível vincular os comprovantes.');
      }
    } finally {
      setProgress('');
      setBusy(false);
    }
  }

  const options = preview?.titulos_pendentes || [];
  const selectedCount = Object.values(links).filter((value) => Number(value)).length;

  return (
    <OverlayModal rotulo="Importar comprovantes PDF" largura="var(--modal-max-w-xl, 1420px)" onFechar={busy ? undefined : onFechar}>
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
                setError('');
              }}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-[var(--c-muted)]">Selecione até 500 PDFs. O sistema processa blocos seguros de 10 arquivos automaticamente; limite de 12 MB por PDF. Use um pagamento por arquivo.</span>
              <button className="btn btn-outline" type="button" onClick={readFiles} disabled={busy || !files.length}>
                {busy && !preview ? (progress || 'Lendo PDFs...') : 'Ler comprovantes'}
              </button>
            </div>
            {files.length ? <div className="mt-2 text-xs font-medium text-[var(--c-text)]">{files.length} arquivo(s) selecionado(s)</div> : null}
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
                              onChange={(event) => setLinks((current) => ({ ...current, [item.arquivo_hash]: event.target.value }))}
                              disabled={busy}
                              aria-label={`Título para ${item.arquivo_nome}`}
                            >
                              <option value="">Selecione para revisar</option>
                              {options.map((option) => (
                                <option key={option.fila_id} value={option.fila_id}>
                                  {option.titulo_codigo || `#${option.titulo_id}`} · {currency(option.valor_saldo)} · {option.favorecido || 'Sem favorecido'}
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
            <button className="btn btn-outline" type="button" onClick={onFechar} disabled={busy}>Cancelar</button>
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
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { avisos, avisar, fechar: fecharAviso, limpar: limparAvisos } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const initialStatus = STATUS_VALUES.has(String(searchParams.get('status') || '').toUpperCase())
    ? String(searchParams.get('status')).toUpperCase()
    : 'PENDENTE';
  const initialSearch = String(searchParams.get('q') || '');
  const [status, setStatus] = useState(initialStatus);
  const [search, setSearch] = useState(initialSearch);
  const [appliedSearch, setAppliedSearch] = useState(initialSearch);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [accounts, setAccounts] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionKey, setActionKey] = useState('');
  const [reasonOpenId, setReasonOpenId] = useState(null);
  const [erroBaixa, setErroBaixa] = useState(null);
  const [comprovantesOpen, setComprovantesOpen] = useState(false);
  const [solicitacaoArquivos, setSolicitacaoArquivos] = useState(null);

  const canSettle = canBaixarFilaPagamentos(user);
  const canOpenTitle = canAccessFinanceiro(user);
  const canReport = canReportarFilaPagamentos(user);
  const canResolve = canResolverFilaPagamentos(user);
  const canImportReceipts = canImportarComprovantesFilaPagamentos(user);

  function applyFilters(nextStatus = status, nextSearch = appliedSearch) {
    setStatus(nextStatus);
    setAppliedSearch(nextSearch);
    setSelected([]);
    const nextParams = new URLSearchParams();
    if (nextStatus !== 'PENDENTE') nextParams.set('status', nextStatus);
    if (nextSearch) nextParams.set('q', nextSearch);
    setSearchParams(nextParams, { replace: true });
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [queueResult, accountResult] = await Promise.all([
        getFilaPagamentos({ status, q: appliedSearch || undefined }),
        getContasFilaPagamentos()
      ]);
      const nextRows = queueResult?.data || [];
      setRows(nextRows);
      setSummary(queueResult?.resumo || {});
      setAccounts(Array.isArray(accountResult) ? accountResult : accountResult?.data || []);
      setSelected((current) => current.filter((id) => nextRows.some((row) => Number(row.id) === Number(id))));
      setDrafts((current) => {
        const next = { ...current };
        nextRows.forEach((row) => {
          if (!next[row.id]) {
            next[row.id] = {
              data_baixa: row.data_baixa || hojeISO(),
              conta_bancaria_id: row.conta_bancaria_id || '',
              valor_pago: valorParaInput(row.valor_informado || row?.titulo?.valor_saldo || row.valor_previsto),
              motivo: row.motivo || ''
            };
          }
        });
        return next;
      });
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao carregar a fila de pagamentos.');
    } finally {
      setLoading(false);
    }
  }, [status, appliedSearch, avisar]);

  useEffect(() => { load(); }, [load]);

  function updateDraft(id, patch) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  function compatibleAccounts(row) {
    return accounts.filter((account) => account.ativo !== false && account.empresa_id);
  }

  function selectedAccount(row) {
    const id = Number(drafts[row.id]?.conta_bancaria_id || 0);
    return accounts.find((account) => Number(account.id) === id) || null;
  }

  function validateRows(targetRows) {
    for (const row of targetRows) {
      const draft = drafts[row.id] || {};
      if (!draft.data_baixa) return { mensagem: `A data da baixa do título ${row.titulo?.codigo || row.id} não foi informada.`, correcao: 'Preencha uma data válida na coluna Data da baixa.', filaId: row.id, campo: 'data_baixa' };
      if (!Number(draft.conta_bancaria_id)) return { mensagem: `A conta pagadora do título ${row.titulo?.codigo || row.id} não foi selecionada.`, correcao: 'Selecione uma conta na coluna Conta pagadora.', filaId: row.id, campo: 'conta_bancaria_id' };
      if (!(Number(draft.valor_pago) > 0)) return { mensagem: `O valor pago do título ${row.titulo?.codigo || row.id} é inválido.`, correcao: 'Informe um valor maior que zero na coluna Valor pago.', filaId: row.id, campo: 'valor_pago' };
      if (!row.comprovante_hash) return { mensagem: `O título ${row.titulo?.codigo || row.id} está sem comprovante de pagamento.`, correcao: 'Anexe um PDF na linha do título antes de registrar a baixa.', filaId: row.id, campo: 'comprovante' };
      const tipoDivergencia = tipoDivergenciaPagamento(row, draft);
      if (tipoDivergencia && !String(draft.motivo || '').trim()) {
        return { mensagem: `O valor do título ${row.titulo?.codigo || row.id} é divergente e está sem justificativa.`, correcao: mensagemJustificativaDivergencia(tipoDivergencia), filaId: row.id, campo: 'motivo' };
      }
    }
    return null;
  }

  async function anexarComprovante(row, arquivos) {
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

  async function abrirComprovante(filaId, comprovanteId) {
    try {
      const resposta = await getComprovanteFilaPagamento(filaId, comprovanteId);
      const link = document.createElement('a');
      link.href = resposta.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      avisar.erro(error?.message || 'Não foi possível abrir o comprovante.');
    }
  }

  function fecharErroRegistroBaixa() {
    const alvo = erroBaixa?.filaId && erroBaixa?.campo
      ? `[data-fila-id="${erroBaixa.filaId}"][data-fila-campo="${erroBaixa.campo}"]`
      : '';
    setErroBaixa(null);
    if (alvo) requestAnimationFrame(() => document.querySelector(alvo)?.focus());
  }

  async function settle(targetRows) {
    const problem = validateRows(targetRows);
    if (problem) {
      setErroBaixa({ ...problem, lote: targetRows.length > 1 });
      return;
    }
    const total = targetRows.reduce((sum, row) => sum + Number(drafts[row.id]?.valor_pago || 0), 0);
    const { ok } = await confirmar({
      titulo: targetRows.length === 1 ? 'Registrar baixa deste título?' : 'Registrar baixas selecionadas?',
      mensagem: `${targetRows.length} título(s), total informado ${currency(total)}. Valores divergentes exigem justificativa: pagamentos parciais registram a baixa parcial e valores acima do saldo aguardam autorização.`,
      rotuloConfirmar: targetRows.length === 1 ? 'Registrar baixa' : 'Registrar baixas',
      destrutiva: false
    });
    if (!ok) return;

    const key = idempotencyKey('fila-baixa');
    setActionKey(`settle-${key}`);
    try {
      const result = await registrarBaixasFilaPagamentos(targetRows.map((row) => ({
        fila_id: row.id,
        data_baixa: drafts[row.id].data_baixa,
        conta_bancaria_id: Number(drafts[row.id].conta_bancaria_id),
        valor_pago: Number(drafts[row.id].valor_pago),
        motivo: String(drafts[row.id].motivo || '').trim() || undefined
      })), key);
      avisar.sucesso(`${result?.baixados || 0} baixa(s) registrada(s). ${result?.divergentes || 0} divergência(s) sinalizada(s).`);
      setSelected([]);
      await load();
    } catch (error) {
      const detalhe = orientarErroRegistroBaixa(error);
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
      await load();
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao aprovar as divergências. Nenhum item do lote foi alterado.');
    } finally {
      setActionKey('');
    }
  }

  async function reportNotPaid(row) {
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
      await load();
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao informar o não pagamento.');
    } finally {
      setActionKey('');
    }
  }

  async function resolve(row, action) {
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
      await load();
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao resolver a pendência.');
    } finally {
      setActionKey('');
    }
  }

  const pendingRows = useMemo(() => rows.filter((row) => row.status === 'PENDENTE'), [rows]);
  const divergentRows = useMemo(() => rows.filter((row) => row.status === 'DIVERGENTE'), [rows]);
  const selectableRows = status === 'DIVERGENTE' && canResolve
    ? divergentRows
    : (status === 'PENDENTE' && canSettle ? pendingRows : []);
  const selectedRows = useMemo(
    () => selectableRows.filter((row) => selected.includes(Number(row.id))),
    [selectableRows, selected]
  );
  const approvingDivergences = status === 'DIVERGENTE';
  const hasBulkAction = status === 'DIVERGENTE' ? canResolve : (status === 'PENDENTE' && canSettle);
  const showReasonColumn = status === 'DIVERGENTE' || status === 'PENDENTE';
  const busy = Boolean(actionKey);

  return (
    <Pagina>
      <PageHeader
        titulo="Fila de Pagamentos"
        contagem={`${rows.length} título(s) à vista`}
        descricao="Confira os dados bancários e registre as baixas diretamente na tabela."
        acaoPrincipal={hasBulkAction ? {
          rotulo: busy
            ? 'Processando...'
            : `${approvingDivergences ? 'Autorizar' : 'Registrar'} selecionados${selectedRows.length ? ` (${selectedRows.length})` : ''}`,
          onClick: () => approvingDivergences ? approveDivergences(selectedRows) : settle(selectedRows),
          desabilitada: busy || selectedRows.length === 0,
          icone: <HiOutlineCheckCircle aria-hidden="true" />
        } : undefined}
        secundarias={[
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-label="Filtros rápidos da fila">
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

      <BlocoConteudo
        titulo="Pagamentos preparados"
        variante="primario"
        cor="var(--module-financeiro)"
        descricao="A empresa é determinada pela conta bancária selecionada; não há escolha separada."
        controles={(
          <div className="flex flex-wrap items-end gap-2">
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
                placeholder="Título, credor, documento ou obra"
              />
              <button className="btn btn-outline btn-sm" type="submit" title="Pesquisar">
                <HiOutlineMagnifyingGlass className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
          </div>
        )}
      >
        <div className="min-w-0 rounded-xl border border-[var(--c-border)]">
          <ResizableTable
            columns={PAYMENT_QUEUE_COLUMNS.filter((column) => showReasonColumn || column.key !== 'justificativa')}
            storageKey="financeiro-fila-pagamentos"
            className="w-full border-collapse text-sm"
            scrollLabel="Tabela da fila de pagamentos"
          >
            <thead className="bg-[var(--ui-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--c-muted)]">
              <tr>
                <ResizableTh columnKey="selecao" className="px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label={approvingDivergences ? 'Selecionar todas as divergências' : 'Selecionar todos os títulos pendentes'}
                    checked={selectableRows.length > 0 && selectedRows.length === selectableRows.length}
                    onChange={(event) => setSelected(event.target.checked ? selectableRows.map((row) => Number(row.id)) : [])}
                    disabled={selectableRows.length === 0 || busy}
                  />
                </ResizableTh>
                <ResizableTh columnKey="titulo" className="px-3 py-3">Título / documento</ResizableTh>
                <ResizableTh columnKey="credor" className="px-3 py-3">Credor / favorecido</ResizableTh>
                <ResizableTh columnKey="dados" className="px-3 py-3">Dados para pagamento</ResizableTh>
                <ResizableTh columnKey="vencimento" className="px-3 py-3">Vencimento</ResizableTh>
                <ResizableTh columnKey="saldo" className="px-3 py-3 text-right">Previsto / saldo</ResizableTh>
                <ResizableTh columnKey="data" className="px-3 py-3">Data da baixa</ResizableTh>
                <ResizableTh columnKey="conta" className="px-3 py-3">Conta pagadora</ResizableTh>
                <ResizableTh columnKey="empresa" className="px-3 py-3">Empresa</ResizableTh>
                <ResizableTh columnKey="valor" className="px-3 py-3">Valor pago</ResizableTh>
                {showReasonColumn ? <ResizableTh columnKey="justificativa" className="px-3 py-3">Justificativa</ResizableTh> : null}
                <ResizableTh columnKey="acoes" className="px-3 py-3">Status / ações</ResizableTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--c-border)] bg-[var(--c-surface)]">
              {loading ? (
                <tr><td colSpan={showReasonColumn ? 12 : 11} className="px-4 py-8 text-center text-[var(--c-muted)]">Carregando pagamentos...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={showReasonColumn ? 12 : 11} className="px-4 py-8 text-center text-[var(--c-muted)]">Nenhum título encontrado neste recorte.</td></tr>
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
                const podeAnexarMais = canSettle && (row.status === 'PENDENTE' || Boolean(row.comprovante_hash));
                return (
                  <tr key={row.id} className={row.status === 'DIVERGENTE' ? 'bg-[var(--sem-danger-bg)]' : row.status === 'NAO_PAGO' ? 'bg-[var(--sem-warning-bg)]' : ''}>
                    <td className="px-3 py-3 align-top">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${title.codigo || row.id}`}
                        checked={selected.includes(Number(row.id))}
                        onChange={(event) => setSelected((current) => event.target.checked
                          ? [...new Set([...current, Number(row.id)])]
                          : current.filter((id) => id !== Number(row.id)))}
                        disabled={!selectable || busy}
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      {canOpenTitle ? (
                        <Link className="font-semibold text-[var(--module-financeiro)] hover:underline" to={`/financeiro/titulos/${title.id}`}>{title.codigo || `#${title.id}`}</Link>
                      ) : (
                        <span className="font-semibold text-[var(--c-text)]">{title.codigo || `#${title.id}`}</span>
                      )}
                      <div className="mt-1 max-w-56 truncate" title={title.descricao}>{title.descricao || 'Sem descrição'}</div>
                      <div className="text-xs text-[var(--c-muted)]">{title.numero_documento || 'Sem documento'} · {title.formaPagamento?.nome || 'Forma não informada'}</div>
                      {solicitacaoVinculada ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Link className="btn btn-outline btn-sm" to={`/solicitacoes/${solicitacaoVinculada.id}`}>
                            Solicitação {solicitacaoVinculada.codigo}
                          </Link>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => setSolicitacaoArquivos(solicitacaoVinculada)}>
                            {solicitacaoVinculada.temBoleto ? 'Boleto / arquivos' : 'Arquivos'}
                          </button>
                        </div>
                      ) : null}
                      {comprovantes.length ? (
                        <div className="mt-2 flex flex-wrap gap-1" aria-label={`Comprovantes de ${title.codigo || row.id}`}>
                          {comprovantes.map((comprovante) => (
                            <button key={`${comprovante.filaId}-${comprovante.id || 'legado'}`}
                              type="button" className="btn btn-outline btn-sm max-w-48 truncate"
                              title={comprovante.nome}
                              onClick={() => abrirComprovante(comprovante.filaId, comprovante.id)}>
                              {comprovante.nome}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {podeAnexarMais ? (
                        <label className="btn btn-outline btn-sm mt-2 inline-flex cursor-pointer" data-fila-id={row.id} data-fila-campo="comprovante">
                          {comprovantes.length ? 'Adicionar comprovantes PDF' : 'Anexar comprovantes PDF'}
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
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-60 font-medium" title={beneficiary.nome}>{beneficiary.nome}</div>
                      <div className="text-xs text-[var(--c-muted)]">{beneficiary.documento || 'Documento não informado'}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="max-w-64 break-all text-xs" title={beneficiary.pagamento}>{beneficiary.pagamento}</div>
                    </td>
                    <td className="px-3 py-3 align-top whitespace-nowrap">{dateBR(title.data_vencimento || row.data_vencimento_prevista)}</td>
                    <td className="px-3 py-3 align-top text-right whitespace-nowrap">
                      <div>{currency(row.valor_previsto)}</div>
                      <div className="text-xs font-semibold text-[var(--c-muted)]">Saldo {currency(title.valor_saldo)}</div>
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
                        value={drafts[row.id]?.conta_bancaria_id || row.conta_bancaria_id || ''}
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
                      <div className="max-w-48 text-xs font-medium">{account?.empresa?.nome || account?.empresa?.razao_social || title.empresa?.nome || 'Definida pela conta'}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <input
                        className="input input-sm input-moeda min-w-0 w-full text-right"
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
                      <StatusBadge status={String(row.status || '').replace('_', ' ')} kind={statusKind(row.status)} />
                      {!showReasonColumn && row.motivo ? <div className="mt-2 max-w-64 text-xs text-[var(--c-muted)]" title={row.motivo}>{row.motivo}</div> : null}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {editable && canSettle ? (
                          <button className="btn btn-primary btn-sm" type="button" onClick={() => settle([row])} disabled={busy}>Registrar baixa</button>
                        ) : null}
                        {row.status === 'PENDENTE' && canReport ? (
                          <button className="btn btn-outline btn-sm" type="button" onClick={() => setReasonOpenId(reasonVisible ? null : row.id)} disabled={busy}>Não pago</button>
                        ) : null}
                        {row.status === 'DIVERGENTE' && canResolve ? (
                          <button className="btn btn-primary btn-sm" type="button" onClick={() => approveDivergences([row])} disabled={busy}>Autorizar baixa</button>
                        ) : null}
                        {['NAO_PAGO', 'DIVERGENTE'].includes(row.status) && canResolve ? (
                          <>
                            {Number(title.valor_saldo || 0) > 0 ? <button className="btn btn-outline btn-sm" type="button" onClick={() => resolve(row, 'REABRIR')} disabled={busy}>Reabrir</button> : null}
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
                  </tr>
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
      {comprovantesOpen ? (
        <ComprovantesPdfModal
          onFechar={() => setComprovantesOpen(false)}
          onVinculados={async (quantidade) => {
            setComprovantesOpen(false);
            setDrafts({});
            avisar.sucesso(`${quantidade} comprovante(s) vinculado(s). Confira os dados preenchidos antes de registrar a baixa.`);
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
    </Pagina>
  );
}
