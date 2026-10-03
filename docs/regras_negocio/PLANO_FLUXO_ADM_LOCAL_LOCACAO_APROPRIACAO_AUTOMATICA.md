# Plano — ADM Local e Locação com apropriação automática

Data do levantamento: 2026-08-25

Status: implementado em 2026-08-25 para novas obras e novas solicitações. O legado não foi alterado.

Decisões aplicadas:

- ADM Local: código `1`, descrição `ADM LOCAL DE OBRA`;
- Locação: código `2`, descrição `LOCAÇÃO DE MAQ. e EQ.`;
- as duas apropriações são obrigatoriamente distintas;
- solicitações e títulos legados ficam para auditoria separada.

## Objetivo

Para os tipos identificados pelos códigos internos `ADM_LOCAL_DE_OBRA` e `LOCACAO_DE_MAQ_EQ`:

1. retirar contrato e rateio de contrato da abertura da solicitação;
2. retirar a escolha manual da apropriação principal;
3. resolver automaticamente a apropriação pelo par obra + tipo;
4. persistir a apropriação na solicitação para preservar o histórico;
5. fazer os títulos financeiros derivados herdarem a mesma apropriação;
6. permitir o vínculo manual nas obras existentes;
7. criar as duas apropriações e seus vínculos automaticamente nas novas obras.

O tipo `DESPESAS_DE_MARKETING`, embora apareça na tela já existente, não terá seu fluxo alterado nesta entrega.

## Estado atual comprovado

- A configuração `NOVA_SOLICITACAO_CAMPOS_POR_TIPO` já controla visibilidade e obrigatoriedade de `contrato`, `apropriacao_principal` e `apropriacoes_contrato`, no frontend e no backend.
- No banco local, os dois tipos ainda exigem contrato em todas as áreas. A área `GEO` esconde a apropriação principal, mas continua exigindo contrato.
- A tabela `obra_tipo_apropriacao_padrao` e a tela `/obra-tipo-apropriacao` já existem. A tabela garante um vínculo por obra + tipo.
- A tela tem somente 1 vínculo ativo para 56 obras ativas. Portanto, ainda não pode ser usada como fonte obrigatória sem uma etapa de implantação dos vínculos.
- O vínculo ainda não é consumido pela criação da solicitação; hoje ele é apenas cadastrado e exibido na tela administrativa.
- `SolicitacaoController.create` já grava `solicitacoes.apropriacao_id` quando recebe uma apropriação válida.
- `criarTituloPorSolicitacao` já copia `solicitacao.apropriacao_id` para cada título criado. Não é necessário recalcular a apropriação no financeiro.
- `ObraController.create` cria somente a obra, sem transação e sem apropriações ou vínculos padrão.
- A tela de vínculo existente lista também obras inativas/centros de custo e não exclui apropriações somadoras. Esses pontos precisam ser corrigidos antes da ativação.
- Na cópia local existem 996 solicitações de ADM Local, das quais 815 não possuem apropriação, e 247 de Locação, das quais 200 não possuem apropriação. Há 230 títulos desses fluxos sem apropriação. Os títulos existentes não divergem de suas solicitações: quando a solicitação tem apropriação, o título tem a mesma.

Os números acima são diagnóstico da cópia local e não devem ser tratados como contagem de produção sem nova conferência no momento do deploy.

## Arquitetura proposta

### 1. Regra de domínio central

Criar um serviço único para os tipos com apropriação automática. Ele deve:

- identificar o tipo por `codigo_interno`, nunca por ID fixo;
- resolver o vínculo pelo par `obra_id + tipo_solicitacao_id`;
- aceitar somente obra ativa classificada como `OBRA`;
- aceitar somente apropriação ativa, analítica e pertencente à mesma obra;
- devolver erro de negócio específico quando o vínculo estiver ausente ou inválido;
- ser usado pela tela administrativa, pela Nova Solicitação e pela criação de obras.

A lista de tipos não deve continuar duplicada em controller, frontend e testes.

### 2. Nova Solicitação

Aplicar regra global, para todas as áreas, nos dois tipos:

| Campo | Visível | Obrigatório | Comportamento |
|---|---:|---:|---|
| Contrato | não | não | payload é ignorado pelo backend |
| Apropriações do contrato | não | não | não há rateio contratual |
| Apropriação principal editável | não | não | substituída por informação somente leitura |

