'use strict';

const { Op } = require('sequelize');
const { sequelize, Anexo, Contrato, ContratoMedicao, ContratoParcela, FormaPagamentoFinanceira, Historico, MedicaoParcela, Parceiro, Solicitacao, TituloFinanceiro, TituloFinanceiroRateio } = require('../models');
const { codigoDoSetor, setorParaHistorico } = require('../utils/codigoDoSetor');
const { paraCentavos, somenteData, formatarISO } = require('./contratoParcelasService');
const { formaPagamentoEhBoleto, formaPagamentoEhPix, listarFormasDaMedicao } = require('./formasPagamentoMedicaoService');
const { findSetorByCapability, resolveSetorPersistenciaValue } = require('./setorCapabilityService');

/**
 * Medicao de contrato do fluxo novo (wireframe 2).
 *
 * Decisoes do cliente em 17/08/2026, registradas em MAPA-IMPACTO-MEDICAO.md:
 *
 * MD-6  A medicao VINCULA-SE as parcelas/titulos que ja existem — nao cria titulo novo.
 *       Pode editar valor e vencimento da parcela.
 * MD-7  Medir menos que o previsto REDUZ a parcela e joga a diferenca na ULTIMA parcela.
 *       O total do contrato e invariante.
 * MD-8  Periodo exige fim >= inicio e nao pode se sobrepor a outra medicao do contrato.
 *
 * Toda aritmetica passa por `paraCentavos` (conversao por digitos, mesma do wireframe 1):
 * somar float e arredondar no fim ja divergiu do DECIMAL do MySQL tres vezes neste projeto.
 */

// Status em que a parcela ainda pode ser alterada (PI-7).
//
// PREVISAO e ABERTO. O primeiro permite montar a medicao antes de liberar o titulo; o segundo
// permite corrigir uma medicao ja aprovada enquanto ainda nao houve baixa. QUITADO e PARCIAL
// ficam fechados porque, no momento do pagamento, o valor da
// parcela e acertado para o que foi realmente pago e a diferenca ja foi redistribuida nas
// ultimas parcelas — mexer depois desfaria essa redistribuicao. EXCLUIDO tambem nao se edita:
// o valor dele volta para a parcela final por outro caminho.
// Codigos de recuo usados nos historicos e no envio da medicao para conferencia. O destino da
// aprovacao e resolvido pela capacidade `eh_setor_obra`, sem depender do nome cadastrado.
const SETOR_FINANCEIRO = 'FINANCEIRO';
const SETOR_GERENCIA_PROCESSOS = 'GEO';

const STATUS_TITULO_EDITAVEL = new Set(['PREVISAO', 'ABERTO']);
const STATUS_PARCELA_EDITAVEL = new Set(['PREVISAO', 'APROVADA']);

const erro = (mensagem, statusCode = 400) => Object.assign(new Error(mensagem), { statusCode });

/**
 * O status que a tela mostra e que decide se a linha e medivel: o do TITULO quando ele ja
 * existe, o da PARCELA enquanto nao existe. E o "vai depender do fluxo" do MD-6.
 */
function statusEfetivo(parcela) {
  const statusTitulo = parcela.titulo?.status || null;
  return {
    status: statusTitulo || parcela.status,
    origem: statusTitulo ? 'TITULO' : 'PARCELA',
    editavel: parcela.titulo?.renegociado_por_id ? false : statusTitulo
      ? STATUS_TITULO_EDITAVEL.has(statusTitulo)
      : STATUS_PARCELA_EDITAVEL.has(parcela.status)
  };
}

function periodosSeSobrepoem(inicioA, fimA, inicioB, fimB) {
  // Sobreposicao classica: A comeca antes de B terminar e termina depois de B comecar.
  return inicioA <= fimB && fimA >= inicioB;
}

/**
 * MD-8: validacoes de periodo. Recebe datas ISO (YYYY-MM-DD).
 *
 * `verificarSobreposicao` e DESLIGADO por padrao de proposito. O cliente pediu para impedir
 * periodos sobrepostos, mas medir o mesmo periodo duas vezes no mesmo contrato e pratica
 * corrente no sistema: o banco tem 375 pares de medicoes sobrepostas hoje. Ligar a regra para
 * todo mundo bloquearia trabalho real que ja acontece. Entao ela vale para o fluxo NOVO, que
 * comeca limpo, e o legado segue como sempre foi — pendente de confirmacao do cliente com o
 * numero na mao (registrado em MAPA-IMPACTO-MEDICAO.md).
 *
 * `fim >= inicio` vale para os dois: e erro de digitacao em qualquer fluxo (9 medicoes
 * historicas tem fim antes do inicio, o que reforca a necessidade da guarda daqui pra frente).
 */
async function validarPeriodoMedicao({
  contratoId,
  dataInicio,
  dataFim,
  ignorarSolicitacaoId = null,
  verificarSobreposicao = false
}) {
  const inicio = formatarISO(somenteData(dataInicio));
  const fim = formatarISO(somenteData(dataFim));
  if (!inicio || !fim) throw erro('Informe o periodo da medicao (data inicial e final).');

  if (fim < inicio) {
    throw erro('A data final da medicao nao pode ser anterior a data inicial.');
  }

  if (!contratoId || !verificarSobreposicao) return { inicio, fim };

  const onde = {
    contrato_id: contratoId,
    tipo_solicitacao_id: 4,
    data_inicio_medicao: { [Op.ne]: null },
    data_fim_medicao: { [Op.ne]: null },
    // Medicao cancelada nao reserva periodo: o trabalho voltou a ficar por medir.
    status_global: { [Op.notIn]: ['CANCELADA', 'CANCELADO'] }
  };
  if (ignorarSolicitacaoId) onde.id = { [Op.ne]: ignorarSolicitacaoId };

  const existentes = await Solicitacao.findAll({
    where: onde,
    attributes: ['id', 'codigo', 'data_inicio_medicao', 'data_fim_medicao']
  });

  const conflito = existentes.find((s) => periodosSeSobrepoem(
    inicio, fim,
    formatarISO(somenteData(s.data_inicio_medicao)),
    formatarISO(somenteData(s.data_fim_medicao))
  ));

  if (conflito) {
    throw erro(
      `O periodo informado se sobrepoe a medicao ${conflito.codigo || conflito.id} `
      + `(${formatarISO(somenteData(conflito.data_inicio_medicao))} a ${formatarISO(somenteData(conflito.data_fim_medicao))}).`
    );
  }

  return { inicio, fim };
}

/**
 * Saldo do contrato (PI-6): o que ainda NAO foi comprometido.
 *
 * Comprometido = soma das medicoes ja solicitadas, pagas ou nao. E o numero que o cliente quer
 * ver: "contrato de R$ 10.000, uma medicao de R$ 1.000 -> na segunda o saldo e R$ 9.000, e o
 * usuario ja ve o status da primeira mesmo sem pagamento".
 *
 * Medicao CANCELADA nao compromete: o trabalho voltou a ficar por medir.
 */
async function calcularSaldoDoContrato(contratoId, transaction) {
  const contrato = await Contrato.findByPk(contratoId, {
    // `status_contrato` e `ativo` entram porque contrato encerrado nao tem saldo — ver abaixo.
    attributes: ['id', 'valor_total', 'valor_aditivos', 'status_contrato', 'ativo'],
    transaction
  });
  if (!contrato) throw erro('Contrato nao encontrado.', 404);

  const medicoes = await MedicaoParcela.findAll({
    attributes: ['valor_medido'],
    // Comprometimento devolvido (titulo excluido, contrato encerrado) nao conta: a linha fica
    // como trilha, mas o dinheiro voltou a ficar disponivel.
    where: { devolvido_em: null },
    include: [{
      model: Solicitacao,
      as: 'solicitacao',
      attributes: [],
      required: true,
      where: {
        contrato_id: contratoId,
        status_global: { [Op.notIn]: ['CANCELADA', 'CANCELADO'] }
      }
    }],
    transaction
  });

  const totalCent = paraCentavos(contrato.valor_total) + paraCentavos(contrato.valor_aditivos || 0);
  const comprometidoCent = medicoes.reduce((acc, m) => acc + paraCentavos(m.valor_medido), 0);

  // CONTRATO ENCERRADO NAO TEM SALDO (21/08).
  //
  // O encerramento e a operacao que elimina a sobra: exclui titulo em aberto, fecha parcial pelo
  // valor pago e zera as parcelas. Mas o saldo e calculado como `valor_total - comprometido`, e o
  // `valor_total` continua sendo o contratado — entao a tela seguia exibindo "Saldo: R$ 1.000" num
  // contrato que nao vai receber mais nada. Contratado e comprometido continuam reais, para o
  // relatorio; o que zera e o que ainda se pode gastar.
  const encerrado = contrato.status_contrato === 'ENCERRADO' || contrato.ativo === false;
  const saldoCent = encerrado ? 0 : totalCent - comprometidoCent;

  return {
    total_cent: totalCent,
    comprometido_cent: comprometidoCent,
    saldo_cent: saldoCent,
    valor_contrato: totalCent / 100,
    comprometido: comprometidoCent / 100,
    saldo: saldoCent / 100,
    encerrado
  };
}

/**
 * Faz o titulo financeiro acompanhar a parcela alterada pela medicao (PI-5 / L1).
 *
 * NAO passa por `atualizarTitulo` do servico financeiro de proposito: aquele caminho exige
 * acesso ao modulo financeiro e o payload completo da tela de titulos, e quem esta medindo e
 * o usuario da OBRA. E o mesmo racional que a aprovacao ja usa com `pularAcessoFinanceiro`:
 * a permissao que vale aqui e a do fluxo de solicitacao. A alteracao e estreita — valor,
 * saldo e vencimento — e roda na transacao da medicao.
 *
 * Quando o titulo tem rateio (contrato com mais de uma apropriacao), os rateios sao
 * REESCALADOS na mesma proporcao: sem isso a soma dos rateios deixa de fechar com o titulo.
 */
