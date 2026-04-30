/**
 * app-v2.js
 * 印尼语学习助手 v2.0 - 重构版主入口
 * 新导航: 勤学苦练 | 闯天关 | 统计
 *
 * 在 index.html 中 app.js 之后加载，覆盖旧的 initUI，
 * 使用新的导航和模块系统
 */

(function() {
    'use strict';

    const app = document.getElementById('app');
    let currentPage = 'study'; // study | challenge | dashboard

    // ========== 覆盖旧版 initUI，阻止旧版自动渲染 ==========
    window.initUI = function() {
        // 不执行任何操作，v2接管
        console.log('[v2] initUI blocked - v2 takes over');
    };

    // ========== 导航切换 ==========
    window.switchMainPage = function(page) {
        currentPage = page;
        document.querySelectorAll('.main-nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.page === page);
        });
        document.getElementById('page-study').style.display = page === 'study' ? '' : 'none';
        document.getElementById('page-challenge').style.display = page === 'challenge' ? '' : 'none';
        document.getElementById('page-dashboard').style.display = page === 'dashboard' ? '' : 'none';

        // 统计页隐藏侧边栏
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.style.display = page === 'dashboard' ? 'none' : '';

        // 延迟初始化
        if (page === 'study' && !StudyModule._initialized) {
            StudyModule.init(document.getElementById('page-study'));
            StudyModule._initialized = true;
        }
        if (page === 'challenge' && !ChallengeModule._initialized) {
            ChallengeModule.init(document.getElementById('page-challenge'));
            ChallengeModule._initialized = true;
        }
        if (page === 'dashboard') {
            if (typeof initDashboardPage === 'function') initDashboardPage();
        }
    };

    // ========== 初始化 UI ==========
    async function initV2() {
        // 获取用户信息
        const userStatus = JSON.parse(localStorage.getItem('fmi_login_status') || '{"isLogin":false}');
        if (!userStatus.isLogin) {
            location.href = 'login.html';
            return;
        }
        const userData = JSON.parse(localStorage.getItem('fmi_user') || '{}');
        const userName = userData.name || 'User';

        // 加载随机学习小贴士
        const tipApi = (typeof CONFIG !== 'undefined' && CONFIG.studyTipApi) ? CONFIG.studyTipApi : "https://v1.hitokoto.cn/?c=i";
        let tipText = 'Membaca adalah jendela dunia.';
        try {
            const tipRes = await fetch(tipApi);
            const tipData = await tipRes.json();
            if (tipData.hitokoto) tipText = tipData.hitokoto;
        } catch (e) {}

        // 广播消息
        let broadcastHTML = '';
        const apiBase = (typeof CONFIG !== 'undefined' && CONFIG.apiBase) ? CONFIG.apiBase : '';
        try {
            const bRes = await fetch(apiBase + '/api/broadcast/active');
            if (bRes.ok) {
                const bData = await bRes.json();
                if (bData.broadcasts && bData.broadcasts.length > 0) {
                    const b = bData.broadcasts[0];
                    broadcastHTML = `
                        <div style="margin:10px 0;padding:12px 18px;background:linear-gradient(135deg,rgba(99,102,241,0.12),rgba(168,85,247,0.12));border:1px solid rgba(99,102,241,0.2);border-radius:12px;display:flex;align-items:center;gap:10px;">
                            <span style="color:#a78bfa;font-size:0.8rem;"><i class="fas fa-bullhorn"></i></span>
                            <span style="font-size:0.88rem;color:#e2e8f0;">${b.content || b.title || ''}</span>
                        </div>
                    `;
                }
            }
        } catch (e) {}

        // 周冠军广播
        let championHTML = '';
        try {
            const cRes = await fetch(apiBase + '/api/challenge/leaderboard/champion');
            if (cRes.ok) {
                const cData = await cRes.json();
                if (cData.success && cData.champion) {
                    const c = cData.champion;
                    championHTML = `
                        <div style="margin:8px 0;padding:10px 16px;background:linear-gradient(135deg,rgba(245,158,11,0.1),rgba(251,191,36,0.05));border:1px solid rgba(245,158,11,0.2);border-radius:10px;display:flex;align-items:center;gap:10px;">
                            <span style="color:#fbbf24;font-size:1.2rem;"><i class="fas fa-trophy"></i></span>
                            <span style="font-size:0.85rem;color:#fcd34d;">周冠军: ${c.name} (${c.companyCode || ''}) - ${c.totalScore?.toFixed(0) || 0}分</span>
                        </div>
                    `;
                }
            }
        } catch (e) {}

        const now = new Date();
        const pad = n => n.toString().padStart(2, '0');

        // 渲染主页面结构
        app.innerHTML = `
            <aside class="sidebar" id="sidebar">
                <div class="toggle-tab" onclick="toggleSidebar()">
                    <i class="fas fa-bars"></i>
                </div>
                <div class="sidebar-inner" id="menu-box">
                    <div style="color:#94a3b8;text-align:center;padding:50px 0;">加载中...</div>
                </div>
            </aside>

            <main class="main-container">
                <div class="main-nav-tabs" id="main-nav">
                    <button class="main-nav-tab active" data-page="study" onclick="switchMainPage('study')">
                        <i class="fas fa-book-open"></i> 勤学苦练
                    </button>
                    <button class="main-nav-tab" data-page="challenge" onclick="switchMainPage('challenge')">
                        <i class="fas fa-gamepad"></i> 闯天关
                    </button>
                    <button class="main-nav-tab" data-page="dashboard" onclick="switchMainPage('dashboard')">
                        <i class="fas fa-chart-line"></i> 统计
                    </button>
                </div>

                <header style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:10px;">
                    <div>
                        <h1 class="main-title">印尼语学习助手</h1>
                        <div style="font-size:0.8rem;color:#64748b;" id="date-time">${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}</div>
                    </div>
                    <div class="user-status" id="user-status"></div>
                </header>

                ${championHTML}
                ${broadcastHTML}

                <div id="page-study">
                    <div style="text-align:center;padding:60px 20px;"><i class="fas fa-spinner fa-spin" style="color:#6366f1;"></i> 加载课程数据...</div>
                </div>

                <div id="page-challenge" style="display:none;">
                    <div style="text-align:center;padding:60px 20px;"><i class="fas fa-spinner fa-spin" style="color:#f59e0b;"></i> 加载关卡数据...</div>
                </div>

                <div id="page-dashboard" style="display:none;"></div>

                <div class="copyright" id="copyright">
                    仅供学习 - 禁止商用 &copy; 2026 |
                    <span style="color:var(--accent);cursor:pointer;" onclick="openQrModal()">王鹤</span>
                    <span class="clickable" onclick="openAdminModal()" style="font-size:0.72rem;margin-left:8px;cursor:pointer;opacity:0.5;" title="管理员入口"><i class="fas fa-cog" style="font-size:0.8rem;"></i></span>
                </div>
            </main>
        `;

        // 实时更新时间
        setInterval(() => {
            const d = new Date();
            const el = document.getElementById('date-time');
            if (el) el.textContent = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        }, 1000);

        // 用户状态
        if (typeof checkLoginStatus === 'function') {
            checkLoginStatus();
        } else {
            const userStatusEl = document.getElementById('user-status');
            if (userStatusEl) {
                userStatusEl.innerHTML = `<span style="color:#94a3b8;">欢迎，<strong style="color:#e2e8f0;">${userName}</strong></span>`;
            }
        }

        // 加载旧词库以保持侧边栏功能
        try {
            const dbRes = await fetch('./indonesian_learning_data.json?t=' + Date.now());
            if (dbRes.ok) {
                window.db = await dbRes.json();
                if (typeof buildMenu === 'function') buildMenu();
            }
        } catch (e) {}

        // 启动心跳（如果旧版API可用）
        if (typeof startHeartbeat === 'function' && (typeof API !== 'undefined' && API.isLoggedIn())) {
            startHeartbeat();
        }

        // 初始化默认页
        StudyModule._initialized = false;
        ChallengeModule._initialized = false;
        switchMainPage('study');
    }

    // ========== 语音功能 ==========
    window.speak = function(encodedText) {
        const text = decodeURIComponent(encodedText);
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'id-ID';
            utterance.rate = parseFloat(localStorage.getItem('fmi_rate') || '1.0');
            speechSynthesis.speak(utterance);
        }
    };

    // ========== 侧边栏切换 ==========
    window.toggleSidebar = function() {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.toggle('open');
    };

    // ========== 启动 ==========
    // [已禁用] app-v2 自动启动已由 app.js 统一管理
    // initV2 不再自动执行，避免覆盖 app.js 的 app.innerHTML
    // 旧版功能（speak, toggleSidebar）已集成到 app.js 中
})();