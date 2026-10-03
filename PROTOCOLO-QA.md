# Protocolo de QA — Fluxy V4

Regra definida pelo usuário em 2026-08-15 e válida para todo o projeto.

> **Quem escreve não aprova.** Toda alteração de código precisa ser validada por um agente
> diferente daquele que a escreveu, com **provas reais** — prints do sistema funcionando e
> demonstração de que o comportamento sob erro também está correto.

---

## 0. Mapa de impacto antes de codar

> Regra definida pelo usuário em 2026-08-16, **obrigatória para toda alteração do sistema**.

Antes da primeira linha de código, produzir um **mapa de impacto escrito** do que será
afetado, e traçar a rota de implementação a partir dele.

### O que o mapa precisa ter

| Item | Por quê |
|---|---|
| **Todas** as formas de consulta ao dado afetado | Filtros positivos, negativos **e consultas sem filtro nenhum** |
| Números reais, não estimativa | Quantos arquivos, quantas consultas, quantos registros |
| O que **não** é afetado | Dimensiona o risco e evita mudança desnecessária |
| Rota em etapas, com dependências | Evita retrabalho e etapa que depende de outra inacabada |
| Ponto de verificação de cada etapa | Definido antes, não depois de implementar |

### Regras de método

- **Nunca generalizar a partir de amostra.** "Verifiquei dois e concluí sobre todos" é o
  padrão de erro que originou esta regra — custou duas auditorias reprovadas.
- **Preferir a solução que elimina a classe do problema.** Se a correção depende de lembrar
  de todos os pontos hoje e no futuro, é remendo.
- Atenção especial a **consultas sem filtro**: costumam ser o padrão natural do código, e por
  isso são as que mais escapam.

Exemplo de referência: `MAPA-IMPACTO-PARCELAS.md`.

---

## 1. Papéis

| Papel | Faz | Não faz |
|---|---|---|
| **Implementador** | Escreve o código e descreve o que fez | Não aprova o próprio trabalho. Não produz o veredito. |
| **Auditor QA** | Testa de forma independente, gera evidências, emite veredito | Não escreve código de produção. Só cria arquivos em `qa/`. |

O auditor recebe o **alvo** e a **alegação a verificar**, nunca a garantia de que está certo.
A instrução que ele recebe é explícita: *tente derrubar, não confirmar*.

Se o auditor encontrar falha, o implementador corrige e a auditoria **recomeça** — com
evidência nova. Auditoria não se herda de versão anterior do código.

---

## 2. O que conta como prova

Afirmação sem artefato não vale. Cada teste precisa deixar rastro verificável:

| Tipo | Formato | Onde fica |
|---|---|---|
| Print de tela | PNG do sistema real, navegador de verdade | `qa/evidencias/<suite>/` |
| Resposta de API | JSON salvo em arquivo | `qa/evidencias/<suite>/` |
| Caso de teste | Script Node re-executável por qualquer pessoa | `qa/<suite>/` |
| Relatório | Markdown com tabela de casos e veredito | `qa/relatorios/<suite>.md` |

**Não conta como prova:** "testei e funcionou", "o código parece correto", "a lógica está
certa", leitura de código sem execução.

---

## 3. Forçar erro é obrigatório

Um teste que só percorre o caminho feliz não aprova nada. Toda auditoria precisa demonstrar
que o sistema **se comporta corretamente quando as coisas dão errado**. No mínimo:

- Entrada inválida, vazia, nula, gigante
- Credencial errada e usuário inexistente
- Acesso sem permissão → precisa ser negado, com o código HTTP correto
- Tentativa de burlar a proteção que está sendo testada
- Valores inesperados em configuração (variável com valor estranho deve cair no padrão seguro)

Um comportamento de erro correto é: mensagem clara, código de status adequado, nada de stack
trace vazando caminho interno, nada de falha silenciosa. **Falha silenciosa é o pior
resultado possível** — pior que erro explícito.

---

## 4. Veredito

Todo relatório termina com **APROVADO** ou **REPROVADO**, explícito, com justificativa.

Reprova automaticamente:

- Qualquer caminho que contorne uma proteção que deveria estar ativa
- Falha silenciosa (o sistema segue como se estivesse tudo bem, mas não está)
- Requisição saindo para fora de `127.0.0.1` (viola o isolamento — ver `AMBIENTE-LOCAL.md`)
- Comportamento que quebre produção quando o código for migrado
- Evidência ausente para alguma alegação

Se algo **não pôde** ser provado, o relatório diz isso explicitamente. Não se presume
funcionamento.

---

## 5. Ferramentas

### 5.1 Harness próprio — `qa/lib/sessao.js`

Chrome real via `puppeteer-core` (já instalado no backend), headless, salva PNG em disco.
Registra requisições e erros de console, o que serve de prova de isolamento.

```js
const { abrirSessao } = require('./lib/sessao');
const s = await abrirSessao({ suite: 'minha-suite' });
await s.login();
await s.irPara('/solicitacoes');
await s.shot('01-lista');
console.log(s.urlsExternas()); // precisa ser []
await s.fechar();
```

