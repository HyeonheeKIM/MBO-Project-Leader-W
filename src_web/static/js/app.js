/* ============================================================
   MBO Project Leader - Web Edition JavaScript (SPA)
   pywebview API bridge 사용
   ============================================================ */

// ===== pywebview ready =====
let pyapi = null;
const pyReady = new Promise(resolve => {
    window.addEventListener('pywebviewready', () => {
        pyapi = window.pywebview.api;
        resolve();
    });
});

// ===== State =====
const state = {
    currentPage: 'dashboard',
    currentYear: new Date().getFullYear(),
    selectedProjectId: null,
    selectedDate: new Date().toISOString().split('T')[0],
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth() + 1,
    projectSort: 'priority_desc',
    trackingSort: 'priority_desc',
    years: [],
    version: '',
};

// ===== Milestone Config =====
const MILESTONES = ['N/A', '요구 분석', '기능 개발', '검증', 'PILOT', 'REVIEW'];
const MILESTONE_COLORS = {
    'N/A': '#94a3b8',
    '요구 분석': '#6366f1',
    '기능 개발': '#06b6d4',
    '검증': '#f59e0b',
    'PILOT': '#10b981',
    'REVIEW': '#ec4899',
};

// ===== Priority → Background Color =====
// 5=red(high) → 1=white(low)
function priorityBgColor(priority) {
    const colors = {
        5: 'rgba(239,68,68,0.22)',
        4: 'rgba(249,115,22,0.18)',
        3: 'rgba(245,158,11,0.14)',
        2: 'rgba(59,130,246,0.10)',
        1: 'rgba(255,255,255,0.35)',
    };
    return colors[priority] || colors[1];
}
function priorityBorderColor(priority) {
    const colors = {
        5: 'rgba(239,68,68,0.45)',
        4: 'rgba(249,115,22,0.35)',
        3: 'rgba(245,158,11,0.30)',
        2: 'rgba(59,130,246,0.20)',
        1: 'rgba(255,255,255,0.4)',
    };
    return colors[priority] || colors[1];
}
function priorityLabel(priority) {
    return {5:'긴급',4:'높음',3:'보통',2:'낮음',1:'최저'}[priority] || '';
}

// ===== Loading Spinner =====
let _spinnerCount = 0;
let _spinnerTimer = null;
const _spinnerLabels = {
    get_dashboard: '대시보드 로딩 중...',
    get_projects: '프로젝트 로딩 중...',
    get_monthly: '월별 계획 로딩 중...',
    get_tasks: '태스크 로딩 중...',
    get_tracking: '추적 데이터 로딩 중...',
    get_gantt: '간트차트 로딩 중...',
    export_report: '리포트 생성 중...',
    save_csv_file: '파일 저장 중...',
    generate_recurring_tasks: '반복 태스크 생성 중...',
    create_project: '프로젝트 저장 중...',
    update_project: '프로젝트 저장 중...',
    clone_project: '프로젝트 복제 중...',
    get_weekly_trend: '트렌드 분석 중...',
    get_project_comparison: '비교 분석 중...',
};
const _spinnerSkip = new Set([
    'get_years', 'get_setting', 'set_setting',
    'get_current_milestone', 'get_notification',
    'get_deadline_alerts', 'get_weekly_summary',
    'get_task_comments', 'add_task_comment', 'delete_task_comment',
    'check_for_update',
]);

function showSpinner(text) {
    _spinnerCount++;
    if (_spinnerTimer) return; // already showing
    _spinnerTimer = setTimeout(() => {
        const overlay = document.getElementById('spinnerOverlay');
        const label = document.getElementById('spinnerText');
        if (overlay) { label.textContent = text || '처리 중...'; overlay.classList.add('active'); }
    }, 200);
}
function hideSpinner() {
    _spinnerCount = Math.max(0, _spinnerCount - 1);
    if (_spinnerCount > 0) return;
    if (_spinnerTimer) { clearTimeout(_spinnerTimer); _spinnerTimer = null; }
    const overlay = document.getElementById('spinnerOverlay');
    if (overlay) overlay.classList.remove('active');
}

// ===== API Helper (error check wrapper) =====
async function callApi(method, ...args) {
    await pyReady;
    const useSpinner = !_spinnerSkip.has(method);
    if (useSpinner) showSpinner(_spinnerLabels[method]);
    try {
        const result = await pyapi[method](...args);
        if (result && typeof result === 'object' && !Array.isArray(result) && result.error) {
            throw new Error(result.error);
        }
        return result;
    } finally {
        if (useSpinner) hideSpinner();
    }
}

// ===== Toast =====
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ===== Modal =====
function openModal(title, bodyHtml) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = bodyHtml;
    document.getElementById('modalOverlay').classList.add('show');
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('show');
}

// ===== Navigation =====
async function navigate(page) {
    state.currentPage = page;

    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
    });

    try {
        state.years = await callApi('get_years');
        if (state.years.length > 0 && !state.years.includes(state.currentYear)) {
            state.currentYear = state.years[0];
        }
    } catch (e) { console.error(e); }

    const main = document.getElementById('mainContent');
    switch (page) {
        case 'dashboard': await renderDashboard(main); break;
        case 'projects': await renderProjects(main); break;
        case 'monthly': await renderMonthly(main); break;
        case 'daily': await renderDaily(main); break;
        case 'tracking': await renderTracking(main); break;
        case 'gantt': await renderGantt(main); break;
        case 'years': await renderYears(main); break;
        default: await renderDashboard(main);
    }
}

// ===== Year Selector HTML =====
function yearSelectorHtml() {
    const options = state.years.map(y =>
        `<option value="${y}" ${y === state.currentYear ? 'selected' : ''}>${y}</option>`
    ).join('');
    return `<div class="year-selector">
        <label>연도:</label>
        <select onchange="changeYear(this.value)">${options}</select>
    </div>`;
}

function changeYear(val) {
    state.currentYear = parseInt(val);
    state.selectedProjectId = null;
    navigate(state.currentPage);
}

// ===== Progress Bar HTML =====
function progressBarHtml(value, width = '100%') {
    const colorClass = value >= 80 ? 'green' : value >= 40 ? 'blue' : 'red';
    return `<div style="display:flex;align-items:center;gap:8px;width:${width}">
        <div class="progress-bar" style="flex:1">
            <div class="progress-fill ${colorClass}" style="width:${Math.min(value, 100)}%"></div>
        </div>
        <span class="progress-text">${value}%</span>
    </div>`;
}

// ===== Status Badge HTML =====
function statusBadgeHtml(status) {
    return `<span class="status-badge status-${status}">${status}</span>`;
}

// =================================================================
// PAGE: Dashboard
// =================================================================
async function renderDashboard(main) {
    try {
        const [data, weekly, alerts] = await Promise.all([
            callApi('get_dashboard', state.currentYear),
            callApi('get_weekly_summary', state.currentYear),
            callApi('get_deadline_alerts', state.currentYear),
        ]);

        const alertHtml = alerts.length > 0
            ? `<div class="deadline-alert-banner">⚠️ <strong>마감 임박!</strong>
                ${alerts.map(a => `<span class="deadline-alert-item">${escHtml(a.project_name)} — ${a.milestone} (${a.month}월, ${a.days_left === 0 ? '오늘!' : a.days_left + '일 남음'})</span>`).join('')}
              </div>` : '';

        const weekProgress = weekly.week_total > 0 ? Math.round(weekly.week_done / weekly.week_total * 100) : 0;

        main.innerHTML = `
            <div class="page-header">
                <h2 class="page-title">📋 대시보드</h2>
                <div class="header-actions">${yearSelectorHtml()}</div>
            </div>
            ${alertHtml}
            <div class="stats-grid">
                <div class="stat-card"><div class="stat-value" style="color:var(--accent-blue)">${data.total_projects}</div><div class="stat-label">전체 프로젝트</div></div>
                <div class="stat-card"><div class="stat-value" style="color:var(--accent-green)">${data.done_projects}</div><div class="stat-label">완료</div></div>
                <div class="stat-card"><div class="stat-value" style="color:var(--accent-cyan)">${data.progress_projects}</div><div class="stat-label">진행중</div></div>
                <div class="stat-card"><div class="stat-value" style="color:var(--accent-purple)">${data.avg_progress}%</div><div class="stat-label">평균 달성률</div></div>
                <div class="stat-card"><div class="stat-value" style="color:var(--accent-yellow)">${data.today_done}/${data.today_total}</div><div class="stat-label">오늘 태스크</div></div>
            </div>
            <div class="dashboard-two-col">
                <div class="card">
                    <div class="card-title">📅 주간 요약 (${weekly.week_start} ~ ${weekly.week_end})</div>
                    <div style="margin-bottom:8px">${progressBarHtml(weekProgress)}</div>
                    <div style="font-size:12px;color:var(--text-dim)">총 ${weekly.week_total}개 중 ${weekly.week_done}개 완료</div>
                    ${weekly.month_milestones.length > 0
                        ? `<div style="margin-top:12px;font-size:12px;color:var(--text-dim)">이번달 마일스톤:</div>
                           ${weekly.month_milestones.map(m => `<div class="weekly-milestone-item"><span class="milestone-badge" style="background:${MILESTONE_COLORS[m.milestone]||'#888'};font-size:10px;padding:2px 6px">${m.milestone}</span> ${escHtml(m.project_name)} ${statusBadgeHtml(m.status)}</div>`).join('')}`
                        : '<div style="margin-top:12px;font-size:12px;color:var(--text-dim)">이번달 마일스톤 없음</div>'}
                </div>
                <div class="card dashboard-table">
                    <div class="card-title">📂 프로젝트 현황</div>
                    ${data.projects.length === 0
                        ? '<div class="empty-state"><div class="empty-icon">📭</div>등록된 프로젝트가 없습니다.<br>[프로젝트] 메뉴에서 추가하세요.</div>'
                        : `<div class="table-header"><span>프로젝트명</span><span style="text-align:center">가중치</span><span style="text-align:center">상태</span><span>달성률</span></div>
                           ${data.projects.map((p, i) => `
                            <div class="table-row" style="${i % 2 === 0 ? 'background:var(--bg-card-hover)' : ''}">
                                <span style="font-weight:600">${escHtml(p.name)}</span>
                                <span style="text-align:center">${p.weight}%</span>
                                <span style="text-align:center">${statusBadgeHtml(p.status)}</span>
                                <span>${progressBarHtml(p.progress)}</span>
                            </div>
                           `).join('')}`
                    }
                </div>
            </div>
        `;
    } catch (e) {
        main.innerHTML = `<div class="empty-state">데이터를 불러오는 중 오류가 발생했습니다.</div>`;
        console.error(e);
    }
}

