import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { baixarPdfSolicitacaoCompra, obterSolicitacaoCompra } from '../../../services/compras';

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
  return String(status || '-').replace(/_/g, ' ').toUpperCase();
}

export default function SolicitacaoCompraDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [solicitacao, setSolicitacao] = useState(null);
  const [loading, setLoading] = useState(false);
  const [baixando, setBaixando] = useState(false);

  async function carregar() {
    try {
      setLoading(true);
      const data = await obterSolicitacaoCompra(id);
      setSolicitacao(data || null);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao carregar solicitação de compra');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [id]);

  const itensCombinados = useMemo(() => {
    const itens = (solicitacao?.itens || []).map((item) => ({
      tipo: 'CADASTRADO',
      nome: item.insumo?.nome || '-',
      unidade: item.unidade?.sigla || '-',
      quantidade: item.quantidade,
      especificacao: item.especificacao || '-',
      apropriacao: item.apropriacao?.codigo || '-',
      necessario_para: item.necessario_para,
      link_produto: item.link_produto || ''
    }));

    const manuais = (solicitacao?.itensManuais || []).map((item) => ({
      tipo: 'MANUAL',
      nome: item.nome_manual || '-',
      unidade: item.unidade_sigla_manual || '-',
      quantidade: item.quantidade,
      especificacao: item.especificacao || '-',
      apropriacao: item.apropriacao?.codigo || '-',
      necessario_para: item.necessario_para,
      link_produto: item.link_produto || ''
    }));

    return [...itens, ...manuais];
  }, [solicitacao]);

  async function handleAbrirPdf() {
    try {
      setBaixando(true);
      const blob = await baixarPdfSolicitacaoCompra(id);
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => window.URL.revokeObjectURL(url), 10000);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao abrir PDF');
    } finally {
      setBaixando(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="card py-8 text-center text-sm text-[var(--c-muted)]">Carregando...</div>
      </div>
    );
  }

  if (!solicitacao) {
    return (
      <div className="page">
        <div className="card py-8 text-center text-sm text-[var(--c-muted)]">Solicitação de compra não encontrada.</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Detalhe da Solicitação de Compra</h1>
          <p className="page-subtitle">SC-{String(solicitacao.id).padStart(5, '0')} · acompanhamento completo do módulo compras.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-outline" onClick={() => navigate('/solicitacoes-compra')}>
            Voltar
          </button>
          <button type="button" className="btn btn-primary" onClick={handleAbrirPdf} disabled={baixando}>
            {baixando ? 'Abrindo PDF...' : 'Abrir PDF'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">Dados gerais</h2>
          </div>
          <div className="grid gap-4 text-sm">
            <div>
              <div className="text-[var(--c-muted)]">Status</div>
              <div className="font-semibold">{formatarStatus(solicitacao.status)}</div>
            </div>
            <div>
              <div className="text-[var(--c-muted)]">Obra</div>
              <div className="font-semibold">{solicitacao.obra?.nome || '-'}</div>
              <div className="text-[var(--c-muted)]">{solicitacao.obra?.codigo || '-'}</div>
            </div>
            <div>
              <div className="text-[var(--c-muted)]">Solicitante</div>
              <div className="font-semibold">{solicitacao.solicitante?.nome || '-'}</div>
            </div>
            <div>
              <div className="text-[var(--c-muted)]">Necessário para</div>
              <div className="font-semibold">{formatarData(solicitacao.necessario_para)}</div>
            </div>
            <div>
              <div className="text-[var(--c-muted)]">Criada em</div>
              <div className="font-semibold">{formatarData(solicitacao.createdAt)}</div>
            </div>
            <div>
              <div className="text-[var(--c-muted)]">Solicitação principal</div>
              {solicitacao.solicitacaoPrincipal ? (
                <button
                  type="button"
                  className="text-left font-semibold text-blue-600 hover:underline"
                  onClick={() => navigate(`/solicitacoes/${solicitacao.solicitacaoPrincipal.id}`)}
                >
                  {solicitacao.solicitacaoPrincipal.codigo || `ID ${solicitacao.solicitacaoPrincipal.id}`}
                </button>
              ) : (
                <div className="font-semibold">-</div>
              )}
            </div>
            <div>
              <div className="text-[var(--c-muted)]">Observações</div>
              <div className="whitespace-pre-wrap">{solicitacao.observacoes || '-'}</div>
            </div>
            <div>
              <div className="text-[var(--c-muted)]">Link geral</div>
              <div className="break-all">{solicitacao.link_geral || '-'}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Itens</h2>
            <span className="text-sm text-[var(--c-muted)]">{itensCombinados.length} item(ns)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Tipo</th>
                  <th>Insumo</th>
                  <th>Unidade</th>
                  <th>Quantidade</th>
                  <th>Especificação</th>
                  <th>Apropriação</th>
                  <th>Necessário para</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                {itensCombinados.map((item, index) => (
                  <tr key={`${item.tipo}-${index}`}>
                    <td>{index + 1}</td>
                    <td>
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${item.tipo === 'MANUAL' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
                        {item.tipo}
                      </span>
                    </td>
                    <td className={item.tipo === 'MANUAL' ? 'font-semibold text-red-700' : ''}>{item.nome}</td>
                    <td>{item.unidade}</td>
                    <td>{item.quantidade}</td>
                    <td>{item.especificacao}</td>
                    <td>{item.apropriacao}</td>
                    <td>{formatarData(item.necessario_para)}</td>
                    <td className="max-w-[220px] break-all">{item.link_produto || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
