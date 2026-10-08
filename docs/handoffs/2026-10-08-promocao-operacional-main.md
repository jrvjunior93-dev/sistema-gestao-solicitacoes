# Promocao operacional para main em 8 de outubro de 2026

## Escopo e bases

O usuario autorizou integrar as pendencias da refactor/frontend na main,
preservando a edicao de vigencia contratual ja publicada por outro agente.
A integracao usa main `0c164d7c984c546623550b45dd766bd594966a46` e refactor/frontend
`27220d1358be6ff094e732873de714e5fda5a893`. Nao inclui deploy ou acesso ao banco.

Cinco commits funcionais desta conversa estao pendentes: `3a470ece`, `0efc9fb5`,
`78e19a6c`, `f319026b` e `27220d13`. O commit contratual `f5ba51f3` corresponde
a entrega isolada `0c164d7c` da main; os arquivos funcionais de contratos
foram comparados e sao identicos. Preservar ambos os commits e registros,
sem reaplicar a correcao como uma nova mudanca funcional.

## Protecao e validacao

O usuario confirmou nesta conversa que o backup recente de producao foi
conferido no Drive cifrado e o timer continua ativo. O teste isolado de
restauracao existente esta registrado no handoff de promocao de 03/10/2026.

Snapshot completo da main criado e validado com git bundle verify fora da
EC2: `outputs/main-pre-promocao-20261008-0c164d7c.bundle`, SHA256
`EDCC778B6535AE8010ED06D003D21C36CBB5D8061B36FCB4BF5C99AF50C37109`.
Nao versionar o bundle nem as demais evidencias de outputs/.

Antes da integracao, fila-instrumentos, fila-comprovante-pendente, devolucao
backend, vigencia contratual, documentacao e build Vite passaram novamente.
Testes usam persistencia simulada; o SQL MySQL e gerado sem conexao real.
A simulacao de merge encontrou somente conflitos documentais.

## Estado e proximo passo

Integracao local em andamento na branch codex/promocao-operacional-main-20261008.
Conciliar registros sem apagar a promocao isolada contratual, repetir
validacoes e publicar o resultado na main somente por fast-forward.

A entrega inclui `202610080001_fila_pagamentos_instrumento.js`, que adiciona
instrumento_pagamento_json na fila e revisao_autorizacao nos lotes; somente
estrutura, sem seed ou atualizacao de titulos/pagamentos. Nao foi aplicada
nesta sessao. Antes de reiniciar o backend de producao, executar preflight
real, conferir a lista exata de pendencias, realizar backup manual fresco e
aplicar apenas migrations explicitamente autorizadas. Depois, repetir
preflight, reiniciar somente backend-solicitacoes e homologar API/frontend.
