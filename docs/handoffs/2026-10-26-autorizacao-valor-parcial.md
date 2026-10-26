# Autorizacao de parte do saldo pelo proprietario

## Escopo e estado

Implementacao local na branch `codex/autorizacao-valor-parcial-20261026`, baseada em `920f639c33ea3b7e8b6a1b9564862cd2bd8fd6e3`, no worktree `outputs/worktree-autorizacao-valor-parcial`. Sem commit/push/deploy desta tarefa. Producao, DEV, PM2, Nodes, ambientes, S3 e carga NSDOCS nao foram acessados nem modificados.

Decisao funcional confirmada pelo usuario: autorizar parte do saldo, mantendo o titulo original. Nao e desconto, alteracao do valor do titulo ou baixa financeira antecipada.

## Comportamento

- O proprietario pode reduzir o valor em cada titulo da selecao por obra, nos detalhes individuais e na visao por lote. A confirmacao coletiva mostra total, valor enviado e restante. Quantia positiva, ate o valor do dossie e cobrindo os encargos mais parte do principal.
- Opcoes e confirmacao da passkey transportam o mesmo valor. A assinatura/hash cobre o montante; alteracao entre as etapas, replay, revisao obsoleta ou troca de material impedem a decisao. ACL nominal, escopo, separacao preparador/autorizador, biometria e locks existentes permanecem.
- Snapshot e hash do dossie continuam imutaveis. `autorizacao_valor_json` guarda valor de referencia do dossie (`valor_original`, que pode ser o saldo de um titulo ja parcialmente pago), valor autorizado, limite desta fila, usuario e instante. O evento `ITEM_AUTORIZADO` recebe a auditoria.
- A fila mostra "Valor editado pelo proprietario", quantia autorizada, referencia anterior e limite. Valor de pagamento inicial respeita o teto. O backend verifica o teto na baixa simples, liquidacao rateada, baixa composta e aprovacao de divergencias.
- Pagar o limite inteiro conclui essa fila e pode manter o titulo PARCIAL. O saldo restante segue o fluxo normal para um novo dossie/autorizacao. Pagar menos que o limite conserva a divergencia/justificativa existente; devolver para a fila transfere apenas o orcamento ainda nao utilizado.
- Estorno restaura o limite da baixa estornada; nao libera todo o saldo do titulo. Auditoria e comprovantes originais permanecem. Sincronizacao de saldo e projecao de leitura nao ampliam o limite.
- Autorizacao integral sem edicao continua no comportamento legado (campo nulo). Regras de instrumentos, inclusive cartao de credito que exige quitacao integral, nao foram flexibilizadas; o executor escolhe instrumento permitido para o pagamento parcial.
- Novo filtro no painel por obra: `Solicitacao`, por codigo ou descricao, incluindo origens de titulos compartilhados. SQL parametrizado, curingas literais, EXISTS sem multiplicar totais, paginacao e leituras seriais. Na Fila de Pagamentos o filtro `Solicitacao` ja existia e foi preservado.

## Arquivos principais

- Backend: `pagamentoAutorizacaoValorDomain.js` (novo), `pagamentoAutorizacaoSelecaoService.js`, `pagamentoAutorizacaoService.js`, `pagamentoAutorizacaoConsultaService.js`, `pagamentoManualFilaService.js`, `pagamentoFilaSaldoService.js`, `filaBaixaCompostaService.js`.
- Modelos: `PagamentoAutorizacaoItem.js`, `PagamentoManualFilaItem.js`.
- Frontend: `ValorAutorizacao.jsx` (novo), `AutorizacoesPorObra.jsx`, `AutorizacaoTituloDetalhe.jsx`, `FinanceiroAutorizacoesPagamento.jsx`, `FinanceiroFilaPagamentos.jsx`, servico de autorizacao, revisao dos rascunhos de fila e estilos operacionais.

## Schema preparado, nao aplicado

`backend/migrations/202610260001_pagamento_autorizacao_valor.js`: somente duas colunas JSON anulaveis. Usa o contrato `{queryInterface, DataTypes}` do runner financeiro. Confere ambas as tabelas antes da primeira DDL, e repetivel, sem backfill/UPDATE/DELETE. `down` recusa exclusao destrutiva da trilha financeira.

Publicacao futura exige um aplicador restrito a essa migration e confirmacao atual de backup/manutencao. Nao rodar todo o conjunto de migrations pendentes de producao indiscriminadamente. Preparar backend, aplicar somente essa migration antes de reiniciar o backend atualizado, conferir e so depois liberar frontend. Homologar primeiro em DEV com autorizacao propria; nao reutilizar scripts/guardas antigos de outros pacotes ou da captura NSDOCS.

