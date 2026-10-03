#!/usr/bin/env node
/**
 * PROVA — RESPOSTA DE ERRO NÃO CHEGA CRUA AO USUÁRIO.
 * ============================================================================
 *
 * O DEFEITO QUE ISSO FECHA (achado A2 do revisor separado, 06/09): em
 * `comercial-unidades` a pessoa via, numa faixa vermelha de sete linhas em
 * 390px, o corpo inteiro da resposta do servidor —
 *
 *     <!DOCTYPE html> … <pre>Cannot GET /api/comercial/unidades-configuracao</pre>
 *
 * A CAUSA DO "Cannot GET" SEGUE NÃO DIAGNOSTICADA, e esta prova não a
 * inventa: a rota existe no backend, o front a chama certo e a API, com o
 * prefixo `/api`, responde 401 (o próprio revisor derrubou a hipótese de
 * "API defasada" e registrou que o erro tinha sido do teste dele). O que se
 * prova aqui é o defeito de produto que independe da causa: seja qual for o
 * erro, o CORPO CRU não pode virar texto de tela.
 *
 * ----------------------------------------------------------------------------
 * DE QUANTOS JEITOS ISSO ERA FEITO AQUI — a medição que decidiu o conserto.
 *
 * 26 funções de tratamento de resposta em 18 arquivos de serviço, com seis
 * nomes diferentes para a mesma coisa (`parseJson`, `parseResponse`,
 * `handleJsonResponse`, `tratarResposta`, `parse`, `parseJsonOrThrow`), e
 * 47 pontos montando a mensagem a partir do corpo cru — "se não deu para
 * entender a resposta, mostre a resposta". Vinte e seis jeitos, o mesmo furo
 * em todos. O conserto não foi um vigésimo sétimo jeito: foi UM lugar
 * (`src/services/erroDeResposta.js`) e os outros passando por ele.
 *
 * ----------------------------------------------------------------------------
 * ESTA PROVA TEM DUAS METADES, e as duas são necessárias:
 *
 *   COMPORTAMENTO — a regra decide certo, com os corpos REAIS (o HTML do
 *   Express que o revisor capturou, o JSON de erro do backend, o texto puro
 *   curto que rotas antigas devolvem, o corpo vazio).
 *
 *   ALCANCE — nenhum serviço voltou a construir mensagem com o corpo cru.
 *   Regra certa aplicada em 29 dos 30 lugares é o mesmo defeito com uma
 *   tela a menos.
 *
 * A MORDIDA planta as duas de volta, uma por metade, e exige que cada uma
 * reprove.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(RAIZ, 'src');
const REGRA = path.join(SRC, 'services', 'erroDeResposta.js');

let falhas = 0;
const registrar = (ok, texto) => {
  if (!ok) falhas += 1;
  console.log(`${ok ? '  ok   ' : '  FALHA'} ${texto}`);
};

/* O corpo EXATO que o Express devolve numa rota que ele não conhece — é o
   que apareceu na tela do revisor, e é por isso que ele está aqui inteiro
   em vez de resumido. */
const HTML_DO_EXPRESS = [
  '<!DOCTYPE html>',
  '<html lang="en">',
  '<head>',
  '<meta charset="utf-8">',
  '<title>Error</title>',
  '</head>',
  '<body>',
  '<pre>Cannot GET /api/comercial/unidades-configuracao</pre>',
  '</body>',
  '</html>'
].join('\n');

const arquivos = (dir, filtro) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return arquivos(p, filtro);
  return filtro.test(e.name) ? [p] : [];
});

