import { useEffect, useMemo, useState } from 'react';
import {
  ativarPaginaArquivoModelo,
  criarPaginaArquivoModelo,
  desativarPaginaArquivoModelo,
  getAdminsArquivosModelos,
  getContextoArquivosModelos,
  salvarUploadersArquivosModelos
} from '../services/arquivosModelos';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  FormSecao,
  CampoForm,
  Avisos,
  useAvisos
} from '../components/padrao';

// =====================================================================
// ARQUIVOS MODELOS — Configuração
// ---------------------------------------------------------------------
// FORMULÁRIO INLINE — POR QUÊ (R9 revista em 04/09; NÃO mover para modal)
// ---------------------------------------------------------------------
// A R9 mede INTERRUPÇÃO, não frequência: modal é para o cadastro que
// interrompe outro trabalho (cadastrar um credor no meio de uma
// solicitação) e precisa devolver a pessoa ao lugar de onde ela saiu.
// Nesta tela não há trabalho interrompido — ela existe PARA montar as
// páginas de arquivos modelos e dizer quem pode subir arquivo em cada
// uma. Teste da regra: sem o formulário sobra uma lista de páginas que
// ninguém abriria por si só; o formulário é a tela e fica inline.
// Em 04/09 o "Criar nova página" chegou a virar OverlayModal citando a
// versão ANTIGA da R9 ("cadastro raro abre em modal") — critério pelo
// sintoma (raro) em vez da causa (interrompe). A regra foi corrigida e
// isto é a reversão: não devolver para modal.
// =====================================================================

function mapById(lista) {
  return Object.fromEntries((lista || []).map(item => [Number(item.id), item]));
}

