FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --workspace @pfsense-hub/web
# The Windows-generated lockfile omits Rollup's Linux musl optional package.
# Fetch and extract the matching native package without running npm install again.
RUN ROLLUP_VERSION="$(node -p "require('./node_modules/rollup/package.json').version")" \
    && mkdir -p node_modules/@rollup/rollup-linux-x64-musl /tmp/rollup-native \
    && npm pack "@rollup/rollup-linux-x64-musl@${ROLLUP_VERSION}" --pack-destination /tmp/rollup-native \
    && tar -xzf "/tmp/rollup-native/rollup-rollup-linux-x64-musl-${ROLLUP_VERSION}.tgz" \
       --strip-components=1 -C node_modules/@rollup/rollup-linux-x64-musl \
    && rm -rf /tmp/rollup-native
COPY apps/web ./apps/web
RUN npm run build --workspace @pfsense-hub/web

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
