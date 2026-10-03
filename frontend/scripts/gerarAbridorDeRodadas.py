# -*- coding: utf-8 -*-
"""
ABRIDOR DE RODADAS (05/09) — pedido do cliente.

Eu rodo num container remoto e não consigo abrir aba na máquina dele. Mas
posso entregar um arquivo que ELE roda, e aí quem abre as abas é o navegador
dele mesmo. Três formatos, porque não sei o sistema dele:

  - painel.html  — funciona em qualquer sistema, é o principal, e serve de
                   lista de acompanhamento (marca a rodada feita e lembra);
  - .bat         — Windows, `abrir-rodada.bat 3`;
  - .command     — macOS e Linux, `./abrir-rodada.command 3`.

Os três saem da MESMA fonte (plano-de-teste.json), então não têm como
divergir entre si nem do caderno.
"""
import json, html, os, stat

BASE = 'https://refactor-dev.jrfluxy.com.br'
plano = json.load(open('scripts/qa-preview/saida/plano-de-teste.json', encoding='utf-8'))
SAIDA = '../docs/teste'
os.makedirs(SAIDA, exist_ok=True)

def url(t):
    return BASE + t['comoChegar']['texto'] if t['comoChegar']['tipo'] == 'rota' else None

rodadas = []
for r in plano['rodadas']:
    telas = []
    for t in r['telas']:
        telas.append({
            'nome': t['nome'], 'id': t['id'], 'url': url(t),
            'comoChegar': t['comoChegar']['texto'],
            'semDado': bool(t['semDado']),
            'corrigido': bool(t['falhou']),
            'mudou': t['mudou'][:3],
            'olhar': t['olhar'],
        })
    rodadas.append({'numero': r['numero'], 'modulos': ' + '.join(r['modulos']), 'telas': telas})

# ------------------------------------------------------------------ painel
dados = json.dumps(rodadas, ensure_ascii=False)
paginas = []
for r in rodadas:
    linhas = []
    for i, t in enumerate(r['telas'], 1):
        marcas = ''
        if t['semDado']:
            marcas += '<span class="marca marca--sd">sem dado</span>'
        if t['corrigido']:
            marcas += '<span class="marca marca--cor">corrigido, não remedido</span>'
        alvo = (f'<a href="{html.escape(t["url"])}" target="_blank" rel="noopener">{html.escape(t["url"])}</a>'
                if t['url'] else f'<em>{html.escape(t["comoChegar"])}</em>')
        olhar = ''.join(f'<li>{html.escape(o)}</li>' for o in t['olhar'])
        mudou = ''.join(f'<li>{html.escape(m)}</li>' for m in t['mudou'])
        linhas.append(f'''
        <li class="tela">
          <label class="tela-topo">
            <input type="checkbox" data-tela="{html.escape(t['id'])}">
            <span class="tela-num">{i}</span>
            <span class="tela-nome">{html.escape(t['nome'])}</span>
            {marcas}
          </label>
          <div class="tela-url">{alvo}</div>
          <details>
            <summary>o que mudou e o que analisar</summary>
            <p class="rot">O que mudou nesta reforma</p><ul>{mudou}</ul>
            <p class="rot">O que analisar nesta tela</p><ul>{olhar}</ul>
          </details>
        </li>''')
    n_sd = sum(1 for t in r['telas'] if t['semDado'])
    paginas.append(f'''
    <section class="rodada" id="rodada-{r['numero']}" hidden>
      <header class="rodada-cab">
        <div>
          <h2>Rodada {r['numero']}</h2>
          <p class="sub">{html.escape(r['modulos'])} · {len(r['telas'])} telas{f' · {n_sd} com sem dado' if n_sd else ''}</p>
        </div>
        <div class="acoes">
          <button class="btn btn--forte" data-abrir="{r['numero']}" data-lote="10">Abrir as {len(r['telas'])} telas</button>
          <button class="btn" data-abrir="{r['numero']}" data-lote="5">Abrir 5 por vez</button>
        </div>
      </header>
      <ol class="telas">{''.join(linhas)}</ol>
    </section>''')

navegacao = ''.join(
    f'<button class="aba" data-ir="{r["numero"]}">{r["numero"]}</button>' for r in rodadas
)

