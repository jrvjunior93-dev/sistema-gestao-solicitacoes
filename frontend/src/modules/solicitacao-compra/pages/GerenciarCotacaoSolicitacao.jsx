import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  HiOutlineArrowTopRightOnSquare,
  HiOutlineArrowDownTray,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClipboardDocument,
  HiOutlinePaperClip,
  HiOutlineArrowPath,
  HiOutlinePencilSquare,
  HiOutlineXMark
} from 'react-icons/hi2';
import {
  baixarPdfSolicitacaoCompra,
  cancelarCotacaoSolicitacaoCompra,
  comentarSolicitacaoCompra,
  criarFornecedorCompra,
  encerrarSolicitacaoCompra,
  encerrarSolicitacaoCompraSemPedido,
  enviarSolicitacaoCompraParaFornecedores,
  listarFornecedoresCompra,
  obterWorkspaceCotacaoSolicitacaoCompra,
  obterUrlAssinadaCompra,
  obterUrlPdfCotacaoPublica,
  recusarSolicitacaoCompra,
  reabrirCotacaoCompra,
  atualizarQuantidadeItemSolicitacaoCompra,
  salvarRespostaInternaCotacao,
  uploadArquivosRespostaInternaCotacao
} from '../../../services/compras';
import { buscarParceiros, listarCategoriasParceiro } from '../../../services/parceiros';
import { useAuth } from '../../../contexts/AuthContext';
import ModalPortal from '../../../components/ui/ModalPortal';
import {
  canEncerrarComprasCotacoes,
  canEncerrarSemPedidoComprasCotacoes,
  canFecharParcialComprasCotacoes,
  canCancelarComprasCotacoes,
  canOperateComprasCotacoes,
  canReabrirComprasCotacoes
} from '../../../utils/acessoProduto';
import CompraPreviewModal from '../components/CompraPreviewModal';
import { criarPreviewCompra } from '../utils/preview';
import { montarLinhasResumoApropriacao } from '../utils/apropriacoes';
import { ResizableTable, ResizableTh } from '../../../components/ResizableTable';

// helpers

function fmt(data) {
  if (!data) return '-';
  const raw = String(data);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const v = new Date(data);
  return Number.isNaN(v.getTime()) ? '-' : v.toLocaleDateString('pt-BR');
}

function fmtStatus(status) {
  return String(status || '-').replace(/_/g, ' ').toUpperCase();
}

function criarChaveIdempotenciaFechamento(solicitacaoId) {
  const sufixo = window.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `cotacao-${solicitacaoId}-${sufixo}`;
}

function fmtMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function parseNumeroCompra(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim().replace(/[^\d.,-]/g, '');
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const parsed = Number(normalized.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseNumeroCompraDigitado(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim().replace(/[^\d.,-]/g, '');
  const normalized = raw.replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizeNumeroCompraInput(value) {
  return String(value ?? '').replace(/[^\d.,]/g, '');
}

function limparMoedaCotacaoInput(value, limiteDecimais = 10) {
  const raw = String(value ?? '').replace(/[^\d,]/g, '');
  if (!raw) return '';
  const [inteiroRaw = '', ...decimaisRaw] = raw.split(',');
  const inteiro = inteiroRaw.replace(/^0+(?=\d)/, '') || '0';
  if (!decimaisRaw.length) return inteiro;
  return `${inteiro},${decimaisRaw.join('').slice(0, limiteDecimais)}`;
}

function formatarMoedaCotacaoInput(value, limiteDecimais = 10) {
  const limpo = limparMoedaCotacaoInput(value, limiteDecimais);
  if (!limpo) return '';
  const [inteiro, decimal] = limpo.split(',');
  const inteiroFormatado = Number(inteiro || 0).toLocaleString('pt-BR', {
    maximumFractionDigits: 0
  });
  return `R$ ${inteiroFormatado}${limpo.includes(',') ? `,${decimal || ''}` : ''}`;
}

function normalizarMoedaCotacaoParaEnvio(value) {
  const limpo = limparMoedaCotacaoInput(value, 10);
  if (!limpo) return null;
  return limpo.endsWith(',') ? limpo.slice(0, -1) : limpo;
}

function formatNumeroCompra(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return '';
  return parsed.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6
  });
}

function clsStatus(status) {
  const v = String(status || '').toUpperCase();
  if (v === 'ENCERRADO') return 'app-status-pill bg-slate-100 text-slate-700';
  if (v === 'FINALIZADA') return 'app-status-pill bg-slate-100 text-slate-700';
  if (['RECUSADO', 'CANCELADA', 'CANCELADO', 'INATIVA'].includes(v)) return 'app-status-pill bg-red-100 text-red-700';
  if (v === 'AGUARDANDO_DIRETORIA') return 'app-status-pill bg-amber-100 text-amber-700';
  if (v === 'FECHAMENTO_PARCIAL') return 'app-status-pill bg-amber-100 text-amber-800';
  if (v === 'RASCUNHO') return 'app-status-pill bg-amber-100 text-amber-700';
  if (v === 'REABERTA') return 'app-status-pill bg-blue-100 text-blue-700';
  return 'app-status-pill bg-blue-100 text-blue-700';
}

function buildItemKey(item) {
  return `${String(item?.item_tipo || '').toUpperCase()}:${Number(item?.item_referencia_id || 0)}`;
}

function itemToCotacaoPayload(item) {
  const itemTipo = String(item?.item_tipo || '').toUpperCase();
  const itemReferenciaId = Number(item?.item_referencia_id || 0);
  return {
    item_tipo: itemTipo,
    item_referencia_id: itemReferenciaId,
    item_key: buildItemKey(item),
    solicitacao_compra_item_id: itemTipo === 'CADASTRADO' ? itemReferenciaId : undefined,
    solicitacao_compra_item_manual_id: itemTipo === 'MANUAL' ? itemReferenciaId : undefined
  };
}

const FORNECEDOR_LINK_COLUMNS = [
  { key: 'nome', width: 250, minWidth: 160 },
  { key: 'telefone', width: 150, minWidth: 120 },
  { key: 'email', width: 250, minWidth: 160 },
  { key: 'status', width: 130, minWidth: 105 },
  { key: 'respondido', width: 130, minWidth: 110 },
  { key: 'acoes', width: 230, minWidth: 220 }
];

const CONDICOES_PAGAMENTO_COTACAO = [
  'Pix',
  'Boleto',
  'Transferencia',
  'Cartao',
  'Cheque',
  'Dinheiro',
  'Faturado',
  'Outros'
];

function CotacaoActionButton({ as: Component = 'button', children, className = '', ...props }) {
  return (
    <Component
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--c-border)] bg-white text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-40 ${className}`.trim()}
      {...props}
    >
      {children}
    </Component>
  );
}

function decimalApiParaInput(value, limite = 10) {
  if (value === null || value === undefined || value === '') return '';
  const texto = String(value).replace('.', ',');
  if (!texto.includes(',')) return texto;
  const [inteiro, decimal = ''] = texto.split(',');
  const decimalLimpo = decimal.slice(0, limite).replace(/0+$/, '');
  return decimalLimpo ? `${inteiro},${decimalLimpo}` : inteiro;
}

function montarFormularioRespostaInterna(cotacaoFornecedor, itensCombinados) {
  const selecoes = new Set(
    (cotacaoFornecedor?.itensSelecionados || []).map((item) => buildItemKey({
      item_tipo: item.item_tipo,
      item_referencia_id: item.solicitacao_compra_item_id || item.solicitacao_compra_item_manual_id
    }))
  );
  const itensCotacao = selecoes.size
    ? itensCombinados.filter((item) => selecoes.has(buildItemKey(item)))
    : itensCombinados;
  const respostas = new Map(
    (cotacaoFornecedor?.respostas || []).map((resposta) => [
      buildItemKey({
        item_tipo: resposta.item_tipo,
        item_referencia_id: resposta.solicitacao_compra_item_id || resposta.solicitacao_compra_item_manual_id
      }),
      resposta
    ])
  );

  return {
    valor_minimo_pedido: decimalApiParaInput(cotacaoFornecedor?.valor_minimo_pedido, 2),
    desconto_total: decimalApiParaInput(cotacaoFornecedor?.desconto_total, 2),
    condicao_pagamento: cotacaoFornecedor?.condicao_pagamento || '',
    prazo_entrega: cotacaoFornecedor?.prazo_entrega || '',
    prazo_entrega_dias: cotacaoFornecedor?.prazo_entrega_dias || '',
    prazo_entrega_tipo: cotacaoFornecedor?.prazo_entrega_tipo || 'DIAS_CORRIDOS',
    difal_valor: decimalApiParaInput(cotacaoFornecedor?.difal_valor, 2),
    frete_tipo: cotacaoFornecedor?.frete_tipo || 'SEM_FRETE',
    frete_modo: cotacaoFornecedor?.frete_modo || 'GLOBAL',
    frete_valor: decimalApiParaInput(cotacaoFornecedor?.frete_valor, 2),
    frete_data_vencimento: cotacaoFornecedor?.frete_data_vencimento || '',
    frete_transportador_nome: cotacaoFornecedor?.frete_transportador_nome || '',
    frete_transportador_cpf_cnpj: cotacaoFornecedor?.frete_transportador_cpf_cnpj || '',
    observacao_resposta: cotacaoFornecedor?.observacao_resposta || '',
    itens: itensCotacao.map((item) => {
      const resposta = respostas.get(buildItemKey(item));
      return {
        ...item,
        status_disponibilidade: resposta?.status_disponibilidade
          || (resposta ? (resposta.disponivel ? 'DISPONIVEL' : 'NAO_TEM') : 'DISPONIVEL'),
        preco: formatarMoedaCotacaoInput(decimalApiParaInput(resposta?.preco, 10)),
        quantidade_original: decimalApiParaInput(item.quantidade, 6),
        quantidade_solicitada: decimalApiParaInput(item.quantidade, 6),
        quantidade_minima_item: decimalApiParaInput(resposta?.quantidade_minima_item, 3),
        quantidade_disponivel: decimalApiParaInput(
          resposta?.quantidade_disponivel ?? (resposta?.disponivel ? item.quantidade : ''),
          3
        ),
        ipi_valor: formatarMoedaCotacaoInput(decimalApiParaInput(resposta?.ipi_valor, 2), 2),
        icms_valor: formatarMoedaCotacaoInput(decimalApiParaInput(resposta?.icms_valor, 2), 2),
        st_valor: formatarMoedaCotacaoInput(decimalApiParaInput(resposta?.st_valor, 2), 2),
        frete_valor: formatarMoedaCotacaoInput(decimalApiParaInput(resposta?.frete_valor, 2), 2),
        observacao: resposta?.observacao || ''
      };
    })
  };
}

function calcularTotalRespostaInternaItem(item, incluirFrete = false) {
  return (
    parseNumeroCompra(item?.preco) * parseNumeroCompraDigitado(item?.quantidade_disponivel)
    + parseNumeroCompra(item?.ipi_valor)
    + parseNumeroCompra(item?.icms_valor)
    + parseNumeroCompra(item?.st_valor)
    + (incluirFrete ? parseNumeroCompra(item?.frete_valor) : 0)
  );
}

function ModalRespostaInternaCotacao({
  cotacao,
  form,
  salvando,
  enviandoArquivos,
  solicitacaoEncerrada = false,
  onChange,
  onChangeItem,
  onSalvar,
  onUploadArquivos,
  onAbrirArquivo,
  onFechar
}) {
  const [condicoesAbertas, setCondicoesAbertas] = useState(false);
  if (!cotacao || !form) return null;

  const condicoesSelecionadas = new Set(
    CONDICOES_PAGAMENTO_COTACAO.filter((opcao) => {
      const atual = String(form.condicao_pagamento || '').toLowerCase();
      return atual.split(/[;,]/).some((parte) => parte.trim() === opcao.toLowerCase());
    })
  );
  const valorMercadorias = form.itens.reduce(
    (total, item) => total + parseNumeroCompra(item.preco) * parseNumeroCompraDigitado(item.quantidade_disponivel),
    0
  );
  const valorTributos = form.itens.reduce(
    (total, item) => total + parseNumeroCompra(item.ipi_valor) + parseNumeroCompra(item.icms_valor) + parseNumeroCompra(item.st_valor),
    0
  );
  const freteAdicional = form.frete_tipo === 'SEM_FRETE'
    ? 0
    : form.frete_modo === 'POR_ITEM'
      ? form.itens.reduce((total, item) => total + parseNumeroCompra(item.frete_valor), 0)
      : parseNumeroCompra(form.frete_valor);
  const valorTotalResposta = Math.max(
    0,
    valorMercadorias + valorTributos + parseNumeroCompra(form.difal_valor) + freteAdicional - parseNumeroCompra(form.desconto_total)
  );
  const arquivosResposta = Array.isArray(cotacao.arquivos_resposta) && cotacao.arquivos_resposta.length
    ? cotacao.arquivos_resposta
    : (cotacao.arquivo_resposta_url || cotacao.pdf_resposta_url
      ? [{
          chave: 'legado',
          url: cotacao.arquivo_resposta_url || cotacao.pdf_resposta_url,
          nome_original: 'Arquivo anexado'
        }]
      : []);

  function alternarCondicao(opcao) {
    const partesLivres = String(form.condicao_pagamento || '')
      .split(/[;,]/)
      .map((parte) => parte.trim())
      .filter(Boolean)
      .filter((parte) => !CONDICOES_PAGAMENTO_COTACAO.some((base) => base.toLowerCase() === parte.toLowerCase()));
    const proximas = condicoesSelecionadas.has(opcao)
      ? [...condicoesSelecionadas].filter((item) => item !== opcao)
      : [...condicoesSelecionadas, opcao];
    onChange('condicao_pagamento', [...proximas, ...partesLivres].join('; '));
  }

  return (
    <ModalPortal onClose={onFechar} closeOnEscape={!salvando && !enviandoArquivos}>
      <div className="app-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="editar-resposta-cotacao-titulo">
        <div className="app-modal-surface app-modal-surface--form">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--c-border)] px-5 py-4">
          <div>
            <h2 id="editar-resposta-cotacao-titulo" className="text-lg font-semibold text-[var(--c-text)]">Editar resposta da cotacao</h2>
            <p className="text-sm text-[var(--c-muted)]">
              {cotacao.fornecedor?.nome || 'Fornecedor'} - a alteracao sera registrada na auditoria como resposta interna.
            </p>
          </div>
          <button
            type="button"
            className="compras-icon-action"
            onClick={onFechar}
            title="Fechar"
            aria-label="Fechar"
            disabled={salvando || enviandoArquivos}
          >
            <HiOutlineXMark />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {solicitacaoEncerrada ? (
            <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Esta cotacao esta encerrada. Ao salvar, ela sera reaberta somente se a edicao criar nova disponibilidade para este fornecedor. A quantidade originalmente solicitada permanece inalterada.
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
            <label className="app-filter-field">
              <span className="app-filter-label">Valor minimo do pedido</span>
              <input className="input" inputMode="decimal" value={form.valor_minimo_pedido} onChange={(e) => onChange('valor_minimo_pedido', sanitizeNumeroCompraInput(e.target.value))} />
            </label>
            <label className="app-filter-field">
              <span className="app-filter-label">Desconto concedido</span>
              <input className="input" inputMode="decimal" value={form.desconto_total} onFocus={(e) => e.target.select()} onChange={(e) => onChange('desconto_total', sanitizeNumeroCompraInput(e.target.value))} />
            </label>
            <label className="app-filter-field">
              <span className="app-filter-label">DIFAL</span>
              <input className="input" inputMode="decimal" value={form.difal_valor} onFocus={(e) => e.target.select()} onChange={(e) => onChange('difal_valor', formatarMoedaCotacaoInput(e.target.value, 2))} />
            </label>
            <label className="app-filter-field">
              <span className="app-filter-label">Prazo de entrega *</span>
              <input className="input" type="number" min="1" step="1" value={form.prazo_entrega_dias} onChange={(e) => onChange('prazo_entrega_dias', e.target.value.replace(/\D/g, ''))} />
            </label>
            <label className="app-filter-field">
              <span className="app-filter-label">Tipo do prazo *</span>
              <select className="input" value={form.prazo_entrega_tipo} onChange={(e) => onChange('prazo_entrega_tipo', e.target.value)}>
                <option value="DIAS_CORRIDOS">Dias corridos</option>
                <option value="DIAS_UTEIS">Dias uteis</option>
              </select>
            </label>
            <label className="app-filter-field lg:col-span-2">
              <span className="app-filter-label">Condicao de pagamento *</span>
              <div className="grid gap-2">
                <input
                  className="input"
                  value={form.condicao_pagamento}
                  onClick={() => setCondicoesAbertas(true)}
                  onFocus={() => setCondicoesAbertas(true)}
                  onChange={(e) => onChange('condicao_pagamento', e.target.value)}
                  placeholder="Ex.: Boleto 30/60/90"
                />
                {condicoesAbertas && (
                  <div
                    className="cotacao-condicoes-options rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-2 shadow-sm"
                    onMouseDown={(event) => event.preventDefault()}
                  >
                    <div className="grid gap-1">
                      {CONDICOES_PAGAMENTO_COTACAO.map((opcao) => (
                        <label key={opcao} className="cotacao-condicao-option flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
                          <input
                            type="checkbox"
                            checked={condicoesSelecionadas.has(opcao)}
                            onChange={() => alternarCondicao(opcao)}
                          />
                          <span>{opcao}</span>
                        </label>
                      ))}
                    </div>
                    <button type="button" className="btn btn-xs btn-outline mt-2 w-full justify-center" onClick={() => setCondicoesAbertas(false)}>
                      Fechar opcoes
                    </button>
                  </div>
                )}
              </div>
            </label>
          </div>

          <div className="mt-3 rounded-lg border border-[var(--c-border)] bg-slate-50/80 p-3">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
              <label className="app-filter-field">
                <span className="app-filter-label">Frete</span>
                <select className="input" value={form.frete_tipo} onChange={(e) => onChange('frete_tipo', e.target.value)}>
                  <option value="SEM_FRETE">Sem frete</option>
                  <option value="EMBUTIDO">Embutido no preco</option>
                  <option value="TERCEIRO">Pago a terceiro</option>
                </select>
              </label>
              {form.frete_tipo !== 'SEM_FRETE' ? (
                <label className="app-filter-field">
                  <span className="app-filter-label">Informar frete</span>
                  <select className="input" value={form.frete_modo} onChange={(e) => onChange('frete_modo', e.target.value)}>
                    <option value="GLOBAL">Valor global da proposta</option>
                    <option value="POR_ITEM">Valor por item</option>
                  </select>
                </label>
              ) : null}
              {form.frete_tipo !== 'SEM_FRETE' && form.frete_modo !== 'POR_ITEM' ? (
                <label className="app-filter-field">
                  <span className="app-filter-label">Valor do frete *</span>
                  <input className="input" inputMode="decimal" value={form.frete_valor} onFocus={(e) => e.target.select()} onChange={(e) => onChange('frete_valor', formatarMoedaCotacaoInput(e.target.value, 2))} />
                </label>
              ) : null}
              {form.frete_tipo === 'TERCEIRO' ? (
                <>
                  <label className="app-filter-field">
                    <span className="app-filter-label">Data para pagamento *</span>
                    <input className="input" type="date" value={form.frete_data_vencimento} onChange={(e) => onChange('frete_data_vencimento', e.target.value)} />
                  </label>
                  <label className="app-filter-field">
                    <span className="app-filter-label">Transportador (opcional)</span>
                    <input className="input" value={form.frete_transportador_nome} onChange={(e) => onChange('frete_transportador_nome', e.target.value)} />
                  </label>
                  <label className="app-filter-field md:col-start-2 lg:col-start-4">
                    <span className="app-filter-label">CPF/CNPJ (opcional)</span>
                    <input className="input" inputMode="numeric" value={form.frete_transportador_cpf_cnpj} onChange={(e) => onChange('frete_transportador_cpf_cnpj', e.target.value.replace(/\D/g, '').slice(0, 14))} />
                  </label>
                </>
              ) : null}
            </div>
          </div>

          <label className="mt-3 block">
            <span className="app-filter-label">Observacao geral</span>
            <textarea className="input mt-1 min-h-[64px] w-full" value={form.observacao_resposta} onChange={(e) => onChange('observacao_resposta', e.target.value)} />
          </label>

          <div className="mt-3 rounded-lg border border-[var(--c-border)] bg-slate-50/80 p-3 dark:bg-slate-950/20">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-[var(--c-text)]">Arquivos da resposta</div>
                <div className="text-[11px] text-[var(--c-muted)]">PDF, PNG, JPG ou JPEG. Ate 10 arquivos por envio.</div>
              </div>
              <label className={`btn btn-outline btn-sm cursor-pointer ${enviandoArquivos ? 'pointer-events-none opacity-60' : ''}`}>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  multiple
                  disabled={enviandoArquivos}
                  onChange={(event) => {
                    onUploadArquivos(event.target.files);
                    event.target.value = '';
                  }}
                />
                <HiOutlinePaperClip />
                {enviandoArquivos ? 'Enviando...' : 'Adicionar arquivos'}
              </label>
            </div>
            {arquivosResposta.length ? (
              <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {arquivosResposta.map((arquivo, index) => (
                  <button
                    key={arquivo.chave || `${arquivo.url}-${index}`}
                    type="button"
                    className="flex min-w-0 items-center gap-1.5 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-2 py-1.5 text-left text-[11px] hover:border-blue-300"
                    title={arquivo.nome_original || `Arquivo ${index + 1}`}
                    onClick={() => onAbrirArquivo(arquivo, index)}
                  >
                    <HiOutlinePaperClip className="shrink-0" />
                    <span className="truncate">{arquivo.nome_original || `Arquivo ${index + 1}`}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-[11px] text-[var(--c-muted)]">Nenhum arquivo anexado.</div>
            )}
          </div>

          <div className="compras-responsive-table mt-4 rounded-lg border border-[var(--c-border)]">
            <table className={`table ${form.frete_modo === 'POR_ITEM' ? 'min-w-[1460px]' : 'min-w-[1340px]'} text-xs`}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qtd. solic.</th>
                  <th>Preco unit.</th>
                  <th>Qtd. disponivel</th>
                  <th>Valor total</th>
                  <th>IPI</th>
                  <th>ICMS</th>
                  <th>ST</th>
                  {form.frete_modo === 'POR_ITEM' ? <th>Frete</th> : null}
                  <th>Qtd. min.</th>
                  <th>Observacao</th>
                </tr>
              </thead>
              <tbody>
                {form.itens.map((item, index) => (
                  <tr key={buildItemKey(item)}>
                    <td className="min-w-[210px]">
                      <div className="font-semibold text-[var(--c-text)]">{item.nome}</div>
                      <div className="text-[var(--c-muted)]">{formatNumeroCompra(parseNumeroCompraDigitado(item.quantidade_solicitada))} {item.unidade}</div>
                    </td>
                    <td>
                      <input
                        className="input min-w-[105px]"
                        inputMode="decimal"
                        value={item.quantidade_solicitada}
                        disabled={solicitacaoEncerrada}
                        title={solicitacaoEncerrada ? 'A quantidade solicitada nao pode ser alterada durante a reabertura por disponibilidade.' : ''}
                        onChange={(e) => onChangeItem(index, 'quantidade_solicitada', sanitizeNumeroCompraInput(e.target.value))}
                      />
                    </td>
                    <td><input className="input min-w-[140px]" inputMode="decimal" value={item.preco} onFocus={(e) => e.target.select()} onChange={(e) => onChangeItem(index, 'preco', formatarMoedaCotacaoInput(e.target.value))} /></td>
                    <td><input className="input min-w-[115px]" inputMode="decimal" value={item.quantidade_disponivel} onChange={(e) => onChangeItem(index, 'quantidade_disponivel', sanitizeNumeroCompraInput(e.target.value))} /></td>
                    <td className="min-w-[120px] font-semibold">{fmtMoeda(calcularTotalRespostaInternaItem(item, form.frete_modo === 'POR_ITEM'))}</td>
                    {['ipi_valor', 'icms_valor', 'st_valor'].map((campo) => (
                      <td key={campo}>
                        <input className="input min-w-[110px]" inputMode="decimal" value={item[campo]} onFocus={(e) => e.target.select()} onChange={(e) => onChangeItem(index, campo, formatarMoedaCotacaoInput(e.target.value, 2))} />
                      </td>
                    ))}
                    {form.frete_modo === 'POR_ITEM' ? (
                      <td><input className="input min-w-[110px]" inputMode="decimal" value={item.frete_valor} onFocus={(e) => e.target.select()} onChange={(e) => onChangeItem(index, 'frete_valor', formatarMoedaCotacaoInput(e.target.value, 2))} /></td>
                    ) : null}
                    <td><input className="input min-w-[100px]" inputMode="decimal" value={item.quantidade_minima_item} onChange={(e) => onChangeItem(index, 'quantidade_minima_item', sanitizeNumeroCompraInput(e.target.value))} /></td>
                    <td><input className="input min-w-[190px]" value={item.observacao} onChange={(e) => onChangeItem(index, 'observacao', e.target.value)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 grid gap-2 rounded-lg border border-[var(--c-border)] bg-slate-50/80 p-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
            <div><span className="block text-[var(--c-muted)]">Mercadorias</span><strong>{fmtMoeda(valorMercadorias)}</strong></div>
            <div><span className="block text-[var(--c-muted)]">IPI + ICMS + ST</span><strong>{fmtMoeda(valorTributos)}</strong></div>
            <div><span className="block text-[var(--c-muted)]">DIFAL</span><strong>{fmtMoeda(parseNumeroCompra(form.difal_valor))}</strong></div>
            <div><span className="block text-[var(--c-muted)]">Frete</span><strong>{fmtMoeda(freteAdicional)}</strong></div>
            <div><span className="block text-[var(--c-muted)]">Desconto</span><strong>- {fmtMoeda(parseNumeroCompra(form.desconto_total))}</strong></div>
            <div className="rounded-md bg-slate-900 px-2 py-1.5 text-white"><span className="block text-slate-300">Total estimado</span><strong>{fmtMoeda(valorTotalResposta)}</strong></div>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--c-border)] px-5 py-4">
          <button type="button" className="btn btn-outline" onClick={onFechar} disabled={salvando || enviandoArquivos}>Cancelar</button>
          {!solicitacaoEncerrada ? (
            <button type="button" className="btn btn-outline" onClick={() => onSalvar(false)} disabled={salvando || enviandoArquivos}>{salvando ? 'Salvando...' : 'Salvar rascunho'}</button>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={() => onSalvar(true)} disabled={salvando || enviandoArquivos}>{salvando ? 'Salvando...' : 'Salvar resposta'}</button>
        </div>
        </div>
      </div>
    </ModalPortal>
  );
}

function ModalEncerrarSemPedido({
  aberto,
  resumo,
  justificativa,
  confirmado,
  processando,
  onJustificativaChange,
  onConfirmadoChange,
  onConfirmar,
  onFechar
}) {
  if (!aberto) return null;

  const itens = Array.isArray(resumo?.itens) ? resumo.itens : [];
  const justificativaValida = String(justificativa || '').trim().length >= 10;

  return (
    <ModalPortal onClose={onFechar} closeOnEscape={!processando}>
      <div className="app-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="encerrar-sem-pedido-titulo">
        <div className="app-modal-surface app-modal-surface--standard border-red-200 dark:border-red-900/70">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--c-border)] px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 id="encerrar-sem-pedido-titulo" className="text-lg font-semibold text-[var(--c-text)]">Encerrar cotacao sem gerar pedido?</h2>
            <p className="mt-1 text-sm leading-relaxed text-[var(--c-muted)]">
              O saldo abaixo sera encerrado definitivamente. Pedidos ja gerados permanecem inalterados.
            </p>
          </div>
          <button type="button" className="compras-icon-action shrink-0" onClick={onFechar} disabled={processando} title="Fechar" aria-label="Fechar">
            <HiOutlineXMark />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-[var(--c-border)] bg-slate-50 px-3 py-2.5 dark:bg-slate-950/50">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--c-muted)]">Saldo acumulado</span>
              <strong className="mt-1 block text-base text-[var(--c-text)]">{formatNumeroCompra(resumo?.saldoTotal)}</strong>
              <span className="mt-0.5 block text-[10px] text-[var(--c-muted)]">Detalhado por item e unidade</span>
            </div>
            <div className="rounded-lg border border-[var(--c-border)] bg-slate-50 px-3 py-2.5 dark:bg-slate-950/50">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--c-muted)]">Itens com saldo</span>
              <strong className="mt-1 block text-base text-[var(--c-text)]">{itens.length}</strong>
            </div>
            <div className="rounded-lg border border-[var(--c-border)] bg-slate-50 px-3 py-2.5 dark:bg-slate-950/50">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--c-muted)]">Pedidos preservados</span>
              <strong className="mt-1 block text-base text-[var(--c-text)]">{resumo?.pedidosPreservados || 0}</strong>
            </div>
          </div>

          {Number(resumo?.selecoesAtuais || 0) > 0 ? (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              Existem {resumo.selecoesAtuais} selecoes de compra marcadas na tela. Elas serao ignoradas e nenhum novo pedido sera gerado.
            </div>
          ) : null}

          <div className="mt-4 overflow-hidden rounded-lg border border-[var(--c-border)]">
            <div className="border-b border-[var(--c-border)] bg-slate-50 px-3 py-2 text-xs font-semibold text-[var(--c-text)] dark:bg-slate-950/50">
              Itens que nao serao comprados
            </div>
            <div className="max-h-48 divide-y divide-[var(--c-border)] overflow-y-auto">
              {itens.map((item) => (
                <div key={`${item.item_tipo}-${item.item_referencia_id}`} className="flex items-start justify-between gap-4 px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <strong className="block truncate text-[var(--c-text)]" title={item.nome}>{item.nome}</strong>
                    <span className="text-[var(--c-muted)]">Comprado: {formatNumeroCompra(item.quantidadeFechada)} {item.unidade || ''}</span>
                  </div>
                  <span className="shrink-0 font-semibold text-red-700 dark:text-red-300">Saldo: {formatNumeroCompra(item.saldo)} {item.unidade || ''}</span>
                </div>
              ))}
            </div>
          </div>

          <label className="mt-4 block">
            <span className="app-filter-label">Justificativa obrigatoria</span>
            <textarea
              className="input mt-1 min-h-[96px] w-full"
              maxLength={2000}
              value={justificativa}
              disabled={processando}
              onChange={(event) => onJustificativaChange(event.target.value)}
              placeholder="Explique por que o saldo restante nao sera comprado."
            />
            <span className={`mt-1 block text-[11px] ${justificativaValida ? 'text-emerald-700' : 'text-[var(--c-muted)]'}`}>
              Minimo de 10 caracteres. {String(justificativa || '').trim().length}/2000
            </span>
          </label>

          <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-red-200 bg-red-50/70 px-3 py-3 text-sm text-red-900 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200">
            <input
              className="mt-0.5"
              type="checkbox"
              checked={confirmado}
              disabled={processando}
              onChange={(event) => onConfirmadoChange(event.target.checked)}
            />
            <span>Confirmo que o saldo restante nao sera comprado e que nenhum novo pedido deve ser gerado.</span>
          </label>
        </div>

        <div className="app-page-actions justify-end border-t border-[var(--c-border)] px-4 py-4 sm:px-5">
          <button type="button" className="btn btn-outline" onClick={onFechar} disabled={processando}>Voltar</button>
          <button type="button" className="btn btn-danger" onClick={onConfirmar} disabled={processando || !confirmado || !justificativaValida}>
            {processando ? 'Encerrando...' : 'Encerrar sem gerar pedido'}
          </button>
        </div>
        </div>
      </div>
    </ModalPortal>
  );
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function fornecedorSelectionKey(fornecedor) {
  if (fornecedor?.selection_key) return String(fornecedor.selection_key);
  if (fornecedor?.origem_cadastro === 'PARCEIRO' && fornecedor?.parceiro_id) {
    return `parceiro:${fornecedor.parceiro_id}`;
  }
  return `fornecedor:${fornecedor?.fornecedor_compra_id || fornecedor?.id}`;
}

function fornecedorToCotacaoPayload(fornecedor) {
  if (fornecedor?.origem_cadastro === 'PARCEIRO' && fornecedor?.parceiro_id) {
    return { parceiro_id: Number(fornecedor.parceiro_id) };
  }
  return { fornecedor_id: Number(fornecedor?.fornecedor_compra_id || fornecedor?.id) };
}

async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    alert('Link copiado.');
  } catch {
    alert('Nao foi possivel copiar o link automaticamente.');
  }
}

function whatsappLink(numero, mensagem) {
  const digits = String(numero || '').replace(/\D/g, '');
  if (!digits) return null;
  const numero55 = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${numero55}${mensagem ? `?text=${encodeURIComponent(mensagem)}` : ''}`;
}

