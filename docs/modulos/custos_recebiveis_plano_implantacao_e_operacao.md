# Custos e Recebíveis — Plano de Implantação no Fluxy e Manual de Operação

> **O que é este documento**
> Ele tem duas partes independentes:
>
> - **Parte A — Integração técnica:** explica, para quem vai desenvolver, exatamente
>   como o mockup aprovado (`.codex-previews/custos-recebiveis-fluxy-final.html`) vira
>   um módulo dentro do Fluxy, reaproveitando o que já existe e criando o mínimo novo,
>   sem interromper nenhum fluxo que hoje está em produção.
> - **Parte B — Manual de operação do dia a dia:** explica, em linguagem simples e
>   passo a passo, como qualquer pessoa (mesmo com pouca experiência com tecnologia)
>   usa o módulo no dia a dia.
>
> Referências: mockup final, `custos_recebiveis_totalbank_plano.md`,
> `custos_recebiveis_matriz_fontes_permissoes.md`,
> `HANDOFF_CUSTOS_RECEBIVEIS_MOCKUP_FINAL.md`.

---

# PARTE A — INTEGRAÇÃO DO NOVO MÓDULO AO FLUXY

## A.1. Ideia central da integração

O Custos e Recebíveis é um **módulo novo e independente**. Ele **não substitui** e
**não depende** de Provisionamento, Obras, Financeiro ou Comercial. Ele **lê** dados
que já existem no Fluxy e **grava apenas** em tabelas próprias, novas, com o prefixo
`cr_`.

A regra de ouro da implantação é: **nada que hoje funciona pode parar de funcionar.**
Por isso o módulo é ligado por uma *feature flag* (chave de liga/desliga) e só aparece
para quem tiver a permissão nova. Enquanto a flag estiver desligada, o Fluxy continua
exatamente como está hoje.

## A.2. Mapa do que JÁ EXISTE e como será reaproveitado

Boa parte do que o mockup mostra já existe no Fluxy. O módulo **reusa** essas peças —
não recria. A tabela abaixo é o coração da integração.

| Peça no mockup | Já existe hoje no Fluxy? | Como o módulo usa | O que muda |
| --- | --- | --- | --- |
| Cadastro de obras, empresa, cidade | **Sim** — modelo `Obra` (tabela de obras) | Somente leitura. O módulo lista e abre a obra, mas **não cria nem edita** cadastro. | Nada. Criar/editar obra continua no módulo Obras. |
| Classificação Pública / Privada | **Sim** — campo `Obra.classificacao` com valores `PUBLICA` / `PRIVADA` | É o "interruptor" que decide a jornada (medição x contratos de venda). | Nada no cadastro. O módulo apenas lê o campo. |
| Orçamento **macro** (planilha orçamentária que hoje é importada na obra) | **Sim** — modelo `Apropriacao` (tabela `apropriacoes`), importada por `ApropriacaoController.importarXlsx`, com modelo `modelo-apropriacoes-obras.xlsx` | Referência **somente leitura**. O módulo mostra a linha macro e compara com a planilha completa (micro), mas **nunca sobrescreve** `valor_orcado`. | Nada na tabela `apropriacoes`. Ver A.3 sobre a planilha completa. |
| Contratos de venda | **Sim** — `ContratoComercial` | Fonte dos recebíveis das obras **privadas** (contrato → unidade → cliente). | Nada. Consulta contextual. |
| Parcelas e recebíveis do contrato | **Sim** — `ContratoComercialParcela` (já tem o campo `titulo_financeiro_id`) | Previsão de recebível privado. Se a parcela já virou título, **o título manda** e a parcela não soma de novo (evita contagem dobrada). | Nada. |
| Títulos financeiros (a pagar / a receber) | **Sim** — `TituloFinanceiro` | Valor "incorrido" (faturado). | Nada. |
| Baixas / recebimentos | **Sim** — `MovimentoFinanceiro` | **Única** fonte do "realizado" (pago/recebido). Pedido e solicitação nunca provam caixa. | Nada. |
| Escopo de obra por usuário | **Sim** — `UsuarioObra` (tabela `usuarios_obras`, com `user_id`, `obra_id`, `perfil`) | Define quais obras cada pessoa enxerga. | Nada. Reutiliza o vínculo existente. |
| Painel de permissões granulares por **setor** | **Sim** — catálogo `MODULO_PERMISSION_GROUPS` (`constants/moduloPermissoes.js`) + padrões por setor/perfil (`padroes_setor_perfil`) | O módulo entra como **mais um grupo** no mesmo painel. | Acrescenta o grupo `custos_recebiveis.*`. |
| Painel de permissões por **usuário individual** | **Sim** — mesmo sistema, com sobrescrita por usuário (tela `PermissoesAreas.jsx`) | Permite liberar/bloquear ações por pessoa. | Nada na mecânica; só surgem permissões novas para marcar. |
| Usuários | **Sim** — modelo `User` | Autor de cada ação, responsável e substituto da obra. | Nada. |
| Importação de arquivo `.xlsx` (infraestrutura) | **Sim** — utilitário `utils/excelWorkbook.js`, e o padrão robusto da importação em massa de títulos (`FinanceiroTituloImportacao*`) | Reaproveita o **mesmo padrão** (validar em prévia, confirmar em transação, idempotência) para a planilha completa. | Reusa o padrão; grava em tabela nova. |