Após selecionar obra e tipo, a tela consulta a apropriação resolvida e mostra, em modo somente leitura, `código — descrição`. O backend continua sendo a autoridade e resolve novamente no envio; não confia no valor exibido nem em `apropriacao_id` enviado pelo navegador.

Se o vínculo estiver ausente, inativo, somador ou pertencer a outra obra, a criação deve ser bloqueada antes de gerar qualquer registro, com mensagem objetiva para configurar a apropriação padrão. Para quem possuir permissão administrativa, a mensagem pode oferecer atalho para a tela de vínculo.

O subtipo atualmente usado por ADM Local e os demais campos do tipo permanecem inalterados.

### 3. Persistência e histórico

Na criação, o backend grava a apropriação resolvida em `solicitacoes.apropriacao_id` e registra no histórico:

- origem `PADRAO_OBRA_TIPO`;
- obra, tipo e apropriação resolvidos;
- código e descrição vigentes no momento da criação.

Alterar o vínculo da obra depois não muda solicitações ou títulos já existentes. Essa imutabilidade evita que um lançamento histórico troque de classificação silenciosamente.

### 4. Títulos financeiros

O caminho atual de títulos já herda `solicitacao.apropriacao_id`. A implementação deve acrescentar validação explícita para impedir que um título novo seja criado sem apropriação nesses dois tipos.

Não deve ser criado um rateio artificial de 100%. O vínculo simples permanece em `titulos_financeiros.apropriacao_id`; rateio financeiro continua reservado aos casos que realmente possuem múltiplos destinos.

Se a apropriação histórica tiver sido inativada antes da geração do título, o sistema não deve trocar silenciosamente para o vínculo atual. Deve bloquear a geração e exigir tratamento administrativo auditável.

### 5. Tela de vínculo para obras existentes

Evoluir a tela já existente em vez de criar uma segunda tela. Ajustes necessários:

- listar apenas obras ativas classificadas como `OBRA`;
- oferecer apenas apropriações ativas e analíticas;
- validar no backend os mesmos critérios;
- indicar pendências por obra e por tipo;
- permitir filtrar por obra, tipo e pendência;
- manter alteração e remoção com confirmação;
- fazer o salvamento por `upsert`/transação, protegido contra concorrência;
- exibir sugestão por descrição apenas como ajuda; nunca gravar correspondência automaticamente;
- destacar quando o vínculo ficou inválido por inativação posterior.

Como os códigos legados variam, o preenchimento inicial deve ser confirmado manualmente. A busca por descrição pode sugerir candidatos, mas não é prova suficiente.

### 6. Apropriações automáticas em novas obras

Adicionar, na mesma área administrativa, uma seção somente leitura “Padrões para novas obras”, com os códigos e descrições decididos pelo proprietário. Nesta entrega os valores são regras de domínio versionadas junto do código; qualquer alteração futura deve passar por nova decisão explícita e revisão de colisões nas obras existentes.

Ao criar uma nova obra classificada como `OBRA`, executar em uma única transação:

1. criar a obra;
2. criar as duas apropriações analíticas, ativas, com valor orçado inicial zero;
3. criar os dois vínculos em `obra_tipo_apropriacao_padrao`;
4. confirmar a transação somente se todas as etapas tiverem sucesso.

Centros de custo do tipo `CENTRO_CUSTO` não recebem essas apropriações. Ausência de configuração válida deve impedir a criação da obra com erro claro, sem deixar obra parcial. A operação precisa ser idempotente e protegida contra clique duplo/reenvio.

Os códigos e descrições foram fixados somente depois da decisão de negócio registrada acima. Antes de criar cada apropriação, o serviço valida colisão ambígua do código na nova obra e exige os dois tipos ativos.

### 7. Legado e saneamento

O legado deve ser tratado em etapa separada, depois de todos os vínculos manuais estarem conferidos. Criar uma operação administrativa com prévia, que mostre quantidades antes de alterar dados.

Regras do saneamento:

- atualizar somente solicitações dos dois tipos com `apropriacao_id IS NULL`;
- usar o vínculo confirmado da obra + tipo;
- atualizar somente títulos vinculados a essas solicitações e com `apropriacao_id IS NULL`;
- nunca sobrescrever apropriação já preenchida;
- processar em transação por obra + tipo;
- registrar usuário, data, vínculo usado e IDs afetados;
- conferir contagens antes e depois;
- permitir exportar a prévia para conferência.

