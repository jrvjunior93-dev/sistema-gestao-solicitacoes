'use strict';

const { Op } = require('sequelize');
const { sequelize, Anexo, CategoriaFinanceira, Contrato, ContratoAnexo, ContratoParcela, ContratoApropriacao, ContratoCredor, Apropriacao, ConfiguracaoSistema, FormaPagamentoFinanceira, Historico, Obra, Parceiro, Setor, TipoSubContrato, TipoSolicitacao, TituloFinanceiro, User, Solicitacao } = require('../models');
const { codigoDoSetor } = require('../utils/codigoDoSetor');
const {
  normalizeTipoSolicitacaoBehavior,
  obterRotuloDataSolicitacao
} = require('./tipoSolicitacaoBehaviorService');
const {
  obterConfigCamposNovaSolicitacao,
  resolverCamposNovaSolicitacao
} = require('./novaSolicitacaoCamposConfig');
const { registrarEventoSeguranca } = require('./securityLogService');
const { criarTituloManual } = require('./tituloFinanceiroService');
const { gerarProximoCodigo } = require('./contratoCodigoService');
const { gerarParcelas, paraCentavos, somenteData, formatarISO } = require('./contratoParcelasService');
const { obterLimiteJuridico } = require('./contratoLimiteConfigService');
const { formaPagamentoEhBoleto } = require('./formasPagamentoMedicaoService');
const { isValidCpfCnpj, normalizarCpfCnpj } = require('./parceiroService');
const { validarResponsavelVinculadoObra } = require('./contratoResponsavelService');
const { resolverDestinoInicialNovaSolicitacao } = require('./novaSolicitacaoDestinoService');
const { assertTipoDisponivelNoDestino } = require('./tipoSolicitacaoDisponibilidadeService');
const gerarCodigoSolicitacao = require('./solicitacao/gerarCodigo');

/**
 * Status da parcela enquanto o contrato aguarda aprovacao.
 *
 * A parcela vive em `contrato_parcelas`, NAO em `titulos_financeiros`. A tentativa
 * anterior gravava titulo com status proprio, apostando que os filtros usavam lista
 * positiva — premissa falsa: das 53 consultas a titulos no backend, 34 nao filtram
 * status e 8 usam filtro negativo, entao 42 capturavam o status novo. Um contrato de
 * teste alterou 9 de 27 rotas financeiras.
 *
 * Fora de titulos_financeiros o problema deixa de existir, inclusive para consultas
 * futuras. Ver MAPA-IMPACTO-PARCELAS.md.
 */
/**
 * Tipo do anexo que carrega a NEGOCIACAO DETALHADA (decisao do cliente, 20/08).
 *
 * O campo de texto saiu da tela: a negociacao chega em documento. Isto e o que permite a aprovacao
 * perguntar "tem o documento?" em vez de "tem algum anexo?" — sem o tipo, a foto de uma nota fiscal
 * satisfaria a exigencia.
 */
const TIPO_ANEXO_NEGOCIACAO = 'NEGOCIACAO_DETALHADA';

const TIPO_ANEXO_CARTAO_CNPJ = 'CARTAO_CNPJ';
const TIPO_ANEXO_ATO_CONSTITUTIVO = 'ATO_CONSTITUTIVO';
const TIPO_ANEXO_DOCUMENTOS_REPRESENTANTE = 'DOCUMENTOS_REPRESENTANTE_LEGAL';
const DOCUMENTOS_JURIDICOS_OBRIGATORIOS = [
  { tipo: TIPO_ANEXO_CARTAO_CNPJ, rotulo: 'Cartao CNPJ' },
  { tipo: TIPO_ANEXO_ATO_CONSTITUTIVO, rotulo: 'Ato constitutivo' },
  { tipo: TIPO_ANEXO_DOCUMENTOS_REPRESENTANTE, rotulo: 'Documentos do representante legal' }
];

const ESTADOS_CIVIS_REPRESENTANTE = new Set([
  'SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'SEPARADO', 'UNIAO_ESTAVEL'
]);
const REGIMES_BENS_CASAMENTO = new Set([
  'Comunhão parcial de bens',
  'Comunhão universal de bens',
  'Separação total de bens',
  'Separação obrigatória de bens',
  'Participação final nos aquestos'
]);

function normalizarEstadoCivilRepresentante(valor) {
  const chave = String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\(A\)/g, '')
    .replace(/[^A-Z]+/g, '_')
    .replace(/^_|_$/g, '');
  const aliases = {
    SOLTEIRA: 'SOLTEIRO',
    CASADA: 'CASADO',
    DIVORCIADA: 'DIVORCIADO',
    VIUVA: 'VIUVO',
    SEPARADA: 'SEPARADO',
    SEPARADO_JUDICIALMENTE: 'SEPARADO',
    SEPARADA_JUDICIALMENTE: 'SEPARADO'
  };
  return aliases[chave] || chave;
}

/** Tipo do anexo que carrega a MINUTA, entregue pelo Juridico. */
const TIPO_ANEXO_MINUTA = 'MINUTA';

function normalizarQualificacaoRepresentanteLegal(valor) {
  const entrada = valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {};
  const campos = {
    nome: String(entrada.nome || '').trim().slice(0, 180),
    cpf: normalizarCpfCnpj(entrada.cpf),
    rg: String(entrada.rg || '').trim().slice(0, 40),
    cargo: String(entrada.cargo || '').trim().slice(0, 80),
    nacionalidade: String(entrada.nacionalidade || '').trim().slice(0, 60),
    estado_civil: normalizarEstadoCivilRepresentante(entrada.estado_civil),
    profissao: String(entrada.profissao || '').trim().slice(0, 80)
  };

  const rotulos = {
    nome: 'nome completo',
    cpf: 'CPF',
    rg: 'RG',
    cargo: 'cargo ou funcao',
    nacionalidade: 'nacionalidade',
    estado_civil: 'estado civil',
    profissao: 'profissao'
  };
  const faltantes = Object.entries(rotulos)
    .filter(([campo]) => !campos[campo])
    .map(([, rotulo]) => rotulo);

  if (faltantes.length > 0) {
    throw Object.assign(
      new Error(`Complete a qualificacao do representante legal: ${faltantes.join(', ')}.`),
      { statusCode: 400 }
    );
  }
  if (campos.cpf.length !== 11 || !isValidCpfCnpj(campos.cpf)) {
    throw Object.assign(new Error('Informe um CPF valido para o representante legal.'), { statusCode: 400 });
  }
  if (!ESTADOS_CIVIS_REPRESENTANTE.has(campos.estado_civil)) {
    throw Object.assign(new Error('Selecione um estado civil valido para o representante legal.'), { statusCode: 400 });
  }

  if (campos.estado_civil === 'CASADO') {
    const entradaConjuge = entrada.conjuge && typeof entrada.conjuge === 'object' && !Array.isArray(entrada.conjuge)
      ? entrada.conjuge
      : {};
    const conjuge = {
      nome: String(entradaConjuge.nome || '').trim().slice(0, 180),
      cpf: normalizarCpfCnpj(entradaConjuge.cpf),
      rg: String(entradaConjuge.rg || '').trim().slice(0, 40),
      nacionalidade: String(entradaConjuge.nacionalidade || '').trim().slice(0, 60),
      profissao: String(entradaConjuge.profissao || '').trim().slice(0, 80),
      regime_bens: String(entradaConjuge.regime_bens || '').trim().slice(0, 80)
    };
    const rotulosConjuge = {
      nome: 'nome completo',
      cpf: 'CPF',
      rg: 'RG',
      nacionalidade: 'nacionalidade',
      profissao: 'profissao',
      regime_bens: 'regime de bens'
    };
    const faltantesConjuge = Object.entries(rotulosConjuge)
      .filter(([campo]) => !conjuge[campo])
      .map(([, rotulo]) => rotulo);
    if (faltantesConjuge.length > 0) {
      throw Object.assign(
        new Error(`Complete os dados do conjuge: ${faltantesConjuge.join(', ')}.`),
        { statusCode: 400 }
      );
    }
    if (conjuge.cpf.length !== 11 || !isValidCpfCnpj(conjuge.cpf)) {
      throw Object.assign(new Error('Informe um CPF valido para o conjuge.'), { statusCode: 400 });
    }
    if (conjuge.cpf === campos.cpf) {
      throw Object.assign(new Error('O CPF do conjuge deve ser diferente do CPF do representante legal.'), { statusCode: 400 });
    }
    if (!REGIMES_BENS_CASAMENTO.has(conjuge.regime_bens)) {
      throw Object.assign(new Error('Selecione um regime de bens valido.'), { statusCode: 400 });
    }
    campos.conjuge = conjuge;
  } else {
    campos.conjuge = null;
  }

  return campos;
}

const ACAO_HISTORICO_JURIDICO = {
  minuta: 'JURIDICO_MINUTA',
  assinado: 'JURIDICO_ASSINATURA_RECEBIDA',
  conferido: 'JURIDICO_CONFERIDO'
};

const DESCRICAO_HISTORICO_JURIDICO = {
  minuta: (contrato, { link, temArquivo }) => {
    const entregue = [temArquivo ? 'minuta anexada' : null, link ? 'link de assinatura informado' : null]
      .filter(Boolean).join(' e ');
    return `Juridico concluiu a minuta do contrato ${contrato.codigo} (${entregue}). `
      + 'Solicitacao devolvida para coleta de assinatura.';
  },
  assinado: (contrato, { assinadoPeloLink }) => assinadoPeloLink
    ? `Contrato ${contrato.codigo} assinado pela plataforma informada: devolvido ao Juridico para conferencia.`
    : `Contrato ${contrato.codigo} assinado e anexado: devolvido ao Juridico para conferencia.`,
  conferido: (contrato) => `Juridico conferiu o contrato ${contrato.codigo} assinado e liberou os titulos.`
};

/**
 * O GEO pode cancelar enquanto o pedido ainda esta na etapa de aprovacao, desde que tenha a
 * permissao nominal. Depois que o Juridico entrega a minuta, o contrato acima do limite entra em
 * `AGUARDANDO_ASSINATURA` e o cancelamento deixa de ser uma decisao da Gerencia de Processos.
 *
 * Esta funcao e usada tanto na resposta que monta os botoes quanto na operacao que grava no banco,
 * para a tela e a API nao divergirem.
 */
function podeCancelarSolicitacaoContrato(contrato, usuario, temPermissao) {
  if (!temPermissao) return false;
  const ehGeo = codigoDoSetor(usuario).trim().toUpperCase() === 'GEO';
  return !(ehGeo && contrato?.status_contrato === STATUS_CONTRATO.AGUARDANDO_ASSINATURA);
}

/**
 * Link de assinatura: precisa ser http(s).
 *
 * Aceitar texto solto deixaria a tela renderizar um botao que nao leva a lugar nenhum; aceitar
 * outros esquemas (`javascript:`, `data:`) transformaria o campo em vetor de XSS no dia em que
 * alguem o transformar num link clicavel.
 */
function validarLinkAssinatura(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) return null;

  let url;
  try {
    url = new URL(texto);
  } catch {
    throw Object.assign(new Error('Link de assinatura invalido: informe uma URL completa (https://...).'), { statusCode: 400 });
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw Object.assign(new Error('Link de assinatura invalido: use um endereco http ou https.'), { statusCode: 400 });
  }
  if (texto.length > 500) {
    throw Object.assign(new Error('Link de assinatura muito longo (maximo 500 caracteres).'), { statusCode: 400 });
  }
  return texto;
}

const STATUS_PARCELA = {
  PREVISAO: 'PREVISAO',
  APROVADA: 'APROVADA',
  REJEITADA: 'REJEITADA'
};

/**
 * A categoria financeira precisa estar na lista curada (tela Categorias do Contrato de Obra).
 *
 * Extraido para funcao porque agora e chamado em DOIS momentos: na criacao, quando a categoria
 * vier junto, e na APROVACAO, que passou a ser o lugar onde ela e informada (PI-16). Uma copia da
 * regra em cada lugar acabaria divergindo — e "a lista curada nao restringe nada" ja foi achado
 * de auditoria neste projeto.
 */
async function garantirCategoriaLiberada(categoriaId, transaction) {
  const categoria = await CategoriaFinanceira.findByPk(Number(categoriaId), {
    attributes: ['id', 'nome', 'tipo', 'ativo'],
    ...(transaction ? { transaction } : {})
  });

  if (!categoria) {
    throw Object.assign(new Error('Categoria financeira nao encontrada.'), { statusCode: 400 });
  }
  if (categoria.ativo === false) {
    throw Object.assign(
      new Error(`Categoria financeira "${categoria.nome}" esta inativa.`),
      { statusCode: 400 }
    );
  }
  // Contrato gera conta A PAGAR. Uma categoria de RECEBER aqui classificaria o titulo do lado
  // errado da DRE — e o erro so apareceria no relatorio, muito depois.
  if (String(categoria.tipo).toUpperCase() !== 'PAGAR') {
    throw Object.assign(
      new Error(`Categoria financeira "${categoria.nome}" nao e de contas a pagar.`),
      { statusCode: 400 }
    );
  }
}

/**
 * As categorias que a aprovacao do contrato oferece (20/08).
 *
 * Eram apenas as tres da lista curada (`CONTRATO_OBRA_CATEGORIAS_PERMITIDAS`). O cliente pediu o
 * plano de contas inteiro do tipo **contas a pagar**, com busca — sao 160, e escolher entre tres
 * obrigava a classificar contrato de qualquer natureza numa delas.
 *
 * A lista curada deixa de restringir a aprovacao. O que restringe agora e o TIPO: contrato gera
 * conta a pagar, e categoria de RECEBER classificaria o titulo do lado errado da DRE.
 *
 * A tela de Categorias do Contrato de Obra continua existindo e a configuracao segue gravada —
 * ela simplesmente nao e mais o gargalo desta escolha.
 */
async function listarCategoriasParaContrato() {
  const categorias = await CategoriaFinanceira.findAll({
    where: { tipo: 'PAGAR', ativo: true },
    attributes: ['id', 'nome'],
    order: [['nome', 'ASC']]
  });

  // SO o `nome` — que ja vem no formato "2.01.01.02 - Mao de Obra Contratada", ou seja, com o
  // codigo do plano e a descricao de negocio na mesma string.
  //
  // `descricao` fica de fora de proposito: nesta tabela ela guarda metadado da importacao
  // ("Plano Sienge 2.01.01.02; redutora: Nao"), nao um nome. Mandando os dois, a lista mostrava a
  // procedencia do registro no lugar da categoria, e as 160 linhas ficavam praticamente iguais.
  return categorias.map((c) => ({ id: c.id, nome: c.nome }));
}

/**
 * Guarda de dinheiro da PI-16: nenhum titulo nasce sem categoria.
 *
 * A categoria saiu da criacao porque o usuario da obra nao conhece o plano financeiro. O preco
 * disso e que o contrato pode chegar na aprovacao sem ela — e sem categoria o titulo cai na
 * pendencia TITULOS_SEM_CATEGORIA e nao se classifica na DRE.
 *
 * Por isso a checagem mora AQUI, no ponto em que os titulos vao nascer, e nao no comeco de cada
 * caminho: `aplicarAprovacaoNaTransacao` e chamada tanto pela aprovacao direta (abaixo do limite)
 * quanto pela etapa `assinado` do Juridico (acima). Guardando o ponto unico, os dois caminhos
 * ficam cobertos por construcao — nao por eu ter lembrado de repetir a validacao nos dois.
 */
function garantirCategoriaParaTitulos(contrato) {
  if (contrato?.categoria_financeira_id) return;
  throw Object.assign(
    new Error(
      'Informe a categoria financeira do contrato antes de aprovar: ela e aplicada a todos os titulos das parcelas.'
    ),
    { statusCode: 400 }
  );
}

const STATUS_CONTRATO = {
  AGUARDANDO_APROVACAO: 'AGUARDANDO_APROVACAO',
  ATIVO: 'ATIVO',
  REJEITADO: 'REJEITADO',
  // Trilha do JURIDICO, acima do limite (PI-1 / MD-10): a Gerencia de Processos revisa e
  // encaminha; o Juridico avalia a documentacao e monta a minuta; a minuta vai as partes
  // para assinatura. So depois disso o contrato fica ATIVO e o compromisso existe.
  EM_ANALISE_JURIDICA: 'EM_ANALISE_JURIDICA',
  AGUARDANDO_ASSINATURA: 'AGUARDANDO_ASSINATURA',
  // PI-18: o contrato volta ao Juridico com o assinado anexado, e e a CONFERENCIA dele que cria
  // os titulos. Sem este estado, quem colhia a assinatura era quem liberava o dinheiro.
  EM_REVISAO_JURIDICA: 'EM_REVISAO_JURIDICA',
  // Quebra de contrato (PI-6): saldo zerado, nada mais sera pago do que estava previsto.
  ENCERRADO: 'ENCERRADO'
};

// Limite historico, mantido como PADRAO. O valor que vale em tempo de execucao vem da
// configuracao de tela (contratoLimiteConfigService) — a Diretoria muda sem deploy.
const LIMITE_APROVACAO = 50000;

/**
 * PI-16: a SOLICITACAO e a fonte da verdade do estado; `contratos.status_contrato` e espelho.
 *
 * O mapa esta aqui, num lugar so, porque duas maquinas de estado que se copiam em varios pontos
 * divergem — e um contrato ATIVO cuja solicitacao diz PENDENTE (ou o contrario) e a pior especie
 * de bug: cada tela conta uma historia, e as duas parecem certas.
 *
 * `SETOR_JURIDICO` e o codigo do setor, nao o nome: a resolucao por nome e exata e o setor da
 * Gerencia tem espaco no fim do nome no banco — armadilha ja registrada neste projeto.
 */