**Conclusão do mapa:** a maior parte do módulo é **consulta** ao que já existe. O que
é realmente novo é: (1) a planilha **completa** (micro) versionada, (2) o planejamento
mensal / medição, (3) o painel do módulo, (4) as permissões novas.

## A.3. O ponto sensível: a planilha completa (micro) e por que precisa de tabela nova

Hoje, na obra, importamos a **planilha orçamentária macro** — ela vira linhas na
tabela `apropriacoes` (código, descrição, valor orçado, hierarquia pai/somadora).
Essa planilha macro é usada por vários fluxos que **estão em produção** (Resultado de
Obras, DRE, apropriação de títulos, compras). **Mexer nela seria arriscado.**

O novo módulo precisa de uma planilha **completa e detalhada** (micro): o mesmo
orçamento aberto em muito mais linhas, por etapa e subitem, com quantidade e custo
unitário, **versionada** (cada reimportação é uma nova versão) e **congelada** quando a
competência fecha.

Se colocássemos esse detalhamento dentro de `apropriacoes`, quebraríamos os relatórios
atuais. Por isso a decisão: **tabelas novas, exclusivas do módulo.**

```
Orçamento MACRO (já existe)                 Planilha COMPLETA / MICRO (nova)
tabela: apropriacoes                        tabelas: cr_planos_obra, cr_plano_itens
- 1 linha por grande grupo                  - muitas linhas por etapa/subitem
- usada por Obras, DRE, Compras             - usada só pelo Custos e Recebíveis
- SOMENTE LEITURA para o módulo   <----->   - vinculada à linha macro por referência
                                            - versionada e congelada por competência
```

Tabelas novas propostas (todas com prefixo `cr_`, isoladas do resto):

| Tabela nova | Para que serve |
| --- | --- |
| `cr_planos_obra` | Cabeçalho da planilha completa, com número da versão. |
| `cr_plano_itens` | As linhas detalhadas (código, descrição, unidade, quantidade, custo unitário). |
| `cr_plano_macro_vinculos` | Liga cada linha micro à linha macro (`apropriacoes`) por referência — **somente leitura**. |
| `cr_importacoes` | Registro de cada arquivo importado (nome, hash, quem, quando, resultado). |
| `cr_competencias` | O estado de cada mês da obra (aberta, em preenchimento, enviada, fechada, reaberta). |
| `cr_previsoes_custo` / `cr_previsoes_receita` | O que o responsável planejou no mês. |
| `cr_medicoes_consolidadas` | Medição consolidada (obras públicas). |
| `cr_realizados` | Projeção do realizado a partir de títulos e baixas (idempotente). |
| `cr_responsaveis_obra` | Responsável e substituto por obra. |
| `cr_obrigacoes_usuario`, `cr_reaberturas`, `cr_auditoria` | Pendências, reaberturas e trilha de auditoria. |

> **Por que isso não interrompe nada:** todas essas tabelas são criadas do zero
> (migrations novas). Nenhuma tabela existente ganha coluna obrigatória, muda de tipo
> ou perde dado. Se o módulo for desligado, as tabelas `cr_` simplesmente ficam
> paradas, sem afetar o resto.

## A.4. O que é genuinamente NOVO (resumo)

1. **Tabelas** `cr_*` (item A.3).
2. **Back-end do módulo**: uma pasta própria `backend/src/modules/custosRecebiveis/`
   (controllers, services, validators, policies, projections, jobs, `routes.js`).
