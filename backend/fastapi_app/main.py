from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from routes import discover, transfer, connections, debug
from utils.discovery_service import DiscoveryService
from utils.transfer_service import TransferService
from utils.connection_manager import ConnectionManager
from utils.logger import get_logger

logger = get_logger("main")

app = FastAPI(title="CrossDrop Backend")

# CORS middleware for React frontend
# Allow common Vite dev server ports and localhost variants
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize and start discovery service
logger.info("🚀 Starting CrossDrop Backend...")
discovery_service = DiscoveryService()
discovery_service.start()
logger.info("  ✓ Discovery service started")

# Initialize connection manager
connection_manager = ConnectionManager()
logger.info("  ✓ Connection manager initialized")

# Initialize and start transfer service (TCP receiver)
# Pass connection_manager for security validation
transfer_service = TransferService(connection_manager=connection_manager)
transfer_service.start()
logger.info("  ✓ Transfer service started")

# Set services for routes
discover.set_discovery_service(discovery_service)
transfer.set_transfer_service(transfer_service)
transfer.set_connection_manager(connection_manager)  # For security validation
connections.set_connection_manager(connection_manager)
connections.set_discovery_service_for_connections(discovery_service)

# Set debug services
debug.set_debug_services(connection_manager, discovery_service)

# Include routers
app.include_router(discover.router)
app.include_router(transfer.router)
app.include_router(connections.router)
app.include_router(debug.router)
logger.info("  ✓ All routers registered")
logger.info("✅ CrossDrop Backend ready!")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    discovery_service.stop()
    transfer_service.stop()


@app.get("/")
async def root():
    return {"message": "CrossDrop Backend API"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

