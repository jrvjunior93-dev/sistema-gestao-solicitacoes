# Competência DRE automática nos títulos da solicitação

## Causa e correção

O modal `Criar Título` enviava `considera_dre` em cada pagamento. A validação da API proibia esse campo no pagamento, gerando o erro visto na tela antes da criação do título. O modal deixou de enviar o campo tanto no pagamento quanto no cabeçalho. A API agora deriva a inclusão na DRE da categoria financeira de cada título, respeitando eventual opção explícita de exclusão enviada por outro cliente.

No serviço de criação por solicitação, a competência DRE passou a ser a data de `createdAt` da solicitação no fuso `America/Sao_Paulo`, para todas as parcelas e formas de pagamento geradas. Uma data de criação ausente ou inválida gera erro explícito, sem substituição silenciosa pela data atual. Criação manual e conciliação bancária permanecem com suas regras atuais.

A revisão do mesmo envio revelou que `payment_beneficiary_id`, usado pelo modal para favorecido PIX e já verificado no serviço, também era recusado pela validação. O campo foi permitido e validado como ID inteiro; o controle de vínculo/atividade do favorecido no serviço permanece intacto.

## Arquivos alterados

`frontend/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx`, `backend/src/services/tituloFinanceiroService.js`, `backend/src/validators/financialValidators.js`, `backend/scripts/validarCompetenciaDreCriacaoTitulo.js` e este handoff.

## Validações

- `npm run test:competencia-dre-titulos` — passou, incluindo virada de dia em São Paulo, payload de pagamento e favorecido PIX.
- `npm run test:solicitacao-pix-apropriacoes` e `npm run test:pedido-financeiro-geo` — passaram.
- `npm run build` no frontend, `node --check` do serviço e `git diff --check` — passaram.
- Sem escrita em banco externo, migration, acesso à EC2 ou deploy. Commit e publicação da branch foram autorizados na rodada seguinte.

## Próximo passo

Após futura publicação autorizada, homologar na EC2 dev com solicitação antiga (data diferente da geração do título), categorias com e sem DRE, duas formas de pagamento e favorecido PIX. Conferir `competencia_data`, `considera_dre` e a DRE gerencial. Preservar `outputs/` do usuário.
