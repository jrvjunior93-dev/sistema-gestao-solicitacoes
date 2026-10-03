# Plano de Nome Fantasia para Pessoas e Fornecedores

## Estado

- Status: mapeado, aguardando autorização para implementação.
- Este documento não representa funcionalidade disponível no runtime.
- O cadastro, as pesquisas e os documentos atuais continuam utilizando `nome` como nome legal/razão social.

## Objetivo

Adicionar `nome_fantasia` ao cadastro mestre de pessoas/parceiros, ao cadastro operacional de fornecedores de Compras e aos cadastros rápidos relacionados. Permitir pesquisas por nome legal, nome fantasia e CPF/CNPJ sem alterar a identidade legal usada em documentos e integrações financeiras.

## Regra proposta

- `nome`: obrigatório; representa nome completo ou razão social.
- `nome_fantasia`: opcional; informação complementar, sem unicidade.
- CPF/CNPJ permanece como chave de identificação e deduplicação.
- Autocompletes e listas devem mostrar o nome legal como informação principal e o nome fantasia como informação secundária.
- PDFs, pedidos, cotações formais, títulos, boletos, arquivos bancários, auditorias e registros históricos continuam usando o nome legal.
- Alterações futuras no nome fantasia não reescrevem descrições históricas.

## Estruturas afetadas

### Banco e models

- `parceiros`: adicionar `nome_fantasia` anulável.
- `fornecedores_compra`: adicionar `nome_fantasia` anulável para suportar registros operacionais legados sem `parceiro_id`.
- Não executar preenchimento automático copiando a razão social para o nome fantasia.

### Sincronização

- Criação e edição pelo módulo de Compras devem sincronizar `Parceiro` e `FornecedorCompra`.
- Edição pelo cadastro de Pessoas também deve sincronizar o fornecedor operacional vinculado.
- Fornecedores sem vínculo com Parceiro devem continuar funcionando.
- Deduplicação deve usar `parceiro_id` ou CPF/CNPJ, nunca nome fantasia.

### APIs e validações

- Pesquisa de parceiros: incluir `nome_fantasia` no parâmetro `q`.
- Pesquisa de fornecedores de Compras: incluir `nome_fantasia`.
- CRUD de parceiros e fornecedores: aceitar e devolver o novo campo.
- Validadores dos cadastros rápidos de credor, fornecedor de cotação e credor de frete: permitir o campo opcional.
- Nenhuma rota ou permissão nova é necessária.

### Telas e fluxos

- Cadastro de Pessoas.
- Gestão de Fornecedores de Compras.
- Cadastro rápido de fornecedor em cotação.
- Compra Direta e Nova Solicitação de Compra.
- Nova Solicitação e Financeiro da solicitação.
- Cadastro rápido de credor de frete.
- Autocomplete compartilhado de parceiros.
- Pesquisas de credores no Financeiro, contratos e demais consumidores de `/parceiros`.
- Listagens devem preservar o nome legal e apresentar o nome fantasia de forma secundária.

### Importação e exportação

- Adicionar coluna opcional `Nome Fantasia` ao modelo de Pessoas.
- Aceitar aliases `nome_fantasia`, `nome fantasia` e `fantasia`.
- Manter compatibilidade com planilhas antigas sem a coluna.

## Fora do escopo

- Substituir razão social por nome fantasia em documentos legais ou bancários.
- Alterar registros históricos.
- Vincular automaticamente o campo homônimo do módulo Fiscal.
- Alterar código legado da integracao com o ERP anterior.
- Usar nome fantasia como identificador único em importações.

## Sequência de implementação

1. Criar migration idempotente para as duas tabelas e atualizar os models.
2. Atualizar normalização, CRUD, retorno e pesquisa de Parceiros.
3. Atualizar CRUD, pesquisa e sincronização dos Fornecedores de Compras.
4. Atualizar validadores de cadastros rápidos.
5. Atualizar Cadastro de Pessoas e Gestão de Fornecedores.
6. Atualizar cadastros rápidos de cotação, solicitação, compra direta e frete.
7. Atualizar autocomplete compartilhado e filtros locais de credores/fornecedores.
8. Atualizar modelo, importação e exportação de Pessoas.
9. Atualizar documentação canônica de Parceiros, Compras e Financeiro.
10. Executar testes de regressão e smoke test em dev antes da migração para `main`.

## Matriz mínima de testes

- Criar e editar parceiro com e sem nome fantasia.
- Criar e editar fornecedor por Compras e confirmar sincronização com Parceiro.
- Editar Pessoa e confirmar sincronização com FornecedorCompra.
- Confirmar compatibilidade de fornecedor legado sem `parceiro_id`.
- Pesquisar por razão social, nome fantasia e CPF/CNPJ formatado ou sem pontuação.
- Confirmar ausência de duplicidade nas listas unificadas de cotação e frete.
- Testar todos os cadastros rápidos afetados.
- Importar e exportar Pessoas com e sem a nova coluna.
- Confirmar que pedidos, títulos, PDFs, boletos e arquivos bancários continuam usando o nome legal.
- Confirmar que alteração do nome fantasia não modifica registros históricos.
- Confirmar preservação das permissões atuais.
