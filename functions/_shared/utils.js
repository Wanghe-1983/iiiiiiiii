/**
 * 印尼语学习助手 - 统一API处理模块
 * 每个路由文件只需: export { onRequest } from "../_shared/utils.js";
 */


function utf8ToBase64(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode('0x' + p1)));
}
function base64ToUtf8(str) {
    return decodeURIComponent(atob(str).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
}
function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
}

async function signToken(payload, env) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const h = utf8ToBase64(JSON.stringify(header));
    const p = utf8ToBase64(JSON.stringify(payload));
    const secret = await env.INDO_LEARN_KV.get('JWT_SECRET') || 'default-secret-change-me';
    const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(h + '.' + p));
    const s = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    return h + '.' + p + '.' + s;
}

async function verifyToken(token, env) {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const secret = await env.INDO_LEARN_KV.get('JWT_SECRET') || 'default-secret-change-me';
    const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sig = Uint8Array.from(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(parts[0] + '.' + parts[1]));
    if (!valid) return null;
    try { return JSON.parse(base64ToUtf8(parts[1])); } catch { return null; }
}

async function getAuthUser(request, env) {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return null;
    return await verifyToken(auth.slice(7), env);
}

async function heartbeat(username, env) {
    await env.INDO_LEARN_KV.put('online:' + username, JSON.stringify({ username, ts: Date.now() }), { expirationTtl: 120 });
    return true;
}

async function getOnlineCount(env) {
    const list = await env.INDO_LEARN_KV.list({ prefix: 'online:' });
    const now = Date.now();
    let count = 0;
    const users = [];
    for (const key of list.keys) {
        const data = JSON.parse(await env.INDO_LEARN_KV.get(key.name) || '{}');
        if (now - data.ts < 60000) {
            count++;
            users.push(data.username);
        } else {
            await env.INDO_LEARN_KV.delete(key.name);
        }
    }
    return { count, users };
}

async function kickUser(username, env) {
    await env.INDO_LEARN_KV.delete('online:' + username);
    await env.INDO_LEARN_KV.put('kicked:' + username, JSON.stringify({ ts: Date.now() }), { expirationTtl: 300 });
    return true;
}

async function banUser(username, env) {
    await env.INDO_LEARN_KV.put('banned:' + username, '1');
    return true;
}

async function unbanUser(username, env) {
    await env.INDO_LEARN_KV.delete('banned:' + username);
    return true;
}

async function isBanned(username, env) {
    return !!(await env.INDO_LEARN_KV.get('banned:' + username));
}

async function isKicked(username, env) {
    const data = await env.INDO_LEARN_KV.get('kicked:' + username);
    if (!data) return false;
    await env.INDO_LEARN_KV.delete('kicked:' + username);
    return true;
}

async function getAllUsers(env) {
    const data = await env.INDO_LEARN_KV.get('all_users');
    return data ? JSON.parse(data) : [];
}

async function saveAllUsers(users, env) {
    await env.INDO_LEARN_KV.put('all_users', JSON.stringify(users));
}

async function getUser(username, env) {
    const users = await getAllUsers(env);
    return users.find(u => u.username === username) || null;
}

async function createUser(userData, env) {
    const users = await getAllUsers(env);
    if (users.find(u => u.username === userData.username)) return { error: '用户名已存在' };
    users.push({
        username: userData.username, password: userData.password,
        name: userData.name || userData.username, role: userData.role || 'user',
        createdAt: new Date().toISOString(),
    });
    await saveAllUsers(users, env);
    return { success: true };
}

async function updateUser(username, updates, env) {
    const users = await getAllUsers(env);
    const idx = users.findIndex(u => u.username === username);
    if (idx === -1) return { error: '用户不存在' };
    Object.assign(users[idx], updates);
    await saveAllUsers(users, env);
    return { success: true };
}

async function deleteUser(username, env) {
    let users = await getAllUsers(env);
    users = users.filter(u => u.username !== username);
    await saveAllUsers(users, env);
    await env.INDO_LEARN_KV.delete('stats:' + username);
    await env.INDO_LEARN_KV.delete('daily:' + username);
    return { success: true };
}

async function saveStudyRecord(username, data, env) {
    const today = new Date().toISOString().split('T')[0];
    const dailyKey = 'daily:' + username + ':' + today;
    const existing = JSON.parse(await env.INDO_LEARN_KV.get(dailyKey) || '{}');
    Object.assign(existing, data);
    await env.INDO_LEARN_KV.put(dailyKey, JSON.stringify(existing), { expirationTtl: 86400 * 90 });
    const statsKey = 'stats:' + username;
    const stats = JSON.parse(await env.INDO_LEARN_KV.get(statsKey) || '{"learnedWords":[],"totalDays":0}');
    if (data.learnedWords) {
        const set = new Set(stats.learnedWords || []);
        (data.learnedWords || []).forEach(w => set.add(w));
        stats.learnedWords = [...set];
    }
    const dailyList = await env.INDO_LEARN_KV.list({ prefix: 'daily:' + username + ':' });
    stats.totalDays = dailyList.keys.length;
    await env.INDO_LEARN_KV.put(statsKey, JSON.stringify(stats));
    return true;
}

