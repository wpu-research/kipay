FROM node:22-alpine AS builder
RUN npm install -g pnpm
WORKDIR /app

# Tüm workspace'i kopyala ve build et
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages/ packages/
COPY apps/gateway/ apps/gateway/
RUN pnpm install --frozen-lockfile --filter @panel/gateway...
RUN pnpm --filter @panel/gateway build

FROM node:22-alpine AS runner
RUN npm install -g pnpm
WORKDIR /app

# Sadece gateway için gerekli dosyaları kopyala
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/ packages/
COPY apps/gateway/package.json apps/gateway/
RUN pnpm install --frozen-lockfile --filter @panel/gateway... --prod

COPY --from=builder /app/apps/gateway/dist ./apps/gateway/dist
COPY --from=builder /app/apps/gateway/widget ./apps/gateway/widget

WORKDIR /app/apps/gateway
ENV NODE_ENV=production
EXPOSE 8000
CMD ["node", "dist/main.js"]
