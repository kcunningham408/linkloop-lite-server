from PIL import Image
import numpy as np

img = Image.open('ribbonicon.png').convert('RGB')
data = np.array(img)

# Treat anything > 240 in all channels as white/near-white
non_white = ~((data[:,:,0] > 240) & (data[:,:,1] > 240) & (data[:,:,2] > 240))
rows = np.any(non_white, axis=1)
cols = np.any(non_white, axis=0)
rmin, rmax = np.where(rows)[0][[0, -1]]
cmin, cmax = np.where(cols)[0][[0, -1]]
print(f'Tight crop box: ({cmin}, {rmin}, {cmax+1}, {rmax+1})')

cropped = img.crop((cmin, rmin, cmax+1, rmax+1))
w, h = cropped.size
print(f'Cropped size: {w}x{h}')

# Paste onto a solid dark navy background — no white anywhere
NAVY = (15, 31, 64)  # matches #0F1F40
size = max(w, h)
result = Image.new('RGB', (size, size), NAVY)
result.paste(cropped, ((size - w) // 2, (size - h) // 2))

final = result.resize((1024, 1024), Image.LANCZOS)
final.save('ribbonicon_clean.png')
print('Saved ribbonicon_clean.png — solid navy bg, zero white, 1024x1024')
