/**
 * course-content-loader.js
 * 加载并缓存课程数据，提供数据查询接口
 * 数据源: public/course-content.json
 */
const CourseContent = {
    _data: null,
    _loaded: false,
    _listeners: [],

    // 当前学习状态
    _currentLevelId: '0',
    _currentUnitId: null,

    // 已掌握记录 (localStorage: fmi_mastery_records)
    get masteryKey() { return 'fmi_mastery_records'; },

    getMastery() {
        return JSON.parse(localStorage.getItem(this.masteryKey) || '{}');
    },

    setMastery(mastery) {
        localStorage.setItem(this.masteryKey, JSON.stringify(mastery));
    },

    // mastery 结构: { "0-words": { mastered: true, timestamp: ... }, ... }
    markMastered(levelId, unitId, type) {
        const mastery = this.getMastery();
        const key = `${levelId}|${unitId}|${type}`;
        mastery[key] = { mastered: true, timestamp: Date.now() };
        this.setMastery(mastery);
        this._notifyListeners('mastery-changed', { levelId, unitId, type });
    },

    unmarkMastered(levelId, unitId, type) {
        const mastery = this.getMastery();
        const key = `${levelId}|${unitId}|${type}`;
        delete mastery[key];
        this.setMastery(mastery);
        this._notifyListeners('mastery-changed', { levelId, unitId, type });
    },

    isMastered(levelId, unitId, type) {
        const mastery = this.getMastery();
        const key = `${levelId}|${unitId}|${type}`;
        return mastery[key]?.mastered === true;
    },

    // 获取某级别的掌握进度
    getLevelMastery(levelId) {
        const level = this.getLevel(levelId);
        if (!level) return { words: { mastered: 0, total: 0, pct: 0 }, sentences: { mastered: 0, total: 0, pct: 0 }, dialogues: { mastered: 0, total: 0, pct: 0 } };

        let wordsTotal = 0, wordsMastered = 0;
        let sentencesTotal = 0, sentencesMastered = 0;
        let dialoguesTotal = 0, dialoguesMastered = 0;
        const mastery = this.getMastery();

        for (const unit of level.units) {
            const wCount = (unit.words || []).length;
            const sCount = (unit.sentences || []).length;
            const dCount = (unit.dialogues || []).length;
            wordsTotal += wCount;
            sentencesTotal += sCount;
            dialoguesTotal += dCount;

            if (wCount > 0 && mastery[`${levelId}|${unit.id}|words`]?.mastered) wordsMastered += wCount;
            if (sCount > 0 && mastery[`${levelId}|${unit.id}|sentences`]?.mastered) sentencesMastered += sCount;
            if (dCount > 0 && mastery[`${levelId}|${unit.id}|dialogues`]?.mastered) dialoguesMastered += dCount;
        }

        return {
            words: { mastered: wordsMastered, total: wordsTotal, pct: wordsTotal ? Math.round(wordsMastered / wordsTotal * 100) : 0 },
            sentences: { mastered: sentencesMastered, total: sentencesTotal, pct: sentencesTotal ? Math.round(sentencesMastered / sentencesTotal * 100) : 0 },
            dialogues: { mastered: dialoguesMastered, total: dialoguesTotal, pct: dialoguesTotal ? Math.round(dialoguesMastered / dialoguesTotal * 100) : 0 },
        };
    },

    // 获取某单元的掌握状态
    getUnitMastery(levelId, unitId) {
        return {
            words: this.isMastered(levelId, unitId, 'words'),
            sentences: this.isMastered(levelId, unitId, 'sentences'),
            dialogues: this.isMastered(levelId, unitId, 'dialogues'),
        };
    },

    // 加载数据
    async load() {
        if (this._loaded) return this._data;
        try {
            const res = await fetch('./public/course-content.json?t=' + Date.now());
            if (!res.ok) throw new Error('Failed to load');
            this._data = await res.json();
            this._loaded = true;
            this._notifyListeners('loaded', this._data);
            return this._data;
        } catch (e) {
            console.error('Course content load failed:', e);
            return null;
        }
    },

    // 数据查询
    get data() { return this._data; },

    getLevels() {
        return this._data?.levels || [];
    },

    getLevel(levelId) {
        return this._data?.levels?.find(l => String(l.id) === String(levelId));
    },

    getUnit(levelId, unitId) {
        const level = this.getLevel(levelId);
        return level?.units?.find(u => u.id === unitId);
    },

    // 获取学习内容（核心逻辑：当前课时 + 未掌握的旧课时）
    getStudyContent(levelId, currentUnitId) {
        const level = this.getLevel(levelId);
        if (!level) return [];
        const mastery = this.getMastery();
        const currentIdx = level.units.findIndex(u => u.id === currentUnitId);
        if (currentIdx < 0) return [];

        const result = [];
        // 收集未掌握的旧单元
        for (let i = 0; i < currentIdx; i++) {
            const unit = level.units[i];
            const unitMastery = this.getUnitMastery(levelId, unit.id);
            // 只添加未完全掌握的单元
            const types = [];
            if ((unit.words || []).length > 0 && !unitMastery.words) types.push('words');
            if ((unit.sentences || []).length > 0 && !unitMastery.sentences) types.push('sentences');
            if ((unit.dialogues || []).length > 0 && !unitMastery.dialogues) types.push('dialogues');
            if (types.length > 0) {
                result.push({ unit, types, isReview: true });
            }
        }
        // 添加当前单元
        const currentUnit = level.units[currentIdx];
        result.push({
            unit: currentUnit,
            types: ['words', 'sentences', 'dialogues'].filter(t => {
                const arr = currentUnit[t + 's'] || (t === 'dialogues' ? currentUnit.dialogues : []);
                return arr && arr.length > 0;
            }),
            isReview: false,
        });

        return result;
    },

    // 闯天关：生成关卡列表
    // 支持两种切分模式：
    //   auto: 按单元混合切分，每个单元内的单词/短句/对话混合后按 autoContentCount 分组
    //   manual: 按类型分别切分，使用 wordsPerStage/sentencesPerStage/dialoguesPerStage
    generateStages(levelId, mode) {
        const level = this.getLevel(levelId);
        if (!level) { console.warn('[generateStages] level not found:', levelId); return []; }
        const stages = [];
        const sysInfo = window._systemInfo || {};
        console.log('[generateStages] levelId:', levelId, 'mode:', mode, 'normalSettings:', sysInfo.normalSettings, 'hellSettings:', sysInfo.hellSettings);

        // 根据模式读取对应的配置（新结构优先，向后兼容旧字段）
        const modeSettings = mode === 'hell'
            ? (sysInfo.hellSettings || {})
            : (sysInfo.normalSettings || {});
        const autoContentCount = modeSettings.autoContentCount || sysInfo.autoContentCount || 5;
        const wordsPerStage = modeSettings.wordsPerStage || sysInfo.wordsPerStage || 0;
        const sentencesPerStage = modeSettings.sentencesPerStage || sysInfo.sentencesPerStage || 0;
        const dialoguesPerStage = modeSettings.dialoguesPerStage || sysInfo.dialoguesPerStage || 0;

        // 判断切分模式
        const isAutoMode = (wordsPerStage === 0 || autoContentCount > 0)
            && !(wordsPerStage > 0 || sentencesPerStage > 0 || dialoguesPerStage > 0);

        if (isAutoMode) {
            // ===== 自动分配模式：按单元混合切分 =====
            for (let uIdx = 0; uIdx < level.units.length; uIdx++) {
                const unit = level.units[uIdx];
                const words = unit.words || [];
                const sentences = unit.sentences || [];
                const dialogues = unit.dialogues || [];
                // BIPA 0 "基础发音篇"（前4个单元）的短句为语音知识说明，不适合闯天关
                const skipSentences = String(levelId) === '0' && uIdx < 4;

                // 将单元内所有内容混合到一个池子中，带类型标记
                const pool = [];
                words.forEach(w => pool.push({ data: w, type: 'words' }));
                if (!skipSentences) {
                    sentences.forEach(s => pool.push({ data: s, type: 'sentences' }));
                }
                dialogues.forEach(d => pool.push({ data: d, type: 'dialogues' }));

                // 如果池子为空则跳过
                if (pool.length === 0) continue;

                // 按 autoContentCount 切分，每关尽量均匀
                // 先确定关卡数
                const stageCount = Math.ceil(pool.length / autoContentCount);
                for (let sIdx = 0; sIdx < stageCount; sIdx++) {
                    const chunk = pool.slice(sIdx * autoContentCount, (sIdx + 1) * autoContentCount);
                    if (chunk.length === 0) continue;

                    // 按类型分组（用于统计和标签显示）
                    const wItems = chunk.filter(c => c.type === 'words').map(c => c.data);
                    const sItems = chunk.filter(c => c.type === 'sentences').map(c => c.data);
                    const dItems = chunk.filter(c => c.type === 'dialogues').map(c => c.data);

                    // 确定主导类型
                    let mainType = 'mixed';
                    if (wItems.length > 0 && sItems.length === 0 && dItems.length === 0) mainType = 'words';
                    else if (wItems.length === 0 && sItems.length > 0 && dItems.length === 0) mainType = 'sentences';
                    else if (wItems.length === 0 && sItems.length === 0 && dItems.length > 0) mainType = 'dialogues';

                    // 构建标签
                    let label = '';
                    if (wItems.length > 0) label += wItems.length + '词';
                    if (sItems.length > 0) label += (label ? '+' : '') + sItems.length + '句';
                    if (dItems.length > 0) label += (label ? '+' : '') + dItems.length + '对话';

                    stages.push({
                        id: `${levelId}-${unit.id}-auto-${sIdx + 1}`,
                        levelId, unitId: unit.id, type: mainType,
                        name: unit.name + (stageCount > 1 ? ' (' + (sIdx + 1) + '/' + stageCount + ')' : ''),
                        label: label,
                        questions: chunk.map(c => c.data),
                        totalQuestions: chunk.length,
                    });
                }
            }
        } else {
            // ===== 手动分配模式：按类型分别切分 =====
            const WORDS_PER_STAGE = wordsPerStage || 3;
            const SENTENCES_PER_STAGE = sentencesPerStage || 1;
            const DIALOGUES_PER_STAGE = dialoguesPerStage || 1;
            for (let uIdx = 0; uIdx < level.units.length; uIdx++) {
                const unit = level.units[uIdx];
                const words = unit.words || [];
                const sentences = unit.sentences || [];
                const dialogues = unit.dialogues || [];
                const skipSentences = String(levelId) === '0' && uIdx < 4;

                for (let i = 0; i < words.length; i += WORDS_PER_STAGE) {
                    const chunk = words.slice(i, i + WORDS_PER_STAGE);
                    if (chunk.length > 0) {
                        stages.push({
                            id: `${levelId}-${unit.id}-words-${Math.floor(i / WORDS_PER_STAGE) + 1}`,
                            levelId, unitId: unit.id, type: 'words',
                            name: unit.name + ' - ' + (i > 0 ? '(下)' : ''),
                            questions: chunk,
                            totalQuestions: chunk.length,
                        });
                    }
                }
                if (!skipSentences) {
                    for (let i = 0; i < sentences.length; i += SENTENCES_PER_STAGE) {
                        const chunk = sentences.slice(i, i + SENTENCES_PER_STAGE);
                        if (chunk.length > 0) {
                            stages.push({
                                id: `${levelId}-${unit.id}-sentences-${Math.floor(i / SENTENCES_PER_STAGE) + 1}`,
                                levelId, unitId: unit.id, type: 'sentences',
                                name: unit.name,
                                questions: chunk,
                                totalQuestions: chunk.length,
                            });
                        }
                    }
                }
                for (let i = 0; i < dialogues.length; i += DIALOGUES_PER_STAGE) {
                    const chunk = dialogues.slice(i, i + DIALOGUES_PER_STAGE);
                    if (chunk.length > 0) {
                        stages.push({
                            id: `${levelId}-${unit.id}-dialogues-${Math.floor(i / DIALOGUES_PER_STAGE) + 1}`,
                            levelId, unitId: unit.id, type: 'dialogues',
                            name: unit.name,
                            questions: chunk,
                            totalQuestions: chunk.length,
                        });
                    }
                }
            }
        }
        // 全局编号
        stages.forEach((s, i) => { s.stageNumber = i + 1; });
        return stages;
    },

    // 获取闯天关用的所有级别关卡
    getAllStages(mode) {
        const allStages = [];
        const levels = this.getLevels();
        let offset = 0;
        for (const level of levels) {
            const stages = this.generateStages(level.id, mode);
            stages.forEach(s => { s.globalNumber = ++offset; });
            allStages.push(...stages);
        }
        return allStages;
    },

    // 事件监听
    on(event, callback) { this._listeners.push({ event, callback }); },
    off(event, callback) { this._listeners = this._listeners.filter(l => l.event !== event || l.callback !== callback); },
    _notifyListeners(event, data) {
        for (const l of this._listeners) {
            if (l.event === event) try { l.callback(data); } catch (e) { console.error(e); }
        }
    },
};