import { useState } from 'react';
import OverlayModal from '../ui/OverlayModal';
import { useConfirmacao } from '../padrao';
import RhDpJornada from '../../pages/RhDpJornada';

// Reutiliza o envio real de jornada (legado ou gerencial conforme a instalacao).
// O modal nao calcula folha, nao cria titulos e nao amplia permissoes.
export default function RhDpPagamentoModal({ local, colaborador, onFechar, aoEnviar }) {
  const [ocupado, setOcupado] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  async function fechar() {
    if (ocupado) return;
    if (!enviado) {
      const { ok } = await confirmar({ titulo: 'Fechar solicitação de pagamento',
        mensagem: 'Os dados ainda não enviados serão descartados. Fechar o formulário?',
        rotuloConfirmar: 'Fechar formulário' });
      if (!ok) return;
    }
    onFechar();
  }
  return <OverlayModal largura="1440px" rotulo="Solicitar pagamento" onFechar={fechar}>
    <div data-modal="cabecalho" className="rh-local-modal-cabecalho">
      <div><h2 className="app-bloco-titulo">Solicitar pagamento</h2>
        <p className="app-note">{local.nome} · {colaborador?.nome || 'Colaboradores do período'}</p></div>
      <button type="button" className="btn btn-outline btn-sm" disabled={ocupado} onClick={fechar}>Fechar</button>
    </div>
    <div className="rh-local-modal-corpo">
      <RhDpJornada obraFixaId={local.id} colaboradorId={colaborador?.id} comoModal
        aoAlterar={() => setEnviado(false)}
        aoOcupado={setOcupado} aoEnviar={(resultado) => { setEnviado(true); aoEnviar?.(resultado); }} />
    </div>
    {elementoConfirmacao}
  </OverlayModal>;
}
