import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import OverlayModal from '../ui/OverlayModal';
import DateInputBR from '../DateInputBR';
import { confirmarNegociacaoTitulos, previewNegociacaoTitulos } from '../../services/financeiro';

const moeda = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const decimal = value => String(value || '0').trim().replace(',', '.');
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export function podeNegociarTitulos(titulos, minimo = 1) {
  const primeiro = titulos[0];
  return titulos.length >= minimo && titulos.length <= 100 && titulos.every(t =>
    ['ABERTO', 'PARCIAL'].includes(t.status) && Number(t.valor_saldo) > 0
    && !t.renegociacao_id && !t.renegociado_por_id
    && t.parceiro_id && t.empresa_id
    && ['tipo', 'empresa_id', 'parceiro_id'].every(k => String(t[k]) === String(primeiro[k])));
}

export default function TituloNegociacaoModal({ titulos, onClose, onConfirmed }) {
  const [form, setForm] = useState({ motivo: '', quantidade: 2, primeiro: hoje(),
    jurosTipo: 'VALOR', juros: '0.00', multaTipo: 'VALOR', multa: '0.00' });
  const [parcelasEditadas, setParcelasEditadas] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [ultimaPrevia, setUltimaPrevia] = useState(null);
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState(null);
  const travado = useRef(false);
  const envio = useRef(null);

  function invalidar() { setPrevia(null); setAceite(false); setErro(''); }
  function alterar(campo, valor) {
    setForm(atual => ({ ...atual, [campo]: valor }));
    setParcelasEditadas(null); setUltimaPrevia(null); invalidar();
  }
  function editarParcela(index, campo, valor) {
    const parcelas = (parcelasEditadas || ultimaPrevia.parcelas).map(p => ({ vencimento: p.vencimento, valor: p.valor }));
    parcelas[index][campo] = valor;
    setParcelasEditadas(parcelas); invalidar();
  }
  async function preparar() {
    if (travado.current) return;
    travado.current = true; setBusy(true); setErro('');
    try {
      const payload = { titulo_ids: titulos.map(t => Number(t.id)), motivo: form.motivo,
        quantidade_parcelas: Number(form.quantidade), primeiro_vencimento: form.primeiro,
        juros: { tipo: form.jurosTipo, valor: decimal(form.juros) },
        multa: { tipo: form.multaTipo, valor: decimal(form.multa) },
        ...(parcelasEditadas ? { parcelas: parcelasEditadas.map(p => ({ vencimento: p.vencimento, valor: decimal(p.valor) })) } : {}) };
      const res = await previewNegociacaoTitulos(payload);
      envio.current = { payload: { ...payload, preview_hash: res.preview_hash }, chave: crypto.randomUUID() };
      setPrevia(res); setUltimaPrevia(res); setParcelasEditadas(null); setAceite(false);
    } catch (error) { setErro(error.message); setPrevia(null); }
    finally { travado.current = false; setBusy(false); }
  }
  async function confirmar() {
    if (travado.current || !previa || !aceite) return;
    travado.current = true; setBusy(true); setErro('');
    try {
      // A mesma chave é mantida em caso de timeout ou nova tentativa.
      const res = await confirmarNegociacaoTitulos(envio.current.payload, envio.current.chave);
      setResultado(res); onConfirmed?.(res);
    } catch (error) { setErro(error.message); }
    finally { travado.current = false; setBusy(false); }
  }
  const parcelas = parcelasEditadas || ultimaPrevia?.parcelas || [];
  return <OverlayModal rotulo={titulos.length === 1 ? 'Parcelar título' : 'Negociar títulos'} largura="960px"
    onFechar={busy ? undefined : onClose} fecharComEscape={!busy}>
    <header data-modal="cabecalho" className="flex items-center justify-between gap-3 border-b border-[var(--c-border)] p-4">
      <h2 className="text-base font-semibold">{titulos.length === 1 ? 'Parcelar título' : `Negociar ${titulos.length} títulos`}</h2>
      <button className="btn btn-outline btn-sm" type="button" disabled={busy} onClick={onClose}>Fechar</button>
    </header>
    <div className="space-y-4 p-4 text-sm">
      {erro && <div role="alert" className="app-alert app-alert--error">{erro}</div>}
      {resultado ? <>
        <div role="status" className="app-alert app-alert--success">Negociação #{resultado.id} confirmada. Os títulos originais foram preservados, sem baixa ou movimento bancário.</div>
        <ul className="space-y-2">{resultado.titulos.map(t => <li key={t.id}>
          <Link className="text-[var(--c-primary)] underline" to={`/financeiro/titulos/${t.id}`}>{t.codigo || `Título #${t.id}`}</Link>
          {' — '}{moeda(t.valor)} · {t.vencimento.split('-').reverse().join('/')}
        </li>)}</ul>
      </> : <>
        <p className="text-[var(--c-muted)]">Somente o saldo pendente será negociado. Baixas anteriores e vínculos com obras, pedidos e contratos são preservados. Não há movimentação bancária nesta operação.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm"><thead><tr className="border-b border-[var(--c-border)]">
            <th className="p-2">Título</th><th className="p-2">Parceiro</th><th className="p-2 text-right">Já baixado</th><th className="p-2 text-right">Saldo a negociar</th>
          </tr></thead><tbody>{titulos.map(t => <tr key={t.id} className="border-b border-[var(--c-border)]">
            <td className="p-2 whitespace-nowrap">{t.codigo || `#${t.id}`}</td><td className="p-2">{t.parceiro?.nome || `Parceiro #${t.parceiro_id}`}</td>
            <td className="p-2 text-right whitespace-nowrap">{moeda(t.valor_baixado)}</td><td className="p-2 text-right whitespace-nowrap">{moeda(t.valor_saldo)}</td>
          </tr>)}</tbody></table>
        </div>
        <fieldset disabled={busy} className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">Motivo da negociação
            <input autoFocus className="input mt-1 w-full" maxLength={1000} value={form.motivo} onChange={e => alterar('motivo', e.target.value)} />
          </label>
          <label>Quantidade de parcelas<input className="input mt-1 w-full" type="number" min="1" max="120" value={form.quantidade} onChange={e => alterar('quantidade', e.target.value)} /></label>
          <label>Primeiro vencimento<DateInputBR className="input mt-1 w-full" min={hoje()} value={form.primeiro} onChange={e => alterar('primeiro', e.target.value)} /></label>
          {['juros', 'multa'].map(campo => <div key={campo} className="grid min-w-0 grid-cols-2 gap-2">
            <label>{campo === 'juros' ? 'Juros' : 'Multa'}<select className="input mt-1 w-full" value={form[`${campo}Tipo`]} onChange={e => alterar(`${campo}Tipo`, e.target.value)}>
              <option value="VALOR">Valor em R$</option><option value="PERCENTUAL">Percentual (%)</option>
            </select></label>
            <label>Valor {form[`${campo}Tipo`] === 'PERCENTUAL' ? '(%)' : '(R$)'}<input className="input mt-1 w-full" inputMode="decimal" value={form[campo]} onChange={e => alterar(campo, e.target.value)} /></label>
          </div>)}
        </fieldset>
        <p className="text-xs text-[var(--c-muted)]">Juros e multa são aplicados uma única vez sobre o saldo selecionado, não por mês. O calendário sugerido é mensal; você pode ajustar cada parcela na prévia.</p>
        {ultimaPrevia && <>
          <p className="border-y border-[var(--c-border)] py-3">Saldo: <strong>{moeda(ultimaPrevia.principal)}</strong> + juros: {moeda(ultimaPrevia.juros)} + multa: {moeda(ultimaPrevia.multa)} = <strong>{moeda(ultimaPrevia.total)}</strong></p>
          {!previa && <p role="status" className="text-[var(--sem-warning)]">Parcelas alteradas. Valide novamente a prévia antes de confirmar.</p>}
          <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="p-2">Parcela</th><th className="p-2">Vencimento</th><th className="p-2">Valor (R$)</th><th className="p-2">Origem / rateio</th></tr></thead>
            <tbody>{parcelas.map((p, i) => <tr key={i} className="border-t border-[var(--c-border)]">
              <td className="p-2">{i + 1}/{parcelas.length}</td>
              <td className="p-2"><DateInputBR aria-label={`Vencimento da parcela ${i + 1}`} className="input min-w-[140px]" min={hoje()} disabled={busy} value={p.vencimento} onChange={e => editarParcela(i, 'vencimento', e.target.value)} /></td>
              <td className="p-2"><input aria-label={`Valor da parcela ${i + 1}`} className="input w-32" inputMode="decimal" disabled={busy} value={p.valor} onChange={e => editarParcela(i, 'valor', e.target.value)} /></td>
              <td className="p-2"><details><summary className="cursor-pointer whitespace-nowrap">Ver distribuição</summary>
                {ultimaPrevia.parcelas[i]?.rateios?.map((r, j) => <p className="mt-1 text-xs" key={j}>Título #{r.titulo_origem_id} · obra #{r.obra_id}: {previa ? moeda(r.valor) : 'recalcular'}</p>)}
              </details></td>
            </tr>)}</tbody></table></div>
        </>}
        {previa && <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={aceite} disabled={busy} onChange={e => setAceite(e.target.checked)} />
          Conferi os valores e vencimentos. Confirmo a substituição dos saldos originais pelas novas parcelas.</label>}
      </>}
    </div>
    <footer data-modal="rodape" className="flex flex-wrap justify-end gap-2 border-t border-[var(--c-border)] p-4">
      {resultado ? <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>Concluir</button> : <>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy || form.motivo.trim().length < 3} onClick={preparar}>{busy ? 'Processando…' : 'Validar prévia'}</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !previa || !aceite} onClick={confirmar}>Confirmar negociação</button>
      </>}
    </footer>
  </OverlayModal>;
}
