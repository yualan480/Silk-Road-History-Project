import http from 'node:http';
import {createHash} from 'node:crypto';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { server as wisp, logging } from '@mercuryworkshop/wisp-js/server';
import { authenticate } from './auth.js';
import { createSessions } from './security.js';
const root = dirname(fileURLToPath(import.meta.url));
export function createSearchServer({targetUrl = process.env.ORBIT_SEARCH_TARGET_URL || 'https://search.orbitstayintheloop.workers.dev/chat/?entry=orbit', verifyIdentity = authenticate, parentOrigin = process.env.ORBIT_SEARCH_PARENT_ORIGIN || 'https://silkroadhistoryprojects.onrender.com'} = {}) {
const parent = new URL(parentOrigin).origin;
const target = new URL(targetUrl);
if(target.origin==='https://search.orbitstayintheloop.workers.dev'&&['/','/chat/','/chat/index.html'].includes(target.pathname)){target.pathname='/chat/';target.searchParams.set('entry','orbit');}
if(!['https:','http:'].includes(target.protocol)||target.username||target.password)throw new Error('Configure a web URL as the proxy destination.');
const sessions = createSessions();
const attempts = new Map();
Object.assign(wisp.options, {
  allow_private_ips: false, allow_loopback_ips: false, allow_direct_ip: false,
  allow_udp_streams: false, port_whitelist: [80, 443],
  stream_limit_total: 256, stream_limit_per_host: 64, parse_real_ip: false
});
logging.set_level(logging.WARN);
const vendors = {
  '/vendor/scramjet/': '@mercuryworkshop/scramjet/dist/',
  '/vendor/baremux/': '@mercuryworkshop/bare-mux/dist/',
  '/vendor/bare-mux/': '@mercuryworkshop/bare-mux/dist/', // Alias; retain existing worker URL/storage compatibility.
  '/vendor/epoxy-http1/': '@mercuryworkshop/epoxy-tls/minimal/',
  '/vendor/epoxy/': '@mercuryworkshop/epoxy-transport/dist/'
};
const mime = {'.js':'text/javascript', '.mjs':'text/javascript', '.html':'text/html; charset=utf-8', '.css':'text/css', '.json':'application/json', '.wasm':'application/wasm', '.png':'image/png'};
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const url = new URL(req.url, 'http://local');
  // The public launcher may sit under Orbit's nested/blank-window wrappers.
  // Account handoff still checks the exact immediate parent origin AND window source.
  // It has no stored login and cannot authenticate an unrelated embedding site.
  if(!['/','/index.html'].includes(url.pathname))res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${parent}`);
  if (url.pathname === '/health') { res.writeHead(200); return res.end('Orbit Search ready'); }
  if (url.pathname === '/api/guest-session') {
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
    let own=false;try{const source=new URL(req.headers.origin);own=['http:','https:'].includes(source.protocol)&&source.host===req.headers.host;}catch{}
    if(req.method!=='POST'||!own){res.writeHead(403);return res.end(JSON.stringify({message:'Open this page to connect its proxy.'}));}
    const guest=req.headers['x-orbit-guest-id'];
    if(typeof guest!=='string'||!/^[a-f0-9-]{36}$/i.test(guest)){res.writeHead(400);return res.end(JSON.stringify({message:'Reload this page to create a guest session.'}));}
    const ip=req.socket.remoteAddress,now=Date.now(),key='guest:'+ip;
    for(const [key,value] of attempts)if(now-value.start>60000)attempts.delete(key);
    const rate=attempts.get(key)||{start:now,count:0};attempts.set(key,rate);
    if(++rate.count>60){res.writeHead(429);return res.end(JSON.stringify({message:'Please wait a minute and retry.'}));}
    try{
      const id='guest:'+createHash('sha256').update(ip+'|'+guest).digest('hex');
      return res.end(JSON.stringify({...sessions.issue({id,expiresAt:now+30*60*1000}),target:target.href}));
    }catch{res.writeHead(503);return res.end(JSON.stringify({message:'The proxy is busy. Try again shortly.'}));}
  }
  if (url.pathname === '/api/session') {
    res.setHeader('Cache-Control','no-store');
    let ownOrigin=false;try{const source=new URL(req.headers.origin);ownOrigin=['http:','https:'].includes(source.protocol)&&source.host===req.headers.host;}catch{}
    if (req.headers.origin !== parent && !ownOrigin) { res.writeHead(403); return res.end('Open Orbit Search from Orbit.'); }
    res.setHeader('Access-Control-Allow-Origin', ownOrigin?req.headers.origin:parent);
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Headers', 'Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'POST');
      res.writeHead(204); return res.end();
    }
    if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
    const ip = req.socket.remoteAddress;
    const now = Date.now();
    for (const [key, value] of attempts) if (now - value.start > 60000) attempts.delete(key);
    const rate = attempts.get(ip) || {start: now, count: 0};
    attempts.set(ip, rate);
    if (++rate.count > 60) { res.writeHead(429); return res.end('Please wait a minute and retry.'); }
    try {
      const identity = await verifyIdentity((req.headers.authorization || '').replace(/^Bearer /, ''));
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify(sessions.issue(identity)));
    } catch { res.writeHead(401); res.end('Sign in to Orbit again, then retry Orbit Search.'); }
    return;
  }
  if (url.pathname === '/api/relay-check') {
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    let own=false;try{const origin=new URL(req.headers.origin);own=['http:','https:'].includes(origin.protocol)&&origin.host===req.headers.host;}catch{}
    if(req.method!=='POST'||!own){res.writeHead(403);return res.end(JSON.stringify({message:'Open Orbit Search from its authorized page.'}));}
    const session=sessions.get(req.headers['x-orbit-relay-ticket']);
    if(!session){res.writeHead(401);return res.end(JSON.stringify({message:'Relay ticket expired or the service restarted. Reload this page to reconnect the proxy.'}));}
    if(session.connections.size>=20){res.writeHead(429);return res.end(JSON.stringify({message:'Your relay has reached 20 connections. Close unused Orbit Search tabs and retry.'}));}
    return res.end(JSON.stringify({ready:true}));
  }
  if (url.pathname === '/config.json') { res.setHeader('Content-Type','application/json'); return res.end(JSON.stringify({parent})); }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
  let file;
  for (const [prefix, directory] of Object.entries(vendors)) {
    if (!pathname.startsWith(prefix)) continue;
    const name = pathname.slice(prefix.length);
    if (!/^[a-zA-Z0-9._-]+$/.test(name) || name.startsWith('.') || !/\.(js|mjs|wasm)$/.test(name)) break;
    file = resolve(root, 'node_modules', directory, name);
  }
  if (!file) {
    if (!['/', '/index.html', '/embed.css', '/embed.js', '/search.js', '/style.css', '/sw.js', '/proxy-runtime.js', '/http-fallback.js', '/relay-recovery.js', '/relay-probe.js', '/epoxy-fallback.mjs', '/address.js', '/orbit-mark.png'].includes(pathname)) { res.writeHead(404); return res.end(); }
    file = resolve(root, 'public', pathname === '/' ? 'index.html' : pathname.slice(1));
  }
  try {
    const info = await stat(file);
    res.writeHead(200, {'Content-Type':mime[extname(file)] || 'application/octet-stream', 'Content-Length':info.size, 'Cache-Control':'no-cache'});
    const stream = createReadStream(file); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://local');
  const session = sessions.get(url.searchParams.get('ticket'));
  const origin = req.headers.origin;
  let ownOrigin=false;try{ownOrigin=!!origin&&new URL(origin).host===req.headers.host;}catch{}
  // Only this proxy origin can use a short-lived server-issued account or guest ticket.
  if (url.pathname !== '/wisp/' || !session || !ownOrigin || session.connections.size >= 20) {
    console.warn('[Orbit Search relay] upgrade rejected:',url.pathname!=='/wisp/'?'path':!session?'expired-or-missing-ticket':!ownOrigin?'origin':'connection-limit');
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
  }
  session.connections.add(socket);
  const connectedAt=Date.now();
  socket.once('error',error=>console.warn('[Orbit Search relay] socket error:',error.code||error.name));
  socket.once('close',()=>{if(url.searchParams.get('probe')!=='1'&&Date.now()-connectedAt<3000)console.warn('[Orbit Search relay] socket closed within 3s of upgrade; inspect Wisp/network errors.');});
  let expiry;
  const expire=()=>{const remaining=session.expires-Date.now();if(remaining<=0){socket.destroy();return;}expiry=setTimeout(expire,remaining);expiry.unref();};
  expire(); // Recheck renewed expiry instead of killing a healthy renewed connection.
  socket.on('close', () => { clearTimeout(expiry); session.connections.delete(socket); });
  req.url = '/wisp/';
  wisp.routeRequest(req, socket, head);
});
return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) createSearchServer().listen(Number(process.env.PORT || 8790), process.env.HOST || '0.0.0.0', () => console.log('Orbit Search listening'));
