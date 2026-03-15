import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { baixarPdfSolicitacaoCompra, listarSolicitacoesCompra } from '../../../services/compras';
import { getMinhasObras } from '../../../services/obras';

function formatarData(data) {
  if (!data) {
    return '-';
  }

  const raw = String(data);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  const valor = new Date(data);
  if (Number.isNaN(valor.getTime())) {
    return '-';
  }

  return valor.toLocaleDateString('pt-BR');
}

function formatarStatus(status) {
  return String(status || '-')
    .replace(/_/g, ' ')
    .toUpperCase();
}

function classNameStatus(status) {
  const valor = String(status || '').toUpperCase();

  if (valor === 'ABERTA') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (valor === 'FINALIZADA') {
    return 'bg-slate-100 text-slate-700';
  }

  return 'bg-blue-100 text-blue-700';
}

export default function SolicitacoesCompra() {
  const navigate = useNavigate();
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [obras, setObras] = useState([]);
  const [loading, setLoading] = useState(false);
  const [obraId, setObraId] = useState('');
  const [status, setStatus] = useState('');
  const [busca, setBusca] = useState('');

  async function carregarObras() {
    try {
      const data = await getMinhasObras({ modo: 'CRIACAO' });
      setObras(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
    }
  }

  async function carregarSolicitacoes() {
    try {
      setLoading(true);
      const params = obraId ? { obra_id: obraId } : {};
      const data = await listarSolicitacoesCompra(params);
      setSolicitacoes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao carregar solicitações de compra');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarObras();
  }, []);

  useEffect(() => {
    carregarSolicitacoes();
  }, [obraId]);

  const solicitacoesFiltradas = useMemo(() => {
    const termo = String(busca || '').trim().toLowerCase();

    return solicitacoes.filter((solicitacao) => {
      const statusOk = !status || String(solicitacao.status || '').toUpperCase() === status;

      if (!statusOk) {
        return false;
      }

      if (!termo) {
        return true;
      }

      const obraNome = String(solicitacao.obra?.nome || '').toLowerCase();
      const obraCodigo = String(solicitacao.obra?.codigo || '').toLowerCase();
      const solicitante = String(solicitacao.solicitante?.nome || '').toLowerCase();
      const codigo = `sc-${String(solicitacao.id || '').padStart(5, '0')}`.toLowerCase();

      return (
        obraNome.includes(termo) ||
        obraCodigo.includes(termo) ||
        solicitante.includes(termo) ||
        codigo.includes(termo)
      );
    });
  }, [busca, solicitacoes, status]);

  async function handleBaixarPdf(id) {
    try {
      const blob = await baixarPdfSolicitacaoCompra(id);
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 10000);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao gerar PDF');
    }
  }

  return (
    <div className="page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Solicitações de Compra</h1>
          <p className="page-subtitle">
            Acompanhe as solicitações de compra criadas no módulo e gere o PDF quando necessário.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-outline" onClick={carregarSolicitacoes} disabled={loading}>
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/solicitacoes-compra/nova')}>
            Nova solicitação
          </button>
        </div>
      </div>

      <div className="card">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Obra</label>
            <select className="input" value={obraId} onChange={(event) => setObraId(event.target.value)}>
              <option value="">Todas</option>
              {obras.map((obra) => (
                <option key={obra.id} value={obra.id}>
                  {obra.codigo ? `${obra.codigo} - ` : ''}
                  {obra.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Status</label>
            <select className="input" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Todos</option>
              <option value="ABERTA">Aberta</option>
              <option value="FINALIZADA">Finalizada</option>
            </select>
          </div>

          <div className="grid gap-2 md:col-span-2">
            <label className="text-sm font-medium">Busca</label>
            <input
              className="input"
              placeholder="Código, obra ou solicitante"
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Registros</h2>
          <span className="text-sm text-[var(--c-muted)]">
            {solicitacoesFiltradas.length} registro(s)
          </span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-[var(--c-muted)]">Carregando...</div>
        ) : solicitacoesFiltradas.length === 0 ? (
          <div className="py-8 text-center text-sm text-[var(--c-muted)]">
            Nenhuma solicitação de compra encontrada.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Obra</th>
                  <th>Solicitante</th>
                  <th>Itens</th>
                  <th>Necessário para</th>
                  <th>Criada em</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {solicitacoesFiltradas.map((solicitacao) => (
                  <tr key={solicitacao.id}>
                    <td className="font-mono text-sm font-semibold">
                      SC-{String(solicitacao.id).padStart(5, '0')}
                    </td>
                    <td>
                      <div className="grid gap-1">
                        <span className="font-medium">{solicitacao.obra?.nome || '-'}</span>
                        <span className="text-xs text-[var(--c-muted)]">{solicitacao.obra?.codigo || '-'}</span>
                      </div>
                    </td>
                    <td>{solicitacao.solicitante?.nome || '-'}</td>
                    <td>{(solicitacao.itens?.length || 0) + (solicitacao.itensManuais?.length || 0)}</td>
                    <td>{formatarData(solicitacao.necessario_para)}</td>
                    <td>{formatarData(solicitacao.createdAt)}</td>
                    <td>
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${classNameStatus(solicitacao.status)}`}>
                        {formatarStatus(solicitacao.status)}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => navigate(`/solicitacoes-compra/${solicitacao.id}`)}
                        >
                          Detalhes
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => handleBaixarPdf(solicitacao.id)}
                        >
                          PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
