import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceWork } from '../../navigation/WorkspaceContext';
import useWorkspaceRecordDraft from '../../navigation/useWorkspaceRecordDraft';
import useQueryRevision from '../../navigation/useQueryRevision';
import titulosWorkspaceRevision from '../../navigation/titulosWorkspaceRevision';
import { HiOutlinePlus, HiOutlineTrash, HiOutlineXMark } from 'react-icons/hi2';
import { confirmarBaixaFinanceiraComposta, previewBaixaFinanceiraComposta } from '../../services/financeiro';
import { TabelaPadrao } from '../padrao';
import ChequePagamentoFields from './ChequePagamentoFields';
import DateInputBR from '../DateInputBR';
import {useAuth} from '../../contexts/AuthContext';
import {podePermuta,ehPermuta} from '../../utils/permuta';
import ModalPortal from '../ui/ModalPortal';

function round(value) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100; }
function money(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function today() { return new Date().toISOString().slice(0, 10); }
const EMPTY_LIST = [];

const NATUREZAS_INTERCOMPANY = [
  { value: 'OPERACIONAL_TERCEIRO', label: 'Pagamento operacional por outra empresa' },
  { value: 'TRANSFERENCIA_INTERNA', label: 'Cobertura/transferência interna' },
  { value: 'REEMBOLSO_COMPENSACAO', label: 'Reembolso ou compensação' }
];

function operationalType(forma) {
  if (forma?.exige_cartao || forma?.gera_fatura) return 'CARTAO';
  if (forma?.exige_cheque) return 'CHEQUE';
  const raw = [forma?.tipo, forma?.codigo, forma?.nome].filter(Boolean).join(' ').toUpperCase();
  if (raw.includes('PIX')) return 'PIX';
  if (raw.includes('BOLETO')) return 'BOLETO';
  if (raw.includes('TRANSFER')) return 'TRANSFERENCIA';
  if (raw.includes('CARTAO') || raw.includes('CARTÃO')) return 'CARTAO';
  if (raw.includes('CHEQUE')) return 'CHEQUE';
  if (raw.includes('DINHEIRO')) return 'DINHEIRO';
  if (raw.includes('PERMUTA')) return 'PERMUTA';
  return 'OUTROS';
}

function contaExigeControleDiario(conta) {
  const valorConfigurado = conta?.exige_abertura_fechamento;
  const exigeAberturaFechamento = valorConfigurado === true
    || Number(valorConfigurado) === 1
    || String(valorConfigurado || '').trim().toLowerCase() === 'true';

  return exigeAberturaFechamento
    || String(conta?.tipo_operacional || '').toUpperCase() === 'CAIXA_INTERNO';
}

function newComponent(formas = [], empresaId = '') {
  return {
    empresa_id: empresaId,
    forma_pagamento_id: formas[0]?.id || '', conta_bancaria_id: '', cartao_id: '',
    cheque_terceiro_id: '', valor: '', documento_referencia: '', observacoes: '',
    cheque_numero: '', cheque_emitente: '', titular_documento: '', cheque_banco: '',
    cheque_agencia: '', cheque_conta: '', data_emissao: '', data_vencimento: '',
    natureza_intercompany_baixa: 'OPERACIONAL_TERCEIRO', motivo_intercompany: '', alocacoes: {}, empresa_sem_conta_id: ''
  };
}

function distribute(value, titulos, alreadyByTitle = {}) {
  let remaining = round(value);
  const result = {};
  titulos.forEach((titulo) => {
    const available = Math.max(0, round(Number(titulo.valor_saldo || 0) - Number(alreadyByTitle[titulo.id] || 0)));
    const used = Math.min(available, remaining);
    if (used > 0) result[titulo.id] = used;
    remaining = round(remaining - used);
  });
  return result;
}

function compareOldestTitle(first, second) {
  const firstDue = String(first?.data_vencimento || '9999-12-31');
  const secondDue = String(second?.data_vencimento || '9999-12-31');
  if (firstDue !== secondDue) return firstDue.localeCompare(secondDue);
  const firstIssue = String(first?.data_emissao || '9999-12-31');
  const secondIssue = String(second?.data_emissao || '9999-12-31');
  if (firstIssue !== secondIssue) return firstIssue.localeCompare(secondIssue);
  const firstCode = String(first?.codigo || '').trim();
  const secondCode = String(second?.codigo || '').trim();
  if (firstCode !== secondCode) return firstCode.localeCompare(secondCode, 'pt-BR', { numeric: true });
  return Number(first?.id || 0) - Number(second?.id || 0);
}

function redistributeComponents(components, titulos) {
  const alreadyByTitle = {};
  return components.map((component) => {
    const alocacoes = distribute(component.valor, titulos, alreadyByTitle);
    Object.entries(alocacoes).forEach(([titleId, value]) => {
      alreadyByTitle[titleId] = round((alreadyByTitle[titleId] || 0) + Number(value || 0));
    });
    return { ...component, alocacoes };
  });
}

export default function BaixaCompostaModal({
  titulos = EMPTY_LIST, formas:formasOriginais = EMPTY_LIST, contas = EMPTY_LIST, cartoes = EMPTY_LIST, cheques = EMPTY_LIST, ready = true, eligible = true, onClose, onConfirmed,
  contextoFila = false, empresas = EMPTY_LIST, revisaoContexto = '', chaveRascunho = 'baixaComposta',
  onPreview = previewBaixaFinanceiraComposta, onConfirm = confirmarBaixaFinanceiraComposta, onBusyChange, dataInicial
}) {
  const {user}=useAuth();
  const formas=useMemo(()=>formasOriginais.filter(f=>!ehPermuta(f)||podePermuta(user)),[formasOriginais,user]);
  const orderedTitles = useMemo(() => [...titulos].sort(compareOldestTitle), [titulos]);
  const titleType = String(orderedTitles[0]?.tipo || '').toUpperCase();
  const isReceivable = titleType === 'RECEBER';
  const operationName = isReceivable ? 'recebimento' : 'pagamento';
  const partnerName = isReceivable ? 'cliente' : 'credor';
  const [dateInitial] = useState(() => dataInicial || today());
  const firstFormId = formas[0]?.id || '';
  const initial = useMemo(() => ({ dataMovimento: dateInitial, observacoes: '', components: [newComponent([{ id: firstFormId }])] }), [dateInitial, firstFormId]);
  const slot = chaveRascunho + ':' + titulos.map(t => t.id).sort((a,b) => Number(a)-Number(b)).join(':');
  const draft = useWorkspaceRecordDraft(slot, initial);
  const form = draft.value || initial;
  const dataMovimento = form.dataMovimento;
  const observacoes = form.observacoes;
  // Empresa e valor de cheque de terceiro sempre vem do catalogo atual.
  // O workspace guarda os IDs escolhidos e campos editaveis, nao o saldo/
  // valor de um instrumento como autoridade para a baixa.
  const components = form.components.map(component => {
    const cheque = cheques.find(item => Number(item.id) === Number(component.cheque_terceiro_id));
    const cartao = cartoes.find(item => Number(item.id) === Number(component.cartao_id));
    const conta = contas.find(item => Number(item.id) === Number(component.conta_bancaria_id || cartao?.conta_bancaria_id));
    return { ...component, empresa_id: cheque?.empresa_id || conta?.empresa_id || (contextoFila && component.empresa_sem_conta_id) || orderedTitles[0]?.empresa_id || '',
      ...(component.cheque_terceiro_id ? { valor: Number(cheque?.valor || 0) } : {}) };
  });
  const setDataMovimento = value => { setPreview(null); confirmation.current = null; draft.setValue(current => ({ ...current, dataMovimento: value })); };
  const setObservacoes = value => { setPreview(null); confirmation.current = null; draft.setValue(current => ({ ...current, observacoes: value })); };
  const setComponents = update => {
    setPreview(null); confirmation.current = null;
    const rows = typeof update === 'function' ? update(components) : update;
    // newComponent define a whitelist completa e inclui todos os dados de
    // cheque proprio; empresa e cheque de terceiro sao derivados acima.
    const keys = Object.keys(newComponent()).filter(key => key !== 'empresa_id');
    draft.setValue(current => ({ ...current, components: rows.map(row => Object.fromEntries(keys.map(key =>
      [key, key === 'valor' && row.cheque_terceiro_id ? '' : row[key] ?? newComponent()[key]]))) }));
  };
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [available, setAvailable] = useState(false);
  const mutex = useRef(false);
  const confirmation = useRef(null);
  const revision = JSON.stringify([titulosWorkspaceRevision(titulos),
    formas.map(item => [item.id,item.ativo,item.tipo,item.codigo,item.gera_fatura]),
    contas.map(item => [item.id,item.ativo,item.empresa_id,item.tipo_operacional,item.exige_abertura_fechamento]),
    cartoes.map(item => [item.id,item.ativo,item.conta_bancaria_id]),
    cheques.map(item => [item.id,item.status,item.valor,item.empresa_id]), revisaoContexto]);
  const query = useQueryRevision(JSON.stringify([ready,revision,revisaoContexto]));
  useWorkspaceWork(draft.dirty, saving, slot + ':work');
  useEffect(() => { onBusyChange?.(saving); return () => onBusyChange?.(false); }, [saving, onBusyChange]);
  useEffect(() => {
    setPreview(null); confirmation.current = null; setAvailable(ready);
    if (ready) draft.hydrate(initial, revision); else draft.conceal(initial);
  }, [ready, revision, initial, draft.hydrate, draft.conceal]);
  const blocked = !ready || !available || !eligible || draft.conflict;
  function close() {
    if (mutex.current) return;
    draft.hydrate(initial, revision, { discard: true }); onClose();
  }
  const empresaId = Number(orderedTitles[0]?.empresa_id || 0);
  const parceiroId = Number(orderedTitles[0]?.parceiro_id || 0);
  const compatible = orderedTitles.length > 0
    && orderedTitles.every((item) => Number(item.parceiro_id) === parceiroId)
    && orderedTitles.every((item) => String(item.tipo || '').toUpperCase() === titleType);
  const totalSaldo = orderedTitles.reduce((sum, item) => sum + Number(item.valor_saldo || 0), 0);
  const totalComponents = components.reduce((sum, item) => sum + Number(item.valor || 0), 0);

  function updateComponent(index, field, value) {
    if (mutex.current || blocked) return;
    setPreview(null);
    setComponents((current) => {
      const updated = current.map((component, rowIndex) => {
      if (rowIndex !== index) return component;
      const next = { ...component, [field]: value };
      if (field === 'forma_pagamento_id') {
        next.conta_bancaria_id = ''; next.cartao_id = ''; next.cheque_terceiro_id = '';
      }
      if (field === 'conta_bancaria_id') {
        const conta = contas.find((item) => Number(item.id) === Number(value));
        next.empresa_id = String(conta?.empresa_id || orderedTitles[0]?.empresa_id || '');
      }
      if (field === 'cartao_id') {
        const cartao = cartoes.find((item) => Number(item.id) === Number(value));
        const contaCartao = contas.find((item) => Number(item.id) === Number(cartao?.conta_bancaria_id));
        if (contaCartao?.empresa_id) next.empresa_id = String(contaCartao.empresa_id);
        if (contextoFila) next.conta_bancaria_id = String(cartao?.conta_bancaria_id || '');
      }
      if (field === 'cheque_terceiro_id') {
        const cheque = cheques.find((item) => Number(item.id) === Number(value));
        if (cheque) {
          next.empresa_id = String(cheque.empresa_id || '');
          next.valor = Number(cheque.valor);
          next.cheque_numero = ''; next.cheque_emitente = ''; next.titular_documento = '';
          next.cheque_banco = ''; next.cheque_agencia = ''; next.cheque_conta = '';
          next.data_emissao = ''; next.data_vencimento = '';
        }
      }
      return next;
      });
      return ['valor', 'cheque_terceiro_id'].includes(field)
        ? redistributeComponents(updated, orderedTitles)
        : updated;
    });
  }

  function updateAllocation(componentIndex, titleId, value) {
    if (mutex.current || blocked) return;
    setPreview(null);
    setComponents((current) => current.map((component, index) => index === componentIndex
      ? { ...component, alocacoes: { ...component.alocacoes, [titleId]: value } }
      : component));
  }

  function buildPayload() {
    const componentes = components.map(({ alocacoes, empresa_sem_conta_id, ...component }) => ({
      ...component,
      documento_referencia: component.documento_referencia || component.cheque_numero || null,
      empresa_id: Number(component.empresa_id),
      forma_pagamento_id: Number(component.forma_pagamento_id),
      conta_bancaria_id: Number(component.conta_bancaria_id) || null,
      cartao_id: Number(component.cartao_id) || null,
      cheque_terceiro_id: Number(component.cheque_terceiro_id) || null,
      valor: Number(component.valor), juros: 0, multa: 0, desconto: 0
    }));
    const alocacoes = components.flatMap((component, componentIndex) => Object.entries(component.alocacoes || {})
      .filter(([, value]) => Number(value) > 0)
      .map(([tituloId, value]) => ({ componente_index: componentIndex, titulo_financeiro_id: Number(tituloId), valor: Number(value) })));
    return { empresa_id: contextoFila ? empresaId || undefined : empresaId, data_movimento: dataMovimento, observacoes, componentes, alocacoes };
  }

  function validateCashSources() {
    const contains = (rows, id, predicate = () => true) => !id || rows.some(row => Number(row.id) === Number(id) && predicate(row));
    if (components.some(component => !component.forma_pagamento_id
      || !contains(formas,component.forma_pagamento_id,row => row.ativo !== false && !row.gera_fatura)
      || !contains(contas,component.conta_bancaria_id,row => row.ativo !== false)
      || !contains(cartoes,component.cartao_id,row => row.ativo !== false)
      || !contains(cheques,component.cheque_terceiro_id,row => String(row.status).toUpperCase() === 'EM_CARTEIRA'))) {
      setError('Uma fonte não está disponível no cadastro atual. Confira as contas, formas e cheques selecionados.'); return false;
    }
    const fonteDinheiroInvalida = components.find((component) => {
      const forma = formas.find((item) => Number(item.id) === Number(component.forma_pagamento_id));
      if (operationalType(forma) !== 'DINHEIRO') return false;
      const conta = contas.find((item) => Number(item.id) === Number(component.conta_bancaria_id));
      return !contaExigeControleDiario(conta);
    });

    if (!fonteDinheiroInvalida) return true;
    setError('Cada fonte em dinheiro deve usar um caixa fisico com controle de abertura e fechamento.');
    return false;
  }

  async function review() {
    if (mutex.current || blocked || !compatible) return;
    if (!validateCashSources()) return;
    const token = query.begin();
    const payload = buildPayload();
    mutex.current = true;
    setSaving(true); setError('');
    try {
      const result = await onPreview(payload);
      if (!query.isCurrent(token)) return;
      confirmation.current = { payload: { ...payload, ...(result.versao_revisao ? { versao_revisao: result.versao_revisao } : {}) }, key: crypto.randomUUID() }; setPreview(result);
    }
    catch (err) { if (query.isCurrent(token)) { setError(err.message || 'Revise as fontes e os rateios.'); setPreview(null); confirmation.current = null; } }
    finally { mutex.current = false; setSaving(false); }
  }

  async function confirm() {
    if (mutex.current || blocked || !compatible || !preview || !confirmation.current) return;
    if (!validateCashSources()) return;
    const token = query.capture();
    mutex.current = true;
    setSaving(true); setError('');
    try {
      const result = await onConfirm(confirmation.current.payload, confirmation.current.key);
      if (!query.isCurrent(token)) return;
      draft.hydrate(initial, revision, { discard: true });
      await onConfirmed?.(result); onClose();
    } catch (err) {
      if (query.isCurrent(token)) {
        setError(err.message || 'Erro ao confirmar baixa composta.');
        if (contextoFila && [400, 403, 404, 409, 423].includes(err.status)) { setPreview(null); confirmation.current = null; }
      }
    }
    finally { mutex.current = false; setSaving(false); }
  }

  if (!ready) return null;
  const conteudo = (
    <div className="modal-overlay finance-operation-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="baixa-multiplas-fontes-titulo" onKeyDown={event => {
      if (!contextoFila || event.key !== 'Tab') return;
      const focaveis = [...event.currentTarget.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el => el.offsetParent !== null);
      const primeiro = focaveis[0], ultimo = focaveis.at(-1);
      if (event.shiftKey && document.activeElement === primeiro) { event.preventDefault(); ultimo?.focus(); }
      if (!event.shiftKey && document.activeElement === ultimo) { event.preventDefault(); primeiro?.focus(); }
    }}>
      <section className="modal-dialog finance-operation-modal finance-operation-modal--wide">
        <header className="modal-header">
          <div><h2 id="baixa-multiplas-fontes-titulo" className="modal-title">Baixa com múltiplas fontes</h2>{!contextoFila && <p className="modal-subtitle">Combine PIX, contas, cartões, dinheiro e cheques em um único {operationName} auditável.</p>}</div>
          <button className="modal-close-btn" type="button" disabled={saving} onClick={close} aria-label="Fechar baixa com múltiplas fontes"><HiOutlineXMark className="h-5 w-5" /></button>
        </header>
        <div className="modal-body min-h-0 flex-1 overflow-y-auto">
          {!compatible ? <div className="finance-operation-notice finance-operation-notice--warning mb-4">Selecione somente contas a {isReceivable ? 'receber' : 'pagar'} do mesmo {partnerName}.</div> : null}
          {compatible && new Set(orderedTitles.map((item) => Number(item.empresa_id))).size > 1 ? <div className="finance-operation-notice finance-operation-notice--info mb-4">Os títulos pertencem a empresas diferentes. Cada fonte será movimentada na sua empresa e os rateios entre empresas serão registrados individualmente para conciliação.</div> : null}
          {compatible && !contextoFila ? <div className="finance-operation-notice finance-operation-notice--info mb-4">Cada valor informado é distribuído automaticamente pelo vencimento: o título mais antigo é coberto primeiro e o último pode permanecer parcialmente pago.</div> : null}
          {error ? <div className="finance-operation-notice finance-operation-notice--danger mb-4">{error}</div> : null}
          {draft.conflict && <div role="alert" className="app-note">Os saldos ou instrumentos mudaram. Seu preenchimento foi preservado. <button type="button" className="btn btn-outline btn-sm" disabled={saving} onClick={() => { draft.discard(); setPreview(null); confirmation.current = null; }}>Descartar baixa digitada</button></div>}
          {!eligible && <p role="alert" className="app-note">Os títulos atuais não estão disponíveis para baixa.</p>}
          <fieldset disabled={saving || blocked}>
          <div className="mb-4 grid gap-3 md:grid-cols-[220px_1fr_auto]">
            <label className="form-control"><span>Data do {operationName}</span><DateInputBR autoFocus={contextoFila} className="input" value={dataMovimento} onChange={(e) => { setDataMovimento(e.target.value); setPreview(null); }} /></label>
            <label className="form-control"><span>Observações do grupo</span><input className="input" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder={`Ex.: ${isReceivable ? 'Recebimento' : 'Pagamento'} combinado acordado com o ${partnerName}`} /></label>
            <div className="finance-operation-metric self-end px-4 py-2"><small className="block text-[var(--c-muted)]">Saldo selecionado</small><strong>{money(totalSaldo)}</strong></div>
          </div>

          <div className="space-y-3">{components.map((component, index) => {
            const forma = formas.find((item) => Number(item.id) === Number(component.forma_pagamento_id));
            const type = operationalType(forma);
            const contasAtivas = contas.filter((item) => item.ativo !== false);
            const contasCompativeis = type === 'DINHEIRO'
              ? contasAtivas.filter((item) => contaExigeControleDiario(item))
              : contasAtivas;
            const chequesDisponiveis = cheques.filter((item) => String(item.status).toUpperCase() === 'EM_CARTEIRA');
            const cartoesDisponiveis = cartoes.filter((item) => item.ativo !== false);
            const temRateioIntercompany = Object.entries(component.alocacoes || {}).some(([tituloId, value]) => {
              const titulo = orderedTitles.find((item) => Number(item.id) === Number(tituloId));
              return Number(value) > 0 && Number(titulo?.empresa_id) !== Number(component.empresa_id);
            });
            const componentAllocated = Object.values(component.alocacoes || {}).reduce((sum, value) => sum + Number(value || 0), 0);
            return <section key={index} className="finance-operation-panel p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-[var(--c-text)]">Fonte {index + 1}</h3>{components.length > 1 ? <button type="button" className="btn btn-outline btn-sm text-[var(--status-rejected-text)]" onClick={() => { setComponents((rows) => redistributeComponents(rows.filter((_, rowIndex) => rowIndex !== index), orderedTitles)); setPreview(null); }}><HiOutlineTrash /></button> : null}</div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="form-control"><span>Forma de {operationName} *</span><select aria-label={`Forma de ${operationName} *`} className="select" value={component.forma_pagamento_id} onChange={(e) => updateComponent(index, 'forma_pagamento_id', e.target.value)}><option value="">Selecione</option>{formas.filter((item) => item.ativo !== false && !item.gera_fatura).map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
              {type === 'CHEQUE' && !isReceivable ? <label className="form-control"><span>Cheque de terceiro em carteira</span><select aria-label="Cheque de terceiro em carteira" className="select" value={component.cheque_terceiro_id} onChange={(e) => updateComponent(index, 'cheque_terceiro_id', e.target.value)}><option value="">Selecione um cheque cadastrado</option>{chequesDisponiveis.map((item) => <option key={item.id} value={item.id}>{item.codigo} · Nº {item.numero_cheque} · {money(item.valor)}{item.empresa?.nome ? ` · ${item.empresa.nome}` : ''}</option>)}</select>{!component.cheque_terceiro_id ? <small className="mt-1 text-xs text-[var(--c-muted)]">Sem seleção, informe a conta e o número do cheque emitido.</small> : null}</label> : null}
              {!['PERMUTA', 'OUTROS'].includes(type) && !(type === 'CHEQUE' && (component.cheque_terceiro_id || isReceivable)) ? <label className="form-control"><span>{type === 'DINHEIRO' ? 'Caixa físico *' : 'Conta financeira *'}</span><select aria-label={type === 'DINHEIRO' ? 'Caixa físico *' : 'Conta financeira *'} className="select" value={component.conta_bancaria_id} onChange={(e) => updateComponent(index, 'conta_bancaria_id', e.target.value)}><option value="">{type === 'DINHEIRO' ? 'Selecione o caixa físico' : 'Selecione uma conta'}</option>{contasCompativeis.map((item) => <option key={item.id} value={item.id}>{item.nome || item.banco_nome || `Conta #${item.id}`}{item.empresa?.nome ? ` · ${item.empresa.nome}` : ''}</option>)}</select>{type === 'DINHEIRO' ? <small className="mt-1 text-xs text-[var(--c-muted)]">O caixa deve estar aberto e abranger a data do {operationName}.{contasCompativeis.length === 0 ? ' Nenhum caixa físico ativo foi encontrado.' : ''}</small> : null}</label> : null}
              {type === 'CARTAO' ? <label className="form-control"><span>Cartão *</span><select className="select" value={component.cartao_id} onChange={(e) => updateComponent(index, 'cartao_id', e.target.value)}><option value="">Selecione</option>{cartoesDisponiveis.map((item) => <option key={item.id} value={item.id}>{item.nome || item.descricao || `Cartão #${item.id}`}</option>)}</select></label> : null}
              {contextoFila && ['PERMUTA', 'OUTROS', 'BENS'].includes(type) && <label className="form-control"><span>Empresa responsável *</span><select className="select" value={component.empresa_id || ''} onChange={e => updateComponent(index, 'empresa_sem_conta_id', e.target.value)}><option value="">Selecione</option>{empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></label>}
              <label className="form-control"><span>Valor da fonte *</span><input className="input" type="number" min="0.01" step="0.01" value={component.valor} readOnly={Boolean(component.cheque_terceiro_id)} onChange={(e) => updateComponent(index, 'valor', e.target.value)} /></label>
              {type !== 'CHEQUE' ? <label className="form-control"><span>Documento</span><input className="input" value={component.documento_referencia} onChange={(e) => updateComponent(index, 'documento_referencia', e.target.value)} /></label> : null}
              {temRateioIntercompany ? <label className="form-control xl:col-span-2"><span>Natureza entre empresas *</span><select className="select" value={component.natureza_intercompany_baixa} onChange={(e) => updateComponent(index, 'natureza_intercompany_baixa', e.target.value)}>{NATUREZAS_INTERCOMPANY.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label> : null}
            </div>{type === 'CHEQUE' && !component.cheque_terceiro_id ? <ChequePagamentoFields className="mt-4" compact value={component} onChange={(field, value) => updateComponent(index, field, value)} title={isReceivable ? 'Dados do cheque recebido' : 'Dados do cheque usado no pagamento'} description={isReceivable ? 'Informe o cheque entregue pelo cliente. Um único cheque desta fonte pode quitar mais de um título, respeitando a ordem de vencimento.' : 'Informe o cheque emitido pela empresa desta fonte. Os dados ficam individualizados neste componente da baixa.'} /> : null}<div className="mt-4">
              <TabelaPadrao
                colunas={[
                  {
                    id: 'titulo',
                    titulo: 'Título',
                    // R17: o código do título NOMEIA o registro rateado.
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (titulo) => (
                      <div>
                        <strong>{titulo.codigo}</strong>
                        <small className="block text-[var(--c-muted)]">{titulo.descricao}</small>
                      </div>
                    )
                  },
                  {
                    id: 'vencimento',
                    titulo: 'Vencimento',
                    tipo: 'data',
                    render: (titulo) => String(titulo.data_vencimento || '').split('-').reverse().join('/')
                  },
                  {
                    id: 'saldo',
                    titulo: 'Saldo',
                    tipo: 'valor',
                    render: (titulo) => money(titulo.valor_saldo)
                  },
                  {
                    id: 'valor_fonte',
                    sempreVisivel: true,
                    titulo: 'Valor nesta fonte',
                    tipo: 'valor',
                    render: (titulo) => (
                      <input
                        aria-label={`Valor de ${titulo.codigo || titulo.id} na fonte ${index + 1}`}
                        className="input input-sm text-right"
                        type="number"
                        min="0"
                        step="0.01"
                        value={component.alocacoes?.[titulo.id] || ''}
                        onChange={(e) => updateAllocation(index, titulo.id, e.target.value)}
                      />
                    )
                  }
                ]}
                itens={orderedTitles}
                chaveWorkspace={`fontes:alocacoes:${index}`}
                consultaWorkspace={orderedTitles.map(titulo => titulo.id)}
                storageKey="tabela:baixa-composta:alocacoes"
                rotuloRolagem={`Rateio da fonte ${index + 1}`}
                vazio="Nenhum título selecionado."
              />
              {/* Total do <tfoot> antigo: TabelaPadrao não tem rodapé — vira
                  resumo apartado abaixo da tabela, mesma conta e mesma cor. */}
              <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border px-3 py-2" style={{ borderColor: 'var(--ui-border)', background: 'var(--ui-canvas)' }}>
                <span className="text-sm font-semibold text-[var(--c-text)]">Distribuído na fonte</span>
                <strong className={Math.abs(round(componentAllocated) - round(component.valor)) < 0.01 ? 'text-[var(--status-approved-text)]' : 'text-[var(--status-rejected-text)]'}>{money(componentAllocated)} / {money(component.valor)}</strong>
              </div>
            </div></section>;
          })}</div>
          <button type="button" className="btn btn-outline mt-3" onClick={() => { setComponents((rows) => [...rows, newComponent(formas, orderedTitles[0]?.empresa_id || '')]); setPreview(null); }}><HiOutlinePlus /> Adicionar fonte</button>

          {preview ? <div className="finance-operation-notice finance-operation-notice--success mt-5 p-4"><strong>Validação concluída.</strong> {preview.componentes?.length || 0} fonte(s), {preview.titulos?.length || 0} título(s), total principal {money(preview.valor_principal)}.</div> : null}
          </fieldset>
        </div>
        <footer className="modal-footer modal-footer--between"><span className="text-sm text-[var(--c-muted)]">Fontes: <strong className="text-[var(--c-text)]">{money(totalComponents)}</strong></span><div className="finance-operation-actions flex gap-2"><button type="button" className="btn btn-outline" disabled={saving} onClick={close}>Cancelar</button>{preview ? <button type="button" className="btn btn-primary" disabled={saving || blocked || !compatible} onClick={confirm}>Confirmar {operationName}</button> : <button type="button" className="btn btn-primary" disabled={saving || blocked || !compatible} onClick={review}>Validar e revisar</button>}</div></footer>
      </section>
    </div>
  );
  return contextoFila ? <ModalPortal onClose={close} closeOnEscape={!saving}>{conteudo}</ModalPortal> : conteudo;
}
