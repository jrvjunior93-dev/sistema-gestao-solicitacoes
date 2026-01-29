import { useEffect, useState } from 'react';
import StatsCard from '../components/StatsCard';

const API_URL = 'http://localhost:3001';

export default function Dashboard() {
  const [dados, setDados] = useState({
    total: 0,
    porStatus: [],
    porArea: [],
    valoresPorStatus: [],
    slaMedio: []
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function carregarDashboard() {
      try {
        const res = await fetch(`${API_URL}/dashboard/executivo`);
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
      } finally {
        setLoading(false);
      }
    }

    carregarDashboard();
  }, []);

  if (loading) {
    return <p>Carregando dashboard executivo...</p>;
  }

  return (
    <div>
      <h1>Dashboard Executivo</h1>

      {/* ===================== */}
      {/* CARDS PRINCIPAIS */}
      {/* ===================== */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <StatsCard title="Total de Solicitações" value={dados.total} />
      </div>

      <hr />

      {/* ===================== */}
      {/* STATUS */}
      {/* ===================== */}
      <h3>Solicitações por Status</h3>

      {dados.porStatus.length === 0 ? (
        <p>Nenhum dado disponível</p>
      ) : (
        <ul>
          {dados.porStatus.map(item => (
            <li key={item.status_global}>
              {item.status_global}: {item.total}
            </li>
          ))}
        </ul>
      )}

      <hr />

      {/* ===================== */}
      {/* ÁREA */}
      {/* ===================== */}
      <h3>Solicitações por Área</h3>

      {dados.porArea.length === 0 ? (
        <p>Nenhum dado disponível</p>
      ) : (
        <ul>
          {dados.porArea.map(item => (
            <li key={item.area_responsavel}>
              {item.area_responsavel}: {item.total}
            </li>
          ))}
        </ul>
      )}

      <hr />

      {/* ===================== */}
      {/* VALORES */}
      {/* ===================== */}
      <h3>Valores por Status</h3>

      {dados.valoresPorStatus.length === 0 ? (
        <p>Nenhum valor registrado</p>
      ) : (
        <ul>
          {dados.valoresPorStatus.map(item => (
            <li key={item.status_global}>
              {item.status_global}:{' '}
              {Number(item.valor_total || 0).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL'
              })}
            </li>
          ))}
        </ul>
      )}

      <hr />

      {/* ===================== */}
      {/* SLA */}
      {/* ===================== */}
      <h3>SLA Médio (dias)</h3>

      {dados.slaMedio.length === 0 ? (
        <p>SLA ainda não calculado</p>
      ) : (
        <ul>
          {dados.slaMedio.map(item => (
            <li key={item.status_global}>
              {item.status_global}:{' '}
              {Number(item.sla_dias || 0).toFixed(1)} dias
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
