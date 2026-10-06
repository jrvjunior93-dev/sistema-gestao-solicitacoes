import { useEffect, useRef, useState } from 'react';
import { formatarQuantidadeCanonicaBR, parseQuantidadeDigitadaBR } from '../utils/quantidadeBR';

// O texto localizado fica no input; o estado do formulario continua canonico.
// Assim rateio, totais, preview, rascunho e API usam a mesma quantidade numerica.
export default function QuantidadeInputBR({ value, onChange, onFocus, onBlur, ...props }) {
  const [texto, setTexto] = useState(() => formatarQuantidadeCanonicaBR(value));
  const focado = useRef(false);
  const input = useRef(null);

  useEffect(() => {
    if (!focado.current) {
      setTexto(formatarQuantidadeCanonicaBR(value));
      input.current?.setCustomValidity('');
    }
  }, [value]);

  function atualizar(event) {
    const digitado = event.target.value;
    const quantidade = parseQuantidadeDigitadaBR(digitado);
    const problema = digitado.trim() && (quantidade === null || quantidade <= 0)
      ? 'Informe uma quantidade maior que zero, com até duas casas decimais. Use 2.000 para milhares e 2,5 para decimais.'
      : '';
    setTexto(digitado);
    input.current?.setCustomValidity(problema);
    onChange?.({ target: { name: props.name, value: quantidade === null ? '' : String(quantidade) } });
  }

  return (
    <input
      {...props}
      ref={input}
      type="text"
      inputMode="decimal"
      title="Ponto separa milhares; vírgula separa decimais. Ex.: 2.000 ou 2,5."
      value={texto}
      onChange={atualizar}
      onFocus={(event) => { focado.current = true; onFocus?.(event); }}
      onBlur={(event) => {
        focado.current = false;
        const quantidade = parseQuantidadeDigitadaBR(texto);
        if (quantidade !== null && quantidade > 0) setTexto(formatarQuantidadeCanonicaBR(quantidade));
        onBlur?.(event);
      }}
    />
  );
}
