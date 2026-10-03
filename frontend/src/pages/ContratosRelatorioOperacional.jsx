import { useEffect, useMemo, useState } from 'react';
import {
  BarraFiltros,
  BlocoConteudo,
  BlocosPersonalizaveis,
  CelulaDupla,
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  TabelaPadrao,
  useFiltrosVisiveis
} from '../components/padrao';
import { getObras } from '../services/obras';
import { getContratosRelatorioOperacional } from '../services/contratos';

/*
  LIMITES REAIS DO SERVIDOR — o backend TRUNCA duas listas deste relatório
  (backend/src/controllers/ContratoController.js):
    por_referencia        → 50 primeiras (ordenadas por valor)
    pendencias_cadastrais → 80 primeiras
  Antes desta migração os títulos "Contratos por referencia" e "Pendencias
  cadastrais" prometiam o CONJUNTO e o contador ao lado mostrava só o que
  tinha chegado. Com 51 referências o rótulo dizia "50 linha(s)" e a pessoa
  lia isso como "existem 50". Os limites viram texto na tela (`descricao`) e
  a contagem passa a dizer de que recorte ela fala.
*/
const LIMITE_REFERENCIAS = 50;
const LIMITE_PENDENCIAS = 80;

const FILTROS_VAZIOS = {
  obra_id: '',
  ref: '',
  codigo: '',
  status_operacional: '',
  data_inicio: '',
  data_fim: ''
};

