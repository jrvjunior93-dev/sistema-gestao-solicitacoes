# Correcao de sobreposicoes e card financeiro - 19/10/2026

## Pedido e limites

Implementacao autorizada na refactor/frontend; simulacao das SOL-5426 e SOL-5419.
Sem EC2, banco real, migration aplicada, commit, push ou deploy. Nao aplicar
regularizacao automaticamente. Confirmar identidade comercial antes de qualquer
cancelamento. Nenhuma exclusao de titulo/movimento/alocacao.

## Base e preservacao do checkout

Checkout avancado por fast-forward de 3a1b2300 para origin/refactor/frontend
(d9f00c5d), que ja contem titulos compartilhados. Quatro documentos locais de
colaboracao preservados em stash nomeado e reaplicados. Conflito exclusivamente
em OWNERSHIP_ATIVO resolvido preservando conteudos locais e remotos; index limpo.
Stash mantido como recuperacao. Nenhuma alteracao alheia revertida.

## Implementacao

- Novo tituloSobreposicaoService: protecao de titulo avulso direto em geracao por
  pedido/lote; PAGAR manual nao contorna pedidos; excecao somente para contexto
  de Compra Direta validado no servidor, com protecoes proprias preservadas.
- Integracoes minimas em pedidoCompraFinanceiroService, tituloCompartilhadoService
  e tituloFinanceiroService. Revalidacao transacional no lote, sem inferencia
  automatica de duplicidade e sem esconder obrigacoes ativas.
- tituloRenegociacaoVinculos entrega copia resumida do original para o historico.
  Card separa resumo vigente/historico e detalha parcelas negociadas. Helper de
  envio recusa original projetado substituido e participacao compartilhada.
- Cancelamento existente recebe referencia opcional e estrita de substituicao.
  tituloRegularizacaoDomain valida solicitacao, credor e destinos validos;
  validator/service/auditoria preservam controle de versao, ACL, hash/replay e
  todos os bloqueadores. Referencia persistida em LogExclusao/SecurityEventLog,
  exposta no detalhe e no historico do card. Sem tabela/migration nova.
- UI de cancelamento com campo opcional de tipo/ID, sem ampliar permissao;
  trava de clique, rascunho, confirmacao, falha e retry mantidos.
- Canonico atualizado em docs/modulos/financeiro/README.md.

## Simulacao entregue

outputs/simulacao-regularizacao-titulos-20261019/Simulacao-regularizacao.html e
simulacao.json; segunda execucao em verificacao/ confirma a versao final.
Script backend/scripts/simularRegularizacaoTitulos.js importa apenas fs/path/
crypto/assert e dominios puros, jamais models/env/conexao.

| Solicitacao | Saldo antes | Saldo depois proposto | Referencia |
| --- | --- | --- | --- |
| SOL-5426 | 14.110,00 | 7.055,00 | TIT-010200 cancelado por substituicao pelo lote 1 |
| SOL-5419 | 4.691,67 | 1.876,67 | TIT-003948/3949/3950 cancelados por substituicao pela negociacao 3 |

Reducao 9.870,00; valor vigente proposto 7.055,00 e 2.815,00; liquidado da
SOL-5419 938,33. Zero movimentos criados, zero registros excluidos, acordos e
participacoes intactos; hashes dos arquivos de entrada inalterados. O simulador
recusa diretorio de saida existente e nao oferece argumento de escrita SQL.

## Validacoes

- Protecao de avulsos: parent lock, pagos/negociados, pedidos distintos conhecidos,
  legado/frete, falha fechada; lote real com avulso entre previa e confirmacao.
- Cancelamento real em memoria: ACL negativa, escopo, versao, rollback de log,
  fila/banco/origens, concorrencia serial/replay; referencias validas, outra
  solicitacao, outro credor, destino cancelado, payload invalido e idempotencia.
- Projecao/sincronizacao reais de negociacao: parcial, integral, estorno, historico
  original preservado e mesmo rateio por obra/pedido/contrato. Sem conexao SQL.
