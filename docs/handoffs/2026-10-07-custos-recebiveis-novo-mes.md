# Novo mes no primeiro planejamento de Custos e Recebiveis

O botao Novo mes permanece visivel para usuarios com permissao de preencher
custos ou recebiveis, inclusive antes da primeira publicacao da planilha.
Sem competencia liberada, o clique explica o pre-requisito e nao cria registros.

## Arquivos alterados

- `frontend/src/modules/custosRecebiveis/components/CrPlanejamentoMensalView.jsx`
- `frontend/scripts/validarCrNovoMes.mjs`
- Registro proprio em `docs/workspace/OWNERSHIP_ATIVO.md` e este handoff.

## Comportamento e protecoes

Sem estrutura publicada (`SEM_ESTRUTURA`), a mensagem orienta importar e
publicar a planilha da obra ou solicitar a publicacao ao responsavel do modulo.
Sem novo mes liberado por outro motivo, orienta conferir a competencia inicial
dos responsaveis e a abertura da janela. O botao fica desabilitado enquanto
carrega, durante o envio ou se a consulta falhar; usuarios somente de consulta
ou com permissao de finalizar continuam sem acesso a criacao.

A primeira competencia e calculada pelo backend a partir de
`competencia_inicial`, sem exigir mes anterior cadastrado. A janela de
planejamento, o escopo da obra, a versao publicada exigida pelo servidor e o
endpoint POST de competencias permanecem inalterados. Bloqueio sincrono por
ref complementa a chave de idempotencia e a transacao existentes no servidor.

## Validacoes

`node frontend/scripts/validarCrNovoMes.mjs` passou: calculo real do primeiro
ciclo sem banco, inicio retroativo/futuro, abertura de janela, nao recriacao de
mes existente, permissoes, feedback sem planilha, erro do servidor e nova
tentativa, duplo clique, falha de consulta. QA local com o componente real em
tema claro, escuro e largura de 390 px; capturas em `outputs/cr-novo-mes/`.
`npm run build` em frontend passou, mantendo avisos anteriores sobre
Browserslist desatualizado e chunks acima de 500 kB. `git diff --check` passou.

## Publicacao e limites

Ajuste somente de frontend, sem migration, dependencia ou variavel nova.
Nao houve acesso a banco, escrita em producao, deploy ou reinicio.
Sem commit ou push nesta etapa. Proximo passo: publicacao Git autorizada pelo
usuario e deploy do frontend na Vercel. Nao incluir as auditorias preexistentes
nem outputs na publicacao. Depois, verificar na obra alvo com usuario autorizado
antes e depois de publicar a estrutura micro pela interface do sistema.
