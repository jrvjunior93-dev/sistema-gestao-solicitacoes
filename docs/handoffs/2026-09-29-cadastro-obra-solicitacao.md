# Solicitação CADASTRO DE OBRA

Data: 29/09/2026

## Resultado

- Criado o tipo ativo `CADASTRO DE OBRA`, disponível exclusivamente para origens do tipo Obra.
- O backend mantém o destino inicial obrigatório em GEO, independentemente do payload enviado pelo navegador.
- O formulário exibe e exige:
  - Nome da Obra;
  - Pessoas vinculadas;
  - Data de Resposta;
  - Planilha Orçamentária.
- A origem da solicitação continua sendo a obra à qual o solicitante possui acesso.
- Pessoas vinculadas são escolhidas entre usuários ativos e aparecem somente pelo nome.
- A planilha aceita os formatos documentais já homologados pelo sistema, incluindo XLS, XLSX e CSV.
- O detalhe da solicitação apresenta o nome solicitado, as pessoas indicadas e a Data de Resposta.

## Persistência e segurança

- A migration `202609290003_cadastro_obra_solicitacao.js` cria a tabela relacional
  `solicitacao_cadastro_obra_usuarios` e cadastra/atualiza idempotentemente o tipo.
- A criação da solicitação e dos vínculos de pessoas ocorre na mesma transação.
- O backend rejeita centro de custo, lista vazia, usuários inexistentes e usuários inativos.
- Os vínculos desta solicitação são dados operacionais para o futuro cadastro da obra; eles não
  concedem acesso à obra solicitante nem alteram permissões dos usuários.
- O endpoint da lista devolve somente `id` e `nome` dos usuários ativos.
- A migration não usa `describeTable`, preservando compatibilidade com o runner de migrations do projeto.

## Ordem segura de deploy em dev

1. Fazer `git pull --ff-only origin refactor/frontend`.
2. Executar `npm install` no backend.
3. Executar `npm run test:cadastro-obra-solicitacao`.
4. Parar somente `backend-dev` se esta for a política operacional escolhida para migrations.
5. Executar `ALLOW_SCHEMA_MIGRATIONS=true npm run migrate`.
6. Executar `npm run preflight:schema` e exigir zero migrations pendentes.
7. Reiniciar somente `backend-dev --update-env`.
8. Validar os health checks local e público.
9. Publicar o frontend depois que o backend e a migration estiverem disponíveis.

O backend novo não deve ser iniciado antes da migration, pois o detalhe da solicitação passa a
consultar a nova tabela relacional.

## Validações executadas

- `npm run test:cadastro-obra-solicitacao` aprovado.
- `npm run test:solicitacao-vencimento` aprovado.
- `npm run test:tipos-solicitacao-destino` aprovado.
- `node --check` aprovado em controller, model, associações, rotas, services, validator, migration e teste.
- `npm run build` do frontend aprovado (481 módulos).
- `git diff --check` aprovado.

## Pendência operacional

- Aplicar a migration em dev antes do teste integrado.
- Abrir uma solicitação com usuário de Obra, confirmar a chegada em GEO e conferir nome, pessoas,
  data e planilha no detalhe.
