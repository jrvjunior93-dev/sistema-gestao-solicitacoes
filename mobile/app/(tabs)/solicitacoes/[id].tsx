import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../src/components/common/Button';
import { Chip } from '../../../src/components/common/Chip';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { LoadingState } from '../../../src/components/common/LoadingState';
import { ProfileShortcut } from '../../../src/components/common/ProfileShortcut';
import { Screen } from '../../../src/components/common/Screen';
import { SectionCard } from '../../../src/components/common/SectionCard';
import { StatusBadge } from '../../../src/components/common/StatusBadge';
import { TextField } from '../../../src/components/common/TextField';
import { AttachmentRow } from '../../../src/components/solicitacoes/AttachmentRow';
import { TimelineEventCard } from '../../../src/components/solicitacoes/TimelineEventCard';
import {
  addSolicitacaoComment,
  assumirSolicitacao,
  getSignedAttachmentUrl,
  getSolicitacaoById,
  uploadSolicitacaoArquivos
} from '../../../src/services/api/solicitacoes';
import { getUsuariosLista } from '../../../src/services/api/lookups';
import type { MobileUploadAsset, UsuarioPublicoOption } from '../../../src/services/api/types';
import { colors, spacing } from '../../../src/theme';
import { formatCurrencyBR, formatDateBR, formatPhoneBR } from '../../../src/utils/format';
import {
  extractAttachmentFromHistorico,
  resolveSolicitacaoResponsavel,
  resolveSolicitacaoSetorAtual
} from '../../../src/utils/solicitacoes';

type DetailTab = 'resumo' | 'historico' | 'anexos' | 'interacoes';

