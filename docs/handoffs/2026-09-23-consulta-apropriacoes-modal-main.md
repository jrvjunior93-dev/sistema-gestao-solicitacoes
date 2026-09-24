# Consulta de apropriações por modal — main

Migração isolada do recurso publicado na `refactor/frontend` pelo commit
`516b75a4`.

## Adaptação realizada

A `main` não possui o mesmo shell de modal nem algumas telas da refatoração.
Por isso, o recurso foi adaptado ao `ModalPortal` e às classes padronizadas já
existentes nessa branch, sem restaurar páginas removidas.

O modal foi incorporado ao `ApropriacaoAutocomplete` e os seletores antigos
foram alinhados em:

- criação e edição de títulos financeiros;
- gestão de contratos;
- seleção da apropriação pai na Gestão de Apropriações.

Os campos de apropriação de solicitações, compras e detalhe já utilizavam o
componente compartilhado e receberam o recurso automaticamente. O uso do mesmo
componente para selecionar obra em Compras foi explicitamente excluído da lupa.

Nenhum endpoint, banco, migration ou regra de permissão foi alterado. A lista do
modal é exatamente a lista já autorizada e carregada para o campo.
