import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import DateInputBR from '../../../components/DateInputBR';
import { BlocoConteudo, CampoForm, FormSecao } from '../../../components/padrao';
import {
  adotarFinanceiroPedidoCompra,
  criarPrevisoesPedidoCompra,
  decidirReaberturaPedidoCompra,
  liberarTitulosPedidoCompra,
  obterUrlAssinadaCompra,
  reparcelarPrevisoesPedidoCompra,
  registrarDocumentoFinanceiroPedidoCompra,
  uploadAnexoTemporarioCompra
} from '../../../services/compras';
import {
  canAccessFinanceiro,
  canAnexarDocumentoPedidoCompraFinanceiro,
  canAprovarReaberturaPedidoCompraFinanceiro,
  canGerarPrevisaoPedidoCompraFinanceiro,
  canLiberarPedidoCompraFinanceiro,
  canViewPedidoCompraFinanceiro
} from '../../../utils/acessoProduto';

const STATUS_LABEL = {
  NAO_INICIADO: 'Não iniciado',
  AGUARDANDO_GEO: 'Aguardando GEO',
  AGUARDANDO_PREVISAO: 'Aguardando previsão',
  PREVISAO_CRIADA: 'Previsão criada',
  PARCIALMENTE_LIBERADO: 'Parcialmente liberado',
  LIBERADO_FINANCEIRO: 'Liberado ao Financeiro',
  PAGO_PARCIALMENTE: 'Pago parcialmente',
  CONCLUIDO: 'Concluído',
  LEGADO_PENDENTE_REVISAO: 'Legado pendente de revisão',
  CORRECAO_SOLICITADA: 'Reabertura solicitada',
  NAO_GERA_TITULO: 'Não gera título',
  CANCELADO: 'Cancelado'
};

