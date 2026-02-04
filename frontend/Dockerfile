FROM nginx:alpine

# Static site
COPY . /usr/share/nginx/html/

# Nginx config template + entrypoint
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 8080
CMD ["/docker-entrypoint.sh"]
