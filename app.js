// 全局变量
const app = document.getElementById('app');
let db = {}; // 词库数据
let favs = JSON.parse(localStorage.getItem('fmi_v1_favs') || '[]'); // 收藏
let curCat = "1", curIdx = 0, curLesson = "1"; // 当前分类/单词索引
let todayRecord = JSON.parse(localStorage.getItem('fmi_today_record') || '[]'); // 今日记录
let studyStats = JSON.parse(localStorage.getItem('fmi_study_stats') || '{"totalWords":0,"studySeconds":0,"todayWords":0,"startTime":null}');
let dailyGoal = parseInt(localStorage.getItem('fmi_daily_goal') || '20');
let _rate = parseFloat(localStorage.getItem('fmi_rate') || '0.8');
let _loop = parseInt(localStorage.getItem('fmi_loop') || '1');
let _hideChinese = false;
let loginStatus; // 全局登录状态
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
    loginStatus = JSON.parse(localStorage.getItem('fmi_login_status') || '{"isLogin":false}');
    if (!loginStatus.isLogin) {
        location.href = "login.html"; 
    } else {
        // 【跨天自动清空学习记录】
        const todayStr = new Date().toLocaleDateString();
        const savedDate = localStorage.getItem('fmi_study_date');
        if (savedDate && savedDate !== todayStr) {
            localStorage.removeItem('fmi_today_record');
            localStorage.removeItem('fmi_study_stats');
            localStorage.removeItem('fmi_study_date');
            localStorage.removeItem('fmi_all_words');
            todayRecord = [];
            studyStats = { totalWords: 0, studySeconds: 0, todayWords: 0, startTime: null };
            // 不重置 dailyGoal，用户设置应保留
        }
        localStorage.setItem('fmi_study_date', todayStr);
        const userStatusEl = document.getElementById('user-status');
        if (userStatusEl) {
            userStatusEl.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="position:relative;">
                        <span onclick="toggleUserMenu()" style="cursor:pointer;display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px;transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                            <i class="fas fa-user-circle" style="color:#a5b4fc;font-size:1.1rem;"></i>
                            欢迎，${loginStatus.user.name}
                            <i class="fas fa-chevron-down" style="font-size:0.65rem;color:#64748b;"></i>
                        </span>
                        <div id="user-dropdown" style="display:none;position:absolute;top:100%;right:0;margin-top:8px;background:rgba(30,41,59,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:6px;min-width:150px;z-index:9999;backdrop-filter:blur(20px);box-shadow:0 10px 40px rgba(0,0,0,0.6);">
                            <div onclick="logout()" style="padding:10px 14px;border-radius:8px;cursor:pointer;color:#e2e8f0;font-size:0.85rem;display:flex;align-items:center;gap:8px;transition:background 0.2s;" onmouseover="this.style.background='rgba(248,113,113,0.1)'" onmouseout="this.style.background='transparent'">
                                <i class="fas fa-sign-out-alt" style="color:#f87171;width:16px;text-align:center;"></i> 退出登录
                            </div>
                            <div id="delete-account-btn" style="height:1px;background:rgba(255,255,255,0.05);margin:4px 8px;"></div>
                            <div id="delete-account-item" onclick="showDeleteAccountDialog();toggleUserMenu();" style="padding:10px 14px;border-radius:8px;cursor:pointer;color:#ef4444;font-size:0.85rem;display:flex;align-items:center;gap:8px;transition:background 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.1)'" onmouseout="this.style.background='transparent'">
                                <i class="fas fa-user-slash" style="width:16px;text-align:center;"></i> 注销账号
                            </div>
                        </div>
                    </div>
                </div>
            `;
            // 访客/管理员模式隐藏注销按钮
            const isVisitor = localStorage.getItem('fmi_visitor_login');
            // loginStatus 已在函数开头声明
            const isAdmin = loginStatus.user && loginStatus.user.username === 'admin';
            if (isVisitor || isAdmin) {
                const delItem = document.getElementById('delete-account-item');
                const delSep = document.getElementById('delete-account-btn');
                if (delItem) delItem.style.display = 'none';
                if (delSep) delSep.style.display = 'none';
            }
        }
    }
}

// 用户菜单切换
function toggleUserMenu() {
    const dropdown = document.getElementById('user-dropdown');
    const dropdownHome = document.getElementById('user-dropdown-home');
    [dropdown, dropdownHome].forEach(dd => {
        if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
    });
}
// 点击页面其他区域关闭菜单
document.addEventListener('click', function(e) {
    ['user-dropdown', 'user-dropdown-home'].forEach(id => {
        const dd = document.getElementById(id);
        const parentId = id === 'user-dropdown' ? '#user-status' : '#home-user-bar';
        if (dd && !e.target.closest(parentId)) {
            dd.style.display = 'none';
        }
    });
});

// 退出登录（带确认弹窗）
function logout() {
    // 使用自定义弹窗代替 confirm
    showLogoutConfirmDialog();
}

// 注销账号确认弹窗（密码确认式）
function showDeleteAccountDialog() {
    const dialog = document.createElement('div');
    dialog.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;justify-content:center;align-items:center;backdrop-filter:blur(10px);';
    dialog.innerHTML = `
        <div style="background:#111827;padding:35px 40px;border-radius:25px;border:1px solid rgba(239,68,68,0.4);text-align:center;max-width:420px;width:90%;">
            <div style="font-size:2rem;margin-bottom:15px;">⚠️</div>
            <h3 style="color:#f87171;margin-bottom:12px;font-size:1.2rem;">确认注销账号？</h3>
            <p style="color:#94a3b8;margin-bottom:20px;font-size:0.95rem;line-height:1.6;">
                此操作将<strong style="color:#f87171;">永久删除</strong>您的账号和所有数据，<br>包括学习记录、练习历史等，<strong style="color:#f87171;">无法恢复</strong>。
            </p>
            <div style="margin-bottom:20px;text-align:left;">
                <label style="color:#94a3b8;font-size:0.85rem;display:block;margin-bottom:6px;">请输入登录密码以确认注销</label>
                <input id="del-password" type="password" placeholder="输入您的登录密码" style="width:100%;padding:10px 14px;background:#1e293b;border:1px solid #334155;border-radius:10px;color:#e2e8f0;font-size:0.95rem;outline:none;box-sizing:border-box;" />
            </div>
            <div style="display:flex;gap:12px;justify-content:center;">
                <button id="del-cancel" style="background:#475569;color:white;border:none;padding:10px 25px;border-radius:12px;cursor:pointer;font-size:0.95rem;">取消</button>
                <button id="del-confirm" style="background:#ef4444;color:white;border:none;padding:10px 25px;border-radius:12px;cursor:pointer;font-size:0.95rem;">确认注销</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    dialog.querySelector('#del-cancel').onclick = () => document.body.removeChild(dialog);
    dialog.querySelector('#del-password').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') dialog.querySelector('#del-confirm').click();
    });
    dialog.querySelector('#del-confirm').onclick = async () => {
        const password = dialog.querySelector('#del-password').value.trim();
        if (!password) {
            alert('请输入密码');
            return;
        }
        dialog.querySelector('#del-confirm').textContent = '注销中...';
        dialog.querySelector('#del-confirm').disabled = true;
        // 从登录状态获取用户名
        let currentUsername = '';
        try {
            const loginStatus = JSON.parse(localStorage.getItem('fmi_login_status') || '{}');
            currentUsername = loginStatus.user ? loginStatus.user.username : '';
        } catch(e) {}
        if (!currentUsername) {
            alert('无法获取当前用户名，请重新登录后再试');
            document.body.removeChild(dialog);
            location.href = 'login.html';
            return;
        }
        const result = await API.request('user/delete', { method: 'POST', body: JSON.stringify({ targetUsername: currentUsername, password: password }) });
        if (result.success) {
            API.clearToken();
            localStorage.removeItem('fmi_login_status');
            localStorage.removeItem('fmi_today_record');
            localStorage.removeItem('fmi_study_stats');
            localStorage.removeItem('fmi_all_words');
            alert('账号已注销');
            location.href = 'login.html';
        } else {
            alert(result.error || '注销失败');
            dialog.querySelector('#del-confirm').textContent = '确认注销';
            dialog.querySelector('#del-confirm').disabled = false;
        }
    };
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
        localStorage.removeItem('fmi_study_date');
        localStorage.removeItem('fmi_all_words');
        localStorage.removeItem('fmi_v1_favs');
        localStorage.removeItem('fmi_login_status');
        localStorage.removeItem('fmi_token');
        document.body.removeChild(dialog);
        location.href = "login.html";
    };
}

