# Filtro de credor nas parcelas de contrato — 2026-08-31

## Diagnostico

No fluxo novo, as previsoes financeiras nascem com o contratado em `parceiro_id`. Quando uma
medicao e aprovada, o titulo medido passa corretamente para `ABERTO` e seu `parceiro_id` e trocado
para o favorecido efetivo informado na medicao. Por isso, ao filtrar a tela de titulos pelo
contratado, apareciam apenas as parcelas ainda em `PREVISAO`; a parcela aprovada continuava
existindo, mas passava a responder somente ao filtro do favorecido.

## Correcao

O filtro `parceiro_id` da listagem de titulos agora considera duas relacoes:

1. o credor/favorecido atual do titulo;
2. o vinculo do parceiro em `contrato_credores` para contratos do fluxo novo.

Na segunda alternativa, a consulta restringe os resultados a `origem_titulo = 'CONTRATO'` e a
solicitacao proprietaria do contrato. Assim, a busca pelo contratado recupera o cronograma
completo, inclusive as medicoes aprovadas, sem trocar de volta o favorecido real do pagamento e
sem incluir outros titulos eventuais da mesma solicitacao.

A busca rapida (`q`) aplica a mesma regra ao localizar o nome ou CPF/CNPJ de um contratado. Na
tabela de parcelas exibida no Financeiro do detalhe da solicitacao, cada parcela que ja possui
`titulo_financeiro_id` ganhou uma acao compacta de visualizacao que abre diretamente o titulo.

A documentacao juridica obrigatoria na abertura do contrato foi achatada visualmente: a moldura
interna foi substituida por uma lista com separadores, e a qualificacao do representante recebeu
uma secao propria e uma grade com maior espacamento entre campos.

## Arquivos alterados

- `backend/src/services/tituloFinanceiroService.js`
- `frontend/src/pages/SolicitacaoDetalhe/PrevisoesContrato.jsx`
- `frontend/src/components/contratos/BlocoContratoFluxoNovo.jsx`
- `docs/workspace/OWNERSHIP_ATIVO.md`

## Validacoes

- `node --check backend/src/services/tituloFinanceiroService.js`
- carregamento isolado de `tituloFinanceiroService.js`
- `node scripts/validarFiltroValorTitulos.js`
- `npm run build` em `frontend/`
- `npm run test:responsive` em `frontend/` — 204 rotas verificadas
- `git diff --check`

## Validacao funcional em dev

1. Filtrar os titulos pelo contratado do CT-0002.
2. Confirmar que aparecem as quatro parcelas: a medicao aprovada como `ABERTO` e as tres futuras
   como `PREVISAO`.
3. Confirmar que a coluna Credor da parcela aberta continua mostrando o favorecido informado na
   medicao, pois ele e o recebedor real.
4. Filtrar pelo favorecido real e confirmar que a parcela aberta tambem aparece.
5. Repetir a consulta digitando nome ou CPF/CNPJ do contratado na busca rapida.
6. No detalhe da solicitacao, clicar no icone de olho de uma parcela e confirmar a abertura do
   titulo financeiro correspondente.
7. Conferir a documentacao juridica em desktop e celular: anexos em lista plana e qualificacao
   com espacamento uniforme, sem alterar uploads ou campos obrigatorios.

Nao ha migration e nao houve alteracao de dados existentes.
