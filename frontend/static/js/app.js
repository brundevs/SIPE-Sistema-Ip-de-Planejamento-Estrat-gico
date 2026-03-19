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
    rdo: ['Leitura PTE / Cesla', 'Extração de colaboradores MOD em PDFs'],
    moi: ['Gestão de MOI', 'Mão de obra indireta cadastrada manualmente'],
    clima: ['Clima', 'Condições meteorológicas em tempo real'],
    historico: ['Histórico', 'Processamentos anteriores e logs do sistema'],
  };

  const [title, subtitle] = titles[page] || ['', ''];
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('pageSubtitle').textContent = subtitle;

  // Load page data
  if (page === 'dashboard') loadDashboard();
  if (page === 'efetivo') loadColaboradores();
  if (page === 'clima') loadClima();
  if (page === 'historico') { loadHistorico(); }

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

    // Logs removed from dashboard
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
              <th>Matrícula</th>
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
                <td><span style="font-family: 'JetBrains Mono', monospace; font-size: 12px;">${escapeHtml(c.matricula || '—')}</span></td>
                <td>${escapeHtml(c.cargo || '—')}</td>
                <td>${escapeHtml(c.setor || '—')}</td>
                <td>
                  <button class="badge badge-${c.categoria === 'MOI' ? 'info' : 'success'}" 
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

function switchRdoTab(tab) {
  document.querySelectorAll('.rdo-tab-content').forEach(t => t.style.display = 'none');
  document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));

  const tabMap = { auto: 'rdoTabAuto', review: 'rdoTabReview', nomatch: 'rdoTabNomatch' };
  document.getElementById(tabMap[tab]).style.display = 'block';
  event.target.classList.add('active');
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
          const key = `${dataDoc}|${res.inicio || ''}|${res.fim || ''}`;
          if (!pteAcumulado[key]) pteAcumulado[key] = [];

          // Adicionar evitando duplicatas por nome+cpf
          for (const colab of (res.colaboradores || [])) {
            const exists = pteAcumulado[key].some(c => c.nome === colab.nome && c.cpf === colab.cpf);
            if (!exists) { pteAcumulado[key].push(colab); totCols++; }
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
                <th>Matrícula</th>
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
                  <td><span style="font-family:'JetBrains Mono',monospace;font-size:12px;">${escapeHtml(c.matricula || '—')}</span></td>
                  <td style="font-size:13px;">${escapeHtml(c.cargo || '—')}</td>
                  <td><span class="badge badge-${c.categoria === 'MOI' ? 'info' : 'success'}">${escapeHtml(c.categoria || 'MOD')}</span></td>
                  <td>
                    <button class="btn btn-ghost btn-sm" onclick="removerColabPte('${escapeHtml(dt)}', ${i})" title="Remover dessa lista">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                    </button>
                  </td>
                </tr>
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
      body: JSON.stringify({ resultados: pteAcumulado })
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
  document.getElementById('pteGroupsContainer').innerHTML = '';
  document.getElementById('pteResults').style.display = 'none';
  document.getElementById('pteEmptyState').style.display = 'block';
  document.getElementById('pteUploadQueue').style.display = 'none';
  document.getElementById('pteUploadList').innerHTML = '';
  showToast('Resultados limpos.', 'info');
}

// ── Gestão de MOI ─────────────────────────────────────────
let moiLista = []; // [{nome, cpf, matricula, cargo, origem}]
let moiSugestoesCache = [];
let moiSearchTimer = null;

function adicionarMoiManual() {
  const input = document.getElementById('moiNomeManual');
  const nome = input.value.trim();
  if (!nome) { input.focus(); return; }

  const jaExiste = moiLista.some(m => m.nome.toLowerCase() === nome.toLowerCase());
  if (jaExiste) { showToast('Colaborador já adicionado na lista MOI.', 'warning'); return; }

  moiLista.push({ nome, cpf: '', matricula: '', cargo: '', origem: 'Manual' });
  input.value = '';
  renderMoiTable();
  showToast(`"${nome}" adicionado como MOI.`, 'success');
}

async function buscarParaMoi(query) {
  const sugsEl = document.getElementById('moiSugestoes');
  clearTimeout(moiSearchTimer);

  if (!query || query.length < 2) {
    sugsEl.style.display = 'none';
    return;
  }

  moiSearchTimer = setTimeout(async () => {
    try {
      const data = await apiCall(`/api/efetivo/colaboradores?busca=${encodeURIComponent(query)}&per_page=8`);
      moiSugestoesCache = data.colaboradores || [];

      if (!moiSugestoesCache.length) {
        sugsEl.innerHTML = '<div style="padding:10px 14px;color:var(--text-muted);font-size:13px;">Nenhum resultado encontrado.</div>';
      } else {
        sugsEl.innerHTML = moiSugestoesCache.map((c, i) => `
          <div
            style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border-subtle);display:flex;gap:10px;align-items:center;"
            onmouseover="this.style.background='var(--bg-hover)'"
            onmouseout="this.style.background='transparent'"
            onclick="selecionarMoiDaBase(${i})"
          >
            <div style="flex:1;">
              <div style="font-weight:600;font-size:13px;">${escapeHtml(c.nome)}</div>
              <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(c.cpf || '')} ${c.cargo ? '· ' + escapeHtml(c.cargo) : ''}</div>
            </div>
          </div>
        `).join('');
      }
      sugsEl.style.display = 'block';
    } catch (e) {
      console.error(e);
    }
  }, 280);
}

