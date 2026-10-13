import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Screen } from '../src/components/common/Screen';
import { colors, radii, spacing } from '../src/theme';
import { inferPreviewKind, isPreviewUrlSafe } from '../src/utils/arquivoPreview';

export default function AnexoPreviewPage() {
  const params = useLocalSearchParams<{ url?: string; title?: string; source?: string }>();
  const url = String(params.url || '').trim();
  const title = String(params.title || 'Anexo').trim();
  const kind = useMemo(() => inferPreviewKind(params.source, params.title), [params.source, params.title]);
  const [falhou, setFalhou] = useState(false);
  useEffect(() => { setFalhou(false); }, [url]);
  const fechar = () => router.canGoBack() ? router.back() : router.replace('/(tabs)');

  const handleAbrirNavegador = async () => {
    if (!isPreviewUrlSafe(url)) return;

    try {
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert('Erro ao abrir anexo', error instanceof Error ? error.message : 'Falha inesperada.');
    }
  };

  if (!isPreviewUrlSafe(url)) {
    return (
      <Screen>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Anexo indisponivel</Text>
          <Text style={styles.emptyDescription}>
            Nao foi possivel identificar a URL assinada deste arquivo.
          </Text>
          <Pressable style={styles.browserButton} onPress={fechar} accessibilityRole="button">
            <Text style={styles.browserButtonLabel}>Fechar</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentContainerStyle={{ flex: 1, paddingBottom: spacing.lg }}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
        </View>
        <Pressable style={styles.browserButton} onPress={fechar} accessibilityRole="button">
          <Text style={styles.browserButtonLabel}>Fechar</Text>
        </Pressable>
      </View>

      <View style={styles.viewerShell}>
        {falhou || kind === 'document' ? (
          <Text style={styles.emptyDescription}>Visualização indisponível. Use a opção de abrir no navegador.</Text>
        ) : kind === 'image' ? (
          <Image source={{ uri: url }} style={styles.image} resizeMode="contain" onError={() => setFalhou(true)} />
        ) : (
          <WebView
            source={{ uri: url }}
            style={styles.webview}
            startInLoadingState
            allowsBackForwardNavigationGestures
            setSupportMultipleWindows={false}
            onError={() => setFalhou(true)}
            onHttpError={() => setFalhou(true)}
            onShouldStartLoadWithRequest={request => isPreviewUrlSafe(request.url) || request.url === 'about:blank'}
          />
        )}
      </View>
      <View>
        <Pressable style={styles.browserButton} onPress={() => void handleAbrirNavegador()} accessibilityRole="button">
          <Feather name="external-link" size={16} color={colors.primaryStrong} />
          <Text style={styles.browserButtonLabel}>Abrir no navegador</Text>
        </Pressable>
      </View>

    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.panelBorderStrong,
    backgroundColor: colors.surfaceGlass
  },
  headerText: {
    flex: 1,
    gap: spacing.xs
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800'
  },
  browserButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.panelBorderStrong,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  browserButtonLabel: {
    color: colors.primaryStrong,
    fontSize: 13,
    fontWeight: '700'
  },
  viewerShell: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.panelBorderStrong,
    backgroundColor: colors.surfaceGlass
  },
  image: {
    width: '100%',
    height: '100%'
  },
  webview: {
    flex: 1,
    backgroundColor: colors.surface
  },
  emptyState: {
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.panelBorderStrong,
    backgroundColor: colors.surfaceGlass
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800'
  },
  emptyDescription: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 21
  }
});
