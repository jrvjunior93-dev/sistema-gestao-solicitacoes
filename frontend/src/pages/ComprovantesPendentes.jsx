import { useEffect, useState } from 'react';
import PreviewAnexoModal from './SolicitacaoDetalhe/PreviewAnexoModal';
import { fileUrl } from '../services/api';
import {
  getComprovantesPendentes,
  buscarSolicitacoesParaComprovante,
  vincularComprovante
} from '../services/comprovantes';

export default function ComprovantesPendentes() {
  const [pendentes, setPendentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [selecionadas, setSelecionadas] = useState({});
  const [buscando, setBuscando] = useState(false);
  const [vinculando, setVinculando] = useState({});
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    carregarPendentes();
  }, []);

  async function carregarPendentes() {
    try {
      setLoading(true);
      const data = await getComprovantesPendentes();
      setPendentes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      alert('Erro ao carregar comprovantes pendentes');
    } finally {
      setLoading(false);
    }
  }

  async function buscarSolicitacoes() {
    try {
      setBuscando(true);
      const data = await buscarSolicitacoesParaComprovante(busca);
      setSolicitacoes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      alert('Erro ao buscar solicitacoes');
    } finally {
      setBuscando(false);
    }
  }

  async function handleVincular(comprovanteId) {
    const solicitacaoId = selecionadas[comprovanteId];
    if (!solicitacaoId) {
      alert('Selecione uma solicitacao');
      return;
    }

    try {
      setVinculando(prev => ({ ...prev, [comprovanteId]: true }));
      await vincularComprovante(comprovanteId, solicitacaoId);
      setSelecionadas(prev => {
        const next = { ...prev };
        delete next[comprovanteId];
        return next;
      });
      await carregarPendentes();
    } catch (error) {
      console.error(error);
      alert(error?.message || 'Erro ao vincular comprovante');
    } finally {
      setVinculando(prev => ({ ...prev, [comprovanteId]: false }));
    }
  }

  async function baixarArquivo(item) {
    try {
      const urlArquivo = fileUrl(item.caminho_arquivo);
      const response = await fetch(urlArquivo);
      if (!response.ok) {
        throw new Error('Falha ao baixar arquivo');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = item.nome_original || 'comprovante';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert('Erro ao baixar arquivo');
    }
  }

  return (
    <div className="space-y-6 text-[var(--c-text)]">
      <div className="card">
        <h1 className="page-title">Comprovantes Pendentes</h1>
      </div>

      <div className="card space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
          <label className="grid gap-1 text-sm">
            <span className="font-semibold" style={{ color: 'var(--c-text)' }}>
              Buscar solicitacao (codigo ou descricao)
            </span>
            <input
              className="input"
              placeholder="Ex: SOL-000123 ou Combustivel"
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </label>
          <button
            className="btn btn-primary md:self-end"
            type="button"
            onClick={buscarSolicitacoes}
            disabled={buscando}
          >
            {buscando ? 'Buscando...' : 'Buscar'}
          </button>
        </div>

        {solicitacoes.length > 0 && (
          <p className="text-sm text-muted">
            {solicitacoes.length} solicitacao(oes) encontradas.
          </p>
        )}
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 dark:bg-[rgba(255,255,255,0.04)]">
            <tr>
              <th className="text-left p-3 text-[var(--c-text)]">Visualizacao</th>
              <th className="text-left p-3 text-[var(--c-text)]">Obra</th>
              <th className="text-right p-3 text-[var(--c-text)]">Valor</th>
              <th className="text-left p-3 text-[var(--c-text)]">Vincular a solicitacao</th>
              <th className="text-left p-3 text-[var(--c-text)]">Arquivo</th>
              <th className="text-right p-3 text-[var(--c-text)]">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="6" className="p-4 text-center text-muted">
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && pendentes.length === 0 && (
              <tr>
                <td colSpan="6" className="p-4 text-center text-muted">
                  Nenhum comprovante pendente.
                </td>
              </tr>
            )}
            {!loading && pendentes.map(item => (
              <tr key={item.id} className="border-t border-[var(--c-border)]">
                <td className="p-3 text-[var(--c-text)]">{item.nome_original}</td>
                <td className="p-3 text-[var(--c-text)]">
                  {item.obra?.codigo ? `${item.obra.codigo} - ${item.obra.nome}` : item.obra?.nome || '-'}
                </td>
                <td className="p-3 text-right text-[var(--c-text)]">
                  {item.valor
                    ? Number(item.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                    : '-'}
                </td>
                <td className="p-3">
                  <select
                    className="input"
                    value={selecionadas[item.id] || ''}
                    onChange={e =>
                      setSelecionadas(prev => ({ ...prev, [item.id]: e.target.value }))
                    }
                  >
                    <option value="">Selecione</option>
                    {solicitacoes.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.codigo} - {s.obra?.codigo ? `${s.obra.codigo} - ` : ''}{s.obra?.nome || ''} {s.descricao ? `| ${s.descricao}` : ''}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <button
                      className="btn btn-outline"
                      type="button"
                      onClick={() =>
                        setPreview({
                          nome: item.nome_original,
                          caminho: item.caminho_arquivo
                        })
                      }
                    >
                      Visualizar
                    </button>
                    <button
                      className="btn btn-outline"
                      type="button"
                      onClick={() => baixarArquivo(item)}
                    >
                      Download
                    </button>
                  </div>
                </td>
                <td className="p-3 text-right">
                  <button
                    className="btn btn-primary"
                    onClick={() => handleVincular(item.id)}
                    disabled={vinculando[item.id]}
                  >
                    {vinculando[item.id] ? 'Vinculando...' : 'Vincular'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {preview && (
        <PreviewAnexoModal
          anexo={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
