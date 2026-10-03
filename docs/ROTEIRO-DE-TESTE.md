# Roteiro de teste no preview — leva das quatro levas de componente

> Gerado de `scripts/qa-preview/telas.mjs` e do relatório da matriz. **Não editar à mão.**
> Preview: https://refactor-dev.jrfluxy.com.br

## Como usar

Cada tela tem **um link direto** (clique e vai) e o **caminho pelo Ctrl+K**, que é o atalho de busca do sistema — aperte `Ctrl+K`, digite o nome e dê Enter.

São lotes de 10. Não precisa fazer tudo: os quatro primeiros módulos são os que você mais usa, e os defeitos que eu consertei estão concentrados neles.

**⚠ SEM DADO** marca tela em que a base do preview não tem registro suficiente para exercitar tudo — a capacidade existe e não foi provada. Não é defeito, é lacuna de evidência. Se você tiver como criar um registro de teste nessas, elas passam a ser medíveis.

**🚫 NÃO ABRE** marca tela que hoje é inalcançável por decisão declarada (modo simplificado do SST, ou etapa de fluxo que exigiria criar registro no ambiente compartilhado).

## O que mudou em TODAS as telas com tabela

Antes de ir tela a tela, confira estes quatro numa tabela qualquer — se estiverem certos aqui, valem para as 189:

1. **Rodapé de contagem** — embaixo da tabela, "N de M". Em lista grande ele diz quanto está à vista contra quanto existe.
2. **Rolagem infinita** — listas longas carregam mais ao rolar. Ao lado do rodapé há um botão que alterna para "Lista inteira", e a sua escolha fica salva por lista.
3. **Menu de alinhamento** — passe o mouse no título de uma coluna e clique no ícone que aparece à direita. **Antes ele não abria nada** (o menu existia e estava recortado). Agora tem de abrir, mudar o alinhamento da coluna, e continuar assim depois de recarregar a página.
4. **Títulos na mesma altura** — todos os títulos da tabela, inclusive "AÇÕES", assentam na mesma linha. Antes o "AÇÕES" ficava mais alto.

E em todas as telas: **aviso de sucesso não some mais sozinho**. Ao salvar, aprovar, enviar ou excluir, o aviso fica até você fechar. Só avisos triviais (copiar link, baixar PDF) continuam sumindo — são 10, de 291.

---

# Solicitações — 11 tela(s)

## Lote 1 de 2

### tipos solicitacao
- **Abrir:** https://refactor-dev.jrfluxy.com.br/tipos-solicitacao
- **Ctrl+K:** digite `tipos solicitacao`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### tipos solicitacao por setor
- **Abrir:** https://refactor-dev.jrfluxy.com.br/tipos-solicitacao-por-setor
- **Ctrl+K:** digite `tipos solicitacao por setor`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### modulo relatorios solicitacoes
- **Abrir:** https://refactor-dev.jrfluxy.com.br/solicitacoes/relatorios
- **Ctrl+K:** digite `modulo relatorios solicitacoes`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### config sla setor
- **Abrir:** https://refactor-dev.jrfluxy.com.br/solicitacoes-sla-setor
- **Ctrl+K:** digite `config sla setor`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### config nova solicitacao campos
- **Abrir:** https://refactor-dev.jrfluxy.com.br/nova-solicitacao-campos
- **Ctrl+K:** digite `config nova solicitacao campos`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### config nova solicitacao destino
- **Abrir:** https://refactor-dev.jrfluxy.com.br/nova-solicitacao-automacao-destino
- **Ctrl+K:** digite `config nova solicitacao destino`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

### solicitacoes
- **Abrir:** https://refactor-dev.jrfluxy.com.br/solicitacoes
- **Ctrl+K:** digite `solicitacoes`
- **O que mudou:** Os botões de modo de visualização tinham 30px (mínimo 32).
- **O que olhar:** Alterne entre Tabela e Cards — os botões devem estar confortáveis no toque.

### nova solicitacao
- **Abrir:** https://refactor-dev.jrfluxy.com.br/nova-solicitacao
- **Ctrl+K:** digite `nova solicitacao`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

### solicitacao detalhe · ⚠ **SEM DADO** (6 item(ns))
- **Abrir:** não tem endereço fixo — chega-se abrindo um registro na listagem do módulo.
- **O que mudou:** Um link de navegação saiu da barra de ações da faixa.
- **O que olhar:** Confira que você ainda chega aos títulos por outro caminho (menu ou Ctrl+K).
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhum titulo financeiro foi gerado para esta solicitacao.") — capacidad

### solicitacoes rel operacional
- **Abrir:** https://refactor-dev.jrfluxy.com.br/solicitacoes/relatorios/operacional
- **Ctrl+K:** digite `solicitacoes rel operacional`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

## Lote 2 de 2

