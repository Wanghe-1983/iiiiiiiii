/**
 * 印尼语学习助手 - Cloudflare Pages Functions 后端路由
 * KV（配置）+ D1（用户数据）混合架构
 */

import { verifyToken, requireAuth, requireAdmin, hashPassword, verifyPassword, generateToken, hashStr, AuthError } from './auth.js';

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/', '').replace(/\/$/, '');
    const method = request.method;

    // 路由表
    const routes = {
        // ========== 系统 ==========
        'system/info':                  { get: handleSystemInfo },
        'auth/login':                   { post: handleLogin },
        'auth/register':                { post: handleRegister },
        'visitor/login':                { post: handleVisitorLogin },

        // ========== 用户 ==========
        'user/me':                      { get: handleGetMe },
        'user/heartbeat':               { post: handleHeartbeat },
        'user/password':                { put: handleChangePassword },
        'user/profile':                 { put: handleChangeProfile },
        'user/delete':                  { post: handleDeleteUser },

        // ========== 学习 ==========
        'study/save':                   { post: handleStudySave },
        'study/sync':                   { post: handleStudySync },
        'study/stats':                  { get: handleStudyStats },

        // ========== 管理后台 ==========
        'admin/settings':               { get: handleAdminGetSettings, put: handleAdminPutSettings },
        'admin/users':                  { get: handleAdminGetUsers, put: handleAdminPutUsers, delete: handleAdminDeleteUser },
        'admin/online':                 { get: handleAdminGetOnline },
        'admin/kick':                   { post: handleAdminKick },
        'admin/ban':                    { post: handleAdminBan },
        'admin/whitelist':              { get: handleAdminGetWhitelist, put: handleAdminPutWhitelist },
        'admin/study-stats':            { get: handleAdminStudyStats },
        'admin/study-clear':            { post: handleAdminStudyClear },
        'admin/verify':                 { post: handleAdminVerify },
        'admin/init-users':             { post: handleAdminInitUsers },

        // ========== 版本说明 ==========
        'changelog/list':               { get: handleChangelogList },
        'changelog/save':               { post: handleChangelogSave },
        'changelog/delete':             { post: handleChangelogDelete },

        // ========== 广播 ==========
        'broadcast/list':               { get: handleBroadcastList },
        'broadcast/save':               { post: handleBroadcastSave },
        'broadcast/delete':             { post: handleBroadcastDelete },
        'broadcast/active':             { get: handleBroadcastActive },
        'broadcast/config':             { get: handleBroadcastGetConfig, put: handleBroadcastPutConfig },
    };

        // 数据库迁移（确保新增列存在，已存在则忽略）
        try { await env.INDO_LEARN_DB.prepare('ALTER TABLE users ADD COLUMN plain_password TEXT').run(); } catch(e) {}

    const route = routes[path];
    if (!route) {
        return json({ error: '接口不存在' }, 404);
    }

    const handler = route[method.toLowerCase()];
    if (!handler) {
        return json({ error: '方法不支持' }, 405);
    }

    try {
        return await handler(context);
    } catch (err) {
        if (err instanceof AuthError) {
            return json({ error: err.message }, err.status);
        }
        console.error(`API Error [${method} ${path}]:`, err);
        return json({ error: '服务器内部错误: ' + err.message }, 500);
    }
}

// ========== 工具函数 ==========

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
}

function jsonOK(data) { return json({ success: true, ...data }); }
function jsonErr(msg, status = 400) { return json({ error: msg }, status); }

// 读取 KV 配置
async function getSettings(env) {
    const data = await env.INDO_LEARN_KV.get('system_settings');
    if (!data) return null;
    const stored = JSON.parse(data);
    // 与默认值合并，确保新增字段自动补齐
    const defaults = defaultSettings();
    const merged = { ...defaults, ...stored };
    // 数组类型字段不覆盖（如 hellLevels、等级配置等）
    if (stored.hellLevels) merged.hellLevels = stored.hellLevels;
    if (stored.challengeLevelConfigUser) merged.challengeLevelConfigUser = stored.challengeLevelConfigUser;
    if (stored.challengeLevelConfigVisitor) merged.challengeLevelConfigVisitor = stored.challengeLevelConfigVisitor;
    if (stored.studyLevelConfigUser) merged.studyLevelConfigUser = stored.studyLevelConfigUser;
    if (stored.studyLevelConfigVisitor) merged.studyLevelConfigVisitor = stored.studyLevelConfigVisitor;
    if (stored.studyVisibleLevelsUser) merged.studyVisibleLevelsUser = stored.studyVisibleLevelsUser;
    if (stored.studyVisibleLevelsVisitor) merged.studyVisibleLevelsVisitor = stored.studyVisibleLevelsVisitor;
    if (stored.studyPracticeUser) merged.studyPracticeUser = { ...defaults.studyPracticeUser, ...stored.studyPracticeUser };
    if (stored.studyPracticeVisitor) merged.studyPracticeVisitor = { ...defaults.studyPracticeVisitor, ...stored.studyPracticeVisitor };
    return merged;
}

// 写入 KV 配置
async function setSettings(env, settings) {
    await env.INDO_LEARN_KV.put('system_settings', JSON.stringify(settings));
}

