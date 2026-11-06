# Multi-stage: dev (nodemon + ts-node, hot-reload via bind mount) / prod (tsc + deps runtime)
ARG NODE_IMAGE=node:22-bookworm

FROM ${NODE_IMAGE} AS dev
WORKDIR /app
ENV NODE_ENV=development
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3001
CMD ["npx", "nodemon", "--legacy-watch"]

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM ${NODE_IMAGE} AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build --chown=node:node /app/build ./build
RUN mkdir -p /app/logs && chown node:node /app/logs
USER node
EXPOSE 3001
CMD ["node", "build/app.js"]