async function sincronizarTituloDaParcela({ parcela, valorCent, vencimento, usuarioId }, transaction) {
  const titulo = await TituloFinanceiro.findByPk(parcela.titulo_financeiro_id, {
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined
  });
  if (!titulo) return;

  const anteriorCent = paraCentavos(titulo.valor_original);
  const baixadoCent = paraCentavos(titulo.valor_baixado || 0);
  const valorNovo = valorCent / 100;

  await titulo.update(
    {
      valor_original: valorNovo,
      valor_bruto: valorNovo,
      valor_liquido: valorNovo,
      // Saldo e o que ainda falta pagar: o que ja foi baixado nao volta.
      valor_saldo: Math.max(valorCent - baixadoCent, 0) / 100,
      data_vencimento: vencimento,
      atualizado_por: usuarioId || null
    },
    { transaction }
  );

  if (titulo.possui_rateio && anteriorCent > 0 && anteriorCent !== valorCent) {
    const rateios = await TituloFinanceiroRateio.findAll({
      where: { titulo_financeiro_id: titulo.id },
      order: [['id', 'ASC']],
      transaction
    });
    if (rateios.length > 0) {
      // Sobra na ultima linha, como na criacao: reescalar cada uma isoladamente deixaria
      // diferenca de centavo entre a soma dos rateios e o titulo.
      let usado = 0;
      for (let i = 0; i < rateios.length; i += 1) {
        const ultimo = i === rateios.length - 1;
        const cent = ultimo
          ? valorCent - usado
          : Math.floor((paraCentavos(rateios[i].valor_rateio) * valorCent) / anteriorCent);
        usado += cent;
        // eslint-disable-next-line no-await-in-loop
        await rateios[i].update(
          { valor_rateio: cent / 100, atualizado_por: usuarioId || null },
          { transaction }
        );
      }
    }
  }
}

/**
 * MD-7, agora em CASCATA: a diferenca vai para as ULTIMAS parcelas, da ultima para a penultima.
 *
 * A versao anterior mirava so a ultima parcela editavel e RECUSAVA quando ela nao comportava
 * ("excede o saldo disponivel na parcela N"). Na pratica isso travava a medicao maior que a ultima
 * parcela, ainda que o contrato tivesse saldo de sobra espalhado nas anteriores.
 *
 * Regra pedida pelo cliente (20/08): consumiu a ultima inteira, continua na penultima, e assim por
 * diante. Nenhuma parcela fica negativa — cada uma cede no maximo o que tem.
 *
 * `excluir` protege as parcelas que nao podem se mexer: a propria parcela medida (devolver para ela
 * mesma seria um nada) e, na EDICAO, as outras parcelas da mesma medicao — mexer nelas mudaria o
 * valor de uma medicao que ninguem pediu para mudar.
 *
 * Devolucao (diferenca positiva) nao precisa de cascata: cai inteira na ultima editavel, que e o
 * comportamento que o contrato ja tinha.
 */
function redistribuirNasUltimas(trabalho, diferencaCent, { excluir = new Set(), numeroOrigem = null } = {}) {
  const destinos = [...trabalho]
    .reverse()
    .filter((t) => t.editavel && !excluir.has(t.parcela.id));

  // DEVOLUCAO SEM DESTINO VIRA SOBRA DO CONTRATO (decisao do cliente, 21/08).
  //
  // Medindo a ULTIMA parcela livre por menos que o previsto, todas as outras ja foram medidas e nao
  // ha para onde mandar a diferenca. Ate aqui isso era recusado; agora a diferenca simplesmente
  // deixa de existir nas parcelas e reaparece como saldo do contrato — `calcularSaldoDoContrato` faz
  // `valor_total - comprometido` e nao depende da soma das parcelas. Quem elimina a sobra e o
  // ENCERRAMENTO, que ja zera saldo e trata os titulos.
  //
  // Vale so para diferenca POSITIVA, que e dinheiro voltando. Diferenca negativa e dinheiro sendo
  // buscado nas outras parcelas: sem destino, continua erro — deixar virar "sobra ao contrario"
  // inventaria dinheiro que o contrato nao tem.
  if (diferencaCent > 0) {
    if (destinos.length === 0) return diferencaCent;
    destinos[0].cent += diferencaCent;
    return 0;
  }

  if (destinos.length === 0) {
    throw erro(
      `Nao ha outra parcela em aberto para ceder a diferenca da parcela ${numeroOrigem ?? '?'}. `
      + 'Ajuste o contrato antes de medir.'
    );
  }

  let faltaCent = -diferencaCent;
  for (const destino of destinos) {
    if (faltaCent <= 0) break;
    const disponivel = Math.min(destino.cent, faltaCent);
    destino.cent -= disponivel;
    faltaCent -= disponivel;
  }

  if (faltaCent > 0) {
    throw erro(
      `O valor informado na parcela ${numeroOrigem ?? '?'} passa em R$ ${(faltaCent / 100).toFixed(2)} `
      + 'o que as demais parcelas em aberto tem para ceder.'
    );
  }

  return 0;
}

/**
 * MD-6 + MD-7: aplica a medicao sobre as parcelas escolhidas, dentro da transacao de quem
 * chama (a medicao e a alteracao das parcelas precisam viver ou morrer juntas).
 *
 * `itens`: [{ contrato_parcela_id, valor_medido, vencimento }]
 *
 * Para cada item: a parcela passa a valer `valor_medido` (e o vencimento informado, se vier),
 * e a diferenca vai para a ultima parcela editavel — nunca para a propria parcela medida.
 */
