const { spawn } = require('child_process');
const db = require('./db');
const config = require('./config');

const PIDFILE = require('path').join(process.cwd(), 'data', 'worker.pid');
let workerCount = 0;
let running = false;
let workerHandles = [];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function workerLoop(id) {
  // loop until running false
  while (running) {
    try {
      const job = db.claimPendingJob();
      if (!job) {
        // nothing to do, wait poll interval
        await sleep(config.get('poll_interval_seconds') * 1000);
        continue;
      }
      console.log(`[worker-${id}] picked job ${job.id} command: ${job.command}`);
      // execute command using shell
      const child = spawn(job.command, { shell: true, stdio: ['ignore', 'inherit', 'inherit'] });

      const exitCode = await new Promise((resolve) => {
        child.on('close', code => resolve(code));
        child.on('error', err => {
          console.error(`[worker-${id}] child process error for job ${job.id}:`, err.message);
          resolve(1);
        });
      });

      if (exitCode === 0) {
        console.log(`[worker-${id}] job ${job.id} completed`);
        db.completeJob(job.id);
      } else {
        console.warn(`[worker-${id}] job ${job.id} failed with exit ${exitCode}`);
        const attempts = job.attempts + 1;
        if (attempts > job.max_retries) {
          db.markFailedOrDead(job.id, attempts, true);
          console.warn(`[worker-${id}] job ${job.id} moved to DLQ`);
        } else {
          // mark failed (retryable)
          db.markFailedOrDead(job.id, attempts, false);
          // exponential backoff delay = base ^ attempts (in seconds)
          const base = config.get('backoff_base') || 2;
          const delaySecs = Math.pow(base, attempts);
          console.log(`[worker-${id}] will retry job ${job.id} after ${delaySecs}s (attempt ${attempts}/${job.max_retries})`);
          // sleep then set state back to pending
          await sleep(delaySecs * 1000);
          db.updateJobState(job.id, { state: 'pending', attempts });
        }
      }
    } catch (e) {
      console.error(`worker-${id} encountered error:`, e.message);
      await sleep(1000);
    }
  }
  console.log(`worker-${id} stopped`);
}

function startWorkerPool(count) {
  if (running) {
    console.error('Worker pool already running in this process.');
    return;
  }
  running = true;
  workerCount = count;
  // write pid file for other commands to stop
  const pids = [];
  for (let i = 0; i < count; i++) {
    // spin up worker loops (not child processes, simple threads)
    const handle = workerLoop(i + 1);
    workerHandles.push(handle);
  }
  // store master PID
  require('fs').writeFileSync(PIDFILE, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString(), count }));
  console.log(`Started ${count} worker(s) in this process (pid ${process.pid}). Press Ctrl+C to stop gracefully.`);
  process.on('SIGINT', async () => {
    console.log('SIGINT received: shutting down workers gracefully...');
    await stop();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received: shutting down workers gracefully...');
    await stop();
    process.exit(0);
  });
}

async function stop() {
  if (!running) {
    console.log('Worker pool is not running.');
    return;
  }
  running = false;
  // wait for all worker handles to complete (they finish loop)
  try {
    await Promise.all(workerHandles);
  } catch (e) {
    // ignore
  }
  workerHandles = [];
  if (require('fs').existsSync(PIDFILE)) require('fs').unlinkSync(PIDFILE);
  console.log('All workers stopped.');
}

function stopWorkerPool() {
  // read pidfile and signal
  try {
    if (!require('fs').existsSync(PIDFILE)) {
      console.error('No running worker pidfile found.');
      return;
    }
    const raw = require('fs').readFileSync(PIDFILE, 'utf8');
    const obj = JSON.parse(raw);
    process.kill(obj.pid, 'SIGINT');
    console.log(`Sent SIGINT to pid ${obj.pid}`);
  } catch (e) {
    console.error('Could not stop worker pool:', e.message);
  }
}

function statusWorkers() {
  try {
    if (!require('fs').existsSync(PIDFILE)) {
      return 'No worker process running (no pidfile).';
    }
    const raw = require('fs').readFileSync(PIDFILE, 'utf8');
    const obj = JSON.parse(raw);
    return obj;
  } catch (e) {
    return 'Could not read worker pidfile: ' + e.message;
  }
}

module.exports = {
  startWorkerPool,
  stopWorkerPool,
  statusWorkers
};