function gerarMensagemCotacao(fornecedorNome, url, itens = [], pdfUrl = '') {
  return [
    `Ola${fornecedorNome ? `, ${fornecedorNome}` : ''}!`,
    '',
    'Temos uma cotacao disponivel para voce.',
    'O preenchimento direto no formulario e opcional: se preferir, voce pode apenas anexar/enviar o PDF ou imagem da sua cotacao.',
    '',
    `Link da cotacao: ${url}`,
    pdfUrl ? `PDF da cotacao: ${pdfUrl}` : '',
    '',
    'Aguardamos sua resposta. Obrigado!'
  ].filter(Boolean).join('\n');
}

function ModalPedidoFinal({ fornecedor, itensGanhos, solicitacaoId, onRemanejamento, onFechar }) {
  const [itensSelecionados, setItensSelecionados] = useState([]);
  const [quantidadesRemanejar, setQuantidadesRemanejar] = useState({});
  const [destinoFornecedorId, setDestinoFornecedorId] = useState('');
  const [modoRemanejar, setModoRemanejar] = useState(false);

  const totalGanho = useMemo(() => {
    return itensGanhos.reduce((acc, it) => {
      const preco = Number(it.preco || 0);
      const qtd = Number(it.quantidade || 0);
      return acc + preco * qtd;
    }, 0);
  }, [itensGanhos]);

  const fornecedoresDestinoCotacao = useMemo(() => {
    const selecionados = itensGanhos.filter((item) => itensSelecionados.includes(item.resposta_item_id));
    if (!selecionados.length) return [];

    const candidatos = new Map();
    selecionados.forEach((item) => {
      (item.respostasDestino || [])
        .filter((resp) =>
          Number(resp.fornecedor_compra_id) !== Number(fornecedor.fornecedor_compra_id) &&
          Number(resp.resposta_item_id) > 0 &&
          Boolean(resp.disponivel) &&
          parseNumeroCompra(resp.preco) > 0
        )
        .forEach((resp) => {
          const fornecedorId = Number(resp.fornecedor_compra_id);
          const atual = candidatos.get(fornecedorId) || {
            id: fornecedorId,
            nome: resp.fornecedor_nome || 'Fornecedor',
            itensAtendidos: new Set()
          };
          atual.itensAtendidos.add(item.item_key);
          candidatos.set(fornecedorId, atual);
        });
    });

    return [...candidatos.values()]
      .filter((candidato) => selecionados.every((item) => candidato.itensAtendidos.has(item.item_key)))
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  }, [fornecedor.fornecedor_compra_id, itensGanhos, itensSelecionados]);

  function toggleItem(item) {
    const respItemId = item.resposta_item_id;
    setItensSelecionados((prev) => {
      if (prev.includes(respItemId)) {
        setQuantidadesRemanejar((current) => {
          const next = { ...current };
          delete next[String(respItemId)];
          return next;
        });
        return prev.filter((id) => id !== respItemId);
      }

      setQuantidadesRemanejar((current) => ({
        ...current,
        [String(respItemId)]: formatNumeroCompra(item.quantidade)
      }));
      return [...prev, respItemId];
    });
    setDestinoFornecedorId('');
  }

  function confirmarRemanejamento() {
    if (!itensSelecionados.length || !destinoFornecedorId) return;

    const itens = itensGanhos
      .filter((item) => itensSelecionados.includes(item.resposta_item_id))
      .map((item) => {
        const quantidadeDigitada = quantidadesRemanejar[String(item.resposta_item_id)];
        const quantidade = quantidadeDigitada === undefined
          ? parseNumeroCompra(item.quantidade)
          : parseNumeroCompraDigitado(quantidadeDigitada);
        const quantidadeVencedora = parseNumeroCompra(item.quantidade);
        const quantidadeSolicitada = parseNumeroCompra(item.quantidade_solicitada || item.quantidade);

        if (quantidade <= 0) {
          throw new Error(`Informe uma quantidade maior que zero para ${item.nome}.`);
        }
        if (quantidade > quantidadeVencedora + 0.0001) {
          throw new Error(`A quantidade remanejada de ${item.nome} nao pode ser maior que a quantidade vencida por este fornecedor (${formatNumeroCompra(quantidadeVencedora)} ${item.unidade || ''}).`);
        }
        if (quantidade > quantidadeSolicitada + 0.0001) {
          throw new Error(`A quantidade remanejada de ${item.nome} nao pode ser maior que a quantidade solicitada (${formatNumeroCompra(quantidadeSolicitada)} ${item.unidade || ''}).`);
        }

        const respostaDestino = (item.respostasDestino || []).find((resp) =>
          Number(resp.fornecedor_compra_id) === Number(destinoFornecedorId) &&
          Number(resp.resposta_item_id) > 0 &&
          Boolean(resp.disponivel) &&
          parseNumeroCompra(resp.preco) > 0
        );

        if (!respostaDestino) {
          throw new Error(`O fornecedor destino nao possui resposta valida para ${item.nome}.`);
        }

        return {
          itemKey: item.item_key,
          itemNome: item.nome,
          unidade: item.unidade,
          respostaOrigemId: Number(item.resposta_item_id),
          respostaDestinoId: Number(respostaDestino.resposta_item_id),
          destinoFornecedorId: Number(destinoFornecedorId),
          destinoFornecedorNome: respostaDestino.fornecedor_nome || 'Fornecedor',
          quantidade
        };
      });

    onRemanejamento({ itens, destinoFornecedorId: Number(destinoFornecedorId) });
  }

  const mensagemWhatsApp = useMemo(() => {
    return [
      `Ola ${fornecedor.nome}!`,
      '',
      `Segue o pedido referente a cotacao ${solicitacaoId ? `SC-${String(solicitacaoId).padStart(5, '0')}` : ''}.`,
      `Valor total previsto: ${fmtMoeda(totalGanho)}.`,
      '',
      'O PDF do pedido deve ser enviado junto desta mensagem.',
      'Aguardamos a confirmacao de recebimento, prazo de entrega e condicao final combinada.',
      '',
      'Obrigado!'
    ].join('\n');
  }, [fornecedor, totalGanho, solicitacaoId]);

  return (
    <ModalPortal onClose={onFechar}>
      <div className="app-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="pedido-final-titulo">
        <div className="app-modal-surface app-modal-surface--standard">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--c-border)]">
          <h2 id="pedido-final-titulo" className="font-semibold text-[var(--c-text)]">
            Pedido: {fornecedor.nome}
          </h2>
          <button type="button" onClick={onFechar} className="text-[var(--c-muted)] hover:text-[var(--c-text)]">Fechar</button>
        </div>

        <div className="px-6 py-4 grid gap-4">
          {/* Itens ganhos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Itens que este fornecedor ganhou</span>
              {!modoRemanejar && (
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:underline"
                  onClick={() => setModoRemanejar(true)}
                >
                  Remanejar itens para outro fornecedor
                </button>
              )}
            </div>
            <div className="compras-responsive-table rounded-xl border border-[var(--c-border)]">
              <table className="table min-w-[720px] w-full">
                <thead>
                  <tr>
                    {modoRemanejar && <th className="w-8"></th>}
                    <th>Item</th>
                    <th>Qtd</th>
                    <th>Preco unit.</th>
                    <th>Total</th>
                    {!modoRemanejar && <th>Prazo</th>}
                  </tr>
                </thead>
                <tbody>
                  {itensGanhos.map((it) => (
                    <tr key={it.resposta_item_id || it.nome}>
                      {modoRemanejar && (
                        <td>
                          <input
                            type="checkbox"
                            checked={itensSelecionados.includes(it.resposta_item_id)}
                            onChange={() => toggleItem(it)}
                          />
                        </td>
                      )}
                      <td>
                        <div className="font-medium">{it.nome || '-'}</div>
                        {it.especificacao && <div className="text-xs text-[var(--c-muted)]">{it.especificacao}</div>}
                      </td>
                      <td>
                        {it.quantidade} {it.unidade || ''}
                        {modoRemanejar && itensSelecionados.includes(it.resposta_item_id) && (
                          <input
                            className="input mt-2 h-8 w-24 px-2 text-xs"
                            value={quantidadesRemanejar[String(it.resposta_item_id)] ?? ''}
                            onChange={(event) => setQuantidadesRemanejar((current) => ({
                              ...current,
                              [String(it.resposta_item_id)]: event.target.value
                            }))}
                            placeholder="Qtd."
                          />
                        )}
                      </td>
                      <td>{fmtMoeda(it.preco)}</td>
                      <td className="font-semibold">{fmtMoeda(Number(it.quantidade) * Number(it.preco || 0))}</td>
                      {!modoRemanejar && <td>{it.prazo || '-'}</td>}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={modoRemanejar ? 4 : 3} className="text-right font-semibold text-sm pr-2">Total do pedido:</td>
                    <td className="font-bold text-emerald-700">{fmtMoeda(totalGanho)}</td>
                    {!modoRemanejar && <td></td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Remanejamento */}
          {modoRemanejar && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 grid gap-3">
              <p className="text-sm font-medium text-amber-800">
                Selecione os itens acima e escolha o fornecedor destino para remanejar.
              </p>
              <select
                className="input"
                value={destinoFornecedorId}
                onChange={(e) => setDestinoFornecedorId(e.target.value)}
                disabled={!itensSelecionados.length}
              >
                <option value="">
                  {itensSelecionados.length ? 'Selecionar fornecedor destino...' : 'Selecione um item para listar destinos validos'}
                </option>
                {fornecedoresDestinoCotacao
                  .map((f) => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))
                }
              </select>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setModoRemanejar(false);
                    setItensSelecionados([]);
                    setQuantidadesRemanejar({});
                    setDestinoFornecedorId('');
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!itensSelecionados.length || !destinoFornecedorId}
                  onClick={() => {
                    try {
                      confirmarRemanejamento();
                    } catch (error) {
                      alert(error.message || 'Nao foi possivel remanejar os itens.');
                    }
                  }}
                >
                  Confirmar Remanejamento ({itensSelecionados.length} item{itensSelecionados.length !== 1 ? 's' : ''})
                </button>
              </div>
            </div>
          )}

          {/* Acoes de envio */}
          {!modoRemanejar && (
            <div className="grid gap-2">
              <p className="text-xs text-[var(--c-muted)]">Enviar pedido para o fornecedor:</p>
              <div className="flex flex-wrap gap-2">
                {fornecedor.whatsapp && whatsappLink(fornecedor.whatsapp) && (
                  <a
                    href={whatsappLink(fornecedor.whatsapp, mensagemWhatsApp)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                  >
                    Enviar via WhatsApp
                  </a>
                )}
                {fornecedor.email && (
                  <a
                    href={`mailto:${fornecedor.email}?subject=${encodeURIComponent(`Pedido de Compra - ${solicitacaoId ? `SC-${String(solicitacaoId).padStart(5,'0')}` : 'Cotacao'}`)}&body=${encodeURIComponent(mensagemWhatsApp)}`}
                    className="btn btn-outline"
                  >
                    Enviar por Email
                  </a>
                )}
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => copiarTexto(mensagemWhatsApp)}
                >
                  Copiar mensagem
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-[var(--c-border)]">
          <button type="button" className="btn btn-outline" onClick={onFechar}>Fechar</button>
        </div>
        </div>
      </div>
    </ModalPortal>
  );
}

