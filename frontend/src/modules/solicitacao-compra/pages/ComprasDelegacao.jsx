import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  delegarSolicitacaoCompra,
  listarSolicitacoesCompra,
  listarUsuariosDelegacaoCompras
} from '../../../services/compras';
import { useAuth } from '../../../contexts/AuthContext';
import { canManageComprasDelegacao } from '../../../utils/acessoProduto';
import { formatarDataLocalPtBr, parseDateSmart } from '../../../utils/dateLocal';
import {
  Avisos,
  BarraFiltros,
  BlocoConteudo,
  CampoForm,
  FormSecao,
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  useAvisos
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';
import { chaveStatusCompra } from '../utils/statusCompras';
import useComprasRealtimeRefresh from '../hooks/useComprasRealtimeRefresh';
import DateInputBR from '../../../components/DateInputBR';

function formatDate(value) {
  return formatarDataLocalPtBr(value);
}

/*
  O prazo vira etiqueta semântica, não classe de paleta crua: `bg-red-100
  text-red-700` / `bg-emerald-100 text-emerald-700` / `bg-slate-100` não têm
  par no tema escuro nem passam pelo piso de contraste do ThemeContext (R25).
  As três situações continuam distintas — atrasado em `danger`, no prazo em
  `success`, sem prazo em `neutral` — agora por token e com ícone junto (cor
  sozinha não comunica para daltônicos).
*/
function getPrazoInfo(solicitacao) {
  if (!solicitacao?.prazo_compra) {
    return { label: 'Sem prazo', kind: 'neutral', atrasado: false };
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const prazo = parseDateSmart(solicitacao.prazo_compra);
  if (!prazo) {
    return { label: 'Sem prazo', kind: 'neutral', atrasado: false };
  }
  prazo.setHours(0, 0, 0, 0);
  const atrasado = prazo.getTime() < hoje.getTime();

  return atrasado
    ? { label: `Atrasado desde ${formatDate(solicitacao.prazo_compra)}`, kind: 'danger', atrasado: true }
    : { label: `Prazo ${formatDate(solicitacao.prazo_compra)}`, kind: 'success', atrasado: false };
}

/*
  Fechada = ENCERRADA/ENCERRADO/RECUSADA/CANCELADA. A comparação passa pela
  chave canônica do módulo, que colapsa as DUAS grafias gravadas para o mesmo
  estado (CANCELADO/CANCELADA, RECUSADO/RECUSADA) — esta tela já se defendia
  listando as duas formas à mão; agora a defesa mora num lugar só.
*/
function isCompraAberta(status) {
  return !['ENCERRADO', 'RECUSADO', 'CANCELADO'].includes(chaveStatusCompra(status));
}

function isPedidoCancelado(pedido) {
  return chaveStatusCompra(pedido?.status) === 'CANCELADO';
}

function isPedidoFechadoComFornecedor(pedido) {
  const normalized = chaveStatusCompra(pedido?.status);
  return (
    normalized === 'FECHADO_FORNECEDOR' ||
    (normalized.includes('FECHADO') && normalized.includes('FORNECEDOR'))
  );
}

function isCompraOcultaDelegacaoPorPedidos(solicitacao) {
  if (chaveStatusCompra(solicitacao?.status) === 'FECHAMENTO_PARCIAL') {
    return false;
  }
  const pedidos = Array.isArray(solicitacao?.pedidos) ? solicitacao.pedidos : [];
  const ativos = pedidos.filter((pedido) => !isPedidoCancelado(pedido));
  return ativos.length > 0 && ativos.every(isPedidoFechadoComFornecedor);
}

function MotivoRegistrado({ label, motivo }) {
  if (!String(motivo || '').trim()) {
    return null;
  }

  // R25: a caixa era `border-slate-200 bg-slate-50` com rótulo em
  // `text-[11px]` (R10: medida à mão, abaixo do piso de 12px). Bloco
  // secundário do padrão: superfície, contorno e escala vêm do componente.
  return (
    <BlocoConteudo titulo={label} variante="secundario">
      <p className="whitespace-pre-wrap break-words">{motivo}</p>
    </BlocoConteudo>
  );
}

export default function ComprasDelegacao() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { avisos, avisar, fechar } = useAvisos();
  const podeGerenciarDelegacao = canManageComprasDelegacao(user);
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [edicoes, setEdicoes] = useState({});
  const [salvandoId, setSalvandoId] = useState(null);

  async function carregar() {
    try {
      setLoading(true);
      const [dataSolicitacoes, dataUsuarios] = await Promise.all([
        listarSolicitacoesCompra({ contexto: 'delegacao', visao: 'delegacao' }),
        podeGerenciarDelegacao ? listarUsuariosDelegacaoCompras() : Promise.resolve([])
      ]);
      const listaSolicitacoes = Array.isArray(dataSolicitacoes) ? dataSolicitacoes : [];
      setSolicitacoes(
        podeGerenciarDelegacao
          ? listaSolicitacoes
          : listaSolicitacoes.filter((solicitacao) => (
            Number(solicitacao.comprador_responsavel_id) === Number(user?.id)
          ))
      );
      setUsuarios(Array.isArray(dataUsuarios) ? dataUsuarios : []);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar painel de delegacao de compras');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [podeGerenciarDelegacao, user?.id]);

  useComprasRealtimeRefresh(carregar);

  const solicitacoesFiltradas = useMemo(() => {
    const termo = filtro.trim().toLowerCase();
    return solicitacoes
      .filter((solicitacao) => !isCompraOcultaDelegacaoPorPedidos(solicitacao))
      .filter((solicitacao) => isCompraAberta(solicitacao.status))
      .filter((solicitacao) => {
        if (!termo) return true;
        return [
          `SC-${String(solicitacao.id).padStart(5, '0')}`,
          solicitacao.obra?.nome,
          solicitacao.solicitante?.nome,
          solicitacao.compradorResponsavel?.nome,
          solicitacao.status
        ].some((value) => String(value || '').toLowerCase().includes(termo));
      });
  }, [filtro, solicitacoes]);

  const resumo = useMemo(() => {
    return solicitacoesFiltradas.reduce(
      (acc, solicitacao) => {
        acc.total += 1;
        if (solicitacao.comprador_responsavel_id) acc.atribuidas += 1;
        if (getPrazoInfo(solicitacao).atrasado) acc.atrasadas += 1;
        return acc;
      },
      { total: 0, atribuidas: 0, atrasadas: 0 }
    );
  }, [solicitacoesFiltradas]);

  function getEdicao(solicitacao) {
    return {
      responsavel_id: solicitacao.comprador_responsavel_id || '',
      prazo_compra: solicitacao.prazo_compra || '',
      motivo_atraso: solicitacao.motivo_atraso || '',
      motivo_delegacao_vencida: solicitacao.motivo_delegacao_vencida || '',
      ...(edicoes[solicitacao.id] || {})
    };
  }

  function updateEdicao(id, changes) {
    setEdicoes((atuais) => ({
      ...atuais,
      [id]: {
        ...(atuais[id] || {}),
        ...changes
      }
    }));
  }

  function abrirSolicitacao(event, solicitacao) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (salvandoId === solicitacao.id) {
      return;
    }

    navigate(Number(solicitacao.solicitacao_principal_id) > 0
      ? `/solicitacoes/${solicitacao.solicitacao_principal_id}`
      : `/solicitacoes-compra/${solicitacao.id}`);
  }

  async function salvarDelegacao(event, solicitacao) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (salvandoId === solicitacao.id) {
      return;
    }

    const payload = getEdicao(solicitacao);
    const prazoInfo = getPrazoInfo({ ...solicitacao, prazo_compra: payload.prazo_compra });
    const motivoObrigatorio = podeGerenciarDelegacao
      ? payload.motivo_delegacao_vencida
      : payload.motivo_atraso;

    if (
      podeGerenciarDelegacao
      && String(payload.responsavel_id || '').trim()
      && !usuarios.some((usuario) => Number(usuario.id) === Number(payload.responsavel_id))
    ) {
      avisar.alerta('Selecione um usuário ativo vinculado ao setor de Compras ou remova o responsável atual.');
      return;
    }

    if (prazoInfo.atrasado && !String(motivoObrigatorio || '').trim()) {
      avisar.alerta(podeGerenciarDelegacao
        ? 'Informe o motivo para delegar com prazo ja vencido.'
        : 'Informe o motivo do atraso antes de salvar.');
      return;
    }

    try {
      setSalvandoId(solicitacao.id);
      await delegarSolicitacaoCompra(
        solicitacao.id,
        podeGerenciarDelegacao
          ? {
            responsavel_id: payload.responsavel_id,
            prazo_compra: payload.prazo_compra,
            motivo_delegacao_vencida: payload.motivo_delegacao_vencida
          }
          : { motivo_atraso: payload.motivo_atraso }
      );
      await carregar();
      avisar.sucesso(podeGerenciarDelegacao ? 'Delegacao atualizada.' : 'Motivo do atraso registrado.');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao salvar delegacao');
    } finally {
      setSalvandoId(null);
    }
  }

  return (
    <Pagina>
      <PageHeader
        titulo="Delegação de Compras"
        contagem={loading ? null : `${resumo.total} solicitacao(oes) aberta(s)`}
        descricao="Acompanhe responsável, prazo, status e motivo de atraso das solicitações de compra abertas."
        secundarias={[
          {
            rotulo: loading ? 'Atualizando...' : 'Atualizar',
            onClick: carregar,
            desabilitada: loading
          }
        ]}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <StatGrid colunas={3}>
        <StatTile label="Abertas" valor={resumo.total} />
        <StatTile label="Atribuídas" valor={resumo.atribuidas} tom="success" />
        <StatTile label="Atrasadas" valor={resumo.atrasadas} tom="danger" />
      </StatGrid>

      {/*
        A busca é a ÚNICA dimensão desta tela (o recorte de "abertas" é regra,
        não filtro), então a faixa traz só a busca larga da BarraFiltros —
        R16: uma responsabilidade, um dono.
      */}
      <BlocoConteudo variante="secundario">
        <BarraFiltros
          busca={{
            valor: filtro,
            aoMudar: setFiltro,
            placeholder: 'Solicitação, obra, responsável, solicitante ou status'
          }}
        />
      </BlocoConteudo>

      {/*
        PAINEL DE CARTÕES, não tabela: cada solicitação traz um mini-formulário
        (responsável, prazo, motivo) que se edita e se salva ali mesmo.
        `TabelaPadrao` aqui seria forçar linha em cima de formulário — o
        cartão é a forma certa para este trabalho.

        B2: os cartões passam a morar DENTRO do bloco principal da tela — é
        a lista de solicitacoes abertas que responde "quem responde por cada
        compra e para quando". Antes a tela inteira era secundária (busca e
        cartões), então nenhum bloco assumia a resposta central. A busca
        acima e cada cartão aqui dentro seguem secundários: eles recortam e
        detalham essa resposta, não a substituem.
      */}
      <BlocoConteudo
        titulo="Solicitações abertas"
        variante="primario"
        cor="var(--module-compras)"
      >
        <div className="grid gap-4 xl:grid-cols-2">
          {solicitacoesFiltradas.map((solicitacao) => {
            const edicao = getEdicao(solicitacao);
            const prazoInfo = getPrazoInfo({ ...solicitacao, prazo_compra: edicao.prazo_compra });
            const responsavelSelecionadoId = Number(edicao.responsavel_id || 0);
            const responsavelSelecionadoElegivel = usuarios.some(
              (usuario) => Number(usuario.id) === responsavelSelecionadoId
            );
            const responsavelNaoListado = responsavelSelecionadoId > 0 && !responsavelSelecionadoElegivel;
            const responsavelForaCompras = podeGerenciarDelegacao && responsavelNaoListado;
            /*
              ACHADO (registrado no relatório): quando o registro NÃO traz
              `compradorResponsavel`, a opção exibe "Usuario #12" — um id onde
              deveria estar um nome. O histórico desta tela grava nome; a lista
              de responsáveis, nesse caso de borda, não tem de onde tirar.
            */
            const responsavelForaComprasNome = solicitacao.compradorResponsavel?.nome
              || `Usuario #${responsavelSelecionadoId}`;

            return (
              <BlocoConteudo
                key={solicitacao.id}
                variante="secundario"
                titulo={`SC-${String(solicitacao.id).padStart(5, '0')}`}
                descricao={`${solicitacao.obra?.nome || 'Sem obra'} · ${solicitacao.solicitante?.nome || 'Sem solicitante'}`}
                acoes={<StatusBadge status={prazoInfo.label} kind={prazoInfo.kind} />}
              >
                {/* R12: select de FORMULÁRIO (entrada de dado) continua
                    legítimo — o que a regra proíbe é select de FILTRO. */}
                <FormSecao colunas={2}>
                  <CampoForm
                    label="Responsável"
                    hint={responsavelForaCompras && podeGerenciarDelegacao
                      ? 'A atribuicao anterior foi preservada. Selecione um usuario de Compras ou remova o responsavel antes de salvar.'
                      : (podeGerenciarDelegacao && !responsavelForaCompras
                        ? 'Somente usuarios ativos vinculados ao setor de Compras.'
                        : undefined)}
                  >
                    <select
                      className="input"
                      value={edicao.responsavel_id}
                      onChange={(event) => updateEdicao(solicitacao.id, { responsavel_id: event.target.value })}
                      disabled={!podeGerenciarDelegacao}
                    >
                      <option value="">Sem responsável</option>
                      {responsavelNaoListado ? (
                        <option value={responsavelSelecionadoId} disabled>
                          {responsavelForaComprasNome}
                          {responsavelForaCompras ? ' - fora do setor de Compras (atribuicao anterior)' : ''}
                        </option>
                      ) : null}
                      {usuarios.map((usuario) => (
                        <option key={usuario.id} value={usuario.id}>
                          {usuario.nome} {usuario.setor ? `- ${usuario.setor}` : ''}
                        </option>
                      ))}
                    </select>
                  </CampoForm>

                  <CampoForm label="Prazo para finalizar pedido">
                    <DateInputBR
                      className="input"
                      value={edicao.prazo_compra || ''}
                      onChange={(event) => updateEdicao(solicitacao.id, { prazo_compra: event.target.value })}
                      disabled={!podeGerenciarDelegacao}
                    />
                  </CampoForm>

                  {prazoInfo.atrasado ? (
                    <CampoForm
                      label={podeGerenciarDelegacao ? 'Motivo para delegar com prazo vencido' : 'Motivo do atraso'}
                      tipo="texto-longo"
                      obrigatorio
                    >
                      <textarea
                        className="input"
                        rows={3}
                        value={podeGerenciarDelegacao
                          ? (edicao.motivo_delegacao_vencida || '')
                          : (edicao.motivo_atraso || '')}
                        onChange={(event) => updateEdicao(
                          solicitacao.id,
                          podeGerenciarDelegacao
                            ? { motivo_delegacao_vencida: event.target.value }
                            : { motivo_atraso: event.target.value }
                        )}
                        placeholder={podeGerenciarDelegacao
                          ? 'Explique por que esta solicitacao esta sendo delegada com prazo ja vencido.'
                          : 'Explique o motivo do atraso antes de salvar.'}
                      />
                    </CampoForm>
                  ) : null}
                </FormSecao>

                {(solicitacao.motivo_delegacao_vencida || solicitacao.motivo_atraso) ? (
                  <>
                    <MotivoRegistrado
                      label="Motivo da delegação com prazo vencido"
                      motivo={solicitacao.motivo_delegacao_vencida}
                    />
                    <MotivoRegistrado
                      label="Motivo informado pelo responsável"
                      motivo={solicitacao.motivo_atraso}
                    />
                  </>
                ) : null}

                <div className="app-actionbar">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={(event) => abrirSolicitacao(event, solicitacao)}
                    disabled={salvandoId === solicitacao.id}
                  >
                    Abrir
                  </button>
                  {podeGerenciarDelegacao || prazoInfo.atrasado ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={(event) => salvarDelegacao(event, solicitacao)}
                      disabled={salvandoId === solicitacao.id}
                    >
                      {salvandoId === solicitacao.id
                        ? 'Salvando...'
                        : (podeGerenciarDelegacao ? 'Salvar delegacao' : 'Salvar motivo')}
                    </button>
                  ) : null}
                </div>
              </BlocoConteudo>
            );
          })}

          {!loading && solicitacoesFiltradas.length === 0 ? (
            <div className="app-empty-card xl:col-span-2">Nenhuma solicitação de compra aberta encontrada.</div>
          ) : null}
        </div>
      </BlocoConteudo>
    </Pagina>
  );
}
