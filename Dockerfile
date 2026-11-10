FROM node:20-bookworm
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY client/package*.json client/
RUN npm --prefix client install
COPY . .
RUN npm --prefix client run build
ENV NODE_ENV=production PORT=8080 DATA_DIR=/app/data
EXPOSE 8080
CMD ["node", "server/index.js"]
