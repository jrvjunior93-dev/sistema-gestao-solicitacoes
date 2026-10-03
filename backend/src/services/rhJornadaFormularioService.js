'use strict';

const { createHash } = require('crypto');
const { Op } = require('sequelize');
const {
  RhImportacao,
  RhImportacaoLinha,
  RhApuracao,
  RhApuracaoEvento,
  RhFechamento,
  RhJornadaEdicao,
  RhColaborador,
  RhColaboradorPagamento,
  RhColaboradorCalculoHistorico,
  RhColaboradorVinculo,
  RhSolicitacao,
  RhSolicitacaoHistorico,
  Obra,
  sequelize
} = require('../models');
const { ValidationError } = require('../middlewares/validation');
const rhVinculoObraService = require('./rhVinculoObraService');
const rhCalculoHistoricoService = require('./rhCalculoHistoricoService');
const { diasVinculados, hojeLocal } = require('./rhPessoalDomain');
const { setorParaHistorico } = require('../utils/codigoDoSetor');
const { garantirCodigoRhSolicitacao } = require('./rhSolicitacaoCodigoService');
const { isValidCpf, onlyDigits } = require('../utils/cpfCnpj');

/**
 * JORNADA PELO FORMULARIO, sem planilha (Fase 4 do modulo DP, 26/08).
 *
 * Pedido do cliente: a solicitacao de pagamento de pessoal pode ser "de forma individual direto no
 * colaborador ou atraves de um formulario onde a obra vai ter listados todos os colaboradores e
 * podera informar a jornada trabalhada, acrescimos e descontos".
 *
 * A DECISAO CENTRAL: isto NAO tem calculo proprio. Grava a mesma estrutura que a planilha grava —
 * `rh_importacoes` + `rh_importacao_linhas` com `tipo = 'JORNADA'` — e a apuracao segue sem saber a
 * diferenca.
 *
 * A alternativa era um segundo calculo de folha ao lado do que existe. Dois calculos DIVERGEM: um
 * ganha uma correcao que o outro nao ganha, e a partir dai o mesmo colaborador recebe valores
 * diferentes dependendo de por onde a obra digitou. Nao ha erro mais caro de achar do que esse.
 *
 * O pagamento INDIVIDUAL e o mesmo caminho com uma linha so — nao um terceiro codigo. Se fosse
 * codigo separado, seria a terceira versao da mesma conta.
 */

const ORIGENS = new Set(['FORMULARIO', 'INDIVIDUAL', 'PLANILHA']);
const PERIODICIDADES = new Set(['SEMANAL', 'QUINZENAL', 'MENSAL']);
const ETAPAS_PAGAMENTO = new Set(['ADIANTAMENTO_40', 'SALDO_60', 'PROPORCIONAL', 'DIARIA']);

function etapasHabilitadas() {
  return String(process.env.RH_JORNADA_40_60_ETAPAS || 'OFF').toUpperCase() === 'ON';
}

function gerencialV2Habilitado() {
  return String(process.env.RH_JORNADA_GERENCIAL_V2 || 'OFF').toUpperCase() === 'ON';
}

function competenciaValida(valor) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(valor || '').trim());
}

function numeroNaoNegativo(valor, campo, colaboradorId) {
  const numero = Number(valor || 0);
  if (!Number.isFinite(numero) || numero < 0) {
    throw new ValidationError(`${campo} do colaborador #${colaboradorId} e invalido: "${valor}".`);
  }
  return numero;
}

function pagamentoDoTituloDaJornada(linha, pagamentoCadastrado, colaboradorNome) {
  const chaveCadastrada = [
    pagamentoCadastrado?.chave_pix,
    pagamentoCadastrado?.chave_pix_secundaria,
    pagamentoCadastrado?.chave_pix_variavel
  ].map((valor) => String(valor || '').trim()).find(Boolean) || '';
  const chaveIndicada = String(linha.chave_pix_titulo ?? chaveCadastrada).trim();
  const alterado = chaveIndicada !== chaveCadastrada;
  const nome = String(linha.favorecido_pix_nome || '').trim();
  const cpf = onlyDigits(linha.favorecido_pix_cpf || '');
  if (chaveIndicada.length > 120) {
    throw new ValidationError(`${colaboradorNome}: a chave PIX excede o limite permitido.`);
  }
  if (alterado && (!chaveIndicada || !nome || !isValidCpf(cpf))) {
    throw new ValidationError(`${colaboradorNome}: ao alterar a chave PIX, informe chave, nome e CPF valido do novo beneficiario.`);
  }
  if (nome.length > 180) {
    throw new ValidationError(`${colaboradorNome}: o nome do beneficiario PIX excede o limite permitido.`);
  }
  return {
    chave_pix: chaveIndicada || null,
    favorecido_nome: alterado ? nome : null,
    favorecido_cpf: alterado ? cpf : null,
    alterado_na_jornada: alterado
  };
}

/** DATEONLY do Sequelize pode vir como string ou Date; a tela precisa sempre de `AAAA-MM-DD`. */
function paraDataIso(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).slice(0, 10);
}

/** O primeiro e o ultimo dia da competencia, para perguntar ao vinculo quem estava na obra. */
function limitesDaCompetencia(competencia) {
  const [ano, mes] = competencia.split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return {
    inicio: `${competencia}-01`,
    fim: `${competencia}-${String(ultimoDia).padStart(2, '0')}`
  };
}

