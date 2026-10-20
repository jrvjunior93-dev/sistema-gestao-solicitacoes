# Cheques compartilhados, descontos e reconciliacao de contrato

## Escopo autorizado

Usuario autorizou implementar/testar na refactor/frontend, sem producao.
Agente unico, branch isolada codex/cheques-contrato-lote-20261020 na base
e01e7bbf7ca35a99fa81f0ac387a5b6a23eb20a8. Sem EC2/SSH ou banco real.
Main remota e9df5094 preservada. Nao ha migration/dependencia/flag nova.

## Causa reproduzida

Quatro titulos2740/17300/13500/7483,11, descontos1086,91/6862,59/5355,20/2968,41,
desembolso1653,09/10437,41/8144,80/4514,70. Total41023,11 menos16273,11 igual24750,
em tres cheques8250. O rateio de centavos ja estava correto.

O principal13500 do titulo de contrato e dividido em4499,99/4499,99/4500,02.
Cada componente chama baixarTitulo e o sincronizador da solicitacao; este
reconcilia o contrato e trata uma baixa parcial avulsa como definitiva. A primeira
parte encerrava o saldo do titulo antes das demais. A segunda era interpretada
como excedente4499,99 sem parcela de onde absorver. Nao depende de superadmin.

O teste isolado desliga somente o adiamento no orquestrador para reproduzir
o erro exato com baixa e reconciliacao reais (models em memoria). Nao usa o
estado real da producao: valores/modelo de contrato derivados dos prints.

## Implementacao

- tituloFinanceiroService: opcao interna adiarSincronizacaoSolicitacao somente
  no contexto de liquidacao/estorno da fila, com transacao e guardas existentes.
  Nao e campo publico e nao e aceito no payload. Mantem cada movimento e seu
  historico, escopo, bloqueios, faturas, intercompany e validacao de saldo.
- pagamentoFilaLiquidacaoService: adia sincronizacao de solicitacao entre
  componentes e executa uma vez por solicitacao, depois do grupo completo,
  na mesma transacao. Falha final reverte inclusive consumo de carteira.
- pagamentoManualFilaService: no estorno integral, reverte todos os componentes,
  sincroniza estado completo e so entao fotografa os saldos reabertos da fila.
  Mantem permissoes de estorno/escopo, autorizacoes e log do grupo/replay.
- Caminhos avulsos permanecem com a regra atual. Nao redefinir pagamento parcial
  definitivo, medicao, valor contratual, desconto ou datas existentes.
- O orquestrador e compartilhado com cartoes rateados; suites de fatura,
  multiplas fontes e carteira devem continuar aprovadas.

## Validacoes

Novo backend/scripts/validarChequesLoteContrato.js: reproduz erro4499,99 antes
da correcao, confirma 12 movimentos com principal41023,11/desconto16273,11 e
3 desembolsos8250, preserva parcela/medido13500, historicos individuais,
Financeiro/superadmin, sincronizacao final unica por solicitacao, replay sem
financeiro duplicado, estorno integral/replay/escopo e saldo correto na nova fila.
Solicitacoes distintas observam somente o estado completo do grupo, com IDs
ordenados e deduplicados. Falha final na baixa/estorno com carteira desfaz tudo;
cheque repetido e baixa
acima do saldo seguem bloqueados; baixa avulsa e contexto interno protegidos.

Suites backend de rateio1000casos, carteira, fila multiplas fontes, cartao,
cartao opcional/fila, bloqueio proprietario, medicao valor autorizado,
favorecidos, contratos operacionais/saldo reprogramacao e datas aprovadas.
Nao foram executadas migrations ou baixas reais. UI direcionada de cheques
1366/390 com APIs simuladas, build, docs585/19 e diff/sintaxe aprovados. Sem
alteracao de frontend, migrations/dependencias, rotas ou permissao. Ownership
liberado, delta local preservado sem commit/push.

## Proximo passo

Delta local para posterior commit/push e homologacao DEV, mediante pedido.
Teste manual DEV: quatro titulos equivalentes, descontos por linha, tres
cheques8250 uma unica vez; confirmar quitacao/saldo, historico, contrato sem
redistribuicao indevida e, se necessario, estorno integral do grupo.
Nao repetir como teste em producao. Nenhum dado existente sera regularizado
automaticamente. Nao publicar ou fazer deploy sem autorizacao separada.

## Publicacao DEV autorizada posteriormente

Usuario solicitou commit/push da correcao para refactor/frontend e comandos
exclusivos DEV. Base e01e7bbf e main e9df5094 conferidas; sem EC2 pelo agente.
Delta de runtime permanece o ja validado. Roteiro existente
ops/deploy/atualizar-dev-datas-cheques-20261019.sh agora executa tambem
validarChequesLoteContrato.js depois do merge e antes do restart. Seu teste
isolado confere essa ordem. Nao importar novo QA antes de atualizar o checkout.
Guardas existentes antes do merge, PM2/watch/8001, schema/12h/flags e hash
do .env preservados; nenhuma DDL, baixa de teste ou mudanca de permissao.

QA repetido nesta publicacao: lote/contrato, rateio/carteira/composta/cartao,
bloqueio proprietario/medicao/data, guardas do roteiro, Bash/Node, docs585/19
e diff aprovados. UI direcionada e build aprovados na implementacao, sem
alteracao de frontend posterior. Ownership liberado para commit/push autorizado.
Operador executa roteiro pinado no novo SHA e homologa baixa somente no DEV.
