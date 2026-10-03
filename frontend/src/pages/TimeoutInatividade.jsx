import { useEffect, useState } from 'react';
import { Avisos, BlocoConteudo, Pagina, PageHeader, useAvisos } from '../components/padrao';
import { getTimeoutInatividade, salvarTimeoutInatividade } from '../services/configuracoesSistema';

/**
 * TEMPO DE INATIVIDADE — reforma de 04/09.
 *
 * A tela era uma `<div className="max-w-2xl space-y-6">` com `<h1>` e `<p>`
 * soltos: sem faixa fixa (C1/R13), com o ritmo vertical escrito à mão
 * (M2/R10) e com texto sem superfície (B5). Agora a moldura é a mesma de
 * todas as telas reformadas — `Pagina` + `PageHeader` + `BlocoConteudo` —,
 * e é o `Pagina` que publica `--pos-cabecalho-fixo` e o vão entre blocos.
 */
export default function TimeoutInatividade() {
  const [minutos, setMinutos] = useState(20);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  // R3/R19: as quatro caixas do navegador viraram avisos do sistema —
  // faixa dentro da página, com tom semântico, e o sucesso somindo sozinho.
  const { avisos, avisar, fechar, limpar } = useAvisos();

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    try {
      setLoading(true);
      const data = await getTimeoutInatividade();
      const valor = Number(data?.minutos);
      if (!Number.isNaN(valor) && valor > 0) {
        setMinutos(valor);
      }
    } catch (error) {
      console.error(error);
      avisar.erro('Erro ao carregar configuração de inatividade');
    } finally {
      setLoading(false);
    }
  }

  async function salvar(e) {
    e.preventDefault();
    try {
      setSalvando(true);
      const valor = Number(minutos);
      if (Number.isNaN(valor) || valor < 1 || valor > 480) {
        // Erro de VALIDAÇÃO DE CAMPO se mostra no formulário, ao lado do
        // campo que o causou — não numa caixa do navegador que cobre a tela
        // inteira e some sem deixar rastro. A faixa fica dentro do bloco.
        avisar.erro('Informe um tempo entre 1 e 480 minutos.');
        return;
      }

      await salvarTimeoutInatividade({ minutos: valor });
      localStorage.setItem('timeout_inatividade_minutos', String(Math.floor(valor)));
      avisar.sucesso('Tempo de inatividade salvo com sucesso.');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao salvar configuracao');
    } finally {
      setSalvando(false);
    }
  }

  // C2/R5: título e apoio moram na faixa fixa do topo, nas props do
  // PageHeader — nunca como <h1>/<p> soltos sobre o canvas.
  const cabecalho = (
    <PageHeader
      titulo="Tempo de Inatividade"
      descricao="Define em quantos minutos sem interação o sistema fará logout automático."
    />
  );

  if (loading) {
    // B5: nem o estado de carregamento é texto solto. E a faixa de avisos
    // entra aqui também: sem ela, uma falha no carregamento deixaria a tela
    // parada em "Carregando..." com o erro invisível.
    return (
      <Pagina>
        {cabecalho}
        <Avisos avisos={avisos} aoFechar={fechar} />
        <div className="app-empty-card">Carregando configuração de inatividade...</div>
      </Pagina>
    );
  }

  return (
    <Pagina>
      {cabecalho}

      <BlocoConteudo
        titulo="Logout automático"
        variante="primario"
        cor="var(--c-primary)"
      >
        <form onSubmit={salvar} className="space-y-4">
          {/* R16: UM dono para a faixa de avisos, e ele fica DENTRO do
              bloco — a mensagem que reprova o valor digitado precisa estar
              onde o valor foi digitado. */}
          <Avisos avisos={avisos} aoFechar={fechar} />

          <label className="grid max-w-md gap-1 text-sm">
            Tempo (minutos)
            <input
              type="number"
              min="1"
              max="480"
              step="1"
              className="input"
              value={minutos}
              onChange={(e) => {
                setMinutos(e.target.value);
                // Mexer no campo apaga a recusa anterior: senão a mensagem
                // da tentativa passada fica na tela enquanto a pessoa
                // corrige o valor, dizendo o oposto do que a tela mostra.
                limpar();
              }}
            />
          </label>

          <p className="app-note">
            Sugestão: 20 minutos. Valor máximo permitido: 480 minutos (8 horas).
          </p>

          <div className="app-actionbar">
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </BlocoConteudo>
    </Pagina>
  );
}
