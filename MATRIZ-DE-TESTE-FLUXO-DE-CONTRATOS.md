# Matriz de teste — fluxo de contratos completo, com três usuários

Data: 24/08/2026. Para execução **manual**, pela tela.

Cobre o lote de 23/08 inteiro (fases 1 a 6, itens 31 e 33) com os papéis reais: **Obra**, **Gerência
de Processos**, **Jurídico** — e o **Financeiro**, que a execução mostrou ser necessário (§1.4).

> **Esta matriz já foi executada uma vez, inteira, no navegador** (24/08). Os 58 passos passaram, e a
> execução encontrou **quatro defeitos** que as 46 suítes automatizadas não pegavam — todos
> corrigidos. Ela também corrigiu a si mesma: cinco passos estavam escritos errado, e estão marcados
> com **✏️ corrigido em 24/08** onde isso aconteceu.
>
> Tudo aqui foi lido do código, não da memória. As permissões abaixo são exatamente as chaves que as
> rotas conferem.

---

## 1. Os papéis e as permissões de cada um

Concedidas na configuração de permissões por usuário. Lembre que `PERMISSOES_AREAS_USUARIOS` é
**versionada**: edite a configuração atual, **nunca** insira uma linha nova com um usuário só — a
linha de maior `id` passa a valer para todo mundo e apaga a configuração dos demais.

### 1.1 OBRA — quem abre o contrato e pede a medição

| Permissão | Para quê |
|---|---|
| `solicitacoes.acoes.criar` | abrir a solicitação (é por ela que o contrato nasce) e pedir medição |
| `solicitacoes.lista.visualizar_setor` | enxergar a fila do próprio setor |
| `contratos.geral.visualizar` | abrir o detalhe do contrato |
| `solicitacoes.acoes.ver_aba_financeiro` | ✏️ **acrescentada em 24/08** — ver as parcelas e medições do contrato, e alcançar o botão de **solicitar termo aditivo** |

> **A permissão financeira surpreende, e é obrigatória.** O card com as parcelas, as medições e o
> saldo do contrato vive dentro do card **Financeiro** da solicitação, protegido por
> `solicitacoes.acoes.ver_aba_financeiro`. Sem ela a Obra **não vê nada disso** — e o Caminho D fica
> inexecutável. Ver §12, que registra o acoplamento e o que fazer a respeito.

**Também precisa:** estar vinculado à obra (`usuarios_obras`). Sem isso a criação é recusada por
escopo de obra, antes de qualquer permissão.

**NÃO precisa de:** `contratos.geral.criar`, `contratos.fluxo.reenviar`,
`contratos.credor.completar_cadastro`. Isso é de propósito e está testado:

- **reenviar** o contrato devolvido e **confirmar a assinatura** funcionam por ele ser o **autor**;
- **corrigir o cadastro do credor** (endereço, CPF/CNPJ) na conferência funciona por ele **criar
  solicitação** — decisão de 20/08, porque exigir permissão própria travava o fluxo no primeiro uso;
- **anexar a negociação detalhada** do contrato dele funciona sem permissão de contrato.

### 1.2 GERÊNCIA DE PROCESSOS (setor `GEO`) — quem aprova

| Permissão | Para quê |
|---|---|
| `solicitacoes.lista.visualizar_setor` | ver a fila da GEO |
| `contratos.geral.visualizar` | abrir o detalhe |
| `contratos.aprovacao.aprovar` | **aprovar** o contrato, **rejeitar na etapa de aprovação**, **aprovar/rejeitar termo aditivo** e **aprovar a medição** |
| `contratos.solicitacao.cancelar` | **cancelar** o contrato e **cancelar** o pedido de aditivo |
| `contratos.geral.encerrar` | **encerrar** o contrato (elimina a sobra do saldo) |
| `contratos.medicao.editar_valor` | **editar** valor e vencimento de uma medição já criada |
| `contratos.fluxo.reenviar` | reenviar / confirmar assinatura de contrato que **ela não abriu** |
| `solicitacoes.acoes.ver_aba_financeiro` | ✏️ **acrescentada em 24/08** — sem ela a Gerência **não consegue aprovar a medição**: o botão fica dentro do card Financeiro |

