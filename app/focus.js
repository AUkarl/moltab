/**
 * FocusManager - 专注工具管理（番茄钟 + 待办事项）
 * 番茄钟：工作/休息循环，可配置时长，支持暂停/继续/重置，完成计数持久化
 * 待办：增删改查，完成状态切换，数据存储在 localStorage
 */
export class FocusManager {
    constructor() {
        // 番茄钟状态机：running/mode(work|rest)/remaining(秒)/cycles(完成数)/interval(定时器)
        this.pomoState = {
            running: false,
            mode: 'work',
            remaining: 25 * 60,
            cycles: 0,
            interval: null
        };
        this.workDuration = parseInt(localStorage.getItem('moltap-pomo-work')) || 25;
        this.restDuration = parseInt(localStorage.getItem('moltap-pomo-rest')) || 5;
        this.pomoState.remaining = this.workDuration * 60;
        this.todos = JSON.parse(localStorage.getItem('moltap-todos') || '[]');
    }

    init() {
        this.loadPomoState();
    }

    /** 绑定网格中番茄钟卡片的事件 */
    bindGridPomoEvents() {
        const startBtn = document.getElementById('pomoStartBtn');
        const resetBtn = document.getElementById('pomoResetBtn');
        const display = document.getElementById('pomoDisplay');
        if (startBtn) startBtn.addEventListener('click', () => this.togglePomo());
        if (resetBtn) resetBtn.addEventListener('click', () => this.resetPomo());
        // 点击计时器数字弹出时长设置弹窗
        if (display) display.addEventListener('click', () => this.showPomoEditModal());
        this.updatePomoDisplay();
        this.updatePomoStatus();
        this.updateCycles();
    }

    /** 绑定网格中待办卡片的事件 */
    bindGridTodoEvents() {
        const input = document.getElementById('todoInput');
        const addBtn = document.getElementById('todoAddBtn');
        if (addBtn) addBtn.addEventListener('click', () => this.addTodo(input.value));
        if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') this.addTodo(input.value); });
        const list = document.getElementById('todoList');
        if (list) {
            list.addEventListener('click', e => {
                const check = e.target.closest('.todo-check');
                if (check) { this.toggleTodo(check.dataset.id); return; }
                const del = e.target.closest('.todo-del');
                if (del) { this.removeTodo(del.dataset.id); }
            });
        }
        this.renderTodos();
    }

