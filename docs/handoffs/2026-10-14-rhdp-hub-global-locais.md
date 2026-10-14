# RH/DP: card global separado de Obras/Centros de Custo

## Pedido e estado

- Data do cliente: 14/10/2026, America/Sao_Paulo.
- Usuario corrigiu o destino da entrada global: deve haver um card no hub
  /hub/rhdp, sem transformar a porta Obras/Centros de Custo em lista global.
- Branch local codex/rhdp-hub-global-locais-20261014 sobre refactor/frontend
  22120eaa; worktree promocao-dp-main-20261014/Fluxy reutilizado.
- Implementado e validado localmente. Usuario autorizou commit/push deste
  ajuste na refactor/frontend e comandos para EC2 dev; sem promover main
  ou executar atualizacao na EC2 pelo agente.

## Fluxo implementado

- Hub de Colaboradores: novo card Solicitacoes globais, no mesmo NavCard e
  estilo dos demais, entre Obras/Centros de Custo e Documentos.
- Destino global: /rh-dp/pessoal?visao=global&aba=solicitacoes.
- Destino local mantido: /rh-dp/pessoal, agora sempre abre cards dos locais.
- Abrir uma obra/centro: abas de colaboradores ativos e solicitacoes daquele
  local. Voltar para Obras retorna aos cards; nao cai na lista global.
- Consulta global tem titulo proprio e atalho explicito a partir de local.
- Marcador visao=global evita que o breadcrumb/estrela identifiquem a aba
  Solicitacoes de uma obra como se fosse consulta global.
- Links legados com aba=solicitacoes ou outras abas seguem funcionais.

## Acesso e dependencias

- canViewRhDpSolicitacoesGlobais reutiliza a porta de leitura do backend:
  canViewRhDpColaboradores + DP/admin ou permissao existente ver_todas.
- Nao exigir permissao granular nova para o card; usuarios operacionais OBRA
  ficam sem card global, inclusive se acumularem setor DP/ver_todas.
- Endpoints, escopos do backend, privacidade de rascunhos, operacoes de
  pagamento/salario, modulos, permissoes centrais e App.jsx nao alterados.
- Fonte unica navigationConfig participa de hub, Ctrl+K, breadcrumb, atalhos
  e tela inicial. Catalogo backend regenerado pelo script existente, nao editado
  manualmente, para manter a mesma visibilidade na preferencia de tela inicial.
- Nenhuma migration, dependencia, flag ou .env novo.

## Arquivos

- frontend/src/navigation/navigationConfig.jsx
- frontend/src/utils/acessoProduto.js
- frontend/src/pages/RhDpPessoal.jsx
- frontend/scripts/validarRhPessoalPorLocal.mjs
- frontend/scripts/validarRhHubNavegacao.mjs (novo)
- backend/src/generated/navegacaoFonteUnica.cjs (regenerado)
- docs/modulos/rh-dp/README.md e docs/workspace/OWNERSHIP_ATIVO.md
- Este handoff. Evidencias outputs/ fora do commit.

## Validacoes aprovadas

- validarRhHubNavegacao.mjs: DP com acesso de leitura, administradores,
  ver_todas autorizado, negativos OBRA/multissetor/sem permissao/modulo
  desabilitado; destinos, breadcrumb, estrela e preferencias de tela inicial.
- validarNavegacao.mjs: 220 rotas, 218 destinos, sem link morto/destino perdido
  e catalogos front/back consistentes.
- validarRhPessoalPorLocal.mjs: fluxo completo de pagamentos/conferencia/
  fechamento, salario numerico/SUPERADMIN, documentos/relatorios e negativos;
  novo percurso real ModuleHub -> card -> pagina, em 1366 e 390 px.
- Hub global mostra dois locais; local mostra somente sua solicitacao;
  obra e centro de custo conferidos, retorno pelo navegador, reload e Enter
  no card com foco. Sem erro JavaScript, transbordamento ou API externa.
- validarRhConsultaSalario.js e validarSegurancaAcessoDireto.js aprovados,
  preservando ajustes anteriores e rascunhos privados.
- Build frontend, diff check, documentacao e inspecao visual das capturas.
- Avisos existentes: Browserslist antigo e bundle acima de 500 kB.
- Fixtures usam formato real de modulos {key,enabled}; vazio e chave ausente
  sao compatibilidade legada, nao devem ser usados como teste de modulo negado.
- Skill frontend-design aplicada para reutilizar padrao corporativo/NavCard,
  sem redesenho, CSS adicional, mudanca de tipografia ou efeito decorativo.

## Proximo passo

- Publicar o ajuste autorizado na refactor/frontend, com push sem force.
- Stagear somente estes arquivos, preservando outputs/ e alteracao de caixa
  pendente em outro worktree. Conferir remoto antes do push, sem force.
- Homologar hub como Luana/DP, superadmin e OBRA em dev antes de promover main.
- Comandos EC2 dev devem conferir branch/commit, arquivos versionados limpos,
  ausencia de diferencas de schema/dependencias, UUID do banco dev, processo
  e porta distintos de producao. Conferir schema somente leitura e reiniciar
  apenas backend-dev; sem migrations ou operacao de negocio pelo agente.
