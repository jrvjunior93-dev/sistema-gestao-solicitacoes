import { useEffect, useMemo, useState } from 'react';
import { HiOutlineArrowDownTray, HiOutlineEye, HiOutlinePaperAirplane, HiOutlineTrash } from 'react-icons/hi2';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import {
  baixarPdfSolicitacaoCompra,
  encaminharSolicitacaoCompraParaCompras,
  encaminharSolicitacoesCompraParaCompras,
  inativarSolicitacaoCompra,
  inativarSolicitacoesCompra,
  listarSolicitacoesCompra
} from '../../../services/compras';
import { getMinhasObras } from '../../../services/obras';
import {
  canDeleteCompraSolicitacoes,
  canEncaminharCompraSolicitacoes,
  isBusinessAdmin
} from '../../../utils/acessoProduto';
import { userHasSetorCapability } from '../../../utils/setor';
import {
  Avisos,
  BarraFiltros,
  BlocoConteudo,
  CelulaDupla,
  Pagina,
  PageHeader,
  TabelaPadrao,
  alternarValorFiltro,
  useAvisos,
  useConfirmacao,
  useFiltrosVisiveis
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';
import {
  STATUS_SOLICITACAO_COMPRA,
  chaveStatusCompra,
  familiaStatusCompra,
  rotuloStatusCompra
} from '../utils/statusCompras';
import useComprasRealtimeRefresh from '../hooks/useComprasRealtimeRefresh';

function formatarData(data) {
  if (!data) {
    return '-';
  }

  const raw = String(data);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  const valor = new Date(data);
  if (Number.isNaN(valor.getTime())) {
    return '-';
  }

  return valor.toLocaleDateString('pt-BR');
}

function estaAguardandoRevisaoGeo(status) {
  return ['PENDENTE', 'ENVIADO', 'INTEGRADO_SIENGE'].includes(chaveStatusCompra(status));
}

function codigoSolicitacao(solicitacao) {
  return `SC-${String(solicitacao?.id ?? '').padStart(5, '0')}`;
}

/*
  QUAIS FILTROS APARECEM (N53) — a declaração desta tela para o painel
  único de `PainelFiltrosVisiveis`, no molde do painel "Colunas" da
  TabelaPadrao.

  NENHUM `padrao: false`: todos os filtros continuam VISÍVEIS na primeira
  abertura. Só três telas têm conjunto inicial reduzido, e é o que o
  cliente aprovou nelas — aqui o seletor apenas passa a EXISTIR, para quem
  quiser mexer. Esconder por padrão mudaria o que a pessoa vê sem ela ter
  pedido.

  `obrigatorio` na busca livre: é o único caminho para achar um registro
  pelo que a pessoa lembra dele. Mesma família da coluna de identidade
  travada da TabelaPadrao — aparece na lista, marcada e sem desmarcar.
*/
const FILTROS_DA_TELA = [
  { id: 'busca', rotulo: 'Busca', obrigatorio: true },
  { id: 'obra_id', rotulo: 'Obra' },
  { id: 'status', rotulo: 'Status' }
];

export default function SolicitacoesCompra() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [obras, setObras] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inativando, setInativando] = useState(false);
  const [encaminhando, setEncaminhando] = useState(false);
  const [busca, setBusca] = useState('');
  const [selecionadas, setSelecionadas] = useState([]);

  /*
    FILTRO QUE VEIO DA URL PRECISA APARECER (defeito de 05/09).

    `?status=` chega do cartão de pendências do Hub: a tela abre já filtrada
    no MESMO status que o cartão contou. Na versão anterior o valor ia direto
    para o `<select>`, e quando ele não estava entre as CINCO opções
    oferecidas (`AGUARDANDO_DIRETORIA`, por exemplo, não estava) o controle
    renderizava VAZIO enquanto a lista continuava filtrada: a tela mostrava
    "Todos" e listava um status só.

    Com a `BarraFiltros` a etiqueta afirma o recorte ativo — mas só se o
    valor existir entre as opções da dimensão. Por isso as opções são a UNIÃO
    de: os estados que a tela reconhece, os estados presentes nos dados
    carregados e o valor que veio da URL (ver `opcoesStatus`). Assim é
    impossível haver filtro aplicado sem etiqueta.
  */
  const [ativos, setAtivos] = useState(() => {
    const daUrl = chaveStatusCompra(new URLSearchParams(window.location.search).get('status'));
    return {
      obra_id: new Set(),
      status: new Set(daUrl ? [daUrl] : [])
    };
  });
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => (filtro.id === 'busca'
      ? busca.trim() !== ''
      : (ativos[filtro.id]?.size || 0) > 0)).map((filtro) => filtro.id),
    [busca, ativos]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:solicitacoes-compra', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => setAtivos((atuais) => ({ ...atuais, [id]: new Set() }))
  });

  const podeInativar = canDeleteCompraSolicitacoes(user);
  const podeEncaminharCompras = (
    canEncaminharCompraSolicitacoes(user)
    && (userHasSetorCapability(user, 'eh_setor_geo') || isBusinessAdmin(user))
  );
  const podeSelecionar = podeInativar || podeEncaminharCompras;

  /*
    `obra_id` é parâmetro do SERVIÇO (`listarSolicitacoesCompra`), que monta
    `?obra_id=` com UM valor — daí `unico: true` na dimensão. Marcação
    múltipla aqui deixaria a pessoa marcar duas obras, ver duas etiquetas e a
    lista não estreitar (R15: capacidade aparente sem efeito).
  */
  const obraId = useMemo(
    () => [...(ativos.obra_id || [])][0] || '',
    [ativos.obra_id]
  );

  async function carregarObras() {
    try {
      const data = await getMinhasObras({ modo: 'CRIACAO' });
      setObras(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar obras');
    }
  }

  async function carregarSolicitacoes() {
    try {
      setLoading(true);
      const params = { visao: 'resumo', ...(obraId ? { obra_id: obraId } : {}) };
      const data = await listarSolicitacoesCompra(params);
      setSolicitacoes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar solicitacoes de compra');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarObras();
  }, []);

  // R23: o recorte de obra aplica ao MARCAR — nada de botão "aplicar".
  useEffect(() => {
    carregarSolicitacoes();
  }, [obraId]);

  useComprasRealtimeRefresh(carregarSolicitacoes);

  /*
    As opções do filtro de status são os estados que a tela DE FATO reconhece
    (11), não as cinco de antes. Solicitação parada em AGUARDANDO_DIRETORIA
    aparecia na lista e não podia ser isolada — o estado que mais se quer
    filtrar era o que faltava.
  */
  const opcoesStatus = useMemo(() => {
    const mapa = new Map(STATUS_SOLICITACAO_COMPRA.map((opcao) => [opcao.valor, opcao.rotulo]));
    solicitacoes.forEach((solicitacao) => {
      const chave = chaveStatusCompra(solicitacao.status);
      if (chave && !mapa.has(chave)) {
        mapa.set(chave, rotuloStatusCompra(chave));
      }
    });
    (ativos.status || new Set()).forEach((chave) => {
      if (chave && !mapa.has(chave)) {
        mapa.set(chave, rotuloStatusCompra(chave));
      }
    });
    return [...mapa.entries()].map(([valor, rotulo]) => ({ valor, rotulo }));
  }, [solicitacoes, ativos.status]);

  const dimensoes = useMemo(() => [
    {
      id: 'obra_id',
      rotulo: 'Obra',
      unico: true,
      opcoes: obras.map((obra) => ({
        valor: String(obra.id),
        rotulo: obra.codigo ? `${obra.codigo} - ${obra.nome}` : obra.nome
      }))
    },
    {
      // O status é filtrado NA TELA (a lista já vem inteira), então aqui a
      // marcação múltipla tem efeito de verdade: dois status marcados =
      // união dos dois. Sem `unico`, porque nada se perde no caminho.
      id: 'status',
      rotulo: 'Status',
      opcoes: opcoesStatus
    }
  ], [obras, opcoesStatus]);

  function alternarFiltro(dimensao, valor, opcoes) {
    setAtivos((atuais) => alternarValorFiltro(atuais, dimensao, valor, opcoes));
  }

  function limparFiltros() {
    setAtivos({ obra_id: new Set(), status: new Set() });
    setBusca('');
  }

  const solicitacoesFiltradas = useMemo(() => {
    const termo = String(busca || '').trim().toLowerCase();
    const statusSelecionados = ativos.status || new Set();

    return solicitacoes.filter((solicitacao) => {
      // Compara pela CHAVE CANÔNICA: o banco grava CANCELADO e CANCELADA
      // (RECUSADO e RECUSADA) para o mesmo estado, e filtrar por igualdade
      // crua deixava metade dos registros de fora do próprio filtro.
      const statusOk = statusSelecionados.size === 0
        || statusSelecionados.has(chaveStatusCompra(solicitacao.status));

      if (!statusOk) {
        return false;
      }

      if (!termo) {
        return true;
      }

      const obraNome = String(solicitacao.obra?.nome || '').toLowerCase();
      const obraCodigo = String(solicitacao.obra?.codigo || '').toLowerCase();
      const solicitante = String(solicitacao.solicitante?.nome || '').toLowerCase();
      const codigo = codigoSolicitacao(solicitacao).toLowerCase();

      return (
        obraNome.includes(termo) ||
        obraCodigo.includes(termo) ||
        solicitante.includes(termo) ||
        codigo.includes(termo)
      );
    });
  }, [busca, solicitacoes, ativos.status]);

  const idsFiltrados = useMemo(
    () => solicitacoesFiltradas.map((solicitacao) => Number(solicitacao.id)).filter(Boolean),
    [solicitacoesFiltradas]
  );
  const idsSelecionadosEncaminhaveis = useMemo(() => {
    const ids = new Set(selecionadas);
    return solicitacoesFiltradas
      .filter((solicitacao) => ids.has(Number(solicitacao.id)) && estaAguardandoRevisaoGeo(solicitacao.status))
      .map((solicitacao) => Number(solicitacao.id));
  }, [selecionadas, solicitacoesFiltradas]);

  useEffect(() => {
    setSelecionadas((atuais) => atuais.filter((id) => idsFiltrados.includes(id)));
  }, [idsFiltrados]);

  function toggleSelecionada(id) {
    const key = Number(id);
    setSelecionadas((atuais) =>
      atuais.includes(key) ? atuais.filter((item) => item !== key) : [...atuais, key]
    );
  }

  function toggleTodasSelecionadas(marcar, ids) {
    setSelecionadas(marcar ? ids.map((id) => Number(id)).filter(Boolean) : []);
  }

  async function handleBaixarPdf(id) {
    try {
      const blob = await baixarPdfSolicitacaoCompra(id);
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 10000);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao gerar PDF');
    }
  }

  async function handleInativar(ids) {
    /*
      R26: o alvo é FIXADO numa `const` ANTES do `await` da confirmação. O
      modal do sistema NÃO congela a página (o `window.confirm` congelava):
      entre a pergunta e a ação a pessoa pode marcar outra linha, e reler
      `selecionadas` depois do `await` faria a tela perguntar sobre um lote e
      inativar outro — com a auditoria registrando um consentimento válido
      para o lote errado.
    */
    const alvo = [...new Set(
      (Array.isArray(ids) ? ids : [ids])
        .map((id) => Number(id))
        .filter(Boolean)
    )];

    if (!alvo.length) {
      avisar.alerta('Selecione ao menos uma solicitação de compra.');
      return;
    }

    // R21: `confirmar` devolve `{ ok, texto }` — objeto é SEMPRE truthy.
    // Sem desestruturar, o "Cancelar" seguiria com a inativação.
    const { ok } = await confirmar({
      titulo: 'Inativar solicitações de compra',
      mensagem: `Inativar ${alvo.length} solicitacao(oes) de compra selecionada(s)? As solicitacoes saem da fila operacional.`,
      rotuloConfirmar: 'Inativar',
      rotuloCancelar: 'Manter',
      destrutiva: true
    });
    if (!ok) {
      return;
    }

    try {
      setInativando(true);
      if (alvo.length === 1) {
        await inativarSolicitacaoCompra(alvo[0]);
      } else {
        await inativarSolicitacoesCompra(alvo);
      }
      setSelecionadas([]);
      await carregarSolicitacoes();
      avisar.sucesso('Solicitação(oes) de compra inativada(s) com sucesso.');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao inativar solicitacao de compra');
    } finally {
      setInativando(false);
    }
  }

  async function handleEncaminharCompras(ids) {
    // R26: mesma disciplina do `handleInativar` — alvo fixado antes do await.
    const alvo = [...new Set(
      (Array.isArray(ids) ? ids : [ids])
        .map((id) => Number(id))
        .filter(Boolean)
    )];

    if (!alvo.length) {
      avisar.alerta('Selecione ao menos uma solicitação de compra.');
      return;
    }

    const { ok } = await confirmar({
      titulo: 'Enviar para a fila de Compras',
      mensagem: `Enviar ${alvo.length} solicitacao(oes) para a fila do setor de Compras?`,
      rotuloConfirmar: 'Enviar'
    });
    if (!ok) {
      return;
    }

    try {
      setEncaminhando(true);
      if (alvo.length === 1) {
        await encaminharSolicitacaoCompraParaCompras(alvo[0]);
      } else {
        await encaminharSolicitacoesCompraParaCompras(alvo);
      }
      setSelecionadas([]);
      await carregarSolicitacoes();
      avisar.sucesso('Solicitação(oes) enviada(s) para a fila do setor de Compras.');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao enviar solicitacao para Compras');
    } finally {
      setEncaminhando(false);
    }
  }

  const colunas = [
    {
      id: 'codigo',
      titulo: 'Código',
      tipo: 'codigo',
      render: (solicitacao) => codigoSolicitacao(solicitacao)
    },
    {
      id: 'obra',
      titulo: 'Obra',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (solicitacao) => (
        <CelulaDupla
          principal={solicitacao.obra?.nome || '-'}
          sub={solicitacao.obra?.codigo || '-'}
        />
      )
    },
    {
      id: 'solicitante',
      titulo: 'Solicitante',
      tipo: 'texto',
      render: (solicitacao) => solicitacao.solicitante?.nome || '-'
    },
    {
      id: 'itens',
      titulo: 'Itens',
      tipo: 'numero',
      render: (solicitacao) => (
        solicitacao.itens_count
          ?? ((solicitacao.itens?.length || 0) + (solicitacao.itensManuais?.length || 0))
      )
    },
    {
      id: 'fornecedores',
      titulo: 'Fornecedores',
      tipo: 'numero',
      render: (solicitacao) => solicitacao.fornecedores_count ?? (solicitacao.fornecedores?.length || 0)
    },
    {
      id: 'necessario_para',
      titulo: 'Necessario para',
      tipo: 'data',
      render: (solicitacao) => formatarData(solicitacao.necessario_para)
    },
    {
      id: 'criada_em',
      titulo: 'Criada em',
      tipo: 'data',
      render: (solicitacao) => formatarData(solicitacao.createdAt)
    },
    {
      /*
        A etiqueta de status era montada com um mapa de paleta crua que NÃO
        tratava CANCELADO/RECUSADO: os dois caíam no `return` final, índigo —
        a mesma cor reservada ao status que a tela não conhece. Quem opera a
        fila não distinguia "morreu" de "não sei", e as telas irmãs pintavam o
        mesmo valor de outras duas cores.

        Agora: `StatusBadge` + mapa semântico explícito
        (`utils/statusCompras.js`), com cancelada/recusada em família própria
        (`danger`). Quando o estado NÃO está no mapa, `familiaStatusCompra`
        devolve `null` e o classificador do sistema decide — desconhecido
        continua sendo desconhecido, em vez de virar uma cor com significado.
      */
      id: 'status',
      titulo: 'Status',
      tipo: 'status',
      render: (solicitacao) => (
        <StatusBadge
          status={rotuloStatusCompra(solicitacao.status)}
          kind={familiaStatusCompra(solicitacao.status) || undefined}
        />
      )
    }
  ];

  return (
    <Pagina className="compras-solicitacoes-page">
      <PageHeader
        titulo="Solicitações de Compra"
        contagem={loading ? null : `${solicitacoesFiltradas.length} solicitacao(oes)`}
        descricao="Acompanhe as solicitações de compra criadas no módulo e gere o PDF quando necessário."
        acaoPrincipal={{
          rotulo: 'Nova solicitação',
          onClick: () => navigate('/solicitacoes-compra/nova')
        }}
        secundarias={[
          {
            rotulo: loading ? 'Atualizando...' : 'Atualizar',
            onClick: carregarSolicitacoes,
            desabilitada: loading
          },
          podeEncaminharCompras && idsSelecionadosEncaminhaveis.length > 0 && {
            rotulo: encaminhando
              ? 'Enviando...'
              : `Enviar para Compras (${idsSelecionadosEncaminhaveis.length})`,
            onClick: () => handleEncaminharCompras(idsSelecionadosEncaminhaveis),
            desabilitada: encaminhando
          }
        ]}
        destrutiva={podeInativar && selecionadas.length > 0 ? {
          rotulo: inativando ? 'Inativando...' : `Inativar selecionadas (${selecionadas.length})`,
          onClick: () => handleInativar(selecionadas),
          desabilitada: inativando
        } : null}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/* R12: o par de `<select>` de obra e status virou marcação. O botão
          "Exibir/Ocultar filtros" que existia só para encolher a grade no
          celular virou o recolher do próprio bloco — mesma capacidade, pelo
          componente padrão. */}
      <BlocoConteudo titulo="Filtros" variante="secundario" recolhivel>
        <BarraFiltros
          busca={visibilidadeFiltros.ehVisivel('busca') ? {
            valor: busca,
            aoMudar: setBusca,
            placeholder: 'Código, obra ou solicitante'
          } : null}
          filtros={dimensoes.filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={ativos}
          aoAlternar={alternarFiltro}
          aoLimpar={limparFiltros}
          visibilidade={visibilidadeFiltros}
        />
      </BlocoConteudo>

      <BlocoConteudo
        variante="primario"
        cor="var(--sem-info)"
        descricao={podeSelecionar && selecionadas.length > 0
          ? `${selecionadas.length} selecionada(s) para acao em lote`
          : undefined}
      >
        <TabelaPadrao
          colunas={colunas}
          itens={solicitacoesFiltradas}
          carregando={loading}
          vazio="Nenhuma solicitação de compra encontrada."
          storageKey="tabela:solicitacoes-compra"
          rotuloRolagem="Solicitacoes de compra"
          /*
            A marcação em lote (com o "todos" no cabeçalho e o estado
            indeterminado) é capacidade do próprio TabelaPadrao — a coluna de
            checkbox montada à mão e o botão "Selecionar todas" faziam o mesmo
            trabalho por fora. R16: uma responsabilidade, um dono.
          */
          selecao={podeSelecionar ? {
            selecionados: selecionadas,
            aoAlternar: (id) => toggleSelecionada(id),
            aoAlternarTodos: toggleTodasSelecionadas
          } : undefined}
          acoesLinha={(solicitacao) => (
            <>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => navigate(`/solicitacoes-compra/${solicitacao.id}`)}
                title="Abrir detalhes"
                aria-label={`Abrir detalhes da solicitação ${codigoSolicitacao(solicitacao)}`}
              >
                <HiOutlineEye />
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => handleBaixarPdf(solicitacao.id)}
                title="Baixar PDF"
                aria-label={`Baixar PDF da solicitação ${codigoSolicitacao(solicitacao)}`}
              >
                <HiOutlineArrowDownTray />
              </button>
              {podeEncaminharCompras && estaAguardandoRevisaoGeo(solicitacao.status) ? (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => handleEncaminharCompras([solicitacao.id])}
                  title="Enviar para fila de Compras"
                  aria-label={`Enviar solicitação ${codigoSolicitacao(solicitacao)} para Compras`}
                  disabled={encaminhando}
                >
                  <HiOutlinePaperAirplane />
                </button>
              ) : null}
              {podeInativar ? (
                <button
                  type="button"
                  className="btn btn-outline btn-sm btn-perigo-suave"
                  onClick={() => handleInativar([solicitacao.id])}
                  title="Inativar solicitação"
                  aria-label={`Inativar solicitação ${codigoSolicitacao(solicitacao)}`}
                  disabled={inativando}
                >
                  <HiOutlineTrash />
                </button>
              ) : null}
            </>
          )}
          larguraAcoes={220}
        />
      </BlocoConteudo>

      {elementoConfirmacao}
    </Pagina>
  );
}
