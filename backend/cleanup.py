# backend/cleanup.py
#
# DISABLED. This script used to wipe almost every order, merchant, pickup
# slot and menu item in the database down to a single hardcoded store ID.
# It is a leftover dev/testing tool, not part of the live app — nothing in
# main.py imports it, schedules it, or calls it. It has been neutralized so
# that even running it by accident does nothing destructive.
#
# If a one-off cleanup of test data is ever needed again, write a fresh
# script scoped exactly to what you want removed — don't re-enable this one.

def clean_house():
    print("This script has been disabled for safety. It used to delete most of the database. Write a new, narrowly-scoped script instead of re-enabling this one.")

if __name__ == "__main__":
    clean_house()
