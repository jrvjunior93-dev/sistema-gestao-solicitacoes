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

Todas as apropriações ativas da obra também permanecem visíveis na configuração,
mesmo quando o nível atual é automático (`Etapa`, `Serviço` ou `Subserviço`). As
caixas de seleção ficam disponíveis; a primeira alteração manual troca o nível para
`Personalizado` e preserva a seleção automática como ponto de partida.

A importação Excel já atualizava os dois conjuntos e foi preservada. O backend já
ressincronizava corretamente os níveis automáticos; nenhuma regra de seleção,
migration ou dado existente foi alterado.

## Validação

- `npm run test:apropriacoes-gestao`;
- `npm run build`;
- `git diff --check`.