function selecionarMoiDaBase(idx) {
  const colab = moiSugestoesCache[idx];
  if (!colab) return;

  const jaExiste = moiLista.some(m => m.nome === colab.nome);
  if (jaExiste) { showToast('Colaborador já adicionado na lista MOI.', 'warning'); return; }

  moiLista.push({
    nome: colab.nome,
    cpf: colab.cpf || '',
    matricula: colab.matricula || '',
    cargo: colab.cargo || '',
    origem: 'Base'
  });

  document.getElementById('moiBuscaBase').value = '';
  document.getElementById('moiSugestoes').style.display = 'none';
  moiSugestoesCache = [];
  renderMoiTable();
  showToast(`"${colab.nome}" adicionado como MOI.`, 'success');
}

function selecionarPrimeiroMoi() {
  if (moiSugestoesCache.length > 0) {
    selecionarMoiDaBase(0);
  } else {
    adicionarMoiManual();
  }
}

function removerMoi(idx) {
  const nome = moiLista[idx] ? moiLista[idx].nome : '';
  moiLista.splice(idx, 1);
  renderMoiTable();
  showToast(`"${nome}" removido da lista MOI.`, 'info');
}

function renderMoiTable() {
  const tbody = document.getElementById('moiTbody');
  const wrapperEl = document.getElementById('moiTableWrapper');
  const emptyEl = document.getElementById('moiEmptyState');

  if (!moiLista.length) {
    wrapperEl.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }

  wrapperEl.style.display = 'block';
  emptyEl.style.display = 'none';

  tbody.innerHTML = moiLista.map((m, i) => `
    <tr>
      <td style="color:var(--text-muted);font-size:12px;">${i + 1}</td>
      <td style="font-weight:600;">${escapeHtml(m.nome)}</td>
      <td><span style="font-family:'JetBrains Mono',monospace;font-size:12px;">${escapeHtml(m.cpf || '—')}</span></td>
      <td><span style="font-family:'JetBrains Mono',monospace;font-size:12px;">${escapeHtml(m.matricula || '—')}</span></td>
      <td style="font-size:13px;">${escapeHtml(m.cargo || '—')}</td>
      <td><span class="badge badge-${m.origem === 'Base' ? 'success' : 'info'}">${escapeHtml(m.origem)}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="removerMoi(${i})" title="Remover">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
        </button>
      </td>
    </tr>
  `).join('');
}

function copiarCpfsMoi() {
  const cpfs = moiLista.map(m => m.cpf).filter(Boolean);
  if (!cpfs.length) { showToast('Nenhum CPF disponível na lista MOI.', 'warning'); return; }
  navigator.clipboard.writeText(cpfs.join('\n'))
    .then(() => showToast(`${cpfs.length} CPFs MOI copiados!`, 'success'))
    .catch(() => showToast('Erro ao copiar', 'error'));
}

function limparMoi() {
  if (moiLista.length && !confirm('Limpar toda a lista de MOI?')) return;
  moiLista = [];
  renderMoiTable();
  showToast('Lista MOI limpa.', 'info');
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

    if (data.processamentos && data.processamentos.length > 0) {
      histProcessamentos_cache = data.processamentos;
      container.innerHTML = `
        <div class="table-wrapper">
          <table class="table">
            <thead>
              <tr>
                <th>Arquivo</th>
                <th>Data</th>
                <th>Extraídos</th>
                <th>Auto</th>
                <th>Revisão</th>
                <th>Sem Match</th>
                <th>Status</th>
                <th style="width:60px;text-align:center;">Ação</th>
              </tr>
            </thead>
            <tbody>
              ${data.processamentos.map(p => `
                <tr id="hist-row-${p.id}">
                  <td style="font-weight: 600;">${escapeHtml(p.nome_arquivo)}</td>
                  <td style="font-size: 12px;">${formatDate(p.data_processamento)}</td>
                  <td style="font-family: 'JetBrains Mono'; font-size: 13px;">${p.total_nomes_extraidos}</td>
                  <td><span class="badge badge-success">${p.total_matches_auto}</span></td>
                  <td><span class="badge badge-warning">${p.total_matches_revisao}</span></td>
                  <td><span class="badge badge-error">${p.total_sem_match}</span></td>
                  <td><span class="badge badge-${p.status === 'concluido' ? 'success' : p.status === 'erro' ? 'error' : 'info'}">${p.status}</span></td>
                  <td style="text-align:center;">
                    <button
                      title="Ver Detalhes"
                      onclick="viewProcessamento(${p.id})"
                      style="background:none;border:none;cursor:pointer;color:#3b82f6;padding:4px 8px;border-radius:6px;transition:background .2s; margin-right:4px;"
                      onmouseover="this.style.background='#dbeafe'"
                      onmouseout="this.style.background='none'"
                    >👁️</button>
                    <button
                      class="btn-delete-hist"
                      title="Remover este registro"
                      onclick="deletarProcessamento(${p.id}, '${escapeHtml(p.nome_arquivo).replace(/'/g, "\\'")}')"
                      style="background:none;border:none;cursor:pointer;color:#ef4444;padding:4px 8px;border-radius:6px;transition:background .2s;"
                      onmouseover="this.style.background='#fee2e2'"
                      onmouseout="this.style.background='none'"
                    >🗑️</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else {
      container.innerHTML = `<div class="empty-state"><p>Nenhum processamento registrado.</p></div>`;
    }
  } catch (e) {
    console.error('Historico error:', e);
  }
}

