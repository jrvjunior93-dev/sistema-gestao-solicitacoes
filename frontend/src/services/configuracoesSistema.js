import { API_URL, authHeaders } from './api';
import { mensagemDeErro } from './erroDeResposta';

const COMPRAS_COTACOES_PERMISSOES_DETALHADAS = [
  { key: 'compras.cotacoes.visualizar', label: 'Visualizar cotações', descricao: 'Ver cotações e comparativo de fornecedores.' },
  { key: 'compras.cotacoes.gerenciar', label: 'Gerenciar cotações', descricao: 'Criar, editar e operar cotações sem encerrar ou reabrir.' },
  { key: 'compras.cotacoes.editar_respostas', label: 'Editar respostas', descricao: 'Preencher, ajustar e salvar respostas de cotação.' },
  { key: 'compras.cotacoes.salvar_rascunho', label: 'Salvar rascunho', descricao: 'Salvar respostas parciais sem encerrar cotação.' },
  { key: 'compras.cotacoes.cancelar', label: 'Cancelar cotação', descricao: 'Cancelar uma cotação aberta, com ou sem respostas, mantendo a auditoria.' },
  { key: 'compras.cotacoes.fechar_parcial', label: 'Fechar parcialmente', descricao: 'Gerar pedidos dos itens selecionados e manter o saldo da cotação aberto.' },
  { key: 'compras.cotacoes.encerrar', label: 'Encerrar cotação', descricao: 'Gerar os pedidos finais e encerrar definitivamente a cotação.' },
  { key: 'compras.cotacoes.encerrar_sem_pedido', label: 'Encerrar sem pedido', descricao: 'Encerrar definitivamente a cotação descartando o saldo restante sem gerar novos pedidos.' },
  { key: 'compras.cotacoes.reabrir', label: 'Reabrir cotação', descricao: 'Reabrir cotação respondida para novo envio com justificativa.' }
];

function normalizarRegistryPermissoesAreas(registry) {
  if (!Array.isArray(registry)) return registry;

  return registry.map((grupo) => {
    if (!Array.isArray(grupo?.areas) || !grupo.areas.some((area) => area?.key === 'compras.cotacoes')) return grupo;

    return {
      ...grupo,
      areas: grupo.areas.map((area) => {
        if (area?.key !== 'compras.cotacoes') return area;

        const permissoesAtuais = Array.isArray(area.permissoes) ? area.permissoes : [];
        const porChave = new Map(permissoesAtuais.map((permissao) => [String(permissao?.key || '').toLowerCase(), permissao]));

        return {
          ...area,
          permissoes: COMPRAS_COTACOES_PERMISSOES_DETALHADAS.map((permissao) => ({
            ...permissao,
            ...(porChave.get(permissao.key) || {}),
            descricao: permissao.descricao
          }))
        };
      })
    };
  });
}

