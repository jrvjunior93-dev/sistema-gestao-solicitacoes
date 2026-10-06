const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sql = require('sequelize');

// Controllers/servico reais; persistencia substituida em memoria. Nao carrega .env.
const empresa = { nome: 'Empresa teste', cnpj: '04252011000110', whatsapp: '27999999999',
  nome_fantasia: 'Fantasia teste', representante_nome: 'Representante teste',
  representante_cpf: '52998224725', representante_cargo: 'Diretor',
  contato: 'Contato comercial', categoria_insumos: ['Eletrico'] };
const parceiros = [], fornecedores = [];
let permitido = true, transacoes = 0;
const plain = value => JSON.parse(JSON.stringify(value));
function registro(row) {
  return Object.assign(row, {
    async update(data, opts) { assert.ok(opts?.transaction || !data.parceiro_id); Object.assign(this, data); },
    async reload(opts) {
      if (opts?.include) this.parceiro = parceiros.find(p => p.id === this.parceiro_id) || null;
      return this;
    }
  });
}
const models = {
  Parceiro: { findOne: async ({ where }) => parceiros.find(p => p.cpf_cnpj === where.cpf_cnpj) || null },
  FornecedorCompra: {
    findOne: async ({ where }) => fornecedores.find(f => (!where.id || f.id !== where.id[sql.Op.ne]) && where[sql.Op.or].some(w =>
      Object.entries(w).every(([k, v]) => f[k] === v))) || null,
    create: async (data, opts) => { assert.ok(opts.transaction); const row = registro({ id: fornecedores.length + 1, ...data }); fornecedores.push(row); return row; },
    findByPk: async (id, opts) => { const row = fornecedores.find(f => f.id === Number(id)); return row ? row.reload(opts) : null; },
    findAll: async opts => { assert.equal(opts.include[0].required, false); assert.equal(opts.include[0].as, 'parceiro'); return Promise.all(fornecedores.map(f => f.reload(opts))); }
  },
  sequelize: { async transaction(callback) {
    transacoes++;
    const snapshot = plain({ parceiros, fornecedores });
    try { return await callback({ fixture: true }); }
    catch (error) {
      parceiros.splice(0, parceiros.length, ...snapshot.parceiros);
      fornecedores.splice(0, fornecedores.length, ...snapshot.fornecedores.map(registro));
      throw error;
    }
  } }
};
const parceiroService = {
  normalizarCpfCnpj: value => String(value || '').replace(/\D/g, ''),
  async criarParceiro(data, opts) {
    assert.ok(opts.transaction);
    assert.ok(data.cpf_cnpj);
    if (data.cpf_cnpj.length === 14 && (!data.nome_fantasia || !data.representante_nome || !data.representante_cpf)) {
      throw new Error('Informe o nome fantasia e representante legal.');
    }
    const row = { id: parceiros.length + 10, ...data }; parceiros.push(row); return row;
  },
  async atualizarParceiro(id, data, opts) {
    assert.ok(opts.transaction); const row = parceiros.find(p => p.id === id); Object.assign(row, data); return row;
  }
};
function carregar(relative, overrides) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src', relative), 'utf8'), {
    module, exports: module.exports, require: name => {
      if (name === 'sequelize') return sql;
      if (name === '../models') return models;
      if (name in overrides) return overrides[name];
      throw new Error(`Dependencia nao autorizada: ${name}`);
    }, console: { error() {} }
  });
  return module.exports;
}
const service = carregar('services/comprasFornecedorService.js', { './parceiroService': parceiroService });
const controller = carregar('controllers/FornecedorCompraController.js', {
  '../services/comprasFornecedorService': service,
  '../services/authorizationService': { canManageComprasFornecedores: () => permitido, canViewComprasFornecedores: () => permitido }
});
async function chamar(action, body = {}, id = 1) {
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(data) { this.body = plain(data); return this; } };
  await controller[action]({ body, params: { id }, query: {}, user: { id: 2 } }, res); return res;
}
(async () => {
  const novo = await chamar('create', empresa);
  assert.equal(novo.statusCode, 201);
  for (const campo of ['nome_fantasia', 'representante_nome', 'representante_cpf', 'representante_cargo']) assert.equal(novo.body.parceiro[campo], empresa[campo]);
  assert.equal(novo.body.contato, empresa.contato, 'Contato comercial separado do representante legal');
  assert.equal((await chamar('index')).body[0].parceiro.nome_fantasia, empresa.nome_fantasia);
  assert.equal((await chamar('show')).body.parceiro.nome_fantasia, empresa.nome_fantasia);
  const editado = await chamar('update', { nome_fantasia: 'Novo fantasia' });
  assert.equal(editado.body.id, novo.body.id);
  assert.equal(editado.body.parceiro.nome_fantasia, 'Novo fantasia');
  assert.equal(editado.body.parceiro.representante_nome, empresa.representante_nome);
  assert.equal((await chamar('update', { contato: 'Novo contato' })).body.parceiro.nome_fantasia, 'Novo fantasia');
  await chamar('create', empresa);
  assert.equal(fornecedores.length, 1, 'Reutiliza fornecedor existente pelo documento');
  assert.equal(parceiros.length, 1);
  const pf = await chamar('create', { nome: 'Pessoa teste', cnpj: '52998224725', whatsapp: empresa.whatsapp });
  assert.equal(pf.statusCode, 201);
  const antes = fornecedores.length;
  assert.equal((await chamar('create', { ...empresa, cnpj: '11444777000161', nome_fantasia: '' })).statusCode, 400);
  assert.equal(fornecedores.length, antes, 'Erro nao cria registro parcial');
  fornecedores.push(registro({ id: 50, nome: 'Avulso', cnpj: '11444777000161', parceiro_id: null, ativo: true }));
  assert.equal((await chamar('update', { contato: 'Legado' }, 50)).body.parceiro_id, null, 'Edicao simples nao migra avulsos');
  const vinculado = await chamar('update', { ...empresa, cnpj: '11444777000161' }, 50);
  assert.equal(vinculado.statusCode, 200);
  assert.equal(vinculado.body.id, 50, 'Vinculo de avulso a Pessoas preserva ID das cotacoes');
  assert.equal(vinculado.body.parceiro.nome_fantasia, empresa.nome_fantasia);
  assert.equal(fornecedores.length, antes + 1);
  fornecedores.push(registro({ id: 51, nome: 'Outro avulso', cnpj: empresa.cnpj, parceiro_id: null, ativo: true }));
  const duplicado = await chamar('update', { ...empresa, nome_fantasia: 'Nao pode sobrescrever' }, 51);
  assert.equal(duplicado.statusCode, 400);
  assert.match(duplicado.body.error, /outro fornecedor/);
  assert.equal(fornecedores.find(f => f.id === 51).parceiro_id, null);
  assert.equal(parceiros.find(p => p.cpf_cnpj === empresa.cnpj).nome_fantasia, empresa.nome_fantasia, 'Conflito reverte a escrita central');
  permitido = false; const txAntes = transacoes;
  for (const action of ['create', 'update', 'index', 'show']) assert.equal((await chamar(action, empresa)).statusCode, 403);
  assert.equal(transacoes, txAntes, 'Sem permissao nao inicia escrita');
  console.log('Fornecedores: empresa, PF, leitura, edicao parcial, legado, ID, rollback e permissoes validados sem banco.');
})().catch(error => { console.error(error); process.exitCode = 1; });
