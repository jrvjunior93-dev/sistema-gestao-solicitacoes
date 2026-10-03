# Handoff — Jornada e fechamento RH/DP, retorno e PIX (03/10/2026)

## Estado

Implementação preparada no checkout isolado a partir de `f82dc339`, sem escrita em
banco, migration ou deploy de EC2. O arquivo preexistente
`docs/handoffs/2026-10-02-guia-rhdp-pessoal.md` e o guia RH/DP não rastreado foram
preservados; o guia recebeu atualização das regras desta tarefa.

## Escopo alterado

- Jornada: `frontend/src/pages/RhDpJornada.jsx`,
  `backend/src/services/rhJornadaFormularioService.js`,
  `backend/src/services/rhJornadaPlanilhaService.js`.
- Apuração, categoria e títulos: `frontend/src/pages/RhDpApuracao.jsx`,
  `backend/src/services/rhApuracaoService.js`,
  `backend/src/services/rhFechamentoService.js`,
  `backend/src/validators/rhValidators.js`.
- Solicitações/retorno: `frontend/src/pages/RhDpPessoalSolicitacoes.jsx`,
  `frontend/src/services/rhDp.js`, `backend/src/controllers/RhSolicitacaoController.js`,
  `backend/src/routes.js`.
- Início e notificações: `frontend/src/navigation/HomeHub.jsx`,
  `frontend/src/components/padrao/Avisos.jsx`,
  `frontend/src/styles/componentes-padrao.css`.
- Validação e documentação: os três scripts `backend/scripts/validarJornadaPeriodosEdicao.js`,
  `validarRhJornadaEtapasPagamento.js`, `validarRhDpRegrasPagamento.js`,
  `docs/modulos/rh-dp/README.md`, `GUIA_OPERACIONAL_PESSOAL.md` e
  `docs/workspace/OWNERSHIP_ATIVO.md`.

## Regras implantadas

- Competência, obra e etapa definem o período interno da jornada. O usuário não
  seleciona periodicidade, início, fim ou dias-base globais.
- Diarista escolhe datas efetivamente trabalhadas; o backend confere vínculo,
  regime, data atual, limite e dias já enviados, permitindo mais de um envio
  independente por competência sem repetir o mesmo dia.
- A planilha espelha os campos editáveis da tela e inclui chave, nome e CPF do
  beneficiário PIX. A chave cadastrada é pré-preenchida. Se alterada, exige nome e
  CPF válido, sem mudar o cadastro permanente do colaborador.
- Fechamento usa a categoria ativa `2.01.02.01 - Salários e Ordenados` e um
  vencimento por apuração; as etapas 40% e 60% geram títulos separadamente.
- Retorno de jornada exige autorização pontual do DP. Pedido pendente ou retorno
  autorizado impede apurar, conferir ou fechar. Se houve apuração conferida,
  autorização do retorno a reabre; se houve fechamento, exige estorno antes.
  Após correção, a apuração antiga precisa ser regenerada.
- Solicitações RH/DP abrem sem filtro de situação. Criador de pedido aberto pode
  pedir retorno com motivo; DP usa a devolução existente. Home oculta apenas o
  card Compras para usuário operacional da OBRA. Avisos de resultado da ação
  aparecem como pop-up compacto.

## Validações realizadas

- `npm run test:rhdp-jornada-periodos`: passou.
- `npm run test:rhdp-etapas-pagamento`: passou.
- `npm run test:rhdp-regras-pagamento`: passou.
- `npm run verificar:regras`: passou.
- `frontend/npm run build`: passou, com avisos preexistentes de chunk grande e
  base Browserslist antiga.
- `git diff --check`: passou.
- `npm run test:docs`: passou antes da publicação.

## Riscos e próximo passo exato

Não foram feitos testes integrados com banco nem navegação real em dev; a
trilha de títulos e PIX é sensível. Antes de publicar, executar testes de
integração em uma base dev descartável: mensalista 40%/60%, diarista com dois
envios distintos e tentativa de duplicar dia, mudança de PIX com CPF válido e
inválido, pedido/decisão de retorno antes e depois da apuração, regeneração e
estorno de fechamento. Conferir categoria financeira única ativa nesse banco.
O fluxo novo de etapas depende de `RH_JORNADA_40_60_ETAPAS=ON` no backend e
`VITE_RH_JORNADA_40_60_ETAPAS=ON` no build do frontend; conferir as duas no dev.
Só depois revisar diff completo, commitar se solicitado e implantar primeiro em
dev; não aplicar em produção diretamente.