async function aplicarMedicaoNasParcelas({ contratoId, solicitacaoId, medicaoId = null, itens, usuarioId, apenasValidar = false }, transaction) {
  const lista = Array.isArray(itens) ? itens : [];
  if (lista.length === 0) throw erro('Selecione ao menos uma parcela do contrato para medir.');

  const ids = lista.map((i) => Number(i.contrato_parcela_id));
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) throw erro('Parcela invalida na lista.');
  if (new Set(ids).size !== ids.length) throw erro('A mesma parcela foi informada duas vezes.');

  const parcelas = await ContratoParcela.findAll({
    where: { contrato_id: contratoId },
    include: [{
      model: TituloFinanceiro,
      as: 'titulo',
      attributes: ['id', 'status', 'valor_original', 'valor_baixado', 'valor_bruto', 'possui_rateio'],
      required: false
    }],
    order: [['numero', 'ASC']],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined
  });

  if (parcelas.length === 0) throw erro('O contrato nao possui parcelas para medir.');

  const totalAntesCent = parcelas.reduce((acc, p) => acc + paraCentavos(p.valor), 0);

  // PI-11: a medicao segue a ORDEM DE VENCIMENTO. Nao existe numero de medicao — o usuario
  // pede pelas parcelas, e parcela com vencimento posterior fica bloqueada enquanto houver
  // parcela anterior ainda por solicitar. Sem esta regra dava para pular a parcela vencida e
  // medir a do fim, deixando um buraco no meio do contrato.
  // Parcela ja solicitada nao bloqueia as seguintes: ela continua ABERTA (o titulo so fecha
  // no pagamento), mas o trabalho dela ja foi pedido. Sem esta exclusao a primeira medicao
  // travava todas as proximas.
  // Qual MEDICAO ja consumiu cada parcela. Era um Set, usado so para a ordem de vencimento; virou
  // mapa porque a recusa da segunda medicao precisa dizer ONDE a parcela ja foi medida — sem isso a
  // pessoa le "ja medida" e nao sabe onde procurar.
  const medicaoQueConsumiu = new Map(
    (await MedicaoParcela.findAll({
      attributes: ['contrato_parcela_id', 'medicao_id'],
      where: { devolvido_em: null, contrato_parcela_id: parcelas.map((p) => p.id) },
      include: [{ model: ContratoMedicao, as: 'medicao', attributes: ['id', 'numero'], required: false }],
      transaction
    })).map((m) => [m.contrato_parcela_id, m.medicao?.numero ?? null])
  );
  const jaSolicitadas = new Set(medicaoQueConsumiu.keys());

  const editaveisPorVencimento = parcelas
    .filter((p) => statusEfetivo(p).editavel && !jaSolicitadas.has(p.id))
    .map((p) => ({
      id: p.id,
      numero: p.numero,
      vencimento: formatarISO(somenteData(p.data_vencimento))
    }))
    .sort((a, b) => (a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : a.numero - b.numero));

  const idsPedidos = new Set(lista.map((i) => Number(i.contrato_parcela_id)));
  const pedidas = editaveisPorVencimento.filter((p) => idsPedidos.has(p.id));
  if (pedidas.length > 0) {
    const ultimaPedida = pedidas[pedidas.length - 1];
    const anteriorEmAberto = editaveisPorVencimento.find(
      (p) => !idsPedidos.has(p.id)
        && (p.vencimento < ultimaPedida.vencimento
          || (p.vencimento === ultimaPedida.vencimento && p.numero < ultimaPedida.numero))
    );
    if (anteriorEmAberto) {
      throw erro(
        `A parcela ${anteriorEmAberto.numero} vence antes (${anteriorEmAberto.vencimento}) e ainda `
        + 'nao foi solicitada. A medicao segue a ordem de vencimento.'
      );
    }
  }

  // PRAZO VENCIDO BLOQUEIA A MEDICAO (cliente, 21/08).
  //
  // `vigencia_fim` era gravado na criacao e usado so para exibicao: um contrato vencido em janeiro
  // continuava aceitando medicao em dezembro, em silencio. A saida existe e tem nome — aditivo de
  // prazo —, entao a recusa diz isso em vez de so barrar.
  //
  // So quando HA data: contrato sem prazo definido nao pode ser bloqueado por um prazo que ninguem
  // informou (os 335 legados tem `vigencia_fim` nulo).
  const contratoDoPrazo = await Contrato.findByPk(contratoId, {
    attributes: ['id', 'codigo', 'vigencia_fim'],
    transaction
  });
  if (contratoDoPrazo?.vigencia_fim) {
    const fim = formatarISO(somenteData(contratoDoPrazo.vigencia_fim));
    const agora = new Date();
    const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
    if (fim < hoje) {
      throw erro(
        `A vigencia do contrato ${contratoDoPrazo.codigo} terminou em ${fim.split('-').reverse().join('/')}. `
        + 'Para medir de novo, solicite um termo aditivo de prazo.'
      );
    }
  }

  // PI-6: o que limita a medicao e o SALDO DO CONTRATO — nao o quanto ja foi pago no titulo.
  const saldo = await calcularSaldoDoContrato(contratoId, transaction);
  const pedidoCent = lista.reduce((acc, i) => acc + (paraCentavos(i.valor_medido) || 0), 0);
  if (pedidoCent > saldo.saldo_cent) {
    // A recusa diz o CAMINHO, e nao so o numero. Aumentar o valor de um contrato tem uma porta so —
    // o termo aditivo, com teto de 25% (PI-12/PI-13) — e sem essa frase a pessoa fica olhando um
    // erro que nao sugere nada.
    throw erro(
      `O valor solicitado (R$ ${(pedidoCent / 100).toFixed(2)}) passa do saldo do contrato `
      + `(R$ ${(saldo.saldo_cent / 100).toFixed(2)}). Ja comprometido: R$ ${saldo.comprometido.toFixed(2)}. `
      + 'Para aumentar o valor do contrato, solicite um termo aditivo.'
    );
  }

  // Estado de trabalho em centavos: o total do contrato tem de fechar igual no fim (MD-7).
  const trabalho = parcelas.map((p) => ({
    parcela: p,
    cent: paraCentavos(p.valor),
    vencimento: formatarISO(somenteData(p.data_vencimento)),
    ...statusEfetivo(p)
  }));
  const porIdTrabalho = new Map(trabalho.map((t) => [t.parcela.id, t]));

  const vinculos = [];
  // Quanto o contrato deixou de usar nesta medicao por nao haver parcela livre para receber a
  // devolucao. Vira saldo do contrato, e o encerramento e quem o elimina.
  let sobraCent = 0;

  for (const item of lista) {
    const alvo = porIdTrabalho.get(Number(item.contrato_parcela_id));
    if (!alvo) throw erro('Parcela informada nao pertence a este contrato.');
    if (!alvo.editavel) {
      throw erro(`A parcela ${alvo.parcela.numero} esta ${alvo.status} e nao pode ser alterada.`);
    }

    // PARCELA JA MEDIDA NAO VOLTA PARA A FILA (cliente, 21/08).
    //
    // `editavel` olha o status do TITULO, e o titulo de uma parcela medida segue ABERTO ate o
    // pagamento — entao ela passava por aqui e podia ser medida de novo, comprometendo o contrato
    // duas vezes pela mesma linha. `jaSolicitadas` ja existia, mas so era usada para a ordem de
    // vencimento. Corrigir o valor de uma medicao ja feita e outra rota: `atualizarMedicaoDoContrato`.
    if (jaSolicitadas.has(alvo.parcela.id)) {
      const numero = medicaoQueConsumiu.get(alvo.parcela.id);
      throw erro(
        `A parcela ${alvo.parcela.numero} ja foi medida${numero ? ` na medicao ${numero}` : ''} e nao pode entrar `
        + 'numa nova medicao. Para corrigir o valor, altere aquela medicao.',
        409
      );
    }

    const medidoCent = paraCentavos(item.valor_medido);
    if (!Number.isFinite(medidoCent) || medidoCent <= 0) {
      throw erro(`Informe um valor valido para a parcela ${alvo.parcela.numero}.`);
    }

    const valorAnteriorCent = alvo.cent;
    const vencimentoAnterior = alvo.vencimento;
    const vencimentoNovo = item.vencimento ? formatarISO(somenteData(item.vencimento)) : vencimentoAnterior;
    if (!vencimentoNovo) throw erro(`Vencimento invalido na parcela ${alvo.parcela.numero}.`);

    const diferencaCent = valorAnteriorCent - medidoCent;

    if (diferencaCent !== 0) {
      // As parcelas de OUTRAS medicoes ficam de fora do destino pela mesma razao que na edicao:
      // mudar o valor delas mexeria numa medicao que ninguem pediu para mudar, e o `valor_medido`
      // gravado nao acompanharia — a medicao passaria a dizer um numero e a parcela outro.
      sobraCent += redistribuirNasUltimas(trabalho, diferencaCent, {
        excluir: new Set([alvo.parcela.id, ...jaSolicitadas]),
        numeroOrigem: alvo.parcela.numero
      });
    }

    alvo.cent = medidoCent;
    alvo.vencimento = vencimentoNovo;

    vinculos.push({
      solicitacao_id: solicitacaoId,
      // PI-16: no fluxo novo `solicitacao_id` e sempre a MESMA (a do contrato). E `medicao_id`
      // que diz qual medicao consumiu esta parcela — e o que o modal do titulo usa para achar
      // os anexos e comentarios certos. Nulo na trilha legada, que segue por solicitacao.
      medicao_id: medicaoId,
      contrato_parcela_id: alvo.parcela.id,
      valor_medido: medidoCent / 100,
      valor_anterior: valorAnteriorCent / 100,
      vencimento_anterior: vencimentoAnterior,
      vencimento_aplicado: vencimentoNovo,
      criado_por: usuarioId || null
    });
  }

  const totalDepoisCent = trabalho.reduce((acc, t) => acc + t.cent, 0);
  // Invariante do MD-7, agora com a sobra DECLARADA: a soma das parcelas so pode encolher pelo que a
  // redistribuicao devolveu por falta de destino. Qualquer outro centavo que suma continua sendo bug
  // de calculo e derruba a transacao inteira — que e para isso que esta checagem existe.
  if (totalDepoisCent !== totalAntesCent - sobraCent) {
    throw erro(
      `Falha interna na redistribuicao: total mudou de ${totalAntesCent} para ${totalDepoisCent} `
      + `centavos, com sobra declarada de ${sobraCent}.`,
      500
    );
  }

  for (const t of trabalho) {
    const valorNovo = t.cent / 100;
    const mudouValor = paraCentavos(t.parcela.valor) !== t.cent;
    const mudouVencimento = formatarISO(somenteData(t.parcela.data_vencimento)) !== t.vencimento;
    if (!mudouValor && !mudouVencimento) continue;

    // `valor_previsto` NAO entra aqui: e a referencia da auditoria e nunca muda (PI-5).
    await t.parcela.update(
      { valor: valorNovo, data_vencimento: t.vencimento, atualizado_por: usuarioId || null },
      { transaction }
    );

    // O titulo acompanha a parcela. Sem isto, parcela e financeiro divergem: a parcela
    // passaria a valer R$ 1.000 e o titulo continuaria cobrando R$ 3.000. Vale tambem para
    // a parcela que RECEBEU a diferenca, nao so para a medida.
    if (t.parcela.titulo_financeiro_id) {
      await sincronizarTituloDaParcela(
        { parcela: t.parcela, valorCent: t.cent, vencimento: t.vencimento, usuarioId },
        transaction
      );
    }
  }

  if (apenasValidar) {
    return { parcelas_medidas: vinculos.length, validacao: true };
  }

  await MedicaoParcela.bulkCreate(vinculos, { transaction });

  return {
    parcelas_medidas: vinculos.length,
    total_medido: vinculos.reduce((acc, v) => acc + paraCentavos(v.valor_medido), 0) / 100,
    total_contrato: totalDepoisCent / 100,
    sobra: sobraCent / 100
  };
}

/**
 * S4 (PI-6): titulo EXCLUIDO devolve o saldo para a parcela final do contrato.
 *
 * Chamado pela exclusao de titulos da tela financeira, que nao sabe que o titulo pode
 * pertencer a um contrato. Dois efeitos, juntos:
 *
 * 1. o valor da parcela volta para a ULTIMA parcela editavel e a parcela zera — o total do
 *    contrato continua o mesmo, o dinheiro so muda de lugar;
 * 2. os comprometimentos daquela parcela sao marcados como devolvidos, senao o saldo
 *    (`total - comprometido`) nao voltaria e o dinheiro ficaria preso.
 *
 * Silencioso para titulo que nao e de contrato: a tela financeira exclui titulos de todo tipo.
 */
async function devolverSaldoDeTitulosExcluidos(tituloIds, { usuarioId, motivo } = {}, transaction) {
  const ids = (Array.isArray(tituloIds) ? tituloIds : [tituloIds]).map(Number).filter(Boolean);
  if (ids.length === 0) return { parcelas_afetadas: 0 };

  const parcelas = await ContratoParcela.findAll({
    where: { titulo_financeiro_id: { [Op.in]: ids } },
    transaction
  });
  if (parcelas.length === 0) return { parcelas_afetadas: 0 };

  let afetadas = 0;

  for (const parcela of parcelas) {
    // eslint-disable-next-line no-await-in-loop
    const doContrato = await ContratoParcela.findAll({
      where: { contrato_id: parcela.contrato_id },
      include: [{ model: TituloFinanceiro, as: 'titulo', attributes: ['id', 'status'], required: false }],
      order: [['numero', 'ASC']],
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined
    });

    const valorCent = paraCentavos(parcela.valor);
    if (valorCent > 0) {
      const destino = [...doContrato].reverse().find((p) => p.id !== parcela.id && statusEfetivo(p).editavel);
      if (destino) {
        // Calculado UMA vez, antes do update: reler `destino.valor` depois de gravar somaria o
        // valor devolvido duas vezes (o objeto ja vem atualizado do `update`).
        const destinoCent = paraCentavos(destino.valor) + valorCent;
        // eslint-disable-next-line no-await-in-loop
        await destino.update(
          { valor: destinoCent / 100, atualizado_por: usuarioId || null },
          { transaction }
        );
        // eslint-disable-next-line no-await-in-loop
        await sincronizarTituloDaParcela(
          {
            parcela: destino,
            valorCent: destinoCent,
            vencimento: formatarISO(somenteData(destino.data_vencimento)),
            usuarioId
          },
          transaction
        );
        // eslint-disable-next-line no-await-in-loop
        await parcela.update({ valor: 0, atualizado_por: usuarioId || null }, { transaction });
        afetadas += 1;
      }
      // Sem destino editavel (todas quitadas), a parcela fica como esta: melhor manter o
      // registro do que empurrar valor para uma parcela ja paga.
    }

    // eslint-disable-next-line no-await-in-loop
    await MedicaoParcela.update(
      {
        devolvido_em: new Date(),
        devolvido_motivo: String(motivo || 'Titulo excluido').slice(0, 255)
      },
      { where: { contrato_parcela_id: parcela.id, devolvido_em: null }, transaction }
    );
  }

  return { parcelas_afetadas: afetadas };
}

/**
 * Ensaio da medicao: roda as mesmas regras de `aplicarMedicaoNasParcelas` sem gravar nada.
 *
 * Serve para a criacao de solicitacao recusar ANTES de gravar. A criacao nao roda em transacao,
 * entao sem este ensaio a unica alternativa seria criar a solicitacao e descobrir o problema
 * depois — deixando saldo do contrato e parcelas contando historias diferentes.
 */
