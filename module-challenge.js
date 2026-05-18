/**
 * module-challenge.js
 * 闯天关模块 - 包含关卡地图、答题界面、排行榜
 * 子Tab: 闯关(Challenge) / 排行榜(Rank)
 */

const ChallengeModule = {
    currentView: 'home', // home | modes | stages | rank-modes | rank | titles
    challengeMode: 'normal', // normal | hell
    allStages: [],
    serverProgress: {}, // 从D1加载
    currentStageId: null,
    challengeState: null, // 当前答题状态

    // 计分配置（从后台设置读取，带默认值）
    get ACCURACY_WEIGHT() { return (window._systemInfo && window._systemInfo.challengeAccuracyWeight) || 0.9; },
    get TIME_WEIGHT() { return (window._systemInfo && window._systemInfo.challengeTimeWeight) || 0.1; },
    get TIME_MULTIPLIER() { return (window._systemInfo && window._systemInfo.challengeTimeMultiplier) || 5; },
    get CHALLENGE_TIME_LIMIT() { return (window._systemInfo && window._systemInfo.challengeTimeLimit) || 0; },

    // ========== 等级控制 ==========
    _getChallengeLevelConfig() {
        const sysInfo = window._systemInfo || {};
        const userInfo = JSON.parse(sessionStorage.getItem('fmi_user') || '{}');
        const isVisitor = userInfo.role === 'visitor';
        let config = isVisitor
            ? sysInfo.levelConfigVisitor || sysInfo.studyLevelConfigVisitor || sysInfo.challengeLevelConfigVisitor
            : sysInfo.levelConfigUser || sysInfo.studyLevelConfigUser || sysInfo.challengeLevelConfigUser;
        if (!config || typeof config !== 'object' || Array.isArray(config)) {
            config = {};
            for (let i = 0; i <= 7; i++) config[i] = 2;
        }
        return config;
    },

    /** 管理员判断 */
    _isAdmin() {
        try {
            const u = JSON.parse(sessionStorage.getItem('fmi_user') || '{}');
            return u.role === 'admin';
        } catch(e) { return false; }
    },

    _applyChallengeLevelFilter() {
        const config = this._getStudyLevelConfig();
        // 管理员不受等级配置限制：所有关卡可见且可闯关
        if (this._isAdmin()) {
            this.allStages.forEach(s => { s._readonly = false; });
            return;
        }
        // 用勤学苦练的课件等级控制来过滤关卡可见性
        this.allStages = this.allStages.filter(s => {
            const state = config[Number(s.levelId)];
            if (state === undefined || state === 2) return true; // 可闯关
            if (state === 0) return false; // 隐藏
            return true; // 仅展示：保留但标记
        });
        this.allStages.forEach(s => {
            s._readonly = config[Number(s.levelId)] === 1;
        });
    },

    // ========== 初始化 ==========
    async init(container) {
        this.container = container;
        // 检查闯天关是否启用（管理员不受限）
        const sysInfo = window._systemInfo || {};
        if (sysInfo.challengeEnabled === false && !this._isAdmin()) {
            container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#94a3b8;"><i class="fas fa-lock" style="font-size:2rem;margin-bottom:12px;display:block;"></i>闯天关功能尚未开放</div>';
            return;
        }
        const data = await CourseContent.load();
        if (!data) {
            container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#f87171;">数据加载失败</div>';
            return;
        }
        this._regenerateStages();
        // 按闯天关等级控制过滤关卡
        this._applyChallengeLevelFilter();
        await this.loadProgress();
        // 加载称号数据（后台静默同步）
        this._loadTitles();
        this.render();
    },

    async loadProgress() {
        // 先从本地读取
        this.serverProgress = JSON.parse(localStorage.getItem('fmi_challenge_progress') || '{}');
        // 尝试从服务端同步
        try {
            const res = await API.request('challenge/progress');
            if (res.success && res.progress) {
                this.serverProgress = res.progress;
                localStorage.setItem('fmi_challenge_progress', JSON.stringify(res.progress));
            }
        } catch (e) {
            console.warn('Failed to sync challenge progress:', e);
        }
    },

    // ========== 渲染 ==========
    render() {
        const sysInfo = window._systemInfo || {};
        const hellEnabled = sysInfo.hellModeEnabled !== false;
        const view = this.currentView;

        // 面包屑导航
        let breadcrumb = '';
        if (view === 'modes' || view === 'stages') {
            breadcrumb = `<div style="padding:8px 12px;display:flex;align-items:center;gap:6px;">
                <span style="cursor:pointer;color:#64748b;font-size:0.8rem;" onclick="ChallengeModule.goHome()"><i class="fas fa-home"></i> 首页</span>
                <i class="fas fa-chevron-right" style="color:#475569;font-size:0.6rem;"></i>
                <span style="color:#e2e8f0;font-size:0.8rem;font-weight:600;">闯天关</span>
                ${view === 'stages' ? `<i class="fas fa-chevron-right" style="color:#475569;font-size:0.6rem;"></i><span style="color:${this.challengeMode === 'hell' ? '#f87171' : '#60a5fa'};font-size:0.8rem;font-weight:600;">${this.challengeMode === 'hell' ? '地狱模式' : '普通模式'}</span>` : ''}
            </div>`;
        } else if (view === 'rank-modes' || view === 'rank' || view === 'titles') {
            breadcrumb = `<div style="padding:8px 12px;display:flex;align-items:center;gap:6px;">
                <span style="cursor:pointer;color:#64748b;font-size:0.8rem;" onclick="ChallengeModule.goHome()"><i class="fas fa-home"></i> 首页</span>
                <i class="fas fa-chevron-right" style="color:#475569;font-size:0.6rem;"></i>
                <span style="color:#e2e8f0;font-size:0.8rem;font-weight:600;">${view === 'titles' ? '称号墙' : '排行榜'}</span>
                ${view === 'rank' ? '' : ''}
            </div>`;
        }

        let bodyHtml = '';
        if (view === 'home') {
            bodyHtml = this._renderHome(hellEnabled);
        } else if (view === 'modes') {
            bodyHtml = this._renderModeCards(hellEnabled);
        } else if (view === 'stages') {
            bodyHtml = '<div id="challenge-sub-content"></div>';
        } else if (view === 'rank-modes') {
            bodyHtml = this._renderRankModeCards(hellEnabled);
        } else if (view === 'rank') {
            bodyHtml = '<div id="challenge-sub-content"></div>';
        } else if (view === 'titles') {
            bodyHtml = '<div id="challenge-sub-content"></div>';
        }

        this.container.innerHTML = `<div class="challenge-module">${breadcrumb}${bodyHtml}</div>`;

        if (view === 'stages') {
            const subContent = document.getElementById('challenge-sub-content');
            if (subContent) { this._loadEquippedFrame(); this.renderStages(subContent); }
        } else if (view === 'rank') {
            const subContent = document.getElementById('challenge-sub-content');
            if (subContent) this.renderRank(subContent);
        } else if (view === 'titles') {
            const subContent = document.getElementById('challenge-sub-content');
            if (subContent) this._renderTitlesWall(subContent);
        }
    },

    goHome() {
        this.currentView = 'home';
        this.render();
    },

    _renderHome(hellEnabled) {
        const normalProgress = this._calcModeProgress('normal');
        const hellProgress = this._calcModeProgress('hell');
        return `
        <div class="ch-home">
            <!-- 标题区 -->
            <div class="ch-home-header">
                <div class="ch-home-title-wrap">
                    <i class="fas fa-dungeon ch-home-title-icon"></i>
                    <h2 class="ch-home-title">闯天关</h2>
                </div>
                <p class="ch-home-subtitle">选择你的挑战之路</p>
            </div>

            <!-- 双模式卡片 -->
            <div class="ch-home-cards">
                <!-- 普通模式 - 天堂主题 -->
                <div class="ch-mode-card ch-mode-heaven" onclick="ChallengeModule.selectMode('normal')">
                    <div class="ch-mode-card-bg ch-heaven-bg"></div>
                    <div class="ch-mode-card-scene ch-heaven-scene">
                        <div class="ch-stairs ch-stairs-up">
                            ${[1,2,3,4,5].map(n => `<div class="ch-stair" style="--i:${n}"></div>`).join('')}
                        </div>
                        <div class="ch-door ch-door-heaven">
                            <div class="ch-door-frame">
                                <div class="ch-door-arch"></div>
                                <div class="ch-door-body">
                                    <i class="fas fa-dove"></i>
                                </div>
                                <div class="ch-door-glow ch-door-glow-heaven"></div>
                            </div>
                        </div>
                    </div>
                    <div class="ch-mode-card-info">
                        <div class="ch-mode-badge ch-badge-heaven">
                            <i class="fas fa-feather-alt"></i>
                        </div>
                        <div class="ch-mode-name ch-name-heaven">普通</div>
                        <div class="ch-mode-desc">基础难度 · 入门闯关</div>
                        <div class="ch-mode-progress">
                            <div class="ch-mode-progress-row">
                                <span class="ch-progress-label">关卡</span>
                                <span class="ch-progress-value">${normalProgress.cleared}<span class="ch-progress-total">/${normalProgress.total}</span></span>
                            </div>
                            <div class="ch-mode-progress-row">
                                <span class="ch-progress-label">星数</span>
                                <span class="ch-progress-value ch-stars">${normalProgress.stars} <i class="fas fa-star"></i></span>
                            </div>
                        </div>
                    </div>
                </div>

                ${hellEnabled ? `
                <!-- 地狱模式 -->
                <div class="ch-mode-card ch-mode-hell" onclick="ChallengeModule.selectMode('hell')">
                    <div class="ch-mode-card-bg ch-hell-bg"></div>
                    <div class="ch-mode-card-scene ch-hell-scene">
                        <div class="ch-stairs ch-stairs-down">
                            ${[1,2,3,4,5].map(n => `<div class="ch-stair" style="--i:${n}"></div>`).join('')}
                        </div>
                        <div class="ch-door ch-door-hell">
                            <div class="ch-door-frame">
                                <div class="ch-door-arch"></div>
                                <div class="ch-door-body">
                                    <i class="fas fa-fire-flame-curved"></i>
                                </div>
                                <div class="ch-door-glow ch-door-glow-hell"></div>
                            </div>
                        </div>
                    </div>
                    <div class="ch-mode-card-info">
                        <div class="ch-mode-badge ch-badge-hell">
                            <i class="fas fa-skull"></i>
                        </div>
                        <div class="ch-mode-name ch-name-hell">地狱</div>
                        <div class="ch-mode-desc">高难度 · 内容更多更复杂</div>
                        <div class="ch-mode-progress">
                            <div class="ch-mode-progress-row">
                                <span class="ch-progress-label">关卡</span>
                                <span class="ch-progress-value">${hellProgress.cleared}<span class="ch-progress-total">/${hellProgress.total}</span></span>
                            </div>
                            <div class="ch-mode-progress-row">
                                <span class="ch-progress-label">星数</span>
                                <span class="ch-progress-value ch-stars">${hellProgress.stars} <i class="fas fa-star"></i></span>
                            </div>
                        </div>
                    </div>
                </div>` : ''}
            </div>

            <!-- 底部入口 -->
            <div class="ch-home-footer">
                <div class="ch-footer-entry" onclick="ChallengeModule.enterTitles()">
                    <i class="fas fa-medal ch-footer-icon"></i>
                    <span>称号墙</span>
                    <i class="fas fa-chevron-right ch-footer-arrow"></i>
                </div>
                <div class="ch-footer-entry" onclick="ChallengeModule.enterRank()">
                    <i class="fas fa-trophy ch-footer-icon"></i>
                    <span>排行榜</span>
                    <i class="fas fa-chevron-right ch-footer-arrow"></i>
                </div>
            </div>
        </div>`;
    },

    _renderModeCards(hellEnabled) {
        const normalProgress = this._calcModeProgress('normal');
        const hellProgress = this._calcModeProgress('hell');
        return `
        <div style="padding:12px;display:flex;flex-direction:column;gap:16px;">
            <div onclick="ChallengeModule.selectMode('normal')" style="cursor:pointer;background:linear-gradient(135deg,rgba(96,165,250,0.12),rgba(59,130,246,0.06));border:2px solid ${this.challengeMode === 'normal' ? 'rgba(96,165,250,0.6)' : 'rgba(96,165,250,0.2)'};border-radius:16px;padding:20px;transition:all 0.2s;" onmouseover="this.style.borderColor='rgba(96,165,250,0.5)';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='${this.challengeMode === 'normal' ? 'rgba(96,165,250,0.6)' : 'rgba(96,165,250,0.2)'}';this.style.transform='none'">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
                    <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#3b82f6,#2563eb);display:flex;align-items:center;justify-content:center;">
                        <i class="fas fa-shield-halved" style="font-size:1.2rem;color:#fff;"></i>
                    </div>
                    <div>
                        <div style="font-size:1rem;font-weight:700;color:#60a5fa;">普通模式</div>
                        <div style="font-size:0.72rem;color:#64748b;margin-top:2px;">基础难度，适合入门闯关</div>
                    </div>
                </div>
                <div style="display:flex;gap:20px;">
                    <div><span style="font-size:0.7rem;color:#64748b;">关卡</span><br><span style="font-size:0.95rem;color:#e2e8f0;font-weight:700;">${normalProgress.total}</span></div>
                    <div><span style="font-size:0.7rem;color:#64748b;">已通关</span><br><span style="font-size:0.95rem;color:#e2e8f0;font-weight:700;">${normalProgress.cleared}</span></div>
                    <div><span style="font-size:0.7rem;color:#64748b;">总星数</span><br><span style="font-size:0.95rem;color:#fbbf24;font-weight:700;">${normalProgress.stars} <i class="fas fa-star" style="font-size:0.7rem;"></i></span></div>
                    <div><span style="font-size:0.7rem;color:#64748b;">总积分</span><br><span style="font-size:0.95rem;color:#e2e8f0;font-weight:700;">${normalProgress.score}</span></div>
                </div>
            </div>
            ${hellEnabled ? `<div onclick="ChallengeModule.selectMode('hell')" style="cursor:pointer;background:linear-gradient(135deg,rgba(248,113,113,0.12),rgba(239,68,68,0.06));border:2px solid ${this.challengeMode === 'hell' ? 'rgba(248,113,113,0.6)' : 'rgba(248,113,113,0.2)'};border-radius:16px;padding:20px;transition:all 0.2s;" onmouseover="this.style.borderColor='rgba(248,113,113,0.5)';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='${this.challengeMode === 'hell' ? 'rgba(248,113,113,0.6)' : 'rgba(248,113,113,0.2)'}';this.style.transform='none'">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
                    <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#ef4444,#dc2626);display:flex;align-items:center;justify-content:center;">
                        <i class="fas fa-skull-crossbones" style="font-size:1.2rem;color:#fff;"></i>
                    </div>
                    <div>
                        <div style="font-size:1rem;font-weight:700;color:#f87171;">地狱模式</div>
                        <div style="font-size:0.72rem;color:#64748b;margin-top:2px;">高难度，内容更多更复杂</div>
                    </div>
                </div>
                <div style="display:flex;gap:20px;">
                    <div><span style="font-size:0.7rem;color:#64748b;">关卡</span><br><span style="font-size:0.95rem;color:#e2e8f0;font-weight:700;">${hellProgress.total}</span></div>
                    <div><span style="font-size:0.7rem;color:#64748b;">已通关</span><br><span style="font-size:0.95rem;color:#e2e8f0;font-weight:700;">${hellProgress.cleared}</span></div>
                    <div><span style="font-size:0.7rem;color:#64748b;">总星数</span><br><span style="font-size:0.95rem;color:#fbbf24;font-weight:700;">${hellProgress.stars} <i class="fas fa-star" style="font-size:0.7rem;"></i></span></div>
                    <div><span style="font-size:0.7rem;color:#64748b;">总积分</span><br><span style="font-size:0.95rem;color:#e2e8f0;font-weight:700;">${hellProgress.score}</span></div>
                </div>
            </div>` : ''}
        </div>`;
    },

    _renderRankModeCards(hellEnabled) {
        return `
        <div style="padding:12px;display:flex;flex-direction:column;gap:16px;">
            <div onclick="ChallengeModule.selectRankMode('normal')" style="cursor:pointer;background:linear-gradient(135deg,rgba(96,165,250,0.12),rgba(59,130,246,0.06));border:1px solid rgba(96,165,250,0.2);border-radius:16px;padding:24px;transition:all 0.2s;" onmouseover="this.style.borderColor='rgba(96,165,250,0.5)';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='rgba(96,165,250,0.2)';this.style.transform='none'">
                <div style="display:flex;align-items:center;gap:14px;">
                    <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#3b82f6,#2563eb);display:flex;align-items:center;justify-content:center;">
                        <i class="fas fa-shield-halved" style="font-size:1.1rem;color:#fff;"></i>
                    </div>
                    <div>
                        <div style="font-size:1rem;font-weight:700;color:#60a5fa;">普通模式排行榜</div>
                        <div style="font-size:0.72rem;color:#64748b;margin-top:2px;">查看普通模式下的闯关排名</div>
                    </div>
                    <i class="fas fa-chevron-right" style="margin-left:auto;color:#64748b;font-size:1rem;"></i>
                </div>
            </div>
            ${hellEnabled ? `<div onclick="ChallengeModule.selectRankMode('hell')" style="cursor:pointer;background:linear-gradient(135deg,rgba(248,113,113,0.12),rgba(239,68,68,0.06));border:1px solid rgba(248,113,113,0.2);border-radius:16px;padding:24px;transition:all 0.2s;" onmouseover="this.style.borderColor='rgba(248,113,113,0.5)';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='rgba(248,113,113,0.2)';this.style.transform='none'">
                <div style="display:flex;align-items:center;gap:14px;">
                    <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#ef4444,#dc2626);display:flex;align-items:center;justify-content:center;">
                        <i class="fas fa-skull-crossbones" style="font-size:1.1rem;color:#fff;"></i>
                    </div>
                    <div>
                        <div style="font-size:1rem;font-weight:700;color:#f87171;">地狱模式排行榜</div>
                        <div style="font-size:0.72rem;color:#64748b;margin-top:2px;">查看地狱模式下的闯关排名</div>
                    </div>
                    <i class="fas fa-chevron-right" style="margin-left:auto;color:#64748b;font-size:1rem;"></i>
                </div>
            </div>` : ''}
        </div>`;
    },

    enterChallenge() {
        this.currentView = 'modes';
        this.render();
    },

    selectMode(mode) {
        this.challengeMode = mode;
        this.currentStageId = null;
        this.challengeState = null;
        this._regenerateStages();
        this._applyChallengeLevelFilter();
        this.currentView = 'stages';
        this.render();
    },

    enterRank() {
        this.currentView = 'rank-modes';
        this.render();
    },

    selectRankMode(mode) {
        this.challengeMode = mode;
        this.currentView = 'rank';
        this.render();
    },

    _calcModeProgress(mode) {
        // 用 getAllStages 按模式生成关卡，用 studyLevelConfig 控制可见性
        const allModeStages = CourseContent.getAllStages(mode);
        const config = this._getStudyLevelConfig();
        const visible = allModeStages.filter(s => {
            const state = config[Number(s.levelId)];
            return state === undefined || state === 2 || state === 1; // 0=隐藏
        });
        const cleared = visible.filter(s => this.serverProgress[s.id]?.cleared).length;
        const stars = visible.reduce((sum, s) => sum + (this.serverProgress[s.id]?.stars || 0), 0);
        const score = visible.reduce((sum, s) => sum + (this.serverProgress[s.id]?.bestScore || 0), 0);
        return { total: visible.length, cleared, stars, score: Math.round(score) };
    },

    _getStudyLevelConfig() {
        const sysInfo = window._systemInfo || {};
        const isVisitor = window._userInfo && (window._userInfo.userType === 'visitor');
        if (isVisitor) return sysInfo.levelConfigVisitor || sysInfo.studyLevelConfigVisitor || sysInfo.challengeLevelConfigVisitor || {};
        return sysInfo.levelConfigUser || sysInfo.studyLevelConfigUser || sysInfo.challengeLevelConfigUser || {};
    },

    switchChallengeMode(mode) {
        this.challengeMode = mode;
        this.currentStageId = null;
        this.challengeState = null;
        this._regenerateStages();
        this._applyChallengeLevelFilter();
        this.render();
    },

    // BOSS 配置定义（由后台 hellSettings.bossConfig 覆盖，此处为默认值）
    _bossConfig: {
        enabled: true,
        // 题目来源模式: 'random' = 从当前等级及之前随机抽题, 'specific' = 按等级指定范围
        questionSource: 'random',
        // 各等级BOSS配置（后台可通过 hellSettings.bossConfig 覆盖）
        // levelBosses: {
        //   levelId: { mini: { enabled, count, interval, bossLevel, ...hp配置 }, big: { enabled, bossLevel, ...hp配置 } }
        // }
        levelBosses: {
            '0': {
                mini: { enabled: false },
                big: { enabled: true, bossLevel: '0', bossHp: 6,  userHp: 3, questionCount: 10, questionRange: [0], rageThreshold: 0.35, rageDamage: 2 }
            },
            '1': {
                mini: { enabled: false },
                big: { enabled: true, bossLevel: '1', bossHp: 8,  userHp: 3, questionCount: 12, questionRange: [0, 1], rageThreshold: 0.3, rageDamage: 2 }
            },
            '2': {
                mini: { enabled: false },
                big: { enabled: true, bossLevel: '2', bossHp: 10, userHp: 3, questionCount: 14, questionRange: [0, 1, 2], rageThreshold: 0.3, rageDamage: 2 }
            },
            '3': {
                mini: { enabled: false },
                big: { enabled: true, bossLevel: '3', bossHp: 12, userHp: 2, questionCount: 16, questionRange: [0, 1, 2, 3], rageThreshold: 0.25, rageDamage: 2 }
            },
            '4': {
                mini: { enabled: true, count: 3, interval: 20, bossLevel: '0', bossHp: 5,  userHp: 3, questionCount: 8,  questionRange: [0, 1, 2, 3, 4], rageThreshold: 0.35, rageDamage: 2 },
                big: { enabled: true, bossLevel: '4', bossHp: 12, userHp: 2, questionCount: 16, questionRange: [0, 1, 2, 3, 4], rageThreshold: 0.25, rageDamage: 2 }
            },
            '5': {
                mini: { enabled: true, count: 2, interval: 21, bossLevel: '1', bossHp: 6,  userHp: 3, questionCount: 10, questionRange: [0, 1, 2, 3, 4, 5], rageThreshold: 0.35, rageDamage: 2 },
                big: { enabled: true, bossLevel: '5', bossHp: 15, userHp: 2, questionCount: 18, questionRange: [0, 1, 2, 3, 4, 5], rageThreshold: 0.25, rageDamage: 3 }
            },
            '6': {
                mini: { enabled: true, count: 2, interval: 16, bossLevel: '2', bossHp: 8,  userHp: 2, questionCount: 12, questionRange: [0, 1, 2, 3, 4, 5, 6], rageThreshold: 0.3, rageDamage: 2 },
                big: { enabled: true, bossLevel: '6', bossHp: 18, userHp: 2, questionCount: 20, questionRange: [0, 1, 2, 3, 4, 5, 6], rageThreshold: 0.2, rageDamage: 3 }
            },
            '7': {
                mini: { enabled: true, count: 2, interval: 10, bossLevel: '3', bossHp: 10, userHp: 2, questionCount: 14, questionRange: [0, 1, 2, 3, 4, 5, 6, 7], rageThreshold: 0.3, rageDamage: 2 },
                big: { enabled: true, bossLevel: '7', bossHp: 22, userHp: 1, questionCount: 25, questionRange: [0, 1, 2, 3, 4, 5, 6, 7], rageThreshold: 0.2, rageDamage: 3 }
            }
        }
    },

    _getBossConfig() {
        const sysInfo = window._systemInfo || {};
        const hell = sysInfo.hellSettings || {};
        const override = hell.bossConfig || {};
        if (Object.keys(override).length === 0) return this._bossConfig;

        // 浅合并顶层字段
        const merged = { ...this._bossConfig, ...override };

        // 深层合并 levelBosses：后台配置覆盖默认值，但保留未指定的等级
        if (override.levelBosses) {
            merged.levelBosses = {};
            const allLevels = new Set([
                ...Object.keys(this._bossConfig.levelBosses || {}),
                ...Object.keys(override.levelBosses)
            ]);
            for (const lv of allLevels) {
                const def = (this._bossConfig.levelBosses || {})[lv] || {};
                const over = override.levelBosses[lv] || {};
                merged.levelBosses[lv] = { ...def, ...over };
                // 再深层合并 mini 和 big
                if (over.mini && def.mini) {
                    merged.levelBosses[lv].mini = { ...def.mini, ...over.mini };
                }
                if (over.big && def.big) {
                    merged.levelBosses[lv].big = { ...def.big, ...over.big };
                }
            }
        }
        return merged;
    },

    // BOSS 造型定义
    _bossDefs: {
        '0': { name: '声之魔灵', icon: 'fa-wand-sparkles', theme: 'sound', color: '#a78bfa', desc: '掌控万音的魔灵', image: 'https://lingxi.wps.cn/api/aioffice/v1/short_link/3fjM8KCfO' },
        '1': { name: '婆罗多神将', icon: 'fa-shield-halved', theme: 'warrior', color: '#60a5fa', desc: 'Dasar 基础的守关者', image: 'https://lingxi.wps.cn/api/aioffice/v1/short_link/3fjNDR2UY' },
        '2': { name: 'Raksasa 巨魔', icon: 'fa-hand-fist', theme: 'brute', color: '#4ade80', desc: '中级篇的野蛮守卫', image: 'https://lingxi.wps.cn/api/aioffice/v1/short_link/3fjMleXYE' },
        '3': { name: 'Naga 蛇龙', icon: 'fa-dragon', theme: 'dragon', color: '#f87171', desc: '中高级的盘踞之龙', image: 'https://lingxi.wps.cn/api/aioffice/v1/short_link/3fjMqUWzW' },
        '4': { name: 'Garuda 伽鲁达', icon: 'fa-dove', theme: 'garuda', color: '#fbbf24', desc: '高级篇的神鸟之王', image: 'https://lingxi.wps.cn/api/aioffice/v1/short_link/3fjMz9jlO' },
        '5': { name: '浮屠守殿者', icon: 'fa-landmark', theme: 'temple', color: '#fb923c', desc: '高级进阶的石像守卫', image: 'https://lingxi.wps.cn/api/aioffice/v1/short_link/3fjMIw4DW' },
        '6': { name: 'Dewa 天神', icon: 'fa-bolt', theme: 'deity', color: '#38bdf8', desc: '精通篇的半神形态', image: 'https://lingxi.wps.cn/api/aioffice/v1/short_link/3fjMOtEUk' },
        '7': { name: 'Ratu Iblis 魔王', icon: 'fa-skull', theme: 'demon', color: '#ef4444', desc: '卓越篇的终极魔王', image: 'https://lingxi.wps.cn/api/aioffice/v1/short_link/3fjMVi1uQ' },

    },

    // 用户角色形象定义（按等级成长）
    _heroDefs: {
        '0': { name: '初心学徒', icon: 'fa-person-hiking', color: '#34d399', desc: '手持木剑的少年冒险者', image: 'https://lingxi.wps.cn/api/aioffice/v1/short_link/3fjPeDsrW' },
        '1': { name: '旅人剑士', icon: 'fa-person-military-rifle', color: '#2dd4bf', desc: '装备铁甲的年轻剑士', image: 'https://lingxi.wps.cn/api/aioffice/v1/short_link/3fjLb8QWg' },
        '2': { name: '荒野游侠', icon: 'fa-person-walking', color: '#4ade80', desc: '身披斗篷的弓箭手', image: 'https://lingxi.wps.cn/api/aioffice/v1/short_link/3fjLjnevG' },
        '3': { name: '龙骑士学徒', icon: 'fa-hat-wizard', color: '#fb923c', desc: '骑小龙的初级龙骑士', image: 'https://lingxi.wps.cn/api/aioffice/v1/short_link/3fjLt1A8k' },
        '4': { name: '圣殿骑士', icon: 'fa-shield-halved', color: '#fbbf24', desc: '身披银甲的圣殿守卫', image: 'https://lingxi.wps.cn/api/aioffice/v1/short_link/3fjLEnxkU' },
        '5': { name: '元素法师', icon: 'fa-wand-magic-sparkles', color: '#c084fc', desc: '操控元素的强大法师', image: 'https://lingxi.wps.cn/api/aioffice/v1/short_link/3fjLMkiYI' },
        '6': { name: '半神行者', icon: 'fa-bolt', color: '#38bdf8', desc: '身带神光的超凡存在', image: 'https://lingxi.wps.cn/api/aioffice/v1/short_link/3fjLShSI4' },
        '7': { name: '传奇勇者', icon: 'fa-crown', color: '#f59e0b', desc: '全身铠甲散发圣光的终极勇者', image: 'https://lingxi.wps.cn/api/aioffice/v1/short_link/3fjM0wftW' },
    },

    _regenerateStages() {
        // 根据当前模式重新生成关卡列表（使用对应的切分配置）
        this.allStages = CourseContent.getAllStages(this.challengeMode);
        
        // 地狱模式下注入 BOSS 关卡
        if (this.challengeMode === 'hell') {
            this._injectBossStages();
        }
    },

    /**
     * 在地狱模式关卡列表中注入 BOSS 关卡
     * - 小BOSS: BIPA 4-7 每10关插入一个（4级用0级BOSS，5用1，6用2，7用3）
     * - 大BOSS: 每个等级通关后的守关BOSS
     */
    _injectBossStages() {
        const config = this._getBossConfig();
        if (!config.enabled) return;

        const stages = this.allStages;
        // 按等级分组（记录原始索引，用于插入）
        const levelGroups = {};
        stages.forEach((s, idx) => {
            const lid = String(s.levelId);
            if (!levelGroups[lid]) levelGroups[lid] = [];
            levelGroups[lid].push({ stage: s, globalIndex: idx });
        });

        const bossInserts = []; // { afterGlobalIndex, bossStage }

        for (const [levelId, group] of Object.entries(levelGroups)) {
            const lvConfig = (config.levelBosses || {})[levelId];
            if (!lvConfig) continue;
            const normalCount = group.length; // 当前等级的普通关卡数

            // === 小BOSS（间隔模式：每隔N关一个，不限总数）===
            const mini = lvConfig.mini || {};
            if (mini.enabled && mini.interval > 0) {
                const interval = mini.interval;
                // 从第interval关开始，每隔interval关插入一个小BOSS（但不在大BOSS之前插入）
                for (let pos = interval; pos < normalCount; pos += interval) {
                    const actualIdx = pos - 1;
                    if (actualIdx < 0 || actualIdx >= group.length) continue;

                    const insertAfter = group[actualIdx].globalIndex;
                    const _miniHpMode = mini.hpMode || 1;
                    const _miniQCount = mini.questionCount || 8;
                    const params = {
                        hpMode: _miniHpMode,
                        bossHp: _miniHpMode === 2 ? (mini.bossHp || _miniQCount) : _miniQCount,
                        userHp: mini.userHp || 3,
                        questionCount: _miniQCount,
                        questionSource: config.questionSource || 'random'
                    };
                    bossInserts.push({
                        afterGlobalIndex: insertAfter,
                        bossStage: this._createBossStage(
                            mini.bossLevel || levelId, levelId, 'mini', params,
                            group[Math.min(actualIdx + 1, group.length - 1)].stage
                        ),
                    });
                }
            }

            // === 大BOSS（等级末尾）===
            const big = lvConfig.big || {};
            if (big.enabled) {
                const lastItem = group[group.length - 1];
                const _bigHpMode = big.hpMode || 1;
                const _bigQCount = big.questionCount || 15;
                const params = {
                    hpMode: _bigHpMode,
                    bossHp: _bigHpMode === 2 ? (big.bossHp || _bigQCount) : _bigQCount,
                    userHp: big.userHp || 3,
                    questionCount: _bigQCount,
                    questionRange: big.questionRange || [levelId],
                    questionSource: config.questionSource || 'random'
                };
                bossInserts.push({
                    afterGlobalIndex: lastItem.globalIndex,
                    bossStage: this._createBossStage(
                        big.bossLevel || levelId, levelId, 'big', params, lastItem.stage
                    ),
                });
            }
        }

        // 按afterGlobalIndex排序后倒序插入（避免索引错位）
        bossInserts.sort((a, b) => a.afterGlobalIndex - b.afterGlobalIndex);
        for (let i = bossInserts.length - 1; i >= 0; i--) {
            const insertIdx = bossInserts[i].afterGlobalIndex + 1;
            this.allStages.splice(insertIdx, 0, bossInserts[i].bossStage);
        }

        return bossInserts.length;
    },

    /**
     * 创建 BOSS 关卡数据
     * @param {string} bossLevel - BOSS对应的等级(0-7)
     * @param {string} contextLevel - 所在的课程等级
     * @param {string} bossType - 'mini' | 'big'
     * @param {object} params - { bossHp, userHp, questionCount }
     * @param {object} refStage - 参考关卡（用于取题目素材）
     */
    _createBossStage(bossLevel, contextLevel, bossType, params, refStage) {
        const bossDef = this._bossDefs[bossLevel] || this._bossDefs['0'];
        const typeLabel = bossType === 'mini' ? '小BOSS' : '大BOSS';
        const id = `boss-${contextLevel}-${bossLevel}-${bossType}`;
        const questionSource = params.questionSource || 'random';
        const questionRange = params.questionRange || [contextLevel];

        // 收集题目
        const allQuestions = [];
        if (typeof CourseContent !== 'undefined' && CourseContent.getLevels) {
            const levels = CourseContent.getLevels();
            const rangeSet = new Set(questionRange.map(String));

            for (const lv of levels) {
                if (!rangeSet.has(String(lv.id))) continue;
                for (const u of lv.units) {
                    const items = [...(u.words || []), ...(u.sentences || []), ...(u.dialogues || [])];
                    allQuestions.push(...items);
                }
            }
        }

        // 抽取题目
        let questions;
        if (questionSource === 'random') {
            // 随机模式：打乱后截取
            const shuffled = this._shuffle([...allQuestions]);
            questions = shuffled.slice(0, params.questionCount);
        } else {
            // 指定模式：从尾部优先抽取（考察最新学的内容）
            // 先打乱，但更倾向高等级的题目
            const rangeSet = new Set(questionRange.map(String));
            const recentQuestions = [];
            const olderQuestions = [];
            const levels = CourseContent.getLevels();
            for (const lv of levels) {
                if (!rangeSet.has(String(lv.id))) continue;
                for (const u of lv.units) {
                    const items = [...(u.words || []), ...(u.sentences || []), ...(u.dialogues || [])];
                    if (String(lv.id) === String(contextLevel)) {
                        recentQuestions.push(...items);
                    } else {
                        olderQuestions.push(...items);
                    }
                }
            }
            // 70%来自当前等级，30%来自之前等级
            const shuffledRecent = this._shuffle([...recentQuestions]);
            const shuffledOlder = this._shuffle([...olderQuestions]);
            const recentCount = Math.min(
                Math.ceil(params.questionCount * 0.7),
                shuffledRecent.length
            );
            const olderCount = Math.min(params.questionCount - recentCount, shuffledOlder.length);
            const remaining = params.questionCount - recentCount - olderCount;
            questions = [
                ...shuffledRecent.slice(0, recentCount),
                ...shuffledOlder.slice(0, olderCount),
                ...shuffledRecent.slice(recentCount, recentCount + remaining)
            ];
        }

        return {
            id: id,
            levelId: contextLevel,
            unitId: 'boss',
            type: 'boss',
            bossType: bossType,
            bossLevel: bossLevel,
            bossDef: bossDef,
            bossParams: params,
            name: `${typeLabel}: ${bossDef.name}`,
            label: params.hpMode === 2 ? `${params.bossHp}HP vs ${params.userHp}HP` : null,
            questions: questions,
            totalQuestions: questions.length,
            _isBoss: true,
        };
    },

    switchSubTab(tab) {
        this.currentSubTab = tab;
        this.render();
    },

    // ========== 关卡地图 ==========
    renderStages(container) {
        if (this.currentStageId) {
            this._renderPlayArea(container);
            return;
        }

        const isHellMode = this.challengeMode === 'hell';
        // 直接使用 allStages（已按模式生成，已按等级过滤）
        const stages = this.allStages;

        if (stages.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">' + (isHellMode ? '地狱模式暂无关卡' : '暂无关卡') + '</div>';
            return;
        }

        // 计算解锁状态（基于过滤后的 stages）
        let highestCleared = -1;
        for (let i = 0; i < stages.length; i++) {
            const p = this.serverProgress[stages[i].id];
            if (p && p.cleared) highestCleared = i;
        }
        const nextAvailable = highestCleared + 1;

        // 统计
        const totalCleared = stages.filter(s => this.serverProgress[s.id]?.cleared).length;
        const totalScore = stages.reduce((sum, s) => sum + (this.serverProgress[s.id]?.bestScore || 0), 0);
        const maxStars = stages.reduce((sum, s) => sum + (this.serverProgress[s.id]?.stars || 0), 0);
        const levelNames = {};
        this.allStages.forEach(s => {
            if (!levelNames[s.levelId]) levelNames[s.levelId] = s.levelId === '0' ? '通用印尼语学习手册' : '';
        });
        // 从 course-content 获取 level 名称
        const levels = (typeof CourseContent !== 'undefined' && CourseContent.getLevels) ? CourseContent.getLevels() : [];
        levels.forEach(lv => { levelNames[lv.id] = lv.name; });

        // 分组
        const groups = [];
        let currentLevelId = null;
        let currentGroup = null;
        stages.forEach((stage, i) => {
            const lid = String(stage.levelId);
            if (lid !== currentLevelId) {
                currentLevelId = lid;
                currentGroup = { levelId: lid, levelName: levelNames[lid] || ('Level ' + lid), isHell: isHellMode, stages: [] };
                groups.push(currentGroup);
            }
            currentGroup.stages.push({ stage, index: i });
        });

        let stageGrid = '';
        groups.forEach(group => {
            const hellTag = group.isHell ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);border-radius:6px;font-size:0.7rem;font-weight:600;"><i class="fas fa-skull-crossbones"></i> 地狱模式</span>` : '';
            stageGrid += `<div style="grid-column:1/-1;padding:8px 4px 2px;display:flex;align-items:center;gap:8px;"><span style="font-size:0.75rem;color:#64748b;font-weight:600;">${group.levelName}</span>${hellTag}</div>`;
            group.stages.forEach(({stage, index: i}) => {
                const isBoss = stage._isBoss === true;
                const p = this.serverProgress[stage.id];
                const isCleared = p && p.cleared;
                const isCurrent = i === nextAvailable;
                // 顺序闯关：读取当前模式的设置
            const _sysInfo2 = window._systemInfo || {};
            const _ns2 = _sysInfo2.normalSettings || {};
            const _hs2 = _sysInfo2.hellSettings || {};
            const _normalSeq = _ns2.sequentialMode === true || _sysInfo2.challengeSequentialMode === true;
            const _hellSeq = _hs2.sequentialMode !== false;
            const sequentialMode = isHellMode ? _hellSeq : _normalSeq;
                const isHellLocked = sequentialMode && i > nextAvailable && !this._isAdmin();
                const isReadonly = stage._readonly === true && !this._isAdmin();
                const isLocked = isHellLocked || isReadonly;

                const stars = p?.stars || 0;

                let statusClass = isLocked ? 'locked' : isCleared ? 'cleared' : isCurrent ? 'current' : 'available';
                if (isBoss) statusClass = isLocked ? 'locked' : isCleared ? 'boss-cleared' : isCurrent ? 'boss-current' : 'boss-available';
                let statusIcon = isLocked
                    ? (isReadonly ? '<i class="fas fa-lock" style="color:#f59e0b;"></i>' : '<i class="fas fa-lock"></i>')
                    : isCleared ? this._renderStars(stars)
                    : isCurrent ? '<i class="fas fa-play-circle"></i>'
                    : '';

                // 根据模式和 levelId 添加门造型
                let _gateInfo, _gateHtml, _gateExtraClass;
                if (isBoss) {
                    _gateInfo = this._getBossGateStyle(stage.bossDef, stage.bossType, isLocked, isCleared, isCurrent);
                    _gateHtml = _gateInfo.html;
                    _gateExtraClass = ' stage-boss-gate';
                } else {
                    _gateInfo = this._getGateStyle(group.isHell, group.levelId, isLocked, isCleared, isCurrent);
                    _gateHtml = _gateInfo.html;
                    _gateExtraClass = ' stage-gate';
                }

                stageGrid += `<div class="stage-card ${statusClass} ${group.isHell ? 'stage-hell' : ''}${_gateExtraClass}" onclick="${isLocked ? '' : `ChallengeModule.enterStage('${stage.id}')`}" ${isReadonly ? 'title="该课程暂未开放"' : ''}>
                    ${_gateHtml}
                    ${isBoss ? `<div class="stage-boss-label"><i class="fas ${stage.bossDef.icon}"></i> ${stage.bossDef.name}</div>` : `<div class="stage-number">${i + 1}</div>`}
                    <div class="stage-icon">${isBoss ? (isLocked ? '<i class="fas fa-lock"></i>' : isCleared ? '<i class="fas fa-skull"></i>' : '<i class="fas fa-skull-crossbones"></i>') : statusIcon}</div>
                    ${isCleared ? `<div class="stage-best">${isBoss ? '已击败' : '最佳 ' + p.bestScore.toFixed(0) + '分'}</div>` : ''}
                    ${isCurrent && !isLocked ? `<div class="stage-hint">${isBoss ? 'BOSS战!' : '可挑战'}</div>` : ''}
                </div>`;
            });
        });

        container.innerHTML = `
            <div class="stages-page">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0 8px;">
                    <span style="font-size:0.82rem;color:${isHellMode ? '#f87171' : '#60a5fa'};font-weight:700;">
                        ${isHellMode ? '<i class="fas fa-skull-crossbones"></i> 地狱模式' : '<i class="fas fa-shield-halved"></i> 普通模式'}
                    </span>
                    <div style="display:flex;align-items:center;gap:10px;">
                        ${this._getTitleBadgeHTML()}
                        <span style="font-size:0.72rem;color:#64748b;">共 ${stages.length} 关</span>
                    </div>
                </div>
                <div class="stages-summary">
                    <div class="summary-card">
                        <div class="summary-num">${totalCleared}</div>
                        <div class="summary-label">已通关</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-num">${totalScore.toFixed(0)}</div>
                        <div class="summary-label">总积分</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-num">${maxStars}</div>
                        <div class="summary-label">星数</div>
                    </div>
                </div>
                <div class="stage-grid">${stageGrid}</div>
            </div>
        `;
    },
    /**
     * BOSS 关卡门造型
     */
    _getBossGateStyle(bossDef, bossType, isLocked, isCleared, isCurrent) {
        const icon = bossDef ? bossDef.icon : 'fa-skull';
        const color = bossDef ? bossDef.color : '#ef4444';
        const isMini = bossType === 'mini';
        
        const bgOpacity = isLocked ? '0.2' : isCleared ? '0.3' : '0.5';
        const borderColor = isLocked ? '#334155' : isCleared ? color + '66' : color;
        const glowIntensity = isCurrent ? '20px' : isCleared ? '8px' : '12px';

        let innerContent;
        if (isLocked) {
            innerContent = `<i class="fas fa-lock" style="font-size:16px;color:#475569;"></i>`;
        } else if (isCleared) {
            innerContent = `<i class="fas fa-trophy" style="font-size:18px;color:#fbbf24;"></i>`;
        } else {
            innerContent = `<i class="fas ${icon}" style="font-size:22px;color:${color};filter:drop-shadow(0 0 6px ${color});"></i>`;
        }

        const html = `
            <div class="boss-gate" style="
                position:absolute;top:0;left:0;right:0;bottom:0;
                display:flex;align-items:center;justify-content:center;
                background:radial-gradient(ellipse at center, ${isMini ? color + '15' : color + '25'} 0%, transparent 70%);
                border-radius:14px;
                pointer-events:none;
            ">
                <div style="
                    width:${isMini ? '44px' : '52px'};height:${isMini ? '44px' : '52px'};
                    border-radius:${isMini ? '50%' : '14px'};
                    border:2px solid ${borderColor};
                    background:rgba(15,23,42,${bgOpacity});
                    display:flex;align-items:center;justify-content:center;
                    box-shadow:0 0 ${glowIntensity} ${color}${isLocked ? '20' : '40'},
                               inset 0 0 ${glowIntensity} ${color}${isLocked ? '10' : '20'};
                    ${!isLocked && isCurrent ? 'animation:boss-gate-pulse 2s ease-in-out infinite;' : ''}
                ">
                    ${innerContent}
                </div>
                ${isMini ? `<div style="position:absolute;top:4px;right:4px;font-size:0.55rem;padding:1px 4px;border-radius:4px;background:${color}22;color:${color};font-weight:600;">小</div>` :
                `<div style="position:absolute;top:4px;right:4px;font-size:0.55rem;padding:1px 4px;border-radius:4px;background:${color}44;color:${color};font-weight:600;">BOSS</div>`}
            </div>
        `;

        return { html };
    },

    // 称号佩戴
    equipTitle(titleId) {
        // 点击已佩戴的称号 → 取消佩戴
        if (this._equippedTitleId === titleId) {
            this._equippedTitleId = null;
            try { localStorage.removeItem('challenge_equipped_title'); } catch(e) {}
            if (typeof API !== 'undefined' && API.request) {
                API.request('user/titles/equip', { method: 'POST', body: JSON.stringify({ titleId: null }) }).catch(() => {});
            }
        } else {
            if (!this._earnedTitles[titleId]) return;
            this._equippedTitleId = titleId;
            try { localStorage.setItem('challenge_equipped_title', titleId); } catch(e) {}
            if (typeof API !== 'undefined' && API.request) {
                API.request('user/titles/equip', { method: 'POST', body: JSON.stringify({ titleId }) }).catch(() => {});
            }
        }
        // 刷新称号墙
        const subContent = document.getElementById('challenge-sub-content');
        if (subContent) this._renderTitlesWall(subContent);
        // 更新header中称号显示
        if (typeof updateEquippedTitleInHeader === 'function') updateEquippedTitleInHeader();
    },
    // BOSS图鉴
    renderBossCodex() {
        const defs = this._bossDefs;
        const subContent = document.getElementById('challenge-sub-content');
        if (!subContent) return;

        let html = `
            <div class="ch-header">
                <button class="ch-back-btn" onclick="ChallengeModule.enterTitles()">
                    <i class="fas fa-arrow-left"></i> 返回称号墙
                </button>
                <h2 class="ch-title">BOSS 图鉴</h2>
                <div class="ch-header-spacer"></div>
            </div>
            <div style="padding:8px 4px 4px;">
                <p style="font-size:0.75rem;color:#64748b;margin-bottom:12px;text-align:center;">
                    闯天关地狱模式中，每个等级末尾将出现大BOSS，4级起还有小BOSS出没。<br>击败它们可获得专属称号！
                </p>
                <div class="boss-codex-grid">
        `;

        const levels = Object.keys(defs).sort((a, b) => parseInt(a) - parseInt(b));
        for (const lv of levels) {
            const d = defs[lv];
            const isFinalBoss = lv === '7';
            const avatarContent = d.image
                ? `<img src="${d.image}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;filter:drop-shadow(0 0 10px ${d.color});" alt="${d.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div style="display:none;width:80px;height:80px;border-radius:50%;align-items:center;justify-content:center;"><i class="fas ${d.icon}" style="font-size:2rem;color:${d.color};filter:drop-shadow(0 0 8px ${d.color});"></i></div>`
                : `<i class="fas ${d.icon}" style="font-size:2rem;color:${d.color};filter:drop-shadow(0 0 8px ${d.color});"></i>`;
            html += `
                <div class="boss-codex-card ${isFinalBoss ? 'final-boss' : ''}" style="border-color:${d.color}33;">
                    <div class="boss-codex-avatar" style="background:radial-gradient(circle,${d.color}22,transparent 70%);border:2px solid ${d.color}44;">
                        ${avatarContent}
                    </div>
                    <div class="boss-codex-info">
                        <div class="boss-codex-name" style="color:${d.color};">${d.name}</div>
                        <div class="boss-codex-level">等级 ${lv} 守关者</div>
                        <div class="boss-codex-desc">${d.desc}</div>
                        ${isFinalBoss ? '<div class="boss-codex-final-tag"><i class="fas fa-crown"></i> 终极BOSS</div>' : ''}
                    </div>
                </div>
            `;
        }

        html += `
                </div>
            </div>
        `;

        subContent.innerHTML = html;
    },
    // 地狱关卡门造型：根据 BIPA 等级返回对应的小门 HTML
    // 关卡门造型：根据模式和 BIPA 等级返回对应的小门 HTML
    _getGateStyle(isHell, levelId, isLocked, isCleared, isCurrent) {
        const lv = parseInt(levelId) || 0;

        // 普通模式门造型：冒险、旅程、探索感
        const normalGates = [
            { icon: 'fa-mountain-sun',   color: '#34d399', glow: 'rgba(52,211,153,0.25)', label: '启程山门',  bg: 'linear-gradient(135deg,rgba(52,211,153,0.12),rgba(16,185,129,0.06))' },
            { icon: 'fa-compass',        color: '#2dd4bf', glow: 'rgba(45,212,191,0.25)', label: '指南之门',  bg: 'linear-gradient(135deg,rgba(45,212,191,0.12),rgba(20,184,166,0.06))' },
            { icon: 'fa-ship',           color: '#38bdf8', glow: 'rgba(56,189,248,0.25)', label: '远航之门',  bg: 'linear-gradient(135deg,rgba(56,189,248,0.12),rgba(14,165,233,0.06))' },
            { icon: 'fa-hat-wizard',     color: '#a78bfa', glow: 'rgba(167,139,250,0.25)',label: '智慧之门',  bg: 'linear-gradient(135deg,rgba(167,139,250,0.12),rgba(139,92,246,0.06))' },
            { icon: 'fa-wand-sparkles',  color: '#c084fc', glow: 'rgba(192,132,252,0.25)',label: '魔法之门',  bg: 'linear-gradient(135deg,rgba(192,132,252,0.12),rgba(168,85,247,0.06))' },
            { icon: 'fa-shield-halved',  color: '#60a5fa', glow: 'rgba(96,165,250,0.25)', label: '守护之门',  bg: 'linear-gradient(135deg,rgba(96,165,250,0.12),rgba(59,130,246,0.06))' },
            { icon: 'fa-chess-rook',     color: '#fbbf24', glow: 'rgba(251,191,36,0.25)', label: '城堡之门',  bg: 'linear-gradient(135deg,rgba(251,191,36,0.12),rgba(245,158,11,0.06))' },
            { icon: 'fa-trophy',         color: '#f59e0b', glow: 'rgba(245,158,11,0.3)',  label: '荣耀之门',  bg: 'linear-gradient(135deg,rgba(245,158,11,0.12),rgba(217,119,6,0.06))' },
        ];

        // 地狱模式门造型：暗黑、金属、压迫感
        const hellGates = [
            { icon: 'fa-door-open',      color: '#a0845c', glow: 'rgba(160,132,92,0.3)',  label: '木门',      bg: 'linear-gradient(135deg,rgba(160,132,92,0.1),rgba(120,113,108,0.05))' },
            { icon: 'fa-archway',        color: '#94a3b8', glow: 'rgba(148,163,184,0.3)', label: '石拱门',    bg: 'linear-gradient(135deg,rgba(148,163,184,0.1),rgba(100,116,139,0.05))' },
            { icon: 'fa-dungeon',        color: '#78716c', glow: 'rgba(120,113,108,0.3)', label: '铁门',      bg: 'linear-gradient(135deg,rgba(120,113,108,0.1),rgba(87,83,78,0.05))' },
            { icon: 'fa-torii-gate',     color: '#cd7f32', glow: 'rgba(205,127,50,0.4)',  label: '青铜门',    bg: 'linear-gradient(135deg,rgba(205,127,50,0.12),rgba(180,83,9,0.06))' },
            { icon: 'fa-landmark',       color: '#c0c0c0', glow: 'rgba(192,192,192,0.4)', label: '银门',      bg: 'linear-gradient(135deg,rgba(192,192,192,0.12),rgba(148,163,184,0.06))' },
            { icon: 'fa-church',         color: '#fbbf24', glow: 'rgba(251,191,36,0.4)',  label: '金门',      bg: 'linear-gradient(135deg,rgba(251,191,36,0.12),rgba(245,158,11,0.06))' },
            { icon: 'fa-gem',            color: '#67e8f9', glow: 'rgba(103,232,249,0.4)', label: '水晶门',    bg: 'linear-gradient(135deg,rgba(103,232,249,0.12),rgba(34,211,238,0.06))' },
            { icon: 'fa-fire',           color: '#f87171', glow: 'rgba(248,113,113,0.5)', label: '烈焰门',    bg: 'linear-gradient(135deg,rgba(248,113,113,0.15),rgba(239,68,68,0.08))' },
        ];

        const gates = isHell ? hellGates : normalGates;
        const g = gates[Math.min(lv, 7)];
        const pulseColor = isHell ? 'rgba(239, 68, 68,' : 'rgba(99, 102, 241,';
        const dimmed = isLocked ? 'opacity:0.3;filter:grayscale(0.8);' : '';
        const clearedStyle = isCleared ? 'filter:saturate(0.5);' : '';
        const currentPulse = isCurrent ? `animation:sg-pulse 2s ease-in-out infinite;` : '';
        const gateBg = g.bg || '';
        const glowBg = isCurrent ? `background:radial-gradient(circle,${g.glow},transparent 70%),${gateBg};` : (gateBg ? `background:${gateBg};` : '');
        const html = `<div class="sg-icon${isHell ? ' sg-hell' : ' sg-normal'}" style="${glowBg}${dimmed}${clearedStyle}${currentPulse}" title="${g.label}">
            <i class="fas ${g.icon}" style="color:${g.color};font-size:1.4rem;"></i>
        </div>`;
        return { html, gate: g };
    },


    // ========== 边框装备逻辑 ==========
    /** 获取用户已解锁的边框列表 */
    _getUnlockedFrames() {
        const frames = [];
        for (const [key, def] of Object.entries(this._frameDefs)) {
            if (this._earnedTitles[def.titleReq]) {
                frames.push({ ...def, key, equipped: this._equippedFrameId === def.id });
            }
        }
        return frames;
    },

    /** 装备/卸下边框 */
    _equipFrame(frameId) {
        if (frameId && !this._frameDefs['frame_' + frameId]) return;
        const prevId = this._equippedFrameId;
        this._equippedFrameId = (frameId && prevId !== frameId) ? frameId : null;
        // 保存到 localStorage
        try { localStorage.setItem('challenge_equipped_frame', this._equippedFrameId || ''); } catch(e) {}
        // 刷新当前视图（称号墙或关卡列表）
        const container = document.getElementById('challenge-sub-content');
        if (container) {
            if (this.currentView === 'titles') {
                this._renderTitlesWall(container);
            } else {
                this.renderStages(container);
            }
        }
    },

    /** 加载已装备的边框 */
    _loadEquippedFrame() {
        try {
            const saved = localStorage.getItem('challenge_equipped_frame');
            if (saved) this._equippedFrameId = saved;
        } catch(e) {}
        // 校验：确保装备的边框已解锁
        if (this._equippedFrameId) {
            const def = this._frameDefs['frame_' + this._equippedFrameId];
            if (!def || !this._earnedTitles[def.titleReq]) {
                this._equippedFrameId = null;
            }
        }
    },

    /** 在称号墙中显示边框选择区域 */
    _renderFrameSelector(container) {
        const allFrames = this._frameDefs;
        const unlockedIds = this._getUnlockedFrames().map(f => f.id);

        let html = `
            <div class="frame-wall-section">
                <div class="frame-wall-header">
                    <i class="fas fa-border-all"></i>
                    <span>关卡边框</span>
                </div>
                <div class="frame-wall-grid">
                    <div class="frame-wall-item ${!this._equippedFrameId ? 'equipped' : ''}" onclick="ChallengeModule._equipFrame(null)">
                        <div class="frame-wall-preview" style="border:2px dashed rgba(148,163,184,0.3);background:transparent;">
                            <i class="fas fa-ban" style="font-size:1.2rem;color:#64748b;"></i>
                        </div>
                        <div class="frame-wall-name" style="color:#94a3b8;">无边框</div>
                        <div class="frame-wall-desc">默认样式</div>
                        <div class="frame-wall-action ${!this._equippedFrameId ? 'equipped' : ''}">
                            <i class="fas ${!this._equippedFrameId ? 'fa-times-circle' : 'fa-hand-pointer'}"></i> ${!this._equippedFrameId ? '点击卸下' : '使用'}
                        </div>
                    </div>
        `;

        for (const [key, frame] of Object.entries(allFrames)) {
            const isUnlocked = unlockedIds.includes(frame.id);
            const isEquipped = this._equippedFrameId === frame.id;
            html += `
                <div class="frame-wall-item ${isUnlocked ? '' : 'locked'} ${isEquipped ? 'equipped' : ''}" onclick="${isUnlocked ? `ChallengeModule._equipFrame('${frame.id}')` : ''}">
                    <div class="frame-wall-preview" style="border:2px solid ${isUnlocked ? frame.color : 'rgba(148,163,184,0.2)'};background:${isUnlocked ? frame.gradient : 'rgba(148,163,184,0.05)'};${isEquipped ? 'box-shadow:0 0 12px ' + frame.color + '40;' : ''}">
                        ${isUnlocked
                            ? `<i class="fas fa-square" style="font-size:1.2rem;color:${frame.color};filter:drop-shadow(0 0 4px ${frame.color});"></i>`
                            : `<i class="fas fa-lock" style="font-size:1rem;color:#475569;"></i>`
                        }
                    </div>
                    <div class="frame-wall-name" style="color:${isUnlocked ? frame.color : '#475569'};">${isUnlocked ? frame.name : '???'}</div>
                    <div class="frame-wall-desc">${isUnlocked ? frame.desc : '击败对应BOSS解锁'}</div>
                    ${isUnlocked ? `
                    <div class="frame-wall-action ${isEquipped ? 'equipped' : ''}">
                        <i class="fas ${isEquipped ? 'fa-times-circle' : 'fa-hand-pointer'}"></i> ${isEquipped ? '点击卸下' : '使用'}
                    </div>` : ''}
                </div>
            `;
        }

        html += `</div></div>`;
        return html;
    },

    _renderStars(count) {
        let html = '<div class="mini-stars">';
        for (let i = 0; i < 3; i++) {
            html += `<i class="fas fa-star ${i < count ? 'earned' : ''}"></i>`;
        }
        html += '</div>';
        return html;
    },

    // ========== 答题界面 ==========
    enterStage(stageId) {
        // 检查闯天关是否启用（管理员不受限）
        if (window._systemInfo && window._systemInfo.challengeEnabled === false && !this._isAdmin()) {
            alert('闯天关功能尚未开放');
            return;
        }
        // 检查关卡是否为仅展示（锁定）
        const stage = this.allStages.find(s => s.id === stageId);
        if (!stage) return;
        if (stage._readonly && !this._isAdmin()) {
            alert('该课程暂未开放闯关，请耐心等待');
            return;
        }
        this.currentStageId = stageId;
        // 检查地狱模式关卡是否开放
        const _hs = window._systemInfo && (window._systemInfo.hellSettings || window._systemInfo);
        const isHellMode = this.challengeMode === 'hell';
        const hellEnabled = window._systemInfo ? (window._systemInfo.hellSettings ? window._systemInfo.hellSettings.enabled !== false : window._systemInfo.hellModeEnabled !== false) : true;
        if (false && !hellEnabled) {
            alert('地狱模式尚未开放，请耐心等待');
            this.currentStageId = null;
            this.render();
            return;
        }

        // 动态抽样：根据后台配置决定题目数量和类型
        const sysInfo = window._systemInfo || {};
        const isHell = this.challengeMode === 'hell';

        // 优先读取新结构 normalSettings/hellSettings，fallback 到旧字段
        const modeSettings = isHell
            ? (sysInfo.hellSettings || {})
            : (sysInfo.normalSettings || {});
        const fallbackQC = isHell
            ? (sysInfo.hellQuestionCount || 10)
            : (sysInfo.challengeQuestionCount || 5);
        const fallbackQT = isHell
            ? (sysInfo.hellQuestionType || 'mixed')
            : (sysInfo.challengeQuestionType || 'mixed');
        const questionCount = modeSettings.questionCount || fallbackQC;
        const questionType = modeSettings.questionType || fallbackQT;
        const questionOrder = modeSettings.questionOrder || 'random';
        const shouldShuffle = questionOrder !== 'sequential';

        // 从关卡所属的unit数据中收集题目池
        const levelData = CourseContent.getLevel(stage.levelId);
        // 题目收集：优先使用 stage 预切分的 questions（自动分配模式下内容已混合切好）
        // 如果 stage 有 questions 且管理员设置了混合类型，直接使用 stage 预切分内容
        let questions;
        if (stage.questions && stage.questions.length > 0 && (questionType === 'mixed' || questionType === stage.type)) {
            // 使用预切分内容，按 questionCount 洗牌后截取
            const src = stage.questions.slice();
            questions = shouldShuffle ? this._shuffle(src).slice(0, questionCount) : src.slice(0, questionCount);
        } else {
            // 从 unit 全量重新抽样（手动分配模式下 questionType 可能与 stage.type 不同）
            questions = this._sampleQuestions(levelData, stage.unitId, questionType, questionCount);
        }

        // 按题型权重扩展题目池：同一内容可生成多种题型
        questions = this._expandQuestionsByType(questions, modeSettings, isHell);
        if (questions.length === 0) questions = this._expandQuestionsByType(shouldShuffle ? this._shuffle(stage.questions.slice()) : stage.questions.slice(), { choiceWeight: 10, fillWeight: 0, listeningWeight: 0 }, isHell);
        // 洗牌（顺序模式下跳过）
        if (shouldShuffle) questions = this._shuffle(questions);

        const isBoss = stage._isBoss === true;
        const bossParams = isBoss ? (stage.bossParams || { bossHp: 5, userHp: 3, hpMode: 1 }) : null;
        const bossHpMode = isBoss ? (bossParams.hpMode || 1) : 0;
        const bossDef = isBoss ? stage.bossDef : null;

        this.challengeState = {
            stageId,
            questions: questions,
            currentIndex: 0,
            correct: 0,
            answers: [],
            startTime: isHell ? Date.now() : null,
            totalQuestions: questions.length,
            phase: isHell ? 'playing' : 'ready', // ready(普通-等开始) / playing(答题中)
            // BOSS 战相关
            isBoss: isBoss,
            bossParams: bossParams,
            bossDef: bossDef,
            bossType: isBoss ? stage.bossType : null,
            bossLevel: isBoss ? stage.bossLevel : null,
            bossHpMode: bossHpMode,
            bossHp: isBoss ? bossParams.bossHp : 0,
            bossMaxHp: isBoss ? bossParams.bossHp : 0,
            userHp: isBoss ? bossParams.userHp : 0,
            userMaxHp: isBoss ? bossParams.userHp : 0,
            bossPhase: isBoss ? 'normal' : null, // normal | rage | defeated
            rageThreshold: isBoss ? (bossParams.rageThreshold || 0.25) : 0,
            rageDamage: isBoss ? (bossParams.rageDamage || 2) : 0,
            lastStandUsed: false,
            userTookDamage: false, // 追踪用户是否掉过血（用于完美击杀称号）
            currentStreak: 0, // 当前连胜（连续答对题数）
            maxStreak: 0, // 本关最大连胜
        };

        this._inChallenge = true;
        this._chIsPlaying = false;
        this._beforeUnloadHandler = function(e) {
            e.preventDefault();
            e.returnValue = '闯关进行中，确定要离开吗？成绩将不会保存。';
            return e.returnValue;
        };
        window.addEventListener('beforeunload', this._beforeUnloadHandler);

        this.render();
    },

    /**
     * 动态抽样：从关卡所属unit的题库中按类型和数量随机抽取题目
     */
    _sampleQuestions(levelData, unitId, questionType, count) {
        if (!levelData) return [];
        const unit = (levelData.units || []).find(u => u.id === unitId);
        if (!unit) return [];

        let pool = [];
        if (questionType === 'words') {
            pool = (unit.words || []).slice();
        } else if (questionType === 'sentences') {
            pool = (unit.sentences || []).slice();
        } else if (questionType === 'dialogues') {
            pool = (unit.dialogues || []).slice();
        } else {
            // mixed: 从所有类型中均匀抽样
            const all = [];
            (unit.words || []).forEach(w => all.push(w));
            (unit.sentences || []).forEach(s => all.push(s));
            (unit.dialogues || []).forEach(d => all.push(d));
            pool = all;
        }

        // Fisher-Yates 洗牌后取前count个
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        return pool.slice(0, count);
    },
    /**
     * 按题型权重扩展题目：同一内容可生成多种题型（选择/填空/听力）
     * @param {Array} contents - 原始内容列表
     * @param {Object} typeConfig - { choiceWeight, fillWeight, listeningWeight, fillMode, listeningSpeed, listeningReplays }
     * @param {Boolean} isHell - 是否地狱模式
     * @returns {Array} 扩展后的题目列表，每项额外带 _qType 字段
     */
    _expandQuestionsByType(contents, typeConfig, isHell) {
        const cw = typeConfig.choiceWeight || 0;
        const fw = typeConfig.fillWeight || 0;
        const lw = typeConfig.listeningWeight || 0;
        const totalW = cw + fw + lw;
        
        // 如果没有配置权重（旧版本兼容），默认全部为选择题
        if (totalW === 0) {
            return contents.map(c => ({ ...c, _qType: 'choice' }));
        }
        
        // 叠加模式：每个内容按启用的题型各生成一个副本，1题变多题
        const fillMode = typeConfig.fillMode || 'input';
        const listenSpeed = typeConfig.listeningSpeed || '1.0';
        const listenReplays = typeConfig.listeningReplays || 2;
        
        const expanded = [];
        for (const item of contents) {
            if (cw > 0) expanded.push({ ...item, _qType: 'choice' });
            if (fw > 0) expanded.push({ ...item, _qType: 'fill', _fillMode: fillMode });
            if (lw > 0) expanded.push({ ...item, _qType: 'listening', _listenSpeed: listenSpeed, _listenReplays: listenReplays });
        }
        
        return expanded;
    },

    // ========== 填空题交互 ==========
    pickFillLetter(btn, letter) {
        const pool = document.getElementById('fill-letter-pool');
        const answerBox = document.getElementById('fill-answer-box');
        if (!pool || !answerBox) return;
        // 从字母池移除
        btn.style.opacity = '0.3';
        btn.style.pointerEvents = 'none';
        // 添加到答案框
        const chip = document.createElement('span');
        chip.textContent = letter;
        chip.className = 'fill-chip';
        chip.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:6px;background:rgba(96,165,250,0.2);color:#60a5fa;border:1px solid rgba(96,165,250,0.4);font-size:0.95rem;font-weight:600;cursor:pointer;';
        chip.onclick = function() {
            chip.remove();
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
        };
        answerBox.appendChild(chip);
    },

    submitFillAnswer() {
        const state = this.challengeState;
        if (!state) return;
        const answerBox = document.getElementById('fill-answer-box');
        const inputEl = document.getElementById('fill-input-answer');
        const q = state.questions[state.currentIndex];
        const isDialogue = q.lines !== undefined;
        const correctAnswer = (isDialogue ? (q.title || '') : (q.indonesian || '')).toLowerCase();
        let userAnswer = '';

        if (answerBox) {
            const chips = answerBox.querySelectorAll('.fill-chip');
            userAnswer = Array.from(chips).map(c => c.textContent.toLowerCase()).join('');
        } else if (inputEl) {
            userAnswer = inputEl.value.trim().toLowerCase();
        }

        const isCorrect = userAnswer === correctAnswer;
        if (isCorrect) state.correct++;
        // 使用索引赋值（与answerQuestion一致），支持跳题和返回
        state.answers[state.currentIndex] = { selected: userAnswer, correct: correctAnswer, isCorrect };

        const isImmediateGrading = this._isImmediateGrading();

        if (isImmediateGrading) {
            // 即时阅卷：显示反馈
            const container = document.getElementById('challenge-question');
            if (container) {
                const feedback = document.createElement('div');
                feedback.style.cssText = 'margin:16px 0;padding:14px 18px;border-radius:12px;text-align:center;font-weight:600;font-size:0.95rem;';
                if (isCorrect) {
                    feedback.style.background = 'rgba(16,185,129,0.15)';
                    feedback.style.color = '#10b981';
                    feedback.style.border = '1px solid rgba(16,185,129,0.3)';
                    feedback.innerHTML = '<i class="fas fa-check-circle" style="margin-right:6px;"></i>回答正确！';
                } else {
                    feedback.style.background = 'rgba(239,68,68,0.15)';
                    feedback.style.color = '#f87171';
                    feedback.style.border = '1px solid rgba(239,68,68,0.3)';
                    feedback.innerHTML = '<i class="fas fa-times-circle" style="margin-right:6px;"></i>回答错误！正确答案：<span style="color:#e2e8f0;">' + (isDialogue ? q.title : q.indonesian) + '</span>';
                }
                const area = document.getElementById('challenge-question');
                if (area) {
                    area.querySelectorAll('button, input').forEach(el => { el.disabled = true; el.style.pointerEvents = 'none'; el.style.opacity = '0.5'; });
                }
                container.appendChild(feedback);
            }

            // 准确率淘汰检测
            const knockout = this._checkAccuracyKnockout();
            if (knockout) {
                clearInterval(this._timerInterval);
                setTimeout(() => {
                    const subContent = document.getElementById('challenge-sub-content');
                    if (subContent) this._renderStageResult(subContent, true);
                }, 800);
                return;
            }

            // 自动跳转下一题
            setTimeout(() => {
                state.currentIndex++;
                if (state.currentIndex >= state.totalQuestions) {
                    clearInterval(this._timerInterval);
                }
                const subContent = document.getElementById('challenge-sub-content');
                if (subContent) this._renderPlayArea(subContent);
            }, 1200);
        } else {
            // 交卷阅卷模式：不显示反馈，直接跳下一题
            state.currentIndex++;
            const subContent = document.getElementById('challenge-sub-content');
            if (subContent) this._renderPlayArea(subContent);
        }
    },

    // ========== 听力题交互 ==========
    playListening(text, speed, replays) {
        const decodedText = decodeURIComponent(text);
        if (!decodedText) return;
        // 取消之前的语音
        if (window._listenUtterance) { speechSynthesis.cancel(); window._listenUtterance = null; }
        const normSpeed = parseFloat(speed) || 1.0;
        const totalReplays = parseInt(replays) || 2;
        let count = 0;
        const btn = document.getElementById('listen-play-btn');
        if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        function doListenPlay() {
            if (typeof googleSpeech === 'function') {
                googleSpeech(decodedText, normSpeed).then(() => {
                    count++;
                    if (count < totalReplays) { setTimeout(doListenPlay, 300); }
                    else { if (btn) btn.innerHTML = '<i class="fas fa-volume-up"></i>'; }
                }).catch(() => { synthFallbackListen(); });
            } else {
                synthFallbackListen();
            }
        }

        function synthFallbackListen() {
            const utt = new SpeechSynthesisUtterance(decodedText);
            utt.lang = 'id-ID';
            utt.rate = normSpeed;
            utt.pitch = 1.0;
            window._listenUtterance = utt;
            utt.onend = function() {
                count++;
                if (count < totalReplays) { setTimeout(() => speechSynthesis.speak(utt), 300); }
                else { if (btn) btn.innerHTML = '<i class="fas fa-volume-up"></i>'; }
            };
            speechSynthesis.speak(utt);
        }

        doListenPlay();
    },



    _renderPlayArea(container) {
        const state = this.challengeState;
        if (!state) { this.currentStageId = null; this.renderStages(container); return; }

        // 已完成所有题目且在playing状态 → 显示结果
        if (state.currentIndex >= state.totalQuestions && state.phase === 'playing') {
            this._renderStageResult(container);
            return;
        }

        const _isHellStage = this.challengeMode === 'hell';
        const total = state.totalQuestions;
        const stageIndex = this.allStages.findIndex(s => s.id === state.stageId) + 1;

        // ===== ready 状态：显示"开始闯关"界面 =====
        if (state.phase === 'ready') {
            const stage = this.allStages.find(s => s.id === state.stageId);
            const stageName = stage ? stage.name : ('\u7b2c' + stageIndex + '\u5173');

            if (state.isBoss) {
                // BOSS \u5173\u5361\u7279\u6b8a\u51c6\u5907\u754c\u9762
                const bossDef = state.bossDef || {};
                const bossColor = bossDef.color || '#ef4444';
                const bossName = bossDef.name || 'BOSS';
                const bossIcon = bossDef.icon || 'fa-skull';
                const bossDesc = bossDef.desc || '';
                const bossImage = bossDef.image || '';
                const ragePct = Math.round((state.rageThreshold || 0.25) * 100);
                container.innerHTML = `
                    <div class="challenge-play-page boss-loading-page">
                        <div class="boss-loading-overlay" id="boss-loading-overlay">
                            <div class="boss-loading-content">
                                <div class="boss-loading-spinner"></div>
                                <div class="boss-loading-text">\u8f7d\u5165\u4e2d...</div>
                            </div>
                        </div>
                        <div class="boss-loading-main">
                            <div class="boss-loading-visual">
                                ${bossImage ? `<img src="${bossImage}" class="boss-loading-avatar" style="border-color:${bossColor};" alt="${bossName}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
                                <div class="boss-loading-avatar-fallback" style="border-color:${bossColor};"><i class="fas ${bossIcon}" style="color:${bossColor};font-size:3rem;"></i></div>` : `<div class="boss-loading-avatar-fallback" style="border-color:${bossColor};"><i class="fas ${bossIcon}" style="color:${bossColor};font-size:3rem;"></i></div>`}
                            </div>
                            <div class="boss-loading-info">
                                <div class="boss-loading-name" style="color:${bossColor};">${bossName}</div>
                                <div class="boss-loading-desc">${bossDesc}</div>
                                <div class="boss-loading-stats">
                                    <div class="boss-loading-stat">
                                        <div class="boss-loading-stat-icon" style="color:#f87171;"><i class="fas fa-heart"></i></div>
                                        <div class="boss-loading-stat-info">
                                            <div class="boss-loading-stat-label">BOSS \u8840\u91cf</div>
                                            <div class="boss-loading-stat-value" style="color:${bossColor};">${state.bossMaxHp}</div>
                                        </div>
                                    </div>
                                    <div class="boss-loading-stat">
                                        <div class="boss-loading-stat-icon" style="color:#34d399;"><i class="fas fa-shield-halved"></i></div>
                                        <div class="boss-loading-stat-info">
                                            <div class="boss-loading-stat-label">\u4f60\u7684\u751f\u547d</div>
                                            <div class="boss-loading-stat-value" style="color:#34d399;">${state.userMaxHp}</div>
                                        </div>
                                    </div>
                                    <div class="boss-loading-stat">
                                        <div class="boss-loading-stat-icon" style="color:#fbbf24;"><i class="fas fa-fire"></i></div>
                                        <div class="boss-loading-stat-info">
                                            <div class="boss-loading-stat-label">\u66b4\u6012\u89e6\u53d1</div>
                                            <div class="boss-loading-stat-value" style="color:#fbbf24;">HP ${ragePct}%</div>
                                        </div>
                                    </div>
                                    <div class="boss-loading-stat">
                                        <div class="boss-loading-stat-icon" style="color:#f87171;"><i class="fas fa-bolt"></i></div>
                                        <div class="boss-loading-stat-info">
                                            <div class="boss-loading-stat-label">\u66b4\u6012\u4f24\u5bb3</div>
                                            <div class="boss-loading-stat-value" style="color:#f87171;">\u00d7${state.rageDamage || 2}</div>
                                        </div>
                                    </div>
                                </div>
                                <div class="boss-loading-tips">
                                    <div class="boss-loading-tip"><i class="fas fa-lightbulb" style="color:#fbbf24;"></i> \u7b54\u5bf9\u6263\u51cfBOSS\u8840\u91cf\uff0c\u7b54\u9519\u6263\u51cf\u81ea\u5df1\u751f\u547d</div>
                                    <div class="boss-loading-tip"><i class="fas fa-fire" style="color:#f87171;"></i> BOSS \u66b4\u6012\u540e\u4f24\u5bb3\u7ffb\u500d\uff0c\u8c28\u614e\u7b54\u9898!</div>
                                    <div class="boss-loading-tip"><i class="fas fa-star" style="color:#fbbf24;"></i> \u6700\u540e\u4e00\u6ef4\u8840\u89e6\u53d1\u6700\u540e\u4e00\u640f\uff0c\u53cd\u51fbBOSS!</div>
                                </div>
                                <button class="ch-start-btn boss-loading-start-btn" onclick="ChallengeModule._startBossWithLoading()" style="background:linear-gradient(135deg,${bossColor},${bossColor}cc);border-color:${bossColor};">
                                    <i class="fas fa-swords"></i> \u6311\u6218 BOSS
                                </button>
                            </div>
                        </div>
                        <div style="margin-top:16px;display:flex;justify-content:center;">
                            <button style="background:rgba(148,163,184,0.1);color:#94a3b8;border:1px solid rgba(148,163,184,0.2);padding:8px 16px;border-radius:10px;cursor:pointer;font-size:0.78rem;display:flex;align-items:center;gap:5px;" onclick="ChallengeModule.confirmExit()">
                                <i class="fas fa-arrow-left"></i> \u8fd4\u56de\u5173\u5361
                            </button>
                        </div>
                    </div>`;

                // \u9884\u52a0\u8f7dBOSS\u56fe\u7247
                if (bossImage) {
                    const img = new Image();
                    img.onload = () => {
                        const overlay = document.getElementById('boss-loading-overlay');
                        if (overlay) { overlay.style.opacity = '0'; setTimeout(() => overlay.remove(), 400); }
                    };
                    img.onerror = () => {
                        const overlay = document.getElementById('boss-loading-overlay');
                        if (overlay) { overlay.style.opacity = '0'; setTimeout(() => overlay.remove(), 400); }
                    };
                    img.src = bossImage;
                    // \u8d85\u65f6\u81ea\u52a8\u9690\u85cf\u52a0\u8f7d
                    setTimeout(() => {
                        const overlay = document.getElementById('boss-loading-overlay');
                        if (overlay) { overlay.style.opacity = '0'; setTimeout(() => overlay.remove(), 400); }
                    }, 3000);
                }
            } else {
            container.innerHTML = `
                <div class="challenge-play-page">
                    <div class="challenge-play-header">
                        <div class="challenge-play-title">\u7b2c${stageIndex}\u5173 \u00b7 ${stageName}</div>
                    </div>
                    <div class="ch-ready-panel">
                        <div class="ch-ready-icon"><i class="fas fa-play-circle"></i></div>
                        <div class="ch-ready-title">\u51c6\u5907\u597d\u4e86\u5417\uff1f</div>
                        <div class="ch-ready-desc">\u672c\u5173\u5171 <span class="ch-ready-count">${total}</span> \u9898\uff0c\u70b9\u51fb\u5f00\u59cb\u540e\u8ba1\u65f6</div>
                        <div class="ch-ready-rules">
                            <div class="ch-ready-rule"><i class="fas fa-check"></i> \u4ea4\u5377\u540e\u624d\u516c\u5e03\u6210\u7ee9</div>
                            <div class="ch-ready-rule"><i class="fas fa-check"></i> \u53ef\u8df3\u8fc7\u4e0d\u4f1a\u7684\u9898</div>
                            <div class="ch-ready-rule"><i class="fas fa-check"></i> \u53ef\u8fd4\u56de\u68c3\u67e5\u5df2\u7b54\u9898\u76ee</div>
                        </div>
                        <button class="ch-start-btn" onclick="ChallengeModule.startChallenge()">
                            <i class="fas fa-rocket"></i> \u5f00\u59cb\u95ef\u5173
                        </button>
                    </div>
                    <div style="margin-top:20px;display:flex;justify-content:center;">
                        <button style="background:rgba(148,163,184,0.1);color:#94a3b8;border:1px solid rgba(148,163,184,0.2);padding:8px 16px;border-radius:10px;cursor:pointer;font-size:0.78rem;display:flex;align-items:center;gap:5px;" onclick="ChallengeModule.confirmExit()">
                            <i class="fas fa-arrow-left"></i> \u8fd4\u56de\u5173\u5361
                        </button>
                    </div>
                </div>
            `;
            return;
        }
            } // end isBoss else

        // ===== playing 状态：所有题已浏览完 → 提示交卷 =====
        if (state.currentIndex >= state.totalQuestions) {
            container.innerHTML = `
                <div class="challenge-play-page">
                    <div class="challenge-play-header">
                        <div class="challenge-play-title">\u7b2c${stageIndex}\u5173</div>
                        <div class="challenge-timer"><i class="fas fa-clock"></i> --:--</div>
                    </div>
                    <div class="ch-ready-panel">
                        <div class="ch-ready-icon" style="color:#fbbf24;"><i class="fas fa-clipboard-check"></i></div>
                        <div class="ch-ready-title">\u6240\u6709\u9898\u76ee\u5df2\u4f5c\u7b54</div>
                        <div class="ch-ready-desc">\u8bf7\u68c0\u67e5\u540e\u63d0\u4ea4\u8bd5\u5377</div>
                        <button class="ch-start-btn" style="background:linear-gradient(135deg,rgba(251,191,36,0.25),rgba(251,191,36,0.15));color:#fbbf24;border-color:rgba(251,191,36,0.5);" onclick="ChallengeModule.confirmFinish()">
                            <i class="fas fa-file-alt"></i> \u4ea4\u5377
                        </button>
                    </div>
                </div>
            `;
            return;
        }

        const q = state.questions[state.currentIndex];
        const qType = q._qType || 'choice';
        const current = state.currentIndex + 1;
        const progressPct = Math.round(current / total * 100);
        const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
        const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const ss = String(elapsed % 60).padStart(2, '0');

        const isDialogue = q.lines !== undefined;
        const correctAnswer = isDialogue ? (q.title || '') : (q.chinese || '');
        const indoText = isDialogue ? (q.title_id || '') : (q.indonesian || '');

        const qTypeLabel = qType === 'choice' ? '\u9009\u62e9\u9898' : qType === 'fill' ? '\u586b\u7a7a\u9898' : '\u542c\u529b\u9898';
        const qTypeColor = qType === 'choice' ? '#60a5fa' : qType === 'fill' ? '#f59e0b' : '#10b981';
        const qTypeIcon = qType === 'choice' ? 'fa-check-circle' : qType === 'fill' ? 'fa-keyboard' : 'fa-headphones';

        const isImmediateGrading = this._isImmediateGrading();
        const isAlreadyAnswered = !!state.answers[state.currentIndex];
        // 语速/循环控制：根据后台设置决定是否显示
        const _sysInfo2 = window._systemInfo || {};
        const _modeSettings = _isHellStage ? (_sysInfo2.hellSettings || {}) : (_sysInfo2.normalSettings || {});
        const showSliders = _modeSettings.speedControl !== false && _modeSettings.loopControl !== false;

        // 构建选项池
        let options = [];
        if (qType === 'choice' || qType === 'listening') {
            const allOptions = state.questions.map(item => {
                if (item.lines !== undefined) return item.title || '';
                return item.chinese || '';
            }).filter(Boolean);
            const wrongOptions = this._shuffle(allOptions.filter(o => o !== correctAnswer)).slice(0, 3);
            options = this._shuffle([correctAnswer, ...wrongOptions]);
        }

        let questionContent = '';

        if (qType === 'choice') {
            if (isDialogue) {
                questionContent = `
                    <div class="challenge-q-type"><i class="fas ${qTypeIcon}" style="color:${qTypeColor};margin-right:4px;"></i>${qTypeLabel}</div>
                    <div class="challenge-q-title">${q.title || ''}</div>
                    <div style="display:flex;align-items:center;gap:10px;">
                        ${q.title_id ? `<button class="circle-btn play-btn ch-speak-btn" onclick="ChallengeModule.challengeToggleSpeak('${encodeURIComponent(q.title_id)}')" style="flex-shrink:0;width:42px;height:42px;font-size:1rem;"><i class="fas fa-play ch-play-ico"></i></button>` : ''}
                        <div class="challenge-q-indo ch-speak-btn" ${q.title_id ? `onclick="ChallengeModule.challengeToggleSpeak('${encodeURIComponent(q.title_id)}')" style="cursor:pointer;"` : ''} style="flex:1;">${q.title_id || ''}</div>
                    </div>
                    <div class="challenge-q-prompt">\u8fd9\u4e2a\u5bf9\u8bdd\u7684\u4e3b\u9898\u662f\u4ec0\u4e48\uff1f</div>
                `;
            } else {
                questionContent = `
                    <div class="challenge-q-type"><i class="fas ${qTypeIcon}" style="color:${qTypeColor};margin-right:4px;"></i>${qTypeLabel}</div>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <button class="circle-btn play-btn ch-speak-btn" onclick="ChallengeModule.challengeToggleSpeak('${encodeURIComponent(q.indonesian)}')" style="flex-shrink:0;width:42px;height:42px;font-size:1rem;"><i class="fas fa-play ch-play-ico"></i></button>
                        <div class="challenge-q-indo ch-speak-btn" onclick="ChallengeModule.challengeToggleSpeak('${encodeURIComponent(q.indonesian)}')" style="cursor:pointer;flex:1;">${q.indonesian}</div>
                    </div>
                    <div class="challenge-q-prompt">\u8bf7\u9009\u62e9\u6b63\u786e\u7684\u4e2d\u6587\u91ca\u4e49\uff1a</div>
                `;
            }
            questionContent += `<div class="challenge-options">${options.map((opt, i) => `
                <button class="challenge-option${isAlreadyAnswered ? ' ch-option-locked' : ''}" ${isAlreadyAnswered ? 'disabled style="pointer-events:none;opacity:0.5;"' : `onclick="ChallengeModule.answerQuestion(this, '${encodeURIComponent(opt)}', '${encodeURIComponent(correctAnswer)}')"`}>
                    <span class="challenge-option-letter">${'ABCD'[i]}</span>
                    <span class="challenge-option-text">${opt}</span>
                </button>`).join('')}</div>`;

        } else if (qType === 'fill') {
            const fillMode = q._fillMode || 'input';
            if (fillMode === 'select') {
                const correctWord = (isDialogue ? (q.title || '') : (q.indonesian || '')).toLowerCase();
                const letters = correctWord.split('');
                const extraLetters = 'abcdefghijklmnopqrstuvwxyz'.split('').filter(l => !letters.includes(l));
                const shuffledExtra = this._shuffle(extraLetters).slice(0, Math.max(4, 12 - letters.length));
                const allLetters = this._shuffle([...letters, ...shuffledExtra]);
                questionContent = `
                    <div class="challenge-q-type"><i class="fas ${qTypeIcon}" style="color:${qTypeColor};margin-right:4px;"></i>${qTypeLabel}\uff08\u62fc\u9009\uff09</div>
                    <div style="font-size:1.15rem;color:#e2e8f0;font-weight:600;text-align:center;margin:12px 0;">${correctAnswer}</div>
                    <div class="challenge-q-prompt">\u8bf7\u4ece\u4e0b\u65b9\u5b57\u6bcd\u4e2d\u62fc\u9009\u51fa\u6b63\u786e\u7684\u5370\u5c3c\u8bed\uff1a</div>
                    <div id="fill-answer-box" style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center;min-height:48px;padding:10px;border:2px dashed rgba(255,255,255,0.15);border-radius:10px;margin:12px 0;background:rgba(15,23,42,0.4);" data-answer="${encodeURIComponent(correctWord)}"></div>
                    <div id="fill-letter-pool" style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:8px;">
                        ${allLetters.map(l => `<button class="fill-letter-btn" onclick="ChallengeModule.pickFillLetter(this, '${l}')" style="width:40px;height:40px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(15,23,42,0.8);color:#e2e8f0;font-size:1rem;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s;">${l}</button>`).join('')}
                    </div>
                    <button class="challenge-option" onclick="ChallengeModule.submitFillAnswer()" style="margin-top:16px;width:100%;padding:12px;text-align:center;border-radius:12px;background:rgba(251,191,36,0.2);color:#fbbf24;border:1px solid rgba(251,191,36,0.4);font-weight:600;font-size:0.95rem;cursor:pointer;">
                        <i class="fas fa-paper-plane" style="margin-right:6px;"></i>\u786e\u8ba4\u63d0\u4ea4
                    </button>
                `;
            } else {
                questionContent = `
                    <div class="challenge-q-type"><i class="fas ${qTypeIcon}" style="color:${qTypeColor};margin-right:4px;"></i>${qTypeLabel}\uff08\u8f93\u5165\uff09</div>
                    <div style="font-size:1.15rem;color:#e2e8f0;font-weight:600;text-align:center;margin:12px 0;">${correctAnswer}</div>
                    <div class="challenge-q-prompt">\u8bf7\u8f93\u5165\u5bf9\u5e94\u7684\u5370\u5c3c\u8bed\uff1a</div>
                    <input type="text" id="fill-input-answer" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="\u8f93\u5165\u5370\u5c3c\u8bed..."
                        style="width:100%;padding:14px 18px;background:rgba(15,23,42,0.8);color:#e2e8f0;border:2px solid rgba(255,255,255,0.15);border-radius:12px;font-size:1.1rem;text-align:center;outline:none;margin:12px 0;font-family:inherit;"
                        onkeydown="if(event.key==='Enter')ChallengeModule.submitFillAnswer()">
                    <button class="challenge-option" onclick="ChallengeModule.submitFillAnswer()" style="width:100%;padding:12px;text-align:center;border-radius:12px;background:rgba(251,191,36,0.2);color:#fbbf24;border:1px solid rgba(251,191,36,0.4);font-weight:600;font-size:0.95rem;cursor:pointer;">
                        <i class="fas fa-paper-plane" style="margin-right:6px;"></i>\u786e\u8ba4\u63d0\u4ea4
                    </button>
                `;
            }

        } else if (qType === 'listening') {
            const listenSpeed = q._listenSpeed || '1.0';
            const listenReplays = q._listenReplays || 2;
            questionContent = `
                <div class="challenge-q-type"><i class="fas ${qTypeIcon}" style="color:${qTypeColor};margin-right:4px;"></i>${qTypeLabel}</div>
                <div style="text-align:center;padding:20px 0;">
                    <button class="circle-btn play-btn" id="listen-play-btn" onclick="ChallengeModule.playListening('${encodeURIComponent(indoText)}', ${listenSpeed}, ${listenReplays})" style="width:72px;height:72px;font-size:1.6rem;margin:0 auto;display:flex;align-items:center;justify-content:center;border-radius:50%;"><i class="fas fa-volume-up"></i></button>
                    <div style="font-size:0.8rem;color:#64748b;margin-top:10px;">\u70b9\u51fb\u64ad\u653e\u97f3\u9891\uff08\u81ea\u52a8\u64ad\u653e ${listenReplays} \u6b21\uff09</div>
                </div>
                <div class="challenge-q-prompt">\u542c\u53d1\u97f3\uff0c\u9009\u62e9\u6b63\u786e\u7684\u4e2d\u6587\u91ca\u4e49\uff1a</div>
            `;
            questionContent += `<div class="challenge-options">${options.map((opt, i) => `
                <button class="challenge-option${isAlreadyAnswered ? ' ch-option-locked' : ''}" ${isAlreadyAnswered ? 'disabled style="pointer-events:none;opacity:0.5;"' : `onclick="ChallengeModule.answerQuestion(this, '${encodeURIComponent(opt)}', '${encodeURIComponent(correctAnswer)}')"`}>
                    <span class="challenge-option-letter">${'ABCD'[i]}</span>
                    <span class="challenge-option-text">${opt}</span>
                </button>`).join('')}</div>`;
        }

        // ===== 题号导航条 =====
        const showNav = this._shouldShowNav();
        const canSkip = this._canSkip();
        const canReturn = this._canReturnToAnswered();

        let navBarHtml = '';
        if (showNav) {
            const answeredCount = state.answers.filter(a => a !== undefined && a !== null).length;
            const skippedCount = state.answers.filter(a => a === null).length;
            navBarHtml = `<div class="ch-question-nav">
                <div class="ch-nav-stats">
                    <span class="ch-nav-stat ch-nav-answered"><i class="fas fa-check"></i> ${answeredCount} \u5df2\u7b54</span>
                    ${skippedCount > 0 ? `<span class="ch-nav-stat ch-nav-skipped"><i class="fas fa-forward"></i> ${skippedCount} \u8df3\u8fc7</span>` : ''}
                    <span class="ch-nav-stat ch-nav-remaining"><i class="fas fa-circle"></i> ${total - answeredCount - skippedCount} \u672a\u7b54</span>
                </div>
                <div class="ch-nav-dots">
                    ${state.questions.map((_, i) => {
                        let cls = 'ch-nav-dot';
                        let icon = (i + 1);
                        if (state.answers[i] === null) { cls += ' ch-nav-dot-skipped'; icon = '<i class="fas fa-forward"></i>'; }
                        else if (state.answers[i]) { cls += ' ch-nav-dot-answered'; icon = '<i class="fas fa-check"></i>'; }
                        if (i === state.currentIndex) cls += ' ch-nav-dot-current';
                        const clickable = (canReturn || i >= state.currentIndex) && i !== state.currentIndex;
                        return `<button class="${cls}" ${clickable ? `onclick="ChallengeModule.jumpToQuestion(${i})"` : ''} title="\u7b2c${i+1}\u9898">${icon}</button>`;
                    }).join('')}
                </div>
                ${!isImmediateGrading && skippedCount > 0 ? `<div class="ch-nav-quick-actions">
                    <button class="ch-nav-quick-btn" onclick="ChallengeModule._jumpToFirstSkipped()" title="\u8df3\u8f6c\u5230\u7b2c\u4e00\u4e2a\u8df3\u8fc7\u7684\u9898"><i class="fas fa-forward"></i> \u8df3\u8fc7\u9898</button>
                </div>` : ''}
            </div>`;
        }

        // ===== 底部操作按钮 =====
        let bottomBtns = '';
        if (!isImmediateGrading) {
            bottomBtns = `<div style="margin-top:16px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
                <div style="display:flex;gap:8px;">
                    <button style="background:rgba(148,163,184,0.1);color:#94a3b8;border:1px solid rgba(148,163,184,0.2);padding:8px 16px;border-radius:10px;cursor:pointer;font-size:0.78rem;display:flex;align-items:center;gap:5px;" onclick="ChallengeModule.confirmExit()">
                        <i class="fas fa-sign-out-alt"></i> \u9000\u51fa
                    </button>
                    ${canSkip ? `<button style="background:rgba(96,165,250,0.12);color:#60a5fa;border:1px solid rgba(96,165,250,0.3);padding:8px 16px;border-radius:10px;cursor:pointer;font-size:0.78rem;display:flex;align-items:center;gap:5px;" onclick="ChallengeModule.skipQuestion()">
                        <i class="fas fa-forward"></i> \u8df3\u8fc7
                    </button>` : ''}
                </div>
                <button style="background:rgba(251,191,36,0.2);color:#fbbf24;border:1px solid rgba(251,191,36,0.4);padding:12px 28px;border-radius:12px;cursor:pointer;font-size:0.95rem;font-weight:600;display:flex;align-items:center;gap:8px;box-shadow:0 0 20px rgba(251,191,36,0.15);" onclick="ChallengeModule.confirmFinish()">
                    <i class="fas fa-file-alt"></i> \u4ea4\u5377
                </button>
            </div>`;
        } else {
            bottomBtns = `<div style="margin-top:16px;display:flex;align-items:center;justify-content:flex-end;gap:10px;">
                <button style="background:rgba(148,163,184,0.1);color:#94a3b8;border:1px solid rgba(148,163,184,0.2);padding:8px 16px;border-radius:10px;cursor:pointer;font-size:0.78rem;display:flex;align-items:center;gap:5px;" onclick="ChallengeModule.confirmExit()">
                    <i class="fas fa-sign-out-alt"></i> \u9000\u51fa
                </button>
            </div>`;
        }

        container.innerHTML = `
            <div class="challenge-play-page ${state.isBoss ? 'boss-cinematic-page' : ''}">
                <div class="challenge-play-header">
                    <div class="challenge-play-title">\u7b2c${stageIndex}\u5173</div>
                    <div class="challenge-timer"><i class="fas fa-clock"></i> ${mm}:${ss}</div>
                </div>
                ${state.isBoss ? `
                <div class="boss-cinematic-layout">
                    <div class="boss-cinematic-stage">
                        ${this._renderBossHpBars(state)}
                    </div>
                    <div class="boss-cinematic-quiz-panel">
                        <div class="boss-cinematic-progress">
                            <div class="challenge-progress-bar">
                                <div class="challenge-progress-fill" style="width:${progressPct}%"></div>
                            </div>
                            <div class="challenge-progress-text">${current} / ${total}</div>
                        </div>
                        ${navBarHtml}
                        <div class="challenge-question-area" id="challenge-question" style="margin:0;">
                            ${questionContent}
                        </div>
                    </div>
                </div>
                ` : `
                ${this._renderBossHpBars(state)}
                <div class="challenge-progress-bar">
                    <div class="challenge-progress-fill" style="width:${progressPct}%"></div>
                </div>
                <div class="challenge-progress-text">${current} / ${total}</div>
                ${navBarHtml}
                <div class="challenge-question-area" id="challenge-question">
                    ${questionContent}
                </div>
                `}

                ${showSliders ? `<div style="margin:16px 0;padding:16px 20px;border-radius:14px;border:1px dashed var(--border-subtle);background:var(--accent-subtle);display:flex;align-items:center;gap:16px;">
                    <div class="sliders-col" style="flex:1;min-width:0;">
                        <div class="vslider-box">
                            <div class="vslider-label"><i class="fas fa-gauge-high"></i> \u8bed\u901f</div>
                            <div class="vslider-track-wrap">
                                <input type="range" class="vslider vslider-rate" id="ch-rate-slider" min="1" max="15" value="${localStorage.getItem('fmi_rate') ? (RATE_LEVELS || []).indexOf(parseFloat(localStorage.getItem('fmi_rate'))) + 1 || 10 : 10}" step="1"
                                    oninput="ChallengeModule.setRate(this.value)" title="\u62d6\u52a8\u8c03\u6574\u8bed\u901f">
                                <div class="vslider-fill" id="ch-rate-fill"></div>
                                <div class="vslider-thumb" id="ch-rate-thumb"><span id="ch-val-rate">${localStorage.getItem('fmi_rate') || '1.0'}x</span></div>
                            </div>
                            <div class="vslider-range"><span>0.1x</span><span>1.5x</span></div>
                        </div>
                        <div class="vslider-box">
                            <div class="vslider-label"><i class="fas fa-redo"></i> \u5faa\u73af</div>
                            <div class="vslider-track-wrap">
                                <input type="range" class="vslider vslider-loop" id="ch-loop-slider" min="0" max="14" value="${(LOOP_LEVELS || []).indexOf(parseInt(localStorage.getItem('fmi_loop') || '1')) >= 0 ? (LOOP_LEVELS || []).indexOf(parseInt(localStorage.getItem('fmi_loop') || '1')) : 0}" step="1"
                                    oninput="ChallengeModule.setLoop(this.value)" title="\u62d6\u52a8\u8c03\u6574\u5faa\u73af\u6b21\u6570">
                                <div class="vslider-fill" id="ch-loop-fill"></div>
                                <div class="vslider-thumb" id="ch-loop-thumb"><span id="ch-val-loop">${localStorage.getItem('fmi_loop') || '1'}\u6b21</span></div>
                            </div>
                            <div class="vslider-range"><span>1\u6b21</span><span>\u65e0\u9650</span></div>
                        </div>
                    </div>
                </div>` : ''}

                ${bottomBtns}
            </div>
        `;

        // 同步滑块
        setTimeout(() => {
            if (showSliders && typeof updateSliderFill === 'function') {
                const rateSlider = document.getElementById('ch-rate-slider');
                const loopSlider = document.getElementById('ch-loop-slider');
                if (rateSlider) {
                    const rateVal = parseInt(rateSlider.value) - 1;
                    updateSliderFill('ch-rate', rateVal / ((typeof RATE_LEVELS !== 'undefined' ? RATE_LEVELS.length : 15) - 1));
                }
                if (loopSlider) {
                    const loopVal = parseInt(loopSlider.value);
                    updateSliderFill('ch-loop', loopVal / 14);
                }
            }
        }, 50);

        // 计时器
        const _sysInfo = window._systemInfo || {};
        const _hellCfg = _sysInfo.hellSettings || {};
        let timeLimit;
        if (_isHellStage) {
            timeLimit = _hellCfg.timeLimitEnabled !== false ? (_hellCfg.timeLimit || _sysInfo.hellTimeLimit || 120) : 0;
        } else {
            const _normalCfg = _sysInfo.normalSettings || {};
            timeLimit = _normalCfg.timeLimitEnabled !== false ? (_normalCfg.timeLimit || _sysInfo.challengeTimeLimit || 60) : 0;
        }

        this._timerInterval = setInterval(() => {
            const el = document.querySelector('.challenge-timer');
            if (!el) { clearInterval(this._timerInterval); return; }
            const elapsed2 = Math.floor((Date.now() - state.startTime) / 1000);
            if (timeLimit > 0) {
                const remaining = Math.max(0, timeLimit - elapsed2);
                const mm2 = String(Math.floor(remaining / 60)).padStart(2, '0');
                const ss2 = String(remaining % 60).padStart(2, '0');
                const isWarning = remaining <= 10;
                el.innerHTML = `<i class="fas fa-clock" style="color:${isWarning ? '#f87171' : ''}"></i> <span style="color:${isWarning ? '#f87171' : ''}">${mm2}:${ss2}</span>`;
                if (remaining <= 0) {
                    clearInterval(this._timerInterval);
                    this.confirmFinish();
                }
            } else {
                const mm2 = String(Math.floor(elapsed2 / 60)).padStart(2, '0');
                const ss2 = String(elapsed2 % 60).padStart(2, '0');
                el.innerHTML = `<i class="fas fa-clock"></i> ${mm2}:${ss2}`;
            }
        }, 1000);
    },

    // 跳转到第一个跳过的题目
    _jumpToFirstSkipped() {
        const state = this.challengeState;
        if (!state) return;
        const idx = state.answers.findIndex(a => a === null);
        if (idx >= 0) this.jumpToQuestion(idx);
    },


        answerQuestion(btnEl, selectedEnc, correctEnc) {
        const state = this.challengeState;
        if (!state || state.answers[state.currentIndex]) return; // 已答过

        const selected = decodeURIComponent(selectedEnc);
        const correct = decodeURIComponent(correctEnc);
        const isCorrect = selected === correct;

        if (isCorrect) state.correct++;
        state.answers[state.currentIndex] = { selected, correct, isCorrect };

        const isImmediateGrading = this._isImmediateGrading();

        if (isImmediateGrading) {
            // 即时阅卷：高亮对错
            const allBtns = btnEl.parentElement.querySelectorAll('.challenge-option');
            allBtns.forEach(btn => {
                const text = btn.querySelector('.challenge-option-text').textContent;
                btn.style.pointerEvents = 'none';
                if (text === correct) btn.classList.add('correct');
                else if (btn === btnEl && !isCorrect) btn.classList.add('wrong');
            });
        }

        // ===== BOSS战处理 =====
        if (state.isBoss) {
            const bossResult = this._bossHandleAnswer(state, isCorrect);
            // 播放受击动画
            if (bossResult.damageType) {
                this._bossDamageEffect(bossResult.damageType, bossResult);
            }
            // 更新BOSS HP显示
            this._updateBossHpDisplay(state);

            if (bossResult.gameOver) {
                clearInterval(this._timerInterval);
                const delay = isImmediateGrading ? 1200 : 300;
                setTimeout(() => {
                    const subContent = document.getElementById('challenge-sub-content');
                    if (subContent) this._renderBossResult(subContent, bossResult.result);
                }, delay);
                return;
            }

            // BOSS战未结束，继续下一题
            if (isImmediateGrading) {
                setTimeout(() => {
                    state.currentIndex++;
                    const subContent = document.getElementById('challenge-sub-content');
                    if (subContent) this._renderPlayArea(subContent);
                }, 1200);
            } else {
                state.currentIndex++;
                const subContent = document.getElementById('challenge-sub-content');
                if (subContent) this._renderPlayArea(subContent);
            }
            return;
        }
        // ===== BOSS战处理结束 =====

        // 准确率淘汰检测（仅地狱模式且已配置淘汰线）
        const knockout = this._checkAccuracyKnockout();
        if (knockout) {
            clearInterval(this._timerInterval);
            setTimeout(() => {
                const subContent = document.getElementById('challenge-sub-content');
                if (subContent) this._renderStageResult(subContent, true);
            }, isImmediateGrading ? 800 : 200);
            return;
        }

        if (isImmediateGrading) {
            setTimeout(() => {
                state.currentIndex++;
                if (state.currentIndex >= state.totalQuestions) {
                    clearInterval(this._timerInterval);
                }
                const subContent = document.getElementById('challenge-sub-content');
                if (subContent) this._renderPlayArea(subContent);
            }, 1000);
        } else {
            // 交卷阅卷模式：跳到下一题
            state.currentIndex++;
            const subContent = document.getElementById('challenge-sub-content');
            if (subContent) this._renderPlayArea(subContent);
        }
    },

    // 判断当前是否为即时阅卷模式
    _isImmediateGrading() {
        const isHell = this.challengeMode === 'hell';
        if (!isHell) return false; // 普通模式固定交卷阅卷
        const _sysInfo = window._systemInfo || {};
        const _hs = _sysInfo.hellSettings || {};
        return (_hs.gradingMode || 'immediate') === 'immediate';
    },

    // 检查准确率淘汰（仅地狱模式）
    _checkAccuracyKnockout() {
        const isHell = this.challengeMode === 'hell';
        if (!isHell) return false;
        const _sysInfo = window._systemInfo || {};
        const _hs = _sysInfo.hellSettings || {};
        const knockout = _hs.accuracyKnockout !== undefined ? _hs.accuracyKnockout : (_sysInfo.hellAccuracyKnockout !== undefined ? _sysInfo.hellAccuracyKnockout : 0);
        if (knockout <= 0) return false;
        const state = this.challengeState;
        if (!state) return false;
        const answered = state.answers.filter(a => a).length;
        if (answered < 2) return false; // 至少答2题才检测
        const accuracy = (state.correct / answered) * 100;
        if (accuracy < knockout) {
            state._knockout = true;
            return true;
        }
        return false;
    },

    // 开始闯关（普通模式专用）
    startChallenge() {
        const state = this.challengeState;
        if (!state || state.phase !== 'ready') return;
        state.phase = 'playing';
        state.startTime = Date.now();
        this._beforeUnloadHandler = function(e) {
            e.preventDefault();
            e.returnValue = '闯关进行中，确定要离开吗？成绩将不会保存。';
            return e.returnValue;
        };
        window.addEventListener('beforeunload', this._beforeUnloadHandler);
        const subContent = document.getElementById('challenge-sub-content');
        if (subContent) this._renderPlayArea(subContent);
    },

    /** BOSS \u52a0\u8f7d\u5b8c\u6210\u540e\u5f00\u59cb\u6218\u6597 */
    _startBossWithLoading() {
        // \u786e\u4fdd\u52a0\u8f7d\u754c\u9762\u5df2\u6d88\u5931
        const overlay = document.getElementById('boss-loading-overlay');
        if (overlay) { overlay.style.opacity = '0'; setTimeout(() => overlay.remove(), 400); }
        this.startChallenge();
    },

    // 跳过当前题
    skipQuestion() {
        const state = this.challengeState;
        if (!state || state.phase !== 'playing') return;
        // 标记为skipped但不判卷
        state.answers[state.currentIndex] = null; // null表示跳过
        state.currentIndex++;
        if (state.currentIndex >= state.totalQuestions) {
            // 最后一题也跳过了，不自动交卷，让用户手动交卷
        }
        const subContent = document.getElementById('challenge-sub-content');
        if (subContent) this._renderPlayArea(subContent);
    },

    // 跳转到指定题目
    jumpToQuestion(index) {
        const state = this.challengeState;
        if (!state || state.phase !== 'playing') return;
        if (index < 0 || index >= state.totalQuestions) return;
        // 检查是否允许返回（不能跳到已答过的前面题目）
        const canReturn = this._canReturnToAnswered();
        if (index <= state.currentIndex && !canReturn) return;
        state.currentIndex = index;
        const subContent = document.getElementById('challenge-sub-content');
        if (subContent) this._renderPlayArea(subContent);
    },

    // 是否允许返回已答题目
    _canReturnToAnswered() {
        const isHell = this.challengeMode === 'hell';
        if (!isHell) return true; // 普通模式始终允许
        const _sysInfo = window._systemInfo || {};
        const _hs = _sysInfo.hellSettings || {};
        return !!(_hs.allowReturn || false);
    },

    // 是否允许跳题
    _canSkip() {
        const isHell = this.challengeMode === 'hell';
        if (!isHell) return true; // 普通模式始终允许
        const _sysInfo = window._systemInfo || {};
        const _hs = _sysInfo.hellSettings || {};
        return !!(_hs.allowSkip || false);
    },

    // 是否显示题号导航条
    _shouldShowNav() {
        const isHell = this.challengeMode === 'hell';
        if (!isHell) return true; // 普通模式始终显示
        const _sysInfo = window._systemInfo || {};
        const _hs = _sysInfo.hellSettings || {};
        return !!(_hs.showNav || false);
    },

    // ========== 闯关结果 ==========
    _renderStageResult(container, isKnockout) {
        const state = this.challengeState;
        if (!state || !state.startTime) return;
        const timeSpent = Math.floor((Date.now() - state.startTime) / 1000);
        const answeredCount = state.answers.filter(a => a).length;
        const isKnockoutMode = isKnockout || state._knockout || false;
        // 淘汰模式下只计算已答题目的准确率
        const accuracy = isKnockoutMode
            ? (answeredCount > 0 ? (state.correct / answeredCount) * 100 : 0)
            : (state.correct / state.totalQuestions * 100);

        // 计算综合得分
        const timeScore = Math.max(0, (1 - timeSpent / (Math.max(timeSpent, 10) * this.TIME_MULTIPLIER))) * 100;
        const score = accuracy * this.ACCURACY_WEIGHT + timeScore * this.TIME_WEIGHT;

        // 星级（从后台设置读取阈值）
        const STAR3 = (window._systemInfo && window._systemInfo.challengeStar3) || 90;
        const STAR2 = (window._systemInfo && window._systemInfo.challengeStar2) || 70;
        const STAR1 = (window._systemInfo && window._systemInfo.challengeStar1) || 50;
        let stars = 0;
        if (score >= STAR3) stars = 3;
        else if (score >= STAR2) stars = 2;
        else if (score >= STAR1) stars = 1;

        const isNew = !this.serverProgress[state.stageId] || score > this.serverProgress[state.stageId].bestScore;

        container.innerHTML = `
            <div class="challenge-result-page">
                <div class="challenge-result-icon">
                    ${this._renderStars(stars)}
                </div>
                <div class="challenge-result-title">${isKnockoutMode ? '准确率未达标，已被淘汰！' : (stars >= 1 ? '闯关成功！' : '挑战失败')}</div>
                ${isKnockoutMode ? '<div class="ch-knockout-banner"><i class="fas fa-skull-crossbones"></i> 准确率低于淘汰线，强制结算</div>' : ''}
                <div class="challenge-result-stats">
                    <div class="result-stat">
                        <div class="result-stat-label">准确率</div>
                        <div class="result-stat-value">${accuracy.toFixed(0)}%</div>
                    </div>
                    <div class="result-stat">
                        <div class="result-stat-label">用时</div>
                        <div class="result-stat-value">${Math.floor(timeSpent / 60)}分${timeSpent % 60}秒</div>
                    </div>
                    <div class="result-stat">
                        <div class="result-stat-label">综合得分</div>
                        <div class="result-stat-value highlight">${score.toFixed(1)}</div>
                    </div>
                </div>
                ${isNew ? '<div class="new-record-badge">新纪录！</div>' : ''}
                <div class="challenge-result-actions">
                    <button class="result-btn retry" onclick="ChallengeModule.enterStage('${state.stageId}')">
                        <i class="fas fa-redo"></i> 再来一次
                    </button>
                    <button class="result-btn back" onclick="ChallengeModule.exitStage()">
                        <i class="fas fa-map"></i> 返回关卡
                    </button>
                </div>
            </div>
        `;

        // 提交成绩
        this._submitScore(state.stageId, accuracy, timeSpent, score, stars);
    },

    async _submitScore(stageId, accuracy, timeSpent, score, stars) {
        // 本地保存
        const progress = JSON.parse(localStorage.getItem('fmi_challenge_progress') || '{}');
        const existing = progress[stageId];
        if (!existing || score > existing.bestScore) {
            progress[stageId] = {
                firstScore: existing ? existing.firstScore : score,
                bestScore: score,
                bestAccuracy: accuracy,
                bestTime: timeSpent,
                stars: Math.max(stars, existing?.stars || 0),
                attempts: (existing?.attempts || 0) + 1,
                cleared: stars >= 1 || (existing?.cleared || false),
            };
        } else {
            progress[stageId].attempts = (progress[stageId].attempts || 0) + 1;
        }
        localStorage.setItem('fmi_challenge_progress', JSON.stringify(progress));
        this.serverProgress = progress;

        // 提交到服务端
        try {
            await API.request('challenge/submit', {
                method: 'POST',
                body: JSON.stringify({ stageId, accuracy, timeSpent, score, stars, mode: this.challengeMode }),
            });
        } catch (e) {
            console.warn('Failed to submit score:', e);
        }
        // 检查称号
        this._checkAndSyncTitles();
    },

    // 退出闯关确认（带提示，不保存成绩）
    confirmExitWithoutSave() {
        if (confirm('确定要退出闯关吗？\n退出后将不记录答题时间和成绩。')) {
            this.exitWithoutSave();
        }
    },

    // 退出闯关（不保存成绩），适用于只是进来看看的用户
    exitWithoutSave() {
        this._chIsPlaying = false;
        window.speechSynthesis.cancel();
        if (this._timerInterval) clearInterval(this._timerInterval);
        if (this._beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this._beforeUnloadHandler);
            this._beforeUnloadHandler = null;
        }
        this.currentStageId = null;
        this.challengeState = null;
        this._inChallenge = false;
        this.render();
    },

    confirmExit() {
        const state = this.challengeState;
        if (state && state.answers && state.answers.some(a => a)) {
            if (confirm('当前闯关已答题，退出将不会保存成绩。确定退出吗？')) {
                this.exitStage();
            }
        } else {
            this.exitStage();
        }
    },

    confirmFinish() {
        const state = this.challengeState;
        if (!state) return;
        const answered = state.answers ? state.answers.filter(a => a !== undefined && a !== null).length : 0;
        if (answered === 0) {
            alert('您还没有答题，请先答题后再结束。');
            return;
        }
        const skipped = state.answers ? state.answers.filter(a => a === null).length : 0;
        const msg = skipped > 0
            ? '确定交卷吗？（已答 ' + answered + ' 题，跳过 ' + skipped + ' 题，跳过题计0分）'
            : '确定交卷并提交成绩吗？（已答 ' + answered + ' 题）';
        if (confirm(msg)) {
            // 将未答和跳过的题目视为错误
            for (let i = 0; i < state.totalQuestions; i++) {
                if (!state.answers[i]) {
                    const q = state.questions[i];
                    const isDialogue = q.lines !== undefined;
                    const correct = isDialogue ? (q.title || '') : (q.chinese || '');
                    state.answers[i] = { selected: '', correct: correct, isCorrect: false };
                }
            }
            state.currentIndex = state.totalQuestions;
            if (this._timerInterval) clearInterval(this._timerInterval);
            if (this._beforeUnloadHandler) {
                window.removeEventListener('beforeunload', this._beforeUnloadHandler);
                this._beforeUnloadHandler = null;
            }
            this._inChallenge = false;
            const subContent = document.getElementById('challenge-sub-content');
            if (subContent) this._renderStageResult(subContent);
        }
    },

    exitStage() {
        if (this._timerInterval) clearInterval(this._timerInterval);
        if (this._beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this._beforeUnloadHandler);
            this._beforeUnloadHandler = null;
        }
        this.currentStageId = null;
        this.challengeState = null;
        this._inChallenge = false;
        this.render();
    },

    // ========== 排行榜 ==========
    async renderRank(container) {
        container.innerHTML = '<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';

        // 周冠军广播
        let championHTML = '';
        try {
            const champRes = await API.request('challenge/leaderboard/champion');
            if (champRes.success && champRes.champion) {
                const c = champRes.champion;
                championHTML = `
                    <div class="champion-banner">
                        <div class="champion-trophy"><i class="fas fa-trophy"></i></div>
                        <div class="champion-text">
                            <div class="champion-title">周冠军</div>
                            <div class="champion-name">${c.name} (${c.companyCode || ''})</div>
                            <div class="champion-score">总积分 ${c.totalScore?.toFixed(0) || 0} 分</div>
                        </div>
                    </div>
                `;
            }
        } catch (e) {}

        let rankHTML = '';
        try {
            const rankRes = await API.request('challenge/leaderboard?period=weekly');
            if (rankRes.success && rankRes.rankings) {
                const loginUser = JSON.parse(sessionStorage.getItem('fmi_user') || '{}');
                rankHTML = rankRes.rankings.map(r => {
                    const isMe = r.username === loginUser.username;
                    const rankClass = r.rank <= 3 ? `rank-${r.rank}` : '';
                    return `<div class="rank-item ${isMe ? 'rank-me' : ''} ${rankClass}">
                        <div class="rank-position ${r.rank <= 3 ? 'rank-top' : ''}">${r.rank <= 3 ? '<i class="fas fa-crown"></i>' : r.rank}</div>
                        <div class="rank-name">${r.name}</div>
                        <div class="rank-company">${r.companyCode || ''}</div>
                        <div class="rank-score">${r.totalScore.toFixed(0)}</div>
                    </div>`;
                }).join('');
            }
        } catch (e) {}

        container.innerHTML = `
            <div class="rank-page">
                ${championHTML}
                <div class="rank-period-tabs">
                    <button class="rank-period-btn active" onclick="ChallengeModule.switchPeriod('weekly', this)">本周</button>
                    <button class="rank-period-btn" onclick="ChallengeModule.switchPeriod('monthly', this)">本月</button>
                    <button class="rank-period-btn" onclick="ChallengeModule.switchPeriod('alltime', this)">总榜</button>
                </div>
                <div class="rank-list">
                    <div class="rank-header">
                        <div class="rank-position">排名</div>
                        <div class="rank-name">昵称</div>
                        <div class="rank-company">公司</div>
                        <div class="rank-score">积分</div>
                    </div>
                    ${rankHTML || '<div style="text-align:center;color:var(--text-muted);padding:40px;">暂无排行数据</div>'}
                </div>
            </div>
        `;
    },

    async switchPeriod(period, btn) {
        document.querySelectorAll('.rank-period-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');

        const container = document.getElementById('challenge-sub-content');
        const listEl = container.querySelector('.rank-list');
        if (!listEl) return;

        listEl.innerHTML = '<div style="text-align:center;padding:40px;"><i class="fas fa-spinner fa-spin"></i></div>';

        try {
            const res = await API.request(`challenge/leaderboard?period=${period}`);
            if (res.success && res.rankings) {
                const loginUser = JSON.parse(sessionStorage.getItem('fmi_user') || '{}');
                listEl.innerHTML = `
                    <div class="rank-header">
                        <div class="rank-position">排名</div>
                        <div class="rank-name">昵称</div>
                        <div class="rank-company">公司</div>
                        <div class="rank-score">积分</div>
                    </div>
                    ${res.rankings.map(r => {
                        const isMe = r.username === loginUser.username;
                        const rankClass = r.rank <= 3 ? `rank-${r.rank}` : '';
                        return `<div class="rank-item ${isMe ? 'rank-me' : ''} ${rankClass}">
                            <div class="rank-position ${r.rank <= 3 ? 'rank-top' : ''}">${r.rank <= 3 ? '<i class="fas fa-crown"></i>' : r.rank}</div>
                            <div class="rank-name">${r.name}</div>
                            <div class="rank-company">${r.companyCode || ''}</div>
                            <div class="rank-score">${r.totalScore.toFixed(0)}</div>
                        </div>`;
                    }).join('') || '<div style="text-align:center;color:var(--text-muted);padding:40px;">暂无排行数据</div>'}
                `;
            }
        } catch (e) {
            listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;">加载失败</div>';
        }
    },

    // ========== 工具 ==========
    setRate(val) {
        const idx = parseInt(val) - 1;
        const rate = (typeof RATE_LEVELS !== 'undefined' && RATE_LEVELS[idx] !== undefined) ? RATE_LEVELS[idx] : val / 10;
        localStorage.setItem('fmi_rate', String(rate));
        const display = rate.toFixed(rate < 1 ? 2 : 1) + 'x';
        const thumb = document.getElementById('ch-val-rate');
        if (thumb) thumb.textContent = display;
        // 更新滑块填充条和thumb位置
        if (typeof updateSliderFill === 'function') {
            const maxIdx = (typeof RATE_LEVELS !== 'undefined' ? RATE_LEVELS.length : 15) - 1;
            updateSliderFill('ch-rate', idx / maxIdx);
        }
        // 同步全局滑块
        if (typeof setRateFromSlider === 'function') setRateFromSlider(val);
    },

    setLoop(val) {
        const count = parseInt(val);
        const loopCount = (typeof LOOP_LEVELS !== 'undefined' && LOOP_LEVELS[count] !== undefined) ? LOOP_LEVELS[count] : count;
        localStorage.setItem('fmi_loop', String(loopCount));
        const thumb = document.getElementById('ch-val-loop');
        if (thumb) thumb.textContent = loopCount === 0 ? '无限' : (loopCount + '次');
        // 更新滑块填充条和thumb位置
        if (typeof updateSliderFill === 'function') {
            updateSliderFill('ch-loop', count / 14);
        }
        // 同步全局滑块
        if (typeof setLoopFromSlider === 'function') setLoopFromSlider(val);
    },

    // 闯天关播放切换：首次点击播放，再次点击停止
    challengeToggleSpeak(encodedText) {
        if (this._chIsPlaying) {
            this._chIsPlaying = false;
            window.speechSynthesis.cancel();
            // 更新所有闯天关播放按钮图标为播放状态
            document.querySelectorAll('.ch-play-ico').forEach(ico => {
                ico.className = 'fas fa-play ch-play-ico';
            });
            return;
        }
        const text = decodeURIComponent(encodedText);
        if (!text) return;
        this._chIsPlaying = true;
        const rate = parseFloat(localStorage.getItem('fmi_rate') || '0.8');
        const loopCount = parseInt(localStorage.getItem('fmi_loop') || '1');
        const self = this;
        let count = 0;

        function doPlay() {
            if (!self._chIsPlaying) return;
            window.speechSynthesis.cancel();
            if (typeof googleSpeech === 'function') {
                googleSpeech(text, rate).then(() => {
                    if (!self._chIsPlaying) return;
                    count++;
                    if (count < loopCount) doPlay();
                    else { self._chIsPlaying = false; self._resetChSpeakIcons(); }
                }).catch(() => { synthFallback(); });
            } else {
                synthFallback();
            }
        }

        function synthFallback() {
            if (!self._chIsPlaying) return;
            const voices = window.speechSynthesis.getVoices();
            let idVoice = voices.find(v => v.lang && v.lang.startsWith('id'));
            if (!idVoice) idVoice = voices.find(v => v.lang && (v.lang.startsWith('ms') || v.lang.startsWith('msa')));
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'id-ID';
            if (idVoice) utterance.voice = idVoice;
            utterance.rate = rate;
            utterance.onend = function() {
                count++;
                if (self._chIsPlaying && count < loopCount) doPlay();
                else { self._chIsPlaying = false; self._resetChSpeakIcons(); }
            };
            utterance.onerror = function() { self._chIsPlaying = false; self._resetChSpeakIcons(); };
            window.speechSynthesis.speak(utterance);
        }

        // 更新图标为暂停状态
        document.querySelectorAll('.ch-play-ico').forEach(ico => {
            ico.className = 'fas fa-pause ch-play-ico';
        });
        doPlay();
    },

    _resetChSpeakIcons() {
        document.querySelectorAll('.ch-play-ico').forEach(ico => {
            ico.className = 'fas fa-play ch-play-ico';
        });
    },


    
    // ========== BOSS 战核心方法 ==========

    /**
     * 渲染 BOSS 战对峙界面（双方形象 + HP条 + 动画）
     */
    _renderBossHpBars(state) {
        if (!state || !state.isBoss) return '';
        const bossDef = state.bossDef || {};
        const bossColor = bossDef.color || '#ef4444';
        const bossName = bossDef.name || 'BOSS';
        const bossHp = typeof state.bossHp === 'number' ? state.bossHp : 0;
        const bossMaxHp = typeof state.bossMaxHp === 'number' ? state.bossMaxHp : 1;
        const userHp = typeof state.userHp === 'number' ? state.userHp : 0;
        const userMaxHp = typeof state.userMaxHp === 'number' ? state.userMaxHp : 1;
        const isRage = state.bossPhase === 'rage';

        // 用户角色
        const heroLevel = String(state.bossLevel || 0);
        const heroDef = this._heroDefs[heroLevel] || this._heroDefs['0'];
        const heroColor = heroDef.color || '#60a5fa';
        const heroName = heroDef.name || '\u52c7\u8005';

        // 暴怒状态下的视觉增强
        const rageGlow = isRage ? `filter:drop-shadow(0 0 20px ${bossColor});` : '';
        const rageShake = isRage ? 'animation:boss-shake 0.3s ease-in-out infinite;' : '';
        const rageOverlay = isRage ? `<div class="boss-cinematic-rage-overlay"></div>` : '';
        const rageBanner = isRage ? `<div class="boss-cinematic-rage-banner"><i class="fas fa-fire"></i> BOSS \u66b4\u6012\u4e2d! \u4f24\u5bb3\u00d7${state.rageDamage || 2}</div>` : '';

        // BOSS形象 - 大尺寸（压倒感）
        const bossImg = bossDef.image
            ? `<img src="${bossDef.image}" id="boss-battle-img" class="boss-cinematic-avatar" style="${rageGlow}${rageShake}" alt="${bossName}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div style="display:none;class boss-cinematic-avatar-fallback;${rageShake}"><i class="fas ${bossDef.icon || 'fa-skull'}" style="color:${bossColor};font-size:4rem;"></i></div>`
            : `<div class="boss-cinematic-avatar-fallback" style="${rageShake}"><i class="fas ${bossDef.icon || 'fa-skull'}" style="color:${bossColor};font-size:4rem;"></i></div>`;

        // 用户形象 - 中等尺寸
        const heroImg = heroDef.image
            ? `<img src="${heroDef.image}" id="hero-battle-img" class="boss-cinematic-hero-avatar" alt="${heroName}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div style="display:none;class boss-cinematic-hero-fallback;"><i class="fas ${heroDef.icon || 'fa-user'}" style="color:${heroColor};font-size:1.5rem;"></i></div>`
            : `<div class="boss-cinematic-hero-fallback"><i class="fas ${heroDef.icon || 'fa-user'}" style="color:${heroColor};font-size:1.5rem;"></i></div>`;

        // HP 百分比
        const bossHpPct = bossMaxHp > 0 ? (bossHp / bossMaxHp * 100) : 0;
        const userHpPct = userMaxHp > 0 ? (userHp / userMaxHp * 100) : 0;
        const bossHpColor = isRage ? '#ff4444' : bossColor;
        const userHpColor = userHp / userMaxHp <= 0.3 ? '#f87171' : '#34d399';

        return `
        <div class="boss-cinematic-container" id="boss-battle-ui">
            ${rageOverlay}
            <!-- 左上BOSS 右下用户 -->
            <div class="boss-cinematic-scene">
                <!-- BOSS 区域 - 左上 -->
                <div class="boss-cinematic-boss-zone">
                    <div class="boss-cinematic-boss-visual">
                        ${bossImg}
                    </div>
                    <div class="boss-cinematic-nameplate boss-nameplate">
                        <span class="boss-cinematic-name">${bossName}${isRage ? ' <i class="fas fa-bolt" style="color:#ff4444;"></i>' : ''}</span>
                    </div>
                    <div class="boss-cinematic-hp-bar">
                        <div class="boss-cinematic-hp-track boss-hp-track ${isRage ? 'rage' : ''}">
                            <div class="boss-cinematic-hp-fill boss-hp-fill" id="boss-hp-fill" style="width:${bossHpPct}%;background:${bossHpColor};"></div>
                        </div>
                        <span class="boss-hp-text boss-cinematic-hp-num" style="color:${bossColor};">${bossHp}<span style="opacity:0.5;">/${bossMaxHp}</span></span>
                    </div>
                </div>

                <!-- VS 标志 -->
                <div class="boss-cinematic-vs">
                    <span>VS</span>
                </div>

                <!-- 用户区域 - 右下 -->
                <div class="boss-cinematic-hero-zone">
                    <div class="boss-cinematic-hero-visual">
                        ${heroImg}
                    </div>
                    <div class="boss-cinematic-nameplate hero-nameplate">
                        <span class="boss-cinematic-name">${heroName}</span>
                    </div>
                    <div class="boss-cinematic-hp-bar">
                        <div class="boss-cinematic-hp-track user-hp-track">
                            <div class="boss-cinematic-hp-fill user-hp-fill" id="user-hp-fill" style="width:${userHpPct}%;background:${userHpColor};"></div>
                        </div>
                        <span class="user-hp-text boss-cinematic-hp-num" style="color:${userHpColor};">${userHp}<span style="opacity:0.5;">/${userMaxHp}</span></span>
                    </div>
                </div>
            </div>
            ${rageBanner}
        </div>`;
    },

    /**
     * BOSS 战答题处理：答对扣BOSS HP，答错扣用户HP
     * @returns {{ gameOver: boolean, result: 'win'|'lose'|null, damageType: 'boss'|'user'|null }}
     */
    _bossHandleAnswer(state, isCorrect) {
        if (!state.isBoss) return { gameOver: false, result: null, damageType: null, damage: 0, isLastStand: false, isRageHit: false };

        let damageType = null;
        let result = null;
        let damage = 0;
        let isLastStand = false;
        let isRageHit = false;

        if (isCorrect) {
            // 答对：扣BOSS HP
            const bossDamage = state.bossHpMode === 2
                ? Math.max(1, state.bossMaxHp / state.totalQuestions)
                : 1;
            state.bossHp = Math.max(0, Math.round(state.bossHp - bossDamage));
            state.correct++;
            state.currentStreak++;
            state.maxStreak = Math.max(state.maxStreak, state.currentStreak);
            damageType = 'boss';
            damage = 1;

            // 检查BOSS是否被击败
            if (state.bossHp <= 0) {
                state.bossPhase = 'defeated';
                result = 'win';
            }
            // 检查是否进入暴怒（使用后台配置的阈值）
            else if (state.bossPhase === 'normal' && state.bossHp <= state.bossMaxHp * state.rageThreshold) {
                state.bossPhase = 'rage';
            }
        } else {
            // 答错：计算伤害
            let dmgToUser = 1;
            state.currentStreak = 0;
            state.userTookDamage = true;

            // 暴怒状态下伤害翻倍
            if (state.bossPhase === 'rage') {
                dmgToUser = state.rageDamage;
                isRageHit = true;
            }

            // 最后一搏：用户剩余1HP时，答错不致死（仅一次）
            if (state.userHp <= 1 && !state.lastStandUsed) {
                state.lastStandUsed = true;
                isLastStand = true;
                damageType = 'lastStand';
                damage = 0; // 实际不扣血
                // 最后一搏：反击！对BOSS造成1点伤害
                state.bossHp = Math.max(0, state.bossHp - 1);
                if (state.bossHp <= 0) {
                    state.bossPhase = 'defeated';
                    result = 'win';
                }
            } else {
                state.userHp = Math.max(0, state.userHp - dmgToUser);
                damageType = 'user';
                damage = dmgToUser;
                if (state.userHp <= 0) {
                    result = 'lose';
                }
            }
        }

        const gameOver = result !== null;
        return { gameOver, result, damageType, damage, isLastStand, isRageHit };
    },

    /**
     * BOSS 答题后的动画效果
     */
    _bossDamageEffect(damageType) {
        if (!damageType) return;
        const playPage = document.querySelector('.boss-cinematic-page, .challenge-play-page');
        const bossVisual = document.querySelector('.boss-cinematic-boss-visual');
        const heroVisual = document.querySelector('.boss-cinematic-hero-visual');

        // \u521b\u5efa\u5168\u5c4f\u95ea\u5c4f\u5143\u7d20
        const flashOverlay = document.createElement('div');
        flashOverlay.className = 'boss-cinematic-flash';
        if (playPage) {
            playPage.style.position = 'relative';
            playPage.appendChild(flashOverlay);
        }

        if (damageType === 'boss') {
            // ===== \u7528\u6237\u653b\u51fb BOSS =====
            if (heroVisual) {
                heroVisual.style.transition = 'transform 0.15s ease';
                heroVisual.style.transform = 'translateX(15px) scale(1.2)';
                setTimeout(() => { heroVisual.style.transform = ''; }, 200);
            }
            setTimeout(() => {
                if (flashOverlay.parentElement) {
                    flashOverlay.style.background = 'radial-gradient(circle at 25% 25%, rgba(255,100,50,0.25) 0%, transparent 60%)';
                    flashOverlay.style.opacity = '1';
                    setTimeout(() => { flashOverlay.style.opacity = '0'; }, 150);
                }
                if (bossVisual) {
                    bossVisual.style.transition = 'transform 0.1s ease, filter 0.1s ease';
                    bossVisual.style.transform = 'translateX(-8px) scale(0.85)';
                    bossVisual.style.filter = 'brightness(3) saturate(0.5)';
                    setTimeout(() => {
                        bossVisual.style.transform = 'translateX(4px) scale(1.05)';
                        bossVisual.style.filter = 'brightness(1.5)';
                        setTimeout(() => { bossVisual.style.transition = ''; bossVisual.style.transform = ''; bossVisual.style.filter = ''; }, 100);
                    }, 100);
                }
                const bossHpFill = document.getElementById('boss-hp-fill');
                if (bossHpFill) { bossHpFill.style.filter = 'brightness(2.5)'; setTimeout(() => { bossHpFill.style.filter = ''; }, 200); }
                if (playPage) { playPage.style.animation = 'screen-shake 0.25s ease'; setTimeout(() => playPage.style.animation = '', 250); }
                this._showDamageText('boss-cinematic-boss-zone', '-1', '#ef4444');
            }, 150);
        } else if (damageType === 'user') {
            // ===== BOSS \u653b\u51fb\u7528\u6237 =====
            if (bossVisual) {
                bossVisual.style.transition = 'transform 0.15s ease';
                bossVisual.style.transform = 'translateX(-15px) scale(1.15)';
                setTimeout(() => { bossVisual.style.transform = ''; }, 200);
            }
            setTimeout(() => {
                if (flashOverlay.parentElement) {
                    flashOverlay.style.background = 'radial-gradient(circle at 75% 75%, rgba(255,50,50,0.3) 0%, transparent 60%)';
                    flashOverlay.style.opacity = '1';
                    setTimeout(() => { flashOverlay.style.opacity = '0'; }, 200);
                }
                if (heroVisual) {
                    heroVisual.style.transition = 'transform 0.1s ease, filter 0.1s ease';
                    heroVisual.style.transform = 'translateX(8px) scale(0.85)';
                    heroVisual.style.filter = 'brightness(0.5) saturate(2) hue-rotate(-30deg)';
                    setTimeout(() => {
                        heroVisual.style.transform = 'translateX(-4px) scale(1.05)';
                        heroVisual.style.filter = 'brightness(1.2)';
                        setTimeout(() => { heroVisual.style.transition = ''; heroVisual.style.transform = ''; heroVisual.style.filter = ''; }, 100);
                    }, 100);
                }
                const userHpFill = document.getElementById('user-hp-fill');
                if (userHpFill) { userHpFill.style.filter = 'brightness(2.5)'; userHpFill.style.background = '#ff4444'; setTimeout(() => { userHpFill.style.filter = ''; userHpFill.style.background = ''; }, 300); }
                if (playPage) { playPage.style.animation = 'screen-shake-strong 0.35s ease'; setTimeout(() => playPage.style.animation = '', 350); }
                this._showDamageText('boss-cinematic-hero-zone', '-1', '#f87171');
            }, 150);
        } else if (damageType === 'lastStand') {
            // ===== \u6700\u540e\u4e00\u640f\u7279\u6548 =====
            if (playPage) {
                // \u91d1\u8272\u95ea\u5c4f + \u5f3a\u70c8\u9707\u52a8
                playPage.style.animation = 'screen-shake-strong 0.5s ease';
                setTimeout(() => playPage.style.animation = '', 500);
            }
            setTimeout(() => {
                if (flashOverlay.parentElement) {
                    flashOverlay.style.background = 'radial-gradient(circle, rgba(251,191,36,0.4) 0%, rgba(245,158,11,0.15) 40%, transparent 70%)';
                    flashOverlay.style.opacity = '1';
                    setTimeout(() => { flashOverlay.style.opacity = '0'; }, 300);
                }
                // \u7528\u6237\u53d1\u5149\u53cd\u51fb
                if (heroVisual) {
                    heroVisual.style.transition = 'transform 0.2s ease, filter 0.2s ease';
                    heroVisual.style.transform = 'scale(1.5)';
                    heroVisual.style.filter = 'brightness(2) drop-shadow(0 0 15px #fbbf24)';
                    setTimeout(() => {
                        heroVisual.style.transform = 'translateX(20px) scale(1.3)';
                        setTimeout(() => { heroVisual.style.transition = ''; heroVisual.style.transform = ''; heroVisual.style.filter = ''; }, 300);
                    }, 300);
                }
                // \u540c\u65f6\u5bf9BOSS\u9020\u6210\u4f24\u5bb3
                setTimeout(() => {
                    if (bossVisual) {
                        bossVisual.style.transition = 'transform 0.1s ease, filter 0.1s ease';
                        bossVisual.style.transform = 'scale(0.9)';
                        bossVisual.style.filter = 'brightness(3) saturate(0.3)';
                        setTimeout(() => {
                            bossVisual.style.filter = 'brightness(1.5)';
                            setTimeout(() => { bossVisual.style.transition = ''; bossVisual.style.transform = ''; bossVisual.style.filter = ''; }, 200);
                        }, 100);
                    }
                    this._showDamageText('boss-cinematic-boss-zone', '-1', '#fbbf24');
                }, 400);
                // \u98d8\u5b57\u63d0\u793a
                this._showDamageText('boss-cinematic-hero-zone', '\u6700\u540e\u4e00\u640f!', '#fbbf24');
            }, 100);
        }

        // \u6e05\u7406\u95ea\u5c4f
        setTimeout(() => { if (flashOverlay.parentElement) flashOverlay.remove(); }, 800);
    },

    /**
     * 伤害飘字特效
     */
    _showDamageText(parentId, text, color) {
        const parent = document.getElementById(parentId) || document.querySelector('.' + parentId);
        if (!parent) return;
        const isBossZone = parentId.includes('boss-zone') || parentId === 'boss-vs-boss';
        const dmgEl = document.createElement('div');
        dmgEl.textContent = text;
        dmgEl.style.cssText = `position:absolute;top:10%;${isBossZone ? 'left' : 'right'}:50%;transform:translateX(-50%);font-size:1.8rem;font-weight:900;color:${color};text-shadow:0 0 12px ${color},0 2px 6px rgba(0,0,0,0.8);pointer-events:none;z-index:60;animation:dmg-float 0.8s ease-out forwards;`;
        parent.style.position = 'relative';
        parent.appendChild(dmgEl);
        setTimeout(() => dmgEl.remove(), 800);
    },

    /**
     * 更新 BOSS HP 条显示
     */
    _updateBossHpDisplay(state) {
        if (!state.isBoss) return;
        const bossHpFill = document.getElementById('boss-hp-fill');
        const userHpFill = document.getElementById('user-hp-fill');
        const bossHpText = document.querySelector('.boss-hp-text');
        const userHpText = document.querySelector('.user-hp-text');

        if (bossHpFill) bossHpFill.style.width = (state.bossMaxHp > 0 ? (state.bossHp / state.bossMaxHp * 100) : 0) + '%';
        if (userHpFill) userHpFill.style.width = (state.userMaxHp > 0 ? (state.userHp / state.userMaxHp * 100) : 0) + '%';
        if (bossHpText) bossHpText.innerHTML = state.bossHp + '<span style="opacity:0.5;">/' + state.bossMaxHp + '</span>';
        if (userHpText) userHpText.innerHTML = state.userHp + '<span style="opacity:0.5;">/' + state.userMaxHp + '</span>';

        // \u66b4\u6012\u72b6\u6001
        if (state.bossPhase === 'rage') {
            const cinematicContainer = document.getElementById('boss-battle-ui');
            if (cinematicContainer && !cinematicContainer.querySelector('.boss-cinematic-rage-overlay')) {
                const overlay = document.createElement('div');
                overlay.className = 'boss-cinematic-rage-overlay';
                cinematicContainer.insertBefore(overlay, cinematicContainer.firstChild);
            }
            if (cinematicContainer && !cinematicContainer.querySelector('.boss-cinematic-rage-banner')) {
                const banner = document.createElement('div');
                banner.className = 'boss-cinematic-rage-banner';
                banner.innerHTML = '<i class="fas fa-fire"></i> BOSS \u66b4\u6012\u4e2d! \u4f24\u5bb3\u00d7' + (state.rageDamage || 2);
                const scene = cinematicContainer.querySelector('.boss-cinematic-scene');
                if (scene) scene.after(banner);
            }
            const bossVisual = document.querySelector('.boss-cinematic-boss-visual');
            if (bossVisual) {
                const bossDef = state.bossDef || {};
                bossVisual.style.filter = 'drop-shadow(0 0 20px ' + (bossDef.color || '#ef4444') + ')';
                bossVisual.style.animation = 'boss-shake 0.3s ease-in-out infinite';
            }
            if (bossHpFill) bossHpFill.style.background = '#ff4444';
        }

        // \u7528\u6237HP\u4f4e\u8840\u91cf\u8b66\u544a
        if (userHpFill) {
            const pct = state.userMaxHp > 0 ? state.userHp / state.userMaxHp : 0;
            userHpFill.style.background = pct <= 0.3 ? '#f87171' : '#34d399';
        }
    },

    /**
     * 记录 BOSS 击败统计（localStorage）
     */
    _recordBossDefeat(bossLevel, bossType, isPerfect) {
        const stats = JSON.parse(localStorage.getItem('fmi_boss_stats') || '{"defeated":0,"perfect":false,"bosses":{}}');
        stats.defeated++;
        if (isPerfect) stats.perfect = true;
        const key = bossType === 'big' ? bossLevel + '_final' : bossLevel + '_mini';
        stats.bosses[key] = (stats.bosses[key] || 0) + 1;
        localStorage.setItem('fmi_boss_stats', JSON.stringify(stats));
    },

    /**
     * 记录连胜数据（用于条件称号）
     */
    _recordStreak(isHell) {
        const data = JSON.parse(localStorage.getItem('fmi_streaks') || '{"maxStreak":0,"hellMaxStreak":0}');
        const state = this.challengeState;
        if (!state) return;
        if (isHell) {
            data.hellMaxStreak = Math.max(data.hellMaxStreak, state.maxStreak);
        }
        data.maxStreak = Math.max(data.maxStreak, state.maxStreak);
        localStorage.setItem('fmi_streaks', JSON.stringify(data));
    },
    // ========== BOSS战结果页面 ==========

    /**
     * BOSS战结果页面入口
     */
    _renderBossResult(container, result) {
        const state = this.challengeState;
        if (!state || !state.isBoss) return;

        const bossDef = state.bossDef || {};
        const bossName = bossDef.name || 'BOSS';
        const bossIcon = bossDef.icon || 'fa-skull';
        const bossColor = bossDef.color || '#ef4444';
        const bossType = state.bossParams?.type || 'mini';
        const bossLevel = state.bossParams?.level ?? 0;

        // 记录BOSS击败统计
        if (result === 'win') {
            const isPerfect = state.userHp === state.userMaxHp;
            this._recordBossDefeat(bossLevel, bossType, isPerfect);
        }

        // 记录连胜
        this._recordStreak(true);

        // 保存BOSS关卡进度
        this._saveBossProgress(result);

        // 更新称号
        this._updateTitlesAfterBoss(result, bossLevel, bossType);

        if (result === 'win') {
            this._renderBossVictoryPage(container, state, bossDef);
        } else {
            this._renderBossDefeatPage(container, state, bossDef);
        }
    },

    /**
     * BOSS战胜利页面
     */
    _renderBossVictoryPage(container, state, bossDef) {
        const bossName = bossDef.name || 'BOSS';
        const bossIcon = bossDef.icon || 'fa-skull';
        const bossColor = bossDef.color || '#ef4444';
        const bossType = state.bossParams?.type || 'mini';
        const isPerfect = state.userHp === state.userMaxHp;
        const timeSpent = Math.floor((Date.now() - state.startTime) / 1000);
        const totalQ = state.totalQuestions;
        const correctCount = state.correct;
        const accuracy = totalQ > 0 ? Math.round((correctCount / totalQ) * 100) : 0;

        const isBigBoss = bossType === 'big';
        const pageTitle = isBigBoss ? `${bossName} 已被击败！` : `${bossName} 被击败了！`;
        const subtitleText = isBigBoss
            ? `恭喜你击败了${bossName}！你的印尼语实力已经得到了证明！`
            : `你成功击败了小BOSS ${bossName}！继续前进吧！`;

        container.innerHTML = `
        <div class="boss-result-page boss-victory-page">
            <div class="boss-result-particles" id="boss-particles"></div>
            <div class="boss-result-card victory-card">
                <div class="boss-result-badge victory-badge">
                    <i class="fas ${bossIcon} boss-defeated-icon" style="color:${bossColor};"></i>
                </div>
                <h2 class="boss-result-title victory-title">${pageTitle}</h2>
                <p class="boss-result-subtitle">${subtitleText}</p>

                <div class="boss-result-stats">
                    <div class="boss-stat-item">
                        <div class="boss-stat-value victory-value">${accuracy}%</div>
                        <div class="boss-stat-label">准确率</div>
                    </div>
                    <div class="boss-stat-item">
                        <div class="boss-stat-value victory-value">${correctCount}/${totalQ}</div>
                        <div class="boss-stat-label">答对/总题</div>
                    </div>
                    <div class="boss-stat-item">
                        <div class="boss-stat-value victory-value">${state.maxStreak}</div>
                        <div class="boss-stat-label">最大连胜</div>
                    </div>
                    <div class="boss-stat-item">
                        <div class="boss-stat-value victory-value">${this._formatTime(timeSpent)}</div>
                        <div class="boss-stat-label">用时</div>
                    </div>
                </div>

                ${isPerfect ? `
                <div class="boss-perfect-notice">
                    <i class="fas fa-crown"></i> 完美通关！零失误击败BOSS！
                </div>
                ` : `
                <div class="boss-hp-remaining">
                    <i class="fas fa-heart"></i> 剩余HP: ${state.userHp}/${state.userMaxHp}
                </div>
                `}

                ${isBigBoss ? `
                <div class="boss-result-title-unlock">
                    <i class="fas fa-trophy"></i>
                    <span>称号已解锁：击败${bossName}</span>
                </div>
                ` : ''}

                <div class="boss-result-actions">
                    <button class="boss-btn boss-btn-return" onclick="ChallengeModule._returnToMap()">
                        <i class="fas fa-map"></i> 返回关卡地图
                    </button>
                </div>
            </div>
        </div>`;

        // 启动胜利粒子动画
        this._startVictoryParticles();
    },

    /**
     * BOSS战失败页面
     */
    _renderBossDefeatPage(container, state, bossDef) {
        const bossName = bossDef.name || 'BOSS';
        const bossIcon = bossDef.icon || 'fa-skull';
        const bossColor = bossDef.color || '#ef4444';
        const timeSpent = Math.floor((Date.now() - state.startTime) / 1000);
        const totalQ = state.totalQuestions;
        const correctCount = state.correct;
        const bossHpLeft = state.bossHp;
        const bossMaxHp = state.bossMaxHp;
        const bossProgress = Math.round(((bossMaxHp - bossHpLeft) / bossMaxHp) * 100);

        const encourageMessages = [
            `${bossName}很强大，但不要放弃！再试一次吧！`,
            `你离击败${bossName}只差一步了！回来再战！`,
            `不要气馁！${bossName}虽然强大，但你可以通过更多练习来战胜它！`,
            `每次挑战都是学习的机会！回去复习一下再来吧！`,
        ];
        const randomMsg = encourageMessages[Math.floor(Math.random() * encourageMessages.length)];

        container.innerHTML = `
        <div class="boss-result-page boss-defeat-page">
            <div class="boss-result-card defeat-card">
                <div class="boss-result-badge defeat-badge">
                    <i class="fas fa-heart-broken boss-defeat-icon"></i>
                </div>
                <h2 class="boss-result-title defeat-title">你被击败了...</h2>
                <p class="boss-result-subtitle">${randomMsg}</p>

                <div class="boss-result-stats">
                    <div class="boss-stat-item">
                        <div class="boss-stat-value defeat-value">${bossProgress}%</div>
                        <div class="boss-stat-label">BOSS伤害</div>
                    </div>
                    <div class="boss-stat-item">
                        <div class="boss-stat-value defeat-value">${bossHpLeft}/${bossMaxHp}</div>
                        <div class="boss-stat-label">BOSS剩余HP</div>
                    </div>
                    <div class="boss-stat-item">
                        <div class="boss-stat-value defeat-value">${correctCount}/${totalQ}</div>
                        <div class="boss-stat-label">答对/总题</div>
                    </div>
                    <div class="boss-stat-item">
                        <div class="boss-stat-value defeat-value">${this._formatTime(timeSpent)}</div>
                        <div class="boss-stat-label">用时</div>
                    </div>
                </div>

                <div class="boss-defeat-hp-bar">
                    <div class="boss-defeat-hp-label">BOSS 血量</div>
                    <div class="boss-defeat-hp-track">
                        <div class="boss-defeat-hp-fill" style="width:${Math.round((bossHpLeft/bossMaxHp)*100)}%; background:${bossColor};"></div>
                    </div>
                </div>

                <div class="boss-result-actions">
                    <button class="boss-btn boss-btn-retry" onclick="ChallengeModule._retryBoss()">
                        <i class="fas fa-redo"></i> 再战一次
                    </button>
                    <button class="boss-btn boss-btn-return" onclick="ChallengeModule._returnToMap()">
                        <i class="fas fa-map"></i> 返回关卡地图
                    </button>
                </div>
            </div>
        </div>`;
    },

    /**
     * 保存BOSS关卡进度到serverProgress
     */
    _saveBossProgress(result) {
        const state = this.challengeState;
        if (!state || !state.isBoss) return;
        const key = 'fmi_server_progress';
        const progress = JSON.parse(localStorage.getItem(key) || '{}');
        const stageKey = String(state.stageId || 'unknown');

        if (!progress[stageKey]) progress[stageKey] = {};
        progress[stageKey].bossCleared = result === 'win';
        progress[stageKey].bossAttempts = (progress[stageKey].bossAttempts || 0) + 1;
        if (result === 'win') {
            progress[stageKey].bossBestHp = Math.max(
                progress[stageKey].bossBestHp || 0,
                state.userHp
            );
            progress[stageKey].bossBestTime = Math.min(
                progress[stageKey].bossBestTime || Infinity,
                Math.floor((Date.now() - state.startTime) / 1000)
            );
        }
        localStorage.setItem(key, JSON.stringify(progress));
    },

    /**
     * BOSS胜利后更新称号
     */
    _updateTitlesAfterBoss(result, bossLevel, bossType) {
        if (result !== 'win') return;
        // 称号会在下次查看称号墙时自动重新计算
        const key = 'fmi_boss_stats';
        const stats = JSON.parse(localStorage.getItem(key) || '{}');
        const bossKey = `${bossLevel}_${bossType}`;
        if (!stats[bossKey]) stats[bossKey] = {};
        stats[bossKey].lastDefeat = Date.now();
        localStorage.setItem(key, JSON.stringify(stats));
    },

    /**
     * 返回关卡地图
     */
    _returnToMap() {
        clearInterval(this._timerInterval);
        this.challengeState = null;
        const subContent = document.getElementById('challenge-sub-content');
        if (subContent) {
            this.renderStages(subContent);
        }
    },

    /**
     * 重试BOSS战
     */
    _retryBoss() {
        const state = this.challengeState;
        if (!state || !state.isBoss) return;
        // 重新开始同一个BOSS关卡（使用stageId重新进入）
        const stageId = state.stageId;
        if (stageId) {
            this._inChallenge = false;
            this.challengeState = null;
            this.enterStage(stageId);
        }
    },

    /**
     * 胜利粒子动画
     */
    _startVictoryParticles() {
        const container = document.getElementById('boss-particles');
        if (!container) return;
        const colors = ['#fbbf24', '#f59e0b', '#a78bfa', '#60a5fa', '#34d399', '#f87171'];
        for (let i = 0; i < 30; i++) {
            const particle = document.createElement('div');
            particle.className = 'boss-victory-particle';
            particle.style.left = Math.random() * 100 + '%';
            particle.style.animationDelay = Math.random() * 2 + 's';
            particle.style.animationDuration = (2 + Math.random() * 3) + 's';
            particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            particle.style.setProperty('--tx', (Math.random() * 200 - 100) + 'px');
            particle.style.setProperty('--ty', -(100 + Math.random() * 300) + 'px');
            container.appendChild(particle);
        }
        // 清理粒子
        setTimeout(() => { if (container) container.innerHTML = ''; }, 6000);
    },

    /**
     * 格式化时间
     */
    _formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return m > 0 ? `${m}分${s.toString().padStart(2, '0')}秒` : `${s}秒`;
    },

    // ========== 称号系统 ==========

