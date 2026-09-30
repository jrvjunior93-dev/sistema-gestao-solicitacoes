const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  normalizeTipoSolicitacaoBehavior
} = require('../src/services/tipoSolicitacaoBehaviorService');
const {
  resolverCamposNovaSolicitacao
} = require('../src/services/novaSolicitacaoCamposConfig');
const {
  validateSolicitacaoCreateBody
} = require('../src/validators/operationalValidators');
const {
  assertMigrationSourceIsSchemaOnly
} = require('../src/database/runMigrations');

function run() {
  const behavior = normalizeTipoSolicitacaoBehavior({
    codigo_interno: 'CADASTRO_DE_OBRA',
    comportamento: null
  });

  assert.strictEqual(behavior.usa_fluxo_cadastro_obra, true);
  assert.strictEqual(behavior.somente_gerencia_processos, true);
  assert.strictEqual(behavior.finalidade_data_vencimento, 'RESPOSTA');
  assert.strictEqual(behavior.mostrar_valor, false);
  assert.strictEqual(behavior.mostrar_credor, false);
  assert.strictEqual(behavior.mostrar_anexos, true);
  assert.strictEqual(behavior.exige_anexos, false);

  const campos = resolverCamposNovaSolicitacao(
    behavior,
    { regras: {} },
    999,
    { areaResponsavel: 'GEO' }
  );
  const visiveis = Object.values(campos)
    .filter((campo) => campo.visivel)
    .map((campo) => campo.id)
    .sort();
  const obrigatorios = Object.values(campos)
    .filter((campo) => campo.obrigatorio)
    .map((campo) => campo.id)
    .sort();
  const esperados = ['anexos', 'descricao'].sort();
  const obrigatoriosEsperados = ['descricao'];

  assert.deepStrictEqual(visiveis, esperados);
  assert.deepStrictEqual(obrigatorios, obrigatoriosEsperados);

  const payload = validateSolicitacaoCreateBody({
    tipo_solicitacao_id: 999,
    descricao: 'Obra de teste',
    cadastro_obra_usuario_ids: [3],
    cadastro_obra_dados: {
      tipo_obra: 'PRIVADA',
      fase_obra: 'PRE_OBRA',
      valor_obra: 250000,
      responsavel_tecnico_id: 3,
      endereco: 'Rua de teste, 100'
    },
    cadastro_obra_documentos_nomes: ['art.pdf']
  });
  assert.strictEqual(payload.obra_id, undefined);
  assert.strictEqual(payload.cadastro_obra_dados.fase_obra, 'PRE_OBRA');
  assert.strictEqual(payload.cadastro_obra_dados.valor_obra, 250000);
  assert.deepStrictEqual(payload.cadastro_obra_documentos_nomes, ['art.pdf']);

  assert.throws(
    () => validateSolicitacaoCreateBody({
      tipo_solicitacao_id: 999,
      cadastro_obra_dados: { campo_invalido: true }
    }),
    /campos nao permitidos/i
  );

  const migrationSource = fs.readFileSync(
    path.resolve(__dirname, '../migrations/202609300002_cadastro_obra_fluxo_independente.js'),
    'utf8'
  );
  assert.doesNotThrow(() => assertMigrationSourceIsSchemaOnly(
    '202609300002_cadastro_obra_fluxo_independente.js',
    migrationSource
  ));
  assert(!migrationSource.includes('describeTable'), 'A migration deve usar os helpers compativeis do runner.');
  assert(!/\bINSERT\s+INTO\b/i.test(migrationSource), 'A migration nao pode cadastrar o tipo.');
  assert(!/\bUPDATE\s+[^\r\n]+\s+SET\b/i.test(migrationSource), 'A migration nao pode atualizar cadastros.');
  assert(migrationSource.includes("changeColumn('solicitacoes', 'obra_id'"));
  assert(migrationSource.includes('solicitacao_cadastro_obra_dados'));
  assert(migrationSource.includes("resolveTableName(sequelize, ['Obras', 'obras'], 'Obras')"));
  assert(!migrationSource.includes("references: { model: 'obras'"));
  assert(migrationSource.includes("name: 'fk_solicitacoes_obra_id_obras'"));

  const solicitacaoControllerSource = fs.readFileSync(
    path.resolve(__dirname, '../src/controllers/SolicitacaoController.js'),
    'utf8'
  );
  assert(solicitacaoControllerSource.includes('if (!usaFluxoCadastroObra && !obra_id)'));
  assert(solicitacaoControllerSource.includes('resolverDestinoInicialNovaSolicitacao()'));
  assert(solicitacaoControllerSource.includes('const area_responsavel = areaResponsavelPersistida'));
  assert(solicitacaoControllerSource.includes("documentacao_pendente: faseObra === 'PRE_OBRA'"));

  const obraControllerSource = fs.readFileSync(
    path.resolve(__dirname, '../src/controllers/ObraController.js'),
    'utf8'
  );
  assert(obraControllerSource.includes('solicitacao_cadastro_origem_id'));
  assert(obraControllerSource.includes('Esta solicitacao ja gerou uma obra'));
  assert(obraControllerSource.includes("tipo: 'PLANILHA_ORCAMENTARIA'"));

  const disponibilidadeSource = fs.readFileSync(
    path.resolve(__dirname, '../src/services/tipoSolicitacaoDisponibilidadeService.js'),
    'utf8'
  );
  assert(disponibilidadeSource.includes('garantirTipoCadastroObra'));
  assert(disponibilidadeSource.includes("codigo: 'CADASTRO_DE_OBRA'"));
  assert(disponibilidadeSource.includes('disponivel_para_obras: true'));

  console.log('Validacao do fluxo CADASTRO DE OBRA concluida com sucesso.');
}

run();
