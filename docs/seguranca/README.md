# Seguranca

Documentos de seguranca operacional e riscos tecnicos relevantes.

## Transporte do frontend

O interceptador de fetch so injeta sessao, CSRF, auditoria e cookies na origem
exata configurada em VITE_API_URL e na fronteira do caminho da API (ou /uploads
legado). Comparacao usa URL, incluindo protocolo/porta, sem prefixos de hostname.
URL relativa e resolvida contra a pagina, nao contra a API. Request/URL sao aceitos;
headers explicitos, body, signal e opcoes da chamada da API permanecem.

Destinos externos, inclusive S3, usam credentials=omit e nao recebem Authorization,
Proxy-Authorization, X-CSRF-Token, X-Audit-Session-Id ou Cookie, nem mesmo se
authHeaders tiver sido passado por engano. Demais headers e query de assinatura
permanecem. Respostas externas nao atualizam CSRF nem disparam eventos financeiros.
Redirects autenticados da API sao error (ou manual, se solicitado) para impedir
que CSRF/auditoria acompanhem um Location externo. Links de arquivo sao devolvidos
em JSON para uma segunda operacao, nao como redirect da chamada autenticada.

Teste: frontend npm run test:fetch-credenciais. O teste de navegador de download
tambem verifica isolamento e redirect com servidores locais, sem dados reais.
