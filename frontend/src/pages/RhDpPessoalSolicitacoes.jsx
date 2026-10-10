import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  HiOutlineArrowPath,
  HiOutlineArrowUturnLeft,
  HiOutlineArrowUturnRight,
  HiOutlineCheck,
  HiOutlineClipboardDocumentCheck,
  HiOutlineEye,
  HiOutlinePaperAirplane,
  HiOutlineXMark
} from 'react-icons/hi2';
import { useAuth } from '../contexts/AuthContext';
import {
  Avisos,
  BarraFiltros,
  TabelaPadrao,
  alternarValorFiltro,
  useAvisos,
  useConfirmacao
} from '../components/padrao';
import OverlayModal from '../components/ui/OverlayModal';
import Button from '../components/ui/Button';
import RhDpApuracao from './RhDpApuracao';
import RhDpPagamentoModal from '../components/rh/RhDpPagamentoModal';
import { competenciaISOParaBR } from '../components/CompetenciaInputBR';
import '../styles/rh-pessoal-atividade.css';
import {
  anexarNaRhSolicitacao,
  aprovarRhSolicitacao,
  cancelarRhSolicitacao,
  conferirDocumentacaoRhSolicitacao,
  listarAnexosRhSolicitacao,
  listarRhSolicitacoes,
  getRhSolicitacao,
  comentarRhSolicitacao,
  solicitarRetornoRhSolicitacao,
  reenviarRhSolicitacao,
  rejeitarRhSolicitacao,
  validarAnexoRhSolicitacao,
  getRhChecklistDoTipo,
  getRhSolicitacaoAnexoLink,
  enviarRhSolicitacao
} from '../services/rhDp';

/**
 * A ABA DE SOLICITACOES — acompanhar e decidir (26/08).
 *
 * Separada da aba de colaboradores porque as duas respondem perguntas diferentes: aquela e "quem
 * trabalha aqui e o que eu faco com essa pessoa"; esta e "o que esta esperando decisao".
 *
 * A validacao de documento vive AQUI, e nao na aba de colaboradores, porque ela e uma etapa do
 * pedido: o DP atesta que o documento e valido ANTES de ele virar documento do colaborador. Depois
 * que vira, ele aparece na pasta e some daqui — que e o comportamento certo, porque a decisao ja
 * foi tomada.
 */

const ROTULO_TIPO = {
  ADMISSAO: 'Admissao',
  DEMISSAO: 'Demissao',
  MOVIMENTACAO: 'Movimentacao',
  JORNADA: 'Jornada',
  PAGAMENTO_MAO_DE_OBRA: 'Pagamento de mao de obra',
  // Legado: existe gravado ate `migrarTrocaObraParaMovimentacao.js` rodar em producao.
  TROCA_OBRA: 'Troca de obra',
  EVENTO_RECORRENTE: 'Evento recorrente',
  ALTERACAO_SALARIAL: 'Alteracao salarial'
};

const ROTULO_SITUACAO = {
  RASCUNHO: 'Rascunho',
  ABERTA: 'Aguardando decisao',
  APROVADA: 'Aprovada',
  REJEITADA: 'Devolvida para correcao',
  CANCELADA: 'Cancelada'
};

/**
 * As opcoes do recorte de SITUACAO (R12).
 *
 * RASCUNHO continua na lista: um estado que a tela nao sabe filtrar e um estado que ninguem
 * encontra — e rascunho esquecido e justamente o que precisa ser encontrado.
 *
 * A opcao "Todas" do antigo select NAO virou uma marca: na marcacao, nada marcado JA e "todas",
 * e uma marca chamada "Todas" conviveria com as outras dizendo o contrario delas. Quem quer
 * voltar para todas desmarca a que esta ativa, ou usa o "Limpar tudo" da propria faixa.
 */
const OPCOES_SITUACAO = [
  { valor: 'RASCUNHO', rotulo: 'Rascunhos (faltam enviar)' },
  { valor: 'ABERTA', rotulo: 'Aguardando decisão' },
  { valor: 'REJEITADA', rotulo: 'Devolvidas para correção' },
  { valor: 'APROVADA', rotulo: 'Aprovadas' },
  { valor: 'CANCELADA', rotulo: 'Canceladas' }
];

const SEM_FILTRO = { situacao: new Set(), tipo: new Set() };
const ehPagamentoPorSolicitacao = s => s.dados_json?.fluxo_pagamento === 'PAGAMENTO_POR_SOLICITACAO';

/** Dimensao de valor UNICO: o `ativos` guarda um conjunto, o servico recebe um valor. */
function primeiroValor(conjunto) {
  return Array.from(conjunto || [])[0] || '';
}

// Ver o comentario em RhDpPessoal.jsx: sem `columns` + `columnKey`, as colunas colapsam.
function chipDoTipo(tipo) {
  if (tipo === 'ALTERACAO_SALARIAL') return 'rh-chip rh-chip--diretoria';
  if (tipo === 'EVENTO_RECORRENTE') return 'rh-chip rh-chip--evento';
  return 'rh-chip rh-chip--pedido';
}

function chipDaSituacao(situacao) {
  if (situacao === 'RASCUNHO') return 'rh-chip rh-chip--rascunho';
  if (situacao === 'ABERTA') return 'rh-chip rh-chip--aberta';
  if (situacao === 'REJEITADA') return 'rh-chip rh-chip--devolvida';
  if (situacao === 'APROVADA') return 'rh-chip rh-chip--evento';
  return 'rh-chip';
}

