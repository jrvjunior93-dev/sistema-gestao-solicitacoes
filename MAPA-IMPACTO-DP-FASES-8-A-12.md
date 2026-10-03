# Fases 8 a 12 do DP — o que foi construído

Continuação de `MAPA-IMPACTO-DP-ADMISSAO-MOVIMENTACAO-DEMISSAO-PAGAMENTO.md`, que cobre o
levantamento e as decisões. Este documento registra **o que ficou pronto** e as decisões tomadas
durante a construção, em 27/08/2026.

---

## As três decisões do cliente que moldaram tudo

| Decisão | Escolha |
|---|---|
| Força do checklist | **Duas camadas**: obrigatória trava o **envio**; checklist marcado trava a **conclusão** |
| Tipos antigos do módulo principal (919 registros) | **Desativar** — o DP passa a ser a única porta |
| Onde "impedir o envio" acontece | **Criar o rascunho** — a obra abre, anexa e envia |
| Movimentações | **Botão principal**; troca de obra e alteração salarial viram subtipos |

---

## O estado RASCUNHO — por que ele precisou existir

O escopo pede, quatro vezes, que o sistema **impeça o envio** sem os documentos obrigatórios. Só que
o anexo precisa de um pedido **já gravado** para se pendurar — a obra não tinha como anexar antes de
abrir. Sem um momento anterior ao envio, "impedir o envio" não tinha onde acontecer.

O ciclo passou a ser:

```
RASCUNHO  --(a obra anexa)-->  ENVIAR  -->  ABERTA  -->  o DP decide
             |                    |
             |                    +-- trava se faltar documento OBRIGATÓRIO
             +-- só aqui o checklist pode ser alterado
```

**Rascunho aparece na lista de colaboradores.** A primeira versão o escondia — "é da obra, não ocupa
a fila do DP". Estava errado: essa lista existe para dizer "aqui tem coisa pendente", e um rascunho
esquecido é exatamente isso. Escondido, a obra acha que pediu, o DP nunca recebeu, e ninguém
descobre.

## As duas camadas de cobrança

| Camada | O que cobra | Quando | Exige |
|---|---|---|---|
| **Obrigatória** | a lista fixa do tipo/subtipo | no **envio** | anexo existir e não estar recusado |
| **Checklist marcado** | o que a obra prometeu | na **conclusão** | anexo **validado** pelo DP |

A assimetria é deliberada: no envio basta o anexo **existir**; na conclusão ele precisa estar
**atestado**. A obra entrega, o DP atesta. Cobrar validação no envio seria pedir que a obra fizesse o
DP trabalhar antes de mandar.

Isso preserva a decisão da Fase 3 (*"AVISA, NÃO TRAVA"*, porque o ASO costuma sair depois do
pedido): **não marcar** o ASO continua permitido. O que deixa de ser permitido é **marcar e não
entregar**.

## O motivo do desligamento é o subtipo

Não é economia de coluna. O escopo pede que *pedido de demissão* exija o pedido assinado e *término
de contrato* exija o documento de encerramento — **quem muda a exigência é o motivo**, não o tipo.
Modelado como subtipo, o checklist reage à escolha do usuário pela mesma regra genérica, sem `if`
escrito em código.

## Movimentações reaproveita o efeito, não o duplica

`efeitoDoPedido` traduz `MOVIMENTACAO/TRANSFERENCIA_OBRA` de volta para o efeito `TROCA_OBRA` e
`MOVIMENTACAO/ALTERACAO_SALARIAL` para `ALTERACAO_SALARIAL`. É o **único** lugar que sabe disso, e
`aplicarEfeito` compara contra ele — não contra `solicitacao.tipo`.

Assim os registros gravados com os tipos antigos continuam funcionando, e a aritmética de vigência
provada por 19 conferências na suíte 49 **não ganhou uma segunda versão para divergir depois**.

## O desconto por faltas não é cobrado duas vezes

O item 11 pede o "desconto por faltas" entre as informações geradas. Ele **aparece na
planilha-resumo, mas não é subtraído de novo**: o salário proporcional já é calculado sobre os dias
trabalhados, então o dia de falta já deixou de ser pago ali. Subtrair outra vez cobraria a falta em
dobro do colaborador.

O valor existe como **memória de cálculo** — a resposta a "quanto essas faltas custaram", que é o que
o conferente quer ver.

## Os quatro adicionais são colunas separadas

