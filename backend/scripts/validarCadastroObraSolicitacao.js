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

function run() {
  const behavior = normalizeTipoSolicitacaoBehavior({
    codigo_interno: 'CADASTRO_DE_OBRA',
    comportamento: {
      usa_fluxo_cadastro_obra: true,
      somente_gerencia_processos: true,
      finalidade_data_vencimento: 'RESPOSTA',
      mostrar_valor: false,
      exige_valor: false,
      mostrar_descricao: true,
      exige_descricao: true,
      mostrar_anexos: true,
      exige_anexos: true
    }
  });

  assert.strictEqual(behavior.usa_fluxo_cadastro_obra, true);
  assert.strictEqual(behavior.somente_gerencia_processos, true);
  assert.strictEqual(behavior.finalidade_data_vencimento, 'RESPOSTA');

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
  assert(!migrationSource.includes('describeTable'), 'A migration deve usar os helpers compativeis do runner.');
  assert(migrationSource.includes('disponivel_para_obras = 1'));
  assert(migrationSource.includes('somente_gerencia_processos: true'));

  console.log('Validacao do fluxo CADASTRO DE OBRA concluida com sucesso.');
}

run();
