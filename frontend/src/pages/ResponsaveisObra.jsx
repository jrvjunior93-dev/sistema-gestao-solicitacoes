import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Pagina, PageHeader, Avisos, useAvisos } from '../components/padrao';
import ObraAutocomplete from '../components/ui/ObraAutocomplete';
import CrConfiguracoesView from '../modules/custosRecebiveis/components/CrConfiguracoesView';
import { listarCustosRecebiveisObras } from '../modules/custosRecebiveis/services/custosRecebiveis';
import { canManageResponsaveisObra } from '../modules/custosRecebiveis/utils/access';
import '../modules/custosRecebiveis/styles/custos-recebiveis.css';

export default function ResponsaveisObra() {
  const { user } = useAuth();
  const permitido = canManageResponsaveisObra(user);
  const [obras, setObras] = useState([]);
  const [obraId, setObraId] = useState('');
  const { avisos, avisar, fechar } = useAvisos();
  useEffect(() => {
    if (permitido) listarCustosRecebiveisObras().then(r => setObras(r?.items || [])).catch(e => avisar.erro(e.message));
  }, [permitido, avisar]);
  if (!permitido) return <Navigate to="/configuracoes" replace />;
  return <Pagina>
    <PageHeader titulo="Responsáveis por obra" descricao="Cadastro compartilhado por Custos e Recebíveis e pelas transferências de colaboradores." />
    <Avisos avisos={avisos} aoFechar={fechar} />
    <label className="form-field"><span className="form-label">Obra</span>
      <ObraAutocomplete value={obraId} options={obras} onChange={setObraId} />
    </label>
    <p className="form-hint">Vincule o usuário à obra antes de cadastrá-lo como responsável ou substituto. A vigência define quando ele poderá solicitar e aprovar transferências. Alterações aqui também afetam Custos e Recebíveis.</p>
    {obraId ? <CrConfiguracoesView obra={obras.find(o => Number(o.id) === Number(obraId))} /> : <p>Selecione uma obra para configurar seus responsáveis.</p>}
  </Pagina>;
}
