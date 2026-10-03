# Integracao refactor/frontend → main (03/10/2026)

## Estado

- Trabalho em worktree isolado `codex/promocao-refactor-main-20261003`; **nao** ha deploy nem alteracao no banco de producao.
- Base main: `250b652032e4dc4bf85845e51d943c47ef7a8768`; alvo refactor: `811a5cce4728621500c0fc3aa85baec737840cd2`.
- Merge amplo commitado na branch isolada; a producao permanece na main anterior.
- Corrigidos na integracao: funcao comercial de sincronizacao de titulos, reversao de cheque, handler duplicado de anexo de contrato, estado nao usado de FinanceiroObras.
- Acrescentado TLS opcional por CA no Sequelize (sem alterar comportamento atual quando variavel ausente) e script com guardas de identidade para ensaio **somente** em `fluxy_restore_20261003`.
- Frontend `npm run build` passou; `npm run test:docs` e testes de financeiro, comercial, compras e RH/DP selecionados passaram. Ainda requer revisao completa da integracao.
- `npm run verificar` do frontend reprova 65 regras de layout. A mesma contagem foi reproduzida no tip puro `811a5cce` de `refactor/frontend`, portanto nao foi introduzida pelo merge; o build separado passa. Registrar como debito preexistente, sem ocultar a falha.

## Protecao confirmada pelo operador na EC2

- Snapshot RDS de producao `backup-antes-refactor-frontend` disponivel.
- Dump cifrado completo validado por SHA no Drive e restaurado em schema **separado** do RDS staging (253 tabelas e checks em tabelas criticas OK).
- Backup automatico diario 23:00 America/Sao_Paulo ativado; execucao manual do servico conferida fora da EC2.
- Bundle da main e tar privado do estado local salvos na EC2 e no Drive cifrado, ambos com SHA conferido.

## Riscos / gates restantes

- 85 migrations ainda pendentes em producao. O ensaio no schema isolado `fluxy_restore_20261003` concluiu todas; `npm run preflight:schema` confirmou zero pendencias. **Nenhuma migration foi aplicada em producao.**
- O ensaio encontrou cinco contratos com codigo `CT/ADM001-33` na obra 23. Apenas na copia, os quatro inativos IDs 715-718 receberam codigos `CT/ADM001-33-LEGADO-<ID>`; o ativo 719 e todos os vinculos foram preservados. A auditoria da copia passou sem duplicidades. O limite de duas conexoes da conta de ensaio exigiu tornar tres migrations sequenciais/idempotentes; a retomada na versao `aeb20806` terminou sem pendencias.
- Consulta somente leitura em producao confirmou os cinco contratos ainda duplicados: IDs 715-718 inativos, ID 719 ativo, todos com valor 50.000; cada um tem uma apropriacao e apenas o 719 tem duas solicitacoes. A UI atual nao expoe os inativos para edicao. Em 03/10, o proprietario autorizou explicitamente a **correcao controlada apenas do codigo dos quatro inativos**, preservando IDs, valores e vinculos, apos nova conferencia e com transacao/auditoria. **Ainda nao executada.**
- Backup manual fresco conferido fora da EC2: `fluxy-prod-db-20261003-202726.sql.gz`, SHA-256 `62f3f564d7744cd1d7b9cccfeacb26de5522652238fb3e0d89e62367069a5d96`. Conferencia somente leitura imediatamente posterior confirmou UUID `5ed4b970-009f-11f1-809c-0ad0e0c90c53`, TLS ativo, os cinco contratos e respectivos vinculos nos valores esperados e zero codigos de destino ja usados. Preparado `backend/scripts/corrigirCodigosContratosProducao.js`: usa conta administrativa, CA TLS, UUID e conta fixos, confirma os registros dentro da transacao e audita antes/depois. **Script ainda nao executado.**
- Antes da correcao em producao, executar novo backup manual, verificar a copia fora da EC2 e reconferir identidade do RDS, contratos, vinculos e disponibilidade dos novos codigos. Registrar antes/depois e abortar em qualquer divergencia. Depois validar dados do ensaio e compatibilidade do codigo antigo com o schema novo.
- O rollback do codigo nao reverte schema nem dados: para a proxima semana, usar codigo antigo apenas se compatibilidade com schema novo for demonstrada. Snapshot antigo nao pode substituir o banco vivo sem perda de dados novos.
- Guardar novo backup e snapshot imediatamente antes da execucao em producao; validar tambem rollback da Vercel e plano de monitoramento.
- Nao tocar nas alteracoes locais preexistentes no checkout main da EC2 (`backend/package-lock.json` e tres arquivos de auditoria).

## Proximo passo exato

Conferir o estado final do banco de ensaio; obter backup fresco da producao e conferir sua copia no Drive; reconferir os contratos e vinculos em producao; executar somente a correcao aprovada dos quatro codigos com auditoria e verificar o resultado. Manter as migrations, merge na main e deploy de producao como gates separados ate validar compatibilidade e plano de rollback sem perda de dados novos.