painel = f'''<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Abridor de rodadas — teste do frontend</title>
<style>
  :root {{
    --tinta: #16202e; --tinta-fraca: #5b6b7e; --papel: #f7f8fa; --cartao: #ffffff;
    --linha: #dfe4ea; --azul: #1f3864; --azul-claro: #eef2f9;
    --vermelho: #a61c1c; --vermelho-claro: #fbeaea; --ambar: #8a5a00; --ambar-claro: #fdf3e0;
  }}
  @media (prefers-color-scheme: dark) {{
    :root:not([data-theme="light"]) {{
      --tinta: #e8edf3; --tinta-fraca: #9fb0c3; --papel: #11161d; --cartao: #182029;
      --linha: #2b3742; --azul: #9db8e8; --azul-claro: #1c2635;
      --vermelho: #f08a8a; --vermelho-claro: #33201f; --ambar: #e0b25f; --ambar-claro: #302713;
    }}
  }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; background: var(--papel); color: var(--tinta);
         font: 15px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; }}
  .topo {{ position: sticky; top: 0; z-index: 5; background: var(--cartao);
           border-bottom: 1px solid var(--linha); padding: 14px 22px; }}
  .topo h1 {{ margin: 0 0 3px; font-size: 19px; }}
  .topo p {{ margin: 0; color: var(--tinta-fraca); font-size: 13px; }}
  .abas {{ display: flex; flex-wrap: wrap; gap: 5px; margin-top: 11px; }}
  .aba {{ min-width: 34px; height: 30px; border: 1px solid var(--linha); background: var(--cartao);
          color: var(--tinta); border-radius: 6px; cursor: pointer; font-size: 13px; }}
  .aba[aria-current="true"] {{ background: var(--azul); border-color: var(--azul); color: #fff; font-weight: 600; }}
  .aba.feita::after {{ content: " ✓"; color: #2e7d32; }}
  main {{ max-width: 900px; margin: 0 auto; padding: 22px; }}
  .rodada-cab {{ display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end;
                 justify-content: space-between; margin-bottom: 14px; }}
  .rodada-cab h2 {{ margin: 0; font-size: 22px; }}
  .sub {{ margin: 3px 0 0; color: var(--tinta-fraca); font-size: 13px; }}
  .acoes {{ display: flex; gap: 8px; }}
  .btn {{ padding: 9px 15px; border: 1px solid var(--azul); background: transparent;
          color: var(--azul); border-radius: 7px; cursor: pointer; font-size: 14px; font-weight: 600; }}
  .btn--forte {{ background: var(--azul); color: #fff; }}
  .telas {{ list-style: none; margin: 0; padding: 0; display: grid; gap: 9px; }}
  .tela {{ background: var(--cartao); border: 1px solid var(--linha); border-radius: 9px; padding: 11px 13px; }}
  .tela-topo {{ display: flex; align-items: center; gap: 9px; cursor: pointer; }}
  .tela-num {{ min-width: 22px; color: var(--tinta-fraca); font-variant-numeric: tabular-nums; font-size: 13px; }}
  .tela-nome {{ font-weight: 600; }}
  input:checked ~ .tela-nome {{ text-decoration: line-through; color: var(--tinta-fraca); }}
  .marca {{ font-size: 11px; padding: 2px 7px; border-radius: 20px; font-weight: 600; }}
  .marca--sd {{ background: var(--vermelho-claro); color: var(--vermelho); }}
  .marca--cor {{ background: var(--ambar-claro); color: var(--ambar); }}
  .tela-url {{ margin: 5px 0 0 31px; font-size: 12px; word-break: break-all; }}
  .tela-url a {{ color: var(--tinta-fraca); }}
  details {{ margin: 7px 0 0 31px; }}
  summary {{ cursor: pointer; color: var(--azul); font-size: 13px; }}
  .rot {{ margin: 9px 0 3px; font-weight: 600; font-size: 12.5px; }}
  details ul {{ margin: 0; padding-left: 19px; font-size: 13px; color: var(--tinta-fraca); }}
  details li {{ margin-bottom: 3px; }}
  .aviso {{ background: var(--azul-claro); border: 1px solid var(--linha); border-radius: 9px;
            padding: 12px 15px; margin-bottom: 18px; font-size: 13.5px; }}
</style>
</head>
<body>
<div class="topo">
  <h1>Abridor de rodadas</h1>
  <p>{sum(len(r['telas']) for r in rodadas)} telas em {len(rodadas)} rodadas · preview refactor-dev.jrfluxy.com.br</p>
  <div class="abas">{navegacao}</div>
</div>
<main>
  <div class="aviso">
    <strong>Na primeira vez o navegador vai bloquear as abas.</strong> Ele mostra um aviso de
    pop-up bloqueado na barra de endereço — escolha permitir para este arquivo, e a partir daí
    o botão abre tudo de uma vez. Se preferir não liberar, use <em>Abrir 5 por vez</em> ou
    clique nos endereços um a um.
    <br><br>
    As telas que você marcar ficam marcadas neste computador, mesmo fechando o arquivo.
  </div>
  {''.join(paginas)}
</main>
<script>
  const RODADAS = {dados};
  const CHAVE = 'fluxy:teste:feitas';
  const feitas = new Set(JSON.parse(localStorage.getItem(CHAVE) || '[]'));

  function guardar() {{
    localStorage.setItem(CHAVE, JSON.stringify([...feitas]));
    for (const r of RODADAS) {{
      const todas = r.telas.every((t) => feitas.has(t.id));
      document.querySelector(`.aba[data-ir="${{r.numero}}"]`).classList.toggle('feita', todas);
    }}
  }}

  document.querySelectorAll('input[data-tela]').forEach((c) => {{
    c.checked = feitas.has(c.dataset.tela);
    c.addEventListener('change', () => {{
      c.checked ? feitas.add(c.dataset.tela) : feitas.delete(c.dataset.tela);
      guardar();
    }});
  }});

  function mostrar(n) {{
    document.querySelectorAll('.rodada').forEach((s) => {{ s.hidden = s.id !== `rodada-${{n}}`; }});
    document.querySelectorAll('.aba').forEach((a) => a.setAttribute('aria-current', String(a.dataset.ir === String(n))));
    location.hash = `rodada-${{n}}`;
  }}
  document.querySelectorAll('.aba').forEach((a) => a.addEventListener('click', () => mostrar(a.dataset.ir)));

  document.querySelectorAll('[data-abrir]').forEach((b) => b.addEventListener('click', () => {{
    const r = RODADAS.find((x) => String(x.numero) === b.dataset.abrir);
    const lote = Number(b.dataset.lote);
    const enderecos = r.telas.filter((t) => t.url).map((t) => t.url).slice(0, lote);
    let bloqueadas = 0;
    enderecos.forEach((u, i) => setTimeout(() => {{
      const j = window.open(u, '_blank');
      if (!j) bloqueadas += 1;
      if (i === enderecos.length - 1 && bloqueadas) {{
        alert(`O navegador bloqueou ${{bloqueadas}} aba(s). Permita pop-ups para este arquivo e clique de novo.`);
      }}
    }}, i * 320));
  }}));

  mostrar((location.hash.match(/rodada-(\\d+)/) || [, 1])[1]);
  guardar();
</script>
</body>
</html>'''

