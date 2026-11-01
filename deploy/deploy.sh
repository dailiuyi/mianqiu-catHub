#!/usr/bin/env bash
set -euo pipefail

SSH_TARGET="${1:-}"
if [ -z "$SSH_TARGET" ]; then
    echo "用法: $0 <user@host 或 ssh_alias>"
    exit 1
fi

echo "=== 正在打包发布资源 ==="
RELEASE_TAR="/tmp/mianqiu-cathub-release.tar.gz"
tar --exclude='.git' --exclude='.venv' --exclude='__pycache__' --exclude='.wrangler' -czf "$RELEASE_TAR" .

echo "=== 正在上传至远程服务器 $SSH_TARGET ==="
scp "$RELEASE_TAR" "$SSH_TARGET:/tmp/mianqiu-cathub-release.tar.gz"

echo "=== 执行远程服务部署与 Nginx 配置 ==="
ssh "$SSH_TARGET" "bash -s" << 'EOF'
set -euo pipefail
mkdir -p /var/www/mianqiu-catHub
tar -xzf /tmp/mianqiu-cathub-release.tar.gz -C /var/www/mianqiu-catHub
cd /var/www/mianqiu-catHub

if [ ! -d .venv ]; then
    python3 -m venv .venv
    .venv/bin/pip install -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt
fi

cp deploy/systemd/mianqiu-cathub.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now mianqiu-cathub.service
systemctl restart mianqiu-cathub.service

if [ -d /etc/nginx/sites-available ]; then
    cp deploy/nginx/cat.elma-gohan.xyz.conf /etc/nginx/sites-available/
    ln -sf /etc/nginx/sites-available/cat.elma-gohan.xyz.conf /etc/nginx/sites-enabled/
elif [ -d /etc/nginx/conf.d ]; then
    cp deploy/nginx/cat.elma-gohan.xyz.conf /etc/nginx/conf.d/
fi

nginx -t && systemctl reload nginx
echo "=== 部署完成！服务已在 http://cat.elma-gohan.xyz 运行 ==="
EOF
