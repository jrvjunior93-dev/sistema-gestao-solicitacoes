# Ícone para adicionar favorecido — 2026-10-12

## Pedido e resultado

Substituído o botão textual `+ Favorecido` por um ícone reutilizável de adição,
com título e nome acessível `Adicionar novo favorecido`, sem texto fixo.

- Boleto: ícone junto ao botão de selecionar boletos.
- Demais formas: ícone junto ao campo de favorecido, após cadastrar.
- Quando o credor é usado como favorecido e o campo está oculto, o ícone fica
  junto dessa opção, fora do label para não alterar a seleção do checkbox.
- Antes de selecionar uma forma, mantida uma ação de adição compacta.
- Na divisão entre favorecidos, o ícone aparece apenas na última linha, na
  posição correspondente à forma de pagamento dessa linha.
- Aplicado à Nova Solicitação, medição e componente compartilhado de divisão.

## Arquivos

- frontend/src/components/solicitacoes/AdicionarFavorecidoButton.jsx (novo)
- frontend/src/components/solicitacoes/PagamentosFavorecidos.jsx
- frontend/src/components/contratos/BlocoMedicaoContrato.jsx
- frontend/src/pages/NovaSolicitacao.jsx
- frontend/scripts/validarNovaSolicitacaoAdiantamento.mjs
- frontend/scripts/validarPagamentoMedicaoLegada.mjs

## Mapeamento e limites

Mantidos os handlers existentes `iniciarDivisaoFavorecidos`, `iniciarDivisao`
e a adição de linha no componente compartilhado. O ícone é `type=button`;
não submete o formulário. Preservados bloqueios durante envio, por ausência de
itens na medição e limite de 50 favorecidos. Recarga mantém seu fluxo próprio.
Nenhuma alteração em backend, endpoints, migrations, permissões, visibilidade,
validações de valores, boletos ou payload financeiro.

## Validações executadas

- node scripts/validarPagamentoMedicaoLegada.mjs: aprovado, incluindo múltiplos
  boletos, formas, medição antiga/nova, divisão, somas e bloqueios de valor.
  Adicionadas verificações de posição do ícone e ausência de label ancestral.
- node scripts/validarNovaSolicitacaoAdiantamento.mjs: aprovado, cenário simples
  e dividido; ícone sem texto junto a cadastrar e ao campo de busca.
- node scripts/validarValoresFormasTituloSolicitacao.mjs: aprovado.
- npm run build: aprovado (avisos existentes de Browserslist e chunk principal).
- git diff --check -- frontend: aprovado.
- Capturas desktop e mobile inspecionadas em
  outputs/qa-icone-favorecido-20261012; sem transbordamento horizontal.

Testes locais com respostas simuladas; sem escrita em banco, S3 ou EC2.

## Estado e próximo passo

Implementação concluída e publicação em `refactor/frontend` autorizada pelo
usuário. Pacote restrito aos arquivos deste ajuste e a este handoff,
preservando mudanças de auditoria e outros trabalhos presentes no checkout.
Este ajuste não exige migration nem reinício do backend.
