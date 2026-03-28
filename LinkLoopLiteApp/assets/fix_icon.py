from PIL import Image
import numpy as np

NAVY = (15, 31, 64)  # #0F1F40
THRESH = 210  # anything above this in ALL channels → replace with navy

img = Image.open('ribbonicon.png').convert('RGB')
data = np.array(img)

# Replace all near-white pixels with navy
white_mask = (data[:,:,0] > THRESH) & (data[:,:,1] > THRESH) & (data[:,:,2] > THRESH)
data[white_mask] = NAVY

before_white = int(np.sum(white_mask))
print(f'Replaced {before_white} white/near-white pixels with navy')

# Also handle anti-aliased fringe: pixels that are lighter than (180,180,180)
# but only if they border navy or white-replaced pixels — use a gentler approach
# Check if there are stray light pixels near the edges
result = Image.fromarray(data)

# Verify: check corners and edges of the result
result_data = np.array(result)
for name, r, c in [('TL', slice(0,50), slice(0,50)), ('TR', slice(0,50), slice(-50,None)),
                     ('BL', slice(-50,None), slice(0,50)), ('BR', slice(-50,None), slice(-50,None))]:
    corner = result_data[r, c]
    avg = corner.mean(axis=(0,1))
    bright = (corner[:,:,0] > 200) & (corner[:,:,1] > 200) & (corner[:,:,2] > 200)
    print(f'  Corner {name}: avg=({avg[0]:.0f},{avg[1]:.0f},{avg[2]:.0f}), bright={int(np.sum(bright))}')

# Check edges
border = 20
edge_mask = np.zeros((result_data.shape[0], result_data.shape[1]), dtype=bool)
edge_mask[:border, :] = True
edge_mask[-border:, :] = True
edge_mask[:, :border] = True
edge_mask[:, -border:] = True
edge_bright = (result_data[:,:,0] > 200) & (result_data[:,:,1] > 200) & (result_data[:,:,2] > 200)
edge_white = int(np.sum(edge_bright & edge_mask))
print(f'  Edge bright pixels (outer {border}px): {edge_white}')

# Total remaining bright
total_bright = int(np.sum(edge_bright))
total_px = result_data.shape[0] * result_data.shape[1]
print(f'  Total remaining bright: {total_bright} / {total_px} ({total_bright/total_px*100:.2f}%)')

result.save('ribbonicon_clean.png')
print('\nSaved ribbonicon_clean.png — all white replaced with navy')
