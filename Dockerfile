# ============================================================
# GEX Dashboard — 多阶段 Docker 构建
# ============================================================

# ---- Stage 1: 构建前端 ----
FROM node:20-alpine AS client-builder
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm ci --ignore-scripts
COPY client/ ./
RUN npm run build

# ---- Stage 2: 构建后端 ----
FROM node:20-alpine AS server-builder
WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm ci --ignore-scripts
COPY server/ ./
RUN npm run build

# ---- Stage 3: 生产镜像 ----
FROM node:20-alpine
WORKDIR /app

# 只安装 server 的生产依赖
COPY server/package.json server/package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts

# 复制 server 编译产物
COPY --from=server-builder /app/server/dist ./server/dist

# 复制 client 编译产物（给 server 托管用）
COPY --from=client-builder /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "server/dist/index.js"]