/**
 * Medicao do fluxo novo como EVENTO da solicitacao do contrato (PI-16).
 *
 * Antes, medir criava uma solicitacao propria — um contrato com 19 medicoes tinha 19 solicitacoes.
 * O cliente decidiu que a solicitacao e UMA por contrato e que a unidade de aprovacao e pagamento
 * passa a ser o TITULO. A medicao continua existindo como evento (numero, periodo, anexos,
 * comentarios), mas nao como solicitacao.
 *
 * Tudo numa transacao so: numerar, gravar a medicao e consumir as parcelas sao um ato unico. Se
 * as parcelas falharem no meio (outra medicao levou o saldo), a medicao numerada nao pode
 * sobreviver — sobraria um numero furado na sequencia do contrato.
 *
 * O numero e calculado com LOCK no contrato, e nao por `COUNT(*) + 1` solto: duas medicoes
 * simultaneas leriam a mesma contagem e tentariam o mesmo numero. O indice unico
 * (contrato_id, numero) e a rede embaixo disso.
 */
/**
 * Dados de pagamento da medicao (itens 5 e 9 do lote de 23/08).
 *
 * O favorecido saiu da abertura do contrato: quem recebe pode mudar de uma medicao para outra, e
 * defini-lo la obrigava a acertar no comeco algo que so se sabe no fim.
 *
 * A CHAVE PIX e copiada, e nao apontada: a do cadastro pode mudar depois, e a medicao tem de dizer
 * para onde o dinheiro foi naquele pagamento.
 *
 * O ACEITE ("confirmo que os dados de pagamento estao corretos") e obrigatorio e grava quem e
 * quando. Sem ele a medicao nao entra — e uma declaracao de responsabilidade, nao um formalismo.
 */
async function validarDadosDePagamento(pagamento = {}, { transaction = null } = {}) {
  const formaPagamentoId = Number(pagamento.forma_pagamento_id) || null;
  if (!formaPagamentoId) throw erro('Informe a forma de pagamento.');

  const formas = await listarFormasDaMedicao();
  const forma = formas.formas.find((item) => Number(item.id) === formaPagamentoId) || null;
  if (!forma) throw erro('A forma de pagamento informada nao esta ativa ou liberada para a medicao.');

  const anexosPendentes = Array.isArray(pagamento.anexos_pendentes_nomes)
    ? pagamento.anexos_pendentes_nomes.map((nome) => String(nome || '').trim()).filter(Boolean)
    : [];
  if (anexosPendentes.length === 0) {
    throw erro('Anexe ao menos um arquivo para enviar a solicitacao de medicao.');
  }

  // Toda medicao gera uma instrucao de pagamento. Logo, o favorecido e obrigatorio em qualquer
  // forma — PIX, boleto ou transferencia. Antes ele so era persistido no PIX, e uma transferencia
  // aprovada ficava sem dizer a quem o Financeiro deveria pagar.
  const favorecidoId = Number(pagamento.favorecido_id) || null;
  if (!favorecidoId) throw erro('Informe o favorecido desta medicao.');

  const favorecido = await Parceiro.findOne({
    where: { id: favorecidoId, ativo: true },
    attributes: ['id'],
    ...(transaction ? { transaction } : {})
  });
  if (!favorecido) throw erro('O favorecido informado nao existe ou esta inativo.');

  let chave = null;
  const dadosParaPagamento = String(pagamento.favorecido_contato || '').trim();
  if (formaPagamentoEhPix(forma)) {
    chave = String(pagamento.favorecido_chave_pix || '').trim();
    if (!chave) throw erro('Informe a chave PIX do favorecido.');
  }

  if (formaPagamentoEhBoleto(forma) && !String(pagamento.boleto_anexo_nome || '').trim()) {
    throw erro('Anexe o boleto desta medicao.');
  }

  // PIX tem a chave; boleto tem o documento. Nas demais formas, o Financeiro precisa receber os
  // dados bancarios ou a instrucao equivalente no proprio evento da medicao.
  if (!formaPagamentoEhPix(forma) && !formaPagamentoEhBoleto(forma) && !dadosParaPagamento) {
    throw erro('Informe os dados para pagamento desta medicao.');
  }

  if (!pagamento.dados_confirmados) {
    throw erro('Confirme que os dados de pagamento estao corretos antes de enviar a medicao.');
  }

  return {
    favorecido_id: favorecidoId,
    favorecido_chave_pix: chave ? chave.slice(0, 180) : null,
    favorecido_contato: dadosParaPagamento.slice(0, 180) || null,
    forma_pagamento_id: formaPagamentoId
  };
}

