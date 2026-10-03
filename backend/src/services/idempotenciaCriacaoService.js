/**
 * Idempotencia de criacao — mecanica compartilhavel.
 *
 * Extraido do padrao ja usado na criacao de solicitacao (SolicitacaoController), que mantinha
 * a logica privada no proprio controller. Aqui ela vira um escopo reusavel para que cada novo
 * endpoint de criacao nao precise reimplementar (e divergir).
 *
 * Regras preservadas do original:
 * - Sem header `Idempotency-Key`, o fluxo segue normal (a chave e opcional).
 * - Chave fora do formato -> 400.
 * - Chave ja concluida -> devolve a MESMA resposta com `X-Idempotent-Replay: true` (200).
 * - Chave em andamento -> 409 (a primeira requisicao ainda esta gravando).
 * - O escopo inclui o usuario: a chave de um usuario nunca colide com a de outro.
 *
 * Estado em memoria do processo, como no original: protege o duplo envio/retry imediato, nao
 * substitui unicidade no banco. Em varias instancias (PM2 cluster) cada processo tem o seu.
 *
 * NOTA: o SolicitacaoController continua com a implementacao propria — ele esta auditado e e
 * o caminho de maior trafego do sistema; migra-lo para ca e mudanca propria, com auditoria
 * propria. Registrado como pendencia em LEIA-PRIMEIRO.md.
 */

const FORMATO_CHAVE = /^[A-Za-z0-9:_-]{8,160}$/;
const TTL_PADRAO_MS = 5 * 60 * 1000;

function criarEscopoIdempotencia({ ttlMs = TTL_PADRAO_MS, mensagemEmAndamento } = {}) {
  const pendentes = new Map();
  const concluidas = new Map();

  function limparExpiradas() {
    const agora = Date.now();
    for (const [chave, valor] of pendentes.entries()) {
      if (!valor || valor.expiresAt <= agora) pendentes.delete(chave);
    }
    for (const [chave, valor] of concluidas.entries()) {
      if (!valor || valor.expiresAt <= agora) concluidas.delete(chave);
    }
  }

  /**
   * Chame no inicio do handler. Se devolver `handled: true`, a resposta ja foi enviada e o
   * handler deve retornar imediatamente.
   */
  function preparar(req, res) {
    limparExpiradas();

    const chaveBruta = String(req.headers?.['idempotency-key'] || '').trim();
    if (!chaveBruta) return { handled: false, scopeKey: null };

    if (!FORMATO_CHAVE.test(chaveBruta)) {
      res.status(400).json({ error: 'Chave de idempotencia invalida.' });
      return { handled: true, scopeKey: null };
    }

    const scopeKey = `${req.user?.id || 'anon'}:${chaveBruta}`;

    const cache = concluidas.get(scopeKey);
    if (cache?.body) {
      res.set('X-Idempotent-Replay', 'true');
      res.status(200).json(cache.body);
      return { handled: true, scopeKey: null };
    }

    if (pendentes.has(scopeKey)) {
      res.status(409).json({
        error: mensagemEmAndamento || 'Esta criacao ja esta em andamento. Aguarde a conclusao antes de tentar novamente.'
      });
      return { handled: true, scopeKey: null };
    }

    pendentes.set(scopeKey, { expiresAt: Date.now() + ttlMs });
    // Libera a chave mesmo se o handler falhar ou a conexao cair: sem isso um erro deixaria
    // a chave presa em "andamento" ate o TTL, bloqueando a nova tentativa do usuario.
    res.on('finish', () => pendentes.delete(scopeKey));
    res.on('close', () => pendentes.delete(scopeKey));

    return { handled: false, scopeKey };
  }

  /** Chame APOS a gravacao bem-sucedida, com o corpo que foi respondido. */
  function armazenar(scopeKey, body) {
    if (!scopeKey || !body) return;
    pendentes.delete(scopeKey);
    concluidas.set(scopeKey, { expiresAt: Date.now() + ttlMs, body });
  }

  return { preparar, armazenar };
}

module.exports = { criarEscopoIdempotencia };
