"""Offline, aggregate-only import. Caller owns lawful source storage and deletion."""

from __future__ import annotations

import copy
from collections import Counter
from collections.abc import Iterable

from .contracts import CohortManifest, ReferenceObservation, ReferenceRegistry
from .reference import (
    IDENTITY_FIELDS,
    ReferenceDataError,
    cohort_blocker,
    model_blocker,
    validate_boundary,
    validate_registry,
)


def build_reference(manifest: CohortManifest, observations: Iterable[ReferenceObservation]) -> ReferenceRegistry:
    """Union subject and reviewed near-duplicate groups; choose lowest observation key.

    Grouping is transitive. The choice is independent of score and input order; the
    curator must define keys and one-image selection in the versioned QC evidence.
    No keys, individual rows, images, embeddings or hashes enter the returned registry.
    """
    validate_boundary(manifest, "manifest")
    blocker = cohort_blocker(manifest)
    if blocker:
        raise ReferenceDataError(blocker)
    parents: dict[str, str] = {}
    selected: dict[str, tuple[str, float]] = {}
    observation_keys: set[str] = set()

    def find(key: str) -> str:
        parents.setdefault(key, key)
        root = key
        while parents[root] != root:
            root = parents[root]
        while parents[key] != key:
            key, parents[key] = parents[key], root
        return root

    count = 0
    lo, hi = manifest["native_score_bounds"]
    if lo >= hi:
        raise ReferenceDataError("invalid_score_bounds")
    for observation in observations:
        validate_boundary(observation, "observation")
        result = observation["prediction"]
        if observation["adult_confirmed"] is not True:
            raise ReferenceDataError("adult_confirmation_missing")
        blocker = model_blocker(result)
        if blocker:
            raise ReferenceDataError(blocker)
        if any(result[key] != manifest["identity"][key] for key in IDENTITY_FIELDS):
            raise ReferenceDataError("model_reference_mismatch")
        score = result["raw_score"]
        assert score is not None
        if not lo <= score <= hi:
            raise ReferenceDataError("score_out_of_native_scale")
        key = observation["observation_key"]
        if key in observation_keys:
            raise ReferenceDataError("duplicate_observation_key")
        observation_keys.add(key)
        subject = find("s:" + observation["subject_key"])
        duplicate = find("d:" + observation["duplicate_cluster"])
        if subject != duplicate:
            parents[duplicate] = subject
            if duplicate in selected:
                selected[subject] = min(selected.get(subject, (key, score)), selected.pop(duplicate))
        selected[subject] = min(selected.get(subject, (key, score)), (key, score))
        count += 1
    if not count:
        raise ReferenceDataError("reference_empty")
    histogram = Counter(value[1] for value in selected.values())
    cohort = copy.deepcopy(manifest) | {
        "n_unique_subjects": len(selected),
        "distribution": [{"score": score, "count": n} for score, n in sorted(histogram.items())],
        "import_summary": {"records_received": count, "duplicates_removed": count - len(selected)},
    }
    registry: ReferenceRegistry = {
        "registry_version": "attractiveness-reference-1",
        "unavailable_reason": None,
        "cohorts": [cohort],
    }
    validate_registry(registry)
    return registry
