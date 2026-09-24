import { useEffect, useRef, useState } from 'react';
import { HiOutlineCalendarDays } from 'react-icons/hi2';

export function formatarDigitosCompetenciaBR(valor) {
  const digitos = String(valor || '').replace(/\D/g, '').slice(0, 6);
  if (digitos.length <= 2) return digitos;
  return `${digitos.slice(0, 2)}-${digitos.slice(2)}`;
}

export function competenciaBRParaISO(valor) {
  const correspondencia = String(valor || '').match(/^(\d{2})-(\d{4})$/);
  if (!correspondencia) return null;
  const mes = Number(correspondencia[1]);
  if (mes < 1 || mes > 12) return null;
  return `${correspondencia[2]}-${correspondencia[1]}`;
}

export function competenciaISOParaBR(valor) {
  const correspondencia = String(valor || '').match(/^(\d{4})-(\d{2})$/);
  if (correspondencia) return `${correspondencia[2]}-${correspondencia[1]}`;
  return formatarDigitosCompetenciaBR(valor);
}

/**
 * Competencia legivel como MM-AAAA, com seletor nativo de meses e valor externo AAAA-MM.
 * O contrato da API permanece inalterado e a pessoa nao precisa digitar nem inverter o ano.
 */
export default function CompetenciaInputBR({ name, value, onChange, className = '', disabled, ...props }) {
  const [texto, setTexto] = useState(() => competenciaISOParaBR(value));
  const inputRef = useRef(null);
  const pickerRef = useRef(null);
  const focadoRef = useRef(false);

  useEffect(() => {
    if (!focadoRef.current) setTexto(competenciaISOParaBR(value));
  }, [value]);

  function emitir(valorISO) {
    onChange?.({ target: { name, value: valorISO } });
  }

  function atualizarTexto(event) {
    const proximoTexto = formatarDigitosCompetenciaBR(event.target.value);
    const valorISO = proximoTexto.length === 7 ? competenciaBRParaISO(proximoTexto) : null;
    setTexto(proximoTexto);
    inputRef.current?.setCustomValidity(
      proximoTexto.length === 7 && !valorISO ? 'Informe uma competência válida no formato MM-AAAA.' : ''
    );
    emitir(valorISO || '');
  }

  function selecionarMes(event) {
    const valorISO = event.target.value;
    setTexto(competenciaISOParaBR(valorISO));
    inputRef.current?.setCustomValidity('');
    emitir(valorISO);
  }

  function abrirSeletor() {
    if (disabled) return;
    const picker = pickerRef.current;
    if (typeof picker?.showPicker === 'function') picker.showPicker();
    else picker?.click();
  }

  function validarAoSair(event) {
    focadoRef.current = false;
    const invalida = Boolean(texto) && !competenciaBRParaISO(texto);
    event.currentTarget.setCustomValidity(invalida ? 'Informe uma competência válida no formato MM-AAAA.' : '');
    if (invalida) emitir('');
    props.onBlur?.(event);
  }

  return (
    <div className="relative min-w-0">
      <input
        {...props}
        ref={inputRef}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={7}
        placeholder={props.placeholder || 'MM-AAAA'}
        className={`${className} pr-11`.trim()}
        value={texto}
        disabled={disabled}
        onChange={atualizarTexto}
        onFocus={(event) => {
          focadoRef.current = true;
          props.onFocus?.(event);
        }}
        onBlur={validarAoSair}
        pattern="(0[1-9]|1[0-2])-\d{4}"
        title="Informe a competência no formato MM-AAAA"
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[var(--app-muted-color)] transition-colors hover:text-[var(--c-primary)] disabled:cursor-not-allowed disabled:opacity-50"
        onClick={abrirSeletor}
        disabled={disabled}
        aria-label="Selecionar mês e ano"
        title="Selecionar mês e ano"
      >
        <HiOutlineCalendarDays className="h-5 w-5" aria-hidden="true" />
      </button>
      <input
        ref={pickerRef}
        type="month"
        className="pointer-events-none absolute bottom-0 right-0 h-px w-px opacity-0"
        tabIndex={-1}
        aria-hidden="true"
        value={/^\d{4}-\d{2}$/.test(String(value || '')) ? value : ''}
        onChange={selecionarMes}
        disabled={disabled}
      />
    </div>
  );
}
