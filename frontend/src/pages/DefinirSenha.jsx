import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HiEye, HiEyeSlash } from 'react-icons/hi2';
import Alert from '../components/ui/Alert';
import { Avisos, CampoForm, useAvisos } from '../components/padrao';
import { resetPasswordRequest } from '../services/auth';

/**
 * DEFINIR SENHA — tela FORA DO SHELL (sem topbar, menu ou breadcrumb),
 * alcançada por link de e-mail. DoD própria: docs/DEFINICAO-DE-PRONTO.md,
 * "TELAS FORA DO SHELL" (03/09).
 *
 * - C1/C2/C3/X2/F1–F4 são N/A (não há faixa presa à topbar nem listagem); o
 *   título continua no degrau de 22px (.page-title dentro de .app-pagina).
 * - C6/R11 se INVERTEM: os links para o login e para pedir um novo link são
 *   a ÚNICA navegação da tela — obrigatórios, não redundantes.
 * - M1–M4, R1–R3, B1–B5, X1/X3, R18 e A1 valem integralmente.
 *
 * Exigência que só existe aqui: LINK VENCIDO e TOKEN AUSENTE são o caminho
 * de erro mais provável desta tela (o link chega por e-mail, é usado uma vez
 * e expira). Ambos são CONDIÇÃO, não evento — fecham e o problema continua —
 * então viram painel fixo com o que fazer, e o formulário não finge que
 * funciona.
 */

const VALIDADE_DO_LINK = '2 horas';

const PASSWORD_HINT = 'Mínimo de 8 caracteres, com letra maiúscula, minúscula, número e caractere especial.';

// Espelha backend/src/services/passwordPolicyService.js (validateStrongPassword).
const PASSWORD_RULES = [
  { key: 'length', label: '8+ caracteres', test: (value) => value.length >= 8 },
  { key: 'upper', label: 'maiúscula', test: (value) => /\p{Lu}/u.test(value) },
  { key: 'lower', label: 'minúscula', test: (value) => /\p{Ll}/u.test(value) },
  { key: 'number', label: 'número', test: (value) => /\p{N}/u.test(value) },
  { key: 'special', label: 'especial', test: (value) => /[^\p{L}\p{N}\s]/u.test(value) }
];

