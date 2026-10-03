#!/usr/bin/env node
/**
 * PROVA — TODA REGRA TEM DE MORDER.
 *
 * Pedido do cliente em 03/09, depois de a M3 aparecer verde sem medir nada:
 * "regra antiga sem prova de que reprova é regra não verificada".
 *
 * Um check só está verificado quando se sabe que ele reprova o que deve
 * reprovar. Verde não é evidência: pode significar "o código está certo" ou
 * "o check não olha". As duas leituras são indistinguíveis de fora, e a
 * história desta reforma tem sete pontos cegos que ficaram verdes por anos.
 *
 * Esta prova planta uma violação MÍNIMA de cada regra estática numa tela
 * temporária do manifesto e exige que o validador a reprove. Se alguma
 * regra deixar de morder — porque foi reescrita, porque um seletor mudou,
 * porque um nome de variável saiu do escopo — esta prova reprova ANTES de
 * a regra ser usada como garantia.
 *
 * Escopo honesto: cobre as regras ESTÁTICAS (validarLayout.mjs). Os itens
 * da DoD medidos no navegador (C*, T*, F*, B*, M*, X*, A1) rodam contra o
 * preview publicado e precisam de uma tela-fixture própria para serem
 * provados do mesmo jeito. Está registrado como lacuna declarada, não como
 * cobertura.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/*
  NOME ÚNICO POR PROCESSO (04/09).

  Esta prova planta uma tela temporária e a acrescenta ao manifesto. O nome
  era fixo, e o manifesto é compartilhado — então DUAS corridas simultâneas
  de `test:responsive` (inevitável com agentes em paralelo) se atropelavam:
  uma apagava a fixture da outra, e o resultado era "listada no manifesto
  mas não existe", que reprova TODO MUNDO.

  Três agentes tropeçaram nisso em 04/09 e tiveram de rodar de novo; um
  deles chegou a ver "8 regras sem prova de reprovação" e precisou
  descobrir que não era defeito das regras. Prova que atrapalha quem está
  medindo é pior que prova nenhuma: gera vermelho falso, e vermelho falso
  ensina a ignorar vermelho.

  O sufixo é o PID: cada corrida tem o seu arquivo e a sua entrada, e a
  limpeza do `finally` remove só a própria.
*/
const SUFIXO = `${process.pid}`;
const ALVO = path.join(RAIZ, 'src', 'pages', `__ProvaDeRegra${SUFIXO}.jsx`);
const ALVO_REL = `src/pages/__ProvaDeRegra${SUFIXO}.jsx`;
/* A R30 mora no CSS, entao a fixture dela e uma FOLHA — mesmo sufixo por PID,
   mesma limpeza no `finally`, e entra pela bandeira `--extra-css`, que a
   declara como fixture DESTA corrida sem empurra-la para o manifesto. */
const ALVO_CSS = path.join(RAIZ, 'src', 'styles', `__ProvaDeRegraR30${SUFIXO}.css`);
const ALVO_CSS_REL = `src/styles/__ProvaDeRegraR30${SUFIXO}.css`;

const CABECA = `import { Pagina, PageHeader, TabelaPadrao } from '../components/padrao';\n\nexport default function ProvaDeRegra() {\n  return (\n    <Pagina>\n      <PageHeader titulo="Prova" contagem="1 item" />\n`;
const RABO = `    </Pagina>\n  );\n}\n`;

