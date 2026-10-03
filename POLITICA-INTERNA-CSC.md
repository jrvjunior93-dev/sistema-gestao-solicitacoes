# Política interna da CSC — regras de negócio ditadas pelo cliente

Documento **só de regras da empresa**, separado do código e dos mapas de impacto. Existe porque
essas regras não estão em lugar nenhum do sistema: não dá para deduzi-las lendo o banco nem o
código, e presumir errado já custou retrabalho (registrado abaixo).

**Regra de uso:** toda política que o cliente passar entra aqui, com data e o efeito prático no
sistema. Antes de codar qualquer fluxo, conferir esta lista.

Última atualização: **17/08/2026**

---

## PI-1 · Contratos: aprovação em duas etapas conforme o valor (17/08/2026)

**Nenhum contrato nasce aprovado.** Todo contrato criado passa pela aprovação da **Gerência de
Processos**, que revisa a documentação.

O limite de **R$ 50.000,00** não muda quem aprova — muda o que vem **depois**:

| Faixa | Caminho |
|---|---|
| **Abaixo de R$ 50 mil** | Gerência de Processos aprova → contrato apto (dispensa o Jurídico) |
| **A partir de R$ 50 mil** | Gerência de Processos revisa e aprova → encaminha ao **Jurídico** → Jurídico avalia a documentação, **monta a minuta**, a minuta vai às partes para **assinatura** → só então o contrato está apto |

**Por que a Gerência de Processos vem primeiro:** ela revisa a documentação antes de encaminhar
ao Jurídico.

**O que o Jurídico faz:** avalia a documentação e monta a minuta do contrato que será enviada às
partes para assinatura.

### Efeito no sistema

- **Medição só depois do contrato apto.** Contrato acima do limite **não pode ser medido** antes
  da aprovação do Jurídico.
