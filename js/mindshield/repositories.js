/**
 * Mind Shield - Repositories Layer
 * Clean abstraction layer separating IndexedDB from UI logic.
 */

import db, { generateId } from './database.js';

// ==========================================
// 1. PROJECTS REPOSITORY
// ==========================================
export const projectsRepo = {
  async getAll(includeArchived = false) {
    let collection = db.projects;
    const all = await collection.toArray();
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
    // Check if tasks exist for this project
    const tasksCount = await db.tasks.where('projectId').equals(id).count();
    if (tasksCount > 0) {
      // Soft-archive if has tasks
      return await this.archive(id, true);
    }
    return await db.projects.delete(id);
  },

  async seedDefaultsIfEmpty() {
    const defaults = ['Personal', 'Work', 'Side Projects', 'Learning & Research', 'Admin / Ops'];
    const existing = await db.projects.toArray();
    
    // Clean up legacy unused projects (Mindshare, Esca, Kulawise, 1024, etc.) if they have no tasks
    const legacyNames = new Set(['mindshare', 'esca', 'kulawise', '1024', 'ideas', 'deep work']);
    for (const p of existing) {
      if (legacyNames.has(p.name.toLowerCase())) {
        const taskCount = await db.tasks.where('projectId').equals(p.id).count();
        if (taskCount === 0) {
          await db.projects.delete(p.id);
        }
      }
    }

    const currentProjects = await db.projects.toArray();
    const existingNames = new Set(currentProjects.map(p => p.name.toLowerCase()));
    for (const name of defaults) {
      if (!existingNames.has(name.toLowerCase())) {
        await this.create(name);
      }
    }
  }
};

// ==========================================
// 2. TASKS REPOSITORY
// ==========================================
export const tasksRepo = {
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
    // Return all uncompleted tasks ordered strictly by execution sequence
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

    // Calculate next sequence number
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
      // Pause any currently active task
      const activeTasks = await db.tasks.filter(t => t.status === 'ACTIVE' && t.id !== taskId).toArray();
      for (const at of activeTasks) {
        await db.tasks.update(at.id, {
          status: 'PAUSED',
          updatedAt: new Date().toISOString()
        });
      }

      // Mark this task active
      await db.tasks.update(taskId, {
        status: 'ACTIVE',
        updatedAt: new Date().toISOString()
      });

      // Start focus session
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

// ==========================================
// 3. FOCUS SESSIONS REPOSITORY
// ==========================================
export const sessionsRepo = {
  async getActive() {
    return await db.focusSessions.filter(s => s.status === 'ACTIVE').first();
  },

  async getByTaskId(taskId) {
    return await db.focusSessions.where('taskId').equals(taskId).toArray();
  },

  async start(taskId) {
    // Complete or pause any active session first
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

// ==========================================
// 4. CAPTURED THOUGHTS REPOSITORY
// ==========================================
export const thoughtsRepo = {
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

    // Mark thought as resolved
    await db.thoughts.update(thoughtId, { resolved: true });
    return createdTask;
  }
};

// ==========================================
// 5. BACKUP & SYNC HELPERS
// ==========================================
export const backupRepo = {
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
      // Clear existing records to ensure clean state
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
  },

  async clearAllData() {
    await db.transaction('rw', [db.projects, db.tasks, db.focusSessions, db.thoughts], async () => {
      await db.projects.clear();
      await db.tasks.clear();
      await db.focusSessions.clear();
      await db.thoughts.clear();
    });

    // Re-seed clean standard default compartments
    await projectsRepo.seedDefaultsIfEmpty();
    return true;
  }
};
