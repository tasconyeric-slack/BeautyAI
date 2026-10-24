# Multi-view face evaluation (Issue #12)

Run from the repository root after `make install` and, for actual photos, `make models`.
This is an offline QC/measurement tool: no scoring, analysis providers, demographic inference, or new landmark model.
It uses the existing `check_role`, registry, frontal measurements, and true-profile silhouette/gates. A profile can be
evaluated independently of a front photo. Schema versions and metric IDs are unchanged.

## Manifest and commands

Keep photos and manifests in ignored `data/`. Use anonymized IDs, never names. JSONL (one object per image):

```json
{"person_id":"p01","image_path":"photos/p01_front.jpg","view":"front","expected_camera_pose":{"yaw":0},"image_quality":"good","coverage":"full_face","cohort":"unknown"}
{"person_id":"p01","image_path":"photos/p01_left.jpg","view":"left90","expected_camera_pose":{},"image_quality":"good","coverage":"full_face"}
```

Equivalent CSV (the pose cell is JSON; double quotes are escaped using CSV quoting):

```csv
person_id,image_path,view,expected_camera_pose,image_quality,coverage
p01,photos/p01_front.jpg,front,"{""yaw"":0}",good,full_face
p01,photos/p01_left.jpg,left90,{},good,full_face
```

`person_id`, `image_path`, and `view` are required. Paths resolve relative to the manifest; absolute mounted paths
also work. Views are `front`, `front_glasses`, `left90`, `right90`, `45deg`. Left/right mean **the direction the nose
points in the displayed image**, not the person's anatomical side. Translate source camera names accordingly.
`expected_camera_pose` optionally contains known numeric `yaw`, `pitch`, `roll` degrees; leave unknown axes absent.
`image_quality`, `coverage`, and optional `cohort` are short supplied labels, default `unknown`; they are not inferred.
Use cohort labels only from permitted dataset metadata. Verify adult status and usage permission outside this tool.
Unpaired pose/glasses images are valid. Repeats require distinct image paths with the same ID and exact input view.
The limit is 100 images; select about 12–20 people where available, keeping the actual image count small.

Exact command after mounting a permitted dataset and manifest at `/mnt/beautyai-multiview`:

```bash
.venv/bin/python scripts/eval_multiview_faces.py \
  --manifest /mnt/beautyai-multiview/manifest.jsonl \
  --out runs/multiview-real --max-overlays 3
```

Local equivalent: replace the manifest with `data/multiview/manifest.jsonl`.
Do not download entire CAS-PEAL/Multi-PIE corpora or scrape faces. Choose permitted adult samples with East Asian
and other global representation, both profile directions, a 45° negative control, glasses where represented,
and independent repeat captures if available. Do not infer demographic categories from photos.

Reproducible no-photo critical path (no model files/API keys needed):

```bash
.venv/bin/python scripts/eval_multiview_faces.py --synthetic --out runs/multiview-fixture --max-overlays 3
.venv/bin/python -m pytest -q tests/test_multiview_eval.py tests/test_multiview_profile_qc.py tests/test_v3b_profile.py
```

`--synthetic` creates eight explicit, non-person fixtures from the existing Apache-2.0 canonical mesh and controlled
detector/segmentation outputs. Actual QC, registry formulas, availability, and overlays still run. Frontal texture,
glasses-band labels, and the three-quarter nose/outline mismatch are controlled fixtures, **not photographs or a
claim that neural detection succeeds on them**. The synthetic repeat is identical and tests aggregation only.

## Reading the local results

- `summary.json`: accepted/rejected/warned counts by input view, rejection and warning codes, metric coverage and
  missing reasons by metric/input view, pose confusion, false profile accepts, direction mismatches, invalid-value
  count, supplied cohort counts, and same-person/view repeat absolute differences in each metric's own units.
- `results.json`: anonymous sample-level QC, pose estimates/known-camera differences, metric values, reasons,
  confidence, and existing overlay specs. Rejected photos never supply measurement values.
- `images.csv`, `views.csv`, `metrics.csv`: compact per-image diagnostics and aggregate view/metric tables.
- `overlays/`: at most the requested 0–6 overlays; prioritize rejected traces and resolution failures. Yellow is
  the attempted silhouette, purple the skin mask, blue the detected nose tip, green the registry measurement lines.

