import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_URL, authHeaders } from '../services/api';

// =====================================================================
// BLOCOS OPCIONAIS DA HOME — componentes de conteúdo
// ---------------------------------------------------------------------
// Cada bloco busca os PRÓPRIOS dados quando entra na tela (carregamento
// sob demanda: bloco desligado não consulta nada) e tem estado de
// carregamento próprio — um bloco lento não trava a Home. As permissões
// reais são conferidas no backend (403 → o bloco explica e some do
// caminho); o catálogo já nem oferece blocos sem permissão.
// =====================================================================

function formatarMoeda(valor) {
  if (valor === null || valor === undefined) return null;
  const numero = Number(valor);
  if (Number.isNaN(numero)) return null;
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dataCurta(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function horaCurta(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const DIA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// Busca genérica de um bloco: /home/blocos/:id, com loading/erro locais.
function useBlocoDados(caminho) {
  const [estado, setEstado] = useState({ carregando: true, erro: '', dados: null });
  useEffect(() => {
    let ativo = true;
    setEstado({ carregando: true, erro: '', dados: null });
    fetch(`${API_URL}${caminho}`, { headers: authHeaders() })
      .then(async (res) => {
        if (!res.ok) {
          const corpo = await res.json().catch(() => ({}));
          throw new Error(corpo?.error || `Erro ao carregar (${res.status})`);
        }
        return res.json();
      })
      .then((dados) => { if (ativo) setEstado({ carregando: false, erro: '', dados }); })
      .catch((erro) => { if (ativo) setEstado({ carregando: false, erro: erro.message, dados: null }); });
    return () => { ativo = false; };
  }, [caminho]);
  return estado;
}

function CascaBloco({ titulo, carregando, erro, vazio, children }) {
  return (
    <section className="hub-extra" aria-label={titulo}>
      <h2 className="hub-pendencias-title">{titulo}</h2>
      {carregando && <p className="hub-extra-estado">Carregando…</p>}
      {!carregando && erro && <p className="hub-extra-estado">{erro}</p>}
      {!carregando && !erro && vazio && <p className="hub-extra-estado">Nada por aqui agora.</p>}
      {!carregando && !erro && !vazio && children}
    </section>
  );
}

// Lista compacta de solicitações — usada pelos blocos de Trabalho.
function ListaSolicitacoes({ itens, extra }) {
  return (
    <ul className="hub-extra-lista">
      {itens.map((item) => (
        <li key={item.id}>
          <Link to={item.link} className="hub-extra-item">
            <span className="hub-extra-item-id">
              <strong>{item.codigo}</strong>
              {item.contexto && <span className="hub-extra-item-contexto">{item.contexto}</span>}
            </span>
            <span className="hub-extra-item-texto">{item.descricao}</span>
            <span className="hub-extra-item-fim">{extra ? extra(item) : null}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function BlocoUltimasTocadas() {
  const { carregando, erro, dados } = useBlocoDados('/home/blocos/ultimas_tocadas');
  const itens = dados?.itens || [];
  return (
    <CascaBloco titulo="Últimas solicitações que você tocou" carregando={carregando} erro={erro} vazio={itens.length === 0}>
      <ListaSolicitacoes itens={itens} extra={(item) => `${item.acao} · ${dataCurta(item.quando) || ''}`} />
    </CascaBloco>
  );
}

export function BlocoAguardandoResposta() {
  const { carregando, erro, dados } = useBlocoDados('/home/blocos/aguardando_resposta');
  const itens = dados?.itens || [];
  return (
    <CascaBloco titulo="Aguardando resposta de outro setor" carregando={carregando} erro={erro} vazio={itens.length === 0}>
      <ListaSolicitacoes itens={itens} extra={(item) => `com ${item.setor || '?'}${item.enviado_em ? ` desde ${dataCurta(item.enviado_em)}` : ''}`} />
    </CascaBloco>
  );
}

export function BlocoMinhasCriadas() {
  const { carregando, erro, dados } = useBlocoDados('/home/blocos/minhas_criadas');
  const itens = dados?.itens || [];
  return (
    <CascaBloco titulo="Solicitações que você criou em andamento" carregando={carregando} erro={erro} vazio={itens.length === 0}>
      <ListaSolicitacoes itens={itens} extra={(item) => item.status || ''} />
    </CascaBloco>
  );
}

export function BlocoMudouHoje() {
  const { carregando, erro, dados } = useBlocoDados('/home/blocos/mudou_hoje');
  const itens = dados?.itens || [];
  return (
    <CascaBloco titulo="O que mudou hoje no seu setor" carregando={carregando} erro={erro} vazio={itens.length === 0}>
      <ul className="hub-extra-lista">
        {itens.map((item, indice) => (
          <li key={`${item.id}-${indice}`}>
            <Link to={item.link} className="hub-extra-item">
              <span className="hub-extra-item-id"><strong>{item.codigo}</strong></span>
              <span className="hub-extra-item-texto">{item.acao}{item.usuario ? ` — ${item.usuario}` : ''}</span>
              <span className="hub-extra-item-fim">{horaCurta(item.quando)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </CascaBloco>
  );
}

// Barras proporcionais simples (sem biblioteca): vencidos + 6 semanas.
export function BlocoGraficoPagar() {
  const { carregando, erro, dados } = useBlocoDados('/home/blocos/grafico_pagar');
  const periodos = dados?.periodos || [];
  const maior = Math.max(1, ...periodos.map((p) => p.total));
  const vazio = periodos.every((p) => p.total === 0 && p.quantidade === 0);
  return (
    <CascaBloco titulo="Contas a pagar por período" carregando={carregando} erro={erro} vazio={periodos.length === 0 || vazio}>
      <ul className="hub-grafico">
        {periodos.map((periodo) => (
          <li key={periodo.rotulo}>
            <Link to={periodo.link} className="hub-grafico-linha" title={`${periodo.quantidade} título(s)`}>
              <span className="hub-grafico-rotulo">{periodo.rotulo}</span>
              <span className="hub-grafico-trilha">
                <span
                  className={`hub-grafico-barra ${periodo.rotulo === 'Vencidos' ? 'hub-grafico-barra--danger' : ''}`}
                  style={{ width: `${Math.max(2, Math.round((periodo.total / maior) * 100))}%` }}
                />
              </span>
              <span className="hub-grafico-valor">{formatarMoeda(periodo.total)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </CascaBloco>
  );
}

export function BlocoCalendarioVencimentos() {
  const { carregando, erro, dados } = useBlocoDados('/home/blocos/calendario_vencimentos');
  const dias = dados?.dias || [];
  const vazio = dias.every((dia) => dia.quantidade === 0);
  return (
    <CascaBloco titulo="Calendário de vencimentos da semana" carregando={carregando} erro={erro} vazio={dias.length === 0 || vazio}>
      <ul className="hub-calendario">
        {dias.map((dia) => {
          const data = new Date(`${dia.data}T00:00:00`);
          return (
            <li key={dia.data}>
              <Link
                to={dia.link}
                className={`hub-calendario-dia ${dia.quantidade > 0 ? 'hub-calendario-dia--tem' : ''}`}
              >
                <span className="hub-calendario-semana">{DIA_SEMANA[data.getDay()]}</span>
                <span className="hub-calendario-numero">{String(data.getDate()).padStart(2, '0')}</span>
                <span className="hub-calendario-qtd">{dia.quantidade > 0 ? dia.quantidade : '—'}</span>
                <span className="hub-calendario-total">{dia.quantidade > 0 ? formatarMoeda(dia.total) : ''}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </CascaBloco>
  );
}

export function BlocoSaldoCaixas() {
  const { carregando, erro, dados } = useBlocoDados('/home/blocos/saldo_caixas');
  const contas = dados?.contas || [];
  return (
    <CascaBloco titulo="Saldo dos caixas e contas" carregando={carregando} erro={erro} vazio={contas.length === 0}>
      <ul className="hub-extra-lista">
        {contas.map((conta) => (
          <li key={conta.id}>
            <Link to={conta.link} className="hub-extra-item">
              <span className="hub-extra-item-texto">
                {conta.nome}
                {conta.caixa_aberto && <span className="hub-extra-selo">caixa aberto</span>}
              </span>
              <span className={`hub-extra-item-fim hub-extra-valor ${Number(conta.saldo) < 0 ? 'hub-extra-valor--danger' : ''}`}>
                {formatarMoeda(conta.saldo)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </CascaBloco>
  );
}

export function BlocoGastoMes() {
  const { carregando, erro, dados } = useBlocoDados('/home/blocos/gasto_mes');
  const atual = dados?.atual;
  const anterior = dados?.anterior;
  const variacao = atual && anterior && anterior.total > 0
    ? ((atual.total - anterior.total) / anterior.total) * 100
    : null;
  return (
    <CascaBloco titulo="Gasto do mês vs mês anterior" carregando={carregando} erro={erro} vazio={!atual}>
      <div className="hub-gasto">
        <div className="hub-gasto-col">
          <span className="hub-gasto-rotulo">Pago neste mês</span>
          <span className="hub-gasto-valor">{formatarMoeda(atual?.total || 0)}</span>
          <span className="hub-gasto-qtd">{atual?.quantidade || 0} título(s)</span>
        </div>
        <div className="hub-gasto-col">
          <span className="hub-gasto-rotulo">Mês anterior</span>
          <span className="hub-gasto-valor hub-gasto-valor--anterior">{formatarMoeda(anterior?.total || 0)}</span>
          <span className="hub-gasto-qtd">{anterior?.quantidade || 0} título(s)</span>
        </div>
        {variacao !== null && (
          <span className={`hub-gasto-variacao ${variacao > 0 ? 'hub-gasto-variacao--alta' : 'hub-gasto-variacao--baixa'}`}>
            {variacao > 0 ? '+' : ''}{variacao.toFixed(0)}%
          </span>
        )}
      </div>
    </CascaBloco>
  );
}

export function BlocoContratosMedir() {
  const { carregando, erro, dados } = useBlocoDados('/home/blocos/contratos_medir');
  const itens = dados?.itens || [];
  return (
    <CascaBloco titulo="Contratos com saldo a medir" carregando={carregando} erro={erro} vazio={itens.length === 0}>
      <ul className="hub-extra-lista">
        {itens.map((item) => (
          <li key={item.id}>
            <Link to={item.link} className="hub-extra-item">
              <span className="hub-extra-item-id">
                <strong>{item.codigo}</strong>
                {item.contexto && <span className="hub-extra-item-contexto">{item.contexto}</span>}
              </span>
              <span className="hub-extra-item-texto">{item.descricao}</span>
              <span className="hub-extra-item-fim hub-extra-valor">{formatarMoeda(item.saldo_medir)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </CascaBloco>
  );
}

export function BlocoComprasPendentes() {
  const { carregando, erro, dados } = useBlocoDados('/home/blocos/compras_pendentes');
  const contadores = dados?.contadores || [];
  const itens = dados?.itens || [];
  const vazio = contadores.every((c) => c.quantidade === 0) && itens.length === 0;
  return (
    <CascaBloco titulo="Cotações e pedidos de compra pendentes" carregando={carregando} erro={erro} vazio={vazio}>
      <div className="hub-compras-contadores">
        {contadores.map((contador) => (
          <Link key={contador.rotulo} to={contador.link} className="hub-compras-contador">
            <strong>{contador.quantidade}</strong> {contador.rotulo}
          </Link>
        ))}
      </div>
      {itens.length > 0 && (
        <ul className="hub-extra-lista">
          {itens.map((item) => (
            <li key={item.id}>
              <Link to={item.link} className="hub-extra-item">
                <span className="hub-extra-item-texto">{item.titulo}</span>
                <span className="hub-extra-item-fim">{dataCurta(item.quando)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CascaBloco>
  );
}

// Últimas conversas internas — reaproveita o endpoint da tela de
// Comunicação (mesmo gate de módulo/permissão do backend).
export function BlocoAvisos() {
  const { carregando, erro, dados } = useBlocoDados('/conversas-internas?limit=5');
  const itens = dados?.items || [];
  return (
    <CascaBloco titulo="Avisos e comunicação interna" carregando={carregando} erro={erro} vazio={itens.length === 0}>
      <ul className="hub-extra-lista">
        {itens.map((conversa) => (
          <li key={conversa.id}>
            <Link to="/comunicacao-interna" className="hub-extra-item">
              <span className="hub-extra-item-texto">
                {conversa.tem_novidade && <span className="hub-extra-ponto" aria-hidden="true" />}
                {conversa.assunto || conversa.last_message_preview || 'Conversa'}
              </span>
              <span className="hub-extra-item-fim">{dataCurta(conversa.last_message_at)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </CascaBloco>
  );
}

// Resumo compacto do dashboard executivo — reaproveita /dashboard/executivo
// (mesmo gate da tela Painel).
export function BlocoIndicadoresExecutivos() {
  const { carregando, erro, dados } = useBlocoDados('/dashboard/executivo');
  const financeiro = dados?.financeiro || null;
  const vazio = !dados;
  return (
    <CascaBloco titulo="Indicadores do dashboard executivo" carregando={carregando} erro={erro} vazio={vazio}>
      <div className="hub-indicadores">
        <Link to="/dashboard" className="hub-indicador">
          <span className="hub-indicador-rotulo">Solicitações</span>
          <span className="hub-indicador-valor">{Number(dados?.total || 0)}</span>
        </Link>
        {financeiro?.enabled && (
          <>
            <Link to="/dashboard" className="hub-indicador">
              <span className="hub-indicador-rotulo">A pagar em aberto</span>
              <span className="hub-indicador-valor">{formatarMoeda(financeiro.total_pagar_aberto || 0)}</span>
            </Link>
            <Link to="/dashboard" className="hub-indicador">
              <span className="hub-indicador-rotulo">Pagar vencido</span>
              <span className="hub-indicador-valor hub-extra-valor--danger">{formatarMoeda(financeiro.pagar_vencido || 0)}</span>
            </Link>
            <Link to="/dashboard" className="hub-indicador">
              <span className="hub-indicador-rotulo">A receber em aberto</span>
              <span className="hub-indicador-valor">{formatarMoeda(financeiro.total_receber_aberto || 0)}</span>
            </Link>
          </>
        )}
      </div>
    </CascaBloco>
  );
}

// Mapa id do bloco → componente (usado pelo HomeHub).
export const COMPONENTE_BLOCO_EXTRA = {
  ultimas_tocadas: BlocoUltimasTocadas,
  aguardando_resposta: BlocoAguardandoResposta,
  minhas_criadas: BlocoMinhasCriadas,
  mudou_hoje: BlocoMudouHoje,
  grafico_pagar: BlocoGraficoPagar,
  calendario_vencimentos: BlocoCalendarioVencimentos,
  saldo_caixas: BlocoSaldoCaixas,
  gasto_mes: BlocoGastoMes,
  contratos_medir: BlocoContratosMedir,
  compras_pendentes: BlocoComprasPendentes,
  avisos: BlocoAvisos,
  indicadores_executivos: BlocoIndicadoresExecutivos
};
