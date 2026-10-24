# Aesthetic Passport API (FastAPI + MediaPipe). The web app deploys separately (Vercel, root dir web/).
FROM python:3.13-slim

# MediaPipe needs EGL/GLES at load time; OpenCV needs libGL + glib.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libegl1 libgles2 libgl1 libglib2.0-0 curl ca-certificates fonts-wqy-zenhei \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

# MediaPipe models (Apache 2.0) are downloaded at build time, never committed.
RUN mkdir -p models \
 && curl -fsSL -o models/face_landmarker.task \
      https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task \
 && curl -fsSL -o models/selfie_multiclass_256x256.tflite \
      https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite

# Editable install: the package reads config/, schema/, prompts/ and examples/ relative to the repo root.
COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install -e ".[pipeline,api]"
COPY config ./config
COPY schema ./schema
COPY prompts ./prompts
COPY examples ./examples

# runs/ holds the SQLite job store and 24 h media; mount a persistent disk here.
ENV MODELS_DIR=/app/models RUNS_DIR=/data/runs QC_MODE=real PORT=8000
RUN useradd --create-home app && mkdir -p /data/runs && chown -R app /data
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD curl -fsS http://127.0.0.1:${PORT}/api/health || exit 1
CMD ["sh", "-c", "uvicorn --factory aesthetic_passport.api.app:create_app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
