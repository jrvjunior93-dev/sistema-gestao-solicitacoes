# Criacao adicional de titulos de Compras — local

Usuario autorizou expressamente deixar a criacao individual aberta na solicitacao
e no pedido mesmo quando ja existirem titulos suficientes. Necessidade temporaria
da reorganizacao da empresa, sem limitar ao saldo ainda nao titulado. Nao e uma
autorizacao para alterar dados reais, baixar/cancelar titulos ou editar historico.

## Base e escopo

Branch local codex/titulos-adicionais-local-20261028, sobre main ade6e6dc.
Correcao de reabertura e precisao decimal preservadas. Nao houve commit, push,
acesso EC2, deploy, reinicio, migration ou gravacao em banco real. Producao foi
conferida pelo operador anteriormente com a reabertura ade6e6dc aplicada como
overlay sobre HEAD15a86635; qualquer proximo pacote deve reconhecer ambos os
hashes do servico de pedido e preservar esse overlay e o heap4096, DEV e NSDOCS.

Runtime alterado: pedidoCompraFinanceiroService.js, tituloFinanceiroService.js e
novo compraTitulosAdicionaisService.js. UI: PedidoCompraFinanceiro.jsx,
SolicitacaoDetalhe/FinanceiroCard.jsx e services/compras.js/financeiro.js.
Ownership desta tarefa registrado em docs/workspace/OWNERSHIP_ATIVO.md.

## Comportamento

- Pedido fechado/adotado permite criar novas obrigacoes com chave nova mesmo com
  titulos abertos/parciais/quitados, fretes ou avulsos na solicitacao. Nao substitui
  previsoes existentes nem cancela titulos. Mantidos fechamento, parceiro, categoria,
  valores/parcelamento do formulario, ACL, configuracoes de pagamento e fretes.
- Na SC, gerar-conta deixa de exigir gerar exclusivamente pelo pedido. Se existir
  lote compartilhado anterior, ele tambem nao bloqueia a criacao individual desta
  compra. O backend reconhece a compra por SolicitacaoCompra no servidor.
- Caminho manual avulso fora do card nao foi ampliado. Criacao de lotes
  compartilhados, compra direta, contratos, RH/DP, adiantamentos e recargas
  conservam seus fluxos especializados. Nao existem novas flags ou schema.
- Cada criacao mantem a auditoria normal. Pedido inclui criacao_independente na
  metadata. SC inclui hash da chave/payload e IDs criados no evento normal
  TITULO_FINANCEIRO_CRIADO, na mesma transacao; nao armazena payload/PIX em claro.
- O parent lock UPDATE e a consulta corrente no historico permitem devolver um
  envio anterior, inclusive apos restart. Chave igual/payload diferente para SC
  recusa a operacao. Chave nova permite outra obrigacao intencional.
- Frontend trava sincronicamente submit simultaneo, conserva a chave no retry e
  renova somente apos sucesso/novo formulario. Pedido exibe Criar novos titulos
  quando ja possui titulos. Cliente antigo da SC sem chave recebe orientacao para
  atualizar o formulario; publicar backend antes do frontend correspondente.

## Verificacao

14 suites backend/regressoes passaram, incluindo novo teste de SC, titulos por
pedido, cartao opcional, GEO, sobreposicao de outros fluxos, compartilhados,
reabertura/excluidos, renegociacao, carregamento OOM/paginacao/precisao, baixas
compostas e autorizacao do proprietario. Novo teste SQL SQLite :memory: valida
consulta de replay em instancia nova, isolamento por SC/usuario/chave, colisao de
payload e ausencia de escrita na consulta. Fixture de cartao ganhou apenas mock
do dominio puro pagamentoAutorizacaoValorDomain que faltava na base.

UI real com APIs interceptadas: pedido com legado quitado, criacao adicional,
erro/retry com chave igual, nova intencao com chave nova, busy e ACL de leitura;
SC com titulo quitado e saldo zero, submit duplo, erro/retry e titulo anterior
preservado. Nenhuma chamada externa inesperada/erro JS. Capturas desktop/mobile
em outputs/qa-compra-titulos-adicionais; testes executam apenas servidor local.
Build passou (662 modulos,14,46s; avisos preexistentes de Browserslist/chunk).

## Proximo passo

Solicitar ao operador o fluxo de publicacao desejado quando ele pedir commit/push.
Nao publicar automaticamente durante esta tarefa. Preparar pacote seletivo DEV
ou PROD somente no escopo autorizado, reconhecendo o overlay de reabertura em
producao. Nenhuma criacao financeira real faz parte do deploy.
