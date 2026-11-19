import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {searchOrigin,searchFramePolicy} from '../server/search-config.js';
test('search origin accepts a dedicated HTTPS URL and rejects insecure, same-host and credential URLs',()=>{
 assert.equal(searchOrigin('https://new-search-123.onrender.com/path','silkroadhistoryprojects.onrender.com'),'https://new-search-123.onrender.com');
 for(const value of ['http://search.example','https://silkroadhistoryprojects.onrender.com','https://name:password@search.example'])assert.equal(searchOrigin(value,'silkroadhistoryprojects.onrender.com'),null);
});
test('the actual Orbit page trusts exactly the configured Search origin without weakening other directives',()=>{
 const html=readFileSync(new URL('../../chat/index.html',import.meta.url),'utf8'),origin='https://new-search-123.onrender.com';const changed=searchFramePolicy(html,origin);
 const policy=value=>value.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)[1].split(';');const before=policy(html),after=policy(changed);
 assert.equal(after.length,before.length);before.forEach((rule,i)=>{if(!rule.trim().startsWith('frame-src '))assert.equal(after[i],rule);});
 const frame=after.find(rule=>rule.trim().startsWith('frame-src '));assert.ok(frame.includes(origin));assert.ok(!frame.includes('https://silk-road-orbit-search.onrender.com'));assert.ok(frame.includes('https://www.youtube.com'));assert.ok(!frame.includes('https://*.onrender.com'));
 assert.equal(searchFramePolicy(changed,origin),changed);
});
test('unconfigured Search retains the original page policy',()=>{const html=readFileSync(new URL('../../chat/index.html',import.meta.url),'utf8');assert.equal(searchFramePolicy(html,null),html);});

test('confirmed main deployment uses its Search service when Render variable is missing, with explicit overrides retained',()=>{
 assert.equal(searchOrigin(undefined,'silkroadhistoryprojects.onrender.com'),'https://orbit-search-wx0l.onrender.com');
 assert.equal(searchOrigin('','silkroadhistoryprojects.onrender.com'),'https://orbit-search-wx0l.onrender.com');
 assert.equal(searchOrigin('https://override.example/','silkroadhistoryprojects.onrender.com'),'https://override.example');
 assert.equal(searchOrigin(undefined,'other.example'),null);assert.equal(searchOrigin(undefined,'localhost:8787'),null);
});
