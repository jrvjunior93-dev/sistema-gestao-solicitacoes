# Menu Colaboradores para OBRA - 10/10/2026

## Pedido e implementacao

Usuario pediu trocar RH/DP para Colaboradores e descricao para
Solicitações e Pagamentos no menu dos usuarios do setor OBRA.
Base refactor/frontend 77b86f25. Usuario autorizou commit/push em
refactor/frontend. Sem main/deploy nesta tarefa.

- navigationConfig.jsx: getLabel/getDesc do modulo rhdp usam o mesmo helper
  userHasSetorCapability(user, eh_setor_obra) ja empregado pelo acesso RH/DP.
- getVisibleModules retorna rotulo/descricao resolvidos para o usuario sem
  mutar NAV_MODULES. Home, menu, breadcrumb, hub e Ctrl+K compartilham o nome.
- Nao muda label Pessoal, id rhdp/rhdp-pessoal, children, to, gate/can,
  filtros de permissao, atalhos salvos, personalizacao ou endpoints.
- Demais setores conservam RH/DP e Colaboradores, apuração e fechamentos.
- Catalogo CommonJS do backend recompilado pelo prebuild conforme padrao
  existente; apenas sincroniza fonte unica, sem migration/regra financeira.
- Skill frontend-design aplicada para terminologia operacional consistente,
  preservando densidade, icone, componentes e CSS do menu.

## Arquivos

- frontend/src/navigation/navigationConfig.jsx
- frontend/scripts/validarAcessoPedidos.mjs
- backend/src/generated/navegacaoFonteUnica.cjs (gerado)
- docs/modulos/rh-dp/README.md
- docs/workspace/OWNERSHIP_ATIVO.md e este handoff

## Validacoes

- validarAcessoPedidos: rotulo/descricao OBRA, capability de setor customizado,
  catalogo nao mutado, RH/DP em DP/admin, somente Pessoal para OBRA,
  breadcrumb, Ctrl+K/atalhos e guards/destinos preservados.
- NavCard real renderizado: texto visivel e aria-label coerentes, href Pessoal
  intacto, sem RH/DP no card OBRA.
- validarNavegacao: 220 rotas/217 destinos; nenhum link morto/perdido,
  catalogos front/back de blocos coerentes.
- Build aprovado (551 modulos, avisos existentes Browserslist/chunk >500k).
- Diff check e paridade do catalogo gerado aprovados, sem mudanca de destinos.

## Proximo passo

Ownership liberado. Homologar menu com usuario OBRA e DP.
Commit/push DEV autorizado; verificar hash remoto apos publicacao.
Pessoal/DP continua fora da main. Sem banco real ou operacao financeira.
