# SafeScroll

SafeScroll is a browser extension and companion backend that detects potentially harmful or inappropriate images (e.g., hateful memes) and applies on-the-fly blurring to create a safer browsing experience.

### Authors
- Wajee Ul Hassan
- Om Parkash
- Afaq Ahmed

### Contribution highlights
- Model research and implementation: Wajee Ul Hassan, Om Parkash
- Extension and backend integration: Afaq Ahmed (with collaboration across the team)

---

## Image Blur Detection System
A system that detects potentially harmful or inappropriate images and applies blurring to them.

### Screenshots
![image](https://github.com/user-attachments/assets/32a7c7b9-e502-492e-86ce-e397573c188c)

![image](https://github.com/user-attachments/assets/41a71a30-d16b-4784-8be0-acdda9139d7d)

### Demo videos

<video src="https://github.com/user-attachments/assets/a538c049-8fa3-41e1-afaa-10522e4692b3" controls width="100%"></video>

<video src="https://github.com/user-attachments/assets/d3476de8-cead-4be4-ab4a-f27675737c00" controls width="100%"></video>

### Extension walkthrough (file in this repo)
<video src="./Extension.mp4" controls width="100%" preload="metadata"></video>

If the inline player does not load in your browser, open the file on GitHub: [`Extension.mp4`](./Extension.mp4).

---

## Features
- Detects potentially harmful or inappropriate content in images
- Deep learning models for multimodal (image/text) analysis
- Real-time, in-page image processing via browser extension
- Simple Python REST API for predictions
- Drop-in integration with existing web experiences

## Tech stack
- Browser extension (content/background scripts + UI)
- Node.js backend (Express + EJS views) for app flows and integration
- Python model server (Flask) hosting deep learning models
- MongoDB + Mongoose for persistence (where applicable)

## Prerequisites
- Python 3.8+
- Node.js 18+ and npm
- Git

## Installation

1) Clone the repository
```bash
git clone https://github.com/omi1215/SafeScroll.git
cd SafeScroll
```

2) Python model server dependencies
```bash
cd python-model
pip install -r requirements.txt
```

3) Node.js app dependencies (root)
```bash
cd ..
npm install
```

4) (Optional) Build browser extension assets
```bash
npm run build
```

## Running the application

Run the Python model server (Flask):
```bash
cd python-model
python app.py
```
By default serves on http://localhost:5000

Run the Node.js app (serves pages and extension flows):
```bash
cd ..
npm start
```
By default serves on http://localhost:3000 (depending on your setup)

Load the extension (manual step):
- Open your Chromium-based browser → Extensions → Enable Developer Mode
- Load unpacked → select the `public` directory

## API (model server)

### POST /predict
Request
```json
{
  "image_url": "URL_TO_IMAGE"
}
```

Response (example)
```json
{
  "prediction": 0,
  "confidence": 0.95
}
```
Where `prediction` is 0 for safe and 1 for unsafe.

## Project structure

```
SafeScroll/
├── python-model/                 # Python (Flask) model server
│   ├── app.py                    # Entrypoint
│   ├── predict_DualBranch.py     # Dual-branch prediction logic
│   ├── predict_SBNET.py          # Alternative model path
│   ├── fe.py                     # Feature extraction utilities
│   ├── DualBranch/               # Weights for dual-branch model
│   └── SBNET/                    # Weights for SBNet model
├── public/                       # Browser extension (content/background, UI)
│   ├── background.js
│   ├── content.js
│   ├── popup.html / popup.js / popup.css
│   └── css/, js/, assets/...
├── views/                        # EJS templates (Node app)
├── routes/                       # Express routes
├── middlewares/                  # Express middlewares
├── index.js                      # Node.js server
└── build.js                      # Build script for extension assets
```

## Acknowledgements
This implementation builds on our undergraduate research into hateful meme detection and safe content presentation. Many thanks to teammates and reviewers who contributed feedback and evaluation.

## Contributing
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to your fork
5. Open a Pull Request

## License
MIT — see `LICENSE` for details.