open(f'{SAIDA}/abrir-rodadas.html', 'w', encoding='utf-8').write(painel)

# ------------------------------------------------------------------ nativos
bat = ['@echo off', 'chcp 65001 >nul', 'setlocal', 'set R=%~1',
       'if "%R%"=="" (echo Uso: abrir-rodada.bat ^<numero da rodada 1 a ' + str(len(rodadas)) + '^> & exit /b 1)']
for r in rodadas:
    bat.append(f'if "%R%"=="{r["numero"]}" (')
    for t in r['telas']:
        if t['url']:
            bat.append(f'  start "" "{t["url"]}"')
        else:
            bat.append(f'  echo [sem rota fixa] {t["nome"]}: {t["comoChegar"]}')
    bat.append('  exit /b 0')
    bat.append(')')
bat.append('echo Rodada %R% nao existe.')
open(f'{SAIDA}/abrir-rodada.bat', 'w', encoding='utf-8', newline='\r\n').write('\n'.join(bat) + '\n')

sh = ['#!/bin/bash', '# Abre as telas de uma rodada. Uso: ./abrir-rodada.command 3',
      'R="${1:-}"',
      f'if [ -z "$R" ]; then echo "Uso: $0 <numero da rodada 1 a {len(rodadas)}>"; exit 1; fi',
      'if command -v open >/dev/null 2>&1; then ABRIR="open"; else ABRIR="xdg-open"; fi',
      'case "$R" in']
for r in rodadas:
    sh.append(f'  {r["numero"]})')
    for t in r['telas']:
        if t['url']:
            sh.append(f'    "$ABRIR" "{t["url"]}" >/dev/null 2>&1; sleep 0.3')
        else:
            sh.append(f'    echo "[sem rota fixa] {t["nome"]}: {t["comoChegar"]}"')
    sh.append('    ;;')
sh += ['  *) echo "Rodada $R nao existe."; exit 1;;', 'esac']
caminho_sh = f'{SAIDA}/abrir-rodada.command'
open(caminho_sh, 'w', encoding='utf-8').write('\n'.join(sh) + '\n')
os.chmod(caminho_sh, os.stat(caminho_sh).st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)

print(f'[abridor] docs/teste/abrir-rodadas.html · abrir-rodada.bat · abrir-rodada.command')
print(f'[abridor] {len(rodadas)} rodadas, {sum(len(r["telas"]) for r in rodadas)} telas')
