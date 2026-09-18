'use strict';

const falhar = (mensagem) => { throw Object.assign(new Error(mensagem), { statusCode: 400 }); };
const LIMITE_CENTAVOS = 99999999999999; // DECIMAL(14,2)

function centavos(valor, campo = 'Valor') {
  const texto = String(valor ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(texto)) falhar(`${campo} deve ser um valor não negativo com até duas casas decimais.`);
  const [inteiro, decimal = ''] = texto.split('.');
  const resultado = BigInt(inteiro) * 100n + BigInt(decimal.padEnd(2, '0'));
  if (resultado > BigInt(LIMITE_CENTAVOS)) falhar(`${campo} excede o limite permitido.`);
  return Number(resultado);
}

function dinheiro(valor) {
  if (!Number.isSafeInteger(valor) || valor < 0 || valor > LIMITE_CENTAVOS) falhar('Total fora do limite permitido.');
  return `${Math.floor(valor / 100)}.${String(valor % 100).padStart(2, '0')}`;
}

function validarData(data) {
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) falhar('Informe uma data válida no formato AAAA-MM-DD.');
  const objeto = new Date(`${data}T12:00:00Z`);
  if (Number.isNaN(objeto.getTime()) || objeto.toISOString().slice(0, 10) !== data) falhar('Data inválida.');
  return data;
}

function somarMeses(data, meses) {
  validarData(data);
  const [ano, mes, dia] = data.split('-').map(Number);
  const base = new Date(Date.UTC(ano, mes - 1 + meses, 1, 12));
  const ultimo = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0, 12)).getUTCDate();
  base.setUTCDate(Math.min(dia, ultimo));
  return validarData(base.toISOString().slice(0, 10));
}

function encargo(principal, entrada, campo) {
  const config = entrada ?? { tipo: 'VALOR', valor: '0.00' };
  if (!config || typeof config !== 'object' || Array.isArray(config)
    || Object.keys(config).some((key) => !['tipo', 'valor'].includes(key))) falhar(`${campo} inválido.`);
  if (!['VALOR', 'PERCENTUAL'].includes(config.tipo)) falhar(`Tipo de ${campo.toLowerCase()} inválido.`);
  const valor = centavos(config.valor, campo);
  if (config.tipo === 'VALOR') return valor;
  if (valor > 100000) falhar(`${campo} percentual deve ser no máximo 1.000%.`);
  // Percentual com duas casas: 2,50% = 250/10000. Arredonda meio centavo para cima.
  const resultado = Number((BigInt(principal) * BigInt(valor) + 5000n) / 10000n);
  dinheiro(resultado);
  return resultado;
}

function distribuir(total, quantidade) {
  if (!Number.isSafeInteger(quantidade) || quantidade < 1 || quantidade > 120) falhar('Informe entre 1 e 120 parcelas.');
  if (total < quantidade) falhar('Cada parcela deve ter pelo menos R$ 0,01.');
  const base = Math.floor(total / quantidade);
  return Array.from({ length: quantidade }, (_, i) => base + (i < total % quantidade ? 1 : 0));
}

function calcularNegociacao(saldos, payload, hoje) {
  validarData(hoje);
  if (!Array.isArray(saldos) || saldos.length < 1 || saldos.length > 100) falhar('Selecione entre 1 e 100 títulos.');
  const valores = saldos.map((v) => centavos(v, 'Saldo do título'));
  if (valores.some((v) => v <= 0)) falhar('Todos os títulos devem possuir saldo positivo.');
  const principal = valores.reduce((sum, v) => sum + v, 0);
  dinheiro(principal);
  const juros = encargo(principal, payload.juros, 'Juros');
  const multa = encargo(principal, payload.multa, 'Multa');
  const total = principal + juros + multa;
  dinheiro(total);
  let parcelas;
  if (payload.parcelas !== undefined) {
    if (!Array.isArray(payload.parcelas) || !payload.parcelas.length || payload.parcelas.length > 120) falhar('Informe entre 1 e 120 parcelas.');
    parcelas = payload.parcelas.map((p, i) => {
      if (!p || typeof p !== 'object' || Object.keys(p).some((key) => !['vencimento', 'valor'].includes(key))) falhar('Parcela inválida.');
      const valor = centavos(p.valor, `Valor da parcela ${i + 1}`);
      if (!valor) falhar('Parcelas devem ter valor positivo.');
      const vencimento = validarData(p.vencimento);
      if (vencimento < hoje) falhar('As novas parcelas devem vencer hoje ou no futuro.');
      return { numero: i + 1, vencimento, valor: dinheiro(valor) };
    });
    if (parcelas.reduce((sum, p) => sum + centavos(p.valor), 0) !== total) falhar('A soma das parcelas deve corresponder ao saldo negociado mais juros e multa.');
    if (parcelas.some((p, i) => i && p.vencimento < parcelas[i - 1].vencimento)) falhar('Os vencimentos devem estar em ordem crescente.');
  } else {
    const primeiro = validarData(payload.primeiro_vencimento);
    if (primeiro < hoje) falhar('O primeiro vencimento deve ser hoje ou futuro.');
    parcelas = distribuir(total, payload.quantidade_parcelas).map((valor, i) => ({
      numero: i + 1, vencimento: somarMeses(primeiro, i), valor: dinheiro(valor)
    }));
  }
  return { principal: dinheiro(principal), juros: dinheiro(juros), multa: dinheiro(multa), total: dinheiro(total), parcelas };
}

// Método dos maiores restos: valores exatos e desempate estável pela ordem das origens.
function ratear(total, pesos) {
  const soma = pesos.reduce((s, p) => s + p, 0);
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(soma) || soma <= 0
    || pesos.some((p) => !Number.isSafeInteger(p) || p < 0)) falhar('Rateio inválido.');
  const partes = pesos.map((p, i) => ({ i, valor: Number(BigInt(total) * BigInt(p) / BigInt(soma)),
    resto: BigInt(total) * BigInt(p) % BigInt(soma) }));
  let falta = total - partes.reduce((s, p) => s + p.valor, 0);
  for (const p of [...partes].sort((a,b)=>a.resto===b.resto?a.i-b.i:a.resto>b.resto?-1:1)) {
    if (!falta) break; p.valor++; falta--;
  }
  return partes.map(p=>p.valor);
}

function alocarParcelas(origens, calculo) {
  const pesos = origens.map(o=>centavos(o.saldo));
  const juros = ratear(centavos(calculo.juros), pesos), multa = ratear(centavos(calculo.multa), pesos);
  const restantes = pesos.map((p,i)=>[p,juros[i],multa[i]]);
  return calculo.parcelas.map(parcela=>{
    const totais = restantes.map(v=>v.reduce((s,n)=>s+n,0));
    const valores = ratear(centavos(parcela.valor), totais);
    return valores.flatMap((valor,i)=>{
      if (!valor) return [];
      const componentes = ratear(valor,restantes[i]);
      componentes.forEach((v,c)=>{restantes[i][c]-=v;});
      return [{...origens[i], valor:dinheiro(valor), principal:dinheiro(componentes[0]),
        juros:dinheiro(componentes[1]), multa:dinheiro(componentes[2])}];
    });
  });
}

module.exports = { centavos, dinheiro, validarData, somarMeses, encargo, distribuir, calcularNegociacao, ratear, alocarParcelas };
