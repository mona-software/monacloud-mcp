# Deploy the remote MCP server

Runs `monacloud-mcp-remote` (Streamable HTTP with MONA Pass OAuth) behind nginx with Docker Compose.

## Configuration

Create `deploy/remote/.env.remote` (it is git-ignored) with:

| Variable | Required | Purpose |
|---|---|---|
| `MCP_REMOTE_PUBLIC_URL` | yes | Public base URL, e.g. `https://mcp.monacloud.vn` |
| `MONACLOUD_ISSUER` | yes | MONA Pass OIDC issuer, e.g. `https://pass.monacloud.vn/realms/mona` |
| `MONA_PASS_INITIAL_ACCESS_TOKEN` | yes | Keycloak initial access token used for dynamic client registration |
| `MCP_REMOTE_REDIRECT_HOSTS` | no | Comma-separated list of allowed OAuth redirect hosts |

Compose sets `MCP_REMOTE_BIND=0.0.0.0` and `MCP_REMOTE_DATA_DIR=/app/data`. The container listens on port `8765`, published only on `127.0.0.1` of the host.

To create the initial access token in the MONA Pass Keycloak realm, open **Realm → Clients → Initial access token**, set **count = 10000** and **expiration = 0**, and copy the token into `MONA_PASS_INITIAL_ACCESS_TOKEN`. Keep it only in the environment file on the server and never commit it.

## Deploy

```sh
docker compose -f deploy/remote/docker-compose.yml build
docker compose -f deploy/remote/docker-compose.yml up -d
sudo cp deploy/remote/nginx.mcp.monacloud.vn.conf /etc/nginx/sites-enabled/mcp.monacloud.vn.conf
sudo nginx -t && sudo systemctl reload nginx
```

Obtain a certificate for `mcp.monacloud.vn` with Certbot before enabling the HTTPS server block. Once the certificate is in place, the port 80 server only redirects to 443.

**MONA Cloud MCP is part of MONA Cloud by The MONA Group.**
