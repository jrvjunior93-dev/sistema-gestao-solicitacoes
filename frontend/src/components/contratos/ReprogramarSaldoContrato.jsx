import { useEffect, useRef, useState } from 'react';
import { getSaldoReprogramacaoContrato, reprogramarSaldoContrato, getContratoParcelas } from '../../services/contratos';
import DateInputBR from '../DateInputBR';
import { paraCentavosContrato } from './BlocoContratoFluxoNovo';
import { formatCurrencyInput, parseCurrencyInput } from '../../utils/formatters';

const moeda = valor => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const centavos = valor => paraCentavosContrato(parseCurrencyInput(valor));

export default function ReprogramarSaldoContrato({ contratoId, onConcluido }) {
  const [saldo, setSaldo] = useState(null);
  const [aberto, setAberto] = useState(false);
  const [linhas, setLinhas] = useState([]);
  const [justificativa, setJustificativa] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);
  const enviando = useRef(false);
  const vivo = useRef(true);
  const concluido = useRef(false);
  useEffect(() => {
    vivo.current = true;
    getSaldoReprogramacaoContrato(contratoId).then(r => { if (vivo.current) setSaldo(r); })
      .catch(() => { if (vivo.current) setSaldo(null); });
    return () => { vivo.current = false; };
  }, [contratoId]);

  function quantidade(valor) {
    const n = Number(valor);
    if (!Number.isInteger(n) || n < 1 || n > saldo.maximo_parcelas) return;
    const total = paraCentavosContrato(saldo.saldo_disponivel);
    const base = Math.floor(total / n);
    setLinhas(atual => Array.from({ length: n }, (_, i) => ({
      valor: ((base + (i === n - 1 ? total - base * n : 0)) / 100).toFixed(2).replace('.', ','),
      vencimento: atual[i]?.vencimento || ''
    })));
  }
  const alterar = (i, campo, valor) => setLinhas(atual => atual.map((l, p) => p === i ? { ...l, [campo]: valor } : l));
  const soma = linhas.reduce((s, l) => s + (centavos(l.valor) || 0), 0);
  const restante = saldo ? paraCentavosContrato(saldo.saldo_disponivel) - soma : 0;
  const valido = Boolean(saldo && linhas.length && justificativa.trim()
    && linhas.every(l => centavos(l.valor) > 0 && l.vencimento)
    && Number.isSafeInteger(soma) && restante >= 0);

  async function confirmar() {
    if (enviando.current || !valido) return;
    enviando.current = true; setSalvando(true); setErro('');
    try {
      // Se a gravacao foi concluida e apenas o reload falhou, tentar novamente
      // recarrega a tela: nao cria um segundo cronograma.
      if (!concluido.current) {
        await reprogramarSaldoContrato(contratoId, {
          referencia: saldo.referencia, justificativa: justificativa.trim(),
          parcelas: linhas.map(l => ({ valor: centavos(l.valor) / 100, vencimento: l.vencimento }))
        });
        concluido.current = true;
      }
      const [dados, novoSaldo] = await Promise.all([
        getContratoParcelas(contratoId), getSaldoReprogramacaoContrato(contratoId)
      ]);
      if (vivo.current) {
        onConcluido(dados); setAberto(false); setSaldo(novoSaldo);
        setLinhas([]); setJustificativa(''); concluido.current = false;
        setAviso('Parcelas de previsão criadas. Selecione a nova parcela para solicitar a medição; pagamentos anteriores não foram alterados.');
      }
    } catch (e) {
      if (vivo.current) setErro(concluido.current
        ? 'Parcelas criadas, mas a consulta falhou. Clique novamente para recarregar, sem repetir a criação.'
        : e.message || 'Não foi possível reprogramar.');
    } finally {
      enviando.current = false;
      if (vivo.current) setSalvando(false);
    }
  }

  if (!saldo?.pode_reprogramar && !aviso) return null;
  return <section aria-label="Reprogramar saldo remanescente" className="space-y-3 border-y border-[var(--c-border)] py-3"
    onKeyDown={e => { if (e.key === 'Enter' && !['BUTTON', 'TEXTAREA'].includes(e.target.tagName)) e.preventDefault(); }}>
    {aviso && <p role="status" className="form-hint">{aviso}</p>}
    {!aberto && saldo?.pode_reprogramar && <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm">Saldo sem parcela para medir: <strong>{moeda(saldo.saldo_disponivel)}</strong></span>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => { if (!concluido.current) quantidade(1); setAberto(true); setErro(''); }}>Reprogramar saldo</button>
    </div>}
    {aberto && <div className="space-y-3">
      <p className="form-hint">Distribua até {moeda(saldo.saldo_disponivel)} em novas parcelas de previsão. O restante fica disponível para futuras reprogramações. O valor do contrato, as medições e as baixas anteriores permanecem intactos.</p>
      <label className="grid gap-1 text-sm max-w-xs">Quantidade de novas parcelas
        <input type="number" min="1" max={saldo.maximo_parcelas} className="input input-sm" value={linhas.length} disabled={salvando || concluido.current} onChange={e => quantidade(e.target.value)} />
      </label>
      {linhas.map((l, i) => <div key={i} className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
        <label className="grid min-w-0 gap-1 text-sm">Valor da nova parcela {i + 1}
          <input className="input input-sm min-w-0" inputMode="decimal" value={l.valor} disabled={salvando || concluido.current}
            onChange={e => alterar(i, 'valor', e.target.value)} onBlur={e => alterar(i, 'valor', formatCurrencyInput(e.target.value))} />
        </label>
        <label className="grid min-w-0 gap-1 text-sm">Vencimento da nova parcela {i + 1}
          <DateInputBR className="input input-sm min-w-0" value={l.vencimento} disabled={salvando || concluido.current} onChange={e => alterar(i, 'vencimento', e.target.value)} />
        </label>
      </div>)}
      <p className="form-hint" aria-live="polite">Total: {moeda(soma / 100)} · {restante >= 0
        ? `Saldo para futuras reprogramações: ${moeda(restante / 100)}`
        : `Excede o saldo disponível em ${moeda(-restante / 100)}`}</p>
      <label className="grid gap-1 text-sm">Justificativa da reprogramação
        <textarea className="input" maxLength={2000} value={justificativa} disabled={salvando || concluido.current} onChange={e => setJustificativa(e.target.value)} />
      </label>
      {erro && <p role="alert" className="app-alert app-alert--error">{erro}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary btn-sm" disabled={salvando || !valido} onClick={confirmar}>{salvando ? 'Processando…' : concluido.current ? 'Recarregar parcelas' : 'Confirmar novas parcelas'}</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={salvando} onClick={() => setAberto(false)}>Fechar</button>
      </div>
    </div>}
  </section>;
}
