'use strict';

const { Op } = require('sequelize');
const {
  RhSolicitacao,
  RhSolicitacaoHistorico,
  RhSolicitacaoAnexo,
  RhDocumento,
  RhDocumentoTipo,
  RhColaborador,
  Obra,
  RhCargo,
  RhSolicitacaoChecklist,
  User,
  sequelize
} = require('../models');
const { ValidationError } = require('../middlewares/validation');
const { setorParaHistorico } = require('../utils/codigoDoSetor');
const rhVinculoObraService = require('./rhVinculoObraService');
const { uploadToS3 } = require('./s3');
const { normalizeOriginalName } = require('../utils/fileName');

/**
 * O PEDIDO DE PESSOAL: a Obra pede, o DP decide (Fase 2 do modulo DP, 25/08).
 *
 * Maquina de estados curta de proposito:
 *
 *   ABERTA --aprovar--> APROVADA   (produz efeito no cadastro e no vinculo)
 *          --rejeitar-> REJEITADA  (volta para o setor de quem criou)
 *          --cancelar-> CANCELADA  (so quem abriu, e so enquanto esta aberta)
 *
 *   REJEITADA --reenviar--> ABERTA (depois de corrigir)
 *
 * O que este servico herda do lote de contratos, sem herdar a tabela:
 *
 * - a devolucao volta ao SETOR DE QUEM CRIOU (itens 24/30), e nao a um setor fixo;
 * - o historico grava o setor como TEXTO, por `setorParaHistorico` — em 24/08 o historico do
 *   contrato gravou `[object Object]` em 23 linhas porque o setor chegava como a associacao do
 *   Sequelize;
 * - decidir e IDEMPOTENTE por recusa explicita: pedido ja decidido nao decide de novo. Sem isso,
 *   aprovar duas vezes uma admissao criaria dois colaboradores.
 *
 * O EFEITO da aprovacao e o coracao da fase, e esta em `aplicarEfeito`. Ele e o unico lugar do
 * sistema que cria colaborador a partir de pedido, e o unico que fecha vinculo por demissao.
 */

const { checklistDoPedido } = require('./rhChecklistService');

const TIPOS = new Set([
  'ADMISSAO',
  'DEMISSAO',
  'MOVIMENTACAO',
  'PAGAMENTO_MAO_DE_OBRA',
  'EVENTO_RECORRENTE',
  // LEGADOS (Fase 10, 27/08). O cliente definiu que "Troca de Obra e Alteracao de Salario entra na
  // lista de movimentacoes possiveis" — as duas viraram SUBTIPO de MOVIMENTACAO e sairam da coluna
  // de acoes. Ficam aceitas aqui porque ha registros gravados com elas; a tela nao as oferece mais.
  'TROCA_OBRA',
  'ALTERACAO_SALARIAL'
]);

/**
 * Os subtipos de MOVIMENTACAO, na ordem do item 9 do escopo.
 *
 * Dois deles APONTAM PARA EFEITO QUE JA EXISTE (ver `efeitoDoPedido`): transferencia de obra e
 * alteracao salarial ja eram tipos de primeiro nivel, com efeito provado pelas suites 49 e 54.
 * Absorve-los como subtipo reaproveita esse efeito em vez de escrever uma segunda versao dele.
 */
const SUBTIPOS_MOVIMENTACAO = new Set([
  'ATESTADO',
  'FERIAS',
  'RETORNO_AFASTAMENTO',
  'ALTERACAO_SALARIAL',
  'ALTERACAO_CARGO',
  'TRANSFERENCIA_OBRA'
]);

/**
 * O MOTIVO do desligamento e o SUBTIPO da demissao.
 *
 * Nao e economia de coluna: e o motivo que mexe na papelada. O escopo pede que "pedido de demissao"
 * exija o pedido assinado e "termino de contrato" exija o documento de encerramento — quem mudou a
 * exigencia foi o motivo, nao o tipo. Modelado como subtipo, o checklist reage a escolha do usuario
 * pela mesma regra generica de `rhChecklistService`, sem `if` escrito em codigo.
 */
const MOTIVOS_DEMISSAO = new Set([
  'PEDIDO_DEMISSAO',
  'SEM_JUSTA_CAUSA',
  'COM_JUSTA_CAUSA',
  'TERMINO_CONTRATO',
  'ACORDO_PARTES'
]);

/**
 * RASCUNHO existe porque "impedir o envio" precisa ter um envio (Fase 9, 27/08).
 *
 * O escopo pede, quatro vezes, que o sistema impeca o ENVIO sem os documentos obrigatorios. So que
 * o anexo precisa de um pedido ja gravado para se pendurar — a obra nao tem como anexar antes de
 * abrir. Sem um estado anterior ao envio, "impedir o envio" nao teria onde acontecer.
 *
 * Entao: a obra abre em RASCUNHO, anexa, e ENVIA. O envio e que cobra os obrigatorios.
 *
 * O DP so ve o que foi enviado. Rascunho e da obra, e nao ocupa a fila de ninguem.
 */
const SITUACOES = {
  RASCUNHO: 'RASCUNHO',
  ABERTA: 'ABERTA',
  APROVADA: 'APROVADA',
  REJEITADA: 'REJEITADA',
  CANCELADA: 'CANCELADA'
};

/**
 * De qual EFEITO este pedido trata, independentemente de como ele foi tipado.
 *
 * MOVIMENTACAO nasceu depois de TROCA_OBRA e ALTERACAO_SALARIAL, e absorveu as duas. Esta funcao e o
 * unico lugar que sabe disso: `aplicarEfeito` compara contra o resultado dela, e nao contra
 * `solicitacao.tipo`. Assim os registros antigos continuam funcionando e o efeito NAO foi duplicado.
 */
function efeitoDoPedido(solicitacao) {
  const tipo = String(solicitacao.tipo || '').toUpperCase();
  if (tipo !== 'MOVIMENTACAO') return tipo;

  const subtipo = String(solicitacao.subtipo || '').toUpperCase();
  if (subtipo === 'TRANSFERENCIA_OBRA') return 'TROCA_OBRA';
  if (subtipo === 'ALTERACAO_SALARIAL') return 'ALTERACAO_SALARIAL';
  return `MOVIMENTACAO_${subtipo}`;
}

/**
 * Dias de afastamento, contando os dois extremos.
 *
 * O escopo pede que o sistema calcule "automaticamente a quantidade de dias". Atestado de 10 a 12 e
 * de TRES dias, nao dois: o dia de inicio e dia parado. Contar a diferenca crua tiraria um dia de
 * todo afastamento do sistema.
 */
function diasDeAfastamento(inicio, fim) {
  if (!inicio || !fim) return null;
  const de = new Date(`${paraDataIso(inicio)}T00:00:00.000Z`);
  const ate = new Date(`${paraDataIso(fim)}T00:00:00.000Z`);
  if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime())) return null;
  return Math.floor((ate.getTime() - de.getTime()) / 86400000) + 1;
}

function paraDataIso(valor) {
  if (!valor) return null;
  if (typeof valor === 'string') return valor.slice(0, 10);
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).slice(0, 10);
}

function hojeIso() {
  return new Date().toISOString().slice(0, 10);
}

function dadosDo(solicitacao) {
  const bruto = solicitacao.dados_json;
  if (!bruto) return {};
  if (typeof bruto === 'string') {
    try {
      return JSON.parse(bruto);
    } catch (erro) {
      // Dado ilegivel nao pode derrubar a leitura do pedido — o resto da linha continua util.
      return {};
    }
  }
  return bruto;
}

async function registrarHistorico(solicitacao, dados, transaction) {
  return RhSolicitacaoHistorico.create(
    {
      solicitacao_id: solicitacao.id,
      acao: dados.acao,
      descricao: dados.descricao || null,
      // TEXTO, sempre: `setorParaHistorico` desmonta a associacao do Sequelize antes de gravar.
      setor: setorParaHistorico(dados.setor) || null,
      situacao_anterior: dados.situacaoAnterior || null,
      situacao_nova: dados.situacaoNova || null,
      usuario_id: dados.usuarioId || null
    },
    { transaction }
  );
}

/**
 * Valida o que cada tipo exige. Fica em um lugar so para que abrir e reenviar cobrem o mesmo —
 * senao o reenvio vira a porta para gravar um pedido que a abertura recusaria.
 */
