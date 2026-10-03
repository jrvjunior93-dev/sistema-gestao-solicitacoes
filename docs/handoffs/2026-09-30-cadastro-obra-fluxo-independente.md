# Handoff - Cadastro de obra sem origem preexistente

Data: 2026-09-30
Branch: `refactor/frontend`

## Resultado

- `CADASTRO DE OBRA` passou a ser um fluxo próprio da Nova Solicitação, sem exigir Obra ou Centro de Custo já cadastrado.
- O destino GEO continua derivado e validado exclusivamente pelo backend; não é exibido como escolha no formulário.
- A solicitação grava nome resumido, tipo, fase, valor, responsável técnico e endereço.
- A planilha orçamentária é obrigatória para `OBRA_INICIADA`. Em `PRE_OBRA`, ela é opcional e a pendência documental permanece até a mudança de fase.
- ART e documentos complementares são enviados com classificações próprias e permanecem vinculados à solicitação.
- No detalhe da solicitação, usuários com `obras.cadastro.gerenciar` recebem o botão `Cadastrar obra`. O modal abre pré-preenchido e solicita somente os dados operacionais ainda necessários.
- A criação definitiva é transacional e idempotente por solicitação: uma segunda tentativa não gera outra obra.
- A obra criada mantém o vínculo com a solicitação de origem e a mudança posterior para `OBRA_INICIADA` exige a planilha na solicitação.
- Atualizacao posterior no mesmo dia separou `Responsavel Tecnico` dos usuarios com
  acesso: o primeiro passou a ser texto curto e o segundo uma selecao multipla de
  usuarios ativos. Ao menos um usuario com acesso e obrigatorio e os vinculos sao
  criados junto com a obra definitiva.

## Persistência

Migration nova: `backend/migrations/202609300002_cadastro_obra_fluxo_independente.js`.

Complemento estrutural: `backend/migrations/202609300003_cadastro_obra_responsavel_e_acessos.js`.

Ela:

- permite `solicitacoes.obra_id` nulo para o fluxo especial;
- adiciona fase, valor, responsável técnico, pendência documental e solicitação de origem em `obras`;
- cria `solicitacao_cadastro_obra_dados`, com unicidade por solicitação e por obra gerada.

A migration é exclusivamente estrutural. Não classifica nem altera solicitações ou obras existentes.

O complemento tambem e somente estrutural: adiciona o responsavel textual e ajusta a
persistencia necessaria para separar acesso de responsabilidade tecnica, sem seed ou
backfill automatico.

## Validações executadas

- `node --check` nos controllers, validator, modelos e migration alterados: sucesso.
- `npm run test:cadastro-obra-solicitacao` no backend: sucesso.
- `npx vite build` no frontend: sucesso; apenas o aviso já conhecido de chunks acima de 500 kB.
- `git diff --check`: sucesso.

## Deploy controlado em dev

1. Atualizar a branch `refactor/frontend`.
2. Conferir que a conexão aponta para o banco de desenvolvimento autorizado.
3. Executar `ALLOW_SCHEMA_MIGRATIONS=true npm run migrate` no backend.
4. Executar `npm run test:cadastro-obra-solicitacao`.
5. Reiniciar somente `backend-dev` com `pm2 restart backend-dev --update-env`.
6. Validar `http://127.0.0.1:8001/health` e `https://api-dev.jrfluxy.com.br/health`.
7. Homologar os dois cenários: Pré-Obra sem planilha e Obra iniciada com planilha.

## Riscos e observações

- A migration ainda não foi aplicada por esta sessão e nenhum banco externo foi acessado.
- Hotfix após a primeira execução em dev: a tabela física de obras é resolvida entre `Obras` e
  `obras`; a alteração de nulabilidade não recria a FK sem necessidade e restaura a restrição
  por nome quando uma tentativa anterior tiver parado após removê-la.
- Solicitações antigas de `CADASTRO DE OBRA` continuam preservadas; o novo registro detalhado vale para solicitações criadas após a migration.
- `outputs/` já existia sem rastreamento e foi preservado sem alterações intencionais.

## Correção da abertura do formulário (2026-09-30)

- Corrigida uma disputa de estado na Nova Solicitação: a validação do fluxo comum
  removia o tipo automático porque o cadastro independente mantém a área GEO
  oculta e, portanto, `area_responsavel` vazia no formulário.
- O clique em `Solicitar cadastro de obra` agora ativa de forma conjunta o modo,
  o catálogo e o tipo especial; a regra do fluxo comum ignora esse modo.
- Adicionado `npm run test:cadastro-obra-formulario` para proteger a abertura do
  formulário contra regressões.
- Validações repetidas: teste específico, `npx vite build` e `git diff --check`,
  todos concluídos com sucesso. O build manteve somente o aviso conhecido de
  chunk acima de 500 kB.

## Correção do envio e valor monetário (2026-09-30)

- O frontend ainda executava três regras do fluxo comum no Cadastro de Obra:
  exigia `obra_id`, tentava validar distribuição de Centro de Custo e reativava
  o campo financeiro genérico. Como a origem fica oculta, o primeiro erro não
  aparecia e o botão parecia não responder.
- As três regras agora excluem explicitamente `usaFluxoCadastroObra`. O payload
  continua sem obra e sem distribuição, conforme o contrato já aceito pelo
  validator e pelo controller do backend.
- `Valor da Obra` recebeu máscara brasileira na solicitação e no modal definitivo;
  a interface mantém `R$ 1.234,56` e converte para decimal somente ao validar e
  enviar à API.
- Verificações concluídas: teste frontend do fluxo, teste backend
  `test:cadastro-obra-solicitacao`, build Vite e `git diff --check`.
