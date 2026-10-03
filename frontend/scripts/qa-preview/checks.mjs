/**
 * CHECKS DA DoD QUE RODAM DENTRO DA PÁGINA (page.evaluate).
 * Cada função é AUTOCONTIDA (o Playwright serializa — nada de closures de
 * módulo). Todas devolvem { ITEM: { estado: 'PASSOU'|'FALHOU'|'N/A',
 * motivo?, seletor? } } parciais que o runner funde.
 *
 * Aqui vive o que dá para medir num DOM parado; rolagem, hover, arrasto,
 * clique em filtro e modal ficam no runner (verificar.mjs).
 */

/** Checks estáticos de desktop — um evaluate só, para não ir e vir. */
export function checksEstaticos({ tipo }) {
  const r = {};
  const q = (sel, raiz) => (raiz || document).querySelector(sel);
  const qa = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));

  /*
    QUANTAS LINHAS O TEXTO OCUPA — medindo os NÓS DE TEXTO, um a um.

    Três gerações erradas, cada uma custando ~15 falsos positivos:
     1. `scrollHeight > lineHeight*1.6` — `scrollHeight` inclui o PADDING,
        então toda célula parecia quebrada.
     2. `clientHeight - padding` — numa TABELA, `td.clientHeight` é a altura
        da LINHA: se uma célula quebra, todas as vizinhas reportam quebra.
     3. `Range.selectNodeContents(el).getClientRects()` — o Range devolve um
        retângulo para a CAIXA de cada elemento filho ALÉM do texto dentro
        dela. Célula com selo (`.fx-badge`, inline-flex com 3px de padding)
        devolvia dois retângulos com 6px de diferença: caixa e texto. Todo
        selo e todo botão viravam "duas linhas".

    A medida honesta ignora caixas e olha só TEXTO: percorre os nós de texto
    e mede o retângulo de cada um. Assim o padding de um selo não inventa
    linha, e uma palavra que de fato quebra continua devolvendo dois
    retângulos com topos diferentes.
  */
  const linhasDeTexto = (el) => {
    if (!el) return 0;
    try {
      const percorrer = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const topos = [];
      let no = percorrer.nextNode();
      while (no) {
        if (no.nodeValue && no.nodeValue.trim()) {
          const intervalo = document.createRange();
          intervalo.selectNodeContents(no);
          Array.from(intervalo.getClientRects())
            .filter((r) => r.width > 0 && r.height > 0)
            .forEach((r) => {
              if (!topos.some((t) => Math.abs(t - r.top) <= 3)) topos.push(r.top);
            });
        }
        no = percorrer.nextNode();
      }
      return topos.length;
    } catch (_) {
      return 1;
    }
  };
  /*
    QUANTAS LINHAS UM MESMO TEXTO OCUPA — que é o que "quebrou" quer dizer.

    `linhasDeTexto` acima soma os topos de TODOS os nós de texto da célula,
    então uma célula com dois textos EMPILHADOS DE PROPÓSITO devolve 2. E é
    exatamente isso que a `.app-celula-dupla` é: `display: flex;
    flex-direction: column` com principal e sublinha, ambos `white-space:
    nowrap`. Ou seja: em TODA tabela do sistema com coluna de identidade, o
    sinal "quebrou" era CONSTANTE VERDADEIRO — não media nada (03/09).

    Empilhar duas linhas por decisão de layout não é quebra; quebra é UM
    texto que não coube e virou duas linhas. Esta função mede isso: o
    máximo de linhas que um ÚNICO nó de texto ocupa.
  */
  const linhasDoMesmoTexto = (el) => {
    if (!el) return 0;
    try {
      const percorrer = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let maior = 0;
      let no = percorrer.nextNode();
      while (no) {
        if (no.nodeValue && no.nodeValue.trim()) {
          const intervalo = document.createRange();
          intervalo.selectNodeContents(no);
          const topos = [];
          Array.from(intervalo.getClientRects())
            .filter((r) => r.width > 0 && r.height > 0)
            .forEach((r) => {
              if (!topos.some((t) => Math.abs(t - r.top) <= 3)) topos.push(r.top);
            });
          maior = Math.max(maior, topos.length);
        }
        no = percorrer.nextNode();
      }
      return maior;
    } catch (_) {
      return 1;
    }
  };

  /*
    QUANTO ESPAÇO O CONTEÚDO DA CÉLULA PEDE.

    Era `(td.firstElementChild || td).scrollWidth`, e `scrollWidth` de um
    elemento INLINE não substituído é ZERO. A coluna comum do sistema
    renderiza justamente isso — `render: (u) => <span title={…}>{texto}</span>`
    (Usuarios, Parceiros, Obras…) —, então o conteúdo media 0 e a coluna
    aparecia com folga igual à LARGURA INTEIRA. Combinado com o sinal de
    quebra que era sempre verdadeiro, o segundo critério da T4 acusava (ou
    absolvia) por números que não descreviam a tabela (03/09).

    A medida honesta é a extensão do texto: um Range sobre o conteúdo da
    célula devolve a largura que o texto ocupa mesmo quando o filho é
    inline, e mais o padding da célula, que também é espaço que a coluna
    precisa ter.
  */
  const larguraDoConteudo = (celula) => {
    if (!celula) return 0;
    const cs = getComputedStyle(celula);
    const respiro = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    let extensao = 0;
    try {
      const intervalo = document.createRange();
      intervalo.selectNodeContents(celula);
      const r = intervalo.getBoundingClientRect();
      if (r && r.width > 0) extensao = r.width;
    } catch (_) { /* segue para o fallback */ }
    Array.from(celula.children).forEach((filho) => {
      extensao = Math.max(extensao, filho.scrollWidth || 0);
    });
    if (!extensao) extensao = Math.max(0, celula.scrollWidth - respiro);
    return extensao + respiro;
  };

  const visivel = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  /*
    CLASSE DE ELEMENTO SVG NÃO É STRING (04/09).

    Em SVG, `element.className` é um `SVGAnimatedString`, não uma string.
    Quatro pontos deste arquivo faziam `String(el.className)` direto e o
    motivo saía com `rect.[object.SVGAnimatedString]` — um seletor que não
    existe, num relatório cuja função é dizer ONDE consertar. O defeito
    apareceu no X3 do login.
  */
  const classeDe = (el) => {
    if (!el) return '';
    const cru = el.className;
    if (cru && typeof cru !== 'string' && typeof cru.baseVal === 'string') return cru.baseVal;
    return typeof cru === 'string' ? cru : '';
  };
  const cssPath = (el) => {
    if (!el) return '';
    const partes = [];
    let atual = el;
    while (atual && atual !== document.body && partes.length < 5) {
      let p = atual.tagName.toLowerCase();
      if (atual.id) { partes.unshift(`#${atual.id}`); break; }
      const cls = classeDe(atual).split(/\s+/).filter(Boolean).slice(0, 2).join('.');
      if (cls) p += `.${cls}`;
      partes.unshift(p);
      atual = atual.parentElement;
    }
    return partes.join(' > ');
  };
  const foraDeModal = (el) => !el.closest('[role="dialog"]');

  const faixa = q('.layout-main .app-page-header');

  /* ---- C2: título 22px, apoio em UMA linha na faixa, contagem junto ---- */
  if (!faixa) {
    r.C2 = { estado: 'FALHOU', motivo: 'faixa .app-page-header ausente' };
  } else {
    const problemas = [];
    const titulo = q('.page-title', faixa) || q('h1', faixa);
    if (!titulo || !visivel(titulo)) {
      problemas.push('título ausente/invisível na faixa');
    } else {
      const fs = parseFloat(getComputedStyle(titulo).fontSize);
      if (fs < 21 || fs > 23.5) problemas.push(`título em ${fs}px (esperado 22px)`);
    }
    const lead = q('.app-page-lead', faixa);
    /*
      O APOIO NÃO PODE SER O EMBRULHO DO PRÓPRIO TÍTULO (03/09).

      O ramo alternativo existe para telas cujo apoio não usa
      `.app-page-lead`. Só que o `<div>` que o PageHeader põe em volta do
      `<h1>` casava com todos os critérios (texto > 3 chars, fonte herdada
      de 14px, ≤ 3 filhos, sem botão dentro) — então uma faixa SEM apoio
      nenhum era aprovada, com o contêiner do título fazendo as vezes de
      apoio. Provado com fixture: remover o apoio inteiro devolvia PASSOU.

      Apoio é o que vem ALÉM do título; quem contém o título está descrito
      pelo próprio título.
    */
    const apoioAlt = lead || qa('div,p,span', faixa).find((el) => el !== titulo
      && visivel(el) && !el.closest('.app-actionbar')
      && !(titulo && el.contains(titulo))
      && el.textContent.trim().length > 3
      && parseFloat(getComputedStyle(el).fontSize) <= 19
      && el.children.length <= 3 && !el.querySelector('button, .btn'));
    if (!apoioAlt) {
      problemas.push('apoio (contagem/descrição) ausente na faixa');
    } else if (lead) {
      const lh = parseFloat(getComputedStyle(lead).lineHeight) || 24;
      if (lead.getBoundingClientRect().height > lh * 1.6) {
        problemas.push('apoio quebra em mais de uma linha');
      }
      if ((tipo === 'listagem' || tipo === 'mista') && !/\d/.test(lead.textContent)) {
        problemas.push('contagem ausente no apoio');
      }
    }
    r.C2 = problemas.length
      ? { estado: 'FALHOU', motivo: problemas.join('; '), seletor: cssPath(faixa) }
      : { estado: 'PASSOU' };
  }

  /* ---- C3: seta de voltar só em detalhe/registro ---- */
  {
    const seta = faixa && (q('.app-voltar', faixa) || q('[aria-label*="oltar"]', faixa));
    /*
      A SETA QUE SOBE UM NÍVEL NÃO É REDUNDANTE (05/09).

      A R11 diz que "Voltar" em listagem é redundante, porque o menu já leva
      a pessoa a qualquer lugar. Isso vale quando a seta sai da trilha — mas
      dez relatórios de Compras reprovaram aqui por uma seta que faz o
      contrário: `/compras/relatorios/ciclo` volta para
      `/compras/relatorios`, que é o índice de onde a pessoa veio e que o
      menu NÃO oferece. Consertar pela mensagem, ali, seria tirar dez setas
      e deixar dez telas sem caminho de volta.

      Isto podia virar dez declarações no manifesto, uma por tela, com o
      mesmo texto. Não precisa: dá para MEDIR. Se o destino da seta é um
      prefixo próprio da rota atual, ela sobe um nível da própria trilha — e
      aí é a affordance de retorno, não um botão redundante. Declaração que
      dá para medir é declaração que um dia fica velha sem ninguém notar.
    */
    const destinoDaSeta = seta && seta.getAttribute && seta.getAttribute('href');
    const semBarra = (v) => String(v || '').replace(/\/+$/, '');
    const aqui = semBarra(location.pathname);
    const sobeUmNivel = Boolean(destinoDaSeta)
      && destinoDaSeta !== '#'
      && semBarra(destinoDaSeta) !== ''
      && aqui.startsWith(`${semBarra(destinoDaSeta)}/`);
    if (tipo === 'detalhe' || tipo === 'form') {
      r.C3 = seta && visivel(seta)
        ? { estado: 'PASSOU' }
        : { estado: 'FALHOU', motivo: 'tela de detalhe/registro sem a seta de voltar à esquerda' };
    } else if (seta && visivel(seta) && sobeUmNivel) {
      r.C3 = { estado: 'PASSOU', motivo: `a seta sobe um nível da própria rota (${aqui} → ${destinoDaSeta}), que é o índice de onde a pessoa veio — não é o "Voltar" redundante da R11` };
    } else {
      r.C3 = seta && visivel(seta)
        ? { estado: 'FALHOU', motivo: `seta de voltar em tela de LISTAGEM levando para FORA da trilha (${aqui} → ${destinoDaSeta || 'sem href'}) — R11: redundante, o menu já leva lá` }
        : { estado: 'N/A', motivo: 'listagem — seta só em detalhe/registro' };
    }
  }

  /* ---- C4: nome do registro com destaque (detalhe) ---- */
  if (tipo === 'detalhe') {
    const titulo = faixa && (q('.page-title', faixa) || q('h1', faixa));
    const texto = titulo ? titulo.textContent.trim() : '';
    const fs = titulo ? parseFloat(getComputedStyle(titulo).fontSize) : 0;
    const soNumero = /^#?\d+$/.test(texto.replace(/^(titulo|obra)\s*/i, ''));
    r.C4 = titulo && texto.length >= 3 && !soNumero && fs >= 18
      ? { estado: 'PASSOU' }
      : { estado: 'FALHOU', motivo: `identificação do registro sem destaque (texto="${texto.slice(0, 40)}", ${fs}px)` };
  } else {
    r.C4 = { estado: 'N/A', motivo: 'não é tela de detalhe' };
  }

  /* ---- C5: um primário sólido; secundários em contorno ---- */
  if (faixa) {
    const barra = q('.app-actionbar', faixa);
    if (!barra || !visivel(barra) || !qa('.btn', barra).some(visivel)) {
      r.C5 = { estado: 'N/A', motivo: 'tela sem ações no cabeçalho' };
    } else {
      const primarios = qa('.btn-primary', barra).filter(visivel);
      const semContorno = qa('.btn', barra).filter(visivel).filter((b) => (
        !b.classList.contains('btn-primary')
        && !b.classList.contains('btn-outline')
        && !b.classList.contains('app-voltar')
        && !b.closest('.app-mais-wrap')
      ));
      const problemas = [];
      if (primarios.length > 1) problemas.push(`${primarios.length} botões primários (máx 1)`);
      if (semContorno.length) problemas.push(`secundário sem contorno: ${cssPath(semContorno[0])}`);
      r.C5 = problemas.length
        ? { estado: 'FALHOU', motivo: problemas.join('; ') }
        : { estado: 'PASSOU' };
    }
  } else {
    /*
      SEM FAIXA, A REGRA CONTINUA VALENDO — só o lugar de medir muda (03/09).

      Fora do shell (Login, Recuperar Senha, Definir Senha, Cotação Pública)
      não existe `.app-page-header`: a C1/C2 são N/A pela DoD própria dessas
      telas. A versão antiga do check devolvia FALHOU "faixa ausente" nas
      quatro — reprovando-as por NÃO TEREM algo que a DoD dispensa.

      Mas a C5 não é sobre a faixa: é sobre UM primário sólido e os
      secundários em contorno. Isso vale ali igual, e é medido na tela
      inteira. Só vira N/A quando não há botão nenhum para medir.
    */
    /*
      Botão SÓ DE ÍCONE não é ação secundária (03/09): o olho que mostra a
      senha no Login foi acusado de "secundário sem contorno", e contorná-lo
      desenharia uma moldura em volta de um ícone dentro do campo. A C5
      classifica AÇÕES, e ação se reconhece pelo rótulo — sem texto, não é
      uma delas.
    */
    const botoes = qa('.btn').filter(visivel)
      .filter((b) => !b.closest('.app-mais-wrap'))
      .filter((b) => (b.innerText || '').trim().length > 0);
    if (!botoes.length) {
      r.C5 = { estado: 'N/A', motivo: 'tela sem faixa e sem botões a medir' };
    } else {
      const primarios = botoes.filter((b) => b.classList.contains('btn-primary'));
      const semContorno = botoes.filter((b) => (
        !b.classList.contains('btn-primary')
        && !b.classList.contains('btn-outline')
        && !b.classList.contains('btn-ghost')
        && !b.classList.contains('app-voltar')
      ));
      const problemas = [];
      if (primarios.length > 1) problemas.push(`${primarios.length} botões primários na tela (máx 1) — medido fora da faixa, que não existe aqui`);
      if (semContorno.length) problemas.push(`secundário sem contorno: ${cssPath(semContorno[0])}`);
      r.C5 = problemas.length
        ? { estado: 'FALHOU', motivo: problemas.join('; ') }
        : { estado: 'PASSOU', motivo: 'tela fora do shell: um primário sólido, medido na tela inteira (não há faixa)' };
    }
  }

  /* ---- C6: navegação disfarçada de ação (distinção do cliente, 02/09):
     BOTÃO que executa ação na tela (Novo, Editar, Desativar, Gerar…) NUNCA
     é navegação — botão sem href não reprova. Navegação é LINK cujo
     destino é OUTRA ROTA: um <a href> na barra de ações/menu ⋯ apontando
     para fora da subárvore da rota atual. Link para sub-rota do próprio
     registro (ex.: /titulos/9/editar dentro de /titulos/9) é ação. ---- */
  {
    const rotaAtual = location.pathname.replace(/\/$/, '');
    /*
      A BARRA DE AÇÕES DA TELA, NÃO A DA LINHA (03/09).

      O seletor `.app-actionbar` casa com DOIS lugares: o cabeçalho da tela
      e a barra de ações dentro de um `<td>`. São coisas diferentes.

      Na `relatorios-administrativos` o check reprovou "Abrir pedido" →
      /pedidos-compra/21, que é a ação de ABRIR O REGISTRO DAQUELA LINHA —
      o motivo de a listagem existir. A C6 proíbe navegação disfarçada de
      ação onde o usuário procura o que fazer NESTA tela: o cabeçalho e o
      menu "⋯". Abrir o registro da linha é o oposto disso: é o destino
      esperado, e é o único caminho para o detalhe.

      Aplicar a C6 à linha empurraria para remover o link e deixar a
      listagem sem saída — a mesma classe de erro da seta de voltar comida
      pela R11 em 02/09, que foi o que deu origem ao escopo declarado.
    */
    const naLinha = (el) => Boolean(el.closest('td, tr'));
    /*
      A C6 OLHA A FAIXA, NÃO QUALQUER `.app-actionbar` (05/09).

      `.app-actionbar` é uma classe de ARRANJO, e o Dashboard a usa para
      alinhar os atalhos do bloco "Ir direto para" — que estão no CORPO da
      página de propósito, seguindo a regra de 04/09 ("caminho para outra
      tela mora no hub, não na barra de ações"). O check leu a classe como
      se fosse a barra de ações da tela e reprovou justamente a tela que
      obedeceu à regra.

      É o mesmo engano da barra de ações dentro do `<td>`, já corrigido em
      03/09, e a lição que ficou dele vale inteira aqui: marca de arranjo
      não é declaração de papel. O papel está no LUGAR — a faixa fixa e o
      menu "⋯" são onde a pessoa procura o que fazer nesta tela.
    */
    const suspeitos = qa('.app-page-header .app-actionbar a[href], .app-mais-menu a[href]')
      .filter(visivel)
      .filter((el) => !naLinha(el))
      .filter((el) => !el.classList.contains('app-voltar'))
      /*
        CADASTRO EM ROTA PRÓPRIA É AÇÃO, NÃO CAMINHO (05/09).

        A R1 já registra, como decisão do projeto, que a ação de cadastrar
        pode abrir em MODAL ou em ROTA DEDICADA — e ela mesma devolve "N/A —
        cadastro em página própria" nesse caso. A C6 não sabia disso e
        reprovava o "+ Novo Lead" do Kanban, que é exatamente a ação
        principal da tela na forma que o projeto aprovou. Duas regras da
        mesma casa discordando sobre a mesma tela: quem paga é quem tem de
        escolher qual obedecer.

        A isenção é estreita de propósito: só a AÇÃO PRINCIPAL, só com
        rótulo de cadastro, e só quando o destino é a rota de cadastro
        (`/novo`, `/nova`). Qualquer outro link continua sendo caminho.
      */
      .filter((el) => {
        const ehPrincipal = el.classList.contains('btn-primary');
        const rotuloDeCadastro = /^\+?\s*(novo|nova)\b/i.test((el.textContent || '').trim());
        const destinoDeCadastro = /\/(novo|nova)$/i.test(new URL(el.getAttribute('href'), location.origin).pathname);
        return !(ehPrincipal && rotuloDeCadastro && destinoDeCadastro);
      })
      .filter((el) => {
        const url = new URL(el.getAttribute('href'), location.origin);
        /*
          LINK EXTERNO NAO E NAVEGACAO DO SISTEMA (05/09).

          O check comparava so o `pathname` e ignorava a ORIGEM. Entao
          `https://wa.me/5528...` era lido como a rota interna `/5528...` e
          reprovava: o "Testar WhatsApp" da ConfiguracoesSuporte apareceu
          vermelho na matriz.

          E acao, nao caminho. A C6 existe para tirar da barra de acoes o
          atalho que leva a OUTRA TELA do sistema — e a regra de 04/09 diz
          onde esse caminho mora: hub, breadcrumb e Ctrl+K. Nenhum dos tres
          consegue hospedar um link externo, entao aplicar a C6 aqui nao
          moveria o link para o lugar certo: apagaria a capacidade.

          Abrir o WhatsApp no numero configurado e como baixar um arquivo:
          sai do sistema, faz uma coisa SOBRE esta tela, e devolve a pessoa
          onde ela estava (`target="_blank"`).
        */
        if (url.origin !== location.origin) return false;      // externo = ação, não navegação
        const destino = url.pathname.replace(/\/$/, '');
        if (destino === rotaAtual) return false;               // mesma rota
        if (destino.startsWith(`${rotaAtual}/`)) return false; // sub-rota do registro (editar, novo…)
        return true;                                           // OUTRA rota = navegação
      });
    r.C6 = suspeitos.length
      ? { estado: 'FALHOU', motivo: `link de navegação como ação: "${suspeitos[0].textContent.trim()}" → ${suspeitos[0].getAttribute('href')}`, seletor: cssPath(suspeitos[0]) }
      : { estado: 'PASSOU' };
  }

  /* ---- Tabelas ---- */
  const tabelas = qa('.resizable-table').filter(visivel).filter(foraDeModal);
  const norm = (a) => (a === 'start' ? 'left' : a === 'end' ? 'right' : a);

  if (!tabelas.length) {
    /*
      ATENÇÃO — duas coisas MUITO diferentes caíam aqui como N/A, e o
      cliente pegou isso em 03/09 na `rhdp-documentos`:

        (a) a tela não tem tabela nenhuma (um formulário, um hub de
            cartões). A regra realmente NÃO SE APLICA → N/A.
        (b) a tela TEM tabela, e a base do preview não devolveu linha
            nenhuma. A `TabelaPadrao` troca a tabela pelo `.empty-state`
            quando não há registro, então some do DOM e o check antigo
            lia "tela sem tabela visível".

      No caso (b) escrever N/A é MENTIRA por omissão: sugere que a régua
      não vale ali, quando o que houve é que as sete capacidades de tabela
      NÃO FORAM PROVADAS. Agora isso vira estado próprio, SEM DADO, e a
      matriz o mostra separado do N/A — não-provado nunca vira aprovado
      por equivalência.
    */
    const vazia = qa('.empty-state').filter(visivel).filter(foraDeModal)[0];
    const estadoSemTabela = vazia ? 'SEM DADO' : 'N/A';
    const motivoSemTabela = vazia
      ? `a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "${(vazia.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 70)}") — capacidade NÃO PROVADA`
      : 'tela sem tabela visível';
    ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'].forEach((k) => {
      r[k] = { estado: estadoSemTabela, motivo: motivoSemTabela };
    });
  } else {
    /* T1: th × td com o mesmo alinhamento por coluna */
    const t1 = [];
    tabelas.forEach((tab) => {
      const ths = qa('thead th', tab);
      const linha = q('tbody tr', tab);
      if (!linha) return;
      const tds = qa('td', linha);
      ths.forEach((th, i) => {
        const td = tds[i];
        if (!td) return;
        const at = norm(getComputedStyle(th.querySelector('.app-th-alinhavel') || th).textAlign);
        const ad = norm(getComputedStyle(td).textAlign);
        if (at !== ad) t1.push(`${cssPath(tab)} col ${i + 1}: th=${at} td=${ad}`);
      });
    });
    r.T1 = t1.length ? { estado: 'FALHOU', motivo: t1.slice(0, 3).join(' | ') } : { estado: 'PASSOU' };

    /*
      T8 — OS TÍTULOS DA MESMA TABELA ASSENTAM NA MESMA LINHA DE BASE
      (item novo, 05/09; achado do cliente na tela de Obras).

      O DEFEITO: na Obras, "AÇÕES" fica visivelmente mais baixo que
      "OBRA", "CLIENTE" e "VGV". A causa está no cabeçalho: a coluna de
      ações é a ÚNICA que a TabelaPadrao renderiza como TEXTO CRU dentro do
      `th` (`<ResizableTh columnKey="__acoes">Ações</ResizableTh>`); todas
      as outras passam pelo `CabecalhoColuna`, que embrulha o título em
      `.app-th-alinhavel` > `.app-th-botao`. Esse embrulho é `display:
      block` e tem caixa de linha PRÓPRIA — o texto de dentro assenta numa
      linha de base diferente da do texto solto ao lado. Não é uma diferença
      de tamanho de fonte nem de alinhamento horizontal: é a linha em que a
      letra pousa.

      POR QUE ITEM NOVO E NÃO UM RAMO DA T1.

      A T1 mede alinhamento HORIZONTAL e mede um PAR (th × td) coluna a
      coluna: ela pergunta "o título e o conteúdo desta coluna apontam para
      o mesmo lado?". Esta pergunta é VERTICAL e é sobre a LINHA INTEIRA de
      cabeçalhos comparados ENTRE SI — sujeito diferente, eixo diferente,
      população diferente. Enfiada na T1, a célula da matriz passaria a
      significar duas coisas: uma T1 vermelha deixaria de dizer QUAL
      capacidade quebrou, e é a célula que a pessoa lê para consertar. Some
      a isso que a T1 exige uma linha no `tbody` para existir (sem registro
      ela nem compara), enquanto a linha de base do cabeçalho é mensurável
      com a tabela vazia — juntá-las apagaria a medição justamente nas
      telas em que a base não devolveu registro.

      COMO SE MEDE — a LINHA DE BASE DO TEXTO, não a caixa do `th`.

      Comparar `th.getBoundingClientRect()` não mediria nada: as células da
      mesma linha de cabeçalho têm a MESMA caixa por construção da tabela. O
      que desalinha é onde a letra pousa dentro dela. Então mede-se o
      retângulo do próprio NÓ DE TEXTO (Range sobre o nó, como a
      `linhasDeTexto` já faz) e desconta-se a DESCIDA da fonte
      (`fontBoundingBoxDescent` do canvas, com a mesma fonte computada do
      elemento): `base = rect.bottom - descida`. Descontar a descida é o que
      torna a medida honesta entre textos de tamanhos diferentes — sem
      isso, um título 1px menor "assentaria" mais alto sem estar
      desalinhado.

      TOLERÂNCIA: 1px. Os retângulos são fracionários e as métricas de
      fonte chegam com casa decimal, então diferenças de arredondamento
      ficam bem abaixo de 1px; e nada abaixo de 1px é o que o cliente vê.
      O defeito real da Obras é de vários pixels. Tolerar mais do que isso
      seria escolher não enxergar o defeito que originou o item.
    */
    const TOLERANCIA_LINHA_BASE = 1;
    const linhaDeBaseDoTexto = (raiz) => {
      try {
        const percorrer = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
        let no = percorrer.nextNode();
        while (no) {
          const conteudo = (no.nodeValue || '').trim();
          // Pula o nó de texto INVISÍVEL (ícone com texto alternativo,
          // espaço entre tags) — ele não tem retângulo com área.
          if (conteudo) {
            const intervalo = document.createRange();
            intervalo.selectNodeContents(no);
            const caixa = Array.from(intervalo.getClientRects())
              .filter((c) => c.width > 0 && c.height > 0)[0];
            if (caixa) {
              const estilo = getComputedStyle(no.parentElement);
              // Fallback proporcional só para o caso de o canvas não
              // devolver métrica de fonte; a medida boa é a do canvas.
              let descida = parseFloat(estilo.fontSize) * 0.21;
              try {
                const ctx = document.createElement('canvas').getContext('2d');
                ctx.font = `${estilo.fontStyle} ${estilo.fontWeight} ${estilo.fontSize} / ${estilo.lineHeight} ${estilo.fontFamily}`;
                const metrica = ctx.measureText(conteudo);
                if (Number.isFinite(metrica.fontBoundingBoxDescent)) descida = metrica.fontBoundingBoxDescent;
              } catch (_) { /* fica o fallback proporcional */ }
              const caixaDoPai = no.parentElement.getBoundingClientRect();
              return {
                base: caixa.bottom - descida,
                texto: conteudo.replace(/\s+/g, ' ').slice(0, 24),
                fonte: estilo.fontSize,
                // A CAIXA DE LINHA de quem segura o texto: é ela que
                // explica o desvio, e sem ela o motivo manda adivinhar.
                pai: no.parentElement.getAttribute('class') || no.parentElement.tagName.toLowerCase(),
                caixa: `${caixaDoPai.top.toFixed(1)}→${caixaDoPai.bottom.toFixed(1)}px`
              };
            }
          }
          no = percorrer.nextNode();
        }
      } catch (_) { /* cabeçalho sem texto mensurável */ }
      return null;
    };

    const t8 = [];
    tabelas.forEach((tab) => {
      const linhaCabecalho = q('thead tr', tab);
      if (!linhaCabecalho) return;
      const medidas = qa('th', linhaCabecalho)
        .filter(visivel)
        .map((th) => {
          const medida = linhaDeBaseDoTexto(th);
          return medida ? { ...medida, th } : null;
        })
        .filter(Boolean);
      // Coluna de marcar/expandir não tem título: não há linha de base a
      // comparar, e isso não é defeito. Com menos de dois títulos não
      // existe comparação nenhuma.
      if (medidas.length < 2) return;
      /* Agrupa por linha de base: o grupo MAIOR é a linha da tabela, e
         quem está fora dele é o desalinhado. Comparar só maior×menor diria
         que duas colunas estão erradas quando uma está. */
      const grupos = [];
      medidas.forEach((m) => {
        const grupo = grupos.find((g) => Math.abs(g.base - m.base) <= TOLERANCIA_LINHA_BASE);
        if (grupo) grupo.itens.push(m);
        else grupos.push({ base: m.base, itens: [m] });
      });
      if (grupos.length < 2) return;
      const maioria = grupos.reduce((a, b) => (b.itens.length > a.itens.length ? b : a));
      const fora = grupos.filter((g) => g !== maioria).flatMap((g) => g.itens);
      const desvio = fora[0].base - maioria.base;
      /*
        O MOTIVO DIZ A MEDIDA, NÃO A CAUSA PRESUMIDA (05/09).

        A primeira versão terminava com uma frase fixa — "título fora de
        .app-th-alinhavel/.app-th-botao ganha caixa de linha própria" —
        porque essa era a causa do defeito que originou o item. No mesmo
        dia o CSS do `.app-th-botao` mudou duas vezes atrás dessa linha de
        base (e parou em `line-height: var(--alvo-clique)`), aquela causa
        deixou de valer e o desvio passou a vir de outro lugar — título de
        duas linhas, folha da tela com linha própria. Motivo que
        descreve a causa de ontem manda consertar onde não está quebrado.
        Agora ele entrega a CAIXA DE LINHA medida dos dois lados, que é o
        que se vê no navegador e o que leva ao conserto.
      */
      t8.push({
        motivo: `"${fora[0].texto}" assenta ${Math.abs(desvio).toFixed(1)}px `
          + `${desvio > 0 ? 'ABAIXO' : 'ACIMA'} da linha de base das outras ${maioria.itens.length} coluna(s) `
          + `(base ${fora[0].base.toFixed(1)}px contra ${maioria.base.toFixed(1)}px de "${maioria.itens[0].texto}")`
          + `${fora.length > 1 ? ` — e mais ${fora.length - 1} título(s) fora da linha` : ''}`
          + ` — a caixa de linha desse título é outra: "${fora[0].pai}" ${fora[0].caixa} contra "${maioria.itens[0].pai}" ${maioria.itens[0].caixa}`,
        seletor: cssPath(fora[0].th)
      });
    });
    r.T8 = t8.length
      ? { estado: 'FALHOU', motivo: t8.map((p) => p.motivo).join(' | '), seletor: t8[0].seletor }
      : { estado: 'PASSOU' };

    /* T2 (parte estática): cada cabeçalho tem o CONTROLE PRÓPRIO de
       alinhamento, com tooltip. Desde a leva do componente (02/09) o clique
       no título ORDENA (quando a coluna é ordenável) e o alinhamento vive
       num botão dedicado (.app-th-alinhar) ancorado à direita — por isso o
       check olha esse botão, não mais o título. A visibilidade no hover é
       medida pelo runner. */
    const alinhadores = qa('.app-th-alinhar').filter(foraDeModal);
    const titulos = qa('.app-th-alinhavel').filter(foraDeModal);
    /*
      COLUNA DE BOTÕES NÃO TEM ALINHAMENTO A ESCOLHER (05/09).

      A conta era por CONTAGEM: "menos ícones de alinhar do que títulos =
      coluna sem controle". Ela quebrou no mesmo dia em que o cabeçalho da
      coluna de AÇÕES parou de ser texto cru e passou a usar o mesmo
      embrulho das outras (conserto da linha de base, T8): o embrulho
      apareceu, o controle de alinhamento não — corretamente, porque não há
      o que alinhar numa coluna de botões — e o T2 passou a reprovar TODA
      tabela com ações, por um conserto.

      Agora a pergunta é por COLUNA e olha o conteúdo dela: título sem
      controle só é tolerado quando as células daquela coluna são barra de
      ações (`.app-actionbar`). Coluna de conteúdo sem o controle continua
      reprovando, que é o defeito que este ramo existe para pegar.
    */
    const ehColunaDeAcoes = (titulo) => {
      const th = titulo.closest('th');
      const tabela = th && th.closest('table');
      if (!th || !tabela) return false;
      const indice = Array.from(th.parentElement.children).indexOf(th);
      const totalColunas = th.parentElement.children.length;
      const celulas = qa('tbody tr', tabela)
        .filter((tr) => tr.children.length === totalColunas)
        .map((tr) => tr.children[indice])
        .filter(Boolean)
        .slice(0, 10);
      return celulas.length > 0 && celulas.every((td) => td.querySelector('.app-actionbar'));
    };
    const semControle = titulos.filter((t) => !t.querySelector('.app-th-alinhar') && !ehColunaDeAcoes(t));
    if (!titulos.length) {
      r.T2 = { estado: 'FALHOU', motivo: 'tabela sem cabeçalho de coluna do padrão (app-th-alinhavel)' };
    } else if (semControle.length) {
      r.T2 = {
        estado: 'FALHOU',
        motivo: `${semControle.length} coluna(s) sem o controle de alinhamento no cabeçalho — a primeira é "${(semControle[0].innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30)}"`,
        seletor: cssPath(semControle[0])
      };
    } else if (!alinhadores.every((b) => (b.getAttribute('title') || '').toLowerCase().includes('alinhar'))) {
      r.T2 = { estado: 'FALHOU', motivo: 'controle de alinhamento sem tooltip "Alinhar / redimensionar"' };
    } else {
      // Sinal sem capacidade também é defeito (R15 ao contrário): título que
      // vira botão precisa de fato ordenar.
      const ordenaveis = qa('.app-th-botao--ordenavel').filter(foraDeModal);
      const semIndicador = ordenaveis.filter((b) => !b.querySelector('.app-th-ordem'));
      r.T2 = semIndicador.length
        ? { estado: 'FALHOU', motivo: `${semIndicador.length} título ordenável sem indicador de ordem`, seletor: cssPath(semIndicador[0]) }
        : { estado: 'PASSOU' };
    }

    /* T4: a sobra do contêiner vai para as colunas de conteúdo — e vai para
       a coluna CERTA.

       O check só media sobra NÃO DISTRIBUÍDA (espaço vazio à direita da
       tabela). Passava com ✅ enquanto uma coluna ficava com 574px para um
       rótulo de 144px e a coluna ao lado quebrava o nome da obra em duas
       linhas: a sobra tinha sido distribuída, só que para quem não
       precisava. O revisor achou isso na captura, com a matriz aprovando.

       Segundo critério, então: célula que QUEBRA EM MAIS DE UMA LINHA
       enquanto outra coluna da mesma tabela tem folga larga é má
       distribuição — o `tipo` declarado provavelmente está errado (R17), e
       é lá que se conserta, não fixando largura à mão. */
    const t4 = [];
    tabelas.forEach((tab) => {
      const scroll = tab.closest('.resizable-table-scroll');
      if (!scroll) return;
      const folga = scroll.clientWidth - tab.getBoundingClientRect().width;
      if (folga > 40) t4.push(`${cssPath(tab)}: ${Math.round(folga)}px de sobra não distribuída`);
      /* NÃO existe ramo de "transbordo" aqui, e a ausência é deliberada.
         Uma versão anterior tentou reprovar folga negativa exigindo
         `scroll.scrollWidth <= scroll.clientWidth`, e essa condição é
         IMPOSSÍVEL: `.resizable-table-scroll` é `overflow-x: auto`, então
         tabela mais larga sempre aumenta o scrollWidth. Era um ramo que
         nunca dispararia — pior que ramo nenhum, porque dava a impressão de
         cobertura. E a premissa estava errada: rolagem horizontal ali é o
         comportamento CORRETO (R18 permite, e é o scrollport a que a coluna
         fixa gruda). O que importa medir é a DISTRIBUIÇÃO, logo abaixo. */

      // Folga POR COLUNA: quanto a coluna tem além do que seu conteúdo usa.
      const cabecalhos = Array.from(tab.querySelectorAll('thead th'));
      const folgaPorColuna = cabecalhos.map((th, i) => {
        const celulas = Array.from(tab.querySelectorAll(`tbody tr > *:nth-child(${i + 1})`)).slice(0, 40);
        if (!celulas.length) return { indice: i, folga: 0, quebra: false, titulo: th.innerText.trim() };
        const largura = th.getBoundingClientRect().width;
        let maiorConteudo = 0;
        let quebra = false;
        celulas.forEach((td) => {
          maiorConteudo = Math.max(maiorConteudo, larguraDoConteudo(td));
          // "Quebrou" é UM texto que não coube — não duas linhas empilhadas
          // de propósito pela .app-celula-dupla (ver linhasDoMesmoTexto).
          if (linhasDoMesmoTexto(td) > 1) quebra = true;
        });
        return { indice: i, titulo: th.innerText.trim(), folga: largura - maiorConteudo, quebra };
      });

      const comFolga = folgaPorColuna.filter((c) => c.folga > 200);
      const quebrando = folgaPorColuna.filter((c) => c.quebra && c.folga < 40);
      if (comFolga.length && quebrando.length) {
        t4.push(
          `${cssPath(tab)}: "${quebrando[0].titulo}" quebra em duas linhas enquanto "${comFolga[0].titulo}" `
          + `tem ${Math.round(comFolga[0].folga)}px de folga — a sobra foi para a coluna errada (confira o \`tipo\` declarado, R17)`
        );
      }
    });
    r.T4 = t4.length ? { estado: 'FALHOU', motivo: t4.join(' | ') } : { estado: 'PASSOU' };

    /* T5: identificação em MAIÚSCULAS, sublinha em caixa normal */
    const idents = qa('.celula-identidade').filter(visivel).filter(foraDeModal);
    if (!idents.length) {
      r.T5 = { estado: 'N/A', motivo: 'tela sem coluna de identificação' };
    } else {
      const errados = idents.filter((el) => getComputedStyle(el).textTransform !== 'uppercase');
      const subsErrados = qa('.celula-identidade .app-celula-dupla-sub').filter(visivel)
        .filter((el) => getComputedStyle(el).textTransform === 'uppercase');
      r.T5 = errados.length || subsErrados.length
        ? { estado: 'FALHOU', motivo: errados.length ? `identificação sem maiúsculas: ${cssPath(errados[0])}` : `sublinha em maiúsculas: ${cssPath(subsErrados[0])}` }
        : { estado: 'PASSOU' };
    }

    /* T6: o maior texto real visível não corta feio (corte sem tooltip) */
    {
      const alvos = qa('.resizable-table td, .resizable-table td .app-celula-dupla-principal, .resizable-table td .app-celula-dupla-sub')
        .filter(visivel).filter(foraDeModal)
        .filter((el) => !/R\$/.test(el.textContent));
      let pior = null;
      const soTexto = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
      alvos.forEach((el) => {
        if (el.scrollWidth > el.clientWidth + 2) {
          const tooltip = el.closest('[title]');
          // Compara sem NENHUM espaço: textContent concatena nós sem
          // separador e innerText insere espaços — não podem divergir aqui.
          const completo = tooltip && soTexto(tooltip.getAttribute('title')).includes(soTexto(el.textContent).slice(0, 20));
          if (!completo && (!pior || el.textContent.length > pior.textContent.length)) pior = el;
        }
      });
      /*
        Duas cegueiras que o revisor achou em 02/09, com a matriz aprovando:

        1) QUEBRA DE LINHA NO MEIO DA PALAVRA. `scrollWidth > clientWidth`
           só vê corte HORIZONTAL. Quando a célula não tem `white-space:
           nowrap`, a palavra que não cabe QUEBRA — "CONFIRMADA" virava
           "CONFIRM"/"ADA" — e o scrollWidth continua igual ao clientWidth.
           Palavra partida ao meio é pior que reticências: ela vira duas
           outras palavras.
        2) O CABEÇALHO nunca era medido. "COMPETÊNCIA" cortava sem tooltip e
           nenhum check olhava `th`.
      */
      const partidos = qa('.resizable-table td').filter(visivel).filter(foraDeModal)
        .filter((td) => {
          if (getComputedStyle(td).whiteSpace.includes('nowrap')) return false;
          const texto = td.innerText.trim();
          // Uma palavra só (sem espaço) ocupando mais de uma linha = partiu.
          return texto.length > 0 && !/\s/.test(texto) && linhasDeTexto(td) > 1;
        });

      /*
        NÃO existe mais ramo de "cabeçalho cortado", e a ausência é honesta.

        Ele nasceu morto DUAS vezes: a primeira perguntava se o `th` tem
        `title` — e a TabelaPadrao põe `title` em TODOS; a segunda mediu
        quebra de linha no rótulo, e a revisão de 03/09 não achou NENHUMA
        largura alcançável em que um rótulo quebre (o piso do `th` é 90px, o
        rótulo tem `overflow-wrap: anywhere` e cabe). Ou seja: exigia rótulo
        quebrado E sem tooltip — combinação que nenhuma coluna real produz.

        Ramo que não dispara é PIOR que ramo nenhum: aparece no código como
        cobertura e não cobre nada. O que de fato protege o cabeçalho é o
        piso de largura pelo título (TabelaPadrao), que dimensiona a coluna
        para o rótulo caber, mais o `title` em todo th. Se um dia um rótulo
        cortar de novo, o caminho é PROVAR o caso primeiro e só então
        escrever o ramo — nunca o contrário.
      */
      const cabecalhosCortados = [];

      const problemasT6 = [];
      if (pior) problemasT6.push(`texto cortado sem tooltip: "${pior.textContent.trim().slice(0, 50)}…"`);
      if (partidos.length) {
        /*
          O motivo tem de dizer a CAUSA, não só o sintoma (03/09). "célula
          sem nowrap" mandava mexer no `white-space` — e nas cinco telas em
          que isto reprovou o `td` já tinha `overflow: hidden` com
          `text-overflow: ellipsis`, então o palpite estava errado e teria
          levado ao conserto errado. Agora o check registra o estilo
          computado de quem QUEBROU e a geometria, para o conserto sair da
          medida e não do palpite.
        */
        const alvo = partidos[0];
        const cs = getComputedStyle(alvo);
        const dono = alvo.firstElementChild ? getComputedStyle(alvo.firstElementChild) : null;
        const geo = alvo.getBoundingClientRect();
        problemasT6.push(
          `palavra QUEBRADA ao meio: "${alvo.innerText.trim().slice(0, 40)}" `
          + `— td ${Math.round(geo.width)}px, white-space:${cs.whiteSpace}, overflow-wrap:${cs.overflowWrap}, word-break:${cs.wordBreak}, overflow:${cs.overflow}`
          + (dono ? `; filho <${alvo.firstElementChild.tagName.toLowerCase()}${classeDe(alvo.firstElementChild) ? `.${classeDe(alvo.firstElementChild).split(' ').join('.')}` : ''}> white-space:${dono.whiteSpace}, overflow-wrap:${dono.overflowWrap}, word-break:${dono.wordBreak}` : '')
        );
      }
      if (cabecalhosCortados.length) problemasT6.push(`cabeçalho cortado sem tooltip: "${cabecalhosCortados[0].innerText.trim().slice(0, 40)}"`);

      r.T6 = problemasT6.length
        ? { estado: 'FALHOU', motivo: problemasT6.join(' | '), seletor: cssPath(pior || partidos[0] || cabecalhosCortados[0]) }
        : { estado: 'PASSOU' };
    }

    /* T7: NENHUM valor monetário renderizado trunca ou vaza — pior caso
       real da base é o que estiver na tela. */
    {
      const moedas = qa('td, span, div, strong').filter(foraDeModal)
        .filter((el) => el.children.length === 0 && /R\$\s?[\d.]+/.test(el.textContent))
        .filter(visivel);
      const cortados = moedas.filter((el) => el.scrollWidth > el.clientWidth + 1);
      /*
        O CORTE HORIZONTAL NÃO É A FORMA COMUM DO DEFEITO (03/09, fixture).

        `scrollWidth > clientWidth` só acontece quando o texto NÃO PODE
        quebrar. E a célula de dinheiro do sistema pode: a coluna de valor
        é `td.celula-valor` com texto puro (as telas fazem
        `render: (i) => formatMoney(i.valor)`), e `responsive-system.css`
        dá `overflow-wrap: anywhere` a todo `td` dentro do `.layout-main`.
        Quando o valor não cabe, ele QUEBRA — "R$" numa linha e
        "12.345.678,90" na outra, ou o próprio número partido ao meio — e o
        scrollWidth continua igual ao clientWidth. Ou seja: na forma em que
        o defeito de fato aparece, a condição antiga era inalcançável.

        A T7 diz "nenhum valor monetário trunca OU VAZA". Valor partido em
        duas linhas é o "vaza": o olho lê dois números onde há um. Mesmo
        remendo que a T6 recebeu em 02/09 pela mesma cegueira.
      */
      const partidosEmLinhas = moedas.filter((el) => linhasDoMesmoTexto(el) > 1);
      const problemaT7 = cortados[0] || partidosEmLinhas[0];
      r.T7 = moedas.length === 0
        ? { estado: 'N/A', motivo: 'nenhum valor monetário na tela' }
        : cortados.length
          ? { estado: 'FALHOU', motivo: `valor truncado: "${cortados[0].textContent.trim()}" (largura ${Math.round(cortados[0].clientWidth)}px < conteúdo ${cortados[0].scrollWidth}px)`, seletor: cssPath(cortados[0]) }
          : partidosEmLinhas.length
            ? { estado: 'FALHOU', motivo: `valor monetário QUEBRADO em ${linhasDoMesmoTexto(problemaT7)} linhas: "${problemaT7.textContent.trim()}" (${Math.round(problemaT7.getBoundingClientRect().width)}px de largura)`, seletor: cssPath(problemaT7) }
            : { estado: 'PASSOU' };
    }
  }

  /* ---- F1: UMA busca, ocupando a largura ---- */
  {
    /*
      "BUSCAR" NO PLACEHOLDER NÃO É BUSCA DE LISTAGEM (04/09).

      É a lição do rótulo outra vez, já registrada na DoD: um check que
      acha o alvo pelo TEXTO cobre o vocabulário que conhece, não o
      comportamento. A F1 varria `input[placeholder*="uscar"]` e pegava os
      AUTOCOMPLETES de formulário — "Digite para buscar a categoria",
      "Digite para buscar o credor" —, que não filtram listagem nenhuma:
      escolhem um registro para um campo. A `FinanceiroTituloNovo`
      reprovou com "2 caixas de busca no mesmo contexto (R16)" tendo UMA
      busca e dois campos de escolha.

      A R16 fala da busca que RECORTA o que está na tela. Campo de
      formulário — o que mora dentro de `.form-group`/`.form-campo`/
      `label.field` — está fora do escopo por natureza, e a exclusão é
      pelo PAPEL do elemento, não por mais uma palavra na lista.
    */
    const ehCampoDeFormulario = (el) => Boolean(
      el.closest('.form-group, .form-campo, label.field, .campo-form')
    );
    /*
      `.app-busca` NÃO ENTRA AQUI — e eu a acrescentei hoje, por engano.

      Ela é classe de LARGURA ("ocupa a faixa, 220–480px"), não de papel.
      Na `TiposSolicitacao` ela veste um `<label>` que embrulha um `<select>`
      de CONTEXTO (o setor listado), e na `TiposSubContrato` um campo que
      não filtra listagem. Ao pô-la no seletor, a F1 passou a contar essas
      duas como caixa de busca e reprovou as duas telas — que passavam nas
      duas rodadas anteriores.

      É exatamente o erro que esta mesma função descreve três linhas abaixo:
      achar o alvo pela FORMA em vez do papel. Cometi-o no mesmo commit em
      que escrevi o comentário contra ele.
    */
    const buscas = qa('.la-busca, input[placeholder*="uscar"]')
      .filter(visivel).filter(foraDeModal)
      .filter((el) => !ehCampoDeFormulario(el))
      .filter((el) => !el.closest('.la-busca') || el.classList.contains('la-busca'));
    if (!buscas.length) {
      r.F1 = { estado: 'N/A', motivo: 'tela sem busca' };
    } else if (buscas.length > 1) {
      r.F1 = { estado: 'FALHOU', motivo: `${buscas.length} caixas de busca no mesmo contexto (R16)`, seletor: cssPath(buscas[1]) };
    } else {
      const caixa = buscas[0];
      const pai = caixa.closest('.app-bloco-corpo, .app-bloco, .app-filtros') || caixa.parentElement;
      /*
        A LARGURA DISPONÍVEL É A CAIXA DE CONTEÚDO, NÃO A DE BORDA (04/09).

        A comparação era contra `getBoundingClientRect()` do pai, que INCLUI
        o padding dele. Num painel de 320px com `px-4` (16px de cada lado),
        sobram 288px para o filho — exatos 90% — e qualquer arredondamento
        reprovava. Na prática o check passou a proibir padding em contêiner
        estreito, que não é o que a R3 pede.

        O que a regra quer saber é se a busca ocupa o espaço DISPONÍVEL.
        Espaço disponível é a caixa de conteúdo: largura menos os paddings.
      */
      const cs = getComputedStyle(pai);
      const disponivel = pai.getBoundingClientRect().width
        - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      /*
        A BUSCA NÃO PODE PASSAR DO TETO QUE A PRÓPRIA R3 LHE DÁ (04/09).

        A R3 diz que a busca ocupa a faixa ENTRE 220 e 480px — o teto é
        parte da regra: caixa de texto de 1800px é pior de ler, não melhor.
        O check exigia 90% da faixa e reprovava a `tipos-solicitacao` com
        "busca com 480px não ocupa a largura disponível (1848px livres)" —
        480px É o máximo que ela pode ter.

        Cobrar de um elemento mais do que a regra permite a ele é o check
        brigando com a regra que ele deveria verificar. Agora o alvo é o
        MENOR entre a faixa disponível e o teto do próprio elemento.
      */
      const teto = parseFloat(getComputedStyle(caixa).maxWidth);
      const alvo = Number.isFinite(teto) ? Math.min(disponivel, teto) : disponivel;
      const larguraCaixa = caixa.getBoundingClientRect().width;
      /*
        A R3 TEM PISO E TETO, e o check só media um lado.

        "Ocupa a faixa, 220–480px": abaixo de 220 a caixa é apertada demais
        para o termo caber; acima de 480 é pior de ler, não melhor. Medir só
        "encheu a faixa?" reprovava a busca que está no TETO (defeito
        nenhum) e aprovava a que está abaixo do PISO (defeito de verdade,
        que a fixture planta com 180px).

        Agora reprova pelos dois lados, e cada um com o seu motivo. O piso
        cede quando não há espaço: numa faixa de 200px não dá para exigir
        220.
      */
      const piso = Math.min(220, disponivel);
      const abaixoDoPiso = larguraCaixa < piso - 2;
      const ocupa = larguraCaixa >= alvo * 0.9;
      r.F1 = abaixoDoPiso
        ? { estado: 'FALHOU', motivo: `busca com ${Math.round(larguraCaixa)}px abaixo do piso de ${Math.round(piso)}px da R3 — apertada demais para o termo caber`, seletor: cssPath(caixa) }
        : ocupa
        ? { estado: 'PASSOU' }
        : { estado: 'FALHOU', motivo: `busca com ${Math.round(caixa.getBoundingClientRect().width)}px não ocupa o alvo de ${Math.round(alvo)}px (faixa livre ${Math.round(disponivel)}px, teto do elemento ${Number.isFinite(teto) ? Math.round(teto) + 'px' : 'sem teto'})`, seletor: cssPath(caixa) };
    }
  }

  /* ---- F2: nenhum select na faixa de filtros ---- */
  {
    const selects = qa('.app-filtros select, .la-filtros-linha select').filter(visivel);
    r.F2 = selects.length
      ? { estado: 'FALHOU', motivo: 'select de filtro na faixa (R12: filtro é marcação)', seletor: cssPath(selects[0]) }
      : { estado: 'PASSOU' };
  }

  /* ---- F4: vão filtros → tabela pela escala (16px) ---- */
  {
    const filtros = qa('.app-filtros').filter(visivel).filter(foraDeModal);
    if (!filtros.length) {
      r.F4 = { estado: 'N/A', motivo: 'tela sem linha de filtros' };
    } else {
      const problemas = [];
      filtros.forEach((f) => {
        let prox = f.nextElementSibling;
        while (prox && !visivel(prox)) prox = prox.nextElementSibling;
        if (!prox) return;
        const gap = prox.getBoundingClientRect().top - f.getBoundingClientRect().bottom;
        if (gap < 12 || gap > 24) problemas.push(`${Math.round(gap)}px entre filtros e ${cssPath(prox)} (esperado 16px)`);
      });
      r.F4 = problemas.length ? { estado: 'FALHOU', motivo: problemas.join(' | ') } : { estado: 'PASSOU' };
    }
  }

  /* ---- B1: canvas acinzentado + blocos brancos ---- */
  {
    /*
      `.login-card` entra na lista (03/09): fora do shell, o cartão de marca
      do Login É o bloco branco sobre o canvas — a B1 reprovava a tela por
      ele não se chamar `.app-bloco`, medindo o NOME e não a coisa.
    */
    const bloco = qa('.app-bloco, .card, .login-card').filter(visivel)[0];
    if (!bloco) {
      r.B1 = { estado: 'FALHOU', motivo: 'nenhum bloco na tela' };
    } else {
      /*
        A COR DO BLOCO É A QUE SE VÊ, NÃO A QUE ESTÁ DECLARADA (03/09).

        A versão anterior lia `getComputedStyle(bloco).backgroundColor`
        cru. Bloco que PERDEU a superfície — `background: transparent`, o
        jeito mais comum de a regressão acontecer — devolvia
        "rgba(0, 0, 0, 0)", que é diferente da cor do canvas por
        comparação de texto, e o check aprovava. Só que na tela o canvas
        aparece ATRAVÉS dele: o bloco é o canvas. Provado com fixture.

        Agora as duas pontas usam a mesma régua: a primeira cor OPACA a
        partir do elemento (para o bloco, incluindo ele; para o canvas,
        começando no pai). Bloco transparente cai na cor do canvas e as
        duas coincidem — que é exatamente o defeito.
      */
      const primeiraCorOpaca = (partida) => {
        let atual = partida;
        while (atual && atual !== document.documentElement) {
          const c = getComputedStyle(atual).backgroundColor;
          if (c && c !== 'rgba(0, 0, 0, 0)' && !/rgba\([\d ,.]+, 0\)/.test(c)) return c;
          atual = atual.parentElement;
        }
        return getComputedStyle(document.body).backgroundColor;
      };
      const cBloco = primeiraCorOpaca(bloco);
      const cCanvas = primeiraCorOpaca(bloco.parentElement);
      const estilo = getComputedStyle(bloco);
      const proprio = estilo.backgroundColor;
      /*
        SUPERFÍCIE TAMBÉM VEM DE `background-image` (04/09).

        O check lia SÓ `background-color` e reprovou o `.login-card` dizendo
        "bloco SEM superfície própria (background transparente)". O cartão
        do login tem superfície: ela é um gradiente quase opaco
        (`linear-gradient(rgba(255,255,255,.98), rgba(245,250,255,.985))`),
        declarado em `background`, que cai em `background-image` — e deixa
        `background-color` em `rgba(0,0,0,0)`.

        É o erro de sempre em forma nova: medir UMA propriedade quando a
        coisa pode vir de outra. O que a B1 quer saber é se o bloco tem
        superfície própria; gradiente é superfície. Quando ela vem de
        imagem, a comparação por string de cor não se aplica — o check diz
        isso em vez de fingir que mediu.
      */
      const temImagem = estilo.backgroundImage && estilo.backgroundImage !== 'none';
      const transparente = !proprio || proprio === 'rgba(0, 0, 0, 0)' || /rgba\([\d ,.]+, 0\)/.test(proprio);
      r.B1 = cCanvas && cCanvas !== cBloco
        ? { estado: 'PASSOU' }
        : temImagem
          ? { estado: 'PASSOU', motivo: 'superfície do bloco vem de background-image (gradiente), não de background-color' }
          : {
            estado: 'FALHOU',
            motivo: transparente
              ? `bloco SEM superfície própria (background transparente): o canvas (${cCanvas}) aparece através dele`
              : `canvas (${cCanvas || 'transparente'}) não se distingue do bloco (${cBloco})`
          };
    }
  }

  /* ---- B2: um primário com barra de cor; secundários neutros ---- */
  {
    const blocos = qa('.app-bloco').filter(visivel).filter(foraDeModal);
    if (!blocos.length) {
      r.B2 = { estado: 'N/A', motivo: 'tela de registro com composição própria (sem blocos padrão)' };
    } else {
      const primarios = blocos.filter((b) => b.classList.contains('app-bloco--primario'));
      r.B2 = primarios.length === 1
        ? { estado: 'PASSOU' }
        : { estado: 'FALHOU', motivo: `${primarios.length} bloco(s) primário(s) visível(is) (esperado 1)` };
    }
  }

  /* ---- B3: informação uma vez só (apoio da faixa não repete no bloco) ---- */
  {
    const normTexto = (el) => el.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
    const leadFaixa = faixa && q('.app-page-lead', faixa);
    const leadsBloco = qa('.app-bloco-lead').filter(visivel);
    /*
      CONTAGEM QUE COINCIDE NÃO É APOIO REPETIDO (04/09).

      A comparação por CONTINÊNCIA acusava dois casos que não são defeito:

        faixa "6 conta(s) · 204 categoria(s) · Base de contas…"  bloco "6 conta(s)"
        faixa "41 obra(s) · Visao financeira consolidada…"       bloco "41"

      O bloco diz quantos itens ELE lista, e por acaso é o mesmo número da
      faixa. Acusar `"41"` como apoio repetido é medir coincidência de
      substring, não repetição de informação — e mandaria a tela APAGAR uma
      contagem correta.

      O que a B3 quer impedir é a mesma FRASE em dois lugares. Então o
      trecho comum precisa ser substancial: pelo menos 24 caracteres e mais
      de três palavras. Contagem sozinha não passa nesse crivo; descrição
      copiada, sim.
    */
    const substancial = (t) => t.length >= 24 && t.split(/\s+/).filter(Boolean).length > 3;
    const dup = leadFaixa && leadsBloco.find((b) => {
      const a = normTexto(leadFaixa); const c = normTexto(b);
      if (!a || !c) return false;
      if (a === c) return true;
      const menor = a.length <= c.length ? a : c;
      const maior = a.length <= c.length ? c : a;
      return maior.includes(menor) && substancial(menor);
    });
    /*
      O MOTIVO PRECISA TRAZER O TEXTO (04/09). "Apoio da faixa repetido em
      bloco" mais um seletor não basta para consertar: a comparação é por
      CONTINÊNCIA (um contém o outro), então o par que casou pode ser um
      trecho curto dentro de uma frase longa, e sem ver os dois lados não
      dá para saber qual dos textos sai. Duas telas do Financeiro
      reprovaram aqui e nenhuma pôde ser corrigida pela leitura do código.
    */
    r.B3 = dup
      ? {
        estado: 'FALHOU',
        motivo: `apoio da faixa repetido em bloco — faixa: "${normTexto(leadFaixa).slice(0, 160)}" | bloco: "${normTexto(dup).slice(0, 160)}"`,
        seletor: cssPath(dup)
      }
      : { estado: 'PASSOU' };
  }

  /* ---- B4: campo vazio some com contador ---- */
  if (tipo === 'detalhe') {
    const toggle = qa('.app-campos-toggle').filter(visivel);
    const temCampos = qa('.app-stat, [class*="app-campos"]').length > 0;
    if (!temCampos) {
      r.B4 = { estado: 'N/A', motivo: 'tela sem grid de campos' };
    } else {
      const vazios = qa('.app-stat--vazio').filter(visivel);
      r.B4 = vazios.length && !toggle.length
        ? { estado: 'FALHOU', motivo: `${vazios.length} campo(s) vazio(s) exibido(s) sem alternador` }
        : { estado: 'PASSOU' };
    }
  } else {
    r.B4 = { estado: 'N/A', motivo: 'não é tela de detalhe' };
  }

  /* ---- B5: nenhum texto solto fora de superfície ---- */
  {
    const superficies = '.app-page-header, .app-bloco, .card, .app-summary-card, .app-stat, .empty-state, [role="dialog"], table, .app-tabela-cards, .obra-tab-btn, nav, header, aside, .app-filtros';
    const soltos = qa('.app-pagina > p, .app-pagina > span, .app-pagina > div > p')
      .filter(visivel)
      .filter((el) => el.textContent.trim().length > 0)
      .filter((el) => !el.closest(superficies));
    r.B5 = soltos.length
      ? { estado: 'FALHOU', motivo: `texto solto: "${soltos[0].textContent.trim().slice(0, 40)}…"`, seletor: cssPath(soltos[0]) }
      : { estado: 'PASSOU' };
  }

  /* ---- M1: alvo mínimo 32px ---- */
  {
    /*
      A EXCLUSAO ERA POR TAG, E TAG NAO E CHROME (05/09).

      O filtro tirava tudo que estivesse dentro de QUALQUER `<nav>`. A
      intencao era nao cobrar alvo minimo do menu e da topbar, que sao a
      moldura do sistema e nao a tela. So que `<nav>` tambem e o elemento
      certo para navegacao DENTRO da pagina: as abas de Custos e Recebiveis,
      o passo a passo do planejamento, a paginacao da tabela, a grade de
      modulos da Home. Tudo isso ficava sem cobranca de alvo.

      Achado na migracao da Home: o "x" que oculta um modulo tem 22x22px, na
      PRIMEIRA tela do sistema, e o M1 nunca o viu porque os cards moram num
      `<nav aria-label="Modulos do sistema">`. Regra que se aplica pela tag
      isenta o que ela nao queria isentar.

      Agora a excecao nomeia a MOLDURA: a topbar real (`.fx-topbar`), a
      trilha, a fileira de atalhos do topo e as duas classes antigas de
      casca. O que esta na pagina responde pelo alvo minimo, esteja em
      `<nav>` ou nao.
    */
    const MOLDURA_DO_SISTEMA = '.fx-topbar, .fx-breadcrumb, .fx-atalhos-fileira, .sidebar, .topbar-shell';
    const clicaveis = qa('button, a.btn, [role="button"]').filter(visivel).filter(foraDeModal)
      .filter((el) => !el.closest(MOLDURA_DO_SISTEMA));
    const pequenos = clicaveis.filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width < 31.5 || rect.height < 31.5;
    });
    r.M1 = pequenos.length
      ? { estado: 'FALHOU', motivo: `${pequenos.length} alvo(s) < 32px; primeiro: ${cssPath(pequenos[0])} (${Math.round(pequenos[0].getBoundingClientRect().width)}×${Math.round(pequenos[0].getBoundingClientRect().height)}px)` }
      : { estado: 'PASSOU' };
  }

  /* ---- M3: contraste AA (amostra dos textos estruturais) ---- */
  {
    const parse = (c) => {
      const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
    };
    const lum = ([r2, g, b]) => {
      const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r2) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const fundoDe = (el) => {
      let atual = el;
      while (atual && atual !== document.documentElement) {
        const c = parse(getComputedStyle(atual).backgroundColor);
        if (c && c[3] > 0.9) return c;
        atual = atual.parentElement;
      }
      return [255, 255, 255, 1];
    };
    const amostra = qa('.page-title, .app-page-lead, .app-bloco-titulo, .app-bloco-lead, th, td, .btn, .app-stat-label, .app-stat-valor, label')
      .filter(visivel).filter(foraDeModal).slice(0, 120);
    const reprovados = [];
    amostra.forEach((el) => {
      const cs = getComputedStyle(el);
      const cor = parse(cs.color);
      if (!cor) return;
      const fundo = fundoDe(el);
      const l1 = lum(cor); const l2 = lum(fundo);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const fs = parseFloat(cs.fontSize);
      const grande = fs >= 24 || (fs >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
      const minimo = grande ? 3 : 4.5;
      if (ratio < minimo && el.textContent.trim()) {
        reprovados.push(`${cssPath(el)} (${ratio.toFixed(2)}:1)`);
      }
    });
    r.M3 = reprovados.length
      ? { estado: 'FALHOU', motivo: `contraste abaixo de AA: ${reprovados.slice(0, 3).join(' | ')}` }
      : { estado: 'PASSOU' };
  }

  /* ---- M4: previsto azul × realizado vermelho, cor da série coerente ---- */
  {
    const parse = (c) => {
      const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
      return m ? [+m[1], +m[2], +m[3]] : null;
    };
    const prevTexto = qa('.texto-previsto').filter(visivel).map((el) => parse(getComputedStyle(el).color)).filter(Boolean);
    const realTexto = qa('.texto-realizado').filter(visivel).map((el) => parse(getComputedStyle(el).color)).filter(Boolean);
    const prevFundo = qa('.serie-prevista').filter(visivel).map((el) => parse(getComputedStyle(el).backgroundColor)).filter(Boolean);
    const realFundo = qa('.serie-realizada').filter(visivel).map((el) => parse(getComputedStyle(el).backgroundColor)).filter(Boolean);
    const todos = prevTexto.length + realTexto.length + prevFundo.length + realFundo.length;
    if (!todos) {
      r.M4 = { estado: 'N/A', motivo: 'tela sem comparação previsto × realizado' };
    } else {
      const problemas = [];
      const azul = ([r2, , b]) => b > r2;
      const vermelho = ([r2, , b]) => r2 > b;
      const mesma = (lista) => lista.every((c) => c.join() === lista[0].join());
      if (![...prevTexto, ...prevFundo].every(azul)) problemas.push('série prevista não é azul');
      if (![...realTexto, ...realFundo].every(vermelho)) problemas.push('série realizada não é vermelha');
      if (prevTexto.length > 1 && !mesma(prevTexto)) problemas.push('cores diferentes na mesma série prevista');
      if (realTexto.length > 1 && !mesma(realTexto)) problemas.push('cores diferentes na mesma série realizada');
      r.M4 = problemas.length ? { estado: 'FALHOU', motivo: problemas.join('; ') } : { estado: 'PASSOU' };
    }
  }

  /* ---- R2: campos da mesma linha alinhados (formulários visíveis) ---- */
  {
    const grids = qa('.form-grid, form .grid').filter(visivel);
    if (!grids.length) {
      r.R2 = { estado: 'N/A', motivo: 'tela sem formulário visível (cadastro em modal é medido ao abrir)' };
    } else {
      const problemas = [];
      grids.forEach((g) => {
        const campos = qa('input, select, textarea', g).filter(visivel)
          .filter((el) => el.type !== 'checkbox' && el.type !== 'radio' && el.tagName !== 'TEXTAREA');
        const porLinha = new Map();
        campos.forEach((c) => {
          const top = Math.round(c.getBoundingClientRect().top / 8) * 8;
          if (!porLinha.has(top)) porLinha.set(top, []);
          porLinha.get(top).push(c);
        });
        porLinha.forEach((linha) => {
          if (linha.length < 2) return;
          const alturas = linha.map((c) => Math.round(c.getBoundingClientRect().height));
          if (Math.max(...alturas) - Math.min(...alturas) > 2) {
            problemas.push(`alturas ${alturas.join('/')}px na mesma linha (${cssPath(linha[0])})`);
          }
        });
      });
      r.R2 = problemas.length ? { estado: 'FALHOU', motivo: problemas.slice(0, 2).join(' | ') } : { estado: 'PASSOU' };
    }
  }

  return r;
}