/* Cada caso: a regra, e o trecho que TEM de reprovar. */
const CASOS = [
  {
    regra: 'R1',
    porque: 'tabela crua fora do componente padrão',
    corpo: '      <table><tbody><tr><td>x</td></tr></tbody></table>\n'
  },
  {
    regra: 'R10',
    porque: 'medida fora dos degraus da escala',
    corpo: '      <div className="mt-5 text-[11px]" style={{ padding: 7 }} />\n'
  },
  {
    regra: 'R17',
    porque: 'TabelaPadrao sem coluna de identidade declarada',
    corpo: '      <TabelaPadrao colunas={[{ id: \'a\', titulo: \'A\', tipo: \'texto\', render: (x) => x.a }]} itens={[]} getId={(x) => x.id} />\n'
  },
  {
    regra: 'R19',
    porque: 'caixa do navegador',
    corpo: '      <button type="button" onClick={() => { window.alert(\'oi\'); }}>Ir</button>\n'
  },
  {
    regra: 'R25',
    porque: 'cor fora do sistema de tokens',
    corpo: '      <span className="text-slate-500" style={{ color: \'#ff0000\' }} />\n'
  },
  /*
    R32 NAS TRES FORMAS EM QUE CAMADA E FEITA AQUI (06/09).

    A pergunta antes de escrever o caso foi a de sempre: de quantos jeitos
    isso e feito neste repositorio? Sao tres — `z-index` cru no CSS, classe
    `z-*` do Tailwind e `zIndex` no `style` inline —, e a R32 so vale se
    morder os tres. Um caso so provaria a regra na forma que eu acabei de
    converter e deixaria as outras duas sem rede, que e exatamente o buraco
    que a R29 teve de tapar depois.

    `z-50` nao e exemplo escolhido a esmo: era a classe com 11 usos, e uma
    barra fixa que valesse 20 perderia para ela. E o que o cliente viu.
  */
  {
    regra: 'R32',
    porque: 'camada como classe do Tailwind (z-50 vence barra fixa)',
    corpo: '      <div className="fixed inset-0 z-50" />\n'
  },
  {
    regra: 'R32',
    porque: 'camada como numero no style inline',
    corpo: '      <div style={{ position: \'fixed\', zIndex: 60 }} />\n'
  }
];

