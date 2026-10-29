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
