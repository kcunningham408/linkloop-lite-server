from PIL import Image
import numpy as np

img = Image.open('ribbonicon.png').convert('RGB')
data = np.array(img)

# Check pixel distribution at various brightness thresholds
for thresh in [250, 240, 230, 220, 210, 200, 190]:
    mask = (data[:,:,0] > thresh) & (data[:,:,1] > thresh) & (data[:,:,2] > thresh)
    count = int(np.sum(mask))
    pct = count / (data.shape[0]*data.shape[1]) * 100
    print(f'  Thresh {thresh}: {count:>7} pixels ({pct:.1f}%)')

# Show unique colors in corners (50x50)
corners = {
    'TL': data[:50,:50],
    'TR': data[:50,-50:],
    'BL': data[-50:,:50],
    'BR': data[-50:,-50:],
}
for name, c in corners.items():
    unique = np.unique(c.reshape(-1,3), axis=0)
    print(f'  {name}: {len(unique)} unique colors, avg=({c[:,:,0].mean():.0f},{c[:,:,1].mean():.0f},{c[:,:,2].mean():.0f})')

# Check the center 200x200 to understand the actual icon content
center = data[412:612, 412:612]
center_bright = (center[:,:,0] > 210) & (center[:,:,1] > 210) & (center[:,:,2] > 210)
print(f'\n  Center 200x200 bright pixels: {int(np.sum(center_bright))} / {200*200}')
print(f'  Center avg RGB: ({center[:,:,0].mean():.0f},{center[:,:,1].mean():.0f},{center[:,:,2].mean():.0f})')
