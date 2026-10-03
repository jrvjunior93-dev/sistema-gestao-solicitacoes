# Prestacao responsiva e retorno apos quitacao — 2026-09-01

## Interface

O componente compartilhado da prestacao de contas estava limitado a duas das doze colunas da
Nova Solicitacao e ainda exigia uma tabela com largura minima de 760px. No detalhe havia espaco
suficiente, mas na criacao os controles eram comprimidos e parte da linha ficava inacessivel.

O bloco agora ocupa a largura integral do formulario e usa linhas responsivas:

- celular: campos empilhados e rotulados;
- tablet: duas colunas;
- desktop: obra, apropriacao, valor e acao na mesma linha;
- resumo e botao de envio se adaptam sem rolagem horizontal obrigatoria.
- valores de rateio aparecem em moeda brasileira (`R$ 3.000,00`) e alternam para o numero
  editavel somente enquanto o campo esta em foco.

O formulario de prestacao permanece no detalhe e tambem aparece na Nova Solicitacao quando a
recarga anterior esta `PENDENTE` ou `REJEITADA` e ja voltou ao setor do usuario. Assim, a
prestacao pode ser concluida sem abandonar o fluxo de abertura da proxima recarga.

## Nova recarga bloqueada por ciclo anterior

O contexto do cartao agora inclui a regra oficial de interacao da solicitacao anterior: setor
atual, setor do usuario, permissao de solicitar retorno e eventual pedido pendente.

Na Nova Solicitacao:

- enquanto o titulo esta em `PREVISAO`, `ABERTO` ou `PARCIAL` e ainda nao existe prestacao,
  mostra `Aguardando baixa` em vez de sugerir retorno manual;
- acompanha esse estado a cada seis segundos e, quando a baixa criar a prestacao e devolver a
  solicitacao para a Obra, revela o formulario na mesma tela sem exigir recarga do navegador;
- se a solicitacao anterior estiver fora do setor, explica que ela precisa retornar e permite
  solicitar o retorno com motivo, quando o usuario possui a permissao granular;
- se ja existir pedido, mostra `Retorno solicitado` e o motivo enviado;
- quando a solicitacao voltar ao setor do usuario e houver prestacao disponivel, exibe os rateios
  na propria tela; para outros bloqueios, oferece `Abrir e editar solicitacao`;
- orienta que quitacao integral, parcial ou valor efetivo diferente do solicitado exige concluir
  a prestacao no registro anterior antes de uma nova recarga;
- o botao de criar permanece bloqueado somente ate a prestacao fechar exatamente o valor
  efetivamente recarregado e ser enviada;
- `ENVIADA` libera imediatamente a proxima recarga; a validacao do GEO continua ocorrendo em
  paralelo e e responsavel por liberar os rateios para os relatorios das obras.

Ao enviar a prestacao, a solicitacao anterior muda para o setor GEO com status `PENDENTE`, gera
historico, notificacao e evento em tempo real. A fila do GEO passou a ordenar por `updatedAt`,
garantindo que a demanda movimentada volte ao topo sem alterar artificialmente sua data de criacao.
Se o GEO rejeitar, a solicitacao retorna automaticamente ao setor criador para correcao. Se
validar, o ciclo da recarga fica `VALIDADA`, o titulo recebe os rateios e a solicitacao fica
`APROVADA`.

Prestacoes que ja estavam `ENVIADA` antes desta regra podem ser auditadas e corrigidas pelo script
`reconcile:recarga-prestacoes`. Ele roda em simulacao por padrao, aceita `--solicitacao=<id>` para
limitar o alvo e somente grava com `--confirm`.

## Retorno ao setor criador

Toda sincronizacao central de baixa verifica os titulos quitados vinculados a solicitacao. Para
cada titulo ainda nao processado:

- localiza o primeiro evento `SOLICITACAO_CRIADA` e usa o setor fotografado nele;
- em solicitacoes legadas sem essa acao, usa o primeiro evento auditavel que possua setor;
- devolve a solicitacao ao setor criador quando ela estiver em outro setor;
- registra `ENVIADA_SETOR` com metadata da automacao e IDs dos titulos quitados;
- quando a solicitacao ja esta na origem, registra apenas a confirmacao auditavel;
- expira pedidos de retorno pendentes que perderam o objeto com a movimentacao automatica;
- nao repete a movimentacao em retries de baixa ou conciliacao.

A regra passa pelo sincronizador compartilhado e cobre baixas comuns, conciliacao, Recarga de
Cartao e contratos do fluxo novo.

## Arquivos alterados

- `frontend/src/components/recarga-cartao/RecargaCartaoFields.jsx`
- `frontend/src/components/recarga-cartao/PrestacaoRecargaCartao.jsx`
- `backend/src/controllers/RecargaCartaoController.js`
- `backend/src/controllers/SolicitacaoController.js`
- `backend/src/services/recargaCartaoService.js`
- `backend/src/services/solicitacaoFinanceiroStatusService.js`
- `backend/scripts/validarRecargaCartao.js`
- `backend/scripts/reconciliarPrestacoesRecargaEnviadas.js`
- `backend/package.json`

## Validacoes

- build do frontend aprovado: 373 modulos;
- teste responsivo aprovado: 204 rotas;
- `node --check` aprovado nos servicos, controllers, QA e reconciliacao de recarga;
- `git diff --check` aprovado;
- QA transacional ampliado para conferir retorno `FINANCEIRO -> OBRA`, idempotencia do retry,
  envio para `GEO/PENDENTE` e liberacao da proxima recarga antes da validacao;
- execucao local do QA depende de credenciais MySQL, ausentes neste workspace.

Nao houve migration.

## Edicao apos retorno (01/09/2026)

- Uma recarga sem baixa que voltou ao setor solicitante pode ter valor e data prevista corrigidos
  na propria tela de Nova Solicitacao; a data deve ser igual ou posterior ao dia atual.
- Ao salvar, o mesmo registro e reenviado para `GEO/PENDENTE` e cartao, valor e data do formulario
  de nova solicitacao sao limpos.
- A atualizacao e transacional entre solicitacao, titulo financeiro e controle da recarga. A API
  recusa a edicao depois de qualquer baixa ou depois da abertura da prestacao de contas.
- O titulo volta para `PREVISAO` no reenvio e somente reabre para pagamento apos a nova aprovacao,
  evitando baixa do valor corrigido antes da conferencia do GEO.
- Build do frontend e teste responsivo (204 rotas) aprovados; `node --check` aprovado nos arquivos
  de backend. O QA transacional contempla a edicao, mas sua execucao local segue bloqueada pela
  ausencia das credenciais MySQL no workspace.

## Correcao de destino contabil pelo GEO (01/09/2026)

- Enquanto a prestacao esta `ENVIADA` e aguarda validacao, o GEO pode corrigir a obra/centro de
  custo e a apropriacao de cada rateio diretamente no card da prestacao.
- Os valores e a quantidade de linhas permanecem bloqueados nessa etapa; somente o destino
  contabil pode ser alterado.
- A API confere setor, status, ids das linhas, vinculo da obra com o solicitante e pertencimento da
  apropriacao a obra. A alteracao e transacional e deixa historico com valores anteriores e novos.
- Validar ou rejeitar fica bloqueado no frontend enquanto houver mudancas de destino ainda nao
  salvas. Depois da validacao, o rateio continua imutavel por este fluxo.
