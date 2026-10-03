/**
 * A MENSAGEM DE ERRO QUE PODE CHEGAR À TELA — uma só regra, um só arquivo.
 * ============================================================================
 *
 * O DEFEITO QUE ISSO FECHA (achado A2 do revisor separado, 06/09): em
 * `comercial-unidades` a pessoa via uma faixa vermelha com
 *
 *     <!DOCTYPE html> … <pre>Cannot GET /api/comercial/unidades-configuração</pre>
 *
 * — sete linhas de HTML de servidor, em 390px. A CAUSA do "Cannot GET" segue
 * NÃO DIAGNOSTICADA e não é inventada aqui: a rota existe
 * (`backend/src/routes.js`), o front a chama certo (`services/comercial.js`)
 * e a API, chamada com o prefixo `/api`, responde 401. O que é defeito
 * INDEPENDENTE da causa é o que este arquivo trata: seja qual for o erro,
 * o CORPO CRU DA RESPOSTA não pode virar texto de tela.
 *
 * DE QUANTOS JEITOS ISSO ERA FEITO AQUI, medido em 06/09: **26 funções**
 * diferentes de tratamento de resposta, com SEIS nomes para a mesma coisa
 * (`parseJson`, `parseResponse`, `handleJsonResponse`, `tratarResposta`,
 * `parse`, `parseJsonOrThrow`), espalhadas por 18 arquivos de serviço; e
 * **47 pontos** que montavam a mensagem a partir do corpo cru
 * (`throw new Error(text || fallback)`, `message = parsed?.error || text`) —
 * isto é, "se não deu para entender a resposta, mostre a resposta".
 * Vinte e seis jeitos de fazer a mesma coisa, e o mesmo furo em todos.
 * Acrescentar um vigésimo sétimo seria o erro que a regra do cliente
 * descreve; o conserto é UM lugar, e os outros passando por ele.
 *
 * A REGRA, na ordem em que ela decide:
 *
 *   1. Corpo JSON com campo de mensagem (`error`, `message`, `erro`,
 *      `mensagem`) → é a mensagem que o BACKEND escreveu para a pessoa ler.
 *      Vai para a tela, recortada no limite.
 *   2. Corpo com marcação (`<` ou `>`) → NUNCA vai para a tela. É página de
 *      erro de servidor, de proxy ou de gateway.
 *   3. Corpo de texto puro, curto e de uma linha → vai para a tela: é o que
 *      várias rotas antigas devolvem, e perdê-lo seria remover informação.
 *   4. Qualquer outro caso → a alternativa que o serviço declarou.
 *
 * QUANDO O CORPO NÃO SERVE, O STATUS VAI JUNTO. "Erro ao carregar unidades
 * comerciais (HTTP 404)" diz à pessoa que o problema é do servidor e dá ao
 * suporte a única informação técnica que sobrou. Sem isso, esconder o corpo
 * cru também esconderia que houve um 404 — trocar um defeito por outro.
 */

/* Uma frase de tela, não um documento. Acima disto não é mensagem: é
   despejo. O corte é do LADO DA MENSAGEM DO BACKEND (caminho 1), que é
   escrita para ler; o corpo de texto solto (caminho 3) é mais curto que
   isso por construção. */
const LIMITE_DA_MENSAGEM = 300;

function recortar(texto) {
  const limpo = String(texto).trim().replace(/\s+/g, ' ');
  return limpo.length > LIMITE_DA_MENSAGEM
    ? `${limpo.slice(0, LIMITE_DA_MENSAGEM - 1)}…`
    : limpo;
}

function comStatus(alternativa, status) {
  const base = String(alternativa || 'Nao foi possivel concluir a operacao.').trim();
  const codigo = Number(status || 0);
  return codigo > 0 ? `${base} (HTTP ${codigo})` : base;
}

/* O campo de mensagem, quando o corpo é JSON. `details` e `errors` entram
   porque parte das rotas devolve o motivo ali — é a mesma lista que a
   `solicitacoes.js` já usava, que é o serviço que fazia isto certo. */
function mensagemDoJson(dado) {
  if (!dado || typeof dado !== 'object') return '';
  const direto = dado.error || dado.message || dado.erro || dado.mensagem || dado.details;
  if (typeof direto === 'string' && direto.trim()) return direto;
  const lista = Array.isArray(dado.errors) ? dado.errors : (Array.isArray(dado.erros) ? dado.erros : null);
  if (lista) {
    const juntas = lista
      .map((item) => (typeof item === 'string' ? item : item?.message || item?.error || ''))
      .filter(Boolean)
      .join(' · ');
    if (juntas.trim()) return juntas;
  }
  return '';
}

/**
 * A mensagem que pode ser mostrada. `corpo` é o texto CRU da resposta (o
 * que `response.text()` devolveu), `alternativa` é a frase que o serviço já
 * declarava e `status` é o código HTTP.
 */
export function mensagemDeErro(corpo, alternativa, status = 0) {
  const cru = String(corpo ?? '').trim();
  if (!cru) return comStatus(alternativa, status);

  if (cru.startsWith('{') || cru.startsWith('[')) {
    try {
      const doJson = mensagemDoJson(JSON.parse(cru));
      if (doJson) return recortar(doJson);
      return comStatus(alternativa, status);
    } catch {
      /* JSON quebrado: cai nas regras de texto abaixo. */
    }
  }

  /* Marcação NUNCA vai para a tela — é o "Cannot GET" do achado A2, a
     página de erro do proxy, o HTML do gateway. */
  if (/[<>]/.test(cru)) return comStatus(alternativa, status);

  /* Texto puro, curto, de uma linha: a mensagem que rotas antigas
     devolvem em `text/plain`. Mais que isso é despejo. */
  if (cru.length <= LIMITE_DA_MENSAGEM && !cru.includes('\n')) return cru;

  return comStatus(alternativa, status);
}

/**
 * O caso completo, para quem já tem o corpo e a resposta: devolve o `Error`
 * pronto, com `status` — que várias telas leem para decidir entre "sem
 * permissão" e "erro de verdade".
 */
export function erroDaResposta(corpo, alternativa, response) {
  const status = Number(response?.status || 0) || 0;
  const erro = new Error(mensagemDeErro(corpo, alternativa, status));
  erro.status = status;
  return erro;
}

export default mensagemDeErro;
