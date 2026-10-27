# Campo Valor a autorizar em moeda brasileira

Pedido do usuario: formatar em moeda brasileira durante a digitacao, sem travar a edicao. Continuidade da homologacao/publicacao do frontend DEV, base ba7393ab, backend fc369151 ja aplicado/conferido pelo usuario. Somente frontend, sem migration, EC2, main ou integracoes.

## Alteracao

- `MoedaInputBR.jsx` reutiliza `normalizeCurrencyTyping`, `formatCurrencyBRL` e `parseCurrencyInput` existentes. Texto em reais no input; callback com decimal canonico de duas casas, ou vazio. Digitos por centavos, conforme os demais campos monetarios do Fluxy (123456 → R$ 1.234,56).
- Preserva cursor por quantidade de digitos a direita durante insercao/substituicao no meio. Backspace/Delete sobre separadores continuam a edicao. Permite apagar tudo e apagar zero sem reposicao infinita; composicao do teclado permanece local ate finalizar.
- `ValorAutorizacao.jsx` usa o componente compartilhado na lista por obra, detalhe e lote. Validador de montante, montante assinado, permissoes, disabled, biometria e limites permanecem iguais. Nao envia texto localizado a API nem altera valor original do titulo.

## QA

- `node scripts/validarMoedaAutorizacao.mjs`: navegador real com componente real; formato a cada tecla, cursor, Backspace/Delete em separadores, selecao parcial, colagem BR/decimal canonico, vazio/zero, composicao, atualizacao de props/disabled, 320/390/1366 e valor numerico conferido. Sem API externa/banco.
- `validarAutorizacoesPorObra.mjs`: regressao individual/coletiva, 130 selecionados, biometria simulada, cancelamento, valores canonicos no payload e filtros.
- `validarAutorizacaoPwa.mjs`: Android/iOS simulados, shell/navegacao, individual/coletiva, ACL, anti-duplo-clique e telas pequenas.
- `npm run build` aprovado; avisos existentes Browserslist/chunk preservados. Imagens/saidas em `outputs/qa-moeda-autorizacao/` e `outputs/qa-*-moeda*.txt`.

## Publicacao

Commit separado de frontend na refactor/frontend; confirmar remoto na base esperada, push sem force e conferir o SHA servido no DEV. Nao exige comandos EC2. Nao modificar a main nem retomar carga/automatico NSDOCS. Homologacao pelo usuario com digitacao e autorizacao nominal no DEV.
