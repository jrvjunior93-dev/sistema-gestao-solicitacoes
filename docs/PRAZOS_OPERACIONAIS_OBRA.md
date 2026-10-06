# Prazos operacionais da Obra — primeira etapa

## Escopo implementado

Cobrar a **informação da entrega**, e não penalizar a Obra pelo atraso do fornecedor que já foi comunicado.
O sistema começa desligado. A primeira regra disponível é `ENTREGA_OBRA`; as demais atividades abaixo são candidatas desativadas, sem contadores nem bloqueios próprios nesta etapa.

Configuração: **Configurações → Status e Vínculos → Prazos operacionais** (`/prazos-operacionais`).
A página e a API usam a permissão de configuração de Status e Vínculos já existente.
Liberação temporária de obra é restrita ao SUPERADMIN.
Chave no banco: `PRAZOS_OPERACIONAIS_CONFIG`. Não há variável de ambiente nova.

## Qual atividade deve ser feita

1. Compras confirma a previsão do fornecedor ao gerar o pedido ou ao reprogramar a entrega.
2. A previsão confirmada do item inicia um ciclo de obrigação da Obra. A data desejada para a compra **não** é a referência.
3. A Obra informa recebimento total, parcial ou não entrega no acompanhamento do pedido, pelos detalhes da solicitação.
4. Esse registro cumpre a obrigação daquele item. Se restar mercadoria ou houver divergência, a pendência passa para Compras pelo fluxo de entrega já existente.
5. Uma nova previsão confirmada abre outro ciclo para o saldo restante. Não reinicia silenciosamente o ciclo anterior.

Previsão ainda ausente, pedido cancelado, item removido ou saldo já totalmente recebido não originam bloqueio desta regra.
Registros de entrega, obrigação e histórico participam da mesma transação. Replay da operação não cria recebimentos ou obrigações duplicados.

## Como contar o prazo

Cada ciclo grava a regra usada, os feriados considerados, o início, o prazo e o limite após a tolerância.
Alterações de duração/calendário/horário valem para novos ciclos. A chave de configuração tem revisão, evitando sobrescrever uma edição concorrente.

| Ajuste | Significado |
| --- | --- |
| Cobrança ativa e início | Habilita novos ciclos a partir da data escolhida. Ativação exige hoje ou data futura. |
| Observar | Mostra prazos e avisos, sem o novo bloqueio. |
| Bloquear | Opera a restrição quando houver ao menos um limite vencido na obra. |
| Hora da previsão | Previsões atuais são DATEONLY. Usa o horário escolhido em America/Sao_Paulo, sem depender do fuso da EC2. |
| Horas corridas | Soma horas reais, incluindo noites, fins de semana e feriados. |
| Horas úteis | Soma somente o expediente configurado, de segunda a sexta, excluindo `COMPRAS_ENTREGA_FERIADOS`. |
| Dias corridos | Soma períodos de 24 horas à referência. |
| Dias úteis | Avança datas úteis, preservando a hora de referência. Não conta sábados, domingos nem os feriados de Compras. |
| Tolerância | É acrescentada depois do prazo, com a mesma unidade e o mesmo calendário. O bloqueio começa ao alcançar esse limite. |
| Aviso | Janela visual anterior ao limite: dias equivalem a 24 horas, horas a 60 minutos, inclusive no calendário útil. Não altera o vencimento. |

Exemplo: previsão na sexta, às 18h; prazo de 1 dia útil; segunda cadastrada como feriado. Prazo na terça às 18h. Com tolerância de 1 dia útil, limite na quarta às 18h.
Exemplo: previsão sexta às 17h; prazo de 3 horas úteis; expediente 8h–18h; segunda feriado. Conta 1h sexta e 2h terça: prazo terça às 10h.
Uma confirmação registrada depois da hora de referência usa, no mínimo, o instante atual; não nasce com prazo já vencido.

## O que fica bloqueado

Quando o limite vence, usuários cujo **setor principal tem a capacidade Obra** e que estão vinculados à obra recebem HTTP 423 nas operações protegidas daquela obra. O código é `OBRA_PRAZO_OPERACIONAL_PENDENTE`.
Não é bloqueio administrativo geral: GEO, Compras, Financeiro e SUPERADMIN não recebem esta nova restrição.
Uma obra sem pendência continua operando quando seu contexto é identificado pela operação. Lotes verificam todos os alvos antes de autorizar, sem executar parcialmente um lote com obra bloqueada.

Cobertura central de mutações: solicitações, compras, contratos, RH, financeiro, obras, apropriações, recargas, boletos, prioridades, custos/recebíveis, SST, comercial e provisões.
Os vínculos persistidos de solicitação/compra/pedido/contrato/aditivo/medição/título/RH/provisão/apropriação têm prioridade sobre o corpo HTTP. Informar outra obra no corpo não substitui a obra de origem.

**Proteção para contexto desconhecido:** se o usuário tem obra bloqueada e uma mutação desses módulos não permite identificar com segurança a obra alvo, a operação também é recusada. Não liberar por um `obra_id` extra que o endpoint não utiliza. Antes de liberar ações adicionais desses módulos a usuários da Obra, mapear o alvo no `prazosOperacionaisRotaService`; principalmente importações multiorigem e recursos indiretos ainda sem resolvedor. Começar pelo modo Observar permite validar a operação desejada antes de ativar o bloqueio.
Os dois importadores de apropriações cuja obra vem do multipart repetem a guarda depois do parser e antes do controller.

Continuam disponíveis:

