import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import { Duplex } from "node:stream";
import { after, before, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createRemoteServer } from "../dist/remote.js";
import { createServer as remoteTestServer } from "../dist/server.js";

const PUBLIC_URL = "https://mcp.monacloud.vn";
const ISSUER = "https://pass.monacloud.vn/realms/mona";
let remote;
const upstreamRequests = [];

async function appFetch(input, init = {}) { return appFetchFor(remote.app, input, init); }

async function appFetchFor(app, input, init = {}) {
  const request = input instanceof Request ? input : new Request(String(input), init);
  const url = new URL(request.url);
  const body = request.body ? Buffer.from(await request.arrayBuffer()) : Buffer.alloc(0);
  const socket = new Duplex({ read() {}, write(_chunk, _encoding, callback) { callback(); } });
  const req = new IncomingMessage(socket);
  req.method = request.method;
  req.url = `${url.pathname}${url.search}`;
  req.headers = Object.fromEntries(request.headers);
  req.headers.host = url.host;
  req.rawHeaders = Object.entries(req.headers).flatMap(([name, value]) => [name, value]);
  if (body.length && !req.headers["content-length"]) req.headers["content-length"] = String(body.length);
  if (body.length && req.headers["content-type"]?.includes("application/json")) {
    req.body = JSON.parse(body.toString("utf8"));
  }
  req.push(body.length ? body : null);
  if (body.length) req.push(null);

  const res = new ServerResponse(req);
  const chunks = [];
  return await new Promise((resolve, reject) => {
    res.write = (chunk, encoding, callback) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      if (typeof encoding === "function") encoding();
      else if (callback) callback();
      return true;
    };
    res.end = (chunk, encoding, callback) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === "string" ? encoding : undefined));
      if (typeof encoding === "function") encoding();
      else if (callback) callback();
      res.emit("finish");
      const responseBody = Buffer.concat(chunks);
      resolve(new Response(responseBody, {
        status: res.statusCode,
        // statusText chỉ nhận latin-1; thông điệp lỗi tiếng Việt có dấu sẽ làm Response ném lỗi,
        // nên bỏ ký tự ngoài ASCII. Thân phản hồi đầy đủ vẫn đọc được bằng response.json().
        statusText: res.statusCode >= 400
          ? responseBody.toString("utf8").replace(/[^\x20-\x7e]/g, "?").slice(0, 200)
          : undefined,
        headers: Object.entries(res.getHeaders()).map(([name, value]) => [name, Array.isArray(value) ? value.join(", ") : String(value)]),
      }));
      return res;
    };
    app(req, res, reject);
  });
}

function mockFetch(input, init = {}) {
  const url = String(input);
  if (url.endsWith("/.well-known/openid-configuration")) {
    return Promise.resolve(new Response(JSON.stringify({
      authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
      token_endpoint: `${ISSUER}/protocol/openid-connect/token`,
      revocation_endpoint: `${ISSUER}/protocol/openid-connect/revoke`,
    }), { status: 200, headers: { "content-type": "application/json" } }));
  }
  if (url.endsWith("/clients-registrations/openid-connect")) {
    upstreamRequests.push({ url, init });
    const request = JSON.parse(init.body);
    return Promise.resolve(new Response(JSON.stringify({
      ...request,
      client_id: "registered-client",
      client_id_issued_at: 1_700_000_000,
    }), { status: 201, headers: { "content-type": "application/json" } }));
  }
  throw new Error(`Unexpected network request: ${url}`);
}

before(async () => {
  remote = await createRemoteServer({
    publicUrl: PUBLIC_URL,
    issuer: ISSUER,
    initialAccessToken: "initial-secret",
    fetch: mockFetch,
    verifyAccessToken: async (token) => {
      if (token !== "valid-token") throw new Error("invalid token");
      return {
        token,
        clientId: "test-client",
        scopes: ["vibecloud-api"],
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        extra: { sub: "test-subject" },
      };
    },
  });
});

after(async () => {
  await remote.close();
});

test("protected-resource metadata has the required shape", async () => {
  const response = await appFetch(`${PUBLIC_URL}/.well-known/oauth-protected-resource`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    resource: `${PUBLIC_URL}/mcp`,
    authorization_servers: [PUBLIC_URL],
    bearer_methods_supported: ["header"],
    scopes_supported: ["openid", "profile", "email", "offline_access", "vibecloud-api", "billing-api"],
  });
});

