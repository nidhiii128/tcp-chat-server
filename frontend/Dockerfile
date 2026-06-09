# Stage 1: build the React app
FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_WS_URL=ws://localhost:8765
ENV VITE_WS_URL=$VITE_WS_URL

COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: serve with nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
