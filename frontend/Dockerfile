FROM node:22.22.3-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY angular.json tsconfig*.json ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM nginx:1.28-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
EXPOSE 8080
