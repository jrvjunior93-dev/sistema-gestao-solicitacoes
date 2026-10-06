import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { getCpfCnpjError, getPixDocumentError, onlyDigits } from '../src/utils/formatters.js';

const pagina = readFileSync(new URL('../src/pages/NovaSolicitacao.jsx', import.meta.url), 'utf8');
const padrao = pagina.slice(pagina.indexOf('function criarNovoParceiroPadrao()'), pagina.indexOf('function criarChaveIdempotenciaSolicitacao()'));
const salvar = pagina.slice(pagina.indexOf('async function salvarNovoParceiro()'), pagina.indexOf('function limparSelecaoObraERegras()'));
const modalInicio = pagina.lastIndexOf('<OverlayModal', pagina.indexOf('aberto={exibirCadastroCredor && modalParceiroAberto}'));
const modal = pagina.slice(modalInicio, pagina.indexOf('</OverlayModal>', modalInicio) + '</OverlayModal>'.length);
const base = {
  ...vm.runInNewContext(`${padrao}; criarNovoParceiroPadrao()`),
  nome: 'Credor de teste', cpf_cnpj: '529.982.247-25', telefone: '(27) 99999-9999',
  endereco: 'Rua Teste', numero: '10', bairro: 'Centro', cep: '29000-000',
  municipio: 'Vitoria', estado: 'ES', pix_chave_fixa_1: '529.982.247-25'
};

function formulario(dados = {}, { falhar = false, aguardar = false, avulso = false } = {}) {
  const avisos = [], payloads = [], selecoes = [], busy = [], modalAberto = [];
  let liberar;
  const contexto = {
    novoParceiro: { ...base, ...dados }, getCpfCnpjError, getPixDocumentError, onlyDigits,
    normalizarDocumento: onlyDigits, salvandoNovoParceiroRef: { current: false },
    setSalvandoNovoParceiro: valor => busy.push(valor),
    avisar: { alerta: valor => avisos.push(valor), erro: valor => avisos.push(valor) },
    console: { error() {} },
    form: { obra_id: '51', tipo_solicitacao_id: '33', area_responsavel: 'GEO', contrato_id: '4' },
    permitirCredorAvulsoComContrato: avulso,
    criarCredorNovaSolicitacao: async payload => {
      payloads.push(payload);
      if (aguardar) await new Promise(resolve => { liberar = resolve; });
      if (falhar) throw new Error('Falha de teste');
      return { id: 123, ...payload };
    },
    selecionarParceiro: parceiro => selecoes.push(parceiro), setNovoParceiro() {},
    setModalParceiroAberto: valor => modalAberto.push(valor)
  };
  const executar = vm.runInNewContext(`${padrao}; ${salvar}; salvarNovoParceiro`, contexto);
  return { executar, avisos, payloads, selecoes, busy, modalAberto, contexto, liberar: () => liberar() };
}

const umaChave = formulario();
await umaChave.executar();
assert.deepEqual(umaChave.avisos, []);
assert.equal(umaChave.payloads.length, 1);
assert.equal(umaChave.payloads[0].pix_chave_fixa_2, '');
assert.equal(umaChave.payloads[0].pix_chave_variavel, '');
assert.equal(umaChave.payloads[0].cep, '29000000');
assert.equal(umaChave.payloads[0].contrato_id, '4');
assert.equal(umaChave.selecoes.length, 1);
assert.deepEqual(umaChave.modalAberto, [false]);

for (const tipo of ['CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA']) {
  const teste = formulario({ pix_chave_fixa_2_tipo: tipo, pix_chave_variavel_tipo: tipo,
    pix_chave_fixa_2: '   ', pix_chave_variavel: ' ' });
  await teste.executar();
  assert.deepEqual(teste.avisos, [], `Chaves opcionais vazias com tipo ${tipo} nao devem bloquear.`);
  assert.equal(teste.payloads.length, 1);
  const ausente = formulario({ pix_chave_fixa_1_tipo: tipo, pix_chave_fixa_1: ' ' });
  await ausente.executar();
  assert.match(ausente.avisos[0], /primeira chave PIX/);
  assert.equal(ausente.payloads.length, 0);
}
for (const campo of ['pix_chave_fixa_1', 'pix_chave_fixa_2', 'pix_chave_variavel']) {
  const invalido = formulario({ [campo]: '00000000000', [`${campo}_tipo`]: 'CPF' });
  await invalido.executar();
  assert.match(invalido.avisos[0], /invalido/);
  assert.equal(invalido.payloads.length, 0);
}
const completo = formulario({ pix_chave_fixa_2: '04.252.011/0001-10',
  pix_chave_variavel_tipo: 'CPF', pix_chave_variavel: '52998224725' }, { avulso: true });
