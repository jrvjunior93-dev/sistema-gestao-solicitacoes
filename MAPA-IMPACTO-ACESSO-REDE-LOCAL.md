# Mapa de impacto — liberar o Fluxy V4 na rede local

Data: 21/08/2026. Escrito antes da primeira linha de código (regra §6).

> **Nota de 25/08 — o IP mudou, e a decisão se pagou.**
>
> O endereço já mudou duas vezes por DHCP: `192.168.1.66` (21/08) → `192.168.0.202` (25/08) →
> **`192.168.1.229`** (27/08). **Nada precisou ser
> reconfigurado**: nem o `.env.local`, nem o Vite, nem o backend. Bastou abrir o endereço novo.
>
> É exatamente o cenário previsto no §"Por que o caminho A" abaixo, que descartou apontar
> `VITE_API_URL` para o IP absoluto justamente porque *"no dia em que mudar, o B para de
> funcionar"*. Esse dia chegou em quatro dias.
>
> **Os IPs `192.168.1.66` citados daqui para baixo ficam como estavam**, de propósito: este
> documento registra o que era verdade em 21/08, e reescrevê-lo apagaria a prova de que a previsão
> se confirmou. O endereço vigente vive em `MIGRACAO-PARA-PRODUCAO.md` §9, que é documento vivo.

Pedido: liberar o acesso na rede local. O `ipconfig` mostra o endereço útil no adaptador **Wi-Fi**:

```
IPv4 . . . : 192.168.1.66
Máscara. . : 255.255.254.0     (rede 192.168.0.0/23)
Gateway. . : 192.168.1.1
```

Os outros adaptadores não servem: `172.22.128.1` e `172.26.224.1` são redes virtuais (Hyper-V e
WSL), `192.168.137.1` é o compartilhamento de conexão e `54.232.189.113` é um loopback do Topaz —
esse último parece um IP público, mas é local e não roteia nada.

---

## 1. O que já está pronto e o que falta

| Peça | Hoje | Precisa |
|---|---|---|
| Backend (8100) | escuta em `0.0.0.0` | nada |
| Vite (5273) | escuta em `127.0.0.1` | escutar em todas as interfaces |
| `VITE_API_URL` | `http://127.0.0.1:8100` | virar relativo |
| Proxy do Vite | só `/api` | também `/uploads` |
| CORS do backend | `127.0.0.1:5273` e `localhost:5273` | aceitar a origem da rede |
| Firewall do Windows | fechado | regra de entrada na 5273 |

## 2. A decisão que muda tudo: uma porta só, pelo proxy

Há dois caminhos:

**A. Só a porta do Vite, com o proxy fazendo a ponte para o backend.** O navegador chama o próprio
endereço de onde carregou a página, e o Vite repassa para o backend em `127.0.0.1:8100`.

**B. Expor as duas portas** e apontar `VITE_API_URL=http://192.168.1.66:8100`.

Vou de **A**, por três razões concretas:

1. **Nada fica preso ao IP.** `192.168.1.66` vem de DHCP; no dia em que mudar, o B para de funcionar
   e ninguém vai lembrar por quê. No A, quem abre `http://<ip>:5273` fala com esse mesmo `<ip>`, seja
   ele qual for.
2. **Uma porta no firewall em vez de duas.** O backend continua acessível só de dentro da máquina.
3. **Sem CORS entre navegador e backend.** Para o navegador é tudo a mesma origem.

### O detalhe que o A exige: `/uploads`

O proxy cobre só `/api`, mas o backend serve anexos em `/uploads`, e `fileUrl()` monta esse caminho a
partir de `API_ORIGIN`. Com a URL relativa, `API_ORIGIN` fica vazio e o caminho vira `/uploads/...`
**na origem do Vite** — que hoje não sabe repassá-lo, e todo anexo daria 404. O proxy passa a cobrir
os dois.

### E o CORS, se é tudo mesma origem?

Para o **navegador**, sim. Mas o `Origin` do navegador é repassado ao backend, e o middleware de CORS
recusa origem desconhecida **no servidor**, com 403 — a requisição morreria mesmo sem o navegador
reclamar. Então a origem da rede entra em `CORS_ALLOWED_ORIGINS`.

**E aqui o plano original não funcionou** — ver §7.

## 3. Variáveis

| Variável | Onde | Valor |
|---|---|---|
| `VITE_API_URL` | `frontend/.env.local` | passa de `http://127.0.0.1:8100` para `/api` |
| `VITE_DEV_API_PROXY_TARGET` | `frontend/.env.local` | **nova**: `http://127.0.0.1:8100` |
| ~~`CORS_ALLOWED_ORIGINS`~~ | `backend/.env` | **não mudou** — não era o lugar; ver §7 |

