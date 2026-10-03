/**
 * OS QUATRO ITENS DA LEVA DE PREFERÊNCIAS — P1, P2, P3 e P4.
 * ============================================================================
 *
 * POR QUE ESTE ARQUIVO EXISTE (06/09).
 *
 * A leva construiu quatro capacidades novas — escolher colunas, escolher
 * quais filtros aparecem, recolher bloco que sobrevive ao F5, e camada
 * flutuante que fecha ao clicar fora — e a matriz de 35 itens que já roda
 * prova, com rigor, que **o que existia antes não quebrou**. Nenhuma célula
 * dela olha para o que foi construído agora. Fechar a leva assim é fechar
 * com "eu acho que funciona": as quatro capacidades entrariam no preview do
 * cliente sem uma única medição do EFEITO delas.
 *
 * ----------------------------------------------------------------------------
 * A LIÇÃO QUE GOVERNA CADA LINHA DAQUI: MEDIR O EFEITO, NUNCA A PRESENÇA.
 *
 * O T2 passou VERDE em 189 telas medindo a opacidade de um ícone no hover,
 * enquanto o menu que aquele ícone abre estava recortado por um `overflow:
 * hidden` e ninguém no sistema conseguia alinhar coluna nenhuma. O item
 * media a affordance — a promessa — e nunca o que acontecia depois do
 * clique. Foi o cliente que achou, na tela, o que 189 células verdes
 * diziam estar certo.
 *
 * Por isso, aqui:
 *  - P1 não pergunta se o painel "Colunas" existe: esconde uma coluna e
 *    confere que ela sumiu do cabeçalho E das células, que sobreviveu à
 *    recarga, e que a escolha FOI PARA O BANCO;
 *  - P2 não pergunta se o seletor de filtros existe: aplica um filtro,
 *    conta as linhas, esconde o filtro e confere que a CONTAGEM MUDOU —
 *    porque só isso prova que o valor foi limpo e a consulta refeita;
 *  - P3 não pergunta se o bloco tem botão de recolher: recolhe, RECARREGA
 *    e confere que continua recolhido;
 *  - P4 não pergunta se a camada tem hook de fechamento: abre, MEDE SE ELA
 *    CABE INTEIRA NA JANELA, clica longe e confere que saiu; abre, aperta
 *    Esc, confere que saiu; e — a que ninguém lembra — abre e CLICA NUMA
 *    OPÇÃO, conferindo que a seleção aconteceu. Sem a da seleção, o caminho
 *    mais barato para fazer uma camada "fechar" é quebrar a seleção dela, e
 *    o check ficaria verde com a tela pior do que estava. Sem a da
 *    geometria (acrescentada em 06/09), o item aprovava um painel cortado
 *    pela borda da janela — foi o cliente quem achou isso numa captura,
 *    com o P4 verde na mesma tela.
 *
 * ----------------------------------------------------------------------------
 * O QUE ESTES CHECKS PODEM E NÃO PODEM FAZER NO AMBIENTE COMPARTILHADO.
 *
 * SOMENTE navegação e leitura: nenhum registro é criado, alterado ou
 * apagado. O que eles mexem é PREFERÊNCIA DE EXIBIÇÃO do usuário de QA — e
 * preferência agora mora no BANCO, indexada por usuário, o que muda o
 * tamanho do estrago de "esqueci de desfazer": uma coluna deixada escondida
 * não morre com o navegador descartável do harness, ela espera a próxima
 * corrida e estraga a medição dela (e a de qualquer pessoa que use o mesmo
 * usuário de QA). Por isso TODO check daqui restaura o padrão no fim, em
 * `finally`, e a falha da restauração REPROVA o item em vez de passar
 * calada: "Restaurar padrão" que não restaura é defeito da capacidade, não
 * detalhe de limpeza.
 *
 * ----------------------------------------------------------------------------
 * TRÊS ESTADOS, E A DIFERENÇA ENTRE ELES É A HONESTIDADE DA MATRIZ.
 *
 *  - N/A       — a tela não tem a capacidade POR NATUREZA (não há tabela,
 *                não há bloco recolhível, não há seletor de filtros). O
 *                motivo vai escrito na célula.
 *  - SEM DADO  — a capacidade existe e o harness a exercitaria, mas a base
 *                do preview não deu o registro necessário (tabela sem
 *                linha, nenhum filtro que corte a lista). NÃO É APROVAÇÃO,
 *                e não vira aprovação por equivalência com outra tela.
 *  - FALHOU    — a capacidade existe, foi exercitada, e o efeito não veio.
 *
 * A distinção entre as três é a única coisa que impede esta bateria de
 * virar decoração: um item que devolve N/A quando não sabe medir é um item
 * que nunca reprova.
 */

/* ==========================================================================
   ESPIÃO DE REDE — a prova de que a preferência foi para o BANCO
   ==========================================================================

   O ponto que separa esta leva de "mais um localStorage" não é visível no
   DOM: a coluna some da tabela do mesmo jeito nas duas implementações, e
   sobrevive à recarga nas duas. O que distingue é a REDE — a chamada
   `PUT /listas/:lista/preferencias/colunas` sair, e a leitura seguinte vir
   de `GET /me/preferencias`.

   Sem isto, P1 passaria verde numa tela que grava tudo no navegador — que é
   exatamente o defeito que a leva existe para acabar (a mesma consulta
   respondendo números diferentes conforme a MÁQUINA).

   O espião é passivo: escuta `request`/`response`, não intercepta nada.
   Interceptar (page.route) mudaria o que a tela recebe, e uma medição que
   altera o medido não mede.
*/
const ROTA_PREFERENCIA = /\/listas\/[^/]+\/preferencias\/([a-z]+)(\?|$)/;
const ROTA_CARGA_UNICA = /\/me\/preferencias(\?|$)/;

export function criarEspiaDePreferencias(page) {
  const eventos = [];

  page.on('request', (req) => {
    const url = req.url();
    const tipoPref = ROTA_PREFERENCIA.exec(url);
    const cargaUnica = ROTA_CARGA_UNICA.test(url);
    if (!tipoPref && !cargaUnica) return;
    let corpo = null;
    try { corpo = req.postData(); } catch { corpo = null; }
    eventos.push({
      metodo: req.method(),
      url,
      tipo: tipoPref ? tipoPref[1] : null,
      cargaUnica,
      corpo,
      quando: Date.now(),
      resposta: null
    });
  });

  page.on('response', (resp) => {
    const url = resp.url();
    if (!ROTA_CARGA_UNICA.test(url) || resp.request().method() !== 'GET') return;
    const evento = eventos.find((e) => e.cargaUnica && e.url === url && e.resposta === null);
    if (!evento) return;
    /*
      O corpo é lido de forma assíncrona e o resultado é DEPOSITADO no
      evento. Nada aqui é aguardado pelo check em linha reta: uma navegação
      no meio da leitura rejeita a promessa, e um `await` no caminho do
      check transformaria isso em erro da tela. Quem consulta espera pelo
      depósito com prazo próprio (`esperarCargaUnica`).
    */
    evento.resposta = 'lendo';
    resp.text()
      .then((texto) => { evento.resposta = String(texto || '').slice(0, 200000); })
      .catch(() => { evento.resposta = ''; });
  });

  return {
    /** Marca d'água: tudo que interessa a um check é o que veio DEPOIS dela. */
    marcar: () => eventos.length,
    desde: (marca) => eventos.slice(marca),
    /**
     * Espera até `ms` por uma gravação de preferência do tipo pedido.
     *
     * `aceitaReset` — O DELETE TAMBÉM É GRAVAÇÃO, E IGNORÁ-LO REPROVOU 4
     * TELAS CERTAS (06/09).
     *
     * Medido no preview (build 5fbcd89), nas quatro telas que sobraram do
     * P3: o bloco tem `recolhidoPadrao` (padrão = recolhido) e estava
     * ABERTO por um `{desvio:true}` gravado. Recolher devolve o bloco ao
     * PADRÃO — e o `BlocoConteudo` grava DESVIO, nunca estado, então voltar
     * ao padrão APAGA o registro: sai um `DELETE /listas/:lista/
     * preferencias/blocos`, não um PUT. É o contrato do componente, escrito
     * por extenso lá dentro, e é a coisa certa (bloco novo acompanha a
     * mudança do padrão no código em vez de ficar preso ao estado antigo).
     *
     * Este espião só contava PUT/POST. Resultado: quatro telas corretas
     * reprovando com "NENHUMA gravação saiu", e o defeito era do
     * instrumento. Pior: o check reabria o bloco no fim, o que REGRAVA o
     * desvio — então a corrida seguinte encontrava o mesmo estado e
     * reprovava de novo, para sempre.
     *
     * O DELETE não entra por padrão: quem mede o P1 usa o mesmo espião e
     * tem um braço próprio para "Restaurar padrão". Ampliar em silêncio
     * mudaria o significado daquele braço sem ninguém pedir.
     */
    async esperarGravacao(marca, tipo, ms = 4000, { aceitaReset = false } = {}) {
      const limite = Date.now() + ms;
      for (;;) {
        const achado = eventos.slice(marca).find((e) => e.tipo === tipo
          && (e.metodo === 'PUT' || e.metodo === 'POST'
            || (aceitaReset && e.metodo === 'DELETE')));
        if (achado) return achado;
        if (Date.now() > limite) return null;
        await page.waitForTimeout(200);
      }
    },
    /** Espera até `ms` pela carga única (GET /me/preferencias) COM corpo lido. */
    async esperarCargaUnica(marca, ms = 8000) {
      const limite = Date.now() + ms;
      for (;;) {
        const achado = eventos.slice(marca)
          .find((e) => e.cargaUnica && e.metodo === 'GET' && typeof e.resposta === 'string');
        if (achado) return achado;
        if (Date.now() > limite) {
          return eventos.slice(marca).find((e) => e.cargaUnica && e.metodo === 'GET') || null;
        }
        await page.waitForTimeout(200);
      }
    },
    /** Espera até `ms` por um DELETE (o "Restaurar padrão" do painel). */
    async esperarReset(marca, tipo, ms = 4000) {
      const limite = Date.now() + ms;
      for (;;) {
        const achado = eventos.slice(marca).find((e) => e.tipo === tipo && e.metodo === 'DELETE');
        if (achado) return achado;
        if (Date.now() > limite) return null;
        await page.waitForTimeout(200);
      }
    }
  };
}

