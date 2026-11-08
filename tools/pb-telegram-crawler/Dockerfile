# Playbook Telegram crawler — small, always-on container.
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
USER node
CMD ["node", "crawler.mjs"]