await completo.executar();
assert.deepEqual(completo.avisos, []);
assert.equal(completo.payloads[0].contrato_id, null);
const enderecoAusente = formulario({ endereco: '' });
await enderecoAusente.executar();
assert.match(enderecoAusente.avisos[0], /Logradouro/);
assert.equal(enderecoAusente.payloads.length, 0);
const simultaneo = formulario({}, { aguardar: true });
const primeiro = simultaneo.executar();
await simultaneo.executar();
assert.equal(simultaneo.payloads.length, 1, 'Dois cliques simultaneos nao podem criar dois credores.');
assert.equal(simultaneo.contexto.salvandoNovoParceiroRef.current, true);
simultaneo.liberar(); await primeiro;
assert.deepEqual(simultaneo.busy, [true, false]);
const falha = formulario({}, { falhar: true });
await falha.executar();
assert.deepEqual(falha.avisos, ['Falha de teste']);
assert.deepEqual(falha.modalAberto, []);
assert.equal(falha.contexto.salvandoNovoParceiroRef.current, false);

for (const campo of ['endereco', 'numero', 'bairro', 'cep', 'municipio', 'estado', 'complemento']) {
  assert.equal((modal.match(new RegExp(`value=\\{novoParceiro\\.${campo}(?:\\}| \\|\\|)`, 'g')) || []).length, 1,
    `O campo ${campo} deve ter apenas uma entrada no modal.`);
}
assert.doesNotMatch(modal, /segunda entrada|Chaves PIX opcionais/);
assert.match(modal, /label="Chave PIX fixa 1" obrigatorio/);
assert.doesNotMatch(modal, /label="Chave PIX (fixa 2|variável)" obrigatorio/);
assert.match(modal, /cep: maskCep\(e.target.value\)/);
assert.match(modal, /estado: e.target.value.toUpperCase\(\)/);
assert.match(modal, /disabled=\{salvandoNovoParceiro\}/);

// Controller real e normalizadores reais, com models e servicos externos substituidos.
const require = createRequire(import.meta.url);
function moduloIsolado(arquivo, dependencias, extra = '') {
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(new URL(arquivo, import.meta.url), 'utf8') + extra,
    { module, require: id => {
      assert.ok(Object.hasOwn(dependencias, id), `Dependencia inesperada: ${id}`);
      return dependencias[id];
    } });
  return module.exports;
}
const cadastro = moduloIsolado('../../backend/src/services/credorContratoService.js', {
  '../models': {}, './securityLogService': {}
});
const servicoParceiro = moduloIsolado('../../backend/src/services/parceiroService.js', {
  sequelize: {}, '../models': {}, '../utils/cpfCnpj': require('../../backend/src/utils/cpfCnpj.js')
}, '\nmodule.exports.normalizarPayloadTeste = normalizeParceiroPayload;');
const controller = readFileSync(new URL('../../backend/src/controllers/ParceiroController.js', import.meta.url), 'utf8');
const metodo = controller.slice(controller.indexOf('async createCredorNovaSolicitacao('), controller.indexOf('async createCredorCompraDireta(')).trim().replace(/,$/, '');
async function testarApi(dados = {}, habilitado = true) {
  const criados = [];
  const handler = vm.runInNewContext(`({${metodo}}).createCredorNovaSolicitacao`, {
    obterAreasConfiguracaoCampos: async () => ['GEO'],
    Contrato: { findByPk: async () => null },
    obterConfigCamposNovaSolicitacao: async () => ({}),
    resolverCamposNovaSolicitacao: () => ({ cadastro_credor: { visivel: habilitado } }),
    obterOpcoesNovaSolicitacao: () => ({}), pendenciasDoCadastroCredor: cadastro.pendenciasDoCadastro,
    criarParceiro: async payload => {
      const normalizado = servicoParceiro.normalizarPayloadTeste(payload);
      criados.push(normalizado); return { id: 123, ...normalizado };
    }, responderErroController: (res, error) => res.status(400).json({ error: error.message })
  });
  const res = { codigo: 200, status(codigo) { this.codigo = codigo; return this; }, json(body) { this.body = body; return this; } };
  await handler({ body: { ...base, area_responsavel: 'GEO', tipo_solicitacao_id: 33, ...dados } }, res);
  return { res, criados };
}
const apiOk = await testarApi();
assert.equal(apiOk.res.codigo, 201);
assert.equal(apiOk.criados[0].pix_chave_fixa_2, null);
assert.equal(apiOk.criados[0].pix_chave_variavel, null);
const apiSemPix = await testarApi({ pix_chave_fixa_1: ' ' });
assert.equal(apiSemPix.res.codigo, 400);
assert.equal(apiSemPix.criados.length, 0);
assert.match(apiSemPix.res.body.error, /primeira chave PIX/);
assert.equal((await testarApi({}, false)).res.codigo, 403);
assert.equal((await testarApi({ endereco: '' })).res.codigo, 400);
console.log('Cadastro de credor: primeira PIX obrigatoria, adicionais opcionais, endereco unico, bloqueio de clique, permissoes e API validados. Sem banco ou servicos externos.');

