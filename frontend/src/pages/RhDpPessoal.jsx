import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  HiOutlineArrowPath,
  HiOutlineArrowsRightLeft,
  HiOutlineEye,
  HiOutlineUserMinus
} from 'react-icons/hi2';
import OverlayModal from '../components/ui/OverlayModal';
import {
  Avisos,
  BarraFiltros,
  CelulaDupla,
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  TabelaPadrao,
  alternarValorFiltro,
  useAvisos,
  useConfirmacao
} from '../components/padrao';
import { useAuth } from '../contexts/AuthContext';
import { getMinhasObras, getObras } from '../services/obras';
import { getNotificacoes } from '../services/notificacoes';
import {
  abrirRhSolicitacao,
  aprovarRhSolicitacao,
  cancelarRhSolicitacao,
  conferirDocumentacaoRhSolicitacao,
  getRhColaboradores,
  getRhEmpresasGrupo,
  listarRhSolicitacoes,
  reenviarRhSolicitacao,
  rejeitarRhSolicitacao
,
  getRhCargos,
  getRhApontamentos,
  anexarNaRhSolicitacao,
  getRhChecklistDoTipo} from '../services/rhDp';
import RhDpPessoalSolicitacoes from './RhDpPessoalSolicitacoes';
import RhDpTransferencias from './RhDpTransferencias';
import RhDpJornada from './RhDpJornada';
import RhDpApuracao from './RhDpApuracao';
import RhDpFechamentos from './RhDpFechamentos';
import RhDpEventosRecorrentes from './RhDpEventosRecorrentes';
import {
  canViewRhDpApuracao,
  canViewRhDpObrigacoes,
  hasAnyExplicitPermissao,
  hasEnabledModule,
  isBusinessAdmin
} from '../utils/acessoProduto';
import { userBelongsToDpSetor, userHasSetorCapability } from '../utils/setor';
import {
  formatCurrencyInput,
  getCpfCnpjError,
  getPixDocumentError,
  maskCpfCnpj,
  normalizeCurrencyTyping,
  parseCurrencyInput
} from '../utils/formatters';
import DateInputBR from '../components/DateInputBR';
import ParcelasEventoEditor, {
  validarParcelasEvento,
  valoresParcelasParaPayload
} from '../components/rh/ParcelasEventoEditor';
import ObraAutocomplete from '../components/ui/ObraAutocomplete';

/**
 * A TELA CONSOLIDADA DO DP (Fase 6 do modulo DP, 26/08).
 *
 * Pedido do cliente, textual: "uma unica pagina com avisos visuais de novas solicitacoes para
 * termos agilidade tanto da parte da obra quanto da parte do DP, de preferencia que isso ocorra em
 * uma lista de colaboradores que, quando tiver alguma solicitacao para aquele colaborador, ele seja
 * posicionado primeiro na lista e ganhe destaque visual e de status".
 *
 * A ORDENACAO NAO E FEITA AQUI. `listarColaboradoresRh` ja devolve quem tem pedido em aberto
 * primeiro, com os pedidos embutidos na linha. Reordenar no navegador significaria baixar tudo para
 * so entao decidir o que mostrar em cima — e a tela que existe para dar AGILIDADE ficaria mais
 * lenta quanto mais pedidos houvesse, que e exatamente o contrario do pedido.
 *
 * OS BOTOES SEGUEM A PERMISSAO, nao o setor. Quem pode abrir ve os botoes de pedir; quem pode
 * decidir ve aprovar e devolver. Um usuario que acumule as duas ve as duas — o sistema nao presume
 * que "obra" e "DP" sejam pessoas diferentes, porque em obra pequena as vezes nao sao.
 */

const TIPOS = [
  { valor: 'ADMISSAO', rotulo: 'Admissao' },
  { valor: 'MOVIMENTACAO', rotulo: 'Movimentacao' },
  { valor: 'DEMISSAO', rotulo: 'Demissao' },
  { valor: 'PAGAMENTO_MAO_DE_OBRA', rotulo: 'Pagamento de mao de obra' },
  { valor: 'EVENTO_RECORRENTE', rotulo: 'Evento recorrente' },
  // LEGADOS: nao sao mais oferecidos, mas existem gravados e a tela precisa saber rotula-los.
  { valor: 'TROCA_OBRA', rotulo: 'Troca de obra' },
  { valor: 'ALTERACAO_SALARIAL', rotulo: 'Alteracao salarial' }
];

/**
 * OS SEIS SUBTIPOS DE MOVIMENTACAO, na ordem do item 9 do escopo.
 *
 * Decisao do cliente em 27/08: "Movimentacoes passa o botao principal, e Troca de Obra e Alteracao
 * de Salario entra na lista de movimentacoes possiveis". Por isso a coluna de acoes passou de
 * quatro icones para tres — os dois que sairam viraram opcao DENTRO deste modal.
 */
const SUBTIPOS_MOVIMENTACAO = [
  { valor: 'ATESTADO', rotulo: 'Atestado' },
  { valor: 'FERIAS', rotulo: 'Ferias' },
  { valor: 'RETORNO_AFASTAMENTO', rotulo: 'Retorno de afastamento' },
  { valor: 'ALTERACAO_SALARIAL', rotulo: 'Alteracao salarial' },
  { valor: 'ALTERACAO_CARGO', rotulo: 'Alteracao de cargo ou funcao' },
  { valor: 'TRANSFERENCIA_OBRA', rotulo: 'Transferencia de obra' }
];

/** Os cinco motivos do item 10. Aqui o motivo E o subtipo — e o que muda a papelada exigida. */
const MOTIVOS_DEMISSAO = [
  { valor: 'PEDIDO_DEMISSAO', rotulo: 'Pedido de demissao' },
  { valor: 'SEM_JUSTA_CAUSA', rotulo: 'Sem justa causa' },
  { valor: 'COM_JUSTA_CAUSA', rotulo: 'Com justa causa' },
  { valor: 'TERMINO_CONTRATO', rotulo: 'Termino de contrato' },
  { valor: 'ACORDO_PARTES', rotulo: 'Acordo entre as partes' }
];

/**
 * Os dias de afastamento, contando os DOIS extremos — igual ao servidor.
 *
 * Atestado de 10 a 12 e de TRES dias, nao dois: o dia de inicio e dia parado. A conta e repetida
 * aqui so para a tela mostrar o numero enquanto se digita; quem grava e o servidor, que recalcula.
 * Numero vindo do cliente e sugestao, nunca verdade.
 */
function diasEntre(inicio, fim) {
  if (!inicio || !fim) return null;
  const de = new Date(inicio + 'T00:00:00.000Z');
  const ate = new Date(fim + 'T00:00:00.000Z');
  if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime())) return null;
  const dias = Math.floor((ate.getTime() - de.getTime()) / 86400000) + 1;
  return dias > 0 ? dias : null;
}

const ROTULO_SUBTIPO = [...SUBTIPOS_MOVIMENTACAO, ...MOTIVOS_DEMISSAO]
  .reduce((acc, s) => ({ ...acc, [s.valor]: s.rotulo }), {});

/**
 * AS ACOES DA LINHA SAO ICONES, NAO BOTOES DE TEXTO.
 *
 * Cinco botoes escritos por linha ocupavam 400px de coluna e ainda quebravam em duas fileiras — a
 * tabela virava uma escada e o nome do colaborador, que e o que se procura, competia com eles.
 *
 * Cada icone leva `title` E `aria-label`: o primeiro da a dica ao passar o mouse, o segundo e o que
 * o leitor de tela anuncia. Icone sem nome acessivel e um botao mudo.
 */
/**
 * A ACAO DE OBRA TROCA DE NOME conforme o colaborador tenha ou nao lotacao.
 *
 * 136 dos 137 colaboradores da base estao SEM OBRA. Para eles, "Trocar de obra" e a palavra errada:
 * nao ha troca, ha a primeira lotacao. Oferecer "trocar" a quem nunca esteve em obra nenhuma faz a
 * pessoa procurar uma acao de "vincular" que nao existe — e desistir.
 *
 * O FLUXO E O MESMO (tipo TROCA_OBRA, mesma aprovacao, mesmo vinculo com vigencia). O que muda e o
 * rotulo e o icone. Criar um tipo de pedido separado so para isso duplicaria a regra de vigencia,
 * que e onde mora a aritmetica dificil.
 */
/**
 * O ROTULO DA OBRA MUDOU DE LUGAR, mas nao morreu (27/08).
 *
 * Ele era um icone proprio na coluna; com a decisao do cliente, transferencia de obra virou opcao
 * DENTRO de Movimentacoes. O que nao podia se perder e a razao de o rotulo variar:
 *
 * 136 dos 137 colaboradores da base estao SEM OBRA. Para eles, "transferencia" e a palavra errada —
 * nao ha transferencia, ha a primeira lotacao. Quem nunca esteve em obra nenhuma procura uma acao
 * de "vincular", nao acha, e desiste.
 *
 * O FLUXO E O MESMO (subtipo TRANSFERENCIA_OBRA, mesma aprovacao, mesmo vinculo com vigencia). Só
 * o texto muda, e agora ele muda na lista de subtipos do modal.
 */
function rotuloDaTransferencia(origem) {
  // `primeiraLotacao` vem do formulario e ja sabe se o colaborador tinha obra. Ler `obra_id` aqui
  // seria ler a obra do PEDIDO, que o usuario acabou de escolher — e ai todo mundo veria
  // "Transferencia", inclusive os 136 que nunca estiveram em obra nenhuma.
  return origem?.primeiraLotacao ? 'Vincular a uma obra' : 'Transferencia de obra';
}

/** Os subtipos como a tela deve mostra-los para ESTE colaborador. */
function subtiposParaColaborador(colaborador) {
  return SUBTIPOS_MOVIMENTACAO.filter(subtipo => subtipo.valor !== 'TRANSFERENCIA_OBRA' || colaborador?.primeiraLotacao === true || !colaborador?.obra_id).map((subtipo) => (
    subtipo.valor === 'TRANSFERENCIA_OBRA'
      ? { ...subtipo, rotulo: rotuloDaTransferencia(colaborador) }
      : subtipo
  ));
}

/**
 * TRES ICONES, e nao mais quatro (27/08).
 *
 * `Movimentacoes` virou o botao principal e absorveu "Trocar de obra" e "Alterar salario", que eram
 * icones proprios. A coluna ficou mais curta e a escolha do que se quer fazer passou para dentro do
 * modal, onde ha espaco para explicar cada opcao — na coluna, um icone so cabia o desenho.
 */
const ACOES_DA_LINHA = [
  { tipo: 'MOVIMENTACAO', rotulo: 'Movimentacoes', Icone: HiOutlineArrowsRightLeft },
  { tipo: 'DEMISSAO', rotulo: 'Demitir', Icone: HiOutlineUserMinus },
  { tipo: 'EVENTO_RECORRENTE', rotulo: 'Evento recorrente', Icone: HiOutlineArrowPath }
];

const ROTULO_TIPO = TIPOS.reduce((acc, t) => ({ ...acc, [t.valor]: t.rotulo }), {});

/** O titulo do modal acompanha o rotulo do icone que o abriu. */
function ehFutura(data) {
  if (!data) return false;
  return String(data).slice(0, 10) > new Date().toISOString().slice(0, 10);
}

