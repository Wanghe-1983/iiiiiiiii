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

    // ========== 选择题 ==========
    startChoice(wordCount, sentenceCount) {
        this.practiceType = 'choice';
        const studyContent = CourseContent.getStudyContent(StudyModule.selectedLevelId, StudyModule.selectedUnitId);
        const pool = [];
        for (const section of studyContent) {
            const unit = section.unit;
            for (const type of section.types) {
                if (type === 'words') pool.push(...(unit.words || []).map(w => ({ indo: w.indonesian, zh: w.chinese, type: 'word' })));
                if (type === 'sentences') pool.push(...(unit.sentences || []).map(s => ({ indo: s.indonesian, zh: s.chinese, type: 'sentence' })));
            }
        }
        if (pool.length < 4) {
            alert('题目数量不足，至少需要4道题');
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
        const studyContent = CourseContent.getStudyContent(StudyModule.selectedLevelId, StudyModule.selectedUnitId);
        const pool = [];
        for (const section of studyContent) {
            const unit = section.unit;
            for (const type of section.types) {
                if (type === 'words') pool.push(...(unit.words || []).map(w => ({ indo: w.indonesian, zh: w.chinese, type: 'word' })));
                if (type === 'sentences') pool.push(...(unit.sentences || []).map(s => ({ indo: s.indonesian, zh: s.chinese, type: 'sentence' })));
            }
        }
        if (pool.length === 0) { alert('没有可练习的内容'); return; }
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
                    <button class="result-btn back" onclick="StudyModule.switchSubTab('course')">
                        <i class="fas fa-book-open"></i> 返回课程
                    </button>
                </div>
            </div>
        `;
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