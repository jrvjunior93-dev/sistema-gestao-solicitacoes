import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prepararItensReaproveitados } from '../src/modules/solicitacao-compra/utils/reaproveitamentoItensCompra.js';

const origem = [{
  id: 10, item_tipo: 'CADASTRADO', status_aprovacao: 'REJEITADO', insumo_id: 25,
  insumo: { nome: 'Areia fina' }, unidade_id: 2, quantidade: '3.00',
  especificacao: 'Peneirada', apropriacoes: [{ apropriacao_id: 8, quantidade_apropriada: '3.00' }]
}, {
  id: 11, item_tipo: 'MANUAL', status_aprovacao: 'REJEITADO', nome_manual: 'Item especial',
  unidade_sigla_manual: 'un', quantidade: '2.00', arquivo_url: '/uploads/item.pdf',
  apropriacoes: [{ apropriacao_id: 9, quantidade_apropriada: '2.00' }]
}, {
  id: 12, item_tipo: 'CADASTRADO', status_aprovacao: 'APROVADO', insumo_id: 26
}, {
  id: 13, item_tipo: 'CADASTRADO', status_aprovacao: 'PENDENTE', insumo_id: 27
}, {
  id: 14, item_tipo: 'CADASTRADO', status_aprovacao: null, insumo_id: 28,
  rejeicao_implicita: true, vinculado_compra: false, insumo: { nome: 'Brita' }, quantidade: '4.00'
}, {
  id: 15, item_tipo: 'CADASTRADO', status_aprovacao: null, insumo_id: 29,
  rejeicao_implicita: false, vinculado_compra: true
}, {
  id: 16, item_tipo: 'MANUAL', status_aprovacao: 'PENDENTE', nome_manual: 'Luminária',
  rejeicao_implicita: true, vinculado_compra: false, quantidade: '1.00'
}, {
  id: 17, item_tipo: 'CADASTRADO', status_aprovacao: 'REJEITADO', insumo_id: 30,
  vinculado_compra: true
}];

const copias = prepararItensReaproveitados(origem);
assert.equal(copias.length, 4, 'Rejeitados e itens sem decisão fora de cotação/pedido devem entrar na nova compra.');
assert.deepEqual(copias.map((item) => item.insumo_nome), ['Areia fina', 'Item especial', 'Brita', 'Luminária']);
assert.equal(copias[0].id, undefined, 'A nova solicitação não deve herdar o ID do item original.');
assert.equal(copias[0].quantidade, '3.00');
assert.equal(copias[0].apropriacoes[0].apropriacao_id, '8');
assert.equal(copias[1].manual, true);
assert.equal(copias[1].arquivo_url, '/uploads/item.pdf');
assert.equal(copias.some((item) => item.insumo_id === 29), false,
  'Um item legado sem decisão, mas já utilizado em compra, não pode ser copiado.');
assert.equal(copias.some((item) => item.insumo_id === 30), false,
  'Mesmo uma rejeição explícita não pode duplicar item já vinculado a cotação ou pedido.');
copias[0].apropriacoes[0].quantidade_apropriada = '1.00';
assert.equal(origem[0].apropriacoes[0].quantidade_apropriada, '3.00', 'O item original deve permanecer intacto.');

const nova = readFileSync(fileURLToPath(new URL('../src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx', import.meta.url)), 'utf8');
const revisar = readFileSync(fileURLToPath(new URL('../src/modules/solicitacao-compra/pages/RevisarSolicitacaoCompra.jsx', import.meta.url)), 'utf8');
const detalhe = readFileSync(fileURLToPath(new URL('../src/pages/SolicitacaoDetalhe/CompraEtapas.jsx', import.meta.url)), 'utf8');
const etapasBackend = readFileSync(fileURLToPath(new URL('../../backend/src/controllers/SolicitacaoCompraEtapasController.js', import.meta.url)), 'utf8');
for (const fonte of [nova, revisar]) {
  assert.match(fonte, /`reaproveitar-\$\{reaproveitarSolicitacaoId\}`/,
    'Edição e revisão devem acessar o mesmo rascunho isolado da compra original.');
}
assert.match(nova, /revisar\?reaproveitar_solicitacao=/);
assert.match(revisar, /nova\?reaproveitar_solicitacao=/);
assert.match(detalhe, /compraEncaminhada && podeCriarNovaSolicitacao/,
  'O reaproveitamento deve ficar disponível a quem pode criar somente após o encaminhamento.');
assert.match(detalhe, /const \{ ok \} = await confirmar\(/,
  'O usuário deve confirmar a rejeição implícita antes de encaminhar itens sem decisão.');
assert.match(etapasBackend, /SolicitacaoCompraFornecedorItem\.findAll/);
assert.match(etapasBackend, /\.\.\.pedidos\.flatMap\(\(pedido\) => pedido\.itens\)/);
assert.match(etapasBackend, /rejeicao_implicita: rejeicaoImplicita/,
  'Itens antigos sem decisão só podem ser classificados após conferir cotação e pedido.');
assert.match(etapasBackend, /const rejeicaoImplicita = encaminhada && !vinculadoCompra/,
  'A rejeição implícita só se aplica a compras já encaminhadas.');
assert.match(revisar, /criacaoEmAndamentoRef\.current = true/,
  'Confirmar a criação precisa bloquear envios simultâneos na mesma tela.');
assert.match(nova, /hidratandoDraftRef\.current = true;\s+setObraId/,
  'A troca de obra ao carregar a cópia não pode apagar os rateios dos itens.');

console.log('Reaproveitamento de itens nao aprovados validado com sucesso.');
