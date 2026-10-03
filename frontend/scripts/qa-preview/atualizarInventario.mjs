/**
 * ATUALIZADOR DO INVENTÁRIO DE TABELAS (docs/INVENTARIO-TABELAS.md).
 * A coluna "Situação" é recalculada pelo estado REAL de cada arquivo — o
 * documento nunca é atualizado à mão (mesmo princípio da matriz):
 * - usa TabelaPadrao e não tem <table> crua nem ResizableTable direto → OK (padrão)
 * - ainda tem <table> crua ou ResizableTable direto → MIGRAR (ou o texto
 *   de decisão/exceção original, que é preservado)
 * Também recalcula as colunas "Componente usado", "Redimensionar?" e
 * "Alinhamento?" e o resumo do topo.
 *
 * Uso: node scripts/qa-preview/atualizarInventario.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = path.resolve(frontendRoot, '..');
const docPath = path.join(repoRoot, 'docs', 'INVENTARIO-TABELAS.md');

const doc = fs.readFileSync(docPath, 'utf8');
const linhas = doc.split('\n');

let ok = 0; let migrar = 0; let decisao = 0; let morto = 0; let excecao = 0;

const analisar = (rel) => {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) return null;
  const codigo = fs.readFileSync(abs, 'utf8');
  const cruas = (codigo.match(/<table\b/g) || []).length;
  const padrao = (codigo.match(/<TabelaPadrao\b/g) || []).length;
  const listaAvancada = (codigo.match(/<ListaAvancada\b/g) || []).length;
  // ResizableTable DIRETO (fora do TabelaPadrao, que o usa por dentro).
  const resizeDireto = /from ['"].*ResizableTable['"]/.test(codigo)
    ? (codigo.match(/<ResizableTable\b/g) || []).length : 0;
  return { cruas, padrao, listaAvancada, resizeDireto };
};

const saida = linhas.map((linha) => {
  const m = linha.match(/^\| `([^`]+\.jsx)` \| ([^|]*) \|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\| (.*) \|$/);
  if (!m) return linha;
  const [, rel, rota, , , , , situacaoAtual] = m;
  const info = analisar(rel);
  if (!info) return linha;

  const componentes = [];
  if (info.padrao) componentes.push(`TabelaPadrao (${info.padrao})`);
  if (info.listaAvancada) componentes.push(`ListaAvancada (${info.listaAvancada})`);
  if (info.resizeDireto) componentes.push(`ResizableTable direto (${info.resizeDireto})`);
  if (info.cruas) componentes.push(`\`<table>\` crua (${info.cruas})`);
  const total = info.padrao + info.listaAvancada + info.resizeDireto + info.cruas;

  const noPadrao = info.cruas === 0 && info.resizeDireto === 0 && (info.padrao > 0 || info.listaAvancada > 0);
  const redimensionar = noPadrao ? 'Sim' : (info.resizeDireto ? 'Parcial' : (info.padrao || info.listaAvancada ? 'Parcial' : 'Não'));
  const alinhamento = info.padrao > 0 && info.cruas === 0 && info.resizeDireto === 0 ? 'Sim'
    : (info.padrao > 0 ? 'Parcial' : 'Não');

  let situacao;
  if (/CÓDIGO MORTO/.test(situacaoAtual)) { situacao = situacaoAtual; morto += 1; }
  else if (/EXCEÇÃO REGISTRADA/.test(situacaoAtual)) { situacao = situacaoAtual; excecao += 1; }
  else if (noPadrao) { situacao = 'OK (padrão)'; ok += 1; }
  else if (/decisão do cliente/.test(situacaoAtual)) { situacao = situacaoAtual.replace(/^MIGRAR/, 'AGUARDA DECISÃO'); decisao += 1; }
  else { situacao = situacaoAtual; migrar += 1; }

  return `| \`${rel}\` | ${rota.trim()} | ${total} | ${componentes.join(' + ') || '—'} | ${redimensionar} | ${alinhamento} | ${situacao.trim()} |`;
});

let texto = saida.join('\n');
const resumo = `- **No padrão: ${ok}** · a migrar: ${migrar} · aguardam decisão do cliente: ${decisao} · código morto (aguarda ok para remoção): ${morto} · exceção registrada: ${excecao}`;
texto = texto.replace(/^- \*\*No padrão.*$/m, resumo);
if (!texto.includes(resumo)) {
  texto = texto.replace(/^## Resumo$/m, `## Resumo\n\n${resumo}\n\n_Atualizado automaticamente por scripts/qa-preview/atualizarInventario.mjs — não editar a coluna Situação à mão._`);
}

fs.writeFileSync(docPath, texto);
console.log(`[inventario] ${resumo}`);
