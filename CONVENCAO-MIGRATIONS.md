# Convencao atual de migrations

Atualizada em 30/09/2026 para o runner
`backend/src/database/runMigrations.js`.

## Regras obrigatorias

1. O nome completo do arquivo e a identidade em `schema_migrations`. Migration que
   ja pode ter rodado fora do checkout nunca e renomeada.
2. O nome segue `YYYYMMDDNNNN_descricao.js`, escolhendo um numero ainda livre no
   repositorio e verificando trabalhos paralelos no ownership.
3. Toda migration e idempotente e tolera retomada apos interrupcao.
4. Migration altera somente schema. O runner bloqueia DML por SQL e pelos metodos de
   dados do `queryInterface`.
5. Seed, cadastro funcional, classificacao e backfill passam pela interface ou por
   script operacional separado, com simulacao, contagens, alvo validado e autorizacao.
6. FKs usam tipo identico ao campo referenciado. Em tabelas com nomes longos, criar
   constraint com nome explicito menor que o limite do MySQL.
7. Resolver o nome fisico/case real da tabela antes de alterar FKs em Linux/MySQL.
8. `down` nao e executado automaticamente em deploy e nunca deve apagar historico
   operacional sem plano especifico.

## Execucao

O backend normal executa `assertMigrationsUpToDate()` e falha sem escrever se houver
pendencias. Aplicacao exige as duas autorizacoes do runner:

```bash
ALLOW_SCHEMA_MIGRATIONS=true npm run migrate
```

Depois:

```bash
npm run preflight:schema
```

Nao grave `ALLOW_SCHEMA_MIGRATIONS=true` no `.env`.

## Forma do modulo

```js
module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    // somente operacoes estruturais e guardadas
  },
  async down() {
    // manter seguro e nao destrutivo quando possivel
  }
};
```

O runner injeta `{ DataTypes, queryInterface, sequelize }`. Nao presuma uma API bruta
do Sequelize diferente desse contrato. Antes de entregar:

```bash
node --check migrations/ARQUIVO.js
npm run test:docs
```

Execute tambem o teste de dominio que comprova que a migration e exclusivamente
estrutural.

## Colisao entre agentes

Antes de criar o arquivo:

1. conferir `backend/migrations/`;
2. conferir `docs/workspace/OWNERSHIP_ATIVO.md`;
3. reservar o nome pretendido;
4. se houver colisao antes de qualquer ambiente aplicar, quem chegou depois escolhe
   outro numero;
5. se qualquer ambiente ja aplicou, nao renomear: tratar a ordem/compatibilidade em
   migration posterior.

As antigas faixas `0001-0049` e `0050+` pertenciam ao periodo em que uma branch antiga
e uma copia V4 independente coexistiam. Elas permanecem no historico, mas nao sao mais
a regra para migrations novas desta branch consolidada.
