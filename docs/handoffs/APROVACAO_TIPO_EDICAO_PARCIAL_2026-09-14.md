# Handoff — edição parcial da Aprovação por Tipo

## Problema corrigido

Ao salvar dois tipos editados, a tela reenviava todas as regras existentes. Uma regra
antiga com status posteriormente desativado no GEO era revalidada e bloqueava o salvamento
com a mensagem de que o status não estava ativo.

## Solução

- O frontend registra quais tipos foram efetivamente modificados.
- O `PATCH` envia somente essas alterações, incluindo remoções explícitas.
- O backend valida apenas as regras alteradas e as mescla com a configuração persistida.
- Regras antigas não editadas são preservadas, mesmo quando o status deixou de estar ativo.
- A tela identifica esses status como **inativo no GEO**, permitindo corrigi-los depois.
- O formato anterior com a lista completa de `regras` continua aceito para compatibilidade.

## Validações

- Sintaxe dos arquivos Node: aprovada.
- `npm run test:solicitacao-pix-apropriacoes`: aprovado, incluindo preservação, inclusão,
  atualização e remoção parcial de regras.
- `npm run build` no frontend: aprovado.

## Teste funcional recomendado em desenvolvimento

1. Manter uma regra antiga apontando para um status hoje inativo no GEO.
2. Alterar somente Recarga de Cartão e Solicitação de Compra.
3. Salvar e confirmar que as duas alterações são aceitas.
4. Reabrir a tela e confirmar que a regra antiga continua presente e sinalizada.
5. Corrigir ou remover a regra antiga em uma segunda operação.
