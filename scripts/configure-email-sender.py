#!/usr/bin/env python3
"""Verify SMTP credentials and update sender secrets without displaying the password."""
import argparse
import getpass
import smtplib
import ssl
import subprocess
import sys
from email.utils import formataddr

PROJECT = "uniqenergy-de71c"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True, help="Google Workspace mailbox used to send portal emails")
    parser.add_argument("--dialog", action="store_true", help="Enter the password in a secure macOS dialog")
    args = parser.parse_args()
    address = args.email.strip().lower()
    if address.count("@") != 1 or any(char.isspace() for char in address):
        parser.error("Enter a valid sender email address.")
    if not args.dialog and not sys.stdin.isatty():
        parser.error("Run this command in your terminal so the password can be entered privately.")

    if args.dialog:
        # Capture the hidden answer in memory; never print it or pass it in argv.
        script = '''on run argv
            return text returned of (display dialog ("Enter the Google app password for " & item 1 of argv) with title "UniqEnergy email sender" default answer "" with hidden answer buttons {"Cancel", "Update sender"} default button "Update sender" cancel button "Cancel")
        end run'''
        try:
            result = subprocess.run(
                ["/usr/bin/osascript", "-e", script, address],
                capture_output=True, text=True, check=False,
            )
        except OSError:
            print("Could not open the password dialog. Run without --dialog in your terminal.", file=sys.stderr)
            return 1
        if result.returncode:
            print("Password entry cancelled or unavailable. No secrets were changed.", file=sys.stderr)
            return 1
        password = result.stdout.rstrip("\r\n").replace(" ", "")
    else:
        password = getpass.getpass(f"App password for {address} (hidden): ").replace(" ", "")
    if not password:
        parser.error("An app password is required.")
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context(), timeout=30) as smtp:
            smtp.login(address, password)
    except (smtplib.SMTPException, OSError):
        print("SMTP login failed. Check the mailbox and its app password. No secrets were changed.", file=sys.stderr)
        return 1

    print("SMTP login verified. No email was sent.")
    values = {"SMTP_PASSWORD": password, "SMTP_USER": address, "EMAIL_FROM_ADDRESS": formataddr(("UniqEnergy", address))}
    try:
        for secret, value in values.items():
            subprocess.run(
                ["gcloud", "secrets", "versions", "add", secret, f"--project={PROJECT}", "--data-file=-", "--quiet"],
                input=value.encode(), check=True,
            )
    except (subprocess.CalledProcessError, OSError):
        print("Secret update did not finish. Do not deploy yet; rerun this command to complete all three secrets.", file=sys.stderr)
        return 1
    print(f"Sender secrets updated to UniqEnergy <{address}>. GitHub Actions deployment is still required.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
