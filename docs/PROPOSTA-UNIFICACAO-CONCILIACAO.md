# PROPOSTA SEPARADA — unificação do fluxo de conciliação

> **Isto é uma PROPOSTA, não um plano aprovado, e não faz parte de leva
> nenhuma.** Decisão do cliente (D1 do Financeiro, 03/09): nenhuma
> unificação de fluxo durante a reforma visual. O padrão é aplicado como a
> tela está; a unificação fica registrada aqui para ser decidida por si só.

## Por que existe este documento

A `FinanceiroConciliacao` tem **3.341 linhas** e é a maior tela do sistema.
Durante o levantamento do Financeiro eu descrevi a conciliação como "3
telas, 6.130 linhas". **Estava errado**: é uma tela só, e o número veio de
leitura equivocada do levantamento anterior. O cliente corrigiu, e o número
correto é o de cima.

O que segue verdadeiro é o motivo da proposta: a tela concentra passos que
o usuário percorre em sequência — importar extrato, casar lançamento,
tratar divergência, fechar — dentro de um arquivo só, com o estado dos
quatro passos misturado.

## O que a unificação seria

Separar os passos em etapas nomeadas, com estado próprio e retorno
explícito entre elas, em vez de uma tela que muda de comportamento conforme
flags internas. O ganho não é estético: é poder dizer, a qualquer momento,
**em que passo o usuário está e o que falta** — hoje isso está implícito.

## O alerta de conflito: registrado, NÃO construído

Ao ler a tela apareceu uma pergunta legítima: duas pessoas conciliando o
mesmo extrato ao mesmo tempo não têm nenhum sinal disso. A primeira ideia
foi acrescentar um aviso de conflito.

**Decisão do cliente (Opção A, 03/09): registrar aqui e não construir
agora.** Duas razões, e a segunda é a que pesa:

1. Está **fora do escopo de reforma visual**. Detecção de concorrência é
   comportamento de servidor, não de layout.
2. **Meia solução é pior que nenhuma.** Um aviso que só cobre parte dos
   casos — os que o frontend consegue perceber — ensina o usuário a confiar
   nele. A partir daí, ausência de aviso passa a ser lida como "ninguém
   mais está mexendo", que é exatamente o que o aviso NÃO garante. O
   usuário fica pior do que estava sabendo que não sabe.

Para valer, a detecção precisa nascer no servidor, cobrindo todos os
caminhos que alteram a conciliação — inclusive os que não passam por esta
tela. Isso é trabalho de backend, com decisão de produto sobre o que
acontece no conflito: bloquear, avisar e deixar seguir, ou mesclar.

## Estado

**Aguardando decisão do cliente.** Nenhuma linha desta proposta foi
implementada. A leva do Financeiro aplica o padrão na tela como ela é.