/* R18, R21 e R22 precisam de forma própria — não cabem no molde acima. */
const CASOS_ARQUIVO_INTEIRO = [
  {
    regra: 'R18',
    porque: 'overflow hidden em ancestral de tabela',
    arquivo: `import { Pagina, TabelaPadrao } from '../components/padrao';\n\nexport default function ProvaDeRegra() {\n  return (\n    <Pagina>\n      <div style={{ overflow: 'hidden' }}>\n        <TabelaPadrao colunas={[{ id: 'a', titulo: 'A', tipo: 'identidade', render: (x) => x.a }]} itens={[]} getId={(x) => x.id} />\n      </div>\n    </Pagina>\n  );\n}\n`
  },
  {
    regra: 'R21',
    porque: 'retorno de confirmar() lido como booleano',
    arquivo: `import { Pagina, useConfirmacao } from '../components/padrao';\n\nexport default function ProvaDeRegra() {\n  const { confirmar } = useConfirmacao();\n  async function agir() {\n    if (!await confirmar({ titulo: 'x' })) return;\n  }\n  return <Pagina><button type="button" onClick={agir}>Ir</button></Pagina>;\n}\n`
  },
  /*
    R29 nas TRÊS formas de escrever a saída antecipada.

    Um caso só não bastaria, e isso não é zelo — é o que aconteceu hoje: a
    primeira versão da R29 conhecia só a forma de chaves, que é a que a
    TabelaPadrao usa, e deixava passar `if (carregando) return <p/>;` numa
    linha só, que é a forma MAIS comum em React. Regra que cobre o caso que
    acabei de consertar e não cobre o vizinho é rede com buraco no meio.
  */
  {
    regra: 'R29',
    porque: 'hook depois de return condicional COM CHAVES',
    arquivo: `import { useState } from 'react';\nimport { Pagina } from '../components/padrao';\n\nexport default function ProvaDeRegra({ carregando }) {\n  const total = 1;\n  if (carregando) {\n    return <Pagina>Carregando</Pagina>;\n  }\n  const [n] = useState(total);\n  return <Pagina>{n}</Pagina>;\n}\n`
  },
  {
    regra: 'R29',
    porque: 'hook depois de return condicional em UMA LINHA',
    arquivo: `import { useState } from 'react';\nimport { Pagina } from '../components/padrao';\n\nexport default function ProvaDeRegra({ carregando }) {\n  const total = 1;\n  if (carregando) return <Pagina>Carregando</Pagina>;\n  const [n] = useState(total);\n  return <Pagina>{n}</Pagina>;\n}\n`
  },
  {
    regra: 'R29',
    porque: 'hook depois de return condicional SEM CHAVES, corpo na linha seguinte',
    arquivo: `import { useState } from 'react';\nimport { Pagina } from '../components/padrao';\n\nexport default function ProvaDeRegra({ carregando }) {\n  const total = 1;\n  if (carregando)\n    return <Pagina>Carregando</Pagina>;\n  const [n] = useState(total);\n  return <Pagina>{n}</Pagina>;\n}\n`
  },
  /*
    E o sentido inverso, específico da R29: as MESMAS três saídas
    antecipadas, com os hooks no lugar certo, NÃO podem reprovar. Sem este
    caso a regra passaria acusando todo componente que tem saída antecipada
    — que é quase todos — e o custo apareceria como ruído, não como defeito.
  */
  {
    regra: 'R29',
    porque: 'NEGATIVO: hooks ANTES das três saídas — não pode reprovar',
    naoPodeReprovar: true,
    arquivo: `import { useState } from 'react';\nimport { Pagina } from '../components/padrao';\n\nexport default function ProvaDeRegra({ carregando, itens }) {\n  const [n] = useState(0);\n  if (carregando) return <Pagina>Carregando</Pagina>;\n  if (!itens.length)\n    return <Pagina>Vazio</Pagina>;\n  if (n > 9) {\n    return <Pagina>Muito</Pagina>;\n  }\n  return <Pagina>{n}</Pagina>;\n}\n`
  },
  /*
    E o sentido inverso da R32: camada declarada PELO TOKEN, nas tres
    formas, nao pode ser acusada. Sem este caso a regra passaria acusando
    tambem o jeito certo — e o jeito certo e o que ela existe para exigir.
  */
  /*
    R33 — CAMADA ANCORADA A MAO, SEM O HOOK QUE MEDE SE ELA CABE (06/09).

    A regra entrou no portao antes de ter prova, e a prova manual que eu
    fiz primeiro NAO ACUSOU — mas o defeito era do teste, nao da regra: eu
    plantava o estilo num `<span` que nem existia no arquivo escolhido.
    Errei tres vezes antes de instrumentar em vez de adivinhar. Fica aqui
    para nao depender da minha memoria: a mordida passa a rodar sozinha.

    O caso positivo reproduz o defeito real da captura do cliente — menu
    ancorado por `right: 0`, que prende a borda DIREITA da caixa no botao e
    joga a esquerda para fora quando o botao esta na borda esquerda. Foram
    305px fora da janela, nas tres larguras.

    O negativo e a outra metade, e sem ele a regra acusaria o jeito certo:
    `left: 0` E `right: 0` juntos dao a largura do ancora, nao deslocam a
    caixa, e por isso nao podem reprovar — sao os 20 autocompletes que ja
    cabiam por construcao.
  */
  {
    regra: 'R33',
    porque: 'camada ancorada por UMA borda, em arquivo sem usePosicaoFlutuante',
    arquivo: `import { useRef, useState } from 'react';\nimport { useFecharAoSair } from '../hooks/useFecharAoSair';\nimport { Pagina } from '../components/padrao';\n\nexport default function ProvaDeRegra() {\n  const ref = useRef(null);\n  const [aberto, setAberto] = useState(false);\n  useFecharAoSair(ref, aberto, () => setAberto(false));\n  return (\n    <Pagina>\n      <div ref={ref}>\n        <div style={{ position: 'absolute', right: 0 }} />\n      </div>\n    </Pagina>\n  );\n}\n`
  },
  {
    regra: 'R33',
    porque: 'NEGATIVO: camada com as DUAS bordas (largura do ancora) — nao desloca, nao pode reprovar',
    naoPodeReprovar: true,
    arquivo: `import { useRef, useState } from 'react';\nimport { useFecharAoSair } from '../hooks/useFecharAoSair';\nimport { Pagina } from '../components/padrao';\n\nexport default function ProvaDeRegra() {\n  const ref = useRef(null);\n  const [aberto, setAberto] = useState(false);\n  useFecharAoSair(ref, aberto, () => setAberto(false));\n  return (\n    <Pagina>\n      <div ref={ref}>\n        <div className="absolute left-0 right-0" />\n      </div>\n    </Pagina>\n  );\n}\n`
  },
  {
    regra: 'R32',
    porque: 'NEGATIVO: camada pelo token nas tres formas — nao pode reprovar',
    naoPodeReprovar: true,
    arquivo: `import { Pagina } from '../components/padrao';\n\nexport default function ProvaDeRegra() {\n  return (\n    <Pagina>\n      <div className="fixed inset-0 z-modal" />\n      <div style={{ position: 'fixed', zIndex: 'var(--z-toast)' }} />\n    </Pagina>\n  );\n}\n`
  },
  /*
    R34 — BLOCO CONTROLADO SEM O OUVINTE (06/09).

    A matriz reprovou 23 telas com "o bloco recebeu o clique de recolher e
    NAO recolheu". A causa daquele dia era o stopPropagation da faixa de
    acoes engolindo o clique, e foi corrigida no componente — mas a familia
    do defeito e maior que a causa: qualquer bloco cujo botao recebe o
    clique e nao muda o aria-expanded tem a mesma cara para quem usa. O
    contrato deixa essa porta aberta em `recolhido` sem
    `aoAlternarRecolhido`, e a R34 fecha a porta.

    O negativo e a outra metade: `recolhidoPadrao` (sozinho, sem
    `recolhido`) e o jeito normal de um bloco nascer recolhido, esta em 40+
    montagens do sistema e NAO pode reprovar — se reprovasse, a regra
    tiraria a capacidade que ela existe para proteger.
  */
  {
    regra: 'R34',
    porque: 'bloco com `recolhido` e sem `aoAlternarRecolhido` — botao que recebe o clique e nao muda nada',
    arquivo: `import { Pagina, BlocoConteudo } from '../components/padrao';\n\nexport default function ProvaDeRegra() {\n  const recolhido = true;\n  return (\n    <Pagina>\n      <BlocoConteudo titulo="Historico" recolhivel recolhido={recolhido}>\n        <p>corpo</p>\n      </BlocoConteudo>\n    </Pagina>\n  );\n}\n`
  },
  {
    regra: 'R34',
    porque: 'NEGATIVO: `recolhidoPadrao` sozinho e o par completo `recolhido`+`aoAlternarRecolhido` — os dois jeitos certos',
    naoPodeReprovar: true,
    arquivo: `import { useState } from 'react';\nimport { Pagina, BlocoConteudo } from '../components/padrao';\n\nexport default function ProvaDeRegra() {\n  const [recolhido, setRecolhido] = useState(true);\n  return (\n    <Pagina>\n      <BlocoConteudo titulo="Nasce recolhido" recolhivel recolhidoPadrao>\n        <p>corpo</p>\n      </BlocoConteudo>\n      <BlocoConteudo titulo="Par completo" recolhivel recolhido={recolhido} aoAlternarRecolhido={setRecolhido}>\n        <p>corpo</p>\n      </BlocoConteudo>\n    </Pagina>\n  );\n}\n`
  },
  /*
    R35 — CAMPO DE DATA NATIVO (06/09).

    O positivo e o defeito que o revisor viu no preview: `mm/dd/yyyy` em
    seis telas. A causa nao esta no HTML — o formato do `<input type="date">`
    vem do idioma da INTERFACE do navegador, medido: contexto de pagina
    pt-BR deu Month/Day/Year e so `LANG=pt_BR.UTF-8` deu Dia/Mes/Ano.

    O NEGATIVO importa tanto quanto: o proprio `DateInputBR` cita
    `type="date"` no comentario que explica o que ele substitui, e uma
    regra que contasse comentario acusaria justamente o conserto. Foi o
    erro que a R19 ja teve de desfazer uma vez; aqui ele nasce coberto.
  */
  {
    regra: 'R35',
    porque: 'campo de data nativo (formato sai do idioma do navegador)',
    arquivo: `import { Pagina } from '../components/padrao';\n\nexport default function ProvaDeRegra() {\n  return (\n    <Pagina>\n      <input type="date" value="" onChange={() => {}} />\n    </Pagina>\n  );\n}\n`
  },
  {
    regra: 'R35',
    porque: 'NEGATIVO: DateInputBR e a MENCAO a type="date" em comentario — o conserto nao pode reprovar',
    naoPodeReprovar: true,
    arquivo: `import { Pagina } from '../components/padrao';\nimport DateInputBR from '../components/DateInputBR';\n\nexport default function ProvaDeRegra() {\n  // trocado: antes era type="date", que muda de formato conforme a maquina\n  return (\n    <Pagina>\n      <DateInputBR name="data" value="" onChange={() => {}} />\n    </Pagina>\n  );\n}\n`
  },
  /*
    R36 — O MENU "..." (07/09).

    O positivo e o componente montado numa tela nova para a regra: acao
    escondida atras de um botao que so revela outros botoes.

    O NEGATIVO e o que essa leva inteira produziu: a tela que TIROU o menu e
    pos os itens visiveis, e que ainda CITA o menu no comentario para
    explicar de onde o botao veio. Nove telas ficaram assim. Uma regra que
    contasse comentario acusaria exatamente o conserto — o mesmo erro que a
    R19 ja teve de desfazer, e que a R35 nasceu cobrindo.
  */
  {
    regra: 'R36',
    porque: 'menu "..." — botao que so revela outro botao, com a faixa vazia ao lado',
    arquivo: `import { Pagina } from '../components/padrao';\nimport MenuMais from '../components/padrao/MenuMais';\n\nexport default function ProvaDeRegra() {\n  return (\n    <Pagina>\n      <MenuMais itens={[{ rotulo: 'Exportar CSV', onClick: () => {} }]} />\n    </Pagina>\n  );\n}\n`
  },
  {
    regra: 'R36',
    porque: 'NEGATIVO: itens visiveis na faixa, com o menu CITADO em comentario — o conserto nao pode reprovar',
    naoPodeReprovar: true,
    arquivo: `import { Pagina, PageHeader } from '../components/padrao';\n\nexport default function ProvaDeRegra() {\n  // "Exportar CSV" vinha do <MenuMais />, que saiu do sistema em 07/09.\n  return (\n    <Pagina>\n      <PageHeader\n        titulo="Prova"\n        acaoPrincipal={{ rotulo: 'Novo', onClick: () => {} }}\n        secundarias={[{ rotulo: 'Exportar CSV', onClick: () => {} }]}\n      />\n    </Pagina>\n  );\n}\n`
  },
  {
    regra: 'R22',
    porque: 'hook usado sem import',
    arquivo: `import { Pagina } from '../components/padrao';\n\nexport default function ProvaDeRegra() {\n  const [n] = useState(0);\n  return <Pagina>{n}</Pagina>;\n}\n`
  }
];

