// 全局变量
const app = document.getElementById('app');
let db = {}; // 词库数据
let favs = JSON.parse(localStorage.getItem('fmi_v1_favs') || '[]'); // 收藏
let curCat = "1", curIdx = 0, curLesson = "1"; // 当前分类/单词索引
let todayRecord = JSON.parse(localStorage.getItem('fmi_today_record') || '[]'); // 今日记录
let studyStats = JSON.parse(localStorage.getItem('fmi_study_stats') || '{"totalWords":0,"studySeconds":0,"todayWords":0,"startTime":null}');
const today = new Date().toLocaleDateString();
// 全局白名单变量
let whitelist = [];
// 【v1.2新增】当前页面视图
let currentPage = 'learn';
// 【v1.2新增】练习模式状态
let practiceState = { type:'choice', catId:'1', questions:[], currentIndex:0, score:0, total:0, answered:false, isFinished:false, wrongWords:[] };
let selectedPracticeType = 'choice';
let selectedPracticeCount = 20;

// 加载白名单
async function loadWhitelist() {
    try {
        const res = await fetch('whitelist.json');
        if (res.ok) {
            whitelist = await res.json();
        } else {
            whitelist = JSON.parse(localStorage.getItem('fmi_whitelist') || JSON.stringify([
                { username: "admin", password: "admin123", name: "超级管理员" },
                { username: "user01", password: "123456", name: "普通用户" }
            ]));
        }
    } catch (e) {
        whitelist = JSON.parse(localStorage.getItem('fmi_whitelist') || JSON.stringify([
            { username: "admin", password: "admin123", name: "超级管理员" },
            { username: "user01", password: "123456", name: "普通用户" }
        ]));
    }
}