async function getStudyStats(username, env) {
    const stats = JSON.parse(await env.INDO_LEARN_KV.get('stats:' + username) || '{}');
    const list = await env.INDO_LEARN_KV.list({ prefix: 'daily:' + username + ':' });
    stats.totalDays = list.keys.length;
    stats.recentDays = [];
    for (const key of list.keys.slice(-7)) {
        const data = JSON.parse(await env.INDO_LEARN_KV.get(key.name) || '{}');
        stats.recentDays.push({ date: key.name.split(':').pop(), ...data });
    }
    return stats;
}

async function submitLeaderboard(entry, env) {
    const today = new Date().toISOString().split('T')[0];
    const key = 'leaderboard:' + today;
    const existing = JSON.parse(await env.INDO_LEARN_KV.get(key) || '[]');
    const idx = existing.findIndex(e => e.username === entry.username);
    const record = {
        username: entry.username, name: entry.name,
        accuracy: entry.accuracy, timeSpent: entry.timeSpent,
        totalQuestions: entry.totalQuestions, correctCount: entry.correctCount,
        submittedAt: new Date().toISOString(),
    };
    if (idx >= 0) {
        if (record.accuracy > existing[idx].accuracy ||
            (record.accuracy === existing[idx].accuracy && record.timeSpent < existing[idx].timeSpent)) {
            existing[idx] = record;
        }
    } else {
        existing.push(record);
    }
    existing.sort((a, b) => b.accuracy - a.accuracy || a.timeSpent - b.timeSpent);
    await env.INDO_LEARN_KV.put(key, JSON.stringify(existing), { expirationTtl: 86400 * 30 });
    return existing;
}

async function getLeaderboard(date, env) {
    return JSON.parse(await env.INDO_LEARN_KV.get('leaderboard:' + date) || '[]');
}

async function getLeaderboardConfig(env) {
    return JSON.parse(await env.INDO_LEARN_KV.get('leaderboard_config') || '{"enabled":false}');
}

async function setLeaderboardConfig(config, env) {
    await env.INDO_LEARN_KV.put('leaderboard_config', JSON.stringify(config));
}

async function getSystemSettings(env) {
    return JSON.parse(await env.INDO_LEARN_KV.get('system_settings') || JSON.stringify({
        maxOnline: 0, maxRegistered: 0, allowRegister: true,
        showOnlineMain: true, showOnlineLogin: true,
    }));
}

async function setSystemSettings(settings, env) {
    await env.INDO_LEARN_KV.put('system_settings', JSON.stringify(settings));
}

async function getWhitelist(env) {
    return JSON.parse(await env.INDO_LEARN_KV.get('whitelist') || '[]');
}

async function setWhitelist(list, env) {
    await env.INDO_LEARN_KV.put('whitelist', JSON.stringify(list));
}

