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
  /setTextoMassa\(''\);\s*await recarregarCadastroEConfiguracao\(\);/,
  'A importacao manual deve atualizar o cadastro e a configuracao da obra selecionada.'
);

assert.match(
  source,
  /\(configuracaoMacros\?\.candidatas \|\| \[\]\)\.map\(\(item\) =>/,
  'Todas as apropriacoes ativas devem permanecer visiveis como candidatas.'
);
assert.match(
  source,
  /checked=\{macrosSelecionadas\.has\(Number\(item\.id\)\)\}[\s\S]*?onChange=\{\(\) => alternarMacro\(item\.id\)\}/,
  'Todas as candidatas devem continuar marcaveis na configuracao.'
);

console.log('Sincronizacao da gestao de apropriacoes validada com sucesso.');
