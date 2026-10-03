import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowPath,
  HiOutlineCheck,
  HiOutlineLink,
  HiOutlineNoSymbol,
  HiOutlineXMark
} from 'react-icons/hi2';
import { useAuth } from '../contexts/AuthContext';
import {
  confirmarFinanceiroDdaSugestao,
  getFinanceiroDdaBoletos,
  getFinanceiroDdaCandidatos,
  getFinanceiroDdaResumo,
  ignorarFinanceiroDda,
  reprocessarFinanceiroDdaMatch,
  sincronizarFinanceiroDda,
  vincularFinanceiroDda
} from '../services/financeiro';
import { hasPermissao } from '../utils/acessoProduto';
import OverlayModal from '../components/ui/OverlayModal';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  BarraFiltros,
  alternarValorFiltro,
  StatGrid,
  StatTile,
  Paginacao,
  TabelaPadrao,
  Avisos,
  useAvisos,
  useConfirmacao,
  useFiltrosVisiveis
} from '../components/padrao';

const STATUS = [
  { value: 'MATCH_EXATO', label: 'Correspondencia exata' },
  { value: 'AMBIGUO', label: 'Mais de um título' },
  { value: 'SEM_TITULO', label: 'Sem título localizado' },
  { value: 'DIVERGENTE', label: 'Dados divergentes' },
  { value: 'VINCULADO', label: 'Vinculado' },
  { value: 'IGNORADO', label: 'Ignorado' }
];

const STATUS_LABEL = Object.fromEntries(STATUS.map((item) => [item.value, item.label]));

/* R25 — o tom do status vem da classe do sistema (`badge-*`, que aponta
   para --sem-*), nunca de paleta crua do Tailwind: `bg-emerald-100` e
   `text-slate-700` não têm par no tema escuro nem passam pelo piso de
   contraste do ThemeContext (R24). */
function statusBadgeClasse(status) {
  if (status === 'VINCULADO') return 'badge badge-success';
  if (status === 'MATCH_EXATO') return 'badge badge-info';
  if (status === 'IGNORADO') return 'badge badge-muted';
  if (status === 'DIVERGENTE') return 'badge badge-danger';
  return 'badge badge-warning';
}

function currency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function date(value) {
  if (!value) return '-';
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString('pt-BR');
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
  { id: 'q', rotulo: 'Busca', obrigatorio: true },
  { id: 'data_inicio', rotulo: 'Vencimento de' },
  { id: 'data_fim', rotulo: 'Vencimento até' },
  { id: 'status', rotulo: 'Status' }
];

