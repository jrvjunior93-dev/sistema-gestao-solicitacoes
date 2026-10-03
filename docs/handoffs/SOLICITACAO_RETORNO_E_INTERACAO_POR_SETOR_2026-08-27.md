# Retorno de solicitacao e interacao por setor — 2026-08-27

## Resultado

Foi implantada a regra de que uma solicitacao pode ser alterada somente por usuario que:

1. tenha visibilidade sobre ela pelas regras ja existentes; e
2. pertenca operacionalmente ao setor em que ela esta.

Setores extras configurados apenas para visualizacao nao liberam escrita.

## Operacoes protegidas

- adicionar e remover comentario;
- adicionar e remover anexo;
- registrar medicao de contrato do fluxo novo;
- solicitar termo aditivo de contrato do fluxo novo;
- controles de edicao exibidos no detalhe (status, envio, apropriacoes, itens e pendencia financeira).

No modo `CRIACAO`, contratos do fluxo novo cuja solicitacao esta em outro setor deixam de ser
oferecidos pela API, evitando que o usuario monte uma medicao que sera recusada ao enviar.

## Pedido de retorno

Persistencia: `solicitacao_pedidos_retorno`, migration
`202608270050_solicitacao_pedidos_retorno.js`.

Endpoints:

- `POST /api/solicitacoes/:id/retorno`;
- `POST /api/solicitacoes/retornos/:pedidoId/decisao`;
- `POST /api/solicitacoes/retornos/:pedidoId/cancelar`.

Regras:

- motivo obrigatorio ao solicitar;
- um retry devolve o mesmo pedido pendente, sem duplicar;
- aprovacao e rejeicao exigem que a solicitacao ainda esteja no setor fotografado no pedido;
- rejeicao exige motivo;
- aprovacao preserva o status e move apenas o setor;
- aditivo pendente na Gerencia de Processos bloqueia a devolucao ate a decisao do aditivo;
- o solicitante pode cancelar enquanto o pedido estiver pendente;
- decisoes concorrentes usam lock da solicitacao e do pedido em transacao;
- falha no canal de notificacao nao transforma uma decisao ja confirmada em erro HTTP para retry.

## Permissoes e notificacoes

Novas permissoes no cadastro granular:

- `solicitacoes.retorno.solicitar`;
- `solicitacoes.retorno.decidir`.

Usuarios sem matriz granular configurada seguem o fallback historico do sistema; usuarios com
matriz configurada precisam receber as chaves acima. Os destinatarios de decisao sao filtrados por
setor, permissao e pela mesma regra de visibilidade do detalhe.

Eventos adicionados:

- `RETORNO_SOLICITADO`;
- `RETORNO_APROVADO`;
- `RETORNO_REJEITADO`;
- `RETORNO_CANCELADO`.

O sino atualiza a cada 30 segundos e tambem quando a janela volta ao foco. Pedido novo aparece com
o marcador `Acao necessaria` e abre diretamente a solicitacao.

## Interface

O detalhe recebeu uma faixa operacional compacta abaixo do cabecalho:

- fora do setor: explica o modo somente acompanhamento e permite solicitar/cancelar retorno;
- no setor atual: lista pedidos visiveis com aprovar e rejeitar;
- o motivo do pedido e o motivo da rejeicao usam abertura progressiva para manter densidade;
- comentarios e arquivos permanecem visiveis como historico, mas o formulario vira somente leitura.

## Validacoes executadas

- migration aplicada no banco local: `202608270050_solicitacao_pedidos_retorno.js`;
- `node --check` nos controllers, servico, rotas e migration alterados;
- carga completa de `backend/src/routes.js`: `ROTAS_OK`;
- build do frontend: aprovado, 367 modulos transformados;
- `qa/medicao/57-retorno-e-interacao-por-setor.js`: aprovado duas vezes;
- QA cobriu bloqueio fora do setor, idempotencia, aprovacao, rejeicao, cancelamento, notificacoes,
  historico `De X para Y`, preservacao do status e limpeza;
- limpeza final: `usuarios=0; solicitacoes=0; pedidos=0; notificacoes=0`;
- backend reiniciado somente na porta 8100, PID final `13800`;
- health check `/api/auth/me`: `401`, resposta esperada sem token.

## Validacao visual pendente

O navegador interno abriu `http://127.0.0.1:5273/login`. Nenhuma credencial foi digitada. A
validacao visual autenticada da faixa depende de uma sessao iniciada no navegador; build e regras
de backend estao aprovados.