const SETOR_JURIDICO = 'JURIDICO';

const STATUS_SOLICITACAO_POR_CONTRATO = {
  [STATUS_CONTRATO.AGUARDANDO_APROVACAO]: 'PENDENTE',
  // Rejeitar DEVOLVE para ajuste, nao mata (decisao do cliente, 19/08). Cancelar e que e terminal.
  [STATUS_CONTRATO.REJEITADO]: 'PENDENTE DE AJUSTE',
  // Toda entrada no setor JURIDICO chega como PENDENTE. O estado detalhado da maquina continua
  // no contrato (`EM_ANALISE_JURIDICA` / `EM_REVISAO_JURIDICA`); o status da solicitacao indica
  // que ha uma acao aguardando o setor, e nao que alguem ja iniciou a analise.
  [STATUS_CONTRATO.EM_ANALISE_JURIDICA]: 'PENDENTE',
  [STATUS_CONTRATO.AGUARDANDO_ASSINATURA]: 'NEC. DE ASSINATURA',
  [STATUS_CONTRATO.EM_REVISAO_JURIDICA]: 'PENDENTE',
  [STATUS_CONTRATO.ATIVO]: 'APROVADA',
  [STATUS_CONTRATO.ENCERRADO]: 'CONCLUIDA'
};

/**
 * Registra no HISTORICO da solicitacao o que acabou de acontecer com o contrato (20/08).
 *
 * O fluxo novo cria e move a Solicitacao direto daqui, sem passar por `SolicitacaoController` — que
 * e quem grava `SOLICITACAO_CRIADA`, `STATUS_ALTERADO` e `ENVIADA_SETOR` no fluxo padrao. Resultado
 * medido antes desta funcao existir: **zero** linhas de historico em solicitacao de contrato do
 * fluxo novo, contra 14.464 `STATUS_ALTERADO` no resto do sistema. O card Historico abria vazio e
 * nao havia como reconstruir quem aprovou, quando foi ao Juridico ou por que voltou.
 *
 * SEMPRE dentro da transacao que muda o estado. Fora dela, um rollback deixaria histórico de algo
 * que nao aconteceu — o mesmo cuidado que ja existe nos eventos de titulo.
 *
 * `setor` e NOT NULL no banco: cai na area da solicitacao quando o usuario nao tiver setor.
 */
async function registrarHistoricoDoContrato(solicitacao, {
  acao,
  descricao,
  usuario,
  statusAnterior = null,
  statusNovo = null,
  metadata = null,
  transaction
}) {
  if (!solicitacao?.id) return null;

  return Historico.create({
    solicitacao_id: solicitacao.id,
    usuario_responsavel_id: usuario?.id || null,
    setor: codigoDoSetor(usuario) || solicitacao.area_responsavel || '-',
    acao,
    descricao,
    status_anterior: statusAnterior,
    status_novo: statusNovo,
    metadata: metadata ? JSON.stringify(metadata) : null
  }, { transaction });
}

/**
 * Espelha na solicitacao E registra no historico, numa chamada so.
 *
 * As duas coisas sempre andam juntas: mudou o estado do contrato, a solicitacao muda e a linha do
 * tempo precisa dizer isso. Separar convidava a esquecer a segunda — que foi exatamente o que
 * aconteceu ate aqui.
 *
 * Quando a solicitacao troca de setor, sai TAMBEM um `ENVIADA_SETOR` — o mesmo nome de acao do
 * fluxo padrao, para o card e os filtros existentes lerem sem caso especial.
 */
async function espelharERegistrar(contrato, {
  acao,
  descricao,
  usuario,
  metadata = null,
  statusSolicitacao = null
}, transaction) {
  const solicitacao = await sincronizarSolicitacaoDoContrato(contrato, transaction, { statusSolicitacao });
  if (!solicitacao) return null;

  const t = solicitacao.transicao || {};

  await registrarHistoricoDoContrato(solicitacao, {
    acao,
    descricao,
    usuario,
    statusAnterior: t.statusAnterior || null,
    statusNovo: t.statusNovo || null,
    metadata,
    transaction
  });

  if (t.mudouDeSetor) {
    // FORMATO EXATO, e nao uma frase parecida.
    //
    // A regra de visibilidade "a solicitacao passou pelo meu setor" nao le uma coluna: ela casa o
    // TEXTO do historico com `LIKE 'DE <SETOR> PARA %'` e `LIKE '% PARA <SETOR>'`, e compara
    // `h.setor` com o setor do usuario (`montarLiteralHistoricoSetoresEnvolvidos`).
    //
    // A primeira versao daqui escrevia "Encaminhada de GEO para JURIDICO." — os dois LIKE falhavam
    // (prefixo "Encaminhada" e o ponto final), e `setor` guardava o setor de quem agiu. Resultado
    // relatado pelo cliente: **depois de enviar a minuta, a solicitacao sumia para o Juridico**.
    //
    // O formato abaixo e o mesmo das 2.422 linhas do fluxo padrao: texto "De X para Y", sem ponto,
    // e `setor` = DESTINO.
    await Historico.create({
      solicitacao_id: solicitacao.id,
      usuario_responsavel_id: usuario?.id || null,
      setor: t.areaNova,
      acao: 'ENVIADA_SETOR',
      descricao: `De ${t.areaAnterior || '-'} para ${t.areaNova}`,
      status_anterior: t.statusAnterior || null,
      status_novo: t.statusNovo || null
    }, { transaction });
  }

  return solicitacao;
}

/**
 * O SETOR DE QUEM CRIOU A SOLICITACAO (itens 24 e 30, 23/08).
 *
 * "Ao ser rejeitado precisa ser resolvida, e quem vai resolver e quem criou" — palavras do cliente.
 * Vale tambem para a aprovacao: contrato abaixo do limite nao passa pelo Juridico, entao nada nunca
 * o tirava da Gerencia de Processos, e ele ficava parado na fila de quem ja tinha feito a parte
 * dele.
 *
 * Devolve `null` quando nao da para descobrir — usuario apagado, `criado_por` nulo nos registros
 * antigos, setor sem codigo. Nesse caso o chamador mantem o comportamento de antes: um contrato nao
 * pode ficar sem fila porque um usuario foi desativado.
 */
async function setorDeQuemCriou(solicitacao, transaction) {
  const criadoPor = Number(solicitacao?.criado_por || 0);
  if (!criadoPor) return null;

  const autor = await User.findByPk(criadoPor, { attributes: ['id', 'setor_id'], transaction });
  if (!autor?.setor_id) return null;

  const setor = await Setor.findByPk(autor.setor_id, { attributes: ['id', 'codigo'], transaction });
  // `codigo`, e nao `nome`: a fila trabalha com o codigo do setor (`GEO`), e ha setor com espaco no
  // fim do nome neste banco — armadilha ja registrada.
  const codigo = String(setor?.codigo || '').trim();
  return codigo || null;
}

async function sincronizarSolicitacaoDoContrato(contrato, transaction, { statusSolicitacao = null } = {}) {
  if (!contrato?.solicitacao_id) return null;

  const solicitacao = await Solicitacao.findByPk(contrato.solicitacao_id, { transaction });
  if (!solicitacao) return null;

  const statusNovo = String(statusSolicitacao || '').trim()
    || STATUS_SOLICITACAO_POR_CONTRATO[contrato.status_contrato];
  if (!statusNovo) return solicitacao;

  // Guardados ANTES do update: e com eles que o historico registra a transicao.
  const statusAnterior = solicitacao.status_global;
  const areaAnterior = solicitacao.area_responsavel;

  const mudancas = { status_global: statusNovo };

  // Calculado uma vez: as duas regras abaixo (devolucao e contrato ATIVO) usam o mesmo destino.
  const setorDoAutor = await setorDeQuemCriou(solicitacao, transaction);

  // Encaminhamento ao JURIDICO e a volta dele.
  //
  // Ao ir para o Juridico, a area de origem e PARQUEADA em `setor_destino_pos_aprovacao` — a
  // coluna ja existe e o nome descreve exatamente isto: para onde a solicitacao vai depois de
  // aprovada. Sem parquear, a volta "para o responsavel" nao teria para onde ir, porque
  // `area_responsavel` ja teria sido sobrescrita pelo JURIDICO.
  if (contrato.status_contrato === STATUS_CONTRATO.EM_ANALISE_JURIDICA) {
    if (!solicitacao.setor_destino_pos_aprovacao) {
      mudancas.setor_destino_pos_aprovacao = solicitacao.area_responsavel;
    }
    mudancas.area_responsavel = SETOR_JURIDICO;
  }

  // Devolvido para ajuste: volta para o setor que PEDIU o contrato.
  //
  // Sem isto a solicitacao ficava parada no setor que devolveu: o Juridico rejeitava, a solicitacao
  // continuava com `area_responsavel = JURIDICO`, e quem tinha que corrigir nunca a via na fila.
  // O motivo da devolucao ficava escrito numa tela que o responsavel nao abria.
  //
  // `setor_destino_pos_aprovacao` NAO e limpo aqui de proposito: e ele que leva a solicitacao de
  // volta ao Juridico no reenvio, e depois ao responsavel quando o contrato ficar ATIVO. Devolucao
  // na propria aprovacao nao tem parqueamento, e a area simplesmente nao muda.
  //
  // ITEM 30 (23/08): o destino passou a ser o SETOR DE QUEM CRIOU, e nao mais o parqueamento.
  // `setor_destino_pos_aprovacao` guarda a area responsavel de quando o contrato foi ao Juridico —
  // que nem sempre e o setor do autor. Quem tem de resolver a devolucao e quem abriu.
  //
  // E POR ISSO A FILA DE APROVACAO PRECISA SER PARQUEADA AQUI.
  //
  // Ate o item 30 a devolucao deixava a solicitacao onde ela ja estava — a fila de quem aprova — e
  // o reenvio a encontrava no lugar certo sem ninguem fazer nada. Mandando-a para o autor, esse
  // lugar se perde: o contrato reenviado voltava para `AGUARDANDO_APROVACAO` com a solicitacao
  // parada no setor do autor, e a Gerencia de Processos NUNCA MAIS a via na fila. Foi a suite 31
  // que apanhou isso.
  //
  // O parqueamento nao e sobrescrito quando ja existe: no caminho do Juridico ele foi preenchido na
  // ida e e ele que traz a solicitacao de volta.
  if (contrato.status_contrato === STATUS_CONTRATO.REJEITADO) {
    if (!solicitacao.setor_destino_pos_aprovacao) {
      mudancas.setor_destino_pos_aprovacao = solicitacao.area_responsavel;
    }
    mudancas.area_responsavel = setorDoAutor
      || solicitacao.setor_destino_pos_aprovacao
      || solicitacao.area_responsavel;
  }

  // Reenviado: a solicitacao volta para a fila de quem decide.
  //
  // `AGUARDANDO_APROVACAO` tambem e o status de NASCIMENTO do contrato — e la o parqueamento nao
  // existe ainda, entao esta regra nao dispara na criacao. Ela so vale para o contrato que foi
  // devolvido e voltou.
  if (contrato.status_contrato === STATUS_CONTRATO.AGUARDANDO_APROVACAO
      && solicitacao.setor_destino_pos_aprovacao) {
    mudancas.area_responsavel = solicitacao.setor_destino_pos_aprovacao;
  }

  // Minuta pronta: volta para QUEM CRIOU, que e quem colhe a assinatura (cliente, 24/08).
  //
  // Ficou para tras quando os itens 24 e 30 mudaram o destino de "aprovado" e "rejeitado" para o
  // setor do autor: esta etapa continuou usando o parqueamento, e a solicitacao ia para a fila de
  // APROVACAO — onde ninguem tinha o que fazer com ela. A propria tela ja dizia "volta ao setor de
  // origem para colher a assinatura"; o codigo e que mandava para outro lugar.
  //
  // Encontrado rodando a matriz de teste pela tela (passo B.8). O efeito nao era um bloqueio — a
  // regra de visibilidade mantinha o autor enxergando —, era a solicitacao aparecer como
  // responsabilidade de um setor que nao ia agir.
  if (contrato.status_contrato === STATUS_CONTRATO.AGUARDANDO_ASSINATURA) {
    mudancas.area_responsavel = setorDoAutor
      || solicitacao.setor_destino_pos_aprovacao
      || solicitacao.area_responsavel;
  }

  // PI-18: com o assinado anexado, volta ao JURIDICO para conferencia — e EM DESTAQUE no topo da
  // lista, como o cliente pediu. Reaproveita o mecanismo de prioridade que a Diretoria ja usa;
  // criar um segundo mecanismo de destaque so faria as duas listas discordarem.
  if (contrato.status_contrato === STATUS_CONTRATO.EM_REVISAO_JURIDICA) {
    mudancas.area_responsavel = SETOR_JURIDICO;
    mudancas.prioridade_diretoria_ativa = true;
    mudancas.prioridade_diretoria_em = new Date();
  }

  // Contrato APROVADO: a solicitacao vai para o setor de quem criou.
  //
  // ITEM 24 (23/08). Antes, a condicao exigia `setor_destino_pos_aprovacao` — que so existe quando o
  // contrato passou pelo Juridico. Contrato ABAIXO do limite nao passa: o parqueamento nunca
  // acontecia, a condicao era falsa e ele ficava parado na Gerencia de Processos, que ja tinha
  // feito a parte dela. Agora a mudanca vale para os dois caminhos.
  if (contrato.status_contrato === STATUS_CONTRATO.ATIVO) {
    const destino = setorDoAutor || solicitacao.setor_destino_pos_aprovacao;
    if (destino) {
      mudancas.area_responsavel = destino;
      mudancas.setor_destino_pos_aprovacao = null;
      // A revisao ja aconteceu: tira o destaque do topo da lista.
      mudancas.prioridade_diretoria_ativa = false;
    }
  }

  await solicitacao.update(mudancas, { transaction });

  // Anexados ao objeto para quem chamou registrar o historico sem reconsultar o banco.
  solicitacao.transicao = {
    statusAnterior,
    statusNovo,
    areaAnterior,
    areaNova: mudancas.area_responsavel || areaAnterior,
    mudouDeSetor: Boolean(mudancas.area_responsavel && mudancas.area_responsavel !== areaAnterior)
  };
  return solicitacao;
}

/**
 * Teto de parcelas por contrato: 24, definido pelo cliente em 17/08/2026.
 *
 * Sem teto, a auditoria criou um contrato de 1000 parcelas vencendo em 2109 — e na aprovacao
 * isso viraria 1000 titulos financeiros. Nenhum contrato existente no banco tem parcelas,
 * entao o teto nao afeta dado historico.
 */
const MAXIMO_PARCELAS = 24;

/**
 * Cria um contrato do fluxo novo com suas parcelas de previsao.
 *
 * Codigo e contrato sao gravados na mesma transacao: se a criacao falhar, o numero da
 * sequencia nao e consumido.
 */
