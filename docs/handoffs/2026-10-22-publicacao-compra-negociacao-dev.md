# Publicacao DEV - Compra Direta e pagamento na negociacao

## Autoridade e limites

Usuario autorizou commit/push dos dois ajustes na refactor/frontend e comandos
para o operador atualizar EC2 DEV, aplicar migration e testar. Agente unico,
sem deploy, banco/EC2/S3/Redis reais ou DDL real. Sem main/producao, alteracao
de memoria, dependencias, .env ou flags. Base DEV41219c3a; origin/main fe663151
conferido somente leitura. outputs/ privado excluido do commit.

## Pacote

- Credor da Compra Direta obrigatorio conforme configuracao efetiva na tela
  e backend; nome digitado sem cadastro nao basta; rascunhos/ACL preservados.
- Forma e dados de pagamento na previa/confirmacao da negociacao; novas
  parcelas recebem instrucao. Edicao dedicada de parcelas legadas como
  TIT-011543 sem alterar valor, vencimento, credor, rateios ou origens.
- Migration 202610220001_titulo_negociacao_pagamento.js adiciona somente JSON
  nullable pagamento_negociacao. Nao preenche registros nem altera pagamentos.
- Aplicador DEV e QA isolado: aplicarMigrationNegociacaoPagamentoDev.js e
  validarDeployCompraNegociacaoDev.js. Runner estrutural existente preservado.
- Roteiro ops/deploy/atualizar-dev-compra-negociacao-20261022.sh: valida backup,
  checkout real, branch, arvore rastreada limpa, lock, PM2 online8001 sem watch,
  .env inalterado, ancestry/ff-only e packages/locks sem delta. Antes do merge
  confere schema antigo em leitura. Depois testa, confere UUID/host/banco DEV,
  variaveis PM2/flags/schema e aplica apenas a migration esperada. Se outra
  migration estiver pendente, aborta. TLS exigido quando CA ja configurada;
  nao configura ou enfraquece TLS existente e nao expoe credenciais.
- Somente a autorizacao temporaria local do runner; restaurada mesmo apos
  erro. Nao e persistida nem enviada ao PM2. Reinicia apenas backend-dev sem
  --update-env, confere health8001/schema/sessao12h. Sem operacao financeira.

## Operacao pelo usuario

1. Conferir backup recente recuperavel do banco DEV (nao apenas o de producao).
2. Confirmar o SHA publicado na refactor/frontend informado na resposta final.
3. Na EC2, dentro de /home/ubuntu/sistema-gestao-solicitacoes-dev, buscar
   refactor/frontend, extrair o roteiro do SHA exato com git show e executar
   via bash -s -- SHA, com CONFIRM_DEV_BACKUP=SIM somente nesta execucao.
4. Nao usar npm run migrate generico nem ALLOW_SCHEMA_MIGRATIONS permanente.
   Nao reiniciar backend-solicitacoes. Se guarda falhar, parar e conferir;
   nao contornar guardas, forcar Git ou promover main.
5. Confirmar deploy frontend do mesmo commit no projeto Vercel DEV. Se nao
   ocorrer automaticamente, redeploy do commit apenas no projeto DEV.
6. Homologar no dominio refactor-dev.jrfluxy.com.br com dados de teste.

MySQL DDL nao tem rollback transacional: falha/timeout exige verificar estado
antes de reiniciar. Migration e aditiva/idempotente; reaplicar pelo mesmo
roteiro apos conferencia permite concluir registro estrutural sem duplicar
coluna. Nao remover a coluna nem executar down: preserva instrucoes gravadas.
Nenhum registro legado, inclusive TIT-011543, e alterado pelo deploy.

## Homologacao DEV

- Compra Direta configurada com credor obrigatorio: nome apenas/sem selecao
  nao avanca; selecao valida permite revisao/envio. Rascunho incompleto antigo
  e novo continuam recuperaveis. Favorecido diferente/desconto/frete intactos.
- Quando configurado opcional, nao exigir credor silenciosamente. Fazer essa
  conferencia apenas em configuracao DEV, sem mudar producao.
- Negociar titulos de teste com PIX, favorecido diferente e texto; gerar
  previa, mudar instrucao e exigir nova previa/aceite. Conferir parcelas/soma.
- Abrir parcela negociada nova e legada sem instrucao (exemplo TIT-011543
  somente se presente no DEV). Usar Editar dados de pagamento, salvar e
  reabrir. Verificar historico/auditoria e valores/vinculos inalterados.
- Edicao generica continua bloqueada; edicao de pagamento exige permissao e
  todas as obras/origens acessiveis. Fila/autorizacao/baixa/cartao/cobranca
  emitida continuam bloqueando. Nao regularizar esses fluxos artificialmente.
- Conferir instrucao no DTO/tela autorizada da fila sem efetuar pagamento
  real. Nao testar baixa nem integracao bancaria real por este roteiro.

## Validacoes locais

Repetidos os QAs dedicados de credor e pagamento, guardas/aplicador em memoria,
negociacao/domain/vinculos/sincronizacao/migration, fila multiplas fontes,
instrumentos/estorno, autorizacao unica e favorecidos, Compra Direta gestao,
frete financeiro/credor/acesso GEO. Testes UI reais com API interceptada em
1366/390, build, Node/Bash/diff e documentacao. Sem MySQL/servicos reais.
Build final635modulos/11,99s; avisos preexistentes Browserslist/chunk grande.
Documentacao602Markdown/19canonicos aprovada. Navegacao gerada sem delta.
QA antigo validarCompraDiretaFrete.js tem marcador estatico obsoleto anterior
ao delta; nao foi enfraquecido. Limitacao detalhada no handoff Compra Direta.

## Proximo passo

Concluir commit/push e verificar SHA remoto refactor/frontend; entregar SHA e
comandos ao usuario. main deve permanecer fe66315160468b02651a0e6abddfea76050a9ea5.
Operacao/homologacao DEV e aplicacao da migration ficam com o usuario. Nao
declarar banco atualizado ou TIT-011543 corrigido sem o teste real do usuario.
