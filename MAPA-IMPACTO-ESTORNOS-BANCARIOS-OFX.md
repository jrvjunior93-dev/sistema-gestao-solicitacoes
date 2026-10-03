# Mapa de impacto — estornos bancários no OFX

Origem: commit `6e620310 feat: alerta e trata estornos bancarios no OFX`, de `C:\Fluxy`, 27/08/2026.
Escrito **antes** da primeira linha de código, conforme a regra do projeto.

---

## O que a mudança faz

Hoje um crédito de **PIX rejeitado** ou **cheque devolvido** entra no OFX como qualquer outra
entrada e pode ser conciliado como se fosse um recebimento novo. O título que foi pago com aquele
dinheiro continua quitado, mesmo o banco tendo devolvido o pagamento.

A mudança faz o sistema **reconhecer o texto do banco**, marcar o lançamento com o alerta
`ESTORNO_ALERTA`, **tirá-lo de todos os caminhos automáticos** e exigir que uma pessoa com a
permissão `financeiro.conciliacao.estornar` escolha qual saída original está sendo devolvida. Só aí
o sistema estorna a baixa, reabre o saldo do título e cria um movimento `ESTORNO_BANCARIO` ligado ao
movimento original.

A detecção **nunca** confirma sozinha. Ela só levanta a mão.

---

## Arquivos tocados — divergência medida antes de aplicar

Comparei cada arquivo do V4 contra a versão do **commit pai** em `C:\Fluxy`. Isso diz onde o patch
entra limpo e onde precisa de mão.

| Arquivo | Estado | Como aplicar |
|---|---|---|
| `backend/migrations/202608270001_conciliacao_estornos_bancarios.js` | novo | copiar |
| `backend/src/services/conciliacaoEstornoBancarioService.js` | novo | copiar |
| `docs/modulos/financeiro/ESTORNOS_BANCARIOS_OFX.md` | novo | copiar |
| `backend/src/services/conciliacaoBancariaService.js` | **idêntico** | patch direto (+386) |
| `backend/src/controllers/ConciliacaoBancariaController.js` | **idêntico** | patch direto |
| `backend/src/models/ConciliacaoBancaria.js` | **idêntico** | patch direto |
| `backend/src/validators/financialValidators.js` | **idêntico** | patch direto |
| `backend/scripts/validarConciliacaoMatchesExatos.js` | **idêntico** | patch direto |
| `frontend/src/pages/FinanceiroConciliacao.jsx` | **idêntico** | patch direto |
| `frontend/src/pages/FinanceiroRelatorios.jsx` | **idêntico** | patch direto |
| `backend/src/routes.js` | diverge 4.613 linhas | **inserção manual**, 2 linhas |
| `backend/src/services/relatorioFinanceiroService.js` | diverge 4 linhas | inserção manual, 3 pontos |
| `frontend/src/services/financeiro.js` | diverge 17 linhas | inserção manual, 1 bloco |

As três divergências são de **regiões diferentes** das que o commit toca (o item 22 do relatório de
obras, feito no V4, mexe na linha 1357 e no fim do arquivo; o commit mexe na 4784 e na 468). Não há
conflito real — só não dá para aplicar cego.

## Dependências conferidas no V4

Tudo que o código novo chama já existe aqui:

| Precisa | Estado |
|---|---|
| `estornarMovimentoTitulo` exportado de `tituloFinanceiroService` | OK — linha 4877 |
| `movimentos_financeiros.movimento_origem_id` | OK — existe no model |
| `tipo_movimento` aceitar `ESTORNO_BANCARIO` | OK — é `varchar(40)`, **não é ENUM**, não precisa de migration |
| Permissão `financeiro.conciliacao.estornar` | OK — já cadastrada e já usada em 2 rotas |
| `subtractDays`, `roundCurrency`, `registrarEventoSeguranca` | OK — já no serviço |
| `conciliacoes_bancarias.resolucao_tipo` (âncora do `after:`) | OK — existe |

---

## Migration — por que o nome NÃO muda

`202608270001_conciliacao_estornos_bancarios.js` **veio do `dev-v2`**. Regra 1 da
`CONVENCAO-MIGRATIONS.md`: migration de lá pode já ter rodado em produção, e o nome é a identidade
dela no `schema_migrations`. Renomear faria rodar de novo no deploy.

Ela entra na faixa `0001–0049`, que é a faixa de quem vem de fora. A faixa do V4 é `0050+`.

**Ordem de execução conferida:** o runner ordena por nome, então no dia 27/08 fica

```
202608270001_conciliacao_estornos_bancarios.js   <- veio do dev-v2
202608270050_solicitacao_pedidos_retorno.js      <- criada aqui
```

que é exatamente o desejado: o trabalho do V4 assume o schema de base como pronto.

**Estado geral das migrations, medido:** das 167 do `C:\Fluxy`, esta é a **única** que faltava aqui.
As 33 exclusivas do V4 estão todas na faixa `0050+`. Não há colisão de nome nem número fora de
ordem. Fora trazer esta, não há nada a reorganizar.