function validarPedido(tipo, dados = {}, colaboradorId, subtipo = null) {
  const subtipoNormalizado = subtipo ? String(subtipo).toUpperCase() : null;
  if (!TIPOS.has(tipo)) {
    throw new ValidationError(`Tipo de solicitacao de pessoal desconhecido: ${tipo}.`);
  }

  /**
   * DOIS TIPOS NAO TEM COLABORADOR, por razoes opostas:
   *
   *   ADMISSAO               — ele ainda NAO EXISTE; nasce na aprovacao.
   *   PAGAMENTO_MAO_DE_OBRA  — sao TODOS os da obra; o pedido e da folha, nao de uma pessoa.
   *
   * Exigir colaborador no pagamento obrigaria a abrir um pedido por pessoa, que e exatamente o
   * trabalho manual que o item 11 do escopo veio eliminar.
   */
  if (!['ADMISSAO', 'PAGAMENTO_MAO_DE_OBRA'].includes(tipo) && !colaboradorId) {
    throw new ValidationError('Informe o colaborador da solicitacao.');
  }

  if (tipo === 'ADMISSAO') {
    if (!String(dados.nome || '').trim()) throw new ValidationError('Informe o nome do colaborador a admitir.');
    if (!String(dados.cpf || '').trim()) throw new ValidationError('Informe o CPF do colaborador a admitir.');
    if (!dados.obra_id) throw new ValidationError('Informe a obra da admissao.');

    /**
     * OS CAMPOS OBRIGATORIOS DO ITEM 8, cobrados aqui e nao no schema.
     *
     * No schema todos sao anulaveis, porque ha 137 colaboradores antigos sem esses dados. A
     * obrigatoriedade e da ADMISSAO NOVA, e e neste ponto que ela vive.
     *
     * `tipo_vinculo` entra na lista fechada do escopo. `NAO_CLT` continua aceito porque e o valor
     * gravado nos registros antigos — recusa-lo aqui impediria reenviar um pedido antigo devolvido.
     */
    const contratacoes = ['CLT', 'EXPERIENCIA', 'PRAZO_DETERMINADO', 'APRENDIZ', 'ESTAGIARIO', 'NAO_CLT'];
    if (dados.tipo_vinculo && !contratacoes.includes(String(dados.tipo_vinculo).toUpperCase())) {
      throw new ValidationError(
        'Tipo de contratacao invalido. Use CLT, experiencia, prazo determinado, aprendiz ou estagiario.'
      );
    }
    if (dados.carga_horaria_semanal !== undefined && dados.carga_horaria_semanal !== null
        && !(Number(dados.carga_horaria_semanal) >= 0)) {
      throw new ValidationError('A carga horaria semanal precisa ser um numero.');
    }
  }

  if (tipo === 'TROCA_OBRA') {
    if (!dados.obra_destino_id) throw new ValidationError('Informe a obra de destino.');
  }

  // ------------------------------------------------------------------ item 9 do escopo
  if (tipo === 'MOVIMENTACAO') {
    if (!SUBTIPOS_MOVIMENTACAO.has(subtipoNormalizado)) {
      throw new ValidationError(
        'Informe o tipo da movimentacao: atestado, ferias, retorno de afastamento, alteracao '
        + 'salarial, alteracao de cargo ou transferencia de obra.'
      );
    }
    if (!dados.obra_id && !dados.obra_destino_id) {
      throw new ValidationError('Informe a obra da movimentacao.');
    }

    // AFASTAMENTO: as duas datas, e nunca invertidas.
    if (['ATESTADO', 'FERIAS', 'RETORNO_AFASTAMENTO'].includes(subtipoNormalizado)) {
      if (!dados.data_inicial) throw new ValidationError('Informe a data inicial do afastamento.');
      if (!dados.data_final) throw new ValidationError('Informe a data final do afastamento.');
      const dias = diasDeAfastamento(dados.data_inicial, dados.data_final);
      if (!(dias > 0)) {
        throw new ValidationError(
          'A data final do afastamento nao pode ser anterior a inicial.'
        );
      }
    }

    if (subtipoNormalizado === 'ALTERACAO_CARGO' && !dados.novo_cargo_id) {
      throw new ValidationError('Informe o novo cargo.');
    }
    if (subtipoNormalizado === 'TRANSFERENCIA_OBRA' && !dados.obra_destino_id) {
      throw new ValidationError('Informe a obra de destino.');
    }
    if (subtipoNormalizado === 'ALTERACAO_SALARIAL') {
      if (!(Number(dados.novo_salario) > 0)) throw new ValidationError('Informe o novo salario pretendido.');
      if (!dados.data_vigencia) throw new ValidationError('Informe a partir de quando o novo salario vale.');
      if (!String(dados.motivo || '').trim()) {
        throw new ValidationError('Informe o motivo da alteracao salarial.');
      }
    }
  }

  // ----------------------------------------------------------------- item 10 do escopo
  if (tipo === 'DEMISSAO') {
    if (!MOTIVOS_DEMISSAO.has(subtipoNormalizado)) {
      throw new ValidationError(
        'Informe o motivo do desligamento: pedido de demissao, sem justa causa, com justa causa, '
        + 'termino de contrato ou acordo entre as partes.'
      );
    }
    if (!dados.data_desligamento) {
      throw new ValidationError('Informe a data de desligamento.');
    }
    if (!dados.ultimo_dia_trabalhado) {
      throw new ValidationError('Informe o ultimo dia trabalhado.');
    }
    // Quem pediu muda a verba rescisoria inteira. Deixar em branco faria o DP adivinhar.
    if (!['EMPRESA', 'COLABORADOR'].includes(String(dados.solicitado_por || '').toUpperCase())) {
      throw new ValidationError('Informe se o desligamento foi solicitado pela EMPRESA ou pelo COLABORADOR.');
    }

    /**
     * ACORDO ENTRE AS PARTES exige valor e justificativa, por exigencia do escopo: "abrir campo
     * obrigatorio para justificativa onde o responsavel deve informar o valor acordado e demais
     * informacoes pertinentes".
     *
     * E o unico motivo em que o numero e NEGOCIADO em vez de calculado — sem registrar quanto foi
     * combinado, nao ha como conferir a rescisao depois contra o que se acertou.
     */
    if (subtipoNormalizado === 'ACORDO_PARTES') {
      if (!(Number(dados.valor_acordado) > 0)) {
        throw new ValidationError('No acordo entre as partes, informe o valor acordado.');
      }
      if (!String(dados.justificativa_acordo || '').trim()) {
        throw new ValidationError('No acordo entre as partes, a justificativa e obrigatoria.');
      }
    }

    if (dados.tem_aviso_previo) {
      const tipoAviso = String(dados.tipo_aviso_previo || '').toUpperCase();
      if (!['TRABALHADO', 'INDENIZADO'].includes(tipoAviso)) {
        throw new ValidationError('Informe se o aviso previo e TRABALHADO ou INDENIZADO.');
      }
    }
  }

  // ----------------------------------------------------------------- item 11 do escopo
  if (tipo === 'PAGAMENTO_MAO_DE_OBRA') {
    if (!dados.obra_id) throw new ValidationError('Informe a obra do pagamento.');
    if (!/^\d{4}-\d{2}$/.test(String(dados.competencia || ''))) {
      throw new ValidationError('Informe a competencia no formato AAAA-MM.');
    }
    if (!dados.periodo_inicio || !dados.periodo_fim) {
      throw new ValidationError('Informe o periodo trabalhado.');
    }
    if (paraDataIso(dados.periodo_fim) < paraDataIso(dados.periodo_inicio)) {
      throw new ValidationError('O fim do periodo trabalhado nao pode ser anterior ao inicio.');
    }
    if (!dados.data_prevista_pagamento) {
      throw new ValidationError('Informe a data prevista para pagamento.');
    }
  }

  if (tipo === 'ALTERACAO_SALARIAL') {
    if (!(Number(dados.novo_salario) > 0)) {
      throw new ValidationError('Informe o novo salario pretendido.');
    }
    if (!dados.data_vigencia) {
      throw new ValidationError('Informe a partir de quando o novo salario vale.');
    }
    // Sem justificativa, a Diretoria decide no escuro — e aumento de salario e custo permanente.
    if (!String(dados.motivo || '').trim()) {
      throw new ValidationError('Informe o motivo da alteracao salarial.');
    }
  }

  if (tipo === 'EVENTO_RECORRENTE') {
    if (!String(dados.codigo || '').trim()) throw new ValidationError('Informe o tipo do evento recorrente.');
    if (!['CREDITO', 'DESCONTO'].includes(String(dados.natureza || '').toUpperCase())) {
      throw new ValidationError('O evento recorrente precisa ser CREDITO ou DESCONTO.');
    }
    if (!(Number(dados.valor) > 0)) throw new ValidationError('Informe o valor do evento recorrente.');
  }
}

