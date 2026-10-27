# Publicacao DEV: consulta NF-e e Localizar pedidos - 2026-10-24

Usuario autorizou commit/push dos dois pacotes na refactor/frontend e comandos
DEV, garantindo backend antes do frontend, sem producao. Mesma autorizacao
permite publicar a segunda etapa apos conferir a saida EC2; nao pedir nova
autorizacao nem publicar antecipadamente porque o push pode disparar Vercel.

Backend: a78a5b1b0660366f030b1cb320907d199d1dcec6. Base100620bfadea0a1d67e8e38c7b51783276576731.
Commit backend contem25 arquivos do manifesto, sem frontend/dependencias/
migrations/lockfiles. Catalogo de navegacao backend inclui a nova rota.
O operador tambem aceita ultimo backend96a8daab, conferindo que a etapa
intermediaria100620bf so contem frontend. Sem reset/force ou merges fora do alvo.

Frontend: este segundo commit contem somente telas/servicos/QA frontend e
este registro; sem mudancas de codigo backend. Deve ficar local ate receber
NFE_PEDIDOS_BACKEND_DEV_PRONTO com o SHA backend acima e preservacao confirmada.

QA:16 testes de consultas backend,7 testes do operador, regressao de boletos,
ACL, autorizacao biometrica unica e vinculos; telas reais/HTTP local com SQLite
e dados ficticios, PDF nativo, XML, mobile, filtros/paginacao/CSV e erros seguros.
Buildfrontend passou. Nenhum DB/AWS/NSDOCS real usado no QA; sem install.

Roteiro de atualizacao e homologacao:
ops/deploy/README-nfe-pagamentos-pedidos-dev-20261024.md.
Usuario executa operador na EC2 DEV e envia saida segura; o agente nao fez
SSH/deploy/restart/migration. Ao confirmar, publicar este commit por refspec
somente para refactor/frontend, sem force. Verificar main permaneceu
a860f94afc4de69499a169a8439a8e2297f507d5.

Apos frontend liberado, atualizar DEV/PWA e conferir SHA window.__FLUXY_BUILD__.
NF-e aparece como consulta atual, separada do material assinado. Visualizacao
nao exige nova biometria nem cria decisao/fila/baixa. Usar titulo ja na fila
para testar o modal de arquivos; nao autorizar/enfileirar so para testar leitura.
Relatorio em Compras > Relatorios > Localizar pedidos; combinar filtros e CSV.

Ownership e handoffs/ops Node anteriores contem trabalho de outras etapas e
ficaram fora destes commits. Outputs de QA/evidencias nao foram publicados.
