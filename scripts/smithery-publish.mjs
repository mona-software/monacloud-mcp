#!/usr/bin/env node
/**
 * Đẩy bản MCPB mới lên Smithery.
 * PUT api.smithery.ai/servers/mon%2Fmonacloud-mcp/releases — multipart `payload` + `bundle`.
 * API key đọc từ settings của Smithery CLI (đã `npx @smithery/cli login`).
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SETTINGS = path.join(homedir(), 'Library', 'Application Support', 'smithery', 'settings.json');

const settings = JSON.parse(await readFile(SETTINGS, 'utf8'));
const apiKey = settings.apiKey;
const namespace = settings.namespace || 'mon';
if (!apiKey) throw new Error('Chưa đăng nhập Smithery — chạy `npx @smithery/cli login`');

const manifest = JSON.parse(await readFile(path.join(ROOT, 'build', 'manifest-with-schema.json'), 'utf8'));
const bundle = await readFile(path.join(ROOT, 'build', 'monacloud-mcp.mcpb'));

const properties = {};
const required = [];
for (const [key, cfg] of Object.entries(manifest.user_config || {})) {
  properties[key] = { type: cfg.type === 'string' ? 'string' : cfg.type, title: cfg.title, description: cfg.description };
  if (cfg.required) required.push(key);
}

// Shape đúng (chốt 19/09/2026 sau khi dò sai và mất danh sách tool 1 lần):
//   * `tools` để ở GỐC payload thì Smithery NHẬN 202 nhưng BỎ QUA → server card về 0 tool.
//     Chỗ đúng là `serverCard.tools`, và phải kèm `serverCard.serverInfo`
//     — thiếu serverInfo là trả 400 "Invalid input: expected object, received undefined".
//   * Mỗi tool phải có `inputSchema` → lấy từ build/manifest-with-schema.json,
//     KHÔNG lấy mcpb/manifest.json (bản đó cố tình bỏ inputSchema vì mcpb pack không cho).
//   * ⚠️ Gửi `tools` rỗng là Smithery XOÁ SẠCH danh sách tool đang hiển thị công khai.
//   * Field `payload` phải đi dạng multipart chuỗi JSON, đừng gắn type=application/json.
const payload = {
  type: 'stdio',
  runtime: 'node',
  serverCard: {
    serverInfo: { name: manifest.name, version: manifest.version },
    tools: manifest.tools,
  },
  configSchema: { type: 'object', properties, required },
};
if (!Array.isArray(payload.serverCard.tools) || payload.serverCard.tools.length === 0) {
  throw new Error('manifest-with-schema.json không có tool nào — chạy `node scripts/mcpb-tools-sync.mjs` trước');
}

const form = new FormData();
form.append('payload', JSON.stringify(payload));
form.append('bundle', new Blob([bundle], { type: 'application/zip' }), 'monacloud-mcp.mcpb');

const url = `https://api.smithery.ai/servers/${encodeURIComponent(`${namespace}/monacloud-mcp`)}/releases`;
const res = await fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${apiKey}` }, body: form });
const text = await res.text();
console.log(res.status, text.slice(0, 600));
if (!res.ok) process.exit(1);
console.log(`✓ Smithery nhận bản ${manifest.version} (${manifest.tools.length} tool)`);
console.log('Kiểm lại sau ~1 phút: curl -H "Authorization: Bearer <key>" https://api.smithery.ai/servers/mon%2Fmonacloud-mcp');
