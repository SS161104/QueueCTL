const path = require('path');
const fs = require('fs');

const CONF_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(CONF_DIR)) fs.mkdirSync(CONF_DIR, { recursive: true });
const CONF_FILE = path.join(CONF_DIR, 'queuectl-config.json');

const defaults = {
  max_retries: 3,
  backoff_base: 2,
  poll_interval_seconds: 1
};

let conf = { ...defaults };
try {
  if (fs.existsSync(CONF_FILE)) {
    const raw = fs.readFileSync(CONF_FILE, 'utf8');
    conf = Object.assign({}, defaults, JSON.parse(raw));
  } else {
    fs.writeFileSync(CONF_FILE, JSON.stringify(conf, null, 2));
  }
} catch (e) {
  console.error('Could not load config file, using defaults', e.message);
}

function save() {
  fs.writeFileSync(CONF_FILE, JSON.stringify(conf, null, 2));
}

function set(key, value) {
  conf[key] = value;
  save();
}

function get(key) {
  if (key === undefined) return conf;
  return conf[key];
}

module.exports = {
  set,
  get
};
