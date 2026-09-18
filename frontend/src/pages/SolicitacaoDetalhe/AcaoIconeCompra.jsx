import Button from '../../components/ui/Button';
import './compra-detalhe.css';

export default function AcaoIconeCompra({ rotulo, icone: Icone, quantidade, className = '', ...props }) {
  return <Button variant="outline" size="sm" iconOnly title={quantidade === undefined ? rotulo : `${rotulo} (${quantidade})`}
    aria-label={rotulo} className={`compra-acao-icone ${className}`} {...props}>
    <Icone size={17} aria-hidden="true" />
    {quantidade > 0 && <span className="compra-acao-contagem" aria-hidden="true">{quantidade > 99 ? '99+' : quantidade}</span>}
  </Button>;
}
