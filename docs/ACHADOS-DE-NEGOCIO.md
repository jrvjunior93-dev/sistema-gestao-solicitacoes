# ACHADOS DE NEGÓCIO — para quem decide, não para quem programa

**Origem:** leva do Financeiro (fatias 1 a 4), fechada em 04/09/2026.
**Status de todos:** encontrados, verificados no código, **não corrigidos**.

Este documento existe porque a leva de layout encontrou coisas que **não são
layout**. Corrigi-las muda o que o sistema faz — quanto dinheiro sai, qual
número aparece numa decisão, o que fica gravado no banco. Isso não é decisão
de quem está reformando a tela.

Cada achado abaixo traz: **o que acontece**, **o que custa** e **a decisão
que falta**. Nenhum foi tocado. O que a leva fez, quando fez algo, está
marcado como *mitigação* — e mitigação não é conserto.

---

## COMPORTAMENTOS CONFIRMADOS — NÃO SÃO DEFEITOS

*Itens que pareciam falha à primeira vista, mas foram levados ao responsável
pela operação, checados e confirmados como comportamento **correto e
proposital**. Cada um traz a data da confirmação e por quem. Não corrigir —
se alguém achar que é bug no futuro, a resposta está registrada aqui.*

### N40. A alçada do Jurídico usa o valor original do contrato; o cabeçalho da tela mostra o total com aditivos

**Confirmado pelo cliente em 05/09/2026, decisão registrada do responsável
pela operação: não é defeito, é regra do negócio.** A alçada — o critério que
decide se o contrato precisa passar pelo Jurídico — considera o **valor
original** do contrato. O cabeçalho da tela mostra o **total com aditivos**.
Os dois números serem diferentes, num contrato que já recebeu aditivo, **é o
esperado**. Ninguém deve "corrigir" isso para os dois números baterem.

Quando um contrato é aprovado, o sistema escolhe entre dois caminhos:

- **abaixo do limite do Jurídico** → o contrato vira ATIVO e os títulos
  financeiros são criados na hora;
- **acima do limite** → o contrato vai para o Jurídico e **nenhum título é
  criado** até a conferência.

O cabeçalho da tela mostra `valor_total + valor_aditivos` (o total com
aditivos). O código que decide o caminho compara **apenas `valor_total`** (o
valor original, sem aditivos) com o limite — por definição da alçada, não por
falta de somar uma linha.

**Por que os dois números diferentes não indicam erro.** Quem aprova vê, no
cabeçalho, o total com aditivos. Se esse total está acima do limite mas o
valor original está abaixo, o contrato segue pelo caminho de baixo (ATIVO,
títulos criados na hora) mesmo com o cabeçalho mostrando um número maior que
o limite. Isso é a regra funcionando como definida — quem não conhece a regra
é que pode, ao olhar os dois números, achar que o sistema errou.

**O que já foi feito:** a confirmação de aprovação, em tela, já declara os
dois desfechos possíveis (abaixo e acima do limite), porque a tela não
indica antecipadamente em qual ramo o contrato vai cair.

**O que falta — não é urgente, é melhoria de clareza:** deixar explícito, na
própria tela, que o número do cabeçalho é o total com aditivos e que a
alçada usa o valor original. Hoje essa distinção só está escrita neste
documento. Proposta de tela em `docs/PENDENCIAS-REGISTRADAS.md`, seção
"Deixar visível que a alçada usa o valor original do contrato (N40)".

**Onde conferir no código — mantido para quem for mexer em qualquer um dos
dois pontos entender o porquê antes de alterar:**

- Alçada (valor original): `backend/src/services/contratoFluxoNovoService.js`,
  variável `acimaDoLimite`, por volta da linha 1513 —
  `paraCentavos(contrato.valor_total) > limiteCent`.
- Cabeçalho (total com aditivos):
  `frontend/src/pages/SolicitacaoDetalhe/AcoesContrato.jsx`, variável
  `valorComAditivos`, linha 197 — `Number(contrato.valor_total) +
  Number(contrato.valor_aditivos || 0)` —, exibida no cabeçalho do card na
  linha 553.

**Isto não é um item para a lista de correções.** Os dois números têm
propósitos diferentes por definição de negócio, confirmada pelo cliente. Só
a apresentação em tela está em aberto, e está tratada como proposta, não como
defeito.

---

## PARTE 1 — DINHEIRO QUE SAI

### N1. Uma falha de internet muda o caminho de envio de um lote de pagamento, sem avisar

**O que acontece.** Antes de enviar pagamentos, a tela pergunta ao Banco do
Brasil se o serviço está de pé. Se essa pergunta **falha por rede**, o
sistema não avisa: ele assume que o provedor real está desligado. A pastilha
passa a dizer **"MOCK"**, o botão vira "Enviar mock", e o envio vai para
**outro endereço** — o de teste.

**O que custa.** O operador lê "MOCK" e acredita que está testando. Nem ele
nem a trilha de auditoria registram que aquilo foi um erro de rede, não um
estado do sistema. Um lote que ele pensou ter enviado de verdade não foi; ou
um lote de teste que ele pensou ser teste foi para o lugar errado.

**A decisão que falta.** Quando a consulta de saúde falha, o sistema deve:
(a) bloquear o envio até saber; (b) avisar em tela que não conseguiu
verificar e perguntar; ou (c) manter o comportamento atual. Hoje é (c), por
omissão — ninguém escolheu.

> Onde: `frontend/src/pages/FinanceiroPagamentos.jsx`, ~365 e ~393.

### N2. A chave que separa "sai dinheiro de verdade" de "não sai" tem nome invertido

**O que acontece.** A variável chamada `isBbSandbox` — que qualquer leitor
entende como "está em ambiente de teste" — é verdadeira **quando o provedor
REAL está habilitado**. Ela governa o rótulo, o botão de envio e a
habilitação do "Sincronizar BB".

