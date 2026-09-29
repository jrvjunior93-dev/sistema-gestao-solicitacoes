import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiOutlineArrowLeft,
  HiOutlineBanknotes,
  HiOutlineCheckCircle,
  HiOutlineClipboardDocumentCheck,
  HiOutlinePencilSquare,
  HiOutlineScale
} from 'react-icons/hi2';
import { TabelaPadrao } from '../../../components/padrao';
import { obterPlanejamentoCompetencia } from '../services/custosRecebiveis';
import CrComparativoView from './CrComparativoView';
import CrIconAction from './CrIconAction';
import CrRealizadoView from './CrRealizadoView';

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

const decimal = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3
});

function monthLabel(value) {
  if (!/^\d{4}-\d{2}$/.test(String(value || ''))) return value || '-';
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function groupRows(rows = [], macros = []) {
  const macroByCode = new Map(macros.map((item) => [String(item.codigo), item]));
  const groups = new Map();
  rows.forEach((row) => {
    const code = String(row.etapa_macro_codigo || 'SEM_MACRO');
    const macro = macroByCode.get(code);
    if (!groups.has(code)) {
      groups.set(code, {
        codigo: code,
        descricao: macro?.descricao || (code === 'SEM_MACRO' ? 'Sem etapa macro' : code),
        ordem: Number(macro?.ordem || 999999),
        rows: []
      });
    }
    groups.get(code).rows.push(row);
  });
  return [...groups.values()].sort((left, right) => (
    left.ordem - right.ordem || left.codigo.localeCompare(right.codigo, 'pt-BR')
  ));
}

function quantidadeOrcada(row) {
  return Number(row.quantidade_base ?? row.item?.quantidade_orcada ?? 0);
}

function quantidadeAprovadaAnterior(row) {
  return Number(row.item?.quantidade_aprovada_anterior || 0);
}

function quantidadeAtual(row, approved) {
  return Number(approved ? row.quantidade_medida : row.quantidade_prevista || 0);
}

function EmptyDetail({ children }) {
  return <div className="cr-empty-state cr-month-read-empty">{children}</div>;
}

function CostDetail({ data }) {
  const rows = Array.isArray(data.custos) ? data.custos : [];
  if (!rows.length) return <EmptyDetail>Nenhum custo planejado foi registrado neste mês.</EmptyDetail>;
  return (
    <TabelaPadrao
      colunas={[
        {
          id: 'descricao',
          titulo: 'Descrição do serviço',
          tipo: 'identidade',
          noCard: 'titulo',
          render: (row) => <strong>{row.descricao}</strong>
        },
        { id: 'unidade', titulo: 'Unid.', tipo: 'texto', render: (row) => row.unidade || '-' },
        {
          id: 'quantidade',
          titulo: 'Quantidade',
          tipo: 'numero',
          render: (row) => decimal.format(Number(row.quantidade || 0))
        },
        {
          id: 'custo_unitario',
          titulo: 'Valor unitário',
          tipo: 'valor',
          render: (row) => currency.format(Number(row.custo_unitario || 0))
        },
        {
          id: 'valor_previsto',
          titulo: 'Total',
          tipo: 'valor',
          render: (row) => <strong>{currency.format(Number(row.valor_previsto || 0))}</strong>
        }
      ]}
      itens={rows}
      getId={(row) => row.id || row.chave_local}
      storageKey="tabela:custos-recebiveis-mes-custos"
      rotuloRolagem="Custos planejados no mês"
      vazio="Nenhum custo planejado foi registrado neste mês."
    />
  );
}

function MeasurementDetail({ data, approved = false }) {
  const rows = approved ? data.medicoes : data.recebiveis;
  const groups = groupRows(rows, data.macros);
  if (!groups.length) {
    return (
      <EmptyDetail>
        {approved
          ? 'A medição aprovada ainda não foi registrada para este mês.'
          : 'Nenhuma medição prevista foi registrada neste mês.'}
      </EmptyDetail>
    );
  }
  return (
    <div className="cr-month-read-groups">
      {groups.map((group) => {
        const total = group.rows.reduce((sum, row) => (
          sum + Number(approved ? row.valor_medido : row.valor_previsto || 0)
        ), 0);
        return (
          <section className="cr-month-read-group" key={group.codigo}>
            <header><strong>{group.codigo} · {group.descricao}</strong><span>{currency.format(total)}</span></header>
            <TabelaPadrao
              colunas={[
                {
                  id: 'descricao',
                  titulo: 'Etapa / serviço',
                  // R17: o serviço medido NOMEIA a linha.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (row) => <strong>{row.descricao}</strong>
                },
                { id: 'unidade', titulo: 'Unid.', tipo: 'texto', render: (row) => row.unidade || '-' },
                {
                  id: 'quantidade_orcada',
                  titulo: 'Qtd. orçada',
                  tipo: 'numero',
                  render: (row) => decimal.format(quantidadeOrcada(row))
                },
                {
                  id: 'quantidade_aprovada_anterior',
                  titulo: 'Qtd. aprovada anteriormente',
                  tipo: 'numero',
                  render: (row) => decimal.format(quantidadeAprovadaAnterior(row))
                },
                {
                  id: 'quantidade_atual',
                  titulo: approved ? 'Qtd. aprovada' : 'Qtd. prevista',
                  tipo: 'numero',
                  render: (row) => decimal.format(quantidadeAtual(row, approved))
                },
                {
                  id: 'valor',
                  titulo: approved ? 'Valor aprovado' : 'Valor previsto',
                  tipo: 'valor',
                  render: (row) => (
                    <strong>{currency.format(Number(approved ? row.valor_medido : row.valor_previsto || 0))}</strong>
                  )
                },
                {
                  id: 'saldo',
                  titulo: 'Saldo a medir',
                  tipo: 'numero',
                  render: (row) => decimal.format(Math.max(
                    0,
                    quantidadeOrcada(row) - quantidadeAprovadaAnterior(row) - quantidadeAtual(row, approved)
                  ))
                }
              ]}
              itens={group.rows}
              getId={(row) => `${group.codigo}-${row.plano_item_id || row.previsao_custo_id || row.id || row.descricao}`}
              storageKey={`tabela:custos-recebiveis-mes-medicao-${approved ? 'aprovada' : 'prevista'}:${group.codigo}`}
              rotuloRolagem={`Medição de ${group.codigo}`}
              vazio="Nenhuma medição neste grupo."
            />
          </section>
        );
      })}
    </div>
  );
}

function PrivateReceiptsDetail({ data }) {
  const rows = Array.isArray(data.recebiveis) ? data.recebiveis : [];
  if (!rows.length) return <EmptyDetail>Nenhum recebível financeiro vence neste período.</EmptyDetail>;
  return (
    <TabelaPadrao
      colunas={[
        {
          id: 'origem',
          titulo: 'Origem contratual',
          // R17: a origem contratual NOMEIA o recebível da linha.
          tipo: 'identidade',
          noCard: 'titulo',
          render: (row) => <strong>{row.descricao || row.origem || '-'}</strong>
        },
        {
          id: 'vencimento',
          titulo: 'Vencimento',
          tipo: 'data',
          render: (row) => (row.data_prevista
            ? new Date(`${String(row.data_prevista).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')
            : '-')
        },
        {
          id: 'status',
          titulo: 'Status',
          tipo: 'status',
          render: (row) => String(row.status_financeiro || 'PREVISTO').replaceAll('_', ' ')
        },
        {
          id: 'valor_previsto',
          titulo: 'Valor previsto',
          tipo: 'valor',
          render: (row) => <strong>{currency.format(Number(row.valor_previsto || 0))}</strong>
        }
      ]}
      itens={rows}
      getId={(row) => row.key || row.id}
      storageKey="tabela:custos-recebiveis-mes:recebiveis"
      rotuloRolagem="Recebíveis do período"
      vazio="Nenhum recebível financeiro vence neste período."
    />
  );
}

export default function CrMonthlyDetailView({
  obra,
  competencia,
  permissions,
  initialSection = '',
  onClose,
  onEditPlanning,
  onOpenApproved
}) {
  const isPublic = String(obra?.classificacao || '').toUpperCase() === 'PUBLICA';
  const defaultSection = initialSection || (isPublic ? 'forecast' : 'costs');
  const [section, setSection] = useState(defaultSection);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const sections = useMemo(() => [
    ...(isPublic ? [{ id: 'forecast', label: 'Medição prevista', icon: HiOutlineClipboardDocumentCheck }] : []),
    { id: 'costs', label: 'Custos planejados', icon: HiOutlinePencilSquare },
    ...(isPublic && permissions.measurementView
      ? [{ id: 'approved-read', label: 'Medição aprovada', icon: HiOutlineCheckCircle }]
      : []),
    ...(!isPublic ? [{ id: 'receipts', label: 'Recebíveis do período', icon: HiOutlineBanknotes }] : []),
    ...(permissions.realizedView ? [{ id: 'realized', label: 'Custos realizados', icon: HiOutlineBanknotes }] : []),
    ...(isPublic && permissions.comparativeView ? [{ id: 'comparison', label: 'Comparativo', icon: HiOutlineScale }] : [])
  ], [isPublic, permissions.comparativeView, permissions.measurementView, permissions.realizedView]);

  useEffect(() => {
    const requestedSection = initialSection || (isPublic ? 'forecast' : 'costs');
    setSection(sections.some((item) => item.id === requestedSection)
      ? requestedSection
      : sections[0]?.id || 'costs');
  }, [initialSection, isPublic, sections]);

  const load = useCallback(async () => {
    if (!obra?.id || !competencia) return;
    try {
      setLoading(true);
      setError('');
      setData(await obterPlanejamentoCompetencia(obra.id, competencia));
    } catch (requestError) {
      setData(null);
      setError(requestError.message || 'Não foi possível carregar o detalhe do mês.');
    } finally {
      setLoading(false);
    }
  }, [competencia, obra?.id]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="cr-month-detail-surface" aria-label={`Detalhes de ${monthLabel(competencia)}`}>
      <header className="cr-month-detail-surface__header">
        <div>
          <span>{obra.codigo || obra.id} · {obra.nome}</span>
          <h2>Detalhes do mês · {monthLabel(competencia)}</h2>
        </div>
        <div className="cr-month-detail-surface__actions">
          {permissions.costs || permissions.receipts ? (
            <CrIconAction
              icon={HiOutlinePencilSquare}
              label="Editar planejamento"
              onClick={onEditPlanning}
              /* Mesmo critério do card do mês: só há o que editar com
                 planejamento aberto (ou reaberto) e não finalizado. */
              disabled={Boolean(data) && (
                data.competencia?.estado === 'FINALIZADA' || data.regras?.editavel === false
              )}
              disabledReason={data?.competencia?.estado === 'FINALIZADA'
                ? 'planejamento finalizado; solicite reabertura'
                : 'mês bloqueado para edição; solicite reabertura'}
            />
          ) : null}
          {isPublic && permissions.measurementView ? (
            <CrIconAction
              icon={HiOutlineCheckCircle}
              label={permissions.measurement
                ? 'Registrar medição efetivamente paga'
                : 'Ver medição efetivamente paga'}
              onClick={onOpenApproved}
            />
          ) : null}
          <button
            type="button"
            className="cr-icon-button"
            onClick={onClose}
            aria-label="Voltar aos meses"
            title="Voltar aos meses"
          >
            <HiOutlineArrowLeft aria-hidden="true" />
          </button>
        </div>
      </header>

      <nav className="cr-month-detail-tabs" aria-label="Informações do mês">
        {sections.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className={section === id ? 'is-active' : ''} onClick={() => setSection(id)}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </nav>

      {loading && !data ? <div className="cr-empty-state">Carregando detalhes do mês...</div> : null}
      {error ? (
        <div className="cr-feedback" data-tone="error">
          <span>{error}</span>
          <button type="button" className="btn btn-outline" onClick={load}>Tentar novamente</button>
        </div>
      ) : null}
      {data && section === 'forecast' ? <MeasurementDetail data={data} /> : null}
      {data && section === 'costs' ? <CostDetail data={data} /> : null}
      {data && section === 'approved-read' ? <MeasurementDetail data={data} approved /> : null}
      {data && section === 'receipts' ? <PrivateReceiptsDetail data={data} /> : null}
      {section === 'realized' ? (
        <CrRealizadoView
          obra={obra}
          competencia={competencia}
          permissions={{
            update: permissions.realizedUpdate,
            reconcile: permissions.realizedReconcile
          }}
        />
      ) : null}
      {section === 'comparison' ? <CrComparativoView obra={obra} competencia={competencia} /> : null}
    </section>
  );
}
