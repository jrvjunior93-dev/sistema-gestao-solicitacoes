'use strict';

// =====================================================================
// VALIDACAO DAS PREFERENCIAS DE LISTA (componente ListaAvancada)
// ---------------------------------------------------------------------
// Modulo separado de proposito: o caminho unitario
// (PUT /listas/:lista/preferencias) e o caminho em lote
// (POST /me/preferencias/adotar) usam EXATAMENTE estas funcoes. Um
// caminho de escrita em lote com validacao propria contorna toda a
// validacao de uma vez — por isso ela mora aqui, num lugar so, e e
// testada em scripts/validarListaPreferencias.js sem precisar de banco.
// =====================================================================

// Por que 160 e nao 80: as chaves de tabela do frontend sao hierarquicas
// (`tabela:auditoria-operacional:produtividade-financeira`). Medido em
// 05/09/2026 sobre frontend/src: 280 chaves `tabela:*` distintas, as 280
// com `:`, a maior com 64 caracteres. O teto de 80 ja estava perto do
// maior caso real; 160 da folga para o proximo nivel de hierarquia sem
// exigir nova migration.
const LISTA_MAX = 160;

// Por que `:` passou a ser aceito: o padrao anterior era
// /^[a-z0-9_-]+$/, que NAO aceita `:`. Com ele, as 280 chaves de tabela
// do frontend (280 de 280 tem `:`) recebiam 400 em TODA gravacao — o
// mecanismo de preferencia por usuario existia e estava inalcancavel
// justamente para as listas que mais precisavam dele.
const LISTA_PADRAO = /^[a-z0-9_:-]+$/;

// Valores fechados. VARCHAR no banco + validacao aqui (e nao ENUM):
// acrescentar um tipo novo passa a ser mudanca de codigo, sem ALTER
// TABLE numa tabela com indice unico.
const TIPOS_PREFERENCIA = Object.freeze([
  'colunas',
  'larguras',
  'filtros',
  'blocos',
  'visual',
  'geral'
]);

const TIPO_PADRAO = 'geral';

// Tetos em BYTES UTF-8 (Buffer.byteLength), nao em caracteres: um
// acento ocupa 2 bytes e a coluna do banco e medida em bytes.
//
// `geral` fica em 32KB porque e o balde legado — a rota antiga
// `PUT /listas/:lista/preferencias` sem tipo grava tudo junto ali
// (colunas + larguras + blocos + filtros no mesmo JSON) e ja vinha com
// teto de 32KB. Baixar esse teto agora quebraria gravacao que hoje
// funciona.
const LIMITE_BYTES_POR_TIPO = Object.freeze({
  colunas: 8 * 1024,
  larguras: 8 * 1024,
  visual: 8 * 1024,
  blocos: 16 * 1024,
  filtros: 32 * 1024,
  geral: 32 * 1024
});

// Teto do lote de adocao. Duas travas, nao uma:
// - itens: 100 entradas por chamada;
// - bytes: 1MB somado, bem abaixo do limite de corpo do express
//   (REQUEST_BODY_LIMIT_MB, 2MB por padrao) para o erro sair daqui, com
//   mensagem util, em vez de virar um 413 opaco do body-parser.
const ADOCAO_MAX_ITENS = 100;
const ADOCAO_MAX_BYTES_TOTAL = 1024 * 1024;

function formatarKb(bytes) {
  return `${(Number(bytes || 0) / 1024).toFixed(1)}KB`;
}

function normalizarLista(valor) {
  const lista = String(valor || '').trim().toLowerCase();
  if (!lista || lista.length > LISTA_MAX || !LISTA_PADRAO.test(lista)) {
    return null;
  }
  return lista;
}

// `padrao` existe para a rota legada, que nao informa tipo e precisa
// continuar caindo em `geral`. Onde o tipo e obrigatorio (adocao em
// lote), chame com padrao = null.
function normalizarTipo(valor, padrao = TIPO_PADRAO) {
  const bruto = String(valor === undefined || valor === null ? '' : valor).trim().toLowerCase();
  if (!bruto) return padrao;
  return TIPOS_PREFERENCIA.includes(bruto) ? bruto : null;
}

function limiteBytesDoTipo(tipo) {
  return LIMITE_BYTES_POR_TIPO[tipo] || LIMITE_BYTES_POR_TIPO[TIPO_PADRAO];
}

