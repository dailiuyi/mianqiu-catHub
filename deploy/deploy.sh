#!/usr/bin/env bash
# Deploy mianqiu-catHub to the elma-gohan server (release dirs + symlink swap).
# Usage: SSH_KEY=~/.ssh/id_ed25519_elma_gohan deploy/deploy.sh [user@host]
set -euo pipefail

cd "$(dirname "$0")/.."
TARGET="${1:-root@elma-gohan.xyz}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_elma_gohan}"
SSH=(ssh -i "$SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes "$TARGET")
RELEASE="rel-$(date -u +%Y%m%dT%H%M%SZ)"
BASE=/opt/mianqiu-cathub

echo "== upload $RELEASE"
tar -czf - --exclude='__pycache__' index.html static data images server requirements-server.txt \
  | "${SSH[@]}" "install -d -m 0755 $BASE/releases/$RELEASE && tar -xzf - -C $BASE/releases/$RELEASE"
scp -q -i "$SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes \
  deploy/mianqiu-cathub.service deploy/mianhuacat.elma-gohan.xyz.conf "$TARGET:/tmp/"

"${SSH[@]}" bash -s "$RELEASE" <<'REMOTE'
set -euo pipefail
RELEASE="$1"; BASE=/opt/mianqiu-cathub
id mianqiu >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin mianqiu
[ -d $BASE/venv ] || python3 -m venv $BASE/venv
$BASE/venv/bin/pip install -q -i https://pypi.tuna.tsinghua.edu.cn/simple -r $BASE/releases/$RELEASE/requirements-server.txt
chown -R root:root $BASE/releases/$RELEASE
find $BASE/releases/$RELEASE -type d -exec chmod 0755 {} + ; find $BASE/releases/$RELEASE -type f -exec chmod 0644 {} +

PREV=$(readlink -f $BASE/current 2>/dev/null || true)
ln -sfn $BASE/releases/$RELEASE $BASE/current
install -m 0644 /tmp/mianqiu-cathub.service /etc/systemd/system/mianqiu-cathub.service
systemctl daemon-reload
systemctl enable mianqiu-cathub >/dev/null 2>&1
systemctl restart mianqiu-cathub

rollback() {
  echo "!! health check failed, rolling back"
  [ -n "$PREV" ] && ln -sfn "$PREV" $BASE/current && systemctl restart mianqiu-cathub
  exit 1
}
for _ in 1 2 3 4 5 6 7 8 9 10; do
  curl -fsS http://127.0.0.1:8093/api/v1/bot/summary >/dev/null 2>&1 && ok=1 && break
  sleep 1
done
[ "${ok:-}" = 1 ] || rollback

NGX=/etc/nginx/conf.d/mianhuacat.elma-gohan.xyz.conf
[ -f $NGX ] && cp $NGX $NGX.bak-$RELEASE
install -m 0644 /tmp/mianhuacat.elma-gohan.xyz.conf $NGX
if nginx -t 2>/dev/null; then
  systemctl reload nginx
else
  nginx -t; echo "!! nginx test failed, removing our vhost"; rm -f $NGX; exit 1
fi
ls -1dt $BASE/releases/rel-* | tail -n +4 | xargs -r rm -rf
rm -f /tmp/mianqiu-cathub.service /tmp/mianhuacat.elma-gohan.xyz.conf
echo "DEPLOYED $RELEASE"
REMOTE
