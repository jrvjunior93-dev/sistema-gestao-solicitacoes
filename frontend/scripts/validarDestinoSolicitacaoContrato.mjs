import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { destinoSolicitacaoContratoCriado } from '../src/utils/destinoSolicitacaoContrato.js';

assert.equal(destinoSolicitacaoContratoCriado({ solicitacao: { id: 42 } }), '/solicitacoes/42');
assert.equal(destinoSolicitacaoContratoCriado({ contrato: { solicitacao_id: 43 } }), '/solicitacoes/43');
assert.equal(destinoSolicitacaoContratoCriado({ solicitacao: { id: 44 }, contrato: { solicitacao_id: 43 } }), '/solicitacoes/44');
for (const resposta of [{}, { solicitacao: { id: 0 } }, { solicitacao: { id: 'invalido' } }]) {
  assert.equal(destinoSolicitacaoContratoCriado(resposta), null);
}

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fonte = await readFile(path.join(frontendDir, 'src/pages/NovaSolicitacao.jsx'), 'utf8');
const inicio = fonte.indexOf('const r = await criarContratoFluxoNovo(');
const fim = fonte.indexOf('} catch (error) {', inicio);
assert.ok(inicio >= 0 && fim > inicio, 'Fluxo de criacao do contrato encontrado');
const fluxo = fonte.slice(inicio, fim);
assert.match(fluxo, /const destinoSolicitacao = destinoSolicitacaoContratoCriado\(r\)/);
assert.equal((fluxo.match(/abrirRegistroCriado\(\);/g) || []).length, 4,
  'Sucesso e as tres falhas de upload devem abrir o registro criado');
assert.doesNotMatch(fluxo, /navigate\('\/gestao-contratos'/,
  'O fluxo so usa Gestao de Contratos como fallback sem ID da solicitacao');

console.log('Destino da solicitacao de contrato validado.');
