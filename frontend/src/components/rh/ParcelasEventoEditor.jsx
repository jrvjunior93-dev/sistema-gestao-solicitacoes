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
  const quantidade = Number(evento.parcelas_total || 0);
  const somaArmazenada = parcelasArmazenadas.reduce((total, valor) => total + Number(valor || 0), 0);
  const valorBase = quantidade
    ? (evento.valor_total ?? (somaArmazenada > 0
      ? somaArmazenada
      : Number(evento.valor_parcela || evento.valor || 0) * quantidade))
    : (evento.valor_parcela ?? evento.valor ?? '');
  const formulario = {
    ...evento,
    modo_valor: quantidade ? 'TOTAL' : 'PARCELA',
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
  if (!quantidade) return '';
  const valores = valoresParcelasParaPayload(formulario) || [];
  if (valores.length !== quantidade || valores.some((valor) => !(valor > 0))) {
    return `Informe os valores das ${quantidade} parcelas.`;
  }
  const soma = valores.reduce((total, valor) => total + Math.round(valor * 100), 0);
  const total = Math.round(parseCurrencyInput(formulario.valor) * 100);
  if (soma !== total) return 'A soma das parcelas precisa ser igual ao valor total informado.';
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
  const diferencaCentavos = totalCentavos - somaCentavos;

  function alterarBase(alteracoes) {
    onChange(regenerarParcelas(valor, alteracoes, parcelasBloqueadas));
  }

  function alterarQuantidade(proximaQuantidadeTexto) {
    const quantidadeAtual = Number(valor.parcelas_total || 0);
    const proximaQuantidade = Number(proximaQuantidadeTexto || 0);
    let proximoValor = valor.valor;

    // Ao alternar entre recorrencia mensal e parcelamento, preserva o valor economico mensal que
    // a pessoa ja informou. Entre duas quantidades finitas, o total permanece e so e redistribuido.
    if (!quantidadeAtual && proximaQuantidade > 0) {
      proximoValor = formatCurrencyInput(
        String(parseCurrencyInput(valor.valor) * proximaQuantidade),
        { emptyZero: false }
      );
    } else if (quantidadeAtual > 0 && !proximaQuantidade) {
      proximoValor = parcelas[0] || formatCurrencyInput(
        String(parseCurrencyInput(valor.valor) / quantidadeAtual),
        { emptyZero: false }
      );
    }

    alterarBase({
      parcelas_total: proximaQuantidadeTexto,
      valor: proximoValor,
      modo_valor: proximaQuantidadeTexto ? 'TOTAL' : 'PARCELA'
    });
  }

  return (
    <div className="space-y-3" style={{ gridColumn: '1 / -1' }}>
      <div className="rh-colaboradores-filter-grid">
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
          <span className="form-label">Quantidade de parcelas</span>
          <input
            className="form-control"
            type="number"
            min={Math.max(1, parcelasBloqueadas)}
            max="240"
            placeholder="Vazio = sem término"
            value={valor.parcelas_total}
            onChange={(event) => alterarQuantidade(event.target.value)}
          />
        </label>

        <label className="form-field">
          <span className="form-label form-label--required">
            {quantidade > 0 ? 'Valor total' : 'Valor mensal'}
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
          Sem quantidade, o valor mensal será repetido até o evento ser cancelado.
        </p>
      )}

      {quantidade > 0 ? (
        <p className="app-note">
          Soma das parcelas: <strong>{formatCurrencyBRL(somaCentavos / 100)}</strong>
          <> · Diferença: <strong>{formatCurrencyBRL(diferencaCentavos / 100)}</strong></>
        </p>
      ) : null}
    </div>
  );
}
