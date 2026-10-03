import { HiOutlineSparkles } from 'react-icons/hi2';

export default function EmptyState({
  title = 'Nenhum resultado',
  message,
  icon,
  action
}) {
  return (
    <div className="empty-state">
      {/* Classes corrigidas (02/09): o componente usava -icon/-title/-message,
          mas o CSS do design system define __icon/__title/__description —
          o estilo nunca chegou a aplicar. */}
      <div className="empty-state__icon" aria-hidden="true">
        {icon || <HiOutlineSparkles className="h-5 w-5" />}
      </div>

      <div>
        <p className="empty-state__title">{title}</p>
        {message ? <p className="empty-state__description">{message}</p> : null}
      </div>

      {action ? <div>{action}</div> : null}
    </div>
  );
}
