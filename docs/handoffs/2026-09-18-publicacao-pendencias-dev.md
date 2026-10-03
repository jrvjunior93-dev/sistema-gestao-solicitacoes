# Publicação das pendências para homologação dev — 18/09/2026

Usuário autorizou commit e publicação das pendências na `refactor/frontend`.
Não houve deploy, restart, migration ou escrita em banco externo nesta rodada.
A main permanece fora do escopo. Arquivos locais em `outputs/` não integram o commit.

## Escopo

- Compras: responsividade do comparativo Cards e retirada do comentário geral de cotação, preservando comentários por item.
- Financeiro: parcelamento/negociação de títulos, alocações, proteções, integração dos vínculos, relatórios e interface.
- DP/RH: jornada limitada pelo vínculo no período, transferências bilaterais, diretório sem dados financeiros, responsáveis compartilhados e destaque por atividade/leitura.
- Documentação pendente de homologação e respectivos handoffs.

## Validações repetidas nesta publicação

Backend: validarTituloRenegociacaoDomain, validarTituloRenegociacaoService,
validarTituloRenegociacaoVinculos, validarTituloRenegociacaoSincronizacao,
validarTituloRenegociacaoMigration, validarRhPessoalFluxo,
validarJornadaPeriodosEdicao, validarEscopoRhDpUsuarioObra,
validarFinanceiroObrasComprometido, validarResultadoObrasHistorico,
validarFinanceiroObrasSemLimite, validarFinanceiroObrasPdf,
validarRelatorioFinanceiroPeriodo, validarPedidoCompraFinanceiroGeo e
validarCompetenciaDreCriacaoTitulo: passaram.

Frontend: validarComparativoCardsResponsivo, validarCompraDetalheCards,
validarCotacaoResponsiva, validarTituloNegociacaoModal,
validarRhPessoalTransferencias, validarNavegacao e build Vite: passaram.
Testes de integração utilizam serviços/modelos simulados. Não substituem
homologação transacional em MySQL nem testes autenticados na EC2 dev.

## Próximo passo operacional

O usuário fará backup do banco dev e atualizará exclusivamente
`~/sistema-gestao-solicitacoes-dev` na branch `refactor/frontend`.
Instalar dependências do backend com `npm ci`, conferir migrations pendentes e
aplicar com `ALLOW_SCHEMA_MIGRATIONS=true npm run migrate` antes do restart.
O runner aplica todas as pendências, sem opção de seleção por arquivo: interromper
e conferir se aparecerem pendências além das duas novas desta entrega:

- `202609180002_titulos_renegociacao.js`
- `202609180003_rh_solicitacoes_leituras.js`

A primeira cria duas triggers; o usuário do banco precisa de permissão para criá-las.
Em caso de erro, não reiniciar e não marcar migration manualmente como concluída.
Após sucesso, reiniciar apenas `backend-dev --update-env` pelo PM2 e conferir logs.
Nunca reiniciar `backend-solicitacoes` neste procedimento.

Homologar negociação de títulos vinculados, baixas/estornos, concorrência, jornada
e transferências entre responsáveis antes de qualquer migração para main.
Responsáveis do RH usam o cadastro compartilhado de Custos e Recebíveis, acessível
pelo atalho Configurações → Responsáveis por obra; verificar vigência dos vínculos
e permissões de Pessoal, sem conceder acesso financeiro desnecessário.
