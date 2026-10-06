# Ícones nas ações das solicitações de Pessoal

## Escopo

A coluna Ações da aba Solicitações em Pessoal agora usa ícones no lugar dos
textos. O ajuste está no checkout `C:/Fluxy-refactor-frontend`, branch
`refactor/frontend`. O proprietário autorizou commit/push nessa branch e
promoção para `main` em 06/10/2026.

## Arquivos alterados

- `frontend/src/pages/RhDpPessoalSolicitacoes.jsx`: reutiliza Button com
  iconOnly para Abrir, Conferir jornada, Aprovar ou Registrar ciência,
  Devolver, Enviar, Reenviar, Solicitar retorno e Cancelar. A largura inicial
  da coluna passa de 300 para 220 px; preferências de largura já salvas
  continuam sob controle da TabelaPadrao.
- `frontend/src/styles/rh-pessoal-atividade.css`: alvos de 34 px no desktop
  e 44 px no toque/mobile, cores primárias pelos tokens existentes e foco
  visível. As regras afetam somente os ícones desta coluna.
- `frontend/scripts/validarRhPessoalAcoesIcones.mjs` e `frontend/package.json`:
  teste local `npm run test:rhdp-acoes-icones`.
- `docs/workspace/OWNERSHIP_ATIVO.md`: registro desta tarefa, preservando
  as alterações de documentação anteriores à sessão.

## Fluxos preservados

Cada ícone mantém o callback e a condição de exibição originais. Aprovação
e devolução seguem `rh_dp.solicitacoes.decidir`; envio, reenvio, retorno e
cancelamento seguem `rh_dp.solicitacoes.abrir`, com as condições existentes
de estado, autoria e tipo. Alteração salarial e evento recorrente mantêm
as restrições próprias. Jornada continua usando a conferência contextual,
sem aprovação genérica. Motivos e confirmações permanecem nos modais com
botões textuais. Cada ícone tem title e nome acessível com o ID da solicitação.

Os endpoints e handlers não foram alterados. Nenhum cálculo, status,
permissão, proteção contra duplicidade ou regra de negócio foi modificado.

## Validações

Passaram `npm run test:rhdp-acoes-icones`,
`npm run test:rhdp-conferencia-guiada`, `npm run build` e `git diff --check`.
As fixtures usam a tela e os componentes reais, serviços simulados e
requisições externas bloqueadas. Cobrem cliques de todas as ações,
confirmação e desistência, motivos obrigatórios, condições de permissões
e estados, SVGs e nomes acessíveis, foco pelo teclado, contraste mínimo
de 3 para os ícones primários e ausência de sobreposição/overflow.
Capturas em 1366 e 390 px nos dois temas ficam em
`outputs/rh-pessoal-acoes-icones/`, fora da publicação. Revisão visual local
realizada. O build mantém avisos de Browserslist e tamanho de bundle.

Na revisão para publicação, `npm run test:docs` apontou divergência preexistente
nas métricas de permissões de `AGENTS.md` e
`docs/seguranca/autenticacao_autorizacao.md` (registro atual: 19 grupos,
110 áreas e 391 permissões). Esses arquivos e o registro de permissões não
foram alterados por esta tarefa; a pendência documental ficou fora do escopo.

## Publicação e próxima etapa

Somente frontend, sem migration ou variável de ambiente nova. Nenhum acesso
a EC2, banco ou login real nesta tarefa. A publicação Git foi autorizada. Preservar os
arquivos de auditoria e a documentação local preexistentes ao preparar um
commit. Promover o mesmo commit para main por fast-forward, sem deploy manual.
Depois da publicação automática do frontend, homologar a coluna com
usuários Obra e DP; a fixture não substitui esse teste autenticado.