- Consultas GET/HEAD e navegação; não há redirecionamento geral para fora do sistema.
- Informar recebimento ou não entrega, tanto na operação em lote do pedido quanto no endpoint de recebimento individual. Permissões e vínculo à obra continuam sendo verificados pelo controller.
- Perfil, autenticação, comunicação e cadastros globais sem contexto de obra. Criar um cadastro não libera o uso desse cadastro em uma operação bloqueada.
- Operações de outras obras com contexto resolvido e sem pendência vencida.

O topo mostra a obra e links para as solicitações a regularizar. O contador ao lado do código, na tabela e nos cards da lista atual, exibe a obrigação mais próxima e a quantidade de itens pendentes. Usa o relógio do servidor e atualização por minuto/foco; o backend verifica novamente em cada escrita, independentemente de a tela ter sido atualizada.
O contador informa prazo, não constitui uma permissão de ação. O usuário precisa continuar autorizado a visualizar a solicitação; para Obra, a permissão `solicitacoes.lista.visualizar_minhas` inclui suas obras vinculadas.

## Como liberar

A liberação normal é registrar a informação de todos os itens **vencidos** da obra. Itens futuros continuam com seus contadores; não impedem operar antes do limite.
Entrega parcial/não entrega não exige que a Obra aguarde o fornecedor nem que Compras reprogramem para voltar a operar.
Liberação excepcional: SUPERADMIN informa ID da obra, motivo e validade futura de até 7 dias. O registro fica no banco com autor, validade e chave idempotente. Não apaga nem cumpre obrigações; ao expirar, prazos vencidos voltam a impedir operações.

Desativar a regra suspende sua cobrança; mudar o modo para Observar remove apenas o novo bloqueio. Reativar pode cobrar ciclos anteriormente criados que continuam pendentes. Não recria ciclos para confirmações realizadas durante a pausa.
Se o início configurado está no futuro, a cobrança fica suspensa até essa data, inclusive para ciclos anteriores ainda pendentes; seus prazos gravados não são recalculados.

## Legado e controles preservados

Não há backfill. Pedidos/controles antigos não recebem a nova obrigação só porque a configuração foi ativada. Uma confirmação/reprogramação posterior pode gerar um ciclo novo.
A proteção antiga contra criar SC/Compra Direta com entrega vencida continua para itens nunca adotados pela regra nova. Itens com histórico de ciclo novo obedecem o novo prazo/tolerância, evitando bloqueio antecipado pela comparação legada de datas.
O prazo de 2 dias úteis para Compras reprogramar e a restrição existente de geração de novos pedidos não foram alterados.
Bloqueio diário de caixa, permissões granulares, retorno da solicitação e controles de custos/recebíveis permanecem independentes. Uma liberação nesta regra não supera os demais controles.

## Outras omissões mapeadas para próximas etapas

| Atividade da Obra | Evento de início que deverá existir | Prejuízo da omissão | Condição para futura regularização |
| --- | --- | --- | --- |
| Responder pedido de documento | Pedido explícito do administrativo com obra, solicitante e documento necessário | Impede conferir, analisar ou criar títulos | Entregar documento e registrar resposta/validação; não exigir algo nunca solicitado |
| Corrigir informações devolvidas | Devolução registrada com motivo e campos a corrigir | Administrativo não consegue prosseguir com dados incorretos | Corrigir e reenviar; separar análise administrativa posterior da obrigação da Obra |
| Devolver solicitação após retorno aprovado | Retorno aprovado para ação temporária | Solicitação fica fora do setor que precisa continuá-la | Usar Devolver ao setor anterior; distinguir retorno temporário de recebimento normal |
| Prestar contas de recarga | Uso/liberação da recarga com prazo pactuado | Falta evidência da utilização e apropriação do recurso | Registrar prestação e anexos; não responsabilizar Obra pelo prazo de conferência administrativa |
| Planejamento/medição | Competência/medição efetivamente atribuída à Obra | Ausência de informação impede custos e recebíveis | Concluir a atividade própria; integrar com os controles existentes, sem duplicar bloqueios |

Essas regras não podem ser ativadas pela página nesta versão. Cada etapa exigirá gatilho confiável, dono, prazo, exceções, resolução transacional, permissões de regularização e testes de não penalização pelo trabalho de outro setor.

## Publicação e ativação segura

1. Publicar os arquivos após autorização. Aplicar `202610060001_prazos_operacionais.js` no ambiente correto pelo runner habitual, com backup; depois reiniciar somente o backend desse ambiente e publicar o frontend.
2. Nenhuma variável de ambiente precisa ser criada. A migration deixa a chave desligada e não cria obrigações para pedidos antigos.
3. Verificar permissões de consulta, vínculos de obra e o acesso ao acompanhamento de entregas dos usuários que serão cobrados.
4. Configurar datas/calendário e iniciar em Observar. Testar um ciclo novo: previsão, contador, parcial/não entrega e reprogramação.
5. Testar Bloquear: uma obra vencida, outra obra disponível, dois usuários da mesma obra, consultas, regularização, usuário administrativo e superadmin. Validar também os endpoints adicionais que foram concedidos à Obra.
6. Ativar Bloquear só depois desses testes operacionais. Não executar backfill ou editar prazos de pedidos antigos para forçar o primeiro bloqueio sem análise separada.

Testes locais: `backend: npm run test:prazos-operacionais` e `npm run test:pedido-entregas`; `frontend: npm run test:prazos-operacionais`, `npm run test:pedido-entregas`, validação de navegação e build.
