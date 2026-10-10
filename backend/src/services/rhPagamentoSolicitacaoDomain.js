'use strict';

const { ValidationError } = require('../middlewares/validation');
const FLUXO = 'PAGAMENTO_POR_SOLICITACAO';
const dinheiro = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const texto = (v, max = 180) => String(v ?? '').trim().slice(0, max);

function numero(v, campo, max = 999999999) {
  const n = Number(v || 0);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new ValidationError(`${campo}: valor invalido.`);
  return dinheiro(n);
}

function calcularLinha(linha, cadastro) {
  const diaria = cadastro.forma_calculo_gerencial === 'DIARIA';
  const percentual = diaria || Boolean(linha.parcela_40) === Boolean(linha.parcela_60)
    ? 100 : linha.parcela_40 ? 40 : 60;
  const dias = numero(linha.dias, 'Dias', 31);
  const faltas = numero(linha.faltas, 'Faltas', dias);
  const base = numero(diaria ? cadastro.valor_diaria : cadastro.salario_base, 'Salario');
  const acrescimos = numero(linha.acrescimos, 'Acrescimos');
  const descontos = numero(linha.descontos, 'Descontos');
  // A divisao mensal permanece de 30 dias. Os ajustes nao sao rateados pelo percentual.
  const bruto = dinheiro(diaria ? base * (dias - faltas) : base * (dias - faltas) / 30 * percentual / 100);
  const liquido = dinheiro(bruto + acrescimos - descontos);
  if (liquido < 0) throw new ValidationError(`Descontos maiores que o pagamento de ${cadastro.nome}.`);
  return { percentual, dias, faltas, acrescimos, descontos, bruto, liquido, diaria, base };
}

function recebimento(linha, cadastro, pagamento = {}, exigir = false) {
  const modo = ['PIX', 'CONTA_SALARIO', 'OUTRA_CONTA'].includes(linha.modo_recebimento)
    ? linha.modo_recebimento : 'PIX';
  const contaSalario = modo === 'CONTA_SALARIO';
  const salario = cadastro.conta_salario || {
    favorecido_nome: pagamento.favorecido_nome || cadastro.nome,
    favorecido_documento: pagamento.favorecido_documento || cadastro.cpf,
    banco: pagamento.banco || cadastro.banco, agencia: pagamento.agencia || cadastro.agencia,
    conta: pagamento.conta || cadastro.conta, tipo_conta: pagamento.tipo_conta || cadastro.conta_tipo
  };
  const dados = {
    modo_recebimento: modo,
    favorecido_nome: texto(contaSalario ? salario.favorecido_nome : linha.favorecido_nome || cadastro.nome),
    favorecido_documento: texto(contaSalario ? salario.favorecido_documento : linha.favorecido_documento || cadastro.cpf, 20),
    chave_pix: modo === 'PIX' ? texto(linha.chave_pix ?? pagamento.chave_pix ?? cadastro.pix_chave, 8192) : '',
    banco: modo === 'PIX' ? '' : texto(contaSalario ? salario.banco : linha.banco, 10),
    agencia: modo === 'PIX' ? '' : texto(contaSalario ? salario.agencia : linha.agencia, 20),
    conta: modo === 'PIX' ? '' : texto(contaSalario ? salario.conta : linha.conta, 30),
    tipo_conta: texto(contaSalario ? salario.tipo_conta : linha.tipo_conta, 30)
  };
  if (exigir && (!dados.favorecido_nome || ![11, 14].includes(dados.favorecido_documento.replace(/\D/g, '').length)
    || (modo === 'PIX' ? !dados.chave_pix : !dados.banco || !dados.agencia || !dados.conta))) {
    throw new ValidationError(`Informe os dados de recebimento de ${cadastro.nome}.`);
  }
  return dados;
}

function validarPeriodo(dados) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(dados.competencia || '')) throw new ValidationError('Informe a competencia.');
  const vencimento = String(dados.data_vencimento || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento)
    || !Number.isFinite(Date.parse(`${vencimento}T12:00:00Z`))
    || new Date(`${vencimento}T12:00:00Z`).toISOString().slice(0, 10) !== vencimento) {
    throw new ValidationError('Informe um vencimento valido.');
  }
}

module.exports = { FLUXO, dinheiro, texto, calcularLinha, recebimento, validarPeriodo };
