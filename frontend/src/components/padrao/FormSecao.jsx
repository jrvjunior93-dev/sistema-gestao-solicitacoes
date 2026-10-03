/**
 * FORMULÁRIO PADRÃO — dá uso às classes .form-* que existiam no CSS com
 * zero consumidores, e disciplina o grid: UM sistema de colunas por form
 * (form-grid/--3/--4), spans nomeados, seção com fieldset+legend de verdade.
 * Seção rara/avançada entra recolhida via BlocoConteudo em volta.
 */
export function FormSecao({ legenda, colunas = 2, children }) {
  const classeGrid = colunas === 2 ? 'form-grid' : `form-grid form-grid--${colunas}`;
  return (
    <fieldset className="form-section">
      {legenda ? <legend className="form-section-legenda">{legenda}</legend> : null}
      <div className={classeGrid}>{children}</div>
    </fieldset>
  );
}

// O papel do campo decide o espaço que ele ocupa no grid — a tela não mede.
// data/moeda/numero cabem numa célula normal (o input interno já tem o piso
// certo: .input-moeda garante 180px); texto-longo toma a linha inteira.
const TIPOS_CAMPO = {
  'texto-longo': 'form-campo--linha',
  observacao: 'form-campo--linha'
};

export function CampoForm({ label, obrigatorio = false, hint, erro, span, linha = false, tipo, children }) {
  const classes = [
    'form-group',
    span === 2 && 'form-campo--span2',
    linha && 'form-campo--linha',
    tipo && TIPOS_CAMPO[tipo]
  ].filter(Boolean).join(' ');
  return (
    <label className={classes}>
      {label ? (
        <span className={`form-label${obrigatorio ? ' form-label--required' : ''}`}>{label}</span>
      ) : null}
      {children}
      {hint && !erro ? <span className="form-hint">{hint}</span> : null}
      {erro ? <span className="form-error">{erro}</span> : null}
    </label>
  );
}
