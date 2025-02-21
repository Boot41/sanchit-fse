FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Expose port 5173 (Vite's default port)
EXPOSE 5173

# Start the development server
CMD ["npm", "run", "dev", "--", "--host"]
