// Catalogo real compartilhado com backend: sem banco, sessao ou API externa.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const nav = require('../../backend/src/generated/navegacaoFonteUnica.cjs');
const base = { id: 1, perfil: 'USUARIO', area: 'DP', setor: { codigo: 'DP' },
  modulos_habilitados: [{ key: 'RH_DP', enabled: true }], areas_permissoes_configuradas: true,
  areas_permissoes: ['rh_dp.colaboradores.visualizar'] };
const globalId = 'rhdp-solicitacoes-globais';
const locaisId = 'rhdp-pessoal';
const itens = u => nav.getVisibleModule(u, 'rhdp')?.children || [];
assert.equal(itens(base).find(i => i.id === locaisId).to, '/rh-dp/pessoal');
assert.equal(itens(base).find(i => i.id === globalId).to, '/rh-dp/pessoal?visao=global&aba=solicitacoes');
// Backend permite leitura de pedidos a quem pode ver colaboradores; nao
// criar exigencia granular nova, nem conceder operacoes pelo novo card.
for (const perfil of ['SUPERADMIN', 'ADMINISTRADOR']) {
  assert.ok(itens({ ...base, perfil, area: null, setor: null }).some(i => i.id === globalId));
}
const obra = { ...base, area: 'OBRA', setor: { codigo: 'OBRA' },
  areas_permissoes: [...base.areas_permissoes, 'rh_dp.solicitacoes.ver_todas'] };
assert.ok(itens(obra).some(i => i.id === locaisId));
assert.equal(itens(obra).some(i => i.id === globalId), false);
assert.equal(itens({ ...base, setores: [{ codigo: 'OBRA' }] }).some(i => i.id === globalId), false);
const financeiro = { ...base, area: 'FINANCEIRO', setor: { codigo: 'FINANCEIRO' } };
assert.equal(itens(financeiro).some(i => i.id === globalId), false);
assert.ok(itens({ ...financeiro, areas_permissoes: [...base.areas_permissoes, 'rh_dp.solicitacoes.ver_todas'] }).some(i => i.id === globalId));
assert.equal(itens({ ...base, areas_permissoes: [] }).some(i => i.id === globalId), false);
assert.equal(itens({ ...base, modulos_habilitados: [{ key: 'RH_DP', enabled: false }] }).some(i => i.id === globalId), false);
for (const query of ['', '?local_id=7&aba=colaboradores', '?local_id=7&aba=solicitacoes']) {
  assert.equal(nav.findActiveNode(base, '/rh-dp/pessoal', query).item.id, locaisId,
    'Solicitacao do local nao pode ser rotulada como global no breadcrumb');
}
assert.equal(nav.findActiveNode(base, '/rh-dp/pessoal', '?visao=global&aba=solicitacoes').item.id, globalId);
assert.equal(nav.findFixableByPath(base, '/rh-dp/pessoal', '?visao=global&aba=solicitacoes').id, globalId);
assert.equal(nav.findFixableByPath(base, '/rh-dp/pessoal', '').id, locaisId);
assert.equal(nav.getFixableItems(obra).some(i => i.id === globalId), false);
assert.ok(nav.getFixableItems(base).some(i => i.id === globalId));
console.log('Hub RH/DP: cards global/local, DP/admin, negativos OBRA/permissoes/modulo, breadcrumb e atalhos aprovados. Sem banco/rede.');
