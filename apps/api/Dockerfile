FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/package.json
RUN npm install --workspace @pfsense-hub/api
COPY apps/api ./apps/api
RUN npm run build --workspace @pfsense-hub/api

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY apps/api/package.json ./apps/api/package.json
RUN npm install --omit=dev --workspace @pfsense-hub/api && npm cache clean --force
COPY --from=build /app/apps/api/dist ./apps/api/dist
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
