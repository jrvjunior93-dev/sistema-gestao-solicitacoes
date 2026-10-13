import { HiOutlinePlus } from 'react-icons/hi2';

// Apenas revela uma nova parte do pagamento. Cadastro de pessoa é outra ação.
export default function AdicionarFavorecidoButton({ onClick, disabled = false }) {
  return (
    <button
      type="button"
      className="btn btn-outline btn-sm btn-icon-only favorecido-cadastro-action shrink-0"
      aria-label="Adicionar novo favorecido"
      title="Adicionar novo favorecido"
      disabled={disabled}
      onClick={onClick}
    >
      <HiOutlinePlus className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
