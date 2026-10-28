# Publicação exclusiva DEV — precisão decimal de compras

Usuário autorizou atualizar a base, integrar somente o arredondamento, testar, commitar e fazer push em refactor/frontend, depois fornecer comandos da EC2 DEV. Sem acesso do agente à EC2/DB/S3; sem ajuste PC-00299 ou promoção main.

## Integração

- Base atualizada de6701ee7b para15a8be97. Patch original preservado em outputs locais antes do fast-forward.
- Conflitos de proposta resolvidos mantendo a quantidade disponível/ofertada atual. Preservados filtros/paginação, reabertura com títulos excluídos, favorecido/PIX e RH. Não foram adicionadas correções independentes dessas áreas.
- Mesmo núcleo decimal CJS/ESM: unitários como string com até10casas, produto exato em BigInt, HALF_UP do total e distribuição determinística de centavos. Edição/API/PDF/modelos alinhados.
- Ajustado apenas o mock de dependências do QA de reabertura para carregar o novo utilitário real; guardas e testes financeiros mantidos.

## Publicação e operação

- Commit inclui somente correção, migration de precisão, testes, módulo frontend gerado, documentação e aplicador DEV. Nenhum artefato/dado de auditoria ou rotina de aplicação PC-00299 integra o pacote.
- Operador derivado do procedimento DEV isolado já usado neste repositório, com manifesto fechado e schema doctor dedicado. Não atualiza todo o checkout nem roda migrations gerais.
- Amplia somente duas colunas, conserva valores históricos e registra a migration técnica. Nenhum dado de negócio/título/baixa é atualizado. DDL MySQL não tem rollback garantido; retomada reconhece ampliação parcial.
- PROD/Experience/daemon/ambientes/heap/dumps/systemd preservados; apenas backend-dev reinicia, com controle de repetição.
- Fonte: ops/deploy/README-precisao-compras-dev-20261028.md. Comandos com commit exato fornecidos ao usuário após o push.

## Validação

- Núcleo/API/migration simulada, paridade frontend/backend, preservação dos53itens em simulação local; nenhuma aplicação financeira.
- Portal e resposta interna reais, em1366/390, conservaram a regra de disponibilidade e os componentes de tributos/desconto/frete. API interceptada e sem chamadas inesperadas.
- Edição real do pedido conserva10casas no blur e no PATCH; reabertura/status/ACL/GEO/mobile/duplo clique/reconciliação de erro de rede preservados.
- Regressões de envio/remanejamento/financeiro, reabertura com títulos excluídos e paginação SQL em SQLite local.
- Schema/aplicador testados em memória: somente dois ALTER e ledger nomeado, rejeição de PROD/TLS ausente/SQL de negócio/outros tipos/outras migrations, replay e falha de QA/schema/restart. Nenhum banco real acessado.
- Build e integridade do manifesto conferidos antes do commit. Sem mudança de dependências.

## Fora de escopo

Simulador, fonte e relatório PC-00299 ficam apenas em arquivos locais. Regularização real continua exigindo dados atuais e autorização específica. main não foi alterada; a operação da EC2 será executada pelo usuário.
