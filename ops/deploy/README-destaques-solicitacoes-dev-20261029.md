# Destaques de solicitacoes — atualizacao exclusiva DEV

Base revisada: refactor/frontend720d4acd. Sem promocao para main. O operador
nao faz merge/pull/reset/clean do checkout DEV, que recebeu atualizacoes por
arquivos isolados. Instala somente dois arquivos de runtime: controller de
solicitacoes (resumo/ordenacao) e service puro de fila operacional.

Inclui testes e manifesto fechado com hashes Git. Arquivos locais precisam
coincidir com a base revisada ou o alvo; qualquer conteudo divergente bloqueia.
Demais arquivos locais, HEAD/index, ambientes, Nodes, heap PROD4096/DEV,
PROD/Experience, daemon PM2, dumps e systemd sao conferidos e preservados.
Nao imprime nem persiste acessos. Backup privado de codigo em
`/home/ubuntu/.config/fluxy-destaques-solicitacoes-dev-20261029`.

Antes do unico restart de backend-dev, executa QA offline de fila (SQLite
em memoria), interacoes, retorno e aplicador. Sem conexao ao banco real,
migration/DDL/SQL de negocio, npm install, PM2 save/update/resurrect/update-env.
`--conferir` verifica resultado sem reinstalar ou repetir restart. Se perder
a resposta durante o restart, conferir o estado; nao remover locks para forcar.

Ja conectado a EC2, no checkout DEV, confirme backup recente. Usar o hash
completo publicado informado pelo chat, sem substituir por origin/HEAD:

```bash
git fetch origin refactor/frontend
git show "$FLUXY_ALVO:ops/deploy/atualizar-dev-destaques-solicitacoes-20261029.cjs" |
  CONFIRM_DEV_BACKUP=SIM CONFIRM_DESTAQUES_SOLICITACOES_DEV=SIM \
  /home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node \
  - --backend "$FLUXY_ALVO"

/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node \
  ops/deploy/atualizar-dev-destaques-solicitacoes-20261029.cjs \
  --conferir "$FLUXY_ALVO"
```

Esperado: DESTAQUES_SOLICITACOES_BACKEND_DEV_PRONTO, runtime_files2, migrations0,
business_data_writes0 e processos/ambientes preservados. Frontend segue o
pipeline Vercel da branch; depois do backend pronto e do build correspondente,
recarregar a tela DEV e validar com GEO: retorno amarelo antes de mensagem,
leitura remove apenas azul, decidir/cancelar encerra atividade. Sem SLA definido
para retorno, sem atraso ficticio. Nenhum endpoint de decisao foi alterado.

O agente apenas preparou/testou/publicou codigo e nao acessou a EC2.
