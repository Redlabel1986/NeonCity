FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV PORT=8787
ENV NEON_DATA=/data
VOLUME ["/data"]
EXPOSE 8787
CMD ["npx", "tsx", "server/index.ts"]
