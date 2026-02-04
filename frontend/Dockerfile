FROM nginx:alpine

# Needed for envsubst (to inject $PORT into nginx config)
RUN apk add --no-cache gettext

# Copy static site
COPY . /usr/share/nginx/html/

# Template nginx config that listens on $PORT
RUN mkdir -p /etc/nginx/templates
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Entrypoint renders template -> nginx config and starts nginx
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Railway injects PORT; EXPOSE is informational
EXPOSE 8080

CMD ["/docker-entrypoint.sh"]
