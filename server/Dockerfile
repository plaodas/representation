FROM node:22-bookworm-slim
WORKDIR /app
COPY domain ./domain
COPY server/src ./server/src
ENV PORT=8787
EXPOSE 8787
CMD ["node", "--experimental-strip-types", "server/src/index.ts"]
