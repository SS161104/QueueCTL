const { Command } = require('commander');
const db = require('../lib/db');
const { startWorkerPool, stopWorkerPool, statusWorkers } = require('../lib/workerPool');
const config = require('../lib/config');
const { v4: uuidv4 } = require('uuid');

const program = new Command();

program
  .name('queuectl')
  .description('CLI for queuectl - simple job queue with retries and DLQ')
  .version('1.0.0');

program
  .command('enqueue <jobJson>')
  .description('Enqueue a job using JSON string. Example: queuectl enqueue \'{"command":"sleep 2", "max_retries":3}\'')
  .action(async (jobJson) => {
    try {
      const obj = JSON.parse(jobJson);
      const now = new Date().toISOString();
      const job = {
        id: obj.id || uuidv4(),
        command: obj.command,
        state: 'pending',
        attempts: 0,
        max_retries: (typeof obj.max_retries === 'number') ? obj.max_retries : config.get('max_retries'),
        created_at: now,
        updated_at: now
      };
      if (!job.command) {
        console.error('job must include "command" field');
        process.exit(1);
      }
      db.enqueue(job);
      console.log('Enqueued job', job.id);
    } catch (e) {
      console.error('Invalid JSON or error:', e.message);
      process.exit(1);
    }
  });

program
  .command('worker start')
  .description('Start workers. Example: queuectl worker start --count 3')
  .option('--count <n>', 'number of worker threads to start', '1')
  .action((opts) => {
    const count = parseInt(opts.count || '1', 10);
    startWorkerPool(count);
  });

program
  .command('worker stop')
  .description('Stop running worker pool (signals running process via pidfile)')
  .action(() => {
    stopWorkerPool();
  });

program
  .command('status')
  .description('Show summary of all job states & active workers')
  .action(() => {
    const summary = db.summary();
    console.table(summary);
    const workers = statusWorkers();
    if (workers) console.log(workers);
  });

program
  .command('list')
  .description('List jobs. Example: queuectl list --state pending')
  .option('--state <state>', 'job state to filter (pending, processing, completed, failed, dead)')
  .action((opts) => {
    const rows = db.listJobs(opts.state);
    console.table(rows);
  });

program
  .command('dlq list')
  .description('List jobs in Dead Letter Queue (state=dead)')
  .action(() => {
    const rows = db.listJobs('dead');
    console.table(rows);
  });

program
  .command('dlq retry <jobId>')
  .description('Retry a job from DLQ (move it back to pending and reset attempts)')
  .action((jobId) => {
    const job = db.getJob(jobId);
    if (!job) {
      console.error('Job not found', jobId);
      process.exit(1);
    }
    if (job.state !== 'dead') {
      console.error('Job is not in DLQ. Current state:', job.state);
      process.exit(1);
    }
    db.updateJobState(jobId, { state: 'pending', attempts: 0, updated_at: new Date().toISOString() });
    console.log('Retried job', jobId);
  });

program
  .command('config set <key> <value>')
  .description('Set configuration options (max_retries, backoff_base)')
  .action((key, value) => {
    const parsed = isNaN(value) ? value : Number(value);
    config.set(key, parsed);
    console.log(`config ${key} = ${parsed}`);
  });

program
  .command('config get <key>')
  .description('Get a config value')
  .action((key) => {
    console.log(key, '=', config.get(key));
  });

program.parse(process.argv);
