# Promocao MAIN: liberacao de criacao adicional de titulos

Usuario confirmou TITULOS_ADICIONAIS_BACKEND_DEV_PRONTO para720d4acd, com15
QAs/backend e aplicador aprovados, SQL/migrations/business/financial_data_writes0,
PROD4096 e DEV preservados. Autorizou migrar a funcionalidade para main, testar
e fornecer comandos manuais de producao. Sem acesso EC2/SQL/banco real pelo agente.

## Integracao

Base main ade6e6dc. Aplicado o patch local isolado dfd3a9b1 que originou DEV720d4acd;
tres runtimes financeiros identicos ao DEV homologado. Nenhum merge geral DEV,
alteracao de pacote/dependencia/schema ou promocao de favorecido/PIX alheia.
PedidoCompraService.js com reabertura e precisao atuais nao e modificado.
Frontend possui somente botao de nova criacao e guardas/chaves de envio.

Funcionalidade conforme handoff2026-10-28-criacao-adicional-titulos-compras-local.md:
novas obrigacoes intencionais, sem substituir titulos e baixas anteriores;
persistencia da chave/payload/IDs no evento normal da SC sob lock; chave do pedido
mantida no vinculo; mesmo envio retorna anterior. Permissoes, parceiro, categoria,
fechamento/adocao, parcelas e fretes continuam validados. Nao se dispensou GEO
para reabrir pedido com titulo existente. Novas criacoes nao sao executadas no deploy.

## Aplicador de producao

Novo atualizar-prod-titulos-adicionais-20261028.cjs, teste, manifesto e README.
Reutiliza snapshots/locks/restart do aplicador PROD de reabertura confirmado pelo
operador. Reconhece HEAD15a86635 com overlay de reabertura ade6e6dc, ou HEADade6e6dc.
Tres runtimes precisam da fonte base exata; nao copia pedidoCompraService.js ou
promove precisao por arrasto. Confere diff de backend/src contra a base main e
hashes dos arquivos alterados fora do inventario; preserva HEAD/indice/overlays.

Backup privado de codigo, inventario fechado e modo/owner/links conferidos.
QA sem rede, SQL apenas SQLite :memory:, precisao backend-only no servidor.
Backup/timer/janela e confirmacao especifica exigidos antes de aplicar. Um restart
somente de backend-solicitacoes; retomada de resposta incerta nao repete restart.
Preservar PROD4096, heap DEV, demais processos/Node/env/daemon/dumps, automatico OFF,
planos/historico/XMLs. Nenhuma migration, gravacao financeira, install ou chamada S3.

Validacao final MAIN: tres runtimes identicos ao DEV720d4acd;15 suites backend,
17 testes do aplicador (snapshot completo PM2,4096, overlays/indice e instalacao
em fixture), UI pedido/SC com busy/retry/chaves/ACL e regressao de atualizacao da
SC em1366/390 aprovados. Build662 modulos/11,25s, docs662/19 e diff aprovados.
QAs e logs locais em outputs/publicacao-titulos-adicionais-prod-20261028; sem
execucao remota ou banco real. Manifesto do stage deve coincidir com os bytes Git.

Frontend e compativel com o contrato anterior; push main pode seguir Vercel. O
servidor antigo conserva os bloqueios ate a aplicacao manual do novo backend.
Depois de preparar/aplicar/conferir, usuario envia saida sanitizada e valida a tela.
Nao fazer SQL corretivo, criar titulos, remover locks ou forcar Git para homologar.