3. **Front-end do módulo**: uma pasta própria
   `frontend/src/modules/custos-recebiveis/` (páginas e componentes do mockup).
4. **Grupo de permissões** `custos_recebiveis.*` acrescentado ao catálogo
   `constants/moduloPermissoes.js` — passa a aparecer automaticamente no painel atual.
5. **Item de menu** "Custos e Recebíveis" no `Layout.jsx`, protegido por permissão.
6. **Feature flag** para ligar/desligar sem afetar ninguém.
7. **Contas Bancárias / TotalBank**: entra depois, em módulo próprio, também novo
   e independente (fase posterior — ver A.6).

## A.5. Como o controle de acesso se encaixa (setor + usuário)

O módulo usa **o mesmo painel de permissões que você já conhece**, com as duas camadas
que já existem hoje:

- **Por setor/perfil** (`padroes_setor_perfil`): define um padrão para todo mundo de um
  setor. Ex.: "responsáveis de obra podem preencher custos".
- **Por usuário individual** (sobrescrita na tela `PermissoesAreas.jsx`): ajusta uma
  pessoa específica. Ex.: liberar "aprovar reabertura" só para o gerente.

Além da permissão de **ação**, existe a regra de **escopo de obra** (quem vê qual obra),
que continua vindo de `UsuarioObra`. As duas coisas são **separadas** e essa separação
é obrigatória:

> **Regra de segurança:** permissão de ação **nunca** amplia o escopo de obra.
> Ter permissão para "editar planejamento" **não** libera uma obra que a pessoa não tem
> vínculo. Quem enxerga todas as obras precisa da permissão explícita e independente
> `custos_recebiveis.escopo.todas_obras` (ou ser SUPERADMIN). Estar no setor Financeiro
> ou Diretoria **não** dá acesso amplo sozinho.

Atenção técnica: existe hoje um atalho legado (`SETORES_ACESSO_TODAS_OBRAS`) que amplia
visibilidade por setor em outros fluxos. **O novo módulo não deve herdar esse atalho.**
A resolução de escopo do módulo usa apenas: SUPERADMIN → `escopo.todas_obras` explícito
→ `UsuarioObra`.

Permissões novas do grupo `custos_recebiveis.*` (marcadas no painel, por setor ou por
usuário):

- Entrada/escopo: `modulo.acessar`, `escopo.todas_obras`, `saldos_bancarios.visualizar`
- Ver: `dashboard.visualizar`, `comparativo.visualizar`, `obras.visualizar`,
  `estrutura_micro.visualizar`, `planejamento.visualizar`, `medicao.visualizar`,
  `realizados.visualizar`, `obrigacoes.visualizar`, `auditoria.visualizar`
- Fazer: `estrutura_micro.importar`, `estrutura_micro.publicar_versao`,
  `planejamento.preencher_custos`, `planejamento.preencher_recebiveis`,
  `planejamento.finalizar`, `medicao.consolidar`, `realizados.atualizar`,
  `realizados.reconciliar`, `reabertura.aprovar`, `obrigacoes.conceder_bypass`,
  `relatorio.exportar`, `configuracoes.gerenciar`

## A.6. Fases de implantação (sem regressão)

Cada fase é pequena, testável e reversível pela feature flag.

| Fase | O que entra | Garantia de não-regressão |
| --- | --- | --- |
| **0. Fundação** | Feature flag, grupo de permissões novo, migrations das tabelas `cr_`. Nada visível ao usuário comum. | Só cria tabelas novas e permissões novas. Menu e telas atuais intactos. |
| **1. Leitura + planilha completa** | Listagem de obras (com escopo), vínculo somente leitura ao macro, importação/versão da planilha micro. | Não toca `apropriacoes`. Importação grava só em `cr_*`. |
| **2. Planejamento e medição** | Assistente mensal (custos + medição/recebíveis), consolidação, comparativo, reabertura controlada. | Nenhuma alteração em títulos, contratos ou medições existentes. |
| **3. Realizado** | Projeção de realizado por títulos e baixas (idempotente), fila de "não mapeados", exportações. | Só lê `TituloFinanceiro`/`MovimentoFinanceiro`. Não cria baixa nem muda título. |
| **4. Obrigações (observação)** | Alertas D-7/D-3/D-1, painel de pendências, **guard só em modo observação**. | Ninguém é bloqueado. Mede falsos positivos antes de qualquer trava. |
| **5–7. Contas Bancárias / TotalBank** | Módulo bancário novo (posição, conciliação, integração homologada). | Fluxo Banco do Brasil atual preservado. TotalBank começa "a homologar". |
| **8. Bloqueio gradual** | Ativação da obrigação por piloto, com bypass auditado e rollback por flag. | Só depois de aceite do negócio. |

