import { useEffect, useRef, useState } from 'react';

export function formatarDigitosDataBR(valor) {
  const digitos = String(valor || '').replace(/\D/g, '').slice(0, 8);
  if (digitos.length <= 2) return digitos;
  if (digitos.length <= 4) return `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
  return `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
}

export function dataBRParaISO(valor) {
  const correspondencia = String(valor || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!correspondencia) return null;

  const [, diaTexto, mesTexto, anoTexto] = correspondencia;
  const dia = Number(diaTexto);
  const mes = Number(mesTexto);
  const ano = Number(anoTexto);
  const data = new Date(Date.UTC(ano, mes - 1, dia));

  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) {
    return null;
  }

  return `${anoTexto}-${mesTexto}-${diaTexto}`;
}

export function dataISOParaBR(valor) {
  const texto = String(valor || '').slice(0, 10);
  const correspondencia = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (correspondencia) return `${correspondencia[3]}/${correspondencia[2]}/${correspondencia[1]}`;
  return formatarDigitosDataBR(texto);
}

/**
 * Campo textual de data para os fluxos operacionais que precisam aceitar apenas DD/MM/AAAA.
 * O estado externo continua em ISO (AAAA-MM-DD), preservando os contratos atuais da API.
 *
 * ## POR QUE ELE EXISTE, E NAO `<input type="date">` (06/09 — medido)
 *
 * O `<input type="date">` e desenhado pelo NAVEGADOR, e a ordem dos campos
 * sai do idioma da INTERFACE do navegador — nao do `lang="pt-BR"` da pagina,
 * nao do `Accept-Language`, nao de nada que o HTML possa dizer. Medido no
 * Chromium com o mesmo HTML:
 *
 *   contexto pt-BR (locale da pagina)     -> Month / Day / Year
 *   contexto de-DE                        -> Month / Day / Year
 *   processo com LANG=pt_BR.UTF-8         -> Dia / Mes / Ano
 *
 * Ou seja: a mesma tela mostra `mm/dd/yyyy` na maquina de um usuario e
 * `dd/mm/aaaa` na de outro, e a pagina NAO tem como corrigir isso. Numa
 * construtora brasileira, 03/04 lido como 4 de marco em vez de 3 de abril
 * e diferenca de vencimento, nao de gosto.
 *
 * Este campo e texto com mascara: le-se DD/MM/AAAA em qualquer maquina
 * (medido nos tres contextos acima, sempre "04/03/2026"). O valor que sai
 * continua ISO, entao nada muda para a API.
 *
 * `min`/`max` chegam em ISO (AAAA-MM-DD), como no campo nativo, e sao
 * cobrados por `setCustomValidity` — o nativo tambem so marca invalido, nao
 * impede digitar. Sem isso, as 5 telas que declaravam limite de data
 * perderiam a trava em silencio ao migrar.
 */
export default function DateInputBR({ name, value, onChange, className = '', min, max, ...props }) {
  const [texto, setTexto] = useState(() => dataISOParaBR(value));
  const inputRef = useRef(null);
  const focadoRef = useRef(false);

  function problemaDoTexto(atual) {
    if (!atual) return '';
    if (atual.length < 10) return 'Informe uma data válida no formato DD/MM/AAAA.';
    const iso = dataBRParaISO(atual);
    if (!iso) return 'Informe uma data válida no formato DD/MM/AAAA.';
    if (min && iso < String(min)) return `A data não pode ser anterior a ${dataISOParaBR(min)}.`;
    if (max && iso > String(max)) return `A data não pode ser posterior a ${dataISOParaBR(max)}.`;
    return '';
  }

  useEffect(() => {
    // Enquanto a pessoa digita, o estado externo pode ficar vazio por a data ainda estar
    // incompleta. Nao devemos apagar o texto parcial nesse intervalo.
    if (!focadoRef.current) setTexto(dataISOParaBR(value));
  }, [value]);

  function emitir(valorISO) {
    onChange?.({ target: { name, value: valorISO } });
  }

  function atualizar(event) {
    const proximoTexto = formatarDigitosDataBR(event.target.value);
    const completa = proximoTexto.length === 10;
    const valorISO = completa ? dataBRParaISO(proximoTexto) : null;

    setTexto(proximoTexto);
    inputRef.current?.setCustomValidity(completa ? problemaDoTexto(proximoTexto) : '');

    // A API recebe apenas ISO valido. Texto parcial ou invalido limpa imediatamente o valor
    // externo, impedindo que o formulario envie silenciosamente a data anterior.
    emitir(valorISO || '');
  }

  function validarAoSair(event) {
    focadoRef.current = false;
    const incompleta = texto.length > 0 && texto.length < 10;
    const invalida = texto.length === 10 && !dataBRParaISO(texto);
    event.currentTarget.setCustomValidity(problemaDoTexto(texto));
    if (incompleta || invalida) emitir('');
    props.onBlur?.(event);
  }

  function registrarFoco(event) {
    focadoRef.current = true;
    props.onFocus?.(event);
  }

  return (
    <input
      {...props}
      ref={inputRef}
      name={name}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={10}
      placeholder={props.placeholder || 'DD/MM/AAAA'}
      className={className}
      value={texto}
      onChange={atualizar}
      onFocus={registrarFoco}
      onBlur={validarAoSair}
      pattern="\d{2}/\d{2}/\d{4}"
      title="Informe a data no formato DD/MM/AAAA"
    />
  );
}
