FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/var/data/endless-smiles
VOLUME ["/var/data/endless-smiles"]
EXPOSE 8080

CMD ["node", "dist-server/server/index.js"]
