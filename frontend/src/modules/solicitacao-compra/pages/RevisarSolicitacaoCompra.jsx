import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { criarSolicitacaoCompra, criarSolicitacaoCompraDireta, obterUrlAssinadaCompra } from '../../../services/compras';
import CompraPreviewModal from '../components/CompraPreviewModal';
import StatusBadge from '../../../components/StatusBadge';
import {
  Avisos,
  BlocoConteudo,
  CamposComVazios,
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  TabelaPadrao,
  useAvisos
} from '../../../components/padrao';
import { criarPreviewCompra } from '../utils/preview';
import { montarLinhasResumoApropriacao, montarTextoResumoApropriacao } from '../utils/apropriacoes';
import { useAuth } from '../../../contexts/AuthContext';
import {
  buildComprasDraftKey,
  readComprasDraft,
  removeComprasDraft,
  writeComprasDraft
} from '../utils/comprasDraftStorage';

function formatarData(data) {
  if (!data) {
    return '-';
  }

  const raw = String(data);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  const valor = new Date(data);
  if (Number.isNaN(valor.getTime())) {
    return data;
  }

  return valor.toLocaleDateString('pt-BR');
}

function escapeHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textoOuPadrao(valor, padrao = '-') {
  return valor ? valor : padrao;
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatarFormasPagamento(formas) {
  const lista = Array.isArray(formas) ? formas : [];
  return lista.map((forma) => forma?.nome || forma?.codigo).filter(Boolean).join('; ') || '-';
}

export default function RevisarSolicitacaoCompra({ modoCompraDireta = false }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const reaproveitarSolicitacaoId = !modoCompraDireta ? Number(searchParams.get('reaproveitar_solicitacao') || 0) : 0;
  const draftKey = buildComprasDraftKey(user?.id, reaproveitarSolicitacaoId > 0
    ? `reaproveitar-${reaproveitarSolicitacaoId}`
    : modoCompraDireta ? 'compra-direta' : 'solicitacao');
  const rotaEdicao = modoCompraDireta ? '/solicitacoes-compra-direta/nova'
    : reaproveitarSolicitacaoId > 0
      ? `/solicitacoes-compra/nova?reaproveitar_solicitacao=${reaproveitarSolicitacaoId}`
      : '/solicitacoes-compra/nova';
  const [draft, setDraft] = useState(null);
  const [confirmado, setConfirmado] = useState(false);
  const [loading, setLoading] = useState(false);
  const criacaoEmAndamentoRef = useRef(false);
  const [previewVisualizado, setPreviewVisualizado] = useState(false);
  /*
    UM ÚNICO VISUALIZADOR NA TELA (R16, 05/09).

    Antes existiam DOIS: `modalPreviewAberto`, que abria uma cópia manual da
    casca do `CompraPreviewModal` escrita aqui dentro (mesmas classes, mesmo
    `background: var(--ui-surface)`, só com o fundo em `bg-black/50` em vez
    de `bg-black/60`), e `previewArquivo`, que renderizava o componente de
    verdade — os dois no mesmo arquivo, um logo abaixo do outro.

    Duas cascas para a mesma responsabilidade divergem sozinhas: a cópia
    local ficou sem a trava de rolagem, sem o `Escape`, sem a devolução do
    foco e com `overflow-hidden` (R18) no painel. Agora existe um estado só
    — o que está sendo visualizado —, e ele pode ser o PDF montado aqui
    (`srcDoc`) ou o arquivo anexado a um item.
  */
  const [previewAtivo, setPreviewAtivo] = useState(null);
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    try {
      const dados = readComprasDraft(draftKey);
      if (!dados) {
        navigate(rotaEdicao, { replace: true });
        return;
      }
      if (!dados?.payload?.obra_id || !Array.isArray(dados?.payload?.itens) || !dados.payload.itens.length) {
        removeComprasDraft(draftKey);
        navigate(rotaEdicao, { replace: true });
        return;
      }

      setDraft(dados);
    } catch (error) {
      console.error(error);
      removeComprasDraft(draftKey);
      navigate(rotaEdicao, { replace: true });
    }
  }, [draftKey, navigate, rotaEdicao]);

  const itensResumo = useMemo(() => draft?.resumo?.itens || [], [draft]);
  const totalItens = itensResumo.length;
  // A tabela recebe a ordem e a chave da linha já resolvidas (o render de
  // coluna enxerga só o item, não o índice).
  const itensRevisao = useMemo(
    () => itensResumo.map((item, index) => ({
      ...item,
      __ordem: String(index + 1).padStart(2, '0'),
      __chave: `${item.manual ? 'manual' : item.insumo_id}-${index}`
    })),
    [itensResumo]
  );

  const estatisticas = useMemo(() => {
    return itensResumo.reduce(
      (acc, item) => {
        if (item.link_produto) {
          acc.comLink += 1;
        }
        if (item.arquivo_url) {
          acc.comArquivo += 1;
        }
        if (item.manual) {
          acc.manuais += 1;
        }
        return acc;
      },
      {
        comLink: 0,
        comArquivo: 0,
        manuais: 0
      }
    );
  }, [itensResumo]);

  const prontoParaCriar = confirmado && previewVisualizado;
  const valorBrutoCompraDireta = Number(draft?.resumo?.valor_bruto || draft?.resumo?.valor_total || 0);
  const descontoCompraDireta = Number(draft?.resumo?.desconto_total || 0);
  const valorLiquidoItensCompraDireta = Number(
    draft?.resumo?.valor_total_itens ?? draft?.resumo?.valor_total ?? 0
  );
  const valorTotalCompraDireta = Number(draft?.resumo?.valor_total || valorLiquidoItensCompraDireta || 0);
  const freteTipoCompraDireta = String(draft?.payload?.frete_tipo || 'SEM_FRETE').toUpperCase();
  const freteModoCompraDireta = String(draft?.payload?.frete_modo || 'GLOBAL').toUpperCase() === 'POR_ITEM'
    ? 'POR_ITEM'
    : 'GLOBAL';
  const freteValorCompraDireta = Number(draft?.payload?.frete_valor || 0);
  const freteTipoLabel = freteTipoCompraDireta === 'TERCEIRO'
    ? 'Frete pago a terceiro'
    : freteTipoCompraDireta === 'EMBUTIDO'
      ? 'Frete embutido'
      : 'Sem frete';
  const temDescontoCompraDireta = modoCompraDireta && descontoCompraDireta > 0;

  /*
    ===================================================================
    TEMPLATE DO DOCUMENTO IMPRESSO — NÃO É MARKUP DE TELA.
    ===================================================================

    O bloco abaixo monta o HTML de um documento A4 que roda dentro de um
    `iframe` isolado (`srcDoc`), fora do DOM da aplicação. Ele NÃO herda o
    tema, não vê `styles/escala.css` e não alcança nenhum token `--*`: o
    `iframe` com `srcDoc` é outro documento. Por isso escreve `<table>`,
    hexadecimais e medidas em px — não há alternativa dentro das regras
    porque as regras (R1, R10, R25) descrevem a TELA, e isto é papel.

    Todos os detectores estáticos acusam este trecho, e é falso positivo
    por natureza: eles procuram a forma (`<table`, `#111827`, `24px`) sem
    poder saber que a forma vive num documento separado. A exceção precisa
    estar registrada no manifesto (`excecoes_tabela_crua` + `excecoes_cor`)
    — não há como esta tela passar sem ela, e não há como corrigir o
    "defeito" sem quebrar o documento que o usuário revisa antes de gravar.
  */
  const conteudoPreviewPdf = useMemo(() => {
    if (!draft) {
      return '';
    }

    const itensHtml = itensResumo
      .map(
        (item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.insumo_nome || '-')}</td>
          <td>${escapeHtml(item.unidade_sigla || '-')}</td>
          <td>${escapeHtml(item.quantidade || '-')}</td>
          ${modoCompraDireta ? `<td>${escapeHtml(formatarMoeda(item.valor_unitario))}</td>` : ''}
          ${modoCompraDireta ? `<td>${escapeHtml(formatarMoeda(item.valor_total))}</td>` : ''}
          ${modoCompraDireta && freteModoCompraDireta === 'POR_ITEM' ? `<td>${escapeHtml(formatarMoeda(item.frete_valor))}</td>` : ''}
          ${modoCompraDireta ? '' : `<td>${escapeHtml(item.especificacao || '-')}</td>`}
          <td>${montarLinhasResumoApropriacao(item).map((linha) => escapeHtml(linha)).join('<br />') || '-'}</td>
          ${modoCompraDireta ? '' : `<td>${escapeHtml(formatarData(item.necessario_para))}</td>`}
          ${modoCompraDireta ? '' : `<td>${escapeHtml(item.link_produto || '-')}</td>`}
          ${modoCompraDireta ? '' : `<td>${escapeHtml(item.arquivo_nome_original || '-')}</td>`}
        </tr>
      `
      )
      .join('');

    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <title>Pre-visualização - Solicitação de Compra</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            h1 { margin: 0 0 8px; font-size: 24px; }
            .meta { margin: 4px 0; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h1>${modoCompraDireta ? 'Compra Direta' : 'Solicitacao de Compra'}</h1>
          <div class="meta"><strong>Obra:</strong> ${escapeHtml(draft.resumo?.obra_nome || '-')}</div>
          <div class="meta"><strong>Solicitante:</strong> ${escapeHtml(draft.resumo?.solicitante_nome || '-')}</div>
          ${temDescontoCompraDireta ? `<div class="meta"><strong>Valor bruto:</strong> ${escapeHtml(formatarMoeda(valorBrutoCompraDireta))}</div>` : ''}
          ${temDescontoCompraDireta ? `<div class="meta"><strong>Desconto concedido:</strong> ${escapeHtml(formatarMoeda(descontoCompraDireta))}</div>` : ''}
          ${modoCompraDireta ? `<div class="meta"><strong>Valor líquido dos itens:</strong> ${escapeHtml(formatarMoeda(valorLiquidoItensCompraDireta))}</div>` : ''}
          ${modoCompraDireta ? `<div class="meta"><strong>Frete:</strong> ${escapeHtml(freteTipoLabel)}${freteTipoCompraDireta !== 'SEM_FRETE' ? ` - ${escapeHtml(freteModoCompraDireta === 'POR_ITEM' ? 'por item' : 'valor total')} - ${escapeHtml(formatarMoeda(freteValorCompraDireta))}` : ''}</div>` : ''}
          ${modoCompraDireta && freteTipoCompraDireta === 'TERCEIRO' ? `<div class="meta"><strong>Credor do frete:</strong> ${escapeHtml(draft.resumo?.frete_credor_nome || '-')}</div>` : ''}
          ${modoCompraDireta && freteTipoCompraDireta === 'TERCEIRO' ? `<div class="meta"><strong>Pagamento do frete:</strong> ${escapeHtml(formatarData(draft.payload?.frete_data_vencimento))} - ${escapeHtml(draft.payload?.frete_dados_pagamento || '-')}</div>` : ''}
          ${modoCompraDireta && freteTipoCompraDireta === 'TERCEIRO' ? `<div class="meta"><strong>Forma do frete:</strong> ${escapeHtml(draft.resumo?.frete_forma_pagamento || '-')}</div>` : ''}
          ${modoCompraDireta && draft.payload?.frete_favorecido_id ? `<div class="meta"><strong>Favorecido do frete:</strong> ${escapeHtml(draft.resumo?.frete_favorecido_nome || '-')}</div>` : ''}
          ${modoCompraDireta && draft.payload?.frete_favorecido_chave_pix ? `<div class="meta"><strong>PIX do frete:</strong> ${escapeHtml(draft.payload.frete_favorecido_chave_pix)}</div>` : ''}
          ${modoCompraDireta ? `<div class="meta"><strong>Valor total da solicitação:</strong> ${escapeHtml(formatarMoeda(valorTotalCompraDireta))}</div>` : ''}
          ${modoCompraDireta ? `<div class="meta"><strong>Credor:</strong> ${escapeHtml(draft.resumo?.credor_nome || '-')}</div>` : ''}
          ${modoCompraDireta && draft.payload?.favorecido_id ? `<div class="meta"><strong>Favorecido do pagamento:</strong> ${escapeHtml(draft.resumo?.favorecido_nome || '-')}</div>` : ''}
          ${modoCompraDireta && draft.payload?.favorecido_chave_pix ? `<div class="meta"><strong>Chave PIX:</strong> ${escapeHtml(draft.payload.favorecido_chave_pix)}</div>` : ''}
          ${modoCompraDireta ? `<div class="meta"><strong>Formas de pagamento:</strong> ${escapeHtml(formatarFormasPagamento(draft.resumo?.formas_pagamento))}</div>` : ''}
          ${modoCompraDireta ? `<div class="meta"><strong>Dados para pagamento:</strong> ${escapeHtml(draft.payload?.dados_pagamento || '-')}</div>` : ''}
          <div class="meta"><strong>${modoCompraDireta ? 'Data de vencimento' : 'Necessario para'}:</strong> ${escapeHtml(
            formatarData(draft.payload?.necessario_para)
          )}</div>
          <div class="meta"><strong>Observações:</strong> ${escapeHtml(draft.payload?.observacoes || '-')}</div>
          <div class="meta"><strong>Link geral:</strong> ${escapeHtml(draft.payload?.link_geral || '-')}</div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Insumo</th>
                <th>Unidade</th>
                <th>Quantidade</th>
                ${modoCompraDireta ? `<th>Valor unit.</th><th>Valor total</th>${freteModoCompraDireta === 'POR_ITEM' ? '<th>Frete</th>' : ''}` : ''}
                ${modoCompraDireta ? '' : '<th>Especificação</th>'}
                <th>Apropriação</th>
                ${modoCompraDireta ? '' : '<th>Necessario para</th><th>Link</th><th>Arquivo</th>'}
              </tr>
            </thead>
            <tbody>${itensHtml}</tbody>
          </table>
        </body>
      </html>
    `;
  }, [
    descontoCompraDireta,
    draft,
    itensResumo,
    modoCompraDireta,
    temDescontoCompraDireta,
    valorBrutoCompraDireta,
    freteTipoCompraDireta,
    freteModoCompraDireta,
    freteTipoLabel,
    freteValorCompraDireta,
    valorLiquidoItensCompraDireta,
    valorTotalCompraDireta
  ]);

  /*
    O QUE ESTE CONTROLE MEDE, E O QUE ELE PROMETE (registrado em 05/09).

    `setPreviewVisualizado(true)` acontece na MESMA ação que abre o modal.
    O checklist diz "PDF revisado" e o texto de apoio diz que "o envio só
    libera quando o PDF foi aberto": abrir e fechar no mesmo segundo
    satisfaz o portão. Ele mede o CLIQUE, não a conferência.

    NÃO foi endurecido nesta rodada de propósito — exigir tempo de leitura,
    rolagem até o fim do documento ou uma confirmação dentro do modal muda
    o comportamento percebido de duas telas em produção (esta e a compra
    direta), e isso é decisão do responsável, não de uma reorganização de
    layout. Fica registrado no relatório.
  */
  function abrirPreviaPdf() {
    if (!draft) {
      return;
    }

    setPreviewAtivo({
      title: modoCompraDireta ? 'Pre-visualizacao da compra direta' : 'Pre-visualizacao do PDF',
      name: 'Revise o documento antes de confirmar a criacao da solicitacao.',
      srcDoc: conteudoPreviewPdf
    });
    setPreviewVisualizado(true);
  }

  async function handleAbrirArquivo(item) {
    try {
      const url = await obterUrlAssinadaCompra(item?.arquivo_url);
      if (!url) {
        avisar.erro('Arquivo não encontrado.');
        return;
      }

      setPreviewAtivo(await criarPreviewCompra({
        title: 'Arquivo do item',
        name: item.arquivo_nome_original || 'Arquivo anexado',
        url
      }));
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao abrir arquivo do item');
    }
  }

  async function handleConfirmar() {
    if (!draft || criacaoEmAndamentoRef.current) {
      return;
    }

    if (!confirmado) {
      avisar.alerta('Confirme que revisou os dados antes de criar a solicitação.');
      return;
    }

    if (!previewVisualizado) {
      avisar.alerta('Abra a pre-visualização do PDF antes de confirmar a criação da solicitação.');
      return;
    }

    try {
      criacaoEmAndamentoRef.current = true;
      setLoading(true);
      const resposta = modoCompraDireta
        ? await criarSolicitacaoCompraDireta(draft.payload)
        : await criarSolicitacaoCompra(draft.payload);
      removeComprasDraft(draftKey);
      navigate(`/solicitacoes-compra/finalizada/${resposta.id}`, {
        replace: true,
        state: {
          resultado: resposta,
          resumo: draft.resumo
        }
      });
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao criar solicitacao de compra');
    } finally {
      criacaoEmAndamentoRef.current = false;
      setLoading(false);
    }
  }

  function handleVoltarEditar() {
    if (draft) {
      writeComprasDraft(draftKey, draft, user?.id);
    }
    navigate(rotaEdicao, {
      state: { preservarRascunhoCompra: true }
    });
  }

  if (!draft) {
    return null;
  }

  /*
    O grid de campos vem do `CamposComVazios`: campo sem valor some com
    contador (B4), e `contexto: false` tira da tela E da contagem o campo
    que não pertence a este registro — os dados de crédito e frete não
    existem na solicitação comum, então não podem contar como "vazios".
  */
  const camposDaCompra = [
    { label: 'Obra', valor: draft.resumo?.obra_nome },
    { label: 'Solicitante', valor: draft.resumo?.solicitante_nome },
    { label: 'Credor', valor: draft.resumo?.credor_nome, contexto: modoCompraDireta },
    { label: 'Favorecido do pagamento', valor: draft.resumo?.favorecido_nome, contexto: modoCompraDireta && Boolean(draft.payload?.favorecido_id) },
    { label: 'Chave PIX', valor: draft.payload?.favorecido_chave_pix, contexto: modoCompraDireta && Boolean(draft.payload?.favorecido_chave_pix) },
    {
      label: 'Formas de pagamento',
      valor: formatarFormasPagamento(draft.resumo?.formas_pagamento),
      contexto: modoCompraDireta
    },
    {
      label: 'Dados para pagamento',
      valor: draft.payload?.dados_pagamento,
      span: 2,
      contexto: modoCompraDireta
    },
    {
      label: modoCompraDireta ? 'Data de vencimento' : 'Necessario para',
      valor: formatarData(draft.payload?.necessario_para)
    },
    { label: 'Link geral', valor: draft.payload?.link_geral, span: 2 },
    {
      label: 'Valor bruto',
      valor: formatarMoeda(valorBrutoCompraDireta),
      contexto: temDescontoCompraDireta
    },
    {
      label: 'Desconto concedido',
      valor: formatarMoeda(descontoCompraDireta),
      contexto: temDescontoCompraDireta
    },
    {
      label: 'Valor líquido dos itens',
      valor: formatarMoeda(valorLiquidoItensCompraDireta),
      contexto: modoCompraDireta
    },
    {
      label: 'Frete',
      valor: freteTipoLabel,
      sub: freteTipoCompraDireta !== 'SEM_FRETE'
        ? `${freteModoCompraDireta === 'POR_ITEM' ? 'Por item' : 'Valor total'} · ${formatarMoeda(freteValorCompraDireta)}`
        : undefined,
      contexto: modoCompraDireta
    },
    {
      label: 'Credor do frete',
      valor: draft.resumo?.frete_credor_nome,
      contexto: modoCompraDireta && freteTipoCompraDireta === 'TERCEIRO'
    },
    {
      label: 'Forma de pagamento do frete',
      valor: draft.resumo?.frete_forma_pagamento,
      contexto: modoCompraDireta && freteTipoCompraDireta === 'TERCEIRO'
    },
    {
      label: 'Favorecido do frete',
      valor: draft.resumo?.frete_favorecido_nome,
      contexto: modoCompraDireta && Boolean(draft.payload?.frete_favorecido_id)
    },
    {
      label: 'Chave PIX do frete',
      valor: draft.payload?.frete_favorecido_chave_pix,
      contexto: modoCompraDireta && Boolean(draft.payload?.frete_favorecido_chave_pix)
    },
    {
      label: 'Vencimento do frete',
      valor: formatarData(draft.payload?.frete_data_vencimento),
      contexto: modoCompraDireta && freteTipoCompraDireta === 'TERCEIRO'
    },
    {
      label: 'Dados para pagamento do frete',
      valor: draft.payload?.frete_dados_pagamento,
      span: 2,
      contexto: modoCompraDireta && freteTipoCompraDireta === 'TERCEIRO'
    },
    {
      label: 'Valor total da solicitação',
      valor: formatarMoeda(valorTotalCompraDireta),
      tom: 'info',
      contexto: modoCompraDireta
    },
    {
      label: 'Notas/Guias anexadas',
      valor: `${draft.resumo?.anexos_cabecalho?.length || 0} arquivo(s)`,
      contexto: modoCompraDireta
    },
    { label: 'Observações', valor: draft.payload?.observacoes, span: 2 }
  ];

  return (
    <Pagina>
      <Avisos avisos={avisos} aoFechar={fechar} />
      <PageHeader
        titulo={modoCompraDireta ? 'Revisar Compra Direta' : 'Revisar Solicitacao de Compra'}
        contagem={`${totalItens} item(ns)`}
        descricao={prontoParaCriar
          ? 'Etapa final antes do envio: pronta para criar.'
          : 'Etapa final antes do envio: revise o PDF e marque a autorizacao.'}
        acaoPrincipal={{
          rotulo: loading ? 'Criando...' : 'Criar solicitacao',
          onClick: handleConfirmar,
          desabilitada: loading || !prontoParaCriar,
          title: prontoParaCriar
            ? undefined
            : 'Abra a pre-visualizacao do PDF e marque a autorizacao para liberar o envio.'
        }}
        secundarias={[
          {
            rotulo: previewVisualizado ? 'Abrir PDF novamente' : 'Visualizar PDF antes de criar',
            onClick: abrirPreviaPdf
          },
          { rotulo: 'Voltar e editar', onClick: handleVoltarEditar }
        ]}
      />

      {/*
        BLOCO PRIMÁRIO — é o que responde a pergunta central desta tela:
        "posso enviar?". Os dois checkpoints e a autorização moram aqui;
        o botão que executa vive na faixa fixa, sempre a um clique (R13).
      */}
      <BlocoConteudo
        variante="primario"
        cor={prontoParaCriar ? 'var(--sem-success)' : 'var(--sem-warning)'}
        titulo="Checklist de envio"
        descricao="O envio so libera quando o PDF foi aberto e a confirmação estiver marcada."
      >
        <StatGrid colunas={2}>
          <StatTile
            label="PDF revisado"
            valor={previewVisualizado ? 'OK' : 'Pendente'}
            sub="Abra a pre-visualização para validar o documento que será anexado ao histórico."
            tom={previewVisualizado ? 'success' : 'warning'}
          />
          <StatTile
            label="Autorização marcada"
            valor={confirmado ? 'OK' : 'Pendente'}
            sub="Confirme que os dados estão corretos antes de criar a solicitação."
            tom={confirmado ? 'success' : 'warning'}
          />
        </StatGrid>

        <label className="mt-4 flex items-start gap-3 rounded-xl border border-[var(--c-border)] p-4">
          <input
            type="checkbox"
            checked={confirmado}
            onChange={(event) => setConfirmado(event.target.checked)}
          />
          <span className="text-sm text-[var(--c-text)]">
            Confirmo que revisei os dados e autorizo a criacao da {modoCompraDireta ? 'compra direta' : 'solicitacao de compra'}.
          </span>
        </label>
      </BlocoConteudo>

      {/*
        Os ladrilhos abaixo mostram RECORTES do conjunto (itens com arquivo,
        com link, manuais, valor). O TOTAL de itens fica na faixa fixa, que
        acompanha a rolagem — repeti-lo aqui seria a duplicação que a B3
        proíbe (critério de 05/09: faixa fica com o total, bloco com os
        recortes).
      */}
      <BlocoConteudo variante="secundario" titulo="Composição dos itens">
        <StatGrid colunas={modoCompraDireta ? 4 : 3}>
          {modoCompraDireta ? (
            <StatTile
              label="Total da solicitação"
              valor={formatarMoeda(valorTotalCompraDireta)}
              sub={freteTipoCompraDireta !== 'SEM_FRETE'
                ? `Itens ${formatarMoeda(valorLiquidoItensCompraDireta)} + frete ${formatarMoeda(freteValorCompraDireta)}`
                : temDescontoCompraDireta
                  ? `Bruto ${formatarMoeda(valorBrutoCompraDireta)} - desconto ${formatarMoeda(descontoCompraDireta)}`
                  : 'Valor que sera levado para a solicitacao'}
              tom="info"
            />
          ) : null}
          <StatTile label="Com arquivo" valor={estatisticas.comArquivo} sub="Itens com documento anexado" />
          <StatTile label="Com link" valor={estatisticas.comLink} sub="Itens com link de produto" />
          <StatTile label="Manuais" valor={estatisticas.manuais} sub="Itens fora do cadastro padrão" />
        </StatGrid>
      </BlocoConteudo>

      <BlocoConteudo
        variante="secundario"
        titulo={modoCompraDireta ? 'Dados da compra direta' : 'Dados da compra'}
      >
        <CamposComVazios campos={camposDaCompra} colunas={3} />
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Itens revisados"
        descricao="Confira quantidade, rateio de apropriação, prazo e acessos de compra em uma lista única."
      >
        <TabelaPadrao
          colunas={[
            {
              id: 'ordem',
              titulo: '#',
              tipo: 'codigo',
              render: (item) => (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="app-status-pill">{item.__ordem}</span>
                  {/*
                    A tarja "Manual" era um par de classes de paleta crua
                    (border-amber-300/bg-amber-50/text-amber-700), que não
                    tem correspondente no tema escuro nem passa pelo piso de
                    contraste (R25). O `StatusBadge` é a etiqueta única do
                    sistema: família semântica, token e ícone junto — cor
                    sozinha não comunica para daltônicos.
                  */}
                  {item.manual && <StatusBadge status="Manual" kind="warning" />}
                </div>
              )
            },
            {
              id: 'item',
              titulo: 'Item',
              tipo: 'identidade',
              noCard: 'titulo',
              render: (item) => item.insumo_nome
            },
            {
              id: 'quantidade',
              titulo: 'Quantidade',
              tipo: 'numero',
              render: (item) => `${item.quantidade} ${item.unidade_sigla || '-'}`
            },
            ...(modoCompraDireta ? [{
              id: 'valor',
              titulo: 'Valor',
              tipo: 'valor',
              render: (item) => (
                <>
                  <div>{formatarMoeda(item.valor_unitario)} un.</div>
                  <div className="mt-1 font-semibold">{formatarMoeda(item.valor_total)}</div>
                </>
              )
            }, ...(freteModoCompraDireta === 'POR_ITEM' ? [{
              id: 'frete_valor',
              titulo: 'Frete',
              tipo: 'valor',
              render: (item) => formatarMoeda(item.frete_valor)
            }] : [])] : []),
            {
              id: 'apropriacao',
              titulo: 'Apropriação',
              tipo: 'texto',
              render: (item) => (
                <span className="text-[var(--c-muted)]">{montarTextoResumoApropriacao(item)}</span>
              )
            },
            ...(modoCompraDireta ? [] : [
              {
                id: 'necessario_para',
                titulo: 'Necessario para',
                tipo: 'data',
                render: (item) => formatarData(item.necessario_para)
              },
              {
                id: 'especificacao',
                titulo: 'Especificação',
                tipo: 'texto',
                render: (item) => (
                  <div className="whitespace-pre-wrap text-[var(--c-text)]">
                    {textoOuPadrao(item.especificacao)}
                  </div>
                )
              },
              {
                id: 'acessos',
                titulo: 'Acessos',
                tipo: 'texto',
                render: (item) => (
                  <div className="flex flex-wrap gap-2">
                    {item.link_produto ? (
                      <a
                        href={item.link_produto}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-outline"
                      >
                        Abrir link
                      </a>
                    ) : (
                      <span className="text-xs text-[var(--c-muted)]">Sem link</span>
                    )}

                    {item.arquivo_url ? (
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => handleAbrirArquivo(item)}
                        title={item.arquivo_nome_original || 'Abrir arquivo'}
                      >
                        <span className="truncate">{item.arquivo_nome_original || 'Abrir arquivo'}</span>
                      </button>
                    ) : (
                      <span className="text-xs text-[var(--c-muted)]">Sem arquivo</span>
                    )}
                  </div>
                )
              }
            ])
          ]}
          itens={itensRevisao}
          getId={(item) => item.__chave}
          vazio="Nenhum item revisado."
          storageKey="tabela:revisar-solicitacao-compra:itens"
          rotuloRolagem="Itens revisados"
        />
      </BlocoConteudo>

      <CompraPreviewModal preview={previewAtivo} onClose={() => setPreviewAtivo(null)} />
    </Pagina>
  );
}
