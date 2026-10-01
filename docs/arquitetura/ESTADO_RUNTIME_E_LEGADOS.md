# Estado do Runtime e Codigos Legados

Data da ultima reconciliacao documental: 2026-09-30.

Este documento separa comportamento vigente de codigo mantido apenas por compatibilidade. Presenca em model, migration, rota, menu ou catalogo nao transforma um recurso descontinuado em regra de negocio valida.

## Catalogo de modulos

`backend/src/services/moduleConfigService.js` possui 18 entradas. Dezessete correspondem
a dominios operacionais documentados; a integracao ERP antiga permanece no catalogo
somente como legado desabilitado. Essa entrada nao deve ser ativada nem usada por novas
funcionalidades.

Dependencias vigentes declaradas no catalogo:

- `COTACOES` requer `COMPRAS`;
- `BOLETOS` requer `FINANCEIRO`;
- `PROVISOES` requer `FINANCEIRO` e `OBRAS`;
- `SOLICITACOES` e bloqueado como habilitado.

O estado efetivo vem da chave `MODULOS_HABILITADOS` no banco. Os valores padrao do codigo nao comprovam, sozinhos, a configuracao da instalacao em producao.

## Integracoes descontinuadas

### Integracao ERP antiga

A integracao nao faz mais parte do produto. Ainda existem catalogo, models, migrations, services, validators, controllers, rotas sob `/integracoes/sienge`, campos e referencias de interface. A remocao fisica precisa ser uma tarefa propria, com inventario de tabelas, dados, permissoes, rotas e consumidores.

No fluxo de Compras:

- `PATCH /compras/solicitacoes/:id/integrar` retorna `410` antes de qualquer logica antiga;
- `PATCH /compras/solicitacoes/:id/liberar` retorna `410` antes de qualquer logica antiga;
- novas solicitacoes de compra normais nascem `PENDENTE` em GEO, onde usuarios com permissao granular revisam quantidades e apropriacoes; somente o encaminhamento explicito do GEO muda a compra para `LIBERADO_PARA_COMPRA` no setor de Compras;
- campos e regras de diretoria atendem somente registros antigos ja marcados com esse fluxo;
- campos como `numero_sienge`, `integrado_sienge` e `data_integracao_sienge` ainda existem e nao podem ser removidos sem migration e busca de consumidores;
- `numero_sienge` ainda aparece em compatibilidades de numero da compra; renomear ou excluir exige migracao de dados e contrato.

### FLUXY Ops

A integracao foi descontinuada. O legado atual esta concentrado em `backend/server.js`, que ainda importa e chama a inicializacao; `backend/src/config/env.js`, que ainda le as variaveis `OPS_*`; e `backend/src/services/opsService.js`, que agenda e envia heartbeat e metricas quando habilitado. Nao existem variaveis correspondentes no `.env.example` e nao devem ser recriadas. A remocao deve retirar o bootstrap, a configuracao e o servico em uma mudanca propria, validando que o processo sobe normalmente sem esses componentes.

## SST em transicao

O estado-alvo aprovado esta em `../modulos/sst/README.md`: PCMSO, PGR, exames, ASO, EPI, treinamento ocupacional, LTCAT, avaliacoes quantitativas e anexos.

O runtime ainda contem funcoes avancadas que serao descontinuadas, inclusive preparacao de eSocial, riscos/acidentes, IA documental, analytics, telemetria, jobs e controles enterprise. O registro de permissoes ainda possui 72 chaves de SST por causa desse legado. Essas rotas e permissoes nao definem o escopo futuro e nao devem ser ampliadas. A execucao segura esta planejada em `../sst/PLANO_SIMPLIFICACAO_SEGURA.md`.

## Defaults permissivos de compatibilidade

- backend: `isModuleEnabled` devolve `true` para chave inexistente;
- frontend: `hasEnabledModule` devolve `true` quando a sessao nao possui lista ou quando a chave nao e encontrada;
- permissoes: usuario sem matriz granular efetiva preserva o acesso permitido pelas regras legadas de perfil/setor;
- `SUPERADMIN` possui bypass padrao de modulo em rotas autenticadas, salvo quando a rota o desativa expressamente.

Esses defaults evitam quebra de instalacoes antigas. Nao devem ser usados para publicar novo modulo ou nova permissao. Toda adicao precisa atualizar catalogo, sessao, guardas de frontend, middleware do backend, registro de permissoes e documentacao canonica.

## Regra para remocao futura

Antes de excluir qualquer legado deste documento:

1. mapear migrations, tabelas, colunas e dados existentes;
2. localizar bootstrap, services, jobs, filas, rotas e variaveis de ambiente;
3. localizar menus, paginas, guards e chamadas do frontend;
4. verificar permissoes, auditoria, notificacoes, relatorios e anexos;
5. definir migration reversivel ou estrategia de preservacao historica;
6. testar runtime, build e deploy sem o componente;
7. atualizar este documento e os documentos canonicos afetados.
