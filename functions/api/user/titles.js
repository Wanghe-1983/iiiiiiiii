/**
 * 称号系统 API
 * GET  /api/user/titles      - 获取当前用户所有称号（含统计摘要，前端据此计算新称号）
 * POST /api/user/titles      - 上报获得的称号（前端计算后同步到D1）
 * GET  /api/user/titles/check - 让后端根据D1数据计算并返回应得称号列表
 */
import { onRequest } from "../../_shared/utils.js";

// ============================================================
// 称号定义（唯一源）
// ============================================================
const TITLE_DEFS = {
  // -------- 普通模式专属 --------
  normal_first_clear: {
    id: 'normal_first_clear', name: '初学者', icon: 'fa-seedling',
    category: 'normal', desc: '首次通关普通关卡',
  },
  normal_clear_10: {
    id: 'normal_clear_10', name: '勤学之路', icon: 'fa-book-open',
    category: 'normal', desc: '累计通关普通模式10关',
  },
  normal_any_3star: {
    id: 'normal_any_3star', name: '全优生', icon: 'fa-award',
    category: 'normal', desc: '任意普通关卡获得三星',
  },
  normal_score_1000: {
    id: 'normal_score_1000', name: '学霸', icon: 'fa-graduation-cap',
    category: 'normal', desc: '普通模式累计积分达到1000',
  },
  normal_all_3star: {
    id: 'normal_all_3star', name: '巅峰学霸', icon: 'fa-crown',
    category: 'normal', desc: '所有已开放普通关卡获得三星',
  },
  normal_speedrun: {
    id: 'normal_speedrun', name: '速通达人', icon: 'fa-bolt',
    category: 'normal', desc: '用时低于时限30%且满分通关普通关卡',
  },
  normal_retry_5: {
    id: 'normal_retry_5', name: '不屈意志', icon: 'fa-shield-halved',
    category: 'normal', desc: '单关重试5次后通关普通关卡',
  },
  normal_clear_50: {
    id: 'normal_clear_50', name: '百关斩将', icon: 'fa-shield',
    category: 'normal', desc: '累计通关普通模式50关',
  },

  // -------- 地狱模式专属 --------
  hell_first_clear: {
    id: 'hell_first_clear', name: '地狱新兵', icon: 'fa-fire',
    category: 'hell', desc: '首次通关地狱关卡',
  },
  hell_clear_10: {
    id: 'hell_clear_10', name: '百炼成钢', icon: 'fa-hammer',
    category: 'hell', desc: '累计通关地狱模式10关',
  },
  hell_any_3star: {
    id: 'hell_any_3star', name: '烈焰勇士', icon: 'fa-fire-flame-curved',
    category: 'hell', desc: '任意地狱关卡获得三星',
  },
  hell_score_1000: {
    id: 'hell_score_1000', name: '地狱征服者', icon: 'fa-skull-crossbones',
    category: 'hell', desc: '地狱模式累计积分达到1000',
  },
  hell_fearless: {
    id: 'hell_fearless', name: '无畏者', icon: 'fa-hand-fist',
    category: 'hell', desc: '禁止跳题/返回/导航下满分通关地狱关卡',
  },
  hell_phoenix: {
    id: 'hell_phoenix', name: '不灭战魂', icon: 'fa-phoenix',
    category: 'hell', desc: '被淘汰后同一关重新通关',
  },
  hell_all_3star: {
    id: 'hell_all_3star', name: '烈焰之王', icon: 'fa-dragon',
    category: 'hell', desc: '所有已开放地狱关卡获得三星',
  },
  hell_clear_50: {
    id: 'hell_clear_50', name: '地狱之神', icon: 'fa-skull',
    category: 'hell', desc: '地狱模式累计通关50关',
  },

  // -------- 通用称号 --------
  login_first: {
    id: 'login_first', name: '踏入门内', icon: 'fa-door-open',
    category: 'general', desc: '首次登录系统',
  },
  study_days_7: {
    id: 'study_days_7', name: '坚持不懈', icon: 'fa-calendar-check',
    category: 'general', desc: '累计学习天数达到7天',
  },
  study_days_30: {
    id: 'study_days_30', name: '学习达人', icon: 'fa-calendar-days',
    category: 'general', desc: '累计学习天数达到30天',
  },
  study_days_100: {
    id: 'study_days_100', name: '百日修行', icon: 'fa-trophy',
    category: 'general', desc: '累计学习天数达到100天',
  },
  words_500: {
    id: 'words_500', name: '词汇新星', icon: 'fa-star',
    category: 'general', desc: '累计学习500个单词',
  },
  words_2000: {
    id: 'words_2000', name: '词汇大师', icon: 'fa-gem',
    category: 'general', desc: '累计学习2000个单词',
  },
};

// ============================================================
// 辅助函数
// ============================================================

async function ensureTables(env) {
  await env.INDO_LEARN_DB.prepare(`
    CREATE TABLE IF NOT EXISTS user_titles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      title_id TEXT NOT NULL,
      earned_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(username, title_id)
    )
  `).run();
}

