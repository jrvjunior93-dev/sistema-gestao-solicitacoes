# Handoff — nível de apropriação por obra e revisão da importação

## Escopo concluído

- A regra antes restrita às obras 109 e 110 foi generalizada para todas as obras.
- Cada obra pode usar `ETAPA`, `SERVICO`, `SUBSERVICO` ou `PERSONALIZADO` nos formulários operacionais.
- O cadastro da obra passou a exigir a escolha entre Etapa, Serviço e Subserviço; o modo Personalizado é administrado na Gestão de Apropriações.
- A importação Excel agora possui uma etapa de pré-visualização sem gravação.
- O modal mostra a configuração atual, permite trocar o nível, recalcula a lista exibida e permite marcar linhas no modo Personalizado.
- A importação e a atualização da configuração são confirmadas na mesma transação.
- Inclusões, alterações e remoções manuais ressincronizam automaticamente níveis padronizados.
- Custos e Recebíveis mantém suas tabelas e regras próprias; nenhum arquivo desse módulo foi alterado.

## Persistência e segurança

- Migration anterior: `backend/migrations/202609230001_apropriacoes_macros_formularios.js`.
- Nova migration: `backend/migrations/202609230002_obras_nivel_apropriacao_formulario.js`.
- Novo campo em `obras`: `nivel_apropriacao_formulario`.
- A migration preserva configurações manuais existentes como `PERSONALIZADO`.
- A lista efetiva continua materializada em `apropriacoes.macro_formulario`, mantendo o comportamento dos consumidores atuais.
- A confirmação continua protegida pelas permissões existentes e gera evento de segurança.
- A reimportação atualiza códigos ativos, preservando IDs e vínculos históricos.

## Planilhas reais verificadas

- Obra 109 — `BPM- ORÇAMENTO.xlsx`: 813 linhas reconhecidas.
- Obra 110 — `02_Planilha_Orcamentaria_Readequada_CEET_Talmo.xlsx`: 677 linhas reconhecidas.

## Validações executadas

- `node --check` nos controladores, serviço, rotas e migration alterados.
- `node backend/scripts/validarApropriacoesMacrosFormulario.js`.
- `npm run test:importacao-apropriacoes`.
- `npm run test:obra-apropriacoes-padrao`.
- Leitura real das duas planilhas originais pelo mesmo parser do backend.
- `npm run build` e `npx vite build` no frontend.
- `git diff --check`.

## Sequência operacional após deploy

1. Aplicar as migrations autorizadas, incluindo `202609230002_obras_nivel_apropriacao_formulario.js`.
2. Reiniciar apenas o backend do ambiente correspondente.
3. Na Gestão de Apropriações, selecionar a obra e escolher o arquivo Excel.
4. Revisar no modal o nível e a lista resultante; usar Personalizado quando precisar marcar itens individualmente.
5. Confirmar a importação e validar a lista em um formulário operacional.

## Riscos e observações

- A migration precisa ser aplicada antes de iniciar o backend com este código.
- Nenhum banco externo, EC2 ou reimportação foi alterado nesta sessão.
- O worktree contém mudanças de outras tarefas; um commit futuro deve selecionar apenas os arquivos deste escopo.
