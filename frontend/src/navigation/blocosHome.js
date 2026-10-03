// =====================================================================
// CATÁLOGO FIXO DE BLOCOS DA HOME (Hub Principal)
// ---------------------------------------------------------------------
// Mesmo motor do detalhe da solicitação (utils/layoutBlocos.js): a
// configuração só ORDENA/OCULTA blocos deste catálogo. Permissões e
// dados continuam decidindo se um bloco PODE aparecer — `can` abaixo
// usa as MESMAS funções de acesso das telas de origem (acessoProduto),
// e o backend confere de novo em cada endpoint de bloco.
//
// Blocos com `padraoOculto: true` nascem DISPONÍVEIS MAS DESLIGADOS: a
// Home padrão continua como sempre foi; eles só aparecem quando o
// usuário os adiciona (camada `adicionados` das preferências) ou quando
// o admin do setor os liga (visivel: true no layout da tela 'home').
// Cada bloco ativo carrega os próprios dados sob demanda — bloco
// desligado não consulta nada.
//
// Resolução: arranjo do USUÁRIO (usuario_lista_preferencias, 'home') →
// layout do SETOR (setor_detalhe_layout, tela='home') → padrão abaixo.
//
// Largura: padrão da Home é 'total' (seção ocupa a linha); blocos
// compactos declaram larguraPadrao 'normal' (meia largura em telas
// largas). A escolha explícita do usuário sempre vence.
// =====================================================================
import { resolverLayoutBlocos } from '../utils/layoutBlocos';
import {
  canAccessComunicacao,
  canAccessContratos,
  canAccessDashboard,
  canAccessFinanceiro,
  canViewCompraSolicitacoes
} from '../utils/acessoProduto';

const SEMPRE = () => true;

// ⚠️ CATÁLOGO ESPELHADO NO BACKEND: BLOCOS_POR_TELA['home'] em
// backend/src/controllers/DetalheLayoutController.js valida a config do
// admin contra uma CÓPIA desta lista. Mudou aqui, mude lá — o
// frontend/scripts/validarNavegacao.mjs FALHA se os dois divergirem.
export const BLOCOS_HOME = [
  // ----- Home padrão (ligados) ---------------------------------------
  { id: 'pendencias', rotulo: 'Suas pendências', grupo: 'Home', can: SEMPRE },
  { id: 'resolver', rotulo: 'Para resolver agora', grupo: 'Home', can: SEMPRE },
  { id: 'atalhos', rotulo: 'Seus atalhos', grupo: 'Home', can: SEMPRE },
  { id: 'modulos', rotulo: 'Módulos', grupo: 'Home', can: SEMPRE },
  { id: 'obras_resumo', rotulo: 'A pagar no mês, por obra', grupo: 'Home', can: SEMPRE },

  // ----- Trabalho (desligados por padrão) ----------------------------
  { id: 'ultimas_tocadas', rotulo: 'Últimas solicitações que você tocou', grupo: 'Trabalho', padraoOculto: true, larguraPadrao: 'normal', can: SEMPRE },
  { id: 'aguardando_resposta', rotulo: 'Aguardando resposta de outro setor', grupo: 'Trabalho', padraoOculto: true, larguraPadrao: 'normal', can: SEMPRE },
  { id: 'minhas_criadas', rotulo: 'Solicitações que você criou em andamento', grupo: 'Trabalho', padraoOculto: true, larguraPadrao: 'normal', can: SEMPRE },
  { id: 'mudou_hoje', rotulo: 'O que mudou hoje no seu setor', grupo: 'Trabalho', padraoOculto: true, larguraPadrao: 'normal', can: SEMPRE },

  // ----- Financeiro (permissão do módulo) ----------------------------
  { id: 'grafico_pagar', rotulo: 'Contas a pagar por período', grupo: 'Financeiro', padraoOculto: true, larguraPadrao: 'normal', can: canAccessFinanceiro },
  { id: 'calendario_vencimentos', rotulo: 'Calendário de vencimentos da semana', grupo: 'Financeiro', padraoOculto: true, larguraPadrao: 'normal', can: canAccessFinanceiro },
  { id: 'saldo_caixas', rotulo: 'Saldo dos caixas e contas', grupo: 'Financeiro', padraoOculto: true, larguraPadrao: 'normal', can: canAccessFinanceiro },
  { id: 'gasto_mes', rotulo: 'Gasto do mês vs mês anterior', grupo: 'Financeiro', padraoOculto: true, larguraPadrao: 'normal', can: canAccessFinanceiro },

  // ----- Obras e Compras ---------------------------------------------
  { id: 'contratos_medir', rotulo: 'Contratos com saldo a medir', grupo: 'Obras e Compras', padraoOculto: true, larguraPadrao: 'normal', can: canAccessContratos },
  { id: 'compras_pendentes', rotulo: 'Cotações e pedidos de compra pendentes', grupo: 'Obras e Compras', padraoOculto: true, larguraPadrao: 'normal', can: canViewCompraSolicitacoes },

  // ----- Institucional -----------------------------------------------
  { id: 'avisos', rotulo: 'Avisos e comunicação interna', grupo: 'Institucional', padraoOculto: true, larguraPadrao: 'normal', can: canAccessComunicacao },
  { id: 'indicadores_executivos', rotulo: 'Indicadores do dashboard executivo', grupo: 'Institucional', padraoOculto: true, larguraPadrao: 'normal', can: canAccessDashboard }
];

