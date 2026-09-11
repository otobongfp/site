/**
 * Mind Shield - IndexedDB Layer (Dexie.js)
 * Clean schema definition and database instance.
 */

// Initialize Dexie database
const db = new Dexie('MindShieldDB');

// Define database schema
db.version(1).stores({
  projects: 'id, name, archived, createdAt, updatedAt',
  tasks: 'id, projectId, priority, urgency, sequence, status, createdAt, updatedAt, completedAt',
  focusSessions: 'id, taskId, status, startedAt, endedAt',
  thoughts: 'id, resolved, createdAt'
});

// Helper for generating standard UUID v4
export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default db;
