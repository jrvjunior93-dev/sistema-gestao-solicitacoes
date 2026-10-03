import { useMemo, useState } from 'react';
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowPath,
  HiOutlineCheckCircle,
  HiOutlineDocumentArrowUp,
  HiOutlineExclamationTriangle
} from 'react-icons/hi2';
import { TabelaPadrao, CelulaDupla } from '../../../components/padrao';
import CrStatusPill from './CrStatusPill';

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '-'
    : new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(date);
}

function getItemDepth(item, itemById) {
  let depth = 0;
  let parentId = item.item_pai_id;
  const visited = new Set();
  while (parentId && itemById.has(parentId) && !visited.has(parentId) && depth < 8) {
    visited.add(parentId);
    depth += 1;
    parentId = itemById.get(parentId)?.item_pai_id;
  }
  return depth;
}

function Metric({ label, value, helper, tone }) {
  return (
    <div className="cr-plan-metric" data-tone={tone || 'default'}>
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
    </div>
  );
}

export default function CrPlanoWorkspace({
  data,
  loading,
  error,
  canImport,
  canPublish,
  publishing,
  onReload,
  onSelectPlan,
  onOpenImport,
  onDownloadModel,
  onPublish,
  onClose = null
}) {
  const [justification, setJustification] = useState('');
  const plan = data?.plano_atual || null;
  const obra = data?.obra || null;
  const tolerance = Number(data?.configuracao?.tolerancia_divergencia_pct || 5);
  const divergence = Number(plan?.divergencia_macro_pct || 0);
  const requiresJustification = plan?.divergencia_macro_pct != null
    && Math.abs(divergence) > tolerance;
  const itemById = useMemo(
    () => new Map((plan?.itens || []).map((item) => [Number(item.id), item])),
    [plan?.itens]
  );

  if (loading) {
    return <section className="cr-section cr-empty-state">Carregando workspace da obra...</section>;
  }
  if (error) {
    return (
      <section className="cr-section">
        <div className="cr-feedback" data-tone="error">
          <div>
            <strong>Não foi possível abrir o workspace.</strong>
            <span>{error}</span>
          </div>
          <button type="button" className="btn btn-outline" onClick={onReload}>Tentar novamente</button>
        </div>
      </section>
    );
  }
  if (!obra) return null;

  return (
    <section className="cr-workspace">
      <div className="cr-workspace-heading">
        <div>
          <span>Planilha da obra</span>
          <h2>{obra.codigo || `OBRA ${obra.id}`} · {obra.nome}</h2>
        </div>
        <div className="cr-workspace-actions">
          {canImport ? (
            <>
              <button type="button" className="btn btn-outline" onClick={onDownloadModel}>
                <HiOutlineArrowDownTray className="h-4 w-4" />
                Baixar modelo
              </button>
              <button type="button" className="btn btn-primary" onClick={onOpenImport}>
                <HiOutlineDocumentArrowUp className="h-4 w-4" />
                {plan ? 'Nova versão' : 'Importar estrutura'}
              </button>
            </>
          ) : null}
          {onClose ? (
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Fechar
            </button>
          ) : null}
        </div>
      </div>

      {!plan ? (
        <div className="cr-empty-state cr-empty-state--large">
          <HiOutlineDocumentArrowUp className="h-7 w-7" />
          <strong>Esta obra ainda não possui estrutura micro</strong>
          {canImport ? (
            <button type="button" className="btn btn-primary" onClick={onOpenImport}>
              Iniciar importação
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="cr-plan-toolbar">
            <label className="cr-field">
              <span>Versão consultada</span>
              <select
                value={plan.id}
                onChange={(event) => onSelectPlan(Number(event.target.value))}
              >
                {(data.planos || []).map((version) => (
                  <option key={version.id} value={version.id}>
                    v{version.versao} · {version.situacao}
                  </option>
                ))}
              </select>
            </label>
            <div className="cr-plan-state">
              <span>Situação</span>
              <CrStatusPill status={plan.situacao} />
            </div>
            <div className="cr-plan-state">
              <span>Importada em</span>
              <strong>{formatDate(plan.createdAt)}</strong>
            </div>
            <button type="button" className="btn btn-outline cr-reload-button" onClick={onReload}>
              <HiOutlineArrowPath className="h-4 w-4" />
              Atualizar
            </button>
          </div>

          <div className="cr-plan-metrics">
            <Metric label="Total micro" value={formatCurrency(plan.total_micro)} helper="Itens de custo" />
            <Metric
              label="Referência macro"
              value={formatCurrency(
                (data.macros || [])
                  .filter((macro) => !macro.somadora)
                  .reduce((total, macro) => total + Number(macro.valor_orcado || 0), 0)
              )}
              helper="Cadastro de Obras"
            />
            <Metric
              label="Divergência"
              value={plan.divergencia_macro_pct == null ? '-' : `${divergence.toFixed(2)}%`}
              helper={`Tolerância operacional: ${tolerance}%`}
              tone={requiresJustification ? 'warning' : 'success'}
            />
            <Metric
              label="Itens"
              value={String((plan.itens || []).length)}
              helper="Linhas da versão"
            />
          </div>

          {plan.situacao === 'RASCUNHO' && canPublish ? (
            <div className="cr-publish-strip" data-warning={requiresJustification ? 'true' : undefined}>
              <div>
                {requiresJustification
                  ? <HiOutlineExclamationTriangle className="h-5 w-5" />
                  : <HiOutlineCheckCircle className="h-5 w-5" />}
                <div>
                  <strong>
                    {requiresJustification
                      ? 'Divergência acima da tolerância'
                      : 'Rascunho pronto para conferência'}
                  </strong>
                  <span>
                    Publicar torna esta versão vigente e substitui a versão publicada anterior,
                    sem alterar competências finalizadas.
                  </span>
                </div>
              </div>
              {requiresJustification ? (
                <label className="cr-field">
                  <span>Justificativa obrigatória</span>
                  <textarea
                    rows="2"
                    value={justification}
                    onChange={(event) => setJustification(event.target.value)}
                    placeholder="Explique a diferença entre o total micro e a referência macro"
                  />
                </label>
              ) : null}
              <button
                type="button"
                className="btn btn-primary"
                disabled={publishing || (requiresJustification && !justification.trim())}
                onClick={() => onPublish(plan.id, justification)}
              >
                {publishing ? 'Publicando...' : 'Publicar versão'}
              </button>
            </div>
          ) : null}

          <div className="cr-structure-grid">
            <div className="cr-structure-main">
              <div className="cr-block-heading">
                <div>
                  <h3>Estrutura micro da versão v{plan.versao}</h3>
                </div>
              </div>
              <TabelaPadrao
                colunas={[
                  {
                    id: 'item',
                    titulo: 'Código / descrição',
                    // R17: o item de custo NOMEIA a linha da estrutura micro.
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (item) => (
                      // Recuo da hierarquia preservado da tabela anterior:
                      // o nível do item é a única pista de pai/filho.
                      <div style={{ paddingLeft: `${getItemDepth(item, itemById) * 18}px` }}>
                        <CelulaDupla principal={item.codigo} sub={item.descricao} />
                      </div>
                    )
                  },
                  {
                    id: 'unidade',
                    titulo: 'Unidade',
                    tipo: 'texto',
                    render: (item) => item.unidade || '-'
                  },
                  {
                    id: 'quantidade',
                    titulo: 'Quantidade',
                    tipo: 'numero',
                    render: (item) => (item.somadora ? '-' : item.quantidade.toLocaleString('pt-BR'))
                  },
                  {
                    id: 'custo_unitario',
                    titulo: 'Custo unitário',
                    tipo: 'valor',
                    render: (item) => (item.somadora ? '-' : formatCurrency(item.custo_unitario))
                  },
                  {
                    id: 'valor_total',
                    titulo: 'Total',
                    tipo: 'valor',
                    render: (item) => (
                      <strong>{item.somadora ? '-' : formatCurrency(item.valor_total)}</strong>
                    )
                  },
                  {
                    id: 'macro',
                    titulo: 'Etapa macro',
                    tipo: 'texto',
                    render: (item) => {
                      const macro = item.vinculos_macro?.[0]?.apropriacao;
                      return macro ? (
                        <CelulaDupla principal={macro.codigo} sub={macro.descricao || '-'} />
                      ) : (
                        <span className="cr-link-missing">Sem vínculo</span>
                      );
                    }
                  }
                ]}
                itens={plan.itens || []}
                getId={(item) => item.id}
                storageKey="tabela:custos-recebiveis-workspace:estrutura-micro"
                rotuloRolagem="Estrutura micro da versão"
                vazio="Nenhum item na versão."
              />
            </div>

            <aside className="cr-macro-reference">
              <div className="cr-block-heading">
                <div>
                  <h3>Referência macro</h3>
                </div>
              </div>
              <div className="cr-macro-list">
                {(data.macros || []).length === 0 ? (
                  <div className="cr-empty-state">Nenhuma apropriação macro ativa.</div>
                ) : (data.macros || []).map((macro) => (
                  <div key={macro.id} className="cr-macro-row" data-sum={macro.somadora ? 'true' : undefined}>
                    <div>
                      <strong>{macro.codigo}</strong>
                      <span>{macro.descricao || 'Sem descrição'}</span>
                    </div>
                    <b>{formatCurrency(macro.valor_orcado)}</b>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
