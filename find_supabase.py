import os
import re

supabase_files = set()
for root, dirs, files in os.walk('src'):
    for file in files:
        if file.endswith('.test.ts') or file.endswith('.test.tsx') or file.endswith('.bak') or file.endswith('.backup'):
            continue
        if file.endswith('.ts') or file.endswith('.tsx'):
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                if re.search(r'(@supabase/|createClient|supabase)', content, re.IGNORECASE):
                    supabase_files.add(filepath)

for f in sorted(list(supabase_files)):
    print(f)
