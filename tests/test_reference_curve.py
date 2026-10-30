"""Density visualization must represent actual score/count data, never invent a rank."""
import numpy as np
import pytest

from aesthetic_passport.attractiveness.distribution import density_curve


def test_frequency_weighted_mean_and_normalized_display_density():
    curve = density_curve([{"score": 2., "count": 100}, {"score": 4., "count": 300}],
                          native=[1., 5.], display=[1., 10.], points=65, min_bandwidth=0.03)
    assert curve["n"] == 400
    assert curve["mean"] == pytest.approx(6.625)
    xy = np.array(curve["points"])
    assert len(xy) == 65 and list(xy[[0, -1], 0]) == [1., 10.]
    assert np.all(np.diff(xy[:, 0]) > 0) and np.all(xy[:, 1] >= 0)
    assert np.trapezoid(xy[:, 1], xy[:, 0]) == pytest.approx(1., abs=1e-5)
    assert xy[np.argmax(xy[:, 1]), 0] > 6


def test_degenerate_reference_is_rejected_instead_of_drawing_a_fake_bell():
    with pytest.raises(ValueError):
        density_curve([{"score": 3., "count": 100}], native=[1., 5.], display=[1., 10.],
                      points=65, min_bandwidth=0.03)
