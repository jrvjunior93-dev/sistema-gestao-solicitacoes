/**
 * STATGRID / STATTILE — o ladrilho de dado único, unificando os quatro
 * dialetos que existiam (InfoItem do detalhe, .app-summary-card, StatsCard
 * de paleta própria e o cartão da Home). Tom SEMPRE semântico via token;
 * nenhuma cor à mão (regra 1 do DESIGN-SYSTEM.md).
 */
import { Fragment } from 'react';
import { ehToken } from '../../utils/token';
/*
  `icone` (05/09) — slot de verdade para o ícone do ladrilho.

  Sem ele, quem tinha ícone no cartão antigo enfiava um fragmento dentro do
  `label` para não perder o desenho na migração. Funciona e é errado: o
  rótulo passa a carregar markup, o leitor de tela lê o ícone junto do texto,
  e o CSS do rótulo não tem como posicionar o que não sabe que existe.
  O ícone é decorativo — `aria-hidden`, e o significado fica no rótulo.
*/
/*
  ONDE O TOKEN PODE QUEBRAR — `<wbr>`, e não "em qualquer letra" (06/09).

  Defeito medido no `perfil` a 390: "qa.visual@fluxy.local" saía como
  "qa.visual@fluxy.loc" numa linha e "al" na outra. A causa é o
  `overflow-wrap: anywhere` do `.app-stat-valor`, que quebra em QUALQUER
  caractere — e um e-mail partido no meio do domínio vira outro e-mail aos
  olhos de quem lê.

  A conta exata, medida com o CSS real: o ladrilho de 390px dá 136px de
  largura útil ao valor e este token pede 141px. Falta por CINCO pixels — e
  é por isso que a saída NÃO é mexer na grade: a 414px já cabe, e um e-mail
  corporativo de verdade ("nome.sobrenome@empresa.com.br", 340px) não
  caberia em coluna nenhuma de celular. O que resolve a CLASSE do defeito é
  o token quebrar onde a leitura sobrevive.

  `<wbr>` e não o caractere invisível U+200B: o zero-width space VAI JUNTO
  quando a pessoa copia o e-mail, e colar um endereço com caractere
  invisível no meio é um defeito novo, pior e mais difícil de achar. O
  `<wbr>` é elemento, não texto — a cópia sai limpa.

  SÓ EM TOKEN. A definição de token é a do sistema (`utils/token.js`, a
  mesma que a `TabelaPadrao` usa): texto sem espaço nenhum. "R$ 1.234,56"
  tem espaço, não é token, e não ganha ponto de quebra depois do ponto dos
  milhares — que seria exatamente o defeito que esta função existe para
  evitar.
*/
const SEPARADORES_DE_TOKEN = /(?<=[@./\\_+-])/;

function comPontosDeQuebra(valor) {
  if (typeof valor !== 'string' || !ehToken(valor)) return valor;
  const partes = valor.split(SEPARADORES_DE_TOKEN);
  if (partes.length < 2) return valor;
  return partes.map((parte, i) => (
    <Fragment key={`${i}-${parte}`}>
      {parte}
      {i < partes.length - 1 ? <wbr /> : null}
    </Fragment>
  ));
}

export function StatTile({ label, valor, sub, tom, span, full, vazio = false, title, icone }) {
  const classes = [
    'app-stat',
    tom && `app-stat--${tom}`,
    full && 'app-stat--full',
    vazio && 'app-stat--vazio'
  ].filter(Boolean).join(' ');
  return (
    <div
      className={classes}
      style={span > 1 ? { gridColumn: `span ${span}` } : undefined}
      title={title}
    >
      <span className="app-stat-label">
        {icone ? <span className="app-stat-icone" aria-hidden="true">{icone}</span> : null}
        {label}
      </span>
      <span className="app-stat-valor">{vazio ? '—' : comPontosDeQuebra(valor)}</span>
      {sub ? <span className="app-stat-sub">{sub}</span> : null}
    </div>
  );
}

export default function StatGrid({ colunas = 4, className = '', children }) {
  return (
    <div
      className={`app-stat-grid ${className}`.trim()}
      style={colunas !== 4 ? { '--stat-colunas': colunas } : undefined}
    >
      {children}
    </div>
  );
}
