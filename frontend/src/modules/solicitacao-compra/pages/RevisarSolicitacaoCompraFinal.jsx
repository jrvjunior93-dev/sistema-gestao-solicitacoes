import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { baixarPdfSolicitacaoCompra } from '../../../services/compras';

export default function RevisarSolicitacaoCompraFinal() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [baixando, setBaixando] = useState(false);
  const resultado = location.state?.resultado || null;
  const resumo = location.state?.resumo || null;

  const codigo = useMemo(() => resultado?.codigo || `SC-${String(id || '').padStart(5, '0')}`, [id, resultado]);

  async function handleAbrirPdf() {
    try {
      setBaixando(true);
      const blob = await baixarPdfSolicitacaoCompra(id);
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 10000);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao abrir PDF');
    } finally {
      setBaixando(false);
    }
  }

  return (
    <div className="page">
      <div>
        <h1 className="page-title">Solicitação de Compra Criada</h1>
        <p className="page-subtitle">
          O registro foi criado no módulo compras e já gerou uma solicitação no fluxo principal.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">Confirmação</h2>
          </div>

          <div className="grid gap-4 text-sm">
            <div>
              <div className="text-[var(--c-muted)]">Código principal</div>
              <div className="font-semibold">{codigo}</div>
            </div>
            <div>
              <div className="text-[var(--c-muted)]">ID da solicitação de compra</div>
              <div className="font-semibold">{resultado?.id || id}</div>
            </div>
            <div>
              <div className="text-[var(--c-muted)]">Solicitação principal vinculada</div>
              <div className="font-semibold">{resultado?.solicitacao_principal_id || '-'}</div>
            </div>
            <div>
              <div className="text-[var(--c-muted)]">Quantidade de itens</div>
              <div className="font-semibold">{resultado?.quantidade_itens || resumo?.itens?.length || 0}</div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={handleAbrirPdf} disabled={baixando}>
              {baixando ? 'Abrindo PDF...' : 'Abrir PDF'}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => navigate('/solicitacoes')}>
              Ir para solicitações
            </button>
            <button type="button" className="btn btn-outline" onClick={() => navigate('/solicitacoes-compra/nova')}>
              Nova solicitação
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">Resumo enviado</h2>
          </div>

          {resumo ? (
            <div className="grid gap-4 text-sm">
              <div>
                <div className="text-[var(--c-muted)]">Obra</div>
                <div className="font-medium">{resumo.obra_nome || '-'}</div>
              </div>
              <div>
                <div className="text-[var(--c-muted)]">Solicitante</div>
                <div className="font-medium">{resumo.solicitante_nome || '-'}</div>
              </div>
              <div>
                <div className="text-[var(--c-muted)]">Itens</div>
                <ul className="grid gap-2">
                  {resumo.itens?.map((item, index) => (
                    <li key={`${item.insumo_id}-${index}`} className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2">
                      <div className="font-medium">{item.insumo_nome}</div>
                      <div className="text-[var(--c-muted)]">
                        {item.quantidade} {item.unidade_sigla || ''} · {item.apropriacao_label || '-'}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="text-sm text-[var(--c-muted)]">
              Resumo não disponível nesta navegação. O PDF pode ser aberto normalmente.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