## A.7. Testes de regressão obrigatórios antes de liberar

- Provisionamento, Obras, DRE, Resultado de Obras e Compras continuam idênticos.
- Importar/editar a planilha **micro** não altera `apropriacoes` nem os relatórios macro.
- Reimportar a planilha cria **nova versão** e não altera competência já fechada.
- Usuário com permissão de editar **não** passa a ver obra sem vínculo.
- Pedido/solicitação **não** viram "pago" automaticamente; só baixa ativa conta.
- Estorno de baixa corrige o realizado **sem apagar** histórico.
- Com o módulo desligado (flag off), o Fluxy fica exatamente como hoje.
- Exportações respeitam empresa, obra e permissão.

## A.8. Checklist do que NUNCA é alterado nesta implantação

- Tabela `apropriacoes` (orçamento macro) e a importação atual de Obras.
- Modelos `Obra`, `ContratoComercial`, `ContratoComercialParcela`, `TituloFinanceiro`,
  `MovimentoFinanceiro`, `UsuarioObra`, `User` (nenhuma coluna removida/obrigatória nova).
- Mecânica do painel de permissões (só ganha itens novos).
- Fluxo Banco do Brasil e a importação em massa de títulos já existente.

---

# PARTE B — MANUAL DE OPERAÇÃO DO DIA A DIA

> **Para quem é esta parte:** para qualquer pessoa que vai **usar** o módulo —
> especialmente responsáveis de obra. Não é preciso saber nada de tecnologia.
> Vá seguindo os passos numerados. Onde aparecer 🟦 é uma dica; onde aparecer ⚠️ é um
> cuidado importante.

## B.1. Palavras que você vai encontrar (glossário rápido)

| Palavra | O que significa, em linguagem simples |
| --- | --- |
| **Obra pública / privada** | Tipo da obra. **Pública** = você registra *medição* (o quanto foi executado e será cobrado). **Privada** = os recebíveis vêm dos *contratos de venda* das unidades; não tem medição. |
| **Competência** | O mês que você está trabalhando (ex.: julho/2026). |
| **Planejamento** | O que você *espera* que aconteça no mês (custos e recebimentos previstos). |
| **Previsto** | O valor planejado. |
| **Comprometido** | Já tem pedido de compra fechado, mas ainda não foi pago. |
| **Incorrido** | Já virou título (conta) financeiro, mas ainda não foi pago. |
| **Realizado / Baixa** | Dinheiro que **de fato** entrou ou saiu. Só conta quando existe a *baixa* (o pagamento/recebimento efetivo). |
| **Medição** | Nas obras públicas, é o quanto foi executado e vai ser cobrado no mês. |
| **Recebível** | Dinheiro que a empresa tem para receber (nas privadas, vem das parcelas dos contratos). |
| **Versão da planilha** | Cada vez que você importa a planilha completa, nasce uma versão nova, sem apagar a anterior. |
| **Escopo** | O conjunto de obras que **você** pode ver. |

🟦 **Regra que resolve 90% das dúvidas:** *previsto* é o que você planeja; *realizado* é
o que aconteceu de verdade (baixa). Um pedido ou uma solicitação **nunca** significam
que foi pago.

## B.2. Como entrar e se localizar na tela

1. Faça login no Fluxy normalmente.
2. No menu do lado esquerdo, clique em **"Custos e Recebíveis"**.
3. No topo da área, você verá **três seletores** que valem para todas as telas:
   - **Obra** — escolha a obra que vai trabalhar.
   - **Classificação** — mostra se é *Pública* ou *Privada* (vem do cadastro da obra).
   - **Competência** — o mês (ex.: julho/2026).
4. Do lado esquerdo ficam os atalhos das telas: *Visão geral, Obras, Workspace da obra,
   Planejamento mensal, Comparativo, Custo realizado, Obrigações e prazos, Importações,
   Exportações, Configurações*.

⚠️ **Se você não encontrar uma obra na lista:** provavelmente ela não está vinculada ao
seu usuário. Isso é proposital (você só vê as suas obras). Fale com quem administra os
acessos para pedir o vínculo — ver B.9.

## B.3. A rotina mensal do responsável de obra (o fluxo principal)