// 登录状态验证 - 优化登出按钮显示（修复节点为空的报错）
function checkLoginStatus() {
    const loginStatus = JSON.parse(localStorage.getItem('fmi_login_status') || '{"isLogin":false}');
    if (!loginStatus.isLogin) {
        location.href = "login.html"; 
    } else {
        // 【跨天自动清空学习记录】
        const todayStr = new Date().toLocaleDateString();
        const savedDate = localStorage.getItem('fmi_study_date');
        if (savedDate && savedDate !== todayStr) {
            localStorage.removeItem('fmi_today_record');
            localStorage.removeItem('fmi_study_stats');
            localStorage.removeItem('fmi_all_words');
            todayRecord = [];
            studyStats = { totalWords: 0, studySeconds: 0, todayWords: 0, startTime: null };
        }
        localStorage.setItem('fmi_study_date', todayStr);
        const userStatusEl = document.getElementById('user-status');
        if (userStatusEl) {
            userStatusEl.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;">
                    <span>欢迎，${loginStatus.user.name}</span>
                    <button class="logout-btn" onclick="logout()" style="background:rgba(248,113,113,0.2);color:#f87171;border:none;padding:5px 12px;border-radius:8px;cursor:pointer;font-size:0.85rem;">
                        <i class="fas fa-sign-out-alt"></i> 登出
                    </button>
                </div>
            `;
        }
    }
}

// 退出登录（带确认弹窗）
function logout() {
    // 使用自定义弹窗代替 confirm
    showLogoutConfirmDialog();
}

// 登出确认弹窗
function showLogoutConfirmDialog() {
    const dialog = document.createElement('div');
    dialog.id = 'logout-confirm-dialog';
    dialog.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;justify-content:center;align-items:center;backdrop-filter:blur(15px);';
    dialog.innerHTML = `
        <div style="background:#111827;padding:35px 40px;border-radius:25px;border:1px solid rgba(99,102,241,0.4);text-align:center;max-width:420px;width:90%;">
            <div style="font-size:2rem;margin-bottom:15px;">👋</div>
            <h3 style="color:#fff;margin-bottom:12px;font-size:1.2rem;">确认退出登录？</h3>
            <p style="color:#94a3b8;margin-bottom:25px;font-size:0.95rem;line-height:1.6;">
                是否清空本次学习记录和在线时长？<br>
                <span style="color:#6b7280;font-size:0.85rem;">（选择"确定"将清空记录，下次登录重新统计）</span>
            </p>
            <div style="display:flex;gap:12px;justify-content:center;">
                <button id="logout-cancel-btn" style="background:#475569;color:white;border:none;padding:10px 25px;border-radius:12px;cursor:pointer;font-size:0.95rem;min-width:90px;">取消</button>
                <button id="logout-keep-btn" style="background:rgba(99,102,241,0.15);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3);padding:10px 25px;border-radius:12px;cursor:pointer;font-size:0.95rem;min-width:90px;">保留记录</button>
                <button id="logout-clear-btn" style="background:#ef4444;color:white;border:none;padding:10px 25px;border-radius:12px;cursor:pointer;font-size:0.95rem;min-width:90px;">清空记录</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);

    // 点击"取消"：不退出，关闭弹窗
    dialog.querySelector('#logout-cancel-btn').onclick = function() {
        document.body.removeChild(dialog);
    };

    // 点击"保留记录"：退出但不清空数据
    dialog.querySelector('#logout-keep-btn').onclick = function() {
        localStorage.removeItem('fmi_login_status');
        // 不清空学习数据，保留记录
        document.body.removeChild(dialog);
        location.href = "login.html";
    };

    // 点击"清空记录"：退出并清空学习数据
    dialog.querySelector('#logout-clear-btn').onclick = function() {
        localStorage.removeItem('fmi_today_record');
        localStorage.removeItem('fmi_study_stats');
        localStorage.removeItem('fmi_all_words');
        localStorage.removeItem('fmi_v1_favs');
        localStorage.removeItem('fmi_login_status');
        document.body.removeChild(dialog);
        location.href = "login.html";
    };
}

// 初始化页面（核心：先渲染DOM，再加载数据）
function initUI() {
    // 随机学习小贴士 - 修改为从公网获取
    const studyTipApi = (typeof CONFIG !== 'undefined' && CONFIG.studyTipApi) ? CONFIG.studyTipApi : "https://v1.hitokoto.cn/?c=i";
    fetch(studyTipApi)
        .then(res => res.json())
        .then(data => {
            const tip = data.hitokoto || "每天学习一点，进步一大步！";
            const el = document.getElementById('tip-content');
            if (el) el.innerText = tip;
        })
        .catch(() => {
            const el = document.getElementById('tip-content');
            if (el) el.innerText = "每天学习一点，进步一大步！";
        });

    // 渲染完整页面结构
    app.innerHTML = `
<aside class="sidebar" id="sidebar">
    <div class="toggle-tab" onclick="toggleSidebar()">
        <i class="fas fa-bars"></i>
    </div>
    <div class="sidebar-inner" id="menu-box">
        <div style="color:#94a3b8; text-align:center; padding:50px 0;">加载词库中...</div>
    </div>
</aside>

<main class="main-container">
    <div class="nav-tabs" id="nav-tabs">
        <button class="nav-tab active" onclick="switchPage('learn')" data-tab="learn"><i class="fas fa-book-open"></i> 学习</button>
        <button class="nav-tab" onclick="switchPage('practice')" data-tab="practice"><i class="fas fa-pen-fancy"></i> 练习</button>
        <button class="nav-tab" onclick="switchPage('dashboard')" data-tab="dashboard"><i class="fas fa-chart-line"></i> 统计</button>
    </div>
    <div id="page-learn">
    <header><h1 class="main-title">印尼语学习助手</h1></header>

    <div class="top-info-bar">
        <div class="date-time" id="date-time">${new Date().toLocaleString()}</div>
        <div class="weather-location" id="weather-location">
            <i class="fas fa-cloud"></i>
            <span>本地 27℃ 多云</span>
        </div>
        <div class="user-status" id="user-status">
            欢迎，管理员
        </div>
    </div>

    <div class="stats-bar" id="stats-bar">
        <div class="stat-item">📚 今日：<span id="stat-today">${studyStats.todayWords}</span> 词</div>
        <div class="stat-item">📈 总计：<span id="stat-total">${studyStats.totalWords}</span> 词</div>
        <div class="stat-item">⏱ 时长：<span id="stat-time">${Math.floor(studyStats.studySeconds/60)}分${studyStats.studySeconds%60}秒</span></div>
        <div class="stat-item">🎯 完成率：<span id="stat-rate">0%</span></div>
    </div>

    <div class="tip-box" id="study-tip">
        <div class="tip-title">每日学习小贴士</div>
        <div id="tip-content">每天学习一点，进步一大步！</div>
    </div>

    <div style="display:flex;gap:20px;margin-bottom:20px;flex-wrap:wrap;">
        <div style="flex:1;min-width:200px;background:var(--glass);padding:15px;border-radius:15px;border:1px solid rgba(255,255,255,0.05);">
            <div style="font-size:14px;color:var(--text-muted);margin-bottom:8px;">今日学习进度</div>
            <div style="height:8px;background:rgba(30,41,59,0.5);border-radius:4px;overflow:hidden;margin-bottom:8px;">
                <div id="progress-bar" style="height:100%;width:${studyStats.todayWords > 0 ? Math.min(100, (studyStats.todayWords/20)*100) : 0}%;background:linear-gradient(90deg,var(--accent),#a78bfa);border-radius:4px;transition:width 0.6s ease;"></div>
            </div>
            <div style="font-size:12px;color:#94a3b8;">${studyStats.todayWords}/20 目标单词</div>
        </div>
        <div style="flex:1;min-width:200px;background:var(--glass);padding:15px;border-radius:15px;border:1px solid rgba(255,255,255,0.05);">
            <div style="font-size:14px;color:var(--text-muted);margin-bottom:8px;">随机推荐单词</div>
            <div id="random-word" style="font-size:18px;color:#a5b4fc;font-weight:600;">加载中...</div>
        </div>
    </div>

    <section class="study-card" id="main-card">
        <div class="top-meta">
            <div class="word-badge" id="word-idx">01</div>
            <div class="star-btn" id="fav-trigger" onclick="handleFav()"><i class="fas fa-star"></i></div>
        </div>
        <div class="indo-box" id="disp-indo">加载中...</div>
        <div class="zh-box" id="disp-zh">请稍候</div>
        <div class="nav-row">
            <button class="circle-btn" onclick="navWord(-1)"><i class="fas fa-chevron-left"></i></button>
            <button id="main-play" class="circle-btn play-btn" onclick="toggleSpeech()"><i class="fas fa-play" id="play-ico"></i></button>
            <button class="circle-btn" onclick="navWord(1)"><i class="fas fa-chevron-right"></i></button>
            <button class="circle-btn" onclick="openShareModal()" style="font-size:1.2rem;">
                <i class="fas fa-share-alt"></i>
                <span style="font-size:0.8rem;display:block;margin-top:5px;">打卡</span>
            </button>
        </div>
    </section>

    <div class="study-record-box">
        <div class="record-title">
            <span>今日学习记录</span>
            <button class="clear-record-btn" onclick="clearTodayRecord()">清空记录</button>
        </div>
        <div class="record-list" id="record-list">
            ${todayRecord.length > 0 ? todayRecord.map(item => `
                <div class="record-item">
                    <div class="record-indo">${item.indonesian}</div>
                    <div class="record-zh">${item.chinese}</div>
                </div>
            `).join('') : '<div style="grid-column: 1 / 3; text-align: center; color: var(--text-muted);">暂无学习记录</div>'}
        </div>
    </div>

    </div><!-- end page-learn -->
    <div id="page-practice" style="display:none;"></div>
    <div id="page-dashboard" style="display:none;"></div>
    <footer class="control-panel">
        <div class="ctrl-row">
            <span class="ctrl-label">语音语速</span>
            <div style="flex:1; display:flex; align-items:center; gap:25px;">
                <input type="range" style="flex:1" id="inp-rate" min="0.1" max="1.5" step="0.1" value="0.8" oninput="updateSetting('rate', this.value)">
                <span class="ctrl-value"><span id="val-rate">0.8</span>X</span>
            </div>
        </div>
        <div class="ctrl-row">
            <span class="ctrl-label">循环播放</span>
            <div style="flex:1; display:flex; align-items:center; gap:25px;">
                <input type="range" style="flex:1" id="inp-loop" min="1" max="10" step="1" value="1" oninput="updateSetting('loop', this.value)">
                <span class="ctrl-value"><span id="val-loop">1</span>次</span>
            </div>
        </div>
        <div class="ctrl-row">
            <span class="ctrl-label">隐藏答案</span>
            <label class="switch">
                <input type="checkbox" id="hide-toggle" onchange="renderCurrent()">
                <span class="slider"></span>
            </label>
        </div>
    </footer>

    <div class="copyright" id="copyright">
        仅供学习・禁止商用 © 2026｜联系：
        <span style="color:var(--accent);cursor:pointer;" onclick="openQrModal()">王鹤</span> 
        Ver 1.1 <span class="clickable" onclick="showVersionChangelog()" style="font-size:0.75rem;margin-left:5px;" title="查看更新日志">[更新日志]</span>
    </div>
</main>

<div id="admin-modal" class="modal-overlay">
    <div class="modal-content" style="width:600px;" id="admin-step1">
        <h3 style="margin-bottom:15px;">🔒 验证超级管理员</h3>
        <input type="password" id="admin-pass" placeholder="输入超级管理员密码（admin123）" style="width:100%; padding:10px; border-radius:8px; background:#0f172a; color:white; border:1px solid #334155; margin-bottom:15px;">
        <div style="margin-top:20px; display:flex; gap:15px; justify-content:flex-end;">
            <button onclick="document.getElementById('admin-modal').style.display='none'" style="background:#475569; color:white; border:none; padding:10px 25px; border-radius:10px; cursor:pointer;">取消</button>
            <button onclick="checkAdminPass()" style="background:var(--accent); color:white; border:none; padding:10px 25px; border-radius:10px; cursor:pointer; font-weight:bold;">验证</button>
        </div>
    </div>
    <div class="modal-content" style="width:750px; display:none;" id="admin-step2">
        <h3 style="margin-bottom:15px;">📋 白名单管理</h3>
        <!-- 当前列表 -->
        <div style="margin-bottom:15px; max-height:150px; overflow-y:auto; border:1px solid #334155; border-radius:8px; padding:10px;">
            <div id="whitelist-list">
                </div>
        </div>
        <!-- 手动新增 -->
        <div style="display:flex; gap:10px; margin-bottom:15px;">
            <input type="text" id="new-username" placeholder="新增用户名" style="flex:1; padding:10px; border-radius:8px; background:#0f172a; color:white; border:1px solid #334155;">
            <input type="text" id="new-password" placeholder="新增密码" style="flex:1; padding:10px; border-radius:8px; background:#0f172a; color:white; border:1px solid #334155;">
            <button onclick="addWhitelist()" style="background:var(--accent); color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer;">添加</button>
        </div>

        <!-- 名单解析区域 -->
        <div style="border-top:1px solid #334155; padding-top:15px; margin-bottom:15px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <span style="color:#a5b4fc; font-weight:600; font-size:0.95rem;">📤 名单解析工具</span>
                <div style="display:flex; gap:8px; align-items:center;">
                    <input type="file" id="roster-file-input" accept=".json,.csv,.txt,.xls,.xlsx" style="font-size:0.8rem; color:#94a3b8; max-width:160px;">
                    <button onclick="parseRosterFile()" style="background:rgba(16,185,129,0.15); color:#34d399; border:1px solid rgba(16,185,129,0.3); padding:6px 14px; border-radius:8px; cursor:pointer; font-size:0.85rem;">上传解析</button>
                </div>
            </div>
            <textarea id="roster-textarea" placeholder="在此粘贴名单文本（支持 JSON 数组、CSV、TSV、竖线分隔）&#10;&#10;JSON 示例:&#10;[{&quot;username&quot;:&quot;user01&quot;, &quot;name&quot;:&quot;张三&quot;, &quot;password&quot;:&quot;123456&quot;}]&#10;&#10;CSV 示例:&#10;公司,工号,姓名,密码&#10;PT.ABC,001,张三,123456" style="width:100%; height:120px; padding:10px; border-radius:8px; background:#0f172a; color:#cbd5e1; border:1px solid #334155; resize:vertical; font-family:'JetBrains Mono',monospace; font-size:0.85rem; line-height:1.5;"></textarea>
            <div style="display:flex; gap:8px; margin-top:8px; align-items:center;">
                <button onclick="parseRosterText()" style="background:rgba(99,102,241,0.15); color:#a5b4fc; border:1px solid rgba(99,102,241,0.3); padding:6px 14px; border-radius:8px; cursor:pointer; font-size:0.85rem;">解析文本</button>
                <span id="roster-parse-result" style="color:#6b7280; font-size:0.8rem;"></span>
            </div>
        </div>

        <!-- 解析结果预览 -->
        <div id="roster-preview-area" style="display:none; margin-bottom:15px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span style="color:#34d399; font-size:0.9rem;" id="roster-preview-count"></span>
                <button onclick="copyRosterJSON()" style="background:#10b981; color:white; border:none; padding:6px 16px; border-radius:8px; cursor:pointer; font-size:0.85rem;">
                    <i class="fas fa-copy"></i> 一键复制 JSON
                </button>
            </div>
            <textarea id="roster-json-output" readonly style="width:100%; height:100px; padding:10px; border-radius:8px; background:rgba(16,185,129,0.05); color:#a5b4fc; border:1px solid rgba(16,185,129,0.2); font-family:'JetBrains Mono',monospace; font-size:0.8rem; line-height:1.4; resize:vertical;"></textarea>
            <div id="roster-copy-feedback" style="display:none; color:#10b981; font-size:0.8rem; margin-top:5px;">✓ 已复制到剪贴板！</div>
        </div>

        <!-- 底部按钮 -->
        <div style="margin-top:15px; display:flex; gap:15px; justify-content:flex-end;">
            <button onclick="document.getElementById('admin-modal').style.display='none'; resetAdminStep()" style="background:#475569; color:white; border:none; padding:10px 25px; border-radius:10px; cursor:pointer;">关闭</button>
            <button onclick="saveWhitelist()" style="background:var(--accent); color:white; border:none; padding:10px 25px; border-radius:10px; cursor:pointer; font-weight:bold;">保存修改</button>
        </div>
    </div>
</div>

<div id="share-modal" class="modal-overlay" onclick="this.style.display='none'">
    <div class="modal-content share-modal-content" onclick="event.stopPropagation()">
        <h3 style="margin-bottom:20px;">📝 学习打卡分享至朋友圈 <button onclick="document.getElementById('share-modal').style.display='none'" style="float:right; background:none; border:none; color:#fff; font-size:1.5rem; cursor:pointer;">&times;</button></h3>
        <div class="share-card" id="share-card">
            <div class="share-header">🇮🇩 印尼语学习打卡</div>
            <div class="share-stats" id="share-stats">
                <div style="margin:10px 0;line-height:1.6;font-size:14px;color:#cbd5e1;">
                    📅 日期：${today}<br>
                    📚 今日学习：${studyStats.todayWords} 个单词<br>
                    ⏱ 学习时长：${Math.floor(studyStats.studySeconds/60)}分${studyStats.studySeconds%60}秒<br>
                    🎯 完成率：0%
                </div>
            </div>
            <div class="share-tip" id="share-tip">💡 学习小贴士：坚持学习，每天进步一点点！</div>
            <div id="share-record-list">
                ${todayRecord.length > 0 ? todayRecord.map(item => `
                    <div class="share-record">${item.indonesian} - ${item.chinese}</div>
                `).join('') : '<div class="share-record">今日暂无学习</div>'}
            </div>
        </div>
        <div>
            <button class="share-copy-btn" onclick="copyShareText()">复制打卡文案</button>
            <button class="share-save-btn" onclick="saveShareImage()">保存打卡图片</button>
        </div>
    </div>
</div>

<div id="qr-modal" class="modal-overlay" onclick="this.style.display='none'">
    <div class="modal-content" style="width:350px; padding:20px;" onclick="event.stopPropagation()">
        <h3 style="margin-bottom:20px; color:var(--accent);">联系王鹤</h3>
        <img src="Wang_he.jpg" style="width:280px; height:280px; border-radius:10px; margin:0 auto; display:block;" alt="二维码">
        <p style="margin-top:20px; text-align:center; color:#cbd5e1;">扫码添加微信/联系方式</p>
    </div>
</div>
    `;

    // 实时更新时间
    setInterval(() => {
        const d = new Date();
        const pad = n => n.toString().padStart(2, '0');
        document.getElementById('date-time').innerText = 
            `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }, 1000);

    // 加载随机推荐单词
    setTimeout(() => {
        loadRandomWord();
    }, 1000);

    // 加载天气信息
    loadWeather();

    // 加载词库（DOM渲染完成后再加载）
    loadDB();
}

// 加载随机推荐单词
function loadRandomWord() {
    try {
        const catIds = Object.keys(db);
        const randomCat = catIds[Math.floor(Math.random() * catIds.length)];
        const lessonIds = Object.keys(db[randomCat].lessons);
        const randomLesson = lessonIds[Math.floor(Math.random() * lessonIds.length)];
        const words = db[randomCat].lessons[randomLesson].words;
        const randomWord = words[Math.floor(Math.random() * words.length)];
        document.getElementById('random-word').innerText = `${randomWord.indonesian} - ${randomWord.chinese}`;
    } catch (e) {
        document.getElementById('random-word').innerText = "暂无推荐单词";
    }
}

// 加载天气信息
function loadWeather() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            fetch(`https://wttr.in/${lat},${lon}?format=j1`)
                .then(res => res.json())
                .then(data => {
                    const temp = data.current_condition[0].temp_C;
                    const weather = data.current_condition[0].weatherDesc[0].value;
                    document.getElementById('weather-location').innerHTML = `<i class="fas fa-cloud"></i><span> ${temp}℃ ${weather}</span>`;
                })
                .catch(() => {
                    document.getElementById('weather-location').innerHTML = `<i class="fas fa-cloud"></i><span> 无法获取天气</span>`;
                });
        }, () => {
            document.getElementById('weather-location').innerHTML = `<i class="fas fa-cloud"></i><span> 定位失败</span>`;
        });
    } else {
        document.getElementById('weather-location').innerHTML = `<i class="fas fa-cloud"></i><span> 不支持定位</span>`;
    }
}

// 加载词库（适配你的JSON格式）
async function loadDB() {
    try {
        // 加时间戳避免缓存，确保加载最新词库
        const res = await fetch('indonesian_learning_data.json?t=' + Date.now());
        if (!res.ok) throw new Error('词库文件不存在');
        db = await res.json();
        
        // 构建左侧菜单
        buildMenu();
        // 显示第一个单词
        showWord(curCat, curIdx);
        // 添加到今日记录
        addToTodayRecord(db[curCat].lessons["1"].words[curIdx]);
        // 渲染记录
        renderTodayRecord();
        // 更新统计
        updateStats();

        console.log('词库加载成功！共', Object.keys(db).length, '个分类');
    } catch (e) {
        console.error('词库加载失败：', e);
        // 加载失败提示
        document.getElementById('menu-box').innerHTML = `<div style="color:#f87171; text-align:center; padding:50px 0;">词库加载失败<br>请检查文件是否存在！</div>`;
        document.getElementById('disp-indo').innerText = '加载失败';
        document.getElementById('disp-zh').innerText = '请检查词库文件';
    }
}