    /** 弹出番茄钟时长设置弹窗（工作/休息分钟数） */
    showPomoEditModal() {
        const overlay = document.createElement('div');
        overlay.className = 'form-modal-overlay';
        overlay.innerHTML = `
            <div class="form-modal-card">
                <h3>番茄钟设置</h3>
                <div class="form-field">
                    <label>专注时长（分钟）</label>
                    <input id="pomoWorkInput" type="number" min="1" max="120" value="${this.workDuration}">
                </div>
                <div class="form-field">
                    <label>休息时长（分钟）</label>
                    <input id="pomoRestInput" type="number" min="1" max="60" value="${this.restDuration}">
                </div>
                <div class="form-actions">
                    <button class="btn-sm" id="pomoEditCancel">取消</button>
                    <button class="btn-sm primary" id="pomoEditSave">保存</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const workInput = overlay.querySelector('#pomoWorkInput');
        workInput.focus();
        workInput.select();
        overlay.querySelector('#pomoEditCancel').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#pomoEditSave').addEventListener('click', () => {
            const w = Math.max(1, Math.min(120, parseInt(workInput.value) || 25));
            const r = Math.max(1, Math.min(60, parseInt(overlay.querySelector('#pomoRestInput').value) || 5));
            this.workDuration = w;
            this.restDuration = r;
            localStorage.setItem('moltap-pomo-work', w);
            localStorage.setItem('moltap-pomo-rest', r);
            // 未运行时更新剩余时间为新时长
            if (!this.pomoState.running) {
                if (this.pomoState.mode === 'work') {
                    this.pomoState.remaining = w * 60;
                } else {
                    this.pomoState.remaining = r * 60;
                }
                this.updatePomoDisplay();
            }
            overlay.remove();
        });
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        overlay.addEventListener('keydown', e => { if (e.key === 'Enter') overlay.querySelector('#pomoEditSave').click(); });
    }

    /** 切换番茄钟运行/暂停 */
    togglePomo() {
        if (this.pomoState.running) {
            this.pausePomo();
        } else {
            this.startPomo();
        }
    }

    startPomo() {
        this.pomoState.running = true;
        const btn = document.getElementById('pomoStartBtn');
        if (btn) btn.textContent = '暂停';
        this.updatePomoStatus();
        this.pomoState.interval = setInterval(() => this.tickPomo(), 1000);
    }

    pausePomo() {
        this.pomoState.running = false;
        clearInterval(this.pomoState.interval);
        const btn = document.getElementById('pomoStartBtn');
        if (btn) btn.textContent = '继续';
        this.updatePomoStatus();
    }

    /** 重置番茄钟到初始工作状态 */
    resetPomo() {
        this.pomoState.running = false;
        clearInterval(this.pomoState.interval);
        this.pomoState.mode = 'work';
        this.pomoState.remaining = this.workDuration * 60;
        const btn = document.getElementById('pomoStartBtn');
        if (btn) btn.textContent = '开始';
        this.updatePomoDisplay();
        this.updatePomoStatus();
    }

    /** 每秒倒计时，归零时自动切换工作/休息模式 */
    tickPomo() {
        this.pomoState.remaining--;
        if (this.pomoState.remaining <= 0) {
            if (this.pomoState.mode === 'work') {
                // 工作完成 → 进入休息
                this.pomoState.cycles++;
                this.pomoState.mode = 'rest';
                this.pomoState.remaining = this.restDuration * 60;
                this.updatePomoStatus();
                this.updateCycles();
                this.savePomoState();
                this.notify('番茄完成！休息一下吧');
            } else {
                // 休息结束 → 回到工作
                this.pomoState.mode = 'work';
                this.pomoState.remaining = this.workDuration * 60;
                this.updatePomoStatus();
                this.notify('休息结束，继续专注！');
            }
        }
        this.updatePomoDisplay();
    }

    /** 更新计时器显示（MM:SS 格式） */
    updatePomoDisplay() {
        const el = document.getElementById('pomoDisplay');
        if (!el) return;
        const m = Math.floor(this.pomoState.remaining / 60);
        const s = this.pomoState.remaining % 60;
        el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    /** 更新状态文字（准备开始/专注中/已暂停/休息中/休息暂停） */
    updatePomoStatus() {
        const el = document.getElementById('pomoStatus');
        if (!el) return;
        const defaultRemaining = this.pomoState.mode === 'work' ? this.workDuration * 60 : this.restDuration * 60;
        if (!this.pomoState.running && this.pomoState.remaining === defaultRemaining) {
            el.textContent = '准备开始';
        } else if (this.pomoState.mode === 'work') {
            el.textContent = this.pomoState.running ? '专注中...' : '已暂停';
        } else {
            el.textContent = this.pomoState.running ? '休息中...' : '休息暂停';
        }
    }

    updateCycles() {
        const el = document.getElementById('pomoCycles');
        if (el) el.textContent = `已完成 ${this.pomoState.cycles} 个番茄`;
    }

    /** 显示 Toast 通知 */
    notify(msg) {
        const old = document.querySelector('.toast');
        if (old) old.remove();
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2200);
    }

    /** 从 localStorage 恢复番茄钟完成计数 */
    loadPomoState() {
        const saved = localStorage.getItem('moltap-pomo-state');
        if (saved) {
            try {
                const s = JSON.parse(saved);
                this.pomoState.cycles = s.cycles || 0;
                this.updateCycles();
            } catch {}
        }
    }

    savePomoState() {
        localStorage.setItem('moltap-pomo-state', JSON.stringify({
            cycles: this.pomoState.cycles
        }));
    }

    // ---- 待办事项 CRUD ----

    addTodo(text) {
        text = text.trim();
        if (!text) return;
        this.todos.unshift({ id: Date.now().toString(), text, done: false });
        this.saveTodos();
        this.renderTodos();
        const input = document.getElementById('todoInput');
        if (input) input.value = '';
    }

    toggleTodo(id) {
        const todo = this.todos.find(t => t.id === id);
        if (todo) { todo.done = !todo.done; this.saveTodos(); this.renderTodos(); }
    }

    removeTodo(id) {
        this.todos = this.todos.filter(t => t.id !== id);
        this.saveTodos();
        this.renderTodos();
    }

    saveTodos() {
        localStorage.setItem('moltap-todos', JSON.stringify(this.todos));
    }

    /** 渲染待办列表到 DOM */
    renderTodos() {
        const list = document.getElementById('todoList');
        if (!list) return;
        list.innerHTML = this.todos.map(t => `
            <div class="todo-item">
                <div class="todo-check ${t.done ? 'done' : ''}" data-id="${t.id}">${t.done ? '✓' : ''}</div>
                <span class="todo-text ${t.done ? 'done' : ''}">${this.esc(t.text)}</span>
                <button class="todo-del" data-id="${t.id}">✕</button>
            </div>
        `).join('');
    }

    /** HTML 转义防止 XSS */
    esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
}
