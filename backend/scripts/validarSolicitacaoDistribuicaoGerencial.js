'use strict';
// Executa o show real com modelos/servicos isolados, sem env/banco/rede.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../src/controllers/SolicitacaoController.js'), 'utf8');
const metodo = source.match(/async show\(req, res\) \{[\s\S]*?\n  \},/); assert(metodo);
const clone = o => JSON.parse(JSON.stringify(o));
const distribuicoes = [{ id: 1, solicitacao_id: 90, centro_custo_id: 30, obra_id: 7, abrangencia: 'OBRA', criterio: 'VALOR',
  percentual: '100.000000', valor_distribuido: '5205.41', obraGerencial: { id: 7, codigo: 'ADM', nome: 'Centro de custo inativo', tipo_centro_custo: 'CENTRO_CUSTO' } }];
let consultas = 0, acessos = 0, atencoes = 0, permitiu = true, existe = true;
const registro = { id: 90, valor: 8000, obra_id: 30, obra: { id: 30 }, pagamentos: [], distribuicoesCentroCusto: distribuicoes };
const ctx = { console, Date, Map, Boolean, String, Number,
  Solicitacao: { async findByPk(id, opts) {
    consultas++; assert.equal(Number(id), 90);
    const include = opts.include.find(i => i.as === 'distribuicoesCentroCusto');
    assert(include); assert.equal(include.required, false);
    const destino = include.include.find(i => i.as === 'obraGerencial');
    assert.equal(destino.required, false); assert.equal(destino.where, undefined, 'Nao filtrar snapshot por atividade/elegibilidade atual');
    assert.deepEqual(clone(destino.attributes), ['id', 'codigo', 'nome', 'classificacao', 'tipo_centro_custo']);
    return existe ? { ...clone(registro), toJSON: () => clone(registro) } : null;
  } },
  SolicitacaoCompra: { async findOne() { return null; } },
  async verificarAcessoDetalheSolicitacao(_req, _s, options) { acessos++; assert.equal(options.permitirLeituraGlobal, true); return { allowed: permitiu, status: 403, error: 'Acesso negado' }; },
  async avaliarContextoInteracaoSolicitacao() { assert(permitiu); return { pode_interagir: false }; },
  async obterContextoAprovacaoDiretoria() { return {}; }, solicitacaoUsaFluxoAprovacaoDiretoria: () => false,
  async userHasConfiguredAreaPermissions() { return true; }, async userHasAreaPermission() { return false; },
  async resolverContextoAprovacaoPorTipo() { return {}; }, async userHasSetorCapability() { return false; },
  async userHasAreaPermissionWhenConfigured() { return false; }, async solicitacaoEstaNoSetorGeo() { return false; },
  isBusinessAdmin: () => false, async solicitacaoSegueFluxoContratoNovo() { return false; },
  normalizarTokenComparacao: v => String(v || ''),
  calcularResumoFinanceiroSolicitacao: () => ({ valorTotal: 8000, valorPagoAcumulado: 0, saldoPagamento: 8000, valorExibicao: 8000 }),
  async montarContextoInteracao() { return { pode_interagir: false }; },
  async marcarAtencaoLida() { atencoes++; }, // Efeito preexistente do GET, nao alterado pelo bloco.
  require(nome) {
    if (nome === '../models') return { SolicitacaoRecargaCartao: {} };
    if (nome === '../services/solicitacaoInteracoesService') return { async listarInteracoes() { return new Map(); } };
    if (nome === '../services/solicitacaoFavorecidosService') return { async listarFavorecidos() { return []; } };
    throw Error('Dependencia nao simulada: ' + nome);
  }
};
for (const nome of ['Obra', 'TipoSolicitacao', 'TipoSubContrato', 'Contrato', 'Apropriacao', 'SolicitacaoApropriacao',
  'SolicitacaoCentroCustoDistribuicao', 'SolicitacaoCadastroObraUsuario', 'SolicitacaoCadastroObraDados', 'User', 'Parceiro',
  'FormaPagamentoFinanceira', 'Historico', 'SolicitacaoPagamento']) ctx[nome] = new Proxy({}, { get() { throw Error('Nenhuma escrita/modelo extra autorizada'); } });
const show = vm.runInNewContext(`({${metodo[0].slice(0, -1)}}).show`, ctx);
const resposta = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return body; } });
(async () => {
  const original = JSON.stringify(registro);
  for (const perfil of ['SUPERADMIN', 'USUARIO']) {
    const res = resposta(); await show({ params: { id: '90' }, user: { id: 1, perfil } }, res);
    assert.equal(res.code, 200); assert.deepEqual(res.body.distribuicoesCentroCusto, distribuicoes);
    assert.equal(res.body.valor, 8000); assert.equal(res.body.contexto_interacao.pode_interagir, false);
  }
  permitiu = false; let res = resposta(); await show({ params: { id: 90 }, user: { id: 2 } }, res);
  assert.equal(res.code, 403); assert.equal(res.body.distribuicoesCentroCusto, undefined); assert.equal(atencoes, 2);
  existe = false; res = resposta(); await show({ params: { id: 90 }, user: { id: 2 } }, res);
  assert.equal(res.code, 404); assert.equal(acessos, 3); assert.equal(consultas, 4);
  assert.equal(JSON.stringify(registro), original, 'Registro/historico/calculos persistidos intactos');
  console.log('OK show gerencial real: include existente com tipo cadastral, snapshot/inativo, usuario consultivo e SUPERADMIN, ACL403/404 sem vazar dados, nenhuma escrita financeira ou consulta extra. Efeito legado de atencao preservado. Sem banco/rede.');
})().catch(e => { console.error(e); process.exitCode = 1; });
