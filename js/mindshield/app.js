/**
 * Mind Shield - Core Application Controller
 * Manages views, interactions, drag-and-drop, timer, command palette, and modals.
 */

import { projectsRepo, tasksRepo, sessionsRepo, thoughtsRepo, backupRepo } from './repositories.js';
import { p2pSync } from './p2p-sync.js';

class MindShieldApp {
  constructor() {
    this.currentScreen = 'today'; // 'today' | 'focus' | 'inbox' | 'projects'
    this.activeTask = null;
    this.activeSession = null;
    this.timerInterval = null;
    this.projectFilter = null;
    this.draggedTaskId = null;
    this.pendingSwitchTaskId = null;
  }

  async init() {
    // Seed default projects if database is empty
    await projectsRepo.seedDefaultsIfEmpty();

    this.bindGlobalEvents();
    this.bindModalEvents();
    await this.refreshState();

    // Check if there is an active task on initial load
    if (this.activeTask) {
      this.startTimer();
    }
  }

  // ==========================================
  // NAVIGATION & ROUTING
  // ==========================================
  switchScreen(screenName) {
    this.currentScreen = screenName;

    document.querySelectorAll('.ms-screen').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.ms-nav-btn').forEach(el => el.classList.remove('active'));

    const targetScreen = document.getElementById(`screen-${screenName}`);
    const targetNav = document.getElementById(`nav-${screenName}`);

    if (targetScreen) targetScreen.classList.add('active');
    if (targetNav) targetNav.classList.add('active');

    this.renderCurrentScreen();
  }

  async refreshState() {
    this.activeTask = await tasksRepo.getActive();
    this.activeSession = await sessionsRepo.getActive();
    await this.updateNavBadges();
    await this.renderCurrentScreen();
  }

  async updateNavBadges() {
    const todayTasks = await tasksRepo.getTodayTasks();
    const thoughts = await thoughtsRepo.getAll(false);

    const todayCountEl = document.getElementById('today-count');
    const inboxCountEl = document.getElementById('inbox-count');

    if (todayCountEl) todayCountEl.textContent = todayTasks.length;
    if (inboxCountEl) inboxCountEl.textContent = thoughts.length;
  }

  async renderCurrentScreen() {
    switch (this.currentScreen) {
      case 'today':
        await this.renderTodayScreen();
        break;
      case 'focus':
        await this.renderFocusScreen();
        break;
      case 'inbox':
        await this.renderInboxScreen();
        break;
      case 'projects':
        await this.renderProjectsScreen();
        break;
    }
  }