> `contratos.fluxo.reenviar` é a permissão nova do **item 31**. Sem ela, só o autor reenvia — e um
> contrato cujo autor esteja de férias fica parado. **Conceda a este usuário**, senão o passo B.5 não
> fica verde.
>
> `solicitacoes.acoes.ver_aba_financeiro` foi descoberta na execução: sem ela o passo **C.7** — a
> aprovação da medição, que o item 25 define como ato da Gerência — simplesmente não tem botão.

### 1.3 JURÍDICO (setor `JURIDICO`) — quem faz a minuta

| Permissão | Para quê |
|---|---|
| `solicitacoes.lista.visualizar_setor` | ver a fila do Jurídico |
| `contratos.geral.visualizar` | abrir o detalhe |
| `contratos.juridico.tramitar` | **enviar a minuta**, **conferir o assinado** e **rejeitar na etapa do Jurídico** |

**NÃO precisa de** `contratos.aprovacao.aprovar`: rejeitar segue a **etapa**, não uma chave fixa.
Quem aprova devolve na aprovação; quem tramita no Jurídico devolve no Jurídico.

### 1.4 FINANCEIRO — o quarto papel ✏️ **acrescentado em 24/08**

A primeira versão desta matriz supunha que três papéis bastavam. **Não bastam.** Cinco passos exigem
alguém do Financeiro:

| Permissão | Para quê |
|---|---|
| acesso ao módulo Financeiro (baixa de títulos) | passos **C.10, C.11 e C.12** — pagar a menos, estornar e pagar a mais |
| `financeiro.relatorios.financeiro_obras` | passos **E.5 e E.6** — o relatório Financeiro de Obras e os arquivos da linha |

Sem esse papel, esses cinco passos **não são executáveis pela tela**. Na execução de 24/08 o efeito
das baixas foi exercitado pelo serviço, e o relatório foi aberto com o SUPERADMIN.

### 1.5 Quem configura (pode ser o SUPERADMIN)

| Permissão | Para quê |
|---|---|
| `configuracoes.geral.visualizar` e `configuracoes.geral.gerenciar` | **Configurações → Contratos: Alerta e Formas** (itens 21 e 9) e o limite do Jurídico |

---

## 2. Antes de começar

| # | Conferir | Onde |
|---|---|---|
| 0.1 | Os **quatro** papéis existem, no setor certo, e a OBRA está vinculada à obra de teste | Configurações → Usuários |
| 0.2 | As permissões acima estão concedidas **na mesma versão** da configuração | Configurações → Permissões |
| 0.3 | O limite do Jurídico está conhecido (padrão R$ 50 mil) — a matriz usa **R$ 40 mil** para "abaixo" e **R$ 60 mil** para "acima" | Configurações |
| 0.4 | Há forma de pagamento ativa e categoria financeira disponível | Financeiro |

> **Cuidado com o cache de permissões:** depois de alterar permissões, o servidor leva até ~30
> segundos para refletir. Se um botão não aparecer, espere meio minuto e recarregue antes de
> considerar o teste vermelho.

---

## 3. Caminho A — contrato ABAIXO do limite (R$ 40 mil)

O caminho curto: não passa pelo Jurídico.

