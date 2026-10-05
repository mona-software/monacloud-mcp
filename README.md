# monacloud-mcp

MCP server for MONA Cloud: one MONA Pass login and one VND wallet to deploy apps, run VPS, databases and Base projects, manage domains, accept payments with MONA Pay, send email with MONA Mail and browse MONA Agent templates from Claude Code, Codex, Cursor or any MCP client.

## Install

Requires Node.js 20 or later.

Sign in once with the OAuth device flow:

```bash
npx -y monacloud-mcp login
```

The command prints a URL on `pass.monacloud.vn` and a device code. After you confirm, the refresh token is stored in `~/.config/monacloud/token.json` (directory mode `0700`, file mode `0600`). The server refreshes access tokens automatically and never logs them.

```bash
npx -y monacloud-mcp whoami   # show the signed-in MONA Pass profile
npx -y monacloud-mcp logout   # remove stored tokens and linked credentials
```

Domain search and reservation work without signing in.

### Claude Code

```bash
claude mcp add monacloud -- npx -y monacloud-mcp
```

### Codex (`~/.codex/config.toml`)

```toml
[mcp_servers.monacloud]
command = "npx"
args = ["-y", "monacloud-mcp"]
```

### Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "monacloud": {
      "command": "npx",
      "args": ["-y", "monacloud-mcp"]
    }
  }
}
```

### Remote endpoint

A hosted Streamable HTTP endpoint is available at `https://mcp.monacloud.vn/mcp`. Clients that support remote MCP servers (Claude.ai custom connectors, Cursor, Codex, ChatGPT developer mode) open MONA Pass to sign in on first use. See [docs/remote.md](docs/remote.md).

## Quick start

Ask your agent, for example: "Deploy this project to MONA Cloud from the current directory."

A typical run:

```text
cloud_app_detect({ local_dir: "/absolute/path/to/project" })            // offline: stack, port, start command, env names
cloud_app_create({ local_dir: "/absolute/path/to/project", name: "shop", sandbox: true })  // estimate only
// after the user approves the cost
cloud_app_create({ local_dir: "/absolute/path/to/project", name: "shop" })
cloud_app_domain_add({ app_id: "<app_id>", host: "shop.example.vn" })  // returns CNAME instructions
```

The upload is a ZIP of up to 80 MiB. It respects `.gitignore`/`.dockerignore` and excludes `.env*`, `*.pem`, `.git`, `node_modules` and symlinks. Git repositories can be deployed with `repo_url` instead of `local_dir`. Details: [docs/local-deploy.md](docs/local-deploy.md).

If the wallet balance is too low, the agent calls `cloud_topup(amount)`. The response includes `qr_ascii` (a VietQR code drawn in the terminal), `qr_file` (PNG), `qr_url`, bank, account number, amount and transfer note. The user scans it with a banking app and the agent polls `cloud_topup_status(topup_id)` until it is `paid`.

## Usage

Tool names use `snake_case`. Most `cloud_*` tools also have a `vibecloud_*` alias with the same schema for older prompts. The groups below show representative tools; your MCP client lists the full set.

### Apps and deploy

- `cloud_app_detect`, `cloud_app_create`, `cloud_app_deploy`, `cloud_app_list`, `cloud_app_get`, `cloud_app_logs`, `cloud_app_env_set`, `cloud_app_domain_add`, `cloud_app_delete`, `cloud_app_host_list`
- VPS and services: `cloud_vps_create` (hourly or monthly by `plan_code`), `cloud_services_list`, `cloud_service_start`, `cloud_service_stop`, `cloud_service_rebuild`, `cloud_job_status`
- Long jobs wait up to 600 seconds; pass `wait: false` and poll `cloud_job_status` if your client has a short timeout.

### Databases and Base (beta)

- `cloud_db_create`: MongoDB, PostgreSQL or MySQL.
- `cloud_base_create`, `cloud_base_list`, `cloud_base_get`, `cloud_base_credentials`, `cloud_base_delete`: Base projects (Postgres with API keys and a studio URL) on the same account and wallet as your apps. `cloud_base_credentials` returns `anon_key`, `service_key` and `db_url`; treat them as secrets.

### Domains

- Search and price lookup (no login needed): `cloud_domain_search`, `cloud_domain_suggest`, `cloud_domain_tlds`, `cloud_domain_tld_groups`
- Purchase: `cloud_domain_buy` (signed in), or `cloud_domain_reserve` → `cloud_domain_reserve_status` → `cloud_domain_claim` for users without an account yet; `cloud_domain_reserve_release` frees a hold
- Registrant and `.vn` verification: `cloud_domain_registrant_get`, `cloud_domain_registrant_set`, `cloud_domain_verify_start`, `cloud_domain_verify_status`, `cloud_domain_wait`
- Management: `cloud_domain_list`, `cloud_domain_renew`, `cloud_domain_dns_list`/`_add`/`_update`/`_delete`, `cloud_domain_ns_set`, `cloud_domain_attach` (point a domain at an app with SSL), `cloud_domain_health`, `cloud_domain_webhook_set`

### Wallet and billing

- `cloud_whoami`, `cloud_balance`, `cloud_ledger`, `cloud_usage`, `cloud_services`
- `cloud_topup`, `cloud_topup_status`, `cloud_credit_redeem`
- `cloud_prices`, `cloud_packages`, `cloud_plan_list`, `cloud_subscription_list`, `cloud_subscription_update`, `cloud_invoice_list`, `cloud_invoice_pdf`
- Spend controls: `cloud_budget_set`, `cloud_budget_get`, `cloud_token_limit`
- Referral: `cloud_affiliate_link`, `cloud_affiliate_stats`, `cloud_affiliate_claim`

