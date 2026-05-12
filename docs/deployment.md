# Single-Server Deployment

This is the baseline production shape for an OpenB2C app: one host, one generated Bun REST server, one SQLite database file, and static generated UI files served by the front proxy.

The example below uses Duchy Opera paths. Replace `duchyopera` and the public host name for another composition.

## Host Layout

Keep releases, mutable data, backups, and secrets separate:

```text
/srv/openb2c/duchyopera/releases/YYYYmmdd-HHMMSS/generated/
/srv/openb2c/duchyopera/current -> /srv/openb2c/duchyopera/releases/YYYYmmdd-HHMMSS
/var/lib/openb2c/duchyopera/app.db
/var/backups/openb2c/duchyopera/
/etc/openb2c/duchyopera.env
```

The release directory is replaceable. The SQLite database and backups are not part of the release and must survive deploys.

## Build A Release

Generate the app from the repository root:

```bash
nix develop -c compose examples/duchyopera/composition.nix
```

Copy the generated output to a timestamped release directory:

```bash
release="$(date +%Y%m%d-%H%M%S)"
sudo install -d -o openb2c -g openb2c "/srv/openb2c/duchyopera/releases/$release"
sudo rsync -a --delete --chown=openb2c:openb2c examples/duchyopera/generated/ "/srv/openb2c/duchyopera/releases/$release/generated/"
sudo ln -sfn "/srv/openb2c/duchyopera/releases/$release" /srv/openb2c/duchyopera/current
```

Do not copy a development database into the release. The production database path comes from `DB_PATH`.

## Environment

Create `/etc/openb2c/duchyopera.env` with deployment-specific values:

```bash
NODE_ENV=production
AUTH_ENABLED=true
DB_PATH=/var/lib/openb2c/duchyopera/app.db
PORT=3085
CORS_ORIGINS=https://duchyopera.example

REGISTRY_PRIVATE_KEY=
ALLOW_EPHEMERAL_REGISTRY_KEYS=false

EMAIL_PROVIDER=resend
RESEND_API_KEY=
EMAIL_FROM="Duchy Opera <login@duchyopera.example>"

PAYMENT_PROVIDER=stripe
PAYMENT_API_KEY=
PAYMENT_WEBHOOK_SECRET=

ALLOW_FAKE_PROVIDERS=false
```

Use the generated `.env.example` for the full contract. Keep real secret values in the host secret store or a root-readable environment file, not in source control.

## systemd Service

Install Bun and SQLite on the host, then run the generated server under an unprivileged user:

```ini
[Unit]
Description=OpenB2C Duchy Opera API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=openb2c
Group=openb2c
WorkingDirectory=/srv/openb2c/duchyopera/current/generated
EnvironmentFile=/etc/openb2c/duchyopera.env
ExecStart=/usr/local/bin/bun server.ts
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/var/lib/openb2c/duchyopera /var/backups/openb2c/duchyopera

[Install]
WantedBy=multi-user.target
```

Enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now openb2c-duchyopera.service
curl -fsS http://127.0.0.1:3085/health
```

The server logs structured JSON to stdout. Use `journalctl -u openb2c-duchyopera.service` or your host log shipper for request logs, startup diagnostics, and graceful shutdown events.

## Caddy Front Proxy

Serve the generated public UI, generated admin UI, and API from the same origin:

```caddy
duchyopera.example {
  encode zstd gzip

  @api path /api/* /commerce/* /auth/* /identity/* /ops/* /health
  reverse_proxy @api 127.0.0.1:3085

  handle_path /admin* {
    root * /srv/openb2c/duchyopera/current/generated/ui/admin
    try_files {path} /index.html
    file_server
  }

  handle {
    root * /srv/openb2c/duchyopera/current/generated/ui
    try_files {path} /index.html
    file_server
  }
}
```

With a same-origin proxy, browser requests can use the generated default API base and production can still keep `CORS_ORIGINS` explicit.

## Deployment Flow

Before replacing `current`, take and verify a backup:

```bash
backup="/var/backups/openb2c/duchyopera/app-$(date +%Y%m%d-%H%M%S).db"
sqlite3 /var/lib/openb2c/duchyopera/app.db "PRAGMA wal_checkpoint(TRUNCATE);"
sqlite3 /var/lib/openb2c/duchyopera/app.db ".backup '$backup'"
sqlite3 "$backup" "PRAGMA integrity_check;"
```

Then switch the release symlink and restart:

```bash
sudo ln -sfn "/srv/openb2c/duchyopera/releases/$release" /srv/openb2c/duchyopera/current
sudo systemctl restart openb2c-duchyopera.service
curl -fsS http://127.0.0.1:3085/health
```

Generated startup diagnostics should report the expected app version, migration state, integration providers, and configured environment variables.

## MCP

The generated MCP server is a separate process. Use stdio locally, or run `bun mcp.ts --http` behind an authenticated internal route only when you deliberately expose MCP over HTTP.
