# DEV: validar consulta paginada de Compras - 28/10/2026

Publicacao exclusiva refactor/frontend. Usuario executa EC2 manualmente;
agente nao acessa servidor. Nenhuma alteracao de registros reais ou migration.

## Conteudo e preservacao

- Base2b1d3e7a: correcao estrita de validateCompraQuery para aceitar
  page/limit/q/status ja enviados pela tela, com o parser do servico SQL.
  Um arquivo runtime: backend/src/validators/operationalValidators.js.
- Controllers, servico SQL e frontend permanecem iguais. Mantidos limite50
  por padrao/max100, filtros/ACL antes de COUNT/LIMIT, consultas separadas,
  detalhes sob demanda e correcoes anteriores de rascunho, reabertura e PIX.
- Aplicador copia inventario fechado por hash, confere dependencia inalterada,
  mantem HEAD/index e faz backup privado dos arquivos. Seis scripts QA locais
  com rede bloqueada e SQLite em memoria, oito testes do aplicador.
- Um restart somente backend-dev; preserva seu limite atual, PROD4096,
  Experience, daemon, ambientes, Nodes, unit e dumps. Sem install, migration,
  SQL real, captura fiscal, PM2 save/update/resurrect ou --update-env.
- Automatico NSDOCS OFF e recursos fiscais exclusivos DEV preservados.
  Nenhuma mudanca do frontend neste pacote; nao requer etapa Vercel nova.

## Execucao manual

1. Conferir backup DEV. No Windows CMD, entrar no worktree
   C:\Users\Ricardo\.codex\worktrees\compras-paginacao-local-20261027\Fluxy.
2. Definir EC2_FLUXY=ubuntu@3.142.33.181, EC2_CHAVE com o caminho local da
   chave e COMMIT_DEV com o SHA completo publicado e entregue no chat.
3. Conferir SHA256 de ops/deploy/atualizar-dev-compras-query-20261028.cjs.
4. Enviar esse arquivo por stdin ao Node DEV24.22.1 no checkout
   /home/ubuntu/sistema-gestao-solicitacoes-dev, argumentos --backend COMMIT_DEV,
   CONFIRM_DEV_BACKUP=SIM e CONFIRM_COMPRAS_QUERY_DEV=SIM.
5. Encadear --conferir COMMIT_DEV pelo aplicador instalado no mesmo checkout.
   Os comandos completos e hash esperado constam na entrega do chat.

Esperado COMPRAS_QUERY_BACKEND_DEV_PRONTO, runtime_files1,
producao_heap_4096_preservado/heap_dev_preservado true, sql0, migrations0,
financial_data_writes0 e operacoes_executadas0. Os dois JSONs representam
aplicar/conferir, nao dois reinicios. A validacao nao mede desempenho sob
carga real nem substitui a homologacao no navegador.

Recarregar DEV apos PRONTO. Abrir lista, navegar para pagina2, pesquisar codigo
de SC, combinar obra/status e abrir detalhe. Conferir sem criar/alterar SC real.
Se interromper, enviar somente o codigo sanitizado; nao remover estado/locks
nem reiniciar manualmente. Estado/backups em
/home/ubuntu/.config/fluxy-compras-query-dev-20261028.
Retomada incerta nao executa outro restart; reversao requer roteiro especifico.
Nunca enviar chave, env, credenciais, dumps ou XMLs.
