FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run build:server
ENV PORT=8787
ENV NEON_DATA=/data
VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "dist-server/index.js"]
