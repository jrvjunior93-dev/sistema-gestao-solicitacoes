# Retomada titulos PROD: modos herdados

Operador executou retomador de hash44d30bb8 e recebeu
TITULOS_ADICIONAIS_PROD_RETOMADA_MODO_NAO_REVISADO. Nao retornou QA nem restart.
A guarda falhou em validateState, antes da instalacao/testes/reinicio dessa
invocacao. Nao houve acesso remoto pelo agente.

## Correcao limitada

O aplicador congelado b4dc99d2 salva mode existente mascarado0777, ou0644 para
arquivo novo, e usa esse modo na instalacao. O retomador exigiu0644 para todos,
o que rejeita indevidamente permissoes mais restritas, sem motivo funcional.
Agora safeSourceMode aceita somente inteiro entre0 e0644, com leitura do dono
e nenhum bit fora de0644. Aceita0600,0640 e outros subconjuntos seguros;
rejeita escrita de terceiros, execucao, specialbits, truncamento32bits,
strings e valores malformados. Nao aplica chmod nem altera mode no estado.

Mesma release/manifesto/backups/inventario, hash de fonte original ou alvo,
HEAD/indice semantico/overlay, heap4096/DEV/Experience/NSDOCS OFF/QA/restart
unico continuam protegidos. Nenhum runtime de negocio, migration ou registros
alterados pelo agente. Alteracoes apenas retomador/testes/README/ownership e
este handoff. A permissao efetiva remota nao foi inferida; qualquer modo que
nao seja subconjunto seguro continua interrompendo para revisao.

## Validacao e proximo passo

Fixture dos23 arquivos passou a representar arquivos existentes0600 e novos0644.
Testes positivos cobrem todos os8 subconjuntos com leitura do dono e validam
que estado/backups nao sao normalizados. Negativos cobrem modos sem leitura,
gravacao de terceiros, execucao, bits especiais, numeros grandes e nao inteiros.
31 testes aprovados (14 retomador e17 congelados), sintaxe/diff e docs665/19
aprovados. Publicar correcao na main dentro da promocao autorizada e entregar novo SHA256
e os mesmos comandos manuais aplicar/conferir. Nao repetir preparar ou apagar
estado/locks/indice. Agente nao acessa EC2, nao executa SQL ou restart remoto.
