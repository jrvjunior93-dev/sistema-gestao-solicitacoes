# Modulos

Cada subdiretorio possui a documentacao canonica do estado atual do modulo. Arquivos soltos com nomes de fase, sprint, plano, diagnostico ou relatorio sao historicos e nao substituem o `README.md` canonico.

Antes de alterar um modulo:

1. leia seu `README.md`;
2. consulte `../arquitetura/MAPA_MODULOS.md`;
3. consulte `../arquitetura/PROPRIEDADE_DADOS.md`;
4. confira regras detalhadas ainda referenciadas em `../regras_negocio/`;
5. valide todos os consumidores e efeitos indicados.

Modulos canonicos: Solicitacoes, Obras, Contratos, Compras, Cotacoes e Pedidos,
Financeiro, Provisionamento, Custos e Recebiveis, Comercial, CRM, RH/DP, SST,
Fiscal, Boletos, Comunicacao Interna, Biblioteca de Modelos, Treinamento e
Governanca. Configuracoes e Painel sao documentados como dominios transversais.

O catalogo de runtime possui ainda uma integracao antiga desabilitada, documentada
somente em `../arquitetura/ESTADO_RUNTIME_E_LEGADOS.md`; ela nao e modulo operacional.
