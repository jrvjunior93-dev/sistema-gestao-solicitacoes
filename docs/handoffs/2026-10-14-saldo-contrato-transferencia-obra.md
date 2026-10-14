# Saldo de contrato e solicitacao de transferencia pela Obra

## Estado e autorizacao

- Data cliente 14/10/2026, America/Sao_Paulo. Sem delegacao.
- Branch codex/contrato-saldo-transferencia-obra-20261014 sobre refactor/frontend
  208ae8e2, no worktree promocao-dp-main-20261014/Fluxy reutilizado.
- Usuario autorizou reprogramar saldo remanescente para novas medicoes; esclareceu
  que usuario da Obra nao deve depender de Editar contratos.
- Ampliou transferencias: todos usuarios da Obra solicitam; responsavel da outra
  obra aprova, ou do destino sem origem. DP/SUPERADMIN com bypass de decisao.
- Implementacao local concluida e validada; ownership liberado.
- Usuario autorizou commit/push destes dois ajustes na refactor/frontend e comandos
  para homologacao na EC2 dev. Remoto conferido em 208ae8e2 antes da publicacao.
  Sem promocao main, execucao EC2, migration, banco real, configuracao de usuarios
  ou reinicio pelo agente. outputs/ e alteracoes de caixa continuam fora do commit.

## Contrato

- Service/controller dedicados e GET/POST saldo-reprogramacao sob modulo/ACL.
- Valor disponivel = saldo contratual menos o que ja tem parcela livre;
  nao usar valor_previsto como saldo nem duplicar previsoes existentes.
- Cronograma em centavos, soma exata, vencimentos/justificativa e limite de 24.
- Transacao/lock do contrato e parcelas, referencia contra saldo obsoleto,
  idempotencia persistida no historico existente. Criacao pelo helper financeiro
  real com PREVISAO, categoria, solicitacao, apropriacao/rateios e vinculo da parcela.
- Pagamentos/medicoes/parcelas existentes, valor/aditivos do contrato intactos;
  posterior medicao/aprovacao segue fluxo existente. Rollback integral em falha.
- Interface inline reutiliza componentes/estilos corporativos; sem modal novo,
  sem enviar o formulario de Nova Solicitacao ao confirmar parcelas. Moeda BR
  convertida em numero, duplo clique bloqueado, resposta de contrato antigo ignorada.
- Se salvar e o reload falhar, tentar novamente so recarrega sem recriar previsoes.

## Transferencias

- Config retorna obras_solicitacao_ids separado de obras_responsavel_ids e
  bypass_decisao. Permissao rh_dp.solicitacoes.abrir continua obrigatoria para pedir.
- User comum pode representar origem vinculada ou pedir para destino vinculado,
  nunca inventar obra/autor/data no payload. Pedido fica ABERTA, sem lotacao imediata.
- Outra obra aprova; sem origem aprova destino. Responsabilidades/DP conferidos
  no backend em cada decisao. Autor continua sem autoaprovacao.
- DP bypass apenas de aprovar/rejeitar; nao pode cancelar pedido de terceiros
  sem responsabilidade. SUPERADMIN preserva excecoes antigas.
- Leitura de pedido/detalhe/leituras limitada a obras vinculadas para comum;
  DP global sem expandir usuario operacional OBRA que acumule setor DP.
- Datas admissao/demissao, historico/vinculo atual, duplicacao por colaborador,
  transacao/locks e aprovacao automatica legitima antiga preservados.

## Arquivos

- backend/src/services/contratoSaldoReprogramacaoService.js e controller dedicado;
  routes.js somente duas rotas contrato e gate abrir transferencia/comentario.
- backend/src/services/rhTransferenciaService.js.
- Teste novo validarContratoSaldoReprogramacao.js; validarRhPessoalFluxo.js e
  validarColaboradoresLocaisEscopos.js com fixtures/regras novas.
- BlocoMedicaoContrato.jsx, novo ReprogramarSaldoContrato.jsx e services/contratos.js.
- RhDpTransferencias.jsx; novo teste UI de saldo, teste transferencias e fixture
  validarPagamentoMedicaoLegada.mjs; READMEs, ownership e este handoff.
- outputs/ e alteracao de caixa em outro worktree fora do escopo/commit.

## Validacoes e proximo passo

- Backend saldo/ACL/centavos, replay concorrente, rollback financeiro/auditoria,
  pagamentos intactos; transferencias comum/origem/destino/sem obra/DP/SUPERADMIN,
  autor/nao responsavel/sem permissao/obra divergente e cancelamento do autor aprovados.
- Escopos locais, seguranca direta (2304 comparacoes/47 rotas), DP/salario,
  medicao/recarga mais recente, vigencia/negociacao de aditivo aprovados.
- UI saldo desktop/mobile e transferencia comum/DP, duplo envio e moeda numerica
  aprovados. Capturas locais inspecionadas. Build aprovado, avisos preexistentes
  de Browserslist/bundle. Fixture UI corrigida (transformacao JSX e seletor de
  checkbox por parcela), sem mudar regra para passar teste.
- UI legado (boletos multiplos/PIX/transferencia desktop/mobile), navegacao,
  documentacao, diff/sintaxe e regressao final aprovados. Enter em campo inline
  nao envia Nova Solicitacao. Novo script testa limite do cronograma e guards das rotas.
- Permissao final do saldo: OBRA + acesso ao contrato + solicitacoes.acoes.criar,
  ou contratos.geral.editar estrita/SUPERADMIN; nao exigir gestao a usuario da Obra.
- No diagnostico inicial a ausencia de responsavel explicava o botao oculto;
  usuario autorizou explicitamente separar pedir de aprovar. Nao cadastrar
  usuarios como responsaveis nem conceder permissoes globais para contornar.
- Fixtures backend de escopo atualizadas: o diretorio de ativos e global; filtro
  local restringe transferencias, nao o diretorio profissional. DP com Obra
  operacional acumulada continua sem bypass; negativo incluido no teste.
- Homologacao MySQL real/concorrencia entre processos e permissao efetiva em dev
  necessarias depois de publicacao autorizada. Sem nova migration/dependencia/flag.
- Publicacao autorizada: conferir remoto e stagear arquivos explicitos, sem outputs/.
  Comandos dev devem conferir branch/SHA, arquivos versionados limpos, ausencia de
  delta de migrations/dependencias, UUID do banco dev, schema somente leitura e
  processo/porta do checkout. Reiniciar somente backend-dev; homologar antes de
  pedir promocao para main. Nao executar estes comandos na EC2 pelo agente.
