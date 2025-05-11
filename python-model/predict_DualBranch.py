from fe import process_image, download_image, extract_text_from_image, extract_image_features, extract_text_features, cleanup_image
import torch
import torch.nn as nn
import numpy as np

# Force CPU usage
device = "cpu"
torch.cuda.is_available = lambda: False  # Force CPU mode


class EmbedBranch(nn.Module):
    def __init__(self, feat_dim, embed_dim):
        super(EmbedBranch, self).__init__()
        self.fc = nn.Sequential(
            nn.Linear(feat_dim, embed_dim),
            nn.ReLU(),
            nn.Dropout(0.5)
        )

    def forward(self, x):
        return self.fc(x)

class GatedFusion(nn.Module):
    def __init__(self, embed_dim):
        super(GatedFusion, self).__init__()
        self.attention = nn.Sequential(
            nn.Linear(embed_dim * 2, embed_dim),
            nn.Sigmoid()
        )

    def forward(self, img_embeds, text_embeds):
        concat = torch.cat((img_embeds, text_embeds), dim=1)
        attention = self.attention(concat)
        fused = attention * img_embeds + (1 - attention) * text_embeds
        return fused

class LinearWeightedAvg(nn.Module):
    def __init__(self, embed_dim):
        super(LinearWeightedAvg, self).__init__()
        self.img_weight = nn.Parameter(torch.rand(embed_dim))
        self.text_weight = nn.Parameter(torch.rand(embed_dim))

    def forward(self, img_embeds, text_embeds):
        return self.img_weight * img_embeds + self.text_weight * text_embeds

class HatefulMemeDetector(nn.Module):
    def __init__(self, img_feat_dim=0, text_feat_dim=0, embed_dim=128, num_classes=2, fusion_type="linear"):
        super(HatefulMemeDetector, self).__init__()

        # Initialize only if img_feat_dim or text_feat_dim is greater than 0
        self.img_branch = EmbedBranch(img_feat_dim, embed_dim) if img_feat_dim > 0 else None
        self.text_branch = EmbedBranch(text_feat_dim, embed_dim) if text_feat_dim > 0 else None

        # Choose fusion mechanism
        if fusion_type == "gated" and img_feat_dim > 0 and text_feat_dim > 0:
            self.fusion_layer = GatedFusion(embed_dim)
        elif fusion_type == "linear" and img_feat_dim > 0 and text_feat_dim > 0:
            self.fusion_layer = LinearWeightedAvg(embed_dim)
        else:
            self.fusion_layer = None  # No fusion if only one modality is present

        # Classification layer with two linear layers
        self.classifier = nn.Sequential(
            nn.Linear(embed_dim, embed_dim),
            nn.ReLU(),
            nn.Linear(embed_dim, num_classes),
            nn.Softmax()
        )

    def forward(self, img_feats=None, text_feats=None, mode="both"):
        # Process image and text embeddings
        img_embeds = self.img_branch(img_feats) if self.img_branch and mode in ["both", "image"] else None
        text_embeds = self.text_branch(text_feats) if self.text_branch and mode in ["both", "text"] else None

        # Fusion logic
        if mode == "both" and img_embeds is not None and text_embeds is not None:
            fused = self.fusion_layer(img_embeds, text_embeds)
        elif mode == "image" and img_embeds is not None:
            fused = img_embeds
        elif mode == "text" and text_embeds is not None:
            fused = text_embeds
        else:
            raise ValueError(f"Invalid mode or missing modality: {mode}")

        # Classification
        logits = self.classifier(fused)
        return logits

# Default model parameters (these will be overridden by the saved model)
embed_dim = 768  # Embedding dimension
img_feat_dim = 768
num_classes = 2
text_feat_dim = 384

# def load_model(model_path, device="cpu"):
#     """
#     Load a pre-trained model from a saved checkpoint.
    
#     Args:
#         model_path (str): Path to the saved model checkpoint
#         device (str): Device to load the model on ("cpu" or "cuda")
        
#     Returns:
#         nn.Module: Loaded model
#     """
#     try:
#         # Load the state dict first to determine the correct dimensions
#         state_dict = torch.load(model_path, map_location=torch.device(device))
        
#         # Get the correct dimensions from the state dict
#         text_branch_weight = state_dict.get('text_branch.fc.0.weight')
#         if text_branch_weight is not None:
#             text_feat_dim = text_branch_weight.shape[1]  # Get input dimension
#         else:
#             text_feat_dim = 384  # Default if not found
        
#         # Create model instance with correct dimensions
#         model = HatefulMemeDetector(
#             img_feat_dim=img_feat_dim,
#             text_feat_dim=text_feat_dim,
#             embed_dim=embed_dim,
#             num_classes=num_classes,
#             fusion_type="gated"
#         )
        
#         # Load state dictionary
#         model.load_state_dict(state_dict)
#         model.to(device)
#         model.eval()  # Set to evaluation mode
#         return model
#     except Exception as e:
#         raise RuntimeError(f"Failed to load model: {str(e)}")

def predict_combined(model_paths, img_features=None, text_features=None, mode="both"):
    """
    Make predictions using multiple models and combine their results.
    Returns 1 if any model predicts hateful content, otherwise returns 0.
    
    Args:
        model_paths (list): List of paths to model checkpoints
        img_features (torch.Tensor, optional): Tensor containing image features. Default is None.
        text_features (torch.Tensor, optional): Tensor containing text features. Default is None.
        mode (str): One of "both", "image", or "text" to determine which modality to use.
        
    Returns:
        tuple: (final_prediction, individual_predictions)
    """
    if not isinstance(model_paths, list):
        raise ValueError("model_paths must be a list of model paths")
    
    # Convert features to tensors if they're not already
    img_features = torch.tensor(img_features, dtype=torch.float32).to(device) if img_features is not None else None
    text_features = torch.tensor(text_features, dtype=torch.float32).to(device) if text_features is not None else None
    
    # Add batch dimension if missing
    if img_features is not None and len(img_features.shape) == 1:
        img_features = img_features.unsqueeze(0)
    if text_features is not None and len(text_features.shape) == 1:
        text_features = text_features.unsqueeze(0)
    
    # Initialize predictions list
    all_predictions = []
    
    # Process each model
    for model_path in model_paths:
        try:
            model = HatefulMemeDetector(
                img_feat_dim=img_feat_dim,
                text_feat_dim=text_feat_dim,
                embed_dim=embed_dim,
                num_classes=num_classes,
                fusion_type="gated"
            )
            
            # Load model
            state_dict = torch.load(model_path, map_location=torch.device(device))
            model.load_state_dict(state_dict)
            model.to(device)
            model.eval()
            
            # Get prediction
            with torch.no_grad():
                logits = model(img_features, text_features, mode)
                probs = logits.squeeze().cpu().numpy()
                pred_class = np.argmax(probs)
                
            all_predictions.append((pred_class, probs))
            
        except Exception as e:
            print(f"Error processing model {model_path}: {str(e)}")
            all_predictions.append((None, None))
    
    # Determine final prediction - return 1 if any model predicted hateful content
    final_prediction = 1 if any(pred[0] == 1 for pred in all_predictions if pred[0] is not None) else 0
    
    return final_prediction, all_predictions