# Integracao refactor/frontend → main (03/10/2026)

## Estado

- Trabalho em worktree isolado `codex/promocao-refactor-main-20261003`; **nao** ha deploy nem alteracao no banco de producao.
- Base main: `250b652032e4dc4bf85845e51d943c47ef7a8768`; alvo refactor: `811a5cce4728621500c0fc3aa85baec737840cd2`.
- Merge amplo em andamento, ainda nao commitado. Os conflitos foram resolvidos inicialmente com `-X theirs` e as divergencias de funcionalidades exclusivas da main estao em revisao manual.
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

- 85 migrations ainda pendentes em producao. **Nao executar em producao** antes de ensaio no schema isolado e verificacao da compatibilidade com a main antiga.
- Ensaio na copia do RDS staging confirmou identidade/TLS e parou na terceira migration, `202608160052_contratos_codigo_obra_unico.js`. As duas primeiras ficaram registradas somente em `fluxy_restore_20261003` (agora 83 pendentes). A auditoria somente leitura identificou cinco contratos com codigo `CT/ADM001-33` na obra 23: IDs 715 a 719. O ID 719 tem duas solicitacoes e uma apropriacao; 715 a 718 tem zero solicitacoes e uma apropriacao cada. Nenhum registro foi alterado ou removido. Nao repetir o script enquanto o bloqueio e o estado parcial nao forem tratados.
- O rollback do codigo nao reverte schema nem dados: para a proxima semana, usar codigo antigo apenas se compatibilidade com schema novo for demonstrada. Snapshot antigo nao pode substituir o banco vivo sem perda de dados novos.
- Guardar novo backup e snapshot imediatamente antes da execucao em producao; validar tambem rollback da Vercel e plano de monitoramento.
- Nao tocar nas alteracoes locais preexistentes no checkout main da EC2 (`backend/package-lock.json` e tres arquivos de auditoria).

## Proximo passo exato

Revisar e testar a integracao local, concluir commit/push da branch isolada; configurar credenciais **somente para conta restrita de restauracao** em checkout de ensaio separado na EC2 (sem compartilhar senha), rodar `ensaiarMigrationsRestauracao.js`, validar dados e testar a main antiga contra copia do schema migrado. Somente depois decidir a promocao para main/producao.