/* ==========================================================================
   MEDIDAS DENTRO DA PÁGINA
   ==========================================================================
   Todas AUTOCONTIDAS: o Playwright serializa a função e a executa no
   navegador, onde nada do escopo deste módulo existe. É a mesma regra que
   `checks.mjs` já registra no topo — e a que mais custa quando se esquece,
   porque o erro chega como `ReferenceError` dentro do evaluate, longe da
   causa.
*/

/**
 * As colunas de CONTEÚDO no cabeçalho: as que o painel governa.
 *
 * A TABELA É A DO PAINEL, NÃO A PRIMEIRA DA PÁGINA (06/09) — e a diferença
 * reprovou uma tela que estava certa.
 *
 * Esta função lia `document.querySelector('.resizable-table')`, e o alvo do
 * clique é `.app-colunas-wrap > button` PRIMEIRO. Numa tela com uma tabela
 * só as duas escolhas coincidem; em `fiscal-dashboard` são QUATRO tabelas,
 * medidas no preview:
 *
 *   #0 "Documentos por status"   STATUS, DOCUMENTOS      2 colunas, SEM painel
 *   #1 "Documentos por origem"   ORIGEM, DOCUMENTOS      2 colunas, SEM painel
 *   #2 "Documentos recentes"     EMISSAO…STATUS          5 colunas, COM painel
 *   #3 "Logs recentes"           INICIO…MENSAGEM         5 colunas, COM painel
 *
 * O botão `.first()` é o da tabela #2 — as duas primeiras não oferecem
 * painel porque têm 2 colunas, e o componente está certo em não oferecer.
 * O check escondia "Status" da #2 (e ela sumia: 5 → 4 colunas, com
 * `PUT …/documentos-recentes/preferencias/colunas` saindo) e depois lia o
 * cabeçalho da #0, onde "STATUS" continuava porque nunca foi tocado. Saía
 * "2 colunas, as mesmas 2 de antes — o painel marca e não faz nada", sobre
 * um painel que fazia.
 *
 * O pareamento não é heurística: o botão e a tabela dele moram no MESMO
 * `.app-table-shell`. Subir do botão até o primeiro ancestral que contenha
 * uma `.resizable-table` devolve a tabela daquele painel, sempre.
 */
const lerColunas = () => {
  const botao = document.querySelector('.app-colunas-wrap > button');
  let tabela = null;
  for (let no = botao; no && no !== document.body; no = no.parentElement) {
    const achada = no.querySelector?.('.resizable-table');
    if (achada) { tabela = achada; break; }
  }
  /* Sem painel na tela não há o que parear: vale a primeira tabela, que é
     o que os ramos de "a tela não oferece o painel" precisam medir. */
  if (!tabela) tabela = document.querySelector('.resizable-table');
  if (!tabela) return null;
  const ths = Array.from(tabela.querySelectorAll('thead th'));
  /*
    O que conta como coluna de conteúdo, e por que não é "todo th".

    O cabeçalho tem quatro famílias e só uma delas o painel escolhe:
      - marcar (`celula-selecao`) e expandir (`celula-expandir`): controles,
        sem título e sem escolha;
      - AÇÕES: entra no cabeçalho pelo componente, NÃO está em
        `colunasDeclaradas`, e por isso não aparece no painel. Ela é a única
        que embrulha o título em `.app-th-alinhavel` SEM `.app-th-alinhar`
        (não há o que alinhar numa coluna de botões);
      - conteúdo: `.app-th-alinhar` presente.
    Contar "todo th" faria o limiar do painel (3 declaradas) ser medido com
    até três colunas que não são declaradas — e o item acusaria a tela por
    um painel que o componente esconde com razão.
  */
  const conteudo = ths
    .map((th, indice) => ({ th, indice }))
    .filter(({ th }) => th.querySelector('.app-th-alinhar'));
  /*
    A LINHA É ESCOLHIDA SEM EXIGIR QUE ELA CASE COM O CABEÇALHO — e a
    diferença apareceu na primeira corrida da prova.

    O jeito de sempre neste harness (T2) escolhe a linha cujo número de
    células é IGUAL ao de `th`, porque lá isso separa linha de dado de
    linha de detalhe. Aqui isso apagaria justamente o defeito que se quer
    ver: quando a coluna sai do cabeçalho e FICA nas células, nenhuma linha
    casa, `celulasNaLinha` vem nulo e o motivo sai "ficou com ?" — a
    medição some no exato caso em que ela importa.
  */
  const linha = Array.from(tabela.querySelectorAll('tbody tr'))
    .find((tr) => tr.children.length > 1
      && !tr.classList.contains('app-tabela-detalhe')
      && !tr.classList.contains('app-tabela-grupo'));
  return {
    titulos: conteudo.map(({ th }) => (th.innerText || '').trim().replace(/\s+/g, ' ')),
    /* A IDENTIDADE, quando a tabela a publica (`data-coluna` no `th`, desde
       06/09). Com ela a conferência é exata; sem ela (build antigo servido)
       cai-se no título, com a regra apertada de `mesmoTitulo`. */
    ids: conteudo.map(({ th }) => th.getAttribute('data-coluna')).filter(Boolean),
    totalTh: ths.length,
    celulasNaLinha: linha ? linha.children.length : null,
    /* O texto da linha inteira: se a coluna sumir do cabeçalho e a célula
       continuar, o texto dela continua aqui — e é isso que separa "sumiu"
       de "sumiu só o título". */
    textoDaLinha: linha ? (linha.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400) : null
  };
};

/**
 * A ASSINATURA DO RESULTADO — o que "a contagem mudou" quer dizer de fato.
 *
 * Contar `tbody tr` sozinho não serve para o sistema inteiro: metade das
 * listagens é paginada no servidor, e nelas um filtro pode cortar de 4000
 * para 300 registros sem mexer numa linha da PÁGINA à vista (as 25 de
 * sempre). Um check que olhasse só as linhas leria "nada mudou" e acusaria
 * a tela de não refazer a consulta — o defeito do verificador vestido de
 * defeito da tela, que este repositório já pagou caro três vezes.
 *
 * Então a assinatura soma três leituras independentes, e QUALQUER uma que
 * mude prova que a consulta foi refeita: as linhas à vista, o total
 * declarado (faixa da página ou paginação) e o texto da primeira linha.
 */
const lerAssinaturaDaLista = () => {
  const linhas = Array.from(document.querySelectorAll('.app-tabela tbody tr, .la-tabela tbody tr'))
    .filter((tr) => !tr.classList.contains('app-tabela-detalhe')
      && !tr.classList.contains('app-tabela-grupo')
      && tr.children.length > 1);
  const numeroDe = (texto) => {
    const m = String(texto || '').match(/([\d.]+)\s*(registros?|itens?|linhas?|t[ií]tulos?|resultados?)/i);
    return m ? m[1].replace(/\./g, '') : null;
  };
  const faixa = document.querySelector('.app-page-header');
  const paginacao = document.querySelector('.app-paginacao, .la-paginacao');
  return {
    linhas: linhas.length,
    total: numeroDe(faixa?.innerText) || numeroDe(paginacao?.innerText) || null,
    primeira: linhas[0] ? (linhas[0].innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160) : null
  };
};

