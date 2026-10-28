# DEV: privacidade RH e transferencias - 28/10/2026

Operacao manual pelo usuario. O agente nao acessa a EC2. Publicar backend e
schema antes do frontend. Main e producao permanecem fora desta entrega.

## Conteudo e limites

- Salario restrito por colaborador: obra nao recebe salario/bruto/liquido/totais
  em Pessoal/RH, mas informa percentuais e ajustes. DP confere valores completos.
  Acesso expressamente autorizado no Financeiro permanece como estava.
- Obra edita somente observacoes e documentos de origem de obra autorizada.
  Documentos internos/legados do DP continuam privados. Upload idempotente.
- Transferencia de colaborador ativo com divergencia de datas/historico mantem
  o historico anterior e registra a divergencia em auditoria; ACL/aprovacao
  preservadas. Pagamento preparado permanece na obra da solicitacao.
- Backend:12 arquivos runtime; sem dependencias novas. Frontend novo aguarda a
  conferencia manual RH_PRIVACIDADE_BACKEND_DEV_PRONTO.

Migration unica:202610280001_rh_privacidade_obra.js. Acrescenta
rh_colaboradores.salario_restrito_obra (booleano padrao false),
rh_documentos.obra_origem_id e chave_envio_obra (ambas nullable), mais2 indices.
Nao executa UPDATE/DELETE, backfill ou alteracao de salario/pagamento/documento
existente. Ha consultas de metadados/identidade/TLS e registro do nome em
schema_migrations. Nao afirmar sql0: a etapa aplica DDL aditivo e esse ledger.
Down recusa remocao automatica. DDL MySQL pode fazer commit implicito; em falha,
preservar estado e estrutura parcial, sem rollback destrutivo.

## Guardas do pacote

Confere checkout DEV/refactor/frontend, Node24.22.1 isolado, porta8001,
endpoint staging, UUID DEV e TLS. Recusa outra migration pendente, tipo/default
ou indice incompativel, SQL fora das5 operacoes estruturais permitidas e DML de
negocio. Mantem canal dedicado e lock de schema; repeticao nao duplica ledger.

Verifica PROD4096 e preserva limite DEV, Experience, daemon, ambientes, dumps,
systemd, HEAD/index Git, outros arquivos locais e automatico NSDOCS OFF. Faz
backup privado do codigo e reinicia somente backend-dev, uma vez. Estado em
/home/ubuntu/.config/fluxy-rh-privacidade-dev-20261028. Sem install, pull,
migrations gerais, PM2 save/update/resurrect/update-env, banco PROD ou S3 real.

## Execucao pelo operador

1. Conferir backup DEV. No CMD, entrar no worktree compras-paginacao-local-20261027/Fluxy.
2. Definir EC2_FLUXY, EC2_CHAVE e COMMIT_RH_DEV com os valores fornecidos no chat.
3. Conferir SHA256 de ops/deploy/atualizar-dev-rh-privacidade-20261028.cjs.
4. Enviar o arquivo por stdin ao Node DEV no diretorio
   /home/ubuntu/sistema-gestao-solicitacoes-dev usando --backend COMMIT_RH_DEV,
   CONFIRM_DEV_BACKUP=SIM e CONFIRM_RH_PRIVACIDADE_DEV_SCHEMA=SIM.
5. Encadear o aplicador instalado com --conferir COMMIT_RH_DEV. Enviar os JSONs.

Esperado RH_PRIVACIDADE_BACKEND_DEV_PRONTO, migration nomeada,
somente_schema_aditivo/producao_heap_4096_preservado/heap_dev_preservado true,
business_data_writes/financial_data_writes/operacoes_executadas0 e
frontend_liberado false. Aplicador executa QAs locais com rede bloqueada;
somente a etapa de schema usa a conexao DEV conferida.

Em falha, enviar apenas o codigo sanitizado. Nao forcar Git, remover locks,
repetir restart manualmente ou enviar env/chaves/documentos/dumps. Retomada
revalida arquivos/schema e nao repete restart de resultado incerto.

## Apos o backend PRONTO

O agente publica o commit frontend ja preparado, dentro da autorizacao deste
pedido, e confere o deploy DEV. Depois atualizar a pagina e homologar com DP e
obra:flag por colaborador, valores ocultos,40/60 e ajustes, cadastro limitado,
documentos internos bloqueados, Financeiro autorizado, transferencia e pagamento
preparado na origem. Nao usar registros reais como ensaio destrutivo. Nenhuma
transferencia, pagamento ou ativacao de sigilo e executada pelo aplicador.