## Validacoes locais

- `validarAnaliseProprietario.js` incorpora os casos novos de `validarAutorizacaoValorParcial.js`: selecao/individual, valores adulterados, limite nominal, referencia/hash e titulo preservados, replay e entradas invalidas; mantem ACL, biometria, concorrencia e rollback de lotes.
- `validarFilaBaixaEstorno.js` incorpora `validarFilaValorParcial.js`: teto antes de baixa, encargos, saldo original, replay, estorno e reabertura com limite residual.
- `validarFilaBaixaComposta.js`: teto no preview/confirmacao, auditoria na versao, pagamento parcial autorizado e estorno do grupo preservando limite.
- `validarAutorizacaoValorSchema.js`: schema aditivo/repetivel e falha antes da escrita se tabela ausente. `validarFilaJurosMulta.js`: edicao/sincronizacao nao aumenta limite.
- `validarPainelAutorizacoesSqlLocal.js`: CTE real em SQLite em memoria, 650 titulos, filtro por solicitacao direta/compartilhada, caracteres literais, pagina, tentativa de injecao e regressao de totais. Nao substitui EXPLAIN/MySQL na homologacao.
- Regressao backend: painel, liquidacao rateada, estorno/permissoes, titulos por pedido, sobreposicao, vinculos NF-e e auditoria granular.
- Navegador com APIs/biometria simuladas: `validarAutorizacoesPorObra.mjs` (valores coletivos/individuais, correcao de entrada invalida, filtro, 130 selecionados, concorrencia, mobile); `validarAutorizacaoPwa.mjs` (shell, lotes, Android/iOS, 320x568/390/768/1366); `validarFilaInstrumentosUI.mjs --valor-parcial` (default/teto/observacao, validacao e baixa normal).
- Build frontend e `git diff --check`.

Evidencias e imagens em `outputs/` deste worktree. Testes com modelos/transportes simulados e SQLite descartavel, sem credenciais, banco externo ou chamadas AWS/NSDOCS. Biometria real, DDL/concorrencia MySQL e confirmacao visual pelo proprietario ainda dependem de homologacao autorizada.

Teste legado `validarAutorizacaoConsultaSql.js` ja falha na base `920f639c` por stub ausente de `pagamentoAutorizacaoSituacao`; reproduzido na base e preservado fora deste escopo. Cobertura atual de consulta usa `validarPainelAutorizacoes.js` e `validarPainelAutorizacoesSqlLocal.js`. Avisos existentes de Browserslist e chunk grande nao foram alterados.

## Publicacao DEV autorizada em 26/10/2026

Usuario autorizou commit e push em `refactor/frontend` e solicitou comandos de atualizacao EC2 DEV. Pacote copiado para `outputs/worktree-autorizacao-valor-dev`, branch `codex/autorizacao-valor-dev-20261026`, base `f05705e3`; arquivos funcionais tocados possuem a mesma base da implementacao original. Commit de backend separado do frontend para preservar ordem de implantacao. A main nao e alvo desta publicacao.

Leitura SSH confirmou DEV em `a78a5b1b`, branch correta e rastreados limpos. Aplicador novo confere tambem o backlog exato ate f05705e3. `autorizacaoValorDevSchema.js` permite somente as duas colunas JSON novas; valida a migration NSDOCS 003 equivalente a 001 sob guarda somente leitura e registra compatibilidade no ledger, sem DDL ou dados fiscais. Outras pendencias param. Tipos esperados do alias normalizados para MySQL (JSON e DATETIME), com teste do alias real. Instrucoes em `ops/deploy/README-autorizacao-valor-dev-20261026.md`.

Aplicador preserva pares/env/Nodes/dumps/systemd; restart apenas backend-dev depois do schema. Testes locais cobrem falha parcial/retomada, UUID/TLS, ledger, alias sem DDL e manifesto. Nenhuma migration, reinicio ou escrita externa foi executada pelo agente. Apenas Git/branch/status foram consultados na EC2.

## Proximo passo exato

Publicar primeiro o commit de backend e fornecer SHA/comandos. Usuario aplica e envia a conferencia `AUTORIZACAO_VALOR_BACKEND_DEV_PRONTO`; somente entao publicar o commit de frontend ja autorizado. Nao aplicar pelo agente, retomar captura, alterar flags ou executar SQL financeiro. A carga NSDOCS permanece pausada, sem mudanca de planos/locks/historico.
