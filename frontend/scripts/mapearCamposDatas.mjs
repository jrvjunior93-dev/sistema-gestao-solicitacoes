// Inventario estatico reproduzivel. Nao executa aplicacao, banco ou importacoes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fontes = ['frontend/src', 'backend/src', 'backend/migrations'];
const itens = [], conversoes = [], erros = [], arquivos = [];
function listar(pasta) {
  for (const ent of fs.readdirSync(pasta, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name))) {
    const p = path.join(pasta, ent.name);
    if (ent.isDirectory()) listar(p);
    else if (/\.(?:[cm]?js|jsx|tsx?|json)$/.test(p) && !p.endsWith('.json')) arquivos.push(p);
  }
}
fontes.forEach(p => listar(path.join(raiz, p)));
for (const file of arquivos) {
  const texto = fs.readFileSync(file,'utf8'), relativo = path.relative(raiz,file).replaceAll('\\','/');
  let ast;
  try { ast = parse(texto,{sourceType:'unambiguous',plugins:['jsx',...(file.match(/\.tsx?$/)?['typescript']:[])]}); }
  catch(e) { erros.push({arquivo:relativo,linha:e.loc?.line,erro:e.reasonCode}); continue; }
  const trecho = n => n ? texto.slice(n.start,n.end).replace(/\s+/g,' ').slice(0,220) : '';
  const nome = n => n?.name || n?.value || '';
  const componentesData = new Set(ast.program.body.filter(n=>n.type==='ImportDeclaration'
    && /(?:DateInputBR|CompetenciaInputBR)/.test(n.source.value)).flatMap(n=>n.specifiers
      .filter(s=>s.type==='ImportDefaultSpecifier').map(s=>s.local.name)));
  const registrar = (n,tipo,extra={}) => itens.push({arquivo:relativo,linha:n.loc.start.line,tipo,...extra});
  function andar(n, pais=[]) {
    if (!n || typeof n!=='object') return;
    if (n.type==='JSXOpeningElement') {
      const tag = trecho(n.name), props = Object.fromEntries(n.attributes.filter(a=>a.type==='JSXAttribute').map(a=>[nome(a.name),a.value]));
      const tipo = props.type?.value;
      const compartilhado = componentesData.has(tag) || /^(?:DateInputBR|CompetenciaInputBR|DatePicker|DateTimePicker|InputData|InputDate|CalendarInput|CalendarPicker)$/.test(tag);
      const nativo = ['date','datetime-local','month','time','week'].includes(tipo);
      const dinamico = tag==='input' && props.type?.type==='JSXExpressionContainer';
      if (compartilhado || nativo || dinamico) {
        const label = [...pais].reverse().find(p=>p.type==='JSXElement' && nome(p.openingElement?.name)==='label');
        registrar(n, compartilhado ? 'CAMPO_COMPARTILHADO' : nativo ? 'CAMPO_NATIVO' : 'TIPO_DINAMICO_REVISAR', {
          componente:tag, formato:tipo || (props.type ? trecho(props.type) : 'COMPONENTE'),
          campo:trecho(props.name || props.value), alteracao:trecho(props.onChange),
          rotulo:props['aria-label'] ? trecho(props['aria-label']) : label ? texto.slice(label.start,n.start).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,150) : '',
          obrigatorio:Object.hasOwn(props,'required'), minimo:trecho(props.min), maximo:trecho(props.max),
          segmentado:Object.hasOwn(props,'edicaoSegmentada') ? trecho(props.edicaoSegmentada)||'true' : 'nao declarado'
        });
      }
    }
    if (n.type==='ObjectProperty' && ['type','tipo'].includes(nome(n.key))) {
      const v = trecho(n.value), objeto = pais.at(-1), campo = pais.at(-2);
      if (['date','datetime-local','month','time','week'].includes(n.value?.value)) registrar(n,'CONFIGURACAO_DINAMICA_DATA',{campo:trecho(objeto)});
      else if (/\b(?:DataTypes|Sequelize)\.(?:DATEONLY|DATE)\b/.test(v)) {
        const chamada = [...pais].reverse().find(p=>p.type==='CallExpression' && /(?:addColumn|changeColumn)$/.test(trecho(p.callee)));
        registrar(n,'COLUNA_BANCO',{campo:chamada ? nome(chamada.arguments[1]) : nome(campo?.key)||'dinamico',
          ...(chamada ? {tabela:nome(chamada.arguments[0])} : {}), formato:v});
      }
    }
    if ((n.type==='CallExpression' && /(?:toISOString|parseISO|formatISO|dataBRParaISO|dataISOParaBR|dataOnly|dataOperacional|parseDate|formatDate|validarData|isValidDate|isDateOnly)/i.test(trecho(n.callee)))
      || (n.type==='NewExpression' && nome(n.callee)==='Date')) {
      conversoes.push({arquivo:relativo,linha:n.loc.start.line,expressao:trecho(n)});
    }
    for (const [k,v] of Object.entries(n)) {
      if (['loc','start','end','comments','tokens','extra'].includes(k)) continue;
      if (Array.isArray(v)) v.forEach(x=>andar(x,[...pais,n]));
      else if (v && typeof v==='object' && v.type) andar(v,[...pais,n]);
    }
  }
  andar(ast);
}
const ordem = (a,b)=>a.arquivo.localeCompare(b.arquivo)||a.linha-b.linha;
itens.sort(ordem); conversoes.sort(ordem);
const contagens = Object.fromEntries([...new Set(itens.map(i=>i.tipo))].sort().map(t=>[t,itens.filter(i=>i.tipo===t).length]));
const inventario = {versao:1,raizes:fontes,arquivos_analisados:arquivos.length,contagens,erros,itens,conversoes};
const destino = path.join(raiz,'docs/datas');
fs.mkdirSync(destino,{recursive:true});
fs.writeFileSync(path.join(destino,'inventario-campos-datas.json'),JSON.stringify(inventario,null,2)+'\n');
const celula = v=>String(v??'').replaceAll('|','\\|').replaceAll('\n',' ');
const linhas = ['# Inventario estatico dos campos de data','',
  'Gerado por `node frontend/scripts/mapearCamposDatas.mjs`. Nao altera campos ou registros.', '',
  `Arquivos analisados: ${arquivos.length}. Erros de parser: ${erros.length}. Conversoes identificadas: ${conversoes.length}.`, '',
  ...Object.entries(contagens).map(([k,v])=>`- ${k}: ${v}`),'',
  '## Cobertura e leitura','',
  'Cada linha aponta um controle, configuracao dinamica ou coluna do modelo/schema. Um controle reutilizado em uma lista pode representar varios campos em execucao. Tipos dinamicos precisam ser cruzados com suas configuracoes; nao sao automaticamente datas. Linhas de migrations sao historicas, nao colunas adicionais. Rotulos e nomes sao expressoes extraidas, nao interpretacoes de regras de negocio.', '',
  'O JSON inclui todas as linhas e referencias de conversao/validacao identificadas. O levantamento nao executa imports, consultas, navegador ou migracoes. Relacoes campo -> API -> coluna precisam de revisao dos fluxos antes de uma migracao global; nao inferir que nomes iguais significam a mesma data.', '',
  '## Entradas e configuracoes do frontend','',
  '| Arquivo:linha | Tipo / componente | Campo / valor | Limites / edicao segmentada |','|---|---|---|---|',
  ...itens.filter(i=>i.arquivo.startsWith('frontend/')).map(i=>`| ${celula(i.arquivo)}:${i.linha} | ${celula(i.tipo)} / ${celula(i.componente||i.formato)} | ${celula(i.campo)} | ${celula([i.minimo,i.maximo,i.segmentado].filter(Boolean).join(' / '))} |`),'',
  '## Colunas e configuracoes backend','',
  '| Arquivo:linha | Tipo | Campo | Formato |','|---|---|---|---|',
  ...itens.filter(i=>i.arquivo.startsWith('backend/')).map(i=>`| ${celula(i.arquivo)}:${i.linha} | ${celula(i.tipo)} | ${celula(i.campo)} | ${celula(i.formato)} |`),'',
  '## Erros de leitura','',erros.length?JSON.stringify(erros):'Nenhum arquivo deixou de ser analisado pelo parser.',''];
fs.writeFileSync(path.join(destino,'INVENTARIO_CAMPOS_DATAS.md'),linhas.join('\n'));
console.log(JSON.stringify({arquivos:arquivos.length,contagens,conversoes:conversoes.length,erros}));
if(erros.length) process.exitCode=1;
