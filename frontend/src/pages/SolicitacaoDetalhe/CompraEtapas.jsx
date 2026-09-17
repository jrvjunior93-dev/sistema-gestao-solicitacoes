import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avisos, BlocoConteudo, useAvisos } from '../../components/padrao';
import { API_URL, authHeaders } from '../../services/api';
import {
  anexarEspelhoPedidoCompra,
  comentarEtapaCompraSolicitacao,
  decidirItemCompraSolicitacao,
  encaminharSolicitacaoCompraParaCompras,
  obterEtapasCompraSolicitacao,
  receberItemCompraSolicitacao,
  uploadAnexoTemporarioCompra
} from '../../services/compras';
import GerenciarCotacaoSolicitacao from '../../modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao';

function quantidade(value) {
  return Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function Comentarios({ lista, escopo, referenciaId, itemTipo }) {
  const relevantes = lista.filter((comentario) => comentario.escopo === escopo
    && Number(comentario.referencia_id) === Number(referenciaId)
    && (!itemTipo || comentario.item_tipo === itemTipo));
  if (!relevantes.length) return null;
  return <div className="space-y-1 border-l-2 border-[var(--c-border)] pl-3 text-sm">
    {relevantes.map((comentario) => <p key={comentario.id}>
      <strong>{comentario.usuario?.nome || 'Usuário'}:</strong> {comentario.descricao}
    </p>)}
  </div>;
}

export default function CompraEtapas({ solicitacaoId, podeDecidir, podeReceber, podeAnexar, mostrarCotacao, podeGerenciarCotacao, onGerenciarItens, onUpdated }) {
  const navigate = useNavigate();
  const { avisos, avisar, fechar } = useAvisos();
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
  const [quantidadesEntrega, setQuantidadesEntrega] = useState({});
  const [chavesEntrega, setChavesEntrega] = useState({});
  const [cotacaoAberta, setCotacaoAberta] = useState(false);

  async function carregar() {
    const retorno = await obterEtapasCompraSolicitacao(solicitacaoId);
    setDados(retorno);
  }

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    obterEtapasCompraSolicitacao(solicitacaoId)
      .then((retorno) => { if (ativo) setDados(retorno); })
      .catch((error) => { if (ativo) avisar.erro(error.message || 'Erro ao carregar itens da compra.'); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [solicitacaoId]);

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

  function abrirComentario(escopo, referenciaId, itemTipo = null) {
    setComentando({ escopo, referencia_id: referenciaId, item_tipo: itemTipo });
    setTexto('');
    setMencoes([]);
    setBuscaMencao('');
  }

  function formularioComentario(escopo, referenciaId, itemTipo = null) {
    if (comentando?.escopo !== escopo || Number(comentando?.referencia_id) !== Number(referenciaId)
      || (comentando?.item_tipo || null) !== itemTipo) return null;
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
            ...comentando, descricao: texto, mencoes: mencoes.map((usuario) => usuario.id)
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

  const pendentes = dados.itens.filter((item) => item.status_aprovacao === 'PENDENTE');
  const aprovados = dados.itens.filter((item) => !item.status_aprovacao || item.status_aprovacao === 'APROVADO');
  const rejeitados = dados.itens.filter((item) => item.status_aprovacao === 'REJEITADO');
  const cotacaoIniciada = ['COTACAO', 'COTACAO_ENVIADA', 'EM_COTACAO', 'FECHAMENTO_PARCIAL', 'ENCERRADO']
    .includes(String(dados.status_compra || '').toUpperCase());

  const linhaItem = (item, escopo) => <div key={`${item.item_tipo}-${item.id}`}
    className="rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2">
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="min-w-0 flex-1 font-semibold">{item.nome}</span>
      <span className="text-[var(--c-muted)]">{quantidade(item.quantidade)} {item.unidade_sigla_manual || item.unidade?.sigla || ''}</span>
      {item.status_aprovacao === 'PENDENTE' && podeDecidir && <>
        <button type="button" className="btn btn-primary btn-sm" disabled={!!processando}
          onClick={() => decidir(item, 'APROVADO')}>Aprovar</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={!!processando}
          onClick={() => decidir(item, 'REJEITADO')}>Rejeitar</button>
      </>}
      {(!cotacaoIniciada || escopo === 'ITEM') && <button type="button" className="btn btn-outline btn-sm"
        onClick={() => abrirComentario(escopo, item.id, item.item_tipo)}>Comentar</button>}
    </div>
    {item.status_aprovacao === 'PENDENTE' && podeDecidir && <input className="input mt-2 w-full"
      value={motivos[`${item.item_tipo}-${item.id}`] || ''}
      onChange={(event) => setMotivos((atuais) => ({ ...atuais, [`${item.item_tipo}-${item.id}`]: event.target.value }))}
      placeholder="Motivo para rejeição (obrigatório ao rejeitar)" />}
    {cotacaoIniciada && escopo === 'ITEM_APROVADO' && <p className="mt-1 text-xs text-[var(--c-muted)]">Em cotação ou pedido: comente no card da etapa correspondente.</p>}
    {item.especificacao && <p className="mt-1 text-sm text-[var(--c-muted)]">{item.especificacao}</p>}
    <Comentarios lista={dados.comentarios} escopo={escopo} referenciaId={item.id} itemTipo={item.item_tipo} />
    {formularioComentario(escopo, item.id, item.item_tipo)}
  </div>;

  return <div className="space-y-3">
    <Avisos avisos={avisos} aoFechar={fechar} />
    <BlocoConteudo titulo="Itens da solicitação" contagem={`${pendentes.length} pendente(s)`} recolhivel
      acoes={onGerenciarItens ? <button type="button" className="btn btn-outline btn-sm" onClick={onGerenciarItens}>Gerenciar itens</button> : null}>
      <div className="space-y-2">
        {pendentes.length ? pendentes.map((item) => linhaItem(item, 'ITEM')) : <p className="text-sm text-[var(--c-muted)]">Nenhum item aguardando decisão do GEO.</p>}
      </div>
    </BlocoConteudo>
    <BlocoConteudo titulo="Itens aprovados" contagem={`${aprovados.length} item(ns)`} recolhivel>
      <div className="space-y-2">
        {aprovados.length ? aprovados.map((item) => linhaItem(item, 'ITEM_APROVADO')) : <p className="text-sm text-[var(--c-muted)]">Aprovações do GEO aparecerão aqui.</p>}
      </div>
      {podeDecidir && aprovados.length > 0 && dados.status_compra === 'PENDENTE' &&
        <div className="mt-3 flex justify-end"><button type="button" className="btn btn-primary btn-sm" disabled={!!processando}
          onClick={() => executar('encaminhar', () => encaminharSolicitacaoCompraParaCompras(dados.solicitacao_compra_id),
            'Itens aprovados encaminhados para Compras.')}>Encaminhar aprovados para Compras</button></div>}
    </BlocoConteudo>
    {rejeitados.length > 0 && <BlocoConteudo titulo="Itens rejeitados" contagem={`${rejeitados.length} item(ns)`} recolhivel recolhidoPadrao>
      <div className="space-y-2">{rejeitados.map((item) => linhaItem(item, 'ITEM'))}</div>
      <button type="button" className="btn btn-outline btn-sm mt-3"
        onClick={() => navigate(`/solicitacoes-compra/nova?obra_id=${dados.obra_id}&reaproveitar_solicitacao=${solicitacaoId}`)}>
        Criar nova solicitação com itens rejeitados
      </button>
    </BlocoConteudo>}
    <BlocoConteudo titulo="Cotação" recolhivel recolhidoPadrao>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-outline btn-sm"
          onClick={() => abrirComentario('COTACAO', dados.solicitacao_compra_id)}>Comentar na cotação</button>
        {mostrarCotacao && <button type="button" className="btn btn-outline btn-sm"
          onClick={() => setCotacaoAberta((aberta) => !aberta)}>{cotacaoAberta ? 'Recolher gestão da cotação' : 'Abrir gestão da cotação'}</button>}
      </div>
      <Comentarios lista={dados.comentarios} escopo="COTACAO" referenciaId={dados.solicitacao_compra_id} />
      {formularioComentario('COTACAO', dados.solicitacao_compra_id)}
      {mostrarCotacao && cotacaoAberta && <div className="mt-3">
        {!podeGerenciarCotacao && <p className="mb-2 text-xs text-[var(--c-muted)]">
          Para executar ações na cotação, solicite o retorno da solicitação ao setor de Compras.
        </p>}
        <fieldset disabled={!podeGerenciarCotacao}>
          <GerenciarCotacaoSolicitacao solicitacaoCompraId={dados.solicitacao_compra_id} embedded />
        </fieldset>
      </div>}
    </BlocoConteudo>
    <BlocoConteudo titulo="Pedidos de compra" contagem={`${dados.pedidos.length} pedido(s)`} recolhivel recolhidoPadrao>
      {dados.pedidos.length ? <div className="space-y-2">{dados.pedidos.map((pedido) => <details key={pedido.id}
        className="rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] p-3">
        <summary className="cursor-pointer text-sm font-semibold">Pedido #{pedido.id} · {pedido.status}</summary>
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
        <Comentarios lista={dados.comentarios} escopo="PEDIDO" referenciaId={pedido.id} />
        {formularioComentario('PEDIDO', pedido.id)}
        <div className="mt-3 space-y-2">{pedido.itens.map((item) => {
          const recebido = item.recebimentos.reduce((acc, linha) => acc + Number(linha.quantidade || 0), 0);
          const total = Number(item.quantidade_pedido || 0) - Number(item.quantidade_cancelada || 0);
          return <div key={item.id} className="rounded border border-[var(--c-border)] p-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex-1 font-medium">{item.descricao}</span>
              <span>{quantidade(recebido)} / {quantidade(total)} entregue(s)</span>
              <button type="button" className="btn btn-outline btn-sm"
                onClick={() => abrirComentario(recebido > 0 ? 'ENTREGA' : 'PEDIDO_ITEM', item.id)}>Comentar</button>
            </div>
            {podeReceber && recebido < total && <div className="mt-2 flex flex-wrap gap-2">
              <input className="input w-28" inputMode="decimal" aria-label={`Quantidade recebida de ${item.descricao}`}
                value={quantidadesEntrega[item.id] || ''} onChange={(event) => setQuantidadesEntrega((atual) => ({ ...atual, [item.id]: event.target.value }))} />
              <button type="button" className="btn btn-primary btn-sm" disabled={!!processando}
                onClick={() => executar(`receber-${item.id}`, async () => {
                  const idempotencyKey = chavesEntrega[item.id] || crypto.randomUUID();
                  setChavesEntrega((atual) => ({ ...atual, [item.id]: idempotencyKey }));
                  await receberItemCompraSolicitacao(solicitacaoId, pedido.id, item.id, {
                    quantidade: Number((quantidadesEntrega[item.id] || '').replace(',', '.')),
                    idempotency_key: idempotencyKey
                  });
                  setQuantidadesEntrega((atual) => ({ ...atual, [item.id]: '' }));
                  setChavesEntrega((atual) => ({ ...atual, [item.id]: null }));
                }, 'Entrega registrada para este item.')}>Marcar como entregue</button>
            </div>}
            <Comentarios lista={dados.comentarios} escopo="PEDIDO_ITEM" referenciaId={item.id} />
            <Comentarios lista={dados.comentarios} escopo="ENTREGA" referenciaId={item.id} />
            {formularioComentario('PEDIDO_ITEM', item.id)}{formularioComentario('ENTREGA', item.id)}
          </div>;
        })}</div>
      </details>)}</div> : <p className="text-sm text-[var(--c-muted)]">Ainda não há pedidos vinculados.</p>}
    </BlocoConteudo>
  </div>;
}
