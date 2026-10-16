import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { canAccessRhDpDashboard, hasPermissao } from '../utils/acessoProduto';
import { useWorkspaceState } from '../navigation/WorkspaceContext';
import { getRhTitulosEnviados } from '../services/rhDp';
import { Pagina, PageHeader, BlocoConteudo, TabelaPadrao } from '../components/padrao';
import StatusBadge from '../components/StatusBadge';
import { RECEBIMENTOS_DP, rotuloRecebimentoDp } from '../utils/recebimentoDp';
import PaginacaoConsulta from '../components/padrao/PaginacaoConsulta';

const INICIAL = { competencia: '', empresa_id: '', obra_id: '', status_titulo: '', status_fila: '', recebimento_dp: '', q: '', somente_suspeitos: false };
const moeda = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const data = d => d ? new Date(d).toLocaleString('pt-BR') : '—';
export default function RhDpTitulosEnviados() {
  const { user } = useAuth();
  const permitido = canAccessRhDpDashboard(user) && hasPermissao(user, 'rh_dp.relatorios.visualizar');
  const [filtros, setFiltros] = useWorkspaceState('rh-envios:filtros', INICIAL);
  const [aplicados, setAplicados] = useWorkspaceState('rh-envios:aplicados', INICIAL);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [recarregar, setRecarregar] = useState(0);
  const [pagina, setPagina] = useWorkspaceState('rh-envios:pagina', 1);
  useEffect(() => {
    let ativo = true;
    setResultado(null); setErro('');
    if (!permitido) return () => { ativo = false; };
    setOcupado(true);
    getRhTitulosEnviados({ ...Object.fromEntries(Object.entries(aplicados).filter(([, v]) => v !== '' && v !== false)), pagina, limite: 50 })
      .then(r => { if (ativo) setResultado(r); })
      .catch(e => { if (ativo) setErro(e.message || 'Não foi possível consultar os envios.'); })
      .finally(() => { if (ativo) setOcupado(false); });
    return () => { ativo = false; };
  }, [aplicados, permitido, recarregar, pagina]);
  if (!permitido) return <Pagina><PageHeader titulo="Títulos enviados pelo DP" /><p role="alert">Sem permissão para relatórios do DP.</p></Pagina>;
  const mudar = (key, value) => setFiltros(atual => ({ ...atual, [key]: value }));
  return <Pagina>
    <PageHeader titulo="Títulos enviados pelo DP" contagem={ocupado ? 'Consultando...' : `${resultado?.total || 0} título(s)`}
      descricao="Status financeiro, situação atual e registros da fila. Somente consulta."
      secundarias={[{ rotulo: 'Atualizar', onClick: () => setRecarregar(v => v + 1), desabilitada: ocupado }]} />
    <BlocoConteudo titulo="Filtros">
      <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); setPagina(1); setAplicados({ ...filtros }); }}>
        <label className="text-xs">Competência<input aria-label="Competência" className="input input-sm block" type="month" value={filtros.competencia} onChange={e => mudar('competencia', e.target.value)} /></label>
        <label className="text-xs">Empresa do colaborador<select aria-label="Empresa do colaborador" className="input input-sm block max-w-64" value={filtros.empresa_id} onChange={e => mudar('empresa_id', e.target.value)}>
          <option value="">Todas</option>{(resultado?.filtros?.empresas || []).map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          {filtros.empresa_id && !resultado?.filtros?.empresas?.some(o => String(o.id) === String(filtros.empresa_id)) && <option value={filtros.empresa_id}>Empresa #{filtros.empresa_id}</option>}
        </select></label>
        <label className="text-xs">Obra / centro de custo<select aria-label="Obra / centro de custo" className="input input-sm block max-w-64" value={filtros.obra_id} onChange={e => mudar('obra_id', e.target.value)}>
          <option value="">Todas</option>{(resultado?.filtros?.obras || []).map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          {filtros.obra_id && !resultado?.filtros?.obras?.some(o => String(o.id) === String(filtros.obra_id)) && <option value={filtros.obra_id}>Local #{filtros.obra_id}</option>}
        </select></label>
        <label className="text-xs">Recebimento DP<select aria-label="Recebimento DP" className="input input-sm block" value={filtros.recebimento_dp} onChange={e => mudar('recebimento_dp', e.target.value)}>
          <option value="">Todos</option>{RECEBIMENTOS_DP.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select></label>
        <label className="text-xs">Status do título<select aria-label="Status do título" className="input input-sm block" value={filtros.status_titulo} onChange={e => mudar('status_titulo', e.target.value)}>
          <option value="">Todos</option>{['PREVISAO', 'ABERTO', 'PARCIAL', 'QUITADO', 'CANCELADO', 'ESTORNADO', 'RENEGOCIADO'].map(v => <option key={v}>{v}</option>)}
        </select></label>
        <label className="text-xs">Situação atual da fila<select aria-label="Situação atual da fila" className="input input-sm block" value={filtros.status_fila} onChange={e => mudar('status_fila', e.target.value)}>
          <option value="">Todas</option>{['PENDENTE', 'EM_EDICAO', 'DIVERGENTE', 'NAO_PAGO', 'BAIXADO', 'RESOLVIDO', 'CANCELADO', 'ESTORNADO'].map(v => <option key={v}>{v}</option>)}
        </select></label>
        <label className="text-xs">Título / colaborador<input aria-label="Título / colaborador" className="input input-sm block" value={filtros.q} onChange={e => mudar('q', e.target.value)} /></label>
        <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={filtros.somente_suspeitos} onChange={e => mudar('somente_suspeitos', e.target.checked)} />Somente possíveis duplicidades</label>
        <button type="submit" className="btn btn-outline btn-sm" disabled={ocupado}>Aplicar filtros</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={ocupado} onClick={() => { setPagina(1); setFiltros(INICIAL); setAplicados(INICIAL); }}>Limpar</button>
      </form>
    </BlocoConteudo>
    {erro && <p role="alert" className="text-[var(--sem-danger)]">{erro}</p>}
    <BlocoConteudo titulo="Envios à fila" descricao="Possível duplicidade: títulos de salário ativos distintos com mesmo colaborador, competência, empresa, percentual e valor. É um alerta para conferência, não confirmação de pagamento duplicado.">
      <PaginacaoConsulta pagina={resultado?.pagina || pagina} paginas={resultado?.total_paginas || 1} total={resultado?.total || 0} ocupado={ocupado} aoMudar={setPagina} />
      <p role="status" className="mb-2 text-sm text-[var(--c-muted)]">{resultado?.suspeitos || 0} título(s) com alerta. Reenvios do mesmo título são histórico, não novos títulos.</p>
      <TabelaPadrao itens={resultado?.data || []} carregando={ocupado} storageKey="tabela:rh-dp-titulos-enviados" chaveWorkspace="rh-envios:tabela" consultaWorkspace={JSON.stringify(aplicados)}
        vazio={ocupado ? 'Consultando títulos enviados...' : 'Nenhum título enviado encontrado neste recorte.'} rotuloRolagem="Títulos enviados pelo DP"
        colunas={[
          { id: 'codigo', titulo: 'Título', tipo: 'identidade', noCard: 'titulo', render: t => <><strong>{t.codigo || `#${t.id}`}</strong><div className="text-xs">{t.descricao}</div></> },
          { id: 'solicitacao', titulo: 'Solicitação DP', render: t => t.solicitacao_codigo || (t.solicitacao_id ? `Solicitação RH #${t.solicitacao_id}` : 'Fechamento / Ticket') },
          { id: 'competencia', titulo: 'Competência', render: t => t.competencia || '—' },
          { id: 'credor', titulo: 'Colaborador / credor', render: t => t.credor },
          { id: 'empresa', titulo: 'Empresa do colaborador', render: t => t.empresa },
          { id: 'obra', titulo: 'Obra / centro de custo', render: t => t.obra },
          { id: 'recebimento', titulo: 'Recebimento DP', render: t => rotuloRecebimentoDp(t.recebimento_dp) },
          { id: 'valor', titulo: 'Valor do título', tipo: 'valor', render: t => moeda(t.valor) },
          { id: 'baixado', titulo: 'Baixado', tipo: 'valor', render: t => moeda(t.baixado) },
          { id: 'saldo', titulo: 'Saldo', tipo: 'valor', render: t => moeda(t.saldo) },
          { id: 'status_titulo', titulo: 'Status do título', tipo: 'status', render: t => <StatusBadge status={t.status_titulo} /> },
          { id: 'status_fila', titulo: 'Situação atual da fila', tipo: 'status', render: t => <StatusBadge status={t.status_fila} /> },
          { id: 'ultimo_envio', titulo: 'Última entrada na fila', render: t => data(t.ultimo_envio) },
          { id: 'alerta', titulo: 'Conferência', render: t => t.possiveis_duplicados.length ? <span className="text-[var(--sem-warning)]">Possível duplicidade com {(t.duplicados_codigos || t.possiveis_duplicados.map(id => '#' + id)).join(', ')}</span> : 'Sem alerta' },
          { id: 'historico', titulo: 'Registros da fila', render: t => <details><summary className="cursor-pointer">{t.envios.length} registro(s)</summary><ul className="text-xs">{t.envios.map(e => <li key={e.id}>Fila #{e.id} · {data(e.enviado_em)} · {e.status} · {moeda(e.valor_previsto)}</li>)}</ul></details> }
        ]} />
    </BlocoConteudo>
  </Pagina>;
}
