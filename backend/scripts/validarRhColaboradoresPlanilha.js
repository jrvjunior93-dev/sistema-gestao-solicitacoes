const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Op } = require('sequelize');
const ExcelJS = require('exceljs');
const { gerarPlanilhaColaboradores, COLUNAS } = require('../src/services/rhColaboradoresPlanilhaService');
const excel = require('../src/utils/excelWorkbook');

// Servicos reais com persistencia isolada em memoria: sem .env, banco ou rede.
class ValidationError extends Error {}
const plain = value => JSON.parse(JSON.stringify(value));
const registros = [], historicos = [], parceiros = [], pagamentos = [];
let txCount = 0;
function registro(data) {
  const row = { ...data };
  Object.defineProperties(row, {
    get: { value: () => plain({ ...row }) }, toJSON: { value: () => plain({ ...row }) },
    update: { value: async (values, options) => { assert.ok(options.transaction); Object.assign(row, values); return row; } }
  });
  return row;
}
function matches(row, where = {}) {
  return Reflect.ownKeys(where).every(key => {
    if (key === Op.or) return where[key].some(cond => matches(row, cond));
    const value = where[key];
    if (value && typeof value === 'object') {
      if (Op.in in value) return value[Op.in].includes(row[key]);
      if (Op.ne in value) return row[key] !== value[Op.ne];
      throw new Error(`Condicao fixture desconhecida: ${String(key)}`);
    }
    return row[key] === value;
  });
}
function model(rows) {
  return {
    findAll: async (options = {}) => rows.filter(r => matches(r, options.where)),
    findOne: async (options = {}) => rows.find(r => matches(r, options.where)) || null,
    findByPk: async (id, options = {}) => {
      if (options.lock) assert.equal(options.lock, 'UPDATE');
      return rows.find(r => Number(r.id) === Number(id)) || null;
    },
    create: async (data, options) => {
      assert.ok(options.transaction);
      const r = registro({ id: rows.length + 1, ...(rows === historicos ? { vigencia_fim: null } : {}), ...data }); rows.push(r); return r;
    }
  };
}
const models = {
  RhColaborador: model(registros), RhColaboradorCalculoHistorico: model(historicos),
  Parceiro: model(parceiros), RhColaboradorPagamento: model(pagamentos),
  RhEmpresaGrupo: model([registro({ id: 1, codigo: 'EMP-01', nome: 'Empresa teste' })]),
  Obra: model([registro({ id: 51, codigo: 'OBRA-01', nome: 'Obra teste' })]),
  Setor: model([registro({ id: 2, codigo: 'GEO', nome: 'GEO' })]),
  sequelize: { async transaction(callback) {
    txCount++;
    const snapshots = [registros, historicos, parceiros, pagamentos].map(plain);
    try { return await callback({ LOCK: { UPDATE: 'UPDATE' } }); }
    catch (error) {
      [registros, historicos, parceiros, pagamentos].forEach((rows, i) => rows.splice(0, rows.length, ...snapshots[i].map(registro)));
      throw error;
    }
  } }
};
function load(relative, overrides = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src', relative), 'utf8'), {
    module, exports: module.exports, Buffer, console, process: { env: { RH_JORNADA_40_60_ETAPAS: 'ON' } },
    require: name => {
      if (name in overrides) return overrides[name];
      if (name === 'sequelize') return require('sequelize');
      if (name === '../models') return models;
      if (name === '../middlewares/validation') return { ValidationError };
      if (name === '../utils/excelWorkbook') return excel;
      if (name === './s3') return {};
      if (name === './rhSolicitacaoService') return { pedidosAbertosPorColaborador: async () => new Map() };
      if (name === '../utils/fileName') return {};
      if (name === '../constants/empresaGrupo') return {};
      if (name === '../utils/cpfCnpj') return require('../src/utils/cpfCnpj');
      if (name === '../utils/pix') return require('../src/utils/pix');
      throw new Error(`Dependencia nao autorizada: ${name}`);
    }
  });
  return module.exports;
}
const historicoService = load('services/rhCalculoHistoricoService.js');
const service = load('services/rhService.js', {
  './rhCalculoHistoricoService': historicoService,
  './rhVinculoObraService': { registrarVinculo: async () => {}, encerrarVinculo: async () => {} }
});
const empresaService = load('services/parceiroService.js');
const usuario = { id: 2 };
async function importar(rows, options) {
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Colaboradores');
  ws.addRow(keys);
  rows.forEach(row => ws.addRow(keys.map(key => row[key] ?? '')));
  return service.importarColaboradoresRh({ buffer: Buffer.from(await wb.xlsx.writeBuffer()), originalname: 'teste.xlsx' }, usuario, options);
}
const base = { CPF: '01234567890', Matricula: '001', Empresa_Codigo: 'EMP-01' };