/** Geometria da faixa após rolagem (chamado com a página ROLADA). */
export function checkFaixaRolada() {
  /* `classeDe` se repete em cada função porque cada uma é serializada
     inteira para dentro da página pelo `page.evaluate` — helper de módulo
     não atravessa essa fronteira (ReferenceError em execução, com o build
     passando). className de elemento SVG é objeto, não string. */
  const classeDe = (el) => {
    if (!el) return '';
    const cru = el.className;
    if (cru && typeof cru !== 'string' && typeof cru.baseVal === 'string') return cru.baseVal;
    return typeof cru === 'string' ? cru : '';
  };
  const topbar = document.querySelector('.fx-topbar, .topbar-shell');
  const faixa = document.querySelector('.layout-main .app-page-header');
  if (!topbar || !faixa) return { ok: false, motivo: 'topbar ou faixa ausente' };
  const rt = topbar.getBoundingClientRect();
  const rf = faixa.getBoundingClientRect();
  const vao = rf.top - rt.bottom;
  const csFaixa = getComputedStyle(faixa);
  const alphaMatch = csFaixa.backgroundColor.match(/rgba?\([\d.,\s]+?,\s*([\d.]+)\)$/);
  const opaca = !alphaMatch || parseFloat(alphaMatch[1]) >= 0.99;
  // Conteúdo visível no vão? Amostra elementFromPoint na linha média do vão.
  let conteudoNoVao = null;
  if (vao > 1) {
    const y = rt.bottom + vao / 2;
    for (const frac of [0.2, 0.5, 0.8]) {
      const x = rf.left + rf.width * frac;
      const el = document.elementFromPoint(x, y);
      if (el && !el.closest('.topbar-shell, .app-page-header, .sidebar, nav')) {
        conteudoNoVao = el.tagName + '.' + classeDe(el).split(/\s+/)[0];
        break;
      }
    }
  }
  // Cabeçalho PADRÃO (PageHeader) tem a sentinela de compactação logo antes;
  // cabeçalho custom (ex.: gestão da obra, com métricas e abas) gruda e não
  // pode ter vão, mas não compacta — o check respeita a diferença.
  const sentinela = faixa.previousElementSibling;
  const padrao = !!(sentinela && sentinela.tagName === 'SPAN' && sentinela.getAttribute('aria-hidden') === 'true');
  return {
    ok: true,
    vao: Math.round(vao * 10) / 10,
    opaca,
    conteudoNoVao,
    padrao,
    compacto: faixa.classList.contains('app-page-header--compacto'),
    alturaFaixa: Math.round(rf.height),
    visivel: rf.bottom > 0 && rf.top < innerHeight
  };
}

