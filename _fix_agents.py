import os

path = r'D:\TimeBank\AGENTS.md'
with open(path, 'rb') as f:
    data = f.read()

text = data.decode('utf-8')

# 修复 *.ja9a → *.java (文件后缀)
old1 = '*.ja9a'
new1 = '*.java'
count1 = text.count(old1)
text = text.replace(old1, new1)

# 修复 /ja9a/ → /java/ (路径)
old2 = '/ja9a/'
new2 = '/java/'
count2 = text.count(old2)
text = text.replace(old2, new2)

with open(path, 'wb') as f:
    f.write(text.encode('utf-8'))

print(f'fixed {count1} of *.ja9a, {count2} of /ja9a/')