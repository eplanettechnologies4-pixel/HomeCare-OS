# ── Stage 1: Build Vite React application ────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Build arguments for API URL configuration
ARG VITE_API_BASE_URL=http://179.198.198.179:8000
ARG VITE_API_URL=http://179.198.198.179:8000/api

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_API_URL=${VITE_API_URL}

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# ── Stage 2: Serve static files with Nginx ───────────────────────────────────
FROM nginx:alpine
RUN apk add --no-cache curl

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
