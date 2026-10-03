# Mapa de impacto — etapa 8 (tela do wireframe 1)

## Decisão de desenho: tela NOVA, não mexer na NovaSolicitacao.jsx
`NovaSolicitacao.jsx` tem 2.260 linhas, monolítica, e atende o fluxo antigo em produção.
O wireframe 1 vira página própria (`ContratoFluxoNovo.jsx`, rota `contratos/novo`), plugada
depois via automação de destino (`nova-solicitacao-automacao-destino`, que já redireciona
tipos para telas específicas mantendo a obra). Zero risco ao legado.

## Consome (tudo já existente e auditado)
| Dado | Fonte |
|---|---|
| Obras | `getMinhasObras({ modo:'CRIACAO' })` |
| Credor/Favorecido | busca em `parceiros` (componente da NovaSolicitacao como referência) |
| Categorias | `GET /configuracoes/contrato-obra-categorias` (curadas) |
| Formas de pagamento | `financeiro_formas_pagamento` — verificar endpoint existente |
| Apropriações da obra | `GET /configuracoes/obra-tipo-apropriacao/obras/:id/apropriacoes` |
| Criar | `POST /contratos/fluxo-novo` |
| Aprovar/Rejeitar | `POST /contratos/fluxo-novo/:id/(aprovar|rejeitar)` — botões só com a permissão |

## Comportamento do wireframe
- Qtde parcelas + 1º vencimento → prévia das parcelas gerada NO FRONT (espelha
  `gerarParcelas`: centavos, sobra na última) — mas o backend é a fonte da verdade
- Editar valor de parcela → redistribui nas últimas (espelha `redistribuir`), saldo em tempo real
- Percentuais de apropriação com soma 100 ± 0,01, 4 casas
- Acima de R$ 50 mil → campo detalhes_contratacao obrigatório visível

## O que NÃO é afetado
NovaSolicitacao.jsx, fluxo antigo de contratos, todas as telas existentes.

## Verificação da etapa
Harness `qa/lib/sessao.js`: criar contrato pela tela real, conferir no banco; caso de erro
(categoria fora da curadoria → mensagem); prova de isolamento (0 requisições externas).
Auditoria independente cobre 7+8 juntas, exercitando usuário→tela→HTTP→banco.