  // ==========================================
  // SCREEN 1: TODAY
  // ==========================================
  async renderTodayScreen() {
    let tasks = await tasksRepo.getTodayTasks();
    const projects = await projectsRepo.getAll(true);
    const projectMap = new Map(projects.map(p => [p.id, p.name]));

    const container = document.getElementById('today-tasks-container');
    if (!container) return;

    if (this.projectFilter) {
      tasks = tasks.filter(t => t.projectId === this.projectFilter);
      const filterName = projectMap.get(this.projectFilter) || 'Project';
      document.getElementById('today-filter-indicator').innerHTML = `
        <span>Filtering by: <strong>${filterName}</strong></span>
        <button class="ms-btn-secondary" style="padding:2px 8px;font-size:0.75rem;" id="clear-project-filter">Clear filter</button>
      `;
      document.getElementById('clear-project-filter')?.addEventListener('click', () => {
        this.projectFilter = null;
        document.getElementById('today-filter-indicator').innerHTML = '';
        this.renderTodayScreen();
      });
    } else {
      const filterEl = document.getElementById('today-filter-indicator');
      if (filterEl) filterEl.innerHTML = '';
    }

    if (tasks.length === 0) {
      container.innerHTML = `
        <div class="ms-empty-state">
          <p>No tasks planned. Add what matters today.</p>
          <button class="ms-btn-primary" id="today-empty-add-btn">+ Add First Task</button>
        </div>
      `;
      document.getElementById('today-empty-add-btn')?.addEventListener('click', () => this.openTaskModal());
      return;
    }

    // Split into NOW, NEXT, LATER
    const activeTask = tasks.find(t => t.status === 'ACTIVE');
    const nonActiveTasks = tasks.filter(t => t.status !== 'ACTIVE');

    const nextTask = !activeTask && nonActiveTasks.length > 0 ? nonActiveTasks[0] : (activeTask && nonActiveTasks.length > 0 ? nonActiveTasks[0] : null);
    const laterTasks = nonActiveTasks.filter(t => t !== nextTask);

    let html = '';

    // 1. NOW SECTION
    if (activeTask) {
      html += `
        <div class="ms-group-title group-now">▶ NOW (Active Task)</div>
        <div class="ms-task-list" id="group-now-list">
          ${this.renderTaskCardHtml(activeTask, projectMap, 1, true)}
        </div>
      `;
    }

    // 2. NEXT SECTION
    if (nextTask) {
      html += `
        <div class="ms-group-title">NEXT (Up Next in Execution Order)</div>
        <div class="ms-task-list" id="group-next-list">
          ${this.renderTaskCardHtml(nextTask, projectMap, activeTask ? 2 : 1, false)}
        </div>
      `;
    }

    // 3. LATER SECTION
    if (laterTasks.length > 0) {
      html += `
        <div class="ms-group-title">LATER (Execution Sequence)</div>
        <div class="ms-task-list" id="group-later-list">
          ${laterTasks.map((t, idx) => this.renderTaskCardHtml(t, projectMap, (activeTask ? 2 : 1) + (nextTask ? 1 : 0) + idx, false)).join('')}
        </div>
      `;
    }

    container.innerHTML = html;
    this.attachTaskEvents(container);
  }

  renderTaskCardHtml(task, projectMap, displaySeq, isActive) {
    const seqStr = String(displaySeq).padStart(2, '0');
    const projectName = task.projectId ? projectMap.get(task.projectId) : null;

    let resumeHtml = '';
    if (task.status === 'PAUSED' && (task.stoppedReason || task.nextAction)) {
      resumeHtml = `
        <div class="ms-task-context-preview">
          ${task.stoppedReason ? `<strong>Stopped:</strong> ${task.stoppedReason}` : ''}
          ${task.nextAction ? ` · <strong>Next:</strong> ${task.nextAction}` : ''}
        </div>
      `;
    }

    return `
      <div class="ms-task-card ${isActive ? 'is-active-task' : ''}" data-task-id="${task.id}" draggable="true">
        <div class="ms-task-seq">${seqStr}</div>
        <div class="ms-task-body">
          <div class="ms-task-title">${this.escapeHtml(task.title)}</div>
          <div class="ms-task-meta">
            <span class="ms-badge badge-${task.priority.toLowerCase()}">${task.priority}</span>
            <span class="ms-badge badge-urgency urgency-${task.urgency}">${task.urgency.replace('_', ' ')}</span>
            ${projectName ? `<span class="ms-badge badge-project">${this.escapeHtml(projectName)}</span>` : ''}
          </div>
          ${resumeHtml}
        </div>
        <div class="ms-task-actions">
          ${isActive 
            ? `<button class="ms-btn-continue" data-action="open-focus" data-id="${task.id}">Continue</button>`
            : `<button class="ms-btn-start" data-action="start-task" data-id="${task.id}">Start</button>`
          }
          <button class="ms-icon-btn" data-action="edit-task" data-id="${task.id}" title="Edit Task"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
        </div>
      </div>
    `;
  }

