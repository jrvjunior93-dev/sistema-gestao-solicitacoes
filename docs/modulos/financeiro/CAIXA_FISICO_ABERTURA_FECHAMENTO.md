# Caixa fisico: abertura, movimentos e fechamento

## Objetivo

Controlar o dinheiro fisico mantido pela empresa a partir de um saldo inicial, com registro diario de entradas e saidas, saldo calculado, conferencia do valor contado e trilha de auditoria.

O fluxo reutiliza a estrutura de sessoes e movimentos financeiros ja existente. Ele nao cria conta bancaria ficticia, nao substitui a carteira de cheques de terceiros e nao depende da conciliacao OFX das contas bancarias.

## Configuracao da conta

O caixa deve ser cadastrado em **Financeiro > Cadastros Financeiros > Contas** com:

- empresa do grupo vinculada;
- conta ativa;
- tipo operacional `CAIXA_INTERNO`;
- abertura e fechamento habilitados.

Contas bancarias que ja utilizavam abertura e fechamento continuam com a regra anterior de conferencia OFX. A independencia do OFX vale somente para `CAIXA_INTERNO`.

## Fluxo operacional

### 1. Abrir o caixa

O usuario seleciona empresa e caixa, informa a data, o saldo inicial e uma observacao opcional.

- somente uma sessao pode permanecer aberta por caixa;
- o saldo informado no ultimo fechamento e sugerido como proxima abertura;
- na primeira abertura, o sistema usa o saldo inicial cadastrado na conta quando o usuario nao informar outro valor;
- a operacao e transacional e auditada.

### 2. Registrar o movimento diario

Enquanto a sessao estiver aberta, o usuario pode registrar:

- entrada de dinheiro;
- saida de dinheiro;
- data do movimento;
- valor positivo;
- descricao operacional;
- documento ou referencia opcional.

Movimentos gerados por outros fluxos financeiros e transferencias vinculadas ao caixa tambem integram o livro e o saldo. O usuario nao deve repetir manualmente um movimento que ja foi gerado pelo sistema.

Na conciliacao de transferencia de um OFX historico, o caixa contraparte continua
precisando estar aberto. Se a data bancaria for anterior a abertura atual, a
transferencia fica registrada sem vinculo com essa sessao, evitando descontar
novamente do saldo operacional que ja foi conferido na abertura.

### 3. Consultar o livro do caixa

O livro apresenta, em uma unica sequencia:

- entradas;
- saidas;
- transferencias;
- origem do registro;
- documento;
- valor e natureza.

O saldo do sistema segue a regra:

`saldo inicial + entradas - saidas`

### 4. Estornar um lancamento manual

Somente movimentos manuais da sessao aberta podem ser estornados por esta tela.

- o registro nao e apagado;
- o status passa a `ESTORNADO`;
- o motivo deve ter pelo menos 10 caracteres;
- usuario, data e contexto ficam na auditoria;
- o saldo e recalculado sem o movimento estornado.

Baixas, transferencias e movimentos originados em outros modulos devem ser corrigidos no fluxo de origem correspondente.

### 5. Conferir e fechar

O usuario conta o dinheiro e informa o saldo encontrado.

- sem divergencia, o fechamento pode ser confirmado normalmente;
- a data de fechamento nao pode ser retroativa, anterior a abertura nem anterior ao movimento mais recente da sessao;
- com divergencia entre saldo contado e saldo calculado, a justificativa com pelo menos 10 caracteres e obrigatoria;
- saldo calculado, saldo contado, diferenca, responsavel e horario ficam preservados;
- depois do fechamento, a sessao nao aceita novos movimentos;
- o saldo contado torna-se a referencia sugerida para a proxima abertura.

## Endpoints

- `GET /financeiro/caixas`
- `GET /financeiro/caixas/:id`
- `POST /financeiro/caixas/abrir`
- `POST /financeiro/caixas/:id/movimentos`
- `POST /financeiro/caixas/:id/movimentos/:movimentoId/estornar`
- `POST /financeiro/caixas/:id/fechar`

O endpoint legado `POST /financeiro/caixas/confirmar-conciliacao-dia` permanece disponivel para contas bancarias configuradas com controle de abertura e fechamento. Ele nao e exigido para caixa fisico.

## Matriz de smoke test

| Cenario | Resultado esperado |
| --- | --- |
| Abrir `CAIXA_INTERNO` sem OFX anterior | Sessao aberta com sucesso |
| Abrir caixa sem empresa | Operacao bloqueada |
| Abrir conta sem controle diario | Operacao bloqueada |
| Abrir duas sessoes simultaneas no mesmo caixa | Segunda tentativa bloqueada |
| Registrar entrada positiva na sessao aberta | Entrada aparece no livro e aumenta o saldo |
| Registrar saida positiva na sessao aberta | Saida aparece no livro e reduz o saldo |
| Registrar movimento anterior a abertura ou futuro | Operacao bloqueada |
| Registrar movimento em conta bancaria pelo fluxo manual | Operacao bloqueada |
| Estornar movimento manual com justificativa valida | Registro preservado como estornado e saldo recalculado |
| Estornar o mesmo movimento novamente | Operacao bloqueada |
| Estornar movimento originado em outro fluxo | Operacao bloqueada |
| Fechar com saldo igual | Sessao fechada sem divergencia |
| Fechar com data retroativa ou anterior ao ultimo movimento | Operacao bloqueada |
| Fechar com divergencia sem justificativa valida | Operacao bloqueada |
| Fechar com divergencia justificada | Sessao fechada e diferenca auditada |
| Registrar movimento depois do fechamento | Operacao bloqueada |
| Abrir novamente o caixa | Ultimo saldo contado aparece como referencia |
| Conciliar transferencia OFX anterior a abertura atual | Transferencia historica registrada sem alterar o saldo da sessao atual |
| Abrir conta bancaria controlada sem confirmar OFX anterior | Regra bancaria anterior continua bloqueando |

## Rastreabilidade e limites

- criacao, estorno, abertura e fechamento geram eventos de seguranca;
- operacoes criticas usam transacao e bloqueio de registro;
- a tela exibe no maximo os 300 movimentos mais recentes da sessao, sem alterar o calculo integral do saldo;
- o fluxo nao substitui contas a pagar/receber, baixa de titulos, conciliacao bancaria ou custodia de cheques.
