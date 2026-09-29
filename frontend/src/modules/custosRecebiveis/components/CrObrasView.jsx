import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HiOutlineArrowTopRightOnSquare,
  HiOutlineBuildingOffice2,
  HiOutlineMagnifyingGlass
} from 'react-icons/hi2';
import {
  BarraFiltros,
  BlocoConteudo,
  TabelaPadrao,
  CelulaDupla,
  alternarValorFiltro
} from '../../../components/padrao';
import { avisoMedicao, avisoPlanejamento, situacaoObra } from '../utils/prazos';
import CrStatusPill from './CrStatusPill';

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

const BUDGET_STATUS = Object.freeze({
  ORCAMENTO_PUBLICADO: { label: 'Orçamento publicado', status: 'PUBLICADA' },
  RASCUNHO: { label: 'Orçamento em rascunho', status: 'RASCUNHO' },
  PENDENTE: { label: 'Orçamento pendente', status: 'PENDENTE' }
});

function ClassificationPill({ value }) {
  const normalized = String(value || '').toUpperCase();
  return (
    <span className="cr-classification-pill" data-kind={normalized || 'NAO_INFORMADA'}>
      {normalized === 'PUBLICA' ? 'Pública' : normalized === 'PRIVADA' ? 'Privada' : 'Não informada'}
    </span>
  );
}

function BudgetStatus({ obra }) {
  const value = BUDGET_STATUS[obra.situacao_orcamento] || BUDGET_STATUS.PENDENTE;
  return <CrStatusPill status={value.status} label={value.label} />;
}

function Aviso({ aviso }) {
  if (!aviso) return null;
  return (
    <span className="cr-obra-card__aviso" data-tone={aviso.tone}>
      <small>{aviso.rotulo}</small>
      <span>{aviso.texto}</span>
    </span>
  );
}

function ObraCard({ obra, onOpen }) {
  const situacao = situacaoObra(obra.prazos);
  const planejamento = avisoPlanejamento(obra.prazos);
  const medicao = avisoMedicao(obra.prazos);
  return (
    <button
      type="button"
      className="cr-obra-card"
      data-status={situacao.status}
      onClick={() => onOpen(obra.id)}
      aria-label={`Abrir meses de ${obra.nome}`}
    >
      <span className="cr-obra-card__header">
        <span>
          <small>{obra.codigo || `OBRA ${obra.id}`}</small>
          <strong title={obra.nome}>{obra.nome}</strong>
        </span>
        <CrStatusPill status={situacao.status} label={situacao.label} />
      </span>
      {obra.prazos ? (
        <span className="cr-obra-card__avisos">
          <Aviso aviso={planejamento} />
          <Aviso aviso={medicao} />
        </span>
      ) : (
        <span className="cr-obra-card__sem-prazo">Prazos indisponíveis</span>
      )}
    </button>
  );
}

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('pt-BR');
}

function EngineerWorks({ obras, loading, error, onReload, onOpen }) {
  const [busca, setBusca] = useState('');
  const [ativos, setAtivos] = useState({});
  const query = normalize(busca);
  const selecionadas = ativos.obra || new Set();

  const matchesQuery = (obra) => !query
    || normalize(obra.nome).includes(query)
    || normalize(obra.codigo).includes(query);
  // Busca e lista funcionam juntas: o texto estreita os cards E as opções da
  // lista; a lista escolhe obras específicas dentro do que sobrou.
  const opcoesObra = (Array.isArray(obras) ? obras : [])
    .filter((obra) => matchesQuery(obra) || selecionadas.has(String(obra.id)))
    .map((obra) => ({
      valor: String(obra.id),
      rotulo: obra.codigo ? `${obra.codigo} · ${obra.nome}` : obra.nome
    }));
  const filtered = (Array.isArray(obras) ? obras : []).filter((obra) => (
    matchesQuery(obra) && (!selecionadas.size || selecionadas.has(String(obra.id)))
  ));

  return (
    <BlocoConteudo titulo="Minhas obras" contagem={`${filtered.length} obra(s)`}>
      <BarraFiltros
        busca={{ valor: busca, aoMudar: setBusca, placeholder: 'Nome ou código da obra' }}
        filtros={[{ id: 'obra', rotulo: 'Obra', opcoes: opcoesObra }]}
        ativos={ativos}
        aoAlternar={(dimensao, valor, opcoes) => setAtivos(
          (current) => alternarValorFiltro(current, dimensao, valor, opcoes)
        )}
        aoLimpar={() => {
          setBusca('');
          setAtivos({});
        }}
      />

      {error ? (
        <div className="cr-feedback" data-tone="error">
          <div>
            <strong>Não foi possível carregar as obras.</strong>
            <span>{error}</span>
          </div>
          <button type="button" className="btn btn-outline" onClick={onReload}>Tentar novamente</button>
        </div>
      ) : loading ? (
        <div className="cr-empty-state">Carregando obras...</div>
      ) : filtered.length === 0 ? (
        <div className="cr-empty-state">
          <HiOutlineBuildingOffice2 className="h-6 w-6" />
          <strong>Nenhuma obra encontrada</strong>
        </div>
      ) : (
        <div className="cr-obra-card-grid">
          {filtered.map((obra) => (
            <ObraCard key={obra.id} obra={obra} onOpen={onOpen} />
          ))}
        </div>
      )}
    </BlocoConteudo>
  );
}