const STATUS_CONTRATO = [
  { valor: 'ATIVO', rotulo: 'Ativo · parcialmente medido' },
  { valor: 'TOTALMENTE_MEDIDO', rotulo: 'Totalmente medido' },
  { valor: 'CONCLUIDO', rotulo: 'Concluído' },
  { valor: 'RESCINDIDO', rotulo: 'Rescindido' }
];

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function number(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function monthLabel(value) {
  if (!value || !/^\d{4}-\d{2}$/.test(String(value))) return value || '-';
  const [year, month] = String(value).split('-');
  return `${month}/${year}`;
}

/**
 * Bloco de agrupamento (empresa / obra / referência / status).
 * `descricao` e `contagem` moram no BlocoConteudo (R5): o texto de apoio
 * ancora no bloco a que se refere, não solto em `page-subtitle`.
 */
function BlocoGrupo({ titulo, descricao, rows, storageKey, labelHeader = 'Descrição', formatLabel }) {
  return (
    <BlocoConteudo
      titulo={titulo}
      contagem={`${number(rows.length)} linha(s)`}
      descricao={descricao}
    >
      <TabelaPadrao
        colunas={[
          {
            id: 'label',
            titulo: labelHeader,
            // R17: a empresa/obra/referencia/status agrupada nomeia a linha.
            tipo: 'identidade',
            noCard: 'titulo',
            /*
              T6 — A CÉLULA É SEMPRE CelulaDupla, TENHA EMPRESA OU NÃO.

              Sem empresa o render devolvia a STRING SOLTA, e string solta
              nesta coluna é cortada no meio da palavra: estes quatro blocos
              vivem num grid de duas colunas, a tabela nasce no piso (1090px
              num contêiner de 569px) e a coluna de conteúdo desce ao seu
              mínimo de 160px. Aí "RETROESCAVADEIRA" não cabe, não quebra
              (`overflow-wrap: normal` na `.app-tabela`, para não partir
              palavra) e o `td` recorta com `overflow: hidden` — sem `title`
              em nenhum ANCESTRAL, que é onde a T6 procura o tooltip.

              Na CelulaDupla quem trunca é o span (nowrap + reticências) e o
              texto completo fica no `title` do wrapper, acima dele. Tooltip
              declarado na célula, não dependente de medição em runtime.
            */
            render: (row) => (
              <CelulaDupla
                principal={formatLabel ? formatLabel(row.label) : row.label}
                sub={row.empresa || null}
              />
            )
          },
          { id: 'total', titulo: 'Contratos', tipo: 'numero', render: (row) => number(row.total) },
          { id: 'ativos', titulo: 'Ativos', tipo: 'numero', render: (row) => number(row.ativos) },
          { id: 'sem_anexo', titulo: 'Sem anexo', tipo: 'numero', render: (row) => number(row.sem_anexo) },
          { id: 'contratado', titulo: 'Contratado', tipo: 'valor', render: (row) => money(row.contratado) },
          { id: 'medido', titulo: 'Medido', tipo: 'valor', render: (row) => money(row.medido) },
          { id: 'movimentado', titulo: 'Movimentado', tipo: 'valor', render: (row) => money(row.movimentado) },
          { id: 'saldo_contratual', titulo: 'Saldo', tipo: 'valor', render: (row) => money(row.saldo_contratual) }
        ]}
        itens={rows}
        getId={(row) => `${row.label}-${rows.indexOf(row)}`}
        storageKey={storageKey}
        rotuloRolagem={titulo}
        vazio="Nenhum dado encontrado para os filtros."
      />
    </BlocoConteudo>
  );
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
  { id: 'codigo', rotulo: 'Código' },
  { id: 'ref', rotulo: 'Referência' },
  { id: 'data_inicio', rotulo: 'Data inicial' },
  { id: 'data_fim', rotulo: 'Data final' },
  { id: 'obra_id', rotulo: 'Obra/Centro' },
  { id: 'status_operacional', rotulo: 'Status' }
];

export default function ContratosRelatorioOperacional() {
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [obras, setObras] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  async function carregar(params = filtros) {
    try {
      setLoading(true);
      setErro('');
      const response = await getContratosRelatorioOperacional(params);
      setData(response);
    } catch (error) {
      console.error(error);
      setErro(error?.message || 'Erro ao carregar relatório de contratos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
    getObras()
      .then((lista) => setObras(Array.isArray(lista) ? lista : []))
      .catch((error) => console.error(error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resumo = data?.resumo || {};
  const porMes = useMemo(() => (Array.isArray(data?.por_mes_cadastro) ? data.por_mes_cadastro : []), [data]);
  const maxMes = useMemo(
    () => Math.max(...porMes.map((item) => Number(item.total || 0)), 0),
    [porMes]
  );
  const pendencias = useMemo(
    () => (Array.isArray(data?.pendencias_cadastrais) ? data.pendencias_cadastrais : []),
    [data]
  );

  /*
    R12 — os recortes ENUMERÁVEIS viram marcação com etiqueta removível.
    `unico: true` nas duas: o serviço (`getContratosRelatorioOperacional`)
    manda `obra_id` e `status_operacional` como UM valor cada; marcar dois com caixa
    quadrada mostraria duas etiquetas e mandaria uma só — capacidade
    aparente sem efeito (a família da R15). Marca redonda, marcar outro
    substitui.
  */
  const ativos = useMemo(() => ({
    obra_id: new Set(filtros.obra_id ? [String(filtros.obra_id)] : []),
    status_operacional: new Set(filtros.status_operacional ? [String(filtros.status_operacional)] : [])
  }), [filtros]);

  const dimensoes = useMemo(() => [
    {
      id: 'obra_id',
      rotulo: 'Obra/Centro',
      unico: true,
      opcoes: obras.map((obra) => ({
        valor: String(obra.id),
        rotulo: `${obra.codigo ? `${obra.codigo} - ` : ''}${obra.nome}`
      }))
    },
    { id: 'status_operacional', rotulo: 'Status', unico: true, opcoes: STATUS_CONTRATO }
  ], [obras]);
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => String(filtros[filtro.id] ?? '').trim() !== '').map((filtro) => filtro.id),
    [filtros]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:contratos-relatorio-operacional', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => {
      /* O relatório é buscado por `carregar`, não por efeito sobre o
         estado: limpar sem recarregar deixaria a consulta em curso
         recortada por um critério que já saiu da faixa. */
      const proximos = { ...filtros, [id]: FILTROS_VAZIOS[id] ?? '' };
      setFiltros(proximos);
      carregar(proximos);
    }
  });

  function atualizarCampo(campo, valor) {
    setFiltros((atual) => ({ ...atual, [campo]: valor }));
  }

  function alternarFiltro(dimensao, valor) {
    setFiltros((atual) => ({
      ...atual,
      [dimensao]: String(atual[dimensao]) === String(valor) ? '' : String(valor)
    }));
  }

  async function aplicarFiltros() {
    await carregar(filtros);
  }

  async function limpar() {
    setFiltros(FILTROS_VAZIOS);
    await carregar(FILTROS_VAZIOS);
  }

  return (
    <Pagina>
      {/*
        R23 — EXCEÇÃO DE CONSULTA CARA, medida nesta tela e não copiada da
        irmã: são CINCO recortes que a pessoa combina (obra, status, código,
        referência e o intervalo de datas), acima do gatilho de 4+ da regra.
        Por isso o recorte fica em RASCUNHO até o clique, o botão diz o que
        faz ("Atualizar relatório", não "Aplicar filtros") e a descrição
        avisa — sem o aviso a etiqueta aparece ao marcar e é lida como
        filtro já aplicado, o que seria mentira (F3).

        R11: "Voltar aos relatórios" e "Gestão de contratos" saíram — eram
        navegação para telas irmãs disfarçada de ação; menu, breadcrumb e
        Ctrl+K resolvem. Sobram as duas AÇÕES de verdade da tela.
      */}
      <PageHeader
        titulo="Painel operacional de contratos"
        descricao="Marque o recorte e clique em Atualizar relatório: com cinco filtros combináveis, a consulta só roda no clique."
        acaoPrincipal={{
          rotulo: loading ? 'Atualizando...' : 'Atualizar relatório',
          onClick: aplicarFiltros,
          desabilitada: loading
        }}
        secundarias={[{ rotulo: 'Limpar', onClick: limpar, desabilitada: loading }]}
      />

      <BlocoConteudo variante="secundario">
        {/*
          R16b: código e referência são texto LIVRE (o backend faz LIKE
          parcial) e data inicial/final são recorte CONTÍNUO — os quatro vão
          em `campos`. Obra e status são enumeráveis e vão em `filtros`.
        */}
        <BarraFiltros
          campos={[
            {
              id: 'codigo',
              rotulo: 'Código',
              tipo: 'text',
              placeholder: 'Trecho do código',
              valor: filtros.codigo,
              aoMudar: (valor) => atualizarCampo('codigo', valor)
            },
            {
              id: 'ref',
              rotulo: 'Referência',
              tipo: 'text',
              placeholder: 'Trecho da referência',
              valor: filtros.ref,
              aoMudar: (valor) => atualizarCampo('ref', valor)
            },
            {
              id: 'data_inicio',
              rotulo: 'Data inicial',
              tipo: 'date',
              valor: filtros.data_inicio,
              aoMudar: (valor) => atualizarCampo('data_inicio', valor)
            },
            {
              id: 'data_fim',
              rotulo: 'Data final',
              tipo: 'date',
              valor: filtros.data_fim,
              aoMudar: (valor) => atualizarCampo('data_fim', valor)
            }
          ].filter((campo) => visibilidadeFiltros.ehVisivel(campo.id))}
          filtros={dimensoes.filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={ativos}
          aoAlternar={alternarFiltro}
          aoLimpar={limpar}
          visibilidade={visibilidadeFiltros}
        />
      </BlocoConteudo>

      {erro ? <div className="app-alert app-alert--error">{erro}</div> : null}

      {loading ? (
        <div className="app-empty-card">Carregando relatório de contratos...</div>
      ) : (
        <>
          {/*
            O `resumo` é calculado pelo servidor sobre TODOS os contratos do
            filtro (não sobre uma página), então estes números podem prometer
            o conjunto sem mentir.
          */}
          <StatGrid>
            <StatTile label="Contratos" valor={number(resumo.total_contratos)} sub={`${number(resumo.ativos)} ativo(s)`} />
            <StatTile label="Contratado" valor={money(resumo.contratado)} sub="Valor base + aditivos e ajustes legados" tom="success" />
            <StatTile label="Saldo" valor={money(resumo.saldo_contratual)} sub="Contratado menos medido" tom={Number(resumo.saldo_contratual || 0) > 0 ? 'warning' : undefined} />
            <StatTile label="Sem anexo" valor={number(resumo.sem_anexo)} sub="Pendência documental explícita" tom={Number(resumo.sem_anexo || 0) > 0 ? 'danger' : 'success'} />
            <StatTile label="Medido" valor={money(resumo.medido)} sub="Medições válidas dos dois fluxos" />
            <StatTile label="Movimentado" valor={money(resumo.movimentado)} sub="Baixas e pagamentos com evidência financeira" tom="success" />
            <StatTile label="Aditivos" valor={money(resumo.aditivos)} sub="Aditivos formais + ajustes legados identificados" />
            <StatTile label="Solicitações vinculadas" valor={number(resumo.solicitacoes_vinculadas)} sub="Vínculos reais com solicitações" />
            <StatTile label="Fora de execução" valor={number(resumo.inativos)} sub="Totalmente medidos, concluídos ou rescindidos" />
          </StatGrid>

          {/*
            BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
            em que ligar isto é SEGURO: estes 3 blocos são leituras
            independentes — sem ordem obrigatória entre si, sem botão de gravar
            dentro e sem campo obrigatório que ocultar esconda. O padrão continua
            sendo o do código; a preferência guarda só o DESVIO. No celular o
            modo não existe (arrastar é HTML5 nativo e não responde a toque).
          */}
          <BlocosPersonalizaveis
            chave="blocos:contratos-relatorio-operacional"
            larguraPadrao="total"
            dentroDeGrade
          >
            <BlocoConteudo
              titulo="Cadastros por mês"
              contagem={`${number(porMes.length)} mês(es)`}
              descricao="Evolução baseada na data real de cadastro do contrato."
            >
              <div className="space-y-3">
                {porMes.length === 0 ? (
                  <div className="app-empty-card">Nenhum contrato no período.</div>
                ) : porMes.map((item) => {
                  const total = Number(item.total || 0);
                  /*
                    Largura mínima cravada REMOVIDA: era
                    `Math.max((total / maxMes) * 100, 4)`, que desenhava uma
                    barra visível para o mês de ZERO contrato — o gráfico
                    afirmava volume onde não havia nenhum. Zero agora é
                    largura zero; o número ao lado continua dizendo quanto é.
                  */
                  const width = maxMes > 0 ? Math.round((total / maxMes) * 100) : 0;
                  return (
                    <div key={item.label} className="grid gap-2 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
                      <span className="text-sm font-semibold text-[var(--c-text)]">{monthLabel(item.label)}</span>
                      {/* A largura em % é DADO (a proporção da barra), não medida
                          de layout — por isso continua no style. Trilho e
                          preenchimento vêm de token (R25). */}
                      <div className="h-3 overflow-hidden rounded-full bg-[var(--ui-border)]">
                        <div className="h-full rounded-full bg-[var(--c-primary)]" style={{ width: `${width}%` }} />
                      </div>
                      <span className="text-right text-sm font-semibold tabular-nums text-[var(--c-text)]">{number(total)}</span>
                    </div>
                  );
                })}
              </div>
            </BlocoConteudo>

            <div data-bloco-id="contratos-por-empresa-do-grupo" data-bloco-rotulo="Contratos por empresa do grupo" className="grid gap-4 xl:grid-cols-2">
              <BlocoGrupo
                titulo="Contratos por empresa do grupo"
                descricao="Todas as empresas do recorte."
                rows={data?.por_empresa || []}
                storageKey="tabela:contratos-relatorio-operacional:empresas"
                labelHeader="Empresa"
              />
              <BlocoGrupo
                titulo="Contratos por obra/centro"
                descricao="Todas as obras/centros do recorte."
                rows={data?.por_obra || []}
                storageKey="tabela:contratos-relatorio-operacional:obras"
                labelHeader="Obra/Centro"
              />
              <BlocoGrupo
                titulo="Contratos por referência"
                // O servidor devolve no máximo 50 referências, ordenadas por
                // valor — o rótulo tem de dizer isso (ver LIMITE_REFERENCIAS).
                descricao={`As ${LIMITE_REFERENCIAS} referências de maior valor no recorte — o servidor não devolve as demais.`}
                rows={data?.por_referencia || []}
                storageKey="tabela:contratos-relatorio-operacional:referencias"
                labelHeader="Referência"
              />
              <BlocoGrupo
                titulo="Contratos por status"
                descricao="Todos os status do recorte."
                rows={data?.por_status || []}
                storageKey="tabela:contratos-relatorio-operacional:status"
                labelHeader="Status"
              />
            </div>

            <BlocoConteudo
              titulo="Pendências cadastrais"
              // Antes: "N contrato(s)" ao lado de um título que prometia TODAS
              // as pendências. Com mais de 80 o contador parava em 80 e ninguém
              // ficava sabendo. Agora a contagem diz de que lista ela fala.
              contagem={`${number(pendencias.length)} contrato(s) nesta lista`}
              descricao={`Apenas pendências explícitas: sem anexo, sem empresa vinculada na obra/centro, sem referência ou valor zerado. O servidor devolve no máximo ${LIMITE_PENDENCIAS} contratos, dos maiores valores para os menores.`}
              variante="primario"
              cor="var(--module-contratos)"
            >
              <TabelaPadrao
                colunas={[
                  {
                    id: 'contrato',
                    titulo: 'Contrato',
                    // R17: o codigo do contrato nomeia a pendencia listada.
                    tipo: 'identidade',
                    noCard: 'titulo',
                    // T6, mesmo motivo dos blocos de agrupamento: a coluna de
                    // conteúdo desta tabela também nasce no piso de 160px (as
                    // outras seis somam mais que o contêiner), e o código do
                    // contrato aqui é texto livre — "CONTRATO DE PRESTAÇÃO DE
                    // SERVIÇO DE RETROESCAVADEIRA…" é um valor real da base.
                    render: (item) => <CelulaDupla principal={item.codigo} />
                  },
                  /*
                    As três colunas de texto livre abaixo levam o MESMO
                    conteúdo (descrição de contrato, nome de obra, razão
                    social) com 180px — um degrau só acima do piso onde a de
                    identidade já corta. Palavra de ~19 caracteres estoura
                    também aqui, então elas seguem o mesmo caminho: truncam no
                    span e levam o texto inteiro no `title` da CelulaDupla.
                  */
                  { id: 'referencia', titulo: 'Referência', tipo: 'texto', render: (item) => <CelulaDupla principal={item.referencia || '-'} /> },
                  { id: 'obra', titulo: 'Obra/Centro', tipo: 'texto', render: (item) => <CelulaDupla principal={item.obra || '-'} /> },
                  { id: 'empresa', titulo: 'Empresa', tipo: 'texto', render: (item) => <CelulaDupla principal={item.empresa || '-'} /> },
                  { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (item) => money(item.valor_total) },
                  { id: 'saldo', titulo: 'Saldo', tipo: 'valor', render: (item) => money(item.total_a_pagar) },
                  {
                    id: 'pendencias',
                    titulo: 'Pendências',
                    tipo: 'texto',
                    render: (item) => (
                      <div className="flex flex-wrap gap-1">
                        {(item.pendencias || []).map((pendencia) => (
                          // fx-badge é a pílula do sistema (token + ícone);
                          // substitui o par bg-amber-50/text-amber-700 escrito
                          // à mão, que não tem par no tema escuro (R25).
                          <span key={pendencia} className="fx-badge fx-badge--warning">
                            {pendencia}
                          </span>
                        ))}
                      </div>
                    )
                  }
                ]}
                itens={pendencias}
                getId={(item) => item.id}
                storageKey="tabela:contratos-relatorio-operacional:pendencias"
                rotuloRolagem="Pendências cadastrais"
                vazio="Nenhuma pendência cadastral nos filtros atuais."
              />
            </BlocoConteudo>
          </BlocosPersonalizaveis>
        </>
      )}
    </Pagina>
  );
}
