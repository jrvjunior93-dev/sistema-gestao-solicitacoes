import DateInputBR from '../../../components/DateInputBR';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFecharAoSair } from '../../../hooks/useFecharAoSair';
import {
  HiOutlineArrowTopRightOnSquare,
  HiOutlineArrowDownTray,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClipboardDocument,
  HiOutlinePaperClip,
  HiOutlineArrowPath,
  HiOutlinePlusCircle,
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
import { getCpfCnpjError, maskCpfCnpj, onlyDigits } from '../../../utils/formatters';
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
import {
  Avisos,
  BlocoConteudo,
  CampoForm,
  CelulaDupla,
  FormSecao,
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  TabelaPadrao,
  useAvisos,
  useConfirmacao
} from '../../../components/padrao';

/*
  GESTÃO DA COTAÇÃO — a tela onde a cotação vira PEDIDO DE COMPRA.

  É o maior arquivo do sistema e o ponto em que o dinheiro se move. Três
  coisas desta migração merecem registro, porque não são cosméticas:

  1. R19/R3 — as 60 caixas do navegador saíram. `alert` virou `useAvisos`;
     `confirm`/`prompt` viraram `useConfirmacao`. O caminho mais caro da
     tela (`handleEncerrar`) tinha SEIS diálogos encadeados, dois deles
     pedindo justificativa QUE VAI PARA A AUDITORIA em `window.prompt`, sem
     validação nenhuma — enquanto o caso menos crítico da mesma tela
     (encerrar SEM pedido) já exigia 10 caracteres e marcação de ciência. O
     controle mais fraco estava no caminho mais caro. As duas justificativas
     agora passam pelo mesmo piso (10 caracteres, campo do sistema).

  2. R21 — TODO retorno de `confirmar()` é DESESTRUTURADO
     (`const { ok } = await confirmar(...)`). O objeto é sempre truthy: ler
     `const ok = ...` faria "Cancelar" GERAR OS PEDIDOS DE COMPRA. São 12
     pontos de confirmação neste arquivo, no caminho que movimenta dinheiro.

  3. R26 — o modal do sistema NÃO congela a página (o `window.confirm`
     congelava). Todo alvo é fixado numa `const` ANTES do `await`, e a ação
     usa essa `const` — nunca relê o estado depois da confirmação.
*/

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

// R25: a cor do status vem do token semântico, nunca da paleta crua — o
// tema escuro e o piso de contraste do ThemeContext só alcançam os tokens.
function tomStatus(status) {
  const v = String(status || '').toUpperCase();
  if (['ENCERRADO', 'FINALIZADA'].includes(v)) return 'neutral';
  if (['RECUSADO', 'CANCELADA', 'CANCELADO', 'INATIVA'].includes(v)) return 'danger';
  if (['AGUARDANDO_DIRETORIA', 'FECHAMENTO_PARCIAL', 'RASCUNHO'].includes(v)) return 'warning';
  return 'info';
}

function estiloTom(tom) {
  return {
    background: `var(--sem-${tom}-bg)`,
    borderColor: `var(--sem-${tom}-border)`,
    color: `var(--sem-${tom})`
  };
}

function PilulaStatus({ status, className = '' }) {
  const tom = tomStatus(status);
  return (
    <span className={`app-status-pill ${className}`.trim()} style={estiloTom(tom)}>
      {fmtStatus(status)}
    </span>
  );
}

// Etiqueta neutra de contagem/contexto (o antigo `rounded-full bg-slate-100`).
function Etiqueta({ children, tom = 'neutral', className = '' }) {
  return (
    <span
      className={`app-status-pill ${className}`.trim()}
      style={estiloTom(tom)}
    >
      {children}
    </span>
  );
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

// Piso de justificativa de auditoria — o mesmo número que o caso MENOS
// crítico da tela (encerrar sem pedido) já exigia. Ele passa a valer também
// para os dois pontos mais caros: compra acima do solicitado e fechamento
// parcial.
const MINIMO_JUSTIFICATIVA = 10;

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

/*
  M1/R2 (alvo de clique) + R25 (cor por token): o botão de ícone da linha
  tinha 28px (`h-7 w-7`) e pintava a paleta crua do Tailwind à mão. A classe
  `compras-icon-action` já existe no sistema, mede 32px e tira toda a cor de
  token — a medida e a cor voltam a ser decisão do CSS, não da tela.
*/
function CotacaoActionButton({ as: Component = 'button', children, className = '', ...props }) {
  return (
    <Component
      className={`compras-icon-action ${className}`.trim()}
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

function montarFormularioRespostaInterna(cotacaoFornecedor, itensCombinados, options = {}) {
  const novaOfertaSaldo = options.novaOfertaSaldo === true;
  const itensComparativo = new Map(
    (options.comparativo?.itens || []).map((item) => [buildItemKey(item), item])
  );
  const fornecedorCompraId = Number(cotacaoFornecedor?.fornecedor_compra_id || 0);
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
  const modoOfertaSaldo = novaOfertaSaldo || [...respostas.values()].some(
    (resposta) => String(resposta?.escopo_disponibilidade || '').toUpperCase() === 'OFERTA_SALDO'
  );

  return {
    nova_oferta_saldo: modoOfertaSaldo,
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
      const comparativoItem = itensComparativo.get(buildItemKey(item));
      const saldoSolicitacao = parseNumeroCompra(comparativoItem?.saldo_disponivel ?? item.quantidade);
      const quantidadeJaCompradaFornecedor = (options.alocacoes || []).reduce((total, alocacao) => {
        const referenciaId = Number(
          alocacao?.solicitacao_compra_item_id || alocacao?.solicitacao_compra_item_manual_id || 0
        );
        const mesmoItem = buildItemKey({
          item_tipo: alocacao?.item_tipo,
          item_referencia_id: referenciaId
        }) === buildItemKey(item);
        const ativa = String(alocacao?.status || '').toUpperCase() === 'ATIVA';
        return ativa && mesmoItem && Number(alocacao?.fornecedor_compra_id) === fornecedorCompraId
          ? total + parseNumeroCompra(alocacao?.quantidade_alocada)
          : total;
      }, 0);
      const quantidadeOferta = modoOfertaSaldo
        ? Math.max(0, saldoSolicitacao)
        : resposta?.quantidade_disponivel ?? (resposta?.disponivel ? item.quantidade : '');
      return {
        ...item,
        status_disponibilidade: resposta?.status_disponibilidade
          || (resposta ? (resposta.disponivel ? 'DISPONIVEL' : 'NAO_TEM') : 'DISPONIVEL'),
        preco: formatarMoedaCotacaoInput(decimalApiParaInput(resposta?.preco, 10)),
        quantidade_original: decimalApiParaInput(item.quantidade, 6),
        quantidade_solicitada: decimalApiParaInput(item.quantidade, 6),
        quantidade_minima_item: decimalApiParaInput(resposta?.quantidade_minima_item, 3),
        saldo_solicitacao: saldoSolicitacao,
        quantidade_ja_comprada_fornecedor: quantidadeJaCompradaFornecedor,
        quantidade_disponivel: decimalApiParaInput(
          quantidadeOferta,
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

function obterQuantidadeBaseFinanceiraRespostaInterna(item, novaOfertaSaldo = false) {
  return novaOfertaSaldo
    ? parseNumeroCompraDigitado(item?.quantidade_disponivel)
    : parseNumeroCompraDigitado(item?.quantidade_solicitada);
}

function calcularTotalRespostaInternaItem(item, incluirFrete = false, novaOfertaSaldo = false) {
  return (
    parseNumeroCompra(item?.preco) * obterQuantidadeBaseFinanceiraRespostaInterna(item, novaOfertaSaldo)
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
  onFechar,
  faixaAvisos
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
    (total, item) => total
      + parseNumeroCompra(item.preco)
      * obterQuantidadeBaseFinanceiraRespostaInterna(item, form.nova_oferta_saldo),
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
        <div
          className="flex items-start justify-between gap-3 border-b px-4 py-4"
          style={{ borderColor: 'var(--c-border)' }}
          data-modal="cabecalho"
        >
          <div>
            <h2 id="editar-resposta-cotacao-titulo" className="text-lg font-semibold" style={{ color: 'var(--c-text)' }}>
              {form.nova_oferta_saldo ? 'Nova oferta para o saldo' : 'Editar resposta da cotacao'}
            </h2>
            <p className="text-sm" style={{ color: 'var(--c-muted)' }}>
              {cotacao.fornecedor?.nome || 'Fornecedor'} - {form.nova_oferta_saldo
                ? 'os valores informados valem somente para esta nova oferta.'
                : 'a alteracao sera registrada na auditoria como resposta interna.'}
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

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {faixaAvisos}
          {/*
            Estas duas faixas NÃO são `useAvisos`: são CONDIÇÃO derivada do
            conteúdo (a cotação está encerrada / esta é uma oferta de saldo),
            não evento. Fechá-las não faria o problema sumir — então elas ficam
            no fluxo, ao lado do que descrevem (fronteira do useAvisos).
          */}
          {solicitacaoEncerrada ? (
            <div
              className="mb-3 rounded-lg border px-3 py-2 text-xs"
              style={estiloTom('warning')}
            >
              Esta cotação esta encerrada. Ao salvar, ela será reaberta somente se a edição criar nova disponibilidade para este fornecedor. A quantidade originalmente solicitada permanece inalterada.
            </div>
          ) : null}
          {form.nova_oferta_saldo ? (
            <div
              className="mb-3 rounded-lg border px-3 py-2 text-xs"
              style={estiloTom('info')}
            >
              O pedido anterior e seu preço permanecem inalterados. Informe abaixo a quantidade, o preço e o prazo oferecidos agora para o saldo restante.
            </div>
          ) : null}

          {/*
            R12: estes selects são de ENTRADA DE DADO, não de filtro. Antes
            viviam em `app-filter-field`/`app-filter-label` — a faixa de
            filtros do sistema — e por isso o validador (com razão) os lia
            como filtro. `FormSecao`/`CampoForm` dizem o que eles são.
          */}
          <FormSecao colunas={3}>
            <CampoForm label="Valor mínimo do pedido">
              <input className="input input-moeda" inputMode="decimal" value={form.valor_minimo_pedido} onChange={(e) => onChange('valor_minimo_pedido', sanitizeNumeroCompraInput(e.target.value))} />
            </CampoForm>
            <CampoForm label="Desconto concedido">
              <input className="input input-moeda" inputMode="decimal" value={form.desconto_total} onFocus={(e) => e.target.select()} onChange={(e) => onChange('desconto_total', sanitizeNumeroCompraInput(e.target.value))} />
            </CampoForm>
            <CampoForm label="DIFAL">
              <input className="input input-moeda" inputMode="decimal" value={form.difal_valor} onFocus={(e) => e.target.select()} onChange={(e) => onChange('difal_valor', formatarMoedaCotacaoInput(e.target.value, 2))} />
            </CampoForm>
            <CampoForm label="Prazo de entrega" obrigatorio>
              <input className="input" type="number" min="1" step="1" value={form.prazo_entrega_dias} onChange={(e) => onChange('prazo_entrega_dias', e.target.value.replace(/\D/g, ''))} />
            </CampoForm>
            <CampoForm label="Tipo do prazo" obrigatorio>
              <select className="input" value={form.prazo_entrega_tipo} onChange={(e) => onChange('prazo_entrega_tipo', e.target.value)}>
                <option value="DIAS_CORRIDOS">Dias corridos</option>
                <option value="DIAS_UTEIS">Dias úteis</option>
              </select>
            </CampoForm>
            <CampoForm label="Condicao de pagamento" obrigatorio span={2}>
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
                  className="cotacao-condicoes-options mt-2 rounded-xl border p-2"
                  style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)' }}
                  onMouseDown={(event) => event.preventDefault()}
                >
                  <div className="grid gap-1">
                    {CONDICOES_PAGAMENTO_COTACAO.map((opcao) => (
                      <label key={opcao} className="cotacao-condicao-option flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={condicoesSelecionadas.has(opcao)}
                          onChange={() => alternarCondicao(opcao)}
                        />
                        <span>{opcao}</span>
                      </label>
                    ))}
                  </div>
                  <button type="button" className="btn btn-outline btn-sm mt-2 w-full justify-center" onClick={() => setCondicoesAbertas(false)}>
                    Fechar opções
                  </button>
                </div>
              )}
            </CampoForm>
          </FormSecao>

          <FormSecao legenda="Frete" colunas={3}>
            <CampoForm label="Frete">
              <select className="input" value={form.frete_tipo} onChange={(e) => onChange('frete_tipo', e.target.value)}>
                <option value="SEM_FRETE">Sem frete</option>
                <option value="EMBUTIDO">Embutido no preço</option>
                <option value="TERCEIRO">Pago a terceiro</option>
              </select>
            </CampoForm>
            {form.frete_tipo !== 'SEM_FRETE' ? (
              <CampoForm label="Informar frete">
                <select className="input" value={form.frete_modo} onChange={(e) => onChange('frete_modo', e.target.value)}>
                  <option value="GLOBAL">Valor global da proposta</option>
                  <option value="POR_ITEM">Valor por item</option>
                </select>
              </CampoForm>
            ) : null}
            {form.frete_tipo !== 'SEM_FRETE' && form.frete_modo !== 'POR_ITEM' ? (
              <CampoForm label="Valor do frete" obrigatorio>
                <input className="input input-moeda" inputMode="decimal" value={form.frete_valor} onFocus={(e) => e.target.select()} onChange={(e) => onChange('frete_valor', formatarMoedaCotacaoInput(e.target.value, 2))} />
              </CampoForm>
            ) : null}
            {form.frete_tipo === 'TERCEIRO' ? (
              <>
                <CampoForm label="Data para pagamento" obrigatorio>
                  <DateInputBR className="input" value={form.frete_data_vencimento} onChange={(e) => onChange('frete_data_vencimento', e.target.value)} />
                </CampoForm>
                <CampoForm label="Transportador" hint="Opcional">
                  <input className="input" value={form.frete_transportador_nome} onChange={(e) => onChange('frete_transportador_nome', e.target.value)} />
                </CampoForm>
                <CampoForm label="CPF/CNPJ do transportador" hint="Opcional">
                  <input className="input" inputMode="numeric" maxLength={18} value={maskCpfCnpj(form.frete_transportador_cpf_cnpj)} onChange={(e) => onChange('frete_transportador_cpf_cnpj', maskCpfCnpj(e.target.value))} />
                </CampoForm>
              </>
            ) : null}
          </FormSecao>

          <FormSecao colunas={2}>
            <CampoForm label="Observação geral" tipo="observacao">
              <textarea className="input" rows={3} value={form.observacao_resposta} onChange={(e) => onChange('observacao_resposta', e.target.value)} />
            </CampoForm>
          </FormSecao>

          <div
            className="mt-3 rounded-lg border p-3"
            style={{ borderColor: 'var(--c-border)', background: 'var(--ui-surface-2)' }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Arquivos da resposta</div>
                <div className="text-xs" style={{ color: 'var(--c-muted)' }}>PDF, PNG, JPG ou JPEG. Até 10 arquivos por envio.</div>
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
                    className="flex min-w-0 items-center gap-2 rounded-md border px-2 py-2 text-left text-xs"
                    style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)' }}
                    title={arquivo.nome_original || `Arquivo ${index + 1}`}
                    onClick={() => onAbrirArquivo(arquivo, index)}
                  >
                    <HiOutlinePaperClip className="shrink-0" />
                    <span className="truncate">{arquivo.nome_original || `Arquivo ${index + 1}`}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-xs" style={{ color: 'var(--c-muted)' }}>Nenhum arquivo anexado.</div>
            )}
          </div>

          <div className="mt-4">
            <TabelaPadrao
              /*
                GRADE DE LANÇAMENTO, NÃO LISTA DE CONSULTA (05/09).
                A maioria das colunas aqui é campo de digitação, não dado a ler.
                Oferecer "escolher colunas" numa grade assim dá ao usuário como
                esconder o campo que ele precisa preencher — e ele não descobre por
                que o lançamento parou de funcionar. A capacidade sai DAQUI, não do
                sistema: nas 246 tabelas de consulta ela continua.
              */
              colunasConfiguraveis={false}
              colunas={[
                {
                  id: 'item',
                  titulo: 'Item',
                  // R17: o nome do insumo nomeia a linha da resposta.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (item) => (
                    <div className="min-w-0">
                      <div className="font-semibold" style={{ color: 'var(--c-text)' }}>{item.nome}</div>
                      <div style={{ color: 'var(--c-muted)' }}>{formatNumeroCompra(parseNumeroCompraDigitado(item.quantidade_solicitada))} {item.unidade}</div>
                      {form.nova_oferta_saldo ? (
                        <div className="mt-1 text-xs" style={{ color: 'var(--sem-info)' }}>
                          Ja comprado deste fornecedor: {formatNumeroCompra(item.quantidade_ja_comprada_fornecedor)} · Saldo da solicitacao: {formatNumeroCompra(item.saldo_solicitacao)}
                        </div>
                      ) : null}
                    </div>
                  )
                },
                {
                  id: 'quantidade_solicitada',
                  titulo: 'Qtd. solic.',
                  tipo: 'numero',
                  render: (item) => (
                    <input
                      className="input w-full"
                      inputMode="decimal"
                      value={item.quantidade_solicitada}
                      disabled={solicitacaoEncerrada}
                      aria-label={`Quantidade solicitada de ${item.nome}`}
                      title={solicitacaoEncerrada ? 'A quantidade solicitada nao pode ser alterada durante a reabertura por disponibilidade.' : ''}
                      onChange={(e) => onChangeItem(item.__indice, 'quantidade_solicitada', sanitizeNumeroCompraInput(e.target.value))}
                    />
                  )
                },
                {
                  id: 'preco',
                  titulo: 'Preço unit.',
                  tipo: 'valor',
                  render: (item) => (
                    <input
                      className="input w-full text-right"
                      inputMode="decimal"
                      value={item.preco}
                      aria-label={`Preço unitário de ${item.nome}`}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => onChangeItem(item.__indice, 'preco', formatarMoedaCotacaoInput(e.target.value))}
                    />
                  )
                },
                {
                  id: 'quantidade_disponivel',
                  titulo: form.nova_oferta_saldo ? 'Qtd. desta oferta' : 'Qtd. disponivel',
                  tipo: 'numero',
                  render: (item) => (
                    <input
                      className="input w-full"
                      inputMode="decimal"
                      value={item.quantidade_disponivel}
                      aria-label={`Quantidade disponível de ${item.nome}`}
                      title={form.nova_oferta_saldo
                        ? 'Quantidade oferecida nesta nova rodada para o saldo.'
                        : 'Informação de disponibilidade do fornecedor; não altera o valor cotado para a quantidade solicitada.'}
                      onChange={(e) => onChangeItem(item.__indice, 'quantidade_disponivel', sanitizeNumeroCompraInput(e.target.value))}
                    />
                  )
                },
                {
                  id: 'valor_total',
                  titulo: 'Valor total',
                  tipo: 'valor',
                  render: (item) => (
                    <span className="font-semibold">{fmtMoeda(calcularTotalRespostaInternaItem(
                      item,
                      form.frete_modo === 'POR_ITEM',
                      form.nova_oferta_saldo
                    ))}</span>
                  )
                },
                {
                  id: 'ipi_valor',
                  titulo: 'IPI',
                  tipo: 'valor',
                  render: (item) => (
                    <input
                      className="input w-full text-right"
                      inputMode="decimal"
                      value={item.ipi_valor}
                      aria-label={`IPI de ${item.nome}`}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => onChangeItem(item.__indice, 'ipi_valor', formatarMoedaCotacaoInput(e.target.value, 2))}
                    />
                  )
                },
                {
                  id: 'icms_valor',
                  titulo: 'ICMS',
                  tipo: 'valor',
                  render: (item) => (
                    <input
                      className="input w-full text-right"
                      inputMode="decimal"
                      value={item.icms_valor}
                      aria-label={`ICMS de ${item.nome}`}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => onChangeItem(item.__indice, 'icms_valor', formatarMoedaCotacaoInput(e.target.value, 2))}
                    />
                  )
                },
                {
                  id: 'st_valor',
                  titulo: 'ST',
                  tipo: 'valor',
                  render: (item) => (
                    <input
                      className="input w-full text-right"
                      inputMode="decimal"
                      value={item.st_valor}
                      aria-label={`ST de ${item.nome}`}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => onChangeItem(item.__indice, 'st_valor', formatarMoedaCotacaoInput(e.target.value, 2))}
                    />
                  )
                },
                ...(form.frete_modo === 'POR_ITEM' ? [
                  {
                    id: 'frete_valor',
                    titulo: 'Frete',
                    tipo: 'valor',
                    render: (item) => (
                      <input
                        className="input w-full text-right"
                        inputMode="decimal"
                        value={item.frete_valor}
                        aria-label={`Frete de ${item.nome}`}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => onChangeItem(item.__indice, 'frete_valor', formatarMoedaCotacaoInput(e.target.value, 2))}
                      />
                    )
                  }
                ] : []),
                {
                  id: 'quantidade_minima_item',
                  titulo: 'Qtd. min.',
                  tipo: 'numero',
                  render: (item) => (
                    <input
                      className="input w-full"
                      inputMode="decimal"
                      value={item.quantidade_minima_item}
                      aria-label={`Quantidade mínima de ${item.nome}`}
                      onChange={(e) => onChangeItem(item.__indice, 'quantidade_minima_item', sanitizeNumeroCompraInput(e.target.value))}
                    />
                  )
                },
                {
                  id: 'observacao',
                  titulo: 'Observação',
                  tipo: 'texto',
                  render: (item) => (
                    <input
                      className="input w-full"
                      value={item.observacao}
                      aria-label={`Observação de ${item.nome}`}
                      onChange={(e) => onChangeItem(item.__indice, 'observacao', e.target.value)}
                    />
                  )
                }
              ]}
              // `__indice` carrega a posicao no formulario: `onChangeItem`
              // trabalha por indice e o item da resposta nao tem id proprio.
              itens={form.itens.map((item, index) => ({ ...item, __indice: index }))}
              getId={(item) => buildItemKey(item)}
              storageKey="tabela:gerenciar-cotacao:resposta-interna"
              rotuloRolagem="Itens da resposta do fornecedor"
              vazio="Nenhum item nesta cotação."
            />
          </div>
          {/*
            B3 (papéis diferentes): o preço por linha é REFERÊNCIA enquanto se
            digita; este painel é a DECISÃO — o total que fecha a resposta.
            Apagar um dos dois quebra um dos dois trabalhos.
          */}
          <div className="mt-3">
            <StatGrid colunas={3}>
              <StatTile label="Mercadorias" valor={fmtMoeda(valorMercadorias)} />
              <StatTile label="IPI + ICMS + ST" valor={fmtMoeda(valorTributos)} />
              <StatTile label="DIFAL" valor={fmtMoeda(parseNumeroCompra(form.difal_valor))} />
              <StatTile label="Frete" valor={fmtMoeda(freteAdicional)} />
              <StatTile label="Desconto" valor={`- ${fmtMoeda(parseNumeroCompra(form.desconto_total))}`} />
              <StatTile label="Total estimado" valor={fmtMoeda(valorTotalResposta)} tom="info" />
            </StatGrid>
          </div>
        </div>

        <div
          className="flex flex-wrap justify-end gap-2 border-t px-4 py-4"
          style={{ borderColor: 'var(--c-border)' }}
          data-modal="rodape"
        >
          <button type="button" className="btn btn-outline" onClick={onFechar} disabled={salvando || enviandoArquivos}>Cancelar</button>
          {!solicitacaoEncerrada && !form.nova_oferta_saldo ? (
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
  const justificativaValida = String(justificativa || '').trim().length >= MINIMO_JUSTIFICATIVA;

  return (
    <ModalPortal onClose={onFechar} closeOnEscape={!processando}>
      <div className="app-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="encerrar-sem-pedido-titulo">
        <div className="app-modal-surface app-modal-surface--standard" style={{ borderColor: 'var(--sem-danger-border)' }}>
        <div
          className="flex items-start justify-between gap-4 border-b px-4 py-4"
          style={{ borderColor: 'var(--c-border)' }}
          data-modal="cabecalho"
        >
          <div className="min-w-0">
            <h2 id="encerrar-sem-pedido-titulo" className="text-lg font-semibold" style={{ color: 'var(--c-text)' }}>Encerrar cotação sem gerar pedido?</h2>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--c-muted)' }}>
              O saldo abaixo será encerrado definitivamente. Pedidos já gerados permanecem inalterados e esta ação não pode ser desfeita.
            </p>
          </div>
          <button type="button" className="compras-icon-action shrink-0" onClick={onFechar} disabled={processando} title="Fechar" aria-label="Fechar">
            <HiOutlineXMark />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <StatGrid colunas={3}>
            <StatTile
              label="Saldo acumulado"
              valor={formatNumeroCompra(resumo?.saldoTotal)}
              sub="Detalhado por item e unidade"
            />
            <StatTile label="Itens com saldo" valor={itens.length} />
            <StatTile label="Pedidos preservados" valor={resumo?.pedidosPreservados || 0} />
          </StatGrid>

          {Number(resumo?.selecoesAtuais || 0) > 0 ? (
            <div className="mt-3 rounded-lg border px-3 py-3 text-xs leading-relaxed" style={estiloTom('warning')}>
              Existem {resumo.selecoesAtuais} selecoes de compra marcadas na tela. Elas serao ignoradas e nenhum novo pedido sera gerado.
            </div>
          ) : null}

          {/* R18: `clip` recorta sem criar scrollport — `hidden` sequestraria
              qualquer sticky descendente, em silêncio. */}
          <div className="mt-4 rounded-lg border" style={{ borderColor: 'var(--c-border)', overflow: 'clip' }}>
            <div
              className="border-b px-3 py-2 text-sm font-semibold"
              style={{ borderColor: 'var(--c-border)', background: 'var(--ui-surface-2)', color: 'var(--c-text)' }}
            >
              Itens que não serão comprados
            </div>
            <div className="max-h-48 overflow-y-auto">
              {itens.map((item) => (
                <div
                  key={`${item.item_tipo}-${item.item_referencia_id}`}
                  className="flex items-start justify-between gap-4 border-t px-3 py-2 text-xs"
                  style={{ borderColor: 'var(--c-border)' }}
                >
                  <div className="min-w-0">
                    <strong className="block truncate" style={{ color: 'var(--c-text)' }} title={item.nome}>{item.nome}</strong>
                    <span style={{ color: 'var(--c-muted)' }}>Comprado: {formatNumeroCompra(item.quantidadeFechada)} {item.unidade || ''}</span>
                  </div>
                  <span className="shrink-0 font-semibold" style={{ color: 'var(--sem-danger)' }}>Saldo: {formatNumeroCompra(item.saldo)} {item.unidade || ''}</span>
                </div>
              ))}
            </div>
          </div>

          <FormSecao colunas={2}>
            <CampoForm
              label="Justificativa"
              obrigatorio
              tipo="observacao"
              hint={`Minimo de ${MINIMO_JUSTIFICATIVA} caracteres. ${String(justificativa || '').trim().length}/2000`}
            >
              <textarea
                className="input"
                rows={4}
                maxLength={2000}
                value={justificativa}
                disabled={processando}
                onChange={(event) => onJustificativaChange(event.target.value)}
                placeholder="Explique por que o saldo restante não será comprado."
              />
            </CampoForm>
          </FormSecao>

          <label
            className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-3 text-sm"
            style={estiloTom('danger')}
          >
            <input
              type="checkbox"
              checked={confirmado}
              disabled={processando}
              onChange={(event) => onConfirmadoChange(event.target.checked)}
            />
            <span>Confirmo que o saldo restante não será comprado e que nenhum novo pedido deve ser gerado.</span>
          </label>
        </div>

        <div
          className="app-page-actions justify-end border-t px-4 py-4"
          style={{ borderColor: 'var(--c-border)' }}
          data-modal="rodape"
        >
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

/*
  JUSTIFICATIVA DE AUDITORIA — o conserto do ponto mais caro desta tela.

  O `handleEncerrar` (a cotação virando pedido de compra) pedia DUAS
  justificativas OBRIGATÓRIAS, as duas gravadas na auditoria:
    - comprar ACIMA da quantidade solicitada (`justificativa_excedente`);
    - FECHAMENTO PARCIAL (`justificativa`).
  As duas eram digitadas num `window.prompt`, sem validação nenhuma: um
  espaço em branco passava, e a única checagem era `if (!texto)` DEPOIS de a
  pessoa ter fechado a caixa. Enquanto isso, o caso MENOS crítico da mesma
  tela — encerrar SEM gerar pedido — já exigia 10 caracteres e uma marcação
  de ciência, com o botão desabilitado até as duas condições. O controle
  mais fraco estava no caminho mais caro.

  Este hook devolve `Promise<{ ok, texto }>` — a MESMA forma do
  `useConfirmacao`, para que a disciplina da R21 (desestruturar sempre) valha
  igual nos dois — mas com o piso do caso menos crítico embutido: mínimo de
  10 caracteres, contador à vista, marcação de ciência, e o botão de
  confirmar desabilitado até as duas coisas. Validar DEPOIS não é a mesma
  coisa que impedir ANTES: o `prompt` deixava enviar e só então reclamava.

  Ele vive aqui, e não no `useConfirmacao`, porque `components/padrao` é
  compartilhado: acrescentar `minimoCaracteres` + `ciencia` ao hook padrão é
  mudança de contrato no meio de uma leva, e a R21 registra por que isso não
  se faz sem o check nascendo junto. A proposta está no relatório.
*/
function useJustificativaAuditoria() {
  const [pedido, setPedido] = useState(null);
  const [texto, setTexto] = useState('');
  const [ciente, setCiente] = useState(false);
  const resolver = useRef(null);

  const responder = useCallback((ok, valor = '') => {
    setPedido(null);
    setTexto('');
    setCiente(false);
    if (resolver.current) {
      resolver.current({ ok, texto: valor });
      resolver.current = null;
    }
  }, []);

  // Promessa pendente ao desmontar resolve como "não" — senão o `await` do
  // chamador fica preso para sempre se a tela sair no meio.
  useEffect(() => () => {
    if (resolver.current) {
      resolver.current({ ok: false, texto: '' });
      resolver.current = null;
    }
  }, []);

  const pedirJustificativa = useCallback((opcoes = {}) => new Promise((resolve) => {
    if (resolver.current) resolver.current({ ok: false, texto: '' });
    resolver.current = resolve;
    setTexto('');
    setCiente(false);
    setPedido({
      titulo: opcoes.titulo || 'Justificativa obrigatoria',
      mensagem: opcoes.mensagem || '',
      detalhes: Array.isArray(opcoes.detalhes) ? opcoes.detalhes : [],
      rotuloCampo: opcoes.rotuloCampo || 'Justificativa',
      placeholder: opcoes.placeholder || '',
      rotuloCiencia: opcoes.rotuloCiencia || 'Confirmo o registro acima.',
      rotuloConfirmar: opcoes.rotuloConfirmar || 'Confirmar',
      tom: opcoes.tom || 'warning'
    });
  }), []);

  const limpo = texto.trim();
  const textoValido = limpo.length >= MINIMO_JUSTIFICATIVA;

  const elementoJustificativa = pedido ? (
    <ModalPortal onClose={() => responder(false)}>
      <div className="app-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="justificativa-auditoria-titulo">
        <div className="app-modal-surface app-modal-surface--standard">
          <div
            className="flex items-start justify-between gap-4 border-b px-4 py-4"
            style={{ borderColor: 'var(--c-border)' }}
            data-modal="cabecalho"
          >
            <div className="min-w-0">
              <h2 id="justificativa-auditoria-titulo" className="text-lg font-semibold" style={{ color: 'var(--c-text)' }}>
                {pedido.titulo}
              </h2>
              {pedido.mensagem ? (
                <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--c-muted)' }}>{pedido.mensagem}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="compras-icon-action shrink-0"
              onClick={() => responder(false)}
              title="Fechar"
              aria-label="Fechar"
            >
              <HiOutlineXMark />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {pedido.detalhes.length ? (
              <div className="rounded-lg border px-3 py-3 text-xs leading-relaxed" style={estiloTom(pedido.tom)}>
                <ul className="grid gap-1">
                  {pedido.detalhes.map((linha) => (
                    <li key={linha}>{linha}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <FormSecao colunas={2}>
              <CampoForm
                label={pedido.rotuloCampo}
                obrigatorio
                tipo="observacao"
                hint={`Minimo de ${MINIMO_JUSTIFICATIVA} caracteres. ${limpo.length}/2000 — o texto vai para a auditoria.`}
              >
                <textarea
                  className="input"
                  rows={4}
                  maxLength={2000}
                  value={texto}
                  autoFocus
                  onChange={(evento) => setTexto(evento.target.value)}
                  placeholder={pedido.placeholder}
                />
              </CampoForm>
            </FormSecao>

            <label
              className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-3 text-sm"
              style={estiloTom(pedido.tom)}
            >
              <input
                type="checkbox"
                checked={ciente}
                onChange={(evento) => setCiente(evento.target.checked)}
              />
              <span>{pedido.rotuloCiencia}</span>
            </label>
          </div>

          <div
            className="app-page-actions justify-end border-t px-4 py-4"
            style={{ borderColor: 'var(--c-border)' }}
            data-modal="rodape"
          >
            <button type="button" className="btn btn-outline" onClick={() => responder(false)}>Cancelar</button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!textoValido || !ciente}
              title={!textoValido
                ? `Informe pelo menos ${MINIMO_JUSTIFICATIVA} caracteres`
                : (!ciente ? 'Marque a ciencia para continuar' : undefined)}
              onClick={() => responder(true, limpo)}
            >
              {pedido.rotuloConfirmar}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  ) : null;

  return { pedirJustificativa, elementoJustificativa };
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

/*
  R19: a função avisava com `alert` do navegador nos DOIS caminhos. Agora ela
  só faz a cópia e devolve se deu certo — quem chama tem a faixa de avisos da
  própria tela e diz o que aconteceu com o tom semântico certo.
*/
async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
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

/*
  ATENÇÃO — este componente NÃO É RENDERIZADO em lugar nenhum hoje.

  `ModalPedidoFinal` (350 linhas) não aparece no JSX da página; o
  `onRemanejamentoAplicado` chega à `SecaoComparativo` como prop e ela
  também nunca o chama. O remanejamento entre fornecedores existe em código
  e não existe para o usuário.

  NÃO REMOVI: remover elemento/capacidade é decisão do responsável (regra 2
  da disciplina de regras), e o registro está no relatório desta migração.
  Como o arquivo inteiro tinha de zerar as caixas do navegador (R19), o
  componente recebeu a própria faixa `useAvisos` — no dia em que for ligado,
  ele já nasce dentro do padrão em vez de disparar um `alert` do Chrome.
*/
function ModalPedidoFinal({ fornecedor, itensGanhos, solicitacaoId, onRemanejamento, onFechar }) {
  const { avisos, avisar, fechar } = useAvisos();
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

  // A TabelaPadrao sempre oferece "selecionar todos" na selecao em lote;
  // aqui isso marca (ou limpa) todos os itens ganhos, ja preenchendo a
  // quantidade a remanejar de cada um — o mesmo que `toggleItem` faz um a um.
  function marcarTodosItensGanhos(marcar) {
    setDestinoFornecedorId('');
    if (!marcar) {
      setItensSelecionados([]);
      setQuantidadesRemanejar({});
      return;
    }
    const elegiveis = itensGanhos.filter((item) => item.resposta_item_id);
    setItensSelecionados(elegiveis.map((item) => item.resposta_item_id));
    setQuantidadesRemanejar(elegiveis.reduce((acumulado, item) => ({
      ...acumulado,
      [String(item.resposta_item_id)]: formatNumeroCompra(item.quantidade)
    }), {}));
  }

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
        <div
          className="flex items-center justify-between border-b px-4 py-4"
          style={{ borderColor: 'var(--c-border)' }}
          data-modal="cabecalho"
        >
          <h2 id="pedido-final-titulo" className="text-lg font-semibold" style={{ color: 'var(--c-text)' }}>
            Pedido: {fornecedor.nome}
          </h2>
          <button type="button" className="compras-icon-action" onClick={onFechar} title="Fechar" aria-label="Fechar">
            <HiOutlineXMark />
          </button>
        </div>

        <div className="grid gap-4 px-4 py-4">
          <Avisos avisos={avisos} aoFechar={fechar} />
          {/* Itens ganhos */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Itens que este fornecedor ganhou</span>
              {!modoRemanejar && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setModoRemanejar(true)}
                >
                  Remanejar itens para outro fornecedor
                </button>
              )}
            </div>
            <div>
              <TabelaPadrao
                colunas={[
                  {
                    id: 'item',
                    titulo: 'Item',
                    // R17: o nome do insumo nomeia a linha ganha.
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (it) => <CelulaDupla principal={it.nome || '-'} sub={it.especificacao || null} />
                  },
                  {
                    id: 'quantidade',
                    // TRAVADA (05/09): a quantidade e dado, mas o campo do remanejamento mora
                    // dentro dela — escondida, nao sobra onde digitar a quantidade a remanejar.
                    sempreVisivel: true,
                    titulo: 'Qtd',
                    tipo: 'numero',
                    render: (it) => (
                      <span className="block">
                        <span>{it.quantidade} {it.unidade || ''}</span>
                        {modoRemanejar && itensSelecionados.includes(it.resposta_item_id) && (
                          <input
                            className="input mt-2 text-xs"
                            value={quantidadesRemanejar[String(it.resposta_item_id)] ?? ''}
                            aria-label={`Quantidade a remanejar de ${it.nome || 'item'}`}
                            onChange={(event) => setQuantidadesRemanejar((current) => ({
                              ...current,
                              [String(it.resposta_item_id)]: event.target.value
                            }))}
                            placeholder="Qtd."
                          />
                        )}
                      </span>
                    )
                  },
                  {
                    id: 'preco',
                    titulo: 'Preço unit.',
                    tipo: 'valor',
                    render: (it) => fmtMoeda(it.preco)
                  },
                  {
                    id: 'total',
                    titulo: 'Total',
                    tipo: 'valor',
                    ordenavel: true,
                    ordemInicial: 'desc',
                    valorOrdenacao: (it) => Number(it.quantidade) * Number(it.preco || 0),
                    render: (it) => <span className="font-semibold">{fmtMoeda(Number(it.quantidade) * Number(it.preco || 0))}</span>
                  },
                  ...(modoRemanejar ? [] : [
                    {
                      id: 'prazo',
                      titulo: 'Prazo',
                      tipo: 'texto',
                      render: (it) => it.prazo || '-'
                    }
                  ])
                ]}
                itens={itensGanhos}
                getId={(it) => it.resposta_item_id || it.nome}
                storageKey="tabela:gerenciar-cotacao:itens-ganhos"
                rotuloRolagem="Itens que este fornecedor ganhou"
                vazio="Nenhum item ganho por este fornecedor."
                {...(modoRemanejar ? {
                  selecao: {
                    selecionados: itensSelecionados,
                    aoAlternar: (id, it) => toggleItem(it),
                    aoAlternarTodos: (marcar) => marcarTodosItensGanhos(marcar),
                    elegivel: (it) => Boolean(it.resposta_item_id)
                  }
                } : null)}
              />
              {/* O total saiu do <tfoot> e virou resumo apartado: a
                  TabelaPadrao nao tem rodape de tabela. */}
              <div className="mt-2 flex items-center justify-end gap-2 text-sm">
                <span className="font-semibold">Total do pedido:</span>
                <strong className="font-bold" style={{ color: 'var(--sem-success)' }}>{fmtMoeda(totalGanho)}</strong>
              </div>
            </div>
          </div>

          {/* Remanejamento */}
          {modoRemanejar && (
            <div className="grid gap-3 rounded-xl border p-4" style={estiloTom('warning')}>
              <p className="text-sm font-medium">
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
                      avisar.erro(error.message || 'Nao foi possivel remanejar os itens.');
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
              <p className="text-xs" style={{ color: 'var(--c-muted)' }}>Enviar pedido para o fornecedor:</p>
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
                  onClick={async () => {
                    const copiou = await copiarTexto(mensagemWhatsApp);
                    // Retorno trivial de clipboard: nada foi gravado, o botao ja diz o que aconteceu.
                    if (copiou) avisar.sucesso('Mensagem copiada.', undefined, { efemero: true });
                    else avisar.erro('Não foi possível copiar a mensagem automaticamente.');
                  }}
                >
                  Copiar mensagem
                </button>
              </div>
            </div>
          )}
        </div>

        <div
          className="flex justify-end border-t px-4 py-4"
          style={{ borderColor: 'var(--c-border)' }}
          data-modal="rodape"
        >
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
  /*
    A LISTA DE FORNECEDORES NÃO FECHAVA DE JEITO NENHUM (05/09).

    Ela não tinha estado de aberta: aparecia por `texto digitado > 0` e só
    sumia quando a pessoa APAGAVA o que digitou ou escolhia uma categoria.
    Como é `absolute z-dropdown`, ficava pousada sobre o seletor de categoria e
    o botão "Buscar" logo abaixo — e não havia como dispensá-la sem perder
    o termo buscado. Clicar fora não fazia nada; `Esc` não fazia nada.

    Agora `deveMostrarAutocomplete` (a CONDIÇÃO de haver o que mostrar)
    continua igual — inclusive para o aviso de estado vazio, que depende
    dela — e ganha um `autocompleteAberto` por cima, que é o que o clique
    fora e o `Esc` desligam. Digitar de novo, ou focar o campo, reabre.

    A seleção segue viva por dois motivos, os dois necessários: o ref
    envolve o campo E a lista (clique na opção é DENTRO, o hook não fecha
    no `mousedown`), e a opção ganhou `onMouseDown` com `preventDefault`
    para não perder o foco do campo — aqui a escolha é MÚLTIPLA, a pessoa
    marca vários fornecedores em sequência sem sair do campo.
  */
  const autocompleteFornecedorRef = useRef(null);
  const [autocompleteFornecedorAberto, setAutocompleteFornecedorAberto] = useState(false);
  useFecharAoSair(
    autocompleteFornecedorRef,
    autocompleteFornecedorAberto,
    () => setAutocompleteFornecedorAberto(false)
  );
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
    <div className="cotacao-fornecedores-secao grid min-w-0 max-w-full gap-3">
      {/* Envio para fornecedores vinculados via WhatsApp */}
      {linksVinculados.length > 0 && (
        <div className="cotacao-whatsapp-panel rounded-xl border px-3 py-3" style={estiloTom('success')}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Enviar cotações via WhatsApp</h3>
              <p className="mt-1 text-xs">
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
                  className="btn btn-sm btn-primary"
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
        <div
          className="cotacao-fornecedores-panel min-w-0 max-w-full rounded-xl border p-3"
          style={{ borderColor: 'var(--c-border)', background: 'var(--ui-surface-2)' }}
        >
          {/* A grade acompanha o espaco do card (inclusive ao mudar o zoom),
              nao os breakpoints da janela que tambem medem a barra lateral. */}
          <div className="cotacao-fornecedores-layout">
          <div className="cotacao-fornecedores-grade grid min-w-0 items-start gap-4">
            <div className="grid min-w-0 content-start gap-3">
              {/* Selecao por categoria */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Selecionar fornecedores existentes</div>
                  <div className="text-xs" style={{ color: 'var(--c-muted)' }}>Busque por nome, documento, email ou categoria antes de gerar os links.</div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setSelecionandoPorCategoria(!selecionandoPorCategoria)}
                >
                  Filtrar por categoria de insumo
                </button>
              </div>

              {selecionandoPorCategoria && (
                <div className="grid gap-2 rounded-xl border p-3" style={estiloTom('info')}>
                  <p className="text-xs">
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
                      className="btn btn-primary btn-sm"
                      onClick={selecionarTodosComCategoria}
                      disabled={!categoriaSelecionada.trim() || !fornecedoresComCategoria.length}
                    >
                      Selecionar {fornecedoresComCategoria.length > 0 ? `(${fornecedoresComCategoria.length})` : ''}
                    </button>
                  </div>
                  {categoriaSelecionada && fornecedoresComCategoria.length === 0 && (
                    <p className="text-xs">Nenhum fornecedor cadastrado com esta categoria.</p>
                  )}
                </div>
              )}

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">Fornecedores</span>
                  {fornecedoresSelecionados.length > 0 && (
                    <Etiqueta tom="info">{fornecedoresSelecionados.length} selecionado(s)</Etiqueta>
                  )}
                </div>
                <div className="mb-2 flex flex-wrap items-start gap-2">
                  <div className="app-busca relative" ref={autocompleteFornecedorRef}>
                    <input
                      className="input"
                      placeholder="Digite nome, CNPJ, email ou contato"
                      value={fornecedorBusca}
                      onChange={(e) => {
                        setAutocompleteFornecedorAberto(true);
                        onChangeFornecedorBusca(e.target.value);
                      }}
                      onFocus={() => setAutocompleteFornecedorAberto(true)}
                    />
                    {deveMostrarAutocomplete && autocompleteFornecedorAberto && (
                      <div
                        className="cotacao-fornecedores-autocomplete absolute left-0 right-0 z-dropdown mt-1 rounded-xl border"
                        style={{ top: '100%', borderColor: 'var(--c-border)', background: 'var(--c-surface)', boxShadow: 'var(--ui-shadow-lg)' }}
                      >
                        {buscandoFornecedores ? (
                          <div className="px-3 py-3 text-sm" style={{ color: 'var(--c-muted)' }}>Buscando fornecedores...</div>
                        ) : fornecedoresAutocomplete.length === 0 ? (
                          <div className="px-3 py-3 text-sm" style={{ color: 'var(--c-muted)' }}>
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
                                className="flex w-full items-start gap-3 border-b px-3 py-2 text-left last:border-b-0"
                                style={{
                                  borderColor: 'var(--c-border)',
                                  background: checked ? 'var(--sem-info-bg)' : 'transparent'
                                }}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => onToggleFornecedor(selectionKey, !checked, f)}
                              >
                                <input type="checkbox" checked={checked} readOnly className="mt-1" />
                                <span className="min-w-0">
                                  <span className="block font-semibold" style={{ color: 'var(--c-text)' }}>{f.nome}</span>
                                  <span className="block text-xs" style={{ color: 'var(--c-muted)' }}>
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
                  {/* Seletor de CONTEXTO (qual conjunto de fornecedores
                      listar antes de gerar os links), legítimo pela R12 —
                      não recorta uma lista já exibida. */}
                  <select
                    className="input"
                    aria-label="Categoria de insumo do fornecedor"
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
                  <div
                    className="cotacao-fornecedores-empty rounded-lg border border-dashed px-3 py-3 text-xs"
                    style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-muted)' }}
                  >
                    Digite no campo de busca para localizar fornecedores ou escolha uma categoria para listar os cadastrados.
                  </div>
                )}
                {deveMostrarListaCategoria && (
                  <div
                    className="cotacao-fornecedores-list app-list-stack max-h-56 overflow-y-auto rounded-xl border p-2"
                    style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)' }}
                  >
                    {buscandoFornecedores ? (
                      <div className="text-sm" style={{ color: 'var(--c-muted)' }}>Buscando...</div>
                    ) : fornecedoresListaCategoria.length === 0 ? (
                      <div className="text-sm" style={{ color: 'var(--c-muted)' }}>Nenhum fornecedor encontrado para a categoria selecionada.</div>
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
                              <div className="text-xs" style={{ color: 'var(--c-muted)' }}>WhatsApp: {f.whatsapp}</div>
                            )}
                            {Array.isArray(f.categoria_insumos) && f.categoria_insumos.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {f.categoria_insumos.map((c) => (
                                  <Etiqueta key={c} tom="info">{c}</Etiqueta>
                                ))}
                              </div>
                            )}
                            <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
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

            <div
              className="cotacao-fornecedores-selecionados grid min-w-0 content-start gap-3 rounded-xl border p-3"
              style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Fornecedores selecionados</div>
                  <div className="text-xs" style={{ color: 'var(--c-muted)' }}>Revise antes de gerar os links.</div>
                </div>
                <Etiqueta tom="info">{fornecedoresSelecionadosDetalhes.length}</Etiqueta>
              </div>
              {fornecedoresSelecionadosDetalhes.length === 0 ? (
                <div
                  className="rounded-lg border border-dashed px-3 py-4 text-xs"
                  style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}
                >
                  Nenhum fornecedor selecionado.
                </div>
              ) : (
                <div className="app-list-stack max-h-64 overflow-y-auto">
                  {fornecedoresSelecionadosDetalhes.map((fornecedor) => {
                    const selectionKey = fornecedorSelectionKey(fornecedor);
                    return (
                      <div
                        key={selectionKey}
                        className="rounded-lg border px-3 py-2 text-xs"
                        style={{ borderColor: 'var(--c-border)', background: 'var(--ui-surface-2)' }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-semibold" style={{ color: 'var(--c-text)' }}>{fornecedor.nome}</div>
                            <div className="truncate" style={{ color: 'var(--c-muted)' }}>
                              {fornecedor.whatsapp || fornecedor.telefone || fornecedor.email || 'Sem contato principal'}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-outline btn-perigo-suave btn-sm"
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

            {/*
              R9: o cadastro rápido é INLINE de propósito — ele não interrompe
              outro trabalho, ele É parte de montar a cotação. Tirá-lo daqui
              obrigaria a abrir e fechar um modal no meio do que a pessoa veio
              fazer.
            */}
            <div
              className="cotacao-fornecedor-rapido grid min-w-0 content-start gap-3 rounded-xl border p-3"
              style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)' }}
            >
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Cadastro rápido</div>
                <div className="text-xs" style={{ color: 'var(--c-muted)' }}>Inclua um fornecedor novo sem sair da cotação.</div>
              </div>
              <FormSecao colunas={2}>
                <CampoForm label="Nome do fornecedor" span={2}>
                  <input className="input" placeholder="Ex.: Fornecedor ABC" value={novoFornecedor.nome} onChange={(e) => onChangeNovoFornecedor('nome', e.target.value)} />
                </CampoForm>
                <CampoForm label="CPF/CNPJ">
                  <input className="input" placeholder="CPF ou CNPJ do fornecedor" value={maskCpfCnpj(novoFornecedor.cnpj)} onChange={(e) => onChangeNovoFornecedor('cnpj', maskCpfCnpj(e.target.value))} inputMode="numeric" maxLength={18} />
                </CampoForm>
                <CampoForm label="WhatsApp">
                  <input className="input" placeholder="(00) 00000-0000" value={novoFornecedor.whatsapp} onChange={(e) => onChangeNovoFornecedor('whatsapp', e.target.value)} />
                </CampoForm>
                <CampoForm label="Email">
                  <input className="input" placeholder="email@fornecedor.com" value={novoFornecedor.email} onChange={(e) => onChangeNovoFornecedor('email', e.target.value)} />
                </CampoForm>
                <CampoForm label="Contato">
                  <input className="input" placeholder="Nome do contato" value={novoFornecedor.contato} onChange={(e) => onChangeNovoFornecedor('contato', e.target.value)} />
                </CampoForm>
              </FormSecao>
              <div className="grid gap-2 pt-1">
                <button type="button" className="btn btn-outline w-full" onClick={onCriarFornecedorRapido}>Cadastrar e selecionar</button>
                <button type="button" className="btn btn-primary w-full" onClick={onEnviarFornecedores} disabled={enviandoFornecedores}>
                  {enviandoFornecedores ? 'Gerando links...' : 'Gerar links de cotacao'}
                </button>
              </div>
            </div>
          </div>
          </div>

          {fornecedoresSelecionados.length > 0 && (
            <div
              className="mt-4 min-w-0 max-w-full rounded-xl border p-3"
              style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)' }}
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Itens por fornecedor</div>
                  <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
                    Marque quais itens cada fornecedor receberá no link. Cada coluna vira uma cotação daquele fornecedor.
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Etiqueta>{qtdItensSelecionados}/{totalCelulasEnvio} selecao(oes)</Etiqueta>
                  <button type="button" className="btn btn-sm btn-outline" onClick={onSelecionarTodosItensEnvio}>Selecionar tudo</button>
                  <button type="button" className="btn btn-sm btn-outline" onClick={onLimparItensEnvio}>Limpar</button>
                </div>
              </div>
              {fornecedoresSemItens.length > 0 && (
                <div className="mb-3 rounded-lg border px-3 py-2 text-xs font-medium" style={estiloTom('warning')}>
                  Selecione ao menos um item para: {fornecedoresSemItens.map((fornecedor) => fornecedor.nome).join(', ')}.
                </div>
              )}
              {/*
                TABELA CRUA DECLARADA — exceção de R1 e de R10, com motivo.

                É uma MATRIZ de marcação: linhas = itens da solicitação,
                colunas = UM FORNECEDOR POR COLUNA, geradas em tempo de
                execução a partir de quem está selecionado. A `TabelaPadrao`
                não faz coluna dinâmica por dado: `storageKey` guarda largura
                e ordem por `id` de coluna, e aqui o conjunto de ids muda a
                cada fornecedor marcado ou desmarcado — a largura salva
                passaria a valer para outra coluna. Além disso o cabeçalho de
                cada coluna é um CONTROLE (marcar todos os itens daquele
                fornecedor), e no componente o `th` é botão de ordenação
                (R14b), não área de formulário.

                Duas coisas ficam como estão de propósito:
                - o contêiner com `overflow-x: auto` é o arranjo CORRETO pela
                  R18 — é o scrollport ao qual a coluna fixa PRECISA grudar;
                  trocar por `hidden` mataria o sticky em silêncio;
                - as larguras mínimas por coluna são o que impede a matriz de
                  colapsar; sem `TabelaPadrao` não há de onde tirá-las.

                O que o componente precisaria ganhar para absorver este caso
                está escrito no relatório desta migração.
              */}
              <div
                className="cotacao-scroll-region max-w-full overflow-x-auto overscroll-x-contain rounded-lg border pb-2"
                style={{ borderColor: 'var(--c-border)' }}
                role="region"
                aria-label="Itens por fornecedor"
                tabIndex={0}
              >
                <table className="w-max min-w-[980px] text-left text-xs">
                  <thead className="uppercase tracking-wide" style={{ background: 'var(--ui-surface-2)', color: 'var(--c-muted)' }}>
                    <tr>
                      <th className="sticky left-0 z-celula-cabecalho min-w-[260px] px-3 py-2" style={{ background: 'var(--ui-surface-2)' }}>Item</th>
                      <th className="min-w-[95px] px-3 py-2">Qtd.</th>
                      <th className="min-w-[180px] px-3 py-2">Especificação</th>
                      <th className="min-w-[115px] px-3 py-2">Necessário</th>
                      {fornecedoresSelecionadosDetalhes.map((fornecedor) => {
                        const selectionKey = fornecedorSelectionKey(fornecedor);
                        const itensFornecedor = itemKeys.filter((itemKey) => Boolean(itensSelecionadosEnvio?.[selectionKey]?.[itemKey])).length;
                        const todosMarcados = itemKeys.length > 0 && itensFornecedor === itemKeys.length;
                        return (
                          <th
                            key={selectionKey}
                            className="min-w-[190px] border-l px-3 py-2 text-center"
                            style={{ borderColor: 'var(--c-border)' }}
                          >
                            <label className="flex cursor-pointer flex-col items-center gap-1 normal-case tracking-normal">
                              <span className="line-clamp-2 font-semibold" style={{ color: 'var(--c-text)' }}>{fornecedor.nome}</span>
                              <span className="text-xs" style={{ color: 'var(--c-muted)' }}>{itensFornecedor}/{itemKeys.length} item(ns)</span>
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
                        <tr key={itemKey} className="border-t align-top" style={{ borderColor: 'var(--c-border)' }}>
                          <td className="sticky left-0 z-celula px-3 py-2" style={{ background: 'var(--c-surface)' }}>
                            <label className="flex items-start gap-2">
                              <input
                                className="mt-1"
                                type="checkbox"
                                checked={itemMarcadoParaTodos}
                                onChange={(event) => onToggleItemParaTodosFornecedores(itemKey, event.target.checked)}
                                aria-label={`Selecionar ${item.nome} para todos os fornecedores`}
                              />
                              <span>
                                <span className="block font-semibold" style={{ color: 'var(--c-text)' }}>{item.nome}</span>
                                <span className="block text-xs" style={{ color: 'var(--c-muted)' }}>{item.item_tipo === 'MANUAL' ? 'Manual' : 'Cadastrado'}</span>
                              </span>
                            </label>
                          </td>
                          <td className="px-3 py-2">{formatNumeroCompra(item.quantidade)} {item.unidade}</td>
                          <td className="px-3 py-2" style={{ color: 'var(--c-muted)' }}>{item.especificacao || '-'}</td>
                          <td className="px-3 py-2">{fmt(item.necessario_para)}</td>
                          {fornecedoresSelecionadosDetalhes.map((fornecedor) => {
                            const selectionKey = fornecedorSelectionKey(fornecedor);
                            return (
                              <td
                                key={`${selectionKey}-${itemKey}`}
                                className="border-l px-3 py-2 text-center"
                                style={{ borderColor: 'var(--c-border)' }}
                              >
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
  embedded = false,
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
        <td
          key={`${buildItemKey(item)}-${fornecedor.fornecedor_id}`}
          className="min-w-[220px] border-l px-2 py-2 align-top text-xs"
          style={{ borderColor: 'var(--c-border)', background: 'var(--ui-surface-2)', color: 'var(--c-muted)' }}
        >
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
        className="min-w-[270px] border-l px-2 py-2 align-top text-xs"
        style={{
          borderColor: 'var(--c-border)',
          background: excedeuSolicitado
            ? 'var(--sem-warning-bg)'
            : (isVencedor ? 'var(--sem-success-bg)' : 'var(--c-surface)')
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold" style={{ color: 'var(--c-text)' }}>{resposta.preco ? fmtMoeda(resposta.preco) : '-'}</div>
            <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
              Total cotado: {resposta.preco ? fmtMoeda(resposta.valor_total_cotado) : '-'}
            </div>
          </div>
          <button
            type="button"
            className="compras-icon-action shrink-0"
            onClick={() => onEditarRespostaFornecedor?.(resposta.cotacao_fornecedor_id)}
            disabled={!podeEditarResposta}
            title={podeEditarResposta ? 'Editar resposta internamente' : 'Edicao indisponivel'}
            aria-label="Editar resposta internamente"
          >
            <HiOutlinePencilSquare />
          </button>
        </div>

        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--c-muted)' }}>
          <span className="font-semibold" style={{ color: 'var(--sem-success)' }}>Disponivel: {formatNumeroCompra(quantidadeDisponivelFornecedor)}</span>
          <span
            className={saldoDisponivelFornecedor > 0 ? 'font-semibold' : undefined}
            style={{ color: saldoDisponivelFornecedor > 0 ? 'var(--sem-info)' : 'var(--c-muted)' }}
          >
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

        <div className="mt-2 flex items-center gap-2 border-t pt-2" style={{ borderColor: 'var(--c-border)' }}>
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
            className="input text-xs"
            value={isVencedor ? getQuantidadeAlocadaInput(resposta.resposta_item_id) : ''}
            placeholder="Qtd."
            aria-label={`Quantidade comprada de ${resposta.fornecedor_nome || fornecedor.nome || 'fornecedor'} para ${item.nome}`}
            disabled={!podeEncerrar || !isVencedor}
            onChange={(event) => onVencedorChange({
              item,
              resposta,
              quantidade: event.target.value
            })}
          />
          {excedeuSolicitado ? (
            <span className="text-xs font-semibold" style={{ color: 'var(--sem-warning)' }}>Acima do solicitado</span>
          ) : null}
        </div>
      </td>
    );
  }

  if (!comparativo?.itens?.length) {
    return (
      <BlocoConteudo
        titulo="Comparativo de Cotações"
        recolhivel={embedded}
        className="cotacao-comparativo-panel"
      >
        <div className="app-empty-card">
          O comparativo aparece assim que os fornecedores responderem a cotação.
        </div>
      </BlocoConteudo>
    );
  }

  return (
    <>
      {/*
        B2: este é o bloco PRIMÁRIO da tela — é ele que responde a pergunta
        central ("de quem eu compro, e quanto?"). Os demais são neutros.
      */}
      <BlocoConteudo
        titulo="Comparativo por item"
        recolhivel={embedded}
        variante="primario"
        cor="var(--sem-info)"
        contagem={`${comparativo.itens.length} item(ns)`}
        descricao="Compare respostas, selecione vencedores e encerre a cotação quando estiver pronta."
        acoes={(
          <span
            className="inline-flex rounded-lg border p-1 text-xs"
            style={{ borderColor: 'var(--c-border)', background: 'var(--ui-surface-2)' }}
          >
            <button
              type="button"
              className={`btn btn-sm ${modoVisualizacao === 'cards' ? 'btn-primary' : 'btn-outline'}`}
              aria-pressed={modoVisualizacao === 'cards'}
              onClick={() => setModoVisualizacao('cards')}
            >
              Cards
            </button>
            <button
              type="button"
              className={`btn btn-sm ${modoVisualizacao === 'mapa' ? 'btn-primary' : 'btn-outline'}`}
              aria-pressed={modoVisualizacao === 'mapa'}
              onClick={() => setModoVisualizacao('mapa')}
            >
              Mapa
            </button>
          </span>
        )}
      >

        {modoVisualizacao === 'mapa' && (
          <div className="mb-3 rounded-lg border" style={{ borderColor: 'var(--c-border)', background: 'var(--ui-surface-2)' }}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--c-border)' }}>
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Mapa de comparação</div>
                <div className="text-xs" style={{ color: 'var(--c-muted)' }}>Itens nas linhas e fornecedores respondidos nas colunas.</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn btn-sm btn-outline" onClick={() => setPainelFornecedoresAberto((atual) => !atual)}>
                  Fornecedores ({fornecedoresMapaVisiveis.length}/{fornecedoresMapa.length})
                </button>
                <button type="button" className="btn btn-sm btn-outline" onClick={mostrarTodosFornecedoresMapa}>Mostrar todos</button>
                <button type="button" className="btn btn-sm btn-outline" onClick={ocultarTodosFornecedoresMapa}>Ocultar todos</button>
              </div>
            </div>

            {painelFornecedoresAberto && (
              <div className="grid gap-2 border-b px-3 py-3 sm:grid-cols-2 lg:grid-cols-3" style={{ borderColor: 'var(--c-border)' }}>
                {fornecedoresMapa.map((fornecedor) => {
                  const visivel = fornecedoresVisiveis[String(fornecedor.fornecedor_id)] !== false;
                  return (
                    <label
                      key={fornecedor.fornecedor_id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                      style={visivel
                        ? estiloTom('info')
                        : { borderColor: 'var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-muted)' }}
                    >
                      <input
                        type="checkbox"
                        checked={visivel}
                        onChange={() => toggleFornecedorMapa(fornecedor.fornecedor_id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{fornecedor.nome}</span>
                        <span className="block text-xs">
                          DIFAL {fmtMoeda(fornecedor.difal_valor)} · Frete {fornecedor.frete_tipo === 'SEM_FRETE'
                            ? 'sem frete'
                            : `${fornecedor.frete_tipo === 'TERCEIRO' ? 'terceiro' : 'embutido'} ${fmtMoeda(fornecedor.frete_valor)}${fornecedor.frete_modo === 'POR_ITEM' ? ' por item' : ' global'}`}
                        </span>
                      </span>
                      <span className="text-xs uppercase">{fmtStatus(fornecedor.status)}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {/*
              SEGUNDA TABELA CRUA DECLARADA — mesma exceção de R1/R10, mesmo
              motivo, e uma restrição a mais: são DUAS colunas fixas à
              esquerda (Item e Qtd.), e a `TabelaPadrao` gruda apenas a
              primeira. Aqui a coluna de quantidade é o que dá sentido a cada
              número lido nas colunas de fornecedor; perdê-la na rolagem
              horizontal é perder a referência da linha.

              O `.compras-responsive-table` rola na horizontal com
              `overflow-x: auto` — pela R18 esse é o arranjo CORRETO: é o
              scrollport ao qual as duas colunas fixas grudam.
            */}
            {fornecedoresMapaVisiveis.length > 0 ? (
              <div className="compras-responsive-table">
                <table className="table min-w-[1420px] text-xs">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-celula-cabecalho min-w-[260px]" style={{ background: 'var(--ui-surface-2)' }}>Item</th>
                      <th className="sticky left-[260px] z-celula-cabecalho min-w-[110px] text-right" style={{ background: 'var(--ui-surface-2)' }}>Qtd.</th>
                      {fornecedoresMapaVisiveis.map((fornecedor) => (
                        <th
                          key={fornecedor.fornecedor_id}
                          className="min-w-[240px] border-l"
                          style={{ borderColor: 'var(--c-border)', background: 'var(--ui-surface-2)' }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0">
                              <span className="block truncate" title={fornecedor.nome}>{fornecedor.nome}</span>
                              {/* R10: era `text-[9px]` — abaixo do piso de 12px
                                  que o cliente fixou em 02/09. */}
                              <span className="block text-xs font-normal" style={{ color: 'var(--c-muted)' }}>
                                DIFAL {fmtMoeda(fornecedor.difal_valor)} · {fornecedor.frete_tipo === 'SEM_FRETE'
                                  ? 'sem frete'
                                  : `frete ${fornecedor.frete_tipo === 'TERCEIRO' ? 'terceiro' : 'embutido'} ${fmtMoeda(fornecedor.frete_valor)}${fornecedor.frete_modo === 'POR_ITEM' ? ' por item' : ' global'}`}
                              </span>
                            </span>
                            <button
                              type="button"
                              className="compras-icon-action shrink-0"
                              onClick={() => onEditarRespostaFornecedor?.(fornecedor.id)}
                              disabled={!podeEditarResposta}
                              title={podeEditarResposta ? 'Editar resposta internamente' : 'Edicao indisponivel'}
                              aria-label="Editar resposta internamente"
                            >
                              <HiOutlinePencilSquare />
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
                          <td className="sticky left-0 z-celula min-w-[260px] px-3 py-2 align-top" style={{ background: 'var(--c-surface)' }}>
                            <div className="font-semibold" style={{ color: 'var(--c-text)' }}>{item.nome}</div>
                            <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
                              {item.item_tipo === 'MANUAL' ? 'Manual' : 'Cadastrado'}
                              {item.especificacao ? ` - ${item.especificacao}` : ''}
                            </div>
                            {podeEncerrar ? (
                              <div
                                className={`mt-1 text-xs ${excedeu ? 'font-semibold' : ''}`}
                                style={{ color: excedeu ? 'var(--sem-warning)' : 'var(--c-muted)' }}
                              >
                                Rodada: <strong>{formatNumeroCompra(totalAlocadoItem)}</strong> | Fechado: {formatNumeroCompra(quantidadeFechada)} | Saldo: {formatNumeroCompra(saldoDisponivel)} {item.unidade || ''}
                              </div>
                            ) : null}
                          </td>
                          <td className="sticky left-[260px] z-celula min-w-[110px] px-3 py-2 text-right align-top font-semibold" style={{ background: 'var(--c-surface)' }}>
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
              <div className="px-3 py-8 text-center text-sm" style={{ color: 'var(--c-muted)' }}>
                Selecione ao menos um fornecedor respondido para visualizar o mapa.
              </div>
            )}
          </div>
        )}

        {modoVisualizacao === 'cards' && (
        <div className="app-list-stack gap-2">
          {comparativo.itens.map((item) => (
            <div key={buildItemKey(item)} className="cotacao-comparativo-item app-list-card px-3 py-3">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{item.nome}</div>
                  <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
                    {formatNumeroCompra(item.quantidade_atual ?? item.quantidade)} {item.unidade} - {item.item_tipo === 'MANUAL' ? 'Manual' : 'Cadastrado'}
                    {item.especificacao ? ` - ${item.especificacao}` : ''}
                  </div>
                  {podeEncerrar ? (
                    <div className="mt-1 text-xs" style={{ color: 'var(--c-muted)' }}>
                      Rodada: <strong>{formatNumeroCompra(getTotalAlocadoItem(item))}</strong> | Fechado: {formatNumeroCompra(item.quantidade_fechada)} | Saldo: {formatNumeroCompra(getSaldoDisponivelItem(item))} {item.unidade || ''}
                    </div>
                  ) : null}
                </div>
                {item.melhor_preco && (
                  <div className="cotacao-menor-preco rounded-lg border px-3 py-2 text-xs" style={estiloTom('success')}>
                    Menor: <strong>{item.melhor_preco.fornecedor_nome}</strong> - {fmtMoeda(item.melhor_preco.preco)}/un
                  </div>
                )}
              </div>

              <div>
                <TabelaPadrao
                  colunas={[
                    {
                      id: 'fornecedor',
                      titulo: 'Fornecedor',
                      // R17: o fornecedor e quem nomeia a resposta.
                      tipo: 'identidade',
                      noCard: 'titulo',
                      render: (resp) => resp.fornecedor_nome
                    },
                    {
                      id: 'quantidade_disponivel',
                      titulo: 'Qtd. disponível',
                      tipo: 'numero',
                      render: (resp) => (
                        <span className="block">
                          <span className="block font-semibold" style={{ color: 'var(--sem-success)' }}>{formatNumeroCompra(resp.quantidade_disponivel)}</span>
                          <span className="block text-xs" style={{ color: 'var(--sem-info)' }}>Saldo: {formatNumeroCompra(getSaldoDisponivelFornecedor(resp))}</span>
                        </span>
                      )
                    },
                    {
                      id: 'preco',
                      titulo: 'Preço unit.',
                      tipo: 'valor',
                      ordenavel: true,
                      valorOrdenacao: (resp) => (resp.preco ? parseNumeroCompra(resp.preco) : null),
                      render: (resp) => (resp.preco ? fmtMoeda(resp.preco) : '-')
                    },
                    {
                      id: 'valor_total_cotado',
                      titulo: 'Valor total',
                      tipo: 'valor',
                      ordenavel: true,
                      valorOrdenacao: (resp) => (resp.preco ? parseNumeroCompra(resp.valor_total_cotado) : null),
                      render: (resp) => (resp.preco ? <span className="font-medium">{fmtMoeda(resp.valor_total_cotado)}</span> : '-')
                    },
                    { id: 'ipi_valor', titulo: 'IPI', tipo: 'valor', render: (resp) => fmtMoeda(resp.ipi_valor) },
                    { id: 'icms_valor', titulo: 'ICMS', tipo: 'valor', render: (resp) => fmtMoeda(resp.icms_valor) },
                    { id: 'st_valor', titulo: 'ST', tipo: 'valor', render: (resp) => fmtMoeda(resp.st_valor) },
                    { id: 'difal_valor', titulo: 'DIFAL', tipo: 'valor', render: (resp) => fmtMoeda(resp.difal_valor) },
                    {
                      id: 'frete',
                      titulo: 'Frete',
                      tipo: 'texto',
                      render: (resp) => (
                        resp.frete_tipo === 'SEM_FRETE'
                          ? 'Sem frete'
                          : `${resp.frete_tipo === 'TERCEIRO' ? 'Terceiro' : 'Embutido'} ${fmtMoeda(resp.frete_item_valor || resp.frete_valor)}${resp.frete_modo === 'POR_ITEM' ? ' (item)' : ' (global)'}`
                      )
                    },
                    {
                      id: 'prazo_entrega_fornecedor',
                      titulo: 'Prazo entrega',
                      tipo: 'texto',
                      render: (resp) => resp.prazo_entrega_fornecedor || '-'
                    },
                    {
                      id: 'condicao_pagamento',
                      titulo: 'Cond. pag.',
                      tipo: 'texto',
                      render: (resp) => resp.condicao_pagamento || '-'
                    },
                    {
                      id: 'quantidade_minima_item',
                      titulo: 'Qtd. min.',
                      tipo: 'numero',
                      render: (resp) => resp.quantidade_minima_item || '-'
                    },
                    {
                      id: 'observacao',
                      titulo: 'Observação',
                      tipo: 'texto',
                      render: (resp) => resp.observacao || '-'
                    }
                  ]}
                  itens={item.respostas}
                  getId={(resp) => `${item.id}-${resp.fornecedor_id}`}
                  storageKey="tabela:gerenciar-cotacao:respostas-item"
                  rotuloRolagem={`Respostas dos fornecedores para ${item.nome}`}
                  vazio="Nenhuma resposta para este item."
                  // Linha vencedora (quantidade alocada > 0) fica realcada; o
                  // aviso de rodada acima do saldo vira tarja de atencao.
                  linhaSelecionada={(resp) => getQuantidadeAlocada(resp.resposta_item_id) > 0}
                  urgencia={() => (getTotalAlocadoItem(item) > getSaldoDisponivelItem(item) + 0.0001 ? 'warning' : null)}
                  larguraAcoes={260}
                  acoesLinha={(resp) => {
                    const quantidadeAlocada = getQuantidadeAlocada(resp.resposta_item_id);
                    const isVencedor = quantidadeAlocada > 0;
                    const excedeu = getTotalAlocadoItem(item) > getSaldoDisponivelItem(item) + 0.0001;
                    if (!resp.resposta_item_id) return '-';
                    return (
                      <>
                        <input
                          type="checkbox"
                          checked={isVencedor}
                          aria-label={`Comprar de ${resp.fornecedor_nome}`}
                          disabled={!podeEncerrar || getSaldoDisponivelFornecedor(resp) <= 0 || !resp.disponivel || !resp.preco}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            onVencedorChange({
                              item,
                              resposta: resp,
                              quantidade: checked ? getQuantidadeInicialSelecao(item, resp) : 0
                            });
                          }}
                        />
                        <input
                          className="input text-xs"
                          value={isVencedor ? getQuantidadeAlocadaInput(resp.resposta_item_id) : ''}
                          placeholder="Qtd."
                          aria-label={`Quantidade comprada de ${resp.fornecedor_nome}`}
                          disabled={!podeEncerrar || !isVencedor}
                          onChange={(event) => onVencedorChange({
                            item,
                            resposta: resp,
                            quantidade: event.target.value
                          })}
                        />
                        {excedeu ? (
                          <span
                            className="text-xs font-semibold"
                            style={{ color: 'var(--sem-warning)' }}
                            title="Exige justificativa obrigatória no fechamento"
                          >
                            Acima do solicitado
                          </span>
                        ) : null}
                      </>
                    );
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        )}

          {(podeEncerrar || podeEncerrarSemPedido) && String(solicitacao.status || '').toUpperCase() !== 'RECUSADO' && (
            /* C5: um primário sólido; a destrutiva fica APARTADA, em vermelho
               suave (`.btn-perigo-suave`), nunca pintada à mão. */
            <div className="app-page-actions app-actionbar-apartada justify-end">
              {podeEncerrarSemPedido ? (
                <button
                  type="button"
                  className="btn btn-outline btn-perigo-suave"
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
      </BlocoConteudo>

    </>
  );
}

// Componente principal

export default function GerenciarCotacaoSolicitacao({ solicitacaoCompraId = null, embedded = false, onAtualizado = null }) {
  const { id: routeId } = useParams();
  const id = solicitacaoCompraId || routeId;
  const Container = embedded ? 'div' : Pagina;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const { pedirJustificativa, elementoJustificativa } = useJustificativaAuditoria();
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
  const [previsaoEntrega, setPrevisaoEntrega] = useState('');
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
      avisar.erro(error.message || 'Erro ao buscar fornecedores');
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
      if (onAtualizado) void Promise.resolve().then(() => onAtualizado()).catch((error) => {
        avisar.erro(error.message || 'Não foi possível atualizar os itens em cotação.');
      });
    } catch (error) {
      console.error(error);
      const mensagem = error.message || 'Erro ao carregar solicitacao de compra';
      setSolicitacao(null);
      setErroCarregamento(
        /nao encontrada|não encontrada/i.test(mensagem)
          ? 'Solicitacao de compra cancelada ou indisponivel para cotacao.'
          : mensagem
      );
      avisar.erro(mensagem);
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
    const itens = (solicitacao?.itens || [])
      .filter((item) => !item.status_aprovacao || item.status_aprovacao === 'APROVADO')
      .map((item) => ({
      item_tipo: 'CADASTRADO',
      item_referencia_id: item.id,
      nome: item.insumo?.nome || '-',
      unidade: item.unidade_sigla_manual || item.unidade?.sigla || item.unidade?.nome || '-',
      quantidade: item.quantidade,
      especificacao: item.especificacao || '-',
      apropriacao_linhas: montarLinhasResumoApropriacao(item),
      necessario_para: item.necessario_para,
      link_produto: item.link_produto || '',
      arquivo_url: item.arquivo_url || '',
      arquivo_nome_original: item.arquivo_nome_original || ''
    }));
    const manuais = (solicitacao?.itensManuais || [])
      .filter((item) => !item.status_aprovacao || item.status_aprovacao === 'APROVADO')
      .map((item) => ({
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
      avisar.erro(error.message || 'Erro ao abrir PDF');
    } finally {
      setBaixando(false);
    }
  }

  async function handleAbrirArquivo(item) {
    try {
      const url = await obterUrlAssinadaCompra(item?.arquivo_url);
      if (!url) { avisar.alerta('Arquivo não encontrado.'); return; }
      setPreviewArquivo(await criarPreviewCompra({
        title: 'Arquivo do item',
        name: item.arquivo_nome_original || 'Arquivo anexado',
        url
      }));
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao abrir arquivo do item');
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
      if (!payload.length) { avisar.alerta('Selecione ou cadastre ao menos um fornecedor.'); return; }

      const fornecedorSemItens = payload.find((fornecedor) => !Array.isArray(fornecedor.itens) || fornecedor.itens.length === 0);
      if (fornecedorSemItens) {
        const fornecedorSelecionado = fornecedores.find((item) => {
          const fornecedorPayload = fornecedorToCotacaoPayload(item);
          return (
            (fornecedorSemItens.fornecedor_id && Number(fornecedorPayload.fornecedor_id) === Number(fornecedorSemItens.fornecedor_id)) ||
            (fornecedorSemItens.parceiro_id && Number(fornecedorPayload.parceiro_id) === Number(fornecedorSemItens.parceiro_id))
          );
        });
        avisar.alerta(`Selecione ao menos um item para ${fornecedorSelecionado?.nome || fornecedorSemItens.nome || 'cada fornecedor'}.`);
        return;
      }

      setEnviandoFornecedores(true);
      await enviarSolicitacaoCompraParaFornecedores(id, { fornecedores: payload });
      setFornecedoresSelecionados([]);
      setFornecedoresSelecionadosDados({});
      setItensSelecionadosEnvio({});
      setNovoFornecedor({ nome: '', cnpj: '', email: '', whatsapp: '', contato: '' });
      await carregarTudo();
      avisar.sucesso('Links de cotação gerados. Use os botoes de WhatsApp para enviar a mensagem a cada fornecedor.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao enviar para fornecedores');
    } finally {
      setEnviandoFornecedores(false);
    }
  }

  async function handleReabrirCotacao(cotacaoFornecedor) {
    /*
      R26: a cotação-alvo é fixada numa `const` ANTES do `await`. Com
      `window.prompt` a página ficava congelada e nada podia mudar entre a
      pergunta e a ação; o modal do sistema NÃO congela — clicar noutra linha
      com o modal aberto faria a tela perguntar sobre um fornecedor e reabrir
      a cotação de outro.
    */
    const alvo = cotacaoFornecedor;
    const fornecedorNome = alvo?.fornecedor?.nome || 'fornecedor';
    // R21: DESESTRUTURADO. `confirmar()` devolve `{ ok, texto }`, e objeto é
    // sempre truthy — ler `const ok = ...` faria "Cancelar" reabrir a cotação.
    const { ok, texto } = await confirmar({
      titulo: 'Reabrir cotação',
      mensagem: `A cotacao de ${fornecedorNome} volta a aceitar resposta pelo mesmo link.`,
      rotuloConfirmar: 'Reabrir',
      campo: { rotulo: 'Motivo da reabertura', multilinha: true }
    });
    if (!ok) return;

    try {
      setReabrindoCotacaoId(alvo.id);
      await reabrirCotacaoCompra(alvo.id, { motivo: texto });
      await carregarTudo();
      avisar.sucesso('Cotação reaberta. O fornecedor pode responder novamente pelo mesmo link.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao reabrir cotacao');
    } finally {
      setReabrindoCotacaoId(null);
    }
  }

  async function handleCancelarCotacao() {
    const motivo = motivoCancelamentoCotacao.trim();
    if (!motivo) {
      avisar.alerta('Informe o motivo do cancelamento da cotação.');
      return;
    }

    try {
      setCancelandoCotacao(true);
      await cancelarCotacaoSolicitacaoCompra(id, { motivo });
      setModalCancelamentoCotacao(false);
      setMotivoCancelamentoCotacao('');
      await carregarTudo();
      avisar.sucesso('Cotação cancelada. Os links foram bloqueados e a solicitação voltou para liberada para compra.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao cancelar cotacao');
    } finally {
      setCancelandoCotacao(false);
    }
  }

  function abrirRespostaInterna(cotacaoFornecedor) {
    setCotacaoRespostaInterna(cotacaoFornecedor);
    setFormRespostaInterna(montarFormularioRespostaInterna(cotacaoFornecedor, itensCombinados, {
      comparativo,
      alocacoes: solicitacao?.alocacoes || []
    }));
  }

  function abrirNovaOfertaSaldo(cotacaoFornecedor) {
    setCotacaoRespostaInterna(cotacaoFornecedor);
    setFormRespostaInterna(montarFormularioRespostaInterna(cotacaoFornecedor, itensCombinados, {
      novaOfertaSaldo: true,
      comparativo,
      alocacoes: solicitacao?.alocacoes || []
    }));
  }

  function abrirRespostaInternaPorId(cotacaoFornecedorId) {
    const cotacaoFornecedor = (solicitacao?.fornecedores || []).find(
      (item) => Number(item.id) === Number(cotacaoFornecedorId)
    );
    if (!cotacaoFornecedor) {
      avisar.erro('Cotação do fornecedor não encontrada para edição.');
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
      avisar.alerta('Selecione no máximo 10 arquivos por vez.');
      return;
    }

    try {
      setEnviandoArquivosRespostaInterna(true);
      const resposta = await uploadArquivosRespostaInternaCotacao(id, cotacaoRespostaInterna.id, selecionados);
      setCotacaoRespostaInterna((atual) => ({ ...atual, ...(resposta?.cotacao || {}) }));
      await carregarTudo();
      avisar.sucesso(`${selecionados.length} arquivo(s) anexado(s) e registrado(s) na auditoria.`);
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao anexar arquivos na resposta da cotacao');
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
        avisar.alerta('Arquivo não encontrado.');
        return;
      }
      setPreviewArquivo(await criarPreviewCompra({
        title: 'Arquivo da resposta da cotacao',
        name: arquivo?.nome_original || `Arquivo ${index + 1}`,
        url
      }));
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao abrir arquivo da resposta');
    }
  }

  async function handleSalvarRespostaInterna(finalizar) {
    if (!formRespostaInterna || !cotacaoRespostaInterna) return;
    if (finalizar && (
      !formRespostaInterna.condicao_pagamento.trim()
      || !Number.isInteger(Number(formRespostaInterna.prazo_entrega_dias))
      || Number(formRespostaInterna.prazo_entrega_dias) <= 0
    )) {
      avisar.alerta('Informe a condição de pagamento e o prazo de entrega para finalizar a resposta.');
      return;
    }
    const valorFreteInformado = formRespostaInterna.frete_modo === 'POR_ITEM'
      ? formRespostaInterna.itens.reduce((total, item) => total + parseNumeroCompra(item.frete_valor), 0)
      : parseNumeroCompra(formRespostaInterna.frete_valor);
    if (finalizar && formRespostaInterna.frete_tipo !== 'SEM_FRETE' && valorFreteInformado <= 0) {
      avisar.alerta(formRespostaInterna.frete_modo === 'POR_ITEM'
        ? 'Informe o frete de ao menos um item.'
        : 'Informe o valor do frete.');
      return;
    }
    if (finalizar && formRespostaInterna.frete_tipo === 'TERCEIRO' && !formRespostaInterna.frete_data_vencimento) {
      avisar.alerta('Informe a data para pagamento do frete pago a terceiro.');
      return;
    }
    const transportadorErro = getCpfCnpjError(formRespostaInterna.frete_transportador_cpf_cnpj, {
      label: 'CPF/CNPJ do transportador'
    });
    if (transportadorErro) {
      avisar.alerta(transportadorErro);
      return;
    }

    const itemQuantidadeInvalida = formRespostaInterna.itens.find((item) => {
      const quantidade = parseNumeroCompraDigitado(item.quantidade_solicitada);
      return !Number.isFinite(quantidade) || quantidade <= 0;
    });
    if (itemQuantidadeInvalida) {
      avisar.alerta('Quantidade solicitada do item deve ser maior que zero.');
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
        frete_transportador_cpf_cnpj: onlyDigits(formRespostaInterna.frete_transportador_cpf_cnpj) || null,
        observacao_resposta: formRespostaInterna.observacao_resposta,
        nova_oferta_saldo: formRespostaInterna.nova_oferta_saldo === true,
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
      avisar.sucesso(finalizar ? 'Resposta atualizada e registrada na auditoria.' : 'Rascunho salvo e registrado na auditoria.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao editar resposta da cotacao');
    } finally {
      setSalvandoRespostaInterna(false);
    }
  }

  async function handleCriarFornecedorRapido() {
    try {
      if (!String(novoFornecedor.nome || '').trim()) { avisar.alerta('Informe o nome do fornecedor.'); return; }
      if (!String(novoFornecedor.cnpj || '').trim()) { avisar.alerta('Informe o CPF/CNPJ do fornecedor.'); return; }
      const documentoErro = getCpfCnpjError(novoFornecedor.cnpj, {
        required: true,
        label: 'CPF/CNPJ do fornecedor'
      });
      if (documentoErro) { avisar.alerta(documentoErro); return; }
      if (!String(novoFornecedor.whatsapp || '').trim()) { avisar.alerta('Informe o WhatsApp/telefone do fornecedor.'); return; }
      const fornecedor = await criarFornecedorCompra({ ...novoFornecedor, cnpj: onlyDigits(novoFornecedor.cnpj) });
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
      avisar.sucesso('Fornecedor criado e selecionado.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao criar fornecedor');
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
      avisar.alerta('Não existe saldo restante para encerrar sem pedido.');
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
    if (justificativa.length < MINIMO_JUSTIFICATIVA) {
      avisar.alerta(`Informe uma justificativa com pelo menos ${MINIMO_JUSTIFICATIVA} caracteres.`);
      return;
    }
    if (!confirmadoEncerrarSemPedido) {
      avisar.alerta('Confirme que o saldo restante não será comprado.');
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
      avisar.sucesso(`Cotacao encerrada sem gerar novos pedidos. Saldo nao comprado: ${formatNumeroCompra(detalhes.quantidade_nao_comprada)}.`);
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao encerrar cotacao sem gerar pedido');
    } finally {
      setEncerrandoSemPedido(false);
    }
  }

  /*
    O CAMINHO MAIS CARO DA TELA — a cotação virando PEDIDO DE COMPRA.

    Antes desta migração ele encadeava SEIS caixas do navegador:
    confirm → prompt → confirm → prompt → confirm (+ alerts de erro). Duas
    dessas caixas coletavam justificativa OBRIGATÓRIA que vai para a
    AUDITORIA — comprar acima do solicitado e fechamento parcial — sem
    nenhuma validação além de `if (!texto)` depois do fato.

    O que mudou, e por quê:

    1. As duas justificativas passaram a usar `pedirJustificativa`, que
       aplica o MESMO piso do caso menos crítico da tela (10 caracteres +
       marcação de ciência, botão desabilitado até as duas). O que antes se
       checava DEPOIS agora se impede ANTES.
    2. Confirmação e coleta viraram UM passo: o modal já mostra os itens
       excedentes / o saldo que fica aberto e pede a justificativa na mesma
       superfície. Seis caixas viraram, no pior caso, dois modais.
    3. R21 — todo `confirmar()` é DESESTRUTURADO. Este é o handler em que
       ler o objeto como booleano faria "Cancelar" GERAR OS PEDIDOS.
    4. R26 — `alocacoes`, `itensExcedentes`, `fechamentoParcial` e as
       permissões são fixados em `const` ANTES de qualquer `await`, e é
       exatamente esse conjunto que vai para a API. O modal do sistema não
       congela a tela: sem essa fixação, mexer numa quantidade enquanto o
       modal está aberto faria a pessoa autorizar um conjunto e o sistema
       comprar outro — consentimento válido para uma ação que ninguém deu.
  */
  async function handleEncerrar() {
    try {
      const previsaoConfirmada = previsaoEntrega;
      if (!previsaoConfirmada) { avisar.alerta('Informe a previsão de entrega antes de gerar os pedidos.'); return; }
      const itens = comparativo?.itens || [];
      const alocacoes = Object.values(vencedoresSelecionados)
        .filter((entry) => Number(entry?.resposta_item_id) > 0 && parseNumeroCompra(entry?.quantidade_alocada) > 0)
        .map((entry) => ({
          resposta_item_id: Number(entry.resposta_item_id),
          quantidade_alocada: parseNumeroCompra(entry.quantidade_alocada)
        }));
      if (!alocacoes.length) { avisar.alerta('Selecione ao menos um vencedor para encerrar.'); return; }

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
        avisar.erro(
          [
            'A quantidade marcada ultrapassa a disponibilidade informada pelo fornecedor.',
            ...errosDisponibilidadeFornecedor
          ].join(' '),
          'Nao e possivel gerar os pedidos'
        );
        return;
      }

      // R26: tudo o que a confirmação vai AFIRMAR e o que a ação vai USAR
      // é fixado aqui, antes do primeiro `await`.
      const fechamentoParcial = saldoTotalDepois > 0.0001;
      const houveExcedente = itensExcedentes.length > 0;
      let justificativa = '';
      let justificativaExcedente = '';

      if (houveExcedente) {
        /*
          Justificativa de AUDITORIA nº 1 — comprar acima da quantidade
          solicitada. Um passo só: os itens excedentes ficam à vista
          enquanto a pessoa escreve o motivo, com o piso de 10 caracteres
          e a marcação de ciência.
        */
        const { ok, texto } = await pedirJustificativa({
          titulo: 'Comprar acima da quantidade solicitada',
          mensagem: `A compra desta rodada passa do saldo em ${formatNumeroCompra(quantidadeExcedenteTotal)}. A justificativa abaixo fica registrada na auditoria e nao pode ser desfeita.`,
          detalhes: itensExcedentes,
          rotuloCampo: 'Justificativa do excedente',
          placeholder: 'Explique por que a compra passa da quantidade solicitada.',
          rotuloCiencia: 'Confirmo a compra acima da quantidade solicitada e que esta justificativa vai para a auditoria.',
          rotuloConfirmar: 'Registrar e continuar',
          tom: 'warning'
        });
        if (!ok) return;
        justificativaExcedente = texto;
      }

      if (fechamentoParcial) {
        if (!podeFecharParcialCotacao) {
          avisar.alerta('Seu usuário não possui permissão para fechar parcialmente a cotação.');
          return;
        }
        /*
          Justificativa de AUDITORIA nº 2 — fechamento parcial. Mesmo piso.
        */
        const { ok, texto } = await pedirJustificativa({
          titulo: 'Fechar parcialmente a cotação',
          mensagem: 'Nem todo o saldo foi selecionado. Os pedidos marcados são gerados agora e o restante fica aberto para uma próxima rodada.',
          detalhes: [
            `Saldo atual: ${formatNumeroCompra(saldoTotalAntes)}`,
            `Saldo que permanecera aberto: ${formatNumeroCompra(saldoTotalDepois)}`
          ],
          rotuloCampo: 'Justificativa do fechamento parcial',
          placeholder: 'Explique por que a rodada fecha sem consumir todo o saldo.',
          rotuloCiencia: 'Confirmo o fechamento parcial e que esta justificativa vai para a auditoria.',
          rotuloConfirmar: 'Gerar pedidos e manter o saldo',
          tom: 'warning'
        });
        if (!ok) return;
        justificativa = texto;
      } else if (!podeEncerrarCotacao) {
        avisar.alerta('A seleção consome todo o saldo e exige permissão para encerrar definitivamente a cotação.');
        return;
      } else {
        // R21: DESESTRUTURADO. Com `const ok = await confirmar(...)` o objeto
        // seria sempre truthy e "Cancelar" geraria os pedidos finais.
        const { ok } = await confirmar({
          titulo: 'Encerrar a cotação definitivamente',
          mensagem: `Todo o saldo foi selecionado. Os pedidos finais serao gerados para ${alocacoes.length} selecao(oes) e a cotacao sera encerrada. Esta acao nao pode ser desfeita.`,
          rotuloConfirmar: 'Encerrar e gerar pedidos',
          destrutiva: true
        });
        if (!ok) return;
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
          previsao_entrega: previsaoConfirmada,
          justificativa: fechamentoParcial ? justificativa : null,
          fechamento_excedente_confirmado: houveExcedente,
          justificativa_excedente: houveExcedente ? justificativaExcedente : null
        },
        { idempotencyKey: encerramentoIdempotencyRef.current }
      );
      encerramentoIdempotencyRef.current = null;
      await carregarTudo();
      const fechamentoResultado = resultado?.fechamento_resultado || {};
      if (fechamentoResultado.final) {
        avisar.sucesso('Cotação encerrada e pedidos finais gerados. Abrindo a tela de pedidos.');
        navigate('/pedidos-compra');
      } else {
        avisar.sucesso(`Rodada parcial concluida. Os pedidos selecionados foram fechados e o saldo ${formatNumeroCompra(fechamentoResultado.saldo_restante)} permanece aberto.`);
      }
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao encerrar cotacao');
    } finally {
      setEncerrando(false);
    }
  }

  async function handleRecusarSolicitacao() {
    /*
      Eram DUAS caixas do navegador (prompt do motivo + confirm da recusa)
      para uma decisão só. Viraram um passo: a confirmação já carrega o
      campo do motivo (`campo` do useConfirmacao) e diz o que vai acontecer.
      R21: DESESTRUTURADO — objeto é sempre truthy.
    */
    const { ok, texto } = await confirmar({
      titulo: 'Recusar solicitação de compra',
      mensagem: `A solicitacao SC-${String(solicitacao?.id || id).padStart(5, '0')} sai do fluxo de compra. Esta acao nao pode ser desfeita.`,
      rotuloConfirmar: 'Recusar',
      destrutiva: true,
      campo: { rotulo: 'Motivo da recusa', obrigatorio: true, multilinha: true }
    });
    if (!ok) return;

    try {
      await recusarSolicitacaoCompra(id, { motivo: texto });
      await carregarTudo();
      avisar.sucesso('Solicitação de compra recusada.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao recusar solicitacao de compra');
    }
  }

  async function handleRegistrarComentarioCotacao() {
    const comentario = comentarioCotacao.trim();
    if (!comentario) {
      avisar.alerta('Digite o comentário da cotação.');
      return;
    }

    try {
      setRegistrandoComentario(true);
      await comentarSolicitacaoCompra(id, { comentario });
      setComentarioCotacao('');
      await carregarTudo();
      avisar.sucesso('Comentário registrado no histórico da solicitação.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao registrar comentario da cotacao');
    } finally {
      setRegistrandoComentario(false);
    }
  }

  if (loading) {
    return (
      <Container>
        <div className="app-empty-card">Carregando...</div>
      </Container>
    );
  }

  if (!solicitacao) {
    return (
      <Container>
        <Avisos avisos={avisos} aoFechar={fechar} />
        <div className="app-empty-card">
          {erroCarregamento || 'Solicitacao de compra nao encontrada.'}
        </div>
      </Container>
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

  // A faixa tem um dono so: com o modal de resposta interna aberto ela vive
  // dentro dele (senao o aviso ficaria atras do fundo escuro); fora dele, no
  // topo da pagina.
  const faixaAvisos = <Avisos avisos={avisos} aoFechar={fechar} />;
  const codigoSolicitacao = `SC-${String(solicitacao.id).padStart(5, '0')}`;

  return (
    <Container className={embedded ? 'cotacao-gestao-embutida' : 'page-compra-nova cotacao-gestao-page'}>
      {!cotacaoRespostaInterna && faixaAvisos}
      {/*
        R13/C4: cabeçalho FIXO, com o NOME do registro em destaque e o código
        como apoio. R11: a seta de voltar é a affordance primária de retorno
        de uma tela de REGISTRO e fica sempre. C5: um primário sólido
        ("Abrir PDF"), secundárias em contorno, e a destrutiva APARTADA em
        vermelho suave — não mais pintada com `text-red-700` à mão.
        R11/C6: "Lista de cotacoes" era NAVEGAÇÃO vestida de ação na barra;
        ela sai daqui — o menu, o breadcrumb e o Ctrl+K resolvem, e a seta de
        voltar já devolve ao detalhe desta solicitação.
      */}
      {!embedded && <PageHeader
        titulo={isAvulsa ? (solicitacao.titulo || 'Cotacao Avulsa') : 'Gestao da Cotacao'}
        contagem={codigoSolicitacao}
        descricao={[
          isAvulsa ? 'Cotacao Avulsa' : 'fornecedores, links, respostas e comparativo',
          solicitacao.obra?.nome || null
        ].filter(Boolean).join(' · ')}
        voltar={{ onClick: () => navigate(`/solicitacoes-compra/${id}`), title: 'Voltar ao detalhe da solicitacao' }}
        acaoPrincipal={{
          rotulo: baixando ? 'Abrindo...' : 'Abrir PDF',
          onClick: handleAbrirPdf,
          desabilitada: baixando
        }}
        /*
          DUAS DESTRUTIVAS, LADO A LADO (07/09). "Cancelar cotação" estava no
          menu "⋯" marcada como `perigosa` — o menu a apartava com separador
          e cor de perigo. O menu saiu do sistema, e o lugar de um item
          perigoso na faixa é o grupo APARTADO, não a fila das secundárias:
          por isso o `destrutiva` passou a aceitar lista. As duas continuam
          em vermelho suave, juntas e separadas do resto por `margin-left:
          auto`.
        */
        destrutiva={[
          podeOperarFluxo ? { rotulo: 'Recusar', onClick: handleRecusarSolicitacao } : null,
          podeExibirCancelamentoCotacao
            ? { rotulo: 'Cancelar cotação', onClick: () => setModalCancelamentoCotacao(true) }
            : null
        ].filter(Boolean)}
      />}
      {embedded && <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[var(--c-border)] pb-3">
        <span className="mr-auto text-sm font-semibold">Gestão da cotação · {codigoSolicitacao}</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={handleAbrirPdf} disabled={baixando}>
          {baixando ? 'Abrindo...' : 'Abrir PDF'}
        </button>
        {podeOperarFluxo && <button type="button" className="btn btn-outline btn-sm" onClick={handleRecusarSolicitacao}>Recusar</button>}
        {podeExibirCancelamentoCotacao && <button type="button" className="btn btn-danger btn-sm"
          onClick={() => setModalCancelamentoCotacao(true)}>Cancelar cotação</button>}
      </div>}

      {/*
        C2 × B3: a faixa fica com o TOTAL; estes chips carregam o RECORTE
        (status do fluxo, quantos fornecedores, quantos itens) — cada número
        responde a uma pergunta diferente.
      */}
      <BlocoConteudo>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <PilulaStatus status={solicitacao.status} />
          <Etiqueta>{solicitacao.fornecedores?.length || 0} fornecedor(es)</Etiqueta>
          <Etiqueta>{itensCombinados.length} item(ns)</Etiqueta>
          {solicitacao.necessario_para && (
            <Etiqueta>Necessario para {fmt(solicitacao.necessario_para)}</Etiqueta>
          )}
        </div>
      </BlocoConteudo>

      {podeOperarFluxo && (
        <BlocoConteudo
          titulo="Comentário da cotação"
          recolhivel={embedded}
          variante="secundario"
          descricao="Registre alinhamentos com compras; o texto também alimenta o histórico da solicitação da obra."
        >
          <div className="grid gap-3 md:grid-cols-2 md:items-end">
            <textarea
              className="input"
              rows={3}
              aria-label="Comentário da cotação"
              value={comentarioCotacao}
              onChange={(event) => setComentarioCotacao(event.target.value)}
              placeholder="Ex.: fornecedor pediu prazo adicional, compra dividida por quantidade, ajuste combinado..."
            />
            <div className="app-page-actions justify-end">
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
        </BlocoConteudo>
      )}

      {/* Fornecedores vinculados + envio */}
      {/*
        ESTE E O BLOCO PRINCIPAL DA TELA (B2, 05/09).

        A tela tinha um `variante="primario"`, mas dentro do MODAL do
        comparativo — e o check descarta o que esta em modal, com razao: o
        que a pessoa ve ao abrir a tela nao pode depender de ela ter aberto
        alguma coisa. Na pagina sobravam so blocos secundarios, ou seja,
        nenhum assumia a resposta central. E a resposta central desta tela e
        esta: quem foi convidado a cotar e por qual link.
      */}
      <BlocoConteudo
        titulo="Fornecedores e links de cotação"
        recolhivel={embedded}
        variante="primario"
        cor="var(--module-compras)"
        contagem={`${solicitacao.fornecedores?.length || 0} vinculado(s)`}
        descricao="Pesquise fornecedores cadastrados, faca cadastro rápido e gere os links do portal."
      >
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

            {/* Lista de fornecedores vinculados */}
            {solicitacao.fornecedores?.length > 0 && (
              <div className="mt-4 min-w-0 max-w-full">
                <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Cotações enviadas</h3>
                <TabelaPadrao
                  colunas={[
                    {
                      id: 'nome',
                      titulo: 'Nome',
                      // R17: o fornecedor e quem nomeia a cotacao enviada.
                      tipo: 'identidade',
                      noCard: 'titulo',
                      ordenavel: true,
                      valorOrdenacao: (cf) => cf.fornecedor?.nome || '',
                      render: (cf) => {
                        const pedidoFornecedor = pedidosPorFornecedor.get(Number(cf.fornecedor_compra_id));
                        const possuiRespostaArquivo = Boolean(
                          cf.pdf_resposta_url || cf.arquivo_resposta_url || cf.arquivos_resposta?.length
                        );
                        return (
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate font-semibold" style={{ color: 'var(--c-text)' }}>
                                {cf.fornecedor?.nome || '-'}
                              </span>
                              {possuiRespostaArquivo && (
                                <Etiqueta tom="info" className="shrink-0">Arquivo</Etiqueta>
                              )}
                            </div>
                            {/*
                              Link para o REGISTRO RELACIONADO fica NO CORPO,
                              junto do dado que o origina (decisão de 04/09) —
                              nunca na barra de ações. R10: era `text-[10px]`.
                            */}
                            {pedidoFornecedor?.id && (
                              <button
                                type="button"
                                className="block max-w-full truncate text-left text-xs font-semibold underline"
                                style={{ color: 'var(--sem-success)' }}
                                onClick={() => navigate(`/pedidos-compra/${pedidoFornecedor.id}`)}
                                title={`PC-${String(pedidoFornecedor.id).padStart(5, '0')} - ${fmtMoeda(pedidoFornecedor.valor_total)}`}
                              >
                                PC-{String(pedidoFornecedor.id).padStart(5, '0')} - {fmtMoeda(pedidoFornecedor.valor_total)}
                              </button>
                            )}
                          </div>
                        );
                      }
                    },
                    {
                      id: 'telefone',
                      titulo: 'Telefone',
                      tipo: 'texto',
                      render: (cf) => (
                        <span className="block truncate" title={cf.fornecedor?.whatsapp || '-'}>
                          {cf.fornecedor?.whatsapp || '-'}
                        </span>
                      )
                    },
                    {
                      id: 'email',
                      titulo: 'E-mail',
                      tipo: 'texto',
                      render: (cf) => (
                        <span className="block truncate" title={cf.fornecedor?.email || '-'}>
                          {cf.fornecedor?.email || '-'}
                        </span>
                      )
                    },
                    {
                      id: 'status',
                      titulo: 'Status',
                      tipo: 'status',
                      render: (cf) => <PilulaStatus status={cf.status} />
                    },
                    {
                      id: 'respondido_em',
                      titulo: 'Respondido em',
                      tipo: 'data',
                      ordenavel: true,
                      ordemInicial: 'desc',
                      valorOrdenacao: (cf) => cf.respondido_em || '',
                      render: (cf) => fmt(cf.respondido_em)
                    }
                  ]}
                  itens={solicitacao.fornecedores}
                  getId={(cf) => cf.id}
                  storageKey="tabela:gerenciar-cotacao:fornecedores"
                  rotuloRolagem="Cotações enviadas"
                  vazio="Nenhuma cotação enviada."
                  larguraAcoes={320}
                  acoesLinha={(cotacaoFornecedor) => {
                    const publicUrl = `${window.location.origin}/cotacao/${cotacaoFornecedor.token}`;
                    const pdfUrl = obterUrlPdfCotacaoPublica(cotacaoFornecedor.token);
                    const pedidoFornecedor = pedidosPorFornecedor.get(Number(cotacaoFornecedor.fornecedor_compra_id));
                    const statusFornecedor = String(cotacaoFornecedor.status || '').toUpperCase();
                    const cotacaoCancelada = ['CANCELADA', 'CANCELADO'].includes(statusFornecedor);
                    const podeEditarResposta = podeEditarRespostas && !cotacaoCancelada;
                    const possuiSaldoParaNovaOferta = (comparativo?.itens || []).some((item) => (
                      parseNumeroCompra(item?.saldo_disponivel) > 0.0001
                      && (item?.respostas || []).some(
                        (resposta) => Number(resposta?.cotacao_fornecedor_id) === Number(cotacaoFornecedor.id)
                      )
                    ));
                    const podeRegistrarNovaOferta = podeEditarResposta
                      && statusSolicitacao === 'fechamento_parcial'
                      && Boolean(pedidoFornecedor?.id)
                      && possuiSaldoParaNovaOferta;
                    const podeReabrirCotacao = podeReabrirCotacaoFornecedor && ['RESPONDIDO', 'RASCUNHO'].includes(statusFornecedor)
                      && !fluxoTerminal;
                    const linkWa = cotacaoFornecedor.fornecedor?.whatsapp
                      ? whatsappLink(
                          cotacaoFornecedor.fornecedor.whatsapp,
                          gerarMensagemCotacao(cotacaoFornecedor.fornecedor.nome, publicUrl, itensCombinados, pdfUrl)
                        )
                      : null;
                    return (
                      <>
                        <CotacaoActionButton
                          type="button"
                          onClick={async () => {
                            const copiou = await copiarTexto(publicUrl);
                            // Retorno trivial de clipboard: nada foi gravado, o botao ja diz o que aconteceu.
                            if (copiou) avisar.sucesso('Link da cotação copiado.', undefined, { efemero: true });
                            else avisar.erro('Não foi possível copiar o link automaticamente.');
                          }}
                          title="Copiar link"
                          aria-label="Copiar link"
                        >
                          <HiOutlineClipboardDocument />
                        </CotacaoActionButton>
                        <CotacaoActionButton
                          type="button"
                          onClick={() => window.open(publicUrl, '_blank', 'noopener,noreferrer')}
                          title="Abrir portal"
                          aria-label="Abrir portal"
                        >
                          <HiOutlineArrowTopRightOnSquare />
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
                          <HiOutlineArrowDownTray />
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
                            <HiOutlineChatBubbleLeftRight />
                          </CotacaoActionButton>
                        ) : (
                          <CotacaoActionButton type="button" disabled title="WhatsApp indisponível" aria-label="WhatsApp indisponível">
                            <HiOutlineChatBubbleLeftRight />
                          </CotacaoActionButton>
                        )}
                        <CotacaoActionButton
                          type="button"
                          onClick={() => abrirRespostaInterna(cotacaoFornecedor)}
                          disabled={!podeEditarResposta}
                          title={podeEditarResposta ? 'Editar resposta internamente' : 'Edicao indisponivel'}
                          aria-label="Editar resposta internamente"
                        >
                          <HiOutlinePencilSquare />
                        </CotacaoActionButton>
                        <CotacaoActionButton
                          type="button"
                          onClick={() => abrirNovaOfertaSaldo(cotacaoFornecedor)}
                          disabled={!podeRegistrarNovaOferta}
                          title={podeRegistrarNovaOferta
                            ? 'Registrar novo preco e prazo deste fornecedor para o saldo'
                            : 'Nova oferta disponivel apos um fechamento parcial com este fornecedor'}
                          aria-label="Registrar nova oferta para o saldo"
                          style={podeRegistrarNovaOferta ? estiloTom('info') : undefined}
                        >
                          <HiOutlinePlusCircle />
                        </CotacaoActionButton>
                        <CotacaoActionButton
                          type="button"
                          onClick={() => handleReabrirCotacao(cotacaoFornecedor)}
                          disabled={!podeReabrirCotacao || reabrindoCotacaoId === cotacaoFornecedor.id}
                          title={podeReabrirCotacao ? 'Reabrir cotacao' : 'Reabertura indisponivel'}
                          aria-label="Reabrir cotação"
                        >
                          <HiOutlineArrowPath className={reabrindoCotacaoId === cotacaoFornecedor.id ? 'animate-spin' : undefined} />
                        </CotacaoActionButton>
                      </>
                    );
                  }}
                />
              </div>
            )}
      </BlocoConteudo>

      {/*
        Histórico/auditoria por último e RECOLHIDO (regra 1 de organização):
        dado que gera ação vem primeiro; registro fica ao alcance, não à
        frente. O bloco só existe quando há registro.
      */}
      {Array.isArray(solicitacao.logs) && solicitacao.logs.some((log) => log.tipo_acao === 'RESPOSTA_INTERNA_COMPRAS') && (
        <BlocoConteudo
          titulo="Auditoria de respostas internas"
          variante="secundario"
          recolhivel
          recolhidoPadrao
          contagem={`${solicitacao.logs.filter((log) => log.tipo_acao === 'RESPOSTA_INTERNA_COMPRAS').length} registro(s)`}
        >
          <div className="app-list-stack">
            {solicitacao.logs
              .filter((log) => log.tipo_acao === 'RESPOSTA_INTERNA_COMPRAS')
              .map((log) => (
                <div key={log.id} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--c-border)' }}>
                  <div className="font-semibold" style={{ color: 'var(--c-text)' }}>
                    {log.usuario?.nome || 'Usuario interno'} respondeu pelo fornecedor {log.fornecedor?.nome || '-'}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
                    {fmt(log.createdAt)} - {log.descricao}
                  </div>
                </div>
              ))}
          </div>
        </BlocoConteudo>
      )}

      {/* Comparativo */}
      {podeOperarFluxo && !fluxoTerminal && <label className="block text-sm">
        Previsão de entrega dos novos pedidos
        <input type="date" className="input ml-2 w-auto max-w-full" value={previsaoEntrega}
          disabled={encerrando} onChange={(e) => setPrevisaoEntrega(e.target.value)} />
        <span className="mt-1 block text-xs text-[var(--c-muted)]">Confirme com o fornecedor. Depois, Compras poderá reprogramar o saldo de cada item no detalhe da solicitação.</span>
      </label>}
      <SecaoComparativo
        embedded={embedded}
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

      {/* CompraPreviewModal e de outro agente: a chamada fica intacta. */}
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
        faixaAvisos={faixaAvisos}
        onFechar={() => {
          if (salvandoRespostaInterna || enviandoArquivosRespostaInterna) return;
          setCotacaoRespostaInterna(null);
          setFormRespostaInterna(null);
        }}
      />
      {modalCancelamentoCotacao && (
        <ModalPortal onClose={() => setModalCancelamentoCotacao(false)} closeOnEscape={!cancelandoCotacao}>
          <div className="app-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="cancelar-cotacao-titulo">
            <div className="app-modal-surface app-modal-surface--compact p-4">
            <h2 id="cancelar-cotacao-titulo" className="text-lg font-semibold" style={{ color: 'var(--c-text)' }}>Cancelar cotação</h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--c-muted)' }}>
              Os links serão bloqueados, as respostas deixarao de participar do comparativo e a solicitação voltará para liberada para compra. O histórico será preservado.
            </p>
            <FormSecao colunas={2}>
              <CampoForm label="Motivo do cancelamento" obrigatorio tipo="observacao">
                <textarea
                  className="input"
                  rows={4}
                  value={motivoCancelamentoCotacao}
                  onChange={(event) => setMotivoCancelamentoCotacao(event.target.value)}
                  placeholder="Explique por que a cotação esta sendo cancelada."
                />
              </CampoForm>
            </FormSecao>
            <div className="app-page-actions justify-end">
              <button type="button" className="btn btn-outline" onClick={() => setModalCancelamentoCotacao(false)} disabled={cancelandoCotacao}>Voltar</button>
              <button type="button" className="btn btn-danger" onClick={handleCancelarCotacao} disabled={cancelandoCotacao || !motivoCancelamentoCotacao.trim()}>
                {cancelandoCotacao ? 'Cancelando...' : 'Confirmar cancelamento'}
              </button>
            </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* R21: os dois modais que substituem as caixas do navegador. */}
      {elementoConfirmacao}
      {elementoJustificativa}
    </Container>
  );
}
