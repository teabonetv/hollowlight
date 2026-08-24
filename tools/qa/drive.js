#!/usr/bin/env node
/**
 * Hollowlight QA driver — drives a real headless Chrome over CDP with zero
 * npm dependencies (Node >=22 global fetch/WebSocket). Built for fresh
 * critic agents that cannot approve interactive popups.
 *
 * One pinned browser + one pinned tab persist between invocations, so you can
 * script a play session as a series of commands. localStorage survives across
 * commands (same profile) — perfect for testing saves/offline.
 *
 * Usage:
 *   node drive.js goto <url> [waitMs]     # navigate the pinned tab
 *   node drive.js debug                   # page state summary (href/title/DOM size)
 *   node drive.js shot <out.png> [w h]    # screenshot, e.g. 360 640 mobile
 *   node drive.js click "<css-selector>"
 *   node drive.js eval "<js expression>"  # JSON result printed
 *   node drivejs errors [clear]           # console errors seen so far
 *   node drive.js reset                   # kill browser AND wipe profile (fresh save)
 *   node drive.js close                   # shut the browser, keep profile
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  join(homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
];
const PROFILE_DIR = join(tmpdir(), 'hollowlight-qa-profile');
const STATE_FILE = join(PROFILE_DIR, 'driver-state.json');
const ERRORS_FILE = join(PROFILE_DIR, 'console-errors.jsonl');
const DEBUG_PORT = 9222;

function chromePath() {
  for (const p of CHROME_CANDIDATES) if (existsSync(p)) return p;
  throw new Error('Chrome not found');
}

async function httpJson(path, method = 'GET', timeoutMs = 4000) {
  const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}${path}`, {
    method, signal: AbortSignal.timeout(timeoutMs),
  });
  return r.json();
}

const SOCKETS = new Set();

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.extra = null;
    SOCKETS.add(ws);
    ws.addEventListener('close', () => SOCKETS.delete(ws));
    // Always dispatch; protocol responses resolve pendings, events go to extra.
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      } else if (this.extra) this.extra(msg);
    };
  }
  static connect(url) {
    return new Promise((res, rej) => {
      const ws = new WebSocket(url);
      ws.onopen = () => res(new CDP(ws));
      ws.onerror = () => rej(new Error('ws connect failed: ' + url));
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    const p = new Promise((res, rej) => this.pending.set(id, { res, rej }));
    this.ws.send(JSON.stringify({ id, method, params }));
    return p;
  }
  listen(handler) { this.extra = handler; }
}

function recordError(text) {
  try {
    mkdirSync(PROFILE_DIR, { recursive: true });
    writeFileSync(ERRORS_FILE, JSON.stringify({ t: Date.now(), text }) + '\n', { flag: 'a' });
  } catch {}
}
function readErrors() {
  try { return readFileSync(ERRORS_FILE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).text); }
  catch { return []; }
}

async function launchChrome() {
  mkdirSync(PROFILE_DIR, { recursive: true });
  const child = spawn(chromePath(), [
    '--headless=new', `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--no-first-run', '--no-default-browser-check',
    '--window-size=1440,900', 'about:blank',
    '--remote-allow-origins=*',
  ], {
    // All-ignore stdio + detached: pipes severing on parent exit were killing
    // headless chrome between driver invocations. unref lets node exit freely.
    stdio: ['ignore', 'ignore', 'ignore'],
    detached: true,
  });
  child.unref();
  if (process.env.QA_DEBUG) console.error('[qa] chrome spawned, waiting for CDP port…');
  // Poll the HTTP endpoint instead of parsing stderr — robust across versions.
  const t0 = Date.now();
  while (Date.now() - t0 < 25000) {
    await new Promise(r => setTimeout(r, 500));
    try { await httpJson('/json/version', 'GET', 1500); 
      const ver = await httpJson('/json/version');
      if (process.env.QA_DEBUG) console.error(`[qa] CDP up after ${Date.now() - t0}ms`);
      return { wsUrl: ver.webSocketDebuggerUrl, child };
    } catch {}
    if (child.exitCode !== null) throw new Error(`chrome exited early (${child.exitCode})`);
  }
  child.kill();
  throw new Error('chrome CDP port never came up');
}

async function ensureBrowser() {
  // Fast path: reuse running browser + pinned tab.
  if (existsSync(STATE_FILE)) {
    try {
      const st = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
      const targets = await httpJson('/json/list');
      const tab = targets.find((t) => t.id === st.targetId && t.type === 'page');
      if (tab) return { pageWs: tab.webSocketDebuggerUrl };
    } catch {}
  }
  // Slow path: launch (or adopt running browser), create + pin a tab.
  const dbg = (...a) => { if (process.env.QA_DEBUG) console.error('[qa]', ...a); };
  let wsUrl;
  try { dbg('probing running browser'); wsUrl = (await httpJson('/json/version')).webSocketDebuggerUrl; }
  catch { dbg('launching chrome'); wsUrl = (await launchChrome()).wsUrl; }
  dbg('connecting browser socket');
  const browser = await CDP.connect(wsUrl);
  dbg('creating target');
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  dbg('target', targetId);
  // NOTE: do NOT close the browser websocket here — explicit closes trigger a
  // Node/Windows libuv assertion that aborts the process. Just abandon it;
  // process.exit tears everything down safely.
  mkdirSync(PROFILE_DIR, { recursive: true });
  let st = {};
  try { st = JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch {}
  writeFileSync(STATE_FILE, JSON.stringify({ ...st, targetId }));
  const targets = await httpJson('/json/list');
  const tab = targets.find((t) => t.id === targetId);
  if (!tab) throw new Error('created tab vanished');
  dbg('page socket acquired');
  return { pageWs: tab.webSocketDebuggerUrl };
}

async function main() {
  const dbg = (...a) => { if (process.env.QA_DEBUG) console.error('[qa]', ...a); };
  const [cmd, ...args] = process.argv.slice(2);

  if (cmd === 'reset' || cmd === 'close') {
    try {
      const st = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
      if (st.targetId) await httpJson(`/json/close/${st.targetId}`).catch(() => {});
      try {
        const ver = await httpJson('/json/version');
        const b = await CDP.connect(ver.webSocketDebuggerUrl);
        await b.send('Browser.close');
      } catch {}
    } catch {}
    await new Promise(r => setTimeout(r, 800));
    if (cmd === 'reset') rmSync(PROFILE_DIR, { recursive: true, force: true });
    console.log(JSON.stringify({ done: cmd }));
    return quit(0);
  }
  if (!cmd) { console.log('see header of tools/qa/drive.js'); return quit(1); }

  const { pageWs } = await ensureBrowser();
  const page = await CDP.connect(pageWs);
  page.listen((msg) => {
    if (msg.method === 'Runtime.exceptionThrown')
      recordError(msg.params?.exceptionDetails?.exception?.description || 'exception');
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error')
      recordError(msg.params.args?.map(a => a.value ?? a.description ?? '').join(' '));
    if (msg.method === 'Log.entryAdded' && msg.params?.entry?.level === 'error')
      recordError(msg.params.entry.text);
  });

  switch (cmd) {
    case 'goto': {
      const [url, waitMs] = args;
      await page.send('Runtime.enable');
      await page.send('Log.enable');
      await page.send('Page.enable');
      await page.send('Page.navigate', { url });
      await new Promise(r => setTimeout(r, Number(waitMs || 4000)));
      const loc = await page.send('Runtime.evaluate', { expression: 'location.href', returnByValue: true });
      console.log(JSON.stringify({ url: loc.result.value }));
      break;
    }
    case 'debug': {
      const expr = `JSON.stringify({
        href: location.href, ready: document.readyState, title: document.title,
        htmlLen: document.documentElement ? document.documentElement.outerHTML.length : -1,
        bodyLen: document.body ? document.body.innerText.length : -1,
        tabButtons: document.querySelectorAll('.tabbar button').length,
        firstText: document.body ? document.body.innerText.slice(0, 150) : null
      })`;
      const r = await page.send('Runtime.evaluate', { expression: expr, returnByValue: true });
      console.log(r.result.value);
      break;
    }
    case 'shot': {
      const [out, w, h] = args;
      await page.send('Page.enable');
      if (w && h)
        await page.send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 2, mobile: +w < 500 });
      await new Promise(r => setTimeout(r, 700));
      const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
      const path = resolve(out);
      writeFileSync(path, Buffer.from(data, 'base64'));
      console.log(JSON.stringify({ saved: path, size: `${w || '-'}x${h || '-'}` }));
      break;
    }
    case 'click': {
      const sel = args.join(' ');
      const expr = `(() => { const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return { ok:false, miss:${JSON.stringify(sel)} };
        el.scrollIntoView({block:'center'}); el.click(); return { ok:true, tag:el.tagName }; })()`;
      const r = await page.send('Runtime.evaluate', { expression: expr.replace(/\s+/g, ' '), returnByValue: true });
      console.log(JSON.stringify(r.result.value));
      break;
    }
    case 'eval': {
      const r = await page.send('Runtime.evaluate', { expression: args.join(' '), returnByValue: true, awaitPromise: true });
      console.log(JSON.stringify(r.result.value !== undefined ? r.result.value : r.result));
      break;
    }
    case 'errors': {
      if (args[0] === 'clear') { writeFileSync(ERRORS_FILE, ''); console.log('[]'); }
      else {
        const errs = readErrors();
        console.log(errs.length ? JSON.stringify(errs, null, 1) : '[]');
      }
      break;
    }
    default:
      console.log('unknown cmd', cmd);
      return quit(1);
  }
  return quit(0);
}

/** Flush stdout, close tracked sockets cleanly (awaited closes avoid the
 * Node/Windows libuv assertion), then exit. */
async function quit(code = 0) {
  await new Promise((r) => {
    if (!process.stdout.writableLength) r();
    else { process.stdout.once('drain', r); setTimeout(r, 250); }
  });
  const closes = [];
  for (const sock of SOCKETS) {
    try {
      closes.push(new Promise((res) => {
        sock.addEventListener('close', res, { once: true });
        try { sock.close(); } catch { res(); }
        setTimeout(res, 300);
      }));
    } catch {}
  }
  await Promise.race([Promise.all(closes), new Promise(r => setTimeout(r, 400))]);
  process.exit(code);
}

main().catch((e) => { console.error('DRIVER_ERROR:', e.message); quit(1); });