function dbGet(env, sql, params = []) {
  return env.INDO_LEARN_DB.prepare(sql).bind(...params).first();
}

function dbAll(env, sql, params = []) {
  return env.INDO_LEARN_DB.prepare(sql).bind(...params).all();
}

function dbRun(env, sql, params = []) {
  return env.INDO_LEARN_DB.prepare(sql).bind(...params).run();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

function requireAuth(context) {
  const authHeader = context.request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) throw new Error('未登录');
  return token;
}

async function getUserByToken(env, token) {
  const username = await env.INDO_LEARN_KV.get('token_' + token);
  if (!username) throw new Error('登录已过期');
  return username;
}

// ============================================================
// 后端称号计算（基于D1数据）
// ============================================================
async function computeTitles(env, username) {
  const earned = [];
  const details = {};

  // 获取闯关进度（challenge_progress表，stage_id格式: levelId-unitId-auto-N）
  const progressRows = await dbAll(env,
    'SELECT * FROM challenge_progress WHERE username = ?', [username]
  );
  const progress = {};
  for (const r of progressRows.results) {
    progress[r.stage_id] = r;
  }

  // 分离普通和地狱进度（stage_id以N-hell-开头的为地狱模式）
  // 普通模式: levelId-unitId-auto-N 或 levelId-unitId-words-N
  // 地狱模式: 由前端传入，D1中stage_id本身包含模式信息或由关卡配置决定
  // 这里我们通过后台配置来区分：地狱模式关卡ID通常带有 hell 标识
  // 实际上根据 generateStages 逻辑，普通和地狱共用相同ID格式
  // 区分方式：后台配置中有 normalLevels/hellLevels，对应不同的等级范围
  // 但stage_id本身不区分模式 → 需要从后台设置读取
  const sysSettingsRaw = await env.INDO_LEARN_KV.get('system_settings');
  let sysSettings = {};
  try { sysSettings = JSON.parse(sysSettingsRaw || '{}'); } catch(e) {}

  const normalSettings = sysSettings.normalSettings || {};
  const hellSettings = sysSettings.hellSettings || {};

  // 按模式分离进度
  // 需要知道哪些 stage 属于普通模式，哪些属于地狱模式
  // 通过检查后台的 challengeEnabled / hellEnabled 和关卡配置
  // 最简单的方式：stage_id 本身不区分模式，但前端提交时 mode 隐含在 stage_id 中
  // 实际上 generateStages 对普通和地狱模式会生成不同的 stage_id 组合
  // 我们需要读取后台设置来判断哪些 level 属于地狱模式
  // 更好的方式：在 challenge_progress 中增加 mode 字段（但这需要改动现有结构）
  // 折中方案：根据 hellSettings.enabled 和 levelId 范围来推断
  // 如果 hellSettings 有 enabledLevels 配置，则对应等级的关卡为地狱模式
  // 如果没有，则使用一个约定：提交时通过额外的 mode 参数区分

  // 更可靠的方式：检查提交记录中的 stage_id 模式
  // 对于自动切分模式：normal 和 hell 模式的 stage_id 虽然格式相同，
  // 但正常情况下用户在同一 stage_id 不会同时存在于两种模式中
  // 所以我们通过已知的关卡列表来区分

  // 最终方案：由前端提交成绩时附带 mode 信息到 challenge_records 表
  // 但 challenge_progress 没有 mode 字段
  // → 我们需要在 challenge_submit 中添加 mode 字段（后续改进）
  // 现阶段使用临时方案：通过 stage_id 的 levelId 前缀判断
  // 普通模式和地狱模式共用相同等级（BIPA 0-7），但地狱模式有自己的关卡集

  // 实际上查看 _regenerateStages: this.allStages = CourseContent.getAllStages(this.challengeMode)
  // 普通模式和地狱模式使用相同的 levelId 范围（0-7），所以 stage_id 格式完全相同
  // 区分只能通过 mode 参数 → 需要在表结构中增加 mode 字段

  // 这里我们采用一个巧妙的方式：前端提交时在 stage_id 前加前缀来区分
  // 但查看现有 submit.js，前端直接提交 stageId 没有前缀
  // 所以目前无法在后端区分普通/地狱模式的进度

  // ★ 方案调整：需要修改 challenge/submit 和 challenge/progress 的表结构
  // 增加 mode 字段。但这会破坏现有数据，不合适。
  // 
  // 更好的方案：后端称号计算只基于统计数字，不区分模式
  // 或者在 titles API 中让前端传入当前模式的进度统计

  // ★★ 最终方案：称号计算逻辑放在前端（前端有完整的 mode 和 progress 信息）
  // 后端 titles API 只负责存储和查询已获得的称号记录
  // 这样最简洁，不需要改动现有表结构

  // 获取学习统计
  const studyDays = await dbGet(env,
    'SELECT COUNT(*) as cnt FROM study_stats WHERE username = ?', [username]
  );
  const wordsLearned = await dbGet(env,
    'SELECT COUNT(DISTINCT word_id) as cnt FROM study_records WHERE username = ? AND mastered = 1', [username]
  );

  // 通用称号计算
  if (studyDays.cnt >= 1) earned.push('login_first');
  if (studyDays.cnt >= 7) earned.push('study_days_7');
  if (studyDays.cnt >= 30) earned.push('study_days_30');
  if (studyDays.cnt >= 100) earned.push('study_days_100');
  if (wordsLearned.cnt >= 500) earned.push('words_500');
  if (wordsLearned.cnt >= 2000) earned.push('words_2000');

  // 获取闯关统计（不区分模式）
  const challengeStats = await dbGet(env,
    `SELECT 
       COUNT(*) as totalStages,
       SUM(CASE WHEN cleared = 1 THEN 1 ELSE 0 END) as clearedStages,
       SUM(best_score) as totalScore,
       SUM(CASE WHEN stars >= 3 THEN 1 ELSE 0 END) as threeStarStages,
       MAX(attempts) as maxAttempts,
       MIN(best_time) as minTime
     FROM challenge_progress WHERE username = ?`, [username]
  );

  // 获取首次登录时间（用于 login_first 的精确判定）
  const user = await dbGet(env, 'SELECT created_at FROM users WHERE username = ?', [username]);
  if (user) earned.push('login_first');

  // 将统计信息也返回，让前端可以补充计算模式专属称号
  details.studyDays = studyDays.cnt || 0;
  details.wordsLearned = wordsLearned.cnt || 0;
  details.clearedStages = challengeStats.clearedStages || 0;
  details.totalStages = challengeStats.totalStages || 0;
  details.totalScore = challengeStats.totalScore || 0;
  details.threeStarStages = challengeStats.threeStarStages || 0;
  details.maxAttempts = challengeStats.maxAttempts || 0;

  return { earned, details };
}