- O processo tem etapas visíveis o suficiente para justificar **status próprios** que digam em
  que ponto ele está (pedido do cliente: "podemos pensar em status da solicitação para dizer
  como está o processo"). Proposta em `MAPA-IMPACTO-MEDICAO.md` (MD-10), a confirmar.

### Erro que esta regra corrigiu

Implementei aprovação automática para contratos abaixo de R$ 50 mil, entendendo que "nascem
aprovados". Estava errado, e o efeito era grave: **títulos financeiros eram criados no ato da
criação do contrato**, sem ninguém aprovar. Revertido em 17/08, com guarda de regressão em
`qa/medicao/05-nenhum-contrato-nasce-aprovado.js`.

---

## PI-2 · Contratos: teto de 24 parcelas (17/08/2026)

Contrato do fluxo novo aceita no máximo **24 parcelas**. Vale no backend (a borda que decide) e
no bloco da tela.

---

## PI-3 · Medição: consome o que existe, não cria título (17/08/2026)

- A medição **vincula-se aos títulos/parcelas já existentes** do contrato — nunca cria título
  novo. Pode **editar valor e vencimento**.
- O status exibido em cada linha depende do momento do processo: **Previsão**, **Aberto**,
  **Quitado** — inclusive porque alguém com permissão pode ter alterado o status do título.
- **Medição parcial:** reduz o valor do título e **acrescenta a diferença na última parcela**.
  O total do contrato não muda.

---

## PI-4 · Medição: período (17/08/2026)

- Data final **não pode** ser anterior à inicial.
- Períodos **não podem se sobrepor** no mesmo contrato.

> **Conflito com os dados reais, pendente de decisão:** o banco tem **375 pares de medições
> sobrepostas** hoje — sobrepor período é prática corrente no sistema em produção. Por isso a
> regra foi ligada **apenas para contratos do fluxo novo**; o legado segue como sempre. Confirmar
> se a intenção é passar a bloquear também no legado (bloquearia trabalho que hoje acontece).

---

## PI-5 · O compromisso nasce quando o contrato fica ativo (18/08/2026)

Contrato ativo significa **compromisso assumido** — entra nas previsões de custo da empresa
mesmo que no fim não venha a ser pago. Vale igual para os contratos acima de R$ 50 mil, contando
a partir da assinatura.

Se o compromisso não se concretizar, cabe à **Gerência de Processos** avaliar esses contratos e
**cancelar os títulos**.

### Efeito no sistema

- As parcelas viram títulos financeiros **na entrada em `ATIVO`** — na aprovação da Gerência de
  Processos (abaixo do limite) ou após a assinatura (acima do limite)
- O usuário da obra **pode** editar o valor do título ao solicitar a medição. O controle é por
  **auditoria**, não por bloqueio: comparar o **valor previsto na criação do contrato** com o
  **valor solicitado por parcela**
- Para essa comparação existir, o valor previsto precisa ser guardado de forma imutável na
  criação (`contrato_parcelas.valor_previsto`)

---

## PI-6 · Saldo do contrato governa o que pode ser solicitado (18/08/2026)

O que limita uma medição **não é** o quanto já foi pago no título — é o **saldo do contrato**.

- Um título de R$ 5.000 que já teve R$ 3.000 pagos **pode** receber uma solicitação de R$ 1.000
- O sistema acompanha **dois números**: o saldo do contrato (o que ainda não foi comprometido) e
  quanto falta pagar **naquele título específico**
- **Não se solicita valor maior que o saldo do contrato.** Dentro do saldo, pode
- O sistema **mostra o quanto já está comprometido**, mesmo que ainda não pago

**Exemplo dado pelo cliente:** contrato de R$ 10.000 dividido em 10. Solicitada uma medição de
R$ 1.000, ao subir a segunda medição o saldo é de R$ 9.000 — e o usuário já vê o status da
primeira, mesmo que ela ainda não tenha sido paga.

### Título cancelado ou excluído devolve saldo

Quando um título é **CANCELADO/EXCLUÍDO**, o valor volta como saldo para a **parcela final do
contrato**.

### Encerramento de contrato (quebra de contrato)

A tela **Gestão de Contratos** precisa de uma ação para **encerrar o contrato e zerar o saldo
restante**, mesmo havendo títulos em aberto. Os títulos em aberto passam a **EXCLUÍDO**: é a
quebra de contrato, nada mais do que estava previsto será pago.

---

## PI-7 · Título quitado ou parcialmente pago fecha para edição (18/08/2026)

O não medido **volta para as últimas parcelas/títulos** do contrato (leitura A). Quando o
pagamento acontece e o valor da parcela é editado para o valor **realmente pago**, aquela parcela
**fecha** e a diferença de saldo é aplicada nas últimas.

Por consequência: assim que o título vira **QUITADO** ou **PARCIALMENTE PAGO**, ele fica
**fechado para edição** — o saldo já foi redistribuído. O usuário precisa ver o **status real** do
título.

### Quem pode editar depois

Editar o valor **depois** que a solicitação de medição já foi criada exige **permissão granular
própria** — não é qualquer usuário da obra.

---

## PI-8 · Título pago ou parcialmente pago é imutável (18/08/2026)

Nos contratos do fluxo novo, os status **Pago (QUITADO)** e **Parcialmente Pago (PARCIAL)**
**fecham o título e o tornam imutável** — a menos que haja **estorno** do título.

Por consequência, no **encerramento de contrato**: o valor **já pago** de um título parcialmente
pago passa a ser o **valor oficial** dele. O título fecha por esse valor (saldo zero), em vez de
ser excluído — excluir apagaria um pagamento que aconteceu — e em vez de ficar em aberto — o
contrato acabou e nada mais será pago.

---

## PI-9 · O título do contrato é a referência dele (18/08/2026)

Na criação de contrato pelo fluxo novo, o campo que era "Descrição" passa a ser o **Título**, e
esse título é a **referência do contrato** — é por ele que a **Medição** pesquisa o contrato
depois.

### Efeito no sistema

- A tela rotula o campo como "Título do contrato" quando o fluxo é o novo
- O texto é gravado como `ref_contrato`, além de `descricao`
- A busca por referência da Medição encontra o contrato por esse texto

---

## PI-10 · O limite do Jurídico é definido pela Diretoria, na tela (18/08/2026)

O corte que decide se o contrato **passa pelo Jurídico** depois da aprovação da Gerência de
Processos deixa de ser fixo no código: vira **configuração de tela**, alterável pela Diretoria
sem depender de deploy. Vale para os contratos novos a partir da mudança.

Padrão: **R$ 50.000**. O mesmo valor manda na exigência de negociação detalhada.

---

## PI-11 · Medição segue a ordem de vencimento das parcelas (18/08/2026)

Não existe "número da medição": o usuário **solicita pelas parcelas**. E a solicitação é
**obrigatoriamente na ordem do vencimento** — parcelas com vencimento posterior ficam
bloqueadas enquanto houver parcela anterior ainda não solicitada.

Ao solicitar pela parcela, o status da solicitação muda e o **setor de Gerência de Processos
altera o status do título**.

---

## PI-12 · Contratado, favorecido e aditivo (18/08/2026)

**Contratado (múltiplos):** todos respondem pelo contrato. O **pagamento vai ao favorecido**,
que pode ser **um terceiro** — não precisa ser um dos contratados. O favorecido é carregado
automaticamente com o **primeiro responsável pelo contrato**, e pode ser trocado.

**Documentação:** campo de anexo **único** — não há tipos de documento a cadastrar.

**Termo aditivo:** teto de **25% sobre o valor original** do contrato, **acumulando os aditivos
já aprovados**. Aditivo **rejeitado libera o valor de volta** para uma solicitação futura.

**Aprovação:** não existe etapa separada de "Gestor da Obra" nem de "Diretoria". Quem aprova é
definido pela **permissão granular**, concedida ao setor de **Gerência de Processos** — ou seja,
a máquina de estados já implementada continua valendo como está.

---

## PI-13 · Termo aditivo: teto de 25%, implementado (18/08/2026)

Detalhamento do que a PI-12 definiu, agora com as consequências que a implementação exigiu:

- O teto é **25% do valor ORIGINAL** do contrato — não do total já acrescido, senão o limite
  cresceria a cada aditivo
- **Só aditivo aprovado consome o teto.** Pendente não consome: se consumisse, um aditivo
  esquecido em análise bloquearia todos os outros
- **Consequência assumida:** dois aditivos pendentes podem, juntos, passar de 25%. O segundo é
  recusado na **aprovação**, não na solicitação
- **Rejeitado libera de volta** — e o valor liberado pode ser pedido de novo
- O contrato só é alterado na aprovação (`valor_aditivos` e, quando informado, a nova vigência)

---

## PI-14 · Abertura única de contrato (19/08/2026)

O tipo CONTRATO tinha três subtipos: **Abertura de Contrato**, **Solicitação de Contrato** e
**Aditivo de Contrato**. A empresa decidiu que **a Abertura passa a fazer o papel da Solicitação
também** — e o subtipo **Solicitação de Contrato deixa de existir**.

**O motivo, na palavra do cliente:** "Abertura de Contrato" só existia para **distinguir o fluxo
antigo do novo**. Na migração para produção, o **tipo de solicitação** `ABERTURA DE CONTRATO`
(id 2), que representa o **fluxo antigo**, será **desativado**. A partir daí abertura de contrato
existe apenas no fluxo novo, representada pelo **subtipo** Abertura de Contrato.

**Efeito no sistema:**

- Sobra **um único** subtipo de criação: `ABERTURA DE CONTRATO` (25). Os subtipos 26 e 27 são
  **desativados**, não excluídos — reversível e preserva o registro
- O subtipo de abertura **decide o fluxo pelo valor**: abaixo da variável de volume
  (`CONTRATO_LIMITE_JURIDICO`, hoje R$ 50.000) o contrato vai direto a `ATIVO`; a partir dela
  segue ao Jurídico. **Isto já funcionava** — o roteamento sempre foi por valor na aprovação,
  sem olhar subtipo. Como agora só existe um subtipo de criação, todo contrato do fluxo novo cai
  nesse roteamento por construção
- Desativar o **tipo** 2 é passo da **migração**, não deste ambiente: aqui ele segue ativo, com
  172 solicitações históricas

---

## PI-15 · Aditivo é ação sobre o contrato, não tipo de solicitação (19/08/2026)

O termo aditivo deixa de ser um subtipo da Nova Solicitação e passa a ser um **botão na tela de
medição**, que abre um **modal** com os campos obrigatórios. A partir do envio segue o fluxo do
aditivo já definido na PI-12/PI-13.

**Vale para contrato do fluxo antigo e do novo.** É a mudança central: até aqui o aditivo era
coisa só do fluxo novo.

**Efeito no sistema:**

- O subtipo `ADITIVO DE CONTRATO` (27) é **desativado**, e o bloco de aditivo sai de dentro do
  formulário da Nova Solicitação. **Uma porta só** para a mesma regra
- O **teto de 25% sobre o valor original** vale igual no legado — o cálculo sempre leu
  `valor_total`, que é o valor original, sem olhar o fluxo
- No contrato **legado**, o aditivo aprovado passa a **entrar no saldo**: o total solicitado
  vira `valor_total + ajuste_solicitado + valor_aditivos`. Cada mecanismo no seu campo —
  `ajuste_solicitado` continua sendo o ajuste manual do legado, e o aditivo aprovado nunca
  escreve nele. Sem duplo cômputo
- **Nenhum contrato existente muda de número:** os 335 legados têm `valor_aditivos = 0`
- Pedir o aditivo **não** envia a medição em curso: são dois atos separados
- Contrato **encerrado ou inativo não aceita aditivo** — guarda que não existia

Implementado em `MAPA-IMPACTO-ADITIVO-E-SUBTIPOS.md`.

---

## PI-16 · O contrato é uma solicitação (19/08/2026)

A abertura de contrato deixa de ser um registro à parte e passa a nascer como **uma solicitação**
— a **única** solicitação daquele contrato, que o acompanha por toda a vida dele.

**A razão de origem:** o usuário da obra que abre o contrato **não conhece os planos financeiros**
da empresa. Exigir dele a categoria financeira na abertura, como o sistema fazia, empurrava uma
decisão financeira para quem não tem como tomá-la. A categoria passa a ser informada **antes da
aprovação**, por quem aprova — e é **obrigatória** tanto abaixo quanto acima da variável de volume
(hoje R$ 50.000).

**O fluxo, na palavra do cliente:**

1. A abertura cria a solicitação; as **previsões** de parcelas aparecem no card do Financeiro
2. O botão **Aprovar**, no detalhe da solicitação, transforma as previsões em **títulos**
3. Acima da variável, depois de aprovada ela é encaminhada **automaticamente ao JURÍDICO**
4. O Jurídico aprova ou rejeita, gera a **minuta** e a anexa ao histórico
5. Aprovada pelo Jurídico, volta ao responsável com status **`Nec. de Assinatura`**
6. O responsável anexa o contrato assinado e aciona **Solicitar revisão**, que devolve a
   solicitação ao Jurídico **em destaque no topo** da lista
7. O Jurídico aprova; a solicitação **recebe os títulos** e volta ao responsável como **`Aprovado`**

**Medição e aditivo não criam solicitação nova** quando o contrato é do fluxo novo: alteram a
solicitação do contrato. Aditivo de contrato do fluxo **antigo** cria solicitação, porque lá não
existe a solicitação-mãe.

**Efeito no sistema:**

- A **unidade de aprovação e pagamento passa a ser o título**, não a solicitação. Um contrato com
  19 medições tem **uma** solicitação e vários títulos — hoje teria 19 solicitações
- **A solicitação é a fonte da verdade do estado.** `contratos.status_contrato` passa a espelhá-la
- A medição ganha **identidade própria** (número sequencial por contrato + período) para segurar
  anexos e comentários, sem voltar a ser solicitação. Cada título no card do Financeiro tem um
  botão que abre o modal com os anexos e comentários da medição que o gerou
- **Rejeitar** devolve ao responsável em **`PENDENTE DE AJUSTE`**, com o motivo — corrige e reenvia
- **Cancelar** é terminal (`CANCELADA`) e fica sob **permissão granular**
  (`contratos.solicitacao.cancelar`), não sob o setor: vale para Jurídico e Gerência de Processos
- Nada disso toca a trilha **legada**: as 665 medições históricas seguem como estão

Implementado em `MAPA-IMPACTO-CONTRATO-COMO-SOLICITACAO.md`.

---

## PI-17 · Tipo de uso do sistema, para o aditivo de contrato legado (19/08/2026)

O aditivo de contrato do **fluxo antigo** abre uma solicitação própria (PI-16), e toda solicitação
precisa de um tipo. Os **335 contratos legados não carregam tipo nenhum** (`tipo_macro_id` nulo),
então o tipo tinha de vir de algum lugar.

**Decisão da empresa:** criar o tipo **`ADITIVO DE CONTRATO`**, que **não aparece como opção na
Nova Solicitação** — é usado apenas quando o botão de solicitar aditivo é acionado. E o setor que
recebe esses pedidos é a **Gerência de Processos**, sempre.

**Não contradiz a PI-15.** Ela tirou o aditivo como **porta de entrada** — ninguém o escolhe numa
lista para abrir uma solicitação. Este tipo é **classificação** do que o botão cria. Sem ele, o
aditivo legado teria de tomar emprestado MEDIÇÃO ou CONTRATO, e mentiria em todo relatório.

**Efeito no sistema:**

- Nasce o conceito de **tipo de uso do sistema** (`comportamento.somente_sistema`): tipo criado por
  ação do sistema, nunca escolhido por alguém na Nova Solicitação
- A marca vive **no tipo**, não na lista por setor. `TIPOS_SOLICITACAO_POR_SETOR` é lista de
  permissão, e **setor sem lista mostra todos os tipos**: dos 19 setores ativos, **9 não têm
  lista**. Esconder por omissão vazaria para esses 9 — e voltaria a vazar a cada setor novo criado
- A tela filtra por essa marca, e a **rota de criação recusa** o tipo com mensagem própria:
  esconder só na tela seria cadeado na porta da frente com a janela aberta
- O setor é **fixo em GERÊNCIA DE PROCESSOS**, não herdado da tela de onde o botão foi acionado
- Qual tipo usar continua sendo **configuração** (`CONTRATO_ADITIVO_TIPO_SOLICITACAO`), e sem ela o
  sistema recusa dizendo o que configurar — em vez de escolher sozinho

**Cuidado que custou tempo antes:** o normalizador de comportamento **descarta qualquer chave que
não esteja no default**, nos dois lados. A flag do fluxo novo já se perdeu assim uma vez
(comentário em `tipoSolicitacaoBehaviorService.js:30`). `somente_sistema` foi acrescentada ao
default do backend **e** do frontend.

---

## PI-18 · O Jurídico confere o contrato assinado antes de os títulos nascerem (19/08/2026)

Fecha o desenho da PI-16. A trilha do Jurídico tinha **duas** etapas — minuta e assinatura — e era
a assinatura que criava os títulos. O cliente descreveu **três**:

1. Jurídico monta a **minuta** e devolve ao responsável → `Nec. de Assinatura`
2. O responsável **anexa o contrato assinado** e aciona **Solicitar revisão** → a solicitação volta
   ao Jurídico, **em destaque no topo** da lista
3. O Jurídico **confere e aprova** → só então a solicitação recebe os títulos e volta ao
   responsável como `Aprovado`

**O que muda de fato:** o compromisso financeiro deixa de nascer quando o responsável diz que
assinou, e passa a nascer quando o **Jurídico confere**. É a regra mais sensível deste bloco
(PI-1/PI-5: título só existe depois que alguém com autoridade aprova), e é por isso que o passo
extra importa — sem ele, quem colhe a assinatura é quem libera o dinheiro.

**Efeito no sistema:**

- Estado novo `EM_REVISAO_JURIDICA`, entre `AGUARDANDO_ASSINATURA` e `ATIVO`
- A etapa `assinado` deixa de criar títulos: passa a **devolver ao Jurídico** em revisão
- Etapa nova `conferido`, do Jurídico, é que leva a `ATIVO` e **cria os títulos**
- Ao voltar para revisão, a solicitação vai **em destaque no topo** — o mesmo mecanismo de
  prioridade que a Diretoria já usa, agora acionado por esta trilha
- O destaque é **retirado** quando o Jurídico conclui: destaque que não sai deixa de destacar

**Consequência assumida:** o Jurídico tem dois momentos de trabalho no mesmo contrato (minuta e
conferência). Foi o que o cliente pediu, e é o que separa "prometi assinar" de "está assinado".

---

## PI-19 · O rateio de apropriações pertence ao contrato, e trava quando os títulos nascem (20/08/2026)

Na Abertura de Contrato o rateio entre apropriações é **do contrato**, não da solicitação. É esse
rateio que decide em qual centro de custo cada parcela cai, e é dele que sai a divisão de cada
título na aprovação.

Enquanto o contrato não foi aprovado, o rateio pode ser corrigido — **com motivo**. Depois que os
títulos existem, ele deixa de poder mudar: o rateio dos títulos já foi gravado, e alterar a origem
sem alterar o destino faria contrato e título discordarem sem ninguém perceber.

**Efeito no sistema:**

- A tela da solicitação de contrato lê e edita `contrato_apropriacoes`, não `solicitacao_apropriacoes`
- Rota nova `PATCH /contratos/:id/apropriacoes`, com permissão `contratos.geral.editar` e escopo de
  obra (`requireContratoAccess`)
- Motivo obrigatório, gravado no histórico da solicitação com o rateio **antes e depois**
- Recusa: soma diferente de 100%, apropriação de outra obra, inativa, somadora ou repetida
- Recusa com 409 quando o contrato já está `ATIVO` ou `ENCERRADO`
- O card "Apropriações da solicitação" deixa de ser oferecido nessa tela — gravar nele criaria uma
  segunda lista que nada consome

**O que não muda:** `solicitacao_apropriacoes` continua valendo para a medição do fluxo antigo, onde
ela é a subdivisão *por solicitação* dentro da lista do contrato. As duas tabelas convivem; nenhuma
é cópia da outra.

Implementada em `MAPA-IMPACTO-APROPRIACOES-DO-CONTRATO.md`, provada em
`qa/medicao/23-apropriacoes-do-contrato.js`.

---

## PI-20 · Acima do limite, o contratado precisa estar identificado e a negociação anexada (20/08/2026)

Acima do limite do Jurídico o contrato vira minuta — e minuta precisa **identificar e localizar a
parte**. Por isso, antes de criar a solicitação, o sistema confere o cadastro de cada contratado (e
do favorecido, quando o pagamento vai a terceiro): **endereço completo e CPF/CNPJ válido**.

A conferência não só acusa: **corrige na hora**. Dos 2.454 fornecedores ativos, 26 têm endereço
completo — mandar a pessoa para a tela de Parceiros e de volta pararia praticamente toda abertura.

E a **negociação detalhada deixou de ser texto**: ela chega em documento (`.docx` ou `.pdf`), porque
é assim que circula. Sem o documento o contrato **não é aprovado**.

**Efeito no sistema:**

- Modal de conferência antes de criar, acima do limite. Abaixo dele, nada muda.
- Rota estreita `PATCH /contratos/credores/:id/cadastro`, que altera **somente** endereço e
  CPF/CNPJ. Quem abre contrato conserta o endereço sem ganhar acesso ao cadastro de parceiros.
- **Quem cria a solicitação corrige; a Gerência de Processos revisa** (ajuste de 20/08, depois do
  primeiro uso). A rota aceita `contratos.geral.criar` ou `solicitacoes.acoes.criar`, além da
  permissão própria `contratos.credor.completar_cadastro` — que segue existindo para conceder a quem
  não cria contrato. Toda alteração grava evento com o antes e o depois.
- **Todo credor cadastrado pelo botão da busca já nasce com endereço completo** — o campo era
  opcional e é essa lacuna que produziu 2.428 fornecedores sem endereço.
- CPF/CNPJ conferido por **dígito verificador**, não por tamanho: documento de fachada (`000...`) é
  acusado como inválido.
- Consulta de CNPJ em serviço externo, **desligada por padrão** e configurável por ambiente. Ela
  preenche o formulário; quem salva é a pessoa, e só onde estava vazio.
- O campo de texto sai da tela; a coluna fica no banco e o texto dos contratos antigos continua
  visível.
- `aprovarContrato` recusa acima do limite sem anexo `NEGOCIACAO_DETALHADA`. A cobrança fica na
  **aprovação** porque a criação é JSON e o arquivo sobe depois — é o ponto em que o compromisso se
  materializa, coerente com a PI-16.
- Upload do documento com perfil próprio (`.docx`/`.pdf`), e proteção nova contra **macro** e
  **objeto embutido** válida para todo Office Open XML do sistema.

**Consequência assumida:** no primeiro mês haverá atrito real na abertura de contratos acima do
limite, até a base de fornecedores ser completada. Foi a troca aceita para o Jurídico parar de
receber contrato sem endereço.

Implementada em `MAPA-IMPACTO-CADASTRO-CREDOR-E-ANEXO.md`, provada em
`qa/medicao/24-cadastro-credor-contrato.js` e `qa/medicao/25-anexo-negociacao.js`.

---

## Como registrar uma política nova

1. Numerar (`PI-n`), datar e escrever **a regra da empresa**, não a solução técnica
2. Anotar o **efeito no sistema** logo abaixo
3. Se contradisser dado real ou código existente, registrar o conflito **com o número medido**
4. Referenciar daqui o mapa de impacto que a implementa