// 获取默认设置
function defaultSettings() {
    return {
        maxOnline: 0,
        maxRegistered: 0,
        allowRegister: true,
        showOnlineMain: true,
        showOnlineLogin: true,
        allowMultiDevice: false,
        allowVisitor: true,
        visitorDuration: 3,
        adminPanelPassword: 'admin123',
        showOnlineCount: true,
        showRegCount: true,
        allowVisitorChallenge: false,
        visitorMultiDevice: true,
        mainVersion: 'v2.47',              // 主界面版本号
        mainChangelog: `v2.29
- 新增：版本更新自动检测，后台发布新版本后用户端弹窗提示刷新
- 新增：用户名单下载功能（CSV 格式，可选是否包含管理员）
- 新增：用户列表显示明文密码，支持管理员查看和修改
- 新增：闯天关普通/地狱模式独立保存按钮，互不干扰
- 修复：刷新后台页面后预计关卡总数显示 0 的问题
- 修复：course-content.json 路径在部署环境中不正确`,             // 主界面更新日志内容
        userGuide: `## 欢迎使用印尼语学习助手

本平台是基于 **BIPA（Bahasa Indonesia bagi Penutur Asing）** 课程体系开发的在线学习工具，专为印尼语学习者设计。

### 课件来源

课程内容来源于 **BIPA 官方教材**（印度尼西亚教育部对外印尼语教学标准），涵盖 BIPA 1 至 BIPA 7 共七个等级，内容包括单词、短句和对话。

### 功能模块

- **勤学苦练**：课程学习、选择填空练习、学习统计，适合系统化学习
- **闯天关**：闯关挑战模式，包含普通模式和地狱模式，支持计时答题和排行榜

### 账号说明

- **注册用户**：由管理员在后台添加，享有完整功能权限
- **访客体验**：无需注册即可体验部分基础功能，有使用时长限制

### 关于使用限制

为保证系统稳定运行，平台对注册人数和同时在线人数进行了适当控制，原因如下：

- 服务器存储容量有限，用户学习数据需要持久化保存
- 数据库读写频率存在上限，过高的并发访问可能影响所有用户体验
- 当前处于内测阶段，优先保障已注册用户的学习质量

如有使用问题或账号申请需求，请联系管理员。

### 版本记录

- **v1.0**（2026-03-15）：首次部署上线
- **v2.0**：新增闯天关模块
- **v2.2**：新增访客体验模式
- **v2.26**：完善管理后台、个人设置、多设备控制等功能
`,  // 使用说明内容（支持Markdown简易语法）
        hellLevels: [5, 6, 7], // 地狱模式关卡等级（BIPA 5/6/7）
        // 闯天关配置
        challengeEnabled: true,
        challengeSequentialMode: false,        // 启用闯天关功能
        challengeTimeLimit: 0,         // 每关时间限制（秒），0=不限时
        challengeStar3: 90,            // 3星分数线
        challengeStar2: 70,            // 2星分数线
        challengeStar1: 50,            // 1星分数线（低于此为失败）
        challengeAccuracyWeight: 0.9,  // 准确率权重
        challengeTimeWeight: 0.1,      // 用时权重
        challengeTimeMultiplier: 5,    // 时间惩罚系数（越大对慢答题越宽容）
        hellModeEnabled: true,         // 地狱模式总开关
        hellSequentialMode: true,     // 地狱模式顺序闯关
        hellTimeLimitEnabled: true,   // 地狱模式限时答题
        // 每关题目配置
        challengeQuestionCount: 10,     // 普通模式每关题目数量
        challengeQuestionType: 'words', // 题目类型: words(单词)/sentences(短句)/dialogues(对话)/mixed(混合)
        // 地狱模式独立配置
        hellQuestionCount: 15,          // 地狱模式每关题目数量
        hellQuestionType: 'mixed',      // 地狱模式题目类型
        hellTimeLimit: 120,             // 地狱模式每关时间限制（秒），0=不限时

        // ========== 闯天关关卡等级控制 ==========
        challengeLevelConfigUser: {0:2,1:2,2:2,3:2,4:2,5:2,6:2,7:2},  // 用户关卡控制(2=可闯关,1=仅展示,0=隐藏)
        challengeLevelConfigVisitor: {0:2,1:0,2:0,3:0,4:0,5:0,6:0,7:0}, // 访客关卡控制

        // ========== 勤学苦练配置 ==========
        // 课程可见性
        studyLevelConfigUser: {0:2,1:2,2:2,3:2,4:2,5:2,6:2,7:2},  // 用户等级控制(2=可学习,1=仅展示,0=隐藏)
        studyLevelConfigVisitor: {0:2,1:0,2:0,3:0,4:0,5:0,6:0,7:0}, // 访客等级控制
        studyVisibleLevelsUser: [0, 1, 2, 3, 4, 5, 6, 7],   // 用户可见的BIPA等级(兼容旧版)
        studyVisibleLevelsVisitor: [0],                        // 访客可见的BIPA等级(兼容旧版)

        // 练习功能配置 - 用户
        studyPracticeUser: {
            includeMastered: true,       // 练习题库包含已掌握内容
            includeCurrentLesson: true,  // 练习题库包含当前课本全部内容
            enableWrongBook: true,       // 启用错题集
            allowDeleteWrong: true,      // 允许删除单条错题
            allowClearWrong: true,       // 允许清空错题集
            allowUnmarkMastered: true,   // 允许取消已掌握标记
            trackStudyTime: true,        // 统计学习时长
            trackAccuracy: true,         // 统计练习准确率
            showRateSlider: true,        // 显示倍速滑块
            allowAdjustRate: true,       // 允许调节倍速
            showLoopSlider: true,        // 显示循环滑块
            allowAdjustLoop: true,       // 允许调节循环
        },

        // 练习功能配置 - 访客
        studyPracticeVisitor: {
            includeMastered: false,      // 访客练习不包含已掌握内容
            includeCurrentLesson: true,  // 访客练习包含当前课本全部内容
            enableWrongBook: false,      // 访客不启用错题集
            allowDeleteWrong: false,
            allowClearWrong: false,
            allowUnmarkMastered: true,   // 访客可取消掌握标记
            trackStudyTime: false,       // 访客不统计时长
            trackAccuracy: false,        // 访客不统计准确率
            showRateSlider: true,        // 访客可调倍速
            allowAdjustRate: true,
            showLoopSlider: true,
            allowAdjustLoop: true,
        },
    };
}

