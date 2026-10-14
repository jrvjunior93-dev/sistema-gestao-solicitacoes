# Previa e exclusao de rascunhos de pagamento - 14/10/2026

## Autorizacao e estado

Usuario pediu abrir pagamento sem criar rascunho; criar apenas ao Salvar ou
Conferido, e permitir excluir rascunhos. Confirmou: cada usuario exclui somente
seus proprios rascunhos. Implementacao local sem commit/push/EC2/banco real.
Branch codex/rhdp-pagamento50-transferencia-dp-20261014, worktree isolado
promocao-dp-main-20261014/Fluxy. Preservados pagamento50/transferencias/filtros
dos handoffs anteriores. Sem migrations ou alteracao de usuarios/permissoes.

## Fluxo

- POST /rh/pagamentos-solicitacao/preparar e somente leitura: carrega previa
  de colaboradores ativos do grupo/local, id/codigo nulos se nao existir
  rascunho proprio. Consulta rascunho existente sem regravar ou gerar historico.
- Edicoes anteriores ao primeiro save ficam na memoria do workspace; abrir,
  editar, voltar de aba ou fechar nao cria solicitacao. Editor de conta/reembolso
  tambem usa chave de previa em memoria, nao FK inexistente.
- Salvar ou Conferido verdadeiro (individual ou aplicar aos selecionados)
  chama POST /rh/pagamentos-solicitacao/salvar: criacao+campos no mesmo lock/
  transacao, chave idempotente/hash para primeiro save. Validacao com erro
  reverte registro/historico; replay nao duplica, chave com outro payload
  ou tentativa de sobrescrever rascunho concorrente exige reabertura.
- Cadastro/roster atuais revalidados antes de persistir. Resposta inicial
  atualiza os campos cadastrais de leitura sem substituir inputs em voo.
- Depois do primeiro save conserva autosave, revisoes e fluxo financeiro
  existente. Enviar exige primeiro Salvar/Conferido; nao cria implicitamente.
- DELETE /rh/pagamentos-solicitacao/:id/rascunho: somente autor, com Abrir
  solicitacao de pessoal e acesso local; somente RASCUNHO sem titulos.
  Lock do pedido e trava no frontend/confirmacao protegem contra repeticao.
  Exclui logicamente (CANCELADA + marcador), preservando autor/snapshot/historico;
  filtros/destaque ignoram excluido, e APIs especifica/generica negam seu detalhe.
  DP/SUPERADMIN nao excluem de terceiros. Nao altera titulo/baixa/anexo financeiro.
- Botao Excluir rascunho aparece dentro do modal salvo, segundo permissao do
  servidor. Cancelar confirmacao conserva o formulario; confirmar fecha modal,
  limpa sua memoria local e atualiza lista. Pagamentos enviados continuam com
  os fluxos de revisao/cancelamento financeiro anteriores, nao esta exclusao.
- POST raiz antigo permanece compativel para clientes legados; frontend
  novo nao o usa ao abrir. Publicar frontend/backend juntos, sem fallback
  para endpoint antigo de criacao automatica. Nenhuma migration.

## Arquivos desta tarefa

- backend/src/services/rhPagamentoSolicitacaoService.js
- backend/src/controllers/RhPagamentoSolicitacaoController.js
- backend/src/routes.js (somente tres rotas dedicadas)
- backend/src/services/rhSolicitacaoConsultaDomain.js
- backend/src/controllers/RhSolicitacaoController.js (guard de excluido)
- frontend/src/components/rh/RhDpPagamentoModal.jsx
- backend/scripts/validarRhPagamentoSolicitacao.js
- backend/scripts/validarRhPagamentoEnvioParcial.js (mock de crypto nativo)
- frontend/scripts/validarRhPagamento50UI.mjs (previa/salvamento/exclusao reais na UI)
- docs/modulos/rh-dp/README.md, ownership e este handoff

Alguns desses arquivos incluem trabalho pendente das duas tarefas anteriores;
nao revertê-lo nem incluir outputs/ ou a tarefa de caixa de outro worktree.

## Validacoes

- validarRhPagamentoSolicitacao.js: tres previas sem escrita, replay de save
  simultaneo, payload alterado rejeitado, primeiro save invalido com rollback,
  reabertura sem escrita, exclusao por terceiro negada, replay da exclusao
  com unico historico, ocultacao/404, titulos anteriores intactos, excluir
  enviado negado, novo pedido apos excluir, escopo local e pagamentos50/legado.
- validarRhPagamentoEnvioParcial.js, validarRhConsultaSalario.js e
  validarSegurancaAcessoDireto.js aprovados, sem banco/rede externa.
- validarRhPagamento50UI.mjs: individual/todos/selecionados, desktop/mobile;
  abrir/editar/retorno/fechar sem save; envio sem rascunho bloqueado; erro de
  primeiro save conserva input; retry/duplo clique; excluir confirmado/cancelado;
  nova abertura/conferido, workspace e 50% preservados. Screenshots em
  outputs/rh-pagamento-50/previa-*.png e rascunho-salvo-*.png.
- validarRhPagamentoSolicitacaoUI.mjs: regressao de autosave, moeda, diaria,
  reembolso, conferencias, parcial/revisao e workspace por ID desktop/mobile.
- Build e navegacao frontend; documentacao, sintaxe services/controllers/routes
  e git diff --check. Avisos preexistentes Browserslist/chunks grandes.

## Proximo passo

Quando usuario pedir commit/push, conferir origem/refactor/frontend e trabalho
concorrente; integrar apenas os arquivos das tres tarefas locais/handoffs,
excluindo outputs/ e caixa externo. Reexecutar testes focados/build; publicar
refactor/frontend e fornecer comandos EC2 dev/backend-dev, sem executar daqui.
Homologar abrir-fechar sem registro, salvar/conferido, exclusao propria e
pagamentos enviados antes de promocao main/producao (autorizacao separada).

Ownership liberado apos validacoes. Dados e alteracoes locais preservados.

Publicacao de todas as pendencias RH/DP autorizada pelo usuario, na
refactor/frontend com base e4ab208f. Backend comprovou previa sem escrita,
primeiro save atomico/replay e exclusao propria sem acesso a rascunho de terceiros.
UI desktop/mobile validou abrir/fechar sem registro, Salvar/Conferido, erro/retry,
duplo clique e Excluir rascunho com confirmacao. Regressoes de autosave/workspace,
pagamento50/tres modos, transferencias, ACL, treinamento, build/navegacao/docs
aprovadas. Sem migration nova/main/EC2. outputs/ permanece fora da publicacao.

Commit funcional local 61b92b3e pronto e testado. Push Git tradicional aguardou
autenticacao GCM e foi interrompido sem atualizar o remoto (conferido em e4ab208f).
Publicacao sera feita pela conexao GitHub autenticada, com arvore comparada ao
Git local e update fast-forward com expected_sha, sem force. O SHA publicado
pode diferir do local pelo autor/data do conector; o codigo sera identico.
Commit local original sera preservado na branch atual, sem reset; apos fetch
sera usada branch local nova apontando para o commit remoto publicado.
