# Medicao e recarga: envio para autorizacao/fila

## Escopo e decisao mais recente

Usuario pediu alinhar os fluxos aos envios de pagamento feitos por GEO. Depois
confirmou que a medicao aprovada deve continuar devolvendo a solicitacao a Obra
para permitir novas medicoes. Nao manter em GEO apos aprovar. Aprovar abre os
titulos; nao e decisao do proprietario nem envio automatico ao Financeiro.

Checkout: C:/Fluxy-refactor-frontend, refactor/frontend. Base e94a8b64.
Implementacao validada; usuario autorizou commit e push somente na
refactor/frontend para testar em dev antes de qualquer promocao a main.
Nenhum banco real, migration, EC2, backfill ou deploy executado pelo agente.
outputs/ preservado fora do Git.

## Mapa de impacto e alteracoes

- medicaoContratoService: ABERTO/retorno Obra ja existiam e foram preservados.
  Status recalculado agora respeita fila ativa, analise e ajuste de pagamento
  das parcelas medidas ainda com saldo. Permissao estrita de aprovacao, anexos,
  favorecido, forma, transacao e guarda contra reaprovar continuam existentes.
- ModalMedicao: aprovar sem fechar; atualizacao de parcelas e titulos; rotulos
  sem encaminhamento automatico ao Financeiro; duas acoes independentes depois
  da aprovacao, limitadas aos titulos elegiveis da medicao. Bloqueio imediato
  da aprovacao, fechamento/escape enquanto operacao sensivel esta pendente.
  Resultado do envio nao e apagado pelo refresh de parcelas.
- FinanceiroCard e componentes/hook/util de envio: tabela de recarga e modal
  usam os endpoints existentes POST autorizacoes-pagamento e fila-pagamentos.
  Permissoes preparar autorizacao/enviar fila independentes, disponibilidade
  digital existente, selecao congelada, trava compartilhada e chave de retry.
  Callback recarrega solicitacao, titulos e parcelas; medicao aberta acompanha
  o DTO novo sem exigir fechar/reabrir.
- recargaCartaoService: novos titulos ABERTO com obra_id da solicitacao;
  ciclo AGUARDANDO_PAGAMENTO. Edicao sem baixa tambem reabre ABERTO. Legados
  PREVISAO continuam sendo liberados pelo helper de aprovacao existente.
  Validacao de prestacao mantem origem e usa rateios, nunca custo direto.
  DTO da solicitacao na validacao inclui obra_id (evita origem undefined).
- resultadoObrasService exclui recarga do agregado direto, inclusive depois
  da prestacao; rateios classificados entram uma vez. Gestao de Obras usa
  obraGestaoApropriacaoService com guarda contra custo antecipado por fallback.
  DRE permanece protegido por considera_dre=false ate prestacao validada.
- Financeiro Obras (realizado/a realizar/comprometido) tambem exige rateio e
  classificacao de recarga antes de incluir custos; guarda no WHERE composta
  com escopo de obra existente e independente da busca textual. Contas a pagar
  e fluxo de caixa nao recebem essa guarda. Teste isolado executa o WHERE real.
- Obrigacoes a pagar e fluxo de caixa continuam refletindo titulos e pagamentos
  reais; nao esconder esses registros sob a regra de apropriacao de custos.
- Contratos legados seguem com medicoes como solicitacoes proprias; card de
  titulos generico recebe as mesmas duas acoes. Nenhuma migration nova.

## Validacoes locais

- Backend: npm run test:medicao-recarga-envio aprovado: medicao real em VM,
  retorno Obra, somente parcela medida, anexos, permissao, rollback/replay;
  preservacao analise/fila/ajuste; recarga multi-cartao, edicao ABERTO, origem
  obra/centro, custo so apos prestacao, financeiro/status/anexos separados;
  rateio de Gestao de Obras e convergencia digital/direta existentes.
- Frontend: npm run test:medicao-recarga-envio-ui aprovado com Chrome instalado
  e APIs simuladas: FinanceiroCard/ModalMedicao reais, cancelar nao aprova/envia,
  modal permanece aberto, permissoes independentes, OFF, fila ja existente,
  duplo clique, retry mesma chave, somente titulo da medicao e recarga.
  Desktop/mobile verificados; imagens em outputs/qa-medicao-recarga-envio/.
- Regressao: test:cartao-opcional-solicitacao-ui aprovado com APIs simuladas.
- Build frontend aprovado; avisos anteriores Browserslist e chunk >500 kB.
- node --check nos servicos alterados e git diff --check aprovados.
- validarRecargaCartao.js tem expectativas atualizadas, mas NAO executado:
  esse roteiro escreve em banco dentro de transacao e nao e teste offline.

## Riscos e proximo passo

Sem conversao retroativa dos titulos de recarga PREVISAO ja existentes. Para
alterar historicos, definir recorte e conferir em leitura antes de autorizar
escrita. Nao alterar dados de producao diretamente.

Publicacao autorizada somente na refactor/frontend; liberar reserva apos push.
Proximo passo: usuario atualizar EC2 dev, conferir schema somente leitura e
testar os dois fluxos, reiniciando apenas backend-dev. Nao promover a main
nesta etapa. Uma futura promocao requer autorizacao propria, backup recente
conferido no Drive cifrado e timer ativo, e integracao isolada sem incorporar
DP 118209c0, ainda fora de producao.
