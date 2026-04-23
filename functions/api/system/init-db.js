import { onRequest } from "../../_shared/utils.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    name TEXT DEFAULT '',
    role TEXT DEFAULT 'user',
    user_type TEXT DEFAULT 'formal',
    emp_no TEXT DEFAULT '',
    company_code TEXT DEFAULT '',
    dept TEXT DEFAULT '',
    banned INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_code TEXT NOT NULL,
    emp_no TEXT NOT NULL,
    name TEXT NOT NULL,
    dept TEXT DEFAULT '',
    UNIQUE(company_code, emp_no)
);

CREATE TABLE IF NOT EXISTS study_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    word_id TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    mastered INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 1,
    last_practiced TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS study_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    date TEXT NOT NULL,
    words_learned INTEGER NOT NULL DEFAULT 0,
    study_seconds INTEGER NOT NULL DEFAULT 0,
    UNIQUE(username, date)
);

CREATE TABLE IF NOT EXISTS leaderboard_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    period_key TEXT NOT NULL,
    score INTEGER DEFAULT 0,
    question_count INTEGER DEFAULT 20,
    category TEXT DEFAULT 'all',
    type TEXT DEFAULT 'indo2cn',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS changelogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL,
    title TEXT DEFAULT '',
    content TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_study_records_username ON study_records(username);
CREATE INDEX IF NOT EXISTS idx_study_records_word ON study_records(username, word_id);
CREATE INDEX IF NOT EXISTS idx_study_stats_username ON study_stats(username);
CREATE INDEX IF NOT EXISTS idx_study_stats_date ON study_stats(date);
CREATE INDEX IF NOT EXISTS idx_employees_code ON employees(company_code, emp_no);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_leaderboard_period ON leaderboard_entries(period_key);
CREATE INDEX IF NOT EXISTS idx_changelogs_id ON changelogs(id);
`;

export async function onRequest(context) {
    const { env } = context;
    const results = [];
    for (const stmt of SCHEMA.trim().split(';').map(s => s.trim()).filter(Boolean)) {
        try {
            await env.INDO_LEARN_DB.prepare(stmt).run();
            results.push({ ok: true, sql: stmt.slice(0, 60) });
        } catch (e) {
            results.push({ ok: false, error: e.message, sql: stmt.slice(0, 60) });
        }
    }
    return new Response(JSON.stringify({ success: true, tables: results.length, details: results }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
}