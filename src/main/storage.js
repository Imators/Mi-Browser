const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const storagePath = path.join(app.getPath('userData'), 'mi-browser-data.json');

function getData() {
  try {
    if (fs.existsSync(storagePath)) {
      return JSON.parse(fs.readFileSync(storagePath, 'utf8'));
    }
  } catch (err) {
    console.error('Storage error:', err);
  }
  return {};
}

function get(key) {
  const data = getData();
  return key in data ? data[key] : null;
}

function set(key, value) {
  const data = getData();
  data[key] = value;
  fs.writeFileSync(storagePath, JSON.stringify(data, null, 2));
}

function reset() {
  if (fs.existsSync(storagePath)) {
    fs.unlinkSync(storagePath);
  }
}

module.exports = { get, set, reset };