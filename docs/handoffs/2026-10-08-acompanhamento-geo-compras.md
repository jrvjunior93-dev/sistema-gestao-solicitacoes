# Acompanhamento GEO apos envio a Compras - 2026-10-08

## Evidencia e escopo autorizado

Usuario confirmou deploy anterior e autorizou corrigir visibilidade/consulta
apos encaminhamento, preservando escrita por setor. Diagnostico de producao
fornecido pelo usuario: Liz (ID 2) tem visualizar Compras, editar itens,
encaminhar Compras e visualizar setor; nao tem visualizar todas as solicitacoes.
SOL-6265 tem ID 6300 e compra ID 591, LIBERADO/COMPRAS; encaminhamento foi
registrado pela Liz. ID 6265 corresponde a outra solicitacao (SOL-6230).

A lista geral so reconhecia ENVIADA_SETOR, enquanto o fluxo de revisao registra
SOLICITACAO_COMPRA_ENCAMINHADA_COMPRAS com setor do ator numerico e origem/destino
nos metadados. Consultas de compra tambem perdiam a excecao GEO apos a revisao.
Os logs enviados nao comprovam o endpoint exato do aviso de acesso negado;
somente negativas antigas da carteira de cheques foram retornadas.

## Alteracoes

- Helper puro de encaminhamento auditado: parse seguro e condicao MySQL de
  leitura; caminho JSON por CHAR(36), evitando bind indevido do Sequelize.
- SolicitacaoController reconhece eventos existentes em lista/contadores/busca
  e leitura de detalhe/escopos historicos, sem modificar permissoes ou dados.
- CompraController acrescenta acompanhamento GEO opt-in somente em dois GETs,
  exigindo permissao de visualizar, passagem auditada pelo GEO e visibilidade
  da principal; excecao nao e usada nas transacoes de escrita.
- Anexos usam a mesma interpretacao do encaminhamento, preservando negativas
  para setores nao participantes e metadados invalidos.
- CompraEtapas distingue acao gravada de falha de atualizacao; erro real de
  gravacao e trava de duplo clique permanecem.
- Fixtures antigas de Compra Direta/etapas adaptadas aos helpers atuais.

## Estado

Implementacao e validacoes locais concluidas na refactor/frontend. Ownership
liberado. Sem banco real, migration, EC2, commit, push ou deploy. outputs/
preexistente preservado.

## Validacoes executadas

- `node backend/scripts/validarAcompanhamentoGeoCompras.js`: historico existente,
  SQL MySQL real gerado, aliases, leitura/anexos, metadata invalida, falta de
  permissao/visibilidade e negativa nas transacoes de escrita.
- `node frontend/scripts/validarEnvioComprasAtualizacao.mjs`: funcao real da UI
  executada em VM, envio concluido com falha de leitura, envio realmente negado
  e duplo clique sem repetir a gravacao.
- Compra Direta GEO, acesso a anexos, resumo das etapas de pedido e devolucao de
  retorno passaram. A fixture antiga do resumo estava sem req.user e sem stub
  das leituras de comentarios; foi atualizada sem mudar seu controller.
- Sintaxe dos controllers/helper/anexos, `git diff --check`, documentacao e
  build Vite aprovados. Permanecem os avisos existentes de Browserslist antigo
  e chunk acima de 500 kB.
- Testes nao consultam producao nem comprovam a mensagem na sessao real da Liz;
  homologacao integrada apos deploy permanece necessaria.

## Proximo passo

Incidente posterior ao deploy: log de producao confirmou ER_INVALID_JSON_CHARSET
nas consultas da lista/obras/contadores da Liz. CHAR(36) gerava caminho binary.
Hotfix autorizado usa CHAR(36 USING utf8mb4), com teste de execucao MySQL somente
leitura. Continuidade: docs/handoffs/2026-10-08-geo-compras-json-charset.md.
As validacoes anteriores de SQL gerado nao cobriram a execucao no servidor;
nao tratar sua aprovacao como homologacao integrada dessa consulta.

Usuario autorizou em 08/10/2026 commit/publicacao na refactor/frontend e
promocao para main, seguidos de comandos de atualizacao da EC2 de producao.
Esta correcao nao adiciona migrations nem depende de backfill. O deploy deve
parar se o preflight indicar schema pendente, sem aplicar migrations por conta
propria. outputs/ nao entra no commit.

Backup recente no Drive cifrado e timer ativo confirmados pelo usuario nesta
publicacao. Base congelada: main 3e216c46bd5c1e0957e68ea3d6d195acc9003a14,
refactor/frontend 27220d1358be6ff094e732873de714e5fda5a893. Snapshot de codigo
em backup/main-pre-geo-compras-20261008-3e216c46 e bundle local verificado
outputs/main-pre-geo-compras-20261008-3e216c46.bundle (SHA-256
3500429CCD9532EC24E0463C82D2F146735E55DAD65A72DAB9794B7788054737).
O bundle esta fora da EC2, no computador local; nao foi enviado ao Drive.
Integracao parte da main, sem reset/force-push ou perda de hotfixes.

Depois de publicacao explicitamente autorizada e deploy, homologar com Liz:
localizar SOL-6265, consultar itens/anexos, enviar
outra compra em GEO e conferir sucesso; tentar editar fora de GEO deve continuar
bloqueado. Se persistir negativa, coletar URL/status/resposta do request exato,
sem conceder permissoes amplas para contornar o erro.