// D1 查询辅助
async function dbGet(env, sql, params = []) {
    return await env.INDO_LEARN_DB.prepare(sql).bind(...params).first();
}
async function dbAll(env, sql, params = []) {
    return (await env.INDO_LEARN_DB.prepare(sql).bind(...params).all()).results;
}
async function dbRun(env, sql, params = []) {
    return await env.INDO_LEARN_DB.prepare(sql).bind(...params).run();
}

// ========== 系统信息 ==========

async function handleSystemInfo(context) {
    const { env } = context;
    const settings = await getSettings(env) || defaultSettings();

    // D1: 统计用户数
    const totalUsers = (await dbGet(env, 'SELECT COUNT(*) as c FROM users')).c;
    const registeredCount = (await dbGet(env, "SELECT COUNT(*) as c FROM users WHERE role != 'admin'")).c;

    // D1: 统计今日学习
    const today = new Date().toISOString().slice(0, 10);
    const todayStats = await dbAll(env,
        `SELECT s.username, u.name, s.words_learned as todayWords, s.study_seconds as studySeconds
         FROM study_stats s LEFT JOIN users u ON s.username = u.username WHERE s.date = ?`,
        [today]
    );

    // KV: 在线人数
    const onlineData = await env.INDO_LEARN_KV.get('online_users');
    const onlineUsers = onlineData ? JSON.parse(onlineData) : [];
    const currentOnline = onlineUsers.length;

    return json({
        ...settings,
        currentOnline,
        totalUsers,
        registeredCount,
        todayStats,
    });
}

// ========== 登录 ==========

