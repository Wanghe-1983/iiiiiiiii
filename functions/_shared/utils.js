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
    try {
        const payload = JSON.parse(base64ToUtf8(parts[1]));
        // 访客 token 自动过期
        if (payload.role === 'visitor' && payload.exp && Date.now() > payload.exp) return null;
        return payload;
    } catch { return null; }
}

async function getAuthUser(request, env) {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return null;
    return await verifyToken(auth.slice(7), env);
}

async function heartbeat(username, env, deviceToken) {
    const settings = await getSystemSettings(env);
    if (!settings.allowMultiDevice && deviceToken) {
        // 单设备模式：如果设备token不匹配，标记为需要被踢
        const prev = await env.INDO_LEARN_KV.get('online:' + username);
        if (prev) {
            const prevData = JSON.parse(prev);
            if (prevData.deviceToken && prevData.deviceToken !== deviceToken) {
                // 其他设备登录了，标记被踢
                await env.INDO_LEARN_KV.put('kicked:' + username, deviceToken, { expirationTtl: 60 });
            }
        }
    }
    await env.INDO_LEARN_KV.put('online:' + username, JSON.stringify({ username, ts: Date.now(), deviceToken: deviceToken || '' }), { expirationTtl: 120 });
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
        userType: userData.userType || 'hobby',
        companyCode: userData.companyCode || '', empNo: userData.empNo || '',
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
    await env.INDO_LEARN_KV.put(dailyKey, JSON.stringify(existing), { expirationTtl: 86400 * 30 });
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
    const stored = await env.INDO_LEARN_KV.get('system_settings');
    const defaults = {
        maxOnline: 0, maxRegistered: 0, allowRegister: true,
        showOnlineMain: true, showOnlineLogin: true,
        allowMultiDevice: true,
        requireEmployeeVerify: true,
        whitelistEnabled: false,
        allowVisitor: true,
        visitorDuration: 3,
        adminPanelPassword: 'admin123',
        showOnlineCount: true,
        showRegCount: true,
    };
    if (!stored) return defaults;
    const settings = JSON.parse(stored);
    // 合并默认值（防止旧数据缺少新字段）
    for (const k in defaults) { if (settings[k] === undefined) settings[k] = defaults[k]; }
    return settings;
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

// ========== 员工名单管理 ==========
async function getEmployeeList(env) {
    return JSON.parse(await env.INDO_LEARN_KV.get('employee_list') || '[]');
}

async function setEmployeeList(list, env) {
    await env.INDO_LEARN_KV.put('employee_list', JSON.stringify(list));
}

async function addEmployee(employee, env) {
    const list = await getEmployeeList(env);
    // 去重：同公司同工号
    const exists = list.find(e => e.companyCode === employee.companyCode && e.empNo === employee.empNo);
    if (exists) return { error: '该员工已存在（' + employee.companyCode + '-' + employee.empNo + '）' };
    list.push(employee);
    await setEmployeeList(list, env);
    return { success: true };
}

async function deleteEmployee(companyCode, empNo, env) {
    let list = await getEmployeeList(env);
    const before = list.length;
    list = list.filter(e => !(e.companyCode === companyCode && e.empNo === empNo));
    if (list.length === before) return { error: '员工不存在' };
    await setEmployeeList(list, env);
    return { success: true };
}

async function verifyEmployee(companyCode, empNo, env) {
    if (!companyCode || !empNo) return { valid: false, error: '公司缩写和工号不能为空' };
    const list = await getEmployeeList(env);
    const emp = list.find(e => e.companyCode === companyCode && e.empNo === empNo);
    if (!emp) return { valid: false, error: '未找到该员工信息，请检查公司缩写和工号' };
    return { valid: true, employee: emp };
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
        // 发送邮箱验证码
        if (path === 'email/send-code' && method === 'POST') {
            const { email } = await request.json();
            if (!email) return json({ error: '邮箱不能为空' }, 400);
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) return json({ error: '邮箱格式不正确' }, 400);
            // 检查邮箱是否已注册
            const existingUsers = await getAllUsers(env);
            if (existingUsers.find(u => u.email === email)) return json({ error: '该邮箱已被注册' }, 400);
            // 检查发送频率（1分钟内只能发一次）
            const lastSent = await env.INDO_LEARN_KV.get('email_rate:' + email);
            if (lastSent) {
                const elapsed = Date.now() - parseInt(lastSent);
                if (elapsed < 60000) return json({ error: '请等待 ' + Math.ceil((60000 - elapsed) / 1000) + ' 秒后再试' }, 429);
            }
            // 生成6位验证码
            const code = String(Math.floor(100000 + Math.random() * 900000));
            await env.INDO_LEARN_KV.put('email_code:' + email, JSON.stringify({ code, expires: Date.now() + 300000 }), { expirationTtl: 360 });
            await env.INDO_LEARN_KV.put('email_rate:' + email, String(Date.now()), { expirationTtl: 120 });
            // 发送邮件（使用 Cloudflare Email Workers）
            try {
                await sendVerifyEmail(email, code, env);
                return json({ success: true, message: '验证码已发送' });
            } catch (e) {
                console.error('发送邮件失败:', e);
                return json({ error: '邮件发送失败，请稍后重试' }, 500);
            }
        }

        // 验证邮箱验证码
        if (path === 'email/verify-code' && method === 'POST') {
            const { email, code } = await request.json();
            if (!email || !code) return json({ error: '邮箱和验证码不能为空' }, 400);
            const stored = await env.INDO_LEARN_KV.get('email_code:' + email);
            if (!stored) return json({ error: '验证码已过期，请重新获取' }, 400);
            const data = JSON.parse(stored);
            if (Date.now() > data.expires) {
                await env.INDO_LEARN_KV.delete('email_code:' + email);
                return json({ error: '验证码已过期，请重新获取' }, 400);
            }
            if (data.code !== code) return json({ error: '验证码错误' }, 400);
            // 验证成功，标记邮箱已验证
            await env.INDO_LEARN_KV.put('email_verified:' + email, '1', { expirationTtl: 600 });
            return json({ success: true, message: '邮箱验证成功' });
        }

        if (path === 'auth/login' && method === 'POST') {
            const { username, password } = await request.json();
            const users = await getAllUsers(env);
            let user = users.find(u => u.username === username && u.password === password);
            if (!user) user = users.find(u => u.email === username && u.password === password);
            if (!user) user = users.find(u => u.empNo === username && u.password === password);
            if (!user) return json({ error: '用户名或密码错误' }, 401);
            if (await isBanned(username, env)) return json({ error: '该账号已被禁止登录，请联系管理员' }, 403);
            const settings = await getSystemSettings(env);
            // 白名单校验
            if (settings.whitelistEnabled) {
                const whitelist = await getWhitelist(env);
                const inWhitelist = whitelist.some(w => w.username === user.username || w.username === username);
                if (!inWhitelist) return json({ error: '当前开启了白名单登录控制，您的账号不在白名单中，请联系管理员' }, 403);
            }
            if (settings.maxOnline > 0) {
                const online = await getOnlineCount(env);
                if (!online.users.includes(username) && online.count >= settings.maxOnline)
                    return json({ error: '在线人数已满（' + settings.maxOnline + '人），请稍后再试' }, 429);
            }
            const token = await signToken({ username: user.username, name: user.name, role: user.role }, env);
            await heartbeat(user.username, env, token);
            return json({ token, user: { username: user.username, name: user.name, role: user.role, userType: user.userType, companyCode: user.companyCode || '', empNo: user.empNo || '' } });
        }

        // 访客登录（无需账号密码）
        if (path === 'auth/visitor-login' && method === 'POST') {
            const settings = await getSystemSettings(env);
            if (!settings.allowVisitor) return json({ error: '当前不允许访客登录，请联系管理员' }, 403);
            // 员工优先：在线人数已满时，访客不能登录
            const online = await getOnlineCount(env);
            const maxOnline = settings.maxOnline || 0;
            if (maxOnline > 0 && online.count >= maxOnline) return json({ error: '在线人数已满，请稍后再试' }, 429);
            // 访客使用临时用户名
            const visitorId = 'visitor_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            const visitDuration = (settings.visitorDuration || 3) * 60 * 1000; // 毫秒
            const token = await signToken({ username: visitorId, name: '访客', role: 'visitor', exp: Date.now() + visitDuration }, env);
            await heartbeat(visitorId, env, token);
            return json({ token, user: { username: visitorId, name: '访客', role: 'visitor', userType: 'visitor', visitDuration: settings.visitorDuration || 3 } });
        }

        if (path === 'auth/register' && method === 'POST') {
            const settings = await getSystemSettings(env);
            if (!settings.allowRegister) return json({ error: '当前不允许注册' }, 403);
            if (settings.maxRegistered > 0) {
                const users = await getAllUsers(env);
                if (users.length >= settings.maxRegistered) return json({ error: '注册人数已满，请联系管理员' }, 403);
            }
            let { password, name, userType, companyCode, empNo } = await request.json();
            if (!password) return json({ error: '密码不能为空' }, 400);
            if (password.length < 4) return json({ error: '密码至少 4 位' }, 400);
            // 爱好者不强制昵称，员工必须有昵称
            if (userType === 'employee' && !name) return json({ error: '员工需填写昵称' }, 400);
            if (name && name.length > 10) return json({ error: '昵称最多5个汉字或10个字母' }, 400);
            // 用户类型校验
            let username;
            if (userType === 'employee') {
                if (!companyCode || !empNo) return json({ error: '公司员工需填写公司缩写和工号' }, 400);
                companyCode = companyCode.toUpperCase();
                const settings2 = await getSystemSettings(env);
                if (settings2.requireEmployeeVerify !== false) {
                    const verify = await verifyEmployee(companyCode, empNo, env);
                    if (!verify.valid) return json({ error: verify.error }, 400);
                }
                // 员工用工号作为用户名（格式：公司缩写-工号）
                username = companyCode + '-' + empNo;
            } else {
                // 爱好者统一用户名 88888888，昵称可选
                companyCode = '';
                empNo = '88888888';
                username = '88888888';
                if (!name) name = '爱好者';
            }
            const result = await createUser({
                username, password, name,
                role: 'user', userType: userType || 'hobby',
                companyCode: companyCode || '', empNo: empNo || '88888888',
            }, env);
            if (result.error) return json(result, 400);
            return json({ success: true, message: '注册成功', username });
        }

        // 公开：获取最新版本信息
        if (path === 'changelog/latest' && method === 'GET') {
            const data = await env.KV.get('changelog', 'json') || [];
            return json({ latest: data[0] || null, count: data.length });
        }
        if (path === 'system/info' && method === 'GET') {
            const online = await getOnlineCount(env);
            const settings = await getSystemSettings(env);
            const users = await getAllUsers(env);
            return json({
                onlineCount: online.count, registeredCount: users.length,
                whitelistEnabled: settings.whitelistEnabled === true,
                maxOnline: settings.maxOnline || 0,
                allowMultiDevice: settings.allowMultiDevice !== false,
                requireEmployeeVerify: settings.requireEmployeeVerify !== false,
                allowRegister: settings.allowRegister,
                showOnlineMain: settings.showOnlineMain, showOnlineLogin: settings.showOnlineLogin,
                allowVisitor: settings.allowVisitor === true,
                visitorDuration: settings.visitorDuration || 3,
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
            // 访客时长到期检查
            if (authUser.role === 'visitor' && authUser.exp && Date.now() > authUser.exp) {
                return json({ error: 'visitor_expired', message: '访客登录时长已到，请注册账号继续学习' }, 401);
            }

        if (path === 'user/heartbeat' && method === 'POST') { const clientToken = request.headers.get('Authorization')?.replace('Bearer ', '') || ''; await heartbeat(authUser.username, env, clientToken); return json({ ok: true }); }
        if (path === 'user/me' && method === 'GET') {
            const user = await getUser(authUser.username, env);
            if (!user) return json({ error: '用户不存在' }, 404);
            return json({ username: user.username, name: user.name, role: user.role, createdAt: user.createdAt });
        }
        // 注销账号
        if (path === 'user/delete' && method === 'POST') {
            if (!authUser) return json({ error: '未登录' }, 401);
            // 管理员不能注销自己
            if (authUser.role === 'admin') {
                const allAdmins = (await getAllUsers(env)).filter(u => u.role === 'admin');
                if (allAdmins.length <= 1) return json({ error: '最后一个管理员不能注销' }, 400);
            }
            const result = await deleteUser(authUser.username, env);
            if (result.error) return json(result, 400);
            // 清除在线状态和学习数据
            await env.INDO_LEARN_KV.delete('online:' + authUser.username);
            await env.INDO_LEARN_KV.delete('study:' + authUser.username);
            await env.INDO_LEARN_KV.delete('practice_history:' + authUser.username);
            return json({ success: true, message: '账号已注销' });
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
            // 爱好者不能参与排行榜
            if (authUser.userType === 'hobby' || authUser.role === 'visitor') return json({ error: '访客和爱好者不能参与排行榜' }, 403);
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
            if (!data.username && data.action !== 'batch_add') return json({ error: '缺少 username' }, 400);
            const action = data.action;
            if (action === 'add') {
                if (!data.user) return json({ error: '缺少 user' }, 400);
                const existing = await getUser(data.user.username, env);
                if (existing) return json({ error: '用户名已存在' }, 400);
                const result = await createUser({ ...data.user, role: data.user.role || 'user' }, env);
                return json(result, result.error ? 400 : 200);
            }
            if (action === 'batch_add') {
                let imported = 0;
                for (const u of (data.users || [])) {
                    const existing = await getUser(u.username, env);
                    if (!existing) { await createUser({ ...u, role: u.role || 'user' }, env); imported++; }
                }
                return json({ success: true, imported });
            }
            if (action === 'delete') {
                if (data.username === authUser.username) return json({ error: '不能删除自己' }, 400);
                await deleteUser(data.username, env);
                return json({ success: true });
            }
            if (action === 'kick') { await kickUser(data.username, env); return json({ success: true }); }
            if (action === 'ban') { if (data.ban) await banUser(data.username, env); else await unbanUser(data.username, env); return json({ success: true }); }
            if (action === 'update') {
                const updateData = { ...data.data };
                delete updateData.username;
                return json(await updateUser(data.username, updateData, env));
            }
            // 兼容旧接口
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
        if (path === 'admin/whitelist' && method === 'GET') {
            const action = url.searchParams.get('action');
            if (action === 'employees') return json(await getEmployeeList(env));
            return json(await getWhitelist(env));
        }
        if (path === 'admin/whitelist' && method === 'PUT') {
            const data = await request.json();
            if (data.action === 'employees') {
                if (data.action === 'add') {
                    // 添加单个员工
                    const result = await addEmployee(data.employee, env);
                    return json(result, result.error ? 400 : 200);
                }
                if (data.action === 'delete') {
                    // 删除员工
                    const result = await deleteEmployee(data.companyCode, data.empNo, env);
                    return json(result, result.error ? 400 : 200);
                }
                if (data.action === 'import') {
                    // 批量导入
                    await setEmployeeList(data.list, env);
                    return json({ success: true });
                }
                return json({ error: '缺少 action 参数' }, 400);
            }
            if (data.employees) { await setWhitelist(data.employees, env); }
            else { await setWhitelist(data, env); }
            return json({ success: true });
        }

        // 员工名单管理
        if (path === 'admin/employees' && method === 'GET') { return json(await getEmployeeList(env)); }
        if (path === 'admin/employees' && method === 'POST') {
            const data = await request.json();
            if (data.bulk) { await setEmployeeList(data.list, env); return json({ success: true }); }
            const result = await addEmployee(data, env);
            return json(result, result.error ? 400 : 200);
        }
        if (path === 'admin/employees' && method === 'DELETE') {
            const { companyCode, empNo } = await request.json();
            const result = await deleteEmployee(companyCode, empNo, env);
            return json(result, result.error ? 400 : 200);
        }
        if (path === 'admin/leaderboard-config' && method === 'GET') { return json(await getLeaderboardConfig(env)); }
        if (path === 'admin/leaderboard-config' && method === 'PUT') { await setLeaderboardConfig(await request.json(), env); return json({ success: true }); }
        // === 学习统计管理 ===
        if (path === 'admin/study-stats' && method === 'GET') {
            const users = await getAllUsers(env);
            const allStats = {};
            for (const u of users) {
                const stats = await getStudyStats(u.username, env);
                allStats[u.username] = {
                    name: u.name || u.username,
                    role: u.role || 'user',
                    ...stats
                };
            }
            return json({ stats: allStats });
        }
        if (path === 'admin/study-clear' && method === 'POST') {
            const { username } = await request.json();
            if (!username) return json({ error: '缺少 username' }, 400);
            await env.INDO_LEARN_KV.delete('study_' + username);
            return json({ success: true, message: `已清空 ${username} 的学习数据` });
        }

        // === 版本说明 ===
        if (path === 'admin/changelog/list' && method === 'GET') {
            const data = await env.KV.get('changelog', 'json') || [];
            return json({ versions: data });
        }
        if (path === 'admin/changelog/save' && method === 'POST') {
            const { version, title, content: verContent, idx } = await request.json();
            if (!version || !verContent) return json({ error: '版本号和内容不能为空' }, 400);
            const data = await env.KV.get('changelog', 'json') || [];
            const today = new Date().toLocaleDateString('zh-CN');
            if (idx >= 0 && idx < data.length) {
                data[idx] = { ...data[idx], version, title, content: verContent, date: today };
            } else {
                data.unshift({ version, title, content: verContent, date: today });
            }
            await env.KV.put('changelog', JSON.stringify(data));
            return json({ success: true, versions: data });
        }
        if (path === 'admin/changelog/delete' && method === 'POST') {
            const { idx } = await request.json();
            const data = await env.KV.get('changelog', 'json') || [];
            if (idx >= 0 && idx < data.length) {
                data.splice(idx, 1);
                await env.KV.put('changelog', JSON.stringify(data));
                return json({ success: true });
            }
            return json({ error: '索引无效' }, 400);
        }

        return json({ error: '接口不存在' }, 404);
    } catch (err) {
        return json({ error: '服务器错误: ' + err.message }, 500);
    }
}

export const onRequest = handleRequest;
