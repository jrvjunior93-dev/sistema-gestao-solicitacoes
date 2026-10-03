// Padronização de caixa na EXIBIÇÃO das listas (os registros antigos do
// banco nunca são reescritos — a normalização de gravação, só para novos
// registros, vive em backend/src/utils/normalizarTexto.js com a mesma
// regra de siglas).

const PALAVRAS_COMUNS = new Set([
  'DA', 'DE', 'DO', 'DAS', 'DOS', 'EM', 'NA', 'NO', 'NAS', 'NOS',
  'AO', 'AOS', 'A', 'E', 'O', 'AS', 'COM', 'PARA', 'POR',
  'UM', 'UMA', 'UNS', 'UMAS', 'SEM', 'SOB', 'ATE', 'QUE'
]);

function semAcentos(valor) {
  return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Código e obra: sempre MAIÚSCULAS.
export function formatarMaiusculas(texto) {
  return String(texto || '').trim().toUpperCase();
}

// Descrição: sentence case consistente. Texto todo gritado é baixado;
// em caixa mista, siglas curtas deliberadas (NF, OS, DDA) sobrevivem.
export function formatarDescricao(texto) {
  const bruto = String(texto || '').trim().replace(/\s+/g, ' ');
  if (!bruto) return bruto;

  const somenteLetras = bruto.replace(/[^\p{L}]/gu, '');
  const textoGritado = somenteLetras.length > 0 && somenteLetras === somenteLetras.toUpperCase();

  const tokens = bruto.split(' ').map((token) => {
    if (textoGritado) return token.toLowerCase();
    const letras = token.replace(/[^\p{L}]/gu, '');
    const ehSigla = letras.length >= 2
      && letras.length <= 4
      && letras === letras.toUpperCase()
      && /\p{L}/u.test(letras)
      && !PALAVRAS_COMUNS.has(semAcentos(letras));
    return ehSigla ? token : token.toLowerCase();
  });

  return tokens.join(' ').replace(/^\p{L}/u, (c) => c.toUpperCase());
}

function dataLocalISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function diasAte(dataISO) {
  const alvo = String(dataISO || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(alvo)) return null;
  const hoje = new Date(`${dataLocalISO()}T00:00:00`);
  const data = new Date(`${alvo}T00:00:00`);
  if (Number.isNaN(data.getTime())) return null;
  return Math.round((data - hoje) / 86400000);
}

// Vencimento em linguagem humana: "Venceu há 3d", "Vence hoje", "em 12d".
export function vencimentoHumano(dataISO) {
  const dias = diasAte(dataISO);
  if (dias === null) return '';
  if (dias < 0) return `Venceu há ${Math.abs(dias)}d`;
  if (dias === 0) return 'Vence hoje';
  if (dias === 1) return 'Vence amanhã';
  return `em ${dias}d`;
}

// Tarja de urgência: vermelho = vencido, âmbar = vence hoje/amanhã,
// neutro (null) = no prazo ou sem vencimento.
export function urgenciaVencimento(dataISO) {
  const dias = diasAte(dataISO);
  if (dias === null) return null;
  if (dias < 0) return 'danger';
  if (dias <= 1) return 'warning';
  return null;
}

// ---------------------------------------------------------------------
// Descrição estruturada: quando o texto contém pares "Rótulo: valor"
// ("Credor: X Formas de pagamento: Y Valor bruto: Z..."), o detalhe os
// exibe como CAMPOS, no mesmo padrão do bloco superior — parágrafo
// corrido é mais difícil de ler. Só entra em modo estruturado com 2+
// pares; senão o texto fica como está. Nada é reescrito no banco.
// ---------------------------------------------------------------------
export function extrairParesDescricao(texto) {
  const bruto = String(texto || '').trim();
  if (!bruto) return { textoLivre: '', pares: [] };

  // Marca cada ": " cujo trecho imediatamente anterior pareça um rótulo:
  // andando para trás, o rótulo termina na primeira palavra com inicial
  // MAIÚSCULA (assim "CASA trigo LTDA Formas de pagamento:" vira o rótulo
  // "Formas de pagamento", e "LTDA" fica no valor do par anterior).
  const marcas = [];
  for (let i = 0; i < bruto.length; i += 1) {
    if (bruto[i] !== ':' || bruto[i + 1] !== ' ') continue;
    const antes = bruto.slice(0, i);
    const m = antes.match(/(\S+(?: \S+){0,3})$/);
    if (!m) continue;
    const palavras = m[1].split(' ');
    const rotuloPalavras = [];
    for (let j = palavras.length - 1; j >= 0; j -= 1) {
      rotuloPalavras.unshift(palavras[j]);
      if (/^[A-Z\u00c0-\u00da]/.test(palavras[j])) break;
    }
    let rotulo = rotuloPalavras.join(' ');
    if (!/^[A-Z\u00c0-\u00da]/.test(rotulo) || rotulo.length > 32 || rotulo.includes(':')) continue;
    // Compostos com duas maiúsculas que são um rótulo só.
    const antesRotulo = bruto.slice(0, i - rotulo.length).trimEnd();
    if (/^PIX$/i.test(rotulo) && /(^|\s)Chave$/i.test(antesRotulo)) {
      rotulo = `Chave ${rotulo}`;
    }
    marcas.push({ inicio: i - rotulo.length, fimRotulo: i + 2, rotulo });
  }

  if (marcas.length < 2) return { textoLivre: bruto, pares: [] };

  const textoLivre = bruto.slice(0, marcas[0].inicio).trim().replace(/[-\u2013|,;]+$/, '').trim();
  const pares = marcas.map((marca, indice) => {
    const fimValor = indice + 1 < marcas.length ? marcas[indice + 1].inicio : bruto.length;
    return {
      rotulo: marca.rotulo,
      valor: bruto.slice(marca.fimRotulo, fimValor).trim()
    };
  }).filter((par) => par.valor !== '');

  if (pares.length < 2) return { textoLivre: bruto, pares: [] };
  return { textoLivre, pares };
}
