# Reorganização reversível de solicitações de compra

Estado em 26/10/2026: implementação e testes **locais**, sem commit/push, instalação, migration aplicada ou cancelamentos. Branch `codex/sc-cancelamento-reversivel-20261026`, base `f429b6f22b78779fc2a1277a797323512aeea7c7`. A EC2, o DEV e a produção não foram acessados pelo agente nesta etapa.

## Fluxo e limites

1. Preparar o manifesto local e revisar SC, solicitação principal, cotação, pedidos, quantidades e motivo.
2. Simular pela API autenticada no ambiente escolhido. A resposta mostra o que está pronto ou bloqueado e calcula hashes dos dados atuais; não cria journal nem altera compras. O middleware normal de autenticação pode registrar atividade e eventos de segurança.
3. Revisar a simulação, guardar seu arquivo e escolher um UUID de lote. Aplicar somente as SCs aprovadas; cada requisição aceita até 10, processadas em série, com uma transação por SC.
4. Conferir o resultado individual e o estado do lote. Um conflito numa SC não desfaz as demais SCs que já concluíram.
5. Para desfazer, simular a reversão de uma SC, várias SCs ou do lote inteiro; revisar e então reverter as selecionadas. O histórico antigo é mantido e ganha outro evento de reversão.

Não existe execução recorrente, executor em segundo plano, integração NSDOCS ou novo botão de cancelamento em massa no frontend. O operador é uma CLI HTTP manual. Ela não abre banco, carrega `.env`, executa SQL, migrations, SSH ou reinicia processos. O backend faz as gravações normais da operação, sob a sessão e as permissões do usuário.

### Cancelamento total

Somente SC sem pedidos e sem títulos não excluídos. As opções de cancelar cotação e solicitação principal são explícitas. O manifesto desta revisão seleciona ambas para as 71 SCs do grupo total. Outras SCs na mesma principal impedem a operação. Itens da SC, anexos, documentos fiscais e histórico não são apagados.

### Cancelamento parcial

Há duas alternativas, **mutuamente exclusivas por SC**:

- `saldo.json`: encerrar somente o saldo da cotação ainda não comprado. Preserva pedidos, quantidades recebidas e financeiro.
- `pedidos.json`: cancelar primeiro o saldo não recebido dos itens expressamente selecionados e depois encerrar o saldo não comprado. Reutiliza as rotinas atuais de entrega, alocações, totais e frete. O que foi recebido permanece registrado.

Os 57 itens vêm do recebimento **registrado** no extrato. Conferir a entrega física antes de aprovar. Selecionar um item de pedido com vínculo financeiro ativo bloqueia a SC inteira, sem cancelar ou estornar títulos para contornar a regra. Os arquivos de revisão não omitem esses itens silenciosamente. Se desejar somente o saldo não comprado daquela SC, revisar a alternativa `saldo.json` antes de nova simulação.

Etapas ainda não liberadas para compras, compras diretas, SCs já finalizadas e principais compartilhadas exigem análise separada. O operador não amplia permissões ou a cobertura de status dos fluxos atuais.

## Registro e reversão

A migration `202610260002_compra_reorganizacao_reversivel.js` cria **somente** `compra_reorganizacao_operacoes` e seu índice único `(lote_id, solicitacao_compra_id)`. Guarda autor, motivo, configuração, snapshots antes/depois, diferenças e situação da reversão. Não altera tabelas financeiras, não faz backfill e recusa `down` destrutivo. A estrutura existente é conferida antes de reutilizá-la. Não executar migrations gerais para instalar esse pacote.

Journal e alteração da SC são gravados na mesma transação. Falha no meio provoca rollback daquela SC. Mesmo lote/plano/SC já aplicado retorna replay, sem repetir alterações ou histórico. Lote já revertido não pode ser reutilizado para aplicar outra vez.

A reversão confere snapshots, campos, vínculos e versões. Novo pedido, título, recebimento, baixa, documento vinculado ou mudança operacional relevante impede sobrescrever o trabalho posterior. A SC em conflito permanece pendente para revisão; não existe opção de forçar.

Somente os campos alterados pelo lote são restaurados. Títulos, baixas, recebimentos, NF-e, XMLs e anexos nunca entram na lista de escrita. Datas de auditoria não retroagem. Versões de entrega avançam, inclusive na reversão, invalidando telas antigas. Um prazo operacional já vencido não é reaberto automaticamente.

