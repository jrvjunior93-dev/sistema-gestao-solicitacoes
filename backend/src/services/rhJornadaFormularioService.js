'use strict';

const { Op } = require('sequelize');
const {
  RhImportacao,
  RhImportacaoLinha,
  RhJornadaEdicao,
  RhColaborador,
  RhColaboradorVinculo,
  RhSolicitacao,
  RhSolicitacaoHistorico,
  Obra,
  sequelize
} = require('../models');
const { ValidationError } = require('../middlewares/validation');
const rhVinculoObraService = require('./rhVinculoObraService');
const { diasVinculados } = require('./rhPessoalDomain');
const { setorParaHistorico } = require('../utils/codigoDoSetor');
const { garantirCodigoRhSolicitacao } = require('./rhSolicitacaoCodigoService');

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

function normalizarPeriodo(dados, competencia) {
  const periodicidade = String(dados.periodicidade || 'MENSAL').trim().toUpperCase();
  if (!PERIODICIDADES.has(periodicidade)) {
    throw new ValidationError('Informe a periodicidade: semanal, quinzenal ou mensal.');
  }

  const limites = limitesDaCompetencia(competencia);
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

async function linhasConfirmadasDaCompetencia(obraId, competencia, transaction = undefined) {
  return RhImportacaoLinha.findAll({
    where: { status: 'CONFIRMADA' },
    include: [{
      association: 'importacao',
      required: true,
      attributes: ['id', 'competencia', 'periodicidade', 'periodo_inicio', 'periodo_fim', 'status'],
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
async function registrarJornada(dados = {}, contexto = {}) {
  return sequelize.transaction(async (transaction) => {
    const competencia = String(dados.competencia || '').trim();
    if (!competenciaValida(competencia)) {
      throw new ValidationError(`A competencia deve estar no formato AAAA-MM (recebi "${dados.competencia}").`);
    }

    const obraId = Number(dados.obra_id);
    if (!obraId) throw new ValidationError('Informe a obra da jornada.');

    const periodo = normalizarPeriodo(dados, competencia);

    // Serializa os envios da mesma obra para impedir dois cliques simultaneos de gravarem o mesmo
    // colaborador e periodo antes de um deles enxergar o outro.
    const obra = await Obra.findByPk(obraId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!obra) throw new ValidationError('Obra da jornada nao encontrada.', 404);

    const linhas = Array.isArray(dados.linhas) ? dados.linhas : [];
    if (!linhas.length) throw new ValidationError('Informe ao menos um colaborador na jornada.');

    const origem = ORIGENS.has(String(dados.origem || '').toUpperCase())
      ? String(dados.origem).toUpperCase()
      : 'FORMULARIO';

    const diasBase = Number(dados.dias_base || 30);
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

    for (const id of vistos) {
      if (!porId.has(id)) throw new ValidationError(`Colaborador #${id} nao encontrado.`, 404);
    }

    const vinculosDistribuicao = await RhColaboradorVinculo.findAll({
      where: {
        colaborador_id: { [Op.in]: Array.from(vistos) },
        obra_id: { [Op.ne]: null },
        vigencia_inicio: { [Op.lte]: periodo.fim },
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
    const linhasSubstituidas = [];
    const autorizacoesUsadas = [];

    for (const linha of linhas) {
      const colaboradorId = Number(linha.colaborador_id);
      const sobrepostas = existentes.filter((existente) => (
        Number(existente.colaborador_id) === colaboradorId
        && periodosSobrepostos(periodo, periodoDaImportacao(existente.importacao))
      ));
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
      const obrasDistribuicao = Array.from(obrasPorColaborador.get(colaboradorId) || []).sort((a, b) => a - b);
      const marcouMultiplasObras = Boolean(linha.mais_de_uma_obra);
      if (marcouMultiplasObras && obrasDistribuicao.length < 2) {
        throw new ValidationError(
          `${colaborador.nome} foi marcado em mais de uma obra, mas possui somente uma lotacao no periodo.`
        );
      }
      const aprovacaoDistribuicao = marcouMultiplasObras
        ? (!Array.isArray(contexto.obraIds)
          || obrasDistribuicao.every((id) => contexto.obraIds.includes(id))
          ? 'AUTOMATICA_MESMO_RESPONSAVEL'
          : 'AGUARDANDO_RESPONSAVEIS')
        : 'NAO_APLICAVEL';
      const formaCalculo = String(colaborador.forma_calculo_gerencial || 'MENSAL').toUpperCase();
      const finaisSemanaFeriados = numeroNaoNegativo(
        linha.finais_semana_feriados,
        'Finais de semana e feriados',
        colaboradorId
      );
      const faltas = numeroNaoNegativo(linha.faltas, 'Faltas', colaboradorId);
      const limiteVinculo = diasVinculados(vinculosDaObra, colaborador, periodo);
      if (finaisSemanaFeriados + faltas > limiteVinculo) {
        throw new ValidationError(
          `${colaborador.nome}: finais de semana/feriados mais faltas nao podem ultrapassar `
          + `${limiteVinculo} dia(s) de vinculo no periodo.`
        );
      }
      const dias = formaCalculo === 'DIARIA'
        ? Math.max(0, limiteVinculo - finaisSemanaFeriados - faltas)
        : numeroNaoNegativo(linha.dias_trabalhados, 'Dias trabalhados', colaboradorId);
      if (dias + faltas > limiteVinculo) {
        throw new ValidationError(`${colaborador.nome}: dias trabalhados mais faltas nao podem ultrapassar ${limiteVinculo} dia(s) de vinculo nesta obra no periodo.`);
      }

      if (dias > diasBase) {
        throw new ValidationError(
          `Dias trabalhados (${dias}) do colaborador #${colaboradorId} passam da base do periodo (${diasBase}).`
        );
      }
      if (dias + faltas > diasBase) {
        throw new ValidationError(
          `Dias trabalhados (${dias}) mais faltas (${faltas}) do colaborador #${colaboradorId} `
          + `passam da base do periodo (${diasBase}).`
        );
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
            adicionais: numeroNaoNegativo(linha.adicionais, 'Acrescimos', colaboradorId),
            descontos_informados: numeroNaoNegativo(linha.descontos, 'Descontos', colaboradorId),
            valor_informado: formaCalculo === 'DIARIA'
              ? Number((dias * Number(colaborador.valor_diaria || 0)).toFixed(2))
              : numeroNaoNegativo(linha.valor_informado, 'Valor informado', colaboradorId),
            forma_calculo_gerencial: formaCalculo,
            valor_diaria: Number(colaborador.valor_diaria || 0),
            observacoes: linha.observacoes || null
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
      competencia,
      periodicidade: periodo.periodicidade,
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
      dias_base: diasBase,
      total_colaboradores: linhasGravadas.length,
      origem,
      observacoes: dados.observacoes || null
    };
    let solicitacao;
    if (existente) {
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

  const periodo = normalizarPeriodo(filtros, competencia);

  const vinculos = await rhVinculoObraService.colaboradoresDaObraEm(obraId, periodo.inicio, periodo.fim);

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
  const jaInformado = confirmadas.filter(
    (linha) => mesmoPeriodo(periodo, periodoDaImportacao(linha.importacao))
  );
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

  const linhaDe = (vinculo, extras = {}) => ({
    colaborador_id: Number(vinculo.colaborador_id),
    nome: vinculo.colaborador.nome,
    matricula: vinculo.colaborador.matricula,
    cpf: vinculo.colaborador.cpf,
    status: vinculo.colaborador.status,
    tipo_vinculo: vinculo.colaborador.tipo_vinculo,
    salario_base: vinculo.colaborador.salario_base,
    forma_calculo_gerencial: vinculo.colaborador.forma_calculo_gerencial || 'MENSAL',
    valor_diaria: vinculo.colaborador.valor_diaria,
    pagamento_automatico_40_60: Boolean(vinculo.colaborador.pagamento_automatico_40_60),
    jornada_informada: porColaborador.get(Number(vinculo.colaborador_id))?.linha?.payload_json || null,
    jornada_linha_id: porColaborador.get(Number(vinculo.colaborador_id))?.linha?.id || null,
    edicao_jornada: porColaborador.get(Number(vinculo.colaborador_id))?.edicao || null,
    periodo_jornada: periodo,
    dias_vinculados: diasVinculados(vinculos, vinculo.colaborador, periodo),
    ainda_nao_comecou: false,
    comeca_em: null,
    ...extras
  });

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

module.exports = {
  ORIGENS,
  competenciaValida,
  limitesDaCompetencia,
  normalizarPeriodo,
  registrarJornada,
  registrarPagamentoIndividual,
  colaboradoresParaJornada,
  solicitarEdicaoJornada,
  decidirEdicaoJornada,
  listarEdicoesJornadaPendentes
};