const ROTULO_DADO = {
  data_inicial: 'Data inicial',
  data_final: 'Data final',
  data_vigencia: 'Vigência',
  dias_afastamento: 'Dias de afastamento',
  motivo: 'Motivo',
  novo_salario: 'Novo salário',
  novo_cargo_id: 'Novo cargo',
  data_desligamento: 'Data de desligamento',
  ultimo_dia_trabalhado: 'Último dia trabalhado',
  solicitado_por: 'Solicitado por',
  tem_aviso_previo: 'Aviso prévio',
  tipo_aviso_previo: 'Tipo do aviso prévio',
  codigo: 'Evento',
  natureza: 'Natureza',
  valor: 'Valor',
  competencia_inicio: 'Competência inicial',
  parcelas_total: 'Parcelas',
  parcelas_valores: 'Valores das parcelas',
  competencia: 'Competência',
  periodicidade: 'Periodicidade',
  periodo_inicio: 'Início do período',
  periodo_fim: 'Fim do período',
  dias_base: 'Dias base',
  total_colaboradores: 'Colaboradores informados',
  origem: 'Origem',
  telefone: 'Telefone',
  telefone_secundario: 'Segundo telefone',
  email: 'E-mail',
  endereco: 'Endereço',
  numero: 'Número',
  complemento: 'Complemento',
  bairro: 'Bairro',
  municipio: 'Município',
  estado: 'UF',
  cep: 'CEP',
  endereco_secundario: 'Segundo endereço',
  numero_secundario: 'Número do segundo endereço',
  complemento_secundario: 'Complemento do segundo endereço',
  bairro_secundario: 'Bairro do segundo endereço',
  municipio_secundario: 'Município do segundo endereço',
  estado_secundario: 'UF do segundo endereço',
  cep_secundario: 'CEP do segundo endereço'
};

