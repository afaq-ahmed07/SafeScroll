let openedTabId = null; // Store the tab ID
let isSubscribed = false;
let username = "";
let isLoggedIn = false;
let isServerCommunicationEnabled = false;
let currentUsername = null;
let lastActiveTabId = null; // Track the last active tab
let activeTabsWithCollection = new Set(); // Track tabs with active collection

// Function to store images in chrome storage with timestamp
async function storeImagesLocally(images, username) {
  try {
    console.log('Attempting to store images:', images.length, 'for user:', username);

    // Get existing stored images
    const result = await chrome.storage.local.get('storedImages');
    const storedImages = result.storedImages || [];
    console.log('Current stored images:', storedImages.length);

    // Add new images with timestamp and isHateful flag
    const newImages = images.map(img => {
      const imageData = {
        url: img.url || img.src,  // Handle both url and src properties
        username,
        isHateful: img.isInappropriate || false,
        timestamp: Date.now()
      };
      console.log('Processing image:', imageData);
      return imageData;
    });

    // Combine with existing images
    const updatedImages = [...storedImages, ...newImages];

    // Store updated images
    await chrome.storage.local.set({ storedImages: updatedImages });

    console.log('Successfully stored images. Total count:', updatedImages.length);

    // Verify storage
    const verification = await chrome.storage.local.get('storedImages');
    console.log('Verification - stored images count:', verification.storedImages.length);
  } catch (error) {
    console.error('Error storing images locally:', error);
  }
}

// Function to clean up expired images (older than 24 hours)
async function cleanupExpiredImages() {
  try {
    const result = await chrome.storage.local.get('storedImages');
    const storedImages = result.storedImages || [];

    const now = Date.now();
    const oneDayInMs = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    // Filter out images older than 24 hours
    const validImages = storedImages.filter(img =>
      (now - img.timestamp) < oneDayInMs
    );

    // Update storage with only valid images
    await chrome.storage.local.set({ storedImages: validImages });

    console.log('Cleaned up expired images. Remaining:', validImages.length);
  } catch (error) {
    console.error('Error cleaning up expired images:', error);
  }
}
cleanupExpiredImages();

// Function to check if URL is supported
function isSupportedUrl(url) {
  return url && (
    url.includes('facebook.com') ||
    url.includes('instagram.com') ||
    url.includes('pinterest.com') ||
    url.includes('unsplash.com') ||
    url.includes('pexels.com') ||
    url.includes('reddit.com') ||
    url.includes('copyhackers.com') ||
    url.includes('http://127.0.0.1:5500/index.html')
  );
}

// Function to start image collection in a tab
async function startImageCollection(tabId, url) {
  if (!isSupportedUrl(url)) {
    console.log("URL not supported:", url);
    return;
  }

  try {
    // Check if the tab still exists and has the same URL
    const tab = await chrome.tabs.get(tabId);
    console.log("Tab:", tab);
    if (!tab || tab.url !== url) {
      console.log("Tab no longer exists or URL has changed");
      return;
    }

    // Inject content script if not already injected
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
    } catch (error) {
      console.error("Script injection failed:", error);
      return;
    }

    // Start image collection with retry mechanism
    let retries = 3;
    while (retries > 0) {
      try {
        await new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, {
            action: "startImageGrabbing",
            isSubscribed: isSubscribed,
            username: username
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          });
        });
        // If successful, add to tracking and break the retry loop
        activeTabsWithCollection.add(tabId);
        console.log("Started collection in tab:", tabId, "URL:", url);
        break;
      } catch (error) {
        retries--;
        if (retries > 0) {
          console.log(`Retrying... ${retries} attempts left`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          throw error;
        }
      }
    }
  } catch (error) {
    console.error("Error starting collection in tab:", tabId, error);
    // Remove from tracking if there was an error
    activeTabsWithCollection.delete(tabId);
  }
}

// Function to stop image collection in a tab
async function stopImageCollection(tabId) {
  console.log("Attempting to stop collection in tab:", tabId);

  try {
    // Check if the tab exists before attempting to stop collection
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) {
      console.log("Tab no longer exists, cleaning up state for:", tabId);
      activeTabsWithCollection.delete(tabId);
      return;
    }

    // Try to send stop message to content script
    try {
      await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { action: "stopImageCollection" }, (response) => {
          if (chrome.runtime.lastError) {
            // If there's an error (like content script not loaded), just cleanup state
            console.log("Content script not accessible in tab:", tabId);
            resolve();
          } else {
            console.log("Successfully stopped collection in tab:", tabId);
            resolve(response);
          }
        });
      });
    } catch (error) {
      console.log("Error sending stop message to content script:", error);
    }

    // Always clean up the tracking state
    activeTabsWithCollection.delete(tabId);
    if (tabId === lastActiveTabId) {
      lastActiveTabId = null;
    }

    console.log("Cleanup completed for tab:", tabId);
    console.log("Remaining active tabs:", Array.from(activeTabsWithCollection));

  } catch (error) {
    console.error("Error in stopImageCollection:", error);
    // Ensure cleanup even if there's an error
    activeTabsWithCollection.delete(tabId);
  }
}

