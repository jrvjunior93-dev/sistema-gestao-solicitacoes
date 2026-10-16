# Fila: forma efetiva e previsao de cartao - 2026-10-16

Complemento posterior autorizado: acao de desvinculacao explicita antes da
edicao, descrita em 2026-10-16-titulo-desvincular-fatura.md. Delta ainda local;
publicacao conjunta depende de autorizacao do usuario.

## Pedido e autorizacao

Usuario pediu permitir enviar o titulo para a fila e baixar conforme o pagamento
efetivo. Confirmou corrigir vinculos anteriores somente sem baixa do titulo nem
pagamento da fatura, com auditoria/recalculo. Nao autorizou nesta etapa commit,
push, deploy ou alteracao de dados reais. Nenhuma dessas operacoes foi executada.

Base local a0fcbbbe, derivada da refactor/frontend, no worktree
`C:/Users/Ricardo/.codex/worktrees/performance-fila-dp-20261015/Fluxy`.
Branch local existente `codex/rhdp-movimentacoes-documentos-cat-20261016`.
Nao promover main. Outputs QA permanecem fora do Git.

## Implementacao

- Novo `backend/src/services/pagamentoFilaPrevisaoCartaoService.js` valida
  titulo ABERTO, sem valor baixado/movimento ativo, fatura ABERTA sem pagamento,
  conciliacao ou PAGAMENTO_FATURA ativo e consistencia do vinculo/cartao.
- `pagamentoManualFilaService.js` permite enfileirar esses titulos sem alterar
  a fatura. Revalida na baixa, corrige vinculo na mesma transacao da baixa real,
  recalcula fatura antiga e usa o instrumento efetivo escolhido. Baixa em grupo
  passa pela mesma correcao por titulo; aprovacao de divergencia tambem revalida.
- Preserva forma prevista, valores, parcelas, anexos e outros titulos/faturas.
  Credito associa compra a fatura aberta do cartao real; nao paga a fatura.
- Snapshot anterior salvo na fila e em SecurityEventLog, com ator, IP e contexto
  de Testar usuario quando presente. Falha de auditoria ou baixa reverte tudo.
  Fatura zerada nao e apagada. Estorno segue regras atuais e nao restaura uma
  previsao incorreta automaticamente; o evento original permanece auditavel.
- Queries adicionais so para titulos vinculados a fatura. Consultas distintas
  por titulo e PAGAMENTO_FATURA evitam OR entre campos na tabela de movimentos.
- Frontend: InstrumentoPagamentoFila mostra forma efetiva e aviso de previsao;
  FinanceiroFilaPagamentos explica escolha efetiva. filaWorkspaceDraft inclui
  cartao/fatura na revisao para detectar alteracoes durante um rascunho.
- Sem novas rotas/permissoes, migrations ou mudanca de governanca. Envio conserva
  ACL de obras; baixa conserva seu gate proprio atual, distinto da edicao de
  titulos. Nao atribuir ao novo teste uma ACL de baixa que a fila nao possui.

## Arquivos e testes

Alterados tambem backend/package.json (test:fila-previsao-cartao),
backend/scripts/validarFilaPagamentosManuais.js, validarAnaliseProprietario.js,
validarCartaoOpcionalSolicitacao.js, novo validarFilaPrevisaoCartao.js,
frontend/scripts/validarFilaInstrumentosUI.mjs, README canonico Financeiro e
registro de ownership. As duas fixtures antigas precisavam acompanhar a nova
guarda e a leitura de participacoes, sem dispensar protecoes de compartilhados.

Validacoes locais aprovadas:

- test:fila-previsao-cartao: servicos reais de fila/titulo/recalculo com banco
  simulado; PIX, troca/reuso de cartao/fatura, outros titulos preservados,
  parcial PIX, fatura paga/fechada/parcial, movimento, vinculo inconsistente,
  negativa de permissao/escopo de envio, replay, rollback de auditoria/baixa,
  rollback do segundo titulo do lote e aprovacao de divergencia.
- Interleaving de duas chamadas simulado por transacao serializada, sem alegar
  prova de concorrencia MySQL real. Queries do helper usam UPDATE lock; a
  transacao real e concorrencia devem ser homologadas em DEV.
- test:fila-instrumentos, validarFilaBaixaEstorno.js,
  validarFilaLiquidacaoRateada.js, test:fila-comprovante-pendente e
  test:performance-fila-dp aprovados, sem banco/rede reais.
- UI real desktop/mobile: validarFilaInstrumentosUI.mjs completo aprovado;
  inclui selecao/paginacao de 650 titulos e oito recortes. Novo modo
  --previsao-cartao aprovado em 1366/390 com APIs isoladas.
- npm run build frontend aprovado (avisos existentes de Browserslist e tamanho
  de chunk), sintaxe backend, test:docs e git diff --check aprovados.

Skill frontend-design usada apenas para clareza dos textos operacionais e
consistencia compacta, sem remodelar tela/botoes ou usar baixa otimista.

## SOL-6104 e limites

Nao houve consulta nova nem alteracao de producao. Os valores/parcelas antigos
da SOL-6104 continuam necessitando correcao especifica; o novo fluxo NAO transforma
2 x 8640 em 6 x 1677 mais 9157,50. Usuario confirmou conta 37 e restante por
cartao; cartao/parcelamento/data do restante ainda nao foram confirmados.
Nao baixar lancamentos antigos inconsistentes apenas porque o envio foi liberado.

A criacao que informa um cartao como compra efetiva mantem baixa automatica
existente. Titulos ja quitados nao passam a poder entrar na fila. Nao ha reparo
automatico em massa nem reescrita de pagamentos de faturas.

## Proximo passo exato

Se o usuario autorizar commit/push: rever diff, registrar publicacao e publicar
somente este delta na refactor/frontend. Entregar atualizacao somente DEV,
validando checkout/processo/banco/UUID atuais. Nenhuma migration nova deste delta.
Nao executar EC2 pelo agente. Antes de promover, homologar em DEV:

1. Titulo aberto com fatura aberta sem movimento entra uma vez na fila;
   envio nao muda fatura/saldo.
2. Baixa por PIX remove apenas previsao antiga, recalcula e registra PIX.
3. Baixa por outro cartao usa conta vinculada e fatura aberta corretas.
4. Fatura paga/fechada entre envio e baixa bloqueia sem mudar registros.
5. Lote com ultima linha invalida nao baixa primeiras; duplo envio nao duplica.
6. Roles sem preparar/baixar continuam bloqueadas; obras de envio restritas;
   comprovantes, divergencias e estorno conservados.

Ownership desta tarefa liberado para publicacao/homologacao. Dados reais,
producao, .env, PM2 e main nao foram modificados.

## Publicacao conjunta autorizada em 16/10/2026

Usuario autorizou commit/push na refactor/frontend junto com a acao explicita
de desvincular antes da edicao. Base remota a0fcbbbe conferida, sem divergencia.
Testes de backend, permissoes, performance, instrumentos, rateio/estorno,
compartilhados, build e documentacao repetidos com sucesso; homologacao com
MySQL real continua exclusiva do DEV e deve anteceder promocao para main.
Atualizacao EC2 deve fixar o SHA entregue, verificar identidade/schema/sessao
com guard existente em leitura e reiniciar somente backend-dev. Nao ha nova
migration neste delta. Agente nao executou deploy, PM2, .env ou dados reais.
