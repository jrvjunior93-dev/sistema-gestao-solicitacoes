import { useEffect, useId, useRef, useState } from 'react';
import { useFecharAoSair } from '../../hooks/useFecharAoSair';
import { buscarParceiros } from '../../services/parceiros';

function rotuloParceiro(parceiro) {
  if (!parceiro) return '';
  return parceiro.cpf_cnpj
    ? `${parceiro.nome || 'Sem nome'} — ${parceiro.cpf_cnpj}`
    : (parceiro.nome || 'Sem nome');
}

function detalheParceiro(parceiro) {
  return parceiro?.cpf_cnpj
    || parceiro?.telefone
    || parceiro?.pix_chave_fixa_1
    || parceiro?.pix_chave_fixa_2
    || parceiro?.pix_chave_variavel
    || '';
}

export default function ParceiroBuscaRemota({
  label,
  selecionado,
  onSelecionar,
  obrigatorio = false,
  somenteFornecedor = false,
  placeholder = 'Digite nome, telefone, CPF/CNPJ ou PIX',
  acaoFinal = null,
  className = ''
}) {
  const inputId = useId();
  const requisicaoRef = useRef(null);
  const campoRef = useRef(null);
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState([]);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (selecionado) setTermo(rotuloParceiro(selecionado));
    else if (!aberto) setTermo('');
  }, [aberto, selecionado]);

  useEffect(() => {
    if (selecionado || !aberto || !termo.trim()) {
      setResultados([]);
      setErro('');
      return undefined;
    }

    const timeout = window.setTimeout(async () => {
      requisicaoRef.current?.abort();
      const controller = new AbortController();
      requisicaoRef.current = controller;
      setCarregando(true);
      setErro('');
      try {
        const resposta = await buscarParceiros({
          q: termo.trim(),
          ativo: 1,
          limit: 12,
          ...(somenteFornecedor ? { fornecedor: 1 } : {})
        }, { signal: controller.signal });
        setResultados(Array.isArray(resposta) ? resposta : []);
      } catch (error) {
        if (error?.name !== 'AbortError') {
          setResultados([]);
          setErro(error?.message || 'Nao foi possivel buscar pessoas.');
        }
      } finally {
        if (!controller.signal.aborted) setCarregando(false);
      }
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [aberto, selecionado, somenteFornecedor, termo]);

  useEffect(() => () => requisicaoRef.current?.abort(), []);

  const listaVisivel = aberto && !selecionado && Boolean(termo.trim());

  /*
    A LISTA FECHA AO CLICAR FORA, NAO AO PERDER O FOCO (05/09).

    Saiu o `onBlur` com `setTimeout(140)`. O atraso nao era desenho: a opcao
    escolhe no `onClick`, que so dispara no `mouseup`, e sem os 140ms o
    fechamento por perda de foco derrubava a lista antes disso — o clique
    morria no meio. Em troca, o fechamento por foco nao cobria o uso real:
    rolar a pagina, clicar num rotulo ou abrir outro painel com o foco preso
    no campo deixavam a camada aberta, e nao havia `Esc` nenhum aqui.

    Entrou o `useFecharAoSair`: `mousedown`/`touchstart` fora e `Escape` no
    documento inteiro — o Esc e capacidade NOVA neste campo.

    POR QUE A SELECAO SOBREVIVE, e este e o ponto delicado desta camada
    porque a escolha e no `onClick`: o ref cobre o `div` que embrulha o input
    E a lista, entao o `mousedown` sobre a opcao e DENTRO e o hook nao fecha
    nada — a linha continua montada ate o `mouseup`, e o `onClick` roda. O
    `onMouseDown` da opcao, que ja existia com `preventDefault()`, segura o
    foco no input e evita que o navegador mexa na selecao de texto no meio.

    Fechar aqui e so `setAberto(false)`: os efeitos acima ja limpam os
    resultados e devolvem ao campo o rotulo do parceiro escolhido (ou o campo
    vazio, se nao ha escolha).
  */
  useFecharAoSair(campoRef, listaVisivel, () => setAberto(false));

  function selecionar(parceiro) {
    onSelecionar(parceiro);
    setTermo(rotuloParceiro(parceiro));
    setResultados([]);
    setAberto(false);
    setErro('');
  }

  return (
    <div ref={campoRef} className={`relative grid gap-1 text-sm ${className}`}>
      <label htmlFor={inputId}>{label}{obrigatorio ? ' *' : ''}</label>
      <div className="flex min-w-0 gap-2">
        <input
          id={inputId}
          className="input input-sm min-w-0 flex-1"
          value={termo}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={aberto}
          aria-autocomplete="list"
          required={obrigatorio}
          onFocus={() => setAberto(true)}
          onChange={(event) => {
            setTermo(event.target.value);
            setAberto(true);
            if (selecionado) onSelecionar(null);
          }}
        />
        {acaoFinal}
        {selecionado && (
          <button
            type="button"
            className="btn btn-outline btn-sm shrink-0"
            onClick={() => {
              onSelecionar(null);
              setTermo('');
              setAberto(true);
            }}
          >
            Limpar
          </button>
        )}
      </div>

      {listaVisivel && (
        <div className="absolute left-0 right-0 top-full z-dropdown mt-1 max-h-56 overflow-auto rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-1 shadow-lg">
          {carregando && <div className="px-3 py-2 text-xs text-[var(--c-muted)]">Buscando...</div>}
          {!carregando && erro && <div className="px-3 py-2 text-xs text-red-700">{erro}</div>}
          {!carregando && !erro && resultados.length === 0 && (
            <div className="px-3 py-2 text-xs text-[var(--c-muted)]">Nenhum cadastro encontrado.</div>
          )}
          {!carregando && resultados.map((parceiro) => (
            <button
              key={parceiro.id}
              type="button"
              className="block w-full rounded px-3 py-2 text-left hover:bg-[var(--c-bg)]"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selecionar(parceiro)}
            >
              <span className="block text-sm font-medium text-[var(--c-text)]">{parceiro.nome || 'Sem nome'}</span>
              {detalheParceiro(parceiro) && <span className="block text-xs text-[var(--c-muted)]">{detalheParceiro(parceiro)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
