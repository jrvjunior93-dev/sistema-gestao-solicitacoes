import { useEffect, useState } from 'react';
import { getStatusSetor } from '../../services/statusSetor';
import OverlayModal from '../../components/ui/OverlayModal';
import { useConfirmacao } from '../../components/padrao';

/**
 * ALTERAR STATUS — a acao de maior efeito do detalhe da solicitacao.
 *
 * Ela interrompe o trabalho principal (ler a solicitacao) para decidir outra coisa, entao MODAL e o
 * lugar certo pela R9. O que mudou em 05/09:
 *
 * - **R27**: o painel era `.modal-overlay` + `.modal-dialog` escritos a mao, sem teto de altura nem
 *   corpo rolante. Com muitos status configurados no setor, a lista empurrava o rodape para fora e
 *   o botao Cancelar sumia. O `OverlayModal` fixa cabecalho e rodape (`data-modal`) e rola so o
 *   meio; de brinde vem o portal, a trava de rolagem, o Escape do topo da pilha e a devolucao do
 *   foco.
 * - **R21 + R26 — confirmacao antes de gravar**: clicar num status GRAVAVA na hora, sem pergunta e
 *   sem desfazer, e o status move a solicitacao de setor e destrava/trava o financeiro. Agora passa
 *   pelo `useConfirmacao`, com o retorno DESESTRUTURADO (`const { ok }`, porque o objeto e sempre
 *   truthy) e com o status alvo fixado numa `const` ANTES do `await`: o modal do sistema nao
 *   congela a pagina, e reler o estado depois da confirmacao deixaria a pessoa autorizar um status
 *   e o sistema gravar outro.
 * - **R10**: os `style` inline com padding/gap em rem sairam — medida vem dos degraus da escala.
 *
 * Nao ha campo de justificativa aqui porque o endpoint de troca de status (`updateStatusSolicitacao`)
 * nao recebe motivo. Inventar um campo obrigatorio faria a tela pedir um dado que ninguem grava.
 */
export default function ModalAlterarStatus({
  aberto,
  setor,
  onClose,
  onSalvar
}) {
  const [status, setStatus] = useState([]);
  const [loading, setLoading] = useState(false);
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  useEffect(() => {
    if (!aberto) return;
    carregarStatus();
  }, [aberto, setor]);

  async function carregarStatus() {
    try {
      setLoading(true);
      if (setor) {
        const data = await getStatusSetor({ setor });
        const ativos = (Array.isArray(data) ? data : [])
          .filter(s => s.ativo)
          .sort((a, b) => a.ordem - b.ordem)
          .map(s => s.nome);
        setStatus(ativos);
        return;
      }
      const data = await getStatusSetor();
      const ativos = (Array.isArray(data) ? data : [])
        .filter(s => s.ativo)
        .map(s => s.nome);
      const unicos = Array.from(new Set(ativos));
      unicos.sort((a, b) => a.localeCompare(b));
      setStatus(unicos);
    } catch (error) {
      console.error(error);
      setStatus([]);
    } finally {
      setLoading(false);
    }
  }

  const fallback = [
    'EM_ANALISE',
    'AGUARDANDO_AJUSTE',
    'APROVADA',
    'REJEITADA',
    'CONCLUIDA'
  ];
  const lista = status.length > 0 ? status : fallback;

  async function escolher(statusClicado) {
    // R26: o alvo e fixado ANTES do `await`. A pergunta e a gravacao falam do
    // MESMO status, mesmo que a lista se recarregue com o modal aberto.
    const alvo = statusClicado;
    const { ok } = await confirmar({
      titulo: 'Alterar status',
      mensagem: `Alterar o status desta solicitacao para ${alvo}? O status define o setor responsavel e o que fica liberado a partir daqui.`,
      rotuloConfirmar: 'Alterar status',
      rotuloCancelar: 'Voltar'
    });
    if (!ok) return;
    onSalvar(alvo);
  }

  if (!aberto) return null;

  return (
    <OverlayModal
      aberto={aberto}
      rotulo="Alterar Status"
      largura="var(--modal-max-w-sm, 480px)"
      onFechar={onClose}
    >
      <div
        data-modal="cabecalho"
        className="flex items-center justify-between gap-3 border-b border-[var(--c-border)] px-4 py-3"
      >
        <h2 className="text-lg font-semibold text-[var(--c-text)]">Alterar Status</h2>
        <button
          type="button"
          onClick={onClose}
          className="btn btn-outline btn-sm"
          aria-label="Fechar"
        >
          Fechar
        </button>
      </div>

      <div className="px-4 py-3">
        {loading ? (
          <div className="empty-state py-6">
            <div className="loading-spinner" />
            <p className="empty-state__description">Carregando status...</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {lista.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => escolher(s)}
                className="btn btn-secondary justify-start text-left"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        data-modal="rodape"
        className="flex justify-end border-t border-[var(--c-border)] px-4 py-3"
      >
        <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
          Cancelar
        </button>
      </div>

      {elementoConfirmacao}
    </OverlayModal>
  );
}