// Function to stop collection in all tabs
async function stopAllImageCollection() {
  const tabsToStop = Array.from(activeTabsWithCollection);
  console.log("Tabs to stop:", tabsToStop);
  await Promise.all(tabsToStop.map(tabId => stopImageCollection(tabId)));

  // Clear all tracking states
  activeTabsWithCollection.clear();
  lastActiveTabId = null;
  console.log("Collection stopped in all tabs");
}

// Listen for messages from the server
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const subscribeUrl = "http://localhost:3000/subscribe";
  const signinUrl = "http://localhost:3000/signin";
  const dashboardUrl = "http://localhost:3000/dashboard";
  const logoutUrl = "http://localhost:3000/logout";
  const manageUrl = "http://localhost:3000/manageprofile";
  const data = {};

  if (message.action === 'openSubsPage') {
    openTab(subscribeUrl, sendResponse);
  } else if (message.action === 'opensigninPage') {
    openTab(signinUrl, sendResponse);
  } else if (message.action === 'openDashboard') {
    openTab(dashboardUrl, sendResponse);
  } else if (message.action === 'logout') {
    openTab(logoutUrl, sendResponse);
  } else if (message.action === 'manage') {
    openTab(manageUrl, sendResponse);
  } else if (message.action === 'startImageCollection') {
    isSubscribed = message.isSubscribed;
    username = message.username;
    isLoggedIn = true;
    console.log("Image collection started for user:", username, "Subscribed:", isSubscribed);

    // Get the active tab and start collection
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab) {
        console.error("No active tab.");
        sendResponse({ status: "error", message: "No active tab found" });
        return;
      }

      try {
        await startImageCollection(tab.id, tab.url);
        sendResponse({ status: "success", message: "Collection started successfully" });
      } catch (error) {
        console.error("Failed to start collection:", error);
        sendResponse({ status: "error", message: "Failed to start collection" });
      }
    });
    return true; // Keep the message channel open for async response
  } else if (message.action === "newImages") {
    console.log("New images received:", message.images.length, "images from user:", message.username);
    if (message.images && Array.isArray(message.images) && message.images.length > 0) {
      // Store images locally regardless of subscription status for now
      // This helps with debugging and ensures we don't lose any data
      storeImagesLocally(message.images, message.username || username)
        .then(() => {
          console.log("Successfully processed new images batch");
          sendResponse({ status: "success" });
        })
        .catch(error => {
          console.error("Error processing images:", error);
          sendResponse({ status: "error", error: error.message });
        });
      return true; // Keep the message channel open for async response
    } else {
      console.warn("Received invalid images data:", message);
      sendResponse({ status: "error", error: "Invalid image data received" });
    }
  } else if (message.action === "stopImageCollection") {
    console.log("Stopping image collection in all tabs");
    stopAllImageCollection().then(() => {
      sendResponse({ status: "success", message: "Collection stopped in all tabs" });
    }).catch(error => {
      console.error("Error stopping collection:", error);
      sendResponse({ status: "error", message: "Failed to stop collection" });
    });
    return true; // Keep the message channel open for async response
  }
  return true;
});

// Function to handle tab creation and reuse
function openTab(url, sendResponse) {
  if (url.endsWith("/logout")) {
    fetch(url, { method: "GET", credentials: "include" })
      .then((response) => {
        if (!response.ok) {
          return response.json().then((errorData) => {
            console.error("Logout failed:", errorData);
            sendResponse({ success: false, error: errorData.error });
          });
        }
        return response.json();
      })
      .then((data) => {
        if (data && data.message) {
          console.log("Logout successful:", data.message);
          //redirect to a sign-in page in a new tab
          const signinUrl = "http://localhost:3000/signin";
          if (openedTabId) {
            // Close the existing tab
            chrome.tabs.remove(openedTabId, () => {
              if (chrome.runtime.lastError) {
                console.error("Failed to close existing tab:", chrome.runtime.lastError.message);
              }
              createTab(signinUrl, sendResponse);
            });
          } else {
            // Create a new tab directly
            createTab(signinUrl, sendResponse);
          }
          sendResponse({ success: true, message: data.message });
        }
      })
      .catch((error) => {
        console.error("An error occurred during logout:", error);
        sendResponse({ success: false, error: "An unexpected error occurred" });
      });
  }
  else {
    if (openedTabId) {
      // Check if the tab is still open
      chrome.tabs.get(openedTabId, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          // If the tab is closed or not accessible, open a new one
          createTab(url, sendResponse);
        } else {
          // If the tab is open, update its URL and focus it
          chrome.tabs.update(openedTabId, { url, active: true });
          sendResponse({ status: "Updated existing tab" });
        }
      });
    } else {
      // Create a new tab
      createTab(url, sendResponse);
    }
  }
}

