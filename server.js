// server.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto'); // For generating IDs
const schedule = require('node-schedule');
const fs = require('fs'); // File System module
const bcrypt = require('bcrypt'); // Added

const app = express();
const port = process.env.PORT || 3000; // Use environment variable or default

// In-memory storage for file metadata (replace with DB for persistence)
// Structure: { fileId: { filePath: 'path/to/encrypted/file', originalName: '...', job: scheduleJobObject, key: '...' } }
const fileStore = {};

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Multer setup for temporary storage before encryption
const tempUpload = multer({ dest: path.join(__dirname, 'temp_uploads') });

// Ensure temp uploads directory exists
const tempUploadDir = path.join(__dirname, 'temp_uploads');
if (!fs.existsSync(tempUploadDir)) {
    fs.mkdirSync(tempUploadDir);
}

// Middleware to serve static files (HTML, CSS, JS) from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Middleware for parsing JSON bodies (if you need API endpoints)
app.use(express.json());
// Middleware for parsing URL-encoded bodies (needed for form data if not using JS FormData)
app.use(express.urlencoded({ extended: true }));

// --- Routes will go here ---

// Route for the home page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});



// --- File Encryption Helper ---
function encryptFile(filePath, key, iv) {
    return new Promise((resolve, reject) => {
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const input = fs.createReadStream(filePath);
        const encryptedFilePath = path.join(uploadDir, path.basename(filePath) + '.enc');
        const output = fs.createWriteStream(encryptedFilePath);

        input.pipe(cipher).pipe(output)
            .on('finish', () => resolve({
                filePath: encryptedFilePath,
                authTag: cipher.getAuthTag() // Needed for GCM decryption
             }))
            .on('error', (err) => reject(err));
    });
}

// server.js (replace placeholder upload route)
// --- Upload Route ---
// --- Placeholder for Upload Route ---
// app.post('/upload', ..., (req, res) => { ... });
app.post('/upload', tempUpload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
    }

    const tempPath = req.file.path;
    const originalName = req.file.originalname;
    const timerSeconds = parseInt(req.body.destroyTimer, 10) || 86400; // Default 24 hours
    const password = req.body.password; // Added: Get password from form data
    let fileId = null; // Define fileId earlier for potential error cleanup
    let passwordHash = null; // Added: Initialize passwordHash

    try {
        // Generate secure random key and IV (Initialization Vector)
        const key = crypto.randomBytes(32); // 256 bits for AES-256
        const iv = crypto.randomBytes(16); // 128 bits for GCM

        // Generate a unique file ID
        fileId = crypto.randomBytes(16).toString('hex'); // Assign here
        const encryptedFilename = `${fileId}.enc`;
        const encryptedFilePath = path.join(uploadDir, encryptedFilename);

        // Rename temp file before encryption (optional, helps structure)
        const renamedTempPath = path.join(tempUploadDir, fileId); // Use fileId as temp name
        fs.renameSync(tempPath, renamedTempPath);

        // Encrypt the file
        console.log(`Encrypting ${originalName} to ${encryptedFilePath}`);
        const encryptionResult = await encryptFile(renamedTempPath, key, iv);
        console.log(`Encryption complete for ${fileId}`);

        // Hash password if provided
        if (password) { // Added check
            const saltRounds = 10; // Standard practice for bcrypt
            passwordHash = await bcrypt.hash(password, saltRounds); // Hash the password
            console.log(`Password hash generated for ${fileId}`);
        } // End added check

        // Clean up the unencrypted temporary file
        fs.unlink(renamedTempPath, (err) => {
            if (err) console.error(`Error deleting temp file ${renamedTempPath}:`, err);
        });

        // Calculate expiry time
        const expiryDate = new Date(Date.now() + timerSeconds * 1000);

        // Schedule deletion job
        const job = schedule.scheduleJob(expiryDate, () => {
            console.log(`Deleting expired file: ${encryptedFilePath}`);
            fs.unlink(encryptedFilePath, (err) => {
                if (err) {
                    console.error(`Error deleting file ${encryptedFilePath}:`, err);
                } else {
                    console.log(`File ${encryptedFilePath} deleted successfully.`);
                    delete fileStore[fileId]; // Remove from in-memory store
                }
            });
        });

        // Store file metadata (including password hash)
        fileStore[fileId] = {
            filePath: encryptedFilePath,
            originalName: originalName,
            job: job,
            key: key.toString('hex'), // Store keys as hex strings
            iv: iv.toString('hex'),
            authTag: encryptionResult.authTag.toString('hex'), // Store auth tag as hex
            passwordHash: passwordHash // Added: Store the hash (will be null if no password)
        };

        // Generate the share link (NO KEYS in fragment)
        const shareLink = `${req.protocol}://${req.get('host')}/share/${fileId}`; // Modified: Removed keys from URL fragment

        res.json({ shareLink: shareLink });

    } catch (error) {
        console.error('Upload/Encryption Error:', error);
        // Clean up temp file on error
        // Use fs.rm for more modern cleanup, allowing recursive and force options if needed later
        // Use renamedTempPath for consistency if rename occurred before error
        const pathToDelete = fs.existsSync(path.join(tempUploadDir, fileId || ''))
                             ? path.join(tempUploadDir, fileId)
                             : tempPath; // Use original temp path if rename didn't happen

        fs.unlink(pathToDelete, (err) => {
             if (err && err.code !== 'ENOENT') console.error(`Error deleting temp file ${pathToDelete} after error:`, err);
         });

        res.status(500).json({ message: 'Failed to process file.' });
    }
});


