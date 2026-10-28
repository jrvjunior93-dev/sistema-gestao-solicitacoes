# Promocao MAIN: reabertura com titulos excluidos

Usuario autorizou migrar somente esta correcao, testar e publicar na main e fornecer
comandos para aplicacao manual na EC2. Sem acesso EC2 pelo agente, sem alteracao de
registros, preservando historico, Node4096 e DEV. Pedido relatado PC-00237,
SC-00612/SOL-6349; nenhuma excecao por ID ou operacao real nesse pedido.

Base main15a86635 (precisao decimal de outro chat). Fonte funcional homologada em
DEV2b1d3e7a. Somente assertPedidoPodeReabrirDiretamente muda no runtime: usa
buscarTitulosPedido com transacao e legados, igual ao resumo/botao. DefaultScope
exclui titulos com deleted_at; vinculos antigos nao bloqueiam sozinhos. Titulos
existentes continuam exigindo GEO mesmo quitados, cancelados ou renegociados.
Nenhuma exclusao de historico, titulo, alocacao ou frete e introduzida.

QA de exclusao logica usa financeiro canonico e SQL SQLite :memory:, mais harness
de reabertura/controller/ACL/transacao/auditoria/entregas/replay. O harness aceita
decimalCompras quando instalado; nao adiciona dependencia decimal ao legado.
Instalador manual seletivo em ops/deploy/atualizar-prod-reabertura-20261028.cjs.
Manifesto fechado e variantes revisadas para117e34a4/d6e3cc1e/15a86635; somente
bloco da guarda e substituido na EC2. HEAD e indice conservados. Nova publicacao
de precisao deve reconhecer overlay, sem sobrescrever correcao por pacote antigo.

Testes do instalador cobrem snapshot PM2 completo, flag4096/titulo PM2/metadata,
ambientes peers e dumps, retomada sem segundo restart, fase de QA antes de restart,
hashes variantes e preservacao byte a byte fora da funcao, rejeicao de origem
desconhecida/alterada, instalacao parcial em fixture e baseline reproduzindo defeito.
As12 suites backend/regressoes passaram na main com precisao decimal, assim como
os16 testes do instalador. Uma replica local da fonte117e34a4 recebeu apenas o
overlay e passou nas seis suites do pacote e nos16 testes do aplicador, lendo o
manifesto da release Git (o runtime legado difere intencionalmente da main).
Docs660/19, sintaxe e diff conferidos. Relatorios locais em outputs/reabertura-main-20261028,
fora do commit; a replica usa NODE_PATH do backend local, sem instalacao ou rede.
Nenhum frontend, migration, install, SQL real, deploy remoto, PM2 real, documento
financeiro ou operacao de reabertura foi executado pelo agente.

Proximo passo: operador executar preparar/aplicar/conferir com commit publicado e
SHA256 do aplicador. Aguardar resultado sanitizado e validar tela; nao reabrir por
SQL, apagar locks ou repetir restart em resposta incerta.