function formatarDado(chave, valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  if (['competencia_inicio', 'competencia'].includes(chave) && /^\d{4}-\d{2}$/.test(String(valor))) {
    return competenciaISOParaBR(valor);
  }
  if (chave === 'parcelas_valores' && Array.isArray(valor)) {
    return valor.map((parcela, index) => (
      `${index + 1}ª ${Number(parcela).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
    )).join(' · ');
  }
  if (/^data_|^periodo_|_em$|competencia_inicio/.test(chave) && /^\d{4}-\d{2}-\d{2}/.test(String(valor))) {
    return new Date(`${String(valor).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
  }
  if (['valor', 'novo_salario'].includes(chave) && !Number.isNaN(Number(valor))) {
    return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  return String(valor).replaceAll('_', ' ');
}

function dadosOperacionais(solicitacao) {
  return Object.entries(solicitacao?.dados_json || {})
    .filter(([chave, valor]) => ROTULO_DADO[chave] && valor !== null && valor !== undefined && valor !== '')
    .map(([chave, valor]) => ({ chave, rotulo: ROTULO_DADO[chave], valor: formatarDado(chave, valor) }));
}

function AcaoIconePessoal({ rotulo, icone: Icone, solicitacaoId, variant = 'outline', onClick }) {
  return (
    <Button
      variant={variant}
      size="sm"
      iconOnly
      className="rh-solicitacao-acao-icone"
      title={rotulo}
      aria-label={`${rotulo}: solicitação #${solicitacaoId}`}
      onClick={onClick}
    >
      <Icone size={18} aria-hidden="true" />
    </Button>
  );
}

export default function RhDpPessoalSolicitacoes({ obraId, podeAbrir, podeDecidir, podeDecidirEventoRecorrente, podeAprovarSalario, aoMudar, onAbrirListaJornadas, onAbrirApuracao, aoContarAbertas, aoContarNaoLidas, aoMarcarVisualizada }) {
  const { user } = useAuth();
  const { avisos, avisar, fechar, limpar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [parametros, setParametros] = useSearchParams();

  const [solicitacoes, setSolicitacoes] = useState([]);
  const [carregando, setCarregando] = useState(false);

  /*
    R12: situacao e tipo sao recortes ENUMERAVEIS — marcacao com etiqueta removivel, e nao lista
    suspensa. Ambos com `unico`, porque `listarRhSolicitacoes` recebe UM valor por recorte: com
    marcacao multipla, marcar dois mandaria `undefined` e a lista nao estreitaria.
  */
  const [ativos, setAtivos] = useState(() => ({ situacao: new Set(), tipo: new Set() }));
  const filtroSituacao = useMemo(() => primeiroValor(ativos.situacao), [ativos]);
  const filtroTipo = useMemo(() => primeiroValor(ativos.tipo), [ativos]);

  const [aberta, setAberta] = useState(null);
  const [comentario, setComentario] = useState('');
  const [comentando, setComentando] = useState(false);
  const travaComentario = useRef(false);
  const detalheAtual = useRef(null);
  const conferenciaOcupada = useRef(false);
  const [anexos, setAnexos] = useState([]);
  const [conferencia, setConferencia] = useState(null);
  const [tiposDocumento, setTiposDocumento] = useState([]);
  const [envio, setEnvio] = useState({ tipo: '', arquivo: null, enviando: false });
  // Evita que uma resposta de listagem iniciada antes da abertura do modal
  // recoloque o destaque já lido. Se surgir um histórico mais novo, o id será
  // maior e a solicitação volta corretamente a aparecer como não visualizada.
  const leiturasDaSessao = useRef(new Map());

  const normalizarLeiturasLocais = useCallback((lista) => (
    (Array.isArray(lista) ? lista : []).map((solicitacao) => {
      const historicoLido = Number(leiturasDaSessao.current.get(Number(solicitacao.id)) || 0);
      return historicoLido >= Number(solicitacao.ultimo_historico_id || 0)
        ? { ...solicitacao, nao_lida: false }
        : solicitacao;
    })
  ), []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    limpar();
    try {
      const lista = await listarRhSolicitacoes({
        situacao: filtroSituacao || undefined,
        tipo: filtroTipo || undefined,
        obra_id: obraId || undefined
      });
      setSolicitacoes(normalizarLeiturasLocais(lista).filter((item) => !obraId || Number(item.obra_id) === Number(obraId)));
    } catch (error) {
      avisar.erro(error.message || 'Nao foi possivel carregar as solicitacoes.');
    } finally {
      setCarregando(false);
    }
  }, [obraId, filtroSituacao, filtroTipo, avisar, limpar, normalizarLeiturasLocais]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const atualizar = async () => {
      if (document.hidden) return;
      try {
        const lista = await listarRhSolicitacoes({ obra_id: obraId || undefined, situacao: filtroSituacao || undefined, tipo: filtroTipo || undefined });
        setSolicitacoes(normalizarLeiturasLocais(lista).filter((item) => !obraId || Number(item.obra_id) === Number(obraId)));
      } catch { /* A atualização manual mantém o tratamento visível de erros. */ }
    };
    const timer = setInterval(atualizar, 30000);
    window.addEventListener('focus', atualizar);
    return () => { clearInterval(timer); window.removeEventListener('focus', atualizar); };
  }, [obraId, filtroSituacao, filtroTipo, normalizarLeiturasLocais]);

  useEffect(() => {
    if (filtroTipo || (filtroSituacao && filtroSituacao !== 'ABERTA')) return;
    const abertas = solicitacoes.filter((solicitacao) => solicitacao.situacao === 'ABERTA');
    aoContarAbertas?.(abertas.length);
    aoContarNaoLidas?.(abertas.filter((solicitacao) => solicitacao.nao_lida).length);
  }, [solicitacoes, filtroSituacao, filtroTipo, aoContarAbertas, aoContarNaoLidas]);

  const contagem = useMemo(() => {
    const porTipo = {};
    solicitacoes.forEach((s) => { porTipo[s.tipo] = (porTipo[s.tipo] || 0) + 1; });
    return porTipo;
  }, [solicitacoes]);

  const dimensoesFiltro = useMemo(() => [
    { id: 'situacao', rotulo: 'Situação', unico: true, opcoes: OPCOES_SITUACAO },
    {
      id: 'tipo',
      rotulo: 'Tipo',
      unico: true,
      opcoes: Object.entries(ROTULO_TIPO).map(([valor, rotulo]) => ({ valor, rotulo }))
    }
  ], []);

  /*
    DEFEITO REAL, e nao de layout: o contador dizia
    `ROTULO_SITUACAO[filtroSituacao].toLowerCase()`, mas RASCUNHO nao existe nesse mapa — escolher
    "Rascunhos (faltam enviar)" estourava com TypeError e a aba inteira ficava em branco. O rotulo
    agora cai para o da opcao marcada, que existe para todos os valores oferecidos.
  */
  const rotuloDoRecorte = useMemo(() => {
    if (!filtroSituacao) return 'no filtro atual';
    const daOpcao = OPCOES_SITUACAO.find((o) => o.valor === filtroSituacao);
    return String(ROTULO_SITUACAO[filtroSituacao] || daOpcao?.rotulo || filtroSituacao).toLowerCase();
  }, [filtroSituacao]);

  async function abrirDetalhe(solicitacao) {
    conferenciaOcupada.current = false;
    limpar();
    detalheAtual.current = solicitacao.id;
    setComentario('');
    setAberta(solicitacao);
    setAnexos([]);
    setConferencia(null);
    try {
      const pagamento = await getRhSolicitacao(solicitacao.id);
      if (pagamento.dados_json?.fluxo_pagamento === 'PAGAMENTO_POR_SOLICITACAO') {
        if (detalheAtual.current !== solicitacao.id) return;
        setAberta(pagamento);
        setSolicitacoes(lista => lista.map(s => s.id === solicitacao.id ? { ...s, nao_lida: false } : s));
        if (solicitacao.nao_lida) aoMarcarVisualizada?.();
        return;
      }
      const [listaAnexos, conferido, detalhe] = await Promise.all([
        listarAnexosRhSolicitacao(solicitacao.id),
        conferirDocumentacaoRhSolicitacao(solicitacao.id),
        Promise.resolve(pagamento)
      ]);
      if (detalheAtual.current !== solicitacao.id) return;
      const ultimoHistorico = (detalhe.historicos || []).reduce(
        (maior, historico) => Math.max(maior, Number(historico.id || 0)),
        0
      );
      leiturasDaSessao.current.set(Number(solicitacao.id), ultimoHistorico);
      setAberta(detalhe);
      setSolicitacoes(lista => lista.map(s => s.id === solicitacao.id ? { ...s, nao_lida: false } : s));
      if (solicitacao.nao_lida) aoMarcarVisualizada?.();
      setAnexos(Array.isArray(listaAnexos) ? listaAnexos : []);
      setConferencia(conferido);
      const checklist = await getRhChecklistDoTipo(detalhe.tipo, detalhe.subtipo || undefined)
        .catch(() => ({ itens: [] }));
      setTiposDocumento((checklist?.itens || []).map((item) => ({
        id: item.documento_tipo_id,
        nome: item.nome,
        obrigatorio: item.nivel === 'OBRIGATORIO'
      })));
    } catch (error) {
      avisar.erro(error.message || 'Nao foi possivel abrir a solicitacao.');
      if (detalheAtual.current === solicitacao.id) {
        detalheAtual.current = null;
        setAberta(null);
        setParametros((atuais) => {
          const proximos = new URLSearchParams(atuais);
          proximos.delete('solicitacao');
          return proximos;
        }, { replace: true });
      }
    }
  }

  function selecionarDetalhe(solicitacao) {
    setParametros((atuais) => {
      const proximos = new URLSearchParams(atuais);
      proximos.set('solicitacao', String(solicitacao.id));
      return proximos;
    });
    // Inicia com o resumo completo da linha, inclusive o estado visual de
    // leitura. O ref preenchido sincronicamente impede o efeito da URL de
    // disparar uma segunda abertura da mesma solicitação.
    abrirDetalhe(solicitacao);
  }

  function fecharDetalhe() {
    if (conferenciaOcupada.current) {
      avisar.alerta('Salve os ajustes pendentes ou aguarde a gravação antes de fechar.'); return;
    }
    detalheAtual.current = null;
    setAberta(null);
    setParametros((atuais) => {
      const proximos = new URLSearchParams(atuais);
      proximos.delete('solicitacao');
      return proximos;
    }, { replace: true });
  }

  useEffect(() => {
    const solicitacaoId = Number(parametros.get('solicitacao'));
    if (Number.isInteger(solicitacaoId) && solicitacaoId > 0 && detalheAtual.current !== solicitacaoId) {
      abrirDetalhe({ id: solicitacaoId });
    }
    // A URL e a fonte do detalhe selecionado; `abrirDetalhe` apenas materializa esse estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parametros]);

  async function abrirAnexo(anexo) {
    limpar();
    try {
      const url = await getRhSolicitacaoAnexoLink(aberta.id, anexo.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      avisar.erro(error.message || 'Nao foi possivel abrir o documento.');
    }
  }

  /*
    R3/R19: as duas caixas do navegador sairam daqui. O motivo da recusa e a observacao do
    atestado eram `window.prompt`; agora sao o `campo` da confirmacao do sistema — mesmo passo
    unico, mas dentro do DOM, com tema, tokens e rotulo dizendo o que acontece.
  */
  async function decidirAnexo(anexo, aceito) {
    limpar();
    let mensagem = '';
    try {
      if (!aceito) {
        const { ok, texto } = await confirmar({
          titulo: 'Recusar documento',
          mensagem: `"${anexo.nome_original}" volta recusado para a obra, que precisa saber o que reenviar.`,
          rotuloConfirmar: 'Recusar documento',
          rotuloCancelar: 'Voltar',
          destrutiva: true,
          campo: { rotulo: 'Motivo', obrigatorio: true, multilinha: true }
        });
        // Mesmo corte do fluxo antigo (`if (!motivo || !motivo.trim()) return;`): o campo
        // obrigatorio ja trava o botao enquanto o texto estiver vazio ou so com espacos.
        if (!ok) return;
        await validarAnexoRhSolicitacao(aberta.id, anexo.id, { aceito: false, motivo: texto.trim() });
        mensagem = 'Documento recusado. A obra ve o motivo e pode reenviar.';
      } else {
        const { ok, texto } = await confirmar({
          titulo: 'Atestar documento',
          mensagem: `Atestar que "${anexo.nome_original}" e valido e util.`,
          rotuloConfirmar: 'Atestar',
          campo: {
            rotulo: 'Observação (opcional)',
            multilinha: true,
            valorInicial: 'Confere com o original.'
          }
        });
        if (!ok) return;
        await validarAnexoRhSolicitacao(aberta.id, anexo.id, { aceito: true, observacao: texto });
        mensagem = 'Documento atestado. Ele vai para a pasta quando a solicitacao for aprovada.';
      }
      await abrirDetalhe(aberta);
      /*
        O aviso vem DEPOIS de recarregar o detalhe, e nao antes.

        Mesmo defeito ja encontrado na tela irma: `setAviso(...)` seguido de `abrirDetalhe()`,
        que comeca limpando os avisos — a faixa verde era apagada no mesmo tique, antes de
        qualquer pintura, e quem conferia o documento nao via retorno nenhum.
      */
      avisar.sucesso(mensagem);
    } catch (error) {
      avisar.erro(error.message || 'Nao foi possivel registrar a conferencia do documento.');
    }
  }

  async function enviarDocumento(evento) {
    evento.preventDefault();
    limpar();

    if (!envio.arquivo) {
      avisar.erro('Escolha o arquivo antes de enviar.');
      return;
    }

    setEnvio((atual) => ({ ...atual, enviando: true }));
    try {
      await anexarNaRhSolicitacao(
        aberta.id,
        { documento_tipo_id: envio.tipo || undefined },
        envio.arquivo
      );
      setEnvio({ tipo: '', arquivo: null, enviando: false });
      await abrirDetalhe(aberta);
      // Depois do recarregamento, pelo mesmo motivo de `decidirAnexo`.
      avisar.sucesso('Documento enviado. Ele vai para a pasta depois que o DP atestar.');
    } catch (error) {
      avisar.erro(error.message || 'Nao foi possivel enviar o documento.');
      setEnvio((atual) => ({ ...atual, enviando: false }));
    }
  }

  /**
   * RASCUNHO -> ABERTA. E aqui que o DP finalmente recebe o pedido.
   *
   * O erro mais util deste fluxo vem do servidor: quando faltam documentos obrigatorios ele responde
   * com a LISTA do que falta. Mostrar a mensagem crua e melhor do que traduzi-la para um
   * "verifique os documentos" generico, que obrigaria a pessoa a caçar o que e.
   */
  async function enviarAoDp(solicitacao) {
    limpar();
    try {
      await enviarRhSolicitacao(solicitacao.id);
      // Depois de `carregar()`, que comeca limpando os avisos: emitir antes apagaria a
      // confirmacao do envio antes de ela ser pintada.
      await carregar();
      avisar.sucesso(`Solicitacao #${solicitacao.id} enviada. O Departamento Pessoal ja pode decidir.`);
    } catch (error) {
      avisar.erro(error.message || 'Nao foi possivel enviar a solicitacao.');
    }
  }

  async function solicitarRetorno(solicitacao) {
    const { ok, texto } = await confirmar({
      titulo: 'Solicitar retorno ao DP',
      mensagem: 'O pedido continua aberto até o DP analisar e devolver para correção. Descreva o que precisa mudar.',
      rotuloConfirmar: 'Enviar pedido de retorno',
      campo: { rotulo: 'Motivo', obrigatorio: true, multilinha: true }
    });
    if (!ok) return;
    try {
      await solicitarRetornoRhSolicitacao(solicitacao.id, texto.trim());
      await carregar();
      avisar.sucesso('Pedido de retorno registrado para análise do DP.');
    } catch (error) {
      avisar.erro(error.message || 'Não foi possível solicitar o retorno.');
    }
  }

  async function decidir(solicitacao, acao) {
    limpar();
    let mensagem = '';
    try {
      if (acao === 'aprovar') {
        /**
         * A conferencia AVISA, NAO TRAVA — mas agora ela avisa duas coisas diferentes: o que nunca
         * chegou, e o que chegou e ainda nao foi atestado. A segunda importa mais: aprovar com
         * documento pendente significa que ele NAO vai para a pasta, e quem aprova precisa saber
         * disso antes, nao depois.
         */
        const conferido = await conferirDocumentacaoRhSolicitacao(solicitacao.id);
        const partes = [];
        if (conferido?.faltando?.length) {
          partes.push(`Nunca chegaram: ${conferido.faltando.map((d) => d.nome).join(', ')}.`);
        }
        if (conferido?.anexosAguardando) {
          partes.push(
            `${conferido.anexosAguardando} documento(s) aguardando sua conferencia — eles NAO vao `
            + 'para a pasta do colaborador se voce aprovar agora.'
          );
        }
        if (partes.length) {
          /*
            A mensagem vira UMA linha corrida porque a faixa da confirmacao e um paragrafo: a
            quebra dupla que a caixa do navegador respeitava nao existe mais aqui, e cada parte
            ja termina em ponto. O texto e o corte do fluxo (cancelar = nao aprova) sao os mesmos.
          */
          const { ok } = await confirmar({
            titulo: 'Aprovar com pendência',
            mensagem: `${partes.join(' ')} Aprovar mesmo assim?`,
            rotuloConfirmar: 'Aprovar mesmo assim',
            rotuloCancelar: 'Voltar'
          });
          if (!ok) return;
        }
        await aprovarRhSolicitacao(solicitacao.id);
        mensagem = 'Solicitacao aprovada.';
      }

      if (acao === 'devolver') {
        // Devolver RECUSA o pedido de quem abriu: destrutiva, e o motivo e obrigatorio — era
        // um `window.prompt` com o mesmo corte (`if (!motivo || !motivo.trim()) return;`).
        const { ok, texto } = await confirmar({
          titulo: 'Devolver para correção',
          mensagem: 'A solicitação volta para quem abriu e sai da fila de decisão até ser reenviada.',
          rotuloConfirmar: 'Devolver',
          rotuloCancelar: 'Voltar',
          destrutiva: true,
          campo: { rotulo: 'Motivo', obrigatorio: true, multilinha: true }
        });
        if (!ok) return;
        await rejeitarRhSolicitacao(solicitacao.id, texto.trim());
        mensagem = 'Solicitacao devolvida a quem abriu.';
      }

      if (acao === 'reenviar') {
        await reenviarRhSolicitacao(solicitacao.id, {});
        mensagem = 'Solicitacao reenviada ao Departamento Pessoal.';
      }

      if (acao === 'cancelar') {
        /*
          O motivo continua OPCIONAL, mas "voltar atras" agora aborta de verdade. No fluxo
          antigo a caixa do navegador que pedia o motivo devolvia `null` ao ser fechada, e o
          `|| ''` transformava isso em string vazia: a solicitacao era cancelada assim mesmo.
          Nao havia como desistir depois de clicar no botao — acao destrutiva sem saida.
        */
        const { ok, texto } = await confirmar({
          titulo: 'Cancelar solicitação',
          mensagem: `Cancelar a solicitacao #${solicitacao.id}? Ela sai da fila de decisao.`,
          rotuloConfirmar: 'Cancelar solicitacao',
          rotuloCancelar: 'Manter solicitacao',
          destrutiva: true,
          campo: { rotulo: 'Motivo (opcional)', multilinha: true }
        });
        if (!ok) return;
        await cancelarRhSolicitacao(solicitacao.id, texto);
        mensagem = 'Solicitacao cancelada.';
      }

      fecharDetalhe();
      await carregar();
      if (typeof aoMudar === 'function') aoMudar();
      // Por ultimo: `carregar()` comeca limpando os avisos, entao a confirmacao emitida antes
      // dele seria apagada no mesmo tique e a decisao pareceria nao ter acontecido.
      avisar.sucesso(mensagem);
    } catch (error) {
      avisar.erro(error.message || 'Nao foi possivel concluir a acao.');
    }
  }

  const faixaAvisos = <Avisos avisos={avisos} aoFechar={fechar} />;

  return (
    /*
      SEM `Pagina` e SEM `PageHeader` aqui, de proposito: este arquivo e o CONTEUDO da aba
      "Solicitacoes" do `RhDpPessoal`, e nao uma pagina — quem e dono do titulo e da faixa fixa
      e ele. Duas faixas fixas empilhadas e exatamente o defeito que a R16 evita; mesma excecao
      declarada que vale para `RhDpJornada` e `RhDpApuracao`. O `app-pagina` da o ritmo
      vertical que o `space-y-4` dava na mao.
    */
    <div className="app-pagina">
      {/*
        A faixa tem UM dono, mas dois lugares: com o modal de detalhe aberto
        ela sobe para dentro dele. Atestar/recusar anexo, enviar documento e
        as validações de "escolha o arquivo antes de enviar" acontecem TODAS
        com o modal aberto — no topo da página a mensagem ficava atrás do
        fundo escuro: existia no DOM e ninguém lia. É a mesma correção que o
        RhDpPessoal e o RhDpColaboradores já tinham.
      */}
      {!aberta && faixaAvisos}

      <div className="rh-pessoal-alertas">
        <div className="rh-pessoal-alerta">
          <div className="rh-pessoal-alerta-numero">{solicitacoes.length}</div>
          <div className="rh-pessoal-alerta-texto">{rotuloDoRecorte}</div>
        </div>
        {Object.entries(contagem).map(([tipo, qtd]) => (
          <div className="rh-pessoal-alerta" key={tipo}>
            <div className="rh-pessoal-alerta-numero">{qtd}</div>
            <div className="rh-pessoal-alerta-texto">{ROTULO_TIPO[tipo] || tipo}</div>
          </div>
        ))}
      </div>

      {/*
        R12/R16: o cartao de filtros com grade de select saiu inteiro. Situacao e tipo tem lista
        fechada de valores — sao ENUMERAVEIS e vao em `filtros`, com marcacao e etiqueta
        removivel; nada aqui e continuo, entao `campos` nao tem uso nesta tela e fica de fora.
        Nao ha busca textual: o servico nao aceita termo livre, e ligar uma caixa de busca que
        nao estreita nada seria capacidade sem efeito (R15).
      */}
      <BarraFiltros
        filtros={dimensoesFiltro}
        ativos={ativos}
        aoAlternar={(dimensao, valor, opcoes) => setAtivos(
          (atuais) => alternarValorFiltro(atuais, dimensao, valor, opcoes)
        )}
        aoLimpar={() => setAtivos(SEM_FILTRO)}
      />

      <div className="app-actionbar">
        <button type="button" className="btn btn-outline" onClick={carregar} disabled={carregando}>
          {carregando ? 'Carregando...' : 'Atualizar'}
        </button>
      </div>

      <div className="card sol-surface-card">
        <TabelaPadrao
          colunas={[
            {
              id: 'tipo',
              titulo: 'Tipo',
              tipo: 'badge',
              render: (s) => (
                <span className={chipDoTipo(s.tipo)}>
                  {/*
                    Sem obra de origem, o pedido de TROCA_OBRA e a PRIMEIRA lotacao — e "trocar"
                    seria a palavra errada. Quem decide precisa entender o que esta decidindo.
                  */}
                  {(s.tipo === 'TROCA_OBRA' || s.subtipo === 'TRANSFERENCIA_OBRA') && !s.colaborador?.obra_id
                    ? 'Vincular a obra'
                    : ehPagamentoPorSolicitacao(s) ? 'Pagamento' : ROTULO_TIPO[s.tipo] || s.tipo}
                </span>
              )
            },
            {
              id: 'colaborador',
              titulo: 'Colaborador',
              // R17: a solicitacao e sobre uma PESSOA — o nome dela identifica a linha.
              tipo: 'identidade',
              noCard: 'titulo',
              /* Na admissao o colaborador ainda nao existe: o nome vive no pedido. */
              render: (s) => s.tipo === 'JORNADA'
                ? `${s.dados_json?.total_colaboradores ?? s.dados_json?.linhas?.filter(l => l.selecionado).length ?? 0} colaborador(es)`
                : s.colaborador?.nome || s.dados_json?.nome || <span className="opacity-60">a admitir</span>
            },
            {
              id: 'obra',
              titulo: 'Obra',
              tipo: 'texto',
              /*
                Na TROCA DE OBRA a linha mostra ORIGEM e DESTINO. Sem isso, quem decide ve so
                uma obra e nao sabe se e de onde ele sai ou para onde vai — e a decisao e
                justamente sobre esse movimento.
              */
              render: (s) => (s.tipo === 'TROCA_OBRA' ? (
                <div className="rh-troca-obra">
                  <span className="rh-troca-obra-origem">
                    {s.obra?.nome || s.colaborador?.obra?.nome || 'Sem obra'}
                  </span>
                  <span className="rh-troca-obra-seta" aria-hidden="true">→</span>
                  <span className="rh-troca-obra-destino">
                    {s.obra_destino_nome || '—'}
                  </span>
                </div>
              ) : (
                s.obra?.nome || '—'
              ))
            },
            {
              id: 'situacao',
              titulo: 'Situação',
              tipo: 'status',
              render: (s) => (
                <>
                  <span className={chipDaSituacao(s.situacao)}>{ehPagamentoPorSolicitacao(s) && s.situacao === 'APROVADA' ? 'Enviado para a fila' : ROTULO_SITUACAO[s.situacao] || s.situacao}</span>
                  {s.motivo_rejeicao ? (
                    <div className="text-xs rh-pessoal-devolucao">{s.motivo_rejeicao}</div>
                  ) : null}
                </>
              )
            },
            {
              id: 'aberta',
              titulo: 'Última interação',
              tipo: 'data',
              render: (s) => <>{s.atividade_em ? new Date(s.atividade_em).toLocaleString('pt-BR') : '—'}{s.nao_lida && <span className="rh-chip rh-chip--aberta">Nova interação</span>}</>
            }
          ]}
          itens={solicitacoes}
          storageKey="tabela:rh-dp-pessoal-solicitacoes"
          rotuloRolagem="Solicitacoes RH/DP"
          carregando={carregando}
          vazio="Nenhuma solicitação neste filtro."
          // Rascunho e aberta ainda esperam alguem: a linha fica marcada.
          urgencia={(s) => (s.nao_lida ? 'warning' : null)}
          classeLinha={(s) => (s.nao_lida ? 'rh-solicitacao-nao-lida' : '')}
          acoesLinha={(s) => (
            <div className="rh-acoes-icones rh-solicitacoes-acoes">
              <AcaoIconePessoal rotulo="Abrir" icone={HiOutlineEye} solicitacaoId={s.id}
                onClick={() => selecionarDetalhe(s)} />
              {s.tipo === 'JORNADA' && ['ABERTA', 'APROVADA'].includes(s.situacao) && onAbrirApuracao ? (
                <AcaoIconePessoal rotulo={ehPagamentoPorSolicitacao(s) ? 'Conferir pagamento' : 'Conferir jornada'} icone={HiOutlineClipboardDocumentCheck}
                  solicitacaoId={s.id} onClick={() => onAbrirApuracao(s)} />
              ) : null}
              {podeDecidir
                  && (s.tipo !== 'EVENTO_RECORRENTE' || podeDecidirEventoRecorrente)
                  && s.situacao === 'ABERTA'
                  && s.tipo !== 'JORNADA' ? (
                <>
                  {s.tipo !== 'ALTERACAO_SALARIAL' || podeAprovarSalario ? (
                    <AcaoIconePessoal
                      rotulo={s.subtipo === 'RETORNO_AFASTAMENTO' ? 'Registrar ciência' : 'Aprovar'}
                      icone={HiOutlineCheck} variant="primary" solicitacaoId={s.id}
                      onClick={() => decidir(s, 'aprovar')} />
                  ) : (
                    <span className="text-xs opacity-70">Aguardando a Diretoria</span>
                  )}
                  <AcaoIconePessoal rotulo="Devolver" icone={HiOutlineArrowUturnLeft}
                    solicitacaoId={s.id} onClick={() => decidir(s, 'devolver')} />
                </>
              ) : null}
              {podeAbrir && s.situacao === 'RASCUNHO' && s.tipo !== 'JORNADA' ? (
                <AcaoIconePessoal rotulo="Enviar" icone={HiOutlinePaperAirplane} variant="primary"
                  solicitacaoId={s.id} onClick={() => enviarAoDp(s)} />
              ) : null}
              {podeAbrir && s.situacao === 'REJEITADA' && s.tipo !== 'JORNADA' ? (
                <AcaoIconePessoal rotulo="Reenviar" icone={HiOutlineArrowPath}
                  solicitacaoId={s.id} onClick={() => decidir(s, 'reenviar')} />
              ) : null}
              {podeAbrir && (Number(s.criada_por) === Number(user?.id) || user?.perfil === 'SUPERADMIN')
                && s.situacao === 'ABERTA' && s.tipo !== 'JORNADA' ? (
                <AcaoIconePessoal rotulo="Solicitar retorno" icone={HiOutlineArrowUturnRight}
                  solicitacaoId={s.id} onClick={() => solicitarRetorno(s)} />
              ) : null}
              {podeAbrir && s.tipo !== 'JORNADA' && ['RASCUNHO', 'ABERTA'].includes(s.situacao) ? (
                <AcaoIconePessoal rotulo="Cancelar" icone={HiOutlineXMark}
                  solicitacaoId={s.id} onClick={() => decidir(s, 'cancelar')} />
              ) : null}
            </div>
          )}
          larguraAcoes={220}
        />
      </div>

      {/*
        MODAL, e nao card no fim da pagina.
        O card abria ABAIXO da tabela — quem clicava em "Abrir" nao via nada acontecer sem rolar a
        tela, e concluia que o sistema tinha ignorado o clique. Mesmo defeito que ja tinha sido
        corrigido na aba de colaboradores; este aqui passou batido.
      */}
      {aberta?.dados_json?.fluxo_pagamento === 'PAGAMENTO_POR_SOLICITACAO' ? (
        <RhDpPagamentoModal key={aberta.id} solicitacaoId={aberta.id} local={aberta.obra}
          onFechar={fecharDetalhe} aoEnviar={() => { carregar(); aoMudar?.(); }} />
      ) : aberta ? (
        <OverlayModal
          rotulo={`${ROTULO_TIPO[aberta.tipo] || aberta.tipo} ${aberta.codigo || `#${aberta.id}`}`}
          largura={aberta.tipo === 'JORNADA' && onAbrirApuracao ? '1440px' : '1120px'}
          onFechar={fecharDetalhe}
        >
        <div data-modal="cabecalho" className="rh-local-modal-cabecalho">
          {faixaAvisos}
          <div className="app-page-header-row">
            <div>
              <h2 className="app-bloco-titulo">
                {ROTULO_TIPO[aberta.tipo] || aberta.tipo} · {aberta.codigo || `#${aberta.id}`}
              </h2>
              {/*
                R5: era `page-subtitle` solto. Como esta aba NAO e pagina, o texto nao tem
                PageHeader para onde ir — entao usa a classe de apoio de BLOCO do padrao (a
                mesma que o `BlocoConteudo` aplica em `descricao`), ancorada ao titulo a que
                pertence. O texto e o mesmo.
              */}
              {/* 05/09 — a justificativa é livre e pode ser longa: uma linha
                  com reticências, texto inteiro no `title`. */}
              <p
                className="app-bloco-lead"
                title={`${aberta.tipo === 'JORNADA' ? 'Jornada da equipe da obra' : aberta.colaborador?.nome || aberta.dados_json?.nome || 'Colaborador a admitir'}${aberta.justificativa ? ` — ${aberta.justificativa}` : ''}`}
              >
                {aberta.tipo === 'JORNADA' ? 'Jornada da equipe da obra' : aberta.colaborador?.nome || aberta.dados_json?.nome || 'Colaborador a admitir'}
                {aberta.justificativa ? ` — ${aberta.justificativa}` : ''}
              </p>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={fecharDetalhe}>Fechar</button>
          </div>
        </div>
        <div className="rh-modal-conteudo space-y-4">
          {aberta.tipo === 'JORNADA' && onAbrirApuracao && ['ABERTA', 'APROVADA'].includes(aberta.situacao) ? (
            <RhDpApuracao key={aberta.id} solicitacaoId={aberta.id} comoModal
              aoOcupado={(valor) => { conferenciaOcupada.current = valor; }}
              aoFechar={fecharDetalhe} aoConcluir={() => { carregar(); aoMudar?.(); }} />
          ) : null}

          <details open={aberta.tipo !== 'JORNADA'}>
          <summary>Dados da solicitação</summary>
          <section className="rh-solicitacao-resumo" aria-label="Dados da solicitacao de pessoal">
            <div><span>Situacao</span><strong>{ROTULO_SITUACAO[aberta.situacao] || aberta.situacao}</strong></div>
            <div><span>Colaborador</span><strong>{aberta.tipo === 'JORNADA' ? 'Equipe da obra' : aberta.colaborador?.nome || aberta.dados_json?.nome || 'A admitir'}</strong></div>
            <div><span>Obra</span><strong>{aberta.obra?.nome || aberta.colaborador?.obra?.nome || '—'}</strong></div>
            <div><span>Tipo</span><strong>{ROTULO_TIPO[aberta.tipo] || aberta.tipo}{aberta.subtipo ? ` · ${String(aberta.subtipo).replaceAll('_', ' ')}` : ''}</strong></div>
            <div><span>Aberta em</span><strong>{aberta.createdAt ? new Date(aberta.createdAt).toLocaleString('pt-BR') : '—'}</strong></div>
            <div><span>Ultima atualizacao</span><strong>{aberta.updatedAt ? new Date(aberta.updatedAt).toLocaleString('pt-BR') : '—'}</strong></div>
            {dadosOperacionais(aberta).map((campo) => (
              <div key={campo.chave}><span>{campo.rotulo}</span><strong>{campo.valor}</strong></div>
            ))}
            {aberta.justificativa ? (
              <div className="rh-solicitacao-resumo--largo"><span>Justificativa</span><strong>{aberta.justificativa}</strong></div>
            ) : null}
          </section>
          </details>
          {aberta.tipo === 'JORNADA' && !onAbrirApuracao && onAbrirListaJornadas ? (
            <div className="app-actionbar">
              <div>
                <strong>Consultar jornada</strong>
                <p className="app-bloco-lead">A jornada já foi registrada. Abra a lista de jornadas enviadas para acompanhar este envio.</p>
              </div>
              <button type="button" className="btn btn-outline" onClick={onAbrirListaJornadas}>
                Ir para Jornadas enviadas
              </button>
            </div>
          ) : null}

          {conferencia?.exigeConferencia ? (
            <div className="rh-pessoal-conferencia">
              <div>
                <strong>Atestados:</strong>{' '}
                {conferencia.entregues.length
                  ? conferencia.entregues.map((d) => d.nome).join(', ')
                  : <span className="opacity-70">nenhum ainda</span>}
              </div>
              {conferencia.aguardandoValidacao?.length ? (
                <div className="rh-pessoal-conferencia--aguarda">
                  <strong>Aguardando sua conferência:</strong>{' '}
                  {conferencia.aguardandoValidacao.map((d) => d.nome).join(', ')}
                </div>
              ) : null}
              {conferencia.faltando.length ? (
                <div className="rh-pessoal-conferencia--falta">
                  <strong>Nunca chegaram:</strong> {conferencia.faltando.map((d) => d.nome).join(', ')}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Os envolvidos enviam enquanto o pedido esta em tratamento — depois de decidido, nao. */}
          {['RASCUNHO', 'ABERTA', 'REJEITADA'].includes(aberta.situacao) ? (
            <form onSubmit={enviarDocumento} className="rh-pessoal-envio">
              <label className="form-field">
                <span className="form-label">Tipo do documento</span>
                <select
                  className="form-control"
                  value={envio.tipo}
                  onChange={(e) => setEnvio({ ...envio, tipo: e.target.value })}
                >
                  {/*
                    Aqui a primeira opcao NAO e rotulo: ela e uma escolha valida, e diz a
                    CONSEQUENCIA dela — anexo sem tipo nao entra na pasta do colaborador.
                    Trocar por "Selecione" apagaria a unica pista disso na tela.
                  */}
                  <option value="">Sem classificacao (nao entra na pasta)</option>
                  {tiposDocumento.map((tipo) => (
                    <option key={tipo.id} value={tipo.id}>
                      {tipo.nome}{tipo.obrigatorio ? ' (obrigatorio)' : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span className="form-label">Arquivo</span>
                <input
                  type="file"
                  className="form-control"
                  onChange={(e) => setEnvio({ ...envio, arquivo: e.target.files?.[0] || null })}
                />
              </label>
              <button type="submit" className="btn btn-primary" disabled={envio.enviando}>
                {envio.enviando ? 'Enviando...' : 'Enviar documento'}
              </button>
            </form>
          ) : null}

          <div>
            <h3 className="app-bloco-titulo mb-2">Documentos enviados pela obra</h3>
            {anexos.length === 0 ? (
              <p className="opacity-70">Nenhum documento anexado a esta solicitação.</p>
            ) : (
              <ul className="rh-pessoal-pedidos">
                {anexos.map((anexo) => (
                  <li key={anexo.id} className="rh-pessoal-pedido">
                    <div>
                      <div className="font-medium">{anexo.nome_original}</div>
                      <div className="text-xs opacity-70">
                        {anexo.tipo?.nome || 'Sem classificacao'}
                        {anexo.documento_gerado_id ? ' · ja esta na pasta do colaborador' : ''}
                      </div>
                      {anexo.motivo_recusa ? (
                        <div className="text-sm rh-pessoal-devolucao">Recusado: {anexo.motivo_recusa}</div>
                      ) : null}
                      {anexo.observacao_validacao ? (
                        <div className="text-sm opacity-80">Conferencia: {anexo.observacao_validacao}</div>
                      ) : null}
                    </div>
                    <div className="app-page-actions">
                      <span className={
                        anexo.situacao === 'VALIDADO' ? 'rh-chip rh-chip--evento'
                          : anexo.situacao === 'RECUSADO' ? 'rh-chip rh-chip--devolvida'
                            : 'rh-chip rh-chip--aberta'
                      }
                      >
                        {anexo.situacao}
                      </span>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => abrirAnexo(anexo)}>
                        Abrir arquivo
                      </button>
                      {/* Depois que virou documento, atestar de novo nao significa nada. */}
                      {podeDecidir && anexo.situacao !== 'VALIDADO' && !anexo.documento_gerado_id ? (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => decidirAnexo(anexo, true)}>
                          Atestar
                        </button>
                      ) : null}
                      {podeDecidir && anexo.situacao !== 'RECUSADO' && !anexo.documento_gerado_id ? (
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => decidirAnexo(anexo, false)}>
                          Recusar
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form className="space-y-2" onSubmit={async e => {
            e.preventDefault();
            if (travaComentario.current || !comentario.trim()) return;
            travaComentario.current = true; setComentando(true);
            try {
              await comentarRhSolicitacao(aberta.id, comentario);
              setComentario('');
              await abrirDetalhe(aberta);
              await carregar();
              avisar.sucesso('Comentário registrado.');
            }
            catch (erro) { avisar.erro(erro.message); }
            finally { travaComentario.current = false; setComentando(false); }
          }}>
            <label className="form-field"><span className="form-label">Comentário</span><textarea className="form-control" required maxLength={2000} value={comentario} onChange={e => setComentario(e.target.value)} /></label>
            <button className="btn btn-outline btn-sm" disabled={comentando || !comentario.trim()}>{comentando ? 'Enviando…' : 'Comentar'}</button>
          </form>
          {aberta.historicos?.length ? (
            <div>
              <h3 className="app-bloco-titulo mb-2">Histórico</h3>
              <ul className="rh-pessoal-historico">
                {aberta.historicos.map((h) => (
                  <li key={h.id}>
                    <div className="rh-pessoal-historico-meta">
                      {h.createdAt ? new Date(h.createdAt).toLocaleString('pt-BR') : '—'} · {h.usuario?.nome || `Usuario #${h.usuario_id || '—'}`} · {h.setor || '—'}
                    </div>
                    <strong>{h.acao}</strong>{h.descricao ? ` · ${h.descricao}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        </OverlayModal>
      ) : null}

      {elementoConfirmacao}
    </div>
  );
}
