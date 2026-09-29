import { API_URL, authHeaders } from '../../../services/api';

/*
  Previsão x medição do mês anterior (Fase 5, regra "A + B" de 29/09).
  Mesmo padrão de fetch/erros de services/custosRecebiveis.js; fica em arquivo
  próprio para não disputar o serviço principal com outra frente da reforma.
*/

async function parseResponse(response, fallbackMessage) {
  const text = await response.text();
  let payload = null;
  let bodyIsJson = false;
  if (text) {
    try {
      payload = JSON.parse(text);
      bodyIsJson = true;
    } catch {
      // Página HTML (502/404 do proxy): nunca vira mensagem na tela.
      payload = response.ok ? { error: text } : null;
    }
  }

  if (!response.ok) {
    // 404 aqui = servidor ainda sem o endpoint (preview antes do deploy).
    const unavailable = response.status === 404 && !payload?.code;
    const serverMessage = bodyIsJson && typeof payload?.error === 'string'
      && payload.error.trim() && !payload.error.trim().startsWith('<')
      ? payload.error
      : '';
    let message = serverMessage || fallbackMessage;
    if (unavailable) message = 'Ajuste da previsão indisponível no servidor no momento.';
    else if (!bodyIsJson && response.status >= 500) message = 'O servidor não respondeu. Tente de novo em instantes.';
    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.code || null;
    error.details = payload?.details || null;
    throw error;
  }
  return payload;
}

export function novaChaveIdempotencia(prefix = 'cr-ajuste-previsao') {
  return globalThis.crypto?.randomUUID?.()
    || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Reduz a medição prevista da competência ao saldo disponível, só nos itens
// indicados. A chave de idempotência vem de quem chama: uma por tentativa.
export async function ajustarPrevisaoAoSaldo(obraId, competencia, planoItemIds, idempotencyKey) {
  const response = await fetch(
    `${API_URL}/custos-recebiveis/obras/${obraId}/competencias/${competencia}/previsao/ajustar-saldo`,
    {
      method: 'POST',
      headers: authHeaders({
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey || novaChaveIdempotencia()
      }),
      body: JSON.stringify({ plano_item_ids: planoItemIds })
    }
  );
  return parseResponse(response, 'Não foi possível ajustar a previsão ao saldo.');
}

/*
  Mensagem legível para erro de planilha de planejamento. O servidor responde
  com código e texto técnico sem acento; aqui vira instrução de ação.
*/
// Fórmula sem resultado (CR_PLANILHA_FORMULA_SEM_RESULTADO) ou com erro
// (CR_PLANILHA_FORMULA_ERRO): vale a mensagem do servidor, que já diz a célula
// e pede abrir e salvar no Excel/LibreOffice.
const MENSAGENS_PLANILHA = {
  CR_PLANILHA_REQUIRED: 'Selecione um arquivo .xlsx.',
  CR_PLANILHA_FORMATO: 'Use o modelo baixado nesta tela, no formato .xlsx.',
  CR_PLANILHA_INVALIDA: 'Não foi possível ler a planilha. Abra o arquivo no Excel, salve como .xlsx e importe de novo.',
  CR_PLANILHA_ABA: 'A aba PREENCHIMENTO não foi encontrada. Use o modelo baixado nesta tela.',
  CR_PLANILHA_CONTEXTO: 'Esta planilha não é o modelo desta obra e competência. Baixe o modelo novamente.',
  CR_PLANILHA_CABECALHOS: 'As colunas da planilha não conferem com o modelo. Baixe o modelo novamente.'
};

export function mensagemErroPlanilha(error, fallback = 'Não foi possível validar a planilha.') {
  const code = error?.code || '';
  if (MENSAGENS_PLANILHA[code]) return MENSAGENS_PLANILHA[code];
  // 404 sem código = rota indisponível no servidor; o texto cru não ajuda.
  if (error?.status === 404 && !code) return fallback;
  return normalizarTextoPlanilha(error?.message) || fallback;
}

// Linha de erro vinda da validação (lista `erros`): só a fórmula sem valor
// ganha a instrução de ação; o resto passa como veio.
export function normalizarTextoPlanilha(texto) {
  const value = String(texto || '').trim();
  if (!value) return '';
  if (/excel/i.test(value)) return value;
  if (/f[oó]rmula/i.test(value) && /(sem valor|valor calculado|nao calculad|não calculad|cache)/i.test(value)) {
    return `${value.replace(/\.$/, '')}. Abra o arquivo no Excel, salve e importe de novo.`;
  }
  return value;
}
