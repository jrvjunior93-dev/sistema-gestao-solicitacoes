# Preparacao MAIN financeiro e sobreposicoes

## Autorizacao e gates

Usuario autorizou promover os pacotes, incluindo a correcao do outro agente.
Confirmou testes DEV dos dois pacotes, backup recente cifrado conferido e timer
ativo. Pediu leitura/simulacao em producao ANTES de aplicar alteracoes. Nenhum
acesso EC2/SSH, banco real, migration, restart ou regularizacao pelo agente.

Main congelada: ff459840aa40c2bf55541b454016ae4ac87b1097.
DEV congelada: db1d2253c7ee12cb6e13cf6e61ad7a40a8154987.
Delta DEV: permuta/relatorio/mapa de datas (39f368be), multiplas fontes/centros/
cancelamento (4ffdb9ae), parcelas do cartao (d9f00c5d), sobreposicoes/historico
do outro agente (db1d2253). Nova migration estrutural unica:
202610190001_cartao_parcelamento_baixa.js. CORRECAO posterior ao deploy a67:
o inventario do preflight estava vazio e nao comprovava ausencia de pendencias.
Operador confirmou essa migration pendente; ver handoff de retomada abaixo.

## Preparacao local

Worktree gerenciado promocao-financeiro-20261019, branch isolada
codex/promocao-financeiro-20261019 criada de main. Commits exclusivos da main
preservados por merge; conflitos somente no README financeiro e ownership,
resolvidos conservando os dois lados. Runtime, migrations e lockfiles identicos
ao DEV db1d2253 (diff vazio); nenhuma regra funcional nova nesta integracao.
Worktree do outro agente, seus outputs/auditorias e alteracoes locais intactos.

Snapshot local anotado backup/main-pre-financeiro-20261019-ff459840 e bundle
outputs/promocao-financeiro-20261019/main-ff459840.bundle verificado por Git.
SHA256 BE74DA191E6BE36A598548C5E8E05454CBD3A9368405BADF233A6CD296CFE6B7.
Bundle local no computador, fora da EC2 e do Git; nao afirmar copia no Drive.

## Preflight do operador

Novos scripts preflightFinanceiroProducao20261019.js e teste
validarPreflightFinanceiroProducao20261019.js. O preflight e portatil: copiar
somente o JS para /home/ubuntu/preflight-financeiro-producao-20261019.cjs;
executar com --verificar no backend do checkout main, sem atualizar arquivos.
Antes, git fetch origin main refactor/frontend, para obter os objetos do alvo.
Versao corrigida exige conferirProducao exportado pelo helper operacional novo;
nao usar o JS inicial com checksum antigo para comprovar schema sem pendencias.

Reusa guardas de producao existentes (caminho, PM2/watch, env, PILOT/TLS/12h).
Conexao MySQL independente, UUID e TLS conferidos; SELECT parametrizado, limite
explicito por consulta, MAX_EXECUTION_TIME, snapshot READ ONLY e ROLLBACK.
Compara migrations publicadas no alvo com schema_migrations real; so aceita a
nova migration do cartao pendente ou nenhuma. Nao aplica schema.

Le as duas solicitacoes, titulos, participacoes do lote1/negociacao3, baixas e
vinculos historicos dos quatro titulos antigos. Carrega por git show somente
os quatro modulos puros do SHA DEV congelado em VM sem fs, models ou driver.
Executa o simulador original em memoria; nenhuma chamada a endpoint/servico
operacional de cancelamento. Resultado apenas hipotetico e nao autoriza baixar,
cancelar, excluir ou regularizar. Conferencia comercial e todos os bloqueadores
da operacao real continuam obrigatorios, inclusive ACL e controle de versao.

Falha fechada se estado mudou (pago/excluido/vinculado, saldos ou referencias
divergentes, limite excedido, identidade ou schema fora do pacote). Nao
contornar asserts nem flexibilizar a simulacao para obter um resultado positivo.

## Validacoes concluidas

- Backend integrado: parcelas cartao, multiplas fontes, permutas, sobreposicoes,
  compartilhados, renegociacao vinculos/sincronizacao, cancelamento, compra/
  frete/boleto/cartao opcionais, centros de custo e permissoes de rotas.