Os registros criados pela operação também são preservados: fechamento sem pedido recebe `REVERTIDO`; rateio novo fica zerado; controle de entrega novo volta ao estado neutro com versão maior. Não há `DELETE`, limpeza de journal, remoção de locks ou restauração global de banco. A guarda SQL na conexão exclusiva da transação recusa DDL, exclusões, alterações financeiras e campos fora da lista permitida.

### Mensagens no histórico

Evento principal e log da SC ao aplicar:

> Lote de reorganização aplicado: SC-00020. Motivo: [motivo revisado].

Evento principal e log da SC ao reverter:

> Reversão do lote de reorganização: SC-00020. Motivo: [motivo da reversão].

Eventos: `REORGANIZACAO_APLICADO` e `REORGANIZACAO_REVERTIDO`. Os metadados identificam lote, operação, SC, escopo e registros/campos envolvidos; o histórico principal registra seus status anterior e novo. As rotinas existentes de entrega e encerramento conservam seus próprios eventos e o motivo informado. A contagem de mensagens de referência do dossiê antigo não é promessa do número de inserções do novo operador.

## Permissões e segurança

- Sessão normal, MFA e CSRF continuam sob o middleware existente. Módulos COMPRAS e COTACOES precisam estar habilitados.
- Exige acesso a compras, escopo da SC e da obra. Autor e permissões vêm da sessão; o manifesto não escolhe usuário.
- Total: permissão atual de excluir/cancelar solicitações de compra; cancelar cotação exige também sua permissão específica.
- Encerramento de saldo: permissão atual de encerrar cotação sem pedido.
- Saldo de pedido: permissão de cancelar pedidos e setor Compras ou SUPERADMIN, como no fluxo atual de entregas.
- Reversão exige as permissões anteriores e também reabrir cotação; quando há itens de pedido, reabrir pedidos.
- Não modifica permissões cadastradas, confirmação biométrica ou autorização/baixa financeira.
- O hash do plano detecta divergências e vincula conteúdo/ator. Não é assinatura nem substitui autorização: o servidor revalida os dados e permissões em cada operação.

## Arquivos de revisão das 95 SCs

Foram gerados **localmente**, fora dos arquivos de aplicação, em `outputs/conferencia-cancelamento-sc-20261026/revisao/operador-reversivel/` no checkout original:

- `total.json`: 71 SCs totais.
- `saldo.json`: 24 SCs parciais, somente não comprado.
- `pedidos.json`: alternativa das 24 parciais, com 57 itens selecionados.
- `conferencia.json`: 119 prévias de mensagens considerando as alternativas e alertas financeiros/recebimentos. Nenhuma delas foi executada.

Base: extrato somente leitura executado pelo usuário em `2026-10-26T13:38:04.287Z`. Descrições e outros campos ainda dependem do complemento solicitado. Os arquivos não são autorização de cancelamento e não substituem uma nova simulação no ambiente real.

Para gerar outra cópia LOCAL, a partir da raiz deste worktree, escolhendo um diretório de saída que ainda não exista:

```powershell
node backend/scripts/prepararCompraReorganizacaoManifestos.js "CAMINHO_DO_PLANO_PARA_REVISAO.json" "DIRETORIO_NOVO_DE_REVISAO"
```

## Uso manual da CLI após instalação e homologação

**Exemplos de uso futuro. As rotas ainda não estão instaladas no DEV ou na produção.** Primeiro publicar o pacote autorizado, preparar aplicador específico da migration aditiva, aplicar em DEV pelo usuário e homologar com SCs de teste. Somente depois preparar o operador de produção com backup, timer e janela atuais. Não usar o manifesto de produção para cancelar SCs de teste sem conferir a correspondência.

A CLI usa `--token-arquivo` com sessão Bearer já aceita pelo backend. Não crie credenciais de banco para ela, não coloque token na linha de comando e não envie token no chat. Em Linux o arquivo deve ser regular, do próprio usuário, modo `0600`; os resultados locais são criados como `0600` e não sobrescrevem arquivos existentes. Usar somente o mecanismo de sessão permitido pelo ambiente, sem afrouxar autenticação.

Exemplos em **PowerShell**, na raiz do pacote, para o DEV já instalado. Ajustar arquivos, SCs de teste e UUID após revisão:

