import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avisos, BlocoConteudo, useAvisos, useConfirmacao } from '../../components/padrao';
import { API_URL, authHeaders } from '../../services/api';
import {
  anexarEspelhoPedidoCompra,
  aprovarItensCompraSolicitacaoEmLote,
  comentarEtapaCompraSolicitacao,
  decidirItemCompraSolicitacao,
  encaminharSolicitacaoCompraParaCompras,
  obterEtapasCompraSolicitacao,
  uploadAnexoTemporarioCompra
} from '../../services/compras';
import GerenciarCotacaoSolicitacao from '../../modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao';
import PedidoEntrega from './PedidoEntrega';
import PedidoResumo from './PedidoResumo';
import { useLiveUpdateSubscription } from '../../contexts/LiveUpdatesContext';
import { itemPodeSerReaproveitado } from '../../modules/solicitacao-compra/utils/reaproveitamentoItensCompra';
import { comentariosDaEtapa, comentariosDoItem, comentariosDoItemPedido } from './comentariosCompra';

function quantidade(value) {
  return Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function Comentarios({ lista }) {
  if (!lista.length) return null;
  return <div className="mt-2 space-y-1 border-l-2 border-[var(--c-border)] pl-3 text-sm">
    {lista.map((comentario) => <p key={comentario.id}>
      <strong>{comentario.usuario?.nome || 'Usuário'}:</strong> {comentario.descricao}
    </p>)}
  </div>;
}

export default function CompraEtapas({ solicitacaoId, user, itensRevisao, podeDecidir, podeReceber, podeProgramarEntrega, podeAnexar, mostrarCotacao, podeGerenciarCotacao, podeCriarNovaSolicitacao, onGerenciarItens, onUpdated }) {
  const navigate = useNavigate();
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState('');
  const executandoRef = useRef(false);
  const [comentando, setComentando] = useState(null);
  const [texto, setTexto] = useState('');
  const [usuarios, setUsuarios] = useState([]);
  const [mencoes, setMencoes] = useState([]);
  const [buscaMencao, setBuscaMencao] = useState('');
  const [motivos, setMotivos] = useState({});
  const [selecionados, setSelecionados] = useState([]);
  const consultaEntregaRef = useRef(0);

  async function carregar() {
    const consulta = ++consultaEntregaRef.current;
    const retorno = await obterEtapasCompraSolicitacao(solicitacaoId);
    if (consulta === consultaEntregaRef.current) setDados(retorno);
  }

  useLiveUpdateSubscription({ enabled: !!solicitacaoId,
    filter: (event) => event?.entity === 'SOLICITACAO' && Number(event.record_id) === Number(solicitacaoId),
    onEvent: () => carregar().catch(() => {}) });
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void carregar().catch(() => {}); }, 60000);
    return () => clearInterval(timer);
  }, [solicitacaoId]);

  useEffect(() => {
    let ativo = true;
    const consulta = ++consultaEntregaRef.current;
    setSelecionados([]);
    setCarregando(true);
    obterEtapasCompraSolicitacao(solicitacaoId)
      .then((retorno) => { if (ativo && consulta === consultaEntregaRef.current) setDados(retorno); })
      .catch((error) => { if (ativo) avisar.erro(error.message || 'Erro ao carregar itens da compra.'); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; consultaEntregaRef.current += 1; };
  }, [solicitacaoId]);

  useEffect(() => {
    // Atualiza os itens editados sem desmontar cards ou descartar rascunhos da cotação.
    if (itensRevisao) void carregar().catch((error) => avisar.erro(error.message || 'Erro ao atualizar itens.'));
  }, [itensRevisao]);

  useEffect(() => {
    if (!dados) return;
    const pendentesAtuais = new Set(dados.itens.filter((item) => item.status_aprovacao === 'PENDENTE'
      || (dados.revisao_geo_pendente && !item.status_aprovacao))
      .map((item) => `${item.item_tipo}:${item.id}`));
    setSelecionados((atuais) => atuais.filter((chave) => pendentesAtuais.has(chave)));
  }, [dados]);

  useEffect(() => {
    let ativo = true;
    fetch(`${API_URL}/usuarios-lista`, { headers: authHeaders() })
      .then((response) => response.ok ? response.json() : [])
      .then((lista) => { if (ativo) setUsuarios(Array.isArray(lista) ? lista : []); })
      .catch(() => {});
    return () => { ativo = false; };
  }, []);

  async function executar(chave, acao, mensagem) {
    if (executandoRef.current) return false;
    executandoRef.current = true;
    setProcessando(chave);
    try {
      await acao();
      await carregar();
      onUpdated?.();
      avisar.sucesso(mensagem);
      return true;
    } catch (error) {
      avisar.erro(error.message || 'A ação não foi concluída.');
      return false;
    } finally {
      executandoRef.current = false;
      setProcessando('');
    }
  }

  function abrirComentario(escopo, referenciaId, itemTipo = null, local = '') {
    setComentando({ escopo, referencia_id: referenciaId, item_tipo: itemTipo, local });
    setTexto('');
    setMencoes([]);
    setBuscaMencao('');
  }

  function formularioComentario(escopo, referenciaId, itemTipo = null, local = '') {
    if (comentando?.escopo !== escopo || Number(comentando?.referencia_id) !== Number(referenciaId)
      || (comentando?.item_tipo || null) !== itemTipo || comentando?.local !== local) return null;
    const usuariosFiltrados = usuarios.filter((usuario) => !mencoes.some((selecionado) => selecionado.id === usuario.id)
      && String(usuario.nome || '').toLocaleLowerCase('pt-BR').includes(buscaMencao.toLocaleLowerCase('pt-BR'))).slice(0, 8);
    return <div className="mt-2 flex flex-wrap items-end gap-2">
      <label className="min-w-[220px] flex-1 text-sm">
        Comentário
        <textarea className="input mt-1 w-full" rows={2} value={texto} maxLength={5000}
          onChange={(event) => setTexto(event.target.value)} />
      </label>
      <div className="w-full text-xs">
        {mencoes.length > 0 && <div className="mb-1 flex flex-wrap gap-1">{mencoes.map((usuario) => <button
          key={usuario.id} type="button" className="rounded border border-[var(--c-border)] px-2 py-1"
          onClick={() => setMencoes((lista) => lista.filter((item) => item.id !== usuario.id))}
          title="Remover menção">@{usuario.nome} ×</button>)}</div>}
        <input className="input w-full max-w-xs" value={buscaMencao} onChange={(event) => setBuscaMencao(event.target.value)}
          placeholder="Mencionar usuário (opcional)" aria-label="Buscar usuário para mencionar" />
        {buscaMencao.trim() && <div className="mt-1 flex flex-wrap gap-1">{usuariosFiltrados.map((usuario) => <button
          key={usuario.id} type="button" className="btn btn-outline btn-sm"
          onClick={() => { setMencoes((lista) => [...lista, usuario]); setBuscaMencao(''); }}>{usuario.nome}</button>)}</div>}
      </div>
      <button type="button" className="btn btn-primary btn-sm" disabled={!texto.trim() || !!processando}
        onClick={() => executar('comentar', async () => {
          await comentarEtapaCompraSolicitacao(solicitacaoId, {
            escopo: comentando.escopo,
            referencia_id: comentando.referencia_id,
            item_tipo: comentando.item_tipo,
            descricao: texto,
            mencoes: mencoes.map((usuario) => usuario.id)
          });
          setComentando(null);
          setTexto('');
          setMencoes([]);
        }, 'Comentário registrado e destacado para os envolvidos.')}>Enviar</button>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => setComentando(null)}>Cancelar</button>
    </div>;
  }

  async function decidir(item, decisao) {
    const chaveItem = `${item.item_tipo}-${item.id}`;
    const motivoAtual = decisao === 'REJEITADO' ? String(motivos[chaveItem] || '').trim() : '';
    if (decisao === 'REJEITADO' && !motivoAtual) {
      avisar.alerta('Informe o motivo para rejeitar o item.');
      return;
    }
    const concluido = await executar(`decidir-${item.item_tipo}-${item.id}`, () => decidirItemCompraSolicitacao(
      solicitacaoId, item.item_tipo, item.id, { decisao, motivo: motivoAtual }
    ), decisao === 'APROVADO' ? 'Item aprovado pelo GEO.' : 'Item rejeitado pelo GEO.');
    if (concluido) setMotivos((atuais) => ({ ...atuais, [chaveItem]: '' }));
  }

  if (carregando) return <BlocoConteudo titulo="Gestão dos itens">Carregando itens e pedidos...</BlocoConteudo>;
  if (!dados) return <BlocoConteudo titulo="Gestão dos itens"><Avisos avisos={avisos} aoFechar={fechar} /></BlocoConteudo>;

  const pendentes = dados.itens.filter((item) => dados.revisao_geo_pendente
    && (item.status_aprovacao === 'PENDENTE' || !item.status_aprovacao));
  const aprovados = dados.itens.filter((item) => item.status_aprovacao === 'APROVADO'
    || (!dados.revisao_geo_pendente && !itemPodeSerReaproveitado(item)
      && (!item.status_aprovacao || (item.status_aprovacao === 'PENDENTE' && item.vinculado_compra))));
  const naoAprovados = dados.itens.filter(itemPodeSerReaproveitado);
  const itensEmCotacao = dados.itens.filter((item) => item.em_cotacao);
  const statusCompra = String(dados.status_compra || '').toUpperCase();
  const compraEncaminhada = ['LIBERADO_PARA_COMPRA', 'LIBERADO', 'COTACAO', 'COTACAO_ENVIADA',
    'EM_COTACAO', 'FECHAMENTO_PARCIAL', 'ENCERRADO', 'FINALIZADA'].includes(statusCompra)
    || statusCompra.startsWith('PEDIDO_');
  const chavesPendentes = new Set(pendentes.map((item) => `${item.item_tipo}:${item.id}`));
  const chavesSelecionadas = new Set(selecionados);
  const todosSelecionados = pendentes.length > 0 && selecionados.length === pendentes.length;

  async function aprovarSelecionados() {
    const itens = pendentes.filter((item) => chavesSelecionadas.has(`${item.item_tipo}:${item.id}`))
      .map((item) => ({ item_tipo: item.item_tipo, id: item.id }));
    if (!itens.length) return;
    const concluido = await executar('aprovar-lote', () => aprovarItensCompraSolicitacaoEmLote(solicitacaoId, itens),
      `${itens.length} item(ns) aprovado(s) pelo GEO.`);
    if (concluido) setSelecionados([]);
  }

  async function encaminharAprovados() {
    const compraId = dados.solicitacao_compra_id;
    const quantidadeAprovados = aprovados.length;
    const quantidadeSemDecisao = pendentes.length;
    if (quantidadeSemDecisao > 0) {
      const { ok } = await confirmar({
        titulo: 'Encaminhar itens aprovados para Compras',
        mensagem: `${quantidadeAprovados} item(ns) aprovado(s) seguirão para Compras. Os ${quantidadeSemDecisao} item(ns) ainda sem decisão serão registrados como rejeitados na análise externa e poderão ser reaproveitados em uma nova solicitação.`,
        rotuloConfirmar: 'Encaminhar e registrar rejeições'
      });
      if (!ok) return;
    }
    await executar('encaminhar', () => encaminharSolicitacaoCompraParaCompras(compraId),
      'Itens aprovados encaminhados para Compras. Os demais permaneceram disponíveis para reaproveitamento.');
  }
  const cotacaoIniciada = ['COTACAO', 'COTACAO_ENVIADA', 'EM_COTACAO', 'FECHAMENTO_PARCIAL', 'ENCERRADO']
    .includes(String(dados.status_compra || '').toUpperCase());

  const linhaItem = (item, escopo) => <div key={`${item.item_tipo}-${item.id}`}
    className="rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2">
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {escopo === 'ITEM' && podeDecidir && chavesPendentes.has(`${item.item_tipo}:${item.id}`) &&
        <input type="checkbox" className="h-4 w-4 shrink-0 accent-[var(--c-primary)]" disabled={!!processando}
          aria-label={`Selecionar ${item.nome} para aprovação em lote`}
          checked={chavesSelecionadas.has(`${item.item_tipo}:${item.id}`)}
          onChange={(event) => setSelecionados((atuais) => event.target.checked
            ? [...atuais, `${item.item_tipo}:${item.id}`]
            : atuais.filter((chave) => chave !== `${item.item_tipo}:${item.id}`))} />}
      <span className="min-w-0 flex-1 font-semibold">{item.nome}</span>
      {escopo === 'ITEM' && item.rejeicao_implicita && <span className="text-xs text-[var(--c-muted)]">Não aprovado na análise externa</span>}
      <span className="text-[var(--c-muted)]">{quantidade(item.quantidade)} {item.unidade_sigla_manual || item.unidade?.sigla || ''}</span>
      {escopo === 'ITEM' && <span className="text-xs text-[var(--c-muted)]">{item.rejeicao_implicita ? 'Rejeitado' : item.status_aprovacao || 'Sem decisão'}</span>}
      {onGerenciarItens && <button type="button" className="btn btn-outline btn-sm" disabled={!!processando}
        onClick={() => onGerenciarItens(item)} aria-label={`Editar ${item.nome}`}>Editar</button>}
      {escopo === 'ITEM' && chavesPendentes.has(`${item.item_tipo}:${item.id}`) && podeDecidir && <>
        <button type="button" className="btn btn-primary btn-sm" disabled={!!processando}
          onClick={() => decidir(item, 'APROVADO')}>Aprovar</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={!!processando}
          onClick={() => decidir(item, 'REJEITADO')}>Rejeitar</button>
      </>}
      {(!cotacaoIniciada || escopo === 'ITEM') && <button type="button" className="btn btn-outline btn-sm"
        onClick={() => abrirComentario(escopo, item.id, item.item_tipo)}>Comentar</button>}
    </div>
    {escopo === 'ITEM' && chavesPendentes.has(`${item.item_tipo}:${item.id}`) && podeDecidir && <input className="input mt-2 w-full"
      value={motivos[`${item.item_tipo}-${item.id}`] || ''}
      onChange={(event) => setMotivos((atuais) => ({ ...atuais, [`${item.item_tipo}-${item.id}`]: event.target.value }))}
      placeholder="Motivo para rejeição (obrigatório ao rejeitar)" />}
    {cotacaoIniciada && escopo === 'ITEM_APROVADO' && <p className="mt-1 text-xs text-[var(--c-muted)]">Em cotação ou pedido: comente no card da etapa correspondente.</p>}
    {item.especificacao && <p className="mt-1 text-sm text-[var(--c-muted)]">{item.especificacao}</p>}
    <Comentarios lista={comentariosDoItem(dados.comentarios, item, dados.pedidos)} />
    {formularioComentario(escopo, item.id, item.item_tipo)}
  </div>;

  return <div className="space-y-3">
    <Avisos avisos={avisos} aoFechar={fechar} />
    {elementoConfirmacao}
    <BlocoConteudo titulo="Itens da solicitação" contagem={`${dados.itens.length} item(ns) · ${pendentes.length} pendente(s)`} recolhivel
      controles={<span />}
      acoes={onGerenciarItens ? <button type="button" className="btn btn-outline btn-sm" onClick={() => onGerenciarItens()}>Gerenciar todos os itens</button> : null}>
      <div className="space-y-2">
        {podeDecidir && pendentes.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--c-border)] px-3 py-2 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-[var(--c-primary)]" disabled={!!processando}
              checked={todosSelecionados}
              onChange={(event) => setSelecionados(event.target.checked
                ? pendentes.map((item) => `${item.item_tipo}:${item.id}`) : [])} />
            Selecionar todos
          </label>
          <span className="text-[var(--c-muted)]">{selecionados.length} de {pendentes.length} selecionado(s)</span>
          <button type="button" className="btn btn-primary btn-sm ml-auto" disabled={!selecionados.length || !!processando}
            onClick={aprovarSelecionados}>Aprovar selecionados</button>
        </div>}
        {dados.itens.length ? dados.itens.map((item) => linhaItem(item, 'ITEM')) : <p className="text-sm text-[var(--c-muted)]">Nenhum item cadastrado nesta solicitação.</p>}
      </div>
    </BlocoConteudo>
    <BlocoConteudo titulo="Itens aprovados" contagem={`${aprovados.length} item(ns)`} recolhivel>
      <div className="space-y-2">
        {aprovados.length ? aprovados.map((item) => linhaItem(item, 'ITEM_APROVADO')) : <p className="text-sm text-[var(--c-muted)]">Aprovações do GEO aparecerão aqui.</p>}
      </div>
      {podeDecidir && dados.revisao_geo_pendente && pendentes.length > 0 &&
        <p className="mt-3 text-xs text-[var(--c-muted)]">Ao encaminhar, os itens sem decisão serão registrados como rejeitados na análise externa.</p>}
      {podeDecidir && aprovados.length > 0 && dados.revisao_geo_pendente &&
        <div className="mt-3 flex justify-end"><button type="button" className="btn btn-primary btn-sm" disabled={!!processando}
          onClick={encaminharAprovados}>Encaminhar aprovados para Compras</button></div>}
    </BlocoConteudo>
    {naoAprovados.length > 0 && <BlocoConteudo titulo="Itens não aprovados" contagem={`${naoAprovados.length} item(ns)`} recolhivel recolhidoPadrao
      controles={<span />}
      acoes={compraEncaminhada && podeCriarNovaSolicitacao ? <button type="button" className="btn btn-outline btn-sm"
        onClick={() => navigate(`/solicitacoes-compra/nova?obra_id=${dados.obra_id}&reaproveitar_solicitacao=${solicitacaoId}`)}>
        Reaproveitar em nova solicitação
      </button> : null}>
      <div className="space-y-2">{naoAprovados.map((item) => linhaItem(item, 'ITEM'))}</div>
      {compraEncaminhada && <div className="mt-3 flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-xs text-[var(--c-muted)]">Estes itens ficam bloqueados nesta solicitação. A nova solicitação terá cópias editáveis, sem alterar o pedido atual.</p>
        {!podeCriarNovaSolicitacao && <span className="text-xs text-[var(--c-muted)]">Peça a um usuário com permissão para criar solicitações de compra.</span>}
      </div>}
      {!compraEncaminhada && <p className="mt-3 text-xs text-[var(--c-muted)]">Após encaminhar os itens aprovados para Compras, será possível criar outra solicitação com estes itens.</p>}
    </BlocoConteudo>}
    <BlocoConteudo titulo="Cotação" contagem={`${itensEmCotacao.length} item(ns)`} recolhivel recolhidoPadrao>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-outline btn-sm"
          onClick={() => abrirComentario('COTACAO', dados.solicitacao_compra_id)}>Comentar na cotação</button>
      </div>
      <Comentarios lista={comentariosDaEtapa(dados.comentarios, 'COTACAO', dados.solicitacao_compra_id)} />
      {formularioComentario('COTACAO', dados.solicitacao_compra_id)}
      <div className="mt-3 border-t border-[var(--c-border)] pt-3">
        <p className="mb-2 text-xs font-semibold text-[var(--c-muted)]">Itens enviados para fornecedores</p>
        {itensEmCotacao.length ? <div className="divide-y divide-[var(--c-border)] rounded-md border border-[var(--c-border)]">
          {itensEmCotacao.map((item) => <div key={`${item.item_tipo}-${item.id}`} className="px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 font-semibold">{item.nome}</span>
              <span className="text-[var(--c-muted)]">{quantidade(item.quantidade)} {item.unidade_sigla_manual || item.unidade?.sigla || ''}</span>
              <button type="button" className="btn btn-outline btn-sm"
                onClick={() => abrirComentario('ITEM', item.id, item.item_tipo, 'COTACAO_ITEM')}>Comentar no item</button>
            </div>
            <Comentarios lista={comentariosDoItem(dados.comentarios, item, dados.pedidos)} />
            {formularioComentario('ITEM', item.id, item.item_tipo, 'COTACAO_ITEM')}
          </div>)}
        </div> : <p className="text-sm text-[var(--c-muted)]">Nenhum item enviado para fornecedores nesta solicitação.</p>}
      </div>
      {mostrarCotacao && <div className="mt-3">
        {!podeGerenciarCotacao && <p className="mb-2 text-xs text-[var(--c-muted)]">
          Para executar ações na cotação, solicite o retorno da solicitação ao setor de Compras.
        </p>}
        <fieldset className="min-w-0 max-w-full" disabled={!podeGerenciarCotacao}>
          <GerenciarCotacaoSolicitacao solicitacaoCompraId={dados.solicitacao_compra_id} embedded onAtualizado={carregar} />
        </fieldset>
      </div>}
    </BlocoConteudo>
    <BlocoConteudo titulo="Pedidos de compra" contagem={`${dados.pedidos.length} pedido(s)`} recolhivel recolhidoPadrao>
      {dados.pedidos.length ? <div className="space-y-2">{dados.pedidos.map((pedido) => <details key={pedido.id}
        className="rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
        <summary className="cursor-pointer text-sm font-semibold">Pedido #{pedido.id} · {pedido.status}</summary>
        <PedidoResumo pedido={pedido} user={user}
          onUpdated={async () => { await carregar(); await onUpdated?.(); }} />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(`/pedidos-compra/${pedido.id}`)}>Abrir pedido completo</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => abrirComentario('PEDIDO', pedido.id)}>Comentar no pedido</button>
          {podeAnexar && <label className="btn btn-outline btn-sm cursor-pointer">Anexar documento da compra
            <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="sr-only" disabled={!!processando}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                void executar(`anexo-${pedido.id}`, async () => {
                  const upload = await uploadAnexoTemporarioCompra(file);
                  await anexarEspelhoPedidoCompra(pedido.id, {
                    arquivo_url: upload?.arquivo_url,
                    arquivo_nome_original: upload?.arquivo_nome_original || file.name
                  });
                }, 'Documento anexado ao pedido.');
              }} />
          </label>}
        </div>
        {pedido.espelho_fornecedor_url && <p className="mt-2 text-xs text-[var(--c-muted)]">
          Documento anexado: {pedido.espelho_fornecedor_nome || 'arquivo do pedido'} · abra o pedido completo para visualizar.
        </p>}
        <Comentarios lista={comentariosDaEtapa(dados.comentarios, 'PEDIDO', pedido.id)} />
        {formularioComentario('PEDIDO', pedido.id)}
        <PedidoEntrega pedido={pedido} solicitacaoId={solicitacaoId} podeReceber={podeReceber} podeProgramar={podeProgramarEntrega}
          onUpdated={async () => { await carregar(); await onUpdated?.(); }} renderComentarios={(item) => <>
            <button type="button" className="btn btn-outline btn-sm mt-2" onClick={() => abrirComentario('PEDIDO_ITEM', item.id)}>Comentar no item</button>
            <Comentarios lista={comentariosDoItemPedido(dados.comentarios, item, dados.pedidos)} />
            {formularioComentario('PEDIDO_ITEM', item.id)}{formularioComentario('ENTREGA', item.id)}
          </>} />
      </details>)}</div> : <p className="text-sm text-[var(--c-muted)]">Ainda não há pedidos vinculados.</p>}
    </BlocoConteudo>
  </div>;
}
