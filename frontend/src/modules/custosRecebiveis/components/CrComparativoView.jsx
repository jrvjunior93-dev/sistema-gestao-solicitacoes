import { useCallback, useEffect, useState } from 'react';
import { HiOutlineExclamationTriangle } from 'react-icons/hi2';
import { TabelaPadrao, CelulaDupla } from '../../../components/padrao';
import { COMPARATIVO_ESTADO_LABELS } from '../constants/custosRecebiveis';
import { obterComparativoCompetencia } from '../services/custosRecebiveis';

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

const APPROVAL_STATUS = {
  AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  APROVADO_INTEGRAL: 'Aprovado integralmente',
  APROVADO_PARCIAL: 'Aprovado parcialmente',
  ACIMA_PREVISTO: 'Aprovado acima do previsto',
  SEM_PREVISAO: 'Aprovado sem previsão'
};

export default function CrComparativoView({ obra, competencia }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!obra?.id) {
      setData(null);
      setError('');
      return;
    }
    try {
      setLoading(true);
      setError('');
      setData(await obterComparativoCompetencia(obra.id, competencia));
    } catch (requestError) {
      setData(null);
      setError(requestError.message || 'Erro ao carregar comparativo.');
    } finally {
      setLoading(false);
    }
  }, [obra?.id, competencia]);

  useEffect(() => {
    load();
  }, [load]);

  if (!obra?.id) {
    return (
      <section className="cr-section cr-empty-state cr-empty-state--large">
        <strong>Selecione uma obra</strong>
        <span>O comparativo depende da obra e da competência escolhidas no contexto.</span>
      </section>
    );
  }
  if (loading && !data) {
    return <section className="cr-section cr-empty-state">Carregando comparativo...</section>;
  }
  if (error) {
    return (
      <section className="cr-section cr-empty-state cr-empty-state--large">
        <HiOutlineExclamationTriangle className="h-6 w-6" />
        <strong>Comparativo indisponível</strong>
        <span>{error}</span>
        <button type="button" className="btn btn-outline" onClick={load}>Tentar novamente</button>
      </section>
    );
  }

  const rows = data?.linhas_medicao || [];

  return (
    <section className="cr-section">
      <div className="cr-section-heading">
        <div>
          <h2>Comparativo operacional por item</h2>
        </div>
      </div>
      <div className="cr-kpi-strip cr-kpi-strip--receivables">
        <div>
          <span>Medição prevista</span>
          <strong>{currency.format(data?.recebiveis?.medicao_apresentada || 0)}</strong>
        </div>
        <div>
          <span>Medição aprovada</span>
          <strong>
            {data?.recebiveis?.medicao_aprovada == null
              ? 'Aguardando'
              : currency.format(data.recebiveis.medicao_aprovada)}
          </strong>
        </div>
        <div data-tone="negative">
          <span>Glosa</span>
          <strong>
            {data?.recebiveis?.glosa == null
              ? '—'
              : currency.format(data.recebiveis.glosa)}
          </strong>
        </div>
        <div data-tone="actual">
          <span>Receita recebida</span>
          <strong>{currency.format(data?.recebiveis?.receita_recebida || 0)}</strong>
        </div>
      </div>
      <TabelaPadrao
        colunas={[
          {
            id: 'item',
            titulo: 'Macro / item micro',
            // R17: o item micro NOMEIA a linha do comparativo.
            tipo: 'identidade',
            noCard: 'titulo',
            render: (item) => (
              <CelulaDupla
                principal={`${item.codigo} · ${item.descricao}`}
                sub={item.etapa_macro_codigo || 'Sem macro'}
              />
            )
          },
          {
            id: 'previsto',
            largura: 170, minWidth: 170,
            titulo: 'Medição prevista',
            tipo: 'valor',
            render: (item) => currency.format(item.previsto)
          },
          {
            id: 'aprovado',
            largura: 170, minWidth: 170,
            titulo: 'Medição aprovada',
            tipo: 'valor',
            render: (item) => (item.tem_aprovacao ? currency.format(item.aprovado) : 'Aguardando')
          },
          {
            id: 'glosa',
            largura: 140, minWidth: 140,
            titulo: 'Glosa',
            tipo: 'valor',
            render: (item) => (item.tem_aprovacao ? (
              <span className={Number(item.glosa || 0) > 0 ? 'cr-detalhe-negativo' : undefined}>
                {currency.format(item.glosa)}
              </span>
            ) : '—')
          },
          {
            id: 'percentual_aprovacao',
            largura: 110,
            titulo: 'Aprovação',
            tipo: 'numero',
            render: (item) => (item.percentual_aprovacao == null ? '—' : `${item.percentual_aprovacao}%`)
          },
          {
            id: 'estado',
            largura: 200,
            titulo: 'Estado',
            // Rótulo por extenso ("Aprovado parcialmente"): largura de status, não de badge curto.
            tipo: 'status',
            render: (item) => (
              <span className="cr-status-pill" data-status={item.estado}>
                {APPROVAL_STATUS[item.estado] || COMPARATIVO_ESTADO_LABELS[item.estado] || item.estado}
              </span>
            )
          }
        ]}
        itens={rows}
        getId={(item) => item.key}
        storageKey="tabela:custos-recebiveis-comparativo"
        rotuloRolagem="Comparativo operacional por item"
        vazio="Nenhum item com medição prevista ou aprovada nesta competência."
      />
    </section>
  );
}
