# Handoff — Biblioteca: permissão granular de upload — 31/08/2026

## Problema

Usuários com perfil `USUARIO` e permissão granular `biblioteca.geral.gerenciar` conseguiam acessar a
Biblioteca, mas o botão `Upload de arquivo` não era exibido. O endpoint de upload também seria
recusado pela verificação específica da página.

## Causa

A autorização geral da Biblioteca reconhecia a permissão granular. Depois dela, o serviço
`arquivoModeloAccessService` aplicava uma segunda regra que aceitava somente os perfis `ADMIN`,
`ADMINISTRADOR` e `SUPERADMIN`, além dos vínculos legados por setor ou página.

O contexto retornava `uploadPermitidoPorPagina: false` para o perfil `USUARIO`; o frontend usa esse
valor junto com a permissão granular e, corretamente diante do contexto recebido, ocultava o botão.

## Correção

- `canUploadArquivoModeloPage` agora reconhece primeiro `canManageBiblioteca(user)`.
- A permissão `biblioteca.geral.gerenciar` passa a autorizar upload e exclusão em todas as páginas
  ativas, independentemente do perfil nominal.
- A regra legada por setor e por lista de uploaders foi preservada para perfis administrativos que
  não possuem a permissão granular.
- Não houve migration nem alteração de dados ou configurações.

## Arquivo alterado

- `backend/src/services/arquivoModeloAccessService.js`

## Configuração esperada

No cadastro de permissões por usuário, conceder:

- `biblioteca.geral.visualizar`, para consultar e baixar; e
- `biblioteca.geral.gerenciar`, para fazer upload e excluir arquivos.

Depois de salvar a permissão, renovar a sessão da usuária para que o frontend receba a lista atualizada
de `areas_permissoes`.