// 初始化页面（核心：先渲染DOM，再加载数据）
async function initUI() {
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
        <button class="nav-tab active" onclick="switchMainPage('home')" data-tab="home"><i class="fas fa-home"></i> 主页</button>
        <button class="nav-tab" onclick="switchMainPage('study')" data-tab="study"><i class="fas fa-book-open"></i> 勤学苦练</button>
        <button class="nav-tab" onclick="switchMainPage('challenge')" data-tab="challenge"><i class="fas fa-gamepad"></i> 闯天关</button>
    </div>
    <header class="app-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
            <div class="date-time" id="date-time-header" style="color:#94a3b8;font-size:0.82rem;">${new Date().toLocaleString()}</div>
            <div class="weather-location" id="weather-location">
                <i class="fas fa-cloud"></i>
                <span>加载中...</span>
            </div>
            <div style="display:flex;align-items:center;gap:4px;color:#64748b;font-size:0.8rem;" id="location-info">
                <i class="fas fa-map-marker-alt" style="font-size:0.75rem;"></i>
                <span id="location-name">定位中...</span>
            </div>
        </div>
        <div class="user-status" id="user-status" style="font-size:0.9rem;">
            欢迎，管理员
        </div>
    </header>

    <!-- 勤学苦练子Tab -->
    <!-- 主页 -->
    <div id="page-home">
        <div class="home-container">
            <div class="home-user-bar" id="home-user-bar">
                <span style="color:#94a3b8;font-size:0.9rem;">加载中...</span>
            </div>
            <div class="home-hero">
                <h1 class="home-title">印尼语学习助手</h1>
                <p class="home-subtitle">BIPA 学习平台</p>
            </div>
            <div class="home-cards">
                <div class="home-card" onclick="switchMainPage('study')">
                    <div class="home-card-icon" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);">
                        <i class="fas fa-book-open"></i>
                    </div>
                    <div class="home-card-title">勤学苦练</div>
                    <div class="home-card-desc">课程学习 · 选择填空 · 学习统计</div>
                    <div class="home-card-arrow"><i class="fas fa-chevron-right"></i></div>
                </div>
                <div class="home-card" onclick="switchMainPage('challenge')">
                    <div class="home-card-icon" style="background:linear-gradient(135deg,#f59e0b,#f97316);">
                        <i class="fas fa-gamepad"></i>
                    </div>
                    <div class="home-card-title">闯天关</div>
                    <div class="home-card-desc">闯关挑战 · 计时答题 · 排行榜</div>
                    <div class="home-card-arrow"><i class="fas fa-chevron-right"></i></div>
                </div>
            </div>
        </div>
    </div>

    <!-- 勤学苦练区域 -->
    <div class="study-sub-tabs" id="study-sub-tabs" style="display:none;">
        <button class="sub-tab active" data-stab="learn" onclick="switchStudySubTab('learn')"><i class="fas fa-book-open"></i> 学习</button>
        <button class="sub-tab" data-stab="practice" onclick="switchStudySubTab('practice')"><i class="fas fa-pen-fancy"></i> 练习</button>
        <button class="sub-tab" data-stab="stats" onclick="switchStudySubTab('stats')"><i class="fas fa-chart-line"></i> 统计</button>
    </div>

    <div id="page-study" style="display:none;">

    

    <div id="broadcast-bar" style="display:none;margin:10px 0;padding:12px 18px;background:linear-gradient(135deg,rgba(99,102,241,0.12),rgba(168,85,247,0.12));border:1px solid rgba(99,102,241,0.2);border-radius:12px;overflow:hidden;position:relative;">
        <div style="display:flex;align-items:center;gap:10px;">
            <span style="color:#a78bfa;font-size:0.8rem;flex-shrink:0;"><i class="fas fa-bullhorn"></i></span>
            <div style="flex:1;min-width:0;overflow:hidden;">
                <div id="broadcast-text" style="font-size:0.88rem;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
                <div id="broadcast-title" style="font-size:0.75rem;color:#64748b;margin-top:2px;"></div>
            </div>

        </div>
    </div>
    <div class="tip-box" id="study-tip">
        <div class="tip-title">每日学习小贴士</div>
        <div id="tip-content">每天学习一点，进步一大步！</div>
    </div>

    <div class="learn-cards-row">
        <div style="flex:1;min-width:200px;background:var(--glass);padding:15px;border-radius:15px;border:1px solid rgba(255,255,255,0.05);">
            <div style="font-size:14px;color:var(--text-muted);margin-bottom:8px;">今日学习进度</div>
            <div style="height:8px;background:rgba(30,41,59,0.5);border-radius:4px;overflow:hidden;margin-bottom:8px;">
                <div id="progress-bar" style="height:100%;width:${studyStats.todayWords > 0 ? Math.min(100, (studyStats.todayWords/dailyGoal)*100) : 0}%;background:linear-gradient(90deg,var(--accent),#a78bfa);border-radius:4px;transition:width 0.6s ease;"></div>
            </div>
            <div style="font-size:12px;color:#94a3b8;cursor:pointer;" onclick="showGoalSetting()" title="点击设置学习目标">${studyStats.todayWords}/${dailyGoal} 目标单词 <i class="fas fa-edit" style="font-size:10px;margin-left:3px;"></i></div>
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
        <div style="margin:24px 0;padding:16px 20px;border-radius:14px;border:1px dashed var(--border-subtle);background:var(--accent-subtle);display:flex;align-items:center;gap:16px;" id="learn-inline-controls">
            <div class="sliders-col" style="flex:1;min-width:0;">
                <div class="vslider-box">
                    <div class="vslider-label"><i class="fas fa-gauge-high"></i> 语速</div>
                    <div class="vslider-track-wrap">
                        <input type="range" class="vslider vslider-rate" id="rate-slider" min="1" max="15" value="10" step="1"
                            oninput="setRateFromSlider(this.value)" title="拖动调整语速">
                        <div class="vslider-fill" id="rate-fill"></div>
                        <div class="vslider-thumb" id="rate-thumb"><span id="val-rate">1.0x</span></div>
                    </div>
                    <div class="vslider-range"><span>0.1x</span><span>1.5x</span></div>
                </div>
                <div class="vslider-box">
                    <div class="vslider-label"><i class="fas fa-repeat"></i> 循环</div>
                    <div class="vslider-track-wrap">
                        <input type="range" class="vslider vslider-loop" id="loop-slider" min="0" max="14" value="0" step="1"
                            oninput="setLoopFromSlider(this.value)" title="拖动调整循环次数">
                        <div class="vslider-fill" id="loop-fill"></div>
                        <div class="vslider-thumb" id="loop-thumb"><span id="val-loop">1次</span></div>
                    </div>
                    <div class="vslider-range"><span>1次</span><span>无限</span></div>
                </div>
                <div class="vslider-box">
                    <div class="vslider-label"><i class="fas fa-eye-slash"></i> 答案</div>
                    <div class="vslider-track-wrap" style="flex:0;">
                        <button class="hide-toggle-btn" id="hide-btn" onclick="toggleHide()" title="点击切换显示/隐藏中文翻译" style="width:44px;height:44px;font-size:1.2rem;border:none;background:none;cursor:pointer;">
                            <span id="hide-icon" class="hide-icon-show"><i class="fas fa-eye"></i></span>
                        </button>
                        
                    </div>
                    <div class="vslider-range"><span></span><span></span></div>
                </div>
            </div>
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

    </div><!-- end page-study -->
    <div id="page-study-practice" style="display:none;"></div>
    <div id="page-study-stats" style="display:none;"></div>
    <div id="page-challenge" style="display:none;"></div>

    <div class="copyright" id="copyright">
        仅供学习・禁止商用 © 2026｜联系：
        <span style="color:var(--accent);cursor:pointer;" onclick="openQrModal()">王鹤</span> 
        Ver 2.1 <span class="clickable" onclick="showVersionChangelog()" style="font-size:0.75rem;margin-left:5px;" title="查看更新日志">[更新日志]</span>
        <span class="clickable" onclick="openAdminModal()" style="font-size:0.72rem;margin-left:8px;cursor:pointer;opacity:0.5;" title="管理员入口"><i class="fas fa-cog" style="font-size:0.8rem;"></i></span>
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
            <button onclick="window.open('admin.html','_blank')" style="background:rgba(245,158,11,0.2); color:#f59e0b; border:1px solid rgba(245,158,11,0.3); padding:10px 20px; border-radius:10px; cursor:pointer; font-size:0.85rem;"><i class="fas fa-external-link-alt"></i> 完整后台</button>
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
            <div class="share-tip" id="share-tip">💡 学习小贴士：加载中...</div>
            <div id="share-record-list">
                <div class="share-record" style="text-align:center;color:#94a3b8;font-style:italic;">继续努力，坚持每天学习 💪</div>
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
        document.getElementById('date-time-header').innerText = 
            `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }, 1000);

    // 加载随机推荐单词
    setTimeout(() => {
        loadRandomWord();
    }, 1000);

    // 加载天气信息
    loadWeather();

    // 加载词库（DOM渲染完成后再加载）
    await loadDB();
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

// 加载天气信息（带降级机制）
function loadWeather() {
    const el = document.getElementById('weather-location');
    if (!el) return;
    
    // 优先尝试浏览器Geolocation获取精确位置
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                fetchWeatherByCoords(el, latitude, longitude);
            },
            () => {
                // 定位权限被拒绝或不可用，回退到IP定位
                fetchWeatherByIP(el);
            },
            { timeout: 8000, enableHighAccuracy: false }
        );
    } else {
        fetchWeatherByIP(el);
    }
}

// 通过经纬度获取天气（Open-Meteo，免费无需key）
function fetchWeatherByCoords(el, lat, lon) {
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`)
        .then(r => r.json())
        .then(data => {
            const temp = Math.round(data.current?.temperature_2m ?? 0);
            const code = data.current?.weather_code ?? 0;
            const weather = weatherCodeToText(code);
            const icon = weatherCodeToIcon(code);
            // 反向地理编码获取城市名
            fetchLocationName(lat, lon).then(city => {
                el.innerHTML = `<i class="fas fa-${icon}"></i><span> ${city ? city + ' ' : ''}${temp}℃ ${weather}</span>`;
                const locName = document.getElementById('location-name');
                if (locName) locName.textContent = city || '未知位置';
            });
        })
        .catch(() => fetchWeatherByIP(el));
}

// IP定位获取天气（兜底方案）
function fetchWeatherByIP(el) {
    fetch('https://wttr.in/?format=j1')
        .then(res => {
            if (!res.ok) throw new Error('wttr.in request failed');
            return res.json();
        })
        .then(data => {
            const temp = data.current_condition[0].temp_C;
            const weather = data.current_condition[0].weatherDesc[0].value;
            const area = data.nearest_area[0]?.areaName[0]?.value || '';
            el.innerHTML = `<i class="fas fa-cloud"></i><span> ${area ? area + ' ' : ''}${temp}℃ ${weather}</span>`;
            const locName = document.getElementById('location-name');
            if (locName && area) locName.textContent = area;
        })
        .catch(() => {
            if (CONFIG.amapKey) {
                tryAmapWeather(el);
            } else {
                el.innerHTML = `<i class="fas fa-cloud"></i><span> 天气加载失败</span>`;
                const locFail = document.getElementById('location-name');
                if (locFail) locFail.textContent = '未知';
            }
        });
}

