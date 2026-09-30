import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeCurrencyTyping, parseCurrencyInput } from '../src/utils/formatters.js';

const arquivo = fileURLToPath(new URL('../src/pages/NovaSolicitacao.jsx', import.meta.url));
const fonte = readFileSync(arquivo, 'utf8');
const modal = readFileSync(
  fileURLToPath(new URL('../src/components/obras/ObraCadastroModal.jsx', import.meta.url)),
  'utf8'
);

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
assert.match(
  fonte,
  /if \(!usaFluxoCadastroObra && !form\.obra_id\) \{\s*reprovarCampo\('obra_id'/,
  'O submit do cadastro de obra nao pode exigir uma obra preexistente em campo oculto.'
);
assert.match(
  fonte,
  /if \(!usaFluxoCadastroObra && !obraSelecionadaEhObra\) \{\s*if \(distribuicaoCentroCusto\.status/,
  'O cadastro de obra nao pode ser validado como distribuicao de Centro de Custo.'
);
assert.match(
  fonte,
  /distribuicao_centro_custo: !usaFluxoCadastroObra && !obraSelecionadaEhObra/,
  'O payload do cadastro de obra nao pode enviar distribuicao gerencial vazia.'
);
assert.match(
  fonte,
  /const exibirValor = !usaFluxoCadastroObra\s*&& \(!obraSelecionadaEhObra \|\| !tipoSemValor\)/,
  'O valor contratual da obra nao pode reativar nem exigir o campo financeiro generico.'
);
assert.equal(normalizeCurrencyTyping('123456'), 'R$ 1.234,56');
assert.equal(parseCurrencyInput('R$ 1.234,56'), 1234.56);
for (const [nome, codigo] of [['Nova Solicitação', fonte], ['Modal de cadastro', modal]]) {
  assert.match(
    codigo,
    /valor_obra: parseCurrencyInput\(/,
    `${nome}: o payload deve converter a moeda exibida para numero decimal.`
  );
  assert.match(
    codigo,
    /input-moeda[\s\S]*?normalizeCurrencyTyping\(/,
    `${nome}: o campo deve usar a mascara monetaria brasileira.`
  );
}

console.log('Abertura do formulario independente de cadastro de obra validada com sucesso.');
