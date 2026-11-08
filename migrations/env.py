from logging.config import fileConfig
from alembic import context
from sqlalchemy import engine_from_config, pool
from backend.app import config as app_config
from backend.app.db import Base
from backend.app import models  # noqa: F401  (register tables)

cfg = context.config
if cfg.config_file_name:
    fileConfig(cfg.config_file_name)
cfg.set_main_option("sqlalchemy.url", app_config.DATABASE_URL.replace("%", "%%"))
target_metadata = Base.metadata

def run_offline():
    context.configure(url=cfg.get_main_option("sqlalchemy.url"), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()

def run_online():
    engine = engine_from_config(cfg.get_section(cfg.config_ini_section), prefix="sqlalchemy.", poolclass=pool.NullPool)
    with engine.connect() as conn:
        context.configure(connection=conn, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()

run_offline() if context.is_offline_mode() else run_online()