let falhas = 0;

/*
  `--extra` EM VEZ DE ESCREVER NO MANIFESTO (05/09) — a prova era instável e
  a instabilidade era dela, não das regras.

  Esta prova plantava o defeito acrescentando o arquivo-fixture ao
  `telas-reformadas.json`, que é ESTADO COMPARTILHADO. Enquanto um agente
  rodava as provas dele em paralelo, as duas corridas faziam
  ler-modificar-escrever no mesmo arquivo e a restauração "cirúrgica" de uma
  apagava a entrada da outra. Medido em 05/09: três corridas seguidas
  acusaram regras DIFERENTES (R1, depois R17+R19, depois R19+R18) sem
  nenhuma mudança de código no meio. Prova que oscila é pior que prova
  vermelha: ela ensina a ignorar o resultado.

  E a saída já existia no repositório, escrita com este propósito exato: o
  `--extra` do validador mede um arquivo FORA do manifesto, sem tocar no
  compartilhado. Eu tinha até consertado a bandeira hoje (ela lia só um
  caminho) e continuei usando o caminho que causa corrida.
*/
function rodarValidador() {
  try {
    execFileSync('node', [path.join(RAIZ, 'scripts', 'validarLayout.mjs'), '--extra', ALVO_REL], { cwd: RAIZ, encoding: 'utf8' });
    return '';
  } catch (erro) {
    return `${erro.stdout || ''}${erro.stderr || ''}`;
  }
}

