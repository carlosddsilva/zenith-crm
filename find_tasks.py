import os

found = False
for root, dirs, files in os.walk('src'):
    for file in files:
        lname = file.lower()
        if 'task' in lname or 'activit' in lname:
            print(os.path.join(root, file))
            found = True

if not found:
    print("No task or activity files found.")
