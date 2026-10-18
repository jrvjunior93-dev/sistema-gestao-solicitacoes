# Handoff: RH admissao, filtros e documentos

## Escopo e estado

Usuario relata diaria preenchida recusada para Obra/DP, filtros e transferencia
da Luana, documentos por empresa/colaborador e comprovantes para pasta completa.
Confirmou implementar campo novo de inicio efetivo apenas informativo e
exportacao com migration, sem alterar producao. DP pode aprovar transferencias.

Implementado no worktree performance-fila-dp, branch
codex/autorizacoes-textos-ofx-diagnostico-20261018, base refactor/frontend
96483366. Estado anterior a publicacao autorizada abaixo: sem commit/push.
Nao houve DB real, migration aplicada, .env, EC2, PM2 ou S3.
Pacote anterior de textos de autorizacao e OFX e outputs preservados; seu
handoff e docs/handoffs/2026-10-18-autorizacao-textos-ofx-obras.md.

## Alteracoes

- rhSolicitacaoService/RhDpPessoal: moeda BRL virava NaN com Number. Payload
  agora numerico; backend normaliza admissao na abertura/reenvio/aprovacao
  legada, sem mutar payload original ou remover verificacao de diaria positiva.
- RhColaborador, rhValidators, rhService, formularios e detalhe: novo campo
  data_inicio_efetivo_obra. Independente das datas usadas em calculos/vinculos.
  Pode ser limpo; campo omitido em PATCH permanece inalterado no Sequelize.
- Migration aditiva 202610180001_rh_inicio_efetivo_obra.js, sem backfill/DML;
  recusa down destrutivo. Necessaria antes do boot com modelo novo.
- rhCatalogoConsultaService, RhEmpresaGrupoController, routes e rhDp.js:
  catalogo minimo (id/nome/cnpj ativos) por permissao de leitura da tela.
  Usuarios Obra continuam restritos a empresas de colaboradores de suas obras.
  Promise.allSettled preserva os seletores que carregaram com sucesso.
- RhDpPessoal/Transferencias: remove bloqueio visual CENTRO_CUSTO, que o backend
  ja suporta; explicita impedimento de decisao. DP/SUPERADMIN ja aprovam sem
  cadastro de responsavel; nao aprovar a propria transferencia, nem contornar
  escopo de usuario Obra. Nenhuma permissao individual da Luana foi consultada
  ou alterada. Nome informado pelo usuario, nao identidade/sessao auditada.
- rhDossieVinculosService/rhDossieService: inclui referencias persistidas de
  pagamento por solicitacao e ticket. JSON_CONTAINS filtrado por tipo/subtipo
  (indice composto existente), colaborador ou origens do reembolso. Caminho
  JSON SQL constante usa literal, evitando $$ produzido por fn em string.
  Acesso a comprovante valida titulo, fila e arquivo; deduplica espelhamento.
- rhDocumentosExportacaoService, RhDocumentoController, routes, s3.js:
  ZIP por empresa/local atual ou colaborador. 10 pessoas por lote, cursor por
  ID; inclui desligados. Completo preserva versoes/status de documentos e
  anexos ainda nao validados, identificados no manifesto. Comprovantes e um
  modo separado. Nenhuma conversao em documentos oficiais ou escrita financeira.
- RhDocumentosExportacao e CSS: reutilizado nas duas telas, botoes type button,
  ocupacao por ref, cancelamento/unmount, progresso/erro, retry sem avancar.
  Metadados do ZIP efetivo em headers expostos prevalecem sobre preparacao,
  evitando salto se o cadastro mudar entre as duas consultas. Detalhes de
  escopo recolhidos para preservar densidade operacional (skill frontend-design).
- Archiver 5.3.2 promovido a dependencia direta exata, ja presente no lock por
  ExcelJS; npm --package-lock-only --ignore-scripts, sem atualizacao transitiva.
  npm informou as mesmas 4 vulnerabilidades (3 moderadas/1 critica) do conjunto
  anterior; nao executar audit fix/force como parte deste pacote.

## Limites e riscos conhecidos

- Exportacao serial, sem acumular PDFs em RAM: 1000 arquivos/256 MiB por ZIP,
  128 MiB por arquivo e 240s; ate 2 exportacoes por processo, 1 por usuario.
  Se lote exceder limites, orientar exportacao individual. Nao prometer ZIP
  ilimitado ou conclusao antes de finish. Interrupcao nao registra sucesso.
- Nao faz fetch de URL externa: GetObject para bucket configurado/historico
  permitido, ou arquivo local com confinamento por realpath (inclui symlink).
  Cancelamento interrompe SDK/streams. Nao grava copia persistente de anexos.
- Um comprovante original de pagamento agrupado pode conter varias pessoas;
  preservado nas pastas relacionadas com aviso. Usuario precisa ter leitura
  documental global atual; Obra continua sem acesso a este exportador.
- Consulta de referencias JSON ainda depende do volume historico dos pedidos
  do subtipo. Validar plano/latencia no DEV antes de promover; nao afirmar que
  houve EXPLAIN/MySQL real. Nao adiciona polling nem varredura por intervalo.
- Empresa e local sao filtros do ZIP; demais filtros da tabela sao ignorados
  deliberadamente e isso aparece em Escopo e limites da exportacao.
- Documentacao completa significa arquivos disponiveis no sistema, inclusive
  historicos/pendentes com status; nao certifica completude documental externa.

## Validacoes executadas