export default function FinanceiroDda() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({ q: '', status: '', data_inicio: '', data_fim: '', page: 1, limit: 25 });
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => String(filters[filtro.id] ?? '').trim() !== '').map((filtro) => filtro.id),
    [filters]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:financeiro-dda:documentos', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => setFilters((atual) => ({ ...atual, [id]: '', page: 1 }))
  });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ total: 0, valor_total: 0, por_status: {}, integracao: {} });
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [candidateModal, setCandidateModal] = useState(null);

  // R19: o `message` de tom próprio virou a faixa do sistema — evento
  // (sincronizou, vinculou, falhou) é aviso empilhável e fechável.
  const { avisos, avisar, fechar: fecharAviso, limpar: limparAvisos } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  const canSync = hasPermissao(user, 'financeiro.dda.sincronizar');
  const canLink = hasPermissao(user, 'financeiro.dda.vincular');
  const canIgnore = hasPermissao(user, 'financeiro.dda.ignorar');

  const requestFilters = useMemo(() => ({
    ...filters,
    q: filters.q.trim() || undefined,
    status: filters.status || undefined,
    data_inicio: filters.data_inicio || undefined,
    data_fim: filters.data_fim || undefined
  }), [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listResult, summaryResult] = await Promise.all([
        getFinanceiroDdaBoletos(requestFilters),
        getFinanceiroDdaResumo(requestFilters)
      ]);
      setRows(listResult?.rows || []);
      setTotal(Number(listResult?.total || 0));
      setSummary(summaryResult || { total: 0, valor_total: 0, por_status: {}, integracao: {} });
    } catch (error) {
      avisar.erro(error.message);
    } finally {
      setLoading(false);
    }
  }, [requestFilters, avisar]);

  useEffect(() => { load(); }, [load]);

  async function runAction(id, action, successText) {
    setActionId(id);
    try {
      await action();
      avisar.sucesso(successText);
      await load();
      return true;
    } catch (error) {
      avisar.erro(error.message);
      return false;
    } finally {
      setActionId(null);
    }
  }

  async function openCandidates(row) {
    setActionId(row.id);
    try {
      const result = await getFinanceiroDdaCandidatos(row.id);
      setCandidateModal({ boleto: row, origem: result?.origem, rows: result?.rows || [] });
    } catch (error) {
      avisar.erro(error.message);
    } finally {
      setActionId(null);
    }
  }

  async function sync() {
    await runAction('sync', () => sincronizarFinanceiroDda({}), 'Sincronizacao concluida.');
  }

  async function ignore(row) {
    /*
      A NONA caixa do navegador desta leva: era `window.prompt('Informe o
      motivo...')` — a MESMA caixa do Chrome que a R19 bane, só que sem
      `alert` nem `confirm` no nome.

      Virou CONFIRMAÇÃO, não aviso, e por dois motivos: ela SEGURA a ação
      (ignorar retira o documento do fluxo de correspondência e grava
      auditoria) e precisa do texto — o `campo` do `useConfirmacao` existe
      exatamente para isso e devolve `{ ok, texto }` num passo só.

      R21: o retorno se DESESTRUTURA. Lido como booleano, o "Cancelar"
      ignoraria o documento — e o objeto do `prompt` antigo tinha o defeito
      irmão: `null` no cancelar seguindo para o serviço.

      Consentimento: a mensagem nomeia UM documento (`row`) e a ação
      percorre esse mesmo `row.id`. Não há quantidade citada, logo não há
      número que possa divergir da coleção percorrida.
    */
    const { ok, texto } = await confirmar({
      titulo: 'Ignorar documento DDA?',
      mensagem: `O documento de ${row.beneficiario_nome || 'beneficiario nao informado'} (${currency(row.valor_atual)}) sai da fila de correspondencia e passa a constar como IGNORADO na trilha de auditoria. Esta tela nao desfaz.`,
      rotuloConfirmar: 'Ignorar documento',
      destrutiva: true,
      campo: { rotulo: 'Motivo', obrigatorio: true, multilinha: true }
    });
    if (!ok) return;
    const motivo = String(texto || '').trim();
    if (!motivo) return;
    await runAction(row.id, () => ignorarFinanceiroDda(row.id, motivo), 'Documento ignorado com auditoria.');
  }

  const statusCount = (status) => Number(summary?.por_status?.[status]?.quantidade || 0);
  const pages = Math.max(1, Math.ceil(total / filters.limit));

  /*
    R12/R23 — o filtro de status era um `select` de escolha única (estado
    invisível, não combinável). Virou marcação na BarraFiltros, com
    etiqueta removível, e APLICA AO MARCAR: montar o recorte custa duas
    requisições (lista + resumo), abaixo do teto de 3 da R23, e a resposta
    fica muito abaixo dos 2s — não é consulta cara, então não há botão de
    "aplicar" nem marca em rascunho. O serviço aceita UM status, então a
    dimensão é `unico` (marca redonda: a forma diz que só cabe uma).
  */
  const filtrosAtivos = useMemo(
    () => ({ status: new Set(filters.status ? [filters.status] : []) }),
    [filters.status]
  );

  function alternarFiltro(dimensao, valor, opcoes) {
    const proximo = alternarValorFiltro(filtrosAtivos, dimensao, valor, opcoes);
    setFilters((prior) => ({ ...prior, status: [...(proximo.status || [])][0] || '', page: 1 }));
  }

  return (
    <Pagina>
      {/* R13/C1/C2/R5 — faixa fixa do sistema: título em 22px, contagem e
          apoio numa linha só. O <header> custom com título fora da escala e o rótulo
          "Financeiro · apresentacao eletronica" solto saíram. */}
      <PageHeader
        titulo="DDA Banco do Brasil"
        contagem={`${total} documento(s)`}
        descricao="Conferência de boletos apresentados, correspondencia com contas a pagar e trilha de decisão."
        acaoPrincipal={canSync ? {
          rotulo: actionId === 'sync' ? 'Sincronizando...' : 'Sincronizar BB',
          onClick: sync,
          desabilitada: actionId === 'sync',
          icone: <HiOutlineArrowDownTray aria-hidden="true" />
        } : undefined}
        secundarias={[
          {
            rotulo: 'Atualizar',
            onClick: () => { limparAvisos(); load(); },
            desabilitada: loading,
            icone: <HiOutlineArrowPath aria-hidden="true" />
          }
        ]}
      />

      <Avisos avisos={avisos} aoFechar={fecharAviso} />

      {/*
        CONDIÇÃO, não aviso (fronteira do `Avisos`): a integração externa
        continua bloqueada depois de qualquer clique — fechar a faixa não
        resolveria nada e ela voltaria a cada recarga. Por isso fica como
        bloco fixo no fluxo, ao lado do que ela descreve.
      */}
      <BlocoConteudo
        titulo="Integracao externa bloqueada"
        variante="primario"
        cor="var(--sem-warning)"
      >
        <p className="text-sm text-[var(--c-muted)]">
          A consulta real será habilitada quando o adapter DDA estiver configurado com os
          endpoints e escopos liberados na aplicacao BB existente. Nenhum titulo e criado,
          vinculado ou pago automaticamente.
        </p>
      </BlocoConteudo>

      {/* M2/R10: o ladrilho do sistema no lugar dos seis `Metric` locais,
          que traziam medida em pixel avulso e cor crua na tela. */}
      <StatGrid colunas={4}>
        <StatTile label="Documentos" valor={String(summary.total || 0)} />
        <StatTile label="Valor apresentado" valor={currency(summary.valor_total)} />
        <StatTile label="Match exato" valor={String(statusCount('MATCH_EXATO'))} tom="success" />
        <StatTile label="Ambiguos" valor={String(statusCount('AMBIGUO'))} tom="warning" />
        <StatTile label="Sem título" valor={String(statusCount('SEM_TITULO'))} tom="warning" />
        <StatTile label="Divergentes" valor={String(statusCount('DIVERGENTE'))} tom="danger" />
      </StatGrid>

      {/* B3 — a contagem do recorte já vive na faixa fixa (R5) e o total
          já é um ladrilho da grade acima; repeti-la no apoio deste bloco
          seria a terceira aparição da mesma informação, sem função nova. */}
      <BlocoConteudo titulo="Documentos apresentados" descricao="Recorte atual da fila de correspondencia.">
        <BarraFiltros
          busca={visibilidadeFiltros.ehVisivel('q') ? {
            valor: filters.q,
            aoMudar: (valor) => setFilters((prior) => ({ ...prior, q: valor, page: 1 })),
            placeholder: 'Beneficiario, CPF/CNPJ, nosso número ou linha digitável'
          } : null}
          campos={[
            {
              id: 'data_inicio',
              rotulo: 'Vencimento de',
              tipo: 'date',
              valor: filters.data_inicio,
              aoMudar: (valor) => setFilters((prior) => ({ ...prior, data_inicio: valor, page: 1 }))
            },
            {
              id: 'data_fim',
              rotulo: 'Vencimento até',
              tipo: 'date',
              valor: filters.data_fim,
              aoMudar: (valor) => setFilters((prior) => ({ ...prior, data_fim: valor, page: 1 }))
            }
          ].filter((campo) => visibilidadeFiltros.ehVisivel(campo.id))}
          filtros={[
            { id: 'status', rotulo: 'Status', unico: true, opcoes: STATUS.map((item) => ({ valor: item.value, rotulo: item.label })) }
          ].filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={filtrosAtivos}
          aoAlternar={alternarFiltro}
          aoLimpar={() => setFilters((prior) => ({ ...prior, status: '', page: 1 }))}
          visibilidade={visibilidadeFiltros}
        />

        <TabelaPadrao
          // Rodape "N de M" (05/09): esta lista vem PAGINADA do servidor, entao
          // o que esta a vista e uma fatia — sem o total, quem rola nao sabe se
          // adianta continuar.
          total={Number(total || 0)}
          rotuloRegistro="documento"
          colunas={[
            { id: 'vencimento', titulo: 'Vencimento', tipo: 'data', render: (row) => date(row.data_vencimento) },
            {
              id: 'beneficiario',
              titulo: 'Beneficiario',
              // R17: o beneficiario NOMEIA o documento DDA.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (row) => (
                <div>
                  <div className="truncate font-semibold text-[var(--c-text)]">{row.beneficiario_nome || '-'}</div>
                  <div className="text-xs text-[var(--c-muted)]">{row.nosso_numero || row.banco_nome || '-'}</div>
                </div>
              )
            },
            { id: 'documento', titulo: 'Documento', tipo: 'codigo', render: (row) => row.beneficiario_documento || '-' },
            { id: 'valor', titulo: 'Valor', tipo: 'valor', render: (row) => currency(row.valor_atual) },
            { id: 'empresa', titulo: 'Empresa', tipo: 'texto', render: (row) => row.empresa?.nome || row.empresa?.razao_social || '-' },
            {
              id: 'status',
              titulo: 'Status',
              tipo: 'status',
              render: (row) => (
                <span className={statusBadgeClasse(row.status)}>
                  {STATUS_LABEL[row.status] || row.status}
                </span>
              )
            },
            {
              id: 'titulo',
              titulo: 'Título',
              tipo: 'codigo',
              render: (row) => (row.titulo
                ? <Link className="font-semibold text-[var(--c-primary)] hover:underline whitespace-nowrap" to={`/financeiro/titulos/${row.titulo.id}`}>{row.titulo.codigo || `#${row.titulo.id}`}</Link>
                : row.tituloSugerido
                  ? <span className="text-xs text-[var(--c-primary)]">Sugestao: {row.tituloSugerido.codigo || `#${row.tituloSugerido.id}`}</span>
                  : '-')
            }
          ]}
          itens={loading ? [] : rows}
          carregando={loading}
          vazio={{
            title: 'Nenhum documento DDA carregado',
            message: 'A estrutura esta pronta para receber documentos, mas a sincronizacao bancaria permanece bloqueada ate a homologacao.'
          }}
          storageKey="tabela:financeiro-dda:documentos"
          rotuloRolagem="Documentos DDA apresentados"
          larguraAcoes={200}
          acoesLinha={(row) => (
            <>
              {canLink && row.status === 'MATCH_EXATO' && row.titulo_sugerido_id && <button type="button" title="Confirmar correspondencia exata" aria-label="Confirmar correspondencia exata" className="btn btn-outline btn-sm" disabled={actionId === row.id} onClick={() => runAction(row.id, () => confirmarFinanceiroDdaSugestao(row.id), 'Documento vinculado ao titulo sugerido.')}><HiOutlineCheck aria-hidden="true" /></button>}
              {canLink && !['VINCULADO', 'IGNORADO'].includes(row.status) && <button type="button" title="Escolher titulo" aria-label="Escolher titulo" className="btn btn-outline btn-sm" disabled={actionId === row.id} onClick={() => openCandidates(row)}><HiOutlineLink aria-hidden="true" /></button>}
              {canLink && !['VINCULADO', 'IGNORADO'].includes(row.status) && <button type="button" title="Reprocessar correspondencia" aria-label="Reprocessar correspondencia" className="btn btn-outline btn-sm" disabled={actionId === row.id} onClick={() => runAction(row.id, () => reprocessarFinanceiroDdaMatch(row.id), 'Correspondencia reprocessada.')}><HiOutlineArrowPath aria-hidden="true" /></button>}
              {/* D3/C5: a destrutiva fica visível e apartada, em vermelho suave. */}
              {canIgnore && !['VINCULADO', 'IGNORADO'].includes(row.status) && <button type="button" title="Ignorar com justificativa" aria-label="Ignorar com justificativa" className="btn btn-outline btn-perigo-suave btn-sm" disabled={actionId === row.id} onClick={() => ignore(row)}><HiOutlineNoSymbol aria-hidden="true" /></button>}
            </>
          )}
        />

        <Paginacao
          pagina={filters.page}
          totalPaginas={pages}
          total={total}
          rotuloRegistro="documento"
          carregando={loading}
          aoMudarPagina={(proxima) => setFilters((prior) => ({ ...prior, page: proxima }))}
        />
      </BlocoConteudo>

      {/* R3/R18: a casca de modal do sistema no lugar do `modal modal-open`
          do daisyUI — quatro classes que NUNCA existiram no CSS do projeto
          (`modal-open`, `modal-box`, `btn-square`, `modal-backdrop`). */}
      {candidateModal && (
        <OverlayModal
          rotulo="Vincular título a pagar"
          largura="var(--modal-max-w-xl, 1080px)"
          onFechar={() => setCandidateModal(null)}
        >
          <div className="flex items-start justify-between gap-4 border-b border-[var(--c-border)] p-4">
            <div>
              <h2 className="app-confirmacao-titulo">Vincular título a pagar</h2>
              <p className="text-sm text-[var(--c-muted)]">
                {candidateModal.boleto.beneficiario_nome} · {currency(candidateModal.boleto.valor_atual)} · origem {candidateModal.origem || '-'}
              </p>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setCandidateModal(null)} aria-label="Fechar">
              <HiOutlineXMark aria-hidden="true" />
            </button>
          </div>
          {/* O painel recorta com `clip` (R18): quem rola é o corpo. */}
          <div className="min-h-0 overflow-y-auto p-4">
            <TabelaPadrao
              colunas={[
                { id: 'codigo', titulo: 'Título', tipo: 'codigo', render: (title) => title.codigo || `#${title.id}` },
                {
                  id: 'credor',
                  titulo: 'Credor',
                  // R17: o credor NOMEIA o titulo candidato.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (title) => title.parceiro?.nome || '-'
                },
                { id: 'vencimento', titulo: 'Vencimento', tipo: 'data', render: (title) => date(title.data_vencimento) },
                { id: 'saldo', titulo: 'Saldo', tipo: 'valor', render: (title) => currency(title.valor_saldo) },
                { id: 'empresa', titulo: 'Empresa', tipo: 'texto', render: (title) => title.empresa?.nome || title.empresa?.razao_social || '-' }
              ]}
              itens={candidateModal.rows}
              vazio="Nenhum título elegível localizado pelos dados do documento."
              storageKey="tabela:financeiro-dda:candidatos"
              rotuloRolagem="Titulos candidatos ao documento"
              larguraAcoes={140}
              acoesLinha={(title) => (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={actionId === candidateModal.boleto.id}
                  onClick={async () => {
                    const ok = await runAction(candidateModal.boleto.id, () => vincularFinanceiroDda(candidateModal.boleto.id, title.id), 'Documento vinculado ao titulo selecionado.');
                    if (ok) setCandidateModal(null);
                  }}
                >
                  Usar título
                </button>
              )}
            />
          </div>
        </OverlayModal>
      )}

      {elementoConfirmacao}
    </Pagina>
  );
}
