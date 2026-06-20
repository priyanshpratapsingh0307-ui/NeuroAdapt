import codecs

with codecs.open('Requirements.txt', 'r', encoding='utf-16') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    line = line.strip()
    if not line:
        continue
    if '@ file://' in line or '@ file:' in line:
        pkg = line.split('@')[0].strip()
        new_lines.append(pkg)
    else:
        new_lines.append(line)

with codecs.open('Requirements.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(new_lines) + '\n')
