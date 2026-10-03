# Handoff — Campos configuráveis do novo fluxo de contrato

Atualizado em: 2026-08-25 17:10:17 -03:00

## Escopo concluído

A tela `Configurações > Campos da Nova Solicitação` passou a oferecer, somente para tipos que usam o novo fluxo de contrato:

- objeto do contrato;
- justificativa da contratação;
- responsável pela contratação;
- vigência inicial do contrato;
- vigência final do contrato.

Cada campo pode ser exibido/ocultado e marcado como opcional/obrigatório por área e tipo. O campo existente `Descrição` aparece como `Título do contrato (Descrição)` nesse fluxo, deixando explícito qual controle remove o título da tela.

Condição de pagamento, negociação detalhada, parcelas e apropriações continuam estruturais. Eles não foram transformados em campos removíveis porque o backend não permite criar/aprovar um contrato válido sem esses dados.

## Coerência frontend/backend

- A Nova Solicitação renderiza somente os campos configurados.
- Campos obrigatórios são validados antes do envio.
- O payload envia `null` para campos ocultos.
- O serviço de criação resolve novamente a configuração salva.
- Payload forjado não consegue persistir valor em campo oculto.
- Justificativa oculta também não gera evento no histórico.
- Descrição oculta não vira referência do contrato; a solicitação usa o código do contrato como descrição de segurança.

## Arquivos alterados

- `backend/src/services/novaSolicitacaoCamposConfig.js`
- `backend/src/services/contratoFluxoNovoService.js`
- `frontend/src/utils/novaSolicitacaoCampos.js`
- `frontend/src/pages/NovaSolicitacao.jsx`
- `frontend/src/components/contratos/BlocoContratoFluxoNovo.jsx`
- `frontend/src/pages/NovaSolicitacaoCamposConfig.jsx`
- `qa/nova-solicitacao-campos-contrato/01-configuracao.js`

## Validações

- `node --check` aprovado nos serviços backend e na suíte nova;
- suíte pura `qa/nova-solicitacao-campos-contrato/01-configuracao.js` aprovada, sem acesso ou escrita no banco;
- build de produção do frontend aprovado com 363 módulos transformados;
- backend local reiniciado e confirmado na porta 8100;
- nenhum dado, configuração ou migration foi criado automaticamente no banco.

## Uso esperado

1. abrir `Configurações > Campos da Nova Solicitação`;
2. selecionar a área e o tipo do novo fluxo de contrato;
3. desmarcar `Aparece` em `Título do contrato (Descrição)`;
4. manter `Aparece` em `Justificativa da contratação` e, se desejado, marcar `Obrigatório`;
5. salvar a configuração e abrir novamente a Nova Solicitação.