- UI real 1366/390: historico do card, cartao/previsao ampla, cancelamento,
  multiplas fontes e permutas; APIs simuladas. Build frontend aprovado, avisos
  preexistentes de Browserslist antigo, sem atualizacao de dependencias.
- Preflight isolado com simulador real: saldos/centavos, identidade/TLS/schema,
  rollback, pagamento/vinculo/exclusao/limite e VM sem models/escrita.
- Recortes e simulacao tambem conferidos no snapshot privado anteriormente
  recebido. Nenhum fixture privado, dado pessoal ou outputs adicionado ao Git.
- Sintaxe, documentacao e diff-check aprovados. MySQL real nao acessado.

## Evidencia real recebida e publicacao

Operador executou o arquivo SHA256
89F7749B70DF41136818D9D78424AC347A55BA926DC1B1320D59337560032AD9, timer
ativo e checkout ff459840. Corte UTC 2026-10-19 17:15:44, UUID produtivo
5ed4b970-009f-11f1-809c-0ad0e0c90c53, TLS/JSON/PILOT/12h preservados.
Main antiga sem pendencias; o resultado de ausencia de pendencias no ALVO foi
invalidado: git ls-tree relativo a backend/ retornava lista vazia. O banco NAO
registrava a migration nova. A simulacao financeira abaixo continua sendo apenas
em memoria e nao executou regularizacao. Corrigido com --full-tree e fail-closed.

Simulacao em memoria conferida sem mutacoes: SOL-5426 saldo proposto 7055.00;
SOL-5419 saldo proposto 1876.67, preservando 938.33 liquidados. Zero movimentos
criados e zero exclusoes. Hash da fonte
2ac4439976cc38d82f6eff22280e390e38d5b567e745ef2299337295edde4645.
Identidade comercial e bloqueadores atuais/ACL ainda precisam ser verificados
na operacao de cancelamento. Nenhuma regularizacao financeira autorizada pelo
preflight ou executada como efeito da promocao.

Novo roteiro ops/deploy/atualizar-producao-financeiro-20261019.sh recebe SHA
main e confirmacoes de backup/timer. Faz bootstrap com o verificador ja presente
na main antiga, compara runtime/lockfiles/migrations com DEV db1d2253 e atualiza
por fast-forward. Instala lockfile, roda suites isoladas e verifica schema/SQL
ANTES de restart exclusivo backend-solicitacoes. Qualquer pendencia interrompe;
nao possui comando de migration nem escrita financeira. Preserva hash do .env,
PILOT/TLS/12h e ambiente PM2, sem --update-env. DEV nao e reiniciado.

Novo verificarFinanceiroProducao20261019.js confirma identidade/TLS e reusa
somente SELECT/EXPLAIN/schema/indices/FKs/consistencia de parcelas; nenhum runner
DDL. Extracao desse verificador em verificarCartaoParcelamentoMySqlDev mantem
intactas as guardas exclusivas DEV e seu UUID; nao executar a CLI DEV em producao.
Novo validarDeployFinanceiroProducao20261019.js cobre fixtures com UUID DEV,
TLS ausente, coluna/indice/FK ausente, soma divergente e erro SQL com rollback,
alem de bootstrap antigo, .env e processo exclusivo. Suites anteriores DEV e
producao continuam aprovadas; build e documentacao repetidos com sucesso.

Alias Git remoto do operador fluxyintegracao-dev e origin local jrvjunior93-dev
conferidos na API com o mesmo repository ID 1148559590; nao sao dois forks.
Nenhuma URL/credencial foi alterada ou incluida no Git.

## Proximo passo exato

PR20 integrado em a67e3de9. Operador atualizou checkout, instalou dependencias
e passou suites; parou antes do restart ao encontrar schema pendente. Retomar
conforme [correcao operacional](2026-10-19-retomada-migration-cartao-producao.md),
com allowlist de migration unica. Nao repetir o roteiro antigo sem DDL para
resolver esta pendencia. Agente nao acessa EC2/SQL reais nem faz deploy.
Regularizacao dos quatro titulos continua separada e nao e executada pelo roteiro.

Rollback nunca automatico: schema nao deve sofrer down. Retorno ao codigo
anterior exige conferir se ja houve baixas com parcelas novas, porque o legado
nao reconhece essas alocacoes. Preservar dados/historico e planejar compatibilidade
antes de reverter se a nova funcionalidade ja tiver sido usada.