/** Abre o pedido. Nasce ABERTA e com o setor de quem criou gravado — e para la que a devolucao volta. */
async function abrirSolicitacao(payload = {}, contexto = {}) {
  return sequelize.transaction(async (transaction) => {
    const tipo = String(payload.tipo || '').trim().toUpperCase();
    const subtipo = payload.subtipo ? String(payload.subtipo).trim().toUpperCase() : null;
    const colaboradorId = payload.colaborador_id ? Number(payload.colaborador_id) : null;
    const dados = payload.dados || {};

    validarPedido(tipo, dados, colaboradorId, subtipo);

    if (colaboradorId) {
      const colaborador = await RhColaborador.findByPk(colaboradorId, { transaction });
      if (!colaborador) throw new ValidationError('Colaborador nao encontrado.', 404);
      if (require('./rhPessoalDomain').ehTransferencia({ tipo, subtipo, obra_id: colaborador.obra_id })) {
        throw new ValidationError('Use o fluxo de transferencia entre os responsaveis das obras.');
      }
      if (tipo === 'TROCA_OBRA' || (tipo === 'MOVIMENTACAO' && subtipo === 'TRANSFERENCIA_OBRA')) {
        dados.primeira_lotacao = !colaborador.obra_id;
      }

      // Um pedido aberto por vez, por tipo: dois pedidos de troca de obra do mesmo colaborador
      // aprovados em sequencia produziriam duas transferencias, e a segunda apagaria a primeira.
      // RASCUNHO conta como pedido em andamento: dois rascunhos do mesmo tipo produziriam dois
      // envios, e o segundo desfaria o efeito do primeiro exatamente como duas aberturas fariam.
      const jaAberta = await RhSolicitacao.findOne({
        where: {
          colaborador_id: colaboradorId,
          tipo,
          subtipo: subtipo || null,
          situacao: { [Op.in]: [SITUACOES.RASCUNHO, SITUACOES.ABERTA] }
        },
        transaction
      });
      if (jaAberta) {
        throw new ValidationError(
          `Ja existe uma solicitacao de ${subtipo || tipo} em andamento para este colaborador `
          + `(#${jaAberta.id}, ${jaAberta.situacao}).`
        );
      }
    }

    const criada = await RhSolicitacao.create(
      {
        colaborador_id: colaboradorId,
        tipo,
        subtipo: subtipo || null,
        // NASCE RASCUNHO. O anexo precisa de um pedido gravado para se pendurar, entao a obra abre,
        // anexa e ENVIA — e o envio e que cobra os obrigatorios. Ver `enviarSolicitacao`.
        situacao: SITUACOES.RASCUNHO,
        obra_id: payload.obra_id || dados.obra_id || null,
        setor_origem: setorParaHistorico(contexto.setor) || null,
        dados_json: dados,
        justificativa: payload.justificativa || null,
        criada_por: contexto.usuarioId || null
      },
      { transaction }
    );

    await registrarHistorico(
      criada,
      {
        acao: 'ABERTURA',
        descricao: `Rascunho de ${subtipo || tipo} criado.`,
        setor: contexto.setor,
        situacaoNova: SITUACOES.RASCUNHO,
        usuarioId: contexto.usuarioId
      },
      transaction
    );

    return criada;
  });
}

/**
 * O CHECKLIST DO PEDIDO — a promessa da obra (Fase 9, 27/08).
 *
 * `marcar` grava QUEM prometeu e QUANDO. Nao e um booleano num JSON: o portao da conclusao cobra
 * essa promessa, e promessa sem dono nao cobra ninguem.
 *
 * Marcar duas vezes o mesmo documento e uma promessa so — o indice unico garante, e aqui o codigo
 * apenas nao tenta gravar de novo.
 */
async function marcarNoChecklist(solicitacaoId, documentoTipoIds = [], contexto = {}, transaction = null) {
  const solicitacao = await RhSolicitacao.findByPk(solicitacaoId, { transaction });
  if (!solicitacao) throw new ValidationError('Solicitacao de pessoal nao encontrada.', 404);

  // So o RASCUNHO aceita mudanca de promessa. Depois de enviado, alterar o checklist permitiria
  // desmarcar justamente o que esta faltando para escapar do portao da conclusao.
  if (solicitacao.situacao !== SITUACOES.RASCUNHO) {
    throw new ValidationError(
      'O checklist so pode ser alterado enquanto a solicitacao for um rascunho.'
    );
  }

  const permitidos = await checklistDoPedido(solicitacao.tipo, solicitacao.subtipo);
  const idsPermitidos = new Set(permitidos.map((item) => Number(item.documento_tipo_id)));
  const pedidos = [...new Set((documentoTipoIds || []).map(Number).filter(Boolean))];

  const forasteiro = pedidos.find((id) => !idsPermitidos.has(id));
  if (forasteiro) {
    throw new ValidationError(
      `O documento #${forasteiro} nao faz parte do checklist de ${solicitacao.subtipo || solicitacao.tipo}.`
    );
  }

  const jaMarcados = await RhSolicitacaoChecklist.findAll({
    where: { solicitacao_id: solicitacao.id },
    transaction
  });
  const jaMarcadosIds = new Set(jaMarcados.map((linha) => Number(linha.documento_tipo_id)));

  // Desmarcar o que saiu da lista, marcar o que entrou. O checklist e o estado atual da promessa,
  // e nao um log — quem quer o log tem `rh_solicitacao_historicos`.
  const paraRemover = jaMarcados.filter((linha) => !pedidos.includes(Number(linha.documento_tipo_id)));
  for (const linha of paraRemover) await linha.destroy({ transaction });

  for (const documentoTipoId of pedidos) {
    if (jaMarcadosIds.has(documentoTipoId)) continue;
    await RhSolicitacaoChecklist.create(
      {
        solicitacao_id: solicitacao.id,
        documento_tipo_id: documentoTipoId,
        marcado_por: contexto.usuarioId || null,
        marcado_em: new Date()
      },
      { transaction }
    );
  }

  if (paraRemover.length || pedidos.some(id => !jaMarcadosIds.has(id))) {
    await registrarHistorico(solicitacao, { acao: 'CHECKLIST', descricao: 'Checklist de documentos atualizado.',
      usuarioId: contexto.usuarioId, setor: contexto.setor }, transaction);
  }
  return { marcados: pedidos.length, removidos: paraRemover.length };
}

/**
 * O QUE FALTA, nas DUAS camadas — decisao do cliente em 27/08.
 *
 *   obrigatoriosFaltando  trava o ENVIO. E a "Documentacao Obrigatoria" que o escopo lista a parte.
 *   prometidosFaltando    trava a CONCLUSAO. E o "checklist marcado" do escopo.
 *
 * A diferenca entre as duas camadas e o que preserva a decisao da Fase 3 ("AVISA, NAO TRAVA",
 * porque o ASO costuma sair depois do pedido): nao marcar o ASO continua permitido. O que deixa de
 * ser permitido e marcar e nao entregar.
 *
 * ANEXO RECUSADO NAO CONTA COMO ENTREGUE, nas duas camadas. Para o pedido, o documento recusado nao
 * existe — foi essa a razao de a Fase 3 colocar o recusado no balde de FALTANDO.
 *
 * NO ENVIO basta o anexo EXISTIR; na CONCLUSAO ele precisa estar VALIDADO pelo DP. E a mesma
 * assimetria da Fase 3: a obra entrega, o DP atesta. Cobrar validacao no envio seria pedir que a
 * obra fizesse o DP trabalhar antes de mandar.
 */
async function pendenciasDeDocumento(solicitacao, transaction = null) {
  const exigidos = await checklistDoPedido(solicitacao.tipo, solicitacao.subtipo);
  const anexos = await RhSolicitacaoAnexo.findAll({
    where: { solicitacao_id: solicitacao.id },
    transaction
  });

  const anexadosNaoRecusados = new Set(
    anexos.filter((a) => a.situacao !== 'RECUSADO').map((a) => Number(a.documento_tipo_id)).filter(Boolean)
  );
  const validados = new Set(
    anexos.filter((a) => a.situacao === 'VALIDADO').map((a) => Number(a.documento_tipo_id)).filter(Boolean)
  );

  const prometidos = await RhSolicitacaoChecklist.findAll({
    where: { solicitacao_id: solicitacao.id },
    transaction
  });
  const prometidosIds = new Set(prometidos.map((linha) => Number(linha.documento_tipo_id)));

  return {
    exigidos,
    obrigatoriosFaltando: exigidos.filter(
      (item) => item.nivel === 'OBRIGATORIO' && !anexadosNaoRecusados.has(Number(item.documento_tipo_id))
    ),
    prometidosFaltando: exigidos.filter(
      (item) => prometidosIds.has(Number(item.documento_tipo_id))
        && !validados.has(Number(item.documento_tipo_id))
    ),
    prometidos: exigidos.filter((item) => prometidosIds.has(Number(item.documento_tipo_id)))
  };
}

/**
 * OS APONTAMENTOS QUE A DEMISSAO PRECISA MOSTRAR (Fase 11, 27/08).
 *
 * O escopo pede: "o sistema deve gerar alerta quando houver ferias vencidas ou outros apontamentos
 * pendentes".
 *
 * FERIAS VENCIDAS SAO CALCULADAS, E NAO GRAVADAS. O periodo aquisitivo comeca na admissao e
 * recomeca a cada ferias gozadas; ficam vencidas 12 meses depois de aberto. Guardar esse estado em
 * coluna criaria um numero que envelhece sozinho e que alguem teria de lembrar de atualizar todo
 * dia — a data de admissao e as ferias aprovadas ja dizem tudo.
 *
 * A FONTE DAS FERIAS e a propria solicitacao aprovada (MOVIMENTACAO / FERIAS). Nao existe tabela de
 * afastamento, e de proposito: ver o comentario do efeito em `aplicarEfeito`.
 *
 * ALERTA, E NAO TRAVA. Mesma escolha do ASO na Fase 3 e do saldo do contrato: a cor avisa, o botao
 * nao some. Ferias vencidas nao impedem demitir — elas mudam a rescisao, e quem decide isso e o DP.
 */
