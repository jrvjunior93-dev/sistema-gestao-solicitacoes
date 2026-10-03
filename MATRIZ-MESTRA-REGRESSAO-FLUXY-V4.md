# Matriz mestra de regressao — Fluxy-V4

Data-base: 27/08/2026
Comparacao: `C:\Fluxy` (referencia, somente leitura) x `C:\Users\Ricardo\Documents\Fluxy-V4`
Execucao: navegador interno visivel + API/banco local quando o caso exigir

## 1. Objetivo e criterio de conclusao

Esta matriz substitui, para novas execucoes, a leitura isolada de
`MATRIZ-DE-TESTE-FLUXO-DE-CONTRATOS.md`. A matriz antiga continua sendo evidencia historica da
execucao de 24/08, mas nao prova as decisoes implantadas depois daquela data.

A validacao so pode ser declarada 100% concluida quando:

- todos os casos `P0` e `P1` estiverem `APROVADO`;
- cada gravacao de QA tiver limpeza confirmada pelo ID criado e comparacao antes/depois;
- nenhum caso produzir HTTP 500, erro de console sem tratamento ou registro duplicado;
- frontend, backend, permissao e persistencia tiverem sido verificados no mesmo comportamento;
- os casos de legado abrirem sem conversao automatica para o fluxo novo;
- toda falha corrigida for repetida no caso original e em sua regressao adjacente.

Status usados: `PENDENTE`, `EM EXECUCAO`, `APROVADO`, `REPROVADO`, `BLOQUEADO`, `NAO APLICAVEL`.

## 2. Seguranca da execucao

| Classe | Natureza | Regra |
|---|---|---|
| R0 | leitura/navegacao | Pode executar sem gravar dados. |
| R1 | formulario sem enviar | Pode preencher e validar mensagens; sair sem salvar. |
| R2 | transacional | Avisar antes; capturar estado; criar IDs proprios; restaurar e conferir. |
| R3 | persistente/manual | Exige autorizacao operacional especifica e plano de reversao. |

Nao reiniciar a porta 8100 durante o trabalho do outro agente sem aviso. Nao executar as suites
antigas de `qa/obra-tipo-apropriacao` enquanto mantiverem limpeza destrutiva. Nao acessar GitHub,
EC2 ou producao.

## 3. Perfis e dados controlados

| Perfil | Setor/papel | Uso principal |
|---|---|---|
| PF-ADM | SUPERADMIN | configuracoes, cartoes, campos, limites e matriz de permissoes |
| PF-OBRA | OBRA | abertura, medicao, aditivo, retorno e acompanhamento |
| PF-GP | GERENCIA DE PROCESSOS (`GEO`) | aprovacao, rejeicao, aditivo e prestacao de recarga |
| PF-JUR | JURIDICO | minuta, rejeicao, conferencia do assinado |
| PF-FIN | FINANCEIRO | titulos, baixa, estorno, relatorios e conciliacao |
| PF-LEIT | usuario com `visualizar_todas` | leitura ampla sem mutacao |
| PF-NEG | usuario sem permissoes do caso | provas 403 e ausencia de botoes |

Usuarios locais historicos para contrato: `matriz-obra@teste.local`, `matriz-gp@teste.local` e
`matriz-juridico@teste.local`, senha definida apenas no ambiente local. Antes de usa-los, conferir setor, obra, ativo e
permissoes atuais; nao presumir que a fotografia de 24/08 ainda vale.

## 4. Pre-flight do ambiente

| ID | Pri. | Risco | Caso | Resultado esperado | Status |
|---|---:|---:|---|---|---|
| ENV-001 | P0 | R0 | Abrir frontend em `127.0.0.1:5273` | Aplicacao carrega sem tela interrompida | APROVADO |
| ENV-002 | P0 | R0 | Consultar backend local | Porta 8100 responde e processo corresponde ao codigo atual | APROVADO |
| ENV-003 | P0 | R0 | Conferir migrations | Nenhuma pendente, duplicada ou fora da convencao `0050+` da V4 | APROVADO |
| ENV-004 | P0 | R0 | Conferir console na carga | Sem erro React, 401 inesperado ou requisicao em loop | APROVADO |
| ENV-005 | P0 | R0 | Conferir usuarios de teste | Ativos, setores corretos, obras e permissoes documentadas | APROVADO |
| ENV-006 | P0 | R0 | Fotografar configuracoes compartilhadas | Limites, formas, campos e permissoes registrados antes do QA | APROVADO |
| ENV-007 | P0 | R0 | Conferir sequencias | Contrato e titulo alinhados ao maior codigo existente | APROVADO |
| ENV-008 | P1 | R0 | Comparar inventario de telas Fluxy/V4 | Toda tela alterada classificada nesta matriz | APROVADO |
| ENV-009 | P1 | R0 | Build frontend | Build de producao sem erro | APROVADO |
| ENV-010 | P1 | R0 | Carga de rotas/backend | Rotas carregam sem erro de sintaxe/modelo | APROVADO |

## 5. Fluxo novo de contratos

### 5.1 Configuracao e abertura

| ID | Pri. | Risco | Perfil | Caso | Resultado esperado | Status |
|---|---:|---:|---|---|---|---|
| CT-001 | P0 | R0 | PF-ADM | Abrir Campos da Nova Solicitacao para Contrato | Campos novos listados, sem duplicidade | APROVADO |
| CT-002 | P0 | R2 | PF-ADM | Alterar visibilidade/obrigatoriedade e recarregar | Configuracao persiste e a Nova Solicitacao obedece | APROVADO |
| CT-003 | P0 | R0 | PF-ADM | Abrir Contratos: alertas e formas | Limite juridico, cores e formas carregam | APROVADO |
| CT-004 | P1 | R1 | PF-ADM | Salvar faixas invalidas | Bloqueio claro; nenhuma configuracao alterada | APROVADO |
| CT-005 | P0 | R1 | PF-OBRA | Selecionar tipo Contrato | Formulario estruturado aparece dentro de Nova Solicitacao | APROVADO |
| CT-006 | P0 | R1 | PF-OBRA | Conferir cabecalho/campos | Titulo, objeto, justificativa, credor, vigencia, pagamento e parcelas organizados; favorecido fica para a medicao | APROVADO |
| CT-007 | P0 | R1 | PF-OBRA | Condicao PIX na abertura | Registra a condicao, sem antecipar favorecido/chave/contato que pertencem a medicao | APROVADO |
| CT-008 | P0 | R1 | PF-OBRA | Favorecido na abertura | Nao aparece nem e exigido; credor/favorecido e chave 1→2→3 sao definidos na medicao | APROVADO |
| CT-009 | P0 | R1 | PF-OBRA | Condicao Boleto na abertura | Registra a condicao, sem exigir boleto antes da medicao | APROVADO |
| CT-010 | P1 | R1 | PF-OBRA | Outra forma | Nao exige nem persiste campos exclusivos de PIX/Boleto | APROVADO |
| CT-011 | P0 | R1 | PF-OBRA | Parcelas manuais | Soma fecha o contrato; edicao redistribui sem arredondamento perdido | APROVADO |
| CT-012 | P1 | R1 | PF-OBRA | Trava interna de parcela | Regra continua funcionando, coluna Trava permanece oculta | APROVADO |
| CT-013 | P0 | R1 | PF-OBRA | Valores zero, negativos, vazios e soma divergente | Front e back recusam com mensagem 400, nunca 500 | APROVADO |
| CT-014 | P0 | R1 | PF-OBRA | Valor exatamente no limite juridico | Nao abre documentacao juridica adicional | APROVADO |
| CT-015 | P0 | R1 | PF-OBRA | Valor um centavo acima do limite | Abre tres anexos juridicos e qualificacao | APROVADO |
| CT-016 | P0 | R1 | PF-OBRA | Documentacao juridica incompleta | Criacao recusada com campos nominais | APROVADO |
| CT-017 | P0 | R1 | PF-OBRA | Estado civil diferente de casado | Dados de conjuge nao exigidos | APROVADO |
| CT-018 | P0 | R1 | PF-OBRA | Estado civil casado | Seis campos do conjuge e regime de bens obrigatorios | APROVADO |
| CT-019 | P0 | R1 | PF-OBRA | CPF do conjuge igual ao representante | Backend recusa | APROVADO |
| CT-020 | P0 | R1 | PF-OBRA | Negociacao detalhada conforme regra vigente | Obrigatoria em todo contrato; o limite regula somente a documentacao juridica adicional | APROVADO |
| CT-021 | P1 | R1 | PF-OBRA | Arquivos invalidos/macro/extensao falsa | Upload recusado antes de persistir contrato | APROVADO |
| CT-022 | P0 | R2 | PF-OBRA | Duplo clique em Criar | Uma solicitacao, um contrato e um codigo | APROVADO |
| CT-023 | P0 | R2 | PF-OBRA | Criar abaixo do limite | Nasce PENDENTE/na GEO, parcelas PREVISAO e sem titulo aberto indevido | APROVADO |
| CT-024 | P0 | R2 | PF-OBRA | Criar acima do limite | Nasce PENDENTE/na GEO e guarda fotografia juridica | APROVADO |
| CT-025 | P0 | R2 | concorrente | Duas criacoes simultaneas | Codigos unicos e sequencia consistente | APROVADO |

### 5.2 Aprovacao, Juridico, rejeicao e assinatura

