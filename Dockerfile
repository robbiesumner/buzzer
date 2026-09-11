FROM node:22-slim AS web

WORKDIR /build
# Lockfile first: this layer rebuilds only when a dependency changes.
COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

FROM python:3.12-slim AS runtime

# Pinned: an unpinned build tool makes the image unreproducible.
COPY --from=ghcr.io/astral-sh/uv:0.11.23 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONUNBUFFERED=1 \
    PATH="/srv/.venv/bin:$PATH"

WORKDIR /srv

# Dependencies before the source, for the same reason.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app/ ./app/
RUN uv sync --frozen --no-dev

COPY --from=web /build/dist/ ./web/dist/

# /data is created before the user loses the right to create it.
RUN useradd --system --create-home --uid 10001 buzzer \
    && mkdir -p /data \
    && chown -R buzzer:buzzer /srv /data
USER buzzer

ENV PORT=8000 \
    DATABASE_PATH=/data/buzzer.db \
    WEB_DIST=/srv/web/dist
EXPOSE 8000

# No curl in a slim image, and it is not worth a package.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health').read()"]

# GM_PASSWORD and SESSION_SECRET are deliberately not baked in and have no
# defaults: the server refuses to boot without them.
CMD ["uvicorn", "app.main:asgi", "--host", "0.0.0.0", "--port", "8000"]
