import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFecharAoSair } from '../../hooks/useFecharAoSair';
import { usePosicaoFlutuante } from '../../hooks/usePosicaoFlutuante';
import {
  TIPO_FILTROS,
  usePreferenciaDeLista,
  usePreferencias
} from '../../contexts/PreferenciasContext';

/* =====================================================================
   PAINEL "QUAIS FILTROS APARECEM" — UMA SUPERFÍCIE PARA AS TRÊS TELAS
   (05/09, fechamento do N53)
   ---------------------------------------------------------------------
   O QUE FOI MEDIDO. Três telas do sistema oferecem escolher quais filtros
   aparecem — Consulta de títulos (15 filtros, servindo 3 endereços:
   `/financeiro/titulos`, `?tipo=pagar` e `?tipo=receber`), Solicitações
   (12, no painel avançado) e Provisionamentos (8 escondíveis + a busca).
   Cinco endereços no total, e as três faziam a MESMA coisa de três
   maneiras diferentes:

     - Consulta de títulos: MODAL de tela cheia com caixas de marcação,
       botões "Restaurar" e "Aplicar";
     - Solicitações: MENU de marcação (o `FiltroRapido` da ListaAvancada),
       na barra de ações;
     - Provisionamentos: BLOCO RECOLHÍVEL com caixas soltas, que **não
       gravava nada** — a escolha morria no F5.

   Três interfaces para uma ideia só é o defeito que a R12/R16 nomeiam: a
   pessoa que aprende numa tela não sabe operar a outra, e cada cópia
   evolui sozinha (as capacidades abaixo estavam UMA em cada tela).

   ---------------------------------------------------------------------
   O MODELO É O PAINEL "COLUNAS" DA `TabelaPadrao`, e não um desenho novo.
   O sistema já respondeu a este problema uma vez, para 224 tabelas:
   mostrar/esconder por marcação, ITEM TRAVADO que aparece na lista mas
   não desmarca, e "Restaurar padrão" no rodapé. Repetir a resposta é o
   que faz a segunda tela ser aprendida de graça.

   As três regras de "onde o painel aparece" também vêm de lá, pelo mesmo
   motivo: sem chave não há onde salvar (capacidade que mente é pior que
   capacidade ausente), e abaixo de três filtros declarados — ou com menos
   de dois escondíveis — não há escolha a oferecer.

   ---------------------------------------------------------------------
   AS TRÊS CAPACIDADES SOMADAS (nenhuma escolhida contra a outra):

   1. ESCONDER LIMPA O VALOR (vinha de Provisionamentos, virou contrato
      das três pelo N53). Filtro escondido que continua recortando a lista
      é um critério fora da tela: a pessoa lê "12 registros" e conclui que
      são todos. Aqui o painel chama `aoEsconder(id)` ANTES de gravar, e a
      tela limpa o que aquele id governa — a consulta é refeita e a lista
      alarga no mesmo instante em que o campo sai da faixa.

   2. FILTRO OBRIGATÓRIO (vinha de Solicitações, `FILTROS_OBRIGATORIOS`).
      Nem todo filtro pode sumir: o campo de BUSCA LIVRE de cada tela é o
      único caminho para achar um registro pelo que a pessoa lembra dele.
      É a mesma família da coluna de identidade travada da `TabelaPadrao`
      — ele aparece na lista, com a caixa marcada e desabilitada, e o
      `title` diz por quê. Não é capacidade removida: é a trava que impede
      a tela de ficar sem nenhum caminho de busca.

   3. RECONCILIAÇÃO COM O CÓDIGO (vinha de Consulta de títulos). A
      preferência guarda o DESVIO do padrão, então ela é lida contra o que
      a tela declara HOJE:
        - id em `visiveis`  -> aparece;
        - id em `ocultas`   -> não aparece;
        - id em NENHUMA das duas (filtro que nasceu depois da preferência)
          -> segue o `padrao` declarado pela tela;
        - id que a preferência cita e a tela não declara mais -> ignorado
          NA LEITURA, e NUNCA apagado. Filtrar é reversível (o filtro
          volta num rollback e a escolha volta junto); apagar não é.
      É a mesma reconciliação que `ordemColunas`/`visiveisColunas` fazem.

   4. REVELAR O QUE TEM VALOR (o outro lado do contrato 1, vinha das duas
      telas que já o tinham). Um valor pode chegar por link do Hub, pela
      URL ou do rascunho salvo e cair sobre um filtro escondido. A saída é
      REVELAR, não apagar: o recorte foi o usuário que montou, então ele
      aparece na faixa. Depois disso vale a invariante das três telas —
      filtro invisível está VAZIO, e o que se vê é o recorte inteiro.
      A revelação é consequência dos valores e NÃO É GRAVADA: só o clique
      no painel é preferência (por isso `alternar` grava a partir de
      `escolhidos`, e não de `visiveis`).

   ---------------------------------------------------------------------
   ONDE A ESCOLHA MORA — E ESTE É O MIOLO DO N53.

   No BANCO, tipo `filtros`, pelo `PreferenciasContext`. Antes: duas telas
   gravavam no localStorage (com o usuário no NOME da chave) e uma não
   gravava nada. Como esconder mexe no resultado da consulta, o mesmo
   usuário, com os mesmos campos preenchidos, obtinha listas diferentes
   conforme a MÁQUINA — e o número errado chegava a quem decide sem nada
   na tela que denunciasse. Indexado por usuário no servidor, o recorte
   viaja com a pessoa e a estação compartilhada deixa de vazar escolha de
   um operador para o próximo.

   `legado`: os ids que a tela lê da chave ANTIGA do navegador. Ele serve
   a duas coisas e some sozinho quando não houver mais ninguém com chave
   velha: (a) na LEITURA, enquanto não há preferência no banco, quem já
   configurou continua com a configuração dele — trocar a escolha de
   alguém por um padrão novo é remover configuração que a pessoa fez; e
   (b) uma MIGRAÇÃO ÚNICA para o banco, disparada só quando a carga do
   contexto terminou SEM ERRO (`pronto && !erro`). Sem esse portão, uma
   preferência que ainda não chegou do servidor pareceria ausente e o
   valor local a sobrescreveria — o banco sempre vence, como na adoção das
   colunas. A chave antiga NÃO é apagada: é a rede de rollback.

   NO LEGADO, AUSÊNCIA É "ESCONDIDO" — e não "nunca decidido". A chave
   antiga guardava só a lista do que aparecia, sem o outro lado; tratar o
   que falta nela pelo `padrao` da tela faria voltar exatamente o filtro
   que a pessoa escondeu (o "Status" da consulta de títulos é o caso). A
   regra do "filtro novo aparece" vale sobre a preferência do BANCO, que
   escreve os dois lados: id em nenhuma das duas listas é id que a tela
   passou a declarar depois — e esse, sim, segue o padrão.
   ===================================================================== */

