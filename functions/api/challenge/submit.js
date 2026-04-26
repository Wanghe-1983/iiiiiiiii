/**
 * 闯天关 - 提交成绩 API
 * POST /api/challenge/submit
 * Body: { stageId, accuracy, timeSpent, score, stars, answers }
 */
import { onRequest } from "../../_shared/utils.js";

export async function onRequestPost(context) {
    const { request, env } = context;
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return new Response(JSON.stringify({ error: '未登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    const username = await env.INDO_LEARN_KV.get('token_' + token);
    if (!username) return new Response(JSON.stringify({ error: '登录已过期' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    const body = await request.json();
    const { stageId, accuracy, timeSpent, score, stars, answers } = body;
    if (!stageId || accuracy === undefined || timeSpent === undefined || score === undefined) {
        return new Response(JSON.stringify({ error: '参数不完整' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 自动建表
    await env.INDO_LEARN_DB.prepare(`CREATE TABLE IF NOT EXISTS challenge_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, stage_id TEXT NOT NULL,
        score REAL NOT NULL DEFAULT 0, accuracy REAL NOT NULL DEFAULT 0, time_spent INTEGER NOT NULL DEFAULT 0,
        stars INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 1,
        is_best INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`).run();
    await env.INDO_LEARN_DB.prepare(`CREATE TABLE IF NOT EXISTS challenge_progress (
        username TEXT NOT NULL, stage_id TEXT NOT NULL,
        first_score REAL DEFAULT 0, best_score REAL DEFAULT 0, best_accuracy REAL DEFAULT 0,
        best_time INTEGER DEFAULT 0, stars INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0,
        cleared INTEGER DEFAULT 0, updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (username, stage_id)
    )`).run();

    const now = new Date().toISOString();

    // 查询历史最佳
    const progress = await env.INDO_LEARN_DB
        .prepare('SELECT * FROM challenge_progress WHERE username = ? AND stage_id = ?')
        .bind(username, stageId).first();

    let isBest = false;
    let newStars = stars || 0;

    if (progress) {
        const currentAttempts = progress.attempts + 1;
        if (score > progress.best_score) {
            isBest = true;
            await env.INDO_LEARN_DB.prepare(
                `UPDATE challenge_progress SET best_score = ?, best_accuracy = ?, best_time = ?, stars = ?, attempts = ?, cleared = ?, updated_at = ? WHERE username = ? AND stage_id = ?`
            ).bind(score, accuracy, timeSpent, newStars, currentAttempts, stars >= 1 ? 1 : 1, now, username, stageId).run();
        } else {
            await env.INDO_LEARN_DB.prepare(
                `UPDATE challenge_progress SET attempts = ?, updated_at = ? WHERE username = ? AND stage_id = ?`
            ).bind(currentAttempts, now, username, stageId).run();
        }
    } else {
        isBest = true;
        await env.INDO_LEARN_DB.prepare(
            `INSERT INTO challenge_progress (username, stage_id, first_score, best_score, best_accuracy, best_time, stars, attempts, cleared, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
        ).bind(username, stageId, score, score, accuracy, timeSpent, newStars, stars >= 1 ? 1 : 0, now, now).run();
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

export { onRequestPost as onRequest };