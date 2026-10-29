# Retomada PROD dos destaques — arquivo novo instalado separadamente

Release funcional permanece998b78bd377a82776a4280bd76e78553f173c9c7.
Preparo bloqueou antes de instalar/reiniciar com RUNTIME_FORA_ESCOPO. Operador
confirmou HEAD15a86635 e unica diferenca contraBASE39f4e719:
Git mostra D para backend/src/services/compraTitulosAdicionaisService.js,
mas arquivo existe e temSHA256
922ed26be5ffdae4b55634678f115e55c7b45e20304ecc54e7da87ed70096672,
identico ao blob da base. E o arquivo novo instalado por pacote anterior, ainda
nao rastreado no indice do HEAD antigo. Git diff nao o trata como rastreado.

`retomar-prod-destaques-solicitacoes-20261029.cjs` carrega o aplicador original
por commit/SHA256 fixos e altera em memoria somente a guarda do delta. Excecao
para esse caminho: pais sem symlink; arquivo regular, unico link, ubuntu,
nao gravavel por qualquer usuario, hash exato e ls-files vazio. Nenhuma outra
diferenca e permitida. O arquivo nao e adicionado ao indice nem sobrescrito.
Guardas originais de HEAD/index, hashes/modos, fora de escopo, snapshots, flags,
Node/heap4096, PROD/DEV/Experience, NSDOCS, locks e restart unico permanecem.

Comandos via stdin do novo wrapper em todas as tres etapas:
preparar, aplicar e conferir. NAO usar o aplicador original instalado diretamente
para conferir esta retomada, pois ele conserva a guarda antiga. Novo wrapper
nao e instalado sobre o aplicador congelado; manifesto/release intactos.
Somente os dois runtimes de destaques previstos no pacote original sao instalados.
Sem SQL real, migrations, novos titulos, baixas, install ou PM2 update/save.

O chat fornece o hash novo que contem o wrapper. Git fetch antes de ler o wrapper;
usar NodePROD24.22.1 no checkout main e mesmas4confirmacoes de backup/timer/janela/
destaques. Backup deve estar confirmado e timer ativo. Funcional continua998,
logo output de sucesso reporta esse commit. Wrapper funciona tambem se o preparo
original ja estiver salvo na mesma versao, desde que suas guardas permaneçam.
Nao apagar estado/locks nem executar gitadd/reset/pull para contornar bloqueios.

Testes locais:5casos negativos/loader/guarda/excecao com fonte congelada;17casos
do aplicador original executados comDESTAQUES_QA_COMMIT=998... para ler seus
proprios blobs imutaveis. Nenhuma EC2 ou banco acessado pelo agente.

## Retomada apos instalacao - indice 29/10
Usuario confirmou fase atualizando e todos os nove arquivos VERSAO_NOVA.
HEAD15a86635 preservado e stage vazio. Indice bruto mudou de8449d34c... para5f612dd8...
A guarda aceita somente esse par completo recebido, release998, HEAD15 e fases
posteriores ao preparo. Exige diff cached raw vazio contraHEAD e nenhum conflito.
Nao modifica indice nem estado.index. Demais hashes continuam bloqueados.
Executar apenas aplicar e conferir pelo wrapper atualizado; nao preparar novamente.
Testes:6da retomada e17do aplicador congelado aprovados. Sem EC2/banco pelo agente.

## Correcao definitiva da comparacao do indice
Substitui a restricao ao hash bruto atual: esse hash nao e identificador estavel
somente de conteudo. Mantem HEAD15/release998/indice original8449/fases pinados.
Compara integralmente ls-files --stage -z com ls-tree -r -z HEAD: mesmos caminhos
binarios, modos e objetos Git, estagio zero; inclui deteccao de intent-to-add,
conflitos, inclusao/exclusao e chmod. Confere indice estavel durante a leitura.
Nao grava indice ou estado.index. Mantem todas as guardas de fontes/processos.
24testes locais aprovados incluindo indice real do repositorio e casos negativos.
Retomar somente aplicar/conferir pelo wrapper novo. Sem EC2/banco pelo agente.
