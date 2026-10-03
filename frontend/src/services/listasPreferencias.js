import { API_URL, authHeaders } from './api';

// Preferências de exibição e filtros nomeados das listas (ListaAvancada),
// persistidos NO BANCO por usuário e por lista — sobrevivem a troca de
// máquina, celular e limpeza de cache do navegador.

async function parseResponse(response, defaultError) {
  if (response.ok) {
    if (response.status === 204) return null;
    return response.json();
  }
  let message = defaultError;
  try {
    const data = await response.json();
    message = data?.error || message;
  } catch {
    // sem body json
  }
  throw new Error(message);
}

export async function getListaPreferencias(lista) {
  const response = await fetch(`${API_URL}/listas/${encodeURIComponent(lista)}/preferencias`, {
    headers: authHeaders()
  });
  const data = await parseResponse(response, 'Erro ao carregar preferências da lista');
  return data?.preferencias || {};
}

export async function salvarListaPreferencias(lista, preferencias) {
  const response = await fetch(`${API_URL}/listas/${encodeURIComponent(lista)}/preferencias`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ preferencias })
  });
  return parseResponse(response, 'Erro ao salvar preferências da lista');
}

export async function getFiltrosSalvos(lista) {
  const response = await fetch(`${API_URL}/listas/${encodeURIComponent(lista)}/filtros`, {
    headers: authHeaders()
  });
  const data = await parseResponse(response, 'Erro ao carregar filtros salvos');
  return Array.isArray(data) ? data : [];
}

export async function salvarFiltroNomeado(lista, nome, filtros) {
  const response = await fetch(`${API_URL}/listas/${encodeURIComponent(lista)}/filtros`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ nome, filtros })
  });
  return parseResponse(response, 'Erro ao salvar filtro');
}

export async function excluirFiltroNomeado(lista, id) {
  const response = await fetch(`${API_URL}/listas/${encodeURIComponent(lista)}/filtros/${Number(id)}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return parseResponse(response, 'Erro ao excluir filtro');
}

/* =====================================================================
   PREFERÊNCIAS POR TIPO E CARGA ÚNICA (05/09)
   ---------------------------------------------------------------------
   As quatro funções abaixo são o que o `PreferenciasContext` usa. Elas
   existem porque o par legado (`getListaPreferencias`/`salvarListaPreferencias`,
   acima) fala com a rota SEM tipo, que cai em `geral` — o balde único que
   a ListaAvancada já usa. Uma tabela que gravasse colunas ali por cima
   reescreveria os filtros salvos da mesma lista no mesmo PUT.

   Medido em 05/09 sobre frontend/src: 273 chaves `tabela:*` distintas,
   273 de 273 com `:`, a maior com 64 caracteres — dentro do teto de 160
   do backend (`listaPreferenciasValidators.js`).
   ===================================================================== */

/*
  CARGA ÚNICA. Uma chamada na abertura do app, e nenhuma tabela toca a
  rede depois disso. Sem ela, uma tela de relatório com 5 tabelas faria 5
  requisições só para descobrir quais colunas mostrar — antes de desenhar.
*/
export async function getMinhasPreferencias() {
  const response = await fetch(`${API_URL}/me/preferencias`, {
    headers: authHeaders()
  });
  const data = await parseResponse(response, 'Erro ao carregar preferências do usuário');
  return {
    listas: (data && typeof data.listas === 'object' && data.listas) || {},
    total: Number(data?.total || 0)
  };
}

/*
  `keepalive` na saída da página: a gravação é adiada em 700ms (o mesmo
  valor da ListaAvancada) e quem fecha a aba logo depois de arrastar uma
  coluna perderia a escolha na janela do debounce. Com `keepalive` o
  navegador termina de enviar a requisição depois que a página some.
  Só o caminho de descarga usa a marca; o caminho normal não precisa dela
  e o `keepalive` tem teto de 64KB de corpo, abaixo dos 32KB de `filtros`
  mas acima dos 8KB de `colunas`/`visual`, que são os tipos daqui.
*/
export async function salvarListaPreferenciasTipo(lista, tipo, preferencias, { keepalive = false } = {}) {
  const response = await fetch(
    `${API_URL}/listas/${encodeURIComponent(lista)}/preferencias/${encodeURIComponent(tipo)}`,
    {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ preferencias }),
      keepalive
    }
  );
  return parseResponse(response, 'Erro ao salvar preferências da lista');
}

/*
  Reset de UM tipo — é o "Restaurar padrão" do painel de colunas. Apagar
  aqui é correto porque é ATO EXPLÍCITO do usuário; o que nunca se apaga é
  a preferência de quem só perdeu uma coluna do padrão da tela (essa se
  filtra na leitura — ver PreferenciasContext).
*/
export async function resetListaPreferenciaTipo(lista, tipo) {
  const response = await fetch(
    `${API_URL}/listas/${encodeURIComponent(lista)}/preferencias/${encodeURIComponent(tipo)}`,
    { method: 'DELETE', headers: authHeaders() }
  );
  return parseResponse(response, 'Erro ao restaurar preferências da lista');
}

/*
  Adoção em lote do que já está no navegador. Tudo-ou-nada no servidor:
  uma entrada inválida reprova a chamada inteira e nada é gravado — por
  isso o contexto filtra as chaves que o backend recusaria ANTES de
  montar o lote.
*/
export async function adotarPreferencias(itens) {
  const response = await fetch(`${API_URL}/me/preferencias/adotar`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ itens })
  });
  return parseResponse(response, 'Erro ao adotar preferências');
}
