# Production deployment (Nginx + systemd)

This guide deploys the React build and API as one Node.js service. Nginx is the only public process and terminates HTTPS; Node listens on `127.0.0.1:3001`.

The current production domain is `loken-loki.cn`. Replace it when deploying a separate environment.

## 1. Prepare DNS and the firewall

1. Add `A` records for both `loken-loki.cn` and `www.loken-loki.cn` pointing to `8.134.179.177`.
2. In the cloud security group, allow inbound TCP `80` and `443` from the internet.
3. Restrict SSH `22` to trusted IP addresses where possible.
4. Do not expose Node port `3001` publicly.
5. Do not expose MySQL publicly. When MySQL and the website run on the same server, connect through `127.0.0.1:3308`.

If the server is in mainland China, complete the required ICP filing before making the site public. Alibaba Cloud documents the current requirements at <https://www.alibabacloud.com/help/en/icp-filing/>.

## 2. Install server software

Install these packages on Ubuntu:

```bash
sudo apt update
sudo apt install -y git nginx curl ca-certificates snapd
```

Install an official Node.js LTS release that satisfies `node >= 22.12`, then verify that the executable is `/usr/bin/node`:

```bash
node --version
command -v node
npm --version
```

If `command -v node` is not `/usr/bin/node`, update `ExecStart` in `deploy/kotoba.service` before installing the service. Current official Node.js downloads are listed at <https://nodejs.org/en/download>.

## 3. Create the application user and clone the project

```bash
sudo useradd --system --create-home --shell /bin/bash kotoba
sudo mkdir -p /opt/kotoba
sudo chown kotoba:kotoba /opt/kotoba
sudo -u kotoba git clone https://github.com/LokenQin/Japanese_Learning.git /opt/kotoba
cd /opt/kotoba
sudo -u kotoba npm ci
sudo -u kotoba npm run build
```

For a private GitHub repository, configure a read-only deploy key instead of putting a personal token in the clone URL.

## 4. Create the production environment

```bash
sudo -u kotoba cp /opt/kotoba/.env.example /opt/kotoba/.env
sudo chmod 600 /opt/kotoba/.env
sudo nano /opt/kotoba/.env
```

Use these API settings:

```dotenv
API_HOST=127.0.0.1
API_PORT=3001
APP_ORIGINS=https://loken-loki.cn,https://www.loken-loki.cn
APP_PUBLIC_URL=https://loken-loki.cn
COOKIE_SECURE=true
TRUST_PROXY=true
ALLOW_REGISTRATION=true
SESSION_DAYS=30
```

Password recovery uses a private keyword that is hashed in the users table. Run schema migrations with a database account that has DDL permission before restarting the application:

```bash
cd /opt/kotoba
npm run db:migrate
```

The runtime database account should keep only `SELECT`, `INSERT`, `UPDATE`, and `DELETE`; do not permanently grant it schema modification privileges.

Fill in the existing `DB_*` settings as well. Use a dedicated MySQL application account with only `SELECT`, `INSERT`, `UPDATE`, and `DELETE` access to the application database. Do not run the website with the MySQL `root` account.

When MySQL is on the same server, prefer:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3308
```

The local loopback connection does not need to cross the public network. Keep TLS enabled when the database is on another host.

## 5. Install and start the Node service

```bash
sudo cp /opt/kotoba/deploy/kotoba.service /etc/systemd/system/kotoba.service
sudo systemctl daemon-reload
sudo systemctl enable --now kotoba
sudo systemctl status kotoba --no-pager
curl --fail http://127.0.0.1:3001/api/health
```

View application logs with:

```bash
sudo journalctl -u kotoba -f
```

## 6. Configure Nginx

```bash
sed 's/__DOMAIN__/learn.example.com/g' /opt/kotoba/deploy/nginx.conf | sudo tee /etc/nginx/sites-available/kotoba >/dev/null
sudo ln -s /etc/nginx/sites-available/kotoba /etc/nginx/sites-enabled/kotoba
sudo nginx -t
sudo systemctl reload nginx
```

Remove `/etc/nginx/sites-enabled/default` if the Ubuntu default page conflicts with this virtual host.

The reverse-proxy headers follow the Nginx proxy module guidance: <https://nginx.org/en/docs/http/ngx_http_proxy_module.html>.

On the current Alibaba Cloud Linux server, Kotoba uses the isolated `kotoba-nginx.service` and `/etc/kotoba-nginx/nginx.conf`. This avoids coupling the website to unrelated global Nginx virtual hosts. The checked-in `deploy/kotoba-nginx.conf` is the production configuration for `loken-loki.cn`.

## 7. Enable HTTPS

After DNS resolves to the server and HTTP works:

```bash
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/local/bin/certbot
sudo certbot --nginx -d learn.example.com
sudo certbot renew --dry-run
```

Certbot's current Nginx instructions are at <https://certbot.eff.org/instructions?ws=nginx&os=ubuntufocal>.

The current server cannot route to Let's Encrypt's ACME endpoint, so it uses `acme.sh` with ZeroSSL instead. The certificate is installed at `/etc/kotoba-nginx/tls`, and `kotoba-acme-renew.timer` checks renewal daily. Verify it with:

```bash
sudo systemctl status kotoba-acme-renew.timer --no-pager
sudo /opt/acme.sh/acme.sh --cron \
  --home /opt/acme.sh \
  --config-home /etc/acme.sh \
  --cert-home /etc/acme.sh/certs
```

After switching an existing IP-only deployment to the domain, run:

```bash
sudo bash /opt/kotoba/deploy/configure-domain.sh loken-loki.cn
```

This keeps Node on `127.0.0.1:8080`, enables secure cookies and trusted proxy handling, restricts browser origins to the two HTTPS hostnames, and removes the host firewall rule for port `8080`.

Open `https://learn.example.com`, register a temporary account, complete one task, refresh the page, and confirm that the learning state remains saved.

## Updating the website

Run from an administrator account that can restart the service:

```bash
cd /opt/kotoba
bash deploy/update.sh
```

The script pulls `main`, installs the locked dependencies, rebuilds the frontend, restarts the service, and waits for the database health check.

## Rollback

Use a known good commit without rewriting Git history:

```bash
cd /opt/kotoba
git log --oneline -10
git switch --detach GOOD_COMMIT_SHA
npm ci
npm run build
sudo systemctl restart kotoba
```

Return to normal updates with:

```bash
git switch main
git pull --ff-only origin main
```
