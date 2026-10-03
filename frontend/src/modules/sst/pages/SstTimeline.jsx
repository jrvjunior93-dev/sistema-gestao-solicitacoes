import { useEffect, useMemo, useState } from 'react';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  BlocosPersonalizaveis,
  BarraFiltros,
  StatGrid,
  StatTile,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';
import { getRhColaboradores } from '../../../services/rhDp';
import { avaliarBloqueiosSst, getSstTimeline, revisarConformidadeSst } from '../services/sst';

function optionLabel(item) {
  return [item.nome, item.matricula ? `Matricula ${item.matricula}` : null, item.cargo].filter(Boolean).join(' - ');
}

/*
  R25 — o tipo do evento (ASO, EXAME, EPI, ACIDENTE, BLOQUEIO…) é
  CATEGORIA, não status: pintá-lo por família semântica diria "acidente é
  perigo" e "treinamento é sucesso", que é significado que o dado não tem.
  Então a etiqueta sai neutra e o que ela carrega é o texto — a cor fica
  reservada para o que de fato tem gravidade (pendência e bloqueio, no
  resumo acima).
*/
function familiaEvento() {
  return 'neutral';
}

export default function SstTimeline() {
  const [colaboradores, setColaboradores] = useState([]);
  const [selected, setSelected] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  /*
    HTTP 400 medido no preview (05/09): a chamada saía como
    `GET /api/rh/colaboradores?status=ATIVO&limit=500` e o backend recusava
    a REQUISIÇÃO INTEIRA — nenhum colaborador chegava e a tela ficava em
    "0 evento(s)" sem dizer por quê.

    A rota não tem paginação: `validateRhColaboradorQuery`
    (backend/src/validators/rhValidators.js:334) roda `ensureAllowedKeys` com
    o conjunto FECHADO ['q','empresa_grupo_id','obra_id','setor_id',
    'tipo_vinculo','status'] — `limit` não é um teto pequeno demais, é uma
    chave que a rota não conhece, e chave desconhecida é 400
    ("Consulta de colaboradores RH/DP contem campos nao permitidos: limit.").
    `status=ATIVO` estava correto (RH_STATUS_COLABORADOR aceita
    ATIVO/INATIVO/AFASTADO).

    Tirar `limit` não corta capacidade: `listarColaboradoresRh`
    (backend/src/services/rhService.js:930) faz `findAll` sem limite e devolve
    o array completo — a tela passa a receber MAIS gente, não menos. É como a
    SstCrudPage já chama (`{ status: 'ATIVO' }`).

    E a falha deixa de ser silenciosa: engolir o erro era o que fazia a tela
    parecer vazia em vez de avariada.
  */
  useEffect(() => {
    getRhColaboradores({ status: 'ATIVO' })
      .then((rows) => setColaboradores(Array.isArray(rows) ? rows : []))
      .catch((err) => {
        setColaboradores([]);
        avisar.erro(err?.message || 'Erro ao carregar a lista de colaboradores ativos');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load(colaboradorId = selected) {
    if (!colaboradorId) return;
    setLoading(true);
    getSstTimeline(colaboradorId)
      .then((payload) => setData(payload))
      .catch((err) => avisar.erro(err?.message || 'Erro ao carregar timeline SST'))
      .finally(() => setLoading(false));
  }

  /*
    R23 — o recorte APLICA AO MARCAR. A tela pedia um clique em "Carregar"
    depois de escolher o colaborador: a marca dizia "estou vendo Fulano" e
    a timeline embaixo ainda era de outra pessoa (ou de ninguém). É uma
    consulta só, longe do critério de "consulta cara".
    O botão explícito não foi removido — virou "Recarregar timeline" na
    barra de ações, para quem quer buscar de novo depois de uma revisão.
  */
  function escolherColaborador(valor) {
    const chave = String(valor);
    const proximo = selected === chave ? '' : chave;
    setSelected(proximo);
    setData(null);
    if (proximo) load(proximo);
  }

  async function revisar() {
    /*
      R26 — o alvo é FIXADO numa const ANTES do await. O modal do sistema
      não congela a página: a barra de filtros continua clicável, e trocar
      de colaborador enquanto a confirmação está aberta faria a tela
      PERGUNTAR sobre Fulano e REVISAR Beltrano — consentimento válido no
      log, ação em outro registro.
      R21 — o retorno se desestrutura: `{ ok, texto }` é objeto, e objeto é
      sempre verdadeiro.
    */
    const alvoId = selected;
    if (!alvoId) return;
    const alvo = colaboradores.find((item) => String(item.id) === String(alvoId));
    const nomeAlvo = alvo ? optionLabel(alvo) : `colaborador ${alvoId}`;

    const { ok } = await confirmar({
      titulo: 'Revisar conformidade SST',
      mensagem: `Reavaliar a conformidade e recalcular os bloqueios de ${nomeAlvo}? A revisao pode abrir ou encerrar bloqueios operacionais desta pessoa.`,
      rotuloConfirmar: 'Revisar'
    });
    if (!ok) return;

    try {
      await revisarConformidadeSst(alvoId, { motivo: 'REVISAO_MANUAL_TIMELINE' });
      await avaliarBloqueiosSst(alvoId);
      avisar.sucesso('Revisão de conformidade e bloqueios executada.');
      load(alvoId);
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao revisar conformidade SST');
    }
  }

  const timeline = useMemo(() => data?.timeline || [], [data]);
  const selecionados = useMemo(() => new Set(selected ? [selected] : []), [selected]);

  return (
    <Pagina>
      <PageHeader
        titulo="Timeline operacional do colaborador"
        contagem={loading ? 'Carregando' : `${timeline.length} evento(s)`}
        descricao="Histórico único de ASO, exames, treinamentos, EPI, acidentes, exposições, pendências, bloqueios e score."
        acaoPrincipal={{ rotulo: 'Revisar conformidade', onClick: revisar, desabilitada: !selected }}
        secundarias={[{ rotulo: 'Recarregar timeline', onClick: () => load(), desabilitada: !selected }]}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo
        titulo="Colaborador"
        descricao="A timeline e de uma pessoa por vez; marcar troca o recorte na hora."
      >
        {/*
          R12/R16 — o <select> solto de colaborador vira a barra de filtros
          do sistema. A dimensão é `unico` porque o serviço aceita UM id
          (`getSstTimeline(colaboradorId)`): com marcação múltipla o usuário
          veria duas etiquetas e a tela consultaria uma só.
        */}
        <BarraFiltros
          filtros={[{
            id: 'colaborador',
            rotulo: 'Colaborador',
            unico: true,
            vazio: 'Nenhum colaborador ativo disponível para consultar a timeline.',
            opcoes: colaboradores.map((item) => ({ valor: String(item.id), rotulo: optionLabel(item) }))
          }]}
          ativos={{ colaborador: selecionados }}
          aoAlternar={(dim, valor) => escolherColaborador(valor)}
          aoLimpar={() => {
            setSelected('');
            setData(null);
          }}
        />
      </BlocoConteudo>

      {/*
        BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
        em que ligar isto é SEGURO: estes 2 blocos são leituras
        independentes — sem ordem obrigatória entre si, sem botão de gravar
        dentro e sem campo obrigatório que ocultar esconda. O padrão continua
        sendo o do código; a preferência guarda só o DESVIO. No celular o
        modo não existe (arrastar é HTML5 nativo e não responde a toque).
      */}
      <BlocosPersonalizaveis chave="blocos:sst-timeline" larguraPadrao="total">
        {data ? (
          <BlocoConteudo titulo="Resumo do colaborador" descricao="Contagem consolidada do período carregado.">
            <StatGrid colunas={3}>
              <StatTile label="Eventos" valor={data.resumo?.eventos_total || 0} />
              <StatTile
                label="Pendências abertas"
                valor={data.resumo?.pendencias_abertas || 0}
                tom={data.resumo?.pendencias_abertas ? 'warning' : 'success'}
              />
              <StatTile
                label="Bloqueios abertos"
                valor={data.resumo?.bloqueios_abertos || 0}
                tom={data.resumo?.bloqueios_abertos ? 'danger' : 'success'}
              />
            </StatGrid>
          </BlocoConteudo>
        ) : null}

        {/*
          Linha do tempo, não tabela: a ordem cronológica é a informação, e
          cada evento tem título, descrição livre e data — colunas fixas
          empurrariam a descrição para dentro de 160px. O padrão entra como
          moldura; cada evento é um bloco secundário com a data ancorada no
          próprio bloco.
        */}
        <BlocoConteudo
          titulo="Linha do tempo"
          variante="primario"
          cor="var(--module-sst)"
          contagem={`${timeline.length} evento(s)`}
          descricao="Do mais recente para o mais antigo, na ordem devolvida pelo backend."
        >
          <div className="grid gap-2">
            {timeline.map((item, index) => (
              <BlocoConteudo
                key={`${item.tipo}-${item.origem_id}-${index}`}
                variante="secundario"
                titulo={item.titulo}
                contagem={item.data || '-'}
                descricao={item.descricao || undefined}
                acoes={<StatusBadge status={item.tipo} kind={familiaEvento()} />}
              />
            ))}
            {!timeline.length ? (
              <p className="text-sm text-muted">Selecione um colaborador para visualizar a timeline.</p>
            ) : null}
          </div>
        </BlocoConteudo>
      </BlocosPersonalizaveis>

      {elementoConfirmacao}
    </Pagina>
  );
}