// Retorna { texto, bytes } quando valido, { erro } quando nao. NUNCA
// trunca: JSON cortado no meio e JSON invalido, e viraria perda
// silenciosa na proxima leitura. Estourando o teto, a gravacao nao
// acontece e a preferencia anterior permanece intacta.
function serializarPreferencias(valor, tipo) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    return { erro: 'Preferencias invalidas: envie um objeto JSON.' };
  }

  let texto;
  try {
    texto = JSON.stringify(valor);
  } catch {
    return { erro: 'Preferencias invalidas: JSON nao serializavel.' };
  }
  if (typeof texto !== 'string') {
    return { erro: 'Preferencias invalidas: JSON nao serializavel.' };
  }

  const bytes = Buffer.byteLength(texto, 'utf8');
  const limite = limiteBytesDoTipo(tipo);
  if (bytes > limite) {
    return {
      erro: `Preferencias do tipo "${tipo}" excedem o limite de ${formatarKb(limite)} `
        + `(enviado ${formatarKb(bytes)}). Nada foi gravado e a preferencia anterior foi mantida.`
    };
  }

  return { texto, bytes };
}

// Validacao de UMA entrada, seja ela do caminho unitario ou do lote.
// Retorna { lista, tipo, texto, bytes } ou { erro }.
function validarEntradaPreferencia({ lista, tipo, preferencias }, { tipoPadrao = TIPO_PADRAO } = {}) {
  const listaNormalizada = normalizarLista(lista);
  if (!listaNormalizada) {
    return { erro: 'Lista invalida' };
  }

  const tipoNormalizado = normalizarTipo(tipo, tipoPadrao);
  if (!tipoNormalizado) {
    return { erro: `Tipo invalido. Valores aceitos: ${TIPOS_PREFERENCIA.join(', ')}.` };
  }

  const serializado = serializarPreferencias(preferencias, tipoNormalizado);
  if (serializado.erro) {
    return { erro: serializado.erro };
  }

  return {
    lista: listaNormalizada,
    tipo: tipoNormalizado,
    texto: serializado.texto,
    bytes: serializado.bytes
  };
}

// Valida o lote INTEIRO antes de gravar qualquer coisa: uma entrada
// ruim reprova a chamada toda e nenhuma preferencia anterior e tocada.
// Retorna { itens, bytes } ou { erro, rejeitadas }.
function validarLoteAdocao(corpo) {
  const itens = corpo?.itens;
  if (!Array.isArray(itens) || itens.length === 0) {
    return { erro: 'Envie "itens" como uma lista nao vazia de preferencias.' };
  }
  if (itens.length > ADOCAO_MAX_ITENS) {
    return { erro: `Limite de ${ADOCAO_MAX_ITENS} preferencias por chamada (recebidas ${itens.length}).` };
  }

  const validos = [];
  const rejeitadas = [];
  const vistos = new Set();
  let bytesTotal = 0;

  itens.forEach((item, indice) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      rejeitadas.push({ indice, erro: 'Entrada invalida: envie um objeto com lista, tipo e preferencias.' });
      return;
    }

    // O tipo e OBRIGATORIO no lote: adotar sem dizer o tipo jogaria
    // tudo em `geral` e desfaria a separacao de que o reset por tipo
    // depende.
    const resultado = validarEntradaPreferencia(item, { tipoPadrao: null });
    if (resultado.erro) {
      rejeitadas.push({
        indice,
        lista: item.lista === undefined ? null : item.lista,
        tipo: item.tipo === undefined ? null : item.tipo,
        erro: resultado.erro
      });
      return;
    }

    const chave = `${resultado.lista} ${resultado.tipo}`;
    if (vistos.has(chave)) {
      rejeitadas.push({
        indice,
        lista: resultado.lista,
        tipo: resultado.tipo,
        erro: 'Entrada duplicada no mesmo lote (lista + tipo repetidos).'
      });
      return;
    }
    vistos.add(chave);

    bytesTotal += resultado.bytes;
    validos.push(resultado);
  });

  if (rejeitadas.length > 0) {
    return { erro: 'Nenhuma preferencia foi gravada: ha entradas invalidas no lote.', rejeitadas };
  }
  if (bytesTotal > ADOCAO_MAX_BYTES_TOTAL) {
    return {
      erro: `Lote excede ${formatarKb(ADOCAO_MAX_BYTES_TOTAL)} somados (enviado ${formatarKb(bytesTotal)}). `
        + 'Divida a adocao em chamadas menores; nada foi gravado.',
      rejeitadas: []
    };
  }

  return { itens: validos, bytes: bytesTotal };
}

module.exports = {
  ADOCAO_MAX_BYTES_TOTAL,
  ADOCAO_MAX_ITENS,
  LIMITE_BYTES_POR_TIPO,
  LISTA_MAX,
  TIPOS_PREFERENCIA,
  TIPO_PADRAO,
  formatarKb,
  limiteBytesDoTipo,
  normalizarLista,
  normalizarTipo,
  serializarPreferencias,
  validarEntradaPreferencia,
  validarLoteAdocao
};
