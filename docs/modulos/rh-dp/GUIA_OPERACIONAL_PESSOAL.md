# Guia operacional do RH/DP e da tela Pessoal

Este guia partiu da revisão do código da `refactor/frontend` em 02/10/2026 (commit `f82dc339`) e inclui a jornada gerencial v2 publicada nessa branch ate `8e2afc13` em 03/10/2026. A v2 continua desligada por padrao e sem homologacao integrada; publicacao do codigo nao significa ativacao em dev nem producao. É um mapa funcional para operação, treinamento e homologação, não uma confirmação de que determinada migration, flag ou configuração já foi aplicada em cada ambiente. A tela **Pessoal** concentra sete abas; algumas só aparecem para quem tem a permissão correspondente. O cadastro completo, a gestão documental, as importações e os relatórios de RH/DP também têm páginas próprias.

## Visão do processo

| Momento | Quem inicia ou atua | Resultado no sistema |
| --- | --- | --- |
| Admissão ou movimentação | Obra ou usuário autorizado cria e envia; DP decide | Cadastro, situação funcional ou vínculo são alterados **somente após a aprovação**. |
| Transferência entre obras | Responsáveis ou substitutos das obras | A outra obra decide; o DP não é a etapa aprovadora desse fluxo específico. |
| Jornada | Obra informa sua parte; DP analisa | Envio confirmado gera origem para apuração; jornada enviada não é pagamento nem baixa financeira. |
| Apuração | DP | Calcula a pré-folha, aplica eventos, permite ajustes e conferência. |
| Fechamento | Usuário com permissão de fechamento | Gera títulos **PAGAR** no Financeiro. A baixa/pagamento ocorre depois, no fluxo financeiro. |

O RH/DP mantém cadastro funcional, vínculos, documentação, competência e cálculo. O Financeiro é responsável pela obrigação monetária e pela baixa; SST mantém seu domínio de saúde e segurança. A obra enxerga colaboradores e solicitações no escopo das obras vinculadas ao usuário. Esconder uma aba ou um botão não é a única barreira: as rotas do backend conferem permissões e os serviços aplicam o escopo da obra.

## Acesso às abas e poderes

A rota `/rh-dp/pessoal?aba=...` usa a aba **Solicitações** como padrão. Na interface, a ordem é esta:

| Aba | Acesso e ação principal |
| --- | --- |
| Solicitações | Disponível na tela Pessoal. Ver pedidos depende de acesso aos colaboradores; criar/enviar exige `rh_dp.solicitacoes.abrir`, decidir exige `rh_dp.solicitacoes.decidir`. |
| Colaboradores | Disponível na tela Pessoal, com dados filtrados por obra quando aplicável. A obra solicita alterações; a edição direta do cadastro geral é reservada aos perfis autorizados. |
| Transferências entre obras | Disponível na tela Pessoal. A capacidade de decidir depende de ser responsável ou substituto da obra envolvida, não apenas de visualizar a aba. |
| Eventos recorrentes | Só aparece com `rh_dp.eventos_recorrentes.visualizar`. A obra, se autorizada, consulta os eventos aprovados de seus colaboradores; editar ou desativar é ação do setor DP, com permissão de decisão. |
| Pagamento de Mão de Obra | Disponível na tela Pessoal. Consultar jornadas usa acesso aos colaboradores; registrar/importar jornada exige permissão de abrir solicitação. |
| Apuração | Só aparece para quem pode visualizar, editar ou executar fechamento de apuração. Editar/gerar/conferir exige capacidade de edição. |
| Fechamentos | Só aparece com permissão de obrigações/fechamento **e** módulo `FINANCEIRO` habilitado. Estorno exige permissão própria de reabertura. |

O perfil `SUPERADMIN` possui exceções administrativas previstas nas funções centrais de acesso. Isso não elimina as regras de integridade dos dados: status, documentos, vínculos, bloqueio por título baixado e demais validações continuam relevantes. A aprovação de alteração salarial usa permissão nominal mais restrita para perfis não superadministrativos. A autorização exata de cada usuário deve ser conferida em **Permissões de Áreas por Usuário**.

## 1. Solicitações

Esta é a fila dos pedidos de Pessoal. A lista pode ser filtrada por situação e tipo e mostra os pedidos em andamento para ação. O detalhe reúne dados do pedido, documentos, checklist, histórico, comentários e leitura.

