# Áudios de 24/08 + a ideia do módulo RH/DP consolidado

Data: 25/08/2026. **Organização do que foi dito, cruzada com o que existe no sistema.**
Nenhuma linha de código foi alterada por causa deste documento.

Fontes: dois áudios transcritos (`17.00.13` e `17.04.27`, via TurboScribe) e a descrição da tela
consolidada enviada com o print da tela de Colaboradores.

> **O terceiro áudio (`18.36.28.ogg`) não foi transcrito** — não veio `.docx` para ele, e eu não
> processo áudio. Se ele contiver decisão, ela **não está aqui**.

---

## 1. O que os áudios dizem — em ordem de peso

### 1.1 Prioridade: **DP é mais importante que estoque**

> *"Para mim, o DP é mais importante que o controle de estoque (...) isso é mais importante para a
> gente ter essa clareza de informação de custos."*

O argumento não é de gosto, é de uso: o estoque *"ainda acontece muito pouco"* e serve para o
engenheiro descobrir que um material existe em outra obra. O DP responde **quanto custa a mão de
obra por obra** — que é decisão.

### 1.2 O DP vira a origem do pagamento de mão de obra

> *"o próprio módulo de DP vai ser onde os engenheiros das obras vão solicitar o pagamento das mãos
> de obra deles (...) vem de uma solicitação de pagamento de mão de obra para uma solicitação dentro
> do módulo de DP, centralizada ali."*

Hoje: solicitação de pagamento → folha no escritório → conciliação bancária casa os dois.
Desejado: a solicitação **nasce no DP**, e daí sai apropriada no centro de custo da obra e nas
etapas, aparecendo no relatório financeiro.

### 1.3 O que se quer enxergar

| O que | Para quê |
|---|---|
| Transição de mão de obra **entre obras** | saber quem está onde |
| Contratado / demitido / **em aviso** | controle do quadro |
| Solicitação de contratação **com salário** | custo da mão de obra por obra |
| **Custo homem a homem** | quanto custa cada um |
| **Controle de presença / faltas** | *"quantos dias o cara está faltando"* |

### 1.4 Relatórios — a lacuna que preocupa

> *"não encontrei (...) quanto que tem de custo numa obra, detalhado, item a item, apropriado (...)
> quanto gastamos em cada etapa macro, quanto é o orçamento daquela etapa, qual o recebível."*

E a razão da preocupação é concreta:

> *"pode ser que o Pedro peça para saber o custo de alguma obra dele, detalhado, e já quer que
> imprima (...) se isso não estiver pronto, vai demorar."*

Ele mesmo pondera que **pode existir e ele não ter achado**, ou ser permissão do usuário dele.
**Isso é verificável, e ainda não verifiquei.**

### 1.5 O pedido de foco, e o porquê

> *"focar mesmo nessa consolidação dos processos das obras, para organizar isso o quanto antes."*

O motivo é organizacional, não técnico: *"quanto mais a gente demora, ficam mais coisas soltas,
processos errados andando errado"*, e gente ociosa gerando desconfiança.

Ele também se oferece para trabalhar junto — *"se tiver que eu fazer alguma coisa, usar meu cloud,
você me fala"*.

---

## 2. A tela consolidada — a ideia enviada com o print

Uma tela única, no formato da de **Colaboradores**, onde a **Obra solicita** e cada perfil vê o que
lhe cabe:

| Ação | Quem pede | Quem decide |
|---|---|---|
| **Admissão** de colaborador | Obra | DP |
| **Demissão** | Obra | DP |
| **Troca de obra** | Obra | DP |
| **Jornada de trabalho** — planilha **ou** formulário | Obra | DP |
| **Documentação** de admissão e demissão | Obra | DP |
| **Atestados** | Obra | DP |
| **Certificados de treinamento** | Obra | DP |
| **Alteração salarial** | Obra / DP | **Diretoria** |

Com **separação explícita do que é permitido a Obra, Departamento Pessoal e Diretoria**, e os
**alertas** consolidados na mesma tela.

Requisito declarado: *"um módulo estruturado e independente, aproveitando o que já está construído
no sistema"*.

---

## 3. O que JÁ existe — levantado no código e no banco

### 3.1 A base cadastral está pronta e populada

| Tabela | Registros | Observação |
|---|---|---|
| `rh_colaboradores` | **137** (todos ativos) | já tem `obra_id`, `tipo_vinculo`, `salario_base`, `data_admissao`, `data_demissao`, `status`, `parceiro_id` |
| `rh_documentos` / `rh_documentos_tipos` | 0 | **estrutura pronta, sem uso** |
| `rh_apuracoes` / `rh_apuracoes_eventos` | 0 | idem |
| `rh_fechamentos` / `rh_fechamentos_titulos` | 0 | idem — e o fechamento **já gera título financeiro** |
| `rh_importacoes` / `rh_importacoes_linhas` | 1 | o caminho de planilha existe |

**O colaborador já carrega o salário e a obra.** Os dois dados que o áudio 1.3 pede como base do
custo por obra **já estão no banco**.

### 3.2 Telas e serviços existentes