Ela é idempotente (`tableExists`, `columnExists`, `indexExists`, `foreignKeyExists`) e **só mexe em
estrutura** — cinco colunas, dois índices e uma FK. Respeita a Regra 5.

---

## Superfície de impacto — onde o sistema passa a recusar

O guarda `assertSemAlertaEstornoBancario` entra em **sete** caminhos. Qualquer lançamento com
alerta pendente passa a devolver **409** neles:

| Caminho | Efeito |
|---|---|
| `confirmarConciliacao` | conciliação manual recusada |
| `confirmarConciliacaoFatura` | fatura de cartão recusada |
| `confirmarConciliacaoTransferencia` | transferência recusada |
| `confirmarConciliacaoTarifa` | tarifa recusada |
| `confirmarConciliacaoCreditoRotativo` | crédito rotativo recusado |
| `criarTituloEConciliar` | criar título recusado |
| `ignorarConciliacao` / `removerConciliacao` | ignorar e remover recusados |

E mais dois, sem exceção:

- `conciliarSugeridos` (o lote) **pula** o lançamento e conta como associação manual;
- `listarConciliacoes` deixa de calcular sugestões para ele e devolve `estorno_bancario` no item.

`estornarConciliacao` passa a **recusar** desfazer um `ESTORNO_BANCARIO` já confirmado pelo caminho
genérico — exige fluxo próprio.

---

## O que a medição contra o banco local encontrou

Rodei a regra de classificação contra as 2.064 conciliações de `fluxy_main_copia`:

| | |
|---|---|
| Lançamentos que passariam a ter alerta | **82** — todos `PENDENTE` |
| Já excluídos por conterem `TARIFA` | 44 |

Quebrado por texto do banco:

| Texto | Qtd | Sinal |
|---|---|---|
| `Taxa de Devolução de Cheque` | **30** | **débito** (−0,35) |
| `Cheque Compe Devolvido` | 24 | crédito |
| `Cheque Devolvido Motivo` | 9 | crédito |
| `ESTORNO DE DÉBITO - BB ADMIN CONSÓRCIO SA` | 7 | crédito |
| `CHEQUE DEVOLVIDO MOT 11` / `MOT 22` | 6 | crédito |
| `PIX - REJEITADO - …` | 6 | crédito |

### O achado — 30 dos 82 são tarifa, não estorno

`Taxa de Devolução de Cheque` de **−0,35** é a **tarifa** que o banco cobra pela devolução. Não é
uma devolução de dinheiro.

O código tem a proteção certa — `if (description.includes('TARIFA')) return null` — mas **este banco
escreve `Taxa`, não `Tarifa`**. A palavra não bate, a linha contém `DEVOL` e `CHEQUE`, e ela é
classificada como `CHEQUE_DEVOLVIDO` com janela de 30 dias.

Consequência: 30 lançamentos de tarifa saem do fluxo de tarifas **e** ficam travados nos sete
caminhos acima, esperando alguém apontar uma "saída original" que não existe.

Some-se que `classifyBankReversal` **não olha o sinal**. Um estorno devolve dinheiro — é crédito.
Esses 30 são débito e mesmo assim entram.

**Isso é defeito do código de origem, não da portabilidade.** A mudança vem **fiel ao `C:\Fluxy`**,
para os dois repositórios continuarem mescláveis, e a correção fica como decisão separada — porque
corrigir só aqui cria divergência silenciosa entre os dois.

Correção proposta, quando for decidida: acrescentar `TAXA DE DEVOLU` à exclusão e exigir
`valor > 0`. As duas são estreitas e não mudam nenhum dos 52 casos legítimos.

---

## O que NÃO muda

- Estorno de **tarifa** bancária continua no fluxo especializado que já existe.
- Nenhuma conciliação já `CONCILIADO` é reavaliada — o alerta só nasce na importação e na listagem.
- Nenhum dado é reescrito: a migration cria colunas vazias. Os 82 lançamentos existentes só ganham
  alerta quando forem listados de novo.
- A permissão já existe; **não há permissão nova para conceder em produção**.
- Nenhuma variável de ambiente nova.

---

## Ordem de aplicação

1. Migration com o nome exato.
2. `conciliacaoEstornoBancarioService.js` (novo, sem dependência).
3. Patch nos 7 arquivos idênticos.
4. Inserção manual em `routes.js`, `relatorioFinanceiroService.js`, `financeiro.js`.
5. Documento `docs/modulos/financeiro/ESTORNOS_BANCARIOS_OFX.md`.
6. Registro em `MIGRACAO-PARA-PRODUCAO.md`.

## Como verificar

- `node backend/scripts/validarConciliacaoMatchesExatos.js` — o commit já traz 9 asserções novas.
- Build do frontend.
- Reiniciar o backend: a migration roda no boot, antes da porta abrir.
- Conferir na tela que os 6 PIX rejeitados aparecem com alerta e com candidatos.
