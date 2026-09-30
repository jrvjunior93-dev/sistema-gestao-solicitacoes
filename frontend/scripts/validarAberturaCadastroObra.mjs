import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const arquivo = fileURLToPath(new URL('../src/pages/NovaSolicitacao.jsx', import.meta.url));
const fonte = readFileSync(arquivo, 'utf8');

assert.match(
  fonte,
  /if \(modoCadastroObra && tipoCadastroObraDisponivel\) \{[\s\S]*?setTipos\(\[tipoCadastroObraDisponivel\]\);[\s\S]*?tipo_solicitacao_id: tipoId/,
  'O modo de cadastro de obra deve carregar seu tipo automatico sem depender de obra ou area.'
);
assert.match(
  fonte,
  /function ativarCadastroObra\(\) \{[\s\S]*?setModoCadastroObra\(true\);[\s\S]*?setTipos\(\[tipoCadastroObraDisponivel\]\);[\s\S]*?contexto: 'CADASTRO_OBRA'/,
  'O clique deve ativar modo, catalogo e tipo na mesma atualizacao da interface.'
);
assert.match(
  fonte,
  /useEffect\(\(\) => \{\s*\/\/ GEO e o destino interno[\s\S]*?if \(modoCadastroObra\) return;\s*if \(!form\.area_responsavel\)/,
  'A validacao do fluxo comum nao pode apagar o tipo quando a area GEO esta oculta.'
);
assert.match(
  fonte,
  /\[form\.area_responsavel, form\.tipo_solicitacao_id, modoCadastroObra, tiposDisponiveis\]/,
  'A protecao do modo especial deve participar das dependencias da validacao.'
);

console.log('Abertura do formulario independente de cadastro de obra validada com sucesso.');