(async () => {
  const pj = { nome: 'Empresa teste', cpf_cnpj: '04252011000110', telefone: '27999999999', nome_fantasia: 'Fantasia' };
  await assert.rejects(() => empresaService.criarParceiro({ ...pj, nome_fantasia: '' }, { transaction: {} }), /nome fantasia/);
  await assert.rejects(() => empresaService.criarParceiro({ ...pj, representante_cpf: '123' }, { transaction: {} }), /CPF valido/);
  assert.equal((await empresaService.criarParceiro(pj, { transaction: {} })).nome_fantasia, 'Fantasia');
  await assert.rejects(() => empresaService.atualizarParceiro(parceiros[0].id, { representante_cpf: '123' }, { transaction: {} }), /CPF valido/);
  await empresaService.atualizarParceiro(parceiros[0].id, { representante_nome: '', representante_cpf: '' }, { transaction: {} });
  assert.equal(parceiros[0].representante_cpf, null);
  parceiros.splice(0);

  registros.push(registro({ id: 1, cpf: base.CPF, matricula: '001', nome: 'Colaborador teste', empresa_grupo_id: 1,
    obra_id: 51, setor_id: 2, tipo_vinculo: 'CLT', status: 'INATIVO', data_admissao: '2026-08-01',
    forma_calculo_gerencial: 'MENSAL', valor_diaria: null, pagamento_automatico_40_60: true,
    salario_base: '3000.00', valor_ticket: '250.00', pagamento: { agencia: '0001', conta: '001234-5', banco: 'Banco teste' },
    empresaGrupo: { codigo: 'EMP-01', nome: 'Empresa teste' }, obra: { codigo: 'OBRA-01', nome: 'Obra teste' }, setor: { codigo: 'GEO' } }));
  historicos.push(registro({ id: 1, colaborador_id: 1, vigencia_inicio: '2026-08-01', vigencia_fim: null, forma_calculo: 'MENSAL' }));
  const buffer = await gerarPlanilhaColaboradores(registros);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet('Colaboradores');
  assert.equal(ws.rowCount, 2);
  const column = header => COLUNAS.findIndex(([name]) => name === header) + 1;
  assert.equal(ws.getCell(2, column('CPF')).value, base.CPF, 'CPF com zero inicial e texto');
  assert.equal(ws.getCell(2, column('Agencia')).value, '0001');
  assert.equal(ws.getCell(2, column('Status')).value, 'INATIVO', 'Exporta tambem inativos');
  assert.equal(ws.getCell(2, column('Salario_Base')).value, 3000);
  assert.equal(ws.getCell(2, column('Tipo_Pagamento')).value, 'MENSALISTA');
  const original = { buffer, originalname: 'cadastro.xlsx' };
  const semMudanca = await service.importarColaboradoresRh(original, usuario);
  assert.equal(semMudanca.ignorados, 1); assert.equal(semMudanca.atualizados, 0); assert.equal(semMudanca.erros.length, 0);
  assert.equal(txCount, 0, 'Reimportacao identica nao escreve');
  const semVigencia = await importar([{ ...base, Tipo_Pagamento: 'DIARISTA', Valor_Diaria: 120.5 }]);
  assert.equal(semVigencia.erros.length, 1); assert.match(semVigencia.erros[0].error, /data efetiva/);
  assert.equal(registros[0].forma_calculo_gerencial, 'MENSAL', 'Erro faz rollback do cadastro');
  assert.equal(historicos.length, 1);
  const alteracao = { ...base, Tipo_Pagamento: 'DIARISTA', Valor_Diaria: '120,50', Calculo_Vigencia_Inicio: '2026-10-07',
    Nome: 'Nao pode mudar', Salario_Base: 99999, Obra_Codigo: 'Nao pode transferir', Banco: 'Nao pode mudar' };
  const atualizado = await importar([alteracao]);
  assert.equal(atualizado.atualizados, 1); assert.equal(atualizado.erros.length, 0);
  assert.equal(registros[0].forma_calculo_gerencial, 'DIARIA'); assert.equal(registros[0].valor_diaria, 120.5);
  assert.equal(registros[0].pagamento_automatico_40_60, false);
  assert.equal(registros[0].salario_base, '3000.00'); assert.equal(registros[0].nome, 'Colaborador teste');
  assert.equal(registros[0].obra_id, 51); assert.equal(registros[0].pagamento.banco, 'Banco teste');
  assert.equal(historicos.length, 2); assert.equal(historicos[0].vigencia_fim, '2026-10-06');
  const repetido = await importar([alteracao]); assert.equal(repetido.ignorados, 1); assert.equal(historicos.length, 2);
  const vazio = await importar([base]); assert.equal(vazio.ignorados, 1); assert.equal(registros[0].forma_calculo_gerencial, 'DIARIA');
  const scope = await importar([{ ...alteracao, Valor_Diaria: 150 }], { obra_ids: [10] });
  assert.match(scope.erros[0].error, /fora das obras autorizadas/); assert.equal(registros[0].valor_diaria, 120.5);
  const negativas = [
    { Tipo_Pagamento: 'DIARISTA', Valor_Diaria: -1 }, { Tipo_Pagamento: 'HORA' },
    { Tipo_Pagamento: 'DIARISTA', Forma_Calculo_Gerencial: 'MENSAL' },
    { Pagamento_Automatico_40_60: 'talvez' }, { CPF: '99999999999', Matricula: '001' },
    { Tipo_Pagamento: 'MENSALISTA', Calculo_Vigencia_Inicio: '2026-10-06' }
  ];
  for (const row of negativas) assert.equal((await importar([{ ...base, ...row }])).erros.length, 1, JSON.stringify(row));
  const duplicado = await importar([base, base]); assert.match(duplicado.erros[0].error, /repetido/);
  const modelo = await gerarPlanilhaColaboradores(); const modeloWb = new ExcelJS.Workbook(); await modeloWb.xlsx.load(modelo);
  assert.equal(modeloWb.getWorksheet('Colaboradores').rowCount, 1, 'Sem cadastros, gerador nao inclui linhas ficticias');
  assert.equal((await service.listarColaboradoresRh({ obra_ids: [] })).length, 0);
  assert.equal((await service.listarColaboradoresRh({ obra_ids: [51] })).length, 1);
  assert.equal((await service.listarColaboradoresRh({ obra_ids: [10] })).length, 0);
  const cadastrosAntesDoTesteLocal = registros.length;
  registros.push(
    registro({ id: 201, nome: 'Ativo no centro de custo', obra_id: 51, status: 'ATIVO' }),
    registro({ id: 202, nome: 'Ativo na outra obra', obra_id: 10, status: 'ATIVO' }),
    registro({ id: 203, nome: 'Afastado no centro de custo', obra_id: 51, status: 'AFASTADO' }),
    registro({ id: 204, nome: 'Ativo sem local', obra_id: null, status: 'ATIVO' })
  );
  const listarIds = async filtros => plain((await service.listarColaboradoresRh(filtros)).map(item => item.id));
  assert.deepEqual(await listarIds({ obra_ids: [10, 51], obra_id: '51', status: 'ATIVO' }), [201],
    'Card do centro de custo lista somente ativos com vinculo atual naquele local');
  assert.deepEqual(await listarIds({ obra_ids: [10, 51], obra_id: 10, status: 'ATIVO' }), [202]);
  assert.deepEqual(await listarIds({ obra_ids: [10, 51], obra_id: 51 }), [1, 201, 203],
    'Filtro de local nao esconde inativos/afastados no cadastro global');
  assert.deepEqual(await listarIds({ obra_ids: null, obra_id: 51, status: 'ATIVO' }), [201]);
  assert.deepEqual(await listarIds({ obra_ids: [10, 51] }), [1, 201, 202, 203],
    'Sem local selecionado, manter todos os locais autorizados');
  assert.deepEqual(await listarIds({ obra_ids: null }), [1, 201, 202, 203, 204]);
  assert.deepEqual(await listarIds({ obra_ids: [], obra_id: 51, status: 'ATIVO' }), []);
  await assert.rejects(() => service.listarColaboradoresRh({ obra_ids: [10], obra_id: 51 }), /Acesso negado/);
  await registros[1].update({ obra_id: 10 }, { transaction: {} });
  assert.deepEqual(await listarIds({ obra_ids: [10, 51], obra_id: 51, status: 'ATIVO' }), [],
    'Colaborador transferido deixa de constar no local anterior');
  assert.deepEqual(await listarIds({ obra_ids: [10, 51], obra_id: 10, status: 'ATIVO' }), [201, 202]);
  registros.splice(cadastrosAntesDoTesteLocal);
  let scopeController = [51], optionsList;
  const controller = load('controllers/RhColaboradorController.js', {
    '../services/rhService': { ...service, listarColaboradoresRh: async options => { optionsList = options; return service.listarColaboradoresRh(options); } },
    '../services/authorizationService': { getRhDpObraScopeIds: async () => scopeController },
    '../services/rhColaboradoresPlanilhaService': { gerarPlanilhaColaboradores },
    '../utils/controllerError': { responderErroController: (res, error) => { throw error; } }
  });
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, send(data) { this.buffer = data; return this; } };
  await controller.exportarPlanilha({ user: usuario, query: { status: 'ATIVO', q: 'filtro que nao pode recortar exportacao', obra_ids: [10] } }, res);
  assert.deepEqual(plain(optionsList), { obra_ids: [51] }, 'Exportacao ignora filtros mas aplica escopo do servidor');
  assert.equal(res.headers['Cache-Control'], 'no-store'); assert.ok(Buffer.isBuffer(res.buffer));
  await controller.modeloPlanilha({ user: usuario, query: { status: 'ATIVO', q: 'nao recortar modelo', obra_ids: [10] } }, res);
  assert.deepEqual(plain(optionsList), { obra_ids: [51] }, 'Modelo preenchido tambem respeita escopo e ignora filtros');
  const modeloPreenchido = new ExcelJS.Workbook(); await modeloPreenchido.xlsx.load(res.buffer);
  assert.equal(modeloPreenchido.getWorksheet('Colaboradores').rowCount, 2, 'Modelo inclui o colaborador cadastrado');
  assert.equal(modeloPreenchido.getWorksheet('Colaboradores').getCell('B2').text, base.CPF);
  assert.match(res.headers['Content-Disposition'], /modelo-importacao-rh-colaboradores.xlsx/);
  scopeController = [];
  await controller.exportarPlanilha({ user: usuario }, res);
  const semEscopo = new ExcelJS.Workbook(); await semEscopo.xlsx.load(res.buffer);
  assert.equal(semEscopo.getWorksheet('Colaboradores').rowCount, 1);
  await controller.modeloPlanilha({ user: usuario }, res);
  const modeloSemEscopo = new ExcelJS.Workbook(); await modeloSemEscopo.xlsx.load(res.buffer);
  assert.equal(modeloSemEscopo.getWorksheet('Colaboradores').rowCount, 1, 'Modelo nao vaza cadastros sem escopo');
  registros.push(registro({ id: 98, cpf: '11122233344', nome: 'Fixture inativo sem obra', status: 'INATIVO', obra_id: null,
    empresa_grupo_id: 1, empresaGrupo: { codigo: 'EMP-01', nome: 'Empresa teste' },
    forma_calculo_gerencial: 'MENSAL', pagamento_automatico_40_60: false }),
    registro({ id: 99, cpf: '22233344455', nome: 'Fixture afastado outra obra', status: 'AFASTADO', obra_id: 10,
      empresa_grupo_id: 1, empresaGrupo: { codigo: 'EMP-01', nome: 'Empresa teste' },
      forma_calculo_gerencial: 'MENSAL', pagamento_automatico_40_60: false }));
  scopeController = null;
  await controller.modeloPlanilha({ user: usuario, query: { status: 'ATIVO', obra_id: 51, q: 'nao filtrar' } }, res);
  assert.deepEqual(plain(optionsList), { obra_ids: null });
  const modeloGlobal = new ExcelJS.Workbook(); await modeloGlobal.xlsx.load(res.buffer);
  const wsGlobal = modeloGlobal.getWorksheet('Colaboradores');
  assert.equal(wsGlobal.rowCount, registros.length + 1, 'Acesso global inclui todos, inativos, afastados e sem obra');
  assert.equal(wsGlobal.getCell('B2').text, base.CPF, 'CPF preserva zero inicial para reimportar');
  assert.equal(wsGlobal.getCell('N1').text, 'Tipo_Pagamento');
  const roundTrip = await service.importarColaboradoresRh({ buffer: res.buffer, originalname: 'modelo-preenchido.xlsx' }, usuario);
  assert.deepEqual(plain(roundTrip.erros), []);
  assert.equal(roundTrip.importados, 0, 'Modelo reimportado nao duplica cadastros');
  assert.equal(roundTrip.atualizados, 0, 'Modelo inalterado nao altera calculos');
  assert.equal(roundTrip.ignorados, registros.length);
  assert.equal(roundTrip.erros.length, 0);
  registros.splice(-2);
  const routes = fs.readFileSync(path.resolve(__dirname, '../src/routes.js'), 'utf8');
  assert.match(routes, /exportar-xlsx', allowRhDpColaboradoresRead, auditSuccess/);
  assert.match(routes, /modelo-xlsx', allowRhDpColaboradoresWrite, auditSuccess/);
  assert.ok(routes.indexOf("'/rh/colaboradores/exportar-xlsx'") < routes.indexOf("'/rh/colaboradores/:id'"));
  const novo = { CPF: '52998224725', Nome: 'Novo teste', Empresa_Codigo: 'EMP-01', Obra_Codigo: 'OBRA-01', Tipo_Vinculo: 'NAO_CLT', Tipo_Pagamento: 'DIARISTA', Valor_Diaria: 180, Data_Admissao: '2026-10-01' };
  assert.equal((await importar([novo], { obra_ids: [] })).erros.length, 1);
  const criado = await importar([novo], { obra_ids: [51] });
  assert.equal(criado.importados, 1); assert.equal(criado.erros.length, 0);
  assert.equal((await importar([novo], { obra_ids: [51] })).ignorados, 1); assert.equal(registros.length, 2);
  const literal = await gerarPlanilhaColaboradores([{ nome: '=HYPERLINK("http://fixture.invalid")', cpf: '00000000000' }]);
  const literalWb = new ExcelJS.Workbook(); await literalWb.xlsx.load(literal);
  assert.equal(literalWb.getWorksheet('Colaboradores').getCell('A2').type, ExcelJS.ValueType.String);
  // Opcional: gera apenas fixture sintetica de QA dentro do repositorio, nunca um dump de producao.
  if (process.argv.includes('--qa-xlsx')) {
    const output = path.resolve(__dirname, '../../outputs/rh-colaboradores-planilha'); fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'fixture-validacao.xlsx'), buffer);
  }
  console.log('Fornecedores e RH: representante opcional no cadastro geral, XLSX, zeros, regime, legado, reimportacao, rollback, vigencia, escopo e idempotencia validados sem banco/rede.');
})().catch(error => { console.error(error); process.exitCode = 1; });
