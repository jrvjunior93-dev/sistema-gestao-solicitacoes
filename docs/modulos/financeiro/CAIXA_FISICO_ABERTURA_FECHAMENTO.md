# Caixa fisico: abertura, movimentacao e fechamento

## Objetivo

Registrar o dinheiro mantido fisicamente em caixa com abertura, livro de movimentos,
conferencia e fechamento auditaveis. O caixa fisico nao depende da conciliacao OFX:
seus saldos sao formados pelos movimentos manuais e financeiros vinculados a sessao.

## Regras operacionais

- somente contas com tipo operacional `CAIXA_INTERNO` usam este fluxo;
- abertura, entrada, saida, estorno e fechamento exigem acesso financeiro e, depois
  da primeira configuracao, vinculacao como responsavel pelo controle diario;
- entradas e saidas manuais exigem valor positivo, descricao e natureza validos;
- toda saida manual exige comprovante anexado, validado tambem pelo backend;
- o saldo contado na abertura e obrigatorio e comparado ao ultimo fechamento (ou ao
  saldo inicial da conta quando ainda nao existe fechamento); uma diferenca exige
  justificativa com pelo menos 10 caracteres e gera entrada ou saida de ajuste na
  propria sessao, com comprovante obrigatorio quando o ajuste for uma saida;
- o estorno exige justificativa e so pode atingir lancamentos manuais ativos;
- cada inclusao e estorno atualiza o resumo da sessao na mesma transacao;
- o saldo contado do fechamento sempre inicia vazio e precisa ser informado pelo
  usuario; o saldo calculado nunca e copiado automaticamente para esse campo;
- o fechamento nao aceita data retroativa ao dia atual nem ao movimento mais recente;
- divergencias entre saldo contado e saldo calculado congelam a sessao e exigem
  decisao de outro usuario com a permissao granular `financeiro.caixas.decidir_divergencia`;
- antes de enviar uma divergencia de fechamento para aprovacao, a interface permite
  preparar o lancamento correspondente para que o operador corrija o livro;
- a aprovacao gera um movimento de ajuste auditavel e fecha a sessao; a rejeicao
  reabre a sessao para correcao;
- a conciliacao de transferencia de um OFX historico continua exigindo que o caixa
  contraparte esteja aberto; quando a data bancaria for anterior a abertura atual,
  a transferencia fica registrada sem vinculo com essa sessao, evitando descontar
  novamente do saldo operacional que ja foi conferido na abertura;
- a trilha de auditoria preserva usuario, data, valor, documento e motivo.
- divergencias de abertura e fechamento tambem aparecem em card proprio na
  Auditoria Operacional.

## Controle diario consolidado

- a configuracao `FINANCEIRO_CAIXA_DIARIO_CONFIG` nasce com o bloqueio desligado;
- somente o superadmin ativa ou desativa a flag e escolhe os responsaveis pela rotina;
- os responsaveis escolhidos operam a rotina e sao os usuarios sujeitos ao bloqueio;
- para usuarios com matriz granular configurada, a permissao **Decidir divergencias** e a fonte de
  verdade da aprovacao; a lista anterior de aprovadores permanece apenas para compatibilidade com
  usuarios legados ainda sem matriz individual;
- com a flag ativa, **somente contas ativas marcadas** com
  `exige_abertura_fechamento` participam do bloqueio (hoje, a conta COFRE CSC
  informada na auditoria do usuario); o tipo `CAIXA_INTERNO` sozinho nao basta;
- a falta de fechamento de um dia anterior ou de abertura na data operacional
  de Sao Paulo bloqueia **todas as demais areas e operacoes do sistema** para o
  responsavel, inclusive consultas, busca, comprovantes e conciliacao OFX,
  com resposta HTTP 423; o backend verifica a rotina em cada requisicao protegida;
- permanecem disponiveis somente os endpoints de sessao/autenticacao, preferencias
  de leitura e consultas/acoes necessarias para regularizar Caixa e Contas.
  Os guards granulares originais continuam obrigatorios: o bloqueio nao concede
  acesso ou permissao de abrir, fechar, movimentar, estornar ou aprovar divergencias;
- a mensagem no topo direciona a Caixa e Contas. Sem permissao para visualizar
  essa pagina, informa que e necessario solicitar acesso ao administrador;
- fechar corretamente o caixa **aberto hoje** libera as demais areas ate o fim
  do mesmo dia; a conta controlada fechada continua indisponivel para baixas e
  movimentacoes que exigem sessao aberta, mesmo com o bloqueio geral desligado;