/** Admissao futura sugere a data da admissao; o resto sugere hoje. */
function sugestaoDeVigencia(colaborador) {
  if (ehFutura(colaborador?.data_admissao)) return String(colaborador.data_admissao).slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function tituloDoFormulario(formulario) {
  // Cobre os dois: `TROCA_OBRA` e o tipo antigo, `MOVIMENTACAO/TRANSFERENCIA_OBRA` e o novo.
  const ehTransferencia = formulario.tipo === 'TROCA_OBRA'
    || (formulario.tipo === 'MOVIMENTACAO' && formulario.subtipo === 'TRANSFERENCIA_OBRA');
  if (ehTransferencia && formulario.primeiraLotacao) return 'Vincular a uma obra';
  return ROTULO_TIPO[formulario.tipo] || formulario.tipo;
}

function chipDoTipo(tipo) {
  if (tipo === 'ALTERACAO_SALARIAL') return 'rh-chip rh-chip--diretoria';
  if (tipo === 'EVENTO_RECORRENTE') return 'rh-chip rh-chip--evento';
  return 'rh-chip rh-chip--pedido';
}

function formularioVazio(tipo) {
  return {
    tipo,
    // Em MOVIMENTACAO e o evento; em DEMISSAO e o MOTIVO. Nasce vazio de proposito: e a primeira
    // escolha do usuario, e e ela que decide quais campos o modal mostra.
    subtipo: '',
    colaborador_id: '',
    obra_id: '',
    justificativa: '',
    // MOVIMENTACAO (afastamentos e alteracao de cargo)
    data_inicial: '',
    data_final: '',
    data_retorno: '',
    novo_cargo_id: '',
    // DEMISSAO (item 10)
    solicitado_por: '',
    ultimo_dia_trabalhado: '',
    valor_acordado: '',
    justificativa_acordo: '',
    apontamentos: [],
    // Uma linha por arquivo: cada uma leva o SEU tipo de documento. Um `<input multiple>` puro
    // deixaria os arquivos sem tipo, e todos com o mesmo tipo seria pior — a certidao do dependente
    // e o comprovante de escolaridade viriam etiquetados igual.
    anexos: [],
    // Item 8 do escopo: cargo pelo catalogo e carga horaria.
    cargo_id: '',
    carga_horaria_semanal: '',
    telefone: '', email: '', nome_pai: '', nome_mae: '',
    endereco: '', numero: '', complemento: '', bairro: '', municipio: '', estado: '', cep: '',
    banco: '', agencia: '', conta: '', conta_tipo: '', pix_chave_tipo: '', pix_chave: '',
    // ADMISSAO
    nome: '',
    cpf: '',
    empresa_grupo_id: '',
    cargo: '',
    tipo_vinculo: 'CLT',
    data_admissao: '',
    salario_base: '',
    forma_calculo_gerencial: 'MENSAL',
    valor_diaria: '',
    pagamento_automatico_40_60: false,
    // TROCA_OBRA
    obra_destino_id: '',
    data_vigencia: '',
    // DEMISSAO
    tem_aviso_previo: false,
    tipo_aviso_previo: 'TRABALHADO',
    data_desligamento: '',
    // EVENTO_RECORRENTE
    codigo: 'VALE_ALIMENTACAO',
    natureza: 'CREDITO',
    valor: '',
    modo_valor: 'PARCELA',
    competencia_inicio: '',
    parcelas_total: '',
    parcelas_valores: [],
    beneficiario_nome: '',
    beneficiario_documento: '',
    beneficiario_banco: '',
    beneficiario_agencia: '',
    beneficiario_conta: '',
    beneficiario_tipo_conta: '',
    beneficiario_chave_pix: '',
    // ALTERACAO_SALARIAL
    novo_salario: '',
    motivo: '',
    altera_funcao: false
  };
}

export default function RhDpPessoal() {
  const { user } = useAuth();
  const usuarioOperacionalDaObra = !isBusinessAdmin(user)
    && userHasSetorCapability(user, 'eh_setor_obra');

  const [colaboradores, setColaboradores] = useState([]);
  const [obras, setObras] = useState([]);
  // Lista propositalmente separada: filtros, admissao e jornada continuam limitados ao escopo
  // normal do usuario. Somente a Obra de destino da transferencia precisa enxergar todas as obras
  // ativas, pois a transferencia pode sair da obra atual para qualquer outra unidade operacional.
  const [obrasDestino, setObrasDestino] = useState([]);
  const [statusObrasDestino, setStatusObrasDestino] = useState('ocioso');
  const [empresas, setEmpresas] = useState([]);
  // O catalogo de cargos (Fase 7). Carregado sob demanda, e nao junto da lista principal: e usado
  // so na alteracao de cargo, e buscar sempre faria uma consulta que quase ninguem aproveita.
  const [cargos, setCargos] = useState([]);
  /**
   * O checklist do TIPO escolhido — usado para tipar cada arquivo que a obra anexa.
   *
   * Arquivo sem tipo entra como anexo AVULSO: nao conta para o checklist e nao vai para a pasta do
   * colaborador (regra da Fase 3). Por isso o campo de tipo nao e opcional na linha de anexo.
   */
  const [checklistDoTipo, setChecklistDoTipo] = useState([]);
  /*
    NASCE CARREGANDO, E ISSO NÃO É DETALHE (05/09).

    Começava `false`, e o `carregar()` só dispara depois dos 350ms de espera
    da busca. Nessa janela a tela renderiza com `carregando=false` e lista
    vazia — e a `TabelaPadrao` mostra o estado vazio, que aqui diz
    "Nenhum colaborador nesta obra."

    Ou seja: a tela AFIRMA que a obra não tem colaborador antes de ter
    perguntado. Medido no preview: a chamada devolve 200 com 99
    colaboradores, e mesmo assim a frase aparece no caminho. Quem recarrega
    a página lê uma informação falsa por um instante — e quem recarrega numa
    conexão lenta lê por mais tempo.

    É a mesma família do N52 e do erro que eu mesmo cometi hoje ao chamar de
    "base vazia" uma resposta com 110 registros: afirmar AUSÊNCIA quando a
    verdade é "ainda não medi". Vazio e não-perguntado são estados
    diferentes, e a tela só pode dizer o primeiro depois de descartar o
    segundo.

    Nascendo `true`, o primeiro quadro é "Carregando…" — que é verdade.
  */
  const [carregando, setCarregando] = useState(true);
  /**
   * R3/R16: aviso e confirmacao tem UM dono.
   *
   * As faixas `alert alert-danger`/`alert-success` com estado proprio (`erro`,
   * `aviso`) faziam o mesmo papel do `Avisos` do padrao, e o `window.confirm`/
   * `window.prompt` faziam o do `useConfirmacao` — com a diferenca de que a
   * caixa do navegador ignora tema, tokens e nao existe no DOM para ser lida.
   */
  const { avisos, avisar, fechar, limpar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [transferenciasNaoLidas, setTransferenciasNaoLidas] = useState(0);
  const [totalSolicitacoesAbertas, setTotalSolicitacoesAbertas] = useState(0);
  const [totalSolicitacoesNaoLidas, setTotalSolicitacoesNaoLidas] = useState(0);
  const limparNotificacoesTransferencia = useCallback(() => setTransferenciasNaoLidas(0), []);
  const marcarSolicitacaoVisualizada = useCallback(() => {
    setTotalSolicitacoesNaoLidas((quantidade) => Math.max(0, quantidade - 1));
  }, []);

  /**
   * DUAS ABAS, e a de solicitacoes vem PRIMEIRO de proposito.
   *
   * O cliente pediu "avisos visuais de novas solicitacoes para termos agilidade tanto da parte da
   * obra quanto da parte do DP". Quem abre esta tela abre para resolver o que esta parado — a lista
   * de colaboradores e consulta, e consulta pode esperar um clique.
   */
  /*
    D1 (02/09): Pessoal é a porta única do dia a dia, e a aba vive na URL.
    Duas razões práticas: as rotas antigas /rh-dp/jornada e /rh-dp/apuracao
    redirecionam para cá com ?aba=..., então favorito e link salvo continuam
    chegando onde chegavam; e voltar pelo navegador volta para a aba de
    onde a pessoa saiu, não para o começo.

    Sobre `replace`: a primeira versão usava `{ replace: true }` em toda
    troca de aba — e aí a segunda promessa era FALSA. Trocar de aba
    reescrevia a entrada de histórico, então "voltar" pulava a tela inteira
    e caía na página anterior. O revisor provou no preview: Colaboradores →
    Pessoal → aba Jornada → Voltar caía em Colaboradores.

    Agora: troca de aba EMPILHA (`push`), porque é navegação — a pessoa
    escolheu ir para outro lugar e espera poder voltar. O `replace` fica
    para a normalização da URL na entrada (quando `?aba=` vem ausente ou
    com valor inválido, corrigir a URL não é um passo que mereça histórico).
  */
  const [parametros, setParametros] = useSearchParams();
  const podeVerApuracao = canViewRhDpApuracao(user);
  const podeVerFechamentos = canViewRhDpObrigacoes(user) && hasEnabledModule(user, 'FINANCEIRO');
  const usuarioDoDp = userBelongsToDpSetor(user);
  /*
    Uma fonte só para rótulo, apoio do cabeçalho e ordem. O `apoio` existe
    porque o cabeçalho é ÚNICO para as quatro abas: o texto fixo antigo
    ("A obra pede, o Departamento Pessoal decide...") descrevia só a aba de
    solicitações e continuava lá, mentindo, em Jornada e Apuração.
    A permissão que a rota /rh-dp/apuracao exigia continua valendo: quem não
    podia ver a apuração não vê a aba.
  */
  const ABAS = useMemo(() => [
    {
      id: 'solicitacoes',
      rotulo: 'Solicitações',
      apoio: 'A obra pede, o Departamento Pessoal decide. Quem tem solicitação em aberto aparece primeiro.'
    },
    {
      id: 'colaboradores',
      rotulo: 'Colaboradores',
      apoio: 'Quem está na obra hoje, com o que cada um tem em curso.'
    },
    { id: 'transferencias', rotulo: 'Transferências entre obras', apoio: 'Consulta global e transferências aprovadas pelos responsáveis das obras, sem passar pelo DP.' },
    ...(usuarioDoDp ? [{
      id: 'eventos-recorrentes',
      rotulo: 'Eventos recorrentes',
      apoio: 'Acompanhe parcelas futuras, ajuste valores ainda não aplicados e encerre recorrências.'
    }] : []),
    {
      id: 'jornada',
      rotulo: 'Pagamento de Mão de Obra',
      apoio: 'A obra envia dias trabalhados, faltas e finais de semana/feriados; o DP confere e gera a apuração.'
    },
    ...(podeVerApuracao ? [{
      id: 'apuracao',
      rotulo: 'Apuração',
      apoio: 'Pré-folha por competência a partir das obras importadas, com ajustes auditados.'
    }] : []),
    ...(podeVerFechamentos ? [{
      id: 'fechamentos',
      rotulo: 'Fechamentos',
      apoio: 'Competências encerradas e títulos financeiros gerados a partir das apurações.'
    }] : [])
  ], [podeVerApuracao, podeVerFechamentos, usuarioDoDp]);
  const abasDisponiveis = useMemo(() => ABAS.map((aba) => aba.id), [ABAS]);
  const abaDaUrl = parametros.get('aba');
  const abaAtiva = abasDisponiveis.includes(abaDaUrl) ? abaDaUrl : 'solicitacoes';

  /*
    A régua de abas rola na horizontal no celular (índice.css). Sem trazer a
    ativa para dentro do campo de visão, quem chega por
    /rh-dp/apuracao (redirecionamento da D1) caía numa tela cuja aba ativa
    estava INTEIRAMENTE fora da tela em 390px — sem saber onde estava.
  */
  const refAbaAtiva = useRef(null);
  useEffect(() => {
    refAbaAtiva.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [abaAtiva]);
  const setAbaAtiva = useCallback((aba) => {
    setParametros((atuais) => {
      const proximos = new URLSearchParams(atuais);
      if (aba === 'solicitacoes') proximos.delete('aba');
      else proximos.set('aba', aba);
      return proximos;
    });
  }, [setParametros]);

  const abrirApuracaoDaJornada = useCallback((solicitacao) => {
    if (!podeVerApuracao) return;
    setParametros((atuais) => {
      const proximos = new URLSearchParams(atuais);
      proximos.set('aba', 'apuracao');
      proximos.delete('solicitacao');
      proximos.delete('jornada_secao');
      if (solicitacao?.dados_json?.competencia) {
        proximos.set('competencia', String(solicitacao.dados_json.competencia));
      }
      if (solicitacao?.obra_id) proximos.set('obra_id', String(solicitacao.obra_id));
      return proximos;
    });
  }, [podeVerApuracao, setParametros]);

  const abrirListaDeJornadas = useCallback(() => {
    setParametros((atuais) => {
      const proximos = new URLSearchParams(atuais);
      proximos.set('aba', 'jornada');
      proximos.set('jornada_secao', 'enviadas');
      proximos.delete('solicitacao');
      return proximos;
    });
  }, [setParametros]);

  // Normalização da URL: `?aba=` inválido (ou de uma aba que esta pessoa não
  // pode ver) é corrigido SEM empilhar histórico — senão "voltar" ficaria
  // preso repetindo a mesma correção.
  useEffect(() => {
    if (abaDaUrl && !abasDisponiveis.includes(abaDaUrl)) {
      setParametros((atuais) => {
        const proximos = new URLSearchParams(atuais);
        proximos.delete('aba');
        return proximos;
      }, { replace: true });
    }
  }, [abaDaUrl, abasDisponiveis, setParametros]);

  useEffect(() => {
    let ativo = true;
    const carregarAvisosTransferencia = async () => {
      try {
        const resposta = await getNotificacoes({
          nao_lidas: true,
          limit: 1,
          tipos: ['RH_TRANSFERENCIA_ATUALIZADA']
        });
        if (ativo) setTransferenciasNaoLidas(Number(resposta.total_nao_lidas || 0));
      } catch {
        // A central global continua sendo a fonte de verdade. Uma falha temporaria
        // neste contador nao deve impedir o restante da tela de Pessoal.
      }
    };
    carregarAvisosTransferencia();
    const timer = setInterval(carregarAvisosTransferencia, 30000);
    window.addEventListener('notificacoes:atualizar', carregarAvisosTransferencia);
    return () => {
      ativo = false;
      clearInterval(timer);
      window.removeEventListener('notificacoes:atualizar', carregarAvisosTransferencia);
    };
  }, [user?.id]);

  /**
   * R12: o recorte por obra e MARCACAO, nao lista suspensa.
   *
   * O servico aceita UM valor (`obra_id=1`), entao a dimensao e declarada
   * `unico: true` na BarraFiltros — marca redonda, marcar outra substitui.
   * Sem isso, marcar duas obras faria a tela mandar filtro NENHUM: duas
   * etiquetas visiveis e a lista sem estreitar. Daqui sai exatamente o mesmo
   * parametro de antes; conjunto vazio = todas as obras que a pessoa enxerga.
   */
  const [marcados, setMarcados] = useState({ obra_id: new Set() });
  const filtroObra = marcados.obra_id.size === 1
    ? marcados.obra_id.values().next().value
    : '';
  const [busca, setBusca] = useState('');

  const [formulario, setFormulario] = useState(null);
  const [conferencia, setConferencia] = useState(null);
  const [pedidosDoColaborador, setPedidosDoColaborador] = useState({ id: null, lista: [] });

  // A troca de usuario de teste preserva o componente montado. Sem limpar estas colecoes, a tela
  // podia exibir por alguns instantes colaboradores e obras do usuario anterior; ao agir sobre uma
  // dessas linhas, o backend aplicava o novo escopo e respondia "Acesso negado a este colaborador".
  useEffect(() => {
    setColaboradores([]);
    setObras([]);
    setObrasDestino([]);
    setStatusObrasDestino('ocioso');
    setMarcados({ obra_id: new Set() });
    setBusca('');
    setFormulario(null);
    setPedidosDoColaborador({ id: null, lista: [] });
    setTotalSolicitacoesAbertas(0);
    setTotalSolicitacoesNaoLidas(0);
  }, [user?.id]);

  const abrirDetalheDaSolicitacao = useCallback((solicitacaoId) => {
    setPedidosDoColaborador({ id: null, lista: [] });
    setParametros((atuais) => {
      const proximos = new URLSearchParams(atuais);
      proximos.delete('aba');
      proximos.set('solicitacao', String(solicitacaoId));
      return proximos;
    });
  }, [setParametros]);

  /**
   * `hasAnyExplicitPermissao`, e NAO `hasPermissao`.
   *
   * A diferenca decide se a tela mente. `hasPermissao` devolve `true` quando o usuario nao tem
   * configuracao nenhuma — uma compatibilidade que faz sentido para telas antigas, mas nao aqui: o
   * backend destas rotas usa `userHasStrictAreaPermission`, que NAO trata "nao configurado" como
   * liberado. Com o helper permissivo, a tela ofereceria "Aprovar" a quem o servidor vai recusar,
   * e a pessoa descobriria isso clicando.
   *
   * A permissao tambem se le de `areas_permissoes` (ARRAY), nao de um objeto indexado — a primeira
   * versao desta tela lia `permissoes_areas[chave]`, que e sempre `undefined` e teria escondido
   * todos os botoes de todo mundo, em silencio.
   */
  const podeAbrir = hasAnyExplicitPermissao(user, ['rh_dp.solicitacoes.abrir']);
  const podeDecidir = hasAnyExplicitPermissao(user, ['rh_dp.solicitacoes.decidir']);
  const podeAprovarSalario = hasAnyExplicitPermissao(user, ['rh_dp.salario.aprovar']);

  /**
   * `carregar` NAO limpa os avisos.
   *
   * Quem limpa e a acao, no comeco dela. Limpar aqui apagaria a confirmacao da
   * acao que acabou de dar certo — ela e escrita e logo em seguida a lista
   * recarrega — e a pessoa ficaria sem retorno nenhum (defeito visto na tela
   * irma). Pelo mesmo motivo as acoes daqui recarregam PRIMEIRO e so entao
   * confirmam.
   */
  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [lista, listaObras, solicitacoesAbertas] = await Promise.all([
        getRhColaboradores({ obra_id: filtroObra || undefined, q: busca || undefined }),
        obras.length
          ? Promise.resolve(obras)
          : (usuarioOperacionalDaObra ? getMinhasObras({ escopo: 'OBRAS' }) : getObras()),
        listarRhSolicitacoes({ situacao: 'ABERTA' })
      ]);
      setColaboradores(Array.isArray(lista) ? lista : []);
      setTotalSolicitacoesAbertas(Array.isArray(solicitacoesAbertas) ? solicitacoesAbertas.length : 0);
      if (!obras.length) setObras(Array.isArray(listaObras) ? listaObras : []);
    } catch (error) {
      avisar.erro(error.message || 'Nao foi possivel carregar a lista de pessoal.');
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroObra, busca, obras, empresas, usuarioOperacionalDaObra, user?.id]);

  /**
   * A marcacao aplica sozinha; a busca digitada espera 350ms para nao martelar
   * a API a cada tecla.
   *
   * Antes a busca so valia com Enter dentro do input ou com o clique em
   * "Atualizar" — a busca da BarraFiltros nao tem Enter, entao sem este atraso
   * o campo ficaria digitando para ninguem. "Atualizar" continua existindo,
   * agora no cabecalho, para quem quer forcar a releitura.
   */
  useEffect(() => {
    const atraso = setTimeout(() => { carregar(); }, 350);
    return () => clearTimeout(atraso);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroObra, busca]);

  const pendentes = useMemo(
    () => colaboradores.filter((c) => c.tem_solicitacao_aberta),
    [colaboradores]
  );

  const alertas = useMemo(() => {
    const contagem = {};
    pendentes.forEach((colaborador) => {
      (colaborador.solicitacoes_abertas || []).forEach((pedido) => {
        contagem[pedido.tipo] = (contagem[pedido.tipo] || 0) + 1;
      });
    });
    return contagem;
  }, [pendentes]);

  async function abrirPedido(evento) {
    evento.preventDefault();
    limpar();

    const f = formulario;
    const ehTransferencia = f.tipo === 'TROCA_OBRA'
      || (f.tipo === 'MOVIMENTACAO' && f.subtipo === 'TRANSFERENCIA_OBRA');
    if (ehTransferencia && !Number(f.obra_destino_id)) {
      avisar.erro('Selecione uma obra de destino na lista da pesquisa.');
      return;
    }
    if (f.tipo === 'ADMISSAO') {
      const cpfErro = getCpfCnpjError(f.cpf, { required: true, type: 'cpf' });
      if (cpfErro) {
        setRetorno({ tipo: 'erro', texto: cpfErro });
        return;
      }
      const pixErro = getPixDocumentError(f.pix_chave, f.pix_chave_tipo);
      if (pixErro) {
        setRetorno({ tipo: 'erro', texto: pixErro });
        return;
      }
    }
    if (f.tipo === 'EVENTO_RECORRENTE') {
      const erroParcelas = validarParcelasEvento(f);
      if (erroParcelas) {
        avisar.erro(erroParcelas);
        return;
      }
    }
    const dados = {};

    if (f.tipo === 'ADMISSAO') {
      Object.assign(dados, {
        nome: f.nome,
        cpf: f.cpf.replace(/\D/g, ''),
        obra_id: Number(f.obra_id) || undefined,
        empresa_grupo_id: Number(f.empresa_grupo_id) || undefined,
        cargo: f.cargo || undefined,
        cargo_id: Number(f.cargo_id) || undefined,
        carga_horaria_semanal: f.carga_horaria_semanal ? Number(f.carga_horaria_semanal) : undefined,
        // Os campos do item 8 viajam em bloco: escrever um por um aqui daria 17 linhas iguais e
        // uma chance de esquecer uma — que so apareceria como campo silenciosamente vazio na ficha.
        ...Object.fromEntries(
          ['telefone', 'email', 'nome_pai', 'nome_mae', 'endereco', 'numero', 'complemento',
            'bairro', 'municipio', 'estado', 'cep', 'banco', 'agencia', 'conta', 'conta_tipo',
            'pix_chave_tipo', 'pix_chave']
            .map((chave) => [chave, f[chave] || undefined])
            .filter(([, valor]) => valor !== undefined)
        ),
        tipo_vinculo: f.tipo_vinculo,
        data_admissao: f.data_admissao || undefined,
        salario_base: normalizeCurrencyTyping(f.salario_base) || undefined,
        forma_calculo_gerencial: f.forma_calculo_gerencial,
        valor_diaria: f.forma_calculo_gerencial === 'DIARIA'
          ? normalizeCurrencyTyping(f.valor_diaria) || undefined
          : undefined,
        pagamento_automatico_40_60: f.forma_calculo_gerencial === 'MENSAL'
          ? Boolean(f.pagamento_automatico_40_60)
          : false
      });
    }
    if (f.tipo === 'TROCA_OBRA') {
      Object.assign(dados, {
        obra_destino_id: Number(f.obra_destino_id) || undefined,
        data_vigencia: f.data_vigencia || undefined
      });
    }
    if (f.tipo === 'MOVIMENTACAO') {
      Object.assign(dados, {
        obra_id: Number(f.obra_id) || undefined,
        data_inicial: f.data_inicial || undefined,
        data_final: f.data_final || undefined,
        data_retorno: f.data_retorno || undefined,
        obra_destino_id: Number(f.obra_destino_id) || undefined,
        data_vigencia: f.data_vigencia || undefined,
        novo_cargo_id: f.subtipo === 'ALTERACAO_SALARIAL'
          ? (f.altera_funcao ? Number(f.novo_cargo_id) || undefined : undefined)
          : Number(f.novo_cargo_id) || undefined,
        novo_salario: normalizeCurrencyTyping(f.novo_salario) || undefined,
        motivo: f.motivo || undefined,
        altera_funcao: f.subtipo === 'ALTERACAO_SALARIAL' ? Boolean(f.altera_funcao) : undefined
      });
    }
    if (f.tipo === 'DEMISSAO') {
      Object.assign(dados, {
        tem_aviso_previo: f.tem_aviso_previo,
        tipo_aviso_previo: f.tem_aviso_previo ? f.tipo_aviso_previo : undefined,
        data_desligamento: f.data_desligamento || undefined,
        ultimo_dia_trabalhado: f.ultimo_dia_trabalhado || undefined,
        solicitado_por: f.solicitado_por || undefined,
        valor_acordado: normalizeCurrencyTyping(f.valor_acordado) || undefined,
        justificativa_acordo: f.justificativa_acordo || undefined
      });
    }
    if (f.tipo === 'EVENTO_RECORRENTE') {
      Object.assign(dados, {
        codigo: f.codigo,
        natureza: f.natureza,
        valor: parseCurrencyInput(f.valor),
        modo_valor: Number(f.parcelas_total) > 0 ? 'TOTAL' : 'PARCELA',
        competencia_inicio: f.competencia_inicio,
        parcelas_total: f.parcelas_total ? Number(f.parcelas_total) : null,
        parcelas_valores: valoresParcelasParaPayload(f),
        beneficiario_nome: f.codigo === 'PENSAO_ALIMENTICIA' ? f.beneficiario_nome : undefined,
        beneficiario_documento: f.codigo === 'PENSAO_ALIMENTICIA'
          ? f.beneficiario_documento.replace(/\D/g, '')
          : undefined,
        beneficiario_banco: f.codigo === 'PENSAO_ALIMENTICIA' ? f.beneficiario_banco : undefined,
        beneficiario_agencia: f.codigo === 'PENSAO_ALIMENTICIA' ? f.beneficiario_agencia : undefined,
        beneficiario_conta: f.codigo === 'PENSAO_ALIMENTICIA' ? f.beneficiario_conta : undefined,
        beneficiario_tipo_conta: f.codigo === 'PENSAO_ALIMENTICIA' ? f.beneficiario_tipo_conta : undefined,
        beneficiario_chave_pix: f.codigo === 'PENSAO_ALIMENTICIA' ? f.beneficiario_chave_pix : undefined
      });
    }
    if (f.tipo === 'ALTERACAO_SALARIAL') {
      Object.assign(dados, {
        novo_salario: normalizeCurrencyTyping(f.novo_salario),
        data_vigencia: f.data_vigencia || undefined,
        motivo: f.motivo
      });
    }

    try {
      const criada = await abrirRhSolicitacao({
        tipo: f.tipo,
        // Em MOVIMENTACAO e o evento; em DEMISSAO e o MOTIVO. E ele que decide o checklist.
        subtipo: f.subtipo || undefined,
        colaborador_id: f.colaborador_id || undefined,
        obra_id: Number(f.obra_id) || undefined,
        justificativa: f.justificativa || undefined,
        dados
      });

      /**
       * OS ARQUIVOS SOBEM DEPOIS, e nao junto: o anexo e uma linha com FK para a solicitacao, entao
       * ela precisa existir primeiro. E por isso que o pedido nasce RASCUNHO — o rascunho e o que
       * segura o trabalho entre "gravei o pedido" e "a papelada esta toda la".
       */
      const comArquivo = (f.anexos || []).filter((a) => a.arquivo);
      const falhas = comArquivo.length ? await subirAnexosDoModal(criada.id, comArquivo) : [];

      /**
       * A MENSAGEM DIZ O ESTADO REAL.
       *
       * Ela dizia "o Departamento Pessoal vai decidir" — e mentia desde que o rascunho passou a
       * existir: o DP nao ve rascunho. Quem lesse isso acharia que tinha terminado, e o pedido
       * ficaria parado sem ninguem saber.
       */
      const retorno = falhas.length
        // O rascunho FICA, com o que subiu. Apagar perderia os arquivos que deram certo e o
        // formulario inteiro que a pessoa preencheu.
        ? {
          tipo: 'erro',
          texto: `Rascunho #${criada.id} criado, mas ${falhas.length} arquivo(s) nao subiram: `
            + `${falhas.join(', ')}. Abra o rascunho e reenvie so esses.`
        }
        : {
          tipo: 'sucesso',
          texto: `Rascunho #${criada.id} criado${comArquivo.length ? ` com ${comArquivo.length} arquivo(s)` : ''}. `
            + 'Confira a documentacao e clique em Enviar para o Departamento Pessoal receber.'
        };

      setFormulario(null);
      // RECARREGA E SO ENTAO AVISA: escrever a faixa antes de `carregar()` a
      // deixava a merce do recarregamento — o retorno sumia antes de ser lido.
      await carregar();
      avisar[retorno.tipo](retorno.texto);
    } catch (error) {
      avisar.erro(error.message || 'Nao foi possivel abrir a solicitacao.');
    }
  }

  async function decidir(pedido, acao) {
    limpar();
    // A confirmacao so e escrita DEPOIS de a lista recarregar — ver o comentario
    // de `carregar`.
    let confirmacao = '';
    try {
      if (acao === 'aprovar') {
        /**
         * A CONFERENCIA DE DOCUMENTOS AVISA, NAO TRAVA.
         *
         * O ASO costuma sair depois do pedido; travar obrigaria a obra a ter tudo em maos no minuto
         * zero. Entao a tela CONFIRMA com quem decide, listando o que falta — a decisao continua
         * sendo dele, mas deixa de ser distraida.
         */
        const conferido = await conferirDocumentacaoRhSolicitacao(pedido.id);
        if (conferido?.exigeConferencia && conferido.faltando?.length) {
          const faltas = conferido.faltando.map((d) => d.nome).join(', ');
          const { ok } = await confirmar({
            titulo: 'Aprovar com documentacao pendente',
            mensagem: `Faltam documentos obrigatorios: ${faltas}. Aprovar mesmo assim?`,
            rotuloConfirmar: 'Aprovar mesmo assim'
          });
          if (!ok) return;
        }
        await aprovarRhSolicitacao(pedido.id);
        confirmacao = 'Solicitacao aprovada.';
      }

      if (acao === 'devolver') {
        // O motivo era um `window.prompt`: nao e `alert` nem `confirm`, mas e a
        // MESMA caixa do navegador. Agora e o campo obrigatorio da confirmacao,
        // num passo so — e o `return` do fluxo antigo (sem motivo, nao devolve)
        // continua valendo.
        const { ok, texto } = await confirmar({
          titulo: 'Devolver solicitacao',
          mensagem: 'Quem pediu precisa saber o que corrigir.',
          rotuloConfirmar: 'Devolver',
          destrutiva: true,
          campo: { rotulo: 'Por que esta sendo devolvida?', obrigatorio: true, multilinha: true }
        });
        if (!ok || !texto.trim()) return;
        await rejeitarRhSolicitacao(pedido.id, texto.trim());
        confirmacao = 'Solicitacao devolvida a quem abriu.';
      }

      if (acao === 'reenviar') {
        await reenviarRhSolicitacao(pedido.id, {});
        confirmacao = 'Solicitacao reenviada.';
      }

      if (acao === 'cancelar') {
        /**
         * AQUI O FLUXO ANTIGO ERA DEFEITUOSO, e o defeito nao sobrevive.
         *
         * O `window.prompt` de antes vinha com `|| ''` na frente, e por isso
         * cancelava a solicitacao TAMBEM quando a pessoa clicava em Cancelar na
         * caixa: o "sair sem fazer" do navegador virava "cancelar sem motivo".
         * Com a confirmacao do sistema, "Voltar" volta e "Cancelar solicitacao"
         * cancela — o motivo segue opcional.
         */
        const { ok, texto } = await confirmar({
          titulo: 'Cancelar solicitacao',
          mensagem: 'A solicitacao deixa de valer para quem abriu e para o Departamento Pessoal.',
          rotuloConfirmar: 'Cancelar solicitacao',
          rotuloCancelar: 'Voltar',
          destrutiva: true,
          campo: { rotulo: 'Motivo do cancelamento (opcional)', multilinha: true }
        });
        if (!ok) return;
        await cancelarRhSolicitacao(pedido.id, texto || '');
        confirmacao = 'Solicitacao cancelada.';
      }

      await carregar();
      setPedidosDoColaborador({ id: null, lista: [] });
      if (confirmacao) avisar.sucesso(confirmacao);
    } catch (error) {
      avisar.erro(error.message || 'Nao foi possivel concluir a acao.');
    }
  }

  async function verPedidos(colaborador) {
    try {
      const lista = await listarRhSolicitacoes({ colaborador_id: colaborador.id });
      setPedidosDoColaborador({ id: colaborador.id, lista: Array.isArray(lista) ? lista : [] });
    } catch (error) {
      avisar.erro(error.message || 'Nao foi possivel carregar as solicitacoes do colaborador.');
    }
  }

  /**
   * As empresas do grupo so sao buscadas quando o formulario de ADMISSAO abre.
   *
   * Buscar junto com a lista quebrava a tela para quem nao tem `rh_dp.empresas.gerenciar`: a
   * chamada respondia 403 e o erro subia como faixa vermelha no topo, dando a impressao de que a
   * pagina inteira falhou — quando na verdade so um campo de um formulario fechado nao carregou.
   *
   * A falha aqui tambem NAO vira erro de pagina: quem nao pode ver empresas simplesmente nao
   * consegue abrir admissao, e o formulario diz isso no lugar certo.
   */
  async function carregarEmpresasSePreciso() {
    if (empresas.length) return;
    try {
      const lista = await getRhEmpresasGrupo();
      setEmpresas(Array.isArray(lista) ? lista : []);
    } catch (error) {
      setEmpresas([]);
    }
  }

  /**
   * Catalogo exclusivo da Obra de destino.
   *
   * `obras` continua sendo a lista vinculada ao usuario de OBRA. Reaproveita-la aqui impediria a
   * transferencia para uma obra diferente justamente porque ela ainda nao esta no escopo atual do
   * usuario. A consulta geral fica restrita a este campo e o navegador descarta centros de custo e
   * registros inativos antes de montar as opcoes.
   */
  async function carregarObrasDestinoSePreciso() {
    if (['carregando', 'pronto'].includes(statusObrasDestino)) return;

    setStatusObrasDestino('carregando');
    try {
      const lista = await getObras({ escopo: 'OBRAS' });
      const ativas = (Array.isArray(lista) ? lista : []).filter((obra) => {
        const ativo = ![false, 0, '0', 'false'].includes(obra?.ativo);
        const tipo = String(obra?.tipo_centro_custo || 'OBRA').trim().toUpperCase();
        return ativo && tipo === 'OBRA';
      });
      setObrasDestino(ativas);
      setStatusObrasDestino('pronto');
    } catch (error) {
      setObrasDestino([]);
      setStatusObrasDestino('erro');
    }
  }

  /**
   * O QUE CADA MODAL PRECISA SABER, buscado SO quando ele abre.
   *
   * Cargos so importam na movimentacao (alteracao de cargo); apontamentos, so na demissao. Buscar
   * os dois junto da lista principal faria toda abertura da tela pagar por consultas que a maioria
   * dos acessos nao usa — foi exatamente o erro que o carregamento das empresas teve, e que
   * quebrava a pagina inteira com um 403 de um campo de formulario fechado.
   *
   * Falha aqui NAO impede abrir o pedido: sem cargos o campo fica vazio e o usuario percebe na
   * hora; sem apontamentos o alerta some, e o alerta sempre foi aviso, nunca trava.
   */
  function carregarApoioDoModal(tipo, colaborador) {
    if (['MOVIMENTACAO', 'ADMISSAO'].includes(tipo) && !cargos.length) {
      getRhCargos().then((r) => setCargos(r.itens || [])).catch(() => setCargos([]));
    }
    if (tipo === 'DEMISSAO' && colaborador?.id) {
      getRhApontamentos(colaborador.id)
        .then((r) => setFormulario((atual) => (atual ? { ...atual, apontamentos: r.alertas || [] } : atual)))
        .catch(() => {});
    }
  }

  /**
   * A lista de tipos de documento daquele tipo/subtipo de pedido.
   *
   * Recarregada quando o SUBTIPO muda, porque o checklist do atestado nao e o das ferias. Falhar
   * aqui deixa o campo de tipo vazio — o usuario ve e sabe que nao da para anexar ainda; nao vira
   * erro de pagina.
   */
  async function carregarChecklist(tipo, subtipo) {
    if (!tipo) return setChecklistDoTipo([]);
    try {
      const r = await getRhChecklistDoTipo(tipo, subtipo);
      setChecklistDoTipo(Array.isArray(r?.itens) ? r.itens : []);
    } catch (error) {
      setChecklistDoTipo([]);
    }
  }

  /** Uma linha de anexo por arquivo: cada uma leva o SEU tipo. */
  function acrescentarLinhaDeAnexo() {
    setFormulario((atual) => (atual
      ? { ...atual, anexos: [...(atual.anexos || []), { documento_tipo_id: '', arquivo: null }] }
      : atual));
  }

  function alterarLinhaDeAnexo(indice, campo, valor) {
    setFormulario((atual) => {
      if (!atual) return atual;
      const anexos = [...(atual.anexos || [])];
      anexos[indice] = { ...anexos[indice], [campo]: valor };
      return { ...atual, anexos };
    });
  }

  function removerLinhaDeAnexo(indice) {
    setFormulario((atual) => (atual
      ? { ...atual, anexos: (atual.anexos || []).filter((_, i) => i !== indice) }
      : atual));
  }

  /**
   * Sobe os arquivos do modal, UM DE CADA VEZ.
   *
   * Sequencial e nao paralelo de proposito: a rota aceita um arquivo por chamada, o multer grava em
   * disco e o S3 recebe um por vez. Disparar cinco juntos multiplicaria a chance de parar no meio.
   *
   * Devolve os que FALHARAM, com nome — quem chama precisa poder dizer exatamente o que reenviar.
   */
  async function subirAnexosDoModal(solicitacaoId, anexos) {
    const falhas = [];
    for (const linha of anexos) {
      if (!linha?.arquivo) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        await anexarNaRhSolicitacao(
          solicitacaoId,
          { documento_tipo_id: linha.documento_tipo_id ? Number(linha.documento_tipo_id) : undefined },
          linha.arquivo
        );
      } catch (error) {
        falhas.push(linha.arquivo.name || 'arquivo sem nome');
      }
    }
    return falhas;
  }

  function novoPedido(tipo, colaborador = null) {
    setConferencia(null);
    if (tipo === 'ADMISSAO') carregarEmpresasSePreciso();
    if (tipo === 'TROCA_OBRA') carregarObrasDestinoSePreciso();
    carregarApoioDoModal(tipo, colaborador);
    carregarChecklist(tipo, null);
    setFormulario({
      ...formularioVazio(tipo),
      colaborador_id: colaborador?.id || '',
      obra_id: colaborador?.obra_id || filtroObra || '',
      // O modal fala a mesma lingua do icone: "Vincular" para quem nunca teve obra, "Trocar" para
      // quem tem. Sem isto o usuario clica em "Vincular a uma obra" e abre "Troca de obra".
      // Continua valendo, agora dentro de MOVIMENTACAO: quem nunca teve obra ve "Vincular".
      primeiraLotacao: !colaborador?.obra_id,
      obra_id_colaborador: colaborador?.obra_id || null,
      nomeDoColaborador: colaborador?.nome || '',
      /**
       * ADMISSAO PROGRAMADA: a vigencia sugerida e a data de ADMISSAO, nao hoje.
       *
       * 19 dos 137 colaboradores tem admissao marcada para o futuro. Sugerir hoje para eles diria
       * que estao na obra desde hoje — quando nem foram admitidos ainda. O backend corrige isso
       * sozinho (preenche a obra no vinculo existente, mantendo a vigencia), mas o campo mostrar a
       * data certa evita a pessoa achar que errou.
       */
      data_vigencia: tipo === 'MOVIMENTACAO' ? sugestaoDeVigencia(colaborador) : '',
      admissaoFutura: tipo === 'MOVIMENTACAO' && ehFutura(colaborador?.data_admissao)
    });
  }

  /**
   * R16: UM dono para a faixa de avisos, e ela precisa estar ONDE o olho esta.
   *
   * Com um modal aberto, a faixa no topo da pagina fica atras do fundo escuro —
   * e justamente quando a acao FALHA o modal continua aberto (aprovar, devolver,
   * salvar rascunho). O erro existia e ninguem lia. Entao: modal aberto, a faixa
   * vive dentro dele; modal fechado, logo abaixo do PageHeader.
   */
  const faixaAvisos = <Avisos avisos={avisos} aoFechar={fechar} />;
  const algumModalAberto = Boolean(formulario || pedidosDoColaborador.id);

  /**
   * AS ACOES DO CABECALHO SAO AS DA ABA QUE ESTA ABERTA.
   *
   * As tres nasceram na barra da aba Colaboradores e continuam valendo so nela:
   * "Pedir admissao" abre um pedido a partir daquela lista, "Enviar jornada"
   * leva para a aba de jornada e "Atualizar" recarrega aquela lista. Jornada e
   * Apuracao trazem as suas proprias. O que muda e o lugar: na faixa fixa do
   * PageHeader elas continuam a um clique com as 137 linhas ja roladas.
   *
   * D6/R11: "Voltar ao RH/DP" e "Cadastro completo" sairam — sao navegacao, e
   * disso cuidam o breadcrumb e o menu (Colaboradores esta la).
   */
  /*
    C2 — a contagem é da ABA, não da tela. Um número único no cabeçalho de
    uma tela com quatro abas estaria errado em três delas. Jornada e
    Apuração montam a própria lista e não têm contagem a oferecer daqui:
    ali o cabeçalho fica sem número, que é honesto.
  */
  const contagemDaAba = abaAtiva === 'solicitacoes'
    ? `${totalSolicitacoesAbertas} em aberto`
    : abaAtiva === 'colaboradores'
      ? `${colaboradores.length} colaborador${colaboradores.length === 1 ? '' : 'es'}`
      : undefined;

  const acoesDaAba = abaAtiva === 'colaboradores'
    ? [
      podeAbrir ? { rotulo: 'Enviar jornada', onClick: () => setAbaAtiva('jornada') } : null,
      {
        rotulo: carregando ? 'Carregando...' : 'Atualizar',
        onClick: carregar,
        desabilitada: carregando
      }
    ].filter(Boolean)
    : [];

  return (
    <Pagina className="rhdp-page rh-pessoal-page">
      <PageHeader
        titulo="Pessoal"
        contagem={contagemDaAba}
        descricao={ABAS.find((aba) => aba.id === abaAtiva)?.apoio}
        acaoPrincipal={abaAtiva === 'colaboradores' && podeAbrir
          ? { rotulo: 'Pedir admissao', onClick: () => novoPedido('ADMISSAO') }
          : undefined}
        secundarias={acoesDaAba}
      />

      {!algumModalAberto && faixaAvisos}

      {/*
        As abas (quatro desde a D1), dirigidas por dados e não escritas
        quatro vezes: assim o rótulo, o apoio do cabeçalho e a contagem
        saem sempre da mesma fonte. Escritas à mão, três nasceram sem
        acento e uma com ("Solicitacoes" ao lado de "Apuração").

        Jornada e Apuração entram como abas, e não como páginas separadas,
        porque são o MESMO trabalho em sequência: a obra pede e informa a
        jornada; o DP decide e apura. Obrigar a trocar de página no meio
        disso é o que fazia a pessoa perder o fio. As rotas antigas
        REDIRECIONAM para cá com ?aba=... (App.jsx), então favorito e link
        salvo continuam chegando; e os dois componentes deixaram de ter
        cabeçalho próprio — quem é dono do título e da faixa fixa é esta
        página.
      */}
      <div className="rh-pessoal-abas" role="tablist" aria-label="Áreas do Pessoal">
        {ABAS.map((aba) => (
          <button
            key={aba.id}
            type="button"
            role="tab"
            aria-selected={abaAtiva === aba.id}
            ref={abaAtiva === aba.id ? refAbaAtiva : undefined}
            className={`rh-pessoal-aba${abaAtiva === aba.id ? ' rh-pessoal-aba--ativa' : ''}`}
            onClick={() => setAbaAtiva(aba.id)}
          >
            {aba.rotulo}
            {aba.id === 'solicitacoes' && totalSolicitacoesNaoLidas > 0
              ? (
                <span
                  className="rh-pessoal-aba-contador"
                  title={`${totalSolicitacoesNaoLidas} solicitação(ões) ainda não visualizada(s)`}
                >
                  {totalSolicitacoesNaoLidas > 99 ? '99+' : totalSolicitacoesNaoLidas}
                </span>
              )
              : null}
            {aba.id === 'transferencias' && transferenciasNaoLidas > 0
              ? <span className="rh-pessoal-aba-contador">{transferenciasNaoLidas > 99 ? '99+' : transferenciasNaoLidas}</span>
              : null}
          </button>
        ))}
      </div>

      {abaAtiva === 'solicitacoes' ? (
        <RhDpPessoalSolicitacoes
          podeAbrir={podeAbrir}
          podeDecidir={podeDecidir}
          podeAprovarSalario={podeAprovarSalario}
          aoMudar={carregar}
          onAbrirListaJornadas={abrirListaDeJornadas}
          aoContarAbertas={setTotalSolicitacoesAbertas}
          aoContarNaoLidas={setTotalSolicitacoesNaoLidas}
          aoMarcarVisualizada={marcarSolicitacaoVisualizada}
        />
      ) : null}

      {abaAtiva === 'colaboradores' ? (
        <>
      {/*
        OS AVISOS VISUAIS QUE O CLIENTE PEDIU CONTINUAM AQUI — o que exige acao,
        contado por tipo. O que mudou e o dono do desenho: `rh-pessoal-alerta`
        era um quarto dialeto de "dado unico", com medida (1.6rem) e azul
        escritos a mao no CSS; agora e o ladrilho do padrao (R16), em tokens.
        O tom `warning` so aparece quando ha o que resolver, e e o MESMO tom que
        destaca a linha do colaborador com pedido em aberto na tabela.
      */}
      <StatGrid colunas={4}>
        <StatTile
          label={pendentes.length === 1
            ? 'Colaborador com solicitacao aberta'
            : 'Colaboradores com solicitacao aberta'}
          valor={pendentes.length}
          tom={pendentes.length ? 'warning' : undefined}
        />
        {Object.entries(alertas).map(([tipo, quantidade]) => (
          <StatTile key={tipo} label={ROTULO_TIPO[tipo] || tipo} valor={quantidade} tom="warning" />
        ))}
      </StatGrid>

      {/*
        R12: busca larga em cima e o recorte por obra em MARCACAO, com etiqueta
        removivel — o que esta filtrado se le sem abrir nada. Sem marca, a lista
        traz todas as obras que a pessoa enxerga, que era o que a opcao vazia do
        select dizia. Atualizar/Pedir admissao/Enviar jornada nao sao filtro:
        foram para o cabecalho.
      */}
      <BarraFiltros
        busca={{ valor: busca, aoMudar: setBusca, placeholder: 'Nome, CPF ou matricula' }}
        filtros={[
          {
            id: 'obra_id',
            rotulo: 'Obra',
            // O servico aceita UMA obra: marcar outra substitui (marca redonda).
            unico: true,
            opcoes: obras.map((obra) => ({ valor: String(obra.id), rotulo: obra.nome }))
          }
        ]}
        ativos={marcados}
        aoAlternar={(dimensao, valor, opcoes) => setMarcados(
          (atual) => alternarValorFiltro(atual, dimensao, valor, opcoes)
        )}
        aoLimpar={() => { setMarcados({ obra_id: new Set() }); setBusca(''); }}
      />

      <div className="card sol-surface-card">
        <TabelaPadrao
          colunas={[
            {
              id: 'colaborador',
              titulo: 'Colaborador',
              // R17: o NOME do colaborador é o que identifica a linha.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (colaborador) => (
                <CelulaDupla principal={colaborador.nome} sub={colaborador.cargo || '—'} />
              )
            },
            {
              id: 'obra',
              titulo: 'Obra',
              tipo: 'texto',
              render: (colaborador) => colaborador.obra?.nome || '—'
            },
            {
              id: 'vinculo',
              titulo: 'Vínculo',
              tipo: 'badge',
              render: (colaborador) => colaborador.tipo_vinculo
            },
            {
              id: 'salario',
              titulo: 'Salario',
              tipo: 'valor',
              render: (colaborador) => (colaborador.salario_base
                ? formatCurrencyInput(String(colaborador.salario_base))
                : '—')
            },
            {
              id: 'situacao',
              titulo: 'Situacao',
              tipo: 'status',
              render: (colaborador) => (
                <span className={colaborador.status === 'ATIVO' ? 'rh-chip' : 'rh-chip rh-chip--saindo'}>
                  {colaborador.status}
                </span>
              )
            },
            {
              id: 'solicitacao',
              titulo: 'Solicitacao em curso',
              tipo: 'texto',
              render: (colaborador) => ((colaborador.solicitacoes_abertas || []).length === 0 ? (
                <span className="opacity-60">—</span>
              ) : (
                colaborador.solicitacoes_abertas.map((pedido) => (
                  <span key={pedido.id} className={chipDoTipo(pedido.tipo)}>
                    {/* Mesma logica do icone: sem obra e "vincular", nao "trocar". */}
                    {(pedido.tipo === 'TROCA_OBRA' || pedido.subtipo === 'TRANSFERENCIA_OBRA') && !colaborador.obra_id
                      ? 'Vincular a obra'
                      : ROTULO_TIPO[pedido.tipo] || pedido.tipo}
                  </span>
                ))
              ))
            }
          ]}
          itens={colaboradores}
          storageKey="tabela:rh-dp-pessoal:colaboradores"
          rotuloRolagem="Colaboradores da obra"
          carregando={carregando}
          vazio="Nenhum colaborador nesta obra."
          /* O destaque visual que o cliente pediu — a linha inteira, nao so um icone. */
          urgencia={(colaborador) => (colaborador.tem_solicitacao_aberta ? 'warning' : null)}
          acoesLinha={(colaborador) => (
            <div className="rh-acoes-icones">
              <button
                type="button"
                className="rh-acao-icone"
                title="Acompanhar solicitacoes deste colaborador"
                aria-label={`Acompanhar solicitacoes de ${colaborador.nome}`}
                onClick={() => verPedidos(colaborador)}
              >
                <HiOutlineEye aria-hidden="true" />
              </button>
              {podeAbrir ? ACOES_DA_LINHA.map(({ tipo, rotulo, Icone }) => (
                <button
                  key={tipo}
                  type="button"
                  className="rh-acao-icone"
                  title={rotulo}
                  aria-label={`${rotulo}: ${colaborador.nome}`}
                  onClick={() => novoPedido(tipo, colaborador)}
                >
                  <Icone aria-hidden="true" />
                </button>
              )) : null}
            </div>
          )}
          larguraAcoes={215}
        />
      </div>

        </>
      ) : null}

      {/*
        MODAL, e nao card no fim da pagina.
        O card abria ABAIXO da tabela de 137 linhas. Quem clicava nao via nada acontecer e concluia
        que o sistema tinha ignorado o clique — a acao so aparecia depois de rolar a tela inteira.
        O modal aparece onde o olho ja esta.
      */}
      {/*
        Montadas so quando a aba esta ativa: cada uma carrega obras, empresas e a propria lista, e
        deixa-las montadas em segundo plano faria tres telas buscarem dados a cada visita.
      */}
      {abaAtiva === 'transferencias' ? <RhDpTransferencias
        onNotificacoesLidas={limparNotificacoesTransferencia}
      /> : null}
      {abaAtiva === 'eventos-recorrentes' && usuarioDoDp ? (
        <RhDpEventosRecorrentes podeDecidir={podeDecidir} />
      ) : null}
      {abaAtiva === 'jornada' ? (
        <RhDpJornada onAbrirApuracao={podeVerApuracao ? abrirApuracaoDaJornada : undefined} />
      ) : null}
      {abaAtiva === 'apuracao' && podeVerApuracao ? <RhDpApuracao /> : null}
      {abaAtiva === 'fechamentos' && podeVerFechamentos ? <RhDpFechamentos comoAba /> : null}

      {pedidosDoColaborador.id ? (
        <OverlayModal
          rotulo="Solicitacoes do colaborador"
          largura="820px"
          onFechar={() => setPedidosDoColaborador({ id: null, lista: [] })}
        >
          <div className="rh-modal-conteudo space-y-3">
            {!formulario && faixaAvisos}
            <div className="app-page-header-row">
              <h2 className="text-lg font-semibold">Solicitacoes do colaborador</h2>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setPedidosDoColaborador({ id: null, lista: [] })}>
                Fechar
              </button>
            </div>

          {pedidosDoColaborador.lista.length === 0 ? (
            <p className="opacity-70">Nenhuma solicitacao para este colaborador.</p>
          ) : (
            <ul className="rh-pessoal-pedidos">
              {pedidosDoColaborador.lista.map((pedido) => (
                <li key={pedido.id} className="rh-pessoal-pedido">
                  <div>
                    <span className={chipDoTipo(pedido.tipo)}>{ROTULO_TIPO[pedido.tipo] || pedido.tipo}</span>
                    <strong className="ml-2">{pedido.situacao}</strong>
                    {pedido.motivo_rejeicao ? (
                      <div className="text-sm rh-pessoal-devolucao">
                        Devolvida: {pedido.motivo_rejeicao}
                      </div>
                    ) : null}
                  </div>
                  <div className="app-page-actions">
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => abrirDetalheDaSolicitacao(pedido.id)}
                    >
                      Abrir detalhes
                    </button>
                    {podeDecidir && pedido.situacao === 'ABERTA' ? (
                      <>
                        {/*
                          Alteracao salarial so aparece para quem tem a permissao de Diretoria. O
                          backend recusa de qualquer forma; esconder o botao evita oferecer uma acao
                          que vai falhar — mas a tranca de verdade continua sendo a do servidor.
                        */}
                        {pedido.tipo !== 'ALTERACAO_SALARIAL' || podeAprovarSalario ? (
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => decidir(pedido, 'aprovar')}>
                      {pedido.subtipo === 'RETORNO_AFASTAMENTO' ? 'Registrar ciencia' : 'Aprovar'}
                          </button>
                        ) : (
                          <span className="text-sm opacity-70">Aguardando a Diretoria</span>
                        )}
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => decidir(pedido, 'devolver')}>
                          Devolver
                        </button>
                      </>
                    ) : null}

                    {podeAbrir && pedido.situacao === 'REJEITADA' ? (
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => decidir(pedido, 'reenviar')}>
                        Reenviar
                      </button>
                    ) : null}

                    {podeAbrir && pedido.situacao === 'ABERTA' ? (
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => decidir(pedido, 'cancelar')}>
                        Cancelar
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            )}
          </div>
        </OverlayModal>
      ) : null}

      {formulario ? (
        <OverlayModal
          rotulo={tituloDoFormulario(formulario)}
          largura="880px"
          onFechar={() => setFormulario(null)}
        >
          <div className="rh-modal-conteudo space-y-3">
            {faixaAvisos}
            <div className="app-page-header-row">
              <div>
                <h2 className="text-lg font-semibold">{tituloDoFormulario(formulario)}</h2>
                {/* R5: o apoio fica ancorado ao titulo do bloco — aqui, o do modal.
                    `page-subtitle` e do cabecalho de PAGINA, que nao existe dentro
                    de um modal. */}
                {formulario.nomeDoColaborador ? (
                  <p className="app-bloco-lead" title={formulario.nomeDoColaborador}>{formulario.nomeDoColaborador}</p>
                ) : null}
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setFormulario(null)}>
                Fechar
              </button>
            </div>

          <form onSubmit={abrirPedido} className="space-y-3">
            {/* Os campos do item 8 vao em grades separadas — identificacao, contato, filiacao,
                endereco e banco. Vinte e dois campos numa grade unica viram um paredao, e nele
                ninguem enxerga o que ainda falta preencher. */}
            {formulario.tipo === 'ADMISSAO' ? (
              <div className="space-y-3">
              <div className="rh-colaboradores-filter-grid">
                <label className="form-field">
                  <span className="form-label form-label--required">Nome completo</span>
                  <input className="form-control" value={formulario.nome}
                    onChange={(e) => setFormulario({ ...formulario, nome: e.target.value })} required />
                </label>

                <label className="form-field">
                  <span className="form-label form-label--required">CPF</span>
                  <input className="form-control" value={formulario.cpf} inputMode="numeric"
                    onChange={(e) => setFormulario({ ...formulario, cpf: maskCpfCnpj(e.target.value) })} required />
                </label>

                <label className="form-field">
                  <span className="form-label form-label--required">Empresa do grupo</span>
                  <select className="form-control" value={formulario.empresa_grupo_id}
                    onChange={(e) => setFormulario({ ...formulario, empresa_grupo_id: e.target.value })} required>
                    {/*
                      Aqui a primeira opcao NAO e o rotulo: quando nao ha empresas, ela avisa que o
                      problema e de PERMISSAO, e nao que a lista esta vazia. Trocar por "Selecione"
                      apagaria essa informacao.
                    */}
                    <option value="">
                      {empresas.length ? 'Selecione' : 'Sem acesso as empresas do grupo'}
                    </option>
                    {empresas.map((empresa) => (
                      <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>
                    ))}
                  </select>
                </label>

                <label className="form-field">
                  <span className="form-label form-label--required">Obra</span>
                  <select className="form-control" value={formulario.obra_id}
                    onChange={(e) => setFormulario({ ...formulario, obra_id: e.target.value })} required>
                    <option value="">Selecione</option>
                    {obras.map((obra) => <option key={obra.id} value={obra.id}>{obra.nome}</option>)}
                  </select>
                </label>

                {/*
                  O CARGO VEM DO CATALOGO (Fase 7), e nao mais de texto livre.
                  O escopo pede "Cargo (lista do banco de dados)". Enquanto os cargos nao carregam,
                  o campo de texto continua valendo — melhor um cargo digitado do que nenhum.
                */}
                <label className="form-field">
                  <span className="form-label">Cargo</span>
                  {cargos.length ? (
                    <select className="form-control" value={formulario.cargo_id || ''}
                      onChange={(e) => setFormulario({ ...formulario, cargo_id: e.target.value })}>
                      <option value="">Selecione</option>
                      {cargos.map((cargo) => <option key={cargo.id} value={cargo.id}>{cargo.nome}</option>)}
                    </select>
                  ) : (
                    <input className="form-control" value={formulario.cargo}
                      onChange={(e) => setFormulario({ ...formulario, cargo: e.target.value })} />
                  )}
                </label>

                <label className="form-field">
                  <span className="form-label form-label--required">Tipo de contratacao</span>
                  <select className="form-control" value={formulario.tipo_vinculo}
                    onChange={(e) => setFormulario({ ...formulario, tipo_vinculo: e.target.value })}>
                    {/* Os cinco do item 8 do escopo. `NAO_CLT` fica por ultimo: e o valor gravado
                        nos registros antigos, e some-lo da lista faria eles perderem o rotulo. */}
                    <option value="CLT">CLT</option>
                    <option value="EXPERIENCIA">Experiencia</option>
                    <option value="PRAZO_DETERMINADO">Prazo determinado</option>
                    <option value="APRENDIZ">Aprendiz</option>
                    <option value="ESTAGIARIO">Estagiario</option>
                    <option value="NAO_CLT">Nao CLT</option>
                  </select>
                </label>

                <label className="form-field">
                  <span className="form-label">Carga horaria semanal</span>
                  <input className="form-control" type="number" min="0" step="0.5"
                    value={formulario.carga_horaria_semanal || ''}
                    onChange={(e) => setFormulario({ ...formulario, carga_horaria_semanal: e.target.value })} />
                </label>

                <label className="form-field">
                  <span className="form-label form-label--required">Data de admissao</span>
                  <DateInputBR className="form-control" value={formulario.data_admissao}
                    onChange={(e) => setFormulario({ ...formulario, data_admissao: e.target.value })} required />
                </label>

                <label className="form-field">
                  <span className="form-label">Salario</span>
                  <input className="form-control" inputMode="decimal" value={formulario.salario_base}
                    onChange={(e) => setFormulario({ ...formulario, salario_base: normalizeCurrencyTyping(e.target.value) })}
                    onBlur={(e) => setFormulario({ ...formulario, salario_base: formatCurrencyInput(e.target.value) })} />
                </label>

                <label className="form-field">
                  <span className="form-label form-label--required">Forma de calculo gerencial</span>
                  <select className="form-control" value={formulario.forma_calculo_gerencial}
                    onChange={(e) => setFormulario({
                      ...formulario,
                      forma_calculo_gerencial: e.target.value,
                      pagamento_automatico_40_60: e.target.value === 'DIARIA'
                        ? false
                        : formulario.pagamento_automatico_40_60
                    })}>
                    <option value="MENSAL">Mensal</option>
                    <option value="DIARIA">Por diaria</option>
                  </select>
                </label>

                {formulario.forma_calculo_gerencial === 'DIARIA' ? (
                  <label className="form-field">
                    <span className="form-label form-label--required">Valor da diaria</span>
                    <input className="form-control" inputMode="decimal" required value={formulario.valor_diaria}
                      onChange={(e) => setFormulario({ ...formulario, valor_diaria: normalizeCurrencyTyping(e.target.value) })}
                      onBlur={(e) => setFormulario({ ...formulario, valor_diaria: formatCurrencyInput(e.target.value) })} />
                  </label>
                ) : (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={formulario.pagamento_automatico_40_60}
                      onChange={(e) => setFormulario({ ...formulario, pagamento_automatico_40_60: e.target.checked })} />
                    Gerar automaticamente 40% no dia 15 e 60% no fim do mes
                  </label>
                )}
              </div>
              <div className="rh-colaboradores-filter-grid">
                <label className="form-field">
                  <span className="form-label form-label--required">Telefone</span>
                  <input className="form-control" type="tel" value={formulario.telefone || ''}
                    onChange={(e) => setFormulario({ ...formulario, telefone: e.target.value })} required />
                </label>

                <label className="form-field">
                  <span className="form-label form-label--required">E-mail</span>
                  <input className="form-control" type="email" value={formulario.email || ''}
                    onChange={(e) => setFormulario({ ...formulario, email: e.target.value })} required />
                </label>

              </div>

              {/* O escopo pede "nome dos pais". Dois campos, e nao um: a certidao de
                  nascimento e o eSocial tratam pai e mae separadamente. */}
              <div className="rh-colaboradores-filter-grid">
                <label className="form-field">
                  <span className="form-label">Nome do pai</span>
                  <input className="form-control" value={formulario.nome_pai || ''}
                    onChange={(e) => setFormulario({ ...formulario, nome_pai: e.target.value })} />
                </label>

                <label className="form-field">
                  <span className="form-label form-label--required">Nome da mae</span>
                  <input className="form-control" value={formulario.nome_mae || ''}
                    onChange={(e) => setFormulario({ ...formulario, nome_mae: e.target.value })} required />
                </label>

              </div>

              <div className="rh-colaboradores-filter-grid">
                <label className="form-field">
                  <span className="form-label form-label--required">Endereco</span>
                  <input className="form-control" value={formulario.endereco || ''}
                    onChange={(e) => setFormulario({ ...formulario, endereco: e.target.value })} required />
                </label>

                <label className="form-field">
                  <span className="form-label">Numero</span>
                  <input className="form-control" value={formulario.numero || ''}
                    onChange={(e) => setFormulario({ ...formulario, numero: e.target.value })} />
                </label>

                <label className="form-field">
                  <span className="form-label">Complemento</span>
                  <input className="form-control" value={formulario.complemento || ''}
                    onChange={(e) => setFormulario({ ...formulario, complemento: e.target.value })} />
                </label>

                <label className="form-field">
                  <span className="form-label">Bairro</span>
                  <input className="form-control" value={formulario.bairro || ''}
                    onChange={(e) => setFormulario({ ...formulario, bairro: e.target.value })} />
                </label>

                <label className="form-field">
                  <span className="form-label form-label--required">Municipio</span>
                  <input className="form-control" value={formulario.municipio || ''}
                    onChange={(e) => setFormulario({ ...formulario, municipio: e.target.value })} required />
                </label>

                <label className="form-field">
                  <span className="form-label">UF</span>
                  <input className="form-control" maxLength={2} value={formulario.estado || ''}
                    onChange={(e) => setFormulario({ ...formulario, estado: e.target.value.toUpperCase() })} />
                </label>

                <label className="form-field">
                  <span className="form-label">CEP</span>
                  <input className="form-control" value={formulario.cep || ''}
                    onChange={(e) => setFormulario({ ...formulario, cep: e.target.value })} />
                </label>

              </div>

              {/* Dados bancarios E chave PIX: o escopo pede os dois, e eles nao sao
                  alternativos — a conta recebe a folha, o PIX resolve pagamento avulso. */}
              <div className="rh-colaboradores-filter-grid">
                <label className="form-field">
                  <span className="form-label">Banco</span>
                  <input className="form-control" value={formulario.banco || ''}
                    onChange={(e) => setFormulario({ ...formulario, banco: e.target.value })} />
                </label>

                <label className="form-field">
                  <span className="form-label">Agencia</span>
                  <input className="form-control" value={formulario.agencia || ''}
                    onChange={(e) => setFormulario({ ...formulario, agencia: e.target.value })} />
                </label>

                <label className="form-field">
                  <span className="form-label">Conta</span>
                  <input className="form-control" value={formulario.conta || ''}
                    onChange={(e) => setFormulario({ ...formulario, conta: e.target.value })} />
                </label>

                <label className="form-field">
                  <span className="form-label">Tipo de conta</span>
                  <select className="form-control" value={formulario.conta_tipo || ''}
                    onChange={(e) => setFormulario({ ...formulario, conta_tipo: e.target.value })}>
                    <option value="">Selecione</option>
                    <option value="CORRENTE">Corrente</option>
                    <option value="POUPANCA">Poupanca</option>
                    <option value="SALARIO">Salario</option>
                  </select>
                </label>

                <label className="form-field">
                  <span className="form-label">Tipo da chave PIX</span>
                  <select className="form-control" value={formulario.pix_chave_tipo || ''}
                    onChange={(e) => setFormulario({ ...formulario, pix_chave_tipo: e.target.value })}>
                    <option value="">Selecione</option>
                    <option value="CPF">CPF</option>
                    <option value="EMAIL">E-mail</option>
                    <option value="TELEFONE">Telefone</option>
                    <option value="ALEATORIA">Aleatoria</option>
                  </select>
                </label>

                <label className="form-field">
                  <span className="form-label">Chave PIX</span>
                  <input className="form-control" value={formulario.pix_chave || ''}
                    onChange={(e) => setFormulario({ ...formulario, pix_chave: e.target.value })} />
                </label>
              </div>
            </div>
            ) : null}

            {/*
              MOVIMENTACOES (item 9 do escopo). O subtipo vem PRIMEIRO porque e ele que decide quais
              campos existem — e tambem qual checklist o pedido vai cobrar. Escolher depois faria o
              usuario preencher campos que a proxima escolha apagaria.
            */}
            {formulario.tipo === 'MOVIMENTACAO' ? (
              <div className="space-y-3">
                <label className="form-field">
                <span className="form-label form-label--required">Tipo da movimentacao</span>
                <select className="form-control" value={formulario.subtipo || ''} required
                  onChange={(e) => {
                    const subtipo = e.target.value;
                    // Trocar o subtipo troca o checklist, e com ele os tipos oferecidos no anexo.
                    // Os anexos ja escolhidos sao zerados: o tipo deles pode nao existir na lista
                    // nova, e deixar um `documento_tipo_id` orfao faria o envio ser recusado com
                    // uma mensagem que nao explica nada.
                    setFormulario({
                      ...formulario,
                      subtipo,
                      // Movimentacoes como atestado normalmente nascem de um documento. A linha
                      // ja aberta deixa o campo visivel sem exigir um clique intermediario.
                      anexos: subtipo ? [{ documento_tipo_id: '', arquivo: null }] : []
                    });
                    carregarChecklist(formulario.tipo, subtipo);
                    if (subtipo === 'TRANSFERENCIA_OBRA') carregarObrasDestinoSePreciso();
                  }}>
                  <option value="">Selecione</option>
                  {subtiposParaColaborador(formulario).map((sub) => (
                    <option key={sub.valor} value={sub.valor}>{sub.rotulo}</option>
                  ))}
                </select>
                </label>

                {['ATESTADO', 'FERIAS'].includes(formulario.subtipo) ? (
                  <div className="rh-colaboradores-filter-grid">
                    <label className="form-field">
                      <span className="form-label form-label--required">Data inicial do afastamento</span>
                      <DateInputBR className="form-control" required value={formulario.data_inicial || ''}
                        onChange={(e) => setFormulario({ ...formulario, data_inicial: e.target.value })} />
                    </label>

                    <label className="form-field">
                      <span className="form-label form-label--required">Data final do afastamento</span>
                      <DateInputBR className="form-control" required value={formulario.data_final || ''}
                        onChange={(e) => setFormulario({ ...formulario, data_final: e.target.value })} />
                    </label>
                    {/*
                      Os dias sao CALCULADOS e so de leitura — o escopo pede que o sistema os calcule.
                      Campo editavel convidaria a digitar um numero que o servidor recalcularia por
                      cima, e o usuario veria um valor virar outro sem explicacao.
                    */}
                    <label className="form-field">
                      <span className="form-label">Dias de afastamento</span>
                      {/* Calculado e so de leitura: o escopo pede que o sistema calcule. Campo
                          editavel convidaria a digitar um numero que o servidor recalcularia por
                          cima, e o usuario veria um valor virar outro sem explicacao. */}
                      <input className="form-control" readOnly tabIndex={-1}
                        value={diasEntre(formulario.data_inicial, formulario.data_final) ?? ''} />
                    </label>
                  </div>
                ) : null}

                {formulario.subtipo === 'RETORNO_AFASTAMENTO' ? (
                  <div className="rh-colaboradores-filter-grid">
                    <label className="form-field">
                      <span className="form-label form-label--required">Data do retorno</span>
                      <DateInputBR className="form-control" required value={formulario.data_retorno || ''}
                        onChange={(e) => setFormulario({ ...formulario, data_retorno: e.target.value })} />
                    </label>
                    <p className="text-sm opacity-80">
                      O Departamento Pessoal registra ciencia e o colaborador volta formalmente para Ativo.
                    </p>
                  </div>
                ) : null}

                {formulario.subtipo === 'TRANSFERENCIA_OBRA' ? (
                  <div className="rh-colaboradores-filter-grid">
                    <label className="form-field">
                      <span className="form-label form-label--required">
                        {formulario.primeiraLotacao ? 'Obra' : 'Obra de destino'}
                      </span>
                      <ObraAutocomplete
                        required
                        value={formulario.obra_destino_id || ''}
                        options={obrasDestino}
                        disabled={statusObrasDestino !== 'pronto'}
                        disabledPlaceholder={statusObrasDestino === 'carregando'
                          ? 'Carregando obras ativas...'
                          : 'Nao foi possivel carregar as obras'}
                        onChange={(obraId) => setFormulario({ ...formulario, obra_destino_id: obraId })}
                      />
                    </label>

                    <label className="form-field">
                      <span className="form-label">A partir de</span>
                      <DateInputBR className="form-control" value={formulario.data_vigencia || ''}
                        onChange={(e) => setFormulario({ ...formulario, data_vigencia: e.target.value })} />
                    </label>
                  </div>
                ) : null}

                {formulario.subtipo === 'ALTERACAO_CARGO' ? (
                  <div className="rh-colaboradores-filter-grid">
                    <label className="form-field">
                      <span className="form-label form-label--required">Novo cargo</span>
                      <select className="form-control" required value={formulario.novo_cargo_id || ''}
                        onChange={(e) => setFormulario({ ...formulario, novo_cargo_id: e.target.value })}>
                        <option value="">Selecione</option>
                        {cargos.map((cargo) => <option key={cargo.id} value={cargo.id}>{cargo.nome}</option>)}
                      </select>
                    </label>
                    <p className="text-sm opacity-80">
                      Conferir se a mudanca de funcao exige ASO novo. O checklist ja traz o campo.
                    </p>
                  </div>
                ) : null}

                {formulario.subtipo === 'ALTERACAO_SALARIAL' ? (
                  <div className="rh-colaboradores-filter-grid">
                    <label className="form-field">
                      <span className="form-label form-label--required">Novo salario</span>
                      <input className="form-control" inputMode="decimal" required value={formulario.novo_salario || ''}
                        onChange={(e) => setFormulario({ ...formulario, novo_salario: normalizeCurrencyTyping(e.target.value) })}
                        onBlur={(e) => setFormulario({ ...formulario, novo_salario: formatCurrencyInput(e.target.value) })} />
                    </label>

                    <label className="form-field">
                      <span className="form-label form-label--required">Vale a partir de</span>
                      <DateInputBR className="form-control" required value={formulario.data_vigencia || ''}
                        onChange={(e) => setFormulario({ ...formulario, data_vigencia: e.target.value })} />
                    </label>

                    <label className="form-field">
                      <span className="form-label form-label--required">Motivo</span>
                      {/* Sem motivo a Diretoria decide no escuro, e aumento e custo permanente. */}
                      <input className="form-control" required value={formulario.motivo || ''}
                        onChange={(e) => setFormulario({ ...formulario, motivo: e.target.value })} />
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={formulario.altera_funcao}
                        onChange={(e) => setFormulario({
                          ...formulario,
                          altera_funcao: e.target.checked,
                          novo_cargo_id: e.target.checked ? formulario.novo_cargo_id : ''
                        })} />
                      A alteracao salarial tambem muda a funcao
                    </label>
                    {formulario.altera_funcao ? (
                      <label className="form-field">
                        <span className="form-label form-label--required">Novo cargo</span>
                        <select className="form-control" required value={formulario.novo_cargo_id || ''}
                          onChange={(e) => setFormulario({ ...formulario, novo_cargo_id: e.target.value })}>
                          <option value="">Selecione</option>
                          {cargos.map((cargo) => <option key={cargo.id} value={cargo.id}>{cargo.nome}</option>)}
                        </select>
                      </label>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/*
              O BLOCO DO TIPO ANTIGO CONTINUA, e nao e sobra esquecida.

              `TROCA_OBRA` deixou de ser oferecido — virou subtipo de Movimentacoes. Mas o deploy
              do codigo e a execucao de `migrarTrocaObraParaMovimentacao.js` sao DOIS momentos, e
              entre eles existem registros com o tipo antigo no banco. Um pedido devolvido nessa
              janela precisa poder ser reaberto e corrigido.

              Depois que o script rodar em producao, este bloco pode sair.
            */}
            {formulario.tipo === 'TROCA_OBRA' ? (
              <div className="rh-colaboradores-filter-grid">
                <label className="form-field">
                  <span className="form-label form-label--required">
                    {formulario.primeiraLotacao ? 'Obra' : 'Obra de destino'}
                  </span>
                  <ObraAutocomplete
                    required
                    value={formulario.obra_destino_id || ''}
                    options={obrasDestino}
                    disabled={statusObrasDestino !== 'pronto'}
                    disabledPlaceholder={statusObrasDestino === 'carregando'
                      ? 'Carregando obras ativas...'
                      : 'Nao foi possivel carregar as obras'}
                    onChange={(obraId) => setFormulario({ ...formulario, obra_destino_id: obraId })}
                  />
                </label>

                <label className="form-field">
                  <span className="form-label">A partir de</span>
                  <DateInputBR className="form-control" value={formulario.data_vigencia}
                    onChange={(e) => setFormulario({ ...formulario, data_vigencia: e.target.value })} />
                </label>
                {formulario.admissaoFutura ? (
                  <p className="text-sm opacity-80">
                    Este colaborador tem admissao programada. A obra passa a valer a partir da
                    admissao, e nao de hoje.
                  </p>
                ) : null}
              </div>
            ) : null}

            {formulario.tipo === 'DEMISSAO' ? (
              <div className="space-y-2">
                {/*
                  O MOTIVO E O SUBTIPO, e ele vem primeiro porque muda a papelada exigida: pedido de
                  demissao cobra o pedido assinado, termino de contrato cobra o termo de encerramento.
                */}
                <label className="form-field">
                <span className="form-label form-label--required">Motivo do desligamento</span>
                <select className="form-control" required value={formulario.subtipo || ''}
                  onChange={(e) => {
                    const subtipo = e.target.value;
                    // Trocar o subtipo troca o checklist, e com ele os tipos oferecidos no anexo.
                    // Os anexos ja escolhidos sao zerados: o tipo deles pode nao existir na lista
                    // nova, e deixar um `documento_tipo_id` orfao faria o envio ser recusado com
                    // uma mensagem que nao explica nada.
                    setFormulario({ ...formulario, subtipo, anexos: [] });
                    carregarChecklist(formulario.tipo, subtipo);
                  }}>
                  <option value="">Selecione</option>
                  {MOTIVOS_DEMISSAO.map((m) => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
                </select>
                </label>

                <label className="form-field">
                  <span className="form-label form-label--required">Quem pediu o desligamento</span>
                  {/* Muda a verba rescisoria inteira. Em branco, o DP adivinha. */}
                  <select className="form-control" required value={formulario.solicitado_por || ''}
                    onChange={(e) => setFormulario({ ...formulario, solicitado_por: e.target.value })}>
                    <option value="">Selecione</option>
                    <option value="EMPRESA">A empresa</option>
                    <option value="COLABORADOR">O colaborador</option>
                  </select>
                </label>

                {/*
                  ACORDO ENTRE AS PARTES e o unico motivo em que o numero e NEGOCIADO em vez de
                  calculado. Sem registrar quanto foi combinado, nao ha como conferir a rescisao
                  depois contra o que se acertou.
                */}
                {formulario.subtipo === 'ACORDO_PARTES' ? (
                  <div className="rh-colaboradores-filter-grid">
                    <label className="form-field">
                      <span className="form-label form-label--required">Valor acordado</span>
                      <input className="form-control" inputMode="decimal" required value={formulario.valor_acordado || ''}
                        onChange={(e) => setFormulario({ ...formulario, valor_acordado: normalizeCurrencyTyping(e.target.value) })}
                        onBlur={(e) => setFormulario({ ...formulario, valor_acordado: formatCurrencyInput(e.target.value) })} />
                    </label>

                    <label className="form-field">
                      <span className="form-label form-label--required">Justificativa do acordo</span>
                      <input className="form-control" required value={formulario.justificativa_acordo || ''}
                        onChange={(e) => setFormulario({ ...formulario, justificativa_acordo: e.target.value })} />
                    </label>
                  </div>
                ) : null}

                <label className="form-field">
                  <span className="form-label form-label--required">Ultimo dia trabalhado</span>
                  <DateInputBR className="form-control" required
                    value={formulario.ultimo_dia_trabalhado || ''}
                    onChange={(e) => setFormulario({ ...formulario, ultimo_dia_trabalhado: e.target.value })} />
                </label>

                {/*
                  ALERTA, E NAO TRAVA. Ferias vencidas nao impedem demitir — mudam a rescisao, e quem
                  decide isso e o DP. Mesma escolha do ASO na Fase 3: a cor avisa, o botao nao some.
                */}
                {(formulario.apontamentos || []).length ? (
                  <div className="rh-alerta-apontamentos">
                    <strong>Antes de seguir, confira:</strong>
                    <ul>
                      {formulario.apontamentos.map((a, i) => (
                        <li key={a.tipo + '-' + i}>{a.descricao}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={formulario.tem_aviso_previo}
                    onChange={(e) => setFormulario({ ...formulario, tem_aviso_previo: e.target.checked })} />
                  Tem aviso previo
                </label>
                {formulario.tem_aviso_previo ? (
                  <div className="rh-colaboradores-filter-grid">
                    <label className="form-field">
                      <span className="form-label form-label--required">Tipo do aviso previo</span>
                      <select className="form-control" value={formulario.tipo_aviso_previo}
                        onChange={(e) => setFormulario({ ...formulario, tipo_aviso_previo: e.target.value })}>
                        <option value="TRABALHADO">Trabalhado</option>
                        <option value="INDENIZADO">Indenizado</option>
                      </select>
                    </label>
                  </div>
                ) : null}
                <label className="form-field">
                  <span className="form-label form-label--required">Data de desligamento</span>
                  <DateInputBR className="form-control" value={formulario.data_desligamento}
                    onChange={(e) => setFormulario({ ...formulario, data_desligamento: e.target.value })} />
                </label>
                {formulario.tem_aviso_previo && formulario.tipo_aviso_previo === 'TRABALHADO' ? (
                  <p className="text-sm opacity-80">
                    Com aviso trabalhado o colaborador continua na obra e no custo dela ate a data de
                    desligamento.
                  </p>
                ) : null}
              </div>
            ) : null}

            {formulario.tipo === 'EVENTO_RECORRENTE' ? (
              <div className="rh-colaboradores-filter-grid">
                <label className="form-field">
                <span className="form-label form-label--required">Tipo do evento</span>
                <select className="form-control" value={formulario.codigo}
                  onChange={(e) => setFormulario({ ...formulario, codigo: e.target.value })}>
                  <option value="VALE_ALIMENTACAO">Vale alimentacao</option>
                  <option value="VALE_TRANSPORTE">Vale transporte</option>
                  <option value="PLANO_SAUDE">Plano de saude</option>
                  <option value="DESCONTO_ADIANTAMENTO">Desconto de adiantamento</option>
                  <option value="PENSAO_ALIMENTICIA">Pensao alimenticia</option>
                  <option value="OUTRO">Outro</option>
                </select>
                </label>

                <label className="form-field">
                  <span className="form-label form-label--required">Natureza</span>
                  <select className="form-control" value={formulario.natureza}
                    onChange={(e) => setFormulario({ ...formulario, natureza: e.target.value })}>
                    <option value="CREDITO">Credito</option>
                    <option value="DESCONTO">Desconto</option>
                  </select>
                </label>

                <ParcelasEventoEditor valor={formulario} onChange={setFormulario} />

                {formulario.codigo === 'PENSAO_ALIMENTICIA' ? (
                  <>
                    <label className="form-field">
                      <span className="form-label form-label--required">Beneficiario</span>
                      <input className="form-control" required value={formulario.beneficiario_nome}
                        onChange={(e) => setFormulario({ ...formulario, beneficiario_nome: e.target.value })} />
                    </label>
                    <label className="form-field">
                      <span className="form-label form-label--required">CPF do beneficiario</span>
                      <input className="form-control" required value={formulario.beneficiario_documento}
                        onChange={(e) => setFormulario({ ...formulario, beneficiario_documento: maskCpfCnpj(e.target.value) })} />
                    </label>
                    <label className="form-field"><span className="form-label">Banco</span>
                      <input className="form-control" value={formulario.beneficiario_banco}
                        onChange={(e) => setFormulario({ ...formulario, beneficiario_banco: e.target.value })} />
                    </label>
                    <label className="form-field"><span className="form-label">Agencia</span>
                      <input className="form-control" value={formulario.beneficiario_agencia}
                        onChange={(e) => setFormulario({ ...formulario, beneficiario_agencia: e.target.value })} />
                    </label>
                    <label className="form-field"><span className="form-label">Conta</span>
                      <input className="form-control" value={formulario.beneficiario_conta}
                        onChange={(e) => setFormulario({ ...formulario, beneficiario_conta: e.target.value })} />
                    </label>
                    <label className="form-field"><span className="form-label">Tipo de conta</span>
                      <select className="form-control" value={formulario.beneficiario_tipo_conta}
                        onChange={(e) => setFormulario({ ...formulario, beneficiario_tipo_conta: e.target.value })}>
                        <option value="">Selecione</option>
                        <option value="CORRENTE">Corrente</option>
                        <option value="POUPANCA">Poupanca</option>
                        <option value="SALARIO">Salario</option>
                      </select>
                    </label>
                    <label className="form-field"><span className="form-label">Chave PIX</span>
                      <input className="form-control" value={formulario.beneficiario_chave_pix}
                        onChange={(e) => setFormulario({ ...formulario, beneficiario_chave_pix: e.target.value })} />
                    </label>
                  </>
                ) : null}

              </div>
            ) : null}

            {formulario.tipo === 'ALTERACAO_SALARIAL' ? (
              <div className="space-y-2">
                <div className="rh-colaboradores-filter-grid">
                  <label className="form-field">
                    <span className="form-label form-label--required">Novo salario</span>
                    <input className="form-control" inputMode="decimal" value={formulario.novo_salario}
                      onChange={(e) => setFormulario({ ...formulario, novo_salario: normalizeCurrencyTyping(e.target.value) })}
                      onBlur={(e) => setFormulario({ ...formulario, novo_salario: formatCurrencyInput(e.target.value) })} required />
                  </label>

                  <label className="form-field">
                    <span className="form-label form-label--required">Vale a partir de</span>
                    <DateInputBR className="form-control" value={formulario.data_vigencia}
                      onChange={(e) => setFormulario({ ...formulario, data_vigencia: e.target.value })} required />
                  </label>

                  <label className="form-field">
                    <span className="form-label form-label--required">Motivo</span>
                    <input className="form-control" value={formulario.motivo}
                      onChange={(e) => setFormulario({ ...formulario, motivo: e.target.value })} required />
                  </label>
                </div>
                <p className="text-sm opacity-80">
                  Quem decide alteracao salarial e a Diretoria, nao o Departamento Pessoal.
                </p>
              </div>
            ) : null}

            {!(formulario.tipo === 'MOVIMENTACAO' && formulario.subtipo === 'ALTERACAO_SALARIAL')
              && formulario.tipo !== 'ALTERACAO_SALARIAL' ? (
            <label className="form-field">
              <span className="form-label">Justificativa</span>
              <textarea className="form-control" rows={2}
                value={formulario.justificativa}
                onChange={(e) => setFormulario({ ...formulario, justificativa: e.target.value })} />
            </label>
            ) : null}


            {/*
              ANEXAR NO PROPRIO MODAL (27/08).

              Pedido do cliente: "tem movimentacao que precisa anexar arquivo como Atestado por
              exemplo, e permitir anexar multiplos arquivos".

              OS ARQUIVOS SOBEM DEPOIS de o pedido ser gravado — o anexo e uma linha com FK para a
              solicitacao, entao ela precisa existir primeiro. E exatamente o que o RASCUNHO resolve:
              ele segura o trabalho entre "gravei o pedido" e "a papelada esta toda la".

              UMA LINHA POR ARQUIVO. Quando o checklist do movimento trouxer classificacoes, cada
              arquivo pode receber o seu tipo; sem classificacao ele continua registrado como
              anexo da solicitacao, mas nao entra na pasta documental do colaborador.
            */}
            {formulario.tipo ? (
              <div className="rh-anexos-do-modal">
                <div className="rh-anexos-cabecalho">
                  <span className="form-label">Documentos</span>
                  <button type="button" className="btn btn-outline btn-sm" onClick={acrescentarLinhaDeAnexo}>
                    Acrescentar arquivo
                  </button>
                </div>

                {(formulario.anexos || []).length === 0 ? (
                  <p className="form-hint">
                    Nenhum arquivo escolhido. Da para anexar agora ou depois, abrindo o rascunho.
                  </p>
                ) : null}

                {(formulario.anexos || []).map((linha, indice) => (
                  <div className="rh-anexo-linha" key={`anexo-${indice}`}>
                    <label className="form-field">
                      <span className="form-label">Tipo do documento</span>
                      <select
                        className="form-control"
                        value={linha.documento_tipo_id}
                        onChange={(e) => alterarLinhaDeAnexo(indice, 'documento_tipo_id', e.target.value)}
                      >
                        <option value="">Sem classificacao (somente nesta solicitacao)</option>
                        {checklistDoTipo.map((item) => (
                          <option key={item.documento_tipo_id} value={item.documento_tipo_id}>
                            {item.nome}{item.nivel === 'OBRIGATORIO' ? ' (obrigatorio)' : ''}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="form-field">
                      <span className="form-label">Arquivo</span>
                      <input
                        className="form-control"
                        type="file"
                        onChange={(e) => alterarLinhaDeAnexo(indice, 'arquivo', e.target.files?.[0] || null)}
                      />
                    </label>

                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => removerLinhaDeAnexo(indice)}
                      aria-label={`Remover o arquivo ${indice + 1}`}
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="app-page-actions">
              {/*
                O ROTULO DIZ O QUE O BOTAO FAZ. Ele dizia "Enviar ao Departamento Pessoal" e passou
                a mentir quando o pedido virou RASCUNHO: aqui so se GRAVA o rascunho e sobem os
                arquivos. Quem enviava de fato era este botao, e agora e o de Enviar, na lista.
              */}
              <button type="submit" className="btn btn-primary">Salvar rascunho</button>
              <button type="button" className="btn btn-outline" onClick={() => setFormulario(null)}>Cancelar</button>
              </div>
            </form>
          </div>
        </OverlayModal>
      ) : null}

      {conferencia ? (
        <div className="alert alert-warning">
          Faltam: {conferencia.faltando.map((d) => d.nome).join(', ')}
        </div>
      ) : null}

      {elementoConfirmacao}
    </Pagina>
  );
}
