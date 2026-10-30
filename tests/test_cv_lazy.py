"""Each CV task loads only its own model, including on partial installations."""
from types import SimpleNamespace

import numpy as np
import pytest

from aesthetic_passport import cv


@pytest.mark.parametrize("task", ["faces", "segment"])
def test_independent_lazy_models(tmp_path, monkeypatch, task):
    from mediapipe.tasks.python import vision

    filename = cv.FACE_MODEL if task == "faces" else cv.SEG_MODEL
    (tmp_path / filename).touch()
    monkeypatch.setenv("MODELS_DIR", str(tmp_path))
    loaded = []
    class FakeTask:
        def detect(self, image):
            return SimpleNamespace(face_landmarks=[], facial_transformation_matrixes=[])
        def segment(self, image):
            return SimpleNamespace(category_mask=SimpleNamespace(numpy_view=lambda: np.zeros((8, 8), np.uint8)))
        def close(self):
            pass
    def factory(name):
        def create(options):
            loaded.append(name)
            return FakeTask()
        return create
    monkeypatch.setattr(vision.FaceLandmarker, "create_from_options", factory("faces"))
    monkeypatch.setattr(vision.ImageSegmenter, "create_from_options", factory("segment"))
    models = cv._Models()
    monkeypatch.setattr(models, "_mp_image", lambda rgb: rgb)
    try:
        for _ in range(2):
            getattr(models, task)(np.zeros((8, 8, 3), np.uint8))
        assert loaded == [task]
        assert (models._segmenter is None) == (task == "faces")
        assert (models._landmarker is None) == (task == "segment")
    finally:
        models.close()
