# NF-e nos pagamentos e Localizar pedidos — publicacao DEV em etapas

Base100620bfadea0a1d67e8e38c7b51783276576731. Sem migration/dependencia nova.
Aceita tambem o ultimo checkout backend96a8daab459a9c1d7458865334814bf5343b68d9,
conferindo que96a8daab..100620bf nao altera backend/pacotes raiz/locks.
Somente refactor/frontend; main, producao e Experience fora da atualizacao.
O operador reinicia somente backend-dev, preservando Node24.22.1 isolado,
ambiente, daemon, unit systemd e dumps PM2. Nao executa npm install, DDL,
--update-env ou PM2 save/update/resurrect. NSDOCS automatico permanece OFF.

## Ordem obrigatoria

1. Publicar commit backend (frontend inalterado). O catalogo de navegacao do
   backend ja contempla a nova rota; a tela/frontend antigo continua servindo.
2. Usuario executa etapa backend abaixo e envia a saida de conferencia.
3. So depois publicar o segundo commit frontend, ja autorizado/preparado. Push
   pode disparar Vercel; nao antecipar. Nao usar `git pull` sem SHA fixo na EC2.

O agente nao executa operacoes EC2 ao publicar esses commits.

## EC2 DEV — terminal Ubuntu

Substituir COLE_SHA_BACKEND pelo SHA completo informado na publicacao:

```bash
(
  set -euo pipefail
  trap 'echo "Interrompido. Envie a saida sem segredos; nao contorne protecoes nem publique o frontend." >&2' ERR
  cd /home/ubuntu/sistema-gestao-solicitacoes-dev
  test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev
  test "$(git rev-parse --show-toplevel)" = /home/ubuntu/sistema-gestao-solicitacoes-dev
  test "$(git branch --show-current)" = refactor/frontend
  test -z "$(git status --porcelain --untracked-files=no)"
  VERSAO_BACKEND=COLE_SHA_BACKEND
  NODE_DEV=/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node
  git fetch origin refactor/frontend
  git show "$VERSAO_BACKEND:ops/deploy/atualizar-dev-nfe-pagamentos-pedidos-20261024.cjs" |
    "$NODE_DEV" - --backend "$VERSAO_BACKEND"
)
```

O operador valida a base/commit e manifesto exatos, ausencia de mudancas
frontend/lockfiles/migrations, dependencias preservadas, identidades de tres
processos e Nodes, ambientes/.env, daemon/systemd/dumps. QA roda com rede
bloqueada e fixtures locais. Schema existente e conferido em leitura TLS/UUID
no RDS staging; nao aplica migrations. Storage fiscal deve estar alinhado a
fluxy-fiscal-dev/us-east-2/prefixo dev; nao altera configuracao ou IAM/S3.

Estado/retomada: /home/ubuntu/.config/fluxy-nfe-pagamentos-pedidos-dev/backend.json
modo600/diretorio700, apenas hashes/metadados, sem segredos. Se o restart foi
emitido e a confirmacao interrompida, retomar confere o resultado sem emitir
novo restart. Erro exige enviar saida segura; nao remover lock/estado manualmente.

Saida esperada **NFE_PEDIDOS_BACKEND_DEV_PRONTO**, sem_migration=true,
producao_experience_daemon_dumps_e_ambientes_preservados=true,
frontend_novo_publicado=false. Enviar a saida antes da segunda etapa.

Conferencia posterior no checkout backend, sem restart:

```bash
(
  set -euo pipefail
  cd /home/ubuntu/sistema-gestao-solicitacoes-dev
  /home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node \
    ops/deploy/atualizar-dev-nfe-pagamentos-pedidos-20261024.cjs \
    --conferir COLE_SHA_BACKEND
)
```

## Depois da liberacao frontend

Recarregar DEV/PWA; conferir `window.__FLUXY_BUILD__` no SHA frontend informado.
Nao e preciso reiniciar o backend para esta etapa de frontend.

- Autorizacoes de Pagamento: obra EDIFICIO ITALIA, SOL-35/LOTE-10/TIT-003834.
  Consultar NF-e vinculadas; numero38539/doc556. DANFE somente se ja existir;
  XML deve baixar. Fechar preview retorna ao titulo, sem autorizar/enfileirar.
  Material assinado, valores/saldos e documentos antigos ficam preservados.
- Por lote/historico tambem oferece a consulta. Ela mostra vinculos atuais,
  separados dos documentos assinados: nao atesta aprovacao da nota nesse envio.
- Fila: usar solicitacao de um titulo que ja esteja na fila e com NF-e
  vinculada. Abrir pasta Arquivos: boletos + DANFE/XML, sem comprovantes comuns.
  Nao criar baixa ou movimentacao para testar apenas a leitura.
- Compras > Relatorios > Localizar pedidos: SOL-35, PC-00026/27, Pedreira,
  Areia/Brita, valores600/566,44; combinar filtros, abrir pedido/solicitacao,
  pagina/total e CSV da pagina. Pedido repetido por varios itens nao multiplica
  contagem ou valores. Itens removidos nao entram na busca.
- Perfil autorizado com escopo restrito e perfil sem permissao nao consultam
  NF-e/pedidos fora do acesso. Permissoes fiscais globais nao sao concedidas.
- Confirmar automatico NSDOCS OFF; nenhuma chamada NSDOCS/geracao DANFE prevista.

Retorno: preservar frontend anterior se backend nao concluir. Nao executar
reset/force/down nem apagar XML/historico. Se necessaria reversao de codigo,
preparar commit revisado exclusivo DEV. Nenhum comando de retorno em producao.
