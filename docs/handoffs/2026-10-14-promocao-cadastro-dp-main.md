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

## Validacoes do candidato

- Integracao 49602cf4: conflito somente OWNERSHIP_ATIVO, resolvido preservando
  as duas linhas documentais. Nenhum arquivo removido; runtime backend/src e
  frontend/src identico a refactor homologada; sem delta de schema/dependencias.
- Backend consulta/salario DP nominal, lotacao SUPERADMIN, transferencias/centros,
  escopos positivos/negativos, primeira lotacao, contatos e planilha aprovados.
- Seguranca direta: 2304 comparacoes, 66 casos de escopo e 47 rotas HTTP.
  Regressao saldo contratual, Ticket Conta/Pix/Boleto, estorno granular e troca
  de usuario producao exclusiva do SUPERADMIN aprovadas.
- UI real com APIs simuladas: cadastro DP autorizado/negado, lotacao SUPERADMIN,
  vigencia/motivo/payload, desktop/mobile, contatos, remount/revisao/403 e
  transferencias para Centro aprovados. Sem banco/rede externa.
- Navegacao 220 rotas/218 destinos, sem links mortos; catalogos consistentes.
  Build aprovado 587 modulos, avisos preexistentes Browserslist/bundle.
- Docs 525 Markdown/19 canonicos; sintaxe e diff/check aprovados.
- Tag anterior publicada, bundle completo verificado fora da EC2.
  Nenhum banco real/EC2 acessado nestes testes; dev aprovado pelo usuario.
- Ownership liberado para publicacao autorizada.

## Estado e proximo passo

- Candidato validado; publicar por PR e conferir checks antes do merge.
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
