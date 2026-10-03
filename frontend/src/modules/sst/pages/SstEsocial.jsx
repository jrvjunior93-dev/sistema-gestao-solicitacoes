import { useEffect, useMemo, useState } from 'react';
import { canManageSstArea } from '../../../utils/acessoProduto';
import { useAuth } from '../../../contexts/AuthContext';
import { useUiVisibility } from '../../../hooks/useUiVisibility';
import {
  assinarXmlEsocialSst,
  consultarRetornoEsocialSst,
  criarLoteRestritaEsocialSst,
  enviarLoteRestritaEsocialSst,
  gerarXmlEsocialSst,
  getEsocialCertificadoStatusSst,
  getEsocialEventosSst,
  getEsocialLotesSst,
  validarXmlEsocialSst
} from '../services/sst';
import {
  Avisos,
  BlocoConteudo,
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  TabelaPadrao,
  useAvisos,
  useConfirmacao
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';

/*
  R2/R25 — o status do eSocial é vocabulário próprio da integração
  (GERADO, ASSINADO, BLOQUEADO_PRODUCAO, PENDENCIA_XSD…), que o classificador
  automático do StatusBadge não conhece: ele leria "BLOQUEADO_PRODUCAO" como
  perigo quando aqui é o estado ESPERADO desta fase, e "PENDENCIA" como
  atenção genérica. Então a família é declarada aqui, e a cor sai do token —
  as classes emerald/amber/rose que a tela escrevia à mão saíram.
*/
function familiaStatusEsocial(status) {
  const valor = String(status || '').toUpperCase();
  if (valor.includes('ERRO') || valor.includes('INVALIDO') || valor.includes('REJEIT')) return 'danger';
  if (valor.includes('BLOQUEADO') || valor.includes('PENDENCIA')) return 'warning';
  if (valor.includes('VALID') || valor.includes('GERADO') || valor.includes('ASSINADO') || valor.includes('TRANSMITIDO')) return 'success';
  return 'neutral';
}

function CelulaStatus({ valor }) {
  if (!valor) return '-';
  return <StatusBadge status={valor} kind={familiaStatusEsocial(valor)} />;
}

export default function SstEsocial() {
  const { user } = useAuth();
  const { isVisible } = useUiVisibility();
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const canManage = canManageSstArea(user, 'esocial');
  const [eventos, setEventos] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState('');
  const [certStatus, setCertStatus] = useState(null);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const load = async () => {
    setLoading(true);
    try {
      const [eventosPayload, lotesPayload, certPayload] = await Promise.all([
        getEsocialEventosSst({ limit: 100 }),
        getEsocialLotesSst({ limit: 50 }),
        getEsocialCertificadoStatusSst()
      ]);
      setEventos(eventosPayload.rows || []);
      setLotes(lotesPayload.rows || []);
      setCertStatus(certPayload);
    } catch (err) {
      avisar.erro(err.message || 'Erro ao carregar eSocial SST');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runEventAction = async (eventId, action, label) => {
    setActionId(`${label}-${eventId}`);
    try {
      const payload = await action(eventId);
      avisar.sucesso(`${label}: ${payload.status || payload?.evento?.status || 'concluido'}.`);
      await load();
    } catch (err) {
      avisar.erro(err.message || `Erro em ${label}`);
    } finally {
      setActionId('');
    }
  };

  const createBatch = async () => {
    // R26: o lote é montado sobre a seleção FIXADA aqui. O modal não congela a
    // tela — sem esta cópia, marcar/desmarcar um evento com a confirmação
    // aberta faria a pergunta valer para uma seleção e o envio para outra.
    const eventosDoLote = [...selected];
    if (!eventosDoLote.length) return;
    // R21: o retorno de confirmar() é objeto — SEMPRE desestruturado.
    const { ok } = await confirmar({
      titulo: 'Criar lote restrito',
      mensagem: `Criar lote restrito com ${eventosDoLote.length} evento(s) selecionado(s)? O lote nasce apto a ser transmitido no ambiente restrito.`,
      rotuloConfirmar: 'Criar lote'
    });
    if (!ok) return;
    setActionId('lote');
    try {
      const payload = await criarLoteRestritaEsocialSst(eventosDoLote);
      avisar.sucesso(`Lote restrito criado: #${payload.id}.`);
      setSelected([]);
      await load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao criar lote restrito');
    } finally {
      setActionId('');
    }
  };

  const runBatchAction = async (lote, action, label) => {
    // R26: o lote alvo é fixado ANTES do await — a mensagem e a ação falam do
    // MESMO registro, ainda que a lista se recarregue com o modal aberto.
    const alvo = lote;
    if (label === 'Enviar restrita') {
      const { ok } = await confirmar({
        titulo: 'Enviar lote na produção restrita',
        mensagem: `Transmitir o lote #${alvo.id} para o ambiente restrito do eSocial? A transmissão sai do sistema e é registrada no órgão.`,
        rotuloConfirmar: 'Enviar restrita'
      });
      if (!ok) return;
    }
    setActionId(`${label}-${alvo.id}`);
    try {
      const payload = await action(alvo.id);
      avisar.sucesso(`${label}: ${payload.status || 'concluido'}.`);
      await load();
    } catch (err) {
      avisar.erro(err.message || `Erro em ${label}`);
    } finally {
      setActionId('');
    }
  };

  const alternarSelecionado = (id) => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const alternarTodos = (marcar, ids) => {
    setSelected(marcar ? ids : []);
  };

  return (
    <Pagina className="sst-page">
      <PageHeader
        titulo="Integração eSocial controlada"
        descricao="Geração, validação, assinatura e transmissão restrita dos eventos S-2210, S-2220 e S-2240 com produção oficial bloqueada."
        acaoPrincipal={{ rotulo: 'Atualizar', onClick: load }}
        secundarias={isVisible('sst.esocial.acoes_xml') && canManage ? [{
          rotulo: actionId === 'lote' ? 'Gerando...' : `Criar lote (${selected.length})`,
          onClick: createBatch,
          desabilitada: !selected.length || actionId === 'lote',
          title: 'Cria um lote restrito com os eventos marcados na lista'
        }] : []}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <StatGrid colunas={3}>
        <StatTile label="Ambiente" valor="Produção restrita" sub="Produção oficial permanece bloqueada por regra de backend." />
        {isVisible('sst.esocial.certificado') ? (
          <StatTile
            label="Certificado A1"
            valor={certStatus?.status || 'Nao validado'}
            sub={certStatus?.errors?.[0] || 'Metadados seguros, sem expor senha ou caminho.'}
            tom={certStatus?.valid ? 'success' : 'warning'}
          />
        ) : null}
        <StatTile
          label="Eventos preparados"
          valor={loading ? '...' : eventos.length}
          sub={`${lotes.length} lote(s) restrito(s)`}
        />
      </StatGrid>

      {isVisible('sst.esocial.tabela') ? (
        <BlocoConteudo
          titulo="Eventos preparados"
          contagem={loading ? 'Carregando' : `${eventos.length} evento(s)`}
          variante="primario"
          cor="var(--sem-info)"
        >
          <TabelaPadrao
            // R16b — a marcação em lote é capacidade do componente (com
            // "todos" no cabeçalho e estado indeterminado); a coluna de
            // checkbox montada à mão dentro de um `tipo: 'status'` saiu.
            selecao={canManage ? {
              selecionados: selectedSet,
              aoAlternar: (id) => alternarSelecionado(id),
              aoAlternarTodos: alternarTodos
            } : undefined}
            colunas={[
              {
                id: 'evento',
                titulo: 'Evento',
                // R17: o tipo do evento (S-2210/S-2220/S-2240) é o que nomeia
                // a linha para quem opera a integração.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (evento) => evento.tipo_evento
              },
              {
                id: 'status',
                titulo: 'Status',
                tipo: 'status',
                render: (evento) => <CelulaStatus valor={evento.status} />
              },
              {
                id: 'ambiente',
                titulo: 'Ambiente',
                tipo: 'texto',
                render: (evento) => evento.ambiente || '-'
              },
              {
                id: 'protocolo',
                titulo: 'Protocolo',
                tipo: 'codigo',
                render: (evento) => evento.protocolo || '-'
              }
            ]}
            itens={eventos}
            carregando={loading}
            vazio="Nenhum evento preparado."
            storageKey="tabela:sst-esocial:eventos"
            rotuloRolagem="Eventos preparados"
            larguraAcoes={320}
            acoesLinha={canManage ? (evento) => (
              <>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={Boolean(actionId)}
                  onClick={() => runEventAction(evento.id, gerarXmlEsocialSst, 'Gerar XML')}
                >
                  Gerar XML
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={Boolean(actionId)}
                  onClick={() => runEventAction(evento.id, validarXmlEsocialSst, 'Validar XML')}
                >
                  Validar
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={Boolean(actionId)}
                  onClick={() => runEventAction(evento.id, assinarXmlEsocialSst, 'Assinar XML')}
                >
                  Assinar
                </button>
              </>
            ) : undefined}
          />
        </BlocoConteudo>
      ) : null}

      {isVisible('sst.esocial.lotes') ? (
        <BlocoConteudo titulo="Lotes restritos" contagem={`${lotes.length} lote(s)`}>
          <TabelaPadrao
            colunas={[
              {
                id: 'lote',
                titulo: 'Lote',
                // R17: o lote não tem nome próprio — o número é a identidade
                // que o operador usa para falar dele com o órgão.
                tipo: 'identidade',
                noCard: 'titulo',
                render: (lote) => `#${lote.id}`
              },
              {
                id: 'status',
                titulo: 'Status',
                tipo: 'status',
                render: (lote) => <CelulaStatus valor={lote.status} />
              },
              {
                id: 'ambiente',
                titulo: 'Ambiente',
                tipo: 'texto',
                render: (lote) => lote.ambiente
              },
              {
                id: 'protocolo',
                titulo: 'Protocolo',
                tipo: 'codigo',
                render: (lote) => lote.protocolo || '-'
              }
            ]}
            itens={lotes}
            carregando={loading}
            vazio="Nenhum lote restrito criado."
            storageKey="tabela:sst-esocial:lotes"
            rotuloRolagem="Lotes restritos"
            larguraAcoes={280}
            acoesLinha={canManage ? (lote) => (
              <>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={Boolean(actionId)}
                  onClick={() => runBatchAction(lote, enviarLoteRestritaEsocialSst, 'Enviar restrita')}
                >
                  Enviar restrita
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={Boolean(actionId)}
                  onClick={() => runBatchAction(lote, consultarRetornoEsocialSst, 'Consultar retorno')}
                >
                  Consultar
                </button>
              </>
            ) : undefined}
          />
        </BlocoConteudo>
      ) : null}

      {elementoConfirmacao}
    </Pagina>
  );
}
