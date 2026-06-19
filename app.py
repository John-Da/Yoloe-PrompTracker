from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from ultralytics import YOLOE, YOLO
import cv2, numpy as np, base64, os
import time

STATIC_FOLDER = "static"
app = Flask(__name__, static_folder=STATIC_FOLDER)
CORS(app)

modelE = YOLOE("yoloe-11s-seg.pt")
print("✅ YOLOE loaded")


@app.route("/")
def index():
    return send_from_directory(STATIC_FOLDER, "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(STATIC_FOLDER, filename)


@app.route("/api/detect", methods=["POST"])
def detect():
    t0 = time.time()

    data = request.get_json()
    frame_b64 = data.get("frame_b64")
    prompt = data.get("prompt", "person")
    conf_thres = float(data.get("confidence", 0.5))

    img_bytes = base64.b64decode(frame_b64)
    img_arr = np.frombuffer(img_bytes, dtype=np.uint8)
    frame = cv2.imdecode(img_arr, cv2.IMREAD_COLOR)

    if frame is None:
        return jsonify({"error": "Invalid frame"}), 400

    modelE.set_classes([prompt], modelE.get_text_pe([prompt]))

    # modelE.set_classes(...)
    # results = modelE.predict(frame, conf=conf_thres, verbose=False)

    results = modelE.track(frame, conf=conf_thres, persist=True, verbose=False)

    result = results[0]
    h, w = frame.shape[:2]
    boxes, track_ids, confs = [], [], []

    if result.boxes is not None:
        for i, box in enumerate(result.boxes):
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            conf_score = float(box.conf[0])
            track_id = int(box.id[0]) if box.id is not None else i + 1
            boxes.append(
                {
                    "x": x1 / w,
                    "y": y1 / h,
                    "width": (x2 - x1) / w,
                    "height": (y2 - y1) / h,
                    "conf": round(conf_score, 3),
                    "id": track_id,
                    "label": prompt,
                }
            )
            track_ids.append(track_id)
            confs.append(conf_score)

    annotated = result.plot()
    _, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
    annotated_b64 = base64.b64encode(buf).decode()

    avg_conf = round(sum(confs) / len(confs), 3) if confs else 0.0

    print(f"⏱ detect: {(time.time()-t0)*1000:.0f}ms")

    return jsonify(
        {
            "boxes": boxes,
            "count": len(boxes),
            "avg_conf": avg_conf,
            "track_ids": track_ids,
            "prompt": prompt,
            "annotated_frame": annotated_b64,
        }
    )


@app.route("/api/export", methods=["POST"])
def export_video():
    import tempfile

    prompt = request.form.get("prompt", "person")
    conf_thres = float(request.form.get("confidence", 0.5))
    video_file = request.files.get("video")

    if not video_file:
        return jsonify({"error": "No video uploaded"}), 400

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp_path = tmp.name
        video_file.save(tmp_path)

    out_path = tmp_path.replace(".mp4", "_out.mp4")
    cap = cv2.VideoCapture(tmp_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    writer = cv2.VideoWriter(
        out_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height)
    )

    modelE.set_classes([prompt], modelE.get_text_pe([prompt]))
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        results = modelE.predict(frame, conf=conf_thres, verbose=False)
        writer.write(results[0].plot())

    cap.release()
    writer.release()
    os.unlink(tmp_path)

    with open(out_path, "rb") as f:
        video_b64 = base64.b64encode(f.read()).decode()
    os.unlink(out_path)

    return jsonify({"video_b64": video_b64, "format": "mp4"})


if __name__ == "__main__":
    app.run(port=5000, debug=False)