// ============================================================
// 获取所有称号定义（给前端用）
// ============================================================
export async function onRequestGet(context) {
  try {
    const token = requireAuth(context);
    const { env } = context;
    const username = await getUserByToken(env, token);

    await ensureTables(env);

    // 获取已获得的称号
    const rows = await dbAll(env,
      'SELECT title_id, earned_at FROM user_titles WHERE username = ?', [username]
    );
    const earnedMap = {};
    for (const r of rows.results) {
      earnedMap[r.title_id] = r.earned_at;
    }

    // 后端计算应得称号（仅通用类）
    const { earned: computedGeneral, details } = await computeTitles(env, username);

    // 同步新获得的通用称号到数据库
    const newTitles = [];
    for (const tid of computedGeneral) {
      if (!earnedMap[tid]) {
        const now = new Date().toISOString();
        await dbRun(env,
          'INSERT OR IGNORE INTO user_titles (username, title_id, earned_at) VALUES (?, ?, ?)',
          [username, tid, now]
        );
        earnedMap[tid] = now;
        newTitles.push(TITLE_DEFS[tid]);
      }
    }

    // 构建完整的称号列表
    const titles = Object.values(TITLE_DEFS).map(def => ({
      ...def,
      earned: !!earnedMap[def.id],
      earnedAt: earnedMap[def.id] || null,
    }));

    return json({
      success: true,
      titles,
      stats: details,
      newTitles, // 本次新获得的通用称号
    });
  } catch (err) {
    return json({ success: false, error: err.message }, err.message === '未登录' ? 401 : 500);
  }
}

// ============================================================
// 上报获得的称号（前端计算后同步）
// POST body: { titles: [{ id, earnedAt }] }
// ============================================================
export async function onRequestPost(context) {
  try {
    const token = requireAuth(context);
    const { env } = context;
    const username = await getUserByToken(env, token);

    await ensureTables(env);

    const body = await context.request.json();
    const titles = body.titles || [];

    if (!Array.isArray(titles) || titles.length === 0) {
      return json({ success: false, error: '参数格式错误' });
    }

    // 验证称号ID合法性
    let synced = 0;
    let newEarned = [];

    for (const t of titles) {
      if (!TITLE_DEFS[t.id]) continue; // 忽略未知称号
      const earnedAt = t.earnedAt || new Date().toISOString();

      // 检查是否已存在
      const existing = await dbGet(env,
        'SELECT id FROM user_titles WHERE username = ? AND title_id = ?',
        [username, t.id]
      );

      if (!existing) {
        await dbRun(env,
          'INSERT OR IGNORE INTO user_titles (username, title_id, earned_at) VALUES (?, ?, ?)',
          [username, t.id, earnedAt]
        );
        newEarned.push(t.id);
      }
      synced++;
    }

    return json({
      success: true,
      synced,
      newEarned,
    });
  } catch (err) {
    return json({ success: false, error: err.message }, err.message === '未登录' ? 401 : 500);
  }
}
