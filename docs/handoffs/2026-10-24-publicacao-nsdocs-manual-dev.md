# Publicacao consulta manual NSDOCS v2 - DEV

## Autorizacao e base

Usuario autorizou commit/push para refactor/frontend, comandos de atualizacao DEV
e configuracao de chave por entrada oculta, mantendo automatico desligado e sem
producao. Agente nao deve acessar EC2, chave ou API real. Base remota f2167ff7
conferida por fetch; main a860f94a sem alteracoes para esta publicacao.

Worktree ativo promocao-financeiro-20261019/Fluxy, branch local de preparacao
codex/retirada-envios-dev-20261023. Push direcionado para HEAD:refactor/frontend,
sem force/main. Ownership misturado e scripts locais de Node/outputs preservados
fora do commit. Agente unico.

## Inventario

Delta funcional e18 testes descritos no handoff
`2026-10-24-nsdocs-v2-consulta-manual-dev.md`: novos modulos manual/*, CLI,
normalizador com IDs opacos seguros e documentacao. Sem mudanca adicional de
funcionalidade durante a publicacao.

Adicionados operador `ops/deploy/atualizar-dev-nsdocs-manual-20261024.cjs`, seus6
testes e README; este handoff e segundo script QA no backend/package.json.
Inventario exato de17 arquivos e package guardado; sem deps, migrations, frontend,
rotas ou permissoes novas. Nunca importar operador offline anterior como dependencia
de um node -: ele tambem possui entrada standalone para stdin.

## Garantias do roteiro

Somente fast-forward do f2167ff7 para alvo publicado e QA. Nenhum restart, chave,
install, migration, .env, Node, PM2 save/update/resurrect ou chamada NSDOCS. PM2 e
usado somente com jlist e Node isolado do daemon ja existente. Snapshots dos tres
processos/Node24.22.1/ambientes e hashes de dumps/unidade/runtimes conferidos antes
e depois; health local PROD e DEV somente lido.

Config/flags/TLS/UUID DEV em transacao READ ONLY antes e depois. Apos QA, CLI lista
empresas locais em READ ONLY/rollback para usuario identificar ID/CNPJ. O operador
nao acessa credentials.json e nao imprime ambiente/erros brutos.

Chave e configurada em segundo bloco, interativo, com ID digitado (nao secreto)
e prompt oculto para segredo. Guardas de checkout/UID/Node/DB/CNPJ e arquivo600
fora de Git/PM2 permanecem. Automatico segue false; configurar/conferir faz0 GETs.
Primeira consulta externa fica para execucao manual explicita pelo usuario.

## QA de publicacao

-18 testes manuais +11 base offline aprovados, sem rede ou banco reais.
-6 testes do novo operador: inventario/package, flags/snapshots, lista sanitizada,
  orquestracao real em VM sem restart/setup/API e falhas de etapa/preflight/QA/peer.
-Regressao ACL financeira, sintaxe JS/Bash dos exemplos e diff/inventario
  conferidos antes do commit. Nao executado app/server/EC2/NSDOCS/MySQL real.

## Proximo passo

Usuario executara o operador pinado pelo SHA completo e enviara resultado. Depois
configura a chave no prompt oculto e confere instalacao, sem enviar segredo/arquivo.
Nao aplicar operador antigo, migration ou restart para este pacote. Se alguma
guarda reprovar, interromper; nao atualizar outras etapas silenciosamente.
Sem rollback automatico: falha apos ff deixa arquivos atualizados e processos
sem reinicio. Homologacao real/consumo/escopo da chave ainda nao comprovados.
