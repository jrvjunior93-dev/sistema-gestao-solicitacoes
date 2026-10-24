# Vínculos NF-e/pedidos/títulos: liberação DEV em duas etapas

Base DEV:2830ccb5af35669965ac2f21ca70e9bd37d1fc17. Usar o SHA **backend**
informado na resposta da publicação; ele não inclui alterações de frontend.

1. Commit backend/migration/QA/operador publicado na refactor/frontend.
2. Usuário executa a etapa abaixo na EC2 e envia o resultado.
3. Após comprovar schema/backend DEV, publicar o segundo commit de frontend já
   preparado localmente. O push costuma disparar a Vercel; não antecipar essa etapa.

Nenhum acesso EC2/migration/restart é feito pelo agente ao preparar/publicar os
commits. Main/produção ficam fora desta operação. Não usar operadores anteriores,
pois seus manifestos não incluem este pacote.

## Etapa backend: terminal Ubuntu da EC2

Conferir um backup recente do banco DEV antes de informar as duas confirmações.
O operador aplica apenas202610240002_fiscal_vinculos_pedidos.js e reinicia somente
backend-dev. Não reinstala dependências nem altera env, interpretadores, dumps,
daemon, Experience ou produção. A CA/UUID do RDS staging é conferida antes de DDL.

Substituir COLE_SHA_BACKEND pelo SHA completo da etapa backend:

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
  git show "$VERSAO_BACKEND:ops/deploy/atualizar-dev-fiscal-vinculos-20261024.cjs" |
    CONFIRM_DEV_BACKUP=SIM CONFIRM_FISCAL_VINCULOS_DEV_SCHEMA=SIM \
      "$NODE_DEV" - --backend "$VERSAO_BACKEND"
)
```

O script é lido do commit fixo por stdin, sem copiar arquivos privados. Guarda
somente hashes/metadados de conferência em arquivo600 no diretório700
/home/ubuntu/.config/fluxy-fiscal-vinculos-dev. Remove IPC herdado nos subprocessos
administrativos; a chamada PM2 usa ambiente limpo e sem --update-env.

Compara três processos online/Nodes isolados, ambientes e hashes.env, daemon,
systemd e os dois dumps. O único restart permitido é backend-dev. A aplicação
deve permanecer com NSDOCS automático OFF e ALLOW_SCHEMA_MIGRATIONS desligado.

Saída esperada: **FISCAL_VINCULOS_BACKEND_DEV_PRONTO**, SHA backend correto,
producao_experience_daemon_e_dumps_preservados=true e frontend_novo_publicado=false.
Enviar esse resultado antes da liberação do frontend. O frontend antigo continua
servindo enquanto isso; ainda não é possível testar os controles novos na tela.

Se houver erro, não repetir restart manual nem remover estado/lock. Enviar a
saída segura. DDL MySQL não é transação única: uma interrupção pode deixar coluna
adicionada; up é idempotente e ledger só é registrado após verificar estrutura.

Conferência posterior, sem restart ou escrita no banco, no checkout backend:

```bash
(
  set -euo pipefail
  cd /home/ubuntu/sistema-gestao-solicitacoes-dev
  /home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node \
    ops/deploy/atualizar-dev-fiscal-vinculos-20261024.cjs --conferir COLE_SHA_BACKEND
)
```

## Testes após a segunda etapa (frontend)

Somente depois da liberação do segundo commit na refactor/frontend, atualizar o
DEV com Ctrl+Shift+R e conferir window.__FLUXY_BUILD__ no commit de frontend.

- Uma NF-e associada a dois pedidos da mesma solicitação e a um de outra, todos
  no escopo autorizado e da empresa destinatária correta. Conferir valores por
  pedido e parcelas; a soma fiscal não multiplica por número de parcelas.
- NF-e nos pedidos, no detalhe fiscal e nos títulos; XML continua privado e
  acessível pela URL assinada. Nota sem associação a uma parcela aparece como
  referência do pedido, inclusive em título criado depois.
- Título com baixa parcial conserva valor pago/saldo/movimentos e fila intactos.
  Frete a terceiro não herda automaticamente a NF-e de mercadorias.
- Compras: no pedido aberto, fechar com fornecedor e preparar títulos; cancelar
  a confirmação não altera o status. Depois criar títulos do próprio pedido.
  Criar os títulos de outro pedido da mesma solicitação continua permitido;
  permanece a proteção contra recriar obrigação ativa do mesmo pedido.
- Ler sem permissão de vínculo não permite salvar. Testar duplo clique/retry e
  encerramento com motivo, mantendo histórico e autor anterior.

Usar massa controlada DEV; esta preparação não executa geração/baixa real. Não
marcar uma NF-e como fiscalmente validada só por estar vinculada.

## Retorno

Não executar down nem apagar índices/colunas/histórico/XML. Preservar os Nodes e
dumps. Se houver problema, manter frontend anterior e preparar reversão revisada
do código DEV, sem reset/force. O esquema aditivo pode permanecer para preservar
evidências. Não efetuar comandos de retorno em produção.
