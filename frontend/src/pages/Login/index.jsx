import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import cscLogo from '../../assets/CSC_logo_lockup_padded.png';
import fluxyLogo from '../../assets/fluxy_mark_cropped.png';
import CityBackground from '../../components/CityBackground';
import { Avisos, useAvisos } from '../../components/padrao';
import Alert from '../../components/ui/Alert';
import Spinner from '../../components/ui/Spinner';
import { useAuth } from '../../contexts/AuthContext';
import { loginMfaRequest, loginRequest } from '../../services/auth';

function EyeIcon({ open }) {
  return open ? (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M3 3l18 18M10.58 10.59A2 2 0 0012 14a2 2 0 001.41-.58M9.88 5.09A10.94 10.94 0 0112 5c5.05 0 8.27 4.11 9 5-.35.43-1.3 1.53-2.8 2.63M6.61 6.62C4.55 8.06 3.29 9.63 3 10c.73.89 3.95 5 9 5 1.59 0 3-.31 4.22-.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12zm11 3a3 3 0 100-6 3 3 0 000 6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaChallenge, setMfaChallenge] = useState(null);
  const [loading, setLoading] = useState(false);
  const { avisos, avisar, fechar, limpar } = useAvisos();

  const { login } = useAuth();
  const navigate = useNavigate();
  const isMfaStep = Boolean(mfaChallenge);
  const introKicker = isMfaStep ? 'Segurança em duas etapas' : '';
  const introTitle = isMfaStep ? 'Validação segura' : 'Entrar';
  const introCopy = isMfaStep
    ? 'Confirme o código gerado no aplicativo autenticador para concluir o acesso.'
    : '';
  const isMinimalIntro = !introKicker && !introCopy;

  // Fora do shell não há menu, breadcrumb nem tela para onde escapar: toda
  // mensagem de erro tem de dizer O QUE FAZER, não só o que falhou
  // (DoD, "TELAS FORA DO SHELL", 03/09).
  function ehFalhaDeRede(mensagemNormalizada) {
    return mensagemNormalizada.includes('failed to fetch')
      || mensagemNormalizada.includes('network')
      || mensagemNormalizada.includes('nao foi possivel conectar')
      || mensagemNormalizada.includes('não foi possível conectar');
  }

  function normalizeLoginErrorMessage(err) {
    const rawMessage = String(err?.message || '').trim();
    const normalizedMessage = rawMessage.toLowerCase();

    if (err?.data?.code === 'PASSWORD_RESET_REQUIRED') {
      return 'Sua senha precisa ser definida ou redefinida. Toque em "Esqueci minha senha", aqui embaixo, para receber um link seguro por e-mail.';
    }

    if (ehFalhaDeRede(normalizedMessage)) {
      return 'Não foi possível falar com o servidor. Confira sua conexão (Wi-Fi ou dados) e toque em "Entrar" de novo em alguns instantes.';
    }

    if (err?.status === 429) {
      return 'Muitas tentativas seguidas. Aguarde alguns minutos antes de tentar de novo; se não lembra a senha, use "Esqueci minha senha".';
    }

    if (
      err?.status === 401
      || normalizedMessage.includes('erro ao efetuar login')
      || normalizedMessage.includes('unauthorized')
      || normalizedMessage.includes('credenciais')
      || normalizedMessage.includes('usuario ou senha')
      || normalizedMessage.includes('e-mail ou senha')
    ) {
      return 'E-mail ou senha inválidos. Confira o e-mail digitado e o CAPS LOCK; se não lembra a senha, use "Esqueci minha senha".';
    }

    if (err?.status === 403) {
      return 'Este acesso está bloqueado. Procure o administrador do sistema para liberar o seu usuário.';
    }

    if (!rawMessage) {
      return 'Não foi possível entrar agora. Tente de novo em alguns instantes; se continuar, procure o administrador do sistema.';
    }

    return `${rawMessage.replace(/\.?$/, '.')} Tente de novo em alguns instantes; se continuar, procure o administrador do sistema.`;
  }

  function normalizeMfaErrorMessage(err) {
    const rawMessage = String(err?.message || '').trim();
    const normalizedMessage = rawMessage.toLowerCase();

    if (ehFalhaDeRede(normalizedMessage)) {
      return 'Não foi possível falar com o servidor. Confira sua conexão e toque em "Validar e entrar" de novo — o código do aplicativo troca a cada 30 segundos, então use o que estiver na tela na hora.';
    }

    if (err?.status === 429) {
      return 'Muitas tentativas seguidas. Aguarde alguns minutos e valide de novo com um código novo do aplicativo.';
    }

    if (err?.status === 401 || normalizedMessage.includes('expirad') || normalizedMessage.includes('challenge')) {
      return 'A validação expirou por tempo. Toque em "Voltar", informe e-mail e senha outra vez e use o código que o aplicativo mostrar naquele momento.';
    }

    if (err?.status === 400 || normalizedMessage.includes('codigo') || normalizedMessage.includes('código') || normalizedMessage.includes('invalid')) {
      return 'Código inválido. Abra o aplicativo autenticador, aguarde o próximo código de 6 dígitos e digite-o sem espaços.';
    }

    if (!rawMessage) {
      return 'Não foi possível validar a autenticação em duas etapas. Aguarde o próximo código do aplicativo e tente de novo; se continuar, procure o administrador do sistema.';
    }

    return `${rawMessage.replace(/\.?$/, '.')} Aguarde o próximo código do aplicativo e tente de novo; se continuar, procure o administrador do sistema.`;
  }

  function handlePrimaryButtonPointerMove(event) {
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    button.style.setProperty('--login-glow-x', `${event.clientX - rect.left}px`);
    button.style.setProperty('--login-glow-y', `${event.clientY - rect.top}px`);
  }

  function handlePrimaryButtonPointerLeave(event) {
    const button = event.currentTarget;
    button.style.removeProperty('--login-glow-x');
    button.style.removeProperty('--login-glow-y');
  }

  function navigateAfterLogin(data) {
    if (data?.user?.mfa_setup_pending) {
      navigate('/perfil');
      return;
    }

    // Tela inicial escolhida pelo usuário, já VALIDADA no backend contra
    // as permissões atuais (payload traz null quando a preferência caiu
    // — permissão perdida ou rota removida — e nesse caso a Home assume
    // silenciosamente). Sem escolha, todo perfil cai na Home.
    const telaInicial = String(data?.user?.tela_inicial?.to || '').trim();
    navigate(telaInicial.startsWith('/') ? telaInicial : '/');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    limpar();
    if (!email.trim() || !senha) {
      avisar.erro('Preencha e-mail e senha para continuar.');
      return;
    }

    try {
      setLoading(true);
      const data = await loginRequest({ email: email.trim(), senha });
      if (data?.mfa_required) {
        setSenha('');
        setShowPassword(false);
        setMfaCode('');
        setMfaChallenge({ challengeToken: data.challenge_token, user: data.user });
        return;
      }

      await login(data);
      navigateAfterLogin(data);
    } catch (err) {
      avisar.erro(normalizeLoginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaSubmit(e) {
    e.preventDefault();
    limpar();

    if (!mfaChallenge?.challengeToken) {
      setMfaChallenge(null);
      avisar.erro('A validação em duas etapas expirou. Informe e-mail e senha outra vez para receber um novo desafio.');
      return;
    }

    if (!String(mfaCode || '').trim()) {
      avisar.erro('Informe o código de 6 dígitos que o aplicativo autenticador está mostrando agora.');
      return;
    }

    try {
      setLoading(true);
      const data = await loginMfaRequest({
        challenge_token: mfaChallenge.challengeToken,
        codigo: mfaCode
      });
      await login(data);
      setMfaChallenge(null);
      setMfaCode('');
      navigateAfterLogin(data);
    } catch (err) {
      avisar.erro(normalizeMfaErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function cancelarMfa() {
    setMfaChallenge(null);
    setMfaCode('');
    limpar();
  }

  return (
    <div className="login-bg-wrap">
      <CityBackground />
      <div className="login-bg-overlay" aria-hidden="true" />

      <div className="login-content-wrap">
        <div className="login-card">
          <div className="login-brand">
            <div className="login-brand-csc">
              <div className="login-csc-lockup">
                <img src={cscLogo} alt="Construtora Sul Capixaba" className="login-csc-logo" />
              </div>
            </div>
            <div className="login-brand-sep" aria-hidden="true" />
            <div className="login-brand-fluxy">
              <div className="login-fluxy-lockup">
                <div className="login-fluxy-logo-wrap">
                  <img src={fluxyLogo} alt="" aria-hidden="true" className="login-fluxy-icon" />
                </div>
                <span className="login-fluxy-name">Fluxy</span>
              </div>
            </div>
          </div>

          <div className={`login-intro${isMinimalIntro ? ' login-intro--minimal' : ''}`}>
            {introKicker ? <span className="login-kicker">{introKicker}</span> : null}
            <h1 className="login-heading">{introTitle}</h1>
            {introCopy ? <p className="login-copy">{introCopy}</p> : null}
          </div>

          <div className="login-divider" aria-hidden="true" />

          {avisos.length > 0 && (
            <div className="login-alert-wrap">
              <Avisos avisos={avisos} aoFechar={fechar} />
            </div>
          )}

          {isMfaStep ? (
            <form onSubmit={handleMfaSubmit} noValidate className="login-form">
              <Alert
                type="info"
                message={`Senha validada para ${mfaChallenge.user?.nome || mfaChallenge.user?.email || 'o usuário'}. Informe agora o código de 6 dígitos do aplicativo autenticador.`}
              />

              <div className="login-field">
                <label htmlFor="login-mfa-code" className="login-label">Código do autenticador</label>
                <input
                  id="login-mfa-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="input login-input"
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value.replace(/\D+/g, '').slice(0, 6))}
                  disabled={loading}
                  required
                />
              </div>

              <div className="login-security-note">
                <span className="login-security-dot" aria-hidden="true" />
                <span>A validação adicional protege o ambiente corporativo.</span>
              </div>

              <div className="login-actions-2col">
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary login-btn w-full justify-center"
                  onMouseMove={handlePrimaryButtonPointerMove}
                  onMouseLeave={handlePrimaryButtonPointerLeave}
                >
                  {loading ? <><Spinner size="sm" label="" /> Validando...</> : 'Validar e entrar'}
                </button>
                <button
                  type="button"
                  disabled={loading}
                  className="btn btn-secondary login-btn w-full justify-center"
                  onClick={cancelarMfa}
                >
                  Voltar
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="login-form">
              <div className="login-field">
                <label htmlFor="login-email" className="login-label">E-mail</label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="seu@email.com.br"
                  className="input login-input"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div className="login-field">
                <label htmlFor="login-senha" className="login-label">Senha</label>
                <div className="login-pw-wrap">
                  <input
                    id="login-senha"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Digite sua senha"
                    className="input login-input login-input-pw"
                    value={senha}
                    onChange={(event) => setSenha(event.target.value)}
                    disabled={loading}
                    required
                  />
                  <button
                    type="button"
                    className="btn login-eye-btn"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    aria-pressed={showPassword}
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
              </div>

              <div className="login-form-meta">
                <div className="login-security-note">
                  <span className="login-security-dot" aria-hidden="true" />
                  <span>Acesso corporativo protegido.</span>
                </div>
                {/*
                  `btn-ghost`, não contorno: a C5 classifica AÇÕES, e este
                  controle NAVEGA — é o único caminho para fora da tela de
                  login, pelo escopo declarado da C6/R11. Desenhar contorno
                  em volta dele o promoveria a ação secundária e competiria
                  com "Entrar". O `.btn` continua ali só pelo alvo de
                  clique (M1): sem ele, o alvo tinha 19px de altura.
                */}
                <button
                  type="button"
                  className="btn btn-ghost login-forgot"
                  onClick={() => navigate('/recuperar-senha', { state: { email: email.trim() } })}
                >
                  Esqueci minha senha
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary login-btn w-full justify-center"
                onMouseMove={handlePrimaryButtonPointerMove}
                onMouseLeave={handlePrimaryButtonPointerLeave}
              >
                {loading ? <><Spinner size="sm" label="" /> Entrando...</> : 'Entrar'}
              </button>

            </form>
          )}
        </div>
      </div>
    </div>
  );
}
