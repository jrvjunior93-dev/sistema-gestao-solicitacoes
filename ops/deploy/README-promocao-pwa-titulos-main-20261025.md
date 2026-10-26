# Candidato de promocao PWA/titulos para main

Estado: backend publicado/aplicado e conferido pelo usuario; frontend pronto para publicacao separada.
Branch codex/promocao-pwa-titulos-main-20261025, base main 09b66e4b114e5f89219c58c8697a40bca04fbabd.
Worktree: C:/Users/Ricardo/.codex/worktrees/retirada-envios-main-20261024/Fluxy/outputs/worktree-promocao-pwa-titulos-main.

## Delta fechado

- PWA: rotulos individual/coletivo explicitos, rodape de acoes acessivel durante
  rolagem, conferencia focada com quantidade e total. Mesmos endpoints,
  selecao, autorizador nominal, ACL, passkey e revalidacao. Abrir/conferir ou
  navegar nao autoriza. Duplo clique nao duplica decisao.
- Compras: apenas titulos ativos da compra impedem gerar novamente. Frete de
  terceiro e obrigacao separada, inclusive quando parcial. Compra parcial
  continua bloqueando duplicacao; frete/baixas/saldos/historico nao sao alterados.
- Modal: fecha pedido com fornecedor por acao confirmada e permissoes existentes
  de gerar previsao e alterar status; GEO continua com seu fluxo de envio.
  Resposta de outro pedido e negada antes de preencher o modal financeiro.
- Vinculos NF-e existentes preservados; bloco fica apos gestao financeira.

Manifesto lista6fontes de runtime e5arquivos de QA. Sem migrations, models,
dependencias, regras de autorizacao, schemas, NSDOCS/S3, flags ou Nodes.

## Validacao concluida

-19testes backend passaram: dois pedidos da mesma solicitacao, frete parcial,
  idempotencia, compra parcial, sobreposicao, boleto opcional, Compras/GEO,
  passkey/transacao, falha tardia com rollback global, fila, estorno e vinculos.
-3novos testes do componente PedidoResumo: resposta incorreta negada,
  IDstring/legado aceitos quando corretos e cliques simultaneos com1consulta.
-UI por obra:130titulos/1passkey/1POST entre lotes e paginas; ACL,
  cancelamento, resposta perdida, concorrencia, exclusao e fila parcial.
-PWA completo: Android/iOS/standalone simulados, toque e320x568/390/768/1366;
  seletivo e individual separados, foco/total/contagem e sem autorizacao ao abrir.
-UI NF-e/pedidos: varios pedidos/solicitacoes, retry mesmoID, historico/baixas,
  mobile, fechamento cancelado/confirmado e duplo clique com1envio.
-UI retirada: StrictMode, ACL nominal sem poder de decidir, fila parcial e refresh.
-UI dossie/fila: NF-e/boletos, presign sob demanda, XML/preview/Escape, negacao,
  historico e sem biometria extra. Datas/observacoes e selecao parcial passaram.
-Build frontend aprovado,655modulos. Catalogo gerado sem delta. Inspecao visual
  das capturas PWA320/390 aprovada. git diff --check limpo.

Todos os testes usaram fixtures, SQLite em memoria e APIs/biometria simuladas.
Sem autenticacao biometrica fisica, banco real, AWS, NSDOCS ou aprovacao real.
Avisos existentes: Browserslist antigo, bundle>500kB e SQLite experimental.
Nao instalar/atualizar dependencias para esses avisos nesta promocao.

## Sequencia de publicacao e prova de backend

1. Carga historica encerrada por NSDOCS_HISTORICO_LIMITE e mantida pausada por
   pedido do usuario. Plano/361lotes concluidos/345pendentes e XMLs preservados.
   Nao reiniciar executor ou launcher antigo nesta promocao.
2. Usuario confirmou backup no Drive cifrado/timer ativo e restart de producao.
   Backend publicado em main7e6cf469a753e0372c07aa43e7cb35fb8dba609d. Publicar somente backend:
   a linha do service e QA correspondente. Sem frontend nesse primeiro passo.
3. Aplicar por operador de producao com preflight/backups/retorno e Nodeisolado;
   conferir backend antes de liberar UI. Nao ha migration nem install necessario.
4. Publicar frontend PWA/pedidos depois da prova backend. Evitar push de UI
   antecipado na main, que pode disparar deploy automatico da Vercel.
5. Homologar botoes individual/coletivo, confirmacao/cancelamento, acesso negado,
   dois pedidos, frete parcial e dossie/links assinados no fluxo aprovado.

Retorno futuro restaura codigo, nunca desfaz pagamentos, baixas, historico ou
vinculos no banco. Nao executar SQL ou migration down para reverter esta mudanca.
Prova recebida em26/10/2026: PWA_TITULOS_PROD_APLICADO e CONFERIDO phaseaplicado,
QAaprovado,1restart somenteproducao,0migrations/SQLdireto/S3/NSDOCS; planos,
Nodes/PM2/env/dumps e peers preservados. Frontend emcommit posterior, sem EC2.
Automatico NSDOCS continuaOFF, pendente de implementacao/homologacao separada.