export default function CrObrasView({
  obras,
  loading,
  error,
  onReload,
  onOpen,
  cardMode = false,
  showAdministrationLink = false
}) {
  const [busca, setBusca] = useState('');
  const [classificacao, setClassificacao] = useState('');
  const [situacao, setSituacao] = useState('');

  const filtered = useMemo(() => {
    const query = String(busca || '').trim().toLocaleLowerCase('pt-BR');
    return (Array.isArray(obras) ? obras : []).filter((obra) => {
      const matchesSearch = !query || [
        obra.codigo,
        obra.nome,
        obra.cidade,
        obra.empresa?.nome,
        obra.responsavel?.nome,
        obra.contrato?.referencia,
        ...(obra.contrato?.referencias || [])
      ].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(query));
      const matchesClassification = !classificacao
        || String(obra.classificacao || '').toUpperCase() === classificacao;
      const matchesStatus = !situacao
        || String(obra.situacao_orcamento || 'PENDENTE').toUpperCase() === situacao;
      return matchesSearch && matchesClassification && matchesStatus;
    });
  }, [busca, classificacao, obras, situacao]);

  if (cardMode) {
    return (
      <EngineerWorks
        obras={obras}
        loading={loading}
        error={error}
        onReload={onReload}
        onOpen={onOpen}
      />
    );
  }

  return (
    <section className="cr-section cr-works-access">
      <div className="cr-section-heading">
        <div>
          <h2>Obras no seu escopo</h2>
          <p>Abra uma obra para planejar os meses, acompanhar medições e consultar os resultados.</p>
        </div>
        {showAdministrationLink ? (
          <Link className="btn btn-outline" to="/obras">
            <HiOutlineArrowTopRightOnSquare className="h-4 w-4" />
            Cadastro de Obras
          </Link>
        ) : null}
      </div>

      <div className="cr-filter-grid">
        <label className="cr-field cr-field--search">
          <span>Buscar obra</span>
          <div className="cr-input-icon">
            <HiOutlineMagnifyingGlass className="h-4 w-4" />
            <input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Código, nome ou responsável"
            />
          </div>
        </label>
        <label className="cr-field">
          <span>Classificação</span>
          <select value={classificacao} onChange={(event) => setClassificacao(event.target.value)}>
            <option value="">Todas</option>
            <option value="PUBLICA">Pública</option>
            <option value="PRIVADA">Privada</option>
          </select>
        </label>
        <label className="cr-field">
          <span>Situação do orçamento</span>
          <select value={situacao} onChange={(event) => setSituacao(event.target.value)}>
            <option value="">Todas</option>
            <option value="ORCAMENTO_PUBLICADO">Publicado</option>
            <option value="RASCUNHO">Rascunho</option>
            <option value="PENDENTE">Pendente</option>
          </select>
        </label>
      </div>

      {error ? (
        <div className="cr-feedback" data-tone="error">
          <div>
            <strong>Não foi possível carregar as obras.</strong>
            <span>{error}</span>
          </div>
          <button type="button" className="btn btn-outline" onClick={onReload}>Tentar novamente</button>
        </div>
      ) : loading ? (
        <div className="cr-empty-state">Carregando obras do seu escopo...</div>
      ) : filtered.length === 0 ? (
        <div className="cr-empty-state">
          <HiOutlineBuildingOffice2 className="h-6 w-6" />
          <strong>Nenhuma obra encontrada</strong>
          <span>Ajuste os filtros ou solicite o vínculo da obra ao administrador.</span>
        </div>
      ) : (
        <>
          <TabelaPadrao
            colunas={[
              {
                id: 'obra',
                titulo: 'Obra',
                // R17: a obra NOMEIA a linha desta lista de escopo.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (obra) => (
                  <CelulaDupla
                    principal={`${obra.codigo || `OBRA ${obra.id}`} · ${obra.nome}`}
                    sub={`${obra.cidade || '-'} · ${obra.empresa?.nome || 'Empresa não informada'}`}
                  />
                )
              },
              {
                id: 'valor_contratado',
                titulo: 'Valor contratado',
                tipo: 'valor',
                render: (obra) => currency.format(obra.contrato?.valor_total || 0)
              },
              {
                id: 'valor_orcado',
                titulo: 'Valor orçado',
                tipo: 'valor',
                render: (obra) => currency.format(obra.valor_orcado || 0)
              },
              {
                id: 'responsavel',
                titulo: 'Eng. responsável',
                tipo: 'texto',
                render: (obra) => obra.responsavel?.nome || 'Não definido'
              },
              {
                id: 'classificacao',
                titulo: 'Classificação',
                tipo: 'status',
                render: (obra) => <ClassificationPill value={obra.classificacao} />
              },
              {
                id: 'situacao',
                titulo: 'Situação',
                tipo: 'badge',
                render: (obra) => <BudgetStatus obra={obra} />
              }
            ]}
            itens={filtered}
            getId={(obra) => obra.id}
            storageKey="tabela:custos-recebiveis-obras"
            rotuloRolagem="Obras no seu escopo"
            acoesLinha={(obra) => (
              <button type="button" className="btn btn-primary" onClick={() => onOpen(obra.id)}>
                Abrir
              </button>
            )}
            larguraAcoes={140}
          />
          <div className="cr-result-count">{filtered.length} obra(s) exibida(s)</div>
        </>
      )}
    </section>
  );
}