| # | Quem | Ação | ✅ Verde quando |
|---|---|---|---|
| A.1 | **Obra** | Nova Solicitação → tipo de contrato. Preencher **Título**, objeto, justificativa, responsável, obra, **valor R$ 40.000** e **setor destino = GEO** | O campo **Subtipo não existe** (item 1). O **valor aparece antes** da apropriação (item 2). Não há tabela de "Contratados e Favorecidos" (itens 3+4) |
| A.2 | **Obra** | Definir as parcelas **manualmente**: mudar o valor de uma, travá-la, acrescentar outra | A parcela travada **não muda** quando outra é editada; a soma fecha no total (item 6) |
| A.3 | **Obra** | Tentar criar **sem** anexar a negociação detalhada | **Recusado**, mesmo abaixo do limite (item 7) |
| A.4 | **Obra** | Anexar a negociação e criar | Criado, status **AGUARDANDO APROVAÇÃO**, **sem** título financeiro ainda |
| A.5 | **Obra** | Abrir o detalhe | Cabeçalho com **Contrato + Objeto na 1ª linha**; **sem** ladrilho "Status" e **sem** "Apropriação" (itens 10, 13, 16). A **justificativa aparece no histórico**, não como campo (item 18) |
| A.6 | **Obra** | Olhar a barra de ações | **Não** oferece Aprovar, Rejeitar nem Cancelar |
| A.7 | **Gerência** | Abrir o mesmo contrato | **Oferece** Aprovar, Rejeitar e Cancelar (item 31) |
| A.8 | **Jurídico** | Tentar abrir o mesmo contrato | ✏️ **corrigido em 24/08** — ele **nem consegue abrir**: é redirecionado para a lista. A solicitação está na GEO e nunca passou pelo Jurídico, e a regra de visibilidade é mais forte que a de botão |
| A.9 | **Gerência** | Aprovar, escolhendo a categoria financeira | Contrato **ATIVO**, **títulos criados**, e a solicitação **sai da GEO e vai para o setor da OBRA** (item 24) |
| A.10 | **Obra** | Ver a solicitação na própria fila | Aparece — a mudança de setor não a fez sumir |

---

## 4. Caminho B — contrato ACIMA do limite (R$ 60 mil), com devolução

| # | Quem | Ação | ✅ Verde quando |
|---|---|---|---|
| B.1 | **Obra** | Criar contrato de **R$ 60.000**, com negociação anexada | Ao criar, abre a **conferência do cadastro do credor** |
| B.2 | **Obra** | Corrigir endereço/CPF-CNPJ do credor ali mesmo | Aceito **sem** permissão extra, e a conferência passa a dizer **"Cadastro completo"**. ✏️ **corrigido em 24/08:** este modal **não** pede nome fantasia nem representante legal — a rota é estreita de propósito, só mexe em endereço e CPF/CNPJ, para não virar a rota de cadastro de parceiros. Fantasia e representante são exigidos ao **cadastrar credor novo** |
| B.3 | **Gerência** | Aprovar | Vai para **EM ANÁLISE JURÍDICA**; a solicitação vai para o **Jurídico** |
| B.4 | **Jurídico** | Rejeitar, com motivo | Contrato **REJEITADO**; a solicitação volta para o **setor de quem criou** (item 30), e o motivo aparece |
| B.5 | **Gerência** | Abrir o contrato devolvido | Vê **"solicitar revisão"** — por ter `contratos.fluxo.reenviar`, não por poder criar contrato |
| B.6 | **Obra** | Abrir o mesmo contrato | **Também** vê "solicitar revisão" — por ser a **autora** |
| B.7 | **Obra** | Reenviar | Volta para **EM ANÁLISE JURÍDICA** (a etapa de quem devolveu, não o início da fila), e a solicitação volta para a **fila do Jurídico** |
| B.8 | **Jurídico** | Enviar a minuta (arquivo **ou** link) | Aceito; contrato em **AGUARDANDO ASSINATURA**; a solicitação vai para o **setor de quem criou** — quem colhe a assinatura é o autor. ✏️ **corrigido em 24/08:** até então ela ia para a fila de aprovação, onde ninguém tinha o que fazer com ela |
| B.9 | **Obra** | Ver a barra de ações | Vê **"confirmar assinatura"**; **não** vê "enviar minuta" |
| B.10 | **Obra** | Anexar o assinado e confirmar | Volta ao **Jurídico**, em destaque no topo da lista |
| B.11 | **Jurídico** | Conferir o assinado | Contrato **ATIVO**, **títulos criados**, solicitação para o setor de quem criou |

