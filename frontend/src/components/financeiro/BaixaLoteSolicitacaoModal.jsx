import { useEffect, useRef, useState } from 'react';
import OverlayModal from '../ui/OverlayModal';
import DateInputBR from '../DateInputBR';
import { baixaLoteSolicitacao, getContasBancarias, getFormasPagamentoFinanceiras } from '../../services/financeiro';

const money = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function formaSimples(f) {
  const nome = [f.tipo,f.codigo,f.nome].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  return f.ativo !== false && !f.exige_cartao && !f.gera_fatura && !f.exige_cheque && !/CHEQUE|CARTAO|PERMUTA/.test(nome) && /PIX|BOLETO|TRANSFER|DINHEIRO/.test(nome);
}
export default function BaixaLoteSolicitacaoModal({ solicitacaoId, ids, onClose, onConfirmed }) {
  const [opcoes,setOpcoes] = useState(null), [erro,setErro] = useState(''), [previa,setPrevia] = useState(null), [busy,setBusy] = useState(false);
  const [form,setForm] = useState({ conta_bancaria_id:'',forma_pagamento_id:'',data_movimento:new Date().toLocaleDateString('en-CA'),observacoes:'' });
  const mutex=useRef(false), chave=useRef(null);
  useEffect(() => {
    let alive=true;
    Promise.all([getContasBancarias(),getFormasPagamentoFinanceiras()]).then(([contas,formas]) => {
      if(alive)setOpcoes({contas:(Array.isArray(contas)?contas:[]).filter(c=>c.ativo!==false),formas:(Array.isArray(formas)?formas:[]).filter(formaSimples)});
    }).catch(e=>{if(alive)setErro(e.message || 'Erro ao carregar contas e formas.');});
    return()=>{alive=false;};
  },[]);
  function change(k,v){if(mutex.current)return;setForm(f=>({...f,[k]:v}));setPrevia(null);chave.current=null;setErro('');}
  async function executar(confirmar){
    if(mutex.current)return;
    if(!form.conta_bancaria_id||!form.forma_pagamento_id||!form.data_movimento){setErro('Informe conta, forma e data da baixa.');return;}
    mutex.current=true;setBusy(true);setErro('');
    try{
      const dados={...form,titulo_ids:ids};
      if(confirmar){chave.current ||= crypto.randomUUID();dados.chave=chave.current;dados.revisao=previa.revisao;}
      const result=await baixaLoteSolicitacao(solicitacaoId,dados,confirmar);
      if(confirmar){await onConfirmed(result);onClose();}else setPrevia(result);
    }catch(e){setErro(e.message || 'Não foi possível concluir. Confira os dados antes de tentar novamente.');}
    finally{mutex.current=false;setBusy(false);}
  }
  return <OverlayModal onFechar={()=>{if(!mutex.current)onClose();}} largura="960px" rotulo="Baixa em massa da solicitação">
    <div data-modal="cabecalho" className="flex items-center justify-between gap-3 border-b border-[var(--c-border)] p-4">
      <h3 className="font-semibold">Baixa em massa · {ids.length} título(s)</h3>
      <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Fechar</button>
    </div>
    <div data-modal="conteudo" className="space-y-3 p-4">
      <p className="text-xs text-[var(--c-muted)]">Baixa integral do saldo, com juros e multa ainda não pagos. Todos os títulos são validados antes da confirmação; uma falha desfaz o lote inteiro.</p>
      <p className="text-xs text-[var(--c-muted)]">Disponível para Pix, boleto, transferência e dinheiro na mesma empresa. Para cartão, cheque, permuta ou operação entre empresas, use a baixa detalhada do título.</p>
      {erro&&<p role="alert" className="text-sm text-[var(--sem-danger)]">{erro}</p>}
      <fieldset disabled={busy||!opcoes} className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">Conta financeira<select aria-label="Conta financeira" className="input" value={form.conta_bancaria_id} onChange={e=>change('conta_bancaria_id',e.target.value)}><option value="">Selecione</option>{opcoes?.contas.map(c=><option key={c.id} value={c.id}>{c.nome || c.descricao || `Conta #${c.id}`}</option>)}</select></label>
        <label className="text-sm">Forma de pagamento/recebimento<select aria-label="Forma de pagamento/recebimento" className="input" value={form.forma_pagamento_id} onChange={e=>change('forma_pagamento_id',e.target.value)}><option value="">Selecione</option>{opcoes?.formas.map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>
        <label className="text-sm">Data da baixa<DateInputBR className="input" value={form.data_movimento} onChange={e=>change('data_movimento',e.target.value)} /></label>
        <label className="text-sm">Observações<textarea className="input" maxLength={4000} value={form.observacoes} onChange={e=>change('observacoes',e.target.value)} /></label>
      </fieldset>
      {previa&&<div className="space-y-2">
        {previa.titulos.some(t=>t.compartilhado)&&<p className="text-sm text-[var(--sem-warning)]">Há título compartilhado: os valores abaixo são do título integral. A baixa afeta todas as solicitações participantes.</p>}
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Título</th><th>Principal</th><th>Juros</th><th>Multa</th><th>Total</th></tr></thead><tbody>{previa.titulos.map(t=><tr key={t.id}><td>{t.codigo}</td><td>{money(t.principal)}</td><td>{money(t.juros)}</td><td>{money(t.multa)}</td><td>{money(t.total)}</td></tr>)}</tbody></table></div>
        <p className="text-right font-semibold">Total da movimentação: {money(previa.total)}</p>
      </div>}
    </div>
    <div data-modal="rodape" className="flex justify-end gap-2 border-t border-[var(--c-border)] p-4">
      <button type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>Cancelar</button>
      <button type="button" className="btn btn-primary" disabled={busy||!opcoes} onClick={()=>executar(Boolean(previa))}>{busy?'Processando…':previa?'Confirmar baixas':'Conferir lote'}</button>
    </div>
  </OverlayModal>;
}
