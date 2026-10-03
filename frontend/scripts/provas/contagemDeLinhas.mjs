/**
 * PROVA — contagem de linhas de texto (checks.mjs / T4 e T6).
 *
 * Por que existe: este medidor foi escrito ERRADO TRÊS VEZES, e cada versão
 * custou ~15 células FALHOU falsas numa matriz de 28 telas — ruído que
 * apagou o sinal das falhas reais.
 *   1ª: `scrollHeight > lineHeight*1.6` — scrollHeight inclui o PADDING,
 *       toda célula parecia quebrada.
 *   2ª: `clientHeight - padding` — numa TABELA, clientHeight da célula é a
 *       altura da LINHA: uma célula quebrada contaminava as vizinhas.
 *   3ª: `Range` sobre o elemento — devolve retângulo da CAIXA de cada filho
 *       além do texto; todo selo e todo botão viravam "duas linhas".
 *
 * O caso que separa as gerações é a célula com SELO: `.fx-badge` tem
 * padding próprio, então a caixa e o texto ficam a ~6px um do outro.
 *
 * Rode com `npm run provas`.
 */
import { chromium } from 'playwright';

const PAGINA = `<!doctype html><meta charset="utf-8"><style>
 body{font:14px/21px system-ui;margin:0}
 table{border-collapse:collapse;table-layout:fixed;width:640px}
 td{padding:12px;vertical-align:top;border:1px solid #ccc}
 .fx-badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;
           border:1px solid #ccc;font-size:12px;line-height:1.5;white-space:nowrap}
 .btn{display:inline-flex;padding:6px 10px;border:1px solid #ccc;border-radius:6px}
 .estreita{width:90px;word-break:break-all}
 .larga{width:280px}
</style>
<table><tbody>
 <tr>
  <td id="selo" class="larga"><span class="fx-badge">FECHADO</span></td>
  <td id="botao" class="larga"><span class="btn">Abrir</span></td>
  <td id="documentoQuebrado" class="estreita">125.531.247-59</td>
 </tr>
 <tr>
  <td id="palavraCurta" class="larga">Ativa</td>
  <td id="traco" class="larga">-</td>
  <td id="nomeEmTresLinhas" class="estreita">ADAILTON FARIAS MACHADO</td>
 </tr>
</tbody></table>`;

/* Espelha `linhasDeTexto` de scripts/qa-preview/checks.mjs */
const MEDIDOR = `(el) => {
  if (!el) return 0;
  const percorrer = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const topos = [];
  let no = percorrer.nextNode();
  while (no) {
    if (no.nodeValue && no.nodeValue.trim()) {
      const intervalo = document.createRange();
      intervalo.selectNodeContents(no);
      Array.from(intervalo.getClientRects())
        .filter((r) => r.width > 0 && r.height > 0)
        .forEach((r) => { if (!topos.some((t) => Math.abs(t - r.top) <= 3)) topos.push(r.top); });
    }
    no = percorrer.nextNode();
  }
  return topos.length;
}`;

const ESPERADO = {
  // Selo e botão têm caixa com padding: NÃO são duas linhas (falso positivo
  // da 3ª geração, 15 células).
  selo: 1,
  botao: 1,
  // Texto simples numa célula que a linha estica: 1 (falso positivo da 2ª).
  palavraCurta: 1,
  traco: 1,
  // Quebra de VERDADE tem de continuar sendo pega — senão trocamos alarme
  // por cegueira.
  documentoQuebrado: 2,
  nomeEmTresLinhas: 3
};

const navegador = await chromium.launch({ args: ['--ssl-version-max=tls1.2'] });
try {
  const pagina = await navegador.newPage();
  await pagina.setContent(PAGINA);
  const medido = await pagina.evaluate((fonte) => {
    const medir = eval(fonte);
    return Object.fromEntries(
      ['selo', 'botao', 'documentoQuebrado', 'palavraCurta', 'traco', 'nomeEmTresLinhas']
        .map((id) => [id, medir(document.getElementById(id))])
    );
  }, MEDIDOR);

  let falhas = 0;
  Object.entries(ESPERADO).forEach(([id, esperado]) => {
    const bate = medido[id] === esperado;
    if (!bate) falhas += 1;
    console.log(`${bate ? '  ok  ' : ' FALHA'} ${id}: ${medido[id]} linha(s)${bate ? '' : ` (esperado ${esperado})`}`);
  });
  console.log(falhas ? `\n[provas] contagem de linhas: ${falhas} falha(s)` : '\n[provas] contagem de linhas: ok');
  process.exitCode = falhas ? 1 : 0;
} finally {
  await navegador.close();
}
