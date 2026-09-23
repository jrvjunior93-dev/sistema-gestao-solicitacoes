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
- o estorno exige justificativa e so pode atingir lancamentos manuais ativos;
- cada inclusao e estorno atualiza o resumo da sessao na mesma transacao;
- o fechamento nao aceita data retroativa ao dia atual nem ao movimento mais recente;
- divergencias entre saldo contado e saldo calculado congelam a sessao e exigem
  decisao de outro usuario configurado como aprovador;
- a aprovacao gera um movimento de ajuste auditavel e fecha a sessao; a rejeicao
  reabre a sessao para correcao;
- a conciliacao de transferencia de um OFX historico continua exigindo que o caixa
  contraparte esteja aberto; quando a data bancaria for anterior a abertura atual,
  a transferencia fica registrada sem vinculo com essa sessao, evitando descontar
  novamente do saldo operacional que ja foi conferido na abertura;
- a trilha de auditoria preserva usuario, data, valor, documento e motivo.

## Controle diario consolidado

- a configuracao `FINANCEIRO_CAIXA_DIARIO_CONFIG` nasce com o bloqueio desligado;
- somente o superadmin ativa ou desativa a flag e escolhe responsaveis e aprovadores;
- os responsaveis escolhidos operam a rotina e sao os usuarios sujeitos ao bloqueio;
- com a flag ativa, novas mutacoes financeiras desses usuarios ficam bloqueadas ate
  todas as contas controladas possuirem sessao aberta na data operacional;
- consultas, conciliacao OFX e o proprio controle diario continuam disponiveis para
  permitir a regularizacao;
- fechar as contas ao fim do dia volta a bloquear novas mutacoes ate a abertura do
  proximo dia, sem impedir consulta ao sistema;
- o superadmin nao sofre o bloqueio automatico, mas toda alteracao da configuracao
  e registrada na auditoria.

## Matriz de smoke test

| Cenario | Resultado esperado |
| --- | --- |
| Abrir uma conta `CAIXA_INTERNO` | Sessao aberta com saldo inicial e data registrados |
| Registrar entrada manual | Livro e total de entradas aumentam uma unica vez |
| Registrar saida manual | Livro e total de saidas aumentam uma unica vez |
| Repetir envio protegido | Nenhum movimento duplicado e criado |
| Estornar movimento manual | Movimento original fica estornado e o resumo e recalculado |
| Tentar estornar movimento nao manual | Operacao bloqueada |
| Fechar sem divergencia | Saldo contado e calculado fecham a sessao |
| Fechar com divergencia | Sessao congelada e enviada para aprovacao |
| Aprovar divergencia por outro usuario | Ajuste auditavel criado e sessao fechada |
| Rejeitar divergencia | Sessao reaberta para correcao |
| Ativar flag sem responsavel | Configuracao recusada |
| Responsavel com contas pendentes | Mutacoes financeiras bloqueadas; consultas e conciliacao liberadas |
| Informar data retroativa | Operacao bloqueada no frontend e no backend |
| Conciliar transferencia OFX anterior a abertura atual | Transferencia historica registrada sem alterar o saldo da sessao atual |
| Acessar sem permissao | Rota e acoes permanecem bloqueadas |

## Verificacao automatizada

Execute `node backend/scripts/validarCaixaFisico.js`. O validador confere payloads,
contratos do servico, rotas protegidas, integracao do frontend e esta documentacao.
