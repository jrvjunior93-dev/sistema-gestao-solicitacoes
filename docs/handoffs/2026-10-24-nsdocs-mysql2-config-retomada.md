# Retomada NSDOCS manual - compatibilidade mysql2

Usuario recebeu Node1 apos os quatro QAs do operador356af018. Codigo ja atualizado
no DEV, sem mensagem de sucesso e sem chave configurada. Continuidade do mesmo
pedido de publicacao DEV, preservando producao, portas, .env, automatico e PM2.

## Causa reproduzida sem rede

mysql2/lib/connection_config.js normaliza `ssl.rejectUnauthorized` ao construir
configuracao. O runtime passava diretamente Object.freeze de getRdsSsl; o driver
real lancava TypeError antes da conexao. O preflight usava objeto novo e passava.
Os testes com factory mysql ficticia nao simulavam essa normalizacao.

Correcao: runtime passa `{ ...getRdsSsl() }`. O preset e os certificados pinados
continuam imutaveis e validados; a copia compativel conserva os tres parametros
de TLS. Nao remover freeze do preset ou flexibilizar autenticacao TLS.

## QA e melhoria de diagnostico

Teste do runtime ainda isola conexao/SQL/OS, mas agora executa o construtor real
de configuracao mysql2 instalado sobre as opcoes produzidas pelo runtime, sem
abrir socket. Verifica preservacao de CA, rejectUnauthorized e verifyIdentity.

Operador aceita HEAD356af018, usa mesmo inventario fechado cumulativo (agora21
arquivos desdef2167ff7) e emite marcador apos preflight de leitura. Se a listagem
reprovar, mostra somente LISTAGEM_EMPRESAS_DEV_FALHOU_SEM_EXIBIR_DADOS.
Nova regressao testa falha de listagem e retomada356af018 sem restart.

19 testes manuais +11 base +10 operador aprovados; ACL financeira e sintaxe/
inventario/diff conferidos. Nenhum banco/API/EC2 real acessado pelo agente.
Sem chave real, install, migrations, restart, SSL global/PM2/env/dumps/Nodes ou
firewall alterados. Scripts antigos/outputs/ownership misturados fora do commit.

## Proximo passo

Publicar apenas este ajuste na refactor/frontend e usar novo SHA do operador,
sem repetir o bloco antigo que fixa356af018. Usuario confirma mensagem de sucesso
e usa setup TTY com SHA atualizado. Nao afirmar homologacao real antes do retorno.
