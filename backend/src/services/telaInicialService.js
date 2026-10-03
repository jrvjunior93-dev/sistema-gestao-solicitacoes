// =====================================================================
// TELA INICIAL ESCOLHIDA PELO USUÁRIO
// ---------------------------------------------------------------------
// A preferência fica no banco (usuario_lista_preferencias, chave
// 'tela-inicial') e vale em qualquer navegador/celular. A validação de
// permissão acontece AQUI, no backend, usando a PRÓPRIA fonte única de
// navegação do frontend, compilada para CommonJS por
// frontend/scripts/gerarCatalogoNavegacaoBackend.mjs — mesmas regras,
// nenhuma duplicada.
//
// Conjunto escolhível = getFixableItems (o mesmo da estrela de atalho):
// só destinos da fonte única com rota estática. Rota de registro
// específico (ex.: /solicitacoes/123) nunca está nesse conjunto.
//
// Robustez (regra da tarefa): permissão perdida ou rota removida da
// fonte única ⇒ o login cai na Home silenciosamente e a preferência é
// LIMPA. Se o catálogo compilado não carregar (falha de build), o
// sistema degrada para a Home SEM limpar a preferência de ninguém.
// =====================================================================
const { UsuarioListaPreferencia } = require('../models');

const LISTA_TELA_INICIAL = 'tela-inicial';

let fonteUnica;
let fonteUnicaFalhou = false;
function carregarFonteUnica() {
  if (fonteUnica || fonteUnicaFalhou) return fonteUnica || null;
  try {
    // eslint-disable-next-line global-require
    fonteUnica = require('../generated/navegacaoFonteUnica.cjs');
  } catch (error) {
    fonteUnicaFalhou = true;
    console.error(
      'Catalogo de navegacao compilado indisponivel (tela inicial degrada para a Home):',
      error.message
    );
    return null;
  }
  return fonteUnica;
}

// Destinos que o usuário PODE escolher como tela inicial, já filtrados
// pela permissão dele. `sessionUser` é o payload de buildSessionUser —
// exatamente o objeto que o frontend usa nas mesmas funções.
function listarTelasEscolhiveis(sessionUser) {
  const nav = carregarFonteUnica();
  if (!nav || !sessionUser) return [];
  return nav.getFixableItems(sessionUser).map((item) => ({
    id: item.id,
    label: item.label,
    to: item.to,
    moduleId: item.moduleId,
    moduleLabel: item.moduleLabel
  }));
}

async function lerPreferencia(usuarioId) {
  const registro = await UsuarioListaPreferencia.findOne({
    where: { usuario_id: usuarioId, lista: LISTA_TELA_INICIAL }
  });
  if (!registro) return null;
  try {
    const parsed = JSON.parse(registro.preferencias);
    const id = String(parsed?.id || '').trim();
    return id ? { registro, id } : { registro, id: null };
  } catch {
    return { registro, id: null };
  }
}

async function limparTelaInicial(usuarioId) {
  await UsuarioListaPreferencia.destroy({
    where: { usuario_id: usuarioId, lista: LISTA_TELA_INICIAL }
  });
}

// Valida a preferência salva contra as permissões ATUAIS do usuário.
// Retorna { id, to, label } ou null (Home). Preferência inválida é
// limpa aqui mesmo — o próximo login nem a encontra.
async function obterTelaInicialValidada(sessionUser) {
  try {
    if (!sessionUser?.id) return null;
    const pref = await lerPreferencia(sessionUser.id);
    if (!pref) return null;

    const nav = carregarFonteUnica();
    if (!nav) return null; // degrada para a Home sem limpar

    const escolhida = pref.id
      ? listarTelasEscolhiveis(sessionUser).find((item) => item.id === pref.id)
      : null;
    if (!escolhida) {
      // Perdeu a permissão, a tela saiu da fonte única ou o registro
      // está corrompido: limpa e cai na Home, sem erro.
      await pref.registro.destroy();
      return null;
    }
    return { id: escolhida.id, to: escolhida.to, label: escolhida.label };
  } catch (error) {
    // Nunca derruba o login por causa da tela inicial.
    console.error('Falha segura ao resolver tela inicial:', error.message);
    return null;
  }
}

// Salva a escolha, validando no backend que a tela existe na fonte
// única E que o usuário tem permissão nela hoje.
async function salvarTelaInicial(sessionUser, telaId) {
  const id = String(telaId || '').trim();
  if (!id) return { ok: false, motivo: 'Informe a tela' };

  const nav = carregarFonteUnica();
  if (!nav) return { ok: false, motivo: 'Catalogo de navegacao indisponivel' };

  const escolhida = listarTelasEscolhiveis(sessionUser).find((item) => item.id === id);
  if (!escolhida) {
    return { ok: false, motivo: 'Tela inexistente ou sem permissao' };
  }

  const texto = JSON.stringify({ id: escolhida.id });
  const [registro, criado] = await UsuarioListaPreferencia.findOrCreate({
    where: { usuario_id: sessionUser.id, lista: LISTA_TELA_INICIAL },
    defaults: { usuario_id: sessionUser.id, lista: LISTA_TELA_INICIAL, preferencias: texto }
  });
  if (!criado) {
    await registro.update({ preferencias: texto });
  }
  return { ok: true, tela: { id: escolhida.id, to: escolhida.to, label: escolhida.label } };
}

module.exports = {
  LISTA_TELA_INICIAL,
  listarTelasEscolhiveis,
  obterTelaInicialValidada,
  salvarTelaInicial,
  limparTelaInicial
};
