import { useRef, useState } from 'react';
import { criarAutorizacaoPagamento } from '../services/pagamentoAutorizacao';
import { enviarTitulosFilaPagamentos } from '../services/financeiro';
import { tituloElegivelParaEnvioPagamento } from '../utils/envioTitulosPagamento';

// Uma trava compartilhada entre o modal da medicao e a tabela da solicitacao.
// A chave e preservada em falhas/retries; mudar selecao ou destino cria outra operacao.
export default function useEnvioTitulosPagamento({ titulos, podeAutorizar, podeFila,
  autorizacaoDisponivel, confirmar, avisar, aoAtualizar }) {
  const [enviando, setEnviando] = useState(false);
  const pendente = useRef(false);
  const tentativa = useRef(null);

  async function enviar(destino, ids, avisosDestino = avisar) {
    const autorizacao = destino === 'AUTORIZACAO';
    if (!['AUTORIZACAO', 'FILA'].includes(destino) || pendente.current
      || (autorizacao ? !podeAutorizar || !autorizacaoDisponivel : !podeFila)) return false;
    const selecionados = new Set((ids || []).map(Number));
    const tituloIds = [...new Set((titulos || []).filter((titulo) =>
      selecionados.has(Number(titulo.id)) && tituloElegivelParaEnvioPagamento(titulo))
      .map((titulo) => Number(titulo.id)))].sort((a, b) => a - b);
    if (!tituloIds.length) return false;
    pendente.current = true;
    setEnviando(true);
    try {
      const { ok } = await confirmar({
        titulo: autorizacao ? 'Enviar para autorização?' : 'Enviar títulos para pagamento?',
        mensagem: autorizacao
          ? `${tituloIds.length} título(s) serão reunidos para decisão do proprietário.`
          : `${tituloIds.length} título(s) ficarão disponíveis na Fila de Pagamentos.`,
        rotuloConfirmar: autorizacao ? 'Solicitar autorização' : 'Enviar para pagamento'
      });
      if (!ok) return false;
      const fingerprint = JSON.stringify({ destino, tituloIds });
      if (tentativa.current?.fingerprint !== fingerprint) {
        const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        tentativa.current = { fingerprint, chave: `solicitacao-${random}` };
      }
      if (autorizacao) await criarAutorizacaoPagamento(tituloIds, tentativa.current.chave);
      else await enviarTitulosFilaPagamentos(tituloIds, tentativa.current.chave);
      await aoAtualizar?.();
      tentativa.current = null;
      avisosDestino?.sucesso(autorizacao
        ? 'Títulos enviados ao proprietário para autorização.'
        : 'Títulos enviados para a Fila de Pagamentos.');
      return true;
    } catch (error) {
      avisosDestino?.erro(error?.message || 'Não foi possível enviar os títulos para pagamento.');
      return false;
    } finally {
      pendente.current = false;
      setEnviando(false);
    }
  }
  return { enviando, enviar };
}