// --- Placeholder for Download Route ---
// app.get('/download/:fileId', (req, res) => { ... });
// --- Route to provide encrypted file for download ---
app.get('/download/:fileId', (req, res) => {
    const fileId = req.params.fileId;
    const fileData = fileStore[fileId];

    if (!fileData) {
        return res.status(404).send('File not found or expired.');
    }

    const filePath = fileData.filePath;

    // Check if file exists on disk before sending
    fs.access(filePath, fs.constants.R_OK, (err) => {
        if (err) {
            console.error(`File not accessible for download: ${filePath}`, err);
            // Attempt to clean up inconsistent state
            delete fileStore[fileId];
            if (fileData.job) {
                fileData.job.cancel(); // Cancel scheduled deletion if job exists
            }
             return res.status(404).send('File not found or expired.');
        }

        // Send the encrypted file
        // Let the client handle decryption and original filename
        res.setHeader('Content-Disposition', `attachment; filename="${fileId}.enc"`); // Suggest a filename
        res.setHeader('Content-Type', 'application/octet-stream'); // Indicate binary data
        res.sendFile(filePath, (err) => {
             if (err) {
                 console.error(`Error sending file ${filePath}:`, err);
                 // Don't send 404 here, as headers might already be sent
                 if (!res.headersSent) {
                    res.status(500).send('Error sending file.');
                 }
             } else {
                console.log(`Sent file ${filePath} for download.`);
             }
        });
    });
});


// --- Placeholder for Share Page Route ---
// app.get('/share/:fileId', (req, res) => { ... });
// --- Route to serve the share page ---
app.get('/share/:fileId', (req, res) => {
    const fileId = req.params.fileId;
    // Check if the file ID is known (even if the file might be gone due to race condition/cleanup)
    // The client-side will handle the "file actually available" check during download attempt
    if (!fileStore[fileId]) {
         // Optionally, you could render a specific "expired/not found" page
         // return res.status(404).sendFile(path.join(__dirname, 'public', 'expired.html'));
        return res.status(404).send('Share link invalid or expired.');
    }
    // Serve the share.html page
    res.sendFile(path.join(__dirname, 'public', 'share.html'));
});

// --- Route to get file metadata (like original name) ---
app.get('/api/fileinfo/:fileId', (req, res) => {
    const fileId = req.params.fileId;
    const fileData = fileStore[fileId];

    if (!fileData) {
        return res.status(404).json({ message: 'File info not found or expired.' });
    }

    // Check if password protected
    if (fileData.passwordHash) {
        // Password protected: only send original name and indicator
        res.json({ originalName: fileData.originalName, requiresPassword: true });
    } else {
        // Not password protected: send name and decryption keys
        res.json({
            originalName: fileData.originalName,
            requiresPassword: false,
            key: fileData.key,
            iv: fileData.iv,
            authTag: fileData.authTag
        });
    }
});

// --- Route to verify password and get keys ---
app.post('/api/verify-password/:fileId', async (req, res) => {
    const fileId = req.params.fileId;
    const { password } = req.body; // Get password from request body
    const fileData = fileStore[fileId];

    if (!fileData) {
        return res.status(404).json({ message: 'File not found or expired.' });
    }

    // Check if file is actually password protected
    if (!fileData.passwordHash) {
        console.warn(`Attempted password verification for non-protected file: ${fileId}`);
        // Should not happen with correct client logic, but handle defensively
        return res.status(400).json({ message: 'File is not password protected.' });
    }

    if (!password) {
        return res.status(400).json({ message: 'Password required.' });
    }

    try {
        // Compare provided password with stored hash
        const match = await bcrypt.compare(password, fileData.passwordHash);

        if (match) {
            // Password correct: return decryption keys
            res.json({
                key: fileData.key,
                iv: fileData.iv,
                authTag: fileData.authTag
            });
        } else {
            // Password incorrect
            console.log(`Incorrect password attempt for file: ${fileId}`);
            // Consider adding rate limiting here in a real application
            res.status(401).json({ message: 'Incorrect password.' });
        }
    } catch (error) {
        console.error(`Error during password verification for ${fileId}:`, error);
        res.status(500).json({ message: 'Error verifying password.' });
    }
});

// --- Cleanup logic (optional but good) ---
function cleanupExpiredFiles() {
    console.log('Running startup cleanup...');
    fs.readdir(uploadDir, (err, files) => {
        if (err) {
            console.error("Error reading uploads directory for cleanup:", err);
            return;
        }
        // Basic check: if file info isn't in memory, assume it's orphaned/expired
        files.forEach(file => {
            const fileId = path.parse(file).name; // Assuming filename is fileId
            if (!fileStore[fileId]) {
                const filePath = path.join(uploadDir, file);
                console.log(`Cleaning up orphaned file: ${filePath}`);
                fs.unlink(filePath, err => {
                    if (err) console.error(`Error deleting orphaned file ${filePath}:`, err);
                });
            }
        });
    });
}

// --- Server Start ---
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
    cleanupExpiredFiles(); // Clean up on start in case of crash
});

// --- Graceful Shutdown (optional but recommended) ---
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    schedule.gracefulShutdown().then(() => {
        console.log('Scheduled jobs stopped.');
        // Add any other cleanup here
        process.exit(0);
    });
});



