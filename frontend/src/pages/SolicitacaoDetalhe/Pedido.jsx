import { useState } from 'react';
import { API_URL, authHeaders } from '../../services/api';
import {
  Avisos,
  BlocoConteudo,
  CampoForm,
  FormSecao,
  useAvisos,
  useConfirmacao
} from '../../components/padrao';

/**
 * Número do pedido de compra da solicitação.
 *
 * Migrado em 05/09: as três caixas do navegador (um `confirm` e dois
 * `alert`) saíram (R19). A confirmação agora é a do sistema e o retorno
 * é DESESTRUTURADO — `const { ok } = await confirmar(...)`. A forma
 * antiga aqui era `if (!confirm(...)) return;`, que funcionava porque o
 * `window.confirm` devolve booleano; trocar a caixa pelo hook sem
 * desestruturar faria o "Cancelar" GRAVAR o pedido, porque `{ ok, texto }`
 * é sempre verdadeiro (R21).
 *
 * R26: o número e a solicitação são fixados em `const` ANTES do `await`.
 * O modal do sistema não congela a página e esta tela recarrega sozinha
 * por evento — ler `valor` depois da confirmação gravaria um número
 * diferente do que a pessoa leu na pergunta.
 *
 * A mensagem nomeia o registro e o número que vai ser gravado: "Confirmar
 * envio?" não diz sobre o quê a pessoa está decidindo.
 */
export default function Pedido({ solicitacaoId, numeroPedido, onSucesso }) {
  const [valor, setValor] = useState(numeroPedido || '');
  const [loading, setLoading] = useState(false);
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  async function salvar() {
    // R26: alvo fixado ANTES do await — o modal não bloqueia a página.
    const idAlvo = solicitacaoId;
    const numeroAlvo = String(valor || '').trim();

    if (!numeroAlvo) {
      avisar.alerta('Informe o número do pedido antes de salvar.');
      return;
    }

    const { ok } = await confirmar({
      titulo: 'Registrar número do pedido',
      mensagem: `Gravar o número de pedido ${numeroAlvo} nesta solicitação? `
        + 'Ele passa a valer para o financeiro e para os relatórios de compra.',
      rotuloConfirmar: 'Gravar número'
    });
    if (!ok) return;

    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/solicitacoes/${idAlvo}/pedido`, {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ numero_pedido: numeroAlvo })
      });

      if (!res.ok) {
        throw new Error('Erro ao atualizar número do pedido da solicitacao');
      }

      onSucesso?.();
      avisar.sucesso(`Número do pedido ${numeroAlvo} registrado.`);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao salvar número do pedido');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <BlocoConteudo
        titulo="Número do pedido"
        descricao="Vínculo da solicitação com o pedido de compra."
        recolhivel
        recolhidoPadrao
        alternarAoClicar
        acoes={(
          <button
            onClick={salvar}
            disabled={loading}
            className="btn btn-primary"
            type="button"
          >
            {loading ? 'Salvando...' : 'Salvar'}
          </button>
        )}
      >
        <Avisos avisos={avisos} aoFechar={fechar} />
        <FormSecao colunas={2}>
          <CampoForm label="Número do pedido">
            <input
              className="input"
              placeholder="Informe o número do pedido"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </CampoForm>
        </FormSecao>
      </BlocoConteudo>
      {elementoConfirmacao}
    </>
  );
}