  attachTaskEvents(container) {
    // Buttons inside task cards
    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');

        if (action === 'open-focus') {
          this.switchScreen('focus');
        } else if (action === 'start-task') {
          await this.requestStartTask(id);
        } else if (action === 'edit-task') {
          this.openTaskModal(id);
        }
      });
    });

    // Drag & Drop
    const cards = container.querySelectorAll('.ms-task-card');
    cards.forEach(card => {
      card.addEventListener('dragstart', (e) => {
        this.draggedTaskId = card.getAttribute('data-task-id');
        card.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
        cards.forEach(c => c.classList.remove('drag-over'));
      });

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        card.classList.add('drag-over');
      });

      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over');
      });

      card.addEventListener('drop', async (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');
        const targetId = card.getAttribute('data-task-id');
        if (!this.draggedTaskId || this.draggedTaskId === targetId) return;

        await this.handleDropReorder(this.draggedTaskId, targetId);
      });
    });
  }

  async handleDropReorder(draggedId, targetId) {
    const tasks = await tasksRepo.getTodayTasks();
    const draggedIndex = tasks.findIndex(t => t.id === draggedId);
    const targetIndex = tasks.findIndex(t => t.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Move in array
    const [movedTask] = tasks.splice(draggedIndex, 1);
    tasks.splice(targetIndex, 0, movedTask);

    // Persist new sequence IDs
    const orderedIds = tasks.map(t => t.id);
    await tasksRepo.reorder(orderedIds);
    await this.renderTodayScreen();
  }

  async requestStartTask(taskId) {
    const currentActive = await tasksRepo.getActive();
    if (currentActive && currentActive.id !== taskId) {
      // Intentional friction modal
      this.pendingSwitchTaskId = taskId;
      document.getElementById('switch-current-name').textContent = currentActive.title;
      const targetTask = await tasksRepo.getById(taskId);
      document.getElementById('switch-target-name').textContent = targetTask?.title || '';
      document.getElementById('modal-switch-confirm').classList.add('open');
      return;
    }

    await this.executeStartTask(taskId);
  }

  async executeStartTask(taskId) {
    await tasksRepo.start(taskId);
    await this.refreshState();
    this.startTimer();
    this.switchScreen('focus');
  }

  // ==========================================
  // SCREEN 2: FOCUS VIEW
  // ==========================================
  async renderFocusScreen() {
    const container = document.getElementById('focus-view-container');
    if (!container) return;

    this.activeTask = await tasksRepo.getActive();

    if (!this.activeTask) {
      container.innerHTML = `
        <div class="ms-empty-state" style="max-width:540px;margin:60px auto;">
          <h2 style="margin-bottom:12px;color:var(--ms-text);">No Active Task</h2>
          <p>Select a task from your Today list and click Start to enter deep focus mode.</p>
          <button class="ms-btn-primary" id="focus-go-today-btn">Go to Today List</button>
        </div>
      `;
      document.getElementById('focus-go-today-btn')?.addEventListener('click', () => this.switchScreen('today'));
      this.stopTimer();
      return;
    }

    const project = await projectsRepo.getById(this.activeTask.projectId);

    let resumeBannerHtml = '';
    if (this.activeTask.stoppedReason) {
      resumeBannerHtml = `
        <div class="ms-focus-resume-banner">
          <div><strong>LAST TIME:</strong> ${this.escapeHtml(this.activeTask.stoppedReason)}</div>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="ms-focus-container">
        <div>
          <div class="ms-focus-project">${project ? this.escapeHtml(project.name) : 'FOCUS'}</div>
          <h1 class="ms-focus-title">${this.escapeHtml(this.activeTask.title)}</h1>
          <div class="ms-focus-badges">
            <span class="ms-badge badge-${this.activeTask.priority.toLowerCase()}">${this.activeTask.priority}</span>
            <span class="ms-badge badge-urgency urgency-${this.activeTask.urgency}">${this.activeTask.urgency.replace('_', ' ')}</span>
          </div>
        </div>

        ${resumeBannerHtml}

        <div class="ms-focus-action-box">
          <div class="ms-focus-action-label">Next Action</div>
          <input 
            type="text" 
            class="ms-focus-action-input" 
            id="focus-next-action-input" 
            placeholder="What is the very next physical action? (e.g. Inspect webhook logs)" 
            value="${this.escapeHtml(this.activeTask.nextAction || '')}"
          />
        </div>

        <div class="ms-focus-timer-wrap">
          <div class="ms-focus-timer" id="focus-timer-display">00:00</div>
          <div class="ms-focus-timer-hint">Active Session Elapsed Time</div>
        </div>

        <div class="ms-focus-controls">
          <button class="ms-btn-secondary" id="focus-capture-btn">
            Capture Thought <span class="ms-kbd-hint">⌘K</span>
          </button>
          <button class="ms-btn-secondary" id="focus-pause-btn">
            Pause Task
          </button>
          <button class="ms-btn-primary" id="focus-finish-btn">
            Finish Task
          </button>
        </div>
      </div>
    `;

    // Next action live save
    const nextActionInput = document.getElementById('focus-next-action-input');
    nextActionInput?.addEventListener('input', (e) => {
      if (this.activeTask) {
        this.activeTask.nextAction = e.target.value;
        tasksRepo.update(this.activeTask.id, { nextAction: e.target.value });
      }
    });

    document.getElementById('focus-capture-btn')?.addEventListener('click', () => this.openCommandPalette());
    document.getElementById('focus-pause-btn')?.addEventListener('click', () => this.openShutdownModal());
    document.getElementById('focus-finish-btn')?.addEventListener('click', () => this.finishActiveTask());

    this.startTimer();
    this.updateTimerDisplay();
  }

  startTimer() {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      this.updateTimerDisplay();
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  async updateTimerDisplay() {
    const timerEl = document.getElementById('focus-timer-display');
    if (!timerEl || !this.activeTask) return;

    const totalSeconds = await sessionsRepo.getTaskTotalElapsed(this.activeTask.id);
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    let timeStr = '';
    if (hrs > 0) {
      timeStr = `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    } else {
      timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    timerEl.textContent = timeStr;
  }

  async finishActiveTask() {
    if (!this.activeTask) return;
    const finishedTitle = this.activeTask.title;
    await tasksRepo.complete(this.activeTask.id);
    this.stopTimer();
    this.activeTask = null;
    await this.refreshState();
    this.switchScreen('today');
  }

  // ==========================================
  // SCREEN 3: INBOX / THOUGHTS
  // ==========================================
  async renderInboxScreen() {
    const container = document.getElementById('inbox-container');
    if (!container) return;

    const thoughts = await thoughtsRepo.getAll(false);

    if (thoughts.length === 0) {
      container.innerHTML = `
        <div class="ms-empty-state">
          <p>Inbox is clear. No distracting thoughts captured.</p>
          <button class="ms-btn-primary" id="inbox-empty-add-btn">Capture a Thought</button>
        </div>
      `;
      document.getElementById('inbox-empty-add-btn')?.addEventListener('click', () => this.openCommandPalette());
      return;
    }

    container.innerHTML = `
      <div class="ms-inbox-list">
        ${thoughts.map(th => `
          <div class="ms-thought-card" data-thought-id="${th.id}">
            <div class="ms-thought-body">
              <div class="ms-thought-text">${this.escapeHtml(th.text)}</div>
              <div class="ms-thought-time">${new Date(th.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            <div class="ms-thought-actions">
              <button class="ms-btn-primary" style="font-size:0.75rem;padding:6px 10px;" data-action="convert-thought" data-id="${th.id}">
                Convert to Task
              </button>
              <button class="ms-icon-btn" data-action="resolve-thought" data-id="${th.id}" title="Mark Resolved">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </button>
              <button class="ms-btn-danger" data-action="delete-thought" data-id="${th.id}" title="Delete">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');

        if (action === 'resolve-thought') {
          await thoughtsRepo.resolve(id, true);
          await this.refreshState();
        } else if (action === 'delete-thought') {
          await thoughtsRepo.delete(id);
          await this.refreshState();
        } else if (action === 'convert-thought') {
          this.openConvertThoughtModal(id);
        }
      });
    });
  }

  // ==========================================
  // SCREEN 4: PROJECTS
  // ==========================================
  async renderProjectsScreen() {
    const container = document.getElementById('projects-container');
    if (!container) return;

    const projects = await projectsRepo.getAll(false);
    const tasks = await tasksRepo.getAll({ excludeCompleted: true });

    const counts = {};
    for (const t of tasks) {
      if (t.projectId) {
        counts[t.projectId] = (counts[t.projectId] || 0) + 1;
      }
    }

    container.innerHTML = `
      <div class="ms-projects-grid">
        ${projects.map(p => {
          const taskCount = counts[p.id] || 0;
          return `
            <div class="ms-project-card" data-project-id="${p.id}">
              <div class="ms-project-name">${this.escapeHtml(p.name)}</div>
              <div class="ms-project-count">${taskCount} active task${taskCount === 1 ? '' : 's'}</div>
              <div style="margin-top:14px;display:flex;gap:8px;">
                <button class="ms-btn-secondary" style="font-size:0.75rem;padding:4px 8px;" data-action="filter-project" data-id="${p.id}">
                  View Tasks
                </button>
                <button class="ms-icon-btn" style="font-size:0.75rem;padding:4px 8px;" data-action="archive-project" data-id="${p.id}" title="Archive">
                  Archive
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');

        if (action === 'filter-project') {
          this.projectFilter = id;
          this.switchScreen('today');
        } else if (action === 'archive-project') {
          await projectsRepo.archive(id, true);
          await this.refreshState();
        }
      });
    });
  }

  // ==========================================
  // MODALS & ACTIONS
  // ==========================================
  bindGlobalEvents() {
    // Navigation buttons
    document.querySelectorAll('.ms-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const screen = btn.getAttribute('data-screen');
        if (screen) this.switchScreen(screen);
      });
    });

    // Header Quick Action Buttons
    document.getElementById('header-capture-btn')?.addEventListener('click', () => this.openCommandPalette());
    document.getElementById('header-add-task-btn')?.addEventListener('click', () => this.openTaskModal());
    document.getElementById('header-sync-btn')?.addEventListener('click', () => this.openSyncModal());
    document.getElementById('btn-new-project')?.addEventListener('click', () => this.openProjectModal());

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      // 1. Cmd/Ctrl + K -> Open Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.openCommandPalette();
        return;
      }

      // 2. Escape -> Close Modals
      if (e.key === 'Escape') {
        this.closeAllModals();
        return;
      }

      // 3. Cmd/Ctrl + Enter -> Submit active modal form
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        const openModal = document.querySelector('.ms-modal-backdrop.open');
        if (openModal) {
          e.preventDefault();
          const submitBtn = openModal.querySelector('[data-submit-modal]');
          if (submitBtn) submitBtn.click();
        }
      }
    });
  }

  bindModalEvents() {
    // Close modal backdrops when clicking overlay or close buttons
    document.querySelectorAll('.ms-modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) this.closeAllModals();
      });
      backdrop.querySelectorAll('.ms-modal-close, [data-close-modal]').forEach(closeBtn => {
        closeBtn.addEventListener('click', () => this.closeAllModals());
      });
    });

    // 1. Switch Task Confirmation
    document.getElementById('btn-confirm-switch')?.addEventListener('click', async () => {
      if (this.pendingSwitchTaskId) {
        const targetId = this.pendingSwitchTaskId;
        this.pendingSwitchTaskId = null;
        this.closeAllModals();
        await this.executeStartTask(targetId);
      }
    });

    // 2. Save Task Form
    document.getElementById('form-task')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveTaskForm();
    });

    // 3. Save Project Form
    document.getElementById('form-project')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('project-name-input');
      const name = nameInput.value.trim();
      if (name) {
        await projectsRepo.create(name);
        nameInput.value = '';
        this.closeAllModals();
        await this.refreshState();
      }
    });

    // 4. Shutdown / Pause Task Form
    document.getElementById('form-shutdown')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!this.activeTask) return;
      const stoppedReason = document.getElementById('shutdown-stopped-input').value;
      const nextAction = document.getElementById('shutdown-next-input').value;

      await tasksRepo.pause(this.activeTask.id, stoppedReason, nextAction);
      this.stopTimer();
      this.activeTask = null;
      this.closeAllModals();
      await this.refreshState();
      this.switchScreen('today');
    });

    // 5. Convert Thought to Task Form
    document.getElementById('form-convert-thought')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const thoughtId = document.getElementById('convert-thought-id').value;
      const title = document.getElementById('convert-thought-title').value;
      const projectId = document.getElementById('convert-thought-project').value;
      const priority = document.getElementById('convert-thought-priority').value;
      const urgency = document.getElementById('convert-thought-urgency').value;

      await thoughtsRepo.convertToTask(thoughtId, { title, projectId, priority, urgency });
      this.closeAllModals();
      await this.refreshState();
      this.switchScreen('today');
    });

    // 6. Command Palette
    this.bindCommandPaletteEvents();

    // 7. Sync Modal Events
    this.bindSyncModalEvents();
  }

  // Task Creation / Editing Modal
  async openTaskModal(taskId = null) {
    const modal = document.getElementById('modal-task');
    const titleInput = document.getElementById('task-title-input');
    const projectSelect = document.getElementById('task-project-select');
    const prioritySelect = document.getElementById('task-priority-select');
    const urgencySelect = document.getElementById('task-urgency-select');
    const idInput = document.getElementById('task-id-hidden');

    // Populate projects
    const projects = await projectsRepo.getAll(false);
    projectSelect.innerHTML = `
      <option value="">(No Project)</option>
      ${projects.map(p => `<option value="${p.id}">${this.escapeHtml(p.name)}</option>`).join('')}
    `;

    if (taskId) {
      const task = await tasksRepo.getById(taskId);
      if (!task) return;
      document.getElementById('modal-task-heading').textContent = 'Edit Task';
      idInput.value = task.id;
      titleInput.value = task.title;
      projectSelect.value = task.projectId || '';
      prioritySelect.value = task.priority || 'P1';
      urgencySelect.value = task.urgency || 'TODAY';
    } else {
      document.getElementById('modal-task-heading').textContent = '+ Add Task';
      idInput.value = '';
      titleInput.value = '';
      projectSelect.value = this.projectFilter || '';
      prioritySelect.value = 'P1';
      urgencySelect.value = 'TODAY';
    }

    modal.classList.add('open');
    setTimeout(() => titleInput.focus(), 50);
  }

  async saveTaskForm() {
    const id = document.getElementById('task-id-hidden').value;
    const title = document.getElementById('task-title-input').value.trim();
    const projectId = document.getElementById('task-project-select').value || null;
    const priority = document.getElementById('task-priority-select').value;
    const urgency = document.getElementById('task-urgency-select').value;

    if (!title) return;

    if (id) {
      await tasksRepo.update(id, { title, projectId, priority, urgency });
    } else {
      await tasksRepo.create({ title, projectId, priority, urgency });
    }

    this.closeAllModals();
    await this.refreshState();
  }

  // Shutdown / Pause Modal
  openShutdownModal() {
    if (!this.activeTask) return;
    const modal = document.getElementById('modal-shutdown');
    document.getElementById('shutdown-stopped-input').value = this.activeTask.stoppedReason || '';
    document.getElementById('shutdown-next-input').value = this.activeTask.nextAction || '';
    modal.classList.add('open');
    setTimeout(() => document.getElementById('shutdown-stopped-input').focus(), 50);
  }

  // Convert Thought Modal
  async openConvertThoughtModal(thoughtId) {
    const thought = await thoughtsRepo.getAll(true).then(arr => arr.find(t => t.id === thoughtId));
    if (!thought) return;

    const modal = document.getElementById('modal-convert-thought');
    document.getElementById('convert-thought-id').value = thought.id;
    document.getElementById('convert-thought-title').value = thought.text;

    const projectSelect = document.getElementById('convert-thought-project');
    const projects = await projectsRepo.getAll(false);
    projectSelect.innerHTML = `
      <option value="">(No Project)</option>
      ${projects.map(p => `<option value="${p.id}">${this.escapeHtml(p.name)}</option>`).join('')}
    `;

    modal.classList.add('open');
    setTimeout(() => document.getElementById('convert-thought-title').focus(), 50);
  }

  openProjectModal() {
    const modal = document.getElementById('modal-project');
    modal.classList.add('open');
    setTimeout(() => document.getElementById('project-name-input').focus(), 50);
  }

  // ==========================================
  // COMMAND PALETTE / QUICK CAPTURE (Cmd+K)
  // ==========================================
  openCommandPalette() {
    const modal = document.getElementById('modal-palette');
    const input = document.getElementById('palette-input');
    input.value = '';
    modal.classList.add('open');
    setTimeout(() => input.focus(), 50);
  }

  bindCommandPaletteEvents() {
    const input = document.getElementById('palette-input');
    const optionsContainer = document.getElementById('palette-options');

    input?.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        const text = input.value.trim();
        if (text) {
          // Instant capture thought
          await thoughtsRepo.capture(text);
          this.closeAllModals();
          await this.updateNavBadges();
          if (this.currentScreen === 'inbox') {
            await this.renderInboxScreen();
          }
          // Note: Does not change active screen, preserving user focus immediately
        }
      }
    });

    optionsContainer?.querySelectorAll('.ms-palette-item').forEach(item => {
      item.addEventListener('click', async () => {
        const action = item.getAttribute('data-action');
        this.closeAllModals();

        if (action === 'goto-today') this.switchScreen('today');
        else if (action === 'goto-focus') this.switchScreen('focus');
        else if (action === 'goto-inbox') this.switchScreen('inbox');
        else if (action === 'goto-projects') this.switchScreen('projects');
        else if (action === 'new-task') this.openTaskModal();
        else if (action === 'sync-modal') this.openSyncModal();
        else if (action === 'pause-task') this.openShutdownModal();
        else if (action === 'finish-task') this.finishActiveTask();
      });
    });
  }

  // ==========================================
  // SYNC & BACKUP MODAL
  // ==========================================
  openSyncModal() {
    const modal = document.getElementById('modal-sync');
    modal.classList.add('open');
    // Generate QR snapshot preview by default
    const qrContainer = document.getElementById('qr-snapshot-container');
    p2pSync.generateQRSnapshot(qrContainer);
  }

  bindSyncModalEvents() {
    // 1. Download JSON Backup
    document.getElementById('btn-export-json')?.addEventListener('click', () => {
      p2pSync.downloadBackupFile();
    });

    // 2. Import JSON Backup
    const fileInput = document.getElementById('import-json-file');
    document.getElementById('btn-import-json-trigger')?.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput?.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files[0]) {
        try {
          await p2pSync.importBackupFile(e.target.files[0]);
          alert('Backup restored successfully!');
          this.closeAllModals();
          await this.refreshState();
        } catch (err) {
          alert('Error restoring backup: ' + err.message);
        }
      }
    });

    // 3. Import QR code text snapshot
    document.getElementById('btn-import-qr-string')?.addEventListener('click', async () => {
      const str = prompt('Paste scanned QR code data string:');
      if (str) {
        try {
          await p2pSync.importFromQRString(str.trim());
          alert('Snapshot imported successfully!');
          this.closeAllModals();
          await this.refreshState();
        } catch (err) {
          alert('Error importing QR snapshot: ' + err.message);
        }
      }
    });

    // 4. WebRTC P2P Live Sync Button
    document.getElementById('btn-start-p2p')?.addEventListener('click', async () => {
      const statusEl = document.getElementById('p2p-status');
      const p2pQrContainer = document.getElementById('p2p-qr-container');
      statusEl.textContent = 'Generating pairing signal...';

      await p2pSync.createOffer(
        (signal) => {
          statusEl.textContent = 'Scan this pairing QR code with your mobile device:';
          p2pQrContainer.innerHTML = '';
          if (window.QRCode) {
            new window.QRCode(p2pQrContainer, {
              text: 'MSP2P:' + signal,
              width: 200,
              height: 200
            });
          }
        },
        async (status) => {
          if (status === 'connected') {
            statusEl.textContent = 'Device connected! Syncing...';
          } else if (status === 'sync_success') {
            statusEl.textContent = 'Sync complete';
            await this.refreshState();
          }
        }
      );
    });

    // 5. Destructive Cleanup
    document.getElementById('btn-reset-db')?.addEventListener('click', async () => {
      if (confirm('Are you sure you want to permanently clear all local data and reset default compartments? This action cannot be undone.')) {
        await backupRepo.clearAllData();
        this.closeAllModals();
        await this.refreshState();
        this.switchScreen('today');
        alert('Database cleared and reset.');
      }
    });
  }

  closeAllModals() {
    document.querySelectorAll('.ms-modal-backdrop').forEach(el => el.classList.remove('open'));
  }

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

// Instantiate and start app on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new MindShieldApp();
  window.mindShieldApp = app;
  app.init();
});
