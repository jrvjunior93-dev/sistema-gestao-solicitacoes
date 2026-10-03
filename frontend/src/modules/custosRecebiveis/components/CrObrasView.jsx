import { useState } from 'react';
import { HiOutlineBuildingOffice2 } from 'react-icons/hi2';
import {
  BarraFiltros,
  BlocoConteudo,
  alternarValorFiltro
} from '../../../components/padrao';
import { avisoMedicao, avisoPlanejamento, situacaoObra } from '../utils/prazos';
import CrStatusPill from './CrStatusPill';

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

/*
  Obras do módulo em cards: a casa do engenheiro ("Minhas obras"). A tabela
  administrativa de obras (?aba=obras sem ser engenheiro) foi removida na
  Fase 4 — o administrador chega às obras pelo Dashboard.
*/
export default function CrObrasView({
  obras,
  loading,
  error,
  onReload,
  onOpen
}) {
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
