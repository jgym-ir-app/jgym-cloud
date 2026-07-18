FROM node:20-slim
WORKDIR /app
COPY cloud-server.js .
COPY cloud-package.json package.json
COPY db.json .
RUN npm install --production
EXPOSE 3000
CMD ["npm", "start"]