async function criarContrato(dados, { usuarioId } = {}) {

  const {
    obra_id: obraId,
    ref_contrato: refContrato,
    objeto,
    descricao,
    detalhes_contratacao: detalhesContratacao,
    representante_legal_qualificacao: qualificacaoRepresentanteInformada,
    valor_total: valorTotal,
    qtde_parcelas: qtdeParcelas,
    primeiro_vencimento: primeiroVencimento,
    // Data operacional da solicitacao. Os vencimentos financeiros continuam nas parcelas.
    data_vencimento: dataRespostaPagamento,
    periodicidade = 'MENSAL',
    parceiro_id: parceiroId,
    // Todos os contratados respondem pelo contrato. `parceiros` e a lista de contratados;
    // `parceiro_id` continua aceito e vale como contratado unico (compatibilidade com quem ja
    // chama este servico). Favorecido e forma de pagamento pertencem a medicao.
    parceiros: parceirosInformados,
    vigencia_inicio: vigenciaInicio,
    vigencia_fim: vigenciaFim,
    responsavel_id: responsavelId,
    tipo_macro_id: tipoMacroId,
    tipo_sub_id: tipoSubId,
    justificativa,
    categoria_financeira_id: categoriaFinanceiraId,
    apropriacoes: apropriacoesInformadas
  } = dados;

  // Valores efetivamente persistidos. Quando o tipo possui uma regra de campos, o backend
  // repete a decisao da tela: campo oculto nao pode entrar por payload forjado ou por estado
  // antigo mantido no navegador.
  let refContratoPersistido = refContrato;
  let descricaoPersistida = descricao;
  let objetoPersistido = objeto;
  let vigenciaInicioPersistida = vigenciaInicio;
  let vigenciaFimPersistida = vigenciaFim;
  let responsavelIdPersistido = responsavelId;
  let justificativaPersistida = justificativa;
  let dataRespostaPagamentoPersistida = dataRespostaPagamento;

  if (!obraId) {
    throw Object.assign(new Error('Obra e obrigatoria.'), { statusCode: 400 });
  }

  // Nova Solicitacao nao aceita mais o setor informado pelo navegador. O destino inicial e uma
  // regra do servidor: toda abertura operacional nasce na fila GEO com status PENDENTE.
  const destinoInicial = await resolverDestinoInicialNovaSolicitacao();
  const areaResponsavel = destinoInicial.areaResponsavel;

  const obraSelecionada = await Obra.findOne({
    where: { id: obraId, ativo: true },
    attributes: ['id', 'nome', 'tipo_centro_custo']
  });
  if (!obraSelecionada) {
    throw Object.assign(new Error('Obra ou centro de custo inexistente ou inativo.'), { statusCode: 400 });
  }

  const contratados = [...new Set(
    (Array.isArray(parceirosInformados) && parceirosInformados.length ? parceirosInformados : [parceiroId])
      .map(Number).filter((id) => Number.isInteger(id) && id > 0)
  )];
  if (contratados.length === 0) {
    throw Object.assign(new Error('Informe ao menos um contratado.'), { statusCode: 400 });
  }

  // O primeiro contratado identifica a contraparte nas previsoes financeiras. Quem efetivamente
  // recebe e por qual meio so e definido na medicao, que e a solicitacao de pagamento.
  const parceiroPrevisao = contratados[0];

  // Normaliza UMA vez e grava o que validou: gravar Number(valorTotal) cru deixava o
  // MySQL rearredondar e divergir do centavo usado na validacao (F7).
  const valorCent = paraCentavos(valorTotal);
  if (!Number.isFinite(valorCent) || valorCent <= 0) {
    throw Object.assign(new Error('Valor do contrato e obrigatorio.'), { statusCode: 400 });
  }
  const valor = valorCent / 100;

  // Somente novos contratos acima do limite recebem esta fotografia. Contratos antigos ficam com
  // NULL e nao sao tornados retroativamente invalidos por uma exigencia que nao existia quando
  // foram abertos.
  const { limite_cent: limiteJuridicoCent } = await obterLimiteJuridico();
  const qualificacaoRepresentante = valorCent > limiteJuridicoCent
    ? normalizarQualificacaoRepresentanteLegal(qualificacaoRepresentanteInformada)
    : null;

  // A negociacao detalhada NAO e mais cobrada aqui (PI-20).
  //
  // Ela era um campo de TEXTO exigido nesta funcao (CT-9). Virou DOCUMENTO, e documento nao chega
  // junto com a criacao: o corpo aqui e JSON e o arquivo sobe num segundo passo, quando ja existe
  // um contrato a que anexar. Manter a cobranca do texto neste ponto tornava impossivel criar
  // qualquer contrato acima do limite pela tela nova — o campo saiu do formulario, entao ele chega
  // sempre vazio.
  //
  // Quem cobra agora e `aprovarContrato`, que exige anexo com `tipo = NEGOCIACAO_DETALHADA`. E o
  // ponto em que o servidor consegue ver o documento, e onde o compromisso se materializa (PI-16).
  // `detalhes_contratacao` continua sendo aceito e gravado: os contratos antigos guardam o texto.

  // A CATEGORIA E OS DADOS OPERACIONAIS DE PAGAMENTO NAO SAO EXIGIDOS AQUI (PI-16).
  //
  // Ela era obrigatoria na criacao para o problema aparecer cedo, e nao la na aprovacao. So que
  // quem abre o contrato e o usuario da OBRA, que nao conhece os planos financeiros da empresa —
  // exigir dele o plano de contas empurrava uma decisao financeira para quem nao tem como
  // toma-la. A categoria passou a ser informada por quem APROVA, e a aprovacao e barrada sem ela
  // (`garantirCategoriaParaTitulos`), nos dois caminhos: abaixo e acima do limite do Juridico.
  //
  // A abertura grava apenas o cronograma previsto. Forma, favorecido, chave PIX, boleto e demais
  // instrucoes sao validados e fotografados por `medicaoContratoService` em cada medicao.


  // Apropriacao e obrigatoria no fluxo novo: o titulo gerado na aprovacao precisa dela, e a
  // auditoria provou que nada gravava contrato_apropriacoes — o vinculo so existia quando o
  // teste o plantava a mao. Percentuais somam 100 com tolerancia de 0,01 (33,333333 x 3 vale).
  // Percentual normalizado a 4 casas: e o que a coluna decimal(7,4) grava. Validar com 6
  // e gravar com 4 fazia o registro divergir do que foi validado.
  const apropriacoes = (Array.isArray(apropriacoesInformadas) ? apropriacoesInformadas : [])
    .map((a) => ({ apropriacao_id: Number(a?.apropriacao_id), percentual: Math.round(Number(a?.percentual) * 10000) / 10000 }));

  const idsVistos = new Set();
  for (const a of apropriacoes) {
    if (idsVistos.has(a.apropriacao_id)) {
      throw Object.assign(new Error('Apropriacao repetida na lista.'), { statusCode: 400 });
    }
    idsVistos.add(a.apropriacao_id);
  }

  if (apropriacoes.length === 0) {
    throw Object.assign(new Error('Informe ao menos uma apropriacao.'), { statusCode: 400 });
  }

  for (const a of apropriacoes) {
    if (!Number.isInteger(a.apropriacao_id) || a.apropriacao_id <= 0 ||
        !Number.isFinite(a.percentual) || a.percentual <= 0) {
      throw Object.assign(new Error('Apropriacao ou percentual invalido.'), { statusCode: 400 });
    }
  }

  const somaPct = apropriacoes.reduce((acc, a) => acc + a.percentual, 0);
  if (Math.abs(somaPct - 100) > 0.01) {
    throw Object.assign(
      new Error(`Os percentuais das apropriacoes somam ${somaPct.toFixed(4)}; devem somar 100.`),
      { statusCode: 400 }
    );
  }

  const registrosApropriacao = await Apropriacao.findAll({
    where: { id: apropriacoes.map((a) => a.apropriacao_id), obra_id: obraId, ativo: true },
    attributes: ['id', 'somadora']
  });
  if (registrosApropriacao.length !== apropriacoes.length) {
    throw Object.assign(
      new Error('Ha apropriacao inexistente, inativa ou de outra obra.'),
      { statusCode: 400 }
    );
  }
  // Somadora e no de agrupamento, nao recebe lancamento: aceitar aqui criava contrato que
  // nunca aprovava (validacao diferida apontada em auditoria).
  if (registrosApropriacao.some((a) => a.somadora)) {
    throw Object.assign(
      new Error('Apropriacao somadora (de agrupamento) nao pode receber lancamento.'),
      { statusCode: 400 }
    );
  }

  // A categoria precisa estar na lista curada (tela Categorias do Contrato de Obra) — sem
  // esta checagem a curadoria nao restringia nada, como a auditoria demonstrou.
  // Depois da PI-16 a categoria pode nao vir na criacao. Quando VIER, a curadoria continua
  // valendo — o que nao pode e a lista curada deixar de restringir, que foi achado de auditoria.
  if (categoriaFinanceiraId) {
    await garantirCategoriaLiberada(categoriaFinanceiraId);
  }

  if (Number(qtdeParcelas) > MAXIMO_PARCELAS) {
    throw Object.assign(
      new Error(`A quantidade de parcelas nao pode passar de ${MAXIMO_PARCELAS}.`),
      { statusCode: 400 }
    );
  }

  // Vinculo tipo/subtipo — o que define o fluxo (D38-a: por id vinculado, nunca por nome).
  //
  // Fechado por INVARIANTE, nao por condicional: a versao anterior validava dentro de
  // `if (tipoSubId)` e filtrava o macro so quando ele vinha, entao omitir qualquer um dos
  // dois campos desligava a protecao (subtipo sem macro e macro de tipo que nem usa este
  // fluxo passavam). Cada campo e validado por si, e a exigencia de subtipo vem do
  // comportamento do proprio tipo — nao de lista fixa.
  //
  // Os dois ausentes continua valendo: e o contrato de API das etapas 7-8, ja auditado.
  if (tipoSubId && !tipoMacroId) {
    throw Object.assign(
      new Error('Informe o tipo de solicitacao (tipo_macro_id) ao qual o subtipo pertence.'),
      { statusCode: 400 }
    );
  }

  let rotuloDataSolicitacao = 'Data de Resposta';
  if (tipoMacroId) {
    if (!Number.isInteger(Number(tipoMacroId))) {
      throw Object.assign(new Error('Tipo de solicitacao invalido.'), { statusCode: 400 });
    }
    // Sem esta checagem o id inexistente so estourava na FK do INSERT, virando 500 generico.
    const tipoMacro = await TipoSolicitacao.findByPk(Number(tipoMacroId));
    if (!tipoMacro) {
      throw Object.assign(new Error('Tipo de solicitacao inexistente.'), { statusCode: 400 });
    }
    await assertTipoDisponivelNoDestino(obraSelecionada, tipoMacro);

    const comportamentoMacro = normalizeTipoSolicitacaoBehavior(tipoMacro);
    rotuloDataSolicitacao = obterRotuloDataSolicitacao(comportamentoMacro);
    if (!comportamentoMacro.usa_fluxo_contrato_novo) {
      throw Object.assign(
        new Error('O tipo de solicitacao informado nao usa o fluxo novo de contratos.'),
        { statusCode: 400 }
      );
    }

    const configCampos = await obterConfigCamposNovaSolicitacao();
    const camposResolvidos = resolverCamposNovaSolicitacao(
      comportamentoMacro,
      configCampos,
      tipoMacro.id,
      {
        areaResponsavel,
        tipoSubId,
        apropriacoesDisponiveis: true
      }
    );
    const campoVisivel = (campoId) => camposResolvidos?.[campoId]?.visivel !== false;
    const campoObrigatorio = (campoId) => Boolean(camposResolvidos?.[campoId]?.obrigatorio);
    const exigencias = [
      ['descricao', descricao, 'Informe o titulo do contrato.'],
      ['data_vencimento', dataRespostaPagamento, `Informe a ${rotuloDataSolicitacao.toLocaleLowerCase('pt-BR')}.`],
      ['contrato_objeto', objeto, 'Informe o objeto do contrato.'],
      ['contrato_justificativa', justificativa, 'Informe a justificativa da contratacao.'],
      ['contrato_responsavel', responsavelId, 'Selecione o responsavel pela contratacao.'],
      ['contrato_vigencia_inicio', vigenciaInicio, 'Informe a vigencia inicial do contrato.'],
      ['contrato_vigencia_fim', vigenciaFim, 'Informe a vigencia final do contrato.']
    ];
    const pendente = exigencias.find(
      ([campoId, valor]) => campoObrigatorio(campoId) && !String(valor || '').trim()
    );
    if (pendente) {
      throw Object.assign(new Error(pendente[2]), { statusCode: 400 });
    }

    if (!campoVisivel('descricao')) {
      descricaoPersistida = null;
      refContratoPersistido = null;
    }
    if (!campoVisivel('data_vencimento')) dataRespostaPagamentoPersistida = null;
    if (!campoVisivel('contrato_objeto')) objetoPersistido = null;
    if (!campoVisivel('contrato_justificativa')) justificativaPersistida = null;
    if (!campoVisivel('contrato_responsavel')) responsavelIdPersistido = null;
    if (!campoVisivel('contrato_vigencia_inicio')) vigenciaInicioPersistida = null;
    if (!campoVisivel('contrato_vigencia_fim')) vigenciaFimPersistida = null;
    // O SUBTIPO NAO VALE MAIS AQUI (item 1 do lote de 23/08).
    //
    // Este servico E o fluxo novo de contrato, e por ele so existe a abertura — o subtipo nao
    // separava nada. A configuracao do tipo 33 ainda diz `exige_subtipo: true`, e de proposito nao
    // a alterei: mexer no comportamento gravado seria mudar dado do cliente por conta propria, e
    // amanha alguem religa o campo na tela de configuracao e a criacao volta a quebrar — porque a
    // tela deixou de enviar `tipo_sub_id`. A regra vale por codigo, nao por ajuste que se desfaz.
    //
    // O subtipo continua sendo ACEITO quando vier (contratos antigos, integracoes), e validado
    // logo abaixo contra o macro. O que saiu foi a obrigatoriedade.

    if (tipoSubId) {
      const subtipo = await TipoSubContrato.findOne({
        where: { id: tipoSubId, ativo: true, tipo_macro_id: Number(tipoMacroId) }
      });
      if (!subtipo) {
        throw Object.assign(
          new Error('Subtipo inexistente, inativo ou nao vinculado ao tipo de solicitacao informado.'),
          { statusCode: 400 }
        );
      }
    }
  }

  if (dataRespostaPagamentoPersistida) {
    const dataNormalizada = somenteData(dataRespostaPagamentoPersistida);
    if (!dataNormalizada) {
      throw Object.assign(new Error(`${rotuloDataSolicitacao} invalida.`), { statusCode: 400 });
    }
    dataRespostaPagamentoPersistida = formatarISO(dataNormalizada);

    const partesHoje = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    const hoje = Object.fromEntries(partesHoje.map((parte) => [parte.type, parte.value]));
    const hojeIso = `${hoje.year}-${hoje.month}-${hoje.day}`;
    if (dataRespostaPagamentoPersistida < hojeIso) {
      throw Object.assign(
        new Error(`${rotuloDataSolicitacao} nao pode ser anterior a data atual.`),
        { statusCode: 400 }
      );
    }
  } else {
    dataRespostaPagamentoPersistida = null;
  }

  // A lista da tela ja vem filtrada pela obra, mas a regra precisa existir tambem na gravacao:
  // um payload manual nao pode atribuir o contrato a usuario de outra obra.
  responsavelIdPersistido = await validarResponsavelVinculadoObra(
    responsavelIdPersistido,
    obraId
  );

  // Calcula as parcelas antes de abrir a transacao: erro de regra nao deve consumir
  // numero da sequencia nem manter transacao aberta. Erros destas funcoes trazem `code`
  // mas nao statusCode — sem o 400 aqui, viravam 500 generico na borda HTTP (auditoria 7+8).
  let parcelas;
  try {
    parcelas = gerarParcelas({
      valorTotal: valor,
      quantidade: qtdeParcelas,
      primeiroVencimento,
      periodicidade
    });
  } catch (e) {
    throw Object.assign(new Error(e.message), { statusCode: 400 });
  }

  // Parcelas EDITADAS pela tela (redistribuicao): a tela mostrava a edicao e o backend
  // regenerava divisao igual em silencio — falha F1 da auditoria. Aceita a lista editada
  // desde que preserve quantidade, some exatamente o valor do contrato e tenha vencimentos
  // validos; qualquer divergencia e 400, nunca substituicao silenciosa.
  if (Array.isArray(dados.parcelas) && dados.parcelas.length > 0) {
    const editadas = dados.parcelas.map((p2) => ({
      numero: Number(p2?.numero),
      valor: Number(p2?.valor),
      vencimento: String(p2?.vencimento || '')
    }));
    if (editadas.length !== parcelas.length) {
      throw Object.assign(new Error('Quantidade de parcelas editadas nao confere.'), { statusCode: 400 });
    }
    // paraCentavos canonico (por digitos): o cents local com toFixed reintroduzia a
    // conversao binaria banida — 8333.335 validava igual dos dois lados e o banco gravava
    // parcela 8333.33 contra contrato 8333.34 (F4 da reauditoria).
    const cents = (v) => paraCentavos(v);
    const soma = editadas.reduce((a, p2) => a + cents(p2.valor), 0);
    if (soma !== valorCent) {
      throw Object.assign(new Error('A soma das parcelas editadas difere do valor do contrato.'), { statusCode: 400 });
    }
    for (const [i, p2] of editadas.entries()) {
      // somenteData rejeita data impossivel (2026-02-31); o regex validava so o formato
      // e o INSERT estourava 500 em STRICT mode (F6).
      const dataOk = somenteData(p2.vencimento);
      if (p2.numero !== i + 1 || !(cents(p2.valor) > 0) || !dataOk) {
        throw Object.assign(new Error(`Parcela editada ${i + 1} invalida.`), { statusCode: 400 });
      }
      p2.vencimento = formatarISO(dataOk);
    }
    parcelas = editadas.map((p2) => ({ numero: p2.numero, valor: cents(p2.valor) / 100, vencimento: p2.vencimento }));
  }

  if (apropriacoes.length > 1) {
    const menorParcelaCent = Math.min(...parcelas.map((p) => Math.round(p.valor * 100)));
    const semCentavo = apropriacoes.find((a) => Math.floor((menorParcelaCent * a.percentual) / 100) < 1);
    if (semCentavo) {
      throw Object.assign(
        new Error(`O percentual ${semCentavo.percentual}% nao rende nem um centavo na menor parcela — o contrato nunca aprovaria.`),
        { statusCode: 400 }
      );
    }
  }

  return sequelize.transaction(async (transaction) => {
    const codigo = await gerarProximoCodigo({ transaction });

    const contrato = await Contrato.create(
      {
        obra_id: obraId,
        codigo,
        ref_contrato: refContratoPersistido || null,
        descricao: descricaoPersistida || null,
        objeto: objetoPersistido || null,
        detalhes_contratacao: detalhesContratacao || null,
        representante_legal_qualificacao: qualificacaoRepresentante,
        valor_total: valor,
        valor_aditivos: 0,
        fluxo_novo: true,
        status_contrato: STATUS_CONTRATO.AGUARDANDO_APROVACAO,
        vigencia_inicio: vigenciaInicioPersistida || null,
        vigencia_fim: vigenciaFimPersistida || null,
        responsavel_id: responsavelIdPersistido || null,
        forma_pagamento_id: null,
        favorecido_id: null,
        justificativa: justificativaPersistida || null,
        qtde_parcelas: parcelas.length,
        categoria_financeira_id: categoriaFinanceiraId,
        tipo_macro_id: tipoMacroId || null,
        tipo_sub_id: tipoSubId || null,
        ativo: true
      },
      { transaction }
    );

    // Contratados do contrato. O fluxo novo nunca gravava isto — o parceiro so aparecia nas
    // parcelas, e o contrato ficava sem contratado registrado.
    await ContratoCredor.bulkCreate(
      contratados.map((id) => ({ contrato_id: contrato.id, parceiro_id: id, ativo: true })),
      { transaction }
    );

    await ContratoApropriacao.bulkCreate(
      apropriacoes.map((a) => ({
        contrato_id: contrato.id,
        apropriacao_id: a.apropriacao_id,
        percentual: a.percentual
      })),
      { transaction }
    );

    const registros = await ContratoParcela.bulkCreate(
      parcelas.map((parcela) => ({
        contrato_id: contrato.id,
        numero: parcela.numero,
        valor: parcela.valor,
        // Congela o previsto: a medicao altera `valor`, este fica como estava (PI-5).
        valor_previsto: parcela.valor,
        data_vencimento: parcela.vencimento,
        status: STATUS_PARCELA.PREVISAO,
        travada: false,
        titulo_financeiro_id: null,
        // A contraparte identifica de quem e a previsao. Favorecido e forma de pagamento ficam
        // nulos ate a medicao aprovada informar a instrucao de pagamento efetiva.
        parceiro_id: parceiroPrevisao,
        forma_pagamento_id: null,
        criado_por: usuarioId || null,
        atualizado_por: usuarioId || null
      })),
      { transaction }
    );

    // PI-16: o contrato passa a viver DENTRO de uma solicitacao — a unica dele, que o acompanha
    // por toda a vida. Medicoes e aditivos do fluxo novo alteram esta; nao criam outras.
    //
    // Criada na MESMA transacao do contrato de proposito: contrato sem solicitacao e solicitacao
    // sem contrato sao dois estados invalidos, e um rollback parcial deixaria um dos dois orfao.
    //
    // Nasce PENDENTE, como qualquer solicitacao. O valor e o do contrato; as PARCELAS aparecem
    // como previsao no card do Financeiro e so viram titulo na aprovacao (PI-1/PI-5).
    const solicitacao = await Solicitacao.create(
      {
        codigo: await gerarCodigoSolicitacao(),
        obra_id: obraId,
        parceiro_id: parceiroPrevisao,
        apropriacao_id: apropriacoes.length === 1 ? apropriacoes[0].apropriacao_id : null,
        tipo_solicitacao_id: tipoMacroId || null,
        tipo_macro_id: tipoMacroId || null,
        tipo_sub_id: tipoSubId || null,
        contrato_id: contrato.id,
        codigo_contrato: contrato.codigo,
        descricao: descricaoPersistida || contrato.codigo,
        favorecido_id: null,
        forma_pagamento_id: null,
        favorecido_chave_pix: null,
        valor: valor,
        area_responsavel: areaResponsavel || null,
        data_vencimento: dataRespostaPagamentoPersistida,
        criado_por: usuarioId || null,
        status_global: 'PENDENTE'
      },
      { transaction }
    );

    // O elo de volta. `solicitacoes.contrato_id` e de muitos-para-um (a trilha legada tem varias
    // solicitacoes por contrato); este responde "qual e A solicitacao deste contrato".
    await contrato.update({ solicitacao_id: solicitacao.id }, { transaction });

    // A primeira linha da linha do tempo. Sem ela o card Historico da solicitacao de contrato
    // abria vazio, enquanto toda solicitacao do fluxo padrao nasce com o seu `SOLICITACAO_CRIADA`.
    await registrarHistoricoDoContrato(solicitacao, {
      acao: 'SOLICITACAO_CRIADA',
      descricao: `Contrato ${contrato.codigo} aberto no valor de R$ ${valor.toFixed(2)}, aguardando aprovacao.`,
      usuario: { id: usuarioId, setor: areaResponsavel },
      statusNovo: solicitacao.status_global,
      metadata: { contrato_id: contrato.id, valor, area_responsavel: areaResponsavel },
      transaction
    });

    // A JUSTIFICATIVA DA CONTRATACAO VIRA EVENTO DO HISTORICO (item 18, 23/08).
    //
    // Ela era gravada em `contratos.justificativa` e NAO era exibida em lugar nenhum — um campo que
    // so existia para o banco. O cliente decidiu "em vez de": ela vai para o historico e nao vira
    // campo de tela, o que tambem resolve o item 14.
    //
    // A coluna continua sendo gravada. O historico e onde a justificativa e LIDA; a coluna e onde
    // ela e o dado. Trocar uma pela outra perderia a justificativa de todo contrato ja aberto.
    //
    // Acao propria, e nao texto embutido no evento de criacao, porque o historico e filtrado e lido
    // POR ACAO em varios pontos do sistema: enterrada dentro de outra linha, a justificativa ficaria
    // invisivel de novo — que e exatamente o problema que este item resolve.
    if (String(justificativaPersistida || '').trim()) {
      await registrarHistoricoDoContrato(solicitacao, {
        acao: 'JUSTIFICATIVA_REGISTRADA',
        descricao: `Justificativa da contratacao: ${String(justificativaPersistida).trim()}`,
        usuario: { id: usuarioId, setor: areaResponsavel },
        metadata: { contrato_id: contrato.id },
        transaction
      });
    }

    // NENHUM contrato nasce aprovado, em qualquer valor: todos passam pela aprovacao da
    // Gerencia de Processos (decisao do cliente, 17/08 — corrigindo entendimento anterior).
    // A politica do limite de R$ 50 mil e outra coisa: abaixo dele o contrato dispensa a
    // etapa seguinte no JURIDICO.
    return {
      contrato: {
        id: contrato.id,
        codigo: contrato.codigo,
        valor_total: Number(contrato.valor_total),
        status_contrato: contrato.status_contrato,
        solicitacao_id: solicitacao.id,
        fluxo_novo: true
      },
      solicitacao: {
        id: solicitacao.id,
        codigo: solicitacao.codigo,
        status_global: solicitacao.status_global
      },
      parcelas: registros.map((p) => ({
        id: p.id,
        numero: p.numero,
        valor: Number(p.valor),
        vencimento: p.data_vencimento,
        status: p.status
      }))
    };
  });
}


