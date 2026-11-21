FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --workspace @pfsense-hub/api
COPY apps/api ./apps/api
RUN npm run build --workspace @pfsense-hub/api

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --omit=dev --workspace @pfsense-hub/api --include-workspace-root=false \
    && npm cache clean --force
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/migrations ./apps/api/migrations
WORKDIR /repo/apps/api
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
