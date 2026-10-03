# Mapa de impacto — módulo DP operacional: a Obra solicita, o DP decide

Data: 25/08/2026. Escrito **antes da primeira linha de código** (regra §6 do `PROTOCOLO-QA.md`).

Origem: os áudios de 24/08 e a descrição da tela consolidada, organizados em
`NOTAS-AUDIOS-24-08-E-MODULO-RH-DP.md`.

Decisão do cliente (25/08): **o DP vem primeiro.** *"Depende de criação de fluxo operacional e
aprovação da tela com os botões de acesso para cada setor de acordo com a permissão de visibilidade
para cada um."* Os relatórios ele resolve por concessão de permissão.

---

## 0.0 RH e DP são setores diferentes — e só o DP existe (26/08)

Esclarecido pelo cliente, e é a primeira coisa que alguém precisa saber ao pegar este módulo.

O banco já traz os dois separados:

| Setor | Nome | Usuários | Solicitações no histórico |
|---|---|---|---|
| `DP` | DEPARTAMENTO PESSOAL | 3 | **224** |
| `RH` | RH | 0 | **1** |

**Tudo que este mapa e as seis fases descrevem é do DP.** Decidir admissão, demissão e troca de
obra; atestar documento; apurar folha; instruir alteração salarial — DP.

> **O RH ainda não existe no sistema.** Ele vai nascer depois e vai **reusar parte** do que está
> construído aqui.

### Por que o prefixo continua `rh_dp`

Decisão do cliente em 26/08: manter. Duas razões:

1. `rh_dp.*` já está em produção, dentro da configuração **versionada** de permissões de 30
   usuários. Renomear exigiria migrar essa configuração, as 12 tabelas `rh_*`, as rotas e as telas
   — refatoração grande em código vivo, por ganho de nome;
2. `dp.colaboradores.visualizar` ficaria **pior** quando o RH chegar. A permissão diz o que ela
   libera, não de quem é — e ver colaborador é coisa que os dois setores vão precisar.

### O que garante que o RH consiga reusar

Conferido no código em 26/08: **nenhum serviço deste módulo conhece setor.**

- não há `'DP'` escrito em nenhum dos cinco serviços nem nos dois controllers;
- quem decide é definido por **permissão** (`rh_dp.solicitacoes.decidir`), não por setor;
- `rh_solicitacoes` guarda apenas `setor_origem` — de onde o pedido veio, para a devolução voltar.
  **Não existe setor de destino** em lugar nenhum.

Conceder a permissão a um usuário do setor RH basta. **Não há código a mudar.**

### Pendência de dado, não de código

No fluxo antigo o setor aparece escrito de duas formas: `DP` em 224 solicitações e
`DEPARTAMENTO PESSOAL` em **7**. É o mesmo setor, e a divergência quebra filtro e relatório por
setor. Correção é de script de dados, não de migration — e aguarda decisão do cliente.

---

## 0. Decisões tomadas — 25/08

As quatro pendências do §7 foram respondidas. Ficam aqui porque cada uma muda o desenho.

| # | Pergunta | Decisão |
|---|---|---|
| 1 | A porta dos fundos | **O DP passa a ser obrigado pelo fluxo.** Trocar obra ou salário exige solicitação formal no sistema — não há mais edição direta no cadastro |
| 2 | Aviso prévio | **Entra como opção dentro do "Pedir demissão"**, não como um tipo de pedido separado |
| 3 | Quem é a Diretoria | **Uma permissão granular** concedível a qualquer usuário — não um setor, não uma pessoa |
| 4 | A Obra vê salário | **Sim** |
| 5 | Terceiro áudio | Dispensado pelo cliente |

**Efeito da nº 1 sobre a ordem das fases.** Fechar a porta é obrigatório, mas não pode acontecer
antes de existir o que a substitua: tirar a edição direta na Fase 1 deixaria o DP sem nenhuma
maneira de corrigir obra ou salário até a Fase 2 ficar pronta. Então:

- **Fase 1** — o vínculo passa a ser gravado **em toda mudança de obra**, inclusive nas feitas pelo
  cadastro. O rastro começa hoje, mesmo antes do fluxo;
- **Fase 2** — a edição direta de `obra_id` é **bloqueada** no cadastro, e o pedido vira o único
  caminho;
- **Fase 5** — o mesmo para `salario_base`, com a permissão de aprovação da Diretoria.

Cada transferência feita entre hoje e a Fase 2 fica registrada com motivo `AJUSTE`/`TROCA_OBRA` —
ou seja, o buraco não aumenta enquanto a porta ainda estiver aberta.

### 0.1 O módulo não está em uso — e isso muda o risco

