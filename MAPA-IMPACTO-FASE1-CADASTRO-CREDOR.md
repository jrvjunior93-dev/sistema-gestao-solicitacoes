# Mapa de impacto — Fase 1: cadastro do credor

Data: 23/08/2026. Escrito antes da primeira linha de código (regra §6).

Itens do plano: **12** (nome fantasia obrigatório), **27** (validação PF/PJ), **28** (representante
legal) e a parte de **11** que faltava (Nome Fantasia na tela).

É a fase base: os itens 3, 9 e 29 leem dela.

---

## 1. Um achado que muda o item 29

**A "qualificação" que você mandou pesquisar já existe no cadastro.** `parceiros` tem `rg`,
`data_nascimento`, `nacionalidade`, `profissao`, `estado_civil`, `conjuge_nome`, `regime_bens` e
`conjuge_parceiro_id` — criados para o módulo Comercial, onde o comprador pessoa física é
qualificado no contrato de venda.

Ou seja: o vocabulário de qualificação **já está definido e em uso** neste sistema. Não vou
pesquisar praxe de mercado para inventar campo: reaproveito o que a casa já usa, o que também
significa que as duas partes do sistema vão falar a mesma língua.

O que falta é o **representante legal** — porque numa PJ quem assina é uma pessoa **diferente** do
parceiro, e não há onde guardar os dados dela.

## 2. O que muda

### 2.1 Colunas novas em `parceiros`

| Coluna | Para quê |
|---|---|
| `nome_fantasia` | item 12 |
| `representante_nome` | quem assina pela PJ |
| `representante_cpf` | |
| `representante_rg` | |
| `representante_cargo` | sócio, diretor, procurador |
| `representante_nacionalidade` | qualificação |
| `representante_estado_civil` | qualificação |
| `representante_profissao` | qualificação |

**Colunas, e não tabela.** Você pediu "campo de representante legal", e o contrato tem um
signatário. Se um dia forem dois (procuração conjunta), vira tabela — e aí é migração de dados, não
retrabalho de tela.

`regime_bens` do representante ficou **de fora**: regime de bens importa para quem é **parte** no
contrato, não para quem apenas representa a empresa. O parceiro PF já tem o campo.

Migration na faixa `0050+`. Todas anuláveis: os 5.000+ parceiros existentes não têm esses dados, e
migration que exige campo novo em tabela cheia não sobe.

### 2.2 A regra PF/PJ (item 27)

`tipo_pessoa` já existe e é **inferido do CPF/CNPJ** (`inferirTipoPessoa`). Sobre ele:

| | PF | PJ |
|---|---|---|
| CPF/CNPJ válido | já exigido | já exigido |
| Nome | já exigido (nome civil) | já exigido (razão social) |
| Telefone | já exigido | já exigido |
| **Nome fantasia** | não se aplica | **obrigatório** |
| **Representante legal** (nome + CPF) | não se aplica | **obrigatório** |
| Qualificação (nacionalidade, estado civil, profissão) | campos já existem | do **representante** |

Nome fantasia numa pessoa física não existe — exigir levaria a repetir o nome no campo, que é pior
do que não ter.

### 2.3 Onde a exigência vale — e onde NÃO vale

`criarParceiro` é chamada de **três** lugares:

| Caminho | Exige? |
|---|---|
| `POST /parceiros` (tela de Cadastros) | **sim** |
| `POST /parceiros/credor` (modal do contrato) | **sim** |
| `POST /parceiros/credor-compra-direta` (Compras) | **não, por ora** |

A terceira é do **módulo de Compras**, do outro agente. Ligar a exigência lá sem o campo estar no
formulário dele **quebraria o cadastro rápido de fornecedor** — e derrubar o módulo do outro para
cumprir uma regra do meu é exatamente o que o protocolo proíbe. Fica desligada com comentário, e
anotada no `PROTOCOLO-AGENTES-PARALELOS.md` para ele completar.

