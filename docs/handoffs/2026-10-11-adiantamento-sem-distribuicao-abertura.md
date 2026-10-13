# Adiantamento: distribuicao somente na prestacao

## Escopo e autorizacao

Publicacao autorizada pelo usuario: commit e push das pendencias desta
conversa somente na refactor/frontend. Sem main, deploy, banco real ou
migrations executadas; auditoria de outra conversa e outputs/ fora do Git.

Usuario autorizou retirar o bloco e a obrigatoriedade de distribuicao na
abertura exclusivamente do subtipo com usa_fluxo_adiantamento=true. Trabalhos
na refactor/frontend sobre ca1ac5d3, sem commit/push, banco real, EC2 ou main.
Nao muda o centro de origem, visibilidade, categoria GEO, titulo ou fluxo de
autorizacao/fila. Sem migration adicional e sem reescrever registros antigos.

## Dependencias e implementacao

- NovaSolicitacao.jsx: a condicao do bloco, validacao e payload passam a
  excluir Adiantamento. Distribuicao previamente preenchida para uma despesa
  normal nao vaza no envio do Adiantamento ao trocar o subtipo. Trocar de volta
  preserva a selecao da despesa normal. Sem novas mensagens permanentes.
- SolicitacaoController.create: valida o subtipo existente e dispensa apenas
  sua distribuicao inicial. Payload residual/forjado com distribuicao neste
  subtipo recebe 400 e nao cria linhas de distribuicao. Despesas normais
  continuam passando pelo validador atual obrigatorio.
- adiantamentoService/prestacao: nao alterado. Cada despesa continua exigindo
  destino elegivel, valor e comprovantes proprios; apropriacao segue validada.
- Skill frontend-design usada para preservar componentes/organizacao atuais,
  reduzindo somente o campo indevido na etapa inicial.

## Validacoes

- validarAdiantamentoCentroCusto.js: bloco real do controller em VM isolada,
  sem distribuicao/consulta antecipada, payload residual recusado e despesa
  comum ainda obrigatoria. Validador real dos centros, envio/conferencia da
  prestacao, destinos/documentos invalidos, saldo/devolucao e custo preservados.
- validarAdiantamentoFinanceiro.js: titulo GEO, custos/relatorios, protecoes e
  executor de migration real isolado/idempotencia continuam aprovados.
- validarNovaSolicitacaoAdiantamento.mjs: pagina real em Chrome, transporte
  interceptado; ocultacao, troca para despesa comum e retorno, selecao preservada,
  ausencia da distribuicao no POST mesmo com estado residual, criacao positiva.
- validarAdiantamentoUI.mjs: prestacao/configuracao, negativas, upload/retry e
  mobile. Build, sintaxe, documentacao e git diff --check.
- Nenhum teste executa banco real; homologacao MySQL/dev continua pendente.

## Proximo passo

Se autorizado, commit/push somente destes ajustes na refactor/frontend e
atualizacao coordenada de backend/frontend dev. A migration anterior de
adiantamento ainda precisa estar aplicada; este ajuste nao adiciona outra.
Homologar os tres tipos de despesa, abertura sem distribuicao e posterior
prestacao com destino; despesa normal continua com distribuicao obrigatoria.
