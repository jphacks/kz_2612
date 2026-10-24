"""MediaPipe を使う結合テスト。モデルが無い環境ではスキップする。

実写真で試すときは tests/images/ に person.jpg（1人が写った写真）を置く。
"""

from pathlib import Path

import pytest
from PIL import Image

from app.pose.detector import DEFAULT_MODEL_PATH

pytestmark = pytest.mark.skipif(not DEFAULT_MODEL_PATH.exists(), reason="姿勢推定モデル未取得")

IMAGES = Path(__file__).parent / "images"


@pytest.fixture(scope="module")
def detector():
    from app.pose.detector import PoseDetector

    with PoseDetector() as d:
        yield d


def test_blank_image_has_no_key(detector):
    from app.pose.detector import PoseExtractionError

    with pytest.raises(PoseExtractionError) as e:
        detector.extract_key(Image.new("RGB", (640, 480), "white"))
    assert e.value.code == "no_person"


@pytest.mark.skipif(not (IMAGES / "person.jpg").exists(), reason="tests/images/person.jpg が無い")
def test_same_photo_matches_itself(detector):
    from app.pose.detector import load_image
    from app.pose.matcher import match_poses

    image = load_image(IMAGES / "person.jpg")
    key = detector.extract_key(image)
    result = match_poses(key, detector.detect(image))
    assert result.ok
    # 左右反転した画像は、鏡像を許さない設定では別のポーズ扱い（または人数は同じ）
    flipped = detector.detect(image.transpose(Image.FLIP_LEFT_RIGHT))
    assert len(flipped) == len(key)
