import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ehAreaGeoConfiguracaoCampos, filtrarTiposPorArea } from '../src/utils/tiposConfiguracaoCampos.js';
import { normalizarConfigCamposNovaSolicitacao, resolverCamposNovaSolicitacaoFrontend } from '../src/utils/novaSolicitacaoCampos.js';

const tipos = [
  { id: 1, nome: 'Despesa GEO', ativo: true },
  { id: 2, nome: 'PAGAMENTO DE MAO DE OBRA', ativo: true },
  { id: 3, nome: 'Tipo inativo', ativo: false },
  { id: 4, nome: 'Tipo de outro setor', ativo: true }
];
const regrasSetor = { GEO: { tipos: [1] }, DP: { tipos: [2] }, COMPRAS: { tipos: [4] } };
const setores = [
  { codigo: 'GEO', nome: 'Gerência de Processos', eh_setor_geo: true },
  { codigo: 'DP', nome: 'Departamento Pessoal' }
];
const estadoAntes = JSON.stringify({ tipos, regrasSetor, setores });
const ids = (lista) => lista.map((tipo) => tipo.id);

assert.deepEqual(ids(filtrarTiposPorArea(tipos, regrasSetor, 'GEO', setores)), [1, 2, 4],
  'GEO deve listar tipos ativos de DP e dos demais setores, mesmo com lista propria restrita.');
assert.deepEqual(ids(filtrarTiposPorArea(tipos, regrasSetor, 'DP', setores)), [2],
  'O filtro por setor fora de GEO deve permanecer intacto.');
assert.deepEqual(ids(filtrarTiposPorArea(tipos, regrasSetor, 'COMPRAS', setores)), [4]);
assert.deepEqual(ids(filtrarTiposPorArea(tipos, {}, 'DP', setores)), [1, 2, 4],
  'Sem regra de tipos por setor, preservar o comportamento existente.');
assert.deepEqual(filtrarTiposPorArea(null, regrasSetor, 'GEO', setores), []);
assert.equal(ehAreaGeoConfiguracaoCampos(' geo '), true);
assert.equal(ehAreaGeoConfiguracaoCampos('Gerência de Processos'), true);
assert.equal(ehAreaGeoConfiguracaoCampos('DP', setores), false);
for (const capability of [true, 1, '1']) {
  const setorRenomeado = [{ codigo: 'PROCESSOS', nome: 'Equipe interna', eh_setor_geo: capability }];
  assert.deepEqual(ids(filtrarTiposPorArea(tipos, { PROCESSOS: { tipos: [1] } }, 'PROCESSOS', setorRenomeado)), [1, 2, 4],
    'O setor GEO deve ser reconhecido pela capability, inclusive com nome/codigo personalizado.');
}
assert.equal(JSON.stringify({ tipos, regrasSetor, setores }), estadoAntes,
  'Listar tipos na configuracao nao pode modificar a disponibilidade por setor ou o catalogo.');

// Executa o resolvedor real da API com o acesso ao banco substituido, sem conectar ou salvar.
const backendModule = { exports: {} };
const backendSource = readFileSync(new URL('../../backend/src/services/novaSolicitacaoCamposConfig.js', import.meta.url), 'utf8');
vm.runInNewContext(backendSource, {
  module: backendModule,
  require: (id) => {
    assert.equal(id, '../models');
    return { ConfiguracaoSistema: {} };
  }
});
const comportamento = { mostrar_credor: true, exige_credor: true, mostrar_apropriacao_principal: true, exige_apropriacao_principal: true };
const config = normalizarConfigCamposNovaSolicitacao({ regras: {
  GEO: { tipos: { 2: { campos: {
    credor: { visivel: false, obrigatorio: false },
    apropriacao_principal: { visivel: false, obrigatorio: false }
  } } } },
  DP: { tipos: { 2: { campos: { credor: { visivel: true, obrigatorio: true } } } } }
} });
for (const resolver of [resolverCamposNovaSolicitacaoFrontend, backendModule.exports.resolverCamposNovaSolicitacao]) {
  const camposGeo = resolver(comportamento, config, 2, { areaResponsavel: ['GEO', 'Gerência de Processos'], apropriacoesDisponiveis: true });
  for (const campo of ['credor', 'apropriacao_principal']) {
    assert.equal(camposGeo[campo].visivel, false, `A regra de GEO deve ocultar ${campo} na tela e na validacao da API.`);
    assert.equal(camposGeo[campo].obrigatorio, false);
  }
  assert.equal(resolver(comportamento, config, 2, { areaResponsavel: 'DP' }).credor.obrigatorio, true,
    'A regra ja salva em DP deve ser preservada e independente da regra de GEO.');
}

const pagina = readFileSync(new URL('../src/pages/NovaSolicitacaoCamposConfig.jsx', import.meta.url), 'utf8');
assert.match(pagina, /import \{ ehAreaGeoConfiguracaoCampos, filtrarTiposPorArea \} from '\.\.\/utils\/tiposConfiguracaoCampos'/);
assert.match(pagina, /filtrarTiposPorArea\(tipos, tiposPorSetorConfig, areaSelecionada, setores\)/);
console.log('Catalogo de campos GEO validado: todos os tipos ativos, demais setores preservados e regras independentes alinhadas com a API.');
