# Analise do proprietario e permissoes independentes de envio

Contas a Pagar permite marcar titulos individualmente ou em massa como
EM ANALISE DO PROPRIETARIO. O envio de um dossie digital aplica o mesmo status
interno e atualiza as solicitacoes vinculadas, mantendo o setor atual. Saldo e
status financeiro ABERTO ou PARCIAL permanecem intactos. Analise nao significa
autorizacao nem baixa.

## Operacao e permissoes

Solicitar autorizacao exige apenas `financeiro.autorizacoes_pagamento.preparar`,
sem depender da permissao da fila. A selecao de titulos tambem fica disponivel
para quem so prepara autorizacao. O botao digital permanece visivel para quem
tem a permissao, mas desabilitado quando o recurso digital esta OFF ou PAUSED.

Enviar para pagamento exige apenas `financeiro.fila_pagamentos.preparar` e
funciona em OFF, PILOT, ENFORCED e PAUSED, conforme decisao expressa do usuario.
Nao depende da permissao de preparar autorizacao. Nao solicita declaracao de
autorizacao em papel nem uma segunda confirmacao. Permanece somente o modal
habitual de confirmar o envio dos titulos selecionados.

As duas permissoes sao independentes e quem possui ambas ve os dois botoes.
A marcacao manual de status exige `financeiro.titulos.status_interno`.
Quem nao possui essa permissao ve o status como texto, sem controles de edicao.
As opcoes operacionais sao nativas, sem seed em producao. Status customizados
e valores legados permanecem visiveis, sem duplicacao por caixa ou acento.

## Integridade e continuidade

O envio direto grava auditoria obrigatoria na mesma transacao da fila: usuario,
modo, IP, saldo e vencimento selecionados. Nao registra aprovacao digital nem
afirma que o usuario e o proprietario. Falha na auditoria reverte o envio
inteiro. Titulos avulsos tambem sao auditados. A rota nao aceita flags de
autorizacao interna ou de permissao informadas pelo cliente.

Titulos quitados, sem saldo ou ja em fila nao podem voltar para analise.
Escopo por obra e validado na marcacao manual e na preparacao digital. O envio
preserva regras de saldo, retorno da Obra, cartao, pagamento bancario em
andamento e fila ativa. Dossie digital ativo impede encaminhamento concorrente
do mesmo titulo pela via direta; concluir esse fluxo antes de reenviar.

Ao enfileirar, os titulos em analise passam para ENVIADO PARA PAGAMENTO e o
fluxo existente encaminha a solicitacao ao Financeiro. O historico identifica
os titulos selecionados, sem presumir que todos os titulos da solicitacao
foram autorizados. Rejeicao ou invalidacao digital deixa o titulo AGUARDANDO
AJUSTE DE PAGAMENTO e, se ainda estava em analise, a solicitacao AGUARDANDO
AJUSTE, sem trocar setor. Estados finais de solicitacoes sao preservados.

Envio e mudanca de status possuem trava sincrona no frontend. A selecao e
congelada antes da confirmacao; retries conservam a chave. Locks, transacao,
idempotencia e verificacao de fila ativa impedem duplicidade.

## Arquivos

- `backend/src/services/analiseProprietarioService.js`
- `backend/src/services/statusInternoContasPagarService.js`
- `backend/src/services/pagamentoAutorizacaoService.js`
- `backend/src/services/pagamentoManualFilaService.js`
- `backend/src/services/paymentOwnerApprovalPolicy.js`
- `backend/scripts/validarAnaliseProprietario.js`
- `backend/scripts/validarStatusInternoContasPagar.js`
- `frontend/src/pages/FinanceiroTitulos.jsx`
- `frontend/scripts/validarAnaliseProprietario.mjs`
- Este handoff e registro proprio em `docs/workspace/OWNERSHIP_ATIVO.md`.

## Validacoes e publicacao

`node backend/scripts/validarAnaliseProprietario.js` e
`node backend/scripts/validarStatusInternoContasPagar.js` passaram com modelos
em memoria. Cobrem analise manual/digital, registros avulsos, rejeicao,
invalidacao, escopo, saldo, quatro modos, permissoes independentes, rollback
de auditoria, protecao de payload e idempotencia. Sem banco ou rede.

`node frontend/scripts/validarAnaliseProprietario.mjs` passou com handlers,
toolbar e confirmacao reais e servicos simulados: botoes independentes,
confirmacao unica, cancelamento, duplo clique, retry e selecao congelada.
Capturas em `outputs/analise-proprietario/`, temas claro/escuro e 390 px.
Build passou com avisos anteriores de Browserslist e chunk acima de 500 kB.
`git diff --check` passou. Validadores existentes de Fila de Pagamentos e
Autorizacao do Proprietario passaram sem operacoes de banco.

Backend e frontend devem ser publicados juntos. Nao ha migration, dependencia
ou variavel nova. Nenhum commit, push, deploy, EC2 ou escrita em banco real
foi executado. Proximo passo: publicar mediante autorizacao e conferir com
Liz a marcacao em massa, visualizacao pela Obra e envio direto com somente
a permissao de fila. Preservar ajustes pendentes de Novo mes e Jornada;
nao incluir auditorias ou outputs no commit desta tarefa.
