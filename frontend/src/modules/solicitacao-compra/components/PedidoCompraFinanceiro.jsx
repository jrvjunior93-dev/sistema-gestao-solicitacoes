import useVisualizadorArquivo from '../../../hooks/useVisualizadorArquivo';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import DateInputBR from '../../../components/DateInputBR';
import { BlocoConteudo, CampoForm, FormSecao, useConfirmacao } from '../../../components/padrao';
import TitulosCompartilhadosModal from '../../../components/financeiro/TitulosCompartilhadosModal';
import ParceiroBuscaRemota from '../../../components/solicitacoes/ParceiroBuscaRemota';
import {
  adotarFinanceiroPedidoCompra,
  atualizarStatusPedidoCompra,
  criarPrevisoesPedidoCompra,
  decidirReaberturaPedidoCompra,
  obterUrlAssinadaCompra,
  reparcelarPrevisoesPedidoCompra,
  removerArquivoDocumentoPedidoCompra,
  uploadAnexoTemporarioCompra
} from '../../../services/compras';
import {
  canAccessFinanceiro,
  canAlterarStatusComprasPedidos,
  canAnexarDocumentoPedidoCompraFinanceiro,
  canDeleteSolicitacaoAnexo,
  canAprovarReaberturaPedidoCompraFinanceiro,
  canGerarPrevisaoPedidoCompraFinanceiro,
  canViewPedidoCompraFinanceiro
} from '../../../utils/acessoProduto';
import { formaPagamentoEhBoleto, formaPagamentoEhPix, tokensFormaPagamento } from '../../../utils/formaPagamento';
import { PIX_TEXTO_MAX } from '../../../utils/pix';
import OverlayModal from '../../../components/ui/OverlayModal';
import VinculosNfe from '../../fiscal/components/VinculosNfe';

const STATUS_LABEL = {
  NAO_INICIADO: 'Não iniciado', AGUARDANDO_GEO: 'Legado aguardando revisão',
  AGUARDANDO_PREVISAO: 'Aguardando títulos de Compras', PREVISAO_CRIADA: 'Previsões legadas criadas',
  PARCIALMENTE_LIBERADO: 'Parcialmente liberado', LIBERADO_FINANCEIRO: 'Títulos criados',
  PAGO_PARCIALMENTE: 'Pago parcialmente', CONCLUIDO: 'Concluído',
  LEGADO_PENDENTE_REVISAO: 'Legado pendente de revisão', CORRECAO_SOLICITADA: 'Reabertura solicitada',
  NAO_GERA_TITULO: 'Não gera título', CANCELADO: 'Cancelado'
};

const TIPO_DOCUMENTO_LABEL = {
  NOTA_FISCAL: 'Nota fiscal', COMPROVANTE_COMPRA: 'Comprovante de compra',
  OUTRA_CONFIRMACAO: 'Outra comprovação', BOLETO_COMPRA: 'Boleto da compra', BOLETO_FRETE: 'Boleto do frete'
};

