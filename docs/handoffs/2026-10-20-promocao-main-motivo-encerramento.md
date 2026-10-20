# Promocao MAIN do motivo de encerramento sem pedido

## Autorizacao e escopo

Usuario homologou DEV93f75d67f773b9687bbf7acb9cf4664243f42c84 e autorizou
promover para main e2e13d449ffd6b2a0a631635e75058af9132234b. Confirmou backup
recente no Drive cifrado conferido e timer ativo para esta promocao.
Agente unico; nao acessou EC2/SSH, banco/S3 ou configuracoes reais.

Branch criada da main, incorpora historico DEV sem reset/cherry-pick. Quatro
conflitos somente documentais, resolvidos preservando registros dos dois lados.
Runtime backend/src e frontend/src identico ao DEV homologado; unica mudanca
de runtime ante main e descricao do evento COTACAO_ENCERRADA_SEM_PEDIDO igual
a justificativa ja salva. Sem prefixo/resumo/saldo, conforme pedido do usuario.
Autor/data/acao/status/metadados, pedidos, permissoes, locks e transacao mantidos.
Sem frontend/migration/dependencia nova ou reescrita de encerramentos antigos.

## Recuperacao preventiva

Tag backup/main-antes-motivo-20261020-e2e13d44 no SHA anterior. Bundle completo
privado verificado fora da EC2: outputs/main-antes-motivo-e2e13d44.bundle,
SHA256 526b4891955022aceeef6882136c860d3799bbf112819631953ad4a3b4460bfa.
Bundle nao publicado no repositorio; nao substitui o backup cifrado do banco.

## Roteiro e verificacoes

Roteiro historico ops/deploy/atualizar-producao-cheques-20261019.sh inclui
validarEncerramentoSemPedidoHistorico.js apos merge pinado/antes do restart;
exige ancestralidade93f75 e preserva todas as guardas. Bootstrap continua nos
verificadores JA instalados antes do merge: schema sem pendencias/DDL, UUID,
TLS, PM2/watch/porta8000, sessao12h/PILOT/push. Hash.env preservado, npm ci,
testes isolados, restart somente backend-solicitacoes e health8000; nao toca DEV.
Backup/timer, checkout main limpo e ancestralidade/ff-only obrigatorios.
Nenhum encerramento/baixa/cancelamento/regularizacao real e executado pelo roteiro.

## Validacoes locais

- Novo QA do motivo: reproduz ausencia no texto antigo, servico/controller reais
  em memoria, motivo exato em descricao/observacao/metadata, autor/status,
  acentos/multilinha/2000 caracteres e limites, pedidos/saldos preservados.
- Mesma chave idempotente nao duplica, outra chave em encerrado recusa; ACL/
  escopo negados sem escrita e falha de Historico propaga rollback completo.
- Regressao cotacao/envio e todos testes do roteiro produtivo aprovados:
  guardas, upload/historico/parser/schema, cheques/descontos/contrato/rateio,
  carteira/multiplas fontes/cartao/bloqueio proprietario.
- Guardas produtivas de financeiro/reenvio/DEV, Bash/Node e diff aprovados.
- Build frontend e documentacao aprovados; frontend inalterado e runtime
  conferido byte a byte contra DEV, migrations/dependencias contra main anterior.
  Avisos preexistentes de Browserslist/chunks nao alterados.

## Operador e rollback

Publicar via PR main, head esperado. Operador executa roteiro no SHA final,
somente checkout main limpo com backup/timer conferidos. Se falhar, parar e
trazer log sem segredos; nao contornar guardas ou aplicar migrations.
Conferir o motivo no proximo encerramento legitimo, sem encerrar solicitacao
real apenas para testar. Historicos antigos permanecem preservados.

Em regressao, preservar historicos/fechamentos e registrar incidente; backend
pode retornar ao SHA e2e13 compativel mediante plano autorizado e restart apenas
de producao. Nao apagar historicos, executar down ou restaurar banco automaticamente.
Ownership liberado para commit/PR/merge autorizado; EC2 somente pelo operador.
