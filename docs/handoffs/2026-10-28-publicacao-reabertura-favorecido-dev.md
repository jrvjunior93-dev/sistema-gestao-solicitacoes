# Publicacao DEV reabertura/favorecido - 28/10/2026

Usuario autorizou commit/push refactor/frontend e comandos manuais EC2 DEV das
duas correcoes locais. Sem EC2 pelo agente ou registros reais. Base DEV6701ee7b;
main remotaece109c9 preservada. Branch codex/reabertura-favorecido-dev-20261028.
Fonte local dae526f1 em codex/reabertura-favorecido-origem-main-20261028, nao
publicada na main. Transposicao seletiva mantem recursos fiscais exclusivos DEV.

## Arquivos e comportamento

Backend apenas pedidoCompraService.js, helper da reabertura: consulta titulos
existentes do mesmo resumo/botao em vez de contar vinculos historicos. Nenhum
vinculo e apagado. Titulo existente, inclusive cancelado/estornado sem exclusao,
mantem GEO. Motivo/ACL/locks/transacao/historico/replay preservados.

Frontend FinanceiroTituloNovo.jsx e FinanceiroCard.jsx, sem mudanca de APIs:
PIX ativo vazio, credor apenas por escolha, limpar/trocar sem dados antigos,
consulta atrasada nao desfaz digitacao, origem solicitacao/medicao preservada.
Edicao de titulo existente intacta. Frontend e independente da atualizacao do
backend; a correcao de reabertura entra na EC2 apenas quando operador aplicar.

Novo operador/teste/manifesto/README atualizar-dev-reabertura-favorecido-20261028
confere PROD4096, preserva DEV/Experience/Nodes/envs/daemon/dumps/HEAD e reinicia
so backend-dev. Backup de codigo e QAs offline antes do restart. Sem SQL,
migration, install, captura fiscal ou operacao de reabertura/favorecido na
instalacao. Gravacoes normais somente por acao dos usuarios.
Manifestos fechados anteriores nao sao alterados.

## Proximo passo

Conferir push e statuses Vercel; entregar SHA/hash e comando do README.
Operador executa com backup DEV conferido e devolve PRONTO. Nao reiniciar
producao ou repetir restart manual se falhar. Homologar DEV antes de eventual
promocao main, nao autorizada neste turno. Handoffs funcionais de 27/10
(favorecido) e 28/10(reabertura) acompanham esta publicacao.

## Validacao da base DEV

Cinco QAs backend sob semRedeQa e oito testes do aplicador aprovados.
Card/Novo1366/390, PIX/Copia e Cola, payloads e tela de reabertura1366/390
aprovados com services/APIs ficticios. Build20.93s, docs685MD/19canonicos,
sintaxe/diff e equivalencia funcional com a fonte local conferidos.
Backend/src muda somente pedidoCompraService.js. Modulos fiscais, dependencias,
package scripts e manifestos antigos sem delta. Nenhum teste no banco real.