Informado pelo cliente em 25/08: **o RH/DP não é operado pela empresa hoje.** Os 137 colaboradores
estão cadastrados, mas nenhuma tela do módulo roda de verdade — não há apuração, documento,
fechamento nem troca de obra acontecendo.

Consequências diretas para tudo que vem daqui em diante:

| O que deixa de ser preocupação | Por quê |
|---|---|
| Preservar comportamento legado | não há usuário para quebrar |
| Período de convivência entre o cadastro e o fluxo | ninguém depende do cadastro hoje |
| A ressalva do backfill sobre transferências passadas | **não houve transferência nenhuma** — o histórico começa limpo |
| Migrar dado de colaborador com cuidado | os 137 são cadastro parado, não operação |

**Isso permite fechar a porta dos fundos de uma vez, na Fase 2, sem transição.** O que continua
valendo integralmente: mapa antes do código, migration sem tocar em dado, bateria verde a cada fase
e QA independente. O que cai é só a compatibilidade com o passado.

> A ressalva registrada no script de carga — *"não reconstrói transferências anteriores"* — deixa de
> ter efeito prático: **não existiram transferências**. O custo por obra é confiável desde o começo,
> assim que as lotações forem preenchidas.

**Efeito da nº 3.** A permissão nova é `rh_dp.salario.aprovar`, no mesmo modelo estrito do item 31
(`userHasStrictAreaPermission`: sem atalho de SUPERADMIN e sem "não configurado = liberado").

**Efeito da nº 4.** A coluna de salário aparece para a Obra na tela consolidada. O mockup foi
atualizado.

---

## 1. O que JÁ existe — e é muito mais do que parece

Esta seção é a mais importante do mapa, porque muda o tamanho do trabalho.

### 1.1 A base cadastral está pronta e populada

`rh_colaboradores` — **137 registros ativos** — já tem: `obra_id`, `empresa_grupo_id`, `setor_id`,
`tipo_vinculo`, `cargo`, **`salario_base`**, `valor_contratual`, `data_admissao`, `data_demissao`,
`status`, `parceiro_id`.

### Correção de 25/08: a coluna existe, o dado não

Ao carregar o vínculo da Fase 1 eu contei os registros e a afirmação anterior deste mapa — de que
obra e salário já estavam preenchidos — **estava metade errada**:

| Campo | Preenchido |
|---|---|
| `salario_base` | **137 de 137** |
| `data_admissao` | **137 de 137** |
| `tipo_vinculo` | 137 de 137, todos CLT |
| **`obra_id`** | **1 de 137** |
| `setor_id` | 1 de 137 |

> **Quanto cada um ganha está no banco. Onde cada um trabalha, não.** 136 colaboradores estão sem
> obra.

Isso **não atrasa** o módulo — e até simplifica a Fase 1, porque quase não há histórico anterior a
preservar. Mas muda duas coisas:

1. **A Fase 7 (custo por obra) não tem base até alguém lotar os 136.** O relatório vai funcionar e
   mostrar quase nada, o que é pior do que não existir, porque parece resposta;
2. **Lotar os 136 é trabalho de operação, não de código.** Feito depois da Fase 2, cada lotação já
   nasce com vigência e rastro — melhor do que fazer agora pelo cadastro.

Achado secundário: `rh_empresas_grupo` está **vazia**, mas os 137 colaboradores apontam para as
empresas 1, 5, 6, 8 e 9. São referências órfãs no banco de teste. Não bloqueia nada agora, mas
qualquer tela que faça `include` da empresa vai trazer nulo.

### 1.2 A estrutura de documentos existe, com os tipos já cadastrados

`rh_documentos_tipos` já traz, por vínculo:

| Vínculo | Documentos |
|---|---|
| CLT | RG, CPF, CTPS, **ASO**, Contrato/ficha — todos obrigatórios |
| NÃO CLT | Documento pessoal, Contrato (obrigatórios), Documento fiscal |
| Todos | Comprovante bancário (obrigatório), Outros |

E `rh_documentos` tem `validade`, `status`, `documento_anterior_id` (substituição com histórico) e
`ativo`. **Zero registros** — estrutura pronta, nunca usada.

### 1.3 A apuração já modela presença e custo por pessoa

`rh_apuracao_eventos`, **por colaborador**: `dias_trabalhados`, **`faltas`**, `horas_extras`,
`valor_base_calculo`, `valor_bruto`, `valor_descontos`, `ajuste_credito_manual`,
`ajuste_debito_manual`, `valor_liquido`.