Insalubridade e periculosidade são percentuais de norma e **não se acumulam entre si**; o noturno
depende da hora; a bonificação é liberalidade da empresa. Somados num campo, a planilha-resumo
mostraria um número único que ninguém consegue contestar linha a linha.

---

## O que foi entregue

### Migrations (faixa V4, só estrutura)

| Migration | O que abre |
|---|---|
| `202608270051_rh_catalogo_cargos_e_documentos.js` | `rh_cargos`, `rh_documento_exigencias`, `rh_solicitacao_checklist`, `cargo_id`, `carga_horaria_semanal`, `subtipo` |
| `202608270052_rh_colaborador_cadastro_completo.js` | filiação, endereço, dados bancários, PIX, responsável pela contratação |
| `202608270054_rh_pagamento_adicionais_e_periodo.js` | os 4 adicionais, período trabalhado, data prevista, vínculo com o pedido |

> **A `...0054` nasceu como `...0053` e foi renumerada.** Colidiu com
> `202608270053_despesa_eventual.js`, de outro trabalho em andamento. Regra 6: quem chegou depois
> renomeia — o arquivo dela é de 14:23, o meu de 14:28. O `schema_migrations` foi atualizado junto.

### Scripts de dados (fora da cadeia, com `--conferir`)

| Script | Medido no local |
|---|---|
| `seedCargosDoRh.js` | 21 cargos, 137 colaboradores ligados |
| `seedCatalogoDeDocumentosDoDp.js` | 21 tipos de documento + 33 exigências |
| `migrarTrocaObraParaMovimentacao.js` | 4 registros reetiquetados |

### Serviços

- `rhChecklistService.js` — resolve "mais específico vence"
- `rhSolicitacaoService.js` — RASCUNHO, `enviarSolicitacao`, `marcarNoChecklist`,
  `pendenciasDeDocumento`, `apontamentosDoColaborador`, `efeitoDoPedido`, `diasDeAfastamento`
- `rhApuracaoService.js` — adicionais somados e memória de cálculo
- `rhJornadaFormularioService.js` — os quatro adicionais no formulário

### Rotas novas

```
GET  /rh/solicitacoes/checklist          o checklist do TIPO, antes de o pedido existir
POST /rh/solicitacoes/:id/enviar         RASCUNHO -> ABERTA
POST /rh/solicitacoes/:id/checklist      marcar a promessa
GET  /rh/cargos                          o catálogo
GET  /rh/colaboradores/:id/apontamentos  férias vencidas e pendências
```

### Tela

A dinâmica aprovada foi mantida: uma página, quatro abas, tudo em modal, Admissão acima da tabela.

**A coluna de ações passou de quatro ícones para três** — Movimentações, Demitir, Evento recorrente.
Transferência de obra e alteração salarial ficam dentro do modal de Movimentações.

O rótulo que variava ("Vincular a uma obra" para os 136 sem obra) **não se perdeu**: migrou para a
lista de subtipos do modal.

---

## O que a QA encontrou — e que eu não teria visto sozinho

| Achado | Onde |
|---|---|
| Uma substituição pegou a função errada: `efeitoDoPedido` referenciava variável de `validarPedido` | suíte 59 |
| Pagamento de mão de obra exigia colaborador — mas é da obra inteira | suíte 59 |
| `GROUP_CONCAT` vazio volta como a **string** `"NULL"`, que é truthy → `NaN` no SQL | suíte 50 |
| Rejeitar um rascunho falhava em silêncio e o deixava pendurado, bloqueando a próxima abertura | suíte 52 |
| Meu próprio `contar` media tipos de documento em vez de triplas | script de catálogo |
| Collation: tabela nova × `rh_colaboradores` (`utf8mb4_0900_ai_ci`) | script de cargos |

## Suítes atualizadas ao contrato novo

As suítes 50, 51, 52, 54 e 55 quebraram — todas pelo mesmo motivo: **abriam e decidiam direto**, sem
o envio. Foram atualizadas com o passo de envio, e as asserções que descreviam o sistema **anterior**
foram reescritas para descrever a **regra**, não o número:

- a conferência mudou de fonte (vínculo → exigências por tipo/subtipo);
- a pasta do colaborador passa a receber também os obrigatórios do envio — a prova deixou de fixar
  "só o RG" e passou a garantir que **todo documento na pasta veio de anexo VALIDADO**;
- a demissão **passou a ter** checklist; a asserção "não se aplica à demissão" descrevia o passado.

> Nenhuma asserção foi afrouxada para ficar verde. Onde o número mudou, a **regra** que ele
> protegia foi escrita no lugar dele.