async function apontamentosDoColaborador(colaboradorId) {
  const colaborador = await RhColaborador.findByPk(colaboradorId);
  if (!colaborador) throw new ValidationError('Colaborador nao encontrado.', 404);

  const alertas = [];

  const ultimasFerias = await RhSolicitacao.findOne({
    where: {
      colaborador_id: colaboradorId,
      tipo: 'MOVIMENTACAO',
      subtipo: 'FERIAS',
      situacao: SITUACOES.APROVADA
    },
    order: [['decidida_em', 'DESC']]
  });

  // O periodo corrente comeca nas ultimas ferias gozadas; sem elas, na admissao.
  const inicioDoPeriodo = ultimasFerias
    ? paraDataIso(dadosDo(ultimasFerias).data_final) || paraDataIso(ultimasFerias.decidida_em)
    : paraDataIso(colaborador.data_admissao) || paraDataIso(colaborador.data_inicio);

  if (inicioDoPeriodo) {
    const vence = new Date(`${inicioDoPeriodo}T00:00:00.000Z`);
    vence.setUTCMonth(vence.getUTCMonth() + 12);
    const venceIso = vence.toISOString().slice(0, 10);

    if (venceIso <= hojeIso()) {
      const meses = Math.floor(
        (new Date(`${hojeIso()}T00:00:00.000Z`) - new Date(`${inicioDoPeriodo}T00:00:00.000Z`)) / 2629800000
      );
      alertas.push({
        tipo: 'FERIAS_VENCIDAS',
        gravidade: 'ALTA',
        descricao: ultimasFerias
          ? `Ferias vencidas: o periodo aberto em ${inicioDoPeriodo} completou ${meses} meses.`
          : `Ferias vencidas: nunca houve ferias registradas desde ${inicioDoPeriodo} (${meses} meses).`,
        desde: venceIso
      });
    }
  } else {
    // Sem data de admissao nao da para afirmar que ha ferias vencidas — nem que nao ha. Dizer
    // "esta tudo certo" sobre o que nao se sabe e pior do que dizer que nao se sabe.
    alertas.push({
      tipo: 'ADMISSAO_SEM_DATA',
      gravidade: 'MEDIA',
      descricao: 'Nao ha data de admissao registrada: nao da para conferir ferias vencidas.'
    });
  }

  const emAberto = await RhSolicitacao.findAll({
    where: {
      colaborador_id: colaboradorId,
      situacao: { [Op.in]: [SITUACOES.RASCUNHO, SITUACOES.ABERTA] }
    },
    order: [['id', 'ASC']]
  });
  for (const pedido of emAberto) {
    alertas.push({
      tipo: 'SOLICITACAO_EM_ABERTO',
      gravidade: 'MEDIA',
      descricao: `Solicitacao de ${pedido.subtipo || pedido.tipo} #${pedido.id} ainda ${pedido.situacao}.`,
      solicitacao_id: pedido.id
    });
  }

  return { colaboradorId, alertas };
}

/**
 * RASCUNHO -> ABERTA. E aqui que "impedir o envio sem os documentos obrigatorios" acontece.
 */
async function enviarSolicitacao(id, contexto = {}) {
  return sequelize.transaction(async (transaction) => {
    const solicitacao = await RhSolicitacao.findByPk(id, { transaction });
    if (!solicitacao) throw new ValidationError('Solicitacao de pessoal nao encontrada.', 404);

    if (solicitacao.situacao !== SITUACOES.RASCUNHO) {
      throw new ValidationError(
        `Esta solicitacao ja foi enviada e esta ${solicitacao.situacao}.`
      );
    }

    const { obrigatoriosFaltando } = await pendenciasDeDocumento(solicitacao, transaction);
    if (obrigatoriosFaltando.length) {
      throw new ValidationError(
        'Faltam documentos obrigatorios para enviar: '
        + `${obrigatoriosFaltando.map((item) => item.nome).join(', ')}.`
      );
    }

    await solicitacao.update({ situacao: SITUACOES.ABERTA }, { transaction });

    await registrarHistorico(
      solicitacao,
      {
        acao: 'ENVIO',
        descricao: `Solicitacao de ${solicitacao.subtipo || solicitacao.tipo} enviada ao DP.`,
        setor: contexto.setor,
        situacaoAnterior: SITUACOES.RASCUNHO,
        situacaoNova: SITUACOES.ABERTA,
        usuarioId: contexto.usuarioId
      },
      transaction
    );

    return solicitacao;
  });
}

/**
 * O EFEITO da aprovacao sobre o cadastro e sobre o vinculo.
 *
 * Tudo o que mexe em lotacao passa por `rhVinculoObraService`, e nao escreve `obra_id` na mao: a
 * aritmetica de fechar o periodo anterior no DIA ANTERIOR ja esta provada por 13 conferencias na
 * suite 49, e duplicar essa regra aqui seria criar uma segunda versao dela para divergir depois.
 */
