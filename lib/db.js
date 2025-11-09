const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'queue.db');

const db = new Database(dbPath);

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      command TEXT NOT NULL,
      state TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs(state);
  `);
}

init();

// CRUD
const enqueueStmt = db.prepare(`INSERT INTO jobs (id, command, state, attempts, max_retries, created_at, updated_at) VALUES (@id, @command, @state, @attempts, @max_retries, @created_at, @updated_at)`);

function enqueue(job) {
  enqueueStmt.run(job);
}

const getPendingForProcessingStmt = db.prepare(`
  SELECT * FROM jobs WHERE state = 'pending' ORDER BY created_at LIMIT 1
`);

const claimJobStmt = db.prepare(`
  UPDATE jobs SET state = 'processing', updated_at = @updated_at WHERE id = @id AND state = 'pending'
`);

const getJobStmt = db.prepare(`SELECT * FROM jobs WHERE id = ?`);

const updateJobStmt = db.prepare(`
  UPDATE jobs SET state = @state, attempts = @attempts, updated_at = @updated_at WHERE id = @id
`);

const setFailedStmt = db.prepare(`
  UPDATE jobs SET state = @state, attempts = @attempts, updated_at = @updated_at WHERE id = @id
`);

const listJobsStmt = db.prepare(`
  SELECT id, command, state, attempts, max_retries, created_at, updated_at FROM jobs
  WHERE state = COALESCE(?, state)
  ORDER BY created_at DESC
`);

const summaryStmt = db.prepare(`
  SELECT
    SUM(CASE WHEN state='pending' THEN 1 ELSE 0 END) as pending,
    SUM(CASE WHEN state='processing' THEN 1 ELSE 0 END) as processing,
    SUM(CASE WHEN state='completed' THEN 1 ELSE 0 END) as completed,
    SUM(CASE WHEN state='failed' THEN 1 ELSE 0 END) as failed,
    SUM(CASE WHEN state='dead' THEN 1 ELSE 0 END) as dead
  FROM jobs
`);

// Select pending then try update, returns job if claimed
function claimPendingJob() {
  const job = getPendingForProcessingStmt.get();
  if (!job) return null;
  const now = new Date().toISOString();
  const info = claimJobStmt.run({ id: job.id, updated_at: now });
  if (info.changes === 1) {
    return getJobStmt.get(job.id);
  }
  return null;
}

function getJob(id) {
  return getJobStmt.get(id);
}

function updateJobState(id, { state, attempts }) {
  const now = new Date().toISOString();
  updateJobStmt.run({ id, state, attempts, updated_at: now });
}

function markFailedOrDead(id, attempts, isDead) {
  const state = isDead ? 'dead' : 'failed';
  const now = new Date().toISOString();
  setFailedStmt.run({ id, state, attempts, updated_at: now });
}

function listJobs(state) {
  if (!state) {
    return db.prepare(`SELECT id, command, state, attempts, max_retries, created_at, updated_at FROM jobs ORDER BY created_at DESC`).all();
  }
  return db.prepare(`SELECT id, command, state, attempts, max_retries, created_at, updated_at FROM jobs WHERE state = ? ORDER BY created_at DESC`).all(state);
}

function summary() {
  return summaryStmt.get();
}

function completeJob(id) {
  const now = new Date().toISOString();
  db.prepare(`UPDATE jobs SET state='completed', updated_at = ? WHERE id = ?`).run(now, id);
}

module.exports = {
  enqueue,
  claimPendingJob,
  updateJobState,
  markFailedOrDead,
  getJob,
  listJobs,
  summary,
  completeJob
};
