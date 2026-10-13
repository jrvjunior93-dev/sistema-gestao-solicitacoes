import { useEffect, useRef, useState } from 'react';
import { API_URL, authHeaders } from '../../services/api';
import { uploadArquivos } from '../../services/uploads';
import { getLinkSeguroAnexoSolicitacao } from '../../services/solicitacoes';
import useVisualizadorArquivo from '../../hooks/useVisualizadorArquivo';
import { BlocoConteudo } from '../../components/padrao';
import StatusBadge from '../../components/StatusBadge';

const moeda = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const novaLinha = obra => ({ obra_id: obra || '', apropriacao_id: '', descricao: '', valor: '' });
export default function AdiantamentoDetalhe({ solicitacaoId, podeInteragir, onAtualizado }) {
  const [contexto, setContexto] = useState(null);
  const [cicloId, setCicloId] = useState('');
  const [itens, setItens] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [observacoes, setObservacoes] = useState('');
  const [motivo, setMotivo] = useState('');
  const [dataDevolucao, setDataDevolucao] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const emVoo = useRef(false);
  const rascunhos = useRef(new Map());
  const { abrirPreview, modalPreview } = useVisualizadorArquivo();
  const base = `${API_URL}/adiantamentos/solicitacoes/${solicitacaoId}`;
  async function consultar(signal) {
    const response = await fetch(cicloId ? `${base}?ciclo_id=${encodeURIComponent(cicloId)}` : base, { headers: authHeaders(), signal });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Erro ao carregar adiantamento.');
    return data;
  }
  function aplicar(data) {
    const rascunho = rascunhos.current.get(`${solicitacaoId}:${data.ciclo?.id}`);
    setContexto(data);
    setItens(rascunho?.itens || data.ciclo?.prestacao?.itens || [novaLinha(data.obras?.[0]?.id)]);
    setObservacoes(rascunho?.observacoes ?? data.ciclo?.prestacao?.observacoes ?? '');
    setDocumentos(rascunho?.documentos || data.ciclo?.prestacao?.anexo_ids || []);
    setMotivo(rascunho?.motivo || ''); setDataDevolucao(rascunho?.dataDevolucao || '');
  }
  useEffect(() => {
    const controller = new AbortController();
    consultar(controller.signal).then(aplicar).catch(error => { if (error.name !== 'AbortError') setErro(error.message); });
    return () => controller.abort();
  }, [base, cicloId]);
  const ciclo = contexto?.ciclo;
  const editar = podeInteragir && ['PRESTACAO_PENDENTE', 'REJEITADA'].includes(ciclo?.status);
  const conferir = podeInteragir && contexto?.pode_conferir && ciclo?.status === 'PRESTACAO_ENVIADA';
  const total = itens.reduce((soma, item) => soma + Math.round(Number(item.valor || 0) * 100), 0) / 100;
  const saldo = Math.round((Number(contexto?.titulo?.valor_baixado || 0) - total) * 100) / 100;
  const prestacao = { itens: itens.map(item => ({ ...item, obra_id: Number(item.obra_id), apropriacao_id: Number(item.apropriacao_id) || null, valor: Number(item.valor || 0) })), anexo_ids: documentos, observacoes };
  function alterar(index, campo, valor) { setItens(prev => prev.map((item, i) => i === index ? { ...item, [campo]: valor, ...(campo === 'obra_id' ? { apropriacao_id: '' } : {}) } : item)); }
  async function executar(acao, body) {
    if (emVoo.current) return;
    emVoo.current = true; setOcupado(true); setErro('');
    try {
      const response = await fetch(`${base}/${acao}`, { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ ...body, ciclo_id: ciclo.id }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Não foi possível concluir.');
      rascunhos.current.delete(`${solicitacaoId}:${ciclo.id}`);
      aplicar(await consultar()); onAtualizado?.();
    } catch (error) { setErro(error.message); }
    finally { emVoo.current = false; setOcupado(false); }
  }
  async function anexar(event) {
    const files = Array.from(event.target.files || []); event.target.value = '';
    if (!files.length || emVoo.current) return;
    emVoo.current = true; setOcupado(true); setErro('');
    try {
      const novos = await uploadArquivos({ files, tipo: 'PRESTACAO_ADIANTAMENTO', solicitacao_id: solicitacaoId });
      const data = await consultar(); setContexto(data);
      // Upload isolado nao sobrescreve despesas ainda em digitacao.
      setDocumentos(prev => [...new Set([...prev, ...novos.map(item => Number(item.id))])]);
    } catch (error) { setErro(error.message); }
    finally { emVoo.current = false; setOcupado(false); }
  }
  return <BlocoConteudo titulo="Adiantamento" acoes={ciclo ? <StatusBadge status={ciclo.status.replaceAll('_', ' ')} /> : null}>
    {erro && <p role="alert" className="app-alert app-alert--error">{erro}</p>}
    {!contexto ? <p>Carregando…</p> : !ciclo ? <p className="text-sm text-[var(--c-muted)]">Aguardando classificação e título do GEO.</p> : <div className="space-y-3">
      {contexto.ciclos?.length > 1 && <label className="grid gap-1 text-sm max-w-xl">Favorecido / Prestação
        <select className="input input-sm" value={contexto.ciclo.id} disabled={ocupado} onChange={e => {
          rascunhos.current.set(`${solicitacaoId}:${ciclo.id}`, { itens, documentos, observacoes, motivo, dataDevolucao });
          setContexto(null); setErro(''); setCicloId(e.target.value);
        }}>
          {contexto.ciclos.map(c => <option key={c.id} value={c.id}>{c.nome_favorecido} · {moeda(c.valor_solicitado)} · {c.status.replaceAll('_', ' ')}</option>)}
        </select>
      </label>}
      <p className="text-sm">{contexto.titulo?.codigo} · Pago: {moeda(contexto.titulo?.valor_baixado)} · Despesas: {moeda(total)} · Saldo a devolver: {moeda(saldo)}</p>
      {ciclo.motivo_rejeicao && <p className="app-alert app-alert--warning">{ciclo.motivo_rejeicao}</p>}
      {ciclo.status !== 'AGUARDANDO_PAGAMENTO' && <>
        <fieldset disabled={ocupado || (!editar && !conferir)} className="min-w-0">
          <div className="overflow-x-auto"><table className="table w-full"><thead><tr><th>Obra/Centro de Custo</th><th>Apropriação</th><th>Despesa</th><th>Valor (R$)</th><th></th></tr></thead><tbody>
            {itens.map((item, index) => <tr key={index}>
              <td><select aria-label={`Destino ${index + 1}`} className="input" value={item.obra_id} onChange={e => alterar(index, 'obra_id', e.target.value)}><option value="">Selecione</option>{contexto.obras?.map(o => <option key={o.id} value={o.id}>{o.codigo} · {o.nome}</option>)}</select></td>
              <td><select aria-label={`Apropriação ${index + 1}`} className="input" value={item.apropriacao_id || ''} onChange={e => alterar(index, 'apropriacao_id', e.target.value)}><option value="">Selecione</option>{contexto.apropriacoes?.filter(a => Number(a.obra_id) === Number(item.obra_id)).map(a => <option key={a.id} value={a.id}>{a.codigo} · {a.descricao}</option>)}</select></td>
              <td><input aria-label={`Despesa ${index + 1}`} className="input" maxLength={255} value={item.descricao} onChange={e => alterar(index, 'descricao', e.target.value)} /></td>
              <td><input aria-label={`Valor ${index + 1}`} className="input w-32" type="number" inputMode="decimal" min="0.01" step="0.01" value={item.valor} onChange={e => alterar(index, 'valor', e.target.value)} /></td>
              <td><button type="button" className="btn btn-ghost btn-sm" aria-label={`Remover despesa ${index + 1}`} onClick={() => setItens(prev => prev.filter((_, i) => i !== index))}>Remover</button></td>
            </tr>)}
          </tbody></table></div>
          {(editar || conferir) && <button type="button" className="btn btn-outline btn-sm mt-2" disabled={itens.length >= 50} onClick={() => setItens(prev => [...prev, novaLinha(contexto.obras?.[0]?.id)])}>Adicionar despesa</button>}
          <label className="block mt-3 text-sm">Observações<textarea className="input w-full" value={observacoes} maxLength={5000} onChange={e => setObservacoes(e.target.value)} /></label>
        </fieldset>
        <div className="flex flex-wrap gap-3 items-center">{contexto.anexos?.map(anexo => <div key={anexo.id} className="flex items-center gap-2">
          <input aria-label={`Incluir ${anexo.nome_original}`} type="checkbox" checked={documentos.includes(Number(anexo.id))} disabled={ocupado || (!editar && !conferir)} onChange={e => setDocumentos(prev => e.target.checked ? [...prev, Number(anexo.id)] : prev.filter(id => id !== Number(anexo.id)))} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => abrirPreview(() => getLinkSeguroAnexoSolicitacao(anexo.caminho_arquivo), { nome: anexo.nome_original, caminho: anexo.caminho_arquivo }).catch(error => setErro(error.message))}>{anexo.nome_original}</button>
        </div>)}{editar && <label className="btn btn-outline btn-sm">Anexar comprovantes<input type="file" multiple disabled={ocupado} className="sr-only" onChange={anexar} /></label>}</div>
        {editar && <button type="button" className="btn btn-primary" disabled={ocupado || saldo < 0} onClick={() => executar('prestacao', prestacao)}>Enviar prestação</button>}
        {conferir && <div className="flex flex-wrap items-end gap-3">
          {saldo > 0 && <label className="text-sm">Vencimento da devolução<input className="input block" type="date" value={dataDevolucao} disabled={ocupado} onChange={e => setDataDevolucao(e.target.value)} /></label>}
          <button type="button" className="btn btn-primary" disabled={ocupado || saldo < 0 || (saldo > 0 && !dataDevolucao)} onClick={() => executar('prestacao/decisao', { decisao: 'APROVAR', prestacao, data_devolucao: dataDevolucao })}>Aprovar prestação</button>
          <label className="text-sm">Motivo da correção<input className="input block" value={motivo} maxLength={5000} disabled={ocupado} onChange={e => setMotivo(e.target.value)} /></label>
          <button type="button" className="btn btn-outline" disabled={ocupado || !motivo.trim()} onClick={() => executar('prestacao/decisao', { decisao: 'REJEITAR', motivo })}>Devolver para correção</button>
        </div>}
      </>}
      {contexto.devolucao && <p className="text-sm">{contexto.devolucao.codigo} · Devolução: {moeda(contexto.devolucao.valor_original)} · {contexto.devolucao.status}</p>}
    </div>}
    {modalPreview}
  </BlocoConteudo>;
}
