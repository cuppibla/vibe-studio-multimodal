# Vibe Studio, the app: the React page built in one stage, the FastAPI server
# and the agent in the other. One container, one port, the whole app.
FROM node:20-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt /app/vibestudio/requirements.txt
RUN pip install --no-cache-dir -r /app/vibestudio/requirements.txt
COPY . /app/vibestudio
COPY --from=web /web/dist /app/vibestudio/web/dist
ENV PYTHONUNBUFFERED=1 STUDIO_VERTEX=1 GOOGLE_CLOUD_LOCATION=global
EXPOSE 8080
CMD ["python", "-m", "vibestudio"]
