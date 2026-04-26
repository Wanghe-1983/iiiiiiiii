/**
 * 闯天关 - 排行榜 API
 * GET /api/challenge/leaderboard?period=weekly|monthly|alltime
 * GET /api/challenge/leaderboard/my?period=weekly
 * GET /api/challenge/leaderboard/champion
 */
import { onRequest } from "../../_shared/utils.js";

export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/', '');

    if (path === 'challenge/leaderboard/my') {
        return handleMyRank(context, url);
    } else if (path === 'challenge/leaderboard/champion') {
        return handleChampion(context);
    } else {
        return handleLeaderboard(context, url);
    }
}

async function handleLeaderboard(context, url) {
    const { env } = context;
    const period = url.searchParams.get('period') || 'weekly';

    await ensureTables(env);

    let sql, params;

    if (period === 'alltime') {
        sql = `
            SELECT p.username, u.name, u.company_code as companyCode, u.company_name as companyName,
                   SUM(p.best_score) as totalScore, COUNT(p.stage_id) as stagesCleared,
                   AVG(p.best_accuracy) as avgAccuracy, MAX(p.stars) as maxStars
            FROM challenge_progress p
            LEFT JOIN users u ON p.username = u.username
            GROUP BY p.username
            HAVING totalScore > 0
            ORDER BY totalScore DESC LIMIT 100
        `;
        params = [];
    } else if (period === 'monthly') {
        const monthKey = new Date().toISOString().slice(0, 7);
        sql = `
            SELECT w.username, w.name, u.company_code as companyCode, u.company_name as companyName,
                   w.total_score as totalScore, w.stages_cleared as stagesCleared,
                   w.best_accuracy as avgAccuracy
            FROM challenge_weekly w
            LEFT JOIN users u ON w.username = u.username
            WHERE w.week_key LIKE ?
            GROUP BY w.username
            ORDER BY w.total_score DESC LIMIT 100
        `;
        params = [monthKey + '%'];
    } else {
        const weekKey = getWeekKey();
        sql = `
            SELECT w.username, w.name, u.company_code as companyCode, u.company_name as companyName,
                   w.total_score as totalScore, w.stages_cleared as stagesCleared,
                   w.best_accuracy as avgAccuracy
            FROM challenge_weekly w
            LEFT JOIN users u ON w.username = u.username
            WHERE w.week_key = ?
            ORDER BY w.total_score DESC LIMIT 100
        `;
        params = [weekKey];
    }

    const results = await env.INDO_LEARN_DB.prepare(sql).bind(...params).all();

    const rankings = results.results.map((r, i) => ({
        rank: i + 1,
        username: r.username,
        name: r.name,
        companyCode: r.companyCode || '',
        companyName: r.companyName || '',
        totalScore: r.totalScore || 0,
        stagesCleared: r.stagesCleared || 0,
        avgAccuracy: r.avgAccuracy || 0,
    }));

    return new Response(JSON.stringify({ success: true, rankings, period }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
    });
}