Telas: `RhDpInicio`, `RhDpColaboradores`, `RhDpDocumentos`, `RhDpImportacoes`, `RhDpApuracao`,
`RhDpFechamentos`, `RhDpEmpresas`, `RhDpRelatorioOperacional`, `UsuariosPermissoesRhDp`.

Serviços: `rhService`, `rhImportacaoService`, `rhApuracaoService`, `rhFechamentoService`,
`rhRelatorioService`.

### 3.3 Permissões granulares de RH já cadastradas

`rh_dp.dashboard.visualizar` · `rh_dp.empresas.gerenciar` · `rh_dp.colaboradores.visualizar` ·
`rh_dp.colaboradores.editar` · `rh_dp.documentos.visualizar` · `rh_dp.documentos.gerenciar` ·
`rh_dp.importacoes.executar` · `rh_dp.apuracao.visualizar` (e outras).

### 3.4 E o que **não** existe

- **Nenhum fluxo de solicitação/aprovação no RH.** Colaborador é CRUD: quem pode editar, edita.
  Não há "a Obra pede, o DP decide" em lugar nenhum do módulo;
- nenhuma **troca de obra** como evento — mudar `obra_id` é uma edição comum, sem rastro de quem
  pediu, quem aprovou, quando valeu;
- nenhuma **alteração salarial com aprovação**;
- nenhum conceito de **aviso prévio**;
- **controle de presença/faltas** não tem tabela própria (a apuração é o mais próximo, e está vazia).

---

## 4. O ponto que liga isto ao que acabamos de fazer

**O motor de solicitação e aprovação que o RH precisa já existe — e foi endurecido nos últimos dois
dias.**

O fluxo de contratos do lote de 23/08 é exatamente a mecânica que a tela consolidada descreve:

| O que o RH precisa | O que o fluxo de contrato já resolve |
|---|---|
| Obra pede, outro setor decide | solicitação com `area_responsavel` e roteamento por etapa |
| Cada perfil vê só os seus botões | `permissoesDoUsuarioNoContrato` + permissões **estritas** |
| Rejeitar devolve a quem pediu | itens 24/30 — volta para o **setor de quem criou** |
| Reenviar depois de corrigir | `reenviarContratoParaAprovacao`, com a fila de aprovação parqueada |
| Rastro de cada passo | `historicos` com ação, setor e status |
| Não vazar para quem não participou | regra de visibilidade por `ENVIADA_SETOR` |
| Anexo junto do pedido | comentário e anexo num ato só (item 19) |
| Aprovação de terceiro nível | a Diretoria já aprova solicitação (`prioridade_diretoria`) |

**A alteração salarial mediante aprovação da Diretoria** é, estruturalmente, o mesmo que o contrato
acima do limite indo ao Jurídico: um degrau a mais na mesma máquina.

> Isto é o que torna o pedido *"aproveitando o que já está construído"* realista: **não é construir
> um motor de workflow — é declarar tipos de solicitação novos sobre o motor que existe**, como a
> PI-16 fez quando decidiu que *"o contrato vive na solicitação"*.

---

## 5. O que eu ainda NÃO sei — e não vou fingir que sei

1. **Os relatórios do §1.4 existem?** Há `relatorioFinanceiroService`, `rhRelatorioService`, DRE,
   Financeiro de Obras e um `RhDpRelatorioOperacional`. **Não verifiquei** se algum entrega "custo
   por obra, item a item, por etapa macro, contra orçamento". É a verificação mais barata desta
   lista e a de maior retorno — pode ser que a resposta seja "existe, faltava permissão";
2. **O terceiro áudio** não foi transcrito;
3. **Presença/faltas**: o áudio pede *"quantos dias o cara está faltando"*. Não sei se a apuração
   cobre isso ou se falta estrutura;
4. **Como a folha é paga hoje** — o áudio descreve solicitação → folha → conciliação. Não levantei
   esse caminho;
5. **Escopo do "independente"**: se é um módulo à parte reaproveitando o motor, ou uma tela nova
   dentro do RH/DP atual.

---

## 6. O que eu proponho como próximo passo

**Não começar pela tela.** Começar pelas duas coisas que custam pouco e mudam a conversa:

1. **Verificar os relatórios** (§5.1). É uma tarde, e responde a preocupação mais concreta dos
   áudios — a de o Pedro pedir um custo de obra e não haver de onde tirar;
2. **Escrever o mapa de impacto do módulo** (regra do projeto: mapa antes da primeira linha),
   decidindo em papel: quais ações viram tipo de solicitação, quem decide cada uma, o que é
   aprovação simples e o que precisa de Diretoria, e o que a tela consolidada mostra a cada perfil.

Só depois disso a tela — que é a parte visível, mas é a última a ficar de pé.

E uma ressalva honesta sobre prazo: o lote de contratos levou **seis fases, 48 suítes e três dias**.
O módulo de RH descrito aqui é de porte comparável ou maior. O pedido de *"correr o máximo"* é
legítimo; o caminho de correr é **cortar escopo por fase**, não pular o mapa — foi o mapa que
impediu, nas últimas 48 horas, que quatro defeitos silenciosos fossem para produção.
