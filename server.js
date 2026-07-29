const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

// 数据文件路径
const DATA_FILE = path.join(__dirname, 'data.json');

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// ===== 初始化数据文件 =====
function initDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    const defaultData = {
      pair_areas: [],
      pair_projects: [],
      pair_inbox: [],
      pair_resources: [],
      pair_logs: [],
      pair_banner: { year: new Date().getFullYear(), theme: '' },
      minimalist_items: [],
      minimalist_expenses_monthly: {},
      minimalist_manifesto: { content: '' },
      pair_savings_accounts: [],
      pair_calendar_events: {},
      pair_user_settings: null,   // 新加
      pair_time_templates: null,  // 新加
      pair_daily_plans: {},       // 新加
      pair_weekly_plans: {},      // 新加
      pair_annual_goals: [],      // 新加
      pair_media_library: []      // 新加
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2), 'utf8');
    console.log('✅ 已创建 data.json');
  }
}
// ===== 读取数据 =====
function readData() {
  try {
    const content = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    console.error('❌ 读取数据失败:', e.message);
    return {};
  }
}

// ===== 写入数据 =====
function writeData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('❌ 写入数据失败:', e.message);
    return false;
  }
}

// ===== API 路由 =====

// 获取所有数据
app.get('/api/data', (req, res) => {
  const data = readData();
  res.json(data);
});

// 获取单个模块数据
app.get('/api/data/:key', (req, res) => {
  const data = readData();
  const key = req.params.key;
  if (data[key] !== undefined) {
    res.json(data[key]);
  } else {
    res.status(404).json({ error: '模块不存在' });
  }
});

// 保存整个数据
app.post('/api/data', (req, res) => {
  const newData = req.body;
  if (writeData(newData)) {
    res.json({ success: true, message: '数据已保存' });
  } else {
    res.status(500).json({ success: false, message: '保存失败' });
  }
});

// 保存单个模块
app.post('/api/data/:key', (req, res) => {
  const data = readData();
  const key = req.params.key;
  data[key] = req.body;
  if (writeData(data)) {
    res.json({ success: true, message: '模块已保存' });
  } else {
    res.status(500).json({ success: false, message: '保存失败' });
  }
});

// 初始化（清空所有数据）
app.post('/api/reset', (req, res) => {
  const defaultData = {
    pair_areas: [],
    pair_projects: [],
    pair_inbox: [],
    pair_resources: [],
    pair_logs: [],
    pair_banner: { year: new Date().getFullYear(), theme: '' },
    minimalist_items: [],
    minimalist_expenses_monthly: {},
    minimalist_manifesto: { content: '' },
    pair_savings_accounts: [],
    pair_calendar_events: {}
  };
  if (writeData(defaultData)) {
    res.json({ success: true, message: '数据已重置' });
  } else {
    res.status(500).json({ success: false, message: '重置失败' });
  }
});

// 启动服务器
initDataFile();
app.listen(PORT, () => {
  console.log(`\n🐈‍⬛ 猫猫女巫的安全屋`);
  console.log(`📁 数据文件: ${DATA_FILE}`);
  console.log(`🌐 访问地址: http://localhost:${PORT}\n`);
});