/*
  COMPARAR TÍTULO DE COLUNA COM RÓTULO DO PAINEL — e por que não é `===`.

  O `th.innerText` traz o título MAIS o que o cabeçalho desenha ao lado
  dele: a seta de ordenação, o "✓" de alinhamento marcado, o ícone quando
  ele é texto e não SVG. O painel traz o título limpo. Comparar em cru
  fazia o alvo nunca ser encontrado e o item devolver SEM DADO em toda
  tabela — lacuna de evidência fabricada por um sinal de pontuação, que é a
  família de defeito que este harness mais paga.

  Então a comparação normaliza (só letras, números e espaço) e aceita
  conter em qualquer sentido: "CÓDIGO ↑" casa com "Código", e nem por isso
  "Obra" casa com "Parceiro".
*/
const normalizarTitulo = (t) => String(t || '')
  .toUpperCase()
  .replace(/[^\p{L}\p{N} ]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/*
  CONTER NÃO PODE SER CONTER QUALQUER COISA (06/09).

  A regra era `x === y || x.includes(y) || y.includes(x)`, e ela casava
  "PEDIDO MINIMO" com "PEDIDO". Em `pedidos-compra` isso fez o item
  reprovar a tela: a coluna "Pedido" foi escondida de verdade (8 títulos
  viraram 7, e o `PUT …/preferencias/colunas` saiu com "ocultas":
  ["pedido"]), mas "PEDIDO MINIMO" ainda estava no cabeçalho e satisfazia
  o `includes` — o motivo saiu "7 colunas, as mesmas 8 de antes", um número
  que não bate consigo mesmo e que era o próprio check se contradizendo.

  O conter continua existindo pelo motivo que o criou — o `th.innerText`
  traz o título MAIS a decoração do cabeçalho —, mas agora com a condição
  que faltava: o que sobra além do rótulo NÃO PODE SER PALAVRA. "CÓDIGO ↑"
  casa com "Código" (a seta some na normalização, e o resto é vazio);
  "Status (3)" casa com "Status" (sobra um número); "Pedido mínimo" NÃO
  casa com "Pedido", porque sobra "MINIMO", que é uma palavra — e palavra
  a mais é outra coluna.
*/
const mesmoTitulo = (tituloNoCabecalho, rotuloDoPainel) => {
  const x = normalizarTitulo(tituloNoCabecalho);
  const y = normalizarTitulo(rotuloDoPainel);
  if (!x || !y) return false;
  if (x === y) return true;
  if (!x.includes(y)) return false;
  return !/\p{L}/u.test(x.split(y).join(' '));
};

/**
 * A coluna do painel está no cabeçalho medido?
 *
 * PELO ID QUANDO ELE EXISTE, pelo título quando não. O id (`data-coluna`,
 * publicado pelo `th` e pelo item do painel desde 06/09) não tem
 * vocabulário nem homônimo: é a mesma chave que o componente usa para
 * governar a coluna. O título só entra quando o preview servir build
 * anterior a isso — e aí vale a regra apertada de `mesmoTitulo`, que já
 * não confunde "Pedido" com "Pedido mínimo".
 */
const estaNoCabecalho = (medida, alvo) => {
  if (alvo.id && medida.ids?.length) return medida.ids.includes(alvo.id);
  return medida.titulos.some((t) => mesmoTitulo(t, alvo.rotulo));
};

const mesmaAssinatura = (a, b) => Boolean(a) && Boolean(b)
  && a.linhas === b.linhas && a.total === b.total && a.primeira === b.primeira;

const descreverAssinatura = (a) => (a
  ? `${a.linhas} linha(s)${a.total ? `, total ${a.total}` : ''}${a.primeira ? `, 1ª "${a.primeira.slice(0, 40)}"` : ''}`
  : 'nada medido');

/* ==========================================================================
   P1 — ESCOLHER COLUNAS FUNCIONA E A ESCOLHA VIAJA
   ========================================================================== */

/**
 * P1: esconder uma coluna que NÃO é a de identidade tira a coluna do
 * cabeçalho E das células, a escolha sobrevive à recarga, e ela foi para o
 * BANCO — não para o navegador.
 *
 * O ÚLTIMO PASSO É O QUE DÁ SENTIDO AOS OUTROS. Esconder coluna e
 * sobreviver ao F5 é o que o localStorage já fazia antes desta leva: se o
 * item parasse aí, ele passaria verde numa tela que não migrou nada, e a
 * matriz declararia entregue justamente o que ficou por fazer.
 */
export async function checarColunasEscolhiveis(page, tela, resultado, ctx) {
  const { esperarCarregar, mirarAlvo, espia } = ctx;

  const antes = await page.evaluate(lerColunas);
  if (!antes) {
    resultado.P1 = { estado: 'N/A', motivo: 'tela sem tabela padrão (.resizable-table) — não há coluna a escolher' };
    return;
  }

  const botao = page.locator('.app-colunas-wrap > button').first();
  const temPainel = await botao.count();
  if (!temPainel) {
    /*
      AUSÊNCIA DO PAINEL NÃO É AUTOMATICAMENTE "NÃO SE APLICA".

      O componente esconde o painel por três razões legítimas: a tela
      recusou (`colunasConfiguraveis={false}`), a tabela não tem chave onde
      salvar, ou não há o que escolher (menos de 3 colunas declaradas /
      menos de 2 ocultáveis). Nas duas primeiras a decisão é da tela e se
      registra no manifesto (`naoAplica`), que sempre vence este check.

      A terceira dá para MEDIR — e ATÉ 06/09 ELA NÃO ERA MEDIDA, ERA
      DEDUZIDA. A versão anterior deste comentário dizia "como a única
      travada hoje é a de identidade, há pelo menos 2 ocultáveis". Isso
      era falso: 24 telas declaram `sempreVisivel`. Na Setores, `codigo` e
      `capacidades` são travadas porque são os campos do formulário de
      edição na linha — sem elas o registro não tem como ser editado. Com
      a identidade, são três travadas de quatro colunas: sobra UMA
      ocultável, o componente corretamente não oferece o painel, e este
      check reprovava a tela por um defeito que não existia. Era o
      verificador afirmando o que não tinha como medir.

      Agora a tabela DIZ o número (`data-colunas-ocultaveis` e
      `data-colunas-declaradas`, em `TabelaPadrao`), e aqui se LÊ. Sem
      esses atributos (build antigo servido no preview) o check não
      inventa: reprova pedindo o build novo, porque um N/A silencioso aqui
      é exatamente o buraco que este item existe para fechar.

      O que NÃO muda: ausência de painel com 2+ ocultáveis continua
      FALHOU. Devolver N/A nesse caso seria a cegueira do T2 ao contrário
      — em vez de aprovar por presença de ícone, absolver por ausência de
      painel —, e uma regressão que apagasse o painel de todas as tabelas
      sairia como 189 células cinzas sem ninguém ver.
    */
    const medida = await page.evaluate(() => {
      const casca = document.querySelector('.app-table-shell[data-colunas-declaradas]');
      if (!casca) return null;
      return {
        declaradas: Number(casca.getAttribute('data-colunas-declaradas')),
        ocultaveis: Number(casca.getAttribute('data-colunas-ocultaveis'))
      };
    });

    if (medida && medida.ocultaveis < 2) {
      resultado.P1 = {
        estado: 'N/A',
        motivo: `a tabela declara ${medida.declaradas} coluna(s) e só ${medida.ocultaveis} é ocultável — as demais são de identidade ou \`sempreVisivel\` (campo do formulário de edição na linha, por exemplo). Abaixo do mínimo de 2, não há escolha a oferecer, e a ausência do painel é a decisão certa do componente`
      };
      return;
    }

    if (!medida && antes.titulos.length >= 3) {
      resultado.P1 = {
        estado: 'FALHOU',
        motivo: `a tabela mostra ${antes.titulos.length} colunas de conteúdo e não oferece o painel "Colunas", e a casca NÃO publica \`data-colunas-ocultaveis\` — o preview está servindo build anterior a 06/09. Sem esse número não dá para distinguir recusa legítima (colunas travadas) de painel que sumiu, e adivinhar é o defeito que este item existe para não repetir: republique e rode de novo`
      };
      return;
    }

    if (antes.titulos.length >= 3) {
      resultado.P1 = {
        estado: 'FALHOU',
        motivo: `a tabela mostra ${antes.titulos.length} colunas de conteúdo (${antes.titulos.slice(0, 4).join(', ')}…) e NÃO oferece o painel "Colunas", com ${medida.ocultaveis} coluna(s) ocultáve(is) declarada(s) pela própria tabela — havendo 2 ou mais, o painel tinha de estar lá. Se esta tela recusa a escolha de propósito, a recusa se declara no manifesto (naoAplica.P1) ou travando as colunas com \`sempreVisivel\`, não se deduz do silêncio`
      };
      return;
    }
    resultado.P1 = {
      estado: 'N/A',
      motivo: `tabela com ${antes.titulos.length} coluna(s) de conteúdo — abaixo do limiar de 3 do painel de colunas; não há escolha a oferecer`
    };
    return;
  }

  if (antes.celulasNaLinha === null) {
    /*
      Sem linha no tbody não dá para provar que a coluna sumiu das CÉLULAS,
      e essa é metade do item: uma tabela que tira o `th` e deixa os `td`
      desalinha a linha inteira. Base vazia é SEM DADO — a mesma distinção
      que a T2, a T3 e a T5 já fazem neste harness.
    */
    resultado.P1 = {
      estado: 'SEM DADO',
      motivo: 'a tela TEM painel de colunas, mas a base do preview não devolveu linha — o efeito do esconder nas CÉLULAS não pôde ser medido'
    };
    return;
  }

  /* Estado a devolver ao ambiente, aconteça o que acontecer daqui em diante. */
  let mexeu = false;
  const restaurar = async () => {
    if (!mexeu) return { ok: true, motivo: null };
    for (let tentativa = 0; tentativa < 2; tentativa += 1) {
      await page.keyboard.press('Escape').catch(() => {});
      const aberto = await page.locator('.app-colunas-menu').count();
      if (!aberto) await botao.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(350);
      const marca = espia.marcar();
      const reset = page.locator('.app-colunas-menu .app-mais-item', { hasText: /restaurar padrão/i }).first();
      if (await reset.count()) {
        await reset.click({ timeout: 5000 }).catch(() => {});
        await espia.esperarReset(marca, 'colunas', 3000);
      }
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(500);
      const agora = await page.evaluate(lerColunas);
      if (agora && agora.titulos.length >= antes.titulos.length) return { ok: true, motivo: null };
    }
    const agora = await page.evaluate(lerColunas);
    return {
      ok: false,
      motivo: `"Restaurar padrão" NÃO devolveu a coluna: o cabeçalho tinha ${antes.titulos.length} colunas e ficou com ${agora?.titulos.length ?? '?'} — a preferência do usuário de QA fica suja para a próxima corrida`
    };
  };

  try {
    /* ---- passo 1: o painel abre e está ALCANÇÁVEL ---------------------- */
    await botao.click({ timeout: 10000 });
    await page.waitForTimeout(400);
    const menu = page.locator('.app-colunas-menu').first();
    if (!(await menu.count())) {
      resultado.P1 = {
        estado: 'FALHOU',
        motivo: 'passo 1 (abrir o painel): o botão "Colunas" recebeu o clique e NENHUM painel (.app-colunas-menu) entrou no DOM'
      };
      return;
    }
    const mira = await mirarAlvo(page, menu, {
      seletorAlvo: '.app-colunas-menu',
      textos: {
        semCaixa: 'passo 1 (abrir o painel): o painel de colunas não tem caixa visível',
        coberto: (quem) => `passo 1 (abrir o painel): o painel de colunas ABRIU e o ponto central dele entrega "${quem}" — está RECORTADO ou COBERTO, e ninguém consegue marcar nada nele`,
        foraDaJanela: 'passo 1 (abrir o painel): o painel de colunas não coube na janela em quatro tentativas — a escolha NÃO FOI EXERCITADA',
        cobertoTeimoso: (quem) => `passo 1 (abrir o painel): o painel de colunas seguiu coberto pela moldura do sistema ("${quem}") — a escolha NÃO FOI EXERCITADA`
      }
    });
    if (!mira.ponto) {
      resultado.P1 = { estado: mira.estado, motivo: mira.motivo };
      return;
    }

    /* ---- passo 2: escolher uma coluna que NÃO seja a de identidade ----- */
    /*
      A caixa HABILITADA é o critério, e ele não é atalho: o componente
      desabilita exatamente a coluna de identidade (`colunaTravada`) e a
      última visível. Procurar pelo RÓTULO ("Código", "Nome") seria casar
      com o vocabulário de uma tela e falhar em 188 — o erro que este
      repositório já registrou como "check que procura pelo RÓTULO cobre
      vocabulário, não comportamento".
    */
    const itens = menu.locator('.app-colunas-item');
    const totalItens = await itens.count();
    let alvo = null;
    for (let i = 0; i < totalItens; i += 1) {
      const caixa = itens.nth(i).locator('input[type="checkbox"]');
      if (!(await caixa.count())) continue;
      if (await caixa.isDisabled()) continue;
      if (!(await caixa.isChecked())) continue; // já escondida: nada a esconder
      const rotulo = (await itens.nth(i).locator('.app-colunas-rotulo span').last().innerText())
        .trim().replace(/\s+/g, ' ');
      const id = await itens.nth(i).getAttribute('data-coluna');
      if (!estaNoCabecalho(antes, { id, rotulo })) continue;
      alvo = { indice: i, id, rotulo, caixa };
      break;
    }
    if (!alvo) {
      resultado.P1 = {
        estado: 'SEM DADO',
        motivo: `passo 2 (escolher a coluna): o painel abriu com ${totalItens} item(ns) e nenhum é uma coluna VISÍVEL, destravada e presente no cabeçalho — não houve o que esconder`
      };
      return;
    }

    /* ---- passo 3: esconder, e conferir cabeçalho E células ------------- */
    const marcaGravacao = espia.marcar();
    await alvo.caixa.click({ timeout: 10000 });
    mexeu = true;
    await page.waitForTimeout(700);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);

    const depois = await page.evaluate(lerColunas);
    const sumiuDoCabecalho = depois && !estaNoCabecalho(depois, alvo);
    const celulasCairam = depois && depois.celulasNaLinha !== null
      && depois.celulasNaLinha === antes.celulasNaLinha - 1;
    if (!sumiuDoCabecalho) {
      resultado.P1 = {
        estado: 'FALHOU',
        motivo: `passo 3 (esconder): desmarquei "${alvo.rotulo}" no painel e a coluna CONTINUA no cabeçalho (${depois?.titulos.length ?? '?'} colunas, as mesmas ${antes.titulos.length} de antes) — o painel marca e não faz nada`
      };
      return;
    }
    if (!celulasCairam) {
      resultado.P1 = {
        estado: 'FALHOU',
        motivo: `passo 3 (esconder): "${alvo.rotulo}" sumiu do CABEÇALHO e as CÉLULAS não acompanharam — a linha tinha ${antes.celulasNaLinha} células e ficou com ${depois?.celulasNaLinha ?? '?'} (esperado ${antes.celulasNaLinha - 1}). Cabeçalho e corpo desalinhados é pior que a coluna visível`
      };
      return;
    }

    /* ---- passo 4: a escolha FOI PARA O BANCO --------------------------- */
    /*
      É este passo que separa a leva de um localStorage a mais. Ele aceita
      DUAS provas, porque as duas provam a mesma coisa por caminhos
      diferentes: a gravação saindo (`PUT .../preferencias/colunas`) e a
      leitura seguinte trazendo a escolha de volta do servidor
      (`GET /me/preferencias`, conferido no passo 5). Exigir só a primeira
      quebraria numa tela que agrupe gravações; exigir só a segunda deixaria
      passar uma tela que lê do banco e grava no navegador.
    */
    const gravacao = await espia.esperarGravacao(marcaGravacao, 'colunas', 5000);
    let visiveisNoCorpo = null;
    if (gravacao?.corpo) {
      try {
        const corpo = JSON.parse(gravacao.corpo);
        const pref = corpo?.preferencias || corpo;
        if (Array.isArray(pref?.visiveis)) visiveisNoCorpo = pref.visiveis.length;
      } catch { visiveisNoCorpo = null; }
    }

    /* ---- passo 5: sobrevive à recarga, e a leitura vem do servidor ----- */
    const marcaCarga = espia.marcar();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await esperarCarregar(page);
    const voltou = await page.locator('.resizable-table thead th').first()
      .waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(500);
    if (!voltou) {
      resultado.P1 = {
        estado: 'SEM DADO',
        motivo: `passo 5 (persistência): depois de recarregar, a tabela não voltou a aparecer em 20s — a persistência de "${alvo.rotulo}" NÃO FOI PROVADA`
      };
      return;
    }
    const recarregado = await page.evaluate(lerColunas);
    const continuaEscondida = recarregado && !estaNoCabecalho(recarregado, alvo);
    if (!continuaEscondida) {
      resultado.P1 = {
        estado: 'FALHOU',
        motivo: `passo 5 (persistência): "${alvo.rotulo}" foi escondida e VOLTOU na recarga — a escolha do usuário não foi guardada em lugar nenhum`
      };
      return;
    }

    const carga = await espia.esperarCargaUnica(marcaCarga, 10000);
    /*
      O corpo da carga única é lido como TEXTO e conferido pela forma, não
      pelo id da coluna: o id não existe no DOM (o `columnKey` não vira
      atributo do `th`), então casar rótulo com id seria adivinhação. O que
      se confere é o que dá para afirmar: veio do servidor um registro de
      colunas com lista de OCULTAS não vazia.
    */
    let bancoTrouxe = false;
    if (typeof carga?.resposta === 'string' && carga.resposta) {
      bancoTrouxe = /"ocultas"\s*:\s*\[\s*"/.test(carga.resposta);
    }

    if (!gravacao && !bancoTrouxe) {
      resultado.P1 = {
        estado: 'FALHOU',
        motivo: `passo 4/5 (a escolha viaja): "${alvo.rotulo}" sumiu e continuou sumida na recarga, mas a preferência NÃO FOI PARA O BANCO — nenhuma chamada PUT /listas/:lista/preferencias/colunas saiu ao esconder${carga ? ', e a carga única GET /me/preferencias não trouxe nenhuma coluna oculta' : ', e nenhuma carga única GET /me/preferencias foi observada na recarga'}. Escolha que fica só no navegador é o defeito que esta leva existe para acabar: a mesma pessoa vê listas diferentes conforme a máquina`
      };
      return;
    }

    const provaDeBanco = [
      gravacao ? `PUT ${new URL(gravacao.url).pathname}${visiveisNoCorpo !== null ? ` com ${visiveisNoCorpo} coluna(s) em "visiveis"` : ''}` : null,
      bancoTrouxe ? 'GET /me/preferencias devolveu colunas ocultas na recarga' : null
    ].filter(Boolean).join(' + ');

    resultado.P1 = {
      estado: 'PASSOU',
      motivo: `escondi "${alvo.rotulo}": sumiu do cabeçalho (${antes.titulos.length}→${depois.titulos.length} colunas) e das células (${antes.celulasNaLinha}→${depois.celulasNaLinha}), continuou escondida depois da recarga, e a escolha foi para o banco (${provaDeBanco})`
    };
  } finally {
    const volta = await restaurar();
    if (!volta.ok) {
      const anterior = resultado.P1?.motivo ? `${resultado.P1.motivo}; ` : '';
      resultado.P1 = { estado: 'FALHOU', motivo: `${anterior}${volta.motivo}` };
    }
  }
}

/* ==========================================================================
   P2 — ESCONDER FILTRO LIMPA O VALOR E REFAZ A CONSULTA (achado N53)
   ========================================================================== */

/**
 * P2: nas telas que têm o seletor "Filtros visíveis", esconder um filtro
 * PREENCHIDO limpa o valor e refaz a consulta.
 *
 * O achado N53, por extenso: um filtro escondido que continua recortando a
 * lista é um critério fora da tela. A pessoa lê "12 registros", não vê
 * filtro nenhum em campo, e conclui que são todos os registros — e leva
 * esse número para uma decisão. O defeito não tem sintoma visual: a tela
 * fica exatamente igual à tela certa.
 *
 * Por isso o item mede o RESULTADO DA CONSULTA, e não o campo: só a
 * contagem mudando prova que o valor foi limpo e a consulta refeita.
 */
export async function checarEsconderFiltro(page, tela, resultado, ctx) {
  const { espia } = ctx;

  const botao = page.locator('button[title="Escolher quais filtros aparecem nesta tela"]').first();
  if (!(await botao.count())) {
    /*
      N/A DECLARADO, não falha — e é o próprio pedido do item. Hoje três
      telas do sistema oferecem o seletor (Consulta de títulos,
      Solicitações e Provisionamentos, em cinco endereços); as outras 88
      telas com filtro ainda não o receberam. Reprovar as 88 seria a matriz
      acusando as telas de uma etapa que o plano ainda não executou.
    */
    const temFiltro = await page.locator('.app-filtros, .la-filtros-linha').count();
    resultado.P2 = {
      estado: 'N/A',
      motivo: temFiltro
        ? 'tela com faixa de filtros e SEM o seletor "Filtros visíveis" — a capacidade não foi ligada aqui (item 2 do plano de preferências)'
        : 'tela sem faixa de filtros — não há filtro a esconder'
    };
    return;
  }

  /* O que o painel oferece esconder, com o rótulo que a faixa também usa. */
  await botao.click({ timeout: 10000 });
  await page.waitForTimeout(400);
  const menu = page.locator('.app-mais-menu.app-colunas-menu').first();
  if (!(await menu.count())) {
    resultado.P2 = {
      estado: 'FALHOU',
      motivo: 'passo 1 (abrir o seletor): o botão "Filtros visíveis" recebeu o clique e nenhum painel entrou no DOM'
    };
    return;
  }
  const itens = menu.locator('.app-colunas-item');
  const totalItens = await itens.count();
  const candidatos = [];
  for (let i = 0; i < totalItens; i += 1) {
    const caixa = itens.nth(i).locator('input[type="checkbox"]');
    if (!(await caixa.count())) continue;
    if (await caixa.isDisabled()) continue;
    if (!(await caixa.isChecked())) continue;
    const rotulo = (await itens.nth(i).locator('.app-colunas-rotulo span').last().innerText())
      .trim().replace(/\s+/g, ' ')
      // O painel acrescenta o aviso "— preenchido: esconder limpa e refaz a
      // consulta" ao rótulo; o nome do filtro é o que vem antes dele.
      .replace(/\s*—\s*preenchido.*$/i, '');
    candidatos.push({ rotulo });
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(250);

  if (!candidatos.length) {
    resultado.P2 = {
      estado: 'SEM DADO',
      motivo: `o seletor abriu com ${totalItens} item(ns) e nenhum filtro visível e destravado para esconder — a capacidade NÃO FOI EXERCITADA`
    };
    return;
  }

  /*
    ACHAR O CAMPO PELO RÓTULO — e por que aqui isso é legítimo.

    O repositório tem uma regra dura contra casar por rótulo, e ela vale
    para julgar comportamento ("procurar 'Excluir' no botão cobre
    vocabulário, não comportamento"). Aqui o rótulo não julga nada: ele é a
    ÚNICA amarra entre o item do painel e o campo na faixa, porque as três
    telas com seletor desenham a faixa de três jeitos (a de Títulos tem
    grade própria, não `.app-filtros-campo`) e o id do filtro não sai no
    DOM. O julgamento continua sendo o efeito na consulta.
  */
  const acharCampo = (rotulo) => {
    /*
      LIMPA A MARCA ANTERIOR ANTES DE MARCAR — defeito meu, pego na primeira
      corrida da prova. A marca `data-qa-campo-filtro` é como o check volta
      ao mesmo campo para escrever nele; sem limpar, o segundo candidato
      marcava o SEU campo e o `querySelector` continuava entregando o
      PRIMEIRO. O check escreveria num campo e mediria outro.
    */
    document.querySelectorAll('[data-qa-campo-filtro]')
      .forEach((el) => el.removeAttribute('data-qa-campo-filtro'));
    const alvo = String(rotulo).toLowerCase().replace(/\s+/g, ' ').trim();
    const controles = Array.from(document.querySelectorAll(
      '.app-filtros input, .app-filtros select, .app-filter-field input, .app-filter-field select,'
      + ' form input, form select'
    ));
    const rotuloDe = (el) => {
      const label = el.closest('label');
      if (label) return (label.innerText || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (el.id) {
        const associado = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (associado) return (associado.innerText || '').toLowerCase().replace(/\s+/g, ' ').trim();
      }
      const embrulho = el.closest('.app-filter-field, .app-filtros-campo, .form-group, .campo');
      if (embrulho) return (embrulho.innerText || '').toLowerCase().replace(/\s+/g, ' ').trim();
      return '';
    };
    const achado = controles.find((el) => {
      if (el.type === 'hidden' || el.disabled) return false;
      const caixa = el.getBoundingClientRect();
      if (caixa.width <= 0 || caixa.height <= 0) return false;
      return rotuloDe(el).startsWith(alvo);
    });
    if (!achado) return null;
    achado.setAttribute('data-qa-campo-filtro', '1');
    return {
      tag: achado.tagName.toLowerCase(),
      tipo: achado.getAttribute('type') || '',
      valor: achado.value || '',
      opcoes: achado.tagName.toLowerCase() === 'select'
        ? Array.from(achado.options).map((o) => o.value)
        : []
    };
  };

  const limparMarca = () => page.evaluate(() => {
    document.querySelectorAll('[data-qa-campo-filtro]')
      .forEach((el) => el.removeAttribute('data-qa-campo-filtro'));
  }).catch(() => {});

  const consultarSePreciso = async () => {
    const consultar = page.getByRole('button', { name: /^consultar$/i }).first();
    if (await consultar.count()) {
      await consultar.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(2500);
    } else {
      await page.waitForTimeout(1500);
    }
  };

  let escondido = null; // { rotulo } — para a restauração
  let campoTocado = null;
  const restaurar = async () => {
    /* Devolve o valor digitado e a escolha de visibilidade ao padrão. */
    if (campoTocado) {
      await page.evaluate(() => {
        const el = document.querySelector('[data-qa-campo-filtro]');
        if (!el) return;
        const proto = el.tagName === 'SELECT'
          ? window.HTMLSelectElement.prototype
          : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(el, '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }).catch(() => {});
      await limparMarca();
    }
    if (!escondido) return { ok: true, motivo: null };
    await page.keyboard.press('Escape').catch(() => {});
    if (!(await page.locator('.app-mais-menu.app-colunas-menu').count())) {
      await botao.click({ timeout: 5000 }).catch(() => {});
    }
    await page.waitForTimeout(350);
    const marca = espia.marcar();
    const reset = page.locator('.app-mais-menu.app-colunas-menu .app-mais-item', { hasText: /restaurar padrão/i }).first();
    if (await reset.count()) {
      await reset.click({ timeout: 5000 }).catch(() => {});
      await espia.esperarReset(marca, 'filtros', 3000);
    }
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(600);
    const voltou = await page.evaluate(acharCampo, escondido.rotulo);
    await limparMarca();
    return voltou
      ? { ok: true, motivo: null }
      : { ok: false, motivo: `"Restaurar padrão" NÃO devolveu o filtro "${escondido.rotulo}" à faixa — a preferência do usuário de QA fica suja para a próxima corrida` };
  };

  try {
    await consultarSePreciso();
    const assinaturaBase = await page.evaluate(lerAssinaturaDaLista);

    /* ---- passo 2: aplicar um filtro que MUDE o resultado --------------- */
    let aplicado = null;
    const tentados = [];
    for (const candidato of candidatos.slice(0, 5)) {
      const campo = await page.evaluate(acharCampo, candidato.rotulo);
      if (!campo) { tentados.push(`${candidato.rotulo} (campo não encontrado na faixa)`); continue; }
      campoTocado = candidato.rotulo;
      /*
        O VALOR ESCOLHIDO NÃO PRECISA CASAR COM NADA — precisa MUDAR o
        recorte. Um texto que não existe leva a lista a zero, e zero é uma
        mudança tão boa quanto qualquer outra para provar que a consulta
        foi refeita. Escolher um valor "realista" exigiria conhecer a base
        do preview, que muda toda semana.
      */
      const valor = campo.tag === 'select'
        ? (campo.opcoes.find((o) => o && o !== campo.valor) || '')
        : (campo.tipo === 'number' ? '999999999'
          : campo.tipo === 'date' ? '2099-12-31'
            : 'zzqxjw');
      if (!valor) { tentados.push(`${candidato.rotulo} (sem valor alternativo a aplicar)`); continue; }
      await page.evaluate((v) => {
        const el = document.querySelector('[data-qa-campo-filtro]');
        if (!el) return;
        const proto = el.tagName === 'SELECT'
          ? window.HTMLSelectElement.prototype
          : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, valor);
      await consultarSePreciso();
      const comFiltro = await page.evaluate(lerAssinaturaDaLista);
      if (!mesmaAssinatura(assinaturaBase, comFiltro)) {
        aplicado = { rotulo: candidato.rotulo, valor, comFiltro };
        break;
      }
      tentados.push(`${candidato.rotulo}="${valor}" (o resultado não mudou: ${descreverAssinatura(comFiltro)})`);
      /* Desfaz antes de tentar o próximo: dois filtros somados mediriam
         outra coisa. */
      await page.evaluate(() => {
        const el = document.querySelector('[data-qa-campo-filtro]');
        if (!el) return;
        const proto = el.tagName === 'SELECT'
          ? window.HTMLSelectElement.prototype
          : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(el, '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }).catch(() => {});
      await limparMarca();
      campoTocado = null;
      await consultarSePreciso();
    }

    if (!aplicado) {
      resultado.P2 = {
        estado: 'SEM DADO',
        motivo: `a tela TEM o seletor de filtros, e nenhum dos ${Math.min(candidatos.length, 5)} filtros escondíveis mudou o resultado da consulta na base do preview — ${tentados.slice(0, 3).join('; ')}. Sem um recorte que corte, esconder não teria o que limpar: a capacidade NÃO FOI PROVADA`
      };
      return;
    }

    /* ---- passo 3: esconder o filtro PREENCHIDO ------------------------- */
    await botao.click({ timeout: 10000 });
    await page.waitForTimeout(400);
    const item = page.locator('.app-mais-menu.app-colunas-menu .app-colunas-item')
      .filter({ hasText: aplicado.rotulo }).first();
    if (!(await item.count())) {
      resultado.P2 = {
        estado: 'FALHOU',
        motivo: `passo 3 (esconder): o filtro "${aplicado.rotulo}" está PREENCHIDO e sumiu da lista do seletor — quem preencheu perdeu o caminho de escondê-lo`
      };
      return;
    }
    const caixa = item.locator('input[type="checkbox"]').first();
    if (await caixa.isDisabled()) {
      resultado.P2 = {
        estado: 'FALHOU',
        motivo: `passo 3 (esconder): a caixa de "${aplicado.rotulo}" está desabilitada no seletor por estar preenchida — bloquear é a saída que o N53 recusou: o aviso nomeia a consequência, o clique cumpre`
      };
      return;
    }
    await caixa.click({ timeout: 10000 });
    escondido = { rotulo: aplicado.rotulo };
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(1800);

    /* ---- passo 4: o valor foi limpo e a consulta refeita --------------- */
    const depois = await page.evaluate(lerAssinaturaDaLista);
    const campoAinda = await page.evaluate(acharCampo, aplicado.rotulo);
    const valorResidual = campoAinda?.valor || '';
    await limparMarca();

    const problemas = [];
    if (mesmaAssinatura(aplicado.comFiltro, depois)) {
      problemas.push(
        `a consulta NÃO foi refeita: com o filtro aplicado a lista era ${descreverAssinatura(aplicado.comFiltro)} `
        + `e depois de esconder continua ${descreverAssinatura(depois)} — o filtro invisível segue recortando a lista, `
        + 'e quem lê o número não tem como saber (é o achado N53 inteiro)'
      );
    }
    if (valorResidual) {
      problemas.push(`o campo "${aplicado.rotulo}" saiu da faixa mas CONTINUA no DOM com o valor "${valorResidual}" — recortando escondido`);
    }
    if (problemas.length) {
      resultado.P2 = { estado: 'FALHOU', motivo: `passo 4 (esconder limpa e refaz): ${problemas.join('; ')}` };
      return;
    }

    resultado.P2 = {
      estado: 'PASSOU',
      motivo: `apliquei "${aplicado.rotulo}"=${JSON.stringify(aplicado.valor)} e a lista foi de ${descreverAssinatura(assinaturaBase)} para ${descreverAssinatura(aplicado.comFiltro)}; ao esconder o filtro no seletor, o valor foi limpo (nenhum campo residual) e a consulta foi refeita: ${descreverAssinatura(depois)}`
    };
  } finally {
    const volta = await restaurar();
    if (!volta.ok) {
      const anterior = resultado.P2?.motivo ? `${resultado.P2.motivo}; ` : '';
      resultado.P2 = { estado: 'FALHOU', motivo: `${anterior}${volta.motivo}` };
    }
  }
}

/* ==========================================================================
   P3 — RECOLHER BLOCO SOBREVIVE À RECARGA
   ========================================================================== */

/**
 * P3: recolher um bloco recolhível e recarregar — ele continua recolhido.
 *
 * O DEFEITO QUE ESTE ITEM FECHA atinge 40 arquivos: o recolhimento do
 * `BlocoConteudo` era `useState` puro e nenhuma linha o gravava. A pessoa
 * recolhia, dava F5 e voltava tudo aberto. A única tela onde recolher
 * sobrevivia era o detalhe da solicitação — e sobrevivia porque ela NÃO usa
 * o recolhimento do componente.
 *
 * O PORTÃO É COMPORTAMENTAL, NÃO ESTRUTURAL, e isto é o miolo do item.
 * Saber se uma tela ligou a persistência não se lê no DOM: o bloco
 * recolhível é idêntico com e sem `chavePreferencia`. Dá para ler no
 * ARQUIVO, e é o que o item faz — mas a declaração no arquivo sozinha
 * também não bastaria (uma chave passada e uma gravação quebrada leriam
 * como "ligado e funcionando" até a hora do F5).
 *
 * Então as duas coisas se cruzam, e cada cruzamento tem um veredito
 * próprio:
 *   - recolher GRAVOU (saiu PUT do tipo `blocos`) → a persistência está
 *     ligada nesta tela: a recarga TEM de trazer o bloco recolhido, e
 *     não trazer é FALHOU;
 *   - recolher não gravou nada e o arquivo NÃO declara `chavePreferencia`
 *     → a tela não ligou a capacidade: N/A com o motivo escrito;
 *   - recolher não gravou nada e o arquivo DECLARA `chavePreferencia`
 *     → FALHOU: a tela diz que ligou e o recolhimento não grava.
 *
 * O terceiro caso é o que impede o item de virar decoração. Sem ele, a
 * ausência de gravação — que é o defeito — sairia como cinza.
 */
export async function checarRecolhimentoPersiste(page, tela, resultado, ctx) {
  const { esperarCarregar, espia, declaraChaveDeBloco } = ctx;

  /*
    OS BLOCOS SÃO ESCOLHIDOS PELO TÍTULO, NÃO POR UM LOCALIZADOR QUE
    DEPENDE DO ESTADO — e este defeito era meu, pego pela prova de mordida
    na primeira corrida.

    A primeira versão guardava `page.locator('.app-bloco-recolher[aria-expanded="true"]').nth(i)`
    e conferia o `aria-expanded` DESSE localizador depois do clique. Só que
    o localizador do Playwright é reavaliado a cada uso: no instante em que
    o bloco recolhe, ele deixa de casar com o seletor, e o `.nth(0)` passa
    a apontar para o PRÓXIMO bloco ainda aberto. O check lia "true" de
    outro elemento e acusava a tela de não recolher um bloco que tinha
    recolhido — dois dos três defeitos plantados saíram com o motivo
    errado, e um deles seria um FALHOU falso em toda tela com dois blocos.

    Título é a identidade estável: sobrevive ao clique, ao re-render e à
    recarga, que é justamente o que este item atravessa.
  */
  /*
    OS DOIS SENTIDOS, E O FIM DO "SEM DADO" QUE NUNCA SAÍA DO CINZA (06/09).

    Este item só sabia medir UM sentido: achar um bloco ABERTO e recolhê-lo.
    Quando todos nasciam recolhidos — que é o caso de todo bloco com
    `recolhidoPadrao` sem desvio salvo — ele devolvia SEM DADO. Só que
    SEM DADO aqui não era "hoje não deu": era PARA SEMPRE, porque o estado
    de partida daquela tela nunca muda sozinho. Foram 10 células assim na
    corrida de 06/09.

    Pior que isso, e é o que decidiu a mudança: as 4 telas que o item
    conseguiu medir naquela corrida só foram medidas POR ACASO — havia um
    `{desvio:true}` gravado de uma corrida anterior, e por isso o bloco
    estava aberto. Era o acaso escolhendo qual célula é medida e qual fica
    cinza, e "SEM DADO não é aprovação" está escrito no topo deste arquivo.

    Agora o item mede nos dois sentidos, e o sentido é escolhido pelo que a
    tela oferece: se há bloco ABERTO, recolhe (comportamento de sempre,
    intacto); se não há, ABRE um recolhido. Abrir é desvio como recolher é
    desvio — a mesma gravação, o mesmo F5, a mesma restauração.

    O QUE ISSO ESCREVE NO AMBIENTE COMPARTILHADO, dito por extenso porque a
    decisão é do cliente (06/09): preferência de interface do usuário de QA,
    nunca registro de negócio. As duas condições dele estão implementadas
    logo abaixo e não são enfeite: RESTAURAÇÃO OBRIGATÓRIA ao estado em que
    o bloco foi encontrado, e FALHA DE RESTAURAÇÃO REPROVA O ITEM em vez de
    passar calada.
  */
  const porEstado = await page.evaluate(() => {
    const titulo = (b) => String(b.querySelector('.app-bloco-titulo')?.innerText || '')
      .trim().replace(/\s+/g, ' ').slice(0, 60);
    const todos = Array.from(document.querySelectorAll('.app-bloco-recolher'));
    return {
      abertos: todos.filter((b) => b.getAttribute('aria-expanded') === 'true').map(titulo).filter(Boolean),
      recolhidos: todos.filter((b) => b.getAttribute('aria-expanded') !== 'true').map(titulo).filter(Boolean),
      quantos: todos.length
    };
  });

  if (!porEstado.abertos.length && !porEstado.recolhidos.length) {
    resultado.P3 = {
      estado: porEstado.quantos ? 'SEM DADO' : 'N/A',
      motivo: porEstado.quantos
        ? `a tela tem ${porEstado.quantos} bloco(s) recolhível(is) e NENHUM deles tem título legível (.app-bloco-titulo vazio) — sem identidade estável eu não consigo reencontrar o bloco depois da recarga para medir nem para restaurar`
        : 'tela sem bloco recolhível (nenhum .app-bloco-recolher) — não há recolhimento a guardar'
    };
    return;
  }

  /*
    O SENTIDO. Preferir os abertos não é gosto: recolher é o gesto que a
    pessoa faz para tirar da frente o que não quer ver, e era o que este
    item já media. Abrir entra quando não há o que recolher.
  */
  const daVez = porEstado.abertos.length
    ? { titulos: porEstado.abertos, deOnde: 'true', paraOnde: 'false', verbo: 'recolher', fiz: 'recolhi', naoFez: 'NÃO recolheu', voltouErrado: 'voltou ABERTO', ficouCerto: 'continua recolhido' }
    : { titulos: porEstado.recolhidos, deOnde: 'false', paraOnde: 'true', verbo: 'abrir', fiz: 'abri', naoFez: 'NÃO abriu', voltouErrado: 'voltou RECOLHIDO', ficouCerto: 'continua aberto' };
  const total = daVez.titulos.length;

  const declara = Boolean(declaraChaveDeBloco);
  let mexido = null; // { titulo, gravou } — o bloco que eu mexi, e como o achei
  /*
    RESTAURAÇÃO VERIFICADA, NUNCA PRESUMIDA.

    Ela devolve o bloco ao estado em que EU O ENCONTREI (`daVez.deOnde`) —
    não a "aberto", que era o que a versão anterior fazia porque só existia
    um sentido. E ela CONFERE o resultado: se o estado final não bater com o
    encontrado, o item REPROVA dizendo isso, em vez de passar calada. Um
    instrumento que "acha que restaurou" já custou caro nesta leva: o próprio
    P3 reabria o bloco no fim, o que regravava o desvio, e a corrida seguinte
    encontrava o mesmo estado e reprovava de novo — uma reprovação que se
    auto-alimentava e ninguém via.
  */
  const restaurar = async () => {
    if (!mexido) return { ok: true, motivo: null };
    const botao = page.locator('.app-bloco-recolher').filter({ hasText: mexido.titulo }).first();
    if (!(await botao.count())) {
      return { ok: false, motivo: `não encontrei de volta o bloco "${mexido.titulo}" para devolvê-lo ao estado em que o achei (aria-expanded="${daVez.deOnde}") — a preferência pode ter ficado gravada para o usuário de QA` };
    }
    if ((await botao.getAttribute('aria-expanded')) !== daVez.deOnde) {
      await botao.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1200);
    } else if (mexido.gravou) {
      /*
        O CASO QUE PARECE LIMPO E NÃO ESTÁ: a tela GRAVOU e não LEU na
        recarga (é o defeito que o item acabou de reprovar). Na tela o bloco
        está no estado de origem, então "desfazer" não faz nada — e a
        preferência CONTINUA no banco, esperando o dia em que a leitura for
        consertada, para reaparecer numa corrida futura como estado que
        ninguém pediu. O par de cliques devolve a gravação que apaga.
      */
      await botao.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(900);
      await botao.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1200);
    }
    const estado = await botao.getAttribute('aria-expanded');
    return estado === daVez.deOnde
      ? { ok: true, motivo: null }
      : { ok: false, motivo: `o bloco "${mexido.titulo}" NÃO voltou ao estado em que eu o encontrei (esperado aria-expanded="${daVez.deOnde}", está "${estado}") — a preferência fica gravada para o usuário de QA e a próxima corrida começa suja` };
  };

  try {
    /*
      TENTA ATÉ TRÊS BLOCOS. Numa tela com cinco blocos recolhíveis, só um
      pode ter chave; recolher o primeiro às cegas e concluir "não grava"
      acusaria a tela de um defeito que é da minha amostra.
    */
    const tentativas = Math.min(total, 3);
    const semGravacao = [];
    for (let i = 0; i < tentativas; i += 1) {
      const titulo = daVez.titulos[i];
      const botao = page.locator('.app-bloco-recolher').filter({ hasText: titulo }).first();
      if (!(await botao.count())) break;
      const marca = espia.marcar();
      await botao.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
      await botao.click({ timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(500);
      const virou = (await botao.getAttribute('aria-expanded')) === daVez.paraOnde;
      if (!virou) {
        resultado.P3 = {
          estado: 'FALHOU',
          motivo: `o bloco "${titulo || i + 1}" recebeu o clique de ${daVez.verbo} e ${daVez.naoFez} (aria-expanded continua "${await botao.getAttribute('aria-expanded')}")`
        };
        mexido = { titulo, gravou: false };
        return;
      }
      mexido = { titulo, gravou: false };
      /*
        `aceitaReset`: recolher pode ser a IDA (desvio → PUT) ou a VOLTA ao
        padrão (registro apagado → DELETE). As duas são a escolha indo para
        o banco; contar só a ida reprovou 4 telas certas em 06/09. O porquê
        está inteiro no `esperarGravacao`.
      */
      const gravacao = await espia.esperarGravacao(marca, 'blocos', 3500, { aceitaReset: true });
      if (gravacao) mexido.gravou = true;
      if (!gravacao) {
        semGravacao.push(titulo || `bloco ${i + 1}`);
        /* Desfaz e tenta o próximo: bloco sem chave não é o sujeito do item.
           O `mexido` só é zerado DEPOIS de o desfazer ser conferido — largar
           `null` sem olhar é presumir restauração, que é o que este item
           deixou de fazer. */
        await botao.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(400);
        if ((await botao.getAttribute('aria-expanded')) === daVez.deOnde) mexido = null;
        else return;
      }
      if (!gravacao) continue;

      /* ---- a recarga é o item inteiro ---------------------------------- */
      await page.reload({ waitUntil: 'domcontentloaded' });
      await esperarCarregar(page);
      await page.waitForTimeout(700);
      const depois = page.locator('.app-bloco-recolher').filter({ hasText: titulo }).first();
      if (!(await depois.count())) {
        resultado.P3 = {
          estado: 'SEM DADO',
          motivo: `${daVez.fiz} "${titulo}" e a gravação saiu (${gravacao.metodo} .../preferencias/blocos), mas depois da recarga o bloco não voltou à tela para eu conferir o estado dele`
        };
        return;
      }
      /*
        O RASTRO DIZ O SENTIDO, e o relatório tem de dizer qual foi: `PUT`
        é o desvio gravado; `DELETE` é o registro APAGADO porque o clique
        devolveu o bloco ao `recolhidoPadrao`. Escrever "PUT" nos dois casos
        seria o relatório afirmando uma chamada que não aconteceu.
      */
      const rastro = `${gravacao.metodo} ${new URL(gravacao.url).pathname}`;
      const sentido = gravacao.metodo === 'DELETE'
        ? ` — ${daVez.verbo} devolveu o bloco ao padrão da tela, e o componente grava DESVIO e não estado: voltar ao padrão APAGA o registro`
        : '';
      const estado = await depois.getAttribute('aria-expanded');
      if (estado !== daVez.paraOnde) {
        resultado.P3 = {
          estado: 'FALHOU',
          motivo: `${daVez.fiz} "${titulo}", a preferência FOI GRAVADA (${rastro}) e depois da recarga o bloco ${daVez.voltouErrado} (aria-expanded="${estado}") — grava e não lê é a mesma coisa que não guardar`
        };
        return;
      }
      resultado.P3 = {
        estado: 'PASSOU',
        motivo: `${daVez.fiz} "${titulo}", a escolha foi para o banco (${rastro})${sentido} e depois da recarga o bloco ${daVez.ficouCerto}`
      };
      return;
    }

    /* Nenhum dos blocos exercitados gravou nada. */
    if (declara) {
      resultado.P3 = {
        estado: 'FALHOU',
        motivo: `${daVez.fiz} ${semGravacao.length} bloco(s) (${semGravacao.join(', ')}) e NENHUMA gravação de preferência do tipo "blocos" saiu (nem PUT do desvio, nem DELETE da volta ao padrão) — e o arquivo da tela declara chavePreferencia. A tela diz que ligou a persistência e o recolhimento não guarda nada: no F5 volta tudo ao padrão do código`
      };
      return;
    }
    resultado.P3 = {
      estado: 'N/A',
      motivo: `a tela tem ${porEstado.quantos} bloco(s) recolhível(is), nenhum ligado à preferência do usuário (${daVez.verbo} ${semGravacao.length} deles não gravou nada e ${tela.arquivo} não passa chavePreferencia) — o recolhimento aqui é de sessão, por decisão da tela`
    };
  } finally {
    const volta = await restaurar();
    if (!volta.ok) {
      const anterior = resultado.P3?.motivo ? `${resultado.P3.motivo}; ` : '';
      resultado.P3 = { estado: 'FALHOU', motivo: `${anterior}${volta.motivo}` };
    }
  }
}

/* ==========================================================================
   P4 — CAMADA FLUTUANTE FECHA AO CLICAR FORA, COM Esc, E A SELEÇÃO ACONTECE
   ========================================================================== */

/*
  AS TRÊS PARTES SÃO UMA SÓ, E A TERCEIRA É A QUE NINGUÉM LEMBRA.

  Medido no levantamento: 37 camadas flutuantes, 11 fechavam certo. Das 26
  a corrigir, 12 fechavam por PERDA DE FOCO com um atraso deliberado de
  120–150ms — atraso que existe para o clique na opção ganhar a corrida
  contra o fechamento. O hook novo fecha no `mousedown`, e o `onClick` da
  opção dispara no `mouseup`: trocar sem auditar MATA A SELEÇÃO.

  Ou seja: o jeito mais barato de fazer um check de "fecha ao clicar fora"
  ficar verde é quebrar a seleção da camada. Um item com as duas primeiras
  partes e sem a terceira paga por essa troca — ele ficaria verde
  exatamente na tela que piorou.
*/

/** Famílias de camada, em ordem de preferência para exercitar. */
const FAMILIAS_DE_CAMADA = [
  {
    nome: 'painel de colunas',
    abridor: '.app-colunas-wrap > button',
    camada: '.app-colunas-menu',
    preferencia: 'colunas'
  },
  {
    nome: 'seletor de filtros visíveis',
    abridor: 'button[title="Escolher quais filtros aparecem nesta tela"]',
    camada: '.app-mais-menu.app-colunas-menu',
    preferencia: 'filtros'
  },
  {
    nome: 'menu de marcação de filtro',
    abridor: '.app-filtros .la-filtro-btn, .la-filtros-linha .la-filtro-btn',
    camada: '.la-rapido-pop',
    preferencia: null
  },
  {
    nome: 'menu de ações "⋯"',
    abridor: '.app-mais-wrap:not(.app-colunas-wrap) > button',
    camada: '.app-mais-menu',
    preferencia: null
  }
];

/*
  A CAMADA ABERTA TEM DE CABER INTEIRA NA JANELA (06/09) — a medida que
  faltava neste item.

  O DEFEITO QUE A PEDIU, achado pelo cliente numa captura do preview: o
  painel "Filtros visíveis" abria PARA FORA DA BORDA ESQUERDA da janela e
  ficava cortado pela metade. A causa era `right: 0` com `min-width: 260px`
  num botão que fica à esquerda da faixa de filtros — a borda esquerda do
  painel caía em x negativo. Metade do conteúdo, inclusive o aviso que
  explica a consequência do clique, ficava INALCANÇÁVEL: a camada é
  posicionada, então rolar a página não a traz de volta.

  E o P4 passava VERDE nesse painel. Ele media que a camada ABRE, FECHA ao
  clicar fora, FECHA com Esc e SELECIONA — quatro coisas certas sobre uma
  camada que ninguém consegue ler. É a mesma família do T2 antigo, que
  media a opacidade de um ícone e não o efeito do clique: o item media o
  comportamento e nunca a GEOMETRIA.

  A medida é a mais crua possível, e é de propósito: os quatro cantos da
  caixa dentro de `0..innerWidth` e `0..innerHeight`. Sem tolerância para
  "só um pouquinho fora" — pixel fora da janela é pixel que não existe para
  quem está olhando. A folga de 1px abaixo é só para o arredondamento de
  subpixel do próprio navegador, não licença de vazamento.
*/

/** Estado pintado da camada: presente no DOM, à vista E dentro da janela. */
const lerCamada = (seletor) => {
  const el = document.querySelector(seletor);
  if (!el) return { existe: false };
  const caixa = el.getBoundingClientRect();
  const estilo = getComputedStyle(el);
  const visivel = caixa.width > 0 && caixa.height > 0
    && estilo.display !== 'none' && estilo.visibility !== 'hidden'
    && parseFloat(estilo.opacity) > 0.1;

  const T = 1; // tolerância de subpixel; a função roda no navegador, sem escopo daqui
  const vazamentos = [];
  if (caixa.left < -T) vazamentos.push(`${Math.round(-caixa.left)}px além da borda ESQUERDA`);
  if (caixa.top < -T) vazamentos.push(`${Math.round(-caixa.top)}px além da borda DE CIMA`);
  if (caixa.right > window.innerWidth + T) {
    vazamentos.push(`${Math.round(caixa.right - window.innerWidth)}px além da borda DIREITA`);
  }
  if (caixa.bottom > window.innerHeight + T) {
    vazamentos.push(`${Math.round(caixa.bottom - window.innerHeight)}px além da borda DE BAIXO`);
  }

  return {
    existe: true,
    visivel,
    largura: Math.round(caixa.width),
    altura: Math.round(caixa.height),
    esquerda: Math.round(caixa.left),
    topo: Math.round(caixa.top),
    direita: Math.round(caixa.right),
    base: Math.round(caixa.bottom),
    janela: { largura: window.innerWidth, altura: window.innerHeight },
    vazamentos,
    display: estilo.display,
    visibility: estilo.visibility,
    opacidade: parseFloat(estilo.opacity)
  };
};

/**
 * UM PONTO SEGURO, LONGE DA CAMADA, PARA O CLIQUE DE FORA.
 *
 * "Clicar em document.body bem longe dela" não pode virar "clicar em
 * qualquer coordenada": o harness é SOMENTE LEITURA num ambiente
 * compartilhado, e uma coordenada às cegas pode cair num botão de ação, num
 * link que navega ou numa linha que abre registro. Então o ponto é
 * procurado: precisa estar a 200px da camada, dentro da janela, e o que
 * `elementFromPoint` entrega ali não pode ser nada acionável.
 */
const acharPontoSeguro = (seletor) => {
  const camada = document.querySelector(seletor);
  if (!camada) return null;
  const caixa = camada.getBoundingClientRect();
  const longe = (x, y) => (x < caixa.left - 200 || x > caixa.right + 200
    || y < caixa.top - 200 || y > caixa.bottom + 200);
  const acionavel = 'a[href], button, input, select, textarea, summary, [role="menuitem"],'
    + ' [role="button"], [role="tab"], [tabindex]:not([tabindex="-1"]), tr[tabindex], label';
  for (let y = window.innerHeight - 30; y > 60; y -= 40) {
    for (let x = 40; x < window.innerWidth - 40; x += 60) {
      if (!longe(x, y)) continue;
      const no = document.elementFromPoint(x, y);
      if (!no) continue;
      if (camada.contains(no)) continue;
      if (no.closest(acionavel)) continue;
      return { x, y, quem: (no.getAttribute('class') || no.tagName.toLowerCase()).slice(0, 60) };
    }
  }
  return null;
};

export async function checarCamadaFlutuante(page, tela, resultado, ctx) {
  const { espia } = ctx;

  /* ---- passo 0: qual camada esta tela oferece ------------------------- */
  let familia = null;
  for (const candidata of FAMILIAS_DE_CAMADA) {
    if (await page.locator(candidata.abridor).first().count()) { familia = candidata; break; }
  }
  if (!familia) {
    resultado.P4 = {
      estado: 'N/A',
      motivo: 'tela sem camada flutuante conhecida (painel de colunas, seletor de filtros, menu de marcação ou menu de ações)'
    };
    return;
  }

  const abridor = page.locator(familia.abridor).first();
  const camada = page.locator(familia.camada).first();
  let mexeuPreferencia = false;

  const abrir = async () => {
    if (await camada.count()) {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(250);
    }
    await abridor.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
    await abridor.click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(450);
    return page.evaluate(lerCamada, familia.camada);
  };

  const restaurar = async () => {
    await page.keyboard.press('Escape').catch(() => {});
    if (!mexeuPreferencia || !familia.preferencia) return { ok: true, motivo: null };
    if (!(await camada.count())) await abridor.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(350);
    const marca = espia.marcar();
    const reset = page.locator(`${familia.camada} .app-mais-item`, { hasText: /restaurar padrão/i }).first();
    if (await reset.count()) {
      await reset.click({ timeout: 5000 }).catch(() => {});
      await espia.esperarReset(marca, familia.preferencia, 3000);
    }
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(400);
    return { ok: true, motivo: null };
  };

  try {
    /* ---- passo 1: a camada abre e está à vista ------------------------- */
    const aberta = await abrir();
    if (!aberta.existe) {
      resultado.P4 = {
        estado: 'FALHOU',
        motivo: `passo 1 (abrir): o abridor da ${familia.nome} recebeu o clique e nenhuma camada (${familia.camada}) entrou no DOM`
      };
      return;
    }
    if (!aberta.visivel) {
      resultado.P4 = {
        estado: 'FALHOU',
        motivo: `passo 1 (abrir): a ${familia.nome} entrou no DOM invisível — ${aberta.largura}×${aberta.altura}px, display ${aberta.display}, visibility ${aberta.visibility}, opacidade ${aberta.opacidade}`
      };
      return;
    }

    /* ---- passo 1b: A CAMADA ABERTA CABE INTEIRA NA JANELA -------------- */
    if (aberta.vazamentos.length) {
      resultado.P4 = {
        estado: 'FALHOU',
        motivo: `passo 1b (cabe na janela): a ${familia.nome} abriu ${aberta.largura}×${aberta.altura}px`
          + ` em x ${aberta.esquerda}..${aberta.direita}, y ${aberta.topo}..${aberta.base},`
          + ` numa janela de ${aberta.janela.largura}×${aberta.janela.altura} — ela VAZA `
          + aberta.vazamentos.join(' e ')
          + '. Camada posicionada que sai da janela fica cortada e INALCANÇÁVEL: rolar a página não'
          + ' a traz de volta, e o conteúdo que ficou fora não tem outro caminho'
      };
      return;
    }

    /* ---- passo 2: clicar FORA fecha ------------------------------------ */
    const ponto = await page.evaluate(acharPontoSeguro, familia.camada);
    if (!ponto) {
      resultado.P4 = {
        estado: 'SEM DADO',
        motivo: `passo 2 (clique fora): não achei na janela um ponto a 200px da ${familia.nome} que não fosse acionável — clicar às cegas violaria a regra de somente leitura, então o fechamento NÃO FOI EXERCITADO`
      };
      return;
    }
    await page.mouse.click(ponto.x, ponto.y);
    await page.waitForTimeout(450);
    const aposClique = await page.evaluate(lerCamada, familia.camada);
    if (aposClique.existe && aposClique.visivel) {
      resultado.P4 = {
        estado: 'FALHOU',
        motivo: `passo 2 (clique fora): cliquei em (${ponto.x}, ${ponto.y}), sobre "${ponto.quem}", a ${Math.round(200)}px+ da camada, e a ${familia.nome} CONTINUA aberta e visível (${aposClique.largura}×${aposClique.altura}px)`
      };
      return;
    }

    /* ---- passo 3: Esc fecha -------------------------------------------- */
    const reaberta = await abrir();
    if (!reaberta.existe || !reaberta.visivel) {
      resultado.P4 = {
        estado: 'FALHOU',
        motivo: `passo 3 (Esc): a ${familia.nome} fechou no clique fora e NÃO REABRIU no clique seguinte (existe=${reaberta.existe}, visível=${reaberta.visivel}) — camada que fecha e não volta troca um defeito por outro`
      };
      return;
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(450);
    const aposEsc = await page.evaluate(lerCamada, familia.camada);
    if (aposEsc.existe && aposEsc.visivel) {
      resultado.P4 = {
        estado: 'FALHOU',
        motivo: `passo 3 (Esc): apertei Esc com a ${familia.nome} aberta e ela CONTINUA aberta e visível (${aposEsc.largura}×${aposEsc.altura}px)`
      };
      return;
    }

    /* ---- passo 4: A SELEÇÃO ACONTECE ----------------------------------- */
    const terceira = await abrir();
    if (!terceira.existe || !terceira.visivel) {
      resultado.P4 = {
        estado: 'FALHOU',
        motivo: `passo 4 (a seleção acontece): a ${familia.nome} não reabriu para eu escolher uma opção (existe=${terceira.existe}, visível=${terceira.visivel})`
      };
      return;
    }
    /*
      SÓ OPÇÃO DE MARCAÇÃO É CLICADA — e não é conveniência, é a regra do
      ambiente compartilhado. Item de menu costuma ser AÇÃO ("Excluir",
      "Duplicar", "Enviar"); clicar num deles para provar que a camada
      seleciona seria criar ou apagar registro de verdade. Caixa de
      marcação é escolha de exibição: reversível, e o harness a reverte.
    */
    const opcoes = camada.locator('input[type="checkbox"]:not([disabled]), input[type="radio"]:not([disabled])');
    const totalOpcoes = await opcoes.count();
    if (!totalOpcoes) {
      resultado.P4 = {
        estado: 'SEM DADO',
        motivo: `a ${familia.nome} fecha ao clicar fora e com Esc, mas ela não tem opção de MARCAÇÃO para exercitar a seleção com segurança (só ações, que o harness não clica no ambiente compartilhado) — a terceira parte do item NÃO FOI PROVADA, e sem ela o fechamento sozinho não é aprovação: quebrar a seleção é o atalho para fazer uma camada fechar`
      };
      return;
    }
    let escolhida = null;
    for (let i = 0; i < totalOpcoes; i += 1) {
      const op = opcoes.nth(i);
      const tipo = await op.getAttribute('type');
      const marcada = await op.isChecked();
      if (tipo === 'radio' && marcada) continue; // clicar num radio já marcado não muda nada
      escolhida = { op, tipo, marcada };
      break;
    }
    if (!escolhida) {
      resultado.P4 = {
        estado: 'SEM DADO',
        motivo: `a ${familia.nome} fecha ao clicar fora e com Esc, e todas as ${totalOpcoes} opções são marcas de escolha ÚNICA já marcadas — não havia escolha a fazer sem mudar o recorte da tela`
      };
      return;
    }
    if (familia.preferencia) mexeuPreferencia = true;
    await escolhida.op.click({ timeout: 10000 });
    await page.waitForTimeout(600);
    const agora = await escolhida.op.isChecked().catch(() => null);
    if (agora === escolhida.marcada) {
      resultado.P4 = {
        estado: 'FALHOU',
        motivo: `passo 4 (a seleção acontece): cliquei numa opção da ${familia.nome} e a marcação NÃO mudou (continua ${escolhida.marcada ? 'marcada' : 'desmarcada'}) — a camada fecha bonito e não seleciona. É a troca que o levantamento avisou: o hook fecha no mousedown e o onClick da opção morre no mouseup`
      };
      return;
    }
    if (agora === null) {
      resultado.P4 = {
        estado: 'FALHOU',
        motivo: `passo 4 (a seleção acontece): cliquei numa opção da ${familia.nome} e a opção SAIU DO DOM antes de eu conseguir ler a marcação — a camada fechou no clique da própria opção, que é o defeito clássico do fechamento no mousedown`
      };
      return;
    }
    /* Desfaz a marcação: a caixa volta ao estado em que estava. */
    await escolhida.op.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);

    resultado.P4 = {
      estado: 'PASSOU',
      motivo: `${familia.nome}: abriu visível (${aberta.largura}×${aberta.altura}px) INTEIRA na janela`
        + ` (x ${aberta.esquerda}..${aberta.direita}, y ${aberta.topo}..${aberta.base} em`
        + ` ${aberta.janela.largura}×${aberta.janela.altura}), fechou ao clicar em (${ponto.x}, ${ponto.y})`
        + ` sobre "${ponto.quem}", fechou com Esc, e ao reabrir a escolha de uma opção mudou a marcação de`
        + ` ${escolhida.marcada ? 'marcada' : 'desmarcada'} para ${agora ? 'marcada' : 'desmarcada'}`
        + ' — cabe, fecha e não perde a seleção'
    };
  } finally {
    await restaurar();
  }
}