// =================================================================
// PAGE: Projects
// =================================================================
async function renderProjects(main) {
    const sortOptions = [
        ['priority_desc', '중요도 ↓'], ['priority_asc', '중요도 ↑'],
        ['name_asc', '이름 ↑'], ['name_desc', '이름 ↓'],
        ['weight_desc', '가중치 ↓'], ['weight_asc', '가중치 ↑'],
        ['status', '상태별'], ['difficulty', '난이도별'],
        ['created_desc', '최신순'], ['created_asc', '오래된순'],
    ];

    try {
        const projects = await callApi('get_projects', state.currentYear, state.projectSort);
        main.innerHTML = `
            <div class="page-header">
                <h2 class="page-title">📂 프로젝트 관리</h2>
                <div class="header-actions">
                    ${yearSelectorHtml()}
                    <button class="btn btn-blue" onclick="openProjectDialog()">+ 프로젝트 추가</button>
                </div>
            </div>
            <div class="sort-bar">
                <label>정렬:</label>
                ${sortOptions.map(([k, l]) =>
                    `<button class="sort-chip ${state.projectSort === k ? 'active' : ''}" onclick="state.projectSort='${k}';navigate('projects')">${l}</button>`
                ).join('')}
            </div>
            ${projects.length > 0 ? `<div class="weight-sum-bar">가중치 합계: <strong style="color:var(--accent-blue)">${projects.reduce((s,p)=>s+p.weight,0)}%</strong></div>` : ''}
            ${projects.length === 0
                ? '<div class="empty-state"><div class="empty-icon">📭</div>등록된 프로젝트가 없습니다.<br>위 [+ 프로젝트 추가] 버튼으로 추가하세요.</div>'
                : projects.map(p => {
                    const diffClass = `difficulty-${p.difficulty}`;
                    return `<div class="project-card">
                        <div class="project-card-header">
                            <span class="project-name">${escHtml(p.name)}</span>
                            <div style="display:flex;align-items:center;gap:8px">
                                ${statusBadgeHtml(p.status)}
                                <div class="project-actions">
                                    <button class="action-btn edit" onclick="openProjectDialog(${p.id})">✏️ 수정</button>
                                    <button class="action-btn clone" onclick="openCloneProjectDialog(${p.id})" title="다른 연도로 복제">📋 복제</button>
                                    <button class="action-btn delete" onclick="deleteProject(${p.id})">🗑️ 삭제</button>
                                </div>
                            </div>
                        </div>
                        <div class="project-meta">
                            <span>가중치: <strong>${p.weight}%</strong></span>
                            <span>중요도: <strong>${p.priority}</strong></span>
                            <span>난이도: <strong class="${diffClass}">${p.difficulty || '보통'}</strong></span>
                        </div>
                        ${(p.target_value || p.actual_value) ? `<div class="project-meta" style="margin-top:4px">
                            ${p.target_value ? `<span>Target(일정 타겟): <strong>${escHtml(p.target_value)}</strong></span>` : ''}
                            ${p.actual_value ? `<span>실적(결과물): <strong>${escHtml(p.actual_value)}</strong></span>` : ''}
                        </div>` : ''}
                        <div class="project-progress">${progressBarHtml(p.progress, '300px')}</div>
                        ${p.description ? `<div class="project-desc">${escHtml(p.description)}</div>` : ''}
                    </div>`;
                }).join('')
            }
        `;
    } catch (e) {
        main.innerHTML = `<div class="empty-state">오류가 발생했습니다.</div>`;
        console.error(e);
    }
}

function openProjectDialog(pid = null) {
    const isEdit = pid !== null;
    const title = isEdit ? '✏️ 프로젝트 수정' : '➕ 새 프로젝트';

    if (isEdit) {
        callApi('get_projects', state.currentYear, 'priority_desc').then(projects => {
            const p = projects.find(x => x.id === pid);
            if (!p) return;
            _showProjectForm(title, p, pid);
        });
    } else {
        _showProjectForm(title, {name:'',description:'',weight:0,priority:1,difficulty:'보통',status:'대기',target_value:'',actual_value:''}, null);
    }
}

function _showProjectForm(title, data, pid) {
    const html = `
        <div class="form-group"><label class="form-label">프로젝트명 *</label><input class="form-input" id="fName" value="${escAttr(data.name)}"></div>
        <div class="form-group"><label class="form-label">설명</label><textarea class="form-textarea" id="fDesc">${escHtml(data.description || '')}</textarea></div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">가중치 (%)</label><input class="form-input" id="fWeight" type="number" step="0.1" value="${data.weight}"></div>
            <div class="form-group"><label class="form-label">중요도</label>
                <select class="form-select" id="fPriority">${[1,2,3,4,5].map(v => `<option ${data.priority==v?'selected':''}>${v}</option>`).join('')}</select>
            </div>
        </div>
        <div class="form-group"><label class="form-label">Target(일정 타겟)</label><textarea class="form-textarea" id="fTarget">${escHtml(data.target_value || '')}</textarea></div>
        <div class="form-group"><label class="form-label">실적(결과물)</label><textarea class="form-textarea" id="fActual">${escHtml(data.actual_value || '')}</textarea></div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">상태</label>
                <select class="form-select" id="fStatus">${['대기','진행중','완료','취소'].map(s => `<option ${data.status==s?'selected':''}>${s}</option>`).join('')}</select>
            </div>
            <div class="form-group"><label class="form-label">난이도</label>
                <select class="form-select" id="fDiff">${['쉬움','보통','어려움','매우 어려움'].map(d => `<option ${data.difficulty==d?'selected':''}>${d}</option>`).join('')}</select>
            </div>
        </div>
        <div class="form-actions">
            <button class="btn btn-gray" onclick="closeModal()">취소</button>
            <button class="btn btn-blue" onclick="saveProject(${pid})" id="btnSaveProject">저장</button>
        </div>
    `;
    openModal(title, html);
}

