import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../dist/server.js';

const json = (body, status = 200) => ({
  ok: status < 400,
  status,
  headers: { get: () => null },
  text: async () => JSON.stringify(body),
});
const data = (result) => JSON.parse(result.content[0].text);
const call = (client, name, args = {}) => client.callTool({ name, arguments: args });

async function fixture(fetcher, run) {
  const directory = await mkdtemp(join(tmpdir(), 'mcp-affiliate-'));
  const calls = [];
  const server = createServer({
    env: {
      MONACLOUD_TOKEN: 'fake-pass',
      VIBECLOUD_API_TOKEN: 'fake-compute',
      MONACLOUD_CONFIG_DIR: directory,
      MONACLOUD_API: 'https://compute.test',
      MONACLOUD_BILLING_URL: 'https://billing.test',
    },
    fetchImpl: async (url, init) => {
      const parsed = new URL(url);
      const request = {
        path: parsed.pathname,
        query: Object.fromEntries(parsed.searchParams),
        method: init.method || 'GET',
        body: init.body === undefined ? undefined : JSON.parse(init.body),
      };
      calls.push(request);
      return fetcher(request, calls);
    },
  });
  const client = new Client({ name: 'affiliate-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  try {
    await run(client, calls);
  } finally {
    await client.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test('Affiliate tools and vibecloud aliases are registered', async () => {
  await fixture(() => json({}), async (client) => {
    const { tools } = await client.listTools();
    for (const name of ['cloud_affiliate_link', 'cloud_affiliate_stats', 'cloud_affiliate_claim']) {
      const tool = tools.find((entry) => entry.name === name);
      const alias = tools.find((entry) => entry.name === name.replace(/^cloud_/, 'vibecloud_'));
      assert.ok(tool, `Missing tool: ${name}`);
      assert.ok(alias, `Missing alias for: ${name}`);
      assert.deepEqual(alias.inputSchema, tool.inputSchema);
      assert.equal(tool.inputSchema.additionalProperties, false);
    }
  });
});

test('cloud_affiliate_link calls GET /api/me/affiliate and returns disclosure guidance', async () => {
  await fixture((request) => {
    assert.equal(request.method, 'GET');
    assert.equal(request.path, '/api/me/affiliate');
    return json({
      referral_code: 'MONA2026',
      link: 'https://monacloud.vn/?ref=MONA2026',
      console_link: 'https://monacloud.vn/console/affiliate',
      tier: 'standard',
      rates: { year1_pct: 20, lifetime_pct: 10 },
      stats: { clicks_total: 12 },
    });
  }, async (client, calls) => {
    const result = data(await call(client, 'cloud_affiliate_link'));
    assert.equal(calls.length, 1);
    assert.equal(result.referral_code, 'MONA2026');
    assert.equal(result.stats, undefined);
    assert.match(result.next_step, /link giới thiệu, MONA Cloud chia sẻ doanh thu/);
    assert.match(result.next_step, /Không tự đăng/);
  });
});

test('cloud_affiliate_stats merges profile and filtered commissions', async () => {
  await fixture((request) => {
    if (request.path === '/api/me/affiliate') {
      return json({ stats: { clicks_total: 9 }, payout_available_vnd: 250000, can_request_payout: true });
    }
    assert.equal(request.path, '/api/me/affiliate/commissions');
    assert.deepEqual(request.query, { status: 'approved', limit: '5' });
    return json({ commissions: [{ id: 'commission-1', status: 'approved' }] });
  }, async (client) => {
    const result = data(await call(client, 'cloud_affiliate_stats', { status: 'approved', limit: 5 }));
    assert.deepEqual(result.stats, { clicks_total: 9 });
    assert.equal(result.payout_available_vnd, 250000);
    assert.equal(result.can_request_payout, true);
    assert.equal(result.commissions[0].id, 'commission-1');
  });
});

test('cloud_affiliate_claim maps HTTP 410 to an agent error with next_step', async () => {
  await fixture((request) => {
    assert.equal(request.method, 'POST');
    assert.equal(request.path, '/api/me/referral/claim');
    assert.deepEqual(request.body, { code: 'MONA2026' });
    return json({
      detail: {
        code: 'referral_claim_window_closed',
        message: 'Đã hết thời hạn nhận mã giới thiệu.',
        next_step: 'Tiếp tục dùng tài khoản hiện tại mà không gắn mã.',
      },
    }, 410);
  }, async (client) => {
    const response = await call(client, 'cloud_affiliate_claim', { code: 'MONA2026' });
    const error = data(response);
    assert.equal(response.isError, true);
    assert.equal(error.code, 'referral_claim_window_closed');
    assert.equal(error.message, 'Đã hết thời hạn nhận mã giới thiệu.');
    assert.equal(typeof error.next_step, 'string');
    assert.ok(error.next_step.length > 0);
  });
});
