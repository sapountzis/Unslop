#!/bin/sh
set -eu

PORT="${PORT:-8080}"

sed "s/__PORT__/${PORT}/g" /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
