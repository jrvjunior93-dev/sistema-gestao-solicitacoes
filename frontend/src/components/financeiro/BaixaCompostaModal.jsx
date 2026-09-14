import { useState } from 'react';
import { HiOutlinePlus, HiOutlineTrash, HiOutlineXMark } from 'react-icons/hi2';
import { confirmarBaixaFinanceiraComposta, previewBaixaFinanceiraComposta } from '../../services/financeiro';
import { TabelaPadrao } from '../padrao';
import ChequePagamentoFields from './ChequePagamentoFields';
import DateInputBR from '../DateInputBR';

function round(value) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100; }
function money(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function today() { return new Date().toISOString().slice(0, 10); }

const NATUREZAS_INTERCOMPANY = [
  { value: 'OPERACIONAL_TERCEIRO', label: 'Pagamento operacional por outra empresa' },
  { value: 'TRANSFERENCIA_INTERNA', label: 'Cobertura/transferência interna' },
  { value: 'REEMBOLSO_COMPENSACAO', label: 'Reembolso ou compensação' }
];

function operationalType(forma) {
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
    natureza_intercompany_baixa: 'OPERACIONAL_TERCEIRO', motivo_intercompany: '', alocacoes: {}
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

export default function BaixaCompostaModal({
  titulos = [], formas = [], contas = [], cartoes = [], cheques = [], onClose, onConfirmed
}) {
  const [dataMovimento, setDataMovimento] = useState(today());
  const [observacoes, setObservacoes] = useState('');
  const [components, setComponents] = useState(() => [newComponent(formas, titulos[0]?.empresa_id || '')]);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const empresaId = Number(titulos[0]?.empresa_id || 0);
  const parceiroId = Number(titulos[0]?.parceiro_id || 0);
  const compatible = titulos.length > 0 && titulos.every((item) => Number(item.parceiro_id) === parceiroId);
  const totalSaldo = titulos.reduce((sum, item) => sum + Number(item.valor_saldo || 0), 0);
  const totalComponents = components.reduce((sum, item) => sum + Number(item.valor || 0), 0);

  function allocatedBefore(componentIndex) {
    const totals = {};
    components.slice(0, componentIndex).forEach((component) => {
      Object.entries(component.alocacoes || {}).forEach(([titleId, value]) => {
        totals[titleId] = round((totals[titleId] || 0) + Number(value || 0));
      });
    });
    return totals;
  }

  function updateComponent(index, field, value) {
    setPreview(null);
    setComponents((current) => current.map((component, rowIndex) => {
      if (rowIndex !== index) return component;
      const next = { ...component, [field]: value };
      if (field === 'valor') next.alocacoes = distribute(value, titulos, allocatedBefore(index));
      if (field === 'forma_pagamento_id') {
        next.conta_bancaria_id = ''; next.cartao_id = ''; next.cheque_terceiro_id = '';
      }
      if (field === 'conta_bancaria_id') {
        const conta = contas.find((item) => Number(item.id) === Number(value));
        next.empresa_id = String(conta?.empresa_id || titulos[0]?.empresa_id || '');
      }
      if (field === 'cartao_id') {
        const cartao = cartoes.find((item) => Number(item.id) === Number(value));
        const contaCartao = contas.find((item) => Number(item.id) === Number(cartao?.conta_bancaria_id));
        if (contaCartao?.empresa_id) next.empresa_id = String(contaCartao.empresa_id);
      }
      if (field === 'cheque_terceiro_id') {
        const cheque = cheques.find((item) => Number(item.id) === Number(value));
        if (cheque) {
          next.empresa_id = String(cheque.empresa_id || '');
          next.valor = Number(cheque.valor);
          next.alocacoes = distribute(cheque.valor, titulos, allocatedBefore(index));
          next.cheque_numero = ''; next.cheque_emitente = ''; next.titular_documento = '';
          next.cheque_banco = ''; next.cheque_agencia = ''; next.cheque_conta = '';
          next.data_emissao = ''; next.data_vencimento = '';
        }
      }
      return next;
    }));
  }

  function updateAllocation(componentIndex, titleId, value) {
    setPreview(null);
    setComponents((current) => current.map((component, index) => index === componentIndex
      ? { ...component, alocacoes: { ...component.alocacoes, [titleId]: value } }
      : component));
  }

  function buildPayload() {
    const componentes = components.map(({ alocacoes, ...component }) => ({
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
    return { empresa_id: empresaId, data_movimento: dataMovimento, observacoes, componentes, alocacoes };
  }

  function validateCashSources() {
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
    if (!validateCashSources()) return;
    setSaving(true); setError('');
    try { setPreview(await previewBaixaFinanceiraComposta(buildPayload())); }
    catch (err) { setError(err.message || 'Revise as fontes e os rateios.'); }
    finally { setSaving(false); }
  }

  async function confirm() {
    if (!validateCashSources()) return;
    setSaving(true); setError('');
    try {
      const result = await confirmarBaixaFinanceiraComposta(buildPayload(), crypto.randomUUID());
      await onConfirmed?.(result); onClose();
    } catch (err) { setError(err.message || 'Erro ao confirmar baixa composta.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay finance-operation-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="baixa-multiplas-fontes-titulo">
      <section className="modal-dialog finance-operation-modal finance-operation-modal--wide">
        <header className="modal-header">
          <div><h2 id="baixa-multiplas-fontes-titulo" className="modal-title">Baixa com múltiplas fontes</h2><p className="modal-subtitle">Uma operação atômica para combinar PIX, contas, cartões, dinheiro e cheques de terceiros.</p></div>
          <button className="modal-close-btn" type="button" onClick={onClose} aria-label="Fechar baixa com múltiplas fontes"><HiOutlineXMark className="h-5 w-5" /></button>
        </header>
        <div className="modal-body min-h-0 flex-1 overflow-y-auto">
          {!compatible ? <div className="finance-operation-notice finance-operation-notice--warning mb-4">Selecione somente contas a pagar do mesmo credor.</div> : null}
          {compatible && new Set(titulos.map((item) => Number(item.empresa_id))).size > 1 ? <div className="finance-operation-notice finance-operation-notice--info mb-4">Os títulos pertencem a empresas diferentes. Cada fonte será movimentada na sua empresa e os rateios entre empresas serão registrados individualmente para conciliação.</div> : null}
          {error ? <div className="finance-operation-notice finance-operation-notice--danger mb-4">{error}</div> : null}
          <div className="mb-4 grid gap-3 md:grid-cols-[220px_1fr_auto]">
            <label className="form-control"><span>Data do pagamento</span><DateInputBR className="input" value={dataMovimento} onChange={(e) => { setDataMovimento(e.target.value); setPreview(null); }} /></label>
            <label className="form-control"><span>Observações do grupo</span><input className="input" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Ex.: Pagamento combinado acordado com o credor" /></label>
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
              const titulo = titulos.find((item) => Number(item.id) === Number(tituloId));
              return Number(value) > 0 && Number(titulo?.empresa_id) !== Number(component.empresa_id);
            });
            const componentAllocated = Object.values(component.alocacoes || {}).reduce((sum, value) => sum + Number(value || 0), 0);
            return <section key={index} className="finance-operation-panel p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-[var(--c-text)]">Fonte {index + 1}</h3>{components.length > 1 ? <button type="button" className="btn btn-outline btn-sm text-[var(--status-rejected-text)]" onClick={() => { setComponents((rows) => rows.filter((_, rowIndex) => rowIndex !== index)); setPreview(null); }}><HiOutlineTrash /></button> : null}</div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="form-control"><span>Forma *</span><select className="select" value={component.forma_pagamento_id} onChange={(e) => updateComponent(index, 'forma_pagamento_id', e.target.value)}><option value="">Selecione</option>{formas.filter((item) => item.ativo !== false && !item.gera_fatura).map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
              {type === 'CHEQUE' ? <label className="form-control"><span>Cheque de terceiro em carteira</span><select className="select" value={component.cheque_terceiro_id} onChange={(e) => updateComponent(index, 'cheque_terceiro_id', e.target.value)}><option value="">Selecione um cheque cadastrado</option>{chequesDisponiveis.map((item) => <option key={item.id} value={item.id}>{item.codigo} · Nº {item.numero_cheque} · {money(item.valor)}{item.empresa?.nome ? ` · ${item.empresa.nome}` : ''}</option>)}</select>{!component.cheque_terceiro_id ? <small className="mt-1 text-xs text-[var(--c-muted)]">Sem seleção, informe a conta e o número do cheque emitido.</small> : null}</label> : null}
              {!['PERMUTA', 'OUTROS'].includes(type) && !(type === 'CHEQUE' && component.cheque_terceiro_id) ? <label className="form-control"><span>{type === 'DINHEIRO' ? 'Caixa físico *' : 'Conta financeira *'}</span><select className="select" value={component.conta_bancaria_id} onChange={(e) => updateComponent(index, 'conta_bancaria_id', e.target.value)}><option value="">{type === 'DINHEIRO' ? 'Selecione o caixa físico' : 'Selecione uma conta'}</option>{contasCompativeis.map((item) => <option key={item.id} value={item.id}>{item.nome || item.banco_nome || `Conta #${item.id}`}{item.empresa?.nome ? ` · ${item.empresa.nome}` : ''}</option>)}</select>{type === 'DINHEIRO' ? <small className="mt-1 text-xs text-[var(--c-muted)]">O caixa deve estar aberto e abranger a data do pagamento.{contasCompativeis.length === 0 ? ' Nenhum caixa físico ativo foi encontrado.' : ''}</small> : null}</label> : null}
              {type === 'CARTAO' ? <label className="form-control"><span>Cartão *</span><select className="select" value={component.cartao_id} onChange={(e) => updateComponent(index, 'cartao_id', e.target.value)}><option value="">Selecione</option>{cartoesDisponiveis.map((item) => <option key={item.id} value={item.id}>{item.nome || item.descricao || `Cartão #${item.id}`}</option>)}</select></label> : null}
              <label className="form-control"><span>Valor da fonte *</span><input className="input" type="number" min="0.01" step="0.01" value={component.valor} readOnly={Boolean(component.cheque_terceiro_id)} onChange={(e) => updateComponent(index, 'valor', e.target.value)} /></label>
              {type !== 'CHEQUE' ? <label className="form-control"><span>Documento</span><input className="input" value={component.documento_referencia} onChange={(e) => updateComponent(index, 'documento_referencia', e.target.value)} /></label> : null}
              {temRateioIntercompany ? <label className="form-control xl:col-span-2"><span>Natureza entre empresas *</span><select className="select" value={component.natureza_intercompany_baixa} onChange={(e) => updateComponent(index, 'natureza_intercompany_baixa', e.target.value)}>{NATUREZAS_INTERCOMPANY.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label> : null}
            </div>{type === 'CHEQUE' && !component.cheque_terceiro_id ? <ChequePagamentoFields className="mt-4" compact value={component} onChange={(field, value) => updateComponent(index, field, value)} description="Informe o cheque emitido pela empresa desta fonte. Os dados ficam individualizados neste componente da baixa." /> : null}<div className="mt-4">
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
                itens={titulos}
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
          <button type="button" className="btn btn-outline mt-3" onClick={() => { setComponents((rows) => [...rows, newComponent(formas, titulos[0]?.empresa_id || '')]); setPreview(null); }}><HiOutlinePlus /> Adicionar fonte</button>

          {preview ? <div className="finance-operation-notice finance-operation-notice--success mt-5 p-4"><strong>Validação concluída.</strong> {preview.componentes?.length || 0} fonte(s), {preview.titulos?.length || 0} título(s), total principal {money(preview.valor_principal)}.</div> : null}
        </div>
        <footer className="modal-footer modal-footer--between"><span className="text-sm text-[var(--c-muted)]">Fontes: <strong className="text-[var(--c-text)]">{money(totalComponents)}</strong></span><div className="finance-operation-actions flex gap-2"><button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button>{preview ? <button type="button" className="btn btn-primary" disabled={saving || !compatible} onClick={confirm}>Confirmar baixa atômica</button> : <button type="button" className="btn btn-primary" disabled={saving || !compatible} onClick={review}>Validar e revisar</button>}</div></footer>
      </section>
    </div>
  );
}
