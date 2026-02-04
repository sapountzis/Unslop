#!/bin/sh
set -eu

# Railway provides $PORT. Render nginx config with it.
envsubst '${PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
