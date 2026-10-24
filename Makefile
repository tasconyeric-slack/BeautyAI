PY ?= $(shell [ -x .venv/bin/python ] && echo .venv/bin/python || echo python3)
export PYTHONPATH := src

MODELS_DIR ?= models
FACE_LANDMARKER_URL = https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task
SEGMENTER_URL = https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite

.PHONY: setup install install-web models test lint sample types passport api web dev hello screenshots docker

# One command from a fresh clone: virtualenv + Python deps + MediaPipe models + web deps.
setup:
	[ -d .venv ] || python3 -m venv .venv
	.venv/bin/python -m pip install -q --upgrade pip
	.venv/bin/python -m pip install -q -e ".[pipeline,api,dev]"
	$(MAKE) models
	$(MAKE) install-web
	[ -f .env ] || cp .env.example .env

install:
	$(PY) -m pip install -e ".[pipeline,api,dev]"

install-web:
	cd web && npm ci

# MediaPipe model files (Apache 2.0). Never committed; the API Dockerfile runs the same downloads.
models:
	mkdir -p $(MODELS_DIR)
	[ -f $(MODELS_DIR)/face_landmarker.task ] || curl -fsSL -o $(MODELS_DIR)/face_landmarker.task $(FACE_LANDMARKER_URL)
	[ -f $(MODELS_DIR)/selfie_multiclass_256x256.tflite ] || curl -fsSL -o $(MODELS_DIR)/selfie_multiclass_256x256.tflite $(SEGMENTER_URL)

test:
	$(PY) -m pytest -q

lint:
	$(PY) -m ruff check src tests scripts

# Rebuild the female + male fixture passports and their copies used by the web app.
sample:
	$(PY) -m aesthetic_passport.assemble \
		--analysis examples/sample_analysis.json \
		--context examples/sample_context.json \
		--out examples/sample_passport.json
	$(PY) -m aesthetic_passport.assemble \
		--analysis examples/sample_male_analysis.json \
		--context examples/sample_male_context.json \
		--out examples/sample_male_passport.json
	cp examples/sample_passport.json web/lib/fixtures/sample_passport.json
	cp examples/sample_male_passport.json web/lib/fixtures/sample_passport_male.json
	cp examples/cases/*.json web/components/landing/

# web/lib/passport.ts from schema/passport.schema.json, plus the config values the report displays.
types:
	cd web && node scripts/gen-types.mjs
	$(PY) scripts/export_web_config.py

# CLI run: make passport PHOTOS=data/p01 CONTEXT=examples/sample_context.json
CONTEXT ?= examples/sample_context.json
passport:
	$(PY) -m aesthetic_passport.pipeline --photos $(PHOTOS) --context $(CONTEXT) --out runs/

# One vision call to the production model. Needs DEEPSEEK_API_KEY.
hello:
	$(PY) scripts/hello_deepseek.py --photo $(PHOTO)

api:
	$(PY) -m uvicorn --factory aesthetic_passport.api.app:create_app --host 0.0.0.0 --port 8000 --reload --reload-dir src

web:
	cd web && npm run dev

# API (:8000) + web (:3000). Without keys the API serves the fixture analysis (ANALYSIS_PROVIDER=auto).
dev:
	@[ -f $(MODELS_DIR)/face_landmarker.task ] || $(MAKE) models
	@[ -d web/node_modules ] || $(MAKE) install-web
	@trap 'kill 0' INT TERM EXIT; \
		ANALYSIS_PROVIDER=$${ANALYSIS_PROVIDER:-auto} $(MAKE) api & \
		$(MAKE) web & \
		wait

screenshots:
	cd web && node scripts/screenshots.mjs

docker:
	docker build -t aesthetic-passport-api .