// 反向地理编码（获取城市名）
async function fetchLocationName(lat, lon) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=zh`);
        if (res.ok) {
            const data = await res.json();
            const addr = data.address || {};
            return addr.city || addr.town || addr.county || addr.state || '';
        }
    } catch (e) { /* ignore */ }
    return '';
}

// 天气代码转文字
function weatherCodeToText(code) {
    const map = {0:'晴',1:'晴',2:'多云',3:'多云',45:'雾',48:'雾',51:'小雨',53:'小雨',55:'大雨',61:'小雨',63:'中雨',65:'大雨',71:'小雪',73:'中雪',75:'大雪',80:'阵雨',81:'阵雨',82:'暴雨',95:'雷暴',96:'雷暴'};
    return map[code] || '未知';
}

// 天气代码转图标
function weatherCodeToIcon(code) {
    if (code <= 1) return 'sun';
    if (code <= 3) return 'cloud-sun';
    if (code <= 48) return 'smog';
    if (code <= 65) return 'cloud-rain';
    if (code <= 75) return 'snowflake';
    if (code <= 82) return 'cloud-showers-heavy';
    return 'bolt';
}

function tryAmapWeather(el) {
    // 通过IP获取位置再查天气
    fetch('https://restapi.amap.com/v3/ip?key=' + CONFIG.amapKey)
        .then(r => r.json())
        .then(data => {
            if (data.adcode) {
                return fetch('https://restapi.amap.com/v3/weather/weatherInfo?key=' + CONFIG.amapKey + '&city=' + data.adcode + '&extensions=base');
            }
            throw new Error('no adcode');
        })
        .then(r => r.json())
        .then(data => {
            if (data.lives && data.lives[0]) {
                const w = data.lives[0];
                el.innerHTML = `<i class="fas fa-cloud"></i><span> ${w.city} ${w.temperature}℃ ${w.weather}</span>`;
                // 同步更新location-name
                const locNameAmap = document.getElementById('location-name');
                if (locNameAmap && w.city) locNameAmap.textContent = w.city;
            } else {
                el.innerHTML = `<i class="fas fa-cloud"></i><span> 天气加载失败</span>`;
            }
        })
        .catch(() => {
            el.innerHTML = `<i class="fas fa-cloud"></i><span> 天气加载失败</span>`;
            const locFailCatch = document.getElementById('location-name');
            if (locFailCatch) locFailCatch.textContent = '未知';
        });
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
async function buildMenu() {
    const menuBox = document.getElementById('menu-box');

    // ===== 错题集 & 收藏夹（保持原有逻辑） =====
    const wrongFavs = favs.filter(f => f._wrongBook);
    const normalFavs = favs.filter(f => !f._wrongBook);

    let wrongHTML = wrongFavs.length > 0 ? wrongFavs.map(item => {
        const ri = favs.indexOf(item);
        return '<div style="padding:6px 10px;font-size:13px;color:#fca5a5;display:flex;justify-content:space-between;align-items:center;">' +
            '<span style="cursor:pointer;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" onclick="showFavWord(\'' + item.cat + '\', ' + item.idx + ', \'1\')">' + item.indonesian + ' - ' + item.chinese + '</span>' +
            '<button onclick="deleteFav(' + ri + ', event)" style="background:rgba(248,113,113,0.1);color:#f87171;border:none;padding:2px 6px;border-radius:4px;cursor:pointer;font-size:11px;margin-left:6px;"><i class="fas fa-times"></i></button></div>';
    }).join('') : '<div style="padding:8px;font-size:13px;color:#64748b;">暂无错题</div>';
    wrongHTML += '<div style="padding:6px 10px;margin-top:6px;"><button onclick="clearWrongBook(event)" style="background:rgba(248,113,113,0.1);color:#f87171;border:none;padding:4px 10px;border-radius:5px;cursor:pointer;font-size:11px;"><i class="fas fa-trash-alt"></i> 一键清空</button></div>';

    let favsHTML = normalFavs.length > 0 ? normalFavs.map(item => {
        const ri = favs.indexOf(item);
        return '<div style="padding:6px 10px;font-size:13px;color:#cbd5e1;display:flex;justify-content:space-between;align-items:center;">' +
            '<span style="cursor:pointer;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" onclick="showFavWord(\'' + item.cat + '\', ' + item.idx + ', \'1\')">' + item.indonesian + '</span>' +
            '<button onclick="deleteFav(' + ri + ', event)" style="background:rgba(248,113,113,0.1);color:#f87171;border:none;padding:2px 6px;border-radius:4px;cursor:pointer;font-size:11px;margin-left:6px;"><i class="fas fa-times"></i></button></div>';
    }).join('') : '<div style="padding:8px;font-size:13px;color:#64748b;">暂无收藏</div>';

    let menuHTML = `
    <div class="cat-item">
        <div class="cat-head" style="color:#f87171" onclick="this.nextElementSibling.classList.toggle('active')">
            <span>📝 错题集 (${wrongFavs.length})</span>
            <i class="fas fa-chevron-down"></i> </div>
        <div class="sub-menu">
            ${wrongHTML}
        </div>
    </div>
    <div class="cat-item">
        <div class="cat-head" style="color:#fbbf24" onclick="this.nextElementSibling.classList.toggle('active')">
            <span>⭐ 我的收藏 (${normalFavs.length})</span>
            <i class="fas fa-chevron-down"></i> </div>
        <div class="sub-menu">
            ${favsHTML}
        </div>
    </div>
    `;

    // ===== 课程导航（从 course-content.json 加载） =====
    // 先显示占位，异步加载后更新
    menuHTML += '<div id="course-menu-placeholder"><div style="padding:12px 10px;font-size:13px;color:#64748b;text-align:center;"><i class="fas fa-spinner fa-spin"></i> 加载课程...</div></div>';
    menuBox.innerHTML = menuHTML;

    // 异步加载课程数据
    const courseData = await loadCourseMenuData();
    if (!courseData) {
        const ph = document.getElementById('course-menu-placeholder');
        if (ph) ph.innerHTML = '<div style="padding:12px 10px;font-size:13px;color:#f87171;text-align:center;">课程数据加载失败</div>';
        return;
    }

    const levels = courseData.levels || [];
    let courseMenuHTML = '';

    // 已存在的级别
    for (const lv of levels) {
        let unitsHTML = '';

        // 0级课程：按篇章(chapter)分组展示
        const level0Chapters = [
            { name: '基础发音篇', icon: 'fa-microphone', color: '#f472b6', unitIndices: [0,1,2,3] },
            { name: '问候语与祝福篇', icon: 'fa-handshake', color: '#34d399', unitIndices: [4,5,6,7,8,9] },
            { name: '个人信息与交流篇', icon: 'fa-user-circle', color: '#60a5fa', unitIndices: [10,11,12,13] },
            { name: '同事交流与文化篇', icon: 'fa-building', color: '#fbbf24', unitIndices: [14,15] },
            { name: '饮食与日常用语篇', icon: 'fa-utensils', color: '#fb923c', unitIndices: [16,17,18,19] },
            { name: '购物与交通篇', icon: 'fa-shopping-cart', color: '#a78bfa', unitIndices: [20,21,22,23] },
            { name: '同事交流与时间篇', icon: 'fa-clock', color: '#2dd4bf', unitIndices: [24,25,26,27] },
            { name: '天气形状与形容词篇', icon: 'fa-cloud-sun', color: '#38bdf8', unitIndices: [28,29,30,31,32] },
            { name: '医院与安全篇', icon: 'fa-hospital', color: '#f87171', unitIndices: [33,34,35] },
        ];

        // 生成单元HTML的通用函数
        function buildUnitHTML(lvId, unit) {
            let typesHTML = '';
            const typeMap = [
                { key: 'words', label: '生词', icon: 'fa-spell-check' },
                { key: 'sentences', label: '短句', icon: 'fa-comment-dots' },
                { key: 'dialogues', label: '对话', icon: 'fa-comments' },
            ];
            for (const tm of typeMap) {
                const items = unit[tm.key] || [];
                if (items.length === 0) continue;
                let itemsListHTML = items.map((item, idx) => {
                    const escapedIndo = (item.indonesian || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                    const escapedZh = (item.chinese || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                    let displayText = item.indonesian;
                    if (item.title) displayText = item.title + (item.title_id ? ' (' + item.title_id + ')' : '');
                    return '<div style="padding:5px 10px 5px 20px;font-size:12px;color:#94a3b8;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" ' +
                        'onclick="loadCourseWord(\'' + lvId + '\',\'' + unit.id + '\',\'' + tm.key + '\',' + idx + ')" ' +
                        'title="' + escapedIndo + ' - ' + escapedZh + '">' +
                        (idx + 1) + '. ' + displayText + '</div>';
                }).join('');

                typesHTML += `
                <div style="padding:7px 10px 3px 10px;font-size:13px;color:#a5b4fc;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;" onclick="this.nextElementSibling.classList.toggle('active')">
                    <i class="fas ${tm.icon}" style="font-size:11px;opacity:0.7;"></i> ${tm.label} (${items.length})
                    <i class="fas fa-chevron-right" style="font-size:9px;margin-left:auto;opacity:0.4;transition:transform 0.2s;"></i>
                </div>
                <div class="sub-word-list">${itemsListHTML}</div>`;
            }
            if (!typesHTML) return '';
            return `
                <div style="padding:7px 10px;font-size:13px;color:#e2e8f0;font-weight:600;cursor:pointer;" onclick="this.nextElementSibling.classList.toggle('active')">
                    ${unit.name} <i class="fas fa-chevron-right" style="font-size:9px;margin-left:4px;opacity:0.4;transition:transform 0.2s;"></i>
                </div>
                <div class="sub-menu" style="padding-left:8px;">${typesHTML}</div>`;
        }

        if (String(lv.id) === '0') {
            // 0级：按篇章分组
            for (const ch of level0Chapters) {
                let chUnitsHTML = '';
                for (const uIdx of ch.unitIndices) {
                    if (uIdx < lv.units.length) {
                        chUnitsHTML += buildUnitHTML(lv.id, lv.units[uIdx]);
                    }
                }
                if (chUnitsHTML) {
                    unitsHTML += `
                    <div style="padding:8px 10px;font-size:13px;color:${ch.color};font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;" onclick="this.nextElementSibling.classList.toggle('active')">
                        <i class="fas ${ch.icon}" style="font-size:12px;opacity:0.8;"></i> ${ch.name}
                        <i class="fas fa-chevron-right" style="font-size:9px;margin-left:auto;opacity:0.4;transition:transform 0.2s;"></i>
                    </div>
                    <div class="sub-menu" style="padding-left:6px;">${chUnitsHTML}</div>`;
                }
            }
        } else {
            // 其他级别：直接列出单元（无篇章分组）
            for (const unit of lv.units) {
                unitsHTML += buildUnitHTML(lv.id, unit);
            }
        }
        const lvIcon = lv.icon || 'fa-book';
        const lvColor = lv.color || 'var(--accent)';
        courseMenuHTML += `
        <div class="cat-item">
            <div class="cat-head" onclick="this.nextElementSibling.classList.toggle('active')">
                <span><i class="fas ${lvIcon}" style="color:${lvColor};margin-right:4px;"></i> ${lv.id}级课程 - ${lv.name}</span>
                <i class="fas fa-chevron-down"></i>
            </div>
            <div class="sub-menu">${unitsHTML}</div>
        </div>`;
    }

    // 未建设的级别 (2~7)
    for (let n = levels.length; n <= 7; n++) {
        courseMenuHTML += `
        <div class="cat-item">
            <div class="cat-head" style="opacity:0.4;cursor:default;">
                <span><i class="fas fa-lock" style="margin-right:4px;"></i> ${n}级课程</span>
                <span style="font-size:11px;color:#64748b;">建设中</span>
            </div>
        </div>`;
    }

    // 替换占位
    const ph = document.getElementById('course-menu-placeholder');
    if (ph) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = courseMenuHTML;
        ph.replaceWith(...wrapper.children);
    }
}

// 从侧边栏点击具体单词/短句/对话 → 通过StudyModule加载学习
function loadCourseWord(levelId, unitId, type, index) {
    if (!courseMenuData) return;
    const level = courseMenuData.levels.find(l => String(l.id) === String(levelId));
    if (!level) return;
    const unit = level.units.find(u => u.id === unitId);
    if (!unit) return;
    const items = unit[type] || [];
    if (items.length === 0) return;
    loadCourseItemsToCard(items, index);
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
        // 通过自建 Cloudflare Function 代理，绕过浏览器 CORS 限制
        const proxyUrl = `/api/tts/google?q=${encodeURIComponent(word)}&tl=id`;
        fetch(proxyUrl)
            .then(resp => {
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                return resp.blob();
            })
            .then(blob => {
                const blobUrl = URL.createObjectURL(blob);
                const audio = new Audio(blobUrl);
                audio.onended = () => { URL.revokeObjectURL(blobUrl); resolve(true); };
                audio.onerror = () => { URL.revokeObjectURL(blobUrl); reject('谷歌发音失败'); };
                audio.play().catch(() => { URL.revokeObjectURL(blobUrl); reject('谷歌发音失败'); });
            })
            .catch(err => reject(err));
    });
}

// 语音播放 - 优先谷歌TTS，兜底浏览器speechSynthesis
function toggleSpeech() {
    const word = document.getElementById('disp-indo').innerText;
    const synth = window.speechSynthesis;
    const playIco = document.getElementById('play-ico');
    
    // 停止当前播放
    if (synth.speaking) {
        synth.cancel();
        if (playIco) playIco.className = 'fas fa-play';
        return;
    }

    // 优先使用谷歌翻译发音
    googleSpeech(word).then(() => {
        // 谷歌发音成功结束
        if (playIco) playIco.className = 'fas fa-play';
    }).catch(() => {
        // 谷歌发音失败，兜底浏览器本地合成
        const currentRate = parseFloat(_rate) || 0.8;
        const loopTimes = parseInt(_loop) || 1;
        let loopCount = 1;
        
        function getIdVoice() {
            const voices = speechSynthesis.getVoices();
            let v = voices.find(x => x.lang && x.lang.startsWith('id'));
            if (v) return v;
            v = voices.find(x => x.lang && (x.lang.startsWith('ms') || x.lang.startsWith('msa')));
            return v || null;
        }
        function speakOnce() {
            const utterThis = new SpeechSynthesisUtterance(word);
            utterThis.lang = 'id-ID';
            const idVoice = getIdVoice();
            if (idVoice) utterThis.voice = idVoice;
            utterThis.rate = currentRate;
            utterThis.onend = function() {
                if (loopCount < loopTimes) {
                    loopCount++;
                    speakOnce();
                } else {
                    if (playIco) playIco.className = 'fas fa-play';
                }
            };
            utterThis.onerror = function() {
                if (playIco) playIco.className = 'fas fa-play';
            };
            synth.speak(utterThis);
        }
        speakOnce();
    });

    if (playIco) playIco.className = 'fas fa-pause';
}

// 隐藏答案
function renderCurrent() {
    const hideToggle = { checked: _hideChinese };
    document.getElementById('disp-zh').style.display = hideToggle.checked ? 'none' : 'block';
}

// 更新设置
function updateSetting(k, v) {
    const el = document.getElementById('val-' + k);
    if (el) el.innerText = v + (k === 'rate' ? 'x' : '次');
}

// 圆环控件：语速 1-20 对应 0.1-2.0
// 语速级别：0.5, 0.8, 1.0, 1.2, 1.5, 2.0
const RATE_LEVELS = [0.1, 0.3, 0.5, 0.8, 1.0, 1.2, 1.5];
let _rateIdx = 4; // 默认 1.0
const LOOP_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 0]; // 0 = 无限循环
let _loopIdx = 0; // 默认 1次

// 竖向滑块：语速（1-15 对应 0.1x-1.5x，步进0.1）
function setRateFromSlider(val) {
    const rate = parseInt(val) / 10; // 1->0.1, 10->1.0, 15->1.5
    _rate = rate;
    _rateIdx = parseInt(val) - 1;
    localStorage.setItem('fmi_rate', rate);
    const display = rate.toFixed(1) + 'x';
    const el = document.getElementById('val-rate'); if (el) el.innerText = display;
    const pEl = document.getElementById('p-val-rate'); if (pEl) pEl.innerText = display;
    // 更新滑块填充
    updateSliderFill('rate', (parseInt(val) - 1) / 14);
    updateSliderFill('p-rate', (parseInt(val) - 1) / 14);
    // 同步练习页
    const pSlider = document.getElementById('p-rate-slider');
    if (pSlider) pSlider.value = val;
    updateRing('rate-ring', _rateIdx / (RATE_LEVELS.length - 1));
    updateRing('p-rate-ring', _rateIdx / (RATE_LEVELS.length - 1));
}

// 竖向滑块：循环（0-5 对应 1,3,5,7,9,无限）
const LOOP_DISPLAY = ['1次', '2次', '3次', '4次', '5次', '6次', '7次', '8次', '9次', '10次', '11次', '12次', '13次', '14次', '∞'];
function setLoopFromSlider(val) {
    const idx = parseInt(val);
    _loopIdx = idx;
    _loop = LOOP_LEVELS[idx];
    localStorage.setItem('fmi_loop', _loop);
    const display = LOOP_DISPLAY[idx];
    const el = document.getElementById('val-loop'); if (el) el.innerText = display;
    const pEl = document.getElementById('p-val-loop'); if (pEl) pEl.innerText = display;
    updateSliderFill('loop', idx / 14);
    updateSliderFill('p-loop', idx / 14);
    const pSlider = document.getElementById('p-loop-slider');
    if (pSlider) pSlider.value = val;
    updateRing('loop-ring', _loopIdx / (LOOP_LEVELS.length - 1));
    updateRing('p-loop-ring', _loopIdx / (LOOP_LEVELS.length - 1));
}

// 更新滑块填充高度
function updateSliderFill(type, ratio) {
    const fill = document.getElementById(type + '-fill');
    const thumb = document.getElementById(type + '-thumb');
    if (!fill) return;
    const pct = Math.max(0, Math.min(100, ratio * 100));
    fill.style.width = pct + '%';
    if (thumb) thumb.style.left = 'calc(28px + ' + pct + '% * 0.85)';
}

// 更新圆环进度（练习页兼容）
function updateRing(id, ratio) {
    const el = document.getElementById(id);
    if (!el) return;
    const circumference = 188.5;
    el.style.strokeDashoffset = circumference * (1 - Math.max(0.05, ratio));
}

// 兼容旧函数（练习页仍用 click）
function cycleRate() {
    const slider = document.getElementById('rate-slider');
    if (slider) { slider.value = (_rateIdx + 2) > 15 ? 1 : _rateIdx + 2; setRateFromSlider(slider.value); }
}
function cycleLoop() {
    const slider = document.getElementById('loop-slider');
    if (slider) { slider.value = (_loopIdx + 1) > 14 ? 0 : _loopIdx + 1; setLoopFromSlider(slider.value); }
}

// 隐藏中文切换
function toggleHide() {
    _hideChinese = !_hideChinese;
    const btn = document.getElementById('hide-btn');
    const icon = document.getElementById('hide-icon');
    const status = document.getElementById('hide-status');
    if (_hideChinese) {
        if (icon) icon.className = 'hide-icon-hide';
        if (status) status.textContent = '已隐藏';
        if (btn) btn.classList.add('active');
    } else {
        if (icon) icon.className = 'hide-icon-show';
        if (status) status.textContent = '显示中';
        if (btn) btn.classList.remove('active');
    }
    renderCurrent();
}

// 初始化滑块位置
function initSliders() {
    const savedRate = parseFloat(localStorage.getItem('fmi_rate')) || 1.0;
    const savedLoop = parseInt(localStorage.getItem('fmi_loop')) || 1;
    const rateVal = Math.round(savedRate * 10);
    const loopIdx = LOOP_LEVELS.indexOf(savedLoop);
    const loopVal = loopIdx >= 0 ? loopIdx : (LOOP_LEVELS.indexOf(savedLoop) >= 0 ? LOOP_LEVELS.indexOf(savedLoop) : 0);
    const rateSlider = document.getElementById('rate-slider');
    const loopSlider = document.getElementById('loop-slider');
    if (rateSlider) { rateSlider.value = rateVal; setRateFromSlider(rateVal); }
    if (loopSlider) { loopSlider.value = loopVal; setLoopFromSlider(loopVal); }
}




// 打开管理员弹窗（需后台密码验证）
function openAdminModal() {
    // 从 localStorage 读取管理员设置的后台密码，默认 admin123
    const adminSettings = JSON.parse(localStorage.getItem('fmi_admin_settings') || '{}');
    const storedPass = adminSettings.adminPanelPassword || 'admin123';
    // 创建密码输入弹窗
    const overlay = document.createElement('div');
    overlay.id = 'admin-prompt-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10001;display:flex;justify-content:center;align-items:center;backdrop-filter:blur(10px);';
    overlay.innerHTML = '<div style="background:var(--glass,rgba(17,24,39,0.95));padding:30px;border-radius:25px;border:1px solid rgba(99,102,241,0.2);width:380px;text-align:center;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);"><div style="font-size:2.5rem;color:var(--accent,#6366f1);margin-bottom:15px;"><i class="fas fa-shield-alt"></i></div><h3 style="color:var(--text-main,#f9fafb);margin-bottom:8px;font-size:1.15rem;">后台管理员验证</h3><p style="color:var(--text-muted,#94a3b8);font-size:0.85rem;margin-bottom:20px;">请输入后台管理密码</p><input type="password" id="admin-prompt-pass" placeholder="请输入后台密码" style="width:100%;padding:12px 16px;border-radius:12px;background:rgba(30,41,59,0.5);color:#fff;border:1px solid rgba(255,255,255,0.1);font-size:1rem;outline:none;text-align:center;letter-spacing:2px;margin-bottom:20px;"><div style="display:flex;gap:12px;justify-content:center;"><button onclick="cancelAdminPrompt()" style="padding:10px 25px;border-radius:10px;background:rgba(100,116,139,0.3);color:#94a3b8;border:none;cursor:pointer;font-weight:600;">取消</button><button onclick="verifyAdminPrompt()" style="padding:10px 25px;border-radius:10px;background:var(--accent,#6366f1);color:#fff;border:none;cursor:pointer;font-weight:700;box-shadow:0 10px 15px -3px rgba(99,102,241,0.3);">验证</button></div><p id="admin-prompt-error" style="color:#f87171;font-size:0.8rem;margin-top:12px;display:none;">密码错误，请重试</p></div>';
    overlay.addEventListener('keydown', function(e) { if (e.key === 'Enter') verifyAdminPrompt(); });
    document.body.appendChild(overlay);
    setTimeout(function() { document.getElementById('admin-prompt-pass').focus(); }, 100);
}

function verifyAdminPrompt() {
    const adminSettings = JSON.parse(localStorage.getItem('fmi_admin_settings') || '{}');
    const storedPass = adminSettings.adminPanelPassword || 'admin123';
    const pass = document.getElementById('admin-prompt-pass').value;
    if (pass === storedPass) {
        cancelAdminPrompt();
        // 通过 admin/verify 端点验证并获取 token
        fetch((CONFIG.apiBase || location.origin) + '/api/admin/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ panelPassword: pass })
        }).then(r => r.json()).then(data => {
            // admin.html 使用独立的 admin_fmi_token，不影响当前页面的访客登录状态
            if (data.token) {
                window.open('admin.html?admin_token=' + data.token, '_blank');
            } else {
                window.open('admin.html', '_blank');
            }
        }).catch(() => {
            window.open('admin.html', '_blank');
        });
    } else {
        const errEl = document.getElementById('admin-prompt-error');
        errEl.style.display = 'block';
        errEl.textContent = '密码错误，请重试';
        document.getElementById('admin-prompt-pass').value = '';
        document.getElementById('admin-prompt-pass').focus();
    }
}

function cancelAdminPrompt() {
    const overlay = document.getElementById('admin-prompt-overlay');
    if (overlay) overlay.remove();
}

// 验证管理员密码（旧版白名单弹窗，保留兼容）
function checkAdminPass() {
    const pass = document.getElementById('admin-pass').value;
    const adminSettings = JSON.parse(localStorage.getItem('fmi_admin_settings') || '{}');
    const storedPass = adminSettings.adminPanelPassword || 'admin123';
    if (pass !== storedPass) {
        alert('密码错误！请输入正确的后台管理密码');
        return;
    }
    document.getElementById('admin-step1').style.display = 'none';
    document.getElementById('admin-step2').style.display = 'block';
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
        localStorage.setItem('fmi_whitelist', JSON.stringify(whitelist));
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
        // 同步到KV后端
        syncStudyToKV();
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
    // 更新分享弹窗（同步小贴士和天气，不显示具体单词）
    const shareTip = document.getElementById('share-tip');
    const curTip = window._dailyTip || document.getElementById('tip-content')?.textContent || '坚持学习，每天进步一点点！';
    if (shareTip) shareTip.innerHTML = '💡 学习小贴士：' + curTip;
    // 更新分享卡片中的天气信息
    const shareStats = document.getElementById('share-stats');
    if (shareStats) {
        const weatherEl = document.getElementById('weather-location');
        const weatherText = weatherEl ? weatherEl.textContent.trim() : '本地 27℃ 多云';
        const rate = dailyGoal > 0 ? Math.min(100, Math.floor((studyStats.todayWords / dailyGoal) * 100)) : 0;
        shareStats.querySelector('div').innerHTML =
            '📅 日期：' + today + '<br>' +
            '📚 今日学习：' + studyStats.todayWords + ' 个单词<br>' +
            '⏱ 学习时长：' + Math.floor(studyStats.studySeconds/60) + '分' + (studyStats.studySeconds%60) + '秒<br>' +
            '🎯 完成率：' + rate + '%<br>' +
            '🌤 ' + weatherText;
    }
    // share-record-list 保留鼓励文案不更新
}

// 清空今日记录
// 逐个删除学习记录
function deleteRecord(index) {
    todayRecord.splice(index, 1);
    studyStats.todayWords = todayRecord.length;
    localStorage.setItem('fmi_today_record', JSON.stringify(todayRecord));
    localStorage.setItem('fmi_study_stats', JSON.stringify(studyStats));
    renderTodayRecord();
    updateStats();
}

function clearTodayRecord() {
    if (confirm('确认清空今日学习记录？\n（包括学习时长将一并归零）')) {
        todayRecord = [];
        studyStats.todayWords = 0;
        studyStats.studySeconds = 0;
        studyStats.startTime = new Date().getTime();
        localStorage.setItem('fmi_today_record', JSON.stringify(todayRecord));
        localStorage.setItem('fmi_study_stats', JSON.stringify(studyStats));
        renderTodayRecord();
        updateStats();
        syncStudyToCloud().catch(() => {});
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
    const elStatToday = document.getElementById('stat-today');
    if (elStatToday) elStatToday.innerText = studyStats.todayWords;
    const elStatTotal = document.getElementById('stat-total');
    if (elStatTotal) elStatTotal.innerText = studyStats.totalWords;
    const elStatTime = document.getElementById('stat-time');
    if (elStatTime) elStatTime.innerText = `${Math.floor(studyStats.studySeconds/60)}分${studyStats.studySeconds%60}秒`;
    const elStatRate = document.getElementById('stat-rate');
    if (elStatRate) elStatRate.innerText = studyStats.totalWords > 0 ? Math.floor((studyStats.todayWords/studyStats.totalWords)*100) + '%' : '0%';
    
    // 新增：更新进度条
    const progressPercent = studyStats.todayWords > 0 ? Math.min(100, (studyStats.todayWords/dailyGoal)*100) : 0;
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

// 同步学习数据到KV后端（静默，不影响本地体验）
let syncTimer = null;
function syncStudyToKV() {
    if (!API.isLoggedIn()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
        try {
            const allWords = JSON.parse(localStorage.getItem('fmi_all_words') || '[]');
            await API.saveStudy({
                learnedWords: allWords,
                todayWords: studyStats.todayWords,
                totalWords: studyStats.totalWords,
                studySeconds: studyStats.studySeconds,
                todayRecord: todayRecord,
            });
        } catch(e) { console.warn('KV sync failed:', e); }
    }, 2000); // 2秒防抖
}

// 从KV加载学习数据
async function loadStudyFromKV() {
    if (!API.isLoggedIn()) return;
    try {
        const data = await API.getStats();
        if (data.error) return;
        if (data.learnedWords && data.learnedWords.length > 0) {
            const localWords = JSON.parse(localStorage.getItem('fmi_all_words') || '[]');
            // 合并：取本地和云端的最大集合
            const merged = [...new Set([...localWords, ...data.learnedWords])];
            localStorage.setItem('fmi_all_words', JSON.stringify(merged));
            studyStats.totalWords = merged.length;
            document.getElementById('stat-total').innerText = merged.length;
        }
    } catch(e) { console.warn('KV load failed:', e); }
}

// 切换单词
function navWord(dir) {
    // 课程浏览模式
    if (courseBrowseItems.length > 0) {
        navCourseWord(dir);
        return;
    }
    // 旧词库模式（保留）
    const maxIdx = db[curCat].lessons[curLesson].words.length - 1;
    let newIdx = curIdx + dir;
    if (newIdx < 0) newIdx = maxIdx;
    if (newIdx > maxIdx) newIdx = 0;
    const currentWord = db[curCat].lessons[curLesson].words[curIdx];
    const alreadyLearned = todayRecord.some(item => item.indonesian === currentWord.indonesian);
    if (!alreadyLearned) {
        showLearnConfirm(currentWord, () => {
            addToTodayRecord(currentWord);
            doNavWord(newIdx);
        }, () => {
            doNavWord(newIdx);
        });
    } else {
        doNavWord(newIdx);
    }
}

function doNavWord(newIdx) {
    showWord(curCat, newIdx, curLesson);
    renderTodayRecord();
    updateStats();
}

function showLearnConfirm(word, onYes, onNo) {
    const dialog = document.createElement('div');
    dialog.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:8000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);';
    dialog.innerHTML = `
        <div style="background:var(--glass,rgba(30,41,59,0.95));border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:25px 30px;max-width:380px;width:90%;text-align:center;backdrop-filter:blur(20px);">
            <div style="font-size:1.6rem;margin-bottom:10px;">📝</div>
            <h3 style="color:#fff;font-size:1rem;margin-bottom:8px;">已掌握这个单词？</h3>
            <div style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);border-radius:12px;padding:12px;margin-bottom:18px;">
                <div style="color:#a5b4fc;font-size:1.1rem;font-weight:600;">${word.indonesian}</div>
                <div style="color:#94a3b8;font-size:0.9rem;margin-top:4px;">${word.chinese}</div>
            </div>
            <div style="display:flex;gap:10px;justify-content:center;">
                <button id="lc-no" style="background:rgba(100,116,139,0.2);color:#94a3b8;border:1px solid rgba(100,116,139,0.3);padding:8px 20px;border-radius:10px;cursor:pointer;font-size:0.9rem;">没掌握</button>
                <button id="lc-yes" style="background:rgba(52,211,153,0.15);color:#34d399;border:1px solid rgba(52,211,153,0.3);padding:8px 20px;border-radius:10px;cursor:pointer;font-size:0.9rem;font-weight:600;">已掌握</button>
            </div>
        </div>`;
    document.body.appendChild(dialog);
    dialog.querySelector('#lc-yes').onclick = () => { document.body.removeChild(dialog); onYes(); };
    dialog.querySelector('#lc-no').onclick = () => { document.body.removeChild(dialog); onNo(); };
    dialog.addEventListener('click', (e) => { if (e.target === dialog) { document.body.removeChild(dialog); onNo(); } });
}

// 分享功能
function openShareModal() {
    // 动态更新分享卡片内容（确保同步最新小贴士和天气）
    const tip = window._dailyTip || document.getElementById('tip-content')?.textContent || '坚持学习，每天进步一点点！';
    const weatherEl = document.getElementById('weather-location');
    const weatherText = weatherEl ? weatherEl.textContent.trim() : '本地 27℃ 多云';
    const rate = dailyGoal > 0 ? Math.min(100, Math.floor((studyStats.todayWords / dailyGoal) * 100)) : 0;

    // 更新 share-tip
    const shareTip = document.getElementById('share-tip');
    if (shareTip) {
        shareTip.innerHTML = '💡 学习小贴士：' + tip;
    }

    // 更新 share-stats（重新渲染整个统计区域）
    const shareStats = document.getElementById('share-stats');
    if (shareStats) {
        shareStats.querySelector('div').innerHTML =
            '📅 日期：' + today + '<br>' +
            '📚 今日学习：' + studyStats.todayWords + ' 个单词<br>' +
            '⏱ 学习时长：' + Math.floor(studyStats.studySeconds/60) + '分' + (studyStats.studySeconds%60) + '秒<br>' +
            '🎯 完成率：' + rate + '%<br>' +
            '🌤 ' + weatherText;
    }

    document.getElementById('share-modal').style.display = 'flex';
}

// 复制分享文案（适配朋友圈风格）
function copyShareText() {
    const tip = window._dailyTip || document.getElementById('tip-content')?.textContent || '坚持学习，每天进步一点点！';
    const weatherEl = document.getElementById('weather-location');
    const weatherText = weatherEl ? weatherEl.textContent.trim() : '本地 多云';
    const rate = dailyGoal > 0 ? Math.min(100, Math.floor((studyStats.todayWords / dailyGoal) * 100)) : 0;
    const text = `🇮🇩 印尼语学习打卡｜${today}