// ========== 统一路由处理器 ==========
async function handleRequest(context) {
    const { request, env } = context;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });

    const url = new URL(request.url);
    const path = url.pathname.replace('/api/', '');
    const method = request.method;

    try {
        // 公开接口
        if (path === 'auth/login' && method === 'POST') {
            const { username, password } = await request.json();
            const users = await getAllUsers(env);
            const user = users.find(u => u.username === username && u.password === password);
            if (!user) return json({ error: '用户名或密码错误' }, 401);
            if (await isBanned(username, env)) return json({ error: '该账号已被禁止登录，请联系管理员' }, 403);
            const settings = await getSystemSettings(env);
            if (settings.maxOnline > 0) {
                const online = await getOnlineCount(env);
                if (!online.users.includes(username) && online.count >= settings.maxOnline)
                    return json({ error: '在线人数已满（' + settings.maxOnline + '人），请稍后再试' }, 429);
            }
            const token = await signToken({ username: user.username, name: user.name, role: user.role }, env);
            await heartbeat(user.username, env);
            return json({ token, user: { username: user.username, name: user.name, role: user.role } });
        }

        if (path === 'auth/register' && method === 'POST') {
            const settings = await getSystemSettings(env);
            if (!settings.allowRegister) return json({ error: '当前不允许注册' }, 403);
            if (settings.maxRegistered > 0) {
                const users = await getAllUsers(env);
                if (users.length >= settings.maxRegistered) return json({ error: '注册人数已满，请联系管理员' }, 403);
            }
            const { username, password, name } = await request.json();
            if (!username || !password) return json({ error: '用户名和密码不能为空' }, 400);
            if (username.length < 2 || username.length > 20) return json({ error: '用户名长度 2-20 位' }, 400);
            if (password.length < 4) return json({ error: '密码至少 4 位' }, 400);
            const result = await createUser({ username, password, name: name || username }, env);
            if (result.error) return json(result, 400);
            return json({ success: true, message: '注册成功' });
        }

        // 临时：提升用户角色（部署完成后应删除）
        if (path === 'init/promote' && method === 'POST') {
            const { username, role } = await request.json();
            const users = await getAllUsers(env);
            const idx = users.findIndex(u => u.username === username);
            if (idx === -1) return json({ error: '用户不存在' }, 404);
            users[idx].role = role || 'admin';
            await saveAllUsers(users, env);
            return json({ success: true });
        }

        if (path === 'system/info' && method === 'GET') {
            const online = await getOnlineCount(env);
            const settings = await getSystemSettings(env);
            const users = await getAllUsers(env);
            return json({
                onlineCount: online.count, registeredCount: users.length,
                allowRegister: settings.allowRegister,
                showOnlineMain: settings.showOnlineMain, showOnlineLogin: settings.showOnlineLogin,
            });
        }

        if (path === 'leaderboard' && method === 'GET') {
            const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
            const config = await getLeaderboardConfig(env);
            const board = await getLeaderboard(date, env);
            return json({ config, board });
        }

        // 需要登录
        let authUser = await getAuthUser(request, env);
        if (!authUser) return json({ error: '未登录或登录已过期' }, 401);
        if (await isKicked(authUser.username, env)) return json({ error: 'kicked', message: '您已被管理员强制下线' }, 401);

        if (path === 'user/heartbeat' && method === 'POST') { await heartbeat(authUser.username, env); return json({ ok: true }); }
        if (path === 'user/me' && method === 'GET') {
            const user = await getUser(authUser.username, env);
            if (!user) return json({ error: '用户不存在' }, 404);
            return json({ username: user.username, name: user.name, role: user.role, createdAt: user.createdAt });
        }
        if (path === 'user/password' && method === 'PUT') {
            const { oldPassword, newPassword } = await request.json();
            const user = await getUser(authUser.username, env);
            if (!user || user.password !== oldPassword) return json({ error: '原密码错误' }, 400);
            if (newPassword.length < 4) return json({ error: '新密码至少 4 位' }, 400);
            await updateUser(authUser.username, { password: newPassword }, env);
            return json({ success: true });
        }
        if (path === 'study/save' && method === 'POST') { await saveStudyRecord(authUser.username, await request.json(), env); return json({ ok: true }); }
        if (path === 'study/stats' && method === 'GET') { return json(await getStudyStats(authUser.username, env)); }
        if (path === 'leaderboard/submit' && method === 'POST') {
            const config = await getLeaderboardConfig(env);
            if (!config.enabled) return json({ error: '打榜未开启' }, 403);
            const entry = await request.json();
            entry.username = authUser.username; entry.name = authUser.name;
            return json({ success: true, board: await submitLeaderboard(entry, env) });
        }

        // 管理员接口
        if (authUser.role !== 'admin') return json({ error: '无管理员权限' }, 403);

        if (path === 'admin/users' && method === 'GET') {
            const users = await getAllUsers(env);
            const online = await getOnlineCount(env);
            const result = [];
            for (const u of users) result.push({ ...u, isOnline: online.users.includes(u.username), isBanned: await isBanned(u.username, env) });
            return json(result);
        }
        if (path === 'admin/users' && method === 'POST') { return json(await createUser({ ...(await request.json()), role: (await request.json()).role || 'user' }, env)); }
        if (path === 'admin/users' && method === 'PUT') {
            const data = await request.json();
            if (!data.username) return json({ error: '缺少 username' }, 400);
            return json(await updateUser(data.username, data, env));
        }
        if (path === 'admin/users' && method === 'DELETE') {
            const { username } = await request.json();
            if (!username) return json({ error: '缺少 username' }, 400);
            if (username === authUser.username) return json({ error: '不能删除自己' }, 400);
            await deleteUser(username, env);
            return json({ success: true });
        }
        if (path === 'admin/kick' && method === 'POST') { const { username } = await request.json(); await kickUser(username, env); return json({ success: true }); }
        if (path === 'admin/ban' && method === 'POST') {
            const { username, ban } = await request.json();
            if (ban) await banUser(username, env); else await unbanUser(username, env);
            return json({ success: true });
        }
        if (path === 'admin/online' && method === 'GET') { return json(await getOnlineCount(env)); }
        if (path === 'admin/settings' && method === 'GET') {
            const settings = await getSystemSettings(env);
            const online = await getOnlineCount(env);
            return json({ ...settings, currentOnline: online.count, totalUsers: (await getAllUsers(env)).length });
        }
        if (path === 'admin/settings' && method === 'PUT') { await setSystemSettings(await request.json(), env); return json({ success: true }); }
        if (path === 'admin/whitelist' && method === 'GET') { return json(await getWhitelist(env)); }
        if (path === 'admin/whitelist' && method === 'PUT') { await setWhitelist(await request.json(), env); return json({ success: true }); }
        if (path === 'admin/leaderboard-config' && method === 'GET') { return json(await getLeaderboardConfig(env)); }
        if (path === 'admin/leaderboard-config' && method === 'PUT') { await setLeaderboardConfig(await request.json(), env); return json({ success: true }); }
        if (path === 'admin/init-users' && method === 'POST') {
            const { users } = await request.json();
            for (const u of users) await createUser(u, env);
            return json({ success: true, imported: users.length });
        }

        return json({ error: '接口不存在' }, 404);
    } catch (err) {
        return json({ error: '服务器错误: ' + err.message }, 500);
    }
}

export const onRequest = handleRequest;
