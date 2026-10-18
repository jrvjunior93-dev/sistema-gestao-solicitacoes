# Promocao integral para main - 2026-10-18

## Autoridade e recorte

- Usuario solicitou migrar pendencias para main e receber comandos EC2.
- Confirmou backup recente conferido no Drive cifrado, timer ativo e testes
  manuais DEV da passkey e diaria com Luana e Obra. Log DEV em 12c13ec8:
  nenhuma migration pendente, sessao 12h e health HTTP 200.
- Apos explicada a separacao do OFX/textos locais, autorizou promover tudo.
  OFX foi revalidado localmente com HTTP simulado, nao homologado manualmente
  pelo usuario no DEV. Nao apresentar esse teste como acesso a conta real.
- Origem main 8f1b2c8530262b5536853262e95b15c11e8f24b3; sete commits
  publicados ate 12c13ec8, mais OFX/textos e protecoes deste roteiro.
- Agente unico; outputs preservados e excluidos do Git. Nao operar EC2,
  MySQL real, PM2, .env, S3 ou permissoes individuais durante a publicacao.

## Conteudo funcional

- Autorizacao por obra, titulos em tela inteira e navegacao anterior/proxima,
  voltar nativo, selecao entre obras/paginas, filtros/data e estados financeiros.
- Rejeicao de saldo em fila inclusive parcialmente pago, motivo/passkey,
  historico e nova autorizacao obrigatoria; sem estornar valores ja pagos.
- Observacoes dos titulos na fila, boletos dedicados e rastreabilidade de pedido.
- Mensagem amigavel para passkey nao concluida, sem POST e com selecao mantida.
- RH/DP: diaria BRL em solicitacao de admissao, transferencias pelo DP sem
  autoaprovacao, catalogos de consulta e exportacao documental por colaborador.
- Data informativa de inicio efetivo, sem inferir datas antigas ou recalcular.
- OFX: modo FINANCEIRO/TODOS, loading/erro/retry; todas obras/centros mediante
  ACL financeira existente, sem conceder SUPERADMIN ou ampliar solicitacoes.
- Rotulos Dados para autorizacao e Valor enviado para autorizacao; nao renomear
  campos tecnicos, hashes ou historicos. Nenhum reparo/exclusao de titulos reais.

## Duas migrations exclusivamente estruturais

1. 202610180001_rh_inicio_efetivo_obra.js: DATE nullable em rh_colaboradores.
2. 202610180002_bloqueio_pagamento_proprietario.js: JSON nullable em titulos.

Sem seeds/backfill; ledger de execucao do engine e mantido. Ambas verificam
existencia; retomada aceita subconjunto pendente dessas duas, inclusive coluna
ja criada antes de interrupcao. Divergencia de tipo/nulabilidade bloqueia.
DDL MySQL tem commit implicito: nao prometer rollback transacional do pacote.
Nunca executar down/restauracao/exclusao automatica em falha. Enviar a saida
para avaliar o ponto exato e retomar somente pelo runner restrito.

## Roteiro do operador

- ops/deploy/atualizar-producao-20261018.sh recebe SHA40 publicado na main.
- Exige CONFIRM_PROD_BACKUP=SIM e CONFIRM_PROD_BACKUP_TIMER=SIM; branch main,
  caminho fisico produtivo, tracked clean, flock e fast-forward ate SHA exato.
- Conferencia de PM2/porta/watch antes de atualizar arquivos; nao usar pull
  sem pinagem, force, reset, stash automatico ou migracao generica.
- Instala dependencias pelo lock, executa testes isolados e preflight produtivo.
- promoverSchemaProducao20261018.js confere caminho/host/banco/UUID, PM2,
  flags persistidas, .env/configuracao, CA TLS e sessao SQL criptografada,
  semantica JSON e JWT 12h. Qualquer outra migration pendente impede aplicar.
- --verificar nao escreve; --aplicar escopa ALLOW_SCHEMA_MIGRATIONS apenas
  dentro do processo com finally; --concluido exige zero pendencias/colunas.
- Nao altera .env, PILOT, switch, TLS ou duracao da sessao. Se configuracao
  antiga divergir, parar e diagnosticar, nao corrigir flags automaticamente.
- Reinicia somente backend-solicitacoes, sem --update-env: nenhuma configuracao
  mudou, preservar ambiente PM2 e nao propagar flags do terminal ao servidor.
- Confere health na porta8000 com retentativas e repete preflight concluido.
  Nao altera checkout DEV, banco staging, backend-dev ou outros processos.
- Push main pode disparar frontend Vercel antes do backend. Executar EC2 na
  mesma janela e conferir deployment Vercel de producao desta versao; frontend
  nao e compilado nem publicado pelo roteiro EC2. Atualizar/reabrir PWA depois.

## Validacoes locais

- validarDeployProducao20261018: E/S injetadas, sem banco/rede/EC2. Negativos
  de caminho/host/UUID/PM2/watch, configuracao/PILOT/TLS/sessao/backup/timer,
  whitelist, tipo/nulabilidade, falha/restauracao da flag e retomada parcial.
- Suites backend: OFX/ACL, RH diaria/contatos/documentos/transferencias,
  rejeicao/convergencia, painel, renegociacao/vinculos, medicao, fila,
  compra direta e snapshots de favorecidos aprovados.
- CTE real com 650 titulos/150 obras e cursores aprovada no SQLite em memoria
  com adaptacao JSON_ARRAYAGG; isto NAO e uma execucao MySQL real.
- UI real/HTTP isolado: OFX, passkey/painel/fullscreen/navegacao, RH/ZIP,
  medicao; build 619 modulos. Avisos preexistentes Browserslist/chunks grandes.
- Bash -n e diff --check. Nao executar npm audit fix/force nesta promocao.
  Vulnerabilidades apontadas no npm ci do DEV exigem trabalho independente.

## Conferencia funcional apos atualizar

- Novo login; passkey nominal fora de Testar usuario: cancelar/repetir;
  voltar detalhe -> titulos -> obras e decisoes com motivo.
- Fila: observacoes e saldo rejeitado bloqueado, valores pagos preservados;
  nao baixar/rejeitar titulos reais apenas para ensaio tecnico.
- Luana/Obra: fluxo de admissao por diaria e inicio efetivo informativo;
  verificar dados antes de qualquer envio real.
- OFX com Helida: abrir Conferir manualmente -> Novo titulo + baixa e conferir
  lista completa de obras/centros, sem salvar baixa ficticia em producao.
- Conferir exportacao documental de empresa autorizada e comprovantes.
- SQL da negociacao especifica continua apenas diagnostico separado:
  auditarNegociacoes20261017.js --verificar; nenhuma exclusao automatica.
