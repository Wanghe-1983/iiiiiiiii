/**
// build: 20260511183815
 * 闯天关 - 个人进度 API
 * GET  /api/challenge/progress - 获取所有关卡进度
 * POST /api/challenge/progress - 同步本地进度到服务端（备用）
 */

export async function onRequestGet(context) {
    const { request, env } = context;
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return new Response(JSON.stringify({ error: '未登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    const username = await env.INDO_LEARN_KV.get('token_' + token);
    if (!username) return new Response(JSON.stringify({ error: '登录已过期' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    await ensureTables(env);

    const results = await env.INDO_LEARN_DB.prepare(
        `SELECT stage_id, mode, first_score as firstScore, best_score as bestScore,
                best_accuracy as bestAccuracy, best_time as bestTime,
                stars, attempts, cleared
         FROM challenge_progress WHERE username = ?`
    ).bind(username).all();

    const progress = {};
    for (const r of results.results) {
        const key = r.mode && r.mode !== 'normal' ? `${r.stage_id}_${r.mode}` : r.stage_id;
        progress[key] = {
            firstScore: r.firstScore, bestScore: r.bestScore, bestAccuracy: r.bestAccuracy,
            bestTime: r.bestTime, stars: r.stars, attempts: r.attempts, cleared: r.cleared,
            mode: r.mode || 'normal',
        };
    }

    return new Response(JSON.stringify({ success: true, progress }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
    });
}

export async function onRequestPost(context) {
    const { request, env } = context;
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return new Response(JSON.stringify({ error: '未登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    const username = await env.INDO_LEARN_KV.get('token_' + token);
    if (!username) return new Response(JSON.stringify({ error: '登录已过期' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    const body = await request.json();
    const { progress } = body;
    if (!progress || typeof progress !== 'object') {
        return new Response(JSON.stringify({ error: '参数不完整' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    await ensureTables(env);

    for (const [stageId, data] of Object.entries(progress)) {
        if (!stageId || !data) continue;
        const mode = data.mode || 'normal';
        try {
            const existing = await env.INDO_LEARN_DB
                .prepare('SELECT best_score, stars, attempts FROM challenge_progress WHERE username = ? AND stage_id = ? AND mode = ?')
                .bind(username, stageId, mode).first();
            if (existing) {
                // 只在本地数据更好时更新
                if ((data.bestScore || 0) > (existing.best_score || 0)) {
                    await env.INDO_LEARN_DB.prepare(
                        `UPDATE challenge_progress SET best_score = ?, stars = ?, cleared = ?, updated_at = datetime('now') WHERE username = ? AND stage_id = ? AND mode = ?`
                    ).bind(data.bestScore || 0, data.stars || 0, data.cleared ? 1 : 0, username, stageId, mode).run();
                }
            } else {
                await env.INDO_LEARN_DB.prepare(
                    `INSERT INTO challenge_progress (username, stage_id, mode, first_score, best_score, best_accuracy, best_time, stars, attempts, cleared) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                ).bind(username, stageId, mode, data.firstScore || 0, data.bestScore || 0, data.bestAccuracy || 0, data.bestTime || 0, data.stars || 0, data.attempts || 0, data.cleared ? 1 : 0).run();
            }
        } catch(e) { /* skip individual errors */ }
    }

    return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
    });
}

async function ensureTables(env) {
    await env.INDO_LEARN_DB.prepare(`CREATE TABLE IF NOT EXISTS challenge_progress (
        username TEXT NOT NULL, stage_id TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'normal',
        first_score REAL DEFAULT 0, best_score REAL DEFAULT 0, best_accuracy REAL DEFAULT 0,
        best_time INTEGER DEFAULT 0, stars INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0,
        cleared INTEGER DEFAULT 0, updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (username, stage_id, mode)
    )`).run();
    // 迁移：确保 mode 列存在（旧表可能没有）
    try { await env.INDO_LEARN_DB.prepare(`ALTER TABLE challenge_progress ADD COLUMN mode TEXT NOT NULL DEFAULT 'normal'`).run(); } catch(e) { /* 列已存在则忽略 */ }
}
