// public/js/script.js
const uploadForm = document.getElementById('upload-form');
const fileInput = document.getElementById('file-input');
const fileNameDisplay = document.getElementById('file-name-display');
const timerSelect = document.getElementById('timer-select');
const uploadButton = document.getElementById('upload-button');
const progressBar = document.getElementById('upload-progress');
const progressBarFill = progressBar.querySelector('.progress-bar-fill');
const progressBarText = progressBar.querySelector('.progress-bar-text');
const resultArea = document.getElementById('result-area');
const shareLinkInput = document.getElementById('share-link');
const copyButton = document.getElementById('copy-button');
const errorMessage = document.getElementById('error-message');
const fileDropArea = document.querySelector('.file-drop-area');

// --- Drag and Drop ---
fileDropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileDropArea.classList.add('dragover');
});

fileDropArea.addEventListener('dragleave', () => {
    fileDropArea.classList.remove('dragover');
});

fileDropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    fileDropArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        fileInput.files = files; // Assign dropped file(s) to the input
        displayFileName(files[0]); // Display the name of the first file
    }
});

// --- File Input Change ---
fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        displayFileName(fileInput.files[0]);
    } else {
        fileNameDisplay.textContent = '';
    }
});

function displayFileName(file) {
    fileNameDisplay.textContent = `Selected: ${file.name}`;
}

// --- Form Submission ---
uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Prevent default form submission

    const file = fileInput.files[0];
    const timer = timerSelect.value;

    if (!file) {
        showError('Please select a file to upload.');
        return;
    }

    // Disable button, reset UI
    uploadButton.disabled = true;
    uploadButton.textContent = 'Uploading...';
    progressBar.style.display = 'block';
    progressBarFill.style.width = '0%';
    progressBarText.textContent = '0%';
    resultArea.style.display = 'none';
    errorMessage.style.display = 'none';

    const formData = new FormData();
    formData.append('file', file);
    formData.append('destroyTimer', timer);

    try {
        // Use XMLHttpRequest for progress tracking
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const percentComplete = Math.round((event.loaded / event.total) * 100);
                progressBarFill.style.width = `${percentComplete}%`;
                progressBarText.textContent = `${percentComplete}%`;
            }
        });

        xhr.open('POST', '/upload', true); // Asynchronous request

        xhr.onload = function () {
            // Reset button state regardless of outcome
             uploadButton.disabled = false;
             uploadButton.textContent = 'Upload & Encrypt';
             progressBar.style.display = 'none'; // Hide progress bar on completion/error

            if (xhr.status >= 200 && xhr.status < 300) {
                // Success
                const response = JSON.parse(xhr.responseText);
                shareLinkInput.value = response.shareLink;
                resultArea.style.display = 'block';
                // Reset file input and display
                fileInput.value = '';
                fileNameDisplay.textContent = '';
            } else {
                // Error
                let errorMsg = 'Upload failed. Please try again.';
                try {
                    const errorResponse = JSON.parse(xhr.responseText);
                    if (errorResponse.message) {
                        errorMsg = errorResponse.message;
                    }
                } catch (parseError) {
                    // Ignore if response is not JSON
                }
                 console.error('Upload Error:', xhr.status, xhr.statusText, xhr.responseText);
                showError(errorMsg);
            }
        };

        xhr.onerror = function () {
            // Network error or similar
             uploadButton.disabled = false;
             uploadButton.textContent = 'Upload & Encrypt';
             progressBar.style.display = 'none';
             console.error('Network Error during upload:', xhr.statusText);
            showError('Upload failed due to a network error.');
        };

        xhr.send(formData);

    } catch (error) {
        // Catch unexpected errors (less likely with XHR compared to fetch)
        console.error('Unexpected Error during upload setup:', error);
        showError('An unexpected error occurred.');
        uploadButton.disabled = false;
        uploadButton.textContent = 'Upload & Encrypt';
        progressBar.style.display = 'none';
    }
});

// --- Copy Link ---
copyButton.addEventListener('click', () => {
    shareLinkInput.select(); // Select the text
    try {
        document.execCommand('copy'); // Attempt to copy
        copyButton.textContent = 'Copied!';
        setTimeout(() => { copyButton.textContent = 'Copy'; }, 2000); // Reset button text
    } catch (err) {
        console.warn('Copy failed, user might need to copy manually.', err);
        // Optionally show a message indicating manual copy needed
    }
     window.getSelection().removeAllRanges(); // Deselect
});

// --- Utility Functions ---
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}