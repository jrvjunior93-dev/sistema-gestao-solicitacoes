'use strict';

const { sequelize, Contrato, ContratoAditivo, ContratoAnexo, ContratoParcela, ConfiguracaoSistema, Historico, Solicitacao } = require('../models');
const { codigoDoSetor } = require('../utils/codigoDoSetor');
const gerarCodigoSolicitacao = require('./solicitacao/gerarCodigo');
const { paraCentavos, somenteData, formatarISO } = require('./contratoParcelasService');
const { obterLimiteJuridico } = require('./contratoLimiteConfigService');
const { validarResponsavelVinculadoObra } = require('./contratoResponsavelService');
const { validarNovaVigencia } = require('./contratoAditivoVigencia');
const { validarCronogramaParcelas } = require('./contratoAditivoCronograma');
const { uploadToS3 } = require('./s3');
const { normalizeOriginalName } = require('../utils/fileName');
const {
  calcularRoteamentoSolicitacaoAditivo,
  SETOR_GERENCIA_PROCESSOS,
  SETOR_JURIDICO,
  STATUS_SOLICITACAO_PEDIDO_ADITIVO,
  STATUS_SOLICITACAO_JURIDICO
} = require('./contratoAditivoRoteamento');

/**
 * Termo aditivo de contrato (escopo 3.1.1 / 3.2.1, regra PI-12).
 *
 * Teto: a soma dos aditivos APROVADOS mais o valor pedido nao pode passar de 25% do valor
 * ORIGINAL do contrato. Original, e nao o total ja acrescido: usar o valor inflado faria o teto
 * crescer a cada aditivo, que e o oposto do que o cliente pediu.
 *
 * Pendente NAO consome o teto — se consumisse, um aditivo esquecido em analise bloquearia todos
 * os outros. A consequencia assumida esta no mapa: dois pendentes podem somar mais de 25%, e o
 * segundo sera recusado na APROVACAO.
 */
const PERCENTUAL_MAXIMO = 25;

// `CANCELADO` entrou no item 26 (23/08) e NAO precisou de migration: a coluna e `varchar(20)`.
//
// Rejeitar e cancelar nao sao a mesma coisa, e e por isso que sao dois. Rejeitar e a Gerencia
// dizendo "nao aprovo este aumento", e exige motivo. Cancelar e o pedido sendo RETIRADO — foi
// pedido errado, ou deixou de ser necessario. Sao decisoes de pessoas diferentes, com permissoes
// diferentes, exatamente como no contrato.
const STATUS = {
  PENDENTE: 'PENDENTE',
  APROVADO: 'APROVADO',
  REJEITADO: 'REJEITADO',
  CANCELADO: 'CANCELADO'
};

/**
 * O aditivo diz o que ele MUDA — e isso decide quantas parcelas nascem na aprovacao (cliente, 21/08).
 *
 * `VALOR`            : so dinheiro. O prazo final do contrato nao muda, entao nenhuma data nova
 *                      aparece: o valor cai na ultima parcela ainda livre ou, se ela ja estiver
 *                      comprometida, nasce UMA parcela com o MESMO vencimento da ultima.
 * `VALOR_E_VIGENCIA` : dinheiro e prazo. Nascem as parcelas do cronograma financeiro informado;
 *                      seus vencimentos nao precisam terminar dentro da vigencia do servico.
 *
 * Informado, nunca deduzido de "tem nova vigencia preenchida?": deduzir transformaria um campo
 * esquecido em decisao tomada.
 */
const TIPO = { VALOR: 'VALOR', VALOR_E_VIGENCIA: 'VALOR_E_VIGENCIA', PRAZO: 'PRAZO' };

/**
 * `PRAZO` e o terceiro tipo, e ele NAO tem dinheiro novo (cliente, 21/08).
 *
 * O caso: a ultima parcela ainda tem saldo que nao foi medido e o prazo do contrato acabou. O
 * dinheiro ja esta no contrato, parado numa parcela que ninguem mediu — o que falta e prazo. Entao
 * este aditivo estende a vigencia e REDISTRIBUI o saldo livre nas parcelas que o usuario pedir.
 *
 * Por nao ter valor, ele tambem nao consome o teto de 25%: nao ha valor a limitar.
 */
const TIPOS_SEM_VALOR = new Set([TIPO.PRAZO]);

// Teto de parcelas do contrato, o mesmo da criacao (17/08). Conferido na SOLICITACAO, e nao so na
// aprovacao: quem pede precisa saber na hora, nao depois de a Gerencia analisar.
const MAXIMO_PARCELAS = 24;
const TIPO_ANEXO_NEGOCIACAO_ADITIVO = 'NEGOCIACAO_DETALHADA_ADITIVO';

/**
 * Divide o valor do aditivo entre N parcelas em centavos inteiros, com o resto na ULTIMA.
 *
 * Mesma aritmetica do rateio das apropriacoes: dividir em float e arredondar cada pedaco deixa
 * centavo sobrando ou faltando, e a soma das parcelas deixaria de fechar com o contratado.
 */
function dividirEmCentavos(totalCent, quantidade) {
  const base = Math.floor(totalCent / quantidade);
  const partes = new Array(quantidade).fill(base);
  partes[quantidade - 1] = totalCent - base * (quantidade - 1);
  return partes;
}

/**
 * Vencimentos das parcelas do aditivo de VIGENCIA: distribuidos entre o vencimento da ultima
 * parcela existente e a nova vigencia final, com a N-esima caindo EXATAMENTE na nova vigencia.
 *
 * E um palpite razoavel, nao uma verdade: o cliente disse que a pessoa ajusta depois conforme a
 * necessidade de medicao, e a parcela nova nasce livre justamente para isso.
 */
function vencimentosAteNovaVigencia(ultimoVencimento, novaVigenciaFim, quantidade) {
  const inicio = new Date(`${formatarISO(somenteData(ultimoVencimento))}T00:00:00`);
  const fim = new Date(`${formatarISO(somenteData(novaVigenciaFim))}T00:00:00`);
  const intervalo = fim.getTime() - inicio.getTime();

  return Array.from({ length: quantidade }, (_, i) => {
    const passo = Math.round((intervalo * (i + 1)) / quantidade);
    return formatarISO(new Date(inicio.getTime() + passo));
  });
}

function normalizarTipo(valor) {
  const limpo = String(valor || '').trim().toUpperCase();
  return Object.values(TIPO).includes(limpo) ? limpo : null;
}

const erro = (mensagem, statusCode = 400) => Object.assign(new Error(mensagem), { statusCode });

/**
 * Contrato encerrado ou inativo nao aceita aditivo. Vale para os DOIS fluxos, e por isso olha as
 * duas marcas: `status_contrato = ENCERRADO` so existe no fluxo novo (nos 335 legados ele e
 * NULL), enquanto `ativo = false` existe nos dois. Acrescentar valor a um contrato encerrado
 * ressuscitaria um compromisso que a empresa ja deu por fechado.
 */
const STATUS_CONTRATO_ENCERRADO = 'ENCERRADO';

function contratoAceitaAditivo(contrato) {
  if (!contrato) return false;
  if (contrato.ativo === false) return false;
  return String(contrato.status_contrato || '').toUpperCase() !== STATUS_CONTRATO_ENCERRADO;
}

