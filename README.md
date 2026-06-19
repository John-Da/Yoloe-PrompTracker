# 🎯 PromptTracker — Prompt-based Object Detection & Tracking
 
A browser-based video analysis tool powered by **YOLOE** (You Only Look Once Everything). Select a text prompt like `"person"` or `"car"`, upload a video, and watch bounding boxes track objects in real time — no training required.
 
---
 
## ✨ Features
 
- **Text-prompt detection** — select any of 80 COCO labels to detect and track
- **Real-time bounding box overlay** — SVG boxes drawn directly over the video player
- **Confidence threshold control** — adjust detection sensitivity with a live slider
- **Detection summary panel** — shows object count, track IDs, avg confidence, and FPS
- **Export annotated video** — download the full video with bounding boxes burned in
- **Event log** — timestamped log of all detection and playback events
- **Dark UI** — GitHub-style dark theme
---
 
## 🖥️ Stack
 
| Layer | Technology |
|---|---|
| Frontend | Vanilla JS, HTML5 Canvas, SVG overlay |
| Backend | Python, Flask, Flask-CORS |
| Detection | [Ultralytics YOLOE](https://github.com/ultralytics/ultralytics) |
| Vision | OpenCV |
 
---
 
## 🚀 Getting Started
 
### 1. Clone the repo
 
```bash
git clone https://github.com/John-Da/Yoloe-PrompTracker.git
cd Yoloe-PrompTracker
```
 
### 2. Create a virtual environment
 
```bash
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
```
 
### 3. Install dependencies
 
```bash
pip install -r requirements.txt
```
 
### 4. Run the server
 
```bash
python3 app.py
```
 
### 5. Open the app
 
Visit `http://127.0.0.1:5000` in your browser.
 
---
 
## 📖 Usage
 
1. **Select a prompt** — click a label button (e.g. `person`, `car`, `dog`)
2. **Upload a video** — click _Upload Video_ and choose an `.mp4` file
3. **Press play** — bounding boxes appear and update as the video plays
4. **Adjust confidence** — use the slider to filter weak detections
5. **Export** — click _Export Video_ to download the annotated output
---
 
## ⚙️ Configuration
 
In `static/app.js`, set your backend URL:
 
```js
const API_BASE = "http://127.0.0.1:5000";
```
 
If running the backend remotely (e.g. Google Colab + ngrok), replace this with your ngrok URL:
 
```js
const API_BASE = "https://abc123.ngrok-free.app";
```
 
---
 
## 📦 Model
 
The app uses `yoloe-11m-seg.pt` by default, which downloads automatically on first run via Ultralytics.
 
For faster inference on CPU, switch to the small model in `app.py`:
 
```python
modelE = YOLOE("yoloe-11s-seg.pt")
```
 
| Model | Speed (CPU) | Accuracy |
|---|---|---|
| `yoloe-11s-seg.pt` | ~150–200ms/frame | Good |
| `yoloe-11m-seg.pt` | ~430–500ms/frame | Better |
 
> **Note:** MPS (Apple Silicon GPU) is not currently supported due to a float64 limitation in the YOLOE model. CPU inference is recommended for local use. For real-time performance, run the backend on a GPU instance (e.g. Google Colab T4) and connect via ngrok.
 
---
 
## 📁 Project Structure
 
```
Yoloe-PrompTracker/
├── app.py              # Flask backend — detection & export API
├── requirements.txt
├── .gitignore
└── static/
    ├── index.html      # Main UI
    ├── app.js          # Detection loop, bbox drawing, video handling
    └── style.css       # Dark theme styles
```
 
---
 
## 🔮 Outputs

 - Preview

https://github.com/user-attachments/assets/82de62e8-0b9c-4263-9a6a-205f72f714d7


 - Exported

https://github.com/user-attachments/assets/a7b4e735-8281-4b11-bf0c-61ec500958d0


---



 
