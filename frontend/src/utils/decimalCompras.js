// GERADO por backend/scripts/gerarDecimalComprasFrontend.cjs; nao editar manualmente.
// Decimal exato de compras. Precos: 12 inteiros + 10 decimais; quantidades: 3 decimais.
// BigInt permanece interno: API e Sequelize recebem strings para unitarios e numeros em centavos para totais.
const PRICE_SCALE = 10;
const QUANTITY_SCALE = 3;
const PRODUCT_SCALE = PRICE_SCALE + QUANTITY_SCALE;
const pow10 = n => 10n ** BigInt(n);

function scaled(value, scale, { round = false } = {}) {
  let text = String(value ?? 0).trim();
  if (text === '') text = '0';
  // Number legado pode chegar em notacao cientifica; expandir sem fazer aritmetica binaria.
  const exp = text.match(/^([+-]?)(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/);
  if (exp) {
    const exponent = Number(exp[4]);
    if (Math.abs(exponent) > 100) throw new Error('Decimal fora da faixa de compras.');
    const digits = exp[2] + (exp[3] || '');
    const point = exp[2].length + exponent;
    text = exp[1] + (point <= 0 ? '0.' + '0'.repeat(-point) + digits
      : point >= digits.length ? digits + '0'.repeat(point - digits.length)
        : digits.slice(0, point) + '.' + digits.slice(point));
  }
  if (text.length > 140) throw new Error('Decimal fora da faixa de compras.');
  const match = text.match(/^([+-]?)(\d+)(?:\.(\d*))?$/);
  if (!match) throw new Error('Decimal invalido em compras.');
  const fraction = match[3] || '';
  const tail = fraction.slice(scale);
  if (!round && /[1-9]/.test(tail)) throw new Error(`Use no maximo ${scale} casas decimais.`);
  let integer = BigInt(match[2]) * pow10(scale) + BigInt((fraction.slice(0, scale) + '0'.repeat(scale)).slice(0, scale) || 0);
  if (round && tail && tail[0] >= '5') integer += 1n;
  return match[1] === '-' ? -integer : integer;
}

function fixed(integer, scale) {
  const sign = integer < 0n ? '-' : '';
  const digits = (integer < 0n ? -integer : integer).toString().padStart(scale + 1, '0');
  return scale ? sign + digits.slice(0, -scale) + '.' + digits.slice(-scale) : sign + digits;
}

function unitPrice(value) {
  const n = scaled(value, PRICE_SCALE);
  if (n < 0n || n >= pow10(22)) throw new Error('Preco unitario fora da faixa DECIMAL(22,10).');
  return fixed(n, PRICE_SCALE);
}

// Somente campos editaveis pt-BR. Nao usar para interpretar strings DECIMAL do banco.
function inputPrice(value) {
  let text = String(value ?? '').trim().replace(/R\$|\s/g, '');
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  return unitPrice(text || 0);
}

function editablePrice(value) {
  return unitPrice(value).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
}

function displayPrice(value) {
  const [integer, decimals] = unitPrice(value).split('.');
  return 'R$ ' + integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + decimals.replace(/0+$/, '').padEnd(2, '0');
}

function itemKey(item, fallback = '') {
  const ref = item.item_referencia_id || item.solicitacao_compra_item_id || item.solicitacao_compra_item_manual_id;
  return ref ? String(item.item_tipo).toUpperCase() + ':' + ref : String(item.resposta_item_id || item.id || fallback);
}

function centsNumber(cents) {
  if (cents > 99999999999999n || cents < -99999999999999n) throw new Error('Total fora da faixa monetaria de compras.');
  return Number(cents) / 100;
}

function money(value) { return centsNumber(scaled(value, 2, { round: true })); }
function sumMoney(values) { return centsNumber(values.reduce((sum, value) => sum + scaled(value, 2, { round: true }), 0n)); }
function product(quantity, price) {
  const q = scaled(quantity, QUANTITY_SCALE);
  if (q < 0n) throw new Error('Quantidade de compras nao pode ser negativa.');
  return q * scaled(unitPrice(price), PRICE_SCALE);
}
function roundProduct(n) {
  const divisor = pow10(PRODUCT_SCALE - 2);
  return (n + divisor / 2n) / divisor;
}
function lineMoney(quantity, price) { return centsNumber(roundProduct(product(quantity, price))); }

// Total da mercadoria arredondado uma unica vez, HALF_UP. Os centavos sao
// distribuidos por maiores restos com desempate por chave estavel, sem alterar o preco.
function merchandise(items) {
  const divisor = pow10(PRODUCT_SCALE - 2);
  const rows = items.map((item, index) => {
    const exact = product(item.quantity, item.price);
    return { index, key: String(item.key ?? index).padStart(20, '0'), exact,
      cents: exact / divisor, remainder: exact % divisor };
  });
  const total = roundProduct(rows.reduce((sum, row) => sum + row.exact, 0n));
  let remaining = total - rows.reduce((sum, row) => sum + row.cents, 0n);
  const ranked = [...rows].sort((a,b) => a.remainder === b.remainder
    ? a.key.localeCompare(b.key) || a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const row of ranked) if (remaining > 0n) { row.cents += 1n; remaining -= 1n; }
  return { total: centsNumber(total), lines: rows.map(row => centsNumber(row.cents)),
    adjustments: rows.map(row => centsNumber(row.cents - roundProduct(row.exact))) };
}

export { PRICE_SCALE, QUANTITY_SCALE, unitPrice, inputPrice, editablePrice, displayPrice, itemKey, money, sumMoney, lineMoney, merchandise };