A **importação por XLSX** não passa por `criarParceiro` (grava direto pelo model), então planilha
antiga continua importando. Isso é deliberado: exigir nome fantasia numa carga de 5.000 linhas
antigas travaria a importação inteira por um dado que ninguém tem.

### 2.4 Na tela

- **Modal "Cadastrar credor"** (detalhe da solicitação e Nova Solicitação): ganha **Nome fantasia** e
  o bloco **Representante legal**, que só aparecem quando o CPF/CNPJ digitado é de **PJ** — 14
  dígitos. Aparecer e sumir conforme o documento evita o formulário pedir coisa que não existe.
- **Detalhe da solicitação**: o ladrilho **Contratado** passa a mostrar o nome fantasia quando houver
  (`Razão Social (Nome Fantasia)`), que é o item 11.

## 3. O que NÃO muda

- **Parceiros existentes.** Nada é exigido de quem já está cadastrado; a regra vale na **criação**.
  Completar cadastro antigo é a rota estreita de 20/08 (`credorContratoService`), que segue igual.
- **A conferência de cadastro acima do limite** (`pendenciasDoCadastro`): continua olhando endereço e
  CPF/CNPJ. Nome fantasia e representante entram nela na **Fase 2**, junto dos documentos.
- **Comercial**: usa os mesmos campos de qualificação e não é tocado.

## 4. O que pode quebrar

| Risco | Verificação |
|---|---|
| Cadastro de PF passar a exigir nome fantasia | Suíte cadastra PF sem nome fantasia e exige sucesso |
| PJ passar sem nome fantasia | Suíte tenta e exige recusa |
| PJ passar sem representante | Suíte tenta e exige recusa |
| Compras quebrar | Suíte cadastra pela rota de compra direta sem os campos e exige sucesso |
| Importação XLSX quebrar | Suíte confere que a rota não passa por `criarParceiro` |
| Parceiro antigo virar inválido | Suíte edita um parceiro PJ antigo sem os campos e exige sucesso |
| Nome fantasia não chegar à tela | Suíte confere o ladrilho Contratado |

## 5. Suíte

`qa/medicao/40-cadastro-credor-pf-pj.js`

---

## 6. Resultado

`qa/medicao/40-cadastro-credor-pf-pj.js` — **9 provas, passou.**

| Prova | Resultado |
|---|---|
| PJ sem nome fantasia | recusada |
| PJ sem representante legal | recusada |
| PJ com CPF inválido no representante | recusada |
| PJ completa | aceita, e os sete campos chegam ao banco com o CPF só em dígitos |
| **Pessoa física** sem nome fantasia nem representante | aceita — não foi afetada |
| **Compras** (compra direta) sem os campos novos | aceita — não quebrou |
| Parceiro PJ **antigo**, sem os campos | continua editável |
| Nome fantasia na rota que monta o ladrilho Contratado | chega |

Migration `202608230050_parceiro_fantasia_representante.js` aplicada no boot.

Regressão: **24** (conferência do cadastro), **26** (abertura acima do limite) e **39** (cabeçalho)
seguem passando.

### Um engano que a suíte pegou, e o rastro que ele deixou

`inferirTipoPessoa` devolve **`'J'` e `'F'`**, não `'PJ'`/`'PF'`. Escrevi a guarda comparando com
`'PJ'`: ela ficava sempre falsa e **a exigência nunca disparava** — a primeira execução criou a PJ
sem nome fantasia e passou.

E o engano se repetiu na própria suíte: a consulta do "parceiro antigo" também procurava
`tipo_pessoa='PJ'` e não achava ninguém.

Além disso, a primeira versão da limpeza apagava só por **nome**. Como a criação que deveria falhar
passou, o CNPJ ficou ocupado e as três provas seguintes falharam por *"já existe um parceiro com este
CPF/CNPJ"* — escondendo o defeito real atrás de um sintoma. A limpeza agora apaga **pelo documento**.
