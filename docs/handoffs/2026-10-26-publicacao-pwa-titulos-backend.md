# Publicacao em duas etapas: PWA/titulos

Usuario autorizou migracao para main e atualizacao EC2 mesmo com carga pausada.
Confirmou backupDrivecifrado/timerativo e restart somente backend-solicitacoes.
Pedido mais recente: passar codigos EC2; aplicacao MANUAL pelo usuario.
Nao executar operador aplicar remotamente pelo agente nesta etapa.

Backend isolado em commit:1linha service permite titulo compra quando apenas
frete tem titulo ativo; compraPARCIAL ainda bloqueia duplicata. NovoQA comprova
pedidos distintos na mesma solicitacao, frete/compra parciais, replay e historico.
Operador/teste/manifesto/READMEbackend separados. 12testesmocked aprovados,
semSQL/migration/AWS/NSDOCS reais. Node/PM2/env/dumps e privados da carga protegidos.

Frontend candidato continua staged na branchcodex/promocao-pwa-titulos-main-20261025
emoutputs/worktree-promocao-pwa-titulos-main. Nao publicar antes da prova backend
retornada pelo usuario. QA19backend+3escopo+PWA/obra/vinculos/retirada/dossie/datas
+build655 passaram no preparo. Nao misturar scripts executor historico locais.

EstadoNSDOCS:361lotes concluidos,345pendentes,3529docs,46origens presentes,
1782XMLnovos/23reuso, parouporlimitehistorico. Monitor recorrente foi excluido.
Automatico continuaOFF. Plano/capturas/XML/historico mantidos; retomarapos
fix de limite/guardas em etapa separada. Avaliacao de automatico solicitada,
sem autorizacao para simplesmente ligar flags ou fazer chamadas novas.
