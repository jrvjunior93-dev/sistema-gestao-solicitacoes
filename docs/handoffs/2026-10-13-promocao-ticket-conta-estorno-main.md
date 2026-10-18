# Promocao incremental Ticket por Conta e Estorno independente

## Autorizacao e estado

Usuario homologou em dev, pediu promocao para main e comandos EC2 de producao.
Confirmou nesta janela backup recente conferido no Drive cifrado e timer ativo.
Sem escrita EC2/banco, migrations ou restart pelo agente.

- Base main: fe6d9c5cbaf3dee3cc4e11b6a97553ad2659ac26.
- Origem homologada: 31490a0d5ab39404b2b8bbb3e3285bc75f5faa3d.
- Branch candidata: codex/promocao-ticket-conta-main-20261013.
- Base comum: 447a1dcaf785bbf7cb3c05e0db400e1d9d3ecec5.
- Dois commits pendentes: a9b0c908 (estorno exige somente Estornar movimento)
  e 31490a0d (Ticket por conta cadastrada, sem boleto, titulo por colaborador).
- Integracao criada da main; preserva 30 commits exclusivos, runner de producao
  e testes/historias documentais. Nao substituir main pela refactor.

Snapshot de codigo fora da EC2: tag local
backup/main-pre-ticket-conta-20261013-fe6d9c5c e bundle completo verificado
tmp/main-code-backup-20261013-ticket-conta/main-fe6d9c5c.bundle, SHA256
7B48375479EF49113EEEA9C20AE98ADF01C23DFD57CABF1D741E37B19CE1C150.
Nao contem .env, banco, anexos S3 nem os outputs de QA.

## Integracao e compatibilidade

Somente conflito documental em OWNERSHIP_ATIVO, resolvido mantendo os dois lados.
Runtime backend/src e frontend/src identico ao alvo homologado. Schema e quatro
manifestos/lockfiles identicos a main: 266 migrations, nenhuma nova neste pacote.
Preservados ACL/escopos, liberacao GEO, Boleto/Pix e flags de producao.
Forma financeira TRANSFERENCIA precisa estar ativa para Ticket por Conta.
Nao criar forma por seed nem habilitar funcionalidades por flag neste deploy.

## Validacoes locais

- validarRhTicketPix: Boleto/Pix/Conta, contas/snapshots sem truncamento, legado,
  centavos, lotacao/GEO, ACL, idempotencia e rollback; helper bancario real isolado.
- validarFilaEstornoPermissao, validarFilaBaixaEstorno e
  validarFilaLiquidacaoRateada: permissao independente, carteira, fatura,
  rateio, estorno atomico, escopo e replay.
- validarPermissoesFinanceiroRota e validarFilaPagamentoSolicitacaoAcesso:
  mapa granular e anexos autorizados preservados.
- validarReleaseProducao20261013: gates do runner existente de processo,
  UUID, porta, migrations e fontes imutaveis.
- validarEscopoRhDpUsuarioObra e validarRhDpRegrasPagamento: com getConnection
  bloqueado explicitamente. validarSegurancaAcessoDireto: 2304 comparacoes,
  exclusao, ACL por ID, identidade/perfil e auth/tokens/47 rotas.
- Build integrado aprovado (17,27 s), avisos existentes Browserslist/chunk.
- validarRhTicketPix UI: desktop/mobile, conta cadastral/fallback, revisao,
  formulario/multipart/mutex e cadastro intacto, com APIs isoladas.
- validarFilaInstrumentosUI: suite desktop/mobile aprovada no checkout integrado
  estavel. Primeira tentativa durante preparacao foi invalidada por HMR apos
  troca de branch (fixture perdeu estado); nao era falha de regra financeira.
  Nao alterar arquivos runtime enquanto suites Vite/Playwright executam.
- Documentacao e diff/sintaxe conferidos antes da publicacao do candidato.

## Sequencia para concluir

1. Publicar candidato e PR draft, sem mover main/Vercel de producao.
2. Usuario verifica o HEAD/processo do checkout de producao, cria branch de
   backup do HEAD anterior e avanca por fast-forward ao SHA exato do candidato.
   Preservar .env e arquivos de auditoria nao rastreados; sem reset/clean.
3. No backend de producao executar releaseProducao20261013.js --preflight SHA.
   Runner existente usa configuracao efetiva do PM2, confere UUID de producao,
   porta 8000 e impede configuracao de dev. Nao usar --aplicar neste incremento.
4. npm run preflight:schema deve comprovar zero pendencias. Se houver qualquer
   migration pendente, parar e informar; nao executar migrate nem marcar registros.
5. Testes isolados de Ticket e permissao/estorno; reiniciar somente
   backend-solicitacoes --update-env. Conferir localhost:8000/health,
   api.jrfluxy.com.br/health e smoke do fluxo legado/autenticacao.
6. Usuario envia resultado. Somente depois promover o candidato para main,
   liberando o frontend Vercel sem antecipar UI que depende do novo backend.
   Confirmar que main nao avancou desde a base, integrar sem force-push e validar
   deploy de producao. Se base mudar, revalidar integracao antes de publicar.
7. Smoke em producao de Ticket por Conta e Estornar movimento sem Resolver;
   Boleto/Pix e permissao negativa continuam preservados.

## Rollback

Codigo anterior de producao preservado pela branch de backup criada na EC2 e
pela main fe6d9c5c; frontend pela revisao Vercel anterior. Nao restaurar banco,
excluir titulos/beneficiarios nem executar down: schema nao mudou. Se ja houver
Tickets novos, preservar os dados e suspender novas operacoes para avaliar o
rollback de codigo; nao supor que voltar frontend cancela os titulos criados.

Proximo passo pendente: preflight/health reais de producao pelo usuario; testes
locais nao comprovam estado do RDS, PM2 ou da sessao autenticada de producao.
