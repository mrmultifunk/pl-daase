FROM node:22-alpine
WORKDIR /app
COPY server.js .
COPY site ./site
ENV DATA_DIR=/data PORT=8080
CMD ["node","server.js"]
