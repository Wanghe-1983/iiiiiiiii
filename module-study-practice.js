/**
 * module-study-practice.js
 * 勤学苦练 - 练习答题逻辑
 * 选择题、填空题
 */

const StudyPractice = {
    questions: [],
    currentIndex: 0,
    score: 0,
    answered: false,
    isFinished: false,
    practiceType: 'choice', // choice | fill
    wrongBook: [],  // 本次练习的错题记录

    // 获取练习配置
    _getConfig() {
        const sysInfo = window._systemInfo || {};
        const userInfo = JSON.parse(localStorage.getItem('fmi_user') || '{}');
        const isVisitor = userInfo.role === 'visitor';
        return isVisitor
            ? (sysInfo.studyPracticeVisitor || {})
            : (sysInfo.studyPracticeUser || {});
    },

    // 添加错题到localStorage
    _addToWrongBook(item) {
        const config = this._getConfig();
        if (!config.enableWrongBook) return;
        
        const key = 'fmi_wrong_book';
        let book = JSON.parse(localStorage.getItem(key) || '[]');
        // 去重（按indonesian）
        if (!book.find(b => b.indonesian === item.indo)) {
            book.unshift({
                indo: item.indo,
                zh: item.zh,
                type: item.type,
                unitId: StudyModule.selectedUnitId,
                levelId: StudyModule.selectedLevelId,
                timestamp: Date.now()
            });
            // 最多保留200条
            if (book.length > 200) book = book.slice(0, 200);
            localStorage.setItem(key, JSON.stringify(book));
        }
    },

    // 获取错题集
    getWrongBook() {
        return JSON.parse(localStorage.getItem('fmi_wrong_book') || '[]');
    },

    // 删除单条错题
    deleteWrongItem(indonesian) {
        const config = this._getConfig();
        if (!config.allowDeleteWrong) return;
        let book = JSON.parse(localStorage.getItem('fmi_wrong_book') || '[]');
        book = book.filter(b => b.indonesian !== indonesian);
        localStorage.setItem('fmi_wrong_book', JSON.stringify(book));
    },

    // 清空错题集
    clearWrongBook() {
        const config = this._getConfig();
        if (!config.allowClearWrong) return;
        localStorage.setItem('fmi_wrong_book', JSON.stringify([]));
    },

    // ========== 选择题 ==========
    startChoice(wordCount, sentenceCount) {
        this.practiceType = 'choice';
        this.wrongBook = [];  // 重置本次错题
        const studyContent = CourseContent.getStudyContent(StudyModule.selectedLevelId, StudyModule.selectedUnitId);
        const config = this._getConfig();
        const includeMastered = config.includeMastered !== false;  // 默认包含
        const pool = [];
        for (const section of studyContent) {
            const unit = section.unit;
            for (const type of section.types) {
                const items = type === 'words' ? (unit.words || []) : (unit.sentences || []);
                const masteredType = type === 'words' ? 'words' : 'sentences';
                const isTypeMastered = CourseContent.isMastered(StudyModule.selectedLevelId, StudyModule.selectedUnitId, masteredType);
                if (includeMastered || !isTypeMastered) {
                    for (const item of items) {
                        pool.push({ indo: item.indonesian, zh: item.chinese, type: type === 'words' ? 'word' : 'sentence' });
                    }
                }
            }
        }
        if (pool.length < 4) {
            alert('题目数量不足（部分内容已掌握已被排除），请先学习其他单元');
            return;
        }
        // 打乱取最多20题
        this.questions = this._shuffle(pool).slice(0, 20);
        this.currentIndex = 0;
        this.score = 0;
        this.answered = false;
        this.isFinished = false;
        this._renderChoiceQuestion();
    },

    _renderChoiceQuestion() {
        const area = document.getElementById('practice-area');
        if (!area) return;

        if (this.currentIndex >= this.questions.length) {
            this._renderResult(area);
            return;
        }

        const q = this.questions[this.currentIndex];
        const total = this.questions.length;
        const progressPct = Math.round((this.currentIndex) / total * 100);

        // 生成4个选项（含正确答案）
        const wrongOptions = this.questions.filter((_, i) => i !== this.currentIndex).map(x => x.zh);
        const shuffledWrong = this._shuffle(wrongOptions).slice(0, 3);
        const options = this._shuffle([q.zh, ...shuffledWrong]);

        this.answered = false;
        area.innerHTML = `
            <div class="quiz-container">
                <div class="quiz-progress-bar"><div class="quiz-progress-fill" style="width:${progressPct}%"></div></div>
                <div class="quiz-counter">${this.currentIndex + 1} / ${total}</div>
                <div class="quiz-type-tag">${q.type === 'word' ? '单词' : '短句'}</div>
                <div class="quiz-question">
                    <div class="quiz-indo" onclick="speak('${encodeURIComponent(q.indo)}')">
                        ${q.indo}
                        <i class="fas fa-volume-up" style="margin-left:8px;color:var(--accent);cursor:pointer;"></i>
                    </div>
                    <div class="quiz-prompt">请选择正确的中文释义：</div>
                </div>
                <div class="quiz-options">
                    ${options.map((opt, i) => `
                        <button class="quiz-option" onclick="StudyPractice.answerChoice(this, '${encodeURIComponent(q.zh)}', '${encodeURIComponent(opt)}')">
                            <span class="quiz-option-letter">${'ABCD'[i]}</span>
                            <span class="quiz-option-text">${opt}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    },

    answerChoice(btnEl, correctZh, selectedZh) {
        if (this.answered) return;
        this.answered = true;

        const correct = decodeURIComponent(correctZh);
        const selected = decodeURIComponent(selectedZh);
        const isCorrect = correct === selected;

        if (isCorrect) this.score++;
        else {
            // 记录错题
            const q = this.questions[this.currentIndex];
            if (q) this._addToWrongBook(q);
        }

        // 高亮正确/错误
        const allBtns = btnEl.parentElement.querySelectorAll('.quiz-option');
        allBtns.forEach(btn => {
            const text = btn.querySelector('.quiz-option-text').textContent;
            btn.style.pointerEvents = 'none';
            if (text === correct) {
                btn.classList.add('correct');
            } else if (btn === btnEl && !isCorrect) {
                btn.classList.add('wrong');
            }
        });

        // 1.5秒后自动下一题
        setTimeout(() => {
            this.currentIndex++;
            this._renderChoiceQuestion();
        }, 1500);
    },

    // ========== 填空题 ==========
    startFill(sentenceCount) {
        this.practiceType = 'fill';
        this.wrongBook = [];  // 重置本次错题
        const studyContent = CourseContent.getStudyContent(StudyModule.selectedLevelId, StudyModule.selectedUnitId);
        const config = this._getConfig();
        const includeMastered = config.includeMastered !== false;
        const pool = [];
        for (const section of studyContent) {
            const unit = section.unit;
            for (const type of section.types) {
                const items = type === 'words' ? (unit.words || []) : (unit.sentences || []);
                const masteredType = type === 'words' ? 'words' : 'sentences';
                const isTypeMastered = CourseContent.isMastered(StudyModule.selectedLevelId, StudyModule.selectedUnitId, masteredType);
                if (includeMastered || !isTypeMastered) {
                    for (const item of items) {
                        pool.push({ indo: item.indonesian, zh: item.chinese, type: type === 'words' ? 'word' : 'sentence' });
                    }
                }
            }
        }
        if (pool.length === 0) { alert('没有可练习的内容（已掌握内容已被排除）'); return; }
        this.questions = this._shuffle(pool).slice(0, 10);
        this.currentIndex = 0;
        this.score = 0;
        this.answered = false;
        this.isFinished = false;
        this._renderFillQuestion();
    },

    _renderFillQuestion() {
        const area = document.getElementById('practice-area');
        if (!area) return;

        if (this.currentIndex >= this.questions.length) {
            this._renderResult(area);
            return;
        }

        const q = this.questions[this.currentIndex];
        const total = this.questions.length;
        const progressPct = Math.round((this.currentIndex) / total * 100);

        this.answered = false;
        area.innerHTML = `
            <div class="quiz-container">
                <div class="quiz-progress-bar"><div class="quiz-progress-fill" style="width:${progressPct}%"></div></div>
                <div class="quiz-counter">${this.currentIndex + 1} / ${total}</div>
                <div class="quiz-type-tag fill-tag">填空题</div>
                <div class="quiz-question">
                    <div class="quiz-indo" onclick="speak('${encodeURIComponent(q.indo)}')">
                        ${q.indo}
                        <i class="fas fa-volume-up" style="margin-left:8px;color:var(--accent);cursor:pointer;"></i>
                    </div>
                    <div class="quiz-prompt">请输入中文释义：</div>
                </div>
                <div class="fill-input-area">
                    <input type="text" id="fill-input" class="fill-input" placeholder="输入中文翻译..." onkeydown="if(event.key==='Enter')StudyPractice.answerFill()">
                    <button class="fill-submit-btn" onclick="StudyPractice.answerFill()">提交</button>
                </div>
                <div id="fill-feedback" class="fill-feedback" style="display:none;"></div>
                <div class="fill-actions" id="fill-actions" style="display:none;">
                    <button class="fill-next-btn" onclick="StudyPractice.nextFill()">下一题</button>
                </div>
            </div>
        `;
        setTimeout(() => document.getElementById('fill-input')?.focus(), 100);
    },

    answerFill() {
        if (this.answered) return;
        const input = document.getElementById('fill-input');
        const answer = (input?.value || '').trim();
        if (!answer) return;

        this.answered = true;
        const q = this.questions[this.currentIndex];
        const isCorrect = answer === q.zh;
        if (isCorrect) this.score++;
        else {
            // 记录错题
            this._addToWrongBook(q);
        }

        const feedback = document.getElementById('fill-feedback');
        const actions = document.getElementById('fill-actions');
        feedback.style.display = 'block';
        feedback.className = 'fill-feedback ' + (isCorrect ? 'correct' : 'wrong');
        feedback.innerHTML = isCorrect
            ? '<i class="fas fa-check-circle"></i> 正确！'
            : `<i class="fas fa-times-circle"></i> 错误！正确答案：<strong>${q.zh}</strong>`;
        actions.style.display = 'block';
        input.disabled = true;
    },

    nextFill() {
        this.currentIndex++;
        this._renderFillQuestion();
    },

    // ========== 结果页 ==========
    _renderResult(area) {
        this.isFinished = true;
        const total = this.questions.length;
        const pct = Math.round(this.score / total * 100);
        const emoji = pct >= 90 ? 'star' : pct >= 70 ? 'thumbs-up' : pct >= 50 ? 'meh' : 'redo';
        const msg = pct >= 90 ? '太棒了！' : pct >= 70 ? '不错！' : pct >= 50 ? '继续努力！' : '需要多加练习';

        const wrongCount = this.getWrongBook().length;
        const config = this._getConfig();
        const showWrongEntry = config.enableWrongBook && wrongCount > 0;
        area.innerHTML = `
            <div class="quiz-result">
                <div class="result-icon"><i class="fas fa-${emoji}"></i></div>
                <div class="result-msg">${msg}</div>
                <div class="result-score">${this.score} / ${total}</div>
                <div class="result-pct">正确率 ${pct}%</div>
                <div class="result-actions">
                    <button class="result-btn retry" onclick="StudyModule.switchSubTab('practice')">
                        <i class="fas fa-redo"></i> 再练一次
                    </button>
                    ${showWrongEntry ? '<button class="result-btn wrong-book-btn" onclick="StudyPractice.renderWrongBook()"><i class="fas fa-book"></i> 查看错题集 (' + wrongCount + ')</button>' : ''}
                    <button class="result-btn back" onclick="StudyModule.switchSubTab('course')">
                        <i class="fas fa-book-open"></i> 返回课程
                    </button>
                </div>
            </div>
        `;
    },

    // ========== 错题集 ==========
    renderWrongBook() {
        const area = document.getElementById('practice-area');
        if (!area) return;
        const config = this._getConfig();
        const book = this.getWrongBook();
        
        let html = '<div class="wrong-book-panel">';
        html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">';
        html += '<div style="font-size:1rem;font-weight:700;color:#e2e8f0;"><i class="fas fa-book" style="color:#f87171;margin-right:6px;"></i> 错题集 (' + book.length + '题)</div>';
        html += '<div style="display:flex;gap:8px;">';
        if (book.length > 0 && config.allowClearWrong) {
            html += '<button class="ptype-btn" onclick="if(confirm(\'确认清空所有错题？\')){StudyPractice.clearWrongBook();StudyPractice.renderWrongBook();}" style="color:#f87171;border-color:rgba(248,113,113,0.3);"><i class="fas fa-trash"></i> 清空</button>';
        }
        html += '<button class="ptype-btn" onclick="StudyModule.switchSubTab(\'practice\')"><i class="fas fa-arrow-left"></i> 返回</button>';
        html += '</div></div>';
        
        if (book.length === 0) {
            html += '<div style="text-align:center;padding:40px;color:var(--text-muted);">暂无错题，继续保持！</div>';
        } else {
            html += '<div class="wrong-book-list">';
            book.forEach((item, idx) => {
                const dateStr = new Date(item.timestamp).toLocaleDateString('zh-CN');
                html += '<div class="wrong-book-item">';
                html += '<div class="wrong-book-num">' + (idx + 1) + '</div>';
                html += '<div class="wrong-book-content">';
                html += '<div class="wrong-book-indo" onclick="speak(\'' + encodeURIComponent(item.indo) + '\')">' + item.indo + ' <i class="fas fa-volume-up" style="color:var(--accent);cursor:pointer;margin-left:6px;"></i></div>';
                html += '<div class="wrong-book-zh">' + item.zh + '</div>';
                html += '</div>';
                if (config.allowDeleteWrong) {
                    html += '<button class="wrong-book-del" onclick="StudyPractice.deleteWrongItem(\'' + item.indo.replace(/'/g, "\\'") + '\');StudyPractice.renderWrongBook();" title="删除"><i class="fas fa-times"></i></button>';
                }
                html += '</div>';
            });
            html += '</div>';
            
            // 重做按钮
            if (book.length >= 4) {
                html += '<div style="text-align:center;margin-top:20px;">';
                html += '<button class="ptype-btn" onclick="StudyPractice.startWrongBookPractice()" style="padding:10px 24px;font-size:0.9rem;"><i class="fas fa-redo"></i> 从错题中出题</button>';
                html += '</div>';
            }
        }
        html += '</div>';
        area.innerHTML = html;
    },

    startWrongBookPractice() {
        const book = this.getWrongBook();
        if (book.length < 4) {
            alert('错题不足4道，无法开始练习');
            return;
        }
        this.practiceType = 'choice';
        this.wrongBook = [];
        this.questions = this._shuffle(book.map(b => ({ indo: b.indo, zh: b.zh, type: b.type || 'word' }))).slice(0, 20);
        this.currentIndex = 0;
        this.score = 0;
        this.answered = false;
        this.isFinished = false;
        this._renderChoiceQuestion();
    },

    // ========== 工具 ==========
    _shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    },
};