**O que custa.** Nada, enquanto ninguém mexer. Tudo, no dia em que alguém
mexer confiando no nome. É a fronteira entre sair e não sair dinheiro.

**A decisão que falta.** Renomear toca 12 pontos numa tela de dinheiro, e
qualquer erro na troca é caro. É trabalho que precisa ser agendado com teste
dedicado — não emendado numa leva de layout.

### N3. Três ações que movimentam caixa não pedem confirmação sobre o valor

| Ação | O que ela faz | Barreira hoje |
|---|---|---|
| **Enviar ao BB** | o dinheiro sai | só o campo de MFA |
| **Confirmar baixa** | grava movimento financeiro | nenhuma |
| **Gerar boletos em lote** | emite em série | nenhuma |

**O que custa.** O campo de MFA é preenchimento de campo, **não
consentimento sobre um valor**: no momento do clique o operador não vê o
código do lote, nem a quantidade de itens, nem o total. Ele autoriza que é
ele — não autoriza *aquele valor*. "Confirmar baixa" grava num clique e
desfazer exige estorno. "Gerar boletos em lote" não declara que, se for
interrompido no meio, **o que já foi gerado fica gerado**.

**A decisão que falta.** Acrescentar um passo que mostre lote, quantidade e
total antes do envio é decisão de negócio: atrasa o operador em troca de uma
barreira real. É seu chamado, não da reforma.

### N4. Justificativa em confirmação de caixa: obrigatória ou não?

**O que acontece.** Em três das quatro confirmações de caixa, a justificativa
segue **opcional**. A leva manteve assim de propósito: o campo antigo aceitava
vazio e, quando vazio, o sistema gravava um texto padrão. Passar a exigir
mudaria o que chega ao servidor.

**A decisão que falta.** Numa tela que movimenta caixa, a resposta
provavelmente é "sim, obrigatória" — mas essa mudança altera o registro
histórico e precisa da sua palavra.

---

## PARTE 2 — NÚMEROS QUE MENTEM EM TELA DE DECISÃO

Esta é a família mais cara da leva, porque o defeito **não aparece**. O
número está lá, bem formatado, com o rótulo certo. Só está errado.

### N5. Totais que somam só a página, em seis telas

O padrão: a tela pede ao servidor um pedaço da lista (as primeiras 200, as
500 mais antigas), soma **o que veio** e apresenta como **total do recorte**.

| Tela | O que a manchete diz | O que ela na verdade soma |
|---|---|---|
| Resumo de baixas | Valor base, Valor quitação, Estornadas | as primeiras **200** baixas |
| Intercompany | total entre empresas | só a página aberta |
| Endividamento | dívida total | só a página — **subestima** |
| Analítico | total do período | as **500** mais antigas |
| Executivo do Grupo | consolidado do grupo | herda os dois acima |
| *(mais duas fora do serviço de relatórios)* | — | mesmo padrão |

**O que custa.** Um recorte com 260 baixas mostra um "Valor quitação"
silenciosamente **menor que o real**. O CSV exportado carrega o mesmo teto —
ou seja, o número errado sai do sistema e vira anexo de e-mail. No
Endividamento, subestimar a dívida numa tela executiva é o pior sentido
possível do erro.

**O que a leva fez.** Qualificou os rótulos com "do recorte", para que o
número pare de se anunciar como total. **Isso é mitigação, não conserto:**
um número marcado como parcial continua sendo o número que a pessoa vai usar.

**A decisão que falta.** O conserto é paginação no servidor — o total
calculado onde estão todos os dados, não onde está a página. É trabalho de
backend, com custo real, e precisa entrar em algum lugar do plano.

> Onde: `backend/src/services/relatorioFinanceiroService.js` (quatro
> ocorrências independentes) e `FinanceiroBaixas.jsx`.

---

## PARTE 3 — O UPLOAD DE COMPROVANTES INVENTA DADO

Quatro achados no mesmo lugar: `ComprovanteController.uploadMassa`, rota
`POST /comprovantes/upload-massa`. São os mais graves do documento, porque
gravam informação falsa no banco sem ninguém digitar nada.

### N6. O valor do comprovante é inventado a partir do nome do arquivo

O sistema pega **o primeiro número que aparecer no nome do arquivo** e grava
como valor monetário do comprovante.

| Nome do arquivo | **Valor gravado** |
|---|---|
| `SOL-12.pdf` — *o exemplo que a própria tela ensina* | **12** |
| `SOL-000123.pdf` | **000123** |
| `comprovante 1.234,56 SOL-45.pdf` | **1.23** |
| `NF 8899 OBRA-A1.pdf` | **8899** |

Duas coisas ao mesmo tempo:

1. **A convenção que a tela ensina fabrica dinheiro.** Quem seguir a
   instrução `SOL-12.pdf` grava um comprovante de valor 12 que ninguém
   digitou.
2. **Quando o valor está mesmo no nome, ele sai errado.** `1.234,56` vira
   `1.23` — erro de três ordens de grandeza, **para menos**.

Esse campo alimenta a conferência de comprovantes.

**Recomendação.** Não inferir valor de nome de arquivo. **Um valor inventado
é pior que valor ausente: ausente se vê, inventado se confere.**

### N7. "Upload realizado com sucesso" para dois desfechos diferentes

Arquivo com o código da solicitação no nome → fica **vinculado**. Arquivo sem
→ fica **pendente**, esperando alguém vincular à mão. Os dois recebiam a
mesma frase de sucesso.

**Mitigado no front** nesta leva: a tela agora conta antes do envio quantos
arquivos não têm o código, e depois diz quantos ficaram pendentes. Mitigação,
não conserto — quem sabe o desfecho de cada arquivo é o servidor, e a
resposta dele continua não dizendo.

### N8. Falha no meio do lote grava metade e responde erro total

