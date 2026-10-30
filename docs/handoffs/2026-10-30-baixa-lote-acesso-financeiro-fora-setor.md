# Correcao baixa em lote - solicitacao em outro setor

Base DEV79213894. Incidente informado em30/10/2026: baixa em massa de8titulos de mao de obra, solicitacao no setor OBRA, mensagem SOLICITACAO_FORA_DO_SETOR no Conferir lote. Nao acessamos servidor/banco.

Causa confirmada no codigo: baixaLoteSolicitacaoService usava assertPodeInteragirSolicitacao, destinado a acoes da etapa/conversa/anexos. Essa regra exige mesmo setor e nao existe no caminho canonico de baixarTitulo individual. O erro ocorria antes de montar previa e chamar baixarTitulo; a transacao faz rollback.

Correcao local em backend/src/services/baixaLoteSolicitacaoService.js: usar assertPodeVisualizarSolicitacao para a origem, manter permissao de operar aba e financeiro.titulos.baixar nas rotas, lista autorizada, ACL financeira individual carregarTituloParaBaixaComLock e baixarTitulo sob transacao. Sem opcoes de bypass. Titulo bloqueado por retorno da Obra, proprietario ou revisao DP continua bloqueado. Fila ativa/escopo/empresa/revisao/idempotencia permanecem.

backend/scripts/validarBaixaLoteSolicitacao.cjs: fixture agora usa solicitacao OBRA e usuario FINANCEIRO, e faz falhar qualquer uso da regra de etapa.9casos aprovados, incluindo previa, confirmacao, concorrencia/replay, rollback integral, sem acesso, bloqueios reais de titulo e adaptador real com models/servicos de fronteira simulados. Regressao cartao opcional, fila composta e estorno aprovadas com semRedeQa. Nenhum banco/rede real. Nenhuma mudanca de frontend/schema.

Ainda sem commit/push/deploy. Proximo passo: publicacao DEV isolada deste service e QA, depois homologacao e promocao isolada main. Nao reutilizar aplicador de historico ou do pacote original com hashes antigos. Pendencia antiga do handoff de posicionamento permanece separada. Sem qualquer baixa executada pelo agente.

## Publicacao autorizada
Usuario autorizou commit/push junto do comparativo recuperado. Aplicador seletivo DEV comparativo-baixa-20261030,sem SQL/migration ou baixa automatica. Permissao operar aba+baixar e escopo continuam obrigatorios; setor atual da solicitacao deixa de ser restricao extra. Confirmacao/preview e replay permanecem sujeitos a leitura da origem. Promocao main somente apos homologacao e pedido.