async function registrarMedicaoDoContrato({ contratoId, itens, periodoInicio, periodoFim, usuarioId, pagamento }) {
  return sequelize.transaction(async (transaction) => {
    const contrato = await Contrato.findByPk(contratoId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    if (!contrato) throw erro('Contrato nao encontrado.', 404);
    if (!contrato.fluxo_novo) {
      throw erro('Medicao como evento da solicitacao so vale para contrato do fluxo novo.');
    }
    if (!contrato.solicitacao_id) {
      throw erro('Contrato do fluxo novo sem solicitacao vinculada — nao ha onde registrar a medicao.', 409);
    }

    const ultimo = await ContratoMedicao.max('numero', {
      where: { contrato_id: contratoId },
      transaction
    });
    const numero = Number.isFinite(Number(ultimo)) ? Number(ultimo) + 1 : 1;

    const dadosPagamento = await validarDadosDePagamento(pagamento, { transaction });

    const medicao = await ContratoMedicao.create(
      {
        contrato_id: contratoId,
        solicitacao_id: contrato.solicitacao_id,
        numero,
        periodo_inicio: periodoInicio || null,
        periodo_fim: periodoFim || null,
        valor_total: 0,
        ...dadosPagamento,
        dados_confirmados_em: new Date(),
        dados_confirmados_por: usuarioId || null,
        criado_por: usuarioId || null
      },
      { transaction }
    );

    const resultado = await aplicarMedicaoNasParcelas(
      {
        contratoId,
        solicitacaoId: contrato.solicitacao_id,
        medicaoId: medicao.id,
        itens,
        usuarioId
      },
      transaction
    );

    // O total medido so e conhecido depois de aplicar; gravado aqui para a tela nao ter que
    // somar `medicao_parcelas` a cada listagem.
    await medicao.update({ valor_total: resultado.total_medido }, { transaction });

    // A medicao nasce para conferencia da Gerencia de Processos. Alterar apenas o status deixava
    // a solicitacao na caixa anterior (normalmente OBRA), embora o botao de aprovacao pertenca ao
    // GEO. O encaminhamento e gravado na mesma transacao da medicao para nao existir medicao criada
    // sem uma equipe responsavel por conferi-la.
    const solicitacao = await Solicitacao.findByPk(contrato.solicitacao_id, {
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    if (!solicitacao) {
      throw erro('A solicitacao vinculada ao contrato nao foi encontrada.', 409);
    }

    const areaAnterior = solicitacao.area_responsavel || null;
    if (areaAnterior !== SETOR_GERENCIA_PROCESSOS) {
      await solicitacao.update(
        { area_responsavel: SETOR_GERENCIA_PROCESSOS },
        { transaction }
      );

      // O formato e o mesmo consumido pela regra de visibilidade "passou pelo meu setor".
      await Historico.create({
        solicitacao_id: solicitacao.id,
        medicao_id: medicao.id,
        usuario_responsavel_id: usuarioId || null,
        setor: SETOR_GERENCIA_PROCESSOS,
        acao: 'ENVIADA_SETOR',
        descricao: `De ${areaAnterior || '-'} para ${SETOR_GERENCIA_PROCESSOS}`
      }, { transaction });
    }

    // A solicitacao do contrato sai de APROVADA e passa a dizer que ha medicao esperando pagamento.
    // Dentro da MESMA transacao: medicao aplicada com status antigo seria a solicitacao contando
    // uma historia diferente das parcelas.
    await sincronizarStatusDaSolicitacaoDoContrato(
      contratoId,
      { usuarioId, motivo: `Medicao ${numero} registrada no contrato ${contrato.codigo}.` },
      transaction
    );

    return {
      medicao: {
        id: medicao.id,
        numero,
        contrato_id: contratoId,
        solicitacao_id: contrato.solicitacao_id,
        periodo_inicio: medicao.periodo_inicio,
        periodo_fim: medicao.periodo_fim,
        valor_total: resultado.total_medido
      },
      ...resultado
    };
  });
}

/**
 * NEC. DE MEDICAO / APROVADA / PAGA — o status da solicitacao UNICA do contrato (20/08).
 *
 * No fluxo novo a solicitacao do contrato nao morre na aprovacao: ela acompanha o contrato inteiro,
 * medicao a medicao. Ate aqui ela virava APROVADA quando o contrato ficava ATIVO e **ficava la** —
 * medir nao mudava nada, e quem olhava a lista nao distinguia contrato parado de contrato com
 * medicao pedida esperando pagamento.
 *
 * Regra do cliente:
 *
 *   medicao com titulo em aberto    -> NEC. DE MEDICAO
 *   titulo baixado, contrato segue  -> APROVADA
 *   nada em aberto e nada por medir -> PAGA
 *
 * `PAGA` exige as DUAS condicoes. So "todos os titulos quitados" nao basta: num contrato de 5
 * parcelas com 1 medida existe UM titulo, e quita-lo diria que o contrato acabou faltando 4
 * parcelas. Enquanto houver parcela por medir, a solicitacao volta para APROVADA.
 */
const STATUS_SOLICITACAO_CONTRATO = {
  NECESSITA_MEDICAO: 'NEC. DE MEDICAO',
  // LIBERADO SUBSTITUIU APROVADA (correcao do cliente, 23/08). O caminho e: a Obra pede a medicao,
  // a Gerencia de Processos APROVA no botao, e a solicitacao vai para LIBERADO — o titulo esta
  // liberado para pagamento. `APROVADA` saiu do fluxo de contrato.
  LIBERADO: 'LIBERADO',
  PAGA: 'PAGA'
};

async function calcularStatusDaSolicitacaoDoContrato(contratoId, transaction) {
  const parcelas = await ContratoParcela.findAll({
    where: { contrato_id: contratoId },
    include: [{
      model: TituloFinanceiro,
      as: 'titulo',
      attributes: ['id', 'status', 'valor_saldo', 'valor_baixado'],
      required: false
    }],
    transaction
  });
  if (parcelas.length === 0) return null;
  await require('./tituloRenegociacaoVinculos').projetarAssociacoes(parcelas, 'titulo', { transaction });

  const medidas = new Set(
    (await MedicaoParcela.findAll({
      attributes: ['contrato_parcela_id'],
      where: { devolvido_em: null, contrato_parcela_id: parcelas.map((p) => p.id) },
      transaction
    })).map((m) => m.contrato_parcela_id)
  );

  // Parcela ZERADA nao e "por medir": ela existe so como linha, e o valor dela ja foi para outra
  // parcela numa redistribuicao. Contar essas linhas travaria o contrato em APROVADA para sempre,
  // porque elas nunca vao ser medidas.
  const aindaPorMedir = parcelas.some(
    (p) => !medidas.has(p.id) && statusEfetivo(p).editavel && paraCentavos(p.valor) > 0
  );

  const IGNORADOS = new Set(['CANCELADO', 'CANCELADA', 'ESTORNADO', 'EXCLUIDO']);
  const ativo = (t) => t && !IGNORADOS.has(String(t.status || '').toUpperCase());

  // O que decide NEC. DE MEDICAO e a MEDICAO por pagar, nao o titulo por pagar.
  //
  // No fluxo novo TODAS as parcelas viram titulo na aprovacao do contrato, nao na medicao. Olhar
  // "existe titulo em aberto" deixaria a solicitacao em NEC. DE MEDICAO desde a aprovacao e para
  // sempre — foi o que a suite pegou. O que o cliente descreveu e: medicao pedida esperando
  // pagamento. Entao a pergunta certa e sobre as parcelas JA MEDIDAS.
  const medidasEmAberto = parcelas.filter(
    (p) => medidas.has(p.id) && ativo(p.titulo) && paraCentavos(p.titulo.valor_saldo) > 0
  );
  const titulosDeMedicao = parcelas.filter((p) => medidas.has(p.id) && ativo(p.titulo));

  // Com medicao por pagar, o que decide entre NEC. DE MEDICAO e LIBERADO e a APROVACAO dela: pedida
  // e esperando a Gerencia, `NEC. DE MEDICAO`; aprovada, `LIBERADO` — o titulo esta liberado para
  // pagamento. Sem `aprovada_em`, o calculo nao teria como distinguir as duas situacoes.
  if (medidasEmAberto.length > 0) {
    const idsEmAberto = medidasEmAberto.map((p) => p.id);
    const pendenteDeAprovacao = await MedicaoParcela.count({
      where: { devolvido_em: null, contrato_parcela_id: idsEmAberto },
      include: [{
        model: ContratoMedicao,
        as: 'medicao',
        attributes: [],
        required: true,
        where: { aprovada_em: null }
      }],
      transaction
    });

    return pendenteDeAprovacao > 0
      ? STATUS_SOLICITACAO_CONTRATO.NECESSITA_MEDICAO
      : STATUS_SOLICITACAO_CONTRATO.LIBERADO;
  }

  // Nada por pagar: enquanto houver parcela por medir o contrato continua andando, e a solicitacao
  // volta a esperar a proxima medicao.
  if (aindaPorMedir || titulosDeMedicao.length === 0) return STATUS_SOLICITACAO_CONTRATO.NECESSITA_MEDICAO;
  return STATUS_SOLICITACAO_CONTRATO.PAGA;
}

/**
 * Aplica o status calculado na solicitacao do contrato e registra a troca no historico.
 *
 * Chamada de dois lugares: de dentro da medicao (registro e edicao) e da baixa de titulo — e nos
 * dois pela MESMA funcao, para os caminhos nao divergirem. Silenciosa quando o contrato nao e do
 * fluxo novo ou nao tem solicitacao: a trilha legada nao passa por aqui.
 */
/**
 * O QUE O FINANCEIRO PAGOU PASSA A SER O QUE A PARCELA VALE (cliente, 23/08 — item 33).
 *
 * "A informacao do valor que foi pago no titulo vem da baixa do titulo." Quem da a palavra final
 * sobre quanto uma parcela valeu nao e a medicao: e o pagamento. Pagou menos, a diferenca volta para
 * a ultima parcela; pagou mais, sai da ultima parcela — a mesma cascata da edicao da medicao.
 *
 * ESTA FUNCAO E UMA RECOMPUTACAO, NAO UM EVENTO. E a decisao central deste item.
 *
 * Ha OITO caminhos que mexem na baixa de um titulo (baixa manual, agrupada, por conciliacao, cartao
 * no ato, pagamento bancario, retorno CAIXA, cheque de terceiro, fatura de cartao) e mais o estorno.
 * Uma regra do tipo "ao baixar, aplique a diferenca" precisaria rodar uma vez e exatamente uma vez em
 * cada um deles: rodar duas vezes dobraria o desconto na ultima parcela, e um retorno bancario
 * reprocessado faria exatamente isso.
 *
 * Entao a regra nao olha o que aconteceu — olha o ESTADO: *a parcela vale o principal baixado no
 * titulo dela.* Rodar de novo da o mesmo resultado, e o ESTORNO nao precisa de codigo proprio: o
 * titulo volta a ter saldo, o alvo volta a ser o valor cobrado, a cascata se desfaz sozinha.
 *
 * Duas coisas que ela deliberadamente NAO faz:
 *
 * 1. nao mexe em `titulo.valor_original`. Ele e o que foi COBRADO, e continua sendo — e por ele
 *    diferir de `valor_baixado` que o titulo aparece como "Parcialmente pago". Alem disso ele e a
 *    memoria para onde o estorno volta: sobrescreve-lo tornaria o estorno irreversivel;
 * 2. nao usa juros, multa nem desconto (decisao do cliente, 23/08). Encargo de atraso nao e preco de
 *    servico medido — manda-lo para a ultima parcela faria a obra perder saldo porque o Financeiro
 *    pagou com atraso. `valor_baixado` guarda so o principal.
 *
 * BAIXA PARCIAL FECHA O TITULO (decisao do cliente, 23/08). Pagou menos, isso e final: o saldo do
 * titulo e zerado e a diferenca vai para a ultima parcela. O status continua `PARCIAL`, que a tela
 * mostra como "Parcialmente pago" — o "status de pago" do pedido.
 *
 * A consequencia esta registrada em `MAPA-IMPACTO-VALOR-PAGO-VOLTA-PARA-A-PARCELA.md` §3: titulo de
 * contrato deixa de poder ser pago em duas vezes.
 */
async function reconciliarParcelasComOPago(contratoId, { usuarioId = null, setor = null } = {}, transaction) {
  const parcelas = await ContratoParcela.findAll({
    where: { contrato_id: Number(contratoId) },
    include: [{
      model: TituloFinanceiro,
      as: 'titulo',
      attributes: ['id', 'status', 'valor_original', 'valor_baixado', 'valor_saldo', 'possui_rateio'],
      required: false
    }],
    order: [['numero', 'ASC']],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined
  });
  if (parcelas.length === 0) return null;

  // Parcela ja medida nao serve de destino: mexer nela mudaria o valor de uma medicao que ninguem
  // pediu para mudar. Mesma protecao da edicao da medicao (20/08).
  const vinculos = await MedicaoParcela.findAll({
    where: { devolvido_em: null, contrato_parcela_id: parcelas.map((p) => p.id) },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined
  });
  const jaMedidas = new Set(vinculos.map((m) => m.contrato_parcela_id));
  const vinculoPorParcela = new Map(vinculos.map((m) => [Number(m.contrato_parcela_id), m]));

  const trabalho = parcelas.map((p) => ({
    parcela: p,
    cent: paraCentavos(p.valor),
    ...statusEfetivo(p)
  }));
  const centAntes = new Map(trabalho.map((t) => [t.parcela.id, t.cent]));

  const ajustes = [];
  let sobraCent = 0;

  // AS ORIGENS SAO DECIDIDAS ANTES DE QUALQUER CASCATA — e nao dentro do laco que a executa.
  //
  // Escrito como um laco unico sobre as parcelas, isto se autodestruia: a cascata da parcela 1 sobe
  // a parcela 4 para R$ 3.000, o laco chega na parcela 4, ve que ela nao bate com o `valor_original`
  // de R$ 2.500 do titulo dela e a "corrige" de volta — jogando os R$ 500 na parcela 3. O contrato
  // fechava a soma certa com a diferenca no lugar errado, que e o pior jeito de errar.
  //
  // Com a lista fixada antes, destino nunca vira origem: no instante do retrato, toda parcela que
  // ninguem pagou vale exatamente o que o titulo dela cobra — `sincronizarTituloDaParcela` mantem os
  // dois iguais desde a criacao.
  const origens = trabalho
    .map((t) => {
      const titulo = t.parcela.titulo;
      if (!titulo || titulo.status === 'RENEGOCIADO') return null;
      const baixadoCent = paraCentavos(titulo.valor_baixado || 0);
      // Sem baixa, o alvo e o que foi cobrado. E o que faz o estorno se desfazer sozinho.
      const alvoCent = baixadoCent > 0 ? baixadoCent : paraCentavos(titulo.valor_original || 0);
      return alvoCent === t.cent ? null : { t, alvoCent };
    })
    .filter(Boolean);

  for (const { t: alvo, alvoCent } of origens) {
    const diferencaCent = alvo.cent - alvoCent;

    // A propria parcela paga sai dos destinos: devolver para ela mesma seria um nada.
    const excluir = new Set([alvo.parcela.id, ...jaMedidas]);
    sobraCent += redistribuirNasUltimas(trabalho, diferencaCent, {
      excluir,
      numeroOrigem: alvo.parcela.numero
    });
    alvo.cent = alvoCent;
    ajustes.push({
      numero: alvo.parcela.numero,
      deCent: centAntes.get(alvo.parcela.id),
      paraCent: alvoCent
    });
  }

  if (ajustes.length === 0) return null;

  const totalAntesCent = [...centAntes.values()].reduce((acc, c) => acc + c, 0);
  const totalDepoisCent = trabalho.reduce((acc, t) => acc + t.cent, 0);
  if (totalDepoisCent !== totalAntesCent - sobraCent) {
    // Invariante do MD-7 com a sobra declarada. Cair aqui e bug de calculo, nao entrada do usuario.
    throw erro(
      `Falha interna na reconciliacao da baixa: total mudou de ${totalAntesCent} para `
      + `${totalDepoisCent} centavos, com sobra declarada de ${sobraCent}.`,
      500
    );
  }

  for (const t of trabalho) {
    const antes = centAntes.get(t.parcela.id);
    if (antes === t.cent) continue;

    // eslint-disable-next-line no-await-in-loop
    await t.parcela.update({ valor: t.cent / 100 }, { transaction });

    // O `valor_medido` DA MEDICAO DONA acompanha o novo valor da parcela.
    //
    // Sem isto o dinheiro seria contado duas vezes: `calcularSaldoDoContrato` soma o comprometido a
    // partir de `medicao_parcelas.valor_medido`, e nao das parcelas. Uma parcela medida em 2.500 e
    // paga em 2.000 continuaria comprometendo 2.500 — enquanto os 500 ja teriam ido para a ultima
    // parcela, para serem medidos de novo. E a mesma correcao que a edicao da medicao ja carrega.
    //
    // `valor_anterior` NAO muda: e a referencia de quanto a parcela valia antes de ser medida pela
    // primeira vez (PI-5).
    const vinculo = vinculoPorParcela.get(Number(t.parcela.id));
    if (vinculo) {
      // eslint-disable-next-line no-await-in-loop
      await vinculo.update({ valor_medido: t.cent / 100 }, { transaction });
    }

    // O titulo do DESTINO acompanha o novo valor da parcela — parcela e financeiro divergindo e o
    // pior erro deste modulo. O titulo da parcela PAGA nao: `valor_original` e o que foi cobrado.
    const foiPago = paraCentavos(t.parcela.titulo?.valor_baixado || 0) > 0;
    if (t.parcela.titulo_financeiro_id && !foiPago) {
      // eslint-disable-next-line no-await-in-loop
      await sincronizarTituloDaParcela({
        parcela: t.parcela,
        valorCent: t.cent,
        vencimento: somenteData(t.parcela.data_vencimento),
        usuarioId
      }, transaction);
    }
  }

  // Fecha o titulo pago a menor: o saldo deixa de ser cobravel porque a diferenca ja virou saldo da
  // ultima parcela. Sem isto o mesmo dinheiro apareceria nos dois lugares.
  for (const t of trabalho) {
    const titulo = t.parcela.titulo;
    if (!titulo) continue;
    const baixadoCent = paraCentavos(titulo.valor_baixado || 0);
    if (baixadoCent > 0 && paraCentavos(titulo.valor_saldo || 0) > 0) {
      // eslint-disable-next-line no-await-in-loop
      await titulo.update({ valor_saldo: 0, atualizado_por: usuarioId || null }, { transaction });
    }
  }

  const contrato = await Contrato.findByPk(Number(contratoId), {
    attributes: ['id', 'codigo', 'solicitacao_id'],
    transaction
  });
  if (contrato?.solicitacao_id) {
    const texto = ajustes
      .map((a) => `parcela ${a.numero}: R$ ${(a.deCent / 100).toFixed(2)} -> R$ ${(a.paraCent / 100).toFixed(2)}`)
      .join('; ');
    await Historico.create({
      solicitacao_id: contrato.solicitacao_id,
      usuario_responsavel_id: usuarioId || null,
      setor: setorParaHistorico(setor) || SETOR_FINANCEIRO,
      acao: 'PARCELA_AJUSTADA_PELA_BAIXA',
      descricao: `Contrato ${contrato.codigo}: valor pago pelo Financeiro aplicado nas parcelas (${texto}).`
        + (sobraCent > 0 ? ` Sobra sem parcela de destino: R$ ${(sobraCent / 100).toFixed(2)} (saldo do contrato).` : '')
    }, { transaction });
  }

  return { ajustes, sobraCent };
}

/**
 * Quanto a cascata do contrato consegue absorver se a baixa passar do saldo do titulo.
 *
 * Existe para o guarda dos caminhos de baixa poder responder ANTES de gravar. Recusar depois seria
 * tarde: a baixa ja teria acontecido, e a recusa viraria uma excecao no meio de uma transacao
 * financeira que ninguem pediu para desfazer.
 *
 * Devolve `null` quando o titulo NAO e parcela de contrato do fluxo novo — e a resposta que mantem a
 * trava de pagar a mais valendo para todo o resto do Financeiro, que e o que o cliente decidiu.
 */
async function absorcaoDisponivelParaBaixa(tituloId, transaction) {
  const parcela = await ContratoParcela.findOne({
    where: { titulo_financeiro_id: Number(tituloId) },
    attributes: ['id', 'contrato_id'],
    transaction
  });
  if (!parcela) return null;

  const contrato = await Contrato.findByPk(parcela.contrato_id, {
    attributes: ['id', 'fluxo_novo'],
    transaction
  });
  if (!contrato?.fluxo_novo) return null;

  const parcelas = await ContratoParcela.findAll({
    where: { contrato_id: parcela.contrato_id },
    include: [{
      model: TituloFinanceiro,
      as: 'titulo',
      attributes: ['id', 'status', 'valor_baixado'],
      required: false
    }],
    transaction
  });

  const jaMedidas = new Set((await MedicaoParcela.findAll({
    attributes: ['contrato_parcela_id'],
    where: { devolvido_em: null, contrato_parcela_id: parcelas.map((p) => p.id) },
    transaction
  })).map((m) => m.contrato_parcela_id));

  return parcelas
    .filter((p) => p.id !== parcela.id && !jaMedidas.has(p.id) && statusEfetivo(p).editavel)
    .reduce((acc, p) => acc + paraCentavos(p.valor), 0);
}

/**
 * A trava de pagar MAIS que o saldo do titulo cai — so para parcela de contrato do fluxo novo.
 *
 * Decisao do cliente (23/08): "se foi pago maior que o valor da parcela desconta da ultima parcela".
 * Para todo o resto do Financeiro a trava continua exatamente como estava — e por isso a resposta
 * `false` (nao e parcela de contrato) faz o chamador manter a recusa que ele ja tinha, com a
 * mensagem que ele ja tinha.
 *
 * Mora AQUI, e nao nos dois servicos financeiros que chamam, porque a pergunta e sobre o CONTRATO:
 * quanto as demais parcelas tem para ceder. Duplicada la, divergiria da cascata no primeiro ajuste.
 *
 * Responde ANTES de gravar. Depois seria tarde: a baixa ja teria acontecido, e a recusa viraria uma
 * excecao no meio de uma transacao financeira que ninguem pediu para desfazer.
 */
async function liberarBaixaAcimaDoSaldo(tituloId, excedente, transaction) {
  const absorcaoCent = await absorcaoDisponivelParaBaixa(tituloId, transaction);
  if (absorcaoCent === null) return false;

  const excedenteCent = Math.round(Number(excedente || 0) * 100);
  if (excedenteCent > absorcaoCent) {
    throw erro(
      `O valor pago passa em R$ ${((excedenteCent - absorcaoCent) / 100).toFixed(2)} o que as demais `
      + 'parcelas em aberto do contrato tem para ceder. Para aumentar o valor do contrato, solicite '
      + 'um termo aditivo.'
    );
  }
  return true;
}

async function sincronizarStatusDaSolicitacaoDoContrato(
  contratoId,
  { usuarioId = null, setor = null, motivo = null } = {},
  transaction
) {
  const contrato = await Contrato.findByPk(Number(contratoId), {
    attributes: ['id', 'codigo', 'fluxo_novo', 'solicitacao_id'],
    transaction
  });
  if (!contrato?.fluxo_novo || !contrato.solicitacao_id) return null;

  // O VALOR PAGO ENTRA NAS PARCELAS ANTES DE O STATUS SER CALCULADO (item 33, 23/08).
  //
  // Aqui e o unico ponto por onde passam os oito caminhos de baixa e mais o estorno: todos chamam
  // `solicitacaoFinanceiroStatusService.sincronizarStatusSolicitacaoPorBaixaTitulos`, que desvia para
  // ca quando a solicitacao e de contrato do fluxo novo. Foi por isso que o desvio foi posto la, em
  // 20/08, e a razao segue valendo: uma funcao paralela seria esquecida em pelo menos um caminho.
  //
  // Antes do status, e nao depois, porque a reconciliacao muda os valores das parcelas — e o status
  // (`NEC. DE MEDICAO` / `LIBERADO` / `PAGA`) e calculado a partir deles.
  await reconciliarParcelasComOPago(contrato.id, { usuarioId, setor }, transaction);

  const statusNovo = await calcularStatusDaSolicitacaoDoContrato(contrato.id, transaction);
  if (!statusNovo) return null;

  const solicitacao = await Solicitacao.findByPk(contrato.solicitacao_id, { transaction });
  if (!solicitacao) return null;

  const statusAnterior = solicitacao.status_global || null;
  if (String(statusAnterior || '').toUpperCase() === statusNovo) return statusAnterior;

  await solicitacao.update({ status_global: statusNovo }, { transaction });

  await Historico.create({
    solicitacao_id: solicitacao.id,
    usuario_responsavel_id: usuarioId || null,
    // `historicos.setor` e NOT NULL.
    setor: setorParaHistorico(setor) || solicitacao.area_responsavel || '-',
    acao: 'STATUS_ALTERADO',
    status_anterior: statusAnterior,
    status_novo: statusNovo,
    descricao: motivo || `Contrato ${contrato.codigo}: status da solicitacao atualizado para ${statusNovo}.`
  }, { transaction });

  return statusNovo;
}

/**
 * Editar uma medicao ja criada: valor e vencimento das parcelas que ela consumiu (20/08).
 *
 * Ate aqui o botao "Medicao N" no card do Financeiro so abria anexos e comentarios. Corrigir um
 * valor medido errado exigia excluir o titulo e refazer a medicao.
 *
 * O que muda em relacao a CRIAR uma medicao:
 *
 * - as parcelas ja estao vinculadas; o vinculo e ATUALIZADO, nao criado de novo — recriar perderia
 *   `valor_anterior`, que e a referencia da auditoria (PI-5);
 * - as OUTRAS parcelas desta mesma medicao nao servem de destino da diferenca: mexer nelas mudaria
 *   o valor de uma linha que ninguem pediu para mudar;
 * - titulo com baixa nao se edita. O valor de um titulo ja pago e passado do financeiro.
 */
async function atualizarMedicaoDoContrato(medicaoId, { itens, usuario } = {}) {
  const { userHasStrictAreaPermission } = require('./authorizationService');
  if (!await userHasStrictAreaPermission(usuario, ['contratos.medicao.editar_valor'])) {
    throw erro('Acesso negado: alterar o valor de uma medicao ja criada exige permissao especifica.', 403);
  }

  const lista = Array.isArray(itens) ? itens : [];
  if (lista.length === 0) throw erro('Informe ao menos uma parcela para alterar.');

  return sequelize.transaction(async (transaction) => {
    const medicao = await ContratoMedicao.findByPk(Number(medicaoId), {
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    if (!medicao) throw erro('Medicao nao encontrada.', 404);
    if (medicao.aprovada_em) {
      throw erro(
        `Medicao ${medicao.numero} ja foi aprovada e liberada para o Financeiro; valor e vencimento nao podem mais ser alterados.`,
        409
      );
    }

    const vinculos = await MedicaoParcela.findAll({
      where: { medicao_id: medicao.id, devolvido_em: null },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (vinculos.length === 0) throw erro('Esta medicao nao tem parcelas ativas para alterar.', 409);

    const porParcela = new Map(vinculos.map((v) => [Number(v.contrato_parcela_id), v]));
    const idsDaMedicao = new Set(porParcela.keys());

    // TODAS as parcelas ja medidas do contrato, nao so as desta medicao.
    //
    // `idsDaMedicao` sozinho protegia as linhas desta medicao e deixava as de OUTRAS servirem de
    // destino da diferenca — que e a mesma corrupcao silenciosa corrigida na criacao: o valor da
    // parcela mudava e o `valor_medido` da medicao dona nao acompanhava.
    const idsJaMedidos = new Set(
      (await MedicaoParcela.findAll({
        attributes: ['contrato_parcela_id'],
        where: { devolvido_em: null },
        include: [{
          model: ContratoParcela,
          as: 'parcela',
          attributes: [],
          required: true,
          where: { contrato_id: medicao.contrato_id }
        }],
        transaction
      })).map((m) => Number(m.contrato_parcela_id))
    );
    idsDaMedicao.forEach((id) => idsJaMedidos.add(id));

    for (const item of lista) {
      if (!porParcela.has(Number(item.contrato_parcela_id))) {
        throw erro('Parcela informada nao pertence a esta medicao.');
      }
    }

    const parcelas = await ContratoParcela.findAll({
      where: { contrato_id: medicao.contrato_id },
      include: [{
        model: TituloFinanceiro,
        as: 'titulo',
        attributes: ['id', 'status', 'valor_original', 'valor_baixado', 'valor_bruto', 'possui_rateio'],
        required: false
      }],
      order: [['numero', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    const totalAntesCent = parcelas.reduce((acc, p) => acc + paraCentavos(p.valor), 0);
    // Mesma regra da criacao: devolucao sem parcela livre para receber vira saldo do contrato.
    let sobraCent = 0;

    // MEDICAO ACIMA DO SALDO CONTINUA BLOQUEADA, TAMBEM NA EDICAO (cliente, 21/08).
    //
    // A criacao ja conferia o saldo; a edicao se segurava por CONSEQUENCIA — aumentar uma medicao
    // tira das parcelas nao medidas, e a soma das medicoes nunca passava da soma das parcelas. O
    // resultado era certo, mas nada no codigo dizia qual era a intencao, e uma mudanca na
    // redistribuicao derrubaria a garantia em silencio. Agora e regra escrita, com a mesma conta e a
    // mesma mensagem dos dois lados.
    //
    // O saldo e medido SEM a propria medicao: o que ela ja compromete nao pode ser contado duas
    // vezes, senao ela concorreria consigo mesma e qualquer aumento seria recusado.
    const saldoAtual = await calcularSaldoDoContrato(medicao.contrato_id, transaction);
    const comprometidoPelaMedicaoCent = vinculos.reduce((acc, v) => acc + paraCentavos(v.valor_medido), 0);
    const disponivelCent = saldoAtual.saldo_cent + comprometidoPelaMedicaoCent;
    const novoTotalDaMedicaoCent = [...idsDaMedicao].reduce((acc, id) => {
      const item = lista.find((i) => Number(i.contrato_parcela_id) === Number(id));
      return acc + (item ? paraCentavos(item.valor_medido) : paraCentavos(porParcela.get(id).valor_medido));
    }, 0);

    if (novoTotalDaMedicaoCent > disponivelCent) {
      throw erro(
        `O valor informado (R$ ${(novoTotalDaMedicaoCent / 100).toFixed(2)}) passa do saldo do contrato `
        + `(R$ ${(disponivelCent / 100).toFixed(2)} disponiveis para esta medicao). `
        + 'Para aumentar o valor do contrato, solicite um termo aditivo.'
      );
    }

    const trabalho = parcelas.map((p) => ({
      parcela: p,
      cent: paraCentavos(p.valor),
      vencimento: formatarISO(somenteData(p.data_vencimento)),
      ...statusEfetivo(p)
    }));
    const porIdTrabalho = new Map(trabalho.map((t) => [t.parcela.id, t]));

    for (const item of lista) {
      const parcelaId = Number(item.contrato_parcela_id);
      const alvo = porIdTrabalho.get(parcelaId);
      if (!alvo) throw erro('Parcela da medicao nao pertence mais a este contrato.', 409);

      // O que fecha a parcela para edicao aqui e a BAIXA, nao o vinculo de medicao: a parcela
      // desta medicao esta, por definicao, ja medida.
      const baixadoCent = paraCentavos(alvo.parcela.titulo?.valor_baixado || 0);
      if (baixadoCent > 0) {
        throw erro(
          `A parcela ${alvo.parcela.numero} ja tem baixa de R$ ${(baixadoCent / 100).toFixed(2)} e nao pode `
          + 'ser alterada: o valor de um titulo ja pago e passado do financeiro.',
          409
        );
      }

      const novoCent = paraCentavos(item.valor_medido);
      if (!Number.isFinite(novoCent) || novoCent <= 0) {
        throw erro(`Informe um valor valido para a parcela ${alvo.parcela.numero}.`);
      }

      const vencimentoNovo = item.vencimento
        ? formatarISO(somenteData(item.vencimento))
        : alvo.vencimento;
      if (!vencimentoNovo) throw erro(`Vencimento invalido na parcela ${alvo.parcela.numero}.`);

      const diferencaCent = alvo.cent - novoCent;
      if (diferencaCent !== 0) {
        sobraCent += redistribuirNasUltimas(trabalho, diferencaCent, {
          // Parcela ja medida — desta ou de outra medicao — e trabalho ja pedido e nao recebe.
          excluir: idsJaMedidos,
          numeroOrigem: alvo.parcela.numero
        });
      }

      alvo.cent = novoCent;
      alvo.vencimento = vencimentoNovo;

      const vinculo = porParcela.get(parcelaId);
      // `valor_anterior` e `vencimento_anterior` NAO mudam: sao a referencia de quanto a parcela
      // valia antes de ser medida pela primeira vez (PI-5).
      // eslint-disable-next-line no-await-in-loop
      await vinculo.update({
        valor_medido: novoCent / 100,
        vencimento_aplicado: vencimentoNovo
      }, { transaction });
    }

    const totalDepoisCent = trabalho.reduce((acc, t) => acc + t.cent, 0);
    if (totalDepoisCent !== totalAntesCent - sobraCent) {
      // Invariante do MD-7 com a sobra declarada: se cair aqui e bug de calculo, nao entrada do
      // usuario.
      throw erro(
        `Falha interna na redistribuicao: total mudou de ${totalAntesCent} para ${totalDepoisCent} `
        + `centavos, com sobra declarada de ${sobraCent}.`,
        500
      );
    }

    for (const t of trabalho) {
      const mudouValor = paraCentavos(t.parcela.valor) !== t.cent;
      const mudouVencimento = formatarISO(somenteData(t.parcela.data_vencimento)) !== t.vencimento;
      if (!mudouValor && !mudouVencimento) continue;

      // eslint-disable-next-line no-await-in-loop
      await t.parcela.update(
        { valor: t.cent / 100, data_vencimento: t.vencimento, atualizado_por: usuario?.id || null },
        { transaction }
      );

      if (t.parcela.titulo_financeiro_id) {
        // eslint-disable-next-line no-await-in-loop
        await sincronizarTituloDaParcela(
          { parcela: t.parcela, valorCent: t.cent, vencimento: t.vencimento, usuarioId: usuario?.id },
          transaction
        );
      }
    }

    const totalMedidoCent = [...idsDaMedicao]
      .map((id) => porIdTrabalho.get(id))
      .filter(Boolean)
      .reduce((acc, t) => acc + t.cent, 0);
    await medicao.update({ valor_total: totalMedidoCent / 100 }, { transaction });

    const contrato = await Contrato.findByPk(medicao.contrato_id, {
      attributes: ['id', 'codigo', 'solicitacao_id'],
      transaction
    });

    if (contrato?.solicitacao_id) {
      await Historico.create({
        solicitacao_id: contrato.solicitacao_id,
        medicao_id: medicao.id,
        usuario_responsavel_id: usuario?.id || null,
        setor: codigoDoSetor(usuario) || '-',
        acao: 'MEDICAO_ALTERADA',
        // A sobra entra no texto: sem isso ela apareceria so como um numero a mais no saldo do
        // contrato, e ninguem saberia de qual medicao ela veio.
        descricao: `Medicao ${medicao.numero} do contrato ${contrato.codigo} alterada: `
          + `total agora R$ ${(totalMedidoCent / 100).toFixed(2)}.`
          + (sobraCent > 0
            ? ` O contrato nao usou R$ ${(sobraCent / 100).toFixed(2)}, que ficam como saldo ate o encerramento.`
            : ''),
        metadata: JSON.stringify({
          medicao_id: medicao.id,
          total_medido: totalMedidoCent / 100,
          sobra: sobraCent / 100
        })
      }, { transaction });
    }

    await sincronizarStatusDaSolicitacaoDoContrato(
      medicao.contrato_id,
      // `codigoDoSetor`, e nao `usuario.setor`: pela tela esse campo e o OBJETO da associacao, e
      // ia parar no historico como "[object Object]". Ver `backend/src/utils/codigoDoSetor.js`.
      { usuarioId: usuario?.id, setor: codigoDoSetor(usuario) },
      transaction
    );

    return {
      medicao: { id: medicao.id, numero: medicao.numero, valor_total: totalMedidoCent / 100 },
      total_contrato: totalDepoisCent / 100,
      sobra: sobraCent / 100
    };
  });
}

/**
 * A Gerencia de Processos APROVA a medicao e devolve a solicitacao para a Obra.
 *
 * O caminho que o cliente descreveu: a Obra solicita a medicao, a Gerencia aprova no botao, e a
 * solicitacao vai para LIBERADO — o titulo esta liberado para pagamento. Ate aqui esse status era
 * posto A MAO (o historico da SOL-5116 mostra isso).
 *
 * Nao cria nem move dinheiro: os titulos ja nasceram na aprovacao do CONTRATO. O que esta aprovacao
 * faz e liberar os titulos medidos e devolver a solicitacao para acompanhamento da Obra. O
 * Financeiro somente assume quando um titulo for efetivamente enviado para a fila de pagamentos.
 */
async function aprovarMedicaoDoContrato(medicaoId, { usuario, req } = {}) {
  const { userHasStrictAreaPermission } = require('./authorizationService');
  if (!await userHasStrictAreaPermission(usuario, ['contratos.aprovacao.aprovar'])) {
    throw erro('Acesso negado: aprovar medicao exige a permissao de aprovacao de contrato.', 403);
  }

  return sequelize.transaction(async (transaction) => {
    const medicao = await ContratoMedicao.findByPk(Number(medicaoId), {
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    if (!medicao) throw erro('Medicao nao encontrada.', 404);
    if (medicao.aprovada_em) {
      throw erro(`Medicao ${medicao.numero} ja foi aprovada.`, 409);
    }

    // Guarda tambem na aprovacao: cobre medicoes antigas ou registros inseridos antes da regra
    // atual. O frontend nao e fronteira de seguranca e nao pode liberar pagamento sem beneficiario.
    if (!medicao.favorecido_id) {
      throw erro(`Informe o favorecido da medicao ${medicao.numero} antes de aprovar.`);
    }
    const favorecido = await Parceiro.findOne({
      where: { id: medicao.favorecido_id, ativo: true },
      attributes: ['id'],
      transaction
    });
    if (!favorecido) {
      throw erro(`O favorecido da medicao ${medicao.numero} nao existe ou esta inativo.`);
    }

    // O formulario seleciona o arquivo antes de criar, mas o upload historico acontece logo
    // depois. A aprovacao e o portao definitivo: sem registro gravado para ESTA medicao, ela nao
    // segue ao Financeiro. Isso tambem permite corrigir um upload que falhou sem recriar a medicao.
    const anexosDaMedicao = await Anexo.count({
      where: { medicao_id: medicao.id, deleted_at: null },
      transaction
    });
    if (anexosDaMedicao === 0) {
      throw erro(`Anexe ao menos um arquivo na medicao ${medicao.numero} antes de aprovar.`);
    }

    const formaPagamento = medicao.forma_pagamento_id
      ? await FormaPagamentoFinanceira.findByPk(medicao.forma_pagamento_id, { transaction })
      : null;
    if (!formaPagamento) {
      throw erro(`Informe uma forma de pagamento valida na medicao ${medicao.numero} antes de aprovar.`);
    }
    if (formaPagamentoEhBoleto(formaPagamento)) {
      const boletosDaMedicao = await Anexo.count({
        where: { medicao_id: medicao.id, tipo: 'BOLETO', deleted_at: null },
        transaction
      });
      if (boletosDaMedicao === 0) {
        throw erro(`Anexe o boleto da medicao ${medicao.numero} antes de aprovar.`);
      }
    }
    if (!formaPagamentoEhPix(formaPagamento)
      && !formaPagamentoEhBoleto(formaPagamento)
      && !String(medicao.favorecido_contato || '').trim()) {
      throw erro(`Informe os dados para pagamento da medicao ${medicao.numero} antes de aprovar.`);
    }

    // A aprovacao da medicao e o marco financeiro. O contrato/aditivo apenas cria a previsao;
    // aqui, e na mesma transacao da aprovacao e do encaminhamento ao Financeiro, somente os
    // titulos efetivamente medidos passam a ABERTO.
    const vinculos = await MedicaoParcela.findAll({
      where: { medicao_id: medicao.id, devolvido_em: null },
      attributes: ['contrato_parcela_id'],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const parcelaIds = vinculos.map((vinculo) => Number(vinculo.contrato_parcela_id)).filter(Boolean);
    if (parcelaIds.length === 0) {
      throw erro(`A medicao ${medicao.numero} nao possui parcelas ativas para liberar.`, 409);
    }

    const parcelasMedidas = await ContratoParcela.findAll({
      where: { id: { [Op.in]: parcelaIds }, contrato_id: medicao.contrato_id },
      attributes: ['id', 'titulo_financeiro_id'],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const tituloIds = parcelasMedidas.map((parcela) => Number(parcela.titulo_financeiro_id)).filter(Boolean);
    if (parcelasMedidas.length !== parcelaIds.length || tituloIds.length !== parcelaIds.length) {
      throw erro(`Uma ou mais parcelas da medicao ${medicao.numero} nao possuem titulo financeiro.`, 409);
    }

    await TituloFinanceiro.update(
      {
        status: 'ABERTO',
        // A previsao nasceu com a contraparte contratual. A medicao e a solicitacao de pagamento
        // efetiva e, por isso, define quem recebe e por qual meio antes de o titulo ficar aberto.
        parceiro_id: medicao.favorecido_id,
        forma_pagamento_id: medicao.forma_pagamento_id,
        atualizado_por: usuario?.id || null
      },
      { where: { id: { [Op.in]: tituloIds }, status: 'PREVISAO' }, transaction }
    );
    await ContratoParcela.update(
      {
        status: 'APROVADA',
        parceiro_id: medicao.favorecido_id,
        forma_pagamento_id: medicao.forma_pagamento_id,
        atualizado_por: usuario?.id || null
      },
      { where: { id: { [Op.in]: parcelaIds } }, transaction }
    );

    await medicao.update(
      { aprovada_em: new Date(), aprovada_por: usuario?.id || null },
      { transaction }
    );

    const contrato = await Contrato.findByPk(medicao.contrato_id, {
      attributes: ['id', 'codigo', 'solicitacao_id'],
      transaction
    });

    // A aprovacao libera os titulos e devolve a solicitacao para a Obra. O Financeiro somente
    // assume a solicitacao quando um titulo for efetivamente enviado para a fila de pagamentos.
    if (contrato?.solicitacao_id) {
      const solicitacao = await Solicitacao.findByPk(contrato.solicitacao_id, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (solicitacao) {
        const setorObraModel = await findSetorByCapability('eh_setor_obra', {
          transaction,
          attributes: ['id', 'codigo', 'nome']
        });
        const setorObra = resolveSetorPersistenciaValue(setorObraModel, 'OBRA');
        const setorAnterior = solicitacao.area_responsavel || null;

        if (String(setorAnterior || '').trim().toUpperCase() !== String(setorObra).trim().toUpperCase()) {
          await solicitacao.update({ area_responsavel: setorObra }, { transaction });
          await Historico.create({
            solicitacao_id: solicitacao.id,
            medicao_id: medicao.id,
            usuario_responsavel_id: usuario?.id || null,
            setor: setorObra,
            acao: 'ENVIADA_SETOR',
            descricao: `De ${setorAnterior || '-'} para ${setorObra}`,
            status_anterior: solicitacao.status_global,
            status_novo: solicitacao.status_global,
            metadata: JSON.stringify({
              origem: 'APROVACAO_MEDICAO',
              medicao_id: medicao.id,
              contrato_id: contrato.id
            })
          }, { transaction });
        }

        await Historico.create({
          solicitacao_id: solicitacao.id,
          medicao_id: medicao.id,
          usuario_responsavel_id: usuario?.id || null,
          setor: codigoDoSetor(usuario) || setorObra,
          acao: 'MEDICAO_APROVADA',
          descricao: `Medicao ${medicao.numero} do contrato ${contrato.codigo} aprovada; titulos liberados e solicitacao devolvida para ${setorObra}.`,
          metadata: JSON.stringify({
            medicao_id: medicao.id,
            valor_total: Number(medicao.valor_total),
            setor_destino: setorObra,
            movimentacao_financeiro: 'SOMENTE_AO_ENFILEIRAR_TITULO'
          })
        }, { transaction });
      }
    }

    await sincronizarStatusDaSolicitacaoDoContrato(
      medicao.contrato_id,
      {
        usuarioId: usuario?.id,
        setor: codigoDoSetor(usuario),
        motivo: `Medicao ${medicao.numero} aprovada: liberada para pagamento.`
      },
      transaction
    );

    return {
      medicao: { id: medicao.id, numero: medicao.numero, aprovada_em: medicao.aprovada_em },
      enviada_para: 'OBRA'
    };
  });
}

async function validarMedicaoParcelas({ contratoId, itens }) {
  await sequelize.transaction(async (transaction) => {
    await aplicarMedicaoNasParcelas(
      { contratoId, solicitacaoId: null, itens, usuarioId: null, apenasValidar: true },
      transaction
    );
    // Desfaz tudo: aqui so interessa saber se passaria.
    throw Object.assign(new Error('__ENSAIO_OK__'), { ensaio: true });
  }).catch((e) => {
    if (e?.ensaio) return;
    throw e;
  });
}

module.exports = {
  registrarMedicaoDoContrato,
  aprovarMedicaoDoContrato,
  // Usada tambem pelo aditivo: quando o valor cai na ultima parcela livre, o titulo dela tem de
  // acompanhar — parcela e financeiro divergindo e o pior tipo de erro deste modulo.
  sincronizarTituloDaParcela,
  atualizarMedicaoDoContrato,
  sincronizarStatusDaSolicitacaoDoContrato,
  reconciliarParcelasComOPago,
  // Os caminhos de baixa perguntam por aqui se podem deixar pagar a mais.
  liberarBaixaAcimaDoSaldo,
  absorcaoDisponivelParaBaixa,
  STATUS_SOLICITACAO_CONTRATO,
  aplicarMedicaoNasParcelas,
  validarMedicaoParcelas,
  calcularSaldoDoContrato,
  devolverSaldoDeTitulosExcluidos,
  validarPeriodoMedicao,
  statusEfetivo,
  periodosSeSobrepoem,
  STATUS_TITULO_EDITAVEL,
  STATUS_PARCELA_EDITAVEL
};
