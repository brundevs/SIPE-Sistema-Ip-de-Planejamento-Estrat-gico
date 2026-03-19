/**
 * SIPE | Sistema Ipê de Planejamento Estratégico — Dashboard Application Logic
 * Client-side JS for SPA routing, API calls, and UI interactivity.
 */

// ── State ──────────────────────────────────────
let currentPage = 'dashboard';
let currentRdoResults = null;
let searchTimeout = null;

// ── Navigation (SPA) ──────────────────────────
function navigateTo(page) {
  currentPage = page;

  // Hide all sections
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  // Show target
  const el = document.getElementById(`page-${page}`);
  if (el) el.classList.add('active');

  const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');

  // Update topbar
  const titles = {
    dashboard: ['Dashboard', 'Visão geral do sistema'],
    efetivo: ['Gestão de Efetivo', 'Importar planilhas e gerenciar colaboradores'],
    rdo: ['Leitura PTe Cesla', 'Extração de colaboradores MOD em PDFs'],
    moi: ['Liberação de Acessos', 'Gerar texto de liberação para portaria'],
    clima: ['Clima', 'Condições meteorológicas em tempo real'],
    planejamento: ['Planejamento de Obras', 'Dashboard Operacional · Cronograma · Capital Humano · Histórico PTe'],
    'rdo-obra': ['Relatório Diário de Obra', 'Monte o RDO automaticamente com dados do PTe, clima e cronograma'],
  };

  const [title, subtitle] = titles[page] || ['', ''];
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('pageSubtitle').textContent = subtitle;

  // Load page data
  if (page === 'dashboard') loadDashboard();
  if (page === 'efetivo') loadColaboradores();
  if (page === 'clima') loadClima();
  if (page === 'moi') { initAcessoForm(); loadHistoricoLiberacoes(); }
  if (page === 'planejamento') { plan.init(); }
  if (page === 'rdo-obra') { rdoObra.init(); }

  // Push state for back/forward
  history.pushState({ page }, '', `/${page === 'dashboard' ? '' : page}`);
}

// Handle browser back/forward
window.onpopstate = function(e) {
  if (e.state && e.state.page) navigateTo(e.state.page);
};

// ── API Helper ─────────────────────────────────
async function apiCall(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `Erro HTTP ${response.status}`);
    }
    return data;
  } catch (error) {
    console.error(`API Error (${url}):`, error);
    throw error;
  }
}

