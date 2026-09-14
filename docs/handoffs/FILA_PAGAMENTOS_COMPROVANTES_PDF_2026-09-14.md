# Handoff — comprovantes PDF na Fila de Pagamentos

Data: 14/09/2026
Branch de trabalho: `codex/fila-pagamentos` (base `origin/refactor/frontend`)

## Objetivo

Importar em massa comprovantes PDF na Fila de Pagamentos, ler seus dados sem IA, sugerir
o título correspondente e permitir confirmação humana antes da baixa.

## Entrega funcional

- botão `Importar comprovantes` condicionado à permissão granular;
- seleção múltipla e prévia dos PDFs;
- leitura determinística de BB PIX, CAIXA PIX/Boleto/TEV/DARF e Sicredi PIX;
- sugestão por solicitação, código de barras, valor, favorecido/documento e data;
- seleção manual quando não houver correspondência segura;
- sugestão de conta pagadora por agência/conta;
- vínculo do PDF no S3 e registro de metadados na fila;
- preenchimento de valor, data da baixa e conta sem efetivar a baixa;
- indicação visual do comprovante já vinculado.

## Proteções

- PDF apenas, até 500 arquivos selecionados de uma vez;
- processamento sequencial em lotes internos de até 10 arquivos, 12 MB por arquivo e
  50 MB por requisição, evitando concentrar centenas de PDFs na memória do backend;
- rejeição de arquivo duplicado por SHA-256;
- rejeição de vínculo duplicado de arquivo ou título na mesma operação;
- tentativa de detectar mais de um pagamento no mesmo PDF;
- revalidação e bloqueio do item pendente antes de persistir;
- operação protegida por rate limit, autenticação e permissão granular;
- sem HTML, OCR, IA ou execução automática da baixa.

## Schema e configuração

- migration: `backend/migrations/202609140002_fila_pagamentos_comprovantes_pdf.js`;
- permissão: `financeiro.fila_pagamentos.importar_comprovantes`;
- dependências: `pdf-parse@2.4.5` e `multer@2.3.0`.

## Validações executadas

- sintaxe dos novos arquivos do backend: aprovada;
- `npm run test:fila-comprovantes-pdf` com os sete PDFs fornecidos: aprovado;
- `npm run test:fila-pagamentos`: aprovado;
- `npm run audit:permissoes-granulares`: aprovado, sem chave inválida ou frontend-only;
- `npm run build` do frontend: aprovado;
- prova de modais em desktop, notebook, zoom alto e celular: aprovada.

O `npm audit --omit=dev` ainda informa 14 vulnerabilidades em dependências preexistentes
do backend (`docxtemplater`, Express/body-parser/qs, Puppeteer, mysql2, nodemailer,
ExcelJS/Sequelize). `pdf-parse@2.4.5` e `multer@2.3.0` não aparecem na cadeia dos alertas.
O ajuste global dessas dependências ficou fora deste escopo porque inclui atualizações
potencialmente incompatíveis.

Layouts reconhecidos no teste real:

- `Comprovantes BB.pdf`: Banco do Brasil / PIX;
- `Comprovante DARF com codigo de barras.pdf`: CAIXA / DARF;
- `Comprovante de TEV enviada.pdf`: CAIXA / TEV;
- `Comprovante de Boleto com descricao.pdf`: CAIXA / Boleto;
- `Comprovante de Boleto.pdf`: CAIXA / Boleto;
- `Comprovante pix caixa.pdf`: CAIXA / PIX;
- `SOL-5570 (2).pdf`: Sicredi / PIX.

## Limitações conhecidas

- PDF sem camada de texto requer revisão manual e uma etapa futura de OCR;
- layout bancário novo pode exigir um parser adicional;
- um PDF com várias transações deve ser separado antes da importação;
- a confirmação do vínculo não substitui a revisão dos dados nem registra a baixa;
- se um lote intermediário falhar, os lotes já confirmados permanecem vinculados e a tela
  informa claramente quantos foram concluídos antes de atualizar a fila;
- a implantação exige migration protegida e configuração da nova permissão.

## Próximo passo exato

Após commit/push autorizado, implantar em desenvolvimento, aplicar a migration, conceder
a permissão a um usuário de teste e validar o caminho feliz: enviar PDF, revisar sugestão,
confirmar vínculo, conferir os campos preenchidos e somente então registrar a baixa.
