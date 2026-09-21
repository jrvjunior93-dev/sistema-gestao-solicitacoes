import { useEffect, useRef, useState } from 'react';
import PreviewAnexoModal from './PreviewAnexoModal';
import { API_URL, authHeaders, fileUrl } from '../../services/api';
import { Avisos, BlocoConteudo, useAvisos, useConfirmacao } from '../../components/padrao';

/**
 * HISTORICO DA SOLICITACAO — a linha do tempo de tudo o que aconteceu.
 *
 * O que a rodada de 05/09 mudou (reorganizacao pura: nenhum evento, campo ou botao saiu):
 *
 * - **Regra de organizacao do cliente**: historico e registro vem POR ULTIMO. A partir de
 *   21/09 todos os cards do detalhe nascem RECOLHIDOS. O proprio card e o unico dono desse
 *   estado; o arranjo externo nao cria uma segunda camada de recolhimento.
 *
 * - **A ORDEM E ESCOLHA, NAO TEXTO** (07/09). O apoio do bloco dizia "Mais recentes primeiro." /
 *   "Ordem cronologica...": um INDICADOR no lugar da COISA. O seletor existia, mas morava na barra
 *   de personalizacao — atras do "..." da faixa e do "Personalizar layout", dois cliques longe de
 *   quem so queria inverter a leitura. Ele vem para os `controles` do proprio bloco, ao lado do
 *   titulo, onde o texto estava. Grava onde ja gravava (`historico_ordem`), continua valendo por
 *   usuario e em qualquer aparelho, e vale SO para o historico da solicitacao.
 * - **R19**: os cinco `alert()` e os dois `window.confirm()` sairam. Aviso vira `useAvisos`
 *   (faixa dentro do bloco, com tom semantico) e confirmacao vira `useConfirmacao`.
 * - **R21**: o retorno de `confirmar()` e DESESTRUTURADO (`const { ok }`) — o objeto e sempre
 *   truthy, e ler ele como booleano faria o "Cancelar" REMOVER o anexo.
 * - **R26**: o alvo da remocao (id do historico / o proprio registro) e fixado numa `const` ANTES
 *   do `await`. O `window.confirm` congelava a pagina e o defeito era impossivel; o modal do
 *   sistema nao congela — o historico pode ser recarregado pelo `onAnexoRemovido` de outro bloco
 *   enquanto a pergunta esta aberta.
 * - **R25**: `text-blue-700` do botao "Remover" era paleta crua (sem par no tema escuro, sem o
 *   piso de contraste do ThemeContext) — virou token.
 *
 * ## Por que o historico NAO virou `TabelaPadrao`
 *
 * Uma linha daqui nao tem nome proprio: e data + ator + acao, e cada evento carrega uma forma
 * diferente (transicao de status, atribuicao de responsavel, comentario com texto livre, anexo com
 * Visualizar/Download/Remover, pedido de compra com dois botoes de PDF). Numa tabela isso viraria
 * uma coluna "conteudo" que muda de natureza a cada linha — e ainda perderia a leitura cronologica
 * com a rolagem posicionada no evento mais recente, que e o modo como esta lista e lida. Nao ha
 * `<table>` crua aqui (o que a R1 reprova); e uma lista vertical, que continua sendo a forma certa.
 * Se um dia virar tabela, ela nasce com `semIdentidade` declarado — pelo motivo acima.
 */

