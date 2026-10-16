import { useEffect, useRef, useState } from 'react';
import { API_URL, authHeaders } from '../../services/api';
import { getLinkSeguroAnexoSolicitacao } from '../../services/solicitacoes';
import { ehBoletoSolicitacao, rotuloBoletoSolicitacao, tipoBoletoSolicitacao } from '../../utils/boletosSolicitacao';
import { metadataAnexoHistorico, anexoHistoricoRemovido } from './anexosHistorico';
import PreviewAnexoModal from './PreviewAnexoModal';

// Leitura dos anexos ja existentes. Nao inventa eventos/autores nem grava
// backfill no historico; novos uploads usam o evento transacional do pedido.
export function boletosPedidoSemEvento(arquivos, historicos, solicitacaoId) {
  const eventos = Array.isArray(historicos) ? historicos : [];
  const vistos = new Set();
  return (Array.isArray(arquivos) ? arquivos : []).filter(a => {
    if (!ehBoletoSolicitacao(a) || tipoBoletoSolicitacao(a) === 'BOLETO' || !a.caminho_arquivo
      || Number(a.solicitacao_id) !== Number(solicitacaoId) || vistos.has(a.id)) return false;
    vistos.add(a.id);
    const referencia = { solicitacao_id: solicitacaoId, createdAt: a.createdAt,
      metadata: { anexo_id: a.id, caminho: a.caminho_arquivo } };
    if (anexoHistoricoRemovido(referencia, eventos)) return false;
    return !eventos.some(h => {
      if (Number(h.solicitacao_id) !== Number(solicitacaoId)
        || !['ANEXO_ADICIONADO', 'COMPROVANTE_ADICIONADO'].includes(h.acao)) return false;
      const m = metadataAnexoHistorico(h.metadata);
      return Number(m.anexo_id) === Number(a.id) || m.caminho === a.caminho_arquivo;
    });
  });
}

export default function BoletosPedidoHistorico({ solicitacaoId, historicos }) {
  const [consulta, setConsulta] = useState(null), [erro, setErro] = useState('');
  const [tentativa, setTentativa] = useState(0), [abrindoId, setAbrindoId] = useState(null);
  const [preview, setPreview] = useState(null);
  const operacao = useRef(null), geracao = useRef(0);
  const disparadorPreview = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    const atual = ++geracao.current;
    setConsulta(null); setErro(''); setPreview(null); setAbrindoId(null); operacao.current = null; disparadorPreview.current = null;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/solicitacoes/${solicitacaoId}/anexos`, {
          headers: authHeaders(), signal: controller.signal
        });
        if (!res.ok) throw Error('Não foi possível consultar os boletos dos pedidos.');
        const arquivos = await res.json();
        if (atual === geracao.current) setConsulta({ id: solicitacaoId, arquivos });
      } catch (e) {
        if (!controller.signal.aborted && atual === geracao.current) setErro(e.message);
      }
    })();
    return () => { controller.abort(); geracao.current++; operacao.current = null; disparadorPreview.current = null; };
  }, [solicitacaoId, tentativa]);

  function fecharPreview() {
    const disparador = disparadorPreview.current;
    setPreview(null);
    requestAnimationFrame(() => { if (disparador?.isConnected) disparador.focus({ preventScroll: true }); });
  }

  async function abrir(arquivo, baixar = false, disparador) {
    if (operacao.current) return;
    if (!baixar) disparadorPreview.current = disparador;
    const token = Symbol('boleto-pedido'), atual = geracao.current;
    operacao.current = token; setAbrindoId(arquivo.id); setErro('');
    try {
      const url = await getLinkSeguroAnexoSolicitacao(arquivo.caminho_arquivo);
      if (atual !== geracao.current || operacao.current !== token) return;
      if (!baixar) setPreview({ nome: arquivo.nome_original, caminho: arquivo.caminho_arquivo, url, downloadUrl: url });
      else {
        const link = document.createElement('a'); link.href = url;
        link.download = arquivo.nome_original || 'boleto'; link.target = '_blank'; link.rel = 'noopener noreferrer';
        document.body.appendChild(link); link.click(); link.remove();
      }
    } catch (e) { if (atual === geracao.current) setErro(e.message || 'Não foi possível abrir o boleto.'); }
    finally { if (operacao.current === token) { operacao.current = null; setAbrindoId(null); } }
  }

  const arquivos = consulta?.id === solicitacaoId ? boletosPedidoSemEvento(consulta.arquivos, historicos, solicitacaoId) : [];
  if (consulta && !arquivos.length && !erro) return null;
  return <section className="mt-3 border-t border-[var(--c-border)] pt-3" aria-label="Boletos dos pedidos">
    {!consulta && !erro && <p className="app-note" role="status">Consultando boletos dos pedidos...</p>}
    {erro && <p className="app-alert app-alert--error" role="alert">{erro} <button type="button" className="btn btn-outline btn-sm" disabled={abrindoId !== null}
      onClick={() => setTentativa(v => v + 1)}>Tentar novamente</button></p>}
    {arquivos.length > 0 && <>
      <h3 className="text-sm font-semibold">Boletos dos pedidos</h3>
      <ul className="mt-1 max-h-64 overflow-y-auto divide-y divide-[var(--c-border)]">{arquivos.map(a => <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <div className="min-w-0"><p className="break-words text-sm">{a.nome_original || 'Boleto'}</p>
          <p className="app-note">{rotuloBoletoSolicitacao(a)}{a.createdAt ? ` · ${new Date(a.createdAt).toLocaleString('pt-BR')}` : ''}</p></div>
        <div className="flex gap-1">
          <button type="button" className="btn btn-outline btn-sm" disabled={abrindoId !== null} onClick={event => abrir(a, false, event.currentTarget)}
            aria-label={`Visualizar ${a.nome_original || 'boleto'}`}>{abrindoId === a.id ? 'Abrindo...' : 'Visualizar'}</button>
          <button type="button" className="btn btn-outline btn-sm" disabled={abrindoId !== null} onClick={() => abrir(a, true)}
            aria-label={`Baixar ${a.nome_original || 'boleto'}`}>Baixar</button>
        </div>
      </li>)}</ul>
    </>}
    {preview && <PreviewAnexoModal anexo={preview} onClose={fecharPreview} />}
  </section>;
}
