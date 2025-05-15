# SafeScroll - Image Blur Detection System

A system that detects potentially harmful or inappropriate images and applies blurring to them.
![image](https://github.com/user-attachments/assets/32a7c7b9-e502-492e-86ce-e397573c188c)


https://github.com/user-attachments/assets/a538c049-8fa3-41e1-afaa-10522e4692b3



https://github.com/user-attachments/assets/d3476de8-cead-4be4-ab4a-f27675737c00



## Features
- Detects potentially harmful or inappropriate content in images
- Uses deep learning models for image and text analysis
- Provides real-time image processing
- Easy to integrate into existing applications

## Prerequisites

- Python 3.8 or higher
- Node.js (for frontend development)
- Git

## Installation

1. Clone the repository:
```bash
git clone https://github.com/afaq-ahmed07/SafeScroll.git
cd SafeScroll
```

2. Install Python dependencies:
```bash
# Navigate to python-model directory
cd python-model
pip install -r requirements.txt
```

3. Set up environment variables:
```bash
cd ..
# Create a .env file (example provided in .env.example)
touch .env
```

4. Build the frontend:
```bash
# Navigate to public directory
cd public
npm install
npm run build
```

## Running the Application

1. Start the Python backend:
```bash
cd python-model
python app.py
```
The backend will run on http://localhost:5000

2. Start the frontend (optional):
```bash
cd ../public
npm start
```
The frontend will run on http://localhost:3000

## API Endpoints

### Image Prediction
```http
POST /predict
```

Request Body:
```json
{
    "image_url": "URL_TO_IMAGE"
}
```

Response:
```json
{
    "prediction": 0,  # 0 for safe, 1 for unsafe
    "confidence": 0.95
}
```

## Project Structure

```
SafeScroll/
├── python-model/          # Backend Python code
│   ├── app.py           # Flask server
│   ├── predict_DualBranch.py  # Prediction model
│   ├── fe.py            # Feature extraction
│   └── requirements.txt  # Python dependencies
├── public/              # Frontend code
│   ├── background.js    # Browser extension background script
│   └── content.js       # Browser extension content script
└── .env                 # Environment variables
```

## Usage

1. The system can be used as a standalone API service
2. It can be integrated into browser extensions
3. It can be used to process images in batch mode

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
