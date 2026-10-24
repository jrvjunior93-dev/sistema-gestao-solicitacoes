# Etapa final: vinculo cadastral e frontend NF-e

Backend b5e34d7b e migration002 foram implantados pelo usuario. O corte fiscal
S3 PROD foi aplicado e persistido; Put/Get, versao, hash e URL assinada foram
testados com um objeto ficticio privado. DEV, Experience e Nodes preservados.
Nao repetir migrations, testes de gravacao ou reinicios para esta etapa.

## Vinculo cadastral pendente

O cadastro fiscal PROD1 deve apontar para a empresa operacional PROD1, ambos
com CNPJ27123008000100. O id2 usado no DEV nao deve ser copiado para producao.
A tela atual de empresas fiscais nao oferece o campo de vinculo operacional.

1. Abrir https://csc.jrfluxy.com.br/fiscal/empresas com usuario autorizado a
   configurar empresas fiscais.
2. Abrir F12 > Console do navegador. Nao executar JavaScript no CMD, SSH ou Node.
3. Copiar o conteudo completo de
   `ops/deploy/vincular-empresa-fiscal-prod-20261024.browser.js`, colar no Console
   e executar uma vez. Nao copiar tokens, cookies, chaves ou arquivos .env.
4. Enviar somente o resultado sanitizado VINCULO_FISCAL_PROD_CONFERIDO ou
   VINCULO_FISCAL_PROD_INTERROMPIDO. Se interromper, nao contornar validacoes.

O snippet confere origem PROD/wrapper autenticado, CNPJ e empresas ativas.
Envia PATCH apenas empresa_id1, reconsulta e verifica campos fiscais preservados.
Usa permissoes, CSRF e auditoria da API existente, com lock e replay sem novo
PATCH. Nao executa SQL, NSDOCS, migracao, geracao de titulo ou alteracao financeira.

## Frontend preparado, ainda sem publicacao

Branch local codex/nfe-frontend-liberacao-20261024, a partir dos operadores S3
0d98a6dc sobre main b5e34d7b. Os26 arquivos frontend/catalogo foram copiados
pelos hashes do manifesto, sem trazer backend ou criacao de titulos do DEV.

QA aprovado: emissao civil/historico, vinculos multi-pedido/multi-solicitacao,
dossie/fila, permissoes negativas, links assinados sob demanda, confirmacao
biometrica preservada, baixas parciais, relatorio/filtros/paginacao/CSV/mobile,
build e manifesto. Snippet testado localmente com API simulada, sem escrita real.

Depois da prova do vinculo, conferir main remota sem divergencia e publicar o
SHA exato da etapa frontend. Conferir a implantacao Vercel antes de homologar.
Nao e necessario novo pull/restart na EC2 para servir esta interface.

Homologacao: NF-e vinculada no pedido/titulo, consulta no dossie e arquivos da
fila, XML/DANFE quando disponivel, restricao por usuario/obra, historico e baixas
parciais. Em Localizar pedidos, combinar descricao, SOL/SC/PC/numero externo,
fornecedor/CNPJ, item, obra, status, datas e valores. Nao habilitar automatico NSDOCS.

Se o frontend precisar voltar, usar a implantacao Vercel anterior. Preservar
backend/schema/vinculos/historico e configuracao fiscal PROD; nao executar down,
restaurar dumps inteiros ou reativar bucket DEV em producao.