### Como um pedido avança

1. **Criar rascunho** grava o pedido como `RASCUNHO` e permite anexar arquivos. Não o envia ao DP. O botão é bloqueado durante a criação para evitar cliques repetidos. O backend impede outro pedido em rascunho ou aberto do mesmo colaborador, tipo e subtipo.
2. No rascunho, o solicitante seleciona no checklist os documentos que se compromete a entregar e pode anexar vários arquivos. Um arquivo sem classificação fica na solicitação, mas não compõe automaticamente o dossiê classificado do colaborador.
3. **Enviar ao DP** muda `RASCUNHO` para `ABERTA`. O envio verifica os documentos obrigatórios exigidos pelo tipo de pedido. O checklist prometido só pode ser alterado enquanto ainda é rascunho.
4. O decisor valida ou recusa anexos. **Aprovar** exige que os documentos marcados no checklist tenham sido entregues **e validados**; somente então aplica a alteração funcional e muda para `APROVADA`.
5. **Devolver para correção** (`REJEITADA`) exige motivo. O solicitante pode juntar ou substituir a documentação e **reenviar** para `ABERTA`. Pedidos ainda não aprovados também podem ser cancelados conforme as regras do backend e os botões disponíveis na tela.
6. O solicitante pode **solicitar retorno** de pedido aberto, com motivo. O pedido permanece `ABERTA` até o DP decidir e usar **Devolver**; a solicitação de retorno é registrada no histórico e aparece como nova interação. A lista da aba abre sem filtro de situação, exibindo também rascunhos e pedidos já decididos.

**Limite da interface atual:** o botão **Reenviar** da aba envia os dados já gravados, sem formulário para editar os campos principais do pedido devolvido. O serviço aceita dados corrigidos pela API e os revalida, mas isso não equivale a uma edição disponível na tela. Se o motivo da devolução for um dado cadastral incorreto, não pressuponha que anexar documentos e clicar em Reenviar corrigirá esse dado; é preciso tratar o pedido por fluxo autorizado antes da decisão.

Um pedido `JORNADA` é exceção: não é aprovado manualmente como admissão ou movimentação; ele é concluído pelo fluxo de apuração. A confirmação de envio da jornada, portanto, não equivale a aprovação da folha.

### Tipos e efeito da aprovação

| Tipo | Regra operacional |
| --- | --- |
| Admissão | Reúne identificação, dados pessoais, contatos, endereço, dados funcionais e bancários. Permite segundo telefone e segundo endereço opcionais; se o segundo endereço for iniciado, logradouro e município são necessários, e telefone adicional exige DDD. A aprovação cria o colaborador e seu primeiro vínculo em obra, preservando documentos validados no dossiê. |
| Movimentação — atestado/férias | Registra o evento para consulta e reflexo na apuração, sem apagar o histórico. |
| Movimentação — retorno de afastamento | Formaliza o retorno e reativa o colaborador conforme a data e validações do pedido. |
| Movimentação — alteração de cargo | Atualiza cargo e histórico após aprovação. |
| Movimentação — alteração salarial | Registra novo valor, vigência e motivo; a decisão exige a autorização salarial específica da Diretoria para perfis não superadministrativos. |
| Movimentação — vincular a uma obra | É a **primeira lotação** de quem ainda não possui obra. A obra de destino precisa estar no escopo do solicitante; o vínculo real só nasce com a aprovação. Quem já está lotado utiliza **Transferências entre obras**. |
| Demissão | Exige a modalidade/motivo pertinente. A aprovação marca a situação funcional, data de desligamento e encerra o vínculo sem apagar histórico ou documentos. |
| Evento recorrente | A aprovação cria a regra futura de crédito ou desconto; não é apenas uma anotação no pedido. |

Existem tipos legados de troca de obra e alteração salarial; para novas operações, a tela organiza essas escolhas pelos fluxos de movimentação e transferência descritos acima.

## 2. Colaboradores

É a visão operacional de quem está na obra, com busca por nome, CPF ou matrícula, filtro de obra e destaque para quem tem solicitação aberta. A partir da lista é possível consultar o histórico, abrir movimentação, pedir demissão e solicitar evento recorrente, respeitando a permissão e o escopo de cada usuário. **Pedir admissão** inicia o pedido da seção anterior; não cadastra imediatamente um colaborador ativo. Também há atalhos para envio de jornada.

