import { useEffect, useRef, useState } from 'react';
import { API_URL, authHeaders } from '../../services/api';
import OverlayModal from '../ui/OverlayModal';

export default function DistribuicaoCentroCustoConfig({ centro, onFechar }) {
  const [contexto, setContexto] = useState(null);
  const [ids, setIds] = useState(null);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const emVoo = useRef(false);
  const url = `${API_URL}/solicitacoes/centros-custo/${centro.id}/configuracao-distribuicao`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { headers: authHeaders(), signal: controller.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw Error(data.error);
      setContexto(data); setIds(data.obras_ids);
    }).catch(error => { if (error.name !== 'AbortError') setErro(error.message); });
    return () => controller.abort();
  }, [url]);
  async function salvar() {
    if (emVoo.current || !contexto) return;
    emVoo.current = true; setSalvando(true); setErro('');
    try {
      const response = await fetch(url, { method: 'PUT', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ obras_ids: ids }) });
      const data = await response.json(); if (!response.ok) throw Error(data.error);
      onFechar();
    } catch (error) { setErro(error.message); }
    finally { emVoo.current = false; setSalvando(false); }
  }
  return <OverlayModal rotulo={`Destinos para distribuição · ${centro.nome}`} onFechar={salvando ? undefined : onFechar}>
    <header data-modal="cabecalho" className="p-4 border-b flex items-center justify-between gap-3"><h2>Destinos para distribuição · {centro.nome}</h2><button type="button" className="btn btn-ghost" onClick={onFechar} disabled={salvando}>Fechar</button></header>
    <div className="p-4">
    {erro && <p role="alert" className="form-error">{erro}</p>}
    {!contexto ? <p>Carregando destinos…</p> : <div className="space-y-3">
      <label className="flex items-center gap-2"><input type="checkbox" checked={ids === null} disabled={salvando} onChange={e => setIds(e.target.checked ? null : [])} />Todas as obras e centros de custo elegíveis</label>
      <label className="block">Pesquisar obras e centros de custo<input className="input w-full" value={busca} onChange={e => setBusca(e.target.value)} /></label>
      <p className="text-xs text-[var(--c-muted)]">Na prestação de contas de adiantamentos, continuam disponíveis apenas os destinos já permitidos naquele fluxo.</p>
      <div className="max-h-80 overflow-auto divide-y divide-[var(--c-border)]">
        {contexto.obras.filter(obra => `${obra.codigo} ${obra.nome}`.toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR'))).map(obra => <label key={obra.id} className="flex items-center gap-2 py-2">
          <input type="checkbox" disabled={salvando || ids === null} checked={ids === null || ids.includes(obra.id)} onChange={e => setIds(prev => e.target.checked ? [...prev, obra.id] : prev.filter(id => id !== obra.id))} />{obra.codigo} · {obra.nome}{obra.tipo_centro_custo === 'CENTRO_CUSTO' ? ' · Centro de custo' : ''}
        </label>)}
      </div>
    </div>}
    </div><footer data-modal="rodape" className="p-4 border-t flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onFechar} disabled={salvando}>Cancelar</button><button type="button" className="btn btn-primary" onClick={salvar} disabled={salvando || !contexto}>{salvando ? 'Salvando…' : 'Salvar'}</button></footer>
  </OverlayModal>;
}
