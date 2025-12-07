from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from routes import discover, transfer, connections, debug
from utils.discovery_service import DiscoveryService
from utils.transfer_service import TransferService
from utils.connection_manager import ConnectionManager
from utils.logger import get_logger

logger = get_logger("main")

# Global service instances
discovery_service: DiscoveryService = None
connection_manager: ConnectionManager = None
transfer_service: TransferService = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    global discovery_service, connection_manager, transfer_service

    # Startup
    logger.info("🚀 Starting CrossDrop Backend...")

    discovery_service = DiscoveryService()
    discovery_service.start()
    logger.info("  ✓ Discovery service started")

    connection_manager = ConnectionManager()
    logger.info("  ✓ Connection manager initialized")

    transfer_service = TransferService(connection_manager=connection_manager)
    transfer_service.start()
    logger.info("  ✓ Transfer service started")

    # Set services for routes
    discover.set_discovery_service(discovery_service)
    transfer.set_transfer_service(transfer_service)
    transfer.set_connection_manager(connection_manager)
    connections.set_connection_manager(connection_manager)
    connections.set_discovery_service_for_connections(discovery_service)
    debug.set_debug_services(connection_manager, discovery_service)

    logger.info("  ✓ All routers registered")
    logger.info("✅ CrossDrop Backend ready!")

    yield  # App runs here

    # Shutdown
    logger.info("🛑 Shutting down CrossDrop Backend...")
    discovery_service.stop()
    transfer_service.stop()
    logger.info("✅ Shutdown complete")


app = FastAPI(title="CrossDrop Backend", lifespan=lifespan)

# CORS middleware for React frontend
# Allow all origins for LAN access from other devices
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow any origin for LAN access
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(discover.router)
app.include_router(transfer.router)
app.include_router(connections.router)
app.include_router(debug.router)


@app.get("/")
async def root():
    return {"message": "CrossDrop Backend API"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

