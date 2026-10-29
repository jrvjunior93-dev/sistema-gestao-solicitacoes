# Promocao isolada dos destaques para main

Usuario homologou DEV72c0cc47 e autorizou promocao/push main e comandos EC2.
Base39f4e719. Branch codex/destaques-geo-main, separada dos worktrees anteriores.
Patch funcional de13arquivos aplicado limpo, preservando features exclusivas
de main. Nenhum aplicador DEV trazido. README canonico recebe somente a secao
de destaques. Sem modificacao de decisoes, leituras, financeiro ou schema.

Mesmo comportamento homologado: atividade autorizada pelo setor principal e
permissao; retornos sem prazo nao atrasam artificialmente; leitura azul separada;
fila SQL antes da paginacao; etiquetas/legenda; acompanhamento sem prioridade.
Atividades reconhecidas: retorno e controles de entrega atuais, sem SLA novo.

Novo aplicador PROD derivado do operador seletivo da propria main. Somente dois
runtimes, testes e arquivos do operador; backup privado e fonte/hash fechados,
HEAD/index e overlays externos preservados. Inclui preservacao explicita de
modos0664 na escrita atomica, evitando repetir o incidente anterior. Estado novo
independente de titulos/adicionais, planos/progresso XMLs/NSDOCS protegidos.

Preparar/aplicar/conferir somente pelo usuario, Node PROD24.22.1/heap4096,
restart unico backend-solicitacoes. Nao instala dependencias nem roda migration,
SQL financeiro, criacao de atividade/titulo/baixa ou integracao como deploy.
Sem acesso EC2 ou banco pelo agente; manter DEV e Experience intactos.

Proximo passo: validar testes sobre esta base, manifesto por blobs Git, publicar
main sem force e fornecer comandos com SHA completo. Depois conferir saida do
usuario e smoke visual com GEO no frontend publicado.

Validacao da integracao:17testes aplicadorPROD (incluindo escrita0664/0644),6dominio/SQL SQLite e regressoes backend interacoes/retorno aprovados. UI real tabela/cards/mobile/claro/escuro e paginas lista/detalhe com APIs ficticias aprovadas. Build29,84s aprovado, apenas avisos preexistentes. Documentacao668MD/19canonicos aprovada. Nenhum banco, EC2 ou integracao externa acessado. Payload funcional identico ao delta72c0cc47 (13arquivos), demais features da main preservadas. Roteiro sera pinado ao commit publicado; sem gitpull/reiniciarDEV.

## Retomada apos arquivo novo nao rastreado

Publicado998b78bd e usuario executou preparar; bloqueou RUNTIME_FORA_ESCOPO
antes de instalar ou reiniciar. Diagnostico enviado: HEAD15a86635; GitdiffBASE39
marca D no compraTitulosAdicionaisService.js, mas o arquivo existe comSHA922ed26b,
identico ao arquivo da base. Erro da guarda ao considerar so Gitdiff e ignorar
arquivo novo fisicamente instalado por pacote anterior sobre HEAD antigo.

Wrapper retomar-prod-destaques-solicitacoes-20261029.cjs carrega release998 e
SHA85b11249... congelados; altera em memoria apenas validateRuntimeDelta para
validar esse caminho fora de RUNTIME por hash/regularidade/uid/ls-files vazio.
Nao altera indice/HEAD, fontes do overlay, manifesto, testes ou payload original.
Conferir deve ser executado pelo wrapper (via stdin), nao pelo script original
instalado, que conserva a antiga validacao. Qualquer outra diferenca bloqueia.

Novas alteracoes de fonte somente wrapper/teste/README/este handoff/ownership.
Sem mudanca funcional frontend/backend. Validacao local5testes passou; inclui
tamper,tracked,owner,symlink,hardlink,world-writable,outra diferenca e loaderpin.
Aplicador original revalidado com env de QA pinado ao proprio commit998, tal
como executado pelo operador. Sem EC2/banco pelo agente. Publicar patch main
e fornecer as tres chamadas ao wrapper, com alvo funcional998 inalterado.
