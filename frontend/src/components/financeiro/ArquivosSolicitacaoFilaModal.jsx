import { useEffect, useState } from 'react';
import OverlayModal from '../ui/OverlayModal';
import { getArquivosSolicitacaoFila } from '../../services/financeiro';
import { getLinkSeguroAnexoSolicitacao } from '../../services/solicitacoes';

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

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro('');
    setArquivos([]);
    getArquivosSolicitacaoFila(solicitacao.id)
      .then((dados) => {
        if (ativo) setArquivos(Array.isArray(dados) ? dados : []);
      })
      .catch((error) => {
        if (ativo) setErro(error?.message || 'Não foi possível carregar os arquivos.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => { ativo = false; };
  }, [solicitacao.id, tentativa]);

  async function abrirArquivo(arquivo, baixar = false) {
    if (abrindoId !== null) return;
    setAbrindoId(arquivo.id);
    setErro('');
    try {
      const url = await getLinkSeguroAnexoSolicitacao(arquivo.caminho_arquivo);
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      if (baixar) link.download = arquivo.nome_original || 'arquivo';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      setErro(error?.message || 'Não foi possível abrir o arquivo.');
    } finally {
      setAbrindoId(null);
    }
  }

  return (
    <OverlayModal rotulo={`Arquivos da solicitação ${solicitacao.codigo || solicitacao.id}`} largura="720px" onFechar={onFechar}>
      <div data-modal="cabecalho" className="flex items-start justify-between gap-3 border-b border-[var(--c-border)] px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--c-text)]">Arquivos da solicitação {solicitacao.codigo || `#${solicitacao.id}`}</h2>
          <p className="text-xs text-[var(--c-muted)]">Anexos e comprovantes disponíveis para consulta.</p>
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
          <p className="py-6 text-sm text-[var(--c-muted)]">Nenhum arquivo anexado a esta solicitação.</p>
        ) : null}
        {!carregando && arquivos.length > 0 ? (
          <ul className="divide-y divide-[var(--c-border)] border-y border-[var(--c-border)]">
            {arquivos.map((arquivo) => (
              <li key={arquivo.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="break-words text-sm font-medium text-[var(--c-text)]">{arquivo.nome_original || `Arquivo #${arquivo.id}`}</div>
                  <div className="text-xs text-[var(--c-muted)]">{arquivo.tipo || 'Anexo'} · {dataArquivo(arquivo.createdAt)}</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => abrirArquivo(arquivo)} disabled={abrindoId !== null}>
                    {abrindoId === arquivo.id ? 'Abrindo...' : 'Visualizar'}
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => abrirArquivo(arquivo, true)} disabled={abrindoId !== null}>
                    Baixar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </OverlayModal>
  );
}
