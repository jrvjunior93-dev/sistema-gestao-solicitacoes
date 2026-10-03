# Jornada gerencial v2 — implementação local (03/10/2026)

## Decisão de negócio

A obra escolhe a competência, seleciona colaboradores e informa para cada um
o pagamento desejado: 40%, saldo de 60%, proporcional aos dias ou diárias.
CLT/NÃO CLT é classificação informativa; a base de cálculo é o regime mensal
ou diária com vigência. O DP calcula o líquido, confere ajustes e recorrências,
fecha a apuração e só então gera o título. Para o proporcional, usar salário
mensal × dias / 30, limitado ao salário; mês integral é reconhecido ao informar
todos os dias do calendário (inclusive fevereiro e meses de 31 dias).
Nos 40%/60%, a obra informa os dias de cada etapa; no proporcional, informa
o total acumulado de dias da competência naquela obra, incluindo dias já
informados no adiantamento. Diárias usam datas efetivamente selecionadas e
não permitem reutilizar o mesmo dia. Para mensalistas, a validação de 40%/60%
é pela soma das quantidades de dias, pois não há seleção de datas individuais.

## Estado do código

- Novo formulário compacto de três passos em `RhDpJornadaGerencial.jsx`; o fluxo
  anterior continua disponível para planilha/correções. O novo formulário não
  exibe valor líquido preliminar, pois o DP ainda precisa conferir descontos,
  recorrências e pagamentos anteriores.
- `POST /rh/jornada/gerencial` agrupa as linhas por intenção e grava as
  solicitações numa única transação. Chave de idempotência por lote e por etapa;
  payload divergente com a mesma chave é recusado. `GET` da lista mantém
  escopo de obra. Ambos preservam as permissões existentes e a trava de obra.
- Importações da v2 são marcadas no payload; misturar jornada antiga e nova do
  mesmo colaborador/competência é bloqueado até conciliação pelo DP.
- `PROPORCIONAL` é uma etapa de apuração e fechamento própria. Deduz 40% já
  fechado, usa eventos recorrentes uma vez e não gera título negativo. Excedente
  fica na memória como crédito a acertar pelo DP. Os dias do proporcional
  representam o total na obra; para obra diferente da dos 40%, o cálculo
  soma os dias do adiantamento sem duplicar os da mesma obra.
- Rateio do título de 40% pode ser reclassificado com auditoria após o saldo
  ou proporcional, sem alterar valor já pago. Conversão mensal→diária continua
  protegida pelas validações de regime e pelo bloqueio contábil existente no
  fechamento quando há ajuste misto não conciliado.
- No fluxo gerencial, a base salarial da etapa é única por colaborador, mesmo
  quando mais de uma obra envia a etapa. O rateio inicial usa dias; o acerto
  proporcional reconhece o total por obra sem contar os dias dos 40% duas
  vezes. Um envio por uma única obra pode ser apurado sem obrigar outra obra a
  enviar uma etapa na qual não houve dias. O DP deve conferir envios de todas
  as obras antes de fechar, pois um título fechado impede inclusão tardia na
  mesma etapa e exige estorno formal.

## Flags e implantação

As flags novas `RH_JORNADA_GERENCIAL_V2` (backend) e
`VITE_RH_JORNADA_GERENCIAL_V2` (frontend build) ficam OFF por padrão. A v2
também exige as flags existentes `RH_JORNADA_40_60_ETAPAS` e
`VITE_RH_JORNADA_40_60_ETAPAS` ligadas. A migration de etapas
`202610020002_rh_jornada_etapas_pagamento.js` deve estar aplicada; a v2 não
adiciona tabela ou coluna. Nenhuma flag, banco, EC2, Vercel ou PM2 foi alterado
nesta tarefa. Não ativar fora de dev antes da homologação integrada.

## Validação local e limites

Executados: build do frontend, `test:rhdp-pagamento-gerencial`,
`test:rhdp-etapas-pagamento`, `test:rhdp-jornada-periodos`,
`src/modules/custosRecebiveis/tests/validarBloqueioObra.js`, `node --check`
dos serviços e `git diff --check`. Os testes unitários não escrevem no banco.
Não foi executado cenário integrado real com banco, títulos ou PIX.

Antes de ativar a v2 em dev, homologar em banco isolado pelo menos: 40%→60%,
40%→proporcional, fevereiro integral, diária repetida sem reutilizar data,
transferência entre obras com reclassificação auditada, conversão
mensal→diária, retorno/reabertura e duplo clique/reenvio com a mesma chave.
O fechamento misto de conversão permanece bloqueado até o DP conciliar o
rateio mensal/diário e eventual crédito por mecanismo contábil próprio; não
forçar a emissão financeira para contornar esse bloqueio.

## Arquivos alterados nesta etapa

`backend/src/services/rhJornadaFormularioService.js`,
`rhApuracaoService.js`, `rhFechamentoService.js`, `rhPagamentoGerencial.js`,
`backend/src/controllers/RhJornadaController.js`, `backend/src/routes.js`,
`backend/src/modules/custosRecebiveis/services/bloqueioObraService.js` e seu
teste, `backend/scripts/validarRhPagamentoGerencial.js`,
`backend/scripts/validarRhJornadaEtapasPagamento.js`, `backend/package.json`,
`frontend/src/pages/RhDpJornada.jsx`, `RhDpJornadaGerencial.jsx/.css`,
`RhDpApuracao.jsx`, `RhDpFechamentos.jsx`, `frontend/src/services/rhDp.js`,
documentação de ownership e este handoff. Permanecem também as alterações
locais anteriores de aviso/limite de dias descritas no handoff específico.

Próximo passo exato: homologação integrada em dev com base de teste e flags
habilitadas de forma controlada; não ativar na produção. O usuário solicitou
commit/push na `refactor/frontend` em 03/10/2026; isso não equivale a deploy,
migration ou ativação das flags.