async function saveProject(pid) {
    const name = document.getElementById('fName').value.trim();
    if (!name) { showToast('프로젝트명을 입력하세요.', 'error'); return; }
    const payload = {
        name,
        description: document.getElementById('fDesc').value.trim(),
        weight: parseFloat(document.getElementById('fWeight').value) || 0,
        priority: parseInt(document.getElementById('fPriority').value) || 1,
        status: document.getElementById('fStatus').value,
        difficulty: document.getElementById('fDiff').value,
        target_value: document.getElementById('fTarget').value.trim(),
        actual_value: document.getElementById('fActual').value.trim(),
        year: state.currentYear,
    };
    try {
        if (pid) {
            await callApi('update_project', pid, payload);
            showToast('프로젝트가 수정되었습니다.');
        } else {
            await callApi('create_project', payload);
            showToast('프로젝트가 추가되었습니다.');
        }
        closeModal();
        navigate('projects');
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function deleteProject(pid) {
    if (!confirm('정말 삭제하시겠습니까?\n관련 월별 계획과 일별 태스크도 삭제됩니다.')) return;
    try {
        await callApi('delete_project', pid);
        showToast('프로젝트가 삭제되었습니다.');
        navigate('projects');
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// =================================================================
// PAGE: Monthly Plans
// =================================================================
async function renderMonthly(main) {
    try {
        const projects = await callApi('get_projects', state.currentYear, 'priority_desc');
        if (projects.length === 0) {
            main.innerHTML = `<div class="page-header"><h2 class="page-title">📅 월별 계획</h2><div class="header-actions">${yearSelectorHtml()}</div></div>
            <div class="empty-state"><div class="empty-icon">📭</div>프로젝트가 없습니다. 먼저 프로젝트를 추가하세요.</div>`;
            return;
        }
        if (!state.selectedProjectId || !projects.find(p => p.id === state.selectedProjectId)) {
            state.selectedProjectId = projects[0].id;
        }

        const plans = await callApi('get_monthly', state.selectedProjectId);
        const months = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

        main.innerHTML = `
            <div class="page-header"><h2 class="page-title">📅 월별 계획</h2><div class="header-actions">${yearSelectorHtml()}</div></div>
            <div class="project-tabs">
                ${projects.map(p => `<button class="project-tab ${p.id === state.selectedProjectId ? 'active' : ''}" onclick="state.selectedProjectId=${p.id};navigate('monthly')">${escHtml(p.name)}</button>`).join('')}
            </div>
            <div class="monthly-grid">
                ${months.map((mn, i) => {
                    const m = i + 1;
                    const plan = plans[String(m)] || {};
                    const ms = plan.milestone || '';
                    const status = plan.status || '미설정';
                    const target = plan.target || '';
                    return `<div class="month-card" onclick="openMonthlyDialog(${m}, ${JSON.stringify(plan).replace(/"/g, '&quot;')})">
                        <div class="month-card-header">
                            <span class="month-name">${mn}</span>
                            ${status !== '미설정' ? statusBadgeHtml(status) : ''}
                        </div>
                        ${target ? `<div class="month-target">목표: ${escHtml(target)}</div>` : ''}
                        <div class="quick-milestones">
                            <div class="quick-ms-row">
                                ${['N/A','요구 분석','기능 개발'].map(msn => `<button class="quick-ms-btn ${ms === msn ? 'active' : ''}" style="${ms === msn ? 'background:' + MILESTONE_COLORS[msn] : ''}" onclick="event.stopPropagation();quickSetMilestone(${m},'${msn}')">${msn}</button>`).join('')}
                            </div>
                            <div class="quick-ms-row">
                                ${['검증','PILOT','REVIEW'].map(msn => `<button class="quick-ms-btn ${ms === msn ? 'active' : ''}" style="${ms === msn ? 'background:' + MILESTONE_COLORS[msn] : ''}" onclick="event.stopPropagation();quickSetMilestone(${m},'${msn}')">${msn}</button>`).join('')}
                            </div>
                        </div>
                        <div class="quick-status-bar">
                            <span class="quick-status-label">진행:</span>
                            ${['-','미완료','진행중','완료'].map(sn => {
                                const sc = {'-':'#6b7280','미완료':'#d97706','진행중':'#2563eb','완료':'#059669'}[sn];
                                return `<button class="quick-status-btn ${status===sn?'active':''}" style="${status===sn?'background:'+sc:''}" onclick="event.stopPropagation();quickSetStatus(${m},'${sn}')">${sn}</button>`;
                            }).join('')}
                        </div>
                        ${!ms && !target ? '<div style="font-size:11px;color:var(--text-dark);margin-top:6px">클릭하여 상세 설정</div>' : ''}
                    </div>`;
                }).join('')}
            </div>
        `;
    } catch (e) {
        main.innerHTML = `<div class="empty-state">오류가 발생했습니다.</div>`;
        console.error(e);
    }
}

function openMonthlyDialog(month, existing) {
    const months = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
    const html = `
        <div class="form-group"><label class="form-label">마일스톤</label>
            <div style="display:flex;align-items:center;gap:8px">
                <select class="form-select" id="fMilestone" onchange="document.getElementById('msInd').style.background=({${Object.entries(MILESTONE_COLORS).map(([k,v])=>`'${k}':'${v}'`).join(',')}})[this.value]||'#ccc'">
                    <option value="">선택안함</option>
                    ${MILESTONES.map(ms => `<option ${(existing.milestone||'')==ms?'selected':''}>${ms}</option>`).join('')}
                </select>
                <span id="msInd" class="ms-color-indicator" style="background:${MILESTONE_COLORS[existing.milestone||'']||'#ccc'}"></span>
            </div>
        </div>
        <div class="form-group"><label class="form-label">목표</label><input class="form-input" id="fTarget" value="${escAttr(existing.target||'')}"></div>
        <div class="form-group"><label class="form-label">상태</label>
            <select class="form-select" id="fMonthStatus">${['미완료','진행중','완료'].map(s => `<option ${(existing.status||'미완료')==s?'selected':''}>${s}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label class="form-label">비고</label><textarea class="form-textarea" id="fNote">${escHtml(existing.note||'')}</textarea></div>
        <div class="form-actions">
            <button class="btn btn-gray" onclick="closeModal()">취소</button>
            <button class="btn btn-blue" onclick="saveMonthly(${month})">저장</button>
        </div>
    `;
    openModal(`📅 ${months[month-1]} 계획`, html);
}

async function saveMonthly(month) {
    const payload = {
        milestone: document.getElementById('fMilestone').value,
        target: document.getElementById('fTarget').value.trim(),
        status: document.getElementById('fMonthStatus').value,
        note: document.getElementById('fNote').value.trim(),
    };
    try {
        await callApi('update_monthly', state.selectedProjectId, month, payload);
        showToast('저장되었습니다.');
        closeModal();
        navigate(state.currentPage);
    } catch (e) { showToast(e.message, 'error'); }
}

async function quickSetMilestone(month, msName) {
    try {
        const plans = await callApi('get_monthly', state.selectedProjectId);
        const current = plans[String(month)] || {};
        // 같은 값 클릭 시 토글(취소)
        const newMs = (current.milestone === msName) ? '' : msName;
        const autoStatus = newMs === 'N/A' ? '-' : newMs === '' ? '' : (current.status || '미완료');
        await callApi('update_monthly', state.selectedProjectId, month, {
            milestone: newMs,
            target: current.target || '',
            status: autoStatus,
            note: current.note || '',
        });
        navigate(state.currentPage);
    } catch (e) { showToast(e.message, 'error'); }
}

async function quickSetStatus(month, statusName) {
    try {
        const plans = await callApi('get_monthly', state.selectedProjectId);
        const current = plans[String(month)] || {};
        // 같은 값 클릭 시 토글(취소)
        const newStatus = (current.status === statusName) ? '' : statusName;
        await callApi('update_monthly', state.selectedProjectId, month, {
            milestone: current.milestone || '',
            target: current.target || '',
            status: newStatus,
            note: current.note || '',
        });
        navigate(state.currentPage);
    } catch (e) { showToast(e.message, 'error'); }
}

// =================================================================
// PAGE: Daily Tasks
// =================================================================
async function renderDaily(main) {
    try {
        const projects = await callApi('get_projects', state.currentYear, 'priority_desc');
        if (projects.length === 0) {
            main.innerHTML = `<div class="page-header"><h2 class="page-title">✅ 일별 태스크</h2><div class="header-actions">${yearSelectorHtml()}</div></div>
            <div class="empty-state"><div class="empty-icon">📭</div>프로젝트가 없습니다.</div>`;
            return;
        }
        if (!state.selectedProjectId || !projects.find(p => p.id === state.selectedProjectId)) {
            state.selectedProjectId = projects[0].id;
        }

        await generateRecurring();
        await generateRecurringForMonth(state.calendarYear, state.calendarMonth);

        const sd = new Date(state.selectedDate);
        const yearMonth = `${state.calendarYear}-${String(state.calendarMonth).padStart(2,'0')}`;
        const selMonth = parseInt(state.selectedDate.split('-')[1]);
        const [tasks, taskDates, curMilestone] = await Promise.all([
            callApi('get_tasks', state.selectedProjectId, state.selectedDate),
            callApi('get_task_dates', state.selectedProjectId, yearMonth),
            callApi('get_current_milestone', state.selectedProjectId, state.currentYear, selMonth),
        ]);

        // 기록 데이터 로드
        const [records, recordDates] = await Promise.all([
            callApi('get_daily_records', state.selectedProjectId, state.selectedDate),
            callApi('get_record_dates', state.selectedProjectId, yearMonth),
        ]);

        const commentCounts = {};
        await Promise.all(tasks.map(async t => {
            try {
                const comments = await callApi('get_task_comments', t.id);
                commentCounts[t.id] = comments.length;
            } catch(e) { commentCounts[t.id] = 0; }
        }));

        const msInfo = curMilestone.milestone
            ? `<div class="daily-milestone-banner" style="border-left:4px solid ${MILESTONE_COLORS[curMilestone.milestone]||'#888'}">
                <span class="milestone-badge" style="background:${MILESTONE_COLORS[curMilestone.milestone]||'#888'}">${curMilestone.milestone}</span>
                <span style="font-size:12px;color:var(--text-dim);margin-left:8px">${selMonth}월 마일스톤</span>
                ${curMilestone.status ? statusBadgeHtml(curMilestone.status) : ''}
               </div>`
            : '';

        main.innerHTML = `
            <div class="page-header">
                <h2 class="page-title">✅ 일별 태스크</h2>
                <div class="header-actions">
                    ${yearSelectorHtml()}
                    <button class="btn btn-purple" onclick="openRecurringManager()" title="반복 태스크 관리">🔄 반복</button>
                    <button class="btn btn-orange" onclick="openRecordDialog()" title="기록 추가">📋 기록</button>
                    <button class="btn btn-green" onclick="openTaskDialog()">+ 태스크 추가</button>
                </div>
            </div>
            <div class="project-tabs">
                ${projects.map(p => `<button class="project-tab ${p.id === state.selectedProjectId ? 'active' : ''}" onclick="state.selectedProjectId=${p.id};navigate('daily')">${escHtml(p.name)}</button>`).join('')}
            </div>
            ${msInfo}
            <div class="daily-layout">
                <div class="calendar-side">
                    <div class="calendar-card">
                        ${renderCalendar(state.calendarYear, state.calendarMonth, state.selectedDate, taskDates, recordDates)}
                    </div>
                    <div class="records-section">
                        <div class="records-header">
                            <span class="records-title">📋 ${state.selectedDate} 기록</span>
                            <button class="btn btn-sm btn-orange" onclick="openRecordDialog()" title="기록 추가">+</button>
                        </div>
                        ${records.length === 0
                            ? '<div class="records-empty">기록이 없습니다.</div>'
                            : records.map(rec => `
                                <div class="record-group">
                                    <div class="record-group-header">
                                        <span class="record-group-title">${escHtml(rec.title)}</span>
                                        <div class="record-group-actions">
                                            <button class="record-add-item-btn" onclick="openAddRecordItemDialog(${rec.id})" title="항목 추가">➕</button>
                                            <button class="record-delete-btn" onclick="deleteDailyRecord(${rec.id})" title="기록 삭제">🗑️</button>
                                        </div>
                                    </div>
                                    <div class="record-items">
                                        ${rec.items.length === 0
                                            ? '<div class="record-item-empty">항목이 없습니다.</div>'
                                            : rec.items.map(item => `
                                                <div class="record-item ${item.is_checked ? 'checked' : ''}">
                                                    <input type="checkbox" class="record-checkbox" ${item.is_checked ? 'checked' : ''} onchange="toggleRecordItem(${item.id}, this.checked)">
                                                    <span class="record-item-text ${item.is_checked ? 'done' : ''}">${escHtml(item.content)}</span>
                                                    <button class="record-item-delete" onclick="deleteRecordItem(${item.id})" title="삭제">✕</button>
                                                </div>
                                            `).join('')}
                                    </div>
                                </div>
                            `).join('')}
                    </div>
                </div>
                <div class="task-list-card">
                    <div class="card-title">📝 ${state.selectedDate} 태스크</div>
                    ${tasks.length === 0
                        ? '<div class="empty-state">📝 이 날짜에 등록된 태스크가 없습니다.</div>'
                        : `<div class="task-priority-legend">
                            <span style="font-size:10px;color:var(--text-dark)">중요도:</span>
                            ${[5,4,3,2,1].map(v => `<span class="priority-legend-item" style="background:${priorityBgColor(v)};border:1px solid ${priorityBorderColor(v)}">${priorityLabel(v)}</span>`).join('')}
                           </div>
                           ${tasks.map(t => `
                            <div class="task-item" style="background:${priorityBgColor(t.priority)};border-color:${priorityBorderColor(t.priority)}">
                                <input type="checkbox" class="task-checkbox" ${t.is_done ? 'checked' : ''} onchange="toggleTask(${t.id}, this.checked)">
                                <div class="task-info" onclick="openEditTaskDialog(${t.id})">
                                    <span class="task-title ${t.is_done ? 'done' : ''}">${escHtml(t.title)}</span>
                                    ${t.description ? `<span class="task-desc">${escHtml(t.description)}</span>` : ''}
                                </div>
                                <button class="task-comment-btn" onclick="openTaskComments(${t.id})" title="댓글">💬${commentCounts[t.id] > 0 ? `<span class="comment-count">${commentCounts[t.id]}</span>` : ''}</button>
                                <button class="task-edit-btn" onclick="openEditTaskDialog(${t.id})" title="수정">✏️</button>
                                <button class="task-delete" onclick="deleteTask(${t.id})">🗑️</button>
                            </div>
                        `).join('')}`
                    }
                </div>
            </div>
        `;
    } catch (e) {
        main.innerHTML = `<div class="empty-state">오류가 발생했습니다.</div>`;
        console.error(e);
    }
}

function renderCalendar(year, month, selectedDate, taskDates, recordDates) {
    recordDates = recordDates || [];
    const today = new Date().toISOString().split('T')[0];
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDay = new Date(year, month - 1, 1).getDay();
    const dayNames = ['일','월','화','수','목','금','토'];

    let html = `<div class="calendar-header">
        <button class="cal-nav-btn" onclick="changeCalMonth(-1)">◀</button>
        <h4>${year}년 ${month}월</h4>
        <button class="cal-nav-btn" onclick="changeCalMonth(1)">▶</button>
    </div><div class="calendar-grid">`;

    dayNames.forEach((dn, i) => {
        const cls = i === 0 ? 'sun' : i === 6 ? 'sat' : '';
        html += `<div class="cal-day-header ${cls}">${dn}</div>`;
    });

    for (let i = 0; i < firstDay; i++) {
        html += `<div class="cal-day empty"></div>`;
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isToday = dateStr === today;
        const isSelected = dateStr === selectedDate;
        const hasTask = taskDates.includes(dateStr);
        const hasRecord = recordDates.includes(dateStr);
        const dayOfWeek = (firstDay + d - 1) % 7;
        const isSun = dayOfWeek === 0;

        let cls = 'cal-day';
        if (isToday) cls += ' today';
        if (isSelected) cls += ' selected';
        if (hasTask) cls += ' has-task';
        if (hasRecord) cls += ' has-record';
        if (isSun && !isSelected) cls += ' sun';

        html += `<div class="${cls}" onclick="selectDate('${dateStr}')">${d}</div>`;
    }

    html += '</div>';
    return html;
}

function changeCalMonth(delta) {
    state.calendarMonth += delta;
    if (state.calendarMonth > 12) { state.calendarMonth = 1; state.calendarYear++; }
    if (state.calendarMonth < 1) { state.calendarMonth = 12; state.calendarYear--; }
    navigate('daily');
}

function selectDate(dateStr) {
    state.selectedDate = dateStr;
    navigate('daily');
}

async function toggleTask(tid, done) {
    try {
        await callApi('update_task', tid, { is_done: done ? 1 : 0 });
        navigate('daily');
    } catch (e) { showToast(e.message, 'error'); }
}

async function deleteTask(tid) {
    if (!confirm('태스크를 삭제하시겠습니까?')) return;
    try {
        await callApi('delete_task', tid);
        showToast('삭제되었습니다.');
        navigate('daily');
    } catch (e) { showToast(e.message, 'error'); }
}

function openTaskDialog() {
    if (!state.selectedProjectId) { showToast('프로젝트를 먼저 선택하세요.', 'error'); return; }
    const html = `
        <div class="form-group"><label class="form-label">제목 *</label><input class="form-input" id="fTaskTitle"></div>
        <div class="form-group"><label class="form-label">설명</label><input class="form-input" id="fTaskDesc"></div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">날짜</label><input class="form-input" id="fTaskDate" type="date" value="${state.selectedDate}"></div>
            <div class="form-group"><label class="form-label">중요도</label>
                <select class="form-select" id="fTaskPri">${[5,4,3,2,1].map(v => `<option value="${v}" ${v===3?'selected':''}>${v} - ${priorityLabel(v)}</option>`).join('')}</select>
            </div>
        </div>
        <div class="form-actions">
            <button class="btn btn-gray" onclick="closeModal()">취소</button>
            <button class="btn btn-green" onclick="saveTask()">추가</button>
        </div>
    `;
    openModal('➕ 태스크 추가', html);
}

function openEditTaskDialog(tid) {
    callApi('get_tasks', state.selectedProjectId, state.selectedDate).then(tasks => {
        const t = tasks.find(x => x.id === tid);
        if (!t) return;
        const html = `
            <div class="form-group"><label class="form-label">제목 *</label><input class="form-input" id="fTaskTitle" value="${escAttr(t.title)}"></div>
            <div class="form-group"><label class="form-label">설명</label><input class="form-input" id="fTaskDesc" value="${escAttr(t.description||'')}"></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">중요도</label>
                    <select class="form-select" id="fTaskPri">${[5,4,3,2,1].map(v => `<option value="${v}" ${t.priority==v?'selected':''}>${v} - ${priorityLabel(v)}</option>`).join('')}</select>
                </div>
            </div>
            <div class="form-actions">
                <button class="btn btn-gray" onclick="closeModal()">취소</button>
                <button class="btn btn-blue" onclick="updateTaskDetail(${tid})">저장</button>
            </div>
        `;
        openModal('✏️ 태스크 수정', html);
    });
}

async function updateTaskDetail(tid) {
    const title = document.getElementById('fTaskTitle').value.trim();
    if (!title) { showToast('제목을 입력하세요.', 'error'); return; }
    try {
        await callApi('update_task', tid, {
            title,
            description: document.getElementById('fTaskDesc').value.trim(),
            priority: parseInt(document.getElementById('fTaskPri').value) || 1,
        });
        showToast('태스크가 수정되었습니다.');
        closeModal();
        navigate('daily');
    } catch (e) { showToast(e.message, 'error'); }
}

async function saveTask() {
    const title = document.getElementById('fTaskTitle').value.trim();
    if (!title) { showToast('제목을 입력하세요.', 'error'); return; }
    const taskDate = document.getElementById('fTaskDate').value;
    if (!taskDate) { showToast('날짜를 선택하세요.', 'error'); return; }
    try {
        await callApi('create_task', {
            project_id: state.selectedProjectId,
            title,
            description: document.getElementById('fTaskDesc').value.trim(),
            task_date: taskDate,
            priority: parseInt(document.getElementById('fTaskPri').value) || 1,
        });
        showToast('태스크가 추가되었습니다.');
        state.selectedDate = taskDate;
        closeModal();
        navigate('daily');
    } catch (e) { showToast(e.message, 'error'); }
}

// =================================================================
// PAGE: Tracking / Analytics
// =================================================================
async function renderTracking(main) {
    const sortOptions = [
        ['priority_desc', '중요도 ↓'], ['name_asc', '이름 ↑'],
        ['status', '상태별'],
        ['progress_desc', '달성률 ↓'], ['progress_asc', '달성률 ↑'],
    ];

    try {
        const [data, trend, comparison] = await Promise.all([
            callApi('get_tracking', state.currentYear, state.trackingSort),
            callApi('get_weekly_trend', state.currentYear, 8),
            callApi('get_project_comparison', state.currentYear),
        ]);

        main.innerHTML = `
            <div class="page-header">
                <h2 class="page-title">📈 추적 & 분석</h2>
                <div class="header-actions">
                    ${yearSelectorHtml()}
                    <button class="btn btn-blue" onclick="exportCSV()" title="CSV 리포트 다운로드">📥 내보내기</button>
                </div>
            </div>
            <div class="sort-bar">
                <label>정렬:</label>
                ${sortOptions.map(([k, l]) =>
                    `<button class="sort-chip ${state.trackingSort === k ? 'active' : ''}" onclick="state.trackingSort='${k}';navigate('tracking')">${l}</button>`
                ).join('')}
            </div>
            <div class="tracking-charts-row">
                <div class="card tracking-chart-card">
                    <div class="card-title">📊 주간 트렌드 (최근 8주)</div>
                    ${renderTrendChart(trend)}
                </div>
                <div class="card tracking-chart-card">
                    <div class="card-title">🏆 프로젝트 간 비교</div>
                    ${renderComparisonChart(comparison)}
                </div>
            </div>
            ${data.length === 0
                ? '<div class="empty-state"><div class="empty-icon">📊</div>분석할 프로젝트가 없습니다.</div>'
                : data.map(p => {
                    const curMonth = new Date().getMonth() + 1;
                    const curPlan = p.monthly_plans[String(curMonth)] || {};
                    const curMs = curPlan.milestone || '';
                    return `
                    <div class="tracking-card">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                            <span style="font-size:16px;font-weight:700">${escHtml(p.name)}</span>
                            <div style="display:flex;align-items:center;gap:8px">
                                ${curMs ? `<span class="milestone-badge" style="background:${MILESTONE_COLORS[curMs]||'#888'};font-size:10px;padding:2px 8px">${curMs}</span>` : ''}
                                ${statusBadgeHtml(p.status)}
                            </div>
                        </div>
                        <div class="tracking-stats">
                            <div class="tracking-stat"><div class="tracking-stat-value" style="color:var(--accent-cyan)">${p.monthly_progress}%</div><div class="tracking-stat-label">월별 달성률</div></div>
                            <div class="tracking-stat"><div class="tracking-stat-value" style="color:var(--accent-green)">${p.task_done}/${p.task_total}</div><div class="tracking-stat-label">TASK 완료</div></div>
                            <div class="tracking-stat"><div class="tracking-stat-value" style="color:var(--accent-blue)">${p.task_progress}%</div><div class="tracking-stat-label">TASK 달성률</div></div>
                        </div>
                        <div style="margin-bottom:4px;font-size:12px;color:var(--text-dim)">전체 진행률 (마일스톤 기준)</div>
                        ${progressBarHtml(p.monthly_progress)}
                        <div class="tracking-extra-stats">
                            <span class="tracking-extra-item">📅 난이도: <b>${escHtml(p.difficulty || '보통')}</b></span>
                            ${p.current_month_milestone ? `<span class="tracking-extra-item">🎯 이번 달 마일스톤: <b><span class="milestone-badge" style="background:${MILESTONE_COLORS[p.current_month_milestone]||'#888'};font-size:10px;padding:2px 8px">${p.current_month_milestone}</span></b></span>` : ''}
                        </div>
                        <div class="monthly-indicators-wrap">
                            <span class="monthly-indicators-label">월별 :</span>
                            <div class="monthly-indicators">
                                ${Array.from({length:12}, (_, i) => {
                                    const pl = p.monthly_plans[String(i+1)] || {};
                                    const st = pl.status || '';
                                    const ms = pl.milestone || '';
                                    const bg = st === '완료' ? 'var(--accent-green)' : st === '진행중' ? 'var(--accent-blue)' : ms ? MILESTONE_COLORS[ms] + '33' : 'var(--bg-dark)';
                                    const fg = (st === '완료' || st === '진행중') ? 'var(--white)' : 'var(--text-dark)';
                                    const isCur = (i+1) === curMonth;
                                    return `<div class="month-indicator ${isCur?'current':''}" style="background:${bg};color:${fg}" title="${ms}">${i+1}</div>`;
                                }).join('')}
                            </div>
                        </div>
                    </div>`;
                }).join('')
            }
        `;
    } catch (e) {
        main.innerHTML = `<div class="empty-state">오류가 발생했습니다.</div>`;
        console.error(e);
    }
}

// =================================================================
// PAGE: Gantt Chart
// =================================================================
async function renderGantt(main) {
    try {
        const projects = await callApi('get_gantt', state.currentYear);
        const months = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
        const curMonth = new Date().getMonth() + 1;
        const curYear = new Date().getFullYear();
        const isCurrentYear = state.currentYear === curYear;

        const legendItems = Object.entries(MILESTONE_COLORS).map(([ms, color]) =>
            `<div class="gantt-legend-item"><span class="gantt-legend-dot" style="background:${color}"></span>${ms}</div>`
        ).join('');

        main.innerHTML = `
            <div class="page-header"><h2 class="page-title">📊 간트차트</h2><div class="header-actions">${yearSelectorHtml()}</div></div>
            ${projects.length === 0
                ? '<div class="empty-state"><div class="empty-icon">📭</div>프로젝트가 없습니다. 먼저 프로젝트를 추가하세요.</div>'
                : `<div class="gantt-container">
                    <div class="gantt-legend">
                        ${legendItems}
                        <span class="gantt-legend-hint">💡 셀 클릭으로 편집${isCurrentYear ? ' | <span style="background:var(--accent-blue);color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700">' + curMonth + '월</span> = 현재 월' : ''}</span>
                    </div>
                    <table class="gantt-table">
                        <thead><tr><th>프로젝트</th>${months.map((mn, i) => `<th class="${i+1===curMonth && isCurrentYear?'gantt-current-month':''}">${mn}</th>`).join('')}</tr></thead>
                        <tbody>
                            ${projects.map(p => renderGanttRow(p, curMonth, isCurrentYear)).join('')}
                        </tbody>
                    </table>
                </div>`
            }
        `;
    } catch (e) {
        main.innerHTML = `<div class="empty-state">오류가 발생했습니다.</div>`;
        console.error(e);
    }
}

function renderGanttRow(p, curMonth, isCurrentYear) {
    const cells = [];
    for (let m = 1; m <= 12; m++) {
        const plan = p.monthly_plans[String(m)] || {};
        cells.push({
            month: m,
            milestone: plan.milestone || '',
            status: plan.status || '',
            target: plan.target || '',
        });
    }

    const spans = [];
    let i = 0;
    while (i < 12) {
        const c = cells[i];
        if (c.milestone) {
            let span = 1;
            while (i + span < 12 && cells[i + span].milestone === c.milestone) {
                span++;
            }
            spans.push({ start: i, span, milestone: c.milestone, status: c.status, cells: cells.slice(i, i + span) });
            i += span;
        } else {
            spans.push({ start: i, span: 1, milestone: '', status: c.status, cells: [c] });
            i++;
        }
    }

    let tds = '';
    for (const s of spans) {
        const isCur = isCurrentYear && curMonth >= s.cells[0].month && curMonth <= s.cells[s.cells.length - 1].month;
        if (s.milestone) {
            const color = MILESTONE_COLORS[s.milestone] || '#888';
            const allDone = s.cells.every(c => c.status === '완료');
            const anyInProgress = s.cells.some(c => c.status === '진행중');
            const opacity = allDone ? '1' : anyInProgress ? '0.8' : '0.55';
            tds += `<td colspan="${s.span}">
                <div class="gantt-bar-merged" style="background:${color};opacity:${opacity}" onclick="ganttCellClick(${p.id},${s.cells[0].month})">
                    ${s.milestone}${s.span > 1 ? ` (${s.cells[0].month}-${s.cells[s.cells.length-1].month}월)` : ''}
                </div>
            </td>`;
        } else {
            tds += `<td class=""><div class="gantt-cell-empty" onclick="ganttCellClick(${p.id},${s.cells[0].month})"></div></td>`;
        }
    }

    return `<tr><td>${escHtml(p.name)}</td>${tds}</tr>`;
}

async function ganttCellClick(projectId, month) {
    state.selectedProjectId = projectId;
    try {
        const plans = await callApi('get_monthly', projectId);
        const plan = plans[String(month)] || {};
        openMonthlyDialog(month, plan);
    } catch (e) { showToast(e.message, 'error'); }
}

// =================================================================
// PAGE: Year Management
// =================================================================
async function renderYears(main) {
    try {
        const years = await callApi('get_years');
        const yearStats = await Promise.all(years.map(y => callApi('get_year_stats', y)));
        main.innerHTML = `
            <div class="page-header">
                <h2 class="page-title">📆 연도 관리</h2>
                <div class="header-actions">
                    <button class="btn btn-blue" onclick="openAddYearDialog()">+ 연도 추가</button>
                </div>
            </div>
            <div class="card">
                ${years.length === 0
                    ? '<div class="empty-state"><div class="empty-icon">📆</div>관리 중인 연도가 없습니다.<br>[+ 연도 추가]를 눌러 추가하세요.</div>'
                    : `<div class="years-grid">${yearStats.map(ys => `
                        <div class="year-card" onclick="state.currentYear=${ys.year};navigate('dashboard')">
                            <div class="year-value">${ys.year}</div>
                            <div class="year-count">프로젝트 ${ys.project_count}개</div>
                        </div>
                    `).join('')}</div>`
                }
            </div>
        `;
    } catch (e) {
        main.innerHTML = `<div class="empty-state">오류가 발생했습니다.</div>`;
        console.error(e);
    }
}

function openAddYearDialog() {
    const html = `
        <div class="form-group"><label class="form-label">추가할 연도</label>
            <input class="form-input" id="fYear" type="number" min="2000" max="2100" value="${new Date().getFullYear()}">
        </div>
        <div class="form-actions">
            <button class="btn btn-gray" onclick="closeModal()">취소</button>
            <button class="btn btn-blue" onclick="addYear()">추가</button>
        </div>
    `;
    openModal('📆 연도 추가', html);
}

async function addYear() {
    const year = parseInt(document.getElementById('fYear').value);
    if (!year || year < 2000 || year > 2100) { showToast('올바른 연도를 입력하세요 (2000~2100).', 'error'); return; }
    try {
        await callApi('add_year', year);
        showToast(`${year}년이 추가되었습니다.`);
        state.currentYear = year;
        closeModal();
        navigate('years');
    } catch (e) { showToast(e.message, 'error'); }
}

// =================================================================
// Feature: Project Clone
// =================================================================
function openCloneProjectDialog(pid) {
    const nextYear = state.currentYear + 1;
    const html = `
        <div class="form-group"><label class="form-label">복제 대상 연도</label>
            <input class="form-input" id="fCloneYear" type="number" min="2000" max="2100" value="${nextYear}">
        </div>
        <p style="font-size:12px;color:var(--text-dim)">프로젝트 정보, 월별 계획 구조, 반복 태스크 템플릿이 복제됩니다.<br>태스크와 진행 상태는 초기화됩니다.</p>
        <div class="form-actions">
            <button class="btn btn-gray" onclick="closeModal()">취소</button>
            <button class="btn btn-blue" onclick="cloneProject(${pid})">복제</button>
        </div>
    `;
    openModal('📋 프로젝트 복제', html);
}

async function cloneProject(pid) {
    const targetYear = parseInt(document.getElementById('fCloneYear').value);
    if (!targetYear || targetYear < 2000 || targetYear > 2100) { showToast('올바른 연도를 입력하세요.', 'error'); return; }
    try {
        await callApi('clone_project', pid, targetYear);
        showToast(`${targetYear}년으로 복제되었습니다.`);
        closeModal();
        navigate('projects');
    } catch (e) { showToast(e.message, 'error'); }
}

// =================================================================
// Feature: Recurring Tasks
// =================================================================
async function openRecurringManager() {
    if (!state.selectedProjectId) { showToast('프로젝트를 먼저 선택하세요.', 'error'); return; }
    try {
        const list = await callApi('get_recurring_tasks', state.selectedProjectId);
        const freqLabel = {daily:'매일', weekly:'매주', monthly:'매월'};
        const dayLabel = {0:'일',1:'월',2:'화',3:'수',4:'목',5:'금',6:'토'};
        const html = `
            <div style="margin-bottom:12px">
                <h4 style="margin:0 0 8px 0;font-size:14px">등록된 반복 태스크</h4>
                ${list.length === 0 ? '<div style="font-size:12px;color:var(--text-dim)">등록된 반복 태스크가 없습니다.</div>'
                    : list.map(r => `<div class="recurring-task-item">
                        <div>
                            <strong>${escHtml(r.title)}</strong>
                            <span class="recurring-badge">${freqLabel[r.frequency] || r.frequency}${r.frequency==='weekly' ? ' ('+dayLabel[r.day_of_week]+')' : ''}${r.frequency==='monthly' ? ' ('+r.day_of_month+'일)' : ''}</span>
                            ${r.end_date ? `<span style="font-size:10px;color:var(--text-dim);margin-left:6px">종료: ${r.end_date}</span>` : ''}
                        </div>
                        <div style="display:flex;gap:4px">
                            <button class="task-edit-btn" onclick="openEditRecurringTask(${r.id})" title="수정">✏️</button>
                            <button class="task-delete" onclick="deleteRecurringTask(${r.id})">🗑️</button>
                        </div>
                    </div>`).join('')}
            </div>
            <hr style="border-color:var(--border-color);margin:12px 0">
            <h4 style="margin:0 0 8px 0;font-size:14px">새 반복 태스크 추가</h4>
            <div class="form-group"><label class="form-label">제목 *</label><input class="form-input" id="fRecTitle"></div>
            <div class="form-group"><label class="form-label">설명</label><input class="form-input" id="fRecDesc"></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">주기</label>
                    <select class="form-select" id="fRecFreq" onchange="toggleRecurringOptions()">
                        <option value="daily">매일</option><option value="weekly">매주</option><option value="monthly">매월</option>
                    </select>
                </div>
                <div class="form-group"><label class="form-label">중요도</label>
                    <select class="form-select" id="fRecPri">${[5,4,3,2,1].map(v=>`<option value="${v}" ${v===3?'selected':''}>${v} - ${priorityLabel(v)}</option>`).join('')}</select>
                </div>
            </div>
            <div class="form-group" id="recWeeklyOpt" style="display:none"><label class="form-label">요일</label>
                <select class="form-select" id="fRecDow">${[1,2,3,4,5,6,0].map(d => `<option value="${d}">${dayLabel[d]}</option>`).join('')}</select>
            </div>
            <div class="form-group" id="recMonthlyOpt" style="display:none"><label class="form-label">날짜 (1~28)</label>
                <input class="form-input" id="fRecDom" type="number" min="1" max="28" value="1">
            </div>
            <div class="form-group"><label class="form-label">종료일 (선택)</label>
                <input class="form-input" id="fRecEndDate" type="date">
            </div>
            <div class="form-actions">
                <button class="btn btn-gray" onclick="closeModal()">닫기</button>
                <button class="btn btn-green" onclick="saveRecurringTask()">추가</button>
            </div>
        `;
        openModal('🔄 반복 태스크 관리', html);
    } catch (e) { showToast(e.message, 'error'); }
}

function toggleRecurringOptions() {
    const freq = document.getElementById('fRecFreq').value;
    document.getElementById('recWeeklyOpt').style.display = freq === 'weekly' ? '' : 'none';
    document.getElementById('recMonthlyOpt').style.display = freq === 'monthly' ? '' : 'none';
}

async function saveRecurringTask() {
    const title = document.getElementById('fRecTitle').value.trim();
    if (!title) { showToast('제목을 입력하세요.', 'error'); return; }
    const freq = document.getElementById('fRecFreq').value;
    try {
        await callApi('create_recurring_task', {
            project_id: state.selectedProjectId,
            title,
            description: document.getElementById('fRecDesc').value.trim(),
            priority: parseInt(document.getElementById('fRecPri').value) || 3,
            frequency: freq,
            day_of_week: freq === 'weekly' ? parseInt(document.getElementById('fRecDow').value) : null,
            day_of_month: freq === 'monthly' ? parseInt(document.getElementById('fRecDom').value) : null,
            end_date: document.getElementById('fRecEndDate').value || '',
        });
        showToast('반복 태스크가 추가되었습니다.');
        openRecurringManager(); // refresh
    } catch (e) { showToast(e.message, 'error'); }
}

async function deleteRecurringTask(rid) {
    if (!confirm('이 반복 태스크 템플릿을 삭제하시겠습니까?\n생성된 미완료 태스크도 함께 삭제됩니다.')) return;
    try {
        await callApi('delete_recurring_task', rid);
        showToast('삭제되었습니다.');
        closeModal();
        navigate('daily');
    } catch (e) { showToast(e.message, 'error'); }
}

async function openEditRecurringTask(rid) {
    try {
        const list = await callApi('get_recurring_tasks', state.selectedProjectId);
        const r = list.find(x => x.id === rid);
        if (!r) return;
        const dayLabel = {0:'일',1:'월',2:'화',3:'수',4:'목',5:'금',6:'토'};
        const html = `
            <div class="form-group"><label class="form-label">제목 *</label><input class="form-input" id="fRecEditTitle" value="${escAttr(r.title)}"></div>
            <div class="form-group"><label class="form-label">설명</label><input class="form-input" id="fRecEditDesc" value="${escAttr(r.description||'')}"></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">주기</label>
                    <select class="form-select" id="fRecEditFreq" onchange="toggleEditRecurringOptions()">
                        <option value="daily" ${r.frequency==='daily'?'selected':''}>매일</option>
                        <option value="weekly" ${r.frequency==='weekly'?'selected':''}>매주</option>
                        <option value="monthly" ${r.frequency==='monthly'?'selected':''}>매월</option>
                    </select>
                </div>
                <div class="form-group"><label class="form-label">중요도</label>
                    <select class="form-select" id="fRecEditPri">${[5,4,3,2,1].map(v=>`<option value="${v}" ${r.priority==v?'selected':''}>${v} - ${priorityLabel(v)}</option>`).join('')}</select>
                </div>
            </div>
            <div class="form-group" id="recEditWeeklyOpt" style="display:${r.frequency==='weekly'?'':'none'}"><label class="form-label">요일</label>
                <select class="form-select" id="fRecEditDow">${[1,2,3,4,5,6,0].map(d => `<option value="${d}" ${r.day_of_week==d?'selected':''}>${dayLabel[d]}</option>`).join('')}</select>
            </div>
            <div class="form-group" id="recEditMonthlyOpt" style="display:${r.frequency==='monthly'?'':'none'}"><label class="form-label">날짜 (1~28)</label>
                <input class="form-input" id="fRecEditDom" type="number" min="1" max="28" value="${r.day_of_month||1}">
            </div>
            <div class="form-group"><label class="form-label">종료일 (선택)</label>
                <input class="form-input" id="fRecEditEndDate" type="date" value="${r.end_date||''}">
            </div>
            <div class="form-actions">
                <button class="btn btn-gray" onclick="openRecurringManager()">← 목록</button>
                <button class="btn btn-blue" onclick="updateRecurringTask(${rid})">저장</button>
            </div>
        `;
        openModal('✏️ 반복 태스크 수정', html);
    } catch (e) { showToast(e.message, 'error'); }
}

function toggleEditRecurringOptions() {
    const freq = document.getElementById('fRecEditFreq').value;
    document.getElementById('recEditWeeklyOpt').style.display = freq === 'weekly' ? '' : 'none';
    document.getElementById('recEditMonthlyOpt').style.display = freq === 'monthly' ? '' : 'none';
}

async function updateRecurringTask(rid) {
    const title = document.getElementById('fRecEditTitle').value.trim();
    if (!title) { showToast('제목을 입력하세요.', 'error'); return; }
    const freq = document.getElementById('fRecEditFreq').value;
    try {
        await callApi('update_recurring_task', rid, {
            title,
            description: document.getElementById('fRecEditDesc').value.trim(),
            priority: parseInt(document.getElementById('fRecEditPri').value) || 3,
            frequency: freq,
            day_of_week: freq === 'weekly' ? parseInt(document.getElementById('fRecEditDow').value) : null,
            day_of_month: freq === 'monthly' ? parseInt(document.getElementById('fRecEditDom').value) : null,
            end_date: document.getElementById('fRecEditEndDate').value || '',
        });
        showToast('반복 태스크가 수정되었습니다.');
        closeModal();
        navigate('daily');
    } catch (e) { showToast(e.message, 'error'); }
}

async function generateRecurring() {
    if (!state.selectedProjectId) return;
    try {
        const result = await callApi('generate_recurring_tasks', state.selectedProjectId, state.selectedDate);
        if (result && result.created > 0) {
            showToast(`반복 태스크 ${result.created}개 자동 생성`);
        }
    } catch (e) { /* ignore silently */ }
}

async function generateRecurringForMonth(year, month) {
    if (!state.selectedProjectId) return;
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        try {
            await callApi('generate_recurring_tasks', state.selectedProjectId, dateStr);
        } catch (e) { /* ignore */ }
    }
}

// =================================================================
// Feature: Task Comments
// =================================================================
async function openTaskComments(tid) {
    try {
        const comments = await callApi('get_task_comments', tid);
        const html = `
            <div class="comments-list">
                ${comments.length === 0
                    ? '<div style="font-size:12px;color:var(--text-dim);padding:8px 0">아직 댓글이 없습니다.</div>'
                    : comments.map(c => `<div class="comment-item">
                        <div class="comment-content">${escHtml(c.content)}</div>
                        <div class="comment-meta">
                            <span>${c.created_at}</span>
                            <button class="task-delete" style="font-size:11px" onclick="deleteComment(${c.id}, ${tid})">🗑️</button>
                        </div>
                    </div>`).join('')}
            </div>
            <div class="comment-form">
                <input class="form-input" id="fCommentText" placeholder="댓글 입력..." onkeydown="if(event.key==='Enter')addComment(${tid})">
                <button class="btn btn-green" onclick="addComment(${tid})" style="white-space:nowrap">추가</button>
            </div>
            <div class="form-actions" style="margin-top:12px">
                <button class="btn btn-gray" onclick="closeModal()">닫기</button>
            </div>
        `;
        openModal(`💬 태스크 댓글 (${comments.length})`, html);
    } catch (e) { showToast(e.message, 'error'); }
}

async function addComment(tid) {
    const input = document.getElementById('fCommentText');
    const text = input.value.trim();
    if (!text) return;
    try {
        await callApi('add_task_comment', tid, text);
        openTaskComments(tid); // refresh
    } catch (e) { showToast(e.message, 'error'); }
}

async function deleteComment(cid, tid) {
    try {
        await callApi('delete_task_comment', cid);
        openTaskComments(tid);
    } catch (e) { showToast(e.message, 'error'); }
}

// =================================================================
// Feature: Daily Records (기록)
// =================================================================
let _recordItemCount = 1;

function openRecordDialog() {
    if (!state.selectedProjectId) { showToast('프로젝트를 먼저 선택하세요.', 'error'); return; }
    _recordItemCount = 1;
    const html = `
        <div class="form-group"><label class="form-label">기록 제목 *</label><input class="form-input" id="fRecordTitle" placeholder="예: 회의 메모, 체크리스트 등"></div>
        <div class="form-group">
            <label class="form-label">항목 (체크리스트)</label>
            <div id="recordItemsContainer">
                <div class="record-item-input-row">
                    <input class="form-input" placeholder="항목 입력..." data-record-item>
                    <button class="btn btn-sm btn-red" onclick="this.parentElement.remove()" title="삭제">✕</button>
                </div>
            </div>
            <button class="btn btn-sm btn-gray" onclick="addRecordItemInput()" style="margin-top:6px">+ 항목 추가</button>
        </div>
        <div class="form-group"><label class="form-label">날짜</label><input class="form-input" id="fRecordDate" type="date" value="${state.selectedDate}"></div>
        <div class="form-actions">
            <button class="btn btn-gray" onclick="closeModal()">취소</button>
            <button class="btn btn-orange" onclick="saveRecord()">기록 저장</button>
        </div>
    `;
    openModal('📋 새 기록 추가', html);
}

function addRecordItemInput() {
    const container = document.getElementById('recordItemsContainer');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'record-item-input-row';
    row.innerHTML = `<input class="form-input" placeholder="항목 입력..." data-record-item><button class="btn btn-sm btn-red" onclick="this.parentElement.remove()" title="삭제">✕</button>`;
    container.appendChild(row);
    row.querySelector('input').focus();
}

async function saveRecord() {
    const title = document.getElementById('fRecordTitle').value.trim();
    if (!title) { showToast('제목을 입력하세요.', 'error'); return; }
    const recordDate = document.getElementById('fRecordDate').value;
    if (!recordDate) { showToast('날짜를 선택하세요.', 'error'); return; }
    const inputs = document.querySelectorAll('[data-record-item]');
    const items = [];
    inputs.forEach(inp => {
        const content = inp.value.trim();
        if (content) items.push({ content, is_checked: 0 });
    });
    try {
        await callApi('create_daily_record', {
            project_id: state.selectedProjectId,
            record_date: recordDate,
            title,
            items
        });
        showToast('기록이 추가되었습니다.');
        state.selectedDate = recordDate;
        closeModal();
        navigate('daily');
    } catch (e) { showToast(e.message, 'error'); }
}

function openAddRecordItemDialog(recordId) {
    const html = `
        <div class="form-group"><label class="form-label">새 항목</label><input class="form-input" id="fNewRecordItem" placeholder="항목 내용 입력..." onkeydown="if(event.key==='Enter')saveRecordItem(${recordId})"></div>
        <div class="form-actions">
            <button class="btn btn-gray" onclick="closeModal()">취소</button>
            <button class="btn btn-orange" onclick="saveRecordItem(${recordId})">추가</button>
        </div>
    `;
    openModal('➕ 항목 추가', html);
}

async function saveRecordItem(recordId) {
    const input = document.getElementById('fNewRecordItem');
    const content = input.value.trim();
    if (!content) { showToast('내용을 입력하세요.', 'error'); return; }
    try {
        await callApi('add_record_item', recordId, content);
        showToast('항목이 추가되었습니다.');
        closeModal();
        navigate('daily');
    } catch (e) { showToast(e.message, 'error'); }
}

async function toggleRecordItem(itemId, checked) {
    try {
        await callApi('toggle_record_item', itemId, checked ? 1 : 0);
    } catch (e) { showToast(e.message, 'error'); navigate('daily'); }
}

async function deleteRecordItem(itemId) {
    try {
        await callApi('delete_record_item', itemId);
        navigate('daily');
    } catch (e) { showToast(e.message, 'error'); }
}

async function deleteDailyRecord(recordId) {
    if (!confirm('이 기록을 삭제하시겠습니까?')) return;
    try {
        await callApi('delete_daily_record', recordId);
        showToast('기록이 삭제되었습니다.');
        navigate('daily');
    } catch (e) { showToast(e.message, 'error'); }
}

// =================================================================
// Feature: Weekly Trend & Project Comparison Charts
// =================================================================
function renderTrendChart(data) {
    if (!data || data.length === 0) return '<div style="font-size:12px;color:var(--text-dim)">데이터 없음</div>';
    const maxVal = Math.max(...data.map(d => d.total), 1);
    return `<div class="trend-chart">
        ${data.map(d => {
            const totalH = Math.round((d.total / maxVal) * 100);
            const doneH = Math.round((d.done / maxVal) * 100);
            return `<div class="trend-bar-group">
                <div class="trend-bars">
                    <div class="trend-bar total" style="height:${totalH}%" title="전체: ${d.total}"></div>
                    <div class="trend-bar done" style="height:${doneH}%" title="완료: ${d.done}"></div>
                </div>
                <div class="trend-label">${d.label}</div>
            </div>`;
        }).join('')}
    </div>
    <div class="trend-legend"><span class="trend-legend-item"><span class="trend-dot total"></span>전체</span><span class="trend-legend-item"><span class="trend-dot done"></span>완료</span></div>`;
}

function renderComparisonChart(data) {
    if (!data || data.length === 0) return '<div style="font-size:12px;color:var(--text-dim)">데이터 없음</div>';
    return `<div class="comparison-chart">
        ${data.map(p => `<div class="comparison-row">
            <div class="comparison-name">${escHtml(p.name)}</div>
            <div class="comparison-bars">
                <div class="comparison-bar-wrap">
                    <div class="comparison-bar task" style="width:${Math.min(p.task_progress, 100)}%"></div>
                    <span class="comparison-val">${p.task_progress}%</span>
                </div>
                <div class="comparison-bar-wrap">
                    <div class="comparison-bar monthly" style="width:${Math.min(p.monthly_progress, 100)}%"></div>
                    <span class="comparison-val">${p.monthly_progress}%</span>
                </div>
            </div>
        </div>`).join('')}
    </div>
    <div class="trend-legend"><span class="trend-legend-item"><span class="trend-dot" style="background:var(--accent-blue)"></span>태스크</span><span class="trend-legend-item"><span class="trend-dot" style="background:var(--accent-cyan)"></span>월별</span></div>`;
}

// =================================================================
// Feature: Export CSV (with Preview)
// =================================================================
async function exportCSV() {
    try {
        const csv = await callApi('export_report', state.currentYear, 'csv');
        // Parse CSV into table for preview
        const lines = csv.split('\n');
        let tableHtml = '<div class="export-preview-wrap"><table class="export-preview-table">';
        let isHeader = true;
        for (const line of lines) {
            if (!line.trim()) {
                // Empty line = section separator
                tableHtml += '</table><hr style="border-color:var(--border-color);margin:12px 0"><table class="export-preview-table">';
                isHeader = true;
                continue;
            }
            const cells = line.split(',');
            const tag = isHeader ? 'th' : 'td';
            tableHtml += '<tr>' + cells.map(c => `<${tag}>${escHtml(c)}</${tag}>`).join('') + '</tr>';
            isHeader = false;
        }
        tableHtml += '</table></div>';

        const html = `
            ${tableHtml}
            <div class="form-actions" style="margin-top:16px">
                <button class="btn btn-gray" onclick="closeModal()">닫기</button>
                <button class="btn btn-blue" onclick="doDownloadCSV()">📥 다운로드</button>
            </div>
        `;
        // Store csv data temporarily
        window._pendingCSV = csv;
        openModal(`📊 리포트 미리보기 — ${state.currentYear}년`, html);
    } catch (e) { showToast(e.message, 'error'); }
}

function doDownloadCSV() {
    const csv = window._pendingCSV;
    if (!csv) return;
    callApi('save_csv_file', state.currentYear).then(res => {
        if (res && res.ok) {
            window._pendingCSV = null;
            closeModal();
            showToast('CSV 파일이 저장되었습니다.');
        } else if (res && res.message === 'cancelled') {
            // User cancelled the dialog — do nothing
        } else {
            showToast((res && res.message) || '파일 저장에 실패했습니다.', 'error');
        }
    }).catch(e => showToast(e.message, 'error'));
}

// ===== Utilities =====
function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escAttr(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ===== Notification =====
async function loadNotificationDot() {
    try {
        const data = await callApi('get_notification');
        const dot = document.getElementById('notificationDot');
        if (dot) {
            if (data.raw && data.raw.trim() && !data.is_read) {
                dot.style.display = 'block';
            } else {
                dot.style.display = 'none';
            }
        }
    } catch (e) { /* ignore */ }
}

async function openNotificationPanel() {
    const overlay = document.getElementById('notificationOverlay');
    const body = document.getElementById('notificationBody');
    const footer = document.getElementById('notificationFooter');
    overlay.classList.add('show');
    body.innerHTML = '<div class="empty-state" style="padding:30px">불러오는 중...</div>';
    footer.innerHTML = '';
    try {
        const data = await callApi('get_notification');
        if (!data.raw || !data.raw.trim()) {
            body.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div>공지사항이 없습니다.</div>';
        } else {
            body.innerHTML = `<div class="notification-content">${data.html}</div>`;
            footer.innerHTML = `<span class="notification-updated">마지막 수정: ${data.updated}</span>`;
        }
        // Mark as read in DB
        if (data.hash) {
            await callApi('mark_notification_read', data.hash);
            const dot = document.getElementById('notificationDot');
            if (dot) dot.style.display = 'none';
        }
    } catch (e) {
        body.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div>공지사항을 불러올 수 없습니다.</div>';
    }
}

function closeNotificationPanel() {
    document.getElementById('notificationOverlay').classList.remove('show');
}

// ===== Update Check =====
async function checkForUpdate() {
    try {
        const result = await pyapi.check_for_update();
        if (result && result.needs_update) {
            showUpdateDialog(result);
        }
    } catch (e) {
        console.error('Update check failed:', e);
    }
}

function showUpdateDialog(info) {
    const overlay = document.createElement('div');
    overlay.id = 'updateOverlay';
    overlay.className = 'modal-overlay show';
    overlay.innerHTML = `
        <div class="modal-container" style="max-width:420px;">
            <div class="modal-header">
                <h3>🔄 업데이트 안내</h3>
                <button class="modal-close" onclick="closeUpdateDialog()">&times;</button>
            </div>
            <div class="modal-body" id="updateDialogBody">
                <p style="margin-bottom:14px;font-size:0.95rem;color:var(--text);">새로운 버전이 출시되었습니다.</p>
                <div style="background:var(--glass-bg-subtle);backdrop-filter:var(--glass-blur);-webkit-backdrop-filter:var(--glass-blur);border:1px solid var(--glass-border-dim);border-radius:var(--radius-md);padding:14px 16px;margin-bottom:16px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
                        <span style="color:var(--text-dim);font-size:0.88rem;">현재 버전</span>
                        <span style="font-weight:600;">v${info.current_version}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;">
                        <span style="color:var(--text-dim);font-size:0.88rem;">최신 버전</span>
                        <span style="color:var(--accent-green);font-weight:700;">v${info.latest_version}</span>
                    </div>
                </div>
                <p style="color:var(--text-dim);font-size:0.83rem;margin-bottom:0;">
                    업데이트를 진행하면 프로그램이 재시작됩니다.
                </p>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;padding:6px 26px 22px;" id="updateDialogFooter">
                <button class="btn" onclick="closeUpdateDialog()">나중에</button>
                <button class="btn btn-blue" onclick="doUpdate('${info.exe_url}','${info.latest_version}')">업데이트</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function closeUpdateDialog() {
    const overlay = document.getElementById('updateOverlay');
    if (overlay) overlay.remove();
}

async function doUpdate(exeUrl, latestVersion) {
    const body = document.getElementById('updateDialogBody');
    const footer = document.getElementById('updateDialogFooter');
    // X 버튼 및 오버레이 클릭 닫기 비활성화
    const closeBtn = document.querySelector('#updateOverlay .modal-close');
    if (closeBtn) closeBtn.style.display = 'none';
    const overlay = document.getElementById('updateOverlay');
    if (overlay) overlay.onclick = null;
    if (body) {
        body.innerHTML = `
            <div style="text-align:center;padding:20px;">
                <div class="spinner" style="margin:0 auto 16px;"></div>
                <p>\uC5C5\uB370\uC774\uD2B8 \uC900\uBE44 \uC911...</p>
            </div>
        `;
    }
    if (footer) footer.style.display = 'none';

    try {
        const result = await pyapi.start_update(exeUrl, latestVersion);
        if (result && result.error) {
            if (body) {
                body.innerHTML = `
                    <div style="text-align:center;padding:20px;">
                        <div style="font-size:2rem;margin-bottom:12px;">\u26A0\uFE0F</div>
                        <p>\uC5C5\uB370\uC774\uD2B8 \uC2E4\uD328</p>
                        <p style="color:#ef4444;font-size:0.85rem;">${result.error}</p>
                    </div>
                `;
            }
            if (footer) {
                footer.style.display = 'flex';
                footer.innerHTML = `<button class="btn" onclick="closeUpdateDialog()">\uB2EB\uAE30</button>`;
            }
        } else if (result && result.ok) {
            // \uC5C5\uB370\uC774\uD2B8 \uC900\uBE44 \uC644\uB8CC — \uC571 \uC885\uB8CC
            if (body) {
                body.innerHTML = `
                    <div style="text-align:center;padding:20px;">
                        <div style="font-size:2rem;margin-bottom:12px;">\uD83D\uDD04</div>
                        <p>\uC5C5\uB370\uC774\uD2B8\uB97C \uC704\uD574 \uC571\uC744 \uC885\uB8CC\uD569\uB2C8\uB2E4...</p>
                    </div>
                `;
            }
            setTimeout(async () => {
                try { await pyapi.close_app(); } catch(e) {}
            }, 1500);
        }
    } catch (e) {
        console.error('Update failed:', e);
    }
}

// ===== Init =====
async function initApp() {
    await pyReady;
    // Set version from Python
    try {
        state.version = await pyapi.get_version();
        document.title = `MBO Project Leader v${state.version}`;
        const vBadge = document.getElementById('versionBadge');
        if (vBadge) vBadge.textContent = `v${state.version}`;
    } catch (e) { console.error(e); }

    navigate('dashboard');
    loadNotificationDot();

    // 백그라운드 업데이트 확인
    checkForUpdate();

}

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});
