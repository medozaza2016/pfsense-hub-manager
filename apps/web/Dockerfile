FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --workspace @pfsense-hub/web
# The lockfile was produced on Windows and omits Rollup's Linux musl optional package.
# Install the matching native binary explicitly for this x64 Alpine build.
RUN ROLLUP_VERSION="$(node -p "require('./node_modules/rollup/package.json').version")" \
    && npm install --no-save --package-lock=false "@rollup/rollup-linux-x64-musl@${ROLLUP_VERSION}"
COPY apps/web ./apps/web
RUN npm run build --workspace @pfsense-hub/web

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
