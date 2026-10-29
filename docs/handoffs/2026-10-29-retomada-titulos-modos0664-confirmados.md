# Retomada PROD: preservacao dos16 modos0664 confirmados

## Evidencia recebida

Diagnostico manual conferir-modos.cjs de SHA418b4cb6b44869ca0e68cee93b183e6eebec89e40f55889106c78d8bc07a3679:
phase atualizando;23 arquivos;16 com0664 registrado/atual e sete0644; todos
existentes, regulares e ubuntu; estado_preservado=true, sql/escritas/reinicios0.
O erro MODO_NAO_REVISADO vinha da regra criada no retomador. A correcao anterior
so considerou modos restritos sem a evidencia completa; nao foi suficiente.

## Correcao limitada e testavel

LEGACY_GROUP_WRITABLE lista exatamente os16 caminhos do diagnostico. Aceita0664
apenas com caminho nessa lista, base preexistente, hash/backup conferidos e
arquivo atual regular (sem symlink/hardlink), uid1000 e mesmo modo0664 sem
bits especiais. SourceStat vem do fs.lstatSync do aplicador congelado. Nao e
liberacao generica de grupo writable: novos e demais caminhos permanecem
restritos. Nao executa chmod, nao muda mode no estado, nao altera indice/HEAD.
Aplicador/manifesto/runtime b4dc99d2 congelados, SQL/registro real0, Node4096,
DEV/Experience/env/dumps/NSDOCS OFF e QA/restart unico mantidos.

Fixture sanitizada em ops/deploy/fixtures/titulos-adicionais-modos-20261029.json
contem apenas caminhos relativos/modos/regularidade/dono, extraidos do JSON
do operador. Nenhum conteudo de arquivo, backup, credencial ou dado financeiro.
Os testes exercitam estado23 com16 modos0664 e sete0644, main original em VM,
QA falha, restart incerto, recusa de modo/dono/link/tipo divergente e0664 fora
da lista/arquivo novo. Nenhuma consulta remota ou escrita de negocio pelo agente.

## Proximo passo

34 testes PASS (17 retomador e17 originais), sintaxe/diff e docs667/19 PASS.
Publicar somente retomador/teste/fixture/
README/handoffs/ownership na main dentro da promocao autorizada; entregar hash
novo e mesmos comandos manuais aplicar e conferir. Nao repetir preparar nem
remover estado/locks. Resultado remoto ainda depende do operador. Usar sempre
o retomador atualizado para conferir essa release, sem EC2 direta pelo agente.
