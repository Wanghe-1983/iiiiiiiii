/**
 * module-study.js
 * 勤学苦练模块 - 包含课程选择、学习页面、练习页面
 * 子Tab: 课程(Course) / 学习(Learn) / 练习(Practice)
 */

const StudyModule = {
    currentSubTab: 'course', // course | learn | practice
    selectedLevelId: '0',
    selectedUnitId: null,
    studyItems: [],   // 当前学习的所有卡片项
    studyIndex: 0,    // 当前卡片索引
    speechRate: 1.0,
    hideChinese: false,
    _studyConfig: null,  // 缓存的勤学苦练配置

    // 获取当前用户的练习配置（用户/访客）
    _getPracticeConfig() {
        if (this._studyConfig) return this._studyConfig;
        const sysInfo = window._systemInfo || {};
        const userInfo = JSON.parse(localStorage.getItem('fmi_user') || '{}');
        const isVisitor = userInfo.role === 'visitor';
        this._studyConfig = isVisitor
            ? (sysInfo.studyPracticeVisitor || {})
            : (sysInfo.studyPracticeUser || {});
        return this._studyConfig;
    },

    // 获取当前用户可见的课程等级
    _getVisibleLevels() {
        const sysInfo = window._systemInfo || {};
        const userInfo = JSON.parse(localStorage.getItem('fmi_user') || '{}');
        const isVisitor = userInfo.role === 'visitor';
        return isVisitor
            ? (sysInfo.studyVisibleLevelsVisitor || [0])
            : (sysInfo.studyVisibleLevelsUser || [0,1,2,3,4,5,6,7]);
    },

    // ========== 初始化 ==========
    async init(container) {
        this.container = container;
        const data = await CourseContent.load();
        if (!data) {
            container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#f87171;">课程数据加载失败，请检查网络连接</div>';
            return;
        }
        // 默认选中第一个可见级别的第一个单元
        const visibleLevels = this._getVisibleLevels();
        const visibleData = data.levels.filter(l => visibleLevels.includes(Number(l.id)));
        if (visibleData.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#f87171;">当前没有可学习的课程</div>';
            return;
        }
        const firstLevel = visibleData[0];
        this.selectedLevelId = String(firstLevel.id);
        if (firstLevel.units && firstLevel.units.length > 0) {
            this.selectedUnitId = firstLevel.units[0].id;
        }
        this.render();
    },

    // ========== 渲染入口 ==========
    render() {
        this.container.innerHTML = `
            <div class="study-module">
                <div class="study-sub-tabs">
                    <button class="sub-tab ${this.currentSubTab === 'course' ? 'active' : ''}" onclick="StudyModule.switchSubTab('course')">
                        <i class="fas fa-book-open"></i> 课程
                    </button>
                    <button class="sub-tab ${this.currentSubTab === 'learn' ? 'active' : ''}" onclick="StudyModule.switchSubTab('learn')">
                        <i class="fas fa-graduation-cap"></i> 学习
                    </button>
                    <button class="sub-tab ${this.currentSubTab === 'practice' ? 'active' : ''}" onclick="StudyModule.switchSubTab('practice')">
                        <i class="fas fa-pen-fancy"></i> 练习
                    </button>
                </div>
                <div id="study-sub-content"></div>
            </div>
        `;
        const subContent = document.getElementById('study-sub-content');
        if (this.currentSubTab === 'course') this.renderCourse(subContent);
        else if (this.currentSubTab === 'learn') this.renderLearn(subContent);
        else this.renderPractice(subContent);
    },

    switchSubTab(tab) {
        this.currentSubTab = tab;
        this.render();
    },

    // ========== 课程选择页 ==========
    renderCourse(container) {
        const allLevels = CourseContent.getLevels();
        const visibleLevels = this._getVisibleLevels();
        const levels = allLevels.filter(l => visibleLevels.includes(Number(l.id)));
        let levelTabs = levels.map(l => {
            const active = String(l.id) === this.selectedLevelId;
            const mastery = CourseContent.getLevelMastery(l.id);
            const avgPct = Math.round((mastery.words.pct + mastery.sentences.pct + mastery.dialogues.pct) / 3);
            return `<button class="level-tab ${active ? 'active' : ''}" onclick="StudyModule.selectLevel('${l.id}')" style="${active ? `background:${l.color || 'var(--accent)'};color:white;` : ''}">
                <span class="level-tab-icon"><i class="fas ${l.icon || 'fa-book'}"></i></span>
                <span class="level-tab-name">${l.name}</span>
                <span class="level-tab-pct">${avgPct}%</span>
            </button>`;
        }).join('');

        const level = CourseContent.getLevel(this.selectedLevelId);
        const mastery = CourseContent.getLevelMastery(this.selectedLevelId);

        let progressBars = `
            <div class="mastery-progress-row">
                <div class="mastery-progress-item">
                    <div class="mastery-label">单词 <span class="mastery-count">${mastery.words.mastered}/${mastery.words.total}</span></div>
                    <div class="mastery-bar"><div class="mastery-fill" style="width:${mastery.words.pct}%;background:linear-gradient(90deg,#10b981,#34d399);"></div></div>
                    <div class="mastery-pct">${mastery.words.pct}%</div>
                </div>
                <div class="mastery-progress-item">
                    <div class="mastery-label">短句 <span class="mastery-count">${mastery.sentences.mastered}/${mastery.sentences.total}</span></div>
                    <div class="mastery-bar"><div class="mastery-fill" style="width:${mastery.sentences.pct}%;background:linear-gradient(90deg,#6366f1,#a78bfa);"></div></div>
                    <div class="mastery-pct">${mastery.sentences.pct}%</div>
                </div>
                <div class="mastery-progress-item">
                    <div class="mastery-label">对话 <span class="mastery-count">${mastery.dialogues.mastered}/${mastery.dialogues.total}</span></div>
                    <div class="mastery-bar"><div class="mastery-fill" style="width:${mastery.dialogues.pct}%;background:linear-gradient(90deg,#f59e0b,#fbbf24);"></div></div>
                    <div class="mastery-pct">${mastery.dialogues.pct}%</div>
                </div>
            </div>
        `;

        let unitList = '';
        if (level && level.units) {
            unitList = level.units.map((unit, idx) => {
                const unitMastery = CourseContent.getUnitMastery(this.selectedLevelId, unit.id);
                const wCount = (unit.words || []).length;
                const sCount = (unit.sentences || []).length;
                const dCount = (unit.dialogues || []).length;
                const allMastered = unitMastery.words && unitMastery.sentences && unitMastery.dialogues;
                const selected = this.selectedUnitId === unit.id;
                const hasContent = wCount > 0 || sCount > 0 || dCount > 0;
                if (!hasContent) return '';

                return `<div class="unit-card ${selected ? 'selected' : ''} ${allMastered ? 'mastered' : ''}" onclick="StudyModule.selectUnit('${unit.id}')">
                    <div class="unit-card-header">
                        <div class="unit-card-number">${String(idx + 1).padStart(2, '0')}</div>
                        <div class="unit-card-info">
                            <div class="unit-card-name">${unit.name}</div>
                            <div class="unit-card-meta">
                                ${wCount > 0 ? `<span class="meta-tag ${unitMastery.words ? 'done' : ''}"><i class="fas ${unitMastery.words ? 'fa-check-circle' : 'fa-circle'}"></i> ${wCount}词</span>` : ''}
                                ${sCount > 0 ? `<span class="meta-tag ${unitMastery.sentences ? 'done' : ''}"><i class="fas ${unitMastery.sentences ? 'fa-check-circle' : 'fa-circle'}"></i> ${sCount}句</span>` : ''}
                                ${dCount > 0 ? `<span class="meta-tag ${unitMastery.dialogues ? 'done' : ''}"><i class="fas ${unitMastery.dialogues ? 'fa-check-circle' : 'fa-circle'}"></i> ${dCount}对话</span>` : ''}
                            </div>
                        </div>
                        <div class="unit-card-arrow"><i class="fas fa-chevron-right"></i></div>
                    </div>
                </div>`;
            }).join('');
        }

        container.innerHTML = `
            <div class="course-page">
                <div class="level-tabs-scroll">${levelTabs}</div>
                ${progressBars}
                <div class="unit-list">${unitList || '<div style="text-align:center;color:var(--text-muted);padding:40px;">暂无课程内容</div>'}</div>
            </div>
        `;
    },

    selectLevel(levelId) {
        this.selectedLevelId = levelId;
        const level = CourseContent.getLevel(levelId);
        if (level && level.units && level.units.length > 0) {
            this.selectedUnitId = level.units[0].id;
        }
        this.renderCourse(document.getElementById('study-sub-content'));
    },

    selectUnit(unitId) {
        this.selectedUnitId = unitId;
        this.currentSubTab = 'learn';
        this.studyIndex = 0;
        this.render();
    },

    // ========== 学习页 ==========
    renderLearn(container) {
        if (!this.selectedUnitId) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">请先在课程页选择要学习的单元</div>';
            return;
        }

        const studyContent = CourseContent.getStudyContent(this.selectedLevelId, this.selectedUnitId);
        if (studyContent.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">该单元没有内容</div>';
            return;
        }

        // 构建学习卡片列表
        this.studyItems = [];
        for (const section of studyContent) {
            const unit = section.unit;
            for (const type of section.types) {
                const items = unit[type === 'dialogues' ? 'dialogues' : (type + 's')] || [];
                for (const item of items) {
                    this.studyItems.push({ ...item, type, unitName: unit.name, unitId: unit.id, isReview: section.isReview });
                }
            }
        }

        // 支持从侧边栏点击跳转到指定type和index
        if (this._pendingType) {
            const targetIdx = this.studyItems.findIndex(it => it.type === this._pendingType);
            if (targetIdx >= 0) {
                this.studyIndex = targetIdx + (this._pendingIndex || 0);
                if (this.studyIndex >= this.studyItems.length) this.studyIndex = this.studyItems.length - 1;
            }
            this._pendingType = null;
            this._pendingIndex = 0;
        } else {
            if (this.studyIndex >= this.studyItems.length) this.studyIndex = 0;
        }

        if (this.studyItems.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">所有内容已掌握，试试练习或闯天关吧！</div>';
            return;
        }

        this._renderLearnCard(container);
    },

    _renderLearnCard(container) {
        const item = this.studyItems[this.studyIndex];
        const total = this.studyItems.length;
        const current = this.studyIndex + 1;
        const isDialogue = item.type === 'dialogues';
        const isSentence = item.type === 'sentences';
        const progressPct = Math.round(current / total * 100);

        let cardContent = '';

        if (isDialogue) {
            const lines = (item.lines || []).map(line => `
                <div class="dialogue-line ${line.speaker === 'A' ? 'speaker-a' : 'speaker-b'}">
                    <div class="dialogue-speaker">${line.speaker}</div>
                    <div class="dialogue-indo" onclick="speak('${encodeURIComponent(line.indonesian)}')">
                        ${line.indonesian}
                        <i class="fas fa-volume-up dialogue-play-icon"></i>
                    </div>
                    <div class="dialogue-zh" style="display:${this.hideChinese ? 'none' : 'block'};">${line.chinese}</div>
                </div>
            `).join('');
            cardContent = `
                <div class="learn-card dialogue-card">
                    <div class="card-type-badge dialogue-badge">对话</div>
                    ${item.title ? `<div class="dialogue-title">${item.title}</div>` : ''}
                    <div class="dialogue-container">${lines}</div>
                </div>
            `;
        } else {
            const typeLabel = isSentence ? '短句' : '单词';
            const typeIcon = isSentence ? 'fa-comment' : 'fa-font';
            cardContent = `
                <div class="learn-card word-card">
                    <div class="card-type-badge ${isSentence ? 'sentence-badge' : 'word-badge'}">
                        <i class="fas ${typeIcon}"></i> ${typeLabel}
                    </div>
                    <div class="card-indo" onclick="speak('${encodeURIComponent(item.indonesian)}')">
                        ${item.indonesian}
                        <i class="fas fa-volume-up card-play-icon"></i>
                    </div>
                    <div class="card-zh" style="display:${this.hideChinese ? 'none' : 'block'};">
                        ${item.chinese}
                    </div>
                </div>
            `;
        }

        const reviewBadge = item.isReview ? '<span class="review-badge">复习</span>' : '';

        container.innerHTML = `
            <div class="learn-page">
                <div class="learn-header">
                    <div class="learn-unit-info">
                        <button class="back-btn" onclick="StudyModule.currentSubTab='course';StudyModule.render();">
                            <i class="fas fa-arrow-left"></i>
                        </button>
                        <div class="learn-unit-name">${item.unitName}</div>
                        ${reviewBadge}
                    </div>
                    <div class="learn-controls">
                        <button class="hide-toggle-btn" onclick="StudyModule.toggleHide()" title="${this.hideChinese ? '显示中文' : '隐藏中文'}">
                            <i class="fas ${this.hideChinese ? 'fa-eye-slash' : 'fa-eye'}"></i>
                        </button>
                    </div>
                </div>

                <div class="learn-progress-bar">
                    <div class="learn-progress-fill" style="width:${progressPct}%"></div>
                </div>
                <div class="learn-progress-text">${current} / ${total}</div>

                ${cardContent}

                <div class="learn-nav-row">
                    <button class="learn-nav-btn" onclick="StudyModule.navCard(-1)" ${this.studyIndex <= 0 ? 'disabled' : ''}>
                        <i class="fas fa-chevron-left"></i> 上一个
                    </button>
                    <button class="learn-nav-btn primary" onclick="StudyModule.switchSubTab('practice')">
                        去练习 <i class="fas fa-arrow-right"></i>
                    </button>
                    <button class="learn-nav-btn" onclick="StudyModule.navCard(1)" ${this.studyIndex >= this.studyItems.length - 1 ? 'disabled' : ''}>
                        下一个 <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
            </div>
        `;
    },

    navCard(dir) {
        const newIndex = this.studyIndex + dir;
        if (newIndex < 0 || newIndex >= this.studyItems.length) return;
        this.studyIndex = newIndex;
        this._renderLearnCard(document.getElementById('study-sub-content'));
    },

    toggleHide() {
        this.hideChinese = !this.hideChinese;
        this._renderLearnCard(document.getElementById('study-sub-content'));
    },

    // ========== 练习页 ==========
    renderPractice(container) {
        // 构建练习数据源
        const studyContent = CourseContent.getStudyContent(this.selectedLevelId, this.selectedUnitId);
        if (studyContent.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">请先选择学习单元</div>';
            return;
        }

        let allWords = [], allSentences = [], allDialogues = [];
        for (const section of studyContent) {
            const unit = section.unit;
            for (const type of section.types) {
                if (type === 'words') allWords.push(...(unit.words || []));
                if (type === 'sentences') allSentences.push(...(unit.sentences || []));
                if (type === 'dialogues') allDialogues.push(...(unit.dialogues || []));
            }
        }

        const wordCount = allWords.length;
        const sentenceCount = allSentences.length;
        const dialogueCount = allDialogues.length;

        container.innerHTML = `
            <div class="practice-page">
                <div class="practice-header">
                    <div class="practice-title"><i class="fas fa-pen-fancy" style="color:var(--accent);"></i> 练习模式</div>
                    <div class="practice-unit-name">${CourseContent.getUnit(this.selectedLevelId, this.selectedUnitId)?.name || ''}</div>
                </div>

                <div class="practice-stats-row">
                    <div class="practice-stat-card">
                        <div class="practice-stat-num">${wordCount}</div>
                        <div class="practice-stat-label">单词</div>
                    </div>
                    <div class="practice-stat-card">
                        <div class="practice-stat-num">${sentenceCount}</div>
                        <div class="practice-stat-label">短句</div>
                    </div>
                    <div class="practice-stat-card">
                        <div class="practice-stat-num">${dialogueCount}</div>
                        <div class="practice-stat-label">对话</div>
                    </div>
                </div>

                <div class="practice-type-section">
                    <div class="practice-section-title">练习类型</div>
                    <div class="practice-type-btns">
                        <button class="ptype-btn active" onclick="StudyPractice.startChoice(${wordCount}, ${sentenceCount})">
                            <i class="fas fa-th-large"></i> 选择题
                        </button>
                        <button class="ptype-btn" onclick="StudyPractice.startFill(${sentenceCount})">
                            <i class="fas fa-keyboard"></i> 填空题
                        </button>
                    </div>
                </div>

                <div class="practice-mastery-section">
                    <div class="practice-section-title">已掌握标记</div>
                    <div class="mastery-check-row">
                        <label class="mastery-check-item">
                            <input type="checkbox" id="mastery-words" ${CourseContent.isMastered(this.selectedLevelId, this.selectedUnitId, 'words') ? 'checked' : ''} onchange="StudyModule.toggleMastery('words')">
                            <span>单词 (${wordCount}个)</span>
                        </label>
                        <label class="mastery-check-item">
                            <input type="checkbox" id="mastery-sentences" ${CourseContent.isMastered(this.selectedLevelId, this.selectedUnitId, 'sentences') ? 'checked' : ''} onchange="StudyModule.toggleMastery('sentences')">
                            <span>短句 (${sentenceCount}个)</span>
                        </label>
                        <label class="mastery-check-item">
                            <input type="checkbox" id="mastery-dialogues" ${CourseContent.isMastered(this.selectedLevelId, this.selectedUnitId, 'dialogues') ? 'checked' : ''} onchange="StudyModule.toggleMastery('dialogues')">
                            <span>对话 (${dialogueCount}个)</span>
                        </label>
                    </div>
                </div>

                <div id="practice-area"></div>
            </div>
        `;
    },

    toggleMastery(type) {
        const checked = document.getElementById('mastery-' + type)?.checked;
        if (checked) {
            CourseContent.markMastered(this.selectedLevelId, this.selectedUnitId, type);
        } else {
            // 检查是否允许取消掌握标记
            const config = this._getPracticeConfig();
            if (config.allowUnmarkMastered === false) {
                // 不允许取消，恢复勾选状态
                document.getElementById('mastery-' + type).checked = true;
                alert('管理员已禁止取消"已掌握"标记');
                return;
            }
            CourseContent.unmarkMastered(this.selectedLevelId, this.selectedUnitId, type);
        }
    },
};