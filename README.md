# CrossDrop 🚀

<div align="center">

![CrossDrop Logo](frontend/public/crossdrop_logo.png)

**Share files instantly with anyone, anywhere**

[![Open Source](https://img.shields.io/badge/Open%20Source-Free%20Forever-brightgreen)](https://github.com/Champion1102/Crossdrop)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

## 📖 Overview

CrossDrop is a modern, peer-to-peer file sharing application that enables fast and secure file transfers between devices. Whether you're on the same WiFi network or across the internet, CrossDrop makes sharing files effortless with no sign-ups, no uploads, and no limits.

### ✨ Key Features

- 🌐 **LAN Transfer** - Lightning-fast transfers on your local network with auto device discovery
- 🌍 **Browser Transfer** - WebRTC-powered transfers across any network using room codes
- 🔒 **End-to-End Encrypted** - Your files are encrypted during transfer
- ⚡ **Lightning Fast** - Direct peer-to-peer connections for maximum speed
- 📦 **Any File Type** - Transfer documents, photos, videos, or any file type
- 🚫 **No Installation** - Works right in your browser
- 💯 **100% Private** - No data is stored on any server
- 🔓 **Open Source** - Free forever

## 🛠️ Tech Stack

### Frontend
- React 19
- Vite
- React Router
- Tailwind CSS 4
- Framer Motion
- Axios

### Backend
- FastAPI (Python)
- Uvicorn
- WebSockets
- Python 3.8+

### Signaling Server (WebRTC)
- Node.js
- Express
- Socket.io

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Python 3.8 or higher** - [Download Python](https://www.python.org/downloads/)
- **Node.js 14 or higher** - [Download Node.js](https://nodejs.org/)
- **npm** or **yarn** - Comes with Node.js
- **pip** - Python package installer (comes with Python)

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/Champion1102/Crossdrop.git
cd Crossdrop
```

### 2. Set Up the Backend (FastAPI)

```bash
# Navigate to the backend directory
cd backend/fastapi_app

# Install Python dependencies
pip install -r requirements.txt

# Optional: Use a virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Set Up the Frontend

```bash
# Navigate to the frontend directory
cd frontend

# Install dependencies
npm install
# or
yarn install
```

### 4. Set Up the Node Signaling Server (Optional - for WebRTC)

```bash
# Navigate to the signaling server directory
cd node_signaling_server

# Install dependencies
npm install
# or
yarn install
```

## ▶️ Running the Application

### Option 1: Run All Services Manually

#### Terminal 1 - Start the Backend Server

```bash
cd backend/fastapi_app

# Using the provided script (recommended)
./start_server.sh

# OR manually
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The backend will be available at: `http://localhost:8000`

#### Terminal 2 - Start the Frontend

```bash
cd frontend

npm run dev
# or
yarn dev
```

The frontend will be available at: `http://localhost:5173`

#### Terminal 3 - Start the Signaling Server (Optional - for WebRTC)

```bash
cd node_signaling_server

npm start
# or
yarn start
```

The signaling server will be available at: `http://localhost:3000`

### Option 2: Using Shell Scripts

The backend includes a convenient script for starting:

```bash
cd backend/fastapi_app
chmod +x start_server.sh  # Make script executable (first time only)
./start_server.sh
```

## 🌐 Accessing the Application

1. **Local Access**: Open your browser and go to `http://localhost:5173`
2. **Network Access**: Other devices on your network can access via `http://[YOUR_IP]:5173`
   - Find your IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)

## 📁 Project Structure

```
Crossdrop/
├── backend/
│   └── fastapi_app/
│       ├── main.py                 # FastAPI application entry point
│       ├── requirements.txt        # Python dependencies
│       ├── start_server.sh        # Backend startup script
│       ├── routes/                # API route handlers
│       │   ├── connections.py
│       │   ├── discover.py
│       │   ├── transfer.py
│       │   └── debug.py
│       └── utils/                 # Utility modules
│           ├── connection_manager.py
│           ├── discovery_service.py
│           ├── encryption.py
│           ├── file_handler.py
│           ├── logger.py
│           ├── network_utils.py
│           └── transfer_service.py
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Main application component
│   │   ├── main.jsx             # Application entry point
│   │   ├── pages/               # Page components
│   │   │   ├── Home.jsx
│   │   │   ├── FileTransfer.jsx
│   │   │   ├── BrowserTransfer.jsx
│   │   │   └── DeviceList.jsx
│   │   ├── components/          # Reusable components
│   │   │   ├── Navbar.jsx
│   │   │   └── ConnectionRequestModal.jsx
│   │   ├── api/                # API client modules
│   │   │   ├── backend.js
│   │   │   └── signaling.js
│   │   └── services/           # Business logic
│   │       └── webrtc.js
│   ├── package.json
│   └── vite.config.js
├── node_signaling_server/
│   ├── server.js               # WebRTC signaling server
│   └── package.json
└── README.md
```

## 🔧 Configuration

### Frontend Environment Variables

Create a `.env` file in the `frontend` directory (use `.env.example` as a template):

```bash
# Backend API URL
VITE_API_URL=http://localhost:8000

# Signaling Server URL (for WebRTC)
VITE_SIGNALING_URL=http://localhost:3000
```

### Backend Configuration

The backend server runs on `0.0.0.0:8000` by default, making it accessible from other devices on your network.

## 🧪 Testing

### Backend Tests

```bash
cd backend/fastapi_app

# Run specific test files
python test_discovery.py
python test_connection.py
python test_transfer.py
python test_broadcast.py
```

### Check Backend Health

```bash
cd backend/fastapi_app
./check_backend.sh
```

## 📝 Development Scripts

### Frontend

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

### Backend

```bash
uvicorn main:app --reload              # Development mode with hot reload
uvicorn main:app --host 0.0.0.0       # Production mode
```

## 🐛 Troubleshooting

### Backend not accessible from other devices

- Ensure the backend is running with `--host 0.0.0.0`
- Check your firewall settings
- Verify devices are on the same network

### Frontend can't connect to backend

- Check that the backend is running
- Verify the `VITE_API_URL` in `.env` matches your backend URL
- Look for CORS issues in the browser console

### WebRTC connection fails

- Ensure the signaling server is running
- Check `VITE_SIGNALING_URL` in frontend `.env`
- Verify both peers are connected to the signaling server

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🔗 Links

- **GitHub**: [https://github.com/Champion1102/Crossdrop](https://github.com/Champion1102/Crossdrop)
- **Issues**: [Report a bug](https://github.com/Champion1102/Crossdrop/issues)

## 🙏 Acknowledgments

Built with ❤️ for the open source community.

---

<div align="center">

**[⭐ Star this repo](https://github.com/Champion1102/Crossdrop)** if you find it useful!

</div>