/** Checks de mobile (viewport 390). */
export function checksMobile() {
  /* `classeDe` se repete em cada função porque cada uma é serializada
     inteira para dentro da página pelo `page.evaluate` — helper de módulo
     não atravessa essa fronteira (ReferenceError em execução, com o build
     passando). className de elemento SVG é objeto, não string. */
  const classeDe = (el) => {
    if (!el) return '';
    const cru = el.className;
    if (cru && typeof cru !== 'string' && typeof cru.baseVal === 'string') return cru.baseVal;
    return typeof cru === 'string' ? cru : '';
  };
  const r = {};
  const qa = (sel) => Array.from(document.querySelectorAll(sel));
  const visivel = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  /* X1: tabela vira cards */
  const tabelas = qa('.resizable-table').filter(visivel);
  const cards = qa('.app-tabela-cards').filter(visivel);
  const laCards = qa('.la-cards, .la-card').filter(visivel);
  if (!tabelas.length && !cards.length && !laCards.length) {
    // Mesma distinção da T1–T7 (03/09): base vazia é NÃO-PROVADO, não N/A.
    const vazia = qa('.empty-state').filter(visivel)[0];
    r.X1 = vazia
      ? { estado: 'SEM DADO', motivo: 'a tela TEM lista, mas a base do preview não devolveu linha — a virada para cards em 390px NÃO FOI PROVADA' }
      : { estado: 'N/A', motivo: 'tela sem tabela/lista tabular' };
  } else {
    r.X1 = tabelas.length
      ? { estado: 'FALHOU', motivo: 'tabela desktop ainda visível em 390px (não virou cards)' }
      : { estado: 'PASSOU' };
  }

  /* X3: nada estoura a largura.

     A CONDIÇÃO ANTIGA ERA IMPOSSÍVEL (03/09, achado por fixture).
     Ela abria com `document.scrollingElement.scrollWidth > innerWidth`, e
     `styles/responsive-system.css` declara, de propósito:

         html, body, #root { overflow-x: clip }

     com o comentário "as tabelas deliberadamente largas continuam largas,
     mas passam a rolar dentro do próprio bloco em vez de deslocar o
     documento inteiro". Com `clip` no documento, o transbordo é RECORTADO:
     o `scrollWidth` do documento NUNCA passa da janela. O ramo de dentro —
     que já sabia procurar o elemento culpado — só rodava depois de uma
     porta que não abre. Resultado: X3 verde em toda tela, sem nunca ter
     olhado nada. É o mesmo defeito da R18 que varria só CSS.

     A medida honesta é a GEOMETRIA DOS ELEMENTOS: alguém desenhado além da
     borda direita da janela estoura a largura, esteja o transbordo
     recortado ou não — recortado é pior, porque o conteúdo some sem deixar
     rolagem. Rolagem horizontal continua permitida onde é projetada: um
     scrollport de verdade (`overflow-x: auto|scroll`), como o
     `.resizable-table-scroll` da tabela. */
  const doc = document.scrollingElement || document.documentElement;
  const dentroDeScrollportHorizontal = (el) => {
    let atual = el.parentElement;
    while (atual && atual !== document.documentElement) {
      const cs = getComputedStyle(atual);
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return true;
      atual = atual.parentElement;
    }
    return false;
  };
  /*
    DOIS TRANSBORDOS QUE NÃO SÃO DEFEITO (04/09) — achados no login.

    (a) INTERNO DE SVG. O fundo do login é um `<svg viewBox="0 0 1920 …"
        preserveAspectRatio="xMidYMax slice">` de largura 100%: numa janela
        de 390px o navegador ESCALA a cena para cobrir e recorta as bordas
        — é o que `slice` significa e é o motivo de existir. Os `<rect>`
        dentro dela têm caixa de 1204px na tela, e o X3 reprovava por isso.
        Caixa de filho de SVG é coordenada de DESENHO, não de layout: o
        recorte é do viewport do próprio SVG, não da página. Enquanto a
        caixa do `<svg>` couber, o que está dentro não estoura nada.

    (b) SUBÁRVORE `aria-hidden="true"`. É decoração DECLARADA. Se por acaso
        houver conteúdo de verdade ali, o defeito é outro e pior (a A1 e o
        leitor de tela é que respondem), não "transbordo horizontal".

    Os dois são guardas de ESCOPO, não exceções: o X3 pergunta se CONTEÚDO
    some sem rolagem. Nenhum dos dois é conteúdo.
  */
  const dentroDeSvgQueCabe = (el) => {
    const svg = el.closest && el.closest('svg');
    if (!svg || svg === el) return false;
    return svg.getBoundingClientRect().right <= innerWidth + 2;
  };
  const decorativo = (el) => !!(el.closest && el.closest('[aria-hidden="true"]'));
  const estourando = qa('body *').filter((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.right <= innerWidth + 2 || rect.width <= 40) return false;
    if (!visivel(el)) return false;
    if (dentroDeSvgQueCabe(el) || decorativo(el)) return false;
    return !dentroDeScrollportHorizontal(el);
  });
  if (estourando.length || doc.scrollWidth > innerWidth + 1) {
    /* Nomear o CULPADO, não o primeiro atingido: um filho de largura fixa
       estica os pais E os irmãos (num grid, a faixa do topo passa a ter a
       largura da trilha), e apontar o `<header>` esticado manda o conserto
       para o lugar errado. Entre os que não contêm nenhum outro faltoso —
       as folhas do transbordo — vale o que vai MAIS LONGE: é ele quem
       define a largura de todos os outros. */
    const folhas = estourando.filter((el) => !estourando.some((outro) => outro !== el && el.contains(outro)));
    const alvo = folhas.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0]
      || estourando[0];
    const nome = alvo
      ? alvo.tagName + '.' + classeDe(alvo).split(/\s+/).filter(Boolean).slice(0, 2).join('.')
      : '';
    /*
      A FOLHA NEM SEMPRE É A CULPADA (04/09).

      O check nomeia a folha do transbordo — quem vai mais longe e não
      contém outro faltoso — porque num transbordo por largura fixa é ela
      que define a largura de todos. Só que um filho com `width: 100%`
      também aparece como folha, e aí ele é a VÍTIMA: quem manda é o
      ancestral que estourou primeiro. Foi o caso do
      `BUTTON.btn.btn-primary` a 775px numa janela de 390px, que mandou o
      conserto para o botão em vez de para o contêiner.

      Agora o motivo traz os DOIS extremos da cadeia: a folha e o ancestral
      mais externo que também estoura, com a largura de cada um. O conserto
      quase sempre é no de fora.
    */
    const externo = estourando
      .filter((el) => el !== alvo && el.contains(alvo))
      .sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)
      .pop();
    const cadeia = externo
      ? ` — ancestral mais externo que também estoura: ${externo.tagName}.${classeDe(externo).split(/\s+/).filter(Boolean).slice(0, 2).join('.')} com ${Math.round(externo.getBoundingClientRect().width)}px; o conserto costuma ser NELE, não na folha`
      : '';
    r.X3 = {
      estado: 'FALHOU',
      motivo: alvo
        ? `${nome} vai até ${Math.round(alvo.getBoundingClientRect().right)}px numa viewport de ${innerWidth}px`
        + `${doc.scrollWidth <= innerWidth + 1 ? ' — o transbordo é RECORTADO por overflow-x: clip, então some sem rolagem' : ''}`
        + cadeia
        : `página com ${doc.scrollWidth}px em viewport de ${innerWidth}px`
    };
  } else {
    r.X3 = { estado: 'PASSOU' };
  }

  return r;
}