/*
  A VARREDURA DE ALCANCE.

  Ela não procura um texto: procura a FORMA do defeito. Acha a variável que
  recebeu o corpo da resposta (`const text = await res.text()`,
  `.text().then((text) => …)`) e cobra que nenhuma mensagem de erro seja
  construída a partir dela. Procurar pela string `text ||` pegaria só o
  jeito de hoje; a forma pega o jeito de amanhã também.
*/
function varrerVazamentos() {
  const achados = [];
  for (const arquivo of arquivos(SRC, /\.jsx?$/)) {
    if (path.resolve(arquivo) === REGRA) continue;
    const codigo = fs.readFileSync(arquivo, 'utf8');
    const rel = path.relative(RAIZ, arquivo).replace(/\\/g, '/');
    const variaveis = new Set([
      ...[...codigo.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?[\w.?]+\.text\(\)/g)].map((m) => m[1]),
      ...[...codigo.matchAll(/\.text\(\)\s*\.then\(\s*\(?(\w+)\)?/g)].map((m) => m[1])
    ]);
    for (const nome of variaveis) {
      const padroes = [
        [new RegExp(`new Error\\(\\s*${nome}\\b`, 'g'), `new Error(${nome} …)`],
        [new RegExp(`\\bmessage\\s*=\\s*[^;\\n]*\\b${nome}\\b`, 'g'), `message = … ${nome} …`],
        [new RegExp(`\\bmensagem\\s*=\\s*[^;\\n]*\\b${nome}\\b`, 'g'), `mensagem = … ${nome} …`]
      ];
      for (const [padrao, forma] of padroes) {
        for (const m of codigo.matchAll(padrao)) {
          achados.push(`${rel}:${codigo.slice(0, m.index).split('\n').length}  ${forma}`);
        }
      }
    }
  }
  return achados;
}

/* Conta em quantos arquivos a regra única é usada — o número que diz se o
   conserto ALCANÇOU os trinta jeitos ou só o que estava na frente. */
function servicosQueUsamARegra() {
  return arquivos(SRC, /\.jsx?$/).filter((f) => (
    path.resolve(f) !== REGRA && /from '[^']*erroDeResposta'/.test(fs.readFileSync(f, 'utf8'))
  ));
}

async function carregarRegra() {
  /* `?v=` para escapar do cache de módulo entre a corrida normal e a
     mordida — sem isso a segunda leitura devolveria a primeira. */
  const mod = await import(`${new URL('file://' + REGRA).href}?v=${Date.now()}`);
  return mod.mensagemDeErro;
}

