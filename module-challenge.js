/**
 * module-challenge.js
 * 闯天关模块 - 包含关卡地图、答题界面、排行榜
 * 子Tab: 闯关(Challenge) / 排行榜(Rank)
 */

const ChallengeModule = {
    currentSubTab: 'stages', // stages | rank
    allStages: [],
    serverProgress: {}, // 从D1加载
    currentStageId: null,
    challengeState: null, // 当前答题状态

    // 计分配置
    ACCURACY_WEIGHT: 0.9,
    TIME_WEIGHT: 0.1,
    TIME_MULTIPLIER: 5,

    // ========== 初始化 ==========
    async init(container) {
        this.container = container;
        const data = await CourseContent.load();
        if (!data) {
            container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#f87171;">数据加载失败</div>';
            return;
        }
        this.allStages = CourseContent.getAllStages();
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
        this.container.innerHTML = `
            <div class="challenge-module">
                <div class="challenge-sub-tabs">
                    <button class="sub-tab ${this.currentSubTab === 'stages' ? 'active' : ''}" onclick="ChallengeModule.switchSubTab('stages')">
                        <i class="fas fa-gamepad"></i> 闯关
                    </button>
                    <button class="sub-tab ${this.currentSubTab === 'rank' ? 'active' : ''}" onclick="ChallengeModule.switchSubTab('rank')">
                        <i class="fas fa-trophy"></i> 排行榜
                    </button>
                </div>
                <div id="challenge-sub-content"></div>
            </div>
        `;
        const subContent = document.getElementById('challenge-sub-content');
        if (this.currentSubTab === 'stages') this.renderStages(subContent);
        else this.renderRank(subContent);
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

        const stages = this.allStages;
        if (stages.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">暂无关卡</div>';
            return;
        }

        // 计算解锁状态
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

        // 按关卡所属等级分组，并标记地狱模式
        const HELL_LEVELS = (window._systemInfo && window._systemInfo.hellLevels) || [];
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
                currentGroup = { levelId: lid, levelName: levelNames[lid] || ('Level ' + lid), isHell: HELL_LEVELS.includes(Number(lid)), stages: [] };
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
                // 地狱模式关卡：未解锁且后端未开放地狱权限时锁定
                const isHellLocked = group.isHell && i > nextAvailable;
                const isLocked = isHellLocked;
                const stars = p?.stars || 0;

                let statusClass = isLocked ? 'locked' : isCleared ? 'cleared' : isCurrent ? 'current' : 'available';
                let statusIcon = isLocked ? '<i class="fas fa-lock"></i>'
                    : isCleared ? this._renderStars(stars)
                    : isCurrent ? '<i class="fas fa-play-circle"></i>'
                    : '';

                stageGrid += `<div class="stage-card ${statusClass} ${group.isHell ? 'stage-hell' : ''}" onclick="${isLocked ? '' : `ChallengeModule.enterStage('${stage.id}')`}">
                    <div class="stage-number">${i + 1}</div>
                    <div class="stage-icon">${statusIcon}</div>
                    <div class="stage-name">${stage.name}</div>
                    <div class="stage-type">${stage.type === 'words' ? '单词' : stage.type === 'sentences' ? '短句' : '对话'}</div>
                    ${isCleared ? `<div class="stage-best">最佳 ${p.bestScore.toFixed(0)}分</div>` : ''}
                    ${isCurrent ? '<div class="stage-hint">可挑战</div>' : ''}
                </div>`;
            });
        });

        container.innerHTML = `
            <div class="stages-page">
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
        this.currentStageId = stageId;
        const stage = this.allStages.find(s => s.id === stageId);
        if (!stage) return;

        this.challengeState = {
            stageId,
            questions: stage.questions,
            currentIndex: 0,
            correct: 0,
            answers: [],
            startTime: Date.now(),
            totalQuestions: stage.totalQuestions,
        };

        this._inChallenge = true;
        this._beforeUnloadHandler = function(e) {
            e.preventDefault();
            e.returnValue = '闯关进行中，确定要离开吗？成绩将不会保存。';
            return e.returnValue;
        };
        window.addEventListener('beforeunload', this._beforeUnloadHandler);

        this.render();
    },

    _renderPlayArea(container) {
        const state = this.challengeState;
        if (!state) { this.currentStageId = null; this.renderStages(container); return; }

        if (state.currentIndex >= state.totalQuestions) {
            this._renderStageResult(container);
            return;
        }

        const q = state.questions[state.currentIndex];
        const total = state.totalQuestions;
        const current = state.currentIndex + 1;
        const progressPct = Math.round(current / total * 100);
        const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
        const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const ss = String(elapsed % 60).padStart(2, '0');

        const isDialogue = q.lines !== undefined;
        const allOptions = state.questions.map(item => item.chinese || (item.lines ? item.title : '')).filter(Boolean);
        const correctAnswer = q.chinese || q.title_id || '';

        // 生成选项
        const wrongOptions = allOptions.filter(o => o !== correctAnswer);
        const shuffledWrong = this._shuffle(wrongOptions).slice(0, 3);
        const options = this._shuffle([correctAnswer, ...shuffledWrong]);

        let questionContent = '';
        if (isDialogue) {
            // 对话题：显示对话标题
            questionContent = `
                <div class="challenge-q-type">对话题</div>
                <div class="challenge-q-title">${q.title || ''}</div>
                <div class="challenge-q-indo" ${q.title_id ? `onclick="speak('${encodeURIComponent(q.title_id)}')" style="cursor:pointer;"` : ''}>${q.title_id || ''} ${q.title_id ? '<i class="fas fa-volume-up" style="margin-left:8px;color:var(--accent);"></i>' : ''}</div>
                <div class="challenge-q-prompt">这个对话的主题是什么？</div>
            `;
        } else {
            questionContent = `
                <div class="challenge-q-type">${q.type === 'words' ? '单词' : '短句'}</div>
                <div class="challenge-q-indo" onclick="speak('${encodeURIComponent(q.indonesian)}')">
                    ${q.indonesian}
                    <i class="fas fa-volume-up" style="margin-left:8px;color:var(--accent);"></i>
                </div>
                <div class="challenge-q-prompt">请选择正确的中文释义：</div>
            `;
        }

        container.innerHTML = `
            <div class="challenge-play-page">
                <div class="challenge-play-header">
                    <button class="back-btn" onclick="ChallengeModule.confirmExit()">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <div class="challenge-play-title">第${this.allStages.findIndex(s => s.id === state.stageId) + 1}关</div>
                    <div class="challenge-timer"><i class="fas fa-clock"></i> ${mm}:${ss}</div>
                    <button style="background:rgba(248,113,113,0.15);color:#f87171;border:1px solid rgba(248,113,113,0.3);padding:6px 14px;border-radius:8px;cursor:pointer;font-size:0.8rem;display:flex;align-items:center;gap:6px;" onclick="ChallengeModule.confirmFinish()">
                        <i class="fas fa-flag-checkered"></i> 结束闯关
                    </button>
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
                <div class="challenge-controls">
                    <div class="vslider-box">
                        <div class="vslider-label"><i class="fas fa-gauge-high"></i> 语速</div>
                        <div class="vslider-track-wrap">
                            <input type="range" class="vslider vslider-rate" id="ch-rate-slider" min="1" max="15" value="10" step="1"
                                oninput="ChallengeModule.setRate(this.value)" title="拖动调整语速">
                            <div class="vslider-fill" id="ch-rate-fill"></div>
                            <div class="vslider-thumb" id="ch-rate-thumb"><span id="ch-val-rate">1.0x</span></div>
                        </div>
                        <div class="vslider-range"><span>0.1x</span><span>1.5x</span></div>
                    </div>
                    <div class="vslider-box">
                        <div class="vslider-label"><i class="fas fa-redo"></i> 重复</div>
                        <div class="vslider-track-wrap">
                            <input type="range" class="vslider vslider-loop" id="ch-loop-slider" min="0" max="5" value="0" step="1"
                                oninput="ChallengeModule.setLoop(this.value)" title="拖动调整重复次数">
                            <div class="vslider-fill" id="ch-loop-fill"></div>
                            <div class="vslider-thumb" id="ch-loop-thumb"><span id="ch-val-loop">1次</span></div>
                        </div>
                        <div class="vslider-range"><span>1次</span><span>5次</span></div>
                    </div>
                </div>
            </div>
        `;

        // 更新计时器
        this._timerInterval = setInterval(() => {
            const el = document.querySelector('.challenge-timer');
            if (!el) { clearInterval(this._timerInterval); return; }
            const e = Math.floor((Date.now() - state.startTime) / 1000);
            el.innerHTML = `<i class="fas fa-clock"></i> ${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`;
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

        // 星级
        let stars = 0;
        if (score >= 90) stars = 3;
        else if (score >= 70) stars = 2;
        else if (score >= 50) stars = 1;

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
                const loginUser = JSON.parse(localStorage.getItem('fmi_user') || '{}');
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
                const loginUser = JSON.parse(localStorage.getItem('fmi_user') || '{}');
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
        const rate = val / 10;
        localStorage.setItem('fmi_rate', rate.toFixed(1));
        const thumb = document.getElementById('ch-val-rate');
        if (thumb) thumb.textContent = rate.toFixed(1) + 'x';
        // 同步更新主页面滑块
        const mainSlider = document.getElementById('rate-slider');
        const mainThumb = document.getElementById('val-rate');
        if (mainSlider) mainSlider.value = val;
        if (mainThumb) mainThumb.textContent = rate.toFixed(1) + 'x';
    },

    setLoop(val) {
        const count = parseInt(val);
        localStorage.setItem('fmi_loop', count);
        const thumb = document.getElementById('ch-val-loop');
        if (thumb) thumb.textContent = count === 0 ? '1次' : (count + '次');
        // 同步更新主页面滑块
        const mainSlider = document.getElementById('loop-slider');
        const mainThumb = document.getElementById('val-loop');
        if (mainSlider) mainSlider.value = val;
        if (mainThumb) mainThumb.textContent = count === 0 ? '1次' : (count + '次');
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