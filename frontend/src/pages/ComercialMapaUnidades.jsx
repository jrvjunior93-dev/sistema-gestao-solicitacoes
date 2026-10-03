import { useEffect, useMemo, useState } from 'react';
import {
  Avisos,
  BlocoConteudo,
  CampoForm,
  FormSecao,
  PageHeader,
  Pagina,
  StatGrid,
  StatTile,
  useAvisos
} from '../components/padrao';
import StatusBadge from '../components/StatusBadge';
import { getEmpreendimentosComerciais, getTabelasPrecoComerciais, getUnidadesComerciais } from '../services/comercial';

const DESCRICAO = 'Visualize a disponibilidade comercial por empreendimento com leitura rapida de reservas, vendas e tabela ativa.';

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

/*
  R25 — a situação da unidade deixa de ser paleta crua.

  O `statusClass()` pintava o card inteiro com 18 classes de degrau numérico
  do Tailwind (emerald/amber/blue/slate/rose), e os quatro KPIs traziam
  outras 16: sem par no tema escuro e fora do piso de contraste do
  ThemeContext (R24). A distinção por situação, que é
  o que faz o mapa ser um mapa, continua — só que pela família SEMÂNTICA do
  StatusBadge, que é token e vem com ícone junto da cor (a cor sozinha não
  comunica para daltônicos).

  O mapeamento é explícito porque o classificador automático do StatusBadge
  não conhece este vocabulário: DISPONIVEL, RESERVADA, VENDIDA e DISTRATADA
  cairiam todas em `info` e as quatro sairiam da mesma cor — que é
  exatamente a distinção que esta tela existe para mostrar.
*/
const FAMILIA_SITUACAO = {
  DISPONIVEL: 'success',
  RESERVADA: 'warning',
  VENDIDA: 'info',
  DISTRATADA: 'neutral',
  BLOQUEADA: 'danger'
};

function familiaDaSituacao(situacao) {
  return FAMILIA_SITUACAO[String(situacao || '').toUpperCase()] || undefined;
}

function getAgrupador(unidade) {
  return unidade.bloco || unidade.torre || 'Sem agrupamento';
}

