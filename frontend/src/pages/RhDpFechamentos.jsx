import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Avisos,
  BarraFiltros,
  BlocoConteudo,
  CelulaDupla,
  PageHeader,
  Pagina,
  StatGrid,
  StatTile,
  TabelaPadrao,
  alternarValorFiltro,
  useAvisos,
  useConfirmacao,
  useFiltrosVisiveis
} from '../components/padrao';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { getObras } from '../services/obras';
import {
  getRhEmpresasGrupo,
  getRhFechamento,
  getRhFechamentoComprovanteLink,
  getRhFechamentos,
  reabrirRhFechamento
} from '../services/rhDp';
import {
  canReopenRhDpFechamento
} from '../utils/acessoProduto';

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

// R12: os recortes enumeráveis viram MARCAÇÃO (conjunto por dimensão);
// competência é contínua e vive na prop `campos` da BarraFiltros (R16b).
const DIMENSOES = ['empresa_grupo_id', 'obra_id', 'status'];

function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

// A pílula de status é do StatusBadge (dono único, R16). O `kind` preserva
// as MESMAS famílias que as classes escritas à mão usavam: fechado =
// sucesso, estornado = perigo, o resto neutro.
function familiaStatus(status) {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'FECHADO') return 'success';
  if (normalized === 'ESTORNADO') return 'danger';
  return 'neutral';
}

function conjuntoDeParam(searchParams, chave) {
  return new Set(searchParams.getAll(chave).filter(Boolean).map(String));
}

// A API do fechamento recebe UM valor por recorte. Com exatamente uma marca
// o filtro continua indo para o servidor (mesma consulta de antes); com duas
// ou mais, o servidor devolve o conjunto amplo e a marcação estreita aqui —
// senão a marcação múltipla ficaria mentindo na tela.
function unico(conjunto) {
  return conjunto && conjunto.size === 1 ? conjunto.values().next().value : undefined;
}

