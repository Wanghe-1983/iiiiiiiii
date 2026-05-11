/**
// build: 20260511183815
 * 闯天关 - 提交成绩 API
 * POST /api/challenge/submit
 * Body: { stageId, accuracy, timeSpent, score, stars, answers, mode }
 */

export async function onRequestPost(context) {
    const { request, env } = context;
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return new Response(JSON.stringify({ error: '未登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    const username = await env.INDO_LEARN_KV.get('token_' + token);
    if (!username) return new Response(JSON.stringify({ error: '登录已过期' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    const body = await request.json();
    const { stageId, accuracy, timeSpent, score, stars, answers, mode } = body;
    if (!stageId || accuracy === undefined || timeSpent === undefined || score === undefined) {
        return new Response(JSON.stringify({ error: '参数不完整' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const currentMode = mode || 'normal';

    // 自动建表（只建本文件负责的表，challenge_progress 由 progress.js 负责）
    await env.INDO_LEARN_DB.prepare(`CREATE TABLE IF NOT EXISTS challenge_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, stage_id TEXT NOT NULL,
        score REAL NOT NULL DEFAULT 0, accuracy REAL NOT NULL DEFAULT 0, time_spent INTEGER NOT NULL DEFAULT 0,
        stars INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 1,
        is_best INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`).run();
    await env.INDO_LEARN_DB.prepare(`CREATE TABLE IF NOT EXISTS challenge_weekly (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
        week_key TEXT NOT NULL, total_score REAL NOT NULL DEFAULT 0, stages_cleared INTEGER NOT NULL DEFAULT 0,
        best_accuracy REAL NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(username, week_key)
    )`).run();

    // 迁移：确保 mode 列存在（兼容旧表）
    try { await env.INDO_LEARN_DB.prepare(`ALTER TABLE challenge_progress ADD COLUMN mode TEXT NOT NULL DEFAULT 'normal'`).run(); } catch(e) {}

    const now = new Date().toISOString();

    // 查询历史最佳（按 username + stage_id + mode 精确匹配）
    const progress = await env.INDO_LEARN_DB
        .prepare('SELECT * FROM challenge_progress WHERE username = ? AND stage_id = ? AND mode = ?')
        .bind(username, stageId, currentMode).first();

    let isBest = false;
    let newStars = stars || 0;

    if (progress) {
        const currentAttempts = progress.attempts + 1;
        if (score > progress.best_score) {
            isBest = true;
            await env.INDO_LEARN_DB.prepare(
                `UPDATE challenge_progress SET best_score = ?, best_accuracy = ?, best_time = ?, stars = ?, attempts = ?, cleared = ?, updated_at = ? WHERE username = ? AND stage_id = ? AND mode = ?`
            ).bind(score, accuracy, timeSpent, newStars, currentAttempts, 1, now, username, stageId, currentMode).run();
        } else {
            await env.INDO_LEARN_DB.prepare(
                `UPDATE challenge_progress SET attempts = ?, updated_at = ? WHERE username = ? AND stage_id = ? AND mode = ?`
            ).bind(currentAttempts, now, username, stageId, currentMode).run();
        }
    } else {
        isBest = true;
        await env.INDO_LEARN_DB.prepare(
            `INSERT INTO challenge_progress (username, stage_id, mode, first_score, best_score, best_accuracy, best_time, stars, attempts, cleared, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`
        ).bind(username, stageId, currentMode, score, score, accuracy, timeSpent, newStars, 1, now).run();
    }

    // 插入本次记录
    await env.INDO_LEARN_DB.prepare(
        `INSERT INTO challenge_records (username, stage_id, score, accuracy, time_spent, stars, is_best, attempts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(username, stageId, score, accuracy, timeSpent, newStars, isBest ? 1 : 0, progress ? progress.attempts + 1 : 1).run();

    // 更新周积分
    const weekKey = getWeekKey();
    const weekData = await env.INDO_LEARN_DB
        .prepare('SELECT * FROM challenge_weekly WHERE username = ? AND week_key = ?')
        .bind(username, weekKey).first();

    const userScore = isBest ? score : 0;
    if (weekData) {
        await env.INDO_LEARN_DB.prepare(
            `UPDATE challenge_weekly SET total_score = total_score + ?, updated_at = ? WHERE username = ? AND week_key = ?`
        ).bind(userScore, now, username, weekKey).run();
    } else {
        const userName = await env.INDO_LEARN_DB.prepare('SELECT name FROM users WHERE username = ?').bind(username).first();
        await env.INDO_LEARN_DB.prepare(
            `INSERT INTO challenge_weekly (username, name, week_key, total_score, stages_cleared, best_accuracy, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)`
        ).bind(username, userName?.name || username, weekKey, userScore, accuracy, now).run();
    }

    return new Response(JSON.stringify({
        success: true,
        isBest,
        stars: newStars,
        attempts: progress ? progress.attempts + 1 : 1,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function getWeekKey() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const days = Math.floor((now - start) / 86400000);
    const weekNum = Math.ceil((days + start.getDay() + 1) / 7);
    return `${now.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}