export default function ComercialMapaUnidades() {
  const [empreendimentos, setEmpreendimentos] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [tabelas, setTabelas] = useState([]);
  const [empreendimentoId, setEmpreendimentoId] = useState('');
  const [loading, setLoading] = useState(true);
  // R3/R19: erro de carga vira faixa do sistema (Avisos), que tem superfície
  // própria e existe também durante o carregamento (B5).
  const { avisos, avisar, fechar } = useAvisos();

  async function carregar() {
    try {
      setLoading(true);
      const [empreData, unidadesData, tabelasData] = await Promise.all([
        getEmpreendimentosComerciais({ ativo: 1 }),
        getUnidadesComerciais({ ativo: 1 }),
        getTabelasPrecoComerciais({ status: 'ATIVA' })
      ]);
      setEmpreendimentos(Array.isArray(empreData) ? empreData : []);
      setUnidades(Array.isArray(unidadesData) ? unidadesData : []);
      setTabelas(Array.isArray(tabelasData) ? tabelasData : []);
    } catch (err) {
      console.error(err);
      avisar.erro(err?.message || 'Erro ao carregar mapa de unidades');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => {
    if (!empreendimentoId && empreendimentos[0]?.id) {
      setEmpreendimentoId(String(empreendimentos[0].id));
    }
  }, [empreendimentoId, empreendimentos]);

  const unidadesFiltradas = useMemo(
    () => unidades.filter((item) => String(item.empreendimento_id) === String(empreendimentoId)),
    [empreendimentoId, unidades]
  );

  const tabelaAtiva = useMemo(
    () => tabelas.find((item) => String(item.empreendimento_id) === String(empreendimentoId) && String(item.status) === 'ATIVA'),
    [empreendimentoId, tabelas]
  );

  const grupos = useMemo(() => {
    const mapa = new Map();
    for (const unidade of unidadesFiltradas) {
      const chave = getAgrupador(unidade);
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push(unidade);
    }
    return [...mapa.entries()]
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'pt-BR'))
      .map(([nome, itens]) => ({
        nome,
        itens: itens.sort((a, b) => String(a.codigo || '').localeCompare(String(b.codigo || ''), 'pt-BR'))
      }));
  }, [unidadesFiltradas]);

  const resumo = useMemo(() => ({
    disponivel: unidadesFiltradas.filter((item) => item.situacao === 'DISPONIVEL').length,
    reservada: unidadesFiltradas.filter((item) => item.situacao === 'RESERVADA').length,
    vendida: unidadesFiltradas.filter((item) => item.situacao === 'VENDIDA').length,
    bloqueada: unidadesFiltradas.filter((item) => item.situacao === 'BLOQUEADA').length
  }), [unidadesFiltradas]);

  /*
    B5 — no carregamento a tela também tem cabeçalho e superfície.

    Antes o estado de carga devolvia um card solto sobre o canvas: sem faixa
    fixa, sem título e sem lugar onde um erro de carga pudesse aparecer. A
    `contagem` fica NULA de propósito: passar `0` afirmaria "0 unidades", e a
    tela ainda não sabe quantas são.
  */
  if (loading) {
    return (
      <Pagina>
        <PageHeader titulo="Mapa de unidades" descricao={DESCRICAO} />
        <Avisos avisos={avisos} aoFechar={fechar} />
        <BlocoConteudo titulo="Disponibilidade" variante="primario" cor="var(--module-comercial)">
          <p className="app-note">Carregando mapa de unidades...</p>
        </BlocoConteudo>
      </Pagina>
    );
  }

  return (
    <Pagina>
      {/* C1/C2/R5/R13: título, contagem e apoio na faixa fixa do topo, com
          superfície própria — o <p class="page-subtitle"> solto sobre o
          canvas saiu. O ritmo vertical da raiz é do Pagina (R10). */}
      <PageHeader
        titulo="Mapa de unidades"
        contagem={`${unidadesFiltradas.length} unidade(s)`}
        descricao={DESCRICAO}
      />

      {/* R16: UM dono para a faixa de avisos — logo abaixo do cabeçalho. */}
      <Avisos avisos={avisos} aoFechar={fechar} />

      {/* B2: este é o bloco PRINCIPAL da tela — é ele que responde "como
          está a disponibilidade deste empreendimento?". Os agrupamentos
          abaixo são o detalhe dessa resposta e ficam neutros. */}
      <BlocoConteudo
        titulo="Disponibilidade"
        descricao="Escolha o empreendimento; o mapa abaixo mostra as unidades agrupadas por bloco ou torre."
        variante="primario"
        cor="var(--module-comercial)"
      >
        <div className="space-y-4">
          {/* R12: seletor de CONTEXTO — escolhe QUAL empreendimento o mapa
              exibe, não recorta uma lista. Select segue legítimo aqui. */}
          <FormSecao colunas={2}>
            <CampoForm label="Empreendimento">
              <select
                className="input w-full"
                value={empreendimentoId}
                onChange={(e) => setEmpreendimentoId(e.target.value)}
              >
                <option value="">Selecione</option>
                {empreendimentos.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
              </select>
            </CampoForm>
          </FormSecao>

          {/*
            StatGrid/StatTile (R10/M2): o ladrilho do sistema no lugar dos
            quatro cartões de paleta crua com número em `text-2xl`.

            Os quatro ficam NEUTROS de propósito. A R8 governa COMPARAÇÃO
            (previsto azul × realizado vermelho) e diz que KPI que não
            pertence a nenhuma série fica na cor de texto — estes são
            contagem por situação, não previsto × realizado. Quem carrega a
            cor da situação é a etiqueta de cada unidade, no mapa abaixo,
            onde ela distingue um registro do outro.
          */}
          <StatGrid colunas={4}>
            <StatTile label="Disponíveis" valor={String(resumo.disponivel)} />
            <StatTile label="Reservadas" valor={String(resumo.reservada)} />
            <StatTile label="Vendidas" valor={String(resumo.vendida)} />
            <StatTile label="Bloqueadas" valor={String(resumo.bloqueada)} />
          </StatGrid>

          <p className="app-note">
            Tabela ativa:{' '}
            {tabelaAtiva
              ? `${tabelaAtiva.nome}${tabelaAtiva.codigo ? ` · ${tabelaAtiva.codigo}` : ''}`
              : 'nenhuma tabela de preco ativa para este empreendimento.'}
          </p>
        </div>
      </BlocoConteudo>

      {/*
        Esta tela é um MAPA de cards por agrupamento, não uma lista tabular:
        a leitura é espacial (varrer o bloco inteiro e ver onde está o que
        sobrou), e não coluna a coluna. Migrar para TabelaPadrao trocaria o
        mapa por uma lista e perderia justamente o que a tela faz — por isso
        os cards ficam, agora sobre a superfície neutra do sistema, com a
        situação na etiqueta em vez de tingindo o card inteiro (R25).
      */}
      {grupos.length === 0 ? (
        <BlocoConteudo titulo="Unidades">
          <p className="app-note">Nenhuma unidade encontrada para o empreendimento selecionado.</p>
        </BlocoConteudo>
      ) : (
        grupos.map((grupo) => (
          <BlocoConteudo
            key={grupo.nome}
            titulo={grupo.nome}
            contagem={`${grupo.itens.length} unidade(s)`}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {grupo.itens.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {/* R10: título do card no degrau de corpo (14px). O
                          `title` completo cobre o código longo (T6). */}
                      <h3 className="text-sm font-semibold text-[var(--c-text)]" title={item.codigo || ''}>
                        {item.codigo}
                      </h3>
                      <p className="text-xs text-[var(--c-muted)]">{item.nome || 'Unidade comercial'}</p>
                    </div>
                    <StatusBadge status={item.situacao} kind={familiaDaSituacao(item.situacao)} />
                  </div>

                  <dl className="mt-3 space-y-1 text-sm text-[var(--c-text)]">
                    <div className="flex flex-wrap justify-between gap-2">
                      <dt className="text-[var(--c-muted)]">Metragem privativa</dt>
                      <dd className="valor-tabular">{item.metragem_privativa || '-'}</dd>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <dt className="text-[var(--c-muted)]">Fracao ideal</dt>
                      <dd className="valor-tabular">{item.fracao_ideal || '-'}</dd>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <dt className="text-[var(--c-muted)]">Reserva</dt>
                      <dd>{item.parceiroReserva?.nome || '-'}</dd>
                    </div>
                    {/* R6: valor exibido usa `tabular-nums` (.valor-tabular)
                        — números alinham entre um card e outro. */}
                    <div className="flex flex-wrap justify-between gap-2">
                      <dt className="text-[var(--c-muted)]">Valor tabela</dt>
                      <dd className="valor-tabular">{item.valor_tabela ? formatCurrency(item.valor_tabela) : '-'}</dd>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <dt className="text-[var(--c-muted)]">Base venda</dt>
                      <dd className="valor-tabular">{item.valor_base_venda ? formatCurrency(item.valor_base_venda) : '-'}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </BlocoConteudo>
        ))
      )}
    </Pagina>
  );
}
