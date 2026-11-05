# Serveur de l'éditeur (UE). Image construite depuis la racine du dépôt :
#   docker build -f apps/server/Dockerfile -t helios-server .
# Un seul fichier JavaScript (esbuild) et la base SQLite intégrée à Node : aucune dépendance à l'exécution.

FROM node:22.23.0-bookworm-slim AS build
WORKDIR /src
COPY . .
RUN npm ci --ignore-scripts --no-audit --no-fund \
 && npm test -w @helios/server \
 && npm run build -w @helios/server

FROM node:22.23.0-bookworm-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    DB_PATH=/data/helios.db \
    BACKUP_DIR=/data/backups
WORKDIR /app
COPY --from=build /src/apps/server/dist/server.cjs ./server.cjs
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--no-warnings", "server.cjs"]