✅ 今日学习：${studyStats.todayWords} 个单词
⏰ 学习时长：${Math.floor(studyStats.studySeconds/60)}分${studyStats.studySeconds%60}秒
🎯 完成率：${rate}%
🌤 ${weatherText}

💡 ${tip}

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
    // Send heartbeat every 120 seconds (reduce KV writes)
    _heartbeatTimer = setInterval(async () => {
        try {
            const result = await API.heartbeat();
            if (result.error === 'kicked') return; // handled by API module
        } catch(e) {}
    }, 120000);
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
        if (!info.error) {
            // 缓存系统信息供访客闯天关等逻辑使用
            window._systemInfo = info;
        }
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
function switchMainPage(page) {
    currentPage = page;

    const mainContainer = document.querySelector('.main-container');
    const navTabs = document.getElementById('nav-tabs');
    const sidebar = document.getElementById('sidebar');
    const copyRight = document.getElementById('copyright');
    const studyArea = document.getElementById('study-sub-tabs');
    const pageHome = document.getElementById('page-home');
    const pageStudy = document.getElementById('page-study');
    const pagePractice = document.getElementById('page-study-practice');
    const pageStats = document.getElementById('page-study-stats');
    const pageChallenge = document.getElementById('page-challenge');
    const ctrl = document.getElementById('learn-inline-controls');
    const toggleTab = document.querySelector('.toggle-tab');
    const mainHeader = document.querySelector('.main-container > header');

    // 先全部隐藏
    if (pageHome) pageHome.style.display = 'none';
    if (studyArea) studyArea.style.display = 'none';
    if (pageStudy) pageStudy.style.display = 'none';
    if (pagePractice) pagePractice.style.display = 'none';
    if (pageStats) pageStats.style.display = 'none';
    if (pageChallenge) pageChallenge.style.display = 'none';
    if (ctrl) ctrl.style.display = 'none';

    if (page === 'home') {
        // 主页：隐藏侧边栏、导航栏、header，铺满全屏
        if (pageHome) pageHome.style.display = '';
        if (mainContainer) mainContainer.classList.add('full-width');
        if (navTabs) { navTabs.style.display = 'none'; navTabs.style.justifyContent = ''; }
        if (sidebar) sidebar.style.display = 'none';
        if (toggleTab) toggleTab.style.display = 'none';
        if (mainHeader) mainHeader.style.display = 'none';
        if (copyRight) copyRight.style.display = '';
        // 渲染主页用户状态栏
        renderHomeUserBar();
    } else if (page === 'study') {
        // 勤学苦练：显示侧边栏，导航栏改为返回+标题
        if (mainContainer) {
            if (sidebar && sidebar.classList.contains('collapsed')) {
                mainContainer.classList.add('full-width');
            } else {
                mainContainer.classList.remove('full-width');
            }
        }
        if (navTabs) {
            navTabs.style.display = '';
            navTabs.style.justifyContent = 'flex-end';
            navTabs.innerHTML = `<div class="subpage-nav"><div class="subpage-nav-center"><i class="fas fa-book-open"></i> 勤学苦练</div><button class="subpage-nav-side" onclick="switchMainPage('home')"><i class="fas fa-chevron-left"></i> <span style="font-size:0.82rem;">返回主页</span></button></div>`;
        }
        if (mainHeader) mainHeader.style.display = '';
        if (studyArea) studyArea.style.display = '';
        if (pageStudy) pageStudy.style.display = '';
        const activeSub = document.querySelector('#study-sub-tabs .sub-tab.active');
        const subTab = activeSub ? activeSub.dataset.stab : 'learn';
        if (subTab === 'practice' && pagePractice) pagePractice.style.display = '';
        if (subTab === 'stats' && pageStats) pageStats.style.display = '';
        if (subTab === 'learn' && ctrl) ctrl.style.display = 'flex';
        if (sidebar) sidebar.style.display = '';
        if (toggleTab) toggleTab.style.display = '';
        if (copyRight) copyRight.style.display = '';
        // 延迟初始化子模块
        if (subTab === 'practice') initPracticePage();
        else if (subTab === 'stats') initDashboardPage();

    } else if (page === 'challenge') {
        // 闯天关：访客检查
        const isVisitor = localStorage.getItem('fmi_visitor_login');
        const sysInfo = window._systemInfo || {};
        if (isVisitor && sysInfo.allowVisitorChallenge === false) {
            if (window._showCustomConfirm) {
                window._showCustomConfirm('访客无法使用闯天关功能', '请注册账号后体验完整功能', '我知道了', null, function() {});
            } else {
                alert('访客无法使用闯天关功能，请注册账号后体验。');
            }
            return;
        }
        // 闯天关：隐藏侧边栏，导航栏改为返回+标题
        if (mainContainer) mainContainer.classList.add('full-width');
        if (navTabs) {
            navTabs.style.display = '';
            navTabs.style.justifyContent = 'flex-end';
            navTabs.innerHTML = `<div class="subpage-nav"><div class="subpage-nav-center"><i class="fas fa-gamepad"></i> 闯天关</div><button class="subpage-nav-side" onclick="switchMainPage('home')"><i class="fas fa-chevron-left"></i> <span style="font-size:0.82rem;">返回主页</span></button></div>`;
        }
        if (mainHeader) mainHeader.style.display = '';
        if (pageChallenge) pageChallenge.style.display = '';
        if (sidebar) sidebar.style.display = 'none';
        if (toggleTab) toggleTab.style.display = 'none';
        if (copyRight) copyRight.style.display = '';
        // 延迟初始化
        initChallengePage();
    }
}