Se o sétimo de dez arquivos falhar, os seis primeiros **já estão gravados** e
a resposta é "erro no upload". A pessoa reenvia os dez — e não há nenhuma
trava contra repetição, então **os seis primeiros duplicam**.

Combinado com N6: cada duplicata carrega o mesmo valor inventado.

### N9. `OBRA-3` no nome do arquivo pode vincular à obra errada

Não achando obra pelo código, o sistema procura pelo **número interno** da
tabela. Um arquivo chamado `OBRA-3 comprovante.pdf`, numa base onde não
exista obra de código "3", é vinculado à obra **cujo registro é o número 3**
— que pode ser qualquer uma.

Convenção de nome de arquivo alcançando a chave primária do banco.

---

## PARTE 4 — REGRA DESENHADA QUE NUNCA ENTROU EM OPERAÇÃO

### N10. "Setores sem alteração de status": existe tela, existe arquivo no servidor, não existe rota

**O que acontece.** Alguém desenhou uma regra: marcar setores que **não
exibem** o botão "Alterar status" no detalhe da solicitação. A tela foi
escrita (`SetoresSemAlteracaoStatus.jsx`) e o arquivo de serviço existe no
backend (`services/solicitacao/setoresSemAlteracaoStatus.js`).

**O que falta.** Não há rota no servidor, não há chamada no front, e nenhum
dos dois arquivos tem consumidor. **A regra nunca funcionou.** A tela foi
removida na limpeza de 04/09 porque não funcionaria se alguém chegasse nela;
o arquivo do servidor continua lá, sem uso.

**A decisão que falta.** Ou a regra é necessária — e aí falta terminar o
trabalho (rota, chamada, tela) — ou não é, e o arquivo do servidor sai. Hoje
ela ocupa espaço fingindo existir.

---

## PARTE 5 — COMPRAS: O CAMINHO MAIS CARO TEM O CONTROLE MAIS FRACO

*Achados de 05/09, do levantamento do módulo de Compras. Nada aqui foi
alterado — são decisões suas.*

### N11. A justificativa que vai para a auditoria é digitada numa caixa do navegador

No encerramento de uma cotação, duas justificativas **obrigatórias** são
pedidas: a de comprar acima da quantidade solicitada e a de fechamento
parcial. As duas são gravadas no registro de auditoria. As duas são digitadas
numa caixinha do Chrome — sem validação, sem tamanho mínimo, sem rastro de
quem escreveu o quê antes de confirmar.

Na mesma tela existe um caso **menos** crítico — encerrar sem gerar pedido —
que tem tela própria, exige justificativa de pelo menos 10 caracteres e pede
uma marcação de ciência.

O controle mais forte está no caminho mais barato. O caminho que decide
dinheiro tem o mais fraco.

**A decidir:** as duas justificativas passam a ter a mesma exigência do
"encerrar sem pedido"?

### N12. Exclusão em lote apaga metade e diz que não apagou nada

Em três cadastros de Compras (categorias, unidades e apropriações), a exclusão
em lote apaga um registro de cada vez. Se o terceiro de dez falhar, **os dois
primeiros já foram apagados** — e a mensagem que aparece é "Erro ao excluir",
que afirma que nada aconteceu.

A pessoa autorizou dez, aconteceram dois, e o sistema informou zero.

O mesmo vale para a importação em massa, que anuncia sucesso com o número de
linhas **pedidas**, não gravadas.

**Corrigido nesta leva**: o aviso passa a dizer quantos foram e quantos
falharam. Fica registrado porque houve um período em que o número exibido não
correspondia ao que aconteceu.

### N13. Três cadastros compartilhados sem controle de acesso no cliente

Categorias e unidades de compra não têm nenhuma checagem de permissão na
tela. Apropriações usa a checagem de superadministrador apenas para **esconder
um bloco da tela** — salvar e excluir não são barrados por ela.

Apropriações, pelo próprio subtítulo da tela, é usada por solicitações,
financeiro **e** compras. Duas telas vizinhas do mesmo módulo (fornecedores e
delegação) barram de verdade.

**Não medi** se o backend revalida. Se revalidar, o risco é de experiência
(a pessoa tenta e leva erro); se não revalidar, é de controle.

### N14. Um relatório de diretoria ordena pelo oposto do que promete

O relatório de economia em cotações tem o subtítulo "Cotações com maior
impacto financeiro" e ordena por **sobrepreço**. Uma cotação que economizou
R$ 500 mil fica atrás de qualquer uma com um centavo de sobrepreço.

Ele também corta a lista nos 8 primeiros sem dizer em lugar nenhum que
cortou — enquanto dois relatórios vizinhos declaram "Top 10" e "Top 100".

**Ajustado nesta leva pelo rótulo**, que é o caminho que não muda o número
que a diretoria já lê. Se a intenção original era ordenar por impacto
absoluto, é inverter — e aí o número muda.

### N15. Barra de gráfico que desenha o zero

Em cinco relatórios de Compras a barra tem largura mínima cravada. Economia
de zero desenha uma barra verde visível. Quem lê o gráfico de relance vê
resultado onde não houve nenhum.

**Corrigido nesta leva.**

### N16. Dois nomes para o mesmo estado, e uma tela que esqueceu de se defender

Solicitações de compra usam `CANCELADO` e `CANCELADA` (e `RECUSADO`/
`RECUSADA`) para o mesmo estado. Cinco arquivos se defendem aceitando as duas
formas. A listagem principal **não** se defende — e por isso pinta cancelada
e recusada com a mesma cor de "estado desconhecido". Quem opera a fila não
distingue "morreu" de "não sei".

O dado não fecha na origem; o front remenda em cinco lugares e esquece no
sexto.

**A decidir:** o certo é padronizar no banco, não no front. Fica registrado.

### N17. Quatro estados existem, são pintados, e não podem ser filtrados

