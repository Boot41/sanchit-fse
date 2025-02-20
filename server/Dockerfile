# Use Node.js runtime as base image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Install OpenSSL
RUN apt-get update -y && apt-get install -y openssl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Expose port 4000
EXPOSE 4000

# Start the server
CMD ["npm", "start"]
