# Handoff — documentação jurídica na abertura do contrato

## Escopo concluído

- Novos contratos acima do limite jurídico configurado exibem, na tela de Nova Solicitação:
  - Cartão CNPJ;
  - Ato constitutivo;
  - Documentos do representante legal;
  - formulário de qualificação com nome, CPF, RG, cargo, nacionalidade, estado civil e profissão.
- A fronteira é estrita: no valor exato do limite a seção não aparece; um centavo acima, aparece.
- Os três arquivos e todos os campos da qualificação são obrigatórios acima do limite.
- Estado civil passou a ser uma lista controlada: Solteiro(a), Casado(a), Divorciado(a), Viúvo(a),
  Separado(a) e União estável.
- Ao selecionar Casado(a), a tela revela e exige nome, CPF, RG, nacionalidade, profissão e regime de
  bens do cônjuge. O backend repete as validações, impede CPF igual ao do representante e grava os
  dados conjugais dentro da mesma fotografia JSON da qualificação.
- A qualificação é gravada como fotografia JSON no contrato, sem depender de mudanças futuras no
  cadastro do parceiro.
- Contratos anteriores à mudança permanecem válidos e não recebem exigência retroativa.
- A aprovação no backend exige os três tipos de documento nos contratos novos alcançados pela regra.
- O autor pode anexar enquanto o contrato aguarda aprovação; depois, a substituição exige permissão
  de edição de contratos e continua sujeita ao escopo da obra.
- O modal de edição em Gestão de Contratos permite completar ou substituir os três documentos, para
  recuperar falhas de rede ocorridas depois da criação.

## Arquivos alterados

- `frontend/src/components/contratos/BlocoContratoFluxoNovo.jsx`
- `frontend/src/pages/NovaSolicitacao.jsx`
- `frontend/src/pages/GestaoContratos.jsx`
- `frontend/src/services/contratos.js`
- `backend/src/models/Contrato.js`
- `backend/src/services/contratoFluxoNovoService.js`
- `backend/src/controllers/ContratoController.js`
- `backend/src/config/uploadDocumentacaoJuridica.js`
- `backend/src/validators/securityValidators.js`
- `backend/src/routes.js`
- `backend/migrations/202608260057_contrato_documentacao_juridica.js`
- `qa/medicao/56-documentacao-juridica-abertura.js`
- `MIGRACAO-PARA-PRODUCAO.md`

## Segurança e consistência

- Upload restrito a PDF, DOCX, JPG e PNG, com validação binária e bloqueio de macros já usado pelo
  sistema.
- Cada papel documental possui tipo próprio; um anexo genérico não satisfaz a aprovação.
- Reenvio substitui o slot sob lock transacional, evitando duplicidade por cliques concorrentes.
- A rota valida ID e slug por lista fechada.

## Validações executadas

- `node --check` nos arquivos de backend e na suíte.
- `git diff --check` no escopo alterado.
- `npm run build` no frontend: aprovado.
- Migration aplicada no banco local e conferida como coluna JSON + registro em `schema_migrations`.
- Navegador interno:
  - R$ 50.000,00: seção ausente;
  - R$ 50.000,01: seção presente com três anexos e sete campos;
  - organização visual conferida em página completa.
- `node qa/medicao/56-documentacao-juridica-abertura.js`: aprovado, com limpeza pelo ID inserido.
- A suíte também provou que Casado(a) sem dados conjugais é bloqueado, que outro estado civil não
  exige cônjuge e que a qualificação casada completa ultrapassa a guarda jurídica.
- Navegador interno: lista de estado civil conferida e bloco do cônjuge aberto condicionalmente com
  os seis campos obrigatórios e a lista de regimes de bens.
- Backend local reiniciado; `/api/auth/me` respondeu 401 sem sessão, confirmando a porta 8100 ativa.

## Observação de validação externa

- Não foi enviado arquivo real ao armazenamento S3 durante a prova para não criar artefato externo
  de QA. O middleware, a rota, a autorização e o bloqueio de aprovação foram validados localmente.