function moeda(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function valorInput(value) {
  return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numeroMoeda(value) {
  const texto = String(value ?? '').replace(/[^\d,.-]/g, '');
  if (!texto) return 0;
  return Number(texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto) || 0;
}

function formatarData(value) {
  if (!value) return '-';
  const [ano, mes, dia] = String(value).slice(0, 10).split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : value;
}

function amanhaOuHoje() {
  return new Date().toISOString().slice(0, 10);
}

export default function PedidoCompraFinanceiro({ pedido, user, avisar, onAtualizar, onProcessando }) {
  const financeiro = pedido?.financeiro || null;
  const podeVer = canViewPedidoCompraFinanceiro(user);
  const podePrever = canGerarPrevisaoPedidoCompraFinanceiro(user);
  const podeAnexar = canAnexarDocumentoPedidoCompraFinanceiro(user);
  const podeLiberar = canLiberarPedidoCompraFinanceiro(user);
  const podeDecidirReabertura = canAprovarReaberturaPedidoCompraFinanceiro(user);
  const podeAbrirTituloFinanceiro = canAccessFinanceiro(user);
  const totalPedido = Number(pedido?.valor_total_fornecedor ?? pedido?.valor_total ?? 0);
  const [processando, setProcessando] = useState('');
  const processandoRef = useRef(false);
  const [categoriaId, setCategoriaId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [parcelas, setParcelas] = useState([{ valor: valorInput(totalPedido), data_vencimento: amanhaOuHoje() }]);
  const [editandoParcelas, setEditandoParcelas] = useState(false);
  const [selecionados, setSelecionados] = useState([]);
  const [formaPagamentoId, setFormaPagamentoId] = useState('');
  const [documento, setDocumento] = useState({
    tipo: 'NOTA_FISCAL',
    numero_documento: '',
    observacoes: ''
  });
  const [arquivo, setArquivo] = useState(null);
  const [motivoDecisao, setMotivoDecisao] = useState('');

  useEffect(() => {
    setParcelas([{ valor: valorInput(totalPedido), data_vencimento: amanhaOuHoje() }]);
    setEditandoParcelas(false);
  }, [pedido?.id, totalPedido]);

  const titulos = financeiro?.titulos || [];
  const previsoes = titulos.filter((item) => String(item.titulo?.status || '').toUpperCase() === 'PREVISAO');
  const titulosAtivos = titulos.filter((item) => !['CANCELADO', 'ESTORNADO'].includes(String(item.titulo?.status || '').toUpperCase()));
  const somaParcelas = useMemo(
    () => parcelas.reduce((total, parcela) => total + numeroMoeda(parcela.valor), 0),
    [parcelas]
  );
  const pedidoFechado = ['FECHADO_FORNECEDOR', 'ENCERRADO'].includes(String(pedido?.status || '').toUpperCase());
  const podeCriarPrevisao = podePrever && !financeiro?.legado && titulosAtivos.length === 0 && pedidoFechado;
  const podeReparcelarPrevisao = podePrever
    && !financeiro?.legado
    && pedidoFechado
    && previsoes.length > 0
    && previsoes.length === titulosAtivos.length;
  const exibirFormularioParcelas = podeCriarPrevisao || (podeReparcelarPrevisao && editandoParcelas);
  const reabertura = financeiro?.reabertura;

  if (!podeVer || !financeiro) return null;

  async function executar(chave, acao, sucesso) {
    if (processandoRef.current) return;
    processandoRef.current = true;
    onProcessando?.(true);
    try {
      setProcessando(chave);
      await acao();
      avisar.sucesso(sucesso);
      await onAtualizar?.();
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Não foi possível concluir a operação financeira do pedido.');
    } finally {
      processandoRef.current = false;
      onProcessando?.(false);
      setProcessando('');
    }
  }

  function atualizarParcela(index, campo, value) {
    setParcelas((atuais) => atuais.map((parcela, posicao) => (
      posicao === index ? { ...parcela, [campo]: value } : parcela
    )));
  }

  function adicionarParcela() {
    if (parcelas.length >= 120) {
      avisar.alerta('O pedido permite no máximo 120 parcelas.');
      return;
    }
    setParcelas((atuais) => {
      if (!atuais.length) return [{ valor: valorInput(totalPedido), data_vencimento: amanhaOuHoje() }];
      const ultimoIndice = atuais.length - 1;
      const ultimoValorCentavos = Math.round(numeroMoeda(atuais[ultimoIndice].valor) * 100);
      if (ultimoValorCentavos <= 1) {
        return [...atuais, { valor: '0,00', data_vencimento: atuais[ultimoIndice].data_vencimento || amanhaOuHoje() }];
      }
      const primeiraParte = Math.floor(ultimoValorCentavos / 2) / 100;
      const segundaParte = (ultimoValorCentavos - Math.floor(ultimoValorCentavos / 2)) / 100;
      return atuais.flatMap((parcela, index) => (
        index === ultimoIndice
          ? [
              { ...parcela, valor: valorInput(primeiraParte) },
              { ...parcela, valor: valorInput(segundaParte) }
            ]
          : [parcela]
      ));
    });
  }

  function removerParcela(index) {
    setParcelas((atuais) => atuais.filter((_, posicao) => posicao !== index));
  }

  function iniciarEdicaoParcelas() {
    const atuais = previsoes.map((item) => ({
      valor: valorInput(item.titulo?.valor_original),
      data_vencimento: String(item.titulo?.data_vencimento || '').slice(0, 10)
    }));
    const primeiroTitulo = previsoes[0]?.titulo;
    setCategoriaId(primeiroTitulo?.categoria_financeira_id ? String(primeiroTitulo.categoria_financeira_id) : '');
    setDescricao(String(primeiroTitulo?.descricao || ''));
    setParcelas(atuais.length ? atuais : [{ valor: valorInput(totalPedido), data_vencimento: amanhaOuHoje() }]);
    setSelecionados([]);
    setEditandoParcelas(true);
  }

  function cancelarEdicaoParcelas() {
    setEditandoParcelas(false);
    setParcelas([{ valor: valorInput(totalPedido), data_vencimento: amanhaOuHoje() }]);
  }

  async function salvarPrevisoes() {
    if (!categoriaId) return avisar.alerta('Selecione a categoria financeira.');
    if (!parcelas.length || parcelas.some((parcela) => numeroMoeda(parcela.valor) <= 0 || !parcela.data_vencimento)) {
      return avisar.alerta('Informe valor e vencimento válidos para todas as parcelas.');
    }
    if (Math.abs(somaParcelas - totalPedido) >= 0.01) {
      return avisar.alerta('A soma das parcelas precisa ser igual ao total devido ao fornecedor.');
    }
    const payload = {
      categoria_financeira_id: Number(categoriaId),
      descricao: descricao.trim() || undefined,
      parcelas: parcelas.map((parcela) => ({
        valor: numeroMoeda(parcela.valor),
        data_vencimento: parcela.data_vencimento
      }))
    };
    const reparcelando = editandoParcelas && podeReparcelarPrevisao;
    return executar('previsoes', async () => {
      if (reparcelando) {
        await reparcelarPrevisoesPedidoCompra(pedido.id, payload);
        setEditandoParcelas(false);
      } else {
        await criarPrevisoesPedidoCompra(pedido.id, payload);
      }
    }, reparcelando
      ? 'Parcelas das previsões atualizadas para este pedido.'
      : 'Previsões financeiras criadas para este pedido.');
  }

  async function salvarDocumento() {
    if (!arquivo && !documento.observacoes.trim()) {
      return avisar.alerta('Anexe um documento ou descreva a confirmação recebida do fornecedor.');
    }
    return executar('documento', async () => {
      const upload = arquivo ? await uploadAnexoTemporarioCompra(arquivo) : null;
      await registrarDocumentoFinanceiroPedidoCompra(pedido.id, {
        ...documento,
        numero_documento: documento.numero_documento.trim() || undefined,
        observacoes: documento.observacoes.trim() || undefined,
        arquivo_url: upload?.arquivo_url,
        arquivo_nome: upload?.arquivo_nome_original
      });
      setArquivo(null);
      setDocumento({ tipo: 'NOTA_FISCAL', numero_documento: '', observacoes: '' });
    }, 'Documento financeiro registrado no pedido.');
  }

  async function abrirDocumento(documentoFinanceiro) {
    try {
      const url = await obterUrlAssinadaCompra(documentoFinanceiro.arquivo_url);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      avisar.erro(error.message || 'Não foi possível abrir o documento.');
    }
  }

  async function liberarSelecionados() {
    if (!selecionados.length) return avisar.alerta('Selecione ao menos uma previsão.');
    if (!formaPagamentoId) return avisar.alerta('Selecione a forma de pagamento.');
    return executar('liberar', () => liberarTitulosPedidoCompra(pedido.id, {
      titulo_ids: selecionados,
      forma_pagamento_id: Number(formaPagamentoId)
    }), 'Títulos liberados para pagamento no Financeiro.');
  }

  async function decidir(decisao) {
    if (!motivoDecisao.trim()) return avisar.alerta('Informe o motivo da decisão.');
    return executar('decisao', () => decidirReaberturaPedidoCompra(pedido.id, reabertura.id, {
      decisao,
      motivo: motivoDecisao.trim()
    }), decisao === 'APROVAR' ? 'Reabertura aprovada e pedido devolvido para edição.' : 'Reabertura rejeitada.');
  }

  return (
    <BlocoConteudo
      titulo="Gestão financeira do pedido"
      contagem={STATUS_LABEL[financeiro.status] || String(financeiro.status || '').replace(/_/g, ' ')}
      descricao="O pedido permanece com Compras; o GEO prepara as previsões e só libera o pagamento após a confirmação do fornecedor."
      variante="primario"
      cor="var(--module-financeiro)"
    >
      <fieldset disabled={Boolean(processando)} className="min-w-0">
      {financeiro.legado ? (
        <div className="app-alert">
          <p className="font-semibold">Pedido anterior ao novo fluxo</p>
          <p className="mt-1">{pedidoFechado
            ? 'Os vínculos existentes foram apenas identificados. A adoção abaixo não altera nem recria títulos legados.'
            : 'Este pedido entrará na gestão financeira quando Compras concluir o fechamento com o fornecedor.'}</p>
          {podePrever && pedidoFechado ? (
            <button
              type="button"
              className="btn btn-outline mt-3"
              disabled={Boolean(processando)}
              onClick={() => executar('adotar', () => adotarFinanceiroPedidoCompra(pedido.id), 'Pedido legado incorporado à gestão financeira do GEO.')}
            >
              Revisar e adotar pedido legado
            </button>
          ) : null}
        </div>
      ) : null}

      {exibirFormularioParcelas ? (
        <div className="mt-4 border-t border-[var(--c-border)] pt-4">
          <h3 className="font-semibold text-[var(--c-text)]">{editandoParcelas ? 'Editar parcelas das previsões' : 'Criar títulos de previsão'}</h3>
          <dl className="my-3 grid gap-3 sm:grid-cols-3 text-sm">
            <div><dt className="text-[var(--c-muted)]">Credor (fornecedor do pedido)</dt><dd className="break-words font-semibold">{pedido.fornecedor?.nome || 'Não vinculado'}</dd></div>
            <div><dt className="text-[var(--c-muted)]">Obra</dt><dd className="break-words font-semibold">{pedido.obra?.nome || 'Não vinculada'}</dd></div>
            <div><dt className="text-[var(--c-muted)]">Valor do pedido ao fornecedor</dt><dd className="font-semibold">{moeda(totalPedido)}</dd></div>
          </dl>
          <p className="text-sm text-[var(--c-muted)]">O vínculo e o valor são deste pedido, não do total da solicitação. Os demais pedidos têm títulos próprios.</p>
          <p className="mt-1 text-sm text-[var(--c-muted)]">
            Distribua {moeda(totalPedido)} entre as parcelas. O Financeiro ainda não poderá baixá-las.
            {editandoParcelas ? ' As previsões atuais serão canceladas e substituídas somente ao salvar.' : ''}
          </p>
          {!pedido?.fornecedor?.parceiro_id ? (
            <div className="app-alert mt-3">
              Vincule o fornecedor deste pedido a um parceiro antes de criar os títulos financeiros.
            </div>
          ) : null}
          <div className="mt-3">
            <FormSecao colunas={2}>
              <CampoForm label="Categoria financeira" obrigatorio>
                <select className="input w-full" value={categoriaId} onChange={(event) => setCategoriaId(event.target.value)}>
                  <option value="">Selecione</option>
                  {(financeiro.opcoes?.categorias || []).map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>
                  ))}
                </select>
              </CampoForm>
              <CampoForm label="Descrição dos títulos">
                <input className="input w-full" value={descricao} maxLength={255} onChange={(event) => setDescricao(event.target.value)} placeholder="Pedido e fornecedor" />
              </CampoForm>
            </FormSecao>
          </div>

          <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--c-border)]">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-[var(--c-surface-2)] text-left">
                <tr><th className="p-3">Parcela</th><th className="p-3">Valor</th><th className="p-3">Vencimento</th><th className="p-3 text-right">Ação</th></tr>
              </thead>
              <tbody>
                {parcelas.map((parcela, index) => (
                  <tr key={index} className="border-t border-[var(--c-border)]">
                    <td className="p-3 font-semibold">{index + 1}/{parcelas.length}</td>
                    <td className="p-3"><input className="input w-full" value={parcela.valor} onChange={(event) => atualizarParcela(index, 'valor', event.target.value)} onBlur={(event) => atualizarParcela(index, 'valor', valorInput(numeroMoeda(event.target.value)))} /></td>
                    <td className="p-3"><DateInputBR className="input w-full" value={parcela.data_vencimento} onChange={(event) => atualizarParcela(index, 'data_vencimento', event.target.value)} /></td>
                    <td className="p-3 text-right"><button type="button" className="btn btn-outline" disabled={parcelas.length === 1} onClick={() => removerParcela(index)}>Remover</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <button type="button" className="btn btn-outline" onClick={adicionarParcela}>Adicionar parcela</button>
            <span className={`font-semibold ${Math.abs(somaParcelas - totalPedido) < 0.01 ? 'text-[var(--sem-success)]' : 'text-[var(--sem-danger)]'}`}>
              Informado: {moeda(somaParcelas)} · Diferença: {moeda(totalPedido - somaParcelas)}
            </span>
            <div className="flex flex-wrap gap-2">
              {editandoParcelas ? (
                <button type="button" className="btn btn-outline" disabled={Boolean(processando)} onClick={cancelarEdicaoParcelas}>Cancelar edição</button>
              ) : null}
              <button type="button" className="btn btn-primary" disabled={Boolean(processando) || !pedido?.fornecedor?.parceiro_id} onClick={salvarPrevisoes}>
                {processando === 'previsoes'
                  ? 'Salvando...'
                  : (editandoParcelas ? 'Salvar novo parcelamento' : 'Criar previsões')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {titulosAtivos.length ? (
        <div className="mt-4 border-t border-[var(--c-border)] pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-[var(--c-text)]">Títulos vinculados</h3>
            {podeReparcelarPrevisao && !editandoParcelas ? (
              <button type="button" className="btn btn-outline btn-sm" disabled={Boolean(processando)} onClick={iniciarEdicaoParcelas}>
                Editar parcelas
              </button>
            ) : null}
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--c-border)]">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-[var(--c-surface-2)] text-left"><tr><th className="p-3">Sel.</th><th className="p-3">Título</th><th className="p-3">Vencimento</th><th className="p-3">Valor</th><th className="p-3">Status</th><th className="p-3">Origem</th></tr></thead>
              <tbody>{titulosAtivos.map((item) => (
                <tr key={`${item.origem}-${item.titulo?.id}`} className="border-t border-[var(--c-border)]">
                  <td className="p-3"><input type="checkbox" disabled={!podeLiberar || String(item.titulo?.status).toUpperCase() !== 'PREVISAO'} checked={selecionados.includes(Number(item.titulo?.id))} onChange={(event) => setSelecionados((atuais) => event.target.checked ? [...atuais, Number(item.titulo.id)] : atuais.filter((id) => id !== Number(item.titulo.id)))} /></td>
                  <td className="p-3">{podeAbrirTituloFinanceiro ? (
                    <Link className="font-semibold text-[var(--c-primary)] hover:underline" to={`/financeiro/titulos/${item.titulo?.id}`}>{item.titulo?.codigo || `#${item.titulo?.id}`}</Link>
                  ) : (
                    <span className="font-semibold">{item.titulo?.codigo || `#${item.titulo?.id}`}</span>
                  )}</td>
                  <td className="p-3">{formatarData(item.titulo?.data_vencimento)}</td>
                  <td className="p-3 font-semibold">{moeda(item.titulo?.valor_original)}</td>
                  <td className="p-3">{String(item.titulo?.status || '-').replace(/_/g, ' ')}</td>
                  <td className="p-3">{item.origem === 'LEGADO_DETECTADO' ? 'Legado detectado' : item.origem === 'LEGADO_CONFIRMADO' ? 'Legado confirmado' : 'Novo fluxo'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ) : null}

      {(podeAnexar || (financeiro.documentos || []).length) ? (
        <div className="mt-4 border-t border-[var(--c-border)] pt-4">
          <h3 className="font-semibold text-[var(--c-text)]">Confirmação do fornecedor</h3>
          {podeAnexar ? (
            <div className="mt-3">
              <FormSecao colunas={3}>
                <CampoForm label="Tipo" obrigatorio><select className="input w-full" value={documento.tipo} onChange={(event) => setDocumento((atual) => ({ ...atual, tipo: event.target.value }))}><option value="NOTA_FISCAL">Nota fiscal</option><option value="COMPROVANTE_COMPRA">Comprovante de compra</option><option value="OUTRA_CONFIRMACAO">Outra confirmação</option></select></CampoForm>
                <CampoForm label="Número do documento"><input className="input w-full" value={documento.numero_documento} onChange={(event) => setDocumento((atual) => ({ ...atual, numero_documento: event.target.value }))} /></CampoForm>
                <CampoForm label="Arquivo"><input className="input w-full" type="file" onChange={(event) => setArquivo(event.target.files?.[0] || null)} /></CampoForm>
                <div style={{ gridColumn: '1 / -1' }}>
                  <CampoForm label="Observações"><textarea className="input min-h-20 w-full" value={documento.observacoes} onChange={(event) => setDocumento((atual) => ({ ...atual, observacoes: event.target.value }))} /></CampoForm>
                </div>
                <div className="flex justify-end" style={{ gridColumn: '1 / -1' }}><button type="button" className="btn btn-outline" disabled={Boolean(processando)} onClick={salvarDocumento}>{processando === 'documento' ? 'Enviando...' : 'Registrar confirmação'}</button></div>
              </FormSecao>
            </div>
          ) : null}
          {(financeiro.documentos || []).length ? (
            <div className="mt-3 grid gap-2">
              {financeiro.documentos.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--c-border)] p-3 text-sm">
                  <span><strong>{String(item.tipo || '').replace(/_/g, ' ')}</strong>{item.numero_documento ? ` · ${item.numero_documento}` : ''}{item.criadoPor?.nome ? ` · ${item.criadoPor.nome}` : ''}</span>
                  {item.arquivo_url ? <button type="button" className="btn btn-outline" onClick={() => abrirDocumento(item)}>Abrir arquivo</button> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {podeLiberar && previsoes.length ? (
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-[var(--c-border)] pt-4">
          <CampoForm label="Forma de pagamento" obrigatorio>
            <select className="input min-w-64" value={formaPagamentoId} onChange={(event) => setFormaPagamentoId(event.target.value)}><option value="">Selecione</option>{(financeiro.opcoes?.formas_pagamento || []).map((forma) => <option key={forma.id} value={forma.id}>{forma.nome}</option>)}</select>
          </CampoForm>
          <button type="button" className="btn btn-primary" disabled={Boolean(processando) || !selecionados.length || editandoParcelas} onClick={liberarSelecionados}>{processando === 'liberar' ? 'Liberando...' : `Liberar ${selecionados.length || ''} para pagamento`}</button>
        </div>
      ) : null}

      {podeDecidirReabertura && reabertura?.status === 'PENDENTE' ? (
        <div className="app-alert mt-4">
          <p className="font-semibold">Compras solicitou a reabertura deste pedido</p>
          <p className="mt-1">{reabertura.motivo}</p>
          <div className="mt-3"><label className="block text-sm font-semibold">Motivo da decisão</label><textarea className="input mt-1 min-h-20 w-full" value={motivoDecisao} onChange={(event) => setMotivoDecisao(event.target.value)} /></div>
          <div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" className="btn btn-outline btn-perigo-suave" disabled={Boolean(processando)} onClick={() => decidir('REJEITAR')}>Rejeitar</button><button type="button" className="btn btn-primary" disabled={Boolean(processando)} onClick={() => decidir('APROVAR')}>Aprovar reabertura</button></div>
        </div>
      ) : null}
      </fieldset>
    </BlocoConteudo>
  );
}
