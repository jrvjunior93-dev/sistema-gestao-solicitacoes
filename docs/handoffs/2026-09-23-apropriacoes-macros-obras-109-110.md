# Handoff — etapas macro das obras 109 e 110

## Escopo concluído

- A configuração de etapas macro foi limitada às obras de código `109` e `110`.
- A importação da Gestão de Apropriações passou a reconhecer diretamente as duas planilhas orçamentárias originais, preservar sua ordem e atualizar registros existentes pelo código, sem apagar vínculos históricos.
- A tela sugere as etapas macro e exige confirmação do usuário antes de usá-las nos formulários operacionais.
- Após a confirmação, os formulários fora de Custos e Recebíveis listam apenas as macros selecionadas para essas obras.
- Obras diferentes de 109 e 110 mantêm a seleção analítica existente.
- Nenhum arquivo do módulo Custos e Recebíveis foi alterado.

## Dados verificados nas planilhas originais

- Obra 109 — `BPM- ORÇAMENTO.xlsx`: 813 linhas importáveis e soma das folhas de R$ 5.490.000,00.
- Obra 110 — `02_Planilha_Orcamentaria_Readequada_CEET_Talmo.xlsx`: 677 linhas importáveis e soma das folhas de R$ 27.000.000,00.

## Persistência e segurança

- Migration: `backend/migrations/202609230001_apropriacoes_macros_formularios.js`.
- Novos campos em `apropriacoes`: `macro_formulario` e `ordem_planilha`.
- A confirmação é transacional, restrita por permissão da Gestão de Apropriações e registrada na trilha de segurança.
- A reimportação é idempotente para códigos ativos: atualiza o registro atual em vez de criar duplicidade.
- Registros já vinculados permanecem com os mesmos IDs; não há exclusão nem substituição em massa.

## Validações executadas

- Leitura real das duas planilhas anexadas, com contagem, primeiro/último item e soma das folhas.
- `npm run test:importacao-apropriacoes`
- `npm run test:obra-gestao-apropriacoes`
- `npm run test:obra-apropriacoes-padrao`
- `npm run test:compra-importacao-itens`
- `npm run test:solicitacao-pix-apropriacoes`
- `node scripts/validarApropriacoesMacrosFormulario.js`
- `npm run test:apropriacao-compra`
- `npm run build` no frontend.

## Sequência operacional após deploy

1. Aplicar a migration autorizada.
2. Na Gestão de Apropriações, selecionar a obra 109 e reimportar `BPM- ORÇAMENTO.xlsx` para completar os níveis e gravar a ordem original.
3. Revisar a sugestão de etapas macro da obra 109 e confirmar.
4. Selecionar a obra 110 e reimportar `02_Planilha_Orcamentaria_Readequada_CEET_Talmo.xlsx` para gravar a ordem original.
5. Revisar a sugestão de etapas macro da obra 110 e confirmar.
6. Conferir uma Nova Solicitação, uma Solicitação de Compra e um título financeiro em cada obra.

## Riscos e observações

- A migration precisa ser aplicada antes de iniciar o backend com este código.
- A implementação local não altera banco externo, EC2, Custos e Recebíveis, nem executa as reimportações.
- Há mudanças pendentes de outras tarefas no mesmo worktree; um commit futuro deve separar os trechos deste escopo cuidadosamente.
