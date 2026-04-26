-- 印尼语学习助手 D1 数据库表结构
-- KV（配置）+ D1（用户数据）混合架构
-- 更新于 2026-04-26: 新增 challenge_records, challenge_weekly 表

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'user',
    user_type TEXT NOT NULL DEFAULT 'employee',
    company_code TEXT NOT NULL DEFAULT '',
    emp_no TEXT NOT NULL DEFAULT '',
    banned INTEGER NOT NULL DEFAULT 0,
    last_heartbeat TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 员工名单/白名单
CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_code TEXT NOT NULL,
    emp_no TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    dept TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(company_code, emp_no)
);

-- 学习记录（单词级别）
CREATE TABLE IF NOT EXISTS study_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    word_id TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    mastered INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 1,
    last_practiced TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 每日学习统计
CREATE TABLE IF NOT EXISTS study_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    date TEXT NOT NULL,
    words_learned INTEGER NOT NULL DEFAULT 0,
    study_seconds INTEGER NOT NULL DEFAULT 0,
    UNIQUE(username, date)
);

-- 排行榜
CREATE TABLE IF NOT EXISTS leaderboard_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    score INTEGER NOT NULL DEFAULT 0,
    period TEXT NOT NULL DEFAULT 'weekly',
    period_key TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 版本说明
CREATE TABLE IF NOT EXISTS changelogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 广播消息
CREATE TABLE IF NOT EXISTS broadcasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'notice',
    is_active INTEGER NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0,
    start_date TEXT NOT NULL DEFAULT '',
    end_date TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 闯天关记录
-- 每关每次闯关的详细记录，is_best=1 标记为最佳成绩
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

-- 闯天关周积分汇总
-- 每周每位用户一条记录，用于排行榜
CREATE TABLE IF NOT EXISTS challenge_weekly (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    week_key TEXT NOT NULL,
    total_score REAL NOT NULL DEFAULT 0,
    stages_cleared INTEGER NOT NULL DEFAULT 0,
    best_accuracy REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(username, week_key)
);

-- 初始化管理员账号（D1 不支持在 schema 里 INSERT，需用 API 或单独执行）
-- 通过 API POST /api/admin/init-users 创建

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_study_records_username ON study_records(username);
CREATE INDEX IF NOT EXISTS idx_study_records_word ON study_records(username, word_id);
CREATE INDEX IF NOT EXISTS idx_study_stats_username ON study_stats(username);
CREATE INDEX IF NOT EXISTS idx_study_stats_date ON study_stats(date);
CREATE INDEX IF NOT EXISTS idx_employees_code ON employees(company_code, emp_no);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_leaderboard_period ON leaderboard_entries(period_key);
CREATE INDEX IF NOT EXISTS idx_changelogs_id ON changelogs(id);
CREATE INDEX IF NOT EXISTS idx_broadcasts_active ON broadcasts(is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_challenge_records_username ON challenge_records(username);
CREATE INDEX IF NOT EXISTS idx_challenge_records_stage ON challenge_records(stage_id);
CREATE INDEX IF NOT EXISTS idx_challenge_records_best ON challenge_records(username, stage_id, is_best);
CREATE INDEX IF NOT EXISTS idx_challenge_weekly_key ON challenge_weekly(week_key);
CREATE INDEX IF NOT EXISTS idx_challenge_weekly_user ON challenge_weekly(username, week_key);