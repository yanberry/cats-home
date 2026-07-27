// ============================================================
// 存储工具（支持 localStorage + JSON 文件自动同步）
// ============================================================
const STORE = {
  areas: 'pair_areas',
  projects: 'pair_projects',
  inbox: 'pair_inbox',
  resources: 'pair_resources',
  logs: 'pair_logs',
  banner: 'pair_banner',
  items: 'minimalist_items',
  expenses: 'minimalist_expenses_monthly',
  manifesto: 'minimalist_manifesto',
  savings: 'pair_savings_accounts',
  calendar: 'pair_calendar_events'
};

// ===== 服务器 API 配置 =====
const API_BASE = 'http://localhost:3000/api';
let _dataCache = null;
let _isSyncing = false;

// ===== 工具函数 =====
function load(key) {
  try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; }
}
function saveToLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function today() { return new Date().toISOString().slice(0, 10); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function escapeHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function formatDate(dateStr) {
  var d = new Date(dateStr);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function getMonthKey(dateStr) {
  var d = new Date(dateStr);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// ===== 服务器同步函数 =====
async function loadAllFromServer() {
  try {
    const res = await fetch(`${API_BASE}/data`);
    if (!res.ok) throw new Error('加载失败');
    const data = await res.json();
    _dataCache = data;
    return data;
  } catch (e) {
    console.warn('⚠️ 无法连接服务器，使用 localStorage:', e.message);
    return null;
  }
}

async function saveAllToServer(data) {
  if (_isSyncing) return false;
  _isSyncing = true;
  try {
    const res = await fetch(`${API_BASE}/data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('保存失败');
    _dataCache = data;
    return true;
  } catch (e) {
    console.warn('⚠️ 保存到服务器失败，已保存到 localStorage:', e.message);
    return false;
  } finally {
    _isSyncing = false;
  }
}

// ===== 统一的 load 函数（优先缓存，降级 localStorage） =====
function loadData(key) {
  if (_dataCache && _dataCache[key] !== undefined) {
    return _dataCache[key];
  }
  return load(key);
}

// ===== 统一的 save 函数（保存到 localStorage + 同步服务器） =====
async function saveData(key, value) {
  if (!_dataCache) {
    _dataCache = {};
    for (var k in STORE) {
      _dataCache[k] = load(k);
    }
  }
  _dataCache[key] = value;
  
  // 保存到 localStorage（立即生效）
  saveToLocal(key, value);
  
  // 异步同步到服务器
  await saveAllToServer(_dataCache);
}

// ===== 同步版 save（不等待服务器响应） =====
function saveDataSync(key, value) {
  if (!_dataCache) {
    _dataCache = {};
    for (var k in STORE) {
      _dataCache[k] = load(k);
    }
  }
  _dataCache[key] = value;
  saveToLocal(key, value);
  saveAllToServer(_dataCache).catch(() => {});
}

// ===== 存储加载（使用新的 loadData） =====
function loadAreas() { return loadData(STORE.areas) || []; }
function saveAreas(value) { saveDataSync(STORE.areas, value); }
function loadProjects() { return loadData(STORE.projects) || []; }
function saveProjects(value) { saveDataSync(STORE.projects, value); }
function loadInbox() { return loadData(STORE.inbox) || []; }
function saveInbox(value) { saveDataSync(STORE.inbox, value); }
function loadResources() { return loadData(STORE.resources) || []; }
function saveResources(value) { saveDataSync(STORE.resources, value); }
function loadLogs() { return loadData(STORE.logs) || []; }
function saveLogs(value) { saveDataSync(STORE.logs, value); }
function loadBanner() { return loadData(STORE.banner) || { year: new Date().getFullYear(), theme: '' }; }
function saveBanner(value) { saveDataSync(STORE.banner, value); }
function loadItems() { return loadData(STORE.items) || []; }
function saveItems(items) { saveDataSync(STORE.items, items); }
function loadManifesto() {
  return loadData(STORE.manifesto) || { content: '' };
}
function saveManifesto(manifesto) { saveDataSync(STORE.manifesto, manifesto); }
function loadCalendarEvents() { return loadData(STORE.calendar) || {}; }
function saveCalendarEvents(events) { saveDataSync(STORE.calendar, events); }

// ===== 储蓄账户（含交易流水） =====
function loadSavingsAccounts() {
  var accounts = loadData(STORE.savings) || [];
  accounts = accounts.map(function(acc) {
    if (acc.monthlyData && !acc.transactions) {
      var txns = [];
      var balance = acc.balance || 0;
      for (var key in acc.monthlyData) {
        var amount = acc.monthlyData[key];
        if (amount > 0) {
          var parts = key.split('-');
          var date = parts[0] + '-' + parts[1] + '-01';
          txns.push({ id: uid(), date: date, type: 'income', amount: amount, category: '储蓄', note: '历史数据' });
        }
      }
      acc.transactions = txns;
      acc.balance = txns.reduce(function(sum, t) { return t.type === 'income' ? sum + t.amount : sum - t.amount; }, 0);
      delete acc.monthlyData;
    }
    if (!acc.transactions) acc.transactions = [];
    if (acc.balance === undefined) {
      acc.balance = acc.transactions.reduce(function(sum, t) { return t.type === 'income' ? sum + t.amount : sum - t.amount; }, 0);
    }
    return acc;
  });
  return accounts;
}
function saveSavingsAccounts(accounts) { saveDataSync(STORE.savings, accounts); }

function getAccount(id) {
  return loadSavingsAccounts().find(function(a) { return a.id === id; });
}

// 获取所有账户在指定年月的交易汇总
function getMonthlySummary(year, month) {
  var accounts = loadSavingsAccounts();
  var monthStr = year + '-' + String(month).padStart(2, '0');
  var totalIncome = 0;
  var totalExpense = 0;
  accounts.forEach(function(acc) {
    (acc.transactions || []).forEach(function(txn) {
      var txnMonth = getMonthKey(txn.date);
      if (txnMonth === monthStr) {
        if (txn.type === 'income') totalIncome += txn.amount;
        else totalExpense += txn.amount;
      }
    });
  });
  return { income: totalIncome, expense: totalExpense, net: totalIncome - totalExpense };
}

// 获取所有账户的年度月度汇总（用于折线图）
function getYearlyMonthlySummary(year) {
  var result = [];
  var accounts = loadSavingsAccounts();
  for (var m = 1; m <= 12; m++) {
    var monthStr = year + '-' + String(m).padStart(2, '0');
    var income = 0, expense = 0;
    accounts.forEach(function(acc) {
      (acc.transactions || []).forEach(function(txn) {
        if (getMonthKey(txn.date) === monthStr) {
          if (txn.type === 'income') income += txn.amount;
          else expense += txn.amount;
        }
      });
    });
    result.push({ month: m, income: income, expense: expense, net: income - expense });
  }
  return result;
}

let calendarCurrentYear = new Date().getFullYear();
let calendarCurrentMonth = new Date().getMonth();

// ============================================================
// Toast & 模态框
// ============================================================
function showToast(message) {
  var toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(function() {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(function() { toast.remove(); }, 300);
  }, 2500);
}
function openModal(html) {
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

// ============================================================
// 仪表盘
// ============================================================
function renderBanner() {
  const banner = loadBanner();
  document.getElementById('themeDisplay').textContent = '🌟 ' + banner.year + ' · ' + banner.theme;
  const container = document.getElementById('starsContainer');
  const areas = loadAreas();
  if (!areas.length) {
    container.innerHTML = '<div style="color: var(--text-muted);">请先创建领域，主页会自动显示领域满意度。</div>';
    return;
  }
  container.innerHTML = areas.map(function(area) {
    var filled = '★'.repeat(Math.round(area.stars || 0));
    var empty = '☆'.repeat(5 - Math.round(area.stars || 0));
    return '<div class="star-item"><span>' + (area.icon || '🌟') + '</span><span>' + area.name + '</span><span class="stars" onclick="editAreaStars(\'' + area.id + '\')" title="点击修改星级">' + filled + empty + '</span></div>';
  }).join('');
}

function renderInbox() {
  var inbox = loadInbox();
  var container = document.getElementById('inboxList');
  if (!inbox.length) {
    container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.95rem;">✅ 收件箱为空，先写下你的灵感。</div>';
    return;
  }
  container.innerHTML = inbox.map(function(item) {
    return '<div class="inbox-item"><span>' + escapeHtml(item.content) + '</span><div class="actions"><button class="small secondary" onclick="processInbox(\'' + item.id + '\', \'project\')">➡️ 项目</button><button class="small secondary" onclick="processInbox(\'' + item.id + '\', \'resource\')">📎 资源</button><button class="small" style="background:var(--primary-soft);color:var(--text-muted);" onclick="deleteInbox(\'' + item.id + '\')">✕</button></div></div>';
  }).join('');
}

function addInbox() {
  var input = document.getElementById('inboxInput');
  var text = input.value.trim();
  if (!text) return alert('请输入内容');
  var inbox = loadInbox();
  inbox.unshift({ id: uid(), content: text, status: '未处理', createdAt: Date.now() });
  saveInbox(inbox);
  input.value = '';
  renderInbox();
}
function deleteInbox(id) {
  saveInbox(loadInbox().filter(function(item) { return item.id !== id; }));
  renderInbox();
}
function processInbox(id, type) {
  var item = loadInbox().find(function(entry) { return entry.id === id; });
  if (!item) return;
  window._pendingInboxId = id;
  if (type === 'project') showNewProjectModal(item.content);
  else showNewResourceModal(item.content);
}
function clearPendingInbox() {
  if (!window._pendingInboxId) return;
  saveInbox(loadInbox().filter(function(item) { return item.id !== window._pendingInboxId; }));
  window._pendingInboxId = null;
  renderInbox();
}

// ===== 获取今日已分配小时数 =====
function getTodayAllocatedHours() {
  var projects = loadProjects();
  var todayStr = today();
  var total = 0;
  projects.forEach(function(proj) {
    (proj.dailyTasks || []).forEach(function(task) {
      if (task.date === todayStr) total += (task.hours || 0);
    });
  });
  return total;
}

// ===== 今日打卡 =====
function renderTodayTasks() {
  var projects = loadProjects().filter(function(proj) { return proj.status === '进行中'; });
  var todayStr = today();
  var tasks = [];
  projects.forEach(function(proj) {
    (proj.dailyTasks || []).forEach(function(task) {
      if (task.date === todayStr) tasks.push({ id: task.id, text: task.text, date: task.date, done: task.done, projectId: proj.id, projectTitle: proj.title, areaId: proj.areaId, hours: task.hours || 0 });
    });
  });
  
  var totalHours = tasks.reduce(function(sum, t) { return sum + t.hours; }, 0);
  var doneHours = tasks.filter(function(t) { return t.done; }).reduce(function(sum, t) { return sum + t.hours; }, 0);
  var remainingHours = 15 - totalHours;
  
  document.getElementById('todayCount').textContent = tasks.length + ' 项 · ' + totalHours.toFixed(1) + 'h / 15h';
  document.getElementById('doneCount').textContent = doneHours.toFixed(1) + 'h';
  document.getElementById('totalCount').textContent = totalHours.toFixed(1) + 'h';
  document.getElementById('todayCompletion').textContent = totalHours ? Math.round(doneHours / totalHours * 100) + '%' : '0%';

  var groups = {};
  var areas = loadAreas();
  tasks.forEach(function(task) {
    var area = areas.find(function(a) { return a.id === task.areaId; });
    var key = area ? area.id : 'none';
    if (!groups[key]) groups[key] = { area: area, tasks: [] };
    groups[key].tasks.push(task);
  });
  var container = document.getElementById('todayTasksContainer');
  if (!tasks.length) {
    container.innerHTML = '<div style="color: var(--text-muted);">今天暂无任务，点击上方按钮添加。</div>';
    return;
  }
  var html = '<div style="display:flex;justify-content:space-between;font-size:0.85rem;color:var(--text-muted);margin-bottom:0.5rem;">' +
    '已分配 <strong>' + totalHours.toFixed(1) + 'h</strong> / 15h，剩余 <strong>' + remainingHours.toFixed(1) + 'h</strong>' +
    '</div>';
  for (var key in groups) {
    var group = groups[key];
    html += '<div class="task-group"><h4>' + (group.area ? group.area.icon || '🌟' : '🌟') + ' ' + (group.area ? group.area.name : '未分类') + '</h4>';
    group.tasks.forEach(function(task) {
      html += '<div class="task-item' + (task.done ? ' done' : '') + '">';
      html += '<input type="checkbox" ' + (task.done ? 'checked' : '') + ' onchange="toggleTask(\'' + task.id + '\', \'' + task.projectId + '\')" />';
      html += '<span class="task-text">' + escapeHtml(task.text) + '</span>';
      html += '<span style="font-size:0.8rem;color:var(--text-muted);">' + task.hours.toFixed(1) + 'h</span>';
      html += '<span class="task-progress">' + escapeHtml(task.projectTitle) + '</span>';
      html += '<button class="small secondary" onclick="deleteTodayTask(\'' + task.id + '\', \'' + task.projectId + '\')" style="background:#FDE8E8;color:#B05858;border-color:#FCD5D5;padding:0.2rem 0.6rem;font-size:0.8rem;">✕</button>';
      html += '</div>';
    });
    html += '</div>';
  }
  container.innerHTML = html;
}

function showAddTodayTaskModal(projectId, areaId) {
  var areas = loadAreas();
  var projects = loadProjects().filter(function(item) { return item.status !== '已完成'; });
  var areaOptions = '<option value="">无领域</option>' + areas.map(function(area) { return '<option value="' + area.id + '" ' + (area.id === areaId ? 'selected' : '') + '>' + area.name + '</option>'; }).join('');
  var projectOptions = '<option value="">📌 今日待办（默认）</option>' + projects.map(function(project) { return '<option value="' + project.id + '" ' + (project.id === projectId ? 'selected' : '') + '>' + escapeHtml(project.title) + '</option>'; }).join('');
  openModal('<h2>📌 今日打卡</h2><div class="form-group"><label>任务内容</label><input id="newTodayTaskText" placeholder="例如：晨跑 30 分钟" /></div><div class="form-group"><label>预估耗时（小时）</label><input id="newTodayTaskHours" type="number" step="0.1" value="1" placeholder="例如 0.5 表示半小时" /></div><div class="form-group"><label>所属项目</label><select id="newTodayTaskProject">' + projectOptions + '</select></div><div class="form-group"><label>所属领域</label><select id="newTodayTaskArea">' + areaOptions + '</select></div><div class="actions"><button class="secondary" onclick="closeModal()">取消</button><button onclick="saveTodayTask()">打卡</button></div>');
}

function saveTodayTask() {
  var text = document.getElementById('newTodayTaskText').value.trim();
  var hours = parseFloat(document.getElementById('newTodayTaskHours').value) || 0;
  var projectId = document.getElementById('newTodayTaskProject').value;
  var areaId = document.getElementById('newTodayTaskArea').value;
  if (!text) return alert('请输入任务内容');
  if (hours <= 0) return alert('请填写有效的预估耗时（大于0）');
  
  // 检查今日剩余时间
  var todayUsed = getTodayAllocatedHours();
  if (todayUsed + hours > 15) {
    alert('⚠️ 今日剩余时间不足！当前已分配 ' + todayUsed.toFixed(1) + 'h，可用 15h，剩余 ' + (15 - todayUsed).toFixed(1) + 'h');
    return;
  }

  var projects = loadProjects();
  var targetProject = projectId ? projects.find(function(p) { return p.id === projectId; }) : null;
  if (!targetProject) {
    targetProject = projects.find(function(p) { return p.title === '📌 今日待办' && p.status === '进行中'; });
  }
  if (!targetProject) {
    targetProject = {
      id: uid(),
      title: '📌 今日待办',
      areaId: areaId || '',
      status: '进行中',
      startDate: today(),
      endDate: today(),
      goalQuantifier: { metric: '任务数', target: 100, current: 0, unit: '项' },
      dailyTasks: [],
      milestones: []
    };
    projects.push(targetProject);
  }
  if (areaId) targetProject.areaId = areaId;
  targetProject.dailyTasks = targetProject.dailyTasks || [];
  targetProject.dailyTasks.push({ id: uid(), text: text, date: today(), done: false, hours: hours });
  saveProjects(projects);
  closeModal();
  renderTodayTasks();
  renderPlanning();
  renderYearlyTime();
  renderWeekPlan();
  renderYearPlan();
  showToast('✅ 已添加任务：' + text + '（' + hours + 'h）');
}

function deleteTodayTask(taskId, projectId) {
  if (!confirm('确定删除这个任务吗？')) return;
  var projects = loadProjects();
  var project = projects.find(function(p) { return p.id === projectId; });
  if (!project) return;
  project.dailyTasks = project.dailyTasks.filter(function(t) { return t.id !== taskId; });
  saveProjects(projects);
  renderTodayTasks();
  renderPlanning();
  renderYearlyTime();
  renderWeekPlan();
  renderYearPlan();
  showToast('🗑️ 任务已删除');
}

function toggleTask(taskId, projectId) {
  var projects = loadProjects();
  var project = projects.find(function(item) { return item.id === projectId; });
  if (!project) return;
  var task = (project.dailyTasks || []).find(function(item) { return item.id === taskId; });
  if (!task) return;
  task.done = !task.done;
  if (task.done) {
    var metric = project.goalQuantifier ? project.goalQuantifier.metric || '进度' : '进度';
    var target = project.goalQuantifier ? project.goalQuantifier.target || 100 : 100;
    var current = project.goalQuantifier ? project.goalQuantifier.current || 0 : 0;
    var unit = project.goalQuantifier ? project.goalQuantifier.unit || '' : '';
    var value = prompt('✅ 完成「' + task.text + '」\n请输入当前' + metric + '（目标' + target + ' ' + unit + '，当前' + current + ' ' + unit + '）：', current);
    if (value !== null && !isNaN(Number(value))) {
      project.goalQuantifier.current = Number(value);
      var logs = loadLogs();
      logs.unshift({ id: uid(), date: today(), content: '打卡：' + task.text + '，' + metric + ' 更新为 ' + Number(value) + ' ' + unit, projectId: projectId, taskId: taskId, createdAt: Date.now() });
      saveLogs(logs);
    }
  }
  saveProjects(projects);
  renderTodayTasks();
  renderAreaOverview();
  renderPlanning();
  updateMinimalistStats();
  renderYearlyTime();
  renderWeekPlan();
  renderYearPlan();
}

function renderAreaOverview() {
  var areas = loadAreas();
  var projects = loadProjects();
  var container = document.getElementById('areaOverview');
  if (!areas.length) {
    container.innerHTML = '<div style="color: var(--text-muted);">还没有领域，去规划页创建。</div>';
    return;
  }
  container.innerHTML = areas.map(function(area) {
    var areaProjects = projects.filter(function(project) { return project.areaId === area.id && project.status === '进行中'; });
    var average = areaProjects.length ? Math.round(areaProjects.reduce(function(sum, project) { return sum + ((project.goalQuantifier ? project.goalQuantifier.current || 0 : 0) / Math.max(1, project.goalQuantifier ? project.goalQuantifier.target || 1 : 1)); }, 0) / areaProjects.length * 100) : 0;
    return '<div class="area-card" onclick="switchToPlanning(\'' + area.id + '\')"><div class="area-icon">' + (area.icon || '🌟') + '</div><div class="area-name">' + area.name + '</div><div class="area-progress">' + areaProjects.length + ' 个项目 · 平均进度 ' + average + '%</div></div>';
  }).join('');
}
function switchToPlanning(areaId) {
  document.querySelectorAll('.nav-bar a').forEach(function(link) { link.classList.toggle('active', link.dataset.page === 'planning'); });
  document.querySelectorAll('.page').forEach(function(page) { page.classList.remove('active'); });
  document.getElementById('page-planning').classList.add('active');
  renderPlanning(areaId);
}

function renderDashboardPage() {
  renderBanner();
  renderInbox();
  renderTodayTasks();
  renderAreaOverview();
  renderCalendar();
  renderYearlyTime();
  renderWeekPlan();
  renderYearPlan();
}

// ============================================================
// 规划
// ============================================================
function renderPlanningDailySummary() {
  var summary = document.getElementById('planningDailySummary');
  var areas = loadAreas();
  var projects = loadProjects();
  var todayStr = today();
  var tasks = [];
  projects.forEach(function(project) {
    (project.dailyTasks || []).forEach(function(task) {
      if (task.date === todayStr) {
        tasks.push({
          id: task.id,
          text: task.text,
          done: task.done,
          projectId: project.id,
          projectTitle: project.title,
          areaId: project.areaId,
          hours: task.hours || 0
        });
      }
    });
  });
  var completedCount = tasks.filter(function(task) { return task.done; }).length;
  var totalCount = tasks.length;
  var totalHours = tasks.reduce(function(sum, t) { return sum + t.hours; }, 0);

  if (!summary) return;
  if (!tasks.length) {
    summary.innerHTML = '<div class="flex-between"><div><h3>📌 今日打卡</h3><div class="muted-text">把今天的行动和项目、领域绑定起来。</div></div><div class="flex"><button class="small secondary" onclick="showAddTodayTaskModal()">➕ 快速打卡</button></div></div><div class="muted-text" style="margin-top:0.6rem;">今天还没有打卡任务，先从一个项目开始。</div>';
    return;
  }

  var groups = {};
  tasks.forEach(function(task) {
    var area = areas.find(function(item) { return item.id === task.areaId; });
    var key = area ? area.id : 'none';
    if (!groups[key]) groups[key] = { area: area, tasks: [] };
    groups[key].tasks.push(task);
  });

  var html = '<div class="flex-between"><div><h3>📌 今日打卡</h3><div class="muted-text">已连接 ' + totalCount + ' 条今日任务，完成 ' + completedCount + '/' + totalCount + '，总耗时 ' + totalHours.toFixed(1) + 'h</div></div><div class="flex"><button class="small secondary" onclick="showAddTodayTaskModal()">➕ 快速打卡</button></div></div><div class="planning-daily-list">';
  Object.keys(groups).forEach(function(key) {
    var group = groups[key];
    html += '<div class="planning-daily-group"><h4>' + (group.area ? (group.area.icon || '🌟') + ' ' + group.area.name : '未分类') + '</h4>';
    group.tasks.forEach(function(task) {
      html += '<label class="planning-task-item' + (task.done ? ' done' : '') + '"><input type="checkbox" ' + (task.done ? 'checked' : '') + ' onchange="toggleTask(\'' + task.id + '\',\'' + task.projectId + '\')" /><span class="task-text">' + escapeHtml(task.text) + '</span><span style="font-size:0.8rem;color:var(--text-muted);">' + task.hours.toFixed(1) + 'h</span><span class="muted-text">· ' + escapeHtml(task.projectTitle) + '</span></label>';
    });
    html += '</div>';
  });
  html += '</div>';
  summary.innerHTML = html;
}

function renderPlanning(targetAreaId) {
  if (targetAreaId === undefined) targetAreaId = null;
  var areas = loadAreas();
  var projects = loadProjects();
  var container = document.getElementById('planningContainer');
  renderPlanningDailySummary();
  if (!areas.length) {
    container.innerHTML = '<div class="card">还没有领域，点击「新建领域」开始规划。</div>';
    return;
  }
  var html = '';
  areas.forEach(function(area) {
    if (targetAreaId && area.id !== targetAreaId) return;
    var areaProjects = projects.filter(function(project) { return project.areaId === area.id; });
    html += '<div class="area-block card"><div class="area-header"><div class="area-title">' + (area.icon || '🌟') + ' ' + area.name + '</div><div class="flex" style="gap:0.5rem;flex-wrap:wrap;"><span class="tag">⭐' + (area.stars || 0) + '</span><button class="small secondary" onclick="editArea(\'' + area.id + '\')">✏️</button><button class="small secondary" onclick="deleteArea(\'' + area.id + '\')">🗑️</button><button class="small" onclick="showNewProjectModal(\'\', \'' + area.id + '\')">➕ 新建项目</button></div></div><div class="project-list">';
    if (areaProjects.length) {
      areaProjects.forEach(function(project) {
        html += renderProjectCard(project);
      });
    } else {
      html += '<div style="color: var(--text-muted);">当前领域暂无项目。</div>';
    }
    html += '</div></div>';
  });
  container.innerHTML = html;
}
function renderProjectCard(project) {
  var progress = Math.min(100, Math.round(((project.goalQuantifier ? project.goalQuantifier.current || 0 : 0) / Math.max(1, project.goalQuantifier ? project.goalQuantifier.target || 1 : 1)) * 100));
  var statusIcons = { '进行中': '🔄', '已完成': '✅', '暂停': '⏸️', '未开始': '⏹' };
  var todayTasks = (project.dailyTasks || []).filter(function(task) { return task.date === today(); });
  var completedToday = todayTasks.filter(function(task) { return task.done; }).length;
  var html = '<div class="project-card"><div class="proj-header"><div><div class="proj-title">' + escapeHtml(project.title) + '</div><div class="proj-meta">' + (statusIcons[project.status] || '') + ' ' + project.status + ' · ' + (project.startDate || '无起始') + ' → ' + (project.endDate || '无结束') + '</div></div><div class="tag">' + (project.goalQuantifier ? project.goalQuantifier.metric || '进度' : '进度') + ' ' + progress + '%</div></div><div class="proj-meta">' + (project.goalQuantifier ? project.goalQuantifier.current || 0 : 0) + ' / ' + (project.goalQuantifier ? project.goalQuantifier.target || 0 : 0) + ' ' + (project.goalQuantifier ? project.goalQuantifier.unit || '' : '') + '</div><div class="proj-meta">今日打卡 ' + completedToday + '/' + todayTasks.length + ' 项</div><div class="proj-progress"><span style="width:' + progress + '%"></span></div><div class="proj-details"><div class="task-list">';
  if (todayTasks.length) {
    todayTasks.forEach(function(task) {
      html += '<label class="tiny-task"><input type="checkbox" ' + (task.done ? 'checked' : '') + ' onchange="toggleTask(\'' + task.id + '\',\'' + project.id + '\')" /><span style="' + (task.done ? 'text-decoration: line-through; color: var(--text-muted);' : '') + '">' + escapeHtml(task.text) + ' (' + task.date + ') ' + (task.hours ? task.hours.toFixed(1) + 'h' : '') + '</span></label>';
    });
  } else {
    html += '<div class="muted-text">今日暂无打卡任务，点击下方按钮添加。</div>';
  }
  html += '</div><div class="flex" style="flex-wrap:wrap; gap:0.6rem; margin-top:0.7rem;"><button class="small secondary" onclick="showAddTodayTaskModal(\'' + project.id + '\',\'' + (project.areaId || '') + '\')">➕ 今日打卡</button><button class="small secondary" onclick="showAddTaskModal(\'' + project.id + '\')">🗓️ 添加计划任务</button><button class="small secondary" onclick="editProject(\'' + project.id + '\')">✏️ 编辑</button><button class="small secondary" onclick="deleteProject(\'' + project.id + '\')">🗑️ 删除</button><button class="small secondary" onclick="changeProjectStatus(\'' + project.id + '\')">🔄 状态</button></div></div></div>';
  return html;
}
function showAddTaskModal(projectId) {
  openModal('<h2>🗓️ 添加计划任务</h2><div class="form-group"><label>任务内容</label><input id="newTaskText" placeholder="例如：复盘周计划" /></div><div class="form-group"><label>预估耗时（小时）</label><input id="newTaskHours" type="number" step="0.1" value="1" placeholder="例如 0.5" /></div><div class="form-group"><label>计划日期</label><input id="newTaskDate" type="date" value="' + today() + '" /></div><div class="actions"><button class="secondary" onclick="closeModal()">取消</button><button onclick="saveNewTask(\'' + projectId + '\')">添加</button></div>');
}
function saveNewTask(projectId) {
  var text = document.getElementById('newTaskText').value.trim();
  var hours = parseFloat(document.getElementById('newTaskHours').value) || 0;
  var date = document.getElementById('newTaskDate').value;
  if (!text) return alert('请输入任务内容');
  if (hours <= 0) return alert('请填写有效的预估耗时（大于0）');
  var projects = loadProjects();
  var project = projects.find(function(item) { return item.id === projectId; });
  if (!project) return;
  project.dailyTasks = project.dailyTasks || [];
  project.dailyTasks.unshift({ id: uid(), text: text, date: date, done: false, hours: hours });
  saveProjects(projects);
  closeModal();
  renderPlanning();
  renderTodayTasks();
  renderYearlyTime();
  renderWeekPlan();
  renderYearPlan();
}
function changeProjectStatus(projectId) {
  var project = getProject(projectId);
  if (!project) return;
  var statuses = ['未开始', '进行中', '暂停', '已完成'];
  var nextStatus = statuses[(statuses.indexOf(project.status) + 1) % statuses.length] || '进行中';
  if (!confirm('将项目「' + project.title + '」状态从「' + project.status + '」改为「' + nextStatus + '」？')) return;
  project.status = nextStatus;
  var projects = loadProjects();
  for (var i = 0; i < projects.length; i++) {
    if (projects[i].id === projectId) {
      projects[i] = project;
      break;
    }
  }
  saveProjects(projects);
  renderPlanning();
  renderTodayTasks();
  renderAreaOverview();
}
function editProject(projectId) {
  var project = getProject(projectId);
  if (!project) return;
  var areas = loadAreas();
  var areaOptions = areas.map(function(area) {
    return '<option value="' + area.id + '" ' + (area.id === project.areaId ? 'selected' : '') + '>' + area.name + '</option>';
  }).join('');
  openModal('<h2>✏️ 编辑项目</h2><div class="form-group"><label>标题</label><input id="editProjTitle" value="' + escapeHtml(project.title) + '" /></div><div class="form-group"><label>所属领域</label><select id="editProjArea">' + areaOptions + '</select></div><div class="form-group"><label>指标名称</label><input id="editProjMetric" value="' + escapeHtml(project.goalQuantifier ? project.goalQuantifier.metric || '' : '') + '" /></div><div class="form-group"><label>目标值</label><input id="editProjTarget" type="number" value="' + (project.goalQuantifier ? project.goalQuantifier.target || 0 : 0) + '" /></div><div class="form-group"><label>当前值</label><input id="editProjCurrent" type="number" value="' + (project.goalQuantifier ? project.goalQuantifier.current || 0 : 0) + '" /></div><div class="form-group"><label>单位</label><input id="editProjUnit" value="' + escapeHtml(project.goalQuantifier ? project.goalQuantifier.unit || '' : '') + '" /></div><div class="form-group"><label>开始日期</label><input id="editProjStart" type="date" value="' + (project.startDate || '') + '" /></div><div class="form-group"><label>结束日期</label><input id="editProjEnd" type="date" value="' + (project.endDate || '') + '" /></div><div class="actions"><button class="secondary" onclick="closeModal()">取消</button><button onclick="saveEditProject(\'' + projectId + '\')">保存</button></div>');
}
function saveEditProject(projectId) {
  var title = document.getElementById('editProjTitle').value.trim();
  var areaId = document.getElementById('editProjArea').value;
  var metric = document.getElementById('editProjMetric').value.trim();
  var target = Number(document.getElementById('editProjTarget').value) || 0;
  var current = Number(document.getElementById('editProjCurrent').value) || 0;
  var unit = document.getElementById('editProjUnit').value.trim();
  var startDate = document.getElementById('editProjStart').value;
  var endDate = document.getElementById('editProjEnd').value;
  if (!title) return alert('请输入项目标题');
  var projects = loadProjects();
  var project = projects.find(function(item) { return item.id === projectId; });
  if (!project) return;
  project.title = title;
  project.areaId = areaId;
  project.goalQuantifier = { metric: metric, target: target, current: current, unit: unit };
  project.startDate = startDate;
  project.endDate = endDate;
  saveProjects(projects);
  closeModal();
  renderPlanning();
  renderTodayTasks();
  renderAreaOverview();
}
function deleteProject(projectId) {
  if (!confirm('确定删除该项目？')) return;
  saveProjects(loadProjects().filter(function(item) { return item.id !== projectId; }));
  renderPlanning();
  renderTodayTasks();
  renderAreaOverview();
}
function deleteArea(areaId) {
  if (!confirm('删除该领域会同时删除其下的所有项目，确定？')) return;
  saveAreas(loadAreas().filter(function(item) { return item.id !== areaId; }));
  saveProjects(loadProjects().filter(function(project) { return project.areaId !== areaId; }));
  renderPlanning();
  renderTodayTasks();
  renderAreaOverview();
  renderBanner();
}
function editArea(areaId) {
  var area = getArea(areaId);
  if (!area) return;
  openModal('<h2>✏️ 编辑领域</h2><div class="form-group"><label>名称</label><input id="editAreaName" value="' + escapeHtml(area.name) + '" /></div><div class="form-group"><label>图标</label><input id="editAreaIcon" value="' + escapeHtml(area.icon || '🌟') + '" /></div><div class="form-group"><label>星级</label><input id="editAreaStars" type="number" min="1" max="5" step="0.5" value="' + (area.stars || 0) + '" /></div><div class="actions"><button class="secondary" onclick="closeModal()">取消</button><button onclick="saveEditArea(\'' + areaId + '\')">保存</button></div>');
}
function saveEditArea(areaId) {
  var name = document.getElementById('editAreaName').value.trim();
  var icon = document.getElementById('editAreaIcon').value.trim() || '🌟';
  var stars = Number(document.getElementById('editAreaStars').value) || 0;
  if (!name) return alert('请输入名称');
  var areas = loadAreas();
  var area = areas.find(function(item) { return item.id === areaId; });
  if (!area) return;
  area.name = name;
  area.icon = icon;
  area.stars = Math.min(5, Math.max(0, stars));
  saveAreas(areas);
  closeModal();
  renderBanner();
  renderPlanning();
  renderAreaOverview();
}
function showNewAreaModal() {
  openModal('<h2>➕ 新建领域</h2><div class="form-group"><label>名称</label><input id="newAreaName" placeholder="例如：学习" /></div><div class="form-group"><label>图标</label><input id="newAreaIcon" placeholder="📉" value="🌟" /></div><div class="form-group"><label>星级</label><input id="newAreaStars" type="number" min="1" max="5" step="0.5" value="3" /></div><div class="actions"><button class="secondary" onclick="closeModal()">取消</button><button onclick="saveNewArea()">创建</button></div>');
}
function saveNewArea() {
  var name = document.getElementById('newAreaName').value.trim();
  var icon = document.getElementById('newAreaIcon').value.trim() || '🌟';
  var stars = Number(document.getElementById('newAreaStars').value) || 0;
  if (!name) return alert('请输入名称');
  var areas = loadAreas();
  areas.unshift({ id: uid(), name: name, icon: icon, stars: Math.min(5, Math.max(0, stars)) });
  saveAreas(areas);
  closeModal();
  renderBanner();
  renderPlanning();
  renderAreaOverview();
}
function showNewProjectModal(prefillTitle, prefillAreaId) {
  if (prefillTitle === undefined) prefillTitle = '';
  if (prefillAreaId === undefined) prefillAreaId = '';
  var areas = loadAreas();
  if (!areas.length) { alert('请先创建领域'); return; }
  var areaOptions = areas.map(function(area) {
    return '<option value="' + area.id + '" ' + (area.id === prefillAreaId ? 'selected' : '') + '>' + area.name + '</option>';
  }).join('');
  openModal('<h2>➕ 新建项目</h2><div class="form-group"><label>标题</label><input id="newProjTitle" value="' + escapeHtml(prefillTitle) + '" placeholder="例如：Q3 减脂计划" /></div><div class="form-group"><label>所属领域</label><select id="newProjArea">' + areaOptions + '</select></div><div class="form-group"><label>指标名称</label><input id="newProjMetric" placeholder="体重" /></div><div class="form-group"><label>目标值</label><input id="newProjTarget" type="number" placeholder="70" /></div><div class="form-group"><label>当前值</label><input id="newProjCurrent" type="number" placeholder="75" value="0" /></div><div class="form-group"><label>单位</label><input id="newProjUnit" placeholder="kg" /></div><div class="form-group"><label>开始日期</label><input id="newProjStart" type="date" value="' + today() + '" /></div><div class="form-group"><label>结束日期</label><input id="newProjEnd" type="date" /></div><div class="actions"><button class="secondary" onclick="closeModal()">取消</button><button onclick="saveNewProject()">创建</button></div>');
}
function saveNewProject() {
  var title = document.getElementById('newProjTitle').value.trim();
  var areaId = document.getElementById('newProjArea').value;
  var metric = document.getElementById('newProjMetric').value.trim();
  var target = Number(document.getElementById('newProjTarget').value) || 0;
  var current = Number(document.getElementById('newProjCurrent').value) || 0;
  var unit = document.getElementById('newProjUnit').value.trim();
  var startDate = document.getElementById('newProjStart').value;
  var endDate = document.getElementById('newProjEnd').value;
  if (!title) return alert('请输入项目标题');
  var projects = loadProjects();
  projects.unshift({ id: uid(), title: title, areaId: areaId, status: '进行中', startDate: startDate, endDate: endDate, goalQuantifier: { metric: metric, target: target, current: current, unit: unit }, dailyTasks: [], milestones: [] });
  saveProjects(projects);
  clearPendingInbox();
  closeModal();
  renderPlanning();
  renderTodayTasks();
  renderAreaOverview();
}

// ============================================================
// 资源
// ============================================================
function renderResources() {
  var resources = loadResources();
  var areas = loadAreas();
  var projects = loadProjects();
  var areaSelect = document.getElementById('filterArea');
  var projectSelect = document.getElementById('filterProject');
  var currentArea = areaSelect.value;
  var currentProject = projectSelect.value;
  areaSelect.innerHTML = '<option value="">全部领域</option>' + areas.map(function(area) { return '<option value="' + area.id + '">' + area.name + '</option>'; }).join('');
  projectSelect.innerHTML = '<option value="">全部项目</option>' + projects.map(function(project) { return '<option value="' + project.id + '">' + project.title + '</option>'; }).join('');
  areaSelect.value = currentArea || '';
  projectSelect.value = currentProject || '';
  var search = document.getElementById('filterSearch').value.trim().toLowerCase();
  var filtered = resources.filter(function(item) {
    var areaMatch = !areaSelect.value || item.areaId === areaSelect.value;
    var projectMatch = !projectSelect.value || item.projectId === projectSelect.value;
    var searchMatch = !search || item.title.toLowerCase().includes(search) || item.content.toLowerCase().includes(search);
    return areaMatch && projectMatch && searchMatch;
  });
  var container = document.getElementById('resourceGrid');
  if (!filtered.length) {
    container.innerHTML = '<div style="color: var(--text-muted);">📥 暂无资源，点击「新建资源」或从收件箱转换。</div>';
    return;
  }
  container.innerHTML = filtered.map(function(item) {
    var area = areas.find(function(a) { return a.id === item.areaId; });
    var project = projects.find(function(p) { return p.id === item.projectId; });
    var fileHtml = item.fileData ? '<div><a href="' + item.fileData + '" download="' + item.fileName + '" class="file-download-link">📎 ' + item.fileName + '</a></div>' : '';
    return '<div class="resource-card"><div class="res-title">' + escapeHtml(item.title) + '</div><div class="res-meta"><span>' + (area ? '领域：' + area.name : '') + '</span><span>' + (project ? '项目：' + project.title : '') + '</span><span>' + new Date(item.createdAt).toLocaleDateString() + '</span></div><div class="res-content">' + escapeHtml(item.content) + '</div>' + fileHtml + '<div class="flex" style="justify-content: flex-end; gap:0.5rem;"><button class="small secondary" onclick="editResource(\'' + item.id + '\')">✏️ 编辑</button><button class="small secondary" onclick="deleteResource(\'' + item.id + '\')">🗑️ 删除</button></div></div>';
  }).join('');
}
function showNewResourceModal(prefillTitle) {
  if (prefillTitle === undefined) prefillTitle = '';
  var areas = loadAreas();
  var projects = loadProjects();
  openModal('<h2>📎 新建资源</h2><div class="form-group"><label>标题</label><input id="newResTitle" value="' + escapeHtml(prefillTitle) + '" /></div><div class="form-group"><label>内容（文本）</label><textarea id="newResContent" rows="5"></textarea></div><div class="form-group"><label>上传文件（可选）</label><div class="file-upload-area" onclick="document.getElementById(\'newResFile\').click()"><input type="file" id="newResFile" onchange="handleFileSelect(this, \'newResFileName\')" /><span id="newResFileName">点击选择文件</span></div></div><div class="form-group"><label>关联领域</label><select id="newResArea"><option value="">无</option>' + areas.map(function(area) { return '<option value="' + area.id + '">' + area.name + '</option>'; }).join('') + '</select></div><div class="form-group"><label>关联项目</label><select id="newResProject"><option value="">无</option>' + projects.map(function(project) { return '<option value="' + project.id + '">' + project.title + '</option>'; }).join('') + '</select></div><div class="actions"><button class="secondary" onclick="closeModal()">取消</button><button onclick="saveNewResourceWithFile()">保存</button></div>');
}
function saveNewResourceWithFile() {
  var title = document.getElementById('newResTitle').value.trim();
  var content = document.getElementById('newResContent').value.trim();
  var areaId = document.getElementById('newResArea').value || null;
  var projectId = document.getElementById('newResProject').value || null;
  var fileInput = document.getElementById('newResFile');
  var file = fileInput.files[0];
  if (!title) return alert('请输入标题');
  if (!content && !file) return alert('请输入内容或上传文件');
  var resources = loadResources();
  var newResource = { id: uid(), title: title, content: content, areaId: areaId, projectId: projectId, createdAt: Date.now() };
  if (file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      newResource.fileData = e.target.result;
      newResource.fileName = file.name;
      newResource.fileType = file.type;
      resources.unshift(newResource);
      saveResources(resources);
      clearPendingInbox();
      closeModal();
      renderResources();
      showToast('✅ 资源已添加（含文件）');
    };
    reader.readAsDataURL(file);
  } else {
    resources.unshift(newResource);
    saveResources(resources);
    clearPendingInbox();
    closeModal();
    renderResources();
    showToast('✅ 资源已添加');
  }
}
function editResource(resourceId) {
  var resource = getResource(resourceId);
  if (!resource) return;
  var areas = loadAreas();
  var projects = loadProjects();
  var fileHtml = resource.fileData ? '<div style="margin-top:0.3rem;"><a href="' + resource.fileData + '" download="' + resource.fileName + '" class="file-download-link">📎 ' + resource.fileName + '</a></div>' : '未上传文件';
  openModal('<h2>✏️ 编辑资源</h2><div class="form-group"><label>标题</label><input id="editResTitle" value="' + escapeHtml(resource.title) + '" /></div><div class="form-group"><label>内容（文本）</label><textarea id="editResContent" rows="5">' + escapeHtml(resource.content) + '</textarea></div><div class="form-group"><label>当前文件</label>' + fileHtml + '<div style="margin-top:0.3rem;"><div class="file-upload-area" onclick="document.getElementById(\'editResFile\').click()"><input type="file" id="editResFile" onchange="handleFileSelect(this, \'editResFileName\')" /><span id="editResFileName">点击更换文件</span></div></div></div><div class="form-group"><label>关联领域</label><select id="editResArea"><option value="">无</option>' + areas.map(function(area) { return '<option value="' + area.id + '" ' + (area.id === resource.areaId ? 'selected' : '') + '>' + area.name + '</option>'; }).join('') + '</select></div><div class="form-group"><label>关联项目</label><select id="editResProject"><option value="">无</option>' + projects.map(function(project) { return '<option value="' + project.id + '" ' + (project.id === resource.projectId ? 'selected' : '') + '>' + project.title + '</option>'; }).join('') + '</select></div><div class="actions"><button class="secondary" onclick="closeModal()">取消</button><button onclick="saveEditResourceWithFile(\'' + resourceId + '\')">保存</button></div>');
}
function saveEditResourceWithFile(resourceId) {
  var title = document.getElementById('editResTitle').value.trim();
  var content = document.getElementById('editResContent').value.trim();
  var areaId = document.getElementById('editResArea').value || null;
  var projectId = document.getElementById('editResProject').value || null;
  var fileInput = document.getElementById('editResFile');
  var file = fileInput.files[0];
  if (!title) return alert('请输入标题');
  var resources = loadResources();
  var resource = resources.find(function(r) { return r.id === resourceId; });
  if (!resource) return;
  resource.title = title;
  resource.content = content;
  resource.areaId = areaId;
  resource.projectId = projectId;
  if (file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      resource.fileData = e.target.result;
      resource.fileName = file.name;
      resource.fileType = file.type;
      saveResources(resources);
      closeModal();
      renderResources();
      showToast('✅ 资源已更新（含文件）');
    };
    reader.readAsDataURL(file);
  } else {
    saveResources(resources);
    closeModal();
    renderResources();
    showToast('✅ 资源已更新');
  }
}
function handleFileSelect(input, displayId) {
  var file = input.files[0];
  if (file) {
    document.getElementById(displayId).textContent = file.name + ' (' + (file.size/1024).toFixed(1) + ' KB)';
  }
}
function deleteResource(resourceId) {
  if (!confirm('确定删除该资源？')) return;
  saveResources(loadResources().filter(function(item) { return item.id !== resourceId; }));
  renderResources();
}

function editBanner() {
  var banner = loadBanner();
  openModal('<h2>✏️ 编辑年度主题</h2><div class="form-group"><label>年份</label><input id="bannerYear" type="number" value="' + banner.year + '" /></div><div class="form-group"><label>主题词</label><input id="bannerTheme" value="' + escapeHtml(banner.theme) + '" /></div><div class="actions"><button class="secondary" onclick="closeModal()">取消</button><button onclick="saveBannerFromModal()">保存</button></div>');
}
function saveBannerFromModal() {
  var year = Number(document.getElementById('bannerYear').value) || new Date().getFullYear();
  var theme = document.getElementById('bannerTheme').value.trim() || '';
  saveBanner({ year: year, theme: theme });
  closeModal();
  renderBanner();
}
function editAreaStars(areaId) {
  var area = getArea(areaId);
  if (!area) return;
  openModal('<h2>⭐ 修改领域满意度</h2><div class="form-group"><label>' + (area.icon || '🌟') + ' ' + area.name + ' 星级</label><input id="starValue" type="number" min="1" max="5" step="0.5" value="' + (area.stars || 0) + '" /></div><div class="actions"><button class="secondary" onclick="closeModal()">取消</button><button onclick="saveAreaStars(\'' + areaId + '\')">保存</button></div>');
}
function saveAreaStars(areaId) {
  var stars = Number(document.getElementById('starValue').value) || 0;
  var areas = loadAreas();
  var area = areas.find(function(item) { return item.id === areaId; });
  if (!area) return;
  area.stars = Math.min(5, Math.max(0, stars));
  saveAreas(areas);
  closeModal();
  renderBanner();
  renderAreaOverview();
  renderPlanning();
}

// ============================================================
// 日历
// ============================================================
function renderCalendar() {
  const year = calendarCurrentYear;
  const month = calendarCurrentMonth;
  document.getElementById('calendarMonthYear').textContent = year + '年' + (month + 1) + '月';
  const grid = document.getElementById('calendarGrid');
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const todayStr = today();
  const events = loadCalendarEvents();
  let html = '';
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  weekdays.forEach(function(wd) {
    html += '<div class="weekday-header">' + wd + '</div>';
  });
  for (let i = firstDay - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    html += '<div class="calendar-day other-month" data-date="' + (year + '-' + String(month).padStart(2,'0') + '-' + String(day).padStart(2,'0')) + '">' + day + '</div>';
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    let cls = 'calendar-day';
    if (dateStr === todayStr) cls += ' today';
    if (events[dateStr] && events[dateStr].length) cls += ' has-event';
    html += '<div class="' + cls + '" onclick="showDayEvents(\'' + dateStr + '\')">' + d + '</div>';
  }
  const totalCells = firstDay + daysInMonth;
  const remaining = (7 - totalCells % 7) % 7;
  for (let d = 1; d <= remaining; d++) {
    const dateStr = year + '-' + String(month + 2).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    html += '<div class="calendar-day other-month" data-date="' + dateStr + '">' + d + '</div>';
  }
  grid.innerHTML = html;
}
function changeMonth(delta) {
  calendarCurrentMonth += delta;
  if (calendarCurrentMonth < 0) { calendarCurrentMonth = 11; calendarCurrentYear--; }
  if (calendarCurrentMonth > 11) { calendarCurrentMonth = 0; calendarCurrentYear++; }
  renderCalendar();
}
function showDayEvents(dateStr) {
  const events = loadCalendarEvents();
  const dayEvents = events[dateStr] || [];
  let listHtml = dayEvents.map(function(evt) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:0.4rem 0;border-bottom:1px solid var(--border-light);"><div><strong>' + escapeHtml(evt.title) + '</strong><br><span style="font-size:0.85rem;color:var(--text-muted);">' + escapeHtml(evt.description || '') + '</span></div><button class="small secondary" onclick="deleteCalendarEvent(\'' + dateStr + '\',\'' + evt.id + '\')" style="background:#FDE8E8;color:#B05858;border-color:#FCD5D5;padding:0.2rem 0.6rem;">✕</button></div>';
  }).join('');
  if (!dayEvents.length) listHtml = '<div style="color:var(--text-muted);padding:1rem 0;">这一天还没有事件。</div>';
  openModal('<h2>📅 ' + dateStr + ' 的事件</h2>' + listHtml +
    '<div style="margin-top:1rem;"><button onclick="showAddCalendarEvent(\'' + dateStr + '\')" style="background:var(--primary);">➕ 添加事件</button></div>' +
    '<div class="actions"><button class="secondary" onclick="closeModal()">关闭</button></div>');
}
function showAddCalendarEvent(dateStr) {
  openModal('<h2>📅 添加事件</h2><div class="form-group"><label>标题</label><input id="calEventTitle" placeholder="事件标题" /></div><div class="form-group"><label>描述</label><textarea id="calEventDesc" rows="3"></textarea></div><div class="actions"><button class="secondary" onclick="closeModal()">取消</button><button onclick="saveCalendarEvent(\'' + dateStr + '\')">保存</button></div>');
}
function saveCalendarEvent(dateStr) {
  var title = document.getElementById('calEventTitle').value.trim();
  var desc = document.getElementById('calEventDesc').value.trim();
  if (!title) return alert('请输入标题');
  var events = loadCalendarEvents();
  if (!events[dateStr]) events[dateStr] = [];
  events[dateStr].push({ id: uid(), title: title, description: desc });
  saveCalendarEvents(events);
  closeModal();
  renderCalendar();
  showToast('✅ 事件已添加');
}
function deleteCalendarEvent(dateStr, eventId) {
  if (!confirm('确定删除此事件？')) return;
  var events = loadCalendarEvents();
  if (events[dateStr]) {
    events[dateStr] = events[dateStr].filter(function(e) { return e.id !== eventId; });
    if (!events[dateStr].length) delete events[dateStr];
    saveCalendarEvents(events);
    renderCalendar();
    showToast('🗑️ 事件已删除');
    showDayEvents(dateStr);
  }
}

// ============================================================
// 新版物品清单
// ============================================================
let currentItemFilter = 'all';
let currentItemSearch = '';
let collapsedCategories = {};

function getCategoryIcon(category) {
  var icons = {
    '衣物': '👕', '生活用品': '🧴', '电子产品': '📱', '书籍': '📚',
    '家具': '🪑', '厨具': '🍳', '文具': '✏️', '饰品': '💎', '其他': '📦'
  };
  return icons[category] || '📦';
}

function renderItems() {
  var items = loadItems();
  var container = document.getElementById('itemList');
  var filtered = items.filter(function(item) {
    var searchMatch = !currentItemSearch ||
      item.name.toLowerCase().includes(currentItemSearch.toLowerCase()) ||
      (item.note && item.note.toLowerCase().includes(currentItemSearch.toLowerCase()));
    var statusMatch = currentItemFilter === 'all' || item.status === currentItemFilter;
    return searchMatch && statusMatch;
  });

  var totalCount = items.length;
  var retainedCount = items.filter(function(i) { return i.status === '保留'; }).length;
  var pendingCount = items.filter(function(i) { return i.status === '待清理'; }).length;
  var declutteredCount = items.filter(function(i) { return i.status === '已清理'; }).length;
  var activeCount = retainedCount + pendingCount;

  var categories = {};
  var categoryList = ['衣物', '生活用品', '电子产品', '书籍', '家具', '厨具', '文具', '饰品', '其他'];
  filtered.forEach(function(item) {
    var cat = item.category || '其他';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(item);
  });

  var html = '';
  html += '<div class="item-stats-bar">' +
    '<span class="stat-item"><span class="num">' + activeCount + '</span><span class="label">总物品</span></span>' +
    '<span class="stat-item"><span class="num" style="color:var(--success);">' + retainedCount + '</span><span class="label">✅ 保留</span></span>' +
    '<span class="stat-item"><span class="num" style="color:#D4A84A;">' + pendingCount + '</span><span class="label">⏳ 待清理</span></span>' +
    '<span class="stat-item"><span class="num" style="color:var(--text-light);">' + declutteredCount + '</span><span class="label">已清理</span></span>' +
    '<span class="stat-item"><span class="num">' + Object.keys(categories).length + '</span><span class="label">分类</span></span>' +
  '</div>';

  html += '<div class="item-search-box">' +
    '<input id="itemSearchInput" placeholder="🔍 搜索物品..." value="' + escapeHtml(currentItemSearch) + '" oninput="applyItemSearch()" />' +
    (currentItemSearch ? '<span class="search-clear" onclick="clearItemSearch()">✕</span>' : '') +
  '</div>';

  html += '<div class="item-filter-bar">' +
    '<button class="filter-btn ' + (currentItemFilter === 'all' ? 'active' : '') + '" onclick="setItemFilter(\'all\')">全部</button>' +
    '<button class="filter-btn ' + (currentItemFilter === '保留' ? 'active' : '') + '" onclick="setItemFilter(\'保留\')" style="border-color:var(--success);">✅ 保留</button>' +
    '<button class="filter-btn ' + (currentItemFilter === '待清理' ? 'active' : '') + '" onclick="setItemFilter(\'待清理\')" style="border-color:#D4A84A;">⏳ 待清理</button>' +
    '<button class="filter-btn ' + (currentItemFilter === '已清理' ? 'active' : '') + '" onclick="setItemFilter(\'已清理\')" style="border-color:var(--text-light);">已清理</button>' +
  '</div>';

  if (!filtered.length) {
    html += '<div class="empty-items-state">' +
      '<span class="empty-icon">📭</span>' +
      (currentItemSearch ? '没有匹配 "' + escapeHtml(currentItemSearch) + '" 的物品' : '还没有物品，点击「+ 添加」开始记录') +
    '</div>';
    container.innerHTML = html;
    return;
  }

  var sortedCategories = categoryList.filter(function(cat) { return categories[cat] && categories[cat].length; });
  var otherCats = Object.keys(categories).filter(function(cat) { return categoryList.indexOf(cat) === -1; });
  var allCats = sortedCategories.concat(otherCats);

  allCats.forEach(function(cat) {
    var itemsInCat = categories[cat] || [];
    if (!itemsInCat.length) return;
    if (collapsedCategories[cat] === undefined) collapsedCategories[cat] = false;
    var isCollapsed = collapsedCategories[cat];
    var countRetained = itemsInCat.filter(function(i) { return i.status === '保留'; }).length;
    var countPending = itemsInCat.filter(function(i) { return i.status === '待清理'; }).length;

    html += '<div class="category-group">' +
      '<div class="category-header" onclick="toggleCategory(\'' + cat + '\')">' +
        '<span class="category-name">' + getCategoryIcon(cat) + ' ' + cat +
          ' <span style="font-weight:400;font-size:0.8rem;color:var(--text-muted);">(' + (countRetained + countPending) + ' 在用)</span>' +
        '</span>' +
        '<span>' +
          '<span class="category-count">' + itemsInCat.length + ' 件</span>' +
          '<span class="category-toggle ' + (isCollapsed ? 'collapsed' : '') + '">▼</span>' +
        '</span>' +
      '</div>' +
      '<div class="category-items' + (isCollapsed ? ' collapsed' : '') + '" style="max-height:' + (isCollapsed ? '0' : (itemsInCat.length * 120 + 40)) + 'px;">';

    itemsInCat.forEach(function(item) {
      var statusClass = item.status === '保留' ? 'retained' : (item.status === '待清理' ? 'pending' : 'decluttered');
      var isDecluttered = item.status === '已清理';
      html += '<div class="item-card' + (isDecluttered ? ' decluttered' : '') + '">' +
        '<div class="item-card-name">' +
          '<span class="status-dot ' + statusClass + '"></span>' +
          escapeHtml(item.name) +
          (item.note ? ' <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">💬 ' + escapeHtml(item.note) + '</span>' : '') +
        '</div>' +
        '<div class="item-card-meta">' +
          '<span>' + (item.status === '保留' ? '✅ 保留' : (item.status === '待清理' ? '⏳ 待清理' : '🗑️ 已清理')) + '</span>' +
          '<span class="item-added-date">📅 ' + (item.addedDate || '未知') + '</span>' +
        '</div>' +
        '<div class="item-card-actions">' +
          '<button class="btn-edit" onclick="editItem(\'' + item.id + '\')">✏️ 编辑</button>';
      if (isDecluttered) {
        html += '<button class="btn-restore" onclick="restoreItem(\'' + item.id + '\')">↩️ 恢复</button>';
      } else {
        html += '<button class="btn-declutter" onclick="declutterItem(\'' + item.id + '\')">🗑️ 清理</button>';
      }
      html += '</div></div>';
    });
    html += '</div></div>';
  });
  container.innerHTML = html;
}

function toggleCategory(category) {
  if (collapsedCategories[category] !== undefined) {
    collapsedCategories[category] = !collapsedCategories[category];
  } else {
    collapsedCategories[category] = true;
  }
  renderItems();
}
function setItemFilter(filter) {
  currentItemFilter = filter;
  renderItems();
}
function applyItemSearch() {
  var input = document.getElementById('itemSearchInput');
  currentItemSearch = input ? input.value.trim() : '';
  renderItems();
}
function clearItemSearch() {
  currentItemSearch = '';
  renderItems();
}
function restoreItem(itemId) {
  if (!confirm('确定要恢复这件物品吗？')) return;
  var items = loadItems();
  var item = items.find(function(i) { return i.id === itemId; });
  if (item) {
    item.status = '保留';
    delete item.declutteredDate;
    saveItems(items);
    renderItems();
    updateMinimalistStats();
    showToast('↩️ 已恢复：' + item.name);
  }
}
function showAddItemModal() {
  var categoryOptions = ['衣物','生活用品','电子产品','书籍','家具','厨具','文具','饰品','其他'].map(function(cat) {
    return '<option value="' + cat + '">' + getCategoryIcon(cat) + ' ' + cat + '</option>';
  }).join('');
  openModal('<h2>📦 添加物品</h2><div class="form-group"><label>物品名称 <span style="color: var(--primary);">*</span></label><input id="newItemName" placeholder="例如：冬季外套" /></div><div class="form-group"><label>分类</label><select id="newItemCategory">' + categoryOptions + '</select></div><div class="form-group"><label>备注</label><textarea id="newItemNote" rows="2" placeholder="购买时间、使用频率等"></textarea></div><div class="actions"><button class="secondary" onclick="closeModal()">取消</button><button onclick="saveNewItem()">添加</button></div>');
}
function saveNewItem() {
  var name = document.getElementById('newItemName').value.trim();
  var category = document.getElementById('newItemCategory').value;
  var note = document.getElementById('newItemNote').value.trim();
  if (!name) return alert('请输入物品名称');
  var items = loadItems();
  items.push({ id: uid(), name: name, category: category, status: '保留', addedDate: today(), note: note });
  saveItems(items);
  closeModal();
  renderItems();
  updateMinimalistStats();
  showToast('✅ 已添加：' + name);
}
function editItem(itemId) {
  var items = loadItems();
  var item = items.find(function(i) { return i.id === itemId; });
  if (!item) return;
  var categoryOptions = ['衣物','生活用品','电子产品','书籍','家具','厨具','文具','饰品','其他'].map(function(cat) {
    return '<option value="' + cat + '" ' + (item.category === cat ? 'selected' : '') + '>' + getCategoryIcon(cat) + ' ' + cat + '</option>';
  }).join('');
  openModal('<h2>✏️ 编辑物品</h2><div class="form-group"><label>物品名称</label><input id="editItemName" value="' + escapeHtml(item.name) + '" /></div><div class="form-group"><label>分类</label><select id="editItemCategory">' + categoryOptions + '</select></div><div class="form-group"><label>状态</label><select id="editItemStatus"><option value="保留" ' + (item.status === '保留' ? 'selected' : '') + '>✅ 保留</option><option value="待清理" ' + (item.status === '待清理' ? 'selected' : '') + '>⏳ 待清理</option><option value="已清理" ' + (item.status === '已清理' ? 'selected' : '') + '>🗑️ 已清理</option></select></div><div class="form-group"><label>备注</label><textarea id="editItemNote" rows="2">' + escapeHtml(item.note || '') + '</textarea></div><div class="actions"><button class="secondary" onclick="closeModal()">取消</button><button onclick="saveEditItem(\'' + itemId + '\')">保存</button></div>');
}
function saveEditItem(itemId) {
  var name = document.getElementById('editItemName').value.trim();
  var category = document.getElementById('editItemCategory').value;
  var status = document.getElementById('editItemStatus').value;
  var note = document.getElementById('editItemNote').value.trim();
  if (!name) return alert('请输入物品名称');
  var items = loadItems();
  var item = items.find(function(i) { return i.id === itemId; });
  if (!item) return;
  item.name = name;
  item.category = category;
  item.status = status;
  item.note = note;
  if (status === '已清理' && !item.declutteredDate) {
    item.declutteredDate = today();
  }
  saveItems(items);
  closeModal();
  renderItems();
  updateMinimalistStats();
}
function declutterItem(itemId) {
  if (!confirm('确定要清理这件物品吗？\n（它将移到「已清理」列表）')) return;
  var items = loadItems();
  var item = items.find(function(i) { return i.id === itemId; });
  if (item) {
    item.status = '已清理';
    item.declutteredDate = today();
    saveItems(items);
    renderItems();
    updateMinimalistStats();
    showToast('✅ 已清理：' + item.name);
  }
}
function showDeclutteredItems() {
  var items = loadItems();
  var decluttered = items.filter(function(item) { return item.status === '已清理'; });
  if (!decluttered.length) {
    alert('还没有清理过任何物品，继续加油！🧹');
    return;
  }
  var list = decluttered.map(function(item) {
    return '  • ' + item.name + '（' + item.category + '）清理于 ' + (item.declutteredDate || item.addedDate || '未知日期');
  }).join('\n');
  alert('📋 已清理物品清单：\n\n' + list + '\n\n共 ' + decluttered.length + ' 件');
}

// ============================================================
// 📊 收入 vs 支出 折线图（储蓄账户联动）
// ============================================================
function renderExpenses() {
  var year = parseInt(document.getElementById('expenseYearSelect').value) || new Date().getFullYear();
  var container = document.getElementById('expenseList');
  var yearSelect = document.getElementById('expenseYearSelect');
  var currentYear = new Date().getFullYear();
  yearSelect.innerHTML = '';
  for (var y = currentYear - 5; y <= currentYear + 1; y++) {
    var opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y + '年';
    if (y === year) opt.selected = true;
    yearSelect.appendChild(opt);
  }

  var monthlyData = getYearlyMonthlySummary(year);
  var months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  var totalIncome = 0, totalExpense = 0, hasData = false;
  var maxVal = 1000;
  monthlyData.forEach(function(m) {
    totalIncome += m.income;
    totalExpense += m.expense;
    if (m.income > 0 || m.expense > 0) hasData = true;
    if (m.income > maxVal) maxVal = m.income;
    if (m.expense > maxVal) maxVal = m.expense;
  });
  maxVal = Math.ceil(maxVal * 1.3) || 1000;

  var html = '';
  html += '<div class="expense-chart-container"><canvas id="expenseChartCanvas" width="800" height="220"></canvas></div>';
  html += '<div style="display:flex;justify-content:space-between;font-size:0.85rem;padding:0.3rem 0.5rem;background:var(--primary-soft);border-radius:var(--radius-sm);margin-bottom:0.3rem;">' +
    '<span>📈 总收入: <strong style="color:var(--success);">¥' + totalIncome.toFixed(0) + '</strong></span>' +
    '<span>📉 总支出: <strong style="color:#C07070;">¥' + totalExpense.toFixed(0) + '</strong></span>' +
    '<span>💰 净结余: <strong style="color:var(--primary-dark);">¥' + (totalIncome - totalExpense).toFixed(0) + '</strong></span>' +
  '</div>';

  html += '<table class="expense-monthly-table">' +
    '<tr><th>月份</th><th>收入</th><th>支出</th><th>净额</th></tr>';
  monthlyData.forEach(function(m, i) {
    var net = m.income - m.expense;
    var netColor = net > 0 ? 'var(--success)' : (net < 0 ? '#C07070' : 'var(--text-muted)');
    html += '<tr><td class="month-cell">' + months[i] + '</td>' +
      '<td style="color:var(--success);font-weight:600;">' + (m.income > 0 ? '¥' + m.income.toFixed(0) : '—') + '</td>' +
      '<td style="color:#C07070;font-weight:600;">' + (m.expense > 0 ? '¥' + m.expense.toFixed(0) : '—') + '</td>' +
      '<td style="color:' + netColor + ';font-weight:700;">' + (m.income > 0 || m.expense > 0 ? '¥' + net.toFixed(0) : '—') + '</td>' +
      '</tr>';
  });
  html += '</table>';

  if (!hasData) {
    html = '<div class="empty-state">📊 还没有收入或支出记录<br><span style="font-size:0.85rem;color:var(--text-muted);">点击下方按钮记录你的第一笔</span></div>' + html;
  }
  container.innerHTML = html;
  setTimeout(function() { drawExpenseChart(monthlyData, months, maxVal); }, 50);
  updateMinimalistStats();
}

function drawExpenseChart(monthlyData, months, maxVal) {
  var canvas = document.getElementById('expenseChartCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var w = canvas.width || 800, h = canvas.height || 220;
  ctx.clearRect(0, 0, w, h);
  var padding = { top: 20, bottom: 30, left: 40, right: 20 };
  var chartW = w - padding.left - padding.right;
  var chartH = h - padding.top - padding.bottom;

  var hasData = monthlyData.some(function(m) { return m.income > 0 || m.expense > 0; });
  if (!hasData) {
    ctx.fillStyle = 'var(--text-muted)';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无数据，请记录收入或支出', w/2, h/2 + 4);
    return;
  }

  ctx.strokeStyle = 'var(--border)';
  ctx.lineWidth = 0.5;
  for (var i = 0; i <= 4; i++) {
    var y = padding.top + (i / 4) * chartH;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
    ctx.fillStyle = 'var(--text-muted)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxVal - (i / 4) * maxVal), padding.left - 6, y + 4);
  }

  function getPoints(data, getVal) {
    var pts = [];
    var hasAny = false;
    for (var j = 0; j < data.length; j++) {
      var val = getVal(data[j]);
      if (val > 0) hasAny = true;
      var x = padding.left + (j / (data.length - 1)) * chartW;
      var y = padding.top + chartH - (val / maxVal) * chartH;
      pts.push({ x: x, y: y, val: val });
    }
    return { points: pts, hasAny: hasAny };
  }

  var incomePts = getPoints(monthlyData, function(m) { return m.income; });
  var expensePts = getPoints(monthlyData, function(m) { return m.expense; });

  function drawCurve(points, color, fillColor) {
    if (!points.hasAny) return;
    ctx.beginPath();
    ctx.moveTo(points.points[0].x, padding.top + chartH);
    for (var k = 0; k < points.points.length; k++) {
      if (k === 0) ctx.lineTo(points.points[k].x, points.points[k].y);
      else {
        var prev = points.points[k-1], curr = points.points[k];
        var cpx = (prev.x + curr.x) / 2;
        ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
      }
    }
    ctx.lineTo(points.points[points.points.length-1].x, padding.top + chartH);
    ctx.closePath();
    var grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    grad.addColorStop(0, fillColor);
    grad.addColorStop(1, fillColor.replace('0.25', '0.02'));
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    for (var l = 0; l < points.points.length; l++) {
      if (l === 0) ctx.moveTo(points.points[l].x, points.points[l].y);
      else {
        var prev2 = points.points[l-1], curr2 = points.points[l];
        var cpx2 = (prev2.x + curr2.x) / 2;
        ctx.bezierCurveTo(cpx2, prev2.y, cpx2, curr2.y, curr2.x, curr2.y);
      }
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    for (var m = 0; m < points.points.length; m++) {
      if (points.points[m].val > 0) {
        ctx.beginPath();
        ctx.arc(points.points[m].x, points.points[m].y, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  drawCurve(incomePts, '#A8D5A8', 'rgba(168, 213, 168, 0.25)');
  drawCurve(expensePts, '#C07070', 'rgba(192, 112, 112, 0.25)');

  ctx.fillStyle = '#A8D5A8';
  ctx.fillRect(w - 80, 10, 16, 4);
  ctx.fillStyle = 'var(--text)';
  ctx.font = '10px sans-serif';
  ctx.fillText('收入', w - 60, 14);
  ctx.fillStyle = '#C07070';
  ctx.fillRect(w - 36, 10, 16, 4);
  ctx.fillStyle = 'var(--text)';
  ctx.fillText('支出', w - 16, 14);

  ctx.fillStyle = 'var(--text-muted)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  var step = Math.max(1, Math.floor(monthlyData.length / 12));
  for (var n = 0; n < monthlyData.length; n += step) {
    var xPos = padding.left + (n / (monthlyData.length - 1)) * chartW;
    ctx.fillText(months[n], xPos, padding.top + chartH + 18);
  }
}

// ============================================================
// 储蓄账户（含交易记录）
// ============================================================
function renderSavingsAccounts() {
  var accounts = loadSavingsAccounts();
  var container = document.getElementById('savingsAccountList');
  var accountSelect = document.getElementById('savingsAccountSelect');
  var currentAccountId = accountSelect.value;
  accountSelect.innerHTML = '';
  if (!accounts.length) {
    accountSelect.innerHTML = '<option value="">— 无账户 —</option>';
  } else {
    accounts.forEach(function(acc) {
      var opt = document.createElement('option');
      opt.value = acc.id;
      opt.textContent = acc.name || '未命名';
      if (acc.id === currentAccountId || (!currentAccountId && acc.id === accounts[0].id)) opt.selected = true;
      accountSelect.appendChild(opt);
    });
  }
  var yearSelect = document.getElementById('savingsYearSelect');
  var currentYear = parseInt(yearSelect.value) || new Date().getFullYear();
  yearSelect.innerHTML = '';
  var thisYear = new Date().getFullYear();
  for (var y = thisYear - 5; y <= thisYear + 1; y++) {
    var opt2 = document.createElement('option');
    opt2.value = y;
    opt2.textContent = y + '年';
    if (y === currentYear) opt2.selected = true;
    yearSelect.appendChild(opt2);
  }

  var selectedId = accountSelect.value;
  var year = parseInt(yearSelect.value) || thisYear;
  var account = accounts.find(function(a) { return a.id === selectedId; });
  if (!account) {
    container.innerHTML = '<div class="empty-accounts">🏦 还没有储蓄账户，点击「+」创建</div>';
    updateMinimalistStats();
    return;
  }

  var months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  var monthlyIncome = [], monthlyExpense = [], monthlyNet = [];
  var maxVal = 1000;
  var hasData = false;
  for (var m = 1; m <= 12; m++) {
    var monthStr = year + '-' + String(m).padStart(2, '0');
    var inc = 0, exp = 0;
    (account.transactions || []).forEach(function(txn) {
      if (getMonthKey(txn.date) === monthStr) {
        if (txn.type === 'income') inc += txn.amount;
        else exp += txn.amount;
      }
    });
    monthlyIncome.push(inc);
    monthlyExpense.push(exp);
    monthlyNet.push(inc - exp);
    if (inc > 0 || exp > 0) hasData = true;
    if (inc > maxVal) maxVal = inc;
    if (exp > maxVal) maxVal = exp;
  }
  maxVal = Math.ceil(maxVal * 1.3) || 1000;

  var totalIncome = monthlyIncome.reduce(function(s, v) { return s + v; }, 0);
  var totalExpense = monthlyExpense.reduce(function(s, v) { return s + v; }, 0);

  var html = '';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;padding:0.3rem 0.5rem;background:var(--primary-soft);border-radius:var(--radius-sm);margin-bottom:0.5rem;">' +
    '<span style="font-weight:700;">' + escapeHtml(account.name) + '</span>' +
    '<span style="font-weight:700;color:var(--primary-dark);">余额: ¥' + (account.balance || 0).toFixed(0) + '</span>' +
    '<div style="display:flex;gap:0.3rem;">' +
      '<button class="small secondary" onclick="editAccount(\'' + account.id + '\')" style="padding:0.1rem 0.5rem;font-size:0.7rem;">✏️</button>' +
      '<button class="small secondary" onclick="deleteAccount(\'' + account.id + '\')" style="padding:0.1rem 0.5rem;font-size:0.7rem;background:#FDE8E8;color:#B05858;">🗑️</button>' +
    '</div>' +
  '</div>';

  html += '<div class="savings-chart-container"><canvas id="savingsChartCanvas" width="800" height="220"></canvas></div>';

  html += '<div style="display:flex;justify-content:space-between;font-size:0.85rem;padding:0.2rem 0.5rem;background:var(--primary-soft);border-radius:var(--radius-sm);margin-bottom:0.3rem;">' +
    '<span>📈 年度收入: <strong style="color:var(--success);">¥' + totalIncome.toFixed(0) + '</strong></span>' +
    '<span>📉 年度支出: <strong style="color:#C07070;">¥' + totalExpense.toFixed(0) + '</strong></span>' +
    '<span>💰 净增: <strong style="color:var(--primary-dark);">¥' + (totalIncome - totalExpense).toFixed(0) + '</strong></span>' +
  '</div>';

  html += '<table class="savings-monthly-table"><tr><th>月份</th><th>收入</th><th>支出</th><th>净额</th></tr>';
  for (var i = 0; i < 12; i++) {
    var net = monthlyNet[i];
    var netColor = net > 0 ? 'var(--success)' : (net < 0 ? '#C07070' : 'var(--text-muted)');
    html += '<tr><td class="month-cell">' + months[i] + '</td>' +
      '<td style="color:var(--success);font-weight:600;">' + (monthlyIncome[i] > 0 ? '¥' + monthlyIncome[i].toFixed(0) : '—') + '</td>' +
      '<td style="color:#C07070;font-weight:600;">' + (monthlyExpense[i] > 0 ? '¥' + monthlyExpense[i].toFixed(0) : '—') + '</td>' +
      '<td style="color:' + netColor + ';font-weight:700;">' + (monthlyIncome[i] > 0 || monthlyExpense[i] > 0 ? '¥' + net.toFixed(0) : '—') + '</td>' +
      '</tr>';
  }
  html += '</table>';

  var recentTxns = (account.transactions || []).slice(0, 10);
  if (recentTxns.length) {
    html += '<div style="margin-top:0.6rem;border-top:1px solid var(--border-light);padding-top:0.5rem;">' +
      '<div style="font-weight:600;font-size:0.85rem;color:var(--text-muted);margin-bottom:0.3rem;">📋 最近交易</div>';
    recentTxns.sort(function(a, b) { return b.date.localeCompare(a.date) || (a.id < b.id ? 1 : -1); });
    recentTxns.forEach(function(txn) {
      var isIncome = txn.type === 'income';
      var sign = isIncome ? '+' : '-';
      var color = isIncome ? 'var(--success)' : '#C07070';
      html += '<div style="display:flex;justify-content:space-between;font-size:0.82rem;padding:0.2rem 0;border-bottom:1px solid var(--border-light);">' +
        '<span>' + txn.date + ' ' + escapeHtml(txn.category || '') + (txn.note ? ' 💬' + escapeHtml(txn.note) : '') + '</span>' +
        '<span style="color:' + color + ';font-weight:600;">' + sign + '¥' + txn.amount.toFixed(0) + '</span>' +
        '</div>';
    });
    html += '</div>';
  }

  if (!hasData) {
    html = '<div class="empty-accounts">📊 还没有交易记录<br><span style="font-size:0.85rem;color:var(--text-muted);">点击下方按钮记录收入或支出</span></div>' + html;
  }
  container.innerHTML = html;
  setTimeout(function() { drawSavingsChart(monthlyIncome, monthlyExpense, months, maxVal); }, 50);
  updateMinimalistStats();
}

function drawSavingsChart(incomeData, expenseData, months, maxVal) {
  var canvas = document.getElementById('savingsChartCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var w = canvas.width || 800, h = canvas.height || 220;
  ctx.clearRect(0, 0, w, h);
  var padding = { top: 20, bottom: 30, left: 40, right: 20 };
  var chartW = w - padding.left - padding.right;
  var chartH = h - padding.top - padding.bottom;

  var hasData = incomeData.some(function(v) { return v > 0; }) || expenseData.some(function(v) { return v > 0; });
  if (!hasData) {
    ctx.fillStyle = 'var(--text-muted)';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无数据，请记录收入或支出', w/2, h/2 + 4);
    return;
  }

  ctx.strokeStyle = 'var(--border)';
  ctx.lineWidth = 0.5;
  for (var i = 0; i <= 4; i++) {
    var y = padding.top + (i / 4) * chartH;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
    ctx.fillStyle = 'var(--text-muted)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxVal - (i / 4) * maxVal), padding.left - 6, y + 4);
  }

  function getPoints(data) {
    var pts = [];
    for (var j = 0; j < data.length; j++) {
      var x = padding.left + (j / (data.length - 1)) * chartW;
      var y = padding.top + chartH - (data[j] / maxVal) * chartH;
      pts.push({ x: x, y: y, val: data[j] });
    }
    return pts;
  }

  var incomePts = getPoints(incomeData);
  var expensePts = getPoints(expenseData);

  function drawCurve(points, color, fillColor) {
    var hasAny = points.some(function(p) { return p.val > 0; });
    if (!hasAny) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, padding.top + chartH);
    for (var k = 0; k < points.length; k++) {
      if (k === 0) ctx.lineTo(points[k].x, points[k].y);
      else {
        var prev = points[k-1], curr = points[k];
        var cpx = (prev.x + curr.x) / 2;
        ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
      }
    }
    ctx.lineTo(points[points.length-1].x, padding.top + chartH);
    ctx.closePath();
    var grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    grad.addColorStop(0, fillColor);
    grad.addColorStop(1, fillColor.replace('0.25', '0.02'));
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    for (var l = 0; l < points.length; l++) {
      if (l === 0) ctx.moveTo(points[l].x, points[l].y);
      else {
        var prev2 = points[l-1], curr2 = points[l];
        var cpx2 = (prev2.x + curr2.x) / 2;
        ctx.bezierCurveTo(cpx2, prev2.y, cpx2, curr2.y, curr2.x, curr2.y);
      }
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    for (var m = 0; m < points.length; m++) {
      if (points[m].val > 0) {
        ctx.beginPath();
        ctx.arc(points[m].x, points[m].y, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  drawCurve(incomePts, '#A8D5A8', 'rgba(168, 213, 168, 0.25)');
  drawCurve(expensePts, '#C07070', 'rgba(192, 112, 112, 0.25)');

  ctx.fillStyle = '#A8D5A8';
  ctx.fillRect(w - 80, 10, 16, 4);
  ctx.fillStyle = 'var(--text)';
  ctx.font = '10px sans-serif';
  ctx.fillText('收入', w - 60, 14);
  ctx.fillStyle = '#C07070';
  ctx.fillRect(w - 36, 10, 16, 4);
  ctx.fillStyle = 'var(--text)';
  ctx.fillText('支出', w - 16, 14);

  ctx.fillStyle = 'var(--text-muted)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  var step = Math.max(1, Math.floor(months.length / 12));
  for (var n = 0; n < months.length; n += step) {
    var xPos = padding.left + (n / (months.length - 1)) * chartW;
    ctx.fillText(months[n], xPos, padding.top + chartH + 18);
  }
}

// ============================================================
// 📝 记录收入 / 支出（与账户联动）
// ============================================================
function showAddTransactionModal(type) {
  var accounts = loadSavingsAccounts();
  if (!accounts.length) {
    alert('请先创建储蓄账户！');
    return;
  }
  var typeLabel = type === 'income' ? '收入' : '支出';
  var typeEmoji = type === 'income' ? '📈' : '📉';
  var accountOptions = accounts.map(function(acc) {
    return '<option value="' + acc.id + '">' + escapeHtml(acc.name) + '（余额 ¥' + (acc.balance || 0).toFixed(0) + '）</option>';
  }).join('');
  var categories = type === 'income' ? ['工资', '奖金', '投资', '礼物', '兼职', '其他'] : ['餐饮', '购物', '交通', '娱乐', '住房', '医疗', '学习', '其他'];
  var categoryOptions = categories.map(function(cat) {
    return '<option value="' + cat + '">' + cat + '</option>';
  }).join('');

  openModal('<h2>' + typeEmoji + ' 记录' + typeLabel + '</h2>' +
    '<div class="form-group"><label>选择账户</label><select id="txnAccount">' + accountOptions + '</select></div>' +
    '<div class="form-group"><label>金额（元）</label><input id="txnAmount" type="number" step="0.01" placeholder="0.00" /></div>' +
    '<div class="form-group"><label>分类</label><select id="txnCategory">' + categoryOptions + '</select></div>' +
    '<div class="form-group"><label>日期</label><input id="txnDate" type="date" value="' + today() + '" /></div>' +
    '<div class="form-group"><label>备注（可选）</label><input id="txnNote" placeholder="例如：超市购物" /></div>' +
    '<div class="actions"><button class="secondary" onclick="closeModal()">取消</button><button onclick="saveTransaction(\'' + type + '\')">保存</button></div>');
}

function saveTransaction(type) {
  var accountId = document.getElementById('txnAccount').value;
  var amount = parseFloat(document.getElementById('txnAmount').value);
  var category = document.getElementById('txnCategory').value;
  var date = document.getElementById('txnDate').value;
  var note = document.getElementById('txnNote').value.trim();

  if (!accountId) return alert('请选择账户');
  if (!amount || amount <= 0) return alert('请输入有效金额');

  var accounts = loadSavingsAccounts();
  var account = accounts.find(function(a) { return a.id === accountId; });
  if (!account) return alert('账户不存在');

  var txn = {
    id: uid(),
    date: date || today(),
    type: type,
    amount: amount,
    category: category || '其他',
    note: note || ''
  };

  account.transactions = account.transactions || [];
  account.transactions.push(txn);
  account.balance = account.transactions.reduce(function(sum, t) {
    return t.type === 'income' ? sum + t.amount : sum - t.amount;
  }, 0);

  saveSavingsAccounts(accounts);
  closeModal();
  renderSavingsAccounts();
  renderExpenses();
  updateMinimalistStats();
  showToast('✅ 已记录 ' + (type === 'income' ? '收入' : '支出') + '：¥' + amount.toFixed(0));
}

// ========== 保留旧函数名作为别名 ==========
function recordMonthlySavings() {
  showAddTransactionModal('income');
}
function recordMonthlyExpense() {
  showAddTransactionModal('expense');
}

// ============================================================
// 储蓄账户管理
// ============================================================
function showAddAccountModal() {
  openModal('<h2>🏦 新建储蓄账户</h2><div class="form-group"><label>账户名称</label><input id="newAccountName" placeholder="例如：紧急基金、旅行基金" /></div><div class="form-group"><label>初始余额（元）</label><input id="newAccountBalance" type="number" step="0.01" value="0" /></div><div class="actions"><button class="secondary" onclick="closeModal()">取消</button><button onclick="saveNewAccount()">创建</button></div>');
}
function saveNewAccount() {
  var name = document.getElementById('newAccountName').value.trim();
  var balance = Number(document.getElementById('newAccountBalance').value) || 0;
  if (!name) return alert('请输入账户名称');
  var accounts = loadSavingsAccounts();
  var newAccount = { id: uid(), name: name, balance: balance, transactions: [] };
  if (balance > 0) {
    newAccount.transactions.push({ id: uid(), date: today(), type: 'income', amount: balance, category: '初始存款', note: '开户' });
  }
  accounts.push(newAccount);
  saveSavingsAccounts(accounts);
  closeModal();
  renderSavingsAccounts();
  renderExpenses();
  updateMinimalistStats();
  showToast('✅ 已创建账户：' + name);
}
function editAccount(accountId) {
  var accounts = loadSavingsAccounts();
  var account = accounts.find(function(a) { return a.id === accountId; });
  if (!account) return;
  openModal('<h2>✏️ 编辑账户</h2><div class="form-group"><label>账户名称</label><input id="editAccountName" value="' + escapeHtml(account.name) + '" /></div><div class="actions"><button class="secondary" onclick="closeModal()">取消</button><button onclick="saveEditAccount(\'' + accountId + '\')">保存</button></div>');
}
function saveEditAccount(accountId) {
  var name = document.getElementById('editAccountName').value.trim();
  if (!name) return alert('请输入账户名称');
  var accounts = loadSavingsAccounts();
  var account = accounts.find(function(a) { return a.id === accountId; });
  if (!account) return;
  account.name = name;
  saveSavingsAccounts(accounts);
  closeModal();
  renderSavingsAccounts();
  showToast('✅ 账户已更新');
}
function deleteAccount(accountId) {
  if (!confirm('确定要删除这个账户及其所有交易记录吗？')) return;
  var accounts = loadSavingsAccounts().filter(function(a) { return a.id !== accountId; });
  saveSavingsAccounts(accounts);
  renderSavingsAccounts();
  renderExpenses();
  updateMinimalistStats();
  showToast('🗑️ 账户已删除');
}

// ============================================================
// 宣言
// ============================================================
function renderManifesto() {
  var manifesto = loadManifesto();
  var container = document.getElementById('manifestoDisplay');
  if (!manifesto.content || !manifesto.content.trim()) {
    container.innerHTML = '<div class="manifesto-empty">还没有写下你的极简宣言，点击「编辑」开始 ✍️</div>';
    return;
  }
  container.innerHTML = manifesto.content.replace(/\n/g, '<br>');
}
function editManifesto() {
  var manifesto = loadManifesto();
  openModal('<h2>📜 编辑极简宣言</h2><div class="form-group"><label>你的极简生活宣言</label><textarea id="manifestoContent" rows="6" placeholder="写下你对极简生活的理解和目标...">' + escapeHtml(manifesto.content) + '</textarea></div><div class="form-group" style="color:var(--text-muted);font-size:0.85rem;">💡 可以写下：你的极简原则、目标物品数量、消费理念等</div><div class="actions"><button class="secondary" onclick="closeModal()">取消</button><button onclick="saveManifestoFromModal()">保存</button></div>');
}
function saveManifestoFromModal() {
  var content = document.getElementById('manifestoContent').value.trim();
  saveManifesto({ content: content, updatedAt: Date.now() });
  closeModal();
  renderManifesto();
  showToast('✅ 宣言已更新');
}

// ============================================================
// 统计更新
// ============================================================
function updateMinimalistStats() {
  var items = loadItems();
  var accounts = loadSavingsAccounts();
  var totalItems = items.filter(function(i) { return i.status !== '已清理'; }).length;
  document.getElementById('totalItems').textContent = totalItems;

  var now = new Date();
  var monthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  var monthExpense = 0;
  accounts.forEach(function(acc) {
    (acc.transactions || []).forEach(function(txn) {
      if (getMonthKey(txn.date) === monthKey && txn.type === 'expense') {
        monthExpense += txn.amount;
      }
    });
  });
  document.getElementById('monthExpenses').textContent = '¥' + monthExpense.toFixed(0);

  var totalSavings = accounts.reduce(function(sum, acc) { return sum + (acc.balance || 0); }, 0);
  document.getElementById('totalSavingsDisplay').textContent = '¥' + totalSavings.toFixed(0);

  var decluttered = items.filter(function(i) { return i.status === '已清理'; }).length;
  document.getElementById('declutterCount').textContent = decluttered;
}

// ============================================================
// 极简页面渲染入口
// ============================================================
function renderMinimalistPage() {
  renderItems();
  renderExpenses();
  renderSavingsAccounts();
  renderManifesto();
  updateMinimalistStats();
}

// ============================================================
// 📦 JSON 数据导入 / 导出（手动备份）
// ============================================================

// 导出所有数据为 JSON 文件
function exportAllData() {
  var allData = {};
  for (var key in STORE) {
    allData[key] = loadData(key);
  }
  allData._exportMeta = {
    exportedAt: new Date().toISOString(),
    version: '1.0'
  };

  var json = JSON.stringify(allData, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = '安全屋数据备份_' + today() + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('💾 数据已导出！');
}

// 导入 JSON 数据（替换当前所有数据）
function importAllData(file) {
  if (!file) return;
  if (!confirm('⚠️ 导入将覆盖当前所有数据，确定继续吗？')) return;

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = JSON.parse(e.target.result);
      var count = 0;
      for (var key in STORE) {
        if (data[key] !== undefined) {
          saveDataSync(key, data[key]);
          count++;
        }
      }
      showToast('✅ 数据导入成功！共导入 ' + count + ' 个模块，即将刷新');
      setTimeout(function() { location.reload(); }, 1500);
    } catch (err) {
      alert('❌ 导入失败：文件格式不正确\n' + err.message);
    }
  };
  reader.readAsText(file);
}

// 触发文件选择
function triggerImport() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = function(e) {
    if (e.target.files[0]) {
      importAllData(e.target.files[0]);
    }
    input.remove();
  };
  input.click();
}

// ============================================================
// 年度可用时间倒计时
// ============================================================
function getYearlyTimeStats() {
  const now = new Date();
  const year = now.getFullYear();
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInYear = isLeap ? 366 : 365;
  const dailyAvailable = 15; // 5:00-22:00 共17小时，减去午休和晚休各1小时

  const totalHours = daysInYear * dailyAvailable;

  // 已用小时
  const startOfYear = new Date(year, 0, 1);
  const todayMidnight = new Date(year, now.getMonth(), now.getDate());
  const daysPassed = Math.floor((todayMidnight - startOfYear) / (1000 * 60 * 60 * 24));

  const today5 = new Date(year, now.getMonth(), now.getDate(), 5, 0, 0);
  const today22 = new Date(year, now.getMonth(), now.getDate(), 22, 0, 0);
  let todayUsed = 0;
  if (now >= today5 && now <= today22) {
    todayUsed = (now - today5) / (1000 * 60 * 60);
  } else if (now > today22) {
    todayUsed = dailyAvailable;
  } // 5点前为0

  const usedHours = daysPassed * dailyAvailable + todayUsed;
  const remainingHours = totalHours - usedHours;
  const percent = totalHours > 0 ? (usedHours / totalHours) * 100 : 0;

  const actualDaysPassed = daysPassed + (now >= today5 ? 1 : 0);
  const todayAllocated = getTodayAllocatedHours();

  return {
    totalHours,
    usedHours,
    remainingHours,
    percent,
    dailyAvailable,
    todayUsed,
    todayRemaining: dailyAvailable - todayUsed,
    todayAllocated: todayAllocated,
    todayRemainAfterPlan: dailyAvailable - todayAllocated,
    daysInYear,
    daysPassed: actualDaysPassed
  };
}

function renderYearlyTime() {
  const container = document.getElementById('yearlyTimeContainer');
  if (!container) return;

  const stats = getYearlyTimeStats();
  const used = stats.usedHours.toFixed(1);
  const remain = stats.remainingHours.toFixed(1);
  const pct = stats.percent.toFixed(1);
  const total = stats.totalHours;
  const dayUsed = stats.todayUsed.toFixed(1);
  const dayRemain = stats.todayRemaining.toFixed(1);
  const remainDays = (stats.remainingHours / stats.dailyAvailable).toFixed(1);
  const allocated = stats.todayAllocated.toFixed(1);
  const remainAfterPlan = stats.todayRemainAfterPlan.toFixed(1);

  container.innerHTML = `
    <div class="flex-between">
      <div>
        <h3>⏳ 年度可用时间</h3>
        <div style="font-size:0.85rem;color:var(--text-muted);">
          🕒 每天 ${stats.dailyAvailable}h（5:00-22:00，午休+晚休共2h）
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:1.2rem;font-weight:700;color:var(--primary-dark);">
          剩余 ${remain}h
          <span style="font-size:0.75rem;font-weight:400;color:var(--text-muted);">（≈ ${remainDays}天）</span>
        </div>
        <div style="font-size:0.8rem;color:var(--text-muted);">总可用 ${total}h</div>
      </div>
    </div>
    <div style="margin:0.5rem 0;">
      <div style="height:8px;background:var(--border);border-radius:999px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--primary),var(--primary-dark));border-radius:999px;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--text-muted);margin-top:0.2rem;">
        <span>已用 ${used}h（${pct}%）</span>
        <span>今日已分配 ${allocated}h / 剩余 ${remainAfterPlan}h</span>
      </div>
    </div>
    <div style="font-size:0.8rem;color:var(--text-muted);">
      📅 第 ${stats.daysPassed} / ${stats.daysInYear} 天
    </div>
  `;
}

// ============================================================
// 周计划 & 年计划
// ============================================================
function renderWeekPlan() {
  var container = document.getElementById('weekPlanContainer');
  if (!container) return;
  var now = new Date();
  var dayOfWeek = now.getDay();
  var start = new Date(now);
  start.setDate(now.getDate() - dayOfWeek);
  var weekDays = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(start);
    d.setDate(start.getDate() + i);
    var dateStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    weekDays.push({ date: dateStr, label: (i===0?'日':['一','二','三','四','五','六'][i-1]) });
  }
  var projects = loadProjects();
  var dailyHours = weekDays.map(function(wd) {
    var total = 0;
    projects.forEach(function(proj) {
      (proj.dailyTasks || []).forEach(function(task) {
        if (task.date === wd.date) total += (task.hours || 0);
      });
    });
    return total;
  });
  var maxVal = Math.max(15, Math.max.apply(null, dailyHours)) || 15;
  var chartHtml = '<div style="display:flex;justify-content:space-around;align-items:flex-end;height:100px;padding:0.2rem 0;">';
  weekDays.forEach(function(wd, idx) {
    var h = dailyHours[idx];
    var pct = (h / maxVal) * 80;
    var isToday = wd.date === today();
    chartHtml += '<div style="display:flex;flex-direction:column;align-items:center;width:30px;">';
    chartHtml += '<div style="height:' + pct + 'px;width:20px;background:' + (isToday ? 'linear-gradient(180deg,var(--primary-dark),var(--primary))' : 'linear-gradient(180deg,var(--primary),var(--primary-dark))') + ';border-radius:4px 4px 0 0;transition:height 0.3s;"></div>';
    chartHtml += '<span style="font-size:0.65rem;color:' + (isToday ? 'var(--primary-dark)' : 'var(--text-muted)') + ';font-weight:' + (isToday ? '700' : '400') + ';margin-top:2px;">' + wd.label + '</span>';
    chartHtml += '<span style="font-size:0.6rem;color:var(--text-muted);">' + h.toFixed(1) + 'h</span>';
    chartHtml += '</div>';
  });
  chartHtml += '</div>';
  container.innerHTML = '<h3>📅 本周时间分配</h3>' + chartHtml;
}

function renderYearPlan() {
  var container = document.getElementById('yearPlanContainer');
  if (!container) return;
  var year = new Date().getFullYear();
  var months = [];
  for (var m = 1; m <= 12; m++) {
    months.push({ month: m, label: m + '月' });
  }
  var projects = loadProjects();
  var monthlyHours = months.map(function(mo) {
    var monthStr = year + '-' + String(mo.month).padStart(2,'0');
    var total = 0;
    projects.forEach(function(proj) {
      (proj.dailyTasks || []).forEach(function(task) {
        if (task.date && task.date.startsWith(monthStr)) total += (task.hours || 0);
      });
    });
    return total;
  });
  var maxVal = Math.max(15, Math.max.apply(null, monthlyHours)) || 15;
  var chartHtml = '<div style="display:flex;justify-content:space-between;align-items:flex-end;height:100px;padding:0.2rem 0;">';
  months.forEach(function(mo, idx) {
    var h = monthlyHours[idx];
    var pct = (h / maxVal) * 80;
    var now = new Date();
    var isCurrentMonth = (mo.month === now.getMonth() + 1);
    chartHtml += '<div style="display:flex;flex-direction:column;align-items:center;width:22px;">';
    chartHtml += '<div style="height:' + pct + 'px;width:14px;background:' + (isCurrentMonth ? 'linear-gradient(180deg,var(--accent),var(--warning))' : 'linear-gradient(180deg,var(--accent),var(--warning))') + ';border-radius:4px 4px 0 0;transition:height 0.3s;' + (isCurrentMonth ? 'border:2px solid var(--primary);' : '') + '"></div>';
    chartHtml += '<span style="font-size:0.55rem;color:' + (isCurrentMonth ? 'var(--primary-dark)' : 'var(--text-muted)') + ';font-weight:' + (isCurrentMonth ? '700' : '400') + ';margin-top:2px;">' + mo.label + '</span>';
    chartHtml += '<span style="font-size:0.5rem;color:var(--text-muted);">' + h.toFixed(0) + 'h</span>';
    chartHtml += '</div>';
  });
  chartHtml += '</div>';
  container.innerHTML = '<h3>📆 年度时间分配（每月）</h3>' + chartHtml;
}

// ============================================================
// 初始化
// ============================================================
async function initialize() {
  // 从服务器加载数据
  const serverData = await loadAllFromServer();
  if (serverData) {
    for (var key in STORE) {
      if (serverData[key] !== undefined) {
        saveToLocal(key, serverData[key]);
      }
    }
    _dataCache = serverData;
  }
  
  // 确保 banner 存在
  if (!loadData(STORE.banner)) {
    saveDataSync(STORE.banner, { year: new Date().getFullYear(), theme: '' });
  }
  
  renderBanner();
  renderInbox();
  renderTodayTasks();
  renderAreaOverview();
  renderPlanning();
  renderResources();
  renderMinimalistPage();
  renderCalendar();
  renderYearlyTime();
  renderWeekPlan();
  renderYearPlan();

  // 每分钟更新倒计时
  setInterval(function() {
    renderYearlyTime();
    renderWeekPlan();
    renderYearPlan();
  }, 60000);
}

// ============================================================
// 页面切换
// ============================================================
document.querySelectorAll('.nav-bar a').forEach(function(link) {
  link.addEventListener('click', function(event) {
    event.preventDefault();
    document.querySelectorAll('.nav-bar a').forEach(function(item) { item.classList.remove('active'); });
    link.classList.add('active');
    document.querySelectorAll('.page').forEach(function(page) { page.classList.remove('active'); });
    var pageId = 'page-' + link.dataset.page;
    document.getElementById(pageId).classList.add('active');
    if (link.dataset.page === 'dashboard') renderDashboardPage();
    else if (link.dataset.page === 'planning') renderPlanning();
    else if (link.dataset.page === 'resources') renderResources();
    else if (link.dataset.page === 'minimalist') renderMinimalistPage();
  });
});
document.getElementById('filterArea').addEventListener('change', renderResources);
document.getElementById('filterProject').addEventListener('change', renderResources);

// 启动
initialize();