/**
 * module-challenge.js
 * 闯天关模块 - 包含关卡地图、答题界面、排行榜
 * 子Tab: 闯关(Challenge) / 排行榜(Rank)
 */

const ChallengeModule = {
    currentView: 'home', // home | modes | stages | rank-modes | rank
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

    _applyChallengeLevelFilter() {
        const config = this._getStudyLevelConfig();
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
        // 检查闯天关是否启用
        const sysInfo = window._systemInfo || {};
        if (sysInfo.challengeEnabled === false) {
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
        } else if (view === 'rank-modes' || view === 'rank') {
            breadcrumb = `<div style="padding:8px 12px;display:flex;align-items:center;gap:6px;">
                <span style="cursor:pointer;color:#64748b;font-size:0.8rem;" onclick="ChallengeModule.goHome()"><i class="fas fa-home"></i> 首页</span>
                <i class="fas fa-chevron-right" style="color:#475569;font-size:0.6rem;"></i>
                <span style="color:#e2e8f0;font-size:0.8rem;font-weight:600;">排行榜</span>
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
        }

        this.container.innerHTML = `<div class="challenge-module">${breadcrumb}${bodyHtml}</div>`;

        if (view === 'stages') {
            const subContent = document.getElementById('challenge-sub-content');
            if (subContent) this.renderStages(subContent);
        } else if (view === 'rank') {
            const subContent = document.getElementById('challenge-sub-content');
            if (subContent) this.renderRank(subContent);
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

    _regenerateStages() {
        // 根据当前模式重新生成关卡列表（使用对应的切分配置）
        this.allStages = CourseContent.getAllStages(this.challengeMode);
        
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
                const isHellLocked = sequentialMode && i > nextAvailable;
                const isReadonly = stage._readonly === true;
                const isLocked = isHellLocked || isReadonly;

                const stars = p?.stars || 0;

                let statusClass = isLocked ? 'locked' : isCleared ? 'cleared' : isCurrent ? 'current' : 'available';
                let statusIcon = isLocked
                    ? (isReadonly ? '<i class="fas fa-lock" style="color:#f59e0b;"></i>' : '<i class="fas fa-lock"></i>')
                    : isCleared ? this._renderStars(stars)
                    : isCurrent ? '<i class="fas fa-play-circle"></i>'
                    : '';

                // 地狱模式：根据 levelId 添加门造型
                const _hellGateInfo = group.isHell ? this._getHellGateStyle(group.levelId, isLocked, isCleared, isCurrent) : null;
                const _gateHtml = _hellGateInfo ? _hellGateInfo.html : '';
                const _gateExtraClass = _hellGateInfo ? ' stage-gate' : '';

                stageGrid += `<div class="stage-card ${statusClass} ${group.isHell ? 'stage-hell' : ''}${_gateExtraClass}" onclick="${isLocked ? '' : `ChallengeModule.enterStage('${stage.id}')`}" ${isReadonly ? 'title="该课程暂未开放"' : ''}>
                    ${_gateHtml}
                    <div class="stage-number">${i + 1}</div>
                    <div class="stage-icon">${statusIcon}</div>
                    ${isCleared ? `<div class="stage-best">最佳 ${p.bestScore.toFixed(0)}分</div>` : ''}
                    ${isCurrent && !isLocked ? '<div class="stage-hint">可挑战</div>' : ''}
                </div>`;
            });
        });

        container.innerHTML = `
            <div class="stages-page">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0 8px;">
                    <span style="font-size:0.82rem;color:${isHellMode ? '#f87171' : '#60a5fa'};font-weight:700;">
                        ${isHellMode ? '<i class="fas fa-skull-crossbones"></i> 地狱模式' : '<i class="fas fa-shield-halved"></i> 普通模式'}
                    </span>
                    <span style="font-size:0.72rem;color:#64748b;">共 ${stages.length} 关</span>
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


    // 地狱关卡门造型：根据 BIPA 等级返回对应的小门 HTML
    _getHellGateStyle(levelId, isLocked, isCleared, isCurrent) {
        const lv = parseInt(levelId) || 0;
        const gates = [
            { icon: 'fa-door-open',     color: '#a0845c', glow: 'rgba(160,132,92,0.3)',  label: '木门',     border: '#8b7355' },
            { icon: 'fa-archway',       color: '#94a3b8', glow: 'rgba(148,163,184,0.3)', label: '石拱门',   border: '#64748b' },
            { icon: 'fa-dungeon',       color: '#78716c', glow: 'rgba(120,113,108,0.3)', label: '铁门',     border: '#57534e' },
            { icon: 'fa-torii-gate',    color: '#cd7f32', glow: 'rgba(205,127,50,0.4)',  label: '青铜门',   border: '#a0622a' },
            { icon: 'fa-landmark',      color: '#c0c0c0', glow: 'rgba(192,192,192,0.4)', label: '银门',     border: '#a0a0a0' },
            { icon: 'fa-church',        color: '#fbbf24', glow: 'rgba(251,191,36,0.4)',  label: '金门',     border: '#d4a017' },
            { icon: 'fa-gem',           color: '#67e8f9', glow: 'rgba(103,232,249,0.4)', label: '水晶门',   border: '#22d3ee' },
            { icon: 'fa-fire',          color: '#f87171', glow: 'rgba(248,113,113,0.5)', label: '烈焰门',   border: '#dc2626' },
        ];
        const g = gates[Math.min(lv, 7)];
        const dimmed = isLocked ? 'opacity:0.3;filter:grayscale(0.8);' : '';
        const clearedStyle = isCleared ? 'filter:saturate(0.5);' : '';
        const currentPulse = isCurrent ? 'animation:sg-pulse 2s ease-in-out infinite;' : '';
        const html = `<div class="sg-icon" style="${dimmed}${clearedStyle}${currentPulse}" title="${g.label}">
            <i class="fas ${g.icon}" style="color:${g.color};font-size:1.4rem;"></i>
        </div>`;
        return { html, gate: g };
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
        // 检查闯天关是否启用
        if (window._systemInfo && window._systemInfo.challengeEnabled === false) {
            alert('闯天关功能尚未开放');
            return;
        }
        // 检查关卡是否为仅展示（锁定）
        const stage = this.allStages.find(s => s.id === stageId);
        if (!stage) return;
        if (stage._readonly) {
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

        this.challengeState = {
            stageId,
            questions: questions,
            currentIndex: 0,
            correct: 0,
            answers: [],
            startTime: isHell ? Date.now() : null,
            totalQuestions: questions.length,
            phase: isHell ? 'playing' : 'ready', // ready(普通-等开始) / playing(答题中)
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
                            <div class="ch-ready-rule"><i class="fas fa-check"></i> \u53ef\u8fd4\u56de\u68c0\u67e5\u5df2\u7b54\u9898\u76ee</div>
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
            <div class="challenge-play-page">
                <div class="challenge-play-header">
                    <div class="challenge-play-title">\u7b2c${stageIndex}\u5173</div>
                    <div class="challenge-timer"><i class="fas fa-clock"></i> ${mm}:${ss}</div>
                </div>

                <div class="challenge-progress-bar">
                    <div class="challenge-progress-fill" style="width:${progressPct}%"></div>
                </div>
                <div class="challenge-progress-text">${current} / ${total}</div>

                ${navBarHtml}

                <div class="challenge-question-area" id="challenge-question">
                    ${questionContent}
                </div>

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
                body: JSON.stringify({ stageId, accuracy, timeSpent, score, stars }),
            });
        } catch (e) {
            console.warn('Failed to submit score:', e);
        }
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

    _shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    },
};