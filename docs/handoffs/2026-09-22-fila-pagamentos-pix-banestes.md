# Handoff — leitura de PIX Banestes na Fila de Pagamentos

Data: 22/09/2026
Branch: `refactor/frontend`

## Objetivo

Adicionar ao leitor deterministico de comprovantes PDF o layout de PIX enviado do
Banestes, cobrindo as variacoes com campo `HISTORICO` e com campo `MENSAGEM`.

## Alteracoes

- novo parser `BANESTES/PIX` no servico de comprovantes;
- identificacao do layout pelo cabecalho de PIX enviado e pelos dados do pagador Banestes;
- extracao de valor, data da efetivacao, situacao, ID da transacao, protocolo, pagador,
  favorecido, CPF/CNPJ, agencia e conta de origem;
- preservacao da referencia `SOL-*` quando presente no historico ou em outro trecho;
- deteccao de multiplos IDs ampliada para aceitar o formato Banestes sem dois-pontos;
- rotulo `Banestes` incluido na previa da Fila de Pagamentos;
- testes unitarios para as duas variacoes do layout.

## Arquivos deste escopo

- `backend/src/services/pagamentoComprovantePdfService.js`
- `backend/scripts/validarComprovantesPdfFila.js`
- `frontend/src/pages/FinanceiroFilaPagamentos.jsx`
- `docs/workspace/OWNERSHIP_ATIVO.md`
- `docs/handoffs/2026-09-22-fila-pagamentos-pix-banestes.md`

## Validacoes executadas

- `npm run test:fila-comprovantes-pdf`: aprovado;
- teste real do leitor com os nove PDFs fornecidos: todos reconhecidos, incluindo as
  duas variacoes Banestes;
- `npm run test:fila-pagamentos`: aprovado;
- `node --check` nos dois arquivos JavaScript do backend: aprovado;
- `npm run build` no frontend: aprovado;
- `git diff --check`: aprovado.

## Riscos e limites

- o leitor permanece deterministico e depende de o PDF possuir camada de texto;
- novos layouts do Banestes podem exigir parser adicional;
- CPF parcialmente mascarado participa apenas da correspondencia parcial e a confirmacao
  humana da sugestao continua obrigatoria quando nao houver confianca suficiente;
- nenhuma migration, acesso a banco externo, deploy, commit ou push foi executado.

## Proximo passo

Revisar e publicar este conjunto na `refactor/frontend` somente quando houver autorizacao
explicita para commit/push e, depois, homologar a previa dos dois PDFs Banestes em dev.
