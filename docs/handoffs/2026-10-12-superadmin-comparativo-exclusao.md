# Superadmin, comparativo e exclusao - 12/10/2026

## Estado / autorizacao

Implementacao local em refactor/frontend, base 74f6728b. Usuario autorizou
correcoes e bypass funcional de SUPERADMIN. Sem commit/push, main, deploy,
migration, exclusao real, banco/S3 ou baixa de titulo. Auditoria financeira
alheia e arquivos docs/workspace ja alterados foram preservados.

Publicacao desta etapa autorizada posteriormente pelo usuario na
refactor/frontend: revalidar, commit/push proprio e entregar comandos EC2
DEV ao operador. Nao promover main nem executar deploy/banco nesta sessao.

Revalidacao de publicacao aprovada: suite UI --correcoes-only, regressao
de permissoes/retorno/compras/impersonacao, navegacao/abas/responsividade,
documentacao e diff. Seletor do teste de detalhe foi restringido ao heading
da pagina ativa, com tolerancia para a importacao fria do servidor de QA;
nenhuma alteracao adicional no runtime nesta revalidacao. Stage somente
dos 13 arquivos proprios, incluindo apenas a secao propria de ownership.
Build e suite completa ja aprovados no mesmo runtime. Sem deploy executado.

## Mapa e alteracoes

- Cotacao embutida: CompraEtapas usava fieldset disabled por contexto de
  acompanhamento, impedindo inclusive Cards/Mapa. Agora somenteLeitura
  bloqueia permissoes derivadas de mutacao no GerenciarCotacaoSolicitacao,
  preservando leitura. Controles de modo sao irmaos do botao de recolher,
  nao botoes aninhados. Nenhum endpoint de compras alterado.
- Quantidade: selecao independente da quantidade temporariamente vazia/zero;
  foco seleciona texto para substituir; submit exige todas as selecionadas
  com quantidade positiva. Saldo, disponibilidade, alocacao, categoria,
  pedido/titulo e idempotencia do fechamento continuam existentes. Colunas
  fixas do mapa passam a rolar abaixo de md para nao cobrir os controles.
- Interacao: SolicitacaoController e detalhe reconhecem SUPERADMIN efetivo
  fora do setor principal. Lista/detalhe deixam de aplicar restricao OBRA
  antes da excecao SUPERADMIN. Permissoes de preparar/aprovar/enviar banco
  recebem a mesma excecao nos helpers centrais FE/BE. Nao usar ator original
  da impersonacao como bypass de usuario comum.
- Excluir: lista nova nao expunha a acao existente no backend. Selecionar
  uma linha ativa/arquivada permite Excluir a SUPERADMIN/ADMIN GEO. Sem
  exclusao em massa. API preserva regra de obra, exclusao logica e auditoria,
  agora com lock/transacao e repeticao idempotente. Nao remove financeiro.

## Arquivos proprios

- backend/src/controllers/SolicitacaoController.js
- backend/src/services/authorizationService.js
- backend/scripts/validarSuperadminInteracaoExclusao.js (novo)
- frontend/src/utils/acessoProduto.js
- frontend/src/pages/Solicitacoes/index.jsx
- frontend/src/pages/SolicitacaoDetalhe/index.jsx
- frontend/src/pages/SolicitacaoDetalhe/CompraEtapas.jsx
- frontend/src/modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao.jsx
- frontend/scripts/validarWorkspacePiloto.mjs
- docs/modulos/compras/README.md e docs/modulos/solicitacoes/README.md
- este handoff e somente a secao propria de OWNERSHIP_ATIVO.md

## Validacoes locais

- validarSuperadminInteracaoExclusao: 173 predicados can* backend, matriz
  SUPERADMIN/ADMIN/USUARIO por setor, negativas de ACL, ausencia de vinculo
  para SUPERADMIN, exclusao logica auditada, repeticao/concorrencia, rollback
  e recurso inexistente; 45 comparacoes de permissoes comuns com baseline.
- validarWorkspacePiloto completa: base/piloto/E3a, filtros/rascunhos/abas,
  retorno/POP/login/MFA, atraso e 403, tabela opt-in/legada, supplier rapido;
  detalhe real SUPERADMIN OBRA fora de setor e negativa usuario OBRA;
  comparativo real Cards/Mapa, leitura/edicao em 1366/390px, foco/vazio/decimal,
  zero submit invalido; exclusao UI cancelar/403/duplo clique/alvo unico;
  166 predicados can* FE, negativas e modo autorizacao OFF preservado.
  Todos os transportes de UI interceptados em localhost.
- Harness agora usa Tailwind/config e CSS de Compras reais, evitando
  resultados de layout falsos por falta das classes utilitarias.
- Regressoes: validarNavegacao (220 rotas/217 destinos), validarAbasInternas,
  validarCotacaoResponsiva, validarAcessoAnexosSolicitacoes,
  validarRemocaoAnexosHistorico, validarEmpresaFornecedorCompra,
  validarDevolucaoRetornoSolicitacao, validarAcompanhamentoGeoCompras,
  validarEdicaoDadosSolicitacao, validarPermissoesFinanceiroRota (73 rotas),
  validarCompraCotacaoEnvio, validarItensCotacaoDetalhe, validarDevUserSwitch.
- Sintaxe JS e build FE: 571 modulos, JS inicial gzip 149,92 kB (base149,92).
  Warnings preexistentes Browserslist/chunks. Ensaio controlado de abas:
  p95 31,60ms baseline / 31,65ms piloto, dentro do gate; memoria apos
  30 ciclos abaixo de 0,4MB. Nao e benchmark de producao.

## Limites e riscos preservados

Bypass funcional nao remove MFA/passkey, autorizador nominal, modo OFF,
recurso inexistente, assinatura/token publico, validacao de saldo, titulo
baixado ou integridade financeira. Nenhuma regra de visibilidade comum
foi ampliada. Varredura central nao equivale a teste de todo endpoint/fluxo.
Excecao explicita de modulo desabilitado em Custos/Recebiveis e gates de
integracoes/publicos permanecem; nao ativar automaticamente rollout/integracao.
Outros gates locais de dominio requerem mapeamento/teste proprio antes
de flexibilizar. A camada central de pagamentos tem comportamento legado
assincrono para permissoes comuns: nao reescrito neste lote; teste de
paridade confirma que esta mudanca nao o altera.

## Proximo passo exato

Com a autorizacao recebida, revalidar e commitar somente arquivos proprios,
preservando auditoria alheia e sem stage dos docs/workspace inteiros que
misturam sessoes. Push refactor/frontend; frontend Vercel e backend DEV
precisam do mesmo pacote (restart somente backend-dev; sem migration).
Homologar SUPERADMIN real, usuario comum e impersonacao, Cards/Mapa,
quantidade inteira/decimal, negativa de saldo, exclusao logica de registro
de teste com financeiro preservado, repetir DELETE, demais fluxos de compras.
Nao migrar main sem autorizacao especifica.
