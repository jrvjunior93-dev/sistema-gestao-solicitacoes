const assert = require('assert');
const { Op } = require('sequelize');
const { sequelize, Obra, RhColaborador, RhColaboradorVinculo, RhSolicitacao,
  RhSolicitacaoHistorico, RhSolicitacaoAnexo, CrResponsavelObra, UsuarioObra } = require('../src/models');
const {
  canAccessRhDp,
  canManageRhDpColaboradores,
  canViewRhDpColaboradores,
  canViewRhDpDashboard,
  canViewRhDpDocumentos,
  canViewRhDpObrigacoes,
  getRhDpObraScopeIds,
  userHasStrictAreaPermission
} = require('../src/services/authorizationService');
const permit = require('../src/middlewares/permissions');
const {
  __test: rhServiceTest,
  detalharColaboradorRh,
  listarColaboradoresRh
} = require('../src/services/rhService');
const rhSolicitacaoService = require('../src/services/rhSolicitacaoService');
const rhTransferenciaService = require('../src/services/rhTransferenciaService');
const { hojeLocal } = require('../src/services/rhPessoalDomain');

async function executar() {
  assert.strictEqual(rhServiceTest.normalizeCpfSearch('QA-RHDP-001'), '',
    'matricula alfanumerica nao pode virar pesquisa parcial de CPF');
  assert.strictEqual(rhServiceTest.normalizeCpfSearch('123.456.789-01'), '12345678901',
    'uma pesquisa formatada como CPF deve ser normalizada');
  assert.strictEqual(rhServiceTest.normalizeCpfSearch(' 123456 '), '123456',
    'pesquisa numerica parcial de CPF deve continuar disponivel');

  const usuarioObra = {
    id: 987654,
    perfil: 'USUARIO',
    setor: { id: 1, codigo: 'OBRA', nome: 'Obra', eh_setor_obra: true }
  };

  assert.strictEqual(await canAccessRhDp(usuarioObra), true, 'OBRA deve acessar o modulo RH/DP');
  assert.strictEqual(await canViewRhDpColaboradores(usuarioObra), true, 'OBRA deve acessar Pessoal');
  assert.strictEqual(await canManageRhDpColaboradores(usuarioObra), false, 'OBRA nao gerencia o cadastro geral');
  assert.strictEqual(await canViewRhDpDashboard(usuarioObra), false, 'OBRA nao acessa relatorios do RH/DP');
  assert.strictEqual(await canViewRhDpDocumentos(usuarioObra), false, 'OBRA nao acessa a area geral de documentos');
  assert.strictEqual(await canViewRhDpObrigacoes(usuarioObra), false, 'OBRA nao acessa fechamentos');

  const originalFindAll = UsuarioObra.findAll;
  UsuarioObra.findAll = async ({ where }) => {
    assert.strictEqual(Number(where.user_id), usuarioObra.id, 'o escopo deve usar o usuario autenticado');
    return [{ obra_id: 12 }, { obra_id: 12 }, { obra_id: 35 }];
  };

  try {
    assert.deepStrictEqual(
      await getRhDpObraScopeIds(usuarioObra),
      [12, 35],
      'o escopo do RH/DP deve conter somente as obras vinculadas, sem duplicidade'
    );
  } finally {
    UsuarioObra.findAll = originalFindAll;
  }

  const originalColaboradorFindAll = RhColaborador.findAll;
  const originalColaboradorFindOne = RhColaborador.findOne;
  const originalPedidosAbertos = rhSolicitacaoService.pedidosAbertosPorColaborador;

  RhColaborador.findAll = async ({ where }) => {
    assert.deepStrictEqual(where.obra_id[Op.in], [12, 35], 'a listagem deve filtrar pelas obras vinculadas');
    return [];
  };
  RhColaborador.findOne = async ({ where }) => {
    assert.strictEqual(Number(where.id), 55, 'o detalhe deve preservar o colaborador solicitado');
    assert.deepStrictEqual(where.obra_id[Op.in], [12, 35], 'o detalhe deve exigir obra vinculada');
    return null;
  };
  rhSolicitacaoService.pedidosAbertosPorColaborador = async () => new Map();

  try {
    assert.deepStrictEqual(await listarColaboradoresRh({ obra_ids: [12, 35] }), []);
    await assert.rejects(
      () => listarColaboradoresRh({ obra_id: 99, obra_ids: [12, 35] }),
      (error) => error.statusCode === 403
    );
    await assert.rejects(
      () => detalharColaboradorRh(55, { obra_ids: [12, 35] }),
      (error) => error.statusCode === 403
    );
  } finally {
    RhColaborador.findAll = originalColaboradorFindAll;
    RhColaborador.findOne = originalColaboradorFindOne;
    rhSolicitacaoService.pedidosAbertosPorColaborador = originalPedidosAbertos;
  }

  // Um usuario envolvido pode anexar um arquivo avulso enquanto a solicitacao esta em tratamento;
  // a classificacao e opcional, mas o evento de auditoria e obrigatorio.
  const originaisAnexo = {
    transaction: sequelize.transaction,
    solicitacaoFindByPk: RhSolicitacao.findByPk,
    anexoCreate: RhSolicitacaoAnexo.create,
    historicoCreate: RhSolicitacaoHistorico.create
  };
  const eventosDoAnexo = [];
  sequelize.transaction = async (callback) => callback({});
  RhSolicitacao.findByPk = async () => ({ id: 701, situacao: 'ABERTA' });
  RhSolicitacaoAnexo.create = async (dados) => ({ id: 801, ...dados });
  RhSolicitacaoHistorico.create = async (dados) => {
    eventosDoAnexo.push(dados);
    return dados;
  };

  try {
    const anexo = await rhSolicitacaoService.anexarNoPedido(
      701,
      { arquivo_url: '/uploads/atestado.pdf', nome_original: 'atestado.pdf' },
      { usuarioId: 44, setor: 'OBRA' }
    );
    assert.strictEqual(anexo.documento_tipo_id, null, 'anexo avulso deve poder ficar sem classificacao');
    assert.strictEqual(eventosDoAnexo[0].acao, 'ANEXO', 'o upload deve registrar evento no historico');
    assert.strictEqual(eventosDoAnexo[0].usuario_id, 44, 'o historico deve identificar quem anexou');
  } finally {
    sequelize.transaction = originaisAnexo.transaction;
    RhSolicitacao.findByPk = originaisAnexo.solicitacaoFindByPk;
    RhSolicitacaoAnexo.create = originaisAnexo.anexoCreate;
    RhSolicitacaoHistorico.create = originaisAnexo.historicoCreate;
  }

  const superadmin = { id: 123456, perfil: 'SUPERADMIN' };
  assert.strictEqual(
    await getRhDpObraScopeIds(superadmin),
    null,
    'SUPERADMIN deve possuir escopo global no RH/DP'
  );
  assert.strictEqual(
    await userHasStrictAreaPermission(superadmin, ['permissao.nao.configurada']),
    true,
    'SUPERADMIN deve ignorar permissoes granulares estritas'
  );

  let middlewareLiberou = false;
  await permit({
    profiles: ['PERFIL_INEXISTENTE'],
    scopeTokens: ['escopo.inexistente'],
    requireObraAccess: true,
    custom: async () => false
  })(
    { user: superadmin, originalUrl: '/validacao-superadmin', params: {}, body: {}, query: {} },
    { status: () => { throw new Error('SUPERADMIN nao pode ser bloqueado pelo middleware de permissao'); } },
    () => { middlewareLiberou = true; }
  );
  assert.strictEqual(middlewareLiberou, true, 'SUPERADMIN deve passar pelo middleware central');

  const originalObraFindAll = Obra.findAll;
  Obra.findAll = async ({ where }) => {
    assert.strictEqual(
      where.tipo_centro_custo,
      'OBRA',
      'a configuracao da transferencia nao deve consultar centros de custo'
    );
    return [
      { id: 12, get: () => ({ id: 12, nome: 'Obra A', codigo: 'A', tipo_centro_custo: 'OBRA' }) },
      { id: 35, get: () => ({ id: 35, nome: 'Obra B', codigo: 'B', tipo_centro_custo: 'OBRA' }) }
    ];
  };

  try {
    const configuracao = await rhTransferenciaService.configuracao(superadmin);
    assert.deepStrictEqual(
      configuracao.obras_responsavel_ids,
      [12, 35],
      'a tela de transferencias deve tratar todas as obras ativas como acessiveis pelo SUPERADMIN'
    );
  } finally {
    Obra.findAll = originalObraFindAll;
  }

  assert.deepStrictEqual(
    rhTransferenciaService.resolverFluxoTransferencia(12, 35, [12]),
    { aprovacaoAutomatica: false, obraSolicitanteId: 12, obraAprovadoraId: 35 },
    'o responsavel da obra atual deve enviar a transferencia para aprovacao do destino'
  );
  assert.deepStrictEqual(
    rhTransferenciaService.resolverFluxoTransferencia(12, 35, [35]),
    { aprovacaoAutomatica: false, obraSolicitanteId: 35, obraAprovadoraId: 12 },
    'o responsavel do destino deve solicitar a transferencia para aprovacao da obra atual'
  );
  assert.deepStrictEqual(
    rhTransferenciaService.resolverFluxoTransferencia(12, 35, [12, 35]),
    { aprovacaoAutomatica: true, obraSolicitanteId: 12, obraAprovadoraId: null },
    'o responsavel pelas duas obras deve efetivar a transferencia sem segunda aprovacao'
  );
  assert.throws(
    () => rhTransferenciaService.resolverFluxoTransferencia(12, 35, [77]),
    (error) => error.statusCode === 403,
    'usuario sem responsabilidade na origem ou no destino nao pode solicitar a transferencia'
  );

  const originaisTransferencia = {
    transaction: sequelize.transaction,
    colaboradorFindByPk: RhColaborador.findByPk,
    vinculoFindOne: RhColaboradorVinculo.findOne,
    solicitacaoFindOne: RhSolicitacao.findOne,
    solicitacaoCreate: RhSolicitacao.create,
    historicoCreate: RhSolicitacaoHistorico.create,
    responsavelFindAll: CrResponsavelObra.findAll,
    obraFindAll: Obra.findAll,
    obraFindByPk: Obra.findByPk
  };
  const hoje = hojeLocal();
  const colaboradorAutomatico = {
    id: 91,
    status: 'ATIVO',
    obra_id: 12,
    setor_id: 8,
    data_admissao: '2020-01-01',
    data_demissao: null,
    update: async (dados) => Object.assign(colaboradorAutomatico, dados)
  };
  const vinculoAutomatico = {
    obra_id: 12,
    vigencia_inicio: hoje,
    update: async (dados) => Object.assign(vinculoAutomatico, dados)
  };
  let solicitacaoAutomatica = null;
  const historicosAutomaticos = [];

  sequelize.transaction = async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } });
  RhColaborador.findByPk = async () => colaboradorAutomatico;
  RhColaboradorVinculo.findOne = async () => vinculoAutomatico;
  CrResponsavelObra.findAll = async () => [
    { obra_id: 12, user_id: 44 },
    { obra_id: 35, user_id: 44 }
  ];
  Obra.findAll = async ({ where }) => {
    assert.strictEqual(
      where.tipo_centro_custo,
      'OBRA',
      'a abertura deve validar que origem e destino sao do tipo Obra'
    );
    return [
      { id: 12, ativo: true, tipo_centro_custo: 'OBRA' },
      { id: 35, ativo: true, tipo_centro_custo: 'OBRA' }
    ];
  };
  Obra.findByPk = async () => ({ id: 35, ativo: true, tipo_centro_custo: 'OBRA' });
  RhSolicitacao.findOne = async () => null;
  RhSolicitacao.create = async (dados) => {
    solicitacaoAutomatica = {
      id: 501,
      ...dados,
      update: async (alteracoes) => Object.assign(solicitacaoAutomatica, alteracoes)
    };
    return solicitacaoAutomatica;
  };
  RhSolicitacaoHistorico.create = async (dados) => {
    historicosAutomaticos.push(dados);
    return dados;
  };

  try {
    const resultado = await rhTransferenciaService.abrir(
      { id: 44, perfil: 'USUARIO', setor: { codigo: 'OBRA' } },
      { colaborador_id: 91, obra_destino_id: 35, justificativa: 'Transferencia operacional.' }
    );
    assert.strictEqual(resultado.aprovacao_automatica, true);
    assert.strictEqual(resultado.situacao, 'APROVADA');
    assert.strictEqual(colaboradorAutomatico.obra_id, 35, 'a lotacao atual deve mudar para o destino');
    assert.strictEqual(vinculoAutomatico.obra_id, 35, 'o vinculo vigente deve mudar para o destino');
    assert.strictEqual(solicitacaoAutomatica.dados_json.data_vigencia, hoje);
    assert.deepStrictEqual(
      historicosAutomaticos.map(item => item.acao),
      ['ABERTURA', 'APROVACAO_AUTOMATICA'],
      'a transferencia automatica deve manter trilha completa de auditoria'
    );
  } finally {
    sequelize.transaction = originaisTransferencia.transaction;
    RhColaborador.findByPk = originaisTransferencia.colaboradorFindByPk;
    RhColaboradorVinculo.findOne = originaisTransferencia.vinculoFindOne;
    RhSolicitacao.findOne = originaisTransferencia.solicitacaoFindOne;
    RhSolicitacao.create = originaisTransferencia.solicitacaoCreate;
    RhSolicitacaoHistorico.create = originaisTransferencia.historicoCreate;
    CrResponsavelObra.findAll = originaisTransferencia.responsavelFindAll;
    Obra.findAll = originaisTransferencia.obraFindAll;
    Obra.findByPk = originaisTransferencia.obraFindByPk;
  }

  const originalFindAndCountAll = RhColaborador.findAndCountAll;
  const originalUsuarioObraFindAll = UsuarioObra.findAll;
  UsuarioObra.findAll = async () => {
    throw new Error('SUPERADMIN nao deve depender de vinculo em usuario_obras para consultar o diretorio global');
  };
  RhColaborador.findAndCountAll = async ({ where, limit, offset }) => {
    assert.strictEqual(where.status, 'ATIVO');
    assert.strictEqual(limit, 50);
    assert.strictEqual(offset, 0);
    return {
      count: 1,
      rows: [{
        get: () => ({ id: 77, nome: 'Colaborador Global', matricula: 'G-1', cargo: 'Teste', obra_id: 12 })
      }]
    };
  };

  try {
    const diretorio = await rhTransferenciaService.diretorio(superadmin);
    assert.strictEqual(diretorio.total, 1, 'SUPERADMIN deve listar o diretorio global sem vinculo de obra');
    assert.strictEqual(diretorio.itens[0].id, 77);
  } finally {
    RhColaborador.findAndCountAll = originalFindAndCountAll;
    UsuarioObra.findAll = originalUsuarioObraFindAll;
  }

  const originalTransferenciaFindAndCountAll = RhSolicitacao.findAndCountAll;
  const originalObrasTransferenciaFindAll = Obra.findAll;
  const originalQueryTransferencia = sequelize.query;
  RhSolicitacao.findAndCountAll = async ({ where, limit, offset }) => {
    const filtroSituacao = where[Op.and].find(item => item?.situacao);
    assert.deepStrictEqual(
      filtroSituacao.situacao[Op.in],
      ['APROVADA', 'REJEITADA', 'CANCELADA'],
      'o historico deve consultar somente transferencias resolvidas'
    );
    assert.strictEqual(limit, 20, 'a listagem de transferencias deve ser paginada');
    assert.strictEqual(offset, 20, 'a segunda pagina deve respeitar o deslocamento');
    return {
      count: 21,
      rows: [{
        obra_id: 12,
        tipo: 'MOVIMENTACAO',
        subtipo: 'TRANSFERENCIA_OBRA',
        dados_json: { obra_destino_id: 35 },
        get: () => ({
          id: 902,
          tipo: 'MOVIMENTACAO',
          subtipo: 'TRANSFERENCIA_OBRA',
          colaborador_id: 77,
          colaborador: { id: 77, nome: 'Colaborador Global' },
          obra_id: 12,
          obra: { id: 12, nome: 'Obra A' },
          dados_json: {
            obra_destino_id: 35,
            obra_solicitante_id: 12,
            obra_aprovadora_id: 35,
            aprovacao_automatica: false
          },
          situacao: 'APROVADA',
          criada_por: 44,
          createdAt: new Date('2026-09-18T10:00:00Z'),
          updatedAt: new Date('2026-09-18T11:00:00Z')
        })
      }]
    };
  };
  Obra.findAll = async () => [{ id: 35, nome: 'Obra B' }];
  sequelize.query = async () => [[{
    solicitacao_id: 902,
    ultimo: 10,
    atividade_em: new Date('2026-09-18T11:00:00Z'),
    lido: 9
  }], {}];

  try {
    const historico = await rhTransferenciaService.listar(superadmin, {
      grupo: 'RESOLVIDAS',
      pagina: 2,
      limite: 20
    });
    assert.strictEqual(historico.total, 21);
    assert.strictEqual(historico.pagina, 2);
    assert.strictEqual(historico.total_paginas, 2);
    assert.strictEqual(historico.itens[0].obra_destino_nome, 'Obra B');
    assert.strictEqual(historico.itens[0].nao_lida, true);
  } finally {
    RhSolicitacao.findAndCountAll = originalTransferenciaFindAndCountAll;
    Obra.findAll = originalObrasTransferenciaFindAll;
    sequelize.query = originalQueryTransferencia;
  }

  console.log('Validacao dos escopos RH/DP para usuario de OBRA e SUPERADMIN concluida com sucesso.');
}

executar()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