/**
 * R18 / A1 — checks que precisam do DOM real.
 *
 * R18: `overflow: hidden` em QUALQUER ancestral de tabela, faixa fixa ou
 * coluna fixa cria um contexto de rolagem e MATA o `position: sticky` — em
 * silêncio, sem erro no console e sem falhar build. Já derrubou a faixa do
 * topo (.rhdp-page) e a coluna fixa da auditoria (.ao-financial). Quando é
 * preciso cortar, o certo é `overflow: clip`, que corta sem criar
 * scrollport. Este check anda a cadeia de ancestrais e nomeia o culpado.
 *
 * A1: toda linha acionável precisa de caminho por TECLADO — quem não usa
 * mouse não pode perder a ação.
 */
export function checkStickyEAcessibilidade() {
  const r = {};
  const qa = (sel) => Array.from(document.querySelectorAll(sel));
  const cssPath = (el) => {
    if (!el) return '';
    const partes = [];
    let atual = el;
    while (atual && atual !== document.documentElement && partes.length < 4) {
      let p = atual.tagName.toLowerCase();
      // Mesmo cuidado com SVG do outro cssPath: className de SVG é objeto.
      const cru = atual.className;
      const texto = cru && typeof cru !== 'string' && typeof cru.baseVal === 'string'
        ? cru.baseVal : (typeof cru === 'string' ? cru : '');
      const cls = texto.split(/\s+/).filter(Boolean).slice(0, 2).join('.');
      if (cls) p += `.${cls}`;
      partes.unshift(p);
      atual = atual.parentElement;
    }
    return partes.join(' > ');
  };

  /* ---- R18: ancestral que sequestra o sticky ----
     PRECISÃO IMPORTA: um elemento sticky gruda no SCROLLPORT MAIS PRÓXIMO.
     Só quebra quem estiver ENTRE o elemento e esse scrollport — ancestral
     ACIMA dele é irrelevante. Marcar acima seria falso positivo (a primeira
     versão deste check marcou 10 telas assim, por olhar o
     `.app-table-shell` que fica acima do `.resizable-table-scroll`).

     - faixa fixa (.app-page-header): gruda na JANELA → qualquer ancestral
       com overflow hidden/auto/scroll até o topo a quebra;
     - coluna fixa (td/th.celula-fixa): gruda no .resizable-table-scroll →
       só o que estiver ANTES dele conta. */
  const culpados = [];

  qa('.layout-main .app-page-header').forEach((alvo) => {
    let atual = alvo.parentElement;
    while (atual && atual !== document.documentElement) {
      const cs = getComputedStyle(atual);
      if ([cs.overflow, cs.overflowX, cs.overflowY].includes('hidden')) {
        culpados.push(`${cssPath(atual)} (overflow hidden) sobre a faixa fixa ${cssPath(alvo)}`);
        break;
      }
      atual = atual.parentElement;
    }
  });

  qa('.app-tabela td.celula-fixa, .app-tabela th.celula-fixa').forEach((alvo) => {
    let atual = alvo.parentElement;
    while (atual && atual !== document.documentElement) {
      // Chegou ao scrollport pretendido: daqui para cima não afeta.
      if (atual.classList.contains('resizable-table-scroll')) break;
      const cs = getComputedStyle(atual);
      if ([cs.overflow, cs.overflowX, cs.overflowY].includes('hidden')) {
        culpados.push(`${cssPath(atual)} (overflow hidden) sobre a coluna fixa ${cssPath(alvo)}`);
        break;
      }
      atual = atual.parentElement;
    }
  });

  const fixos = [...qa('.layout-main .app-page-header'), ...qa('.app-tabela td.celula-fixa')];
  r.R18 = fixos.length === 0
    ? { estado: 'N/A', motivo: 'tela sem elemento fixo (faixa, tabela ou coluna fixa)' }
    : culpados.length
      ? { estado: 'FALHOU', motivo: `overflow hidden mata o sticky: ${culpados.slice(0, 2).join(' | ')} — use overflow: clip`, seletor: culpados[0] }
      : { estado: 'PASSOU' };

  /* ---- A1: linha acionável alcançável por teclado ---- */
  const linhasClicaveis = qa('.app-tabela-linha--clicavel');
  if (!linhasClicaveis.length) {
    // Sem linha clicável: a tela ainda precisa ter os controles focáveis,
    // mas isso já é coberto por M1/estrutura — aqui é N/A honesto.
    r.A1 = { estado: 'N/A', motivo: 'tela sem linha acionável' };
  } else {
    const semFoco = linhasClicaveis.filter((tr) => {
      const tabIndex = tr.getAttribute('tabindex');
      const temFocoProprio = tabIndex !== null && Number(tabIndex) >= 0;
      // Alternativa aceitável: um controle focável DENTRO da linha que faça
      // a mesma ação (link ou botão de abrir).
      const controleInterno = tr.querySelector('a[href], button:not([disabled])');
      return !temFocoProprio && !controleInterno;
    });
    r.A1 = semFoco.length
      ? { estado: 'FALHOU', motivo: `${semFoco.length} linha(s) acionável(is) sem caminho por teclado (sem tabindex e sem link/botão dentro)`, seletor: cssPath(semFoco[0]) }
      : { estado: 'PASSOU' };
  }

  return r;
}
