import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { getCpfCnpjError, getPixDocumentError, isValidCpfCnpj, maskCpfCnpj, maskPhone, maskCep, onlyDigits } from '../src/utils/formatters.js';
import { getDadosEmpresaParceiroError, parceiroEhEmpresa } from '../src/utils/dadosEmpresaParceiro.js';

const ler = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const empresa = { cpf_cnpj: '04.252.011/0001-10', nome: 'Empresa teste', telefone: '27999999999',
  nome_fantasia: 'Fantasia teste', representante_nome: 'Representante teste',
  representante_cpf: '529.982.247-25', representante_cargo: 'Diretor' };
const pf = { cpf_cnpj: '529.982.247-25' };
assert.equal(parceiroEhEmpresa(pf), false);
assert.equal(parceiroEhEmpresa(empresa), true);
assert.equal(getDadosEmpresaParceiroError(pf), null);
assert.equal(getDadosEmpresaParceiroError(empresa), '');
assert.equal(getDadosEmpresaParceiroError({ cpf_cnpj: empresa.cpf_cnpj }, { obrigatorio: false }), null);
assert.match(getDadosEmpresaParceiroError({ ...empresa, representante_cpf: '00000000000' }), /invalido/);
assert.match(getDadosEmpresaParceiroError({ ...empresa, representante_cpf: empresa.cpf_cnpj }), /invalido/);

// Executa as funcoes reais da tela Pessoas, com persistencia substituida.
const pessoas = ler('../src/pages/Parceiros.jsx');
const funcoes = pessoas.slice(pessoas.indexOf('function defaultParceiroForm()'), pessoas.indexOf('function formatPixKeys('));
const salvar = pessoas.slice(pessoas.indexOf('async function handleSalvar('), pessoas.indexOf('async function handleEditarParceiro('));
const contexto = { onlyDigits, maskCpfCnpj, maskPhone, maskCep };
const { padrao, pick } = vm.runInNewContext(`${funcoes}; ({padrao:defaultParceiroForm(),pick:pickParceiroFormData})`, contexto);
const editado = pick({ ...empresa, id: 22 });
assert.equal(editado.nome_fantasia, empresa.nome_fantasia);
assert.equal(editado.representante_cpf, empresa.representante_cpf);
assert.equal(editado.representante_nome, empresa.representante_nome);
assert.equal(editado.representante_cargo, empresa.representante_cargo);
async function testarPessoas(dados, saving = false) {
  const enviados = [], erros = [];
  const estado = { ...padrao, ...dados,
    pix_chave_fixa_1_tipo: 'EMAIL', pix_chave_fixa_2_tipo: 'EMAIL', pix_chave_variavel_tipo: 'EMAIL' };
  const handler = vm.runInNewContext(`${salvar}; handleSalvar`, {
    parceiroForm: estado, saving, isValidCpfCnpj, getPixDocumentError, getDadosEmpresaParceiroError,
    normalizeDocumento: onlyDigits, onlyDigits,
    setError: error => { if (error) erros.push(error); }, setSaving() {}, setParceiroForm() {}, carregar: async () => {},
    criarParceiro: async payload => enviados.push({ acao: 'criar', payload }),
    atualizarParceiro: async (id, payload) => enviados.push({ acao: 'editar', id, payload })
  });
  await handler({ preventDefault() {} });
  return { enviados, erros };
}
const novo = await testarPessoas(empresa);
assert.deepEqual(novo.erros, []);
assert.equal(novo.enviados[0].payload.nome_fantasia, empresa.nome_fantasia);
assert.equal(novo.enviados[0].payload.representante_cpf, '52998224725');
for (const campo of ['nome_fantasia', 'representante_nome', 'representante_cpf']) {
  const ausente = await testarPessoas({ ...empresa, [campo]: '' });
  assert.equal(ausente.enviados.length, 0);
  assert.equal(ausente.erros.length, 1);
}
const legado = await testarPessoas({ id: 22, cpf_cnpj: empresa.cpf_cnpj, nome: empresa.nome });
assert.deepEqual(legado.erros, []);
assert.equal(legado.enviados[0].acao, 'editar', 'Edicao legada nao pode exigir cadastro novo completo.');
assert.equal((await testarPessoas({ ...pf, nome: 'Pessoa teste' })).enviados.length, 1);
assert.equal((await testarPessoas(empresa, true)).enviados.length, 0);

// Compra Direta continua opcional, mas deve permitir preencher/enviar os dados.
const compra = ler('../src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx');
const padraoCompra = compra.slice(compra.indexOf('function criarNovoCredorPadrao()'), compra.indexOf('function calcularValorTotalItem('));
const salvarCompra = compra.slice(compra.indexOf('async function cadastrarCredorCompraDireta()'), compra.indexOf('async function baixarModeloItens()'));
async function testarCompra(dados = {}) {
  const enviados = [], erros = [];
  const handler = vm.runInNewContext(`${padraoCompra}; ${salvarCompra}; cadastrarCredorCompraDireta`, {
    novoCredor: { ...empresa, ...dados }, salvandoCredor: false, getCpfCnpjError, onlyDigits, getDadosEmpresaParceiroError,
    reprovarCampo: (_, error) => erros.push(error), avisar: { erro: error => erros.push(error), sucesso() {} },
    criarCredorCompraDireta: async payload => { enviados.push(payload); return { id: 22, ...payload }; },
    selecionarCredorCompraDireta() {}, setNovoCredor() {}, setErrosCampo() {}, setModalCredorAberto() {}, setSalvandoCredor() {},
    console: { error() {} }
  });
  await handler();
  return { enviados, erros };
}
const compraCompleta = await testarCompra();
assert.deepEqual(compraCompleta.erros, []);
assert.equal(compraCompleta.enviados[0].nome_fantasia, empresa.nome_fantasia);
assert.equal(compraCompleta.enviados[0].representante_cpf, '52998224725');
const compraOpcional = await testarCompra({ nome_fantasia: '', representante_nome: '', representante_cpf: '' });
assert.deepEqual(compraOpcional.erros, []);
assert.equal(compraOpcional.enviados.length, 1);
assert.equal((await testarCompra({ representante_cpf: '00000000000' })).enviados.length, 0);
assert.match(compra, /<DadosEmpresaParceiro[\s\S]*?obrigatorio=\{false\}/);
assert.match(pessoas, /<DadosEmpresaParceiro[\s\S]*?obrigatorio=\{!parceiroForm.id\}/);

// O cadastro nos detalhes ja possuia os campos: protecao contra regressao.
const detalhe = ler('../src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx');
for (const campo of ['nome_fantasia', 'representante_nome', 'representante_cpf']) {
  assert.match(detalhe, new RegExp(`name="${campo}"`));
  assert.match(detalhe, new RegExp(`${campo}: (?:onlyDigits\\()?cadastroCredorForm\\.${campo}`));
}
assert.match(detalhe, /onlyDigits\(cadastroCredorForm.cpf_cnpj\).length === 14/);
console.log('Credores PJ: criacao/edicao de Pessoas, Compra Direta opcional e cadastro nos detalhes validados sem banco ou API externa.');
