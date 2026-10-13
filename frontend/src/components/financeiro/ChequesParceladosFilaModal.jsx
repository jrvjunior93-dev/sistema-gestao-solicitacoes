import OverlayModal from '../ui/OverlayModal';
import ChequePagamentoFields from './ChequePagamentoFields';
import { Link } from 'react-router-dom';
import { useRef, useState } from 'react';

const origemCheque = item => item.origem_cheque ||
  (item.usar_cheque_terceiro || item.cheque_terceiro_id ? 'CARTEIRA' : item.cheque_numero ? 'PROPRIO' : '');

export default function ChequesParceladosFilaModal({ label, parcelas, onChange, onFechar, onConfirmar,
  total, conta, cheques, conflito, podeCadastrar, accounts, onContaChange }) {
  const [erro, setErro] = useState('');
  const [quantidade, setQuantidade] = useState(String(parcelas.length));
  // Digitar "12" pode passar por "1". Guardar as linhas ocultadas evita perder
  // cheques preenchidos nesse estado intermediario; so as visiveis sao enviadas.
  const reservaParcelas = useRef([...parcelas]);
  const soma = parcelas.reduce((sum, item) => sum + Math.round(Number(item.valor_pago || 0) * 100), 0);
  const compartilhado = Boolean(accounts);
  const temProprio = parcelas.some(item => origemCheque(item) === 'PROPRIO');
  // Somente empresas ja presentes nas contas/cheques acessiveis nesta fila.
  const empresas = [...new Map([...(accounts || []).filter(item => item.ativo !== false && item.empresa_id).map(item =>
    [Number(item.empresa_id), { id: item.empresa_id, nome: item.empresa?.nome || `Empresa #${item.empresa_id}` }]),
    ...cheques.filter(item => item.empresa_id && item.empresa?.ativo !== false).map(item =>
      [Number(item.empresa_id), { id: item.empresa_id, nome: item.empresa?.nome || `Empresa #${item.empresa_id}` }])]).values()];
  const money = valor => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  function alterar(index, patch) { onChange(parcelas.map((item, i) => i === index ? { ...item, ...patch } : item)); }
  function definirQuantidade(value) {
    setQuantidade(value);
    if (value === '') { setErro(''); return; }
    const count = Number(value);
    if (!Number.isInteger(count) || count < 1 || count > 60) { setErro('Informe de 1 a 60 cheques por pagamento.'); return; }
    parcelas.forEach((item, index) => { reservaParcelas.current[index] = item; });
    const next = Array.from({ length: count }, (_, index) => reservaParcelas.current[index] || { valor_pago: '', origem_cheque: '', usar_cheque_terceiro: false });
    next.forEach((item, index) => { reservaParcelas.current[index] = item; });
    onChange(next);
    setErro('');
  }
  function confirmar(event) {
    event.preventDefault();
    event.stopPropagation();
    if (conflito) return;
    if (compartilhado && temProprio && !conta?.empresa_id) { setErro('Selecione a conta pagadora dos cheques próprios do lote.'); return; }
    if (Number(quantidade) !== parcelas.length || !Number.isInteger(Number(quantidade)) || Number(quantidade) < 1 || Number(quantidade) > 60) {
      setErro('Informe de 1 a 60 cheques por pagamento.'); return;
    }
    if (soma !== Math.round(Number(total) * 100) || parcelas.some(item => !(Number(item.valor_pago) > 0))) {
      setErro('A soma dos cheques deve ser igual ao total deste pagamento.'); return;
    }
    if (parcelas.some(item => !origemCheque(item))) { setErro('Selecione a origem de cada cheque.'); return; }
    if (compartilhado && parcelas.some(item => item.usar_cheque_terceiro &&
      (!cheques.some(row => Number(row.id) === Number(item.cheque_terceiro_id)) ||
      (!cheques.find(row => Number(row.id) === Number(item.cheque_terceiro_id))?.empresa_id && !item.empresa_id)))) {
      setErro('Selecione o cheque da carteira e informe a empresa quando o cadastro não tiver empresa.'); return;
    }
    const ids = parcelas.filter(item => item.usar_cheque_terceiro).map(item => String(item.cheque_terceiro_id));
    if (new Set(ids).size !== ids.length) { setErro('Escolha cheques diferentes para cada parcela.'); return; }
    onConfirmar(parcelas);
  }
  return <OverlayModal rotulo={`Cheques do pagamento de ${label}`} largura="860px" onFechar={onFechar}>
    <header data-modal="cabecalho" className="flex justify-between items-center gap-3 border-b border-[var(--c-border)] p-4">
      <strong>Cheques · {label}</strong><button type="button" className="btn btn-outline btn-sm" onClick={onFechar}>Cancelar</button>
    </header>
    <form className="p-4 space-y-4" id={`parcelas-cheque-${label}`} onSubmit={confirmar}>
      <p className="text-sm">Valor pago: {money(total)} · Soma dos cheques: {money(soma / 100)}</p>
      {conflito && <p role="alert">O título mudou. Feche este modal e confira os dados atuais antes de confirmar.</p>}
      <fieldset disabled={conflito} className="space-y-4">
        {compartilhado && temProprio && <label className="block text-sm">Conta pagadora dos cheques próprios
          <select aria-label="Conta pagadora dos cheques" required className="input w-full" value={conta?.id || ''}
            onChange={event => { onContaChange(event.target.value); setErro(''); }}>
            <option value="">Selecione a conta</option>{accounts.filter(item => item.ativo !== false && item.empresa_id).map(item =>
              <option key={item.id} value={item.id}>{item.nome} · {item.empresa?.nome || `Empresa #${item.empresa_id}`}</option>)}
          </select>
        </label>}
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">Quantidade de cheques
            <input aria-label="Quantidade de cheques" aria-describedby={`quantidade-cheques-ajuda-${label}`} required className="input w-28 block" type="number" min="1" max="60" step="1"
              value={quantidade} onChange={event => definirQuantidade(event.target.value)} />
          </label>
        </div>
        <p id={`quantidade-cheques-ajuda-${label}`} className="text-xs text-[var(--c-muted)]">Os campos aparecem automaticamente. Ao reduzir a quantidade, os dados ocultados podem ser recuperados aumentando-a antes de fechar este modal.</p>
        {parcelas.map((item, index) => <section key={index} aria-label={`Dados do cheque ${index + 1}`} className="border-b border-[var(--c-border)] pb-4 space-y-3">
          <div className="flex justify-between items-center"><strong className="text-sm">Cheque {index + 1}</strong>
            <button type="button" className="btn btn-outline btn-sm" disabled={parcelas.length === 1}
              onClick={() => {
                const next = parcelas.filter((_, i) => i !== index);
                parcelas.forEach((item, i) => { reservaParcelas.current[i] = item; });
                reservaParcelas.current.splice(index, 1);
                setQuantidade(String(next.length)); setErro(''); onChange(next);
              }}>Remover cheque {index + 1}</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm">Valor do cheque {index + 1} (R$)
              <input required readOnly={Boolean(item.usar_cheque_terceiro)} className="input w-full text-right" type="number" min="0.01" step="0.01" value={item.valor_pago || ''}
                onChange={event => alterar(index, { valor_pago: event.target.value })} />
            </label>
            <label className="text-sm">Origem do cheque {index + 1}
              <select aria-label={`Origem do cheque ${index + 1}`} required className="input w-full" value={origemCheque(item)}
                onChange={event => onChange(parcelas.map((parcela, i) => i === index ? { valor_pago: parcela.valor_pago,
                  origem_cheque: event.target.value, usar_cheque_terceiro: event.target.value === 'CARTEIRA' } : parcela))}>
                <option value="">Selecione a origem</option>
                <option value="PROPRIO">Cheque próprio</option><option value="CARTEIRA">Cheque de terceiro — carteira</option>
              </select>
            </label>
          </div>
          {item.usar_cheque_terceiro ? <div className="space-y-2"><label className="block text-sm">Cheque da carteira {index + 1}
            <select aria-label={`Cheque da carteira ${index + 1}`} required className="input w-full" disabled={!compartilhado && !conta?.empresa_id} value={item.cheque_terceiro_id || ''}
              onChange={event => { const cheque = cheques.find(row => Number(row.id) === Number(event.target.value));
                alterar(index, { cheque_terceiro_id: event.target.value, valor_pago: cheque?.valor || '', empresa_id: '', data_vencimento: cheque?.data_vencimento || '' }); }}>
              <option value="">{compartilhado || conta?.empresa_id ? 'Selecione um cheque já cadastrado' : 'Selecione a conta pagadora primeiro'}</option>
              {cheques.filter(row => compartilhado || !row.empresa_id || Number(row.empresa_id) === Number(conta?.empresa_id)).map(row =>
                <option key={row.id} value={row.id} disabled={compartilhado && row.empresa?.ativo === false}>{row.codigo} · {row.numero_cheque} · {row.titular_nome} · {money(row.valor)}{compartilhado && row.empresa_id ? ` · ${row.empresa?.nome || `Empresa #${row.empresa_id}`}${row.empresa?.ativo === false ? ' (empresa inativa)' : ''}` : ''}</option>)}
            </select>
          </label>
            {compartilhado && item.cheque_terceiro_id && (() => {
              const cheque = cheques.find(row => Number(row.id) === Number(item.cheque_terceiro_id));
              return cheque?.empresa_id ? <p className="text-xs">Empresa da carteira: {cheque.empresa?.nome || `Empresa #${cheque.empresa_id}`}. Sem débito em conta bancária.</p>
                : <label className="block text-sm">Empresa responsável pelo cheque {index + 1}
                  <select aria-label={`Empresa responsável pelo cheque ${index + 1}`} required className="input w-full" value={item.empresa_id || ''}
                    onChange={event => alterar(index, { empresa_id: event.target.value })}>
                    <option value="">Cadastro legado sem empresa: selecione</option>
                    {empresas.map(empresa => <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>)}
                  </select>
                </label>;
            })()}
          </div> : origemCheque(item) === 'PROPRIO' && <ChequePagamentoFields compact value={item} onChange={(key, value) => alterar(index, { [key]: value })} />}
        </section>)}
      </fieldset>
      <p className="text-xs text-[var(--c-muted)]">Cheques de terceiros precisam estar cadastrados e disponíveis na carteira. O valor de cada um deve ser usado integralmente.
        {compartilhado && ' A empresa vem da carteira, sem selecionar conta bancária. Cheques próprios usam a conta pagadora informada.'}
        {podeCadastrar && <> <Link className="underline" to="/financeiro/cheques-terceiros" target="_blank" rel="noopener noreferrer">Abrir carteira para cadastrar</Link>.</>}
        {' '}Após cadastrar, feche este modal e atualize a fila para carregar o cheque.</p>
      {erro && <p role="alert" className="text-sm text-[var(--sem-danger)]">{erro}</p>}
    </form>
    <footer data-modal="rodape" className="flex justify-end gap-2 border-t border-[var(--c-border)] p-4">
      <button type="button" className="btn btn-outline btn-sm" onClick={onFechar}>Cancelar</button>
      <button type="submit" form={`parcelas-cheque-${label}`} className="btn btn-primary btn-sm" disabled={conflito}>Confirmar cheques</button>
    </footer>
  </OverlayModal>;
}