export default function SolicitacaoDetalhePage() {
  const abrindoAnexo = useRef(false);
  const previewAtivo = useRef(true);
  useEffect(() => {
    previewAtivo.current = true;
    return () => { previewAtivo.current = false; };
  }, []);
  const params = useLocalSearchParams<{ id: string }>();
  const solicitacaoId = params.id;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<DetailTab>('resumo');
  const [commentText, setCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [mentionPickerVisible, setMentionPickerVisible] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [selectedMentions, setSelectedMentions] = useState<UsuarioPublicoOption[]>([]);
  const [files, setFiles] = useState<MobileUploadAsset[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [assumeLoading, setAssumeLoading] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['solicitacoes', 'detail', solicitacaoId],
    queryFn: () => getSolicitacaoById(solicitacaoId),
    enabled: Boolean(solicitacaoId)
  });
  const usuariosQuery = useQuery({
    queryKey: ['usuarios', 'lista-publica'],
    queryFn: getUsuariosLista,
    enabled: activeTab === 'interacoes'
  });

  const attachments = useMemo(
    () => (detailQuery.data?.historicos || [])
      .map(extractAttachmentFromHistorico)
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [detailQuery.data?.historicos]
  );
  const comentarios = useMemo(
    () => (detailQuery.data?.historicos || []).filter(
      (item) => String(item.acao || '').toUpperCase() === 'COMENTARIO'
    ),
    [detailQuery.data?.historicos]
  );
  const usuariosDisponiveis = useMemo(() => {
    const termo = String(mentionSearch || '').trim().toLowerCase();
    const selecionados = new Set(selectedMentions.map((usuario) => Number(usuario.id)));

    return (usuariosQuery.data || []).filter((usuario) => {
      if (selecionados.has(Number(usuario.id))) {
        return false;
      }

      if (!termo) {
        return true;
      }

      const nome = String(usuario.nome || '').toLowerCase();
      const email = String(usuario.email || '').toLowerCase();
      return nome.includes(termo) || email.includes(termo);
    });
  }, [mentionSearch, selectedMentions, usuariosQuery.data]);

  const refreshAll = async () => {
    await detailQuery.refetch();
    await queryClient.invalidateQueries({ queryKey: ['solicitacoes'] });
  };

  const handleAssumir = async () => {
    try {
      setAssumeLoading(true);
      await assumirSolicitacao(solicitacaoId);
      await refreshAll();
      Alert.alert('Solicitacao assumida', 'A responsabilidade foi atualizada com sucesso.');
    } catch (error) {
      Alert.alert('Nao foi possivel assumir', error instanceof Error ? error.message : 'Erro inesperado');
    } finally {
      setAssumeLoading(false);
    }
  };

  const handleComment = async () => {
    if (!commentText.trim()) return;

    try {
      setCommentLoading(true);
      await addSolicitacaoComment(solicitacaoId, {
        descricao: commentText.trim(),
        mencoes: selectedMentions.map((usuario) => Number(usuario.id))
      });
      setCommentText('');
      setSelectedMentions([]);
      setMentionSearch('');
      setMentionPickerVisible(false);
      await refreshAll();
      setActiveTab('historico');
    } catch (error) {
      Alert.alert('Erro ao comentar', error instanceof Error ? error.message : 'Falha ao enviar comentario');
    } finally {
      setCommentLoading(false);
    }
  };

  const handleAdicionarMencao = (usuario: UsuarioPublicoOption) => {
    setSelectedMentions((current) => {
      if (current.some((item) => Number(item.id) === Number(usuario.id))) {
        return current;
      }
      return [...current, usuario];
    });
    setMentionSearch('');
  };

  const handleRemoverMencao = (usuarioId: number) => {
    setSelectedMentions((current) => current.filter((usuario) => Number(usuario.id) !== Number(usuarioId)));
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
      Alert.alert('Permissao necessaria', 'Libere a camera para anexar fotos direto da obra.');
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
      await uploadSolicitacaoArquivos({
        solicitacaoId,
        files
      });
      setFiles([]);
      await refreshAll();
      setActiveTab('anexos');
      Alert.alert('Anexos enviados', 'Os arquivos foram vinculados a solicitacao.');
    } catch (error) {
      Alert.alert(
        'Erro ao enviar anexos',
        error instanceof Error ? error.message : 'Falha inesperada no upload'
      );
    } finally {
      setFilesLoading(false);
    }
  };

  const openAttachment = async (path: string, title?: string) => {
    if (abrindoAnexo.current) return;
    abrindoAnexo.current = true;
    try {
      const signedUrl = await getSignedAttachmentUrl(path);
      if (!previewAtivo.current) return;
      router.push({ pathname: '/anexo', params: { url: signedUrl, title: title || 'Anexo da solicitação', source: path } });
    } catch (error) {
      if (previewAtivo.current) Alert.alert('Erro ao abrir arquivo', error instanceof Error ? error.message : 'Falha inesperada');
    } finally {
      abrindoAnexo.current = false;
    }
  };

  if (detailQuery.isLoading) {
    return (
      <Screen scroll={false}>
        <LoadingState label="Carregando detalhe..." />
      </Screen>
    );
  }

  if (!detailQuery.data) {
    return (
      <Screen>
        <EmptyState
          title="Solicitacao nao encontrada"
          description="Verifique se ela ainda esta no seu escopo ou atualize a tela."
          actionLabel="Tentar novamente"
          onAction={() => void detailQuery.refetch()}
        />
      </Screen>
    );
  }

  const solicitacao = detailQuery.data;
  const responsavelAtual = resolveSolicitacaoResponsavel(solicitacao) || 'Aguardando assuncao';
  const setorAtual = resolveSolicitacaoSetorAtual(solicitacao) || '-';

  return (
    <Screen refreshing={detailQuery.isRefetching} onRefresh={() => void refreshAll()}>
      <ProfileShortcut subtitle="Conta" />

      <View style={styles.headerShell}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.code}>{solicitacao.codigo}</Text>
            <Text style={styles.title}>{solicitacao.descricao || 'Solicitacao sem descricao'}</Text>
          </View>
          <StatusBadge status={solicitacao.status_global} />
        </View>

        <View style={styles.summaryRibbon}>
          <HighlightMetric label="Responsavel" value={responsavelAtual} />
          <HighlightMetric label="Setor atual" value={setorAtual} />
          <HighlightMetric label="Valor" value={formatCurrencyBR(solicitacao.valor)} />
        </View>
      </View>

      <View style={styles.actionBar}>
        <Button
          label="Assumir"
          onPress={() => void handleAssumir()}
          loading={assumeLoading}
          fullWidth={false}
        />
        <Button
          label="Comentar"
          onPress={() => setActiveTab('interacoes')}
          variant="secondary"
          fullWidth={false}
        />
        <Button
          label="Anexar"
          onPress={() => setActiveTab('anexos')}
          variant="ghost"
          fullWidth={false}
        />
      </View>

      <View style={styles.tabs}>
        <Chip label="Resumo" active={activeTab === 'resumo'} onPress={() => setActiveTab('resumo')} />
        <Chip label="Historico" active={activeTab === 'historico'} onPress={() => setActiveTab('historico')} />
        <Chip label="Anexos" active={activeTab === 'anexos'} onPress={() => setActiveTab('anexos')} />
        <Chip label="Interacoes" active={activeTab === 'interacoes'} onPress={() => setActiveTab('interacoes')} />
      </View>

      {activeTab === 'resumo' ? (
        <SectionCard title="Resumo" subtitle="Leitura operacional essencial para agir rapido">
          <View style={styles.infoGrid}>
            <InfoLine label="Obra" value={solicitacao.obra?.nome || '-'} />
            <InfoLine label="Setor atual" value={setorAtual} />
            <InfoLine label="Responsavel" value={responsavelAtual} />
            <InfoLine label="Tipo" value={solicitacao.tipo?.nome || '-'} />
            <InfoLine label="Valor" value={formatCurrencyBR(solicitacao.valor)} />
            <InfoLine label="Vencimento" value={formatDateBR(solicitacao.data_vencimento)} />
            <InfoLine label="Parceiro" value={solicitacao.parceiro?.nome || '-'} />
            <InfoLine label="CPF/CNPJ" value={solicitacao.parceiro?.cpf_cnpj || '-'} />
            <InfoLine label="Contato" value={formatPhoneBR(solicitacao.parceiro?.telefone)} />
            <InfoLine label="Email" value={solicitacao.parceiro?.email || '-'} />
            <InfoLine
              label="Contrato"
              value={solicitacao.contrato?.codigo || solicitacao.codigo_contrato || '-'}
            />
          </View>
        </SectionCard>
      ) : null}

      {activeTab === 'historico' ? (
        <SectionCard title="Historico" subtitle="Rastreabilidade completa da solicitacao">
          {(solicitacao.historicos || []).length === 0 ? (
            <EmptyState title="Sem historico" description="Os eventos desta solicitacao vao aparecer aqui." />
          ) : (
            <View style={styles.listColumn}>
              {(solicitacao.historicos || []).map((item) => (
                <TimelineEventCard key={item.id} item={item} />
              ))}
            </View>
          )}
        </SectionCard>
      ) : null}

      {activeTab === 'anexos' ? (
        <SectionCard title="Anexos" subtitle="Fotos, comprovantes e documentos da solicitacao">
          <View style={styles.actionGroup}>
            <Button label="Camera" onPress={() => void pickFromCamera()} variant="secondary" />
            <Button label="Galeria" onPress={() => void pickFromGallery()} variant="secondary" />
            <Button label="Documento" onPress={() => void pickDocument()} variant="secondary" />
          </View>

          {files.length > 0 ? (
            <View style={styles.pendingFiles}>
              <Text style={styles.pendingTitle}>Arquivos selecionados</Text>
              {files.map((file) => (
                <Text key={`${file.uri}-${file.name}`} style={styles.pendingItem}>
                  {file.name}
                </Text>
              ))}
              <Button label="Enviar anexos" onPress={() => void handleUpload()} loading={filesLoading} />
            </View>
          ) : null}

          {attachments.length === 0 ? (
            <EmptyState
              title="Nenhum anexo"
              description="Adicione arquivos para deixar o fluxo mais auditavel."
            />
          ) : (
            <View style={styles.listColumn}>
              {attachments.map((attachment) => (
                <AttachmentRow
                  key={`${attachment.id}-${attachment.path}`}
                  title={attachment.name}
                  createdAt={attachment.createdAt}
                  onPress={() => void openAttachment(attachment.path, attachment.name)}
                />
              ))}
            </View>
          )}
        </SectionCard>
      ) : null}

      {activeTab === 'interacoes' ? (
        <SectionCard title="Interacoes" subtitle="Comentarios curtos para manter a operacao alinhada">
          <TextField
            label="Novo comentario"
            value={commentText}
            onChangeText={setCommentText}
            placeholder="Escreva o contexto que o proximo usuario precisa ler"
            multiline
          />
          <View style={styles.mentionHeader}>
            <Button
              label={mentionPickerVisible ? 'Fechar mencoes' : '+ Mencionar usuario'}
              onPress={() => setMentionPickerVisible((current) => !current)}
              variant="secondary"
              fullWidth={false}
            />
            {selectedMentions.length > 0 ? (
              <Text style={styles.mentionCounter}>
                {selectedMentions.length} selecionado(s)
              </Text>
            ) : null}
          </View>

          {selectedMentions.length > 0 ? (
            <View style={styles.mentionChips}>
              {selectedMentions.map((usuario) => (
                <Pressable
                  key={usuario.id}
                  onPress={() => handleRemoverMencao(Number(usuario.id))}
                  style={styles.mentionChip}
                >
                  <Text style={styles.mentionChipLabel}>{usuario.nome}</Text>
                  <Text style={styles.mentionChipRemove}>x</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {mentionPickerVisible ? (
            <View style={styles.mentionPanel}>
              <TextField
                label="Buscar usuario"
                value={mentionSearch}
                onChangeText={setMentionSearch}
                placeholder="Nome ou email"
                autoCapitalize="none"
              />
              {usuariosQuery.isLoading ? (
                <Text style={styles.mentionHint}>Carregando usuarios ativos...</Text>
              ) : null}
              {usuariosQuery.isError ? (
                <Text style={styles.mentionHint}>
                  Nao foi possivel carregar a lista de usuarios para mencao.
                </Text>
              ) : null}

              {!usuariosQuery.isLoading && !usuariosQuery.isError ? (
                <ScrollView
                  style={styles.mentionResults}
                  contentContainerStyle={styles.mentionResultsContent}
                  nestedScrollEnabled
                >
                  {usuariosDisponiveis.length === 0 ? (
                    <Text style={styles.mentionHint}>Nenhum usuario disponivel para essa busca.</Text>
                  ) : (
                    usuariosDisponiveis.map((usuario) => (
                      <Pressable
                        key={usuario.id}
                        onPress={() => handleAdicionarMencao(usuario)}
                        style={({ pressed }) => [
                          styles.mentionRow,
                          pressed ? styles.mentionRowPressed : null
                        ]}
                      >
                        <View style={styles.mentionRowText}>
                          <Text style={styles.mentionRowName}>{usuario.nome}</Text>
                          <Text style={styles.mentionRowEmail}>{usuario.email || '-'}</Text>
                        </View>
                        <Text style={styles.mentionRowAction}>Adicionar</Text>
                      </Pressable>
                    ))
                  )}
                </ScrollView>
              ) : null}
            </View>
          ) : null}
          <Button label="Enviar comentario" onPress={() => void handleComment()} loading={commentLoading} />

          {comentarios.length === 0 ? (
            <EmptyState title="Sem comentarios" description="Quando houver interacoes, elas aparecerao aqui." />
          ) : (
            <View style={styles.listColumn}>
              {comentarios.map((item) => (
                <TimelineEventCard key={item.id} item={item} />
              ))}
            </View>
          )}
        </SectionCard>
      ) : null}
    </Screen>
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

function HighlightMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.highlightMetric}>
      <Text style={styles.highlightLabel}>{label}</Text>
      <Text style={styles.highlightValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerShell: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.panelBorderStrong,
    backgroundColor: colors.surfaceGlass
  },
  header: {
    gap: spacing.md
  },
  headerText: {
    gap: spacing.sm
  },
  code: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800'
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800'
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
  summaryRibbon: {
    gap: spacing.sm
  },
  highlightMetric: {
    gap: spacing.xs,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.panelStrong,
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
  infoGrid: {
    gap: spacing.md
  },
  infoLine: {
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    paddingBottom: spacing.sm
  },
  infoLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  infoValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600'
  },
  listColumn: {
    gap: spacing.md
  },
  actionGroup: {
    gap: spacing.md
  },
  pendingFiles: {
    gap: spacing.sm
  },
  pendingTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },
  pendingItem: {
    color: colors.textMuted,
    fontSize: 13
  },
  mentionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  mentionCounter: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700'
  },
  mentionChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  mentionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.panelBorderStrong,
    backgroundColor: colors.primarySoft
  },
  mentionChipLabel: {
    color: colors.primaryDeep,
    fontSize: 13,
    fontWeight: '700'
  },
  mentionChipRemove: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  mentionPanel: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surfaceGlass
  },
  mentionResults: {
    maxHeight: 240
  },
  mentionResultsContent: {
    gap: spacing.sm
  },
  mentionHint: {
    color: colors.textMuted,
    fontSize: 13
  },
  mentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface
  },
  mentionRowPressed: {
    opacity: 0.92
  },
  mentionRowText: {
    flex: 1,
    gap: spacing.xs
  },
  mentionRowName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },
  mentionRowEmail: {
    color: colors.textMuted,
    fontSize: 12
  },
  mentionRowAction: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase'
  }
});
