import { useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import BlocoConteudo from '../../components/padrao/BlocoConteudo';
import BarraFiltros from '../../components/padrao/BarraFiltros';
import { alternarValorFiltro } from '../../components/padrao/BarraFiltros';
import { useFiltrosVisiveis } from '../../components/padrao/PainelFiltrosVisiveis';
import StatGrid from '../../components/padrao/StatGrid';
import { StatTile } from '../../components/padrao/StatGrid';

/**
 * FILTROS AVANÇADOS DAS SOLICITAÇÕES — migrados para `BarraFiltros` (R12).
 *
 * ## O que mudou de forma, e por quê
 *
 * A versão anterior era uma GRADE DE CAMPOS: quatro "multi-selects" escritos
 * à mão (obra, setor, tipo, status), cada um com o seu popover, o seu
 * `useEffect` de clique-fora, a sua rotina de posicionamento em pixels e o
 * seu resumo "Fulano, Beltrano +3" — 971 linhas para fazer o que o
 * `FiltroRapido` da `ListaAvancada` já faz, e que a `BarraFiltros`
 * reaproveita. R12: filtro é MARCAÇÃO com etiqueta removível, não campo que
 * só conta quantos itens escolhi.
 *
 * ## Onde cada recorte foi parar
 *
 * - **`filtros` (marcação, múltipla)**: obra, setor, tipo e status. Os quatro
 *   viram um parâmetro CSV (`obra_ids=1,2`) e o `SolicitacaoController.index`
 *   quebra os quatro por vírgula e monta `IN (...)` — conferido no serviço,
 *   não presumido. Por isso NENHUM deles declara `unico`: aqui a marcação
 *   múltipla chega inteira ao banco, e a etiqueta afirma a verdade (R23/F3).
 * - **`campos` (recorte contínuo, não enumerável)**: código, descrição,
 *   número do pedido, valor mín./máx., data de registro e o período de
 *   resposta/pagamento. Texto e faixa não têm lista fechada — é exatamente o
 *   caso que a `BarraFiltros` declara para `campos`.
 * - **Responsável fica em `campos`, e é decisão, não descuido**: a lista de
 *   responsáveis (`responsaveisOptions`) é extraída da PÁGINA carregada, não
 *   do banco. Virar marcação sobre ela ofereceria um conjunto que se
 *   encolhe conforme a lista pagina — capacidade aparente (R15) — e tiraria
 *   a busca por parte do nome, que o backend faz com `LIKE` quando vem um
 *   valor só. Enquanto o conjunto não for fechado, o recorte é contínuo.
 *
 * ## O que esta faixa NÃO tem, de propósito
 *
 * **Busca.** A `BarraFiltros` traz uma, mas este componente é renderizado
 * DENTRO do painel avançado da `ListaAvancada`, que já é dona da busca da
 * mesma lista. Duas caixas de busca no mesmo contexto é o defeito que a R16
 * nomeia (o caso das Empresas do Grupo). Uma responsabilidade, um dono.
 *
 * ## Filtros visíveis
 *
 * O seletor de quais filtros aparecem SAIU da barra de ações e virou a
 * superfície única do sistema (`components/padrao/PainelFiltrosVisiveis`),
 * dentro da própria faixa. Medido em 05/09: as 3 telas que oferecem essa
 * escolha (Consulta de títulos, esta e Provisionamentos — 5 endereços) a
 * ofereciam de 3 jeitos diferentes; esta era a do menu de marcação.
 *
 * E a escolha deixa de morar no navegador. A chave por usuário que o N53
 * criou aqui resolvia a estação compartilhada, mas não o resto do achado:
 * como esconder um filtro LIMPA o valor dele, a escolha muda o resultado da
 * consulta — e por máquina ela dava listas diferentes para a mesma pessoa.
 * Agora vai para o banco, tipo `filtros`, pelo `PreferenciasContext`. A
 * chave antiga vira `legado`: quem já configurou continua com a
 * configuração dele, que sobe para o banco uma vez.
 */

/*
  O CONJUNTO INICIAL APROVADO PELO CLIENTE (05/09) — `padrao: false` nasce
  escondido. São os cinco recortes que a operação usa todo dia; os outros
  sete ficam a um clique. O padrão vale SÓ para quem nunca configurou:
  quem tem escolha salva mantém a dele.

  `obrigatorio` em `descricao`: é a busca livre desta faixa (a busca da
  ListaAvancada é de outro dono, ver acima), e sem ela não sobra caminho
  para achar uma solicitação pelo que a pessoa lembra dela. `codigo` DEIXA
  de ser obrigatório — o cliente o pôs entre os escondidos, e um filtro que
  o padrão esconde não pode ser um filtro que não desmarca.
*/
const FILTROS_DISPONIVEIS = [
  { id: 'descricao', rotulo: 'Descrição', obrigatorio: true },
  { id: 'status', rotulo: 'Status' },
  { id: 'obra_ids', rotulo: 'Obra' },
  { id: 'area', rotulo: 'Setor' },
  { id: 'tipo_solicitacao_id', rotulo: 'Tipo de solicitação' },
  { id: 'codigo', rotulo: 'Código da solicitação', padrao: false },
  { id: 'numero_sienge', rotulo: 'Número do pedido', padrao: false },
  { id: 'valor_min', rotulo: 'Valor mínimo', padrao: false },
  { id: 'valor_max', rotulo: 'Valor máximo', padrao: false },
  { id: 'data_registro', rotulo: 'Data de registro', padrao: false },
  { id: 'data_vencimento', rotulo: 'Período Data Resposta/Pagamento', padrao: false },
  { id: 'responsavel', rotulo: 'Responsável', padrao: false }
];

/* A identidade da lista no banco. Sem o usuário no nome, e isso é o
   conserto: o servidor indexa a preferência POR USUÁRIO, então a estação
   compartilhada deixa de vazar a escolha de um operador para o próximo sem
   precisar que a chave carregue quem é. */
const CHAVE_FILTROS_VISIVEIS = 'solicitacoes:filtros-visiveis';

/*
  N53 (05/09) — QUAIS CHAVES DE `filtros` CADA MARCA DO SELETOR GOVERNA.

  Quase todas são um para um, mas "Periodo Data Resposta/Pagamento" governa
  TRÊS (a data exata e as duas pontas do período). Esconder tem de limpar as
  três: deixar uma ponta para trás recriaria o defeito em miniatura — lista
  recortada por uma data que não está em campo nenhum.
*/
const CHAVES_DO_FILTRO = {
  data_vencimento: ['data_vencimento', 'data_vencimento_inicio', 'data_vencimento_fim']
};

function chavesDoFiltro(filtroId) {
  return CHAVES_DO_FILTRO[filtroId] || [filtroId];
}

function filtroPreenchido(filtroId, filtros) {
  return chavesDoFiltro(filtroId).some((chave) => String(filtros?.[chave] ?? '').trim() !== '');
}

/*
  A CHAVE ANTIGA DO NAVEGADOR, LIDA SÓ COMO `legado` (05/09).

  Ela nasceu no N53 nomeando o usuário, para resolver a estação
  compartilhada. Isso continua valendo aqui: é a escolha DAQUELA pessoa que
  se lê, nunca a de quem sentou antes. O que muda é o destino — ela agora só
  responde "o que este usuário já tinha configurado nesta máquina", uma vez,
  para o `useFiltrosVisiveis` preservar a configuração e subi-la ao banco.
  A chave NÃO é apagada: é a rede de rollback, exatamente como no
  `PreferenciasContext`.

  Devolve `null` quando não há nada gravado — e isso é o ponto: "nunca
  configurou" tem de ser distinguível de "configurou tudo visível", porque
  só o primeiro recebe o conjunto inicial aprovado pelo cliente.
*/
function chaveLegadoVisibilidade(user) {
  const identificador = user?.id || user?.email || user?.nome || user?.perfil || 'anon';
  return `solicitacoes:filtros-visiveis:${identificador}`;
}

function lerLegadoFiltrosVisiveis(user) {
  try {
    const salvo = localStorage.getItem(chaveLegadoVisibilidade(user));
    const lidos = salvo ? JSON.parse(salvo) : null;
    return Array.isArray(lidos) && lidos.length > 0 ? lidos : null;
  } catch (error) {
    console.error('Erro ao carregar filtros visíveis', error);
    return null;
  }
}

const FILTROS_VAZIOS = {
  codigo: '',
  descricao: '',
  numero_sienge: '',
  obra_ids: '',
  area: '',
  tipo_solicitacao_id: '',
  status: '',
  valor_min: '',
  valor_max: '',
  data_registro: '',
  data_vencimento: '',
  data_vencimento_inicio: '',
  data_vencimento_fim: '',
  responsavel: ''
};

/* CSV do parâmetro → conjunto de marcados, e de volta. É o formato que o
   serviço aceita; a tela não inventa outro. */
function csvParaConjunto(valor) {
  return new Set(
    String(valor || '')
      .split(',')
      .map((item) => String(item).trim())
      .filter(Boolean)
  );
}

export default function Filtros({
  filtros,
  setFiltros,
  obrasOptions = [],
  responsaveisOptions = [],
  setores = [],
  tiposSolicitacao = [],
  statusOptions = [],
  mostrarFiltroResponsavel = false,
  mostrarSomaValor = false,
  somaValorFiltrado = 0,
  errosDatas = {}
}) {
  const { user } = useAuth() || {};

  /*
    Os filtros que esta tela DECLARA. `responsavel` só existe para quem tem
    a permissão: fora dela, ele não entra na lista — e como a preferência
    guarda o DESVIO do padrão, uma escolha antiga que o cite continua lá,
    ignorada na leitura e nunca apagada. Quem recuperar a permissão
    reencontra a escolha dele.
  */
  const declaracaoFiltros = useMemo(
    () => FILTROS_DISPONIVEIS.filter((filtro) => filtro.id !== 'responsavel' || mostrarFiltroResponsavel),
    [mostrarFiltroResponsavel]
  );

  /*
    Filtro com valor é filtro VISÍVEL — o outro lado do contrato de
    "esconder limpa". Os VALORES são restaurados pelo `Solicitacoes/index`
    (chave própria) e também chegam pela URL; nada impede que um deles caia
    sobre uma marca desligada, e era esse par que deixava a lista recortada
    por um critério fora da tela. O painel REVELA em vez de apagar: o
    recorte foi o usuário que montou, então ele aparece na faixa.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DISPONIVEIS
      .filter((filtro) => filtroPreenchido(filtro.id, filtros))
      .map((filtro) => filtro.id),
    [filtros]
  );

  /* Lido uma vez por usuário: é a chave ANTIGA do navegador, e ela não muda
     enquanto a pessoa não trocar de sessão. */
  const legadoFiltrosVisiveis = useMemo(
    () => lerLegadoFiltrosVisiveis(user),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chaveLegadoVisibilidade(user)]
  );

  const visibilidadeFiltros = useFiltrosVisiveis(CHAVE_FILTROS_VISIVEIS, declaracaoFiltros, {
    preenchidos: filtrosPreenchidos,
    legado: legadoFiltrosVisiveis,
    /*
      N53 (05/09) — ESCONDER LIMPA O VALOR.

      A lista das Solicitações é refeita a cada mudança de `filtros`, então
      esconder sem limpar deixava um recorte ativo que não estava em lugar
      nenhum da tela — a pessoa lia "12 solicitações" e concluía que eram
      todas. Limpar dispara a consulta de novo: a lista ALARGA no mesmo
      instante em que o campo sai da faixa. O número e a tela mudam juntos,
      que é a diferença entre corrigir e disfarçar.
    */
    aoEsconder: (filtroId) => {
      const vazios = Object.fromEntries(chavesDoFiltro(filtroId).map((chave) => [chave, '']));
      setFiltros((prev) => ({ ...prev, ...vazios }));
    }
  });

  const isFiltroVisivel = (filtroId) => visibilidadeFiltros.ehVisivel(filtroId);

  function definirCampo(nome, valor) {
    setFiltros((prev) => ({ ...prev, [nome]: valor }));
  }

  function limparFiltros() {
    setFiltros({ ...FILTROS_VAZIOS });
  }

  /* ---- Marcação: o estado da tela é o CSV; `ativos` é a leitura dele ---- */
  const ativos = {
    obra_ids: csvParaConjunto(filtros.obra_ids),
    area: csvParaConjunto(filtros.area),
    tipo_solicitacao_id: csvParaConjunto(filtros.tipo_solicitacao_id),
    status: csvParaConjunto(filtros.status)
  };

  function aoAlternar(dimensao, valor, opcoes) {
    const proximos = alternarValorFiltro(ativos, dimensao, valor, opcoes);
    definirCampo(dimensao, Array.from(proximos[dimensao]).join(','));
  }

  const dimensoes = [
    isFiltroVisivel('obra_ids') && {
      id: 'obra_ids',
      rotulo: 'Obra',
      vazio: 'Nenhuma obra disponível para filtrar.',
      opcoes: obrasOptions.map((obra) => ({ valor: String(obra.value), rotulo: obra.label }))
    },
    isFiltroVisivel('area') && {
      id: 'area',
      rotulo: 'Setor',
      vazio: 'Nenhum setor disponível para filtrar.',
      opcoes: setores.map((setor) => ({
        valor: String(setor.codigo || setor.nome || setor.id),
        rotulo: setor.nome || setor.codigo || String(setor.id)
      }))
    },
    isFiltroVisivel('tipo_solicitacao_id') && {
      id: 'tipo_solicitacao_id',
      rotulo: 'Tipo de solicitação',
      vazio: 'Nenhum tipo de solicitação cadastrado para filtrar.',
      opcoes: (tiposSolicitacao || []).map((tipo) => ({ valor: String(tipo.id), rotulo: tipo.nome }))
    },
    isFiltroVisivel('status') && {
      id: 'status',
      rotulo: 'Status',
      vazio: 'Nenhum status disponível para filtrar.',
      opcoes: statusOptions.map((item) => ({ valor: String(item.value), rotulo: item.label }))
    }
  ].filter(Boolean);

  /*
    O par de datas de resposta/pagamento continua governado pela MESMA marca
    do seletor de visibilidade que governava antes (`data_vencimento`) — o
    rótulo dela na lista é "Periodo Data Resposta/Pagamento".
  */
  const mostrarPeriodoVencimento = isFiltroVisivel('data_vencimento');

  const campos = [
    isFiltroVisivel('codigo') && {
      id: 'codigo',
      rotulo: 'Código da solicitação',
      tipo: 'text',
      valor: filtros.codigo || '',
      aoMudar: (valor) => definirCampo('codigo', valor)
    },
    isFiltroVisivel('descricao') && {
      id: 'descricao',
      rotulo: 'Descrição',
      tipo: 'search',
      valor: filtros.descricao || '',
      aoMudar: (valor) => definirCampo('descricao', valor)
    },
    isFiltroVisivel('numero_sienge') && {
      id: 'numero_sienge',
      rotulo: 'Número do pedido',
      tipo: 'text',
      valor: filtros.numero_sienge || '',
      aoMudar: (valor) => definirCampo('numero_sienge', valor)
    },
    isFiltroVisivel('valor_min') && {
      id: 'valor_min',
      rotulo: 'Valor mínimo',
      tipo: 'number',
      min: 0,
      valor: filtros.valor_min || '',
      aoMudar: (valor) => definirCampo('valor_min', valor)
    },
    isFiltroVisivel('valor_max') && {
      id: 'valor_max',
      rotulo: 'Valor máximo',
      tipo: 'number',
      min: 0,
      valor: filtros.valor_max || '',
      aoMudar: (valor) => definirCampo('valor_max', valor)
    },
    isFiltroVisivel('data_registro') && {
      id: 'data_registro',
      rotulo: 'Data de registro',
      tipo: 'date',
      min: '1900-01-01',
      max: '2200-12-31',
      valor: filtros.data_registro || '',
      aoMudar: (valor) => definirCampo('data_registro', valor)
    },
    mostrarPeriodoVencimento && {
      id: 'data_vencimento_inicio',
      rotulo: 'Data Resposta/Pagamento de',
      tipo: 'date',
      min: '1900-01-01',
      max: '2200-12-31',
      valor: filtros.data_vencimento_inicio || '',
      aoMudar: (valor) => definirCampo('data_vencimento_inicio', valor)
    },
    mostrarPeriodoVencimento && {
      id: 'data_vencimento_fim',
      rotulo: 'Data Resposta/Pagamento até',
      tipo: 'date',
      min: '1900-01-01',
      max: '2200-12-31',
      valor: filtros.data_vencimento_fim || '',
      aoMudar: (valor) => definirCampo('data_vencimento_fim', valor)
    },
    mostrarFiltroResponsavel && isFiltroVisivel('responsavel') && {
      id: 'responsavel',
      rotulo: 'Responsável',
      tipo: 'text',
      valor: filtros.responsavel || '',
      aoMudar: (valor) => definirCampo('responsavel', valor)
    }
  ].filter(Boolean);

  const quantidadeFiltrosAtivos = [
    filtros.codigo,
    filtros.descricao,
    filtros.numero_sienge,
    filtros.obra_ids,
    filtros.area,
    filtros.tipo_solicitacao_id,
    filtros.status,
    filtros.valor_min,
    filtros.valor_max,
    filtros.data_registro,
    filtros.data_vencimento,
    filtros.data_vencimento_inicio,
    filtros.data_vencimento_fim,
    mostrarFiltroResponsavel ? filtros.responsavel : ''
  ].filter((v) => String(v || '').trim() !== '').length;

  /*
    CONDIÇÃO DERIVADA DO CONTEÚDO, não evento: data inválida continua
    valendo depois de fechar um aviso, então ela mora ao lado dos campos,
    como texto fixo — nunca em `useAvisos` (a fronteira está escrita no
    próprio `Avisos.jsx`).
  */
  const errosVisiveis = Object.entries(errosDatas || {}).filter(([, mensagem]) => Boolean(mensagem));

  return (
    <BlocoConteudo
      variante="secundario"
      titulo="Filtros"
      contagem={quantidadeFiltrosAtivos > 0 ? `${quantidadeFiltrosAtivos} ativo(s)` : null}
      descricao="Refine por obra, setor, tipo, status, valor e datas."
      recolhivel
      className="solicitacoes-filtros"
    >
      {mostrarSomaValor && (
        <StatGrid colunas={1}>
          <StatTile
            label="Soma filtrada"
            valor={Number(somaValorFiltrado || 0).toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL'
            })}
            sub="Soma do valor das solicitações que atendem ao recorte atual."
          />
        </StatGrid>
      )}

      <BarraFiltros
        campos={campos}
        filtros={dimensoes}
        ativos={ativos}
        /*
          O seletor desce da barra de ações para DENTRO da faixa (05/09):
          junto do que ele governa, e no mesmo lugar das outras duas telas
          que oferecem a escolha.
        */
        visibilidade={visibilidadeFiltros}
        aoAlternar={aoAlternar}
        aoLimpar={limparFiltros}
      />

      {errosVisiveis.length > 0 && (
        <div role="alert">
          {errosVisiveis.map(([campo, mensagem]) => (
            <p key={campo} className="form-error">{mensagem}</p>
          ))}
        </div>
      )}

      <div className="app-actionbar">
        <button className="btn btn-outline" type="button" onClick={limparFiltros}>
          Limpar filtros
        </button>
      </div>
    </BlocoConteudo>
  );
}
