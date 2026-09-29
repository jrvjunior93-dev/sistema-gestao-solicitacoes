import { useEffect, useMemo, useState } from 'react';
import {
  BarraFiltros,
  BlocoConteudo,
  CelulaDupla,
  TabelaPadrao,
  alternarValorFiltro
} from '../../../components/padrao';
import {
  consultaIndisponivel,
  listarAuditoriaCustosRecebiveis,
  listarAuditoriaGeral,
  mensagemLegivel
} from '../services/custosRecebiveis';
import { monthLabel } from '../utils/prazos';
import { formatarDataHora, normalizarBusca, rotuloObra } from './CrFormatos';

const PAGINA = 100;

function formatEvent(value) {
  return String(value || '')
    .replace(/^CR_/, '')
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^\S/, (letter) => letter.toUpperCase());
}

function primeiro(set) {
  return set && set.size ? [...set][0] : '';
}

/*
  Auditoria do módulo (Fase 4): lista geral, sem escolher obra antes.
  Filtros: obra, ação e período (no servidor) e busca no que já veio.
  Se o servidor ainda não tiver a consulta geral, a trilha por obra continua
  disponível filtrando uma obra.
*/
export default function CrAuditoriaView({ obras = [] }) {
  const [ativos, setAtivos] = useState({});
  const [busca, setBusca] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [acoes, setAcoes] = useState([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [modoPorObra, setModoPorObra] = useState(false);

  const obraId = primeiro(ativos.obra);
  const acao = primeiro(ativos.acao);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setErro('');
      try {
        const response = await listarAuditoriaGeral({
          obra_id: obraId,
          acao,
          de,
          ate,
          limit: PAGINA,
          offset
        });
        if (!active) return;
        const novos = Array.isArray(response?.items) ? response.items : [];
        setModoPorObra(false);
        setItems((current) => (offset ? [...current, ...novos] : novos));
        setTotal(Number(response?.total) || 0);
        if (Array.isArray(response?.acoes)) setAcoes(response.acoes);
      } catch (error) {
        if (!active) return;
        if (consultaIndisponivel(error) && obraId) {
          // Servidor sem a consulta geral: trilha da obra pela rota antiga.
          try {
            const response = await listarAuditoriaCustosRecebiveis(obraId, { evento: acao, limit: 150 });
            if (!active) return;
            const lista = (Array.isArray(response?.items) ? response.items : []).map((item) => ({
              ...item,
              acao: item.acao || item.evento
            }));
            setModoPorObra(true);
            setItems(lista);
            setTotal(lista.length);
          } catch (fallbackError) {
            if (active) setErro(mensagemLegivel(fallbackError, 'Não foi possível consultar a auditoria.'));
          }
        } else {
          setItems([]);
          setTotal(0);
          setErro(consultaIndisponivel(error)
            ? 'Consulta geral indisponível no servidor no momento. Filtre uma obra para ver a trilha dela.'
            : mensagemLegivel(error, 'Não foi possível consultar a auditoria.'));
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [obraId, acao, de, ate, offset]);

  // Filtro novo recomeça da primeira página.
  function reiniciar(fn) {
    setOffset(0);
    fn();
  }

  const opcoesObra = useMemo(
    () => (obras || []).map((obra) => ({ valor: String(obra.id), rotulo: rotuloObra(obra) })),
    [obras]
  );
  const opcoesAcao = useMemo(
    () => acoes.map((item) => ({ valor: item, rotulo: formatEvent(item) })),
    [acoes]
  );

  const termo = normalizarBusca(busca);
  const linhas = termo
    ? items.filter((item) => normalizarBusca(
      `${item.descricao} ${item.usuario?.nome} ${item.obra?.codigo} ${item.obra?.nome} ${formatEvent(item.acao)}`
    ).includes(termo))
    : items;
  const temMais = !modoPorObra && items.length < total;

  return (
    <BlocoConteudo titulo="Auditoria" contagem={`${total} registro(s)`}>
      <BarraFiltros
        busca={{ valor: busca, aoMudar: setBusca, placeholder: 'Descrição, usuário ou obra' }}
        campos={[
          { id: 'de', rotulo: 'De', tipo: 'date', valor: de, aoMudar: (valor) => reiniciar(() => setDe(valor || '')) },
          { id: 'ate', rotulo: 'Até', tipo: 'date', valor: ate, aoMudar: (valor) => reiniciar(() => setAte(valor || '')) }
        ]}
        filtros={[
          { id: 'obra', rotulo: 'Obra', unico: true, opcoes: opcoesObra },
          { id: 'acao', rotulo: 'Ação', unico: true, opcoes: opcoesAcao }
        ]}
        ativos={ativos}
        aoAlternar={(dimensao, valor, opcoes) => reiniciar(() => setAtivos(
          (current) => alternarValorFiltro(current, dimensao, valor, opcoes)
        ))}
        aoLimpar={() => reiniciar(() => {
          setBusca('');
          setDe('');
          setAte('');
          setAtivos({});
        })}
      />
      {erro ? <p className="cr-faixa-aviso" role="status">{erro}</p> : null}
      <TabelaPadrao
        colunas={[
          {
            id: 'acao',
            titulo: 'Ação',
            tipo: 'identidade',
            noCard: 'titulo',
            render: (item) => (
              <CelulaDupla principal={formatEvent(item.acao)} sub={item.descricao || ''} />
            )
          },
          {
            id: 'obra',
            titulo: 'Obra',
            tipo: 'texto',
            render: (item) => (item.obra ? (
              <CelulaDupla
                principal={rotuloObra(item.obra)}
                sub={item.competencia ? monthLabel(item.competencia) : ''}
              />
            ) : '—')
          },
          {
            id: 'usuario',
            titulo: 'Usuário',
            tipo: 'texto',
            render: (item) => item.usuario?.nome || 'Processo do sistema'
          },
          { id: 'data', titulo: 'Data', tipo: 'texto', render: (item) => formatarDataHora(item.criado_em) }
        ]}
        itens={linhas}
        getId={(item) => item.id}
        storageKey="tabela:custos-recebiveis-auditoria"
        rotuloRolagem="Auditoria"
        carregando={loading && !items.length}
        vazio="Nenhum registro encontrado."
      />
      {temMais ? (
        <div className="cr-faixa-mais">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={loading}
            onClick={() => setOffset(items.length)}
          >
            {loading ? 'Carregando...' : `Carregar mais (${items.length} de ${total})`}
          </button>
        </div>
      ) : null}
    </BlocoConteudo>
  );
}