> É exatamente o *"quantos dias o cara está faltando"* e o *"custo homem a homem"* do áudio.
> **A estrutura existe. Nunca foi usada** (0 apurações).

### 1.4 A importação de planilha já entende jornada

`rhImportacaoService` aceita três tipos: **`JORNADA`**, `EVENTO_VARIAVEL` e `DESCONTO`. A de jornada
já lê `dias_trabalhados`, `faltas` e `horas_extras` por linha.

> O *"envio de jornada de trabalho via importação de planilha"* da tela consolidada **já tem
> caminho**. Falta o formulário como alternativa, e falta o fluxo de aprovação em volta.

### 1.5 O fechamento já vira título financeiro

`rhFechamentoService` cria `TituloFinanceiro` a partir da apuração, com categoria financeira e
`obra_id`.

> É o *"DP vira a origem do pagamento de mão de obra"* do áudio — **meio caminho andado**.
> **Lacuna:** não vi apropriação/rateio no centro de custo. O áudio pede que o custo apareça
> apropriado "no centro de custos da obra e nas etapas". **A verificar na Fase de fechamento.**

### 1.6 Permissões granulares de RH já existem

`rh_dp.dashboard.visualizar` · `rh_dp.empresas.gerenciar` · `rh_dp.colaboradores.visualizar` ·
`rh_dp.colaboradores.editar` · `rh_dp.documentos.visualizar` · `rh_dp.documentos.gerenciar` ·
`rh_dp.importacoes.executar` · `rh_dp.apuracao.visualizar`

---

## 2. O que NÃO existe — e é o trabalho de verdade

**Nenhum fluxo de solicitação e aprovação no RH.** Hoje colaborador é CRUD: quem tem
`rh_dp.colaboradores.editar` edita, e pronto. Não há "a Obra pede, o DP decide" em lugar nenhum.

Concretamente, faltam:

| Falta | Consequência hoje |
|---|---|
| **Admissão** como pedido | a obra liga para o DP; nada fica registrado |
| **Demissão** como pedido | idem, e sem controle de **aviso prévio** (não existe o conceito) |
| **Troca de obra** como evento | mudar `obra_id` é edição comum — **sem rastro** de quem pediu, quem aprovou, e a partir de quando vale |
| **Alteração salarial** com aprovação | idem, e o áudio pede aprovação de **Diretoria** |
| **Jornada por formulário** | só existe planilha |
| **Atestados e certificados** como evento | cabem em `rh_documentos`, mas sem fluxo |
| **Tela consolidada** com separação por perfil | as ações estão espalhadas em 8 telas |

### 2.1 A troca de obra é a mais silenciosa das lacunas

Mudar `obra_id` hoje **reescreve o presente e apaga o passado**: não há como saber que o colaborador
esteve na obra A até certa data e na B depois. Isso inviabiliza o *"custo de mão de obra por obra"*
em qualquer período que atravesse uma transferência — que é justamente o que o áudio quer medir.

**Isso não é só fluxo: é dado que falta.** Precisa de uma tabela de vínculo com período
(`colaborador × obra × vigência`), e é a decisão estrutural mais importante deste módulo.

---

## 3. A decisão central: reaproveitar o motor de solicitação

O cliente pediu *"um módulo estruturado e independente aproveitando o que já está construído"*.
O que já está construído, e serve inteiro, é o **motor de solicitação e aprovação** — o mesmo que o
lote de contratos endureceu entre 23 e 24/08.

| O que o DP precisa | O que o fluxo de contrato já resolve |
|---|---|
| Obra pede, DP decide | solicitação com `area_responsavel` e roteamento por etapa |
| Cada perfil vê só os seus botões | permissões **estritas** + `permissoesDoUsuarioNo...` |
| Rejeitar devolve a quem pediu | itens 24/30 — volta ao **setor de quem criou** |
| Corrigir e reenviar | `reenviar`, com a fila de decisão parqueada |
| Rastro de cada passo | `historicos` com ação, setor e status |
| Não vazar para quem não participou | visibilidade por `ENVIADA_SETOR` |
| Anexar junto do pedido | comentário e anexo num ato só (item 19) |
| Terceiro nível de aprovação | Diretoria, como o Jurídico é para contrato acima do limite |

**A alteração salarial com aprovação da Diretoria é, estruturalmente, o contrato acima do limite
indo ao Jurídico** — um degrau a mais na mesma máquina.

> **Não vamos construir um segundo motor de workflow.** Vamos declarar tipos de solicitação novos
> sobre o que existe — exatamente o que a PI-16 fez ao decidir que *"o contrato vive na solicitação"*.
>
> Isso também significa que os quatro defeitos corrigidos em 24/08 (o `[object Object]` do histórico,
> o roteamento da devolução, o da minuta, a permissão nominal do item 31) **já estão pagos** para o
> DP. Um motor novo repetiria os quatro.