function garantirContratoAceitaAditivo(contrato) {
  if (contratoAceitaAditivo(contrato)) return;
  const identificacao = contrato?.codigo ? ` ${contrato.codigo}` : '';
  throw erro(`Contrato${identificacao} esta encerrado ou inativo e nao aceita termo aditivo.`, 409);
}

/**
 * Quanto ainda cabe em aditivo neste contrato. E o numero que a tela mostra e que a validacao
 * usa — os dois pela mesma fonte, para nao divergirem.
 */
async function calcularTetoAditivo(contratoId, transaction) {
  const contrato = await Contrato.findByPk(contratoId, {
    // `ativo` e `status_contrato` vem junto para a guarda de contrato encerrado nao precisar de
    // uma segunda consulta — e para a tela poder desabilitar o botao pelo mesmo dado.
    attributes: [
      'id',
      'codigo',
      'obra_id',
      'responsavel_id',
      'valor_total',
      'vigencia_inicio',
      'vigencia_fim',
      'ativo',
      'status_contrato',
      'fluxo_novo'
    ],
    transaction
  });
  if (!contrato) throw erro('Contrato nao encontrado.', 404);

  const resumoParcelas = contrato.fluxo_novo
    ? await obterResumoParcelasLivres(contratoId, transaction)
    : { saldoCent: 0, quantidadeLivres: 0, quantidadeTotal: 0, ultimaParcelaVencimento: null };

  const aprovados = await ContratoAditivo.findAll({
    where: { contrato_id: contratoId, status: STATUS.APROVADO },
    attributes: ['valor'],
    transaction
  });

  const originalCent = paraCentavos(contrato.valor_total);
  // Teto em centavos, arredondado para baixo: nunca liberar um centavo a mais que 25%.
  const tetoCent = Math.floor((originalCent * PERCENTUAL_MAXIMO) / 100);
  const usadoCent = aprovados.reduce((acc, a) => acc + paraCentavos(a.valor), 0);

  return {
    contrato: {
      id: contrato.id,
      codigo: contrato.codigo,
      ativo: contrato.ativo !== false,
      status_contrato: contrato.status_contrato || null,
      fluxo_novo: Boolean(contrato.fluxo_novo),
      obra_id: contrato.obra_id,
      responsavel_id: contrato.responsavel_id || null,
      vigencia_inicio: contrato.vigencia_inicio || null,
      vigencia_fim: contrato.vigencia_fim || null,
      // Usado somente como sugestao para o proximo vencimento financeiro. Nao limita vigencia:
      // pagamento e execucao sao cronogramas independentes.
      ultima_parcela_vencimento: resumoParcelas.ultimaParcelaVencimento || null
    },
    aceita_aditivo: contratoAceitaAditivo(contrato),
    percentual_maximo: PERCENTUAL_MAXIMO,
    valor_original: originalCent / 100,
    teto: tetoCent / 100,
    usado: usadoCent / 100,
    disponivel: Math.max(tetoCent - usadoCent, 0) / 100,
    saldo_livre: resumoParcelas.saldoCent / 100,
    saldo_livre_cent: resumoParcelas.saldoCent,
    parcelas_existentes: resumoParcelas.quantidadeTotal,
    parcelas_livres: resumoParcelas.quantidadeLivres,
    teto_cent: tetoCent,
    usado_cent: usadoCent,
    disponivel_cent: Math.max(tetoCent - usadoCent, 0)
  };
}

/**
 * Qual TIPO DE SOLICITACAO usar quando o aditivo de contrato LEGADO abre uma solicitacao propria.
 *
 * Os 335 contratos legados tem `tipo_macro_id` NULO — nenhum deles carrega o tipo — e
 * `solicitacoes.tipo_solicitacao_id` e NOT NULL. Entao o tipo precisa vir de algum lugar.
 *
 * Deliberadamente NAO chuto um tipo aqui. Escolher o tipo errado joga a solicitacao na fila
 * errada, com o comportamento de formulario errado, e ninguem descobre ate reclamarem — e
 * "presumir regra do cliente" ja custou uma implementacao inteira neste projeto. Vira
 * configuracao, com erro que diz exatamente o que configurar.
 */
const CHAVE_TIPO_ADITIVO_LEGADO = 'CONTRATO_ADITIVO_TIPO_SOLICITACAO';

// Destinos do pedido de aditivo. Os codigos, nunca os nomes, alimentam a fila: ha setor com espaco
// no fim do nome no banco. Ate o limite, a decisao continua na Gerencia de Processos; se o valor
// total do contrato depois do pedido ultrapassar o limite juridico configuravel, o pedido vai
// diretamente ao Juridico.
const SETOR_OBRA = 'OBRA';
const STATUS_SOLICITACAO_ADITIVO_APROVADO = 'APROVADA';

