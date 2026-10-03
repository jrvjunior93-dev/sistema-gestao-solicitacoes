import { useEffect, useState } from 'react';
import { API_URL, authHeaders } from '../../services/api';
import OverlayModal from '../../components/ui/OverlayModal';
import { Avisos, useAvisos, FormSecao, CampoForm } from '../../components/padrao';

/**
 * R9 — enviar a solicitação para outro setor INTERROMPE o trabalho principal
 * (a lista ou o detalhe continuam sendo o que a pessoa veio fazer): modal.
 *
 * R27 — a casca é o `OverlayModal`, não `fixed inset-0` à mão: corpo rolante
 * e rodapé fixo passam a ser do componente, então o botão "Enviar" nunca sai
 * do campo de visão por causa de uma lista longa de setores.
 *
 * R19 — `alert()` do navegador virou faixa `Avisos` DENTRO do painel: erro
 * fica na tela, ao lado do campo que o causou, e o modal não fecha.
 *
 * O select aqui é ENTRADA DE DADO (escolher para onde enviar), não filtro —
 * a R12 mantém esse uso legítimo.
 */
export default function ModalEnviarSetor({
  solicitacaoId,
  onClose,
  onSucesso
}) {

  const [setores, setSetores] = useState([]);
  const [setor, setSetor] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const { avisos, avisar, fechar: fecharAviso } = useAvisos();

  useEffect(() => {
    carregarSetores();
  }, []);

  async function carregarSetores() {
    try {
      const res = await fetch(`${API_URL}/setores`, {
        headers: authHeaders()
      });

      const data = await res.json();
      setSetores(Array.isArray(data) ? data : []);
    } catch (erro) {
      console.error(erro);
      avisar.erro('Erro ao carregar a lista de setores.');
    }
  }

  async function enviar() {
    if (!setor) {
      avisar.erro('Selecione um setor');
      return;
    }

    setEnviando(true);
    try {
      const res = await fetch(
        `${API_URL}/solicitacoes/${solicitacaoId}/enviar-setor`,
        {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            setor_destino: setor
          })
        }
      );

      if (!res.ok) {
        let mensagem = 'Erro ao enviar solicitação para outro setor';
        try {
          const data = await res.json();
          mensagem = data?.error || mensagem;
        } catch (_) {}
        avisar.erro(mensagem);
        return;
      }

      /*
        R28 — a confirmação de gravação FICA na tela. Antes ela era um
        `alert` que o `onClose()` seguinte engolia: a caixa aparecia e o
        modal sumia no mesmo gesto. Agora o painel permanece com a faixa de
        sucesso persistente e o rodapé passa a oferecer "Fechar"; o
        `onSucesso()` (recarga da lista/detalhe) dispara na hora, como antes,
        atrás do modal — que não congela a página.
      */
      setEnviado(true);
      avisar.sucesso('Solicitação enviada para outro setor com sucesso.', undefined, { persistente: true });
      onSucesso();
    } catch (erro) {
      console.error(erro);
      avisar.erro('Erro ao enviar solicitação para outro setor');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <OverlayModal
      rotulo="Enviar para outro setor"
      largura="var(--modal-max-w-sm, 480px)"
      onFechar={onClose}
    >
      <div data-modal="cabecalho" className="border-b border-[var(--c-border)] p-4">
        <h2 className="text-lg font-semibold text-[var(--c-text)]">
          Enviar para outro setor
        </h2>
        <p className="text-sm text-[var(--c-muted)]">
          A solicitação passa a responder pelo setor escolhido.
        </p>
      </div>

      <div className="p-4">
        <Avisos avisos={avisos} aoFechar={fecharAviso} />

        <FormSecao colunas={1}>
          <CampoForm label="Setor de destino" obrigatorio linha>
            <select
              className="input"
              value={setor}
              onChange={e => setSetor(e.target.value)}
              disabled={enviado}
            >
              <option value="">Selecione um setor</option>

              {setores.map(s => (
                <option key={s.id} value={s.nome}>
                  {s.nome}
                </option>
              ))}
            </select>
          </CampoForm>
        </FormSecao>
      </div>

      <div data-modal="rodape" className="app-actionbar border-t border-[var(--c-border)] p-4">
        <button onClick={onClose} className="btn btn-outline" type="button">
          {enviado ? 'Fechar' : 'Cancelar'}
        </button>

        {!enviado && (
          <button
            onClick={enviar}
            className="btn btn-primary"
            type="button"
            disabled={enviando}
          >
            {enviando ? 'Enviando…' : 'Enviar'}
          </button>
        )}
      </div>
    </OverlayModal>
  );
}
