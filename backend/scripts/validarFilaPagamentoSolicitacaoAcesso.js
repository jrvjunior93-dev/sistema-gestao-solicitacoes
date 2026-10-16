'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Op } = require('sequelize');

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
        assert.deepEqual(Array.from(options.where.tipo[Op.in]), ['BOLETO', 'BOLETO_COMPRA', 'BOLETO_FRETE']); assert.equal(options.where.deleted_at, null);
        return [
          { id: 1, solicitacao_id: 42, deleted_at: null, nome_original: 'boleto-informativo.pdf', tipo: 'SOLICITACAO' },
          { id: 2, solicitacao_id: 42, deleted_at: null, nome_original: 'boleto-1.pdf', caminho_arquivo: 'boleto1', tipo: 'BOLETO', createdAt: '2026-09-18T10:00:00Z' },
          { id: 3, solicitacao_id: 42, deleted_at: null, nome_original: 'boleto-2.png', caminho_arquivo: 'boleto2', tipo: 'BOLETO', createdAt: '2026-09-18T11:00:00Z' },
          { id: 4, solicitacao_id: 42, deleted_at: '2026-09-19', nome_original: 'removido.pdf', tipo: 'BOLETO' },
          { id: 5, solicitacao_id: 99, deleted_at: null, nome_original: 'outra.pdf', tipo: 'BOLETO_COMPRA' },
          { id: 6, solicitacao_id: 42, deleted_at: null, nome_original: 'compra.pdf', tipo: 'BOLETO_COMPRA', createdAt: '2026-10-16T10:00:00Z' },
          { id: 7, solicitacao_id: 42, deleted_at: null, nome_original: 'frete.pdf', tipo: 'BOLETO_FRETE', createdAt: '2026-10-16T11:00:00Z' },
          { id: 8, solicitacao_id: 42, deleted_at: '2026-10-16', nome_original: 'removido-compra.pdf', tipo: 'BOLETO_COMPRA' },
          { id: 9, solicitacao_id: 42, deleted_at: null, nome_original: 'boleto-recibo.pdf', tipo: 'COMPROVANTE' }
        ].filter(row => row.solicitacao_id === options.where.solicitacao_id && options.where.tipo[Op.in].includes(row.tipo) && row.deleted_at === options.where.deleted_at);
      } },
      Comprovante: { async findAll(options) {
        throw new Error('Modal de boletos nao pode consultar comprovantes');
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
    if (name === 'sequelize') return { Op };
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
  assert.equal(fileCalls, 1);
  assert.deepEqual(Array.from(arquivos, (arquivo) => arquivo.nome_original), ['frete.pdf', 'compra.pdf', 'boleto-2.png', 'boleto-1.pdf']);
  assert(arquivos.every(arquivo => ['BOLETO', 'BOLETO_COMPRA', 'BOLETO_FRETE'].includes(arquivo.tipo)));
  assert(controller.includes('permitirLeituraGlobal && await podeVisualizarSolicitacaoPelaFila(req.user, solicitacao.id)'), 'Detalhe deve liberar apenas leitura pelo vinculo da fila');
  assert(files.includes('await podeVisualizarSolicitacaoPelaFila(req.user, solicitacao.id)'), 'Anexos devem usar o mesmo limite de acesso');
  assert(queue.includes("'solicitacao_id'") && queue.includes("as: 'solicitacao'"), 'Fila deve expor o vinculo com a solicitacao');
  assert(routes.includes("'/financeiro/fila-pagamentos/solicitacoes/:id/arquivos', allowFilaPagamentosRead"), 'Rota de arquivos deve exigir acesso a fila');
  console.log('OK: mesmo acesso da fila, boletos da solicitacao/compra/frete, multiplos PDF/imagem, removidos/outra solicitacao excluidos, nenhuma consulta a comprovantes.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
