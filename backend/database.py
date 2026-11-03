import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

# Supabase connection string, converted to use the async driver
DATABASE_URL = os.getenv("DATABASE_URL").replace(
    "postgresql://", "postgresql+asyncpg://"
)

# Supabase's session pooler currently allows 15 clients for this database user.
# SQLAlchemy's defaults can also reach 15 connections *per app instance*, which
# leaves no room for a rolling deployment or another service and causes requests
# to fail before FastAPI can return a response. Keep this service deliberately
# below that ceiling; excess requests wait briefly for a pooled connection.
DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "3"))
DB_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "2"))

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    # "ssl": "require" pins the connection to always be encrypted. Without this,
    # asyncpg's default ("prefer") tries TLS first but silently falls back to a
    # plaintext connection if that negotiation ever fails — this closes that gap.
    connect_args={"statement_cache_size": 0, "ssl": "require"},
    pool_size=DB_POOL_SIZE,
    max_overflow=DB_MAX_OVERFLOW,
    pool_timeout=15,
    pool_recycle=300,
    pool_pre_ping=True,
    pool_use_lifo=True,
)

AsyncSessionLocal = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