```powershell
$ApiReorganizacao='https://api-dev.jrfluxy.com.br/api'
$SessaoReorganizacao='CAMINHO_PRIVADO_DA_SESSAO.jwt'

# Simular: nao cancela SCs nem cria journal.
node backend/scripts/compraReorganizacaoHttp.js --acao simular --api $ApiReorganizacao --token-arquivo $SessaoReorganizacao --entrada 'manifesto-revisado.json' --saida 'simulacao-revisada.json'

# Aplicacao futura: usar o MESMO UUID e plano para reconciliar resposta perdida.
# Gerar UUID uma unica vez, guardar e revisar antes de executar.
$LoteReorganizacao='UUID_ESCOLHIDO_E_GUARDADO'
node backend/scripts/compraReorganizacaoHttp.js --acao aplicar --api $ApiReorganizacao --token-arquivo $SessaoReorganizacao --lote $LoteReorganizacao --plano 'simulacao-revisada.json' --sc 'ID_SC_1,ID_SC_2' --confirmar-gravacao --saida 'resultado-aplicacao-01.json'

# Conferir antes de qualquer retomada depois de desconexao.
node backend/scripts/compraReorganizacaoHttp.js --acao consultar --api $ApiReorganizacao --token-arquivo $SessaoReorganizacao --lote $LoteReorganizacao --saida 'estado-01.json'

# Reversao selecionada: simular e revisar, depois executar a selecao.
node backend/scripts/compraReorganizacaoHttp.js --acao simular-reversao --api $ApiReorganizacao --token-arquivo $SessaoReorganizacao --lote $LoteReorganizacao --sc 'ID_SC_1' --motivo 'Retomar a SC por decisao revisada do proprietario.' --saida 'simulacao-reversao-01.json'
node backend/scripts/compraReorganizacaoHttp.js --acao reverter --api $ApiReorganizacao --token-arquivo $SessaoReorganizacao --plano 'simulacao-reversao-01.json' --sc 'ID_SC_1' --confirmar-reversao --saida 'resultado-reversao-01.json'
```

Para simular a reversão de **todo o lote**, substituir `--sc` por `--todas`; na execução, `--todas` seleciona todas as SCs daquele plano de reversão revisado, incluindo conflitos que serão recusados individualmente. Não há seleção implícita de todas. O motivo de reversão é fixado na simulação e reutilizado na execução.

A CLI limita os envios a 10 SCs por requisição, grava as respostas localmente e não faz retentativas automáticas. `CONFLITO` é resultado individual e código de saída 2; erro de transporte interrompe com código 1 e preserva as respostas já recebidas. `REPLAY` não é novo cancelamento. `concluido_em` significa término da chamada da CLI, não que todas as SCs foram alteradas: ler `resultados` e consultar o lote. Não criar novo UUID para contornar uma falha ou reaplicar uma SC revertida.

## Validação local e o que falta

```powershell
cd backend
node --require ./scripts/helpers/semRedeQa.js --test scripts/validarCompraReorganizacao.js scripts/validarCompraReorganizacaoCliente.js scripts/validarCompraReorganizacaoSeguranca.js
```

23 testes passaram, com conexões de rede bloqueadas. Cobrem SQL em memória, serviços reais de saldo/entrega/totais/frete, rollback, repetição concorrente simulada, reversão seletiva e do lote, conflitos posteriores, bloqueios financeiros, prazos, permissões, migration aditiva e cliente HTTP com transporte simulado. Os modelos e as gravações dos testes são locais, com dados sintéticos. A guarda da conexão MySQL e o SQL gerado também foram testados sem conexão.

Passaram ainda 12 validadores existentes: entregas e acesso, remanejamento, histórico de encerramento sem pedido, resumo de compras, financeiro GEO, títulos por pedido, vínculos NF-e, baixas/estorno e baixa composta, análise do proprietário e auditoria de permissões granulares.

Não houve teste integrado com MySQL/RDS, sessão real ou ambientes remotos. A homologação deve conferir transações/locks reais, tempos por SC, apresentação dos eventos no histórico, perda de conexão/replay e recusa de conflito após movimentação posterior. A próxima etapa é publicar e preparar **comandos específicos de DEV executados pelo usuário**, com migration isolada; produção e cancelamentos reais permanecem pendentes.
