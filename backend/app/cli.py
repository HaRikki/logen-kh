"""python -m backend.app.cli make-admin you@example.com"""
import sys
from sqlalchemy import select
from .db import SessionLocal
from .models import User, Admin

def main():
    if len(sys.argv) != 3 or sys.argv[1] != "make-admin":
        sys.exit("usage: python -m backend.app.cli make-admin EMAIL")
    with SessionLocal() as s:
        u = s.scalar(select(User).where(User.email == sys.argv[2].lower()))
        if not u:
            sys.exit("No such user. Register first.")
        if not s.scalar(select(Admin.id).where(Admin.user_id == u.id)):
            s.add(Admin(user_id=u.id, role="owner")); s.commit()
        print("OK:", u.email, "is admin")

main()
