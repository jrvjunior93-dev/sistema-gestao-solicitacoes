# Demissao com conclusao operacional pelo DP

## Escopo autorizado

- Implementar/testar para refactor/frontend novas demissoes e RH-000235.
- Inativo visivel na obra ate concluir, colaboracao DP/obra e ateste corrigido.
- Sem producao, calculos financeiros, banco/storage reais ou publicacao.

## Implementacao

- Domain rhDemissaoConclusaoDomain: marcador interno nas novas aberturas;
  excecao legada exata RH-000235; reenvio nao aceita adulterar o controle.
- rhSolicitacaoService: conclusao transacional/idempotente e documental,
  historico, anexos APROVADA pendente, locks pai/filho, ateste vinculado ao pedido.
  Aprovacao e efeitos financeiros/cadastrais continuam como estavam.
- Controller/routes: concluir exige permissao decidir, DP/admin e escopo;
  validator multiparametro corrige rejeicao de anexoId no ateste.
- Consulta/paginacao: pendentes contam em andamento, sem mudar APROVADA gravada.
- rhService: opt-in somente da lista operacional da obra inclui DEMITIDO que
  tem demissao pendente na mesma obra. Sem ampliacao de consultas financeiras.
- RhDpPessoal/Solicitacoes/cliente: status informativo, concluir DP, arquivos e
  comentarios durante tratamento; nao oferecer novos pagamentos ou acoes de
  empregado ativo ao inativo pendente; double-click e operacoes em voo protegidos.
- Novos QAs backend/frontend e modo --demissoes na QA de lista local; cinco
  harnesses antigos recebem somente o novo domain isolado como dependencia.
- Canonico: docs/modulos/rh-dp/README.md. Scripts npm de teste nos dois runtimes.

## Validacao e limites

- QA backend: novas/RH-000235, demais legados excluidos, opt-in/obra/busca,
  checklist, upload DP/obra, ateste/ID adulterado, rollback documental/historico,
  replay/concorrencia, cadastro/aprovacao/vinculo preservados. Sem banco/rede.
- UI real com API isolada: DP/obra, comentario/upload/ateste/conclusao,
  falha explicita mantendo modal, retry e duplo clique; 390/1366 sem overflow.
- Lista real 390/1366: pendente visivel inativo; sem pagamento individual/lote;
  outros inativos/obras ausentes. Backend prova retirada somente apos concluir;
  UI prova desaparecimento apos releitura da conclusao e status sem overflow.
- Regressoes backend: admissao diaria, contatos, consulta salario,
  movimentacoes documentais, tipos de documento, documentos/pasta,
  transferencias, performance/paginacao e envio parcial/cancelamentos DP.
- Regressao UI: tipos no pedido, upload/retry/loading e resposta obsoleta.
  Suite ampla validarRhPessoalPorLocal.mjs aprovada: seis abas DP, cadastro,
  documentos/relatorios, escopos, obras/centros, mobile e pagamento/conferencia/
  fechamento legados. Build, sintaxe, diff e docs593/19 aprovados.
- Suite antiga validarRhPessoalFluxo.js sem argumentos tem falha preexistente
  no mock de crypto da jornada (arquivo nao alterado); o recorte publicado
  --transferencias foi executado e aprovado. Nao corrigi jornada fora do escopo.
- Nao executado em EC2 ou banco MySQL real; RH-000235 so foi exercitada como
  fixture, nao alterada no servidor. Sem migration necessaria.
- Skill frontend-design usada para evoluir o modal/lista existentes, sem
  redesign, novas fontes ou alteracao de layout global; status complementar
  quebra linha no celular. Ownership liberado ao finalizar verificacoes.

## Proximo passo

- Mudancas locais na branch isolada codex/rh-demissao-conclusao-20261021,
  baseada no DEV828ed2ec. Sem commit/push. Publicar em refactor/frontend somente
  se solicitado, preservando outputs privados e outros ajustes existentes.
- Atualizar exclusivamente DEV e homologar: RH-000235 reaparece inativa na
  obra; DP e usuario vinculado comentam/anexam; DP atesta e conclui; desaparece
  da lista operacional sem excluir cadastro/historico ou recalcular nada.
- Repetir com demissao nova e usuario de outra obra (negado); conferir que nao
  pode marcar o inativo para pagamento. Nao promover para main sem autorizacao.
