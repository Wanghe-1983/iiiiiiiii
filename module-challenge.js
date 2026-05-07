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
            ? sysInfo.levelConfigVisitor || sysInfo.challengeLevelConfigVisitor
            : sysInfo.levelConfigUser || sysInfo.challengeLevelConfigUser;
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
        const sysInfo = window._systemInfo || {};
        const normalProgress = this._calcModeProgress('normal');
        const hellProgress = this._calcModeProgress('hell');
        return `
        <div style="padding:12px;display:flex;flex-direction:column;gap:16px;">
            <div onclick="ChallengeModule.enterChallenge()" style="cursor:pointer;background:linear-gradient(135deg,rgba(99,102,241,0.12),rgba(139,92,246,0.08));border:1px solid rgba(99,102,241,0.25);border-radius:16px;padding:24px;transition:all 0.2s;" onmouseover="this.style.borderColor='rgba(99,102,241,0.5)';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='rgba(99,102,241,0.25)';this.style.transform='none'">
                <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
                    <div style="width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;">
                        <i class="fas fa-gamepad" style="font-size:1.4rem;color:#fff;"></i>
                    </div>
                    <div>
                        <div style="font-size:1.1rem;font-weight:700;color:#e2e8f0;">闯天关</div>
                        <div style="font-size:0.78rem;color:#94a3b8;margin-top:2px;">${hellEnabled ? '普通 / 地狱两种难度模式' : '普通模式'}</div>
                    </div>
                    <i class="fas fa-chevron-right" style="margin-left:auto;color:#64748b;font-size:1rem;"></i>
                </div>
                <div style="display:flex;gap:12px;">
                    <div style="flex:1;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.2);border-radius:10px;padding:10px 12px;">
                        <div style="font-size:0.7rem;color:#60a5fa;font-weight:600;margin-bottom:4px;"><i class="fas fa-shield-halved"></i> 普通</div>
                        <div style="font-size:0.82rem;color:#e2e8f0;font-weight:700;">${normalProgress.cleared}<span style="font-size:0.7rem;color:#64748b;font-weight:400;">/${normalProgress.total}</span></div>
                        <div style="font-size:0.65rem;color:#64748b;">${normalProgress.stars} <i class="fas fa-star" style="color:#fbbf24;font-size:0.55rem;"></i></div>
                    </div>
                    ${hellEnabled ? `<div style="flex:1;background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.2);border-radius:10px;padding:10px 12px;">
                        <div style="font-size:0.7rem;color:#f87171;font-weight:600;margin-bottom:4px;"><i class="fas fa-skull-crossbones"></i> 地狱</div>
                        <div style="font-size:0.82rem;color:#e2e8f0;font-weight:700;">${hellProgress.cleared}<span style="font-size:0.7rem;color:#64748b;font-weight:400;">/${hellProgress.total}</span></div>
                        <div style="font-size:0.65rem;color:#64748b;">${hellProgress.stars} <i class="fas fa-star" style="color:#fbbf24;font-size:0.55rem;"></i></div>
                    </div>` : ''}
                </div>
            </div>
            <div onclick="ChallengeModule.enterRank()" style="cursor:pointer;background:linear-gradient(135deg,rgba(251,191,36,0.1),rgba(245,158,11,0.06));border:1px solid rgba(251,191,36,0.2);border-radius:16px;padding:24px;transition:all 0.2s;" onmouseover="this.style.borderColor='rgba(251,191,36,0.4)';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='rgba(251,191,36,0.2)';this.style.transform='none'">
                <div style="display:flex;align-items:center;gap:14px;">
                    <div style="width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#f59e0b,#d97706);display:flex;align-items:center;justify-content:center;">
                        <i class="fas fa-trophy" style="font-size:1.4rem;color:#fff;"></i>
                    </div>
                    <div>
                        <div style="font-size:1.1rem;font-weight:700;color:#e2e8f0;">排行榜</div>
                        <div style="font-size:0.78rem;color:#94a3b8;margin-top:2px;">查看各模式下的闯关排名</div>
                    </div>
                    <i class="fas fa-chevron-right" style="margin-left:auto;color:#64748b;font-size:1rem;"></i>
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
        const isAdmin = window._userInfo && (window._userInfo.role === 'admin');
        const isVisitor = window._userInfo && (window._userInfo.userType === 'visitor');
        if (isAdmin) return sysInfo.studyLevelConfigUser || sysInfo.challengeLevelConfigUser || {};
        if (isVisitor) return sysInfo.studyLevelConfigVisitor || sysInfo.challengeLevelConfigVisitor || {};
        return sysInfo.studyLevelConfigUser || sysInfo.challengeLevelConfigUser || {};
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

                stageGrid += `<div class="stage-card ${statusClass} ${group.isHell ? 'stage-hell' : ''}" onclick="${isLocked ? '' : `ChallengeModule.enterStage('${stage.id}')`}" ${isReadonly ? 'title="该课程暂未开放"' : ''}>
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

        // 从关卡所属的unit数据中收集题目池
        const levelData = CourseContent.getLevel(stage.levelId);
        // 题目收集：优先使用 stage 预切分的 questions（自动分配模式下内容已混合切好）
        // 如果 stage 有 questions 且管理员设置了混合类型，直接使用 stage 预切分内容
        let questions;
        if (stage.questions && stage.questions.length > 0 && (questionType === 'mixed' || questionType === stage.type)) {
            // 使用预切分内容，按 questionCount 洗牌后截取
            const shuffled = this._shuffle(stage.questions.slice());
            questions = shuffled.slice(0, questionCount);
        } else {
            // 从 unit 全量重新抽样（手动分配模式下 questionType 可能与 stage.type 不同）
            questions = this._sampleQuestions(levelData, stage.unitId, questionType, questionCount);
        }

        // 按题型权重扩展题目池：同一内容可生成多种题型
        questions = this._expandQuestionsByType(questions, modeSettings, isHell);
        if (questions.length === 0) questions = this._expandQuestionsByType(this._shuffle(stage.questions.slice()), { choiceWeight: 10, fillWeight: 0, listeningWeight: 0 }, isHell);
        // 洗牌
        questions = this._shuffle(questions);

        this.challengeState = {
            stageId,
            questions: questions,
            currentIndex: 0,
            correct: 0,
            answers: [],
            startTime: Date.now(),
            totalQuestions: questions.length,
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
        
        const expanded = [];
        for (const item of contents) {
            // 选择题
            if (cw > 0) {
                expanded.push({ ...item, _qType: 'choice', _weight: cw });
            }
            // 填空题
            if (fw > 0) {
                expanded.push({ ...item, _qType: 'fill', _fillMode: typeConfig.fillMode || 'input', _weight: fw });
            }
            // 听力题
            if (lw > 0) {
                expanded.push({ ...item, _qType: 'listening', _listenSpeed: typeConfig.listeningSpeed || '1.0', _listenReplays: typeConfig.listeningReplays || 2, _weight: lw });
            }
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
        const answerBox = document.getElementById('fill-answer-box');
        const inputEl = document.getElementById('fill-input-answer');
        const q = this.challengeState.questions[this.challengeState.currentIndex];
        const isDialogue = q.lines !== undefined;
        const correctAnswer = (isDialogue ? (q.title || '') : (q.indonesian || '')).toLowerCase();
        let userAnswer = '';

        if (answerBox) {
            // 拼选模式
            const chips = answerBox.querySelectorAll('.fill-chip');
            userAnswer = Array.from(chips).map(c => c.textContent.toLowerCase()).join('');
        } else if (inputEl) {
            // 输入模式
            userAnswer = inputEl.value.trim().toLowerCase();
        }

        const isCorrect = userAnswer === correctAnswer;
        this.challengeState.answers.push({ correct: isCorrect, question: q, userAnswer, correctAnswer });

        // 显示反馈
        const container = document.getElementById('challenge-question');
        if (container) {
            const feedback = document.createElement('div');
            feedback.style.cssText = `margin:16px 0;padding:14px 18px;border-radius:12px;text-align:center;font-weight:600;font-size:0.95rem;`;
            if (isCorrect) {
                feedback.style.background = 'rgba(16,185,129,0.15)';
                feedback.style.color = '#10b981';
                feedback.style.border = '1px solid rgba(16,185,129,0.3)';
                feedback.innerHTML = '<i class="fas fa-check-circle" style="margin-right:6px;"></i>回答正确！';
            } else {
                feedback.style.background = 'rgba(239,68,68,0.15)';
                feedback.style.color = '#f87171';
                feedback.style.border = '1px solid rgba(239,68,68,0.3)';
                feedback.innerHTML = `<i class="fas fa-times-circle" style="margin-right:6px;"></i>回答错误！正确答案：<span style="color:#e2e8f0;">${isDialogue ? q.title : q.indonesian}</span>`;
            }
            // 禁用所有交互按钮
            const area = document.getElementById('challenge-question');
            if (area) {
                area.querySelectorAll('button, input').forEach(el => { el.disabled = true; el.style.pointerEvents = 'none'; el.style.opacity = '0.5'; });
            }
            container.appendChild(feedback);
        }

        // 更新分数
        if (isCorrect) this.challengeState.correct++;
        // 自动跳转下一题
        setTimeout(() => {
            this.challengeState.currentIndex++;
            this.render();
        }, 1200);
    },

    // ========== 听力题交互 ==========
    playListening(text, speed, replays) {
        const decodedText = decodeURIComponent(text);
        if (!decodedText) return;
        // 取消之前的语音
        if (window._listenUtterance) speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(decodedText);
        utt.lang = 'id-ID';
        utt.rate = parseFloat(speed) || 1.0;
        utt.pitch = 1.0;
        window._listenUtterance = utt;
        let count = 0;
        const totalReplays = parseInt(replays) || 2;
        utt.onend = function() {
            count++;
            if (count < totalReplays) {
                setTimeout(() => speechSynthesis.speak(utt), 300);
            }
        };
        speechSynthesis.speak(utt);
        // 更新按钮状态
        const btn = document.getElementById('listen-play-btn');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            setTimeout(() => { if (btn) btn.innerHTML = '<i class="fas fa-volume-up"></i>'; }, totalReplays * 3000);
        }
    },



    _renderPlayArea(container) {
        const state = this.challengeState;
        if (!state) { this.currentStageId = null; this.renderStages(container); return; }

        if (state.currentIndex >= state.totalQuestions) {
            this._renderStageResult(container);
            return;
        }

        const q = state.questions[state.currentIndex];
        const qType = q._qType || 'choice';
        const currentStage = this.allStages.find(s => s.id === state.stageId);
        const stageType = currentStage ? currentStage.type : 'words';
        const _isHellStage = this.challengeMode === 'hell';
        const total = state.totalQuestions;
        const current = state.currentIndex + 1;
        const progressPct = Math.round(current / total * 100);
        const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
        const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const ss = String(elapsed % 60).padStart(2, '0');

        const isDialogue = q.lines !== undefined;
        const correctAnswer = isDialogue ? (q.title || '') : (q.chinese || '');
        const indoText = isDialogue ? (q.title_id || '') : (q.indonesian || '');

        // 题型标签
        const qTypeLabel = qType === 'choice' ? '选择题' : qType === 'fill' ? '填空题' : '听力题';
        const qTypeColor = qType === 'choice' ? '#60a5fa' : qType === 'fill' ? '#f59e0b' : '#10b981';
        const qTypeIcon = qType === 'choice' ? 'fa-check-circle' : qType === 'fill' ? 'fa-keyboard' : 'fa-headphones';

        // 构建选项池（选择和听力题需要）
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
            // ===== 选择题：显示印尼语，选中文 =====
            if (isDialogue) {
                questionContent = `
                    <div class="challenge-q-type"><i class="fas ${qTypeIcon}" style="color:${qTypeColor};margin-right:4px;"></i>${qTypeLabel}</div>
                    <div class="challenge-q-title">${q.title || ''}</div>
                    <div style="display:flex;align-items:center;gap:10px;">
                        ${q.title_id ? `<button class="circle-btn play-btn ch-speak-btn" onclick="ChallengeModule.challengeToggleSpeak('${encodeURIComponent(q.title_id)}')" style="flex-shrink:0;width:42px;height:42px;font-size:1rem;"><i class="fas fa-play ch-play-ico"></i></button>` : ''}
                        <div class="challenge-q-indo ch-speak-btn" ${q.title_id ? `onclick="ChallengeModule.challengeToggleSpeak('${encodeURIComponent(q.title_id)}')" style="cursor:pointer;"` : ''} style="flex:1;">${q.title_id || ''}</div>
                    </div>
                    <div class="challenge-q-prompt">这个对话的主题是什么？</div>
                `;
            } else {
                questionContent = `
                    <div class="challenge-q-type"><i class="fas ${qTypeIcon}" style="color:${qTypeColor};margin-right:4px;"></i>${qTypeLabel}</div>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <button class="circle-btn play-btn ch-speak-btn" onclick="ChallengeModule.challengeToggleSpeak('${encodeURIComponent(q.indonesian)}')" style="flex-shrink:0;width:42px;height:42px;font-size:1rem;"><i class="fas fa-play ch-play-ico"></i></button>
                        <div class="challenge-q-indo ch-speak-btn" onclick="ChallengeModule.challengeToggleSpeak('${encodeURIComponent(q.indonesian)}')" style="cursor:pointer;flex:1;">${q.indonesian}</div>
                    </div>
                    <div class="challenge-q-prompt">请选择正确的中文释义：</div>
                `;
            }
            questionContent += `<div class="challenge-options">${options.map((opt, i) => `
                <button class="challenge-option" onclick="ChallengeModule.answerQuestion(this, '${encodeURIComponent(opt)}', '${encodeURIComponent(correctAnswer)}')">
                    <span class="challenge-option-letter">${'ABCD'[i]}</span>
                    <span class="challenge-option-text">${opt}</span>
                </button>`).join('')}</div>`;

        } else if (qType === 'fill') {
            // ===== 填空题：显示中文，输入印尼语 =====
            const fillMode = q._fillMode || 'input';
            if (fillMode === 'select') {
                // 选项拼选模式：打散正确答案的字母 + 加入干扰字母
                const correctWord = (isDialogue ? (q.title || '') : (q.indonesian || '')).toLowerCase();
                const letters = correctWord.split('');
                // 加入干扰字母
                const extraLetters = 'abcdefghijklmnopqrstuvwxyz'.split('').filter(l => !letters.includes(l));
                const shuffledExtra = this._shuffle(extraLetters).slice(0, Math.max(4, 12 - letters.length));
                const allLetters = this._shuffle([...letters, ...shuffledExtra]);
                questionContent = `
                    <div class="challenge-q-type"><i class="fas ${qTypeIcon}" style="color:${qTypeColor};margin-right:4px;"></i>${qTypeLabel}（拼选）</div>
                    <div style="font-size:1.15rem;color:#e2e8f0;font-weight:600;text-align:center;margin:12px 0;">${correctAnswer}</div>
                    <div class="challenge-q-prompt">请从下方字母中拼选出正确的印尼语：</div>
                    <div id="fill-answer-box" style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center;min-height:48px;padding:10px;border:2px dashed rgba(255,255,255,0.15);border-radius:10px;margin:12px 0;background:rgba(15,23,42,0.4);" data-answer="${encodeURIComponent(correctWord)}"></div>
                    <div id="fill-letter-pool" style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:8px;">
                        ${allLetters.map(l => `<button class="fill-letter-btn" onclick="ChallengeModule.pickFillLetter(this, '${l}')" style="width:40px;height:40px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(15,23,42,0.8);color:#e2e8f0;font-size:1rem;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s;">${l}</button>`).join('')}
                    </div>
                    <button class="challenge-option" onclick="ChallengeModule.submitFillAnswer()" style="margin-top:16px;width:100%;padding:12px;text-align:center;border-radius:12px;background:rgba(251,191,36,0.2);color:#fbbf24;border:1px solid rgba(251,191,36,0.4);font-weight:600;font-size:0.95rem;cursor:pointer;">
                        <i class="fas fa-paper-plane" style="margin-right:6px;"></i>确认提交
                    </button>
                `;
            } else {
                // 键盘输入模式
                questionContent = `
                    <div class="challenge-q-type"><i class="fas ${qTypeIcon}" style="color:${qTypeColor};margin-right:4px;"></i>${qTypeLabel}（输入）</div>
                    <div style="font-size:1.15rem;color:#e2e8f0;font-weight:600;text-align:center;margin:12px 0;">${correctAnswer}</div>
                    <div class="challenge-q-prompt">请输入对应的印尼语：</div>
                    <input type="text" id="fill-input-answer" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="输入印尼语..."
                        style="width:100%;padding:14px 18px;background:rgba(15,23,42,0.8);color:#e2e8f0;border:2px solid rgba(255,255,255,0.15);border-radius:12px;font-size:1.1rem;text-align:center;outline:none;margin:12px 0;font-family:inherit;"
                        onkeydown="if(event.key==='Enter')ChallengeModule.submitFillAnswer()">
                    <button class="challenge-option" onclick="ChallengeModule.submitFillAnswer()" style="width:100%;padding:12px;text-align:center;border-radius:12px;background:rgba(251,191,36,0.2);color:#fbbf24;border:1px solid rgba(251,191,36,0.4);font-weight:600;font-size:0.95rem;cursor:pointer;">
                        <i class="fas fa-paper-plane" style="margin-right:6px;"></i>确认提交
                    </button>
                `;
            }

        } else if (qType === 'listening') {
            // ===== 听力题：只播放音频，选中文 =====
            const listenSpeed = q._listenSpeed || '1.0';
            const listenReplays = q._listenReplays || 2;
            questionContent = `
                <div class="challenge-q-type"><i class="fas ${qTypeIcon}" style="color:${qTypeColor};margin-right:4px;"></i>${qTypeLabel}</div>
                <div style="text-align:center;padding:20px 0;">
                    <button class="circle-btn play-btn" id="listen-play-btn" onclick="ChallengeModule.playListening('${encodeURIComponent(indoText)}', ${listenSpeed}, ${listenReplays})" style="width:72px;height:72px;font-size:1.6rem;margin:0 auto;display:flex;align-items:center;justify-content:center;border-radius:50%;"><i class="fas fa-volume-up"></i></button>
                    <div style="font-size:0.8rem;color:#64748b;margin-top:10px;">点击播放音频（自动播放 ${listenReplays} 次）</div>
                </div>
                <div class="challenge-q-prompt">听发音，选择正确的中文释义：</div>
            `;
            questionContent += `<div class="challenge-options">${options.map((opt, i) => `
                <button class="challenge-option" onclick="ChallengeModule.answerQuestion(this, '${encodeURIComponent(opt)}', '${encodeURIComponent(correctAnswer)}')">
                    <span class="challenge-option-letter">${'ABCD'[i]}</span>
                    <span class="challenge-option-text">${opt}</span>
                </button>`).join('')}</div>`;
        }

        container.innerHTML = `
            <div class="challenge-play-page">
                <div class="challenge-play-header">
                    
                    <div class="challenge-play-title">第${this.allStages.findIndex(s => s.id === state.stageId) + 1}关</div>
                    <div class="challenge-timer"><i class="fas fa-clock"></i> ${mm}:${ss}</div>
                    
                </div>

                <div class="challenge-progress-bar">
                    <div class="challenge-progress-fill" style="width:${progressPct}%"></div>
                </div>
                <div class="challenge-progress-text">${current} / ${total}</div>

                <div class="challenge-question-area" id="challenge-question">
                    ${questionContent}
                    <div class="challenge-options">
                        ${options.map((opt, i) => `
                            <button class="challenge-option" onclick="ChallengeModule.answerQuestion(this, '${encodeURIComponent(opt)}', '${encodeURIComponent(correctAnswer)}')">
                                <span class="challenge-option-letter">${'ABCD'[i]}</span>
                                <span class="challenge-option-text">${opt}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
                ${_isHellStage ? '' : `<div style="margin:16px 0;padding:16px 20px;border-radius:14px;border:1px dashed var(--border-subtle);background:var(--accent-subtle);display:flex;align-items:center;gap:16px;">
                    <div class="sliders-col" style="flex:1;min-width:0;">
                        <div class="vslider-box">
                            <div class="vslider-label"><i class="fas fa-gauge-high"></i> 语速</div>`}
                            <div class="vslider-track-wrap">
                                <input type="range" class="vslider vslider-rate" id="ch-rate-slider" min="1" max="15" value="${localStorage.getItem('fmi_rate') ? (RATE_LEVELS || []).indexOf(parseFloat(localStorage.getItem('fmi_rate'))) + 1 || 10 : 10}" step="1"
                                    oninput="ChallengeModule.setRate(this.value)" title="拖动调整语速">
                                <div class="vslider-fill" id="ch-rate-fill"></div>
                                <div class="vslider-thumb" id="ch-rate-thumb"><span id="ch-val-rate">${localStorage.getItem('fmi_rate') || '1.0'}x</span></div>
                            </div>
                            <div class="vslider-range"><span>0.1x</span><span>1.5x</span></div>
                        </div>
                        <div class="vslider-box">
                            <div class="vslider-label"><i class="fas fa-redo"></i> 循环</div>
                            <div class="vslider-track-wrap">
                                <input type="range" class="vslider vslider-loop" id="ch-loop-slider" min="0" max="14" value="${(LOOP_LEVELS || []).indexOf(parseInt(localStorage.getItem('fmi_loop') || '1')) >= 0 ? (LOOP_LEVELS || []).indexOf(parseInt(localStorage.getItem('fmi_loop') || '1')) : 0}" step="1"
                                    oninput="ChallengeModule.setLoop(this.value)" title="拖动调整循环次数">
                                <div class="vslider-fill" id="ch-loop-fill"></div>
                                <div class="vslider-thumb" id="ch-loop-thumb"><span id="ch-val-loop">${localStorage.getItem('fmi_loop') || '1'}次</span></div>
                            </div>
                            <div class="vslider-range"><span>1次</span><span>无限</span></div>
                        </div>
                ${_isHellStage ? '' : '</div></div>'}
                <div style="margin-top:16px;display:flex;align-items:center;justify-content:flex-end;gap:10px;">
                    <button style="background:rgba(148,163,184,0.1);color:#94a3b8;border:1px solid rgba(148,163,184,0.2);padding:8px 16px;border-radius:10px;cursor:pointer;font-size:0.78rem;display:flex;align-items:center;gap:5px;" onclick="ChallengeModule.confirmExitWithoutSave()">
                        <i class="fas fa-sign-out-alt"></i> 退出
                    </button>
                    <button style="background:rgba(251,191,36,0.2);color:#fbbf24;border:1px solid rgba(251,191,36,0.4);padding:12px 28px;border-radius:12px;cursor:pointer;font-size:0.95rem;font-weight:600;display:flex;align-items:center;gap:8px;box-shadow:0 0 20px rgba(251,191,36,0.15);" onclick="ChallengeModule.confirmFinish()">
                        <i class="fas fa-file-alt"></i> 交卷
                    </button>
                </div>
            </div>
        `;

        // 同步滑块位置和填充条（地狱模式下跳过，因滑块已隐藏）
        setTimeout(() => {
            if (!_isHellStage && typeof updateSliderFill === 'function') {
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

        // 更新计时器（支持时间限制倒计时）
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
            const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
            if (timeLimit > 0) {
                const remaining = Math.max(0, timeLimit - elapsed);
                const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
                const ss = String(remaining % 60).padStart(2, '0');
                const isWarning = remaining <= 10;
                el.innerHTML = `<i class="fas fa-clock" style="color:${isWarning ? '#f87171' : ''}"></i> <span style="color:${isWarning ? '#f87171' : ''}">${mm}:${ss}</span>`;
                if (remaining <= 0) {
                    clearInterval(this._timerInterval);
                    this.confirmFinish();
                }
            } else {
                const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
                const ss = String(elapsed % 60).padStart(2, '0');
                el.innerHTML = `<i class="fas fa-clock"></i> ${mm}:${ss}`;
            }
        }, 1000);
    },

    answerQuestion(btnEl, selectedEnc, correctEnc) {
        const state = this.challengeState;
        if (!state || state.answers[state.currentIndex]) return; // 已答过

        const selected = decodeURIComponent(selectedEnc);
        const correct = decodeURIComponent(correctEnc);
        const isCorrect = selected === correct;

        if (isCorrect) state.correct++;
        state.answers[state.currentIndex] = { selected, correct, isCorrect };

        // 高亮
        const allBtns = btnEl.parentElement.querySelectorAll('.challenge-option');
        allBtns.forEach(btn => {
            const text = btn.querySelector('.challenge-option-text').textContent;
            btn.style.pointerEvents = 'none';
            if (text === correct) btn.classList.add('correct');
            else if (btn === btnEl && !isCorrect) btn.classList.add('wrong');
        });

        setTimeout(() => {
            state.currentIndex++;
            if (state.currentIndex >= state.totalQuestions) {
                clearInterval(this._timerInterval);
            }
            const subContent = document.getElementById('challenge-sub-content');
            if (subContent) this._renderPlayArea(subContent);
        }, 1000);
    },

    // ========== 闯关结果 ==========
    _renderStageResult(container) {
        const state = this.challengeState;
        const timeSpent = Math.floor((Date.now() - state.startTime) / 1000);
        const accuracy = state.correct / state.totalQuestions * 100;

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
                <div class="challenge-result-title">${stars >= 1 ? '闯关成功！' : '挑战失败'}</div>
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
        const answered = state.answers ? state.answers.filter(a => a).length : 0;
        if (answered === 0) {
            alert('您还没有答题，请先答题后再结束。');
            return;
        }
        if (confirm('确定结束闯关并提交成绩吗？（已答 ' + answered + ' 题）')) {
            // 将未答的题目视为错误
            for (let i = 0; i < state.totalQuestions; i++) {
                if (!state.answers[i]) {
                    const q = state.questions[i];
                    const correct = q.chinese || q.title_id || '';
                    state.answers[i] = { selected: '', correct: correct, isCorrect: false };
                }
            }
            state.currentIndex = state.totalQuestions;
            if (this._timerInterval) clearInterval(this._timerInterval);
            const subContent = document.getElementById('challenge-sub-content');
            if (subContent) this._renderStageResult(subContent);
            this._inChallenge = false;
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