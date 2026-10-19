# Promocao de datas e moeda dos cheques para main

Usuario homologou ambos os pacotes no DEV e pediu promocao main/comandos EC2.
Bases congeladas: main9e4faf4e75dbf9c59c01eaee742f125b4e5dd315 e
DEVe01e7bbf7ca35a99fa81f0ac387a5b6a23eb20a8. Integracao de historicos em
branch isolada a partir da main; sem acesso EC2 ou alteracao do DEV.

Bundle recuperavel da main anterior gerado/verificado fora da EC2, em outputs
privado (nao publicar no Git): main-antes-cheques-9e4faf4e.bundle, SHA256
74e12c11eb601c6cd326ccc9c0cca5da9e04c6bc708bbf03c2d36dac818344f5.

## Escopo

- Datas de cheque DD/MM/AAAA/ano4, ISO na API e erro somente ao confirmar/enviar.
- Preservar modal/dados do lote na falha; revalidacao, ACL e mutex intactos.
- Valores BRL no editor individual/lote; numero canonico na API/somas.
- Carteira somente leitura; datas antigas e titulos existentes nao regravados.
- Sem migration, dependencia, configuracao, permissao ou baixa automatica.

Cinco conflitos somente documentais conciliados preservando ambos os historicos.
Runtime backend/src/frontend/src e migrations identicos ao DEV homologado.
Scripts operacionais/hotfixes main preservados, sem substituir arvore pela DEV.

## Roteiro produtivo

ops/deploy/atualizar-producao-cheques-20261019.sh aceita SHA completo e exige
confirmacoes backup/timer, timer ativo, checkout main limpo, flock e ancestralidade.
Requer base main9e4 ja instalada; guardas existentes antes do merge conferem
PM2/watch/porta8000, banco/UUID/TLS, schema/12h/flags; nenhuma DDL e executada.
Confere ausencia de mudancas em migrations/dependencias e hash do .env antes,
durante e depois. Testes isolados e guardas antes do restart exclusivo do
backend-solicitacoes, health8000 e verificacao depois. Sem update-env, sem
reiniciar DEV ou executar regularizacao/cancelamento/baixa/push de teste.

Se qualquer guarda falhar, nao contornar: enviar log sem segredos. Se falhar
apos merge e antes do restart, processo antigo segue com watch desabilitado;
nao reiniciar manualmente antes de resolver a causa. Depois do restart, erro
de health requer diagnostico; rollback nao e automatico e nao executa down.
Recuperacao de codigo: SHA anterior9e4faf4e, compativel com mesmo schema,
em procedimento separado; preservar dados e nao executar comandos destrutivos.

## Validacoes e proximo passo

Homologacao manual DEV confirmada pelo usuario. Suites locais de
datas/ACL/rateio/carteira/composta/cartao, guardas produtivas, UI completa e
direcionada desktop/mobile, build, docs590/19 e sintaxe/diff aprovados.
Ownership liberado para commit/PR/merge autorizado. Backup recente de producao no
Drive cifrado e timer ativo confirmados especificamente pelo operador.

Apos publicacao, operador executa roteiro pinado. Aguardar Vercel e atualizar
pagina antes de conferir mascara, datas e preservacao do preenchimento.
Qualquer baixa real exige operacao financeira legitima, nao teste no deploy.