async function handleMyRank(context, url) {
    const { request, env } = context;
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return new Response(JSON.stringify({ error: '未登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    const username = await env.INDO_LEARN_KV.get('token_' + token);
    if (!username) return new Response(JSON.stringify({ error: '登录已过期' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    await ensureTables(env);

    const period = url.searchParams.get('period') || 'weekly';
    const weekKey = getWeekKey();

    let myScore = 0, myRank = 0;

    if (period === 'weekly') {
        const my = await env.INDO_LEARN_DB.prepare(
            'SELECT total_score as totalScore FROM challenge_weekly WHERE username = ? AND week_key = ?'
        ).bind(username, weekKey).first();
        myScore = my?.totalScore || 0;

        const above = await env.INDO_LEARN_DB.prepare(
            "SELECT COUNT(*) as c FROM challenge_weekly WHERE week_key = ? AND total_score > ?"
        ).bind(weekKey, myScore).first();
        myRank = (above?.c || 0) + 1;
    } else if (period === 'alltime') {
        const my = await env.INDO_LEARN_DB.prepare(
            "SELECT SUM(best_score) as totalScore FROM challenge_progress WHERE username = ?"
        ).bind(username).first();
        myScore = my?.totalScore || 0;

        const above = await env.INDO_LEARN_DB.prepare(
            "SELECT COUNT(DISTINCT username) as c FROM challenge_progress WHERE (SELECT SUM(best_score) FROM challenge_progress cp WHERE cp.username = challenge_progress.username) > ?"
        ).bind(myScore).first();
        myRank = (above?.c || 0) + 1;
    }

    const progress = await env.INDO_LEARN_DB.prepare(
        'SELECT COUNT(*) as c FROM challenge_progress WHERE username = ? AND cleared = 1'
    ).bind(username).first();

    return new Response(JSON.stringify({
        success: true,
        myRank,
        totalScore: myScore,
        stagesCleared: progress?.c || 0,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function handleChampion(context) {
    const { env } = context;
    await ensureTables(env);

    const weekKey = getWeekKey();

    // 查上周冠军
    const parts = weekKey.split('W');
    const weekNum = parseInt(parts[1]);
    const lastWeekNum = weekNum <= 1 ? 52 : weekNum - 1;
    const year = weekNum <= 1 ? parseInt(parts[0]) - 1 : parseInt(parts[0]);
    const lastWeekKey = `${year}-W${lastWeekNum.toString().padStart(2, '0')}`;

    const champion = await env.INDO_LEARN_DB.prepare(
        `SELECT w.username, w.name, w.total_score as totalScore, u.company_code as companyCode, u.company_name as companyName
         FROM challenge_weekly w LEFT JOIN users u ON w.username = u.username
         WHERE w.week_key = ? ORDER BY w.total_score DESC LIMIT 1`
    ).bind(lastWeekKey).first();

    // 检查KV中是否有广播
    const broadcastKey = await env.INDO_LEARN_KV.get('champion_broadcast');
    let broadcast = null;
    if (broadcastKey) {
        try { broadcast = JSON.parse(broadcastKey); } catch (e) { broadcast = null; }
    }

    if (champion && (!broadcast || broadcast.weekKey !== lastWeekKey)) {
        broadcast = {
            weekKey: lastWeekKey,
            username: champion.username,
            name: champion.name,
            companyCode: champion.companyCode || '',
            companyName: champion.companyName || '',
            totalScore: champion.totalScore,
        };
        await env.INDO_LEARN_KV.put('champion_broadcast', JSON.stringify(broadcast), { expirationTtl: 604800 });
    }

    return new Response(JSON.stringify({ success: true, champion: broadcast }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
    });
}

async function handleMyProgress(context, url) {
    const { request, env } = context;
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return new Response(JSON.stringify({ error: '未登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    const username = await env.INDO_LEARN_KV.get('token_' + token);
    if (!username) return new Response(JSON.stringify({ error: '登录已过期' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    await ensureTables(env);

    const progress = await env.INDO_LEARN_DB.prepare(
        'SELECT stage_id, best_score as bestScore, best_accuracy as bestAccuracy, best_time as bestTime, stars, attempts, cleared FROM challenge_progress WHERE username = ?'
    ).bind(username).all();

    return new Response(JSON.stringify({ success: true, progress: progress.results }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
    });
}

function getWeekKey() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const days = Math.floor((now - start) / 86400000);
    const weekNum = Math.ceil((days + start.getDay() + 1) / 7);
    return `${now.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}

async function ensureTables(env) {
    await env.INDO_LEARN_DB.prepare(`CREATE TABLE IF NOT EXISTS challenge_progress (
        username TEXT NOT NULL, stage_id TEXT NOT NULL,
        first_score REAL DEFAULT 0, best_score REAL DEFAULT 0, best_accuracy REAL DEFAULT 0,
        best_time INTEGER DEFAULT 0, stars INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0,
        cleared INTEGER DEFAULT 0, updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (username, stage_id)
    )`).run();
    await env.INDO_LEARN_DB.prepare(`CREATE TABLE IF NOT EXISTS challenge_weekly (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
        week_key TEXT NOT NULL, total_score REAL NOT NULL DEFAULT 0, stages_cleared INTEGER NOT NULL DEFAULT 0,
        best_accuracy REAL NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(username, week_key)
    )`).run();
    await env.INDO_LEARN_DB.prepare(`CREATE TABLE IF NOT EXISTS challenge_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, stage_id TEXT NOT NULL,
        score REAL NOT NULL DEFAULT 0, accuracy REAL NOT NULL DEFAULT 0, time_spent INTEGER NOT NULL DEFAULT 0,
        stars INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 1,
        is_best INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`).run();
}

export { onRequestGet as onRequest };