`45deg` is intentionally submitted to the **strict profile** gate. Acceptance increments `true_profile_false_accepts`
and appears in the confusion table. Accepted left/right profiles appear separately, including incorrect directions.
MediaPipe yaw underestimates true-profile rotation; numeric pose differences are descriptive, not 3D accuracy scores.
Missing repeats produce an empty consistency list; no repeat data or missing metrics are fabricated. JSON is strict:
non-finite/out-of-range measured results become explicit local `invalid_value` entries and are counted. Invalid
computations already rejected upstream as `out_of_range` are also counted, preserving that production reason.
Exit 2 means a manifest/usage error. Exit 0 means artifacts were produced, including when every image was rejected;
inspect named `unreadable_image`, `cv_unavailable`, or `evaluation_error_*` rejections. It never means live acceptance.

Artifacts contain sensitive photo-derived data. The default output is ignored `runs/`; keep overrides outside Git,
delete local evaluation inputs/results/overlays when finished, and do not attach real results to CI or PR logs.
Console output contains only operational status. Use a new output directory per run to avoid stale overlays.

## PR #15 baseline (historical)

**At PR #15, real-photo acceptance was blocked:** that cloud checkout had no mounted `data/` sample. No adult/cohort diversity,
real glasses detection, neural pose performance, or real-photo acceptance result is claimed.

The canonical profile fixture exposed a reproducible resolution bypass: a detached 10×20 skin-label patch above
a 115px face inflated QC face height to 402px and produced `ok`, although the tracer used only the largest foreground
component. Both mirrored directions reproduced it. QC and tracing now share the same foreground/skin component:
the height stays 115px and QC rejects with `face_too_small`. A larger disconnected foreground without skin previously
caused an empty-array `ValueError`; it now returns named `no_face` unavailability. Thresholds are unchanged.
Rejected nose/outline traces remain available only for diagnostics; measurement consumers still honor QC rejection.

Regression coverage is in `tests/test_multiview_profile_qc.py`; batch CLI/manifest/aggregate/error/fixture coverage is
in `tests/test_multiview_eval.py`. Existing CI runs both through `make test`; no workflow changes are needed.
Local validation: 531 tests passed, 17 skipped (including unavailable real-photo cases); `make lint` passed.
The eight-row fixture run accepted the two repeat fronts, glasses front, and both full-size profile directions;
it rejected the three-quarter control, undersized profile and no-face input. No invalid values or false profile
accepts occurred **in these fixtures**. The resolution and nose/outline diagnostic overlays were visually inspected.
The cloud image lacked `libGLESv2`; the Debian `libgles2` package was extracted under local `work/` and supplied
through `LD_LIBRARY_PATH` for the full-suite run. CI already installs `libegl1 libgles2` explicitly.