export const ORDEM_PADRAO_HOME = BLOCOS_HOME.map((bloco) => bloco.id);

const POR_ID = new Map(BLOCOS_HOME.map((bloco) => [bloco.id, bloco]));

export function rotuloBlocoHome(id) {
  return POR_ID.get(id)?.rotulo || id;
}

export function metaBlocoHome(id) {
  return POR_ID.get(id) || null;
}

// Blocos que ESTE usuário pode ter na Home (permissão manda: sem acesso
// ao módulo de origem, o bloco não existe nem no catálogo).
export function blocosPermitidos(user) {
  return BLOCOS_HOME.filter((bloco) => !bloco.can || bloco.can(user));
}

// Retorna { ordem, ocultos: Set, recolhidos: Set, larguras: {} }.
// - `ocultos` já considera os blocos padrão-desligados: escondidos até
//   o usuário adicionar (prefs.adicionados) ou o admin do setor ligar.
// - `larguras` traz o valor FINAL por bloco ('normal'|'total'), já com
//   o padrão do catálogo aplicado; escolha explícita do usuário vence.
export function resolverLayoutHome({ configSetor = null, prefsUsuario = null } = {}) {
  const base = resolverLayoutBlocos(ORDEM_PADRAO_HOME, { configSetor, prefsUsuario });

  const ligadosPeloSetor = new Set(
    (Array.isArray(configSetor) ? configSetor : [])
      .filter((item) => item?.visivel !== false)
      .map((item) => item.bloco)
  );
  const adicionados = new Set(
    (Array.isArray(prefsUsuario?.adicionados) ? prefsUsuario.adicionados : [])
      .filter((id) => POR_ID.has(id))
  );

  const ocultos = new Set(base.ocultos);
  for (const bloco of BLOCOS_HOME) {
    if (!bloco.padraoOculto) continue;
    if (adicionados.has(bloco.id)) continue;
    if (ligadosPeloSetor.has(bloco.id)) continue;
    ocultos.add(bloco.id);
  }

  const larguras = {};
  for (const bloco of BLOCOS_HOME) {
    const escolhida = base.larguras[bloco.id];
    larguras[bloco.id] = escolhida === 'normal' || escolhida === 'total'
      ? escolhida
      : (bloco.larguraPadrao === 'normal' ? 'normal' : 'total');
  }

  return { ...base, ocultos, larguras, adicionados };
}