function rodarValidadorCss() {
  try {
    execFileSync('node', [path.join(RAIZ, 'scripts', 'validarLayout.mjs'), '--extra-css', ALVO_CSS_REL], { cwd: RAIZ, encoding: 'utf8' });
    return '';
  } catch (erro) {
    return `${erro.stdout || ''}${erro.stderr || ''}`;
  }
}

/*
  A MORDIDA DA R30, NOS DOIS SENTIDOS (05/09).

  Esta e a prova que o cliente pediu de forma explicita: mostrar o check
  REPROVANDO um tamanho fora dos degraus e PASSANDO limpo depois. Ela nao e
  cerimonia — e a diferenca entre "o CSS esta certo" e "o check nao olha o
  CSS", que foi exatamente a confusao que deixou 88% da poluicao invisivel
  por anos, com o portao verde o tempo todo.

  Sao quatro formas do mesmo defeito, porque a pergunta que importa nunca e
  "quantos casos existem?" e sim "de quantos jeitos isso e feito aqui?":
  pixel cru, meio-degrau, rampa de clamp() e escala paralela em var().
*/
function provarCss(porque, corpo, deveReprovar = true, regra = 'R30') {
  fs.writeFileSync(ALVO_CSS, corpo);
  const saida = rodarValidadorCss();
  const linhas = saida.split('\n').filter((l) => l.includes(`[${regra}]`) && l.includes(ALVO_CSS_REL) && !l.startsWith('AVISO'));
  if (deveReprovar === (linhas.length > 0)) {
    console.log(`  ok    ${regra} ${deveReprovar ? 'reprova' : 'NAO reprova'} ${porque}`);
    return;
  }
  falhas += 1;
  if (deveReprovar) console.log(`  FALHA ${regra} NAO reprovou ${porque} — o check nao morde essa forma`);
  else {
    console.log(`  FALHA ${regra} reprovou ${porque} — falso positivo:`);
    linhas.slice(0, 3).forEach((l) => console.log(`          ${l.trim()}`));
  }
}