O cadastro geral de colaboradores é uma página separada, gerida pelo RH/DP autorizado. Ali ficam dados funcionais como empresa, obra, vínculo, cargo, remuneração e dados para pagamento. Mudanças feitas pelo fluxo de solicitação só se refletem nesse cadastro quando aprovadas. A obra não deve usar um atalho de tela como substituto da aprovação formal.

## 3. Transferências entre obras

A aba tem uma consulta global resumida de colaboradores (identificação e lotação, sem expor salário/documentos) e a fila de transferências das obras do usuário. Serve para trocar a lotação de um colaborador **já vinculado** a uma obra. O pedido informa origem, destino e motivo; não se usa um centro de custo como destino.

O responsável ou substituto autorizado da obra envolvida inicia a transferência. A decisão cabe a outro responsável/substituto da outra obra; se o mesmo usuário for responsável por ambas, existe aprovação automática conforme a regra implementada. Uma transferência aberta impede outra simultânea para o mesmo colaborador. As situações operacionais são `ABERTA`, `APROVADA`, `REJEITADA` e `CANCELADA`. Na aprovação, o vínculo anterior é encerrado e o novo é aplicado em transação, preservando a linha temporal e o histórico. A primeira lotação de colaborador sem obra **não** passa por essa aba: é a movimentação de Pessoal.

## 4. Eventos recorrentes

Esta aba acompanha créditos e descontos aprovados para uso nas competências seguintes. Os códigos oferecidos na tela incluem vale-alimentação, vale-transporte, plano de saúde, desconto de adiantamento, pensão alimentícia e outro. Cada evento registra natureza, valor, início, eventual fim ou parcelamento e observações. Pensão exige identificação do beneficiário e dados de pagamento suficientes para a obrigação correspondente.

O pedido nasce em **Solicitações**; a regra recorrente só existe depois da aprovação. O DP pode editar valores/parcelas futuras ou desativar com justificativa, sem reescrever parcelas já aplicadas a competências anteriores. Na apuração, a aplicação é recalculada de forma a não acumular duplicatas. Vale-alimentação e vale-transporte são, por padrão, tratados fora do líquido da folha; os demais seguem a configuração do evento. A obra autorizada visualiza apenas eventos aprovados dos colaboradores de suas obras e não gerencia a regra.

## 5. Pagamento de Mão de Obra

Há duas seções: **Enviar jornada** e **Jornadas enviadas**. A obra seleciona obra, competência e tipo de pagamento; o período e sua base são derivados da etapa, sem campos manuais na tela. A lista permite preencher colaboradores, baixar modelo, importar planilha e anexar fichas ou fotos depois do envio. A linha contém dias, faltas, regime normal ou empreitada, serviço/valor da empreitada, acréscimos, descontos, 13º, observação e PIX do título. Empreitada exige descrição do serviço e valor positivo; acréscimo ou desconto de mensalista exige observação. Valores monetários são convertidos antes do envio.

O backend valida vínculo, escopo da obra e dias até a data atual; **Dias na Obra** não aparece como campo porque é apenas limite de validação. **Faltas são informativas**: não viram desconto automático. Diarista seleciona datas trabalhadas individualmente; cada envio pode gerar pagamento independente na mesma competência, sem reutilizar um dia já enviado. Mensalista faz 40% e 60% em etapas distintas. Uma linha já enviada exige retorno autorizado pelo DP para correção; substituição preserva a versão anterior no histórico. Pedido pendente ou autorizado impede gerar/conferir/fechar a apuração; se ela já foi conferida, a autorização reabre o rascunho com auditoria, e uma apuração fechada exige estorno financeiro antes do retorno. Após correção, é obrigatório regerar a apuração.

O modelo de planilha espelha os campos editáveis da tela e inclui datas da diária, chave PIX, nome e CPF do beneficiário. A chave cadastrada é pré-preenchida. Trocar a chave requer informar nome e CPF válido do novo beneficiário; a alteração fica no pagamento daquela jornada, não muda o cadastro permanente do colaborador. O DP vê a troca na apuração e deve conferir o favorecido antes de fechar.