function renderHomeUserBar() {
    const bar = document.getElementById('home-user-bar');
    if (!bar) return;
    if (typeof loginStatus !== 'undefined' && loginStatus && loginStatus.user) {
        const isVisitor = localStorage.getItem('fmi_visitor_login');
        const isAdmin = loginStatus.user && loginStatus.user.username === 'admin';
        // 访客只隐藏注销账号，保留退出登录
        const logoutHTML = `
                        <div onclick="logout();toggleUserMenu();" style="padding:10px 14px;border-radius:8px;cursor:pointer;color:#e2e8f0;font-size:0.85rem;display:flex;align-items:center;gap:8px;transition:background 0.2s;" onmouseover="this.style.background='rgba(248,113,113,0.1)'" onmouseout="this.style.background='transparent'">
                            <i class="fas fa-sign-out-alt" style="color:#f87171;width:16px;text-align:center;"></i> 退出登录
                        </div>${!isVisitor ? `
                        <div style="height:1px;background:rgba(255,255,255,0.06);margin:4px 0;"></div>
                        <div id="home-delete-account-item" onclick="showDeleteAccountDialog();toggleUserMenu();" style="padding:10px 14px;border-radius:8px;cursor:pointer;color:#ef4444;font-size:0.85rem;display:flex;align-items:center;gap:8px;transition:background 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.1)'" onmouseout="this.style.background='transparent'">
                            <i class="fas fa-user-slash" style="width:16px;text-align:center;"></i> 注销账号
                        </div>` : ''}`;
        // 管理员也隐藏注销账号
        const finalLogoutHTML = isAdmin ? logoutHTML.replace(/<div id="home-delete-account-item"[^>]*>[\s\S]*?<\/div>\s*$/, '') : logoutHTML;
        bar.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:8px 4px;">
                <div style="display:flex;align-items:center;gap:14px;color:#94a3b8;font-size:0.82rem;flex-wrap:wrap;">
                    <span id="home-date-time">${new Date().toLocaleString()}</span>
                    <span id="home-weather-location"><i class="fas fa-cloud"></i> <span id="home-weather-text">加载中...</span></span>
                </div>
                <div style="position:relative;">
                    <span onclick="toggleUserMenu()" style="cursor:pointer;display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px;transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                        <i class="fas fa-user-circle" style="color:#a5b4fc;font-size:1.1rem;"></i>
                        欢迎，${loginStatus.user.name}
                        <i class="fas fa-chevron-down" style="font-size:0.65rem;color:#64748b;"></i>
                    </span>
                    <div id="user-dropdown-home" style="display:none;position:absolute;top:100%;right:0;margin-top:8px;background:rgba(30,41,59,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:6px;min-width:150px;z-index:9999;backdrop-filter:blur(20px);box-shadow:0 10px 40px rgba(0,0,0,0.6);">
                        ${finalLogoutHTML}
                    </div>
                </div>
            </div>`;
        // 同步天气信息到主页
        syncHomeWeather();
    } else {
        bar.innerHTML = `<span style="color:#94a3b8;font-size:0.9rem;">加载中...</span>`;
    }
}

// 同步天气信息到主页user-bar
function syncHomeWeather() {
    const weatherEl = document.getElementById('weather-location');
    const homeWeatherText = document.getElementById('home-weather-text');
    if (weatherEl && homeWeatherText) {
        // 监听weather-location变化
        const observer = new MutationObserver(() => {
            const span = weatherEl.querySelector('span');
            if (span && homeWeatherText) {
                homeWeatherText.textContent = span.textContent;
            }
        });
        observer.observe(weatherEl, { childList: true, subtree: true });
        // 立即同步一次
        const span = weatherEl.querySelector('span');
        if (span) homeWeatherText.textContent = span.textContent;
    }
}

// 兼容旧代码中可能调用的 switchPage
function switchPage(page) { switchMainPage(page); }

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
    const c = document.getElementById('page-study-practice');
    if (c.dataset.init) return;
    c.dataset.init = '1';
    let catOpts = '';
    for (const catId in db) {
        const n = catId === "1" ? "生词 Vocabulary" : catId === "2" ? "短语 Phrases" : catId;
        catOpts += '<option value="' + catId + '">' + catId + '. ' + n + '</option>';
    }
    c.innerHTML = `<header style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;"><h1 class="main-title">印尼语学习助手</h1></header><div class="practice-container" style="max-width:100%;"><div id="practice-setup"><div style="text-align:center;margin-bottom:25px;"><h2 style="font-size:1.5rem;font-weight:800;color:var(--text-main);"><i class="fas fa-pen-fancy" style="color:var(--accent);margin-right:8px;"></i>练习模式</h2></div><div style="margin-bottom:20px;"><div style="color:var(--text-muted);font-size:0.9rem;margin-bottom:10px;">选择词库分类</div><select id="practice-cat-select" style="width:100%;padding:12px;border-radius:10px;background:var(--input-bg);color:var(--text-main);border:1px solid var(--border-light);font-size:0.95rem;outline:none;"><option value="all">全部词库</option>' + catOpts + '</select></div><div style="margin-bottom:20px;"><div style="color:var(--text-muted);font-size:0.9rem;margin-bottom:10px;">选择练习类型</div><div class="practice-type-selector"><button class="practice-type-btn active" onclick="selectPracticeType('choice',this)"><i class="fas fa-th-large"></i> 选择题</button><button class="practice-type-btn" onclick="selectPracticeType('fill',this)"><i class="fas fa-keyboard"></i> 填空题</button><button class="practice-type-btn" onclick="selectPracticeType('listen',this)"><i class="fas fa-headphones"></i> 听力题</button></div></div><div style="margin-bottom:20px;padding:14px 18px;border-radius:14px;border:1px dashed var(--border-subtle);background:var(--accent-subtle);display:flex;align-items:center;gap:16px;padding:16px 20px;border-radius:14px;">
            <label style="display:flex;align-items:center;gap:12px;cursor:pointer;color:var(--text-main);font-size:1rem;font-weight:600;">
                <input type="checkbox" id="practice-learned-only" style="width:22px;height:22px;accent-color:var(--accent);cursor:pointer;">
                <i class="fas fa-check-double" style="color:var(--accent);"></i>
                仅练习已掌握内容
            </label>
            <span id="practice-learned-count" style="color:var(--accent);font-size:0.9rem;font-weight:600;"></span>
        </div>
        <div style="margin-bottom:20px;"><div style="color:var(--text-muted);font-size:0.9rem;margin-bottom:10px;">题目数量</div><div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="practice-type-btn" onclick="selectPracticeCount(10,this)">10题</button><button class="practice-type-btn active" onclick="selectPracticeCount(20,this)">20题</button><button class="practice-type-btn" onclick="selectPracticeCount(50,this)">50题</button><button class="practice-type-btn" onclick="selectPracticeCount(0,this)">全部</button></div></div><div style="margin:24px 0;padding:16px 20px;border-radius:14px;border:1px dashed var(--border-subtle);background:var(--accent-subtle);display:flex;align-items:center;gap:16px;">
            <div class="sliders-col" style="flex:1;min-width:0;">
                <div class="vslider-box">
                    <div class="vslider-label"><i class="fas fa-gauge-high"></i> 语速</div>
                    <div class="vslider-track-wrap">
                        <input type="range" class="vslider vslider-rate" id="p-rate-slider" min="1" max="15" value="10" step="1" oninput="setRateFromSlider(this.value)">
                        <div class="vslider-fill" id="p-rate-fill"></div>
                        <div class="vslider-thumb" id="p-rate-thumb"><span id="p-val-rate">1.0x</span></div>
                    </div>
                    <div class="vslider-range"><span>0.1x</span><span>1.5x</span></div>
                </div>
                <div class="vslider-box">
                    <div class="vslider-label"><i class="fas fa-repeat"></i> 循环</div>
                    <div class="vslider-track-wrap">
                        <input type="range" class="vslider vslider-loop" id="p-loop-slider" min="0" max="14" value="0" step="1" oninput="setLoopFromSlider(this.value)">
                        <div class="vslider-fill" id="p-loop-fill"></div>
                        <div class="vslider-thumb" id="p-loop-thumb"><span id="p-val-loop">1次</span></div>
                    </div>
                    <div class="vslider-range"><span>1次</span><span>无限</span></div>
                </div>
            </div>
        </div>
        <button class="practice-start-btn" onclick="startPractice()" style="width:100%;padding:14px;font-size:1.1rem;"><i class="fas fa-play"></i> 开始练习</button></div><div id="practice-quiz" style="display:none;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;"><div style="color:var(--text-main);font-weight:700;">练习中</div><div style="color:var(--text-muted);font-size:0.9rem;" id="practice-progress">1/20</div></div><div class="practice-score-bar"><div class="practice-score-item"><span class="score-val" id="p-correct">0</span>正确</div><div class="practice-score-item"><span class="score-val" id="p-wrong">0</span>错误</div><div class="practice-score-item"><span class="score-val" id="p-accuracy">0%</span>正确率</div></div><div class="practice-question-box"><div id="p-question-label" style="color:var(--text-muted);font-size:0.9rem;margin-bottom:8px;">请选择正确的中文翻译</div><div id="p-question-word" style="font-size:2.5rem;font-weight:800;color:var(--text-main);margin-bottom:20px;padding:15px 0;">加载中...</div><div id="p-question-hint" style="color:var(--text-dim);font-size:0.85rem;"></div></div><div id="p-options" class="practice-options"></div><div id="p-input-box" style="display:none;"><input type="text" class="practice-input" id="p-fill-input" placeholder="输入中文翻译..." autocomplete="off" style="width:100%;padding:12px;border-radius:10px;background:var(--input-bg);color:var(--text-main);border:1px solid var(--border-light);font-size:1rem;outline:none;"><button class="practice-start-btn" onclick="submitFillAnswer()" style="margin-top:10px;width:100%;">提交答案</button></div><div id="p-feedback" class="practice-feedback"></div><div style="display:flex;gap:12px;justify-content:center;margin-top:20px;"><button class="practice-btn-sec" onclick="endPractice()">结束练习</button><button class="practice-start-btn" id="p-next-btn" onclick="nextQuestion()" style="display:none;">下一题 <i class="fas fa-arrow-right"></i></button></div></div><div id="practice-result" style="display:none;"><div style="text-align:center;padding:30px;"><div id="p-result-score" style="font-size:4rem;font-weight:900;color:var(--accent);">0%</div><div id="p-result-text" style="color:var(--text-muted);font-size:1.1rem;margin:10px 0 20px;">练习完成！</div><div style="display:flex;gap:20px;justify-content:center;margin-bottom:25px;"><div style="text-align:center;"><div style="font-size:1.5rem;font-weight:800;color:#10b981;" id="p-r-correct">0</div><div style="color:var(--text-dim);font-size:0.8rem;">正确</div></div><div style="text-align:center;"><div style="font-size:1.5rem;font-weight:800;color:#ef4444;" id="p-r-wrong">0</div><div style="color:var(--text-dim);font-size:0.8rem;">错误</div></div><div style="text-align:center;"><div style="font-size:1.5rem;font-weight:800;color:var(--text-main);" id="p-r-total">0</div><div style="color:var(--text-dim);font-size:0.8rem;">总题数</div></div></div><div style="display:flex;gap:12px;justify-content:center;"><button class="practice-btn-sec" onclick="showWrongWords()">查看错题</button><button id="lb-submit-btn" style="display:none;padding:10px 20px;background:#f59e0b;color:#000;border:none;border-radius:10px;cursor:pointer;font-weight:700;font-size:0.9rem;" onclick="submitToLeaderboard()"><i class="fas fa-trophy"></i> 提交到排行榜</button><button class="practice-start-btn" onclick="resetPractice()">再来一次</button></div></div></div></div>`;
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
        // 自动加入错题集（收藏夹）
        addToWrongBook(q);
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
        // 自动加入错题集（收藏夹）
        addToWrongBook(q);
    }
    document.getElementById('p-next-btn').style.display = 'inline-flex';
    const t = practiceState.currentIndex + 1;
    document.getElementById('p-correct').textContent = practiceState.score;
    document.getElementById('p-wrong').textContent = t - practiceState.score;
    document.getElementById('p-accuracy').textContent = Math.round((practiceState.score / t) * 100) + '%';
}
function nextQuestion() { practiceState.currentIndex++; showQuestion(); }
function endPractice() {
    if (practiceState.currentIndex === 0 && !practiceState.answered) {
        if (!confirm('还没答题，确定要结束吗？')) return;
    }
    finishPractice();
}
function finishPractice() {
    practiceState.isFinished = true;
    const s = practiceState;
    const answered = s.currentIndex; // 已答题数
    const total = Math.max(answered, s.score + s.wrongWords.length);
    const pct = total > 0 ? Math.round((s.score / total) * 100) : 0;
    document.getElementById('practice-quiz').style.display = 'none';
    document.getElementById('practice-result').style.display = 'block';
    document.getElementById('p-result-score').textContent = pct + '%';
    document.getElementById('p-r-correct').textContent = s.score;
    document.getElementById('p-r-wrong').textContent = s.wrongWords.length;
    document.getElementById('p-r-total').textContent = answered > 0 ? answered : '—';
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
    // 爱好者前端拦截
    // loginStatus 已在函数开头声明
    if (loginStatus.user && loginStatus.user.userType === 'hobby') {
        alert('爱好者不能参与排行榜');
        return;
    }
    const s = practiceState;
    const answered = s.currentIndex; // 已答题数
    const total = Math.max(answered, s.score + s.wrongWords.length);
    const pct = total > 0 ? Math.round((s.score / total) * 100) : 0;
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
// 错题自动加入错题集
function addToWrongBook(word) {
    if (!word || !word.indonesian) return;
    const exists = favs.some(f => f.indonesian === word.indonesian && f._wrongBook);
    if (!exists) {
        favs.push({
            cat: 'wrong',
            lesson: 'wrong',
            idx: Date.now(),
            indonesian: word.indonesian,
            chinese: word.chinese,
            _wrongBook: true
        });
        localStorage.setItem('fmi_v1_favs', JSON.stringify(favs));
        buildMenu();
    }
}

// 错题自动加入错题集
function addToWrongBook(word) {
    if (!word || !word.indonesian) return;
    const exists = favs.some(f => f.indonesian === word.indonesian && f._wrongBook);
    if (!exists) {
        favs.push({ cat: 'wrong', lesson: 'wrong', idx: Date.now(), indonesian: word.indonesian, chinese: word.chinese, _wrongBook: true });
        localStorage.setItem('fmi_v1_favs', JSON.stringify(favs));
        buildMenu();
    }
}

// 清空错题集
function clearWrongBook(event) {
    if (event) event.stopPropagation();
    if (confirm('确认清空错题集？')) {
        favs = favs.filter(f => !f._wrongBook);
        localStorage.setItem('fmi_v1_favs', JSON.stringify(favs));
        buildMenu();
    }
}

function showWrongWords() {
    if (practiceState.wrongWords.length === 0) {
        showNotice('全部正确，没有错题！');
        return;
    }
    const dialog = document.createElement('div');
    dialog.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:8000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);';
    let wordList = practiceState.wrongWords.map((w, i) =>
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.05);">' +
        '<span style="color:#fca5a5;font-weight:600;">' + (i+1) + '. ' + w.indonesian + '</span>' +
        '<span style="color:#94a3b8;">' + w.chinese + '</span></div>'
    ).join('');
    dialog.innerHTML =
        '<div style="background:rgba(30,41,59,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:25px;max-width:450px;width:90%;backdrop-filter:blur(20px);">' +
        '<div style="text-align:center;margin-bottom:15px;"><span style="font-size:2rem;">📝</span><h3 style="color:#fff;margin:8px 0 5px;">错题列表</h3><p style="color:#f87171;font-size:0.9rem;">共 ' + practiceState.wrongWords.length + ' 道错题</p></div>' +
        '<div style="max-height:300px;overflow-y:auto;border-radius:12px;border:1px solid rgba(255,255,255,0.05);margin-bottom:15px;">' + wordList + '</div>' +
        '<div style="text-align:center;color:#94a3b8;font-size:0.8rem;margin-bottom:15px;">错题已自动加入错题集</div>' +
        '<button onclick="document.body.removeChild(this.closest(\'[style*=fixed]\'))" style="width:100%;padding:10px;background:rgba(99,102,241,0.2);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3);border-radius:10px;cursor:pointer;font-weight:600;">关闭</button></div>';
    document.body.appendChild(dialog);
    dialog.addEventListener('click', (e) => { if (e.target === dialog) document.body.removeChild(dialog); });
}

function showNotice(msg) {
    const dialog = document.createElement('div');
    dialog.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:8000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);';
    dialog.innerHTML = '<div style="background:rgba(30,41,59,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:25px 35px;text-align:center;"><div style="font-size:2.5rem;margin-bottom:10px;">🎉</div><p style="color:#e2e8f0;font-size:1rem;">' + msg + '</p><button onclick="document.body.removeChild(this.closest(\'[style*=fixed]\'))" style="margin-top:15px;padding:8px 25px;background:rgba(52,211,153,0.2);color:#34d399;border:1px solid rgba(52,211,153,0.3);border-radius:8px;cursor:pointer;font-weight:600;">好的</button></div>';
    document.body.appendChild(dialog);
    dialog.addEventListener('click', (e) => { if (e.target === dialog) document.body.removeChild(dialog); });
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
    const c = document.getElementById('page-study-stats');
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
            return '<div class="dash-history-item"><div class="dash-history-date">' + h.date + '</div><div class="dash-history-type">' + tn + '</div><div class="dash-history-score" style="color:' + clr + ';">' + h.score + '/' + h.total + ' (' + h.percent + '%)</div><div class="copyright" id="dash-copyright" style="margin-top:30px;">仅供学习・禁止商用 © 2026｜联系：<span style="color:var(--accent);cursor:pointer;" onclick="openQrModal()">王鹤</span> Ver 2.1 <span class="clickable" onclick="openAdminModal()" style="font-size:0.72rem;margin-left:8px;cursor:pointer;opacity:0.5;" title="管理员入口"><i class="fas fa-cog" style="font-size:0.8rem;"></i></span></div></div>';
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
    c.innerHTML = '<div style="margin:0 auto;max-width:100%;"><header style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:10px;"><h1 class="main-title">印尼语学习助手</h1></header><div style="text-align:center;margin-bottom:25px;"><h2 style="font-size:1.8rem;font-weight:800;color:var(--text-main);display:inline-block;"><i class="fas fa-chart-line" style="color:var(--accent);margin-right:10px;"></i>学习统计</h2><button onclick="clearStudyData()" style="margin-left:15px;background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);padding:6px 14px;border-radius:8px;cursor:pointer;font-size:0.8rem;vertical-align:middle;"><i class="fas fa-trash-alt" style="margin-right:5px;"></i>清空统计</button><p style="color:var(--text-muted);font-size:0.95rem;margin-top:5px;">' + today + ' · 数据总览</p></div><div class="dash-stats-grid"><div class="dash-card" style="border-top:3px solid var(--accent);"><div style="font-size:1.8rem;color:var(--accent);margin-bottom:10px;"><i class="fas fa-book"></i></div><div class="dash-card-value">' + studyStats.todayWords + '</div><div class="dash-card-label">今日学习</div><div class="dash-card-sub">目标 ' + dailyGoal + ' 词 <span style="font-size:0.7rem;color:#64748b;margin-left:4px;cursor:pointer;border-bottom:1px dashed #64748b;" onclick="showGoalSetting()">修改</span></div></div><div class="dash-card" style="border-top:3px solid #f59e0b;"><div style="font-size:1.8rem;color:#f59e0b;margin-bottom:10px;"><i class="fas fa-clock"></i></div><div class="dash-card-value">' + mins + '<span style="font-size:0.7em;color:var(--text-muted);">分' + secs + '秒</span></div><div class="dash-card-label">在线时长</div><div class="dash-card-sub">今日累计</div></div><div class="dash-card" style="border-top:3px solid #10b981;"><div style="font-size:1.8rem;color:#10b981;margin-bottom:10px;"><i class="fas fa-layer-group"></i></div><div class="dash-card-value">' + learnedN + '<span style="font-size:0.7em;color:var(--text-muted);">/' + totalLib + '</span></div><div class="dash-card-label">累计掌握</div><div class="dash-card-sub">总词汇量</div></div><div class="dash-card" style="border-top:3px solid #a78bfa;"><div style="font-size:1.8rem;color:#a78bfa;margin-bottom:10px;"><i class="fas fa-bullseye"></i></div><div class="dash-card-value">' + learnedPct + '%</div><div class="dash-card-label">掌握率</div><div class="dash-card-sub">' + learnedN + '/' + totalLib + ' 词</div></div></div><div class="dash-section"><div class="dash-section-title"><i class="fas fa-tasks" style="color:var(--accent);margin-right:8px;"></i>词汇掌握进度</div><div class="dash-progress-bar"><div class="dash-progress-fill" style="width:' + learnedPct + '%;"></div></div><div class="dash-progress-labels"><span>已掌握 ' + learnedN + ' 词</span><span>总词汇量 ' + totalLib + ' 词</span></div><div style="margin-top:20px;">' + catBreakdown + '</div></div><div class="dash-section"><div class="dash-section-title"><i class="fas fa-history" style="color:var(--accent);margin-right:8px;"></i>练习历史</div><div class="dash-mini-grid"><div class="dash-mini-card"><div class="dash-mini-value">' + totalP + '</div><div class="dash-mini-label">练习次数</div></div><div class="dash-mini-card"><div class="dash-mini-value">' + avgS + '%</div><div class="dash-mini-label">平均正确率</div></div></div><div class="dash-history-list">' + histHTML + '</div></div><div class="dash-section"><div class="dash-section-title"><i class="fas fa-list-check" style="color:var(--accent);margin-right:8px;"></i>今日已学单词</div><div class="dash-words-grid">' + wordsHTML + '</div></div><div class="copyright" id="dash-copyright" style="margin-top:30px;">仅供学习・禁止商用 © 2026｜联系：<span style="color:var(--accent);cursor:pointer;" onclick="openQrModal()">王鹤</span> Ver 2.1 <span class="clickable" onclick="openAdminModal()" style="font-size:0.72rem;margin-left:8px;cursor:pointer;opacity:0.5;" title="管理员入口"><i class="fas fa-cog" style="font-size:0.8rem;"></i></span></div></div>';
}

// 设置每日学习目标（弹窗形式）
function showGoalSetting() {
    const current = dailyGoal;
    const presets = [5, 10, 15, 20, 30, 50];
    const dialog = document.createElement('div');
    dialog.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:8000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);';
    dialog.innerHTML = `
        <div style="background:var(--glass,rgba(30,41,59,0.95));border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:30px;max-width:400px;width:90%;text-align:center;backdrop-filter:blur(20px);">
            <div style="font-size:2rem;margin-bottom:10px;">🎯</div>
            <h3 style="color:#fff;font-size:1.1rem;margin-bottom:5px;">设置今日学习目标</h3>
            <p style="color:#94a3b8;font-size:0.85rem;margin-bottom:20px;">当前目标：${current} 个单词</p>
            <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:20px;">
                ${presets.map(n => `<button class="goal-preset" onclick="applyGoal(${n})" style="padding:8px 16px;border-radius:10px;cursor:pointer;font-size:0.9rem;font-weight:600;transition:all 0.2s;${n === current ? 'background:rgba(99,102,241,0.3);color:#a5b4fc;border:1px solid rgba(99,102,241,0.5);' : 'background:rgba(255,255,255,0.05);color:#94a3b8;border:1px solid rgba(255,255,255,0.1);'}">${n}词</button>`).join('')}
            </div>
            <div style="display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:20px;">
                <span style="color:#94a3b8;font-size:0.85rem;">自定义：</span>
                <input type="number" id="goal-custom-input" value="${current}" min="1" max="999" style="width:70px;text-align:center;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;border-radius:8px;padding:6px;font-size:1rem;font-weight:600;">
                <span style="color:#94a3b8;font-size:0.85rem;">词</span>
            </div>
            <div style="display:flex;gap:10px;justify-content:center;">
                <button onclick="document.body.removeChild(this.closest('[style*=fixed]'))" style="background:rgba(100,116,139,0.2);color:#94a3b8;border:1px solid rgba(100,116,139,0.3);padding:8px 20px;border-radius:10px;cursor:pointer;">取消</button>
                <button onclick="applyGoal(parseInt(document.getElementById('goal-custom-input').value));document.body.removeChild(this.closest('[style*=fixed]'))" style="background:rgba(52,211,153,0.15);color:#34d399;border:1px solid rgba(52,211,153,0.3);padding:8px 20px;border-radius:10px;cursor:pointer;font-weight:600;">确定</button>
            </div>
        </div>`;
    document.body.appendChild(dialog);
}

function applyGoal(n) {
    if (n && n > 0) {
        dailyGoal = n;
        localStorage.setItem('fmi_daily_goal', n);
        updateStats();
        // 刷新学习区进度显示
        const progressArea = document.querySelector('.learn-cards-row div:first-child div:last-child');
        // 刷新统计页
        if (currentPage === 'dashboard') initDashboardPage();
    }
}

// 首次登录或目标未设置时自动弹出目标设置
function checkFirstGoalSetting() {
    const goalSet = localStorage.getItem('fmi_daily_goal');
    if (!goalSet) {
        setTimeout(() => showGoalSetting(), 500);
    }
}

// 清空学习统计数据（带二次确认）
function clearStudyData() {
    // 创建确认弹窗
    const dialog = document.createElement('div');
    dialog.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;';
    dialog.innerHTML = `
        <div style="background:var(--glass,rgba(30,41,59,0.95));border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:30px;max-width:400px;width:90%;text-align:center;backdrop-filter:blur(20px);">
            <div style="font-size:2.5rem;margin-bottom:15px;">⚠️</div>
            <h3 style="color:#fff;font-size:1.1rem;margin-bottom:12px;">确认清空学习统计？</h3>
            <p style="color:#94a3b8;font-size:0.9rem;line-height:1.6;margin-bottom:25px;">
                将清空以下数据：<br>
                <span style="color:#f87171;">• 今日学习记录</span><br>
                <span style="color:#f87171;">• 学习时长</span><br>
                <span style="color:#f87171;">• 累计掌握词汇</span><br>
                <span style="color:#6b7280;font-size:0.8rem;">（清空后不可恢复）</span>
            </p>
            <div style="display:flex;gap:12px;justify-content:center;">
                <button id="csd-cancel" style="background:#475569;color:white;border:none;padding:10px 25px;border-radius:12px;cursor:pointer;font-size:0.95rem;">取消</button>
                <button id="csd-confirm" style="background:#ef4444;color:white;border:none;padding:10px 25px;border-radius:12px;cursor:pointer;font-size:0.95rem;">确认清空</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);

    dialog.querySelector('#csd-cancel').onclick = () => document.body.removeChild(dialog);
    dialog.querySelector('#csd-confirm').onclick = () => {
        // 清空所有学习相关数据
        todayRecord = [];
        studyStats = { todayWords: 0, totalWords: 0, studySeconds: 0, startTime: new Date().getTime() };
        localStorage.removeItem('fmi_today_record');
        localStorage.removeItem('fmi_study_stats');
        localStorage.removeItem('fmi_all_words');
        localStorage.removeItem('fmi_study_date');
        localStorage.removeItem('fmi_practice_history');
        localStorage.removeItem('fmi_learned_words');
        // 保留 dailyGoal 设置不清空
        // 同步到云端
        syncStudyToCloud().catch(() => {});
        document.body.removeChild(dialog);
        // 刷新界面
        initDashboardPage();
        renderTodayRecord();
        updateStats();
        const rst = document.getElementById('stat-today');
        if (rst) rst.innerText = '0';
        const rsto = document.getElementById('stat-total');
        if (rsto) rsto.innerText = '0';
        const rsti = document.getElementById('stat-time');
        if (rsti) rsti.innerText = '0分0秒';
        const rstr = document.getElementById('stat-rate');
        if (rstr) rstr.innerText = '0%';
        document.getElementById('progress-bar').style.width = '0%';
    };
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

// ========== 前台广播功能 ==========
async function loadBroadcasts() {
    try {
        // 先读取广播配置
        let bcConfig = { enabled: true, allowClose: false, interval: 8 };
        try {
            const cfgRes = await fetch((CONFIG.apiBase || location.origin) + '/api/broadcast/config');
            if (cfgRes.ok) bcConfig = { ...bcConfig, ...await cfgRes.json() };
        } catch(e) {}

        // 如果未启用广播，直接返回
        if (!bcConfig.enabled) return;

        const res = await fetch((CONFIG.apiBase || location.origin) + '/api/broadcast/active');
        if (!res.ok) return;
        const data = await res.json();
        if (!data || !data.broadcasts || data.broadcasts.length === 0) return;

        const broadcasts = data.broadcasts.filter(b => {
            if (!b.isActive) return false;
            const now = new Date().toISOString().slice(0, 10);
            if (b.startDate && b.startDate > now) return false;
            if (b.endDate && b.endDate < now) return false;
            return true;
        });

        if (broadcasts.length === 0) return;

        const bar = document.getElementById('broadcast-bar');
        if (!bar) return;

        // 根据配置动态创建/移除关闭按钮
        let closeBtn = document.getElementById('broadcast-close-btn');
        if (bcConfig.allowClose && !closeBtn) {
            closeBtn = document.createElement('button');
            closeBtn.id = 'broadcast-close-btn';
            closeBtn.style.cssText = 'background:none;border:none;color:#64748b;cursor:pointer;font-size:0.8rem;flex-shrink:0;padding:4px;';
            closeBtn.innerHTML = '<i class="fas fa-times"></i>';
            closeBtn.onclick = function() { bar.style.display = 'none'; };
            bar.querySelector('div').appendChild(closeBtn);
        } else if (!bcConfig.allowClose && closeBtn) {
            closeBtn.remove();
        }

        // 显示第一条广播
        const bc = broadcasts[0];
        document.getElementById('broadcast-text').textContent = bc.content || '';
        document.getElementById('broadcast-title').textContent = bc.title || '';
        bar.style.display = '';

        // 如果有多条，自动轮播
        if (broadcasts.length > 1) {
            const interval = (bcConfig.interval || 8) * 1000;
            let idx = 0;
            setInterval(() => {
                idx = (idx + 1) % broadcasts.length;
                const current = broadcasts[idx];
                const textEl = document.getElementById('broadcast-text');
                const titleEl = document.getElementById('broadcast-title');
                if (textEl && titleEl && bar.style.display !== 'none') {
                    textEl.textContent = current.content || '';
                    titleEl.textContent = current.title || '';
                }
            }, interval);
        }
    } catch(e) {}
}
// 预加载浏览器语音列表（speechSynthesis.getVoices 首次可能返回空数组）
if (window.speechSynthesis) {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = function() { speechSynthesis.getVoices(); };
}

window.onload = async function() {
    // 自动初始化默认管理员（仅首次）
    try { await fetch(API_BASE + 'admin/init-users', { method: 'POST' }); } catch(e) {}
    await loadWhitelist(); // 先加载白名单
    checkLoginStatus(); // 优先拦截未登录状态进行跳转
    initUI();           // 渲染界面结构
    switchMainPage('home'); // 默认显示主页
    setTimeout(initSliders, 200); // 初始化滑块控件
    checkLoginStatus(); // 界面渲染完毕后，二次调用以安全写入用户名
    updateStats();
    loadBroadcasts();

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
            <div style="border-left:3px solid #f59e0b;padding:15px 20px;margin-bottom:15px;border-radius:0 10px 10px 0;">
                <div style="color:#fbbf24;font-weight:700;margin-bottom:8px;">Ver 2.1 (2026-04-29)</div>
                <ul style="color:#cbd5e1;font-size:0.9rem;line-height:1.8;padding-left:18px;">
                    <li>修复：0级课程36个单元按篇章分组展示</li>
                    <li>修复：侧边栏课程导航点击直达内容</li>
                    <li>修复：主页"加载中"改为显示登录信息</li>
                    <li>修复：天气定位改为GPS优先，IP定位兜底</li>
                    <li>修复：访客倒计时与后台配置同步</li>
                    <li>新增：主页header一左一右布局（时间/登录信息）</li>
                    <li>新增：闯天关"结束闯关"按钮+成绩提交确认</li>
                    <li>新增：闯天关浏览器关闭前成绩保存提示</li>
                    <li>新增：闯天关语速/循环播放控制</li>
                    <li>优化：访客模式下隐藏注销按钮</li>
                    <li>优化：导航栏返回按钮贴右边框</li>
                </ul>
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
            // admin entry moved to ⚙ gear icon
        }
    }, 1000);
});


