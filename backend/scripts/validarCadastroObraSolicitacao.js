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
  assert.strictEqual(behavior.exige_anexos, true);

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
  const esperados = [
    'anexos',
    'area_responsavel',
    'data_vencimento',
    'descricao',
    'obra',
    'pessoas_vinculadas'
  ].sort();

  assert.deepStrictEqual(visiveis, esperados);
  assert.deepStrictEqual(obrigatorios, esperados);

  const payload = validateSolicitacaoCreateBody({
    obra_id: 1,
    tipo_solicitacao_id: 999,
    descricao: 'Obra de teste',
    data_vencimento: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    cadastro_obra_usuario_ids: [3, 2, 3],
    anexos_pendentes_nomes: ['orcamento.xlsx']
  });
  assert.deepStrictEqual(payload.cadastro_obra_usuario_ids, [3, 2]);

  assert.throws(
    () => validateSolicitacaoCreateBody({
      obra_id: 1,
      tipo_solicitacao_id: 999,
      cadastro_obra_usuario_ids: ['invalido']
    }),
    /pessoas vinculadas/i
  );

  const migrationSource = fs.readFileSync(
    path.resolve(__dirname, '../migrations/202609290003_cadastro_obra_solicitacao.js'),
    'utf8'
  );
  assert.doesNotThrow(() => assertMigrationSourceIsSchemaOnly(
    '202609290003_cadastro_obra_solicitacao.js',
    migrationSource
  ));
  assert(!migrationSource.includes('describeTable'), 'A migration deve usar os helpers compativeis do runner.');
  assert(!/\bINSERT\s+INTO\b/i.test(migrationSource), 'A migration nao pode cadastrar o tipo.');
  assert(!/\bUPDATE\s+[^\r\n]+\s+SET\b/i.test(migrationSource), 'A migration nao pode atualizar cadastros.');

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