function dataIsoValida(valor) {
  const texto = paraDataIso(valor);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(texto || ''))) return false;
  const data = new Date(`${texto}T00:00:00.000Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === texto;
}

function diasInclusivos(inicio, fim) {
  const de = new Date(`${inicio}T00:00:00.000Z`);
  const ate = new Date(`${fim}T00:00:00.000Z`);
  return Math.floor((ate.getTime() - de.getTime()) / 86400000) + 1;
}

/** Registros antigos sem datas continuam equivalendo ao mes completo da competencia. */
function periodoDaImportacao(importacao) {
  const padrao = limitesDaCompetencia(importacao.competencia);
  return {
    periodicidade: String(importacao.periodicidade || 'MENSAL').toUpperCase(),
    inicio: paraDataIso(importacao.periodo_inicio) || padrao.inicio,
    fim: paraDataIso(importacao.periodo_fim) || padrao.fim
  };
}

function normalizarPeriodo(dados, competencia, etapaPagamento = null) {
  const limites = limitesDaCompetencia(competencia);
  if (etapaPagamento) {
    const esperado = dados.modo_gerencial_v2 === true
      ? { periodicidade: 'MENSAL', ...limites }
      : etapaPagamento === 'ADIANTAMENTO_40'
      ? { periodicidade: 'QUINZENAL', inicio: limites.inicio, fim: `${competencia}-15` }
      : etapaPagamento === 'SALDO_60'
        ? { periodicidade: 'QUINZENAL', inicio: `${competencia}-16`, fim: limites.fim }
        : { periodicidade: 'MENSAL', ...limites };
    if ((dados.periodicidade && dados.periodicidade !== esperado.periodicidade)
      || (dados.periodo_inicio && paraDataIso(dados.periodo_inicio) !== esperado.inicio)
      || (dados.periodo_fim && paraDataIso(dados.periodo_fim) !== esperado.fim)) {
      throw new ValidationError('A etapa e a competencia determinam o periodo da jornada; nao informe outro periodo.');
    }
    return { ...esperado, dias: diasInclusivos(esperado.inicio, esperado.fim) };
  }
  const periodicidade = String(dados.periodicidade || 'MENSAL').trim().toUpperCase();
  if (!PERIODICIDADES.has(periodicidade)) {
    throw new ValidationError('Informe a periodicidade: semanal, quinzenal ou mensal.');
  }

  const inicio = paraDataIso(dados.periodo_inicio) || (periodicidade === 'MENSAL' ? limites.inicio : null);
  const fim = paraDataIso(dados.periodo_fim) || (periodicidade === 'MENSAL' ? limites.fim : null);
  if (!dataIsoValida(inicio) || !dataIsoValida(fim) || fim < inicio) {
    throw new ValidationError('Informe um periodo de jornada valido.');
  }
  if (!inicio.startsWith(`${competencia}-`) || !fim.startsWith(`${competencia}-`)) {
    throw new ValidationError('O periodo da jornada precisa estar dentro da competencia selecionada.');
  }

  const dias = diasInclusivos(inicio, fim);
  if (periodicidade === 'SEMANAL' && dias > 7) {
    throw new ValidationError('Uma jornada semanal pode abranger no maximo 7 dias.');
  }
  if (periodicidade === 'QUINZENAL' && dias > 16) {
    throw new ValidationError('Uma jornada quinzenal pode abranger no maximo 16 dias.');
  }
  if (periodicidade === 'MENSAL' && (inicio !== limites.inicio || fim !== limites.fim)) {
    throw new ValidationError('A jornada mensal deve abranger a competencia inteira.');
  }

  return { periodicidade, inicio, fim, dias };
}

function periodosSobrepostos(a, b) {
  return a.inicio <= b.fim && b.inicio <= a.fim;
}

function mesmoPeriodo(a, b) {
  return a.inicio === b.inicio && a.fim === b.fim;
}

function datasNoPeriodo(periodo) {
  const datas = [];
  const atual = new Date(`${periodo.inicio}T00:00:00.000Z`);
  while (atual.toISOString().slice(0, 10) <= periodo.fim) {
    datas.push(atual.toISOString().slice(0, 10));
    atual.setUTCDate(atual.getUTCDate() + 1);
  }
  return datas;
}

function diasDiariaElegiveis(colaborador, vinculos, historicos, periodo, dataLimite = hojeLocal()) {
  return datasNoPeriodo(periodo).filter((dia) => {
    if (dia > dataLimite) return false;
    const vinculado = vinculos.some((vinculo) => Number(vinculo.colaborador_id) === Number(colaborador.id)
      && String(vinculo.vigencia_inicio).slice(0, 10) <= dia
      && (!vinculo.vigencia_fim || String(vinculo.vigencia_fim).slice(0, 10) >= dia));
    if (!vinculado) return false;
    const historico = historicos.find((item) => Number(item.colaborador_id) === Number(colaborador.id)
      && String(item.vigencia_inicio).slice(0, 10) <= dia
      && (!item.vigencia_fim || String(item.vigencia_fim).slice(0, 10) >= dia));
    if (historico) return historico.forma_calculo === 'DIARIA';
    return !historicos.some((item) => Number(item.colaborador_id) === Number(colaborador.id))
      && rhCalculoHistoricoService.resumo(colaborador).forma_calculo === 'DIARIA';
  });
}

function validarDiasDiaria(dias, elegiveis, jaInformados, nome, competencia) {
  if (!Array.isArray(dias) || dias.length === 0 || dias.length > 31
    || dias.some((dia) => !dataIsoValida(dia) || !dia.startsWith(`${competencia}-`))
    || new Set(dias).size !== dias.length) {
    throw new ValidationError(`${nome}: selecione os dias efetivamente trabalhados nesta competencia.`);
  }
  const permitidos = new Set(elegiveis);
  const usados = new Set(jaInformados);
  if (dias.some((dia) => !permitidos.has(dia))) {
    throw new ValidationError(`${nome}: um dos dias nao pertence ao vinculo desta obra ou ao regime de diaria.`, 409);
  }
  if (dias.some((dia) => usados.has(dia))) {
    throw new ValidationError(`${nome}: um dos dias selecionados ja foi enviado em outra jornada.`, 409);
  }
  return [...dias].sort();
}

async function historicosDeCalculo(ids, transaction = undefined) {
  if (!ids.length) return [];
  return RhColaboradorCalculoHistorico.findAll({
    where: { colaborador_id: { [Op.in]: ids } },
    transaction
  });
}

async function linhasDiariasDaCompetencia(ids, competencia, transaction = undefined) {
  if (!ids.length) return [];
  return RhImportacaoLinha.findAll({
    where: { colaborador_id: { [Op.in]: ids }, status: 'CONFIRMADA' },
    include: [{ association: 'importacao', required: true, where: {
      competencia, tipo: 'JORNADA', status: 'CONFIRMADA', etapa_pagamento: 'DIARIA'
    } }],
    transaction
  });
}

async function linhasConfirmadasDaCompetencia(obraId, competencia, transaction = undefined) {
  return RhImportacaoLinha.findAll({
    where: { status: 'CONFIRMADA' },
    include: [{
      association: 'importacao',
      required: true,
      attributes: ['id', 'competencia', 'periodicidade', 'periodo_inicio', 'periodo_fim', 'etapa_pagamento', 'status'],
      where: { obra_id: obraId, competencia, tipo: 'JORNADA', status: 'CONFIRMADA' }
    }],
    order: [['id', 'DESC']],
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {})
  });
}

/**
 * Registra a jornada de uma obra numa competencia.
 *
 * SUBSTITUI o envio anterior da mesma obra e competencia, em vez de somar. A obra preenche, ve um
 * dia de falta errado e preenche de novo — se os dois envios ficassem valendo, a apuracao somaria
 * os dois (a agregacao soma as linhas de todas as importacoes confirmadas do recorte) e o
 * colaborador apareceria com 60 dias trabalhados num mes de 30.
 *
 * O envio anterior e marcado SUBSTITUIDA, nao apagado: ele e o registro do que a obra tinha
 * informado antes, e quem conferir o pagamento depois vai querer ver isso.
 */
async function registrarJornadaEmTransacao(dados = {}, contexto = {}, transaction) {
    const competencia = String(dados.competencia || '').trim();
    if (!competenciaValida(competencia)) {
      throw new ValidationError(`A competencia deve estar no formato AAAA-MM (recebi "${dados.competencia}").`);
    }

    const obraId = Number(dados.obra_id);
    if (!obraId) throw new ValidationError('Informe a obra da jornada.');

    const etapaPagamento = String(dados.etapa_pagamento || '').trim().toUpperCase() || null;
    const modoGerencialV2 = dados.modo_gerencial_v2 === true;
    if (modoGerencialV2 && !gerencialV2Habilitado()) {
      throw new ValidationError('O novo fluxo gerencial de jornada nao esta habilitado.', 409);
    }
    if (etapaPagamento === 'PROPORCIONAL' && !modoGerencialV2) {
      throw new ValidationError('Pagamento proporcional disponivel somente no fluxo gerencial.', 409);
    }
    if (etapaPagamento && (!etapasHabilitadas() || !ETAPAS_PAGAMENTO.has(etapaPagamento))) {
      throw new ValidationError('A etapa de pagamento da jornada nao esta habilitada ou e invalida.', 409);
    }
    const periodo = normalizarPeriodo(dados, competencia, etapaPagamento);
    const idempotencyKey = etapaPagamento ? String(dados.idempotency_key || '').trim() : '';
    if (etapaPagamento && !/^[A-Za-z0-9-]{16,80}$/.test(idempotencyKey)) {
      throw new ValidationError('Identificador de envio da jornada invalido. Atualize a tela e tente novamente.');
    }
    const envioHash = idempotencyKey
      ? createHash('sha256').update(JSON.stringify({
          ...dados,
          idempotency_key: undefined,
          competencia,
          obra_id: obraId,
          etapa_pagamento: etapaPagamento,
          periodo_inicio: periodo.inicio,
          periodo_fim: periodo.fim
        })).digest('hex')
      : null;

    // Serializa os envios da mesma obra para impedir dois cliques simultaneos de gravarem o mesmo
    // colaborador e periodo antes de um deles enxergar o outro.
    const obra = await Obra.findByPk(obraId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!obra) throw new ValidationError('Obra da jornada nao encontrada.', 404);
    if (idempotencyKey) {
      const repetida = await RhImportacao.findOne({ where: { idempotency_key: idempotencyKey }, transaction });
      if (repetida) {
        if (Number(repetida.obra_id) !== obraId || repetida.competencia !== competencia
          || repetida.resumo_json?.envio_hash !== envioHash) {
          throw new ValidationError('Este identificador de envio ja foi utilizado em outra jornada.', 409);
        }
        const solicitacoes = await RhSolicitacao.findAll({
          where: { tipo: 'JORNADA', obra_id: obraId },
          order: [['id', 'DESC']],
          transaction
        });
        const solicitacao = solicitacoes.find((pedido) => {
          const detalhes = typeof pedido.dados_json === 'string'
            ? JSON.parse(pedido.dados_json) : (pedido.dados_json || {});
          return Number(detalhes.importacao_id) === Number(repetida.id);
        }) || null;
        return {
          importacao: repetida,
          linhas: await RhImportacaoLinha.findAll({ where: { importacao_id: repetida.id }, transaction }),
          solicitacao,
          repetido: true
        };
      }
    }

    const linhas = Array.isArray(dados.linhas) ? dados.linhas : [];
    if (!linhas.length) throw new ValidationError('Informe ao menos um colaborador na jornada.');

    const origem = ORIGENS.has(String(dados.origem || '').toUpperCase())
      ? String(dados.origem).toUpperCase()
      : 'FORMULARIO';

    const diasBase = etapaPagamento ? periodo.dias : Number(dados.dias_base || 30);
    if (!Number.isFinite(diasBase) || diasBase <= 0 || diasBase > 31) {
      throw new ValidationError('A base de dias deve estar entre 1 e 31.');
    }

    // Um colaborador so pode aparecer uma vez: repetido, a agregacao somaria as duas linhas e o
    // sujeito trabalharia dois meses no mesmo mes.
    const vistos = new Set();
    for (const linha of linhas) {
      const id = Number(linha.colaborador_id);
      if (!id) throw new ValidationError('Toda linha da jornada precisa de um colaborador.');
      if (vistos.has(id)) {
        throw new ValidationError(`O colaborador #${id} aparece mais de uma vez na jornada.`);
      }
      vistos.add(id);
    }

    const colaboradores = await RhColaborador.findAll({
      where: { id: Array.from(vistos) },
      order: [['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const porId = new Map(colaboradores.map((c) => [Number(c.id), c]));
    const pagamentos = await RhColaboradorPagamento.findAll({
      where: { colaborador_id: Array.from(vistos) }, transaction
    });
    const pagamentoPorId = new Map(pagamentos.map((item) => [Number(item.colaborador_id), item]));
    const regimePorId = new Map();

    for (const id of vistos) {
      if (!porId.has(id)) throw new ValidationError(`Colaborador #${id} nao encontrado.`, 404);
      if (etapaPagamento && etapaPagamento !== 'DIARIA') {
        // Uma conversao no meio do mes nao invalida os dias mensais anteriores.
        // O regime e conferido somente ate a vespera da primeira diaria.
        // eslint-disable-next-line no-await-in-loop
        const conversaoGerencial = modoGerencialV2
          ? await rhCalculoHistoricoService.conversaoMensalParaDiariaNaCompetencia(id, competencia, transaction)
          : null;
        const inicioMensal = modoGerencialV2
          ? [periodo.inicio, String(conversaoGerencial?.inicio_mensal
              || porId.get(id).data_admissao || porId.get(id).data_inicio || periodo.inicio).slice(0, 10)].sort().at(-1)
          : periodo.inicio;
        const fimMensal = conversaoGerencial?.fim_mensal || periodo.fim;
        if (fimMensal < inicioMensal) {
          throw new ValidationError(`${porId.get(id).nome}: nao ha dias mensais nesta competencia.`, 409);
        }
        // eslint-disable-next-line no-await-in-loop
        const regime = await rhCalculoHistoricoService.regimeNoPeriodo(
          porId.get(id), inicioMensal, fimMensal, transaction
        );
        if (etapaPagamento === 'DIARIA' && regime.forma_calculo !== 'DIARIA') {
          throw new ValidationError(`${porId.get(id).nome}: selecione a etapa 40% ou 60% para mensalistas.`);
        }
        if (regime.forma_calculo !== 'MENSAL'
          || (!modoGerencialV2 && !regime.pagamento_automatico_40_60)) {
          throw new ValidationError(`${porId.get(id).nome}: selecione uma forma de pagamento compativel com o regime mensal no periodo.`);
        }
        regimePorId.set(id, { ...regime, fim_mensal: fimMensal });
      }
    }

    const vinculosDistribuicao = await RhColaboradorVinculo.findAll({
      where: {
        colaborador_id: { [Op.in]: Array.from(vistos) },
        obra_id: { [Op.ne]: null },
        vigencia_inicio: { [Op.lte]: modoGerencialV2
          ? [periodo.fim, hojeLocal()].sort()[0] : periodo.fim },
        [Op.or]: [{ vigencia_fim: null }, { vigencia_fim: { [Op.gte]: periodo.inicio } }]
      },
      attributes: ['colaborador_id', 'obra_id'],
      transaction
    });
    const obrasPorColaborador = new Map();
    vinculosDistribuicao.forEach((vinculo) => {
      const colaboradorId = Number(vinculo.colaborador_id);
      if (!obrasPorColaborador.has(colaboradorId)) obrasPorColaborador.set(colaboradorId, new Set());
      obrasPorColaborador.get(colaboradorId).add(Number(vinculo.obra_id));
    });

    /**
     * QUEM ESTAVA NESTA OBRA NESTA COMPETENCIA — usando o vinculo da Fase 1.
     *
     * E a primeira vez que o historico de lotacao paga o proprio custo. Sem ele so daria para
     * comparar com `rh_colaboradores.obra_id`, a obra ATUAL — e quem foi transferido no meio do mes
     * apareceria como "nao e desta obra" na folha do mes em que ainda estava nela.
     */
    const vinculosDaObra = await rhVinculoObraService.colaboradoresDaObraEm(
      obraId,
      periodo.inicio,
      periodo.fim,
      transaction
    );
    const historicos = etapaPagamento === 'DIARIA'
      ? await historicosDeCalculo(Array.from(vistos), transaction) : [];
    const diariasExistentes = etapaPagamento === 'DIARIA'
      ? await linhasDiariasDaCompetencia(Array.from(vistos), competencia, transaction) : [];
    const estiveramNaObra = new Set(vinculosDaObra.map((v) => Number(v.colaborador_id)));

    for (const id of vistos) {
      if (!estiveramNaObra.has(id)) {
        const colaborador = porId.get(id);
        throw new ValidationError(
          `${colaborador.nome} nao esteve nesta obra no periodo informado. `
          + 'Se houve transferencia, abra uma solicitacao de troca de obra antes de lancar a jornada.'
        );
      }
    }

    const existentes = await linhasConfirmadasDaCompetencia(obraId, competencia, transaction);
    const jornadasDaCompetencia = await RhImportacaoLinha.findAll({
      where: { colaborador_id: { [Op.in]: Array.from(vistos) }, status: 'CONFIRMADA' },
      attributes: ['colaborador_id', 'payload_json'],
      include: [{ association: 'importacao', required: true, where: {
        competencia, tipo: 'JORNADA', status: 'CONFIRMADA'
      } }], transaction
    });
    if (jornadasDaCompetencia.some((anterior) =>
      Boolean(anterior.payload_json?.modo_gerencial_v2) !== modoGerencialV2)) {
      throw new ValidationError(
        'Este colaborador ja possui jornada nesta competencia em outro fluxo. O DP deve conciliar antes de novo envio.', 409
      );
    }
    const linhasSubstituidas = [];
    const autorizacoesUsadas = [];

    for (const linha of linhas) {
      const colaboradorId = Number(linha.colaborador_id);
      if (['ADIANTAMENTO_40', 'SALDO_60', 'PROPORCIONAL'].includes(etapaPagamento)) {
        // Depois que a primeira diaria da conversao foi enviada, o acerto mensal ja pode
        // estar apurado. Um novo pagamento mensal mudaria retroativamente aquele saldo.
        // eslint-disable-next-line no-await-in-loop
        const conversao = await rhCalculoHistoricoService.conversaoMensalParaDiariaNaCompetencia(
          colaboradorId, competencia, transaction
        );
        if (conversao) {
          // eslint-disable-next-line no-await-in-loop
          const diariaJaEnviada = await RhImportacaoLinha.findOne({
            where: { colaborador_id: colaboradorId, status: 'CONFIRMADA' },
            include: [{ association: 'importacao', required: true, where: {
              competencia, tipo: 'JORNADA', status: 'CONFIRMADA', etapa_pagamento: 'DIARIA'
            } }], transaction
          });
          if (diariaJaEnviada) {
            throw new ValidationError(
              `${porId.get(colaboradorId).nome}: a conversao mensal/diaria ja tem jornada diaria. `
              + 'Corrija o acerto pelo DP antes de enviar outra etapa mensal.', 409
            );
          }
        }
      }
      if (['ADIANTAMENTO_40', 'SALDO_60', 'PROPORCIONAL'].includes(etapaPagamento)) {
        // Uma etapa ja transformada em titulo nao pode ser refeita por outro envio da
        // mesma competencia. A correcao financeira exige estorno explicito pelo DP.
        // eslint-disable-next-line no-await-in-loop
        const etapaFechada = await RhApuracaoEvento.findOne({
          where: { colaborador_id: colaboradorId },
          include: [{ model: RhApuracao, as: 'apuracao', required: true, where: {
            competencia, etapa_pagamento: etapaPagamento
          }, include: [{ model: RhFechamento, as: 'fechamentoRh', required: true,
            where: { status: 'FECHADO' } }] }],
          transaction
        });
        if (etapaFechada) {
          throw new ValidationError(
            `${porId.get(colaboradorId).nome}: esta etapa ja gerou titulo. Solicite estorno antes de corrigir a jornada.`, 409
          );
        }
      }
      if (etapaPagamento === 'SALDO_60') {
        if (modoGerencialV2) {
          // eslint-disable-next-line no-await-in-loop
          const proporcional = await RhImportacaoLinha.findOne({
            where: { colaborador_id: colaboradorId, status: 'CONFIRMADA' },
            include: [{ association: 'importacao', required: true, where: {
              competencia, tipo: 'JORNADA', status: 'CONFIRMADA', etapa_pagamento: 'PROPORCIONAL'
            } }], transaction
          });
          if (proporcional) throw new ValidationError(`${porId.get(colaboradorId).nome}: ja existe acerto proporcional nesta competencia.`, 409);
        }
        // A segunda etapa so pode existir depois da primeira, em qualquer obra da competencia.
        // eslint-disable-next-line no-await-in-loop
        const adiantamento = await RhImportacaoLinha.findOne({
          where: { colaborador_id: colaboradorId, status: 'CONFIRMADA' },
          include: [{ association: 'importacao', required: true, where: {
            competencia, tipo: 'JORNADA', status: 'CONFIRMADA', etapa_pagamento: 'ADIANTAMENTO_40'
          } }],
          transaction
        });
        if (!adiantamento) {
          throw new ValidationError(`${porId.get(colaboradorId).nome}: envie primeiro a jornada dos 40%.`, 409);
        }
        if (modoGerencialV2) {
          // A segunda solicitacao informa novos dias da mesma competencia; nao pode cobrar
          // mais dias do que os transcorridos, mesmo quando houve troca de obra.
          // eslint-disable-next-line no-await-in-loop
          const quarenta = await RhImportacaoLinha.findAll({
            where: { colaborador_id: colaboradorId, status: 'CONFIRMADA' },
            include: [{ association: 'importacao', required: true, where: {
              competencia, tipo: 'JORNADA', status: 'CONFIRMADA', etapa_pagamento: 'ADIANTAMENTO_40'
            } }], transaction
          });
          const diasJaInformados = quarenta.reduce(
            (total, anterior) => total + Number(anterior.payload_json?.dias_trabalhados || 0), 0
          );
          const diasNovos = Number(linha.dias_trabalhados || 0);
          const limiteDaCompetencia = diasInclusivos(periodo.inicio, [periodo.fim, hojeLocal()].sort()[0]);
          if (diasJaInformados + diasNovos > limiteDaCompetencia) {
            throw new ValidationError(`${porId.get(colaboradorId).nome}: os dias dos 40% e 60% excedem os dias transcorridos da competencia.`, 409);
          }
        }
      }
      if (modoGerencialV2 && etapaPagamento === 'ADIANTAMENTO_40') {
        // O adiantamento nao pode ser enviado depois de um acerto final na mesma competencia.
        // eslint-disable-next-line no-await-in-loop
        const finalExistente = await RhImportacaoLinha.findOne({
          where: { colaborador_id: colaboradorId, status: 'CONFIRMADA' },
          include: [{ association: 'importacao', required: true, where: {
            competencia, tipo: 'JORNADA', status: 'CONFIRMADA',
            etapa_pagamento: { [Op.in]: ['SALDO_60', 'PROPORCIONAL'] }
          } }], transaction
        });
        if (finalExistente) throw new ValidationError(`${porId.get(colaboradorId).nome}: ja existe um acerto final nesta competencia.`, 409);
      }
      if (modoGerencialV2 && etapaPagamento === 'PROPORCIONAL') {
        // eslint-disable-next-line no-await-in-loop
        const saldoExistente = await RhImportacaoLinha.findOne({
          where: { colaborador_id: colaboradorId, status: 'CONFIRMADA' },
          include: [{ association: 'importacao', required: true, where: {
            competencia, tipo: 'JORNADA', status: 'CONFIRMADA', etapa_pagamento: 'SALDO_60'
          } }], transaction
        });
        if (saldoExistente) throw new ValidationError(`${porId.get(colaboradorId).nome}: o saldo de 60% ja foi solicitado nesta competencia.`, 409);
        // No acerto proporcional os dias representam o total da competencia
        // nesta obra, nao apenas os dias novos apos o adiantamento.
        // eslint-disable-next-line no-await-in-loop
        const quarentaNaObra = await RhImportacaoLinha.findAll({
          where: { colaborador_id: colaboradorId, status: 'CONFIRMADA' },
          include: [{ association: 'importacao', required: true, where: {
            obra_id: obraId, competencia, tipo: 'JORNADA', status: 'CONFIRMADA', etapa_pagamento: 'ADIANTAMENTO_40'
          } }], transaction
        });
        const diasDoAdiantamento = quarentaNaObra.reduce(
          (total, anterior) => total + Number(anterior.payload_json?.dias_trabalhados || 0), 0
        );
        if (Number(linha.dias_trabalhados || 0) < diasDoAdiantamento) {
          throw new ValidationError(`${porId.get(colaboradorId).nome}: o proporcional deve informar todos os dias da competencia nesta obra, inclusive os dos 40%.`, 409);
        }
      }
      if (!modoGerencialV2 && ['ADIANTAMENTO_40', 'SALDO_60'].includes(etapaPagamento)) {
        const outraEtapa = etapaPagamento === 'ADIANTAMENTO_40' ? 'SALDO_60' : 'ADIANTAMENTO_40';
        // O mesmo dia nao pode compor simultaneamente o adiantamento e o saldo, inclusive
        // quando a pessoa foi transferida e os envios vieram de obras diferentes.
        // eslint-disable-next-line no-await-in-loop
        const outrasLinhas = await RhImportacaoLinha.findAll({
          where: { colaborador_id: colaboradorId, status: 'CONFIRMADA' },
          include: [{ association: 'importacao', required: true, where: {
            competencia, tipo: 'JORNADA', status: 'CONFIRMADA', etapa_pagamento: outraEtapa
          } }],
          transaction
        });
        if (outrasLinhas.some((anterior) => periodosSobrepostos(periodo, periodoDaImportacao(anterior.importacao)))) {
          throw new ValidationError(
            `${porId.get(colaboradorId).nome}: os periodos das jornadas de 40% e 60% nao podem se sobrepor.`, 409
          );
        }
      }
      const sobrepostas = existentes.filter((existente) => (
        Number(existente.colaborador_id) === colaboradorId
        && periodosSobrepostos(periodo, periodoDaImportacao(existente.importacao))
        && (!etapaPagamento || existente.importacao.etapa_pagamento === etapaPagamento)
      ));
      if (['ADIANTAMENTO_40', 'SALDO_60', 'PROPORCIONAL'].includes(etapaPagamento)) {
        const outraDoMesmoEstagio = existentes.find((existente) => (
          Number(existente.colaborador_id) === colaboradorId
          && existente.importacao.etapa_pagamento === etapaPagamento
          && !mesmoPeriodo(periodo, periodoDaImportacao(existente.importacao))
        ));
        if (outraDoMesmoEstagio) {
          throw new ValidationError(
            `${porId.get(colaboradorId).nome}: ja existe outra jornada desta etapa na obra. Corrija o periodo existente com autorizacao do DP.`, 409
          );
        }
      }
      // Cada envio de diaria e um pagamento proprio; o limite de dias acumulados e verificado
      // abaixo. O mesmo periodo pode ser usado, sem substituir a linha anterior.
      if (etapaPagamento === 'DIARIA') {
        const linhaAnteriorId = Number(linha.substituir_importacao_linha_id || 0);
        if (!linhaAnteriorId) continue;
        const anterior = await RhImportacaoLinha.findOne({
          where: { id: linhaAnteriorId, colaborador_id: colaboradorId, status: 'CONFIRMADA' },
          include: [{ association: 'importacao', required: true, where: {
            obra_id: obraId, competencia, tipo: 'JORNADA', status: 'CONFIRMADA', etapa_pagamento: 'DIARIA'
          } }], transaction, lock: transaction.LOCK.UPDATE
        });
        if (!anterior) throw new ValidationError('A diaria indicada para correcao nao esta ativa nesta obra.', 409);
        const autorizacao = await RhJornadaEdicao.findOne({
          where: { importacao_linha_id: anterior.id, status: 'AUTORIZADA' },
          order: [['id', 'DESC']], transaction, lock: transaction.LOCK.UPDATE
        });
        if (!autorizacao) throw new ValidationError('O DP precisa autorizar o retorno desta diaria antes da correcao.', 409);
        linhasSubstituidas.push(anterior.id);
        autorizacoesUsadas.push(autorizacao.id);
        continue;
      }
      if (!sobrepostas.length) continue;

      const periodoDiferente = sobrepostas.find(
        (existente) => !mesmoPeriodo(periodo, periodoDaImportacao(existente.importacao))
      );
      if (periodoDiferente) {
        const periodoExistente = periodoDaImportacao(periodoDiferente.importacao);
        throw new ValidationError(
          `Ja existe jornada de ${porId.get(colaboradorId).nome} entre `
          + `${periodoExistente.inicio} e ${periodoExistente.fim}. Os periodos nao podem se sobrepor.`,
          409
        );
      }

      for (const existente of sobrepostas) {
        if (!contexto.podeDecidir) {
          // A liberacao e pontual e vale uma vez para a linha que o DP analisou.
          // eslint-disable-next-line no-await-in-loop
          const autorizacao = await RhJornadaEdicao.findOne({
            where: { importacao_linha_id: existente.id, status: 'AUTORIZADA' },
            order: [['id', 'DESC']],
            transaction,
            lock: transaction.LOCK.UPDATE
          });
          if (!autorizacao) {
            throw new ValidationError(
              `A jornada de ${porId.get(colaboradorId).nome} neste periodo ja foi enviada. `
              + 'Solicite autorizacao do Departamento Pessoal para editar.',
              409
            );
          }
          autorizacoesUsadas.push(autorizacao.id);
        }
        linhasSubstituidas.push(existente.id);
      }
    }

    if (linhasSubstituidas.length) {
      await RhImportacaoLinha.update(
        { status: 'SUBSTITUIDA' },
        { where: { id: { [Op.in]: linhasSubstituidas } }, transaction }
      );
    }

    const importacao = await RhImportacao.create(
      {
        tipo: 'JORNADA',
        origem,
        competencia,
        etapa_pagamento: etapaPagamento,
        idempotency_key: idempotencyKey || null,
        periodicidade: periodo.periodicidade,
        periodo_inicio: periodo.inicio,
        periodo_fim: periodo.fim,
        empresa_grupo_id: dados.empresa_grupo_id || null,
        obra_id: obraId,
        tipo_vinculo: dados.tipo_vinculo || null,
        status: 'CONFIRMADA',
        nome_arquivo: origem === 'INDIVIDUAL'
          ? 'Pagamento individual'
          : (origem === 'PLANILHA' ? (dados.nome_arquivo || 'Planilha de jornada') : 'Formulario de jornada'),
        total_linhas: linhas.length,
        total_validas: linhas.length,
        total_erros: 0,
        resumo_json: envioHash ? {
          envio_hash: envioHash,
          ...(dados.gerencial_lote_hash ? { gerencial_lote_hash: dados.gerencial_lote_hash } : {})
        } : null,
        observacoes: dados.observacoes || null,
        criado_por: contexto.usuarioId || null,
        confirmado_por: contexto.usuarioId || null,
        confirmado_em: new Date()
      },
      { transaction }
    );

    const linhasGravadas = [];
    let numero = 0;

    for (const linha of linhas) {
      numero += 1;
      const colaboradorId = Number(linha.colaborador_id);

      const colaborador = porId.get(colaboradorId);
      const diariasAConsiderar = diariasExistentes.filter((existente) =>
        !linhasSubstituidas.includes(Number(existente.id)));
      const obrasDistribuicao = Array.from(obrasPorColaborador.get(colaboradorId) || []).sort((a, b) => a - b);
      // A distribuicao nao depende mais de uma marcacao manual da obra. O historico de lotacao e
      // a fonte confiavel: se o colaborador esteve vinculado a duas ou mais obras no periodo, cada
      // obra informa somente a sua parte e o DP consolida as jornadas depois.
      const marcouMultiplasObras = etapaPagamento !== 'DIARIA' && obrasDistribuicao.length > 1;
      const aprovacaoDistribuicao = marcouMultiplasObras
        ? (!Array.isArray(contexto.obraIds)
          || obrasDistribuicao.every((id) => contexto.obraIds.includes(id))
          ? 'AUTOMATICA_MESMO_RESPONSAVEL'
          : 'AGUARDANDO_RESPONSAVEIS')
        : 'NAO_APLICAVEL';
      const diasSelecionados = etapaPagamento === 'DIARIA'
        ? validarDiasDiaria(
          linha.dias_trabalhados_datas,
          diasDiariaElegiveis(colaborador, vinculosDaObra, historicos, periodo),
          diariasAConsiderar
            .filter((anterior) => Number(anterior.colaborador_id) === colaboradorId)
            .flatMap((anterior) => anterior.payload_json?.dias_trabalhados_datas || []),
          colaborador.nome,
          competencia
        ) : [];
      if (etapaPagamento === 'DIARIA' && diariasAConsiderar.some((anterior) =>
        Number(anterior.colaborador_id) === colaboradorId
        && !Array.isArray(anterior.payload_json?.dias_trabalhados_datas))) {
        throw new ValidationError(`${colaborador.nome}: ha diaria antiga sem datas; o DP deve conciliar esse historico antes de novo envio.`, 409);
      }
      const regimeVigente = regimePorId.get(colaboradorId)
        || (etapaPagamento === 'DIARIA'
          ? await rhCalculoHistoricoService.regimeNoPeriodo(
            colaborador, diasSelecionados[0], diasSelecionados[diasSelecionados.length - 1], transaction
          )
          : rhCalculoHistoricoService.resumo(colaborador));
      const formaCalculo = String(regimeVigente.forma_calculo || 'MENSAL').toUpperCase();
      if (modoGerencialV2 && etapaPagamento === 'DIARIA' && formaCalculo !== 'DIARIA') {
        throw new ValidationError(`${colaborador.nome}: as diarias exigem regime por diaria nos dias selecionados.`, 409);
      }
      const regimePagamento = String(linha.regime_pagamento || 'NORMAL').trim().toUpperCase();
      if (!['NORMAL', 'EMPREITADA'].includes(regimePagamento)) {
        throw new ValidationError(`${colaborador.nome}: regime de pagamento invalido.`);
      }
      const finaisSemanaFeriados = 0;
      const faltas = numeroNaoNegativo(linha.faltas, 'Faltas', colaboradorId);
      const periodoDecorrido = { ...periodo, fim: [periodo.fim, hojeLocal()].sort()[0] };
      const periodoDeCalculo = modoGerencialV2 && etapaPagamento !== 'DIARIA'
        ? { ...periodoDecorrido, fim: [periodoDecorrido.fim,
            regimePorId.get(colaboradorId)?.fim_mensal || periodoDecorrido.fim].sort()[0] }
        : periodoDecorrido;
      const limiteVinculo = diasVinculados(vinculosDaObra, colaborador, periodoDeCalculo);
      const dias = etapaPagamento === 'DIARIA'
        ? diasSelecionados.length
        : numeroNaoNegativo(linha.dias_trabalhados, 'Dias trabalhados', colaboradorId);
      if (modoGerencialV2 && (!Number.isInteger(dias) || dias <= 0)) {
        throw new ValidationError(`${colaborador.nome}: informe uma quantidade inteira e positiva de dias.`);
      }
      if (etapaPagamento === 'DIARIA' && linha.dias_trabalhados !== undefined
        && Number(linha.dias_trabalhados) !== dias) {
        throw new ValidationError(`${colaborador.nome}: a quantidade de diarias deve corresponder aos dias selecionados.`);
      }
      if (dias > limiteVinculo) {
        throw new ValidationError(`${colaborador.nome}: dias trabalhados nao podem ultrapassar ${limiteVinculo} dia(s) de vinculo nesta obra no periodo.`);
      }
      if (faltas > limiteVinculo) {
        throw new ValidationError(`${colaborador.nome}: faltas nao podem ultrapassar ${limiteVinculo} dia(s) de vinculo nesta obra no periodo.`);
      }

      if (dias > diasBase) {
        throw new ValidationError(
          `Dias trabalhados (${dias}) do colaborador #${colaboradorId} passam da base do periodo (${diasBase}).`
        );
      }
      if (etapaPagamento === 'DIARIA') {
        const anteriores = diariasAConsiderar.filter((existente) => (
          Number(existente.colaborador_id) === colaboradorId
          && Number(existente.importacao?.obra_id) === obraId
        ));
        const totalDias = anteriores.reduce((total, anterior) => (
          total + Number(anterior.payload_json?.dias_trabalhados || 0)
        ), dias);
        if (totalDias > diasVinculados(vinculosDaObra, colaborador, {
          ...limitesDaCompetencia(competencia),
          fim: [periodo.fim, hojeLocal()].sort()[0]
        })) {
          throw new ValidationError(`${colaborador.nome}: a soma das diarias enviadas ultrapassa os dias de vinculo nesta obra.`, 409);
        }
      }
      const adicionais = numeroNaoNegativo(linha.adicionais, 'Acrescimos', colaboradorId);
      const descontos = numeroNaoNegativo(linha.descontos, 'Descontos', colaboradorId);
      const observacoes = String(linha.observacoes || '').trim();
      if (regimePagamento === 'NORMAL' && formaCalculo === 'MENSAL' && (adicionais > 0 || descontos > 0) && !observacoes) {
        throw new ValidationError(`${colaborador.nome}: informe a observacao ao lancar acrescimo ou desconto.`);
      }
      const valorEmpreitada = numeroNaoNegativo(linha.valor_empreitada, 'Valor da empreitada', colaboradorId);
      const servicoExecutado = String(linha.servico_executado || '').trim();
      const pagamentoTitulo = pagamentoDoTituloDaJornada(
        linha, pagamentoPorId.get(colaboradorId), colaborador.nome
      );
      if (regimePagamento === 'EMPREITADA' && (!servicoExecutado || valorEmpreitada <= 0)) {
        throw new ValidationError(`${colaborador.nome}: informe o servico executado e o valor da empreitada.`);
      }

      // eslint-disable-next-line no-await-in-loop
      const gravada = await RhImportacaoLinha.create(
        {
          importacao_id: importacao.id,
          numero_linha: numero,
          colaborador_id: colaboradorId,
          matricula_ref: porId.get(colaboradorId).matricula || null,
          cpf_ref: porId.get(colaboradorId).cpf || null,
          nome_ref: porId.get(colaboradorId).nome || null,
          // CONFIRMADA e o status que a agregacao da apuracao le. Linha do formulario ja nasce
          // confirmada porque nao ha etapa de conferencia de arquivo para atravessar.
          status: 'CONFIRMADA',
          payload_json: {
            mais_de_uma_obra: marcouMultiplasObras,
            obras_distribuicao_ids: marcouMultiplasObras ? obrasDistribuicao : [obraId],
            aprovacao_distribuicao: aprovacaoDistribuicao,
            dias_trabalhados: dias,
            modo_gerencial_v2: modoGerencialV2,
            ...(etapaPagamento === 'DIARIA' ? { dias_trabalhados_datas: diasSelecionados } : {}),
            dias_corridos: limiteVinculo,
            finais_semana_feriados: finaisSemanaFeriados,
            faltas,
            // O campo antigo permanece apenas no historico. Novos formularios nao registram hora
            // extra, conforme a regra operacional atual.
            horas_extras: 0,
            /**
             * OS QUATRO ADICIONAIS SEPARADOS (Fase 12, item 11 do escopo).
             *
             * Nao e preciosismo: insalubridade e periculosidade sao percentuais de norma e NAO se
             * acumulam entre si; o noturno depende da hora; a bonificacao e liberalidade da
             * empresa. Somados num campo, a "planilha-resumo para conferencia" que o escopo pede
             * mostraria um numero unico que ninguem consegue contestar linha a linha.
             */
            adicional_noturno: numeroNaoNegativo(linha.adicional_noturno, 'Adicional noturno', colaboradorId),
            adicional_insalubridade: numeroNaoNegativo(linha.adicional_insalubridade, 'Adicional de insalubridade', colaboradorId),
            adicional_periculosidade: numeroNaoNegativo(linha.adicional_periculosidade, 'Adicional de periculosidade', colaboradorId),
            bonificacoes: numeroNaoNegativo(linha.bonificacoes, 'Bonificacoes', colaboradorId),
            // `adicionais` continua existindo para o que nao cabe nos quatro, e para os registros
            // gravados antes desta fase. Somar as cinco e trabalho do calculo, nao do schema.
            adicionais,
            descontos_informados: descontos,
            decimo_terceiro: numeroNaoNegativo(linha.decimo_terceiro, 'Decimo terceiro', colaboradorId),
            regime_pagamento: regimePagamento,
            servico_executado: regimePagamento === 'EMPREITADA' ? servicoExecutado : null,
            valor_empreitada: regimePagamento === 'EMPREITADA' ? valorEmpreitada : 0,
            valor_informado: regimePagamento === 'EMPREITADA'
              ? valorEmpreitada
              : formaCalculo === 'DIARIA'
              ? Number((dias * Number(regimeVigente.valor_diaria || 0)).toFixed(2))
              : numeroNaoNegativo(linha.valor_informado, 'Valor informado', colaboradorId),
            forma_calculo_gerencial: formaCalculo,
            valor_diaria: Number(regimeVigente.valor_diaria || 0),
            pagamento_automatico_40_60: Boolean(regimeVigente.pagamento_automatico_40_60),
            salario_base: Number(colaborador.salario_base || 0),
            valor_contratual: Number(colaborador.valor_contratual || 0),
            pagamento_titulo: pagamentoTitulo,
            observacoes: observacoes || null
          }
        },
        { transaction }
      );

      linhasGravadas.push(gravada);
    }

    if (autorizacoesUsadas.length) {
      await RhJornadaEdicao.update(
        { status: 'UTILIZADA', utilizada_em: new Date() },
        { where: { id: { [Op.in]: autorizacoesUsadas } }, transaction }
      );
    }

    const abertasDaObra = await RhSolicitacao.findAll({
      where: { tipo: 'JORNADA', obra_id: obraId, situacao: 'ABERTA' },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const existente = abertasDaObra.find((pedido) => {
      const detalhes = typeof pedido.dados_json === 'string'
        ? JSON.parse(pedido.dados_json)
        : (pedido.dados_json || {});
      return String(detalhes.competencia || '') === competencia
        && String(detalhes.periodo_inicio || '') === periodo.inicio
        && String(detalhes.periodo_fim || '') === periodo.fim;
    });
    const dadosSolicitacao = {
      importacao_id: importacao.id,
      modo_gerencial_v2: modoGerencialV2,
      competencia,
      etapa_pagamento: etapaPagamento,
      periodicidade: periodo.periodicidade,
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
      dias_base: diasBase,
      total_colaboradores: linhasGravadas.length,
      origem,
      observacoes: dados.observacoes || null
    };
    let solicitacao;
    if (existente && !etapaPagamento) {
      solicitacao = existente;
      await solicitacao.update({ dados_json: dadosSolicitacao }, { transaction });
      await RhSolicitacaoHistorico.create({
        solicitacao_id: solicitacao.id,
        usuario_id: contexto.usuarioId || null,
        setor: setorParaHistorico(contexto.setor) || null,
        acao: 'JORNADA_ATUALIZADA',
        descricao: `Jornada atualizada para ${competencia}, com ${linhasGravadas.length} colaborador(es).`,
        situacao_anterior: 'ABERTA',
        situacao_nova: 'ABERTA'
      }, { transaction });
    } else {
      solicitacao = await RhSolicitacao.create({
        tipo: 'JORNADA',
        situacao: 'ABERTA',
        obra_id: obraId,
        setor_origem: setorParaHistorico(contexto.setor) || null,
        dados_json: dadosSolicitacao,
        justificativa: dados.observacoes || null,
        criada_por: contexto.usuarioId || null
      }, { transaction });
      await garantirCodigoRhSolicitacao(solicitacao, transaction);
      await RhSolicitacaoHistorico.create({
        solicitacao_id: solicitacao.id,
        usuario_id: contexto.usuarioId || null,
        setor: setorParaHistorico(contexto.setor) || null,
        acao: 'ABERTURA',
        descricao: `Jornada enviada para ${competencia}, com ${linhasGravadas.length} colaborador(es).`,
        situacao_nova: 'ABERTA'
      }, { transaction });
    }

    return { importacao, linhas: linhasGravadas, solicitacao };
}

async function registrarJornada(dados = {}, contexto = {}) {
  return sequelize.transaction((transaction) => registrarJornadaEmTransacao(dados, contexto, transaction));
}

async function registrarJornadaGerencial(dados = {}, contexto = {}) {
  if (!gerencialV2Habilitado()) throw new ValidationError('O novo fluxo gerencial de jornada nao esta habilitado.', 409);
  const linhas = Array.isArray(dados.linhas) ? dados.linhas : [];
  if (!linhas.length) throw new ValidationError('Selecione ao menos um colaborador para enviar.');
  const vistos = new Set();
  const grupos = new Map();
  for (const linha of linhas) {
    const id = Number(linha.colaborador_id);
    const etapa = String(linha.intencao_pagamento || '').trim().toUpperCase();
    if (!id || vistos.has(id)) throw new ValidationError('Cada colaborador deve aparecer apenas uma vez no envio.');
    if (!ETAPAS_PAGAMENTO.has(etapa)) throw new ValidationError('Selecione o pagamento solicitado por colaborador.');
    vistos.add(id);
    if (!grupos.has(etapa)) grupos.set(etapa, []);
    grupos.get(etapa).push(linha);
  }
  const chave = String(dados.idempotency_key || '').trim();
  if (!/^[A-Za-z0-9-]{16,80}$/.test(chave)) throw new ValidationError('Identificador de envio invalido. Atualize a tela e tente novamente.');
  const loteHash = createHash('sha256').update(JSON.stringify({
    ...dados, idempotency_key: undefined, linhas
  })).digest('hex');
  return sequelize.transaction(async (transaction) => {
    // O lock vem ANTES da primeira leitura consistente da chave. Em isolamento
    // REPEATABLE READ, duas chamadas simultaneas nao podem montar snapshots
    // anteriores diferentes e registrar etapas disjuntas com a mesma chave.
    const obra = await Obra.findByPk(Number(dados.obra_id), {
      attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE
    });
    if (!obra) throw new ValidationError('Obra da jornada nao encontrada.', 404);
    const chavesPossiveis = [...ETAPAS_PAGAMENTO].map((etapa) =>
      createHash('sha256').update(`${chave}:${etapa}`).digest('hex'));
    const anteriores = await RhImportacao.findAll({
      where: { idempotency_key: { [Op.in]: chavesPossiveis } }, transaction
    });
    if (anteriores.some((item) => item.resumo_json?.gerencial_lote_hash !== loteHash)) {
      throw new ValidationError('Este identificador de envio ja foi usado com outros dados.', 409);
    }
    const resultados = [];
    for (const [etapa, linhasDaEtapa] of grupos) {
      // A chave por etapa torna o lote inteiro repetivel sem duplicar solicitacoes.
      const idempotencyKey = createHash('sha256').update(`${chave}:${etapa}`).digest('hex');
      // eslint-disable-next-line no-await-in-loop
      const resultado = await registrarJornadaEmTransacao({
        ...dados, modo_gerencial_v2: true, etapa_pagamento: etapa,
        idempotency_key: idempotencyKey, gerencial_lote_hash: loteHash, linhas: linhasDaEtapa
      }, contexto, transaction);
      resultados.push(resultado);
    }
    return { solicitacoes: resultados.map((item) => item.solicitacao), resultados,
      repetido: resultados.every((item) => item.repetido) };
  });
}

/**
 * O pagamento individual: o mesmo caminho, com uma linha so.
 *
 * Existe como funcao propria para a tela ter um verbo claro — nao para ter regra propria. Toda a
 * validacao e a gravacao sao as mesmas.
 */
async function registrarPagamentoIndividual(dados = {}, contexto = {}) {
  return registrarJornada(
    {
      ...dados,
      origem: 'INDIVIDUAL',
      linhas: [{
        colaborador_id: dados.colaborador_id,
        dias_trabalhados: dados.dias_trabalhados,
        dias_trabalhados_datas: dados.dias_trabalhados_datas,
        substituir_importacao_linha_id: dados.substituir_importacao_linha_id,
        chave_pix_titulo: dados.chave_pix_titulo,
        favorecido_pix_nome: dados.favorecido_pix_nome,
        favorecido_pix_cpf: dados.favorecido_pix_cpf,
        faltas: dados.faltas,
        finais_semana_feriados: dados.finais_semana_feriados,
        adicional_noturno: dados.adicional_noturno,
        adicional_insalubridade: dados.adicional_insalubridade,
        adicional_periculosidade: dados.adicional_periculosidade,
        bonificacoes: dados.bonificacoes,
        adicionais: dados.adicionais,
        descontos: dados.descontos,
        valor_informado: dados.valor_informado,
        observacoes: dados.observacoes
      }]
    },
    contexto
  );
}

/**
 * A lista que o formulario abre: quem estava na obra na competencia, com o que ja foi informado.
 *
 * Vem do VINCULO, nao de `rh_colaboradores.obra_id`: a folha de um mes passado tem de listar quem
 * estava la NAQUELE mes, e nao quem esta la hoje.
 */
async function colaboradoresParaJornada(obraId, competencia, filtros = {}) {
  if (!competenciaValida(competencia)) {
    throw new ValidationError(`A competencia deve estar no formato AAAA-MM (recebi "${competencia}").`);
  }

  const etapaPagamento = String(filtros.etapa_pagamento || '').trim().toUpperCase() || null;
  if (filtros.modo_gerencial_v2 === true && !gerencialV2Habilitado()) {
    throw new ValidationError('O novo fluxo gerencial de jornada nao esta habilitado.', 409);
  }
  if (etapaPagamento === 'PROPORCIONAL' && filtros.modo_gerencial_v2 !== true) {
    throw new ValidationError('Pagamento proporcional disponivel somente no fluxo gerencial.', 409);
  }
  if (etapaPagamento && (!etapasHabilitadas() || !ETAPAS_PAGAMENTO.has(etapaPagamento))) {
    throw new ValidationError('A etapa de pagamento da jornada nao esta habilitada ou e invalida.', 409);
  }
  const periodo = normalizarPeriodo(filtros, competencia, etapaPagamento);

  const vinculos = await rhVinculoObraService.colaboradoresDaObraEm(obraId, periodo.inicio, periodo.fim);

  const colaboradoresDoPeriodo = [...new Set(
    vinculos.map((vinculo) => Number(vinculo.colaborador_id)).filter(Boolean)
  )];
  const pagamentosDoPeriodo = colaboradoresDoPeriodo.length
    ? await RhColaboradorPagamento.findAll({ where: { colaborador_id: { [Op.in]: colaboradoresDoPeriodo } } })
    : [];
  const pagamentoPorId = new Map(pagamentosDoPeriodo.map((item) => [Number(item.colaborador_id), item]));
  const todosVinculosDoPeriodo = colaboradoresDoPeriodo.length
    ? await RhColaboradorVinculo.findAll({
        where: {
          colaborador_id: { [Op.in]: colaboradoresDoPeriodo },
          obra_id: { [Op.ne]: null },
          vigencia_inicio: { [Op.lte]: periodo.fim },
          [Op.or]: [{ vigencia_fim: null }, { vigencia_fim: { [Op.gte]: periodo.inicio } }]
        },
        attributes: ['colaborador_id', 'obra_id'],
        include: [{ model: Obra, as: 'obra', attributes: ['id', 'codigo', 'nome'], required: false }],
        order: [['colaborador_id', 'ASC'], ['obra_id', 'ASC']]
      })
    : [];
  const obrasPorColaborador = new Map();
  todosVinculosDoPeriodo.forEach((vinculo) => {
    const colaboradorId = Number(vinculo.colaborador_id);
    if (!obrasPorColaborador.has(colaboradorId)) obrasPorColaborador.set(colaboradorId, new Map());
    obrasPorColaborador.get(colaboradorId).set(Number(vinculo.obra_id), {
      id: Number(vinculo.obra_id),
      codigo: vinculo.obra?.codigo || null,
      nome: vinculo.obra?.nome || `Obra #${vinculo.obra_id}`
    });
  });

  /**
   * QUEM AINDA NAO COMECOU TAMBEM APARECE — desligado, com a data (26/08).
   *
   * 19 dos 137 colaboradores tem admissao programada para o futuro. Quem acabou de lotar um deles
   * numa obra abre a jornada do mes corrente e recebe "nenhum colaborador esteve nesta obra nesta
   * competencia". A resposta esta CERTA — ele nao foi admitido ainda —, mas quem acabou de fazer a
   * lotacao conclui que ela nao funcionou.
   *
   * Entao eles vem na lista, marcados com `ainda_nao_comecou` e a data de inicio. A tela mostra a
   * linha sem campos: da para ver que a lotacao existe, e da para ver que nao e para este mes.
   *
   * Eles NAO podem ser enviados: `registrarJornada` recusa quem nao esteve na obra na competencia,
   * e listar sem marcar seria oferecer uma linha que o servidor vai rejeitar.
   */
  const futuros = await RhColaboradorVinculo.findAll({
    where: { obra_id: obraId, vigencia_inicio: { [Op.gt]: periodo.fim } },
    order: [['vigencia_inicio', 'ASC']],
    include: [{ association: 'colaborador', required: true }]
  });

  const confirmadas = await linhasConfirmadasDaCompetencia(obraId, competencia);
  const historicos = etapaPagamento === 'DIARIA'
    ? await historicosDeCalculo(colaboradoresDoPeriodo) : [];
  const diariasAnteriores = etapaPagamento === 'DIARIA'
    ? await linhasDiariasDaCompetencia(colaboradoresDoPeriodo, competencia) : [];
  const edicoesDiaria = diariasAnteriores.length ? await RhJornadaEdicao.findAll({
    where: {
      importacao_linha_id: { [Op.in]: diariasAnteriores.map((linha) => linha.id) },
      status: { [Op.in]: ['PENDENTE', 'AUTORIZADA'] }
    }, order: [['id', 'DESC']]
  }) : [];
  const edicaoDiariaPorColaborador = new Map();
  edicoesDiaria.forEach((edicao) => {
    const linha = diariasAnteriores.find((item) => Number(item.id) === Number(edicao.importacao_linha_id));
    if (linha && Number(linha.importacao?.obra_id) === Number(obraId)
      && !edicaoDiariaPorColaborador.has(Number(linha.colaborador_id))) {
      edicaoDiariaPorColaborador.set(Number(linha.colaborador_id), { linha, edicao });
    }
  });
  const diasJaInformadosPorId = new Map();
  diariasAnteriores.forEach((linha) => {
    const id = Number(linha.colaborador_id);
    if (!diasJaInformadosPorId.has(id)) diasJaInformadosPorId.set(id, new Set());
    (linha.payload_json?.dias_trabalhados_datas || []).forEach((dia) => diasJaInformadosPorId.get(id).add(dia));
  });
  const jaInformado = confirmadas.filter((linha) => (
    mesmoPeriodo(periodo, periodoDaImportacao(linha.importacao))
    && (!etapaPagamento || linha.importacao.etapa_pagamento === etapaPagamento)
    && etapaPagamento !== 'DIARIA'
  ));
  const idsLinhas = jaInformado.map((linha) => Number(linha.id));
  const solicitacoesEdicao = idsLinhas.length ? await RhJornadaEdicao.findAll({
    where: { importacao_linha_id: { [Op.in]: idsLinhas } },
    order: [['id', 'DESC']]
  }) : [];
  const edicaoPorLinha = new Map();
  solicitacoesEdicao.forEach((item) => {
    const linhaId = Number(item.importacao_linha_id);
    if (!edicaoPorLinha.has(linhaId)) edicaoPorLinha.set(linhaId, item);
  });

  const porColaborador = new Map(
    jaInformado.map((linha) => [Number(linha.colaborador_id), {
      linha,
      edicao: edicaoPorLinha.get(Number(linha.id)) || null
    }])
  );

  const regimesPorId = new Map();
  const conversoesPorId = new Map();
  for (const vinculo of vinculos) {
    if (!vinculo.colaborador || regimesPorId.has(Number(vinculo.colaborador_id))) continue;
    if (!etapaPagamento || etapaPagamento === 'DIARIA') continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      const conversao = filtros.modo_gerencial_v2 === true
        ? await rhCalculoHistoricoService.conversaoMensalParaDiariaNaCompetencia(
          Number(vinculo.colaborador_id), competencia
        ) : null;
      if (conversao) conversoesPorId.set(Number(vinculo.colaborador_id), conversao);
      const inicioRegime = filtros.modo_gerencial_v2 === true
        ? [periodo.inicio, String(conversao?.inicio_mensal
            || vinculo.colaborador.data_admissao || vinculo.colaborador.data_inicio || periodo.inicio).slice(0, 10)].sort().at(-1)
        : periodo.inicio;
      const fimRegime = conversao?.fim_mensal || periodo.fim;
      // eslint-disable-next-line no-await-in-loop
      const regime = await rhCalculoHistoricoService.regimeNoPeriodo(
        vinculo.colaborador, inicioRegime, fimRegime
      );
      regimesPorId.set(Number(vinculo.colaborador_id), regime);
    } catch (error) {
      regimesPorId.set(Number(vinculo.colaborador_id), { em_transicao: true, erro: error.message });
    }
  }

  const linhaDe = (vinculo, extras = {}) => {
    const diariaParaRetorno = etapaPagamento === 'DIARIA'
      ? edicaoDiariaPorColaborador.get(Number(vinculo.colaborador_id)) : null;
    const diasElegiveis = etapaPagamento === 'DIARIA'
      ? diasDiariaElegiveis(vinculo.colaborador, vinculos, historicos, periodo) : [];
    const primeiroDia = diasElegiveis[0];
    const historicoDiaria = primeiroDia && historicos.find((item) =>
      Number(item.colaborador_id) === Number(vinculo.colaborador_id)
      && String(item.vigencia_inicio).slice(0, 10) <= primeiroDia
      && (!item.vigencia_fim || String(item.vigencia_fim).slice(0, 10) >= primeiroDia));
    return ({
    colaborador_id: Number(vinculo.colaborador_id),
    nome: vinculo.colaborador.nome,
    matricula: vinculo.colaborador.matricula,
    cpf: vinculo.colaborador.cpf,
    status: vinculo.colaborador.status,
    empresa_grupo_id: vinculo.colaborador.empresa_grupo_id,
    cargo: vinculo.colaborador.cargo,
    tipo_vinculo: vinculo.colaborador.tipo_vinculo,
    salario_base: vinculo.colaborador.salario_base,
    forma_calculo_gerencial: etapaPagamento === 'DIARIA' && diasElegiveis.length
      ? 'DIARIA'
      : regimesPorId.get(Number(vinculo.colaborador_id))?.forma_calculo
      || vinculo.colaborador.forma_calculo_gerencial || 'MENSAL',
    valor_diaria: historicoDiaria?.valor_diaria
      ?? regimesPorId.get(Number(vinculo.colaborador_id))?.valor_diaria
      ?? vinculo.colaborador.valor_diaria,
    pix_titulo: {
      chave_pix: [
        pagamentoPorId.get(Number(vinculo.colaborador_id))?.chave_pix,
        pagamentoPorId.get(Number(vinculo.colaborador_id))?.chave_pix_secundaria,
        pagamentoPorId.get(Number(vinculo.colaborador_id))?.chave_pix_variavel
      ].map((valor) => String(valor || '').trim()).find(Boolean) || '',
      favorecido_nome: pagamentoPorId.get(Number(vinculo.colaborador_id))?.favorecido_nome || vinculo.colaborador.nome,
      favorecido_cpf: pagamentoPorId.get(Number(vinculo.colaborador_id))?.favorecido_documento || vinculo.colaborador.cpf
    },
    pagamento_automatico_40_60: regimesPorId.get(Number(vinculo.colaborador_id))?.pagamento_automatico_40_60
      ?? Boolean(vinculo.colaborador.pagamento_automatico_40_60),
    regime_em_transicao: Boolean(regimesPorId.get(Number(vinculo.colaborador_id))?.em_transicao),
    regime_erro: regimesPorId.get(Number(vinculo.colaborador_id))?.erro || null,
    conversao_mensal_diaria: conversoesPorId.get(Number(vinculo.colaborador_id)) || null,
    limite_dias_mensais: conversoesPorId.has(Number(vinculo.colaborador_id))
      ? diasVinculados(vinculos, vinculo.colaborador, {
        ...periodo,
        fim: [conversoesPorId.get(Number(vinculo.colaborador_id)).fim_mensal, hojeLocal()].sort()[0]
      }) : null,
    dias_diaria_elegiveis: diasElegiveis,
    dias_diaria_ja_informados: etapaPagamento === 'DIARIA'
      ? Array.from(diasJaInformadosPorId.get(Number(vinculo.colaborador_id)) || [])
          .filter((dia) => diariaParaRetorno?.edicao.status !== 'AUTORIZADA'
            || !(diariaParaRetorno.linha.payload_json?.dias_trabalhados_datas || []).includes(dia)) : [],
    jornada_informada: diariaParaRetorno?.linha.payload_json
      || porColaborador.get(Number(vinculo.colaborador_id))?.linha?.payload_json || null,
    jornada_linha_id: diariaParaRetorno?.linha.id
      || porColaborador.get(Number(vinculo.colaborador_id))?.linha?.id || null,
    edicao_jornada: diariaParaRetorno?.edicao
      || porColaborador.get(Number(vinculo.colaborador_id))?.edicao || null,
    periodo_jornada: periodo,
    dias_vinculados: diasVinculados(vinculos, vinculo.colaborador, {
      ...periodo, fim: [periodo.fim, hojeLocal()].sort()[0]
    }),
    obras_vinculadas_periodo: Array.from(
      obrasPorColaborador.get(Number(vinculo.colaborador_id))?.values() || []
    ),
    total_obras_periodo: obrasPorColaborador.get(Number(vinculo.colaborador_id))?.size || 1,
    mais_de_uma_obra: (obrasPorColaborador.get(Number(vinculo.colaborador_id))?.size || 1) > 1,
    ainda_nao_comecou: false,
    comeca_em: null,
    ...extras
    });
  };

  const linhasUnicas = new Map();
  for (const linha of [
    ...Array.from(new Map(vinculos.filter((v) => v.colaborador).map((v) => [Number(v.colaborador_id), v])).values()).map((v) => linhaDe(v)),
    ...futuros.filter((v) => v.colaborador).map((v) => linhaDe(v, {
      ainda_nao_comecou: true,
      comeca_em: paraDataIso(v.vigencia_inicio)
    }))
  ]) {
    if (!linhasUnicas.has(linha.colaborador_id)) linhasUnicas.set(linha.colaborador_id, linha);
  }
  return [...linhasUnicas.values()];
}

async function solicitarEdicaoJornada(dados = {}, contexto = {}) {
  return sequelize.transaction(async (transaction) => {
    const linhaId = Number(dados.importacao_linha_id);
    if (!linhaId) throw new ValidationError('Informe a jornada que precisa ser editada.');
    const motivo = String(dados.motivo || '').trim();
    if (motivo.length < 5) throw new ValidationError('Informe o motivo da edicao com ao menos 5 caracteres.');

    const linha = await RhImportacaoLinha.findByPk(linhaId, {
      include: [{ association: 'importacao', required: true }],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!linha || linha.status !== 'CONFIRMADA' || linha.importacao?.status !== 'CONFIRMADA') {
      throw new ValidationError('Esta jornada nao esta mais disponivel para edicao.', 409);
    }
    if (linha.importacao?.tipo !== 'JORNADA') {
      throw new ValidationError('A linha informada nao pertence a uma jornada.', 409);
    }
    const obraId = Number(linha.importacao.obra_id);
    if (Array.isArray(contexto.obraIds) && !contexto.obraIds.includes(obraId)) {
      throw new ValidationError('Acesso negado: a obra nao esta vinculada ao usuario.', 403);
    }

    const existente = await RhJornadaEdicao.findOne({
      where: { importacao_linha_id: linha.id, status: { [Op.in]: ['PENDENTE', 'AUTORIZADA'] } },
      order: [['id', 'DESC']],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (existente) return existente;

    const periodo = periodoDaImportacao(linha.importacao);
    return RhJornadaEdicao.create({
      importacao_linha_id: linha.id,
      obra_id: obraId,
      colaborador_id: Number(linha.colaborador_id),
      competencia: linha.importacao.competencia,
      periodicidade: periodo.periodicidade,
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
      status: 'PENDENTE',
      motivo,
      solicitada_por: contexto.usuarioId,
      solicitada_em: new Date()
    }, { transaction });
  });
}

async function decidirEdicaoJornada(id, decisao = {}, contexto = {}) {
  return sequelize.transaction(async (transaction) => {
    const solicitacao = await RhJornadaEdicao.findByPk(Number(id), {
      include: [{ association: 'linhaOriginal', required: true }],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!solicitacao) throw new ValidationError('Solicitacao de edicao nao encontrada.', 404);
    if (solicitacao.status !== 'PENDENTE') {
      throw new ValidationError('Esta solicitacao de edicao ja foi decidida.', 409);
    }
    if (solicitacao.linhaOriginal?.status !== 'CONFIRMADA') {
      throw new ValidationError('A jornada original ja foi substituida.', 409);
    }

    const aprovar = Boolean(decisao.aprovar);
    if (aprovar) {
      const linhaOriginal = await RhImportacaoLinha.findByPk(solicitacao.importacao_linha_id, {
        attributes: ['id', 'importacao_id', 'colaborador_id'], transaction
      });
      const eventos = await RhApuracaoEvento.findAll({
        where: { colaborador_id: solicitacao.colaborador_id },
        include: [{ model: RhApuracao, as: 'apuracao', required: true,
          where: { competencia: solicitacao.competencia },
          include: [{ model: RhFechamento, as: 'fechamentoRh', required: false,
            where: { status: 'FECHADO' } }] }], transaction
      });
      const afetadas = [...new Map(eventos.filter((evento) =>
        (evento.detalhes_json?.importacao_ids || []).map(Number).includes(Number(linhaOriginal?.importacao_id)))
        .map((evento) => [Number(evento.apuracao_id), evento.apuracao])).values()];
      if (afetadas.some((apuracao) => apuracao.fechamentoRh || apuracao.status === 'FECHADA')) {
        throw new ValidationError('Esta jornada ja gerou titulo. Estorne o fechamento e as baixas financeiras antes de autorizar o retorno.', 409);
      }
      for (const apuracao of afetadas.filter((item) => item.status === 'CONFERIDA')) {
        // eslint-disable-next-line no-await-in-loop
        await RhApuracaoEvento.update({ status: 'PENDENTE' }, {
          where: { apuracao_id: apuracao.id }, transaction
        });
        // eslint-disable-next-line no-await-in-loop
        await apuracao.update({
          status: 'RASCUNHO',
          observacoes: [apuracao.observacoes,
            `[${new Date().toISOString()}] Reaberta pelo DP para retorno da jornada #${solicitacao.importacao_linha_id}; usuario #${contexto.usuarioId}.`]
            .filter(Boolean).join('\n'),
          resumo_json: {
            ...(apuracao.resumo_json || {}),
            itens_conferidos: 0,
            itens_pendentes: Number(apuracao.total_colaboradores || 0)
          },
          atualizado_por: contexto.usuarioId || null
        }, { transaction });
      }
    }
    await solicitacao.update({
      status: aprovar ? 'AUTORIZADA' : 'NEGADA',
      motivo_decisao: String(decisao.motivo || '').trim() || null,
      decidida_por: contexto.usuarioId,
      decidida_em: new Date()
    }, { transaction });
    return solicitacao;
  });
}

async function listarEdicoesJornadaPendentes() {
  return RhJornadaEdicao.findAll({
    where: { status: 'PENDENTE' },
    include: [
      { association: 'obra', attributes: ['id', 'codigo', 'nome'] },
      { association: 'colaborador', attributes: ['id', 'nome', 'matricula'] },
      { association: 'solicitadaPor', attributes: ['id', 'nome', 'email'] }
    ],
    order: [['solicitada_em', 'ASC'], ['id', 'ASC']]
  });
}

async function exigirJornadasSemRetornoPendente(importacaoIds, transaction, validarFontes = false) {
  const ids = [...new Set((importacaoIds || []).map(Number).filter(Boolean))];
  if (!ids.length) return;
  const linhas = await RhImportacaoLinha.findAll({
    where: { importacao_id: { [Op.in]: ids }, ...(validarFontes ? {} : { status: 'CONFIRMADA' }) },
    attributes: ['id', 'status'], transaction
  });
  if (!linhas.length) return;
  if (validarFontes && linhas.some((linha) => linha.status === 'SUBSTITUIDA')) {
    throw new ValidationError('A jornada da apuracao foi corrigida. Regenere a apuracao antes de conferir ou gerar titulos.', 409);
  }
  const retorno = await RhJornadaEdicao.findOne({
    where: {
      importacao_linha_id: { [Op.in]: linhas.map((linha) => linha.id) },
      status: { [Op.in]: ['PENDENTE', 'AUTORIZADA'] }
    },
    attributes: ['id', 'competencia'], transaction
  });
  if (retorno) {
    throw new ValidationError(
      `A jornada possui retorno para correcao #${retorno.id} pendente ou autorizado. `
      + 'Aguarde a decisao ou o novo envio antes de apurar, conferir ou gerar titulos.', 409
    );
  }
}

module.exports = {
  ORIGENS,
  competenciaValida,
  limitesDaCompetencia,
  normalizarPeriodo,
  registrarJornada,
  registrarJornadaGerencial,
  registrarPagamentoIndividual,
  colaboradoresParaJornada,
  solicitarEdicaoJornada,
  decidirEdicaoJornada,
  listarEdicoesJornadaPendentes,
  exigirJornadasSemRetornoPendente
};

if (process.env.NODE_ENV === 'test') {
  module.exports.__test = { datasNoPeriodo, diasDiariaElegiveis, validarDiasDiaria, pagamentoDoTituloDaJornada };
}
