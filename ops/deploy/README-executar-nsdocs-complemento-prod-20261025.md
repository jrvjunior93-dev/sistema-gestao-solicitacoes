# Implantacao do complemento NSDOCS em producao

Codigo primeiro publicado em refactor/frontend, depois promovido para main em
etapas. A EC2 DEV nao participa destes comandos. Nao usar git pull generico,
operadores antigos ou a ponta futura do frontend para atualizar o backend.

## Backend antes do frontend

No CMD Windows, usar o checkout retirada-envios-main-20261024/Fluxy e conferir
SHA256 de ops/deploy/atualizar-prod-nsdocs-complemento-20261025.cjs. A resposta de
publicacao fornece o hash e SHA completo de BACKEND que devem ser usados.

1. Enviar o operador por stdin, Node PROD isolado, cwd raiz do checkout main,
   argumentos `preparar SHA_BACKEND`. Esta fase busca origin/main e guarda
   snapshot privado de codigo, sem avancar checkout/reiniciar/migrar/importar.
2. Aguardar NSDOCS_COMPLEMENTO_PROD_PREPARADO. Conferir backup recente no Drive
   cifrado e timer ativo; reservar janela breve para reinicio do backend PROD.
3. Enviar mesmo operador por stdin, argumento `aplicar`, com as quatro flags:
   CONFIRM_PROD_BACKUP=SIM, CONFIRM_PROD_BACKUP_TIMER=SIM,
   CONFIRM_PROD_MAINTENANCE=SIM, CONFIRM_NSDOCS_COMPLEMENTO_DEPLOY=SIM.
4. Rodar operador salvo no checkout com argumento `conferir`. Enviar saida antes
   de publicar frontend. Resultado esperado:
   NSDOCS_COMPLEMENTO_BACKEND_PROD_PRONTO, source_documents_preserved46,
   sem_migration/sem_install, peers preservados e frontend_liberado=false.

O operador valida base3fc61f14, inventario/hashes/ausencia de frontend e migrations,
dependencias iguais, Node24.22.1 absoluto, processos, ambientes/dumps/unidade
PM2 e locks de carga. Confere TLS/UUID/schema e20capturas/46NF-e originais em
transacao somente leitura, antes/depois. Hash fiscal inclui horarios do historico.
Roda87QA isolados sem credenciais e auditorias. Reinicia SOMENTE
backend-solicitacoes por pm_id usando Node do daemon isolado, sem update-env.
Verifica cinco healthchecks consecutivos e preservacao dos outros dois apps.

Nenhuma migration, npm install, NSDOCS, S3, IAM, chave, .env, dump, Node global,
PM2 save/update/resurrect ou escrita de dados fiscais e executada no deploy.
Fonte DEV, Experience e daemon devem manter seus PIDs/ambientes/Nodes.

## Retorno

Antes de qualquer captura ativa, executar o MESMO operador por stdin com
argumento `voltar` e as mesmas quatro flags. Restaura somente fontes anteriores,
reinicia apenas backend-solicitacoes e desativa a entrada nsdocsProdComplement.js.
Novos modulos ficam inertes; nao executa mais o CLI novo com parsers antigos.
Planos/manifestos privados, notas/XMLs/historico e dados nao sao removidos ou
restaurados. HEAD mantido; arquivos tracked alterados/delecao da entrada sao
esperados. Retorno interrompido pode ser retomado, aceitando somente hashes
anteriores/novos conhecidos. Nao usar reset/clean/pull para encerrar retorno.

## Frontend

Commit separado preparado localmente. Publicar na main SOMENTE depois da saida
de backend pronto/conferido. Vercel publicara a lista com paginas/rolagem e50
documentos por consulta no endpoint existente. Nao requer outro restart EC2.

## Complemento manual depois do backend

Seguir README-nsdocs-complemento-20261025.md. Preparar novo UUID com origem
8e0a4179-506a-4670-88a2-d9079728e263; descoberta piloto1GET, conferir totais e
source_documents_missing=0, completar enumeracao e congelar snapshot. Entao
pilotoXML1lote e restante em lotes pequenos. Automatico segue desligado.
Nao repetir o plano antigo ou refazer as46notas para resolver a diferenca.

Usar SSH com ServerAliveInterval=30/ServerAliveCountMax=6 nos comandos Windows
para detectar/reduzir conexoes abandonadas. O CLI imprime progresso por lote;
os checkpoints e IDs permitem retomada mesmo se a conexao cair. Antes de uma
nova execucao, conferir processos e locks; nao iniciar cargas simultaneas.