/*
  QUANDO ESTA PROVA FALHA, ELA TEM DE DIZER POR QUÊ (05/09).

  Em 05/09 ela começou a oscilar: três corridas seguidas acusaram regras
  DIFERENTES, sem nenhuma mudança de código no meio, enquanto um agente
  rodava provas em paralelo. A mensagem era sempre a mesma — "a regra
  existe e não morde" — e ela é uma AFIRMAÇÃO sobre a regra, quando o que
  havia era o verificador não tendo o que ler.

  Prova que oscila ensina a ignorar o resultado, e mensagem que atribui a
  causa errada é pior que mensagem nenhuma. Agora, quando não morde, ela
  separa os casos e mostra o que mediu: fixture no disco? validador
  respondeu? a saída cita o arquivo? cita a regra?
*/
function provar(regra, porque, conteudo) {
  fs.writeFileSync(ALVO, conteudo);
  const noDisco = fs.existsSync(ALVO) ? fs.readFileSync(ALVO, 'utf8').length : -1;
  const saida = rodarValidador();
  const citaArquivo = saida.includes(ALVO_REL);
  const citaRegra = saida.includes(`[${regra}]`);
  if (citaRegra && citaArquivo) {
    console.log(`  ok    ${regra} reprova ${porque}`);
    return;
  }
  falhas += 1;
  const diagnostico = noDisco <= 0
    ? `a FIXTURE não estava no disco na hora da medição (${noDisco} bytes) — defeito desta prova, não da regra`
    : (!saida
      ? 'o validador saiu com 0 e não devolveu saída nenhuma — ele não chegou a medir a fixture'
      : (!citaArquivo
        ? `o validador respondeu (${saida.length} bytes) e NÃO citou ${ALVO_REL} — a fixture não entrou na medição`
        : `o validador citou o arquivo mas não a regra [${regra}] — aí sim a regra não mordeu`));
  console.log(`  FALHA ${regra} NÃO reprovou ${porque} — ${diagnostico}`);
}

/*
  O SENTIDO INVERSO, POR REGRA (05/09).

  A prova da "tela limpa" no fim já cobre o falso positivo em geral, mas ela
  usa uma tela vazia — que não exercita nada. Uma regra pode passar nela e
  ainda assim acusar todo código CORRETO da sua própria classe. A R29 é o
  caso: quase todo componente do sistema tem saída antecipada, e uma
  heurística grosseira acusaria todos eles.

  Por isso a regra que tem forma própria ganha aqui o caso negativo dela:
  código que exercita exatamente o que a regra olha, escrito do jeito certo,
  e que NÃO pode ser reprovado.
*/
function provarQueNaoReprova(regra, porque, conteudo) {
  fs.writeFileSync(ALVO, conteudo);
  const saida = rodarValidador();
  const linhasDaRegra = saida.split('\n')
    .filter((l) => l.includes(`[${regra}]`) && l.includes(ALVO_REL));
  if (!linhasDaRegra.length) {
    console.log(`  ok    ${regra} NÃO reprova ${porque}`);
    return;
  }
  falhas += 1;
  console.log(`  FALHA ${regra} reprovou ${porque} — falso positivo:`);
  linhasDaRegra.slice(0, 3).forEach((l) => console.log(`          ${l.trim()}`));
}