function moeda(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function valorInput(value) { return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function numeroMoeda(value) {
  const texto = String(value ?? '').replace(/[^\d,.-]/g, '');
  return texto ? (Number(texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto) || 0) : 0;
}
function formatarData(value) {
  if (!value) return '-';
  const [ano, mes, dia] = String(value).slice(0, 10).split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : value;
}
function hojeLocal() {
  const data = new Date();
  data.setMinutes(data.getMinutes() - data.getTimezoneOffset());
  return data.toISOString().slice(0, 10);
}
function adicionarMeses(dataIso, quantidade) {
  const [ano, mes, dia] = String(dataIso || hojeLocal()).split('-').map(Number);
  const data = new Date(ano, (mes || 1) - 1 + quantidade, 1);
  data.setDate(Math.min(dia || 1, new Date(data.getFullYear(), data.getMonth() + 1, 0).getDate()));
  return new Date(data.getTime() - data.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function gerarParcelas(valorTotal, quantidade, primeiroVencimento) {
  const totalCentavos = Math.round(Number(valorTotal || 0) * 100);
  const qtd = Math.min(Math.max(Number(quantidade || 1), 1), 120);
  const base = Math.floor(totalCentavos / qtd);
  const sobra = totalCentavos - base * qtd;
  return Array.from({ length: qtd }, (_, index) => ({
    valor: valorInput((base + (index < sobra ? 1 : 0)) / 100),
    data_vencimento: adicionarMeses(primeiroVencimento, index)
  }));
}
function criarConfigPagamento(valorTotal, credor, primeiroVencimento = hojeLocal()) {
  const vencimento = primeiroVencimento || hojeLocal();
  return {
    forma_pagamento_id: '', favorecido: credor || null, chave_pix: '', dados_pagamento: '', boletos: [],
    cartao_id: '', data_compra: hojeLocal(),
    quantidade_parcelas: 1, primeiro_vencimento: vencimento, parcelas: gerarParcelas(valorTotal, 1, vencimento)
  };
}
function somaParcelas(config) {
  return (config?.parcelas || []).reduce((total, parcela) => total + numeroMoeda(parcela.valor), 0);
}

function formaEhCartao(forma) {
  return Boolean(forma?.exige_cartao || forma?.gera_fatura || tokensFormaPagamento(forma).includes('CARTAO'));
}
function cartoesDaForma(forma, cartoes) {
  const tokens = tokensFormaPagamento(forma);
  const tipo = tokens.includes('DEBITO') ? 'DEBITO'
    : tokens.includes('CREDITO') || forma?.gera_fatura ? 'CREDITO' : null;
  return (cartoes || []).filter(cartao => cartao.ativo !== false
    && (!tipo || String(cartao.tipo || 'CREDITO').toUpperCase() === tipo));
}

function PagamentoTituloFields({ titulo, descricao, valorTotal, config, onChange, formas, cartoes, avisar }) {
  const forma = formas.find((item) => String(item.id) === String(config.forma_pagamento_id)) || null;
  const pix = formaPagamentoEhPix(forma);
  const boleto = formaPagamentoEhBoleto(forma);
  const cartao = formaEhCartao(forma);
  const cartoesDisponiveis = cartoesDaForma(forma, cartoes);
  const outros = tokensFormaPagamento(forma).includes('OUTROS');
  const soma = somaParcelas(config);

  function alterarQuantidade(value) {
    let quantidade = Math.min(Math.max(Number(value || 1), 1), 120);
    if (quantidade > 1 && forma?.permite_parcelamento === false && !pix && !outros) {
      quantidade = 1;
      avisar.alerta('A forma selecionada não permite parcelamento.');
    }
    onChange({ ...config, quantidade_parcelas: quantidade, parcelas: gerarParcelas(valorTotal, quantidade, config.primeiro_vencimento) });
  }
  function alterarPrimeiroVencimento(value) {
    onChange({ ...config, primeiro_vencimento: value, parcelas: gerarParcelas(valorTotal, config.quantidade_parcelas, value) });
  }
  function alterarParcela(index, campo, value) {
    onChange({ ...config, parcelas: config.parcelas.map((parcela, posicao) => posicao === index ? { ...parcela, [campo]: value } : parcela) });
  }

  return (
    <section className="mt-4 border-t border-[var(--c-border)] pt-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h4 className="font-semibold text-[var(--c-text)]">{titulo}</h4><p className="mt-1 text-sm text-[var(--c-muted)]">{descricao}</p></div>
        <strong className="text-sm text-[var(--c-text)]">{moeda(valorTotal)}</strong>
      </div>
      <div className="mt-3">
        <FormSecao colunas={3}>
          <CampoForm label="Forma de pagamento negociada" obrigatorio>
            <select className="input w-full" value={config.forma_pagamento_id} onChange={(event) => onChange({
              ...config, forma_pagamento_id: event.target.value, chave_pix: '', dados_pagamento: '', boletos: [], cartao_id: '',
              quantidade_parcelas: 1, parcelas: gerarParcelas(valorTotal, 1, config.primeiro_vencimento)
            })}>
              <option value="">Selecione</option>{formas.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
            </select>
          </CampoForm>
          <CampoForm label="Quantidade de parcelas" obrigatorio>
            <input className="input w-full" type="number" min="1" max="120" value={config.quantidade_parcelas} onChange={(event) => alterarQuantidade(event.target.value)} />
          </CampoForm>
          <CampoForm label="Primeiro vencimento" obrigatorio>
            <DateInputBR className="input w-full" value={config.primeiro_vencimento} onChange={(event) => alterarPrimeiroVencimento(event.target.value)} />
          </CampoForm>
          <div style={{ gridColumn: '1 / -1' }}>
            <ParceiroBuscaRemota label="Favorecido" selecionado={config.favorecido} obrigatorio onSelecionar={(favorecido) => onChange({ ...config, favorecido })} />
          </div>
          {pix ? <CampoForm label="Chave PIX" obrigatorio><input className="input w-full" maxLength={PIX_TEXTO_MAX} value={config.chave_pix} onChange={(event) => onChange({ ...config, chave_pix: event.target.value })} placeholder="Informe a chave PIX negociada" /></CampoForm> : null}
          {cartao ? <>
            <CampoForm label="Cartão utilizado" obrigatorio hint={!cartoesDisponiveis.length ? 'Nenhum cartão ativo compatível. Confira o cadastro no Financeiro.' : undefined}>
              <select className="input w-full" aria-label="Cartão utilizado" value={config.cartao_id} onChange={event => onChange({ ...config, cartao_id: event.target.value })}>
                <option value="">Selecione</option>{cartoesDisponiveis.map(item => <option key={item.id} value={item.id}>{item.nome}{item.ultimos_digitos ? ` · final ${item.ultimos_digitos}` : ''}</option>)}
              </select>
            </CampoForm>
            <CampoForm label="Data da compra" obrigatorio hint={forma.gera_fatura ? 'A compra será registrada como paga pelo cartão; as parcelas e vencimentos finais seguem as faturas calculadas pelo fechamento do cartão.' : 'O débito será registrado na conta vinculada ao cartão.'}>
              <DateInputBR className="input w-full" aria-label="Data da compra" value={config.data_compra} onChange={event => onChange({ ...config, data_compra: event.target.value })} />
            </CampoForm>
          </> : null}
          {forma && !pix && !boleto && !cartao ? <div style={{ gridColumn: '1 / -1' }}><CampoForm label="Dados para pagamento" obrigatorio><textarea className="input min-h-20 w-full" value={config.dados_pagamento} onChange={(event) => onChange({ ...config, dados_pagamento: event.target.value })} placeholder="Informe banco, agência, conta ou demais orientações para pagamento." /></CampoForm></div> : null}
          {boleto ? <div style={{ gridColumn: '1 / -1' }}>
            <CampoForm label="Boletos" hint="Opcional na criação dos títulos. É possível selecionar mais de um arquivo.">
              <input className="input w-full" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(event) => onChange({ ...config, boletos: [...config.boletos, ...Array.from(event.target.files || [])] })} />
            </CampoForm>
            {config.boletos.length ? <div className="mt-2 flex flex-wrap gap-2">{config.boletos.map((arquivo, index) => (
              <span key={`${arquivo.name}-${arquivo.size}-${index}`} className="inline-flex items-center gap-2 rounded-full border border-[var(--c-border)] px-3 py-1 text-xs">
                {arquivo.name}<button type="button" className="font-semibold text-[var(--sem-danger)]" onClick={() => onChange({ ...config, boletos: config.boletos.filter((_, posicao) => posicao !== index) })} aria-label={`Remover ${arquivo.name}`}>×</button>
              </span>
            ))}</div> : null}
          </div> : null}
        </FormSecao>
      </div>
      <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--c-border)]">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-[var(--c-surface-2)] text-left"><tr><th className="p-3">Parcela</th><th className="p-3">Valor</th><th className="p-3">Vencimento</th></tr></thead>
          <tbody>{config.parcelas.map((parcela, index) => <tr key={index} className="border-t border-[var(--c-border)]">
            <td className="p-3 font-semibold">{index + 1}/{config.parcelas.length}</td>
            <td className="p-3"><input className="input w-full" value={parcela.valor} onChange={(event) => alterarParcela(index, 'valor', event.target.value)} onBlur={(event) => alterarParcela(index, 'valor', valorInput(numeroMoeda(event.target.value)))} /></td>
            <td className="p-3"><DateInputBR className="input w-full" value={parcela.data_vencimento} onChange={(event) => alterarParcela(index, 'data_vencimento', event.target.value)} /></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className={`mt-2 text-right text-sm font-semibold ${Math.abs(soma - valorTotal) < 0.01 ? 'text-[var(--sem-success)]' : 'text-[var(--sem-danger)]'}`}>
        Informado: {moeda(soma)} · Diferença: {moeda(valorTotal - soma)}
      </div>
    </section>
  );
}

export default function PedidoCompraFinanceiro({ pedido, user, avisar, onAtualizar, onProcessando }) {
  const { abrirPreview, modalPreview } = useVisualizadorArquivo();
  const financeiro = pedido?.financeiro || null;
  const podeVer = canViewPedidoCompraFinanceiro(user);
  const podePrever = canGerarPrevisaoPedidoCompraFinanceiro(user);
  const podeAnexar = canAnexarDocumentoPedidoCompraFinanceiro(user);
  const podeRemoverArquivo = podeAnexar && canDeleteSolicitacaoAnexo(user);
  const podeDecidirReabertura = canAprovarReaberturaPedidoCompraFinanceiro(user);
  const podeAbrirTituloFinanceiro = canAccessFinanceiro(user);
  const totalPedido = Number(pedido?.valor_total_fornecedor ?? pedido?.valor_total ?? 0);
  const credorPedido = pedido?.fornecedor?.parceiro_id ? { id: pedido.fornecedor.parceiro_id, nome: pedido.fornecedor.nome } : null;
  const fretesPendentes = useMemo(() => (pedido?.fretes || []).filter((frete) => String(frete.tipo || '').toUpperCase() === 'TERCEIRO' && String(frete.status_financeiro || '').toUpperCase() === 'PENDENTE_TITULO'), [pedido?.fretes]);
  // Atualizar somente documentos nao deve apagar o pagamento em preenchimento.
  const fretesPagamentoKey = JSON.stringify(fretesPendentes.map(frete => [frete.id, frete.parceiro_id,
    frete.parceiro?.nome, frete.fornecedor?.nome, frete.valor_total, frete.data_vencimento]));
  const [processando, setProcessando] = useState('');
  const [loteAberto, setLoteAberto] = useState(false);
  const processandoRef = useRef(false);
  const arquivoInputRef = useRef(null);
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [categoriaId, setCategoriaId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [pagamento, setPagamento] = useState(() => criarConfigPagamento(totalPedido, credorPedido));
  const [pagamentosFrete, setPagamentosFrete] = useState({});
  const [editandoParcelas, setEditandoParcelas] = useState(false);
  const [criandoNovos, setCriandoNovos] = useState(false);
  const chaveCriacaoRef = useRef(null);
  const [documento, setDocumento] = useState({ tipo: 'NOTA_FISCAL', numero_documento: '', observacoes: '' });
  const [arquivo, setArquivo] = useState(null);
  const [motivoDecisao, setMotivoDecisao] = useState('');
  const [remocao, setRemocao] = useState(null);

  useEffect(() => { setRemocao(null); }, [pedido?.id]);

  useEffect(() => {
    setPagamento(criarConfigPagamento(totalPedido, credorPedido));
    setPagamentosFrete(Object.fromEntries(fretesPendentes.map((frete) => {
      const credor = frete.parceiro_id ? { id: frete.parceiro_id, nome: frete.parceiro?.nome || frete.fornecedor?.nome || `Credor do frete #${frete.id}` } : null;
      return [frete.id, criarConfigPagamento(Number(frete.valor_total), credor, frete.data_vencimento || hojeLocal())];
    })));
    setDescricao(`Pedido PC-${String(pedido?.id || '').padStart(5, '0')} - ${pedido?.fornecedor?.nome || 'Fornecedor'}`);
    setEditandoParcelas(false);
    setCriandoNovos(false); chaveCriacaoRef.current = null;
  }, [pedido?.id, pedido?.fornecedor?.nome, pedido?.fornecedor?.parceiro_id, totalPedido, fretesPagamentoKey]);

  useEffect(() => {
    if (financeiro?.opcoes?.categoria_padrao_id) setCategoriaId(String(financeiro.opcoes.categoria_padrao_id));
  }, [pedido?.id, financeiro?.opcoes?.categoria_padrao_id]);

  const titulos = financeiro?.titulos || [];
  const previsoes = titulos.filter((item) => String(item.titulo?.status || '').toUpperCase() === 'PREVISAO');
  const titulosAtivos = titulos.filter((item) => !['CANCELADO', 'ESTORNADO'].includes(String(item.titulo?.status || '').toUpperCase()));
  const pedidoFechado = ['FECHADO_FORNECEDOR', 'ENCERRADO'].includes(String(pedido?.status || '').toUpperCase());
  const idsFreteTerceiro = new Set((pedido?.fretes || []).filter(f => f.tipo === 'TERCEIRO').map(f => Number(f.titulo_financeiro_id)));
  const titulosCompraAtivos = titulosAtivos.filter(item => item.origem !== 'FRETE_TERCEIRO' && !idsFreteTerceiro.has(Number(item.titulo?.id)));
  const podeCriarPrevisao = podePrever && !financeiro?.legado && pedidoFechado;
  const podeCriarCompartilhado = podePrever && !financeiro?.legado && pedidoFechado
    && !titulosAtivos.some(item => item.origem !== 'FRETE_TERCEIRO' && !idsFreteTerceiro.has(Number(item.titulo?.id)));
  const podeReparcelarPrevisao = podePrever && !financeiro?.legado && pedidoFechado && previsoes.length > 0 && previsoes.length === titulosAtivos.length;
  const exibirFormularioParcelas = (podeCriarPrevisao && (!titulosCompraAtivos.length || criandoNovos)) || (podeReparcelarPrevisao && editandoParcelas);
  const reabertura = financeiro?.reabertura;
  const formasPagamento = financeiro?.opcoes?.formas_pagamento || [];
  const cartoesPagamento = financeiro?.opcoes?.cartoes || [];
  if (!podeVer || !financeiro) return null;

  async function executar(chave, acao, sucesso) {
    if (processandoRef.current) return;
    processandoRef.current = true; onProcessando?.(true);
    try { setProcessando(chave); await acao(); avisar.sucesso(sucesso); await onAtualizar?.(); }
    catch (error) { console.error(error); avisar.erro(error.message || 'Não foi possível concluir a operação financeira do pedido.'); }
    finally { processandoRef.current = false; onProcessando?.(false); setProcessando(''); }
  }

  async function removerArquivo() {
    if (!remocao || !podeRemoverArquivo) return;
    const alvo = remocao;
    await executar(`remover-${alvo.id}`, async () => {
      await removerArquivoDocumentoPedidoCompra(pedido.id, alvo.id);
      setRemocao(null);
    }, 'Anexo removido do pedido. Títulos e pagamentos preservados.');
  }

  function validarConfiguracao(config, valorTotal, contexto) {
    const forma = formasPagamento.find((item) => String(item.id) === String(config?.forma_pagamento_id));
    if (!forma) return `Selecione a forma de pagamento de ${contexto}.`;
    if (!config?.favorecido?.id) return `Selecione o favorecido de ${contexto}.`;
    if (!config.parcelas.length || config.parcelas.some((parcela) => numeroMoeda(parcela.valor) <= 0 || !parcela.data_vencimento)) return `Informe valor e vencimento válidos em todas as parcelas de ${contexto}.`;
    if (Math.abs(somaParcelas(config) - valorTotal) >= 0.01) return `A soma das parcelas de ${contexto} precisa ser igual a ${moeda(valorTotal)}.`;
    if (formaPagamentoEhPix(forma) && !config.chave_pix.trim()) return `Informe a chave PIX de ${contexto}.`;
    if (formaEhCartao(forma)) {
      if (!cartoesDaForma(forma, cartoesPagamento).some(item => String(item.id) === String(config.cartao_id))) return `Selecione um cartão ativo compatível para ${contexto}.`;
      if (!config.data_compra) return `Informe a data da compra de ${contexto}.`;
    } else if (!formaPagamentoEhPix(forma) && !formaPagamentoEhBoleto(forma) && !config.dados_pagamento.trim()) return `Informe os dados para pagamento de ${contexto}.`;
    return '';
  }
  async function enviarBoletos(arquivos) {
    return Promise.all((arquivos || []).map(async (file) => {
      const upload = await uploadAnexoTemporarioCompra(file);
      return { arquivo_url: upload?.arquivo_url, arquivo_nome: upload?.arquivo_nome_original || file.name };
    }));
  }
  function iniciarEdicaoParcelas() {
    const atuais = previsoes.map((item) => ({ valor: valorInput(item.titulo?.valor_original), data_vencimento: String(item.titulo?.data_vencimento || '').slice(0, 10) }));
    const primeiroTitulo = previsoes[0]?.titulo;
    setCategoriaId(primeiroTitulo?.categoria_financeira_id ? String(primeiroTitulo.categoria_financeira_id) : '');
    setDescricao(String(primeiroTitulo?.descricao || ''));
    setPagamento((atual) => ({ ...atual, forma_pagamento_id: primeiroTitulo?.forma_pagamento_id ? String(primeiroTitulo.forma_pagamento_id) : atual.forma_pagamento_id, quantidade_parcelas: atuais.length || 1, primeiro_vencimento: atuais[0]?.data_vencimento || hojeLocal(), parcelas: atuais.length ? atuais : gerarParcelas(totalPedido, 1, hojeLocal()) }));
    setEditandoParcelas(true);
  }
  function cancelarEdicaoParcelas() { setEditandoParcelas(false); setPagamento(criarConfigPagamento(totalPedido, credorPedido)); }

  async function salvarPrevisoes() {
    if (!categoriaId) return avisar.alerta('Selecione a categoria financeira.');
    const erroCompra = validarConfiguracao(pagamento, totalPedido, 'a compra');
    if (erroCompra) return avisar.alerta(erroCompra);
    for (const frete of fretesPendentes) {
      if (!frete.parceiro_id) return avisar.alerta(`Vincule o credor do frete #${frete.id} a um parceiro antes de criar o título.`);
      const erroFrete = validarConfiguracao(pagamentosFrete[frete.id], Number(frete.valor_total), `o frete #${frete.id}`);
      if (erroFrete) return avisar.alerta(erroFrete);
    }
    const reparcelando = editandoParcelas && podeReparcelarPrevisao;
    return executar('previsoes', async () => {
      const boletos = await enviarBoletos(pagamento.boletos);
      const fretes = await Promise.all(fretesPendentes.map(async (frete) => {
        const config = pagamentosFrete[frete.id];
        return {
          frete_id: frete.id,
          descricao: `Frete PC-${String(pedido.id).padStart(5, '0')} - ${frete.parceiro?.nome || frete.fornecedor?.nome || 'Terceiro'}`,
          forma_pagamento_id: Number(config.forma_pagamento_id), favorecido_pagamento_id: Number(config.favorecido.id),
          cartao_id: config.cartao_id ? Number(config.cartao_id) : undefined, data_compra: config.cartao_id ? config.data_compra : undefined,
          chave_pix: config.chave_pix.trim() || undefined, dados_pagamento: config.dados_pagamento.trim() || undefined,
          boletos: await enviarBoletos(config.boletos),
          parcelas: config.parcelas.map((parcela) => ({ valor: numeroMoeda(parcela.valor), data_vencimento: parcela.data_vencimento }))
        };
      }));
      const payload = {
        categoria_financeira_id: Number(categoriaId), descricao: descricao.trim() || undefined,
        forma_pagamento_id: Number(pagamento.forma_pagamento_id), favorecido_pagamento_id: Number(pagamento.favorecido.id),
        cartao_id: pagamento.cartao_id ? Number(pagamento.cartao_id) : undefined, data_compra: pagamento.cartao_id ? pagamento.data_compra : undefined,
        chave_pix: pagamento.chave_pix.trim() || undefined, dados_pagamento: pagamento.dados_pagamento.trim() || undefined,
        boletos, parcelas: pagamento.parcelas.map((parcela) => ({ valor: numeroMoeda(parcela.valor), data_vencimento: parcela.data_vencimento })), fretes
      };
      if (reparcelando) { await reparcelarPrevisoesPedidoCompra(pedido.id, payload); setEditandoParcelas(false); return; }
      const numeroDocumento = documento.numero_documento.trim();
      const observacoes = documento.observacoes.trim();
      const temComprovacao = Boolean(arquivo || numeroDocumento || observacoes);
      const upload = arquivo ? await uploadAnexoTemporarioCompra(arquivo) : null;
      chaveCriacaoRef.current ||= crypto.randomUUID();
      await criarPrevisoesPedidoCompra(pedido.id, { ...payload, comprovacao: temComprovacao ? {
        ...documento, numero_documento: numeroDocumento || undefined, observacoes: observacoes || undefined,
        arquivo_url: upload?.arquivo_url, arquivo_nome: upload?.arquivo_nome_original
      } : undefined }, chaveCriacaoRef.current);
      chaveCriacaoRef.current = null; setCriandoNovos(false);
      setArquivo(null); setDocumento({ tipo: 'NOTA_FISCAL', numero_documento: '', observacoes: '' });
      if (arquivoInputRef.current) arquivoInputRef.current.value = '';
    }, reparcelando ? 'Parcelas atualizadas para este pedido.' : 'Títulos da compra e dos fretes registrados para este pedido.');
  }

  async function abrirDocumento(item) {
    try { await abrirPreview(() => obterUrlAssinadaCompra(item.arquivo_url), { nome: item.arquivo_nome || item.arquivo_nome_original, caminho: item.arquivo_url }); }
    catch (error) { avisar.erro(error.message || 'Não foi possível abrir o documento.'); }
  }
  async function decidir(decisao) {
    if (!motivoDecisao.trim()) return avisar.alerta('Informe o motivo da decisão.');
    return executar('decisao', () => decidirReaberturaPedidoCompra(pedido.id, reabertura.id, { decisao, motivo: motivoDecisao.trim() }), decisao === 'APROVAR' ? 'Reabertura aprovada e pedido devolvido para edição.' : 'Reabertura rejeitada.');
  }

  async function fecharParaTitular() {
    const { ok } = await confirmar({ titulo: 'Fechar pedido com o fornecedor',
      mensagem: `Conferiu valores e itens do pedido #${pedido.id}? O fechamento prepara a criacao dos titulos por Compras, sem registrar pagamento nem enviar para a fila.` });
    if (!ok) return;
    return executar('fechar', () => atualizarStatusPedidoCompra(pedido.id, { status: 'FECHADO_FORNECEDOR' }), 'Pedido fechado. Compras ja pode criar os titulos deste pedido.');
  }

  return (<>
    <BlocoConteudo titulo="Gestão financeira do pedido" contagem={STATUS_LABEL[financeiro.status] || String(financeiro.status || '').replace(/_/g, ' ')} descricao="Compras cria e gerencia os títulos. O GEO faz o envio para autorização de pagamento ou para a fila, pela tela de Contas a Pagar." variante="primario" cor="var(--module-financeiro)">
      {elementoConfirmacao}
      {!pedidoFechado && pedido.status !== 'CANCELADO' && <div className="app-alert mb-3">
        <p>Compras precisa concluir o fechamento com o fornecedor antes de criar os titulos deste pedido. Titulos de outros pedidos nao impedem esta etapa.</p>
        {podePrever && canAlterarStatusComprasPedidos(user) ? <button type="button" className="btn btn-outline btn-sm mt-2" disabled={Boolean(processando)} onClick={fecharParaTitular}>Fechar com o fornecedor e preparar títulos</button> : <Link className="btn btn-outline btn-sm mt-2" to={`/pedidos-compra/${pedido.id}`}>Conferir fechamento do pedido</Link>}
      </div>}
      {podeCriarCompartilhado && <button type="button" className="btn btn-outline btn-sm" disabled={Boolean(processando) || !pedido?.fornecedor?.parceiro_id} onClick={() => setLoteAberto(true)}>Gerar títulos compartilhados com outras solicitações / pedidos</button>}
      {loteAberto && <TitulosCompartilhadosModal solicitacaoId={pedido.solicitacao?.solicitacao_principal_id || pedido.solicitacao_principal_id}
        pedidoId={pedido.id} credorInicial={credorPedido} onClose={() => setLoteAberto(false)} onCreated={() => onAtualizar?.()} />}
      <fieldset disabled={Boolean(processando)} className="min-w-0">
        {financeiro.legado ? <div className="app-alert"><p className="font-semibold">Pedido anterior ao novo fluxo</p><p className="mt-1">{pedidoFechado ? 'Os vínculos existentes foram apenas identificados. A adoção abaixo não altera nem recria títulos legados.' : 'Este pedido entrará na gestão financeira quando Compras concluir o fechamento com o fornecedor.'}</p>{podePrever && pedidoFechado ? <button type="button" className="btn btn-outline mt-3" disabled={Boolean(processando)} onClick={() => executar('adotar', () => adotarFinanceiroPedidoCompra(pedido.id), 'Pedido legado incorporado à gestão de títulos de Compras.')}>Revisar e adotar pedido legado</button> : null}</div> : null}

        {podeCriarPrevisao && titulosCompraAtivos.length > 0 && !exibirFormularioParcelas ? <button type="button" className="btn btn-outline btn-sm mt-3" disabled={Boolean(processando)} onClick={() => { setCriandoNovos(true); }}>Criar novos títulos</button> : null}
        {exibirFormularioParcelas ? <div className="mt-4 border-t border-[var(--c-border)] pt-4">
          <h3 className="font-semibold text-[var(--c-text)]">{editandoParcelas ? 'Editar parcelas legadas' : 'Criar títulos do pedido'}</h3>
          <dl className="my-3 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-[var(--c-muted)]">Credor</dt><dd className="break-words font-semibold">{pedido.fornecedor?.nome || 'Não vinculado'}</dd></div><div><dt className="text-[var(--c-muted)]">Obra</dt><dd className="break-words font-semibold">{pedido.obra?.nome || 'Não vinculada'}</dd></div><div><dt className="text-[var(--c-muted)]">Valor ao fornecedor</dt><dd className="font-semibold">{moeda(totalPedido)}</dd></div></dl>
          <p className="text-sm text-[var(--c-muted)]">Defina como cada pagamento foi negociado. As parcelas são distribuídas automaticamente e continuam editáveis antes da criação.</p>
          {!pedido?.fornecedor?.parceiro_id ? <div className="app-alert mt-3">Vincule o fornecedor deste pedido a um parceiro antes de criar os títulos financeiros.</div> : null}
          <div className="mt-3"><FormSecao colunas={2}>
            <CampoForm label="Categoria financeira" obrigatorio><select className="input w-full" value={categoriaId} onChange={(event) => setCategoriaId(event.target.value)}><option value="">Selecione</option>{(financeiro.opcoes?.categorias || []).map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>)}</select></CampoForm>
            <CampoForm label="Descrição dos títulos"><input className="input w-full" value={descricao} maxLength={255} onChange={(event) => setDescricao(event.target.value)} placeholder="Pedido e fornecedor" /></CampoForm>
          </FormSecao></div>
          <PagamentoTituloFields titulo="Pagamento ao fornecedor" descricao="Condição negociada para os itens deste pedido." valorTotal={totalPedido} config={pagamento} onChange={setPagamento} formas={formasPagamento} cartoes={cartoesPagamento} avisar={avisar} />
          {fretesPendentes.map((frete) => pagamentosFrete[frete.id] ? <PagamentoTituloFields key={frete.id} titulo={`Pagamento do frete #${frete.id}`} descricao={`Título separado para ${frete.parceiro?.nome || frete.fornecedor?.nome || 'credor do frete'}.`} valorTotal={Number(frete.valor_total)} config={pagamentosFrete[frete.id]} onChange={(config) => setPagamentosFrete((atuais) => ({ ...atuais, [frete.id]: config }))} formas={formasPagamento} cartoes={cartoesPagamento} avisar={avisar} /> : null)}

          {!editandoParcelas && podeAnexar ? <div className="mt-4 border-t border-[var(--c-border)] pt-4"><h3 className="font-semibold text-[var(--c-text)]">Forma de comprovação da compra</h3><p className="mt-1 text-sm text-[var(--c-muted)]">Opcional. Se houver, informe a nota fiscal, o comprovante de compra ou outra evidência recebida.</p><div className="mt-3"><FormSecao colunas={3}>
            <CampoForm label="Tipo de comprovante"><select className="input w-full" value={documento.tipo} onChange={(event) => setDocumento((atual) => ({ ...atual, tipo: event.target.value }))}><option value="NOTA_FISCAL">Nota fiscal</option><option value="COMPROVANTE_COMPRA">Comprovante de compra</option><option value="OUTRA_CONFIRMACAO">Outra comprovação</option></select></CampoForm>
            <CampoForm label="Número do documento"><input className="input w-full" value={documento.numero_documento} onChange={(event) => setDocumento((atual) => ({ ...atual, numero_documento: event.target.value }))} /></CampoForm>
            <CampoForm label="Arquivo"><input ref={arquivoInputRef} className="input w-full" type="file" onChange={(event) => setArquivo(event.target.files?.[0] || null)} /></CampoForm>
            <div style={{ gridColumn: '1 / -1' }}><CampoForm label="Observações"><textarea className="input min-h-20 w-full" value={documento.observacoes} onChange={(event) => setDocumento((atual) => ({ ...atual, observacoes: event.target.value }))} /></CampoForm></div>
          </FormSecao></div></div> : null}
          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-[var(--c-border)] pt-4">{editandoParcelas ? <button type="button" className="btn btn-outline" disabled={Boolean(processando)} onClick={cancelarEdicaoParcelas}>Cancelar edição</button> : null}<button type="button" className="btn btn-primary" disabled={Boolean(processando) || !pedido?.fornecedor?.parceiro_id} onClick={salvarPrevisoes}>{processando === 'previsoes' ? (editandoParcelas ? 'Salvando...' : 'Criando títulos...') : (editandoParcelas ? 'Salvar novo parcelamento' : 'Criar títulos')}</button></div>
        </div> : null}

        {titulosAtivos.length ? <div className="mt-4 border-t border-[var(--c-border)] pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-[var(--c-text)]">Títulos vinculados</h3>{podeReparcelarPrevisao && !editandoParcelas ? <button type="button" className="btn btn-outline btn-sm" disabled={Boolean(processando)} onClick={iniciarEdicaoParcelas}>Editar parcelas</button> : null}</div><div className="mt-3 overflow-x-auto rounded-lg border border-[var(--c-border)]"><table className="w-full min-w-[720px] text-sm"><thead className="bg-[var(--c-surface-2)] text-left"><tr><th className="p-3">Título</th><th className="p-3">Vencimento</th><th className="p-3">Valor</th><th className="p-3">Status</th><th className="p-3">Origem</th></tr></thead><tbody>{titulosAtivos.map((item) => <tr key={`${item.origem}-${item.titulo?.id}`} className="border-t border-[var(--c-border)]"><td className="p-3">{podeAbrirTituloFinanceiro ? <Link className="font-semibold text-[var(--c-primary)] hover:underline" to={`/financeiro/titulos/${item.titulo?.id}`}>{item.titulo?.codigo || `#${item.titulo?.id}`}</Link> : <span className="font-semibold">{item.titulo?.codigo || `#${item.titulo?.id}`}</span>}</td><td className="p-3">{formatarData(item.titulo?.data_vencimento)}</td><td className="p-3 font-semibold">{moeda(item.titulo?.valor_original)}</td><td className="p-3">{String(item.titulo?.status || '-').replace(/_/g, ' ')}</td><td className="p-3">{item.origem === 'FRETE_TERCEIRO' ? 'Frete a terceiro' : item.origem === 'LEGADO_DETECTADO' ? 'Legado detectado' : item.origem === 'LEGADO_CONFIRMADO' ? 'Legado confirmado' : 'Compra'}</td></tr>)}</tbody></table></div></div> : null}

        {titulosAtivos.some(item => item.titulo?.compartilhamento_id) && <p className="mt-2 text-xs text-[var(--c-muted)]">Títulos compartilhados: os valores e status desta tabela representam somente a participação deste pedido, não o total da compra consolidada.</p>}
        {(financeiro.documentos || []).length ? <div className="mt-4 border-t border-[var(--c-border)] pt-4">
          <h3 className="font-semibold text-[var(--c-text)]">Documentos financeiros do pedido</h3>
          <div className="mt-3 grid gap-2">{financeiro.documentos.map(item => <div key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--c-border)] p-3 text-sm">
            <span><strong>{TIPO_DOCUMENTO_LABEL[item.tipo] || String(item.tipo || '').replace(/_/g, ' ')}</strong>
              {item.numero_documento ? ` · ${item.numero_documento}` : ''}{item.criadoPor?.nome ? ` · ${item.criadoPor.nome}` : ''}
              {item.arquivo_nome && <span className="block text-xs text-[var(--c-muted)] break-all">{item.arquivo_nome}</span>}
            </span>
            {item.arquivo_url && <div className="flex gap-2">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => abrirDocumento(item)}>Abrir arquivo</button>
              {podeRemoverArquivo && <button type="button" className="btn btn-outline btn-sm btn-perigo-suave"
                aria-label={`Remover anexo ${item.arquivo_nome || item.id}`} onClick={() => setRemocao(item)}>Remover anexo</button>}
            </div>}
          </div>)}</div>
        </div> : null}

        {podeDecidirReabertura && reabertura?.status === 'PENDENTE' ? <div className="app-alert mt-4"><p className="font-semibold">Compras solicitou a reabertura deste pedido</p><p className="mt-1">{reabertura.motivo}</p><div className="mt-3"><label className="block text-sm font-semibold">Motivo da decisão</label><textarea className="input mt-1 min-h-20 w-full" value={motivoDecisao} onChange={(event) => setMotivoDecisao(event.target.value)} /></div><div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" className="btn btn-outline btn-perigo-suave" disabled={Boolean(processando)} onClick={() => decidir('REJEITAR')}>Rejeitar</button><button type="button" className="btn btn-primary" disabled={Boolean(processando)} onClick={() => decidir('APROVAR')}>Aprovar reabertura</button></div></div> : null}
      </fieldset>
      {modalPreview}
      {remocao && <OverlayModal rotulo="Remover anexo do pedido" largura="560px" onFechar={processando ? undefined : () => setRemocao(null)}>
        <header data-modal="cabecalho" className="p-4 border-b border-[var(--c-border)] font-semibold">Remover anexo do pedido</header>
        <div className="p-4 space-y-3 text-sm">
          <p className="break-all">{remocao.arquivo_nome || TIPO_DOCUMENTO_LABEL[remocao.tipo] || 'Arquivo do documento'}</p>
          <p>O arquivo será desvinculado somente deste pedido, com registro no histórico. Títulos, pagamentos e vínculos em outras áreas não serão removidos.</p>
        </div>
        <footer data-modal="rodape" className="p-4 border-t border-[var(--c-border)] flex justify-end gap-2">
          <button type="button" className="btn btn-outline btn-sm" disabled={Boolean(processando)} onClick={() => setRemocao(null)}>Cancelar</button>
          <button type="button" className="btn btn-outline btn-sm btn-perigo-suave" disabled={Boolean(processando)} onClick={removerArquivo}>
            {processando ? 'Removendo...' : 'Confirmar remoção'}
          </button>
        </footer>
      </OverlayModal>}
    </BlocoConteudo>
    <VinculosNfe pedidoId={pedido.id} user={user}/>
  </>);
}