// ========== 勤学苦练 子Tab切换 ==========
function switchStudySubTab(tab) {
    document.querySelectorAll('#study-sub-tabs .sub-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.stab === tab);
    });
    const pageStudy = document.getElementById('page-study');
    const pagePractice = document.getElementById('page-study-practice');
    const pageStats = document.getElementById('page-study-stats');
    const ctrl = document.getElementById('learn-inline-controls');

    if (tab === 'learn') {
        if (pageStudy) pageStudy.style.display = '';
        if (pagePractice) pagePractice.style.display = 'none';
        if (pageStats) pageStats.style.display = 'none';
        if (ctrl) ctrl.style.display = 'flex';
    } else if (tab === 'practice') {
        if (pageStudy) pageStudy.style.display = 'none';
        if (pagePractice) pagePractice.style.display = '';
        if (pageStats) pageStats.style.display = 'none';
        if (ctrl) ctrl.style.display = 'none';
        initPracticePage();
    } else if (tab === 'stats') {
        if (pageStudy) pageStudy.style.display = 'none';
        if (pagePractice) pagePractice.style.display = 'none';
        if (pageStats) pageStats.style.display = '';
        if (ctrl) ctrl.style.display = 'none';
        initDashboardPage();
    }
}

// ========== 闯天关 子Tab切换 ==========
let challengeInitialized = false;

