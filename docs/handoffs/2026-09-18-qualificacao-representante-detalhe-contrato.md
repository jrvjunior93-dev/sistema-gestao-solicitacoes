# Handoff — qualificação do representante no detalhe da solicitação de contrato

## Estado

Implementação em `refactor/frontend`. O usuário autorizou commit e push para posterior atualização da EC2 dev por ele. Nenhum acesso à EC2 ou ao RDS pelo agente. `outputs/` permanece intocado e fora do escopo.

## Alterações

- `backend/src/services/contratoFluxoNovoService.js`: a consulta `GET /contratos/:id/parcelas`, já protegida por acesso ao contrato, inclui a fotografia `representante_legal_qualificacao` previamente salva no contrato e a expõe no objeto `contrato` da resposta.
- `frontend/src/pages/SolicitacaoDetalhe/Header.jsx`: dentro de “Dados da solicitação”, contratos que têm essa fotografia mostram nome, CPF, RG, cargo/função, nacionalidade, estado civil e profissão do representante; quando há cônjuge, mostram nome, CPF, RG, nacionalidade, profissão e regime de bens. O CPF é formatado apenas para leitura. As seções não aparecem em solicitações sem esses dados.
- Nenhuma coluna, migration ou cópia da qualificação para `solicitacoes` foi criada: a fonte continua sendo a fotografia submetida ao Jurídico, independente de alterações posteriores no cadastro do parceiro. A interface não fixa R$ 50 mil; exibe a informação quando ela foi exigida e salva conforme a variável configurável.

## Validação

- `frontend`: `npm run build` — passou.
- `backend`: `node --check src/services/contratoFluxoNovoService.js` — passou.
- `backend`: `npm run test:contrato-aditivo-vigencia` — passou.
- `git diff --check` — passou.

## Risco e próximo passo

- Não houve teste integrado com banco nem teste manual com contrato real. Conferir em dev um contrato acima do limite com representante casado, outro acima do limite sem cônjuge e um abaixo do limite; a seção deve aparecer somente quando o JSON da qualificação existir.
- A rota de parcelas já exige autorização de leitura do contrato; não ampliar essa permissão por causa da nova apresentação de CPF/RG.
- Próximo passo exato: publicar somente os arquivos deste escopo na `refactor/frontend`; o usuário fará a atualização exclusivamente de dev, após confirmar branch, banco e preflight. Nenhuma migration foi criada nesta alteração.
