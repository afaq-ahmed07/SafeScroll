from flask import Flask, request, jsonify
from flask_cors import CORS
from predict_DualBranch import predict, load_model
from fe import process_image, cleanup_image, download_image, extract_text_from_image, extract_image_features, extract_text_features
import torch
import os

app = Flask(__name__)
CORS(app)

# Force CPU usage
device = "cpu"
torch.cuda.is_available = lambda : False

try:
    # Load model using the new load_model function
    covid_model = load_model("DualBranch/covid_model.pth")
    us_model=load_model("DualBranch/us_model.pth")
    
    covid_model.eval()
    us_model.eval()
    print(f"✓ Model loaded successfully from: {os.path.abspath('DualBranch/covid_model.pth')}")
except Exception as e:
    covid_model = None
    us_model = None

@app.route('/predict', methods=['POST'])
def predict_image():
    try:
        if covid_model is None or us_model is None:
            return jsonify({'error': 'Model not loaded properly'}), 500
        data = request.get_json()
        image_url = data.get('image_url')
        print(image_url)
        
        if not image_url:
            return jsonify({'error': 'No image URL provided'}), 400

        # Process image and get features
        text_features, image_features = process_image(image_url)
        # image_path = download_image(image_url)
        # if not image_path:
            # return jsonify({'error': 'Failed to download image'}), 400
        # img_features = extract_image_features(image_path)
        # text = extract_text_from_image(image_path)
        # text_features = extract_text_features(text)
        # cleanup_image(image_path)
        if text_features is None or image_features is None:
            return jsonify({'error': 'Failed to process image'}), 400

        # Make prediction
        covid_pred_class, covid_pred_probs = predict(covid_model, image_features, text_features, mode="both")
        
        # Make prediction
        us_pred_class, us_pred_probs = predict(us_model, image_features, text_features, mode="both")
        if covid_pred_class == 1 or us_pred_class == 1:
            
            return jsonify({
            'prediction': int(pred_class),
            'probabilities': pred_probs.tolist(),
            'is_inappropriate': bool(pred_class == 1),
            'confidence': float(pred_probs[pred_class])
        })

    except Exception as e:
        # Clean up any remaining files in the downloads directory
        print("Error during prediction:", e)
        if os.path.exists('downloads'):
            for file in os.listdir('downloads'):
                cleanup_image(os.path.join('downloads', file))
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)