// SecaoEnvioFornecedores

function SecaoEnvioFornecedores({
  solicitacao,
  podeComprar,
  categoriasFornecedor,
  fornecedores,
  buscandoFornecedores,
  fornecedoresSelecionados,
  fornecedoresSelecionadosDados,
  novoFornecedor,
  categoriaFornecedorId,
  fornecedorBusca,
  enviandoFornecedores,
  itensSelecionadosEnvio,
  onChangeFornecedorBusca,
  onChangeCategoriaFornecedorId,
  onBuscarFornecedores,
  onToggleFornecedor,
  onToggleItemEnvio,
  onToggleFornecedorItensEnvio,
  onToggleItemParaTodosFornecedores,
  onSelecionarTodosItensEnvio,
  onLimparItensEnvio,
  onChangeNovoFornecedor,
  onCriarFornecedorRapido,
  onEnviarFornecedores,
  itensCombinados
}) {
  const [selecionandoPorCategoria, setSelecionandoPorCategoria] = useState(false);
  const [categoriaSelecionada, setCategoriaSelecionada] = useState('');

  // Filtra fornecedores que possuem a categoria selecionada
  const fornecedoresComCategoria = useMemo(() => {
    if (!categoriaSelecionada) return [];
    return fornecedores.filter((f) => {
      const cats = Array.isArray(f.categoria_insumos) ? f.categoria_insumos : [];
      return cats.some((c) => String(c).toLowerCase().includes(categoriaSelecionada.toLowerCase()));
    });
  }, [fornecedores, categoriaSelecionada]);

  const buscaFornecedorNormalizada = normalizeText(fornecedorBusca);
  const deveMostrarAutocomplete = buscaFornecedorNormalizada.length > 0 && !categoriaFornecedorId;
  const deveMostrarListaCategoria = Boolean(categoriaFornecedorId);
  const fornecedoresAutocomplete = useMemo(() => {
    if (!buscaFornecedorNormalizada) return [];
    return fornecedores
      .filter((f) => {
        const texto = normalizeText([
          f.nome,
          f.documento,
          f.cnpj,
          f.cpf,
          f.email,
          f.telefone,
          f.whatsapp,
          f.contato,
          ...(Array.isArray(f.categoria_insumos) ? f.categoria_insumos : [])
        ].filter(Boolean).join(' '));
        return texto.includes(buscaFornecedorNormalizada);
      })
      .slice(0, 8);
  }, [fornecedores, buscaFornecedorNormalizada]);

  const fornecedoresListaCategoria = useMemo(() => {
    if (!categoriaFornecedorId) return [];
    if (!buscaFornecedorNormalizada) return fornecedores;
    return fornecedores.filter((f) => {
      const texto = normalizeText([
        f.nome,
        f.documento,
        f.cnpj,
        f.cpf,
        f.email,
        f.telefone,
        f.whatsapp,
        f.contato,
        ...(Array.isArray(f.categoria_insumos) ? f.categoria_insumos : [])
      ].filter(Boolean).join(' '));
      return texto.includes(buscaFornecedorNormalizada);
    });
  }, [fornecedores, categoriaFornecedorId, buscaFornecedorNormalizada]);

  const fornecedoresSelecionadosDetalhes = useMemo(() => (
    fornecedoresSelecionados
      .map((selectionKey) => fornecedoresSelecionadosDados?.[selectionKey] || fornecedores.find((f) => fornecedorSelectionKey(f) === selectionKey))
      .filter(Boolean)
  ), [fornecedoresSelecionados, fornecedoresSelecionadosDados, fornecedores]);

  const itemKeys = useMemo(() => itensCombinados.map((item) => buildItemKey(item)), [itensCombinados]);
  const totalCelulasEnvio = fornecedoresSelecionadosDetalhes.length * itemKeys.length;
  const qtdItensSelecionados = fornecedoresSelecionadosDetalhes.reduce((total, fornecedor) => {
    const selectionKey = fornecedorSelectionKey(fornecedor);
    return total + itemKeys.filter((itemKey) => Boolean(itensSelecionadosEnvio?.[selectionKey]?.[itemKey])).length;
  }, 0);
  const fornecedoresSemItens = fornecedoresSelecionadosDetalhes.filter((fornecedor) => {
    const selectionKey = fornecedorSelectionKey(fornecedor);
    return !itemKeys.some((itemKey) => Boolean(itensSelecionadosEnvio?.[selectionKey]?.[itemKey]));
  });

  function selecionarTodosComCategoria() {
    fornecedoresComCategoria.forEach((fornecedor) => {
      const selectionKey = fornecedorSelectionKey(fornecedor);
      if (!fornecedoresSelecionados.includes(selectionKey)) {
        onToggleFornecedor(selectionKey, true, fornecedor);
      }
    });
    setSelecionandoPorCategoria(false);
    setCategoriaSelecionada('');
  }

  // Monta links de WhatsApp para todos selecionados com numero
  const linksWhatsApp = useMemo(() => {
    const links = [];
    const publicBase = window.location.origin;

    // Fornecedores selecionados
    fornecedoresSelecionados.forEach((id) => {
      const f = fornecedores.find((x) => fornecedorSelectionKey(x) === id);
      if (!f?.whatsapp) return;

      // Encontra o token da cotacao para este fornecedor, quando ja gerado.
      const vinculo = (solicitacao?.fornecedores || []).find(
        (v) => String(v.fornecedor_compra_id) === String(f.fornecedor_compra_id || f.id)
      );
      if (!vinculo?.token) return;

      const url = `${publicBase}/cotacao/${vinculo.token}`;
      const msg = gerarMensagemCotacao(f.nome, url, itensCombinados, obterUrlPdfCotacaoPublica(vinculo.token));
      links.push({ nome: f.nome, link: whatsappLink(f.whatsapp, msg) });
    });

    return links;
  }, [fornecedoresSelecionados, fornecedores, solicitacao, itensCombinados]);

  // Links para fornecedores ja vinculados com WhatsApp
  const linksVinculados = useMemo(() => {
    return (solicitacao?.fornecedores || [])
      .filter((v) => v.fornecedor?.whatsapp)
      .map((v) => {
        const url = `${window.location.origin}/cotacao/${v.token}`;
        const msg = gerarMensagemCotacao(v.fornecedor.nome, url, itensCombinados, obterUrlPdfCotacaoPublica(v.token));
        return { nome: v.fornecedor.nome, link: whatsappLink(v.fornecedor.whatsapp, msg) };
      });
  }, [solicitacao, itensCombinados]);

  if (!podeComprar) return null;

  return (
    <div className="grid gap-3">
      {/* Envio para fornecedores vinculados via WhatsApp */}
      {linksVinculados.length > 0 && (
        <div className="cotacao-whatsapp-panel rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-700/70 dark:bg-emerald-950/45">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-100">Enviar cotacoes via WhatsApp</h3>
              <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-200">
                {linksVinculados.length} fornecedor(es) com mensagem pronta.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {linksVinculados.map(({ nome, link }) => (
                <a
                  key={nome}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-xs btn-primary"
                >
                  WhatsApp: {nome}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Adicionar novos fornecedores */}
      {solicitacao.status !== 'ENCERRADO' && (
        <div className="cotacao-fornecedores-panel min-w-0 max-w-full rounded-xl border border-[var(--c-border)] bg-slate-50/70 p-3 dark:bg-slate-950/55">
          <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.5fr)] 2xl:grid-cols-[minmax(420px,1fr)_minmax(260px,0.45fr)_minmax(280px,320px)]">
            <div className="grid min-w-0 content-start gap-2.5">
              {/* Selecao por categoria */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[var(--c-text)]">Selecionar fornecedores existentes</div>
                  <div className="text-xs text-[var(--c-muted)]">Busque por nome, documento, email ou categoria antes de gerar os links.</div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline text-xs"
                  onClick={() => setSelecionandoPorCategoria(!selecionandoPorCategoria)}
                >
                  Filtrar por categoria de insumo
                </button>
              </div>

              {selecionandoPorCategoria && (
                <div className="grid gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-800/70 dark:bg-blue-950/45">
                  <p className="text-xs text-blue-700 dark:text-blue-200">
                    Selecione uma categoria para auto-selecionar os fornecedores cadastrados que a atendem:
                  </p>
                  <div className="flex gap-2">
                    <input
                      className="input flex-1 text-sm"
                      placeholder="Ex.: Eletrico, Hidraulico, Concreto..."
                      value={categoriaSelecionada}
                      onChange={(e) => setCategoriaSelecionada(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-primary text-sm"
                      onClick={selecionarTodosComCategoria}
                      disabled={!categoriaSelecionada.trim() || !fornecedoresComCategoria.length}
                    >
                      Selecionar {fornecedoresComCategoria.length > 0 ? `(${fornecedoresComCategoria.length})` : ''}
                    </button>
                  </div>
                  {categoriaSelecionada && fornecedoresComCategoria.length === 0 && (
                    <p className="text-xs text-blue-600 dark:text-blue-300">Nenhum fornecedor cadastrado com esta categoria.</p>
                  )}
                </div>
              )}

              <div>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">Fornecedores</span>
                  {fornecedoresSelecionados.length > 0 && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/70 dark:text-blue-200">
                      {fornecedoresSelecionados.length} selecionado(s)
                    </span>
                  )}
                </div>
                <div className="mb-2 grid gap-2 lg:grid-cols-[minmax(0,1fr)_190px_auto]">
                  <div className="relative">
                    <input
                      className="input"
                      placeholder="Digite nome, CNPJ, email ou contato"
                      value={fornecedorBusca}
                      onChange={(e) => onChangeFornecedorBusca(e.target.value)}
                    />
                    {deveMostrarAutocomplete && (
                      <div className="cotacao-fornecedores-autocomplete absolute left-0 right-0 top-[calc(100%+6px)] z-20 rounded-xl border border-[var(--c-border)] bg-white shadow-lg dark:bg-slate-950 dark:shadow-black/30">
                        {buscandoFornecedores ? (
                          <div className="px-3 py-3 text-sm text-[var(--c-muted)]">Buscando fornecedores...</div>
                        ) : fornecedoresAutocomplete.length === 0 ? (
                          <div className="px-3 py-3 text-sm text-[var(--c-muted)]">
                            Nenhum fornecedor encontrado para essa busca.
                          </div>
                        ) : (
                          fornecedoresAutocomplete.map((f) => {
                            const selectionKey = fornecedorSelectionKey(f);
                            const checked = fornecedoresSelecionados.includes(selectionKey);
                            return (
                              <button
                                key={selectionKey}
                                type="button"
                                className={`flex w-full items-start gap-3 border-b border-[var(--c-border)] px-3 py-2 text-left last:border-b-0 hover:bg-blue-50 dark:hover:bg-blue-950/45 ${checked ? 'bg-blue-50 dark:bg-blue-950/60' : ''}`}
                                onClick={() => onToggleFornecedor(selectionKey, !checked, f)}
                              >
                                <input type="checkbox" checked={checked} readOnly className="mt-1" />
                                <span className="min-w-0">
                                  <span className="block font-semibold text-[var(--c-text)]">{f.nome}</span>
                                  <span className="block text-xs text-[var(--c-muted)]">
                                    {f.whatsapp ? `WhatsApp: ${f.whatsapp}` : 'Sem WhatsApp'} {f.email ? ` - ${f.email}` : ''}
                                  </span>
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                  <select
                    className="input"
                    value={categoriaFornecedorId}
                    onChange={(e) => onChangeCategoriaFornecedorId(e.target.value)}
                  >
                    <option value="">Todas as categorias</option>
                    {categoriasFornecedor.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-outline" onClick={onBuscarFornecedores} disabled={buscandoFornecedores}>
                    {buscandoFornecedores ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>
                {!deveMostrarAutocomplete && !deveMostrarListaCategoria && fornecedoresSelecionados.length === 0 && (
                  <div className="cotacao-fornecedores-empty rounded-lg border border-dashed border-[var(--c-border)] bg-white/70 px-3 py-2.5 text-xs text-[var(--c-muted)] dark:bg-slate-950/45">
                    Digite no campo de busca para localizar fornecedores ou escolha uma categoria para listar os cadastrados.
                  </div>
                )}
                {deveMostrarListaCategoria && (
                  <div className="cotacao-fornecedores-list app-list-stack max-h-[220px] overflow-y-auto rounded-xl border border-[var(--c-border)] bg-white/80 p-2 dark:bg-slate-950/45">
                    {buscandoFornecedores ? (
                      <div className="text-sm text-[var(--c-muted)]">Buscando...</div>
                    ) : fornecedoresListaCategoria.length === 0 ? (
                      <div className="text-sm text-[var(--c-muted)]">Nenhum fornecedor encontrado para a categoria selecionada.</div>
                    ) : (
                      fornecedoresListaCategoria.map((f) => (
                        <label key={fornecedorSelectionKey(f)} className="app-list-card flex items-start gap-2 px-3 py-2">
                          <input
                            type="checkbox"
                            checked={fornecedoresSelecionados.includes(fornecedorSelectionKey(f))}
                            onChange={(e) => onToggleFornecedor(fornecedorSelectionKey(f), e.target.checked, f)}
                          />
                          <div>
                            <div className="font-medium">{f.nome}</div>
                            {f.whatsapp && (
                              <div className="text-xs text-[var(--c-muted)]">WhatsApp: {f.whatsapp}</div>
                            )}
                            {Array.isArray(f.categoria_insumos) && f.categoria_insumos.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {f.categoria_insumos.map((c) => (
                                  <span key={c} className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700 dark:bg-blue-950/70 dark:text-blue-200">{c}</span>
                                ))}
                              </div>
                            )}
                            <div className="text-xs text-[var(--c-muted)]">
                              {f.email || 'Sem email'} {f.telefone ? ` - ${f.telefone}` : ''}
                            </div>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="cotacao-fornecedores-selecionados grid min-w-0 content-start gap-2.5 rounded-xl border border-[var(--c-border)] bg-white/85 p-3 dark:bg-slate-950/65">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-[var(--c-text)]">Fornecedores selecionados</div>
                  <div className="text-xs text-[var(--c-muted)]">Revise antes de gerar os links.</div>
                </div>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950/70 dark:text-blue-200">
                  {fornecedoresSelecionadosDetalhes.length}
                </span>
              </div>
              {fornecedoresSelecionadosDetalhes.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--c-border)] px-3 py-4 text-xs text-[var(--c-muted)]">
                  Nenhum fornecedor selecionado.
                </div>
              ) : (
                <div className="app-list-stack max-h-[250px] overflow-y-auto">
                  {fornecedoresSelecionadosDetalhes.map((fornecedor) => {
                    const selectionKey = fornecedorSelectionKey(fornecedor);
                    return (
                      <div key={selectionKey} className="rounded-lg border border-[var(--c-border)] bg-slate-50 px-3 py-2 text-xs dark:bg-slate-900/60">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-[var(--c-text)]">{fornecedor.nome}</div>
                            <div className="truncate text-[var(--c-muted)]">
                              {fornecedor.whatsapp || fornecedor.telefone || fornecedor.email || 'Sem contato principal'}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="text-[11px] font-semibold text-red-600 hover:text-red-700 dark:text-red-300"
                            onClick={() => onToggleFornecedor(selectionKey, false, fornecedor)}
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="cotacao-fornecedor-rapido grid min-w-0 content-start gap-2.5 rounded-xl border border-[var(--c-border)] bg-white/85 p-3 xl:col-span-2 2xl:col-span-1 dark:bg-slate-950/65">
              <div>
                <div className="text-sm font-semibold text-[var(--c-text)]">Cadastro rapido</div>
                <div className="text-xs text-[var(--c-muted)]">Inclua um fornecedor novo sem sair da cotacao.</div>
              </div>
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-semibold text-[var(--c-muted)]">Nome do fornecedor</span>
                <input className="input" placeholder="Ex.: Fornecedor ABC" value={novoFornecedor.nome} onChange={(e) => onChangeNovoFornecedor('nome', e.target.value)} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-semibold text-[var(--c-muted)]">CPF/CNPJ</span>
                <input className="input" placeholder="CPF ou CNPJ do fornecedor" value={novoFornecedor.cnpj} onChange={(e) => onChangeNovoFornecedor('cnpj', e.target.value)} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-semibold text-[var(--c-muted)]">WhatsApp</span>
                <input className="input" placeholder="(00) 00000-0000" value={novoFornecedor.whatsapp} onChange={(e) => onChangeNovoFornecedor('whatsapp', e.target.value)} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-semibold text-[var(--c-muted)]">Email</span>
                <input className="input" placeholder="email@fornecedor.com" value={novoFornecedor.email} onChange={(e) => onChangeNovoFornecedor('email', e.target.value)} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-semibold text-[var(--c-muted)]">Contato</span>
                <input className="input" placeholder="Nome do contato" value={novoFornecedor.contato} onChange={(e) => onChangeNovoFornecedor('contato', e.target.value)} />
              </label>
              <div className="grid gap-1.5 pt-1">
                <button type="button" className="btn btn-outline w-full" onClick={onCriarFornecedorRapido}>Cadastrar e selecionar</button>
                <button type="button" className="btn btn-primary w-full" onClick={onEnviarFornecedores} disabled={enviandoFornecedores}>
                  {enviandoFornecedores ? 'Gerando links...' : 'Gerar links de cotacao'}
                </button>
              </div>
            </div>
          </div>

          {fornecedoresSelecionados.length > 0 && (
            <div className="mt-4 min-w-0 max-w-full rounded-xl border border-[var(--c-border)] bg-white/85 p-3 dark:bg-slate-950/65">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[var(--c-text)]">Itens por fornecedor</div>
                  <div className="text-xs text-[var(--c-muted)]">
                    Marque quais itens cada fornecedor recebera no link. Cada coluna vira uma cotacao daquele fornecedor.
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {qtdItensSelecionados}/{totalCelulasEnvio} selecao(oes)
                  </span>
                  <button type="button" className="btn btn-xs btn-outline" onClick={onSelecionarTodosItensEnvio}>Selecionar tudo</button>
                  <button type="button" className="btn btn-xs btn-outline" onClick={onLimparItensEnvio}>Limpar</button>
                </div>
              </div>
              {fornecedoresSemItens.length > 0 && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-700/70 dark:bg-amber-950/45 dark:text-amber-100">
                  Selecione ao menos um item para: {fornecedoresSemItens.map((fornecedor) => fornecedor.nome).join(', ')}.
                </div>
              )}
              <div
                className="cotacao-scroll-region max-w-full overflow-x-auto overscroll-x-contain rounded-lg border border-[var(--c-border)] pb-2"
                role="region"
                aria-label="Itens por fornecedor"
                tabIndex={0}
              >
                <table className="w-max min-w-[980px] text-left text-xs">
                  <thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                    <tr>
                      <th className="sticky left-0 z-10 min-w-[260px] bg-slate-100 px-3 py-2 dark:bg-slate-900">Item</th>
                      <th className="min-w-[95px] px-3 py-2">Qtd.</th>
                      <th className="min-w-[180px] px-3 py-2">Especificacao</th>
                      <th className="min-w-[115px] px-3 py-2">Necessario</th>
                      {fornecedoresSelecionadosDetalhes.map((fornecedor) => {
                        const selectionKey = fornecedorSelectionKey(fornecedor);
                        const itensFornecedor = itemKeys.filter((itemKey) => Boolean(itensSelecionadosEnvio?.[selectionKey]?.[itemKey])).length;
                        const todosMarcados = itemKeys.length > 0 && itensFornecedor === itemKeys.length;
                        return (
                          <th key={selectionKey} className="min-w-[190px] border-l border-[var(--c-border)] px-3 py-2 text-center">
                            <label className="flex cursor-pointer flex-col items-center gap-1 normal-case tracking-normal">
                              <span className="line-clamp-2 font-semibold text-slate-700 dark:text-slate-100">{fornecedor.nome}</span>
                              <span className="text-[10px] text-[var(--c-muted)]">{itensFornecedor}/{itemKeys.length} item(ns)</span>
                              <input
                                type="checkbox"
                                checked={todosMarcados}
                                onChange={(event) => onToggleFornecedorItensEnvio(selectionKey, event.target.checked)}
                                aria-label={`Selecionar todos os itens para ${fornecedor.nome}`}
                              />
                            </label>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {itensCombinados.map((item) => {
                      const itemKey = buildItemKey(item);
                      const itemMarcadoParaTodos = fornecedoresSelecionadosDetalhes.length > 0
                        && fornecedoresSelecionadosDetalhes.every((fornecedor) => Boolean(itensSelecionadosEnvio?.[fornecedorSelectionKey(fornecedor)]?.[itemKey]));
                      return (
                        <tr key={itemKey} className="border-t border-[var(--c-border)] align-top">
                          <td className="sticky left-0 z-[1] bg-white px-3 py-2 dark:bg-slate-950">
                            <label className="flex items-start gap-2">
                              <input
                                className="mt-1"
                                type="checkbox"
                                checked={itemMarcadoParaTodos}
                                onChange={(event) => onToggleItemParaTodosFornecedores(itemKey, event.target.checked)}
                                aria-label={`Selecionar ${item.nome} para todos os fornecedores`}
                              />
                              <span>
                                <span className="block font-semibold text-[var(--c-text)]">{item.nome}</span>
                                <span className="block text-[11px] text-[var(--c-muted)]">{item.item_tipo === 'MANUAL' ? 'Manual' : 'Cadastrado'}</span>
                              </span>
                            </label>
                          </td>
                          <td className="px-3 py-2">{formatNumeroCompra(item.quantidade)} {item.unidade}</td>
                          <td className="px-3 py-2 text-[var(--c-muted)]">{item.especificacao || '-'}</td>
                          <td className="px-3 py-2">{fmt(item.necessario_para)}</td>
                          {fornecedoresSelecionadosDetalhes.map((fornecedor) => {
                            const selectionKey = fornecedorSelectionKey(fornecedor);
                            return (
                              <td key={`${selectionKey}-${itemKey}`} className="border-l border-[var(--c-border)] px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={Boolean(itensSelecionadosEnvio?.[selectionKey]?.[itemKey])}
                                  onChange={(event) => onToggleItemEnvio(selectionKey, itemKey, event.target.checked)}
                                  aria-label={`Enviar ${item.nome} para ${fornecedor.nome}`}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// SecaoComparativo

function SecaoComparativo({
  comparativo,
  solicitacao,
  podeComprar,
  podeEncerrar,
  podeEncerrarSemPedido,
  podeEditarResposta,
  vencedoresSelecionados,
  onVencedorChange,
  onEditarRespostaFornecedor,
  onRemanejamentoAplicado,
  onEncerrar,
  onEncerrarSemPedido,
  encerrando,
  encerrandoSemPedido
}) {
  const [modoVisualizacao, setModoVisualizacao] = useState('cards');
  const [painelFornecedoresAberto, setPainelFornecedoresAberto] = useState(false);
  const [fornecedoresVisiveis, setFornecedoresVisiveis] = useState({});

  function getQuantidadeAlocada(respostaItemId) {
    const registro = vencedoresSelecionados[String(respostaItemId)];
    return parseNumeroCompra(registro?.quantidade_alocada);
  }

  function getQuantidadeAlocadaInput(respostaItemId) {
    const registro = vencedoresSelecionados[String(respostaItemId)];
    if (!registro) return '';
    if (registro.quantidade_alocada_input !== undefined) {
      return registro.quantidade_alocada_input;
    }
    return formatNumeroCompra(registro.quantidade_alocada);
  }

  function getTotalAlocadoItem(item) {
    return (item.respostas || []).reduce((acc, resp) => acc + getQuantidadeAlocada(resp.resposta_item_id), 0);
  }

  function getSaldoDisponivelItem(item) {
    return parseNumeroCompra(item?.saldo_disponivel ?? item?.quantidade);
  }

  function getSaldoDisponivelFornecedor(resposta) {
    if (resposta?.saldo_disponivel_fornecedor !== undefined && resposta?.saldo_disponivel_fornecedor !== null) {
      return parseNumeroCompra(resposta.saldo_disponivel_fornecedor);
    }
    return Math.max(
      0,
      parseNumeroCompra(resposta?.quantidade_disponivel) - parseNumeroCompra(resposta?.quantidade_alocada)
    );
  }

  function getQuantidadeInicialSelecao(item, resposta) {
    const saldoFornecedor = getSaldoDisponivelFornecedor(resposta);
    const saldoItem = getSaldoDisponivelItem(item);
    return saldoItem > 0 ? Math.min(saldoItem, saldoFornecedor) : saldoFornecedor;
  }

  const fornecedoresMapa = useMemo(() => {
    const fornecedoresPorId = new Map();
    (comparativo?.fornecedores || []).forEach((fornecedor) => {
      fornecedoresPorId.set(String(fornecedor.fornecedor_id), {
        ...fornecedor,
        possuiResposta: false
      });
    });

    (comparativo?.itens || []).forEach((item) => {
      (item.respostas || []).forEach((resposta) => {
        const key = String(resposta.fornecedor_id);
        const atual = fornecedoresPorId.get(key) || {
          id: resposta.cotacao_fornecedor_id,
          fornecedor_id: resposta.fornecedor_id,
          nome: resposta.fornecedor_nome,
          status: resposta.status_fornecedor
        };
        fornecedoresPorId.set(key, {
          ...atual,
          id: atual.id || resposta.cotacao_fornecedor_id,
          possuiResposta: true
        });
      });
    });

    return [...fornecedoresPorId.values()]
      .filter((fornecedor) => fornecedor.possuiResposta)
      .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
  }, [comparativo]);

  const fornecedoresMapaVisiveis = useMemo(() => {
    if (!fornecedoresMapa.length) return [];
    return fornecedoresMapa.filter((fornecedor) => fornecedoresVisiveis[String(fornecedor.fornecedor_id)] !== false);
  }, [fornecedoresMapa, fornecedoresVisiveis]);

  function toggleFornecedorMapa(fornecedorId) {
    setFornecedoresVisiveis((atual) => ({
      ...atual,
      [String(fornecedorId)]: atual[String(fornecedorId)] === false
    }));
  }

  function mostrarTodosFornecedoresMapa() {
    setFornecedoresVisiveis({});
  }

  function ocultarTodosFornecedoresMapa() {
    setFornecedoresVisiveis(
      fornecedoresMapa.reduce((acc, fornecedor) => {
        acc[String(fornecedor.fornecedor_id)] = false;
        return acc;
      }, {})
    );
  }

  function renderCelulaFornecedorMapa(item, fornecedor) {
    const resposta = (item.respostas || []).find((resp) => String(resp.fornecedor_id) === String(fornecedor.fornecedor_id));
    if (!resposta) {
      return (
        <td key={`${buildItemKey(item)}-${fornecedor.fornecedor_id}`} className="min-w-[220px] border-l border-[var(--c-border)] bg-slate-50/70 px-2 py-2 align-top text-xs text-[var(--c-muted)]">
          -
        </td>
      );
    }

    const quantidadeAlocada = getQuantidadeAlocada(resposta.resposta_item_id);
    const isVencedor = quantidadeAlocada > 0;
    const saldoDisponivel = getSaldoDisponivelItem(item);
    const saldoDisponivelFornecedor = getSaldoDisponivelFornecedor(resposta);
    const podeSelecionar = podeEncerrar && saldoDisponivelFornecedor > 0 && resposta.resposta_item_id && resposta.disponivel && resposta.preco;
    const quantidadeDisponivelFornecedor = parseNumeroCompra(resposta.quantidade_disponivel);
    const excedeuSolicitado = getTotalAlocadoItem(item) > saldoDisponivel + 0.0001;

    return (
      <td
        key={`${buildItemKey(item)}-${fornecedor.fornecedor_id}`}
        className={`min-w-[270px] border-l border-[var(--c-border)] px-2 py-2 align-top text-xs ${excedeuSolicitado ? 'bg-amber-50' : (isVencedor ? 'bg-emerald-50/80' : 'bg-white')}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold text-[var(--c-text)]">{resposta.preco ? fmtMoeda(resposta.preco) : '-'}</div>
            <div className="text-[11px] text-[var(--c-muted)]">
              Total cotado: {resposta.preco ? fmtMoeda(resposta.valor_total_cotado) : '-'}
            </div>
          </div>
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center border border-[var(--c-border)] bg-white text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => onEditarRespostaFornecedor?.(resposta.cotacao_fornecedor_id)}
            disabled={!podeEditarResposta}
            title={podeEditarResposta ? 'Editar resposta internamente' : 'Edicao indisponivel'}
            aria-label="Editar resposta internamente"
          >
            <HiOutlinePencilSquare className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-[var(--c-muted)]">
          <span className="font-semibold text-emerald-700">Disponivel: {formatNumeroCompra(quantidadeDisponivelFornecedor)}</span>
          <span className={saldoDisponivelFornecedor > 0 ? 'font-semibold text-blue-700' : 'text-slate-500'}>
            Saldo fornecedor: {formatNumeroCompra(saldoDisponivelFornecedor)}
          </span>
          <span>Prazo entrega: {resposta.prazo_entrega_fornecedor || '-'}</span>
          <span>IPI: {fmtMoeda(resposta.ipi_valor)}</span>
          <span>ICMS: {fmtMoeda(resposta.icms_valor)}</span>
          <span>ST: {fmtMoeda(resposta.st_valor)}</span>
          {parseNumeroCompra(resposta.frete_item_valor) > 0 ? (
            <span>Frete do item: {fmtMoeda(resposta.frete_item_valor)}</span>
          ) : null}
          <span>Qtd. min.: {resposta.quantidade_minima_item || '-'}</span>
          <span className="col-span-2 truncate" title={resposta.condicao_pagamento || ''}>
            Cond.: {resposta.condicao_pagamento || '-'}
          </span>
          {resposta.observacao ? (
            <span className="col-span-2 line-clamp-2" title={resposta.observacao}>
              Obs.: {resposta.observacao}
            </span>
          ) : null}
        </div>

        <div className="mt-2 flex items-center gap-2 border-t border-[var(--c-border)] pt-2">
          <input
            type="checkbox"
            checked={isVencedor}
            disabled={!podeSelecionar}
            onChange={(event) => {
              onVencedorChange({
                item,
                resposta,
                quantidade: event.target.checked ? getQuantidadeInicialSelecao(item, resposta) : 0
              });
            }}
          />
          <input
            className="input h-7 w-24 px-2 text-xs"
            value={isVencedor ? getQuantidadeAlocadaInput(resposta.resposta_item_id) : ''}
            placeholder="Qtd."
            disabled={!podeEncerrar || !isVencedor}
            onChange={(event) => onVencedorChange({
              item,
              resposta,
              quantidade: event.target.value
            })}
          />
          {excedeuSolicitado ? (
            <span className="text-[10px] font-semibold text-amber-700">Acima do solicitado</span>
          ) : null}
        </div>
      </td>
    );
  }

  if (!comparativo?.itens?.length) {
    return (
      <div className="card sol-surface-card cotacao-comparativo-panel">
        <div className="card-header">
          <h2 className="font-semibold">Comparativo de Cotacoes</h2>
        </div>
        <div className="app-empty-card">
          O comparativo aparece assim que os fornecedores responderem a cotacao.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card sol-surface-card">
        <div className="card-header flex flex-wrap items-center justify-between gap-3 pb-3">
          <div>
            <h2 className="font-semibold">Comparativo por item</h2>
            <p className="mt-0.5 text-xs text-[var(--c-muted)]">Compare respostas, selecione vencedores e encerre a cotacao quando estiver pronta.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-[var(--c-border)] bg-slate-50 p-1 text-xs">
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 font-semibold transition ${modoVisualizacao === 'cards' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                onClick={() => setModoVisualizacao('cards')}
              >
                Cards
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 font-semibold transition ${modoVisualizacao === 'mapa' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                onClick={() => setModoVisualizacao('mapa')}
              >
                Mapa
              </button>
            </div>
            <span className="cotacao-comparativo-count rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
              {comparativo.itens.length} item(ns)
            </span>
          </div>
        </div>

        {modoVisualizacao === 'mapa' && (
          <div className="mb-3 rounded-lg border border-[var(--c-border)] bg-slate-50/80">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--c-border)] px-3 py-2">
              <div>
                <div className="text-sm font-semibold text-[var(--c-text)]">Mapa de comparacao</div>
                <div className="text-xs text-[var(--c-muted)]">Itens nas linhas e fornecedores respondidos nas colunas.</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn btn-xs btn-outline" onClick={() => setPainelFornecedoresAberto((atual) => !atual)}>
                  Fornecedores ({fornecedoresMapaVisiveis.length}/{fornecedoresMapa.length})
                </button>
                <button type="button" className="btn btn-xs btn-outline" onClick={mostrarTodosFornecedoresMapa}>Mostrar todos</button>
                <button type="button" className="btn btn-xs btn-outline" onClick={ocultarTodosFornecedoresMapa}>Ocultar todos</button>
              </div>
            </div>

            {painelFornecedoresAberto && (
              <div className="grid gap-2 border-b border-[var(--c-border)] px-3 py-3 sm:grid-cols-2 lg:grid-cols-3">
                {fornecedoresMapa.map((fornecedor) => {
                  const visivel = fornecedoresVisiveis[String(fornecedor.fornecedor_id)] !== false;
                  return (
                    <label
                      key={fornecedor.fornecedor_id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${visivel ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-[var(--c-border)] bg-white text-slate-600'}`}
                    >
                      <input
                        type="checkbox"
                        checked={visivel}
                        onChange={() => toggleFornecedorMapa(fornecedor.fornecedor_id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{fornecedor.nome}</span>
                        <span className="block text-[10px] text-[var(--c-muted)]">
                          DIFAL {fmtMoeda(fornecedor.difal_valor)} · Frete {fornecedor.frete_tipo === 'SEM_FRETE'
                            ? 'sem frete'
                            : `${fornecedor.frete_tipo === 'TERCEIRO' ? 'terceiro' : 'embutido'} ${fmtMoeda(fornecedor.frete_valor)}${fornecedor.frete_modo === 'POR_ITEM' ? ' por item' : ' global'}`}
                        </span>
                      </span>
                      <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--c-muted)]">{fmtStatus(fornecedor.status)}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {fornecedoresMapaVisiveis.length > 0 ? (
              <div className="compras-responsive-table">
                <table className="table min-w-[1420px] text-xs">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-20 min-w-[260px] bg-slate-100">Item</th>
                      <th className="sticky left-[260px] z-20 min-w-[110px] bg-slate-100 text-right">Qtd.</th>
                      {fornecedoresMapaVisiveis.map((fornecedor) => (
                        <th key={fornecedor.fornecedor_id} className="min-w-[240px] border-l border-[var(--c-border)] bg-slate-100">
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0">
                              <span className="block truncate" title={fornecedor.nome}>{fornecedor.nome}</span>
                              <span className="block text-[9px] font-normal text-[var(--c-muted)]">
                                DIFAL {fmtMoeda(fornecedor.difal_valor)} · {fornecedor.frete_tipo === 'SEM_FRETE'
                                  ? 'sem frete'
                                  : `frete ${fornecedor.frete_tipo === 'TERCEIRO' ? 'terceiro' : 'embutido'} ${fmtMoeda(fornecedor.frete_valor)}${fornecedor.frete_modo === 'POR_ITEM' ? ' por item' : ' global'}`}
                              </span>
                            </span>
                            <button
                              type="button"
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--c-border)] bg-white text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                              onClick={() => onEditarRespostaFornecedor?.(fornecedor.id)}
                              disabled={!podeEditarResposta}
                              title={podeEditarResposta ? 'Editar resposta internamente' : 'Edicao indisponivel'}
                              aria-label="Editar resposta internamente"
                            >
                              <HiOutlinePencilSquare className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparativo.itens.map((item) => {
                      const totalAlocadoItem = getTotalAlocadoItem(item);
                      const quantidadeItem = parseNumeroCompra(item.quantidade_atual ?? item.quantidade);
                      const quantidadeFechada = parseNumeroCompra(item.quantidade_fechada);
                      const saldoDisponivel = getSaldoDisponivelItem(item);
                      const excedeu = totalAlocadoItem > saldoDisponivel + 0.0001;
                      return (
                        <tr key={buildItemKey(item)}>
                          <td className="sticky left-0 z-10 min-w-[260px] bg-white px-3 py-2 align-top">
                            <div className="font-semibold text-[var(--c-text)]">{item.nome}</div>
                            <div className="text-[11px] text-[var(--c-muted)]">
                              {item.item_tipo === 'MANUAL' ? 'Manual' : 'Cadastrado'}
                              {item.especificacao ? ` - ${item.especificacao}` : ''}
                            </div>
                            {podeEncerrar ? (
                              <div className={`mt-1 text-[11px] ${excedeu ? 'font-semibold text-amber-700' : 'text-[var(--c-muted)]'}`}>
                                Rodada: <strong>{formatNumeroCompra(totalAlocadoItem)}</strong> | Fechado: {formatNumeroCompra(quantidadeFechada)} | Saldo: {formatNumeroCompra(saldoDisponivel)} {item.unidade || ''}
                              </div>
                            ) : null}
                          </td>
                          <td className="sticky left-[260px] z-10 min-w-[110px] bg-white px-3 py-2 text-right align-top font-semibold">
                            {formatNumeroCompra(quantidadeItem)} {item.unidade || ''}
                          </td>
                          {fornecedoresMapaVisiveis.map((fornecedor) => renderCelulaFornecedorMapa(item, fornecedor))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-3 py-8 text-center text-sm text-[var(--c-muted)]">
                Selecione ao menos um fornecedor respondido para visualizar o mapa.
              </div>
            )}
          </div>
        )}

        {modoVisualizacao === 'cards' && (
        <div className="app-list-stack gap-2">
          {comparativo.itens.map((item) => (
            <div key={buildItemKey(item)} className="cotacao-comparativo-item app-list-card px-3 py-2.5">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{item.nome}</div>
                  <div className="text-xs text-[var(--c-muted)]">
                    {formatNumeroCompra(item.quantidade_atual ?? item.quantidade)} {item.unidade} - {item.item_tipo === 'MANUAL' ? 'Manual' : 'Cadastrado'}
                    {item.especificacao ? ` - ${item.especificacao}` : ''}
                  </div>
                  {podeEncerrar ? (
                    <div className="mt-1 text-xs text-[var(--c-muted)]">
                      Rodada: <strong>{formatNumeroCompra(getTotalAlocadoItem(item))}</strong> | Fechado: {formatNumeroCompra(item.quantidade_fechada)} | Saldo: {formatNumeroCompra(getSaldoDisponivelItem(item))} {item.unidade || ''}
                    </div>
                  ) : null}
                </div>
                {item.melhor_preco && (
                  <div className="cotacao-menor-preco rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700">
                    Menor: <strong>{item.melhor_preco.fornecedor_nome}</strong> - {fmtMoeda(item.melhor_preco.preco)}/un
                  </div>
                )}
              </div>

              <div className="app-table-shell compras-responsive-table">
                <table className="table min-w-[1180px] text-xs">
                  <thead>
                    <tr>
                      <th>Fornecedor</th>
                      <th>Qtd. disponivel</th>
                      <th>Preco unit.</th>
                      <th>Valor total</th>
                      <th>IPI</th>
                      <th>ICMS</th>
                      <th>ST</th>
                      <th>DIFAL</th>
                      <th>Frete</th>
                      <th>Prazo entrega</th>
                      <th>Cond. pag.</th>
                      <th>Qtd. min.</th>
                      <th>Observacao</th>
                      <th className="min-w-[150px]">Comprar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.respostas.map((resp) => {
                      const quantidadeAlocada = getQuantidadeAlocada(resp.resposta_item_id);
                      const isVencedor = quantidadeAlocada > 0;
                      const totalAlocadoItem = getTotalAlocadoItem(item);
                      const saldoDisponivel = getSaldoDisponivelItem(item);
                      const excedeu = totalAlocadoItem > saldoDisponivel + 0.0001;
                      return (
                        <tr
                          key={`${item.id}-${resp.fornecedor_id}`}
                          className={`cotacao-comparativo-resposta ${isVencedor ? 'cotacao-comparativo-resposta-vencedora bg-emerald-50' : ''} ${excedeu ? 'cotacao-comparativo-resposta-excedida bg-amber-50' : ''}`}
                        >
                          <td className="text-xs font-medium">{resp.fornecedor_nome}</td>
                          <td>
                            <span className="block font-semibold text-emerald-700">{formatNumeroCompra(resp.quantidade_disponivel)}</span>
                            <span className="block text-[10px] text-blue-700">Saldo: {formatNumeroCompra(getSaldoDisponivelFornecedor(resp))}</span>
                          </td>
                          <td>{resp.preco ? fmtMoeda(resp.preco) : '-'}</td>
                          <td className="font-medium">{resp.preco ? fmtMoeda(resp.valor_total_cotado) : '-'}</td>
                          <td>{fmtMoeda(resp.ipi_valor)}</td>
                          <td>{fmtMoeda(resp.icms_valor)}</td>
                          <td>{fmtMoeda(resp.st_valor)}</td>
                          <td>{fmtMoeda(resp.difal_valor)}</td>
                          <td className="max-w-[130px] text-xs">
                            {resp.frete_tipo === 'SEM_FRETE'
                              ? 'Sem frete'
                              : `${resp.frete_tipo === 'TERCEIRO' ? 'Terceiro' : 'Embutido'} ${fmtMoeda(resp.frete_item_valor || resp.frete_valor)}${resp.frete_modo === 'POR_ITEM' ? ' (item)' : ' (global)'}`}
                          </td>
                          <td>{resp.prazo_entrega_fornecedor || '-'}</td>
                          <td className="max-w-[150px] text-xs">{resp.condicao_pagamento || '-'}</td>
                          <td>{resp.quantidade_minima_item || '-'}</td>
                          <td className="max-w-[160px] text-xs">{resp.observacao || '-'}</td>
                          <td>
                            {resp.resposta_item_id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isVencedor}
                                  disabled={!podeEncerrar || getSaldoDisponivelFornecedor(resp) <= 0 || !resp.disponivel || !resp.preco}
                                  onChange={(event) => {
                                    const checked = event.target.checked;
                                    onVencedorChange({
                                      item,
                                      resposta: resp,
                                      quantidade: checked
                                        ? getQuantidadeInicialSelecao(item, resp)
                                        : 0
                                    });
                                  }}
                                />
                                <input
                                  className="input h-8 w-20 px-2 text-xs"
                                  value={isVencedor ? getQuantidadeAlocadaInput(resp.resposta_item_id) : ''}
                                  placeholder="Qtd."
                                  disabled={!podeEncerrar || !isVencedor}
                                  onChange={(event) => onVencedorChange({
                                    item,
                                    resposta: resp,
                                    quantidade: event.target.value
                                  })}
                                />
                                {excedeu ? (
                                  <span className="text-[10px] font-semibold text-amber-700" title="Exige justificativa no fechamento">
                                    Acima do solicitado
                                  </span>
                                ) : null}
                              </div>
                            ) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
        )}

          {(podeEncerrar || podeEncerrarSemPedido) && String(solicitacao.status || '').toUpperCase() !== 'RECUSADO' && (
            <div className="app-page-actions justify-end">
              {podeEncerrarSemPedido ? (
                <button
                  type="button"
                  className="btn btn-outline border-red-300 text-red-700 hover:border-red-400 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                  onClick={onEncerrarSemPedido}
                  disabled={encerrando || encerrandoSemPedido}
                >
                  {encerrandoSemPedido ? 'Encerrando...' : 'Encerrar sem pedido'}
                </button>
              ) : null}
              {podeEncerrar ? (
                <button type="button" className="btn btn-primary" onClick={onEncerrar} disabled={encerrando || encerrandoSemPedido}>
                  {encerrando
                    ? 'Atualizando...'
                    : String(solicitacao.status || '').toUpperCase() === 'ENCERRADO'
                      ? 'Atualizar vencedores e pedidos'
                      : 'Gerar pedidos selecionados'}
                </button>
              ) : null}
            </div>
          )}
      </div>

    </>
  );
}

// Componente principal

export default function GerenciarCotacaoSolicitacao() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [solicitacao, setSolicitacao] = useState(null);
  const [erroCarregamento, setErroCarregamento] = useState('');
  const [fornecedores, setFornecedores] = useState([]);
  const [categoriasFornecedor, setCategoriasFornecedor] = useState([]);
  const [categoriaFornecedorId, setCategoriaFornecedorId] = useState('');
  const [fornecedorBusca, setFornecedorBusca] = useState('');
  const [buscandoFornecedores, setBuscandoFornecedores] = useState(false);
  const [comparativo, setComparativo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [previewArquivo, setPreviewArquivo] = useState(null);
  const [enviandoFornecedores, setEnviandoFornecedores] = useState(false);
  const [reabrindoCotacaoId, setReabrindoCotacaoId] = useState(null);
  const [cancelandoCotacao, setCancelandoCotacao] = useState(false);
  const [modalCancelamentoCotacao, setModalCancelamentoCotacao] = useState(false);
  const [motivoCancelamentoCotacao, setMotivoCancelamentoCotacao] = useState('');
  const [cotacaoRespostaInterna, setCotacaoRespostaInterna] = useState(null);
  const [formRespostaInterna, setFormRespostaInterna] = useState(null);
  const [salvandoRespostaInterna, setSalvandoRespostaInterna] = useState(false);
  const [enviandoArquivosRespostaInterna, setEnviandoArquivosRespostaInterna] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const [modalEncerrarSemPedido, setModalEncerrarSemPedido] = useState(false);
  const [justificativaEncerrarSemPedido, setJustificativaEncerrarSemPedido] = useState('');
  const [confirmadoEncerrarSemPedido, setConfirmadoEncerrarSemPedido] = useState(false);
  const [encerrandoSemPedido, setEncerrandoSemPedido] = useState(false);
  const [comentarioCotacao, setComentarioCotacao] = useState('');
  const [registrandoComentario, setRegistrandoComentario] = useState(false);
  const [fornecedoresSelecionados, setFornecedoresSelecionados] = useState([]);
  const [fornecedoresSelecionadosDados, setFornecedoresSelecionadosDados] = useState({});
  const [itensSelecionadosEnvio, setItensSelecionadosEnvio] = useState({});
  const [novoFornecedor, setNovoFornecedor] = useState({ nome: '', cnpj: '', email: '', whatsapp: '', contato: '' });
  const [vencedoresSelecionados, setVencedoresSelecionados] = useState({});
  const encerramentoIdempotencyRef = useRef(null);
  const encerramentoSemPedidoIdempotencyRef = useRef(null);
  const fornecedorRequestRef = useRef({ sequencia: 0, controller: null });

  const podeComprar = canOperateComprasCotacoes(user);
  const podeFecharParcialCotacao = canFecharParcialComprasCotacoes(user);
  const podeEncerrarCotacao = canEncerrarComprasCotacoes(user);
  const podeEncerrarSemPedidoCotacao = canEncerrarSemPedidoComprasCotacoes(user);
  const podeReabrirCotacaoFornecedor = canReabrirComprasCotacoes(user);
  const podeCancelarCotacao = canCancelarComprasCotacoes(user);
  const resumoEncerramentoSemPedido = useMemo(() => {
    const itens = (comparativo?.itens || [])
      .map((item) => ({
        item_tipo: item.item_tipo,
        item_referencia_id: item.item_referencia_id,
        nome: item.nome || item.descricao || `Item ${item.item_referencia_id || ''}`,
        unidade: item.unidade || '',
        quantidadeFechada: parseNumeroCompra(item.quantidade_fechada),
        saldo: parseNumeroCompra(item.saldo_disponivel ?? item.quantidade)
      }))
      .filter((item) => item.saldo > 0.0001);
    const pedidosPreservados = (solicitacao?.pedidos || []).filter(
      (pedido) => normalizeText(pedido.status) !== 'cancelado'
    ).length;
    const selecoesAtuais = Object.values(vencedoresSelecionados).filter(
      (entry) => Number(entry?.resposta_item_id) > 0 && parseNumeroCompra(entry?.quantidade_alocada) > 0
    ).length;

    return {
      itens,
      saldoTotal: itens.reduce((total, item) => total + item.saldo, 0),
      pedidosPreservados,
      selecoesAtuais
    };
  }, [comparativo, solicitacao, vencedoresSelecionados]);

  async function carregarFornecedores() {
    fornecedorRequestRef.current.controller?.abort();
    const controller = new AbortController();
    const sequencia = fornecedorRequestRef.current.sequencia + 1;
    fornecedorRequestRef.current = { sequencia, controller };
    try {
      setBuscandoFornecedores(true);
      const params = { limit: 80 };
      const parceiroParams = { fornecedor: 1, ativo: 1, incluir_categorias: 1, limit: 80 };
      if (categoriaFornecedorId) {
        const categoria = categoriasFornecedor.find((item) => String(item.id) === String(categoriaFornecedorId));
        if (categoria?.nome) params.categoria = categoria.nome;
        parceiroParams.categoria_id = categoriaFornecedorId;
      }
      if (fornecedorBusca.trim()) {
        params.q = fornecedorBusca.trim();
        parceiroParams.q = fornecedorBusca.trim();
      }
      const [fornecedoresData, parceirosData] = await Promise.all([
        listarFornecedoresCompra(params, { signal: controller.signal }),
        buscarParceiros(parceiroParams, { signal: controller.signal })
      ]);

      if (fornecedorRequestRef.current.sequencia !== sequencia) return;

      const fornecedoresCompra = (Array.isArray(fornecedoresData) ? fornecedoresData : []).map((fornecedor) => ({
        ...fornecedor,
        fornecedor_compra_id: fornecedor.id,
        selection_key: `fornecedor:${fornecedor.id}`,
        origem_cadastro: fornecedor.parceiro_id ? 'FORNECEDOR_COMPRA_PARCEIRO' : 'FORNECEDOR_COMPRA'
      }));
      const parceiroIdsJaSincronizados = new Set(
        fornecedoresCompra
          .map((fornecedor) => Number(fornecedor.parceiro_id || 0))
          .filter((parceiroId) => parceiroId > 0)
      );
      const parceirosFornecedores = (Array.isArray(parceirosData) ? parceirosData : [])
        .filter((parceiro) => !parceiroIdsJaSincronizados.has(Number(parceiro.id)))
        .map((parceiro) => ({
          id: `parceiro:${parceiro.id}`,
          parceiro_id: parceiro.id,
          selection_key: `parceiro:${parceiro.id}`,
          origem_cadastro: 'PARCEIRO',
          nome: parceiro.nome,
          cnpj: parceiro.cpf_cnpj,
          documento: parceiro.cpf_cnpj,
          email: parceiro.email || '',
          whatsapp: parceiro.telefone || '',
          telefone: parceiro.telefone || '',
          contato: '',
          categoria_insumos: Array.isArray(parceiro.categorias)
            ? parceiro.categorias.map((categoria) => categoria.nome).filter(Boolean)
            : []
        }));

      setFornecedores(
        [...fornecedoresCompra, ...parceirosFornecedores]
          .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
      );
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error(error);
      alert(error.message || 'Erro ao buscar fornecedores');
    } finally {
      if (fornecedorRequestRef.current.sequencia === sequencia) {
        setBuscandoFornecedores(false);
      }
    }
  }

  async function carregarTudo() {
    try {
      setLoading(true);
      setErroCarregamento('');
      const [workspace, dataCategorias] = await Promise.all([
        obterWorkspaceCotacaoSolicitacaoCompra(id),
        listarCategoriasParceiro()
      ]);
      const dataSolicitacao = workspace?.solicitacao || null;

      setSolicitacao(dataSolicitacao);
      setCategoriasFornecedor(Array.isArray(dataCategorias) ? dataCategorias : []);
      await carregarFornecedores();
      setComparativo(workspace?.comparativo || null);
      setVencedoresSelecionados({});
    } catch (error) {
      console.error(error);
      const mensagem = error.message || 'Erro ao carregar solicitacao de compra';
      setSolicitacao(null);
      setErroCarregamento(
        /nao encontrada|não encontrada/i.test(mensagem)
          ? 'Solicitacao de compra cancelada ou indisponivel para cotacao.'
          : mensagem
      );
      alert(mensagem);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregarTudo(); }, [id]);
  useEffect(() => {
    if (loading) return undefined;
    const timer = window.setTimeout(() => {
      carregarFornecedores();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [fornecedorBusca, categoriaFornecedorId]);
  useEffect(() => () => fornecedorRequestRef.current.controller?.abort(), []);

  const itensCombinados = useMemo(() => {
    const itens = (solicitacao?.itens || []).map((item) => ({
      item_tipo: 'CADASTRADO',
      item_referencia_id: item.id,
      nome: item.insumo?.nome || '-',
      unidade: item.unidade?.sigla || '-',
      quantidade: item.quantidade,
      especificacao: item.especificacao || '-',
      apropriacao_linhas: montarLinhasResumoApropriacao(item),
      necessario_para: item.necessario_para,
      link_produto: item.link_produto || '',
      arquivo_url: item.arquivo_url || '',
      arquivo_nome_original: item.arquivo_nome_original || ''
    }));
    const manuais = (solicitacao?.itensManuais || []).map((item) => ({
      item_tipo: 'MANUAL',
      item_referencia_id: item.id,
      nome: item.nome_manual || '-',
      unidade: item.unidade_sigla_manual || '-',
      quantidade: item.quantidade,
      especificacao: item.especificacao || '-',
      apropriacao_linhas: montarLinhasResumoApropriacao(item),
      necessario_para: item.necessario_para,
      link_produto: item.link_produto || '',
      arquivo_url: item.arquivo_url || '',
      arquivo_nome_original: item.arquivo_nome_original || ''
    }));
    return [...itens, ...manuais];
  }, [solicitacao]);

  const criarMapaTodosItensEnvio = () => itensCombinados.reduce((acc, item) => {
    acc[buildItemKey(item)] = true;
    return acc;
  }, {});

  const selecionarTodosItensEnvio = () => {
    const todos = criarMapaTodosItensEnvio();
    setItensSelecionadosEnvio(
      fornecedoresSelecionados.reduce((acc, selectionKey) => {
        acc[selectionKey] = { ...todos };
        return acc;
      }, {})
    );
  };

  const limparItensEnvio = () => {
    setItensSelecionadosEnvio(
      fornecedoresSelecionados.reduce((acc, selectionKey) => {
        acc[selectionKey] = {};
        return acc;
      }, {})
    );
  };

  const garantirItensEnvioSelecionados = (selectionKeyEspecifico = null) => {
    setItensSelecionadosEnvio((atual) => {
      const todos = criarMapaTodosItensEnvio();

      if (selectionKeyEspecifico) {
        const selecaoAtual = atual?.[selectionKeyEspecifico] || {};
        if (Object.values(selecaoAtual).some(Boolean)) {
          return atual;
        }
        return { ...atual, [selectionKeyEspecifico]: { ...todos } };
      }

      const existeSelecao = Object.values(atual || {}).some((selecaoFornecedor) => (
        selecaoFornecedor && typeof selecaoFornecedor === 'object' && Object.values(selecaoFornecedor).some(Boolean)
      ));
      if (existeSelecao) {
        return atual;
      }
      return fornecedoresSelecionados.reduce((acc, selectionKey) => {
        acc[selectionKey] = { ...todos };
        return acc;
      }, {});
    });
  };

  const pedidosPorFornecedor = useMemo(() => {
    const mapa = new Map();
    (solicitacao?.pedidos || []).forEach((pedido) => {
      mapa.set(Number(pedido.fornecedor_compra_id), pedido);
    });
    return mapa;
  }, [solicitacao]);

  async function handleAbrirPdf() {
    try {
      setBaixando(true);
      const blob = await baixarPdfSolicitacaoCompra(id);
      const url = window.URL.createObjectURL(blob);
      setPreviewArquivo(await criarPreviewCompra({
        title: `PDF da solicitacao SC-${String(solicitacao?.id || id).padStart(5, '0')}`,
        name: `SC-${String(solicitacao?.id || id).padStart(5, '0')}.pdf`,
        url
      }));
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao abrir PDF');
    } finally {
      setBaixando(false);
    }
  }

  async function handleAbrirArquivo(item) {
    try {
      const url = await obterUrlAssinadaCompra(item?.arquivo_url);
      if (!url) { alert('Arquivo nao encontrado.'); return; }
      setPreviewArquivo(await criarPreviewCompra({
        title: 'Arquivo do item',
        name: item.arquivo_nome_original || 'Arquivo anexado',
        url
      }));
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao abrir arquivo do item');
    }
  }

  async function handleEnviarFornecedores() {
    try {
      const payload = [];
      const fornecedoresParaEnvio = fornecedoresSelecionados
        .map((selectionKey) => (
          fornecedoresSelecionadosDados[selectionKey] ||
          fornecedores.find((item) => fornecedorSelectionKey(item) === selectionKey)
        ))
        .filter(Boolean);

      fornecedoresParaEnvio.forEach((fornecedor) => {
        const selectionKey = fornecedorSelectionKey(fornecedor);
        if (fornecedor) {
          const itensFornecedor = itensCombinados
            .filter((item) => itensSelecionadosEnvio?.[selectionKey]?.[buildItemKey(item)])
            .map(itemToCotacaoPayload);
          const itensEnvio = itensFornecedor.length || itensCombinados.length !== 1
            ? itensFornecedor
            : itensCombinados.map(itemToCotacaoPayload);
          payload.push({
            ...fornecedorToCotacaoPayload(fornecedor),
            itens: itensEnvio
          });
        }
      });
      if (String(novoFornecedor.nome || '').trim()) {
        payload.push({
          nome: novoFornecedor.nome,
          cnpj: novoFornecedor.cnpj,
          email: novoFornecedor.email,
          whatsapp: novoFornecedor.whatsapp,
          contato: novoFornecedor.contato,
          itens: itensCombinados.map(itemToCotacaoPayload)
        });
      }
      if (!payload.length) { alert('Selecione ou cadastre ao menos um fornecedor.'); return; }

      const fornecedorSemItens = payload.find((fornecedor) => !Array.isArray(fornecedor.itens) || fornecedor.itens.length === 0);
      if (fornecedorSemItens) {
        const fornecedorSelecionado = fornecedores.find((item) => {
          const fornecedorPayload = fornecedorToCotacaoPayload(item);
          return (
            (fornecedorSemItens.fornecedor_id && Number(fornecedorPayload.fornecedor_id) === Number(fornecedorSemItens.fornecedor_id)) ||
            (fornecedorSemItens.parceiro_id && Number(fornecedorPayload.parceiro_id) === Number(fornecedorSemItens.parceiro_id))
          );
        });
        alert(`Selecione ao menos um item para ${fornecedorSelecionado?.nome || fornecedorSemItens.nome || 'cada fornecedor'}.`);
        return;
      }

      setEnviandoFornecedores(true);
      await enviarSolicitacaoCompraParaFornecedores(id, { fornecedores: payload });
      setFornecedoresSelecionados([]);
      setFornecedoresSelecionadosDados({});
      setItensSelecionadosEnvio({});
      setNovoFornecedor({ nome: '', cnpj: '', email: '', whatsapp: '', contato: '' });
      await carregarTudo();
      alert('Links de cotacao gerados. Use os botoes de WhatsApp para enviar a mensagem a cada fornecedor.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao enviar para fornecedores');
    } finally {
      setEnviandoFornecedores(false);
    }
  }

  async function handleReabrirCotacao(cotacaoFornecedor) {
    const fornecedorNome = cotacaoFornecedor?.fornecedor?.nome || 'fornecedor';
    const motivo = window.prompt(`Informe o motivo para reabrir a cotacao de ${fornecedorNome}:`);
    if (motivo === null) return;

    try {
      setReabrindoCotacaoId(cotacaoFornecedor.id);
      await reabrirCotacaoCompra(cotacaoFornecedor.id, { motivo });
      await carregarTudo();
      alert('Cotacao reaberta. O fornecedor pode responder novamente pelo mesmo link.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao reabrir cotacao');
    } finally {
      setReabrindoCotacaoId(null);
    }
  }

  async function handleCancelarCotacao() {
    const motivo = motivoCancelamentoCotacao.trim();
    if (!motivo) {
      alert('Informe o motivo do cancelamento da cotacao.');
      return;
    }

    try {
      setCancelandoCotacao(true);
      await cancelarCotacaoSolicitacaoCompra(id, { motivo });
      setModalCancelamentoCotacao(false);
      setMotivoCancelamentoCotacao('');
      await carregarTudo();
      alert('Cotacao cancelada. Os links foram bloqueados e a solicitacao voltou para liberada para compra.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao cancelar cotacao');
    } finally {
      setCancelandoCotacao(false);
    }
  }

  function abrirRespostaInterna(cotacaoFornecedor) {
    setCotacaoRespostaInterna(cotacaoFornecedor);
    setFormRespostaInterna(montarFormularioRespostaInterna(cotacaoFornecedor, itensCombinados));
  }

  function abrirRespostaInternaPorId(cotacaoFornecedorId) {
    const cotacaoFornecedor = (solicitacao?.fornecedores || []).find(
      (item) => Number(item.id) === Number(cotacaoFornecedorId)
    );
    if (!cotacaoFornecedor) {
      alert('Cotacao do fornecedor nao encontrada para edicao.');
      return;
    }
    abrirRespostaInterna(cotacaoFornecedor);
  }

  function alterarRespostaInterna(field, value) {
    setFormRespostaInterna((atual) => ({ ...atual, [field]: value }));
  }

  function alterarItemRespostaInterna(index, field, value) {
    setFormRespostaInterna((atual) => ({
      ...atual,
      itens: atual.itens.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item)
    }));
  }

  async function handleUploadArquivosRespostaInterna(files) {
    const selecionados = Array.from(files || []);
    if (!selecionados.length || !cotacaoRespostaInterna) return;
    if (selecionados.length > 10) {
      alert('Selecione no maximo 10 arquivos por vez.');
      return;
    }

    try {
      setEnviandoArquivosRespostaInterna(true);
      const resposta = await uploadArquivosRespostaInternaCotacao(id, cotacaoRespostaInterna.id, selecionados);
      setCotacaoRespostaInterna((atual) => ({ ...atual, ...(resposta?.cotacao || {}) }));
      await carregarTudo();
      alert(`${selecionados.length} arquivo(s) anexado(s) e registrado(s) na auditoria.`);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao anexar arquivos na resposta da cotacao');
    } finally {
      setEnviandoArquivosRespostaInterna(false);
    }
  }

  async function handleAbrirArquivoRespostaInterna(arquivo, index) {
    try {
      const caminho = String(arquivo?.url || '');
      const url = /[?&]X-Amz-/i.test(caminho)
        ? caminho
        : await obterUrlAssinadaCompra(caminho);
      if (!url) {
        alert('Arquivo nao encontrado.');
        return;
      }
      setPreviewArquivo(await criarPreviewCompra({
        title: 'Arquivo da resposta da cotacao',
        name: arquivo?.nome_original || `Arquivo ${index + 1}`,
        url
      }));
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao abrir arquivo da resposta');
    }
  }

  async function handleSalvarRespostaInterna(finalizar) {
    if (!formRespostaInterna || !cotacaoRespostaInterna) return;
    if (finalizar && (
      !formRespostaInterna.condicao_pagamento.trim()
      || !Number.isInteger(Number(formRespostaInterna.prazo_entrega_dias))
      || Number(formRespostaInterna.prazo_entrega_dias) <= 0
    )) {
      alert('Informe a condicao de pagamento e o prazo de entrega para finalizar a resposta.');
      return;
    }
    const valorFreteInformado = formRespostaInterna.frete_modo === 'POR_ITEM'
      ? formRespostaInterna.itens.reduce((total, item) => total + parseNumeroCompra(item.frete_valor), 0)
      : parseNumeroCompra(formRespostaInterna.frete_valor);
    if (finalizar && formRespostaInterna.frete_tipo !== 'SEM_FRETE' && valorFreteInformado <= 0) {
      alert(formRespostaInterna.frete_modo === 'POR_ITEM'
        ? 'Informe o frete de ao menos um item.'
        : 'Informe o valor do frete.');
      return;
    }
    if (finalizar && formRespostaInterna.frete_tipo === 'TERCEIRO' && !formRespostaInterna.frete_data_vencimento) {
      alert('Informe a data para pagamento do frete pago a terceiro.');
      return;
    }

    const itemQuantidadeInvalida = formRespostaInterna.itens.find((item) => {
      const quantidade = parseNumeroCompraDigitado(item.quantidade_solicitada);
      return !Number.isFinite(quantidade) || quantidade <= 0;
    });
    if (itemQuantidadeInvalida) {
      alert('Quantidade solicitada do item deve ser maior que zero.');
      return;
    }

    try {
      setSalvandoRespostaInterna(true);
      const itensComQuantidadeAlterada = formRespostaInterna.itens.filter((item) => {
        const original = parseNumeroCompraDigitado(item.quantidade_original);
        const atual = parseNumeroCompraDigitado(item.quantidade_solicitada);
        return Number.isFinite(atual) && atual > 0 && Math.abs(atual - original) > 0.000001;
      });

      for (const item of itensComQuantidadeAlterada) {
        await atualizarQuantidadeItemSolicitacaoCompra(id, item.item_referencia_id, {
          item_tipo: item.item_tipo,
          quantidade: item.quantidade_solicitada,
          motivo: `Quantidade alterada durante edicao interna da resposta da cotacao do fornecedor ${cotacaoRespostaInterna?.fornecedor?.nome || cotacaoRespostaInterna?.fornecedor_nome || cotacaoRespostaInterna.id}`
        });
      }

      await salvarRespostaInternaCotacao(id, cotacaoRespostaInterna.id, {
        valor_minimo_pedido: formRespostaInterna.valor_minimo_pedido || null,
        desconto_total: formRespostaInterna.desconto_total || 0,
        condicao_pagamento: formRespostaInterna.condicao_pagamento,
        prazo_entrega_dias: Number(formRespostaInterna.prazo_entrega_dias) || null,
        prazo_entrega_tipo: formRespostaInterna.prazo_entrega_tipo,
        difal_valor: normalizarMoedaCotacaoParaEnvio(formRespostaInterna.difal_valor) || 0,
        frete_tipo: formRespostaInterna.frete_tipo,
        frete_modo: formRespostaInterna.frete_modo,
        frete_valor: formRespostaInterna.frete_tipo === 'SEM_FRETE' || formRespostaInterna.frete_modo === 'POR_ITEM'
          ? 0
          : normalizarMoedaCotacaoParaEnvio(formRespostaInterna.frete_valor) || 0,
        frete_data_vencimento: formRespostaInterna.frete_tipo === 'TERCEIRO'
          ? formRespostaInterna.frete_data_vencimento
          : null,
        frete_transportador_nome: formRespostaInterna.frete_transportador_nome,
        frete_transportador_cpf_cnpj: formRespostaInterna.frete_transportador_cpf_cnpj,
        observacao_resposta: formRespostaInterna.observacao_resposta,
        finalizar,
        itens: formRespostaInterna.itens.map((item) => ({
          item_tipo: item.item_tipo,
          item_referencia_id: item.item_referencia_id,
          status_disponibilidade: parseNumeroCompraDigitado(item.quantidade_disponivel) > 0 && parseNumeroCompra(item.preco) > 0
            ? 'DISPONIVEL'
            : 'NAO_TEM',
          preco: normalizarMoedaCotacaoParaEnvio(item.preco),
          prazo: null,
          quantidade_minima_item: item.quantidade_minima_item || null,
          quantidade_disponivel: parseNumeroCompraDigitado(item.quantidade_disponivel),
          ipi_valor: normalizarMoedaCotacaoParaEnvio(item.ipi_valor) || 0,
          icms_valor: normalizarMoedaCotacaoParaEnvio(item.icms_valor) || 0,
          st_valor: normalizarMoedaCotacaoParaEnvio(item.st_valor) || 0,
          frete_valor: formRespostaInterna.frete_tipo !== 'SEM_FRETE' && formRespostaInterna.frete_modo === 'POR_ITEM'
            ? normalizarMoedaCotacaoParaEnvio(item.frete_valor) || 0
            : 0,
          observacao: item.observacao || null
        }))
      });
      setCotacaoRespostaInterna(null);
      setFormRespostaInterna(null);
      await carregarTudo();
      alert(finalizar ? 'Resposta atualizada e registrada na auditoria.' : 'Rascunho salvo e registrado na auditoria.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao editar resposta da cotacao');
    } finally {
      setSalvandoRespostaInterna(false);
    }
  }

  async function handleCriarFornecedorRapido() {
    try {
      if (!String(novoFornecedor.nome || '').trim()) { alert('Informe o nome do fornecedor.'); return; }
      if (!String(novoFornecedor.cnpj || '').trim()) { alert('Informe o CPF/CNPJ do fornecedor.'); return; }
      if (!String(novoFornecedor.whatsapp || '').trim()) { alert('Informe o WhatsApp/telefone do fornecedor.'); return; }
      const fornecedor = await criarFornecedorCompra(novoFornecedor);
      const fornecedorFormatado = {
        ...fornecedor,
        fornecedor_compra_id: fornecedor.id,
        selection_key: `fornecedor:${fornecedor.id}`,
        origem_cadastro: fornecedor.parceiro_id ? 'FORNECEDOR_COMPRA_PARCEIRO' : 'FORNECEDOR_COMPRA'
      };
      setFornecedores((atual) => [...atual, fornecedorFormatado].sort((a, b) => String(a.nome).localeCompare(String(b.nome))));
      setFornecedoresSelecionados((atual) => [...atual, fornecedorSelectionKey(fornecedorFormatado)]);
      setFornecedoresSelecionadosDados((atual) => ({
        ...atual,
        [fornecedorSelectionKey(fornecedorFormatado)]: fornecedorFormatado
      }));
      garantirItensEnvioSelecionados(fornecedorSelectionKey(fornecedorFormatado));
      setNovoFornecedor({ nome: '', cnpj: '', email: '', whatsapp: '', contato: '' });
      alert('Fornecedor criado e selecionado.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao criar fornecedor');
    }
  }

  function handleVencedorChange({ resposta, quantidade }) {
    if (!resposta?.resposta_item_id) return;

    const respostaId = String(resposta.resposta_item_id);
    const quantidadeInput = typeof quantidade === 'string'
      ? sanitizeNumeroCompraInput(quantidade)
      : formatNumeroCompra(quantidade);
    const quantidadeNumero = typeof quantidade === 'string'
      ? parseNumeroCompraDigitado(quantidadeInput)
      : parseNumeroCompra(quantidade);

    setVencedoresSelecionados((prev) => {
      const next = { ...prev };
      if (!quantidadeNumero || quantidadeNumero <= 0) {
        delete next[respostaId];
        return next;
      }

      next[respostaId] = {
        resposta_item_id: Number(resposta.resposta_item_id),
        quantidade_alocada: quantidadeNumero,
        quantidade_alocada_input: quantidadeInput
      };
      return next;
    });
  }

  function handleAplicarRemanejamentoCotacao({ itens = [] }) {
    if (!Array.isArray(itens) || !itens.length) return;

    setVencedoresSelecionados((prev) => {
      const next = { ...prev };

      itens.forEach((item) => {
        const quantidade = parseNumeroCompra(item.quantidade);
        const origemId = Number(item.respostaOrigemId || 0);
        const destinoId = Number(item.respostaDestinoId || 0);
        if (!origemId || !destinoId || quantidade <= 0) return;

        const origemKey = String(origemId);
        const destinoKey = String(destinoId);
        const origemAtual = parseNumeroCompra(next[origemKey]?.quantidade_alocada);
        const origemNova = Number(Math.max(0, origemAtual - quantidade).toFixed(3));

        if (origemNova > 0) {
          next[origemKey] = {
            resposta_item_id: origemId,
            quantidade_alocada: origemNova
          };
        } else {
          delete next[origemKey];
        }

        const destinoAtual = parseNumeroCompra(next[destinoKey]?.quantidade_alocada);
        next[destinoKey] = {
          resposta_item_id: destinoId,
          quantidade_alocada: Number((destinoAtual + quantidade).toFixed(3))
        };
      });

      return next;
    });
  }

  function abrirEncerramentoSemPedido() {
    if (resumoEncerramentoSemPedido.saldoTotal <= 0.0001) {
      alert('Nao existe saldo restante para encerrar sem pedido.');
      return;
    }
    setJustificativaEncerrarSemPedido('');
    setConfirmadoEncerrarSemPedido(false);
    encerramentoSemPedidoIdempotencyRef.current = null;
    setModalEncerrarSemPedido(true);
  }

  function fecharModalEncerramentoSemPedido() {
    if (encerrandoSemPedido) return;
    setModalEncerrarSemPedido(false);
    setJustificativaEncerrarSemPedido('');
    setConfirmadoEncerrarSemPedido(false);
    encerramentoSemPedidoIdempotencyRef.current = null;
  }

  async function confirmarEncerramentoSemPedido() {
    const justificativa = justificativaEncerrarSemPedido.trim();
    if (justificativa.length < 10) {
      alert('Informe uma justificativa com pelo menos 10 caracteres.');
      return;
    }
    if (!confirmadoEncerrarSemPedido) {
      alert('Confirme que o saldo restante nao sera comprado.');
      return;
    }

    try {
      setEncerrandoSemPedido(true);
      if (!encerramentoSemPedidoIdempotencyRef.current) {
        encerramentoSemPedidoIdempotencyRef.current = criarChaveIdempotenciaFechamento(`${id}-sem-pedido`);
      }
      const resultado = await encerrarSolicitacaoCompraSemPedido(
        id,
        { confirmado: true, justificativa },
        { idempotencyKey: encerramentoSemPedidoIdempotencyRef.current }
      );
      encerramentoSemPedidoIdempotencyRef.current = null;
      setModalEncerrarSemPedido(false);
      setJustificativaEncerrarSemPedido('');
      setConfirmadoEncerrarSemPedido(false);
      setVencedoresSelecionados({});
      await carregarTudo();
      const detalhes = resultado?.encerramento_sem_pedido_resultado || {};
      alert(`Cotacao encerrada sem gerar novos pedidos. Saldo nao comprado: ${formatNumeroCompra(detalhes.quantidade_nao_comprada)}.`);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao encerrar cotacao sem gerar pedido');
    } finally {
      setEncerrandoSemPedido(false);
    }
  }

  async function handleEncerrar() {
    try {
      const itens = comparativo?.itens || [];
      const alocacoes = Object.values(vencedoresSelecionados)
        .filter((entry) => Number(entry?.resposta_item_id) > 0 && parseNumeroCompra(entry?.quantidade_alocada) > 0)
        .map((entry) => ({
          resposta_item_id: Number(entry.resposta_item_id),
          quantidade_alocada: parseNumeroCompra(entry.quantidade_alocada)
        }));
      if (!alocacoes.length) { alert('Selecione ao menos um vencedor para encerrar.'); return; }

      const itensExcedentes = [];
      const errosDisponibilidadeFornecedor = [];
      let saldoTotalAntes = 0;
      let saldoTotalDepois = 0;
      let quantidadeExcedenteTotal = 0;
      itens.forEach((item) => {
        const totalItem = (item.respostas || []).reduce((acc, resp) => {
          const selecionado = vencedoresSelecionados[String(resp.resposta_item_id)];
          const quantidadeSelecionada = parseNumeroCompra(selecionado?.quantidade_alocada);
          const saldoFornecedor = resp.saldo_disponivel_fornecedor !== undefined
            ? parseNumeroCompra(resp.saldo_disponivel_fornecedor)
            : Math.max(
                0,
                parseNumeroCompra(resp.quantidade_disponivel) - parseNumeroCompra(resp.quantidade_alocada)
              );
          if (quantidadeSelecionada > saldoFornecedor + 0.0001) {
            errosDisponibilidadeFornecedor.push(
              `- ${item.nome} / ${resp.fornecedor_nome}: marcado ${formatNumeroCompra(quantidadeSelecionada)}, disponivel ${formatNumeroCompra(saldoFornecedor)}.`
            );
          }
          return acc + quantidadeSelecionada;
        }, 0);
        const saldoItem = parseNumeroCompra(item.saldo_disponivel ?? item.quantidade);
        saldoTotalAntes += saldoItem;
        saldoTotalDepois += Math.max(0, saldoItem - totalItem);
        if (totalItem > saldoItem + 0.0001) {
          const excedente = totalItem - saldoItem;
          quantidadeExcedenteTotal += excedente;
          itensExcedentes.push(`- ${item.nome}: saldo antes da rodada ${formatNumeroCompra(saldoItem)}, compra nesta rodada ${formatNumeroCompra(totalItem)}, excedente ${formatNumeroCompra(excedente)} ${item.unidade || ''}.`);
        }
      });

      if (errosDisponibilidadeFornecedor.length) {
        alert([
          'A quantidade marcada ultrapassa a disponibilidade informada pelo fornecedor.',
          '',
          ...errosDisponibilidadeFornecedor
        ].join('\n'));
        return;
      }

      const fechamentoParcial = saldoTotalDepois > 0.0001;
      let justificativaExcedente = '';
      if (itensExcedentes.length) {
        const confirmadoExcedente = window.confirm([
          'A compra possui quantidade acima da solicitada.',
          '',
          ...itensExcedentes,
          '',
          `Excedente total: ${formatNumeroCompra(quantidadeExcedenteTotal)}`,
          'Deseja continuar e registrar a justificativa para auditoria?'
        ].join('\n'));
        if (!confirmadoExcedente) return;

        justificativaExcedente = String(
          window.prompt('Informe a justificativa obrigatoria para comprar acima da quantidade solicitada:') || ''
        ).trim();
        if (!justificativaExcedente) {
          alert('A justificativa e obrigatoria para comprar acima da quantidade solicitada.');
          return;
        }
      }
      if (fechamentoParcial) {
        if (!podeFecharParcialCotacao) {
          alert('Seu usuario nao possui permissao para fechar parcialmente a cotacao.');
          return;
        }
        const confirmado = window.confirm([
          'Nem todo o saldo da cotacao foi selecionado.',
          '',
          `Saldo atual: ${formatNumeroCompra(saldoTotalAntes)}`,
          `Saldo que permanecera aberto: ${formatNumeroCompra(saldoTotalDepois)}`,
          '',
          'Deseja gerar os pedidos selecionados e manter o restante aberto para uma proxima rodada?'
        ].join('\n'));
        if (!confirmado) return;
      } else if (!podeEncerrarCotacao) {
        alert('A selecao consome todo o saldo e exige permissao para encerrar definitivamente a cotacao.');
        return;
      } else if (!window.confirm('Todo o saldo foi selecionado. Confirmar o encerramento definitivo da cotacao e a geracao dos pedidos finais?')) {
        return;
      }

      setEncerrando(true);
      if (!encerramentoIdempotencyRef.current) {
        encerramentoIdempotencyRef.current = criarChaveIdempotenciaFechamento(id);
      }
      const resultado = await encerrarSolicitacaoCompra(
        id,
        {
          alocacoes,
          fechamento_parcial_confirmado: fechamentoParcial,
          justificativa: null,
          fechamento_excedente_confirmado: itensExcedentes.length > 0,
          justificativa_excedente: itensExcedentes.length ? justificativaExcedente : null
        },
        { idempotencyKey: encerramentoIdempotencyRef.current }
      );
      encerramentoIdempotencyRef.current = null;
      await carregarTudo();
      const fechamentoResultado = resultado?.fechamento_resultado || {};
      if (fechamentoResultado.final) {
        alert('Cotacao encerrada e pedidos finais gerados. Abrindo a tela de pedidos.');
        navigate('/pedidos-compra');
      } else {
        alert(`Rodada parcial concluida. Os pedidos selecionados foram fechados e o saldo ${formatNumeroCompra(fechamentoResultado.saldo_restante)} permanece aberto.`);
      }
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao encerrar cotacao');
    } finally {
      setEncerrando(false);
    }
  }

  async function handleRecusarSolicitacao() {
    const motivo = window.prompt('Informe o motivo da recusa da solicitacao de compra:');
    if (motivo === null) return;

    const confirmado = window.confirm('Confirmar recusa desta solicitacao de compra?');
    if (!confirmado) return;

    try {
      await recusarSolicitacaoCompra(id, { motivo });
      await carregarTudo();
      alert('Solicitacao de compra recusada.');
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao recusar solicitacao de compra');
    }
  }

  async function handleRegistrarComentarioCotacao() {
    const comentario = comentarioCotacao.trim();
    if (!comentario) {
      alert('Digite o comentario da cotacao.');
      return;
    }

    try {
      setRegistrandoComentario(true);
      await comentarSolicitacaoCompra(id, { comentario });
      setComentarioCotacao('');
      await carregarTudo();
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao registrar comentario da cotacao');
    } finally {
      setRegistrandoComentario(false);
    }
  }

  if (loading) {
    return <div className="page solicitacoes-page"><div className="app-empty-card sol-surface-card">Carregando...</div></div>;
  }

  if (!solicitacao) {
    return (
      <div className="page solicitacoes-page">
        <div className="app-empty-card sol-surface-card">
          {erroCarregamento || 'Solicitacao de compra nao encontrada.'}
        </div>
      </div>
    );
  }

  const isAvulsa = solicitacao.origem === 'AVULSA';
  const statusSolicitacao = normalizeText(solicitacao.status);
  const fluxoTerminal = ['cancelada', 'cancelado', 'inativa', 'recusado', 'encerrado'].includes(statusSolicitacao);
  const podeEditarRespostas = podeComprar
    && (!fluxoTerminal || statusSolicitacao === 'encerrado');
  const cotacoesAtivas = (solicitacao.fornecedores || []).filter(
    (cotacao) => !['cancelada', 'cancelado'].includes(normalizeText(cotacao.status))
  );
  const temPedidoAtivo = (solicitacao.pedidos || []).some(
    (pedido) => normalizeText(pedido.status) !== 'cancelado'
  );
  const podeOperarFluxo = podeComprar && !fluxoTerminal;
  const podeExibirCancelamentoCotacao = podeCancelarCotacao
    && !fluxoTerminal
    && cotacoesAtivas.length > 0
    && !temPedidoAtivo;

  return (
    <div className="page solicitacoes-page page-compra-nova cotacao-gestao-page">
      {/* Header */}
      <div className="card sol-surface-card app-toolbar-card">
        <div className="app-page-header-row">
          <div>
            <h1 className="page-title">
              {isAvulsa ? (solicitacao.titulo || 'Cotacao Avulsa') : 'Gestao da Cotacao'}
            </h1>
            <p className="page-subtitle">
              SC-{String(solicitacao.id).padStart(5, '0')}
              {isAvulsa ? ' - Cotacao Avulsa' : ' - fornecedores, links, respostas e comparativo'}
              {solicitacao.obra?.nome ? ` - ${solicitacao.obra.nome}` : ''}
            </p>
          </div>
          <div className="app-page-actions">
            <button type="button" className="btn btn-outline" onClick={() => navigate(`/solicitacoes-compra/${id}`)}>
              Voltar ao detalhe
            </button>
            <button type="button" className="btn btn-outline" onClick={() => navigate('/cotacoes')}>
              Lista de cotacoes
            </button>
            {podeExibirCancelamentoCotacao && (
              <button
                type="button"
                className="btn btn-outline text-red-700 hover:border-red-200 hover:bg-red-50"
                onClick={() => setModalCancelamentoCotacao(true)}
              >
                Cancelar cotacao
              </button>
            )}
            {podeOperarFluxo && (
              <button type="button" className="btn btn-outline text-red-700 hover:border-red-200 hover:bg-red-50" onClick={handleRecusarSolicitacao}>
                Recusar
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={handleAbrirPdf} disabled={baixando}>
              {baixando ? 'Abrindo...' : 'Abrir PDF'}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className={clsStatus(solicitacao.status)}>{fmtStatus(solicitacao.status)}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
            {solicitacao.fornecedores?.length || 0} fornecedor(es)
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
            {itensCombinados.length} item(ns)
          </span>
          {solicitacao.necessario_para && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
              Necessario para {fmt(solicitacao.necessario_para)}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        <div className="grid gap-3">
          {podeOperarFluxo && (
            <div className="card sol-surface-card">
              <div className="card-header">
                <h2 className="font-semibold">Comentario da cotacao</h2>
                <p className="mt-1 text-sm text-[var(--c-muted)]">
                  Registre alinhamentos com compras; o texto tambem alimenta o historico da solicitacao da obra.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <textarea
                  className="input min-h-[92px]"
                  value={comentarioCotacao}
                  onChange={(event) => setComentarioCotacao(event.target.value)}
                  placeholder="Ex.: fornecedor pediu prazo adicional, compra dividida por quantidade, ajuste combinado..."
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleRegistrarComentarioCotacao}
                  disabled={registrandoComentario || !comentarioCotacao.trim()}
                >
                  {registrandoComentario ? 'Registrando...' : 'Registrar comentario'}
                </button>
              </div>
            </div>
          )}

          {/* Fornecedores vinculados + envio */}
          <div className="card sol-surface-card">
            <div className="card-header flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Fornecedores e links de cotacao</h2>
                <p className="mt-1 text-sm text-[var(--c-muted)]">Pesquise fornecedores cadastrados, faca cadastro rapido e gere os links do portal.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {solicitacao.fornecedores?.length || 0} vinculado(s)
              </span>
            </div>

            {/* Componente de envio para fornecedores */}
            <SecaoEnvioFornecedores
              solicitacao={solicitacao}
              podeComprar={podeOperarFluxo}
              categoriasFornecedor={categoriasFornecedor}
              fornecedores={fornecedores}
              buscandoFornecedores={buscandoFornecedores}
              fornecedoresSelecionados={fornecedoresSelecionados}
              fornecedoresSelecionadosDados={fornecedoresSelecionadosDados}
              novoFornecedor={novoFornecedor}
              categoriaFornecedorId={categoriaFornecedorId}
              fornecedorBusca={fornecedorBusca}
              enviandoFornecedores={enviandoFornecedores}
              itensSelecionadosEnvio={itensSelecionadosEnvio}
              onChangeFornecedorBusca={setFornecedorBusca}
              onChangeCategoriaFornecedorId={setCategoriaFornecedorId}
              onBuscarFornecedores={carregarFornecedores}
              onToggleFornecedor={(selectionKey, checked, fornecedor) => {
                setFornecedoresSelecionados((prev) => {
                  if (checked) {
                    return prev.includes(selectionKey) ? prev : [...prev, selectionKey];
                  }
                  return prev.filter((item) => item !== selectionKey);
                });
                setFornecedoresSelecionadosDados((prev) => {
                  const next = { ...prev };
                  if (checked && fornecedor) {
                    next[selectionKey] = fornecedor;
                  }
                  if (!checked) {
                    delete next[selectionKey];
                  }
                  return next;
                });
                if (checked) {
                  garantirItensEnvioSelecionados(selectionKey);
                } else {
                  setItensSelecionadosEnvio((prev) => {
                    const next = { ...prev };
                    delete next[selectionKey];
                    return next;
                  });
                }
              }}
              onToggleItemEnvio={(selectionKey, itemKey, checked) => {
                setItensSelecionadosEnvio((prev) => ({
                  ...prev,
                  [selectionKey]: {
                    ...(prev?.[selectionKey] || {}),
                    [itemKey]: checked
                  }
                }));
              }}
              onToggleFornecedorItensEnvio={(selectionKey, checked) => {
                setItensSelecionadosEnvio((prev) => ({
                  ...prev,
                  [selectionKey]: checked ? criarMapaTodosItensEnvio() : {}
                }));
              }}
              onToggleItemParaTodosFornecedores={(itemKey, checked) => {
                setItensSelecionadosEnvio((prev) => (
                  fornecedoresSelecionados.reduce((acc, selectionKey) => {
                    acc[selectionKey] = {
                      ...(prev?.[selectionKey] || {}),
                      [itemKey]: checked
                    };
                    return acc;
                  }, { ...prev })
                ));
              }}
              onSelecionarTodosItensEnvio={selecionarTodosItensEnvio}
              onLimparItensEnvio={limparItensEnvio}
              onChangeNovoFornecedor={(field, value) => setNovoFornecedor((prev) => ({ ...prev, [field]: value }))}
              onCriarFornecedorRapido={handleCriarFornecedorRapido}
              onEnviarFornecedores={handleEnviarFornecedores}
              itensCombinados={itensCombinados}
            />

            {Array.isArray(solicitacao.logs) && solicitacao.logs.some((log) => log.tipo_acao === 'RESPOSTA_INTERNA_COMPRAS') && (
              <div className="mt-4 rounded-2xl border border-[var(--c-border)] bg-slate-50/70 p-4 dark:bg-slate-950/55">
                <div className="mb-3">
                  <h2 className="font-semibold">Auditoria de respostas internas</h2>
                </div>
                <div className="app-list-stack">
                  {solicitacao.logs
                    .filter((log) => log.tipo_acao === 'RESPOSTA_INTERNA_COMPRAS')
                    .map((log) => (
                      <div key={log.id} className="rounded-lg border border-[var(--c-border)] px-3 py-2 text-sm">
                        <div className="font-semibold text-[var(--c-text)]">
                          {log.usuario?.nome || 'Usuario interno'} respondeu pelo fornecedor {log.fornecedor?.nome || '-'}
                        </div>
                        <div className="text-xs text-[var(--c-muted)]">
                          {fmt(log.createdAt)} - {log.descricao}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Lista de fornecedores vinculados */}
            {solicitacao.fornecedores?.length > 0 && (
              <div className="mt-4 min-w-0 max-w-full">
                <h3 className="mb-2 text-sm font-semibold text-[var(--c-text)]">Cotações enviadas</h3>
                <div
                  className="app-table-shell cotacao-scroll-region max-w-full overflow-x-auto overscroll-x-contain pb-2"
                  role="region"
                  aria-label="Cotações enviadas"
                  tabIndex={0}
                >
                  <ResizableTable
                    className="table min-w-[1120px] text-[11px]"
                    columns={FORNECEDOR_LINK_COLUMNS}
                    storageKey="fluxy.compras.cotacao.fornecedoresLinks.columns"
                  >
                    <thead>
                      <tr>
                        <ResizableTh columnKey="nome">Nome</ResizableTh>
                        <ResizableTh columnKey="telefone">Telefone</ResizableTh>
                        <ResizableTh columnKey="email">E-mail</ResizableTh>
                        <ResizableTh columnKey="status">Status</ResizableTh>
                        <ResizableTh columnKey="respondido">Respondido em</ResizableTh>
                        <ResizableTh columnKey="acoes">Acoes</ResizableTh>
                      </tr>
                    </thead>
                    <tbody>
                      {solicitacao.fornecedores.map((cotacaoFornecedor) => {
                        const publicUrl = `${window.location.origin}/cotacao/${cotacaoFornecedor.token}`;
                        const pdfUrl = obterUrlPdfCotacaoPublica(cotacaoFornecedor.token);
                        const pedidoFornecedor = pedidosPorFornecedor.get(Number(cotacaoFornecedor.fornecedor_compra_id));
                        const possuiRespostaArquivo = Boolean(
                          cotacaoFornecedor.pdf_resposta_url
                          || cotacaoFornecedor.arquivo_resposta_url
                          || cotacaoFornecedor.arquivos_resposta?.length
                        );
                        const statusFornecedor = String(cotacaoFornecedor.status || '').toUpperCase();
                        const cotacaoCancelada = ['CANCELADA', 'CANCELADO'].includes(statusFornecedor);
                        const podeEditarResposta = podeEditarRespostas && !cotacaoCancelada;
                        const podeReabrirCotacao = podeReabrirCotacaoFornecedor && ['RESPONDIDO', 'RASCUNHO'].includes(statusFornecedor)
                          && !fluxoTerminal;
                        const linkWa = cotacaoFornecedor.fornecedor?.whatsapp
                          ? whatsappLink(
                              cotacaoFornecedor.fornecedor.whatsapp,
                              gerarMensagemCotacao(cotacaoFornecedor.fornecedor.nome, publicUrl, itensCombinados, pdfUrl)
                            )
                          : null;

                        return (
                          <tr key={cotacaoFornecedor.id} className="h-11">
                          <td className="whitespace-nowrap align-middle">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate font-semibold text-[var(--c-text)]">
                                {cotacaoFornecedor.fornecedor?.nome || '-'}
                              </span>
                              {possuiRespostaArquivo && (
                                <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                  Arquivo
                                </span>
                              )}
                            </div>
                            {pedidoFornecedor?.id && (
                              <button
                                type="button"
                                className="block max-w-full truncate text-left text-[10px] font-semibold text-emerald-700 underline"
                                onClick={() => navigate(`/pedidos-compra/${pedidoFornecedor.id}`)}
                                title={`PC-${String(pedidoFornecedor.id).padStart(5, '0')} - ${fmtMoeda(pedidoFornecedor.valor_total)}`}
                              >
                                PC-{String(pedidoFornecedor.id).padStart(5, '0')} - {fmtMoeda(pedidoFornecedor.valor_total)}
                              </button>
                            )}
                          </td>
                          <td className="whitespace-nowrap align-middle text-[11px]">
                            <span className="block truncate" title={cotacaoFornecedor.fornecedor?.whatsapp || '-'}>
                              {cotacaoFornecedor.fornecedor?.whatsapp || '-'}
                            </span>
                          </td>
                          <td className="whitespace-nowrap align-middle text-[11px]">
                            <span className="block truncate" title={cotacaoFornecedor.fornecedor?.email || '-'}>
                              {cotacaoFornecedor.fornecedor?.email || '-'}
                            </span>
                          </td>
                          <td className="whitespace-nowrap align-middle">
                            <span className={`${clsStatus(cotacaoFornecedor.status)} px-2 py-1 text-[10px]`}>
                              {fmtStatus(cotacaoFornecedor.status)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap align-middle text-[11px]">{fmt(cotacaoFornecedor.respondido_em)}</td>
                          <td className="whitespace-nowrap align-middle">
                            <div className="flex flex-nowrap items-center gap-1">
                              <CotacaoActionButton
                                type="button"
                                onClick={() => copiarTexto(publicUrl)}
                                title="Copiar link"
                                aria-label="Copiar link"
                              >
                                <HiOutlineClipboardDocument className="h-3.5 w-3.5" />
                              </CotacaoActionButton>
                              <CotacaoActionButton
                                type="button"
                                onClick={() => window.open(publicUrl, '_blank', 'noopener,noreferrer')}
                                title="Abrir portal"
                                aria-label="Abrir portal"
                              >
                                <HiOutlineArrowTopRightOnSquare className="h-3.5 w-3.5" />
                              </CotacaoActionButton>
                              <CotacaoActionButton
                                as="a"
                                href={pdfUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                download
                                title="Baixar PDF"
                                aria-label="Baixar PDF"
                              >
                                <HiOutlineArrowDownTray className="h-3.5 w-3.5" />
                              </CotacaoActionButton>
                              {linkWa ? (
                                <CotacaoActionButton
                                  as="a"
                                  href={linkWa}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Enviar WhatsApp"
                                  aria-label="Enviar WhatsApp"
                                >
                                  <HiOutlineChatBubbleLeftRight className="h-3.5 w-3.5" />
                                </CotacaoActionButton>
                              ) : (
                                <CotacaoActionButton type="button" disabled title="WhatsApp indisponivel" aria-label="WhatsApp indisponivel">
                                  <HiOutlineChatBubbleLeftRight className="h-3.5 w-3.5" />
                                </CotacaoActionButton>
                              )}
                              <CotacaoActionButton
                                type="button"
                                onClick={() => abrirRespostaInterna(cotacaoFornecedor)}
                                disabled={!podeEditarResposta}
                                title={podeEditarResposta ? 'Editar resposta internamente' : 'Edicao indisponivel'}
                                aria-label="Editar resposta internamente"
                              >
                                <HiOutlinePencilSquare className="h-3.5 w-3.5" />
                              </CotacaoActionButton>
                              <CotacaoActionButton
                                type="button"
                                onClick={() => handleReabrirCotacao(cotacaoFornecedor)}
                                disabled={!podeReabrirCotacao || reabrindoCotacaoId === cotacaoFornecedor.id}
                                title={podeReabrirCotacao ? 'Reabrir cotacao' : 'Reabertura indisponivel'}
                                aria-label="Reabrir cotacao"
                              >
                                <HiOutlineArrowPath className={`h-3.5 w-3.5 ${reabrindoCotacaoId === cotacaoFornecedor.id ? 'animate-spin' : ''}`} />
                              </CotacaoActionButton>
                            </div>
                          </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </ResizableTable>
                </div>
              </div>
            )}
          </div>

          {/* Comparativo */}
          <SecaoComparativo
            comparativo={comparativo}
            solicitacao={solicitacao}
            podeComprar={podeOperarFluxo}
            podeEncerrar={(podeFecharParcialCotacao || podeEncerrarCotacao) && !fluxoTerminal}
            podeEncerrarSemPedido={podeEncerrarSemPedidoCotacao && !fluxoTerminal && cotacoesAtivas.length > 0 && resumoEncerramentoSemPedido.saldoTotal > 0.0001}
            podeEditarResposta={podeEditarRespostas}
            vencedoresSelecionados={vencedoresSelecionados}
            onVencedorChange={handleVencedorChange}
            onEditarRespostaFornecedor={abrirRespostaInternaPorId}
            onRemanejamentoAplicado={handleAplicarRemanejamentoCotacao}
            onEncerrar={handleEncerrar}
            onEncerrarSemPedido={abrirEncerramentoSemPedido}
            encerrando={encerrando}
            encerrandoSemPedido={encerrandoSemPedido}
          />
        </div>
      </div>

      <CompraPreviewModal preview={previewArquivo} onClose={() => setPreviewArquivo(null)} />
      <ModalEncerrarSemPedido
        aberto={modalEncerrarSemPedido}
        resumo={resumoEncerramentoSemPedido}
        justificativa={justificativaEncerrarSemPedido}
        confirmado={confirmadoEncerrarSemPedido}
        processando={encerrandoSemPedido}
        onJustificativaChange={setJustificativaEncerrarSemPedido}
        onConfirmadoChange={setConfirmadoEncerrarSemPedido}
        onConfirmar={confirmarEncerramentoSemPedido}
        onFechar={fecharModalEncerramentoSemPedido}
      />
      <ModalRespostaInternaCotacao
        key={cotacaoRespostaInterna?.id || 'resposta-interna-fechada'}
        cotacao={cotacaoRespostaInterna}
        form={formRespostaInterna}
        salvando={salvandoRespostaInterna}
        enviandoArquivos={enviandoArquivosRespostaInterna}
        solicitacaoEncerrada={statusSolicitacao === 'encerrado'}
        onChange={alterarRespostaInterna}
        onChangeItem={alterarItemRespostaInterna}
        onSalvar={handleSalvarRespostaInterna}
        onUploadArquivos={handleUploadArquivosRespostaInterna}
        onAbrirArquivo={handleAbrirArquivoRespostaInterna}
        onFechar={() => {
          if (salvandoRespostaInterna || enviandoArquivosRespostaInterna) return;
          setCotacaoRespostaInterna(null);
          setFormRespostaInterna(null);
        }}
      />
      {modalCancelamentoCotacao && (
        <ModalPortal onClose={() => setModalCancelamentoCotacao(false)} closeOnEscape={!cancelandoCotacao}>
          <div className="app-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="cancelar-cotacao-titulo">
            <div className="app-modal-surface app-modal-surface--compact p-5">
            <h2 id="cancelar-cotacao-titulo" className="text-lg font-semibold text-[var(--c-text)]">Cancelar cotacao</h2>
            <p className="mt-1 text-sm text-[var(--c-muted)]">
              Os links serao bloqueados, as respostas deixarao de participar do comparativo e a solicitacao voltara para liberada para compra. O historico sera preservado.
            </p>
            <label className="mt-4 block">
              <span className="app-filter-label">Motivo do cancelamento *</span>
              <textarea
                className="input mt-1 min-h-[96px] w-full"
                value={motivoCancelamentoCotacao}
                onChange={(event) => setMotivoCancelamentoCotacao(event.target.value)}
                placeholder="Explique por que a cotacao esta sendo cancelada."
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn btn-outline" onClick={() => setModalCancelamentoCotacao(false)} disabled={cancelandoCotacao}>Voltar</button>
              <button type="button" className="btn btn-primary" onClick={handleCancelarCotacao} disabled={cancelandoCotacao || !motivoCancelamentoCotacao.trim()}>
                {cancelandoCotacao ? 'Cancelando...' : 'Confirmar cancelamento'}
              </button>
            </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