async function aplicarEfeito(solicitacao, contexto, transaction) {
  // O EFEITO, e nao o tipo cru: MOVIMENTACAO absorveu TROCA_OBRA e ALTERACAO_SALARIAL, e os
  // registros gravados com os tipos antigos precisam continuar produzindo o mesmo resultado.
  const efeito = efeitoDoPedido(solicitacao);
  const dados = dadosDo(solicitacao);

  if (efeito === 'ADMISSAO') {
    const colaborador = await RhColaborador.create(
      {
        empresa_grupo_id: dados.empresa_grupo_id || null,
        obra_id: dados.obra_id || solicitacao.obra_id || null,
        setor_id: dados.setor_id || null,
        nome: String(dados.nome).trim(),
        cpf: String(dados.cpf).trim(),
        cargo: dados.cargo || null,
        // Fase 7: o cargo passou a ter catalogo. `cargo` (texto) continua sendo gravado junto para
        // as telas antigas que leem a coluna de texto nao ficarem contradizendo o catalogo.
        cargo_id: dados.cargo_id || null,
        carga_horaria_semanal: dados.carga_horaria_semanal || null,
        tipo_vinculo: dados.tipo_vinculo || 'CLT',
        data_admissao: paraDataIso(dados.data_admissao) || hojeIso(),
        data_inicio: paraDataIso(dados.data_admissao) || hojeIso(),
        salario_base: dados.salario_base || null,
        /**
         * OS CAMPOS DO ITEM 8 QUE NASCEM COM O COLABORADOR.
         *
         * Ficam no colaborador, e nao so no `dados_json` do pedido: o pedido de admissao morre
         * depois de aprovado, o endereco e a conta bancaria do colaborador nao. Guardar so no JSON
         * faria o dado sumir da ficha — o oposto de "carteira de colaboradores por obra".
         *
         * Todos anulaveis: quem abriu o pedido pode nao ter tudo em maos, e a obrigatoriedade e do
         * FORMULARIO, nao do schema.
         */
        telefone: dados.telefone || null,
        email: dados.email || null,
        nome_pai: dados.nome_pai || null,
        nome_mae: dados.nome_mae || null,
        endereco: dados.endereco || null,
        numero: dados.numero || null,
        complemento: dados.complemento || null,
        bairro: dados.bairro || null,
        municipio: dados.municipio || null,
        estado: dados.estado || null,
        cep: dados.cep || null,
        banco: dados.banco || null,
        agencia: dados.agencia || null,
        conta: dados.conta || null,
        conta_tipo: dados.conta_tipo || null,
        pix_chave_tipo: dados.pix_chave_tipo || null,
        pix_chave: dados.pix_chave || null,
        responsavel_contratacao_id: dados.responsavel_contratacao_id || contexto.usuarioId || null,
        status: 'ATIVO',
        criado_por: contexto.usuarioId || null,
        atualizado_por: contexto.usuarioId || null
      },
      { transaction }
    );

    await rhVinculoObraService.registrarVinculo(
      {
        colaboradorId: colaborador.id,
        obraId: colaborador.obra_id,
        setorId: colaborador.setor_id,
        vigenciaInicio: colaborador.data_admissao,
        motivo: 'ADMISSAO',
        solicitacaoId: solicitacao.id,
        criadoPor: contexto.usuarioId || null
      },
      transaction
    );

    // O pedido passa a apontar para quem ele criou: sem isto o rastro morre na aprovacao.
    await solicitacao.update({ colaborador_id: colaborador.id }, { transaction });

    // A papelada entregue no pedido vira a pasta do colaborador (Fase 3).
    const documentos = await transferirAnexosParaOColaborador(
      solicitacao,
      colaborador.id,
      contexto,
      transaction
    );

    return { colaboradorId: colaborador.id, documentosGerados: documentos };
  }

  if (efeito === 'TROCA_OBRA') {
    const colaborador = await RhColaborador.findByPk(solicitacao.colaborador_id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!colaborador) throw new ValidationError('Colaborador da solicitacao nao existe mais.', 404);
    if (colaborador.obra_id) {
      throw new ValidationError('O colaborador ja tem obra. A transferencia precisa da aprovacao do responsavel da outra obra.', 409);
    }

    const vigencia = paraDataIso(dados.data_vigencia) || hojeIso();

    await rhVinculoObraService.registrarVinculo(
      {
        colaboradorId: colaborador.id,
        obraId: dados.obra_destino_id,
        setorId: colaborador.setor_id,
        vigenciaInicio: vigencia,
        motivo: 'TROCA_OBRA',
        solicitacaoId: solicitacao.id,
        criadoPor: contexto.usuarioId || null
      },
      transaction
    );

    // `obra_id` do colaborador e o cache da obra CORRENTE — quem manda no historico e o vinculo.
    await colaborador.update(
      { obra_id: dados.obra_destino_id, atualizado_por: contexto.usuarioId || null },
      { transaction }
    );
    return { obraId: dados.obra_destino_id };
  }

  if (efeito === 'DEMISSAO') {
    const colaborador = await RhColaborador.findByPk(solicitacao.colaborador_id, { transaction });
    if (!colaborador) throw new ValidationError('Colaborador da solicitacao nao existe mais.', 404);

    /**
     * AVISO PREVIO TRABALHADO: o desligamento e na data prevista, NAO na aprovacao.
     *
     * Ate la o colaborador continua na obra e CONTINUA NO CUSTO — porque continua trabalhando.
     * Encerrar o vinculo na aprovacao tiraria do custo da obra alguem que ainda esta la, e o custo
     * de mao de obra do mes sairia menor do que foi.
     */
    const dataDesligamento = paraDataIso(dados.data_desligamento) || hojeIso();

    await colaborador.update(
      {
        data_demissao: dataDesligamento,
        status: 'DEMITIDO',
        atualizado_por: contexto.usuarioId || null
      },
      { transaction }
    );

    await rhVinculoObraService.encerrarVinculo(
      {
        colaboradorId: colaborador.id,
        dataFim: dataDesligamento,
        motivo: 'DEMISSAO',
        solicitacaoId: solicitacao.id
      },
      transaction
    );

    return { dataDesligamento };
  }

  if (efeito === 'EVENTO_RECORRENTE') {
    /**
     * "Obra solicita e DP valida e confirma" — resposta do cliente em 25/08.
     *
     * A regra so passa a existir na APROVACAO. Cria-la na abertura faria o vale alimentacao ja
     * descontar antes de alguem conferir, e um pedido recusado deixaria uma regra viva descontando
     * todo mes — que e exatamente o controle-fantasma que a fase existe para acabar.
     */
    // eslint-disable-next-line global-require
    const { criarEventoRecorrente } = require('./rhEventoRecorrenteService');

    const evento = await criarEventoRecorrente(
      { ...dados, colaborador_id: solicitacao.colaborador_id, solicitacao_id: solicitacao.id },
      contexto,
      transaction
    );

    return { eventoRecorrenteId: evento.id };
  }

  if (efeito === 'ALTERACAO_SALARIAL') {
    /**
     * A DECISAO E DA DIRETORIA, e nao do DP (Fase 5).
     *
     * A permissao e ESTRITA para ADMINISTRADOR e os demais perfis e nao trata "nao configurado"
     * como liberado. SUPERADMIN possui acesso funcional global. Fora dessa excecao, quem pode
     * aumentar salario precisa continuar sendo uma escolha explicita de quem concede.
     *
     * O cliente definiu em 25/08 que a Diretoria "e uma configuracao de permissao granular que pode
     * ser concedida a um usuario do sistema" — nao um setor, nao um cargo.
     */
    // eslint-disable-next-line global-require
    const { userHasStrictAreaPermission } = require('./authorizationService');

    const podeAprovar = await userHasStrictAreaPermission(
      contexto.usuario || { id: contexto.usuarioId },
      ['rh_dp.salario.aprovar']
    );

    if (!podeAprovar) {
      throw Object.assign(
        new Error(
          'Acesso negado: aprovar alteracao salarial exige a permissao de Diretoria '
          + '(rh_dp.salario.aprovar).'
        ),
        { statusCode: 403 }
      );
    }

    // eslint-disable-next-line global-require
    const { registrarSalario } = require('./rhSalarioService');

    const registro = await registrarSalario(
      {
        colaboradorId: solicitacao.colaborador_id,
        valor: dados.novo_salario,
        vigenciaInicio: dados.data_vigencia,
        motivo: 'ALTERACAO',
        solicitacaoId: solicitacao.id,
        observacoes: solicitacao.justificativa || null,
        criadoPor: contexto.usuarioId || null
      },
      transaction
    );

    return { salarioId: registro.id, novoSalario: registro.valor };
  }

  // ------------------------------------------------------ item 9: alteracao de cargo
  if (efeito === 'MOVIMENTACAO_ALTERACAO_CARGO') {
    const colaborador = await RhColaborador.findByPk(solicitacao.colaborador_id, { transaction });
    if (!colaborador) throw new ValidationError('Colaborador da solicitacao nao existe mais.', 404);

    const cargo = await RhCargo.findByPk(dados.novo_cargo_id, { transaction });
    if (!cargo || !cargo.ativo) throw new ValidationError('O cargo informado nao existe ou esta inativo.');

    const cargoAnterior = colaborador.cargo_id;
    await colaborador.update(
      {
        cargo_id: cargo.id,
        // `cargo` (texto) acompanha para nao ficar contradizendo o catalogo em toda tela antiga que
        // ainda le a coluna de texto.
        cargo: cargo.nome,
        atualizado_por: contexto.usuarioId || null
      },
      { transaction }
    );

    return { cargoAnteriorId: cargoAnterior, cargoId: cargo.id, cargoNome: cargo.nome };
  }

  /**
   * AFASTAMENTOS — atestado, ferias e retorno — NAO mexem no cadastro, e isso e deliberado.
   *
   * O registro aprovado E o efeito: e ele que a apuracao le para descontar, e e ele que o alerta de
   * ferias vencidas da demissao consulta. Criar uma tabela `rh_afastamentos` seria guardar duas
   * vezes o que a solicitacao ja guarda, com as duas livres para divergir.
   *
   * Os dias sao RECALCULADOS aqui, e nao lidos do que a tela mandou: numero enviado pelo cliente e
   * sugestao, nao verdade. Mesma razao de a parcela da apuracao ser derivada em vez de incrementada.
   */
  if (efeito.startsWith('MOVIMENTACAO_')) {
    const dias = diasDeAfastamento(dados.data_inicial, dados.data_final);
    return {
      subtipo: solicitacao.subtipo,
      dataInicial: paraDataIso(dados.data_inicial),
      dataFinal: paraDataIso(dados.data_final),
      diasAfastamento: dias
    };
  }

  return {};
}

/**
 * A papelada vai para a pasta do colaborador em QUALQUER tipo que ja tenha colaborador.
 *
 * Nao e so admissao: a demissao carrega carta de pedido e termo de rescisao, e a troca de obra pode
 * levar um aceite. Deixar isso preso ao anexo do pedido significaria que a pasta do colaborador
 * nunca recebe o que foi entregue depois da contratacao — e a pasta e onde alguem vai procurar.
 *
 * Na ADMISSAO a transferencia acontece dentro do proprio bloco, porque o colaborador nasce ali.
 */
async function transferirSeJaTemColaborador(solicitacao, contexto, transaction) {
  if (solicitacao.tipo === 'ADMISSAO' || !solicitacao.colaborador_id) return [];
  return transferirAnexosParaOColaborador(solicitacao, solicitacao.colaborador_id, contexto, transaction);
}

