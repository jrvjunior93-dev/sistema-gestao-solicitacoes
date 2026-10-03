import Badge from '../ui/Badge';

const STATUS = {
  ATIVO: { label: 'Ativo · parcialmente medido', variant: 'info' },
  TOTALMENTE_MEDIDO: { label: 'Totalmente medido', variant: 'warning' },
  CONCLUIDO: { label: 'Concluído', variant: 'success' },
  RESCINDIDO: { label: 'Rescindido', variant: 'danger' }
};

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function date(value) {
  if (!value) return '-';
  const raw = String(value).slice(0, 10);
  const [year, month, day] = raw.split('-');
  return year && month && day ? `${day}/${month}/${year}` : raw;
}

function Table({ columns, rows, empty }) {
  return (
    <div className="app-table-shell overflow-x-auto">
      <table className="app-tabela w-full">
        <thead>
          <tr>{columns.map(column => <th key={column.key}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="text-center app-note py-4">{empty}</td></tr>
          ) : rows.map((row, index) => (
            <tr key={row.id || index}>
              {columns.map(column => <td key={column.key}>{column.render ? column.render(row) : (row[column.key] ?? '-')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ContratoDetalheOperacional({ data, loading, error, onClose }) {
  if (loading) return <p className="app-note">Carregando movimentações do contrato...</p>;
  if (error) return <p className="text-[var(--c-danger)]">{error}</p>;
  if (!data) return null;

  const statusInfo = STATUS[data.status_operacional] || {
    label: data.status_operacional || 'Sem status',
    variant: 'muted'
  };
  const medicoes = Array.isArray(data.medicoes) ? data.medicoes : [];
  const solicitacoes = Array.isArray(data.solicitacoes) ? data.solicitacoes : [];
  const titulos = Array.isArray(data.titulos) ? data.titulos : [];
  const alertas = Array.isArray(data.alertas) ? data.alertas : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <strong>{data.contrato?.codigo}</strong>
            <Badge variant={statusInfo.variant} size="sm">{statusInfo.label}</Badge>
            <Badge variant="muted" size="sm">{data.fluxo === 'NOVO' ? 'Fluxo novo' : 'Legado'}</Badge>
          </div>
          <p className="app-note mt-1">
            {data.contrato?.obra?.codigo ? `${data.contrato.obra.codigo} · ` : ''}
            {data.contrato?.obra?.nome || 'Sem obra'}
          </p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Fechar detalhe</button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ['Contratado', data.contratado],
          ['Medido', data.medido],
          ['Movimentado', data.movimentado],
          ['Saldo contratual', data.saldo_contratual],
          ['Saldo financeiro', data.saldo_financeiro],
          ['Aditivos', data.valor_aditivos]
        ].map(([label, value]) => (
          <div key={label} className="border border-[var(--c-border)] rounded-md px-3 py-2 bg-[var(--c-surface)]">
            <span className="form-label block">{label}</span>
            <strong className="tabular-nums">{money(value)}</strong>
          </div>
        ))}
      </div>

      {data.rescisao && (
        <div className="border-l-4 border-[var(--c-danger)] bg-[var(--c-surface)] px-3 py-2 text-sm">
          <strong>Rescisão registrada em {date(data.rescisao.rescindido_em)}</strong>
          <div>Saldo contratual cancelado: {money(data.saldo_contratual_cancelado)}</div>
          <div>{data.rescisao.motivo || 'Sem motivo registrado.'}</div>
        </div>
      )}

      {alertas.length > 0 && (
        <div className="border border-[var(--c-warning)] rounded-md px-3 py-2">
          <strong className="text-sm">Pontos para conferência</strong>
          <ul className="list-disc pl-5 mt-1 text-sm">
            {alertas.map((item, index) => <li key={`${item.codigo}-${index}`}>{item.mensagem}</li>)}
          </ul>
        </div>
      )}

      <section>
        <h3 className="app-bloco-titulo mb-2">Medições realizadas</h3>
        <Table
          rows={medicoes}
          empty="Nenhuma medição contabilizada."
          columns={[
            { key: 'numero', label: 'Medição', render: row => row.numero ? `#${row.numero}` : row.codigo || '-' },
            { key: 'periodo', label: 'Período', render: row => `${date(row.periodo_inicio)} a ${date(row.periodo_fim)}` },
            { key: 'status', label: 'Status' },
            { key: 'valor', label: 'Valor', render: row => money(row.valor) }
          ]}
        />
      </section>

      <section>
        <h3 className="app-bloco-titulo mb-2">Solicitações vinculadas</h3>
        <Table
          rows={solicitacoes}
          empty="Nenhuma solicitação vinculada."
          columns={[
            { key: 'codigo', label: 'Solicitação' },
            { key: 'descricao', label: 'Descrição' },
            { key: 'status', label: 'Status' },
            { key: 'valor', label: 'Medido', render: row => money(row.valor) },
            { key: 'movimentado', label: 'Movimentado', render: row => money(row.movimentado) },
            { key: 'fonte_financeira', label: 'Fonte financeira' }
          ]}
        />
      </section>

      <section>
        <h3 className="app-bloco-titulo mb-2">Títulos e valores movimentados</h3>
        <Table
          rows={titulos}
          empty="Nenhum título vinculado."
          columns={[
            { key: 'codigo', label: 'Título' },
            { key: 'status', label: 'Status' },
            { key: 'vencimento', label: 'Vencimento', render: row => date(row.vencimento) },
            { key: 'valor', label: 'Valor', render: row => money(row.valor) },
            { key: 'movimentado', label: 'Movimentado', render: row => money(row.movimentado) },
            { key: 'saldo', label: 'Saldo', render: row => money(row.saldo) }
          ]}
        />
      </section>
    </div>
  );
}
