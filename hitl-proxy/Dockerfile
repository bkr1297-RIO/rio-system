FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY server.mjs ./
EXPOSE 8080
ENV NODE_ENV=production
CMD ["node", "server.mjs"]
