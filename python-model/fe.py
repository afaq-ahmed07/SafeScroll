# -*- coding: utf-8 -*-

import requests
import os
from urllib.parse import urlparse
from PIL import Image
import base64
import google.generativeai as genai
import torch
import clip
import pandas as pd
from sentence_transformers import SentenceTransformer
import torchvision.transforms as transforms
import re
from dotenv import load_dotenv
load_dotenv()

API_KEY = os.getenv('GOOGLE_API_KEY')
if not API_KEY:
    raise ValueError("Please set the GOOGLE_API_KEY environment variable")
genai.configure(api_key=API_KEY)

# Force CPU usage
device = "cpu"
torch.cuda.is_available = lambda : False  # Force CPU mode

# Load models
sbert_model = SentenceTransformer('all-MiniLM-L6-v2').to(device)
model, preprocess = clip.load("ViT-L/14@336px", device=device)

def get_extension(url, response):
    """Determine the image extension from the URL or Content-Type header."""
    parsed_url = urlparse(url)
    ext = os.path.splitext(parsed_url.path)[-1].lower()

    valid_extensions = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".avif"}

    if ext not in valid_extensions:
        content_type = response.headers.get("Content-Type", "").lower()
        ext_map = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/gif": ".gif",
            "image/bmp": ".bmp",
            "image/webp": ".webp",
            "image/avif": ".avif"
        }
        ext = ext_map.get(content_type, ".jpg")  # Default to .jpg if unknown

    return ext

def cleanup_image(filepath):
    """Clean up downloaded image file."""
    try:
        if os.path.exists(filepath):
            os.remove(filepath)
            # print(f"Cleaned up image: {filepath}")
    except Exception as e:
        print(f"Error cleaning up image {filepath}: {e}")

def download_image(url, save_dir="downloads"):
    """Download an image from the URL and save it with the correct extension."""
    response = requests.get(url, stream=True)

    if response.status_code == 200:
        os.makedirs(save_dir, exist_ok=True)  # Ensure save directory exists

        ext = get_extension(url, response)
        filename = f"downloaded_image{ext}"
        save_path = os.path.join(save_dir, filename)

        with open(save_path, 'wb') as file:
            for chunk in response.iter_content(1024):
                file.write(chunk)

        # print(f"Image downloaded successfully: {save_path}")
        return save_path  # Return the saved image path
    else:
        print(f"Failed to download image. HTTP Status: {response.status_code}")
        return None

def encode_image(image_path):
    """Convert image to base64 for API input."""
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")


def extract_text_from_image(image_path):
    """Extract only the text from an image using Gemini 1.5, returning 'notext' if nothing is found."""
    try:
        image_data = encode_image(image_path)

        model = genai.GenerativeModel("gemini-1.5-flash")

        response = model.generate_content(
            [
                {
                    "inline_data": {
                        "mime_type": "image/jpeg",  # Modify based on actual image format
                        "data": image_data
                    }
                },
                {
                    "text": (
                        "Extract ONLY the text from this image. Do NOT provide any explanations, "
                        "extra details, assumptions, or descriptions. If no text is found, return the word 'notext'."
                    )
                }
            ]
        )

        extracted_text = response.text.strip() if response else "notext"

        if not extracted_text:  # Ensure 'notext' is returned when the response is empty
            extracted_text = "notext"

        # print("\nExtracted Text:", extracted_text)
        return extracted_text
    except Exception as e:
        print("Error extracting text:", e)
        return "notext"


def preprocess_text(text):
    """Preprocess extracted text: clean and normalize."""
    text = str(text)
    text = re.sub(r'\n', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    text = text.lower()
    text = re.sub(r'[^\w\s]', '', text)  # Remove special characters
    return text


def extract_text_features(text):
    """Extracts text features using SBERT."""
    if text == "notext":  # Handle case where no text is found
        return [0] * 384  # SBERT's output dimension is 384
    return sbert_model.encode(text).tolist()


def extract_image_features(image_path):
    """Extracts image features using CLIP."""
    try:
        image = Image.open(image_path).convert("RGB")
        image = preprocess(image).unsqueeze(0).to(device)

        with torch.no_grad():
            image_features = model.encode_image(image)

        return image_features.cpu().numpy().flatten().tolist()
    except Exception as e:
        print(f"Error processing {image_path}: {e}")
        return [0] * 768  # CLIP's ViT-L/14 output dimension is 768

def process_image(url):
    """Downloads an image, extracts text and image features, and returns them."""
    
    # Step 1: Download image
    image_path = download_image(url)

    if not image_path:
        return None, None  # Return None if image download failed

    try:
        # Step 2: Extract text
        extracted_text = extract_text_from_image(image_path)

        # Step 3: Preprocess text
        processed_text = preprocess_text(extracted_text)

        # Step 4: Extract Features
        text_features = extract_text_features(processed_text)
        image_features = extract_image_features(image_path)

        # Clean up the downloaded image
        cleanup_image(image_path)

        return text_features, image_features

    except Exception as e:
        print(f"Error processing image: {e}")
        # Clean up in case of error
        cleanup_image(image_path)
        return None, None