**Jornadas enviadas** mostra competência, obra, etapa, período, colaboradores, situação e data de envio. **Abrir jornada** exibe as linhas originais em modo de leitura, inclusive versões substituídas, e permite pedir retorno de uma linha ao DP; **Ir para Apuração** é navegação separada para quem tem permissão. Anexos podem ser vinculados à jornada já existente. O envio não cria, por si só, um título financeiro.

### Cálculo usado pela apuração

| Regime | Base de cálculo antes de eventos e ajustes |
| --- | --- |
| Mensal | Salário/valor contratual do período. Quando há mais de uma obra, os dias informados distribuem o custo entre elas; não reduzem automaticamente o total mensal do colaborador. |
| Diária | Valor da diária multiplicado pelos dias remunerados informados. |
| Empreitada | Valor informado da empreitada, com serviço executado identificado. |
| Outros vínculos não CLT | Usa valor informado quando existente; caso contrário, aplica a regra proporcional pelos dias-base ou valor contratual prevista no serviço. |

13º, adicionais, créditos e descontos entram na memória de cálculo; eventos recorrentes são incorporados conforme sua natureza e configuração. **40% e 60% são apurações separadas**, cada uma com um vencimento e um título por colaborador. O fechamento de uma apuração antiga sem etapa não divide mais automaticamente o líquido em dois títulos: deve ser refeita no fluxo de etapas. O fluxo (`ADIANTAMENTO_40`, `SALDO_60`, `DIARIA`) depende de `RH_JORNADA_40_60_ETAPAS=ON` no backend e `VITE_RH_JORNADA_40_60_ETAPAS=ON` no build do frontend, após migration e homologação. Com as flags desligadas, novos envios por etapa são recusados; não tratar o fluxo como liberado apenas porque o código está no repositório.

Na implementação em etapas, 40% e 60% não podem cobrir os mesmos dias; o saldo leva em conta o adiantamento já fechado, e as recorrências devem ocorrer uma vez na competência. Diárias são envios independentes, respeitando os dias de vínculo. Uma conversão mensalista→diarista com acerto misto pode ser calculada para conferência, mas o fechamento financeiro continua **bloqueado** enquanto a apropriação contábil por obra e eventual crédito do DP não estiver concluída e homologada.

## 6. Apuração

O DP gera a pré-folha por competência a partir de jornadas/importações **confirmadas**. Há filtros de competência, empresa, obra, vínculo e status, uma lista de apurações e detalhe por colaborador. Gerar pode criar ou atualizar rascunhos de recortes elegíveis; recortes já conferidos são preservados. Cada item traz memória de cálculo, dados de pagamento, créditos, descontos, valor bruto e líquido. A edição de item em `RASCUNHO` permite ajuste manual de crédito/débito, observação, status de conferência e chave PIX do título, sob permissão específica.

Para concluir a conferência, **todos** os itens devem estar marcados `CONFERIDO`. Só então a apuração muda de `RASCUNHO` para `CONFERIDA`. Itens ou apurações já conferidos não são sobrescritos como se fossem um rascunho comum. A aba também apresenta colaboradores com passagens por mais de uma obra: cada obra envia sua parte; o DP verifica partes pendentes e consolida as jornadas disponíveis no modal próprio. O rateio guarda a distribuição por obra. Não se presume automaticamente uma jornada ausente.

O cálculo é gerencial e simplificado conforme a regra implementada; não substitui revisão trabalhista/contábil. Antes de fechar, o DP deve conferir dias, forma de remuneração, vigência, eventos, banco/PIX, beneficiários, empresa e obra. Quando o cálculo de conversão mensal→diária apontar acerto contábil ainda não suportado, a interface e o backend bloqueiam a geração de título, evitando rateio incorreto.

## 7. Fechamentos

O fechamento é iniciado a partir de uma apuração `CONFERIDA`, com permissão de execução e módulo Financeiro habilitado. A categoria é obrigatoriamente a categoria ativa `2.01.02.01 - Salários e Ordenados`, compatível com **PAGAR**, marcada para DRE e com grupo classificado. O operador informa data de fechamento, **um vencimento para toda a apuração** e observações. A apuração de 40% não mostra vencimento dos 60%, nem vice-versa.