Esse saneamento altera classificação financeira histórica e depende de autorização específica do proprietário antes da execução. Ele não faz parte implícita da ativação do fluxo novo.

## Autorizações

| Ação | Autorização proposta |
|---|---|
| Criar solicitação dos dois tipos | permissão normal de criar solicitação + acesso à obra |
| Consultar apropriação resolvida durante a abertura | mesma autorização da criação; somente leitura e limitada à obra acessível |
| Gerenciar vínculo obra + tipo | `configuracoes.status_vinculos.gerenciar` |
| Configurar padrões de novas obras | `configuracoes.status_vinculos.gerenciar` |
| Criar obra e disparar geração automática | `configuracoes.cadastros.gerenciar` |
| Executar saneamento histórico | administração de vínculos e gerenciamento financeiro, com confirmação explícita |

O usuário que cria a solicitação não escolhe nem altera a apropriação automática. O frontend esconde controles, mas as restrições são repetidas no backend.

## Ordem segura de implantação

1. centralizar e testar a regra de domínio;
2. corrigir e completar a tela de vínculos;
3. implementar resolução e gravação automática na solicitação;
4. validar a herança já existente no título financeiro;
5. configurar os campos globais para retirar contrato e escolha manual;
6. implementar os padrões e a transação de criação de novas obras;
7. executar testes automatizados e visuais;
8. configurar manualmente as obras existentes conforme elas forem usadas;
9. somente em auditoria separada, implementar prévia e eventual saneamento legado.

A retirada do contrato está ativa para novas solicitações. Obra antiga sem vínculo recebe bloqueio explícito e deve ser configurada manualmente na tela de vínculos; nenhum registro legado é alterado implicitamente.

## Matriz mínima de testes

- tipos diferentes dos dois permanecem inalterados;
- contrato não aparece e não é exigido no frontend nem no backend;
- payload forjado com contrato/apropriação é ignorado ou rejeitado conforme a regra;
- vínculo ausente, inativo, somador ou de outra obra bloqueia a solicitação;
- vínculo válido grava exatamente uma apropriação na solicitação;
- mudança posterior do vínculo não altera solicitação antiga;
- cada parcela financeira herda a apropriação da solicitação;
- título não nasce sem apropriação nesses tipos;
- nova obra cria exatamente duas apropriações e dois vínculos;
- falha em qualquer etapa reverte toda a criação da obra;
- clique duplo/retry não duplica obra, apropriações, vínculos, solicitação ou título;
- permissões são verificadas no frontend e no backend;
- prévia do legado não grava nada;
- saneamento, quando autorizado, altera somente campos nulos e restaura/valida o estado de QA.

As suítes que escrevem no banco compartilhado devem fotografar o estado por ID, restaurar exatamente o que encontraram e reprovar se a restauração falhar. As suítes antigas de `qa/obra-tipo-apropriacao` não devem ser executadas sem revisão dessa limpeza.

## Resultado da implementação

- serviço central resolve e valida obra, tipo, vínculo e apropriação;
- novas obras do tipo `OBRA` criam duas apropriações e dois vínculos na mesma transação;
- centros de custo não recebem os padrões;
- Nova Solicitação oculta contrato, rateio e escolha manual nos dois tipos e mostra a apropriação resolvida somente para leitura;
- o backend ignora valores ocultos enviados pelo cliente e resolve novamente o vínculo;
- solicitações novas guardam a apropriação e sua origem no histórico;
- títulos derivados continuam herdando `solicitacao.apropriacao_id` pelo fluxo financeiro existente;
- a tela administrativa lista somente obras ativas, apropriações ativas/analíticas, destaca pendências e impede que os dois tipos usem a mesma apropriação;
- gravações simultâneas de vínculos da mesma obra são serializadas em transação;
- a suíte segura cria dados apenas dentro de transação, reverte e confere a restauração.

Validações concluídas: sintaxe Node, build de produção do frontend, conferência de migrations (nenhuma pendente) e suíte transacional `qa/obra-tipo-apropriacao-automatica/01-fluxo-seguro.js`. A inspeção visual autenticada depende de sessão disponível; as abas encontradas estavam na tela de login.