- na virada do dia, e obrigatorio abrir novo caixa para cada conta marcada.
  A interface revalida a data com o relogio do servidor, inclusive com a tela
  aberta; tambem revalida ao voltar a janela, periodicamente e apos acoes no caixa;
- um caixa antigo (por exemplo, aberto em 17/08/2026, se ainda existir) deve ser
  fechado primeiro. Fechar esse caixa hoje nao substitui abrir uma sessao de hoje;
- fechamento aguardando aprovacao de divergencia permanece pendente e bloqueado;
  outro aprovador autorizado ou superadmin precisa decidir, sem autoaprovacao.
  Para conta bancaria que dependa de OFX previo, a conciliacao pendente deve ser
  tratada por operador nao bloqueado; a confirmacao do dia fica disponivel no caixa;
- o superadmin nao sofre o bloqueio automatico, mas toda alteracao da configuracao
  e registrada na auditoria.

## Matriz de smoke test

| Cenario | Resultado esperado |
| --- | --- |
| Abrir sem informar o saldo contado | Operacao bloqueada |
| Abrir sem diferenca do fechamento anterior | Sessao aberta com a continuidade do saldo preservada |
| Abrir com valor maior sem justificativa | Operacao bloqueada |
| Abrir com valor maior e justificativa | Entrada de ajuste e auditoria criadas na mesma operacao |
| Abrir com valor menor sem comprovante | Operacao bloqueada |
| Registrar entrada manual | Livro e total de entradas aumentam uma unica vez |
| Registrar saida manual com comprovante | Livro e total de saidas aumentam uma unica vez |
| Repetir envio protegido | Nenhum movimento duplicado e criado |
| Estornar movimento manual | Movimento original fica estornado e o resumo e recalculado |
| Tentar estornar movimento nao manual | Operacao bloqueada |
| Abrir a conferencia de fechamento | Campo Saldo contado permanece vazio |
| Tentar fechar sem informar o saldo contado | Operacao bloqueada |
| Fechar sem divergencia | Saldo contado e calculado fecham a sessao |
| Fechar com divergencia | Sessao congelada e enviada para aprovacao |
| Aprovar divergencia por outro usuario | Ajuste auditavel criado e sessao fechada |
| Rejeitar divergencia | Sessao reaberta para correcao |
| Ativar flag sem responsavel | Configuracao recusada |
| Responsavel com fechamento anterior ou abertura atual pendente | Todas as demais rotas bloqueadas; caixa e sessao disponiveis para regularizacao |
| Usuario nao selecionado, flag desligada ou superadmin | Sem bloqueio geral automatico |
| Fechar hoje uma sessao aberta hoje | Demais areas liberadas no mesmo dia; baixa na conta fechada recusada |
| Virar o dia, inclusive com navegador aberto | Bloqueio geral ate nova abertura |
| Fechar hoje um caixa antigo | Continua bloqueado ate abrir sessao de hoje |
| Informar data retroativa | Operacao bloqueada no frontend e no backend |
| Conciliar transferencia OFX anterior a abertura atual | Transferencia historica registrada sem alterar o saldo da sessao atual |
| Acessar sem permissao | Rota e acoes permanecem bloqueadas |

## Verificacao automatizada

Execute `node backend/scripts/validarCaixaFisico.js`. O validador confere payloads,
contratos do servico, rotas protegidas, integracao do frontend e esta documentacao.
Execute tambem `node backend/scripts/validarControleDiarioGeral.js` e, em
`frontend/`, `node scripts/validarControleDiarioCaixa.mjs`. Usam fixtures sem banco
ou dados reais para testar configuracao por usuario, HTTP 423, virada do dia,
fechamento no mesmo dia, conta fechada e bloqueio visual.

## Ativacao

Em **Configuracoes > Controle diario de contas e caixa**, selecione os usuarios
responsaveis e marque **Bloquear o sistema enquanto houver rotina de caixa pendente**.
Salve a configuracao. A chave e `FINANCEIRO_CAIXA_DIARIO_CONFIG` no banco,
nao uma nova variavel de ambiente. Verifique antes as permissoes granulares
`financeiro.caixas.visualizar`, `financeiro.caixas.abrir` e `financeiro.caixas.fechar`
dos responsaveis; outras acoes continuam dependendo de suas proprias permissoes.
Somente contas ativas marcadas com abertura/fechamento entram no bloqueio geral.
