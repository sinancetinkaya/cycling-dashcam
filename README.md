# [Türkçe](https://github.com/sinancetinkaya/cycling-dashcam/blob/main/README.tur.md)
# Cycling Dashcam PWA

A high-performance, telemetry-overlay cycling dashcam designed for mobile browsers. Record your rides with real-time speed, GPS, grade, heart rate, and power meter data "burnt" directly into the video file.

## 🚀 Public URL
**[https://ais-pre-sudvw57uzwst36kzco752i-116531999529.europe-west1.run.app](https://ais-pre-sudvw57uzwst36kzco752i-116531999529.europe-west1.run.app)**

---

## ✨ Features

### Main Screen Interface

#### Top Controls
- **🔲 Fullscreen**: Toggles the app to full-screen mode for an immersive dashcam view.
- **❤️ Heart Rate**: Connects or disconnects your Bluetooth Heart Rate monitor.
- **⚡ Power Meter**: Connects or disconnects your Bluetooth Power Meter.
- **⚙️ Settings**: Opens the configuration panel for video quality, telemetry toggles, and recording modes.

#### Bottom Controls
- **📸 Snapshot**: Captures a high-quality JPEG image of the current view, including all active telemetry overlays.
- **🔄 Switch Camera**: Toggles between the front and rear-facing cameras of your device.

#### 🎥 Recording & Loop Mode
The central button changes behavior based on your **Loop Mode** setting:

**Standard Mode (Loop Mode Off):**
- **🔴 Start Recording**: Begins a continuous recording saved directly to your device.
- **⏹️ Stop Recording**: Finalizes the video file and adds it to your gallery.

**Loop Mode (Loop Mode On):**
- **🟠 Start Loop**: Activates the 60-second background RAM buffer. The button turns amber.
- **⚠️ INCIDENT**: Appears only when Loop Mode is active. Tap this to "burn" the last 60 seconds of buffered video into a permanent file.
- **⏹️ Stop Loop**: Deactivates the buffer and clears the temporary RAM storage.

---

### App Settings Reference

#### 📹 Video & Audio Configuration
| Setting | Values | Description |
| :--- | :--- | :--- |
| **Video Orientation** | `Auto`, `Landscape`, `Portrait` | Locks the recording aspect ratio. `Auto` follows your device's physical rotation. |
| **Video Quality** | `4K`, `1080p`, `720p` | Sets the resolution. Note: 4K requires a high-end device and compatible camera sensor. |
| **Video Framerate** | `Auto`, `60`, `30`, `24` | Sets the target FPS. Higher values result in smoother motion but larger files. |
| **Video Codec** | `H.264`, `H.265`, `AV1`, `VP9` | Choose the compression algorithm. `H.264` is most compatible; `H.265` offers better quality at lower bitrates. |
| **Video Bitrate** | `1 Mbps` to `50 Mbps` | Controls the data rate. `Auto` picks a sensible default. `50 Mbps` is "Insane" quality for professional editing. |
| **Audio Quality** | `Raw`, `Processed`, `Muted` | `Raw` disables noise cancellation (better for capturing ambient environment); `Processed` focuses on voice. |
| **Audio Bitrate** | `64 kbps` to `320 kbps` | Higher values preserve more audio detail. `Auto` defaults to 192 kbps. |

#### 🔄 Recording Modes
| Setting | Values | Description |
| :--- | :--- | :--- |
| **Loop Mode (60s)** | `On / Off` | When active, the app keeps a rolling 60-second buffer in RAM. Pressing "Record" saves this buffer to disk. |
| **G-Sensor Detection** | `On / Off` | Requires Loop Mode. Automatically triggers a "Save" if a sudden impact is detected. |
| **G-Threshold** | `1.5G` to `10.0G` | Sensitivity for impact detection. `1.5G` is sensitive (potholes); `10.0G` is for heavy crashes. |

#### 📊 Telemetry & HUD
| Setting | Values | Description |
| :--- | :--- | :--- |
| **Units (MPH)** | `On / Off` | Toggle between Imperial (MPH) and Metric (KM/H). |
| **Speed** | `On / Off` | Show current speed on the overlay. |
| **Grade** | `On / Off` | Show current incline/decline percentage (smoothed 3-value average). |
| **GPS** | `On / Off` | Show Latitude/Longitude coordinates. |
| **Heart Rate** | `On / Off` | Show BPM and % of Max HR (requires Bluetooth sensor). |
| **Power Meter** | `On / Off` | Show Watts and % of FTP (requires Bluetooth sensor). |
| **Timestamp** | `On / Off` | Show real-time clock and date. |
| **Max Heart Rate** | `Number` | Used to calculate the HR percentage on the overlay. |
| **FTP** | `Number` | Functional Threshold Power. Used to calculate the Power percentage. |

---

## 🛠 Why a PWA?

**Progressive Web App (PWA)** is chosen over a native Android/iOS app for several key reasons:

1. **Zero Friction**: No App Store or Play Store downloads required. Instant updates.
2. **The "Overlay" Challenge**: In native Android development, burning real-time telemetry (like GPS and Bluetooth data) into a video file is notoriously difficult. It requires complex MediaCodec configurations or OpenGL ES layers that often behave differently across various phone manufacturers.
3. **Canvas Recording**: By using the Web's **Canvas API** and **MediaRecorder**, we can composite high-quality graphics and video frames with pixel-perfect precision. This ensures that what you see on the screen is exactly what gets saved to the video file, regardless of your device hardware.

---

## 📲 Installation (Chrome Mobile)

To get the best experience (full-screen, no address bar, offline support), install the app as a PWA:

1. Open **Chrome** on your Android device.
2. Navigate to the [Public URL](https://ais-pre-sudvw57uzwst36kzco752i-116531999529.europe-west1.run.app).
3. Tap the **three dots (⋮)** in the top right corner.
4. Select **"Add to Home screen"**.
5. Launch the app from your home screen icon.

---

## 🔗 Auto-Reconnect (Bluetooth)

Chrome's default security model requires a manual device picker for every Bluetooth connection. To enable **Auto-Reconnect** for your HR and Power sensors:

1. Open a new tab in Chrome and go to: `chrome://flags`
2. Search for **"Web Bluetooth"**.
3. Enable **"Web Bluetooth"** and **"Experimental Web Platform features"**.
4. (Optional) Enable **"Use the new permissions backend for Web Bluetooth"** if available.
5. Restart Chrome.

*Note: You still need to pair the device once via the Bluetooth icon in the app. After that, the app will attempt to silently reconnect to known sensors on startup.*

---

**Safe riding!** 🚴‍♂️💨