---

## 5. Caminho C — medição, pagamento e o valor que volta

Use o contrato do **caminho A** (ATIVO, 4 parcelas de R$ 10.000 se preferir arredondar).

| # | Quem | Ação | ✅ Verde quando |
|---|---|---|---|
| C.1 | **Obra** | Pedir medição da parcela 1 | **Não** pede Valor, Descrição nem Vencimento próprios; o **período está dentro do card** |
| C.2 | **Obra** | Tentar enviar sem os dados de pagamento | Recusa **um a um**: favorecido, chave PIX, forma de pagamento, aceite (item 5) |
| C.3 | **Obra** | Marcar o aceite e depois **mudar o contato** | O **aceite cai sozinho** — confirmar e alterar depois não vale |
| C.4 | **Obra** | Completar e enviar | Medição criada; a solicitação fica em **NEC. DE MEDIÇÃO** |
| C.5 | **Obra** | Tentar medir a **mesma** parcela de novo | **Bloqueada**, dizendo em qual medição ela já foi |
| C.6 | **Obra** | Tentar medir **acima do saldo** | **Recusado**, apontando o **termo aditivo** |
| C.7 | **Gerência** | Abrir a medição e **aprovar** | Solicitação vai para **LIBERADO** e segue ao **Financeiro** (item 25) |
| C.8 | **Obra** | Tentar aprovar a medição | **403** — não é dela |
| C.9 | **Gerência** | Aprovar a mesma medição de novo | **409** — já aprovada |
| C.10 | **Financeiro** ⚠️ | Baixar o título pagando **menos** que a parcela | A parcela passa a valer **o pago**; a diferença vai para a **última parcela**; o título fica "Parcialmente pago" **sem saldo cobrável** (item 33) |
| C.11 | **Financeiro** ⚠️ | **Estornar** a baixa | Tudo **volta ao que era** — parcelas e valor medido |
| C.12 | **Financeiro** ⚠️ | Baixar pagando **mais** que a parcela | A parcela cresce e a **última é descontada** |
| C.13 | **Obra** | Olhar o card de títulos | **Saldo do contrato colorido** conforme o nível (item 21). Para ver os três níveis, meça mais parcelas e recarregue: o saldo cai e a cor acompanha |

> ⚠️ **C.10 a C.12 exigem o papel do Financeiro** (§1.4) — a baixa é uma tela de outro módulo, e
> nenhum dos três papéis do contrato a alcança.

---

## 6. Caminho D — termo aditivo (item 26)

| # | Quem | Ação | ✅ Verde quando |
|---|---|---|---|
| D.1 | **Obra** | ✏️ **corrigido em 24/08** — o botão **"Solicitar termo aditivo" NÃO fica no detalhe**: ele está na **Nova Solicitação**, no fluxo de medição, depois de escolher o contrato (é o desenho da PI-15). Pedir aditivo de **VALOR**, com justificativa | Criado como **PENDENTE**, e passa a **aparecer no card "Termos aditivos"** do detalhe |
| D.2 | **Obra** | Ver o card | **Não** oferece Aprovar, Rejeitar nem Cancelar |
| D.3 | **Gerência** | Ver o card | Oferece os **três** botões |
| D.4 | **Gerência** | **Rejeitar** sem motivo | Recusado — o motivo é obrigatório |
| D.5 | **Gerência** | Rejeitar com motivo | Status **REJEITADO**, motivo visível, e **evento no histórico** |
| D.6 | **Obra** | Pedir outro aditivo | Novo pendente |
| D.7 | **Gerência** | **Cancelar** esse pedido | Status **CANCELADO** — distinto de rejeitado, com evento próprio |
| D.8 | **Gerência** | Pedir e **aprovar** um aditivo de valor | Valor entra no contrato **e vira parcela**; o teto de 25% é respeitado |
| D.9 | **Gerência** | Tentar aditivo que passe dos **25%** | O modal mostra *"Limite de 25%"* e *"Disponível"*, avisa que o valor passa do limite e **desabilita o botão** — nem chega a enviar |