async function main() {
  console.log('\n— 1. a regra decide certo, com os corpos reais —');
  {
    const mensagemDeErro = await carregarRegra();

    const doHtml = mensagemDeErro(HTML_DO_EXPRESS, 'Erro ao carregar unidades comerciais', 404);
    registrar(!/[<>]/.test(doHtml) && !doHtml.includes('Cannot GET'),
      `o HTML do Express NÃO chega à tela :: "${doHtml}"`);
    registrar(doHtml.includes('404'),
      `e o código do erro não se perde junto com ele :: "${doHtml}"`);
    registrar(!doHtml.includes('\n'),
      `uma linha, não sete :: ${doHtml.split('\n').length} linha(s)`);

    const doJson = mensagemDeErro('{"error":"Unidade ja cadastrada nesta torre."}', 'Erro ao salvar', 409);
    registrar(doJson === 'Unidade ja cadastrada nesta torre.',
      `a mensagem que o BACKEND escreveu continua chegando inteira :: "${doJson}"`);

    const doTexto = mensagemDeErro('Sessao expirada', 'Erro ao buscar', 401);
    registrar(doTexto === 'Sessao expirada',
      `texto puro curto continua chegando (rotas antigas devolvem assim) :: "${doTexto}"`);

    const vazio = mensagemDeErro('', 'Erro ao buscar unidades', 500);
    registrar(vazio.includes('Erro ao buscar unidades') && vazio.includes('500'),
      `corpo vazio cai na frase do serviço, com o código :: "${vazio}"`);

    const enorme = mensagemDeErro('x'.repeat(5000), 'Erro ao buscar', 500);
    registrar(enorme.length < 400, `corpo enorme não vira parede de texto :: ${enorme.length} caracteres`);

    const listaDeErros = mensagemDeErro('{"errors":[{"message":"CNPJ invalido"},{"message":"Obra obrigatoria"}]}', 'Erro ao salvar', 422);
    registrar(listaDeErros.includes('CNPJ invalido') && listaDeErros.includes('Obra obrigatoria'),
      `lista de erros de validação não se perde :: "${listaDeErros}"`);
  }

  console.log('\n— 2. alcance: nenhum serviço monta mensagem com o corpo cru —');
  {
    const vazamentos = varrerVazamentos();
    registrar(vazamentos.length === 0,
      `varredura de ${arquivos(SRC, /\.jsx?$/).length} arquivos :: ${vazamentos.length
        ? `${vazamentos.length} ponto(s) ainda despejam o corpo:\n         ${vazamentos.join('\n         ')}`
        : 'nenhum ponto despeja corpo de resposta'}`);
    const usam = servicosQueUsamARegra();
    registrar(usam.length >= 15,
      `e a regra única é de fato usada :: ${usam.length} arquivos de serviço passam pelo \`erroDeResposta\``);
  }

  console.log('\n— 3. mordida: a regra devolvendo o corpo cru de novo —');
  {
    const original = fs.readFileSync(REGRA, 'utf8');
    /* O que se planta é a REGRA INTEIRA de antes — `corpo || alternativa`,
       que é literalmente o `text || fallbackMessage` dos 35 pontos. Plantar
       só a guarda de marcação não bastava: o HTML do Express também é longo
       e multilinha, e as outras guardas o seguravam — a mordida passava a
       dizer "não acusou" sobre um defeito que o resto da regra impedia. Uma
       mordida tem de plantar o defeito INTEIRO. */
    const alvo = "  if (!cru) return comStatus(alternativa, status);";
    if (!original.includes(alvo)) {
      registrar(false, 'a mordida não achou o ponto plantável em erroDeResposta.js — '
        + 'a regra mudou de forma e esta mordida precisa ser reescrita, não removida');
    } else {
      const restaurar = () => {
        try {
          if (fs.readFileSync(REGRA, 'utf8') !== original) fs.writeFileSync(REGRA, original);
        } catch (_) { /* nada a fazer no caminho de saída */ }
      };
      process.on('exit', restaurar);
      try {
        fs.writeFileSync(REGRA, original.replace(alvo, '  return cru || comStatus(alternativa, status);'));
        const comDefeito = await carregarRegra();
        const saida = comDefeito(HTML_DO_EXPRESS, 'Erro ao carregar unidades comerciais', 404);
        const acusou = /Cannot GET|[<>]/.test(saida);
        registrar(acusou, `com a regra de antes (\`corpo || alternativa\`), a saída volta a carregar o HTML`
          + ` (${saida.slice(0, 60)}…) · a medição ACUSA, como tem de acusar`);
      } finally {
        restaurar();
      }
    }
  }

  console.log('\n— 4. mordida: um serviço voltando a despejar o corpo —');
  {
    const cobaia = path.join(SRC, 'services', 'comercial.js');
    const original = fs.readFileSync(cobaia, 'utf8');
    const alvo = 'throw new Error(mensagemDeErro(text, fallbackMessage, response.status));';
    if (!original.includes(alvo)) {
      registrar(false, 'a mordida não achou o ponto plantável em services/comercial.js — reescrever a mordida');
    } else {
      const restaurar = () => {
        try {
          if (fs.readFileSync(cobaia, 'utf8') !== original) fs.writeFileSync(cobaia, original);
        } catch (_) { /* nada a fazer no caminho de saída */ }
      };
      process.on('exit', restaurar);
      try {
        fs.writeFileSync(cobaia, original.replace(alvo, 'throw new Error(text || fallbackMessage);'));
        const vazamentos = varrerVazamentos();
        const acusou = vazamentos.some((v) => v.includes('services/comercial.js'));
        registrar(acusou, `com o \`text || fallback\` de volta em services/comercial.js,`
          + ` a varredura achou ${vazamentos.length} ponto(s)`
          + (acusou ? ' · a medição ACUSA, como tem de acusar'
            : ' · NÃO ACUSOU, e devia: a varredura de alcance não está medindo nada'));
      } finally {
        restaurar();
      }
    }
  }

  console.log(`\n[provas] erro de servidor não chega cru ao usuário: ${falhas === 0 ? 'ok' : `${falhas} medida(s) reprovada(s)`}`);
  if (falhas) process.exitCode = 1;
}

await main();