References checked/reused: [MediaPipe](https://github.com/google-ai-edge/mediapipe) (existing Apache-2.0 dependency
and canonical mesh); [CAS-PEAL release](https://www.jdl.link/peal/JDL-PEAL-Release.htm) and
[Multi-PIE](https://www.cs.cmu.edu/afs/cs/project/PIE/MultiPie/Multi-Pie/Home.html) (controlled-pose dataset sources,
subject to their access/use terms). [3DDFA_V2](https://github.com/cleardusk/3DDFA_V2) is MIT-licensed code but adds
another model, assets and runtime/build dependencies; it remains a future alternative if real diagnostics justify
it. No external implementation code or photos were copied. Existing report/overlay behavior is preserved.

## Real-profile false-rejection follow-up (2026-10-24)

A fresh branch from main after #15 evaluated **60 original FEI images from 12 subjects**: one left profile,
one right profile, two approximate three-quarter controls and one neutral front per subject. FEI's source page
specifies adults aged 19–40 and permits research use, without redistribution. Only selected ZIP members were
retrieved using HTTP byte ranges from `https://fei.edu.br/~cet/originalimages_part1.zip`; photos and all
photo-derived artifacts remain in ignored `data/` and `runs/`. No photographs or segmentation masks are fixtures
in Git. Pointing'04's index worked, but its advertised `http://www-prima.inrialpes.fr/perso/Gourier/Faces/Person01-1.tar.gz`
and HTTPS equivalent returned 404; the current Pointing'04 host did not contain that archive either.

The demonstrated defect is **neck/shoulder contamination within the same person component**. In original and
face-dominant cropped profiles, the segmenter sometimes labels neck pixels as face skin. The old lowest-skin-row
bound includes the shoulder in the facial search. The shoulder can become the most anterior point (`prn`), so
`_detect` fails with `landmarks_unclear` or `lips_unclear`; QC maps those to `profile_unclear`. This differs from
#15's disconnected-foreground resolution bypass. Local RGB/segmentation/contour overlays confirmed it.

QC resolution and tracing now share facial bounds from rows where **face skin reaches the anterior foreground
boundary**. Neck labels behind that edge cannot extend the search. The trace stops at the facial bottom, before
shoulders; foreground/hair still defines the outline within those bounds. Existing foreground component selection,
facing inference, yaw and nose-gap thresholds, metric formulas, schemas and missing-reason IDs remain unchanged.
Insufficient segmentation still rejects: `no_face` for missing skin, or `profile_unclear` with internal
`landmarks_unclear` / `anterior_face_skin` stage when the anterior face boundary cannot be located. Later outline
failures preserve `landmarks_unclear` / `lips_unclear` and `outline_landmarks` stage. The local evaluator now retains
`trace_reason` and `trace_detail` in both JSON and CSV. These internal diagnostics do not change public QC schema
or turn outline uncertainty into an angle claim. Wrong angle and insufficient native pixels retain their existing
`wrong_angle_for_role` and `face_too_small` codes. Rejected optional profiles still supply no side measurements and
do not block the front-only flow.

| Same original images | Before accepted / rejected | After accepted / rejected |
| --- | --- | --- |
| Left near-profile (12) | 9 / 3 | 12 / 0 |
| Right near-profile (12) | 12 / 0 | 12 / 0 |
| Approximate 45° controls (24) | 0 / 24 | 0 / 24 |
| Neutral front (12) | 12 / 0 | 12 / 0 |

There were also **24 native-pixel crops of the first four subjects' profile captures** (three margins per photo,
no upsampling). These are correlated derivatives, not more people or independent captures: accepted/rejected
changed from 12/12 to 19/5. All seven `profile_unclear` failures disappeared; five angle-gate rejections remain,
including detector/outline disagreement. The exact product-owner photos were not available, and this is not a
claim that all near-profiles now pass. Pose labels are approximate, not calibrated 3D ground truth. Supplied
cohorts remain `unknown`; no demographic coverage, population rate, glasses performance or metric accuracy is
claimed. Per-metric range/resolution gates still suppress unsupported numbers; acceptance is not validation of
all landmark locations or numerical measurements. Crops must not be interpreted as repeat-photo consistency.

Re-run the selected original batch with the standard command above and a local manifest. Source suffixes used
were `-01.jpg` (left), `-10.jpg` (right), `-03.jpg` / `-08.jpg` (three-quarter), `-11.jpg` (neutral front), with
anonymized manifest IDs `p01`–`p12` and unknown exact camera pose. The opt-in real regressions read selected
original files from `data/fei/`, or an explicit mount:

```bash
BEAUTYAI_FEI_DIR=/mnt/fei .venv/bin/python -m pytest -q tests/test_multiview_real_profile_qc.py
```

They cover both original directions, four previously failing face-dominant crops, and two real three-quarter
controls; absent local photos/models skip explicitly. Non-person regressions run in ordinary CI and exercise
both mirror directions with connected/disconnected neck labels inside the person, rejection of a fully hidden
anterior face boundary, diagnostic reasons and the existing 45° negative. The full synthetic evaluator continues
to reject its three-quarter, low-resolution and no-face controls. The existing Apache-2.0 MediaPipe/OpenCV path
was reused with no new model or dependency. FEI is evaluation input only; its images are not distributed or used
for training. No external implementation code was copied.

Local validation for this follow-up: `make test` passed with **565 passed, 20 skipped**, including all 12 opt-in
real-photo regressions; `make lint` and `git diff --check` passed. As with #15, this cloud image needed local
`libgles2` through `LD_LIBRARY_PATH`; the existing CI installs that library. Real photos remain unavailable to CI,
so its real-photo regressions skip while the non-person geometry/QC/negative controls run normally.