try {
  // O manifesto NÃO é mais tocado: a fixture entra pela bandeira `--extra`.
  for (const caso of CASOS) provar(caso.regra, caso.porque, CABECA + caso.corpo + RABO);
  for (const caso of CASOS_ARQUIVO_INTEIRO) {
    if (caso.naoPodeReprovar) provarQueNaoReprova(caso.regra, caso.porque, caso.arquivo);
    else provar(caso.regra, caso.porque, caso.arquivo);
  }

  // R30 — a escala de fonte no CSS, nas quatro formas do defeito.
  provarCss('pixel cru fora dos degraus', '.prova-r30 { font-size: 13px; }\n');
  provarCss('meio-degrau abaixo do piso de 12px', '.prova-r30 { font-size: 10.5px; }\n');
  provarCss('rampa de clamp() em texto', '.prova-r30 { font-size: clamp(0.8rem, 2vw, 1rem); }\n');
  provarCss('escala paralela em var() propria', '.prova-r30 { font-size: var(--sol-font-base); }\n');
  // E o sentido inverso, que e a outra metade da prova: os CINCO degraus
  // escritos como token passam LIMPOS. Sem este caso o check poderia estar
  // acusando tudo — inclusive o que a R30 manda escrever.
  provarCss(
    'os cinco degraus escritos como token',
    ['.prova-r30-a { font-size: var(--fonte-detalhe); }',
      '.prova-r30-b { font-size: var(--fonte-corpo); }',
      '.prova-r30-c { font-size: var(--fonte-bloco); }',
      '.prova-r30-d { font-size: var(--fonte-pagina); }',
      '.prova-r30-e { font-size: var(--fonte-destaque); }',
      '.prova-r30-f { font-size: inherit; }', ''].join('\n'),
    false
  );

  /*
    R32 NO CSS — a terceira forma, e a que mais pesava: 72 dos 110 numeros
    soltos eram `z-index` cru em folha de estilo, 35 deles no proprio
    arquivo que DECLARA a escala.
  */
  provarCss('z-index cru em folha de estilo', '.prova-r32 { z-index: 7; }\n', true, 'R32');
  provarCss(
    'camada declarada pelo token, no CSS',
    ['.prova-r32-a { z-index: var(--z-sticky); }',
      '.prova-r32-b { z-index: var(--z-modal); }', ''].join('\n'),
    false,
    'R32'
  );
  if (fs.existsSync(ALVO_CSS)) fs.unlinkSync(ALVO_CSS);

  // E o sentido inverso: tela limpa NÃO pode reprovar.
  fs.writeFileSync(ALVO, CABECA + RABO);
  const saidaLimpa = rodarValidador();
  if (saidaLimpa.includes(ALVO_REL)) {
    falhas += 1;
    console.log('  FALHA tela LIMPA foi reprovada — o validador acusa o que está certo');
  } else {
    console.log('  ok    tela limpa passa (o validador não acusa o que está certo)');
  }
} finally {
  /*
    Nada a restaurar no manifesto — ele deixou de ser tocado. Sobra a
    fixture, que é do PID desta corrida e some com ela.

    A "restauração cirúrgica" que existia aqui era uma tentativa honesta de
    conviver com corridas paralelas, e não bastava: ler-modificar-escrever
    não é atômico, então duas corridas ainda se derrubavam. A lição é que o
    conserto de corrida não é restaurar melhor — é não compartilhar.
  */
  if (fs.existsSync(ALVO)) fs.unlinkSync(ALVO);
  if (fs.existsSync(ALVO_CSS)) fs.unlinkSync(ALVO_CSS);
}

console.log(`\n[provas] regras mordem: ${falhas === 0 ? 'ok' : `${falhas} regra(s) sem prova de reprovação`}`);
if (falhas) process.exitCode = 1;
