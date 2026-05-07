FROM node:20-alpine

# Install dependencies needed for native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy dependency files
COPY package.json yarn.lock ./

# Install dependencies with cache mount for faster rebuilds
# Some remote builders require an explicit cache id.
RUN --mount=type=cache,id=cacheKey-yarn-global-cache,target=/root/.yarn \
    --mount=type=cache,id=cacheKey-yarn-project-cache,target=/app/.yarn/cache \
    yarn install --frozen-lockfile --prefer-offline

# Copy prisma schema and generate client
COPY prisma ./prisma/
RUN yarn generate

# Copy source code (this layer changes most frequently)
COPY . .

# Expose application port
EXPOSE 3001

# Start development server with hot reload
CMD ["yarn", "dev"]
