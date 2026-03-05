import { useEffect, useMemo, useState } from 'react';
import {
  excluirArquivoModelo,
  getContextoArquivosModelos,
  getLinkArquivoModelo,
  listarArquivosModelos,
  uploadArquivoModelo
} from '../services/arquivosModelos';

function formatarDataHora(valor) {
  if (!valor) return '-';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '-';
  return data.toLocaleString('pt-BR');
}

function formatarTamanho(bytes) {
  const valor = Number(bytes || 0);
  if (!valor) return '-';
  if (valor < 1024) return `${valor} B`;
  if (valor < 1024 * 1024) return `${(valor / 1024).toFixed(1)} KB`;
  return `${(valor / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ArquivosModelos() {
  const [contexto, setContexto] = useState(null);
  const [paginaSelecionada, setPaginaSelecionada] = useState('');
  const [arquivos, setArquivos] = useState([]);
  const [uploading, setUploading] = useState(false);

  const paginasAtivas = useMemo(
    () => (contexto?.paginas || []).filter(p => p.ativo),
    [contexto]
  );

  const podeUploadAtual = useMemo(() => {
    if (!contexto || !paginaSelecionada) return false;
    return contexto?.uploadPermitidoPorPagina?.[paginaSelecionada] === true;
  }, [contexto, paginaSelecionada]);

  async function carregarContexto() {
    const data = await getContextoArquivosModelos();
    setContexto(data);
    if (!paginaSelecionada && data?.paginas?.length) {
      const primeiraAtiva = data.paginas.find(p => p.ativo) || data.paginas[0];
      setPaginaSelecionada(primeiraAtiva?.codigo || '');
    }
  }

  async function carregarArquivos(codigoPagina) {
    if (!codigoPagina) {
      setArquivos([]);
      return;
    }
    const data = await listarArquivosModelos(codigoPagina);
    setArquivos(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    carregarContexto().catch(error => {
      console.error(error);
      alert('Erro ao carregar arquivos modelos');
    });
  }, []);

  useEffect(() => {
    carregarArquivos(paginaSelecionada).catch(error => {
      console.error(error);
      alert('Erro ao listar arquivos');
    });
  }, [paginaSelecionada]);

  async function abrirArquivo(id) {
    try {
      const url = await getLinkArquivoModelo(id);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao abrir arquivo');
    }
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !paginaSelecionada) return;
    try {
      setUploading(true);
      await uploadArquivoModelo({
        paginaCodigo: paginaSelecionada,
        file
      });
      await carregarArquivos(paginaSelecionada);
      alert('Arquivo enviado com sucesso.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao enviar arquivo');
    } finally {
      setUploading(false);
    }
  }

  async function handleExcluir(arquivoId) {
    if (!window.confirm('Deseja excluir este arquivo?')) return;
    try {
      await excluirArquivoModelo(arquivoId);
      await carregarArquivos(paginaSelecionada);
      alert('Arquivo excluido com sucesso.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao excluir arquivo');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Arquivos Modelos</h1>
        <p className="page-subtitle">
          Biblioteca de modelos por área. Visualização e download disponíveis para todos os usuários.
        </p>
      </div>

      <div className="card">
        <div className="flex flex-wrap gap-2">
          {paginasAtivas.map(pagina => (
            <button
              key={pagina.codigo}
              type="button"
              className={`btn ${paginaSelecionada === pagina.codigo ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setPaginaSelecionada(pagina.codigo)}
            >
              {pagina.nome}
            </button>
          ))}
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold">
            {paginasAtivas.find(p => p.codigo === paginaSelecionada)?.nome || 'Selecione uma página'}
          </h2>
          {podeUploadAtual && (
            <label className="btn btn-outline cursor-pointer">
              {uploading ? 'Enviando...' : 'Upload de arquivo'}
              <input
                type="file"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
            </label>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {arquivos.map(arquivo => (
            <div key={arquivo.id} className="rounded-xl border border-gray-200 p-3 bg-white">
              <p className="font-medium break-all">{arquivo.nome_original}</p>
              <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                <p>Tamanho: {formatarTamanho(arquivo.tamanho_bytes)}</p>
                <p>Enviado por: {arquivo?.criadoPor?.nome || '-'}</p>
                <p>Data: {formatarDataHora(arquivo.createdAt)}</p>
              </div>
              <div className="mt-3 flex gap-2">
                <button type="button" className="btn btn-outline" onClick={() => abrirArquivo(arquivo.id)}>
                  Visualizar
                </button>
                <button type="button" className="btn btn-outline" onClick={() => abrirArquivo(arquivo.id)}>
                  Baixar
                </button>
                {podeUploadAtual && (
                  <button type="button" className="btn btn-danger" onClick={() => handleExcluir(arquivo.id)}>
                    Excluir
                  </button>
                )}
              </div>
            </div>
          ))}
          {arquivos.length === 0 && (
            <div className="text-sm text-gray-500">
              Nenhum arquivo cadastrado nesta página.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
