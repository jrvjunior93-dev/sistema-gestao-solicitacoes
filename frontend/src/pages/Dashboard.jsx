import { useEffect, useState, useMemo } from 'react';
import { API_URL, authHeaders } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.perfil === 'ADMIN';
  const isSuperadmin = user?.perfil === 'SUPERADMIN';
  const isAdminGEO =
    isAdmin && (user?.setor?.codigo === 'GEO' || user?.area === 'GEO');

  const [dados, setDados] = useState({
    total: 0,
    porStatus: [],
    porArea: [],
    valoresPorStatus: [],
    slaMedio: []
  });

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    async function carregarDashboard() {
      try {
        const res = await fetch(`${API_URL}/dashboard/executivo`, {
          headers: authHeaders()
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || 'Acesso negado');
        }
        const json = await res.json();

        setDados({
          total: json.total ?? 0,
          porStatus: Array.isArray(json.porStatus) ? json.porStatus : [],
          porArea: Array.isArray(json.porArea) ? json.porArea : [],
          valoresPorStatus: Array.isArray(json.valoresPorStatus)
            ? json.valoresPorStatus
            : [],
          slaMedio: Array.isArray(json.slaMedio) ? json.slaMedio : []
        });
      } catch (error) {
        console.error('Erro ao carregar dashboard', error);
        setErro(error?.message || 'Erro ao carregar dashboard');
      } finally {
        setLoading(false);
      }
    }

    carregarDashboard();
  }, []);

  const normalizeStatus = value => {
    if (!value) return '';
    return String(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_')
      .toUpperCase();
  };

  const getTotalByStatus = status => {
    const target = normalizeStatus(status);
    const match = dados.porStatus.find(
      s => normalizeStatus(s.status_global) === target
    );
    return match?.total || 0;
  };

  const valorTotal = useMemo(
    () => dados.valoresPorStatus.reduce(
      (acc, item) => acc + Number(item.valor_total || 0),
      0
    ),
    [dados.valoresPorStatus]
  );

  const maiorStatus = useMemo(() => {
    return dados.porStatus.reduce(
      (max, item) => Math.max(max, Number(item.total || 0)),
      0
    );
  }, [dados.porStatus]);

  const maiorArea = useMemo(() => {
    return dados.porArea.reduce(
      (max, item) => Math.max(max, Number(item.total || 0)),
      0
    );
  }, [dados.porArea]);

  const cores = ['#6366f1', '#14b8a6', '#f59e0b', '#f472b6', '#0ea5e9'];

  const titulo = (isSuperadmin || isAdminGEO)
    ? 'Dashboard Executivo'
    : 'Dashboard do Setor';
  const subtitulo = (isSuperadmin || isAdminGEO)
    ? 'Visao geral das solicitacoes e indicadores principais.'
    : 'Visao do seu setor.';

  return (
    <div className="page dashboard">
      {loading ? (
        <p className="text-sm text-gray-600">Carregando dashboard executivo...</p>
      ) : erro ? (
        <div className="card">
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-gray-600">{erro}</p>
        </div>
      ) : (
        <>
          <section className="dash-hero">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 relative z-10">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-300">
                  {isSuperadmin || isAdminGEO ? 'Visao Global' : 'Visao Setor'}
                </p>
                <h1 className="text-2xl font-bold text-white leading-tight">
                  {titulo}
                </h1>
                <p className="text-sm text-slate-200/80">{subtitulo}</p>
              </div>
              <div className="chip">
                <span className="chip-dot" style={{ background: '#22c55e' }} />
                Dados em tempo real
              </div>
            </div>

            <div className="dash-hero-grid relative z-10">
              <div className="glass flex items-center gap-4">
                <div className="stat-ring">
                  <span>{dados.total}</span>
                </div>
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-wide text-slate-600">Solicitações</p>
                  <h3 className="text-lg font-semibold text-slate-900">Volume total</h3>
                  <p className="text-sm text-slate-600">
                    Pendentes: <strong>{getTotalByStatus('PENDENTE')}</strong> · Em analise:{' '}
                    <strong>{getTotalByStatus('EM_ANALISE')}</strong>
                  </p>
                </div>
              </div>

              <div className="glass metric-grid">
                {[
                  { label: 'Pendentes', value: getTotalByStatus('PENDENTE'), color: cores[0] },
                  { label: 'Em Análise', value: getTotalByStatus('EM_ANALISE'), color: cores[1] },
                  { label: 'Concluídas', value: getTotalByStatus('CONCLUIDA'), color: cores[2] },
                  { label: 'Valor Total', value: valorTotal, color: cores[3], isMoney: true }
                ].map(item => (
                  <div key={item.label} className="value-block">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
                      <strong className="text-slate-900">
                        {item.isMoney
                          ? item.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                          : item.value}
                      </strong>
                    </div>
                    <span className="chip-dot" style={{ background: item.color }} />
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="two-col">
            <div className="glass">
              <div className="value-block mb-3">
                <h3 className="font-semibold text-slate-900">Solicitações por Status</h3>
                <span className="pill">Equilibrio</span>
              </div>
              {dados.porStatus.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum dado disponivel</p>
              ) : (
                <div className="space-y-3">
                  {dados.porStatus.map((item, idx) => {
                    const total = Number(item.total || 0);
                    const perc = maiorStatus ? (total / maiorStatus) * 100 : 0;
                    return (
                      <div key={item.status_global} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-600">{item.status_global}</span>
                          <span className="font-semibold text-slate-900">{total}</span>
                        </div>
                        <div className="progress-track">
                          <div
                            className="progress-fill"
                            style={{
                              width: `${perc}%`,
                              background: `linear-gradient(90deg, ${cores[idx % cores.length]}, ${cores[(idx + 1) % cores.length]})`
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="glass">
              <div className="value-block mb-3">
                <h3 className="font-semibold text-slate-900">Solicitações por Área</h3>
                <span className="pill">Mapa de carga</span>
              </div>
              {dados.porArea.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum dado disponivel</p>
              ) : (
                <div className="space-y-3">
                  {dados.porArea.map((item, idx) => {
                    const total = Number(item.total || 0);
                    const perc = maiorArea ? (total / maiorArea) * 100 : 0;
                    return (
                      <div key={item.area_responsavel} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-600">{item.area_responsavel}</span>
                          <span className="font-semibold text-slate-900">{total}</span>
                        </div>
                        <div className="progress-track">
                          <div
                            className="progress-fill"
                            style={{
                              width: `${perc}%`,
                              background: `linear-gradient(90deg, ${cores[(idx + 1) % cores.length]}, ${cores[(idx + 2) % cores.length]})`
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="two-col">
            <div className="glass">
              <div className="value-block mb-3">
                <h3 className="font-semibold text-slate-900">Valores por Status</h3>
                <span className="pill">Financeiro</span>
              </div>
              {dados.valoresPorStatus.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum valor registrado</p>
              ) : (
                <div className="space-y-3">
                  {dados.valoresPorStatus.map((item, idx) => (
                    <div key={item.status_global} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">{item.status_global}</span>
                        <span className="font-semibold text-slate-900">
                          {Number(item.valor_total || 0).toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL'
                          })}
                        </span>
                      </div>
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{
                            width: '100%',
                            background: `linear-gradient(90deg, ${cores[idx % cores.length]}, ${cores[(idx + 2) % cores.length]})`
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="glass">
              <div className="value-block mb-3">
                <h3 className="font-semibold text-slate-900">SLA Médio</h3>
                <span className="pill">Tempo</span>
              </div>
              {dados.slaMedio.length === 0 ? (
                <p className="text-sm text-slate-500">SLA ainda nao calculado</p>
              ) : (
                <div className="space-y-3">
                  {dados.slaMedio.map((item, idx) => {
                    const totalMinutos = Number(item.sla_minutos || 0);
                    const horas = Math.floor(totalMinutos / 60);
                    const minutos = Math.round(totalMinutos % 60);
                    const mm = String(minutos).padStart(2, '0');
                    return (
                      <div key={item.status_global} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-600">{item.status_global}</span>
                          <span className="font-semibold text-slate-900">
                            {horas}h {mm}m
                          </span>
                        </div>
                        <div className="progress-track">
                          <div
                            className="progress-fill"
                            style={{
                              width: `${Math.min(100, (totalMinutos / 60) || 0)}%`,
                              background: `linear-gradient(90deg, ${cores[(idx + 3) % cores.length]}, ${cores[idx % cores.length]})`
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
