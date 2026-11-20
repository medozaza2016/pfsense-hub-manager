FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm install --workspace @pfsense-hub/api
COPY apps/api ./apps/api
RUN npm run build --workspace @pfsense-hub/api
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY apps/api/package.json ./package.json
RUN npm install --omit=dev --workspaces=false && npm cache clean --force
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/migrations ./migrations
USER node
EXPOSE 3000
CMD ["node","dist/server.js"]