Ao confirmar, o serviço cria o lote e títulos `PAGAR` vinculados às linhas da apuração, com favorecido e rateio por obra. Mensalista configurado pode produzir 40% e 60%; diarista, título de diárias; outros casos, título integral. Pensão alimentícia pode gerar obrigação própria ao beneficiário. Em passagens por mais de uma obra na competência, o sistema procura consolidar a parcela do colaborador em título único ainda aberto, acrescentando rateio, em vez de duplicar o pagamento. O detalhe da aba lista os títulos, valores, vencimentos e comprovantes disponíveis. **Fechar não significa pagar:** o título segue para o processo financeiro.

**Estornar e reabrir** exige permissão própria e justificativa. O backend recusa o estorno se algum título do lote tiver baixa ativa, valor baixado ou estado financeiro equivalente. Antes disso, cancela/reverte os títulos vinculados e reabre a apuração com registro de auditoria. Se houve reclassificação de rateio da parcela de 40% pelo fechamento posterior de 60%, a reabertura restaura o rateio anterior conforme o snapshot do fechamento. Não tente corrigir folha paga por exclusão direta no banco.

## Páginas relacionadas fora das sete abas

- **Cadastro de Colaboradores:** manutenção estrutural de dados funcionais e pagamento, para perfis com acesso de cadastro.
- **Documentos/Dossiê:** tipos de documento, validação, consulta e substituição com controle de acesso e link assinado; anexos de solicitação não equivalem automaticamente a documento validado.
- **Importações:** prévia e confirmação de planilhas com histórico de linhas/erros. Jornada enviada pelo formulário também é registrada como origem confirmada para a apuração.
- **Relatórios/Painel RH/DP:** leitura operacional conforme permissão, sem substituir o detalhe de solicitação ou apuração.
- **Ticket/benefício:** fluxo próprio do DP, por competência, para colaboradores elegíveis; exige permissão de geração e módulo Financeiro para criação da obrigação. Não é uma aba de Pessoal.

## Roteiro mínimo de homologação

1. Com usuário de obra, conferir escopo de colaboradores, solicitações, jornada e transferências; tentar a mesma consulta fora da obra pela API deve ser negado ou filtrado.
2. Criar rascunho de admissão, anexar os obrigatórios, enviar; confirmar que a aprovação exige validação documental e só então cria cadastro/vínculo. Testar devolução e reenvio.
3. Testar primeira lotação sem obra e transferência de quem já está em obra, incluindo decisão pela outra obra e histórico de vigência.
4. Enviar jornada mensal, diária e empreitada; verificar faltas informativas, valores em moeda, limites de dias, observação dos ajustes e proteção contra reenvio/duplicidade. Consultar **Jornadas enviadas** e **Abrir jornada**.
5. Aplicar evento recorrente parcelado; conferir que competência anterior não muda após edição e que vale separado não infla o líquido.
6. Consolidar caso multiobra; conferir memória de cálculo, rateio, todos os itens `CONFERIDO` e bloqueios de fechamento.
7. Fechar uma apuração de teste, verificar títulos no Financeiro, vencimentos e comprovantes. Confirmar estorno antes de baixa e bloqueio depois de baixa.
8. Manter as flags de jornadas em etapas desligadas até homologar migration, cálculo, rateio, conversão mensal→diária e financeiro em conjunto. Não fazer o teste em dados de produção.

## Fontes do código

Este guia foi confrontado com `frontend/src/pages/RhDpPessoal.jsx`, `RhDpPessoalSolicitacoes.jsx`, `RhDpTransferencias.jsx`, `RhDpEventosRecorrentes.jsx`, `RhDpJornada.jsx`, `RhDpApuracao.jsx`, `RhDpFechamentos.jsx`; os serviços `backend/src/services/rhSolicitacaoService.js`, `rhTransferenciaService.js`, `rhEventoRecorrenteService.js`, `rhJornadaFormularioService.js`, `rhApuracaoService.js`, `rhFechamentoService.js`; e as permissões/rotas em `frontend/src/utils/acessoProduto.js` e `backend/src/routes.js`. Para testes detalhados, veja [Matriz de testes de Pessoal](MATRIZ_TESTES_PESSOAL_DEV.md). Para a implantação ainda condicionada por flags, veja [resumo RH/DP](README.md) e [handoff das jornadas em etapas](../../handoffs/2026-10-02-rhdp-jornadas-40-60.md).