function combina(conjunto, valor) {
  if (!conjunto || conjunto.size === 0) return true;
  return conjunto.has(String(valor ?? ''));
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
*/
const FILTROS_DA_TELA = [
  { id: 'competencia', rotulo: 'Competência' },
  { id: 'empresa_grupo_id', rotulo: 'Empresa do grupo' },
  { id: 'obra_id', rotulo: 'Obra' },
  { id: 'status', rotulo: 'Status' }
];

export default function RhDpFechamentos({ comoAba = false }) {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [empresas, setEmpresas] = useState([]);
  const [obras, setObras] = useState([]);
  const [fechamentos, setFechamentos] = useState([]);
  const [detalhe, setDetalhe] = useState(null);
  const [carregandoBase, setCarregandoBase] = useState(false);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [reabrindo, setReabrindo] = useState(false);
  const [filtros, setFiltros] = useState(() => ({
    competencia: searchParams.get('competencia') || '',
    empresa_grupo_id: conjuntoDeParam(searchParams, 'empresa_grupo_id'),
    obra_id: conjuntoDeParam(searchParams, 'obra_id'),
    status: conjuntoDeParam(searchParams, 'status')
  }));
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => {
      const valor = filtros[filtro.id];
      return valor instanceof Set ? valor.size > 0 : String(valor ?? '').trim() !== '';
    }).map((filtro) => filtro.id),
    [filtros]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:rh-dp-fechamentos:lista', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => {
      setFiltros((atual) => ({ ...atual, [id]: atual[id] instanceof Set ? new Set() : '' }));
    }
  });
  const detalheCarregado = useRef(null);
  const detalheRef = useRef(null);
  const rolarDetalheAposCarregar = useRef(false);
  // A sincronia da URL roda dentro de um timeout: sem esta referência ela
  // leria os parâmetros do render em que foi agendada e podia apagar um
  // fechamento_id escolhido no meio do caminho.
  const paramsAtuais = useRef(searchParams);

  useEffect(() => {
    paramsAtuais.current = searchParams;
  }, [searchParams]);

  useEffect(() => {
    carregarBase();
  }, []);

  // Filtro marcado aplica na hora (padrão Solicitações); a competência
  // digitada espera 350ms para não martelar a API a cada tecla.
  useEffect(() => {
    const atraso = setTimeout(() => {
      sincronizarUrl(filtros);
      carregarFechamentos(filtros);
    }, 350);
    return () => clearTimeout(atraso);
  }, [filtros]);

  useEffect(() => {
    const fechamentoId = searchParams.get('fechamento_id');
    if (!fechamentoId) {
      detalheCarregado.current = null;
      return;
    }
    // A URL muda a cada marca de filtro; o detalhe só recarrega quando o
    // fechamento apontado muda de verdade.
    if (detalheCarregado.current === fechamentoId) {
      return;
    }
    detalheCarregado.current = fechamentoId;
    abrirFechamento(fechamentoId);
  }, [searchParams]);

  useEffect(() => {
    if (!detalhe?.id || !rolarDetalheAposCarregar.current) return;

    rolarDetalheAposCarregar.current = false;
    const frame = requestAnimationFrame(rolarParaDetalhe);

    return () => cancelAnimationFrame(frame);
  }, [detalhe?.id]);

  function rolarParaDetalhe() {
    const reduzirMovimento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    detalheRef.current?.scrollIntoView({
      behavior: reduzirMovimento ? 'auto' : 'smooth',
      block: 'start'
    });
    detalheRef.current?.focus({ preventScroll: true });
  }

  async function carregarBase() {
    try {
      setCarregandoBase(true);
      const [listaEmpresas, listaObras] = await Promise.all([
        getRhEmpresasGrupo({ ativo: true }),
        getObras()
      ]);
      setEmpresas(Array.isArray(listaEmpresas) ? listaEmpresas : []);
      setObras(Array.isArray(listaObras) ? listaObras : []);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar base dos fechamentos RH/DP');
    } finally {
      setCarregandoBase(false);
    }
  }

  async function carregarFechamentos(nextFilters = filtros) {
    try {
      setCarregandoLista(true);
      const params = {
        competencia: nextFilters.competencia || undefined,
        empresa_grupo_id: unico(nextFilters.empresa_grupo_id),
        obra_id: unico(nextFilters.obra_id),
        status: unico(nextFilters.status)
      };
      const data = await getRhFechamentos(params);
      setFechamentos(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar fechamentos RH/DP');
    } finally {
      setCarregandoLista(false);
    }
  }

  async function abrirFechamento(id) {
    try {
      setCarregandoDetalhe(true);
      const data = await getRhFechamento(id);
      setDetalhe(data);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar detalhe do fechamento RH/DP');
    } finally {
      setCarregandoDetalhe(false);
    }
  }

  async function abrirComprovante(item) {
    try {
      const url = await getRhFechamentoComprovanteLink(
        detalhe.id,
        item.fila_id,
        item.legado ? null : item.id
      );
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Nao foi possivel abrir o comprovante de pagamento.');
    }
  }

  function sincronizarUrl(atuais) {
    const vigentes = paramsAtuais.current;
    const proximos = new URLSearchParams();
    // Esta consulta vive dentro de Pessoal. Preservar a aba evita que uma
    // alteração de filtro remova `aba=fechamentos` e devolva o usuário para
    // a primeira aba da página.
    const aba = vigentes.get('aba');
    if (aba) proximos.set('aba', aba);
    if (atuais.competencia) proximos.set('competencia', atuais.competencia);
    DIMENSOES.forEach((dimensao) => {
      Array.from(atuais[dimensao] || []).forEach((valor) => proximos.append(dimensao, valor));
    });
    const fechamentoId = vigentes.get('fechamento_id');
    if (fechamentoId) proximos.set('fechamento_id', fechamentoId);
    if (proximos.toString() !== vigentes.toString()) {
      setSearchParams(proximos, { replace: true });
    }
  }

  function selecionarFechamento(item) {
    rolarDetalheAposCarregar.current = true;

    if (String(detalhe?.id || '') === String(item.id)) {
      rolarParaDetalhe();
      rolarDetalheAposCarregar.current = false;
      return;
    }

    const proximos = new URLSearchParams(paramsAtuais.current);
    proximos.set('fechamento_id', String(item.id));
    setSearchParams(proximos);
  }

  const fechamentosVisiveis = useMemo(() => fechamentos.filter((item) => (
    combina(filtros.empresa_grupo_id, item.apuracao?.empresa_grupo_id)
    && combina(filtros.obra_id, item.apuracao?.obra_id)
    && combina(filtros.status, item.status)
  )), [fechamentos, filtros]);

  const resumo = useMemo(() => {
    return fechamentosVisiveis.reduce(
      (acc, item) => {
        acc.quantidade += 1;
        acc.totalTitulos += Number(item.total_titulos || 0);
        acc.totalValor += Number(item.total_valor || 0);
        return acc;
      },
      {
        quantidade: 0,
        totalTitulos: 0,
        totalValor: 0
      }
    );
  }, [fechamentosVisiveis]);

  const dimensoesFiltro = useMemo(() => ([
    {
      id: 'empresa_grupo_id',
      rotulo: 'Empresa do grupo',
      opcoes: empresas.map((item) => ({ valor: String(item.id), rotulo: item.nome }))
    },
    {
      id: 'obra_id',
      rotulo: 'Obra',
      opcoes: obras.map((item) => ({
        valor: String(item.id),
        rotulo: item.codigo ? `${item.codigo} - ${item.nome}` : item.nome
      }))
    },
    {
      id: 'status',
      rotulo: 'Status',
      opcoes: [
        { valor: 'FECHADO', rotulo: 'Fechado' },
        { valor: 'ESTORNADO', rotulo: 'Estornado' }
      ]
    }
  ]), [empresas, obras]);

  const podeReabrirFechamento = canReopenRhDpFechamento(user);

  async function reabrirFechamentoAtual() {
    if (!detalhe?.id || !podeReabrirFechamento) {
      return;
    }

    const competencia = detalhe.apuracao?.competencia || 'desta competencia';
    const totalTitulos = Number(detalhe.total_titulos || 0);
    /*
      R3/R19: confirmar e justificar num passo só. Antes eram dois — a
      confirmação do sistema e, logo depois, um `window.prompt` para a
      justificativa. Além de a caixa do navegador ser o que a regra bane,
      pedir em dois passos deixava a pessoa confirmar um estorno e só então
      descobrir que precisava escrever o motivo.
    */
    const { ok, texto: justificativa } = await confirmar({
      titulo: 'Estornar fechamento',
      mensagem: `Estornar o fechamento de ${competencia} (${detalhe.apuracao?.empresaGrupo?.nome || 'empresa do grupo'})? Os ${totalTitulos} titulo(s) ja gerados no financeiro sao cancelados e a apuracao volta a ficar aberta. So e permitido se nenhum desses titulos estiver baixado.`,
      rotuloConfirmar: 'Estornar',
      destrutiva: true,
      campo: {
        rotulo: 'Justificativa do estorno',
        obrigatorio: true,
        multilinha: true
      }
    });
    if (!ok || !justificativa.trim()) return;

    try {
      setReabrindo(true);
      const atualizado = await reabrirRhFechamento(detalhe.id, {
        justificativa: justificativa.trim()
      });
      setDetalhe(atualizado);
      await carregarFechamentos();
      avisar.sucesso('Fechamento estornado e apuração reaberta. O financeiro foi notificado.');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao reabrir fechamento RH/DP');
    } finally {
      setReabrindo(false);
    }
  }

  const Container = comoAba ? 'section' : Pagina;

  return (
    <Container
      className={comoAba ? 'app-pagina rhdp-fechamentos-aba' : 'rhdp-page'}
      aria-label={comoAba ? 'Fechamentos da apuração' : undefined}
    >
      {!comoAba ? (
        <PageHeader
          titulo="Fechamentos"
          contagem={`${resumo.quantidade} fechamento${resumo.quantidade === 1 ? '' : 's'}`}
          descricao="Competências fechadas, títulos gerados no financeiro central e o detalhe do lote."
        />
      ) : null}

      <Avisos avisos={avisos} aoFechar={fechar} />

      <StatGrid colunas={comoAba ? 3 : 2}>
        {comoAba ? <StatTile label="Fechamentos" valor={resumo.quantidade} /> : null}
        <StatTile label="Títulos gerados" valor={resumo.totalTitulos} />
        <StatTile label="Valor total" valor={formatCurrency(resumo.totalValor)} />
      </StatGrid>

      <BlocoConteudo
        titulo="Competências fechadas"
        variante="primario"
        cor="var(--c-primary)"
      >
        {/* R12/R16: o cartao de filtros com grade de select saiu inteiro.
            Competencia (contínua) vai em `campos`; empresa, obra e status
            sao enumeraveis e vao em `filtros`, com marcacao e etiqueta
            removivel. O filtro aplica ao marcar — nao ha mais "Aplicar". */}
        <BarraFiltros
          campos={[{
            id: 'competencia',
            rotulo: 'Competência',
            tipo: 'month',
            valor: filtros.competencia,
            aoMudar: (valor) => setFiltros((atuais) => ({ ...atuais, competencia: valor }))
          }].filter((campo) => visibilidadeFiltros.ehVisivel(campo.id))}
          filtros={dimensoesFiltro.filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={{
            empresa_grupo_id: filtros.empresa_grupo_id,
            obra_id: filtros.obra_id,
            status: filtros.status
          }}
          aoAlternar={(dimensao, valor) => setFiltros((atuais) => alternarValorFiltro(atuais, dimensao, valor))}
          aoLimpar={() => setFiltros({
            competencia: '',
            empresa_grupo_id: new Set(),
            obra_id: new Set(),
            status: new Set()
          })}
          visibilidade={visibilidadeFiltros}
        />

        <TabelaPadrao
          colunas={[
            {
              id: 'competencia',
              titulo: 'Competência',
              tipo: 'codigo',
              render: (item) => item.apuracao?.competencia || '-'
            },
            {
              id: 'empresa',
              titulo: 'Empresa',
              // R17: a EMPRESA do grupo é o que nomeia o lote fechado.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (item) => item.apuracao?.empresaGrupo?.nome || '-'
            },
            {
              id: 'obra',
              titulo: 'Obra',
              tipo: 'texto',
              render: (item) => item.apuracao?.obra?.nome || 'Todas as obras'
            },
            {
              id: 'vencimento',
              titulo: 'Vencimento',
              tipo: 'data',
              render: (item) => formatDate(item.data_vencimento)
            },
            {
              id: 'titulos',
              titulo: 'Títulos',
              tipo: 'numero',
              render: (item) => item.total_titulos || 0
            },
            {
              id: 'valor',
              titulo: 'Valor',
              tipo: 'valor',
              render: (item) => formatCurrency(item.total_valor)
            },
            {
              id: 'status',
              titulo: 'Status',
              tipo: 'status',
              render: (item) => <StatusBadge status={item.status} kind={familiaStatus(item.status)} />
            }
          ]}
          itens={fechamentosVisiveis}
          storageKey="tabela:rh-dp-fechamentos:lista"
          rotuloRolagem="Fechamentos RH/DP"
          carregando={carregandoBase || carregandoLista}
          vazio="Nenhum fechamento encontrado para os filtros atuais."
          acoesLinha={(item) => (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => selecionarFechamento(item)}>
              Abrir
            </button>
          )}
          larguraAcoes={120}
        />
      </BlocoConteudo>

      {detalhe ? (
        <div ref={detalheRef} tabIndex={-1}>
          <BlocoConteudo
            variante="secundario"
            titulo={`Fechamento ${detalhe.apuracao?.competencia || '-'} - ${detalhe.apuracao?.empresaGrupo?.nome || '-'}`}
            descricao={`Recorte: ${detalhe.apuracao?.obra?.nome || 'todas as obras'} · ${detalhe.apuracao?.tipo_vinculo || 'todos os vinculos'}`}
            acoes={(
              <>
                <StatusBadge status={detalhe.status} kind={familiaStatus(detalhe.status)} />
                {String(detalhe.status || '').toUpperCase() === 'FECHADO' && podeReabrirFechamento ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-perigo-suave btn-sm"
                    onClick={reabrirFechamentoAtual}
                    disabled={reabrindo}
                  >
                    {reabrindo ? 'Processando...' : 'Estornar e reabrir'}
                  </button>
                ) : null}
              </>
            )}
          >
            {carregandoDetalhe ? (
              <p className="app-note">Carregando detalhe do fechamento...</p>
            ) : (
              <>
              {/* As datas eram um paragrafo solto sob o titulo; viraram
                  ladrilho como o resto do resumo do lote — mesma informacao,
                  em superficie. */}
              <StatGrid colunas={3}>
                <StatTile label="Títulos gerados" valor={detalhe.total_titulos || 0} />
                <StatTile label="Valor total" valor={formatCurrency(detalhe.total_valor)} />
                <StatTile label="Categoria financeira" valor={detalhe.categoriaFinanceira?.nome || 'Nao informada'} />
                <StatTile label="Fechado em" valor={formatDate(detalhe.data_fechamento)} />
                <StatTile label="Vencimento" valor={formatDate(detalhe.data_vencimento)} />
              </StatGrid>

              {detalhe.observacoes ? (
                <p className="app-note">
                  <strong>Observações:</strong> {detalhe.observacoes}
                </p>
              ) : null}

              <TabelaPadrao
                colunas={[
                  {
                    id: 'colaborador',
                    titulo: 'Colaborador',
                    // R17: o titulo gerado pertence a um COLABORADOR nomeado.
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (item) => (
                      <CelulaDupla
                        principal={item.itemApuracao?.colaborador?.nome || '-'}
                        sub={item.itemApuracao?.colaborador?.matricula || '-'}
                      />
                    )
                  },
                  {
                    id: 'vinculo',
                    titulo: 'Vínculo',
                    tipo: 'badge',
                    render: (item) => item.itemApuracao?.colaborador?.tipo_vinculo || '-'
                  },
                  {
                    id: 'tipo_titulo',
                    titulo: 'Parcela',
                    tipo: 'badge',
                    render: (item) => ({
                      ADIANTAMENTO_40: '40% dia 15',
                      SALDO_60: '60% fim do mes',
                      PENSAO_ALIMENTICIA: 'Pensao',
                      DIARIAS: 'Diarias',
                      INTEGRAL: 'Integral'
                    }[item.tipo_titulo] || item.tipo_titulo || 'Integral')
                  },
                  {
                    id: 'titulo',
                    titulo: 'Título',
                    tipo: 'texto',
                    render: (item) => (item.tituloFinanceiro?.id ? (
                      <Link className="text-[var(--c-primary)] hover:underline" to={`/financeiro/titulos/${item.tituloFinanceiro.id}`}>
                        #{item.tituloFinanceiro.id} - {item.tituloFinanceiro.descricao || 'Titulo'}
                      </Link>
                    ) : '-')
                  },
                  {
                    id: 'parceiro',
                    titulo: 'Parceiro',
                    tipo: 'texto',
                    render: (item) => item.tituloFinanceiro?.parceiro?.nome || '-'
                  },
                  {
                    id: 'obra',
                    titulo: 'Obra',
                    tipo: 'texto',
                    render: (item) => item.tituloFinanceiro?.obra?.nome || '-'
                  },
                  {
                    id: 'valor',
                    titulo: 'Valor',
                    tipo: 'valor',
                    render: (item) => formatCurrency(item.valor_gerado || item.itemApuracao?.valor_liquido)
                  },
                  {
                    id: 'vencimento',
                    titulo: 'Vencimento',
                    tipo: 'data',
                    render: (item) => formatDate(item.tituloFinanceiro?.data_vencimento)
                  },
                  {
                    id: 'comprovantes',
                    titulo: 'Comprovantes',
                    tipo: 'acao',
                    render: (item) => {
                      const comprovantes = item.comprovantes_pagamento || [];
                      if (!comprovantes.length) return <span className="app-note">Pendente</span>;
                      return (
                        <div className="flex flex-wrap gap-2">
                          {comprovantes.map((comprovante, index) => (
                            <button
                              key={`${comprovante.fila_id}-${comprovante.id || 'legado'}-${index}`}
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => abrirComprovante(comprovante)}
                              title={comprovante.nome || `Comprovante ${index + 1}`}
                            >
                              {comprovantes.length === 1 ? 'Abrir comprovante' : `Comprovante ${index + 1}`}
                            </button>
                          ))}
                        </div>
                      );
                    }
                  }
                ]}
                itens={detalhe.titulos || []}
                storageKey="tabela:rh-dp-fechamentos:titulos"
                rotuloRolagem="Títulos do fechamento"
                vazio="Nenhum título foi vinculado a este fechamento."
              />
              </>
            )}
          </BlocoConteudo>
        </div>
      ) : null}

      {elementoConfirmacao}
    </Container>
  );
}