/** Aprova o pedido e aplica o efeito. Recusa decidir de novo o que ja foi decidido. */
async function aprovarSolicitacao(id, contexto = {}) {
  return sequelize.transaction(async (transaction) => {
    const solicitacao = await RhSolicitacao.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!solicitacao) throw new ValidationError('Solicitacao de pessoal nao encontrada.', 404);

    if (solicitacao.situacao !== SITUACOES.ABERTA) {
      throw new ValidationError(
        `Esta solicitacao ja esta ${solicitacao.situacao} e nao pode ser decidida de novo.`
      );
    }

    /**
     * O PORTAO DA CONCLUSAO — "so permite concluir se todos os documentos marcados no checklist
     * estiverem efetivamente anexados" (escopo, itens 8 a 11).
     *
     * Cobra o que foi PROMETIDO, e cobra VALIDADO. A obra marcou, a obra entrega; o DP atesta.
     * Um anexo pendente de validacao nao fecha a promessa — se fechasse, bastaria mandar qualquer
     * arquivo com o tipo certo para o portao abrir, que e exatamente o que a Fase 3 fechou.
     */
    const { prometidosFaltando } = await pendenciasDeDocumento(solicitacao, transaction);
    if (prometidosFaltando.length) {
      throw new ValidationError(
        'Nao da para concluir: os documentos marcados no checklist ainda nao foram entregues e '
        + `validados — ${prometidosFaltando.map((item) => item.nome).join(', ')}.`
      );
    }

    const efeito = await aplicarEfeito(solicitacao, contexto, transaction);

    // Demissao e troca de obra tambem levam papelada para a pasta do colaborador.
    const documentosDeOutrosTipos = await transferirSeJaTemColaborador(solicitacao, contexto, transaction);
    if (documentosDeOutrosTipos.length) efeito.documentosGerados = documentosDeOutrosTipos;

    await solicitacao.update(
      {
        situacao: SITUACOES.APROVADA,
        decidida_por: contexto.usuarioId || null,
        decidida_em: new Date()
      },
      { transaction }
    );

    await registrarHistorico(
      solicitacao,
      {
        acao: 'APROVACAO',
        descricao: `Solicitacao de ${solicitacao.tipo} aprovada pelo DP.`,
        setor: contexto.setor,
        situacaoAnterior: SITUACOES.ABERTA,
        situacaoNova: SITUACOES.APROVADA,
        usuarioId: contexto.usuarioId
      },
      transaction
    );

    return { solicitacao, efeito };
  });
}

/**
 * Devolve o pedido a quem o abriu.
 *
 * O motivo e OBRIGATORIO: devolver sem dizer por que obriga a obra a adivinhar, e foi o que os
 * itens 24/30 corrigiram no contrato.
 */
async function rejeitarSolicitacao(id, motivo, contexto = {}) {
  return sequelize.transaction(async (transaction) => {
    const solicitacao = await RhSolicitacao.findByPk(id, { transaction });
    if (!solicitacao) throw new ValidationError('Solicitacao de pessoal nao encontrada.', 404);

    if (solicitacao.situacao !== SITUACOES.ABERTA) {
      throw new ValidationError(
        `Esta solicitacao ja esta ${solicitacao.situacao} e nao pode ser decidida de novo.`
      );
    }

    const texto = String(motivo || '').trim();
    if (!texto) throw new ValidationError('Informe o motivo da devolucao.');

    await solicitacao.update(
      {
        situacao: SITUACOES.REJEITADA,
        motivo_rejeicao: texto,
        decidida_por: contexto.usuarioId || null,
        decidida_em: new Date()
      },
      { transaction }
    );

    await registrarHistorico(
      solicitacao,
      {
        // O setor de destino e o de quem criou — a devolucao volta para quem pediu.
        acao: 'REJEICAO',
        descricao: `Devolvida para ${solicitacao.setor_origem || 'a origem'}: ${texto}`,
        setor: contexto.setor,
        situacaoAnterior: SITUACOES.ABERTA,
        situacaoNova: SITUACOES.REJEITADA,
        usuarioId: contexto.usuarioId
      },
      transaction
    );

    return solicitacao;
  });
}

/** Reenvia depois de corrigir. Revalida o pedido inteiro — o reenvio nao e porta dos fundos. */
async function reenviarSolicitacao(id, payload = {}, contexto = {}) {
  return sequelize.transaction(async (transaction) => {
    const solicitacao = await RhSolicitacao.findByPk(id, { transaction });
    if (!solicitacao) throw new ValidationError('Solicitacao de pessoal nao encontrada.', 404);

    if (solicitacao.situacao !== SITUACOES.REJEITADA) {
      throw new ValidationError('So uma solicitacao devolvida pode ser reenviada.');
    }

    const dados = payload.dados ? payload.dados : dadosDo(solicitacao);
    // A classificação de primeira lotação vem do servidor e não pode ser alterada no reenvio.
    if (dadosDo(solicitacao).primeira_lotacao === true) dados.primeira_lotacao = true;
    // O subtipo entra aqui tambem: sem ele, o reenvio viraria a porta para gravar um pedido que a
    // abertura recusaria — que e exatamente o que `validarPedido` existe para impedir.
    validarPedido(solicitacao.tipo, dados, solicitacao.colaborador_id, solicitacao.subtipo);

    await solicitacao.update(
      {
        situacao: SITUACOES.ABERTA,
        dados_json: dados,
        justificativa: payload.justificativa || solicitacao.justificativa,
        motivo_rejeicao: null,
        decidida_por: null,
        decidida_em: null
      },
      { transaction }
    );

    await registrarHistorico(
      solicitacao,
      {
        acao: 'REENVIO',
        descricao: 'Solicitacao corrigida e reenviada ao DP.',
        setor: contexto.setor,
        situacaoAnterior: SITUACOES.REJEITADA,
        situacaoNova: SITUACOES.ABERTA,
        usuarioId: contexto.usuarioId
      },
      transaction
    );

    return solicitacao;
  });
}

/** Cancela. So enquanto esta aberta — pedido ja decidido e historico, nao rascunho. */
async function cancelarSolicitacao(id, motivo, contexto = {}) {
  return sequelize.transaction(async (transaction) => {
    const solicitacao = await RhSolicitacao.findByPk(id, { transaction });
    if (!solicitacao) throw new ValidationError('Solicitacao de pessoal nao encontrada.', 404);

    if (solicitacao.situacao === SITUACOES.APROVADA) {
      throw new ValidationError('Solicitacao aprovada nao pode ser cancelada: ela ja produziu efeito.');
    }
    if (solicitacao.situacao === SITUACOES.CANCELADA) {
      throw new ValidationError('Esta solicitacao ja esta cancelada.');
    }

    await solicitacao.update({ situacao: SITUACOES.CANCELADA }, { transaction });

    await registrarHistorico(
      solicitacao,
      {
        acao: 'CANCELAMENTO',
        descricao: String(motivo || '').trim() || 'Cancelada por quem abriu.',
        setor: contexto.setor,
        situacaoNova: SITUACOES.CANCELADA,
        usuarioId: contexto.usuarioId
      },
      transaction
    );

    return solicitacao;
  });
}

/**
 * Os pedidos ABERTOS, agrupados por colaborador.
 *
 * Existe por causa do requisito de tela dado pelo cliente em 25/08: a lista de colaboradores mostra
 * quem tem pedido em aberto PRIMEIRO, com destaque. A alternativa — perguntar por colaborador,
 * linha a linha — faria uma consulta por linha da tela, e a tela que existe para dar agilidade
 * seria a mais lenta do modulo.
 *
 * `obraIds` nulo significa "todas as obras", e e o que a permissao `ver_todas` concede. Quem nao a
 * tem recebe aqui a lista das obras dele — o filtro e do chamador, para que a regra de visibilidade
 * fique em um lugar so.
 */
/**
 * RASCUNHO ENTRA NA LISTA, e a decisao merece explicacao porque a primeira versao o deixava de fora.
 *
 * O raciocinio inicial era "rascunho e da obra e nao ocupa a fila do DP". A fila do DP, de fato, e
 * so o que foi enviado — mas ESTA consulta nao alimenta a fila: ela alimenta a LISTA DE
 * COLABORADORES, que existe para dizer "este aqui tem coisa pendente".
 *
 * Um rascunho esquecido e exatamente uma coisa pendente. Escondido, ele fica invisivel para quem o
 * criou e para todo mundo — a obra acha que pediu, o DP nunca recebeu, e ninguem descobre ate
 * alguem perguntar. Aparecer com a situacao a vista e o que permite a tela dizer "falta enviar" em
 * vez de "aguardando o DP".
 */
async function pedidosAbertosPorColaborador(obraIds = null) {
  const where = { situacao: { [Op.in]: [SITUACOES.RASCUNHO, SITUACOES.ABERTA] } };
  if (Array.isArray(obraIds)) where.obra_id = { [Op.in]: obraIds };

  const abertas = await RhSolicitacao.findAll({
    where,
    order: [['createdAt', 'ASC'], ['id', 'ASC']],
    include: [{ model: Obra, as: 'obra', required: false }]
  });

  const porColaborador = new Map();
  for (const pedido of abertas) {
    if (require('./rhPessoalDomain').ehTransferencia(pedido)) continue;
    if (!pedido.colaborador_id) continue;
    const lista = porColaborador.get(pedido.colaborador_id) || [];
    lista.push(pedido);
    porColaborador.set(pedido.colaborador_id, lista);
  }
  return porColaborador;
}

async function colaboradorDo(solicitacao, transaction = null) {
  if (!solicitacao.colaborador_id) return null;
  return RhColaborador.findByPk(solicitacao.colaborador_id, { transaction });
}

