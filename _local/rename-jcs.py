import re
import os

# reJCID = re.compile(r"^jcid:.+$", re.MULTILINE)
reLastMessageTime = re.compile(r"^last-message-timestamp:.+$", re.MULTILINE)
reLastMessageLevel = re.compile(r"^last-message-level:.+$", re.MULTILINE)
insertAt = r"(^geolocation:.+$)"
directory = "../_journal-clubs/"


def update_file(path, reset_message_level = True):
    print(f"Updating {path}")
    with open(path, 'r', encoding="utf8") as f:
        d = f.read()
        if not reLastMessageLevel.findall(d):
            d = re.sub(insertAt, r"\1\nlast-message-timestamp: 0", d, flags=re.MULTILINE)
        if not reLastMessageLevel.findall(d):
            d = re.sub(insertAt, r"\1\nlast-message-level: 0", d, flags=re.MULTILINE)
        if reset_message_level:
            d = re.sub(reLastMessageLevel, r"last-message-level: 0", d)
        print(d)
    with open(path, 'w', encoding="utf8") as f:
        f.write(d)


files = os.listdir(directory)
for file in files:
    update_file(os.path.join(directory, file))