`VITE_DEV_API_PROXY_TARGET` é nova porque `VITE_API_URL` acumulava dois papéis: o endereço que o
**navegador** chama e o alvo que o **proxy do Vite** repassa. Tornando o primeiro relativo, o segundo
some — o proxy ficaria sem destino. Separar os dois é o que permite a URL do navegador ser relativa.

Vai para `MIGRACAO-PARA-PRODUCAO.md`, conforme a regra. Em produção nenhuma das três se aplica assim:
lá o frontend é servido estático e não há dev server.

## 4. O firewall é com você

Criar regra no Firewall do Windows é alteração de configuração de segurança do sistema e exige
administrador — deixo o comando pronto no relato, para você rodar num PowerShell elevado. Não executo.

## 5. O que isso expõe — e vale você decidir sabendo

O banco `fluxy_main_copia` é **cópia da produção**: dados reais de contratos, parceiros e financeiro.
Liberando a 5273 na Wi-Fi, qualquer aparelho na mesma rede alcança a tela de login — a autenticação
continua valendo, mas a superfície deixa de ser só esta máquina.

Se a rede for compartilhada (visitantes, Wi-Fi aberto), o mais seguro é restringir a regra do
firewall à faixa da sua sub-rede em vez de deixá-la aberta. O comando que vou passar já faz isso.

## 6. O que pode quebrar

| Risco | Verificação |
|---|---|
| Anexos deixarem de abrir | Baixar um anexo pelo `/uploads` a partir do IP da rede |
| Login parar de funcionar | Entrar pelo IP da rede e pelo 127.0.0.1 |
| Backend recusar por CORS | Conferir que não aparece `[CORS_BLOCKED]` no log |
| Suítes de QA quebrarem | Elas usam `127.0.0.1:5273` — continua valendo |
| Recarregamento automático (HMR) parar | Editar um arquivo e ver a tela atualizar pelo IP |

---

## 7. O que o teste mostrou: `CORS_ALLOWED_ORIGINS` não era o lugar

O plano era pôr `http://192.168.*.*:5273` em `CORS_ALLOWED_ORIGINS`. Testando pelo IP da rede, veio
`403` e `[CORS_BLOCKED]` no log — com `allowed_origins_count: 4`, e as minhas entradas não estavam
entre as quatro.

Dois motivos, os dois escritos no código:

1. **A variável de ambiente é só um padrão.** O `allowed_origins` que vale em execução vem da linha
   `INSTALACAO_CONFIG` no banco — os quatro domínios de produção (`jrfluxy.com.br` e companhia).
   `CORS_ALLOWED_ORIGINS` só entra quando essa linha não existe.
2. **Curinga é descartado.** `normalizeAllowedOrigins` filtra `!item.includes('*')`. O suporte a `*`
   existe em `matchesOriginPattern` e nunca recebe nada — o filtro corta antes.

Nenhum dos dois é acidente: são decisões de segurança do sistema, e forçá-las seria enfraquecer
CORS em produção para resolver um problema de desenvolvimento.

**Onde a liberação foi feita, então:** em `isLocalOrigin`, que já era exatamente "a origem é a
máquina de desenvolvimento?". Ela passou a aceitar também as faixas privadas da RFC 1918 (`10.x`,
`172.16–31.x`, `192.168.x`) — endereços que por definição não roteiam na internet, então quem chega
por um deles está na mesma rede física.

Continua **atrás de `if (!isProduction)`**: em produção nada muda. Isso está registrado em
`MIGRACAO-PARA-PRODUCAO.md` §9, junto com a consequência de rodar produção sem `NODE_ENV`.

## 8. Resultado, medido pelo IP da rede

| Verificação | Resultado |
|---|---|
| Página em `http://192.168.1.66:5273` | 200 |
| `/api/auth/me` pelo proxy | 401 — chegou ao backend, sem sessão |
| `POST /api/login` com senha errada | 400 — chegou e foi avaliado |
| Anexo em `/uploads/...` pelo proxy | 200 |
| `127.0.0.1:5273` | continua 401 |
| Origem externa (`evil.example.com`) | **403** — segue bloqueada |

O Vite anuncia sozinho o endereço: `➜ Network: http://192.168.1.66:5273/`.

Falta a regra de firewall, que é alteração de configuração de segurança do Windows e exige
administrador — o comando está no relato.