export default function ArquivosModelosConfig() {
  const [contexto, setContexto] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [novoNomePagina, setNovoNomePagina] = useState('');
  const [uploadersByPagina, setUploadersByPagina] = useState({});
  const [salvando, setSalvando] = useState(false);
  // R3/R19: as SEIS caixas do navegador desta tela viraram aviso do sistema
  // (faixa dentro da página, com tom semântico e mensurável pelo harness).
  const { avisos, avisar, fechar } = useAvisos();

  const adminsById = useMemo(() => mapById(admins), [admins]);

  async function carregar() {
    const [ctx, listaAdmins] = await Promise.all([
      getContextoArquivosModelos(),
      getAdminsArquivosModelos()
    ]);
    setContexto(ctx);
    setAdmins(Array.isArray(listaAdmins) ? listaAdmins : []);
    setUploadersByPagina(ctx?.uploadersByPagina || {});
  }

  useEffect(() => {
    carregar().catch(error => {
      console.error(error);
      avisar.erro('Erro ao carregar configuração de arquivos modelos');
    });
  }, []);

  async function criarPagina(event) {
    event?.preventDefault();
    try {
      // Sem o aviso, clicar em "Criar" com o campo vazio não fazia nada e
      // não dizia nada — capacidade sem resposta é o mesmo defeito da R15.
      if (!novoNomePagina.trim()) {
        avisar.alerta('Informe o nome da nova página.');
        return;
      }
      await criarPaginaArquivoModelo(novoNomePagina.trim());
      setNovoNomePagina('');
      await carregar();
      avisar.sucesso('Página criada com sucesso.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao criar pagina');
    }
  }

  async function togglePagina(pagina) {
    try {
      if (pagina.ativo) {
        await desativarPaginaArquivoModelo(pagina.codigo);
      } else {
        await ativarPaginaArquivoModelo(pagina.codigo);
      }
      await carregar();
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao alterar status da pagina');
    }
  }

  function toggleAdminPagina(paginaCodigo, userId) {
    setUploadersByPagina(prev => {
      const atual = Array.isArray(prev?.[paginaCodigo]) ? prev[paginaCodigo] : [];
      const existe = atual.includes(userId);
      const proximo = existe ? atual.filter(id => id !== userId) : [...atual, userId];
      return { ...prev, [paginaCodigo]: proximo };
    });
  }

  async function salvarUploaders() {
    try {
      setSalvando(true);
      await salvarUploadersArquivosModelos(uploadersByPagina);
      avisar.sucesso('Permissões de upload salvas com sucesso.');
      await carregar();
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao salvar permissoes');
    } finally {
      setSalvando(false);
    }
  }

  const paginas = contexto?.paginas || [];

  return (
    // C1/R13: a tela não tinha faixa fixa nenhuma — a raiz era um
    // `div.space-y-5` com o título solto. O ritmo vertical (M2/R10) e a
    // posição da faixa (--pos-cabecalho-fixo) vêm do Pagina, não da tela.
    <Pagina>
      {/* R5/C2: apoio e contagem na faixa fixa, nas props do PageHeader —
          não como parágrafo solto sobre o canvas.
          As duas ações da faixa GRAVAM, e essa é a razão de estarem aqui:
          "Criar página" deixou de abrir modal e passou a executar o
          cadastro do bloco logo abaixo (é o gravar do trabalho da tela);
          "Salvar permissões" segue na faixa porque compromete a marcação da
          lista inteira e, no rodapé de um bloco longo, sumia da vista ao
          rolar (R13). Nenhuma das duas é repetida dentro dos blocos: um
          dono por responsabilidade (R16). */}
      <PageHeader
        titulo="Configuração de Arquivos Modelos"
        contagem={contexto ? `${paginas.length} página(s)` : null}
        descricao="Crie páginas, ative/desative e defina quais usuários ADMIN podem fazer upload em cada página."
        acaoPrincipal={{ rotulo: 'Criar página', onClick: criarPagina }}
        secundarias={[{
          rotulo: salvando ? 'Salvando...' : 'Salvar permissões',
          onClick: salvarUploaders,
          desabilitada: salvando
        }]}
      />

      {/* R16: UM dono para a faixa de avisos. Sem modal, o erro de criar, o
          de salvar e o de carga aparecem todos aqui, abaixo do cabeçalho. */}
      <Avisos avisos={avisos} aoFechar={fechar} />

      {/* ARRANJO: formulário ACIMA da lista, ambos em largura cheia — não em
          duas colunas. A lista abaixo é larga por natureza (a grade de
          admins de cada página abre em até três colunas de checkbox), e o
          formulário tem UM campo: em coluna lateral ele deixaria uma faixa
          vazia alta ao lado, e ainda estreitaria a grade de permissões. Uma
          linha de formulário acima custa pouca altura e mantém a lista com
          a largura inteira. */}
      <BlocoConteudo
        titulo="Nova página de arquivos modelos"
        descricao="Informe o nome e use “Criar página”, na faixa do topo, para incluir."
      >
        <form onSubmit={criarPagina}>
          <FormSecao legenda="Identificação" colunas={2}>
            <CampoForm label="Nome da página" obrigatorio span={2}>
              <input
                className="input w-full"
                placeholder="Nome da nova página"
                value={novoNomePagina}
                onChange={e => setNovoNomePagina(e.target.value)}
              />
            </CampoForm>
          </FormSecao>
        </form>
      </BlocoConteudo>

      {/* B2: a listagem é o bloco primário, com barra de cor. As linhas de
          página eram `card` DENTRO de `card` — agora são superfície simples,
          com a borda vinda do token (R25), dentro de um bloco só. */}
      <BlocoConteudo
        titulo="Páginas e permissões de upload"
        variante="primario"
        cor="var(--c-primary)"
      >
        <div className="space-y-4">
          {paginas.map(pagina => {
            const ids = Array.isArray(uploadersByPagina?.[pagina.codigo]) ? uploadersByPagina[pagina.codigo] : [];
            return (
              <div key={pagina.codigo} className="rounded-xl border border-[var(--c-border)] p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-semibold">{pagina.nome}</p>
                    <p className="text-xs" style={{ color: 'var(--c-muted)' }}>Código: {pagina.codigo}</p>
                  </div>
                  <button type="button" className="btn btn-outline" onClick={() => togglePagina(pagina)}>
                    {pagina.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                </div>

                <div className="mt-3">
                  <p className="text-sm font-medium mb-2">Admins com upload permitido</p>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {admins.map(admin => {
                      const checked = ids.includes(Number(admin.id));
                      return (
                        <label
                          key={admin.id}
                          className="flex items-start gap-2 text-sm border border-[var(--c-border)] rounded-lg p-2"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAdminPagina(pagina.codigo, Number(admin.id))}
                          />
                          <span>
                            <strong>{admin.nome}</strong><br />
                            <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
                              {admin.email} · {admin.perfil} · {adminsById[Number(admin.id)]?.setor?.nome || '-'}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </BlocoConteudo>
    </Pagina>
  );
}
