import { useRef, useState } from 'react';
import { ajustarSaldoCartao } from '../../services/recargasCartao';
import { uploadArquivos } from '../../services/uploads';
import { getLinkSeguroAnexoSolicitacao } from '../../services/solicitacoes';
import useVisualizadorArquivo from '../../hooks/useVisualizadorArquivo';

const moeda = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function SaldoCartaoRecarga({ contexto, solicitacaoId, onAtualizado }) {
  const saldo = contexto?.saldo_cartao;
  const [informado, setInformado] = useState('');
  const [motivo, setMotivo] = useState('');
  const [extrato, setExtrato] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const trava = useRef(false);
  const tentativa = useRef(null);
  const extratoInput = useRef(null);
  const { abrirPreview, modalPreview } = useVisualizadorArquivo();
  if (!saldo) return null;
  async function ajustar(e) {
    e.preventDefault();
    if (trava.current) return;
    trava.current = true; setOcupado(true); setErro(''); setMensagem('');
    try {
      // Replay de falha de rede conserva chave, corpo e anexo originais.
      if (!tentativa.current) {
        const arquivos = await uploadArquivos({ files: [extrato], tipo: 'EXTRATO_SALDO_CARTAO', solicitacao_id: solicitacaoId });
        if (!arquivos?.[0]?.id) throw new Error('O servidor não confirmou o extrato.');
        tentativa.current = { recarga_id: contexto.ultima_recarga.id, saldo_informado: Number(informado), motivo,
          anexo_id: arquivos[0].id, revisao_saldo: saldo.revisao, chave_idempotencia: crypto.randomUUID() };
      }
      await ajustarSaldoCartao(solicitacaoId, tentativa.current);
      tentativa.current = null; setInformado(''); setMotivo(''); setExtrato(null);
      if (extratoInput.current) extratoInput.current.value = '';
      setMensagem('Ajuste registrado no histórico.');
      await onAtualizado?.();
    } catch (error) {
      setErro(`${error.message} Se o saldo mudou, atualize os dados e prepare um novo ajuste.`);
    } finally { trava.current = false; setOcupado(false); }
  }
  return <section className="space-y-2 border-y border-[var(--c-border)] py-3" aria-label="Saldo do cartão">
    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums">
      <span>Saldo após gastos validados: <strong>{moeda(saldo.saldo_validado)}</strong></span>
      <span>Gastos a validar/corrigir: <strong>{moeda(saldo.despesas_pendentes)}</strong></span>
      <span>Saldo disponível estimado: <strong>{moeda(saldo.saldo_disponivel)}</strong></span>
    </div>
    <p className="text-xs text-[var(--c-muted)]">Calculado pelas baixas, gastos e ajustes registrados; não é uma consulta à operadora. A sobra permanece no cartão e não vira despesa.</p>
    {saldo.saldo_disponivel < 0 && <p className="text-xs text-red-700" role="alert">Saldo negativo: confira estornos e extrato com o GEO antes de prestar contas.</p>}
    {contexto.pode_validar && solicitacaoId && <details>
      <summary className="cursor-pointer text-sm font-semibold">Ajustar saldo pelo extrato (GEO)</summary>
      <p className="mt-2 text-xs text-[var(--c-muted)]">Informe o saldo disponível real, já descontados todos os gastos declarados, inclusive os ainda não validados. Não altera despesas nem pagamentos anteriores.</p>
      <form onSubmit={ajustar} className="mt-2 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs">Saldo disponível real (R$)<input aria-label="Saldo disponível real" className="input input-sm" type="number" min="0" step="0.01" required value={informado} onChange={e => setInformado(e.target.value)} disabled={ocupado || Boolean(tentativa.current)} /></label>
        <label className="grid flex-1 gap-1 text-xs">Motivo<input aria-label="Motivo do ajuste de saldo" className="input input-sm" minLength={5} maxLength={2000} required value={motivo} onChange={e => setMotivo(e.target.value)} disabled={ocupado || Boolean(tentativa.current)} /></label>
        <label className="grid min-w-0 gap-1 text-xs">Extrato obrigatório<input ref={extratoInput} aria-label="Extrato do cartão" type="file" accept=".pdf,.png,.jpg,.jpeg" required={!tentativa.current} onChange={e => setExtrato(e.target.files?.[0] || null)} disabled={ocupado || Boolean(tentativa.current)} className="max-w-full" /></label>
        <button type="submit" className="btn btn-outline btn-sm" disabled={ocupado || (!tentativa.current && (!extrato || !motivo.trim() || informado === ''))}>{ocupado ? 'Registrando...' : tentativa.current ? 'Reenviar mesmo ajuste' : 'Registrar ajuste auditado'}</button>
        {tentativa.current && !ocupado && <button type="button" className="btn btn-ghost btn-sm" onClick={async () => {
          // O usuario deve conferir o historico antes de iniciar outro ajuste.
          try { await onAtualizado?.(); tentativa.current = null; setErro('Confira o histórico atualizado antes de registrar outro ajuste.'); }
          catch (error) { setErro(error.message); }
        }}>Atualizar e conferir histórico</button>}
      </form>
      <ul className="mt-3 space-y-1 text-xs">
        {(contexto.ajustes_saldo || []).map(item => <li key={item.id}>
          #{item.id} · {new Date(item.createdAt).toLocaleString('pt-BR')} · usuário #{item.criado_por} · {moeda(item.saldo_anterior)} → {moeda(item.saldo_informado)} · {item.motivo}
          <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={async () => {
            try { await abrirPreview(() => getLinkSeguroAnexoSolicitacao(item.extrato_caminho), { nome: item.extrato_nome || 'Extrato', caminho: item.extrato_caminho }); }
            catch (error) { setErro(error.message); }
          }}>Abrir extrato</button>
        </li>)}
      </ul>
    </details>}
    {erro && <p className="text-sm text-red-700" role="alert">{erro}</p>}
    {mensagem && <p className="text-sm" role="status">{mensagem}</p>}
    {modalPreview}
  </section>;
}
