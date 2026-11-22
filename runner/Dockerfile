# The runner service. It starts sandbox containers through the host's Docker daemon
# (mount /var/run/docker.sock), so it must run on a trusted host of its own.
FROM node:22-alpine
RUN apk add --no-cache docker-cli
WORKDIR /runner
COPY package.json server.js ./
ENV NODE_ENV=production PORT=2359
EXPOSE 2359
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:2359/health >/dev/null || exit 1
CMD ["node", "server.js"]