| ID | Pri. | Risco | Perfil | Caso | Resultado esperado | Status |
|---|---:|---:|---|---|---|---|
| CT-026 | P0 | R0 | PF-OBRA | Abrir contrato na GEO | Acompanha, mas nao aprova/rejeita/cancela | APROVADO |
| CT-027 | P0 | R0 | PF-GP | Abrir contrato na GEO | Acoes da etapa aparecem conforme permissoes | APROVADO |
| CT-028 | P0 | R2 | PF-GP | Aprovar abaixo do limite | Contrato ATIVO, titulos ABERTO, solicitacao volta a OBRA | APROVADO |
| CT-029 | P0 | R2 | PF-GP | Aprovar acima do limite | Solicitação chega ao JURIDICO como PENDENTE | APROVADO |
| CT-030 | P0 | R1 | PF-GP | Aprovar sem categoria exigida | Mensagem coerente; nao pede vencimento ja definido na parcela | APROVADO |
| CT-031 | P0 | R0 | PF-JUR | Abrir etapa juridica | Pode tramitar; nao ve acao reservada ao solicitante | APROVADO |
| CT-032 | P0 | R2 | PF-JUR | Rejeitar com motivo | Volta ao setor criador, contrato REJEITADO, motivo/historico | APROVADO |
| CT-033 | P0 | R1 | PF-JUR | Rejeitar sem motivo | Recusado sem alterar estado | APROVADO |
| CT-034 | P0 | R0 | PF-JUR | Apos rejeitar | Juridico nao ve botao Solicitar revisao | APROVADO |
| CT-035 | P0 | R1 | PF-OBRA | Reenviar sem comentario e sem arquivo | Recusado | APROVADO |
| CT-036 | P0 | R2 | PF-OBRA | Reenviar com comentario | Solicitacao ATENDIDO e retorna a etapa rejeitora | APROVADO |
| CT-037 | P0 | R2 | PF-OBRA | Reenviar somente com arquivo novo | Aceito, sem duplicar arquivo | APROVADO |
| CT-038 | P0 | R1 | PF-OBRA | Usar arquivo anterior a rejeicao | Recusado | APROVADO |
| CT-039 | P0 | R2 | PF-JUR | Enviar minuta por arquivo | Aguardando assinatura; volta ao setor criador | APROVADO |
| CT-040 | P1 | R2 | PF-JUR | Enviar minuta por link | Mesmo estado e historico coerente | APROVADO |
| CT-041 | P0 | R0 | PF-GP | Contrato aguardando assinatura acima do limite | GEO nao pode cancelar | APROVADO |
| CT-042 | P0 | R0 | PF-OBRA | Contrato aguardando assinatura | Autor ve Confirmar assinatura; nao Enviar minuta | APROVADO |
| CT-043 | P0 | R2 | PF-OBRA | Confirmar sem assinado | Recusado | APROVADO |
| CT-044 | P0 | R2 | PF-OBRA | Anexar assinado e confirmar | Volta ao Juridico em PENDENTE/destaque | APROVADO |
| CT-045 | P0 | R2 | PF-JUR | Conferir assinado | Contrato ATIVO, titulos ABERTO, volta a OBRA | APROVADO |
| CT-046 | P0 | R2 | PF-JUR | Repetir conferencia | Idempotente/409; nao duplica titulos | APROVADO |

### 5.3 Detalhe, visibilidade, retorno e notificacoes

| ID | Pri. | Risco | Perfil | Caso | Resultado esperado | Status |
|---|---:|---:|---|---|---|---|
| CT-047 | P0 | R0 | qualquer | Cabecalho do detalhe | `CONTRATO - numero` sem `CT-`; titulo abaixo; objeto na primeira linha | APROVADO |
| CT-048 | P1 | R0 | qualquer | Campos removidos | Sem card Contrato redundante e sem Numero do Pedido | APROVADO |
| CT-049 | P1 | R0 | qualquer | Financeiro no detalhe | Sem selo Somente leitura, card Pagamentos e pagamento parcial | APROVADO |
| CT-050 | P0 | R0 | PF-OBRA | Aba Financeiro visivel | Parcelas/medicoes visiveis, botoes apenas quando regra permite | APROVADO |
| CT-051 | P0 | R0 | PF-LEIT | `visualizar_todas` fora da obra/setor | Lista e detalhe 200; nenhuma mutacao habilitada | APROVADO |
| CT-052 | P0 | R1 | fora do setor | Tentar comentar/anexar/medir/aditivar | Front bloqueia e backend retorna 403 | APROVADO |
| CT-053 | P0 | R2 | fora do setor | Solicitar retorno com motivo | Um pedido, faixa visivel e notificacao Acao necessaria | APROVADO |
| CT-054 | P0 | R2 | fora do setor | Repetir pedido | Retorna o mesmo pedido pendente | APROVADO |
| CT-055 | P0 | R2 | setor atual | Aprovar retorno | Move somente setor; preserva status e registra historico | APROVADO |
| CT-056 | P0 | R2 | setor atual | Rejeitar sem/com motivo | Sem motivo recusa; com motivo notifica e preserva setor | APROVADO |
| CT-057 | P1 | R2 | solicitante | Cancelar retorno pendente | Cancela, notifica e remove a acao pendente | APROVADO |
| CT-058 | P0 | R1 | setor atual | Retorno com aditivo pendente | Bloqueado ate decidir o aditivo | APROVADO |
| CT-059 | P1 | R0 | PF-NEG | Sem permissoes de retorno | Faixa nao oferece acao; endpoints 403 | APROVADO |
| CT-060 | P1 | R0 | qualquer | Sino e foco da janela | Atualiza pedido em ate 30s/ao focar e abre detalhe correto | APROVADO |

### 5.4 Medicao, parcelas, titulos e baixa

| ID | Pri. | Risco | Perfil | Caso | Resultado esperado | Status |
|---|---:|---:|---|---|---|---|
| CT-061 | P0 | R1 | PF-OBRA | Abrir Medicao de contrato novo | Lista parcelas elegiveis; nao mistura formulario legado | APROVADO |
| CT-062 | P0 | R1 | PF-OBRA | Forma de pagamento antes dos detalhes | PIX/Boleto abrem somente os campos aplicaveis | APROVADO |
| CT-063 | P0 | R1 | PF-OBRA | Medicao sem arquivo | Recusada | APROVADO |
| CT-064 | P0 | R1 | PF-OBRA | PIX sem favorecido/chave | Recusado campo a campo | APROVADO |
| CT-065 | P0 | R1 | PF-OBRA | Boleto sem boleto | Recusado; nao exige PIX | APROVADO |
| CT-066 | P0 | R2 | PF-OBRA | Criar medicao valida | Medicao vinculada a parcela; NEC. DE MEDICAO | APROVADO |
| CT-067 | P0 | R1 | PF-OBRA | Medir mesma parcela duas vezes | Bloqueio indica a medicao existente | APROVADO |
| CT-068 | P0 | R1 | PF-OBRA | Medir acima do saldo | Recusado e orienta termo aditivo | APROVADO |
| CT-069 | P0 | R2 | PF-GP | Aprovar antes do upload efetivo | Recusado | APROVADO |
| CT-070 | P0 | R2 | PF-GP | Aprovar com anexo efetivo | Solicitacao LIBERADO e situacao da parcela/titulo LIBERADA | APROVADO |
| CT-071 | P0 | R1 | PF-OBRA | Tentar aprovar | 403 | APROVADO |
| CT-072 | P0 | R2 | PF-GP | Aprovar novamente | 409/idempotente; sem evento duplicado | APROVADO |
| CT-073 | P0 | R0 | qualquer | Transicao visual | PREVISAO antes, ABERTO apos contrato, LIBERADA apos medicao | APROVADO |
| CT-074 | P0 | R0 | PF-FIN | Previsao em relatorios/baixa | Nao entra como titulo pagavel/DRE antes de abrir | APROVADO |
| CT-075 | P0 | R2 | PF-FIN | Baixa parcial | Status contabil PARCIAL/encerramento correto; redistribuicao coerente | APROVADO |
| CT-076 | P0 | R2 | PF-FIN | Estornar baixa | Parcela, medicao, titulo e saldo retornam exatamente | APROVADO |
| CT-077 | P0 | R2 | PF-FIN | Pagar acima/abaixo do previsto | Diferenca redistribuida sem alterar total contratado | APROVADO |
| CT-078 | P1 | R0 | PF-FIN | Arquivos no Financeiro de Obras | Linha abre anexos/comprovantes do titulo | APROVADO |
| CT-079 | P1 | R0 | PF-FIN | Titulo manual/importado sem solicitacao | Mensagem explicativa, sem modal vazio/500 | APROVADO |

### 5.5 Termo aditivo e encerramento

| ID | Pri. | Risco | Perfil | Caso | Resultado esperado | Status |
|---|---:|---:|---|---|---|---|
| CT-080 | P0 | R2 | PF-OBRA | Solicitar termo aditivo | Vai para GEO com status PED. ADITIVO | APROVADO |
| CT-081 | P0 | R0 | PF-OBRA | Aditivo pendente | Sem aprovar/rejeitar/cancelar | APROVADO |
| CT-082 | P0 | R1 | PF-GP | Rejeitar sem motivo | Recusado | APROVADO |
| CT-083 | P0 | R2 | PF-GP | Rejeitar/cancelar | Estados e eventos distintos | APROVADO |
| CT-084 | P0 | R2 | PF-GP | Aprovar aditivo de valor valido | Aumenta contrato, cria parcela e volta a OBRA | APROVADO |
| CT-085 | P0 | R1 | PF-GP | Exceder 25% | Botao bloqueado e backend recusa | APROVADO |
| CT-086 | P1 | R2 | PF-GP | Aditivo de prazo | Vigencia/parcela recalculadas sem remedir parcela medida | APROVADO |
| CT-087 | P0 | R2 | PF-GP | Aprovar duas vezes | Idempotente; uma parcela/evento | APROVADO |
| CT-088 | P1 | R2 | PF-OBRA | Ultima medicao menor | Sobra vira saldo, com historico | APROVADO |
| CT-089 | P0 | R2 | PF-GP | Encerrar contrato | Sobra zerada e nao admite nova medicao/aditivo | APROVADO |
| CT-090 | P0 | R1 | PF-OBRA | Tentar encerrar | 403 | APROVADO |

