# QueueCTL - Background Job Queue CLI

QueueCTL is a simple yet powerful **background job queue system** built using Node.js.  
It supports persistent job storage, multi-worker processing, exponential backoff retries,  
and a Dead Letter Queue (DLQ) for permanently failed jobs - all managed via a clean CLI interface.

---

## Tech Stack

| Component | Technology |
|------------|-------------|
| Language | Node.js |
| Database | SQLite (via better-sqlite3) |
| CLI Framework | commander |
| Unique IDs | uuid |

---

## 1. Setup Instructions

### **Clone the repository**
```bash
git clone https://github.com/SS161104/QueueCTL.git
cd queuectl
```

### **Install dependencies**
```bash
npm install
```

### **Make CLI executable**
```bash
chmod +x bin/queuectl.js
```
Now you can use:
```
node ./bin/queuectl.js <command>
```

---

## 2. Usage Examples

### **Enqueue a job**
```bash
node ./bin/queuectl.js enqueue '{"command":"echo Hello QueueCTL"}'
```
Output:
```
Enqueued job 1e2f9c10-8ab7-45be-9233-2b9a76c9f874
```

### **Start workers**
```bash
node ./bin/queuectl.js worker start --count 2
```
Output:
```
Started 2 workers pid 45210
[w1] job picked echo Hello QueueCTL
[w1] done
```
Press `CTRL + C` to stop gracefully.

### **Stop workers**
```bash
node ./bin/queuectl.js worker stop
```

### **View status**
```bash
node ./bin/queuectl.js status
```
Output:
```
┌─────────┬───────────┬──────────┬───────────┬────────┐
│ pending │ processing│ completed│ failed    │ dead   │
├─────────┼───────────┼──────────┼───────────┼────────┤
│    0    │     0     │    1     │    0      │    0   │
└─────────┴───────────┴──────────┴───────────┴────────┘

{ pid: 45210, count: 2 }
```

### **List jobs**
```bash
node ./bin/queuectl.js list --state completed
```

### **View DLQ**
```bash
node ./bin/queuectl.js dlq list
```

### **Retry DLQ job**
```bash
node ./bin/queuectl.js dlq retry <job-id>
```

### **Update config**
```bash
node ./bin/queuectl.js config set max_retries 5
node ./bin/queuectl.js config get max_retries
```

---

## 3. Architecture Overview

### **Job Lifecycle**

| State | Description |
|-------|--------------|
| pending | Waiting to be picked by a worker |
| processing | Currently being executed |
| completed | Successfully executed |
| failed | Failed but retryable |
| dead | Moved to Dead Letter Queue after exceeding retries |

### **Flow Summary**

1. Enqueued job is stored in SQLite DB with `pending` state.
2. Workers atomically claim a job and mark it `processing`.
3. Each worker runs the command in a child process.
4. If success → mark `completed`.  
   If fail → increment `attempts` and retry after `base^attempts` seconds.
5. After `max_retries` → job marked `dead` (DLQ).
6. DLQ jobs can be retried manually from CLI.

### **Data Persistence**

- Persistent job store in `data/queue.db`.
- Jobs remain safe across restarts.
- Configurable settings stored in `data/queuectl-config.json`.

---

## 4. Assumptions & Trade-offs

| Area | Decision | Reason |
|------|-----------|--------|
| Storage | SQLite | Lightweight, persistent, no setup required |
| Worker Model | Async loops in one process | Easier to manage and signal |
| Retry Logic | Exponential backoff (`base^attempts`) | Simple and production-like |
| Command Execution | `/bin/sh -c` | Allows arbitrary shell commands |
| Config Persistence | JSON file | Easy to modify via CLI |
| Multi-Process Workers | Not implemented | SQLite locks; async loops suffice for test scope |

### **Possible Enhancements**
- Job priority queues  
- Delayed/scheduled jobs (`run_at`)  
- Job timeout support  
- Web dashboard for monitoring  
- Job output logging  

---

## 5. Testing Instructions

### **Automated Test Script**
Run:
```bash
bash tests/quick-test.sh
```

It will:
- Reset the queue
- Enqueue both success & failing jobs
- Start a worker
- Wait for retries
- Display job states and DLQ

Expected output:
```
=== Enqueue a successful job ===
Enqueued job job-success
=== Enqueue a failing job ===
Enqueued job job-fail
[w1] job job-success completed
[w1] job job-fail failed -> retry in 2s
[w1] job job-fail failed again -> moved to DLQ
```

### **Manual Tests**

| Test Case | Command |
|------------|----------|
| Simple success | `node ./bin/queuectl.js enqueue '{"command":"echo hi"}'` |
| Failure & retry | `node ./bin/queuectl.js enqueue '{"command":"bash -c \"exit 1\""}'` |
| Persistence | Restart worker; jobs remain pending |
| DLQ Retry | `node ./bin/queuectl.js dlq retry <job-id>` |
| Multi-worker | `node ./bin/queuectl.js worker start --count 3` |

---

## Project Structure

```
queuectl-node/
├─ package.json
├─ bin/
│  └─ queuectl.js          # CLI entry point
├─ lib/
│  ├─ db.js                # SQLite wrapper
│  ├─ config.js            # Config persistence
│  ├─ workerPool.js        # Worker pool + job runner
│  └─ utils.js             # Helper functions
├─ tests/
│  └─ quick-test.sh        # Automated test script
└─ data/
   └─ queue.db             # Auto-created on first run
```
---

## Demo Video

Watch the full working demo here:  
https://drive.google.com/file/d/1GufY_UVzL3CwdDc4sXK0N-iSUweyqw-i/view?usp=drive_link

This video demonstrates:
- Enqueuing jobs  
- Running workers  
- Automatic retries with exponential backoff  
- Dead Letter Queue (DLQ) handling  
- Retrying DLQ jobs via CLI  

---
