import { useState } from 'react';
import { HiOutlineAdjustmentsHorizontal, HiOutlineChevronDown, HiOutlineChevronUp } from 'react-icons/hi2';

/*
  FILTROS NO MODO TV (29/09/2026). Na TV a primeira tela precisa mostrar
  números, não campos: o bloco de filtros nasce RECOLHIDO numa faixa de uma
  linha com o resumo do que está aplicado e um botão "Filtros" que expande o
  bloco completo (os mesmos campos e botões de sempre). Fora do Modo TV o
  componente devolve o bloco como estava. O estado é só local.
*/
export default function FiltrosRecolhiveis({ modoTv, resumo, rotulo = 'Filtros', children }) {
  const [aberto, setAberto] = useState(false);
  if (!modoTv) return children;
  return (
    <div className="pg-filtros-recolhiveis" data-aberto={aberto ? 'true' : 'false'}>
      <div className="pg-filtros-faixa">
        <HiOutlineAdjustmentsHorizontal aria-hidden="true" />
        <span className="pg-filtros-faixa__resumo" title={resumo}>{resumo}</span>
        <button type="button" className="btn btn-outline" onClick={() => setAberto((atual) => !atual)} aria-expanded={aberto}>
          {aberto ? <HiOutlineChevronUp aria-hidden="true" /> : <HiOutlineChevronDown aria-hidden="true" />}
          {aberto ? 'Recolher filtros' : rotulo}
        </button>
      </div>
      {aberto ? children : null}
    </div>
  );
}
