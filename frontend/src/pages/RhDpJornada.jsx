import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import OverlayModal from '../components/ui/OverlayModal';
import {
  Avisos,
  BarraFiltros,
  BlocoConteudo,
  CelulaDupla,
  TabelaPadrao,
  alternarValorFiltro,
  useAvisos,
  useConfirmacao,
  useFiltrosVisiveis
} from '../components/padrao';
import { useAuth } from '../contexts/AuthContext';
import { getMinhasObras, getObras } from '../services/obras';
import {
  colaboradoresParaJornadaRh,
  decidirEdicaoJornadaRh,
  getEdicoesJornadaPendentesRh,
  getRhEmpresasGrupo,
  anexarNaRhSolicitacao,
  baixarModeloJornadaRh,
  importarJornadaPlanilhaRh,
  listarRhSolicitacoes,
  registrarJornadaRh,
  solicitarEdicaoJornadaRh
} from '../services/rhDp';
import { hasAnyExplicitPermissao, isBusinessAdmin } from '../utils/acessoProduto';
import { userHasSetorCapability } from '../utils/setor';
import { formatCurrencyInput, normalizeCurrencyTyping } from '../utils/formatters';

/**
 * JORNADA PELO FORMULARIO (Fase 4 do modulo DP, 26/08).
 *
 * Pedido do cliente: "um formulario onde a obra vai ter listados todos os colaboradores e podera
 * informar a jornada trabalhada, acrescimos e descontos, e o sistema faz os calculos".
 *
 * A LISTA VEM DO VINCULO, nao de `rh_colaboradores.obra_id`. Quem foi transferido depois continua
 * aparecendo na folha do mes em que ainda estava na obra — que e justamente o mes que se esta
 * pagando. E a primeira tela em que o historico de lotacao da Fase 1 paga o proprio custo.
 *
 * REENVIAR SUBSTITUI, nao soma. A obra preenche, ve um dia de falta errado e preenche de novo; se os
 * dois envios valessem, a apuracao somaria os dois e o colaborador apareceria com 60 dias num mes de
 * 30. O aviso disso esta na tela, e nao so no servico — quem preenche precisa saber antes.
 */

const COMPETENCIA_ATUAL = new Date().toISOString().slice(0, 7);
/* O 30 estava só no `useState`; virou nome para o painel de filtros poder
   distinguir "a pessoa escolheu 30" de "o sistema propôs 30" — sem isso o
   campo contaria como preenchido sempre e nunca sairia da faixa. */
const DIAS_BASE_PADRAO = 30;
const SEM_FILTRO = { obra: new Set(), empresa: new Set() };
const PERIODICIDADES = [
  { valor: 'SEMANAL', rotulo: 'Semanal' },
  { valor: 'QUINZENAL', rotulo: 'Quinzenal' },
  { valor: 'MENSAL', rotulo: 'Mensal' }
];

function limitesDaCompetencia(competencia) {
  const [ano, mes] = String(competencia || '').split('-').map(Number);
  if (!ano || !mes) return { inicio: '', fim: '' };
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return {
    inicio: `${competencia}-01`,
    fim: `${competencia}-${String(ultimoDia).padStart(2, '0')}`
  };
}

function periodoPadrao(competencia, periodicidade) {
  const limites = limitesDaCompetencia(competencia);
  if (periodicidade === 'SEMANAL') {
    return { inicio: limites.inicio, fim: `${competencia}-07`, diasBase: 7 };
  }
  if (periodicidade === 'QUINZENAL') {
    return { inicio: limites.inicio, fim: `${competencia}-15`, diasBase: 15 };
  }
  return { ...limites, diasBase: DIAS_BASE_PADRAO };
}

function diasInclusivos(inicio, fim) {
  const de = new Date(`${inicio}T00:00:00`);
  const ate = new Date(`${fim}T00:00:00`);
  if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime())) return 0;
  return Math.floor((ate.getTime() - de.getTime()) / 86400000) + 1;
}

function formatarData(valor) {
  if (!valor) return '—';
  const data = new Date(`${valor}T00:00:00`);
  return Number.isNaN(data.getTime()) ? valor : data.toLocaleDateString('pt-BR');
}

/** Dimensao de valor UNICO: o `ativos` guarda um conjunto, o servico recebe um id. */
function primeiroValor(conjunto) {
  return Array.from(conjunto || [])[0] || '';
}

function linhaVazia(colaborador) {
  const ja = colaborador.jornada_informada || {};
  const edicao = colaborador.edicao_jornada || null;
  return {
    colaborador_id: colaborador.colaborador_id,
    nome: colaborador.nome,
    empresa_grupo_id: colaborador.empresa_grupo_id,
    cargo: colaborador.cargo || '',
    tipo_vinculo: colaborador.tipo_vinculo,
    salario_base: colaborador.salario_base,
    forma_calculo_gerencial: colaborador.forma_calculo_gerencial || 'MENSAL',
    valor_diaria: colaborador.valor_diaria,
    pagamento_automatico_40_60: Boolean(colaborador.pagamento_automatico_40_60),
    mais_de_uma_obra: Boolean(ja.mais_de_uma_obra),
    aprovacao_distribuicao: ja.aprovacao_distribuicao || null,
    diasVinculados: Number(colaborador.dias_vinculados ?? 0),
    jaInformado: Boolean(colaborador.jornada_informada),
    jornadaLinhaId: colaborador.jornada_linha_id || null,
    edicaoId: edicao?.id || null,
    edicaoStatus: edicao?.status || null,
    aindaNaoComecou: Boolean(colaborador.ainda_nao_comecou),
    comecaEm: colaborador.comeca_em || null,
    dias_trabalhados: ja.dias_trabalhados ?? '',
    faltas: ja.faltas ?? '',
    adicionais: ja.adicionais ? formatCurrencyInput(String(ja.adicionais)) : '',
    descontos: ja.descontos_informados ? formatCurrencyInput(String(ja.descontos_informados)) : '',
    decimo_terceiro: ja.decimo_terceiro ? formatCurrencyInput(String(ja.decimo_terceiro)) : '',
    regime_pagamento: ja.regime_pagamento || 'NORMAL',
    servico_executado: ja.servico_executado || '',
    valor_empreitada: ja.valor_empreitada ? formatCurrencyInput(String(ja.valor_empreitada)) : '',
    observacoes: ja.observacoes || ''
  };
}