Before a paid compute action the server checks the wallet balance (`cloud_service_stop` is never blocked). HTTP `402 insufficient_funds` and `402 budget_exceeded` are returned as JSON with `code`, `message`, `next_step` and `request_id` so the agent can top up or raise the budget and retry.

### MONA Pay

All tools from [`monapay-mcp`](https://www.npmjs.com/package/monapay-mcp) are re-exported (dependency `^0.5.5`), for example `monapay_create_qr`, `monapay_create_checkout`, `monapay_link_bank_start`, `monapay_list_transactions`, `monapay_create_webhook`, `monapay_test_webhook` and `monapay_verify_signature`. `monapay_link` exchanges the MONA Pass session for MONA Pay credentials and caches them in `~/.config/monacloud/links.json`.

### MONA Mail

`mail_*` tools use the same MONA Pass session; the Mail account is created on first request.

- Sending: `mail_send` (supports `sandbox: true`), `mail_status`, `mail_list`, `mail_stats`, `mail_template_create`
- Domains: `mail_domain_add`, `mail_domain_verify`, `mail_domain_cloudflare`, `mail_domains_list`
- API keys for your app: `mail_api_key_create`, `mail_api_keys_list`, `mail_api_key_revoke`
- Webhooks and suppressions: `mail_webhook_create`, `mail_webhooks_list`, `mail_webhook_test`, `mail_suppressions_list`, `mail_suppression_remove`
- Agent inboxes: `mail_inbox_create`, `mail_inbox_list`, `mail_inbox_messages`, `mail_inbox_message`, `mail_inbox_reply`, `mail_inbox_wait`
- Account and plans: `mail_account`, `mail_plans`, `mail_plan_set`

Every POST sends an `Idempotency-Key` (from `idempotency_key` or generated). API keys are returned once; write them to the app's `.env` as `MONAMAIL_API_KEY`.

### MONA Agent templates

- `agent_templates_list`: reads `MONACLOUD_TEMPLATES_DIR` first, then the public [mona-agent-templates](https://github.com/mona-software/mona-agent-templates) catalog, then a built-in fallback.
- `agent_templates_get(template)`: returns the template files (`README.md`, `AGENTS.md`, `tools.json`, `deploy.md`, `CHECKLIST.md`, skills).
- `agent_deploy` / `cloud_agent_deploy`: placeholder that currently returns `agent_runtime_pending`.

### Resources and prompts

- `monacloud://llms`: machine-readable description of the MONA Cloud stack.
- `monacloud://status`: aggregated health of MONA Pass, Billing, compute, MONA Pay and MONA Mail.
- Prompts: `dung-app-ban-hang-monacloud` (VPS, database, payments, webhook, deploy), `gui-mail-otp-monamail` (OTP email setup), `mua-ten-mien-monacloud` (domain purchase).

### Sandbox

Pass `sandbox: true` to `cloud_vps_create`, `cloud_db_create`, `cloud_service_start`, `cloud_service_rebuild`, `cloud_app_create`, `cloud_base_create` or `cloud_agent_deploy`, or set `MONACLOUD_SANDBOX=1`, to simulate a call. Sandbox skips the balance check, creates no real infrastructure, does not charge the wallet and returns `sandbox: true` with a cost estimate.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `MONACLOUD_TOKEN` | | MONA Pass access token or PAT; takes precedence over the token store (useful in CI) |
| `MONACLOUD_SANDBOX` | | `1` to run supported compute calls in sandbox mode |
| `MONACLOUD_ISSUER` | `https://pass.monacloud.vn/realms/mona` | OIDC issuer |
| `MONACLOUD_BILLING_URL` | `https://billing.monacloud.vn` | Billing and wallet API |
| `MONACLOUD_API` | `https://api.monacloud.vn` | Compute API |
| `MONAPAY_API` | `https://api.monapay.vn` | MONA Pay API |
| `MONAMAIL_API` | `https://api.monamail.vn` | MONA Mail API |
| `MONACLOUD_CONSOLE_URL` | `https://monacloud.vn/console` | Console URL returned for human steps |
| `MONACLOUD_CONFIG_DIR` | `~/.config/monacloud` | Token and link cache directory |
| `MONACLOUD_TEMPLATES_DIR` | `~/monacloud/templates` | Local agent template catalog |
| `MONACLOUD_TEMPLATES_URL` | mona-agent-templates on GitHub | Remote catalog; set to an empty string to disable |

Legacy variables (`VIBECLOUD_API`, `VIBECLOUD_API_URL`, `VIBECLOUD_API_TOKEN`, `MONAPAY_CLIENT_ID`, `MONAPAY_CLIENT_SECRET`, `MONAPAY_LINK_PATH`, `VIBECLOUD_LINK_PATH`) are still read for compatibility.

## Development

```bash
npm install
npm run build
npm test
```

Tests use the Node.js built-in runner, a real stdio MCP transport and local HTTP mocks; they make no Internet calls.

To self-host the remote server, see [deploy/remote/README.md](deploy/remote/README.md).

Website: [monacloud.vn](https://monacloud.vn).

## License

MIT

**MONA Cloud MCP is part of MONA Cloud by The MONA Group.**