A listagem de solicitações de compra oferece 5 opções de filtro por situação,
mas o sistema reconhece pelo menos 9 estados — entre eles
`AGUARDANDO_DIRETORIA`, que é justamente o que mais se quer filtrar. Uma
solicitação parada ali aparece na lista e não pode ser isolada.

### N18. A conferência antes de gravar é um clique, não uma leitura

Na revisão de solicitação de compra, o sistema exige que a pessoa "visualize
o PDF" antes de confirmar. O código marca o PDF como visualizado **no mesmo
instante em que o abre** — abrir e fechar satisfaz a exigência.

Não é inversão de lógica: é um controle que promete conferência e mede
clique.

## PARTE 6 — CRM

### N19. Lead arquivado desaparece, e o filtro "Arquivado" nunca devolve nada

Toda listagem de leads exclui os arquivados na consulta ao banco.
Consequências: o filtro por situação **"Arquivado"** devolve sempre zero — é
uma opção morta em duas telas — e o botão "Arquivar" que se esconde para
leads já arquivados é código que nunca roda.

**A decidir:** ou existe uma visão de arquivados, ou a opção sai do filtro.

### N20. Dois cadastros paralelos do mesmo número de telefone

A tela de canais guarda quatro papéis de telefone (principal, operacional,
rastreio, destino) como **texto livre dentro do canal**. A tela de números
guarda os mesmos quatro papéis como **registro próprio**, com risco, provedor
e capacidades. Nada liga os dois: um número pode existir num e não no outro,
ou divergir, sem que nenhuma tela acuse.

### N21. O formulário de automação nasce com uma condição de exemplo que é gravável

O campo de condições da regra de automação vem preenchido com um exemplo. Não
é texto de placeholder — é valor de verdade. Quem preencher nome e gatilho e
salvar sem tocar no campo cria uma **regra ativa** cuja condição testa um
campo que não existe. Não há validação do formato antes de enviar.

### N22. "Executar ciclo" dispara sobre leads reais sem perguntar nada

O botão de executar o ciclo de automações age imediatamente, e as ações
possíveis incluem redistribuir e arquivar lead. Não há confirmação — e não
havia antes. **Não alterei**, porque acrescentar seria mudar comportamento
fora de reorganização.

### N23. O verify token do Meta volta do servidor e aparece em campo de texto comum

Das quatro credenciais da tela de integrações, três nunca voltam do servidor
(o campo fica vazio e o sistema só informa "configurado"). A quarta volta em
claro e é exibida num campo de texto normal.

**Nenhum valor foi copiado para arquivo, log ou documento.** O conserto é de
contrato de API, não de layout: ou ela passa a seguir o mesmo padrão das
outras três, ou no mínimo vira campo de senha.

### N24. "Vencida" é calculado de dois jeitos na mesma tela

Na lista de tarefas do CRM, a coluna marca vencida pelo relógio do navegador;
o filtro "apenas vencidas" é decidido no servidor. Fuso ou relógio fora de
hora fazem os dois discordarem na mesma tela.

### N25. Números da diretoria e da operação com o mesmo nome e janelas diferentes

O relatório executivo do CRM usa janela de 24h e primeiro contato de 60min
**cravados no código**; o painel de SLA deixa a pessoa ajustar os mesmos
parâmetros. Diretoria e operação podem ler números diferentes com o mesmo
nome.

### N26. Página 2 era inalcançável na lista de leads

A tela contava o total de leads no cabeçalho, carregava 50 e não tinha como
avançar — o restante existia e ninguém abria. **Corrigido nesta leva** (é
defeito, não capacidade nova: o total já prometia registros que a tela não
entregava).

E, na mesma tela, dois indicadores da faixa ("convertidos" e "quentes")
contavam **só a página**, lado a lado com um "total" que vinha do servidor.
Três números na mesma faixa, dois medindo outra coisa. Agora dizem "nesta
página".

### N27. "Minha carteira" podia listar a base inteira

Enquanto o usuário ainda não estava resolvido, o filtro por responsável saía
vazio, o servidor não aplicava recorte nenhum e a tela mostrava os leads de
todo mundo como se fossem da pessoa. **Corrigido nesta leva.**

## PARTE 7 — FISCAL, PROVISIONAMENTO E GOVERNANÇA

*Achados de 05/09. Nada aqui foi alterado, salvo onde escrito.*

### N28. O módulo de provisionamento não deixa mudar o status de uma provisão

O serviço expõe cinco transições (enviar para análise, aprovar, cancelar,
realizar, reabrir). O backend tem os cinco status. O detalhe trava a edição
quando a provisão está cancelada ou realizada. O relatório tem um bloco
"Pipeline por status".

**E nenhuma tela permite mover uma provisão de status.** Na prática, o status
só muda por fora do sistema.

É a decisão mais visível do módulo. Não implementei — seria capacidade nova.

### N29. "Já existe" era pintado de verde no lote contábil fiscal

Quando o lote do período já existia, o backend respondia que **nada foi
criado** — e a tela mostrava essa resposta na mesma faixa verde do lote
recém-gerado, com o texto "Lote contábil fiscal processado". Quem lia
acreditava ter gerado o rascunho do período. **Corrigido.**

### N30. Gerar o ZIP do lote contábil fechava o período sem perguntar nada

Um clique mudava o status do lote, gravava o arquivo no armazenamento fiscal e
registrava evento de segurança — e o backend recusa gerar de novo um lote já
enviado ou cancelado. Era o passo que fecha o período contábil, disparado sem
confirmação. **Corrigido**, com o número do lote e a contagem na pergunta.

### N31. O mesmo documento fiscal pode entrar em dois lotes contábeis vivos

O sistema só recusa lote duplicado quando o existente não está cancelado.
Cancelar um lote e gerar outro do mesmo período cria um segundo lote com os
mesmos documentos — eles não são marcados como já exportados.