function switchChallengeSubTab(tab) {
    // 子Tab切换由 ChallengeModule 内部管理
    if (typeof ChallengeModule !== 'undefined' && ChallengeModule.switchSubTab) {
        ChallengeModule.switchSubTab(tab);
    }
}

function initChallengePage() {
    if (!challengeInitialized) {
        ChallengeModule.init(document.getElementById('page-challenge'));
        challengeInitialized = true;
    }
}

// ========== 侧边栏课程数据加载 ==========
let courseMenuData = null;

async function loadCourseMenuData() {
    if (courseMenuData) return courseMenuData;
    try {
        const res = await fetch('./public/course-content.json?t=' + Date.now());
        if (res.ok) {
            courseMenuData = await res.json();
            return courseMenuData;
        }
    } catch (e) {
        console.error('加载课程数据失败:', e);
    }
    return null;
}

// ========== 从侧边栏加载课程内容到学习卡片 ==========
// courseItems: 当前可浏览的课程条目列表
let courseBrowseItems = [];
let courseBrowseIndex = 0;

function loadCourseItemsToCard(items, startIndex) {
    courseBrowseItems = items || [];
    courseBrowseIndex = startIndex || 0;
    if (courseBrowseItems.length === 0) return;
    // 确保在勤学苦练-学习Tab
    switchMainPage('study');
    switchStudySubTab('learn');
    displayCourseItem(courseBrowseItems[courseBrowseIndex]);
}

