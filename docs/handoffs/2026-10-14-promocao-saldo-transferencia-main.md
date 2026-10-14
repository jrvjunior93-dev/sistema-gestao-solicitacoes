# Promocao homologada: saldo contratual e transferencias pela Obra

## Escopo e autorizacao

- Usuario autorizou migrar para main, confirmou homologacao em dev, backup
  recente conferido no Drive cifrado e timer ativo. Data cliente 14/10/2026.
- Main congelada c5beb5b9f807d0abde90d69540f1cd35d1d39cb1; fonte homologada
  9bc503087fff1d46f81030c13361cc2eeb0e60f3, unico commit funcional pendente.
- Branch codex/promocao-saldo-transferencia-main-20261014 criada de origin/main,
  no worktree promocao-dp-main-20261014/Fluxy reutilizado, sem delegacao.
- Preservar historico completo e hotfixes/scripts/evidencias exclusivos da main.
  Sem migration, dependencia, flag, .env, banco real ou execucao EC2 pelo agente.
  Alteracoes de caixa nao commitadas em outro worktree e outputs/ fora do release.

## Regras funcionais homologadas

- OBRA vinculada com rh_dp.solicitacoes.abrir pode pedir transferencia;
  responsavel da outra obra aprova; sem origem, responsavel do destino.
  DP/SUPERADMIN podem decidir, sem autoaprovacao pelo autor. OBRA com setor DP
  acumulado segue estrita. Cancelamento de terceiros nao ampliado para DP.
- Saldo contratual sem parcela livre pode ser reprogramado em novas PREVISOES
  por usuario OBRA com acesso e solicitacoes.acoes.criar, sem Editar contratos.
  Centavos/soma, vencimentos, justificativa, limite de 24 parcelas, transacao,
  lock, referencia/idempotencia e auditoria; pagamentos anteriores intactos.

## Recuperacao

- Tag backup/main-pre-saldo-transferencia-20261014-c5beb5b9.
- Bundle completo verificado fora da EC2, no worktree reutilizado:
  tmp/main-code-backup-20261014-saldo-transferencia/main-c5beb5b9.bundle.
- SHA256 C30F85988C7818C76EAD2B4F7F2C985C811D6A5B0454FE61B16ABD24E6EE5FFC.
- Rollback por revert do PR/artefato Vercel e codigo anterior compativel;
  preservar previsoes/transferencias/historicos novos. Sem down/restauracao de dados.

## Estado e proximo passo

- Preparacao: tag/bundle, reserva documental e integracao por merge da fonte.
  Validar backend/ACL/financeiro, UI desktop/mobile, build/navegacao/docs antes do PR.
- Publicacao por PR e merge sem force/squash. Conferir remotos/checks.
- Usuario atualiza somente checkout producao por fast-forward com SHA congelado,
  arquivos versionados limpos e sem delta de migrations/dependencias.
- Antes do restart: timer ativo, UUID 5ed4b970-009f-11f1-809c-0ad0e0c90c53,
  banco gestao_solicitacoes, schema somente leitura, ambiente production,
  PM2 backend-solicitacoes no checkout correto e porta 8000.
- Preservar flags/configuracoes e nao executar migrations/seeds/backfills.
  Restart apenas backend-solicitacoes; health local/publico e smoke autenticado.
- Merge/Vercel nao comprova backend EC2 atualizado. Nao usar os novos fluxos
  antes da atualizacao e health. Nunca reiniciar backend-dev nesta promocao.
