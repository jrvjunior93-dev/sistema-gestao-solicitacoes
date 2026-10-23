import { useEffect, useRef, useState } from 'react';
import ParceiroBuscaRemota from '../solicitacoes/ParceiroBuscaRemota';
import { useConfirmacao } from '../padrao';
import { consultarFavorecido, alterarFavorecido } from '../../services/medicaoOperacoes';
import { formaPagamentoEhPix } from '../../utils/formaPagamento';
import { PIX_TEXTO_MAX } from '../../utils/pix';
import { useWorkspaceWork } from '../../navigation/WorkspaceContext';

export default function FavorecidoEditor({ tipo = 'titulo', id, permitido = false, disabled = false, destaque = false, onSalvo, onOcupado }) {
  const [dados, setDados] = useState(null), [edicao, setEdicao] = useState(null), [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false), [aviso, setAviso] = useState('');
  const mutex = useRef(false), geracao = useRef(0);
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  useWorkspaceWork(false, busy, `favorecido-operacao:${tipo}:${id}`);
  useEffect(() => {
    geracao.current++; setDados(null); setEdicao(null); setErro(''); setAviso(''); setBusy(false); mutex.current = false;
    return () => { geracao.current++; };
  }, [id, tipo]);
  function fechar() { setDados(null); setEdicao(null); onOcupado?.(false); }
  async function abrir() {
    if (mutex.current || disabled) return;
    const g = geracao.current;
    mutex.current = true; setBusy(true); setErro(''); setAviso(''); onOcupado?.(true);
    try {
      const r = await consultarFavorecido(tipo, id);
      if (g !== geracao.current) return;
      if (!r.pode_editar) throw new Error('Edição indisponível. Confira a permissão e a situação da medição.');
      setDados(r);
    } catch (e) { if (g === geracao.current) { setErro(e.message); onOcupado?.(false); } }
    finally { if (g === geracao.current) { mutex.current = false; setBusy(false); } }
  }
  async function salvar() {
    if (mutex.current || disabled || !edicao || !dados) return;
    if (!edicao.favorecido?.id || !edicao.confirmado || !edicao.motivo.trim()
      || (formaPagamentoEhPix(edicao.forma) && !edicao.chave_pix.trim())) {
      setErro('Selecione o favorecido, confira os dados de pagamento e informe o motivo.'); return;
    }
    const g = geracao.current, alvo = { tipo, id, ...edicao }, ref = dados.referencia;
    mutex.current = true; setBusy(true); setErro('');
    try {
      const { ok } = await confirmar({ titulo: 'Confirmar favorecido',
        mensagem: `Salvar ${alvo.favorecido.nome} como favorecido ${dados.origem === 'MEDICAO' ? 'da medição pendente. Os títulos dessa origem seguirão a conferência da medição' : 'deste título'}. Confira a chave PIX e os dados bancários. Credor, valores e baixas não serão alterados.`,
        rotuloConfirmar: 'Salvar favorecido' });
      if (!ok || g !== geracao.current) return;
      await alterarFavorecido(alvo.tipo, alvo.id, { referencia: ref, unidade_id: alvo.unidade_id,
        favorecido_id: Number(alvo.favorecido.id), chave_pix: alvo.chave_pix, dados_pagamento: alvo.dados_pagamento,
        confirmado: true, motivo: alvo.motivo });
      if (g !== geracao.current) return;
      fechar(); setAviso('Favorecido e dados de pagamento atualizados.');
      try { await onSalvo?.(); } catch { setAviso('Dados salvos. Atualize a tela para conferir.'); }
    } catch (e) { if (g === geracao.current) setErro(e.message); }
    finally { if (g === geracao.current) { mutex.current = false; setBusy(false); } }
  }
  if (!permitido) return null;
  return <section className="my-2 text-sm" aria-label="Editar favorecido">
    {!dados && <button type="button" className={`btn ${destaque ? 'btn-primary' : 'btn-outline'} btn-sm`} disabled={busy || disabled} onClick={abrir}>{busy ? 'Conferindo...' : 'Editar favorecido'}</button>}
    {erro && <p role="alert" className="app-alert app-alert--error mt-2">{erro}</p>}
    {aviso && <p role="status" className="app-alert app-alert--success mt-2">{aviso}</p>}
    {dados && <div className="space-y-3 border-y border-[var(--c-border)] py-3">
      <p className="app-note">{dados.origem === 'MEDICAO' ? 'Dados da medição pendente: a alteração vale para a instrução de origem, inclusive ao abrir pelo título.' : 'A alteração vale somente para este título. Não modifica o cadastro geral do credor nem pagamentos anteriores.'}</p>
      {!edicao && <>
        {dados.unidades.map((u, i) => <div key={u.unidade_id || 'principal'} className="flex flex-wrap items-center justify-between gap-2">
          <span>{dados.unidades.length > 1 ? `Favorecido ${i + 1}: ` : ''}{u.favorecido?.nome || 'Não informado'} · {u.forma?.nome || 'Forma não informada'}</span>
          <button type="button" className="btn btn-outline btn-sm" disabled={busy || disabled} onClick={() => { setErro(''); setEdicao({ ...u, motivo: '', confirmado: false }); }}>Alterar favorecido{dados.unidades.length > 1 ? ` ${i + 1}` : ''}</button>
        </div>)}
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={fechar}>Fechar edição</button>
      </>}
      {edicao && <><fieldset disabled={busy || disabled} className="space-y-3 min-w-0">
        <legend className="mb-2 font-semibold">Favorecido e dados de pagamento · {edicao.forma?.nome}</legend>
        <ParceiroBuscaRemota label="Favorecido do pagamento" obrigatorio selecionado={edicao.favorecido}
          onSelecionar={favorecido => setEdicao(v => ({ ...v, favorecido, chave_pix: '', dados_pagamento: '', confirmado: false }))} />
        {formaPagamentoEhPix(edicao.forma) && <label className="block">Chave PIX / PIX copia e cola *<textarea aria-label="Chave PIX do favorecido" className="input mt-1 w-full" rows={2} maxLength={PIX_TEXTO_MAX} value={edicao.chave_pix}
          onChange={e => setEdicao(v => ({ ...v, chave_pix: e.target.value, confirmado: false }))} /></label>}
        <label className="block">Dados para pagamento / observações<textarea className="input mt-1 w-full" rows={2} maxLength={dados.origem === 'MEDICAO' ? 180 : 2000} value={edicao.dados_pagamento}
          onChange={e => setEdicao(v => ({ ...v, dados_pagamento: e.target.value, confirmado: false }))} /></label>
        <p className="app-note">Ao trocar o favorecido, os dados anteriores são limpos para evitar pagamento à pessoa errada. A forma de pagamento permanece a mesma.</p>
        <label className="block">Motivo da alteração *<textarea aria-label="Motivo da alteração do favorecido" className="input mt-1 w-full" rows={2} maxLength={2000} value={edicao.motivo} onChange={e => setEdicao(v => ({ ...v, motivo: e.target.value }))} /></label>
        <label className="flex items-start gap-2"><input type="checkbox" checked={edicao.confirmado} onChange={e => setEdicao(v => ({ ...v, confirmado: e.target.checked }))} />Conferi o favorecido e os dados para pagamento.</label>
      </fieldset>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={fechar}>Cancelar edição</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || disabled} onClick={salvar}>{busy ? 'Salvando...' : 'Salvar favorecido'}</button>
        </div>
      </>}
    </div>}
    {elementoConfirmacao}
  </section>;
}
