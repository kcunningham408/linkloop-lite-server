from PIL import Image
import numpy as np

# === ICON AUDIT ===
img = Image.open('assets/ribbonicon_clean.png').convert('RGB')
data = np.array(img)

white_mask = (data[:,:,0] > 240) & (data[:,:,1] > 240) & (data[:,:,2] > 240)
total = data.shape[0] * data.shape[1]
white_count = int(np.sum(white_mask))
print(f'Icon: {img.size}')
print(f'White pixels: {white_count} / {total} ({white_count/total*100:.2f}%)')

border = 20
edge_mask = np.zeros_like(white_mask)
edge_mask[:border, :] = True
edge_mask[-border:, :] = True
edge_mask[:, :border] = True
edge_mask[:, -border:] = True
edge_white = int(np.sum(white_mask & edge_mask))
edge_total = int(np.sum(edge_mask))
print(f'Edge white (outer {border}px): {edge_white} / {edge_total} ({edge_white/edge_total*100:.2f}%)')

for name, r, c in [('TL', slice(0,50), slice(0,50)), ('TR', slice(0,50), slice(-50,None)),
                     ('BL', slice(-50,None), slice(0,50)), ('BR', slice(-50,None), slice(-50,None))]:
    corner = data[r, c]
    avg = corner.mean(axis=(0,1))
    print(f'  Corner {name} avg RGB: ({avg[0]:.0f}, {avg[1]:.0f}, {avg[2]:.0f})')

# === BACKGROUND AUDIT ===
print()
bg = Image.open('assets/ribbonback.png')
print(f'Background: {bg.size}')
bg_aspect = bg.size[1] / bg.size[0]
print(f'BG aspect ratio: 1:{bg_aspect:.2f}')
print(f'iPhone aspect: ~1:2.16 (375x812pt)')
print(f'Gap: image needs to be taller or resizeMode="cover" to fill screen')
