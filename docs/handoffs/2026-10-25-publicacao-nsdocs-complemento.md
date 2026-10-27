# Publicacao do complemento NSDOCS - 25/10/2026

Usuario autorizou primeiro commit/push em refactor/frontend, depois promocao main
com backend antes do frontend e comandos EC2. Agente unico, sem deploy/carga real.

## Refactor/frontend

Base 2920e1f1. Pacote inclui lista paginada/rolagem e complemento administrativo
com seus pre-requisitos historicos ja existentes em main. CLI PROD continua
recusando runtime/checkout/banco DEV. Nenhum caminho, credencial ou IAM DEV foi
substituido. O parser DEV recebeu a mesma correcao de pagina/compressao,
preservando seu restante. A migration historica copiada e pre-requisito dos QAs,
ja existente em main; nao executar migrations gerais no DEV por esse push.

Preservadas funcoes API/frontend e scripts especificos do DEV. Sem merge geral
da main. 152 testes Node (89 novo/historico/vinculos +11 base +19 manual +33
captura/setup DEV), navegador/3fusos/mobile e build13s aprovados.

## Main

Base 3fc61f14. Promover apenas o delta da correcao; os pre-requisitos historicos
ja existem. Backend em commit/push separado, sem frontend. Novo aplicador com
hashes, snapshot privado, quatro confirmacoes/timer e retorno: reinicia somente
backend-solicitacoes; sem schema/install/env/Node/dumps/NSDOCS/S3 ou dados fiscais.
Fonte original20capturas/46notas e plano/journal/credencial conferidos em leitura.
Atrasar frontend main ate receber prova BACKEND_PROD_PRONTO da EC2. Nao usar
aplicadores antigos nem reescrever manifestos historicos para permitir hashes.

## Retomada

Apos backend conferido, preparar complemento com novo ID e origem8e0a4179.
Descobrir1consulta, conferir totais/notas originais, completar enumeracao, entao
piloto1loteXML e restante. Guardar IDs e nao repetir planos. Roteiro em
ops/deploy/README-nsdocs-complemento-20261025.md. Automatico OFF.

outputs/ guarda evidencias e checkout auxiliar; nao incluir no Git.

## Recibo de publicacao refactor/frontend

Push confirmado: a26c1760d7e2fc00c5e0b37589ff622f34c22f49. Main sera publicada
primeiro com apenas backend/metadados; frontend local aguarda evidencia EC2.
93 testes na main (87 fiscais +6 operador), incluindo retorno interrompido,
restricao de frontend/migration/deps, locks e preservacao de timestamps.
Nao houve deploy EC2 ou carga real pelo agente.

## Backend main publicado e frontend retido

Backend:03c91cfeb290ad3d3535185083be011a5b96ae23, sem mudanca de frontend.
SHA256 operador:a506bf3bef44047b52dda181facbf26b4c39daa5fc38bcee79c5dedd182071e2.
Refactor:a26c1760d7e2fc00c5e0b37589ff622f34c22f49. Arquivos runtime da correcao
comparados byte a byte entre o pacote DEV e main (exceto scripts package por
branch). Inventario real de blobs staged aprovado e seis QAs do operador.
Frontend em commit local separado, reter push ate evidencia backend EC2.
Proximo comando do usuario:preparar03c91cfeb290ad3d3535185083be011a5b96ae23,
depois aplicar/conferir com quatro flags e backup/timer/janela conferidos.
Nao executar complemento antes do backend nem liberar UI main antecipada.