- Backend test:rhdp-admissao-documentos: BRL/numero/decimal; Obra/DP/admin;
  abertura, reenvio, aprovacao legada/concorrente e negativas; cadastro direto;
  datas independentes; catalogos/rotas/escopo; SQL gerado para MySQL sem
  conexao; novas referencias/ticket/legado; arquivo alheio recusado; ZIP real
  aberto com PizZip; manifesto/modos, empresa/cursor25, historico e serializacao;
  duas exportacoes simultaneas do mesmo usuario recusadas; falha/liberacao;
  storage com SDK/FS simulados, URL externa, traversal e symlink; migration
  idempotente simulada sem DML. Todos aprovados.
- Backend validarRhPessoalPorSolicitacao e validarRhMovimentacoesDocumentais
  aprovados, sem banco/rede.
- Frontend test:rhdp-admissao-documentos: servicos/componentes reais com HTTP
  interceptado, retry/cursor, dois modos, cancelamento, duplo clique, sem
  chamadas externas e sem corte em 320/390/768/1366; screenshots inspecionadas
  em outputs/rh-documentos-20261018 (nao commitar).
- Frontend validarRhPessoalPorLocal completo aprovado apos atualizar expectativa
  legada que bloqueava transferencia em centro de custo; edicao, documentos,
  relatorios, escopos negativos, mobile e pagamento/conferencia/fechamento.
- Frontend validarRhColaboradorContatos completo aprovado com novas assercoes:
  admissao real DP e Obra com diaria formatada gera payload numerico; inicio
  efetivo independente na tela e payload; editar/reabrir/limpar, validacoes de
  contatos/endereco e workspace desktop/mobile preservadas. Incluido no novo
  comando test:rhdp-admissao-documentos junto ao teste de exportacao.
- Frontend build aprovado, 616 modulos. Aviso preexistente caniuse desatualizado.
- Documentacao valida: 542 Markdown/19 canonicos; git diff --check aprovado.
- Backend validarRhPessoalFluxo --transferencias aprovado. A execucao integral
  antiga desse script falha em fixture de jornada por dependencia crypto nao
  simulada; rhJornadaFormularioService nao foi alterado. Nao considerar a suite
  integral aprovada. Suite atual de jornada por solicitacao passou separadamente.

## Proximo passo exato

### Publicacao autorizada em 18/10/2026

- Usuario autorizou commit/push deste pacote RH/DP na refactor/frontend e
  comandos para EC2 DEV com migration. Publicacao limitada a RH/DP; textos de
  autorizacao/OFX anteriores permanecem locais sem entrar no commit.
- Novo runner aplicarMigrationRhDocumentosDev valida caminho, host, UUID DEV,
  PM2/porta/watch, divergencias de variaveis/flags e whitelist exclusiva; requer
  CONFIRM_DEV_BACKUP=SIM para aplicar, restaura autorizacao temporaria e verifica
  coluna DATE anulavel. SELECT sintetico JSON_CONTAINS nao le dados pessoais.
- Script ops/deploy/atualizar-dev-rh-documentos-20261018.sh exige SHA completo,
  branch correta, checkout sem alteracoes rastreadas, fast-forward e lock DEV.
  npm ci --omit=dev, testes RH isolados, runner, sessao12h somente verificacao,
  restart exclusivamente backend-dev e health8001 com tentativas de aquecimento.
  Nao altera .env, PILOT ou demais flags; nao opera producao. Backup recente
  DEV deve ser conferido pelo operador antes da execucao, nao presumido aqui.
- Testes do runner aprovados sem banco/EC2, incluindo negativas de producao,
  pendencias extras, backup ausente, watch, erros, retomada e JSON/coluna.
- Luana sera testada pelo usuario tambem em producao, para reproduzir a falha
  atual. Isto nao autoriza deploy/mutation la. Orientado coletar mensagem/print
  e endpoint/HTTP sem token, cookie ou senha; nao aprovar/alterar ao diagnosticar.

1. Autorizacao de publicacao recebida; publicar somente RH/DP na
   refactor/frontend, preservando OFX/textos e outputs locais. Nao operar main.
2. Operador conferir backup DEV e executar roteiro com SHA publicado e
   autorizacao exclusiva da migration nova; nunca apontar o roteiro para main.
3. Testar Obra pedindo admissao DIARIA e DP cadastrando/aprovando com 150,50;
   sem erro falso, zeros recusados, repetir clique nao duplica colaborador.
4. Inicio efetivo anterior/posterior a admissao fica independente ao reabrir;
   limpar campo; conferir folha/vinculo sem mudanca retroativa.
5. Luana testar empresas/obras e transferencias criadas por outra pessoa. Caso
   ainda falhe, coletar codigo HTTP/endpoint e sessao efetiva sem tokens; auditar
   somente leitura setor, escopo Obra e permissoes. Nao conceder admin/bypass.
6. Com documentos DEV/S3 permitidos, baixar comprovantes e completo individual;
   validar pagamentos novos, ticket, fechamento legado, multi comprovante,
   arquivos compartilhados e manifestos. Comparar IDs/status com tela.
7. Empresa com mais de 10 colaboradores: baixar todos os lotes ate ultimo,
   confirmar sem salto/repeticao, includes desligados e limite de local;
   cancelamento/retry, erro S3 e sessao sem permissao documental.
8. Validar consulta JSON_CONTAINS/indice e tempos em MySQL DEV com dados
   representativos. Nao autoriza ALTER, EXPLAIN ANALYZE ou testes de escrita
   em producao. Somente depois homologar/promover com nova autorizacao.
