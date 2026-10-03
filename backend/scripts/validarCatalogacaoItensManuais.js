const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  montarItensSolicitacaoImportados,
  normalizeImportedRows
} = require('../src/services/compraItensPlanilhaService');
const {
  formatarCodigoInsumo,
  normalizarNomeInsumo
} = require('../src/services/insumoManualCatalogacaoService');
const { validateCompraCatalogarItemManualBody } = require('../src/validators/operationalValidators');

const root = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function validarNormalizacaoECodigo() {
  assert.strictEqual(normalizarNomeInsumo('  Cimento   CP II á '), 'CIMENTO CP II A');
  assert.strictEqual(formatarCodigoInsumo(1), 'INS-000001');
  assert.strictEqual(formatarCodigoInsumo(987654), 'INS-987654');
}

function validarPayloads() {
  assert.deepStrictEqual(validateCompraCatalogarItemManualBody({
    acao: 'VINCULAR_EXISTENTE',
    insumo_id: 15
  }), {
    acao: 'VINCULAR_EXISTENTE',
    motivo: undefined,
    corrigir_vinculo: false,
    confirmar_novo_duplicado: false,
    insumo_id: 15
  });

  const novo = validateCompraCatalogarItemManualBody({
    acao: 'CRIAR_INSUMO',
    nome: 'Cimento CP II',
    unidade_manual: 'SC',
    categoria_id: 7
  });
  assert.strictEqual(novo.nome, 'Cimento CP II');
  assert.strictEqual(novo.unidade_manual, 'SC');
  assert.strictEqual(novo.categoria_id, 7);

  assert.throws(
    () => validateCompraCatalogarItemManualBody({ acao: 'CRIAR_INSUMO', nome: 'Sem unidade' }),
    /unidade/i
  );
  assert.doesNotThrow(
    () => validateCompraCatalogarItemManualBody({ acao: 'VINCULAR_EXISTENTE', insumo_id: 1 })
  );
}

function validarAliasNaImportacao() {
  const insumo = {
    id: 10,
    codigo: 'INS-000010',
    nome: 'Cimento Portland CP II',
    unidade: { id: 2, sigla: 'SC', nome: 'Saco' },
    aliases: [{ alias: 'cimento cp2 ensacado' }]
  };
  const resultado = montarItensSolicitacaoImportados({
    rows: normalizeImportedRows([{ Descricao: 'CIMENTO CP2 ENSACADO', Quantidade: 3 }]),
    insumos: [insumo],
    unidades: [insumo.unidade],
    apropriacoes: []
  });

  assert.deepStrictEqual(resultado.erros, []);
  assert.strictEqual(resultado.itens[0].manual, false);
  assert.strictEqual(resultado.itens[0].insumo_id, 10);
}

function validarIntegracaoEstatica() {
  const migration = read('backend/migrations/202608200051_catalogacao_itens_manuais.js');
  const routes = read('backend/src/routes.js');
  const service = read('backend/src/services/insumoManualCatalogacaoService.js');
  const permissions = read('backend/src/constants/moduloPermissoes.js');
  const reports = read('backend/src/services/relatorioComprasService.js');
  const detail = read('frontend/src/modules/solicitacao-compra/pages/SolicitacaoCompraDetalheView.jsx');
  const detailSolicitacao = read('frontend/src/pages/SolicitacaoDetalhe/index.jsx');
  const item = read('frontend/src/modules/solicitacao-compra/components/ItemCompraExpansivel.jsx');
  const tratamento = read('frontend/src/modules/solicitacao-compra/components/TratamentoItemManual.jsx');

  assert(migration.includes('insumo_catalogado_id'));
  assert(migration.includes("createTable('insumo_aliases'"));
  assert(migration.includes("createTable('insumo_codigo_sequencias'"));
  assert(routes.includes("'/compras/solicitacoes/:id/itens-manuais/:itemId/catalogar'"));
  assert(routes.includes('allowComprasCatalogarItensManuais'));
  assert(routes.includes("eventType: 'COMPRA_ITEM_MANUAL_CATALOGADO'"));
  assert(service.includes('transaction.LOCK.UPDATE'));
  assert(service.includes("tipo_acao: corrigindo ? 'ITEM_MANUAL_CATALOGACAO_CORRIGIDA' : 'ITEM_MANUAL_CATALOGADO'"));
  assert(!service.includes('itemManual.destroy'));
  assert(permissions.includes('compras.insumos.catalogar_itens_manuais'));
  assert(reports.includes('plain.itemManual?.insumoCatalogado'));
  assert(detail.includes('canCatalogarItensManuaisCompras'));
  assert(detail.includes('<ItemCompraExpansivel'));
  assert(detail.includes('<table className="compra-itens-tabela">'));
  assert(detailSolicitacao.includes('canCatalogarItensManuaisCompras'));
  assert(detailSolicitacao.includes('podeGerenciarItensCompraDireta'));
  assert(detailSolicitacao.includes('<TratamentoItemManual'));
  assert(detailSolicitacao.includes('solicitacaoId={compraDiretaDetalhe.id}'));
  assert(item.includes("aberto && item.tipo === 'MANUAL' && podeCatalogar"));
  assert(item.includes('fileUrl(item.arquivo_url)'));
  assert(item.includes('<tr className={`compra-item-table-row'));
  assert(item.includes('<td colSpan={8}>'));
  assert(!item.includes('<article'));
  assert(tratamento.includes('role="combobox"'));
  assert(tratamento.includes('role="listbox"'));
  assert(tratamento.includes('aria-activedescendant'));
  assert(tratamento.includes('setBusca(rotuloInsumo(insumo))'));
  assert(tratamento.includes('new AbortController()'));
  assert(!tratamento.includes('role="radiogroup"'));
  assert(tratamento.includes('function formularioInicial(item)'));
  assert(tratamento.includes("const [busca, setBusca] = useState('')"));
  assert(tratamento.includes("const [insumoId, setInsumoId] = useState('')"));
  assert(tratamento.includes("setModo('EXISTENTE')"));
  assert(tratamento.includes("setForm(formularioInicial(item))"));
  assert(tratamento.includes("if (novoModo === 'NOVO')"));
  assert(tratamento.includes("'Salvar vinculo do insumo'"));
  assert(tratamento.includes("'Salvar novo insumo'"));
  assert(!tratamento.includes('Motivo da catalogacao'));
  assert(detail.includes('insumoOficial?.descricao || item.especificacao'));
  assert(detailSolicitacao.includes('mapearItemManualCompraDireta'));
  assert(detailSolicitacao.includes('insumoOficial?.descricao'));
}

function run() {
  validarNormalizacaoECodigo();
  validarPayloads();
  validarAliasNaImportacao();
  validarIntegracaoEstatica();
  console.log('Catalogacao de itens manuais validada com sucesso.');
}

run();
