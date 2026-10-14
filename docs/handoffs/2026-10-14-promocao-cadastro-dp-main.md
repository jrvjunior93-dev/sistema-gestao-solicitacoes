# Promocao homologada do cadastro RH/DP para main

## Autorizacao e escopo

- Usuario confirmou dev aprovado e backup recente conferido no Drive cifrado,
  timer ativo. Autorizou promover ajustes e fornecer comandos EC2 producao.
- Cliente 14/10/2026, America/Sao_Paulo, sem delegacao.
- Main 218cc4dd675954e74e6564a3ca0bd792fcc0aa55; refactor homologada
  1b9101df0cc86fae15ff5fb465038f55f425bed9, unico commit funcional pendente.
- Branch codex/promocao-cadastro-dp-main-20261014 criada de origin/main,
  worktree promocao-dp-main-20261014/Fluxy reutilizado. Merge preserva historicos,
  hotfixes/scripts/evidencias de main. Sem nova migration/dependencia/flag ou .env.
- Caixa nao commitada em outro worktree e outputs/ fora do release.
  Sem banco real, configuracao de usuarios, EC2, seed/backfill ou restart pelo agente.

## Regras promovidas

- Salario direto: SUPERADMIN ou DP sem setor operacional OBRA, com concessoes
  nominais rh_dp.colaboradores.editar E rh_dp.salario.aprovar. Vigencia/motivo
  e historico/autor obrigatorios; salarios futuros nao antecipam pagamento.
- Lotacao no cadastro: somente SUPERADMIN, vigencia ate hoje/motivo, admissao e
  vinculo atual respeitados; pendencia de transferencia/historico incoerente
  bloqueiam. Preserva historico inclusive correcoes do mesmo dia/sem local.
- Transferencias incluem Obras e Centros de Custo ativos sem ampliar escopo,
  responsabilidades ou autoaprovacao. Pagamentos/titulos anteriores intactos.
- Frontend preserva padrao corporativo e bloqueia lotacao aos demais perfis.

## Recuperacao

- Tag backup/main-pre-cadastro-dp-20261014-218cc4dd.
- Bundle completo verificado fora da EC2, no worktree desta tarefa:
  tmp/main-code-backup-20261014-cadastro-dp/main-218cc4dd.bundle.
- SHA256 8125F97D0EFB65675C35607195B13296DE38109DCD7CD85EEDDD42410210E8D7.
- Rollback por revert do PR/artefato Vercel e codigo anterior compativel com
  218cc4dd, preservando salarios/vinculos/historicos novos. Sem down ou restore de dados.

## Estado e proximo passo

- Integrar, resolver somente conflitos documentais, executar backend/ACL/legado,
  UI desktop/mobile, build/navegacao/docs e conferir delta antes do PR.
- Publicar/merge por PR sem force/squash apos checks. Nao modificar refactor/frontend.
- Usuario atualiza checkout producao por ff com SHA congelado, branch main,
  arquivos versionados limpos e sem delta de schema/dependencias nao autorizado.
- Antes do restart: timer backup ativo, ambiente production/porta 8000,
  backend-solicitacoes apontando ao checkout certo, UUID producao
  5ed4b970-009f-11f1-809c-0ad0e0c90c53, banco gestao_solicitacoes e schema
  conferido somente leitura. Nenhuma migration/seed/backfill/configuracao de usuarios.
- Preservar flags existentes. Reiniciar somente backend-solicitacoes, nunca backend-dev.
  Health local/publico, recarregar sessao e smoke autenticado DP/SUPERADMIN/negativos.
- Merge/Vercel nao comprova EC2 atualizada; testar recursos novos somente apos
  backend/health conferidos. Permissoes de Luana conferidas na UI, sem script de dados.
