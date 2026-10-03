import { API_URL, authHeaders } from './api';
import { mensagemDeErro } from './erroDeResposta';

/**
 * SENHA DO PAINEL DO GESTOR (config do administrador).
 * O backend nunca devolve a senha: só { configurado, atualizado_em }.
 * O erro leva `status` e `indisponivel` (404: rota ainda não publicada no
 * servidor) para a tela mostrar estado legível em vez de mensagem técnica.
 */
async function tratar(res, alternativa) {
  if (res.ok) return res.json();
  const corpo = await res.text().catch(() => '');
  const erro = new Error(mensagemDeErro(corpo, alternativa, res.status));
  erro.status = res.status;
  erro.indisponivel = res.status === 404;
  throw erro;
}

export async function getPainelGestorPin() {
  const res = await fetch(`${API_URL}/configuracoes/painel-gestor/pin`, {
    headers: authHeaders()
  });
  return tratar(res, 'Erro ao consultar a senha do Painel do Gestor');
}

export async function salvarPainelGestorPin(pin) {
  const res = await fetch(`${API_URL}/configuracoes/painel-gestor/pin`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ pin })
  });
  return tratar(res, 'Erro ao salvar a senha do Painel do Gestor');
}
