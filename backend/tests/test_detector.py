"""姿勢推定エンジン（RTMPose / MediaPipe）の結合テスト。モデルが無い環境ではスキップする。

実写真で試すときは tests/images/ に person.jpg（1人が写った写真）を置く。
"""

from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from app.pose.angles import PersonPose
from app.pose.base import PoseExtractionError
from app.pose.detector import DEFAULT_MODEL_PATH
from app.pose.rtm_detector import DEFAULT_DET_PATH, DEFAULT_POSE_PATH, RtmPoseDetector

IMAGES = Path(__file__).parent / "images"
HAS_RTM = DEFAULT_DET_PATH.exists() and DEFAULT_POSE_PATH.exists()


@pytest.fixture(scope="module", params=["rtmpose", "mediapipe"])
def detector(request):
    if request.param == "rtmpose":
        if not HAS_RTM:
            pytest.skip("RTMPose のモデル未取得（scripts/download_models.py）")
        yield RtmPoseDetector()
    else:
        if not DEFAULT_MODEL_PATH.exists():
            pytest.skip("MediaPipe のモデル未取得")
        from app.pose.detector import PoseDetector

        with PoseDetector() as d:
            yield d


def test_blank_image_has_no_key(detector):
    with pytest.raises(PoseExtractionError) as e:
        detector.extract_key(Image.new("RGB", (640, 480), "white"))
    assert e.value.code == "no_person"


def test_key_without_measurable_joints_is_rejected(detector, monkeypatch):
    # 顔と肩だけの写真（ひじ・手首が写っていない）は鍵にできない
    bust = PersonPose(angles={"left_elbow": None, "right_elbow": None, "left_shoulder": None,
                              "right_shoulder": None, "left_knee": None, "right_knee": None}, hip_center_x=0.5)
    monkeypatch.setattr(detector, "detect", lambda image: [bust])
    with pytest.raises(PoseExtractionError) as e:
        detector.extract_key(Image.new("RGB", (64, 64)))
    assert e.value.code == "pose_not_visible"
    assert "両肩" in e.value.message


@pytest.mark.skipif(not (IMAGES / "person.jpg").exists(), reason="tests/images/person.jpg が無い")
def test_same_photo_matches_itself(detector):
    from app.pose.base import load_image
    from app.pose.matcher import match_poses

    image = load_image(IMAGES / "person.jpg")
    key = detector.extract_key(image)
    assert match_poses(key, detector.detect(image)).ok


def _fake_rtm(keypoints, scores, min_score=0.5):
    """モデルを読まずに RtmPoseDetector の後処理だけを試す。"""
    d = RtmPoseDetector.__new__(RtmPoseDetector)
    d.min_score = min_score
    d.min_points_per_person = 2
    d.min_person_ratio = 0.4
    d._body = lambda bgr: (np.array([keypoints]), np.array([scores]))
    return d


def _body_points(w, h):
    """COCO17点。上半身は画像の中、腰から下は下端の外か下端すれすれ（胸から上の写真を想定）。"""
    k = np.zeros((17, 2))
    k[5], k[6] = (0.6 * w, 0.4 * h), (0.4 * w, 0.4 * h)      # 肩
    k[7], k[8] = (0.65 * w, 0.7 * h), (0.35 * w, 0.7 * h)    # ひじ
    k[9], k[10] = (0.7 * w, 0.5 * h), (0.3 * w, 0.5 * h)     # 手首
    k[11], k[12] = (0.55 * w, 1.02 * h), (0.45 * w, 1.02 * h)  # 腰（画像の外）
    k[13], k[14] = (0.55 * w, 0.97 * h), (0.45 * w, 0.96 * h)  # ひざ（下端に寄せた推測）
    k[15], k[16] = (0.5 * w, 0.94 * h), (0.45 * w, 0.89 * h)   # 足首（同上）
    return k


def test_rtm_ignores_out_of_frame_and_low_score_points():
    w, h = 1000, 400
    scores = np.full(17, 0.9)
    scores[11:13] = 0.8   # 腰は画像の外なのに自信あり
    scores[13:15] = 0.45  # 画面外のひざを下端に寄せた推測
    scores[15:17] = 0.3
    person = _fake_rtm(_body_points(w, h), scores).detect(Image.new("RGB", (w, h)))[0]
    assert person.angles["left_knee"] is None and person.angles["right_knee"] is None
    assert person.measurable_joints() == 4
    # 腰が見えないので、並び順には肩の中心を使う
    assert person.hip_center_x == pytest.approx(0.5)


def test_rtm_skips_detection_without_shoulders():
    w, h = 640, 480
    scores = np.full(17, 0.9)
    scores[5] = 0.1  # 片方の肩が見えない → 背景の誤検出として捨てる
    assert _fake_rtm(_body_points(w, h), scores).detect(Image.new("RGB", (w, h))) == []


def test_rtm_ignores_small_people_in_the_background():
    # 主役（肩幅 300px）の奥に、小さく写った人（肩幅 60px）がいても人数に数えない
    w, h = 1000, 800
    scores = np.full(17, 0.9)
    main = np.array([[500.0, 400.0]] * 17)
    main[5], main[6] = [650, 300], [350, 300]
    back = np.array([[120.0, 200.0]] * 17)
    back[5], back[6] = [150, 180], [90, 180]
    d = _fake_rtm(main, scores)
    d._body = lambda bgr: (np.array([main, back]), np.array([scores, scores]))
    assert len(d.detect(Image.new("RGB", (w, h)))) == 1
    d.min_person_ratio = 0.0
    assert len(d.detect(Image.new("RGB", (w, h)))) == 2
