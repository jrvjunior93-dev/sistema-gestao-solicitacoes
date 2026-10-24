import { useEffect, useRef, useState } from 'react';
import OverlayModal from '../ui/OverlayModal';
import PreviewAnexoModal from '../../pages/SolicitacaoDetalhe/PreviewAnexoModal';
import { getArquivosSolicitacaoFila } from '../../services/financeiro';
import { getLinkSeguroAnexoSolicitacao } from '../../services/solicitacoes';
import { ehBoletoSolicitacao, rotuloBoletoSolicitacao } from '../../utils/boletosSolicitacao';
import {abrirNotaSolicitacaoFila,ehNotaFiscalFila} from '../../services/notasFiscaisPagamento';

function dataArquivo(value) {
  if (!value) return 'Data não informada';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data não informada' : date.toLocaleDateString('pt-BR');
}

export default function ArquivosSolicitacaoFilaModal({ solicitacao, onFechar }) {
  const [arquivos, setArquivos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [abrindoId, setAbrindoId] = useState(null);
  const [tentativa, setTentativa] = useState(0);
  const [preview, setPreview] = useState(null);
  const aberturaRef = useRef(null);
  const previewDisparadorRef = useRef(null);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro('');
    setArquivos([]);
    setPreview(null);
    setAbrindoId(null);
    aberturaRef.current = null;
    previewDisparadorRef.current = null;
    getArquivosSolicitacaoFila(solicitacao.id)
      .then((dados) => {
        if (ativo) setArquivos(Array.isArray(dados)
          ? dados.filter(arquivo=>ehBoletoSolicitacao(arquivo)||ehNotaFiscalFila(arquivo)) : []);
      })
      .catch((error) => {
        if (ativo) setErro(error?.message || 'Não foi possível carregar os arquivos.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => { ativo = false; aberturaRef.current = null; };
  }, [solicitacao.id, tentativa]);

  function fecharPreview() {
    const disparador = previewDisparadorRef.current;
    setPreview(null);
    // O botao ficou desabilitado durante o presign e pode ter perdido o foco.
    requestAnimationFrame(() => { if (disparador?.isConnected) disparador.focus({ preventScroll: true }); });
  }

  async function abrirArquivo(arquivo, baixar = false, disparador) {
    if (aberturaRef.current !== null) return;
    const abertura = Symbol('abrir-arquivo');
    aberturaRef.current = abertura;
    if (!baixar) previewDisparadorRef.current = disparador;
    setAbrindoId(arquivo.id);
    setErro('');
    try {
      const fiscal = ehNotaFiscalFila(arquivo);
      const url = fiscal ? (await abrirNotaSolicitacaoFila(solicitacao.id,arquivo)).url : await getLinkSeguroAnexoSolicitacao(arquivo.caminho_arquivo);
      if (aberturaRef.current !== abertura) return;
      const nome = arquivo.nome_original || arquivo.caminho_arquivo || `Arquivo #${arquivo.id}`;
      if (!baixar && /\.(pdf|jpg|jpeg|png|gif|webp)(\?|$)/i.test(nome)) {
        setPreview({ nome, caminho: arquivo.caminho_arquivo, url, downloadUrl: url });
        return;
      }
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      if (baixar) link.download = arquivo.nome_original || 'arquivo';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      if (aberturaRef.current === abertura) setErro(error?.message || 'Não foi possível abrir o arquivo.');
    } finally {
      if (aberturaRef.current === abertura) {
        aberturaRef.current = null;
        setAbrindoId(null);
      }
    }
  }

  return (
    <>
    <OverlayModal rotulo={`Arquivos da solicitação ${solicitacao.codigo || solicitacao.id}`} largura="720px" onFechar={onFechar}>
      <div data-modal="cabecalho" className="flex items-start justify-between gap-3 border-b border-[var(--c-border)] px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--c-text)]">Arquivos da solicitação {solicitacao.codigo || `#${solicitacao.id}`}</h2>
          <p className="text-xs text-[var(--c-muted)]">Boletos da solicitação e dos pedidos, incluindo fretes, e NF-e vinculadas. Confira o documento e a parcela antes de pagar.</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm shrink-0" onClick={onFechar}>Fechar</button>
      </div>

      <div className="px-4 py-3" aria-live="polite">
        {erro ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--sem-danger-border)] bg-[var(--sem-danger-bg)] px-3 py-2 text-sm text-[var(--sem-danger)]" role="alert">
            <span>{erro}</span>
            {!arquivos.length ? <button type="button" className="btn btn-outline btn-sm" onClick={() => setTentativa((valor) => valor + 1)}>Tentar novamente</button> : null}
          </div>
        ) : null}
        {carregando ? <p className="py-6 text-sm text-[var(--c-muted)]">Carregando arquivos...</p> : null}
        {!carregando && !erro && arquivos.length === 0 ? (
          <p className="py-6 text-sm text-[var(--c-muted)]">Nenhum boleto ou NF-e disponível para esta solicitação.</p>
        ) : null}
        {!carregando && arquivos.length > 0 ? (
          <ul className="divide-y divide-[var(--c-border)] border-y border-[var(--c-border)]">
            {arquivos.map((arquivo) => (
              <li key={arquivo.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="break-words text-sm font-medium text-[var(--c-text)]">{arquivo.nome_original || `Arquivo #${arquivo.id}`}</div>
                  <div className="text-xs text-[var(--c-muted)]">{ehNotaFiscalFila(arquivo)?'NF-e vinculada · '+(arquivo.arquivo_tipo==='pdf'?'DANFE':'XML'):rotuloBoletoSolicitacao(arquivo)} · {dataArquivo(arquivo.createdAt)}</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {arquivo.tipo!=='NFE_XML'&&<button type="button" className="btn btn-outline btn-sm" aria-label={`Visualizar ${arquivo.nome_original || `Arquivo #${arquivo.id}`}`} onClick={(event) => abrirArquivo(arquivo, false, event.currentTarget)} disabled={abrindoId !== null}>
                    {abrindoId === arquivo.id ? 'Abrindo...' : 'Visualizar'}
                  </button>}
                  <button type="button" className="btn btn-outline btn-sm" aria-label={`Baixar ${arquivo.nome_original || `Arquivo #${arquivo.id}`}`} onClick={() => abrirArquivo(arquivo, true)} disabled={abrindoId !== null}>
                    Baixar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </OverlayModal>
    {preview && <PreviewAnexoModal anexo={preview} onClose={fecharPreview}
      largura="1200px" alturaPreview="min(76dvh, 780px)" />}
    </>
  );
}
