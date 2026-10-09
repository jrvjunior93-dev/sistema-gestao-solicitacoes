# Promocao isolada de medicao e recarga para main - 09/10/2026

## Autorizacao, bases e exclusoes

Usuario pediu migrar as pendencias e receber comandos EC2 de producao.
Confirmou nesta janela backup recente conferido no Drive cifrado e timer
ativo; reafirmou que Pessoal/DP nao deve ser incorporado.

- Main congelada: a06bdfdc8348736ccbab04c234fb13f81f19cf9f.
- Refactor/frontend congelada: f7f91559fd2ad30e1e3507ad5f84740ad80d663e.
- Branch isolada: codex/promocao-medicao-recarga-main-20261009, criada da main.
- Cinco commits selecionados por dependencia (cherry-pick -x): c75fc396,
  a3ab0dec, 6e2e859f, 14421ece e f7f91559. Correspondem a bb8db3d6,
  725fabec, e1fe7f97, bf749854 e 7104ad03 na integracao.
- Edicao de valor/vencimento (9358a692), comprovantes (e5298951), juros/multa
  (905dd2a1) e suas auditorias ja estavam na main; nao foram reaplicados.
- Pessoal/DP 118209c0 continua exclusivamente na refactor/frontend.

Conflitos foram somente no OWNERSHIP_ATIVO; registros das duas linhas
preservados. Nao substituir documentos/implementacoes exclusivos da main.
Diff de backend/src e frontend/src contra refactor/frontend contem somente
os 11 arquivos de RH/DP excluidos; diff da promocao contra main nao toca
arquivos de RH/DP. Configuracoes, migrations e lockfiles permanecem iguais.

## Protecao de codigo

Snapshot da main antes de integrar: tag anotada publicada
backup/main-pre-medicao-recarga-20261009-a06bdfdc, apontando ao SHA congelado.
Bundle completo recuperavel e verificado fora da EC2:
outputs/main-pre-medicao-recarga-20261009-a06bdfdc.bundle, SHA256
E8DD8AB089661EFFFD410316153EE1C886012F0B73D634EF3F1D4D6995E42CD9.
Bundle e evidencias de testes nao versionados. Configuracoes/segredos
operacionais nao estao no bundle. Demais worktrees preservados.

## Escopo funcional

- Medicao aprovada abre os titulos correspondentes e retorna a Obra; modal
  permite autorizacao/fila conforme permissoes independentes, sem duplicidade.
- Financeiro ja abre as parcelas; resumo usa o titulo real e distingue
  status financeiro de status interno/fila, sem inferir baixa.
- Novos envios contratuais resolvem vinculo legado com auditoria e registram
  Financeiro para acompanhamento antes de retornar a Obra.
- Ciclo da medicao mais recentemente registrada governa status/setor global;
  operacoes sobre titulos antigos nao sobrescrevem o ciclo atual.
- Recarga nasce ABERTO com obra/centro; custo continua somente apos prestacao
  validada/classificada, com titulos, valores e anexos separados por cartao.
- Total solicitado compacto/somente leitura na Nova Solicitacao, sem card
  Valor redundante para recarga nem nova mensagem explicativa fixa.

Nao ha migration nova, alteracao automatica de dados ou backfill no startup.
Estados antigos so sincronizam nas operacoes previstas ou por reconciliacao
explicitamente autorizada apos conferencia. O titulo continua ABERTO ate baixa;
envio a fila atualiza seu status interno, nao seu status financeiro para quitado.
Nao reautorizar/reenfileirar pagamentos existentes para corrigir status.

## Validacoes na integracao

- Backend: test:medicao-recarga-envio, validarVinculosTitulosContrato,
  test:fila-juros-multa, test:fila-instrumentos, test:fila-comprovante-pendente.
- Regressoes: acompanhamento GEO, acesso anexos, aprovacao exclusiva de
  contrato, retorno Obra, gestao contratual e pedido Compras/Financeiro GEO.
- Frontend: test:medicao-recarga-envio-ui, test:recargas-multiplas-ui,
  test:cartao-opcional-solicitacao-ui (Chrome, APIs simuladas; desktop/mobile).
- npm run build aprovado; avisos preexistentes Browserslist/chunk >500 kB.
- Sintaxe dos arquivos backend alterados, diff --check e test:docs aprovados.
- Testes offline/modelos simulados; nao substituem concorrencia MySQL real
  nem homologacao autenticada na producao. Nenhum banco real foi acessado.

## Publicacao e deploy

Publicar por fast-forward de main ate a ponta validada e push sem force.
Refactor/frontend mantem f7f91559 com Pessoal/DP reservado para outra janela.
Nao foi criado endpoint/permissao novo nem alterado modo de autorizacao.

Comandos fornecidos ao usuario devem exigir SHA publicado exato, main limpa,
fast-forward, PM2 backend-solicitacoes no checkout de producao e RDS de
producao confirmado por HOST+PORT+DB_NAME. Os ambientes compartilham DB_NAME;
nome do banco sozinho nao distingue dev e producao. Comparar overrides PM2.

Antes de atualizar, fazer backup manual fresco e conferir log de copia fora
da EC2. Depois de npm ci, rodar preflight somente leitura e testes offline;
reiniciar apenas backend-solicitacoes, checar health e conferir deploy Vercel.
Se preflight detectar qualquer migration pendente, parar antes do restart e
revisar a lista: nao incluir migrate, down, seeds ou reconciliacao com escrita.

O agente nao executou deploy, restart, migration ou operacao de banco/S3/EC2.
Depois do deploy, homologar dois ciclos de medicao e recarga multicartao.
Rollback de codigo: SHA/tag anterior e artefato Vercel; nao desfazer baixas,
historicos ou vinculos legitimamente gravados sem investigacao autorizada.