### 5.6 Compatibilidade legada e Gestao de Contratos

| ID | Pri. | Risco | Perfil | Caso | Resultado esperado | Status |
|---|---:|---:|---|---|---|---|
| CT-091 | P0 | R0 | PF-OBRA | Abrir contrato legado | Continua no fluxo antigo | APROVADO |
| CT-092 | P0 | R1 | PF-OBRA | Medir contrato legado | Formulario e regras antigas preservados | APROVADO |
| CT-093 | P0 | R0 | qualquer | Abrir medicao historica | Dados/anexos continuam legiveis | APROVADO |
| CT-094 | P1 | R0 | PF-ADM | Gestao de Contratos | Lista, filtro, detalhe e edicao carregam | APROVADO |
| CT-095 | P0 | R2 | autorizado | Anexar negociacao detalhada ausente pela edicao | Aceito com escopo de obra/permissao corretos | APROVADO |
| CT-096 | P0 | R1 | sem obra/permissao | Tentar editar/anexar | 403 explicativo; nunca 500 | APROVADO |
| CT-097 | P0 | R2 | autorizado | Completar documentos juridicos na edicao | Slots substituidos sob lock, sem duplicar | APROVADO |
| CT-098 | P1 | R0 | qualquer | Contratos comerciais | Geracao de PDF/modelos Piemonte nao alterada pelo fluxo de solicitacoes | APROVADO |
| CT-099 | P1 | R0 | qualquer | D4Sign local desabilitado | Tela informa configuracao ausente sem corromper PDF/status | APROVADO |
| CT-100 | P0 | R0 | qualquer | Consoles do fluxo | Nenhum 500, promessa rejeitada ou erro React | APROVADO |
| CT-101 | P1 | R1 | PF-JUR | Confirmar aprovacao juridica final | Acao critica pede confirmacao nominal antes de criar titulos e mover setor | APROVADO |

## 6. Despesa Eventual

| ID | Pri. | Risco | Perfil | Caso | Resultado esperado | Status |
|---|---:|---:|---|---|---|---|
| DE-001 | P0 | R0 | PF-GP | Tipo disponivel | Somente Gerencia de Processos conforme regra | APROVADO |
| DE-002 | P0 | R1 | PF-GP | Selecionar tipo | Quatro subtipos corretos | APROVADO |
| DE-003 | P0 | R1 | PF-GP | Campos obrigatorios | Obra, subtipo, fornecedor, favorecido, valor, apropriacao, vencimento, justificativa, pagamento e comprovante | APROVADO |
| DE-004 | P0 | R1 | PF-GP | Saldo ao escolher obra | Exibe limite da obra, comprometido, disponivel e saldo apos digitacao | APROVADO |
| DE-005 | P0 | R1 | PF-GP | Valor acima do limite por solicitacao | Front e back recusam | APROVADO |
| DE-006 | P0 | R1 | PF-GP | Valor que excede saldo da obra | Front e back recusam | APROVADO |
| DE-007 | P0 | R1 | PF-GP | Valor exatamente no limite | Aceito se houver saldo | APROVADO |
| DE-008 | P0 | R1 | PF-GP | Justificativa vazia | Recusada | APROVADO |
| DE-009 | P0 | R1 | PF-GP | Comprovante ausente | Recusada | APROVADO |
| DE-010 | P0 | R1 | PF-GP | Declaracoes nao marcadas | Recusada e identifica cada restricao | APROVADO |
| DE-011 | P0 | R1 | PF-GP | PIX | Favorecido/chave aplicaveis e editaveis | APROVADO |
| DE-012 | P0 | R1 | PF-GP | Transferencia bancaria | Aceita forma normalizada com/sem acento | APROVADO |
| DE-013 | P0 | R1 | PF-GP | Boleto | Exige boleto e comprovante da despesa separadamente | APROVADO |
| DE-014 | P0 | R2 | PF-GP | Criacao valida | Solicitação criada uma vez e compromete saldo | APROVADO |
| DE-015 | P0 | R2 | concorrente | Dois envios no limite remanescente | Lock impede estouro da obra | APROVADO |
| DE-016 | P0 | R2 | PF-GP | Cancelar/rejeitar caso de QA | Deixa de comprometer saldo conforme regra | APROVADO |
| DE-017 | P1 | R2 | PF-ADM | Alterar limites e recarregar | UI e backend usam a nova configuracao | APROVADO |
| DE-018 | P1 | R0 | PF-NEG | Usuario/setor indevido | Tipo ausente ou criacao 403 | APROVADO |
| DE-019 | P1 | R0 | qualquer | Detalhe/lista | Titulo, justificativa, favorecido, forma e saldo coerentes | APROVADO |
| DE-020 | P0 | R2 | QA | Limpeza | Solicitacao/config inseridas removidas por ID e saldo restaurado | APROVADO |

## 7. Recarga de Cartao

| ID | Pri. | Risco | Perfil | Caso | Resultado esperado | Status |
|---|---:|---:|---|---|---|---|
| RC-001 | P0 | R0 | PF-ADM | Abrir Cartoes de Recarga | Lista e formulario carregam sem 400 | APROVADO |
| RC-002 | P0 | R2 | PF-ADM | Cadastrar cartao | Fornecedor, identificacao, final e usuarios persistem | APROVADO |
| RC-003 | P0 | R2 | PF-ADM | Editar cartao | Mesmo ID, dados/vinculos atualizados, cancelamento restaura UI | APROVADO |
| RC-004 | P1 | R1 | PF-ADM | Duplicidade/numero invalido | Recusa sem registro parcial | APROVADO |
| RC-005 | P0 | R0 | usuario vinculado | Selecionar tipo | Lista apenas seus cartoes ativos | APROVADO |
| RC-006 | P0 | R0 | usuario nao vinculado | Selecionar tipo | Nao enxerga o cartao; API nao vaza dados | APROVADO |
| RC-007 | P0 | R1 | usuario vinculado | Campos | Valor, cartao e data prevista/vencimento obrigatorios | APROVADO |
| RC-008 | P1 | R0 | PF-GP | Informacoes automaticas | Ultima recarga e media das seis validadas coerentes | APROVADO |
| RC-009 | P0 | R2 | usuario vinculado | Primeira recarga | Solicitacao + titulo PREVISAO atomicos, sem forma de pagamento nula gerar 500 | APROVADO |
| RC-010 | P0 | R0 | PF-FIN | Antes de liberar | Titulo nao aparece no resultado da obra/DRE | APROVADO |
| RC-011 | P0 | R2 | fluxo | Liberar solicitacao | Titulo vira ABERTO | APROVADO |
| RC-012 | P0 | R1 | usuario | Nova recarga com titulo aberto | Bloqueada | APROVADO |
| RC-013 | P0 | R2 | PF-FIN | Baixa integral | Titulo encerra e abre prestacao pelo pago | APROVADO |
| RC-014 | P0 | R2 | PF-FIN | Baixa parcial | Solicitação/titulo encerram; prestacao somente do valor efetivamente pago | APROVADO |
| RC-015 | P0 | R0 | usuario | Prestacao pendente | Nova recarga bloqueada mesmo sem depender de conciliacao | APROVADO |
| RC-016 | P0 | R1 | usuario | Rateio sem fechar 100%/valor | Recusado | APROVADO |
| RC-017 | P0 | R1 | usuario | Obra nao vinculada | Ausente/recusada | APROVADO |
| RC-018 | P0 | R1 | usuario | Apropriacao somadora/inativa/de outra obra | Recusada | APROVADO |
| RC-019 | P0 | R2 | usuario | Rateio valido em uma obra | Prestacao enviada | APROVADO |
| RC-020 | P0 | R2 | usuario | Rateio valido em varias obras | Valores fecham o pago | APROVADO |
| RC-021 | P0 | R2 | PF-GP | Validar prestacao | Custo passa a Gerencia/Resultado de Obras | APROVADO |
| RC-022 | P0 | R0 | PF-FIN | Conciliacao nao realizada | Nao bloqueia prestacao/validacao | APROVADO |
| RC-023 | P0 | R0 | usuario | Nova recarga apos prestacao validada | Liberada | APROVADO |
| RC-024 | P0 | R2 | concorrente | Duplo envio/validacao | Um ciclo, um titulo, um rateio financeiro | APROVADO |
| RC-025 | P0 | R2 | QA | Rollback e sequencia | Cartao/solicitacao/titulo/rateios restaurados exatamente | APROVADO |

## 8. ADM Local de Obra e Locacao de Maq. e Eq.

