from flask import Flask, request, jsonify
from flask_cors import CORS
from predict_DualBranch import predict_combined
from fe import process_image, cleanup_image, download_image, extract_text_from_image, extract_image_features, extract_text_features
import torch
import os

app = Flask(__name__)
CORS(app)

# Force CPU usage
device = "cpu"
torch.cuda.is_available = lambda : False

# Model parameters - these must match what was used during training
embed_dim = 768  # Embedding dimension
img_feat_dim = 768
text_feat_dim = 384
num_classes = 2

# Load both models
try:
    model_paths = [
        os.path.abspath("DualBranch/covid_model.pth"),
        os.path.abspath("DualBranch/us_model.pth")
    ]
    
    # Verify models exist
    for model_path in model_paths:
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model not found at {model_path}")
    
    print(f"✓ Models loaded successfully from: {model_paths}")
except Exception as e:
    print(f"Error loading models: {str(e)}")
    model_paths = None

@app.route('/predict', methods=['POST'])
def predict_image():
    try:
        if model_paths is None:
            return jsonify({'error': 'Models not loaded properly'}), 500
            
        data = request.get_json()
        image_url = data.get('image_url')
        print(image_url)
        
        if not image_url:
            return jsonify({'error': 'No image URL provided'}), 400

        # Process image and get features
        text_features, image_features = process_image(image_url)
        if text_features is None or image_features is None:
            return jsonify({'error': 'Failed to process image'}), 400

        # Make prediction using both models
        final_pred, individual_preds = predict_combined(model_paths, image_features, text_features, mode="both")
        
        # Get probabilities from the individual predictions
        probabilities = []
        confidence_scores = []
        for pred in individual_preds:
            if pred[1] is not None:
                probs = pred[1].tolist()
                probabilities.append(probs)
                confidence_scores.append(probs[1])  # Get hate probability
            else:
                probabilities.append([0.0, 0.0])
                confidence_scores.append(0.0)
        
        # Calculate overall confidence as maximum of individual confidences
        overall_confidence = max(confidence_scores) if confidence_scores else 0.0
        
        return jsonify({
            'prediction': int(final_pred),
            'probabilities': probabilities,
            'is_inappropriate': bool(final_pred == 1),
            'confidence': float(overall_confidence),
            'model_predictions': [
                {
                    'model': 'covid_model',
                    'prediction': int(individual_preds[0][0]) if individual_preds[0][0] is not None else None,
                    'confidence': float(individual_preds[0][1][1]) if individual_preds[0][1] is not None else 0.0
                },
                {
                    'model': 'us_model',
                    'prediction': int(individual_preds[1][0]) if individual_preds[1][0] is not None else None,
                    'confidence': float(individual_preds[1][1][1]) if individual_preds[1][1] is not None else 0.0
                }
            ]
        })

    except Exception as e:
        print("Error during prediction:", e)
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)