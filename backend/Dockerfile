FROM node:24-alpine

WORKDIR /app

# Install dependencies for native modules and OpenSSL for Prisma
RUN apk add --no-cache python3 make g++ openssl openssl-dev

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy prisma schema for generation
COPY prisma ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Source files are mounted as volume for hot reload
# CMD runs tsx in watch mode
CMD ["npm", "run", "dev"]
