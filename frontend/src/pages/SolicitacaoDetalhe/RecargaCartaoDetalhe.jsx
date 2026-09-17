import { useEffect, useState } from 'react';
import PrestacaoRecargaCartao from '../../components/recarga-cartao/PrestacaoRecargaCartao';
import { obterRecargaDaSolicitacao } from '../../services/recargasCartao';
import StatusBadge from '../../components/StatusBadge';
import { BlocoConteudo, CamposComVazios } from '../../components/padrao';

function moeda(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * RECARGA DE CARTAO — bloco de contexto do detalhe da solicitacao.
 *
 * Migrado em 05/09 para os componentes padrao: `BlocoConteudo` (a superficie
 * do card, com titulo e apoio ancorados nele) e `CamposComVazios` (o grid de
 * ladrilhos, que ja carrega o alternador "ver todos os campos"). O `<dl>` a
 * mao usava `gap-x-5`, fora dos degraus da escala (R10), e a pilula de status
 * pintava o fundo com `var(--ui-surface-2)` — token que NAO EXISTE em CSS
 * nenhum nem no ThemeContext, o que invalidava a declaracao em silencio.
 * O status agora usa o `StatusBadge`, que e a etiqueta unica do sistema e
 * carrega a familia semantica + icone.
 *
 * NUMERO DE CARTAO: a tela exibe apenas `ultimos_quatro` ("final 1234"), que
 * e o formato mascarado. Nao ha numero completo em lugar nenhum deste
 * arquivo, e nada e copiado para outro lugar.
 */
export default function RecargaCartaoDetalhe({ solicitacaoId, podeInteragir = true }) {
  const [contexto, setContexto] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      setContexto(await obterRecargaDaSolicitacao(solicitacaoId));
    } catch (error) {
      setErro(error.message);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { void carregar(); }, [solicitacaoId]);

  if (carregando) {
    return (
      <BlocoConteudo titulo="Recarga de cartão">
        <p className="text-sm text-[var(--c-muted)]">Carregando dados da recarga...</p>
      </BlocoConteudo>
    );
  }
  if (erro) return <div className="app-alert app-alert--error">{erro}</div>;

  const recarga = contexto?.ultima_recarga;
  if (!recarga) return null;
  const titulo = recarga.titulo || {};

  return (
    <BlocoConteudo
      titulo="Recarga de cartão"
      descricao={`${recarga.cartao?.nome || 'Cartão'} · final ${recarga.cartao?.ultimos_quatro || '----'}`}
      acoes={<StatusBadge status={recarga.status_ciclo || '-'} />}
      recolhivel
    >
      <CamposComVazios
        campos={[
          { label: 'Solicitado', valor: moeda(recarga.valor_solicitado) },
          { label: 'Efetivamente pago', valor: moeda(recarga.valor_efetivo) },
          { label: 'Não recarregado', valor: moeda(recarga.valor_nao_recarregado) },
          {
            label: 'Título financeiro',
            valor: `#${titulo.id || '-'} · ${titulo.status || '-'}`
          }
        ]}
      />

      {contexto?.media_recarga ? (
        <p className="mt-3 border-y border-[var(--c-border)] py-2 text-sm text-[var(--c-muted)]">
          Média das últimas {contexto.media_recarga.quantidade} recargas validadas: <strong className="text-[var(--c-text)]">{moeda(contexto.media_recarga.valor)}</strong>
        </p>
      ) : null}

      <div className="mt-4">
        <PrestacaoRecargaCartao
          solicitacaoId={solicitacaoId}
          contexto={contexto}
          podeInteragir={podeInteragir}
          onAtualizado={carregar}
        />
      </div>
    </BlocoConteudo>
  );
}
