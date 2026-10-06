# Remocao de anexos do historico de solicitacoes

## Escopo concluido

Correcao local em `C:/Fluxy-refactor-frontend`, branch `refactor/frontend`.
A exclusao logica e sua auditoria sao gravadas juntas. O historico preserva
a linha original e o evento de remocao, sem oferecer Visualizar, Download ou
Remover para o documento excluido. A atualizacao local nao depende do reload.

## Arquivos

- `backend/src/controllers/AnexoController.js`: transacao, bloqueio de linhas,
  repeticao idempotente, marcador de remocao e validacao antes do presign.
- `backend/src/services/anexoHistoricoService.js`: identificacao da remocao
  por marcador, deleted_at ou auditoria antiga, com escopo da solicitacao e
  compatibilidade de caminhos no legado. Reenvio nao herda outro ID removido.
- `backend/src/services/fileAccessService.js`: o resolvedor por URL/chave e
  a autorizacao de arquivos do historico rejeitam anexos removidos.
- `backend/src/middlewares/bloquearAnexoLocalRemovido.js` e `backend/src/app.js`:
  verificacao antes de servir arquivos legados em `/uploads`, inclusive nomes
  codificados e caminhos normalizados. Arquivos ativos preservam a politica
  anterior; falha de consulta retorna 503, sem servir arquivo nao verificado.
- `frontend/src/pages/SolicitacaoDetalhe/Timeline.jsx` e `anexosHistorico.js`:
  reconhecem auditorias antigas e metadata nova, preservam os eventos,
  bloqueiam repeticao durante confirmacao/envio e tratam cancelamento e erro.
- `backend/scripts/validarRemocaoAnexosHistorico.js`,
  `frontend/scripts/validarRemocaoAnexosHistorico.mjs` e package.json dos
  runtimes: testes locais `npm run test:anexos-remocao`.
- `docs/seguranca/anexos.md`, README de Solicitacoes e ownership: regras e limites.

## Validacoes

Passaram os testes focados backend/frontend, a sintaxe Node dos arquivos
backend, `npm run build` do frontend e `git diff --check`. Fixtures em memoria
cobrem controller e servicos reais, transacao com rollback simulado,
repeticoes simultaneas, presign por historico e URL/chave, remocoes legadas,
escopo, permissoes e comprovantes nao removiveis por este endpoint. Um servidor
HTTP Express local prova o bloqueio de `/uploads` e a preservacao dos ativos.
A fixture React usa Timeline e componentes reais, com requisicoes externas
bloqueadas, cancelamento, erro/retry, processamento, atualizacao sem reload,
auditoria preservada e usuario sem permissao de excluir.

`npm run test:docs` continua falhando pela divergencia preexistente em
AGENTS.md e docs/seguranca/autenticacao_autorizacao.md: registro atual com
19 grupos, 110 areas e 391 permissoes. Nao alterar essas metricas nesta tarefa.
O build mantem avisos preexistentes de Browserslist e tamanho de bundle.

## Limites e proxima etapa

Sem conexao a banco/S3 reais, migration ou alteracao de ambiente.
Os testes transacionais usam mocks e nao substituem homologacao
com MySQL isolado. Nao ha exclusao fisica do arquivo, nem revogacao de URLs
S3 ja emitidas, que podem durar ate a expiracao de 300 segundos no historico.
A politica geral de autorizacao de uploads legados nao foi redesenhada.

Usuario autorizou em 06/10/2026 commit/push na refactor/frontend e promocao
por fast-forward para main, junto da correcao de dados de empresa em fornecedores.
Preservar auditorias locais e os registros preexistentes no ownership fora
do commit. Publicacao Git nao confirma deploy Vercel ou atualizacao da EC2.
Atualizar frontend e backend juntos, sem migration ou chave nova. Homologar a remocao de um
anexo de teste, recarregar o detalhe e confirmar o bloqueio dos links novos,
da URL legada removida e a continuidade de acesso aos documentos ativos.