Esta é a tarefa mais comum. Você faz uma vez por mês, para cada obra.

### Passo a passo

1. Entre em **Custos e Recebíveis** e escolha a **obra** e a **competência** (o mês) no topo.
2. Clique em **"Planejamento mensal"** (ou no botão **"Registrar agora"** da Visão geral).
3. Você verá **3 etapas** no topo (é um assistente, um passo de cada vez):

   **Etapa 1 — Recebimentos do mês**
   - Se a obra for **pública**: aparece **Medição prevista**. Informe a *quantidade
     prevista* de cada item (o sistema calcula o valor). Confira a data prevista.
   - Se a obra for **privada**: aparece **Recebíveis (contratos)**. O sistema já traz
     as parcelas dos contratos de venda. Você só **confere e confirma** — não precisa
     digitar contrato nenhum. Clique em **"Confirmar mês"**.
   - Clique em **"Próximo"**.

   **Etapa 2 — Custos do mês**
   - Informe a *quantidade* e o *custo unitário* previstos de cada item.
   - Se faltar uma linha, use **"+ Subitem"**.
   - Clique em **"Próximo"**.

   **Etapa 3 — Revisão**
   - Confira os totais (recebíveis previstos, custo previsto e margem).
   - Se estiver tudo certo, clique em **"Finalizar competência"**.

4. Pronto. Aparece uma mensagem de confirmação e o mês fica registrado.

🟦 **Não terminou agora?** Use **"Salvar rascunho"** a qualquer momento. Você volta
depois e continua de onde parou. Nada se perde.

⚠️ **Depois de "Finalizar", o mês fica travado (imutável).** Se precisar corrigir, é
necessário pedir uma **reabertura** (ver B.8), que fica registrada com o motivo.

## B.4. Importar ou atualizar a planilha completa (micro)

A planilha completa é o orçamento detalhado da obra usado só neste módulo. Ela **não
mexe** na planilha orçamentária que a obra já tem.

1. Clique em **"Importações"**.
2. Clique em **"Baixar modelo"** para pegar a planilha em branco (`.xlsx`), se ainda
   não tiver.
3. Preencha o modelo com os itens (código, descrição, unidade, quantidade, custo).
4. Clique em **"Nova importação"**.
5. Escolha a **obra de destino** e selecione o **arquivo** preenchido.
6. Escreva o **motivo da versão** (obrigatório quando é reimportação).
7. Clique em **"Validar"**. O sistema mostra quantas linhas estão certas e quantas têm
   erro. Corrija o arquivo se precisar.
8. Clique em **"Importar"**. Isso cria uma **nova versão** (ex.: v4) em rascunho.
9. Quando estiver conferida, alguém com permissão **publica a versão** para ela passar
   a valer.

🟦 **Cada importação vira uma versão nova.** A versão anterior **não** é apagada, e meses
já fechados **não** mudam. Você pode acompanhar todas as versões na própria tela de
Importações.

## B.5. Acompanhar o custo realizado

1. Clique em **"Custo realizado"**.
2. Você vê a lista de **Solicitações e títulos**, na sequência:
   *solicitação → pedido → título → baixa*.
3. Cada linha tem um **estado**:
   - **Baixa ativa** = foi pago de verdade (conta no realizado).
   - **Incorrido** = já tem título, mas ainda não foi pago.
   - **Não mapeado** = há um gasto sem item correspondente na planilha (precisa de
     atenção).
4. Para trazer os dados mais recentes, clique em **"Atualizar realizações"**. Isso só
   reprocessa — **não cria** pagamento e **não muda** título nenhum.
5. Se aparecer **"Não mapeado"**, clique em **"Reconciliar"** e ligue aquele gasto ao
   item certo. ⚠️ O valor nunca é descartado; ele fica na fila até ser reconciliado.

## B.6. Comparar previsto x realizado e exportar

- **Comparativo:** clique em **"Comparativo"**, escolha a base (*Medido previsto* ou
  *Realizado consolidado*) e veja, por grupo, o previsto, o realizado e o desvio.
- **Exportações:** clique em **"Exportações"** e baixe o relatório que precisar
  (Medição/recebíveis, Custos, Comparativo, Custo realizado, Solicitações e títulos ou
  Resumo) em **CSV** ou **XLSX**.

🟦 A exportação traz **apenas** as obras que você pode ver. Ela não amplia acesso.

## B.7. Obrigações e prazos (o que os alertas querem dizer)