### solicitacoes arquivadas · ⚠ **SEM DADO** (1 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/solicitacoes-arquivadas
- **Ctrl+K:** digite `solicitacoes arquivadas`
- **O que mudou:** Mesmo conserto do seletor de modo.
- **O que olhar:** A base do preview não tem nenhuma solicitação arquivada, então a tela mostra o estado vazio: confira que ela EXPLICA isso em vez de parecer quebrada.
- **Por que está sem dado:** dimensão sem opção na base do preview — declarado no manifesto (as dimensoes saem dos registros carregados e a base do preview nao tem nenhuma solicit

---

# Financeiro — 32 tela(s)

## Lote 1 de 4

### financeiro titulo detalhe
- **Abrir:** não tem endereço fixo — chega-se abrindo um registro na listagem do módulo.
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

### usuarios acesso financeiro
- **Abrir:** https://refactor-dev.jrfluxy.com.br/usuarios-acesso-financeiro
- **Ctrl+K:** digite `usuarios acesso financeiro`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### financeiro titulos · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/financeiro/titulos
- **Ctrl+K:** digite `financeiro titulos`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhum filtro aplicado A tabela fica vazia ate voce consultar os titul")

### financeiro titulo novo
- **Abrir:** https://refactor-dev.jrfluxy.com.br/financeiro/titulos/novo
- **Ctrl+K:** digite `financeiro titulo novo`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

### financeiro titulo editar
- **Abrir:** não tem endereço fixo — chega-se abrindo um registro na listagem do módulo.
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

### financeiro baixas
- **Abrir:** https://refactor-dev.jrfluxy.com.br/financeiro/baixas
- **Ctrl+K:** digite `financeiro baixas`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### financeiro baixas compostas
- **Abrir:** https://refactor-dev.jrfluxy.com.br/financeiro/baixas-compostas
- **Ctrl+K:** digite `financeiro baixas compostas`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### financeiro bancos
- **Abrir:** https://refactor-dev.jrfluxy.com.br/financeiro/bancos
- **Ctrl+K:** digite `financeiro bancos`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### financeiro boletos
- **Abrir:** https://refactor-dev.jrfluxy.com.br/financeiro/boletos
- **Ctrl+K:** digite `financeiro boletos`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### financeiro cadastros
- **Abrir:** https://refactor-dev.jrfluxy.com.br/financeiro/cadastros
- **Ctrl+K:** digite `financeiro cadastros`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

## Lote 2 de 4

### financeiro caixas
- **Abrir:** https://refactor-dev.jrfluxy.com.br/financeiro/caixas
- **Ctrl+K:** digite `financeiro caixas`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### financeiro cheques terceiros · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/financeiro/cheques-terceiros
- **Ctrl+K:** digite `financeiro cheques terceiros`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhum cheque encontrado para os filtros.") — capacidade NÃO PROVADA

### financeiro conciliacao
- **Abrir:** https://refactor-dev.jrfluxy.com.br/financeiro/conciliacao
- **Ctrl+K:** digite `financeiro conciliacao`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### financeiro dda · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/financeiro/dda
- **Ctrl+K:** digite `financeiro dda`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhum documento DDA carregado A estrutura esta pronta para receber do")

### financeiro faturas cartao
- **Abrir:** https://refactor-dev.jrfluxy.com.br/financeiro/faturas-cartao
- **Ctrl+K:** digite `financeiro faturas cartao`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### financeiro fatura cartao detalhe
- **Abrir:** não tem endereço fixo — chega-se abrindo um registro na listagem do módulo.
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

### financeiro financiamentos bancarios · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/financeiro/financiamentos-bancarios
- **Ctrl+K:** digite `financeiro financiamentos bancarios`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhum financiamento cadastrado.") — capacidade NÃO PROVADA

### financeiro pagamentos
- **Abrir:** https://refactor-dev.jrfluxy.com.br/financeiro/pagamentos
- **Ctrl+K:** digite `financeiro pagamentos`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### financeiro relatorios
- **Abrir:** https://refactor-dev.jrfluxy.com.br/financeiro/relatorios
- **Ctrl+K:** digite `financeiro relatorios`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### financeiro dre
- **Abrir:** https://refactor-dev.jrfluxy.com.br/financeiro/relatorios/dre
- **Ctrl+K:** digite `financeiro dre`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

## Lote 3 de 4

### financeiro diagnostico dre
- **Abrir:** https://refactor-dev.jrfluxy.com.br/financeiro/relatorios/dre/diagnostico
- **Ctrl+K:** digite `financeiro diagnostico dre`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### financeiro endividamento · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/financeiro/relatorios/endividamento
- **Ctrl+K:** digite `financeiro endividamento`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhuma empresa com divida classificada.") — capacidade NÃO PROVADA

### financeiro executivo grupo
- **Abrir:** https://refactor-dev.jrfluxy.com.br/financeiro/relatorios/grupo-consolidado
- **Ctrl+K:** digite `financeiro executivo grupo`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### financeiro fluxo consolidado
- **Abrir:** https://refactor-dev.jrfluxy.com.br/financeiro/relatorios/fluxo-consolidado
- **Ctrl+K:** digite `financeiro fluxo consolidado`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### financeiro intercompany · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/financeiro/relatorios/intercompany
- **Ctrl+K:** digite `financeiro intercompany`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhuma relacao entre empresas encontrada no periodo.") — capacidade NÃO

### financeiro obras
- **Abrir:** https://refactor-dev.jrfluxy.com.br/financeiro/relatorios/financeiro-obras
- **Ctrl+K:** digite `financeiro obras`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### financeiro relatorio analitico
- **Abrir:** https://refactor-dev.jrfluxy.com.br/financeiro/relatorios/analitico
- **Ctrl+K:** digite `financeiro relatorio analitico`
- **O que mudou:** Mesmo conserto de texto cortado, e a exportação CSV foi preservada.
- **O que olhar:** Tooltip no texto cortado — e BAIXE O CSV para conferir que ele continua saindo com texto, não com código.

### financeiro resultado centros custo
- **Abrir:** https://refactor-dev.jrfluxy.com.br/financeiro/relatorios/centros-custo
- **Ctrl+K:** digite `financeiro resultado centros custo`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### financeiro resultado obras
- **Abrir:** https://refactor-dev.jrfluxy.com.br/financeiro/relatorios/resultado-obras
- **Ctrl+K:** digite `financeiro resultado obras`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### provisoes
- **Abrir:** https://refactor-dev.jrfluxy.com.br/provisoes-financeiras
- **Ctrl+K:** digite `provisoes`
- **O que mudou:** O painel "quais filtros aparecem" foi REPOSTO, como você mandou.
- **O que olhar:** Abra o painel, esconda um filtro e confira que a etiqueta dele some junto — e que ao reexibir o filtro volta limpo.

## Lote 4 de 4

### provisoes dashboard
- **Abrir:** https://refactor-dev.jrfluxy.com.br/provisoes-financeiras/dashboard
- **Ctrl+K:** digite `provisoes dashboard`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### provisao detalhe · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** não tem endereço fixo — chega-se abrindo um registro na listagem do módulo.
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhum anexo registrado.") — capacidade NÃO PROVADA

---

# Compras — 30 tela(s)

## Lote 1 de 3

### relatorios administrativos
- **Abrir:** https://refactor-dev.jrfluxy.com.br/compras/relatorios/auditoria
- **Ctrl+K:** digite `relatorios administrativos`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### cotacao publica · ⚠ **SEM DADO** (12 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/cotacao/harness-sem-token-valido
- **Ctrl+K:** digite `cotacao publica`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.
- **Por que está sem dado:** medida com token INVÁLIDO: um token válido só existe criando ou abrindo cotação no ambiente compartilhado, e o harness não cria registro. A tabela de 

### contratos gestao
- **Abrir:** https://refactor-dev.jrfluxy.com.br/gestao-contratos
- **Ctrl+K:** digite `contratos gestao`
- **O que mudou:** Código do contrato e colunas de texto livre passaram a truncar com tooltip.
- **O que olhar:** Tooltip no código cortado.

### compras rel categorias insumos
- **Abrir:** https://refactor-dev.jrfluxy.com.br/compras/relatorios/categorias-insumos
- **Ctrl+K:** digite `compras rel categorias insumos`
- **O que mudou:** A barra de ações estava caindo para uma segunda linha da faixa.
- **O que olhar:** A faixa tem de caber numa linha só, com os botões ao lado do título.

### compras rel ciclo
- **Abrir:** https://refactor-dev.jrfluxy.com.br/compras/relatorios/ciclo
- **Ctrl+K:** digite `compras rel ciclo`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### compras rel compras diretas · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/compras/relatorios/compras-diretas
- **Ctrl+K:** digite `compras rel compras diretas`
- **O que mudou:** Mesmo conserto da faixa em duas linhas.
- **O que olhar:** Faixa numa linha só.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Sem dados no periodo.") — capacidade NÃO PROVADA

### compras rel compras fornecedor
- **Abrir:** https://refactor-dev.jrfluxy.com.br/compras/relatorios/compras-fornecedor
- **Ctrl+K:** digite `compras rel compras fornecedor`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### compras rel demanda pedidos
- **Abrir:** https://refactor-dev.jrfluxy.com.br/compras/relatorios/demanda-pedidos
- **Ctrl+K:** digite `compras rel demanda pedidos`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### compras rel economia cotacoes
- **Abrir:** https://refactor-dev.jrfluxy.com.br/compras/relatorios/economia-cotacoes
- **Ctrl+K:** digite `compras rel economia cotacoes`
- **O que mudou:** O nome do fornecedor e o preço estavam juntos na mesma linha da célula e se empurravam.
- **O que olhar:** Nome em cima, preço embaixo. O preço nunca pode truncar.

### compras rel evolucao
- **Abrir:** https://refactor-dev.jrfluxy.com.br/compras/relatorios/evolucao
- **Ctrl+K:** digite `compras rel evolucao`
- **O que mudou:** Faixa em duas linhas E valores de mês quebrando em três linhas dentro da célula.
- **O que olhar:** Faixa numa linha; e cada mês numa linha própria, com o valor inteiro, sem quebrar.

## Lote 2 de 3

### compras rel fornecedores
- **Abrir:** https://refactor-dev.jrfluxy.com.br/compras/relatorios/fornecedores
- **Ctrl+K:** digite `compras rel fornecedores`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### compras rel pendencias cotacoes
- **Abrir:** https://refactor-dev.jrfluxy.com.br/compras/relatorios/pendencias-cotacoes
- **Ctrl+K:** digite `compras rel pendencias cotacoes`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### compras rel precos insumos
- **Abrir:** https://refactor-dev.jrfluxy.com.br/compras/relatorios/precos-insumos
- **Ctrl+K:** digite `compras rel precos insumos`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### gestao categorias
- **Abrir:** https://refactor-dev.jrfluxy.com.br/gestao-categorias
- **Ctrl+K:** digite `gestao categorias`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### gestao unidades
- **Abrir:** https://refactor-dev.jrfluxy.com.br/gestao-unidades
- **Ctrl+K:** digite `gestao unidades`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### gestao apropriacoes
- **Abrir:** https://refactor-dev.jrfluxy.com.br/gestao-apropriacoes
- **Ctrl+K:** digite `gestao apropriacoes`
- **O que mudou:** A faixa só mostrava número depois de escolher uma obra.
- **O que olhar:** Ao abrir, antes de escolher obra, a faixa já mostra quantas obras existem.

### solicitacoes compra
- **Abrir:** https://refactor-dev.jrfluxy.com.br/solicitacoes-compra
- **Ctrl+K:** digite `solicitacoes compra`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### cotacoes
- **Abrir:** https://refactor-dev.jrfluxy.com.br/cotacoes
- **Ctrl+K:** digite `cotacoes`
- **O que mudou:** A FAIXA FIXA sumia ao rolar e passava por cima da barra do topo — duas causas empilhadas, achadas em rodadas diferentes.
- **O que olhar:** Role a página até o fim: a faixa tem de ficar grudada abaixo da barra do topo o tempo todo, sem sobrepor.

### pedidos compra
- **Abrir:** https://refactor-dev.jrfluxy.com.br/pedidos-compra
- **Ctrl+K:** digite `pedidos compra`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### compras delegacao
- **Abrir:** https://refactor-dev.jrfluxy.com.br/compras/delegacao
- **Ctrl+K:** digite `compras delegacao`
- **O que mudou:** Os cartões passaram a morar dentro do bloco principal da tela.
- **O que olhar:** Os 30 cartões continuam lá, agora com título e cor de módulo.

## Lote 3 de 3

### gestao fornecedores
- **Abrir:** https://refactor-dev.jrfluxy.com.br/gestao-fornecedores
- **Ctrl+K:** digite `gestao fornecedores`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### gestao insumos
- **Abrir:** https://refactor-dev.jrfluxy.com.br/gestao-insumos
- **Ctrl+K:** digite `gestao insumos`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### nova solicitacao compra
- **Abrir:** https://refactor-dev.jrfluxy.com.br/solicitacoes-compra/nova
- **Ctrl+K:** digite `nova solicitacao compra`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

### nova compra direta
- **Abrir:** https://refactor-dev.jrfluxy.com.br/solicitacoes-compra-direta/nova
- **Ctrl+K:** digite `nova compra direta`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

### revisar solicitacao compra · 🚫 **NÃO ABRE**
- **Abrir:** https://refactor-dev.jrfluxy.com.br/solicitacoes-compra/revisar
- **Ctrl+K:** digite `revisar solicitacao compra`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.
- **Por que está sem dado:** a tela NÃO FOI MEDIDA: etapa de fluxo: os dados vêm do rascunho que a tela "nova" grava no NAVEGADOR, não do servidor — sem rascunho a tela devolve a 

### revisar compra direta · 🚫 **NÃO ABRE**
- **Abrir:** https://refactor-dev.jrfluxy.com.br/solicitacoes-compra-direta/revisar
- **Ctrl+K:** digite `revisar compra direta`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.
- **Por que está sem dado:** a tela NÃO FOI MEDIDA: mesma coisa da revisão de solicitação: o rascunho da compra direta vive no navegador e o passo seguinte CRIA a compra no ambien

### solicitacao compra detalhe · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** não tem endereço fixo — chega-se abrindo um registro na listagem do módulo.
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhum item informado nesta solicitacao.") — capacidade NÃO PROVADA

### pedido compra detalhe
- **Abrir:** não tem endereço fixo — chega-se abrindo um registro na listagem do módulo.
- **O que mudou:** Tela NUNCA MEDIDA até hoje (2.859 linhas, é onde a compra vira compromisso de pagamento). Faixa consertada.
- **O que olhar:** Olhe com atenção: é a primeira vez que ela passa por verificação. Faixa numa linha, itens, frete e comentários completos.

### compra finalizada
- **Abrir:** https://refactor-dev.jrfluxy.com.br/solicitacoes-compra/finalizada/1
- **Ctrl+K:** digite `compra finalizada`
- **O que mudou:** Reclassificada: é tela de confirmação, não de registro — por isso não tem seta de voltar.
- **O que olhar:** Só alcançável logo depois de criar uma compra.

### gerenciar cotacao
- **Abrir:** não tem endereço fixo — chega-se abrindo um registro na listagem do módulo.
- **O que mudou:** Bloco principal declarado, e a tela foi reclassificada como detalhe (a seta de voltar leva ao pedido, não é redundante).
- **O que olhar:** Seta de voltar leva ao detalhe da solicitação. Fornecedores e links continuam completos.

---

# Cadastros e Configurações — 34 tela(s)

## Lote 1 de 4

### usuarios
- **Abrir:** https://refactor-dev.jrfluxy.com.br/usuarios
- **Ctrl+K:** digite `usuarios`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### usuario novo
- **Abrir:** https://refactor-dev.jrfluxy.com.br/usuarios/novo
- **Ctrl+K:** digite `usuario novo`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

### obras
- **Abrir:** https://refactor-dev.jrfluxy.com.br/obras
- **Ctrl+K:** digite `obras`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### obra tipo apropriacao
- **Abrir:** https://refactor-dev.jrfluxy.com.br/obra-tipo-apropriacao
- **Ctrl+K:** digite `obra tipo apropriacao`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

### setores
- **Abrir:** https://refactor-dev.jrfluxy.com.br/setores
- **Ctrl+K:** digite `setores`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### areas obra
- **Abrir:** https://refactor-dev.jrfluxy.com.br/areas-obra
- **Ctrl+K:** digite `areas obra`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### setores visiveis usuario
- **Abrir:** https://refactor-dev.jrfluxy.com.br/setores-visiveis-usuario
- **Ctrl+K:** digite `setores visiveis usuario`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### tipos compartilhados setor
- **Abrir:** https://refactor-dev.jrfluxy.com.br/tipos-compartilhados-setor
- **Ctrl+K:** digite `tipos compartilhados setor`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### setores criacao todas obras
- **Abrir:** https://refactor-dev.jrfluxy.com.br/setores-criacao-todas-obras
- **Ctrl+K:** digite `setores criacao todas obras`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### setores acesso todas obras
- **Abrir:** https://refactor-dev.jrfluxy.com.br/setores-acesso-todas-obras
- **Ctrl+K:** digite `setores acesso todas obras`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

## Lote 2 de 4

### usuarios envio qualquer setor
- **Abrir:** https://refactor-dev.jrfluxy.com.br/usuarios-envio-qualquer-setor
- **Ctrl+K:** digite `usuarios envio qualquer setor`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### usuarios acesso prioridade diretoria
- **Abrir:** https://refactor-dev.jrfluxy.com.br/usuarios-acesso-prioridade-diretoria
- **Ctrl+K:** digite `usuarios acesso prioridade diretoria`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### config hub status setor
- **Abrir:** https://refactor-dev.jrfluxy.com.br/status-setor
- **Ctrl+K:** digite `config hub status setor`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### config permissoes setor
- **Abrir:** https://refactor-dev.jrfluxy.com.br/permissoes-setor
- **Ctrl+K:** digite `config permissoes setor`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### config cores sistema
- **Abrir:** https://refactor-dev.jrfluxy.com.br/cores-sistema
- **Ctrl+K:** digite `config cores sistema`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

### config areas por setor origem
- **Abrir:** https://refactor-dev.jrfluxy.com.br/areas-por-setor-origem
- **Ctrl+K:** digite `config areas por setor origem`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### config arquivos modelos
- **Abrir:** https://refactor-dev.jrfluxy.com.br/arquivos-modelos-config
- **Ctrl+K:** digite `config arquivos modelos`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### config provisionamento fluxo
- **Abrir:** https://refactor-dev.jrfluxy.com.br/configuracoes-provisionamento-fluxo
- **Ctrl+K:** digite `config provisionamento fluxo`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

### config acoes principais · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/configuracoes-acoes-principais
- **Ctrl+K:** digite `config acoes principais`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhum mapeamento — o detalhe da solicitação segue com as ações genéri")

### config atalhos setor · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/configuracoes-atalhos-setor
- **Ctrl+K:** digite `config atalhos setor`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhum atalho configurado — cada setor recebe as sugestões padrão do s")

## Lote 3 de 4

### config detalhe layout
- **Abrir:** https://refactor-dev.jrfluxy.com.br/configuracoes-detalhe-layout
- **Ctrl+K:** digite `config detalhe layout`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### config cotacao
- **Abrir:** https://refactor-dev.jrfluxy.com.br/configuracoes-cotacao
- **Ctrl+K:** digite `config cotacao`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

### config status pedido compra
- **Abrir:** https://refactor-dev.jrfluxy.com.br/configuracoes-status-pedidos-compra
- **Ctrl+K:** digite `config status pedido compra`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### config recebimento setor
- **Abrir:** https://refactor-dev.jrfluxy.com.br/comportamento-recebimento-setor
- **Ctrl+K:** digite `config recebimento setor`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### config suporte
- **Abrir:** https://refactor-dev.jrfluxy.com.br/configuracoes-suporte
- **Ctrl+K:** digite `config suporte`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

### config visibilidade ui
- **Abrir:** https://refactor-dev.jrfluxy.com.br/configuracoes-visibilidade-ui
- **Ctrl+K:** digite `config visibilidade ui`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### config notificacoes sistema
- **Abrir:** https://refactor-dev.jrfluxy.com.br/configuracoes-notificacoes-sistema
- **Ctrl+K:** digite `config notificacoes sistema`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### config modulos
- **Abrir:** https://refactor-dev.jrfluxy.com.br/configuracoes-modulos
- **Ctrl+K:** digite `config modulos`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### config timeout inatividade
- **Abrir:** https://refactor-dev.jrfluxy.com.br/timeout-inatividade
- **Ctrl+K:** digite `config timeout inatividade`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

### config permissoes areas padroes
- **Abrir:** https://refactor-dev.jrfluxy.com.br/permissoes-areas-padroes
- **Ctrl+K:** digite `config permissoes areas padroes`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

## Lote 4 de 4

### config permissoes areas
- **Abrir:** https://refactor-dev.jrfluxy.com.br/permissoes-areas
- **Ctrl+K:** digite `config permissoes areas`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### config hub
- **Abrir:** https://refactor-dev.jrfluxy.com.br/configuracoes
- **Ctrl+K:** digite `config hub`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### config cartoes recarga
- **Abrir:** https://refactor-dev.jrfluxy.com.br/configuracoes-cartoes-recarga
- **Ctrl+K:** digite `config cartoes recarga`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### arquivos modelos
- **Abrir:** https://refactor-dev.jrfluxy.com.br/arquivos-modelos
- **Ctrl+K:** digite `arquivos modelos`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

---

# Contratos e Comercial — 14 tela(s)

## Lote 1 de 2

### tipos sub contrato · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/tipos-sub-contrato
- **Ctrl+K:** digite `tipos sub contrato`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhum subtipo cadastrado para este recorte") — capacidade NÃO PROVADA

### config contrato alertas formas
- **Abrir:** https://refactor-dev.jrfluxy.com.br/configuracoes-formas-pagamento-solicitacao
- **Ctrl+K:** digite `config contrato alertas formas`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

### config contrato alertas assunto
- **Abrir:** https://refactor-dev.jrfluxy.com.br/configuracoes-contrato-alertas
- **Ctrl+K:** digite `config contrato alertas assunto`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

### config contrato obra categorias
- **Abrir:** https://refactor-dev.jrfluxy.com.br/contrato-obra-categorias
- **Ctrl+K:** digite `config contrato obra categorias`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### config comercial categorias
- **Abrir:** https://refactor-dev.jrfluxy.com.br/configuracoes-comercial-categorias
- **Ctrl+K:** digite `config comercial categorias`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

### comercial contratos
- **Abrir:** https://refactor-dev.jrfluxy.com.br/comercial/contratos
- **Ctrl+K:** digite `comercial contratos`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### comercial empreendimentos
- **Abrir:** https://refactor-dev.jrfluxy.com.br/comercial/empreendimentos
- **Ctrl+K:** digite `comercial empreendimentos`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### comercial unidades · ⚠ **SEM DADO** (8 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/comercial/unidades
- **Ctrl+K:** digite `comercial unidades`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhuma unidade comercial encontrada Cadastre a primeira unidade do em")

### comercial modelos contrato
- **Abrir:** https://refactor-dev.jrfluxy.com.br/comercial/modelos-contrato
- **Ctrl+K:** digite `comercial modelos contrato`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### comercial tabelas preco · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/comercial/tabelas-preco
- **Ctrl+K:** digite `comercial tabelas preco`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhuma tabela de preco cadastrada Monte a primeira tabela acima para ")

## Lote 2 de 2

### comercial mapa unidades
- **Abrir:** https://refactor-dev.jrfluxy.com.br/comercial/mapa-unidades
- **Ctrl+K:** digite `comercial mapa unidades`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### contratos novo
- **Abrir:** https://refactor-dev.jrfluxy.com.br/contratos/novo
- **Ctrl+K:** digite `contratos novo`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

### contratos rel operacional
- **Abrir:** https://refactor-dev.jrfluxy.com.br/contratos/relatorios/operacional
- **Ctrl+K:** digite `contratos rel operacional`
- **O que mudou:** Colunas de texto livre passaram a truncar com reticências e tooltip.
- **O que olhar:** Passe o mouse num nome cortado: o texto completo tem de aparecer.

### comercial rel operacional · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/comercial/relatorios/operacional
- **Ctrl+K:** digite `comercial rel operacional`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhum contrato encontrado no período.") — capacidade NÃO PROVADA

---

# CRM — 16 tela(s)

## Lote 1 de 2

### crm dashboard
- **Abrir:** https://refactor-dev.jrfluxy.com.br/crm/dashboard
- **Ctrl+K:** digite `crm dashboard`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### crm dashboard gerencial · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/crm/dashboard-gerencial
- **Ctrl+K:** digite `crm dashboard gerencial`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhum dado disponivel neste recorte.") — capacidade NÃO PROVADA

### crm dashboard sla
- **Abrir:** https://refactor-dev.jrfluxy.com.br/crm/dashboard-sla
- **Ctrl+K:** digite `crm dashboard sla`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### crm dashboard distribuicao · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/crm/dashboard-distribuicao
- **Ctrl+K:** digite `crm dashboard distribuicao`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhum responsavel com carteira ativa no periodo.") — capacidade NÃO PRO

### crm relatorio executivo
- **Abrir:** https://refactor-dev.jrfluxy.com.br/crm/relatorios/executivo
- **Ctrl+K:** digite `crm relatorio executivo`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### crm leads
- **Abrir:** https://refactor-dev.jrfluxy.com.br/crm/leads
- **Ctrl+K:** digite `crm leads`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### crm novo lead
- **Abrir:** https://refactor-dev.jrfluxy.com.br/crm/leads/novo
- **Ctrl+K:** digite `crm novo lead`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

### crm lead detalhe · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** não tem endereço fixo — chega-se abrindo um registro na listagem do módulo.
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhuma tarefa criada.") — capacidade NÃO PROVADA

### crm carteira · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/crm/carteira
- **Ctrl+K:** digite `crm carteira`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhum lead na sua carteira Ajuste a busca e os filtros — ou peca a di")

### crm kanban
- **Abrir:** https://refactor-dev.jrfluxy.com.br/crm/kanban
- **Ctrl+K:** digite `crm kanban`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

## Lote 2 de 2

### crm tarefas
- **Abrir:** https://refactor-dev.jrfluxy.com.br/crm/tarefas
- **Ctrl+K:** digite `crm tarefas`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### crm inbox
- **Abrir:** https://refactor-dev.jrfluxy.com.br/crm/inbox
- **Ctrl+K:** digite `crm inbox`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### crm automacoes · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/crm/automacoes
- **Ctrl+K:** digite `crm automacoes`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhuma automacao cadastrada Cadastre a primeira regra para padronizar")

### crm admin canais · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/crm/admin/canais
- **Ctrl+K:** digite `crm admin canais`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhum canal cadastrado Cadastre o primeiro canal para o CRM passar a ")

### crm admin numeros · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/crm/admin/numeros
- **Ctrl+K:** digite `crm admin numeros`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhum numero cadastrado Cadastre o primeiro numero para separar insti")

### crm admin integracoes · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/crm/admin/integracoes
- **Ctrl+K:** digite `crm admin integracoes`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhum evento registrado Assim que o webhook receber o primeiro evento")

---

# Fiscal — 9 tela(s)

## Lote 1 de 1

### fiscal dashboard
- **Abrir:** https://refactor-dev.jrfluxy.com.br/fiscal
- **Ctrl+K:** digite `fiscal dashboard`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### fiscal documentos
- **Abrir:** https://refactor-dev.jrfluxy.com.br/fiscal/documentos
- **Ctrl+K:** digite `fiscal documentos`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### fiscal documento detalhe · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** não tem endereço fixo — chega-se abrindo um registro na listagem do módulo.
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhum vinculo registrado nesta fase.") — capacidade NÃO PROVADA

### fiscal divergencias · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/fiscal/divergencias
- **Ctrl+K:** digite `fiscal divergencias`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhuma divergencia fiscal encontrada.") — capacidade NÃO PROVADA

### fiscal empresas
- **Abrir:** https://refactor-dev.jrfluxy.com.br/fiscal/empresas
- **Ctrl+K:** digite `fiscal empresas`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### fiscal rel operacional
- **Abrir:** https://refactor-dev.jrfluxy.com.br/fiscal/relatorios/operacional
- **Ctrl+K:** digite `fiscal rel operacional`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### fiscal logs
- **Abrir:** https://refactor-dev.jrfluxy.com.br/fiscal/logs
- **Ctrl+K:** digite `fiscal logs`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### fiscal diagnostico
- **Abrir:** https://refactor-dev.jrfluxy.com.br/fiscal/diagnostico
- **Ctrl+K:** digite `fiscal diagnostico`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### fiscal exportacao contabil · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/fiscal/exportacao-contabil
- **Ctrl+K:** digite `fiscal exportacao contabil`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhum lote contabil fiscal encontrado.") — capacidade NÃO PROVADA

---

# Provisionamento — 3 tela(s)

## Lote 1 de 1

### provisoes rel operacional
- **Abrir:** https://refactor-dev.jrfluxy.com.br/provisoes-financeiras/relatorios/operacional
- **Ctrl+K:** digite `provisoes rel operacional`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### provisao nova
- **Abrir:** https://refactor-dev.jrfluxy.com.br/provisoes-financeiras/nova
- **Ctrl+K:** digite `provisao nova`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

### provisoes categorias macro
- **Abrir:** https://refactor-dev.jrfluxy.com.br/provisoes-financeiras/categorias
- **Ctrl+K:** digite `provisoes categorias macro`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

---

# RH e DP — 8 tela(s)

## Lote 1 de 1

### usuarios permissoes rh dp
- **Abrir:** https://refactor-dev.jrfluxy.com.br/usuarios-permissoes-rh-dp
- **Ctrl+K:** digite `usuarios permissoes rh dp`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### rhdp pessoal · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/rh-dp/pessoal
- **Ctrl+K:** digite `rhdp pessoal`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhuma solicitacao neste filtro.") — capacidade NÃO PROVADA

### rhdp colaboradores
- **Abrir:** https://refactor-dev.jrfluxy.com.br/rh-dp/colaboradores
- **Ctrl+K:** digite `rhdp colaboradores`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### rhdp documentos · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/rh-dp/documentos
- **Ctrl+K:** digite `rhdp documentos`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhum documento localizado") — capacidade NÃO PROVADA

### rhdp importacoes
- **Abrir:** https://refactor-dev.jrfluxy.com.br/rh-dp/importacoes
- **Ctrl+K:** digite `rhdp importacoes`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### rhdp fechamentos
- **Abrir:** https://refactor-dev.jrfluxy.com.br/rh-dp/fechamentos
- **Ctrl+K:** digite `rhdp fechamentos`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### rhdp relatorio operacional
- **Abrir:** https://refactor-dev.jrfluxy.com.br/rh-dp/relatorios/operacional
- **Ctrl+K:** digite `rhdp relatorio operacional`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### modulo relatorios
- **Abrir:** https://refactor-dev.jrfluxy.com.br/rh-dp/relatorios
- **Ctrl+K:** digite `modulo relatorios`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

---

# Governança — 2 tela(s)

## Lote 1 de 1

### governanca sistema
- **Abrir:** https://refactor-dev.jrfluxy.com.br/governanca
- **Ctrl+K:** digite `governanca sistema`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### governanca auditoria
- **Abrir:** https://refactor-dev.jrfluxy.com.br/governanca/auditoria-operacional
- **Ctrl+K:** digite `governanca auditoria`
- **O que mudou:** A faixa de agrupamento da tabela estava desalinhada da primeira coluna.
- **O que olhar:** O rótulo do grupo ("Sessão observada…") deve começar alinhado com a primeira coluna de conteúdo.

---

# Custos e Recebíveis — 1 tela(s)

## Lote 1 de 1

### custos recebiveis
- **Abrir:** https://refactor-dev.jrfluxy.com.br/custos-recebiveis
- **Ctrl+K:** digite `custos recebiveis`
- **O que mudou:** A faixa do topo virou linha única (era 118px de altura) e a contagem passou a ser um número; a carteira consolidada virou o bloco principal.
- **O que olhar:** A faixa deve caber numa linha e mostrar "N obra(s)". Nada de texto pode ter sumido.

---

# SST — 12 tela(s)

## Lote 1 de 2

### sst dashboard · 🚫 **NÃO ABRE**
- **Abrir:** https://refactor-dev.jrfluxy.com.br/sst
- **Ctrl+K:** digite `sst dashboard`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela NÃO FOI MEDIDA: nao e politica de acesso: o MODO SIMPLIFICADO do SST esta ligado (SST_SIMPLIFIED_MODE em src/modules/sst/constants/sstResources

### sst rel operacional · 🚫 **NÃO ABRE**
- **Abrir:** https://refactor-dev.jrfluxy.com.br/sst/relatorios/operacional
- **Ctrl+K:** digite `sst rel operacional`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela NÃO FOI MEDIDA: nao e politica de acesso: o MODO SIMPLIFICADO do SST esta ligado (SST_SIMPLIFIED_MODE em src/modules/sst/constants/sstResources

### sst executivo · 🚫 **NÃO ABRE**
- **Abrir:** https://refactor-dev.jrfluxy.com.br/sst/relatorios/executivo
- **Ctrl+K:** digite `sst executivo`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela NÃO FOI MEDIDA: nao e politica de acesso: o MODO SIMPLIFICADO do SST esta ligado (SST_SIMPLIFIED_MODE em src/modules/sst/constants/sstResources

### sst centro operacional · 🚫 **NÃO ABRE**
- **Abrir:** https://refactor-dev.jrfluxy.com.br/sst/relatorios/centro-operacional
- **Ctrl+K:** digite `sst centro operacional`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela NÃO FOI MEDIDA: nao e politica de acesso: o MODO SIMPLIFICADO do SST esta ligado (SST_SIMPLIFIED_MODE em src/modules/sst/constants/sstResources

### sst heatmap · 🚫 **NÃO ABRE**
- **Abrir:** https://refactor-dev.jrfluxy.com.br/sst/relatorios/heatmap
- **Ctrl+K:** digite `sst heatmap`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela NÃO FOI MEDIDA: nao e politica de acesso: o MODO SIMPLIFICADO do SST esta ligado (SST_SIMPLIFIED_MODE em src/modules/sst/constants/sstResources

### sst observabilidade · 🚫 **NÃO ABRE**
- **Abrir:** https://refactor-dev.jrfluxy.com.br/sst/observabilidade
- **Ctrl+K:** digite `sst observabilidade`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela NÃO FOI MEDIDA: nao e politica de acesso: o MODO SIMPLIFICADO do SST esta ligado (SST_SIMPLIFIED_MODE em src/modules/sst/constants/sstResources

### sst producao · 🚫 **NÃO ABRE**
- **Abrir:** https://refactor-dev.jrfluxy.com.br/sst/producao
- **Ctrl+K:** digite `sst producao`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela NÃO FOI MEDIDA: nao e politica de acesso: o MODO SIMPLIFICADO do SST esta ligado (SST_SIMPLIFIED_MODE em src/modules/sst/constants/sstResources

### sst observabilidade avancada · 🚫 **NÃO ABRE**
- **Abrir:** https://refactor-dev.jrfluxy.com.br/sst/observabilidade-avancada
- **Ctrl+K:** digite `sst observabilidade avancada`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela NÃO FOI MEDIDA: nao e politica de acesso: o MODO SIMPLIFICADO do SST esta ligado (SST_SIMPLIFIED_MODE em src/modules/sst/constants/sstResources

### sst timeline · 🚫 **NÃO ABRE**
- **Abrir:** https://refactor-dev.jrfluxy.com.br/sst/timeline
- **Ctrl+K:** digite `sst timeline`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela NÃO FOI MEDIDA: nao e politica de acesso: o MODO SIMPLIFICADO do SST esta ligado (SST_SIMPLIFIED_MODE em src/modules/sst/constants/sstResources

### sst esocial · 🚫 **NÃO ABRE**
- **Abrir:** https://refactor-dev.jrfluxy.com.br/sst/esocial
- **Ctrl+K:** digite `sst esocial`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela NÃO FOI MEDIDA: nao e politica de acesso: o MODO SIMPLIFICADO do SST esta ligado (SST_SIMPLIFIED_MODE em src/modules/sst/constants/sstResources

## Lote 2 de 2

### sst configuracoes · 🚫 **NÃO ABRE**
- **Abrir:** https://refactor-dev.jrfluxy.com.br/sst/configuracoes
- **Ctrl+K:** digite `sst configuracoes`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela NÃO FOI MEDIDA: nao e politica de acesso: o MODO SIMPLIFICADO do SST esta ligado (SST_SIMPLIFIED_MODE em src/modules/sst/constants/sstResources

### sst crud · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/sst/pgr
- **Ctrl+K:** digite `sst crud`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhum registro encontrado.") — capacidade NÃO PROVADA

---

# Outras telas — 17 tela(s)

## Lote 1 de 2

### parceiros
- **Abrir:** https://refactor-dev.jrfluxy.com.br/parceiros
- **Ctrl+K:** digite `parceiros`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### parceiro categorias
- **Abrir:** https://refactor-dev.jrfluxy.com.br/parceiros-categorias
- **Ctrl+K:** digite `parceiro categorias`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### obra gestao
- **Abrir:** não tem endereço fixo — chega-se abrindo um registro na listagem do módulo.
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

### empresas grupo
- **Abrir:** https://refactor-dev.jrfluxy.com.br/empresas-grupo
- **Ctrl+K:** digite `empresas grupo`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### comunicacao interna
- **Abrir:** https://refactor-dev.jrfluxy.com.br/comunicacao-interna
- **Ctrl+K:** digite `comunicacao interna`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### comprovantes pendentes · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/comprovantes/pendentes
- **Ctrl+K:** digite `comprovantes pendentes`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhum comprovante pendente.") — capacidade NÃO PROVADA

### upload comprovantes
- **Abrir:** https://refactor-dev.jrfluxy.com.br/comprovantes/upload
- **Ctrl+K:** digite `upload comprovantes`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

### login
- **Abrir:** https://refactor-dev.jrfluxy.com.br/login
- **Ctrl+K:** digite `login`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

### recuperar senha
- **Abrir:** https://refactor-dev.jrfluxy.com.br/recuperar-senha
- **Ctrl+K:** digite `recuperar senha`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.

### definir senha · ⚠ **SEM DADO** (3 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/definir-senha
- **Ctrl+K:** digite `definir senha`
- **O que mudou:** Mudou pelo componente: aviso de sucesso agora fica na tela até você fechar.
- **O que olhar:** Salve algo e confira que o aviso NÃO some sozinho.
- **Por que está sem dado:** idem R1: os campos de senha ficam desabilitados no estado sem token

## Lote 2 de 2

### config automacao status setor
- **Abrir:** https://refactor-dev.jrfluxy.com.br/automacao-status-setor
- **Ctrl+K:** digite `config automacao status setor`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### inicio
- **Abrir:** https://refactor-dev.jrfluxy.com.br/
- **Ctrl+K:** digite `inicio`
- **O que mudou:** A TELA INICIAL foi migrada inteira para o padrão (ela nunca tinha sido).
- **O que olhar:** A faixa do topo agora gruda ao rolar e não some. O "x" que oculta um módulo cresceu de 20 para 32px de área — tente errar o clique de propósito. Nenhum bloco, atalho ou contador pode ter sumido.

### dashboard
- **Abrir:** https://refactor-dev.jrfluxy.com.br/dashboard
- **Ctrl+K:** digite `dashboard`
- **O que mudou:** Estava sendo medido na rota errada — a matriz media a tela inicial achando que era esta.
- **O que olhar:** Só confira que abre e que os atalhos levam aonde dizem.

### treinamento · ⚠ **SEM DADO** (7 item(ns))
- **Abrir:** https://refactor-dev.jrfluxy.com.br/treinamento
- **Ctrl+K:** digite `treinamento`
- **O que mudou:** Nada mudou na tela — a decisão de manter o cadastro embutido foi registrada.
- **O que olhar:** Só confirme que "Novo guia" abre o formulário na própria tela, como antes.
- **Por que está sem dado:** a tela TEM tabela, mas a base do preview não devolveu nenhuma linha (mostrou "Nenhum conteudo encontrado Nenhum conteudo para os filtros atuais. Lim")

### prioridades diretoria
- **Abrir:** https://refactor-dev.jrfluxy.com.br/prioridades-diretoria
- **Ctrl+K:** digite `prioridades diretoria`
- **O que mudou:** Mudou pelo componente de tabela: rodapé "N de M", rolagem infinita, menu de alinhamento e linha de base dos títulos.
- **O que olhar:** Rodapé embaixo da tabela com a contagem; clique no ícone ao lado do título de uma coluna — o menu de alinhamento tem de ABRIR e funcionar; e os títulos todos na mesma altura.

### perfil
- **Abrir:** https://refactor-dev.jrfluxy.com.br/perfil
- **Ctrl+K:** digite `perfil`
- **O que mudou:** Ganhou a seta de voltar.
- **O que olhar:** Seta à esquerda do título.

### hub modulo
- **Abrir:** https://refactor-dev.jrfluxy.com.br/hub/compras
- **Ctrl+K:** digite `hub modulo`
- **O que mudou:** Hub de módulo migrado para o padrão (também nunca tinha sido).
- **O que olhar:** Faixa fixa com o nome do módulo e a contagem de telas; os cards dentro de um bloco. Todos os subitens do módulo continuam lá.

---