/*
  Mesmas duas regras do `LIMIAR_COLUNAS_PAINEL` da `TabelaPadrao`, e pelo
  mesmo motivo: abaixo disso o painel é um botão a mais na barra para não
  decidir nada. As três telas de hoje declaram 15, 12 e 9 filtros.

  ---------------------------------------------------------------------
  O MESMO 3 DECIDIU QUAIS TELAS FORAM LIGADAS NA LEVA DE 06/09 — e este é
  o ponto do código onde o limiar existe, então é aqui que ele fica escrito.

  MEDIDA. 79 arquivos .jsx montam uma `<BarraFiltros>`, em 82 faixas (três
  arquivos têm duas). Contando o que cada faixa DECLARA — a busca livre,
  cada `campo` e cada dimensão de `filtros` —, a distribuição foi:

      1 filtro declarado ....... 16 faixas
      2 filtros ................ 16 faixas
      3 a 5 filtros ............ 38 faixas
      6 ou mais ................ 12 faixas

  As 32 faixas de 1 ou 2 filtros ficaram FORA, e não por gosto: o painel
  abaixo já se recusa a desenhar nelas (`declarados < 3` ou menos de dois
  escondíveis). Ligá-las acrescentaria hook, declaração e uma passada de
  `ehVisivel` em cada uma para produzir um botão que nunca aparece — e uma
  chave de preferência que nunca é escrita. As 50 faixas de 3 ou mais
  passam `visibilidade` hoje: as 2 do N53 mais as 48 desta leva.

  O corte é o MESMO número nos dois lugares de propósito. Se o limiar
  mudar aqui, a única coisa que acontece nas telas ligadas é o painel
  passar a aparecer (ou sumir) — nenhuma delas depende do valor, porque
  nenhuma delas repete a conta.

  E NENHUMA das 48 nasceu com filtro escondido: nenhuma declaração passa
  `padrao: false`. Conjunto inicial reduzido existe só nas três telas em
  que o cliente aprovou um. Onde a tela propõe um valor de partida (um
  `status: 'ABERTO'`, o mês corrente), ele é excluído de `preenchidos` —
  senão o padrão revelaria de volta, a cada recarga, exatamente o filtro
  que a pessoa acabou de esconder.
*/
const LIMIAR_FILTROS_PAINEL = 3;

