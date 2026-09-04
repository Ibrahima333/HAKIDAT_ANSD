# Stage 1 : Build React
FROM node:22.12.0-bookworm-slim AS builder

WORKDIR /app/frontend

COPY package.json ./
COPY package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . ./

RUN VITE_API_BASE_URL="" npm run build

# Stage 2 : Nginx HTTP
FROM nginx:alpine

COPY --from=builder /app/frontend/dist /usr/share/nginx/html

RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    add_header X-Frame-Options SAMEORIGIN always;\n\
    add_header X-Content-Type-Options nosniff always;\n\
\n\
    # Import de fichiers CSV/Excel — sans cette directive nginx refuse\n\
    # tout envoi de plus de 1 Mo avec un 413 avant meme datteindre le backend.\n\
    # Volontairement au-dessus de MAX_UPLOAD_MB (50) cote frontend : lencodage\n\
    # multipart ajoute quelques centaines doctets, sinon un fichier de\n\
    # exactement 50 Mo serait refuse malgre le controle navigateur.\n\
    client_max_body_size 52M;\n\
\n\
    gzip on;\n\
    gzip_types text/plain text/css application/javascript application/json;\n\
\n\
    location /api/ {\n\
        proxy_pass http://backend:8000;\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
        proxy_read_timeout 120s;\n\
    }\n\
\n\
    location /assets/ {\n\
        expires 1y;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
