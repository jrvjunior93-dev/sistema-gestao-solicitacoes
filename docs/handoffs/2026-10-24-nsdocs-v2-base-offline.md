# Handoff - base NSDOCS API v2 offline

## Pedido e contexto

Usuario autorizou implementar/testar a base na `refactor/frontend`, desligada por
padrao, somente dados ficticios, preservando permissoes/historico, sem chamadas
reais, novos bloqueios ou producao. Chave criada pelo usuario na NSDOCS v2;
nenhum valor de chave foi recebido, lido, armazenado ou utilizado.

Checkout: `C:/Fluxy-refactor-frontend`, branch `refactor/frontend`, base
`db1d2253c7ee12cb6e13cf6e61ad7a40a8154987`. Agente unico. Deltas de auditorias,
outputs e documentos de workspace preexistentes foram preservados.

## Arquivos desta tarefa

- `backend/src/modules/fiscal/services/nsdocs/config.js`: configuracao offline,
  defaults seguros, fixtures apenas em development, diagnostico sem segredos.
- `backend/src/modules/fiscal/services/nsdocs/contract.js`: descritor GET puro,
  filtros/empresa/status explicitos e limites de paginacao v2.
- `backend/src/modules/fiscal/services/nsdocs/normalize.js`: gzip/deflate limitado,
  JSON/UTF-8, metadados NF-e, centavos inteiros, conflitos e particionamento.
- `backend/src/modules/fiscal/services/nsdocs/fixtures/documents.js`: duas notas
  sinteticas de materiais/equipamentos, sem identidade real.
- `backend/src/modules/fiscal/services/nsdocs/connector.js`: leitura offline sem
  transporte de rede, snapshots de configuracao e nenhuma persistencia.
- `backend/src/modules/fiscal/controllers/FiscalNsdocsController.js` e registro em
  `backend/src/modules/fiscal/routes/index.js`: GET de diagnostico protegido pelo
  mesmo `allowFiscalConfig` ja existente, resposta no-store.
- `backend/scripts/validarNsdocsV2.js`, `backend/package.json`: teste offline.
- `backend/.env.example`: flags desativadas; nao editar `.env` real.
- `docs/modulos/fiscal/NSDOCS_API_V2_BASE.md` e README fiscal: limites e evolucao.
- Este handoff e secao propria no ownership. Ownership contem deltas anteriores;
  nao incluir o arquivo inteiro automaticamente em futuro commit desta tarefa.

## Validacao executada

- `node backend/scripts/validarNsdocsV2.js`: **11 testes aprovados**. Defaults;
  tentativa de modo real/producao; segredo sentinela nunca lido/devolvido;
  descritor somente GET; empresa/filtros/status; valores e datas; compactacao
  limitada; pagina/inconsistencias/teto 2000; repeticoes/conflitos; fontes imutaveis;
  rota e autorizacao/middleware reais em VM com fronteiras de modelos/auditoria
  ficticias. 401/403, permissao fiscal exata e bypass administrativo preservados.
- Rede/subprocessos interceptados no teste e grafo de dependencias do conector
  restrito a modulos locais puros, zlib e util: **zero chamadas externas**.
- `node backend/scripts/validarFilaEstornoPermissao.js`: regressao isolada de
  permissoes financeiras aprovada, sem banco/rede.
- `node --check`: todos os novos JS aprovados.
- `git diff --check` nos arquivos tracked exclusivos desta entrega: aprovado.

Nao executado app/server, dotenv, banco real, S3, sync SEFAZ, API NSDOCS, migration,
instalacao, agenda, build/publicacao Vercel, EC2/PM2, commit ou push.

## Limites e proximo passo

Esta e uma base de contrato/metadados ficticios, nao uma importacao operacional.
Nao adiciona tela, associa pedido/titulo, baixa arquivo XML/PDF, importa documento,
altera status utilizado do provedor ou exige nota para autorizacao financeira.
NFS-e/CT-e sao separados como modelos ainda nao implementados. Metadados nunca
sao certificados como nota fiscal valida (`unverified_metadata`).

Duplicidade e verificada dentro de uma pagina ficticia; persistencia real futura
precisa transacao/unicidade/reconciliacao de fontes/paginas e trilha de eventos.
Contagens/ordenacao do provedor nao garantem snapshot; teto 2000 exige particionar
janela. Sem transporte HTTP nao se homologou autenticacao, limites de consumo,
respostas reais, XML, eventos ou escopo efetivo da chave criada no painel.

Proximo passo exato: revisar o delta desta tarefa e, se solicitado pelo usuario,
commitar/publicar somente na refactor/frontend para homologacao offline do DEV.
Etapa de GET real requer autorizacao separada, segredo exclusivo de backend e
identidade/escopo das empresas confirmados; nao ativar usando apenas estas flags.

Reserva de arquivos encerrada; implementacao e testes concluidos, delta local
mantido sem commit/push. Nao promover main ou produzir comandos de deploy nesta
tarefa.
