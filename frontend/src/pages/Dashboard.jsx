import { useEffect, useState } from 'react';
import StatsCard from '../components/StatsCard';
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

  if (loading) {
    return <p>Carregando dashboard executivo...</p>;
  }

  if (erro) {
    return (
      <div className="page">
        <h1 className="page-title">Dashboard</h1>
        <p className="text-sm text-gray-600">{erro}</p>
      </div>
    );
  }

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

  const titulo = (isSuperadmin || isAdminGEO)
    ? 'Dashboard Executivo'
    : 'Dashboard do Setor';
  const subtitulo = (isSuperadmin || isAdminGEO)
    ? 'Visao geral das solicitacoes e indicadores principais.'
    : 'Visao do seu setor.';

  return (
    <div className="page">
      <div>
        <h1 className="page-title">{titulo}</h1>
        <p className="page-subtitle">
          {subtitulo}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatsCard title="Total de Solicitacoes" value={dados.total} />
        <StatsCard title="Pendentes" value={getTotalByStatus('PENDENTE')} />
        <StatsCard title="Em Analise" value={getTotalByStatus('EM_ANALISE')} />
        <StatsCard title="Concluidas" value={getTotalByStatus('CONCLUIDA')} />
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3">Solicitacoes por Status</h3>
        {dados.porStatus.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum dado disponivel</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {dados.porStatus.map(item => (
              <div key={item.status_global} className="flex justify-between text-sm">
                <span className="text-gray-600">{item.status_global}</span>
                <span className="font-medium">{item.total}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3">Solicitacoes por Area</h3>
        {dados.porArea.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum dado disponivel</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {dados.porArea.map(item => (
              <div key={item.area_responsavel} className="flex justify-between text-sm">
                <span className="text-gray-600">{item.area_responsavel}</span>
                <span className="font-medium">{item.total}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3">Valores por Status</h3>
        {dados.valoresPorStatus.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum valor registrado</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {dados.valoresPorStatus.map(item => (
              <div key={item.status_global} className="flex justify-between text-sm">
                <span className="text-gray-600">{item.status_global}</span>
                <span className="font-medium">
                  {Number(item.valor_total || 0).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL'
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3">SLA Medio (horas)</h3>
        {dados.slaMedio.length === 0 ? (
          <p className="text-sm text-gray-500">SLA ainda nao calculado</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {dados.slaMedio.map(item => (
              <div key={item.status_global} className="flex justify-between text-sm">
                <span className="text-gray-600">{item.status_global}</span>
                <span className="font-medium">
                  {(() => {
                    const totalMinutos = Number(item.sla_minutos || 0);
                    const horas = Math.floor(totalMinutos / 60);
                    const minutos = Math.round(totalMinutos % 60);
                    const mm = String(minutos).padStart(2, '0');
                    return `${horas}h ${mm}m`;
                  })()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