// 构建左侧菜单 - 收藏夹部分重构 + 生词/短语展示所有单词
function buildMenu() {
    const menuBox = document.getElementById('menu-box');
    // 收藏夹HTML重构：清空按钮移到最下方
    let favsHTML = favs.length > 0 ? favs.map((item, index) => `
        <div style="padding:8px 10px;font-size:13px;color:#94a3b8;display:flex;justify-content:space-between;align-items:center;">
            <span style="cursor:pointer;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" onclick="showFavWord('${item.cat}', ${item.idx}, '${item.lesson || "1"}')">${index + 1}. ${item.indonesian}</span>
            <button onclick="deleteFav(${index}, event)" style="background:rgba(248,113,113,0.1);color:#f87171;border:none;padding:2px 6px;border-radius:4px;cursor:pointer;font-size:11px;margin-left:8px;flex-shrink:0;" title="删除此收藏"><i class="fas fa-times"></i></button>
        </div>
    `).join('') : '<div style="padding:8px;font-size:13px;color:#94a3b8">暂无收藏</div>';
    
    // 新增清空按钮到收藏夹最下方
    favsHTML += `
        <div style="padding:8px 10px;margin-top:10px;border-top:1px solid rgba(255,255,255,0.05);">
            <button onclick="clearAllFavs(event)" style="background:rgba(248,113,113,0.1);color:#f87171;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:12px;">
                <i class="fas fa-trash-alt"></i> 清空收藏
            </button>
        </div>
    `;

    let menuHTML = `
    <div class="cat-item">
        <div class="cat-head" style="color:#fbbf24" onclick="this.nextElementSibling.classList.toggle('active')">
            <span>⭐ 我的收藏 (${favs.length})</span>
            <i class="fas fa-chevron-down"></i> </div>
        <div class="sub-menu">
            ${favsHTML}
        </div>
    </div>
    `;

    // 遍历词库分类 - 展开课程显示所有单词
    for (const catId in db) {
        const cat = db[catId];
        const catName = catId === "1" ? "生词 (Vocabulary)" : catId === "2" ? "短语 (Phrases)" : cat.name;
        
        // 构建课程+单词列表
        let lessonsHTML = '';
        for (const lessonId in cat.lessons) {
            const lesson = cat.lessons[lessonId];
            // 课程标题
            lessonsHTML += `
            <div style="padding:8px 10px;font-size:14px;color:#a5b4fc;font-weight:600;cursor:pointer" onclick="this.nextElementSibling.classList.toggle('active')">
                课程 ${lessonId} (${lesson.words.length} 词)
            </div>
            `;
            // 单词列表（默认展开）
            lessonsHTML += `
            <div class="sub-word-list" style="display:block;padding-left:15px;">
                ${lesson.words.map((word, idx) => `
                    <div style="padding:6px 10px;font-size:12px;color:#94a3b8;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" 
                         onclick="loadLesson('${catId}', '${lessonId}', ${idx})"
                         title="${word.indonesian} - ${word.chinese}">
                        ${idx+1}. ${word.indonesian} - ${word.chinese}
                    </div>
                `).join('')}
            </div>
            `;
        }

        menuHTML += `
        <div class="cat-item">
            <div class="cat-head" onclick="this.nextElementSibling.classList.toggle('active')">
                <span>${catId}. ${catName}</span><i class="fas fa-chevron-down"></i>
            </div>
            <div class="sub-menu">
                ${lessonsHTML}
            </div>
        </div>
        `;
    }
    menuBox.innerHTML = menuHTML;
}

// 显示单词（适配 indonesian/chinese 字段）
function showWord(catId, idx, lessonId = curLesson) {
    const word = db[catId].lessons[lessonId].words[idx];
    document.getElementById('disp-indo').innerText = word.indonesian;
    document.getElementById('disp-zh').innerText = word.chinese;
    document.getElementById('word-idx').innerText = (idx + 1).toString().padStart(2, '0');
    curCat = catId;
    curIdx = idx;
    curLesson = lessonId;
    // 更新收藏状态
    const isFav = favs.some(item => item.cat === catId && item.lesson === lessonId && item.idx === idx);
    document.getElementById('fav-trigger').className = isFav ? 'star-btn active' : 'star-btn';
}

// 加载课程
function loadLesson(catId, lessonId, idx) {
    curCat = catId;
    curIdx = idx;
    curLesson = lessonId;
    showWord(catId, idx, lessonId);
    addToTodayRecord(db[catId].lessons[lessonId].words[idx]);
    renderTodayRecord();
    updateStats();
}

// 收藏单词
function handleFav() {
        const word = db[curCat].lessons[curLesson].words[curIdx];
    const favIndex = favs.findIndex(item => item.cat === curCat && item.lesson === curLesson && item.idx === curIdx);
    if (favIndex > -1) {
        favs.splice(favIndex, 1);
        document.getElementById('fav-trigger').className = 'star-btn';
    } else {
        favs.push({ 
            cat: curCat, 
            lesson: curLesson,
            idx: curIdx, 
            indonesian: word.indonesian, 
            chinese: word.chinese 
        });
        document.getElementById('fav-trigger').className = 'star-btn active';
    }
    localStorage.setItem('fmi_v1_favs', JSON.stringify(favs));
    buildMenu();
}

// 删除单个收藏
function deleteFav(index, e) {
    e.stopPropagation(); // 阻止触发菜单展开/收起
    if (confirm('确认删除这个收藏？')) {
        favs.splice(index, 1);
        localStorage.setItem('fmi_v1_favs', JSON.stringify(favs));
        buildMenu(); // 刷新菜单
        showWord(curCat, curIdx, curLesson); // 刷新收藏图标状态
    }
}

// 清空所有收藏
function clearAllFavs(e) {
    e.stopPropagation();
    if (favs.length === 0) {
        alert('暂无收藏可清空！');
        return;
    }
    if (confirm('确认清空所有收藏？')) {
        favs = [];
        localStorage.setItem('fmi_v1_favs', JSON.stringify(favs));
        buildMenu(); // 刷新菜单
        showWord(curCat, curIdx, curLesson); // 刷新收藏图标状态
    }
}

// 谷歌翻译发音（优先）
function googleSpeech(word) {
    return new Promise((resolve, reject) => {
        try {
            // 谷歌翻译发音接口
            const audioUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(word)}&tl=id&total=1&idx=0&textlen=${word.length}&client=tw-ob`;
            const audio = new Audio(audioUrl);
            audio.play();
            audio.onended = () => resolve(true);
            audio.onerror = () => reject('谷歌发音失败，切换本地合成');
        } catch (e) {
            reject(e);
        }
    });
}

// 语音播放 - 修复语速控制 + 优先谷歌发音
function toggleSpeech() {
    const word = document.getElementById('disp-indo').innerText;
    const synth = window.speechSynthesis;
    
    // 停止当前播放
    if (synth.speaking) {
        synth.cancel();
        document.getElementById('play-ico').className = 'fas fa-play';
        return;
    }

    // 优先使用谷歌翻译发音
    googleSpeech(word).catch(() => {
        // 兜底：本地合成
        const currentRate = parseFloat(document.getElementById('inp-rate').value);
        const utterThis = new SpeechSynthesisUtterance(word);
        utterThis.lang = 'id-ID';
        utterThis.rate = currentRate;
        synth.speak(utterThis);
        // 循环播放逻辑
        const loopTimes = parseInt(document.getElementById('inp-loop').value);
        let loopCount = 1;
        utterThis.onend = function() {
            if (loopCount < loopTimes) {
                loopCount++;
                const newUtter = new SpeechSynthesisUtterance(word);
                newUtter.lang = 'id-ID';
                newUtter.rate = currentRate;
                synth.speak(newUtter);
            } else {
                document.getElementById('play-ico').className = 'fas fa-play';
            }
        };
    });

    document.getElementById('play-ico').className = 'fas fa-pause';
}

// 隐藏答案
function renderCurrent() {
    const hideToggle = document.getElementById('hide-toggle');
    document.getElementById('disp-zh').style.display = hideToggle.checked ? 'none' : 'block';
}

// 更新设置
function updateSetting(k, v) {
    document.getElementById('val-' + k).innerText = v;
}

// 打开管理员弹窗
function openAdminModal() {
    document.getElementById('admin-modal').style.display = 'flex';
}

// 验证管理员密码
function checkAdminPass() {
    const pass = document.getElementById('admin-pass').value;
    if (pass !== 'admin123') {
        alert('密码错误！请输入正确的超级管理员密码');
        return;
    }
    // 隐藏第一步，显示第二步（白名单管理）
    document.getElementById('admin-step1').style.display = 'none';
    document.getElementById('admin-step2').style.display = 'block';
    // 渲染白名单
    renderWhitelist();
}

// 重置管理员步骤
function resetAdminStep() {
    document.getElementById('admin-step1').style.display = 'block';
    document.getElementById('admin-step2').style.display = 'none';
    document.getElementById('admin-pass').value = '';
}

// 渲染白名单
function renderWhitelist() {
    const list = document.getElementById('whitelist-list');
    list.innerHTML = whitelist.map((item, index) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid #334155;">
            <div>
                <span style="color:#a5b4fc;">${item.username}</span> 
                <span style="color:#94a3b8;">(${item.name})</span> 
                <span style="color:#6b7280;">/ ${item.password}</span>
            </div>
            <button onclick="deleteWhitelist(${index})" style="background:#ef4444; color:white; border:none; padding:5px 10px; border-radius:5px; cursor:pointer;">删除</button>
        </div>
    `).join('');
}

// 添加白名单
function addWhitelist() {
    const username = document.getElementById('new-username').value.trim();
    const password = document.getElementById('new-password').value.trim();
    if (!username || !password) {
        alert('用户名和密码不能为空！');
        return;
    }
    // 检查是否已存在
    if (whitelist.some(item => item.username === username)) {
        alert('该用户名已存在！');
        return;
    }
    whitelist.push({
        username: username,
        password: password,
        name: username // 默认名称为用户名
    });
    renderWhitelist();
    // 清空输入框
    document.getElementById('new-username').value = '';
    document.getElementById('new-password').value = '';
}

// 删除白名单
function deleteWhitelist(index) {
    if (confirm('确认删除该用户？')) {
        whitelist.splice(index, 1);
        renderWhitelist();
    }
}

// 保存白名单
function saveWhitelist() {
    localStorage.setItem('fmi_whitelist', JSON.stringify(whitelist));
    // 更新login.html的用户列表（同步）
    alert('白名单保存成功！登录列表已更新');
    document.getElementById('admin-modal').style.display = 'none';
    resetAdminStep();
}

// ============================================================
// 【名单解析功能】
// ============================================================

// 全局解析结果
let rosterParsedResult = [];

// 解析上传的文件
function parseRosterFile() {
    const fileInput = document.getElementById('roster-file-input');
    const file = fileInput.files[0];
    if (!file) {
        alert('请选择文件');
        return;
    }
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.json')) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                let data = JSON.parse(e.target.result);
                if (!Array.isArray(data)) {
                    const keys = Object.keys(data);
                    const arrKey = keys.find(k => Array.isArray(data[k]));
                    if (arrKey) data = data[arrKey];
                    else { alert('JSON 格式错误：未找到数组数据'); return; }
                }
                rosterParsedResult = data.map(item => ({
                    username: String(item.username || item.company || item.公司 || item.user || item.account || item.工号 || ''),
                    name: String(item.name || item.姓名 || item.userName || item.员工姓名 || ''),
                    password: String(item.password || item.密码 || item.pass || item.初始密码 || '')
                })).filter(item => item.username && item.name);
                showRosterPreview(rosterParsedResult);
            } catch (err) {
                alert('JSON 解析失败：' + err.message);
            }
        };
        reader.readAsText(file);
    } else if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) {
        // 动态加载 SheetJS（如未加载）
        if (typeof XLSX === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
            script.onload = function() {
                readExcelFile(file);
            };
            document.head.appendChild(script);
        } else {
            readExcelFile(file);
        }
    } else if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
        const reader = new FileReader();
        reader.onload = function(e) {
            parseRosterCSV(e.target.result);
        };
        reader.readAsText(file);
    } else {
        alert('不支持的文件格式，请上传 JSON/CSV/TXT/XLS/XLSX');
    }
}

