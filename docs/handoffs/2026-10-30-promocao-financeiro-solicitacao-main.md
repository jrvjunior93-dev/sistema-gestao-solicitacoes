# Promocao Financeiro da solicitacao - main

Escopo autorizado: juros/multa na criacao do titulo, baixa integral em lote pela solicitacao, ordenacao global explicita de Registro/Vencimento e posicionamento das acoes a direita. Origem DEV abdc7bdf/01940faf, base main89b1e735. Historico recuperado de cotacoes excluido.

Aplicacao dos patches sem conflitos, preservando diferencas anteriores main/DEV. Sem EC2/banco/S3 pelo agente. Sem migration ou dados alterados. Atualizador PROD isolado com inventario/hashes, backup privado de codigo, QA antes de unico restart backend-solicitacoes, heap4096 e demais processos/ambientes preservados. Reconhece overlays anteriores e cotacoesIndependentes.js somente se identicos a BASE. Mantem HEAD instalado15a86635.

Validacoes: suites de encargos, baixa em lote, datas, cartao, adiantamento, compra direta, titulos adicionais, medicoes, fila composta/estorno e fila operacional; teste UI com APIs simuladas e build frontend. Publicacao main somente apos aprovacao das verificacoes. Nenhuma regularizacao de solicitacao antiga acompanha esta release.
