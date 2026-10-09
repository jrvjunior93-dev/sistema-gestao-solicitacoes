# Recarga - total compacto na Nova Solicitacao

## Pedido e escopo

Exibir apenas o total automatico junto aos cartoes e retirar o card separado
de Valor para recarga, sem acrescentar mensagem explicativa fixa na tela.
Implementacao local na refactor/frontend. Usuario autorizou commit e push
somente nessa branch em 09/10/2026; main e deploy fora do escopo.

## Impactos conferidos antes da alteracao

- NovaSolicitacao.atualizarRecargasCartoes ja soma os valores individuais e
  atualiza form.valor/valorTexto. Esse calculo nao foi alterado.
- O payload continua incluindo form.valor e recargas_cartoes com os IDs e os
  valores individuais. O total nao foi removido dos dados nem das validacoes.
- recargaCartaoService.normalizarRecargas valida total igual a soma, e cria
  um titulo/recarga por cartao. Prestacoes, anexos, baixas, rateios/DRE e
  permissoes continuam com as regras existentes; nenhum backend foi editado.
- A condicao usa usaFluxoRecargaCartao, atendendo tipo e subtipo dos centros
  de custo. Outros fluxos continuam com o card Valor anterior.

## Arquivos

- frontend/src/pages/NovaSolicitacao.jsx: passa form.valor ao componente e
  oculta o card generico apenas para recarga; mantem exibirValor/validacao.
- frontend/src/components/recarga-cartao/RecargasCartoesFields.jsx: linha
  compacta Total solicitado com output BRL somente leitura, antes do contexto
  de cada cartao. Sem selecao exibe zero; nenhuma mensagem fixa adicionada.
- frontend/scripts/fixtures/recargasCartoes.jsx e
  frontend/scripts/validarRecargasMultiplasUI.mjs: cobertura de soma, mudanca
  de valor, remocao, nenhuma selecao, troca de origem, desktop/mobile e
  verificacao de wiring/payload da pagina por fonte.
- docs/workspace/OWNERSHIP_ATIVO.md: reserva desta tarefa encerrada.

## Validacoes

- npm run test:recargas-multiplas-ui: aprovado, componente real com APIs
  simuladas. Preserva os testes de prestacoes/anexos independentes existentes.
- node backend/scripts/validarRecargasMultiplosCartoes.js: aprovado, offline,
  sem models reais/banco/S3. Titulos, pagamento parcial/integral e anexos.
- npm run build: aprovado. Avisos preexistentes de Browserslist/chunks.
- npm run test:cadastro-obra-formulario e test:pagamento-medicao-legada:
  aprovados, preservacao dos fluxos especiais adjacentes.
- git diff --check: aprovado.
- Screenshots desktop/mobile inspecionados em outputs/qa-recargas-multiplas/;
  outputs/ preexistente permanece fora do escopo de commit.

## Limites e proximo passo

Nao houve alteracao de dados, migration, teste com backend real ou deploy.
O teste de navegador exercita o componente reutilizavel, nao todo o submit
real da Nova Solicitacao; wiring e preservacao do payload conferidos por fonte.
Proximo passo: usuario homologar na tela de Nova Solicitacao, selecionando
dois cartoes por obra/centro e conferindo o total. Publicacao autorizada
somente na refactor/frontend; esta tarefa nao pede migracao para main.

## Publicacao autorizada

Base local e origin/refactor/frontend 14421ece conferidas sem divergencia.
Main remota a06bdfdc permanece fora do escopo. Commit limitado aos dois
arquivos de UI, teste/fixture e documentacao desta tarefa; outputs/ excluido.
Validacoes da implementacao aprovadas; nenhuma alteracao funcional posterior.
UI de recargas e backend offline reexecutados antes do commit e aprovados.