async function deletarProcessamento(id, nome) {
  if (!confirm(`Remover o registro "${nome}" do histórico?\n\nEsta ação não pode ser desfeita.`)) return;
  try {
    const resp = await fetch(`/api/rdo/historico/${id}`, { method: 'DELETE' });
    const data = await resp.json();
    if (resp.ok && data.success) {
      // Remover a linha da tabela sem recarregar tudo
      const row = document.getElementById(`hist-row-${id}`);
      if (row) {
        row.style.transition = 'opacity .3s';
        row.style.opacity = '0';
        setTimeout(() => row.remove(), 310);
      }
      showToast('Registro removido com sucesso.', 'success');
    } else {
      showToast(data.error || 'Erro ao remover registro.', 'error');
    }
  } catch (e) {
    showToast('Erro de comunicação com o servidor.', 'error');
    console.error('Delete hist error:', e);
  }
}

function viewProcessamento(idx) {
  const proc = histProcessamentos_cache.find(p => p.id === idx);
  if (!proc || !proc.resultado_json) {
      showToast('Nenhum detalhe salvo para este registro.', 'warning');
      return;
  }
  
  let html = '';
  try {
      const json = JSON.parse(proc.resultado_json);
      if (Array.isArray(json)) {
          html = `<pre style="font-size:12px;background:#f4f4f5;padding:10px;border-radius:6px;overflow-x:auto;">${escapeHtml(JSON.stringify(json, null, 2))}</pre>`;
      } else {
          for (const k of Object.keys(json)) {
              const partes = k.split('|');
              const d = partes[0];
              const i = partes[1] ? partes[1] : '--:--';
              const f = partes[2] ? partes[2] : '--:--';
              const titulo = partes.length > 1 ? `${d} — Início: ${i} | Fim: ${f}` : k;
              
              html += `<div style="margin-bottom: 24px; background: #fff; padding: 16px; border-radius: 8px; border: 1px solid var(--border-subtle);">`;
              html += `<div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;"><span style="font-size:18px;">📅</span><h4 style="margin:0; font-weight:700; color:var(--primary-600); font-size: 15px;">${escapeHtml(titulo)}</h4></div>`;
              
              const colabs = json[k];
              html += `
              <div class="table-wrapper">
                <table class="table" style="width:100%; margin:0;">
                  <thead><tr><th style="width:40px">#</th><th>Nome</th><th>CPF</th><th>Matrícula</th><th>Cargo/Categoria</th></tr></thead>
                  <tbody>
                    ${colabs.map((c, idxList) => `
                      <tr>
                        <td style="color:var(--text-muted); font-size:12px;">${idxList+1}</td>
                        <td style="font-weight:600">${escapeHtml(c.nome)}</td>
                        <td style="font-family:'JetBrains Mono', monospace; font-size:12px;">${escapeHtml(c.cpf || '—')}</td>
                        <td style="font-family:'JetBrains Mono', monospace; font-size:12px;">${escapeHtml(c.matricula || '—')}</td>
                        <td style="font-size:13px;">${escapeHtml(c.cargo || '—')} <span class="badge badge-info" style="margin-left:6px;">${escapeHtml(c.categoria || '')}</span></td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div></div>`;
          }
      }
  } catch(e) {
      html = `Erro ao processar dados de visualização: ${e.message}`;
  }

  document.getElementById('histModalBody').innerHTML = html;
  document.getElementById('histModalTitle').textContent = proc.nome_arquivo || "Detalhes do RDO Processado";
  document.getElementById('viewHistModal').style.display = 'flex';
}


// -- loadLogs removed --



// ══════════════════════════════════════════════════════════════
// MOI — Gestão de Mão de Obra Indireta
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
