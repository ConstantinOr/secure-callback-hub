FROM node:20-bookworm-slim

WORKDIR /app

ENV PNPM_VERSION=10.6.2
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

EXPOSE 3000

CMD ["sh", "-c", "pnpm migration:run && pnpm start:prod"]
