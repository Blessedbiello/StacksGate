FROM node:18-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S stacksgate -u 1001

# Change ownership of the app directory
RUN chown -R stacksgate:nodejs /app

# Switch to non-root user
USER stacksgate

# Expose port
EXPOSE 5173

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5173 || exit 1

# Start the development server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]