---

## 7. Caminho E — comentário, anexo e arquivos no relatório

| # | Quem | Ação | ✅ Verde quando |
|---|---|---|---|
| E.1 | **Obra** | Abrir o detalhe | O card **"Novo comentário" está ACIMA do Histórico**, e o botão de anexar está **dentro dele** (item 19) |
| E.2 | **Obra** | Comentar **sem** anexo | Entra no histórico |
| E.3 | **Obra** | Anexar **sem** texto | Aceito — anexar sozinho continua possível |
| E.4 | **Obra** | Comentar **com** anexo | Os dois entram, num ato só |
| E.5 | **Financeiro** ⚠️ | Relatório **Financeiro de Obras** (`/financeiro/relatorios/financeiro-obras` ✏️), clicar na linha do pagamento | Abre os **arquivos daquele título** — anexos e comprovantes (item 22) |
| E.6 | **Financeiro** ⚠️ | Clicar numa linha de título **importado/manual** | Diz *"Este titulo nao veio de uma solicitacao..."* — não abre janela vazia |

> ⚠️ **E.5 e E.6 exigem `financeiro.relatorios.financeiro_obras`** (§1.4).

---

## 8. Caminho F — configuração (itens 21 e 9)

| # | Quem | Ação | ✅ Verde quando |
|---|---|---|---|
| F.1 | **Configurador** | Configurações → **Contratos: Alerta e Formas** | A página abre |
| F.2 | | Gravar **Saudável = 10%** e **Normal = 40%** | **Recusado** — a faixa seria impossível |
| F.3 | | Gravar percentual **acima de 100** | Recusado |
| F.4 | | Gravar cortes válidos e mudar as cores | Aceito; o **saldo do contrato muda de cor** conforme a faixa |
| F.5 | | Desmarcar formas de pagamento e salvar | Só as marcadas aparecem na **medição** |
| F.6 | | Marcar **todas** e salvar | Volta ao padrão "todas" — inclusive as que forem cadastradas depois |

---

## 9. Caminho G — encerramento e sobra

| # | Quem | Ação | ✅ Verde quando |
|---|---|---|---|
| G.1 | **Obra** | Medir a **última** parcela por **menos** que o previsto | Aceito; a sobra vira **saldo do contrato**, e o histórico diz quanto não foi usado |
| G.2 | **Gerência** | **Encerrar** o contrato | Saldo **zerado**; a sobra deixa de existir |
| G.3 | **Obra** | Tentar encerrar | **403** — falta `contratos.geral.encerrar` |

---

## 10. O que reprovar como vermelho de verdade

Nem toda recusa é defeito. **É defeito quando:**

- um botão aparece para quem **não** deveria (o inverso do item 31);
- a solicitação **some da fila** de alguém depois de trocar de setor;
- o valor total do contrato **muda sozinho** — a soma das parcelas tem de fechar sempre, exceto pela
  sobra declarada da última parcela;
- a mesma informação aparece **em dois lugares com valores diferentes**;
- algum passo dá **erro 500** (os erros esperados são 400, 403 e 409, sempre com mensagem que
  explica o caminho).

**Não é defeito:**

- botão ausente por falta de permissão — confira a tabela da seção 1 antes;
- botão ausente logo após alterar permissão — é o cache de ~30s;
- título importado do histórico sem arquivos vinculados.

---

## 11. Se algo ficar vermelho

