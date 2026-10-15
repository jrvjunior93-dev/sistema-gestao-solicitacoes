import assert from 'node:assert/strict';
import path from 'node:path';

// Modal/confirmacoes reais, transporte em memoria. Backend e coberto por teste transacional.
export async function validarGestaoDp(page, base, modal, output) {
  // Consulta da Obra: cadastro retornado atualizado nao torna o formulario editavel/sujo.
  for (const situacao of ['ABERTA', 'APROVADA', 'CANCELADA']) {
    await page.goto(base); await modal.getByRole('button', { name: 'Fechar', exact: true }).click();
    await page.evaluate(situacao => {
      window.pedido.situacao = situacao;
      window.pedido.dados_json.linhas.forEach(l => Object.assign(l, { cadastro_atualizado: true, pagamento_estado: 'PENDENTE', selecionado: true }));
      window.escritasConsulta = 0;
      window.api = async (_, options = {}) => {
        if (options.method && options.method !== 'GET') { window.escritasConsulta++; throw new Error('Esta solicitacao nao pode ser alterada por este usuario.'); }
        return structuredClone({ solicitacao: window.pedido, pode_conferir: false, pode_enviar_fila: false, responsaveis: [], avisos: [] });
      };
    }, situacao);
    await page.getByRole('button', { name: 'Conferir como DP', exact: true }).click();
    await modal.getByText(`Situação: ${situacao}`, { exact: true }).waitFor();
    assert.equal(await modal.getByText(/Alterações pendentes/).count(), 0);
    await modal.getByRole('button', { name: 'Fechar', exact: true }).click();
    await modal.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.escritasConsulta), 0, 'Abrir/fechar consulta nunca faz PUT/POST');
  }
  async function preparar({ negar = false, pago = false } = {}) {
    await page.goto(base);
    await modal.getByRole('button', { name: 'Fechar', exact: true }).click();
    await page.evaluate(({ negar, pago }) => {
      window.pedido.situacao = 'ABERTA'; window.dp = true;
      window.pedido.dados_json.titulos = pago ? [{ id: 700, codigo: 'TIT-PAGO', tipo: 'SALARIO', colaborador_id: 11, valor: 3000 }] : [];
      window.pedido.dados_json.linhas.forEach(l => { l.pagamento_estado = pago ? 'ENVIADO' : 'PENDENTE'; });
      window.gestaoCalls = []; window.gestaoSaves = []; window.gestaoNegar = negar; window.gestaoPago = pago;
      window.api = async (p, o = {}) => {
        await new Promise(r => setTimeout(r, 100));
        if (o.method === 'PUT') {
          window.gestaoSaves.push(structuredClone(o.data));
          window.pedido.dados_json = { ...structuredClone(o.data), revisao: o.data.revisao + 1 };
        }
        if (p.endsWith('/remover-colaborador') || p.endsWith('/cancelar')) {
          window.gestaoCalls.push({ p, ...o });
          if (window.gestaoPago) throw new Error('Pagamento processado. Estorne antes de cancelar.');
          const d = window.pedido.dados_json;
          if (o.data.revisao !== d.revisao) throw new Error('Revisao obsoleta');
          const todas = p.endsWith('/cancelar');
          d.linhas.forEach(l => { if (todas || l.colaborador_id === o.data.colaborador_id) {
            l.pagamento_estado = 'CANCELADO'; l.selecionado = false;
            if (!todas) Object.assign(l, { removido_em: '2026-10-15T18:00:00Z', motivo_remocao: o.data.motivo });
          } });
          d.revisao++;
          if (todas) window.pedido.situacao = 'CANCELADA';
        }
        return structuredClone({ solicitacao: window.pedido, pode_conferir: true, pode_enviar_fila: true,
          pode_gerenciar_solicitacao: !window.gestaoNegar && window.pedido.situacao !== 'CANCELADA',
          pagamentos_financeiros: window.gestaoPago ? [{ id: 700, status: 'QUITADO', valor_baixado: 3000 }] : [], responsaveis: [], avisos: [] });
      };
    }, { negar, pago });
    await page.getByRole('button', { name: 'Conferir como DP', exact: true }).click();
    await modal.getByText('Situação: ABERTA', { exact: true }).waitFor();
  }
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 }); await preparar();
    await modal.getByRole('button', { name: 'Remover colaborador: Ana QA', exact: true }).click();
    const remover = page.getByRole('dialog', { name: 'Remover colaborador da solicitação', exact: true });
    assert(await remover.getByRole('button', { name: 'Remover colaborador', exact: true }).isDisabled());
    await remover.getByRole('button', { name: 'Voltar', exact: true }).click();
    assert.equal(await page.evaluate(() => window.gestaoCalls.length), 0);
    await modal.getByRole('button', { name: 'Remover colaborador: Ana QA', exact: true }).click();
    await remover.getByLabel('Motivo', { exact: true }).fill('Colaborador incluído por engano');
    await remover.getByRole('button', { name: 'Remover colaborador', exact: true }).evaluate(el => { el.click(); el.click(); });
    await remover.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => window.gestaoCalls.length === 1);
    await modal.getByText('Colaboradores removidos (1)', { exact: true }).waitFor();
    assert.equal(await modal.locator('tbody tr').filter({ hasText: 'Ana QA' }).count(), 0);
    assert.equal(await modal.locator('tbody tr').filter({ hasText: 'Bruno QA' }).count(), 1);
    assert.equal(await page.evaluate(() => window.gestaoCalls[0].data.colaborador_id), 11);
    await modal.getByLabel('Selecionar todos', { exact: true }).check();
    await modal.getByRole('button', { name: 'Salvar', exact: true }).click();
    await page.waitForFunction(() => window.gestaoSaves.length === 1);
    assert.equal(await page.evaluate(() => window.gestaoSaves[0].linhas.length), 2, 'Selecionar todos conserva o snapshot removido no PUT');
    assert(await page.evaluate(() => window.gestaoSaves[0].linhas[0].removido_em));
    await modal.getByRole('button', { name: 'Cancelar solicitação', exact: true }).click();
    const cancelar = page.getByRole('dialog', { name: 'Cancelar solicitação completa', exact: true });
    assert(await cancelar.getByRole('button', { name: 'Cancelar solicitação', exact: true }).isDisabled());
    await cancelar.getByLabel('Motivo', { exact: true }).fill('Pedido inteiro substituído');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(output, `cancelamento-integral-${width}.png`), fullPage: true });
    await cancelar.getByRole('button', { name: 'Cancelar solicitação', exact: true }).evaluate(el => { el.click(); el.click(); });
    await modal.getByText('Situação: CANCELADA', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.gestaoCalls.length), 2);
    assert.equal(await modal.getByRole('button', { name: 'Enviar para a fila', exact: true }).count(), 0);
    assert.equal(await modal.getByRole('button', { name: 'Cancelar solicitação', exact: true }).count(), 0);
    await preparar({ negar: true });
    assert.equal(await modal.getByRole('button', { name: /^Remover colaborador:/ }).count(), 0);
    assert.equal(await modal.getByRole('button', { name: 'Cancelar solicitação', exact: true }).count(), 0);
    await preparar({ pago: true });
    assert.equal(await modal.getByRole('button', { name: 'Remover colaborador: Ana QA', exact: true }).count(), 0);
    await modal.getByRole('button', { name: 'Cancelar solicitação', exact: true }).click();
    const impedida = page.getByRole('dialog', { name: 'Cancelar solicitação completa', exact: true });
    await impedida.getByLabel('Motivo', { exact: true }).fill('Conferência QA');
    await impedida.getByRole('button', { name: 'Cancelar solicitação', exact: true }).click();
    await page.getByText('Pagamento processado. Estorne antes de cancelar.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.pedido.situacao), 'ABERTA');
  }
  console.log('UI gestao DP: motivo, voltar, remocao com historico, cancelar integral, negativa financeira, permissao, mutex e desktop/mobile aprovados.');
}