if (process.argv.includes('--ui')) {
  const { createServer, transformWithEsbuild } = await import('vite');
  const { default: react } = await import('@vitejs/plugin-react');
  const { chromium } = await import('playwright');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('..', import.meta.url));
  const tipos = pagina.slice(pagina.indexOf('const PIX_TIPOS_CHAVE ='), pagina.indexOf('function criarNovoParceiroPadrao()'));
  const fixture = `import React,{useState,useRef} from 'react';import {createRoot} from 'react-dom/client';
import OverlayModal from '/src/components/ui/OverlayModal.jsx';
import BlocoConteudo from '/src/components/padrao/BlocoConteudo.jsx';
import {CampoForm,FormSecao} from '/src/components/padrao/FormSecao.jsx';
import {getCpfCnpjError,getPixDocumentError,onlyDigits,maskCpfCnpj,maskPhone,maskCep} from '/src/utils/formatters.js';
import '/src/index.css';
${tipos} ${padrao}
function App(){
const [novoParceiro,setNovoParceiro]=useState(${JSON.stringify(base)});
const [modalParceiroAberto,setModalParceiroAberto]=useState(true);
const [salvandoNovoParceiro,setSalvandoNovoParceiro]=useState(false);
const salvandoNovoParceiroRef=useRef(false);
const [mensagem,setMensagem]=useState('');
const faixaAvisos=<p role="status">{mensagem}</p>;
const avisar={alerta:setMensagem,erro:setMensagem};
const exibirCadastroCredor=true,categoriasParceiro=[];
const form={obra_id:51,tipo_solicitacao_id:33,area_responsavel:'GEO'};
const permitirCredorAvulsoComContrato=false,normalizarDocumento=onlyDigits;
const criarCredorNovaSolicitacao=async payload=>{window.payloadTeste=payload;return {id:123,...payload}};
const selecionarParceiro=()=>setMensagem('Credor salvo');
${salvar}
return <main><p>{mensagem}</p>${modal}</main>;
}createRoot(document.getElementById('root')).render(<App/>);`;
  const server = await createServer({ root, configFile: false, logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'credor-fixture', enforce: 'pre',
      resolveId(id, importer) {
        if (id === '/fixture.jsx') return '\0credor-fixture.jsx';
        if (importer?.endsWith('BlocoConteudo.jsx') && id.endsWith('PreferenciasContext')) return '\0credor-preferencias';
      },
      async load(id) {
        if (id === '\0credor-fixture.jsx') return transformWithEsbuild(fixture, 'fixture.jsx', { loader: 'jsx', jsx: 'transform' });
        if (id === '\0credor-preferencias') return 'export const TIPO_BLOCOS="blocos";export function usePreferenciaDeLista(){return [null,()=>{}]}';
      },
      configureServer(s) { s.middlewares.use(async (req, res, next) => {
        if (req.url !== '/fixture') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await s.transformIndexHtml('/fixture', '<html><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
      }); }
    }, react()] });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const erros = []; page.on('pageerror', error => erros.push(error.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture`);
    await page.getByRole('heading', { name: 'Cadastrar Credor', exact: true }).waitFor();
    assert.equal(await page.locator('[name="novo_credor_endereco"]').count(), 1);
    assert.equal(await page.getByText('Endereço (segunda entrada, já existente na tela)').count(), 0);
    await page.getByLabel('Chave PIX fixa 2', { exact: true }).fill('00000000000000');
    await page.getByRole('button', { name: 'Salvar credor', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'invalido' }).waitFor();
    assert.equal(await page.evaluate(() => window.payloadTeste), undefined);
    await page.getByLabel('Chave PIX fixa 2', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Salvar credor', exact: true }).click();
    await page.getByText('Credor salvo', { exact: true }).waitFor();
    assert.equal((await page.evaluate(() => window.payloadTeste)).pix_chave_fixa_2, '');
    assert.equal((await page.evaluate(() => window.payloadTeste)).pix_chave_variavel, '');
    assert.equal(await page.getByRole('heading', { name: 'Cadastrar Credor', exact: true }).count(), 0);
    assert.deepEqual(erros, []);
    console.log('Modal real no Edge: endereco unico, chave adicional invalida bloqueada e envio com somente primeira chave aprovados. Fixture sem API externa.');
  } finally {
    await browser?.close(); await server.close();
  }
}
