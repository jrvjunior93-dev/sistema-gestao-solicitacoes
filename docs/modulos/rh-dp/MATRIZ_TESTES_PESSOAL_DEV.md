# Matriz de testes — Pessoal / RH-DP

## Objetivo e limites

Esta matriz valida a página **Pessoal** e os fluxos que partem dela: cadastro, solicitações,
jornada, eventos recorrentes, apuração e geração financeira. A carga associada é exclusiva do
banco de desenvolvimento, não apaga registros e pode ser executada novamente sem duplicar os
cenários.

Os anexos, aprovações e títulos devem ser produzidos durante os testes. Eles não fazem parte da
carga inicial para que o próprio fluxo operacional seja exercitado.

## Preparação do ambiente

1. Atualizar o backend dev e confirmar que todas as migrations estão aplicadas.
2. No `.env` da EC2 dev, manter o fingerprint exato do banco:
   `DEV_TEST_ALLOWED_DB_HOST` e `DEV_TEST_ALLOWED_DB_NAME`.
3. Simular a carga, dentro de `backend/`:

   ```bash
   npm run dados-dev:rhdp-pessoal:auditar
   ```

4. Conferir empresa, duas obras, setor e usuário exibidos no resumo.
5. Aplicar somente no ambiente dev:

   ```bash
   ALLOW_DEV_TEST_WRITES=true npm run dados-dev:rhdp-pessoal:aplicar
   ```

6. Guardar a saída do comando como evidência. A competência pode ser fixada, quando necessário,
   com `RHDP_TEST_COMPETENCIA=2026-09`. Empresa, obras, setor e usuário também podem ser escolhidos
   por `RHDP_TEST_EMPRESA_ID`, `RHDP_TEST_OBRA_IDS=1,2`, `RHDP_TEST_SETOR_ID` e
   `RHDP_TEST_USUARIO_ID`.

## Massa de dados criada

| Matrícula | Cenário | Configuração principal | Uso esperado |
|---|---|---|---|
| `QA-RHDP-001` | Mensal 40/60 | CLT, mensal, salário R$ 5.000,00, conta salário | cálculo e dois títulos |
| `QA-RHDP-002` | CLT por diária | CLT, diária de R$ 240,00 | confirmar que 40/60 não se aplica |
| `QA-RHDP-003` | Não CLT por diária | Não CLT, diária de R$ 180,00 | finais de semana, feriados e faltas |
| `QA-RHDP-004` | Transferência | duas obras na mesma competência | jornada, aprovação e rateio |
| `QA-RHDP-005` | Afastado | status AFASTADO | comunicação de retorno e ativação |
| `QA-RHDP-006` | Pensão | desconto de R$ 900,00 e beneficiário completo | desconto nos 60% e título separado |
| `QA-RHDP-007` | Parcelado | R$ 1.000,00 em 3 parcelas editáveis | edição e cancelamento de recorrência |
| `QA-RHDP-008` | Desligado | status INATIVO e demissão anterior | filtros e bloqueios de operação |

Todos os registros usam nomes iniciados por `[QA DP]`, dados bancários fictícios e observação
`[QA_RHDP_DEV]`.

## Perfis necessários

Executar a matriz com, no mínimo:

- usuário DP com acesso completo ao RH-DP;
- responsável da primeira obra;
- responsável da segunda obra;
- usuário sem vínculo com essas obras;
- usuário sem permissão para gestão de eventos recorrentes.

As permissões devem ser configuradas pela tela de permissões granulares. A carga não concede
acesso automaticamente.

## Matriz funcional

Preencher a coluna **Resultado** com `APROVADO`, `REPROVADO` ou `BLOQUEADO`, anexando a evidência
na execução do teste.

