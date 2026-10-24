# Publicacao da consulta manual NSDOCS v2 no DEV

Pacote exclusivo para comandos administrativos do backend DEV. Sem restart,
install, migration, alteracao de .env/PM2/Node/dumps ou chamadas NSDOCS pelo deploy.
A chave sera informada separadamente pelo usuario no prompt oculto.

## Atualizar arquivos e testar

Na sessao SSH Ubuntu como `ubuntu`, substituir `SHA_PUBLICADO` pelo SHA completo
fornecido no chat. Nao executar um git pull generico antes do operador.

```bash
(
  set -euo pipefail
  trap 'echo "Interrompido. Envie a saida sem segredos; nao contorne protecoes." >&2' ERR
  cd /home/ubuntu/sistema-gestao-solicitacoes-dev
  test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev
  test "$(git rev-parse --show-toplevel)" = /home/ubuntu/sistema-gestao-solicitacoes-dev
  test "$(git branch --show-current)" = refactor/frontend
  test -z "$(git status --porcelain --untracked-files=no)"

  git fetch origin refactor/frontend
  VERSAO_NSDOCS_MANUAL=SHA_PUBLICADO
  git merge-base --is-ancestor "$VERSAO_NSDOCS_MANUAL" origin/refactor/frontend
  git show "$VERSAO_NSDOCS_MANUAL:ops/deploy/atualizar-dev-nsdocs-manual-20261024.cjs" |
    /home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node - "$VERSAO_NSDOCS_MANUAL"
)
```

Exige HEAD no f2167ff72d803fc987d617543c0dfcd31527cc09 ou no alvo, inventario
exato deste pacote e package sem dependencias alteradas. Etapa anterior pendente
interrompe antes do fast-forward. Confere tres processos/Nodes isolados/daemon
existentes, hashes de .env/dumps/runtimes/unidade e flags NSDOCS desligadas.
Antes da atualizacao confere TLS/configuracao/UUID do MySQL DEV em transacao
READ ONLY. Nenhuma migration e aplicada. Apos fast-forward roda QA e lista ate100
empresas ativas locais, novamente com transacao READ ONLY e rollback.

Esperado: `NSDOCS_MANUAL_DEV_PUBLICADO_SEM_REINICIOS`, conector automatico false,
chamadas_nsdocs0 e todos os processos/Nodes/ambientes/daemon/dumps preservados.
Em seguida aparece a lista local para escolher o ID cujo CNPJ corresponde a
empresa da chave NSDOCS. O deploy nao pede, le nem salva a chave.

QA ou preflight reprovado apos o fast-forward deixa arquivos no alvo e os
processos continuam sem restart. Nao executar operador antigo/force/reset para
contornar. Enviar apenas a saida sanitizada e conferir a causa.

## Configurar chave em entrada oculta

Executar **apos o deploy acima concluir**, em terminal SSH interativo (nao via
redirecionamento/pipe). O CNPJ abaixo e o da CONSTRUTORA SUL CAPIXABA LTDA
apresentada pelo usuario; conferir com a empresa selecionada na NSDOCS e DEV.

```bash
(
  set -euo pipefail
  cd /home/ubuntu/sistema-gestao-solicitacoes-dev/backend
  test "$(git rev-parse HEAD)" = SHA_PUBLICADO
  test -t 0
  test -t 1
  read -r -p 'ID da empresa no DEV com CNPJ 27.123.008/0001-00: ' EMPRESA_NSDOCS_DEV

  /home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node \
    scripts/nsdocsDevManual.js --configurar \
    --empresa-id "$EMPRESA_NSDOCS_DEV" --cnpj 27123008000100

  /home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node \
    scripts/nsdocsDevManual.js --conferir \
    --empresa-id "$EMPRESA_NSDOCS_DEV" --cnpj 27123008000100
)
```

O primeiro prompt pede apenas o ID, que nao e segredo. **Aguardar** o programa
mostrar `Cole a chave NSDOCS DEV (entrada oculta)` antes de colar a chave.
Nesse prompt colar somente o valor da chave, sem `Bearer `, e pressionar Enter.
Nao enviar chave, screenshot, arquivo ou cat ao chat. Nao usar export, argumentos
de chave, VITE_, .env, variaveis PM2 ou historico de comandos para guarda-la.

O configurador valida banco DEV/empresa antes de pedir a chave; grava arquivo
600 em diretorio700 fora do checkout/PM2 e nao sobrescreve credencial existente.
O modo conferir valida armazenamento/permissoes/empresa, sem chamada NSDOCS.
Ambos devem informar external_calls0 e application_connector_enabled false.

Se aparecer NSDOCS_CREDENCIAL_JA_EXISTE, nao apagar/sobrescrever o arquivo para
continuar. Conferir a instalacao existente antes de preparar eventual rotacao.

## Primeira consulta real (etapa separada da instalacao)

Configurar/conferir nao comprova autenticacao no provedor. A consulta real e
manual e explicita; nao e disparada pelos blocos acima. Usar o mesmo ID conferido,
um periodo curto e status obrigatorio conforme o [guia de consulta](../../docs/modulos/fiscal/NSDOCS_V2_CONSULTA_MANUAL_DEV.md).
Cada execucao faz um GET limitado, sem retry, XML/PDF, PUT/POST externo ou gravacao
fiscal/financeira. A API pode ter limites/consumo de plano. Lista vazia nao
comprova a empresa e nao habilita o conector automatico.

## Testes locais da publicacao

35 testes:18 manuais,11 da base e6 deste operador com fronteiras ficticias.
Regressao de permissoes financeiras e sintaxe tambem conferidas. Testes do operador
simulam Git/SO/PM2/DB/HTTP; nao atualizam uma EC2 real. Nenhuma execucao remota
foi realizada pelo agente. Usuario executara o roteiro e enviara a saida sem chave.
