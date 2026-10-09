FROM node:24-bookworm-slim AS build
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3100 AUTH_COOKIE_SECURE=true
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/web/dist ./dist
COPY web/server ./server
COPY web/core ./core
COPY web/shared ./shared
COPY web/scripts ./scripts
COPY docker/entrypoint.sh /app/entrypoint.sh
RUN mkdir -p /app/web/storage && chown node:node /app/web/storage
USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3100/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["sh", "/app/entrypoint.sh"]
CMD ["node", "server/index.mjs"]
