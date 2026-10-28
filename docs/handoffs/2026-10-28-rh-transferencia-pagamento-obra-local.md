# RH: transferencia operacional e pagamento na obra da solicitacao

## Autorizacao

Usuario confirmou em 28/10/2026 liberar transferencias de ativos mesmo com datas/historico divergentes, mantendo ACL/aprovacao/auditoria, e concluir pagamentos preparados na obra da solicitacao. Somente implementar/testar local; nao acessar EC2, alterar registros reais, publicar ou executar migration.

## Implementacao

- rhTransferenciaService.js: divergencias que geravam erro409 agora registram evento LOTACAO_HISTORICA_PRESERVADA e evidencia dados_json com motivos, vinculo consultado, origem/destino/data. Nao altera periodos divergentes, admissao/desligamento, salario ou financeiro. Atualiza obra atual na mesma transacao da aprovacao. Casos consistentes seguem registro normal/same-day; inativo, pedido obsoleto, origem/destino, ACL e aprovador continuam validados.
- rhPagamentoSolicitacaoService.js: procura rascunho proprio salvo antes de exigir lotacao atual para nova selecao. Salvar/enviar rascunho exige status ATIVO dos IDs ja registrados no pedido, sem exigir obra atual igual. Consulta de status seleciona somente ID, em transacao/lock; nao expande selecao para pessoas de outro local. Cadastro financeiro de transferidos permanece no snapshot do pedido, sem revelar dados atuais da nova obra. Titulos continuam usando s.obra_id; dados enviados pelo navegador nao mudam essa obra/base salarial.
- QAs existentes validarRhPessoalFluxo.js e validarRhPagamentoSolicitacao.js ampliados; sem novo runtime/coluna/tabela.

## Validacoes

- Baseline HEAD reproduziu ambos os bloqueios com os novos QAs, sem banco/rede.
- validarRhPessoalFluxo.js --transferencias PASS: seis divergencias com aprovacao bilateral e administrativa; replay concorrente; rollback de historico em ambos os caminhos; status inativo antes/depois do pedido; duas trocas no dia; ACL/lista/paginacao e fluxos existentes.
- validarRhPagamentoSolicitacao.js PASS: reabrir/salvar/enviar apos transferencia, salario/conta da nova obra nao expostos, salario/obra forjados ignorados, IDs estranhos/privacidade/escopo/inativo negados, DP gera um titulo na obra original com replay concorrente; titulos antigos byte a byte preservados. Regressoes de conferencia, vale/dinheiro, rascunho e fila aprovadas.
- validarRhPagamentoEnvioParcial.js, validarEscopoRhDpUsuarioObra.js, validarColaboradoresLocaisEscopos.js, validarRhLotacaoCadastro.js e validarRhPagamentoGerencial.js PASS com rede bloqueada.
- UI real de transferencias e pagamentos desktop/mobile PASS, incluindo workspace, conferencia, valores, recebimento e envio parcial.
- Sintaxe e git diff --check aprovados. Sem alteracao frontend nesta etapa.

## Limites e continuidade

Periodos divergentes ficam preservados, nao reparados. Relatorios/jornadas legadas que usam periodos continuam com o historico original; a movimentacao operacional fica na solicitacao auditada. Nenhum pagamento antigo e recalculado/movido. Implementacao nao publicada; quando autorizado, homologar primeiro no DEV com roteiro controlado pelo operador.

Usuario acrescentou pedido de salario restrito por colaborador e edicao da obra somente observacoes/documentos. Esse escopo sera registrado separadamente; nao esta implementado por este handoff.