/**
 * O vinculo que vale para a conferencia.
 *
 * Vem do PEDIDO quando e admissao (o colaborador ainda nao existe) e do CADASTRO nos demais casos.
 * `NAO CLT` com espaco e normalizado para `NAO_CLT`, que e como `rh_documentos_tipos` grava.
 */
function vinculoDoPedidoOuColaborador(solicitacao, colaborador) {
  const normalizar = (valor) => {
    const texto = String(valor || '').trim().toUpperCase();
    if (!texto) return null;
    return texto === 'NAO CLT' ? 'NAO_CLT' : texto;
  };
  return normalizar(dadosDo(solicitacao).tipo_vinculo) || normalizar(colaborador && colaborador.tipo_vinculo);
}

/**
 * Anexa um documento ao pedido.
 *
 * O anexo fica no PEDIDO, e nao em `rh_documentos`, porque na admissao o colaborador ainda nao
 * existe (ver a migration 202608250052). Na aprovacao ele e copiado para o colaborador.
 *
 * So aceita anexo enquanto o pedido ainda esta em tratamento. Depois da decisao, o detalhe
 * continua disponivel para consulta e comentarios, mas a prova documental daquela decisao fica
 * preservada sem inclusoes posteriores.
 */
async function anexarNoPedido(solicitacaoId, dados = {}, contexto = {}, arquivo = null) {
  return sequelize.transaction(async (transaction) => {
    const solicitacao = await RhSolicitacao.findByPk(solicitacaoId, { transaction });
    if (!solicitacao) throw new ValidationError('Solicitacao de pessoal nao encontrada.', 404);

    // RASCUNHO entra na lista, e e o caso principal: e nele que a obra junta a papelada ANTES de
    // enviar. Sem isso, "impedir o envio sem os documentos obrigatorios" seria impossivel de
    // cumprir — nao haveria momento em que anexar fosse permitido e o envio ainda nao tivesse
    // ocorrido.
    if (![SITUACOES.RASCUNHO, SITUACOES.ABERTA, SITUACOES.REJEITADA].includes(solicitacao.situacao)) {
      throw new ValidationError(
        `Nao da para anexar em uma solicitacao ${solicitacao.situacao}: ela ja foi decidida.`
      );
    }

    /**
     * O ARQUIVO DE VERDADE (26/08).
     *
     * `arquivo` e o `req.file` do multer. Ate aqui esta funcao so aceitava `arquivo_url` como TEXTO
     * — o que provava a regra nas suites e nao servia para ninguem: a obra nao tinha como enviar um
     * PDF pela tela.
     *
     * O `arquivo_url` continua aceito para o caso de o arquivo ja estar no storage (reenvio que
     * aponta para o mesmo documento) e para as suites, que nao sobem binario. Mas quando vem
     * arquivo, ele MANDA — senao um payload malicioso poderia gravar uma URL arbitraria ao lado de
     * um upload legitimo.
     *
     * A pasta e a do PEDIDO, nao a do colaborador: na admissao o colaborador ainda nao existe.
     * Quando o documento for atestado e virar `rh_documentos`, a URL e copiada como esta — o arquivo
     * nao se move, porque mover quebraria o que ja foi apontado.
     */
    let urlDoArquivo = String(dados.arquivo_url || '').trim();
    let nomeOriginal = String(dados.nome_original || '').trim();
    let mimetype = dados.mimetype || null;
    let tamanho = dados.tamanho_bytes || null;

    if (arquivo?.buffer) {
      urlDoArquivo = await uploadToS3(arquivo, `rh-solicitacoes/${solicitacao.id}`);
      nomeOriginal = normalizeOriginalName(arquivo.originalname);
      mimetype = arquivo.mimetype || null;
      tamanho = arquivo.size || null;
    }

    if (!nomeOriginal) throw new ValidationError('Informe o nome do arquivo.');
    if (!urlDoArquivo) throw new ValidationError('Envie o arquivo do documento.');

    /**
     * Documento de CLT nao entra em pedido de nao-CLT, e vice-versa.
     *
     * `rhService.ensureDocumentoTipoCompativel` ja faz isso para o documento do colaborador. Aqui a
     * checagem precisa existir de novo porque o colaborador pode NAO EXISTIR ainda: na admissao o
     * vinculo vem do proprio pedido. Mesma regra, fonte diferente.
     */
    if (dados.documento_tipo_id) {
      const tipo = await RhDocumentoTipo.findByPk(dados.documento_tipo_id, { transaction });
      if (!tipo) throw new ValidationError('Tipo de documento nao encontrado.', 404);

      const vinculo = vinculoDoPedidoOuColaborador(
        solicitacao,
        await colaboradorDo(solicitacao, transaction)
      );

      if (tipo.tipo_vinculo && vinculo && tipo.tipo_vinculo !== vinculo) {
        throw new ValidationError(
          `O documento "${tipo.nome}" e de ${tipo.tipo_vinculo}, e este pedido e de ${vinculo}.`
        );
      }
    }

    const anexo = await RhSolicitacaoAnexo.create(
      {
        solicitacao_id: solicitacao.id,
        documento_tipo_id: dados.documento_tipo_id || null,
        nome_original: nomeOriginal,
        arquivo_url: urlDoArquivo,
        mimetype,
        tamanho_bytes: tamanho,
        validade: paraDataIso(dados.validade),
        observacoes: dados.observacoes || null,
        criado_por: contexto.usuarioId || null
      },
      { transaction }
    );

    await registrarHistorico(
      solicitacao,
      {
        acao: 'ANEXO',
        descricao: `Anexado: ${anexo.nome_original}`,
        setor: contexto.setor,
        usuarioId: contexto.usuarioId
      },
      transaction
    );

    return anexo;
  });
}

/**
 * O DP ATESTA QUE O DOCUMENTO E VALIDO — ou recusa dizendo por que (26/08).
 *
 * Pedido do cliente: "o DP precisa atestar que o documento e valido e util antes de vincular esse
 * documento a pasta do colaborador".
 *
 * A diferenca que isto cria e entre "a obra mandou" e "o DP aceitou". A pasta do colaborador e o
 * que vale em fiscalizacao: ela precisa dizer o que foi CONFERIDO, nao o que foi enviado. Antes
 * disto, bastava anexar um arquivo com o tipo certo para ele virar documento oficial — foto tremida,
 * pagina faltando, CPF de outra pessoa, tudo entrava.
 *
 * RECUSAR NAO APAGA o anexo. Ele fica `RECUSADO` com o motivo, e a obra ve o que precisa reenviar.
 * Apagar deixaria a obra sem saber o que aconteceu com o que ela mandou.
 */
async function validarAnexo(anexoId, decisao = {}, contexto = {}) {
  return sequelize.transaction(async (transaction) => {
    const anexo = await RhSolicitacaoAnexo.findByPk(anexoId, { transaction });
    if (!anexo) throw new ValidationError('Anexo nao encontrado.', 404);

    const solicitacao = await RhSolicitacao.findByPk(anexo.solicitacao_id, { transaction });
    if (!solicitacao) throw new ValidationError('Solicitacao do anexo nao encontrada.', 404);

    /**
     * Depois que o anexo virou documento na pasta, atestar de novo nao significa nada — e mudar a
     * situacao aqui deixaria a pasta e o pedido contando historias diferentes sobre a mesma linha.
     */
    if (anexo.documento_gerado_id) {
      throw new ValidationError('Este anexo ja virou documento do colaborador e nao pode ser reavaliado.');
    }

    const aceito = decisao.aceito === true || String(decisao.aceito).toLowerCase() === 'true';

    if (!aceito) {
      const motivo = String(decisao.motivo || '').trim();
      if (!motivo) {
        throw new ValidationError('Informe por que o documento nao foi aceito. A obra precisa saber o que reenviar.');
      }

      await anexo.update(
        {
          situacao: 'RECUSADO',
          motivo_recusa: motivo,
          validado_por: contexto.usuarioId || null,
          validado_em: new Date(),
          observacao_validacao: null
        },
        { transaction }
      );

      await registrarHistorico(
        solicitacao,
        {
          acao: 'ANEXO_RECUSADO',
          descricao: `Documento "${anexo.nome_original}" nao aceito: ${motivo}`,
          setor: contexto.setor,
          usuarioId: contexto.usuarioId
        },
        transaction
      );

      return anexo;
    }

    await anexo.update(
      {
        situacao: 'VALIDADO',
        motivo_recusa: null,
        validado_por: contexto.usuarioId || null,
        validado_em: new Date(),
        observacao_validacao: decisao.observacao || null
      },
      { transaction }
    );

    await registrarHistorico(
      solicitacao,
      {
        acao: 'ANEXO_VALIDADO',
        descricao: `Documento "${anexo.nome_original}" atestado pelo DP.`,
        setor: contexto.setor,
        usuarioId: contexto.usuarioId
      },
      transaction
    );

    return anexo;
  });
}

