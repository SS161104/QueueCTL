function prettyJob(job) {
  return {
    id: job.id,
    command: job.command,
    state: job.state,
    attempts: job.attempts,
    max_retries: job.max_retries,
    updated_at: job.updated_at
  };
}

module.exports = { prettyJob };
