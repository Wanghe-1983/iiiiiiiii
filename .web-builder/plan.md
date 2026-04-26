# 印尼语学习App重构计划 - v4.0

## 目标
将现有4个tab（学习、课程、练习、统计）重构为2大核心模块：
- **勤学苦练**：课程选择 → 卡片学习（标记已掌握）→ 练习巩固
- **闯天关**：关卡地图 → 答题闯关 → 积分排名 → 排行榜

保留：统计（dashboard）、广播、登录系统、管理员后台

## 技术栈
- 纯前端 SPA（Vanilla JS + CSS），无框架
- 部署：Cloudflare Pages
- 后端：Cloudflare Pages Functions（Workers）
- 存储：D1（用户数据）+ KV（课程内容/在线状态）

## 当前数据结构

### indonesian_learning_data.json（旧词库，2分类）
```
{
  "1": { name: "生词", lessons: { "1": { words: [...] }, ... } },
  "2": { name: "短语", lessons: { "1": { words: [...] } } }
}
```
共79个生词 + 34个短语

### public/course-data.json（课程大纲）
- Level 0 (通用手册) - 9章节 43单元
- Level 1 (BIPA 1) - 10单元
- Level 2-7 各有不同单元

### bipa1_wordbank.json（新词库，待整合）
- 12课时，每课含 words(30-35) + sentences(10) + dialogues(1-2)
- 约360词 + 120句 + 14对话

## 数据迁移方案

### 1. 新课程数据文件：public/course-content.json
合并旧词库 + BIPA 1 词库为统一结构：
```json
{
  "levels": [
    {
      "id": "0",
      "name": "通用印尼语学习手册",
      "units": [
        {
          "id": "0-1-1",
          "name": "Unit 1 印尼语字母与发音",
          "words": [{ "indonesian": "...", "chinese": "..." }],
          "sentences": [],
          "dialogues": []
        }
      ]
    },
    {
      "id": "1",
      "name": "BIPA 1 - Dasar",
      "units": [
        {
          "id": "1-1",
          "name": "Pelajaran 1 - Salam dan Perkenalan",
          "words": [{ "indonesian": "...", "chinese": "..." }],
          "sentences": [{ "indonesian": "...", "chinese": "..." }],
          "dialogues": [{ "role": "...", "lines": [...] }]
        }
      ]
    }
  ]
}
```

### 2. localStorage 新增键
- `fmi_learned_items` - 已掌握项 [{unitId, itemId, type, indonesian, chinese, timestamp}]
- `fmi_challenge_progress` - 闯天关进度 [{stageId, bestScore, bestTime, bestAccuracy, firstScore, firstTime, attempts}]
- `fmi_challenge_current` - 当前闯关答题状态

### 3. D1 新增表
```sql
CREATE TABLE IF NOT EXISTS challenge_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    stage_id TEXT NOT NULL,
    score REAL NOT NULL DEFAULT 0,
    accuracy REAL NOT NULL DEFAULT 0,
    time_spent INTEGER NOT NULL DEFAULT 0,
    is_best INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS challenge_weekly (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    week_key TEXT NOT NULL,
    total_score REAL NOT NULL DEFAULT 0,
    stages_cleared INTEGER NOT NULL DEFAULT 0,
    best_accuracy REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(username, week_key)
);
```

## 新导航结构

```
主菜单（顶部Tab）：[勤学苦练] [闯天关] [统计]

勤学苦练 内部子Tab：[课程] [学习] [练习]
闯天关 内部子Tab：[闯关] [排行榜]
```

## 关卡映射规则
- 默认：每关 20个单词 / 10个短句 / 5个对话
- 后台可配置每关题数
- 顺序解锁：通过前一关才能进入下一关
- 关卡ID格式：{levelId}-{unitId}-{type}-{stageNum}（如 1-1-words-1）

## 计分公式
综合分 = 准确率 x 0.9 + 时长分 x 0.1
- 时长分 = max(0, 100 - 用时秒数 x 系数)（越快分越高）

## 实施步骤

### Step 1: 数据层 ⬜
- [ ] 合并词库为 course-content.json（旧词库 + BIPA 1）
- [ ] 更新 schema.sql 新增 challenge_records + challenge_weekly 表
- [ ] 编写闯天关 API（提交记录、查询排行、周积分）

### Step 2: 导航重构 ⬜
- [ ] 修改 initUI() - 新顶部导航（勤学苦练、闯天关、统计）
- [ ] 修改 switchPage() - 新路由系统 + 子Tab
- [ ] 保留侧边栏（勤学苦练模块的课程导航树）

### Step 3: 勤学苦练模块 ⬜
- [ ] 课程选择页（按级别→单元浏览，显示进度）
- [ ] 学习页（卡片翻页、标记已掌握、进度条、过滤已掌握）
- [ ] 练习页（选择分类和数量、勾选仅练习已掌握、选择题/填空题）

### Step 4: 闯天关模块 ⬜
- [ ] 关卡地图页（可视化关卡进度、锁定/解锁状态）
- [ ] 闯关答题页（选择题、计分、计时）
- [ ] 排行榜页（本周/本月/总榜、周冠军广播）

### Step 5: 统计与优化 ⬜
- [ ] 适配统计页到新数据结构
- [ ] 响应式优化（移动端适配）
- [ ] 联调测试