import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DateInputBR from '../components/DateInputBR';
import { Avisos, BlocoConteudo, Pagina, PageHeader, StatGrid, StatTile, useAvisos } from '../components/padrao';
import { getDistribuicaoCentrosCusto } from '../services/financeiro';

function moeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dataHora(valor) {
  if (!valor) return '—';
  return new Date(valor).toLocaleString('pt-BR');
}

const FILTROS_INICIAIS = { centro_custo_id: '', obra_id: '', data_inicio: '', data_fim: '' };

export default function FinanceiroDistribuicaoCentrosCusto() {
  const [dados, setDados] = useState({ linhas: [], filtros: { centros_custo: [], obras: [] }, resumo: {} });
  const [rascunho, setRascunho] = useState(FILTROS_INICIAIS);
  const [filtros, setFiltros] = useState(FILTROS_INICIAIS);
  const [loading, setLoading] = useState(true);
  const { avisos, avisar, fechar } = useAvisos();

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const resposta = await getDistribuicaoCentrosCusto(filtros);
      setDados({
        linhas: Array.isArray(resposta?.linhas) ? resposta.linhas : [],
        filtros: resposta?.filtros || { centros_custo: [], obras: [] },
        resumo: resposta?.resumo || {}
      });
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao carregar a distribuição dos centros de custo.');
    } finally {
      setLoading(false);
    }
  }, [avisar, filtros]);

  useEffect(() => { void carregar(); }, [carregar]);

  const linhas = useMemo(() => dados.linhas || [], [dados.linhas]);

  return (
    <Pagina>
      <PageHeader
        titulo="Distribuição gerencial dos Centros de Custo"
        contagem={loading ? 'Carregando…' : `${linhas.length} linha(s)`}
        descricao="Visão gerencial por obra; os valores abaixo não compõem o custo real das obras."
        voltar={{ to: '/financeiro/relatorios/centros-custo', title: 'Voltar ao resultado dos centros de custo' }}
      />
      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo titulo="Filtros" variante="primario" cor="var(--module-financeiro)">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="form-group">
            <span className="form-label">Centro de custo</span>
            <select className="input input-sm" value={rascunho.centro_custo_id} onChange={(e) => setRascunho((atual) => ({ ...atual, centro_custo_id: e.target.value }))}>
              <option value="">Todos</option>
              {(dados.filtros?.centros_custo || []).map((item) => <option key={item.id} value={item.id}>{item.codigo} · {item.nome}</option>)}
            </select>
          </label>
          <label className="form-group">
            <span className="form-label">Obra de referência</span>
            <select className="input input-sm" value={rascunho.obra_id} onChange={(e) => setRascunho((atual) => ({ ...atual, obra_id: e.target.value }))}>
              <option value="">Todas as classificações</option>
              <option value="TODAS">TODAS (sem distribuição)</option>
              {(dados.filtros?.obras || []).map((item) => <option key={item.id} value={item.id}>{item.codigo} · {item.nome}</option>)}
            </select>
          </label>
          <label className="form-group">
            <span className="form-label">Período inicial</span>
            <DateInputBR className="input input-sm" value={rascunho.data_inicio} onChange={(event) => setRascunho((atual) => ({ ...atual, data_inicio: event.target.value }))} />
          </label>
          <label className="form-group">
            <span className="form-label">Período final</span>
            <DateInputBR className="input input-sm" value={rascunho.data_fim} onChange={(event) => setRascunho((atual) => ({ ...atual, data_fim: event.target.value }))} />
          </label>
        </div>
        <div className="app-actionbar mt-3">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setFiltros(rascunho)}>Aplicar filtros</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => { setRascunho(FILTROS_INICIAIS); setFiltros(FILTROS_INICIAIS); }}>Limpar filtros</button>
          <Link className="btn btn-outline btn-sm" to="/financeiro/relatorios/centros-custo">Resultado dos centros</Link>
        </div>
      </BlocoConteudo>

      <BlocoConteudo titulo="Consolidado gerencial" descricao="Somente classificações registradas nas solicitações de centro de custo.">
        <StatGrid colunas={5}>
          <StatTile label="Valor classificado" valor={moeda(dados.resumo?.valor_total)} />
          <StatTile label="Solicitações" valor={String(dados.resumo?.solicitacoes || 0)} />
          <StatTile label="Centros de custo" valor={String(dados.resumo?.centros_custo || 0)} />
          <StatTile label="Obras referenciadas" valor={String(dados.resumo?.obras || 0)} />
          <StatTile label="Classificações TODAS" valor={String(dados.resumo?.registros_todas || 0)} />
        </StatGrid>
      </BlocoConteudo>

      <BlocoConteudo titulo="Lançamentos" contagem={`${linhas.length} linha(s)`}>
        {loading ? (
          <div className="app-empty-card">Carregando relatório...</div>
        ) : linhas.length === 0 ? (
          <div className="app-empty-card">Nenhuma distribuição gerencial encontrada no recorte.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="app-table min-w-[1080px]">
              <thead><tr><th>Data</th><th>Centro de custo</th><th>Obra / classificação</th><th>Solicitação</th><th>Tipo / subtipo</th><th>Critério</th><th>%</th><th>Valor</th></tr></thead>
              <tbody>
                {linhas.map((linha) => (
                  <tr key={linha.id}>
                    <td>{dataHora(linha.solicitacao?.createdAt)}</td>
                    <td><strong>{linha.centro_custo?.codigo || '—'}</strong><br /><span className="text-xs text-[var(--c-muted)]">{linha.centro_custo?.nome}</span></td>
                    <td>{linha.abrangencia === 'TODAS' ? <strong>TODAS</strong> : <><strong>{linha.obra?.codigo || '—'}</strong><br /><span className="text-xs text-[var(--c-muted)]">{linha.obra?.nome}</span></>}</td>
                    <td><Link className="app-link" to={`/solicitacoes/${linha.solicitacao?.id}`}>{linha.solicitacao?.codigo || linha.solicitacao?.id}</Link><br /><span className="text-xs text-[var(--c-muted)]">{linha.solicitacao?.descricao || 'Sem título'}</span></td>
                    <td>{linha.solicitacao?.tipo?.nome || '—'}{linha.solicitacao?.tipoSubSolicitacao?.nome ? <><br /><span className="text-xs text-[var(--c-muted)]">{linha.solicitacao.tipoSubSolicitacao.nome}</span></> : null}</td>
                    <td>{linha.criterio}</td>
                    <td>{linha.abrangencia === 'TODAS' ? '—' : `${Number(linha.percentual || 0).toLocaleString('pt-BR', { maximumFractionDigits: 6 })}%`}</td>
                    <td><strong>{moeda(linha.valor_distribuido)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </BlocoConteudo>
    </Pagina>
  );
}
