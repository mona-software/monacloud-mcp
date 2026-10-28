import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../dist/server.js';

async function listTools(remote) {
  const server = createServer({
    remote,
    env: { MONACLOUD_TOKEN: 'test-token', MONACLOUD_CONFIG_DIR: '/tmp/monacloud-remote-tools-test' },
    fetchImpl: async () => { throw new Error('tools/list không được gọi mạng'); },
  });
  const client = new Client({ name: 'remote-tools-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return (await client.listTools()).tools;
  } finally {
    await client.close();
  }
}

test('remote server chỉ công bố app deploy từ git, local server vẫn có local_dir', async () => {
  const remoteTools = await listTools(true);
  const localTools = await listTools(false);
  const byName = (tools, name) => tools.find((tool) => tool.name === name);

  assert.equal(byName(remoteTools, 'cloud_app_detect'), undefined);
  assert.equal(byName(remoteTools, 'vibecloud_app_detect'), undefined);
  assert.ok(byName(localTools, 'cloud_app_detect'));

  for (const name of ['cloud_app_create', 'vibecloud_app_create']) {
    const tool = byName(remoteTools, name);
    assert.ok(tool, `${name} phải tồn tại`);
    assert.equal(tool.inputSchema.properties.local_dir, undefined);
    assert.ok(tool.inputSchema.required.includes('repo_url'));
    assert.match(tool.description, /Bản từ xa chỉ deploy từ git/);
  }
  for (const name of ['cloud_app_deploy', 'vibecloud_app_deploy']) {
    const tool = byName(remoteTools, name);
    assert.equal(tool.inputSchema.properties.local_dir, undefined);
    assert.match(tool.description, /dùng MCP local \(npx\)/);
  }

  assert.ok(byName(localTools, 'cloud_app_create').inputSchema.properties.local_dir);
  assert.ok(byName(localTools, 'cloud_app_deploy').inputSchema.properties.local_dir);
});
