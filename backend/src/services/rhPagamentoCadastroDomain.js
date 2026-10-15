'use strict';

const { createHash } = require('node:crypto');
const { recebimento } = require('./rhPagamentoSolicitacaoDomain');
const contaKeys = ['modo_recebimento', 'favorecido_nome', 'favorecido_documento', 'chave_pix', 'banco', 'agencia', 'conta', 'tipo_conta'];
const contaIgual = (a, b) => contaKeys.every(k => String(a?.[k] || '') === String(b?.[k] || ''));

// Somente projecao: nunca grava o cadastro, solicitacao ou titulo durante uma leitura.
function atualizarLinhaCadastro(linha, cadastro) {
  if (!cadastro || ['ENVIADO', 'CANCELADO'].includes(linha.pagamento_estado)) return linha;
  const pagamento = cadastro.pagamento || {};
  const base = { nome: cadastro.nome, cpf: cadastro.cpf,
    forma_calculo_gerencial: cadastro.forma_calculo_gerencial,
    salario_base: Number(cadastro.salario_base || 0), valor_diaria: Number(cadastro.valor_diaria || 0),
    conta_salario: recebimento({ modo_recebimento: 'CONTA_SALARIO' }, cadastro, pagamento),
    pix_cadastro: recebimento({ modo_recebimento: 'PIX' }, cadastro, pagamento) };
  const versao = createHash('sha256').update(JSON.stringify(base)).digest('hex');
  const mudou = linha.cadastro_versao ? linha.cadastro_versao !== versao
    : Number(linha.salario_base || 0) !== base.salario_base
      || Number(linha.valor_diaria || 0) !== base.valor_diaria
      || linha.forma_calculo_gerencial !== base.forma_calculo_gerencial
      || !contaIgual(linha.conta_salario, base.conta_salario);
  // PIX legado pode ser uma escolha manual: nao substitui sem pedido explicito.
  const conta = linha.modo_recebimento === 'CONTA_SALARIO' ? base.conta_salario
    : linha.modo_recebimento === 'PIX' && linha.recebimento_personalizado === false ? base.pix_cadastro : {};
  return { ...linha, ...base, ...conta, cadastro_versao: versao, cadastro_atualizado: mudou,
    ...(mudou ? { conferido_obra: false, conferido_dp: false } : {}) };
}

module.exports = { atualizarLinhaCadastro, contaIgual };
