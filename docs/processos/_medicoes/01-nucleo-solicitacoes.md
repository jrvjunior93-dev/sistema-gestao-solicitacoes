# Medição 01 — o núcleo de Solicitações

> Tudo aqui saiu de leitura de código, com arquivo e linha. Nada foi suposto.
> Base de código: `refactor/preferencias-usuario`, commit `466b988`.

## Criação — `SolicitacaoController.create` (linha 2839)

- Código da solicitação: gerado por `gerarCodigoSolicitacao()`.
- Status inicial: **sempre `PENDENTE`** (`status_global: 'PENDENTE'`, linha 3684).
- Setor inicial: `area_responsavel` resolvido na criação.
- Cada campo só é gravado se `campoVisivel(...)` — a **visibilidade do campo manda na gravação**.
  Campo escondido pela configuração do tipo não chega ao banco, mesmo que o navegador o envie.

## A máquina de estados é CADASTRO, não código — `updateStatus` (linha 4098)

Achado central: **não existe lista fixa de status no código**. Quem define os status
permitidos é o cadastro `EtapaSetor` (tela **Configurações › Status por setor**, rota
`/status-setor`), por setor.

Regras medidas:
1. Quem não é SUPERADMIN só altera status de solicitação que esteja **nos setores dele**.
2. O setor de validação é o **setor atual da solicitação** — salvo se o usuário tiver a
   permissão `solicitacoes.acoes.alterar_status_qualquer_setor`, quando passa a ser o setor
   dele.
3. Se o setor **tem** etapas cadastradas, só os nomes cadastrados são aceitos.
4. **Se o setor NÃO tem etapa cadastrada, qualquer status é aceito** (linha 4185:
   `if (etapas.length > 0)`). Ausência de cadastro = ausência de trava.
5. SUPERADMIN não passa por nenhuma das quatro.

## Setor OBRA é bloqueado em duas ações

- **Não pode enviar para outro setor** (`enviarParaSetor`, linha 6249): HTTP 403,
  *"Setor OBRA nao pode enviar solicitacoes para outro setor."*
- **Não pode assumir solicitação** (`assumirSolicitacao`, linha 6288): HTTP 403.

A capacidade que decide é `eh_setor_obra` no cadastro de Setores — não o nome.

## Aprovação da Diretoria — LACUNA MEDIDA

`aprovarDiretoria` (linha 5194) exige, nesta ordem:
`fluxo_aprovacao_diretoria` verdadeiro **e** `diretoria_fluxo_codigo` **e**
`setor_destino_pos_aprovacao` preenchido; senão devolve HTTP 400.

**Onde `fluxo_aprovacao_diretoria` é gravado como verdadeiro: em lugar nenhum.**

Varredura completa do backend:

| Local | O que faz |
|---|---|
| `SolicitacaoController.js:3675` | grava **`false`** na criação de toda solicitação |
| `SolicitacaoCompraController.js:3977` e `:4018` | grava `fluxoCompra.usaFluxoDiretoria` |
| `SolicitacaoCompraController.js:443` (`montarFluxoAprovacaoCompra`) | devolve **`usaFluxoDiretoria: false`** fixo |
| `SolicitacaoCompraController.js:454` (`montarFluxoAprovacaoCompraDireta`) | devolve **`usaFluxoDiretoria: false`** fixo |
| `PrioridadeDiretoriaController.js:565` | é filtro de consulta, não escrita |
| `migrations/202604210002` | cria índice, não grava valor |

As duas únicas funções que produzem o valor retornam `false` fixo. Logo, **nenhuma
solicitação do sistema entra no estado que aciona a aprovação da Diretoria**. O endpoint, a
permissão, a notificação e o botão existem; o portão nunca abre.

Consequência medida no fluxo de compra: a solicitação vai da criação direto para a
**GERÊNCIA DE PROCESSOS** (`areaResponsavel: setorGerenciaProcessos`), sem passar pela
Diretoria.

**Divergência com o escopo:** o escopo prevê aprovação da Diretoria acima de R$ 50.000. No
código, o corte de R$ 50.000 encaminha ao **JURÍDICO**, e a Diretoria não participa como
portão de valor em nenhum fluxo.

## Prioridades da Diretoria é OUTRO processo

`PrioridadeDiretoriaController` não é o portão de aprovação: é **priorização de pagamento em
lote**, sobre solicitações que já estão no FINANCEIRO. Dois tipos de lote: `DIR_ADMIN` e
`SOLICITACAO_DIRETORIA`. Estados do lote: ABERTO, FINALIZADO, CANCELADO, EXCLUÍDO.

## Configuração de Diretoria que existe e funciona

`aprovacaoDiretoriaConfig.js`: a diretoria responsável é resolvida pela **classificação da
obra** — `PUBLICA` ou `PRIVADA` —, não por valor. Chave `DIRETORIA_POR_CLASSIFICACAO_OBRA`.
Chave irmã: `SETOR_DESTINO_APOS_APROVACAO_DIRETORIA`.

## Comportamento por tipo — 33 interruptores

`tipoSolicitacaoBehaviorService.js`. O tipo é cadastro com 33 chaves de comportamento
(mostrar/exigir por campo, finalidade da data, apropriação automática, fluxo de contrato
novo, fluxo de despesa eventual, somente gerência de processos, somente sistema).

Só **8 códigos** têm regra embutida no código: `SOLICITACAO_DE_COMPRA`, `OUTROS_ASSUNTOS`,
`PEDIDO_DE_CONTRATACAO`, `MEDICAO`, `ADM_LOCAL_DE_OBRA`, `LOCACAO_DE_MAQ_EQ`, `PRE_OBRA`,
`ABERTURA_DE_CONTRATO`. Todo o resto é parametrização.

`ADM_LOCAL_DE_OBRA`, `LOCACAO_DE_MAQ_EQ` e `PRE_OBRA` ligam
`usa_apropriacao_automatica_obra`: contrato e apropriação manual somem da tela **e são
ignorados no backend**.
