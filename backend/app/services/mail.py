import logging, smtplib
from email.message import EmailMessage
from .. import config
log = logging.getLogger("khpay.mail")

def send(to: str, subject: str, body: str) -> bool:
    c = config.SMTP
    if not (c["host"] and c["sender"]):
        log.warning("SMTP not configured; email to %s NOT sent. Subject: %s\n%s", to, subject, body)
        return False
    m = EmailMessage(); m["From"], m["To"], m["Subject"] = c["sender"], to, subject; m.set_content(body)
    try:
        with smtplib.SMTP(c["host"], c["port"], timeout=15) as s:
            s.starttls()
            if c["user"]:
                s.login(c["user"], c["password"])
            s.send_message(m)
        return True
    except Exception:
        log.exception("smtp send failed"); return False
