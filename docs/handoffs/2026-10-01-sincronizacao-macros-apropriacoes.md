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

### Complemento para a configuração legada da `main`

A evidência da obra 110 mostrou duas apropriações analíticas criadas manualmente
como raiz (`00.001` e `00.002`). Elas estavam ativas, mas a configuração legada
restringia as candidatas a somadoras, macros já marcadas e filhas diretas. Por isso
não podiam ser confirmadas como visíveis e o seletor de contratos continuava
exibindo somente as etapas antigas.

A lista de candidatas passa a aceitar toda apropriação ativa da obra. Isso não a
libera automaticamente nos contratos: ela somente entra nos formulários depois de
ser marcada e confirmada na Gestão de Apropriações. Apropriações inativas continuam
excluídas. Não há migration, backfill ou alteração automática de dados.

## Validação

- `npm run test:apropriacoes-gestao`;
- `node backend/scripts/validarApropriacoesMacrosFormulario.js`;
- `npm run build`;
- `git diff --check`.
