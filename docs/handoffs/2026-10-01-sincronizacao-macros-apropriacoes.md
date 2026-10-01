# Sincronizacao das etapas macro apos cadastro manual

## Problema

Ao criar apropriações manualmente na Gestão de Apropriações, a lista principal era
recarregada, mas a resposta já mantida em memória pelo bloco **Nível de apropriação
dos formulários** não era atualizada. Assim, as novas apropriações não apareciam
como candidatas no modo Personalizado até trocar de obra ou recarregar a página.

## Correção

A tela passa a recarregar em conjunto o cadastro e a configuração macro após:

- criar ou editar uma apropriação;
- excluir apropriações;
- importar manualmente por colagem de texto.

Na interface vigente da `main`, todas as apropriações candidatas já permanecem
visíveis e marcáveis na configuração. A promoção isolada preserva esse comportamento
e acrescenta somente a atualização conjunta dos dois conjuntos após cada mutação.

A importação Excel já atualizava os dois conjuntos e foi preservada. Nenhuma regra
de seleção, migration ou dado existente foi alterado.

## Validação

- `npm run test:apropriacoes-gestao`;
- `npm run build`;
- `git diff --check`.
