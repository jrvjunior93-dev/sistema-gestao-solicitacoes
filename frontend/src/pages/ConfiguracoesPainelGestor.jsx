import { useEffect, useRef, useState } from 'react';
import { getPainelGestorPin, salvarPainelGestorPin } from '../services/painelGestorConfig';
import {
  Avisos,
  BlocoConteudo,
  CampoForm,
  FormSecao,
  Pagina,
  PageHeader,
  useAvisos,
  useConfirmacao
} from '../components/padrao';

/**
 * SENHA DO PAINEL DO GESTOR — uma senha única do sistema (4 dígitos), pedida
 * ao abrir o olho do painel. Não é a senha de login de ninguém. O backend
 * nunca devolve a senha salva; a tela só mostra se existe e quando mudou.
 */

const somenteDigitos = (valor) => String(valor || '').replace(/\D/g, '').slice(0, 4);

function formatarDataHora(valor) {
  if (!valor) return '';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function ConfiguracoesPainelGestor() {
  const [status, setStatus] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [indisponivel, setIndisponivel] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const emEnvio = useRef(false);
  const { avisos, avisar, fechar, limpar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  useEffect(() => {
    let ativo = true;
    getPainelGestorPin()
      .then((dados) => { if (ativo) setStatus(dados); })
      .catch((erro) => {
        if (!ativo) return;
        if (erro?.indisponivel) setIndisponivel(true);
        else avisar.erro(erro?.message || 'Não foi possível consultar a senha do painel.');
      })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [avisar]);

  const erroPin = tentou && pin.length !== 4 ? 'A senha deve ter exatamente 4 dígitos.' : '';
  const erroConfirmacao = tentou && pin.length === 4 && confirmacao !== pin ? 'As senhas não são iguais.' : '';
  const configurado = Boolean(status?.configurado);
  const atualizadoEm = formatarDataHora(status?.atualizado_em);

  async function salvar(event) {
    event.preventDefault();
    if (emEnvio.current) return;
    limpar();
    setTentou(true);
    if (pin.length !== 4 || confirmacao !== pin) return;

    const novoPin = pin;
    const jaConfigurado = configurado;
    emEnvio.current = true;
    setSalvando(true);
    try {
      const { ok } = await confirmar({
        titulo: jaConfigurado ? 'Trocar a senha do painel' : 'Definir a senha do painel',
        mensagem: jaConfigurado
          ? 'A senha atual deixa de valer em todos os painéis.'
          : 'Esta passa a ser a senha pedida para abrir os valores em todos os painéis.',
        rotuloConfirmar: 'Salvar senha'
      });
      if (!ok) return;

      await salvarPainelGestorPin(novoPin);
      setStatus({ configurado: true, atualizado_em: new Date().toISOString() });
      setPin('');
      setConfirmacao('');
      setTentou(false);
      avisar.sucesso('Senha do Painel do Gestor salva.');
    } catch (erro) {
      if (erro?.indisponivel) {
        setIndisponivel(true);
      } else if (erro?.status === 403) {
        avisar.erro('Você não tem permissão para alterar a senha do painel.');
      } else if (erro?.status === 400) {
        avisar.erro('A senha deve ter exatamente 4 dígitos numéricos.');
      } else {
        avisar.erro(erro?.message || 'Não foi possível salvar a senha do painel.');
      }
    } finally {
      emEnvio.current = false;
      setSalvando(false);
    }
  }

  const textoStatus = carregando
    ? 'Consultando...'
    : indisponivel
      ? 'Indisponível no servidor'
      : configurado
        ? `Configurada${atualizadoEm ? ` · alterada em ${atualizadoEm}` : ''}`
        : 'Não configurada — ninguém consegue abrir o olho do painel';

  return (
    <Pagina>
      <PageHeader
        titulo="Senha do Painel do Gestor"
        descricao="Senha única de 4 dígitos pedida para abrir os valores do Painel do Gestor. Não é a senha de login."
        voltar={{ to: '/configuracoes', title: 'Voltar para Configurações' }}
      />

      <BlocoConteudo titulo="Senha do painel" variante="primario" cor="var(--c-primary)">
        <form onSubmit={salvar} className="space-y-4" autoComplete="off">
          <Avisos avisos={avisos} aoFechar={fechar} />

          <p className="app-note" role="status">
            Situação: <span className="font-semibold text-[var(--c-text)]">{textoStatus}</span>
          </p>

          {indisponivel ? (
            <p className="app-note">
              Esta configuração ainda não está disponível neste servidor. Tente novamente depois da próxima atualização do sistema.
            </p>
          ) : (
            <>
              <FormSecao legenda={configurado ? 'Trocar senha' : 'Definir senha'}>
                <CampoForm label="Nova senha" obrigatorio erro={erroPin} hint="4 dígitos numéricos">
                  <input
                    className="input"
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={4}
                    pattern="[0-9]{4}"
                    value={pin}
                    onChange={(e) => { setPin(somenteDigitos(e.target.value)); limpar(); }}
                    disabled={carregando || salvando}
                  />
                </CampoForm>
                <CampoForm label="Confirmar senha" obrigatorio erro={erroConfirmacao}>
                  <input
                    className="input"
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={4}
                    pattern="[0-9]{4}"
                    value={confirmacao}
                    onChange={(e) => { setConfirmacao(somenteDigitos(e.target.value)); limpar(); }}
                    disabled={carregando || salvando}
                  />
                </CampoForm>
              </FormSecao>

              <div className="app-actionbar">
                <button type="submit" className="btn btn-primary" disabled={carregando || salvando}>
                  {salvando ? 'Salvando...' : 'Salvar senha'}
                </button>
              </div>
            </>
          )}
        </form>
      </BlocoConteudo>
      {elementoConfirmacao}
    </Pagina>
  );
}