function idsDe(filtros) {
  return filtros.map((filtro) => filtro.id);
}

/**
 * Estado + persistência da escolha "quais filtros aparecem".
 *
 * `chave`   — a mesma identidade de lista que a tela já usa na
 *             `TabelaPadrao` (`storageKey`). Os tipos `colunas` e
 *             `filtros` convivem sob a mesma chave: é a mesma lista
 *             respondendo a duas perguntas diferentes.
 * `filtros` — [{ id, rotulo, obrigatorio?, padrao? }]. `padrao: false`
 *             nasce escondido; `obrigatorio: true` não desmarca.
 * `opcoes`  — { preenchidos: string[], aoEsconder(id), legado: string[]|null }
 */
export function useFiltrosVisiveis(chave, filtros = [], opcoes = {}) {
  const { preenchidos = [], aoEsconder, legado = null } = opcoes;

  const declarados = (filtros || []).filter(Boolean);
  const ids = idsDe(declarados);
  const obrigatorios = declarados.filter((filtro) => filtro.obrigatorio).map((filtro) => filtro.id);
  const padrao = declarados.filter((filtro) => filtro.padrao !== false).map((filtro) => filtro.id);
  /* A tela remonta o array de filtros a cada render; a IDENTIDADE dele não
     serve de dependência. A assinatura textual serve: ela muda quando muda
     o que de fato importa (quais filtros, quais travados, quais no padrão). */
  const assinatura = declarados
    .map((filtro) => `${filtro.id}${filtro.obrigatorio ? '!' : ''}${filtro.padrao === false ? '-' : '+'}`)
    .join(',');
  const assinaturaLegado = Array.isArray(legado) ? legado.join(',') : '';
  const assinaturaPreenchidos = (preenchidos || []).join(',');

  const [preferencia, definirPreferencia] = usePreferenciaDeLista(chave, TIPO_FILTROS);
  const { pronto, erro } = usePreferencias();

  const legadoConhecido = useMemo(() => {
    if (!assinaturaLegado) return null;
    const conhecidos = assinaturaLegado.split(',').filter((id) => ids.includes(id));
    return conhecidos.length > 0 ? conhecidos : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinaturaLegado, assinatura]);

  /* A leitura da preferência contra o que a tela declara HOJE (capacidade 3). */
  const guardados = useMemo(() => {
    const salva = preferencia && Array.isArray(preferencia.visiveis) ? preferencia : null;
    const base = salva || (legadoConhecido
      ? { visiveis: legadoConhecido, ocultas: ids.filter((id) => !legadoConhecido.includes(id)) }
      : null);
    if (!base) return padrao;
    const marcados = new Set(base.visiveis.filter((id) => ids.includes(id)));
    const ocultos = new Set(Array.isArray(base.ocultas) ? base.ocultas : []);
    return ids.filter((id) => (marcados.has(id) || (!ocultos.has(id) && padrao.includes(id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferencia, legadoConhecido, assinatura]);

  /* O que a preferência governa: sem a revelação por valor, porque só o
     clique deliberado é preferência. É daqui que `alternar` grava. */
  const escolhidos = useMemo(
    () => ids.filter((id) => obrigatorios.includes(id) || guardados.includes(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [guardados, assinatura]
  );

  /* O que a tela DESENHA: o escolhido mais o que carrega valor (capacidade 4). */
  const visiveis = useMemo(
    () => ids.filter((id) => escolhidos.includes(id) || (assinaturaPreenchidos
      ? assinaturaPreenchidos.split(',').includes(id)
      : false)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [escolhidos, assinaturaPreenchidos, assinatura]
  );

  const gravar = useCallback((proximos) => {
    definirPreferencia({
      visiveis: ids.filter((id) => proximos.includes(id)),
      ocultas: ids.filter((id) => !proximos.includes(id))
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definirPreferencia, assinatura]);

  /*
    MIGRAÇÃO ÚNICA da chave antiga do navegador para o banco. O `ref`
    impede a segunda tentativa dentro da mesma montagem; a checagem de
    `preferencia` impede que ela aconteça quando o servidor já respondeu.
  */
  const migrou = useRef(false);
  useEffect(() => {
    if (migrou.current || !chave || !legadoConhecido) return;
    if (!pronto || erro) return;
    if (preferencia && Array.isArray(preferencia.visiveis)) {
      migrou.current = true;
      return;
    }
    migrou.current = true;
    gravar(legadoConhecido);
  }, [chave, legadoConhecido, pronto, erro, preferencia, gravar]);

  const alternar = (id) => {
    // A trava vale aqui e não só na caixa desabilitada: é aqui que a
    // preferência é gravada, e tela sem caminho de busca não é escolha.
    if (obrigatorios.includes(id)) return;
    const escondendo = visiveis.includes(id);
    if (escondendo) {
      if (visiveis.length <= 1) return;
      // Contrato 1: primeiro a tela limpa o valor, depois a escolha é
      // gravada — a consulta é refeita com o filtro já vazio.
      if (aoEsconder) aoEsconder(id);
    }
    gravar(escondendo
      ? escolhidos.filter((outro) => outro !== id)
      : [...escolhidos, id]);
  };

  /*
    "Restaurar padrão" APAGA a preferência — é o único caminho que apaga, e
    é ato explícito do usuário, como no painel de colunas. Ele também
    ESCONDE filtros, então cumpre o contrato 1 antes: sem isto, restaurar
    deixaria um valor recortando a lista fora da faixa, que é exatamente o
    N53 voltando por outra porta.
  */
  const restaurar = () => {
    if (aoEsconder) {
      visiveis
        .filter((id) => !padrao.includes(id) && !obrigatorios.includes(id))
        .forEach((id) => aoEsconder(id));
    }
    definirPreferencia(null);
  };

  return {
    chave,
    declarados,
    visiveis,
    /* O que a PREFERÊNCIA governa, sem a revelação por valor. A tela precisa
       distinguir os dois para uma coisa só, e ela é importante: o valor que
       o SISTEMA propõe (um `status: 'ABERTO'` de padrão) não pode
       ressuscitar um filtro que a pessoa escondeu — se ele contasse como
       "preenchido", o padrão revelaria de volta, toda recarga, exatamente o
       filtro que ela tirou da faixa. */
    escolhidos,
    obrigatorios,
    padrao,
    ehVisivel: (id) => visiveis.includes(id),
    preenchidos: preenchidos || [],
    alternar,
    restaurar
  };
}

/**
 * O painel: botão + menu de marcação, no molde do painel "Colunas".
 *
 * O DEFEITO QUE O CLIENTE ACHOU NA CAPTURA (06/09): ESTE PAINEL ABRIA PARA
 * FORA DA BORDA ESQUERDA DA JANELA E FICAVA CORTADO PELA METADE.
 *
 * A causa, medida: o menu vinha `position: absolute; right: 0` — três
 * declarações inline postas aqui só para DESFAZER o `position: fixed` da
 * `.app-colunas-menu`. `right: 0` ancora a borda DIREITA da caixa à borda
 * direita do botão, e a caixa tem `min-width: 260px`. Numa faixa de
 * filtros o botão fica à ESQUERDA da barra: a 390px de janela, com o botão
 * começando em x≈16, a borda esquerda do painel caía em x negativo. Metade
 * do conteúdo — inclusive o aviso "preenchido: esconder limpa e refaz a
 * consulta", que é o que explica a consequência do clique — ficava
 * inalcançável, e nem rolagem trazia de volta.
 *
 * A resposta é a que o comentário anterior deste bloco já previa por
 * escrito, e ela veio inteira: o `usePosicaoFlutuante` saiu da
 * `TabelaPadrao` para `hooks/` e é usado aqui. O painel volta a ser
 * `fixed` (o que a classe já dizia), a posição é MEDIDA com o tamanho real
 * do menu, e as três respostas valem: alinha pela direita do botão
 * ENQUANTO COUBER — que é o desenho de sempre, herdado do painel de
 * colunas —, vira para o outro lado quando não couber, e ganha rolagem
 * interna quando a lista de 15 filtros não couber na janela.
 *
 * O `ref` do `useFecharAoSair` continua no MESMO elemento (o wrap), e o
 * menu continua sendo FILHO dele — nada de portal. É o que preserva a
 * seleção: `contains` continua verdadeiro para a caixa de marcação, e o
 * `mousedown` do hook não fecha o painel antes do `onChange` da opção.
 */
export default function PainelFiltrosVisiveis({ visibilidade, rotulo = 'Filtros visíveis' }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  const botaoRef = useRef(null);
  const menuRef = useRef(null);
  useFecharAoSair(ref, aberto, () => setAberto(false));
  /*
    R29 — OS DOIS HOOKS FICAM ACIMA DOS `return null` DE BAIXO, sempre
    chamados. Hook depois de saída antecipada é o React #310, que derrubou
    a `TabelaPadrao` inteira em 05/09; e este componente tem DUAS saídas
    (sem chave, e abaixo do limiar de filtros) que mudam de valor conforme
    a tela e a preferência carregada.
  */
  const posicao = usePosicaoFlutuante(botaoRef, menuRef, aberto, { ancorarADireita: true });

  const declarados = visibilidade?.declarados || [];
  const escondiveis = declarados.filter((filtro) => !filtro.obrigatorio).length;
  /*
    As três regras de "onde o painel aparece", copiadas do painel de
    colunas porque o problema é o mesmo: sem chave o `PreferenciasContext`
    não registra nada e a escolha seria esquecida na recarga — capacidade
    que mente é pior que capacidade ausente.
  */
  if (!visibilidade || !visibilidade.chave) return null;
  if (declarados.length < LIMIAR_FILTROS_PAINEL || escondiveis < 2) return null;

  const { visiveis, preenchidos, alternar, restaurar } = visibilidade;

  return (
    <span className="app-mais-wrap" ref={ref}>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        ref={botaoRef}
        aria-haspopup="menu"
        aria-expanded={aberto}
        title="Escolher quais filtros aparecem nesta tela"
        onClick={() => setAberto((atual) => !atual)}
      >
        {rotulo} ({visiveis.length}/{declarados.length})
      </button>
      {aberto && posicao && (
        <span
          className="app-mais-menu app-colunas-menu"
          role="menu"
          ref={menuRef}
          style={posicao.estilo}
        >
          {declarados.map((filtro) => {
            const visivel = visiveis.includes(filtro.id);
            const travado = Boolean(filtro.obrigatorio);
            const ultimo = visivel && !travado && visiveis.length <= 1;
            /*
              O AVISO VAI NO RÓTULO DA LINHA QUE SE CLICA (05/09) — a saída
              B do N53, e ela é a mesma nas três telas. A outra saída
              registrada era tirar o filtro PREENCHIDO da lista de
              escondíveis; não foi essa porque "Status" nasce preenchido em
              toda consulta de títulos e quem trabalha numa obra fixa tem
              "Obra" sempre preenchido — bloquear tornaria impossível
              esconder justamente os dois filtros para os quais o painel
              existe. O aviso nomeia a consequência ANTES do clique, e o
              clique cumpre exatamente o que ele diz.
            */
            const avisa = visivel && !travado && (preenchidos || []).includes(filtro.id);
            return (
              <span className="app-colunas-item" key={filtro.id}>
                <label className="app-colunas-rotulo">
                  <input
                    type="checkbox"
                    checked={visivel}
                    disabled={travado || ultimo}
                    title={travado
                      ? 'Este é o campo de busca da tela e fica sempre visível'
                      : (ultimo ? 'A tela precisa de pelo menos um filtro' : undefined)}
                    onChange={() => alternar(filtro.id)}
                  />
                  <span>
                    {filtro.rotulo}
                    {avisa ? ' — preenchido: esconder limpa e refaz a consulta' : ''}
                  </span>
                </label>
              </span>
            );
          })}
          <button type="button" className="app-mais-item" onClick={restaurar}>
            Restaurar padrão
          </button>
        </span>
      )}
    </span>
  );
}
