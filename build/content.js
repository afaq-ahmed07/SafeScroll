(function () {
    
    // Add this at the beginning of content.js
    console.log('Content script loaded');

    // Track processed images
    const processedImages = new Set();
    let isSubscribed = false;
    let username = '';
    let isProcessingEnabled = true;

    // Track observers for different contexts
    const observers = {
        body: null,
        images: new Map() // Map of image elements to their observers
    };

    // Debounce function to limit how often we send messages
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Add blur effect to images
    function applyBlurEffect(imgElement) {
        imgElement.style.filter = 'blur(10px)';
        imgElement.style.transition = 'filter 0.3s ease';
        imgElement.classList.add('hateful-meme');
        imgElement.dataset.processed = 'true';
    }

    // Remove blur effect from images
    function removeBlurEffect(imgElement) {
        imgElement.style.filter = 'none';
        imgElement.classList.remove('hateful-meme');
        imgElement.dataset.processed = 'false';
    }

    // Function to remove blur from all processed images
    function removeAllBlurEffects() {
        const blurredImages = document.querySelectorAll('.hateful-meme');
        console.log("Found blurred images to clear:", blurredImages.length);
        
        blurredImages.forEach(img => {
            console.log("Removing blur from:", img.src);
            removeBlurEffect(img);
        });
    }

    // Function to check if an image is inappropriate using the Flask API
    async function checkImageInappropriate(imageUrl) {
        try {
            const response = await fetch('http://127.0.0.1:5000/predict', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ image_url: imageUrl })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log("API Response:", data); // Debug log
            return {
                isInappropriate: data.is_inappropriate,
                confidence: data.confidence
            };
        } catch (error) {
            console.error('Error checking image:', error);
            return { isInappropriate: false, confidence: 0 };
        }
    }

    // Function to process an image element
    async function processImageElement(img) {
        if(!isProcessingEnabled) return null;
        // Skip if already processed or invalid URL
        if (!img.src || !img.src.startsWith('http') || processedImages.has(img.src)) {
            return null;
        }

        // Wait for image to load to get dimensions
        if (!img.complete) {
            try {
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                });
            } catch (error) {
                console.error('Error loading image:', error);
                return null;
            }
        }

        // Check image dimensions
        if (img.naturalWidth < 50 || img.naturalHeight < 50) {
            console.log(`Skipping small image: ${img.src} (${img.naturalWidth}x${img.naturalHeight})`);
            processedImages.add(img.src); // Mark as processed to avoid rechecking
            return null;
        }

        try {
            // const result = await checkImageInappropriate(img.src);
            const result = { isInappropriate: true, confidence: 0.9 };
            console.log("Processing image:", img.src, "Result:", result); // Debug log

            // Mark image as processed
            processedImages.add(img.src);

            if (result.isInappropriate && result.confidence > 0.76) {
                applyBlurEffect(img);
                return {
                    url: img.src,
                    isInappropriate: true,
                    confidence: result.confidence,
                };
            }

            return {
                url: img.src,
                isInappropriate: false,
                confidence: result.confidence,
            };
        } catch (error) {
            console.error('Error processing image:', error);
            return null;
        }
    }

    // Function to process and collect image URLs
    async function processAndCollectImages() {
        const images = Array.from(document.querySelectorAll("img"));
        const processedResults = await Promise.all(
            images.map(img => processImageElement(img))
        );
        return processedResults.filter(result => result !== null);
    }

    // Batch of images to be sent
    let imageBatch = new Set();

    // Function to send batched images
    const sendBatchedImages = debounce(() => {
        if (imageBatch.size > 0) {
            const imagesToSend = Array.from(imageBatch);
            console.log("Sending batch to background:", imagesToSend); // Debug log

            chrome.runtime.sendMessage({
                action: "newImages",
                images: imagesToSend,
                username: username
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Error sending images:', chrome.runtime.lastError);
                } else {
                    console.log(`Successfully sent ${imagesToSend.length} images`);
                }
            });

            imageBatch.clear();
        }
    }, 3000); // Wait 3 seconds before sending

    // Function to create and manage observers
    function createObserver(target, config) {
        const observer = new MutationObserver(handleMutations);
        observer.observe(target, config);
        return observer;
    }

    // Function to safely disconnect and clean up an observer
    function cleanupObserver(observer) {
        if (observer) {
            try {
                observer.disconnect();
                return true;
            } catch (error) {
                console.error('Error disconnecting observer:', error);
                return false;
            }
        }
        return true;
    }

    // Function to cleanup all observers
    function cleanupAllObservers() {
        // Cleanup body observer
        if (observers.body) {
            cleanupObserver(observers.body);
            observers.body = null;
        }

        // Cleanup image-specific observers
        for (const [img, observer] of observers.images) {
            cleanupObserver(observer);
        }
        observers.images.clear();

        // Clear window state
        window.observerInitialized = false;
    }

    // Function to handle mutations
    async function handleMutations(mutations) {
        if(!isProcessingEnabled) return;
        const newImageElements = [];

        mutations.forEach(mutation => {
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Check if node itself is an image
                        if (node.tagName === 'IMG' && node.src) {
                            newImageElements.push(node);
                        }
                        // Check for nested images
                        const images = node.querySelectorAll('img:not([data-processed])');
                        newImageElements.push(...images);
                    }
                });
            }
        });

        // Process new images and collect results
        const processPromises = newImageElements.map(img => processImageElement(img));
        const results = await Promise.all(processPromises);
        const validResults = results.filter(result => result !== null);

        console.log("New processed images:", validResults); // Debug log

        if (validResults.length > 0 && isSubscribed) {
            validResults.forEach(result => imageBatch.add(result));
            sendBatchedImages();
        }
    }

    // Function to initialize the observer
    async function initializeObserver() {
        console.log("Starting observer initialization");
        
        try {
            // Cleanup any existing observers
            cleanupAllObservers();

            // Process initial images
            const initialImages = await processAndCollectImages();
            console.log("Initial images processed:", initialImages);

            if (initialImages.length > 0 && isSubscribed) {
                initialImages.forEach(image => imageBatch.add(image));
                sendBatchedImages();
            }

            // Create body observer
            observers.body = createObserver(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['src']
            });

            // Create image-specific observers
            const images = document.querySelectorAll('img');
            images.forEach(img => {
                const imgObserver = createObserver(img, {
                    attributes: true,
                    attributeFilter: ['src']
                });
                observers.images.set(img, imgObserver);
            });

            window.observerInitialized = true;
            console.log("Observer initialized successfully");
            return true;
        } catch (error) {
            console.error("Error in initializeObserver:", error);
            cleanupAllObservers();
            return false;
        }
    }

    // Function to handle initialization when both conditions are met
    async function handleInitialization() {
        console.log("Checking initialization conditions");
        console.log("Start message received:", startMessageReceived);
        console.log("Document ready state:", document.readyState);
        
        // Consider 'interactive' state as ready enough for our purposes
        const isReady = document.readyState === 'complete' || document.readyState === 'interactive';
        
        if (startMessageReceived && isReady) {
            console.log("Starting initialization process");
            const success = await initializeObserver();
            console.log("Initialization completed, success:", success, "Observer state:", observers);
        } else {
            console.log("Conditions not met for initialization:",
                      "startMessageReceived:", startMessageReceived,
                      "readyState:", document.readyState);
        }
    }

    // Flag to track if we've received the start message
    let startMessageReceived = false;

    // Listen for messages from background.js
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "startImageGrabbing") {
            console.log("Received startImageGrabbing message");
            console.log("Current observer state before start:", observers);
            startMessageReceived = true;
            isSubscribed = message.isSubscribed;
            username = message.username;
            
            
            // Handle initialization asynchronously
            handleInitialization().then(() => {
                if (observers.body) {
                    console.log("Final observer state after initialization:", observers);
                    sendResponse({ status: "success", message: "Image grabbing started successfully" });
                } else {
                    console.log("Observer not initialized properly");
                    sendResponse({ status: "error", message: "Failed to initialize observer" });
                }
            }).catch(error => {
                console.error("Error during initialization:", error);
                sendResponse({ status: "error", message: "Error starting image grabbing" });
            });
            
            return true; // Keep the message channel open for async response
        } else if (message.action === "stopImageCollection") {
            console.log("Received stopImageCollection message");
            isProcessingEnabled = false;
            
            try {
                // Cleanup all observers
                cleanupAllObservers();
                
                // Remove blur effects from all images
                removeAllBlurEffects();
                
                // Clear batch and processed images
                imageBatch.clear();
                processedImages.clear();
                
                // Reset flags
                startMessageReceived = false;
                
                sendResponse({ status: "success", message: "Image collection stopped successfully" });
            } catch (error) {
                console.error("Error stopping image collection:", error);
                sendResponse({ status: "error", message: "Failed to stop image collection" });
            }
            
            return true;
        }
    });

    // Listen for DOM ready state changes
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', handleInitialization);
    } else {
        handleInitialization();
    }
})();