// ── Toast Notifications ────────────────────────
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${icons[type] || ''}</span>
    <span>${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── Loading Overlay ────────────────────────────
function showLoading(text = 'Processando...') {
  document.getElementById('loadingText').textContent = text;
  document.getElementById('loadingOverlay').classList.add('active');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('active');
}

// ── Modal ──────────────────────────────────────
function showModal(title, bodyHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalBackdrop').classList.add('active');
}

function closeModal() {
  document.getElementById('modalBackdrop').classList.remove('active');
}

// ── Dashboard ──────────────────────────────────
async function loadDashboard() {
  try {
    const data = await apiCall('/api/dashboard/stats');
    document.getElementById('statColabs').textContent = data.total_colaboradores || 0;
    document.getElementById('statProcessamentos').textContent = data.total_processamentos || 0;
    document.getElementById('statVinculos').textContent = data.total_vinculos_confirmados || 0;
    document.getElementById('badgeEfetivo').textContent = data.total_colaboradores || 0;

    if (data.ultimo_processamento) {
      const dt = new Date(data.ultimo_processamento.data_processamento);
      document.getElementById('statUltimo').textContent = dt.toLocaleDateString('pt-BR');
    }
  } catch (e) {
    console.log('Dashboard load error:', e);
  }
}

// ── Efetivo (Colaboradores) ────────────────────

/** Baixa a planilha-modelo de importação gerada pelo backend. */
function baixarModeloEfetivo() {
  const a = document.createElement('a');
  a.href = '/api/efetivo/modelo-padrao';
  a.download = 'modelo_importacao_colaboradores.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast('Modelo baixado — preencha e importe pelo botão de upload.', 'info', 5000);
}

async function handleExcelUpload(input) {
  const file = input.files[0];
  if (!file) return;

  showLoading('Importando planilha Excel...');

  const formData = new FormData();
  formData.append('file', file);

  // Ocultar avisos anteriores
  const avisosEl   = document.getElementById('efetivoAvisos');
  const avisosListEl = document.getElementById('efetivoAvisosList');
  if (avisosEl) avisosEl.style.display = 'none';
  if (avisosListEl) avisosListEl.innerHTML = '';

  try {
    const data = await apiCall('/api/efetivo/upload-excel', {
      method: 'POST',
      body: formData
    });

    hideLoading();

    const errosMsg = data.erros > 0 ? ` (${data.erros} linhas com erro)` : '';
    showToast(
      `Importação concluída! ${data.importados} novos, ${data.atualizados} atualizados. Total: ${data.total_base}${errosMsg}`,
      'success',
      6000
    );
    document.getElementById('badgeEfetivo').textContent = data.total_base;

    // Mostrar avisos de CPF inválido / categoria desconhecida
    if (avisosEl && avisosListEl && Array.isArray(data.avisos) && data.avisos.length > 0) {
      avisosListEl.innerHTML = data.avisos
        .map(av => `<li>${escapeHtml(av)}</li>`)
        .join('');
      avisosEl.style.display = 'block';
    }

    loadColaboradores();
    // Refresh Capital Humano efetivo tab data if it's visible
    const cadEfetEl = document.getElementById('cadTabEfetivo');
    if (cadEfetEl && cadEfetEl.style.display !== 'none') cad.buscar('efet');
  } catch (e) {
    hideLoading();
    showToast(`Erro na importação: ${e.message}`, 'error');
  }

  input.value = '';
}

async function loadColaboradores(busca = '') {
  try {
    const params = new URLSearchParams({ busca, per_page: 100 });
    const data = await apiCall(`/api/efetivo/colaboradores?${params}`);

    document.getElementById('efetivoCountLabel').textContent = `${data.total} colaboradores cadastrados`;
    document.getElementById('badgeEfetivo').textContent = data.total;

    const wrapper = document.getElementById('colabTableWrapper');
    if (data.colaboradores.length === 0) {
      wrapper.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">👥</div>
          <div class="empty-state-title">${busca ? 'Nenhum resultado encontrado' : 'Nenhum colaborador cadastrado'}</div>
          <div class="empty-state-desc">${busca ? 'Tente uma busca diferente.' : 'Importe uma planilha Excel acima para começar.'}</div>
        </div>
      `;
      return;
    }

    wrapper.innerHTML = `
      <div class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>CPF</th>
              <th>Cargo</th>
              <th>Setor</th>
              <th>Categoria</th>
              <th>Importado em</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${data.colaboradores.map(c => `
              <tr>
                <td style="font-weight: 600;">${escapeHtml(c.nome)}</td>
                <td><span style="font-family: 'JetBrains Mono', monospace; font-size: 12px;">${escapeHtml(c.cpf || '—')}</span></td>
                <td>${escapeHtml(c.cargo || '—')}</td>
                <td>${escapeHtml(c.setor || '—')}</td>
                <td>
                  <button class="badge badge-${c.categoria === 'MOI' ? 'blue' : 'success'}" 
                          style="cursor: pointer; border: none; padding: 4px 8px;"
                          onclick="toggleCategoria(${c.id}, '${escapeHtml(c.categoria || 'MOD')}')"
                          title="Clique para alternar MOD/MOI">
                    ${escapeHtml(c.categoria || 'MOD')}
                  </button>
                </td>
                <td style="font-size: 12px; color: var(--text-muted);">${formatDate(c.data_importacao)}</td>
                <td>
                  <button class="btn btn-ghost btn-sm" onclick="deleteColaborador(${c.id}, '${escapeHtml(c.nome)}')" title="Desativar">
                    🗑️
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    console.error('Load colaboradores error:', e);
  }
}

function searchColaboradores() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    const busca = document.getElementById('searchColabs').value;
    loadColaboradores(busca);
  }, 300);
}

async function deleteColaborador(id, nome) {
  if (!confirm(`Deseja desativar o colaborador "${nome}"?`)) return;

  try {
    await apiCall(`/api/efetivo/colaboradores/${id}`, { method: 'DELETE' });
    showToast(`${nome} desativado com sucesso`, 'info');
    loadColaboradores();
  } catch (e) {
    showToast(`Erro: ${e.message}`, 'error');
  }
}

async function toggleCategoria(id, atual) {
  const nova = atual === 'MOI' ? 'MOD' : 'MOI';
  try {
    await apiCall(`/api/efetivo/colaboradores/${id}/categoria`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoria: nova })
    });
    showToast(`Categoria atualizada para ${nova}`, 'success');
    const b = document.getElementById('searchColabs');
    loadColaboradores(b ? b.value : '');
  } catch (e) {
    showToast(`Erro ao atualizar: ${e.message}`, 'error');
  }
}

/** Exporta planilha .xlsx com todos os colaboradores */
function exportarPlanilhaEfetivo() {
  const a = document.createElement('a');
  a.href = '/api/efetivo/exportar';
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast('Exportando planilha...', 'info', 3000);
}

/** Abre modal para adicionar pessoa manualmente */
function abrirFormAdicionarPessoa() {
  showModal('➕ Adicionar Pessoa', `
    <div style="display:flex; flex-direction:column; gap:14px; padding:4px 0;">
      <div>
        <label class="input-label">Nome Completo *</label>
        <input class="input" type="text" id="addNome" placeholder="Nome completo" style="width:100%;" autofocus>
      </div>
      <div>
        <label class="input-label">CPF</label>
        <input class="input" type="text" id="addCpf" placeholder="000.000.000-00" style="width:100%;">
      </div>
      <div>
        <label class="input-label">Empresa</label>
        <input class="input" type="text" id="addEmpresa" placeholder="Nome da empresa" style="width:100%;">
      </div>
      <div>
        <label class="input-label">Cargo</label>
        <input class="input" type="text" id="addCargo" placeholder="Ex: Motorista, Técnico..." style="width:100%;">
      </div>
      <button class="btn btn-primary" onclick="salvarNovaPessoa()" style="width:100%; margin-top:4px;">Salvar</button>
    </div>
  `);
}

async function salvarNovaPessoa() {
  const nome = document.getElementById('addNome')?.value?.trim();
  if (!nome) { showToast('Informe o nome', 'warning'); return; }

  const cpf = document.getElementById('addCpf')?.value?.trim();
  const empresa = document.getElementById('addEmpresa')?.value?.trim();
  const cargo = document.getElementById('addCargo')?.value?.trim();

  try {
    const data = await apiCall('/api/efetivo/adicionar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, cpf, empresa, cargo })
    });
    closeModal();
    const acao = data.acao === 'criado' ? 'adicionado' : 'atualizado';
    showToast(`Colaborador ${acao} com sucesso!`, 'success');
    loadColaboradores(document.getElementById('searchColabs')?.value || '');
  } catch (e) {
    showToast(`Erro: ${e.message}`, 'error');
  }
}

// ── RDO Processing ─────────────────────────────
async function handlePdfUpload(input) {
  const file = input.files[0];
  if (!file) return;

  showLoading('Extraindo e processando RDO...');

  const formData = new FormData();
  formData.append('file', file);

  try {
    const data = await apiCall('/api/rdo/processar', {
      method: 'POST',
      body: formData
    });

    hideLoading();
    currentRdoResults = data.resultado;

    showToast(
      `RDO processado! ${data.resultado.estatisticas.automaticos} automáticos, ${data.resultado.estatisticas.revisao} para revisão`,
      'success',
      6000
    );

    renderRdoResults(data.resultado);
  } catch (e) {
    hideLoading();
    showToast(`Erro ao processar: ${e.message}`, 'error');
  }

  input.value = '';
}

function renderRdoResults(resultado) {
  document.getElementById('rdoResults').style.display = 'block';

  // Stats
  document.getElementById('rdoAutoCount').textContent = resultado.estatisticas.automaticos;
  document.getElementById('rdoReviewCount').textContent = resultado.estatisticas.revisao;
  document.getElementById('rdoNoMatchCount').textContent = resultado.estatisticas.sem_match;

  // Auto matches
  const autoList = document.getElementById('rdoAutoList');
  if (resultado.automaticos.length > 0) {
    autoList.innerHTML = resultado.automaticos.map(m => `
      <div class="match-item">
        <div class="match-names">
          <span style="color: var(--text-muted); font-size: 13px;">${escapeHtml(m.nome_pdf)}</span>
          <span class="match-arrow">→</span>
          <span style="font-weight: 600;">${escapeHtml(m.match || '—')}</span>
        </div>
        <div class="match-score high">${m.score}%</div>
        <span class="badge badge-success">Auto</span>
      </div>
    `).join('');
  } else {
    autoList.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">Nenhum match automático.</div>';
  }

  // Review items
  const reviewList = document.getElementById('rdoReviewList');
  if (resultado.revisao.length > 0) {
    reviewList.innerHTML = resultado.revisao.map((m, i) => `
      <div class="review-card" id="review-${i}">
        <div class="match-info" style="flex: 1;">
          <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 4px;">PDF: <strong>${escapeHtml(m.nome_pdf)}</strong></div>
          <div style="font-size: 14px; font-weight: 600;">Sugestão: ${escapeHtml(m.match || '—')}</div>
          ${m.candidatos ? `
            <div style="margin-top: 6px; font-size: 12px; color: var(--text-muted);">
              Outros: ${m.candidatos.slice(1, 3).map(c => `${escapeHtml(c.nome)} (${c.score}%)`).join(', ')}
            </div>
          ` : ''}
        </div>
        <div class="match-score medium">${m.score}%</div>
        <div class="actions">
          <button class="btn btn-success btn-sm" onclick="confirmVinculo('${escapeHtml(m.nome_pdf)}', ${m.candidatos && m.candidatos[0] ? `'${escapeHtml(m.candidatos[0].nome)}'` : 'null'}, ${m.score}, ${i})">✓</button>
          <button class="btn btn-danger btn-sm" onclick="rejectVinculo(${i})">✗</button>
        </div>
      </div>
    `).join('');
  } else {
    reviewList.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">Nenhum item para revisão.</div>';
  }

  // No match
  const noMatchList = document.getElementById('rdoNoMatchList');
  if (resultado.sem_match.length > 0) {
    noMatchList.innerHTML = resultado.sem_match.map(m => `
      <div class="match-item" style="border-color: rgba(239, 68, 68, 0.15);">
        <div class="match-names">
          <span style="font-weight: 600;">${escapeHtml(m.nome_pdf)}</span>
        </div>
        <div class="match-score low">${m.score}%</div>
        <span class="badge badge-error">Sem Match</span>
      </div>
    `).join('');
  } else {
    noMatchList.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">Todos os nomes foram correspondidos!</div>';
  }
}


async function confirmVinculo(nomePdf, nomeMatch, score, idx) {
  try {
    // Find the colaborador ID by name
    const response = await apiCall(`/api/efetivo/colaboradores?busca=${encodeURIComponent(nomeMatch)}`);
    if (response.colaboradores.length > 0) {
      await apiCall('/api/rdo/confirmar-vinculo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome_pdf: nomePdf,
          colaborador_id: response.colaboradores[0].id,
          score: score,
          confirmar: true
        })
      });
      showToast(`Vínculo confirmado: ${nomePdf} → ${nomeMatch}`, 'success');
      const el = document.getElementById(`review-${idx}`);
      if (el) {
        el.style.opacity = '0.4';
        el.style.pointerEvents = 'none';
      }
    }
  } catch (e) {
    showToast(`Erro: ${e.message}`, 'error');
  }
}

function rejectVinculo(idx) {
  const el = document.getElementById(`review-${idx}`);
  if (el) {
    el.style.opacity = '0.3';
    el.style.pointerEvents = 'none';
  }
  showToast('Vínculo rejeitado', 'info');
}

// ── PTE / Cesla ───────────────────────────────────────
// Resultado acumulado de todos os PDFs desta sessão
let pteAcumulado = {}; // { 'DD/MM/YYYY': [ {nome, cpf, matricula, cargo}, ... ] }
let ptePdfFilenames = []; // stored PDF filenames returned by the server
let ptePermissoesAcumulado = []; // [{numero_pt, descricao}] extraídas dos PDFs

async function handlePteUpload(input) {
  const files = Array.from(input.files);
  if (!files.length) return;

  // Mostrar fila
  const queueEl = document.getElementById('pteUploadQueue');
  const listEl = document.getElementById('pteUploadList');
  queueEl.style.display = 'block';

  for (const file of files) {
    const itemId = 'pte_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const itemEl = document.createElement('div');
    itemEl.id = itemId;
    itemEl.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg-primary);border-radius:8px;border:1px solid var(--border-subtle);font-size:13px;';
    itemEl.innerHTML = `
      <span style="flex:1;font-weight:600;">${escapeHtml(file.name)}</span>
      <span class="badge badge-info" id="${itemId}_status">Aguardando...</span>
    `;
    listEl.appendChild(itemEl);

    const statusEl = document.getElementById(itemId + '_status');
    statusEl.textContent = 'Processando...';
    statusEl.className = 'badge badge-warning';

    const formData = new FormData();
    formData.append('file', file);

    try {
      const respData = await apiCall('/api/pte/processar', { method: 'POST', body: formData });
      
      let totCols = 0;
      if (respData.resultados) {
        for (const res of respData.resultados) {
          const dataDoc = res.data || 'Sem Data';
          const newInicio = res.inicio || '';
          const newFim    = res.fim    || '';

          // Mesclar com chave do mesmo dia (pegar início mais cedo e fim mais tarde)
          const existingKey = Object.keys(pteAcumulado).find(k => k.split('|')[0] === dataDoc);
          let key;
          if (existingKey) {
            const [, existInicio, existFim] = existingKey.split('|');
            const toMins = s => { if (!s) return null; const p = s.trim().split(' '); if (p.length < 2) return null; const t = p[1].split(':'); return +t[0]*60 + +t[1]; };
            const mergedInicio = (toMins(newInicio) !== null && (toMins(existInicio) === null || toMins(newInicio) < toMins(existInicio))) ? newInicio : existInicio;
            const mergedFim    = (toMins(newFim)    !== null && (toMins(existFim)    === null || toMins(newFim)    > toMins(existFim)))    ? newFim    : existFim;
            key = `${dataDoc}|${mergedInicio}|${mergedFim}`;
            if (key !== existingKey) { pteAcumulado[key] = pteAcumulado[existingKey]; delete pteAcumulado[existingKey]; }
          } else {
            key = `${dataDoc}|${newInicio}|${newFim}`;
            pteAcumulado[key] = [];
          }

          for (const colab of (res.colaboradores || [])) {
            const exists = pteAcumulado[key].some(c => c.nome === colab.nome && c.cpf === colab.cpf);
            if (!exists) { pteAcumulado[key].push(colab); totCols++; }
          }

          if (res.pdf_filename) ptePdfFilenames.push(res.pdf_filename);

          // Coletar Permissões de Trabalho
          for (const pt of (res.permissoes || [])) {
            const jaExiste = ptePermissoesAcumulado.some(p => p.numero_pt === pt.numero_pt && p.numero_pt);
            if (!jaExiste) ptePermissoesAcumulado.push(pt);
          }
        }
      }

      statusEl.textContent = `✓ ${totCols} MOD extraídos`;
      statusEl.className = 'badge badge-success';

      // Ordenar por nome dentro de cada data
      Object.keys(pteAcumulado).forEach(dt => {
        pteAcumulado[dt].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      });

      renderPteResults();

    } catch (e) {
      statusEl.textContent = `Erro: ${e.message}`;
      statusEl.className = 'badge badge-error';
    }
  }

  input.value = '';
}

function renderPteResults() {
  const container = document.getElementById('pteGroupsContainer');
  const resultsEl = document.getElementById('pteResults');
  const emptyEl = document.getElementById('pteEmptyState');

  const datas = Object.keys(pteAcumulado).sort();
  if (datas.length === 0) {
    resultsEl.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }

  resultsEl.style.display = 'block';
  emptyEl.style.display = 'none';

  const totalColabs = datas.reduce((acc, dt) => acc + pteAcumulado[dt].length, 0);
  document.getElementById('pteResultsSubtitle').textContent =
    `${totalColabs} colaboradores MOD/MOI em ${datas.length} documento(s)`;

  container.innerHTML = datas.map(dt => {
    const colabs = pteAcumulado[dt];
    const [dataParte, inicioParte, fimParte] = dt.split('|');
    const headerTimes = (inicioParte && fimParte) ? `<span style="font-size:12px; color:var(--text-secondary); margin-left:12px;">⏰ ${inicioParte} até ${fimParte}</span>` : '';

    return `
      <div style="margin-bottom:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding:0 4px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:16px;">📅</span>
            <span style="font-weight:700;font-size:14px;">${escapeHtml(dataParte)}</span>
            ${headerTimes}
            <span class="badge badge-info" style="margin-left:8px;">${colabs.length} pessoas</span>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="copiarCpfsPorData('${escapeHtml(dt)}')" title="Copiar CPFs desta data">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copiar CPFs
          </button>
        </div>
        <div class="table-wrapper">
          <table class="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Nome</th>
                <th>CPF</th>
                <th>Cargo</th>
                <th>Cat.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${colabs.map((c, i) => `
                <tr>
                  <td style="color:var(--text-muted);font-size:12px;">${i + 1}</td>
                  <td style="font-weight:600;">${escapeHtml(c.nome)}</td>
                  <td><span style="font-family:'JetBrains Mono',monospace;font-size:12px;">${escapeHtml(c.cpf || '—')}</span></td>
                  <td style="font-size:13px;">${escapeHtml(c.cargo || '—')}</td>
                  <td><span class="badge badge-${c.categoria === 'MOI' ? 'blue' : 'success'}">${escapeHtml(c.categoria || 'MOD')}</span></td>
                  <td>
                    <button class="btn btn-ghost btn-sm" onclick="removerColabPte('${escapeHtml(dt)}', ${i})" title="Remover dessa lista">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML += `
    <div style="margin-top:20px; text-align:right; border-top:1px solid var(--border-subtle); padding-top:20px;">
      <button class="btn btn-primary btn-lg" onclick="confirmarProcessamentoPte()">✅ Confirmar Processamento</button>
    </div>
  `;
}

function removerColabPte(dt, idx) {
  if (pteAcumulado[dt]) {
    pteAcumulado[dt].splice(idx, 1);
    if (pteAcumulado[dt].length === 0) {
      delete pteAcumulado[dt];
    }
  }
  renderPteResults();
}

async function confirmarProcessamentoPte() {
  if (Object.keys(pteAcumulado).length === 0) {
    showToast('Não há dados para confirmar.', 'warning');
    return;
  }
  showLoading('Salvando no histórico...');
  try {
    await apiCall('/api/pte/confirmar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resultados: pteAcumulado, pdfs: ptePdfFilenames, permissoes: ptePermissoesAcumulado })
    });
    hideLoading();
    showToast('Processamento salvo no histórico!', 'success');
    limparResultadosPTE();
  } catch (e) {
    hideLoading();
    showToast(`Erro ao confirmar: ${e.message}`, 'error');
  }
}

function copiarCpfsPorData(dt) {
  const colabs = pteAcumulado[dt] || [];
  const cpfs = colabs.map(c => c.cpf).filter(Boolean);
  if (!cpfs.length) { showToast('Nenhum CPF disponível para esta data.', 'warning'); return; }
  navigator.clipboard.writeText(cpfs.join('\n'))
    .then(() => showToast(`${cpfs.length} CPFs copiados (${dt})!`, 'success'))
    .catch(() => showToast('Erro ao copiar', 'error'));
}

function copiarTodosCpfs() {
  const datas = Object.keys(pteAcumulado).sort();
  const todosColabs = datas.flatMap(dt => pteAcumulado[dt]);
  const cpfs = todosColabs.map(c => c.cpf).filter(Boolean);
  if (!cpfs.length) { showToast('Nenhum CPF disponível.', 'warning'); return; }
  navigator.clipboard.writeText(cpfs.join('\n'))
    .then(() => showToast(`${cpfs.length} CPFs copiados!`, 'success'))
    .catch(() => showToast('Erro ao copiar', 'error'));
}

function limparResultadosPTE() {
  pteAcumulado = {};
  ptePdfFilenames = [];
  ptePermissoesAcumulado = [];
  document.getElementById('pteGroupsContainer').innerHTML = '';
  document.getElementById('pteResults').style.display = 'none';
  document.getElementById('pteEmptyState').style.display = 'block';
  document.getElementById('pteUploadQueue').style.display = 'none';
  document.getElementById('pteUploadList').innerHTML = '';
  showToast('Resultados limpos.', 'info');
}

// Fechar sugestões de MOI ao clicar fora
document.addEventListener('click', (e) => {
  const sugsEl = document.getElementById('moiSugestoes');
  const inputEl = document.getElementById('moiBuscaBase');
  if (sugsEl && inputEl && !sugsEl.contains(e.target) && e.target !== inputEl) {
    sugsEl.style.display = 'none';
  }
});

// ── Clima ──────────────────────────────────────
let ultimaBuscaClima = null;

async function loadClima(force = false) {
  try {
    const params = force ? '?forcar=true' : '';
    const data = await apiCall(`/api/clima${params}`);
    ultimaBuscaClima = data;

    if (data.atual) {
      document.getElementById('climaCityLabel').textContent = data.cidade || 'Local Desconhecido';
      document.getElementById('climaMainIcon').textContent = data.atual.icone || '🌡️';
      document.getElementById('climaMainTemp').textContent = data.atual.temperatura != null ? Math.round(data.atual.temperatura) : '--';
      document.getElementById('climaMainDesc').textContent = data.atual.descricao || 'Indisponível';
      document.getElementById('climaMainHum').textContent = data.atual.umidade != null ? `${data.atual.umidade}%` : '--%';
      document.getElementById('climaMainWind').textContent = data.atual.vento_velocidade != null ? `${data.atual.vento_velocidade} km/h` : '-- km/h';
      document.getElementById('climaMainPrecip').textContent = data.atual.precipitacao != null ? `${data.atual.precipitacao} mm` : '-- mm';

      // Topbar weather
      document.getElementById('topWeatherIcon').textContent = data.atual.icone || '🌡️';
      document.getElementById('topWeatherTemp').textContent = data.atual.temperatura != null ? `${Math.round(data.atual.temperatura)}°C` : '--°C';
    }

    if (data.atualizado_em) {
        document.getElementById('climaMainTime').textContent = formatDate(data.atualizado_em);
    }

    // Forecast Days Widget
    if (data.dias && data.dias.length > 0) {
      const forecastEl = document.getElementById('climaWeekDays');
      const nomDias = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];
      
      forecastEl.innerHTML = data.dias.map((d, index) => {
        const jsDate = new Date(d.data + 'T12:00:00');
        let diaName = nomDias[jsDate.getDay()];
        const diaNum = jsDate.getDate().toString().padStart(2, '0');
        const mesNum = (jsDate.getMonth() + 1).toString().padStart(2, '0');
        const dataFormatada = `${diaNum}/${mesNum}`;
        
        const max = d.temp_max != null ? Math.round(d.temp_max) : '--';
        const min = d.temp_min != null ? Math.round(d.temp_min) : '--';
        
        return `
          <div class="forecast-day-card ${index === 7 ? 'selected' : ''}" onclick="selectClimaDay(${index})" id="cDay-${index}" style="min-width: 90px; text-align: center; padding: 12px 8px; border-radius: 12px; cursor: pointer; transition: all 0.2s; border: 1px solid ${index === 7 ? 'var(--primary-200)' : 'transparent'}; background: ${index === 7 ? 'rgba(0,197,128,0.05)' : 'transparent'}; flex-shrink: 0;">
            <div style="font-size: 13px; font-weight: 700; color: ${index === 7 ? 'var(--primary-600)' : 'var(--text-secondary)'}; margin-bottom: 2px; text-transform: uppercase;">${diaName}</div>
            <div style="font-size: 11px; font-weight: 500; color: var(--text-muted); margin-bottom: 8px;">${dataFormatada}</div>
            <div style="font-size: 28px; margin-bottom: 8px; line-height: 1;">${d.icone || '🌡️'}</div>
            <div style="display: flex; gap: 4px; justify-content: center; font-size: 13px; font-weight: 600;">
              <span style="color: var(--text-primary);">${max}°</span>
              <span style="color: var(--text-muted);">${min}°</span>
            </div>
            ${d.precipitacao > 0 ? `<div style="font-size: 10px; color: var(--primary-500); font-weight: 700; margin-top: 4px;">${d.precipitacao}mm</div>` : '<div style="height:14px"></div>'}
          </div>
        `;
      }).join('');
      
      // Encontrar hoje (cálculo de fuso local robusto)
      const agora = new Date();
      const hojeStr = agora.getFullYear() + '-' + 
                      String(agora.getMonth() + 1).padStart(2, '0') + '-' + 
                      String(agora.getDate()).padStart(2, '0');
                      
      const indexHoje = data.dias.findIndex(d => d.data === hojeStr);
      selectClimaDay(indexHoje >= 0 ? indexHoje : 7);
      
      // Auto-scroll para o dia selecionado (Hoje)
      setTimeout(() => {
          const activeCard = forecastEl.querySelector('.forecast-day-card.selected');
          if (activeCard) {
             const scrollTarget = activeCard.offsetLeft - (forecastEl.clientWidth / 2) + (activeCard.clientWidth / 2);
             forecastEl.scrollTo({ left: scrollTarget, behavior: 'smooth' });
          }
      }, 100);
      
      // Horizontal Scroll Enhancements (Apenas adicionar 1 única vez)
      if (!forecastEl.dataset.eventsBound) {
          let isDown = false;
          let startX;
          let scrollLeft;
          forecastEl.addEventListener('mousedown', (e) => {
            isDown = true;
            startX = e.pageX - forecastEl.offsetLeft;
            scrollLeft = forecastEl.scrollLeft;
          });
          forecastEl.addEventListener('mouseleave', () => { isDown = false; });
          forecastEl.addEventListener('mouseup', () => { isDown = false; });
          forecastEl.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - forecastEl.offsetLeft;
            forecastEl.scrollLeft = scrollLeft - ((x - startX) * 1.5);
          });
          forecastEl.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                forecastEl.scrollLeft += (e.deltaY * 1.5);
            }
          }, { passive: false });
          
          forecastEl.dataset.eventsBound = "true";
      }
    }

    if (force) showToast('Clima atualizado com sucesso!', 'success');
  } catch (e) {
    console.error('Clima error:', e);
  }
}

function selectClimaDay(index) {
    if (!ultimaBuscaClima || !ultimaBuscaClima.dias || !ultimaBuscaClima.dias[index]) return;
    const dia = ultimaBuscaClima.dias[index];
    
    // Atualiza tab style
    document.querySelectorAll('.forecast-day-card').forEach((el, i) => {
        const isActive = i === index;
        el.classList.toggle('selected', isActive);
        el.style.background = isActive ? 'rgba(0,197,128,0.05)' : 'transparent';
        el.style.border = isActive ? '1px solid var(--primary-200)' : '1px solid transparent';
        el.querySelector('div:first-child').style.color = isActive ? 'var(--primary-600)' : 'var(--text-secondary)';
    });
    
    // Header Data
    const nomDiasLong = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const dtJs = new Date(dia.data + 'T12:00:00');
    const diaNum = dtJs.getDate().toString().padStart(2, '0');
    const mesNum = (dtJs.getMonth() + 1).toString().padStart(2, '0');
    const anoNum = dtJs.getFullYear();
    
    let labelDia = nomDiasLong[dtJs.getDay()];
    const dtz = new Date();
    const hojeLocal = dtz.getFullYear() + '-' + String(dtz.getMonth()+1).padStart(2, '0') + '-' + String(dtz.getDate()).padStart(2, '0');
    if (dia.data === hojeLocal) labelDia = "Hoje, " + labelDia;
    
    document.getElementById('climaDiaSelecionado').textContent = `${labelDia} (${diaNum}/${mesNum}/${anoNum})`;    
    // Turnos
    const manha = dia.manha || { temp: '--', icone: '☁️', chuva: 0, desc: 'Indisponível' };
    const tarde = dia.tarde || { temp: '--', icone: '☁️', chuva: 0, desc: 'Indisponível' };
    const noite = dia.noite || { temp: '--', icone: '☁️', chuva: 0, desc: 'Indisponível' };
    
    document.getElementById('dtManhaIcon').textContent = manha.icone;
    document.getElementById('dtManhaTemp').textContent = manha.temp != null ? `${Math.round(manha.temp)}°` : '--°';
    document.getElementById('dtManhaChuva').innerHTML = manha.chuva > 0 ? `💧 ${manha.chuva}mm` : '&nbsp;';
    document.getElementById('dtManhaDesc').textContent = manha.desc;
    
    document.getElementById('dtTardeIcon').textContent = tarde.icone;
    document.getElementById('dtTardeTemp').textContent = tarde.temp != null ? `${Math.round(tarde.temp)}°` : '--°';
    document.getElementById('dtTardeChuva').innerHTML = tarde.chuva > 0 ? `💧 ${tarde.chuva}mm` : '&nbsp;';
    document.getElementById('dtTardeDesc').textContent = tarde.desc;
    
    document.getElementById('dtNoiteIcon').textContent = noite.icone;
    document.getElementById('dtNoiteTemp').textContent = noite.temp != null ? `${Math.round(noite.temp)}°` : '--°';
    document.getElementById('dtNoiteChuva').innerHTML = noite.chuva > 0 ? `💧 ${noite.chuva}mm` : '&nbsp;';
    document.getElementById('dtNoiteDesc').textContent = noite.desc;
    
    // Stats globais
    document.getElementById('dtTotalPrecip').textContent = dia.precipitacao != null ? `${dia.precipitacao} mm` : '0 mm';
    document.getElementById('dtProbChuva').textContent = dia.prob_chuva != null ? `${dia.prob_chuva}%` : '0%';
    const mx = dia.temp_max != null ? Math.round(dia.temp_max) : '--';
    const mn = dia.temp_min != null ? Math.round(dia.temp_min) : '--';
    document.getElementById('dtTempRange').textContent = `${mn}° / ${mx}°`;
}

async function openClimaSettings() {
    try {
        const conf = await apiCall('/api/clima/config');
        const modalHtml = `
            <div style="position: relative; margin-bottom: 24px;">
                <label style="display: block; font-weight: 600; margin-bottom: 8px;">Pesquisar Cidade</label>
                <div style="display: flex; gap: 8px;">
                    <input type="text" id="cfgSearchInput" class="input" placeholder="Digite o nome da cidade..." style="flex: 1;" onInput="debounceCitySearch(this.value)">
                </div>
                <div id="citySearchResults" style="display: none; position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: var(--bg-card); box-shadow: var(--shadow-xl); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); z-index: 1000; max-height: 200px; overflow-y: auto;">
                </div>
            </div>
            
            <div style="margin-bottom: 20px; padding: 16px; background: rgba(0, 197, 128, 0.05); border-radius: var(--radius-md); border: 1px dashed var(--primary-200);">
                <div style="font-size: 11px; font-weight: 700; color: var(--primary-600); text-transform: uppercase; margin-bottom: 4px;">Localização Selecionada</div>
                <div style="display: flex; gap: 12px; margin-bottom: 8px;">
                    <input type="text" id="cfgCidade" class="input" value="${conf.cidade || ''}" placeholder="Cidade" style="flex: 2; padding: 8px; font-weight: 600; background: transparent; border: none; border-bottom: 2px solid var(--border-default);" readonly>
                    <input type="text" id="cfgEstado" class="input" value="${conf.estado || ''}" placeholder="Estado" style="flex: 1; padding: 8px; font-weight: 600; background: transparent; border: none; border-bottom: 2px solid var(--border-default);" readonly>
                </div>
            </div>
            
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
                <button class="btn btn-primary" onclick="salvarClimaSettings()">Salvar & Buscar</button>
            </div>
        `;
        showModal('Configuração de Localidade', modalHtml);
    } catch (e) {
        showToast('Erro ao carregar configs', 'error');
    }
}

let climaSearchTimeout;
async function debounceCitySearch(query) {
    clearTimeout(climaSearchTimeout);
    const resultBox = document.getElementById('citySearchResults');
    
    if (!query || query.length < 3) {
        resultBox.style.display = 'none';
        return;
    }
    
    climaSearchTimeout = setTimeout(async () => {
        try {
            const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=pt&format=json`;
            const resp = await fetch(url);
            const data = await resp.json();
            
            if (data.results && data.results.length > 0) {
                resultBox.innerHTML = data.results.map(r => {
                    const nome = r.name;
                    const estado = r.admin1 || r.country;
                    return `
                        <div style="padding: 12px 16px; cursor: pointer; border-bottom: 1px solid var(--border-subtle);" onclick="selectCityResult('${nome}', '${estado}')" onmouseover="this.style.background='var(--bg-card-hover)'" onmouseout="this.style.background='transparent'">
                            <strong style="color: var(--text-primary);">${nome}</strong>
                            <span style="color: var(--text-muted); font-size: 12px; margin-left: 8px;">${estado}</span>
                        </div>
                    `;
                }).join('');
                resultBox.style.display = 'block';
            } else {
                resultBox.innerHTML = `<div style="padding: 12px 16px; color: var(--text-muted); font-size: 13px;">Nenhuma cidade encontrada.</div>`;
                resultBox.style.display = 'block';
            }
        } catch(e) {
            console.error(e);
        }
    }, 400);
}

function selectCityResult(cidade, estado) {
    document.getElementById('cfgCidade').value = cidade;
    document.getElementById('cfgEstado').value = estado;
    document.getElementById('citySearchResults').style.display = 'none';
    document.getElementById('cfgSearchInput').value = '';
}

async function salvarClimaSettings() {
    const cidade = document.getElementById('cfgCidade').value;
    const estado = document.getElementById('cfgEstado').value;
    
    const btn = document.querySelector('#modalBody .btn-primary');
    btn.disabled = true;
    btn.textContent = 'Buscando...';
    
    try {
        await apiCall('/api/clima/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cidade, estado })
        });
        closeModal();
        showToast('Local salvo! Atualizando o clima...', 'success');
        loadClima(true);
    } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Salvar & Buscar';
        showToast(e.message, 'error');
    }
}
// ── Histórico ──────────────────────────────────
let histProcessamentos_cache = [];

async function loadHistorico() {
  try {
    const buscaNome = document.getElementById('searchHistorico') ? document.getElementById('searchHistorico').value.trim() : '';
    const qs = buscaNome ? '?busca_nome=' + encodeURIComponent(buscaNome) : '';
    const data = await apiCall('/api/rdo/historico' + qs);
    const container = document.getElementById('historicoContent');
    if (!container) return;

    if (!data.processamentos || data.processamentos.length === 0) {
      const msg = buscaNome ? `Colaborador "${escapeHtml(buscaNome)}" não encontrado em nenhum registro.` : 'Nenhum processamento registrado.';
      container.innerHTML = `<div class="empty-state" style="padding:40px;"><div class="empty-state-icon">📜</div><div class="empty-state-title">${msg}</div></div>`;
      return;
    }

    histProcessamentos_cache = data.processamentos;

    // ── Modo busca de pessoa ──
    if (data.modo_busca_pessoa) {
      container.innerHTML = `
        <div style="padding:12px 16px; background:rgba(99,102,241,0.08); border-bottom:1px solid var(--border-subtle); font-size:13px; color:var(--text-secondary);">
          🔍 Resultados para "<strong>${escapeHtml(data.busca)}</strong>" — encontrado em <strong>${data.processamentos.length}</strong> arquivo(s)
        </div>
        <div class="table-wrapper">
          <table class="table">
            <thead><tr>
              <th>Arquivo / Data PTe</th>
              <th>Início</th>
              <th>Fim</th>
              <th>Colaboradores encontrados</th>
              <th style="width:50px; text-align:center;">Ver</th>
            </tr></thead>
            <tbody>
              ${data.processamentos.map(p => `
                <tr id="hist-row-${p.id}">
                  <td style="font-weight:600;">${escapeHtml(p.nome_arquivo)}</td>
                  <td style="font-family:'JetBrains Mono'; font-size:12px; color:var(--text-muted);">${p.inicio_horario || '—'}</td>
                  <td style="font-family:'JetBrains Mono'; font-size:12px; color:var(--text-muted);">${p.fim_horario || '—'}</td>
                  <td>
                    ${(p.pessoas_encontradas || []).map(pe => `
                      <span style="display:inline-flex; align-items:center; gap:4px; margin:2px; padding:2px 8px; border-radius:12px; font-size:12px; background:rgba(34,197,94,0.1); border:1px solid rgba(34,197,94,0.3);">
                        ${escapeHtml(pe.nome)} <span style="color:var(--text-muted); font-size:10px;">${escapeHtml(pe.categoria||'')} ${escapeHtml(pe.cargo||'')}</span>
                      </span>`).join('')}
                  </td>
                  <td style="text-align:center;">
                    <button title="Ver Detalhes" onclick="viewProcessamento(${p.id})"
                      style="background:none;border:none;cursor:pointer;color:#3b82f6;padding:4px 8px;border-radius:6px;transition:background .2s;"
                      onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='none'">👁️</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
      return;
    }

    // ── Modo lista normal ──
    container.innerHTML = `
      <div class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th>Arquivo / Data PTe</th>
              <th>Início</th>
              <th>Fim</th>
              <th>Total</th>
              <th>Status</th>
              <th style="width:80px;text-align:center;">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${data.processamentos.map(p => `
              <tr id="hist-row-${p.id}">
                <td style="font-weight: 600;">${escapeHtml(p.nome_arquivo)}</td>
                <td style="font-family:'JetBrains Mono'; font-size:12px; color:var(--text-muted);">${p.inicio_horario || '—'}</td>
                <td style="font-family:'JetBrains Mono'; font-size:12px; color:var(--text-muted);">${p.fim_horario || '—'}</td>
                <td style="font-family:'JetBrains Mono'; font-size:13px;">${p.total_nomes_extraidos}</td>
                <td><span class="badge badge-${p.status === 'concluido' || p.status === 'confirmado' ? 'success' : p.status === 'erro' ? 'error' : 'info'}">${p.status}</span></td>
                <td style="text-align:center;white-space:nowrap;">
                  <button title="Ver Detalhes" onclick="viewProcessamento(${p.id})"
                    style="background:none;border:none;cursor:pointer;color:#3b82f6;padding:4px 8px;border-radius:6px;transition:background .2s;"
                    onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='none'">👁️</button>
                  ${(() => { try { const pdfs = JSON.parse(p.pdfs_json||'[]'); return pdfs.length ? `<a href="/api/rdo/historico/${p.id}/pdf/${encodeURIComponent(pdfs[0])}" download title="Baixar PDF" style="background:none;border:none;cursor:pointer;color:#059669;padding:4px 8px;border-radius:6px;transition:background .2s;text-decoration:none;display:inline-block;" onmouseover="this.style.background='#d1fae5'" onmouseout="this.style.background='none'">⬇️</a>` : ''; } catch(_){return '';} })()}
                  <button title="Remover" onclick="deletarProcessamento(${p.id}, '${escapeHtml(p.nome_arquivo).replace(/'/g, "\\'")}')"
                    style="background:none;border:none;cursor:pointer;color:#ef4444;padding:4px 8px;border-radius:6px;transition:background .2s;"
                    onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='none'">🗑️</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (e) {
    console.error('Historico error:', e);
  }
}

let historicoSearchTimer = null;
function onHistoricoSearch() {
  clearTimeout(historicoSearchTimer);
  historicoSearchTimer = setTimeout(() => loadHistorico(), 350);
}

async function deletarProcessamento(id, nome) {
  if (!confirm(`Remover o registro "${nome}" do histórico?\n\nEsta ação não pode ser desfeita.`)) return;
  try {
    await apiCall(`/api/rdo/historico/${id}`, { method: 'DELETE' });
    const row = document.getElementById(`hist-row-${id}`);
    if (row) {
      row.style.transition = 'opacity .3s';
      row.style.opacity = '0';
      setTimeout(() => row.remove(), 310);
    }
    showToast('Registro removido com sucesso.', 'success');
  } catch (e) {
    showToast(e.message || 'Erro ao remover registro.', 'error');
  }
}

function viewProcessamento(idx) {
  const proc = histProcessamentos_cache.find(p => p.id === idx);
  if (!proc || !proc.resultado_json) {
    showToast('Nenhum detalhe salvo para este registro.', 'warning');
    return;
  }

  let pdfs = [];
  try { pdfs = JSON.parse(proc.pdfs_json || '[]'); } catch(_) {}

  let html = '';
  try {
    const json = JSON.parse(proc.resultado_json);
    if (Array.isArray(json)) {
      html = `<pre style="font-size:12px;background:#f4f4f5;padding:10px;border-radius:6px;overflow-x:auto;">${escapeHtml(JSON.stringify(json, null, 2))}</pre>`;
    } else {
      for (const k of Object.keys(json)) {
        const partes = k.split('|');
        const d = partes[0] || '';
        const inicioRaw = (partes[1] || '').trim();
        const fimRaw   = (partes[2] || '').trim();
        const inicioLabel = inicioRaw || '--';
        const fimLabel   = fimRaw   || '--';

        const colabs = json[k];
        const cpfList = colabs.map(c => c.cpf).filter(Boolean);
        const cpfBtnId = `cpfBtn_${k.replace(/[^a-z0-9]/gi,'_')}`;

        html += `
        <div style="margin-bottom:24px;background:#fff;padding:16px;border-radius:8px;border:1px solid var(--border-subtle);">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:12px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:18px;">📅</span>
              <h4 style="margin:0;font-weight:700;color:var(--primary-600);font-size:15px;">${escapeHtml(d)}</h4>
            </div>
            <div style="display:flex;gap:12px;font-size:12px;color:var(--text-secondary);">
              <span>⏰ Início: <strong>${escapeHtml(inicioLabel)}</strong></span>
              <span>Fim: <strong>${escapeHtml(fimLabel)}</strong></span>
            </div>
            ${cpfList.length ? `<button id="${cpfBtnId}" class="btn btn-ghost btn-sm" onclick="copiarCpfsModal(${JSON.stringify(JSON.stringify(cpfList))},'${cpfBtnId}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copiar ${cpfList.length} CPFs
            </button>` : ''}
          </div>
          <div class="table-wrapper">
            <table class="table" style="width:100%;margin:0;">
              <thead><tr><th style="width:40px">#</th><th>Nome</th><th>CPF</th><th>Cargo/Cat.</th></tr></thead>
              <tbody>
                ${colabs.map((c, i) => `
                  <tr>
                    <td style="color:var(--text-muted);font-size:12px;">${i+1}</td>
                    <td style="font-weight:600;">${escapeHtml(c.nome)}</td>
                    <td style="font-family:'JetBrains Mono',monospace;font-size:12px;">${escapeHtml(c.cpf||'—')}</td>
                    <td style="font-size:13px;">${escapeHtml(c.cargo||'—')} <span class="badge badge-${c.categoria==='MOI'?'blue':'success'}" style="margin-left:4px;">${escapeHtml(c.categoria||'')}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
      }
    }
  } catch(e) {
    html = `<p style="color:var(--error-500);">Erro ao processar dados: ${escapeHtml(e.message)}</p>`;
  }

  // PDF download section
  let pdfSection = '';
  if (pdfs.length > 0) {
    pdfSection = `
    <div style="margin-bottom:16px;padding:12px 16px;background:rgba(0,197,128,0.05);border:1px dashed var(--primary-200);border-radius:8px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <span style="font-size:13px;font-weight:600;color:var(--text-secondary);">📎 PDFs originais:</span>
      ${pdfs.map((fname, i) => `
        <a href="/api/rdo/historico/${idx}/pdf/${encodeURIComponent(fname)}"
           download
           class="btn btn-ghost btn-sm"
           style="color:var(--primary-600);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          PDF ${pdfs.length > 1 ? i + 1 : ''}
        </a>
      `).join('')}
    </div>`;
  }

  document.getElementById('histModalBody').innerHTML = pdfSection + html;
  document.getElementById('histModalTitle').textContent = proc.nome_arquivo || 'Detalhes do Processamento';
  document.getElementById('viewHistModal').style.display = 'flex';
}

function copiarCpfsModal(jsonStr, btnId) {
  const cpfs = JSON.parse(jsonStr);
  navigator.clipboard.writeText(cpfs.join('\n')).then(() => {
    const btn = document.getElementById(btnId);
    if (btn) { btn.textContent = '✓ Copiados!'; setTimeout(() => { btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copiar ${cpfs.length} CPFs`; }, 2000); }
    showToast(`${cpfs.length} CPFs copiados!`, 'success');
  }).catch(() => showToast('Erro ao copiar', 'error'));
}


// -- loadLogs removed --



// ══════════════════════════════════════════════════════════════
// LIBERAÇÃO DE ACESSOS
// ══════════════════════════════════════════════════════════════

let _acessoSearchTimer = null;
let _acessoTextoGerado = '';

function initAcessoForm() {
  // Define data padrão como hoje
  const dataEl = document.getElementById('acessoData');
  if (dataEl && !dataEl.value) {
    const hoje = new Date();
    dataEl.value = hoje.toISOString().slice(0, 10);
  }
}

function limparFormAcesso() {
  ['acessoLocal','acessoMotorista','acessoCpf','acessoPlaca','acessoEmpresa','acessoMotivo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const qtd = document.getElementById('acessoQtd');
  if (qtd) qtd.value = '1';
  const manha = document.getElementById('acessoManha');
  if (manha) manha.checked = true;
  const tarde = document.getElementById('acessoTarde');
  if (tarde) tarde.checked = false;
  document.getElementById('acessoSugestoes').style.display = 'none';
  document.getElementById('acessoResultadoCard').style.display = 'none';
  document.getElementById('acessoEmptyState').style.display = 'flex';
  initAcessoForm();
}

async function buscarAcesso(valor) {
  clearTimeout(_acessoSearchTimer);
  const sugs = document.getElementById('acessoSugestoes');
  if (!valor || valor.length < 2) { sugs.style.display = 'none'; return; }

  _acessoSearchTimer = setTimeout(async () => {
    try {
      const data = await apiCall(`/api/acesso/buscar?q=${encodeURIComponent(valor)}`);
      const resultados = data.resultados || [];
      if (!resultados.length) { sugs.style.display = 'none'; return; }

      sugs.innerHTML = '';
      resultados.forEach(r => {
        const badge = r.origem === 'efetivo'
          ? '<span style="font-size:10px; background:rgba(34,197,94,0.15); color:#16a34a; padding:1px 6px; border-radius:10px; margin-left:6px;">Efetivo</span>'
          : '<span style="font-size:10px; background:rgba(59,130,246,0.15); color:#3b82f6; padding:1px 6px; border-radius:10px; margin-left:6px;">Terceiro</span>';
        const sub = [r.cpf ? formatCpf(r.cpf) : '', r.empresa || '', r.placa || ''].filter(Boolean).join(' · ');
        const div = document.createElement('div');
        div.style.cssText = 'padding:10px 14px; cursor:pointer; border-bottom:1px solid var(--border-subtle);';
        div.innerHTML = `<div style="font-size:13px; font-weight:600;">${escapeHtml(r.nome)}${badge}</div>${sub ? `<div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${escapeHtml(sub)}</div>` : ''}`;
        div.onmouseover = () => div.style.background = 'var(--bg-hover)';
        div.onmouseout = () => div.style.background = '';
        div.onclick = () => selecionarSugestaoAcesso(r);
        sugs.appendChild(div);
      });
      sugs.style.display = 'block';
    } catch (_) { sugs.style.display = 'none'; }
  }, 300);
}

function selecionarSugestaoAcesso(r) {
  document.getElementById('acessoMotorista').value = r.nome || '';
  document.getElementById('acessoCpf').value = r.cpf ? formatCpf(r.cpf) : '';
  document.getElementById('acessoPlaca').value = r.placa || '';
  document.getElementById('acessoEmpresa').value = r.origem === 'efetivo' ? 'IPÊ' : (r.empresa || '');
  if (r.local) document.getElementById('acessoLocal').value = r.local;
  if (r.motivo) document.getElementById('acessoMotivo').value = r.motivo;
  document.getElementById('acessoSugestoes').style.display = 'none';
}

function formatCpf(cpf) {
  if (!cpf || cpf.length !== 11) return cpf || '';
  return `${cpf.slice(0,3)}.${cpf.slice(3,6)}.${cpf.slice(6,9)}-${cpf.slice(9)}`;
}

async function gerarTextoLiberacao() {
  const local = document.getElementById('acessoLocal').value.trim();
  const data = document.getElementById('acessoData').value;
  const motorista = document.getElementById('acessoMotorista').value.trim();
  const cpfRaw = document.getElementById('acessoCpf').value.trim().replace(/\D/g, '');
  const cpf = cpfRaw.length === 11 ? formatCpf(cpfRaw) : document.getElementById('acessoCpf').value.trim();
  const placa = document.getElementById('acessoPlaca').value.trim().toUpperCase();
  const empresa = document.getElementById('acessoEmpresa').value.trim();
  const manha = document.getElementById('acessoManha').checked;
  const tarde = document.getElementById('acessoTarde').checked;
  const qtd = document.getElementById('acessoQtd').value || '1';
  const motivo = document.getElementById('acessoMotivo').value.trim();

  if (!local) { showToast('Informe o local', 'warning'); return; }
  if (!motorista) { showToast('Informe o motorista', 'warning'); return; }
  if (!motivo) { showToast('Informe o motivo', 'warning'); return; }

  const periodoManha = manha ? '(X)' : '( )';
  const periodoTarde = tarde ? '(X)' : '( )';
  const qtdFmt = String(parseInt(qtd) || 1).padStart(2, '0');
  const dataFmt = data ? new Date(data + 'T12:00:00').toLocaleDateString('pt-BR') : '--/--/----';

  const linhas = [
    'LIBERAÇÃO DE VEÍCULOS:',
    '',
    `Local: ${local}`,
    `Data da liberação: ${dataFmt}`,
    `Motorista: ${motorista}`,
  ];
  if (cpf) linhas.push(`CPF: ${cpf}`);
  if (placa) linhas.push(`Placa do Veículo: ${placa}`);
  if (empresa) linhas.push(`Empresa: ${empresa}`);
  linhas.push(
    `Período da Liberação: Manhã ${periodoManha} / Tarde ${periodoTarde}`,
    `Quantidades de liberações do mesmo veículo para o período: ${qtdFmt}`,
    `Motivo do acesso: ${motivo}`
  );
  _acessoTextoGerado = linhas.join('\n');

  document.getElementById('acessoTexto').textContent = _acessoTextoGerado;
  document.getElementById('acessoResultadoCard').style.display = 'block';
  document.getElementById('acessoEmptyState').style.display = 'none';

  // Registra no backend (auto-salva terceiros e histórico de liberações)
  const cpfLimpo = cpfRaw;
  const periodoStr = manha && tarde ? 'Manhã e Tarde' : manha ? 'Manhã' : tarde ? 'Tarde' : '';
  const geradoPor = document.getElementById('acessoGeradoPor')?.value?.trim() || '';
  try {
    await apiCall('/api/acesso/liberar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        local, data, motorista, cpf: cpfLimpo, placa, empresa, periodo: periodoStr,
        quantidade: qtd, motivo,
        texto_gerado: _acessoTextoGerado,
        gerado_por: geradoPor,
        data_acesso: data,
      })
    });
    loadHistoricoLiberacoes();
  } catch (_) { /* não bloquear geração do texto */ }
}

function copiarTextoLiberacao() {
  if (!_acessoTextoGerado) return;
  navigator.clipboard.writeText(_acessoTextoGerado).then(() => {
    showToast('Texto copiado!', 'success');
  }).catch(() => showToast('Erro ao copiar', 'error'));
}

function enviarWhatsApp() {
  if (!_acessoTextoGerado) return;
  const url = `https://wa.me/?text=${encodeURIComponent(_acessoTextoGerado)}`;
  window.open(url, '_blank');
}

// Fecha sugestões ao clicar fora
document.addEventListener('click', (e) => {
  const sugs = document.getElementById('acessoSugestoes');
  if (sugs && !sugs.contains(e.target) && e.target.id !== 'acessoMotorista') {
    sugs.style.display = 'none';
  }
});


// ══════════════════════════════════════════════════════════════
// HISTÓRICO DE LIBERAÇÕES
// ══════════════════════════════════════════════════════════════

async function loadHistoricoLiberacoes() {
  try {
    const data = await apiCall('/api/acesso/historico-liberacoes');
    const el = document.getElementById('liberacoesHistoricoContent');
    if (!el) return;
    const items = data.liberacoes || [];
    if (!items.length) {
      el.innerHTML = '<div class="empty-state" style="padding:28px;"><div class="empty-state-icon">📋</div><div class="empty-state-title">Nenhuma liberação registrada ainda</div></div>';
      return;
    }
    const fmtDate = s => { if (!s) return '—'; try { const d = new Date(s); return d.toLocaleDateString('pt-BR'); } catch(_) { return s; } };
    el.innerHTML = `<div class="table-wrapper"><table class="table">
      <thead><tr>
        <th>Data Acesso</th><th>Pessoa</th><th>Empresa</th><th>Placa</th>
        <th>Período</th><th>Gerado por</th><th>Gerado em</th>
        <th style="width:70px; text-align:center;">Ações</th>
      </tr></thead>
      <tbody>${items.map(l => `
        <tr>
          <td style="font-family:'JetBrains Mono'; font-size:12px;">${l.data_acesso || '—'}</td>
          <td style="font-weight:600;">${escapeHtml(l.motorista)}</td>
          <td style="font-size:12px;">${escapeHtml(l.empresa||'—')}</td>
          <td style="font-family:'JetBrains Mono'; font-size:12px;">${escapeHtml(l.placa||'—')}</td>
          <td style="font-size:12px;">${escapeHtml(l.periodo||'—')}</td>
          <td style="font-size:12px; color:var(--text-muted);">${escapeHtml(l.gerado_por||'—')}</td>
          <td style="font-size:11px; color:var(--text-muted);">${fmtDate(l.data_geracao)}</td>
          <td style="text-align:center; white-space:nowrap;">
            <button title="Ver texto" onclick="_verTextoLiberacao(${l.id})"
              style="background:none;border:none;cursor:pointer;color:#3b82f6;padding:4px 7px;border-radius:5px;"
              onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='none'">👁️</button>
            <button title="Remover" onclick="_deletarLiberacao(${l.id})"
              style="background:none;border:none;cursor:pointer;color:#ef4444;padding:4px 7px;border-radius:5px;"
              onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='none'">🗑️</button>
          </td>
        </tr>`).join('')}
      </tbody></table></div>`;
    // Cache for modal viewing
    window._liberacoesCache = items;
  } catch(e) { console.error('Erro historico liberacoes:', e); }
}

window._verTextoLiberacao = (id) => {
  const item = (window._liberacoesCache || []).find(l => l.id === id);
  if (!item) return;
  showModal('📋 Texto da Liberação', `
    <div style="display:flex; flex-direction:column; gap:10px;">
      <div style="font-size:12px; color:var(--text-muted);">
        ${escapeHtml(item.motorista)} · ${item.data_acesso || ''} · Gerado por ${escapeHtml(item.gerado_por||'?')}
      </div>
      <pre style="white-space:pre-wrap; font-family:'JetBrains Mono',monospace; font-size:13px; background:var(--bg-surface); padding:14px; border-radius:8px; border:1px solid var(--border-subtle);">${escapeHtml(item.texto_gerado)}</pre>
      <button class="btn btn-primary btn-sm" onclick="navigator.clipboard.writeText(${JSON.stringify(item.texto_gerado)}).then(()=>showToast('Copiado!','success',1500))">📋 Copiar</button>
    </div>`);
};

window._deletarLiberacao = async (id) => {
  if (!confirm('Remover este registro do histórico?')) return;
  try {
    await apiCall(`/api/acesso/historico-liberacoes/${id}`, { method: 'DELETE' });
    showToast('Removido.', 'success', 2000);
    loadHistoricoLiberacoes();
  } catch(e) { showToast(`Erro: ${e.message}`, 'error'); }
};


// ══════════════════════════════════════════════════════════════
// MOI — Gestão de Mão de Obra Indireta (mantido para compatibilidade)
// ══════════════════════════════════════════════════════════════

const moiState = {
  lista: [],       // [{nome, cpf, matricula, cargo, origem}]
  _baseCache: [],  // cache de colaboradores da base para autocomplete
};

/** Carrega o cache da base de colaboradores para autocomplete MOI. */
async function _carregarBaseMoi() {
  if (moiState._baseCache.length) return;
  try {
    const data = await apiCall('/api/efetivo/colaboradores?per_page=2000');
    moiState._baseCache = data.colaboradores || [];
  } catch (_) {}
}

/** Adiciona um colaborador MOI digitado manualmente. */
function adicionarMoiManual() {
  const input = document.getElementById('moiNomeManual');
  const nome  = input.value.trim();
  if (!nome) { showToast('Digite um nome válido.', 'warning'); return; }

  const jaExiste = moiState.lista.some(m => m.nome.toLowerCase() === nome.toLowerCase());
  if (jaExiste) { showToast('Colaborador já está na lista MOI.', 'warning'); return; }

  moiState.lista.push({ nome, cpf: '', matricula: '', cargo: '', origem: 'Manual' });
  input.value = '';
  renderMoiTable();
  showToast(`${nome} adicionado ao MOI.`, 'success');
}

/** Filtra colaboradores da base enquanto o usuário digita. */
async function buscarParaMoi(valor) {
  await _carregarBaseMoi();
  const sugestoes = document.getElementById('moiSugestoes');
  const q = valor.toLowerCase().trim();

  if (!q) { sugestoes.style.display = 'none'; return; }

  const filtrados = moiState._baseCache
    .filter(c => c.nome.toLowerCase().includes(q))
    .slice(0, 10);

  if (!filtrados.length) { sugestoes.style.display = 'none'; return; }

  sugestoes.style.display = 'block';
  sugestoes.innerHTML = filtrados.map(c => `
    <div style="padding:10px 14px; cursor:pointer; border-bottom:1px solid var(--border-subtle);
                font-size:13px; transition:background 0.15s;"
      onmouseover="this.style.background='var(--bg-hover)'"
      onmouseout="this.style.background=''"
      onclick="selecionarMoiDaBase(${JSON.stringify(JSON.stringify(c))})">
      <div style="font-weight:600;">${escapeHtml(c.nome)}</div>
      <div style="font-size:11px; color:var(--text-muted);">${c.cpf || ''} ${c.cargo ? '· ' + c.cargo : ''}</div>
    </div>
  `).join('');
}

/** Seleciona um colaborador da base e adiciona ao MOI. */
function selecionarMoiDaBase(jsonStr) {
  const c = JSON.parse(jsonStr);
  document.getElementById('moiSugestoes').style.display = 'none';
  document.getElementById('moiBuscaBase').value = '';

  const jaExiste = moiState.lista.some(m => m.nome.toLowerCase() === c.nome.toLowerCase());
  if (jaExiste) { showToast('Colaborador já está na lista MOI.', 'warning'); return; }

  moiState.lista.push({ nome: c.nome, cpf: c.cpf || '', matricula: c.matricula || '', cargo: c.cargo || '', origem: 'Base' });
  renderMoiTable();
  showToast(`${c.nome} adicionado ao MOI (da base).`, 'success');
}

/** Seleciona o primeiro item das sugestões. */
function selecionarPrimeiroMoi() {
  const primeiro = document.querySelector('#moiSugestoes div');
  if (primeiro) {
    primeiro.click();
  } else {
    adicionarMoiManual();
  }
}

/** Remove um colaborador do MOI pelo índice. */
function removerMoi(idx) {
  moiState.lista.splice(idx, 1);
  renderMoiTable();
}

/** Copia os CPFs da lista MOI para a área de transferência. */
function copiarCpfsMoi() {
  const cpfs = moiState.lista.filter(m => m.cpf).map(m => m.cpf);
  if (!cpfs.length) { showToast('Nenhum CPF disponível na lista MOI.', 'warning'); return; }
  navigator.clipboard.writeText(cpfs.join('\n')).then(() => {
    showToast(`✅ ${cpfs.length} CPF(s) MOI copiado(s)!`, 'success');
  }).catch(() => showToast('Falha ao copiar.', 'error'));
}

/** Limpa toda a lista MOI. */
function limparMoi() {
  moiState.lista = [];
  renderMoiTable();
  showToast('Lista MOI limpa.', 'info');
}

/** Renderiza a tabela de MOI. */
function renderMoiTable() {
  const tbody     = document.getElementById('moiTbody');
  const wrapper   = document.getElementById('moiTableWrapper');
  const emptyEl   = document.getElementById('moiEmptyState');

  if (!moiState.lista.length) {
    wrapper.style.display   = 'none';
    emptyEl.style.display   = 'block';
    return;
  }

  wrapper.style.display   = 'block';
  emptyEl.style.display   = 'none';

  tbody.innerHTML = moiState.lista.map((m, i) => `
    <tr>
      <td style="font-family:'JetBrains Mono'; font-size:12px; color:var(--text-muted);">${i + 1}</td>
      <td style="font-weight:600;">${escapeHtml(m.nome)}</td>
      <td style="font-family:'JetBrains Mono'; font-size:12px;">${escapeHtml(m.cpf) || '<span style="color:var(--text-muted);">—</span>'}</td>
      <td style="font-family:'JetBrains Mono'; font-size:12px;">${escapeHtml(m.matricula) || '<span style="color:var(--text-muted);">—</span>'}</td>
      <td style="font-size:12px; color:var(--text-secondary);">${escapeHtml(m.cargo) || '—'}</td>
      <td>
        <span class="badge badge-${m.origem === 'Base' ? 'success' : 'info'}" style="font-size:10px;">
          ${m.origem}
        </span>
      </td>
      <td>
        <button class="btn btn-ghost btn-sm" style="color:var(--error-500); padding:4px 8px;"
          onclick="removerMoi(${i})" title="Remover">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/>
          </svg>
        </button>
      </td>
    </tr>
  `).join('');
}

// ── Utilities ──────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const dt = new Date(iso);
    return dt.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

// ── Drag & Drop Enhancement ────────────────────
document.querySelectorAll('.upload-zone').forEach(zone => {
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => {
    zone.classList.remove('dragover');
  });
  zone.addEventListener('drop', (e) => {
    zone.classList.remove('dragover');
  });
});

// ── Init ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
  loadClima();

  // Auto-update weather every 30 minutes
  setInterval(() => loadClima(), 30 * 60 * 1000);
});

// ══════════════════════════════════════════════════════════════
// PLANEJAMENTO DE OBRAS — Project Mirror
// ══════════════════════════════════════════════════════════════

const plan = (() => {
  let _pid = null;       // projeto selecionado
  let _tarefas = [];     // todas as tarefas do projeto
  let _filtro = 'tudo';
  let _tabAtiva = 'gantt';
  let _secaoAtiva = 'dashboard-op';
  let _charts = {};      // Chart.js instances

  // ── Navegação ──────────────────────────────
  async function init() {
    secao(_secaoAtiva);
    await _carregarProjetos();
    _atualizarFiltroLabels();
    _carregarDashboardOp();
  }

  function secao(nome) {
    _secaoAtiva = nome;
    document.querySelectorAll('.plan-secao').forEach(b => b.classList.toggle('active', b.dataset.secao === nome));
    const map = { 'dashboard-op': 'planSecDashboard', 'cronograma': 'planSecCronograma', 'capital': 'planSecCapital', 'historico-pte': 'planSecHistorico' };
    Object.entries(map).forEach(([k, id]) => {
      const el = document.getElementById(id);
      if (el) el.style.display = (k === nome ? '' : 'none');
    });
    if (nome === 'historico-pte') loadHistorico();
    if (nome === 'capital') cad.init();
    if (nome === 'dashboard-op') { _carregarDashboardOp(); }
  }

  function tab(nome) {
    _tabAtiva = nome;
    document.querySelectorAll('.plan-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === nome));
    ['gantt','curvas','histograma','lista','editor'].forEach(t => {
      const el = document.getElementById(`planTab${t.charAt(0).toUpperCase()+t.slice(1)}`);
      if (el) el.style.display = (t === nome ? '' : 'none');
    });
    if (!_pid) return;
    if (nome === 'gantt') _renderGantt(_filtrarTarefas());
    if (nome === 'curvas') _renderCurvaS();
    if (nome === 'histograma') _renderHistograma();
    if (nome === 'lista') _renderLista(_filtrarTarefas());
    if (nome === 'editor') _iniciarEditor();
  }

  function _atualizarFiltroLabels() {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const diasParaSeg = hoje.getDay() === 0 ? 6 : hoje.getDay() - 1;
    const segAtual = new Date(hoje); segAtual.setDate(hoje.getDate() - diasParaSeg);

    const _isoWeek = (d) => {
      const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const dayNum = dt.getUTCDay() || 7;
      dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
      return Math.ceil((((dt - yearStart) / 86400000) + 1) / 7);
    };

    const _fmtRange = (mon, offset) => {
      const s = new Date(mon); s.setDate(s.getDate() + offset * 7);
      const e = new Date(s); e.setDate(s.getDate() + 6);
      const fmt = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
      const sem = _isoWeek(s);
      return { label: `${fmt(s)}-${fmt(e)}`, week: sem, mon: s };
    };

    const offsets = { 's-1': -1, 's0': 0, 's1': 1, 's2': 2 };
    const names   = { 's-1': 'S-1', 's0': 'S+0', 's1': 'S+1', 's2': 'S+2' };
    Object.entries(offsets).forEach(([key, off]) => {
      const btn = document.querySelector(`.plan-filtro[data-f="${key}"]`);
      if (!btn) return;
      const { label, week } = _fmtRange(segAtual, off);
      btn.innerHTML = `${names[key]}<br><span style="font-size:9px; font-weight:400; opacity:0.85;">${label} · Sem ${week}</span>`;
      btn.style.minWidth = '68px';
      btn.style.lineHeight = '1.3';
      btn.style.padding = '5px 10px';
    });
  }

  function _semanaInfo(offset) {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const diasParaSeg = hoje.getDay() === 0 ? 6 : hoje.getDay() - 1;
    const seg = new Date(hoje); seg.setDate(hoje.getDate() - diasParaSeg + offset * 7);
    const dom = new Date(seg); dom.setDate(seg.getDate() + 6);
    const fmt = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
    const dt = new Date(Date.UTC(seg.getFullYear(), seg.getMonth(), seg.getDate()));
    const dayNum = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
    const numSem = Math.ceil((((dt - yearStart) / 86400000) + 1) / 7);
    return { seg, dom, label: `${fmt(seg)}-${fmt(dom)}`, semNum: numSem };
  }

  async function _carregarDashboardOp() {
    try {
      const data = await apiCall('/api/dashboard/stats');
      document.getElementById('dopEfetivoTotal').textContent = data.total_colaboradores || '—';
      document.getElementById('dopMOD').textContent = data.total_mod || '—';
      document.getElementById('dopMOI').textContent = data.total_moi || '—';
      if (data.ultimo_processamento) {
        document.getElementById('dopUltimoPte').textContent = data.ultimo_processamento.nome_arquivo || '—';
      }
    } catch(e) { /* silencioso */ }
    // If a project is selected, refresh the inline executive report
    if (_pid) carregarRelatorioExecutivoInline(_pid);
  }

  async function _carregarCurvaSTable(pid) {
    const wrapper = document.getElementById('curvaSTableWrapper');
    if (!pid || !wrapper) return;
    _pid = pid;
    // Sync selectors
    ['planProjetoSelect', 'dopProjetoSelect'].forEach(id => {
      const s = document.getElementById(id); if (s) s.value = pid;
    });
    const btnRelExec = document.getElementById('btnRelatorioExec');
    if (btnRelExec) btnRelExec.disabled = false;
    wrapper.innerHTML = '<div style="padding:20px; color:var(--text-muted); font-size:13px;">Carregando...</div>';
    try {
      const d = await apiCall(`/api/projetos/${pid}/curva-s-semanal`);
      const semanas = d.semanas || [];
      if (!semanas.length) {
        wrapper.innerHTML = '<div class="empty-state" style="padding:30px;"><div class="empty-state-title">Sem dados de cronograma</div></div>';
        return;
      }
      const fmt = iso => { const dt = new Date(iso+'T12:00:00'); return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`; };
      const fmtPct = v => v !== null && v !== undefined ? v.toFixed(2) + '%' : '—';
      const rows = semanas.map(s => {
        const desvioColor = s.desvio_ac === null ? '' : s.desvio_ac >= 0 ? 'color:#16a34a; font-weight:600;' : 'color:#dc2626; font-weight:600;';
        return `<tr>
          <td style="text-align:center; font-weight:600;">${s.semana}</td>
          <td style="white-space:nowrap;">${fmt(s.seg)} – ${fmt(s.dom)}</td>
          <td style="text-align:right;">${fmtPct(s.previsto_sem)}</td>
          <td style="text-align:right; font-weight:600;">${fmtPct(s.previsto_ac)}</td>
          <td style="text-align:right;">${s.real_sem !== null ? fmtPct(s.real_sem) : '—'}</td>
          <td style="text-align:right; font-weight:600;">${s.real_ac !== null ? fmtPct(s.real_ac) : '—'}</td>
          <td style="text-align:right; ${desvioColor}">${s.desvio_ac !== null ? (s.desvio_ac >= 0 ? '+' : '') + s.desvio_ac.toFixed(2) + '%' : '—'}</td>
        </tr>`;
      }).join('');
      wrapper.innerHTML = `<div style="overflow-x:auto;">
        <table class="data-table" style="width:100%; font-size:13px;">
          <thead><tr>
            <th style="text-align:center;">Semana</th>
            <th>Período</th>
            <th style="text-align:right;">Prev. Sem.%</th>
            <th style="text-align:right;">Prev. Ac.%</th>
            <th style="text-align:right;">Real Sem.%</th>
            <th style="text-align:right;">Real Ac.%</th>
            <th style="text-align:right;">Desvio Ac.%</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    } catch(e) { wrapper.innerHTML = '<div style="padding:20px; color:var(--error-500);">Erro ao carregar dados.</div>'; }
  }

  function filtrar(f) {
    _filtro = f;
    document.querySelectorAll('.plan-filtro').forEach(b => b.classList.toggle('active', b.dataset.f === f));
    if (_tabAtiva === 'gantt') _renderGantt(_filtrarTarefas());
    else if (_tabAtiva === 'lista') _renderLista(_filtrarTarefas());
  }

  function _filtrarTarefas() {
    if (_filtro === 'tudo') return _tarefas;
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const seg = d => { const r = new Date(hoje); r.setDate(r.getDate() - r.getDay() + 1 + d*7); return r; };
    const ini = {
      's-1': seg(-1), 's0': seg(0), 's1': seg(1), 's2': seg(2)
    }[_filtro];
    const fim = new Date(ini); fim.setDate(fim.getDate() + 6);
    return _tarefas.filter(t => {
      const d1 = t.inicio_previsto ? new Date(t.inicio_previsto) : null;
      const d2 = t.fim_previsto ? new Date(t.fim_previsto) : null;
      const d3 = t.inicio_real ? new Date(t.inicio_real) : null;
      if (!d1 && !d3) return false;
      const start = d3 || d1;
      const end = d2 || start;
      return start <= fim && end >= ini;
    });
  }

  // ── Projetos ───────────────────────────────
  async function _carregarProjetos() {
    try {
      const data = await apiCall('/api/projetos');
      const projetos = data.projetos || [];
      // Populate all project selectors
      ['planProjetoSelect', 'dopProjetoSelect', 'rdoProjetoSelect'].forEach(selId => {
        const sel = document.getElementById(selId);
        if (!sel) return;
        const prev = sel.value;
        const defaultLabel = selId === 'rdoProjetoSelect' ? '— Sem projeto vinculado —' : '— Selecionar Projeto —';
        sel.innerHTML = `<option value="">${defaultLabel}</option>`;
        projetos.forEach(p => {
          const o = document.createElement('option');
          o.value = p.id; o.textContent = p.nome;
          if (String(p.id) === String(prev)) o.selected = true;
          sel.appendChild(o);
        });
      });
    } catch(e) { /* silencioso */ }
  }

  async function carregarRelatorioExecutivoInline(pid) {
    const container = document.getElementById('execInlineContainer');
    if (!container) return;
    const btnRelExec = document.getElementById('btnRelatorioExec');
    if (btnRelExec) btnRelExec.disabled = !pid;
    if (!pid) {
      container.innerHTML = `<div class="empty-state" style="padding:60px 40px;"><div class="empty-state-icon">📊</div><div class="empty-state-title">Selecione um projeto acima</div><div class="empty-state-desc">O Relatório Executivo completo será exibido aqui automaticamente.</div></div>`;
      return;
    }

    // Sync pid so relatorioExecutivo() still works
    _pid = pid;
    ['planProjetoSelect', 'dopProjetoSelect'].forEach(id => {
      const s = document.getElementById(id); if (s) s.value = pid;
    });

    // Load tarefas and S-curve
    container.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-muted);">⏳ Carregando relatório executivo...</div>';
    try {
      const [projData, csData] = await Promise.all([
        apiCall(`/api/projetos/${pid}`),
        apiCall(`/api/projetos/${pid}/curva-s-semanal`),
      ]);
      _tarefas = projData.tarefas || [];
      const semanas = csData.semanas || [];

      // Compute project metrics
      const tarefasAtivas = _tarefas.filter(t => t.inicio_previsto && t.fim_previsto && (t.nivel||0) >= 1);
      const iniPrev = tarefasAtivas.length ? tarefasAtivas.reduce((a,b) => a.inicio_previsto < b.inicio_previsto ? a : b).inicio_previsto : '';
      const fimPrev = tarefasAtivas.length ? tarefasAtivas.reduce((a,b) => a.fim_previsto > b.fim_previsto ? a : b).fim_previsto : '';
      const pesoTot = tarefasAtivas.reduce((s,t) => s + (t.peso||1), 0);
      const avancoReal = pesoTot > 0 ? tarefasAtivas.reduce((s,t) => s + (t.peso||1)*(t.progresso||0)/100, 0)/pesoTot*100 : 0;
      const concluidas = tarefasAtivas.filter(t => (t.progresso||0) >= 100).length;
      const emAndamento = tarefasAtivas.filter(t => (t.progresso||0) > 0 && (t.progresso||0) < 100).length;

      const hoje = new Date(); hoje.setHours(0,0,0,0);
      const _getMon = off => { const d = new Date(hoje); d.setDate(d.getDate() - d.getDay() + 1 + off*7); return d; };
      const _getSun = off => { const d = _getMon(off); d.setDate(d.getDate()+6); return d; };
      const s0Mon = _getMon(0); const s0Sun = _getSun(0);
      const s1Mon = _getMon(1); const s1Sun = _getSun(1);
      const _semNom = (m,s) => `${String(m.getDate()).padStart(2,'0')}/${String(m.getMonth()+1).padStart(2,'0')} a ${String(s.getDate()).padStart(2,'0')}/${String(s.getMonth()+1).padStart(2,'0')}`;
      const _tarefasSem = (m,s) => _tarefas.filter(t => {
        if ((t.nivel||0) === 0) return false;
        const ini = t.inicio_previsto ? new Date(t.inicio_previsto+'T00:00:00') : null;
        const fim = t.fim_previsto ? new Date(t.fim_previsto+'T00:00:00') : null;
        return ini && ini <= s && (!fim || fim >= m);
      });
      const s0IsoMon = s0Mon.toISOString().slice(0,10);
      const s0Data = semanas.find(s => s.seg === s0IsoMon);
      const prevAcS0 = s0Data ? s0Data.previsto_ac : null;
      const realAcS0 = s0Data ? s0Data.real_ac : null;
      const desvioS0 = (prevAcS0 !== null && realAcS0 !== null) ? realAcS0 - prevAcS0 : null;

      const _fmtDt = iso => iso ? new Date(iso+'T12:00:00').toLocaleDateString('pt-BR') : '—';
      const _fmtPct = v => v !== null && v !== undefined ? v.toFixed(2)+'%' : '—';
      const fmtIso = iso => { const dt = new Date(iso+'T12:00:00'); return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`; };

      const tblRows = semanas.map(s => {
        const dc = s.desvio_ac !== null ? (s.desvio_ac >= 0 ? 'color:#16a34a;' : 'color:#dc2626;') : '';
        return `<tr>
          <td style="text-align:center;">${s.semana}</td>
          <td style="white-space:nowrap;">${fmtIso(s.seg)} – ${fmtIso(s.dom)}</td>
          <td style="text-align:right;">${_fmtPct(s.previsto_sem)}</td>
          <td style="text-align:right; font-weight:700;">${_fmtPct(s.previsto_ac)}</td>
          <td style="text-align:right;">${s.real_sem !== null ? _fmtPct(s.real_sem) : '—'}</td>
          <td style="text-align:right; font-weight:700;">${s.real_ac !== null ? _fmtPct(s.real_ac) : '—'}</td>
          <td style="text-align:right; font-weight:700; ${dc}">${s.desvio_ac !== null ? (s.desvio_ac>=0?'+':'')+s.desvio_ac.toFixed(2)+'%' : '—'}</td>
        </tr>`;
      }).join('');

      const _listaAtiv = tarefas => tarefas.length
        ? tarefas.map(t => `<li style="margin-bottom:4px;">${escapeHtml(t.codigo ? t.codigo+' — ':'')}${escapeHtml(t.nome)}${t.responsavel ? ` <span style="color:#6b7280;">(${escapeHtml(t.responsavel)})</span>` : ''}</li>`).join('')
        : '<li style="color:#6b7280;">Nenhuma atividade programada.</li>';

      const desvioColor = desvioS0 !== null ? (desvioS0 >= 0 ? '#16a34a' : '#dc2626') : 'var(--text-primary)';

      container.innerHTML = `
        <!-- KPIs inline -->
        <div class="stats-grid" style="margin-bottom:20px;">
          <div class="stat-card blue"><div class="stat-icon">📋</div><div class="stat-value">${tarefasAtivas.length}</div><div class="stat-label">Atividades</div></div>
          <div class="stat-card green"><div class="stat-icon">✅</div><div class="stat-value">${concluidas}</div><div class="stat-label">Concluídas</div></div>
          <div class="stat-card amber"><div class="stat-icon">⏳</div><div class="stat-value">${emAndamento}</div><div class="stat-label">Em Andamento</div></div>
          <div class="stat-card purple"><div class="stat-icon">📈</div><div class="stat-value">${avancoReal.toFixed(1)}%</div><div class="stat-label">Avanço Geral</div></div>
        </div>

        <!-- Cabeçalho do Relatório -->
        <div class="card" style="margin-bottom:16px; border-top:4px solid var(--primary-600);">
          <div style="text-align:center; font-size:16px; font-weight:700; color:var(--primary-700); margin-bottom:16px; text-transform:uppercase;">Relatório Executivo Semanal — ${escapeHtml(projData.projeto?.nome||'')} </div>
          <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px;">
            <div style="background:var(--bg-primary); border:1px solid var(--border-subtle); border-radius:6px; padding:10px; text-align:center;">
              <div style="font-size:11px; color:var(--text-muted);">Início Previsto</div>
              <div style="font-weight:700;">${_fmtDt(iniPrev)}</div>
            </div>
            <div style="background:var(--bg-primary); border:1px solid var(--border-subtle); border-radius:6px; padding:10px; text-align:center;">
              <div style="font-size:11px; color:var(--text-muted);">Término Previsto</div>
              <div style="font-weight:700;">${_fmtDt(fimPrev)}</div>
            </div>
            <div style="background:var(--bg-primary); border:1px solid var(--border-subtle); border-radius:6px; padding:10px; text-align:center;">
              <div style="font-size:11px; color:var(--text-muted);">Desvio Acumulado (S+0)</div>
              <div style="font-weight:700; color:${desvioColor};">${desvioS0 !== null ? (desvioS0>=0?'+':'')+desvioS0.toFixed(2)+'%' : '—'}</div>
            </div>
            <div style="background:var(--bg-primary); border:1px solid var(--border-subtle); border-radius:6px; padding:10px; text-align:center;">
              <div style="font-size:11px; color:var(--text-muted);">Previsto S+0</div>
              <div style="font-weight:700;">${_fmtPct(prevAcS0)}</div>
            </div>
            <div style="background:var(--bg-primary); border:1px solid var(--border-subtle); border-radius:6px; padding:10px; text-align:center;">
              <div style="font-size:11px; color:var(--text-muted);">Real S+0</div>
              <div style="font-weight:700; color:${realAcS0 !== null ? (realAcS0 >= (prevAcS0||0) ? '#16a34a':'#dc2626'):'inherit'};">${_fmtPct(realAcS0)}</div>
            </div>
            <div style="background:var(--bg-primary); border:1px solid var(--border-subtle); border-radius:6px; padding:10px; text-align:center;">
              <div style="font-size:11px; color:var(--text-muted);">Avanço Real Geral</div>
              <div style="font-weight:700;">${avancoReal.toFixed(2)}%</div>
            </div>
          </div>
        </div>

        <!-- Tabela Curva S -->
        <div class="card" style="margin-bottom:16px;">
          <div class="card-header"><div class="card-title">📊 Tabela de Avanço Semanal</div></div>
          <div style="overflow-x:auto;">
            <table class="data-table" style="width:100%; font-size:12px;">
              <thead><tr>
                <th style="text-align:center;">Sem.</th><th>Período</th>
                <th style="text-align:right;">Prev. Sem.%</th><th style="text-align:right;">Prev. Ac.%</th>
                <th style="text-align:right;">Real Sem.%</th><th style="text-align:right;">Real Ac.%</th>
                <th style="text-align:right;">Desvio Ac.%</th>
              </tr></thead>
              <tbody>${tblRows}</tbody>
            </table>
          </div>
        </div>

        <!-- Atividades S+0 e S+1 -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
          <div class="card">
            <div class="card-header"><div class="card-title">✅ Atividades S+0 (${_semNom(s0Mon,s0Sun)})</div></div>
            <ul style="margin:0; padding-left:18px; line-height:1.8; font-size:13px;">${_listaAtiv(_tarefasSem(s0Mon,s0Sun))}</ul>
          </div>
          <div class="card">
            <div class="card-header"><div class="card-title">📅 Atividades S+1 (${_semNom(s1Mon,s1Sun)})</div></div>
            <ul style="margin:0; padding-left:18px; line-height:1.8; font-size:13px;">${_listaAtiv(_tarefasSem(s1Mon,s1Sun))}</ul>
          </div>
        </div>

        <!-- Botão Relatório Executivo completo -->
        <div style="text-align:right; margin-bottom:8px;">
          <button class="btn btn-primary btn-sm" onclick="plan.relatorioExecutivo()">📄 Exportar Relatório Completo (Impressão)</button>
        </div>
      `;

      // Update KPI cards (dopEfetivoTotal etc.) from dashboard stats
      document.getElementById('planTotalTarefas') && (document.getElementById('planTotalTarefas').textContent = tarefasAtivas.length);
      document.getElementById('planConcluidas') && (document.getElementById('planConcluidas').textContent = concluidas);
      document.getElementById('planEmAndamento') && (document.getElementById('planEmAndamento').textContent = emAndamento);
      document.getElementById('planAvanco') && (document.getElementById('planAvanco').textContent = avancoReal.toFixed(1)+'%');

    } catch(e) {
      container.innerHTML = `<div class="card"><div style="padding:20px; color:var(--error-500);">Erro ao carregar relatório: ${escapeHtml(e.message)}</div></div>`;
    }
  }

  async function selecionarProjeto(pid) {
    if (!pid) { _pid = null; _tarefas = []; _resetUI(); return; }
    _pid = pid;
    // Sync both selectors
    ['planProjetoSelect', 'dopProjetoSelect'].forEach(id => {
      const s = document.getElementById(id); if (s) s.value = pid;
    });
    try {
      const data = await apiCall(`/api/projetos/${pid}`);
      _tarefas = data.tarefas || [];
      _atualizarKpis();
      document.getElementById('btnImportar').disabled = false;
      document.getElementById('btnExportar').disabled = false;
      document.getElementById('btnDeletar').disabled = false;
      const btnRel = document.getElementById('btnRelatorio');
      if (btnRel) btnRel.disabled = false;
      const btnRelExec = document.getElementById('btnRelatorioExec');
      if (btnRelExec) btnRelExec.disabled = false;
      tab(_tabAtiva);
      // Also refresh Dashboard Curva S if visible
      if (_secaoAtiva === 'dashboard-op') _carregarCurvaSTable(pid);
    } catch(e) { showToast('Erro ao carregar projeto', 'error'); }
  }

  function _resetUI() {
    document.getElementById('planKpis').style.display = 'none';
    document.getElementById('ganttContainer').innerHTML = '<div class="empty-state" style="padding:60px;"><div class="empty-state-icon">📊</div><div class="empty-state-title">Selecione um projeto</div></div>';
    document.getElementById('btnImportar').disabled = true;
    document.getElementById('btnExportar').disabled = true;
    document.getElementById('btnDeletar').disabled = true;
    const btnRel = document.getElementById('btnRelatorio');
    if (btnRel) btnRel.disabled = true;
    const btnRelExec = document.getElementById('btnRelatorioExec');
    if (btnRelExec) btnRelExec.disabled = true;
    const wrapper = document.getElementById('curvaSTableWrapper');
    if (wrapper) wrapper.innerHTML = '<div class="empty-state" style="padding:40px;"><div class="empty-state-icon">📊</div><div class="empty-state-title">Selecione um projeto para ver a tabela</div></div>';
  }

  async function deletarProjeto() {
    if (!_pid) return;
    const sel = document.getElementById('planProjetoSelect');
    const nome = sel?.options[sel.selectedIndex]?.text || 'este projeto';
    if (!confirm(`Apagar "${nome}" e todas as suas atividades?\n\nEsta ação não pode ser desfeita.`)) return;
    try {
      await apiCall(`/api/projetos/${_pid}`, { method: 'DELETE' });
      showToast('Projeto apagado.', 'success');
      _pid = null; _tarefas = [];
      _resetUI();
      await _carregarProjetos();
    } catch(e) { showToast(`Erro: ${e.message}`, 'error'); }
  }

  function _atualizarKpis() {
    const atividades = _tarefas.filter(t => t.nivel >= 1 || _tarefas.filter(x => x.nivel > 0).length === 0);
    const concluidas = atividades.filter(t => t.progresso >= 100).length;
    const andamento = atividades.filter(t => t.progresso > 0 && t.progresso < 100).length;
    const pesoTotal = atividades.reduce((s, t) => s + (t.peso || 1), 0);
    const avanco = pesoTotal > 0
      ? atividades.reduce((s, t) => s + (t.peso || 1) * (t.progresso || 0) / 100, 0) / pesoTotal * 100
      : 0;
    document.getElementById('planTotalTarefas').textContent = atividades.length;
    document.getElementById('planConcluidas').textContent = concluidas;
    document.getElementById('planEmAndamento').textContent = andamento;
    document.getElementById('planAvanco').textContent = avanco.toFixed(1) + '%';
    document.getElementById('planKpis').style.display = '';
  }

  function novoProjetoModal() {
    showModal('➕ Novo Projeto', `
      <div style="display:flex; flex-direction:column; gap:12px; padding:4px 0;">
        <div><label class="input-label">Nome do Projeto *</label><input class="input" id="npNome" type="text" placeholder="Ex: Obra Fábrica 01 — Fundação" style="width:100%;" autofocus></div>
        <div><label class="input-label">Descrição</label><textarea class="input" id="npDesc" rows="2" placeholder="Descrição opcional..." style="width:100%; resize:none;"></textarea></div>
        <button class="btn btn-primary" onclick="_plan_criarProjeto()" style="width:100%; margin-top:4px;">Criar Projeto</button>
      </div>`);
  }

  // global bridge para onclick
  window._plan_criarProjeto = async () => {
    const nome = document.getElementById('npNome')?.value?.trim();
    if (!nome) { showToast('Informe o nome', 'warning'); return; }
    const desc = document.getElementById('npDesc')?.value?.trim();
    try {
      const d = await apiCall('/api/projetos', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({nome, descricao: desc}) });
      closeModal();
      await _carregarProjetos();
      document.getElementById('planProjetoSelect').value = d.id;
      await selecionarProjeto(d.id);
      showToast('Projeto criado!', 'success');
    } catch(e) { showToast(`Erro: ${e.message}`, 'error'); }
  };

  function importarModal() {
    if (!_pid) return;
    showModal('📂 Importar Cronograma', `
      <div style="display:flex; flex-direction:column; gap:14px; padding:4px 0;">
        <div style="padding:12px; background:rgba(59,130,246,0.08); border-radius:8px; font-size:13px; color:var(--text-secondary); line-height:1.6;">
          <strong>Formatos suportados:</strong><br>
          • <strong>.xml</strong> — MS Project XML (recomendado, preserva toda a hierarquia)<br>
          • <strong>.xlsx / .xls / .csv / .tsv</strong> — Planilha com colunas: ID, Nome, Início, Término, % Concluído, Predecessoras<br>
          <a href="/api/projetos/0/modelo-csv" style="color:var(--primary-500); font-weight:600; font-size:12px; margin-top:4px; display:inline-block;">⬇ Baixar modelo TSV</a>
        </div>
        <div class="upload-zone" onclick="document.getElementById('planFileInput').click()" style="cursor:pointer; padding:28px;">
          <input type="file" id="planFileInput" accept=".xml,.csv,.xlsx,.xls,.tsv,.txt" style="display:none;" onchange="_plan_upload(this)">
          <div class="upload-zone-icon">📂</div>
          <div class="upload-zone-title">Clique para selecionar o arquivo</div>
          <div class="upload-zone-subtitle">.xml (MS Project) · .xlsx · .csv · .tsv</div>
        </div>
        <p id="planUploadMsg" style="font-size:13px; text-align:center; color:var(--text-muted);"></p>
      </div>`);
  }

  window._plan_upload = async (input) => {
    const file = input.files[0];
    if (!file || !_pid) return;
    const msg = document.getElementById('planUploadMsg');
    if (msg) msg.textContent = 'Importando...';
    const ext = file.name.split('.').pop().toLowerCase();
    const endpoint = ext === 'xml'
      ? `/api/projetos/${_pid}/importar-xml`
      : `/api/projetos/${_pid}/importar`;
    const fd = new FormData(); fd.append('file', file);
    try {
      const d = await apiCall(endpoint, { method:'POST', body: fd });
      closeModal();
      showToast(`${d.importadas} tarefas importadas com sucesso!`, 'success');
      await selecionarProjeto(_pid);
    } catch(e) {
      if (msg) msg.textContent = `Erro: ${e.message}`;
      showToast(`Erro: ${e.message}`, 'error');
    }
  };

  async function exportar() {
    if (!_pid) return;
    const a = document.createElement('a');
    a.href = `/api/projetos/${_pid}/exportar`;
    document.body.appendChild(a); a.click(); a.remove();
    showToast('Exportando...', 'info', 2000);
  }

  // ── Gantt ──────────────────────────────────
  function _renderGantt(tarefas) {
    const el = document.getElementById('ganttContainer');
    if (!tarefas.length) {
      el.innerHTML = '<div class="empty-state" style="padding:60px;"><div class="empty-state-icon">📊</div><div class="empty-state-title">Nenhuma atividade no período selecionado</div></div>';
      return;
    }

    const DAY_W = 26, ROW_H = 48, HDR_H = 56, BAR_H = 14, BAR_Y1 = 8, BAR_Y2 = 26, LEFT_W = 360;
    const allDates = tarefas.flatMap(t => [t.inicio_previsto, t.fim_previsto].filter(Boolean)).map(d => new Date(d + 'T12:00:00'));
    if (!allDates.length) { el.innerHTML = '<div class="empty-state" style="padding:40px;"><div class="empty-state-icon">📅</div><div class="empty-state-title">Sem datas definidas</div></div>'; return; }

    const minD = new Date(Math.min(...allDates)); minD.setDate(minD.getDate() - 3);
    const maxD = new Date(Math.max(...allDates)); maxD.setDate(maxD.getDate() + 10);
    const totalDays = Math.ceil((maxD - minD) / 86400000);
    const svgW = Math.max(totalDays * DAY_W, 600);
    const svgHbody = tarefas.length * ROW_H;

    const dx = (ds) => { if (!ds) return -100; return Math.round((new Date(ds + 'T12:00:00') - minD) / 86400000) * DAY_W; };

    // ── Header SVG ────────────
    let hdr = `<svg width="${svgW}" height="${HDR_H}" xmlns="http://www.w3.org/2000/svg" style="display:block;">`;
    const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    // month bars
    let md = new Date(minD.getFullYear(), minD.getMonth(), 1);
    while (md <= maxD) {
      const me = new Date(md.getFullYear(), md.getMonth() + 1, 0);
      const x1 = Math.max(0, Math.round((md - minD) / 86400000) * DAY_W);
      const x2 = Math.min(svgW, Math.round((me - minD) / 86400000) * DAY_W + DAY_W);
      hdr += `<rect x="${x1}" y="0" width="${x2-x1}" height="28" fill="${md.getMonth()%2===0?'#1a6b3c':'#23884e'}"/>`;
      if (x2-x1 > 30) hdr += `<text x="${(x1+x2)/2}" y="19" text-anchor="middle" fill="white" font-size="12" font-weight="700" font-family="Inter,sans-serif">${MESES[md.getMonth()]} ${md.getFullYear()}</text>`;
      md = new Date(md.getFullYear(), md.getMonth() + 1, 1);
    }
    // Semana atual (segunda-feira)
    const _todayRef = new Date(); _todayRef.setHours(0,0,0,0);
    const _daysToMon = _todayRef.getDay() === 0 ? 6 : _todayRef.getDay() - 1;
    const _curMon = new Date(_todayRef); _curMon.setDate(_todayRef.getDate() - _daysToMon);

    const _weekLabel = (monDate) => {
      const diff = Math.round((monDate - _curMon) / (7 * 86400000));
      if (diff === 0) return 'S+0';
      return diff > 0 ? `S+${diff}` : `S${diff}`;
    };

    // week bars — começam na Segunda
    let wd = new Date(minD); wd.setDate(wd.getDate() - ((wd.getDay() + 6) % 7));
    let wi = 0;
    while (wd <= maxD) {
      const wx = Math.max(0, Math.round((wd - minD) / 86400000) * DAY_W);
      const slabel = _weekLabel(new Date(wd));
      const isCurWeek = slabel === 'S+0';
      const bgFill = isCurWeek ? '#d1fae5' : (wi%2===0 ? '#f3faf5' : '#e8f5ec');
      const txtColor = isCurWeek ? '#065f46' : '#4a7c59';
      const strokeW = isCurWeek ? 1.5 : 0.5;
      const strokeC = isCurWeek ? '#16a34a' : '#d1e8d8';
      hdr += `<rect x="${wx}" y="28" width="${7*DAY_W}" height="28" fill="${bgFill}" stroke="${strokeC}" stroke-width="${strokeW}"/>`;
      hdr += `<text x="${wx+3}" y="41" fill="${txtColor}" font-size="9" font-family="Inter,sans-serif" font-weight="${isCurWeek?700:400}">${wd.getDate()}/${wd.getMonth()+1}</text>`;
      hdr += `<text x="${wx+3}" y="53" fill="${txtColor}" font-size="9" font-family="Inter,sans-serif" font-weight="700">${slabel}</text>`;
      wd.setDate(wd.getDate() + 7); wi++;
    }
    hdr += `</svg>`;

    // ── Body SVG ──────────────
    let left = '';
    let body = `<svg width="${svgW}" height="${svgHbody}" xmlns="http://www.w3.org/2000/svg" style="display:block;">`;
    // today line
    const todayX = Math.round((new Date() - minD) / 86400000) * DAY_W;
    body += `<line x1="${todayX}" y1="0" x2="${todayX}" y2="${svgHbody}" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="5,3" opacity="0.75"/>`;

    tarefas.forEach((t, i) => {
      const y = i * ROW_H;
      const isGroup = (t.nivel || 0) <= 1;
      // row bg
      body += `<rect x="0" y="${y}" width="${svgW}" height="${ROW_H}" fill="${i%2===0?'#ffffff':'#f8fdfb'}"/>`;
      // grid line
      body += `<line x1="0" y1="${y+ROW_H}" x2="${svgW}" y2="${y+ROW_H}" stroke="#e2eae5" stroke-width="0.5"/>`;

      // Baseline bar
      if (t.inicio_previsto && t.fim_previsto) {
        const x1 = dx(t.inicio_previsto), x2 = dx(t.fim_previsto) + DAY_W;
        const w = Math.max(4, x2 - x1);
        const fillB = t.is_critico ? 'rgba(239,68,68,0.5)' : 'rgba(59,130,246,0.55)';
        const strokeB = t.is_critico ? '#dc2626' : '#2563eb';
        body += `<rect x="${x1}" y="${y+BAR_Y1}" width="${w}" height="${BAR_H}" rx="3" fill="${fillB}" stroke="${strokeB}" stroke-width="1"/>`;
        if (w > 28) body += `<text x="${x1+4}" y="${y+BAR_Y1+10}" font-size="9" fill="${t.is_critico?'#7f1d1d':'#1e3a8a'}" font-family="Inter,sans-serif">${(t.progresso||0).toFixed(0)}%</text>`;
      }
      // Real bar
      if (t.inicio_real) {
        const x1 = dx(t.inicio_real);
        const endDs = t.fim_real || new Date().toISOString().slice(0,10);
        const x2 = dx(endDs) + DAY_W;
        const w = Math.max(4, x2 - x1);
        const pct = t.progresso || 0;
        body += `<rect x="${x1}" y="${y+BAR_Y2}" width="${w}" height="${BAR_H}" rx="3" fill="rgba(34,197,94,0.3)" stroke="#16a34a" stroke-width="1"/>`;
        body += `<rect x="${x1}" y="${y+BAR_Y2}" width="${Math.max(4, w*pct/100)}" height="${BAR_H}" rx="3" fill="rgba(34,197,94,0.75)"/>`;
        if (w > 28) body += `<text x="${x1+4}" y="${y+BAR_Y2+10}" font-size="9" fill="#14532d" font-family="Inter,sans-serif">${pct.toFixed(0)}%</text>`;
      }

      // Left panel row
      const indent = (t.nivel || 0) * 14;
      left += `<div class="gantt-left-row ${isGroup?'gantt-group':''}" style="height:${ROW_H}px; background:${i%2===0?'white':'#f8fdfb'}; padding-left:${8+indent}px;">
        <span style="font-size:10px; color:#6b7280; min-width:34px; flex-shrink:0;">${escapeHtml(t.codigo||'')}</span>
        <span style="font-size:12px; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:${isGroup?'#1a3a1a':'#374151'};" title="${escapeHtml(t.nome)}">${escapeHtml(t.nome)}</span>
        <span style="font-size:11px; color:${(t.progresso||0)>=100?'#16a34a':(t.progresso||0)>0?'#d97706':'#9ca3af'}; min-width:30px; text-align:right; flex-shrink:0;">${(t.progresso||0).toFixed(0)}%</span>
      </div>`;
    });
    body += `</svg>`;

    // ── Assemble ──────────────
    el.innerHTML = `
      <div style="display:flex; flex-shrink:0; height:${HDR_H}px; overflow:hidden; border-bottom:2px solid #d1e8d8;">
        <div style="width:${LEFT_W}px; flex-shrink:0; background:#1a6b3c; display:flex; align-items:center; padding:0 12px;">
          <span style="color:white; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Atividade</span>
        </div>
        <div style="flex:1; overflow:hidden;" id="ganttHdrX"><div id="ganttHdrInner" style="overflow:hidden;">${hdr}</div></div>
      </div>
      <div style="display:flex; flex:1; overflow:hidden;">
        <div id="ganttLScroll" style="width:${LEFT_W}px; flex-shrink:0; overflow-y:auto; overflow-x:hidden;">${left}</div>
        <div id="ganttRScroll" style="flex:1; overflow:auto;">${body}</div>
      </div>`;

    // Sync scroll
    const rs = document.getElementById('ganttRScroll');
    const ls = document.getElementById('ganttLScroll');
    const hx = document.getElementById('ganttHdrInner');
    rs.addEventListener('scroll', () => { ls.scrollTop = rs.scrollTop; hx.scrollLeft = rs.scrollLeft; });
    ls.addEventListener('scroll', () => { rs.scrollTop = ls.scrollTop; });

    // Scroll para hoje automaticamente (centra na data atual)
    setTimeout(() => {
      const todayX = Math.round((new Date() - minD) / 86400000) * DAY_W;
      rs.scrollLeft = Math.max(0, todayX - rs.clientWidth / 2 + DAY_W * 3);
    }, 60);
  }

  // ── Curva S ────────────────────────────────
  async function _renderCurvaS() {
    if (!_pid) return;
    try {
      const d = await apiCall(`/api/projetos/${_pid}/curva-s`);
      if (_charts.curvaS) { _charts.curvaS.destroy(); delete _charts.curvaS; }
      const ctx = document.getElementById('curvaSChart')?.getContext('2d');
      if (!ctx) return;
      const hoje = new Date().toISOString().slice(0,10);
      _charts.curvaS = new Chart(ctx, {
        type: 'line',
        data: {
          labels: d.labels.map(l => { const dt = new Date(l+'T12:00:00'); return `${dt.getDate()}/${dt.getMonth()+1}`; }),
          datasets: [
            { label: 'Previsto (%)', data: d.previsto, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 2 },
            { label: 'Real (%)', data: d.real, borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.1)', borderWidth: 2.5, fill: true, tension: 0.4, pointRadius: 3, spanGaps: false },
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${(ctx.parsed.y||0).toFixed(1)}%` } } },
          scales: {
            y: { min: 0, max: 100, ticks: { callback: v => v + '%' }, grid: { color: '#f0f0f0' } },
            x: { grid: { color: '#f0f0f0' } }
          }
        }
      });
      // Desvio
      const real = d.real.filter(v => v !== null);
      const prev = d.previsto.slice(0, real.length);
      if (real.length && prev.length) {
        const desvio = (real[real.length-1] || 0) - (prev[real.length-1] || 0);
        const box = document.getElementById('curvaSDesvio');
        box.style.display = '';
        box.innerHTML = `<span class="${desvio >= 0 ? 'desvio-adiantado' : 'desvio-atrasado'}">${desvio >= 0 ? '▲' : '▼'} Desvio atual: ${Math.abs(desvio).toFixed(1)} pp ${desvio >= 0 ? '(adiantado)' : '(atrasado)'}</span>`;
      }
    } catch(e) { showToast('Erro ao carregar Curva S', 'error'); }
  }

  // ── Histograma ─────────────────────────────
  async function _renderHistograma() {
    if (!_pid) return;
    try {
      const d = await apiCall(`/api/projetos/${_pid}/histograma`);
      const mkBar = (canvasId, label1, data1, label2, data2, color1, color2) => {
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) return;
        if (_charts[canvasId]) { _charts[canvasId].destroy(); delete _charts[canvasId]; }
        _charts[canvasId] = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: d.labels,
            datasets: [
              { label: label1, data: data1, backgroundColor: color1 + 'bb', borderColor: color1, borderWidth: 1, borderRadius: 3 },
              { label: label2, data: data2, backgroundColor: color2 + 'bb', borderColor: color2, borderWidth: 1, borderRadius: 3 },
            ]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } }
        });
      };
      mkBar('histMoChart', 'MO Previsto', d.mo_prev, 'MO Real', d.mo_real, '#3b82f6', '#16a34a');
      mkBar('histEqChart', 'Equip. Previsto', d.eq_prev, 'Equip. Real', d.eq_real, '#8b5cf6', '#f59e0b');
    } catch(e) { showToast('Erro ao carregar histograma', 'error'); }
  }

  // ── Lista ──────────────────────────────────
  function _renderLista(tarefas) {
    const el = document.getElementById('planListaWrapper');
    if (!tarefas.length) { el.innerHTML = '<div class="empty-state" style="padding:40px;"><div class="empty-state-icon">📋</div><div class="empty-state-title">Nenhuma atividade</div></div>'; return; }
    const rows = tarefas.map(t => {
      const indent = (t.nivel||0) * 16;
      const isGrp = (t.nivel||0) === 0;
      const bg = isGrp ? 'background:#f0f9f2;' : '';
      const fw = isGrp ? 'font-weight:700;' : '';
      const pct = t.progresso || 0;
      const barColor = pct >= 100 ? '#16a34a' : pct > 0 ? '#f59e0b' : '#e5e7eb';
      const dtFmt = ds => ds ? new Date(ds+'T12:00:00').toLocaleDateString('pt-BR') : '';
      return `<tr style="${bg}">
        <td style="padding-left:${8+indent}px; font-size:12px; color:#6b7280; width:54px;">${escapeHtml(t.codigo||'')}</td>
        <td style="padding-left:${8+indent}px; font-size:13px; ${fw} max-width:260px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(t.nome)}">${escapeHtml(t.nome)}</td>
        <td style="font-size:12px; color:var(--text-muted); white-space:nowrap;">${dtFmt(t.inicio_previsto)||'—'}</td>
        <td style="font-size:12px; color:var(--text-muted); white-space:nowrap;">${dtFmt(t.fim_previsto)||'—'}</td>
        <td style="background:rgba(34,197,94,0.04); min-width:116px;">
          <input type="date" class="ed-input ed-date" value="${t.inicio_real||''}"
            onchange="plan.salvarCampo(${t.id},'inicio_real',this.value,this)" title="Início Real">
        </td>
        <td style="background:rgba(34,197,94,0.04); min-width:116px;">
          <input type="date" class="ed-input ed-date" value="${t.fim_real||''}"
            onchange="plan.salvarCampo(${t.id},'fim_real',this.value,this)" title="Fim Real">
        </td>
        <td style="min-width:160px;">
          <div style="display:flex; align-items:center; gap:5px;">
            <div style="flex:1; height:6px; background:#e5e7eb; border-radius:3px; overflow:hidden; min-width:44px;">
              <div style="width:${pct}%; height:100%; background:${barColor}; border-radius:3px; transition:width .3s;"></div>
            </div>
            <input type="number" class="plan-prog-input" min="0" max="100" value="${pct.toFixed(0)}"
              onchange="plan.salvarProgresso(${t.id},this.value,this)" title="% Concluído">
            <button class="ed-btn" title="${pct>=100?'Reabrir':'Concluir 100%'}"
              onclick="plan.salvarProgresso(${t.id},${pct>=100?0:100},null,${t.id})"
              style="color:${pct>=100?'#16a34a':'#9ca3af'}; font-weight:700; padding:2px 5px; min-width:22px;">${pct>=100?'↺':'✓'}</button>
          </div>
        </td>
      </tr>`;
    }).join('');
    el.innerHTML = `<div class="table-wrapper" style="overflow-x:auto;"><table class="table" style="min-width:900px;">
      <thead><tr>
        <th style="width:54px;">Cód.</th>
        <th>Atividade</th>
        <th style="white-space:nowrap;">Início Prev.</th>
        <th style="white-space:nowrap;">Fim Prev.</th>
        <th style="background:rgba(34,197,94,0.06); white-space:nowrap;">Início Real</th>
        <th style="background:rgba(34,197,94,0.06); white-space:nowrap;">Fim Real</th>
        <th style="min-width:160px;">% Concluído</th>
      </tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  async function salvarCampo(tid, campo, valor, inputEl) {
    try {
      await apiCall(`/api/tarefas/${tid}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({[campo]: valor || null}) });
      const t = _tarefas.find(x => x.id === tid);
      if (t) t[campo] = valor || null;
    } catch(e) {
      showToast('Erro ao salvar', 'error');
      if (inputEl) inputEl.value = '';
    }
  }

  async function salvarProgresso(tid, val, input, rowId) {
    const pct = Math.min(100, Math.max(0, parseFloat(val) || 0));
    if (input) input.value = pct;
    try {
      await apiCall(`/api/tarefas/${tid}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({progresso: pct}) });
      const t = _tarefas.find(x => x.id === tid);
      if (t) t.progresso = pct;
      _atualizarKpis();
      // Re-render lista to update bar + button state without full reload
      if (_tabAtiva === 'lista') _renderLista(_filtrarTarefas());
    } catch(e) { showToast('Erro ao salvar progresso', 'error'); }
  }

  // ── Editor Inline ───────────────────────────
  let _editorState = [];

  function _iniciarEditor() {
    _editorState = JSON.parse(JSON.stringify(_tarefas));
    _renderEditor();
  }

  function _renderEditor() {
    const el = document.getElementById('planEditorWrapper');
    if (!el) return;
    if (!_editorState.length) {
      el.innerHTML = '<div class="empty-state" style="padding:40px;"><div class="empty-state-icon">✏️</div><div class="empty-state-title">Nenhuma atividade. Clique em ➕ para adicionar.</div></div>';
      return;
    }
    const rows = _editorState.map((t, i) => {
      const indent = (t.nivel || 0) * 14;
      const isGrp = (t.nivel || 0) === 0;
      const predStr = Array.isArray(t.predecessoras) ? t.predecessoras.join(', ') : (t.predecessoras || '');
      const pct = t.progresso || 0;
      const rowBg = isGrp ? 'background:#f0f9f2;' : (i%2===0 ? '' : 'background:#fafcfb;');
      return `<tr style="${rowBg}">
        <td style="white-space:nowrap; padding:2px 4px;">
          <div style="display:flex; gap:1px; align-items:center;">
            <button class="ed-btn" onclick="_edMove(${i},-1)" title="Mover para cima" ${i===0?'disabled':''}>↑</button>
            <button class="ed-btn" onclick="_edMove(${i},1)"  title="Mover para baixo" ${i===_editorState.length-1?'disabled':''}>↓</button>
            <button class="ed-btn" onclick="_edIndent(${i},-1)" title="Diminuir nível (←)">◄</button>
            <button class="ed-btn" onclick="_edIndent(${i},1)"  title="Aumentar nível (→)">►</button>
          </div>
        </td>
        <td><input class="ed-input" value="${escapeHtml(t.codigo||'')}" onchange="_edEdit(${i},'codigo',this.value)" placeholder="Cód." style="width:52px;"></td>
        <td style="padding-left:${4+indent}px; min-width:230px;"><input class="ed-input" value="${escapeHtml(t.nome||'')}" onchange="_edEdit(${i},'nome',this.value)" style="font-weight:${isGrp?700:400}; width:100%;" placeholder="Nome da atividade"></td>
        <td><input class="ed-input" type="number" min="0" value="${t.duracao||''}" onchange="_edEdit(${i},'duracao',+this.value)" placeholder="d" style="width:50px;"></td>
        <td style="background:rgba(59,130,246,0.05);"><input class="ed-input ed-date" type="date" value="${t.inicio_previsto||''}" onchange="_edEdit(${i},'inicio_previsto',this.value)"></td>
        <td style="background:rgba(59,130,246,0.05);"><input class="ed-input ed-date" type="date" value="${t.fim_previsto||''}" onchange="_edEdit(${i},'fim_previsto',this.value)"></td>
        <td style="background:rgba(34,197,94,0.05);"><input class="ed-input ed-date" type="date" value="${t.inicio_real||''}" onchange="_edEdit(${i},'inicio_real',this.value)"></td>
        <td style="background:rgba(34,197,94,0.05);"><input class="ed-input ed-date" type="date" value="${t.fim_real||''}" onchange="_edEdit(${i},'fim_real',this.value)"></td>
        <td style="white-space:nowrap;">
          <div style="display:flex; align-items:center; gap:3px;">
            <input class="ed-input" type="number" min="0" max="100" value="${pct.toFixed(0)}" onchange="_edEdit(${i},'progresso',+this.value)" style="width:46px;">
            <button class="ed-btn" onclick="_edToggle100(${i})" title="${pct>=100?'Reabrir':'Concluir 100%'}"
              style="color:${pct>=100?'#16a34a':'#9ca3af'}; font-weight:700; min-width:22px;">${pct>=100?'↺':'✓'}</button>
          </div>
        </td>
        <td><input class="ed-input" value="${escapeHtml(predStr)}" onchange="_edEditPred(${i},this.value)" placeholder="ex: 3, 5" style="width:86px;"></td>
        <td><input class="ed-input" type="number" min="0" value="${t.recursos_mo||0}" onchange="_edEdit(${i},'recursos_mo',+this.value)" title="Mão de Obra" style="width:46px;"></td>
        <td><input class="ed-input" type="number" min="0" value="${t.recursos_eq||0}" onchange="_edEdit(${i},'recursos_eq',+this.value)" title="Equipamentos" style="width:46px;"></td>
        <td>
          <button class="ed-btn" style="color:var(--error-500);" onclick="_edDel(${i})" title="Remover linha">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
          </button>
        </td>
      </tr>`;
    }).join('');
    el.innerHTML = `<div class="table-wrapper" style="overflow-x:auto; max-height:540px; overflow-y:auto;">
      <table class="table" style="min-width:1160px; border-collapse:collapse;">
        <thead style="position:sticky; top:0; z-index:2; background:var(--bg-primary);">
          <tr>
            <th style="width:88px;" title="Mover e recuar/avançar nível">Ações</th>
            <th style="min-width:58px;">Código</th>
            <th style="min-width:230px;">Nome da Atividade</th>
            <th title="Duração em dias" style="min-width:56px;">Dur.(d)</th>
            <th style="min-width:118px; background:rgba(59,130,246,0.08);">Início Prev.</th>
            <th style="min-width:118px; background:rgba(59,130,246,0.08);">Fim Prev.</th>
            <th style="min-width:118px; background:rgba(34,197,94,0.08);">Início Real</th>
            <th style="min-width:118px; background:rgba(34,197,94,0.08);">Fim Real</th>
            <th style="min-width:78px;">% [✓]</th>
            <th style="min-width:96px;" title="IDs predecessoras separados por vírgula">Pred.</th>
            <th style="min-width:50px;" title="Mão de Obra">👷 MO</th>
            <th style="min-width:50px;" title="Equipamentos">🚜 Eq.</th>
            <th style="width:36px;"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  // Global bridges used by inline onchange/onclick
  window._edEdit = (idx, field, val) => {
    if (_editorState[idx]) _editorState[idx][field] = val;
  };
  window._edEditPred = (idx, val) => {
    if (!_editorState[idx]) return;
    _editorState[idx].predecessoras = val.split(/[,;]/).map(s => s.trim()).filter(Boolean);
  };
  window._edDel = (idx) => {
    _editorState.splice(idx, 1);
    _renderEditor();
  };
  window._edMove = (idx, dir) => {
    const ni = idx + dir;
    if (ni < 0 || ni >= _editorState.length) return;
    [_editorState[idx], _editorState[ni]] = [_editorState[ni], _editorState[idx]];
    _renderEditor();
  };
  window._edIndent = (idx, dir) => {
    if (!_editorState[idx]) return;
    _editorState[idx].nivel = Math.max(0, Math.min(5, (_editorState[idx].nivel || 0) + dir));
    _renderEditor();
  };
  window._edToggle100 = (idx) => {
    if (!_editorState[idx]) return;
    _editorState[idx].progresso = (_editorState[idx].progresso || 0) >= 100 ? 0 : 100;
    _renderEditor();
  };

  function adicionarTarefa() {
    if (!_pid) { showToast('Selecione um projeto primeiro', 'warning'); return; }
    _editorState.push({
      id: null, codigo: '', nome: 'Nova Atividade', nivel: 1, duracao: 1,
      inicio_previsto: '', fim_previsto: '', inicio_real: '', fim_real: '',
      progresso: 0, predecessoras: [], recursos_mo: 0, recursos_eq: 0, peso: 1.0, is_marco: false
    });
    _renderEditor();
    // Scroll to new row
    const wrap = document.querySelector('#planEditorWrapper .table-wrapper');
    if (wrap) setTimeout(() => { wrap.scrollTop = wrap.scrollHeight; }, 50);
  }

  function recalcular() {
    if (!_editorState.length) return;
    // Build lookup: codigo → index
    const byCode = {};
    _editorState.forEach((t, i) => { if (t.codigo) byCode[String(t.codigo).trim()] = i; });

    const addDays = (ds, n) => {
      if (!ds) return null;
      const d = new Date(ds + 'T12:00:00'); d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    };

    const processed = new Set();
    function process(idx) {
      if (processed.has(idx)) return;
      processed.add(idx);
      const t = _editorState[idx];
      const preds = Array.isArray(t.predecessoras) ? t.predecessoras : [];
      if (preds.length) {
        let maxEnd = null;
        for (const pc of preds) {
          const key = String(pc).trim();
          let pi = byCode[key];
          if (pi === undefined) { const n = parseInt(key); if (!isNaN(n)) pi = n - 1; }
          if (pi !== undefined && pi >= 0 && pi < _editorState.length && pi !== idx) {
            process(pi);
            const endDate = _editorState[pi].fim_previsto;
            if (endDate && (!maxEnd || endDate > maxEnd)) maxEnd = endDate;
          }
        }
        if (maxEnd) t.inicio_previsto = addDays(maxEnd, 1);
      }
      if (t.inicio_previsto && t.duracao > 0) {
        t.fim_previsto = addDays(t.inicio_previsto, t.duracao - 1);
      }
    }
    _editorState.forEach((_, i) => process(i));
    _renderEditor();
    showToast('Datas recalculadas com base nas predecessoras', 'success');
  }

  async function salvarEditor() {
    if (!_pid) { showToast('Selecione um projeto primeiro', 'warning'); return; }
    try {
      const payload = _editorState.map((t, i) => ({ ...t, ordem: i }));
      const d = await apiCall(`/api/projetos/${_pid}/salvar-editor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tarefas: payload })
      });
      showToast(`${d.salvas} atividades salvas!`, 'success');
      await selecionarProjeto(_pid);
    } catch(e) { showToast(`Erro ao salvar: ${e.message}`, 'error'); }
  }

  function relatorio() {
    if (!_pid || !_tarefas.length) return;

    const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

    const _verb = (t, seg, dom) => {
      const ini = t.inicio_previsto ? new Date(t.inicio_previsto + 'T00:00:00') : null;
      const fim = t.fim_previsto   ? new Date(t.fim_previsto   + 'T00:00:00') : null;
      if (!ini) return 'Dar continuidade em';
      const startsSemana = ini >= seg && ini <= dom;
      const endsSemana   = fim && fim >= seg && fim <= dom;
      const startsBefore = ini < seg;
      if (startsSemana && endsSemana) return 'Executar';
      if (startsSemana) return 'Iniciar';
      if (endsSemana) return 'Finalizar';
      return 'Dar continuidade em';
    };

    const _buildBloco = (tarefasSem, sem) => {
      const header = `ATIVIDADES PROGRAMADAS ${sem.label.replace('-','/')} - SEMANA ${sem.semNum}`;
      const linhas = tarefasSem.map(t => {
        const verb = _verb(t, sem.seg, sem.dom);
        const nome = t.nome.trim();
        // If task name already starts with (SOMETHING), keep it; prepend verb after the parenthesis
        const m = nome.match(/^(\([^)]+\))\s*(.*)/);
        if (m) {
          return `${m[1]} ${verb} ${m[2].charAt(0).toLowerCase() + m[2].slice(1)}.`;
        }
        // If responsavel field set, prepend it
        if (t.responsavel) {
          return `(${t.responsavel.toUpperCase()}) ${verb} ${nome.charAt(0).toLowerCase() + nome.slice(1)}.`;
        }
        return `${verb} ${nome}.`;
      });
      return header + '\n' + linhas.join('\n');
    };

    const _tarefasNaSemana = (seg, dom) => {
      return _tarefas.filter(t => {
        if (t.nivel === 0) return false; // skip top-level groups
        const ini = t.inicio_previsto ? new Date(t.inicio_previsto + 'T00:00:00') : null;
        const fim = t.fim_previsto   ? new Date(t.fim_previsto   + 'T00:00:00') : null;
        if (!ini) return false;
        return ini <= dom && (!fim || fim >= seg);
      });
    };

    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const mesAtual = hoje.getMonth();
    const anoAtual = hoje.getFullYear();

    // Build month's weeks
    const primeiroDiaMes = new Date(anoAtual, mesAtual, 1);
    const ultimoDiaMes   = new Date(anoAtual, mesAtual + 1, 0);
    // Find first Monday of or before first day of month
    let seg = new Date(primeiroDiaMes);
    const wd = seg.getDay();
    seg.setDate(seg.getDate() - (wd === 0 ? 6 : wd - 1));

    const blocos = [];
    while (seg <= ultimoDiaMes) {
      const dom = new Date(seg); dom.setDate(seg.getDate() + 6);
      const fmt = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
      const dt2 = new Date(Date.UTC(seg.getFullYear(), seg.getMonth(), seg.getDate()));
      const dayN = dt2.getUTCDay() || 7; dt2.setUTCDate(dt2.getUTCDate() + 4 - dayN);
      const yrS = new Date(Date.UTC(dt2.getUTCFullYear(), 0, 1));
      const numSem = Math.ceil((((dt2 - yrS) / 86400000) + 1) / 7);
      const semFinal = { seg: new Date(seg), dom: new Date(dom), label: `${fmt(seg)}-${fmt(dom)}`, semNum: numSem };
      const tf = _tarefasNaSemana(seg, dom);
      if (tf.length) blocos.push(_buildBloco(tf, semFinal));
      seg.setDate(seg.getDate() + 7);
    }

    const titulo = `RELATÓRIO MENSAL DE ATIVIDADES — ${MESES_PT[mesAtual].toUpperCase()} ${anoAtual}`;
    const textoCompleto = titulo + '\n' + '='.repeat(titulo.length) + '\n\n' + blocos.join('\n\n---\n\n');

    showModal('📋 Relatório de Atividades', `
      <div style="display:flex; flex-direction:column; gap:12px; min-width:560px;">
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <span style="font-size:13px; color:var(--text-muted); flex:1;">${MESES_PT[mesAtual]} ${anoAtual} · ${blocos.length} semana(s) com atividades</span>
          <button class="btn btn-primary btn-sm" onclick="navigator.clipboard.writeText(document.getElementById('relatorioTexto').value).then(()=>showToast('Copiado!','success',1500))">
            📋 Copiar Tudo
          </button>
        </div>
        <textarea id="relatorioTexto" readonly style="width:100%; height:420px; font-family:'JetBrains Mono',monospace; font-size:12px; line-height:1.6; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:8px; padding:12px; color:var(--text-primary); resize:vertical;">${textoCompleto}</textarea>
      </div>`);
  }

  // ── Relatório Executivo Semanal PDF ────────
  async function relatorioExecutivo() {
    if (!_pid) return;

    // Load weekly Curva S data
    let semanas = [], pesoTotal = 0;
    try {
      const cs = await apiCall(`/api/projetos/${_pid}/curva-s-semanal`);
      semanas = cs.semanas || [];
      pesoTotal = cs.peso_total || 0;
    } catch(e) { showToast('Erro ao carregar Curva S', 'error'); return; }

    // Determine project date range and current progress
    const tarefasAtivas = _tarefas.filter(t => t.inicio_previsto && t.fim_previsto);
    const iniPrev = tarefasAtivas.length ? tarefasAtivas.reduce((a,b) => a.inicio_previsto < b.inicio_previsto ? a : b).inicio_previsto : '';
    const fimPrev = tarefasAtivas.length ? tarefasAtivas.reduce((a,b) => a.fim_previsto > b.fim_previsto ? a : b).fim_previsto : '';
    const iniReal = tarefasAtivas.filter(t=>t.inicio_real).reduce((a,b) => (!a || b.inicio_real < a.inicio_real) ? b : a, null)?.inicio_real || '';
    const fimReal = tarefasAtivas.filter(t=>t.fim_real).reduce((a,b) => (!a || b.fim_real > a.fim_real) ? b : a, null)?.fim_real || '';
    const pesoTot2 = tarefasAtivas.reduce((s,t) => s + (t.peso||1), 0);
    const avancoReal = pesoTot2 > 0 ? tarefasAtivas.reduce((s,t) => s + (t.peso||1)*(t.progresso||0)/100, 0)/pesoTot2*100 : 0;

    // Current week S+0 and next week S+1
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const _getMon = off => { const d = new Date(hoje); d.setDate(d.getDate() - d.getDay() + 1 + off*7); return d; };
    const _getSun = off => { const d = _getMon(off); d.setDate(d.getDate()+6); return d; };
    const [s0Mon, s0Sun] = [_getMon(0), _getSun(0)];
    const [s1Mon, s1Sun] = [_getMon(1), _getSun(1)];
    const _semNom = (mon, sun) => {
      const fmt = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
      return `${fmt(mon)} a ${fmt(sun)}`;
    };
    const _tarefasSem = (mon, sun) => _tarefas.filter(t => {
      if ((t.nivel||0) === 0) return false;
      const ini = t.inicio_previsto ? new Date(t.inicio_previsto+'T00:00:00') : null;
      const fim = t.fim_previsto ? new Date(t.fim_previsto+'T00:00:00') : null;
      return ini && ini <= sun && (!fim || fim >= mon);
    });
    const _fmtDt = iso => iso ? new Date(iso+'T12:00:00').toLocaleDateString('pt-BR') : '—';
    const _fmtPct = v => v !== null && v !== undefined ? v.toFixed(2) + '%' : '—';

    // Find current week's Curva S data
    const s0IsoMon = s0Mon.toISOString().slice(0,10);
    const s0Data = semanas.find(s => s.seg === s0IsoMon);
    const prevAcS0 = s0Data ? s0Data.previsto_ac : null;
    const realAcS0 = s0Data ? s0Data.real_ac : null;
    const desvioS0 = (prevAcS0 !== null && realAcS0 !== null) ? realAcS0 - prevAcS0 : null;

    const ativS0 = _tarefasSem(s0Mon, s0Sun);
    const ativS1 = _tarefasSem(s1Mon, s1Sun);

    const _listaAtiv = tarefas => tarefas.length
      ? tarefas.map(t => `<li style="margin-bottom:4px;">${escapeHtml(t.codigo ? t.codigo+' — ' : '')}${escapeHtml(t.nome)}${t.responsavel ? ` <span style="color:#6b7280;">(${escapeHtml(t.responsavel)})</span>` : ''}</li>`).join('')
      : '<li style="color:#6b7280;">Nenhuma atividade programada.</li>';

    // Table rows
    const fmtIso = iso => { const dt = new Date(iso+'T12:00:00'); return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`; };
    const tblRows = semanas.map(s => {
      const dc = s.desvio_ac !== null ? (s.desvio_ac >= 0 ? 'color:#16a34a;' : 'color:#dc2626;') : '';
      return `<tr>
        <td style="text-align:center;">${s.semana}</td>
        <td style="white-space:nowrap;">${fmtIso(s.seg)} – ${fmtIso(s.dom)}</td>
        <td style="text-align:right;">${_fmtPct(s.previsto_sem)}</td>
        <td style="text-align:right; font-weight:700;">${_fmtPct(s.previsto_ac)}</td>
        <td style="text-align:right;">${s.real_sem !== null ? _fmtPct(s.real_sem) : '—'}</td>
        <td style="text-align:right; font-weight:700;">${s.real_ac !== null ? _fmtPct(s.real_ac) : '—'}</td>
        <td style="text-align:right; font-weight:700; ${dc}">${s.desvio_ac !== null ? (s.desvio_ac>=0?'+':'')+s.desvio_ac.toFixed(2)+'%' : '—'}</td>
      </tr>`;
    }).join('');

    const hoje_br = hoje.toLocaleDateString('pt-BR');

    const html = `
      <div id="relExecDoc" style="font-family:Arial,sans-serif; font-size:12px; color:#111; max-width:900px; margin:0 auto; padding:20px;">
        <!-- Cabeçalho projeto -->
        <div style="border:2px solid #1d4ed8; border-radius:6px; padding:16px; margin-bottom:16px;">
          <div style="text-align:center; font-size:16px; font-weight:700; color:#1d4ed8; margin-bottom:12px;">RELATÓRIO EXECUTIVO SEMANAL</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px 20px; font-size:12px;">
            <div><b>Empresa:</b> <input id="re_empresa" class="input" style="width:100%; font-size:12px; margin-top:2px;" placeholder="Nome da empresa"></div>
            <div><b>Coordenador:</b> <input id="re_coord" class="input" style="width:100%; font-size:12px; margin-top:2px;" placeholder="Nome do coordenador"></div>
            <div><b>Planejador:</b> <input id="re_plan" class="input" style="width:100%; font-size:12px; margin-top:2px;" placeholder="Nome do planejador"></div>
            <div><b>TST Resp.:</b> <input id="re_tst" class="input" style="width:100%; font-size:12px; margin-top:2px;" placeholder="Responsável TST"></div>
            <div><b>Fiscalização:</b> <input id="re_fisc" class="input" style="width:100%; font-size:12px; margin-top:2px;" placeholder="Fiscalização"></div>
            <div><b>Unidade:</b> <input id="re_unidade" class="input" style="width:100%; font-size:12px; margin-top:2px;" placeholder="Unidade / Planta"></div>
            <div><b>Tema:</b> <input id="re_tema" class="input" style="width:100%; font-size:12px; margin-top:2px;" placeholder="Tema do projeto"></div>
            <div><b>PEM:</b> <input id="re_pem" class="input" style="width:100%; font-size:12px; margin-top:2px;" placeholder="N° PEM"></div>
            <div><b>Data de Envio:</b> <input id="re_data" class="input" style="width:100%; font-size:12px; margin-top:2px;" value="${hoje_br}"></div>
          </div>
        </div>

        <!-- Resumo Curva S -->
        <div style="border:1px solid #e5e7eb; border-radius:6px; padding:12px; margin-bottom:16px; background:#f8fafc;">
          <div style="font-weight:700; font-size:13px; margin-bottom:8px; color:#1e3a5f;">📈 RESUMO CURVA S — SEMANA ATUAL</div>
          <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px;">
            <div style="background:#fff; border:1px solid #e5e7eb; border-radius:4px; padding:8px; text-align:center;">
              <div style="font-size:10px; color:#6b7280;">Início Previsto</div>
              <div style="font-weight:700;">${_fmtDt(iniPrev)}</div>
            </div>
            <div style="background:#fff; border:1px solid #e5e7eb; border-radius:4px; padding:8px; text-align:center;">
              <div style="font-size:10px; color:#6b7280;">Término Previsto</div>
              <div style="font-weight:700;">${_fmtDt(fimPrev)}</div>
            </div>
            <div style="background:#fff; border:1px solid #e5e7eb; border-radius:4px; padding:8px; text-align:center;">
              <div style="font-size:10px; color:#6b7280;">Avanço Previsto (S+0)</div>
              <div style="font-weight:700;">${_fmtPct(prevAcS0)}</div>
            </div>
            <div style="background:#fff; border:1px solid #e5e7eb; border-radius:4px; padding:8px; text-align:center;">
              <div style="font-size:10px; color:#6b7280;">Início Real</div>
              <div style="font-weight:700;">${_fmtDt(iniReal)}</div>
            </div>
            <div style="background:#fff; border:1px solid #e5e7eb; border-radius:4px; padding:8px; text-align:center;">
              <div style="font-size:10px; color:#6b7280;">Término Real / Prev.</div>
              <div style="font-weight:700;">${_fmtDt(fimReal || fimPrev)}</div>
            </div>
            <div style="background:#fff; border:1px solid #e5e7eb; border-radius:4px; padding:8px; text-align:center;">
              <div style="font-size:10px; color:#6b7280;">Avanço Real (S+0)</div>
              <div style="font-weight:700; ${realAcS0 !== null ? (realAcS0 >= (prevAcS0||0) ? 'color:#16a34a;' : 'color:#dc2626;') : ''}">${_fmtPct(realAcS0)}</div>
            </div>
            <div style="background:#fff; border:1px solid #e5e7eb; border-radius:4px; padding:8px; text-align:center; grid-column:span 3;">
              <div style="font-size:10px; color:#6b7280;">Desvio Acumulado (S+0)</div>
              <div style="font-weight:700; font-size:15px; ${desvioS0 !== null ? (desvioS0>=0?'color:#16a34a;':'color:#dc2626;') : ''}">${desvioS0 !== null ? (desvioS0>=0?'+':'')+desvioS0.toFixed(2)+'%' : '—'}</div>
            </div>
          </div>
        </div>

        <!-- Tabela semanal -->
        <div style="margin-bottom:16px;">
          <div style="font-weight:700; font-size:13px; margin-bottom:8px; color:#1e3a5f;">📊 TABELA DE AVANÇO SEMANAL</div>
          <table style="width:100%; border-collapse:collapse; font-size:11px;">
            <thead><tr style="background:#1d4ed8; color:#fff;">
              <th style="padding:6px; text-align:center; border:1px solid #1e40af;">Sem.</th>
              <th style="padding:6px; text-align:center; border:1px solid #1e40af;">Período</th>
              <th style="padding:6px; text-align:right; border:1px solid #1e40af;">Prev. Sem.%</th>
              <th style="padding:6px; text-align:right; border:1px solid #1e40af;">Prev. Ac.%</th>
              <th style="padding:6px; text-align:right; border:1px solid #1e40af;">Real Sem.%</th>
              <th style="padding:6px; text-align:right; border:1px solid #1e40af;">Real Ac.%</th>
              <th style="padding:6px; text-align:right; border:1px solid #1e40af;">Desvio Ac.%</th>
            </tr></thead>
            <tbody>${tblRows}</tbody>
          </table>
        </div>

        <!-- Atividades S+0 -->
        <div style="margin-bottom:14px; border:1px solid #e5e7eb; border-radius:6px; padding:12px;">
          <div style="font-weight:700; font-size:13px; margin-bottom:8px; color:#1e3a5f;">✅ ATIVIDADES PROGRAMADAS — S+0 (${_semNom(s0Mon,s0Sun)})</div>
          <ul style="margin:0; padding-left:18px; line-height:1.7;">${_listaAtiv(ativS0)}</ul>
        </div>

        <!-- Atividades S+1 -->
        <div style="margin-bottom:14px; border:1px solid #e5e7eb; border-radius:6px; padding:12px;">
          <div style="font-weight:700; font-size:13px; margin-bottom:8px; color:#1e3a5f;">📅 ATIVIDADES PROGRAMADAS — S+1 (${_semNom(s1Mon,s1Sun)})</div>
          <ul style="margin:0; padding-left:18px; line-height:1.7;">${_listaAtiv(ativS1)}</ul>
        </div>

        <!-- Desvios e Plano de Ação -->
        <div style="margin-bottom:14px; border:1px solid #e5e7eb; border-radius:6px; padding:12px;">
          <div style="font-weight:700; font-size:13px; margin-bottom:8px; color:#1e3a5f;">⚠️ DESVIOS E PLANO DE AÇÃO</div>
          <textarea id="re_desvios" style="width:100%; height:100px; font-size:12px; font-family:Arial,sans-serif; border:1px solid #e5e7eb; border-radius:4px; padding:8px; resize:vertical;" placeholder="Descreva os desvios identificados e as ações corretivas previstas..."></textarea>
        </div>
      </div>`;

    showModal('📄 Relatório Executivo Semanal', `
      <div style="min-width:700px; max-width:960px;">
        <div style="display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; align-items:center;">
          <span style="font-size:13px; color:var(--text-muted); flex:1;">Preencha os campos e clique em Imprimir/PDF para exportar.</span>
          <button class="btn btn-primary btn-sm" onclick="window._imprimirRelatorioExec()">🖨️ Imprimir / Exportar PDF</button>
        </div>
        <div style="max-height:70vh; overflow-y:auto; border:1px solid var(--border-subtle); border-radius:8px; padding:4px;">
          ${html}
        </div>
      </div>`);
  }

  window._imprimirRelatorioExec = () => {
    const doc = document.getElementById('relExecDoc');
    if (!doc) return;
    // Collect form values and replace inputs with plain text for print
    const clone = doc.cloneNode(true);
    clone.querySelectorAll('input[id]').forEach(inp => {
      const orig = doc.querySelector(`#${inp.id}`);
      const span = document.createElement('span');
      span.style.fontWeight = '600';
      span.textContent = orig?.value || '—';
      inp.replaceWith(span);
    });
    clone.querySelectorAll('textarea[id]').forEach(ta => {
      const orig = doc.querySelector(`#${ta.id}`);
      const div = document.createElement('div');
      div.style.cssText = 'white-space:pre-wrap; font-size:12px; line-height:1.6; padding:4px 0;';
      div.textContent = orig?.value || '';
      ta.replaceWith(div);
    });
    const printArea = document.getElementById('relExecPrintArea');
    const content = document.getElementById('relExecContent');
    content.innerHTML = '';
    content.appendChild(clone);
    printArea.style.display = '';
    window.print();
    // Hide after print dialog closes
    setTimeout(() => { printArea.style.display = 'none'; content.innerHTML = ''; }, 1500);
  };

  return { init, secao, tab, filtrar, selecionarProjeto, novoProjetoModal, importarModal, exportar,
           salvarProgresso, salvarCampo, adicionarTarefa, recalcular, salvarEditor, deletarProjeto,
           relatorio, relatorioExecutivo, carregarCurvaSTable: _carregarCurvaSTable,
           carregarRelatorioExecutivoInline };
})();


// ══════════════════════════════════════════════════════════════
// CADASTROS BASE — Equipamentos, Veículos, Terceiros, Efetivo
// ══════════════════════════════════════════════════════════════

const cad = (() => {
  let _tabAtiva = 'equipamentos';
  let _searchTimer = null;

  async function init() {
    await _carregar(_tabAtiva);
  }

  function tab(nome) {
    _tabAtiva = nome;
    document.querySelectorAll('#cadTabs .plan-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === nome));
    ['equipamentos','veiculos','terceiros','efetivo'].forEach(t => {
      const el = document.getElementById(`cadTab${t.charAt(0).toUpperCase()+t.slice(1)}`);
      if (el) el.style.display = t === nome ? '' : 'none';
    });
    _carregar(nome);
  }

  function buscar(tipo) {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => _carregar(_tabAtiva), 300);
  }

  async function _carregar(tipo) {
    if (tipo === 'equipamentos') await _carregarEq();
    else if (tipo === 'veiculos')    await _carregarVeic();
    else if (tipo === 'terceiros')   await _carregarTerc();
    else if (tipo === 'efetivo')     await _carregarEfet();
  }

  // ── Equipamentos ──────────────────────────
  async function _carregarEq() {
    const q = document.getElementById('cadEqSearch')?.value || '';
    const el = document.getElementById('cadEqLista');
    try {
      const d = await apiCall(`/api/equipamentos?q=${encodeURIComponent(q)}`);
      const items = d.equipamentos || [];
      if (!items.length) { el.innerHTML = '<div class="empty-state" style="padding:32px;"><div class="empty-state-icon">🔧</div><div class="empty-state-title">Nenhum equipamento cadastrado</div></div>'; return; }
      const statusBadge = s => ({ativo:'<span class="badge badge-success">Ativo</span>', inativo:'<span class="badge">Inativo</span>', manutencao:'<span class="badge badge-amber">Manutenção</span>'}[s] || `<span class="badge">${s}</span>`);
      el.innerHTML = `<div class="table-wrapper"><table class="table">
        <thead><tr><th>Nome</th><th>Código / Placa</th><th>Status</th><th style="width:90px;"></th></tr></thead>
        <tbody>${items.map(e => `<tr>
          <td style="font-weight:600;">${escapeHtml(e.nome)}</td>
          <td style="font-family:'JetBrains Mono'; font-size:12px;">${escapeHtml(e.codigo||'—')}</td>
          <td>${statusBadge(e.status)}</td>
          <td><button class="btn btn-ghost btn-sm" onclick="cad.editarModal('eq',${JSON.stringify(JSON.stringify(e))})">Editar</button>
              <button class="btn btn-ghost btn-sm" style="color:var(--error-500);" onclick="cad.deletar('eq',${e.id})">Apagar</button></td>
        </tr>`).join('')}</tbody></table></div>`;
    } catch(e) { el.innerHTML = `<p style="color:var(--error-500); padding:16px;">Erro: ${escapeHtml(e.message)}</p>`; }
  }

  function novoModal(tipo) {
    const forms = {
      eq: `<div style="display:flex;flex-direction:column;gap:12px;padding:4px 0;">
        <div><label class="input-label">Nome *</label><input class="input" id="cadFNome" style="width:100%;" autofocus></div>
        <div><label class="input-label">Código / Placa</label><input class="input" id="cadFCodigo" style="width:100%;"></div>
        <div><label class="input-label">Status</label><select class="input" id="cadFStatus" style="width:100%;">
          <option value="ativo">Ativo</option><option value="inativo">Inativo</option><option value="manutencao">Manutenção</option>
        </select></div>
        <button class="btn btn-primary" onclick="cad._salvar('eq',null)" style="width:100%;margin-top:4px;">Salvar</button></div>`,
      veic: `<div style="display:flex;flex-direction:column;gap:12px;padding:4px 0;">
        <div><label class="input-label">Placa *</label><input class="input" id="cadFPlaca" style="width:100%;text-transform:uppercase;" autofocus></div>
        <div><label class="input-label">Modelo</label><input class="input" id="cadFModelo" style="width:100%;"></div>
        <div><label class="input-label">Empresa</label><input class="input" id="cadFEmpresa" style="width:100%;"></div>
        <button class="btn btn-primary" onclick="cad._salvar('veic',null)" style="width:100%;margin-top:4px;">Salvar</button></div>`,
      terc: `<div style="display:flex;flex-direction:column;gap:12px;padding:4px 0;">
        <div><label class="input-label">Nome / Razão Social *</label><input class="input" id="cadFNome" style="width:100%;" autofocus></div>
        <div><label class="input-label">CPF / CNPJ</label><input class="input" id="cadFCpf" placeholder="Somente números" style="width:100%;"></div>
        <div><label class="input-label">Empresa</label><input class="input" id="cadFEmpresa" style="width:100%;"></div>
        <div><label class="input-label">Placa (veículo)</label><input class="input" id="cadFPlaca" style="width:100%;text-transform:uppercase;"></div>
        <button class="btn btn-primary" onclick="cad._salvar('terc',null)" style="width:100%;margin-top:4px;">Salvar</button></div>`,
    };
    const titles = { eq:'➕ Novo Equipamento', veic:'➕ Novo Veículo', terc:'➕ Novo Terceiro' };
    showModal(titles[tipo], forms[tipo]);
  }

  function editarModal(tipo, jsonStr) {
    const obj = JSON.parse(jsonStr);
    const forms = {
      eq: `<div style="display:flex;flex-direction:column;gap:12px;padding:4px 0;">
        <div><label class="input-label">Nome *</label><input class="input" id="cadFNome" value="${escapeHtml(obj.nome||'')}" style="width:100%;"></div>
        <div><label class="input-label">Código / Placa</label><input class="input" id="cadFCodigo" value="${escapeHtml(obj.codigo||'')}" style="width:100%;"></div>
        <div><label class="input-label">Status</label><select class="input" id="cadFStatus" style="width:100%;">
          <option value="ativo" ${obj.status==='ativo'?'selected':''}>Ativo</option>
          <option value="inativo" ${obj.status==='inativo'?'selected':''}>Inativo</option>
          <option value="manutencao" ${obj.status==='manutencao'?'selected':''}>Manutenção</option>
        </select></div>
        <button class="btn btn-primary" onclick="cad._salvar('eq',${obj.id})" style="width:100%;margin-top:4px;">Salvar</button></div>`,
      veic: `<div style="display:flex;flex-direction:column;gap:12px;padding:4px 0;">
        <div><label class="input-label">Placa *</label><input class="input" id="cadFPlaca" value="${escapeHtml(obj.placa||'')}" style="width:100%;text-transform:uppercase;"></div>
        <div><label class="input-label">Modelo</label><input class="input" id="cadFModelo" value="${escapeHtml(obj.modelo||'')}" style="width:100%;"></div>
        <div><label class="input-label">Empresa</label><input class="input" id="cadFEmpresa" value="${escapeHtml(obj.empresa||'')}" style="width:100%;"></div>
        <button class="btn btn-primary" onclick="cad._salvar('veic',${obj.id})" style="width:100%;margin-top:4px;">Salvar</button></div>`,
      terc: `<div style="display:flex;flex-direction:column;gap:12px;padding:4px 0;">
        <div><label class="input-label">Nome / Razão Social *</label><input class="input" id="cadFNome" value="${escapeHtml(obj.nome||'')}" style="width:100%;"></div>
        <div><label class="input-label">CPF / CNPJ</label><input class="input" id="cadFCpf" value="${escapeHtml(obj.cpf||'')}" style="width:100%;"></div>
        <div><label class="input-label">Empresa</label><input class="input" id="cadFEmpresa" value="${escapeHtml(obj.empresa||'')}" style="width:100%;"></div>
        <div><label class="input-label">Placa</label><input class="input" id="cadFPlaca" value="${escapeHtml(obj.placa||'')}" style="width:100%;text-transform:uppercase;"></div>
        <button class="btn btn-primary" onclick="cad._salvar('terc',${obj.id})" style="width:100%;margin-top:4px;">Salvar</button></div>`,
    };
    const titles = { eq:'✏️ Editar Equipamento', veic:'✏️ Editar Veículo', terc:'✏️ Editar Terceiro' };
    showModal(titles[tipo], forms[tipo]);
  }

  async function _salvar(tipo, id) {
    const v = (sid) => document.getElementById(sid)?.value?.trim() || '';
    let payload, endpoint, method;

    if (tipo === 'eq') {
      const nome = v('cadFNome');
      if (!nome) { showToast('Nome obrigatório', 'warning'); return; }
      payload = { nome, codigo: v('cadFCodigo'), status: v('cadFStatus') || 'ativo' };
      endpoint = id ? `/api/equipamentos/${id}` : '/api/equipamentos';
      method = id ? 'PUT' : 'POST';
    } else if (tipo === 'veic') {
      const placa = v('cadFPlaca');
      if (!placa) { showToast('Placa obrigatória', 'warning'); return; }
      payload = { placa, modelo: v('cadFModelo'), empresa: v('cadFEmpresa') };
      endpoint = id ? `/api/veiculos/${id}` : '/api/veiculos';
      method = id ? 'PUT' : 'POST';
    } else if (tipo === 'terc') {
      const nome = v('cadFNome');
      if (!nome) { showToast('Nome obrigatório', 'warning'); return; }
      payload = { nome, cpf: v('cadFCpf'), empresa: v('cadFEmpresa'), placa: v('cadFPlaca') };
      endpoint = id ? `/api/terceiros/${id}` : '/api/terceiros';
      method = id ? 'PUT' : 'POST';
    }

    try {
      await apiCall(endpoint, { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      closeModal();
      showToast('Salvo com sucesso!', 'success');
      await _carregar(_tabAtiva);
    } catch(e) { showToast(`Erro: ${e.message}`, 'error'); }
  }

  // expose _salvar as public for onclick
  const salvar = _salvar;

  async function deletar(tipo, id) {
    if (!confirm('Apagar este registro? Esta ação não pode ser desfeita.')) return;
    const endpoints = { eq: `/api/equipamentos/${id}`, veic: `/api/veiculos/${id}`, terc: `/api/terceiros/${id}` };
    try {
      await apiCall(endpoints[tipo], { method: 'DELETE' });
      showToast('Registro apagado.', 'success');
      await _carregar(_tabAtiva);
    } catch(e) { showToast(`Erro: ${e.message}`, 'error'); }
  }

  // ── Veículos ──────────────────────────────
  async function _carregarVeic() {
    const q = document.getElementById('cadVeicSearch')?.value || '';
    const el = document.getElementById('cadVeicLista');
    try {
      const d = await apiCall(`/api/veiculos?q=${encodeURIComponent(q)}`);
      const items = d.veiculos || [];
      if (!items.length) { el.innerHTML = '<div class="empty-state" style="padding:32px;"><div class="empty-state-icon">🚗</div><div class="empty-state-title">Nenhum veículo cadastrado</div></div>'; return; }
      el.innerHTML = `<div class="table-wrapper"><table class="table">
        <thead><tr><th>Placa</th><th>Modelo</th><th>Empresa</th><th style="width:90px;"></th></tr></thead>
        <tbody>${items.map(v => `<tr>
          <td style="font-weight:700; font-family:'JetBrains Mono'; font-size:13px;">${escapeHtml(v.placa)}</td>
          <td>${escapeHtml(v.modelo||'—')}</td>
          <td style="font-size:12px; color:var(--text-secondary);">${escapeHtml(v.empresa||'—')}</td>
          <td><button class="btn btn-ghost btn-sm" onclick="cad.editarModal('veic',${JSON.stringify(JSON.stringify(v))})">Editar</button>
              <button class="btn btn-ghost btn-sm" style="color:var(--error-500);" onclick="cad.deletar('veic',${v.id})">Apagar</button></td>
        </tr>`).join('')}</tbody></table></div>`;
    } catch(e) { el.innerHTML = `<p style="color:var(--error-500);padding:16px;">${escapeHtml(e.message)}</p>`; }
  }

  // ── Terceiros ─────────────────────────────
  async function _carregarTerc() {
    const q = document.getElementById('cadTercSearch')?.value || '';
    const el = document.getElementById('cadTercLista');
    try {
      const d = await apiCall(`/api/terceiros?q=${encodeURIComponent(q)}`);
      const items = d.terceiros || [];
      if (!items.length) { el.innerHTML = '<div class="empty-state" style="padding:32px;"><div class="empty-state-icon">🤝</div><div class="empty-state-title">Nenhum terceiro cadastrado</div></div>'; return; }
      el.innerHTML = `<div class="table-wrapper"><table class="table">
        <thead><tr><th>Nome / Razão Social</th><th>CPF / CNPJ</th><th>Empresa</th><th>Placa</th><th style="width:90px;"></th></tr></thead>
        <tbody>${items.map(t => `<tr>
          <td style="font-weight:600;">${escapeHtml(t.nome)}</td>
          <td style="font-family:'JetBrains Mono'; font-size:12px;">${t.cpf ? formatCpf(t.cpf) : '—'}</td>
          <td style="font-size:12px;">${escapeHtml(t.empresa||'—')}</td>
          <td style="font-family:'JetBrains Mono'; font-size:12px;">${escapeHtml(t.placa||'—')}</td>
          <td><button class="btn btn-ghost btn-sm" onclick="cad.editarModal('terc',${JSON.stringify(JSON.stringify(t))})">Editar</button>
              <button class="btn btn-ghost btn-sm" style="color:var(--error-500);" onclick="cad.deletar('terc',${t.id})">Apagar</button></td>
        </tr>`).join('')}</tbody></table></div>`;
    } catch(e) { el.innerHTML = `<p style="color:var(--error-500);padding:16px;">${escapeHtml(e.message)}</p>`; }
  }

  // ── Efetivo ───────────────────────────────
  async function _carregarEfet() {
    const q = document.getElementById('cadEfetSearch')?.value || '';
    const el = document.getElementById('cadEfetLista');
    try {
      const d = await apiCall(`/api/efetivo/colaboradores?busca=${encodeURIComponent(q)}&per_page=200`);
      const items = d.colaboradores || [];
      const countEl = document.getElementById('cadEfetCount');
      if (countEl) countEl.textContent = `${d.total || items.length} colaboradores cadastrados`;
      if (!items.length) { el.innerHTML = '<div class="empty-state" style="padding:32px;"><div class="empty-state-icon">👷</div><div class="empty-state-title">Nenhum colaborador cadastrado</div></div>'; return; }
      el.innerHTML = `<div class="table-wrapper"><table class="table">
        <thead><tr><th>Nome</th><th>CPF</th><th>Matrícula</th><th>Cargo</th><th>Categoria</th><th>Empresa</th></tr></thead>
        <tbody>${items.map(c => `<tr>
          <td style="font-weight:600;">${escapeHtml(c.nome)}</td>
          <td style="font-family:'JetBrains Mono'; font-size:12px;">${c.cpf ? formatCpf(c.cpf) : '—'}</td>
          <td style="font-family:'JetBrains Mono'; font-size:12px;">${escapeHtml(c.matricula||'—')}</td>
          <td style="font-size:12px;">${escapeHtml(c.cargo||'—')}</td>
          <td><span class="badge badge-${c.categoria==='MOD'?'success':'blue'}">${escapeHtml(c.categoria||'—')}</span></td>
          <td style="font-size:12px;">${escapeHtml(c.empresa||'—')}</td>
        </tr>`).join('')}</tbody></table></div>`;
    } catch(e) { el.innerHTML = `<p style="color:var(--error-500);padding:16px;">${escapeHtml(e.message)}</p>`; }
  }

  return { init, tab, buscar, novoModal, editarModal, _salvar, deletar };
})();


// ══════════════════════════════════════════════════════════════
// RELATÓRIO DIÁRIO DE OBRA (RDO)
// ══════════════════════════════════════════════════════════════

const rdoObra = (() => {
  let _dadosAtivos = null;
  let _ptsExtras = []; // PTs adicionadas manualmente pelo usuário

  async function init() {
    // Set today's date by default
    const inp = document.getElementById('rdoDataInput');
    if (inp && !inp.value) {
      inp.value = new Date().toISOString().slice(0, 10);
    }
    // Load projects
    try {
      const d = await apiCall('/api/projetos');
      const sel = document.getElementById('rdoProjetoSelect');
      if (sel) {
        sel.innerHTML = '<option value="">— Sem projeto vinculado —</option>';
        (d.projetos || []).forEach(p => {
          const o = document.createElement('option');
          o.value = p.id; o.textContent = p.nome; sel.appendChild(o);
        });
      }
    } catch(e) { /* silencioso */ }
  }

  async function buscarDados() {
    const data = document.getElementById('rdoDataInput')?.value;
    const projetoId = document.getElementById('rdoProjetoSelect')?.value || '';
    if (!data) { showToast('Selecione uma data para o RDO.', 'warning'); return; }

    showLoading('Buscando dados do RDO...');
    try {
      const url = `/api/rdo-obra/dados?data=${data}${projetoId ? '&projeto_id='+projetoId : ''}`;
      const d = await apiCall(url);
      _dadosAtivos = d;
      _ptsExtras = [];
      _renderDados(d);
    } catch(e) {
      showToast(`Erro ao buscar dados: ${e.message}`, 'error');
    } finally {
      hideLoading();
    }
  }

  function _renderDados(d) {
    // Show body
    document.getElementById('rdoObraBody').style.display = '';
    document.getElementById('rdoObraEmpty').style.display = 'none';

    // Horários
    const toTime = v => { if (!v) return ''; const p = v.split(':'); return `${p[0].padStart(2,'0')}:${(p[1]||'00').padStart(2,'0')}`; };
    const setV = (id, v) => { const el = document.getElementById(id); if(el) el.value = v||''; };
    setV('rdoInicioAtividade', toTime(d.horarios?.inicio_atividade));
    setV('rdoFimAtividade', toTime(d.horarios?.fim_atividade));
    setV('rdoInicioIntervalo', d.horarios?.inicio_intervalo || '12:00');
    setV('rdoFimIntervalo', d.horarios?.fim_intervalo || '13:00');

    // Clima
    const setClima = (id, val) => {
      const sel = document.getElementById(id); if (!sel) return;
      ['Bom','Nublado','Chuvoso'].forEach((v,i) => sel.options[i].selected = (v === val));
    };
    if (d.clima) {
      setClima('rdoClimaManha', d.clima.manha || 'Bom');
      setClima('rdoClimaTarde', d.clima.tarde || 'Bom');
      setClima('rdoClimaNoite', d.clima.noite || 'Bom');
      setV('rdoPrecipitacao', d.clima.precipitacao || '0');
    }
    const climaLoading = document.getElementById('rdoClimaLoading');
    if (climaLoading) climaLoading.textContent = d.clima?.manha ? 'Dados reais carregados ✓' : 'Sem dados para esta data';

    // Efetivo
    const efetivo = d.efetivo || [];
    const efetivoCount = document.getElementById('rdoEfetivoCount');
    if (efetivoCount) efetivoCount.textContent = `${efetivo.length} colaboradores (MOD + MOI)`;
    const efetivoTable = document.getElementById('rdoEfetivoTable');
    if (efetivoTable) {
      if (!efetivo.length) {
        efetivoTable.innerHTML = '<div class="empty-state" style="padding:24px;"><div class="empty-state-icon">👷</div><div class="empty-state-title">Nenhum efetivo encontrado no Histórico PTe para esta data</div></div>';
      } else {
        const rows = efetivo.map((c,i) => `<tr>
          <td style="color:var(--text-muted);font-size:12px;">${i+1}</td>
          <td style="font-weight:600;">${escapeHtml(c.nome||'')}</td>
          <td style="font-family:'JetBrains Mono';font-size:12px;">${escapeHtml(c.cpf||'—')}</td>
          <td style="font-size:12px;">${escapeHtml(c.cargo||'—')}</td>
          <td><span class="badge badge-${c.categoria==='MOI'?'blue':'success'}">${escapeHtml(c.categoria||'MOD')}</span></td>
        </tr>`).join('');
        efetivoTable.innerHTML = `<div class="table-wrapper"><table class="table">
          <thead><tr><th>#</th><th>Nome</th><th>CPF</th><th>Cargo</th><th>Cat.</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`;
      }
    }

    // Atividades (do cronograma)
    const atividadesContainer = document.getElementById('rdoAtividadesContainer');
    if (atividadesContainer) {
      const atividades = (d.atividades || []).filter(t => (t.nivel||0) >= 1);
      if (!atividades.length) {
        atividadesContainer.innerHTML = '<div style="color:var(--text-muted); font-size:13px; padding:8px 0;">Nenhuma atividade do cronograma programada para esta data. Use o campo abaixo para registrar atividades.</div>';
      } else {
        atividadesContainer.innerHTML = atividades.map((t, i) => {
          const titulo = `${t.codigo ? t.codigo + ' — ' : ''}${t.nome}${t.responsavel ? ' (' + t.responsavel + ')' : ''}`;
          return `<div style="background:var(--bg-primary); border:1px solid var(--border-subtle); border-radius:8px; padding:12px;">
            <div style="font-weight:700; font-size:13px; color:var(--text-primary); margin-bottom:6px;">${escapeHtml(titulo)}</div>
            <textarea class="input" id="rdoAtivDesc_${i}" rows="2" placeholder="Descreva o que foi executado nesta atividade..." style="width:100%; resize:vertical; font-size:13px; line-height:1.5;"></textarea>
          </div>`;
        }).join('');
        // Store activities reference
        atividadesContainer.dataset.count = atividades.length;
        atividadesContainer._atividades = atividades;
      }
    }

    // Permissões de Trabalho
    _renderPermissoes(d.permissoes || []);
  }

  function _renderPermissoes(permissoes) {
    const container = document.getElementById('rdoPermissoesContainer');
    if (!container) return;
    const todas = [...permissoes, ..._ptsExtras];
    if (!todas.length) {
      container.innerHTML = '<div class="empty-state" style="padding:24px;"><div class="empty-state-icon">🛡️</div><div class="empty-state-title">Nenhuma PT extraída para esta data</div></div>';
      return;
    }
    container.innerHTML = todas.map((pt, i) => `
      <div style="display:flex; gap:12px; align-items:flex-start; padding:10px 12px; background:var(--bg-primary); border:1px solid var(--border-subtle); border-radius:8px; margin-bottom:8px;">
        <div style="flex-shrink:0; background:var(--primary-100,#dbeafe); color:var(--primary-700); font-weight:700; font-size:12px; padding:4px 8px; border-radius:6px; font-family:'JetBrains Mono',monospace;">
          PT ${escapeHtml(pt.numero_pt || '?')}
        </div>
        <div style="flex:1; font-size:13px; color:var(--text-secondary); line-height:1.5;">${escapeHtml(pt.descricao || '')}</div>
      </div>
    `).join('');
  }

  function adicionarPtManual() {
    const num = document.getElementById('rdoPtNumeroManual')?.value.trim() || '';
    const desc = document.getElementById('rdoPtDescManual')?.value.trim() || '';
    if (!num && !desc) { showToast('Preencha o número ou a descrição da PT.', 'warning'); return; }
    _ptsExtras.push({ numero_pt: num, descricao: desc });
    const pts = _dadosAtivos?.permissoes || [];
    _renderPermissoes(pts);
    const n = document.getElementById('rdoPtNumeroManual'); if(n) n.value = '';
    const d2 = document.getElementById('rdoPtDescManual'); if(d2) d2.value = '';
    showToast('PT adicionada.', 'success');
  }

  function copiarCPFs() {
    const efetivo = _dadosAtivos?.efetivo || [];
    const cpfs = efetivo.map(c => c.cpf).filter(Boolean);
    if (!cpfs.length) { showToast('Nenhum CPF disponível para esta data.', 'warning'); return; }
    navigator.clipboard.writeText(cpfs.join('\n'))
      .then(() => showToast(`${cpfs.length} CPFs copiados!`, 'success'))
      .catch(() => showToast('Erro ao copiar', 'error'));
  }

  function gerarTexto() {
    if (!_dadosAtivos) { showToast('Busque os dados do RDO primeiro.', 'warning'); return; }

    const d = _dadosAtivos;
    const dataBr = d.data_br || '';
    const getV = id => document.getElementById(id)?.value || '';

    const inicioAtiv = getV('rdoInicioAtividade');
    const fimAtiv = getV('rdoFimAtividade');
    const inicioInt = getV('rdoInicioIntervalo');
    const fimInt = getV('rdoFimIntervalo');
    const climaManha = getV('rdoClimaManha');
    const climaTarde = getV('rdoClimaTarde');
    const climaNoite = getV('rdoClimaNoite');
    const precipitacao = getV('rdoPrecipitacao');
    const outrasAtiv = getV('rdoOutrasAtividades');

    let texto = `RELATÓRIO DIÁRIO DE OBRA (RDO)\nData: ${dataBr}\n\n`;

    texto += `HORÁRIOS\n`;
    texto += `Início de Atividade: ${inicioAtiv || '—'}\n`;
    texto += `Fim de Atividade: ${fimAtiv || '—'}\n`;
    texto += `Início de Intervalo: ${inicioInt || '—'}\n`;
    texto += `Fim de Intervalo: ${fimInt || '—'}\n\n`;

    texto += `CLIMA\n`;
    texto += `Manhã: ${climaManha}\n`;
    texto += `Tarde: ${climaTarde}\n`;
    texto += `Noite: ${climaNoite}\n`;
    texto += `Precipitação (mm): ${precipitacao || '0'}\n\n`;

    texto += `EFETIVO\n`;
    const efetivo = d.efetivo || [];
    if (efetivo.length) {
      efetivo.forEach((c, i) => {
        texto += `${i+1}. ${c.nome} — CPF: ${c.cpf || '—'} — ${c.cargo || ''} [${c.categoria || 'MOD'}]\n`;
      });
    } else {
      texto += 'Sem efetivo registrado para esta data.\n';
    }
    texto += '\n';

    // Atividades do cronograma
    const atividadesContainer = document.getElementById('rdoAtividadesContainer');
    const atividades = (d.atividades || []).filter(t => (t.nivel||0) >= 1);
    texto += `1 - Serviços Executados\n`;
    if (atividades.length) {
      atividades.forEach((t, i) => {
        const titulo = `${t.codigo || ''} ${t.nome}`.trim();
        const desc = document.getElementById(`rdoAtivDesc_${i}`)?.value?.trim() || '';
        texto += `${titulo}\n`;
        if (desc) texto += `${desc}\n`;
        texto += '\n';
      });
    }

    if (outrasAtiv) {
      texto += `2 - Outras Atividades\n${outrasAtiv}\n\n`;
    }

    // Permissões de Trabalho
    const todasPts = [...(d.permissoes || []), ..._ptsExtras];
    if (todasPts.length) {
      texto += `3 - PERMISSÕES DE TRABALHO\n`;
      todasPts.forEach(pt => {
        texto += `PT ${pt.numero_pt || '?'}`;
        if (pt.descricao) texto += ` - ${pt.descricao}`;
        texto += '\n';
      });
    }

    const textarea = document.getElementById('rdoTextoFinal');
    if (textarea) {
      textarea.value = texto.trim();
      textarea.style.display = '';
    }
    const btnCopiar = document.getElementById('btnRdoCopiarTexto');
    if (btnCopiar) btnCopiar.disabled = false;
    showToast('Texto do RDO gerado!', 'success');
  }

  function copiarTexto() {
    const texto = document.getElementById('rdoTextoFinal')?.value || '';
    if (!texto) { showToast('Gere o texto primeiro.', 'warning'); return; }
    navigator.clipboard.writeText(texto)
      .then(() => showToast('Texto copiado!', 'success'))
      .catch(() => showToast('Erro ao copiar', 'error'));
  }

  function limpar() {
    _dadosAtivos = null;
    _ptsExtras = [];
    document.getElementById('rdoObraBody').style.display = 'none';
    document.getElementById('rdoObraEmpty').style.display = '';
    const inp = document.getElementById('rdoDataInput'); if(inp) inp.value = '';
    const txt = document.getElementById('rdoTextoFinal'); if(txt) { txt.value=''; txt.style.display='none'; }
    const btn = document.getElementById('btnRdoCopiarTexto'); if(btn) btn.disabled=true;
    showToast('RDO limpo.', 'info');
  }

  return { init, buscarDados, copiarCPFs, adicionarPtManual, gerarTexto, copiarTexto, limpar };
})();
