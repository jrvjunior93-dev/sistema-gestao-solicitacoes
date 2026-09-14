const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  parsePdfFile,
  parseReceiptText,
  scoreCandidate
} = require('../src/services/pagamentoComprovantePdfService');

function testParsers() {
  const bb = parseReceiptText(`SISBB - SISTEMA DE INFORMACOES BANCO DO BRASIL
Comprovante Pix
CLIENTE: EMPRESA TESTE
AGENCIA: 1234-5 CONTA: 99.999-0
ID: E123456
CNPJ DO PAGADOR: 11.111.111/0001-11
VALOR: R$590,00
DATA: 01/09/2026 - 10:03:34
DESCRICAO:SOL-5296
PAGO PARA: FORNECEDOR TESTE
CNPJ: 22.222.222/0001-22
AUTENTICACAO SISBB: A.B.C`, 'bb.pdf');
  assert.equal(bb.banco, 'BANCO_DO_BRASIL');
  assert.equal(bb.tipo, 'PIX');
  assert.equal(bb.valor, 590);
  assert.equal(bb.data_pagamento, '2026-09-01');
  assert.equal(bb.referencia_solicitacao, 'SOL-5296');

  const caixaPix = parseReceiptText(`Comprovante de Transação Pix
ID da transação: E999
Situação: EFETIVADA    Data e Hora: 11/09/2026 às 18:52:53
Valor Original: R$ 8.750,00    Valor Atualizado: R$ 8.750,00
Detalhes: SOL5525
Origem
Nome: EMPRESA TESTE
CNPJ: 11.111.111/0001-11
Destino
Nome: PESSOA TESTE
CPF: XXX.095.807-XX
Código da operação: 71762579752`, 'caixa-pix.pdf');
  assert.equal(caixaPix.banco, 'CAIXA');
  assert.equal(caixaPix.tipo, 'PIX');
  assert.equal(caixaPix.status_documento, 'EFETIVADA');
  assert.equal(caixaPix.valor, 8750);

  const boleto = parseReceiptText(`Comprovante de Pagamento de Boleto
Pagador Final / Efetivo
CPF/CNPJ: 11.111.111/0001-11
Nome: EMPRESA TESTE
Conta de débito: 00557 | 1292 | 000578450603-6
Histórico do Pagamento: SOL5059
Representação numérica do código de barras: 75691.30086 01027.393709 00166.080010 1
15590001042077
Instituição Emissora - Nome do Banco: BANCO TESTE
Beneficiário original / Cedente
Nome Fantasia: FORNECEDOR TESTE
CPF/CNPJ: 22.222.222/0001-22
Data de Efetivação / Agendamento: 11/09/2026
Valor Pago (R$): 10.782,01
Código da operação: 123`, 'boleto.pdf');
  assert.equal(boleto.tipo, 'BOLETO');
  assert.equal(boleto.valor, 10782.01);
  assert.equal(boleto.linha_digitavel, '75691300860102739370900166080010115590001042077');

  const darf = parseReceiptText(`Comprovante de pagamento de DARF NUMERADO
Código de barras: 858600010239 359803852621 190716262195 792527510854
Data do pagamento: 07/08/2026
Número do documento: 07162621979252751
Valor total: 102.335,98
Autenticação: 493074909
Nome: EMPRESA TESTE
Conta de débito: 557 / 1292 / 000578450603-6`, 'darf.pdf');
  assert.equal(darf.tipo, 'DARF');
  assert.equal(darf.valor, 102335.98);

  const tev = parseReceiptText(`TEV Enviada
Via Internet Banking CAIXA
Conta origem: 0557 / 1292 / 000578450603-6
Conta destino: 0557 / 1292 / 000568794528-4
Nome destinatário: EMPRESA DESTINO
Valor: R$ 10.500,00
Data de débito: 10/09/2026
Código da operação: 954192680`, 'tev.pdf');
  assert.equal(tev.tipo, 'TEV');
  assert.equal(tev.valor, 10500);
  assert.equal(tev.conta_destino_numero, '000568794528-4');

  const sicredi = parseReceiptText(`Comprovante de Pagamento Pix
Sicredi
Valor: R$ 50.611,60
Realizado em: 11/09/2026 - 15:01:44
Cooperativa e conta origem: 0307/23239-2
Nome do destinatário: FORNECEDOR TESTE
CNPJ do destinatário: 22.222.222/0001-22
Nome do pagador: EMPRESA TESTE
CNPJ do pagador: 11.111.111/0001-11
ID da transação: E88894548
Autenticação Eletrônica: E888`, 'SOL-5570.pdf');
  assert.equal(sicredi.banco, 'SICREDI');
  assert.equal(sicredi.valor, 50611.6);
  assert.equal(sicredi.referencia_solicitacao, 'SOL-5570');

  const scored = scoreCandidate(bb, {
    valor_previsto: 590,
    titulo: {
      valor_saldo: 590,
      valor_original: 590,
      data_vencimento: '2026-09-01',
      solicitacao: { codigo: 'SOL-5296' },
      paymentBeneficiary: { nome: 'FORNECEDOR TESTE', cpf_cnpj: '22.222.222/0001-22' }
    }
  });
  assert(scored.score >= 90, 'O conjunto forte deve gerar sugestao segura.');
}

async function testRealFiles(paths) {
  for (const filePath of paths) {
    const parsed = await parsePdfFile({
      originalname: path.basename(filePath),
      mimetype: 'application/pdf',
      buffer: fs.readFileSync(filePath)
    });
    assert(parsed.dados.texto_reconhecido, `${path.basename(filePath)} nao foi reconhecido.`);
    assert(parsed.dados.valor > 0, `${path.basename(filePath)} ficou sem valor.`);
    assert(parsed.dados.data_pagamento, `${path.basename(filePath)} ficou sem data.`);
    process.stdout.write(`${path.basename(filePath)}: ${parsed.dados.banco}/${parsed.dados.tipo} OK\n`);
  }
}

(async () => {
  testParsers();
  await testRealFiles(process.argv.slice(2));
  console.log('Leitura deterministica de comprovantes PDF validada com sucesso.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