/** Os anexos de um pedido, com a situacao de validacao — o que a tela do DP opera. */
async function anexosDoPedido(solicitacaoId) {
  return RhSolicitacaoAnexo.findAll({
    where: { solicitacao_id: solicitacaoId },
    order: [['id', 'ASC']],
    include: [{ model: RhDocumentoTipo, as: 'tipo', required: false }]
  });
}

/**
 * O que ainda falta de documento obrigatorio neste pedido.
 *
 * AVISA, NAO TRAVA. O DP continua podendo aprovar sem o ASO — o exame costuma sair depois do
 * pedido, e travar obrigaria a obra a ter tudo em maos no minuto zero, que nao e como a operacao
 * funciona. Mas quem aprovar sem ele faz isso SABENDO, e o historico registra.
 *
 * E a mesma escolha do alerta de saldo do contrato (item 21): a cor avisa, o botao nao some.
 *
 * Os tipos com `tipo_vinculo` nulo — comprovante bancario, outros — valem para todo mundo.
 */
async function conferirDocumentacao(solicitacaoId) {
  const solicitacao = await RhSolicitacao.findByPk(solicitacaoId);
  if (!solicitacao) throw new ValidationError('Solicitacao de pessoal nao encontrada.', 404);

  /**
   * A LISTA VEM DAS EXIGENCIAS, e nao mais da flag `rh_documentos_tipos.obrigatorio` (Fase 9).
   *
   * A regra antiga decidia obrigatoriedade so por CLT / NAO CLT, e por isso a conferencia so fazia
   * sentido na admissao. Agora cada tipo — e cada SUBTIPO — tem a sua lista, entao demissao,
   * movimentacao e pagamento tambem conferem.
   *
   * `vinculo` continua sendo devolvido porque a tela o usa no cabecalho, mas ele nao decide mais
   * nada aqui.
   */
  const vinculo = vinculoDoPedidoOuColaborador(solicitacao, await colaboradorDo(solicitacao));

  const exigidos = await checklistDoPedido(solicitacao.tipo, solicitacao.subtipo);
  if (!exigidos.length) {
    return { vinculo, exigeConferencia: false, faltando: [], entregues: [] };
  }

  // Conferir cobra o que o pedido EXIGE (obrigatorio) mais o que a obra PROMETEU (checklist). O
  // condicional que ninguem marcou nao e pendencia — e a definicao de "quando aplicavel".
  const prometidos = await RhSolicitacaoChecklist.findAll({
    where: { solicitacao_id: solicitacao.id }
  });
  const prometidosIds = new Set(prometidos.map((linha) => Number(linha.documento_tipo_id)));

  const obrigatorios = exigidos
    .filter((item) => item.nivel === 'OBRIGATORIO' || prometidosIds.has(Number(item.documento_tipo_id)))
    .map((item) => ({ id: item.documento_tipo_id, codigo: item.codigo, nome: item.nome }));

  const anexos = await RhSolicitacaoAnexo.findAll({ where: { solicitacao_id: solicitacao.id } });

  /**
   * TRES BALDES, e nao dois — porque "a obra mandou" deixou de ser o mesmo que "o DP aceitou".
   *
   *   validados          — atestados pelo DP; sao os que vao para a pasta
   *   aguardandoValidacao — a obra mandou, o DP ainda nao olhou
   *   faltando           — ninguem mandou, ou o que veio foi recusado
   *
   * Documento RECUSADO conta como FALTANDO de proposito: para a admissao ele nao existe. Deixa-lo
   * num balde proprio faria a conferencia dizer "esta tudo la" sobre algo que o DP rejeitou.
   */
  const validados = new Set(
    anexos.filter((a) => a.situacao === 'VALIDADO').map((a) => Number(a.documento_tipo_id)).filter(Boolean)
  );
  const pendentes = new Set(
    anexos.filter((a) => a.situacao === 'PENDENTE').map((a) => Number(a.documento_tipo_id)).filter(Boolean)
  );

  const resumir = (tipo) => ({ id: tipo.id, codigo: tipo.codigo, nome: tipo.nome });
  const idDe = (tipo) => Number(tipo.id);

  return {
    vinculo,
    exigeConferencia: true,
    faltando: obrigatorios
      .filter((t) => !validados.has(idDe(t)) && !pendentes.has(idDe(t)))
      .map(resumir),
    aguardandoValidacao: obrigatorios
      .filter((t) => !validados.has(idDe(t)) && pendentes.has(idDe(t)))
      .map(resumir),
    entregues: obrigatorios.filter((t) => validados.has(idDe(t))).map(resumir),
    // Conta os anexos, nao os tipos: dois arquivos do mesmo tipo esperando sao duas conferencias.
    anexosAguardando: anexos.filter((a) => a.situacao === 'PENDENTE').length,
    anexosRecusados: anexos.filter((a) => a.situacao === 'RECUSADO').length
  };
}

/**
 * Copia os anexos do pedido para os documentos do colaborador, na aprovacao.
 *
 * So os TIPADOS viram documento: anexo avulso continua sendo prova do pedido, mas nao entra na
 * pasta do colaborador — `rh_documentos.documento_tipo_id` e obrigatorio.
 *
 * `documento_gerado_id` impede duplicar se isto rodar duas vezes. A Fase 2 ja recusa aprovar duas
 * vezes; defesa de dado nao se apoia numa camada so.
 */
async function transferirAnexosParaOColaborador(solicitacao, colaboradorId, contexto, transaction) {
  /**
   * SO O QUE O DP ATESTOU ENTRA NA PASTA (26/08).
   *
   * `situacao: 'VALIDADO'` e a linha mais importante deste arquivo depois do efeito da aprovacao.
   * Sem ela, aprovar o pedido levaria para a pasta do colaborador tudo que a obra tivesse anexado —
   * inclusive o que o DP recusou, e o que ele ainda nem olhou.
   *
   * O anexo PENDENTE nao se perde: continua no pedido, e o DP pode atestar depois. Mas ele nao vira
   * documento oficial sem alguem por o nome nisso.
   */
  const anexos = await RhSolicitacaoAnexo.findAll({
    where: { solicitacao_id: solicitacao.id, documento_gerado_id: null, situacao: 'VALIDADO' },
    transaction
  });

  const gerados = [];
  for (const anexo of anexos) {
    if (!anexo.documento_tipo_id) continue;

    // eslint-disable-next-line no-await-in-loop
    const documento = await RhDocumento.create(
      {
        colaborador_id: colaboradorId,
        documento_tipo_id: anexo.documento_tipo_id,
        nome_original: anexo.nome_original,
        arquivo_url: anexo.arquivo_url,
        mimetype: anexo.mimetype,
        tamanho_bytes: anexo.tamanho_bytes,
        validade: anexo.validade,
        status: 'VALIDO',
        ativo: true,
        // O rastro de quem atestou vai JUNTO para a pasta: la e onde alguem vai procurar depois.
        observacoes: [
          `Recebido na solicitacao #${solicitacao.id}.`,
          anexo.observacao_validacao ? `Conferencia do DP: ${anexo.observacao_validacao}` : null
        ].filter(Boolean).join(' '),
        criado_por: contexto.usuarioId || null,
        atualizado_por: contexto.usuarioId || null
      },
      { transaction }
    );

    // eslint-disable-next-line no-await-in-loop
    await anexo.update({ documento_gerado_id: documento.id }, { transaction });
    gerados.push(documento.id);
  }

  return gerados;
}

/** Um pedido com o rastro dele, do mais antigo para o mais novo. */
async function detalharSolicitacao(id) {
  const solicitacao = await RhSolicitacao.findByPk(id, {
    include: [
      { model: RhColaborador, as: 'colaborador', required: false },
      { model: Obra, as: 'obra', required: false },
      {
        model: RhSolicitacaoHistorico,
        as: 'historicos',
        required: false,
        include: [{ model: User, as: 'usuario', attributes: ['id', 'nome'], required: false }]
      }
    ],
    order: [[{ model: RhSolicitacaoHistorico, as: 'historicos' }, 'id', 'ASC']]
  });

  if (!solicitacao) throw new ValidationError('Solicitacao de pessoal nao encontrada.', 404);
  return solicitacao;
}

module.exports = {
  TIPOS,
  SITUACOES,
  SUBTIPOS_MOVIMENTACAO,
  MOTIVOS_DEMISSAO,
  diasDeAfastamento,
  efeitoDoPedido,
  abrirSolicitacao,
  enviarSolicitacao,
  marcarNoChecklist,
  pendenciasDeDocumento,
  apontamentosDoColaborador,
  aprovarSolicitacao,
  rejeitarSolicitacao,
  reenviarSolicitacao,
  cancelarSolicitacao,
  pedidosAbertosPorColaborador,
  detalharSolicitacao,
  anexarNoPedido,
  conferirDocumentacao,
  validarAnexo,
  anexosDoPedido
};
