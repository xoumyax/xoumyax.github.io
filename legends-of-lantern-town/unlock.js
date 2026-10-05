// Passcode gate: derives the key, decrypts every game file into Cache Storage,
// and hands off to the service worker that serves them under ./play/.
const $ = s => document.querySelector(s);
const SCOPE = new URL('./', location.href).href;
const enc = new TextEncoder(), dec = new TextDecoder();

async function deriveKey(passcode, meta) {
  const material = await crypto.subtle.importKey('raw', enc.encode(passcode.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from(atob(meta.salt), c => c.charCodeAt(0));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: meta.iterations }, material, 512);
  return crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['decrypt']);
}

async function decryptBlob(key, url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Missing ${url}`);
  const data = new Uint8Array(await res.arrayBuffer());
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12) }, key, data.slice(12));
}

function setStatus(text, kind = '') { const s = $('#status'); s.textContent = text; s.dataset.kind = kind; }

async function unlockedBuild(meta) {
  if (!('caches' in window)) return false;
  return (await caches.keys()).includes(`lantern-${meta.build}`) && !!(await (await caches.open(`lantern-${meta.build}`)).match(`${SCOPE}play/index.html`));
}

async function registerWorker() {
  const reg = await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;
  return reg;
}

async function unlock(passcode, meta) {
  const key = await deriveKey(passcode, meta);
  let manifest;
  try { manifest = JSON.parse(dec.decode(await decryptBlob(key, 'vault/manifest.bin'))); }
  catch { throw new Error('wrong'); }
  const cache = await caches.open(`lantern-${meta.build}`);
  const entries = Object.entries(manifest.files);
  const total = entries.reduce((n, [, f]) => n + f.size, 0);
  let done = 0;
  const queue = entries.slice();
  async function worker() {
    while (queue.length) {
      const [path, file] = queue.shift();
      const body = await decryptBlob(key, `vault/${file.blob}`);
      await cache.put(`${SCOPE}play/${path}`, new Response(body, { headers: { 'Content-Type': file.type, 'Cache-Control': 'no-store' } }));
      done += file.size;
      $('#progress').style.width = `${Math.round(done / total * 100)}%`;
      setStatus(`Opening the rift · ${Math.round(done / total * 100)}%`);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
}

async function forget() {
  for (const k of await caches.keys()) if (k.startsWith('lantern-')) await caches.delete(k);
  for (const r of await navigator.serviceWorker.getRegistrations()) if (r.scope === SCOPE) await r.unregister();
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('puff-brownie')) localStorage.removeItem(k); } catch { /* storage blocked */ }
  setStatus('This device has forgotten the game and its saves.', 'ok');
  $('#enter').hidden = true; $('#form').hidden = false;
}

async function main() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext || !crypto?.subtle) {
    setStatus('This browser cannot open the game. Try a recent Chrome, Safari, Edge or Firefox.', 'error'); $('#form').hidden = true; return;
  }
  const meta = await (await fetch('vault/meta.json', { cache: 'no-cache' })).json();
  registerWorker().catch(() => {});
  if (await unlockedBuild(meta)) { $('#form').hidden = true; $('#enter').hidden = false; }
  $('#forget').addEventListener('click', forget);
  $('#enter').addEventListener('click', () => { location.href = 'play/'; });
  $('#form').addEventListener('submit', async event => {
    event.preventDefault();
    const passcode = $('#passcode').value.trim();
    if (!passcode) return;
    $('#submit').disabled = true; $('#passcode').disabled = true; $('.track').hidden = false;
    setStatus('Checking the passcode…');
    try {
      await registerWorker();
      await unlock(passcode, meta);
      setStatus('Welcome home.', 'ok');
      location.href = 'play/';
    } catch (error) {
      $('.track').hidden = true; $('#progress').style.width = '0';
      setStatus(error.message === 'wrong' ? 'That passcode doesn’t open this rift. Try again.' : 'The game could not be unlocked. Check your connection and try again.', 'error');
      $('#submit').disabled = false; $('#passcode').disabled = false; $('#passcode').select();
      if (error.message !== 'wrong') console.error(error);
    }
  });
}
main();