// Helper function to create a new tab
function createTab(url, sendResponse) {
  chrome.tabs.create({ url, active: true }, (tab) => {
    openedTabId = tab.id;
    sendResponse({ status: "Success", tabId: openedTabId });
  });
}

// Listen for tab close event to reset openedTabId
chrome.tabs.onRemoved.addListener(async (tabId) => {
  console.log("Tab closed:", tabId);
  if (activeTabsWithCollection.has(tabId)) {
    activeTabsWithCollection.delete(tabId);
  }
  if (tabId === lastActiveTabId) {
    lastActiveTabId = null;
  }
  if (tabId === openedTabId) {
    openedTabId = null;
  }
});

// Listen for tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  console.log("Tab switching from:", lastActiveTabId, "to:", activeInfo.tabId);

  try {
    // First, stop collection in the previous tab if it exists
    if (lastActiveTabId && lastActiveTabId !== activeInfo.tabId) {
      console.log("Stopping collection in previous tab:", lastActiveTabId);
      await stopImageCollection(lastActiveTabId);
    }

    // Check checkbox state after stopping previous collection
    const { checkboxState } = await chrome.storage.local.get("checkboxState");
    console.log("Tab activated:", activeInfo.tabId, "Checkbox state:", checkboxState);

    if (!checkboxState) {
      console.log("Checkbox is unchecked, no new collection will start");
      return;
    }

    // Get complete tab information for the new tab using activeInfo.tabId
    const tab = await chrome.tabs.get(activeInfo.tabId);
    console.log("Active tab info:", tab);

    // Wait for tab to be fully loaded
    if (!tab || !tab.url || tab.status !== 'complete') {
      console.log("Tab not ready yet, waiting for load completion");
      return;
    }

    console.log("Switching to tab with URL:", tab.url);

    // Update last active tab
    lastActiveTabId = activeInfo.tabId;

    // Start collection in new tab if URL is supported
    if (isSupportedUrl(tab.url)) {
      console.log("Starting collection in new tab:", activeInfo.tabId);

      try {
        // Get current subscription status
        const response = await fetch('http://localhost:3000/popup', {
          credentials: 'include'
        });
        const data = await response.json();
        isSubscribed = data.isSubscribed;
        username = data.username;

        console.log("Updated subscription status:", { isSubscribed, username });

        // Ensure content script is loaded and initialized
        await chrome.scripting.executeScript({
          target: { tabId: activeInfo.tabId },
          files: ['content.js']
        });

        // Wait a moment for the content script to initialize
        await new Promise(resolve => setTimeout(resolve, 500));

        // Start the collection
        await startImageCollection(activeInfo.tabId, tab.url);
      } catch (error) {
        console.error("Error during collection setup:", error);
      }
    } else {
      console.log("New tab URL not supported:", tab.url);
    }
  } catch (error) {
    console.error("Error during tab switch:", error);
    // Ensure lastActiveTabId is updated even if there's an error
    lastActiveTabId = activeInfo.tabId;
  }
});

// Listen for URL changes
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only proceed if we have a complete URL and the tab is fully loaded
  if (!tab.url) return;

  console.log("Tab updated:", tabId, "Status:", changeInfo.status, "URL:", tab.url);

  // If this is a loading status update
  if (changeInfo.status === 'complete') {
    const { checkboxState } = await chrome.storage.local.get("checkboxState");
    console.log("Tab load completed:", tabId, "URL:", tab.url, "Checkbox state:", checkboxState);

    if (!checkboxState) {
      await stopImageCollection(tabId);
      return;
    }

    // Handle URL change in any tab that's being tracked or is the active tab
    if (activeTabsWithCollection.has(tabId) || tabId === lastActiveTabId) {
      if (isSupportedUrl(tab.url)) {
        console.log("Starting collection after tab load:", tab.url);
        try {
          // Get current subscription status
          const response = await fetch('http://localhost:3000/popup', {
            credentials: 'include'
          });
          const data = await response.json();
          isSubscribed = data.isSubscribed;
          username = data.username;

          console.log("Updated subscription status:", { isSubscribed, username });

          // Start collection
          await startImageCollection(tabId, tab.url);
        } catch (error) {
          console.error("Error starting collection after tab load:", error);
        }
      } else {
        console.log("Stopping collection - URL not supported:", tab.url);
        await stopImageCollection(tabId);
      }
    }
  }
});