ARG BUILD_FROM
FROM ${BUILD_FROM}

WORKDIR /app

RUN apk add --no-cache \
  bash \
  nodejs \
  npm \
  chromium \
  xvfb \
  x11vnc \
  novnc \
  websockify \
  nss \
  freetype \
  harfbuzz \
  ca-certificates \
  ttf-freefont

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY run.sh /run.sh
RUN chmod a+x /run.sh

CMD ["/run.sh"]
