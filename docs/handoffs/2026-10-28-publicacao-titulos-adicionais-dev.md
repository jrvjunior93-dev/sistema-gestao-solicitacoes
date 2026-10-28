# Publicacao DEV: novos titulos na SC e no pedido

Usuario autorizou commit/push exclusivo refactor/frontend e comandos para ele
executar na EC2 DEV, sem acesso remoto do agente e preservando producao/heap4096.
Sem alterar registros reais. Fonte local dfd3a9b1 (base main ade6e6dc) integrada
seletivamente sobre DEV a35a2139, sem merge de historico MAIN. Conflito apenas no
ownership foi resolvido conservando os registros dos dois lados. FinanceiroCard
mantem os ajustes DEV de favorecido/PIX anteriores; reabertura/precisao preservadas.

Funcionalidade e detalhes dos testes: handoff2026-10-28-criacao-adicional-titulos-compras-local.md.
Nesta publicacao foram incluidos aplicador, teste, manifesto fechado e README
titulos-adicionais-dev-20261028. Nao alterar os pacotes antigos de RH/precisao.

Backend em tres runtimes, com repeticao no historico sob lock da SC e vinculo
idempotente no pedido. Registros antigos nao sao excluidos ou recalculados.
Frontend nao muda o contrato dos endpoints nem envia novos campos de negocio:
header Idempotency-Key e opcional adicional aceito pelo servidor antigo. Pode ser
publicado junto, mantendo bloqueios antigos ate a atualizacao manual do backend.
Nenhuma migration, dependencia ou operacao de criacao/baixa e executada no deploy.

Validacoes da integracao:15 suites backend do pacote,10 testes do aplicador,
UI pedido/SC com busy/retry/chave e ACL, regressao de atualizacao/favorecido da
solicitacao em1366/390, build662 modulos/12,59s e docs697/19 aprovados.
Avisos preexistentes de Browserslist/chunk mantidos. Hashes do inventario e
delta dos tres runtimes conferidos no stage; nenhum lockfile/dependencia/schema.

Aplicador reaproveita snapshots e etapas do pacote DEV reabertura/favorecido,
agora com base a35a2139, delta exato dos tres runtimes e rejeicao de qualquer
alteracao backend fora do inventario. HEADs DEV antigos conhecidos podem ser
mantidos pelos overlays, mas conteudos aceitos sao somente hashes da base atual
ou da release. Conserva PROD4096, heap DEV, peers/Node/ambientes/daemon/dumps,
fiscal DEV e automatico OFF. Um restart backend-dev; resposta perdida nao repete
restart. QAs sem rede e teste de precisao backend-only no servidor.

Proximo passo: conferir commit publicado e SHA256; usuario executar o comando
manual --backend e --conferir; depois conferir frontend Vercel e homologar no DEV.
Main/producao continuam intocadas por esta publicacao. Nao acessar EC2 ou banco
real para fazer a conferencia pelo usuario.
