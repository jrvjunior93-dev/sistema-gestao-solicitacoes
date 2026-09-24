import CompetenciaInputBR, { competenciaISOParaBR } from '../CompetenciaInputBR';
import {
  formatCurrencyBRL,
  formatCurrencyInput,
  normalizeCurrencyTyping,
  parseCurrencyInput
} from '../../utils/formatters';

function somarMesesCompetencia(competencia, deslocamento) {
  const correspondencia = String(competencia || '').match(/^(\d{4})-(\d{2})$/);
  if (!correspondencia) return '';
  const data = new Date(Date.UTC(
    Number(correspondencia[1]),
    Number(correspondencia[2]) - 1 + deslocamento,
    1
  ));
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function gerarValoresParcelasEvento(formulario) {
  const quantidade = Math.min(240, Math.max(0, Number(formulario.parcelas_total || 0)));
  if (!Number.isInteger(quantidade) || !quantidade) return [];
  const valorCentavos = Math.round(parseCurrencyInput(formulario.valor) * 100);
  if (!(valorCentavos > 0)) return Array.from({ length: quantidade }, () => '');
  if (formulario.modo_valor === 'PARCELA') {
    return Array.from(
      { length: quantidade },
      () => formatCurrencyInput(String(valorCentavos / 100), { emptyZero: false })
    );
  }
  const base = Math.floor(valorCentavos / quantidade);
  const resto = valorCentavos - (base * quantidade);
  return Array.from({ length: quantidade }, (_, index) => formatCurrencyInput(
    String((base + (index === quantidade - 1 ? resto : 0)) / 100),
    { emptyZero: false }
  ));
}

export function normalizarFormularioEvento(evento = {}) {
  let parcelasArmazenadas = Array.isArray(evento.parcelas_valores_json)
    ? evento.parcelas_valores_json
    : Array.isArray(evento.parcelas_valores)
      ? evento.parcelas_valores
      : [];
  const modo = String(evento.modo_valor || 'TOTAL').toUpperCase();
  const valorBase = modo === 'TOTAL'
    ? (evento.valor_total ?? evento.valor ?? '')
    : (evento.valor_parcela ?? evento.valor ?? '');
  const formulario = {
    ...evento,
    modo_valor: modo,
    valor: valorBase === '' ? '' : formatCurrencyInput(String(valorBase), { emptyZero: false }),
    parcelas_total: evento.parcelas_total ? String(evento.parcelas_total) : '',
    parcelas_valores: []
  };
  if (formulario.parcelas_total) {
    const geradas = gerarValoresParcelasEvento(formulario);
    const aplicadas = Array.isArray(evento.parcelas_aplicadas_valores)
      ? evento.parcelas_aplicadas_valores
      : [];
    formulario.parcelas_valores = geradas.map((valor, index) => {
      const armazenado = parcelasArmazenadas[index];
      const aplicado = aplicadas[index];
      const efetivo = aplicado ?? armazenado;
      return efetivo === undefined
        ? valor
        : formatCurrencyInput(String(efetivo), { emptyZero: false });
    });
  }
  return formulario;
}

export function valoresParcelasParaPayload(formulario) {
  if (!Number(formulario.parcelas_total)) return undefined;
  return (formulario.parcelas_valores || []).map((valor) => parseCurrencyInput(valor));
}

export function validarParcelasEvento(formulario) {
  const quantidade = Number(formulario.parcelas_total || 0);
  if (formulario.modo_valor === 'TOTAL' && !quantidade) {
    return 'Informe a quantidade de parcelas para dividir o valor total.';
  }
  if (!quantidade) return '';
  const valores = valoresParcelasParaPayload(formulario) || [];
  if (valores.length !== quantidade || valores.some((valor) => !(valor > 0))) {
    return `Informe os valores das ${quantidade} parcelas.`;
  }
  if (formulario.modo_valor === 'TOTAL') {
    const soma = valores.reduce((total, valor) => total + Math.round(valor * 100), 0);
    const total = Math.round(parseCurrencyInput(formulario.valor) * 100);
    if (soma !== total) return 'A soma das parcelas precisa ser igual ao valor total informado.';
  }
  return '';
}

function regenerarParcelas(formulario, alteracoes, parcelasBloqueadas = 0) {
  const proximo = { ...formulario, ...alteracoes };
  const geradas = gerarValoresParcelasEvento(proximo);
  const atuais = Array.isArray(formulario.parcelas_valores) ? formulario.parcelas_valores : [];
  proximo.parcelas_valores = geradas.map((valor, index) => (
    index < parcelasBloqueadas && atuais[index] ? atuais[index] : valor
  ));
  return proximo;
}

export default function ParcelasEventoEditor({ valor, onChange, parcelasBloqueadas = 0 }) {
  const quantidade = Number(valor.parcelas_total || 0);
  const parcelas = Array.isArray(valor.parcelas_valores) ? valor.parcelas_valores : [];
  const somaCentavos = parcelas.reduce(
    (total, parcela) => total + Math.round(parseCurrencyInput(parcela) * 100),
    0
  );
  const totalCentavos = Math.round(parseCurrencyInput(valor.valor) * 100);
  const diferencaCentavos = valor.modo_valor === 'TOTAL' ? totalCentavos - somaCentavos : 0;

  function alterarBase(alteracoes) {
    onChange(regenerarParcelas(valor, alteracoes, parcelasBloqueadas));
  }

  return (
    <div className="space-y-3" style={{ gridColumn: '1 / -1' }}>
      <div className="rh-colaboradores-filter-grid">
        <label className="form-field">
          <span className="form-label form-label--required">Valor informado como</span>
          <select
            className="form-control"
            value={valor.modo_valor}
            onChange={(event) => alterarBase({ modo_valor: event.target.value })}
          >
            <option value="TOTAL">Total a dividir em parcelas</option>
            <option value="PARCELA">Valor de cada parcela</option>
          </select>
        </label>

        <label className="form-field">
          <span className="form-label form-label--required">
            {valor.modo_valor === 'TOTAL' ? 'Valor total' : 'Valor de cada parcela'}
          </span>
          <input
            className="form-control"
            inputMode="decimal"
            value={valor.valor}
            onChange={(event) => alterarBase({ valor: normalizeCurrencyTyping(event.target.value) })}
            onBlur={(event) => alterarBase({ valor: formatCurrencyInput(event.target.value) })}
            required
          />
        </label>

        <label className="form-field">
          <span className="form-label form-label--required">Competência inicial</span>
          <CompetenciaInputBR
            className="form-control"
            value={valor.competencia_inicio}
            onChange={(event) => onChange({ ...valor, competencia_inicio: event.target.value })}
            disabled={parcelasBloqueadas > 0}
            required
          />
          {parcelasBloqueadas > 0 ? (
            <span className="app-note">A competência inicial não muda após a primeira aplicação.</span>
          ) : null}
        </label>

        <label className="form-field">
          <span className={valor.modo_valor === 'TOTAL' ? 'form-label form-label--required' : 'form-label'}>
            Quantidade de parcelas
          </span>
          <input
            className="form-control"
            type="number"
            min={Math.max(1, parcelasBloqueadas)}
            max="240"
            placeholder={valor.modo_valor === 'PARCELA' ? 'Vazio = sem término' : undefined}
            value={valor.parcelas_total}
            onChange={(event) => alterarBase({ parcelas_total: event.target.value })}
            required={valor.modo_valor === 'TOTAL'}
          />
        </label>
      </div>

      {quantidade > 0 ? (
        <div className="table-wrapper" aria-label="Parcelas do evento recorrente">
          <table className="table">
            <thead>
              <tr>
                <th>Parcela</th>
                <th>Competência</th>
                <th>Valor</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: quantidade }, (_, index) => {
                const bloqueada = index < parcelasBloqueadas;
                return (
                  <tr key={index}>
                    <td>{index + 1}/{quantidade}</td>
                    <td>{competenciaISOParaBR(somarMesesCompetencia(valor.competencia_inicio, index)) || '—'}</td>
                    <td>
                      <input
                        className="form-control"
                        inputMode="decimal"
                        aria-label={`Valor da parcela ${index + 1}`}
                        value={parcelas[index] || ''}
                        disabled={bloqueada}
                        onChange={(event) => {
                          const atualizadas = [...parcelas];
                          atualizadas[index] = normalizeCurrencyTyping(event.target.value);
                          onChange({ ...valor, parcelas_valores: atualizadas });
                        }}
                        onBlur={(event) => {
                          const atualizadas = [...parcelas];
                          atualizadas[index] = formatCurrencyInput(event.target.value);
                          onChange({ ...valor, parcelas_valores: atualizadas });
                        }}
                        required
                      />
                    </td>
                    <td>{bloqueada ? 'Já aplicada' : 'Editável'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="app-note">
          {valor.modo_valor === 'TOTAL'
            ? 'Informe a quantidade para gerar as parcelas e seus vencimentos por competência.'
            : 'Sem quantidade, o valor informado será repetido mensalmente até o evento ser cancelado.'}
        </p>
      )}

      {quantidade > 0 ? (
        <p className="app-note">
          Soma das parcelas: <strong>{formatCurrencyBRL(somaCentavos / 100)}</strong>
          {valor.modo_valor === 'TOTAL' ? (
            <> · Diferença: <strong>{formatCurrencyBRL(diferencaCentavos / 100)}</strong></>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
