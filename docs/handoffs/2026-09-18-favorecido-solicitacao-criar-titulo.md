# Favorecido da solicitacao ao criar titulo financeiro

## Escopo

- Branch local `refactor/frontend`.
- No modal Criar Titulo do detalhe da solicitacao, o favorecido informado na solicitacao passa a prevalecer sobre favorecidos bancarios historicos vinculados ao credor.
- Compra Direta nao reaproveita o historico bancario do credor. O cadastro bancario existente so e reutilizado se chave PIX e CPF/CNPJ coincidirem com os da solicitacao; caso contrario, o titulo prepara os dados proprios dessa solicitacao.
- O identificador do favorecido da solicitacao tambem e enviado em cada titulo quando aplicavel, inclusive apos selecionar novamente o credor no modal. O favorecido do frete a terceiro permanece separado.

## Arquivos alterados

- `frontend/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx`
- `backend/scripts/validarCompraDiretaFrete.js` (checagem de regressao sem acesso ao banco)
- `docs/workspace/OWNERSHIP_ATIVO.md`

## Validacoes

- `frontend`: `npm run build` aprovado.
- `backend`: `npm run test:solicitacao-pix-apropriacoes` e `npm run test:compra-direta-frete` aprovados.
- `git diff --check` aprovado.
- Nao houve acesso a EC2/RDS, migration ou deploy. Commit e push foram solicitados na etapa seguinte.

## Proximo passo

Em ambiente de homologacao, conferir uma Compra Direta PIX cujo favorecido da solicitacao seja diferente do favorecido bancario historico do credor: abrir Criar Titulo e conferir nome, CPF/CNPJ e chave; repetir com boleto e com frete a terceiro. A publicacao na EC2 dev e a validacao funcional com dados reais ficam a cargo do operador do ambiente.
