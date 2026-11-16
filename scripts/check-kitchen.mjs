// Looks at this computer and says what it can run. Reads only; changes nothing.
//   node scripts/check-kitchen.mjs          a short report
//   node scripts/check-kitchen.mjs --json   the same as JSON, for the cook to read
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const run = (cmd, args, ms = 8000) => {
  try { return execFileSync(cmd, args, { encoding: 'utf8', timeout: ms, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
};
const GB = 1024 ** 3;
const r1 = (x) => Math.round(x * 10) / 10;

function gpus() {
  const out = [];
  const nv = run('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits']);
  for (const line of nv.split('\n').filter(Boolean)) {
    const [name, mb] = line.split(',').map((s) => s.trim());
    out.push({ name, vramGB: r1(Number(mb) / 1024), kind: 'nvidia' });
  }
  if (process.platform === 'win32') {
    // The display driver's own record of graphics memory: Windows' usual query caps it at 4 GB, and
    // on laptops with shared memory it shows what was given to graphics (which can be most of it).
    const ps = run('powershell', ['-NoProfile', '-Command',
      "Get-ItemProperty 'HKLM:\\SYSTEM\\ControlSet001\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0*' -ErrorAction SilentlyContinue | ForEach-Object { '{0}|{1}' -f $_.DriverDesc, $_.'HardwareInformation.qwMemorySize' }"]);
    for (const line of ps.split('\n').filter(Boolean)) {
      const [name, bytes] = line.trim().split('|');
      if (!name || out.some((g) => g.name === name)) continue;
      const vram = Number(bytes) > 0 ? r1(Number(bytes) / GB) : null;
      out.push({ name, vramGB: vram, kind: /amd|radeon/i.test(name) ? 'amd' : /intel/i.test(name) ? 'intel' : /nvidia/i.test(name) ? 'nvidia' : 'other' });
    }
  } else if (process.platform === 'darwin') {
    const sp = run('system_profiler', ['SPDisplaysDataType']);
    const m = sp.match(/Chipset Model:\s*(.+)/);
    if (m) out.push({ name: m[1].trim(), vramGB: null, kind: /apple/i.test(m[1]) ? 'apple' : 'other' });
  } else {
    const l = run('sh', ['-c', 'lspci | grep -iE "vga|3d"']);
    for (const line of l.split('\n').filter(Boolean)) out.push({ name: line.replace(/^.*?: /, ''), vramGB: null, kind: 'other' });
  }
  return out;
}

function freeDiskGB(dir) {
  try { const s = fs.statfsSync(dir); return r1((s.bavail * s.bsize) / GB); } catch { return null; }
}

function version(cmd, args = ['--version']) {
  const v = run(cmd, args);
  return v ? v.split('\n')[0] : '';
}

async function answers(url) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; }
}

const home = os.homedir();
const shared = process.platform === 'darwin' && os.arch() === 'arm64';
const report = {
  os: `${os.type()} ${os.release()} (${os.arch()})`,
  cpu: os.cpus()[0]?.model?.trim() || '', cores: os.cpus().length,
  memoryGB: r1(os.totalmem() / GB),
  gpus: gpus(),
  sharedMemory: shared, // Apple Silicon: the graphics card uses main memory
  freeDiskGB: freeDiskGB(home),
  tools: {
    node: process.version,
    python: version(process.platform === 'win32' ? 'python' : 'python3') || version('py', ['--version']),
    uv: version('uv'),
    ffmpeg: version('ffmpeg', ['-version']).replace(/ Copyright.*/, ''),
    lms: run('lms', ['version']) ? 'installed' : (fs.existsSync(path.join(home, '.lmstudio', 'bin')) ? 'installed (not on PATH)' : ''),
    ollama: version('ollama'),
    llmfit: version('llmfit'),
  },
  servers: {
    lmstudio: await answers('http://127.0.0.1:1234/v1/models'),
    ollama: await answers('http://127.0.0.1:11434/v1/models'),
  },
  cloudFolders: ['OneDrive', 'Dropbox', 'Google Drive', 'iCloud Drive', 'Library/Mobile Documents'].map((d) => path.join(home, d)).filter((d) => fs.existsSync(d)),
};

// A rough guide to the largest model that fits comfortably (4-bit versions); the cook confirms it.
const vram = Math.max(0, ...report.gpus.map((g) => g.vramGB || 0));
const usable = vram >= 6 ? vram * 0.85 : (shared ? report.memoryGB * 0.65 : report.memoryGB * 0.4);
report.suggestion = usable >= 48 ? 'up to 70B models (start with 24–32B: faster, often good enough)'
  : usable >= 20 ? '24–32B models' : usable >= 10 ? '12–14B models' : usable >= 6 ? '7–9B models' : '3–4B models';
report.usableForModelGB = r1(usable);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const yes = (b) => (b ? 'yes' : 'no');
  console.log(`System     ${report.os}`);
  console.log(`Processor  ${report.cpu} (${report.cores} threads)`);
  console.log(`Memory     ${report.memoryGB} GB${shared ? ' (shared with graphics)' : ''}`);
  for (const g of report.gpus) console.log(`Graphics   ${g.name}${g.vramGB ? `, ${g.vramGB} GB` : ''}`);
  console.log(`Free disk  ${report.freeDiskGB ?? '?'} GB in your home folder`);
  for (const [k, v] of Object.entries(report.tools)) console.log(`${k.padEnd(10)} ${v || '—'}`);
  console.log(`LM Studio server answering: ${yes(report.servers.lmstudio)} · Ollama answering: ${yes(report.servers.ollama)}`);
  if (report.cloudFolders.length) console.log(`Cloud-synced folders (keep the kitchen out of these): ${report.cloudFolders.join(', ')}`);
  console.log(`\nRough fit: about ${report.usableForModelGB} GB for a model → ${report.suggestion}. On AMD/Intel laptops with shared memory, check how much is given to graphics in the driver settings.`);
}
