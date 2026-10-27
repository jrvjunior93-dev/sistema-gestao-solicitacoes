# Publicacao da base NSDOCS API v2 - DEV

## Autorizacao e separacao

Usuario autorizou commit/push da base na `refactor/frontend` e codigos para
atualizar/testar EC2 DEV com fixtures, conector servido desligado e producao
intacta. Nenhum acesso remoto/deploy foi executado pelo agente.

O checkout original `C:/Fluxy-refactor-frontend` estava na base db1d2253, atras da
remota em 30 commits, com auditorias e controles de workspace pendentes. Seu delta
foi preservado. Para publicar, foi reutilizado o worktree anexo
`C:/Users/Ricardo/.codex/worktrees/promocao-financeiro-20261019/Fluxy`, ja na base
remota `59891d254edb8fac0a5b6cc22a6d5ef58c9441a7`. Somente arquivos NSDOCS foram
copiados; o package.json recebeu dois scripts sem perder scripts remotos atuais.
Publicacao direcionada explicitamente para `HEAD:refs/heads/refactor/frontend`.

Os controles de workspace deste worktree tambem contem registros locais de Node
e nao foram incluidos em bloco. Ownership especifico registrado antes da copia.
Nao incluir arquivos Node nao rastreados, outputs ou auditorias no commit.

## Delta

Base funcional/documentacao: arquivos listados no handoff
`2026-10-24-nsdocs-v2-base-offline.md`. Nenhuma mudanca funcional adicional.

Publicacao adiciona:
- `ops/deploy/atualizar-dev-nsdocs-v2-20261024.cjs`;
- `ops/deploy/atualizar-dev-nsdocs-v2-20261024.test.cjs`;
- `ops/deploy/README-nsdocs-v2-dev-20261024.md`;
- este handoff e script `test:deploy-nsdocs-dev` no backend/package.json.

## QA

- Conector: 11 testes offline aprovados, com ACL real isolada, dados sinteticos,
  segredo sentinela nao lido, rede bloqueada, compactacao/valores/datas/duplicatas.
- Operador: 7 testes aprovados, incluindo orquestracao real em VM com fronteiras
  de OS/Git/PM2/DB/HTTP simuladas. Somente restart do ID DEV; interrupcoes antes de
  merge/restart para HEAD/config/schema reprovados; QA falho nao reinicia;
  alteracao de peer detectada. Flags, pacote/inventario e Node fixos verificados.
- Regressao isolada `validarFilaEstornoPermissao.js`, sintaxe JS, inventario do
  commit e `git diff --check` conferidos antes da publicacao.

Nao foi instalada dependencia nem executado backend/server, chave, NSDOCS,
S3, banco real, migration, EC2, PM2 ou publicacao main/producao pelo agente.

## EC2 e proximo passo

Usar o SHA completo publicado e o bloco do README. O operador valida estado DEV
antes de fast-forward, executa QA e reinicia apenas backend-dev preservando seu
Node24.22.1, ambiente e flags; compara peers/daemon/dumps antes/depois. Consultas
MySQL sao somente leitura para identidade e schema pendente; migration pendente
interrompe. Nao habilita o conector, nao adiciona chave e nao grava fixtures.

Usuario executara o bloco na EC2 e enviara resultado. Nao promover main nem
preparar transporte NSDOCS real sem nova tarefa autorizada. O conector permanece
sem HTTP e sem persistencia; ainda nao existe tela de documentos capturados.