/**
 * Aprova um contrato do fluxo novo: as parcelas viram titulos financeiros.
 *
 * A partir daqui os valores PASSAM a aparecer no financeiro — e isso e o esperado.
 * Ate a aprovacao, a parcela vive so em contrato_parcelas e nao alcanca nenhuma das 27
 * rotas financeiras (ver MAPA-IMPACTO-PARCELAS.md).
 *
 * Permissao ESTRITA: `contratos.aprovacao.aprovar` e exigida inclusive de SUPERADMIN e
 * ADMINISTRADOR, que normalmente teriam bypass. Decisao do cliente (D3/D4), por se tratar
 * de liberacao de valor acima de R$ 50.000.
 */
/**
 * CANCELAR a solicitacao do contrato (PI-16) — terminal, ao contrario de rejeitar.
 *
 * Decisao do cliente (19/08): rejeitar DEVOLVE ao responsavel em `PENDENTE DE AJUSTE`, para
 * corrigir e reenviar; cancelar ENCERRA e a solicitacao nao volta. Sao acoes diferentes, e por
 * isso o cancelar tem permissao propria.
 *
 * A permissao manda, NAO o setor: o cliente pediu que valesse para o Juridico e para a Gerencia de
 * Processos, e amarrar em setor deixaria de fora quem a empresa autorizar depois.
 *
 * Nao mexe em titulo nem em saldo: se o contrato ja estiver ATIVO com titulos, o caminho e
 * ENCERRAR (que devolve saldo e limpa titulos em aberto), nao cancelar o pedido.
 */
