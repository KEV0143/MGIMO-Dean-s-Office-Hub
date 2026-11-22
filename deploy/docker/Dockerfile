ARG NODE_IMAGE=node:26.13.1-bookworm-slim
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --engine-strict --ignore-scripts

FROM dependencies AS build
ARG APP_ORIGIN=http://localhost:5180
ENV ORIGIN=${APP_ORIGIN}
COPY tsconfig.json vite.config.ts ./
COPY src ./src
COPY static ./static
RUN npm run check && npm run build

FROM ${NODE_IMAGE} AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --engine-strict --omit=dev --ignore-scripts && npm cache clean --force

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DEMO_MODE=false
WORKDIR /app
COPY --chown=node:node --from=production-dependencies /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/.output ./.output
COPY --chown=node:node package.json ./package.json
COPY --chown=node:node db/migrations ./db/migrations
COPY --chown=node:node scripts/database/migrate.mjs scripts/database/seed.mjs scripts/database/sample-scenario.mjs ./scripts/database/
COPY --chown=node:node src/lib/server/security/credentials.mjs ./src/lib/server/security/credentials.mjs
COPY --chown=node:node src/lib/modules/auth/preview-accounts.ts ./src/lib/modules/auth/preview-accounts.ts
COPY --chown=node:node src/lib/modules/academics/schedule-navigation.ts ./src/lib/modules/academics/schedule-navigation.ts
COPY --chown=node:node src/lib/shared/validation.ts src/lib/shared/formatting.ts ./src/lib/shared/
COPY --chown=node:node deploy/docker/healthcheck.mjs ./healthcheck.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 CMD ["node", "healthcheck.mjs"]
CMD ["node", ".output/index.js"]