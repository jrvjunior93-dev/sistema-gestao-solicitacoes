'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  validateComercialUnidadeDeleteBody
} = require('../src/validators/commercialValidators');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

const service = read('backend/src/services/comercialService.js');
const importService = read('backend/src/services/comercialContratoImportacaoService.js');
const routes = read('backend/src/routes.js');
const model = read('backend/src/models/UnidadeComercial.js');
const migration = read('backend/migrations/202609150001_comercial_unidade_exclusao_logica.js');
const page = read('frontend/src/pages/ComercialUnidades.jsx');

assert.deepEqual(validateComercialUnidadeDeleteBody({ motivo: 'Cadastro duplicado.' }), {
  motivo: 'Cadastro duplicado.'
});
assert.throws(
  () => validateComercialUnidadeDeleteBody({ motivo: '   ' }),
  /Motivo da exclusao e obrigatorio/
);
assert(
  migration.includes("'excluido_em'")
    && migration.includes("'excluido_por'")
    && migration.includes("'motivo_exclusao'"),
  'A migration precisa preservar data, usuario e motivo da exclusao.'
);
assert(
  model.includes('excluido_em:') && model.includes('excluido_por:') && model.includes('motivo_exclusao:'),
  'O modelo da unidade precisa expor os campos de rastreabilidade.'
);
assert(
  routes.includes("router.delete('/comercial/unidades/:id'")
    && routes.includes('allowComercialEmpreendimentosManage')
    && routes.includes('criticalRateLimit'),
  'A exclusao precisa reutilizar a permissao de gerenciamento e a protecao de operacao critica.'
);
assert(
  service.includes('async function excluirUnidadeComercial')
    && service.includes('localizarContratoBloqueanteDaUnidade(unidade.id, null, transaction)')
    && service.includes("tipoEvento: 'COMMERCIAL_UNIT_SOFT_DELETED'")
    && service.includes('ativo: false'),
  'A exclusao precisa ser logica, auditada e bloquear unidades comprometidas por contrato.'
);
assert(
  service.includes("A unidade foi excluida e nao pode receber contrato comercial."),
  'Unidades excluidas nao podem voltar a ser usadas em novos contratos.'
);
assert(
  importService.includes('lockedUnits.some((unit) => unit.ativo === false)'),
  'A confirmacao da importacao precisa rejeitar unidade excluida depois do preview.'
);
assert(
  page.includes('Confirmar exclusao')
    && page.includes('motivoExclusao')
    && page.includes('item.excluidoPor?.nome'),
  'A interface precisa confirmar a exclusao e exibir sua rastreabilidade.'
);

console.log('Exclusao logica de unidades comerciais validada com sucesso.');