| ID | Área | Perfil/cenário | Procedimento | Resultado esperado | Resultado |
|---|---|---|---|---|---|
| PES-001 | Lista | DP | Abrir Pessoal e pesquisar `QA-RHDP-001` | Registro aparece uma vez, com empresa, obra, função e status corretos | |
| PES-002 | Lista | DP | Filtrar por ATIVO, AFASTADO e INATIVO | Cada massa aparece somente no filtro compatível | |
| PES-003 | Detalhe | Mensal 40/60 | Abrir a ficha do `QA-RHDP-001` | Salário, cálculo mensal, 40/60 e conta SALÁRIO são exibidos | |
| PES-004 | Detalhe | CLT diária | Abrir `QA-RHDP-002` | Tipo CLT permanece; forma gerencial é diária; valor R$ 240,00; 40/60 desligado | |
| PES-005 | Detalhe | Não CLT diária | Abrir `QA-RHDP-003` | Tipo Não CLT e diária de R$ 180,00 são exibidos | |
| PES-006 | Dados bancários | Mensal 40/60 | Conferir favorecido, CPF, banco, agência, conta, tipo e PIX | Dados completos, vinculados ao colaborador e ao parceiro financeiro | |
| PES-007 | Edição | DP | Alterar telefone e salvar; recarregar a ficha | Alteração persiste sem mudar obra ou salário | |
| PES-008 | Proteção | DP | Tentar alterar diretamente obra e salário pela ficha | Sistema orienta a usar solicitação formal e não altera o dado | |
| ACC-001 | Visibilidade | Responsável obra 1 | Abrir Pessoal | Vê apenas colaboradores das obras permitidas | |
| ACC-002 | Visibilidade | Usuário sem vínculo | Pesquisar os oito CPFs/matrículas QA | Não recebe dados das obras sem vínculo | |
| ACC-003 | API | Usuário sem vínculo | Tentar abrir diretamente o ID de um colaborador QA | API responde acesso negado, sem expor a ficha | |
| ACC-004 | Permissão | Usuário sem gestão de recorrentes | Abrir Pessoal | Aba Gestão de eventos recorrentes não é exibida | |
| ACC-005 | Permissão | DP | Abrir Pessoal | Aba Gestão de eventos recorrentes é exibida e utilizável | |
| SOL-001 | Código | Responsável de obra | Criar uma solicitação válida | Código único é gerado e aparece na lista/detalhe | |
| SOL-002 | Retorno | Afastado | Solicitar retorno do `QA-RHDP-005` e DP tomar ciência | Colaborador muda formalmente de AFASTADO para ATIVO | |
| SOL-003 | Salário | Mensal 40/60 | Solicitar alteração salarial sem função | Formulário exige motivo, não exige justificativa; aprovação atualiza salário e histórico | |
| SOL-004 | Salário + função | Mensal 40/60 | Marcar alteração de função, informar novo cargo e aprovar | Uma única decisão efetiva salário e função juntos | |
| SOL-005 | Transferência | Transferência | Criar transferência para outra obra | Modal lista somente cadastros do tipo OBRA, sem centros de custo | |
| SOL-006 | Demissão | Colaborador ativo | Abrir e aprovar solicitação de demissão | Status, data e vínculo são encerrados; histórico permanece | |
| SOL-007 | Rejeição | Qualquer solicitação | Rejeitar informando motivo | Situação e motivo aparecem no histórico; cadastro não é alterado | |
| SOL-008 | Notificação | Obra e DP | Comentar/interagir em solicitação | Destinatários recebem aviso e leitura fica rastreável | |
| SOL-009 | Concorrência | Responsável de obra | Clicar duas vezes rapidamente em Criar/Enviar | Apenas uma solicitação e um código são gerados | |
| EVT-001 | Pensão | `QA-RHDP-006` | Abrir evento de pensão existente | Beneficiário, CPF e dados bancários/PIX aparecem completos | |
| EVT-002 | Parcelas | `QA-RHDP-007` | Abrir evento parcelado | Três parcelas aparecem: 333,33; 333,33; 333,34; soma R$ 1.000,00 | |
| EVT-003 | Edição | `QA-RHDP-007` | Editar valores mantendo soma R$ 1.000,00 | Sistema salva a nova distribuição e mantém memória das parcelas | |
| EVT-004 | Validação | `QA-RHDP-007` | Informar parcelas cuja soma difere do total | Salvamento é bloqueado com mensagem objetiva | |
| EVT-005 | Cancelamento | `QA-RHDP-007` | Cancelar o evento no meio da vigência | Evento fica inativo; competências já apuradas não são reescritas | |
| EVT-006 | Competência | Novo evento | Selecionar competência pelo campo de mês | Valor é armazenado como `AAAA-MM` e exibido como `MM-AAAA` | |
| EVT-007 | Valor | Novo evento | Digitar valor com mais de um algarismo e centavos | Campo aceita o valor completo sem limitar a um inteiro | |
| JOR-001 | Diária | Não CLT diária | Em período de 15 dias, informar 4 finais de semana e nenhuma falta | Sistema calcula 11 diárias = R$ 1.980,00 | |
| JOR-002 | Diária | Não CLT diária | Adicionar 1 feriado dentro do mesmo período | Sistema calcula 10 diárias = R$ 1.800,00 | |
| JOR-003 | Diária | Não CLT diária | Adicionar 1 falta além do feriado | Sistema calcula 9 diárias = R$ 1.620,00 | |
| JOR-004 | CLT por diária | `QA-RHDP-002` | Repetir período com 11 dias remuneráveis | Sistema calcula R$ 2.640,00 e não aplica 40/60 | |
| JOR-005 | Mensal | `QA-RHDP-001` | Abrir jornada/apuração | Exibe salário bruto de R$ 5.000,00 como base | |
| JOR-006 | Campo removido | Qualquer colaborador | Abrir formulário de jornada | Campo de hora extra não é exibido nem exigido | |
| JOR-007 | Duas obras | `QA-RHDP-004` | Distribuir dias/valor entre as duas obras | Soma por obra fecha com o total efetivamente recebido | |
| JOR-008 | Mesmo responsável | Duas obras com mesmo responsável | Enviar jornada | Envio segue automaticamente, sem aprovação adicional | |
| JOR-009 | Responsáveis diferentes | Duas obras com responsáveis diferentes | Enviar jornada | Aprovação de ambos é exigida antes do DP | |
| JOR-010 | Rejeição parcial | Responsáveis diferentes | Um responsável rejeitar sua parte | Toda a jornada volta para correção | |
| APU-001 | 40% | `QA-RHDP-001` | Apurar período de 1 a 15 | Valor sugerido é 40% do bruto: R$ 2.000,00 | |
| APU-002 | 60% | `QA-RHDP-001` | Apurar período de 16 ao fim do mês | Valor sugerido é 60% do bruto: R$ 3.000,00 | |
| APU-003 | Edição | Mensal 40/60 | Alterar o valor sugerido | Observação passa a ser obrigatória e divergência fica registrada | |
| APU-004 | Vencimento | Competência com fim em dia não útil informado | Gerar previsão/título | Vencimento é antecipado para o dia útil anterior | |
| APU-005 | Pensão | `QA-RHDP-006` | Apurar e fechar os dois períodos | Pensão não reduz os 40%; é descontada integralmente dos 60% | |
| APU-006 | Transferência | `QA-RHDP-004` | Fechar competência com duas obras | É gerado um título do colaborador com distribuição entre as obras | |
| FIN-001 | Títulos | `QA-RHDP-001` | Fechar competência mensal | São gerados títulos distintos de 40% e 60%, sem duplicidade | |
| FIN-002 | Identificação | Qualquer QA | Abrir título na fila de pagamento | Título identifica colaborador e empresa corretamente | |
| FIN-003 | Conta salário | `QA-RHDP-001` | Abrir pagamento | Tipo de conta SALÁRIO é exibido | |
| FIN-004 | Pensão | `QA-RHDP-006` | Fechar competência | Título separado é gerado para a beneficiária, ligado ao evento | |
| FIN-005 | Reprocessamento | Competência já fechada/gerada | Repetir a ação ou duplo clique | Nenhum título duplicado é criado | |
| DOC-001 | Checklist | Nova admissão | Criar pedido sem documentos obrigatórios | Envio é bloqueado e lista exatamente os documentos faltantes | |
| DOC-002 | Anexo | Nova admissão | Anexar documentos e enviar | Arquivos ficam ligados ao pedido e, após aprovação, ao colaborador | |
| DOC-003 | Auditoria | Alteração salarial/transferência | Concluir o fluxo e consultar histórico | Usuário, datas, valores anteriores/novos e decisão ficam registrados | |
| REG-001 | Idempotência da massa | Operador EC2 dev | Executar a carga duas vezes | Permanecem oito matrículas QA, sem duplicar vínculos, salários ou eventos | |
| REG-002 | Proteção de ambiente | Máquina sem fingerprint dev | Tentar executar auditoria/aplicação | Script recusa antes de conectar/gravar | |
| REG-003 | Proteção de escrita | EC2 dev | Executar `:aplicar` sem `ALLOW_DEV_TEST_WRITES=true` | Script recusa e nenhuma linha é alterada | |
| REG-004 | Regressão automatizada | Backend | Rodar as quatro suítes RH-DP | Todas encerram sem erro | |

Comandos da regressão automatizada:

```bash
npm run test:rhdp-escopo-obra
npm run test:rhdp-jornada-periodos
npm run test:rhdp-regras-pagamento
npm run test:rhdp-eventos-recorrentes
```

## Critério de aceite

- Nenhum teste crítico de acesso, cálculo, aprovação, geração financeira ou idempotência pode ficar
  reprovado.
- Diferenças monetárias devem ser comparadas em centavos.
- Uma solicitação, apuração ou título não pode ser duplicado por clique repetido ou reprocessamento.
- Dados de uma obra não podem ser retornados para usuário sem vínculo/permissão.
- Evidências mínimas: captura da tela, ID/código gerado e resposta da API ou trecho de log quando o
  caso for negativo.
