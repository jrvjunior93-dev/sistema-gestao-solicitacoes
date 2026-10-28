# Publicacao DEV dos totais de Compras - 28/10/2026

## Autorizacao, bases e sequencia

Usuario autorizou commitar/push refactor/frontend e comandos manuais EC2 DEV.
Base6a1ebe6cfd52485ec1078975cd32274c9c95932b; branch local
codex/compra-direta-total-itens-20261028. Main2d6af625aff47f1592ae52d2448b9dc86a3c9c7e
fica intacta. Nenhuma EC2, registro real, migration ou reinicio pelo agente.

Publicar backend primeiro com frontend da base6a1ebe6c identico; preservar
frontend final em commit LOCAL seguinte ate COMPRAS_TOTAIS_BACKEND_DEV_PRONTO
manual. Ordem evita total divergente entre resposta nova e comparativo antigo.
Depois publicar frontend ja validado sem nova pergunta de autorizacao, pois
esta etapa ja foi pedida; conferir ref remoto e status Vercel.

## Pacote e preservacoes

Novo aplicador/teste/manifesto/README compras-totais-dev-20261028; anteriores
fechados intactos. RUNTIME2, delta desde6a1ebe6c; nao altera dependencias.
QA atualizado de cotacao nao compara strings JSX para calcular total: prova
helper/comparativo reais e UI e testada no navegador pelo novo QA especifico.
Assim o QA backend funciona antes da liberacao do frontend novo.

Instala arquivos por hash, preserva HEAD/index e guarda backup privado de codigo.
Confere Node isolado24.22.1, PROD4096, limite DEV e ambientes/pares/daemon/
systemd/dumps. Um restart backend-dev, sem update-env/save/resurrect/install.
Sem SQL externo ou escrita financeira/captura NSDOCS; automatico permanece OFF.
Flags CONFIRM_DEV_BACKUP=SIM e CONFIRM_COMPRAS_TOTAIS_DEV=SIM.

## Entregas funcionais

- Compra Direta: retirar valor calculado da forma unica; totais no bloco de
  itens, com desconto/frete e soma do credor separada quando necessario;
  valores editaveis de divisao entre varias formas/payload preservados.
- Resposta interna/publica e comparativo: mercadorias pela disponibilidade x
  preco. Tributos/desconto/frete conservados; pedidos/rateios/PDFs intactos.
- Handoffs locais2026-10-28-compra-direta-total-itens-local.md e
  2026-10-28-cotacao-total-disponivel-local.md registram regras e limites.
- Relato SC666 sem ofertas permanece em verificacao pelo operador; esta
  entrega nao restaura preco descartado de resposta marcada indisponivel.

## Validacoes e proximo passo

6 QAs backend PASS: envio cotacao, remanejamento, previsao entrega, entregas,
carregamento sem produto cartesiano e paginacao (8casos SQL/rota real).
8 testes do aplicador PASS; valida hashes/delta/preservacao4096/pares e retomada
sem restart duplicado. QA backend de cotacao tambem PASS usando JSX anterior
6a1ebe6c por leitura Git substituida na fixture, sem publicar frontend novo.
UI reais em1366/390 e build14.20s aprovados nos handoffs locais; runtime nao
mudou desde essas validacoes. Documentacao/sintaxe/diff e inventario Git
conferidos no fechamento antes do push. Sem necessidade de repetir QA amplo.

Entregar SHA/hash e comandos DEV. Apos saida PRONTO manual, publicar commit
frontend local, conferir Vercel e instruir recarga/homologacao sem escrita real.
Se operacao interromper, preservar estado/locks e receber codigo sanitizado;
nao remover estado, forcar Git ou repetir restart. Nao promover main neste fluxo.
