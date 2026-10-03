# Medicao de contrato cuja solicitacao esta em outro setor

Data: 2026-08-31  
Branch: `dev-v2`

## Problema

No modo de criacao de solicitacao, contratos do fluxo novo eram removidos da resposta quando a
solicitacao-mae estava em outro setor. O contrato continuava ativo e pertencendo a obra, mas deixava
de aparecer na lista de contratos da medicao.

## Correcao

- Contratos ativos do fluxo novo continuam visiveis na obra quando o usuario possui acesso de
  leitura, independentemente do setor atual da solicitacao.
- O backend devolve `disponivel_medicao` e o mesmo `contexto_interacao` usado no detalhe da
  solicitacao.
- Falha real de visibilidade continua ocultando o contrato; a mudanca nao amplia o escopo de obras
  nem ignora regras de acesso.
- Na lista, contratos fora do setor recebem o sufixo `retorno necessario`.
- Ao selecionar um contrato bloqueado, a tela:
  - informa o setor atual e o setor para o qual a solicitacao deve voltar;
  - nao carrega parcelas, nao libera aditivo e bloqueia o envio da medicao;
  - oferece o fluxo existente de `Solicitar retorno`, com motivo obrigatorio;
  - mostra `Retorno solicitado` e o motivo quando ja existe pedido pendente do usuario.
- A validacao autoritativa do backend para criar a medicao permanece ativa.

## Arquivos alterados

- `backend/src/controllers/ContratoController.js`
- `frontend/src/pages/NovaSolicitacao.jsx`
- `docs/workspace/OWNERSHIP_ATIVO.md`

## Validacoes

- `node --check backend/src/controllers/ContratoController.js`
- carga do controller Node sem erro
- `npm run test:security-hardening`
- `npm run build` no frontend
- `npm run test:responsive`: 204 rotas aprovadas
- nenhuma migration necessaria

## Homologacao recomendada em dev

1. Entrar como usuario de OBRA e selecionar a obra do contrato.
2. Confirmar que o contrato cuja solicitacao esta em FINANCEIRO aparece com `retorno necessario`.
3. Selecionar o contrato e confirmar que as parcelas e o envio da medicao ficam bloqueados.
4. Solicitar retorno com motivo e conferir o estado `Retorno solicitado`.
5. Aprovar o retorno no setor atual, recarregar a tela e confirmar que o mesmo contrato passa a
   liberar a medicao.

