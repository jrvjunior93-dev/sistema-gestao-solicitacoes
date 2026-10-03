import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Alert from '../components/ui/Alert';
import { Avisos, CampoForm, useAvisos } from '../components/padrao';
import { forgotPasswordRequest } from '../services/auth';

/**
 * RECUPERAR SENHA — tela FORA DO SHELL (sem topbar, menu ou breadcrumb).
 * DoD própria: docs/DEFINICAO-DE-PRONTO.md, "TELAS FORA DO SHELL" (03/09).
 *
 * O que muda em relação às telas internas:
 * - C1/C2/C3/X2/F1–F4 são N/A: não há faixa presa à topbar nem listagem.
 *   O título continua no degrau de 22px (.page-title dentro de .app-pagina,
 *   styles/escala.css) — o que sai é a exigência de grudar.
 * - C6/R11 se INVERTEM: "Voltar para o login" é a ÚNICA navegação que
 *   existe aqui. Não é redundante, é obrigatória — removê-la prende a
 *   pessoa na tela.
 * - Vale integralmente M1–M4 (medida por degrau, cor por token, AA 4.5:1,
 *   alvo >= 32/44px), R1–R3, B1–B5, X1/X3, R18 e A1.
 *
 * Exigência que só existe aqui: erro de rede, link vencido e limite de
 * tentativas precisam dizer O QUE FAZER — não há menu para onde escapar.
 */

// Validade do token de senha (backend: DEFAULT_EXPIRES_HOURS em
// services/passwordResetService.js). A API não devolve esse prazo; se ele
// mudar lá, muda aqui.
const VALIDADE_DO_LINK = '2 horas';

function mensagemDeFalha(err) {
  const bruta = String(err?.message || '').trim();
  const normalizada = bruta.toLowerCase();

  if (
    normalizada.includes('failed to fetch')
    || normalizada.includes('network')
    || normalizada.includes('nao foi possivel conectar')
  ) {
    return 'Não foi possível falar com o servidor. Confira sua conexão e toque em "Enviar link" de novo em alguns instantes.';
  }

  if (err?.status === 429) {
    return `Muitas tentativas seguidas neste e-mail. Aguarde alguns minutos antes de pedir outro link — o último link enviado continua valendo por ${VALIDADE_DO_LINK}.`;
  }

  if (!bruta) {
    return 'Não foi possível enviar o link agora. Tente de novo em alguns instantes; se continuar, peça a um administrador do sistema que envie o link por você.';
  }

  return `${bruta.replace(/\.?$/, '.')} Tente de novo em alguns instantes; se continuar, peça a um administrador do sistema que envie o link por você.`;
}

export default function RecuperarSenha() {
  const location = useLocation();
  const { avisos, avisar, fechar, limpar } = useAvisos();
  const [email, setEmail] = useState(location.state?.email || '');
  const [loading, setLoading] = useState(false);
  // Estado TERMINAL da tela, não evento: o pedido foi aceito e a instrução
  // ("abra o e-mail e clique no link") precisa continuar à vista. Aviso que
  // some em 6s levaria embora a única instrução que resta — por isso painel
  // fixo no fluxo, e não useAvisos (fronteira do Avisos.jsx).
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    limpar();

    const alvo = String(email || '').trim();
    if (!alvo) {
      avisar.erro('Informe o e-mail cadastrado na empresa para receber o link.');
      return;
    }

    try {
      setLoading(true);
      await forgotPasswordRequest(alvo);
      setEnviado(true);
    } catch (err) {
      setEnviado(false);
      avisar.erro(mensagemDeFalha(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen min-h-screen flex items-center justify-center p-4">
      <div className="app-pagina app-bloco app-bloco--primario w-full max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Acesso seguro
        </p>
        <h1 className="page-title">Recuperar senha</h1>
        {/* EXCEÇÃO DECLARADA à truncagem de 05/09 (`--integral`): tela fora
            do shell, cartão estreito (max-w-xl) e muito usada no celular, onde
            não há hover — o tooltip não alcançaria o que a truncagem esconde,
            e o texto É a instrução da tela. */}
        <p className="app-bloco-lead app-bloco-lead--integral">
          Informe o e-mail cadastrado. Enviamos um link para você definir uma nova senha.
        </p>

        {/*
          LACUNA DO PADRÃO (mesma achada na Cotação Pública, registrada no
          relatório): as regras de `.alert` — a superfície que o `Avisos`
          desenha — só existem sob `.layout-shell` e `.login-card` no
          index.css. Esta tela renderiza fora do Layout; sem esse escopo a
          faixa sairia sem cor semântica, sem respiro e sem raio: o aviso
          existiria no DOM e quase não existiria para quem olha (R15).
          O invólucro entra AQUI, envolvendo só a pilha de avisos, porque
          corrigir o escopo é mexer em CSS de sistema — fora do meu arquivo.
        */}
        {avisos.length > 0 ? (
          <div className="layout-shell">
            <Avisos avisos={avisos} aoFechar={fechar} />
          </div>
        ) : null}

        {enviado ? (
          <div className="layout-shell">
            <Alert
              type="success"
              title="Link enviado"
              message={`Se o e-mail estiver cadastrado, o link chega em alguns minutos e vale por ${VALIDADE_DO_LINK}. Abra a mensagem e clique no link para definir a senha. Não chegou? Confira a caixa de spam e o endereço digitado antes de pedir outro.`}
            />
          </div>
        ) : null}

        <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
          <CampoForm
            label="E-mail"
            obrigatorio
            hint="Use o mesmo e-mail com que você entra no sistema."
          >
            <input
              className="input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="seu@email.com.br"
              autoComplete="email"
              disabled={loading}
              required
            />
          </CampoForm>

          <button className="btn btn-primary justify-center" type="submit" disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar link'}
          </button>
        </form>

        {/* C6/R11 invertidas nesta tela: sem topbar, menu ou breadcrumb, este
            é o único caminho de volta. Botão (não texto solto) para cumprir o
            alvo mínimo de clique da M1. */}
        <Link className="btn btn-outline justify-center" to="/login">
          Voltar para o login
        </Link>
      </div>
    </div>
  );
}
