# Retorno e interacao pelo setor principal — 2026-08-29

## Defeito confirmado

O contrato CT-0028 pertence a solicitacao SOL-5148, criada por Joao. O setor principal de Joao e
`OBRA`, a solicitacao esta em `GEO`, mas o usuario conserva um vinculo secundario com GEO em
`usuario_setores`. Esse vinculo era tratado como operacional e liberava comentarios e demais acoes.

## Regra corrigida

- somente o setor principal do usuario libera interacao;
- setores secundarios e setores extras continuam permitindo apenas visualizacao;
- quando a solicitacao visivel esta fora do setor principal, o contexto devolve
  `pode_interagir: false`;
- o botao `Solicitar retorno` aparece desde a primeira etapa fora do setor quando o usuario possui
  `solicitacoes.retorno.solicitar`;
- no CT-0028, o retorno solicitado tem destino `OBRA` e depende de decisao do setor atual `GEO`;
- o backend continua sendo a autoridade e responde 409 `SOLICITACAO_FORA_DO_SETOR` para atalhos.

## Cobertura adicional

- botoes de remover comentario ou anexo nao aparecem fora do setor principal;
- a prestacao de contas de Recarga de Cartao fica somente leitura fora do setor;
- os endpoints de enviar e decidir a prestacao tambem usam a guarda central de interacao.

## Permissoes

Nao foi criada permissao nova. Permanecem:

- `solicitacoes.retorno.solicitar`: exibe e autoriza o pedido para quem visualiza uma solicitacao
  fora do setor principal;
- `solicitacoes.retorno.decidir`: autoriza a decisao pelo setor em que a solicitacao esta.

Joao ja possui `solicitacoes.retorno.solicitar`; nenhuma configuracao adicional e necessaria para
o caso do CT-0028.

## Arquivos alterados

- `backend/src/controllers/SolicitacaoController.js`
- `backend/src/controllers/RecargaCartaoController.js`
- `frontend/src/pages/SolicitacaoDetalhe/index.jsx`
- `frontend/src/pages/SolicitacaoDetalhe/RecargaCartaoDetalhe.jsx`
- `frontend/src/components/recarga-cartao/PrestacaoRecargaCartao.jsx`
- `qa/medicao/76-retorno-setor-principal-seguro.js`

## Validacoes

- QA 76 somente de leitura: 4 verificacoes aprovadas sobre CT-0028/SOL-5148;
- `node --check`: controllers e QA aprovados;
- `npm run build`: aprovado, 372 modulos transformados;
- `git diff --check`: aprovado;
- backend reiniciado somente na porta 8100;
- `/api/auth/me`: HTTP 401 sem token, resposta esperada.

Nao houve migration nem alteracao de dados no QA.