// 读取 Excel 文件
function readExcelFile(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const workbook = XLSX.read(e.target.result, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const csvText = XLSX.utils.sheet_to_csv(firstSheet);
            parseRosterCSV(csvText);
        } catch (err) {
            alert('Excel 解析失败：' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

// 解析文本框内容（手动粘贴）
function parseRosterText() {
    const text = document.getElementById('roster-textarea').value.trim();
    if (!text) {
        alert('请先粘贴名单文本');
        return;
    }
    // 尝试 JSON 解析
    try {
        const data = JSON.parse(text);
        let arr = Array.isArray(data) ? data : (data.data || data.list || data.users || [data]);
        rosterParsedResult = arr.map(item => ({
            username: String(item.username || item.company || item.公司 || item.user || item.account || item.工号 || ''),
            name: String(item.name || item.姓名 || item.userName || item.员工姓名 || ''),
            password: String(item.password || item.密码 || item.pass || item.初始密码 || '')
        })).filter(item => item.username && item.name);
        if (rosterParsedResult.length > 0) {
            showRosterPreview(rosterParsedResult);
            return;
        }
    } catch (e) {
        // Not JSON, try CSV/TSV
    }
    // CSV/TSV/pipe 解析
    parseRosterCSV(text);
}

// 解析 CSV/TSV/竖线分隔文本
function parseRosterCSV(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) { alert('内容为空'); return; }

    // 自动检测分隔符
    const delimiters = [',', '\t', '|', ';'];
    let bestDelimiter = ',';
    let maxCols = 0;
    for (const d of delimiters) {
        const cols = lines[0].split(d).length;
        if (cols > maxCols) { maxCols = cols; bestDelimiter = d; }
    }

    // 解析行
    const rows = lines.map(line => line.split(bestDelimiter).map(cell => cell.trim().replace(/^["\']|["\']$/g, '')));

    // 检测首行是否为表头
    let startRow = 0;
    const headerKeywords = ['公司', '工号', '姓名', '密码', 'username', 'name', 'password', 'company', 'user', 'pass', 'account', '员工'];
    if (rows[0] && rows[0].some(h => headerKeywords.some(kw => (h || '').toLowerCase().includes(kw.toLowerCase())))) {
        if (rows.length > 1) startRow = 1;
    }

    // 根据列数智能映射
    // 常见列排列：公司,工号,姓名,密码 (4列) → username=0, name=2, password=3
    // 或：姓名,用户名,密码 (3列) 等
    let uCol = 0, nCol = 0, pCol = rows[0].length - 1;
    if (rows[0] && rows[0].length >= 3) {
        const headers = rows[0].map(h => (h || '').toLowerCase());
        const uKeys = ['公司', 'company', 'username', 'user', 'account', '账号', '用户名'];
        const nKeys = ['姓名', 'name', '员工', '员工姓名'];
        const pKeys = ['密码', 'password', 'pass', '初始密码'];
        headers.forEach((h, i) => {
            if (uKeys.some(k => h.includes(k))) uCol = i;
            if (nKeys.some(k => h.includes(k))) nCol = i;
            if (pKeys.some(k => h.includes(k))) pCol = i;
        });
        // 如果没检测到表头，使用默认映射
        if (startRow === 0) {
            if (rows[0].length === 4) { uCol = 0; nCol = 2; pCol = 3; }       // 公司,工号,姓名,密码
            else if (rows[0].length === 3) { uCol = 0; nCol = 1; pCol = 2; }   // 用户名,姓名,密码
        }
    }

    rosterParsedResult = [];
    for (let i = startRow; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 2) continue;
        const username = (row[uCol] || '').trim();
        const name = (row[nCol] || '').trim();
        const password = (row[pCol] || '').trim();
        if (username && name) {
            rosterParsedResult.push({ username, name, password: password || '123456' });
        }
    }
    showRosterPreview(rosterParsedResult);
}

// 显示解析结果预览
function showRosterPreview(data) {
    if (data.length === 0) {
        document.getElementById('roster-parse-result').textContent = '未能解析出有效数据，请检查格式';
        document.getElementById('roster-parse-result').style.color = '#f87171';
        document.getElementById('roster-preview-area').style.display = 'none';
        return;
    }
    // 更新提示
    const resultEl = document.getElementById('roster-parse-result');
    resultEl.textContent = '成功解析 ' + data.length + ' 条记录';
    resultEl.style.color = '#34d399';

    // 显示预览区
    document.getElementById('roster-preview-area').style.display = 'block';
    document.getElementById('roster-preview-count').textContent = '解析预览 (' + data.length + ' 条)';

    // JSON 输出
    document.getElementById('roster-json-output').value = JSON.stringify(data, null, 2);
}

// 一键复制 JSON 到剪贴板
function copyRosterJSON() {
    if (rosterParsedResult.length === 0) {
        alert('没有可复制的数据');
        return;
    }
    const jsonStr = JSON.stringify(rosterParsedResult, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
        const fb = document.getElementById('roster-copy-feedback');
        fb.style.display = 'block';
        fb.textContent = '✓ 已复制到剪贴板！可粘贴到 whitelist.json';
        setTimeout(() => { fb.style.display = 'none'; }, 3000);
    }).catch(() => {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = jsonStr;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        const fb = document.getElementById('roster-copy-feedback');
        fb.style.display = 'block';
        fb.textContent = '✓ 已复制到剪贴板！';
        setTimeout(() => { fb.style.display = 'none'; }, 3000);
    });
}

// 添加今日记录
function addToTodayRecord(word) {
    const isExist = todayRecord.some(item => item.indonesian === word.indonesian);
    if (!isExist) {
        todayRecord.push({
            indonesian: word.indonesian,
            chinese: word.chinese
        });
        localStorage.setItem('fmi_today_record', JSON.stringify(todayRecord));
        studyStats.todayWords = todayRecord.length;
        // 统计总单词数（去重）
        const allWords = JSON.parse(localStorage.getItem('fmi_all_words') || '[]');
        if (!allWords.includes(word.indonesian)) {
            allWords.push(word.indonesian);
            localStorage.setItem('fmi_all_words', JSON.stringify(allWords));
        }
        studyStats.totalWords = allWords.length;
        updateStats();
    }
}

// 渲染今日记录
function renderTodayRecord() {
    const recordList = document.getElementById('record-list');
    if (todayRecord.length > 0) {
        recordList.innerHTML = todayRecord.map(item => `
            <div class="record-item">
                <div class="record-indo">${item.indonesian}</div>
                <div class="record-zh">${item.chinese}</div>
            </div>
        `).join('');
    } else {
        recordList.innerHTML = '<div style="grid-column: 1 / 3; text-align: center; color: var(--text-muted);">暂无学习记录</div>';
    }
    // 更新分享弹窗
    document.getElementById('share-record-list').innerHTML = todayRecord.length > 0 ? todayRecord.map(item => `
        <div class="share-record">${item.indonesian} - ${item.chinese}</div>
    `).join('') : '<div class="share-record">今日暂无学习</div>';
}

// 清空今日记录
function clearTodayRecord() {
    if (confirm('确认清空今日学习记录？')) {
        todayRecord = [];
        studyStats.todayWords = 0;
        localStorage.setItem('fmi_today_record', JSON.stringify(todayRecord));
        localStorage.setItem('fmi_study_stats', JSON.stringify(studyStats));
        renderTodayRecord();
        updateStats();
    }
}

// 更新学习统计 - 新增进度条更新
function updateStats() {
    if (!studyStats.startTime) {
        studyStats.startTime = new Date().getTime();
    }
    studyStats.studySeconds = Math.floor((new Date().getTime() - studyStats.startTime) / 1000);
    studyStats.todayWords = todayRecord.length;
    localStorage.setItem('fmi_study_stats', JSON.stringify(studyStats));
    
    // 更新页面显示
    document.getElementById('stat-today').innerText = studyStats.todayWords;
    document.getElementById('stat-total').innerText = studyStats.totalWords;
    document.getElementById('stat-time').innerText = `${Math.floor(studyStats.studySeconds/60)}分${studyStats.studySeconds%60}秒`;
    document.getElementById('stat-rate').innerText = studyStats.totalWords > 0 ? Math.floor((studyStats.todayWords/studyStats.totalWords)*100) + '%' : '0%';
    
    // 新增：更新进度条
    const progressPercent = studyStats.todayWords > 0 ? Math.min(100, (studyStats.todayWords/20)*100) : 0;
    document.getElementById('progress-bar').style.width = `${progressPercent}%`;
    
    // 更新分享弹窗统计
    document.getElementById('share-stats').innerHTML = `
        <div style="margin:10px 0;line-height:1.6;font-size:14px;color:#cbd5e1;">
            📅 日期：${today}<br>
            📚 今日学习：${studyStats.todayWords} 个单词<br>
            ⏱ 学习时长：${Math.floor(studyStats.studySeconds/60)}分${studyStats.studySeconds%60}秒<br>
            🎯 完成率：${studyStats.totalWords > 0 ? Math.floor((studyStats.todayWords/studyStats.totalWords)*100) + '%' : '0%'}
        </div>
    `;
}

// 切换单词
function navWord(dir) {
    const maxIdx = db[curCat].lessons[curLesson].words.length - 1;
    let newIdx = curIdx + dir;
    if (newIdx < 0) newIdx = maxIdx;
    if (newIdx > maxIdx) newIdx = 0;
    showWord(curCat, newIdx, curLesson);
    addToTodayRecord(db[curCat].lessons[curLesson].words[newIdx]);
    renderTodayRecord();
    updateStats();
}

// 分享功能
function openShareModal() {
    document.getElementById('share-modal').style.display = 'flex';
}

// 复制分享文案（适配朋友圈风格）
function copyShareText() {
    const text = `🇮🇩 印尼语学习打卡｜${today}
✅ 今日学习：${studyStats.todayWords} 个单词
⏰ 学习时长：${Math.floor(studyStats.studySeconds/60)}分${studyStats.studySeconds%60}秒
🎯 完成率：${studyStats.totalWords > 0 ? Math.floor((studyStats.todayWords/studyStats.totalWords)*100) + '%' : '0%'}

💡 今日学习重点：
${todayRecord.slice(0, 5).map((item, i) => `${i+1}. ${item.indonesian} - ${item.chinese}`).join('\n')}
${todayRecord.length > 5 ? `...共${todayRecord.length}个单词` : ''}

✨ 坚持学习印尼语，每天进步一点点！`;
    navigator.clipboard.writeText(text).then(() => {
        alert('朋友圈打卡文案已复制！可直接粘贴到朋友圈～');
    });
}

// 保存分享图片
function saveShareImage() {
    html2canvas(document.getElementById('share-card')).then(canvas => {
        const link = document.createElement('a');
        link.download = `印尼语学习打卡_${today}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        alert('打卡图片已保存！可直接分享到朋友圈～');
    });
}

// 显示收藏单词
function showFavWord(catId, idx, lessonId = "1") {
    curCat = catId;
    curIdx = idx;
    curLesson = lessonId;
    showWord(catId, idx, lessonId);
}

// 打开二维码弹窗
function openQrModal() {
    document.getElementById('qr-modal').style.display = 'flex';
}

// ============================================================
// 【目录栏折叠联动】
// ============================================================
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const main = document.querySelector('.main-container');
    sidebar.classList.toggle('collapsed');
    main.classList.toggle('full-width');
}

// ============================================================
// 【获取已学单词列表】
// ============================================================
function getLearnedWords() {
    const learned = JSON.parse(localStorage.getItem('fmi_all_words') || '[]');
    return learned;
}



// ============================================================
// 【v2.0 KV 后端对接 - 心跳与在线状态】
// ============================================================
let _heartbeatTimer = null;

function startHeartbeat() {
    // Send heartbeat every 30 seconds
    _heartbeatTimer = setInterval(async () => {
        try {
            const result = await API.heartbeat();
            if (result.error === 'kicked') return; // handled by API module
        } catch(e) {}
    }, 30000);
    // Send first heartbeat immediately
    API.heartbeat().catch(() => {});
}

function stopHeartbeat() {
    if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
}

// Display online count on main page
async function loadOnlineDisplay() {
    try {
        const info = await API.getSystemInfo();
        if (info.error) return;
        let badge = document.getElementById('online-badge-main');
        if (!badge) {
            // Create badge if not exists - append to info bar
            const infoBar = document.querySelector('.info-bar');
            if (infoBar && info.showOnlineMain) {
                badge = document.createElement('span');
                badge.id = 'online-badge-main';
                badge.style.cssText = 'display:inline-flex;align-items:center;gap:5px;padding:4px 12px;background:rgba(99,102,241,0.15);border-radius:20px;color:#a78bfa;font-size:0.8rem;font-weight:600;';
                infoBar.appendChild(badge);
            }
        }
        if (badge && info.showOnlineMain) {
            badge.innerHTML = '<i class="fas fa-wifi"></i> 在线 ' + info.onlineCount + ' 人';
            badge.style.display = 'inline-flex';
        }
    } catch(e) {}
}

// ============================================================
// 【v2.0 KV 后端对接 - 学习记录上传】
// ============================================================
let _syncTimer = null;

function startStudySync() {
    // Sync study data every 60 seconds
    _syncTimer = setInterval(syncStudyToCloud, 60000);
}

function stopStudySync() {
    if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; }
}

async function syncStudyToCloud() {
    if (!API.isLoggedIn()) return;
    try {
        const learned = JSON.parse(localStorage.getItem('fmi_all_words') || '[]');
        const todayData = JSON.parse(localStorage.getItem('fmi_today_data') || '{}');
        if (learned.length > 0 || todayData.words) {
            await API.saveStudy({
                learnedWords: learned,
                todayWords: todayData.words || 0,
                todayTime: todayData.time || 0,
                todayAccuracy: todayData.accuracy || 0,
            });
        }
    } catch(e) {}
}

// ============================================================
// 【v2.0 排行榜页面】
// ============================================================
async function initLeaderboardPage() {
    const container = document.querySelector('.main-container');
    const today = new Date().toISOString().split('T')[0];

    container.innerHTML = `
        <div style="text-align:center;margin-bottom:30px;">
            <h1 style="color:var(--text-main);font-size:2rem;"><i class="fas fa-trophy" style="color:#fbbf24;"></i> 每日排行榜</h1>
            <p style="color:var(--text-muted);margin-top:5px;">${today}</p>
        </div>
        <div id="lb-config-info" style="text-align:center;margin-bottom:25px;"></div>
        <div id="lb-list" style="max-width:600px;margin:0 auto;"></div>
    `;

    try {
        const data = await API.getLeaderboard(today);
        if (data.error) {
            document.getElementById('lb-list').innerHTML = '<p style="text-align:center;color:var(--text-muted);">排行榜功能暂不可用</p>';
            return;
        }

        // Show config info
        const config = data.config || {};
        if (config.enabled && config.title) {
            document.getElementById('lb-config-info').innerHTML = `
                <div style="display:inline-block;padding:10px 20px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.2);border-radius:12px;">
                    <span style="color:#fbbf24;font-weight:600;">${config.title}</span>
                    <span style="color:var(--text-muted);margin-left:10px;">${config.questionCount || 20} 题</span>
                </div>
            `;
        }

        const board = data.board || [];
        if (board.length === 0) {
            document.getElementById('lb-list').innerHTML = '<p style="text-align:center;color:var(--text-muted);">今日暂无排行数据</p>';
            return;
        }

        const medals = ['🥇', '🥈', '🥉'];
        let html = '<div style="display:flex;flex-direction:column;gap:12px;">';
        board.forEach((entry, i) => {
            const isTop3 = i < 3;
            const bg = isTop3 ? 'rgba(251,191,36,0.08)' : 'rgba(30,41,59,0.5)';
            const border = isTop3 ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.06)';
            const rank = isTop3 ? medals[i] : `<span style="color:var(--text-muted);font-weight:700;">${i + 1}</span>`;
            html += `
                <div style="display:flex;align-items:center;gap:15px;padding:15px 20px;background:${bg};border:1px solid ${border};border-radius:12px;">
                    <div style="min-width:40px;text-align:center;font-size:${isTop3 ? '1.5rem' : '1rem'};">${rank}</div>
                    <div style="flex:1;">
                        <div style="color:var(--text-main);font-weight:600;">${escHtml(entry.name || entry.username)}</div>
                        <div style="color:var(--text-muted);font-size:0.8rem;">${entry.correctCount}/${entry.totalQuestions} 题</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="color:#34d399;font-weight:700;font-size:1.1rem;">${entry.accuracy}%</div>
                        <div style="color:var(--text-muted);font-size:0.8rem;">${formatTime(entry.timeSpent)}</div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        document.getElementById('lb-list').innerHTML = html;
    } catch(e) {
        document.getElementById('lb-list').innerHTML = '<p style="text-align:center;color:var(--text-muted);">加载排行榜失败</p>';
    }
}

function formatTime(seconds) {
    if (!seconds && seconds !== 0) return '-';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

function escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============================================================
// 【v1.2 页面导航切换】
// ============================================================
function switchPage(page) {
    currentPage = page;
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === page);
    });
    document.getElementById('page-learn').style.display = page === 'learn' ? 'block' : 'none';
    document.getElementById('page-practice').style.display = page === 'practice' ? 'block' : 'none';
    document.getElementById('page-dashboard').style.display = page === 'dashboard' ? 'block' : 'none';
    if (page === 'practice') initPracticePage();
    else if (page === 'dashboard') initDashboardPage();
}

// ============================================================
// 【v1.2 练习模式】
// ============================================================
function getAllWords() {
    const words = [];
    for (const catId in db) {
        for (const lessonId in db[catId].lessons) {
            db[catId].lessons[lessonId].words.forEach((word, idx) => {
                words.push({ ...word, catId, lessonId, idx });
            });
        }
    }
    return words;
}
function getWordsByCategory(catId) {
    const words = [];
    for (const lessonId in db[catId].lessons) {
        db[catId].lessons[lessonId].words.forEach((word, idx) => {
            words.push({ ...word, catId, lessonId, idx });
        });
    }
    return words;
}
function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function initPracticePage() {
    const c = document.getElementById('page-practice');
    if (c.dataset.init) return;
    c.dataset.init = '1';
    let catOpts = '';
    for (const catId in db) {
        const n = catId === "1" ? "生词 Vocabulary" : catId === "2" ? "短语 Phrases" : catId;
        catOpts += '<option value="' + catId + '">' + catId + '. ' + n + '</option>';
    }
    c.innerHTML = `<div class="practice-container"><div id="practice-setup"><div style="text-align:center;margin-bottom:25px;"><h2 style="font-size:1.5rem;font-weight:800;color:var(--text-main);"><i class="fas fa-pen-fancy" style="color:var(--accent);margin-right:8px;"></i>练习模式</h2></div><div style="margin-bottom:20px;"><div style="color:var(--text-muted);font-size:0.9rem;margin-bottom:10px;">选择词库分类</div><select id="practice-cat-select" style="width:100%;padding:12px;border-radius:10px;background:var(--input-bg);color:var(--text-main);border:1px solid var(--border-light);font-size:0.95rem;outline:none;"><option value="all">全部词库</option>' + catOpts + '</select></div><div style="margin-bottom:20px;"><div style="color:var(--text-muted);font-size:0.9rem;margin-bottom:10px;">选择练习类型</div><div class="practice-type-selector"><button class="practice-type-btn active" onclick="selectPracticeType('choice',this)"><i class="fas fa-th-large"></i> 选择题</button><button class="practice-type-btn" onclick="selectPracticeType('fill',this)"><i class="fas fa-keyboard"></i> 填空题</button><button class="practice-type-btn" onclick="selectPracticeType('listen',this)"><i class="fas fa-headphones"></i> 听力题</button></div></div><div style="margin-bottom:20px;padding:14px 18px;border-radius:14px;border:1px dashed var(--border-subtle);background:var(--accent-subtle);display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap;">
            <label style="display:flex;align-items:center;gap:12px;cursor:pointer;color:var(--text-main);font-size:1rem;font-weight:600;">
                <input type="checkbox" id="practice-learned-only" style="width:22px;height:22px;accent-color:var(--accent);cursor:pointer;">
                <i class="fas fa-check-double" style="color:var(--accent);"></i>
                仅练习已掌握内容
            </label>
            <span id="practice-learned-count" style="color:var(--accent);font-size:0.9rem;font-weight:600;"></span>
        </div>
        <div style="margin-bottom:20px;"><div style="color:var(--text-muted);font-size:0.9rem;margin-bottom:10px;">题目数量</div><div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="practice-type-btn" onclick="selectPracticeCount(10,this)">10题</button><button class="practice-type-btn active" onclick="selectPracticeCount(20,this)">20题</button><button class="practice-type-btn" onclick="selectPracticeCount(50,this)">50题</button><button class="practice-type-btn" onclick="selectPracticeCount(0,this)">全部</button></div></div><button class="practice-start-btn" onclick="startPractice()" style="width:100%;padding:14px;font-size:1.1rem;"><i class="fas fa-play"></i> 开始练习</button></div><div id="practice-quiz" style="display:none;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;"><div style="color:var(--text-main);font-weight:700;">练习中</div><div style="color:var(--text-muted);font-size:0.9rem;" id="practice-progress">1/20</div></div><div class="practice-score-bar"><div class="practice-score-item"><span class="score-val" id="p-correct">0</span>正确</div><div class="practice-score-item"><span class="score-val" id="p-wrong">0</span>错误</div><div class="practice-score-item"><span class="score-val" id="p-accuracy">0%</span>正确率</div></div><div class="practice-question-box"><div id="p-question-label" style="color:var(--text-muted);font-size:0.9rem;margin-bottom:8px;">请选择正确的中文翻译</div><div id="p-question-word" style="font-size:1.8rem;font-weight:800;color:var(--text-main);margin-bottom:10px;">加载中...</div><div id="p-question-hint" style="color:var(--text-dim);font-size:0.85rem;"></div></div><div id="p-options" class="practice-options"></div><div id="p-input-box" style="display:none;"><input type="text" class="practice-input" id="p-fill-input" placeholder="输入中文翻译..." autocomplete="off" style="width:100%;padding:12px;border-radius:10px;background:var(--input-bg);color:var(--text-main);border:1px solid var(--border-light);font-size:1rem;outline:none;"><button class="practice-start-btn" onclick="submitFillAnswer()" style="margin-top:10px;width:100%;">提交答案</button></div><div id="p-feedback" class="practice-feedback"></div><div style="display:flex;gap:12px;justify-content:center;margin-top:20px;"><button class="practice-btn-sec" onclick="endPractice()">结束练习</button><button class="practice-start-btn" id="p-next-btn" onclick="nextQuestion()" style="display:none;">下一题 <i class="fas fa-arrow-right"></i></button></div></div><div id="practice-result" style="display:none;"><div style="text-align:center;padding:30px;"><div id="p-result-score" style="font-size:4rem;font-weight:900;color:var(--accent);">0%</div><div id="p-result-text" style="color:var(--text-muted);font-size:1.1rem;margin:10px 0 20px;">练习完成！</div><div style="display:flex;gap:20px;justify-content:center;margin-bottom:25px;"><div style="text-align:center;"><div style="font-size:1.5rem;font-weight:800;color:#10b981;" id="p-r-correct">0</div><div style="color:var(--text-dim);font-size:0.8rem;">正确</div></div><div style="text-align:center;"><div style="font-size:1.5rem;font-weight:800;color:#ef4444;" id="p-r-wrong">0</div><div style="color:var(--text-dim);font-size:0.8rem;">错误</div></div><div style="text-align:center;"><div style="font-size:1.5rem;font-weight:800;color:var(--text-main);" id="p-r-total">0</div><div style="color:var(--text-dim);font-size:0.8rem;">总题数</div></div></div><div style="display:flex;gap:12px;justify-content:center;"><button class="practice-btn-sec" onclick="showWrongWords()">查看错题</button><button id="lb-submit-btn" style="display:none;padding:10px 20px;background:#f59e0b;color:#000;border:none;border-radius:10px;cursor:pointer;font-weight:700;font-size:0.9rem;" onclick="submitToLeaderboard()"><i class="fas fa-trophy"></i> 提交到排行榜</button><button class="practice-start-btn" onclick="resetPractice()">再来一次</button></div></div></div></div>`;
}
// Update learned count when checkbox changes
document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'practice-learned-only') {
        const learnedIndos = getLearnedWords();
        const catId = document.getElementById('practice-cat-select') ? document.getElementById('practice-cat-select').value : 'all';
        let words = catId === 'all' ? getAllWords() : getWordsByCategory(catId);
        const learned = words.filter(w => learnedIndos.includes(w.indonesian));
        document.getElementById('practice-learned-count').textContent = learned.length > 0 ? '(' + learned.length + ' 个已掌握内容)' : '(暂无已掌握内容)';
    }
});

