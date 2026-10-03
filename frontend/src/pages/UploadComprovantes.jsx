import { useMemo, useRef, useState } from 'react';
import { HiPaperClip, HiOutlineCloudArrowUp } from 'react-icons/hi2';
import { uploadComprovantes } from '../services/comprovantes';
import PendingAttachmentsList from '../components/attachments/PendingAttachmentsList';
import { Pagina, PageHeader, BlocoConteudo, Avisos, useAvisos } from '../components/padrao';
import Alert from '../components/ui/Alert';
import {
  UPLOAD_MAX_FILE_SIZE_MB_PADRAO,
  concatenarAnexosPendentes,
  extrairFilesAnexosPendentes,
  montarMensagemArquivosAcimaDoLimite
} from '../utils/pendingAttachments';

/*
  A REGRA DO NOME É DO SERVIDOR — a tela só a repete ANTES do envio.

  O vínculo do comprovante com a solicitação é feito no servidor por um
  `SOL-<número>` encontrado no nome do arquivo (ComprovanteController.uploadMassa).
  Arquivo sem esse trecho no nome sobe do mesmo jeito e fica PENDENTE, à espera
  de vínculo manual em "Comprovantes pendentes" — e, até 04/09, a tela dizia
  "Upload realizado com sucesso" sem distinguir os dois desfechos.

  O mesmo padrão está aqui para AVISAR na hora da escolha, não para bloquear:
  quem sabe que vai vincular depois continua enviando. Ele não decide nada —
  quem decide é o servidor.
*/
const PADRAO_CODIGO_SOLICITACAO = /SOL-\d+/i;

export default function UploadComprovantes() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const { avisos, avisar, fechar: fecharAviso } = useAvisos();
  const inputRef = useRef(null);

  const semCodigo = useMemo(
    () => files.filter((item) => !PADRAO_CODIGO_SOLICITACAO.test(item?.nome || '')),
    [files]
  );

  function handleFileChange(event) {
    const { arquivos: proximoEstado, rejeitados } = concatenarAnexosPendentes(files, event.target.files, {
      maxFileSizeMb: UPLOAD_MAX_FILE_SIZE_MB_PADRAO
    });
    setFiles(proximoEstado);
    if (rejeitados.length > 0) {
      avisar.erro(montarMensagemArquivosAcimaDoLimite(rejeitados, UPLOAD_MAX_FILE_SIZE_MB_PADRAO));
    }
    event.target.value = '';
  }

  async function handleUpload(event) {
    event.preventDefault();
    const formulario = event.currentTarget;

    if (!files.length) {
      avisar.erro('Selecione ao menos um arquivo.');
      return;
    }

    try {
      setLoading(true);
      const result = await uploadComprovantes(extrairFilesAnexosPendentes(files));

      /*
        `result.error` chegava por `setMessage` e era pintado com a MESMA cor
        do sucesso: recusa do servidor lida como confirmação. Erro é erro,
        na faixa vermelha do sistema — e nesse caso os arquivos ficam na tela,
        porque não há o que confirmar.
      */
      if (result?.error) {
        avisar.erro(result.error);
        return;
      }

      const pendentes = semCodigo.length;
      if (pendentes > 0) {
        avisar.alerta(
          `${pendentes} de ${files.length} arquivo(s) subiram sem código SOL- no nome e ficaram `
          + 'aguardando vínculo em "Comprovantes pendentes".'
        );
      } else {
        avisar.sucesso(result?.message || 'Upload realizado com sucesso.');
      }

      setFiles([]);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      formulario.reset();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao enviar comprovantes.');
    } finally {
      setLoading(false);
    }
  }

  function removerArquivo(index) {
    setFiles((atual) => atual.filter((_, itemIndex) => itemIndex !== index));
  }

  function limparSelecao() {
    setFiles([]);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  return (
    <Pagina>
      <PageHeader
        /* C3/R11 — tela de registro leva a seta de voltar à esquerda. O
           destino é a fila de conferência: é para lá que o trabalho segue
           depois do envio, e é de lá que se vê o que ficou pendente. */
        voltar={{ to: '/comprovantes/pendentes', title: 'Voltar para comprovantes pendentes' }}
        titulo="Upload de comprovantes"
        contagem={files.length ? `${files.length} arquivo(s) selecionado(s)` : null}
        descricao="Envio em massa de PDFs e imagens; o vínculo com a solicitação vem do nome do arquivo."
      />

      <Avisos avisos={avisos} aoFechar={fecharAviso} />

      {/* B2: o envio é o conteúdo da tela; a explicação da regra é apoio. */}
      <BlocoConteudo
        titulo="Arquivos a enviar"
        variante="primario"
        descricao={`Até ${UPLOAD_MAX_FILE_SIZE_MB_PADRAO} MB por arquivo. Formatos aceitos: PDF, JPG, PNG, HTML e RAR.`}
      >
        <form onSubmit={handleUpload} className="grid gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <label className={`btn btn-outline inline-flex items-center gap-2 cursor-pointer ${loading ? 'opacity-60 pointer-events-none' : ''}`}>
              <HiPaperClip aria-hidden="true" />
              <span>Anexar arquivos</span>
              <input
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.html,.rar"
                className="hidden"
                disabled={loading}
                ref={inputRef}
                onChange={handleFileChange}
              />
            </label>
            <span className="text-sm text-muted">
              {files.length > 0
                ? `${files.length} arquivo(s) selecionado(s)`
                : 'Nenhum arquivo selecionado'}
            </span>
          </div>

          <PendingAttachmentsList
            items={files}
            onRemove={(index) => removerArquivo(index)}
            className="grid gap-2"
          />

          {/*
            Condição derivada do conteúdo, não evento (ver Avisos.jsx): ela
            descreve o que está selecionado AGORA e volta a valer a cada
            escolha; por isso vive no fluxo, ao lado da lista, e não como
            faixa dispensável que sumiria com um clique.
          */}
          {semCodigo.length > 0 && (
            <Alert
              type="warning"
              message={`${semCodigo.length} de ${files.length} arquivo(s) não têm SOL-<número> no nome.`
                + ' Eles sobem, mas ficam em "Comprovantes pendentes" até alguém vincular à solicitação.'}
            />
          )}

          <div className="flex gap-3 flex-wrap">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <HiOutlineCloudArrowUp aria-hidden="true" />
              {loading ? 'Enviando...' : 'Enviar arquivos'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={limparSelecao}
              disabled={loading || files.length === 0}
            >
              Limpar seleção
            </button>
          </div>
        </form>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Como o vínculo é feito"
        variante="secundario"
        descricao="O servidor lê o nome do arquivo para achar a solicitação."
      >
        <p className="app-note">
          Inclua o código da solicitação no nome do arquivo — por exemplo <code>SOL-12.pdf</code>.
          Sem esse trecho, o comprovante é guardado como pendente e aparece em
          &ldquo;Comprovantes pendentes&rdquo; para vínculo manual.
        </p>
      </BlocoConteudo>
    </Pagina>
  );
}