async function cancelarSolicitacaoDoContrato(contratoId, { usuario, motivo } = {}) {
  const { userHasStrictAreaPermission } = require('./authorizationService');
  const permitido = await userHasStrictAreaPermission(usuario, ['contratos.solicitacao.cancelar']);
  if (!permitido) {
    throw Object.assign(
      new Error('Acesso negado: cancelar a solicitacao do contrato exige permissao especifica.'),
      { statusCode: 403 }
    );
  }
  if (!String(motivo || '').trim()) {
    throw Object.assign(new Error('Informe o motivo do cancelamento.'), { statusCode: 400 });
  }

  return sequelize.transaction(async (transaction) => {
    const contrato = await Contrato.findOne({
      where: { id: contratoId, fluxo_novo: true },
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    if (!contrato) throw Object.assign(new Error('Contrato do fluxo novo nao encontrado.'), { statusCode: 404 });

    if (!podeCancelarSolicitacaoContrato(contrato, usuario, permitido)) {
      throw Object.assign(
        new Error('A Gerencia de Processos nao pode cancelar o contrato depois que o Juridico enviou a minuta para assinatura.'),
        { statusCode: 403 }
      );
    }

    // Com titulos ja criados o cancelamento seria uma quebra de contrato disfarcada — e essa
    // tem regra propria (encerramento), com devolucao de saldo e limpeza de titulos.
    if (contrato.status_contrato === STATUS_CONTRATO.ATIVO) {
      throw Object.assign(
        new Error('Contrato ja ATIVO: use encerrar contrato, que devolve o saldo e trata os titulos.'),
        { statusCode: 409 }
      );
    }
    if (contrato.status_contrato === STATUS_CONTRATO.ENCERRADO) {
      throw Object.assign(new Error('Contrato ja esta encerrado.'), { statusCode: 409 });
    }

    await contrato.update(
      { ativo: false, motivo_rejeicao: String(motivo).trim().slice(0, 255) },
      { transaction }
    );

    // CANCELADA e terminal e nao esta no mapa de espelhamento de proposito: nao existe estado de
    // contrato equivalente. O contrato fica inativo; a solicitacao, cancelada.
    const solicitacao = await Solicitacao.findByPk(contrato.solicitacao_id, { transaction });
    if (solicitacao) {
      await solicitacao.update({ status_global: 'CANCELADA', cancelada: true }, { transaction });
    }

    return {
      contrato: { id: contrato.id, codigo: contrato.codigo, ativo: false },
      solicitacao: solicitacao ? { id: solicitacao.id, status_global: 'CANCELADA' } : null
    };
  });
}

/**
 * Editar o RATEIO DE APROPRIACOES do contrato de dentro da solicitacao (20/08).
 *
 * A solicitacao de Abertura de Contrato mostrava apropriacao vazia porque lia
 * `solicitacao_apropriacoes`, e o rateio do contrato vive em `contrato_apropriacoes`. As duas
 * tabelas NAO sao duplicata: a da solicitacao e uma subdivisao POR SOLICITACAO dentro da lista do
 * contrato, e faz sentido numa medicao do fluxo antigo. Na PI-16, porem, a solicitacao E o
 * contrato — entao o rateio dela e o dele, e e este o registro que se edita.
 *
 * Importa que seja este e nao aquele: e de `contrato_apropriacoes` que `montarRateios` tira a
 * divisao de cada parcela na aprovacao. Editar a lista da solicitacao nao mudaria um centavo dos
 * titulos, so criaria uma segunda versao da verdade.
 */
async function atualizarApropriacoesDoContrato(contratoId, { usuario, req, apropriacoes, motivo } = {}) {
  const { userHasAreaPermission } = require('./authorizationService');

  const permitido = await userHasAreaPermission(usuario, ['contratos.geral.editar']);
  if (!permitido) {
    throw Object.assign(
      new Error('Acesso negado: alterar as apropriacoes do contrato exige permissao de edicao de contratos.'),
      { statusCode: 403 }
    );
  }

  // Motivo obrigatorio: sem ele nao ha como reconstruir depois por que o rateio mudou — e rateio
  // e a conta que decide em qual centro de custo o dinheiro cai.
  const motivoLimpo = String(motivo || '').trim();
  if (!motivoLimpo) {
    throw Object.assign(new Error('Informe o motivo da alteracao das apropriacoes.'), { statusCode: 400 });
  }

  const linhas = (Array.isArray(apropriacoes) ? apropriacoes : [])
    .map((item) => ({
      apropriacao_id: Number(item?.apropriacao_id),
      percentual: Number(item?.percentual)
    }))
    .filter((item) => Number.isInteger(item.apropriacao_id) && item.apropriacao_id > 0);

  if (linhas.length === 0) {
    throw Object.assign(new Error('Informe ao menos uma apropriacao.'), { statusCode: 400 });
  }

  const repetidas = new Set();
  for (const linha of linhas) {
    if (repetidas.has(linha.apropriacao_id)) {
      throw Object.assign(new Error('A mesma apropriacao foi informada mais de uma vez.'), { statusCode: 400 });
    }
    repetidas.add(linha.apropriacao_id);
    if (!Number.isFinite(linha.percentual) || linha.percentual <= 0) {
      throw Object.assign(new Error('Cada apropriacao precisa de um percentual maior que zero.'), { statusCode: 400 });
    }
  }

  // Mesma tolerancia da tela (0,0001). Digitacao decimal nao fecha exata — 33,3333 x 3 = 99,9999 —
  // e quem resolve a sobra e `montarRateios`, em centavos inteiros, na hora de criar os titulos.
  const soma = linhas.reduce((acc, item) => acc + item.percentual, 0);
  if (Math.abs(soma - 100) > 0.0001) {
    throw Object.assign(new Error('A soma dos percentuais do rateio deve ser exatamente 100%.'), { statusCode: 400 });
  }

  const resultado = await sequelize.transaction(async (transaction) => {
    const contrato = await Contrato.findOne({
      where: { id: contratoId, fluxo_novo: true },
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    if (!contrato) throw Object.assign(new Error('Contrato do fluxo novo nao encontrado.'), { statusCode: 404 });

    // Depois que os titulos nascem, o rateio DELES ja esta gravado em `titulos_financeiros_rateios`.
    // Mudar a origem sem mudar o destino deixaria contrato e titulo discordando em silencio — que e
    // exatamente a trava que a edicao de apropriacoes da solicitacao ja aplica.
    if ([STATUS_CONTRATO.ATIVO, STATUS_CONTRATO.ENCERRADO].includes(contrato.status_contrato)) {
      throw Object.assign(
        new Error('Contrato ja ATIVO ou ENCERRADO: as apropriacoes nao podem mais ser alteradas, os titulos ja foram rateados.'),
        { statusCode: 409 }
      );
    }

    // O vinculo titulo <-> contrato vive na PARCELA (`contrato_parcelas.titulo_financeiro_id`);
    // `titulos_financeiros` nao tem coluna de contrato. Contar pelo titulo direto passaria batido.
    const totalTitulos = await ContratoParcela.count({
      where: { contrato_id: contrato.id, titulo_financeiro_id: { [Op.ne]: null } },
      transaction
    });
    if (totalTitulos > 0) {
      throw Object.assign(
        new Error('Nao e possivel alterar as apropriacoes depois que o contrato possui titulo financeiro.'),
        { statusCode: 409 }
      );
    }

    const disponiveis = await Apropriacao.findAll({
      where: { id: [...repetidas], obra_id: contrato.obra_id },
      attributes: ['id', 'codigo', 'descricao', 'ativo', 'somadora'],
      transaction
    });
    const mapa = new Map(disponiveis.map((item) => [Number(item.id), item]));

    for (const linha of linhas) {
      const apropriacao = mapa.get(linha.apropriacao_id);
      if (!apropriacao) {
        throw Object.assign(
          new Error('Uma ou mais apropriacoes nao pertencem a obra do contrato.'),
          { statusCode: 400 }
        );
      }
      if (apropriacao.ativo === false) {
        throw Object.assign(new Error(`Apropriacao ${apropriacao.codigo} esta inativa.`), { statusCode: 400 });
      }
      // Somadora e no total, nao recebe lancamento — a mesma regra que a solicitacao aplica.
      if (apropriacao.somadora === true) {
        throw Object.assign(
          new Error(`Apropriacao ${apropriacao.codigo} e somadora. Selecione apenas apropriacoes analiticas.`),
          { statusCode: 400 }
        );
      }
    }

    const anteriores = await ContratoApropriacao.findAll({
      where: { contrato_id: contrato.id },
      include: [{ model: Apropriacao, as: 'apropriacao', attributes: ['codigo'] }],
      transaction
    });
    const descreve = (lista) => lista
      .map((item) => `${item.codigo || item.apropriacao_id} ${Number(item.percentual).toFixed(4).replace('.', ',')}%`)
      .join(' · ');

    await ContratoApropriacao.destroy({ where: { contrato_id: contrato.id }, transaction });
    await ContratoApropriacao.bulkCreate(
      linhas.map((linha) => ({
        contrato_id: contrato.id,
        apropriacao_id: linha.apropriacao_id,
        percentual: linha.percentual
      })),
      { transaction }
    );

    const solicitacao = contrato.solicitacao_id
      ? await Solicitacao.findByPk(contrato.solicitacao_id, { transaction })
      : null;

    if (solicitacao) {
      await Historico.create({
        solicitacao_id: solicitacao.id,
        usuario_responsavel_id: usuario?.id || null,
        // `setor` e NOT NULL: cai na area da solicitacao quando o usuario nao tiver setor.
        setor: codigoDoSetor(usuario) || solicitacao.area_responsavel || '-',
        acao: 'CONTRATO_APROPRIACOES_ALTERADAS',
        descricao: `Rateio de apropriacoes do contrato ${contrato.codigo} alterado. Motivo: ${motivoLimpo}`,
        metadata: JSON.stringify({
          contrato_id: contrato.id,
          antes: descreve(anteriores.map((item) => ({
            apropriacao_id: item.apropriacao_id,
            codigo: item.apropriacao?.codigo,
            percentual: item.percentual
          }))),
          depois: descreve(linhas.map((linha) => ({
            apropriacao_id: linha.apropriacao_id,
            codigo: mapa.get(linha.apropriacao_id)?.codigo,
            percentual: linha.percentual
          })))
        })
      }, { transaction });
    }

    return {
      contrato_id: contrato.id,
      apropriacoes: linhas.map((linha) => ({
        apropriacao_id: linha.apropriacao_id,
        codigo: mapa.get(linha.apropriacao_id)?.codigo || null,
        descricao: mapa.get(linha.apropriacao_id)?.descricao || null,
        percentual: linha.percentual
      }))
    };
  });

  // Fora da transacao de proposito: evento gravado dentro sobreviveria ao rollback e deixaria
  // trilha de alteracao que nao aconteceu.
  await registrarEventoSeguranca({
    req,
    usuarioId: usuario?.id || null,
    tipoEvento: 'CONTRACT_APPROPRIATIONS_UPDATED',
    recursoTipo: 'CONTRATO',
    recursoId: contratoId,
    status: 'SUCCESS',
    descricao: 'Rateio de apropriacoes do contrato alterado',
    metadata: { motivo: motivoLimpo, apropriacoes: resultado.apropriacoes }
  });

  return resultado;
}

async function aprovarContrato(contratoId, { usuario, req, categoriaFinanceiraId } = {}) {
  const { userHasStrictAreaPermission } = require('./authorizationService');

  const permitido = await userHasStrictAreaPermission(usuario, ['contratos.aprovacao.aprovar']);
  if (!permitido) {
    throw Object.assign(
      new Error('Acesso negado: aprovacao de contrato exige permissao especifica.'),
      { statusCode: 403 }
    );
  }

  // O servico de titulo precisa do req para auditoria. Sem estas guardas, req ausente
  // virava TypeError sem statusCode, e um req.user divergente do aprovador registraria a
  // criacao dos titulos em nome de outra pessoa.
  if (!req?.user?.id) {
    throw Object.assign(new Error('Requisicao invalida para aprovacao.'), { statusCode: 400 });
  }

  if (Number(req.user.id) !== Number(usuario?.id)) {
    throw Object.assign(
      new Error('Usuario da sessao diverge do aprovador informado.'),
      { statusCode: 400 }
    );
  }

  const resultado = await sequelize.transaction(async (transaction) => {
    const contrato = await Contrato.findOne({
      where: { id: contratoId, fluxo_novo: true },
      lock: transaction.LOCK.UPDATE,
      transaction
    });

    if (!contrato) {
      throw Object.assign(new Error('Contrato do fluxo novo nao encontrado.'), { statusCode: 404 });
    }

    // Bloqueia reaprovacao: sem isto, aprovar duas vezes duplicaria os titulos.
    if (contrato.status_contrato !== STATUS_CONTRATO.AGUARDANDO_APROVACAO) {
      throw Object.assign(
        new Error(`Contrato nao esta aguardando aprovacao (status atual: ${contrato.status_contrato}).`),
        { statusCode: 409 }
      );
    }

    // PI-16: quem aprova e quem informa a categoria financeira que vale para TODOS os titulos
    // deste contrato. A curadoria (tela Categorias do Contrato de Obra) continua valendo aqui —
    // aprovar nao pode ser uma porta lateral para uma categoria nao liberada.
    if (categoriaFinanceiraId) {
      await garantirCategoriaLiberada(categoriaFinanceiraId, transaction);
      await contrato.update({ categoria_financeira_id: Number(categoriaFinanceiraId) }, { transaction });
    }

    // PI-16: a categoria e exigida NA APROVACAO, e antes da bifurcacao de proposito.
    //
    // Se a guarda ficasse so em `aplicarAprovacaoNaTransacao`, o contrato ACIMA do limite passaria
    // batido: ele desvia para o Juridico sem criar titulo, e so descobriria a falta la na
    // assinatura — depois de toda a tramitacao. O cliente pediu explicitamente "obrigatorio antes
    // da aprovacao, tanto abaixo quanto acima". Aqui cobre os dois; a de baixo continua como
    // guarda do ponto onde o titulo realmente nasce.
    garantirCategoriaParaTitulos(contrato);

    // Ate o limite o contrato ja fica ATIVO (e os titulos nascem aqui). Somente acima do
    // limite ele segue para o JURIDICO: nada de titulo ainda, porque o compromisso so
    // existe depois da assinatura (PI-1 + PI-5).
    const { limite_cent: limiteCent } = await obterLimiteJuridico();
    const acimaDoLimite = paraCentavos(contrato.valor_total) > limiteCent;

    // A negociacao detalhada virou DOCUMENTO (20/08), e e aqui que ela e cobrada — nao na criacao.
    //
    // A criacao e JSON e o arquivo sobe num segundo passo, entao naquele momento o servidor nao
    // tem o documento em maos. A tela cobra no submit para a pessoa nao descobrir depois; esta
    // guarda e a que nao da para contornar, e fica no ponto em que o compromisso se materializa.
    // TODO contrato do fluxo novo, e nao so acima do limite (item 7 do lote de 23/08). O documento
    // deixou de ser exigencia do contrato grande e virou parte do que define um contrato.
    const temDocumento = await ContratoAnexo.count({
      where: { contrato_id: contrato.id, tipo: TIPO_ANEXO_NEGOCIACAO },
      transaction
    });
    if (!temDocumento) {
      throw Object.assign(
        new Error('Anexe o documento da negociacao detalhada antes de aprovar: ele e obrigatorio em todo contrato.'),
        { statusCode: 400 }
      );
    }

    // Para contratos NOVOS criados sob a regra de pagamento de 29/08, boleto selecionado precisa
    // existir de verdade antes da aprovacao. A criacao recebe apenas o nome porque o arquivo sobe
    // no segundo POST; esta guarda fecha a janela entre "nome informado" e "upload confirmado".
    // Contratos historicos sem o evento nao ganham uma exigencia retroativa.
    const historicoPagamento = contrato.solicitacao_id
      ? await Historico.findOne({
        where: {
          solicitacao_id: contrato.solicitacao_id,
          acao: 'PAGAMENTO_CONTRATO_INFORMADO'
        },
        order: [['id', 'DESC']],
        transaction
      })
      : null;
    const formaContrato = contrato.forma_pagamento_id
      ? await FormaPagamentoFinanceira.findByPk(contrato.forma_pagamento_id, { transaction })
      : null;
    if (historicoPagamento && formaPagamentoEhBoleto(formaContrato)) {
      let metadataPagamento = {};
      try {
        metadataPagamento = typeof historicoPagamento.metadata === 'string'
          ? JSON.parse(historicoPagamento.metadata)
          : (historicoPagamento.metadata || {});
      } catch { /* o tipo BOLETO ainda sera aceito mesmo se o metadata antigo estiver ilegivel */ }
      const nomeEsperado = String(metadataPagamento.boleto_anexo_nome || '').trim();
      const temBoleto = await ContratoAnexo.count({
        where: {
          contrato_id: contrato.id,
          [Op.or]: [
            { tipo: 'BOLETO' },
            ...(nomeEsperado ? [{ nome_original: nomeEsperado }] : [])
          ]
        },
        transaction
      });
      if (!temBoleto) {
        throw Object.assign(
          new Error('Anexe o boleto informado na abertura antes de aprovar o contrato.'),
          { statusCode: 400 }
        );
      }
    }

    // A qualificacao nao nula identifica os contratos novos que ja nasceram sob a nova regra.
    // Assim os contratos antigos acima do limite continuam tramitando sem uma exigencia
    // retroativa impossivel de cumprir pela tela em que foram criados.
    if (acimaDoLimite && contrato.representante_legal_qualificacao) {
      const anexosJuridicos = await ContratoAnexo.findAll({
        where: {
          contrato_id: contrato.id,
          tipo: { [Op.in]: DOCUMENTOS_JURIDICOS_OBRIGATORIOS.map((item) => item.tipo) }
        },
        attributes: ['tipo'],
        transaction
      });
      const tiposPresentes = new Set(anexosJuridicos.map((anexo) => anexo.tipo));
      const faltantes = DOCUMENTOS_JURIDICOS_OBRIGATORIOS
        .filter((item) => !tiposPresentes.has(item.tipo))
        .map((item) => item.rotulo);
      if (faltantes.length > 0) {
        throw Object.assign(
          new Error(`Complete a documentacao juridica antes de aprovar: ${faltantes.join(', ')}.`),
          { statusCode: 400 }
        );
      }
    }

    if (acimaDoLimite) {
      await contrato.update(
        {
          status_contrato: STATUS_CONTRATO.EM_ANALISE_JURIDICA,
          aprovado_por: usuario?.id || null,
          aprovado_em: new Date()
        },
        { transaction }
      );
      // PI-16: espelha na solicitacao e a encaminha ao JURIDICO, parqueando a area de origem.
      await espelharERegistrar(contrato, {
        acao: 'CONTRATO_APROVADO',
        descricao: `Contrato ${contrato.codigo} aprovado e encaminhado ao Juridico (acima do limite).`,
        usuario,
        metadata: { contrato_id: contrato.id, categoria_financeira_id: contrato.categoria_financeira_id }
      }, transaction);
      return {
        contrato: { id: contrato.id, codigo: contrato.codigo, status_contrato: STATUS_CONTRATO.EM_ANALISE_JURIDICA },
        titulos_criados: 0,
        titulos_ids: [],
        encaminhado_ao_juridico: true
      };
    }

    return aplicarAprovacaoNaTransacao({ contrato, usuario, req }, transaction);
  });

  // Eventos emitidos APOS o commit: dentro da transacao eles sobreviviam ao rollback e a
  // trilha afirmava titulos que nao existiam. Aqui, so ha evento se os titulos existem.
  await emitirEventosDeTitulos(resultado, { usuario, req });

  return resultado;
}

/**
 * Corpo da aprovacao — o que transforma parcela em titulo.
 *
 * Separado de `aprovarContrato` para deixar explicito o que e REGRA DE ACESSO (permissao
 * estrita, checada por quem chama) e o que e EFEITO (parcela vira titulo, aqui).
 *
 * Roda SEMPRE dentro da transacao de quem chama: titulo, parcela e contrato mudam juntos.
 */
async function aplicarAprovacaoNaTransacao({ contrato, usuario, req }, transaction) {
  // PI-16: sem categoria nao ha titulo. Vale para os dois caminhos, porque os dois passam aqui.
  garantirCategoriaParaTitulos(contrato);
    const parcelas = await ContratoParcela.findAll({
      where: { contrato_id: contrato.id, status: STATUS_PARCELA.PREVISAO },
      order: [['numero', 'ASC']],
      transaction
    });

    if (parcelas.length === 0) {
      throw Object.assign(new Error('Contrato sem parcelas em previsao.'), { statusCode: 409 });
    }

    // Apropriacao do contrato: uma vai direta no titulo; varias viram rateio, que o
    // servico escala para o valor de cada parcela.
    const apropriacoes = await ContratoApropriacao.findAll({
      where: { contrato_id: contrato.id },
      transaction
    });

    // Revalida o vinculo: se as apropriacoes sumiram (corrupcao/manutencao direta no
    // banco), falhar claro aqui e melhor que aprovar com apropriacao NULL.
    if (apropriacoes.length === 0) {
      throw Object.assign(
        new Error('Contrato sem apropriacoes vinculadas — impossivel aprovar.'),
        { statusCode: 409 }
      );
    }

    const apropriacaoUnica = apropriacoes.length === 1 ? apropriacoes[0].apropriacao_id : null;

    // Rateio por VALOR, nao por percentual: a validacao de percentual do servico arredonda
    // a 2 casas antes de exigir soma 100, o que rejeita 33,333333 x 3. Calculando o valor
    // de cada apropriacao em centavos (sobra na ultima), a soma fecha exata por construcao.
    function montarRateios(valorParcela) {
      if (apropriacoes.length <= 1) return null;
      const totalCent = Math.round(Number(valorParcela) * 100);
      let usado = 0;
      return apropriacoes.map((a, i) => {
        const ultimo = i === apropriacoes.length - 1;
        const cent = ultimo ? totalCent - usado : Math.floor((totalCent * Number(a.percentual)) / 100);
        usado += cent;
        return { obra_id: contrato.obra_id, apropriacao_id: a.apropriacao_id, valor: cent / 100 };
      });
    }

    // Competencia DRE = mes da APROVACAO, igual para todas as parcelas (D32).
    // E na aprovacao que a obrigacao se materializa; o cronograma de parcelas e caixa,
    // nao competencia. Concentrar tudo no mesmo mes e proposital, para a analise economica.
    const agora = new Date();
    const competencia = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-01`;

    const titulosIds = [];

    // Titulos criados em SERIE pelo SERVICO do sistema, nao por TituloFinanceiro.create.
    //
    // Criar o registro direto contornava as validacoes obrigatorias (categoria, competencia,
    // forma de pagamento), deixava o valor fora da DRE, elevava o painel de pendencias e
    // nao gerava evento de auditoria. Passar pelo servico traz tudo isso de uma vez, e
    // qualquer regra futura dele passa a valer aqui automaticamente.
    for (const parcela of parcelas) {
      // eslint-disable-next-line no-await-in-loop
      const criados = await criarTituloManual(
        req,
        {
          tipo: 'PAGAR',
          // O cronograma aprovado ainda e uma previsao financeira. O titulo so fica ABERTO
          // quando a medicao desta parcela for aprovada e liberada ao Financeiro.
          status: 'PREVISAO',
          obra_id: contrato.obra_id,
          // O TITULO PASSA A GUARDAR A SOLICITACAO DELE (24/08).
          //
          // Faltava. O contrato vive dentro de uma solicitacao desde a PI-16, e esta chamada nunca
          // passou o campo: `titulos_financeiros.solicitacao_id` nascia NULO nos titulos de contrato.
          //
          // O efeito era visivel e errado: `obraGestaoService` e os relatorios financeiros decidem
          // por essa coluna se o titulo veio de uma solicitacao ou foi lancado a mao, e classificavam
          // como "TITULO MANUAL" o titulo de um contrato aprovado. Quem lia o custo da obra concluia
          // que alguem tinha lancado aquilo na mao.
          //
          // Achado pela suite 48 ao construir o item 22, e levantado em
          // `MAPA-IMPACTO-TITULO-DO-CONTRATO-SEM-SOLICITACAO.md`.
          solicitacao_id: contrato.solicitacao_id || null,
          parceiro_id: parcela.parceiro_id,
          valor: Number(parcela.valor),
          descricao: `${contrato.codigo} - parcela ${parcela.numero}/${parcelas.length}`,
          data_vencimento: parcela.data_vencimento,
          // `criarTituloManual` trata BOLETO/CHEQUE/OUTROS como formas que exigem o vencimento no
          // objeto da parcela. Aqui cada chamada ja representa UMA parcela do contrato, mas enviar
          // a data apenas no nivel principal fazia o servico financeiro ignora-la para boleto e
          // responder "Informe o vencimento ... da parcela 1", mesmo com o cronograma gravado.
          parcelas: [{
            valor: Number(parcela.valor),
            data_vencimento: parcela.data_vencimento
          }],
          // Emissao e a data da aprovacao: e quando o titulo passa a existir. Usar o
          // vencimento gerava titulo "emitido" no futuro.
          data_emissao: `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`,
          competencia_data: competencia,
          categoria_financeira_id: contrato.categoria_financeira_id,
          forma_pagamento_id: parcela.forma_pagamento_id || contrato.forma_pagamento_id || null,
          apropriacao_id: apropriacaoUnica,
          ...(apropriacoes.length > 1 ? { rateios: montarRateios(parcela.valor), tipo_rateio: 'VALOR' } : {})
        },
        // registrarSeguranca: false — o evento seria gravado FORA da transacao e
        // sobreviveria ao rollback, deixando trilha de titulos inexistentes (auditoria).
        // Os eventos sao emitidos apos o commit, mais abaixo.
        // pularAcessoFinanceiro: quem chega aqui ja passou pela permissao ESTRITA de
        // aprovacao; exigir tambem acesso ao modulo financeiro barrava ADMIN/USUARIO
        // legitimamente autorizados (regressao apontada em auditoria).
        {
          transaction,
          origemTitulo: 'CONTRATO',
          retornarTitulosCriados: true,
          registrarSeguranca: false,
          pularAcessoFinanceiro: true,
          dispensarCartaoInstrucional: true,
          permitirFormaPagamentoPendente: true
        }
      );

      // Com retornarTitulosCriados o servico devolve { titulo, titulos } — nao o registro
      // direto. Sem desembrulhar, o vinculo da parcela ficava nulo e o titulo virava orfao.
      const titulo = criados?.titulo || (Array.isArray(criados?.titulos) ? criados.titulos[0] : null);

      if (!titulo?.id) {
        throw Object.assign(
          new Error(`Nao foi possivel vincular o titulo da parcela ${parcela.numero}.`),
          { statusCode: 500 }
        );
      }

      titulosIds.push(titulo.id);

      // eslint-disable-next-line no-await-in-loop
      await parcela.update(
        {
          // A aprovacao do contrato confirma o cronograma, mas ainda nao confirma a execucao.
          // A parcela sai de PREVISAO somente na aprovacao da medicao correspondente.
          status: STATUS_PARCELA.PREVISAO,
          titulo_financeiro_id: titulo?.id || null,
          travada: true,
          atualizado_por: usuario?.id || null
        },
        { transaction }
      );
    }

    await contrato.update(
      {
        status_contrato: STATUS_CONTRATO.ATIVO,
        aprovado_por: usuario?.id || null,
        aprovado_em: new Date()
      },
      { transaction }
    );
    // PI-16: os titulos nasceram; a solicitacao vira APROVADA e volta ao responsavel.
    await espelharERegistrar(contrato, {
      acao: 'CONTRATO_APROVADO',
      descricao: `Contrato ${contrato.codigo} aprovado: ${titulosIds.length} titulo(s) criado(s).`,
      usuario,
      metadata: { contrato_id: contrato.id, titulos: titulosIds.length }
    }, transaction);

  return {
    contrato: { id: contrato.id, codigo: contrato.codigo, status_contrato: STATUS_CONTRATO.ATIVO },
    titulos_criados: parcelas.length,
    titulos_ids: titulosIds
  };
}

/**
 * Trilha de auditoria dos titulos criados por uma aprovacao. Sempre APOS o commit.
 */
async function emitirEventosDeTitulos(resultado, { usuario, req }) {
  for (const tituloId of resultado.titulos_ids) {
    // registrarEventoSeguranca engole o proprio erro e retorna null — try/catch aqui era
    // codigo morto (auditoria v4). O retorno nulo e o unico sinal de falha.
    // eslint-disable-next-line no-await-in-loop
    const evento = await registrarEventoSeguranca({
      req,
      usuarioId: usuario?.id || null,
      tipoEvento: 'FINANCIAL_TITLE_CREATED',
      recursoTipo: 'TITULO_FINANCEIRO',
      recursoId: tituloId,
      status: 'SUCCESS',
      descricao: `Titulo criado pela aprovacao do contrato ${resultado.contrato.codigo}`,
      metadata: { origem: 'CONTRATO', contrato_id: resultado.contrato.id }
    });
    if (!evento) {
      console.error(
        `[contrato] FALHA ao registrar evento de auditoria do titulo ${tituloId} ` +
        `(contrato ${resultado.contrato.codigo}). Titulo integro; repor a trilha manualmente.`
      );
    }
  }
}

/**
 * Rejeita um contrato do fluxo novo.
 *
 * Nenhum titulo e criado nem alterado: as parcelas ainda vivem apenas em
 * contrato_parcelas, entao rejeitar nao deixa residuo no financeiro.
 *
 * Por decisao do cliente (D7), o contrato NAO e encerrado: volta para correcao mantendo
 * o mesmo codigo e o historico da rejeicao. As parcelas viram REJEITADA e sao regeradas
 * quando o contrato for reenviado e aprovado.
 *
 * Mesma permissao estrita da aprovacao: quem decide um lado decide o outro.
 */
/**
 * De onde o contrato pode ser devolvido, e com qual permissao.
 *
 * A permissao vem da ETAPA, nao de uma lista fixa: quem aprova rejeita na aprovacao, quem tramita
 * no Juridico rejeita no Juridico. Ate 20/08 a rejeicao exigia `contratos.aprovacao.aprovar` em
 * qualquer caso — e o Juridico, que tem `contratos.juridico.tramitar`, levava 403 com o botao
 * aparecendo na tela.
 *
 * `EM_REVISAO_JURIDICA` entra junto de proposito: e a conferencia do contrato assinado, e e
 * exatamente ali que o Juridico encontra problema no documento.
 */
const ETAPAS_QUE_REJEITAM = {
  [STATUS_CONTRATO.AGUARDANDO_APROVACAO]: { etapa: 'APROVACAO', permissao: 'contratos.aprovacao.aprovar' },
  [STATUS_CONTRATO.EM_ANALISE_JURIDICA]: { etapa: 'JURIDICO', permissao: 'contratos.juridico.tramitar' },
  [STATUS_CONTRATO.EM_REVISAO_JURIDICA]: { etapa: 'JURIDICO', permissao: 'contratos.juridico.tramitar' }
};

/** Para onde o reenvio devolve o contrato, conforme quem o rejeitou. */
const RETORNO_POR_ETAPA = {
  APROVACAO: STATUS_CONTRATO.AGUARDANDO_APROVACAO,
  JURIDICO: STATUS_CONTRATO.EM_ANALISE_JURIDICA
};

/**
 * Devolve o contrato REJEITADO para a fila, depois do ajuste (20/08).
 *
 * Este caminho **nao existia**. `REJEITADO` era escrito num lugar e nao era lido como ponto de
 * partida em lugar nenhum: o responsavel corrigia o que foi apontado e nao havia como reenviar. O
 * cliente encontrou isso pelo Juridico, mas o beco sem saida ja valia para a rejeicao da propria
 * Gerencia de Processos.
 *
 * Volta para QUEM DEVOLVEU, e nao para o inicio da fila: devolvido pelo Juridico volta ao Juridico
 * — senao a Gerencia reaprovaria o que ela mesma ja aprovou.
 *
 * Quem pode: o autor do contrato, ou quem gerencia/cria contratos. Mesma regra do anexo da
 * negociacao, pela mesma razao — quem abriu e quem corrige.
 */
async function reenviarContratoParaAprovacao(contratoId, {
  usuario,
  req,
  comentario,
  anexoIds
} = {}) {
  const { userHasStrictAreaPermission } = require('./authorizationService');
  const comentarioLimpo = String(comentario || '').trim();
  const idsAnexos = [...new Set((Array.isArray(anexoIds) ? anexoIds : [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0))];

  if (!comentarioLimpo && idsAnexos.length === 0) {
    throw Object.assign(
      new Error('Informe um comentario e/ou anexe um arquivo para registrar o ajuste realizado.'),
      { statusCode: 400 }
    );
  }
  if (comentarioLimpo.length > 4000) {
    throw Object.assign(new Error('O comentario do ajuste deve ter no maximo 4000 caracteres.'), { statusCode: 400 });
  }
  if (idsAnexos.length > 20) {
    throw Object.assign(new Error('Envie no maximo 20 arquivos por reenvio.'), { statusCode: 400 });
  }

  return sequelize.transaction(async (transaction) => {
    const contrato = await Contrato.findOne({
      where: { id: contratoId, fluxo_novo: true },
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    if (!contrato) throw Object.assign(new Error('Contrato do fluxo novo nao encontrado.'), { statusCode: 404 });

    if (contrato.status_contrato !== STATUS_CONTRATO.REJEITADO) {
      throw Object.assign(
        new Error(`So contrato devolvido pode ser reenviado (status atual: ${contrato.status_contrato}).`),
        { statusCode: 409 }
      );
    }

    const solicitacao = contrato.solicitacao_id
      ? await Solicitacao.findByPk(contrato.solicitacao_id, {
        attributes: ['id', 'criado_por', 'area_responsavel'],
        transaction
      })
      : null;
    const ehAutor = Number(solicitacao?.criado_por || 0) === Number(usuario?.id || -1);

    // ITEM 31 (23/08): quem age no contrato DOS OUTROS precisa de permissao nominal.
    //
    // Era `userHasAreaPermission(['contratos.geral.criar', 'contratos.geral.editar'])`, e essa
    // combinacao abria tres portas de uma vez:
    //
    //   1. a funcao NAO estrita trata "nenhuma permissao configurada" como LIBERADO — usuario fora
    //      da configuracao passava em tudo;
    //   2. SUPERADMIN tem passe livre nela;
    //   3. `contratos.geral.criar` e permissao de ABRIR contrato, nao de tramitar AQUELE contrato:
    //      quem podia abrir via o botao de reenviar o contrato dos outros.
    //
    // Foi o cliente que relatou o efeito: "o botao de solicitar revisao aparece para mais de um
    // usuario". A clausula larga foi escrita aqui de proposito, para o fluxo nao travar com o autor
    // indisponivel — e a permissao nova resolve isso sem devolver as tres portas.
    const podePorPermissao = await userHasStrictAreaPermission(usuario, ['contratos.fluxo.reenviar']);

    if (!ehAutor && !podePorPermissao) {
      throw Object.assign(
        new Error('Acesso negado: so quem abriu o contrato, ou quem tem permissao para agir no contrato '
          + 'de outra pessoa, pode reenviar para aprovacao.'),
        { statusCode: 403 }
      );
    }

    if (!solicitacao) {
      throw Object.assign(new Error('A solicitacao vinculada ao contrato nao foi encontrada.'), { statusCode: 409 });
    }

    // O anexo precisa ser NOVO desta devolucao, pertencer a mesma solicitacao e ter sido enviado
    // por quem esta reenviando. Aceitar qualquer id antigo satisfaria a exigencia sem documentar
    // o ajuste atual; aceitar id de outro usuario permitiria apropriar evidencia alheia.
    if (idsAnexos.length > 0) {
      const whereAnexos = {
        id: { [Op.in]: idsAnexos },
        solicitacao_id: solicitacao.id,
        uploaded_by: usuario?.id,
        deleted_at: null
      };
      if (contrato.rejeitado_em) {
        whereAnexos.createdAt = { [Op.gte]: contrato.rejeitado_em };
      }
      const totalAnexosValidos = await Anexo.count({ where: whereAnexos, transaction });
      if (totalAnexosValidos !== idsAnexos.length) {
        throw Object.assign(
          new Error('Um ou mais arquivos nao pertencem a este ajuste. Anexe-os novamente antes de reenviar.'),
          { statusCode: 400 }
        );
      }
    }

    // Sem etapa gravada (contrato devolvido antes desta funcao existir), volta para a aprovacao —
    // o comeco da fila e o destino seguro quando nao se sabe de onde veio.
    const destino = RETORNO_POR_ETAPA[contrato.rejeitado_na_etapa] || STATUS_CONTRATO.AGUARDANDO_APROVACAO;

    // As parcelas voltam a ser previsao: elas foram marcadas REJEITADA na devolucao.
    await ContratoParcela.update(
      { status: STATUS_PARCELA.PREVISAO, atualizado_por: usuario?.id || null },
      { where: { contrato_id: contrato.id, status: STATUS_PARCELA.REJEITADA }, transaction }
    );

    await contrato.update(
      {
        status_contrato: destino,
        // O motivo antigo nao pode ficar pendurado num contrato que voltou a andar: quem olhasse
        // depois leria uma devolucao que ja foi resolvida.
        motivo_rejeicao: null,
        rejeitado_na_etapa: null,
        rejeitado_por: null,
        rejeitado_em: null
      },
      { transaction }
    );

    if (comentarioLimpo) {
      await registrarHistoricoDoContrato(solicitacao, {
        acao: 'COMENTARIO',
        descricao: comentarioLimpo,
        usuario,
        metadata: {
          origem: 'REENVIO_CONTRATO',
          contrato_id: contrato.id
        },
        transaction
      });
    }

    const solicitacaoAtualizada = await espelharERegistrar(contrato, {
      acao: 'CONTRATO_REENVIADO',
      descricao: destino === STATUS_CONTRATO.EM_ANALISE_JURIDICA
        ? `Contrato ${contrato.codigo} ajustado e reenviado ao Juridico.`
        : `Contrato ${contrato.codigo} ajustado e reenviado para aprovacao.`,
      usuario,
      metadata: {
        contrato_id: contrato.id,
        destino,
        comentario_informado: Boolean(comentarioLimpo),
        anexo_ids: idsAnexos
      },
      // Decisao do cliente (26/08): ao tratar a devolucao e reenviar, o card e a lista precisam
      // mostrar ATENDIDO. O estado do contrato continua indicando para qual fila ele voltou.
      statusSolicitacao: 'ATENDIDO'
    }, transaction);

    return {
      contrato: { id: contrato.id, codigo: contrato.codigo, status_contrato: destino },
      solicitacao: {
        id: solicitacaoAtualizada?.id || solicitacao.id,
        status_global: solicitacaoAtualizada?.status_global || 'ATENDIDO'
      }
    };
  });
}

async function rejeitarContrato(contratoId, { usuario, motivo } = {}) {
  const motivoLimpo = String(motivo || '').trim();
  if (!motivoLimpo) {
    throw Object.assign(
      new Error('Motivo da rejeicao e obrigatorio.'),
      { statusCode: 400 }
    );
  }

  return sequelize.transaction(async (transaction) => {
    const contrato = await Contrato.findOne({
      where: { id: contratoId, fluxo_novo: true },
      lock: transaction.LOCK.UPDATE,
      transaction
    });

    if (!contrato) {
      throw Object.assign(new Error('Contrato do fluxo novo nao encontrado.'), { statusCode: 404 });
    }

    const etapa = ETAPAS_QUE_REJEITAM[contrato.status_contrato];
    if (!etapa) {
      throw Object.assign(
        new Error(`Contrato nao pode ser devolvido no status atual (${contrato.status_contrato}).`),
        { statusCode: 409 }
      );
    }

    // A permissao e conferida DEPOIS de saber a etapa, porque e ela que decide qual permissao vale.
    const { userHasStrictAreaPermission } = require('./authorizationService');
    if (!await userHasStrictAreaPermission(usuario, [etapa.permissao])) {
      throw Object.assign(
        new Error(`Acesso negado: devolver o contrato nesta etapa exige a permissao ${etapa.permissao}.`),
        { statusCode: 403 }
      );
    }

    const [parcelasAfetadas] = await ContratoParcela.update(
      { status: STATUS_PARCELA.REJEITADA, atualizado_por: usuario?.id || null },
      { where: { contrato_id: contrato.id, status: STATUS_PARCELA.PREVISAO }, transaction }
    );

    await contrato.update(
      {
        status_contrato: STATUS_CONTRATO.REJEITADO,
        rejeitado_na_etapa: etapa.etapa,
        rejeitado_por: usuario?.id || null,
        rejeitado_em: new Date(),
        motivo_rejeicao: motivoLimpo
      },
      { transaction }
    );
    // PI-16: rejeitar DEVOLVE — a solicitacao volta como PENDENTE DE AJUSTE, nao morre.
    await espelharERegistrar(contrato, {
      acao: 'CONTRATO_REJEITADO',
      descricao: `Contrato ${contrato.codigo} devolvido para ajuste. Motivo: ${motivoLimpo}`,
      usuario,
      metadata: { contrato_id: contrato.id, motivo: motivoLimpo }
    }, transaction);

    return {
      contrato: { id: contrato.id, codigo: contrato.codigo, status_contrato: STATUS_CONTRATO.REJEITADO },
      parcelas_rejeitadas: parcelasAfetadas
    };
  });
}

/**
 * Quem pode dar ESTE passo do Juridico.
 *
 * `minuta` e `conferido`: Juridico (`contratos.juridico.tramitar`).
 * `assinado`: a ORIGEM — quem abriu o contrato, ou quem recebeu a permissao nominal para agir
 *   no contrato de outra pessoa. A permissao ordinaria do Juridico nao autoriza esta etapa.
 */
async function usuarioPodeTramitarEtapa(contratoId, usuario, etapaNormalizada) {
  const { userHasStrictAreaPermission } = require('./authorizationService');

  const ehJuridico = await userHasStrictAreaPermission(usuario, ['contratos.juridico.tramitar']);
  if (etapaNormalizada !== 'assinado') return ehJuridico;

  // ITEM 31 (23/08): a mesma troca do reenvio. Confirmar a assinatura de um contrato que a pessoa
  // NAO abriu passa a exigir a permissao nominal, em vez de "poder criar contratos".
  if (await userHasStrictAreaPermission(usuario, ['contratos.fluxo.reenviar'])) return true;

  const contrato = await Contrato.findByPk(Number(contratoId), { attributes: ['id', 'solicitacao_id'] });
  if (!contrato?.solicitacao_id) return false;
  const solicitacao = await Solicitacao.findByPk(contrato.solicitacao_id, { attributes: ['id', 'criado_por'] });
  return Number(solicitacao?.criado_por || 0) === Number(usuario?.id || -1);
}

/**
 * O que ESTE usuario pode fazer neste contrato agora (20/08).
 *
 * A barra de acoes da solicitacao decidia o que oferecer so pelo `status_contrato`, sem olhar
 * permissao nenhuma: o usuario da OBRA que recebeu um contrato devolvido via "Minuta pronta —
 * enviar para assinatura", que e de quem tramita no Juridico. O backend recusa cada uma dessas
 * acoes com 403 — a protecao nao estava furada —, mas a tela prometia o que a pessoa nao pode
 * fazer, e ela descobria depois de anexar o arquivo e clicar.
 *
 * As respostas saem das MESMAS funcoes que as rotas usam para recusar. Reescrever a regra aqui
 * criaria uma segunda verdade, que diverge da primeira no dia em que uma das duas mudar — foi
 * assim que `medivel` quase divergiu da guarda de medicao.
 *
 * `rejeitar` depende da ETAPA, nao de uma chave fixa: quem aprova devolve na aprovacao, quem
 * tramita no Juridico devolve no Juridico (`ETAPAS_QUE_REJEITAM`).
 *
 * `reenviar` segue a regra de quem corrige: o autor da solicitacao, ou quem gerencia contratos.
 */
async function permissoesDoUsuarioNoContrato(contrato, usuario) {
  const { userHasStrictAreaPermission } = require('./authorizationService');

  if (!usuario?.id) {
    return {
      aprovar: false,
      tramitar_juridico: false,
      confirmar_assinatura: false,
      rejeitar: false,
      reenviar: false,
      cancelar: false,
      editar_medicao: false
    };
  }

  const etapaDeRejeicao = ETAPAS_QUE_REJEITAM[contrato.status_contrato];

  const [aprovar, tramitarJuridico, cancelar, editarMedicao, rejeitar, agePorOutros] = await Promise.all([
    userHasStrictAreaPermission(usuario, ['contratos.aprovacao.aprovar']),
    userHasStrictAreaPermission(usuario, ['contratos.juridico.tramitar']),
    userHasStrictAreaPermission(usuario, ['contratos.solicitacao.cancelar']),
    userHasStrictAreaPermission(usuario, ['contratos.medicao.editar_valor']),
    etapaDeRejeicao
      ? userHasStrictAreaPermission(usuario, [etapaDeRejeicao.permissao])
      : Promise.resolve(false),
    // ITEM 31 (23/08): era `userHasAreaPermission(['contratos.geral.criar','contratos.geral.editar'])`.
    // A tela le a MESMA regra que a rota recusa — reescrever aqui criaria uma segunda verdade.
    userHasStrictAreaPermission(usuario, ['contratos.fluxo.reenviar'])
  ]);

  let ehAutor = false;
  if (contrato.solicitacao_id) {
    const solicitacao = await Solicitacao.findByPk(contrato.solicitacao_id, { attributes: ['id', 'criado_por'] });
    ehAutor = Number(solicitacao?.criado_por || 0) === Number(usuario.id);
  }

  // "Da origem" = o autor, ou quem recebeu permissao nominal para agir no contrato dos outros.
  const daOrigem = ehAutor || agePorOutros;

  return {
    aprovar,
    // `minuta` e `conferido`.
    tramitar_juridico: tramitarJuridico,
    // `assinado`: e a ORIGEM que colhe a assinatura e aciona a revisao, nao o Juridico.
    confirmar_assinatura: daOrigem,
    rejeitar,
    reenviar: daOrigem,
    cancelar: podeCancelarSolicitacaoContrato(contrato, usuario, cancelar),
    // Alterar valor/vencimento de uma medicao ja criada — o modal do botao "Medicao N".
    editar_medicao: editarMedicao
  };
}

/**
 * Parcelas de um contrato, para a tela de Medicao (wireframe 2).
 *
 * Leitura pura: nao altera nada. Ate aqui `contrato_parcelas` so era lida DENTRO deste
 * servico (criacao, aprovacao, rejeicao) e nenhuma rota a expunha.
 *
 * Devolve tambem o cabecalho do contrato porque a tela precisa decidir a trilha pelo
 * `fluxo_novo` e saber se o contrato esta aprovado — e o saldo, que hoje nao existe em
 * lugar nenhum do backend (o calculo de `ContratoController` enxerga so solicitacoes PAGAS
 * e ignora parcelas).
 *
 * `medivel` responde a pergunta que a tela faz: este contrato pode receber medicao agora?
 * Contrato do fluxo novo so depois de aprovado — antes disso nao existem titulos.
 */
async function listarParcelasDoContrato(contratoId, { usuario = null } = {}) {
  const contrato = await Contrato.findByPk(Number(contratoId), {
    // PI-16: `categoria_financeira_id` e `solicitacao_id` entram porque o detalhe da solicitacao
    // decide por eles — a aprovacao exige a categoria, e o bloco so aparece na solicitacao dona.
    attributes: ['id', 'codigo', 'obra_id', 'valor_total', 'valor_aditivos', 'fluxo_novo',
      'status_contrato', 'ativo', 'categoria_financeira_id', 'solicitacao_id', 'motivo_rejeicao',
      'link_assinatura',
      // `favorecido_id` faltava aqui, e sem ele a busca do favorecido nem acontecia — o cabecalho
      // ficava sem "Favorecido" e sem "Chave PIX", em silencio. Lista de atributos e armadilha:
      // o campo existe no banco e no model, mas some se nao for pedido.
      'favorecido_id',
      // Cabecalho novo (23/08): OBJETO, CONTRATADO e RESPONSAVEL existiam no banco e nunca chegavam
      // a tela. `objeto` e `responsavel_id` saem daqui; os contratados vem de `contrato_credores`.
      'objeto', 'responsavel_id', 'representante_legal_qualificacao']
  });
  if (!contrato) {
    throw Object.assign(new Error('Contrato nao encontrado.'), { statusCode: 404 });
  }

  const { calcularSaldoDoContrato, statusEfetivo } = require('./medicaoContratoService');

  const parcelas = await ContratoParcela.findAll({
    where: { contrato_id: contrato.id },
    attributes: ['id', 'numero', 'valor', 'valor_previsto', 'data_vencimento', 'status', 'travada', 'titulo_financeiro_id', 'parceiro_id', 'forma_pagamento_id'],
    include: [{
      model: TituloFinanceiro,
      as: 'titulo',
      attributes: ['id', 'status', 'valor_original', 'valor_baixado', 'valor_saldo'],
      required: false
    }],
    order: [['numero', 'ASC']]
  });

  await require('./tituloRenegociacaoVinculos').projetarAssociacoes(parcelas, 'titulo');
  // Soma em centavos: somar float e arredondar no fim ja divergiu do DECIMAL do MySQL antes.
  const somaCent = (lista) => lista.reduce((acc, p) => acc + paraCentavos(p.valor), 0);
  const aprovadasCent = somaCent(parcelas.filter((p) => p.status === STATUS_PARCELA.APROVADA));
  const previsaoCent = somaCent(parcelas.filter((p) => p.status === STATUS_PARCELA.PREVISAO));
  const totalCent = paraCentavos(contrato.valor_total) + paraCentavos(contrato.valor_aditivos || 0);

  const ehFluxoNovo = Boolean(contrato.fluxo_novo);

  // PI-16: qual MEDICAO consumiu cada parcela. E o que liga o titulo, no card do Financeiro, aos
  // anexos e comentarios daquela medicao — o modal que o cliente pediu. Devolvido junto com as
  // parcelas para a tela nao precisar de uma segunda chamada por linha.
  const { MedicaoParcela, ContratoMedicao } = require('../models');
  const medidas = await MedicaoParcela.findAll({
    where: { contrato_parcela_id: parcelas.map((p) => p.id), devolvido_em: null },
    attributes: ['contrato_parcela_id', 'medicao_id', 'valor_medido'],
    include: [{
      model: ContratoMedicao,
      as: 'medicao',
      // `aprovada_em` entra porque o modal decide por ele: oferecer o botao de aprovar, ou dizer
      // que a medicao ja foi aprovada. Lista de atributos e armadilha — o campo existe no banco e
      // no model, mas some se nao for pedido.
      attributes: [
        'id', 'numero', 'periodo_inicio', 'periodo_fim', 'aprovada_em',
        'favorecido_id', 'favorecido_chave_pix', 'favorecido_contato',
        'forma_pagamento_id', 'dados_confirmados_em'
      ],
      required: false
    }],
    order: [['id', 'ASC']]
  });
  // Favorecido e as apropriacoes do contrato: a tela de detalhe precisa dos dois e nao os tinha.
  //
  // A apropriacao vive em `contrato_apropriacoes`, nao na solicitacao — por isso o card
  // "Apropriacoes da solicitacao" aparecia vazio num contrato que TEM rateio.
  //
  // A CHAVE PIX segue a ordem que o cliente definiu (19/08): fixa 1, senao fixa 2, senao a
  // variavel, senao vazio. A ordem e do cliente, nao invencao — quem paga espera achar a
  // principal primeiro.
  const { Parceiro, FormaPagamentoFinanceira } = require('../models');
  const favorecidoRegistro = contrato.favorecido_id
    ? await Parceiro.findByPk(contrato.favorecido_id, {
      attributes: ['id', 'nome', 'cpf_cnpj',
        'pix_chave_fixa_1', 'pix_chave_fixa_1_tipo',
        'pix_chave_fixa_2', 'pix_chave_fixa_2_tipo',
        'pix_chave_variavel', 'pix_chave_variavel_tipo']
    })
    : null;

  // A aprovacao da medicao precisa ser uma conferencia completa: forma de pagamento,
  // favorecido e arquivos devem estar no mesmo contexto do botao de aprovar. Esses dados
  // pertencem a MEDICAO, nao ao contrato nem ao titulo, porque podem mudar a cada ciclo.
  const medicoesUnicas = [...new Map(
    medidas
      .filter((item) => item.medicao)
      .map((item) => [Number(item.medicao.id), item.medicao])
  ).values()];
  const medicaoIds = medicoesUnicas.map((item) => Number(item.id));
  const favorecidoIdsMedicao = [...new Set(
    medicoesUnicas.map((item) => Number(item.favorecido_id)).filter(Boolean)
  )];
  const formaPagamentoIdsMedicao = [...new Set(
    medicoesUnicas.map((item) => Number(item.forma_pagamento_id)).filter(Boolean)
  )];

  const [anexosMedicoes, favorecidosMedicoes, formasPagamentoMedicoes] = await Promise.all([
    medicaoIds.length > 0
      ? Anexo.findAll({
        where: { medicao_id: { [Op.in]: medicaoIds }, deleted_at: null },
        attributes: ['id', 'medicao_id', 'tipo', 'nome_original', 'caminho_arquivo', 'createdAt'],
        order: [['createdAt', 'ASC'], ['id', 'ASC']]
      })
      : Promise.resolve([]),
    favorecidoIdsMedicao.length > 0
      ? Parceiro.findAll({
        where: { id: { [Op.in]: favorecidoIdsMedicao } },
        attributes: ['id', 'nome', 'cpf_cnpj']
      })
      : Promise.resolve([]),
    formaPagamentoIdsMedicao.length > 0
      ? FormaPagamentoFinanceira.findAll({
        where: { id: { [Op.in]: formaPagamentoIdsMedicao } },
        attributes: ['id', 'nome', 'codigo', 'tipo']
      })
      : Promise.resolve([])
  ]);

  const anexosPorMedicao = anexosMedicoes.reduce((mapa, anexo) => {
    const chave = Number(anexo.medicao_id);
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave).push({
      id: anexo.id,
      tipo: anexo.tipo,
      nome_original: anexo.nome_original,
      caminho_arquivo: anexo.caminho_arquivo,
      criado_em: anexo.createdAt || null
    });
    return mapa;
  }, new Map());
  const favorecidoMedicaoPorId = new Map(
    favorecidosMedicoes.map((item) => [Number(item.id), item])
  );
  const formaPagamentoMedicaoPorId = new Map(
    formasPagamentoMedicoes.map((item) => [Number(item.id), item])
  );

  // Responsavel pela contratacao e os contratados, para o cabecalho. Duas consultas curtas e
  // condicionadas: contrato sem responsavel ou sem credor nao paga por elas.
  const { User, ContratoCredor } = require('../models');
  const responsavelRegistro = contrato.responsavel_id
    ? await User.findByPk(contrato.responsavel_id, { attributes: ['id', 'nome'] })
    : null;

  const credoresDoContrato = ehFluxoNovo
    ? await ContratoCredor.findAll({
      where: { contrato_id: contrato.id },
      // O alias e `credor`, nao `parceiro` — conferido em `models/index.js`. Alias errado nao
      // devolve nulo: o Sequelize LANCA, e a tela inteira ia junto.
      include: [{ model: Parceiro, as: 'credor', attributes: ['id', 'nome', 'nome_fantasia', 'cpf_cnpj'], required: false }]
    })
    : [];
  const contratadosRegistros = credoresDoContrato
    .map((c) => c.credor)
    .filter(Boolean);

  const pixEmOrdem = (p) => {
    if (!p) return { chave: null, tipo: null };
    const candidatos = [
      [p.pix_chave_fixa_1, p.pix_chave_fixa_1_tipo],
      [p.pix_chave_fixa_2, p.pix_chave_fixa_2_tipo],
      [p.pix_chave_variavel, p.pix_chave_variavel_tipo]
    ];
    const achado = candidatos.find(([chave]) => String(chave || '').trim());
    return achado ? { chave: String(achado[0]).trim(), tipo: achado[1] || null } : { chave: null, tipo: null };
  };

  const apropriacoesDoContrato = await ContratoApropriacao.findAll({
    where: { contrato_id: contrato.id },
    attributes: ['apropriacao_id', 'percentual'],
    include: [{ model: Apropriacao, as: 'apropriacao', attributes: ['id', 'codigo', 'descricao'], required: false }],
    order: [['id', 'ASC']]
  });

  // A minuta e o link precisam acompanhar o contrato enquanto a origem coleta a assinatura.
  // O arquivo vive em `contrato_anexos` (nao nos anexos gerais da solicitacao), portanto deve ser
  // exposto explicitamente neste payload usado pelo card do detalhe.
  const minutaContrato = ehFluxoNovo
    ? await ContratoAnexo.findOne({
      where: { contrato_id: contrato.id, tipo: TIPO_ANEXO_MINUTA },
      attributes: ['id', 'nome_original', 'caminho_arquivo', 'createdAt'],
      order: [['createdAt', 'DESC'], ['id', 'DESC']]
    })
    : null;

  const medicaoPorParcela = new Map();
  medidas.forEach((m) => {
    if (!m.medicao) return;
    const favorecidoDaMedicao = favorecidoMedicaoPorId.get(Number(m.medicao.favorecido_id)) || null;
    const formaPagamentoDaMedicao = formaPagamentoMedicaoPorId.get(Number(m.medicao.forma_pagamento_id)) || null;
    medicaoPorParcela.set(Number(m.contrato_parcela_id), {
      id: m.medicao.id,
      numero: m.medicao.numero,
      periodo_inicio: m.medicao.periodo_inicio,
      periodo_fim: m.medicao.periodo_fim,
      // O modal usa isto para decidir entre oferecer o botao de aprovar e dizer que ja foi aprovada.
      aprovada_em: m.medicao.aprovada_em || null,
      dados_confirmados_em: m.medicao.dados_confirmados_em || null,
      forma_pagamento: formaPagamentoDaMedicao
        ? {
          id: formaPagamentoDaMedicao.id,
          nome: formaPagamentoDaMedicao.nome,
          codigo: formaPagamentoDaMedicao.codigo || null,
          tipo: formaPagamentoDaMedicao.tipo || null
        }
        : null,
      favorecido: favorecidoDaMedicao
        ? {
          id: favorecidoDaMedicao.id,
          nome: favorecidoDaMedicao.nome,
          cpf_cnpj: favorecidoDaMedicao.cpf_cnpj || null
        }
        : null,
      favorecido_chave_pix: m.medicao.favorecido_chave_pix || null,
      favorecido_contato: m.medicao.favorecido_contato || null,
      anexos: anexosPorMedicao.get(Number(m.medicao.id)) || [],
      valor_medido: Number(m.valor_medido)
    });
  });

  return {
    contrato: {
      id: contrato.id,
      codigo: contrato.codigo,
      obra_id: contrato.obra_id,
      valor_total: Number(contrato.valor_total),
      valor_aditivos: Number(contrato.valor_aditivos || 0),
      fluxo_novo: ehFluxoNovo,
      status_contrato: contrato.status_contrato,
      ativo: Boolean(contrato.ativo),
      categoria_financeira_id: contrato.categoria_financeira_id || null,
      solicitacao_id: contrato.solicitacao_id || null,
      motivo_rejeicao: contrato.motivo_rejeicao || null,
      link_assinatura: contrato.link_assinatura || null,
      minuta: minutaContrato
        ? {
          id: minutaContrato.id,
          nome_original: minutaContrato.nome_original,
          caminho_arquivo: minutaContrato.caminho_arquivo,
          criado_em: minutaContrato.createdAt || null
        }
        : null,
      objeto: contrato.objeto || null,
      // Fotografia informada na abertura, sem buscar dados atuais do parceiro. A rota de
      // parcelas ja exige acesso ao contrato; o detalhe usa estes dados somente no contrato dono.
      representante_legal_qualificacao: contrato.representante_legal_qualificacao || null,
      responsavel: responsavelRegistro ? { id: responsavelRegistro.id, nome: responsavelRegistro.nome } : null,
      // PI-12: todos os contratados respondem pelo contrato, e podem ser varios.
      contratados: contratadosRegistros.map((c) => ({
        id: c.id,
        nome: c.nome,
        nome_fantasia: c.nome_fantasia || null,
        cpf_cnpj: c.cpf_cnpj || null
      })),
      favorecido: favorecidoRegistro
        ? {
          id: favorecidoRegistro.id,
          nome: favorecidoRegistro.nome,
          cpf_cnpj: favorecidoRegistro.cpf_cnpj || null,
          ...pixEmOrdem(favorecidoRegistro)
        }
        : null,
      apropriacoes: apropriacoesDoContrato.map((a) => ({
        apropriacao_id: a.apropriacao_id,
        codigo: a.apropriacao?.codigo || null,
        descricao: a.apropriacao?.descricao || null,
        percentual: Number(a.percentual || 0)
      })),
      // Mesma regra da guarda em SolicitacaoController: contrato do fluxo novo so e medivel
      // depois de APROVADO. Se esta linha divergir da guarda, a tela oferece o que a API
      // recusa (ou esconde o que ela aceita).
      medivel: ehFluxoNovo
        ? Boolean(contrato.ativo) && contrato.status_contrato === STATUS_CONTRATO.ATIVO
        : Boolean(contrato.ativo),
      // O que quem esta pedindo pode fazer aqui. A tela usa isto para nao oferecer o que a rota
      // vai recusar — ver `permissoesDoUsuarioNoContrato`.
      permissoes: await permissoesDoUsuarioNoContrato(contrato, usuario)
    },
    // PI-6: o saldo e o numero que decide o que ainda pode ser solicitado.
    //
    // ITEM 21 (23/08): junto dele vai o ALERTA — nivel e cor ja resolvidos. A tela nao refaz a
    // conta: duas versoes da mesma regra divergem no dia em que uma das duas muda.
    //
    // Resolvido AQUI, no caminho de LEITURA da tela, e nao dentro de `calcularSaldoDoContrato`:
    // aquela funcao roda dentro das transacoes de medicao, e acrescentar uma consulta de
    // configuracao a cada medicao seria pagar caro por uma cor que so a tela usa.
    saldo: await (async () => {
      const saldo = await calcularSaldoDoContrato(contrato.id);
      const { classificarSaldo } = require('./alertaSaldoContratoService');
      return { ...saldo, alerta: await classificarSaldo(saldo.saldo_cent, saldo.total_cent) };
    })(),
    totais: {
      valor_contrato: totalCent / 100,
      total_parcelas: (aprovadasCent + previsaoCent) / 100,
      total_aprovado: aprovadasCent / 100,
      total_previsao: previsaoCent / 100,
      quantidade: parcelas.length
    },
    parcelas: parcelas.map((p) => {
      // Status efetivo: o do TITULO quando ele existe, o da PARCELA enquanto nao existe (MD-6).
      // `editavel` diz se a linha aceita medicao — quitado e parcialmente pago ficam fechados
      // porque o saldo ja foi redistribuido (PI-7).
      const efetivo = statusEfetivo(p);
      const medicao = medicaoPorParcela.get(Number(p.id)) || null;
      // No fluxo novo a situacao exibida e o proprio estado financeiro: PREVISAO enquanto a
      // parcela ainda nao teve medicao aprovada; ABERTO depois da liberacao; PARCIAL/QUITADO apos
      // as baixas. `medicao` continua separado para identificar e abrir o evento correspondente.
      const situacao = efetivo.status;
      return {
        id: p.id,
        numero: p.numero,
        valor: Number(p.valor),
        // Referencia da auditoria previsto x solicitado (PI-5).
        valor_previsto: p.valor_previsto === null || p.valor_previsto === undefined ? null : Number(p.valor_previsto),
        vencimento: formatarISO(somenteData(p.data_vencimento)),
        status: efetivo.status,
        situacao,
        status_origem: efetivo.origem,
        editavel: efetivo.editavel,
        // `medivel` responde outra pergunta que `editavel`: pode entrar numa medicao NOVA?
        //
        // Parcela ja medida continua com o titulo ABERTO ate o pagamento, entao `editavel` segue
        // verdadeiro nela — e era por isso que o checkbox da Nova Solicitacao continuava liberado
        // depois de medir. Os dois campos nao podem virar um so: a EDICAO de uma medicao precisa,
        // justamente, alterar uma parcela ja medida.
        medivel: efetivo.editavel && !medicaoPorParcela.has(Number(p.id)),
        status_parcela: p.status,
        travada: Boolean(p.travada),
        titulo_financeiro_id: p.titulo_financeiro_id,
        titulo_valor_baixado: p.titulo ? Number(p.titulo.valor_baixado || 0) : null,
        titulo_valor_saldo: p.titulo ? Number(p.titulo.valor_saldo || 0) : null,
        renegociado_por_id: p.titulo?.renegociado_por_id || null,
        renegociacao_titulos: p.titulo?.renegociacao_titulos || [],
        parceiro_id: p.parceiro_id,
        forma_pagamento_id: p.forma_pagamento_id,
        // Nulo enquanto a parcela nao foi medida — o titulo existe, a medicao ainda nao.
        medicao
      };
    })
  };
}

/**
 * Etapas do JURIDICO (MD-10), acima do limite.
 *
 * `minuta` : EM_ANALISE_JURIDICA -> AGUARDANDO_ASSINATURA (documentacao avaliada, minuta pronta)
 * `assinado`: AGUARDANDO_ASSINATURA -> EM_REVISAO_JURIDICA. A origem pode entregar o arquivo
 *             assinado ou confirmar que a assinatura ocorreu pelo link enviado pelo Juridico.
 *
 * Permissao propria do setor: quem tramita no juridico nao e quem aprova na Gerencia de
 * Processos, e nenhum dos dois herda o do outro.
 */
async function tramitarNoJuridico(contratoId, {
  usuario,
  req,
  etapa,
  linkAssinatura,
  assinadoPeloLink = false
} = {}) {
  // PI-18: TRES etapas, nao duas.
  //
  // `assinado` NAO cria mais titulo: ele devolve ao Juridico para conferencia. Quem cria os
  // titulos e `conferido` — assim o compromisso financeiro nasce quando o Juridico confere o
  // documento, e nao quando o responsavel diz que assinou.
  const passos = {
    minuta: { de: STATUS_CONTRATO.EM_ANALISE_JURIDICA, para: STATUS_CONTRATO.AGUARDANDO_ASSINATURA },
    assinado: { de: STATUS_CONTRATO.AGUARDANDO_ASSINATURA, para: STATUS_CONTRATO.EM_REVISAO_JURIDICA },
    conferido: { de: STATUS_CONTRATO.EM_REVISAO_JURIDICA, para: STATUS_CONTRATO.ATIVO }
  };
  const etapaNormalizada = String(etapa || '').toLowerCase();
  const passo = passos[etapaNormalizada];
  if (!passo) {
    throw Object.assign(new Error('Etapa invalida. Use "minuta", "assinado" ou "conferido".'), { statusCode: 400 });
  }

  // A permissao e conferida DEPOIS de saber a etapa, porque as tres nao sao do mesmo setor.
  //
  // `minuta` e `conferido` sao do Juridico. `assinado` NAO e: quando a minuta sai, a solicitacao
  // volta ao setor de ORIGEM justamente para colher a assinatura, e e a origem que aciona
  // "Solicitar revisao". Exigir `contratos.juridico.tramitar` nas tres deixava a etapa do meio
  // sem dono — o contrato parava com quem, por construcao, nao podia move-lo.
  //
  // E a quinta vez nesta implantacao que a permissao foi escolhida pelo que a rota FAZ (tramita no
  // Juridico) e nao por quem PRECISA usa-la. Ver as armadilhas do LEIA-PRIMEIRO.
  if (!await usuarioPodeTramitarEtapa(contratoId, usuario, etapaNormalizada)) {
    throw Object.assign(
      new Error(etapaNormalizada === 'assinado'
        ? 'Acesso negado: confirmar a assinatura e de quem abriu o contrato ou de quem o gerencia.'
        : 'Acesso negado: tramitar contrato no juridico exige permissao especifica.'),
      { statusCode: 403 }
    );
  }

  const linkLimpo = validarLinkAssinatura(linkAssinatura);
  const confirmouAssinaturaPeloLink = assinadoPeloLink === true;
  let temArquivo = false;

  // Concluir a minuta exige ENTREGAR alguma coisa: o documento, o link da plataforma, ou os dois
  // (pedido do cliente, 20/08).
  //
  // Ate aqui `minuta` era um botao que so trocava o status — o responsavel recebia "colete a
  // assinatura" sem receber de que. Exigir os DOIS travaria metade dos casos: parte dos contratos
  // circula em papel e parte por plataforma de assinatura. Dai ser um-ou-outro.
  if (etapaNormalizada === 'minuta') {
    temArquivo = (await ContratoAnexo.count({
      where: { contrato_id: contratoId, tipo: TIPO_ANEXO_MINUTA }
    })) > 0;

    if (!temArquivo && !linkLimpo) {
      throw Object.assign(
        new Error('Anexe a minuta ou informe o link de assinatura antes de enviar para coleta de assinatura.'),
        { statusCode: 400 }
      );
    }
  }

  const resultado = await sequelize.transaction(async (transaction) => {
    const contrato = await Contrato.findOne({
      where: { id: contratoId, fluxo_novo: true },
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    if (!contrato) {
      throw Object.assign(new Error('Contrato do fluxo novo nao encontrado.'), { statusCode: 404 });
    }
    if (contrato.status_contrato !== passo.de) {
      throw Object.assign(
        new Error(`Contrato nao esta em ${passo.de} (status atual: ${contrato.status_contrato}).`),
        { statusCode: 409 }
      );
    }

    // A origem devolve o contrato ao Juridico com uma evidencia do ciclo atual: arquivo assinado
    // OU confirmacao explicita de que a assinatura foi concluida pelo link entregue pelo proprio
    // Juridico. A segunda opcao so existe quando o contrato realmente possui esse link; assim um
    // cliente nao consegue contornar a obrigatoriedade enviando apenas o booleano pela API.
    if (etapaNormalizada === 'assinado') {
      const totalAssinadosDoCiclo = contrato.solicitacao_id
        ? await Anexo.count({
          where: {
            solicitacao_id: contrato.solicitacao_id,
            tipo: 'CONTRATO',
            deleted_at: null,
            createdAt: { [Op.gte]: contrato.updatedAt || new Date(0) }
          },
          transaction
        })
        : 0;
      const linkRegistrado = String(contrato.link_assinatura || '').trim();
      if (confirmouAssinaturaPeloLink && !linkRegistrado) {
        throw Object.assign(
          new Error('Este contrato nao possui link de assinatura registrado pelo Juridico.'),
          { statusCode: 400 }
        );
      }
      if (confirmouAssinaturaPeloLink) validarLinkAssinatura(linkRegistrado);
      if (totalAssinadosDoCiclo === 0 && !confirmouAssinaturaPeloLink) {
        throw Object.assign(
          new Error('Anexe o contrato assinado ou confirme a assinatura pelo link antes de solicitar a revisao do Juridico.'),
          { statusCode: 400 }
        );
      }
    }

    if (passo.para === STATUS_CONTRATO.ATIVO) {
      // PI-18: a CONFERENCIA do Juridico e o momento em que o compromisso passa a existir — nao
      // mais a assinatura. Daqui para frente e o mesmo codigo auditado da aprovacao que cria as
      // parcelas como titulos.
      return aplicarAprovacaoNaTransacao({ contrato, usuario, req }, transaction);
    }

    const alteracoes = { status_contrato: passo.para };
    if (passo.para === STATUS_CONTRATO.AGUARDANDO_ASSINATURA && linkLimpo) {
      alteracoes.link_assinatura = linkLimpo;
    }
    await contrato.update(alteracoes, { transaction });

    // PI-16: `minuta` devolve a solicitacao ao responsavel como NEC. DE ASSINATURA; `assinado`
    // envia novamente ao Juridico. A aprovacao final (`conferido`) retorna antes deste bloco,
    // dentro de `aplicarAprovacaoNaTransacao`, que ja atualiza o espelho da solicitacao.
    await espelharERegistrar(contrato, {
      acao: ACAO_HISTORICO_JURIDICO[etapaNormalizada],
      descricao: DESCRICAO_HISTORICO_JURIDICO[etapaNormalizada](contrato, {
        link: linkLimpo,
        temArquivo,
        assinadoPeloLink: confirmouAssinaturaPeloLink
      }),
      usuario,
      metadata: {
        contrato_id: contrato.id,
        etapa: etapaNormalizada,
        link_assinatura: linkLimpo || null,
        assinado_pelo_link: etapaNormalizada === 'assinado' ? confirmouAssinaturaPeloLink : null
      }
    }, transaction);
    return {
      contrato: { id: contrato.id, codigo: contrato.codigo, status_contrato: passo.para },
      titulos_criados: 0,
      titulos_ids: []
    };
  });

  await emitirEventosDeTitulos(resultado, { usuario, req });
  return resultado;
}

/**
 * S5 (PI-6): encerra o contrato — quebra de contrato.
 *
 * Zera o saldo restante e marca os titulos EM ABERTO como EXCLUIDO: nada mais do que estava
 * previsto sera pago. Diferente da exclusao avulsa de titulo (S4), aqui o valor NAO volta para
 * lugar nenhum — o contrato acabou.
 *
 * Titulo PARCIALMENTE PAGO fecha pelo valor ja pago, que passa a ser o valor oficial: excluir
 * apagaria um pagamento que aconteceu, e deixar em aberto contrariaria o encerramento. So um
 * estorno da baixa reabre. Titulo QUITADO nao e tocado.
 */
async function encerrarContrato(contratoId, { usuario, motivo } = {}) {
  const { userHasStrictAreaPermission } = require('./authorizationService');

  const permitido = await userHasStrictAreaPermission(usuario, ['contratos.geral.encerrar']);
  if (!permitido) {
    throw Object.assign(
      new Error('Acesso negado: encerrar contrato exige permissao especifica.'),
      { statusCode: 403 }
    );
  }

  const motivoLimpo = String(motivo || '').trim();
  if (!motivoLimpo) {
    throw Object.assign(new Error('Informe o motivo do encerramento.'), { statusCode: 400 });
  }

  return sequelize.transaction(async (transaction) => {
    const contrato = await Contrato.findOne({
      where: { id: contratoId, fluxo_novo: true },
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    if (!contrato) {
      throw Object.assign(new Error('Contrato do fluxo novo nao encontrado.'), { statusCode: 404 });
    }
    if (contrato.status_contrato === STATUS_CONTRATO.ENCERRADO) {
      throw Object.assign(new Error('Contrato ja esta encerrado.'), { statusCode: 409 });
    }

    const parcelas = await ContratoParcela.findAll({
      where: { contrato_id: contrato.id },
      // `valor_baixado` e obrigatorio aqui: e ele que vira o valor oficial do titulo
      // parcialmente pago. Sem trazer a coluna, o valor chegava indefinido e zerava o titulo.
      include: [{ model: TituloFinanceiro, as: 'titulo', attributes: ['id', 'status', 'valor_baixado'], required: false }],
      order: [['numero', 'ASC']],
      transaction
    });

    const titulosExcluidos = [];
    const titulosAjustados = [];
    let saldoZeradoCent = 0;

    for (const parcela of parcelas) {
      const statusTitulo = parcela.titulo?.status || null;

      // Titulo parcialmente pago: o que foi pago passa a ser o valor OFICIAL do titulo
      // (regra do cliente, 18/08). Nao se exclui — apagaria um pagamento que aconteceu —
      // e nao se deixa em aberto — o contrato acabou e nada mais sera pago. O titulo fecha
      // pelo valor pago; so um estorno da baixa reabre a discussao.
      if (statusTitulo === 'PARCIAL') {
        const pagoCent = paraCentavos(parcela.titulo.valor_baixado || 0);
        const previstoCent = paraCentavos(parcela.valor);
        saldoZeradoCent += Math.max(previstoCent - pagoCent, 0);

        // eslint-disable-next-line no-await-in-loop
        await TituloFinanceiro.unscoped().update(
          {
            valor_original: pagoCent / 100,
            valor_bruto: pagoCent / 100,
            valor_liquido: pagoCent / 100,
            valor_saldo: 0,
            status: 'QUITADO',
            atualizado_por: usuario?.id || null
          },
          { where: { id: parcela.titulo.id }, transaction }
        );
        // eslint-disable-next-line no-await-in-loop
        await parcela.update(
          { valor: pagoCent / 100, travada: true, atualizado_por: usuario?.id || null },
          { transaction }
        );
        titulosAjustados.push({ titulo_id: parcela.titulo.id, valor_oficial: pagoCent / 100 });
        continue;
      }

      if (statusTitulo === 'QUITADO' || statusTitulo === 'EXCLUIDO') continue;

      saldoZeradoCent += paraCentavos(parcela.valor);

      if (parcela.titulo?.id) {
        // eslint-disable-next-line no-await-in-loop
        await TituloFinanceiro.unscoped().update(
          {
            status: 'EXCLUIDO',
            deleted_at: new Date(),
            deleted_by: usuario?.id || null,
            deleted_reason: `Contrato ${contrato.codigo} encerrado: ${motivoLimpo}`.slice(0, 255),
            atualizado_por: usuario?.id || null
          },
          { where: { id: parcela.titulo.id }, transaction }
        );
        titulosExcluidos.push(parcela.titulo.id);
      }

      // eslint-disable-next-line no-await-in-loop
      await parcela.update(
        { valor: 0, status: STATUS_PARCELA.REJEITADA, travada: true, atualizado_por: usuario?.id || null },
        { transaction }
      );
    }

    await contrato.update(
      { status_contrato: STATUS_CONTRATO.ENCERRADO, ativo: false },
      { transaction }
    );
    await espelharERegistrar(contrato, {
      acao: 'CONTRATO_ENCERRADO',
      descricao: `Contrato ${contrato.codigo} encerrado.`,
      usuario,
      metadata: { contrato_id: contrato.id }
    }, transaction);

    return {
      contrato: { id: contrato.id, codigo: contrato.codigo, status_contrato: STATUS_CONTRATO.ENCERRADO },
      saldo_zerado: saldoZeradoCent / 100,
      titulos_excluidos: titulosExcluidos,
      // Parcialmente pagos fecharam pelo valor pago — quem encerra precisa ver quais e por quanto.
      titulos_ajustados_ao_valor_pago: titulosAjustados
    };
  });
}

module.exports = {
  criarContrato,
  aprovarContrato,
  rejeitarContrato,
  tramitarNoJuridico,
  cancelarSolicitacaoDoContrato,
  reenviarContratoParaAprovacao,
  atualizarApropriacoesDoContrato,
  registrarHistoricoDoContrato,
  listarCategoriasParaContrato,
  TIPO_ANEXO_NEGOCIACAO,
  TIPO_ANEXO_CARTAO_CNPJ,
  TIPO_ANEXO_ATO_CONSTITUTIVO,
  TIPO_ANEXO_DOCUMENTOS_REPRESENTANTE,
  DOCUMENTOS_JURIDICOS_OBRIGATORIOS,
  TIPO_ANEXO_MINUTA,
  encerrarContrato,
  listarParcelasDoContrato,
  STATUS_PARCELA,
  STATUS_CONTRATO,
  LIMITE_APROVACAO
};
