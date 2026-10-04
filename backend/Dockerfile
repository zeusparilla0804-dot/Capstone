FROM node:22.22.3-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22.22.3-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
RUN mkdir -p /var/lib/la-chef/uploads && chown -R node:node /var/lib/la-chef
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
