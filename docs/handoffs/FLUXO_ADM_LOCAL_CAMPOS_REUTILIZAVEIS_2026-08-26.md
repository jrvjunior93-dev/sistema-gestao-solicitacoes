# Handoff — Campos reutilizaveis do ADM Local de Obra

Atualizado em: 2026-08-26 10:06:02 -03:00

## Escopo concluido

O tipo `ADM LOCAL DE OBRA` passou a usar, por padrao:

- `Titulo da solicitacao`, persistido no campo legado `descricao`;
- `Justificativa` separada do titulo;
- `Credor` e `Favorecido do pagamento` como cadastros distintos;
- `Forma de pagamento`, usando a lista curada nas configuracoes do sistema.

Os campos `Justificativa`, `Favorecido` e `Forma de pagamento` foram implementados como campos
genericos. Nos demais tipos eles ficam inicialmente ocultos, mas podem ser habilitados por area,
tipo e subtipo em `Configuracoes > Campos da Nova Solicitacao`. No ADM Local, aparecem e sao
obrigatorios por padrao; a configuracao pode ocultar ou tornar opcional cada campo.

O novo fluxo de contrato continua usando seus campos estruturais proprios e nao recebe os campos
genericos duplicados.

## Persistencia e integracoes

- `solicitacoes.descricao` foi preservado e somente ganhou o rotulo funcional `Titulo`;
- foram adicionadas as colunas anulaveis `justificativa`, `favorecido_id` e
  `forma_pagamento_id`;
- foram criadas as FKs curtas `sol_favorecido_fk` e `sol_forma_pagamento_fk`;
- a tela de detalhes exibe credor, favorecido, forma e justificativa quando informados;
- a criacao manual de titulo financeiro inicia com a forma escolhida na solicitacao;
- a curadoria antes chamada de formas da medicao passou a atender Nova Solicitacao, contrato e
  medicao, mantendo a chave e o endpoint legados por compatibilidade;
- o formulario do novo contrato tambem passou a respeitar essa lista curada.

## Migration

Migration aplicada no banco local compartilhado:

- `202608260051_solicitacao_justificativa_favorecido_forma.js`

A primeira tentativa criou as colunas, mas o MySQL recusou a primeira FK porque a copia do banco
contem um valor legado `data_fim_medicao = 0000-00-00`. A migration foi ajustada para retirar o
modo estrito somente da conexao usada na criacao das FKs e restaurar o modo original no `finally`.
O dado legado nao foi alterado. A segunda execucao concluiu e o registro foi gravado em
`schema_migrations`.

## Validacoes executadas

- build de producao do frontend aprovado, com 364 modulos transformados;
- `node --check` aprovado em todos os arquivos backend alterados e na migration;
- regras puras confirmaram os defaults do ADM e a separacao do fluxo novo de contrato;
- regras puras confirmaram que as configuracoes por area/tipo conseguem ocultar no ADM e habilitar
  os mesmos campos em outros tipos;
- payload da tela de configuracao confirmado com `Titulo`, `Justificativa`, `Favorecido` e
  `Forma de pagamento`;
- leitura da lista curada confirmada no banco local, com 9 formas disponiveis;
- associacoes `Solicitacao.favorecido` e `Solicitacao.formaPagamento` carregadas sem conflito;
- banco confirmado com as tres colunas, as duas FKs, a migration registrada e o `sql_mode`
  original restaurado;
- `git diff --check` sem erros.

Nenhuma suite de QA que escreve no banco foi executada e nenhum dado operacional foi criado,
apagado ou normalizado.

## Estado operacional e proximo passo

O backend local nao foi reiniciado para nao interromper outra sessao na porta 8100. Se houver um
processo antigo em execucao, ele precisa ser reiniciado com aviso previo aos demais agentes antes
do teste visual. O proximo passo funcional e validar no navegador:

1. `Configuracoes > Campos da Nova Solicitacao`, selecionando uma area e `ADM LOCAL DE OBRA`;
2. a exibicao e a obrigatoriedade dos quatro campos na Nova Solicitacao;
3. a criacao de uma solicitacao ADM em um cenario controlado, somente depois do aviso de escrita
   no banco compartilhado.

## Arquivos do fluxo

- `backend/migrations/202608260051_solicitacao_justificativa_favorecido_forma.js`
- `backend/src/controllers/ContratoFluxoNovoController.js`
- `backend/src/controllers/SolicitacaoController.js`
- `backend/src/models/Solicitacao.js`
- `backend/src/models/index.js`
- `backend/src/services/formasPagamentoMedicaoService.js`
- `backend/src/services/novaSolicitacaoCamposConfig.js`
- `backend/src/services/tipoSolicitacaoBehaviorService.js`
- `frontend/src/components/solicitacoes/ParceiroBuscaRemota.jsx`
- `frontend/src/pages/ConfiguracoesContratoAlertasEFormas.jsx`
- `frontend/src/pages/NovaSolicitacao.jsx`
- `frontend/src/pages/NovaSolicitacaoCamposConfig.jsx`
- `frontend/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx`
- `frontend/src/pages/SolicitacaoDetalhe/Header.jsx`
- `frontend/src/services/contratos.js`
- `frontend/src/utils/novaSolicitacaoCampos.js`
- `frontend/src/utils/tipoSolicitacao.js`
