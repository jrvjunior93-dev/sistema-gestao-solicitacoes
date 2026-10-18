# Publicacao DEV: PWA por periodo/fila direta e RH - 2026-10-18

## Autoridade e pacote

- Usuario autorizou commit/push dos ajustes locais na refactor/frontend e
  comandos EC2 DEV com validacao MySQL/Redis/passkey. Nao autorizou promover
  main ou operar producao. Agente unico, worktree performance-fila-dp.
- Base remota main/refactor/frontend762370cf conferida por fetch e ls-remote.
  Commit local sera enviado por HEAD:refs/heads/refactor/frontend sem force.
  Nao mover o checkout refactor/frontend de outro worktree nem publicar outputs.
- Inclui PWA: bases de data, pagamentos reais/parciais/estorno, fila direta e
  autor, status atuais, cursores/contagem unica, rejeicao de saldo com passkey
  nominal e desafio atomico separado. RH: admissao opcional, inicio efetivo
  obrigatorio no pedido, admissao NULL ao aprovar e catalogo no detalhe.
- Mapas, arquivos, invariantes e evidencias nos handoffs locais PWA e RH deste
  dia. Nenhuma migration nova; schema762370cf deve estar aplicado no DEV.
- Sem mudanca de dependencias, .env, PILOT, TLS, sessao12h, permissoes, saldos
  ou dados reais. Nao executar comandos EC2/Redis/MySQL reais pelo agente.

## Por que MySQL e Redis

- MySQL ja e o banco do sistema. SQL local executado em SQLite nao comprova
  dialeto MySQL, hidratacao ORM, plano, indices ou tempo real. Verificar tres
  bases de data e cursores por SELECT/EXPLAIN no DEV antes do restart.
- Redis ja era usado no armazenamento temporario dos desafios de passkey.
  Rejeicao direta adiciona consumo unico atomico GETDEL, para evitar replay de
  duas confirmacoes simultaneas. Comando requer Redis6.2+ e nao possui fallback
  GET/DEL. Nao instalar/atualizar Redis automaticamente.
- verificarRedisPasskeyDev usa apenas SELECT identidade/schema, PING e COMMAND
  INFO GETDEL: nao cria/consulta/remove chaves de negocio nem desafios reais.
  Valida RP/origens HTTPS e consistencia com PM2, sem imprimir URLs/segredos.
  Se a ACL negar COMMAND, a inspecao e inconclusiva e o roteiro para; nao alterar
  permissoes automaticamente. Assinatura/UV e ACL real sao testes no navegador.
- Validar infra nao substitui confirmar que os7/4 titulos reais dos prints
  diferiam apenas pelo envio direto; nenhum registro produtivo foi auditado.

## Roteiro entregue ao operador

- Usar SHA completo publicado informado na resposta da conversa. A partir de
  /home/ubuntu/sistema-gestao-solicitacoes-dev, fetch origin refactor/frontend,
  ler com git show SHA:ops/deploy/atualizar-dev-pwa-periodo-20261018.sh e
  executar com bash -s -- SHA (pipefail). Nunca usar caminho main ou pm2 all.
- Roteiro valida caminho real, branch, tracked limpo, lock e PM2/porta/watch
  antes de alterar arquivos. Sessao/UUID/schema DEV conferidos antes do merge.
  Merge somente fast-forward para SHA alcancavel no remoto. npm ci --omit=dev.
- Executa QA backend isolado, SELECT/EXPLAIN MySQL e inspecao Redis/RP/origens,
  depois restart somente backend-dev, verificacao novamente e health8001 com
  retries. Nunca aplica migration ou muda .env/flags/sessao. Pendencia de schema
  interrompe para investigacao, nao habilita ALLOW_SCHEMA_MIGRATIONS.
- SQLite local exige Node compativel (QA local usa24); o roteiro EC2 usa MySQL
  real e nao exige trocar Node/instalar runtime para executar SQLite.
- Se interromper antes do restart, codigo pode ter sido atualizado no disco;
  nao presumir deploy concluido. Registrar etapa/erro, sem expor .env/pm2jlist.
  Reexecutar o mesmo SHA e seguro apos resolver a causa. Nao resetar checkout.
- Frontend DEV: aguardar build da refactor/frontend no Vercel e recarregar PWA.
  Nao informar frontend atualizado apenas porque backend health deu200.

## Homologacao humana exclusiva DEV

1. Mesmo usuario autorizado, filtros limpos e sem datas: comparar Na fila do
   PWA com Pendentes financeiro, contando titulos unicos. Incluir digital e
   direto; conferir autor/data do envio. Divergentes tem filtro separado.
2. Selecionar Emissao/Vencimento/Pagamento e periodo conhecido. Fim primeiro
   nao gera intervalo invalido; duas datas validas autoaplicam; apagar ambas
   volta a Todo periodo. Datas de quatro digitos, edicao por segmentos, filtros
   e cursor Anterior/Proxima sem decidir. Voltar nativo: detalhe/lista/obras.
3. Em Pagamento, preferir Todas as situacoes para ver todas as baixas (estado
   e o ATUAL, nao historico). Duas baixas30/70 em dias diferentes devem mostrar
   somente30/70 em cada periodo, nao100 a cada dia. Estorno nao entra no pago.
   Obras rateadas e titulos compartilhados nao podem duplicar o total.
4. Como autorizador nominal real com passkey (nao Testar usuario), abrir titulo
   direto com saldo, rejeitar, informar motivo, conferir e cancelar biometria.
   Nada deve ser decidido; repetir e confirmar. Repetir clique nao duplica.
   Em parcial, pago anterior permanece e somente saldo fica bloqueado.
5. Tentar baixar/enviar diretamente titulo rejeitado: deve negar. Preparar
   NOVO ciclo digital ainda nao libera; autorizacao real por passkey libera
   somente apos nova conferiencia. Preparador nao aprova o proprio lote.
   Quitados/banco ativo/revisao DP/versao alterada nao devem permitir rejeicao.
6. Com Luana/DP e usuario da Obra: pedir admissao com inicio efetivo e sem
   admissao formal; diaria preenchida deve ser aceita. Aprovar sem inventar
   admissao. No detalhe do pedido, selecionar tipo de documento ativo, anexar
   arquivo de teste e conferir classificacao. Inicio efetivo nao recalcula folha.

## Evidencias locais / entrega

- Backend: suites periodo/fila direta, rejeicao/reauthorizacao, RH/documentos,
  fila/banco/permissoes/OFX/performance e novo test:deploy-pwa-periodo-dev com
  todas as E/S simuladas. Negativas de producao antes de acessar Redis/SQL.
- Front: suites PWA por obra e RH/documentos; build619modulos. Screenshots mobile/
  desktop e revisao do diff. Sem migration nova, sem operacao real em ambiente.
- bash -n no roteiro e git diff --check. Avisos Browserslist/chunk preexistentes
  nao foram tratados; nenhum npm audit fix automatico.
- Hash e confirmacao de push na resposta final; conferir ls-remote apos enviar.
  Homologacao real MySQL/Redis/passkey continua responsabilidade do operador.
