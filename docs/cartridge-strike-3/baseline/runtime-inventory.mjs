// Run from the repository root with node --experimental-vm-modules.
import {readFileSync} from 'node:fs';
import {SourceTextModule} from 'node:vm';
import {strict as assert} from 'node:assert';

const info = JSON.parse(readFileSync('build-info.json'));
const runtime = new Set(info.files.map(f => f.path));
const html = readFileSync(info.entrypoint, 'utf8');
const entry = new URL(info.entrypoint, 'https://baseline.invalid/');
const tags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
const attribute = (tag, name) => tag.match(new RegExp('\\b' + name + '\\s*=\\s*(["\\x27])(.*?)\\1', 'i'))?.[2];
const importMap = tags.find(([,attrs]) => attribute(attrs, 'type') === 'importmap');
const mappings = JSON.parse(importMap[2]).imports;
const prefixes = Object.keys(mappings).sort((a, b) => b.length - a.length);
const seen = new Set();

function resolve(specifier, url) {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return new URL(specifier, url);
  const key = prefixes.find(k => specifier === k || (k.endsWith('/') && specifier.startsWith(k)));
  assert(key, 'Unmapped import ' + specifier + ' in ' + url.pathname);
  return new URL(mappings[key] + specifier.slice(key.length), entry);
}

function visit(url) {
  assert.equal(url.origin, entry.origin);
  const file = decodeURIComponent(url.pathname.slice(1));
  if (seen.has(file)) return;
  assert(runtime.has(file), 'Missing runtime dependency ' + file);
  seen.add(file);
  const mod = new SourceTextModule(readFileSync(file, 'utf8'), {identifier: file});
  const specifiers = mod.moduleRequests?.map(request => request.specifier) ?? mod.dependencySpecifiers;
  for (const specifier of specifiers) visit(resolve(specifier, url));
}

const scripts = tags.filter(([,attrs]) => attribute(attrs, 'type') === 'module');
for (const [,attrs,inline] of scripts) {
  const src = attribute(attrs, 'src');
  if (src) visit(new URL(src, entry));
  else {
    const mod = new SourceTextModule(inline);
    for (const dep of mod.moduleRequests?.map(r => r.specifier) ?? mod.dependencySpecifiers) visit(resolve(dep,entry));
  }
}
assert(scripts.length > 0);
assert(![...runtime].some(file => /(^|\/)(?:IMG_\d+\.PNG|ScreenRecording_.*\.zip)$/i.test(file)));
console.log(JSON.stringify({moduleEntries:scripts.length, staticModules:seen.size, runtimeFiles:runtime.size, bytes:info.bytes,
  editorDependencies:[...runtime].filter(p => p.startsWith('furniture-editor/')).length}));
