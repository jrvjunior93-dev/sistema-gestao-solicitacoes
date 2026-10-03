import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(
  path.resolve(dirname, '../src/modules/solicitacao-compra/pages/GestaoApropriacoes.jsx'),
  'utf8'
);

assert.match(
  source,
  /async function recarregarCadastroEConfiguracao[\s\S]*?carregarApropriacoes\(obraId\)[\s\S]*?carregarConfiguracaoMacros\(obraId, false\)/,
  'O cadastro e a configuracao macro devem ser recarregados juntos.'
);

const chamadas = source.match(/await recarregarCadastroEConfiguracao\([^)]*\);/g) || [];
assert.equal(
  chamadas.length,
  3,
  'Cadastro/edicao, exclusao e importacao manual devem atualizar as etapas macro.'
);

assert.match(
  source,
  /setTextoMassa\(naoGravadas\.join\('\\n'\)\);\s*await recarregarCadastroEConfiguracao\(obraAlvo\);/,
  'A importacao manual deve atualizar a configuracao da obra-alvo, mesmo se o seletor mudar.'
);

assert.match(
  source,
  /const itensConfiguracao = useMemo\(\(\) => \{\s*return Array\.isArray\(configuracaoMacros\?\.candidatas\)/,
  'Todas as apropriacoes ativas devem permanecer visiveis como candidatas.'
);
assert.match(
  source,
  /selecao=\{\{\s*selecionados: macrosSelecionadas,[\s\S]*?aoAlternar: \(id\) => alternarMacro\(id\)/,
  'As candidatas devem continuar marcaveis mesmo quando o nivel atual for automatico.'
);
assert.match(
  source,
  /function alternarMacro\(id\) \{\s*setNivelConfiguracao\('PERSONALIZADO'\)/,
  'Uma alteracao manual deve trocar explicitamente o nivel para Personalizado.'
);

console.log('Sincronizacao da gestao de apropriacoes validada com sucesso.');