---

## 4. Os três perfis e o que cada um faz

| Ação | OBRA | DP | DIRETORIA |
|---|---|---|---|
| Admissão | **pede** | decide | — |
| Demissão | **pede** | decide | — |
| Troca de obra | **pede** | decide | — |
| Jornada (planilha ou formulário) | **envia** | confere e apura | — |
| Documentos de admissão/demissão | **envia** | confere | — |
| Atestado | **envia** | registra | — |
| Certificado de treinamento | **envia** | registra | — |
| **Alteração salarial** | pede | analisa | **aprova** |
| Ver custo da própria obra | **sim** | sim | sim |
| Ver custo de todas as obras | não | sim | sim |

**A visibilidade segue a regra que já existe:** cada um vê o que passou pelo seu setor. A Obra vê os
colaboradores e pedidos **da obra dela** — não de todas.

---

## 5. O que pode quebrar

| Risco | Verificação |
|---|---|
| Duplicar o motor de workflow | a decisão do §3 é a proteção; a suíte prova que o pedido do DP usa `historicos` e `area_responsavel` como o contrato |
| Troca de obra apagar o histórico | tabela com vigência; suíte transfere e exige que o período anterior **continue legível** |
| Obra ver colaborador de outra obra | suíte com duas obras e dois usuários exige o isolamento |
| Alteração salarial sem Diretoria | suíte tenta aprovar como DP e exige recusa |
| Documento obrigatório faltando passar batido | os tipos já dizem `obrigatorio`; suíte tenta concluir admissão sem ASO e exige recusa |
| Fechamento sem apropriação no centro de custo | §1.5 — **a verificar**; se confirmado, é correção antes de escalar |
| CRUD atual virar porta dos fundos | hoje `rh_dp.colaboradores.editar` edita tudo direto. Com o fluxo, essa permissão precisa ser **reavaliada** — senão o DP contorna o próprio processo |
| Regressão nas 46 suítes | bateria completa a cada fase, como no lote de contratos |

### 5.1 A porta dos fundos merece decisão explícita

`rh_dp.colaboradores.editar` hoje permite mudar salário e obra **direto no cadastro**. Se o fluxo de
aprovação nascer ao lado dela sem que ela seja restringida, **o processo vira opcional** — e todo o
esforço se perde. Isso precisa ser decidido junto com o cliente, não por mim.

---

## 6. Fases propostas

Cada uma entrega algo usável e fecha com bateria verde.

| # | Fase | Entrega | Depende de |
|---|---|---|---|
| **1** | **Vínculo com vigência** | `colaborador × obra × período`, com migração dos 137 atuais | — |
| **2** | **Pedido e decisão** | admissão, demissão e troca de obra como solicitação, com o motor existente | 1 |
| **3** | **Documentos no fluxo** | anexos do pedido usando `rh_documentos` e os tipos obrigatórios | 2 |
| **4** | **Jornada** | formulário + a planilha que já existe, com conferência do DP | 2 |
| **5** | **Alteração salarial** | pedido com aprovação da **Diretoria** | 2 |
| **6** | **Tela consolidada** | tudo numa tela, com os botões por perfil | 2–5 |
| **7** | **Custo por obra** | o relatório que o áudio pede, sobre a apuração | 1, 4 |

**A Fase 1 vem primeiro porque é dado, não tela.** Sem o vínculo com vigência, o custo por obra
mente em qualquer período que atravesse uma transferência — e é tarde para corrigir depois que os
pedidos existirem.

**A tela consolidada é a Fase 6, não a 1.** É a parte visível, e por isso a tentação é começar por
ela; mas ela só tem o que mostrar depois que os fluxos existirem.

---

## 7. O que preciso do cliente antes de começar

1. **A porta dos fundos (§5.1):** o DP continua podendo editar salário e obra direto, ou passa a ser
   obrigado pelo fluxo?
2. **Aviso prévio:** a demissão tem etapa de aviso, com prazo, ou é pedido → decisão?
3. **Quem é a Diretoria** que aprova salário — um setor, uma pessoa, ou uma permissão nominal como a
   `contratos.fluxo.reenviar`?
4. **A obra vê o salário** dos colaboradores dela? É a informação mais sensível do módulo, e muda o
   desenho da tela.
5. **O terceiro áudio** (`18.36.28.ogg`) segue sem transcrição — se tiver decisão sobre DP, ela não
   está aqui.

**Nenhuma linha foi escrita.** Este mapa é o passo anterior.