/**
 * SEMPRE ABA, nunca pagina (decisao do cliente D1, 02/09).
 *
 * `/rh-dp/jornada` virou redirecionamento para `/rh-dp/pessoal?aba=jornada`: a obra informa a
 * jornada e o DP apura — e o MESMO trabalho em sequencia, e trocar de pagina no meio era o que
 * fazia perder o fio. Com isso a antiga prop `comoAba` deixou de ter dois valores possiveis e
 * saiu, junto com o cabecalho proprio que ela escondia.
 *
 * Quem e dono do titulo e da faixa fixa aqui e o RhDpPessoal — este arquivo NAO monta `Pagina`
 * nem `PageHeader`. Duas faixas fixas empilhadas e exatamente o defeito que a R16 evita; excecao
 * declarada ao cabecalho padrao, valida para os componentes que so existem como aba.
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
  { id: 'diasBase', rotulo: 'Dias base do período' },
  { id: 'empresa', rotulo: 'Empresa do grupo' }
];

export default function RhDpJornada({ onAbrirApuracao }) {
  const { user } = useAuth();
  const [parametros, setParametros] = useSearchParams();
  const usuarioOperacionalDaObra = !isBusinessAdmin(user)
    && userHasSetorCapability(user, 'eh_setor_obra');
  const { avisos, avisar, fechar, limpar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  const [obras, setObras] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  // Empresa continua como recorte opcional. Obra e um campo explicito e
  // obrigatorio, pois sem ela nao existe jornada que possa ser montada.
  const [ativos, setAtivos] = useState(SEM_FILTRO);
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  /*
    ESTAS DUAS DECLARACOES MORAM AQUI, E NAO 25 LINHAS ABAIXO (06/09).

    Elas estavam DEPOIS do `useMemo` de `filtrosPreenchidos`, cujo array de
    dependencias le as duas. Array de dependencia e ARGUMENTO: o JavaScript
    o avalia ANTES de chamar o `useMemo`. Ler um `const` antes da declaracao
    e zona morta temporal, e o erro real era

        ReferenceError: Cannot access 'competencia' before initialization

    disparado na PRIMEIRA linha do corpo do render — antes de qualquer
    efeito, antes de qualquer requisicao. A tela nunca chegava a pedir dado
    nenhum, e por isso NENHUM estado de base fazia ela abrir.

    Veio do commit 8052bf2, que aplicou este mesmo bloco em 49 arquivos. So
    este ficou na ordem errada. Nem `vite build` nem o portao pegavam:
    ordem de declaracao e sintaxe valida, e o defeito so existe em execucao.
    Quem tranca isso agora e `scripts/provas/ordemDeDeclaracao.mjs`.
  */
  const [competencia, setCompetencia] = useState(COMPETENCIA_ATUAL);
  const [diasBase, setDiasBase] = useState(DIAS_BASE_PADRAO);
  const [periodicidade, setPeriodicidade] = useState('MENSAL');
  const [periodoInicio, setPeriodoInicio] = useState(
    () => periodoPadrao(COMPETENCIA_ATUAL, 'MENSAL').inicio
  );
  const [periodoFim, setPeriodoFim] = useState(
    () => periodoPadrao(COMPETENCIA_ATUAL, 'MENSAL').fim
  );

  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => {
      /* Competência e dias base NASCEM com o valor que o sistema propõe
         (mês corrente, 30 dias). O padrão não conta como preenchido: se
         contasse, ele revelaria de volta, a cada abertura, exatamente o
         campo que a pessoa tirou da faixa. */
      if (filtro.id === 'competencia') return String(competencia ?? '') !== COMPETENCIA_ATUAL;
      if (filtro.id === 'diasBase') return String(diasBase ?? '') !== String(DIAS_BASE_PADRAO);
      return (ativos[filtro.id]?.size || 0) > 0;
    }).map((filtro) => filtro.id),
    [competencia, diasBase, ativos]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:rh-dp-jornada:colaboradores', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => {
      /* Competência e dias base voltam ao PADRÃO, não a vazio: a lista é
         montada a partir dos dois, e um campo escondido em branco deixaria
         a tela sem conseguir montar nada. Vazio aqui é o valor do sistema. */
      if (id === 'competencia') { setCompetencia(COMPETENCIA_ATUAL); return; }
      if (id === 'diasBase') { setDiasBase(DIAS_BASE_PADRAO); return; }
      setAtivos((atuais) => ({ ...atuais, [id]: new Set() }));
    }
  });

  const [linhas, setLinhas] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [processandoEdicao, setProcessandoEdicao] = useState(null);
  const [edicoesPendentes, setEdicoesPendentes] = useState([]);
  const [jornadasEnviadas, setJornadasEnviadas] = useState([]);
  const [carregandoEnviadas, setCarregandoEnviadas] = useState(false);
  const [jornadaEnviada, setJornadaEnviada] = useState(null);
  const [anexandoFichas, setAnexandoFichas] = useState(false);
  const [baixandoModelo, setBaixandoModelo] = useState(false);
  const [modalImportacaoAberto, setModalImportacaoAberto] = useState(false);
  const [planilhaImportacao, setPlanilhaImportacao] = useState(null);
  const [fichasImportacao, setFichasImportacao] = useState([]);
  const [importandoPlanilha, setImportandoPlanilha] = useState(false);
  const inputFichasRef = useRef(null);

  const secaoDaUrl = parametros.get('jornada_secao');
  const secaoAtiva = secaoDaUrl === 'enviadas' ? 'enviadas' : 'enviar';

  const mudarSecao = useCallback((secao) => {
    setParametros((atuais) => {
      const proximos = new URLSearchParams(atuais);
      if (secao === 'enviadas') proximos.set('jornada_secao', 'enviadas');
      else proximos.delete('jornada_secao');
      return proximos;
    });
  }, [setParametros]);

  const obra = useMemo(() => primeiroValor(ativos.obra), [ativos]);
  const empresa = useMemo(() => primeiroValor(ativos.empresa), [ativos]);

  const podeEnviar = hasAnyExplicitPermissao(user, ['rh_dp.solicitacoes.abrir']);
  const podeDecidirEdicao = hasAnyExplicitPermissao(user, ['rh_dp.solicitacoes.decidir']);

  function mudarCompetencia(valor) {
    setJornadaEnviada(null);
    setCompetencia(valor);
    const proximo = periodoPadrao(valor, periodicidade);
    setPeriodoInicio(proximo.inicio);
    setPeriodoFim(proximo.fim);
    setDiasBase(proximo.diasBase);
    setLinhas([]);
  }

  function mudarPeriodicidade(valor) {
    setJornadaEnviada(null);
    setPeriodicidade(valor);
    const proximo = periodoPadrao(competencia, valor);
    setPeriodoInicio(proximo.inicio);
    setPeriodoFim(proximo.fim);
    setDiasBase(proximo.diasBase);
    setLinhas([]);
  }

  function podeEditarLinha(linha) {
    return !linha.jaInformado || podeDecidirEdicao || linha.edicaoStatus === 'AUTORIZADA';
  }

  const carregarEdicoesPendentes = useCallback(async () => {
    if (!podeDecidirEdicao) {
      setEdicoesPendentes([]);
      return;
    }
    try {
      const lista = await getEdicoesJornadaPendentesRh();
      setEdicoesPendentes(Array.isArray(lista) ? lista : []);
    } catch (error) {
      setEdicoesPendentes([]);
    }
  }, [podeDecidirEdicao]);

  useEffect(() => {
    carregarEdicoesPendentes();
  }, [carregarEdicoesPendentes]);

  const carregarJornadasEnviadas = useCallback(async () => {
    setCarregandoEnviadas(true);
    limpar();
    try {
      const lista = await listarRhSolicitacoes({ tipo: 'JORNADA' });
      setJornadasEnviadas(Array.isArray(lista) ? lista : []);
    } catch (error) {
      setJornadasEnviadas([]);
      avisar.erro(error.message || 'Não foi possível carregar as jornadas enviadas.');
    } finally {
      setCarregandoEnviadas(false);
    }
  }, [avisar, limpar]);

  useEffect(() => {
    if (secaoAtiva === 'enviadas') carregarJornadasEnviadas();
  }, [secaoAtiva, carregarJornadasEnviadas]);

  useEffect(() => {
    (async () => {
      try {
        const listaObras = await (
          usuarioOperacionalDaObra ? getMinhasObras({ escopo: 'OBRAS' }) : getObras()
        );
        const obrasCarregadas = Array.isArray(listaObras) ? listaObras : [];
        setObras(obrasCarregadas);
        if (obrasCarregadas.length === 1) {
          setAtivos((atuais) => (
            atuais.obra?.size
              ? atuais
              : { ...atuais, obra: new Set([String(obrasCarregadas[0].id)]) }
          ));
        }
      } catch (error) {
        avisar.erro(error.message || 'Não foi possível carregar as obras.');
      }

      /**
       * A empresa do grupo e OPCIONAL nesta tela, e nem todo usuario pode le-la.
       *
       * Buscar junto das obras fazia a falta de `rh_dp.empresas.gerenciar` virar faixa vermelha no
       * topo, dando a impressao de que a pagina falhou — quando so um campo opcional nao carregou.
       * Encontrado abrindo a tela no navegador; nenhuma suite pegaria, porque suite nao tem 403 de
       * permissao no meio do caminho.
       */
      try {
        const listaEmpresas = await getRhEmpresasGrupo();
        setEmpresas(Array.isArray(listaEmpresas) ? listaEmpresas : []);
      } catch (error) {
        setEmpresas([]);
      }
    })();
  }, [avisar, usuarioOperacionalDaObra]);

  const carregar = useCallback(async () => {
    if (!obra || !competencia || !periodoInicio || !periodoFim) {
      avisar.erro('Escolha a obra, a competência e o período da jornada.');
      return;
    }
    const limites = limitesDaCompetencia(competencia);
    const quantidadeDias = diasInclusivos(periodoInicio, periodoFim);
    if (periodoInicio < limites.inicio || periodoFim > limites.fim || periodoFim < periodoInicio) {
      avisar.erro('O período precisa estar dentro da competência selecionada.');
      return;
    }
    if ((periodicidade === 'SEMANAL' && quantidadeDias > 7)
        || (periodicidade === 'QUINZENAL' && quantidadeDias > 16)) {
      avisar.erro(`O período ${periodicidade === 'SEMANAL' ? 'semanal' : 'quinzenal'} informado é maior que o permitido.`);
      return;
    }
    if (periodicidade === 'MENSAL'
        && (periodoInicio !== limites.inicio || periodoFim !== limites.fim)) {
      avisar.erro('A jornada mensal deve abranger a competência inteira.');
      return;
    }
    setCarregando(true);
    limpar();
    try {
      const lista = await colaboradoresParaJornadaRh({
        obra_id: obra,
        competencia,
        periodicidade,
        periodo_inicio: periodoInicio,
        periodo_fim: periodoFim
      });
      setLinhas((Array.isArray(lista) ? lista : []).map(linhaVazia));
      const comecaram = (Array.isArray(lista) ? lista : []).filter((c) => !c.ainda_nao_comecou);
      const futuros = (Array.isArray(lista) ? lista : []).filter((c) => c.ainda_nao_comecou);

      if (!comecaram.length && futuros.length) {
        // A resposta "nenhum colaborador" e tecnicamente certa e pratica errada: quem acabou de
        // lotar alguem nesta obra conclui que a lotacao nao funcionou.
        avisar.alerta(
          'Ninguem trabalhou nesta obra neste período, mas '
          + `${futuros.length} colaborador(es) comecam depois — eles aparecem abaixo, sem campos.`
        );
      } else if (!comecaram.length) {
        avisar.alerta('Nenhum colaborador esteve nesta obra neste período.');
      }
    } catch (error) {
      avisar.erro(error.message || 'Não foi possível montar a lista.');
      setLinhas([]);
    } finally {
      setCarregando(false);
    }
  }, [obra, competencia, periodicidade, periodoInicio, periodoFim, avisar, limpar]);

  function alterar(indice, campo, valor) {
    setLinhas((atuais) => atuais.map((linha, i) => {
      if (i !== indice) return linha;
      return { ...linha, [campo]: valor };
    }));
  }

  /** Preenche o período de uma vez — o caso comum é quase todo mundo ter trabalhado todos os dias. */
  function preencherMesCheio() {
    setLinhas((atuais) => atuais.map((linha) => (
      linha.aindaNaoComecou || !podeEditarLinha(linha) ? linha : {
      ...linha,
      dias_trabalhados: linha.dias_trabalhados === ''
        ? String(Math.min(Number(diasBase), linha.diasVinculados))
        : linha.dias_trabalhados,
      faltas: linha.faltas === '' ? '0' : linha.faltas
      }
    )));
  }

  // `alterar` age por POSICAO na lista; a tabela precisa do indice junto do
  // registro para os controles inline continuarem escrevendo na linha certa.
  const linhasTabela = useMemo(
    () => linhas.map((linha, indice) => ({ ...linha, __indice: indice })),
    [linhas]
  );

  const jaInformados = useMemo(() => linhas.filter((l) => l.jaInformado).length, [linhas]);

  const comProblema = useMemo(() => linhas.filter((linha) => {
    const dias = Number(linha.dias_trabalhados || 0);
    const faltas = Number(linha.faltas || 0);
    const limite = Math.min(Number(diasBase), linha.diasVinculados);
    return dias > limite || faltas > limite;
  }), [linhas, diasBase]);

  const dimensoesFiltro = useMemo(() => {
    const dimensoes = [];
    // A empresa do grupo so aparece para quem consegue le-la — sem permissao
    // a lista vem vazia e o recorte nao existe (era um select opcional).
    if (empresas.length) {
      dimensoes.push({
        id: 'empresa',
        rotulo: 'Empresa do grupo',
        unico: true,
        opcoes: empresas.map((e) => ({ valor: e.id, rotulo: e.nome }))
      });
    }
    return dimensoes;
  }, [empresas]);

  async function solicitarLiberacaoEdicao(linha) {
    const { ok } = await confirmar({
      titulo: 'Solicitar edição ao DP',
      mensagem: `A jornada de ${linha.nome} neste período já foi enviada. `
        + 'Deseja pedir ao Departamento Pessoal uma autorização pontual para corrigi-la?',
      rotuloConfirmar: 'Solicitar autorização'
    });
    if (!ok) return;
    setProcessandoEdicao(linha.colaborador_id);
    limpar();
    try {
      const solicitacao = await solicitarEdicaoJornadaRh({
        importacao_linha_id: linha.jornadaLinhaId,
        motivo: 'Correção solicitada pela obra para a jornada enviada.'
      });
      setLinhas((atuais) => atuais.map((item) => (
        item.colaborador_id === linha.colaborador_id
          ? { ...item, edicaoId: solicitacao.id, edicaoStatus: solicitacao.status }
          : item
      )));
      avisar.sucesso('Solicitação enviada ao Departamento Pessoal.');
    } catch (error) {
      avisar.erro(error.message || 'Não foi possível solicitar a edição.');
    } finally {
      setProcessandoEdicao(null);
    }
  }

  async function decidirLiberacaoEdicao(linha, aprovar) {
    const { ok } = await confirmar({
      titulo: aprovar ? 'Autorizar edição da jornada' : 'Negar edição da jornada',
      mensagem: aprovar
        ? `Liberar uma correção da jornada de ${linha.nome} neste período? A autorização será consumida no próximo envio.`
        : `Negar a solicitação de correção da jornada de ${linha.nome}?`,
      rotuloConfirmar: aprovar ? 'Autorizar edição' : 'Negar solicitação',
      perigo: !aprovar
    });
    if (!ok) return;
    setProcessandoEdicao(linha.colaborador_id);
    limpar();
    try {
      const solicitacao = await decidirEdicaoJornadaRh(linha.edicaoId, {
        aprovar,
        motivo: aprovar ? 'Edição autorizada pelo Departamento Pessoal.' : 'Edição não autorizada pelo Departamento Pessoal.'
      });
      setLinhas((atuais) => atuais.map((item) => (
        item.colaborador_id === linha.colaborador_id
          ? { ...item, edicaoStatus: solicitacao.status }
          : item
      )));
      avisar.sucesso(aprovar ? 'Edição liberada para um novo envio.' : 'Solicitação de edição negada.');
      await carregarEdicoesPendentes();
    } catch (error) {
      avisar.erro(error.message || 'Não foi possível decidir a solicitação.');
    } finally {
      setProcessandoEdicao(null);
    }
  }

  async function decidirPedidoPendente(pedido, aprovar) {
    const nome = pedido.colaborador?.nome || `colaborador #${pedido.colaborador_id}`;
    const { ok } = await confirmar({
      titulo: aprovar ? 'Autorizar edição da jornada' : 'Negar edição da jornada',
      mensagem: `${aprovar ? 'Autorizar' : 'Negar'} a correção solicitada para ${nome}, `
        + `no período de ${formatarData(pedido.periodo_inicio)} a ${formatarData(pedido.periodo_fim)}?`,
      rotuloConfirmar: aprovar ? 'Autorizar edição' : 'Negar solicitação',
      perigo: !aprovar
    });
    if (!ok) return;
    setProcessandoEdicao(`pedido-${pedido.id}`);
    limpar();
    try {
      await decidirEdicaoJornadaRh(pedido.id, {
        aprovar,
        motivo: aprovar ? 'Edição autorizada pelo Departamento Pessoal.' : 'Edição não autorizada pelo Departamento Pessoal.'
      });
      await carregarEdicoesPendentes();
      setLinhas((atuais) => atuais.map((linha) => (
        linha.edicaoId === pedido.id
          ? { ...linha, edicaoStatus: aprovar ? 'AUTORIZADA' : 'NEGADA' }
          : linha
      )));
      avisar.sucesso(aprovar ? 'Edição autorizada.' : 'Solicitação negada.');
    } catch (error) {
      avisar.erro(error.message || 'Não foi possível decidir a solicitação.');
    } finally {
      setProcessandoEdicao(null);
    }
  }

  async function enviar(evento) {
    evento.preventDefault();
    limpar();

    /**
     * Quem ainda nao comecou NAO vai no envio.
     *
     * `registrarJornada` recusa quem nao esteve na obra na competencia. Eles aparecem na lista para
     * a pessoa VER que a lotacao existe — nao para lancar jornada de um mes em que o colaborador
     * nem tinha sido admitido.
     */
    const preenchidas = linhas
      .filter((l) => !l.aindaNaoComecou)
      .filter((l) => podeEditarLinha(l))
      .filter((l) => (
        l.dias_trabalhados !== ''
        || l.faltas !== ''
        || Number(normalizeCurrencyTyping(l.adicionais) || 0) > 0
        || Number(normalizeCurrencyTyping(l.descontos) || 0) > 0
        || Number(normalizeCurrencyTyping(l.decimo_terceiro) || 0) > 0
        || l.regime_pagamento === 'EMPREITADA'
      ));
    if (!preenchidas.length) {
      avisar.erro('Informe a jornada de um colaborador novo ou solicite ao DP a edição de uma linha já enviada.');
      return;
    }

    if (comProblema.length) {
      avisar.erro(
        'Os dias informados ou as faltas ultrapassam o limite do vinculo: '
        + `${comProblema.map((l) => `${l.nome} (máximo ${Math.min(Number(diasBase), l.diasVinculados)})`).join(', ')}.`
      );
      return;
    }

    const ajusteSemObservacao = preenchidas.find((linha) => (
      linha.regime_pagamento !== 'EMPREITADA'
      && linha.forma_calculo_gerencial === 'MENSAL'
      && (Number(normalizeCurrencyTyping(linha.adicionais) || 0) > 0
        || Number(normalizeCurrencyTyping(linha.descontos) || 0) > 0)
      && !String(linha.observacoes || '').trim()
    ));
    if (ajusteSemObservacao) {
      avisar.erro(`Informe a observação do acréscimo ou desconto de ${ajusteSemObservacao.nome}.`);
      return;
    }
    const empreitadaIncompleta = preenchidas.find((linha) => (
      linha.regime_pagamento === 'EMPREITADA'
      && (!String(linha.servico_executado || '').trim()
        || Number(normalizeCurrencyTyping(linha.valor_empreitada) || 0) <= 0)
    ));
    if (empreitadaIncompleta) {
      avisar.erro(`Informe o serviço executado e o valor da empreitada de ${empreitadaIncompleta.nome}.`);
      return;
    }

    const substituicoes = preenchidas.filter((linha) => linha.jaInformado);
    if (substituicoes.length) {
      const { ok } = await confirmar({
        titulo: 'Substituir a jornada já informada',
        mensagem: `O envio substituirá a jornada anterior de ${substituicoes.length} colaborador(es) `
          + 'neste mesmo período. A versão anterior ficará no histórico. Enviar mesmo assim?',
        rotuloConfirmar: 'Substituir e enviar'
      });
      if (!ok) return;
    }

    setJornadaEnviada(null);
    setSalvando(true);
    try {
      const resultado = await registrarJornadaRh({
        competencia,
        periodicidade,
        periodo_inicio: periodoInicio,
        periodo_fim: periodoFim,
        obra_id: Number(obra),
        empresa_grupo_id: empresa ? Number(empresa) : undefined,
        dias_base: Number(diasBase),
        linhas: preenchidas.map((l) => ({
          colaborador_id: l.colaborador_id,
          mais_de_uma_obra: Boolean(l.mais_de_uma_obra),
          dias_trabalhados: Number(l.dias_trabalhados || 0),
          finais_semana_feriados: 0,
          faltas: Number(l.faltas || 0),
          adicionais: normalizeCurrencyTyping(l.adicionais) || 0,
          descontos: normalizeCurrencyTyping(l.descontos) || 0,
          decimo_terceiro: normalizeCurrencyTyping(l.decimo_terceiro) || 0,
          regime_pagamento: l.regime_pagamento,
          servico_executado: l.regime_pagamento === 'EMPREITADA' ? l.servico_executado : undefined,
          valor_empreitada: l.regime_pagamento === 'EMPREITADA'
            ? (normalizeCurrencyTyping(l.valor_empreitada) || 0)
            : 0,
          observacoes: l.observacoes || undefined
        }))
      });
      setJornadaEnviada(resultado?.solicitacao || null);
      /**
       * A confirmacao vem DEPOIS de remontar a lista, e nao antes.
       *
       * Defeito real do fluxo antigo: `setAviso(sucesso)` era seguido de `carregar()`, que comeca
       * limpando `erro`/`aviso` — a faixa verde do envio bem-sucedido era apagada no mesmo tique,
       * antes de qualquer pintura. Quem enviava a jornada nao via confirmacao nenhuma. Trocar a
       * ordem mantem o mesmo texto e o faz aparecer.
       */
      await carregar();
      avisar.sucesso(
        `Jornada de ${preenchidas.length} colaborador(es) registrada para o período. `
        + 'O Departamento Pessoal pode gerar a apuração desta competência.'
      );
    } catch (error) {
      avisar.erro(error.message || 'Não foi possível registrar a jornada.');
    } finally {
      setSalvando(false);
    }
  }

  async function anexarComprovantesDaJornada(evento) {
    const arquivos = Array.from(evento.target.files || []);
    evento.target.value = '';
    if (!jornadaEnviada?.id || !arquivos.length || anexandoFichas) return;

    setAnexandoFichas(true);
    limpar();
    let enviados = 0;
    try {
      for (const arquivo of arquivos) {
        await anexarNaRhSolicitacao(jornadaEnviada.id, {}, arquivo);
        enviados += 1;
      }
      avisar.sucesso(
        `${enviados} arquivo(s) anexado(s) à Jornada #${jornadaEnviada.id}. `
        + 'As fichas e fotos da empreitada já estão disponíveis no detalhe da solicitação.'
      );
    } catch (error) {
      avisar.erro(
        enviados
          ? `${enviados} arquivo(s) foram anexados, mas o envio não foi concluído: ${error.message}`
          : (error.message || 'Não foi possível anexar os comprovantes da jornada.')
      );
    } finally {
      setAnexandoFichas(false);
    }
  }

  function dadosDoPeriodo() {
    return {
      competencia,
      periodicidade,
      periodo_inicio: periodoInicio,
      periodo_fim: periodoFim,
      obra_id: Number(obra),
      empresa_grupo_id: empresa ? Number(empresa) : undefined,
      dias_base: Number(diasBase)
    };
  }

  async function baixarModeloDaJornada() {
    if (!obra) {
      avisar.erro('Selecione a obra antes de baixar o modelo da jornada.');
      return;
    }
    setBaixandoModelo(true);
    limpar();
    try {
      const { blob, filename } = await baixarModeloJornadaRh(dadosDoPeriodo());
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      avisar.sucesso('Modelo gerado com os colaboradores ativos da obra selecionada.');
    } catch (error) {
      avisar.erro(error.message || 'Não foi possível baixar o modelo da jornada.');
    } finally {
      setBaixandoModelo(false);
    }
  }

  function fecharModalImportacao() {
    if (importandoPlanilha) return;
    setModalImportacaoAberto(false);
    setPlanilhaImportacao(null);
    setFichasImportacao([]);
  }

  async function importarPlanilhaDaJornada(evento) {
    evento.preventDefault();
    if (!obra) {
      avisar.erro('Selecione a obra antes de importar a jornada.');
      return;
    }
    if (!planilhaImportacao) {
      avisar.erro('Selecione a planilha preenchida da jornada.');
      return;
    }

    setImportandoPlanilha(true);
    limpar();
    try {
      const resultado = await importarJornadaPlanilhaRh({
        dados: dadosDoPeriodo(),
        planilha: planilhaImportacao,
        fichas: fichasImportacao
      });
      setJornadaEnviada(resultado?.solicitacao || null);
      setModalImportacaoAberto(false);
      setPlanilhaImportacao(null);
      setFichasImportacao([]);
      await carregar();
      const quantidade = resultado?.importacao?.quantidade_registros || resultado?.linhas?.length || 0;
      const anexadas = Number(resultado?.fichas_anexadas || 0);
      avisar.sucesso(
        `Jornada importada para ${quantidade} colaborador(es).`
        + (anexadas ? ` ${anexadas} ficha(s) de ponto anexada(s).` : '')
      );
      if (resultado?.fichas_com_erro?.length) {
        avisar.erro(`A jornada foi enviada, mas algumas fichas não foram anexadas: ${resultado.fichas_com_erro.join(' | ')}`);
      }
    } catch (error) {
      avisar.erro(error.message || 'Não foi possível importar a jornada.');
    } finally {
      setImportandoPlanilha(false);
    }
  }

  const abasJornada = (
    <div className="rh-pessoal-abas rh-jornada-subabas" role="tablist" aria-label="Operações de jornada">
      <button
        type="button"
        role="tab"
        aria-selected={secaoAtiva === 'enviar'}
        className={`rh-pessoal-aba${secaoAtiva === 'enviar' ? ' rh-pessoal-aba--ativa' : ''}`}
        onClick={() => mudarSecao('enviar')}
      >
        Enviar jornada
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={secaoAtiva === 'enviadas'}
        className={`rh-pessoal-aba${secaoAtiva === 'enviadas' ? ' rh-pessoal-aba--ativa' : ''}`}
        onClick={() => mudarSecao('enviadas')}
      >
        Jornadas enviadas
      </button>
    </div>
  );

  if (secaoAtiva === 'enviadas') {
    return (
      <div className="app-pagina">
        <Avisos avisos={avisos} aoFechar={fechar} />
        {abasJornada}
        <BlocoConteudo
          titulo="Jornadas enviadas"
          descricao={usuarioOperacionalDaObra
            ? 'Jornadas das obras às quais você tem acesso.'
            : 'Jornadas enviadas por todas as obras para o Departamento Pessoal.'}
          contagem={`${jornadasEnviadas.length} registro(s)`}
        >
          <div className="app-actionbar">
            <button
              type="button"
              className="btn btn-outline"
              onClick={carregarJornadasEnviadas}
              disabled={carregandoEnviadas}
            >
              {carregandoEnviadas ? 'Atualizando...' : 'Atualizar lista'}
            </button>
          </div>
          <TabelaPadrao
            colunas={[
              {
                id: 'competencia',
                titulo: 'Competência',
                tipo: 'identidade',
                noCard: 'titulo',
                render: (item) => item.dados_json?.competencia || '—'
              },
              {
                id: 'obra',
                titulo: 'Obra',
                tipo: 'texto',
                render: (item) => item.obra?.nome || `Obra #${item.obra_id}`
              },
              {
                id: 'periodo',
                titulo: 'Período',
                tipo: 'texto',
                render: (item) => `${formatarData(item.dados_json?.periodo_inicio)} a ${formatarData(item.dados_json?.periodo_fim)}`
              },
              {
                id: 'periodicidade',
                titulo: 'Periodicidade',
                tipo: 'badge',
                render: (item) => PERIODICIDADES.find(
                  (opcao) => opcao.valor === item.dados_json?.periodicidade
                )?.rotulo || item.dados_json?.periodicidade || '—'
              },
              {
                id: 'colaboradores',
                titulo: 'Colaboradores',
                tipo: 'numero',
                render: (item) => item.dados_json?.total_colaboradores ?? '—'
              },
              {
                id: 'situacao',
                titulo: 'Situação',
                tipo: 'status',
                render: (item) => (
                  <span className={`rh-chip ${item.situacao === 'ABERTA' ? 'rh-chip--aberta' : 'rh-chip--evento'}`}>
                    {{
                      ABERTA: 'Aguardando apuração',
                      APROVADA: 'Apuração gerada',
                      REJEITADA: 'Devolvida',
                      CANCELADA: 'Cancelada'
                    }[item.situacao] || item.situacao}
                  </span>
                )
              },
              {
                id: 'envio',
                titulo: 'Enviada em',
                tipo: 'data',
                render: (item) => (item.createdAt ? new Date(item.createdAt).toLocaleString('pt-BR') : '—')
              }
            ]}
            itens={jornadasEnviadas}
            getId={(item) => item.id}
            storageKey="tabela:rh-dp-jornada:enviadas"
            rotuloRolagem="Jornadas enviadas"
            carregando={carregandoEnviadas}
            vazio="Nenhuma jornada enviada encontrada."
            acoesLinha={onAbrirApuracao ? (item) => (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => onAbrirApuracao(item)}
              >
                Ir para Apuração
              </button>
            ) : undefined}
            larguraAcoes={onAbrirApuracao ? 150 : undefined}
          />
        </BlocoConteudo>
        {elementoConfirmacao}
      </div>
    );
  }

  return (
    <div className="app-pagina">
      <Avisos avisos={avisos} aoFechar={fechar} />
      {abasJornada}

      {podeDecidirEdicao && edicoesPendentes.length ? (
        <BlocoConteudo
          titulo="Edições de jornada aguardando o DP"
          descricao="A autorização é pontual e será consumida quando a obra reenviar a linha corrigida."
          contagem={`${edicoesPendentes.length} pendente(s)`}
        >
          <TabelaPadrao
            colunasConfiguraveis={false}
            colunas={[
              {
                id: 'colaborador',
                titulo: 'Colaborador',
                tipo: 'identidade',
                render: (item) => (
                  <CelulaDupla
                    principal={item.colaborador?.nome || `Colaborador #${item.colaborador_id}`}
                    sub={item.solicitadaPor?.nome ? `solicitado por ${item.solicitadaPor.nome}` : ''}
                  />
                )
              },
              {
                id: 'obra',
                titulo: 'Obra',
                tipo: 'texto',
                render: (item) => item.obra?.nome || `Obra #${item.obra_id}`
              },
              {
                id: 'periodo',
                titulo: 'Período',
                tipo: 'texto',
                render: (item) => `${formatarData(item.periodo_inicio)} a ${formatarData(item.periodo_fim)}`
              },
              {
                id: 'motivo',
                titulo: 'Motivo',
                tipo: 'texto',
                render: (item) => item.motivo
              },
              {
                id: 'acoes',
                titulo: 'Ações',
                tipo: 'acao',
                render: (item) => (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={processandoEdicao === `pedido-${item.id}`}
                      onClick={() => decidirPedidoPendente(item, true)}
                    >
                      Autorizar
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={processandoEdicao === `pedido-${item.id}`}
                      onClick={() => decidirPedidoPendente(item, false)}
                    >
                      Negar
                    </button>
                  </div>
                )
              }
            ]}
            itens={edicoesPendentes}
            getId={(item) => item.id}
            vazio="Nenhuma edição aguardando decisão."
          />
        </BlocoConteudo>
      ) : null}

      {/*
        B2 — um primário por tela, e a hierarquia SEGUE O FOCO (mesmo padrão
        do piloto aprovado em Parceiros). Enquanto a lista não foi montada, o
        trabalho é escolher obra e competência: o recorte é o bloco primário.
        Montada a lista, o primário passa para ela (abaixo) e este volta a
        secundário. Antes o recorte nunca era primário, e a aba abria sem
        bloco primário nenhum — o revisor pegou isso justamente porque as
        variantes passaram a ser medidas.
      */}
      <BlocoConteudo
        titulo="Jornada da obra"
        descricao="Informe dias trabalhados, faltas apenas para registro, acréscimos, descontos e 13º. Para empreitada, selecione o regime e registre o serviço e o valor; anexos podem ser enviados após a jornada."
        variante={linhas.length ? undefined : 'primario'}
        cor={linhas.length ? undefined : 'var(--c-primary)'}
        acoes={(
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={!obra || baixandoModelo}
              onClick={baixarModeloDaJornada}
            >
              {baixandoModelo ? 'Gerando modelo...' : 'Baixar modelo da jornada'}
            </button>
            {podeEnviar ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={!obra}
                onClick={() => setModalImportacaoAberto(true)}
              >
                Importar jornada
              </button>
            ) : null}
          </div>
        )}
      >
        {/* Obra e requisito operacional para montar a jornada, portanto fica
            sempre visivel como campo. Empresa permanece um recorte opcional. */}
        <BarraFiltros
          campos={[
            {
              id: 'obra',
              rotulo: 'Obra *',
              tipo: 'select',
              valor: obra,
              aoMudar: (valor) => {
                setJornadaEnviada(null);
                setAtivos((atuais) => ({
                  ...atuais,
                  obra: valor ? new Set([String(valor)]) : new Set()
                }));
                setLinhas([]);
              },
              placeholder: obras.length ? 'Selecione a obra' : 'Nenhuma obra vinculada',
              opcoes: obras.map((item) => ({
                valor: item.id,
                rotulo: item.codigo ? `${item.codigo} - ${item.nome}` : item.nome
              })),
              required: true,
              disabled: obras.length === 0
            },
            {
              id: 'competencia',
              rotulo: 'Competência',
              tipo: 'month',
              valor: competencia,
              aoMudar: mudarCompetencia
            },
            {
              id: 'periodicidade',
              rotulo: 'Periodicidade *',
              tipo: 'select',
              valor: periodicidade,
              aoMudar: mudarPeriodicidade,
              opcoes: PERIODICIDADES,
              required: true
            },
            {
              id: 'periodoInicio',
              rotulo: 'Início do período *',
              tipo: 'date',
              valor: periodoInicio,
              aoMudar: (valor) => { setJornadaEnviada(null); setPeriodoInicio(valor); setLinhas([]); },
              min: limitesDaCompetencia(competencia).inicio,
              max: limitesDaCompetencia(competencia).fim
            },
            {
              id: 'periodoFim',
              rotulo: 'Fim do período *',
              tipo: 'date',
              valor: periodoFim,
              aoMudar: (valor) => { setJornadaEnviada(null); setPeriodoFim(valor); setLinhas([]); },
              min: periodoInicio || limitesDaCompetencia(competencia).inicio,
              max: limitesDaCompetencia(competencia).fim
            },
            {
              id: 'diasBase',
              rotulo: 'Dias base do período',
              tipo: 'number',
              valor: diasBase,
              aoMudar: (valor) => { setJornadaEnviada(null); setDiasBase(valor); },
              min: 1,
              max: 31
            }
          ].filter((campo) => (
            ['obra', 'periodicidade', 'periodoInicio', 'periodoFim'].includes(campo.id)
            || visibilidadeFiltros.ehVisivel(campo.id)
          ))}
          filtros={dimensoesFiltro.filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={ativos}
          aoAlternar={(dimensao, valor, opcoes) => {
            setJornadaEnviada(null);
            setAtivos((atuais) => alternarValorFiltro(atuais, dimensao, valor, opcoes));
          }}
          aoLimpar={() => {
            setJornadaEnviada(null);
            setAtivos((atuais) => ({ ...atuais, empresa: new Set() }));
          }}
          visibilidade={visibilidadeFiltros}
        />

        <div className="space-y-3">
          <div className="app-actionbar">
            <button type="button" className="btn btn-outline" onClick={carregar} disabled={carregando}>
              {carregando ? 'Carregando...' : 'Montar lista'}
            </button>
            {linhas.length ? (
              <button type="button" className="btn btn-outline" onClick={preencherMesCheio}>
                Preencher período
              </button>
            ) : null}
          </div>

          {/* Estava solto no rodape da tela como `page-subtitle`, que o
              validador reprova (R5). E informacao util e continua visivel,
              agora ancorada ao bloco a que pertence e com token de cor. */}
          {/* EXCEÇÃO DECLARADA à truncagem de 05/09 (`--integral`): é
              instrução, e a oração que importa ("Não precisam ser digitados
              aqui") é a última — truncar em uma linha inverteria o sentido do
              aviso. Fica em várias linhas, com a medida de leitura de 78ch. */}
          <p className="app-bloco-lead app-bloco-lead--integral">
            Os eventos recorrentes — vale alimentação, desconto de adiantamento, pensão — são
            aplicados sozinhos quando o Departamento Pessoal gerar a apuração. Não precisam ser
            digitados aqui.
          </p>
        </div>
      </BlocoConteudo>

      {jaInformados ? (
        <div className="alert alert-warning">
          Este período já tem jornada informada para {jaInformados} colaborador(es). Linhas enviadas
          ficam bloqueadas; a obra precisa solicitar autorização do DP para corrigi-las.
        </div>
      ) : null}

      {linhas.length ? (
        <form onSubmit={enviar} className="rh-form-com-tabela space-y-4">
          <BlocoConteudo
            titulo="Lançamento por colaborador"
            variante="primario"
            cor="var(--c-primary)"
            contagem={`${linhas.length} colaborador(es)`}
          >
            <TabelaPadrao
              /*
                GRADE DE LANÇAMENTO, NÃO LISTA DE CONSULTA (05/09).
                A maioria das colunas aqui é campo de digitação, não dado a ler.
                Oferecer "escolher colunas" numa grade assim dá ao usuário como
                esconder o campo que ele precisa preencher — e ele não descobre por
                que o lançamento parou de funcionar. A capacidade sai DAQUI, não do
                sistema: nas 246 tabelas de consulta ela continua.
              */
              colunasConfiguraveis={false}
              colunas={[
                {
                  id: 'colaborador',
                  titulo: 'Colaborador',
                  // R17: a linha da jornada é de um COLABORADOR nomeado.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (linha) => (
                    <CelulaDupla
                      principal={linha.nome}
                      sub={linha.aindaNaoComecou
                        ? `comeca nesta obra em ${new Date(`${linha.comecaEm}T00:00:00`).toLocaleDateString('pt-BR')}`
                        : (linha.jaInformado
                          ? (linha.edicaoStatus === 'AUTORIZADA' ? 'edição autorizada pelo DP' : 'já informado neste período')
                          : '')}
                    />
                  )
                },
                {
                  id: 'vinculo',
                  titulo: 'Vínculo',
                  tipo: 'badge',
                  render: (linha) => linha.tipo_vinculo
                },
                {
                  id: 'empresa',
                  titulo: 'Empresa',
                  tipo: 'texto',
                  render: (linha) => empresas.find((item) => Number(item.id) === Number(linha.empresa_grupo_id))?.nome || '—'
                },
                { id: 'cargo', titulo: 'Cargo', tipo: 'texto', render: (linha) => linha.cargo || '—' },
                { id: 'limiteVinculo', titulo: 'Dias na obra', tipo: 'numero', render: linha => linha.diasVinculados },
                {
                  id: 'multiplas_obras',
                  titulo: 'Mais de uma obra',
                  tipo: 'booleano',
                  render: (linha) => (linha.aindaNaoComecou ? <span className="opacity-50">—</span> : (
                    <div className="space-y-1 text-center">
                      <label className="flex items-center justify-center gap-2" title="Marque quando os dias desta competência serão distribuídos entre mais de uma obra.">
                        <input
                          type="checkbox"
                          checked={Boolean(linha.mais_de_uma_obra)}
                          disabled={!podeEditarLinha(linha)}
                          onChange={(event) => alterar(linha.__indice, 'mais_de_uma_obra', event.target.checked)}
                          aria-label={`Trabalhou em mais de uma obra: ${linha.nome}`}
                        />
                        <span className="app-note">Sim</span>
                      </label>
                      {linha.mais_de_uma_obra && linha.jaInformado ? (
                        <span className="app-note block">
                          {linha.aprovacao_distribuicao === 'AUTOMATICA_MESMO_RESPONSAVEL'
                            ? 'Aprovação automática'
                            : 'Validação pelas obras'}
                        </span>
                      ) : null}
                    </div>
                  ))
                },
                {
                  id: 'salario',
                  titulo: 'Base de calculo',
                  tipo: 'valor',
                  render: (linha) => (linha.forma_calculo_gerencial === 'DIARIA'
                    ? `${formatCurrencyInput(String(linha.valor_diaria || 0))} / diaria`
                    : (linha.salario_base ? formatCurrencyInput(String(linha.salario_base)) : '—'))
                },
                {
                  id: 'dias',
                  titulo: 'Dias',
                  tipo: 'numero',
                  // Edicao inline: o controle mora no render da coluna.
                  render: (linha) => (linha.aindaNaoComecou ? <span className="opacity-50">—</span> : (
                    <input
                      className="form-control rh-jornada-numero"
                      type="number"
                      min="0"
                      max={Math.min(Number(diasBase), linha.diasVinculados)}
                      title={`Limite: ${linha.diasVinculados} dia(s) de vínculo no período`}
                      aria-label={`Dias trabalhados de ${linha.nome}`}
                      value={linha.dias_trabalhados}
                      disabled={!podeEditarLinha(linha)}
                      onChange={(e) => alterar(linha.__indice, 'dias_trabalhados', e.target.value)}
                    />
                  ))
                },
                {
                  id: 'faltas',
                  titulo: 'Faltas',
                  tipo: 'numero',
                  render: (linha) => (linha.aindaNaoComecou ? <span className="opacity-50">—</span> : (
                    <input
                      className="form-control rh-jornada-numero"
                      type="number"
                      min="0"
                      max={Math.min(Number(diasBase), linha.diasVinculados)}
                      aria-label={`Faltas de ${linha.nome}`}
                      value={linha.faltas}
                      disabled={!podeEditarLinha(linha)}
                      onChange={(e) => alterar(linha.__indice, 'faltas', e.target.value)}
                    />
                  ))
                },
                {
                  id: 'regime_pagamento',
                  titulo: 'Pagamento',
                  tipo: 'texto',
                  render: (linha) => (linha.aindaNaoComecou ? '—' : (
                    <select
                      className="form-control min-w-36"
                      value={linha.regime_pagamento}
                      disabled={!podeEditarLinha(linha)}
                      onChange={(e) => alterar(linha.__indice, 'regime_pagamento', e.target.value)}
                    >
                      <option value="NORMAL">Salário / diária</option>
                      <option value="EMPREITADA">Empreitada</option>
                    </select>
                  ))
                },
                {
                  id: 'servico_executado',
                  titulo: 'Serviço executado',
                  tipo: 'texto',
                  render: (linha) => (linha.regime_pagamento !== 'EMPREITADA' ? '—' : (
                    <input
                      className="form-control min-w-56"
                      value={linha.servico_executado}
                      disabled={!podeEditarLinha(linha)}
                      onChange={(e) => alterar(linha.__indice, 'servico_executado', e.target.value)}
                    />
                  ))
                },
                {
                  id: 'valor_empreitada',
                  titulo: 'Valor empreitada',
                  tipo: 'valor',
                  render: (linha) => (linha.regime_pagamento !== 'EMPREITADA' ? '—' : (
                    <input
                      className="form-control rh-jornada-numero"
                      value={linha.valor_empreitada}
                      disabled={!podeEditarLinha(linha)}
                      onChange={(e) => alterar(linha.__indice, 'valor_empreitada', normalizeCurrencyTyping(e.target.value))}
                      onBlur={(e) => alterar(linha.__indice, 'valor_empreitada', formatCurrencyInput(e.target.value))}
                    />
                  ))
                },
                {
                  id: 'acrescimos',
                  titulo: 'Acréscimos',
                  tipo: 'valor',
                  render: (linha) => (linha.aindaNaoComecou ? <span className="opacity-50">—</span> : (
                    <input
                      className="form-control rh-jornada-numero"
                      aria-label={`Acréscimos de ${linha.nome}`}
                      value={linha.adicionais}
                      disabled={!podeEditarLinha(linha)}
                      onChange={(e) => alterar(linha.__indice, 'adicionais', normalizeCurrencyTyping(e.target.value))}
                      onBlur={(e) => alterar(linha.__indice, 'adicionais', formatCurrencyInput(e.target.value))}
                    />
                  ))
                },
                {
                  id: 'decimo_terceiro',
                  titulo: '13º salário',
                  tipo: 'valor',
                  render: (linha) => (linha.aindaNaoComecou ? '—' : (
                    <input
                      className="form-control rh-jornada-numero"
                      value={linha.decimo_terceiro}
                      disabled={!podeEditarLinha(linha)}
                      onChange={(e) => alterar(linha.__indice, 'decimo_terceiro', normalizeCurrencyTyping(e.target.value))}
                      onBlur={(e) => alterar(linha.__indice, 'decimo_terceiro', formatCurrencyInput(e.target.value))}
                    />
                  ))
                },
                {
                  id: 'descontos',
                  titulo: 'Descontos',
                  tipo: 'valor',
                  render: (linha) => (linha.aindaNaoComecou ? <span className="opacity-50">—</span> : (
                    <input
                      className="form-control rh-jornada-numero"
                      aria-label={`Descontos de ${linha.nome}`}
                      value={linha.descontos}
                      disabled={!podeEditarLinha(linha)}
                      onChange={(e) => alterar(linha.__indice, 'descontos', normalizeCurrencyTyping(e.target.value))}
                      onBlur={(e) => alterar(linha.__indice, 'descontos', formatCurrencyInput(e.target.value))}
                    />
                  ))
                },
                {
                  id: 'observacao',
                  titulo: 'Observação',
                  tipo: 'texto',
                  render: (linha) => (linha.aindaNaoComecou ? <span className="opacity-50">—</span> : (
                    <input
                      className="form-control"
                      aria-label={`Observação de ${linha.nome}`}
                      value={linha.observacoes}
                      disabled={!podeEditarLinha(linha)}
                      onChange={(e) => alterar(linha.__indice, 'observacoes', e.target.value)}
                    />
                  ))
                },
                {
                  id: 'acaoEdicao',
                  titulo: 'Edição',
                  tipo: 'acao',
                  render: (linha) => {
                    if (!linha.jaInformado || linha.aindaNaoComecou) return '—';
                    const processando = processandoEdicao === linha.colaborador_id;
                    if (linha.edicaoStatus === 'PENDENTE') {
                      return podeDecidirEdicao ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={processando}
                            onClick={() => decidirLiberacaoEdicao(linha, true)}
                          >
                            Autorizar
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            disabled={processando}
                            onClick={() => decidirLiberacaoEdicao(linha, false)}
                          >
                            Negar
                          </button>
                        </div>
                      ) : 'Aguardando DP';
                    }
                    if (linha.edicaoStatus === 'AUTORIZADA') return 'Liberada para um envio';
                    if (podeDecidirEdicao) return 'DP pode corrigir';
                    return (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={processando}
                        onClick={() => solicitarLiberacaoEdicao(linha)}
                      >
                        {linha.edicaoStatus === 'NEGADA' ? 'Solicitar novamente' : 'Solicitar edição'}
                      </button>
                    );
                  }
                }
              ]}
              itens={linhasTabela}
              getId={(linha) => linha.colaborador_id}
              storageKey="tabela:rh-dp-jornada:colaboradores"
              rotuloRolagem="Jornada por colaborador"
              // A tarja substitui as classes de linha do markup antigo: dias +
              // faltas acima da base é erro; quem ainda nao comecou é aviso.
              urgencia={(linha) => {
                if (Number(linha.dias_trabalhados || 0) > Math.min(Number(diasBase), linha.diasVinculados)
                  || Number(linha.faltas || 0) > Math.min(Number(diasBase), linha.diasVinculados)) return 'danger';
                return linha.aindaNaoComecou ? 'warning' : null;
              }}
              vazio="Nenhum colaborador nesta obra e período."
            />
          </BlocoConteudo>

          {comProblema.length ? (
            <div className="app-alert app-alert--error">
              Os dias informados ultrapassam o limite do vínculo: {comProblema.map((l) => `${l.nome} (máximo ${Math.min(Number(diasBase), l.diasVinculados)})`).join(', ')}.
            </div>
          ) : null}

          <div className="app-actionbar">
            {podeEnviar ? (
              <>
                <button type="submit" className="btn btn-primary" disabled={salvando || comProblema.length > 0}>
                  {salvando ? 'Enviando...' : 'Enviar jornada'}
                </button>
                <input
                  ref={inputFichasRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf"
                  className="sr-only"
                  aria-label="Selecionar fichas ou fotos da empreitada"
                  onChange={anexarComprovantesDaJornada}
                />
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={!jornadaEnviada?.id || anexandoFichas}
                  title={jornadaEnviada?.id
                    ? `Anexar fichas ou fotos à Jornada #${jornadaEnviada.id}`
                    : 'Envie a jornada antes de anexar fichas ou fotos da empreitada.'}
                  onClick={() => inputFichasRef.current?.click()}
                >
                  {anexandoFichas ? 'Anexando...' : 'Anexar fichas ou fotos'}
                </button>
                {jornadaEnviada?.id ? (
                  <span className="app-bloco-lead">Arquivos serão vinculados à Jornada #{jornadaEnviada.id}.</span>
                ) : null}
              </>
            ) : (
              <p className="app-bloco-lead" title="Você não tem permissão para enviar jornada.">Você não tem permissão para enviar jornada.</p>
            )}
          </div>
        </form>
      ) : null}

      <OverlayModal
        aberto={modalImportacaoAberto}
        largura="720px"
        rotulo="Importar jornada e fichas de ponto"
        onFechar={fecharModalImportacao}
        fecharComEscape={!importandoPlanilha}
      >
        <div data-modal="cabecalho" className="modal-header">
          <div>
            <h2 className="modal-title">Importar jornada</h2>
            <p className="app-bloco-lead">Envie a planilha preenchida e, se desejar, as fichas de ponto assinadas.</p>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={fecharModalImportacao} disabled={importandoPlanilha}>
            Fechar
          </button>
        </div>

        <form id="form-importar-jornada" className="p-4 space-y-4" onSubmit={importarPlanilhaDaJornada}>
          <section className="card p-4 space-y-3" aria-labelledby="titulo-planilha-jornada">
            <div>
              <h3 id="titulo-planilha-jornada" className="font-semibold">1. Planilha da jornada</h3>
              <p className="app-bloco-lead">Obrigatória. Use o modelo da obra selecionada e preencha somente os colaboradores que serão enviados.</p>
            </div>
            <label className="form-label" htmlFor="arquivo-planilha-jornada">Arquivo Excel ou CSV *</label>
            <input
              id="arquivo-planilha-jornada"
              className="form-control"
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              required
              disabled={importandoPlanilha}
              onChange={(evento) => setPlanilhaImportacao(evento.target.files?.[0] || null)}
            />
            {planilhaImportacao ? <span className="app-bloco-lead">Selecionado: {planilhaImportacao.name}</span> : null}
          </section>

          <section className="card p-4 space-y-3" aria-labelledby="titulo-fichas-ponto">
            <div>
              <h3 id="titulo-fichas-ponto" className="font-semibold">2. Fichas de ponto</h3>
              <p className="app-bloco-lead">Opcional neste momento. Você pode selecionar vários arquivos.</p>
            </div>
            <label className="form-label" htmlFor="arquivos-fichas-ponto">Arquivos das fichas</label>
            <input
              id="arquivos-fichas-ponto"
              className="form-control"
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,application/pdf,image/*"
              disabled={importandoPlanilha}
              onChange={(evento) => setFichasImportacao(Array.from(evento.target.files || []))}
            />
            {fichasImportacao.length ? (
              <span className="app-bloco-lead">{fichasImportacao.length} ficha(s) selecionada(s).</span>
            ) : null}
          </section>
        </form>

        <div data-modal="rodape" className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={fecharModalImportacao} disabled={importandoPlanilha}>
            Cancelar
          </button>
          <button type="submit" form="form-importar-jornada" className="btn btn-primary" disabled={importandoPlanilha || !planilhaImportacao}>
            {importandoPlanilha ? 'Importando...' : 'Importar e enviar'}
          </button>
        </div>
      </OverlayModal>

      {elementoConfirmacao}
    </div>
  );
}