| ID | Pri. | Risco | Perfil | Caso | Resultado esperado | Status |
|---|---:|---:|---|---|---|---|
| AL-001 | P0 | R0 | PF-ADM | Tela Apropriacao Padrao por Obra | Duas colunas/tipos distintos e filtros funcionam | APROVADO |
| AL-002 | P0 | R1 | PF-ADM | Vincular ADM | Aceita somente apropriacao ativa, analitica e da obra | APROVADO |
| AL-003 | P0 | R1 | PF-ADM | Vincular Locacao | Vinculo distinto do ADM persiste apos reload | APROVADO |
| AL-004 | P1 | R1 | PF-ADM | Alterar/remover vinculo | Tela e backend permanecem coerentes | APROVADO |
| AL-005 | P1 | R0 | PF-ADM | Somente pendentes | Obra completa sai; incompleta permanece | APROVADO |
| AL-006 | P0 | R2 | PF-ADM | Criar nova OBRA | Cria apropriacoes 1 e 2 e vinculos na mesma transacao | APROVADO |
| AL-007 | P0 | R2 | PF-ADM | Falha no cadastro de obra | Rollback tambem das apropriacoes/vinculos | APROVADO |
| AL-008 | P1 | R2 | PF-ADM | Criar CENTRO_CUSTO | Nao cria os dois padroes | APROVADO |
| AL-009 | P0 | R1 | PF-OBRA | Selecionar ADM em obra vinculada | Nao exige contrato; apropriacao resolvida sem card visivel | APROVADO |
| AL-010 | P0 | R1 | PF-OBRA | Selecionar Locacao em obra vinculada | Mesmo comportamento, usando apropriacao 2 | APROVADO |
| AL-011 | P0 | R1 | PF-OBRA | Obra sem vinculo | Bloqueio explicativo direciona a configuracao | APROVADO |
| AL-012 | P0 | R1 | PF-OBRA | Campos ADM padrao | Titulo, justificativa, credor, favorecido e forma conforme configuracao | APROVADO |
| AL-013 | P0 | R1 | PF-OBRA | Credor como favorecido | Checkbox copia cadastro sem fundir as entidades | APROVADO |
| AL-014 | P0 | R1 | PF-OBRA | PIX | Busca chave 1→2→3, permite editar e exige valor final | APROVADO |
| AL-015 | P0 | R1 | PF-OBRA | Boleto | Campo aparece apos forma e boleto e obrigatorio | APROVADO |
| AL-016 | P0 | R1 | PF-OBRA | Transferencia/outras | Nao persiste chave/boleto inaplicavel | APROVADO |
| AL-017 | P0 | R2 | PF-OBRA | Criar ADM | Solicitacao e titulo herdam apropriacao ADM resolvida pelo backend | APROVADO |
| AL-018 | P0 | R2 | PF-OBRA | Criar Locacao | Solicitacao e titulo herdam apropriacao Locacao | APROVADO |
| AL-019 | P0 | R1 | ataque | Enviar apropriacao diferente no payload | Backend ignora/recusa e usa vinculo autoritativo | APROVADO |
| AL-020 | P1 | R0 | qualquer | Detalhe | Exibe titulo, justificativa, credor/favorecido e forma sem card automatico | APROVADO |
| AL-021 | P0 | R2 | PF-ADM | Configurar campo oculto/opcional | Nova Solicitacao e backend respeitam a configuracao | APROVADO |
| AL-022 | P0 | R2 | PF-ADM | Voltar configuracao ao estado inicial | Fotografia exata restaurada e conferida | APROVADO |
| AL-023 | P1 | R0 | legado | Solicitações antigas | Nao recebem apropriacao retroativa nem mudam de contrato | APROVADO |
| AL-024 | P0 | R2 | concorrente | Duas gravacoes do vinculo | Uma configuracao final consistente | APROVADO |
| AL-025 | P0 | R2 | QA | Limpeza | Obra/vinculos temporarios removidos pelo ID; estado global intacto | APROVADO |

## 9. Regressao das demais diferencas Fluxy → Fluxy-V4

Este bloco fecha a rastreabilidade das areas alteradas fora dos quatro fluxos acima. Casos que
dependem de integracao externa sao provados localmente ate a fronteira da integracao.

### 9.1 Solicitacoes, configuracoes e permissoes

| ID | Pri. | Risco | Caso | Resultado esperado | Status |
|---|---:|---:|---|---|---|
| RG-SOL-001 | P0 | R0 | Lista, filtros, paginacao e exportacao | Sem regressao, status coerentes em todas as paginas | APROVADO |
| RG-SOL-002 | P0 | R0 | Detalhe por `visualizar_todas` | Abre detalhe sem liberar escrita | APROVADO |
| RG-SOL-003 | P0 | R0 | Matriz vazia x usuario legado | Vazia nega; ausente usa compatibilidade documentada | APROVADO |
| RG-SOL-004 | P0 | R2 | Salvar Campos da Nova Solicitacao | Persiste por area/tipo/subtipo e recarrega | APROVADO |
| RG-SOL-005 | P1 | R0 | Botoes conforme setor/permissao | Frontend e backend usam a mesma chave | APROVADO |
| RG-SOL-006 | P1 | R0 | Biblioteca view/manage | Leitura separada de upload/exclusao | APROVADO |
| RG-SOL-007 | P1 | R0 | Comunicacao view/send | Leitura separada de criar/responder/editar | APROVADO |
| RG-SOL-008 | P1 | R0 | Obras cadastro/gestao/apropriacoes | Visualizar separado de gerenciar | APROVADO |
| RG-SOL-009 | P1 | R0 | Pedido: anexar espelho | Permissao separada funciona no front e endpoint | APROVADO |
| RG-SOL-010 | P0 | R0 | Auditoria das 338 chaves | Sem chave ativa so no front, desconhecida ou duplicada | APROVADO |

### 9.2 Compras e insumos

| ID | Pri. | Risco | Caso | Resultado esperado | Status |
|---|---:|---:|---|---|---|
| RG-COM-001 | P0 | R0 | Detalhe Compra Direta/Solicitacao de Compra | Itens em tabela compacta, modal de catalogacao abre | APROVADO |
| RG-COM-002 | P0 | R1 | Autocomplete de insumo oficial | Selecionado entra no campo e pode ser salvo | APROVADO |
| RG-COM-003 | P0 | R2 | Vincular item manual existente | Descricao oficial substitui a original na relacao | APROVADO |
| RG-COM-004 | P0 | R2 | Criar novo insumo | Nome sugerido editavel; salva cadastro/alias/vinculo | APROVADO |
| RG-COM-005 | P0 | R0 | Itens legados manuais | Tambem podem ser catalogados | APROVADO |
| RG-COM-006 | P0 | R0 | Permissao granular de catalogacao | Sem chave: leitura; com chave: edicao e salvamento | APROVADO |
| RG-COM-007 | P1 | R2 | Cotacao, fechamento parcial e remanejamento | Fluxos novos sem duplicar pedido/item | APROVADO |
| RG-COM-008 | P1 | R0 | Frete global e excedente | Rateio e totais coerentes | APROVADO |
| RG-COM-009 | P1 | R0 | Responsividade das telas de compras | Operavel em notebook/mobile | APROVADO |
| RG-COM-010 | P0 | R2 | Limpeza QA Compras | Restaura estado por ID; falha de limpeza reprova | APROVADO |

### 9.3 Financeiro, obras e importacoes

| ID | Pri. | Risco | Caso | Resultado esperado | Status |
|---|---:|---:|---|---|---|
| RG-FIN-001 | P0 | R1 | Importacao de apropriacoes | Codigos/descricoes/rateios importados como em C:\Fluxy corrigido | APROVADO |
| RG-FIN-002 | P0 | R0 | Dashboard Gerencia de Obras | Relatorio de apropriacoes fecha com banco | APROVADO |
| RG-FIN-003 | P0 | R1 | Importacao de titulos | Modelo, validacoes, parcelas, impostos, rateios e referencias | APROVADO |
| RG-FIN-004 | P0 | R2 | Baixas simples/compostas/parciais | Saldos e movimentos atomicos | APROVADO |
| RG-FIN-005 | P0 | R2 | Estorno bancario/OFX | Estado anterior restaurado, match sem duplicidade | APROVADO |
| RG-FIN-006 | P1 | R0 | Cheques, boleto Caixa, DDA | Telas e calculos carregam sem regressao | APROVADO |
| RG-FIN-007 | P1 | R0 | Resultado de Obras/Financeiro de Obras | Executado, recebido, rateios e anexos corretos | APROVADO |
| RG-FIN-008 | P1 | R0 | Custos e recebiveis/TotalBank | Paginas V4 carregam e totais fecham | APROVADO |
| RG-FIN-009 | P0 | R0 | Previsoes fora de DRE/caixa | Nenhum contrato/recarga pendente contamina realizado | APROVADO |
| RG-FIN-010 | P1 | R0 | Titulo manual/importado | Caminhos necessarios a importacao/conciliacao preservados | APROVADO |

### 9.4 RH/DP, Comercial, seguranca e plataforma

| ID | Pri. | Risco | Caso | Resultado esperado | Status |
|---|---:|---:|---|---|---|
| RG-RH-001 | P1 | R0 | Inicio, pessoal, jornada e apuracao | Paginas abrem conforme permissao | APROVADO |
| RG-RH-002 | P1 | R1 | Admissao/movimentacao/demissao | Formularios, checklist e anexos condicionais | APROVADO |
| RG-RH-003 | P1 | R2 | Alteracao salarial/eventos recorrentes | Historico e financeiro sem duplicidade | APROVADO |
| RG-RH-004 | P1 | R0 | Registros legados RH/DP | Continuam abrindo | APROVADO |
| RG-CML-001 | P1 | R0 | Contratos de venda e modelos por empreendimento | Modelo correto, especialmente Piemonte | APROVADO |
| RG-CML-002 | P1 | R0 | Geracao PDF comercial | Quadro resumo e contrato preservam layout/dados | APROVADO |
| RG-CML-003 | P1 | R0 | D4Sign sem token local | Fronteira tratada; nao simular assinatura externa | APROVADO |
| RG-SEC-001 | P0 | R0 | Login, logout e rotas protegidas | Cookies/sessao corretos; sem loop 401 | APROVADO |
| RG-SEC-002 | P0 | R0 | MFA modos e segredo ilegivel | Bloqueio/bypass conforme politica e segredo nao exposto | APROVADO |
| RG-SEC-003 | P0 | R1 | Uploads S3/presign | Tipo binario, autorizacao, URL e encoding corretos | APROVADO |
| RG-SEC-004 | P1 | R0 | Live updates | Falha 401 tratada e atualizacao sem tempestade de requisicoes | APROVADO |
| RG-UI-001 | P1 | R0 | Menu lateral e navegacao | Sem links quebrados; densidade operacional preservada | APROVADO |
| RG-UI-002 | P1 | R0 | Claro/escuro 1440px | Sem corte de valores, sobreposicao ou modal fora da tela | APROVADO |
| RG-UI-003 | P1 | R0 | 1366px e 768px | Tabelas, modais e formularios operaveis | APROVADO |
| RG-UI-004 | P1 | R0 | ErrorBoundary/tela interrompida | Falha mostra recuperacao e erro de origem e corrigido | APROVADO |
| RG-UI-005 | P1 | R0 | Console global | Zero erro nao tratado nas rotas percorridas | APROVADO |

