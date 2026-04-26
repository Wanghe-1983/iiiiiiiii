/**
 * 闯天关 - 个人进度 API
 * GET  /api/challenge/progress - 获取所有关卡进度
 * POST /api/challenge/progress - 同步本地进度到服务端（备用）
 */
import { onRequest } from "../../_shared/utils.js";

export async function onRequestGet(context) {
    const { request, env } = context;
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return new Response(JSON.stringify({ error: '未登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    const username = await env.INDO_LEARN_KV.get('token_' + token);
    if (!username) return new Response(JSON.stringify({ error: '登录已过期' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    await ensureTables(env);

    const results = await env.INDO_LEARN_DB.prepare(
        `SELECT stage_id, first_score as firstScore, best_score as bestScore,
                best_accuracy as bestAccuracy, best_time as bestTime,
                stars, attempts, cleared
         FROM challenge_progress WHERE username = ?`
    ).bind(username).all();

    const progress = {};
    for (const r of results.results) {
        progress[r.stage_id] = {
            firstScore: r.firstScore, bestScore: r.bestScore, bestAccuracy: r.bestAccuracy,
            bestTime: r.bestTime, stars: r.stars, attempts: r.attempts, cleared: r.cleared,
        };
    }

    return new Response(JSON.stringify({ success: true, progress }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
    });
}

async function ensureTables(env) {
    await env.INDO_LEARN_DB.prepare(`CREATE TABLE IF NOT EXISTS challenge_progress (
        username TEXT NOT NULL, stage_id TEXT NOT NULL,
        first_score REAL DEFAULT 0, best_score REAL DEFAULT 0, best_accuracy REAL DEFAULT 0,
        best_time INTEGER DEFAULT 0, stars INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0,
        cleared INTEGER DEFAULT 0, updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (username, stage_id)
    )`).run();
}

export { onRequestGet as onRequest };