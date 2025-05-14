document.addEventListener('DOMContentLoaded', async () => {
    const navbar = document.getElementById('navbar');
    const noteSection = document.querySelector('.note');
    const buySubscriptionButton = document.getElementById('buySubscription');
    const dashboard = document.getElementById('dashboard');

    if (buySubscriptionButton) {
        buySubscriptionButton.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'openSubsPage' }, (response) => { });
        });
    }

    const attachNavbarEventListeners = () => {
        const signin = document.getElementById('signin');
        const logout = document.getElementById('logout');
        const manageprofile = document.getElementById('manage');

        if (signin) {
            signin.addEventListener('click', () => {
                chrome.runtime.sendMessage({ action: 'opensigninPage' }, (response) => { });
            });
        }
        if (dashboard) {
            dashboard.addEventListener('click', () => {
                chrome.runtime.sendMessage({ action: 'openDashboard' }, (response) => { });
            });
        }
        if (logout) {
            logout.addEventListener('click', function () {
                chrome.runtime.sendMessage({ action: 'logout' }, (response) => { });

            });
        }
        if (manageprofile) {
            manageprofile.addEventListener('click', function () {
                chrome.runtime.sendMessage({ action: 'manage' }, (response) => { });
            });
        }
    };

    try {
        // Fetch data from the server endpoint
        const response = await fetch('http://localhost:3000/popup', {
            credentials: 'include', // Include cookies for authentication
        });

        if (!response.ok) {
            throw new Error('Failed to fetch popup content.');
        }

        const data = await response.json(); // Expect JSON data from the endpoint
        const { isLoggedIn, isSubscribed, username } = data;
        // Update the navbar
        if (navbar) {
            let navbarHTML = `
                <span class="logo d-flex align-items-center">
                    <img src="./safescroll.png" alt="logo" class="logo-img">
                    <span class="brand-name">SafeScroll</span>
                </span>
                <div>
            `;

            if (!isLoggedIn) {
                navbarHTML += ` <button class="btn btn-outline-primary me-2" id="signin">Sign In</button>`;
            } else {
                navbarHTML += `
                    <div class="dropdown">
                        <span class="" id="dropdownMenuButton1" data-bs-toggle="dropdown"
                            aria-expanded="false" style="cursor: pointer;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" fill="currentColor"
                                class="bi bi-person-circle" viewBox="0 0 16 16">
                                <path d="M11 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0" />
                                <path fill-rule="evenodd"
                                    d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m8-7a7 7 0 0 0-5.468 11.37C3.242 11.226 4.805 10 8 10s4.757 1.225 5.468 2.37A7 7 0 0 0 8 1" />
                            </svg>
                        </span>
                        <ul class="dropdown-menu" aria-labelledby="dropdownMenuButton1">
                            <li><a class="dropdown-item" id="manage">Manage Profile</a></li>
                            <li><a class="dropdown-item" id="logout">Logout</a></li>
                        </ul>
                    </div>
                `;
            }

            navbarHTML += `</div>`;
            navbar.innerHTML = navbarHTML;

            // Reattach event listeners to the newly created elements
            attachNavbarEventListeners();
        }

        if (noteSection) {
            noteSection.innerHTML = isSubscribed
                ? `<p class="mb-0"><b>Note:</b> You are subscribed for one month. Enjoy full access to the dashboard and view all filtered memes.</p>`
                : `<p class="mb-0"><b>Note:</b> Subscribe to unlock full access to the dashboard and view exclusive content, including memes filtered by the model.</p>`;
        }

        if (dashboard) {
            dashboard.style.display = isSubscribed ? 'block' : 'none';
            dashboard.style.marginLeft = '50px';
        }
        if (buySubscriptionButton) {
            buySubscriptionButton.style.display = isSubscribed ? 'none' : 'block';
            buySubscriptionButton.style.marginLeft = '50px';
        }
    } catch (err) {
        console.error('Error:', err);

        // Display fallback content on error
        if (navbar) {
            navbar.innerHTML = `<p>Error loading content.</p>`;
        }
        if (noteSection) {
            noteSection.style.display = 'none';
        }
    }
    document.getElementById('dashboard').addEventListener('click', async () => {
        // Retrieve stored images from chrome.storage.local
        const result = await chrome.storage.local.get('storedImages');
        const images = result.storedImages || [];

        // Send the images to your backend
        fetch('http://localhost:3000/dashboard', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ images })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    console.log("Images posted successfully");
                } else {
                    console.error('Error posting images:', data.message);
                }
            })
            .catch(err => console.error('Error posting images:', err));
    });

});
document.addEventListener("DOMContentLoaded", () => {
    const checkbox = document.getElementById("enableExtensionSwitch");

    // Restore the saved checkbox state when the popup loads
    chrome.storage.local.get("checkboxState", (result) => {
        checkbox.checked = result.checkboxState || false;
    });

    checkbox.addEventListener("change", async () => {
        // Save the new checkbox state
        chrome.storage.local.set({ checkboxState: checkbox.checked }, () => {
            console.log("Checkbox state saved:", checkbox.checked);
        });

        if (checkbox.checked) {
            try {
                // Get the current subscription and username state
                const response = await fetch('http://localhost:3000/popup');
                if (!response.ok) {
                    throw new Error('Failed to fetch popup content.');
                }
                const data = await response.json();
                const { isSubscribed, username } = data;

                // Send startImageCollection message with subscription status
                chrome.runtime.sendMessage({
                    action: "startImageCollection",
                    isSubscribed,
                    username
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('Error starting collection:', chrome.runtime.lastError);
                        // Revert checkbox state if there's an error
                        checkbox.checked = false;
                        chrome.storage.local.set({ checkboxState: false });
                    }
                });
            } catch (error) {
                console.error('Error fetching subscription status:', error);
            }
        } else {
            // Stop image collection when unchecked
            console.log("Stopping image collection");
            chrome.runtime.sendMessage({
                action: "stopImageCollection"
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Error stopping collection:', chrome.runtime.lastError);
                } else if (response.status === 'error') {
                    console.error('Failed to stop collection:', response.message);
                } else {
                    console.log("Image collection stopped successfully");
                }
            });
        }
    });
    
});