E o lote congela a contagem e o valor no momento da criação: documento validado
depois não entra, e nada na tela avisa.

### N32. O relatório baixado podia ser a mensagem de erro

Na governança, a exportação não conferia se a resposta deu certo. Um erro do
servidor tem corpo, e esse corpo era salvo como `governanca-auditoria.csv`. A
pessoa recebia um "relatório" que era a mensagem de erro, sem nenhum sinal de
falha. **Corrigido.**

### N33. Escolher um usuário no filtro de auditoria impede trocar de usuário

As opções do filtro são consultadas com o próprio recorte aplicado. Escolhido
um usuário, a dimensão "Usuário" passa a listar só ele — não dá para trocar
pela faixa, só limpando. Defeito antigo, mais visível agora que o filtro tem
etiquetas.

### N34. Gerar snapshot da governança é gravação institucional, e não perguntava nada

A fotografia dos indicadores entra no histórico que todos leem, e o botão ficava
ao lado do "Atualizar", que só recarrega a tela — dois vizinhos com
consequências de ordens de grandeza diferentes. **Confirmação adicionada.**

### N35. Remover um comentário não deixa rastro no histórico

A linha do tempo da solicitação filtra três tipos de evento, entre eles
`COMENTARIO_REMOVIDO`. O evento é gravado e não é mostrado. É decisão de
auditoria — preservei o comportamento.

### N36. Uma tela de divergências fiscais anuncia a própria impotência

O texto de apoio diz que ela "ainda não altera pedidos, recebimentos ou
financeiro". É leitura pura para um dado que existe para gerar ação. Vale
decidir se ela ganha ação ou sai do menu.

### N37. Dez campos de ID digitáveis ao lado de uma busca que preenche sozinha

No vínculo manual de documento fiscal, a pessoa digita identificadores à mão
enquanto a busca logo acima já preenche o campo certo. Digitar um ID que está
numa tabela ao lado é convite a erro silencioso. **Não removi nenhum campo.**

### N38. Uma troca de página da auditoria dispara cinco consultas

Resumo, indicadores, opções e usuários são recalculados a cada página, sem
depender dela. Desperdício puro; o conserto não cabia numa reorganização.

## PARTE 8 — UMA CAPACIDADE QUE SAIU SEM SUA PALAVRA

### N39. O painel de "quais filtros aparecem" foi removido do provisionamento

Na listagem de provisionamentos existia um painel que deixava a pessoa escolher
quais dos 8 campos de filtro ficavam visíveis. Ele foi **removido** na migração,
com o argumento de que existia para administrar espaço numa grade de 8 campos e
que a marcação nova é compacta.

**O argumento é razoável e a regra é clara: capacidade não sai sem a sua
palavra.** Registro como remoção a confirmar, não como fato consumado. Se
quiser de volta, é reverter uma parte da tela.

Vale dizer o que o painel escondia: ele ocultava o **campo** sem limpar o
**valor**. Desmarcar "Credor" com um credor digitado deixava a lista filtrada
por um critério que não estava mais em lugar nenhum da tela — filtro ativo
invisível. Esse defeito, sim, sumiu com a migração: agora todo filtro ativo é
etiqueta visível e removível.

## PARTE 9 — APROVAÇÃO DE CONTRATO E BAIXA DE TÍTULOS

### N41. A tela nunca diz qual dos dois caminhos vai acontecer

Os textos de ajuda da mesma tela se contradizem — um diz "ao aprovar, as
previsões viram títulos"; o outro diz "é na conferência que as previsões viram
títulos, **não antes**".

Fui ao código: **as duas são verdadeiras**, em ramos diferentes. Mas a tela
nunca informa em qual ramo aquele contrato vai cair.

A confirmação que acrescentei declara **os dois** desfechos, em vez de escolher
um e arriscar afirmar o errado. O conserto certo é o backend devolver o limite
(ou um "vai criar títulos: sim/não") para a mensagem poder afirmar uma coisa só.

### N42. A baixa de títulos é aplicada um a um e não desfaz nada

Se falhar no segundo de três, o primeiro **fica baixado**. Isso não era dito em
lugar nenhum. **A confirmação agora avisa antes.**

E a pergunta anterior era "Confirmar baixa de 3 título(s)?" — um número, sem
valor, sem conta bancária, sem data e sem forma de pagamento. A pessoa
autorizava "3 títulos" e o sistema baixava dezenas de milhares de reais numa
conta que ela não viu. **Corrigido**: a pergunta agora nomeia total em
dinheiro, conta, data e forma.

### N43. O resumo de pagamentos somava tudo e a lista mostrava quatro

Numa solicitação com 8 títulos, o resumo dizia "Valor total R$ 80.000" sobre
uma lista de 4 cartões somando R$ 40.000, sem nada indicando o corte.
**Corrigido** — a lista passou a mostrar o conjunto.

E o mesmo resumo trocava de fonte em silêncio: com títulos, somava os títulos;
sem títulos — ou quando a consulta **falhava** — mostrava campos da própria
solicitação, com o mesmo rótulo. **Corrigido**: o rótulo declara a origem, e a
falha virou condição visível.

### N44. "Ver pagamentos" só aparecia com mais de dois pagamentos

Quem tinha exatamente dois nunca soube que existia uma lista completa, e nada
dizia que os dois exibidos eram um recorte. **Corrigido.**

## PARTE 10 — FILTROS QUE ESCONDEM SEM DIZER

### N45. "Nenhum status marcado" não significa "todos" na lista de pedidos

Sem filtro de status, o serviço aplica silenciosamente `status ≠ CANCELADO`. A
pessoa lê "todos" e vê "todos menos cancelados" — e só enxerga um pedido
cancelado se marcar **Cancelado** explicitamente.