async function obterTipoSolicitacaoAditivoLegado(transaction) {
  const cfg = await ConfiguracaoSistema.findOne({
    where: { chave: CHAVE_TIPO_ADITIVO_LEGADO },
    order: [['id', 'DESC']],
    ...(transaction ? { transaction } : {})
  });
  if (!cfg?.valor) return null;
  let valor = cfg.valor;
  try {
    const json = JSON.parse(cfg.valor);
    valor = json && typeof json === 'object' ? json.tipo_solicitacao_id : json;
  } catch { /* valor cru */ }
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function solicitarAditivo(
  dados,
  { usuarioId, negociacaoArquivo, uploadArquivo = uploadToS3 } = {}
) {
  const {
    contrato_id: contratoId,
    valor,
    nova_vigencia_fim: novaVigenciaFim,
    justificativa,
    // O que o aditivo muda, e quantas parcelas ele cria. Ver a constante TIPO.
    tipo,
    qtde_parcelas: qtdeParcelas,
    parcelas: parcelasInformadas,
    responsavel_id: responsavelId,
    solicitacao_id: solicitacaoId,
    // PI-16: so usada no contrato LEGADO, que precisa de uma solicitacao nova e portanto de um
    // setor para ela cair. No fluxo novo a solicitacao ja existe e a area vem dela.
    area_responsavel: areaResponsavel
  } = dados || {};

  if (!negociacaoArquivo) {
    throw erro('Anexe a Negociacao Detalhada do termo aditivo em .docx ou .pdf.');
  }

  if (!String(justificativa || '').trim()) {
    throw erro('Justificativa do aditivo e obrigatoria.');
  }

  // O TIPO e obrigatorio e nao tem padrao silencioso. Sem ele, a aprovacao nao teria como saber se
  // cria uma parcela com o vencimento antigo ou varias ate um prazo novo — e escolher por conta
  // propria e o que fazia o dinheiro do aditivo ficar sem parcela nenhuma.
  const tipoNormalizado = normalizarTipo(tipo);
  if (!tipoNormalizado) {
    throw erro('Informe se o aditivo e apenas de valor ou tambem de vigencia.');
  }

  // A conferencia do VALOR vem depois do tipo porque o aditivo de PRAZO nao tem valor: exigi-lo
  // antes obrigaria a inventar um numero para um aditivo que so mexe em data.
  const semValor = TIPOS_SEM_VALOR.has(tipoNormalizado);
  const valorCent = semValor ? 0 : paraCentavos(valor);
  if (semValor) {
    if (paraCentavos(valor) > 0) {
      throw erro('Aditivo de prazo nao acrescenta valor ao contrato. Para acrescentar, use o aditivo de valor.');
    }
  } else if (!Number.isFinite(valorCent) || valorCent <= 0) {
    throw erro('Informe o valor do aditivo.');
  }

  let quantidadeParcelas = null;
  let novaVigenciaNormalizada = null;
  if (tipoNormalizado === TIPO.VALOR_E_VIGENCIA || tipoNormalizado === TIPO.PRAZO) {
    if (!novaVigenciaFim) {
      throw erro('Aditivo de vigencia exige a nova data final do contrato.');
    }
    quantidadeParcelas = Array.isArray(parcelasInformadas)
      ? parcelasInformadas.length
      : Number(qtdeParcelas);
    if (!Number.isInteger(quantidadeParcelas) || quantidadeParcelas < 1) {
      throw erro('Adicione ao menos uma parcela ao cronograma financeiro do aditivo.');
    }
  }

  return sequelize.transaction(async (transaction) => {
    const teto = await calcularTetoAditivo(contratoId, transaction);
    garantirContratoAceitaAditivo(teto.contrato);
    const contrato = await Contrato.findByPk(contratoId, {
      attributes: ['id', 'codigo', 'obra_id', 'valor_total', 'fluxo_novo', 'solicitacao_id',
        'tipo_macro_id', 'tipo_sub_id', 'favorecido_id', 'responsavel_id', 'vigencia_fim'],
      transaction
    });
    const exigeNovaVigencia = tipoNormalizado === TIPO.VALOR_E_VIGENCIA || tipoNormalizado === TIPO.PRAZO;
    if (exigeNovaVigencia) {
      const validacaoVigencia = validarNovaVigencia({
        novaVigenciaFim,
        vigenciaAtualFim: contrato.vigencia_fim
      });
      if (!validacaoVigencia.valida) throw erro(validacaoVigencia.mensagem);
      novaVigenciaNormalizada = validacaoVigencia.nova_vigencia_fim;
    }
    const responsavelAditivoId = await validarResponsavelVinculadoObra(
      responsavelId || contrato.responsavel_id || null,
      contrato.obra_id,
      { transaction }
    );
    // O teto de 25% e sobre VALOR. Aditivo de prazo nao tem valor e por isso nao entra na conta —
    // travar por teto um aditivo que nao acrescenta dinheiro seria barrar pelo motivo errado.
    if (!semValor && valorCent > teto.disponivel_cent) {
      throw erro(
        `O aditivo de R$ ${(valorCent / 100).toFixed(2)} passa do limite de ${PERCENTUAL_MAXIMO}% do contrato `
        + `(teto R$ ${teto.teto.toFixed(2)}, ja aprovado R$ ${teto.usado.toFixed(2)}, `
        + `disponivel R$ ${teto.disponivel.toFixed(2)}).`
      );
    }

    // Regra exclusiva do pedido de ADITIVO. A aprovacao inicial do contrato continua na maquina de
    // estados de `contratoFluxoNovoService` e nao e alterada aqui.
    //
    // O corte juridico do aditivo considera somente o valor ORIGINAL do contrato. Nem os aditivos
    // ja aprovados nem o valor deste pedido participam da decisao: contrato originalmente ate o
    // limite passa pela GEO; contrato originalmente acima dele vai direto ao Juridico.
    const { limite_cent: limiteJuridicoCent } = await obterLimiteJuridico();
    const {
      valorOriginalCent,
      encaminharDiretoAoJuridico,
      setorDestino,
      statusDestino
    } = calcularRoteamentoSolicitacaoAditivo({
      valorOriginal: contrato.valor_total,
      limiteCent: limiteJuridicoCent
    });

    // PI-16: o aditivo entra na solicitacao QUE JA EXISTE quando o contrato e do fluxo novo, e
    // abre uma NOVA quando o contrato e legado — porque la nao existe solicitacao-mae onde
    // pendurar o pedido. As duas trilhas caem no mesmo registro de `contrato_aditivos`; o que
    // muda e onde a pessoa acompanha.
    let solicitacaoDoAditivo = contrato?.fluxo_novo ? contrato.solicitacao_id : null;
    let criouSolicitacao = false;

    if (!solicitacaoDoAditivo) {
      const tipoSolicitacao = contrato.tipo_macro_id || await obterTipoSolicitacaoAditivoLegado(transaction);
      if (!tipoSolicitacao) {
        throw erro(
          'Nao ha tipo de solicitacao definido para aditivo de contrato do fluxo antigo. '
          + `Configure a chave ${CHAVE_TIPO_ADITIVO_LEGADO} com o id do tipo que deve receber esses pedidos.`,
          409
        );
      }
      const nova = await Solicitacao.create({
        codigo: await gerarCodigoSolicitacao(),
        obra_id: contrato.obra_id,
        parceiro_id: contrato.favorecido_id || null,
        tipo_solicitacao_id: tipoSolicitacao,
        tipo_macro_id: contrato.tipo_macro_id || null,
        tipo_sub_id: contrato.tipo_sub_id || null,
        contrato_id: contrato.id,
        codigo_contrato: contrato.codigo,
        descricao: `Termo aditivo do contrato ${contrato.codigo}`,
        valor: valorCent / 100,
        // Calculado pelo mesmo limite juridico usado na abertura de contrato; nunca herdado da tela.
        area_responsavel: setorDestino,
        criado_por: usuarioId || null,
        // No legado o pedido nasce em uma solicitacao propria e preserva o status historico.
        status_global: STATUS_SOLICITACAO_JURIDICO
      }, { transaction });
      solicitacaoDoAditivo = nova.id;
      criouSolicitacao = true;
    }

    // Aditivo de PRAZO redistribui o saldo que JA existe. Sem saldo livre nao ha o que colocar nas
    // parcelas novas, e o pedido certo e outro — o de valor. Recusado aqui, com o nome do caminho.
    if (tipoNormalizado === TIPO.PRAZO && contrato?.fluxo_novo) {
      const livreCent = teto.saldo_livre_cent;
      if (livreCent <= 0) {
        throw erro(
          'Nao ha saldo por medir neste contrato: o aditivo de prazo redistribui o que ja existe. '
          + 'Para acrescentar dinheiro, solicite um aditivo de valor.'
        );
      }
    }

    let cronogramaParcelas = null;
    if (exigeNovaVigencia && contrato?.fluxo_novo) {
      const totalCronogramaCent = tipoNormalizado === TIPO.PRAZO ? teto.saldo_livre_cent : valorCent;
      const parcelasComprometidas = teto.parcelas_existentes - teto.parcelas_livres;
      const maximoCronograma = tipoNormalizado === TIPO.PRAZO
        ? MAXIMO_PARCELAS - parcelasComprometidas
        : MAXIMO_PARCELAS - teto.parcelas_existentes;
      const validacaoCronograma = validarCronogramaParcelas({
        parcelas: parcelasInformadas,
        totalCent: totalCronogramaCent,
        maximoParcelas: Math.max(maximoCronograma, 0)
      });
      if (!validacaoCronograma.valida) throw erro(validacaoCronograma.mensagem);
      cronogramaParcelas = validacaoCronograma.parcelas;
      quantidadeParcelas = cronogramaParcelas.length;
    }

    // Teto de parcelas do contrato, conferido AQUI e nao na aprovacao: quem pede precisa saber na
    // hora que 30 parcelas nao cabem, e nao depois de a Gerencia analisar o pedido.
    if (contrato?.fluxo_novo && quantidadeParcelas) {
      const existentes = teto.parcelas_existentes;
      const comprometidas = existentes - teto.parcelas_livres;
      const totalDepois = tipoNormalizado === TIPO.PRAZO
        ? comprometidas + quantidadeParcelas
        : existentes + quantidadeParcelas;
      if (totalDepois > MAXIMO_PARCELAS) {
        throw erro(
          `O cronograma deixaria o contrato com ${totalDepois} parcela(s), acima do teto de ${MAXIMO_PARCELAS}.`
        );
      }
    }

    // O upload acontece somente depois de todas as validacoes de negocio. Assim, arquivo invalido
    // nao cria aditivo e regra invalida nao envia documento desnecessariamente ao armazenamento.
    const negociacaoCaminho = await uploadArquivo(
      negociacaoArquivo,
      `contratos/${String(contrato.codigo || contrato.id)}/aditivos/negociacao`
    );
    const negociacaoNomeOriginal = normalizeOriginalName(negociacaoArquivo.originalname);

    const aditivo = await ContratoAditivo.create({
      contrato_id: contratoId,
      solicitacao_id: solicitacaoId || solicitacaoDoAditivo || null,
      valor: valorCent / 100,
      // Tipo VALOR ignora qualquer data indevidamente enviada pelo cliente. A vigencia so pode
      // mudar pelos dois tipos que passam pela validacao de prorrogacao acima.
      nova_vigencia_fim: novaVigenciaNormalizada,
      tipo: tipoNormalizado,
      qtde_parcelas: quantidadeParcelas,
      cronograma_parcelas: cronogramaParcelas,
      justificativa: String(justificativa).trim(),
      // Se a tela nao trocar o responsavel, o aditivo preserva o responsavel do contrato.
      responsavel_id: responsavelAditivoId,
      status: STATUS.PENDENTE,
      criado_por: usuarioId || null
    }, { transaction });

    const negociacao = await ContratoAnexo.create({
      contrato_id: contratoId,
      aditivo_id: aditivo.id,
      nome_original: negociacaoNomeOriginal,
      caminho_arquivo: negociacaoCaminho,
      uploaded_by: usuarioId,
      tipo: TIPO_ANEXO_NEGOCIACAO_ADITIVO
    }, { transaction });

    // Entra na linha do tempo da solicitacao — a existente, no fluxo novo; a recem-criada, no
    // legado. Sem isto o aditivo seria invisivel para quem acompanha pela solicitacao.
    if (solicitacaoDoAditivo) {
      // `historicos.setor` e NOT NULL. A area informada nem sempre vem (o servico tambem e
      // chamado fora da tela), entao o recuo e a area da PROPRIA solicitacao — que sempre existe,
      // porque toda solicitacao nasce com setor.
      const alvo = await Solicitacao.findByPk(solicitacaoDoAditivo, {
        attributes: ['id', 'area_responsavel', 'status_global'],
        transaction
      });

      const areaAnterior = alvo?.area_responsavel || null;
      const statusAnterior = alvo?.status_global || null;
      const encaminhouFluxoNovo = Boolean(contrato?.fluxo_novo && alvo);

      // O contrato do fluxo novo reutiliza a solicitacao-mae. Ao pedir um aditivo, ela precisa
      // reaparecer na fila de quem decide, com um status que explique o motivo do retorno. Acima do
      // limite configuravel, essa fila e diretamente o Juridico; nos demais casos continua GEO.
      // Fazer o update aqui, na mesma transacao do aditivo, impede existir pedido sem fila (ou fila
      // sem pedido) quando alguma gravacao falhar.
      if (encaminhouFluxoNovo) {
        await alvo.update({
          area_responsavel: setorDestino,
          status_global: statusDestino
        }, { transaction });
      }

      const areaAtual = encaminhouFluxoNovo ? setorDestino : areaAnterior;
      const statusAtual = encaminhouFluxoNovo ? statusDestino : statusAnterior;

      await Historico.create({
        solicitacao_id: solicitacaoDoAditivo,
        usuario_responsavel_id: usuarioId || null,
        setor: encaminhouFluxoNovo
          ? setorDestino
          : String(areaResponsavel || '').trim() || areaAtual || '-',
        acao: 'ADITIVO_SOLICITADO',
        descricao: `Termo aditivo de R$ ${(valorCent / 100).toFixed(2)} solicitado no contrato ${contrato.codigo} `
          + '— aguardando aprovacao',
        status_anterior: statusAnterior,
        status_novo: statusAtual,
        metadata: JSON.stringify({
          aditivo_id: aditivo.id,
          contrato_id: contratoId,
          valor: valorCent / 100,
          disponivel_antes: teto.disponivel,
          limite_juridico: limiteJuridicoCent / 100,
          valor_original_contrato: valorOriginalCent / 100,
          encaminhado_direto_ao_juridico: encaminharDiretoAoJuridico,
          area_anterior: areaAnterior,
          area_nova: areaAtual,
          negociacao_anexo_id: negociacao.id
        })
      }, { transaction });

      // O formato exato de ENVIADA_SETOR e consumido pelas regras de visibilidade por historico.
      // Sem esta linha, a solicitacao some do setor anterior, mas a Gerencia pode nao encontra-la
      // pelas consultas que verificam por onde ela passou.
      if (encaminhouFluxoNovo && areaAnterior !== setorDestino) {
        await Historico.create({
          solicitacao_id: solicitacaoDoAditivo,
          usuario_responsavel_id: usuarioId || null,
          setor: setorDestino,
          acao: 'ENVIADA_SETOR',
          descricao: `De ${areaAnterior || '-'} para ${setorDestino}`,
          status_anterior: statusAnterior,
          status_novo: statusDestino,
          metadata: JSON.stringify({
            aditivo_id: aditivo.id,
            contrato_id: contratoId,
            limite_juridico: limiteJuridicoCent / 100,
            valor_original_contrato: valorOriginalCent / 100,
            encaminhado_direto_ao_juridico: encaminharDiretoAoJuridico
          })
        }, { transaction });
      }
    }

    return {
      aditivo: {
        id: aditivo.id,
        valor: valorCent / 100,
        status: STATUS.PENDENTE,
        negociacao_detalhada: {
          id: negociacao.id,
          nome_original: negociacao.nome_original,
          caminho_arquivo: negociacao.caminho_arquivo
        }
      },
      solicitacao_id: solicitacaoDoAditivo,
      criou_solicitacao: criouSolicitacao,
      setor_destino: setorDestino,
      status_destino: statusDestino,
      encaminhado_direto_ao_juridico: encaminharDiretoAoJuridico,
      teto
    };
  });
}

/**
 * Quanto o contrato tem parado em parcelas que ninguem mediu.
 *
 * E o "saldo livre" que o aditivo de PRAZO redistribui. Conta parcela sem vinculo de medicao ativo —
 * o mesmo criterio que tira a parcela da fila de medicao. Se divergisse, o aditivo redistribuiria
 * dinheiro que na verdade ja tem trabalho pedido.
 */
async function obterResumoParcelasLivres(contratoId, transaction) {
  const { MedicaoParcela } = require('../models');

  const parcelas = await ContratoParcela.findAll({
    where: { contrato_id: contratoId },
    attributes: ['id', 'numero', 'valor', 'data_vencimento'],
    order: [['data_vencimento', 'ASC'], ['numero', 'ASC']],
    transaction
  });
  if (parcelas.length === 0) {
    return { saldoCent: 0, quantidadeLivres: 0, quantidadeTotal: 0, ultimaParcelaVencimento: null };
  }

  const medidas = new Set(
    (await MedicaoParcela.findAll({
      attributes: ['contrato_parcela_id'],
      where: { devolvido_em: null, contrato_parcela_id: parcelas.map((p) => p.id) },
      transaction
    })).map((m) => Number(m.contrato_parcela_id))
  );

  const livres = parcelas.filter((p) => !medidas.has(Number(p.id)));
  return {
    saldoCent: livres.reduce((acc, p) => acc + paraCentavos(p.valor), 0),
    quantidadeLivres: livres.length,
    quantidadeTotal: parcelas.length,
    ultimaParcelaVencimento: formatarISO(somenteData(parcelas[parcelas.length - 1].data_vencimento))
  };
}

/**
 * Materializa o valor do aditivo em PARCELA (cliente, 21/08).
 *
 * Sem isto, aprovar o aditivo so subia `contratos.valor_aditivos`: o saldo abria e nao havia linha
 * para medir. O dinheiro ficava visivel no saldo e inalcancavel na pratica — nem por medicao nova
 * (nao ha parcela medivel), nem por edicao (nao ha de onde tirar a diferenca).
 *
 * Duas regras, decididas pelo cliente:
 *
 *   VALOR             o prazo NAO mudou, entao nenhuma data nova aparece. Se a ultima parcela ainda
 *                     esta livre, o valor entra nela — nao ha razao para criar linha quando existe
 *                     uma que ainda vai ser medida, e e o mesmo destino que a redistribuicao usa.
 *                     Se ela ja esta comprometida, nasce UMA parcela com o MESMO vencimento da
 *                     ultima, exatamente porque o prazo final nao mudou.
 *
 *   VALOR_E_VIGENCIA  nascem as parcelas do cronograma financeiro informado no pedido. Os
 *                     vencimentos sao independentes da vigencia do servico e podem ultrapassa-la.
 *
 * Contrato ATIVO ja tem titulo em todas as parcelas: a parcela nova nasce com titulo tambem, pela
 * MESMA rota de criacao usada na aprovacao do contrato (`criarTituloManual`), com a categoria
 * financeira do contrato. Parcela sem titulo num contrato ativo seria uma linha que ninguem paga.
 * Contrato ainda nao aprovado: a parcela fica em previsao e ganha titulo junto na aprovacao.
 *
 * Aditivo de contrato LEGADO nao passa por aqui — o legado nao tem `contrato_parcelas`.
 */
async function gerarParcelasDoAditivo(contrato, aditivo, { usuario, req, vigenciaAnterior = null }, transaction) {
  if (!contrato?.fluxo_novo) return { criadas: 0, parcela_aumentada: null };

  const valorCent = paraCentavos(aditivo.valor);
  const tipo = normalizarTipo(aditivo.tipo) || (aditivo.nova_vigencia_fim ? TIPO.VALOR_E_VIGENCIA : TIPO.VALOR);

  const parcelas = await ContratoParcela.findAll({
    where: { contrato_id: contrato.id },
    order: [['data_vencimento', 'ASC'], ['numero', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (parcelas.length === 0) return { criadas: 0, parcela_aumentada: null };

  const ultima = parcelas[parcelas.length - 1];
  const proximoNumero = Math.max(...parcelas.map((p) => Number(p.numero) || 0)) + 1;

  // "Comprometida" = ja consumida por uma medicao ativa. E o mesmo criterio que tira a parcela da
  // fila de medicao — se divergisse, o aditivo cairia numa parcela que ninguem mais pode medir.
  const { MedicaoParcela } = require('../models');
  const jaMedida = await MedicaoParcela.count({
    where: { devolvido_em: null, contrato_parcela_id: ultima.id },
    transaction
  });

  const novas = [];

  // ADITIVO DE PRAZO: o dinheiro ja esta no contrato, so falta prazo.
  //
  // Pega o saldo livre — o que esta em parcelas que ninguem mediu — e deixa esse mesmo saldo
  // distribuido no cronograma financeiro informado. As datas nao dependem da nova vigencia.
  //
  // REAPROVEITA as parcelas livres que ja existem, criando so a diferenca. Zerar as antigas e criar
  // N do zero deixaria linhas de R$ 0,00 com titulo aberto de R$ 0 — lixo que alguem teria de
  // limpar. Se o usuario pedir MENOS parcelas do que as livres que existem, as que sobram sao
  // zeradas e o titulo delas excluido, o mesmo tratamento que o encerramento ja da a titulo que nao
  // sera pago.
  if (tipo === TIPO.PRAZO) {
    const { MedicaoParcela } = require('../models');
    const medidas = new Set(
      (await MedicaoParcela.findAll({
        attributes: ['contrato_parcela_id'],
        where: { devolvido_em: null, contrato_parcela_id: parcelas.map((p) => p.id) },
        transaction
      })).map((m) => Number(m.contrato_parcela_id))
    );

    const livres = parcelas.filter((p) => !medidas.has(Number(p.id)));
    const saldoLivreCent = livres.reduce((acc, p) => acc + paraCentavos(p.valor), 0);
    if (saldoLivreCent <= 0) {
      throw erro('Nao ha saldo por medir para redistribuir neste aditivo de prazo.', 409);
    }

    const parcelasComprometidas = parcelas.length - livres.length;
    const cronogramaSalvo = aditivo.cronograma_parcelas;
    const quantidadeLegada = Number(aditivo.qtde_parcelas) || 1;
    const cronograma = cronogramaSalvo
      ? validarCronogramaParcelas({
        parcelas: cronogramaSalvo,
        totalCent: saldoLivreCent,
        maximoParcelas: Math.max(MAXIMO_PARCELAS - parcelasComprometidas, 0)
      })
      : null;
    if (cronograma && !cronograma.valida) {
      throw erro(`O cronograma financeiro do aditivo ficou invalido: ${cronograma.mensagem}`, 409);
    }

    // Compatibilidade para pedidos pendentes anteriores a esta versao: so eles continuam usando o
    // gerador antigo. Novos pedidos sempre chegam com a fotografia completa do cronograma.
    const itensCronograma = cronograma?.parcelas || (() => {
      const partes = dividirEmCentavos(saldoLivreCent, quantidadeLegada);
      const inicioDatas = vigenciaAnterior || ultima.data_vencimento;
      const datas = vencimentosAteNovaVigencia(inicioDatas, aditivo.nova_vigencia_fim, quantidadeLegada);
      return partes.map((parte, indice) => ({ numero: indice + 1, valor: parte / 100, vencimento: datas[indice] }));
    })();
    const quantidade = itensCronograma.length;

    const reaproveitadas = livres.slice(0, quantidade);
    for (let i = 0; i < reaproveitadas.length; i += 1) {
      const item = itensCronograma[i];
      const itemValorCent = paraCentavos(item.valor);
      // eslint-disable-next-line no-await-in-loop
      await reaproveitadas[i].update(
        { valor: itemValorCent / 100, data_vencimento: item.vencimento, atualizado_por: usuario?.id || null },
        { transaction }
      );
      if (reaproveitadas[i].titulo_financeiro_id) {
        const { sincronizarTituloDaParcela } = require('./medicaoContratoService');
        // eslint-disable-next-line no-await-in-loop
        await sincronizarTituloDaParcela(
          {
            parcela: reaproveitadas[i],
            valorCent: itemValorCent,
            vencimento: item.vencimento,
            usuarioId: usuario?.id
          },
          transaction
        );
      }
    }

    // Livres que sobraram porque o usuario pediu MENOS parcelas do que existiam.
    //
    // Elas somem: nunca tiveram medicao nem pagamento, e o saldo delas ja foi para as que ficaram.
    // A primeira versao apenas ZERAVA a parcela — e uma linha de R$ 0,00 continua contando como
    // "parcela livre" em toda consulta que pergunta o que falta medir, alem de aparecer na tela sem
    // servir para nada. O titulo e excluido antes, com motivo, como o encerramento ja faz.
    const { TituloFinanceiro } = require('../models');
    for (const sobrando of livres.slice(quantidade)) {
      if (sobrando.titulo_financeiro_id) {
        // eslint-disable-next-line no-await-in-loop
        await TituloFinanceiro.unscoped().update(
          {
            status: 'EXCLUIDO',
            deleted_at: new Date(),
            deleted_by: usuario?.id || null,
            deleted_reason: `Contrato ${contrato.codigo}: saldo redistribuido pelo aditivo de prazo ${aditivo.id}`.slice(0, 255),
            atualizado_por: usuario?.id || null
          },
          { where: { id: sobrando.titulo_financeiro_id }, transaction }
        );
      }
      // eslint-disable-next-line no-await-in-loop
      await sobrando.destroy({ transaction });
    }

    for (let i = reaproveitadas.length; i < quantidade; i += 1) {
      novas.push({
        numero: proximoNumero + (i - reaproveitadas.length),
        valorCent: paraCentavos(itensCronograma[i].valor),
        vencimento: itensCronograma[i].vencimento
      });
    }
  } else if (tipo === TIPO.VALOR) {
    if (jaMedida === 0) {
      const novoValorCent = paraCentavos(ultima.valor) + valorCent;
      await ultima.update(
        { valor: novoValorCent / 100, atualizado_por: usuario?.id || null },
        { transaction }
      );
      if (ultima.titulo_financeiro_id) {
        const { sincronizarTituloDaParcela } = require('./medicaoContratoService');
        await sincronizarTituloDaParcela(
          {
            parcela: ultima,
            valorCent: novoValorCent,
            vencimento: formatarISO(somenteData(ultima.data_vencimento)),
            usuarioId: usuario?.id
          },
          transaction
        );
      }
      return { criadas: 0, parcela_aumentada: { id: ultima.id, numero: ultima.numero, valor: novoValorCent / 100 } };
    }

    novas.push({
      numero: proximoNumero,
      valorCent,
      // O prazo final do contrato nao mudou: a parcela nova vence junto com a ultima.
      vencimento: formatarISO(somenteData(ultima.data_vencimento))
    });
  } else {
    const quantidadeLegada = Number(aditivo.qtde_parcelas) || 1;
    const cronograma = aditivo.cronograma_parcelas
      ? validarCronogramaParcelas({
        parcelas: aditivo.cronograma_parcelas,
        totalCent: valorCent,
        maximoParcelas: Math.max(MAXIMO_PARCELAS - parcelas.length, 0)
      })
      : null;
    if (cronograma && !cronograma.valida) {
      throw erro(`O cronograma financeiro do aditivo ficou invalido: ${cronograma.mensagem}`, 409);
    }
    const itensCronograma = cronograma?.parcelas || (() => {
      const partes = dividirEmCentavos(valorCent, quantidadeLegada);
      const datas = vencimentosAteNovaVigencia(ultima.data_vencimento, aditivo.nova_vigencia_fim, quantidadeLegada);
      return partes.map((parte, indice) => ({ numero: indice + 1, valor: parte / 100, vencimento: datas[indice] }));
    })();
    itensCronograma.forEach((item, i) => {
      novas.push({
        numero: proximoNumero + i,
        valorCent: paraCentavos(item.valor),
        vencimento: item.vencimento
      });
    });
  }

  // O titulo so existe quando o contrato ja foi aprovado. Ler da ULTIMA parcela, e nao do status do
  // contrato, mantem a decisao no mesmo dado que a tela usa para saber se ha titulo.
  const contratoJaTemTitulos = parcelas.some((p) => p.titulo_financeiro_id);

  for (const nova of novas) {
    // eslint-disable-next-line no-await-in-loop
    const parcela = await ContratoParcela.create({
      contrato_id: contrato.id,
      numero: nova.numero,
      valor: nova.valorCent / 100,
      // `valor_previsto` e a referencia da auditoria (PI-5): nasce igual ao valor pedido.
      valor_previsto: nova.valorCent / 100,
      data_vencimento: nova.vencimento,
      // A parcela do aditivo aprovado ainda depende de medicao para virar obrigacao aberta.
      status: 'PREVISAO',
      parceiro_id: ultima.parceiro_id,
      forma_pagamento_id: ultima.forma_pagamento_id,
      criado_por: usuario?.id || null
    }, { transaction });

    if (contratoJaTemTitulos) {
      // eslint-disable-next-line no-await-in-loop
      await criarTituloDaParcelaDoAditivo(contrato, aditivo, parcela, { usuario, req }, transaction);
    }
  }

  return { criadas: novas.length, parcela_aumentada: null };
}

/**
 * Titulo da parcela nascida do aditivo, pela MESMA rota da aprovacao do contrato.
 *
 * Criar `TituloFinanceiro` direto contornaria as validacoes obrigatorias (categoria, competencia,
 * forma de pagamento), deixaria o valor fora da DRE e nao geraria evento de auditoria — a mesma
 * razao que ja esta escrita na aprovacao.
 */
async function criarTituloDaParcelaDoAditivo(contrato, aditivo, parcela, { usuario, req }, transaction) {
  const { criarTituloManual } = require('./tituloFinanceiroService');

  if (!contrato.categoria_financeira_id) {
    throw erro(
      `O contrato ${contrato.codigo} nao tem categoria financeira e a parcela do aditivo nao pode virar titulo.`,
      409
    );
  }

  const agora = new Date();
  const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
  const competencia = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-01`;

  const criados = await criarTituloManual(
    req || { user: usuario },
    {
      tipo: 'PAGAR',
      // Aditivo aprovado aumenta o cronograma, mas nao libera pagamento. A medicao aprovada
      // transforma somente o titulo da parcela medida em ABERTO.
      status: 'PREVISAO',
      obra_id: contrato.obra_id,
      parceiro_id: parcela.parceiro_id,
      valor: Number(parcela.valor),
      descricao: `${contrato.codigo} - parcela ${parcela.numero} (aditivo ${aditivo.id})`,
      data_vencimento: parcela.data_vencimento,
      data_emissao: hoje,
      competencia_data: competencia,
      categoria_financeira_id: contrato.categoria_financeira_id,
      forma_pagamento_id: parcela.forma_pagamento_id || contrato.forma_pagamento_id || null
    },
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

  const titulo = criados?.titulo || (Array.isArray(criados?.titulos) ? criados.titulos[0] : null);
  if (!titulo?.id) {
    throw erro(`Nao foi possivel criar o titulo da parcela ${parcela.numero} do aditivo.`, 500);
  }

  await parcela.update(
    { titulo_financeiro_id: titulo.id, travada: true, atualizado_por: usuario?.id || null },
    { transaction }
  );
}

/**
 * Aprovar soma ao `valor_aditivos` do contrato — e so aqui. O saldo do contrato nao pode
 * crescer por um aditivo que ainda pode ser recusado.
 */
async function decidirAditivo(aditivoId, { usuario, req, aprovar, motivo } = {}) {
  const { userHasStrictAreaPermission } = require('./authorizationService');
  const permitido = await userHasStrictAreaPermission(usuario, ['contratos.aprovacao.aprovar']);
  if (!permitido) {
    throw erro('Acesso negado: decidir aditivo exige a permissao de aprovacao de contrato.', 403);
  }

  if (!aprovar && !String(motivo || '').trim()) {
    throw erro('Informe o motivo da rejeicao.');
  }

  return sequelize.transaction(async (transaction) => {
    const aditivo = await ContratoAditivo.findByPk(aditivoId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    if (!aditivo) throw erro('Aditivo nao encontrado.', 404);
    if (aditivo.status !== STATUS.PENDENTE) {
      throw erro(`Aditivo ja foi ${aditivo.status.toLowerCase()}.`, 409);
    }

    if (!aprovar) {
      const texto = String(motivo).trim().slice(0, 255);
      await aditivo.update(
        { status: STATUS.REJEITADO, motivo_rejeicao: texto },
        { transaction }
      );

      // A REJEICAO PASSOU A DEIXAR RASTRO (item 26, 23/08). So a aprovacao escrevia no historico:
      // um aditivo recusado desaparecia da linha do tempo, e quem o pediu nao ficava sabendo por
      // onde a decisao passou.
      await registrarNoHistoricoDoContrato(aditivo, {
        acao: 'ADITIVO_REJEITADO',
        descricao: (contratoCodigo) => `Aditivo do contrato ${contratoCodigo} rejeitado. Motivo: ${texto}`,
        usuario
      }, transaction);

      // Nada muda no contrato: o valor volta a caber no teto por consequencia, nao por ajuste.
      return { aditivo: { id: aditivo.id, status: STATUS.REJEITADO } };
    }

    // Reconfere o teto na aprovacao: entre a solicitacao e agora outro aditivo pode ter sido
    // aprovado, e dois pendentes juntos podem passar de 25%.
    const teto = await calcularTetoAditivo(aditivo.contrato_id, transaction);
    // De novo aqui: entre a solicitacao e a aprovacao o contrato pode ter sido encerrado.
    garantirContratoAceitaAditivo(teto.contrato);
    const valorCent = paraCentavos(aditivo.valor);
    // Mesma excecao da solicitacao: aditivo de prazo nao tem valor e nao disputa o teto de 25%.
    if (!TIPOS_SEM_VALOR.has(normalizarTipo(aditivo.tipo)) && valorCent > teto.disponivel_cent) {
      throw erro(
        `Nao e possivel aprovar: o aditivo passa do limite de ${PERCENTUAL_MAXIMO}% `
        + `(disponivel R$ ${teto.disponivel.toFixed(2)}).`,
        409
      );
    }

    const contrato = await Contrato.findByPk(aditivo.contrato_id, {
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    // Compatibilidade com pedidos antigos, criados antes de `tipo` ser obrigatorio: a presenca
    // de nova vigencia identifica o mesmo caminho que o gerador de parcelas ja usa.
    const tipoAditivo = normalizarTipo(aditivo.tipo)
      || (aditivo.nova_vigencia_fim ? TIPO.VALOR_E_VIGENCIA : TIPO.VALOR);
    if (tipoAditivo === TIPO.VALOR_E_VIGENCIA || tipoAditivo === TIPO.PRAZO) {
      // Reconfere sob lock: outro aditivo pode ter prorrogado o contrato enquanto este aguardava
      // aprovacao, ou a data pode ter se tornado retroativa durante uma analise demorada.
      const validacaoVigencia = validarNovaVigencia({
        novaVigenciaFim: aditivo.nova_vigencia_fim,
        vigenciaAtualFim: contrato.vigencia_fim
      });
      if (!validacaoVigencia.valida) {
        throw erro(`Nao e possivel aprovar: ${validacaoVigencia.mensagem}`, 409);
      }
    }
    const acrescidoCent = paraCentavos(contrato.valor_aditivos || 0) + valorCent;
    // Guardado ANTES do update: e a partir do fim ANTIGO que as datas do novo prazo comecam. Depois
    // do update `contrato.vigencia_fim` ja e o fim novo, e as parcelas nasceriam todas em cima dele.
    const vigenciaAnterior = contrato.vigencia_fim;

    await contrato.update(
      {
        valor_aditivos: acrescidoCent / 100,
        ...(aditivo.nova_vigencia_fim ? { vigencia_fim: aditivo.nova_vigencia_fim } : {})
      },
      { transaction }
    );
    await aditivo.update(
      { status: STATUS.APROVADO, aprovado_por: usuario?.id || null, aprovado_em: new Date() },
      { transaction }
    );

    // O valor aprovado vira PARCELA. Dentro da mesma transacao: contrato com saldo aberto e sem a
    // parcela correspondente seria exatamente a lacuna que esta mudanca fecha.
    const parcelas = await gerarParcelasDoAditivo(contrato, aditivo, { usuario, req, vigenciaAnterior }, transaction);

    // A solicitacao que foi para GEO analisar o pedido volta para a fila da OBRA assim que a
    // aprovacao termina. No fluxo novo ela e a solicitacao-mae do contrato; no legado e a
    // solicitacao criada especificamente para o aditivo. O update e os dois historicos ficam na
    // mesma transacao das parcelas: nao pode existir aditivo aprovado ainda parado em PED. ADITIVO.
    const solicitacaoDoAditivoId = Number(aditivo.solicitacao_id || contrato.solicitacao_id || 0);
    let solicitacaoDevolvida = null;

    if (solicitacaoDoAditivoId) {
      solicitacaoDevolvida = await Solicitacao.findByPk(solicitacaoDoAditivoId, {
        attributes: ['id', 'area_responsavel', 'status_global'],
        lock: transaction.LOCK.UPDATE,
        transaction
      });
    }

    if (solicitacaoDevolvida) {
      const areaAnterior = solicitacaoDevolvida.area_responsavel;
      const statusAnterior = solicitacaoDevolvida.status_global;

      await solicitacaoDevolvida.update({
        area_responsavel: SETOR_OBRA,
        status_global: STATUS_SOLICITACAO_ADITIVO_APROVADO
      }, { transaction });

      await Historico.create({
        solicitacao_id: solicitacaoDevolvida.id,
        usuario_responsavel_id: usuario?.id || null,
        setor: codigoDoSetor(usuario) || '-',
        acao: 'ADITIVO_APROVADO',
        descricao: `Aditivo de R$ ${(valorCent / 100).toFixed(2)} aprovado no contrato ${contrato.codigo}. `
          + (parcelas.criadas > 0
            ? `${parcelas.criadas} parcela(s) criada(s).`
            : `Valor somado a parcela ${parcelas.parcela_aumentada?.numero}.`),
        status_anterior: statusAnterior,
        status_novo: STATUS_SOLICITACAO_ADITIVO_APROVADO,
        metadata: JSON.stringify({
          aditivo_id: aditivo.id,
          valor: valorCent / 100,
          tipo: aditivo.tipo,
          parcelas_criadas: parcelas.criadas,
          parcela_aumentada: parcelas.parcela_aumentada,
          area_anterior: areaAnterior,
          area_nova: SETOR_OBRA
        })
      }, { transaction });

      // O formato "De X para Y" e o `setor` no destino sao consumidos pelas regras de visibilidade
      // por historico. Registrar apenas ADITIVO_APROVADO devolveria a coluna, mas poderia fazer a
      // solicitacao sumir das consultas que reconstroem por quais setores ela passou.
      if (areaAnterior !== SETOR_OBRA) {
        await Historico.create({
          solicitacao_id: solicitacaoDevolvida.id,
          usuario_responsavel_id: usuario?.id || null,
          setor: SETOR_OBRA,
          acao: 'ENVIADA_SETOR',
          descricao: `De ${areaAnterior || '-'} para ${SETOR_OBRA}`,
          status_anterior: statusAnterior,
          status_novo: STATUS_SOLICITACAO_ADITIVO_APROVADO,
          metadata: JSON.stringify({
            aditivo_id: aditivo.id,
            contrato_id: contrato.id,
            setor_origem: areaAnterior,
            setor_destino: SETOR_OBRA
          })
        }, { transaction });
      }
    }

    return {
      aditivo: { id: aditivo.id, status: STATUS.APROVADO, valor: valorCent / 100 },
      contrato: { id: contrato.id, valor_aditivos: acrescidoCent / 100 },
      solicitacao: solicitacaoDevolvida
        ? {
          id: solicitacaoDevolvida.id,
          area_responsavel: SETOR_OBRA,
          status_global: STATUS_SOLICITACAO_ADITIVO_APROVADO
        }
        : null,
      parcelas
    };
  });
}

/**
 * Uma linha no historico da SOLICITACAO dona do contrato.
 *
 * Existe para os tres desfechos escreverem do mesmo jeito. Ate o item 26 so a aprovacao escrevia, e
 * cada desfecho novo teria copiado o bloco dela — que e como duas linhas do mesmo evento acabam com
 * formatos diferentes.
 */
async function registrarNoHistoricoDoContrato(aditivo, { acao, descricao, usuario }, transaction) {
  const contrato = await Contrato.findByPk(aditivo.contrato_id, {
    attributes: ['id', 'codigo', 'solicitacao_id'],
    transaction
  });
  if (!contrato?.solicitacao_id) return null;

  return Historico.create({
    solicitacao_id: contrato.solicitacao_id,
    usuario_responsavel_id: usuario?.id || null,
    // `historicos.setor` e NOT NULL.
    setor: codigoDoSetor(usuario) || '-',
    acao,
    descricao: descricao(contrato.codigo),
    metadata: JSON.stringify({ aditivo_id: aditivo.id, tipo: aditivo.tipo })
  }, { transaction });
}

/**
 * CANCELAR o pedido de aditivo (item 26, 23/08).
 *
 * Permissao propria — `contratos.solicitacao.cancelar`, a mesma do cancelamento do contrato — e nao
 * a de aprovacao. Cancelar nao e decidir o merito: e retirar o pedido. Quem retira e o lado que
 * pediu, nao o que aprova, e por isso os dois botoes existem separados.
 *
 * Como a rejeicao, nao mexe no contrato: o valor volta a caber no teto por consequencia.
 */
async function cancelarAditivo(aditivoId, { usuario, motivo } = {}) {
  const { userHasStrictAreaPermission } = require('./authorizationService');
  const permitido = await userHasStrictAreaPermission(usuario, ['contratos.solicitacao.cancelar']);
  if (!permitido) {
    throw erro('Acesso negado: cancelar aditivo exige a permissao de cancelamento de contrato.', 403);
  }

  return sequelize.transaction(async (transaction) => {
    const aditivo = await ContratoAditivo.findByPk(aditivoId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    if (!aditivo) throw erro('Aditivo nao encontrado.', 404);
    // Mesma guarda da decisao: aditivo ja decidido nao volta atras por este caminho.
    if (aditivo.status !== STATUS.PENDENTE) {
      throw erro(`Aditivo ja foi ${aditivo.status.toLowerCase()}.`, 409);
    }

    const texto = String(motivo || '').trim().slice(0, 255);
    await aditivo.update({ status: STATUS.CANCELADO, motivo_rejeicao: texto || null }, { transaction });

    await registrarNoHistoricoDoContrato(aditivo, {
      acao: 'ADITIVO_CANCELADO',
      descricao: (codigo) => `Pedido de aditivo do contrato ${codigo} cancelado.`
        + (texto ? ` Motivo: ${texto}` : ''),
      usuario
    }, transaction);

    return { aditivo: { id: aditivo.id, status: STATUS.CANCELADO } };
  });
}

/**
 * Os aditivos de um contrato, para a tela.
 *
 * Nao existia rota de LISTAGEM: o aditivo era pedido e sumia. A rota de decisao ja existia, mas sem
 * lista nao havia onde por o botao — era essa a lacuna do item 26, e nao a falta de um `<button>`.
 */
async function listarAditivosDoContrato(contratoId) {
  const aditivos = await ContratoAditivo.findAll({
    where: { contrato_id: Number(contratoId) },
    include: [{
      model: ContratoAnexo,
      as: 'negociacaoDetalhada',
      attributes: ['id', 'nome_original', 'caminho_arquivo'],
      required: false
    }],
    order: [['id', 'DESC']]
  });

  return aditivos.map((a) => ({
    id: a.id,
    tipo: a.tipo,
    valor: Number(a.valor || 0),
    nova_vigencia_fim: a.nova_vigencia_fim,
    qtde_parcelas: a.qtde_parcelas,
    cronograma_parcelas: a.cronograma_parcelas,
    justificativa: a.justificativa,
    status: a.status,
    motivo_rejeicao: a.motivo_rejeicao,
    criado_por: a.criado_por,
    aprovado_por: a.aprovado_por,
    aprovado_em: a.aprovado_em,
    createdAt: a.createdAt,
    negociacao_detalhada: a.negociacaoDetalhada ? {
      id: a.negociacaoDetalhada.id,
      nome_original: a.negociacaoDetalhada.nome_original,
      caminho_arquivo: a.negociacaoDetalhada.caminho_arquivo
    } : null
  }));
}

module.exports = {
  contratoAceitaAditivo,
  TIPO,
  MAXIMO_PARCELAS,
  solicitarAditivo,
  decidirAditivo,
  cancelarAditivo,
  listarAditivosDoContrato,
  calcularTetoAditivo,
  PERCENTUAL_MAXIMO,
  STATUS
};
