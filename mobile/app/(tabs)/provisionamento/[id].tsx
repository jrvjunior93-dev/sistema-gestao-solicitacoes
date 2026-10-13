import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { ActionCommentModal } from '../../../src/components/common/ActionCommentModal';
import { Button } from '../../../src/components/common/Button';
import { Chip } from '../../../src/components/common/Chip';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { LoadingState } from '../../../src/components/common/LoadingState';
import { PickerField } from '../../../src/components/common/PickerField';
import { ProfileShortcut } from '../../../src/components/common/ProfileShortcut';
import { Screen } from '../../../src/components/common/Screen';
import { SectionCard } from '../../../src/components/common/SectionCard';
import { TextField } from '../../../src/components/common/TextField';
import { AttachmentRow } from '../../../src/components/solicitacoes/AttachmentRow';
import { ProvisionamentoTimelineCard } from '../../../src/components/provisionamento/ProvisionamentoTimelineCard';
import { useModules } from '../../../src/features/modules/ModulesContext';
import {
  adicionarComentarioProvisaoFinanceira,
  aprovarProvisaoFinanceira,
  atualizarProvisaoFinanceira,
  atualizarStatusProvisaoFinanceira,
  cancelarProvisaoFinanceira,
  getProvisaoFinanceira,
  listarCategoriasMacroProvisionamento,
  obterUrlAssinadaAnexoProvisaoFinanceira,
  realizarProvisaoFinanceira,
  uploadAnexosProvisaoFinanceira
} from '../../../src/services/api/provisionamento';
import type { MobileUploadAsset } from '../../../src/services/api/types';
import { colors, spacing } from '../../../src/theme';
import {
  formatCurrencyBR,
  formatCurrencyInputBR,
  formatDateBR,
  formatDateTimeBR,
  maskDateInputBR,
  normalizeCurrencyInput,
  parseDateBRToApi
} from '../../../src/utils/format';
import {
  canAprovarProvisionamento,
  canCancelarProvisionamento,
  canEditarProvisionamento,
  canGerenciarStatusManualProvisionamento,
  canRealizarProvisionamento,
  formatProvisionamentoPrioridade,
  formatProvisionamentoStatus,
  normalizeProvisionamentoStatus
} from '../../../src/utils/provisionamento';

type DetailTab = 'resumo' | 'historico' | 'anexos' | 'interacoes';
type PendingAction = 'aprovar' | 'em_analise' | 'previsto' | 'cancelar' | 'realizar' | null;

function formatObra(obra?: { codigo?: string; nome?: string } | null) {
  if (!obra) return '-';
  return obra.codigo ? `${obra.codigo} - ${obra.nome}` : obra.nome || '-';
}

function getActionModalConfig(action: PendingAction) {
  switch (action) {
    case 'aprovar':
      return {
        title: 'Aprovar previsao',
        subtitle: 'O comentario e opcional para registrar o contexto da aprovacao.',
        required: false,
        confirmLabel: 'Aprovar'
      };
    case 'em_analise':
      return {
        title: 'Enviar para analise',
        subtitle: 'Use o comentario se quiser justificar a mudanca de etapa.',
        required: false,
        confirmLabel: 'Enviar'
      };
    case 'previsto':
      return {
        title: 'Voltar para previsto',
        subtitle: 'Use o comentario se precisar registrar a reversao.',
        required: false,
        confirmLabel: 'Voltar'
      };
    case 'cancelar':
      return {
        title: 'Cancelar previsao',
        subtitle: 'O motivo do cancelamento e obrigatorio.',
        required: true,
        confirmLabel: 'Cancelar previsao'
      };
    case 'realizar':
      return {
        title: 'Marcar como realizada',
        subtitle: 'O comentario e opcional para contextualizar a realizacao.',
        required: false,
        confirmLabel: 'Marcar como realizada'
      };
    default:
      return null;
  }
}

