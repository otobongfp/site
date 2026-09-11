/**
 * Mind Shield - Consolidated Universal Bundle
 * Works seamlessly across file://, http://, https://, and all browser environments.
 */

(function () {
  'use strict';

  // Ensure Dexie is available
  const Dexie = window.Dexie;
  if (!Dexie) {
    console.error('Dexie library is not loaded. Ensure dexie.min.js is included before this script.');
  }

  // 1. DATABASE LAYER
  const db = new Dexie('MindShieldDB');
  db.version(1).stores({
    projects: 'id, name, archived, createdAt, updatedAt',
    tasks: 'id, projectId, priority, urgency, sequence, status, createdAt, updatedAt, completedAt',
    focusSessions: 'id, taskId, status, startedAt, endedAt',
    thoughts: 'id, resolved, createdAt'
  });

  function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // 2. REPOSITORIES LAYER
  const projectsRepo = {
    async getAll(includeArchived = false) {
      const all = await db.projects.toArray();
      if (!includeArchived) {
        return all.filter(p => !p.archived).sort((a, b) => a.name.localeCompare(b.name));
      }
      return all.sort((a, b) => a.name.localeCompare(b.name));
    },

    async getById(id) {
      if (!id) return null;
      return await db.projects.get(id);
    },

    async create(name) {
      const trimmed = (name || '').trim();
      if (!trimmed) throw new Error('Project name cannot be empty');

      const project = {
        id: generateId(),
        name: trimmed,
        archived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await db.projects.add(project);
      return project;
    },

    async update(id, updates) {
      const existing = await db.projects.get(id);
      if (!existing) throw new Error('Project not found');

      const updated = {
        ...updates,
        updatedAt: new Date().toISOString()
      };
      await db.projects.update(id, updated);
      return await db.projects.get(id);
    },

    async archive(id, archived = true) {
      return await this.update(id, { archived });
    },

    async delete(id) {
      const tasksCount = await db.tasks.where('projectId').equals(id).count();
      if (tasksCount > 0) {
        return await this.archive(id, true);
      }
      return await db.projects.delete(id);
    },

    async seedDefaultsIfEmpty() {
      const defaults = ['Mindshare', 'Esca', 'Kulawise', '1024', 'Personal'];
      const existing = await db.projects.toArray();
      const existingNames = new Set(existing.map(p => p.name.toLowerCase()));
      for (const name of defaults) {
        if (!existingNames.has(name.toLowerCase())) {
          await this.create(name);
        }
      }
    }
  };

  const tasksRepo = {
    async getAll(filter = {}) {
      let tasks = await db.tasks.toArray();
      if (filter.status) {
        tasks = tasks.filter(t => t.status === filter.status);
      }
      if (filter.projectId) {
        tasks = tasks.filter(t => t.projectId === filter.projectId);
      }
      if (filter.excludeCompleted) {
        tasks = tasks.filter(t => t.status !== 'COMPLETED');
      }
      return tasks.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    },

    async getTodayTasks() {
      const tasks = await db.tasks
        .filter(t => t.status !== 'COMPLETED')
        .toArray();

      return tasks.sort((a, b) => (a.sequence ?? 9999) - (b.sequence ?? 9999));
    },

    async getById(id) {
      if (!id) return null;
      return await db.tasks.get(id);
    },

    async getActive() {
      return await db.tasks.filter(t => t.status === 'ACTIVE').first();
    },

    async create({
      title,
      projectId,
      priority = 'P1',
      urgency = 'TODAY',
      description = '',
      nextAction = ''
    }) {
      const trimmedTitle = (title || '').trim();
      if (!trimmedTitle) throw new Error('Task title cannot be empty');

      const allTasks = await db.tasks.toArray();
      const maxSeq = allTasks.reduce((max, t) => Math.max(max, t.sequence || 0), 0);

      const task = {
        id: generateId(),
        projectId: projectId || null,
        title: trimmedTitle,
        description: (description || '').trim(),
        priority: ['P0', 'P1', 'P2'].includes(priority) ? priority : 'P1',
        urgency: ['NOW', 'TODAY', 'THIS_WEEK', 'LATER'].includes(urgency) ? urgency : 'TODAY',
        sequence: maxSeq + 1,
        status: 'NEXT',
        nextAction: (nextAction || '').trim(),
        stoppedReason: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null
      };

      await db.tasks.add(task);
      return task;
    },

    async update(id, updates) {
      const existing = await db.tasks.get(id);
      if (!existing) throw new Error('Task not found');

      const updated = {
        ...updates,
        updatedAt: new Date().toISOString()
      };
      await db.tasks.update(id, updated);
      return await db.tasks.get(id);
    },

    async reorder(orderedIds) {
      if (!Array.isArray(orderedIds)) return;

      await db.transaction('rw', db.tasks, async () => {
        for (let i = 0; i < orderedIds.length; i++) {
          const id = orderedIds[i];
          await db.tasks.update(id, {
            sequence: i + 1,
            updatedAt: new Date().toISOString()
          });
        }
      });
    },

    async start(taskId) {
      const task = await db.tasks.get(taskId);
      if (!task) throw new Error('Task not found');

      await db.transaction('rw', [db.tasks, db.focusSessions], async () => {
        const activeTasks = await db.tasks.filter(t => t.status === 'ACTIVE' && t.id !== taskId).toArray();
        for (const at of activeTasks) {
          await db.tasks.update(at.id, {
            status: 'PAUSED',
            updatedAt: new Date().toISOString()
          });
        }

        await db.tasks.update(taskId, {
          status: 'ACTIVE',
          updatedAt: new Date().toISOString()
        });

        await sessionsRepo.start(taskId);
      });

      return await db.tasks.get(taskId);
    },

    async pause(taskId, stoppedReason = '', nextAction = '') {
      const task = await db.tasks.get(taskId);
      if (!task) throw new Error('Task not found');

      await db.transaction('rw', [db.tasks, db.focusSessions], async () => {
        const updates = {
          status: 'PAUSED',
          updatedAt: new Date().toISOString()
        };
        if (stoppedReason) updates.stoppedReason = stoppedReason.trim();
        if (nextAction) updates.nextAction = nextAction.trim();

        await db.tasks.update(taskId, updates);
        await sessionsRepo.pause();
      });

      return await db.tasks.get(taskId);
    },

    async complete(taskId) {
      const task = await db.tasks.get(taskId);
      if (!task) throw new Error('Task not found');

      await db.transaction('rw', [db.tasks, db.focusSessions], async () => {
        await db.tasks.update(taskId, {
          status: 'COMPLETED',
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        await sessionsRepo.finish();
      });

      return await db.tasks.get(taskId);
    },

    async delete(id) {
      await db.transaction('rw', [db.tasks, db.focusSessions], async () => {
        await db.focusSessions.where('taskId').equals(id).delete();
        await db.tasks.delete(id);
      });
    }
  };

  const sessionsRepo = {
    async getActive() {
      return await db.focusSessions.filter(s => s.status === 'ACTIVE').first();
    },

    async getByTaskId(taskId) {
      return await db.focusSessions.where('taskId').equals(taskId).toArray();
    },

    async start(taskId) {
      const active = await this.getActive();
      if (active) {
        await this.pause();
      }

      const now = new Date().toISOString();
      const session = {
        id: generateId(),
        taskId,
        startedAt: now,
        endedAt: null,
        accumulatedSeconds: 0,
        status: 'ACTIVE'
      };

      await db.focusSessions.add(session);
      return session;
    },

    async pause() {
      const active = await this.getActive();
      if (!active) return null;

      const now = new Date();
      const start = new Date(active.startedAt);
      const sessionSeconds = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
      const totalAccumulated = (active.accumulatedSeconds || 0) + sessionSeconds;

      await db.focusSessions.update(active.id, {
        status: 'PAUSED',
        endedAt: now.toISOString(),
        accumulatedSeconds: totalAccumulated
      });

      return await db.focusSessions.get(active.id);
    },

    async finish() {
      const active = await this.getActive();
      if (!active) return null;

      const now = new Date();
      const start = new Date(active.startedAt);
      const sessionSeconds = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
      const totalAccumulated = (active.accumulatedSeconds || 0) + sessionSeconds;

      await db.focusSessions.update(active.id, {
        status: 'COMPLETED',
        endedAt: now.toISOString(),
        accumulatedSeconds: totalAccumulated
      });

      return await db.focusSessions.get(active.id);
    },

    async getTaskTotalElapsed(taskId) {
      const sessions = await db.focusSessions.where('taskId').equals(taskId).toArray();
      let total = 0;
      const now = Date.now();

      for (const s of sessions) {
        if (s.status === 'ACTIVE') {
          const start = new Date(s.startedAt).getTime();
          const diff = Math.max(0, Math.floor((now - start) / 1000));
          total += (s.accumulatedSeconds || 0) + diff;
        } else {
          total += s.accumulatedSeconds || 0;
        }
      }
      return total;
    }
  };

  const thoughtsRepo = {
    async getAll(includeResolved = false) {
      const thoughts = await db.thoughts.toArray();
      if (!includeResolved) {
        return thoughts.filter(t => !t.resolved).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
      return thoughts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    async capture(text) {
      const trimmed = (text || '').trim();
      if (!trimmed) throw new Error('Thought text cannot be empty');

      const thought = {
        id: generateId(),
        text: trimmed,
        createdAt: new Date().toISOString(),
        resolved: false
      };

      await db.thoughts.add(thought);
      return thought;
    },

    async resolve(id, resolved = true) {
      await db.thoughts.update(id, { resolved });
      return await db.thoughts.get(id);
    },

    async delete(id) {
      await db.thoughts.delete(id);
    },

    async convertToTask(thoughtId, taskData) {
      const thought = await db.thoughts.get(thoughtId);
      if (!thought) throw new Error('Thought not found');

      const createdTask = await tasksRepo.create({
        title: taskData.title || thought.text,
        projectId: taskData.projectId,
        priority: taskData.priority || 'P1',
        urgency: taskData.urgency || 'TODAY',
        description: taskData.description || `Captured from distraction: "${thought.text}"`,
        nextAction: taskData.nextAction || ''
      });

      await db.thoughts.update(thoughtId, { resolved: true });
      return createdTask;
    }
  };

  const backupRepo = {
    async exportData() {
      const [projects, tasks, focusSessions, thoughts] = await Promise.all([
        db.projects.toArray(),
        db.tasks.toArray(),
        db.focusSessions.toArray(),
        db.thoughts.toArray()
      ]);

      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        data: {
          projects,
          tasks,
          focusSessions,
          thoughts
        }
      };
    },

    async importData(payload) {
      if (!payload || !payload.data) {
        throw new Error('Invalid Mind Shield backup payload');
      }

      const { projects = [], tasks = [], focusSessions = [], thoughts = [] } = payload.data;

      await db.transaction('rw', [db.projects, db.tasks, db.focusSessions, db.thoughts], async () => {
        await db.projects.clear();
        await db.tasks.clear();
        await db.focusSessions.clear();
        await db.thoughts.clear();

        if (projects.length > 0) await db.projects.bulkAdd(projects);
        if (tasks.length > 0) await db.tasks.bulkAdd(tasks);
        if (focusSessions.length > 0) await db.focusSessions.bulkAdd(focusSessions);
        if (thoughts.length > 0) await db.thoughts.bulkAdd(thoughts);
      });

      return true;
    },

    async mergeRemoteData(payload) {
      if (!payload || !payload.data) return false;
      const { projects = [], tasks = [], focusSessions = [], thoughts = [] } = payload.data;

      await db.transaction('rw', [db.projects, db.tasks, db.focusSessions, db.thoughts], async () => {
        for (const p of projects) {
          const local = await db.projects.get(p.id);
          if (!local || new Date(p.updatedAt) > new Date(local.updatedAt || 0)) {
            await db.projects.put(p);
          }
        }

        for (const t of tasks) {
          const local = await db.tasks.get(t.id);
          if (!local || new Date(t.updatedAt) > new Date(local.updatedAt || 0)) {
            await db.tasks.put(t);
          }
        }

        for (const s of focusSessions) {
          const local = await db.focusSessions.get(s.id);
          if (!local) {
            await db.focusSessions.put(s);
          }
        }

        for (const th of thoughts) {
          const local = await db.thoughts.get(th.id);
          if (!local || (th.resolved && !local.resolved)) {
            await db.thoughts.put(th);
          }
        }
      });

      return true;
    }
  };

  // 3. P2P SYNC ENGINE
  const p2pSync = {
    peerConnection: null,
    dataChannel: null,

    async downloadBackupFile() {
      const backup = await backupRepo.exportData();
      const jsonStr = JSON.stringify(backup, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mind-shield-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    async importBackupFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const payload = JSON.parse(e.target.result);
            await backupRepo.importData(payload);
            resolve(true);
          } catch (err) {
            reject(new Error('Failed to parse backup file: ' + err.message));
          }
        };
        reader.onerror = () => reject(new Error('Failed to read backup file'));
        reader.readAsText(file);
      });
    },

    async generateQRSnapshot(containerEl) {
      if (!containerEl) return;
      containerEl.innerHTML = '';

      const backup = await backupRepo.exportData();
      const compactData = {
        v: 1,
        t: Date.now(),
        p: backup.data.projects.map(p => ({ id: p.id, n: p.name, a: p.archived ? 1 : 0 })),
        tk: backup.data.tasks.map(t => ({
          id: t.id,
          pId: t.projectId,
          t: t.title,
          pr: t.priority,
          u: t.urgency,
          sq: t.sequence,
          st: t.status,
          na: t.nextAction || '',
          sr: t.stoppedReason || ''
        })),
        th: backup.data.thoughts.filter(th => !th.resolved).map(th => ({ id: th.id, txt: th.text }))
      };

      const payloadString = 'MS1:' + btoa(unescape(encodeURIComponent(JSON.stringify(compactData))));

      if (window.QRCode) {
        new window.QRCode(containerEl, {
          text: payloadString,
          width: 256,
          height: 256,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: window.QRCode.CorrectLevel.M
        });
      } else {
        containerEl.innerHTML = `<textarea readonly style="width:100%;height:140px;font-size:11px;background:#0d0d11;color:#7fffd4;border:1px solid #333;padding:8px;border-radius:6px;">${payloadString}</textarea>`;
      }
    },

    async importFromQRString(str) {
      if (!str || !str.startsWith('MS1:')) {
        throw new Error('Invalid QR snapshot code format');
      }

      try {
        const b64 = str.slice(4);
        const jsonStr = decodeURIComponent(escape(atob(b64)));
        const compact = JSON.parse(jsonStr);

        const projects = (compact.p || []).map(p => ({
          id: p.id,
          name: p.n,
          archived: p.a === 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }));

        const tasks = (compact.tk || []).map(t => ({
          id: t.id,
          projectId: t.pId,
          title: t.t,
          priority: t.pr || 'P1',
          urgency: t.u || 'TODAY',
          sequence: t.sq || 1,
          status: t.st || 'NEXT',
          nextAction: t.na || '',
          stoppedReason: t.sr || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          completedAt: null
        }));

        const thoughts = (compact.th || []).map(th => ({
          id: th.id,
          text: th.txt,
          createdAt: new Date().toISOString(),
          resolved: false
        }));

        const payload = {
          version: 1,
          exportedAt: new Date().toISOString(),
          data: {
            projects,
            tasks,
            focusSessions: [],
            thoughts
          }
        };

        await backupRepo.mergeRemoteData(payload);
        return true;
      } catch (err) {
        throw new Error('Failed to import snapshot: ' + err.message);
      }
    },

    async createOffer(onSignalReady, onStatusChange) {
      this.close();

      const config = {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      };

      this.peerConnection = new RTCPeerConnection(config);
      this.dataChannel = this.peerConnection.createDataChannel('mindShieldSync');

      this._setupDataChannel(onStatusChange);

      this.peerConnection.onicecandidate = (event) => {
        if (!event.candidate && this.peerConnection.localDescription) {
          const offerSignal = btoa(JSON.stringify(this.peerConnection.localDescription));
          onSignalReady(offerSignal);
        }
      };

      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
    },

    async handleAnswer(answerBase64, onStatusChange) {
      if (!this.peerConnection) throw new Error('No active peer connection');
      const answerSdp = JSON.parse(atob(answerBase64));
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answerSdp));
    },

    async joinSession(offerBase64, onSignalReady, onStatusChange) {
      this.close();

      const config = {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      };

      this.peerConnection = new RTCPeerConnection(config);

      this.peerConnection.ondatachannel = (event) => {
        this.dataChannel = event.channel;
        this._setupDataChannel(onStatusChange);
      };

      this.peerConnection.onicecandidate = (event) => {
        if (!event.candidate && this.peerConnection.localDescription) {
          const answerSignal = btoa(JSON.stringify(this.peerConnection.localDescription));
          onSignalReady(answerSignal);
        }
      };

      const offerSdp = JSON.parse(atob(offerBase64));
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offerSdp));

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
    },

    _setupDataChannel(onStatusChange) {
      if (!this.dataChannel) return;

      this.dataChannel.onopen = async () => {
        if (onStatusChange) onStatusChange('connected');
        // Send initial sync payload
        const backup = await backupRepo.exportData();
        this.dataChannel.send(JSON.stringify({ type: 'SYNC_INIT', payload: backup }));
      };

      this.dataChannel.onclose = () => {
        if (onStatusChange) onStatusChange('disconnected');
      };

      this.dataChannel.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'SYNC_INIT') {
            // Merge peer's data
            await backupRepo.mergeRemoteData(msg.payload);
            // Reply with merged local data so peer gets our updates as well (2-way sync)
            const localBackup = await backupRepo.exportData();
            this.dataChannel.send(JSON.stringify({ type: 'SYNC_REPLY', payload: localBackup }));
            if (onStatusChange) onStatusChange('sync_success');
          } else if (msg.type === 'SYNC_REPLY') {
            // Initiator merges the peer's updates
            await backupRepo.mergeRemoteData(msg.payload);
            if (onStatusChange) onStatusChange('sync_success');
          }
        } catch (e) {
          console.error('P2P Message error:', e);
        }
      };
    },

    close() {
      if (this.dataChannel) {
        try { this.dataChannel.close(); } catch (e) {}
        this.dataChannel = null;
      }
      if (this.peerConnection) {
        try { this.peerConnection.close(); } catch (e) {}
        this.peerConnection = null;
      }
    }
  };

  // 4. UI APPLICATION CONTROLLER
  class MindShieldApp {
    constructor() {
      this.currentScreen = 'today';
      this.activeTask = null;
      this.activeSession = null;
      this.timerInterval = null;
      this.projectFilter = null;
      this.draggedTaskId = null;
      this.pendingSwitchTaskId = null;
    }

    async init() {
      try {
        await projectsRepo.seedDefaultsIfEmpty();
      } catch (err) {
        console.warn('DB seed notice:', err);
      }

      this.bindGlobalEvents();
      this.bindModalEvents();
      await this.refreshState();

      if (this.activeTask) {
        this.startTimer();
      }
    }

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
      try {
        this.activeTask = await tasksRepo.getActive();
        this.activeSession = await sessionsRepo.getActive();
        await this.updateNavBadges();
        await this.renderCurrentScreen();
      } catch (err) {
        console.error('Error refreshing state:', err);
      }
    }

    async updateNavBadges() {
      try {
        const todayTasks = await tasksRepo.getTodayTasks();
        const thoughts = await thoughtsRepo.getAll(false);

        const todayCountEl = document.getElementById('today-count');
        const inboxCountEl = document.getElementById('inbox-count');

        if (todayCountEl) todayCountEl.textContent = todayTasks.length;
        if (inboxCountEl) inboxCountEl.textContent = thoughts.length;
      } catch (err) {
        console.error('Error updating badges:', err);
      }
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

    // TODAY SCREEN
    async renderTodayScreen() {
      let tasks = await tasksRepo.getTodayTasks();
      const projects = await projectsRepo.getAll(true);
      const projectMap = new Map(projects.map(p => [p.id, p.name]));

      const container = document.getElementById('today-tasks-container');
      if (!container) return;

      if (this.projectFilter) {
        tasks = tasks.filter(t => t.projectId === this.projectFilter);
        const filterName = projectMap.get(this.projectFilter) || 'Project';
        const filterEl = document.getElementById('today-filter-indicator');
        if (filterEl) {
          filterEl.innerHTML = `
            <span>Filtering by: <strong>${filterName}</strong></span>
            <button class="ms-btn-secondary" style="padding:4px 10px;font-size:0.75rem;" id="clear-project-filter">Clear filter</button>
          `;
          document.getElementById('clear-project-filter')?.addEventListener('click', () => {
            this.projectFilter = null;
            document.getElementById('today-filter-indicator').innerHTML = '';
            this.renderTodayScreen();
          });
        }
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

      const activeTask = tasks.find(t => t.status === 'ACTIVE');
      const nonActiveTasks = tasks.filter(t => t.status !== 'ACTIVE');

      const nextTask = !activeTask && nonActiveTasks.length > 0 ? nonActiveTasks[0] : (activeTask && nonActiveTasks.length > 0 ? nonActiveTasks[0] : null);
      const laterTasks = nonActiveTasks.filter(t => t !== nextTask);

      let html = '';

      if (activeTask) {
        html += `
          <div class="ms-group-title group-now">▶ NOW (Active Task)</div>
          <div class="ms-task-list" id="group-now-list">
            ${this.renderTaskCardHtml(activeTask, projectMap, 1, true)}
          </div>
        `;
      }

      if (nextTask) {
        html += `
          <div class="ms-group-title">NEXT (Up Next in Execution Order)</div>
          <div class="ms-task-list" id="group-next-list">
            ${this.renderTaskCardHtml(nextTask, projectMap, activeTask ? 2 : 1, false)}
          </div>
        `;
      }

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
            ${task.stoppedReason ? `<strong>Stopped:</strong> ${this.escapeHtml(task.stoppedReason)}` : ''}
            ${task.nextAction ? ` · <strong>Next:</strong> ${this.escapeHtml(task.nextAction)}` : ''}
          </div>
        `;
      }

      return `
        <div class="ms-task-card ${isActive ? 'is-active-task' : ''}" data-task-id="${task.id}" draggable="true">
          <div class="ms-task-seq">${seqStr}</div>
          <div class="ms-task-body">
            <div class="ms-task-title">${this.escapeHtml(task.title)}</div>
            <div class="ms-task-meta">
              <span class="ms-badge" style="background:rgba(255,255,255,0.06);border:1px solid var(--ms-border);">${seqStr}</span>
              <span class="ms-badge badge-${task.priority.toLowerCase()}">${task.priority}</span>
              <span class="ms-badge badge-urgency urgency-${task.urgency}">${task.urgency.replace('_', ' ')}</span>
              ${projectName ? `<span class="ms-badge badge-project">${this.escapeHtml(projectName)}</span>` : ''}
            </div>
            ${resumeHtml}
          </div>
          <div class="ms-task-actions">
            <button class="ms-icon-btn ms-btn-seq-move" data-action="move-up" data-id="${task.id}" title="Move Up in sequence">↑</button>
            <button class="ms-icon-btn ms-btn-seq-move" data-action="move-down" data-id="${task.id}" title="Move Down in sequence">↓</button>
            ${isActive 
              ? `<button class="ms-btn-continue" data-action="open-focus" data-id="${task.id}">Continue</button>`
              : `<button class="ms-btn-start" data-action="start-task" data-id="${task.id}">Start</button>`
            }
            <button class="ms-icon-btn" data-action="edit-task" data-id="${task.id}" title="Edit Task">✎</button>
          </div>
        </div>
      `;
    }

    attachTaskEvents(container) {
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
          } else if (action === 'move-up') {
            await this.handleStepMove(id, -1);
          } else if (action === 'move-down') {
            await this.handleStepMove(id, 1);
          }
        });
      });

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

      const [movedTask] = tasks.splice(draggedIndex, 1);
      tasks.splice(targetIndex, 0, movedTask);

      const orderedIds = tasks.map(t => t.id);
      await tasksRepo.reorder(orderedIds);
      await this.renderTodayScreen();
    }

    async handleStepMove(taskId, delta) {
      const tasks = await tasksRepo.getTodayTasks();
      const currentIndex = tasks.findIndex(t => t.id === taskId);
      if (currentIndex === -1) return;

      const newIndex = currentIndex + delta;
      if (newIndex < 0 || newIndex >= tasks.length) return;

      const [moved] = tasks.splice(currentIndex, 1);
      tasks.splice(newIndex, 0, moved);

      await tasksRepo.reorder(tasks.map(t => t.id));
      await this.renderTodayScreen();
    }

    async requestStartTask(taskId) {
      const currentActive = await tasksRepo.getActive();
      if (currentActive && currentActive.id !== taskId) {
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

    // FOCUS SCREEN
    async renderFocusScreen() {
      const container = document.getElementById('focus-view-container');
      if (!container) return;

      this.activeTask = await tasksRepo.getActive();

      if (!this.activeTask) {
        container.innerHTML = `
          <div class="ms-empty-state" style="max-width:560px;margin:60px auto;">
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
              ⚡ Capture Thought <span class="ms-kbd-hint">⌘K</span>
            </button>
            <button class="ms-btn-secondary" id="focus-pause-btn">
              ⏸ Pause Task
            </button>
            <button class="ms-btn-primary" id="focus-finish-btn">
              ✓ Finish Task
            </button>
          </div>
        </div>
      `;

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
      await tasksRepo.complete(this.activeTask.id);
      this.stopTimer();
      this.activeTask = null;
      await this.refreshState();
      this.switchScreen('today');
    }

    // INBOX SCREEN
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
                <button class="ms-btn-primary" style="font-size:0.8rem;padding:8px 12px;" data-action="convert-thought" data-id="${th.id}">
                  → Convert to Task
                </button>
                <button class="ms-icon-btn" data-action="resolve-thought" data-id="${th.id}" title="Mark Resolved">
                  ✓
                </button>
                <button class="ms-btn-danger" data-action="delete-thought" data-id="${th.id}" title="Delete">
                  ✕
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

    // PROJECTS SCREEN
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
                <div class="ms-project-actions">
                  <button class="ms-btn-secondary" style="font-size:0.8rem;padding:6px 12px;" data-action="filter-project" data-id="${p.id}">
                    View Tasks
                  </button>
                  <button class="ms-icon-btn" style="font-size:0.8rem;padding:6px 12px;" data-action="archive-project" data-id="${p.id}" title="Archive">
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

    // EVENT LISTENERS & MODALS
    bindGlobalEvents() {
      document.querySelectorAll('.ms-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const screen = btn.getAttribute('data-screen');
          if (screen) this.switchScreen(screen);
        });
      });

      document.getElementById('header-capture-btn')?.addEventListener('click', () => this.openCommandPalette());
      document.getElementById('header-add-task-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.openTaskModal();
      });
      document.getElementById('header-sync-btn')?.addEventListener('click', () => this.openSyncModal());
      document.getElementById('btn-new-project')?.addEventListener('click', () => this.openProjectModal());

      window.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          this.openCommandPalette();
          return;
        }

        if (e.key === 'Escape') {
          this.closeAllModals();
          return;
        }

        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          const openModal = document.querySelector('.ms-modal-backdrop.open');
          if (openModal) {
            e.preventDefault();
            const submitBtn = openModal.querySelector('[data-submit-modal], button[type="submit"]');
            if (submitBtn) submitBtn.click();
          }
        }
      });
    }

    bindModalEvents() {
      document.querySelectorAll('.ms-modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', (e) => {
          if (e.target === backdrop) this.closeAllModals();
        });
        backdrop.querySelectorAll('.ms-modal-close, [data-close-modal]').forEach(closeBtn => {
          closeBtn.addEventListener('click', () => this.closeAllModals());
        });
      });

      document.getElementById('btn-confirm-switch')?.addEventListener('click', async () => {
        if (this.pendingSwitchTaskId) {
          const targetId = this.pendingSwitchTaskId;
          this.pendingSwitchTaskId = null;
          this.closeAllModals();
          await this.executeStartTask(targetId);
        }
      });

      document.getElementById('form-task')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.saveTaskForm();
      });

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

      this.bindCommandPaletteEvents();
      this.bindSyncModalEvents();
    }

    async openTaskModal(taskId = null) {
      const modal = document.getElementById('modal-task');
      if (!modal) return;

      const titleInput = document.getElementById('task-title-input');
      const projectSelect = document.getElementById('task-project-select');
      const prioritySelect = document.getElementById('task-priority-select');
      const urgencySelect = document.getElementById('task-urgency-select');
      const idInput = document.getElementById('task-id-hidden');

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

      if (!title) {
        alert('Please enter a task title');
        return;
      }

      if (id) {
        await tasksRepo.update(id, { title, projectId, priority, urgency });
      } else {
        await tasksRepo.create({ title, projectId, priority, urgency });
      }

      this.closeAllModals();
      await this.refreshState();
    }

    openShutdownModal() {
      if (!this.activeTask) return;
      const modal = document.getElementById('modal-shutdown');
      document.getElementById('shutdown-stopped-input').value = this.activeTask.stoppedReason || '';
      document.getElementById('shutdown-next-input').value = this.activeTask.nextAction || '';
      modal.classList.add('open');
      setTimeout(() => document.getElementById('shutdown-stopped-input').focus(), 50);
    }

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
            await thoughtsRepo.capture(text);
            this.closeAllModals();
            await this.updateNavBadges();
            if (this.currentScreen === 'inbox') {
              await this.renderInboxScreen();
            }
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

    openSyncModal() {
      const modal = document.getElementById('modal-sync');
      modal.classList.add('open');
      const qrContainer = document.getElementById('qr-snapshot-container');
      p2pSync.generateQRSnapshot(qrContainer);
    }

    bindSyncModalEvents() {
      document.getElementById('btn-export-json')?.addEventListener('click', () => {
        p2pSync.downloadBackupFile();
      });

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
              statusEl.textContent = '✓ Sync Complete!';
              await this.refreshState();
            }
          }
        );
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

  // Create global instance
  const app = new MindShieldApp();
  window.mindShieldApp = app;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
  } else {
    app.init();
  }
})();