Anote **quem** (papel), **qual passo**, **o que apareceu na tela** e **o que você esperava**. A
suíte automatizada correspondente está indicada em `LEIA-PRIMEIRO.md`, e reproduzir o passo nela é o
caminho mais rápido para separar defeito de configuração.

---

## 12. O acoplamento com a permissão financeira

**Três ações do fluxo de contrato só existem atrás de `solicitacoes.acoes.ver_aba_financeiro`:**

| Ação | Quem deveria fazer | O que a esconde |
|---|---|---|
| Aprovar a medição | Gerência de Processos (item 25) | o botão vive no modal da medição, aberto do card Financeiro |
| Solicitar termo aditivo | quem vê a necessidade na obra (PI-15) | o botão está na tela de medição, no mesmo card |
| Ver parcelas, medições e saldo do contrato | Obra e Gerência | o card inteiro |

Isso **não é defeito**: o card sempre viveu ali, e a permissão faz o que promete. É um **descompasso**
entre o fluxo que o lote descreve — *"a Obra pede, a Gerência de Processos aprova"* — e o lugar onde
os botões moram.

**Como está resolvido nesta matriz:** as duas permissões foram acrescentadas às listas de Obra e
Gerência (§1.1 e §1.2), e com elas tudo funciona. **Foi assim que a execução de 24/08 ficou verde.**

**A decisão que fica em aberto:** conceder acesso à aba financeira a esses dois papéis significa que
eles passam a ver títulos e valores baixados. Se isso não for desejável, a alternativa é tirar esses
três blocos de trás da permissão financeira — o que é uma alteração de tela, com mapa próprio.

---

## 13. O que a execução de 24/08 encontrou

Os quatro defeitos abaixo passaram por **46 suítes automatizadas** sem serem vistos, e caíram na
primeira execução manual. O motivo é um só, e vale registrar:

> **As suítes chamam os serviços com dados que eu montei; a tela chama com o que o sistema realmente
> produz.**

| # | Defeito | Por que a suíte não via |
|---|---|---|
| 1 | `historicos.setor` gravado como `"[object Object]"` — 23 registros | as suítes passam `setor` como **string**; a tela passa `req.user`, onde é **objeto** |
| 2 | O mesmo, reaparecendo no `STATUS_ALTERADO` | a primeira correção seguiu `usuario.setor` e não viu o objeto sendo passado **adiante como parâmetro** |
| 3 | Ladrilho **"Subtipo"** vazio no cabeçalho do fluxo novo | nenhuma prova olhava um ladrilho que não deveria existir |
| 4 | Mensagem de erro **antiga** presa na tela de configuração | essa tela foi construída e **nunca aberta no navegador** — a suíte testou o serviço |

Todos corrigidos. Os de dados vieram com script próprio (`backend/scripts/dados/`), nunca migration.

**E a matriz corrigiu a si mesma:** cinco passos estavam escritos errado (A.8, B.2, B.8, D.1, E.5) e
um papel inteiro faltava (§1.4). Estão marcados com ✏️.

---

## 14. Se você repetir esta matriz

Os usuários usados na execução de 24/08 continuam no banco local:

| Papel | E-mail | Senha |
|---|---|---|
| Obra | `matriz-obra@teste.local` | `<SENHA_QA_LOCAL>` |
| Gerência de Processos | `matriz-gp@teste.local` | `<SENHA_QA_LOCAL>` |
| Jurídico | `matriz-juridico@teste.local` | `<SENHA_QA_LOCAL>` |

São **de teste, do ambiente local**, e podem ser apagados a qualquer momento. Nenhum usuário real
teve as permissões alteradas.

E fica o aviso que a própria execução ensinou: **teste manual deixa rastro.** A configuração de
alerta gravada no Caminho F ficou no banco e reprovou a suíte 47 na bateria seguinte. Ao terminar,
desfaça o que você gravou — ou rode a bateria e leia o que ela acusar.
