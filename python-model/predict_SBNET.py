from fe import process_image
import torch
import torch.nn as nn
import numpy as np

# Force CPU usage
device = "cpu"
torch.cuda.is_available = lambda: False  # Force CPU mode


# Define Embedding Extraction Module
def make_fc_1d(f_in, f_out):
    return nn.Sequential(
        nn.Linear(f_in, f_out),
        nn.BatchNorm1d(f_out),
        nn.ReLU(inplace=True),
        nn.Dropout(p=0.5),
    )


class EmbedBranch(nn.Module):
    def __init__(self, feat_dim, embedding_dim):
        super(EmbedBranch, self).__init__()
        self.fc1 = make_fc_1d(feat_dim, embedding_dim)
        self.fc2 = make_fc_1d(embedding_dim, embedding_dim)

    def forward(self, x):
        x = self.fc1(x)
        x = self.fc2(x)
        x = nn.functional.normalize(x)
        return x


# Define Single-Branch Network (SBNET)
class SBNET(nn.Module):
    def __init__(self, feat_dim, embedding_dim, n_class):
        super(SBNET, self).__init__()
        self.embed_branch = EmbedBranch(feat_dim, embedding_dim)
        self.logits_layer = nn.Linear(embedding_dim, n_class)

    def forward(self, feats):
        feats = self.embed_branch(feats)
        logits = self.logits_layer(feats)
        return feats, logits



def predict(model, image_features, text_features, mode="both"):
    model.eval()
    dtype = torch.float32

    with torch.no_grad():
        # Ensure tensors are 2D and have the correct dtype
        if image_features is not None:
            if not isinstance(image_features, torch.Tensor):
                image_features = torch.tensor(image_features, dtype=dtype)
            image_features = (
                image_features.unsqueeze(0)
                if image_features.dim() == 1
                else image_features
            )

        if text_features is not None:
            if not isinstance(text_features, torch.Tensor):
                text_features = torch.tensor(text_features, dtype=dtype)
            text_features = (
                text_features.unsqueeze(0)
                if text_features.dim() == 1
                else text_features
            )

        # Concatenate features based on mode
        if mode == "both":
            features = torch.cat((image_features, text_features), dim=1)
        elif mode == "image":
            features = image_features
        elif mode == "text":
            features = text_features

        # Forward pass through the model
        _, logits = model(features)
        probs = torch.softmax(logits, dim=1)
        pred_class = logits.argmax(dim=1).item()
        pred_probs = probs.squeeze(0).numpy()

    return pred_class, pred_probs

def load_model(model_path, weights_only=False):
    try:
        if weights_only:
            # Create a new model instance with the correct architecture
            feat_dim = 1152  # 384 (text) + 768 (image)
            embedding_dim = 768
            num_classes = 2

            # Initialize the model
            model = SBNET(
                feat_dim=feat_dim, embedding_dim=embedding_dim, n_class=num_classes
            )

            # Load just the state dict (weights)
            state_dict = torch.load(model_path, map_location=torch.device("cpu"))

            # If the saved file is already a state dict, use it directly
            if isinstance(state_dict, dict) and all(
                isinstance(k, str) for k in state_dict.keys()
            ):
                model.load_state_dict(state_dict)
            else:
                raise ValueError(
                    "The model file does not contain a valid state dictionary"
                )
        else:
            # Load the complete model (architecture + weights)
            try:
                model = torch.load(model_path, map_location=torch.device("cpu"))
                print("Full model loaded successfully")
            except Exception as e:
                print(f"Error loading full model: {str(e)}")
                raise e

        model.eval()  # Set the model to evaluation mode
        return model

    except Exception as e:
        print(f"Error loading model: {str(e)}")
        raise e
