import { Link } from 'react-router-dom';

// Card de navegação dos hubs (nível 1 e 2). O card é NEUTRO —
// superfície e borda padrão do sistema; a cor de identidade do módulo
// aparece apenas no ícone (--hub-accent). O contador de pendências usa
// o tom semântico de atenção/neutro, nunca a cor do módulo.
export default function NavCard({ to, icon: Icon, label, desc, accentVar, count, countTone = 'warning', onClick }) {
  const style = accentVar ? { '--hub-accent': `var(${accentVar})` } : undefined;
  const countLabel = count > 99 ? '99+' : String(count);

  const body = (
    <>
      <span className="hub-card-icon" aria-hidden="true">
        {Icon && <Icon />}
      </span>
      <span className="hub-card-copy">
        <span className="hub-card-label">{label}</span>
        <span className="hub-card-desc">{desc}</span>
      </span>
      {Number(count) > 0 && (
        <span
          className={`hub-card-count ${countTone === 'neutral' ? 'hub-card-count--neutral' : ''} ${countTone === 'danger' ? 'hub-card-count--danger' : ''}`}
          aria-label={`${countLabel} pendências`}
        >
          {countLabel}
        </span>
      )}
    </>
  );

  return (
    <Link
      to={to}
      className="hub-card"
      style={style}
      onClick={onClick}
      aria-label={Number(count) > 0 ? `${label} — ${desc} (${countLabel} pendências)` : `${label} — ${desc}`}
    >
      {body}
    </Link>
  );
}