Configurável por env: `QA_FRONTEND_URL`, `QA_API_URL`, `QA_EMAIL`, `QA_SENHA`, `QA_CHROME_PATH`.

Validar o instrumento: `node qa/smoke-harness.js`

### 5.2 Playwright MCP

Configurado em `.mcp.json` (escopo do projeto), travado no isolamento do ambiente:

- `--allowed-origins` restrito a `127.0.0.1:5273` e `127.0.0.1:8100`
- `--isolated` — perfil em memória, não persiste sessão em disco
- `--headless`
- saída em `qa/evidencias/playwright`

Também registrado em `claude_desktop_config.json` conforme pedido pelo usuário.

> Requer reiniciar o app para carregar. Um MCP recém-configurado **não** fica disponível na
> sessão em que foi criado.

Use o Playwright MCP para exploração interativa e o harness próprio para testes
re-executáveis versionados. Os dois convivem.

---

## 6. Regras para os agentes de QA

Instruções que todo auditor recebe, para não destruir o ambiente de trabalho:

1. **Nunca parar, reiniciar ou reconfigurar** o backend da porta 8100 nem o frontend da 5273.
2. Precisa de configuração diferente? Suba **instância própria em outra porta**, passando as
   variáveis pelo processo — o `dotenv` não sobrescreve env já definida. Ex.:
   `PORT=8199 MFA_POLICY_ENABLED=true node server.js`. Matar ao terminar.
3. **Não editar nada fora de `qa/`.** Correção proposta vai como texto no relatório, não como
   commit. Isso mantém a separação entre quem escreve e quem audita.
4. Não alterar dados do banco além do necessário; se alterar, restaurar.
5. Confirmar ao final que 8100 e 5273 continuam no ar.
6. **Bateria interrompida deixa estrago.** As suítes que concedem permissão gravam uma linha nova
   em `PERMISSOES_AREAS_USUARIOS`, e essa configuração é **versionada**: a linha de maior `id` vale
   para o **sistema inteiro** enquanto existir. A limpeza roda no `finally` — mas um `Ctrl+C` ou um
   timeout da bateria mata o processo antes dele, e a linha de teste fica mandando no sistema. O
   sintoma não é um erro claro: é uma suíte qualquer reprovando por um motivo que não tem nada a ver
   com ela, porque *"nenhuma permissão configurada"* é tratado como **liberado**.

   Por isso `qa/lib/sessao.js` confere isso no `require` — antes de qualquer SQL da suíte — e
   **recusa começar** se a configuração efetiva tiver pouquíssimos usuários. A conferência mora no
   carregamento do módulo, e não em `abrirSessao`, porque várias suítes abrem uma segunda sessão
   depois de conceder as permissões delas, e ali a configuração pequena é legítima.

   Restaurar é **publicar a última configuração real como versão nova** (`INSERT ... SELECT valor
   FROM ... WHERE id = <a boa>`), e não apagar a linha ruim: a configuração é versionada, e
   corrigir versionado se faz acrescentando.
7. **Rodar a bateria descartando a saída esconde justamente a falha que importa.** Use
   `node qa/rodar-bateria.js` (aceita filtros: `node qa/rodar-bateria.js 33 42`), que guarda a saída
   inteira de cada suíte em `qa/relatorios/bateria/<suíte>.log` e imprime só o veredito. Em 23/08
   uma suíte reprovou uma vez, passou nas três execuções seguintes, e o motivo tinha sido descartado
   no instante em que aconteceu — falha que não se reproduz é a que mais precisa de registro.

   As suítes **não** rodam em paralelo: compartilham o banco, a sequência de código de contrato e a
   configuração de permissões.
8. **Enquanto a bateria roda, o ambiente é dela.** Não rode outra suíte, não reinicie o backend, não
   aplique script de dados. O motivo é o mesmo do item 7 — banco, sequência de contrato e
   configuração de permissões são compartilhados —, mas o estrago é maior: em 24/08 uma bateria
   reprovou **sete** suítes de uma vez porque eu rodei suítes avulsas e reiniciei a 8100 por cima
   dela.

   As sete falharam **no `require`**, antes de qualquer prova: o guarda do item 7 viu a configuração
   de permissões de outra suíte valendo e recusou começar. Ou seja, o guarda funcionou — o resultado
   inteiro daquela bateria é que não valia nada, e levou meia hora para ser produzido.

   Se precisar mexer no ambiente, **pare a bateria antes** e rode de novo depois. Uma bateria
   interrompida custa menos que uma bateria mentirosa.

---

## 7. Estrutura

```
qa/
├── lib/sessao.js              harness de evidências
├── smoke-harness.js           teste do próprio instrumento
├── <suite>/*.js               casos de teste re-executáveis
├── evidencias/<suite>/*.png   provas visuais
└── relatorios/<suite>.md      relatório + veredito
```

---

## 8. Relação com a migração

Nenhuma alteração entra no inventário de `MIGRACAO-PARA-PRODUCAO.md` como pronta para
produção sem relatório **APROVADO** correspondente em `qa/relatorios/`.

O checklist final daquele documento pressupõe que essa etapa já aconteceu.