// ========== 称号系统 ==========
    _titleDefs: {
        // ====== 课程通关型称号 - 普通模式 ======
        normal_clear_0:  { id: 'normal_clear_0',  name: '发音学徒', icon: 'fa-music', category: 'normal', desc: '通关 BIPA 0 基础发音篇全部关卡', levelId: '0' },
        normal_star_0:   { id: 'normal_star_0',   name: '发音大师', icon: 'fa-headphones', category: 'normal', desc: 'BIPA 0 全部关卡获得三星', levelId: '0' },
        normal_clear_1:  { id: 'normal_clear_1',  name: '巴厘新芽', icon: 'fa-seedling', category: 'normal', desc: '通关 BIPA 1 基础篇全部关卡', levelId: '1' },
        normal_star_1:   { id: 'normal_star_1',   name: '巴厘之花', icon: 'fa-leaf', category: 'normal', desc: 'BIPA 1 全部关卡获得三星', levelId: '1' },
        normal_clear_2:  { id: 'normal_clear_2',  name: '群岛行者', icon: 'fa-compass', category: 'normal', desc: '通关 BIPA 2 中级篇全部关卡', levelId: '2' },
        normal_star_2:   { id: 'normal_star_2',   name: '群岛领航', icon: 'fa-ship', category: 'normal', desc: 'BIPA 2 全部关卡获得三星', levelId: '2' },
        normal_clear_3:  { id: 'normal_clear_3',  name: '珊瑚守护者', icon: 'fa-fish', category: 'normal', desc: '通关 BIPA 3 中高级全部关卡', levelId: '3' },
        normal_star_3:   { id: 'normal_star_3',   name: '珊瑚之王', icon: 'fa-crown', category: 'normal', desc: 'BIPA 3 全部关卡获得三星', levelId: '3' },
        normal_clear_4:  { id: 'normal_clear_4',  name: '伽鲁达之翼', icon: 'fa-dove', category: 'normal', desc: '通关 BIPA 4 高级篇全部关卡', levelId: '4' },
        normal_star_4:   { id: 'normal_star_4',   name: '伽鲁达之王', icon: 'fa-crown', category: 'normal', desc: 'BIPA 4 全部关卡获得三星', levelId: '4' },
        normal_clear_5:  { id: 'normal_clear_5',  name: '浮屠朝圣者', icon: 'fa-landmark', category: 'normal', desc: '通关 BIPA 5 高级进阶全部关卡', levelId: '5' },
        normal_star_5:   { id: 'normal_star_5',   name: '浮屠守护者', icon: 'fa-shield', category: 'normal', desc: 'BIPA 5 全部关卡获得三星', levelId: '5' },
        normal_clear_6:  { id: 'normal_clear_6',  name: '诸神语者', icon: 'fa-comments', category: 'normal', desc: '通关 BIPA 6 精通篇全部关卡', levelId: '6' },
        normal_star_6:   { id: 'normal_star_6',   name: '神谕使者', icon: 'fa-hat-wizard', category: 'normal', desc: 'BIPA 6 全部关卡获得三星', levelId: '6' },
        normal_clear_7:  { id: 'normal_clear_7',  name: '印尼语宗师', icon: 'fa-scroll', category: 'normal', desc: '通关 BIPA 7 卓越篇全部关卡', levelId: '7' },
        normal_star_7:   { id: 'normal_star_7',   name: '语言之神', icon: 'fa-star', category: 'normal', desc: 'BIPA 7 全部关卡获得三星（最高荣誉）', levelId: '7' },
        normal_clear_all:{ id: 'normal_clear_all',name: '全境征服者', icon: 'fa-trophy', category: 'normal', desc: '通关全部 BIPA 0-7 普通模式', levelId: 'all' },

        // ====== 课程通关型称号 - 地狱模式 ======
        hell_clear_0:  { id: 'hell_clear_0',  name: '幽冥之声', icon: 'fa-wand-sparkles', category: 'hell', desc: '地狱通关 BIPA 0 基础发音篇', levelId: '0' },
        hell_star_0:   { id: 'hell_star_0',   name: '万鬼齐喑', icon: 'fa-ghost', category: 'hell', desc: '地狱 BIPA 0 全部三星通关', levelId: '0' },
        hell_clear_1:  { id: 'hell_clear_1',  name: '暗影新兵', icon: 'fa-user-ninja', category: 'hell', desc: '地狱通关 BIPA 1 基础篇', levelId: '1' },
        hell_star_1:   { id: 'hell_star_1',   name: '暗影猎手', icon: 'fa-crosshairs', category: 'hell', desc: '地狱 BIPA 1 全部三星通关', levelId: '1' },
        hell_clear_2:  { id: 'hell_clear_2',  name: '熔岩行者', icon: 'fa-fire', category: 'hell', desc: '地狱通关 BIPA 2 中级篇', levelId: '2' },
        hell_star_2:   { id: 'hell_star_2',   name: '熔岩之王', icon: 'fa-fire-flame-curved', category: 'hell', desc: '地狱 BIPA 2 全部三星通关', levelId: '2' },
        hell_clear_3:  { id: 'hell_clear_3',  name: '深渊守卫', icon: 'fa-shield-halved', category: 'hell', desc: '地狱通关 BIPA 3 中高级', levelId: '3' },
        hell_star_3:   { id: 'hell_star_3',   name: '深渊之主', icon: 'fa-chess-rook', category: 'hell', desc: '地狱 BIPA 3 全部三星通关', levelId: '3' },
        hell_clear_4:  { id: 'hell_clear_4',  name: '暗黑伽鲁达', icon: 'fa-feather-pointed', category: 'hell', desc: '地狱通关 BIPA 4 高级篇', levelId: '4' },
        hell_star_4:   { id: 'hell_star_4',   name: '伽鲁达觉醒', icon: 'fa-sun', category: 'hell', desc: '地狱 BIPA 4 全部三星通关', levelId: '4' },
        hell_clear_5:  { id: 'hell_clear_5',  name: '魔窟朝圣者', icon: 'fa-gopuram', category: 'hell', desc: '地狱通关 BIPA 5 高级进阶', levelId: '5' },
        hell_star_5:   { id: 'hell_star_5',   name: '魔窟之主', icon: 'fa-skull-crossbones', category: 'hell', desc: '地狱 BIPA 5 全部三星通关', levelId: '5' },
        hell_clear_6:  { id: 'hell_clear_6',  name: '逆神者', icon: 'fa-bolt', category: 'hell', desc: '地狱通关 BIPA 6 精通篇', levelId: '6' },
        hell_star_6:   { id: 'hell_star_6',   name: '弑神者', icon: 'fa-hand-fist', category: 'hell', desc: '地狱 BIPA 6 全部三星通关', levelId: '6' },
        hell_clear_7:  { id: 'hell_clear_7',  name: '地狱终焉', icon: 'fa-skull', category: 'hell', desc: '地狱通关 BIPA 7 卓越篇', levelId: '7' },
        hell_star_7:   { id: 'hell_star_7',   name: '万魔之王', icon: 'fa-dragon', category: 'hell', desc: '地狱 BIPA 7 全部三星（终极荣耀）', levelId: '7' },
        hell_clear_all:{ id: 'hell_clear_all',name: '地狱征服者', icon: 'fa-fire-flame-simple', category: 'hell', desc: '地狱通关全部 BIPA 0-7', levelId: 'all' },

        // ====== BOSS 相关称号 ======
        boss_first:    { id: 'boss_first',    name: '首席屠龙者', icon: 'fa-shield-halved', category: 'boss', desc: '首次击败任意 BOSS' },
        boss_hunter_5: { id: 'boss_hunter_5', name: '猎魔先锋', icon: 'fa-crosshairs', category: 'boss', desc: '累计击败 5 个 BOSS' },
        boss_hunter_15:{ id: 'boss_hunter_15',name: 'BOSS 猎人', icon: 'fa-skull-crossbones', category: 'boss', desc: '累计击败 15 个 BOSS' },
        boss_final:    { id: 'boss_final',    name: '诸魔克星', icon: 'fa-dragon', category: 'boss', desc: '击败 BIPA 7 终极 BOSS' },
        boss_perfect:  { id: 'boss_perfect',  name: '完美击杀', icon: 'fa-gem', category: 'boss', desc: '无伤通关任意 BOSS（用户HP不掉）' },

        // ====== 条件称号 ======
        speedrun:      { id: 'speedrun',      name: '速通达人', icon: 'fa-bolt', category: 'condition', desc: '任意关卡 accuracy=100% 且用时低于时限30%' },
        retry_star:    { id: 'retry_star',    name: '不屈意志', icon: 'fa-heart-crack', category: 'condition', desc: '单关重试5次后三星通关' },
        clear_100:     { id: 'clear_100',     name: '百关斩将', icon: 'fa-shield', category: 'condition', desc: '累计通关100关（普通+地狱）' },
        streak_20:     { id: 'streak_20',     name: '连胜传说', icon: 'fa-fire', category: 'condition', desc: '单次闯关中连续答对20题' },
        hell_streak_15:{ id: 'hell_streak_15',name: '地狱连胜', icon: 'fa-fire-flame-curved', category: 'condition', desc: '地狱模式连续答对15题' },

        // ====== 通用称号 ======
        login_first:   { id: 'login_first',   name: '踏入门内', icon: 'fa-door-open', category: 'general', desc: '首次登录系统' },
        study_days_7:  { id: 'study_days_7',  name: '坚持不懈', icon: 'fa-calendar-check', category: 'general', desc: '累计学习天数达到7天' },
        study_days_30: { id: 'study_days_30', name: '学习达人', icon: 'fa-calendar-days', category: 'general', desc: '累计学习天数达到30天' },
        study_days_100:{ id: 'study_days_100',name: '百日修行', icon: 'fa-trophy', category: 'general', desc: '累计学习天数达到100天' },
        words_500:     { id: 'words_500',     name: '词汇新星', icon: 'fa-star', category: 'general', desc: '累计学习500个单词' },
        words_2000:    { id: 'words_2000',    name: '词汇大师', icon: 'fa-gem', category: 'general', desc: '累计学习2000个单词' },
    },
    // ========== 边框装饰定义 ==========
    _frameDefs: {
        'frame_01': { id: '01', name: '翡翠流光', desc: '击败声之魔灵后解锁', titleReq: 'boss_voice_slayer', color: '#34d399', gradient: 'linear-gradient(135deg,#34d399,#10b981)' },
        'frame_02': { id: '02', name: '赤焰之环', desc: '击败婆罗多神将后解锁', titleReq: 'boss_bharata_slayer', color: '#f87171', gradient: 'linear-gradient(135deg,#f87171,#ef4444)' },
        'frame_03': { id: '03', name: '金砂纹章', desc: '击败Raksasa巨魔后解锁', titleReq: 'boss_raksasa_slayer', color: '#fbbf24', gradient: 'linear-gradient(135deg,#fbbf24,#f59e0b)' },
        'frame_04': { id: '04', name: '深海之盾', desc: '击败Naga蛇龙后解锁', titleReq: 'boss_naga_slayer', color: '#38bdf8', gradient: 'linear-gradient(135deg,#38bdf8,#0ea5e9)' },
        'frame_05': { id: '05', name: '紫晶幻境', desc: '击败Garuda伽鲁达后解锁', titleReq: 'boss_garuda_slayer', color: '#a78bfa', gradient: 'linear-gradient(135deg,#a78bfa,#8b5cf6)' },
        'frame_06': { id: '06', name: '烈焰荆棘', desc: '击败最终BOSS后解锁', titleReq: 'boss_final_slayer', color: '#ef4444', gradient: 'linear-gradient(135deg,#ef4444,#fbbf24)' },
        'frame_07': { id: '07', name: '星辉环冕', desc: '通关全部普通模式后解锁', titleReq: 'normal_all_clear', color: '#fbbf24', gradient: 'linear-gradient(135deg,#fbbf24,#f59e0b)' },
        'frame_08': { id: '08', name: '极光幻彩', desc: '通关全部地狱模式后解锁', titleReq: 'hell_all_clear', color: '#a78bfa', gradient: 'linear-gradient(135deg,#34d399,#a78bfa,#38bdf8)' },
        'frame_09': { id: '09', name: '彩虹碎片', desc: '完成特殊挑战后解锁', titleReq: 'challenge_master', color: '#f59e0b', gradient: 'linear-gradient(135deg,#f59e0b,#ef4444,#8b5cf6,#3b82f6,#10b981)' },
    },

    _equippedFrameId: null, // 当前装备的边框

    _earnedTitles: {}, // { titleId: earnedAt }
    _titleLoaded: false,
    _selectedTitle: null, // 用户当前佩戴的称号

    /**
     * 加载称号数据（从服务端拉取 + 本地缓存）
     */
    async _loadTitles() {
        // 管理员自动拥有所有称号和边框（用于预览效果）
        const userInfo = JSON.parse(sessionStorage.getItem('fmi_user') || '{}');
        if (userInfo.role === 'admin') {
            const allTitles = {};
            for (const key of Object.keys(this._titleDefs)) {
                allTitles[key] = '2026-01-01T00:00:00Z';
            }
            this._earnedTitles = allTitles;
            return; // 管理员跳过服务端同步
        }

        // 先从本地读取缓存
        const cached = localStorage.getItem('fmi_titles');
        if (cached) {
            try {
                const data = JSON.parse(cached);
                this._earnedTitles = data.earnedTitles || {};
                this._selectedTitle = data.selectedTitle || null;
                // 加载佩戴的称号
                try { this._equippedTitleId = localStorage.getItem('challenge_equipped_title') || ''; } catch(e) { this._equippedTitleId = ''; }
            } catch(e) {
                this._equippedTitleId = '';
            }
        }

        // 从服务端同步
        try {
            const res = await API.request('user/titles');
            if (res.success && res.titles) {
                const newEarned = {};
                for (const t of res.titles) {
                    if (t.earned) newEarned[t.id] = t.earnedAt;
                }
                this._earnedTitles = newEarned;

                // 同步前端计算的挑战模式称号到服务端
                const challengeTitles = this._computeChallengeTitles();
                if (challengeTitles.length > 0) {
                    await API.request('user/titles', {
                        method: 'POST',
                        body: JSON.stringify({
                            titles: challengeTitles.map(id => ({
                                id,
                                earnedAt: this._earnedTitles[id] || new Date().toISOString(),
                            })),
                        }),
                    });
                }

                // 处理新获得的通用称号通知
                if (res.newTitles && res.newTitles.length > 0) {
                    for (const t of res.newTitles) {
                        this._showTitleNotification(t);
                    }
                }

                // 保存到本地
                this._saveTitlesCache();
                this._titleLoaded = true;
                // 如果称号墙已显示，刷新它
                if (this.currentView === 'titles') {
                    const subContent = document.getElementById('challenge-sub-content');
                    if (subContent) this._renderTitlesWall(subContent);
                }
                // 加载已装备的边框
                this._loadEquippedFrame();
                // 如果关卡列表已显示，刷新以更新称号徽章
                if (this.currentView === 'stages') {
                    const subContent2 = document.getElementById('challenge-sub-content');
                    if (subContent2) this.renderStages(subContent2);
                }
            }
        } catch(e) {
            console.warn('Failed to load titles:', e);
            this._titleLoaded = true;
        }
    },

    _saveTitlesCache() {
        localStorage.setItem('fmi_titles', JSON.stringify({
            earnedTitles: this._earnedTitles,
            selectedTitle: this._selectedTitle,
        }));
    },

    /**
     * 计算当前应得的挑战模式称号（前端计算，因为前端有完整的 mode + progress 信息）
     */
    _computeChallengeTitles() {
        const newTitles = [];
        const progress = this.serverProgress;

        if (typeof CourseContent === 'undefined' || !CourseContent.getAllStages) return newTitles;

        const config = this._getStudyLevelConfig ? this._getStudyLevelConfig() : {};
        const levels = ['0','1','2','3','4','5','6','7'];

        // 辅助：检查某等级某模式是否全部通关/全三星
        const checkLevelProgress = (levelId, mode) => {
            const stages = CourseContent.getAllStages(mode);
            const filtered = stages.filter(s => {
                const st = config[Number(s.levelId)];
                return st !== 0; // 非隐藏
            });
            const levelStages = filtered.filter(s => String(s.levelId) === String(levelId));
            if (levelStages.length === 0) return { total: 0, cleared: 0, starred: 0 };
            let cleared = 0, starred = 0;
            for (const s of levelStages) {
                const p = progress[s.id];
                if (p && p.cleared) cleared++;
                if (p && p.stars >= 3) starred++;
            }
            return { total: levelStages.length, cleared, starred };
        };

        // === 普通模式课程通关称号 ===
        let normalAllCleared = true;
        for (const lv of levels) {
            const r = checkLevelProgress(lv, 'normal');
            if (r.total > 0) {
                if (r.cleared === r.total) {
                    newTitles.push('normal_clear_' + lv);
                } else {
                    if (lv !== 'all') normalAllCleared = false; // 有等级未通关则不能给全部通关
                }
                if (r.starred === r.total) {
                    newTitles.push('normal_star_' + lv);
                }
            }
        }
        if (normalAllCleared) newTitles.push('normal_clear_all');

        // === 地狱模式课程通关称号 ===
        let hellAllCleared = true;
        for (const lv of levels) {
            const r = checkLevelProgress(lv, 'hell');
            if (r.total > 0) {
                if (r.cleared === r.total) {
                    newTitles.push('hell_clear_' + lv);
                } else {
                    if (lv !== 'all') hellAllCleared = false;
                }
                if (r.starred === r.total) {
                    newTitles.push('hell_star_' + lv);
                }
            }
        }
        if (hellAllCleared) newTitles.push('hell_clear_all');

        // === BOSS 相关称号 ===
        const bossStats = JSON.parse(localStorage.getItem('fmi_boss_stats') || '{"defeated":0,"perfect":false,"bosses":{}}');
        if (bossStats.defeated >= 1) newTitles.push('boss_first');
        if (bossStats.defeated >= 5) newTitles.push('boss_hunter_5');
        if (bossStats.defeated >= 15) newTitles.push('boss_hunter_15');
        if (bossStats.bosses['7_final']) newTitles.push('boss_final');
        if (bossStats.perfect) newTitles.push('boss_perfect');

        // === 条件称号 ===
        // 速通达人
        const allProgress = Object.values(progress);
        for (const p of allProgress) {
            if (p.stars >= 3 && p.bestAccuracy >= 100 && p.bestTime > 0) {
                // 用时低于时限30%：总题数*每题平均时间*0.3作为阈值
                // 简化：直接标记（前端答题时记录speedrun标记）
                const speedRuns = JSON.parse(localStorage.getItem('fmi_speedruns') || '[]');
                if (speedRuns.length > 0) { newTitles.push('speedrun'); break; }
            }
        }

        // 不屈意志
        for (const p of allProgress) {
            if (p.attempts >= 5 && p.cleared && p.stars >= 3) {
                newTitles.push('retry_star'); break;
            }
        }

        // 百关斩将
        let totalCleared = 0;
        const seen = new Set();
        for (const sId of Object.keys(progress)) {
            const baseId = sId.replace(/-hell$/, ''); // 去掉可能的hell后缀
            if (!seen.has(baseId) && progress[sId].cleared) {
                totalCleared++;
                seen.add(baseId);
            }
        }
        if (totalCleared >= 100) newTitles.push('clear_100');

        // 连胜记录
        const streakData = JSON.parse(localStorage.getItem('fmi_streaks') || '{"maxStreak":0,"hellMaxStreak":0}');
        if (streakData.maxStreak >= 20) newTitles.push('streak_20');
        if (streakData.hellMaxStreak >= 15) newTitles.push('hell_streak_15');

        return newTitles;
    },

    /**
     * 每次提交成绩后检查新称号
     */
    _checkAndSyncTitles() {
        const titles = this._computeChallengeTitles();
        const newOnes = [];
        const now = new Date().toISOString();

        for (const tid of titles) {
            if (!this._earnedTitles[tid]) {
                this._earnedTitles[tid] = now;
                newOnes.push(tid);
            }
        }

        if (newOnes.length > 0) {
            this._saveTitlesCache();

            // 显示称号获得通知
            for (const tid of newOnes) {
                const def = this._titleDefs[tid];
                if (def) this._showTitleNotification(def);
            }

            // 同步到服务端
            API.request('user/titles', {
                method: 'POST',
                body: JSON.stringify({
                    titles: newOnes.map(id => ({
                        id,
                        earnedAt: this._earnedTitles[id],
                    })),
                }),
            }).catch(e => console.warn('Failed to sync titles:', e));
        }
    },

    /**
     * 显示称号获得通知弹窗
     */
    _showTitleNotification(titleDef) {
        if (!titleDef) return;
        const categoryLabel = {
            normal: '普通模式',
            hell: '地狱模式',
            general: '通用',
        }[titleDef.category] || '';

        const categoryClass = {
            normal: 'title-normal',
            hell: 'title-hell',
            general: 'title-general',
        }[titleDef.category] || '';

        // 创建弹窗
        const overlay = document.createElement('div');
        overlay.className = 'title-notification-overlay';
        overlay.innerHTML = `
            <div class="title-notification-card ${categoryClass}">
                <div class="title-notification-sparkle"></div>
                <div class="title-notification-icon">
                    <i class="fas ${titleDef.icon}"></i>
                </div>
                <div class="title-notification-text">
                    <div class="title-notification-label">称号解锁</div>
                    <div class="title-notification-name">${titleDef.name}</div>
                    <div class="title-notification-desc">${titleDef.desc}</div>
                    ${categoryLabel ? `<div class="title-notification-category">${categoryLabel}</div>` : ''}
                </div>
                <button class="title-notification-close" onclick="this.closest('.title-notification-overlay').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        document.body.appendChild(overlay);

        // 3秒后自动关闭
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.classList.add('title-notification-fade-out');
                setTimeout(() => overlay.remove(), 500);
            }
        }, 4000);
    },

    /**
     * 渲染称号墙页面
     */
    _renderTitlesWall(container) {
        const defs = this._titleDefs;
        const earned = this._earnedTitles;
        const equippedId = this._equippedTitleId || '';

        const categories = [
            { key: 'normal', label: '普通模式通关', icon: 'fa-book' },
            { key: 'hell', label: '地狱模式通关', icon: 'fa-fire' },
            { key: 'boss', label: 'BOSS 击杀', icon: 'fa-dragon' },
            { key: 'condition', label: '挑战成就', icon: 'fa-medal' },
            { key: 'general', label: '通用称号', icon: 'fa-star' },
        ];

        let html = `
            <div class="ch-header">
                <button class="ch-back-btn" onclick="ChallengeModule.enterRank(); ChallengeModule.render();">
                    <i class="fas fa-arrow-left"></i> 返回
                </button>
                <h2 class="ch-title">称号墙</h2>
                <button class="ch-back-btn" onclick="ChallengeModule.renderBossCodex()" style="background:rgba(167,139,250,0.15);color:#a78bfa;border:1px solid rgba(167,139,250,0.3);" title="BOSS图鉴">
                    <i class="fas fa-book-skull"></i> BOSS图鉴
                </button>
            </div>
        `;

        const earnedCount = Object.keys(earned).length;
        const totalCount = Object.keys(defs).length;
        html += `
            <div class="title-wall-summary">
                <div class="title-wall-count">
                    <span class="title-count-num">${earnedCount}</span> / <span class="title-count-total">${totalCount}</span>
                </div>
                <div class="title-wall-progress-bar">
                    <div class="title-wall-progress-fill" style="width:${totalCount > 0 ? (earnedCount / totalCount * 100) : 0}%"></div>
                </div>
            </div>
        `;

        for (const cat of categories) {
            const catTitles = Object.values(defs).filter(d => d.category === cat.key);
            const catEarned = catTitles.filter(d => earned[d.id]);

            html += `
                <div class="title-wall-category">
                    <div class="title-wall-cat-header ${cat.key}">
                        <i class="fas ${cat.icon}"></i>
                        <span>${cat.label}</span>
                        <span class="title-wall-cat-count">${catEarned.length}/${catTitles.length}</span>
                    </div>
                    <div class="title-wall-grid">
            `;

            for (const t of catTitles) {
                const isEarned = !!earned[t.id];
                const isEquipped = equippedId === t.id;
                html += `
                    <div class="title-wall-item ${isEarned ? 'earned' : 'locked'} ${cat.key} ${isEquipped ? 'equipped' : ''}" data-title-id="${t.id}">
                        <div class="title-wall-icon">
                            <i class="fas ${isEarned ? t.icon : 'fa-lock'}"></i>
                        </div>
                        <div class="title-wall-name">${isEarned ? t.name : '???'}</div>
                        <div class="title-wall-desc">${t.desc}</div>
                        ${isEarned ? `<div class="title-wall-date">${this._formatTitleDate(earned[t.id])}</div>` : ''}
                        ${isEarned ? `<button class="title-equip-btn ${isEquipped ? 'equipped' : ''}" onclick="ChallengeModule.equipTitle('${t.id}')">
                            <i class="fas ${isEquipped ? 'fa-times-circle' : 'fa-hand-pointer'}"></i> ${isEquipped ? '点击卸下' : '佩戴'}
                        </button>` : ''}
                    </div>
                `;
            }

            html += `</div></div>`;
        }

        // 追加边框选择区域
        html += this._renderFrameSelector(container);

        container.innerHTML = html;
    },

    _formatTitleDate(dateStr) {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
        } catch(e) { return ''; }
    },

    /**
     * 获取当前用户最高档次称号的HTML徽章（用于关卡列表等地方显示）
     */
    _getTitleBadgeHTML() {
        const earned = this._earnedTitles;
        const earnedIds = Object.keys(earned);
        if (earnedIds.length === 0) return '';

        // 优先显示佩戴的称号，否则按优先级自动选择
        let bestTitleId = null;
        if (this._equippedTitleId && earned[this._equippedTitleId]) {
            bestTitleId = this._equippedTitleId;
        } else {
            const priority = [
                'hell_star_7', 'hell_clear_7', 'hell_star_6', 'hell_clear_6',
                'hell_star_5', 'hell_clear_5', 'hell_star_4', 'hell_clear_4',
                'boss_final', 'boss_hunter_15', 'boss_perfect',
                'hell_star_3', 'hell_clear_3', 'hell_star_2', 'hell_clear_2',
                'hell_star_1', 'hell_clear_1', 'hell_star_0', 'hell_clear_0',
                'hell_clear_all',
                'normal_star_7', 'normal_clear_7', 'normal_star_6', 'normal_clear_6',
                'normal_star_5', 'normal_clear_5', 'normal_star_4', 'normal_clear_4',
                'normal_star_3', 'normal_clear_3', 'normal_star_2', 'normal_clear_2',
                'normal_star_1', 'normal_clear_1', 'normal_star_0', 'normal_clear_0',
                'normal_clear_all',
                'boss_hunter_5', 'boss_first', 'clear_100',
                'hell_streak_15', 'streak_20', 'speedrun', 'retry_star',
                'words_2000', 'words_500', 'study_days_100', 'study_days_30',
                'study_days_7', 'login_first',
            ];
            for (const pid of priority) {
                if (earned[pid]) { bestTitleId = pid; break; }
            }
            if (!bestTitleId) bestTitleId = earnedIds[0];
        }

        const def = this._titleDefs[bestTitleId];
        if (!def) return '';

        const catColor = { normal: '#60a5fa', hell: '#f87171', boss: '#a78bfa', condition: '#34d399', general: '#fbbf24' }[def.category] || '#fbbf24';
        const catBg = { normal: 'rgba(96,165,250,0.12)', hell: 'rgba(239,68,68,0.12)', boss: 'rgba(167,139,250,0.12)', condition: 'rgba(52,211,153,0.12)', general: 'rgba(250,204,21,0.12)' }[def.category] || 'rgba(250,204,21,0.12)';

        return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 10px;background:${catBg};color:${catColor};border:1px solid ${catColor}33;border-radius:12px;font-size:0.7rem;font-weight:600;cursor:pointer;" onclick="ChallengeModule.enterTitles()" title="${def.desc}">
            <i class="fas ${def.icon}"></i> ${def.name}
        </span>`;
    },

    /** 进入称号墙 */
    enterTitles() {
        this.currentView = 'titles';
        this.render();
    },

        _shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    },
};