import { useLayoutEffect, useReducer, useRef, useState } from 'react';
import { formatCurrencyBRL, normalizeCurrencyTyping, parseCurrencyInput } from '../utils/formatters';

const digitos = texto => texto.replace(/\D/g, '');

// Mascara por centavos, igual aos demais campos monetarios do Fluxy. O pai
// recebe decimal canonico; somente o texto do input usa R$, pontos e virgula.
export default function MoedaInputBR({ value, onChange, ...props }) {
  const input = useRef(null), cursor = useRef(null), selecao = useRef(null), compondo = useRef(false);
  const [, renderizar] = useReducer(n => n + 1, 0);
  const [composicao, setComposicao] = useState(null);
  const texto = value === '' || value == null ? '' : formatCurrencyBRL(value);

  useLayoutEffect(() => {
    const pedido = cursor.current; cursor.current = null;
    const el = input.current;
    if (!pedido || !el || document.activeElement !== el || el.value !== pedido.texto) return;
    const posicoes = [...el.value.matchAll(/\d/g)].map(m => m.index);
    const esquerda = posicoes.length - pedido.direita;
    const posicao = pedido.direita === 0 ? el.value.length
      : esquerda > 0 ? posicoes[esquerda - 1] + 1 : posicoes[0] ?? 0;
    el.setSelectionRange(posicao, posicao);
  });

  function lembrarSelecao(event) {
    selecao.current = event.currentTarget.selectionStart === event.currentTarget.selectionEnd;
  }

  function atualizar(event) {
    const el = event.currentTarget;
    if (compondo.current || event.nativeEvent?.isComposing) { setComposicao(el.value); return; }
    let digitado = el.value, posicao = el.selectionStart ?? digitado.length;
    const tipo = event.nativeEvent?.inputType;
    // Apagar uma pontuacao da mascara deve avancar a edicao, sem recolocar o
    // mesmo separador indefinidamente (inclusive nos teclados de celular).
    if (selecao.current !== false && digitos(digitado) === digitos(texto)) {
      let indice = -1;
      if (tipo === 'deleteContentBackward') {
        for (let i = posicao - 1; i >= 0; i--) if (/\d/.test(digitado[i])) { indice = i; break; }
      } else if (tipo === 'deleteContentForward') {
        for (let i = posicao; i < digitado.length; i++) if (/\d/.test(digitado[i])) { indice = i; break; }
      }
      if (indice >= 0) { digitado = digitado.slice(0, indice) + digitado.slice(indice + 1); posicao = Math.min(posicao, indice); }
    }
    selecao.current = null;
    if (/^delete/.test(tipo || '') && /^0*$/.test(digitos(digitado))) { digitado = ''; posicao = 0; }
    const localizado = normalizeCurrencyTyping(digitado);
    const canonico = localizado ? parseCurrencyInput(localizado).toFixed(2) : '';
    cursor.current = { texto: localizado, direita: digitos(digitado.slice(posicao)).length };
    onChange(canonico);
    // Mesmo valor numerico pode ter mudado apenas a pontuacao/cursor.
    renderizar();
  }

  return <input {...props} ref={input} type="text" inputMode="decimal" value={composicao ?? texto}
    onBeforeInput={lembrarSelecao} onKeyDown={lembrarSelecao} onChange={atualizar}
    onCompositionStart={event => { compondo.current = true; setComposicao(event.currentTarget.value); }}
    onCompositionEnd={event => { compondo.current = false; setComposicao(null); atualizar(event); }} />;
}
