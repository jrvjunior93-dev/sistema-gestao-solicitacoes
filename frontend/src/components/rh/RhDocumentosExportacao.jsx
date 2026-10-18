import { useEffect, useRef, useState } from 'react';
import { baixarZipRhDocumentos, prepararExportacaoRhDocumentos } from '../../services/rhDp';
import './RhDocumentosExportacao.css';

export default function RhDocumentosExportacao({ colaboradorId, empresaId, obraId }) {
  const [modo, setModo] = useState('COMPROVANTES');
  const [ocupado, setOcupado] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [terminou, setTerminou] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');
  const operacao = useRef(null);
  useEffect(() => {
    setCursor(null); setTerminou(false); setMensagem(''); setErro(''); setOcupado(false);
    return () => { operacao.current?.abort(); operacao.current = null; };
  }, [colaboradorId, empresaId, obraId, modo]);

  async function baixar() {
    if (operacao.current || terminou || (!colaboradorId && !empresaId)) return;
    const abort = new AbortController(); operacao.current = abort;
    setOcupado(true); setErro(''); setMensagem('Preparando arquivos…');
    try {
      const params = { colaborador_id: colaboradorId, empresa_id: empresaId, obra_id: obraId, apos_id: cursor, modo };
      const pagina = await prepararExportacaoRhDocumentos(params, abort.signal);
      if (abort.signal.aborted) return;
      if (!pagina.itens?.length) { setTerminou(true); setMensagem('Nenhum colaborador neste recorte.'); return; }
      const resultado = await baixarZipRhDocumentos(params, abort.signal);
      if (abort.signal.aborted) return;
      const url = URL.createObjectURL(resultado.blob);
      const a = document.createElement('a'); a.href = url;
      a.download = resultado.filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      // A pagina pode mudar entre preparo e ZIP; avanca pelo lote realmente exportado.
      setCursor(resultado.proximo_cursor); setTerminou(!resultado.proximo_cursor);
      setMensagem(`${resultado.quantidade} colaborador(es) neste ZIP. ${resultado.proximo_cursor ? 'Há mais: baixe o próximo lote.' : 'Último lote deste recorte.'}`);
    } catch (error) {
      if (!abort.signal.aborted) { setErro(error.message || 'Falha no download. Tente novamente.'); setMensagem(''); }
    } finally {
      if (operacao.current === abort) { operacao.current = null; setOcupado(false); }
    }
  }
  return <section aria-label="Download de documentos" className="rh-documentos-exportacao mt-2">
    <div className="app-page-actions">
      <label className="form-field"><span className="form-label">Documentos para baixar</span>
        <select className="form-control" value={modo} disabled={ocupado} onChange={e => setModo(e.target.value)}>
          <option value="COMPROVANTES">Somente comprovantes de pagamento</option>
          <option value="COMPLETO">Documentação completa do colaborador</option>
        </select>
      </label>
      <button type="button" className="btn btn-outline btn-sm" disabled={ocupado || terminou || (!colaboradorId && !empresaId)} onClick={baixar}>
        {ocupado ? 'Gerando ZIP…' : cursor ? 'Baixar próximo lote' : 'Baixar ZIP'}
      </button>
      {ocupado && <button type="button" className="btn btn-outline btn-sm" onClick={() => {
        operacao.current?.abort(); operacao.current = null; setOcupado(false); setMensagem('Download cancelado; nenhum lote foi avançado.');
      }}>Cancelar download</button>}
      {terminou && <button type="button" className="btn btn-outline btn-sm" onClick={() => {
        setCursor(null); setTerminou(false); setMensagem('');
      }}>Reiniciar exportação</button>}
    </div>
    <p className="app-note">{colaboradorId ? 'Pasta individual do colaborador.' : empresaId ? 'Até 10 colaboradores por ZIP, em pastas individuais.' : 'Selecione uma empresa no filtro para baixar documentos por colaborador.'}</p>
    <details className="app-note"><summary>Escopo e limites da exportação</summary>
      <p>A exportação por empresa respeita o local atual e inclui desligados. Outros filtros da tabela não alteram o ZIP.
        A documentação completa inclui arquivos oficiais (também versões anteriores), anexos de solicitações e comprovantes disponíveis, com seus status no manifesto. Limite de 256 MiB por ZIP.</p>
    </details>
    {mensagem && <p className="app-note" role="status">{mensagem}</p>}
    {erro && <p role="alert">{erro} O lote não foi avançado.</p>}
  </section>;
}
