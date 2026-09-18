'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/services/solicitacaoFilaPagamentoAcessoService.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src/controllers/SolicitacaoController.js'), 'utf8');
const files = fs.readFileSync(path.join(root, 'src/services/fileAccessService.js'), 'utf8');
const queue = fs.readFileSync(path.join(root, 'src/services/pagamentoManualFilaService.js'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'src/routes.js'), 'utf8');

let permitted = false;
let linked = false;
let calls = 0;
let fileCalls = 0;
const sandbox = {
  module: { exports: {} },
  require(name) {
    if (name === '../models') return {
      Anexo: { async findAll(options) {
        fileCalls += 1;
        assert.equal(options.where.solicitacao_id, 42);
        return [{ id: 1, nome_original: 'nota.pdf', caminho_arquivo: 'nota', tipo: 'SOLICITACAO', createdAt: '2026-09-18T10:00:00Z' }];
      } },
      Comprovante: { async findAll(options) {
        fileCalls += 1;
        assert.equal(options.where.solicitacao_id, 42);
        return [{ id: 2, nome_original: 'comprovante.pdf', caminho_arquivo: 'comprovante', createdAt: '2026-09-18T11:00:00Z' }];
      } },
      PagamentoManualFilaItem: {
        async findOne(options) {
          calls += 1;
          assert.equal(options.include[0].as, 'titulo');
          assert.equal(options.include[0].required, true);
          return linked && options.include[0].where.solicitacao_id === 42 ? { id: 7 } : null;
        }
      },
      TituloFinanceiro: {}
    };
    if (name === './authorizationService') return { canAccessFilaPagamentos: async () => permitted };
    throw new Error(`Dependencia nao simulada: ${name}`);
  }
};
vm.runInNewContext(source, sandbox);
const { podeVisualizarSolicitacaoPelaFila, listarArquivosSolicitacaoPelaFila } = sandbox.module.exports;

(async () => {
  assert.equal(await podeVisualizarSolicitacaoPelaFila(null, 42), false);
  assert.equal(await podeVisualizarSolicitacaoPelaFila({ id: 1 }, 'invalido'), false);
  assert.equal(await podeVisualizarSolicitacaoPelaFila({ id: 1 }, 42), false);
  assert.equal(calls, 0, 'Sem permissao, nenhuma consulta a fila deve ocorrer');
  permitted = true;
  assert.equal(await podeVisualizarSolicitacaoPelaFila({ id: 1 }, 42), false);
  linked = true;
  assert.equal(await podeVisualizarSolicitacaoPelaFila({ id: 1 }, 43), false);
  assert.equal(await podeVisualizarSolicitacaoPelaFila({ id: 1 }, 42), true);
  await assert.rejects(listarArquivosSolicitacaoPelaFila({ id: 1 }, 43), { statusCode: 403 });
  assert.equal(fileCalls, 0, 'Solicitacao fora da fila nao deve consultar arquivos');
  const arquivos = await listarArquivosSolicitacaoPelaFila({ id: 1 }, 42);
  assert.equal(fileCalls, 2);
  assert.deepEqual(Array.from(arquivos, (arquivo) => arquivo.nome_original), ['comprovante.pdf', 'nota.pdf']);
  assert(controller.includes('permitirLeituraGlobal && await podeVisualizarSolicitacaoPelaFila(req.user, solicitacao.id)'), 'Detalhe deve liberar apenas leitura pelo vinculo da fila');
  assert(files.includes('await podeVisualizarSolicitacaoPelaFila(req.user, solicitacao.id)'), 'Anexos devem usar o mesmo limite de acesso');
  assert(queue.includes("'solicitacao_id'") && queue.includes("as: 'solicitacao'"), 'Fila deve expor o vinculo com a solicitacao');
  assert(routes.includes("'/financeiro/fila-pagamentos/solicitacoes/:id/arquivos', allowFilaPagamentosRead"), 'Rota de arquivos deve exigir acesso a fila');
  console.log('OK: detalhe e arquivos da solicitacao restritos a fila; anexos e comprovantes listados.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
