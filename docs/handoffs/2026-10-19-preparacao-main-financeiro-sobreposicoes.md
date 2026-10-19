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
202610190001_cartao_parcelamento_baixa.js. Pendencia real ainda nao conferida.

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

## Proximo passo exato

Aguardar saida do preflight executado pelo usuario na EC2 de producao. Nao
publicar main nem fornecer comando de aplicacao antes de conferir a evidencia.
Depois: revisar pendencias reais; preparar roteiro produtivo com allowlist de
uma migration, identidade antes do merge usando somente arquivos ja presentes
na main antiga (evitar o bootstrap quebrado do roteiro DEV), testes/schema
antes de restart, preservar .env/PILOT/TLS/12h e processo backend-dev.
Criar/atualizar PR de integracao e publicar main somente apos gates aprovados;
entregar SHA fixo e roteiro ao operador. Tratar regularizacao de SOL-5426 e
SOL-5419 como operacao separada: nenhum cancelamento automatico no deploy.
