// Where the kitchen keeps things, and small helpers to read and write JSON safely.
//
// <kitchen>/app   this app        <kitchen>/data   everything it stores     <kitchen>/models   big files
// KITCHEN_DATA / --data= override the data folder (handy for tests).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const KITCHEN_DIR = path.resolve(APP_DIR, '..');

const arg = process.argv.find((a) => a.startsWith('--data='));
export const DATA_DIR = path.resolve(arg ? arg.slice(7) : process.env.KITCHEN_DATA || path.join(KITCHEN_DIR, 'data'));
export const MODELS_DIR = path.join(KITCHEN_DIR, 'models');

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// Written to a temporary file first, so a crash never leaves half a file behind.
export function writeJson(file, value) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

// The app's settings (data/settings.json). Dishes keep theirs under settings.dishes[<id>].
const SETTINGS = () => path.join(DATA_DIR, 'settings.json');
export function getSettings() {
  return readJson(SETTINGS(), {}) || {};
}
export function updateSettings(fn) {
  const s = getSettings();
  const next = fn(s) || s;
  writeJson(SETTINGS(), next);
  return next;
}

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
