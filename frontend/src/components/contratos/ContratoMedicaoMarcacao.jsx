import { useEffect, useRef, useState } from 'react';
import { getMarcacaoMedicaoContrato, alterarMarcacaoMedicaoContrato } from '../../services/contratos';
import { useConfirmacao } from '../padrao';

export default function ContratoMedicaoMarcacao({ contratoId, onMudou }) {
  const [data, setData] = useState(null), [erro, setErro] = useState('');
  const [editando, setEditando] = useState(false), [motivo, setMotivo] = useState('');
  const [erroMotivo, setErroMotivo] = useState(''), [ocupado, setOcupado] = useState(false);
  const [revisao, setRevisao] = useState(0);
  const mutex = useRef(false), montado = useRef(false), atual = useRef(contratoId);
  atual.current = contratoId;
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);
  useEffect(() => {
    let ativo = true; setData(null); setErro(''); setEditando(false); setMotivo(''); setErroMotivo('');
    if (contratoId) getMarcacaoMedicaoContrato(contratoId)
      .then(r => {
        if (!r?.estado || typeof r.estado.finalizado !== 'boolean' || !Number.isSafeInteger(r.estado.revisao)) {
          throw new Error('Resposta da marcacao indisponivel. Atualize antes de tentar alterar o contrato.');
        }
        if (ativo) setData(r);
      })
      .catch(e => { if (ativo) setErro(e.message); });
    return () => { ativo = false; };
  }, [contratoId, revisao]);
  async function salvar(e) {
    e.preventDefault();
    if (mutex.current || !data?.pode_alterar) return;
    const texto = motivo.trim();
    if (!texto) { setErroMotivo('Informe o motivo da marcacao ou da reversao.'); return; }
    const alvo = { id: contratoId, codigo: data.codigo, finalizado: !data.estado.finalizado,
      revisao: data.estado.revisao, motivo: texto };
    mutex.current = true; setOcupado(true); setErro(''); setErroMotivo('');
    try {
      const { ok } = await confirmar({ titulo: alvo.finalizado ? 'Marcar como totalmente medido' : 'Desfazer marcacao',
        mensagem: `Contrato ${alvo.codigo}: ${alvo.finalizado ? 'saira das opcoes da Obra e nao aceitara novas medicoes' : 'voltara a ficar disponivel conforme as demais regras de medicao'}. Parcelas, titulos, pagamentos e historico permanecem intactos. Motivo: ${alvo.motivo}`,
        rotuloConfirmar: alvo.finalizado ? 'Marcar como totalmente medido' : 'Desfazer marcacao', rotuloCancelar: 'Voltar' });
      if (!ok || !montado.current || atual.current !== alvo.id) return;
      await alterarMarcacaoMedicaoContrato(alvo.id, { finalizado: alvo.finalizado, revisao: alvo.revisao, motivo: alvo.motivo });
      if (!montado.current || atual.current !== alvo.id) return;
      setRevisao(v => v + 1);
      try { await onMudou?.(); } catch { if (montado.current) setErro('Marcacao salva. Atualize a listagem para conferir o novo estado.'); }
    } catch (error) { if (montado.current && atual.current === alvo.id) setErro(error.message); }
    finally { mutex.current = false; if (montado.current) setOcupado(false); }
  }
  if (!contratoId) return null;
  return <section className="mt-3 border-t border-[var(--c-border)] pt-3" aria-label="Marcacao de medicao do contrato">
    {erro && <p role="alert" className="app-alert app-alert--error">{erro} <button type="button" className="btn btn-outline btn-sm" disabled={ocupado} onClick={() => setRevisao(v => v + 1)}>Atualizar marcacao</button></p>}
    {!data && !erro && <p className="app-note">Consultando marcacao de medicao...</p>}
    {data && <>
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm">{data.estado.finalizado ? 'Totalmente medido · marcacao GEO' : 'Marcacao manual de medicao'}</strong>
        {data.pode_alterar && !editando && <button type="button" className="btn btn-outline btn-sm" disabled={ocupado} onClick={() => { setEditando(true); setErroMotivo(''); }}>
          {data.estado.finalizado ? 'Desfazer marcacao de totalmente medido' : 'Marcar como totalmente medido'}
        </button>}
      </div>
      {data.estado.finalizado && <p className="app-note mt-1">Novas medicoes bloqueadas. Financeiro e historico preservados. Motivo: {data.estado.motivo}</p>}
      {editando && data.pode_alterar && <form className="mt-2 space-y-2" onSubmit={salvar} aria-label="Alterar marcacao de medicao">
        <label className="form-label block" htmlFor={`motivo-marcacao-${contratoId}`}>Motivo *</label>
        <textarea id={`motivo-marcacao-${contratoId}`} className="form-control w-full" rows={2} maxLength={2000} value={motivo} disabled={ocupado}
          aria-invalid={Boolean(erroMotivo)} aria-describedby={erroMotivo ? `erro-marcacao-${contratoId}` : undefined}
          onChange={e => setMotivo(e.target.value)} />
        {erroMotivo && <p id={`erro-marcacao-${contratoId}`} role="alert" className="text-sm text-[var(--c-danger)]">{erroMotivo}</p>}
        <p className="app-note">Esta acao nao altera o saldo nem cancela parcelas ou titulos.</p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-outline btn-sm" disabled={ocupado}>{ocupado ? 'Salvando marcacao...' : 'Confirmar marcacao'}</button>
          <button type="button" className="btn btn-outline btn-sm" disabled={ocupado} onClick={() => setEditando(false)}>Cancelar</button>
        </div>
      </form>}
      {data.historico?.length > 0 && <details className="mt-2 text-sm"><summary className="cursor-pointer">Historico da marcacao ({data.historico.length}{data.historico.length === 50 ? ' mais recentes' : ''})</summary>
        <ul className="mt-2 space-y-2">{data.historico.map(h => <li key={h.id}>
          <span>{h.finalizado ? 'Marcado como totalmente medido' : 'Marcacao desfeita'} · {h.data ? new Date(h.data).toLocaleString('pt-BR') : '-'} · Usuario {h.usuario_id}</span>
          <p className="app-note break-words">{h.motivo}</p>
        </li>)}</ul>
      </details>}
    </>}
    {elementoConfirmacao}
  </section>;
}
