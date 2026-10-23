import { ehTituloDp } from './recebimentoDp.js';

const textoForma = forma => [forma?.tipo, forma?.codigo, forma?.nome].filter(Boolean).join(' ').toUpperCase();
const semDados = 'Sem instrução bancária cadastrada';

// A mesma regra vale para toda origem. Credor nao e substituto de favorecido,
// e documento cadastral nunca e convertido em chave PIX.
export function beneficiaryData(titulo = {}) {
  const credor = titulo.credor_fila?.nome || titulo.parceiro?.nome || 'Credor não informado';
  const instrucao = titulo.pagamento_favorecido || titulo.pagamento_negociacao || titulo.instrucao_favorecido || titulo.instrucao_medicao_fila;
  const solicitacao = titulo.solicitacao || {};
  const banco = titulo.paymentBeneficiary;
  const favorecidoTitulo = titulo.favorecidoPagamento;
  const favorecidoTituloId = Number(titulo.favorecido_pagamento_id || favorecidoTitulo?.id);
  const nome = instrucao ? instrucao.nome_favorecido
    : favorecidoTitulo?.nome || (favorecidoTituloId ? null
      : banco?.nome || (titulo.payment_beneficiary_id ? null : solicitacao.favorecido?.nome));
  const resultado = (pagamento, chavePix = null, dadosComplementares = null) => ({
    credor, nome: nome || 'Favorecido não informado', pagamento, chavePix, dadosComplementares
  });
  if (ehTituloDp(titulo) && titulo.recebimento_dp === 'DINHEIRO') {
    // No DP em dinheiro o parceiro e o colaborador/responsavel do recebimento.
    return { credor, nome: instrucao?.nome_favorecido || favorecidoTitulo?.nome
      || titulo.parceiro?.nome || 'Favorecido não informado', pagamento: 'Recebimento em dinheiro' };
  }
  if (instrucao?.pendencia) return resultado(instrucao.pendencia);
  const forma = instrucao?.forma_pagamento_tipo || instrucao?.forma_pagamento_nome
    ? textoForma({ tipo: instrucao.forma_pagamento_tipo, nome: instrucao.forma_pagamento_nome })
    : textoForma(titulo.formaPagamento || solicitacao.formaPagamento);
  if (instrucao?.forma_pagamento_id && titulo.forma_pagamento_id
    && Number(instrucao.forma_pagamento_id) !== Number(titulo.forma_pagamento_id)) {
    return resultado('Forma de pagamento diferente da instrução de origem. Confira antes de pagar.');
  }
  // Instrucao por titulo/medicao e soberana, inclusive quando esta incompleta:
  // nao preencher com chave de outro favorecido ou do cadastro atual.
  if (instrucao) {
    if (forma.includes('BOLETO')) {
      const codigo = titulo.linha_digitavel || titulo.codigo_barras;
      if (codigo) return resultado(`Boleto: ${codigo}`);
      if (instrucao.boleto_nomes?.length) return resultado(`Boleto anexado: ${instrucao.boleto_nomes.join(', ')}`);
    }
    if (forma.includes('PIX')) return resultado(instrucao.favorecido_chave_pix
      ? `PIX: ${instrucao.favorecido_chave_pix}` : 'Chave PIX não informada na origem. Confira antes de pagar.',
    instrucao.favorecido_chave_pix || null, instrucao.dados_pagamento || null);
    return resultado(instrucao.dados_pagamento || (instrucao.contato ? `Contato / instrução da medição: ${instrucao.contato}` : semDados));
  }
  // Somente herdar instrucao escalar da solicitacao se nao houver destinatario
  // especifico diferente no titulo (frete/parcelas podem ter outro recebedor).
  const mesmaOrigem = !banco && !titulo.payment_beneficiary_id && (!favorecidoTituloId
    || favorecidoTituloId === Number(solicitacao.favorecido_id || solicitacao.favorecido?.id));
  if (forma.includes('BOLETO')) {
    const codigo = titulo.linha_digitavel || titulo.codigo_barras;
    if (codigo) return resultado(`Boleto: ${codigo}`);
    if (mesmaOrigem && solicitacao.boletos?.[0]) return resultado(`Boleto anexado: ${solicitacao.boletos[0].nome}`);
  }
  if (banco) {
    // A conta explicitamente selecionada representa uma instrucao do titulo.
    // Nao cruzar seus dados com um favorecido diferente selecionado no titulo.
    const conflito = favorecidoTitulo && banco.cpf_cnpj && favorecidoTitulo.cpf_cnpj
      && String(banco.cpf_cnpj).replace(/\D/g, '') !== String(favorecidoTitulo.cpf_cnpj).replace(/\D/g, '');
    if (conflito) return resultado('Favorecido e conta indicada divergem. Confira os dados na origem antes de pagar.');
    if (banco.pix_chave && banco.pix_tipo_chave !== 'DADOS_BANCARIOS' && banco.metodo_preferencial !== 'CONTA_BANCARIA') {
      return resultado(`PIX ${banco.pix_tipo_chave || ''}: ${banco.pix_chave}`, banco.pix_chave);
    }
    if (banco.banco_codigo || banco.agencia || banco.conta) {
      const digito = (valor, dv) => `${valor || '—'}${dv ? `-${dv}` : ''}`;
      return resultado(`Banco ${banco.banco_codigo || '—'} · Ag. ${digito(banco.agencia, banco.agencia_digito)} · Conta ${digito(banco.conta, banco.conta_digito)}`);
    }
  }
  if (mesmaOrigem && forma.includes('PIX') && solicitacao.favorecido_chave_pix) return resultado(`PIX: ${solicitacao.favorecido_chave_pix}`,
    solicitacao.favorecido_chave_pix, solicitacao.dados_pagamento || null);
  if (mesmaOrigem && solicitacao.dados_pagamento) return resultado(solicitacao.dados_pagamento);
  return resultado(titulo.observacoes || semDados);
}