## 10. Ordem da execucao visivel

1. `ENV-001` a `ENV-006` e smokes R0.
2. Contratos R0/R1: `CT-001` a `CT-021`, `CT-026`, `CT-027`, `CT-047` a `CT-052`.
3. Despesa Eventual R0/R1.
4. Recarga de Cartao R0/R1.
5. ADM/Locacao R0/R1.
6. Regressao das demais telas R0/R1.
7. Com aviso expresso, casos R2 por fluxo, um bloco de cada vez, com limpeza conferida.
8. Repeticao de toda falha corrigida e fechamento dos consoles.

## 11. Registro de execucao

Para cada caso executado, registrar data/hora, perfil, URL/ID criado, resultado, evidencia visual,
resposta HTTP relevante, tabelas verificadas e limpeza. Nao marcar `APROVADO` apenas porque a tela
abriu: casos P0 de negocio exigem a camada indicada no resultado esperado.

### Execucao 27/08/2026 — inicio 19:40, navegador interno visivel

| Bloco | Resultado |
|---|---|
| Ambiente | Frontend abriu; login vazio validou; perfis OBRA e GEO autenticaram; console sem erros; `/health` 200; 205 migrations/205 registros, nenhuma pendente. |
| Contrato | Formulario integrado aprovado; R$ 50.000,00 sem bloco juridico; R$ 50.000,01 com tres documentos, qualificacao e campos conjugais condicionais. |
| ADM/Locacao | Contrato e card de apropriacao automatica nao aparecem; titulo/justificativa/pagamento condicionais carregam. PIX e Boleto abrem os grupos corretos. A ordem real das chaves PIX ainda exige selecionar um credor. |
| Recarga | Perfil sem cartao recebe lista vazia e botao desabilitado. A prova de nao vazamento da API permanece pendente. |
| Despesa Eventual — falha 1 | Tipo 35 ativo estava ausente da Nova Solicitacao porque a lista fechada da GEO parava no tipo 33. Corrigido com script idempotente; JSON preservado, tipo 35 e modo `TODOS_VISIVEIS` acrescentados sem duplicidade. |
| Despesa Eventual — falha 2 | `FOPAG` aparecia porque seu `tipo=TRANSFERENCIA`. Corrigido frontend/backend para aceitar somente nome/codigo nominal PIX, BOLETO ou TRANSFERENCIA. Prova de backend e repeticao visual aprovadas. |
| Build | 372 modulos transformados; aprovado. Primeira tentativa na sandbox falhou por acesso do esbuild e foi repetida fora dela com autorizacao. |
| Processo 8100 | Saudavel, mas defasado das correcoes backend feitas depois de seu ultimo inicio. Nenhum reinicio executado para nao interromper o outro agente. |
| Detalhe do contrato | `SOL-5133` (`id=6956`) conferido com GEO e OBRA: cabecalho `CONTRATO - 0022`, titulo abaixo, objeto na primeira linha, sem card de contrato/numero do pedido/card Pagamentos/pagamento parcial. Parcelas e titulos ABERTO visiveis; fora do setor, comentarios e anexos ficam bloqueados. |
| Abertura do contrato | Titulo, objeto, justificativa, responsavel, vigencia, apropriacao, condicao e parcelas presentes. PIX/Boleto nao antecipam dados do pagamento: favorecido, chave e boleto ficam para a medicao. R$ 100,00 dividiu em 50/50 e a edicao para 60 redistribuiu a outra para 40; coluna Trava ausente. |
| Medicao e aditivo — formulario | CT-0022 carregou tres parcelas ABERTO e saldo R$ 60.000,00. Forma vem primeiro: PIX abriu checkbox do credor, chave, contato e confirmacao; Boleto escondeu PIX e abriu anexo obrigatorio. Modal de aditivo exibiu teto de R$ 15.000,00 e desabilitou o envio em R$ 16.000,00. Nenhum formulario foi enviado. |
| Medicao — validacoes negativas de envio | No `CT-0022`, parcela 1 e periodo 01/08/2026–27/08/2026, a tela recusou nominalmente: medicao sem arquivo (`Anexe ao menos um arquivo para enviar a solicitacao de medicao.`), PIX sem favorecido, PIX sem chave (`Informe a chave PIX do favorecido.`) e Boleto sem boleto (`Anexe o boleto desta medicao.`). A consulta final confirmou zero linha em `contrato_medicoes` e zero solicitacao de medicao do usuario MATRIZ OBRA para o contrato 3477. |
| Medicao — criacao, limites e aprovacao | No fixture nominal `CT-0025/SOL-5145`, a tela criou uma unica medicao PIX id 817, vinculou a parcela 13282 e gravou o PDF id 12008. A API recusou medir a mesma parcela com 409 indicando a medicao existente, recusou R$ 151,00 contra saldo de R$ 150,00 orientando termo aditivo e manteve uma unica medicao. MATRIZ OBRA recebeu 403 ao aprovar; MATRIZ GERENCIA aprovou, levando a solicitacao a `LIBERADO/FINANCEIRO` e a situacao operacional das parcelas para `LIBERADA/ABERTO`. Em segundo fixture, a medicao id 818 foi criada apenas com nome pendente e zero anexo gravado; a Gerencia recebeu 400 e ela permaneceu nao aprovada em `NEC. DE MEDICAO/OBRA`. Os dois contratos, solicitacoes, medicoes, anexos, parcelas e titulos temporarios foram removidos por IDs e as sequencias voltaram a contrato 24/titulo 7336. |
| Medicao — repeticao e transicao visual | Um terceiro fixture comprovou `PREVISAO/PREVISAO` antes da aprovacao do contrato, `ABERTO/ABERTO` depois dela e `LIBERADA/ABERTO` apos aprovar a medicao 819. A repeticao da aprovacao retornou 409 `Medicao 1 ja foi aprovada.`, preservou o mesmo timestamp e nao aumentou o historico. No navegador visivel, `SOL-5145` mostrou `LIBERADO/FINANCEIRO`, a tabela e os dois titulos nas situacoes esperadas, um unico evento `MEDICAO_APROVADA` e zero erro/aviso no console. Contrato 4467, solicitacao 8121, medicao 819, anexo 12009, parcelas e titulos foram removidos nominalmente; sequencias novamente em contrato 24/titulo 7336. |
| Financeiro do contrato — previsao, baixa e arquivos | `SOL-5113/CT-0001` real, ainda aguardando aprovacao, possui cinco parcelas `PREVISAO`, todas sem `titulo_financeiro_id`, e zero titulo: nao ha linha para baixa ou DRE antes de abrir. A suite segura `72-financeiro-parcelas-seguro.js` confirmou baixa parcial de R$ 200,00 numa parcela de R$ 250,00, redistribuicao de R$ 50,00 para a ultima, status PARCIAL sem saldo cobravel, reprocessamento idempotente e estorno exato. Pagamento de R$ 300,00 elevou a parcela e descontou R$ 50,00 da ultima sem alterar R$ 1.000,00 contratados; excedente fora da absorcao foi recusado com orientacao de aditivo. A rota de arquivos devolveu, para o titulo do contrato, um ANEXO e um COMPROVANTE da solicitacao; titulo manual sem solicitacao retornou lista vazia com motivo explicativo. As duas execucoes removeram solicitacoes 8122/8123, contratos, medicoes 820–823, anexos/comprovantes, parcelas, titulos 9349–9357 e o titulo manual por IDs; sequencias voltaram a contrato 24/titulo 7336. |
| Aditivos e encerramento | A suite segura `73-aditivos-encerramento-seguro.js` comprovou pedido em `PED. ADITIVO/GEO`, negativas 403 para OBRA, motivo obrigatorio, diferenca entre rejeitar e cancelar, teto acumulado de 25%, aditivo de valor e de prazo, repeticao 409 sem parcela/evento duplicado, sobra da ultima medicao com historico e encerramento exclusivo da Gerencia. O contrato encerrado ficou com saldo zero e recusou nova medicao/aditivo. A renderizacao dos botoes foi conferida no frontend contra `contrato.permissoes`: OBRA sem chaves nao recebe decisoes. Contrato 4472, solicitacao 8126, medicoes 830–835, aditivos 490–493, parcelas 13306–13311 e titulos 9368–9373 foram removidos nominalmente; sequencias voltaram a contrato 24/titulo 7336. Duas execucoes preparatorias falharam apenas por expectativas da propria suite e tambem comprovaram limpeza integral antes da repeticao final. |
| Legado e Gestao de Contratos | No navegador, a medicao historica `SOL-4678`/contrato `CT/EP001-33` abriu com fluxo legado, periodo, apropriacao, dois anexos historicos e titulo quitado legiveis. A Nova Solicitacao ofereceu o formulario antigo para esse contrato, sem misturar a grade de parcelas do fluxo novo. A Gestao de Contratos listou e filtrou exatamente `CT/EP001-33`. A suite segura `74-gestao-contratos-documentos-seguro.js` aprovou negociacao autorizada, negativas 403 sem obra/permissao e concorrencia dos tres slots juridicos, mantendo um unico arquivo por tipo; contrato e arquivos temporarios foram removidos nominalmente. |
| Contratos comerciais e D4Sign local | Os modelos reais de Piemonte, Pedra Menina e Areia Preta foram cadastrados por empreendimento e tipo por um carregador idempotente. A suite segura `qa/comercial/01-pdf-piemonte-d4sign-local-seguro.js` gerou um PDF real do Piemonte com 46 paginas, quadro-resumo antes do contrato e modelo correto. Sem credenciais D4Sign, a fronteira retornou configuracao ausente sem chamada externa, preservou o PDF, seu hash e o status `GERADO`. Documento, contrato comercial, parcela, unidade, parceiro e pasta temporarios foram removidos nominalmente com zero residuo. O perfil isolado do LibreOffice elimina disputa entre conversoes simultaneas. |
| Compras — catalogacao de itens manuais | No navegador, a SC-00161 de julho exibiu tres itens legados manuais numa tabela compacta. O expansivel abriu sem cards, o autocomplete por `cimento` trouxe dois insumos, a selecao entrou no campo e habilitou o salvamento sem gravacao. `Criar novo` trouxe nome manual editavel, unidade e descricao, sem justificativa. Os validadores locais aprovaram substituicao pela descricao oficial, vinculo, concorrencia idempotente, correcao, novo insumo, alias e reutilizacao na importacao. A massa temporaria foi removida por IDs e a sequencia voltou exatamente ao estado anterior; a SC-00161 permaneceu inalterada. |
| Compras — permissao granular da catalogacao | `MATRIZ OBRA` recebeu temporariamente apenas `compras.solicitacoes.visualizar`, mantendo ausente `compras.insumos.catalogar_itens_manuais`. Numa fixture propria SC-00306, abriu a tabela e o expansivel, mas recebeu somente a mensagem de leitura, sem formulario/botao de catalogacao; uma chamada direta valida retornou 403 nominal. Superadmin continuou vendo e preenchendo os controles. Item 1576 e compra 306 foram removidos por IDs. A permissao temporaria foi retirada pela tela e a configuracao efetiva foi conferida com 30 usuarios e as seis permissoes individuais originais do perfil. |
| Permissoes — auditoria repetida | `auditarPermissoesGranulares.js` conferiu 19 modulos, 338 chaves (282 ativas), zero invalida, duplicada, exclusivamente frontend ou sem uso literal; 264 possuem uso nos dois lados e 18 somente backend. |
| Sequencias e carga | Contrato `24=maximo 24`; antes da aprovacao visual, titulo `7330=TIT-007330`; `backend/src/routes.js` carregou sem erro. |
| Permissoes | Registro central: 338 chaves, 0 invalidas, 0 duplicadas, 0 exclusivamente frontend e 0 sem uso literal. Tres usuarios ativos continuam em compatibilidade legada irrestrita. Um perfil temporario isolou `visualizar_todas`: lista e detalhe completo abriram fora da obra sem liberar escrita. |
| Validadores R0 | Vencimento, rateio da Gestao de Obras e importacao de apropriacoes aprovados sem gravacao. |
| Recarga transacional | Criacao atomica em PREVISAO, liberacao para ABERTO, baixa parcial, prestacao, rateio, validacao, ausencia de dependencia da conciliacao, rollback e restauracao da sequencia aprovados. |
| Aprovacao juridica visual — escrita nao planejada | Em `SOL-5136 / CT-0024`, o clique em `Conferido — aprovar contrato` executou imediatamente, sem dialogo. A solicitacao foi para OBRA/APROVADA e foram criados `TIT-007331` a `TIT-007334`, todos ABERTO, total R$ 50.000,01; sequencia ficou em 7334. Nao houve tentativa de desfazer manualmente para nao corromper historico/titulos/sequencia. O caso funcional CT-045 passou; a falha historica CT-101 foi corrigida e repetida em outro contrato. |
| Aprovacao juridica — confirmacao nominal corrigida | Em `SOL-5117 / CT-0006`, o clique passou a abrir aviso explicito e exigir `CT-0006`. `CT-9999` manteve `Confirmar aprovacao final` desabilitado; o codigo exato habilitou. O teste voltou sem confirmar e o banco permaneceu em `EM_REVISAO_JURIDICA`, solicitacao no JURIDICO/EM ANALISE e zero titulos. Build com 372 modulos aprovado. |
| Retorno e interacao por setor | `qa/medicao/57-retorno-e-interacao-por-setor.js` recusou interacao fora do setor, criou um unico pedido apesar do retry, exibiu decisao ao setor atual, aprovou preservando status, rejeitou com motivo sem mover, cancelou pelo solicitante e gerou notificacoes/historico. A limpeza conferiu usuarios=0, solicitacoes=0, pedidos=0 e notificacoes=0. |
| Contrato — campos configuraveis/documentacao juridica | O validador de configuracao publicou os cinco campos novos sem duplicidade e respeitou visibilidade/obrigatoriedade. A suite juridica confirmou limiar exato, qualificacao completa acima dele, conjuge somente para CASADO, tres anexos nominais e preservacao do status quando faltam; contrato temporario 4435 e anexos foram removidos, com zero resto. |
| Contrato — CPF de conjuge | A criacao acima do limite com representante e conjuge usando `52998224725` retornou 400 `O CPF do conjuge deve ser diferente do CPF do representante legal`, antes da persistencia; zero contrato com a descricao QA. |
| Preparacao Recarga visual | Backend atualizado reiniciado e `/health` 200. `MATRIZ OBRA` autenticou com setor/obra esperados. O cartao existente `Jose Ricardo / V-7596` ganhou o vinculo QA sem remover o superadmin. Foi criado o cartao permanente de QA `MATRIZ QA RECARGA`, id 6, identificador `QA-MATRIZ-0827`, ligado somente ao `MATRIZ OBRA`. |
| Cartoes de Recarga | Lista administrativa sem 400; cadastro persistiu; edicao manteve id 6; cancelar descartou alteracao temporaria. Duplicidade de identificador passou a retornar 409 e final com tres digitos retornou 400, sem nova linha. No usuario vinculado apareceram somente os dois cartoes ativos vinculados. |
| Recarga — obrigatoriedade e ajuste visual | Valor, cartao e data prevista sao obrigatorios e o botao permanece bloqueado enquanto faltam dados. Corrigida a exibicao da ultima recarga: enquanto `valor_efetivo=0`, mostra `valor_solicitado` (R$ 5.000,00), e nao R$ 0,00. A mensagem de data obrigatoria passou a dizer `Informe a data prevista para recarga.`. |
| Recarga — primeira criacao visual | Duas tentativas automatizadas foram barradas pela data nativa nao sincronizada no controle do navegador; os alertas foram confirmados pelo usuario. O banco foi conferido apos cada tentativa: zero registros em `solicitacoes_recarga_cartao` para o cartao id 6; nenhuma duplicacao ou linha parcial. A criacao continua pendente ate entrada manual da data no navegador. |
| Build apos correcoes de Recarga | 372 modulos transformados; aprovado. A primeira execucao ficou limitada pela sandbox do esbuild e foi repetida com autorizacao. |
| Recarga — criacao visual positiva | Criadas uma unica vez `SOL-5138 / TIT-007335` (R$ 100,00) e `SOL-5139 / TIT-007336` (R$ 25,00), inicialmente `PENDENTE/PREVISAO`, ambas fora do DRE da obra. O bloqueio de uma segunda recarga foi provado tanto em `PREVISAO` quanto em `ABERTO`, sem linha parcial ou duplicada. |
| Recarga — Gerencia e titulo | O usuario `MATRIZ GERENCIA` foi promovido de USUARIO para ADMIN para respeitar o modo GEO `ADMIN_PRIMEIRO`; recebeu individualmente `solicitacoes.acoes.aprovar` e `solicitacoes.retorno.decidir`. Abriu as duas solicitacoes e as liberou para o FINANCEIRO. Os titulos #9329 e #9330 passaram de PREVISAO para ABERTO e o ciclo para `AGUARDANDO_PAGAMENTO`. |
| Recarga — atualizacao sem F5 | Encontrado estado visual antigo logo apos a primeira liberacao, embora o banco estivesse correto. `SolicitacaoDetalhe/index.jsx` passou a remontar os paineis independentes de Recarga e Financeiro apos a troca de status. Repeticao na `SOL-5139`: imediatamente apos fechar o alerta, sem recarregar, a tela mostrou `LIBERADO`, FINANCEIRO, `AGUARDANDO_PAGAMENTO` e titulo #9330 `ABERTO`. Build com 372 modulos aprovado. |
| Cartao QA adicional | Criado pela tela administrativa `MATRIZ QA REFRESH`, identificador `QA-REFRESH-0828`, final 0828, fornecedor Flash, vinculado somente ao `MATRIZ OBRA`, para repetir a transicao sem alterar manualmente o ciclo anterior. |
| Recarga — baixa parcial visual | No titulo #9330/TIT-007336 foi confirmada uma unica baixa PIX de R$ 10,00, movimento id 1953, empresa SPE Edificio Pedra Menina, conta `CEFSPEPEDR-5726959465`. O titulo ajustou valor original/baixado para R$ 10,00, saldo zero e QUITADO; a SOL-5139 ficou `PARCIALMENTE PAGO`; o ciclo separou R$ 10,00 efetivamente pago e R$ 15,00 nao recarregado e abriu `PRESTACAO_PENDENTE`. |
| Recarga — apropriações inválidas e concorrência | `npm run test:recarga-cartao` recusou nominalmente apropriação somadora, inativa e de outra obra e confirmou zero rateio residual. A prova disparou envio e validação duplicados na mesma unidade transacional; após a reserva atômica de estado, somente uma operação avançou e restaram exatamente um rateio da prestação e um rateio financeiro. O rollback removeu cartão/solicitação/título/rateios temporários e a sequência voltou ao valor anterior. |
| ADM/Locação — configuração e condicionais | No navegador, a OBRA MODELO exibiu vínculos distintos `01.01.01.01` (ADM) e `02.02.02.02` (Locação), o filtro de pendências funcionou e o editor listou somente apropriações válidas. Na ED. PEDRA MENINA sem vínculo, a criação foi bloqueada antes da gravação com orientação explícita. PIX usou a chave 2 do MERCADÃO DO GESSO porque a chave 1 estava vazia e permitiu edição; Boleto abriu o anexo obrigatório e Transferência removeu campos inaplicáveis. A suíte de nova obra criou `1` e `2`, os dois vínculos, fez rollback e conferiu ausência da obra temporária. |
| Recarga — prestacao visual | Com R$ 9,00 para prestar R$ 10,00, diferenca R$ 1,00 e botao desabilitado. Com R$ 10,00 na obra 23/apropriacao 6592, a prestacao foi enviada e bloqueou nova recarga. `MATRIZ GERENCIA` validou; o ciclo ficou `VALIDADA`, media das ultimas 1 = R$ 10,00 e o cartao foi desbloqueado sem criar uma nova solicitacao. |
| Recarga — custo por obra | Titulo #9330 persistiu `considera_dre=1`, `possui_rateio=1`, obra/apropriacao diretas nulas e rateio id 2075 de R$ 10,00/100% para obra 23 e apropriacao 6592. O Resultado de Obras carregou ED. PEDRA MENINA com o executado atualizado. |
| Recarga — isolamento de usuario/obra | `MATRIZ JURIDICO`, sem vinculo com cartoes, recebeu lista vazia no mesmo endpoint refletido pela tela, sem ver os tres cartoes ativos. No rateio do `MATRIZ OBRA`, somente as obras vinculadas foram oferecidas; nenhuma obra externa apareceu. |
| Recarga — baixa integral visual | Titulo #9329/TIT-007335 recebeu uma unica baixa PIX integral de R$ 100,00, movimento id 1954. Ficou QUITADO, saldo zero; a SOL-5138 ficou `PAGA` e abriu prestacao por R$ 100,00, sem valor nao recarregado. |
| Recarga — rateio em duas obras | `MATRIZ OBRA` recebeu tambem a OBRA MODELO sem perder ED. PEDRA MENINA. A prestacao de R$ 100,00 foi enviada em R$ 60,00 para obra 23/apropriacao 6592 e R$ 40,00 para obra 1/apropriacao 1. A Gerencia validou; o titulo #9329 ficou `considera_dre=1`/`possui_rateio=1`, com rateios id 2077 (60%) e id 2076 (40%), soma exata. |
| ADM/Locacao — criacao e detalhe visiveis | Criadas uma unica vez `SOL-5140` (ADM, R$ 1,00, apropriacao `01.01.01.01`) e `SOL-5141` (Locacao, R$ 1,00, apropriacao `02.02.02.02`). Os detalhes exibiram titulo, justificativa, credor, favorecido, forma de pagamento e historico da apropriacao, sem expor o card automatico. Durante a repeticao, Transferencia exigia favorecido no backend mas o frontend ocultava o seletor; a condicao foi alinhada e o build voltou a passar. |
| ADM/Locacao — rollback ampliado | `qa/obra-tipo-apropriacao-automatica/01-fluxo-seguro.js` confirmou: nova OBRA cria apropriacoes/vinculos, CENTRO_CUSTO nao cria padroes, falha posterior reverte obra/apropriacoes/vinculos e todos os identificadores temporarios ficam ausentes apos o rollback. |
| ADM — payload adulterado | Criada uma unica vez `SOL-5142`, R$ 0,01, enviando propositalmente `apropriacao_id=6631` (Locacao) em um payload ADM. A API respondeu 201 com `apropriacao_id=1`; o detalhe mostrou `01.01.01.01` no historico e zero titulos, provando que o backend usa o vinculo autoritativo da obra/tipo. |
| ADM — legado | `SOL-4625`, de 24/07/2026, abriu com contrato historico `CT/ADM001-33`, ref. `ADM LOCAL OBRA`, apropriacao historica `1.001`, titulo quitado e fluxo original. Nenhum campo foi retroativamente convertido ao novo modelo automatico. |
| Despesa Eventual — acima do limite | No navegador, R$ 5.000,01 deixou o resumo em estado de excesso contra o limite de R$ 5.000,00 e, com os demais campos completos, a criacao abriu o alerta de bloqueio antes da API. O banco permaneceu com zero registro para a descricao QA. `npm run test:despesa-eventual` repetiu a recusa no backend e passou limites, saldo, declaracoes e formas permitidas. |
| Despesa Eventual — formas | PIX sugeriu a chave 2 `48.581.864/0001-70` do MERCADAO DO GESSO quando a chave 1 estava vazia e aceitou edicao. Transferencia manteve o favorecido obrigatorio, sem chave PIX ou boleto, e o backend aceitou a forma normalizada. Com Boleto, comprovante presente e boleto ausente geraram `Anexe o boleto para usar esta forma de pagamento.`; no inverso, boleto presente e comprovante ausente geraram `Anexe ao menos um comprovante da despesa.`. |
| Despesa Eventual — justificativa/comprovante | Com R$ 100,00 e data 03/09/2026, justificativa vazia foi bloqueada pelo `required` nativo e recebeu foco, sem chamada da API. Depois de preencher a justificativa e manter o comprovante vazio, o alerta exibiu `Anexe ao menos um comprovante da despesa.`; a consulta confirmou zero solicitacao com a justificativa QA. |
| Despesa Eventual — declaracoes | Com os demais campos completos e as tres declaracoes desmarcadas, a criacao foi interrompida antes do envio com o alerta `Confirme todas as declarações obrigatórias da Despesa Eventual.`. |
| Despesa Eventual — upload inicial fora do setor | O primeiro envio valido criou `SOL-5143`/ID 8092, mas boleto e comprovante falharam porque a solicitacao ja nasceu em GEO e o endpoint de anexos aplicou a trava de interacao posterior ao upload da propria criacao. Corrigido com token assinado de 10 minutos, vinculado a solicitacao, usuario e tipos `BOLETO`/`SOLICITACAO`; interacoes posteriores continuam bloqueadas. O registro QA incompleto foi removido por ID em transacao. No reteste, uma unica `SOL-5143`/ID 8093 gravou o boleto 12000 e o comprovante 12001 em tipos/caminhos distintos. |
| Despesa Eventual — positivo/detalhe/saldo | A lista exibiu `SOL-5143`, Obra Modelo, Despesa Eventual, R$ 100,00, Gerencia de Processos e PENDENTE. O detalhe exibiu favorecido, Boleto, justificativa, subtipo e apropriacao; a Nova Solicitacao passou a mostrar R$ 100,00 comprometidos e R$ 29.900,00 disponiveis. A consulta por justificativa confirmou uma unica criacao. |
| Despesa Eventual — saldo acumulado | Com limites temporarios de R$ 150,00 por solicitacao/obra e R$ 100,00 ja comprometidos, a tela mostrou saldo de R$ 50,00 e recusou uma nova despesa de R$ 100,00 com `O valor informado ultrapassa o saldo de Despesa Eventual desta obra.`. A consulta por justificativa confirmou zero registro. |
| Despesa Eventual — limite exato/cancelamento/restauracao | Com limite individual R$ 150,00 e limite da obra R$ 250,00, `SOL-5144`/ID 8094 foi criada uma unica vez por R$ 150,00 e recebeu o comprovante PDF id 12002. Pela tela, `MATRIZ GERENCIA` alterou `PENDENTE -> CANCELADA`; o comprometido caiu de R$ 250,00 para R$ 100,00. As configuracoes temporarias IDs 857/858 foram removidas nominalmente, a ausencia foi conferida e os padroes retornaram a R$ 5.000,00/R$ 30.000,00. |
| Despesa Eventual — formatos de anexo | O frontend aceitava Markdown no seletor e o backend recusava o upload somente depois da criacao. O seletor e a validacao previa passaram a usar a mesma lista do backend; build de producao com 372 modulos aprovado. |
| Despesa Eventual — isolamento por obra | A primeira identidade escolhida, JURIDICO, pertence deliberadamente a `SETORES_CRIACAO_TODAS_OBRAS`; por isso a criacao direta era autorizada e a solicitacao de prova `SOL-5145`/ID 8095 foi removida com historico/visibilidade por ID. O negativo correto usou `MATRIZ OBRA` na obra 2, fora de seus vinculos 1/23: a API retornou 403 `Usuario nao vinculado`, com zero gravacao. |
| Despesa Eventual — concorrencia/limpeza | Sob limites temporarios IDs 859/860 de R$ 50,00/R$ 150,00 e R$ 100,00 ja comprometidos, dois pedidos concorrentes de R$ 50,00 produziram exatamente uma solicitacao temporaria ID 8096 e uma recusa por saldo zero. O comprometido parou em R$ 150,00. A limpeza removeu ID 8096 e as duas configs por ID; zero residuos, limites padrao e saldo final R$ 29.900,00 foram conferidos. |
| Contrato — seguranca dos anexos | O validador do backend foi exercitado em memoria, sem gravacao: documento com macro retornou `UPLOAD_MACRO_BLOCKED`; objeto incorporado retornou `UPLOAD_EMBEDDED_OBJECT_BLOCKED`; conteudo com extensao falsa foi recusado por incompatibilidade; DOCX e PDF validos foram aceitos. Nenhum contrato, anexo ou arquivo foi persistido. |
| Contrato — negociacao detalhada | A matriz foi alinhada a decisao consolidada de 23/08: o documento e obrigatorio em todo contrato; o limite juridico regula apenas os tres anexos e a qualificacao adicionais. A suite segura criou um contrato temporario um centavo abaixo e outro um centavo acima do limite, recusou ambos sem negociacao com HTTP logico 400, preservou `AGUARDANDO_APROVACAO` e removeu os dois somente pelos IDs retornados pelo `create`; zero residuos. |
| Contrato — GEO sem cancelamento apos minuta | Com vinculo temporario ID 1541 entre `MATRIZ GERENCIA` e a obra 15, o detalhe do `CT-0004`/`SOL-5115` em `AGUARDANDO_ASSINATURA` exibiu a etapa, mas nao o botao Cancelar. A prova de backend fiel ao `req.user` (`area=GEO`) retornou 403 e preservou contrato ativo e solicitacao `NEC. DE ASSINATURA`. Uma primeira chamada interna montada sem `area` cancelou o caso por nao reproduzir o objeto da sessao; a alteracao foi imediatamente restaurada sob locks para a fotografia funcional e timestamps anteriores, sem historico intermediario, e o vinculo 1541 foi removido e conferido. |
| Contrato — repeticao da conferencia final | A repeticao de `conferido` no `CT-0024`, ja ATIVO, retornou 409 antes de qualquer gravacao. A quantidade de parcelas vinculadas a titulos permaneceu exatamente quatro antes/depois e o contrato continuou ativo. |
| Contrato — configuracoes visiveis | A tela administrativa carregava cores e formas, mas nao expunha o endpoint ja existente do limite juridico. Foi adicionado o controle compacto `Limite para analise juridica`, com explicacao exata da fronteira, bloqueio de multiplos envios e GET/PATCH existentes; o navegador mostrou R$ 50.000,00 e o build de producao passou com 372 modulos. As faixas 10% Saudavel/20% Normal foram recusadas com mensagem nominal e a consulta confirmou zero linha `CONTRATO_ALERTA_SALDO` criada. |
| Contrato — valores e parcelas invalidos | Chamadas negativas antes da transacao recusaram valor zero, negativo e vazio com status logico 400, e duas parcelas somando R$ 90,00 para um contrato de R$ 100,00 com `A soma das parcelas editadas difere do valor do contrato.`. Zero contrato com a marcacao QA foi gravado. No frontend, as parcelas sao sempre redistribuidas pelo total e existe guarda previa nominal para parcela menor que R$ 0,01; o backend permanece a fronteira autoritativa para payload adulterado. |
| Contrato — idempotencia e concorrencia na criacao | A suite segura `61-criacao-idempotente-concorrente-segura.js` confirmou 201 na primeira chamada e replay 200 com o mesmo contrato/solicitacao para a mesma chave; duas chaves simultaneas criaram codigos distintos, sem colisao. Um quarto caso de R$ 50.000,01 nasceu PENDENTE/GEO e preservou a fotografia normalizada do representante legal. Os quatro contratos temporarios ficaram `AGUARDANDO_APROVACAO`, com oito parcelas PREVISAO sem titulo. Todos os registros foram removidos pelos IDs retornados; sequencia 24 = maior contrato 24 e ultima solicitacao `SOL-5144`. A primeira execucao da suite, ainda sem `tipo_macro_id`, terminou em rollback por validacao e tambem deixou zero registro. |
| Contrato — aprovacao nos dois lados do limite | A suite segura `62-aprovacao-limite-segura.js` recusou primeiro a aprovacao sem categoria com mensagem nominal, sem mencionar vencimento, mantendo o contrato aguardando e zero titulo. Com categoria 49, R$ 100,00 ficou ATIVO, criou exatamente dois titulos ABERTO e voltou a solicitacao APROVADA para OBRA. R$ 50.000,01 seguiu `EM_ANALISE_JURIDICA`, com solicitacao PENDENTE/JURIDICO e zero titulo. Contratos, solicitacoes, anexos, rateios, titulos e eventos temporarios foram removidos por IDs; sequencias voltaram a contrato 24 e titulo 7336. |
| Contrato — acoes na fila da GEO | A mesma `SOL-5113`/`CT-0001` PENDENTE foi aberta visualmente com os dois perfis. `MATRIZ OBRA` recebeu faixa `Somente acompanhamento`, sem Aprovar/Rejeitar/Cancelar e com interacoes bloqueadas pelo setor. `MATRIZ GERENCIA` viu categoria financeira e exatamente Aprovar, Rejeitar e Cancelar. Os vinculos temporarios de obra IDs 1542/1543 foram removidos e a ausencia conferida; nenhum botao de negocio foi acionado. |
| Permissao `visualizar_todas` — detalhe completo | Perfil temporario neutro, sem obra e com somente `solicitacoes.lista.visualizar_todas`, listou 5.039 solicitacoes e abriu `SOL-5113`/`CT-0001`. A lacuna de leitura das parcelas foi corrigida apenas para GET/HEAD de contrato vinculado a solicitacao. No reteste visual, cabecalho, apropriacoes e parcelas carregaram sem erro; comentarios, anexos, Financeiro e decisoes ficaram indisponiveis. `qa/medicao/68-visualizar-todas-contrato-segura.js` confirmou solicitacao/parcelas 200, aprovacao 403 e contrato sem alteracao. |
| Retorno — aditivo pendente e permissoes negativas | `qa/medicao/69-retorno-aditivo-permissoes-segura.js` inseriu um unico pedido temporario na `SOL-5116`, que possui o aditivo 130 PENDENTE. A GEO recebeu 409 ao aprovar e pedido/solicitacao/aditivo permaneceram inalterados. O perfil MATRIZ JURIDICO, sem as chaves de retorno, recebeu 403 tanto para solicitar quanto para decidir. O pedido foi removido pelo ID criado e a ausencia foi conferida. |
| Campos da Nova Solicitacao — persistencia reversivel | Pela tela administrativa, em `GEO/CONTRATO`, `Objeto do contrato` mudou de opcional para obrigatorio, persistiu apos recarregar e apareceu com `*`/`required` na Nova Solicitacao. Em `GEO/ADM LOCAL DE OBRA`, o Titulo mudou de visivel/obrigatorio para oculto/opcional, persistiu, desapareceu do formulario e o resolvedor do backend retornou `visivel=false`/`obrigatorio=false`, mantendo Justificativa visivel/obrigatoria. A regra `GEO/33:25` de `ABERTURA DE CONTRATO` persistiu por subtipo e foi resolvida pelo backend. Ao final, a chave compartilhada foi restaurada byte a byte ao SHA-256 `7F4C85E22A3F35F39C8C470F8BBC8E49600596FA91BBAFFB4856F1B806D19B93`; a tela confirmou os tres estados originais. |
| ADM/Locacao — concorrencia segura do vinculo | A prova isolada criou uma obra e duas apropriacoes temporarias e disparou seis PATCH simultaneos para a mesma chave `obra/tipo`. As seis respostas foram 200 e restou exatamente uma linha apontando para uma das duas apropriacoes validas. A limpeza removeu nominalmente o vinculo 128, as apropriacoes temporarias e a obra pelos IDs criados, conferindo zero residuo. A suite antiga nao foi usada porque sua limpeza impunha a fotografia historica de uma unica linha. |
| Solicitacoes — lista, filtros, paginacao e exportacao | A lista carregou 5.039 solicitacoes com status mistos coerentes. O filtro exato `SOL-5136` reduziu a tabela a uma linha e manteve codigo, contrato `CT-0024`, obra, tipo, valor, setor, status e vencimento. Com 50 por pagina, a navegacao mudou de `1-50` para `51-100` e trocou a primeira linha. A exportacao filtrada de uma linha concluiu sem alerta de erro e devolveu o botao ao estado normal. Nenhum dado foi alterado. |
| Permissoes — vazio explicito versus legado | Com o usuario real Renan Leal (id 8), a leitura sem configuracao retornou `configured=false`, lista vazia e compatibilidade permitida para `solicitacoes.lista.visualizar_todas`. A mesma identidade simulada com o sinal de sessao `areas_permissoes_configuradas=true` e lista explicitamente vazia retornou `configured=true` e negacao. O frontend usa o mesmo sinalizador antes de consultar a lista. Nenhum dado foi alterado. |

## 12. Fontes de rastreabilidade

- `ESCOPO-CONSOLIDADO.md` e `ALTERACOES-POR-PAGINA.md`;
- `MATRIZ-DE-TESTE-FLUXO-DE-CONTRATOS.md` (historico de 24/08);
- `AUDITORIA-FLUXY-VS-V4.md`;
- handoffs de contratos, medicao, retorno, Despesa Eventual, Recarga de Cartao, ADM/Locacao,
  Compras, Financeiro, RH/DP e permissoes em `docs/handoffs/`;
- suites em `qa/`, `e2e/tests/` e validadores em `backend/scripts/`;
- comparacao local somente leitura entre os fontes de `C:\Fluxy` e `Fluxy-V4`.
