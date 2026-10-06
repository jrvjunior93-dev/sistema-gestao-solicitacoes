# Dados de empresa em fornecedores de Compras

A Gestao de Fornecedores usa um formulario e uma API separados de Pessoas e dos
modais de credor. A correcao publicada no commit cc623057 nao incluiu esta tela.
O ajuste atual permite informar nome fantasia e representante legal e persisti-los
no cadastro central de Pessoas, sem adicionar colunas a fornecedores_compra.

## Escopo e comportamento

GestaoFornecedores.jsx reutiliza DadosEmpresaParceiro quando o documento tem
14 digitos. Nome e razao social permanecem separados do nome fantasia; contato
comercial permanece separado do representante legal. Novos cadastros PJ exigem
nome fantasia, nome e CPF do representante, como a criacao completa de Pessoas.
Cargo e opcional. PF nao recebe essa exigencia. A edicao de registros existentes
nao passa a exigir todos esses dados, mas valida o CPF do representante informado.

As rotas GET de /compras/fornecedores e /compras/fornecedores/:id retornam a
associacao parceiro com apenas ID, nome fantasia, nome, CPF e cargo do representante.
POST e PUT encaminham esses quatro campos para comprasFornecedorService. Dados
nao enviados por outros chamadores nao apagam os campos de empresa existentes.
Permissoes e ativacao de modulos nao foram alteradas.

Um fornecedor avulso legado continua avulso em uma edicao simples. Se o usuario
preencher os dados de empresa, o cadastro central e criado ou reutilizado na
transacao existente, mantendo o ID do fornecedor e seus vinculos com cotacoes.
Conflito com outro fornecedor pelo mesmo documento/vinculo retorna erro e reverte
a escrita central. Nenhum registro antigo foi convertido em lote.

Envios consecutivos no formulario sao protegidos por referencia sincrona e pelo
estado de processamento. Novo/Editar nao substituem o formulario durante o envio.
Criacao central continua reutilizando Pessoas e fornecedor pelo documento.

## Arquivos

- frontend/src/modules/solicitacao-compra/pages/GestaoFornecedores.jsx
- backend/src/controllers/FornecedorCompraController.js
- backend/src/services/comprasFornecedorService.js
- frontend/scripts/validarEmpresaFornecedorCompra.mjs
- backend/scripts/validarEmpresaFornecedorCompra.js
- docs/workspace/OWNERSHIP_ATIVO.md e este handoff

## Validacoes

- node backend/scripts/validarEmpresaFornecedorCompra.js: controllers e servico
  reais com modelos simulados; PJ/PF, leitura, edicao parcial, preservacao de dados,
  reutilizacao, vinculo legado sem troca de ID, conflito, rollback e permissoes.
- node frontend/scripts/validarEmpresaFornecedorCompra.mjs: funcoes reais e tela
  React em fixture local; campos habilitados, carregar/salvar/editar, CPF/CNPJ,
  legado, bloqueio de envio duplicado e formulario oculto sem gerenciamento.
  Campos de empresa cabem na largura de 390px. Capturas dos temas claro e escuro
  inspecionadas em outputs/fornecedor-empresa/, fora do commit.
- node frontend/scripts/validarDadosEmpresaCredor.mjs e
  node frontend/scripts/validarCredorNovaSolicitacao.mjs: regressao aprovada.
- npm run build no frontend: aprovado, com avisos anteriores de Browserslist
  desatualizado e chunks grandes. Sintaxe backend e git diff --check aprovados.

Os testes nao usam banco, S3, contas reais ou API externa. O teste de tela simula
os servicos e bloqueia rede externa; nao equivale a homologacao em producao.

## Publicacao e proximo passo

Usuario autorizou em 06/10/2026 o commit/push na refactor/frontend e promocao
por fast-forward para main, junto da correcao de anexos do historico. As auditorias
e capturas locais ficam fora do commit. Os testes focados sao reexecutados antes
da publicacao. Nao ha migration, dependencia nova nem variavel de ambiente.

O deploy operacional exige frontend e backend atualizados juntos. Conferir em
homologacao novo fornecedor PJ e edicao de um fornecedor central existente.
Publicacao Git nao confirma deploy Vercel ou atualizacao da EC2.