async function handleLogin(context) {
    const { request, env } = context;
    const { username, password } = await request.json();

    if (!username || !password) return jsonErr('请输入用户名和密码');

    const user = await dbGet(env, 'SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return jsonErr('用户名或密码错误');
    if (user.banned) return jsonErr('该账号已被封禁，请联系管理员');

    if (!await verifyPassword(password, user.password)) {
        return jsonErr('用户名或密码错误');
    }

    // 检查访客过期
    if (user.user_type === 'visitor') {
        const expire = parseInt(user.emp_no); // emp_no 存过期时间戳
        if (Date.now() > expire) {
            return jsonErr('visitor_expired');
        }
    }

    // 多设备检测（按用户类型分别判断）
    const settings = await getSettings(env) || defaultSettings();
    const isVisitor = user.user_type === 'visitor';
    if (isVisitor) {
        if (!settings.visitorMultiDevice) {
            const onlineData = await env.INDO_LEARN_KV.get('online_users');
            const onlineUsers = onlineData ? JSON.parse(onlineData) : [];
            await env.INDO_LEARN_KV.put('online_users', JSON.stringify(onlineUsers.filter(u => u.username !== username)));
        }
    } else {
        if (!settings.allowMultiDevice) {
            const onlineData = await env.INDO_LEARN_KV.get('online_users');
            const onlineUsers = onlineData ? JSON.parse(onlineData) : [];
            await env.INDO_LEARN_KV.put('online_users', JSON.stringify(onlineUsers.filter(u => u.username !== username)));
        }
    }

    // 生成 token（简单实现：base64(username|timestamp|sig)）
    const token = generateToken(username);

    // 记录在线
    const onlineData = await env.INDO_LEARN_KV.get('online_users');
    const onlineUsers = onlineData ? JSON.parse(onlineData) : [];
    const existingIdx = onlineUsers.findIndex(u => u.username === username);
    if (existingIdx >= 0) {
        onlineUsers[existingIdx].lastSeen = Date.now();
    } else {
        onlineUsers.push({ username, name: user.name, role: user.role, lastSeen: Date.now() });
    }
    await env.INDO_LEARN_KV.put('online_users', JSON.stringify(onlineUsers), { expirationTtl: 300 });
    await env.INDO_LEARN_KV.put('token_' + token, username, { expirationTtl: 86400 });

    // 更新心跳时间
    await dbRun(env, 'UPDATE users SET last_heartbeat = ? WHERE username = ?', [new Date().toISOString(), username]);

    return json({
        success: true,
        token,
        user: { username: user.username, name: user.name, role: user.role, userType: user.user_type },
    });
}

// ========== 注册 ==========

async function handleRegister(context) {
    const { request, env } = context;
    const { username, password, name, userType, companyCode, empNo } = await request.json();

    if (!username || !password || !name) return jsonErr('请填写完整信息');
    if (password.length < 4) return jsonErr('密码至少4位');

    // 检查注册是否开放
    const settings = await getSettings(env) || defaultSettings();
    if (!settings.allowRegister) return jsonErr('管理员已关闭自助注册');

    // 检查注册人数限制
    if (settings.maxRegistered > 0) {
        const count = (await dbGet(env, "SELECT COUNT(*) as c FROM users WHERE role != 'admin'")).c;
        if (count >= settings.maxRegistered) return jsonErr('注册人数已达上限（' + count + '/' + settings.maxRegistered + '），请联系管理员');
    }

    // 检查用户名是否已存在
    const existing = await dbGet(env, 'SELECT username FROM users WHERE username = ?', [username]);
    if (existing) return jsonErr('该用户名已存在');

    // 员工工号验证
    if (settings.empVerify && userType === 'employee') {
        const emp = await dbGet(env, 'SELECT * FROM employees WHERE company_code = ? AND emp_no = ?', [companyCode, empNo]);
        if (!emp) return jsonErr('工号验证失败：未在员工名单中找到 ' + companyCode + '-' + empNo);
    }

    // 白名单验证
    if (settings.enableWhitelist) {
        const emp = await dbGet(env, 'SELECT * FROM employees WHERE company_code = ? AND emp_no = ?', [companyCode || '', empNo || '']);
        if (!emp) return jsonErr('您不在白名单中，无法注册');
    }

    const hashedPw = await hashPassword(password);
    await dbRun(env,
        'INSERT INTO users (username, password, plain_password, name, role, user_type, company_code, emp_no) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [username, hashedPw, password, name, 'user', userType || 'employee', companyCode || '', empNo || '']
    );

    return jsonOK({ message: '注册成功' });
}

// ========== 访客登录 ==========

async function handleVisitorLogin(context) {
    const { env } = context;
    const settings = await getSettings(env) || defaultSettings();

    if (!settings.allowVisitor) return jsonErr('管理员已关闭访客体验模式');

    // 生成访客账号
    const guestId = 'GUEST-' + Date.now().toString(36).toUpperCase();
    const expire = Date.now() + settings.visitorDuration * 60 * 1000;
    const hashedPw = await hashPassword('guest');

    await dbRun(env,
        'INSERT INTO users (username, password, plain_password, name, role, user_type, company_code, emp_no) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [guestId, hashedPw, 'guest', '访客', 'user', 'visitor', 'GUEST', String(expire)]
    );

    return json({
        success: true,
        visitor: true,
        expire,
        username: guestId,
        password: 'guest',
    });
}

// ========== 用户信息 ==========

async function handleGetMe(context) {
    const { env } = await requireAuth(context);
    const username = context.username;
    const user = await dbGet(env, 'SELECT username, name, role, user_type as userType, company_code as companyCode, emp_no as empNo, created_at as createdAt FROM users WHERE username = ?', [username]);
    if (!user) return jsonErr('用户不存在');
    return json({ user });
}

async function handleChangePassword(context) {
    const { env, username } = await requireAuth(context);
    const { oldPassword, newPassword } = await context.request.json();
    if (!oldPassword || !newPassword) return jsonErr('请输入旧密码和新密码');
    if (newPassword.length < 4) return jsonErr('新密码至少4位');

    const user = await dbGet(env, 'SELECT password FROM users WHERE username = ?', [username]);
    if (!user || !await verifyPassword(oldPassword, user.password)) return jsonErr('旧密码错误');

    const hashed = await hashPassword(newPassword);
    await dbRun(env, 'UPDATE users SET password = ?, plain_password = ? WHERE username = ?', [hashed, newPassword, hashed, username]);
    return jsonOK({ message: '密码修改成功' });
}

async function handleChangeProfile(context) {
    const { env, username } = await requireAuth(context);
    const { name } = await context.request.json();
    if (!name || !name.trim()) return jsonErr('昵称不能为空');
    const trimmed = name.trim().substring(0, 20);
    await dbRun(env, 'UPDATE users SET name = ? WHERE username = ?', [trimmed, username]);
    return jsonOK({ message: '昵称修改成功', name: trimmed });
}

async function handleDeleteUser(context) {
    const { env, username } = await requireAuth(context);
    const { targetUsername, password } = await context.request.json();
    // 用户删除自己：需验证登录密码
    if (username === targetUsername) {
        if (!password) throw new AuthError('请输入密码', 400);
        const user = await env.INDO_LEARN_DB
            .prepare('SELECT password FROM users WHERE username = ?')
            .bind(targetUsername)
            .first();
        if (!user) throw new AuthError('用户不存在', 404);
        const ok = await verifyPassword(password, user.password);
        if (!ok) throw new AuthError('密码错误', 401);
    } else {
        // 管理员删除他人：需管理员权限
        await requireAdmin(context);
    }
    // 清理在线状态
    const onlineData = await env.INDO_LEARN_KV.get('online_users');
    const onlineUsers = onlineData ? JSON.parse(onlineData) : [];
    await env.INDO_LEARN_KV.put('online_users', JSON.stringify(onlineUsers.filter(u => u.username !== targetUsername)), { expirationTtl: 300 });
    // 清理该用户的所有 token（KV scan by prefix）
    const list = await env.INDO_LEARN_KV.list({ prefix: 'token_' });
    for (const key of list.keys) {
        const owner = await env.INDO_LEARN_KV.get(key.name);
        if (owner === targetUsername) {
            await env.INDO_LEARN_KV.delete(key.name);
        }
    }
    // 删除用户
    await dbRun(env, 'DELETE FROM users WHERE username = ?', [targetUsername]);
    return jsonOK({ message: '已删除' });
}

// ========== 心跳 ==========

async function handleHeartbeat(context) {
    const { env, username } = await requireAuth(context);

    // 检查是否被封禁或踢出
    const user = await dbGet(env, 'SELECT banned, user_type, emp_no FROM users WHERE username = ?', [username]);
    if (!user) return jsonErr('kicked');
    if (user.banned) return jsonErr('kicked');

    // 访客过期检查
    if (user.user_type === 'visitor') {
        const expire = parseInt(user.emp_no);
        if (Date.now() > expire) return jsonErr('visitor_expired');
    }

    // 更新心跳时间
    await dbRun(env, 'UPDATE users SET last_heartbeat = ? WHERE username = ?', [new Date().toISOString(), username]);

    // 更新在线列表
    const onlineData = await env.INDO_LEARN_KV.get('online_users');
    const onlineUsers = onlineData ? JSON.parse(onlineData) : [];
    const idx = onlineUsers.findIndex(u => u.username === username);
    if (idx >= 0) {
        onlineUsers[idx].lastSeen = Date.now();
    } else {
        onlineUsers.push({ username, name: user.name, role: user.role, lastSeen: Date.now() });
    }
    await env.INDO_LEARN_KV.put('online_users', JSON.stringify(onlineUsers), { expirationTtl: 300 });

    return json({ success: true });
}

// ========== 学习记录 ==========

async function handleStudySave(context) {
    const { env, username } = await requireAuth(context);
    // 自动建表（兼容未执行 schema.sql 的场景）
    await env.INDO_LEARN_DB.prepare(`CREATE TABLE IF NOT EXISTS study_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, word_id TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT '', mastered INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 1, last_practiced TEXT NOT NULL DEFAULT (datetime('now'))
    )`).run();
    await env.INDO_LEARN_DB.prepare(`CREATE TABLE IF NOT EXISTS study_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, date TEXT NOT NULL,
        words_learned INTEGER NOT NULL DEFAULT 0, study_seconds INTEGER NOT NULL DEFAULT 0,
        UNIQUE(username, date)
    )`).run();
    const { wordId, category, mastered, seconds } = await context.request.json();
    const today = new Date().toISOString().slice(0, 10);

    // 更新/插入学习记录
    const existing = await dbGet(env, 'SELECT id, attempts FROM study_records WHERE username = ? AND word_id = ?', [username, wordId]);
    if (existing) {
        await dbRun(env, 'UPDATE study_records SET mastered = ?, attempts = attempts + 1, last_practiced = ? WHERE id = ?',
            [mastered ? 1 : 0, new Date().toISOString(), existing.id]);
    } else {
        await dbRun(env, 'INSERT INTO study_records (username, word_id, category, mastered, attempts, last_practiced) VALUES (?, ?, ?, ?, 1, ?)',
            [username, wordId, category || '', mastered ? 1 : 0, new Date().toISOString()]);
    }

    // 更新每日统计
    const stats = await dbGet(env, 'SELECT id FROM study_stats WHERE username = ? AND date = ?', [username, today]);
    if (stats) {
        await dbRun(env, 'UPDATE study_stats SET words_learned = words_learned + 1, study_seconds = study_seconds + ? WHERE id = ?',
            [seconds || 0, stats.id]);
    } else {
        await dbRun(env, 'INSERT INTO study_stats (username, date, words_learned, study_seconds) VALUES (?, ?, 1, ?)',
            [username, today, seconds || 0]);
    }

    return jsonOK();
}


// ========== 学习数据双向同步 ==========

async function handleStudySync(context) {
    const { env, username } = await requireAuth(context);
    const body = await context.request.json();

    // 自动建表
    await env.INDO_LEARN_DB.prepare(`CREATE TABLE IF NOT EXISTS user_study_data (
        username TEXT PRIMARY KEY,
        mastery_records TEXT NOT NULL DEFAULT '{}',
        favs TEXT NOT NULL DEFAULT '[]',
        all_words TEXT NOT NULL DEFAULT '[]',
        study_stats TEXT NOT NULL DEFAULT '{}',
        daily_goal INTEGER NOT NULL DEFAULT 20,
        practice_history TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`).run();

    // 拉取：从 D1 返回用户学习数据
    if (body && body._action === 'pull') {
        const row = await dbGet(env, 'SELECT * FROM user_study_data WHERE username = ?', [username]);
        if (row) {
            return json({
                success: true,
                _action: 'pull',
                data: {
                    masteryRecords: row.mastery_records || '{}',
                    favs: row.favs || '[]',
                    allWords: row.all_words || '[]',
                    studyStats: row.study_stats || '{}',
                    dailyGoal: row.daily_goal || 20,
                    practiceHistory: row.practice_history || '[]',
                }
            });
        }
        // 没有云端数据，返回空
        return json({ success: true, _action: 'pull', data: null });
    }

    // 推送：将前端学习数据存入 D1（使用 UPSERT）
    const now = new Date().toISOString();
    await env.INDO_LEARN_DB.prepare(`
        INSERT INTO user_study_data (username, mastery_records, favs, all_words, study_stats, daily_goal, practice_history, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(username) DO UPDATE SET
            mastery_records = excluded.mastery_records,
            favs = excluded.favs,
            all_words = excluded.all_words,
            study_stats = excluded.study_stats,
            daily_goal = excluded.daily_goal,
            practice_history = excluded.practice_history,
            updated_at = excluded.updated_at
    `).bind(
        username,
        body.masteryRecords || '{}',
        body.favs || '[]',
        body.allWords || '[]',
        body.studyStats || '{}',
        body.dailyGoal || 20,
        body.practiceHistory || '[]',
        now
    ).run();

    return json({ success: true, _action: 'push' });
}



async function handleStudyStats(context) {
    const { env, username } = await requireAuth(context);
    const stats = await dbGet(env,
        'SELECT COALESCE(SUM(words_learned),0) as totalWords, COALESCE(SUM(study_seconds),0) as totalSeconds FROM study_stats WHERE username = ?',
        [username]
    );
    const today = new Date().toISOString().slice(0, 10);
    const todayStat = await dbGet(env,
        'SELECT words_learned as todayWords, study_seconds as todaySeconds FROM study_stats WHERE username = ? AND date = ?',
        [username, today]
    );
    return json({
        totalWords: stats.totalWords,
        totalSeconds: stats.totalSeconds,
        todayWords: todayStat?.todayWords || 0,
        todaySeconds: todayStat?.todaySeconds || 0,
    });
}

// ========== 管理后台 ==========

async function handleAdminGetSettings(context) {
    await requireAdmin(context);
    const settings = await getSettings(context.env) || defaultSettings();
    return json(settings);
}

async function handleAdminPutSettings(context) {
    await requireAdmin(context);
    const updates = await context.request.json();
    // 合并模式：读取现有设置，仅更新传入的字段，防止部分面板保存时覆盖其他面板数据
    const existing = await getSettings(context.env) || defaultSettings();
    const merged = { ...existing, ...updates };
    await setSettings(context.env, merged);
    return jsonOK({ message: '设置已保存' });
}

async function handleAdminGetUsers(context) {
    await requireAdmin(context);
    const users = await dbAll(context.env,
        'SELECT username, plain_password as plainPassword, password, name, role, user_type as userType, company_code as companyCode, emp_no as empNo, banned, last_heartbeat, created_at as createdAt FROM users ORDER BY created_at DESC'
    );
    return json({ users });
}

async function handleAdminPutUsers(context) {
    await requireAdmin(context);
    const { action, username, user, data, users: batchUsers } = await context.request.json();

    if (action === 'add' && user) {
        const existing = await dbGet(context.env, 'SELECT username FROM users WHERE username = ?', [user.username]);
        if (existing) return jsonErr('用户已存在');
        const pw = user.password || '123456';
        const hashed = await hashPassword(pw);
        await dbRun(context.env,
            'INSERT INTO users (username, password, plain_password, name, role, user_type, company_code, emp_no) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [user.username, hashed, pw, user.name, user.role || 'user', user.userType || 'employee', user.companyCode || '', user.empNo || '']
        );
    } else if (action === 'delete') {
        await dbRun(context.env, 'DELETE FROM users WHERE username = ?', [username]);
    } else if (action === 'update') {
        const updates = [];
        const params = [];
        if (data.name) { updates.push('name = ?'); params.push(data.name); }
        if (data.role) { updates.push('role = ?'); params.push(data.role); }
        if (data.password) { updates.push('password = ?'); params.push(await hashPassword(data.password)); updates.push('plain_password = ?'); params.push(data.password); }
        if (updates.length) {
            params.push(username);
            await dbRun(context.env, `UPDATE users SET ${updates.join(', ')} WHERE username = ?`, params);
        }
    } else if (action === 'batch_add' && batchUsers) {
        for (const u of batchUsers) {
            const existing = await dbGet(context.env, 'SELECT username FROM users WHERE username = ?', [u.username]);
            if (!existing) {
                const hashed = await hashPassword(u.password || '123456');
                await dbRun(context.env,
                    'INSERT INTO users (username, password, plain_password, name, role, user_type, company_code, emp_no) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [u.username, hashed, u.password || '123456', u.name, u.role || 'user', u.userType || 'employee', u.companyCode || '', u.empNo || '']
                );
            }
        }
    }
    return jsonOK();
}

async function handleAdminDeleteUser(context) {
    await requireAdmin(context);
    const { username } = await context.request.json();
    await dbRun(context.env, 'DELETE FROM users WHERE username = ?', [username]);
    return jsonOK({ message: '已删除' });
}

async function handleAdminGetOnline(context) {
    await requireAdmin(context);
    const onlineData = await context.env.INDO_LEARN_KV.get('online_users');
    const onlineUsers = onlineData ? JSON.parse(onlineData) : [];

    // 清理过期（5分钟无心跳）
    const now = Date.now();
    const active = onlineUsers.filter(u => now - u.lastSeen < 300000);
    await context.env.INDO_LEARN_KV.put('online_users', JSON.stringify(active), { expirationTtl: 300 });

    return json({ count: active.length, users: active });
}

async function handleAdminKick(context) {
    await requireAdmin(context);
    const { username } = await context.request.json();

    const onlineData = await context.env.INDO_LEARN_KV.get('online_users');
    const onlineUsers = onlineData ? JSON.parse(onlineData) : [];
    await context.env.INDO_LEARN_KV.put('online_users', JSON.stringify(onlineUsers.filter(u => u.username !== username)), { expirationTtl: 300 });

    // 标记 token 失效（通过删除在线状态，下次心跳会被拒绝）
    return jsonOK({ message: '已踢下线' });
}

async function handleAdminBan(context) {
    await requireAdmin(context);
    const { username, ban } = await context.request.json();
    await dbRun(context.env, 'UPDATE users SET banned = ? WHERE username = ?', [ban ? 1 : 0, username]);

    if (ban) {
        // 踢下线
        const onlineData = await context.env.INDO_LEARN_KV.get('online_users');
        const onlineUsers = onlineData ? JSON.parse(onlineData) : [];
        await context.env.INDO_LEARN_KV.put('online_users', JSON.stringify(onlineUsers.filter(u => u.username !== username)), { expirationTtl: 300 });
    }

    return jsonOK({ message: ban ? '已封禁' : '已解封' });
}

// ========== 员工名单/白名单 ==========

async function handleAdminGetWhitelist(context) {
    await requireAdmin(context);
    const employees = await dbAll(context.env, 'SELECT company_code as companyCode, emp_no as empNo, name, dept, created_at as createdAt FROM employees ORDER BY created_at DESC');
    return json({ employees });
}

async function handleAdminPutWhitelist(context) {
    await requireAdmin(context);
    const body = await context.request.json();

    if (body.action === 'add' && body.employee) {
        const { companyCode, empNo, name, dept } = body.employee;
        try {
            await dbRun(context.env, 'INSERT INTO employees (company_code, emp_no, name, dept) VALUES (?, ?, ?, ?)',
                [companyCode, empNo, name, dept || '']);
        } catch (e) {
            if (e.message.includes('UNIQUE')) return jsonErr('该员工已存在');
            throw e;
        }
    } else if (body.action === 'delete') {
        await dbRun(context.env, 'DELETE FROM employees WHERE company_code = ? AND emp_no = ?', [body.companyCode, body.empNo]);
    } else if (body.action === 'import' && body.list) {
        await dbRun(context.env, 'DELETE FROM employees');
        for (const emp of body.list) {
            try {
                await dbRun(context.env, 'INSERT INTO employees (company_code, emp_no, name, dept) VALUES (?, ?, ?, ?)',
                    [emp.companyCode, emp.companyCode, emp.name || '', emp.dept || '']);
            } catch (e) { /* skip duplicates */ }
        }
    } else if (body.employees !== undefined) {
        // 全量替换
        await dbRun(context.env, 'DELETE FROM employees');
        for (const emp of body.employees) {
            try {
                await dbRun(context.env, 'INSERT INTO employees (company_code, emp_no, name, dept) VALUES (?, ?, ?, ?)',
                    [emp.companyCode, emp.empNo, emp.name || '', emp.dept || '']);
            } catch (e) { /* skip duplicates */ }
        }
    }

    return jsonOK();
}

// ========== 学习统计（管理）==========

async function handleAdminStudyStats(context) {
    await requireAdmin(context);
    const today = new Date().toISOString().slice(0, 10);

    const stats = await dbAll(context.env,
        `SELECT u.username, u.name, COALESCE(s.words_learned, 0) as todayWords,
                COALESCE(t.total, 0) as totalWords, COALESCE(s.study_seconds, 0) as studySeconds
         FROM users u
         LEFT JOIN study_stats s ON u.username = s.username AND s.date = ?
         LEFT JOIN (SELECT username, SUM(words_learned) as total FROM study_stats GROUP BY username) t ON u.username = t.username
         WHERE u.role != 'admin'
         ORDER BY todayWords DESC`,
        [today]
    );

    return json({ stats });
}

async function handleAdminStudyClear(context) {
    await requireAdmin(context);
    await dbRun(context.env, 'DELETE FROM study_stats');
    await dbRun(context.env, 'DELETE FROM study_records');
    return jsonOK({ message: '已清空' });
}

// ========== 初始化用户 ==========

async function handleAdminVerify(context) {
    // 仅验证后台面板密码，不要求已登录状态
    const { panelPassword } = await context.request.json();
    const settings = await getSettings(context.env) || defaultSettings();
    const storedPass = settings.adminPanelPassword || 'admin123';
    if (!panelPassword || panelPassword !== storedPass) {
        return json({ error: '密码错误' }, 403);
    }
    // 确保admin用户存在
    const admin = await dbGet(context.env, "SELECT username FROM users WHERE username = 'admin'");
    if (!admin) {
        const hashed = await hashPassword('admin123');
        await dbRun(context.env,
            "INSERT OR IGNORE INTO users (username, password, name, role, user_type, company_code, emp_no) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ['admin', hashed, '系统管理员', 'admin', 'employee', 'SYS', '000000']
        );
    }
    // 获取admin密码用于登录
    const adminUser = await dbGet(context.env, "SELECT password FROM users WHERE username = 'admin'");
    const adminToken = generateToken('admin');
    await context.env.INDO_LEARN_KV.put('token_' + adminToken, 'admin', { expirationTtl: 86400 });
    return json({ success: true, token: adminToken, user: { username: 'admin', name: '系统管理员', role: 'admin' } });
}

async function handleAdminInitUsers(context) {
    await requireAdmin(context);
    const { users, force } = await context.request.json();

    const admin = await dbGet(context.env, "SELECT username FROM users WHERE username = 'admin'");
    if (!admin || force) {
        const hashed = await hashPassword('admin123');
        if (!admin) {
            await dbRun(context.env,
                "INSERT OR IGNORE INTO users (username, password, name, role, user_type, company_code, emp_no) VALUES (?, ?, ?, ?, ?, ?, ?)",
                ['admin', hashed, '系统管理员', 'admin', 'employee', 'SYS', '000000']
            );
        }
        return jsonOK({ message: '已初始化默认管理员: admin / admin123' });
    }

    return jsonOK({ message: 'admin 已存在，跳过初始化' });
}

// ========== 版本说明 ==========

async function handleChangelogList(context) {
    const logs = await dbAll(context.env, 'SELECT id, version, title, content, created_at as createdAt FROM changelogs ORDER BY id DESC');
    return json({ versions: logs });
}

async function handleChangelogSave(context) {
    await requireAdmin(context);
    const { id, version, title, content } = await context.request.json();
    if (id) {
        // 编辑已有记录
        await dbRun(context.env, 'UPDATE changelogs SET version = ?, title = ?, content = ? WHERE id = ?', [version, title, content || '', id]);
    } else {
        // 新增
        await dbRun(context.env, 'INSERT INTO changelogs (version, title, content) VALUES (?, ?, ?)', [version, title, content || '']);
    }
    return jsonOK();
}

async function handleChangelogDelete(context) {
    await requireAdmin(context);
    const { idx } = await context.request.json();
    // D1 autoincrement id 不同于 array index，用 id 删除
    const id = parseInt(idx) || 0;
    if (id > 0) await dbRun(context.env, 'DELETE FROM changelogs WHERE id = ?', [id]);
    return jsonOK();
}


// ========== 广播管理 ==========
async function handleBroadcastList(context) {
    await requireAdmin(context);
    const broadcasts = await dbAll(context.env, 'SELECT id, title, content, type, is_active as isActive, display_order as displayOrder, start_date as startDate, end_date as endDate, created_at as createdAt FROM broadcasts ORDER BY display_order ASC, id DESC');
    return json({ broadcasts });
}

async function handleBroadcastSave(context) {
    await requireAdmin(context);
    const { id, title, content, type, isActive, displayOrder, startDate, endDate } = await context.request.json();
    if (id) {
        await dbRun(context.env, 'UPDATE broadcasts SET title = ?, content = ?, type = ?, is_active = ?, display_order = ?, start_date = ?, end_date = ? WHERE id = ?',
            [title, content, type || 'notice', isActive ? 1 : 0, displayOrder || 0, startDate || '', endDate || '', id]);
    } else {
        await dbRun(context.env, 'INSERT INTO broadcasts (title, content, type, is_active, display_order, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [title, content, type || 'notice', isActive !== false ? 1 : 0, displayOrder || 0, startDate || '', endDate || '']);
    }
    return jsonOK();
}

async function handleBroadcastDelete(context) {
    await requireAdmin(context);
    const { id } = await context.request.json();
    if (id) await dbRun(context.env, 'DELETE FROM broadcasts WHERE id = ?', [id]);
    return jsonOK();
}

async function handleBroadcastActive(context) {
    // 公开接口，前端获取活跃广播
    const broadcasts = await dbAll(context.env,
        "SELECT id, title, content, type, is_active as isActive, display_order as displayOrder, start_date as startDate, end_date as endDate FROM broadcasts WHERE is_active = 1 AND (start_date = '' OR start_date <= datetime('now')) AND (end_date = '' OR end_date >= datetime('now')) ORDER BY display_order ASC, id DESC");
    return json({ broadcasts });
}

async function handleBroadcastGetConfig(context) {
    // 公开读，管理员写（PUT 仍需认证）
    if (context.request.method === 'PUT') {
        await requireAdmin(context);
    }
    const data = await context.env.INDO_LEARN_KV.get('broadcast_config');
    return json(data ? JSON.parse(data) : { enabled: true, interval: 8, loopCount: 0, position: 'top' });
}

async function handleBroadcastPutConfig(context) {
    await requireAdmin(context);
    const config = await context.request.json();
    await context.env.INDO_LEARN_KV.put('broadcast_config', JSON.stringify(config));
    return jsonOK({ message: '广播配置已保存' });
}