export async function getTemaSistema() {
  const res = await fetch(`${API_URL}/configuracoes/tema`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar tema do sistema');
  return res.json();
}

export async function salvarTemaSistema(data) {
  const res = await fetch(`${API_URL}/configuracoes/tema`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao salvar tema do sistema');
  return res.json();
}

export async function getSuporteWhatsapp() {
  const res = await fetch(`${API_URL}/configuracoes/suporte-whatsapp`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar WhatsApp de suporte');
  return res.json();
}

export async function salvarSuporteWhatsapp(data) {
  const res = await fetch(`${API_URL}/configuracoes/suporte-whatsapp`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error || 'Erro ao salvar WhatsApp de suporte');
  }
  return res.json();
}

export async function getTimeoutInatividade() {
  const res = await fetch(`${API_URL}/configuracoes/timeout-inatividade`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar timeout de inatividade');
  return res.json();
}

export async function salvarTimeoutInatividade(data) {
  const res = await fetch(`${API_URL}/configuracoes/timeout-inatividade`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(mensagemDeErro(txt, 'Erro ao salvar timeout de inatividade', res.status));
  }
  return res.json();
}

export async function enviarHeartbeatSessao() {
  const res = await fetch(`${API_URL}/auth/heartbeat`, {
    method: 'POST',
    headers: authHeaders()
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(mensagemDeErro(txt, 'Erro ao enviar heartbeat da sessao', res.status));
  }
  return res.json();
}

export async function getAreasObra() {
  const res = await fetch(`${API_URL}/configuracoes/areas-obra`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar configuracao de areas');
  return res.json();
}

export async function salvarAreasObra(data) {
  const res = await fetch(`${API_URL}/configuracoes/areas-obra`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao salvar configuracao de areas');
  return res.json();
}

export async function getAreasPorSetorOrigem() {
  const res = await fetch(`${API_URL}/configuracoes/areas-por-setor-origem`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar configuracao por setor de origem');
  return res.json();
}

export async function salvarAreasPorSetorOrigem(data) {
  const res = await fetch(`${API_URL}/configuracoes/areas-por-setor-origem`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao salvar configuracao por setor de origem');
  return res.json();
}

export async function getSlaSolicitacoesSetor() {
  const res = await fetch(`${API_URL}/configuracoes/solicitacoes-sla-setor`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar SLA de solicitacoes por setor');
  return res.json();
}

export async function salvarSlaSolicitacoesSetor(data) {
  const res = await fetch(`${API_URL}/configuracoes/solicitacoes-sla-setor`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error || 'Erro ao salvar SLA de solicitacoes por setor');
  }
  return res.json();
}

export async function getSetoresVisiveisPorUsuario() {
  const res = await fetch(`${API_URL}/configuracoes/setores-visiveis-usuario`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar configuracao por usuario');
  return res.json();
}

export async function salvarSetoresVisiveisPorUsuario(data) {
  const res = await fetch(`${API_URL}/configuracoes/setores-visiveis-usuario`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao salvar configuracao por usuario');
  return res.json();
}

export async function getTiposSolicitacaoPorSetor() {
  const res = await fetch(`${API_URL}/configuracoes/tipos-solicitacao-por-setor`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar configuracao de tipos por setor');
  return res.json();
}

export async function getTiposSolicitacaoPorDestino() {
  const res = await fetch(`${API_URL}/configuracoes/tipos-solicitacao-por-destino`, {
    headers: authHeaders()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Erro ao carregar tipos por Obra/Centro de Custo');
  return data;
}

export async function salvarTiposSolicitacaoPorDestino(payload) {
  const res = await fetch(`${API_URL}/configuracoes/tipos-solicitacao-por-destino`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Erro ao salvar tipos por Obra/Centro de Custo');
  return data;
}

export async function salvarTiposSolicitacaoPorSetor(data) {
  const res = await fetch(`${API_URL}/configuracoes/tipos-solicitacao-por-setor`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao salvar configuracao de tipos por setor');
  return res.json();
}

export async function getCamposNovaSolicitacao() {
  const res = await fetch(`${API_URL}/configuracoes/nova-solicitacao-campos`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar configuracao dos campos da nova solicitacao');
  return res.json();
}

export async function salvarCamposNovaSolicitacao(data) {
  const res = await fetch(`${API_URL}/configuracoes/nova-solicitacao-campos`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error || 'Erro ao salvar configuracao dos campos da nova solicitacao');
  }
  return res.json();
}

export async function getAutomacaoDestinoNovaSolicitacao() {
  const res = await fetch(`${API_URL}/configuracoes/nova-solicitacao-automacao-destino`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar automacao de destino da nova solicitacao');
  return res.json();
}

export async function salvarAutomacaoDestinoNovaSolicitacao(data) {
  const res = await fetch(`${API_URL}/configuracoes/nova-solicitacao-automacao-destino`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error || 'Erro ao salvar automacao de destino da nova solicitacao');
  }
  return res.json();
}

export async function getAprovacaoDiretoria() {
  const res = await fetch(`${API_URL}/configuracoes/aprovacao-diretoria`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar configuracao de aprovacao por diretoria');
  return res.json();
}

export async function salvarAprovacaoDiretoria(data) {
  const res = await fetch(`${API_URL}/configuracoes/aprovacao-diretoria`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao salvar configuracao de aprovacao por diretoria');
  return res.json();
}

export async function getTiposCompartilhadosSetor() {
  const res = await fetch(`${API_URL}/configuracoes/tipos-compartilhados-setor`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar tipos compartilhados entre setores');
  return res.json();
}

export async function salvarTiposCompartilhadosSetor(data) {
  const res = await fetch(`${API_URL}/configuracoes/tipos-compartilhados-setor`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao salvar tipos compartilhados entre setores');
  return res.json();
}

export async function getAutomacaoStatusSetor() {
  const res = await fetch(`${API_URL}/configuracoes/automacao-status-setor`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar automacao de status por setor');
  return res.json();
}

export async function salvarAutomacaoStatusSetor(data) {
  const res = await fetch(`${API_URL}/configuracoes/automacao-status-setor`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao salvar automacao de status por setor');
  return res.json();
}

export async function getAprovacaoSolicitacaoPorTipo() {
  const res = await fetch(`${API_URL}/configuracoes/aprovacao-solicitacao-por-tipo`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar o fluxo de aprovacao por tipo');
  return res.json();
}

export async function salvarAprovacaoSolicitacaoPorTipo(data) {
  const res = await fetch(`${API_URL}/configuracoes/aprovacao-solicitacao-por-tipo`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error || 'Erro ao salvar o fluxo de aprovacao por tipo');
  }
  return res.json();
}

export const getTiposCompartilhadosEntreSetores = getTiposCompartilhadosSetor;
export const salvarTiposCompartilhadosEntreSetores = salvarTiposCompartilhadosSetor;

export async function getUsuariosEnvioQualquerSetor() {
  const res = await fetch(`${API_URL}/configuracoes/usuarios-envio-qualquer-setor`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar usuarios com permissao especial de envio');
  return res.json();
}

export async function salvarUsuariosEnvioQualquerSetor(data) {
  const res = await fetch(`${API_URL}/configuracoes/usuarios-envio-qualquer-setor`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao salvar usuarios com permissao especial de envio');
  return res.json();
}

export async function getSetoresCriacaoTodasObras() {
  const res = await fetch(`${API_URL}/configuracoes/setores-criacao-todas-obras`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar configuracao de criacao em todas as obras');
  return res.json();
}

export async function salvarSetoresCriacaoTodasObras(data) {
  const res = await fetch(`${API_URL}/configuracoes/setores-criacao-todas-obras`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao salvar configuracao de criacao em todas as obras');
  return res.json();
}

export async function getSetoresAcessoTodasObras() {
  const res = await fetch(`${API_URL}/configuracoes/setores-acesso-todas-obras`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar configuracao de acesso em todas as obras');
  return res.json();
}

export async function salvarSetoresAcessoTodasObras(data) {
  const res = await fetch(`${API_URL}/configuracoes/setores-acesso-todas-obras`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao salvar configuracao de acesso em todas as obras');
  return res.json();
}

export async function getUsuariosAcessoFinanceiro() {
  const res = await fetch(`${API_URL}/configuracoes/usuarios-acesso-financeiro`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar configuracao de acesso ao financeiro');
  return res.json();
}

export async function salvarUsuariosAcessoFinanceiro(data) {
  const res = await fetch(`${API_URL}/configuracoes/usuarios-acesso-financeiro`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao salvar configuracao de acesso ao financeiro');
  return res.json();
}

export async function getUsuariosAcessoPrioridadeDiretoria() {
  const res = await fetch(`${API_URL}/configuracoes/usuarios-acesso-prioridade-diretoria`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar configuracao de acesso a prioridade diretoria');
  return res.json();
}

export async function salvarUsuariosAcessoPrioridadeDiretoria(data) {
  const res = await fetch(`${API_URL}/configuracoes/usuarios-acesso-prioridade-diretoria`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error || 'Erro ao salvar configuracao de acesso a prioridade diretoria');
  }
  return res.json();
}

export async function getUsuariosPermissoesRhDp() {
  const res = await fetch(`${API_URL}/configuracoes/usuarios-permissoes-rh-dp`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar configuracao de permissoes do RH/DP');
  return res.json();
}

export async function salvarUsuariosPermissoesRhDp(data) {
  const res = await fetch(`${API_URL}/configuracoes/usuarios-permissoes-rh-dp`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao salvar configuracao de permissoes do RH/DP');
  return res.json();
}

export async function getPermissoesAreasRegistry() {
  const res = await fetch(`${API_URL}/configuracoes/permissoes-areas/registry`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar registro de permissoes');
  const registry = await res.json();
  return normalizarRegistryPermissoesAreas(registry);
}

export async function getPermissoesAreas() {
  const res = await fetch(`${API_URL}/configuracoes/permissoes-areas`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar permissoes de areas');
  return res.json();
}

export async function salvarPermissoesAreas(data) {
  const res = await fetch(`${API_URL}/configuracoes/permissoes-areas`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Erro ao salvar permissoes de areas');
  return res.json();
}

export async function getVisibilidadeUi() {
  const res = await fetch(`${API_URL}/configuracoes/visibilidade-ui`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar configuracao de visibilidade');
  return res.json();
}

export async function salvarVisibilidadeUi(data) {
  const res = await fetch(`${API_URL}/configuracoes/visibilidade-ui`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error || 'Erro ao salvar configuracao de visibilidade');
  }
  return res.json();
}

export async function getStatusPedidosCompra() {
  const res = await fetch(`${API_URL}/configuracoes/status-pedidos-compra`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar configuracao de status dos pedidos');
  return res.json();
}

export async function salvarStatusPedidosCompra(data) {
  const res = await fetch(`${API_URL}/configuracoes/status-pedidos-compra`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(mensagemDeErro(txt, 'Erro ao salvar configuracao de status dos pedidos', res.status));
  }
  return res.json();
}

export async function getComercialCategoriasContrato() {
  const res = await fetch(`${API_URL}/configuracoes/comercial-categorias-contrato`, {
    headers: authHeaders()
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(mensagemDeErro(txt, 'Erro ao buscar categorias comerciais do contrato', res.status));
  }
  return res.json();
}

export async function salvarComercialCategoriasContrato(data) {
  const res = await fetch(`${API_URL}/configuracoes/comercial-categorias-contrato`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(mensagemDeErro(txt, 'Erro ao salvar categorias comerciais do contrato', res.status));
  }
  return res.json();
}

export async function getProvisionamentoFluxoConfig() {
  const res = await fetch(`${API_URL}/configuracoes/provisionamento-fluxo`, {
    headers: authHeaders()
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(mensagemDeErro(txt, 'Erro ao buscar configuracao do fluxo de provisionamento', res.status));
  }
  return res.json();
}

export async function salvarProvisionamentoFluxoConfig(data) {
  const res = await fetch(`${API_URL}/configuracoes/provisionamento-fluxo`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error || 'Erro ao salvar configuracao do fluxo de provisionamento');
  }
  return res.json();
}

export async function getNotificacoesSistema() {
  const res = await fetch(`${API_URL}/configuracoes/notificacoes-sistema`, {
    headers: authHeaders()
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(mensagemDeErro(txt, 'Erro ao buscar configuracao de notificacoes do sistema', res.status));
  }
  return res.json();
}

export async function salvarNotificacoesSistema(data) {
  const res = await fetch(`${API_URL}/configuracoes/notificacoes-sistema`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error || 'Erro ao salvar configuracao de notificacoes do sistema');
  }
  return res.json();
}

export async function getModulosSistema() {
  const res = await fetch(`${API_URL}/configuracoes/modulos`, {
    headers: authHeaders()
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(mensagemDeErro(txt, 'Erro ao buscar configuracao de modulos', res.status));
  }
  return res.json();
}

export async function salvarModulosSistema(data) {
  const res = await fetch(`${API_URL}/configuracoes/modulos`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(mensagemDeErro(txt, 'Erro ao salvar configuracao de modulos', res.status));
  }
  return res.json();
}

export async function getObraTipoApropriacao() {
  const res = await fetch(`${API_URL}/configuracoes/obra-tipo-apropriacao`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar apropriacoes padrao por obra');
  return res.json();
}

export async function getApropriacoesDaObra(obraId, busca = '') {
  const query = busca ? `?busca=${encodeURIComponent(busca)}` : '';
  const res = await fetch(
    `${API_URL}/configuracoes/obra-tipo-apropriacao/obras/${obraId}/apropriacoes${query}`,
    { headers: authHeaders() }
  );
  if (!res.ok) throw new Error('Erro ao buscar apropriacoes da obra');
  return res.json();
}

export async function salvarObraTipoApropriacao(data) {
  const res = await fetch(`${API_URL}/configuracoes/obra-tipo-apropriacao`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(mensagemDeErro(txt, 'Erro ao salvar apropriacao padrao', res.status));
  }
  return res.json();
}

export async function getContratoObraCategorias() {
  const res = await fetch(`${API_URL}/configuracoes/contrato-obra-categorias`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Erro ao buscar categorias do contrato de obra');
  return res.json();
}

export async function salvarContratoObraCategorias(categoriaIds) {
  const res = await fetch(`${API_URL}/configuracoes/contrato-obra-categorias`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ categoria_ids: categoriaIds })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(mensagemDeErro(txt, 'Erro ao salvar categorias do contrato de obra', res.status));
  }
  return res.json();
}
