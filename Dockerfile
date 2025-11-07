# Etapa de construcción
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build || echo "Sin proceso de build, continuando..."

# Etapa de ejecución
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app .
COPY .env .env
EXPOSE 3000
CMD ["npm", "start"]
