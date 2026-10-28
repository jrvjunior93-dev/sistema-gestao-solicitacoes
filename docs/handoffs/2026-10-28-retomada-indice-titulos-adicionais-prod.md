# Retomada da publicacao de titulos adicionais

## Evidencia e escopo

Operador executou conferir-indice.cjs e devolveu: fase atualizando, HEAD15a86635
preservado, hash bruto do indice diferente, staged0,23 arquivos selecionados,
13 originais/10 alterados para release,3 runtimes release, divergentes0 e fora
de escopo preservado. A afirmacao inicial de que a guarda precede a copia se
aplica somente a primeira chamada; o diagnostico demonstrou que a falha foi
na chamada posterior a instalacao parcial. Nao houve retorno de QA/restart.

## Implementacao

Novo retomador/testes/README em ops/deploy/retomar-prod-titulos-adicionais-20261028.
Reutiliza aplicador b4dc99d2 conferido por SHA256, em VM, sem o bootstrap CLI
original, expondo main e trocando apenas workingCheck pela guarda semantica.
Release/inventario/backup/modos/fontes/HEAD/delta/overlay continuam validados.
Compara indice stage0 (blob/modo/caminho) com arvore HEAD e rejeita flags que
ocultam arquivos, unmerged e alteracao durante leitura. Nao muda indice/HEAD,
nao altera estado para ignorar guardas, nao recompila outro pacote. O estado
original e atualizado somente pelo fluxo original de aplicacao autorizado.
QA precede restart unico; fase de restart incerto apenas observa. Hashes/env,
heap4096,DEV,Experience,NSDOCS OFF e historia mantem guardas originais.

## Validacao e limite

13 testes do retomador aprovados incluem comparacao semantica positiva/negativa, estado
real23 arquivos, backup corrompido/fonte desconhecida, main original em VM na
fase atualizando, QA falha sem restart, restart incerto sem repeticao e fase
aplicado sem acao. Fixture Git local comprova bytes/cache mudados com staged
inalterado e verifica leitura que nao regrava indice. Os17 testes originais
devem usar TITULOS_QA_COMMIT=b4dc99d2 para verificar o manifesto congelado, como
faz o proprio instalador: ownership/documentacao local posterior nao pertence
ao manifesto dessa release. Nenhum teste com EC2, banco ou processo remoto.

## Proximo passo

QA30/30, sintaxe/diff e docs664/19 aprovados. Publicar somente retomador/testes/README/handoffs/
ownership na main, dentro da promocao ja autorizada. Entregar hash e comandos
manuais aplicar/conferir do retomador. Nao repetir preparar e nao usar conferencia
original de bytes. Operador continua responsavel pela execucao EC2; agente nao
acessa EC2, nao altera registros e nao executa SQL real. Resultado remoto segue
pendente ate retorno PRONTO/aplicado/conferido do operador.