function IconeRequisito({ ok }) {
  // O estado do requisito NÃO pode ser só cor (WCAG 1.4.1): quem não
  // distingue verde de cinza precisa do símbolo.
  return ok ? (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4.5 10.5l3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function ehTokenRecusado(err) {
  const codigo = String(err?.data?.code || '');
  if (codigo === 'PASSWORD_RESET_TOKEN_INVALID') return true;
  const normalizada = String(err?.message || '').toLowerCase();
  return normalizada.includes('invalido ou expirado') || normalizada.includes('inválido ou expirado');
}

function mensagemDeFalha(err) {
  const bruta = String(err?.message || '').trim();
  const normalizada = bruta.toLowerCase();

  if (
    normalizada.includes('failed to fetch')
    || normalizada.includes('network')
    || normalizada.includes('nao foi possivel conectar')
  ) {
    return 'Não foi possível falar com o servidor. Confira sua conexão e toque em "Definir senha" de novo — o link continua valendo enquanto não expirar.';
  }

  if (err?.status === 429) {
    return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente outra vez com o mesmo link.';
  }

  if (String(err?.data?.code || '') === 'WEAK_PASSWORD') {
    return 'A senha não atende à política de segurança: as etiquetas embaixo do campo mostram o que ainda falta. Ajuste a senha e envie de novo.';
  }

  if (!bruta) {
    return 'Não foi possível definir a senha agora. Tente de novo em alguns instantes; se continuar, peça um novo link em "Esqueci minha senha".';
  }

  return `${bruta.replace(/\.?$/, '.')} Tente de novo em alguns instantes; se continuar, peça um novo link em "Esqueci minha senha".`;
}

export default function DefinirSenha() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { avisos, avisar, fechar, limpar } = useAvisos();
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [mostrarConfirmacao, setMostrarConfirmacao] = useState(false);
  const [loading, setLoading] = useState(false);
  // Condições (não eventos): fecham e o problema continua.
  const [concluido, setConcluido] = useState(false);
  const [linkRecusado, setLinkRecusado] = useState(false);

  const semToken = !token;
  const linkInutil = semToken || linkRecusado;
  const bloqueado = linkInutil || concluido;
  const passwordStatus = PASSWORD_RULES.map((rule) => ({ ...rule, ok: rule.test(senha) }));

  async function handleSubmit(event) {
    event.preventDefault();
    limpar();

    if (!token) {
      setLinkRecusado(true);
      return;
    }

    if (senha !== confirmacao) {
      avisar.erro('A confirmação está diferente da nova senha. Digite as duas outra vez, usando o olho ao lado do campo para conferir o que foi digitado.');
      return;
    }

    try {
      setLoading(true);
      await resetPasswordRequest({ token, senha });
      setSenha('');
      setConfirmacao('');
      setConcluido(true);
    } catch (err) {
      if (ehTokenRecusado(err)) {
        setLinkRecusado(true);
        return;
      }
      avisar.erro(mensagemDeFalha(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen min-h-screen flex items-center justify-center p-4">
      <div className="app-pagina app-bloco app-bloco--primario w-full max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Senha de acesso
        </p>
        <h1 className="page-title">Definir senha</h1>
        {/* EXCEÇÃO DECLARADA à truncagem de 05/09 (`--integral`): é a REGRA
            DA SENHA. Cortar em uma linha esconde exatamente o que a pessoa
            precisa ler para conseguir cadastrar, e no celular (onde esta tela
            mais roda) não há hover para o tooltip. */}
        <p className="app-bloco-lead app-bloco-lead--integral">{PASSWORD_HINT}</p>

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

        {linkInutil ? (
          <div className="layout-shell">
            <Alert
              type="error"
              title={semToken ? 'Este endereço veio sem o código do link' : 'Este link não vale mais'}
              message={semToken
                ? 'Abra o link inteiro que chegou no e-mail (copie e cole a linha completa, sem cortar o final). Se ele já tiver sido usado ou passado da validade, peça um novo em "Esqueci minha senha".'
                : `O link de senha vale por ${VALIDADE_DO_LINK} e só pode ser usado uma vez. Peça um novo em "Esqueci minha senha" e abra a mensagem mais recente do e-mail.`}
            />
          </div>
        ) : null}

        {concluido ? (
          <div className="layout-shell">
            <Alert
              type="success"
              title="Senha definida"
              message="Sua senha já está valendo. Entre no sistema com o seu e-mail e a nova senha."
            />
          </div>
        ) : null}

        <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
          {/* B3: a regra da senha é dita UMA vez (apoio do topo); as
              etiquetas abaixo do campo têm função diferente — mostram, ao
              vivo, o que já foi atendido. */}
          <CampoForm label="Nova senha" obrigatorio>
            <span className="relative block">
              <input
                className="input login-input-pw"
                type={mostrarSenha ? 'text' : 'password'}
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                autoComplete="new-password"
                disabled={loading || bloqueado}
                required
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm absolute right-1 top-1/2 -translate-y-1/2"
                onClick={() => setMostrarSenha((current) => !current)}
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={mostrarSenha}
                disabled={loading || bloqueado}
              >
                {mostrarSenha ? <HiEyeSlash aria-hidden="true" /> : <HiEye aria-hidden="true" />}
              </button>
            </span>
          </CampoForm>

          <ul className="flex flex-wrap gap-2">
            {passwordStatus.map((rule) => (
              <li
                key={rule.key}
                className={`fx-badge ${rule.ok ? 'fx-badge--success' : 'fx-badge--neutral'}`}
              >
                <IconeRequisito ok={rule.ok} />
                {rule.label}
                <span className="sr-only">{rule.ok ? ' — atendido' : ' — ainda falta'}</span>
              </li>
            ))}
          </ul>

          <CampoForm label="Confirmar senha" obrigatorio hint="Digite a mesma senha outra vez.">
            <span className="relative block">
              <input
                className="input login-input-pw"
                type={mostrarConfirmacao ? 'text' : 'password'}
                value={confirmacao}
                onChange={(event) => setConfirmacao(event.target.value)}
                autoComplete="new-password"
                disabled={loading || bloqueado}
                required
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm absolute right-1 top-1/2 -translate-y-1/2"
                onClick={() => setMostrarConfirmacao((current) => !current)}
                aria-label={mostrarConfirmacao ? 'Ocultar confirmação de senha' : 'Mostrar confirmação de senha'}
                aria-pressed={mostrarConfirmacao}
                disabled={loading || bloqueado}
              >
                {mostrarConfirmacao ? <HiEyeSlash aria-hidden="true" /> : <HiEye aria-hidden="true" />}
              </button>
            </span>
          </CampoForm>

          <button className="btn btn-primary justify-center" type="submit" disabled={loading || bloqueado}>
            {loading ? 'Salvando...' : 'Definir senha'}
          </button>
        </form>

        {/* C6/R11 invertidas: fora do shell, estes dois links são a única
            navegação existente — e são a saída dos caminhos de erro (link
            vencido, link incompleto). */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Link className="btn btn-outline justify-center" to="/login">
            Ir para o login
          </Link>
          {concluido ? null : (
            <Link className="btn btn-outline justify-center" to="/recuperar-senha">
              Pedir um novo link
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