function displayCourseItem(item) {
    if (!item) return;
    const idxEl = document.getElementById('word-idx');
    const indoEl = document.getElementById('disp-indo');
    const zhEl = document.getElementById('disp-zh');
    if (idxEl) idxEl.textContent = String(courseBrowseIndex + 1).padStart(2, '0');
    if (indoEl) indoEl.textContent = item.indonesian;
    if (zhEl) zhEl.textContent = item.chinese;
    // 停止当前播放
    if (typeof stopSpeech === 'function') stopSpeech();
    // 更新收藏按钮状态
    updateFavBtnForCourse();
}

function navCourseWord(dir) {
    if (courseBrowseItems.length === 0) return;
    const wasSpeaking = typeof isSpeaking === 'function' && isSpeaking();
    if (wasSpeaking && typeof stopSpeech === 'function') stopSpeech();
    courseBrowseIndex += dir;
    if (courseBrowseIndex < 0) courseBrowseIndex = courseBrowseItems.length - 1;
    if (courseBrowseIndex >= courseBrowseItems.length) courseBrowseIndex = 0;
    displayCourseItem(courseBrowseItems[courseBrowseIndex]);
}

function updateFavBtnForCourse() {
    // 收藏功能保持原有逻辑
    if (typeof updateFavBtn === 'function') updateFavBtn();
}


// ========== 全局语音播放（闯天关和课程模块使用） ==========
window.speak = function(encodedText) {
    const text = decodeURIComponent(encodedText);
    if (!text) return;
    const rate = parseFloat(localStorage.getItem('fmi_rate') || '0.8');
    const loopCount = parseInt(localStorage.getItem('fmi_loop') || '1');
    speechSynthesis.cancel();
    // 优先谷歌TTS
    googleSpeech(text).then(() => {
        // 谷歌成功，如需循环则继续
        if (loopCount > 1) {
            let count = 1;
            function speakLoop() {
                if (count >= loopCount) return;
                count++;
                googleSpeech(text).then(speakLoop).catch(() => {});
            }
            speakLoop();
        }
    }).catch(() => {
        // 兜底浏览器speechSynthesis
        let count = 0;
        const voices = speechSynthesis.getVoices();
        let idVoice = voices.find(v => v.lang && v.lang.startsWith('id'));
        if (!idVoice) idVoice = voices.find(v => v.lang && (v.lang.startsWith('ms') || v.lang.startsWith('msa')));
        function synthOnce() {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'id-ID';
            if (idVoice) utterance.voice = idVoice;
            utterance.rate = rate;
            utterance.onend = function() {
                count++;
                if (count < loopCount) synthOnce();
            };
            speechSynthesis.speak(utterance);
        }
        synthOnce();
    });
};