function selectPracticeType(type, btn) {
    selectedPracticeType = type;
    btn.parentElement.querySelectorAll('.practice-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}
function selectPracticeCount(count, btn) {
    selectedPracticeCount = count;
    btn.parentElement.querySelectorAll('.practice-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}
function startPractice() {
    const catId = document.getElementById('practice-cat-select').value;
    let words = catId === 'all' ? getAllWords() : getWordsByCategory(catId);
    // Filter: learned words only
    const learnedOnly = document.getElementById('practice-learned-only') && document.getElementById('practice-learned-only').checked;
    if (learnedOnly) {
        const learnedIndos = getLearnedWords();
        words = words.filter(w => learnedIndos.includes(w.indonesian));
        if (words.length < 4) { alert('已掌握内容不足4个，请先学习更多单词'); return; }
    } else {
        if (words.length < 4) { alert('词库单词数量不足，至少需要4个'); return; }
    }
    words = shuffleArray(words);
    const count = selectedPracticeCount === 0 ? words.length : Math.min(selectedPracticeCount, words.length);
    practiceState = { type: selectedPracticeType, catId, questions: words.slice(0, count), currentIndex: 0, score: 0, total: count, answered: false, isFinished: false, wrongWords: [] };
    document.getElementById('practice-setup').style.display = 'none';
    document.getElementById('practice-quiz').style.display = 'block';
    document.getElementById('practice-result').style.display = 'none';
    showQuestion();
}
function showQuestion() {
    const s = practiceState;
    if (s.currentIndex >= s.total) { finishPractice(); return; }
    s.answered = false;
    const q = s.questions[s.currentIndex];
    document.getElementById('practice-progress').textContent = (s.currentIndex + 1) + '/' + s.total;
    const fb = document.getElementById('p-feedback');
    fb.style.display = 'none';
    document.getElementById('p-next-btn').style.display = 'none';
    document.getElementById('p-correct').textContent = s.score;
    document.getElementById('p-wrong').textContent = s.currentIndex - s.score;
    document.getElementById('p-accuracy').textContent = s.currentIndex > 0 ? Math.round((s.score / s.currentIndex) * 100) + '%' : '0%';
    const allW = s.catId === 'all' ? getAllWords() : getWordsByCategory(s.catId);
    if (s.type === 'choice') {
        document.getElementById('p-question-label').textContent = '请选择正确的中文翻译';
        document.getElementById('p-question-word').textContent = q.indonesian;
        document.getElementById('p-question-hint').innerHTML = '';
        document.getElementById('p-options').style.display = 'grid';
        document.getElementById('p-input-box').style.display = 'none';
        let wrong = allW.filter(w => w.chinese !== q.chinese);
        wrong = shuffleArray(wrong).slice(0, 3);
        const opts = shuffleArray([{ text: q.chinese, correct: true }, ...wrong.map(w => ({ text: w.chinese, correct: false }))]);
        document.getElementById('p-options').innerHTML = opts.map(o => '<div class="practice-option" onclick="selectOption(this,' + o.correct + ',\'' + o.text.replace(/'/g, "\\'") + '\')">' + o.text + '</div>').join('');
    } else if (s.type === 'fill') {
        document.getElementById('p-question-label').textContent = '请输入正确的中文翻译';
        document.getElementById('p-question-word').textContent = q.indonesian;
        document.getElementById('p-question-hint').textContent = '输入中文后点击提交';
        document.getElementById('p-options').style.display = 'none';
        document.getElementById('p-input-box').style.display = 'block';
        const inp = document.getElementById('p-fill-input');
        inp.value = '';
        inp.className = 'practice-input';
        inp.focus();
    } else if (s.type === 'listen') {
        document.getElementById('p-question-label').textContent = '听发音，选择正确的中文翻译';
        document.getElementById('p-question-word').textContent = '🔊';
        document.getElementById('p-options').style.display = 'grid';
        document.getElementById('p-input-box').style.display = 'none';
        setTimeout(() => { googleSpeech(q.indonesian).catch(() => {}); }, 300);
        let wrong = allW.filter(w => w.indonesian !== q.indonesian);
        wrong = shuffleArray(wrong).slice(0, 3);
        const opts = shuffleArray([{ text: q.chinese, correct: true }, ...wrong.map(w => ({ text: w.chinese, correct: false }))]);
        document.getElementById('p-options').innerHTML = opts.map(o => '<div class="practice-option" onclick="selectOption(this,' + o.correct + ',\'' + o.text.replace(/'/g, "\\'") + '\')">' + o.text + '</div>').join('');
        document.getElementById('p-question-hint').innerHTML = '<button onclick="googleSpeech(practiceState.questions[practiceState.currentIndex].indonesian).catch(()=>{})" style="background:var(--accent);color:white;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;margin-top:8px;"><i class="fas fa-redo"></i> 重新播放</button>';
    }
}
function selectOption(el, correct, answer) {
    if (practiceState.answered) return;
    practiceState.answered = true;
    const q = practiceState.questions[practiceState.currentIndex];
    const fb = document.getElementById('p-feedback');
    document.querySelectorAll('.practice-option').forEach(o => o.classList.add('disabled'));
    if (correct) {
        el.classList.add('correct');
        practiceState.score++;
        fb.textContent = '✓ 回答正确！';
        fb.className = 'practice-feedback show correct';
    } else {
        el.classList.add('wrong');
        document.querySelectorAll('.practice-option').forEach(o => { if (o.textContent === q.chinese) o.classList.add('correct'); });
        fb.textContent = '✗ 正确答案：' + q.chinese;
        fb.className = 'practice-feedback show wrong';
        practiceState.wrongWords.push(q);
    }
    document.getElementById('p-next-btn').style.display = 'inline-flex';
    const t = practiceState.currentIndex + 1;
    document.getElementById('p-correct').textContent = practiceState.score;
    document.getElementById('p-wrong').textContent = t - practiceState.score;
    document.getElementById('p-accuracy').textContent = Math.round((practiceState.score / t) * 100) + '%';
}
function submitFillAnswer() {
    if (practiceState.answered) return;
    practiceState.answered = true;
    const q = practiceState.questions[practiceState.currentIndex];
    const inp = document.getElementById('p-fill-input');
    const fb = document.getElementById('p-feedback');
    const ua = inp.value.trim();
    if (!ua) { practiceState.answered = false; return; }
    if (ua === q.chinese) {
        inp.classList.add('correct');
        practiceState.score++;
        fb.textContent = '✓ 回答正确！';
        fb.className = 'practice-feedback show correct';
    } else {
        inp.classList.add('wrong');
        fb.textContent = '✗ 正确答案：' + q.chinese;
        fb.className = 'practice-feedback show wrong';
        practiceState.wrongWords.push(q);
    }
    document.getElementById('p-next-btn').style.display = 'inline-flex';
    const t = practiceState.currentIndex + 1;
    document.getElementById('p-correct').textContent = practiceState.score;
    document.getElementById('p-wrong').textContent = t - practiceState.score;
    document.getElementById('p-accuracy').textContent = Math.round((practiceState.score / t) * 100) + '%';
}
function nextQuestion() { practiceState.currentIndex++; showQuestion(); }
function endPractice() { finishPractice(); }
function finishPractice() {
    practiceState.isFinished = true;
    const s = practiceState;
    const pct = s.total > 0 ? Math.round((s.score / s.total) * 100) : 0;
    document.getElementById('practice-quiz').style.display = 'none';
    document.getElementById('practice-result').style.display = 'block';
    document.getElementById('p-result-score').textContent = pct + '%';
    document.getElementById('p-r-correct').textContent = s.score;
    document.getElementById('p-r-wrong').textContent = s.total - s.score;
    document.getElementById('p-r-total').textContent = s.total;
    let txt = '继续加油！';
    if (pct >= 90) txt = '太棒了！几乎完美！';
    else if (pct >= 70) txt = '不错！再接再厉！';
    else if (pct >= 50) txt = '还可以，多多练习！';
    document.getElementById('p-result-text').textContent = txt;
    const hist = JSON.parse(localStorage.getItem('fmi_practice_history') || '[]');
    hist.push({ date: new Date().toLocaleDateString(), type: s.type, score: s.score, total: s.total, percent: pct });
    if (hist.length > 50) hist.splice(0, hist.length - 50);
    localStorage.setItem('fmi_practice_history', JSON.stringify(hist));

    // Check if leaderboard is enabled for this practice
    checkLeaderboardAndShowButton(s, pct);
}

async function checkLeaderboardAndShowButton(state, pct) {
    try {
        const data = await API.getLeaderboard();
        if (!data.error && data.config && data.config.enabled) {
            const config = data.config;
            // Check if practice matches leaderboard config
            const matchCount = !config.questionCount || state.total === config.questionCount;
            const matchType = !config.type || state.type === config.type;
            const matchCat = !config.category || state.category === config.category || (config.category === 'all' && !state.category);
            if (matchCount && (matchType || !config.type)) {
                document.getElementById('lb-submit-btn').style.display = 'inline-flex';
            }
        }
    } catch(e) {}
}

async function submitToLeaderboard() {
    const s = practiceState;
    const pct = s.total > 0 ? Math.round((s.score / s.total) * 100) : 0;
    const btn = document.getElementById('lb-submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 提交中...';

    try {
        const result = await API.submitLeaderboard({
            accuracy: pct,
            timeSpent: Math.round((Date.now() - (s.startTime || Date.now())) / 1000),
            totalQuestions: s.total,
            correctCount: s.score,
        });
        if (result.success) {
            btn.innerHTML = '<i class="fas fa-check"></i> 已提交';
            btn.disabled = true;
            btn.style.background = '#10b981';
            btn.style.color = '#fff';
        } else if (result.error) {
            btn.innerHTML = '<i class="fas fa-trophy"></i> 提交到排行榜';
            btn.disabled = false;
            alert(result.error);
        }
    } catch(e) {
        btn.innerHTML = '<i class="fas fa-trophy"></i> 提交到排行榜';
        btn.disabled = false;
    }
}
function showWrongWords() {
    if (practiceState.wrongWords.length === 0) { alert('没有错题，全部正确！'); return; }
    let msg = '错题列表：\n\n';
    practiceState.wrongWords.forEach((w, i) => { msg += (i + 1) + '. ' + w.indonesian + ' - ' + w.chinese + '\n'; });
    alert(msg + '\n建议将错题加入收藏夹重点复习！');
}
function resetPractice() {
    document.getElementById('practice-setup').style.display = 'block';
    document.getElementById('practice-quiz').style.display = 'none';
    document.getElementById('practice-result').style.display = 'none';
}

// ============================================================
// 【v1.2 学习统计仪表盘】
// ============================================================
function initDashboardPage() {
    const c = document.getElementById('page-dashboard');
    if (c.dataset.init) { c.dataset.init = '2'; } // always refresh
    else { c.dataset.init = '2'; }
    const allW = getAllWords();
    const totalLib = allW.length;
    const learned = JSON.parse(localStorage.getItem('fmi_all_words') || '[]');
    const learnedN = learned.length;
    const learnedPct = totalLib > 0 ? Math.round((learnedN / totalLib) * 100) : 0;
    const mins = Math.floor(studyStats.studySeconds / 60);
    const secs = studyStats.studySeconds % 60;
    const hist = JSON.parse(localStorage.getItem('fmi_practice_history') || '[]');
    const totalP = hist.length;
    const avgS = totalP > 0 ? Math.round(hist.reduce((s, h) => s + h.percent, 0) / totalP) : 0;
    let catBreakdown = '';
    for (const catId in db) {
        let catTotal = 0;
        for (const lid in db[catId].lessons) catTotal += db[catId].lessons[lid].words.length;
        const cn = catId === "1" ? "生词 Vocabulary" : catId === "2" ? "短语 Phrases" : catId;
        catBreakdown += '<div style="margin-bottom:12px;"><div style="display:flex;justify-content:space-between;color:var(--text-muted);font-size:0.85rem;margin-bottom:4px;"><span>' + catId + '. ' + cn + '</span><span>' + catTotal + ' 词</span></div><div class="dash-progress-bar" style="height:6px;"><div class="dash-progress-fill" style="width:' + (catTotal > 0 ? Math.min(100, Math.round((learnedN / totalLib) * 100)) : 0) + '%;"></div></div></div>';
    }
    let histHTML = '';
    if (hist.length > 0) {
        histHTML = hist.slice(-10).reverse().map(h => {
            const tn = h.type === 'choice' ? '选择题' : h.type === 'fill' ? '填空题' : '听力题';
            const clr = h.percent >= 70 ? 'var(--success)' : 'var(--danger)';
            return '<div class="dash-history-item"><div class="dash-history-date">' + h.date + '</div><div class="dash-history-type">' + tn + '</div><div class="dash-history-score" style="color:' + clr + ';">' + h.score + '/' + h.total + ' (' + h.percent + '%)</div></div>';
        }).join('');
    } else {
        histHTML = '<div style="color:var(--text-dim);text-align:center;padding:20px;">暂无练习记录</div>';
    }
    let wordsHTML = '';
    if (todayRecord.length > 0) {
        wordsHTML = todayRecord.map((item, i) => '<div class="dash-word-chip"><span class="dash-word-idx">' + (i + 1) + '</span><span class="dash-word-indo">' + item.indonesian + '</span><span class="dash-word-zh">' + item.chinese + '</span></div>').join('');
    } else {
        wordsHTML = '<div style="color:var(--text-dim);text-align:center;padding:20px;">今天还没有学习记录</div>';
    }
    c.innerHTML = '<div style="margin:0 auto;max-width:100%;"><div style="text-align:center;margin-bottom:25px;"><h2 style="font-size:1.8rem;font-weight:800;color:var(--text-main);"><i class="fas fa-chart-line" style="color:var(--accent);margin-right:10px;"></i>学习统计</h2><p style="color:var(--text-muted);font-size:0.95rem;margin-top:5px;">' + today + ' · 数据总览</p></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:15px;margin-bottom:25px;"><div class="dash-card" style="border-top:3px solid var(--accent);"><div style="font-size:1.8rem;color:var(--accent);margin-bottom:10px;"><i class="fas fa-book"></i></div><div class="dash-card-value">' + studyStats.todayWords + '</div><div class="dash-card-label">今日学习</div><div class="dash-card-sub">/ 20 目标单词</div></div><div class="dash-card" style="border-top:3px solid #f59e0b;"><div style="font-size:1.8rem;color:#f59e0b;margin-bottom:10px;"><i class="fas fa-clock"></i></div><div class="dash-card-value">' + mins + '<span style="font-size:0.7em;color:var(--text-muted);">分' + secs + '秒</span></div><div class="dash-card-label">在线时长</div><div class="dash-card-sub">今日累计</div></div><div class="dash-card" style="border-top:3px solid #10b981;"><div style="font-size:1.8rem;color:#10b981;margin-bottom:10px;"><i class="fas fa-layer-group"></i></div><div class="dash-card-value">' + learnedN + '<span style="font-size:0.7em;color:var(--text-muted);">/' + totalLib + '</span></div><div class="dash-card-label">累计掌握</div><div class="dash-card-sub">总词汇量</div></div><div class="dash-card" style="border-top:3px solid #a78bfa;"><div style="font-size:1.8rem;color:#a78bfa;margin-bottom:10px;"><i class="fas fa-bullseye"></i></div><div class="dash-card-value">' + learnedPct + '%</div><div class="dash-card-label">掌握率</div><div class="dash-card-sub">' + learnedN + '/' + totalLib + ' 词</div></div></div><div class="dash-section"><div class="dash-section-title"><i class="fas fa-tasks" style="color:var(--accent);margin-right:8px;"></i>词汇掌握进度</div><div class="dash-progress-bar"><div class="dash-progress-fill" style="width:' + learnedPct + '%;"></div></div><div class="dash-progress-labels"><span>已掌握 ' + learnedN + ' 词</span><span>总词汇量 ' + totalLib + ' 词</span></div><div style="margin-top:20px;">' + catBreakdown + '</div></div><div class="dash-section"><div class="dash-section-title"><i class="fas fa-history" style="color:var(--accent);margin-right:8px;"></i>练习历史</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:15px;"><div class="dash-mini-card"><div class="dash-mini-value">' + totalP + '</div><div class="dash-mini-label">练习次数</div></div><div class="dash-mini-card"><div class="dash-mini-value">' + avgS + '%</div><div class="dash-mini-label">平均正确率</div></div></div><div class="dash-history-list">' + histHTML + '</div></div><div class="dash-section"><div class="dash-section-title"><i class="fas fa-list-check" style="color:var(--accent);margin-right:8px;"></i>今日已学单词</div><div class="dash-words-grid">' + wordsHTML + '</div></div></div>';
}

// ============================================================
// 【v1.2 主题切换】
// ============================================================
function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'light';
    html.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('fmi_theme', isDark ? 'dark' : 'light');
    const btn = document.querySelector('.theme-toggle');
    if (btn) btn.innerHTML = isDark ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
}
function applySavedTheme() {
    const t = localStorage.getItem('fmi_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', t);
    const btn = document.createElement('button');
    btn.className = 'theme-toggle';
    btn.innerHTML = t === 'dark' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
    btn.title = '切换主题';
    btn.onclick = toggleTheme;
    document.body.appendChild(btn);
}

// ============================================================
// 【v1.2 名单解析功能】
// ============================================================
function parseRosterFile() {
    const fi = document.getElementById('roster-file-input');
    const file = fi.files[0];
    if (!file) { alert('请选择文件'); return; }
    const fn = file.name.toLowerCase();
    if (fn.endsWith('.json')) {
        const r = new FileReader();
        r.onload = function(e) {
            try {
                let d = JSON.parse(e.target.result);
                if (!Array.isArray(d)) { const k = Object.keys(d); const a = k.find(x => Array.isArray(d[x])); if (a) d = d[a]; else { alert('JSON格式错误'); return; } }
                rosterParsedResult = d.map(i => ({ username: String(i.username||i.company||i['公司']||i.user||i.account||i['工号']||''), name: String(i.name||i['姓名']||i.userName||i['员工姓名']||''), password: String(i.password||i['密码']||i.pass||i['初始密码']||'') })).filter(i => i.username && i.name);
                showRosterPreview(rosterParsedResult);
            } catch(err) { alert('JSON解析失败: ' + err.message); }
        };
        r.readAsText(file);
    } else if (fn.endsWith('.xls') || fn.endsWith('.xlsx')) {
        if (typeof XLSX === 'undefined') {
            const s = document.createElement('script');
            s.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
            s.onload = function() { readExcelFile(file); };
            document.head.appendChild(s);
        } else { readExcelFile(file); }
    } else if (fn.endsWith('.csv') || fn.endsWith('.txt')) {
        const r = new FileReader();
        r.onload = function(e) { parseRosterCSV(e.target.result); };
        r.readAsText(file);
    } else { alert('不支持的文件格式'); }
}
function readExcelFile(file) {
    const r = new FileReader();
    r.onload = function(e) {
        try {
            const wb = XLSX.read(e.target.result, { type: 'array' });
            const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
            parseRosterCSV(csv);
        } catch(err) { alert('Excel解析失败: ' + err.message); }
    };
    r.readAsArrayBuffer(file);
}
function parseRosterText() {
    const txt = document.getElementById('roster-textarea').value.trim();
    if (!txt) { alert('请先粘贴名单文本'); return; }
    try {
        const d = JSON.parse(txt);
        let arr = Array.isArray(d) ? d : (d.data || d.list || [d]);
        rosterParsedResult = arr.map(i => ({ username: String(i.username||i.company||i['公司']||''), name: String(i.name||i['姓名']||''), password: String(i.password||i['密码']||'') })).filter(i => i.username && i.name);
        if (rosterParsedResult.length > 0) { showRosterPreview(rosterParsedResult); return; }
    } catch(e) {}
    parseRosterCSV(txt);
}
function parseRosterCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    if (!lines.length) { alert('内容为空'); return; }
    const delims = [',', '\t', '|', ';'];
    let best = ',', maxC = 0;
    for (const d of delims) { const c = lines[0].split(d).length; if (c > maxC) { maxC = c; best = d; } }
    const rows = lines.map(l => l.split(best).map(c => c.trim().replace(/^[\"\']|[\"\']$/g, '')));
    let startRow = 0;
    const hk = ['公司','工号','姓名','密码','username','name','password','company','user','pass'];
    if (rows[0] && rows[0].some(h => hk.some(k => (h||'').toLowerCase().includes(k.toLowerCase())))) { if (rows.length > 1) startRow = 1; }
    let uC=0, nC=0, pC=rows[0]?rows[0].length-1:0;
    if (rows[0] && rows[0].length >= 3) {
        const uK=['公司','company','username','user','account','账号','用户名'];
        const nK=['姓名','name','员工','员工姓名'];
        const pK=['密码','password','pass','初始密码'];
        rows[0].forEach((h,i) => { const hl=(h||'').toLowerCase(); if(uK.some(k=>hl.includes(k)))uC=i; if(nK.some(k=>hl.includes(k)))nC=i; if(pK.some(k=>hl.includes(k)))pC=i; });
        if (startRow === 0) { if (rows[0].length === 4) { uC=0; nC=2; pC=3; } else if (rows[0].length === 3) { uC=0; nC=1; pC=2; } }
    }
    rosterParsedResult = [];
    for (let i = startRow; i < rows.length; i++) {
        const r = rows[i]; if (!r || r.length < 2) continue;
        const u = (r[uC]||'').trim(), n = (r[nC]||'').trim(), p = (r[pC]||'').trim();
        if (u && n) rosterParsedResult.push({ username: u, name: n, password: p || '123456' });
    }
    showRosterPreview(rosterParsedResult);
}
function showRosterPreview(data) {
    if (!data.length) { document.getElementById('roster-parse-result').textContent = '未能解析出有效数据'; document.getElementById('roster-parse-result').style.color = '#f87171'; document.getElementById('roster-preview-area').style.display = 'none'; return; }
    document.getElementById('roster-parse-result').textContent = '成功解析 ' + data.length + ' 条记录';
    document.getElementById('roster-parse-result').style.color = '#34d399';
    document.getElementById('roster-preview-area').style.display = 'block';
    document.getElementById('roster-preview-count').textContent = '解析预览 (' + data.length + ' 条)';
    document.getElementById('roster-json-output').value = JSON.stringify(data, null, 2);
}
function copyRosterJSON() {
    if (!rosterParsedResult.length) { alert('没有可复制的数据'); return; }
    const j = JSON.stringify(rosterParsedResult, null, 2);
    navigator.clipboard.writeText(j).then(() => {
        const fb = document.getElementById('roster-copy-feedback');
        fb.style.display = 'block'; fb.textContent = '✓ 已复制到剪贴板！';
        setTimeout(() => { fb.style.display = 'none'; }, 3000);
    }).catch(() => {
        const ta = document.createElement('textarea'); ta.value = j; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
        const fb = document.getElementById('roster-copy-feedback');
        fb.style.display = 'block'; setTimeout(() => { fb.style.display = 'none'; }, 3000);
    });
}

// 页面加载完成后初始化
window.onload = async function() {
    await loadWhitelist(); // 先加载白名单
    checkLoginStatus(); // 优先拦截未登录状态进行跳转
    initUI();           // 渲染界面结构
    checkLoginStatus(); // 界面渲染完毕后，二次调用以安全写入用户名
    updateStats();

    // 【v2.0 KV 后端对接】启动心跳、学习同步、在线人数显示
    if (API.isLoggedIn()) {
        startHeartbeat();
        startStudySync();
    }
    loadOnlineDisplay();

    // 【功能③】直接关闭页面时关联登出逻辑
    // 记录当前日期，下次打开时如果是次日则自动清空
    localStorage.setItem('fmi_last_session_date', new Date().toLocaleDateString());
    window.addEventListener('beforeunload', function(e) {
        // beforeunload 无法阻止浏览器关闭时显示自定义弹窗
        // 但我们可以在此标记"需要确认"，下次打开时检测日期变化自动清空
        const lastDate = localStorage.getItem('fmi_last_session_date');
        const todayStr = new Date().toLocaleDateString();
        if (lastDate && lastDate !== todayStr) {
            // 跨天了，标记下次打开需要自动清空
            localStorage.setItem('fmi_auto_clear_on_new_day', 'true');
        }
        localStorage.setItem('fmi_last_session_date', todayStr);
        // Sync study data before leaving
        syncStudyToCloud().catch(() => {});
    });
};

// 【功能⑤】点击版本号展示更新日志
function showVersionChangelog() {
    const dialog = document.createElement('div');
    dialog.id = 'version-changelog-dialog';
    dialog.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;justify-content:center;align-items:center;backdrop-filter:blur(15px);';
    dialog.innerHTML = `
        <div style="background:#111827;padding:35px 40px;border-radius:25px;border:1px solid rgba(99,102,241,0.4);max-width:520px;width:90%;max-height:80vh;overflow-y:auto;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h3 style="color:#fff;font-size:1.2rem;">📋 更新日志</h3>
                <button onclick="document.body.removeChild(document.getElementById('version-changelog-dialog'))" style="background:none;border:none;color:#94a3b8;font-size:1.5rem;cursor:pointer;padding:0 5px;">&times;</button>
            </div>
            <div style="border-left:3px solid var(--accent);padding:15px 20px;margin-bottom:15px;border-radius:0 10px 10px 0;">
                <div style="color:#a5b4fc;font-weight:700;margin-bottom:8px;">Ver 2.0 (2026-04-22)</div>
                <ul style="color:#cbd5e1;font-size:0.9rem;line-height:1.8;padding-left:18px;">
                    <li>新增：Cloudflare KV 在线存储，数据跨设备同步</li>
                    <li>新增：注册页面，支持自助注册</li>
                    <li>新增：排行榜功能（每日打榜，准确率+用时排名）</li>
                    <li>新增：在线人数显示（主界面+登录界面）</li>
                    <li>新增：后台用户管理（增删改查、踢人、封禁）</li>
                    <li>新增：后台系统设置（人数限制、注册开关等）</li>
                    <li>新增：后台打榜配置（题目数量、分类、类型）</li>
                    <li>新增：白名单一键导入云端用户库</li>
                    <li>优化：目录栏折叠联动全屏</li>
                    <li>优化：所有页面宽度统一撑满</li>
                </ul>
            </div>
            <div style="border-left:3px solid #475569;padding:15px 20px;margin-bottom:15px;border-radius:0 10px 10px 0;">
                <div style="color:#94a3b8;font-weight:700;margin-bottom:8px;">Ver 1.2 (2026-04-20)</div>
                <ul style="color:#94a3b8;font-size:0.85rem;line-height:1.8;padding-left:18px;">
                    <li>优化：目录栏折叠联动全屏</li>
                    <li>优化：练习/统计页面宽度统一</li>
                    <li>新增：练习模式"仅练习已掌握内容"筛选</li>
                </ul>
            </div>
            <div style="border-left:3px solid #475569;padding:15px 20px;margin-bottom:15px;border-radius:0 10px 10px 0;">
                <div style="color:#94a3b8;font-weight:700;margin-bottom:8px;">Ver 1.1 (2026-04-20)</div>
                <ul style="color:#cbd5e1;font-size:0.9rem;line-height:1.8;padding-left:18px;">
                    <li>新增：收藏夹支持逐个删除收藏项</li>
                    <li>新增：登出时弹窗确认是否清空学习记录</li>
                    <li>新增：关闭页面时关联登出逻辑，次日自动清空记录</li>
                    <li>新增：后台名单解析功能（支持 CSV/TXT/Excel 上传）</li>
                    <li>新增：点击版本号查看更新日志</li>
                </ul>
            </div>
            <div style="border-left:3px solid #475569;padding:15px 20px;">
                <div style="color:#94a3b8;font-weight:700;margin-bottom:8px;">Ver 1.2 <span class="clickable" onclick="showVersionChangelog()" style="font-size:0.75rem;margin-left:5px;" title="查看更新日志">[更新日志]</span></div>
                <ul style="color:#64748b;font-size:0.85rem;line-height:1.8;padding-left:18px;">
                    <li>初始版本发布</li>
                    <li>基础学习功能（生词、短语）</li>
                    <li>谷歌翻译发音 + 本地语音合成</li>
                    <li>收藏夹功能</li>
                    <li>学习打卡分享</li>
                    <li>管理员后台</li>
                </ul>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    // 点击遮罩层关闭
    dialog.addEventListener('click', function(e) {
        if (e.target === dialog) {
            document.body.removeChild(dialog);
        }
    });
}

// 【版本更新日志】
function showVersionChangelog() {
    const dialog = document.createElement('div');
    dialog.id = 'version-changelog-dialog';
    dialog.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;justify-content:center;align-items:center;backdrop-filter:blur(15px);';
    dialog.innerHTML = `
        <div style="background:#111827;padding:35px 40px;border-radius:25px;border:1px solid rgba(99,102,241,0.4);max-width:520px;width:90%;max-height:80vh;overflow-y:auto;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h3 style="color:#fff;font-size:1.2rem;">📋 更新日志</h3>
                <button onclick="document.body.removeChild(document.getElementById('version-changelog-dialog'))" style="background:none;border:none;color:#94a3b8;font-size:1.5rem;cursor:pointer;padding:0 5px;">&times;</button>
            </div>
            <div style="border-left:3px solid #10b981;padding:15px 20px;margin-bottom:15px;border-radius:0 10px 10px 0;">
                <div style="color:#34d399;font-weight:700;margin-bottom:8px;">Ver 1.2 (2026-04-20)</div>
                <ul style="color:#cbd5e1;font-size:0.9rem;line-height:1.8;padding-left:18px;">
                    <li>新增：练习模式（选择题 / 填空题 / 听力题）</li>
                    <li>新增：学习统计仪表盘（掌握率 / 练习历史）</li>
                    <li>新增：深色/浅色主题切换</li>
                    <li>新增：PWA 离线支持（断网也能学习）</li>
                    <li>新增：收藏夹逐个删除</li>
                    <li>新增：登出确认弹窗 + 跨天自动清空</li>
                    <li>新增：后台名单解析（上传文件/粘贴文本/一键复制）</li>
                    <li>新增：点击版本号查看更新日志</li>
                    <li>优化：界面全面美化</li>
                </ul>
            </div>
            <div style="border-left:3px solid #475569;padding:15px 20px;">
                <div style="color:#94a3b8;font-weight:700;margin-bottom:8px;">Ver 1.0</div>
                <ul style="color:#64748b;font-size:0.85rem;line-height:1.8;padding-left:18px;">
                    <li>初始版本发布</li>
                </ul>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    dialog.addEventListener('click', function(e) { if (e.target === dialog) document.body.removeChild(dialog); });
}

// 绑定版权区双击打开后台（兼容原逻辑）
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        const copyright = document.getElementById('copyright');
        if (copyright) {
            copyright.ondblclick = openAdminModal;
        }
    }, 1000);
});