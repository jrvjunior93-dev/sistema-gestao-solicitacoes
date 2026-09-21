import { useEffect, useState } from 'react';
import { HiOutlineArrowPath, HiOutlineEye, HiOutlineXMark } from 'react-icons/hi2';
import { useAuth } from '../contexts/AuthContext';
import {
  estornarBaixaFinanceiraComposta,
  getBaixaFinanceiraComposta,
  getBaixasFinanceirasCompostas
} from '../services/financeiro';
import { getEmpresasGrupo } from '../services/empresasGrupo';
import { hasPermissao } from '../utils/acessoProduto';

const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateBr = (value) => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '-';

function Modal({ item, onClose, onReverse, canReverse, saving }) {
  const [reason, setReason] = useState('');
  return (
    <div className="modal-overlay finance-operation-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="baixa-composta-detalhe-titulo">
      <section className="modal-dialog finance-operation-modal finance-operation-modal--detail">
        <header className="modal-header">
          <div>
            <h2 id="baixa-composta-detalhe-titulo" className="modal-title">{item.codigo}</h2>
            <p className="modal-subtitle">
              {item.tipo === 'RECEBIMENTO' ? 'Recebimento' : 'Pagamento'} · {item.parceiro?.nome} · {item.empresa?.nome} · {dateBr(item.data_movimento)}
            </p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Fechar detalhes da baixa">
            <HiOutlineXMark className="h-5 w-5" />
          </button>
        </header>

        <div className="modal-body min-h-0 overflow-y-auto">
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="finance-operation-metric p-3">
              <small className="text-[var(--c-muted)]">Status</small>
              <strong className="block">{item.status}</strong>
            </div>
            <div className="finance-operation-metric p-3">
              <small className="text-[var(--c-muted)]">Principal</small>
              <strong className="block">{money(item.valor_principal)}</strong>
            </div>
            <div className="finance-operation-metric p-3">
              <small className="text-[var(--c-muted)]">Valor da operação</small>
              <strong className="block">{money(item.valor_quitacao)}</strong>
            </div>
          </div>

          <div className="space-y-3">
            {(item.componentes || []).map((component) => (
              <section key={component.id} className="finance-operation-panel p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <strong>Fonte {component.ordem} · {component.formaPagamento?.nome || component.forma_recebimento}</strong>
                  <strong>{money(component.valor_quitacao)}</strong>
                </div>
                <p className="mt-1 text-sm text-[var(--c-muted)]">
                  {component.contaBancaria?.nome || component.cartao?.nome || component.chequeTerceiro?.codigo || 'Sem instrumento financeiro'}
                </p>
                <div className="finance-operation-table-shell mt-3">
                  <table className="table min-w-[560px]">
                    <thead><tr><th>Título</th><th>Descrição</th><th className="text-right">Valor alocado</th></tr></thead>
                    <tbody>
                      {(component.alocacoes || []).map((allocation) => (
                        <tr key={allocation.id}>
                          <td>{allocation.titulo?.codigo}</td>
                          <td>{allocation.titulo?.descricao}</td>
                          <td className="text-right">{money(allocation.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>

          {canReverse && item.status === 'CONFIRMADO' ? (
            <div className="finance-operation-notice finance-operation-notice--danger mt-5 p-4">
              <label className="form-control">
                <span>Justificativa do estorno *</span>
                <textarea className="textarea" value={reason} onChange={(event) => setReason(event.target.value)} />
              </label>
              <button type="button" className="btn btn-outline mt-3" disabled={saving || !reason.trim()} onClick={() => onReverse(reason)}>
                Estornar grupo completo
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default function FinanceiroBaixasCompostas() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [filters, setFilters] = useState({ empresa_id: '', status: '' });
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const canReverse = hasPermissao(user, 'financeiro.baixas_compostas.estornar');

  async function load() {
    setLoading(true); setError('');
    try { setItems(await getBaixasFinanceirasCompostas(filters)); }
    catch (err) { setError(err.message || 'Erro ao carregar baixas compostas.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { getEmpresasGrupo({ ativo: true }).then((data) => setCompanies(Array.isArray(data) ? data : data?.items || [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [filters.empresa_id, filters.status]);

  async function open(id) {
    try { setSelected(await getBaixaFinanceiraComposta(id)); }
    catch (err) { setError(err.message); }
  }

  async function reverse(reason) {
    setSaving(true); setError('');
    try { await estornarBaixaFinanceiraComposta(selected.id, reason); setSelected(null); await load(); }
    catch (err) { setError(err.message || 'Erro ao estornar grupo.'); }
    finally { setSaving(false); }
  }

  return <div className="space-y-4">
    <header><p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Financeiro · Rastreabilidade</p><h1 className="text-2xl font-bold">Baixas com múltiplas fontes</h1><p className="text-sm text-[var(--c-muted)]">Consulte pagamentos e recebimentos combinados, suas fontes, alocações e estornos.</p></header>
    {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div> : null}
    <section className="card p-4"><div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_220px_auto]"><label className="form-control"><span>Empresa</span><select className="select" value={filters.empresa_id} onChange={(event) => setFilters((value) => ({ ...value, empresa_id: event.target.value }))}><option value="">Todas</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.nome}</option>)}</select></label><label className="form-control"><span>Status</span><select className="select" value={filters.status} onChange={(event) => setFilters((value) => ({ ...value, status: event.target.value }))}><option value="">Todos</option><option value="CONFIRMADO">Confirmados</option><option value="ESTORNADO">Estornados</option></select></label><button type="button" className="btn btn-outline self-end" disabled={loading} onClick={load}><HiOutlineArrowPath className={loading ? 'animate-spin' : ''} /> Atualizar</button></div></section>
    <section className="card overflow-hidden"><div className="overflow-x-auto"><table className="table min-w-[980px]"><thead><tr><th>Código</th><th>Data</th><th>Empresa</th><th>Operação</th><th>Cliente / Credor</th><th className="text-right">Valor</th><th>Status</th><th /></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.codigo}</strong></td><td>{dateBr(item.data_movimento)}</td><td>{item.empresa?.nome}</td><td>{item.tipo === 'RECEBIMENTO' ? 'Recebimento' : 'Pagamento'}</td><td>{item.parceiro?.nome}</td><td className="text-right font-semibold">{money(item.valor_quitacao)}</td><td>{item.status}</td><td><button type="button" className="btn btn-outline btn-sm" title="Ver composição" onClick={() => open(item.id)}><HiOutlineEye /></button></td></tr>)}</tbody></table></div>{!loading && !items.length ? <div className="p-8 text-center text-sm text-[var(--c-muted)]">Nenhuma baixa composta encontrada.</div> : null}</section>
    {selected ? <Modal item={selected} onClose={() => setSelected(null)} onReverse={reverse} canReverse={canReverse} saving={saving} /> : null}
  </div>;
}
