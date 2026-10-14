# Promocao homologada de transferencias DP para main

## Escopo e autorizacao

- Data do cliente: 14/10/2026, America/Sao_Paulo.
- Usuario solicitou promover os commits pendentes, incluindo colaboradores do DP.
- Confirmou backup recente no Drive cifrado, timer ativo e homologacao em dev.
- Main congelada: `5936d3fb9b7f01486187f53a2e9043045eb27272`.
- Origem homologada: `3a1b2300e273b85d2993f3d9c592b43c2a6a8747`.
- Candidato: `codex/promocao-dp-main-20261014`, criado a partir da main,
  com integracao seletiva do unico commit funcional novo (copia `2353fb20`).
- Comparacao de backend/src e frontend/src com refactor/frontend: sem diferencas.
  Hotfixes, scripts e evidencias de release exclusivos da main foram preservados.

## Alteracao funcional

- Transferencias exibe Todos Colaboradores ativos, mesmo ao abrir um local.
- Diretorio limitado a identificacao profissional e obra atual, sem dados pessoais
  financeiros ou documentos. Escopo das solicitacoes de transferencia preservado.
- Colaborador ativo sem obra pode ser alocado pelo responsavel vigente do destino,
  com justificativa, vigencia, historico, transacao e protecao contra repeticao.
- Fluxo entre obras, autorizacoes e bloqueios de vinculo divergente permanecem.
- Sete arquivos do commit original: dois services, pagina de transferencias,
  testes backend/frontend, README RH/DP e handoff funcional original.

## Validacoes locais aprovadas

- `node backend/scripts/validarRhPessoalFluxo.js --transferencias`.
- `node backend/scripts/validarEscopoRhDpUsuarioObra.js`.
- `node backend/scripts/validarSegurancaAcessoDireto.js`.
- `node backend/scripts/validarFilaEstornoPermissao.js`.
- `node backend/scripts/validarRhTicketPix.js`.
- `node backend/scripts/validarTrocaUsuarioProducao.js`.
- Syntax check dos dois services alterados.
- `npm run build` e `node scripts/validarRhPessoalTransferencias.mjs` no frontend:
  diretorio, busca/paginacao, envio e responsividade desktop/mobile.
- `npm run test:docs` e `git diff --check`.
- Build com avisos existentes de Browserslist antigo e tamanho de bundle.
- O teste de UI inicialmente encontrou dist/index.html ausente no worktree novo;
  apos o build, foi executado novamente e aprovado, sem modificar o teste.
- Nao foi executada a suite inteira antiga de jornada: este candidato usa o modo
  focado de transferencias; a limitacao de fixture esta no handoff funcional.

## Exclusoes e seguranca operacional

- Nenhuma migration, pacote ou lockfile novo; nenhuma alteracao de flags.
- Obra obrigatoria nas entradas/saidas de caixa continua local, fora deste release.
- Adiantamento para Obra foi discutido, mas nao implementado nem incluido.
- Nenhum banco real, EC2, migration, seed/backfill ou PM2 foi acionado.
- Evidencias visuais em outputs/ nao devem ser versionadas.

## Recuperacao e proximo passo

- Tag: `backup/main-pre-dp-transferencias-20261014-5936d3fb`.
- Bundle completo verificado, fora da EC2:
  `C:/Users/Ricardo/.codex/worktrees/promocao-main-20261003/Fluxy/tmp/main-code-backup-20261014-dp/main-5936d3fb.bundle`.
- SHA256: `A433F77ADA46D7F1015BD1A294E9FF3F013B2948BD566AB7427CF26A79F7DB74`.
- Publicar candidato e abrir PR para main, conferir checks e concluir por merge,
  sem force-push nem substituicao do historico da main.
- Apos merge, atualizar somente o checkout de producao e backend-solicitacoes,
  conferir health e homologar diretorio/transferencia em sessao autorizada.
  Nao executar migrations neste release nem reiniciar backend-dev.
- Frontend Vercel e backend EC2 sao publicacoes distintas: merge nao comprova
  que a EC2 foi atualizada. Backend antigo pode rejeitar transferencia sem obra.
- Rollback: reverter o PR ou restaurar codigo/artefato compativel com 5936d3fb,
  preservando historicos e lotacoes criadas; nao apagar dados de negocio.
