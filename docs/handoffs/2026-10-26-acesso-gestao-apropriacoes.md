# Acesso granular à Gestão de Apropriações — 26/10/2026

## Problema e causa

Liz aparece no print como ADMIN do GEO. Esse perfil não é ADMINISTRADOR.
O menu cad-apropriacoes e a rota /gestao-apropriacoes exigiam isBusinessAdmin,
apesar de o backend já permitir criação/edição/exclusão/macros pela permissão
obras.gestao.apropriacoes. A página também não possuía secaoConfig e, portanto,
não aparecia no hub de Configurações. O print 9/9 não comprova a permissão de Obras.

## Alterações locais

- frontend/src/App.jsx: guard próprio com canManageGestaoObrasApropriacoes;
  remove a exigência adicional de BusinessAdmin somente nessa rota.
- frontend/src/navigation/navigationConfig.jsx: mesmo helper no item;
  gate de Cadastros aceita a permissão específica; página incluída na seção
  cadastros do hub de Configurações.
- backend/src/generated/navegacaoFonteUnica.cjs: regenerado da fonte de navegação
  para preservar a validação das preferências de tela inicial.
- frontend/scripts/validarAcessoGestaoApropriacoes.mjs: matriz de permissões,
  bloqueios, módulo OBRAS, menu pai, seção Configurações, catálogo backend e rota.

## Regras e limites

Não conceder acesso a todas as apropriações apenas pelo grupo Configurações.
Usuário delegado precisa de Obras > Gestão de Obras > Gerenciar apropriações;
OBRAS deve estar habilitado. ADMINISTRADOR e SUPERADMIN mantêm comportamento.
Nenhuma mudança no cadastro/permissões reais da Liz foi realizada.
Endpoints de importação Excel continuam com a restrição administrativa existente;
o modelo Excel continua exclusivo de SUPERADMIN. APIs, obras e dados não alterados.

## Validação

- node frontend/scripts/validarAcessoGestaoApropriacoes.mjs: aprovado.
- node frontend/scripts/validarGestaoApropriacoesSincronizacao.mjs: aprovado.
- Catálogo regenerado com gerarCatalogoNavegacaoBackend.mjs.
- npm run build (frontend): aprovado; avisos de Browserslist desatualizado e
  tamanho de chunks, sem erros de compilação.

## Estado e próximo passo

Publicação autorizada pelo proprietário em 26/10/2026 na refactor/frontend e
promoção isolada para main. Integração realizada no checkout gerenciado
compras-criacao-main, em branch codex/acesso-apropriacoes-refactor-20261026,
partindo de origin/refactor/frontend 6618f6ca7a613331535f46c946608265c4a9b3ef.
O checkout original está desatualizado e tem trabalho fiscal pendente: preservado
sem pull/reset/stash e sem incluir esses arquivos na publicação.

Na base atualizada, testes de acesso e sincronização e build completo aprovados.
O catálogo é regenerado separadamente em cada base para não transportar outras
mudanças da refactor/frontend para main. Sem alteração de dependências/migrations.
A promoção de main deve incluir somente o mesmo ajuste, teste, catálogo e registro
de handoff/ownership. Publicação não autoriza executar deploy na EC2 pelo agente.

Após publicação, o proprietário deve conferir a permissão específica da Liz e
renovar a sessão dela para testar menu, URL direta e cadastro/edição autorizados.
Nenhum acesso à EC2, banco, S3 ou alteração de perfil/permissão real; sem migration.