Se a intenção é essa, ela precisa estar escrita na tela. Hoje não está em
lugar nenhum.

### N46. A delegação de compras some com cartões sem avisar

Compras cujos pedidos ativos estão todos fechados são omitidas da lista
(exceto em fechamento parcial), e a contagem de "Abertas" já vem descontada.
O cartão desaparece sem nenhum sinal de que desapareceu **por isso**.

### N47. "Usuário #12" onde deveria estar um nome

Na delegação, quando o responsável anterior saiu do setor de Compras e o
registro não traz o nome, a tela exibe `Usuario #12`. É o contrário do que o
histórico da mesma tela faz, que grava nome. O conserto é no backend.

### N48. A auditoria era desenhada com fonte de 9px

A folha de estilo do módulo de auditoria tinha 23 declarações de fonte abaixo
do piso de 12px — a menor com 9px — e o alternador de visão com botões de
30px, abaixo do mínimo de clique. **Corrigido**, subindo tudo para os degraus
do sistema.

O critério vigente desde 02/09 é seu: entre "cabe mais" e "lê-se melhor",
vence a leitura. Aplicar isso muda o arranjo da tela, e é o esperado.

### N49. Existe um caminho para gravar o número do pedido, com trilha de auditoria montada, e nenhuma tela o alcança

**O que acontece hoje.** Existe um formulário de um campo só — "Número do
pedido", com o botão "Gravar número" — pronto e funcionando, que grava esse
número na solicitação. **Nenhuma tela do sistema exibe esse formulário**: ele
existe e não é usado por ninguém.

**Efeito prático.** O caminho no servidor existe, é validado e é **auditado**
— cada gravação registraria quem mudou o número do pedido e quando. O campo é
lido na busca e na ordenação da lista de solicitações, ou seja, **o dado é
usado pelo sistema**. Mas não há nenhuma tela em que alguém possa escrevê-lo.
Alguém montou o caminho inteiro, com registro de auditoria, e a porta de
entrada nunca foi ligada.

**Onde está no código.** `frontend/src/pages/SolicitacaoDetalhe/Pedido.jsx`
(108 linhas, sem nenhum outro arquivo apontando para ele) e a rota
`PATCH /solicitacoes/:id/pedido` no servidor — `backend/src/routes.js`, linha
1565, com o evento de auditoria `SOLICITACAO_PEDIDO_UPDATED`.

**O que decidir.** Ligar o formulário numa tela (o detalhe da solicitação é o
lugar natural), ou remover as duas pontas? **Decisão do cliente em 05/09:**
fica como está, sem rota e sem remoção, registrado para o responsável decidir
se quer ligar.

## RESUMO PARA DECIDIR

| # | Achado | Classe | Urgência |
|---|---|---|---|
| N6 | Valor de comprovante inventado do nome do arquivo | dado falso gravado | **alta** |
| N9 | `OBRA-n` vincula pelo número interno | dado falso gravado | **alta** |
| N8 | Lote parcial + reenvio duplica registros | dado duplicado | **alta** |
| N1 | Falha de rede rebaixa envio para MOCK em silêncio | dinheiro | **alta** |
| N5 | Totais que somam só a página em 6 telas | decisão sobre número errado | **alta** |
| N3 | Ações de caixa sem confirmação de valor | consentimento | média |
| N2 | `isBbSandbox` com nome invertido | risco futuro | média |
| N7 | Mesma mensagem para vinculado e pendente | informação | média |
| N4 | Justificativa opcional em confirmação de caixa | registro histórico | baixa |
| N10 | Regra de setor sem rota, sem consumidor | trabalho pela metade | baixa |

**As três primeiras têm a mesma natureza e por isso vêm juntas no topo:** o
sistema grava no banco algo que ninguém digitou. Erro de tela a pessoa vê;
dado inventado ela confere, acredita e usa.

---

## PARTE 11 — SST: O QUE APARECEU QUANDO AS TELAS VOLTARAM (05/09)

As 12 telas do SST passaram a refatoração inteira redirecionando, por causa
de um modo simplificado ligado por padrão. Ninguém as abriu. Quando o
cliente mandou desligar o modo e elas voltaram ao menu, foram abertas uma a
uma pela primeira vez — e é daí que vêm os achados abaixo.

### N50. "Compliance" é calculado de DOIS jeitos, e as duas telas ficam a um clique uma da outra

**O que acontece.** O painel do SST mostra **"Compliance score: 0%"**. O
relatório executivo do SST, um clique adiante, mostra **"Compliance geral:
75% — CONTROLADO"**. Mesma base, mesmo dia, mesma palavra.

**Por quê.** São duas fórmulas diferentes com o mesmo nome:

- O painel usa `backend/src/modules/sst/compliance/sstComplianceEngine.js`,
  linha 288: desconta **2 pontos por pendência crítica** sobre uma base que
  soma colaboradores + ASOs + treinamentos + EPIs + documentos + exposições.
  Com 99 colaboradores e 99 pendências críticas, o desconto (198) passa da
  base (99), o resultado fica negativo e o `Math.max(0, …)` o transforma em
  **0%**.
- O relatório executivo usa
  `backend/src/modules/sst/analytics/sstExecutiveAnalyticsService.js`, linha
  180: a **média dos scores por colaborador**, e cada colaborador vale
  `100 − 25 por pendência crítica` = 75. Média: **75%**.

**Efeito prático.** Um número de conformidade que muda de 0% para 75%
conforme a tela que a pessoa abriu. Quem olha o painel conclui que o SST
está em colapso; quem olha o relatório conclui que está controlado. As duas
telas se dizem a mesma coisa.

**O que decidir.** Qual das duas fórmulas é a alçada de conformidade do SST?
A escolhida vira a única, e a outra sai ou muda de nome — "média de score
por colaborador" e "índice de conformidade da base" são coisas diferentes e
podem coexistir, desde que não se chamem igual.

