import { useEffect, useRef, useState } from 'react';
import { getPagamentoMedicao, ajustarPagamentoMedicao } from '../../services/contratos';
import { useConfirmacao } from '../padrao';

const moeda = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export default function MedicaoValorPagamento({ contratoId, medicaoId, onMudou }) {
  const [dados, setDados] = useState(null), [erro, setErro] = useState(''), [aviso, setAviso] = useState('');
  const [form, setForm] = useState(null), [ocupado, setOcupado] = useState(false), [consulta, setConsulta] = useState(0);
  const mutex = useRef(null), geracao = useRef(0), chave = useRef(null);
  const registro = useRef(''); registro.current = `${contratoId}:${medicaoId}`;
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  useEffect(() => { setAviso(''); }, [contratoId, medicaoId]);
  useEffect(() => {
    const atual = ++geracao.current;
    setDados(null); setErro(''); setForm(null); setOcupado(false); mutex.current = null;
    getPagamentoMedicao(contratoId, medicaoId).then(r => { if (geracao.current === atual) setDados(r); })
      .catch(e => { if (geracao.current === atual) setErro(e.message); });
    return () => { geracao.current++; mutex.current = null; };
  }, [contratoId, medicaoId, consulta]);

  async function salvar(e) {
    e.preventDefault();
    if (mutex.current || !form || !dados?.pode_ajustar) return;
    const token = Symbol('ajuste'), atual = geracao.current;
    const alvo = { contratoId, medicaoId, titulo: form.titulo };
    const payload = { titulo_id: Number(alvo.titulo.id), acao: form.acao, revisao: alvo.titulo.revisao,
      valor_anterior: Number(alvo.titulo.valor).toFixed(2), motivo: form.motivo.trim(),
      ...(form.acao === 'REDUZIR' ? { valor_autorizado: form.valor, destino: form.destino,
        ...(alvo.titulo.fatura_cartao_id ? { desvincular_fatura: form.desvincular } : {}) } : {}) };
    const valor = Number(form.valor);
    if (!payload.motivo || payload.motivo.length > 2000) { setErro('Informe o motivo, com até 2000 caracteres.'); return; }
    if (form.acao === 'REDUZIR' && (!/^\d+(\.\d{1,2})?$/.test(form.valor) || valor <= 0 || valor >= Number(alvo.titulo.valor) || !form.destino)) {
      setErro('Informe um valor positivo menor que o atual e escolha o destino da diferença.'); return;
    }
    const assinatura = JSON.stringify(payload);
    if (chave.current?.assinatura !== assinatura) chave.current = { assinatura, id: crypto.randomUUID() };
    payload.idempotency_key = chave.current.id;
    mutex.current = token; setOcupado(true); setErro(''); setAviso('');
    try {
      const { ok } = await confirmar({ titulo: form.acao === 'REDUZIR' ? 'Ajustar valor para pagamento' : 'Liberar diferença futura',
        mensagem: `${alvo.titulo.codigo || alvo.titulo.id}: ${form.acao === 'REDUZIR'
          ? `${moeda(alvo.titulo.valor)} → ${moeda(valor)}. Diferença: ${form.destino === 'FUTURO' ? 'previsão para pagamento futuro' : 'abatimento definitivo'}.`
          : `${moeda(alvo.titulo.valor)} ficará disponível para novo envio.`} A medição não muda. Os dados enviados para autorização serão invalidados e a fila sem baixa encerrada. É necessário reenviar para autorização/pagamento pelas regras atuais.${form.desvincular ? ' A previsão de cartão será desvinculada se ainda não houver pagamento.' : ''}`,
        rotuloConfirmar: 'Confirmar ajuste', rotuloCancelar: 'Voltar' });
      if (!ok || geracao.current !== atual || mutex.current !== token) return;
      await ajustarPagamentoMedicao(alvo.contratoId, alvo.medicaoId, payload);
      if (geracao.current !== atual) return;
      setAviso('Ajuste salvo. Confira os boletos e reenvie o título para autorização/pagamento. A diferença em previsão exige liberação explícita.');
      setForm(null); setConsulta(v => v + 1);
      try { await onMudou?.(); } catch { if (registro.current === `${alvo.contratoId}:${alvo.medicaoId}`) setAviso('Ajuste salvo. Atualize o financeiro para conferir os valores e reenviar o título.'); }
    } catch (e) { if (geracao.current === atual) setErro(e.message); }
    finally { if (mutex.current === token) { mutex.current = null; setOcupado(false); } }
  }
  const linhas = dados?.titulos || [];
  const ativo = t => !['CANCELADO', 'EXCLUIDO', 'ESTORNADO'].includes(t.status);
  const liberado = linhas.filter(t => ativo(t) && !t.pendente).reduce((s, t) => s + t.valor, 0);
  const pendente = linhas.filter(t => t.pendente).reduce((s, t) => s + t.valor, 0);
  const abatimento = linhas.filter(ativo).reduce((s, t) => s + t.abatimento, 0);
  return <section className="mt-3 border-t border-[var(--c-border)] pt-3" aria-label="Valor medido e pagamento autorizado">
    <h3 className="text-sm font-semibold">Valor medido × valor para pagamento</h3>
    {erro && <p className="app-alert app-alert--error" role="alert">{erro} {!dados && <button type="button" className="btn btn-outline btn-sm" onClick={() => setConsulta(v => v + 1)}>Tentar novamente</button>}</p>}
    {aviso && <p className="app-alert app-alert--success" role="status">{aviso}</p>}
    {!dados && !erro && <p className="app-note">Consultando valores...</p>}
    {dados && <>
      <dl className="my-2 grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
        {[["Medido", dados.valor_medido], ["Valor dos títulos (sem previsão)", liberado], ["Diferença futura", pendente], ["Abatimento definitivo", abatimento]].map(([nome, valor]) => <div key={nome}><dt className="app-note">{nome}</dt><dd className="font-semibold">{moeda(valor)}</dd></div>)}
      </dl>
      <p className="app-note">O valor medido permanece intacto. Valor do título é o principal; baixa e aprovação do proprietário continuam no fluxo atual. Confira/reemita boletos após o ajuste.</p>
      <ul className="mt-2 divide-y divide-[var(--c-border)]">{linhas.map(t => <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <span>{t.codigo || `Título #${t.id}`} · {moeda(t.valor)} · {t.pendente ? 'Diferença pendente de autorização' : t.status}{t.baixado > 0 ? ` · pago ${moeda(t.baixado)}` : ''}</span>
        {dados.pode_ajustar && dados.aprovada && t.baixado === 0 && (t.status === 'ABERTO' || t.pendente) && <button type="button" className="btn btn-outline btn-sm" disabled={ocupado}
          onClick={() => { setErro(''); setForm({ titulo: t, acao: t.pendente ? 'LIBERAR_PENDENTE' : 'REDUZIR', valor: '', destino: '', motivo: '', desvincular: false }); }}>
          {t.pendente ? 'Liberar diferença futura' : 'Ajustar valor para pagamento'} · {t.codigo || t.id}
        </button>}
      </li>)}</ul>
      {form && <form onSubmit={salvar} className="mt-2 space-y-2" aria-label="Ajustar pagamento da medição">
        <p className="text-sm font-semibold">{form.titulo.codigo || form.titulo.id} · atual {moeda(form.titulo.valor)}</p>
        <fieldset disabled={ocupado} className="space-y-2">
          {form.acao === 'REDUZIR' && <div className="flex flex-wrap gap-2">
            <label className="form-label">Valor autorizado *<input type="number" min="0.01" step="0.01" className="form-control block" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} required /></label>
            <label className="form-label">Destino da diferença *<select className="form-control block" value={form.destino} onChange={e => setForm(f => ({ ...f, destino: e.target.value }))} required>
              <option value="">Selecione</option><option value="FUTURO">Pagamento futuro</option><option value="DEFINITIVO">Abatimento definitivo</option>
            </select></label>
          </div>}
          {form.titulo.fatura_cartao_id && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={form.desvincular} onChange={e => setForm(f => ({ ...f, desvincular: e.target.checked }))} required />Desvincular a previsão de cartão e recalcular a fatura, somente se estiver sem pagamento.</label>}
          <label className="form-label block">Motivo *<textarea className="form-control block w-full" rows={2} maxLength={2000} value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} required /></label>
          <div className="flex gap-2"><button type="submit" className="btn btn-outline btn-sm">{ocupado ? 'Salvando...' : 'Conferir ajuste'}</button><button type="button" className="btn btn-outline btn-sm" onClick={() => setForm(null)}>Cancelar</button></div>
        </fieldset>
      </form>}
      {dados.historico?.length > 0 && <details className="mt-2 text-sm"><summary className="cursor-pointer">Histórico dos ajustes ({dados.historico.length})</summary><ul className="space-y-2 pt-2">{dados.historico.map(h => <li key={h.id}>
        {h.acao === 'LIBERAR_PENDENTE' ? 'Diferença liberada para novo envio' : `${moeda(h.antes.valor)} → ${moeda(h.depois.valor)} · ${h.depois.destino === 'FUTURO' ? 'pagamento futuro' : 'abatimento definitivo'}`} · {new Date(h.data).toLocaleString('pt-BR')} · usuário {h.usuario_id}<p className="app-note break-words">{h.motivo}</p>
      </li>)}</ul></details>}
    </>}
    {elementoConfirmacao}
  </section>;
}