export default function ProvisionamentoDetalhePage() {
  const params = useLocalSearchParams<{ id: string }>();
  const provisionamentoId = params.id;
  const queryClient = useQueryClient();
  const {
    hasProvisionamentoAccess,
    canApproveProvisionamento,
    provisionamentoContexto
  } = useModules();
  const abrindoAnexo = useRef(false);
  const previewAtivo = useRef(true);
  useEffect(() => {
    previewAtivo.current = true;
    return () => { previewAtivo.current = false; };
  }, []);
  const [activeTab, setActiveTab] = useState<DetailTab>('resumo');
  const [commentText, setCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [files, setFiles] = useState<MobileUploadAsset[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [editando, setEditando] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [actionComment, setActionComment] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [form, setForm] = useState({
    item_macro: '',
    data_prevista_desembolso: '',
    descricao: '',
    valor_previsto: '',
    fornecedor_texto: '',
    comentario: '',
    prioridade: ''
  });

  const detailQuery = useQuery({
    queryKey: ['provisionamento', 'detail', provisionamentoId],
    queryFn: () => getProvisaoFinanceira(provisionamentoId),
    enabled: hasProvisionamentoAccess && Boolean(provisionamentoId)
  });
  const categoriasQuery = useQuery({
    queryKey: ['provisionamento', 'categorias-mobile', 'detail'],
    queryFn: () => listarCategoriasMacroProvisionamento(),
    enabled: hasProvisionamentoAccess
  });

  const provisao = detailQuery.data;
  const isSuperadmin = Boolean(provisionamentoContexto?.permissoes?.superadmin);
  const podeEditar = canEditarProvisionamento({
    isSuperadmin,
    status: provisao?.status
  });
  const podeGerenciarStatusManual = canGerenciarStatusManualProvisionamento({
    canApprove: canApproveProvisionamento,
    status: provisao?.status
  });
  const podeAprovar = canAprovarProvisionamento({
    canApprove: canApproveProvisionamento,
    status: provisao?.status
  });
  const podeCancelar = canCancelarProvisionamento({
    canApprove: canApproveProvisionamento,
    isSuperadmin,
    status: provisao?.status
  });
  const podeRealizar = canRealizarProvisionamento({
    canApprove: canApproveProvisionamento,
    status: provisao?.status
  });

  const refreshAll = async () => {
    await Promise.all([
      detailQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: ['provisionamento'] })
    ]);
  };

  const categoriasSugestao = categoriasQuery.data || [];
  const actionModalConfig = getActionModalConfig(pendingAction);

  if (!hasProvisionamentoAccess) {
    return <Redirect href="/modulo-indisponivel" />;
  }

  if (detailQuery.isLoading || !provisao) {
    return (
      <Screen scroll={false}>
        <LoadingState label="Carregando previsao..." />
      </Screen>
    );
  }

  const iniciarEdicao = () => {
    setForm({
      item_macro: provisao.categoriaMacro?.nome || '',
      data_prevista_desembolso: formatDateBR(String(provisao.data_prevista_desembolso || '')),
      descricao: provisao.descricao || '',
      valor_previsto: formatCurrencyInputBR(String(provisao.valor_previsto || '')),
      fornecedor_texto: provisao.fornecedor_texto || '',
      comentario: provisao.comentario || '',
      prioridade: provisao.prioridade || ''
    });
    setEditando(true);
  };

  const abrirAcao = (action: PendingAction) => {
    setActionComment('');
    setPendingAction(action);
  };

  const salvarEdicao = async () => {
    const valorPrevisto = normalizeCurrencyInput(form.valor_previsto);
    const dataPrevistaApi = parseDateBRToApi(form.data_prevista_desembolso);

    if (!form.item_macro.trim() || !dataPrevistaApi || !form.descricao.trim() || !valorPrevisto || valorPrevisto <= 0) {
      Alert.alert('Campos obrigatorios', 'Preencha item macro, data prevista, descricao e valor previsto.');
      return;
    }

    try {
      setSaving(true);
      await atualizarProvisaoFinanceira(provisao.id, {
        item_macro: form.item_macro.trim(),
        data_prevista_desembolso: dataPrevistaApi,
        descricao: form.descricao.trim(),
        valor_previsto: valorPrevisto,
        fornecedor_texto: form.fornecedor_texto.trim() || undefined,
        comentario: form.comentario.trim() || undefined,
        prioridade: form.prioridade || undefined
      });
      setEditando(false);
      await refreshAll();
    } catch (error) {
      Alert.alert('Erro ao salvar alteracoes', error instanceof Error ? error.message : 'Falha inesperada.');
    } finally {
      setSaving(false);
    }
  };

  const handleComment = async () => {
    if (!commentText.trim()) {
      Alert.alert('Comentario obrigatorio', 'Informe um comentario para registrar no historico.');
      return;
    }

    try {
      setCommentLoading(true);
      await adicionarComentarioProvisaoFinanceira(provisao.id, {
        comentario: commentText.trim()
      });
      setCommentText('');
      await refreshAll();
      setActiveTab('historico');
    } catch (error) {
      Alert.alert('Erro ao comentar', error instanceof Error ? error.message : 'Falha inesperada.');
    } finally {
      setCommentLoading(false);
    }
  };

  const appendFiles = (nextFiles: MobileUploadAsset[]) => {
    setFiles((current) => [...current, ...nextFiles]);
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1
    });

    if (result.canceled) return;

    appendFiles(result.assets.map((asset, index) => ({
      uri: asset.uri,
      name: asset.fileName || `foto-${Date.now()}-${index + 1}.jpg`,
      type: asset.mimeType || 'image/jpeg'
    })));
  };

  const pickFromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissao necessaria', 'Libere a camera para anexar fotos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 1
    });

    if (result.canceled) return;

    appendFiles(result.assets.map((asset, index) => ({
      uri: asset.uri,
      name: asset.fileName || `camera-${Date.now()}-${index + 1}.jpg`,
      type: asset.mimeType || 'image/jpeg'
    })));
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true
    });

    if (result.canceled) return;

    appendFiles(result.assets.map((asset, index) => ({
      uri: asset.uri,
      name: asset.name || `documento-${Date.now()}-${index + 1}`,
      type: asset.mimeType || 'application/octet-stream'
    })));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    try {
      setFilesLoading(true);
      await uploadAnexosProvisaoFinanceira(provisao.id, files);
      setFiles([]);
      await refreshAll();
      setActiveTab('anexos');
      Alert.alert('Anexos enviados', 'Os arquivos foram vinculados a previsao.');
    } catch (error) {
      Alert.alert('Erro ao enviar anexos', error instanceof Error ? error.message : 'Falha inesperada.');
    } finally {
      setFilesLoading(false);
    }
  };

  const openAttachment = async (path: string, title?: string) => {
    if (abrindoAnexo.current) return;
    abrindoAnexo.current = true;
    try {
      const signedUrl = await obterUrlAssinadaAnexoProvisaoFinanceira(path);
      if (!previewAtivo.current) return;
      router.push({
        pathname: '/anexo',
        params: {
          url: signedUrl,
          title: title || 'Anexo do provisionamento',
          source: path
        }
      });
    } catch (error) {
      if (previewAtivo.current) Alert.alert('Erro ao abrir anexo', error instanceof Error ? error.message : 'Falha inesperada.');
    } finally {
      abrindoAnexo.current = false;
    }
  };

  const executarAcao = async () => {
    if (!pendingAction || !actionModalConfig) return;
    if (actionModalConfig.required && !actionComment.trim()) {
      Alert.alert('Comentario obrigatorio', 'Preencha o comentario para concluir esta acao.');
      return;
    }

    try {
      setActionLoading(true);

      if (pendingAction === 'aprovar') {
        await aprovarProvisaoFinanceira(provisao.id, { comentario: actionComment.trim() || undefined });
      }
      if (pendingAction === 'em_analise') {
        await atualizarStatusProvisaoFinanceira(provisao.id, {
          status: 'em_analise',
          comentario: actionComment.trim() || undefined
        });
      }
      if (pendingAction === 'previsto') {
        await atualizarStatusProvisaoFinanceira(provisao.id, {
          status: 'previsto',
          comentario: actionComment.trim() || undefined
        });
      }
      if (pendingAction === 'cancelar') {
        await cancelarProvisaoFinanceira(provisao.id, { comentario: actionComment.trim() });
      }
      if (pendingAction === 'realizar') {
        await realizarProvisaoFinanceira(provisao.id, { comentario: actionComment.trim() || undefined });
      }

      setPendingAction(null);
      setActionComment('');
      await refreshAll();
    } catch (error) {
      Alert.alert('Erro ao executar acao', error instanceof Error ? error.message : 'Falha inesperada.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      <Screen refreshing={detailQuery.isRefetching} onRefresh={() => void refreshAll()}>
        <ProfileShortcut subtitle="Conta" />

        <View style={styles.headerShell}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.code}>{provisao.codigo}</Text>
              <Text style={styles.title}>{provisao.descricao || 'Previsao sem descricao'}</Text>
            </View>
            <Text style={styles.status}>{formatProvisionamentoStatus(provisao.status)}</Text>
          </View>

          <View style={styles.summaryRibbon}>
            <HighlightMetric label="Item Macro" value={provisao.categoriaMacro?.nome || '-'} />
            <HighlightMetric label="Data prevista" value={formatDateBR(provisao.data_prevista_desembolso)} />
            <HighlightMetric label="Valor" value={formatCurrencyBR(provisao.valor_previsto)} />
          </View>
        </View>

        <View style={styles.actionBar}>
          {podeGerenciarStatusManual && normalizeProvisionamentoStatus(provisao.status) === 'previsto' ? (
            <Button label="Enviar para analise" onPress={() => abrirAcao('em_analise')} fullWidth={false} />
          ) : null}
          {podeGerenciarStatusManual && normalizeProvisionamentoStatus(provisao.status) === 'em_analise' ? (
            <Button label="Voltar para previsto" onPress={() => abrirAcao('previsto')} variant="secondary" fullWidth={false} />
          ) : null}
          {podeAprovar ? (
            <Button label="Aprovar" onPress={() => abrirAcao('aprovar')} fullWidth={false} />
          ) : null}
          {podeCancelar ? (
            <Button label="Cancelar" onPress={() => abrirAcao('cancelar')} variant="secondary" fullWidth={false} />
          ) : null}
          {podeRealizar ? (
            <Button label="Marcar realizada" onPress={() => abrirAcao('realizar')} variant="secondary" fullWidth={false} />
          ) : null}
          {podeEditar ? (
            <Button
              label={editando ? 'Fechar edicao' : 'Editar'}
              onPress={() => {
                if (editando) {
                  setEditando(false);
                  return;
                }
                iniciarEdicao();
              }}
              variant="ghost"
              fullWidth={false}
            />
          ) : null}
        </View>

        <View style={styles.tabs}>
          <Chip label="Resumo" active={activeTab === 'resumo'} onPress={() => setActiveTab('resumo')} />
          <Chip label="Historico" active={activeTab === 'historico'} onPress={() => setActiveTab('historico')} />
          <Chip label="Anexos" active={activeTab === 'anexos'} onPress={() => setActiveTab('anexos')} />
          <Chip label="Interacoes" active={activeTab === 'interacoes'} onPress={() => setActiveTab('interacoes')} />
        </View>

        {activeTab === 'resumo' ? (
          <SectionCard title="Resumo" subtitle="Leitura operacional da previsao financeira">
            <View style={styles.infoGrid}>
              <InfoLine label="Obra" value={formatObra(provisao.obra)} />
              <InfoLine label="Item Macro" value={provisao.categoriaMacro?.nome || '-'} />
              <InfoLine label="Status" value={formatProvisionamentoStatus(provisao.status)} />
              <InfoLine label="Prioridade" value={formatProvisionamentoPrioridade(provisao.prioridade)} />
              <InfoLine label="Fornecedor" value={provisao.fornecedor_texto || '-'} />
              <InfoLine label="Criado por" value={provisao.usuarioCriacao?.nome || '-'} />
              <InfoLine label="Criado em" value={formatDateTimeBR(provisao.createdAt)} />
              <InfoLine label="Atualizado por" value={provisao.usuarioAtualizacao?.nome || '-'} />
              <InfoLine label="Aprovado por" value={provisao.aprovadoPor?.nome || '-'} />
              <InfoLine label="Aprovado em" value={formatDateTimeBR(provisao.aprovado_em)} />
              <InfoLine label="Cancelado por" value={provisao.canceladoPor?.nome || '-'} />
              <InfoLine label="Cancelado em" value={formatDateTimeBR(provisao.cancelado_em)} />
              <InfoLine label="Realizado em" value={formatDateTimeBR(provisao.realizado_em)} />
            </View>

            <InfoBlock label="Descricao" value={provisao.descricao || '-'} />
            <InfoBlock label="Comentario do registro" value={provisao.comentario || '-'} />
          </SectionCard>
        ) : null}

        {editando && activeTab === 'resumo' ? (
          <SectionCard title="Editar previsao" subtitle="Edicao restrita ao SUPERADMIN nas etapas abertas">
            <TextField
              label="Item Macro"
              value={form.item_macro}
              onChangeText={(value) => setForm((current) => ({ ...current, item_macro: value }))}
              helperText={
                categoriasSugestao.length > 0
                  ? `Sugestoes: ${categoriasSugestao.slice(0, 6).map((item) => item.nome).join(', ')}`
                  : undefined
              }
            />
            <TextField
              label="Data prevista"
              value={form.data_prevista_desembolso}
              onChangeText={(value) => setForm((current) => ({ ...current, data_prevista_desembolso: maskDateInputBR(value) }))}
              placeholder="DD/MM/AAAA"
              keyboardType="numeric"
            />
            <TextField
              label="Valor previsto"
              value={form.valor_previsto}
              onChangeText={(value) => setForm((current) => ({ ...current, valor_previsto: formatCurrencyInputBR(value) }))}
              keyboardType="numeric"
            />
            <PickerField
              label="Prioridade"
              value={form.prioridade}
              onValueChange={(value) => setForm((current) => ({ ...current, prioridade: value }))}
              items={(provisionamentoContexto?.prioridades_disponiveis || ['baixa', 'media', 'alta', 'critica']).map((value) => ({
                label: String(value),
                value: String(value)
              }))}
              placeholderLabel="Nao definida"
            />
            <TextField
              label="Fornecedor"
              value={form.fornecedor_texto}
              onChangeText={(value) => setForm((current) => ({ ...current, fornecedor_texto: value }))}
            />
            <TextField
              label="Descricao"
              value={form.descricao}
              onChangeText={(value) => setForm((current) => ({ ...current, descricao: value }))}
              multiline
            />
            <TextField
              label="Comentario do registro"
              value={form.comentario}
              onChangeText={(value) => setForm((current) => ({ ...current, comentario: value }))}
              multiline
            />
            <View style={styles.inlineActions}>
              <Button label="Cancelar" onPress={() => setEditando(false)} variant="secondary" fullWidth={false} />
              <Button label={saving ? 'Salvando...' : 'Salvar'} onPress={() => void salvarEdicao()} loading={saving} fullWidth={false} />
            </View>
          </SectionCard>
        ) : null}

        {activeTab === 'historico' ? (
          <SectionCard title="Historico" subtitle="Auditoria completa das alteracoes e decisoes">
            {(provisao.historicos || []).length === 0 ? (
              <EmptyState title="Sem historico" description="Os eventos desta previsao aparecerao aqui." />
            ) : (
              <View style={styles.listColumn}>
                {(provisao.historicos || []).map((item) => (
                  <ProvisionamentoTimelineCard key={item.id} item={item} />
                ))}
              </View>
            )}
          </SectionCard>
        ) : null}

        {activeTab === 'anexos' ? (
          <SectionCard title="Anexos" subtitle="Documentos, comprovantes e referencias da previsao">
            <View style={styles.inlineActions}>
              <Button label="Camera" onPress={() => void pickFromCamera()} variant="secondary" fullWidth={false} />
              <Button label="Galeria" onPress={() => void pickFromGallery()} variant="secondary" fullWidth={false} />
              <Button label="Documento" onPress={() => void pickDocument()} variant="secondary" fullWidth={false} />
            </View>

            {files.length > 0 ? (
              <View style={styles.pendingFiles}>
                <Text style={styles.pendingTitle}>Arquivos selecionados</Text>
                {files.map((file) => (
                  <Text key={`${file.uri}-${file.name}`} style={styles.pendingItem}>{file.name}</Text>
                ))}
                <Button label="Enviar anexos" onPress={() => void handleUpload()} loading={filesLoading} />
              </View>
            ) : null}

            {(provisao.anexos || []).length === 0 ? (
              <EmptyState title="Nenhum anexo" description="Adicione arquivos para enriquecer a leitura gerencial." />
            ) : (
              <View style={styles.listColumn}>
                {(provisao.anexos || []).map((item) => (
                  <AttachmentRow
                    key={item.id}
                    title={item.nome_original || `Anexo ${item.id}`}
                    createdAt={item.createdAt}
                    onPress={() => void openAttachment(String(item.caminho_arquivo || ''), item.nome_original || `Anexo ${item.id}`)}
                  />
                ))}
              </View>
            )}
          </SectionCard>
        ) : null}

        {activeTab === 'interacoes' ? (
          <SectionCard title="Comentarios" subtitle="Registre observacoes operacionais e gerenciais da previsao">
            <TextField
              label="Novo comentario"
              value={commentText}
              onChangeText={setCommentText}
              placeholder="Escreva o contexto que precisa ficar auditavel"
              multiline
            />
            <Button
              label={commentLoading ? 'Salvando...' : 'Adicionar comentario'}
              onPress={() => void handleComment()}
              loading={commentLoading}
            />
          </SectionCard>
        ) : null}
      </Screen>

      {actionModalConfig ? (
        <ActionCommentModal
          visible={Boolean(pendingAction)}
          title={actionModalConfig.title}
          subtitle={actionModalConfig.subtitle}
          required={actionModalConfig.required}
          confirmLabel={actionModalConfig.confirmLabel}
          value={actionComment}
          onChangeText={setActionComment}
          onClose={() => {
            if (actionLoading) return;
            setPendingAction(null);
            setActionComment('');
          }}
          onSubmit={() => void executarAcao()}
          loading={actionLoading}
        />
      ) : null}
    </>
  );
}

function HighlightMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.highlightMetric}>
      <Text style={styles.highlightLabel}>{label}</Text>
      <Text style={styles.highlightValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoBlock}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoBlockValue}>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerShell: {
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.panelBorderStrong,
    backgroundColor: colors.surfaceGlass
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md
  },
  headerText: {
    flex: 1,
    gap: spacing.xs
  },
  code: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800'
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800'
  },
  status: {
    color: colors.primaryStrong,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  summaryRibbon: {
    gap: spacing.sm
  },
  highlightMetric: {
    gap: spacing.xs,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    padding: spacing.md
  },
  highlightLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  highlightValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700'
  },
  actionBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md
  },
  infoLine: {
    minWidth: '44%',
    flex: 1,
    gap: spacing.xs
  },
  infoLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  infoValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600'
  },
  infoBlock: {
    gap: spacing.xs
  },
  infoBlockValue: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    backgroundColor: colors.surfaceGlass,
    padding: spacing.md
  },
  inlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  listColumn: {
    gap: spacing.md
  },
  pendingFiles: {
    gap: spacing.sm,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.panelBorderStrong,
    backgroundColor: colors.surfaceGlass,
    padding: spacing.md
  },
  pendingTitle: {
    color: colors.primaryStrong,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  pendingItem: {
    color: colors.text,
    fontSize: 13
  }
});