test("MCP without a bearer token returns an OAuth challenge", async () => {
  const response = await appFetch(`${PUBLIC_URL}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("www-authenticate"), `Bearer resource_metadata="${PUBLIC_URL}/.well-known/oauth-protected-resource"`);
});

test("MCP rejects an invalid bearer token", async () => {
  const response = await appFetch(`${PUBLIC_URL}/mcp`, { method: "POST", headers: { authorization: "Bearer fake-token", "content-type": "application/json" }, body: "{}" });
  assert.equal(response.status, 401);
});

test("Streamable HTTP initializes and lists at least 100 tools", async () => {
  const client = new Client({ name: "remote-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${PUBLIC_URL}/mcp`), {
    requestInit: { headers: { authorization: "Bearer valid-token" } },
    fetch: appFetch,
  });
  await client.connect(transport);
  const result = await client.listTools();
  assert.ok(result.tools.length >= 100, `expected at least 100 tools, got ${result.tools.length}`);
  await client.close();
});

test("dynamic registration adds the Keycloak initial access token", async () => {
  const redirectUris = ["https://claude.ai/api/mcp/auth_callback"];  // phải thuộc allowlist host (vá bảo mật 21/09)
  const response = await appFetch(`${PUBLIC_URL}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ redirect_uris: redirectUris, client_name: "Test client" }),
  });
  assert.equal(response.status, 201);
  assert.equal(upstreamRequests.length, 1);
  assert.equal(upstreamRequests[0].init.headers.authorization, "Bearer initial-secret");
  const forwarded = JSON.parse(upstreamRequests[0].init.body);
  assert.deepEqual(forwarded.redirect_uris, ["https://mcp.monacloud.vn/callback"]);  // KHÔNG đẩy redirect_uri của client lên Keycloak
  assert.deepEqual(forwarded.grant_types, ["authorization_code", "refresh_token"]);
  assert.equal(forwarded.token_endpoint_auth_method, "none");
  assert.equal(forwarded.scope, "profile email roles basic offline_access vibecloud-api billing-api");
});

test("each MONA Pass user gets an isolated MONACLOUD_CONFIG_DIR (no shared links.json)", async () => {
  const seen = [];
  const isolated = await createRemoteServer({
    publicUrl: PUBLIC_URL, issuer: ISSUER, initialAccessToken: "initial-secret", fetch: mockFetch,
    verifyAccessToken: async (token) => ({ token, clientId: "c", scopes: [], expiresAt: Math.floor(Date.now() / 1000) + 600, extra: { sub: token === "user-a" ? "sub-a" : "sub-b" } }),
    createServer: (deps) => { seen.push(deps.env.MONACLOUD_CONFIG_DIR); return remoteTestServer(deps); },
  });
  const fetchIsolated = (input, init) => appFetchFor(isolated.app, input, init);
  for (const token of ["user-a", "user-b"]) {
    await fetchIsolated(`${PUBLIC_URL}/mcp`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }) });
  }
  assert.equal(seen.length, 2);
  assert.notEqual(seen[0], seen[1]);
  assert.ok(seen[0].endsWith("/users/sub-a") && seen[1].endsWith("/users/sub-b"));
  await isolated.close();
});

test("dynamic registration rejects a redirect_uri outside the allowlist", async () => {
  const before = upstreamRequests.length;
  const response = await appFetch(`${PUBLIC_URL}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ redirect_uris: ["https://evil.example/steal"], client_name: "Kẻ lạ" }),
  });
  // Phải là 400 + mã lỗi OAuth, KHÔNG phải 500: client thật gặp 500 sẽ tưởng máy chủ hỏng
  // rồi thử lại mãi, thay vì đọc lỗi và sửa redirect_uri của nó.
  assert.equal(response.status, 400, `phải trả 400, nhận ${response.status}`);
  const body = await response.json();
  assert.equal(body.error, "invalid_client_metadata", `mã lỗi sai: ${JSON.stringify(body)}`);
  assert.ok(String(body.error_description || "").includes("evil.example"),
    "lỗi phải nói rõ redirect_uri nào bị từ chối");
  assert.equal(upstreamRequests.length, before, "không được gọi Keycloak khi redirect_uri không hợp lệ");
});

test("dynamic registration rejects http on a non-localhost host", async () => {
  const before = upstreamRequests.length;
  const response = await appFetch(`${PUBLIC_URL}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ redirect_uris: ["http://claude.ai/api/mcp/auth_callback"], client_name: "Kẻ lạ http" }),
  });
  assert.equal(response.status, 400, `phải trả 400, nhận ${response.status}`);
  assert.equal((await response.json()).error, "invalid_client_metadata");
  assert.equal(upstreamRequests.length, before, "không được gọi Keycloak khi redirect_uri dùng http");
});

test("dynamic registration rejects an empty redirect_uris", async () => {
  const before = upstreamRequests.length;
  const response = await appFetch(`${PUBLIC_URL}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ redirect_uris: [], client_name: "Rỗng" }),
  });
  assert.ok(response.status >= 400 && response.status < 500, `phải là lỗi 4xx, nhận ${response.status}`);
  assert.equal(upstreamRequests.length, before, "không được gọi Keycloak khi thiếu redirect_uris");
});
