# Seguranca - Anexos

Regras:
- validacao de extensao e MIME
- limite de tamanho configuravel
- armazenamento privado (S3) com URL assinada
- download sempre exige autorizacao

Observacao:
- anexos antigos podem estar em `/uploads`

## Remocao de anexos de solicitacoes

A remocao do historico exige a permissao existente, acesso a solicitacao e
autorizacao para interagir no setor atual. Anexo e auditoria sao gravados na
mesma transacao, com bloqueio das linhas; repeticoes nao criam outro evento.
O registro original permanece, identificado como removido, sem botoes de arquivo.

O endpoint `/anexos/presign` rejeita novos links para anexos removidos, tanto por
`historico_id` quanto pela resolucao de URL/chave. Sao reconhecidos os marcadores
novos, `anexos.deleted_at` e os eventos antigos `ANEXO_REMOVIDO`, inclusive o
legado sem ID de anexo. IDs sao conferidos na mesma solicitacao. Um novo upload
nao herda a remocao de outro ID; no legado por caminho, a data do evento delimita
o ciclo removido.

Nao ha exclusao fisica do objeto S3 nesta operacao. URLs S3 previamente assinadas
podem continuar validas ate sua expiracao (o presign do historico usa 300 segundos).
A rota estatica legada `/uploads` verifica a exclusao logica antes de servir
anexos de solicitacoes. Documentos removidos retornam 404; arquivos ativos ou
nao relacionados ao historico preservam a politica anterior. Erro de consulta
retorna 503 em vez de servir um arquivo sem verificar sua remocao. A verificacao
nao substitui a autorizacao geral dos uploads legados. Nao confundir exclusao
logica com revogacao de URLs S3 ja emitidas ou destruicao de documentos.