**É da mesma família do N25**, já registrado: número de diretoria e número de
operação com o mesmo nome e janelas diferentes.

### N51. A tela do eSocial mostra `SENHA_AUSENTE` no lugar de uma frase

**O que acontece.** No painel do eSocial do SST, o indicador do certificado
digital exibe literalmente **`SENHA_AUSENTE`** e **`ESOCIAL_CERT_…`** —
códigos internos do sistema, em letra maiúscula com sublinhado, no lugar de
uma frase em português.

**Efeito prático.** Quem opera não sabe o que fazer. "Senha ausente" é uma
informação acionável — falta cadastrar a senha do certificado A1 — mas
`SENHA_AUSENTE` parece defeito do sistema, e a pessoa liga para o suporte em
vez de resolver.

**Onde está.** Painel do eSocial em `/sst/esocial`, indicador "Certificado
A1".

**O que decidir.** Traduzir os códigos de estado do certificado para frases,
e decidir o que a tela deve dizer em cada um. É a mesma família do N47
("Usuário #12" onde deveria estar um nome).

### Uma suspeita minha que a medição DERRUBOU, registrada para não voltar

Ao abrir as telas, o número **99** aparecia repetido em indicadores
diferentes — "colaboradores avaliados 99", "pendências 99", "pendências
críticas 99" — e eu levantei a hipótese de que fosse um **limite de consulta
virando número na tela**, o que faria o painel mentir para quem decide.

**Não é.** Conferido no código: os limites de consulta são 1.000, não 99
(`sstExecutiveAnalyticsService.js:63` e `:116`). O 99 é o número real de
colaboradores ativos na base do preview, e os três indicadores coincidem
porque cada colaborador tem exatamente uma pendência crítica.

Fica registrado porque a suspeita era razoável e a resposta é verificável —
se alguém a levantar de novo, o caminho já está andado.

### N53. [RESOLVIDO em 06/09] A mesma consulta devolve resultados diferentes em máquinas diferentes, e a tela não avisa

> **FECHADO por decisão do cliente em 06/09.** A caixa "Salvar filtro neste
> navegador" foi **removida** e o último filtro consultado passou para o banco,
> por usuário, como todo o resto da leva de preferências. Palavras dele:
> *"não é escolha que o usuário precise fazer: ele espera que a configuração
> dele acompanhe"*.
>
> O que o conserto reconhece, e que o achado original já dizia: o defeito não
> era só onde a preferência morava — era **transformar um defeito em pergunta
> ao usuário**. O rótulo dizia "neste navegador", mas quem marca aquela caixa
> espera o contrário, que a configuração o acompanhe. Perguntar não corrigia
> nada; só transferia a culpa.
>
> Onde: tipo `geral` do `PreferenciasContext` (o backend já o tinha no conjunto
> fechado, com teto de 32KB, sem dono no frontend). A migração é automática — o
> espelho local ficou na chave antiga, então quem já tinha filtro guardado
> naquela máquina o encontra na primeira abertura, e a partir dali ele viaja.
> Commit `4c09a29`.
>
> Efeito colateral medido, e era o outro motivo do cliente: sem a caixa, o
> cabeçalho da consulta fecha em **quatro linhas** em 1366px — era ela que
> custava a quinta.


> **Classificado CRÍTICO por decisão do cliente em 05/09.** O argumento é dele e
> eu assino: usuário obtendo resultado diferente da mesma consulta, em máquinas
> diferentes, não é inconveniência de interface — é número errado chegando a
> quem decide, sem nada na tela que denuncie.

**O que acontece.** Duas telas de consulta guardam **no navegador** quais filtros
aparecem. Essa preferência não é cosmética: ela **muda o conjunto de registros
que a consulta devolve**. O mesmo usuário, com os mesmos filtros preenchidos,
vê listas diferentes conforme a máquina em que abriu — e nenhuma das duas telas
diz isso.

**São dois mecanismos opostos, e os dois erram:**

**1. Consulta de títulos — o filtro escondido NÃO é enviado.**
`frontend/src/pages/FinanceiroTitulos.jsx:522` define `pickVisibleFilters`, e ela
recorta o que vai para o servidor nas linhas **1108**, **1472** e **1567**. Um
filtro que o usuário escondeu deixa de restringir a consulta.

*Efeito:* alguém esconde "Obra" no desktop do escritório para desafogar a faixa.
A consulta passa a trazer **todas as obras**. No notebook, onde o filtro continua
visível e preenchido, traz **uma obra**. Mesma pergunta, dois totais — e o de
cima é maior, que é a direção que engana.

**2. Solicitações — o filtro escondido CONTINUA restringindo.**
`frontend/src/pages/Solicitacoes/Filtros.jsx:150` (`alternarFiltroVisivel`) só
mexe na lista do que aparece; o **valor permanece aplicado**. E a chave dessa
preferência — `solicitacoes:filtros-visiveis` (`:113`, `:134`) — **não tem o id
do usuário**, então numa estação compartilhada a escolha de um vale para o
próximo que sentar ali.

*Efeito:* a lista está recortada por um filtro que **não está na tela**. A pessoa
vê "12 solicitações" e conclui que são todas. Não há como descobrir olhando.

**O que separa isso de um defeito de layout.** A preferência de exibição virou
**parâmetro de consulta**. São coisas de naturezas diferentes: o que aparece na
tela é gosto do usuário; o que entra na pergunta ao servidor é regra do negócio.
Enquanto as duas moram no mesmo lugar, mudar a aparência muda o número.

**Não é pela URL.** Vale registrar porque a suspeita inicial foi essa: a
preferência **não** viaja no endereço. Se viajasse, ao menos dois usuários com o
mesmo link veriam o mesmo resultado. Ela mora no `localStorage` de cada
navegador, que é justamente o que torna o resultado dependente da máquina e
impossível de reproduzir por quem recebe o número.

