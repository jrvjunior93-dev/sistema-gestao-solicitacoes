import DateInputBR from '../components/DateInputBR';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Avisos,
  BarraFiltros,
  BlocoConteudo,
  CampoForm,
  CelulaDupla,
  FormSecao,
  StatGrid,
  StatTile,
  TabelaPadrao,
  alternarValorFiltro,
  useAvisos,
  useConfirmacao,
  useFiltrosVisiveis
} from '../components/padrao';
import Alert from '../components/ui/Alert';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { getObras } from '../services/obras';
import {
  conferirRhApuracao,
  fecharRhApuracao,
  gerarRhApuracao,
  getRhApuracao,
  getRhApuracoes,
  getRhCategoriasFinanceiras,
  getRhEmpresasGrupo,
  reabrirRhFechamento,
  atualizarRhApuracaoItem
} from '../services/rhDp';
import {
  canEditRhDpApuracao,
  canExecuteRhDpFechamento,
  canReopenRhDpFechamento,
  hasEnabledModule
} from '../utils/acessoProduto';

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
}

// Coluna `tipo: 'data'` é medida para "22/08/2026" (110px, TabelaPadrao). O
// carimbo com hora ("02/09/2026 21:30:11") precisa de 128px e quebrava em duas
// linhas no preview de 1920px. Na LISTA vale o dia — a hora exata continua à
// vista no cabeçalho do detalhe ("criada em ... por ...") e é assim que todas
// as outras telas do sistema fazem em coluna `data` (ComprasRelatorio*, etc).
function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function formatNumber(value) {
  const number = Number(value || 0);
  return number.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function getLastDayOfCompetencia(competencia) {
  const [year, month] = String(competencia || '').split('-').map(Number);
  if (!year || !month) {
    return new Date().toISOString().slice(0, 10);
  }
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

// A pilula de status e do StatusBadge (dono unico, R16). O `kind` preserva as
// MESMAS familias que as classes escritas a mao usavam: conferida = sucesso,
// rascunho = atencao.
function familiaStatus(status) {
  const normalized = String(status || '').trim().toUpperCase();
  return normalized === 'CONFERIDA' || normalized === 'CONFERIDO' ? 'success' : 'warning';
}

function rotuloStatus(status) {
  return String(status || '').trim().toUpperCase() === 'CONFERIDA' ? 'Conferida' : 'Rascunho';
}

// O servico da apuracao recebe UM valor por recorte, entao cada dimensao do
// filtro e declarada `unico: true` na BarraFiltros: marcar outro SUBSTITUI.
// Sem isso, marcar dois valores fazia a tela mandar NENHUM.
function valorUnico(conjunto) {
  return conjunto && conjunto.size === 1 ? conjunto.values().next().value : undefined;
}

function initialForm() {
  return {
    competencia: '',
    dias_base: '30',
    tipo_vinculo: '',
    observacoes: ''
  };
}

function filtrosVazios() {
  return {
    competencia: '',
    empresa_grupo_id: new Set(),
    obra_id: new Set(),
    tipo_vinculo: new Set(),
    status: new Set()
  };
}

function getPixOptions(item) {
  const pagamento = item?.colaborador?.pagamento || {};
  return [
    { key: 'principal', label: 'Principal', value: pagamento.chave_pix },
    { key: 'secundaria', label: 'Fixa 2', value: pagamento.chave_pix_secundaria },
    { key: 'variavel', label: 'Variável', value: pagamento.chave_pix_variavel }
  ]
    .map((option) => ({ ...option, value: String(option.value || '').trim() }))
    .filter((option) => option.value);
}

function getDefaultPixValue(item) {
  return getPixOptions(item)[0]?.value || '';
}

function toEditState(item) {
  return {
    ajuste_credito_manual: item?.ajuste_credito_manual ?? '0',
    ajuste_debito_manual: item?.ajuste_debito_manual ?? '0',
    observacoes: item?.observacoes || '',
    status: item?.status || 'PENDENTE',
    chave_pix_titulo: item?.detalhes_json?.pagamento?.chave_pix_titulo || getDefaultPixValue(item)
  };
}

/**
 * APURACAO — ABA do Pessoal, nao pagina (D1, 02/09).
 *
 * `/rh-dp/apuracao` hoje redireciona para `/rh-dp/pessoal?aba=apuracao`: este
 * componente e SEMPRE montado como aba, entao a prop `comoAba` (e o cabecalho
 * proprio que ela escondia) saiu. Nao ha `Pagina` nem `PageHeader` aqui de
 * proposito: o titulo e a faixa fixa sao do RhDpPessoal, e duas faixas fixas
 * empilhadas seriam justamente o defeito que a R16 evita. O ritmo vertical
 * vem da grade do `.app-pagina`.
 */
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
  { id: 'tipo_vinculo', rotulo: 'Vínculo' },
  { id: 'status', rotulo: 'Status' }
];

export default function RhDpApuracao() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [parametros] = useSearchParams();
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const podeEditar = canEditRhDpApuracao(user);
  const podeFechar = canExecuteRhDpFechamento(user);
  const podeReabrirFechamento = canReopenRhDpFechamento(user);
  const financeiroHabilitado = hasEnabledModule(user, 'FINANCEIRO');
  const [empresas, setEmpresas] = useState([]);
  const [obras, setObras] = useState([]);
  const [categoriasFinanceiras, setCategoriasFinanceiras] = useState([]);
  const [apuracoes, setApuracoes] = useState([]);
  const [detalhe, setDetalhe] = useState(null);
  const [edicoes, setEdicoes] = useState({});
  const [carregandoBase, setCarregandoBase] = useState(false);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [carregandoCategorias, setCarregandoCategorias] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [salvandoItemId, setSalvandoItemId] = useState(null);
  const [conferindo, setConferindo] = useState(false);
  const [fechando, setFechando] = useState(false);
  // R12: os recortes enumeraveis (empresa, obra, vinculo, status) viram
  // MARCACAO — um conjunto por dimensao; competencia e continua e vive na
  // prop `campos` da BarraFiltros (R16b).
  const [filtros, setFiltros] = useState(() => ({
    ...filtrosVazios(),
    competencia: parametros.get('competencia') || '',
    obra_id: parametros.get('obra_id') ? new Set([parametros.get('obra_id')]) : new Set()
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
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:rh-dp-apuracao:lista', FILTROS_DA_TELA, {
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
  const [form, setForm] = useState(() => ({
    ...initialForm(),
    competencia: parametros.get('competencia') || ''
  }));
  const [fechamentoForm, setFechamentoForm] = useState({
    data_fechamento: new Date().toISOString().slice(0, 10),
    data_vencimento: '',
    categoria_financeira_id: '',
    observacoes: ''
  });

  useEffect(() => {
    carregarBase();
  }, []);

  // Filtro marcado aplica na hora (padrao Solicitacoes); a competencia
  // digitada espera 350ms para nao martelar a API a cada tecla.
  useEffect(() => {
    const atraso = setTimeout(() => carregarApuracoes(filtros), 350);
    return () => clearTimeout(atraso);
  }, [filtros]);

  useEffect(() => {
    const next = {};
    (detalhe?.itens || []).forEach((item) => {
      next[item.id] = toEditState(item);
    });
    setEdicoes(next);
    setFechamentoForm({
      data_fechamento: new Date().toISOString().slice(0, 10),
      data_vencimento: getLastDayOfCompetencia(detalhe?.competencia),
      categoria_financeira_id: '',
      observacoes: ''
    });
  }, [detalhe]);

  useEffect(() => {
    if (!financeiroHabilitado || !podeFechar) {
      setCategoriasFinanceiras([]);
      return;
    }
    carregarCategoriasFinanceiras();
  }, [financeiroHabilitado, podeFechar]);

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
      avisar.erro(error?.message || 'Erro ao carregar base da apuração RH/DP');
    } finally {
      setCarregandoBase(false);
    }
  }

  async function carregarCategoriasFinanceiras() {
    try {
      setCarregandoCategorias(true);
      const data = await getRhCategoriasFinanceiras();
      setCategoriasFinanceiras(Array.isArray(data) ? data.filter((item) => {
        const tipo = String(item?.tipo || '').trim().toUpperCase();
        const hasDreGroup = String(item?.dre_grupo || '').trim();
        return (!tipo || tipo === 'PAGAR' || tipo === 'AMBOS') && item?.considera_dre !== false && hasDreGroup;
      }) : []);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar categorias financeiras');
    } finally {
      setCarregandoCategorias(false);
    }
  }

  async function carregarApuracoes(nextFiltros = filtros) {
    try {
      setCarregandoLista(true);
      const data = await getRhApuracoes({
        competencia: nextFiltros.competencia || undefined,
        empresa_grupo_id: valorUnico(nextFiltros.empresa_grupo_id),
        obra_id: valorUnico(nextFiltros.obra_id),
        tipo_vinculo: valorUnico(nextFiltros.tipo_vinculo),
        status: valorUnico(nextFiltros.status)
      });
      setApuracoes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar apuracoes RH/DP');
    } finally {
      setCarregandoLista(false);
    }
  }

  async function abrirApuracao(id) {
    try {
      const data = await getRhApuracao(id);
      setDetalhe(data);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar detalhe da apuração RH/DP');
    }
  }

  async function onGerarApuracao(event) {
    event.preventDefault();
    if (!podeEditar) return;

    if (!form.competencia) {
      avisar.alerta('Informe a competência antes de gerar a apuração.');
      return;
    }

    try {
      setGerando(true);
      const data = await gerarRhApuracao({
        competencia: form.competencia,
        dias_base: Number(form.dias_base || 30),
        tipo_vinculo: form.tipo_vinculo || undefined,
        observacoes: form.observacoes || undefined
      });

      const apuracoesGeradas = Array.isArray(data?.apuracoes) ? data.apuracoes : [data].filter(Boolean);
      setDetalhe(apuracoesGeradas[0] || null);
      await carregarApuracoes();
      if (apuracoesGeradas.length > 1) {
        avisar.informacao(`${apuracoesGeradas.length} apuracoes foram geradas, uma para cada obra confirmada na importacao.`);
      }
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao gerar apuracao RH/DP');
    } finally {
      setGerando(false);
    }
  }

  async function salvarItem(itemId) {
    if (!detalhe?.id || !edicoes[itemId]) {
      return;
    }

    try {
      setSalvandoItemId(itemId);
      const atualizado = await atualizarRhApuracaoItem(detalhe.id, itemId, {
        ajuste_credito_manual: edicoes[itemId].ajuste_credito_manual || '0',
        ajuste_debito_manual: edicoes[itemId].ajuste_debito_manual || '0',
        observacoes: edicoes[itemId].observacoes || undefined,
        status: edicoes[itemId].status,
        chave_pix_titulo: edicoes[itemId].chave_pix_titulo || undefined
      });
      setDetalhe(atualizado);
      await carregarApuracoes();
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao salvar ajuste do item da apuracao');
    } finally {
      setSalvandoItemId(null);
    }
  }

  async function marcarComoConferida() {
    if (!detalhe?.id) return;

    const { ok } = await confirmar({
      titulo: 'Concluir conferência',
      mensagem: 'Concluir a conferência desta apuração? Todos os itens precisam estar marcados como conferidos.',
      rotuloConfirmar: 'Concluir conferência'
    });
    if (!ok) return;

    try {
      setConferindo(true);
      const atualizado = await conferirRhApuracao(detalhe.id);
      setDetalhe(atualizado);
      await carregarApuracoes();
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao concluir a conferencia da apuracao');
    } finally {
      setConferindo(false);
    }
  }

  async function onFecharApuracao(event) {
    event.preventDefault();
    if (!detalhe?.id || !financeiroHabilitado || !podeFechar) {
      return;
    }

    // Fechar e irreversivel pelo caminho normal (so o estorno desfaz, e so
    // enquanto nenhum titulo estiver baixado): confirmacao destrutiva.
    const { ok } = await confirmar({
      titulo: 'Fechar competência',
      mensagem: `Fechar a competencia ${detalhe.competencia} e gerar os titulos a pagar no financeiro central? Depois de fechada, so um estorno reabre a apuracao — e apenas enquanto nenhum titulo estiver baixado.`,
      rotuloConfirmar: 'Fechar e gerar titulos',
      destrutiva: true
    });
    if (!ok) return;

    try {
      setFechando(true);
      const data = await fecharRhApuracao(detalhe.id, {
        data_fechamento: fechamentoForm.data_fechamento || undefined,
        data_vencimento: fechamentoForm.data_vencimento || undefined,
        categoria_financeira_id: fechamentoForm.categoria_financeira_id
          ? Number(fechamentoForm.categoria_financeira_id)
          : undefined,
        observacoes: fechamentoForm.observacoes || undefined
      });
      await carregarApuracoes();
      navigate(`/rh-dp/fechamentos?fechamento_id=${data.id}`);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao fechar a apuracao RH/DP');
    } finally {
      setFechando(false);
    }
  }

  async function reabrirFechamentoAtual() {
    if (!detalhe?.fechamentoRh?.id || !podeReabrirFechamento) {
      return;
    }

    // R16b: confirmar e justificar viraram UM passo — a justificativa que
    // saia em `window.prompt` e agora o campo da propria confirmacao.
    const { ok, texto } = await confirmar({
      titulo: 'Estornar fechamento',
      mensagem: `Estornar o fechamento de ${detalhe.competencia} e reabrir a apuracao? Os titulos gerados no financeiro sao cancelados. So e permitido se nenhum deles estiver baixado.`,
      rotuloConfirmar: 'Estornar e reabrir',
      destrutiva: true,
      campo: { rotulo: 'Justificativa', obrigatorio: true, multilinha: true }
    });
    if (!ok || !texto.trim()) {
      return;
    }

    try {
      setFechando(true);
      await reabrirRhFechamento(detalhe.fechamentoRh.id, {
        justificativa: texto.trim()
      });
      const atualizado = await getRhApuracao(detalhe.id);
      setDetalhe(atualizado);
      await carregarApuracoes();
      avisar.sucesso('Fechamento estornado e apuração reaberta. O financeiro foi notificado.');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao reabrir fechamento RH/DP');
    } finally {
      setFechando(false);
    }
  }

  const resumoLista = useMemo(() => {
    return apuracoes.reduce(
      (acc, item) => {
        acc.quantidade += 1;
        acc.totalBruto += Number(item.total_bruto || 0);
        acc.totalLiquido += Number(item.total_liquido || 0);
        if (item.status === 'CONFERIDA') {
          acc.conferidas += 1;
        } else {
          acc.rascunhos += 1;
        }
        return acc;
      },
      {
        quantidade: 0,
        totalBruto: 0,
        totalLiquido: 0,
        conferidas: 0,
        rascunhos: 0
      }
    );
  }, [apuracoes]);

  const dimensoesFiltro = useMemo(() => ([
    {
      id: 'empresa_grupo_id',
      rotulo: 'Empresa do grupo',
      unico: true,
      opcoes: empresas.map((item) => ({ valor: String(item.id), rotulo: item.nome }))
    },
    {
      id: 'obra_id',
      rotulo: 'Obra',
      unico: true,
      opcoes: obras.map((item) => ({
        valor: String(item.id),
        rotulo: item.codigo ? `${item.codigo} - ${item.nome}` : item.nome
      }))
    },
    {
      id: 'tipo_vinculo',
      rotulo: 'Vínculo',
      unico: true,
      opcoes: [
        { valor: 'CLT', rotulo: 'CLT' },
        { valor: 'NAO_CLT', rotulo: 'Não CLT' }
      ]
    },
    {
      id: 'status',
      rotulo: 'Status',
      unico: true,
      opcoes: [
        { valor: 'RASCUNHO', rotulo: 'Rascunho' },
        { valor: 'CONFERIDA', rotulo: 'Conferida' }
      ]
    }
  ]), [empresas, obras]);

  return (
    <div className="app-pagina">
      <Avisos avisos={avisos} aoFechar={fechar} />

      {/* Formulario de ACAO, nao filtro: e daqui que a pre-folha nasce. */}
      <BlocoConteudo
        titulo="Gerar apuração"
        descricao="A pré-folha da competência sai das obras informadas nas importações confirmadas; depois revise por colaborador e registre os ajustes auditados."
      >
        <form className="space-y-4" onSubmit={onGerarApuracao}>
          {/* Três controles curtos + a observação, que toma a linha (tipo
              "observacao"). Com `colunas={2}` sobrava uma célula vazia no meio
              da grade; com 3 a linha fecha exata. */}
          <FormSecao legenda="Recorte da apuração" colunas={3}>
            <CampoForm label="Competência">
              <input
                type="month"
                className="input w-full"
                value={form.competencia}
                onChange={(event) => setForm((current) => ({ ...current, competencia: event.target.value }))}
                disabled={!podeEditar}
              />
            </CampoForm>
            <CampoForm label="Base para diária">
              <select
                className="input w-full"
                value={form.dias_base}
                onChange={(event) => setForm((current) => ({ ...current, dias_base: event.target.value }))}
                disabled={!podeEditar}
              >
                <option value="30">30 dias - mensal padrão</option>
                <option value="22">22 dias - dias úteis</option>
                <option value="20">20 dias - escala operacional</option>
              </select>
            </CampoForm>
            <CampoForm label="Tipo de vínculo">
              <select
                className="input w-full"
                value={form.tipo_vinculo}
                onChange={(event) => setForm((current) => ({ ...current, tipo_vinculo: event.target.value }))}
                disabled={!podeEditar}
              >
                <option value="">Todos os vínculos</option>
                <option value="CLT">CLT</option>
                <option value="NAO_CLT">Não CLT</option>
              </select>
            </CampoForm>
            <CampoForm label="Observações do recorte" tipo="observacao">
              <textarea
                className="input w-full"
                rows={3}
                placeholder="Observações do recorte"
                value={form.observacoes}
                onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))}
                disabled={!podeEditar}
              />
            </CampoForm>
          </FormSecao>

          {podeEditar ? (
            <div className="app-actionbar">
              <button type="submit" className="btn btn-primary" disabled={gerando}>
                {gerando ? 'Gerando apuracoes...' : 'Gerar apuracoes das obras importadas'}
              </button>
            </div>
          ) : null}
        </form>
      </BlocoConteudo>

      <StatGrid colunas={4}>
        <StatTile label="Apurações" valor={resumoLista.quantidade} />
        <StatTile label="Bruto filtrado" valor={formatCurrency(resumoLista.totalBruto)} />
        <StatTile label="Líquido filtrado" valor={formatCurrency(resumoLista.totalLiquido)} />
        <StatTile
          label="Status"
          valor={`${resumoLista.rascunhos} rascunho(s)`}
          sub={`${resumoLista.conferidas} conferida(s)`}
          tom={resumoLista.rascunhos ? 'warning' : 'success'}
        />
      </StatGrid>

      <BlocoConteudo
        titulo="Apurações"
        variante="primario"
        cor="var(--c-primary)"
      >
        {/* R12/R16: o cartao de filtros com grade de select saiu inteiro.
            Competencia (continua) vai em `campos`; empresa, obra, vinculo e
            status sao enumeraveis e vao em `filtros`, com marcacao e etiqueta
            removivel. Cada um e `unico` porque o servico so aceita UM valor
            por recorte. O filtro aplica ao marcar — nao ha mais "Aplicar". */}
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
            tipo_vinculo: filtros.tipo_vinculo,
            status: filtros.status
          }}
          aoAlternar={(dimensao, valor, opcoes) => setFiltros((atuais) => alternarValorFiltro(atuais, dimensao, valor, opcoes))}
          aoLimpar={() => setFiltros(filtrosVazios())}
          visibilidade={visibilidadeFiltros}
        />

        <TabelaPadrao
          colunas={[
            {
              id: 'competencia',
              titulo: 'Competência',
              tipo: 'codigo',
              render: (item) => item.competencia
            },
            {
              /*
                R17 — quem NOMEIA a apuracao é a OBRA, não a empresa do grupo.
                O gerador só cria apuracao a partir de importacao CONFIRMADA
                com obra (`obra_id: { [Op.ne]: null }`, rhApuracaoService), uma
                por obra; `empresa_grupo_id` é opcional e vem nulo sempre que a
                importacao não tem empresa do grupo — daí o "Por colaborador"
                repetido em toda linha. O detalhe já titula o registro assim:
                "Apuracao {competencia} - {obra}".

                Corrigir o papel também conserta a largura (T4): a sobra do
                contêiner vai para a PRIMEIRA coluna flexível, e com a empresa
                marcada como identidade era ela que engolia ~570px para exibir
                um rótulo de 144px, enquanto a obra (291px de nome real em
                180px de coluna) quebrava em duas linhas. Por isso a obra vem
                antes: identidade primeiro é a ordem de leitura das outras
                listas, e a sobra passa a cair no texto que precisa dela.
              */
              id: 'obra',
              titulo: 'Obra',
              tipo: 'identidade',
              noCard: 'titulo',
              render: (item) => item.obra?.nome || '-'
            },
            {
              id: 'empresa',
              titulo: 'Empresa',
              tipo: 'texto',
              /*
                A COLUNA DE CONTEÚDO DESTA TABELA É A EMPRESA (04/09).

                Medido no preview: "EMPRESA" quebrava em duas linhas
                enquanto "OBRA" segurava 215px de folga. As duas nascem com
                `flexPadrao` (identidade e texto), e sem peso explícito a
                sobra vai para a PRIMEIRA delas — que aqui é a obra, e não
                precisava.

                O componente distribui a sobra para UMA coluna só e escolhe
                pela declaração, não pelo conteúdo renderizado: ele não tem
                como saber qual texto é mais longo nesta base. Quem sabe é a
                tela, e o jeito de dizer é o peso.
              */
              flex: 2,
              render: (item) => item.empresaGrupo?.nome || 'Por colaborador'
            },
            {
              id: 'vinculo',
              titulo: 'Vínculo',
              tipo: 'badge',
              render: (item) => item.tipo_vinculo || 'Misto'
            },
            {
              id: 'base',
              titulo: 'Base',
              tipo: 'numero',
              render: (item) => `${item.dias_base || 30} dias`
            },
            {
              id: 'colaboradores',
              titulo: 'Colaboradores',
              tipo: 'numero',
              render: (item) => item.total_colaboradores || 0
            },
            {
              id: 'liquido',
              titulo: 'Líquido',
              tipo: 'valor',
              render: (item) => formatCurrency(item.total_liquido)
            },
            {
              id: 'status',
              titulo: 'Status',
              tipo: 'status',
              render: (item) => (
                <StatusBadge status={rotuloStatus(item.status)} kind={familiaStatus(item.status)} />
              )
            },
            {
              id: 'gerada',
              titulo: 'Gerada em',
              tipo: 'data',
              render: (item) => formatDate(item.createdAt)
            }
          ]}
          itens={apuracoes}
          storageKey="tabela:rh-dp-apuracao:lista"
          rotuloRolagem="Apurações RH/DP"
          carregando={carregandoBase || carregandoLista}
          vazio="Nenhuma apuração encontrada para os filtros atuais."
          acoesLinha={(item) => (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => abrirApuracao(item.id)}>
              Abrir
            </button>
          )}
          larguraAcoes={120}
        />
      </BlocoConteudo>

      {detalhe ? (
        <BlocoConteudo
          titulo={`Apuração ${detalhe.competencia} - ${detalhe.obra?.nome || 'obra nao informada'}`}
          contagem={`${detalhe.total_colaboradores || 0} colaborador(es)`}
          descricao={`Recorte: empresa do cadastro do colaborador | ${detalhe.tipo_vinculo || 'todos os vinculos'} | base ${detalhe.dias_base || 30} dias | criada em ${formatDateTime(detalhe.createdAt)} por ${detalhe.criadoPor?.nome || 'sistema'}`}
          acoes={(
            <>
              <StatusBadge status={rotuloStatus(detalhe.status)} kind={familiaStatus(detalhe.status)} />
              {detalhe.fechamentoRh ? (
                <>
                  <Link to={`/rh-dp/fechamentos?fechamento_id=${detalhe.fechamentoRh.id}`} className="btn btn-outline btn-sm">
                    Ver fechamento
                  </Link>
                  {podeReabrirFechamento ? (
                    <button type="button" className="btn btn-outline btn-sm" onClick={reabrirFechamentoAtual} disabled={fechando}>
                      {fechando ? 'Processando...' : 'Estornar e reabrir'}
                    </button>
                  ) : null}
                </>
              ) : null}
              {detalhe.status === 'RASCUNHO' && podeEditar ? (
                <button type="button" className="btn btn-primary btn-sm" onClick={marcarComoConferida} disabled={conferindo}>
                  {conferindo ? 'Concluindo...' : 'Marcar apuracao como conferida'}
                </button>
              ) : null}
            </>
          )}
        >
          <StatGrid colunas={5}>
            <StatTile label="Total bruto" valor={formatCurrency(detalhe.total_bruto)} />
            <StatTile label="Total descontos" valor={formatCurrency(detalhe.total_descontos)} />
            <StatTile label="Total líquido" valor={formatCurrency(detalhe.total_liquido)} />
            <StatTile
              label="Conferência"
              valor={`${detalhe.resumo_operacional?.itens_conferidos || 0} item(ns)`}
              sub={`${detalhe.resumo_operacional?.itens_pendentes || 0} pendente(s)`}
              tom={detalhe.resumo_operacional?.itens_pendentes ? 'warning' : 'success'}
            />
            <StatTile
              label="Base da diária"
              valor={`${detalhe.dias_base || 30} dias`}
              sub="Parametro usado no cálculo proporcional"
            />
          </StatGrid>

          {detalhe.observacoes ? (
            <p className="app-note">
              <strong>Observações:</strong> {detalhe.observacoes}
            </p>
          ) : null}

          {!financeiroHabilitado ? (
            <Alert
              type="warning"
              message="O fechamento com geracao de titulos depende do modulo FINANCEIRO habilitado na instalacao."
            />
          ) : null}

          {detalhe.fechamentoRh ? (
            <Alert
              type="success"
              title="Competência fechada"
              message={(
                <>
                  Fechada em {new Date(`${detalhe.fechamentoRh.data_fechamento}T00:00:00`).toLocaleDateString('pt-BR')} com vencimento em{' '}
                  {new Date(`${detalhe.fechamentoRh.data_vencimento}T00:00:00`).toLocaleDateString('pt-BR')}.{' '}
                  <Link to={`/rh-dp/fechamentos?fechamento_id=${detalhe.fechamentoRh.id}`}>
                    Abrir lote financeiro
                  </Link>
                </>
              )}
            />
          ) : null}

          {financeiroHabilitado && detalhe.status === 'CONFERIDA' && !detalhe.fechamentoRh && podeFechar ? (
            <BlocoConteudo
              variante="secundario"
              titulo="Fechamento da competência"
              descricao="O fechamento gera títulos PAGAR no financeiro central e vincula cada item da apuração ao respectivo título. A categoria financeira deve estar marcada para DRE e com grupo DRE classificado."
            >
              <form className="space-y-4" onSubmit={onFecharApuracao}>
                {/* Quatro células: as duas datas, a categoria em `span={2}` e a
                    observação na linha. Fecha sem buraco e sem esticar um
                    campo de data por metade do bloco. */}
                <FormSecao legenda="Dados do lote" colunas={4}>
                  <CampoForm label="Data de fechamento">
                    <DateInputBR
                      className="input w-full"
                      value={fechamentoForm.data_fechamento}
                      onChange={(event) => setFechamentoForm((current) => ({ ...current, data_fechamento: event.target.value }))}
                      disabled={fechando}
                    />
                  </CampoForm>

                  <CampoForm label="Data de vencimento">
                    <DateInputBR
                      className="input w-full"
                      value={fechamentoForm.data_vencimento}
                      onChange={(event) => setFechamentoForm((current) => ({ ...current, data_vencimento: event.target.value }))}
                      disabled={fechando}
                    />
                  </CampoForm>

                  <CampoForm
                    label="Categoria financeira"
                    obrigatorio
                    span={2}
                    hint={!carregandoCategorias && !categoriasFinanceiras.length
                      ? 'Cadastre uma categoria PAGAR/AMBOS marcada para DRE e com grupo DRE antes de fechar.'
                      : undefined}
                  >
                    <select
                      className="input w-full"
                      value={fechamentoForm.categoria_financeira_id}
                      onChange={(event) => setFechamentoForm((current) => ({ ...current, categoria_financeira_id: event.target.value }))}
                      disabled={fechando || carregandoCategorias}
                      required
                    >
                      <option value="">Selecione a categoria da folha</option>
                      {categoriasFinanceiras.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nome}{item.dre_grupo ? ` - ${item.dre_grupo}` : ''}
                        </option>
                      ))}
                    </select>
                  </CampoForm>

                  <CampoForm label="Observações do fechamento" tipo="observacao">
                    <textarea
                      className="input w-full"
                      rows={3}
                      value={fechamentoForm.observacoes}
                      onChange={(event) => setFechamentoForm((current) => ({ ...current, observacoes: event.target.value }))}
                      disabled={fechando}
                    />
                  </CampoForm>
                </FormSecao>

                <div className="app-actionbar">
                  <button type="submit" className="btn btn-primary" disabled={fechando}>
                    {fechando ? 'Fechando competencia...' : 'Fechar competencia e gerar titulos'}
                  </button>
                </div>
              </form>
            </BlocoConteudo>
          ) : null}

          <TabelaPadrao
            colunas={[
              {
                id: 'colaborador',
                titulo: 'Colaborador',
                // R17: o item da apuracao é de um COLABORADOR nomeado.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (item) => (
                  <CelulaDupla
                    principal={item.colaborador?.nome || '-'}
                    sub={`${item.colaborador?.matricula || '-'} | ${item.colaborador?.cargo || '-'}`}
                  />
                )
              },
              {
                id: 'vinculo',
                titulo: 'Vínculo',
                tipo: 'badge',
                render: (item) => item.colaborador?.tipo_vinculo || '-'
              },
              {
                id: 'dias',
                titulo: 'Dias',
                tipo: 'numero',
                render: (item) => formatNumber(item.dias_trabalhados)
              },
              {
                id: 'horas_extras',
                titulo: 'Horas extras',
                tipo: 'numero',
                render: (item) => formatNumber(item.horas_extras)
              },
              {
                id: 'bruto',
                titulo: 'Bruto',
                tipo: 'valor',
                render: (item) => formatCurrency(item.valor_bruto)
              },
              {
                id: 'descontos',
                titulo: 'Descontos',
                tipo: 'valor',
                render: (item) => formatCurrency(item.valor_descontos)
              },
              {
                id: 'liquido',
                titulo: 'Líquido',
                tipo: 'valor',
                render: (item) => (
                  <CelulaDupla
                    principal={formatCurrency(item.valor_liquido)}
                    sub={item.regra_aplicada || '-'}
                  />
                )
              },
              {
                id: 'pix',
                sempreVisivel: true,
                titulo: 'PIX do título',
                tipo: 'texto',
                // Edicao inline: o controle mora no render da coluna.
                render: (item) => {
                  const pixOptions = getPixOptions(item);
                  return (
                    <>
                      <select
                        className="input"
                        value={edicoes[item.id]?.chave_pix_titulo ?? getDefaultPixValue(item)}
                        onChange={(event) =>
                          setEdicoes((current) => ({
                            ...current,
                            [item.id]: {
                              ...current[item.id],
                              chave_pix_titulo: event.target.value
                            }
                          }))
                        }
                        disabled={!podeEditar || detalhe.status !== 'RASCUNHO' || !pixOptions.length}
                      >
                        {!pixOptions.length ? (
                          <option value="">Sem chave PIX</option>
                        ) : (
                          pixOptions.map((option) => (
                            <option key={option.key} value={option.value}>
                              {option.label}: {option.value}
                            </option>
                          ))
                        )}
                      </select>
                      <span className="app-note mt-1 block">Principal usada por padrão.</span>
                    </>
                  );
                }
              },
              {
                id: 'ajuste_credito',
                sempreVisivel: true,
                titulo: 'Ajuste crédito',
                tipo: 'texto',
                render: (item) => (
                  <input
                    type="text"
                    className="input"
                    value={edicoes[item.id]?.ajuste_credito_manual ?? ''}
                    onChange={(event) =>
                      setEdicoes((current) => ({
                        ...current,
                        [item.id]: {
                          ...current[item.id],
                          ajuste_credito_manual: event.target.value
                        }
                      }))
                    }
                    disabled={!podeEditar || detalhe.status !== 'RASCUNHO'}
                  />
                )
              },
              {
                id: 'ajuste_debito',
                sempreVisivel: true,
                titulo: 'Ajuste débito',
                tipo: 'texto',
                render: (item) => (
                  <input
                    type="text"
                    className="input"
                    value={edicoes[item.id]?.ajuste_debito_manual ?? ''}
                    onChange={(event) =>
                      setEdicoes((current) => ({
                        ...current,
                        [item.id]: {
                          ...current[item.id],
                          ajuste_debito_manual: event.target.value
                        }
                      }))
                    }
                    disabled={!podeEditar || detalhe.status !== 'RASCUNHO'}
                  />
                )
              },
              {
                id: 'status',
                sempreVisivel: true,
                titulo: 'Status',
                tipo: 'badge',
                render: (item) => (
                  <select
                    className="input"
                    value={edicoes[item.id]?.status || 'PENDENTE'}
                    onChange={(event) =>
                      setEdicoes((current) => ({
                        ...current,
                        [item.id]: {
                          ...current[item.id],
                          status: event.target.value
                        }
                      }))
                    }
                    disabled={!podeEditar || detalhe.status !== 'RASCUNHO'}
                  >
                    <option value="PENDENTE">Pendente</option>
                    <option value="CONFERIDO">Conferido</option>
                  </select>
                )
              },
              {
                id: 'observacoes',
                sempreVisivel: true,
                titulo: 'Observações',
                tipo: 'texto',
                render: (item) => (
                  <textarea
                    className="input"
                    rows={2}
                    value={edicoes[item.id]?.observacoes ?? ''}
                    onChange={(event) =>
                      setEdicoes((current) => ({
                        ...current,
                        [item.id]: {
                          ...current[item.id],
                          observacoes: event.target.value
                        }
                      }))
                    }
                    disabled={!podeEditar || detalhe.status !== 'RASCUNHO'}
                  />
                )
              }
            ]}
            itens={detalhe.itens || []}
            storageKey="tabela:rh-dp-apuracao:itens"
            rotuloRolagem="Itens da apuracao"
            vazio="A apuração não possui itens."
            acoesLinha={(item) => (
              podeEditar && detalhe.status === 'RASCUNHO' ? (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => salvarItem(item.id)}
                  disabled={salvandoItemId === item.id}
                >
                  {salvandoItemId === item.id ? 'Salvando...' : 'Salvar ajuste'}
                </button>
              ) : null
            )}
            larguraAcoes={160}
          />
        </BlocoConteudo>
      ) : null}

      {elementoConfirmacao}
    </div>
  );
}