export default function Timeline({
  historicos,
  canRemoveAnexo = false,
  canRemoveComentario = false,
  onAnexoRemovido,
  // Preferência do usuário: 'asc' (mais antigos primeiro, rolagem no fim
  // — padrão) ou 'desc' (mais recentes primeiro).
  ordem = 'asc',
  // Sem ouvinte não há escolha a oferecer: o seletor não é desenhado e o
  // bloco fica exatamente como era. Botão que não tem para onde mandar o
  // clique é enfeite — a mesma regra do par `recolhido`/`aoAlternarRecolhido`.
  aoMudarOrdem
}) {
  const [preview, setPreview] = useState(null);
  const listaRef = useRef(null);
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const acoesOcultas = new Set([
    'PENDENCIA_FINANCEIRA_MARCADA',
    'PENDENCIA_FINANCEIRA_REGULARIZADA',
    'COMENTARIO_REMOVIDO'
  ]);
  // Ordem CRONOLÓGICA, como conversa: mais antigo em cima, mais recente
  // embaixo — a rolagem começa posicionada no fim (o mais novo).
  const historicosVisiveis = (Array.isArray(historicos) ? historicos : [])
    .filter((h) => !acoesOcultas.has(String(h?.acao || '').trim().toUpperCase()))
    .slice()
    .sort((a, b) => {
      const dataA = new Date(a?.createdAt || 0).getTime();
      const dataB = new Date(b?.createdAt || 0).getTime();
      const cmp = dataA !== dataB
        ? dataA - dataB
        : Number(a?.id || 0) - Number(b?.id || 0);
      return ordem === 'desc' ? -cmp : cmp;
    });

  const totalVisiveis = historicosVisiveis.length;
  useEffect(() => {
    const el = listaRef.current;
    if (!el) return;
    // asc = conversa: rolagem começa no fim (mais recente).
    el.scrollTop = ordem === 'desc' ? 0 : el.scrollHeight;
  }, [totalVisiveis, ordem]);

  function normalizarUrlArquivo(url) {
    const valor = String(url || '');
    if (!valor.startsWith('http')) return valor;

    // Corrige anexos antigos salvos com '%' literal no nome.
    return valor.replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
  }

  async function obterUrlAssinada(caminhoArquivo, historicoId = null) {
    if (!caminhoArquivo) return null;
    if (!String(caminhoArquivo).startsWith('http')) {
      return fileUrl(caminhoArquivo);
    }

    const caminhoNormalizado = normalizarUrlArquivo(caminhoArquivo);
    const params = new URLSearchParams({ url: caminhoNormalizado });
    if (historicoId) {
      params.set('historico_id', historicoId);
    }

    try {
      const res = await fetch(
        `${API_URL}/anexos/presign?${params.toString()}`,
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error('Falha ao assinar URL');
      const data = await res.json();
      return data?.url || null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async function prepararPreviewArquivo(caminhoArquivo, historicoId = null) {
    const urlAssinada = await obterUrlAssinada(caminhoArquivo, historicoId);
    if (!urlAssinada) {
      return { url: null, downloadUrl: null, isObjectUrl: false };
    }

    return { url: urlAssinada, downloadUrl: urlAssinada, isObjectUrl: false };
  }

  function fecharPreview() {
    if (preview?.isObjectUrl && String(preview.url || '').startsWith('blob:')) {
      window.URL.revokeObjectURL(preview.url);
    }
    setPreview(null);
  }

  async function baixarArquivo(caminhoArquivo, nomeArquivo, historicoId = null) {
    try {
      const urlArquivo = await obterUrlAssinada(caminhoArquivo, historicoId);
      if (!urlArquivo) throw new Error('Falha ao gerar link seguro para download');

      const link = document.createElement('a');
      link.href = urlArquivo;
      link.download = nomeArquivo || 'arquivo';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error(error);
      avisar.erro('Erro ao baixar arquivo');
    }
  }

  function nomePedidoCompraPdf(pedidoCompraId, codigoPedido) {
    return `${codigoPedido || `PC-${String(pedidoCompraId).padStart(5, '0')}`}.pdf`;
  }

  function pedidoCompraPdfUrl(solicitacaoId, pedidoCompraId) {
    return `${API_URL}/solicitacoes/${solicitacaoId}/pedidos-compra/${pedidoCompraId}/pdf`;
  }

  async function obterPedidoCompraPdfBlobUrl(solicitacaoId, pedidoCompraId) {
    const response = await fetch(pedidoCompraPdfUrl(solicitacaoId, pedidoCompraId), {
      headers: authHeaders()
    });
    if (!response.ok) throw new Error('Falha ao carregar pedido de compra');

    const blob = await response.blob();
    return window.URL.createObjectURL(blob);
  }

  async function visualizarPedidoCompraPdf(solicitacaoId, pedidoCompraId, codigoPedido) {
    try {
      const url = await obterPedidoCompraPdfBlobUrl(solicitacaoId, pedidoCompraId);
      const nome = nomePedidoCompraPdf(pedidoCompraId, codigoPedido);
      setPreview({
        nome,
        caminho: nome,
        url,
        downloadUrl: url,
        isObjectUrl: true
      });
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao abrir pedido de compra');
    }
  }

  async function baixarPedidoCompraPdf(solicitacaoId, pedidoCompraId, codigoPedido) {
    try {
      const response = await fetch(pedidoCompraPdfUrl(solicitacaoId, pedidoCompraId), {
        headers: authHeaders()
      });
      if (!response.ok) throw new Error('Falha ao baixar pedido de compra');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = nomePedidoCompraPdf(pedidoCompraId, codigoPedido);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao baixar pedido de compra');
    }
  }

  async function removerAnexo(historicoId) {
    // R26: o alvo e fixado ANTES do `await` da confirmacao. A pergunta e a
    // remocao falam do MESMO registro, mesmo que o historico se recarregue
    // com o modal aberto (o modal do sistema nao congela a pagina).
    const alvo = historicoId;
    // R21: DESESTRUTURADO. `confirmar()` devolve { ok, texto } e objeto e
    // sempre truthy — ler como booleano faria "Cancelar" remover o anexo.
    const { ok } = await confirmar({
      titulo: 'Remover anexo',
      mensagem: 'Remover este anexo do histórico? Esta ação não pode ser desfeita.',
      rotuloConfirmar: 'Remover anexo',
      destrutiva: true
    });
    if (!ok) return;

    try {
      const res = await fetch(`${API_URL}/anexos/historico/${alvo}`, {
        method: 'DELETE',
        headers: authHeaders()
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Erro ao remover anexo');
      }

      if (typeof onAnexoRemovido === 'function') {
        onAnexoRemovido();
      }
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao remover anexo');
    }
  }

  async function removerComentario(historico) {
    // R26: id e solicitacao sao lidos AGORA, antes do `await`, e sao esses os
    // valores usados na chamada — nunca relidos do estado depois da resposta.
    const historicoId = historico?.id;
    const solicitacaoId = historico?.solicitacao_id;
    if (!historicoId || !solicitacaoId) return;

    // R21: DESESTRUTURADO — ver o comentario em removerAnexo.
    const { ok } = await confirmar({
      titulo: 'Remover comentário',
      mensagem: 'Remover este comentário do histórico? Esta ação não pode ser desfeita.',
      rotuloConfirmar: 'Remover comentario',
      destrutiva: true
    });
    if (!ok) return;

    try {
      const res = await fetch(`${API_URL}/solicitacoes/${solicitacaoId}/comentarios/${historicoId}`, {
        method: 'DELETE',
        headers: authHeaders()
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Erro ao remover comentario');
      }

      if (typeof onAnexoRemovido === 'function') {
        onAnexoRemovido();
      }
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao remover comentario');
    }
  }

  return (
    <BlocoConteudo
      titulo="Histórico"
      contagem={`${totalVisiveis} evento(s)`}
      recolhivel
      recolhidoPadrao
      alternarAoClicar
      controles={typeof aoMudarOrdem === 'function' ? (
        <label className="sol-detail-historico-ordem">
          Ordem:
          {/* Seletor de CONTEXTO da apresentação, não filtro de lista — R12.
              Fica nos `controles` (e não em `acoes`) porque ali ele está FORA
              do botão de recolher: clicar no seletor escolhe a ordem, não
              fecha o bloco. */}
          <select
            value={ordem === 'desc' ? 'desc' : 'asc'}
            onChange={(evento) => aoMudarOrdem(evento.target.value)}
            aria-label="Ordem do histórico"
          >
            <option value="asc">mais antigos primeiro</option>
            <option value="desc">mais recentes primeiro</option>
          </select>
        </label>
      ) : undefined}
    >
      <Avisos avisos={avisos} aoFechar={fechar} />

      {/* R18: a lista rola com `overflow-y: auto`. `hidden` num ancestral
          criaria scrollport e mataria qualquer `position: sticky` da pagina
          em silencio — nada no console, nada no build. */}
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1" ref={listaRef}>
        {historicosVisiveis.map(h => {
          let meta = null;
          try {
            meta = h.metadata ? JSON.parse(h.metadata) : null;
          } catch {
            meta = null;
          }

          const acaoLabel = {
            JUSTIFICATIVA_REGISTRADA: 'Justificativa registrada',
            NUMERO_PEDIDO_ATUALIZADO: 'Número do pedido atualizado',
            PEDIDO_COMPRA_GERADO: 'Pedido de compra gerado',
            PEDIDO_COMPRA_STATUS_ALTERADO: 'Status do pedido de compra alterado',
            PEDIDO_COMPRA_ENCERRADO: 'Pedido de compra encerrado/cancelado',
            RESPONSAVEL_REMOVIDO: 'Responsavel removido',
            DATA_VENCIMENTO_ATUALIZADA: 'Data Resposta/Pagamento atualizada'
          }[h.acao] || h.acao;
          const atorNome = meta?.ator_nome || null;
          const responsavelNome = meta?.responsavel_nome || h.usuario?.nome || null;
          const caminhoArquivo = meta?.caminho || null;
          const podeExibirArquivo = ['ANEXO_ADICIONADO', 'COMPROVANTE_ADICIONADO'].includes(h.acao);
          const pedidoCompraId = meta?.pedido_compra_id || null;
          const pedidoCompraCodigo = meta?.pedido_compra_codigo || (pedidoCompraId ? `PC-${String(pedidoCompraId).padStart(5, '0')}` : null);
          const solicitacaoHistoricoId = h?.solicitacao_id || meta?.solicitacao_id || null;

          return (
            <div key={h.id} className="sol-detail-timeline-item">
              <p className="text-sm font-semibold">{acaoLabel}</p>

              {(h.status_anterior || h.status_novo) && (
                <p className="text-sm" style={{ color: 'var(--c-text)' }}>
                  Status: {h.status_anterior || '-'} {'->'} {h.status_novo || '-'}
                </p>
              )}

              {h.acao === 'RESPONSAVEL_ATRIBUIDO' && (
                <p className="text-sm" style={{ color: 'var(--c-text)' }}>
                  {atorNome ? `${atorNome} atribuiu` : 'Responsavel atribuido'}
                  {responsavelNome ? ` para ${responsavelNome}` : ''}
                </p>
              )}

              {h.acao === 'RESPONSAVEL_ASSUMIU' && (
                <p className="text-sm" style={{ color: 'var(--c-text)' }}>
                  {atorNome ? `${atorNome} assumiu a solicitacao` : 'Responsavel assumiu a solicitacao'}
                </p>
              )}

              {h.acao === 'ENVIADA_SETOR' && h.observacao && (
                <p className="sol-detail-timeline-text text-sm">{h.observacao}</p>
              )}

              {h.descricao && <p className="sol-detail-timeline-text text-sm">{h.descricao}</p>}

              {canRemoveComentario && String(h.acao || '').trim().toUpperCase() === 'COMENTARIO' && (
                <button
                  type="button"
                  className="text-xs font-semibold mt-1"
                  style={{ color: 'var(--c-danger)' }}
                  onClick={() => removerComentario(h)}
                >
                  Remover comentário
                </button>
              )}

              {pedidoCompraId && solicitacaoHistoricoId && (
                <div className="flex flex-wrap gap-3 mt-1">
                  <button
                    type="button"
                    className="text-sm"
                    style={{ color: 'var(--c-primary)' }}
                    onClick={() => visualizarPedidoCompraPdf(solicitacaoHistoricoId, pedidoCompraId, pedidoCompraCodigo)}
                  >
                    Visualizar {pedidoCompraCodigo}
                  </button>
                  <button
                    type="button"
                    className="text-sm"
                    style={{ color: 'var(--c-primary)' }}
                    onClick={() => baixarPedidoCompraPdf(solicitacaoHistoricoId, pedidoCompraId, pedidoCompraCodigo)}
                  >
                    Download
                  </button>
                </div>
              )}

              {podeExibirArquivo && meta && caminhoArquivo && (
                <div className="flex gap-3 mt-1">
                  <button
                    className="text-sm" style={{ color: 'var(--c-primary)' }}
                    onClick={async () => {
                      const previewArquivo = await prepararPreviewArquivo(caminhoArquivo, h.id);
                      setPreview({
                        nome: h.descricao,
                        caminho: caminhoArquivo,
                        ...previewArquivo
                      });
                    }}
                    type="button"
                  >
                    Visualizar
                  </button>

                  <button
                    type="button"
                    className="text-sm" style={{ color: 'var(--c-primary)' }}
                    onClick={async e => {
                      e.preventDefault();
                      e.stopPropagation();
                      await baixarArquivo(caminhoArquivo, h.descricao, h.id);
                    }}
                  >
                    Download
                  </button>

                  {canRemoveAnexo && (
                    <button
                      type="button"
                      className="text-sm text-[var(--c-danger)]"
                      onClick={() => removerAnexo(h.id)}
                    >
                      Remover
                    </button>
                  )}
                </div>
              )}

              <span className="sol-detail-timeline-meta">
                {h.usuario?.nome || '-'} | {new Date(h.createdAt).toLocaleString('pt-BR')}
              </span>
            </div>
          );
        })}
      </div>

      {preview && (
        <PreviewAnexoModal
          anexo={preview}
          onClose={fecharPreview}
        />
      )}

      {elementoConfirmacao}
    </BlocoConteudo>
  );
}