**Onde está no código.**
- `frontend/src/pages/FinanceiroTitulos.jsx:522` (`pickVisibleFilters`), aplicada em `:1108`, `:1472`, `:1567`; preferência gravada em `:2052-2056`.
- `frontend/src/pages/Solicitacoes/Filtros.jsx:150` (esconder não limpa), chave sem usuário em `:113` e `:134`.
- A terceira tela com o mesmo seletor, `ProvisionamentosFinanceiros.jsx:172-179`, **faz o certo**: esconder limpa o valor. Serve de modelo para as outras duas.

**O que decidir.** Duas saídas, e a escolha é do responsável:
(a) **esconder sempre limpa o valor** — o filtro invisível nunca restringe nada
(é o que a tela de Provisionamentos já faz); ou
(b) **filtro com valor aplicado nunca pode ser escondido** — some da lista de
escondíveis enquanto estiver preenchido.
As duas resolvem. A (a) é mais simples; a (b) preserva o recorte de quem o
montou de propósito. **O que não pode continuar é a terceira situação de hoje:
esconder muda o resultado em silêncio, e cada máquina responde uma coisa.**

### N52. [CRÍTICO] O mapa de risco é desenhado a partir de quatro tabelas que ninguém alimenta — e ignora o risco que está na mesma resposta

> **Classificado CRÍTICO por decisão do cliente em 05/09**, pelo argumento
> que segue: **silêncio falso é pior que alarme falso, porque ninguém
> investiga um mapa limpo.** Alarme falso é olhado e descartado; ausência
> de alarme não é olhada por ninguém. Em segurança do trabalho, o custo do
> segundo é a decisão que não foi tomada.

**O que acontece.** A tela "Mapa de risco operacional" (`/sst/relatorios/heatmap`)
abre vazia. Não há um quadrado no mapa.

**O que a API respondeu, medido no preview em 05/09.** `GET /api/sst/heatmap`
devolve **200**, e no mesmo documento:

- `heatmap` = **lista vazia** — é o que a tela desenha;
- `scores` = **110 registros** de conformidade, cada um com pendências
  críticas contadas;
- e o painel do SST, na mesma base e no mesmo minuto, informa
  `pendencias_criticas = 99` sobre `total_colaboradores_ativos = 99`.

**Por quê.** `gerarHeatmapSst`
(`backend/src/modules/sst/analytics/sstExecutiveAnalyticsService.js`, linha
109) monta o mapa **exclusivamente** a partir de quatro tabelas gravadas:
`SstPendenciaOperacional`, `SstBloqueioOperacional`, `SstAcidente` e
`SstRisco`. As quatro estão vazias nesta base — ninguém as alimenta.

As 99 pendências críticas que o sistema conhece **não estão nessas tabelas**:
são **derivadas** dos dados de RH (99 colaboradores ativos, nenhum com ASO
cadastrado — `/api/sst/aso` devolve `rows: 0`). O mapa não as vê porque não
olha para lá. E os 110 `scores`, que viajam na mesma resposta e já trazem a
criticidade por escopo, **não são plotados**: a função devolve os dois, e a
tela desenha só o primeiro.

**Não é consulta quebrada nem base sem registro — é fonte errada.** Este é o
ponto que separa este achado dos outros dois estados possíveis:

| | o que seria | é isto? |
|---|---|---|
| Consulta quebrada | 4xx/5xx, ou erro no servidor | **Não.** 200, roda limpo. |
| Base sem registro | nada de risco em lugar nenhum | **Não.** 110 scores e 99 pendências críticas na mesma resposta. |
| Fonte errada | a consulta lê a tabela que ninguém preenche, e a que tem o dado fica de fora | **Sim.** |

**Não é uma tela, são três** — medidas, uma a uma, no preview:

| tela | rota | o mapa | o que vem junto na mesma resposta |
|---|---|---|---|
| Mapa de risco | `/sst/relatorios/heatmap` | vazio | 110 fichas de conformidade |
| Centro operacional | `/sst/relatorios/centro-operacional` | vazio | 110 fichas + 99 pendências críticas |
| Relatório executivo | `/sst/relatorios/executivo` | vazio | 99 pendências críticas e `compliance_geral: 75` |

A "inteligência operacional" que aparece nos dados **não é uma quarta tela**:
é um segundo endpoint que a tela do centro operacional chama junto com o
primeiro. Contá-la separado inflaria o achado, e ele não precisa disso.

**Efeito prático.** Um diretor abre uma tela chamada "Mapa de risco
operacional" e vê o mapa limpo. A leitura natural é "nenhuma obra em risco".
O sistema, no mesmo instante, sabe que **99 de 99 colaboradores ativos estão
sem ASO** — o que é justamente uma pendência crítica de segurança do
trabalho, e das que geram autuação. **Mapa vazio não é ausência de risco: é
ausência de medição, e as duas se parecem exatamente.**

É o mesmo defeito do N50, pela outra ponta: lá o mesmo nome recebia dois
números, aqui o número existe e não chega à tela que foi feita para mostrá-lo.

**Quem decide.** Duas saídas possíveis, e a escolha é do responsável pelo
SST, não minha: (a) alimentar as quatro tabelas operacionais, e o mapa passa
a funcionar como foi desenhado; ou (b) o mapa passar a somar também as
pendências derivadas de RH, e mostrar hoje as 99. A opção (b) muda o que o
mapa significa — por isso não a apliquei.

**Ao lado, o que NÃO é achado: o PGR.** A tela `/sst/pgr` também abre vazia,
e essa é base sem registro de verdade — medido no mesmo minuto:
`ambientes`, `riscos`, `agentes`, `aso`, `ltcat` e `pgr` devolvem todos
**200 com `rows: 0` e `total: 0`**. Nada a corrigir: falta cadastrar.