- Compra Direta fornecedor/frete, cartao e boleto opcionais/retry preservados.
  Fixtures atualizadas para carregar protecao real e fronteira CartaoBaixaParcela
  ausente no teste antigo, sem alterar runtime de cartao.
- UI real 1366/390: saldo sobreposto visivel, depois separado, parcelas com links,
  Obra sem links/acoes, historico, sem chamadas externas/escritas; screenshots em
  outputs/qa-card-financeiro-historico-20261019/, revisadas visualmente.
- UI de cancelamento: motivo/ref numerica, rascunho, Escape, confirmar/manter,
  duplo clique, falha/retry, versao e historico escapado.
- UI preexistente de atualizacao de solicitacao e modal compartilhado aprovadas.

## Limites e proximo passo

Confirmacao MySQL real de locks/concorrencia e homologacao DEV ainda pendentes;
fixtures nao substituem essa prova. Deadlock transacional deve abortar/repetir
operacao, jamais liberar geracao sem validacao. Snapshot nao contem todos os
bloqueadores de cancelamento; nao considerar simulacao autorizacao operacional.
Os oito status persistidos antigos dos pedidos nao foram regravados; suite do
sincronizador atual passou, sem reproduzir causa historica no servidor.
Proximo passo: revisao do delta e simulacao pelo usuario; publicacao/deploy e
regularizacao financeira sao passos separados, ainda nao executados.

## Encerramento e validacao final

- Build frontend final aprovado; log em outputs/simulacao-regularizacao-titulos-20261019/build-frontend.log.
  Avisos existentes: Browserslist antigo e chunks acima de 500 kB; nenhum erro.
- Sintaxe dos JS alterados/novos, documentacao (587 arquivos) e diff --check aprovados.
- Simulacao final em verificacao-final/ acrescenta assert de preservacao de todos
  os demais titulos e de todos os campos originais, alem dos hashes das fontes.
- Nenhum arquivo gerado de navegacao sofreu delta. Index vazio; sem commit/push.
- Ownership funcional/testes/documentacao desta tarefa liberado ao encerrar.

### Arquivos principais da tarefa

Backend: services/tituloSobreposicaoService.js, tituloRegularizacaoDomain.js,
tituloCancelamentoService.js, tituloCancelamentoAuditoriaService.js,
tituloCompartilhadoService.js, tituloFinanceiroService.js,
pedidoCompraFinanceiroService.js, tituloRenegociacaoVinculos.js;
validators/tituloCancelamentoValidator.js; scripts/simularRegularizacaoTitulos.js,
validarSobreposicaoTitulos.js, validarTitulosCompartilhados.js,
validarTituloCancelamento.js, validarTituloRenegociacaoVinculos.js,
validarCartaoOpcionalSolicitacao.js e validarPedidoBoletoOpcional.js.
Frontend: pages/SolicitacaoDetalhe/FinanceiroCard.jsx;
components/financeiro/HistoricoTitulosSolicitacao.jsx e CancelarTitulo.jsx;
utils/resumoTitulosSolicitacao.mjs e envioTitulosPagamento.js;
scripts/validarResumoTitulosSolicitacao.mjs, validarCardFinanceiroHistorico.mjs e
validarTituloCancelamentoUI.mjs. Canonico financeiro, handoff e registros de
colaboracao atualizados; arquivos locais anteriores preservados.

## Publicacao autorizada

Usuario autorizou commit e push das correcoes na refactor/frontend e comandos
para DEV, mantendo proibida a execucao de regularizacao. Origin conferida na
base d9f00c5d. O commit contem apenas o delta funcional, seus testes, este
handoff e README financeiro; outputs, extracoes e documentacao local anterior
nao sao publicados. Atualizacao DEV deve ser executada pelo usuario no checkout
/home/ubuntu/sistema-gestao-solicitacoes-dev, reiniciando somente backend-dev.
Sem migration nova e sem chamada a simulacao/cancelamento/regularizacao no deploy.
Preservar flags/ambiente do PM2; nao usar --update-env nesta atualizacao.
