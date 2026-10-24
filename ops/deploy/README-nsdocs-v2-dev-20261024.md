# Publicar base NSDOCS v2 offline no DEV

Escopo: somente backend DEV, sem migration, instalacao de dependencias, chave
real, chamadas NSDOCS ou ativacao de conector/fixtures no processo servido.
Os testes criam configuracao/dados ficticios apenas em memoria de processos
isolados. Nao modificam `.env` nem ambiente/dumps do PM2.

## Na EC2 como ubuntu

Substituir `SHA_COMPLETO_PUBLICADO` pelo SHA da publicacao fornecido no chat.
O bloco e Bash para a sessao SSH Ubuntu, nao CMD/PowerShell do Windows.

```bash
(
  set -euo pipefail
  trap 'echo "Interrompido. Nao contorne protecoes; envie a saida sem segredos." >&2' ERR
  cd /home/ubuntu/sistema-gestao-solicitacoes-dev
  test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev
  test "$(git rev-parse --show-toplevel)" = /home/ubuntu/sistema-gestao-solicitacoes-dev
  test "$(git branch --show-current)" = refactor/frontend
  test -z "$(git status --porcelain --untracked-files=no)"

  git fetch origin refactor/frontend
  VERSAO_NSDOCS=SHA_COMPLETO_PUBLICADO
  git merge-base --is-ancestor "$VERSAO_NSDOCS" origin/refactor/frontend

  git show "$VERSAO_NSDOCS:ops/deploy/atualizar-dev-nsdocs-v2-20261024.cjs" |
    /home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node - "$VERSAO_NSDOCS"
)
```

Nao executar um `git pull` generico antes do operador. Ele verifica o inventario
inteiro entre a base DEV `59891d254edb8fac0a5b6cc22a6d5ef58c9441a7` e o alvo, aceita
somente esse pacote e faz o fast-forward. Se o HEAD ainda estiver em etapa anterior,
interrompe sem incorporar outros pacotes, aplicar migration ou reiniciar.

Conferencias anteriores ao fast-forward: processo DEV unico/online/fork/sem watch,
Node24.22.1 isolado correto, daemon Node24.22.1 previamente homologado, flags NSDOCS
ausentes ou `false`, ambiente DEV/porta8001/host staging/UUID do banco correto,
schema em dia via leitura, health local PROD e DEV. Um banco real e consultado
apenas para identidade/schema; nao e utilizado pelo QA ficticio.

Conferencias anteriores ao restart: QA offline, configuracao efetiva ja com
conector desligado, politica do DEV preservada e fingerprints dos peers,
arquivos de ambiente, dumps, runtimes/Node global e unidade PM2 inalterados.

Restart somente do ID que pertencia a `backend-dev`, com a CLI PM2 existente
executada pelo Node isolado do daemon. Sem `--update-env`, save/update/resurrect,
troca de interpretador, npm, migration ou reinicio dos outros processos.

Resultado esperado: `NSDOCS_V2_DEV_OFFLINE_PRONTO`, `conector_desligado:true`,
`fixtures_somente_no_qa:true` e preservacao de producao/Experience/daemon/dumps.
Se qualquer guarda reprovar, parar e enviar somente a saida sanitizada. Uma falha
de QA apos o fast-forward deixa o codigo atualizado no disco, mas sem restart;
uma falha apos o restart nao executa rollback nem reinicia outros servicos.

## Repetir somente os testes ficticios

Depois da atualizacao bem-sucedida:

```bash
(
  set -euo pipefail
  cd /home/ubuntu/sistema-gestao-solicitacoes-dev/backend
  test "$(git branch --show-current)" = refactor/frontend
  /home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node scripts/validarNsdocsV2.js
  /home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node --test \
    ../ops/deploy/atualizar-dev-nsdocs-v2-20261024.test.cjs
)
```

Esperado: 11 testes do conector e 7 do operador aprovados. Os 7 testes do operador
simulam SO, Git, PM2, schema e health em memoria: nao executam o deploy novamente.
Nao habilitar Fiscal/NSDOCS apenas para ver o diagnostico na UI. Nao ha tela nova
nesta etapa; a rota de diagnostico mantem os gates/permissoes fiscais existentes.

## Limites

- Nenhum teste fiscal real, documento persistido ou vinculo com pedido/titulo.
- Nenhuma garantia sobre resposta/limite/escopo real da chave NSDOCS nesta etapa.
- Nenhuma alteracao de producao/main ou publicacao de frontend neste pacote.
- Operador testado localmente com fronteiras ficticias. Execucao/health reais e
  homologacao DEV serao conferidos pelo usuario na EC2.
