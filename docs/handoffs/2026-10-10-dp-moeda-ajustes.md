# DP - moeda em acrescimos e descontos - 10/10/2026

## Pedido e escopo

Usuario informou erro `Descontos: valor invalido` com campos vazios e pediu
formatacao monetaria durante digitacao nos acrescimos e descontos do modal.
Base refactor/frontend ecabab69. Usuario autorizou commit e push em
refactor/frontend. Sem main, banco real, migration ou deploy nesta tarefa.

## Mapeamento e implementacao

- Modal Solicitar pagamento / Conferir pagamento: mesmos endpoints
  PUT /rh/pagamentos-solicitacao/:id e POST /:id/enviar, mesmas permissoes,
  selecao/conferencia, revisao, serializacao, transacao e idempotencia.
- Reutiliza formatCurrencyInput, normalizeCurrencyTyping e parseCurrencyInput
  de frontend/src/utils/formatters.js; helpers globais nao modificados.
- Inputs de acrescimos/descontos passam a texto com teclado numerico e BRL.
  Digitos entram como centavos (12345 = R$ 123,45), conforme padrao existente.
  Foco seleciona conteudo para substituir; limpar mostra R$ 0,00.
- Estado monetario e numerico; PUT tambem normaliza campos antigos vazios
  para zero. R$ e separadores pertencem somente a exibicao, nao ao payload.
- Calculo do liquido e reembolsos usam os mesmos valores numericos.
  Alterar valor do desconto invalida conferencia e limpa reembolso anterior;
  apenas reformatar o mesmo valor nao remove escolha de reembolso.
- Dias/faltas continuam numeros com passo 1, sem mascara de moeda.
- CSS estende largura/alinhamento existentes aos inputs monetarios, sem
  ampliar card, criar mensagens fixas ou mudar layout corporativo compacto.
- Autosave permanece em segundo plano, sem desabilitar campo nem substituir
  edicao durante gravacao. Enviar/fechar ainda aguardam ultima revisao.
- Backend atual aceita vazio/null como zero; teste direto confirmou. Nao foi
  possivel atribuir o erro do print a vazio somente sem payload/log da falha.
  Nao houve dispensa de validacoes de negativos, limites ou desconto excessivo.
- Nenhum titulo existente, calculo legado ou dado de banco foi alterado.

## Arquivos

- frontend/src/components/rh/RhDpPagamentoModal.jsx
- frontend/src/styles/rh-pagamento-solicitacao.css
- frontend/scripts/validarRhPagamentoSolicitacaoUI.mjs
- docs/modulos/rh-dp/README.md
- docs/workspace/OWNERSHIP_ATIVO.md e este handoff

## Validacoes

- Servico real com modelos em memoria validarRhPagamentoSolicitacao.js aprovado.
- Dominio real: vazio/null/undefined/zero aceitos como zero; 3000 + 1234.56 -
  123.45 = 4111.11; texto invalido e desconto maior que salario rejeitados.
- Frontend build aprovado (551 modulos), somente avisos existentes de
  Browserslist e chunk >500k; diff check aprovado.
- UI real/API isolada aprovada, incluindo digitar/colar BRL, apagar,
  payload numerico, rascunho antigo vazio, reabrir, rede lenta e mobile,
  regressao de reembolso manual, conferencia, selecao e envio Obra/DP.
- test:rhdp-pessoal-solicitacao e test:rhdp-regras-pagamento aprovados.
- Capturas desktop/mobile inspecionadas; densidade/layout preservados usando
  skill frontend-design sem alterar os helpers globais ou adicionar avisos.
- Primeiras execucoes UI identificaram sincronizacao do teste e referencia
  compartilhada de payload no mock; corrigidos aguardando o PUT e registrando
  snapshot imutavel. Execucao final completa aprovada sem erros JS.

## Proximo passo

Commit/push DEV autorizado; verificar hash remoto apos publicacao.
Sem mudanca de backend ou migration. Aguardar deploy do frontend na Vercel
e homologar os campos no dev, conservando Pessoal/DP fora da main.
