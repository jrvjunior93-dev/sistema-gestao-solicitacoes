# Parcelas visiveis e titulo da medicao no envio

## Pedido e estado

Usuario relatou em dev: abrir Financeiro exigia segundo clique nas parcelas;
apos aprovar, parcela ABERTO, mas modal sem titulo elegivel e botoes desabilitados.
Implementacao na refactor/frontend sobre c75fc396. Usuario autorizou commit/push
somente nesta branch para testar em dev. Sem migration, deploy, banco real
ou atualizacao retroativa executados pelo agente nesta tarefa.

## Diagnostico e impacto

O DTO de parcelas resolve situacao pelo titulo associado, mas o modal procurava
esse ID exclusivamente na consulta generica por solicitacao_id. Duas leituras
independentes, e titulos vinculados ao contrato podem faltar na lista generica
em cadastros legados. Teste reproduz essa ausencia. Nao se confirmou a causa
especifica no banco staging nem se fez correcao de vinculos historicos.
Nao converter status da parcela em status do titulo no frontend.

## Correcao

- PrevisoesContrato sem recolhimento adicional: aparece ao abrir Financeiro.
  data-bloco-nao-alternar protege contra recolher o pai ao clicar na tabela.
  BlocoConteudo global nao foi alterado; padrao compacto existente preservado.
- listarParcelasDoContrato le tipo/status/saldo/renegociacao do titulo real e
  consulta fila em lote, sem N+1. Novo titulo_pagamento resume somente ID, tipo,
  status, saldo e IDs/status de fila; nao expoe dados bancarios/documentos.
  Sem titulo associado, resumo null. Renegociado nao volta a ser elegivel pela
  projecao do saldo/status; nao se envia o titulo original renegociado.
- FinanceiroCard/modal e hook de envio usam a mesma lista complementada pelo
  resumo das parcelas, apenas no contrato novo dono da solicitacao e ID
  correspondente. Nao usar resumo de outro contrato nem inferir titulo.
- Consultas de parcelas/titulos com cache no-store para atualizacao apos aprovar.
- Permissoes separadas, aprovacao com anexos, retorno a Obra, saldo positivo,
  ABERTO/PARCIAL, bloqueio por fila ativa, chave de retry e trava compartilhada
  mantidos. Backend dos endpoints de envio continua revalidando em transacao.

## Validacoes

- test:medicao-recarga-envio: DTO real executado em VM com models simulados,
  resumo ABERTO, PREVISAO, ausencia de titulo, fila ativa, renegociacao e consulta
  em lote; regressao aprovacao/recarga/relatorios/autorizacao. Sem banco/rede.
- test:medicao-recarga-envio-ui: pagina/modal reais com APIs simuladas, parcelas
  visiveis sem segundo clique, clique no subcard preserva pai, lista generica
  vazia com titulo vinculado aberto envia somente a medicao e impede replay;
  permissoes, OFF, cancelamento, retry, duplo clique, desktop/mobile.
- Build frontend e node --check nos servicos aprovados; diff --check aprovado.
- Regressao test:cartao-opcional-solicitacao-ui aprovada. Captura mobile
  inspecionada, sem transbordamento horizontal nem perda das acoes.
- outputs/ preservado fora do Git. Avisos anteriores Browserslist/chunk >500kB.

## Proximo passo

Publicacao autorizada somente na refactor/frontend. Atualizar backend e frontend
dev juntos: o resumo novo exige backend atualizado, sem migration nova.
Conferir medicao ja aprovada sem aprovar novamente. Se persistir ausencia,
consultar em leitura ID da parcela/titulo, tipo/status/saldo/fila e respostas das
duas rotas antes de autorizar qualquer reparo de dados. Main fora desta etapa.
