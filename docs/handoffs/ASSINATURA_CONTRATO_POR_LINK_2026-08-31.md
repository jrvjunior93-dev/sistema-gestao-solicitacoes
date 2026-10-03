# Assinatura de contrato por link

Data: 2026-08-31  
Branch: `dev-v2`

## Objetivo

Exibir, no card `Contrato — Necessita assinatura`, o link enviado pelo Juridico e a minuta para
download. Permitir que a origem solicite a revisao confirmando que o contrato foi assinado pela
plataforma, sem obrigar um novo arquivo assinado nesse caso.

## Implementacao

- O payload das parcelas do contrato agora inclui `link_assinatura` e a minuta mais recente.
- O card mostra uma secao compacta `Material para assinatura`, com:
  - abertura segura do link em nova aba;
  - download da minuta, incluindo geracao de URL assinada para arquivos S3.
- Quando existe link, a origem pode marcar `Contrato assinado pelo link informado`.
- O upload continua disponivel e obrigatorio quando a confirmacao por link nao for usada.
- O backend valida que a alternativa so pode ser usada se o contrato realmente possuir um link
  registrado pelo Juridico.
- A forma de entrega fica registrada no historico e em `metadata.assinado_pelo_link`.
- Nenhuma migration foi necessaria.

## Arquivos alterados neste ajuste

- `backend/src/controllers/ContratoFluxoNovoController.js`
- `backend/src/services/contratoFluxoNovoService.js`
- `frontend/src/pages/SolicitacaoDetalhe/AcoesContrato.jsx`
- `docs/workspace/OWNERSHIP_ATIVO.md`

## Validacoes

- `node --check src/services/contratoFluxoNovoService.js`
- `node --check src/controllers/ContratoFluxoNovoController.js`
- carga dos dois modulos Node sem erro
- `npm run build` no frontend
- `npm run test:responsive` no frontend: 204 rotas aprovadas

## Teste funcional recomendado em dev

1. No Juridico, concluir a minuta informando arquivo e link.
2. Na origem, abrir o contrato em `Necessita assinatura` e confirmar link e download da minuta.
3. Marcar `Contrato assinado pelo link informado` e solicitar revisao sem anexar arquivo.
4. Confirmar que o contrato chega a `Em revisao no Juridico` e que o historico informa assinatura
   pela plataforma.
5. Em outro contrato sem link, confirmar que a API continua exigindo o arquivo assinado.

