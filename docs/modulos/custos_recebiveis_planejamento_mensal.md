# Custos e Recebíveis — planejamento mensal

## Escopo

O planejamento mensal separa os custos gerais previstos das medições vinculadas ao orçamento da obra. A estrutura macro continua sendo referência somente para Medição Prevista e Medição Aprovada.

## Custos planejados

- O usuário adiciona linhas gerais, sem escolher item ou etapa macro.
- Em cada linha informa descrição do serviço, unidade, quantidade e valor unitário.
- O valor planejado do subitem é `quantidade × valor unitário`.
- Novas linhas são acrescentadas abaixo das existentes na competência.
- O subitem pertence à competência e não altera a planilha orçamentária publicada nem o cadastro de apropriações.
- Subitens livres de custo mensal e itens de medição são registros independentes. Vínculos legados ainda existentes com um subitem mensal continuam protegidos pela transação relacional.

## Obra pública — Medição Prevista

Em cada etapa macro, o usuário pesquisa diretamente os itens analíticos da versão publicada da planilha orçamentária e escolhe quais farão parte da Medição Prevista. A consulta é paginada, executada sob demanda e filtrada pela etapa macro aberta; não carrega a planilha inteira na tela. O sistema traz automaticamente código, descrição, unidade, quantidade orçada e valor unitário. O único valor operacional informado nessa etapa é a quantidade medida prevista.

O valor da Medição Prevista é calculado por `quantidade medida × valor unitário congelado na versão do plano vinculada à competência`. A quantidade acumulada entre competências não pode superar a quantidade orçada do item.

## Obra pública — Medição Aprovada

A Medição Aprovada é uma etapa posterior e independente. O usuário pesquisa novamente os itens analíticos da planilha dentro de cada etapa macro e informa quais itens e quantidades foram efetivamente aprovados pelo órgão. Os itens aprovados podem ser diferentes dos itens previstos, mas a quantidade aprovada acumulada não pode superar a quantidade orçada do item.

O valor aprovado é sempre calculado pelo sistema com o valor unitário congelado no plano. A glosa gerencial da competência corresponde à diferença positiva entre o total da Medição Prevista e o total da Medição Aprovada. Quando houver essa diferença, uma justificativa geral com rastreabilidade de auditoria é obrigatória.

## Obra privada

Obras privadas mantêm o fluxo de custos planejados seguido da leitura automática dos recebíveis financeiros da competência. Não existe etapa de Medição Prevista ou Medição Aprovada para obra privada.

## Rascunho local de edição

- Alterações ainda não salvas em Custos Planejados, Medição Prevista e Medição Aprovada são mantidas no navegador por até sete dias.
- O rascunho é isolado por usuário, obra, competência e etapa; salvar uma etapa remove somente o rascunho correspondente.
- Recarregar a página ou navegar para outra área restaura automaticamente os campos e a etapa mais recente.
- O sistema força uma última gravação local ao sair da tela ou recarregar, protegendo inclusive alterações feitas imediatamente antes da navegação.
- Um rascunho de outra versão do plano não é restaurado. O usuário também pode descartá-lo manualmente pela tela.
- O rascunho não altera o backend, não finaliza competência e não substitui as validações transacionais do salvamento oficial.

## Modelos e importação por etapa

As etapas Custos Planejados, Medição Prevista e Medição Aprovada possuem ações próprias para baixar modelo e importar planilha.

- O modelo de Custos Planejados é universal e pode ser reutilizado em qualquer obra e competência. Possui somente descrição do serviço, unidade, quantidade e valor unitário.
- Os modelos de Medição Prevista e Medição Aprovada trazem todos os itens analíticos do plano, com macro, código, descrição, unidade, quantidade orçada, valor unitário e saldo disponível protegidos. Somente a coluna `quantidade` é editável.
- Linhas vazias ou com quantidade igual a zero não entram na prévia.
- O backend rejeita fórmulas, arquivo diferente de `.xlsx`, aba ou cabeçalho alterado, item fora do snapshot da competência, duplicidade e quantidade acima do saldo disponível.
- No modelo universal de custos, os metadados identificam o tipo e a versão do modelo, sem vinculá-lo a uma obra. Nos modelos de medição, os metadados continuam vinculando obra, competência, etapa, ID e versão do plano.
- O saldo da Medição Prevista considera o acumulado previsto em competências anteriores. O saldo da Medição Aprovada considera o acumulado aprovado em competências anteriores.
- Custos livres não possuem saldo analítico próprio; a validação exige descrição, unidade, valor unitário válido e quantidade positiva.
- A prévia permite excluir linhas, alterar valores e adicionar um item. Em custos, adiciona-se uma linha livre; nas medições, adiciona-se um item do plano.
- Qualquer edição torna a prévia pendente. O usuário precisa executar `Validar novamente`; `Confirmar importação` permanece bloqueado enquanto houver erro ou alteração não revalidada.
- Confirmar a importação aplica os itens ao rascunho da etapa, sem ignorar itens já digitados que não estavam no arquivo. O salvamento definitivo continua no botão da etapa para preservar justificativas, glosa, auditoria, transação e demais regras existentes.

## Integridade

- Subitens mensais são identificados por chave local idempotente enquanto ainda não possuem ID no banco.
- Salvamentos atualizam registros existentes, criam os novos e removem somente os itens omitidos daquela competência.
- As operações permanecem transacionais e respeitam as regras de competência finalizada, vencida ou reaberta.
- Custos mensais livres permanecem independentes da planilha; medições prevista e aprovada referenciam os itens analíticos da versão do plano vinculada à competência.
- Códigos e descrições recebidos no arquivo de medição nunca são confiados: o backend resolve novamente os dados oficiais pelo código do item no snapshot da competência.
