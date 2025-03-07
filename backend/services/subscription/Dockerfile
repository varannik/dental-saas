FROM node:18-alpine

WORKDIR /app

# Copy package.json files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build the application
RUN npm run build

# Remove development dependencies
RUN npm prune --production

# Expose port
EXPOSE 3003

# Start the service
CMD ["node", "dist/index.js"]