/**
 * RDO Pro Max 2.0 — Dashboard Application Logic
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
    rdo: ['Processar RDO', 'Extração e matching de nomes em PDFs'],
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
  if (page === 'historico') { loadHistorico(); loadLogs(); }

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

    // Logs
    const logsContainer = document.getElementById('dashboardLogs');
    if (data.logs_recentes && data.logs_recentes.length > 0) {
      logsContainer.innerHTML = data.logs_recentes.map(log => `
        <div class="log-item">
          <div class="log-dot ${log.tipo}"></div>
          <div style="flex: 1;">
            <div class="log-text">${escapeHtml(log.mensagem)}</div>
            <div class="log-time">${formatDate(log.data)}</div>
          </div>
        </div>
      `).join('');
    }
  } catch (e) {
    console.log('Dashboard load error:', e);
  }
}

// ── Efetivo (Colaboradores) ────────────────────
async function handleExcelUpload(input) {
  const file = input.files[0];
  if (!file) return;

  showLoading('Importando planilha Excel...');

  const formData = new FormData();
  formData.append('file', file);

  try {
    const data = await apiCall('/api/efetivo/upload-excel', {
      method: 'POST',
      body: formData
    });

    hideLoading();
    showToast(
      `Importação concluída! ${data.importados} novos, ${data.atualizados} atualizados. Total: ${data.total_base}`,
      'success',
      6000
    );
    document.getElementById('badgeEfetivo').textContent = data.total_base;
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
async function loadHistorico() {
  try {
    const data = await apiCall('/api/rdo/historico');
    const container = document.getElementById('historicoContent');

    if (data.processamentos && data.processamentos.length > 0) {
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
              </tr>
            </thead>
            <tbody>
              ${data.processamentos.map(p => `
                <tr>
                  <td style="font-weight: 600;">${escapeHtml(p.nome_arquivo)}</td>
                  <td style="font-size: 12px;">${formatDate(p.data_processamento)}</td>
                  <td style="font-family: 'JetBrains Mono'; font-size: 13px;">${p.total_nomes_extraidos}</td>
                  <td><span class="badge badge-success">${p.total_matches_auto}</span></td>
                  <td><span class="badge badge-warning">${p.total_matches_revisao}</span></td>
                  <td><span class="badge badge-error">${p.total_sem_match}</span></td>
                  <td><span class="badge badge-${p.status === 'concluido' ? 'success' : p.status === 'erro' ? 'error' : 'info'}">${p.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  } catch (e) {
    console.error('Historico error:', e);
  }
}

async function loadLogs() {
  try {
    const data = await apiCall('/api/logs?limite=30');
    const container = document.getElementById('logsContent');

    if (data.logs && data.logs.length > 0) {
      container.innerHTML = data.logs.map(log => `
        <div class="log-item">
          <div class="log-dot ${log.tipo}"></div>
          <div style="flex: 1;">
            <div class="log-text">
              <span class="badge badge-${log.tipo === 'success' ? 'success' : log.tipo === 'error' ? 'error' : log.tipo === 'warning' ? 'warning' : 'info'}" style="margin-right: 6px;">${log.modulo}</span>
              ${escapeHtml(log.mensagem)}
            </div>
            <div class="log-time">${formatDate(log.data)}</div>
          </div>
        </div>
      `).join('');
    }
  } catch (e) {
    console.error('Logs error:', e);
  }
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
