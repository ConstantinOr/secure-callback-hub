FROM node:20-bookworm-slim

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

EXPOSE 3000

CMD ["sh", "-c", "pnpm migration:run && pnpm start:prod"]
