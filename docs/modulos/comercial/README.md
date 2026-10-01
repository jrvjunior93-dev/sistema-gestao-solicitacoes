# Modulo COMERCIAL

## Papel

Comercial representa a operacao de venda da construtora: empreendimentos, unidades, clientes, contratos de venda, parcelas e carteira de recebimentos. Nao representa distribuicao ou venda do sistema FLUXY.

## Propriedade

- empreendimento e unidade pertencem ao modulo Comercial;
- parceiro/cliente pertence ao cadastro mestre de Parceiros;
- contrato de venda e sua agenda pertencem ao Comercial;
- titulo, baixa e estorno pertencem ao Financeiro;
- boleto pertence ao modulo Boletos.

## Regras

- unidade deve pertencer ao empreendimento correto;
- contrato exige cliente, unidade, valores e condicoes consistentes;
- uma unidade nao pode possuir contratos ativos conflitantes;
- agenda de recebimentos deve fechar o valor contratual conforme ajustes permitidos;
- cada parcela gera no maximo um titulo financeiro de origem;
- alterar contrato com titulo movimentado exige tratamento explicito;
- cancelamento preserva historico e nao apaga recebimentos;
- dinheiro, PIX, cartao, boleto, permuta e bens devem manter forma e evidencia da liquidacao.

## Contrato pago com cheque

- quando uma parcela do contrato de venda e registrada com cheque, a entrega do cheque quita a obrigacao do cliente naquele momento;
- a baixa do titulo e a entrada do cheque de terceiro acontecem na mesma transacao: o titulo fica `QUITADO`, o movimento financeiro e registrado sem conta bancaria e o cheque nasce `EM_CARTEIRA`;
- cheque em carteira ainda nao significa dinheiro compensado em banco; deposito, compensacao, utilizacao em pagamento ou devolucao possuem seus proprios eventos;
- devolver o cheque desfaz o efeito de custodia conforme a rotina financeira e reabre o saldo relacionado quando aplicavel; nao se deve corrigir titulo e cheque separadamente por SQL;
- registros historicos anteriores a essa regra nao recebem backfill automatico: devem ser auditados e regularizados caso a caso para preservar extratos e relatorios.

## Importacao historica de contratos e extratos

- a importacao usa as abas `CONTRATOS`, `COMPRADORES`, `UNIDADES_CONTRATO`, `PARCELAS` e `RECEBIMENTOS`;
- a validacao gera um preview sem gravar contrato, cliente, unidade, titulo ou recebimento;
- empreendimento, unidade ativa, ausencia de contrato conflitante, soma das unidades, soma das parcelas, saldo e recebimentos sao revalidados;
- unidade marcada como vendida sem contrato pode ser recuperada pela importacao, mas unidade inexistente, inativa, bloqueada ou vinculada a outro contrato impede a confirmacao;
- a confirmacao revalida tudo dentro da transacao, bloqueia as unidades, usa chave de idempotencia e preserva os recebimentos historicos sem conta bancaria e sem conciliacao;
- se os dados mudarem entre preview e confirmacao, o usuario deve gerar novo preview; nao ha correcao silenciosa do arquivo nem do cadastro mestre.

## Integracoes

Parceiros fornece cliente. Obras pode fornecer empreendimento/centro relacionado quando configurado. Financeiro recebe parcelas e continua autoridade de recebimentos. CRM pode converter oportunidade em cliente/contrato apenas por fluxo autorizado. Documentos e assinatura externa devem preservar status e auditoria.

## Mudanca segura

Testar disponibilidade e multiunidade, valor total, agenda, geracao idempotente de titulos, cheque quitado e em carteira, devolucao, cancelamento, preview e confirmacao de importacao, recebimentos historicos, relatorios e permissoes.