1. Clique em **"Obrigações e prazos"**.
2. **"Minhas pendências"** mostra o que falta e o prazo.
3. Os avisos significam:
   - **D-7 / D-3 / D-1** = faltam 7, 3 ou 1 dia para o prazo.
   - **Vencido** = o prazo passou.
4. Para resolver, clique na pendência e ela te leva à tela certa (geralmente o
   Planejamento mensal).

⚠️ **Hoje o sistema está em "modo observação":** ele **avisa**, mas **não bloqueia**
ninguém. O bloqueio só será ligado no futuro, com aviso e aprovação da diretoria.

## B.8. Corrigir um mês já fechado (reabertura)

1. Um mês **finalizado** fica travado.
2. Para corrigir, use **"Solicitar reabertura"**, informando o **motivo**.
3. Alguém com permissão de aprovar analisa e libera.
4. A versão anterior é preservada e tudo fica registrado (quem pediu, quem aprovou,
   por quê).

## B.9. Problemas comuns e o que fazer

| Situação | O que provavelmente é | O que fazer |
| --- | --- | --- |
| "Não vejo minha obra na lista." | A obra não está vinculada ao seu usuário. | Peça o vínculo a quem administra acessos (é o `UsuarioObra`). |
| "Vejo a obra, mas não consigo editar/preencher." | Você tem acesso de *ver*, mas não a permissão da *ação*. | Peça a permissão específica (ex.: `planejamento.preencher_custos`) no painel de permissões. |
| "A obra privada está pedindo medição." | Classificação errada no cadastro. | A obra pode estar como *Pública*. Ajuste no cadastro de Obras. |
| "Meu pedido está pago, mas não aparece no realizado." | Ainda não existe a **baixa**. | O realizado só conta com a baixa (pagamento efetivo). Confirme com o Financeiro. |
| "Importei a planilha e o orçamento antigo da obra não mudou." | Isso é **o esperado**. | A planilha completa é separada e não altera o orçamento macro. |
| "Apareceu um gasto como *não mapeado*." | Gasto sem item correspondente na planilha. | Use **Reconciliar** no Custo realizado e ligue ao item certo. |

## B.10. Quem faz o quê (papéis sugeridos)

| Papel | O que vê | O que faz |
| --- | --- | --- |
| **Responsável da obra** | Suas obras | Preenche custos e recebíveis/medição, salva rascunho e finaliza o mês. |
| **Substituto** | As mesmas obras, durante a vigência | As ações que forem liberadas para ele. |
| **Financeiro (selecionado)** | Obras autorizadas | Acompanha títulos, realizado e reconcilia; não edita planejamento por padrão. |
| **Diretoria** | Portfólio (com permissão ampla explícita) | Acompanha comparativos e obrigações; aprova/reabre conforme permissão. |
| **Administrador de acessos** | Painel de permissões | Vincula obras a usuários e marca permissões por setor/usuário. |

---

## Anexo — Correspondência mockup → implementação

| Tela do mockup | Onde nasce no Fluxy | Principais fontes de dados |
| --- | --- | --- |
| Visão geral | Nova página do módulo | `Obra`, `cr_previsoes_*`, `TituloFinanceiro`, `MovimentoFinanceiro` |
| Obras | Nova página (lista com escopo) | `Obra` + `UsuarioObra` |
| Workspace / Estrutura micro | Novas páginas | `cr_planos_obra`, `cr_plano_itens`, vínculo a `apropriacoes` |
| Planejamento mensal | Novo assistente | `cr_previsoes_custo`, `cr_previsoes_receita`, `ContratoComercialParcela` (privada) |
| Comparativo | Nova página | `cr_previsoes_*`, `cr_medicoes_consolidadas`, títulos/baixas |
| Custo realizado | Nova página | `TituloFinanceiro`, `MovimentoFinanceiro`, `cr_realizados` |
| Importações | Nova página (padrão do import de títulos) | `cr_importacoes`, `utils/excelWorkbook.js` |
| Configurações / Permissões | Painel já existente | `moduloPermissoes.js` (grupo novo) + `padroes_setor_perfil` |
| Contas Bancárias (resumido) | Módulo bancário novo (fase posterior) | `ContaBancaria`, read model bancário, TotalBank a homologar |

> **Estado atual:** este documento é o plano. Nenhum controller, service, model,
> migration, rota, permissão ou tela de produção foi criado ou alterado. A implantação
> começa pela Fase 0 (A.6), sempre protegida por feature flag.
