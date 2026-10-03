# Nova Solicitacao — revelacao progressiva por tipo e subtipo

## Objetivo

Deixar a abertura de solicitacoes mais limpa, exibindo primeiro apenas Obra/Centro de Custo,
setor e tipo. Os demais campos passam a aparecer conforme a regra configurada para o tipo e,
quando selecionado, para o subtipo.

No fluxo de MEDICAO, o campo de busca do contrato passa a ser apresentado como `Titulo do
Contrato`, sem alterar o identificador interno nem a forma de vinculacao existente.

## Arquivos alterados

- `frontend/src/pages/NovaSolicitacao.jsx`
  - impede que campos funcionais herdem o comportamento generico antes da escolha do tipo;
  - oculta anexos e a acao de criacao enquanto nenhum tipo estiver selecionado;
  - apresenta uma orientacao curta no estado inicial;
  - preserva a cascata de configuracao por setor, tipo e subtipo;
  - limpa o subtipo imediatamente ao trocar o tipo;
  - ignora respostas atrasadas da consulta de subtipos;
  - usa `Titulo do Contrato` e texto de busca correspondente em MEDICAO.
- `docs/workspace/OWNERSHIP_ATIVO.md`
  - amplia o escopo da sessao e registra este handoff.

## Regras preservadas

- Obra/Centro de Custo, setor e tipo continuam sendo os campos fixos de entrada.
- A configuracao do subtipo (`tipo:subtipo`) continua prevalecendo sobre a regra do tipo.
- Na ausencia de regra especifica do subtipo, permanece o fallback da regra do tipo.
- CONTRATO continua sem expor subtipo no fluxo novo, conforme a regra funcional existente.
- O backend nao foi alterado: ele ja usa a mesma precedencia de tipo/subtipo na validacao.
- O vinculo de MEDICAO continua usando os mesmos campos e endpoints; houve somente mudanca de
  linguagem na interface.

## Validacoes executadas

- `npm run build` em `frontend/`: aprovado, 373 modulos transformados.
- Teste direto do resolvedor: aprovado para fallback do tipo e precedencia do subtipo.
- `npm run test:responsive` em `frontend/`: aprovado, 204 rotas e 186 paginas lazy verificadas.
- `git diff --check`: aprovado.

## Risco residual e validacao manual recomendada

Na dev, conferir tres cenarios na tela Nova Solicitacao:

1. antes de selecionar o tipo, somente os campos fixos e a orientacao devem aparecer;
2. em MEDICAO, deve aparecer `Titulo do Contrato` e os campos configurados para MEDICAO;
3. em um tipo com subtipo configurado, trocar o subtipo deve atualizar imediatamente os campos
   visiveis e obrigatorios, sem manter dados do subtipo anterior.

Nao ha migration nem alteracao de banco para este ajuste.
